/**
 * EinnahmeErinnerungService.ts – Prüft offene Einnahmen für heute
 *
 * Logik:
 * 1. Alle Medikamente laden die einen Einnahmeplan haben (einnahme_uhrzeiten != '[]')
 * 2. Für jeden Slot prüfen ob heute schon eine Einnahme geloggt wurde
 * 3. Slots deren Uhrzeit bereits vorbei sind aber keine Einnahme haben → "offen"
 *
 * Rückgabe: Liste der offenen Einnahmen mit Medikament-Name und Slot-Info
 */

import { getAllMedikamente } from '../database/MedikamentController';
import { getDatabase } from '../database/Database';
import {
  parseEinnahmeplan,
  istSlotAnDatumAktiv,
  SLOT_META,
  type EinnahmeSlot,
  type TageszeitSlot,
} from '../utils/Einnahmeplan';

/** Eine offene Einnahme-Erinnerung */
export interface OffeneEinnahme {
  medikamentId: string;
  medikamentName: string;
  zusatz?: string;
  slot: TageszeitSlot;
  slotLabel: string;     // "Morgens", "Mittags", etc.
  slotUhrzeit: string;   // "08:00"
  dosis: number;         // Einzeldosis oder slot-spezifische Dosis
  einheit: string;       // Tabletten, ml, Tropfen, etc.
  stundenSeitUhrzeit: number; // Wie lange der Slot schon vorbei ist
}

/**
 * Alle offenen Einnahmen für heute abrufen.
 * Ein Slot gilt als "offen" wenn:
 * - Die Slot-Uhrzeit in der Vergangenheit liegt (oder +/-30 Min Toleranz)
 * - Heute noch keine Einnahme für dieses Medikament in diesem Slot geloggt wurde
 *
 * @param toleranzMinuten - Wie viele Minuten vor der Slot-Zeit erinnert werden soll (Default: 0)
 */
export async function getOffeneEinnahmen(
  toleranzMinuten: number = 0
): Promise<OffeneEinnahme[]> {
  const medikamente = await getAllMedikamente();
  const jetzt = new Date();
  const heuteStr = jetzt.toISOString().slice(0, 10); // Nur noch Fallback; DB nutzt lokale Tagesgrenzen.
  const aktuelleMinuten = jetzt.getHours() * 60 + jetzt.getMinutes();
  const offene: OffeneEinnahme[] = [];

  for (const med of medikamente) {
    // Nur Medikamente mit Einnahmeplan
    if (!med.einnahme_uhrzeiten || med.einnahme_uhrzeiten === '[]') continue;

    const plan = parseEinnahmeplan(med.einnahme_uhrzeiten);
    if (plan.length === 0) continue;

    // Heutige Einnahmen fuer dieses Medikament laden
    const heuteEinnahmen = await getHeutigeEinnahmenFuerMedikament(med.id, heuteStr);

    // Bereits eingenommene Slots ermitteln
    const eingenommeneSlots = new Set<TageszeitSlot>();
    for (const einnahme of heuteEinnahmen) {
      if (einnahme.slot) {
        eingenommeneSlots.add(einnahme.slot);
      } else {
        // Fallback fuer alte Eintraege vor V13.
        const einnahmeStunde = new Date(einnahme.timestamp).getHours();
        const slot = stundeZuSlot(einnahmeStunde);
        eingenommeneSlots.add(slot);
      }
    }

    // Offene Slots finden
    for (const slot of plan) {
      if (!istSlotAnDatumAktiv(slot, jetzt)) continue;
      if (eingenommeneSlots.has(slot.slot)) continue; // schon eingenommen

      const [h, m] = slot.uhrzeit.split(':').map(Number);
      const slotMinuten = h * 60 + m;
      const diff = aktuelleMinuten - slotMinuten;

      // Slot ist "offen" wenn die Uhrzeit vorbei ist (mit Toleranz)
      if (diff >= -toleranzMinuten) {
        const dosis = slot.dosis !== undefined ? slot.dosis : med.einzeldosis;
        const meta = SLOT_META[slot.slot];

        offene.push({
          medikamentId: med.id,
          medikamentName: med.name,
          zusatz: med.zusatz || undefined,
          slot: slot.slot,
          slotLabel: meta.label,
          slotUhrzeit: slot.uhrzeit,
          dosis,
          einheit: med.einheit,
          stundenSeitUhrzeit: Math.max(0, Math.round(diff / 60 * 10) / 10),
        });
      }
    }
  }

  // Sortieren: Slots die am längsten offen sind zuerst
  offene.sort((a, b) => b.stundenSeitUhrzeit - a.stundenSeitUhrzeit);

  return offene;
}

export async function getHeutigeEinnahmeMedikamentIds(): Promise<Set<string>> {
  const db = await getDatabase();
  const results = await db.executeSql(
    `SELECT DISTINCT medikament_id FROM einnahmen
     WHERE timestamp >= datetime('now', 'localtime', 'start of day')
       AND timestamp < datetime('now', 'localtime', 'start of day', '+1 day')`
  );

  const ids = new Set<string>();
  results.forEach(result => {
    for (let i = 0; i < result.rows.length; i++) {
      ids.add(result.rows.item(i).medikament_id);
    }
  });
  return ids;
}

/**
 * Heutige Einnahmen fuer ein Medikament abrufen
 */
async function getHeutigeEinnahmenFuerMedikament(
  medikamentId: string,
  heuteStr: string
): Promise<Array<{ timestamp: string; slot?: TageszeitSlot }>> {
  const db = await getDatabase();
  const results = await db.executeSql(
    `SELECT timestamp, slot FROM einnahmen
     WHERE medikament_id = ?
       AND timestamp >= datetime('now', 'localtime', 'start of day')
       AND timestamp < datetime('now', 'localtime', 'start of day', '+1 day')
     ORDER BY timestamp ASC`,
    [medikamentId]
  );

  const rows: Array<{ timestamp: string; slot?: TageszeitSlot }> = [];
  results.forEach(result => {
    for (let i = 0; i < result.rows.length; i++) {
      rows.push(result.rows.item(i));
    }
  });
  return rows;
}

/**
 * Stunde → Tageszeit-Slot mapping
 */
function stundeZuSlot(stunde: number): TageszeitSlot {
  if (stunde >= 4 && stunde < 11) return 'morgens';
  if (stunde >= 11 && stunde < 15) return 'mittags';
  if (stunde >= 15 && stunde < 21) return 'abends';
  return 'nachts';
}

/**
 * Letzte Erinnerungszeit speichern (verhindert wiederholte Erinnerungen)
 * Key: `einnahme_erinnerung_letzter_{datum}`
 */
export async function setzteLetzteErinnerung(): Promise<void> {
  const { setSetting } = require('./SettingsService');
  const heute = new Date().toISOString().slice(0, 10);
  await setSetting(`einnahme_erinnerung_letzter_${heute}`, new Date().toISOString());
}

/**
 * Prüfen ob heute schon eine Erinnerung gezeigt wurde
 * @param minAbstandMinuten - Mindestabstand zwischen Erinnerungen (Default: 60)
 */
export async function sollErinnerungZeigen(
  minAbstandMinuten: number = 60
): Promise<boolean> {
  const { getSetting } = require('./SettingsService');
  const heute = new Date().toISOString().slice(0, 10);
  const letzte = await getSetting(`einnahme_erinnerung_letzter_${heute}`);

  if (!letzte) return true;

  const letzteZeit = new Date(letzte);
  const diff = (Date.now() - letzteZeit.getTime()) / 60000;
  return diff >= minAbstandMinuten;
}
