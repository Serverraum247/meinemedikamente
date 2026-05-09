/**
 * ErinnerungsService.ts – Lokale Push-Benachrichtigungen für Medikamenten-Einnahme
 *
 * Funktionen:
 * - Berechtigung anfragen
 * - Wiederkehrende Benachrichtigungen pro Medikament planen
 * - Alle Erinnerungen abbrechen (z.B. beim Deaktivieren)
 * - Auto-Abzug: Bestand automatisch reduzieren wenn Benachrichtigung kommt
 *
 * Nutzt @notifee/react-native für native Notifications.
 */

import notifee, {
  AndroidImportance,
  TriggerType,
  RepeatFrequency,
} from '@notifee/react-native';
import { MedikamentRow } from '../database/Database';
import { logger } from '../utils/Logger';
import {
  getIsoWochentag,
  parseEinnahmeplan,
  type Wochentag,
} from '../utils/Einnahmeplan';

// Eindeutiger Channel für Android
const CHANNEL_ID = 'medikament-erinnerung';
const CHANNEL_NAME = 'Medikamenten-Erinnerung';

/**
 * Notification-Berechtigung anfragen
 */
export async function requestNotificationBerechtigung(): Promise<boolean> {
  const settings = await notifee.requestPermission();
  return settings.authorizationStatus >= 1; // 1 = authorized
}

/**
 * Notification-Channel erstellen (Android)
 */
async function createChannel(): Promise<string> {
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: CHANNEL_NAME,
    importance: AndroidImportance.HIGH,
    description: 'Erinnerungen an die Medikamenteneinnahme',
    sound: 'default',
    vibration: true,
  });
  return CHANNEL_ID;
}

/**
 * Alle geplanten Notifications für ein Medikament abbrechen
 */
export async function cancelErinnerungen(medikamentId: string): Promise<void> {
  // Notifee: Alle Notifications mit dem Tag = medikamentId canceln
  const notifications = await notifee.getTriggerNotifications();
  for (const n of notifications) {
    if (n.notification.id?.startsWith(`med-${medikamentId}`)) {
      await notifee.cancelTriggerNotification(n.notification.id);
    }
  }
}

/**
 * Erinnerungen für ein Medikament planen
 *
 * @param medikament Das Medikament mit Uhrzeiten
 * @param onEinnahme Optionaler Callback für Auto-Abzug (wird im Foreground aufgerufen)
 */
export async function planeErinnerungen(
  medikament: MedikamentRow,
  onEinnahme?: (medikamentId: string) => void
): Promise<void> {
  // Erst alte Erinnerungen canceln
  await cancelErinnerungen(medikament.id);

  if (!medikament.erinnerung_aktiv) return;

  const plan = parseEinnahmeplan(medikament.einnahme_uhrzeiten || '[]');
  if (plan.length === 0) return;

  const channelId = await createChannel();
  const now = new Date();

  for (const slot of plan) {
    const [stunden, minuten] = slot.uhrzeit.split(':').map(Number);
    if (isNaN(stunden) || isNaN(minuten)) continue;

    const wochentage = slot.wochentage && slot.wochentage.length > 0
      ? slot.wochentage
      : null;
    const triggerDates = wochentage
      ? wochentage.map(tag => naechsterTerminFuerWochentag(tag, stunden, minuten, now))
      : [naechsterTaeglicherTermin(stunden, minuten, now)];
    const dosis = slot.dosis !== undefined ? slot.dosis : medikament.einzeldosis;

    for (const triggerDate of triggerDates) {
      const weekdaySuffix = wochentage ? `-${getIsoWochentag(triggerDate)}` : '';
      const notifId = `med-${medikament.id}-${slot.uhrzeit.replace(':', '')}${weekdaySuffix}`;

      await notifee.createTriggerNotification(
        {
          id: notifId,
          title: `💊 ${medikament.name}`,
          body: `Zeit für Ihre Einnahme: ${dosis} ${medikament.einheit}`,
          android: {
            channelId,
            importance: AndroidImportance.HIGH,
            pressAction: {
              id: 'default',
            },
            autoCancel: true,
          },
          data: {
            medikamentId: medikament.id,
            autoAbzug: String(medikament.auto_abzug_aktiv),
            dosis: String(dosis),
          },
        },
        {
          type: TriggerType.TIMESTAMP,
          timestamp: triggerDate.getTime(),
          repeatFrequency: wochentage ? RepeatFrequency.WEEKLY : RepeatFrequency.DAILY,
          alarmManager: {
            allowWhileIdle: true,
          },
        }
      );
    }

    logger.log(
      `[Erinnerung] ${medikament.name} um ${slot.uhrzeit} geplant (${wochentage ? 'woechentlich' : 'taeglich'})`
    );
  }
}

function naechsterTaeglicherTermin(stunden: number, minuten: number, now: Date): Date {
  const triggerDate = new Date(now);
  triggerDate.setHours(stunden, minuten, 0, 0);

  if (triggerDate <= now) {
    triggerDate.setDate(triggerDate.getDate() + 1);
  }

  return triggerDate;
}

function naechsterTerminFuerWochentag(
  wochentag: Wochentag,
  stunden: number,
  minuten: number,
  now: Date
): Date {
  const triggerDate = new Date(now);
  triggerDate.setHours(stunden, minuten, 0, 0);

  const heute = getIsoWochentag(now);
  let tageBisTermin = (wochentag - heute + 7) % 7;
  if (tageBisTermin === 0 && triggerDate <= now) {
    tageBisTermin = 7;
  }
  triggerDate.setDate(triggerDate.getDate() + tageBisTermin);

  return triggerDate;
}

/**
 * Alle aktiven Erinnerungen für alle Medikamente neu planen
 * (z.B. nach App-Start oder Änderung der Uhrzeiten)
 */
export async function planeAlleErinnerungen(
  medikamente: MedikamentRow[]
): Promise<void> {
  for (const med of medikamente) {
    if (med.erinnerung_aktiv) {
      await planeErinnerungen(med);
    }
  }
}

/**
 * Foreground-Event-Handler für eintreffende Benachrichtigungen
 * Wird in App.tsx registriert
 */
export function registerForegroundHandler(
  onAutoAbzug: (medikamentId: string, dosis?: number) => void
): () => void {
  return notifee.onForegroundEvent(async ({ type, detail }) => {
    if (type === 1) { // DELIVERED
      const data = detail.notification?.data;
      if (data?.medikamentId && data?.autoAbzug === '1') {
        const dosis = data.dosis !== undefined ? Number(data.dosis) : undefined;
        onAutoAbzug(String(data.medikamentId), Number.isFinite(dosis) ? dosis : undefined);
      }
    }
  });
}
