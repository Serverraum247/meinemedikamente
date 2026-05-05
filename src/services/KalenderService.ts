/**
 * KalenderService.ts – Native Kalender-Integration
 *
 * Erstellt automatisch Kalendereintrage fuer:
 * - Rezept-Abholtermine (Premium Feature)
 * - Arzt-Urlaub-Warnungen
 *
 * Verwendet react-native-calendar-events fuer native Integration.
 * Berechtigung wird zur Laufzeit angefragt.
 */

import CalendarEvents from 'react-native-calendar-events';
import { calculateLeerDatum } from '../utils/FloatUtils';

export interface KalenderEvent {
  title: string;
  startDate: string; // ISO 8601
  endDate: string;
  notes?: string;
  alarm?: number; // Minuten vor dem Event
}

/**
 * Kalender-Berechtigung anfragen
 * @returns true wenn Berechtigung erteilt
 */
export async function requestKalenderBerechtigung(): Promise<boolean> {
  try {
    const status = await CalendarEvents.requestPermissions();
    return status === 'authorized';
  } catch (error) {
    console.error('[KalenderService] Berechtigung fehlgeschlagen:', error);
    return false;
  }
}

/**
 * Pruefen ob Kalender-Berechtigung erteilt ist
 */
export async function hasKalenderBerechtigung(): Promise<boolean> {
  try {
    const status = await CalendarEvents.checkPermissions();
    return status === 'authorized';
  } catch {
    return false;
  }
}

/**
 * Rezept-Abholtermin im Kalender eintragen
 *
 * @param medikamentName Name des Medikaments
 * @param bestand Aktueller Bestand
 * @param einzeldosis Einzeldosis
 * @param einnahmenProTag Einnahmen pro Tag
 * @param tageVorLeer Wie viele Tage VOR dem Leer-Datum soll der Termin sein?
 * @returns Event-ID oder null bei Fehler
 */
export async function erstelleRezeptAbholtermin(
  medikamentName: string,
  bestand: number,
  einzeldosis: number,
  einnahmenProTag: number = 1,
  tageVorLeer: number = 7
): Promise<string | null> {
  const berechtigt = await requestKalenderBerechtigung();
  if (!berechtigt) {
    console.warn('[KalenderService] Keine Kalender-Berechtigung');
    return null;
  }

  const leerDatum = calculateLeerDatum(bestand, einzeldosis, einnahmenProTag);
  const terminDatum = new Date(leerDatum);
  terminDatum.setDate(terminDatum.getDate() - tageVorLeer);

  // Termin-Zeit: 10:00 Uhr Vormittags
  const startDatum = new Date(terminDatum);
  startDatum.setHours(10, 0, 0, 0);

  // Ende: 30 Minuten spaeter
  const endDatum = new Date(startDatum);
  endDatum.setMinutes(endDatum.getMinutes() + 30);

  const event: KalenderEvent = {
    title: `Rezept abholen: ${medikamentName}`,
    startDate: startDatum.toISOString(),
    endDate: endDatum.toISOString(),
    notes:
      `Medikament: ${medikamentName}\n` +
      `Aktueller Bestand: ${bestand}\n` +
      `Einzeldosis: ${einzeldosis}\n` +
      `Vorraeussichtlich leer am: ${leerDatum}\n\n` +
      `Erstellt durch "Meine Medikamente" App`,
    alarm: 60, // 1 Stunde vorher erinnern
  };

  try {
    const eventId = await CalendarEvents.saveEvent(event.title, {
      startDate: event.startDate,
      endDate: event.endDate,
      notes: event.notes,
      alarms: [{ date: -event.alarm! }], // Negativ = Minuten vor Event
    });
    console.log('[KalenderService] Event erstellt:', eventId);
    return eventId;
  } catch (error) {
    console.error('[KalenderService] Event erstellen fehlgeschlagen:', error);
    return null;
  }
}

/**
 * Arzt-Urlaub-Warnung als Kalendereintrag
 */
export async function erstelleUrlaubsWarnung(
  arztName: string,
  urlaubStart: string,
  urlaubEnde: string,
  medikamentName: string
): Promise<string | null> {
  const berechtigt = await requestKalenderBerechtigung();
  if (!berechtigt) return null;

  const startDatum = new Date(urlaubStart);
  startDatum.setHours(9, 0, 0, 0);

  const endDatum = new Date(urlaubEnde);
  endDatum.setHours(18, 0, 0, 0);

  try {
    const eventId = await CalendarEvents.saveEvent(
      `Arzt im Urlaub: ${arztName}`,
      {
        startDate: startDatum.toISOString(),
        endDate: endDatum.toISOString(),
        allDay: true,
        notes:
          `Praxis ${arztName} ist im Urlaub.\n` +
          `Urlaub: ${urlaubStart} bis ${urlaubEnde}\n` +
          `Betroffenes Medikament: ${medikamentName}\n\n` +
          `Rezept rechtzeitig besorgen!\n` +
          `Erstellt durch "Meine Medikamente" App`,
        alarms: [{ date: -1440 }], // 1 Tag vorher
      }
    );
    return eventId;
  } catch (error) {
    console.error('[KalenderService] Urlaub-Warnung fehlgeschlagen:', error);
    return null;
  }
}
