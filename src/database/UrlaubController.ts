/**
 * UrlaubController.ts – Arzt-Urlaub-Prävention (Alleinstellungsmerkmal)
 *
 * Berechnet, ob Medikamente vor dem Ende eines Arzturlaubs leer werden.
 * Logik: Leer-Datum <= Urlaubs-Ende + 3 Tage → WARNUNG
 */

import { database, ArztUrlaubRow, MedikamentRow } from './Database';
import { getMedikamenteUnterSchwelle, getAllMedikamente } from './MedikamentController';

export interface UrlaubsWarnung {
  medikament: MedikamentRow;
  leerDatum: Date;
  urlaub: ArztUrlaubRow;
  tageBisLeer: number;
}

/**
 * Arzt-Urlaub anlegen
 */
export async function createArztUrlaub(
  urlaub: Omit<ArztUrlaubRow, 'created_at'>
): Promise<string> {
  const db = database.getDatabase();
  const id = urlaub.id || generateUUID();

  await db.executeSql(
    `INSERT INTO arzt_urlaub (id, praxis_name, urlaub_start, urlaub_ende)
     VALUES (?, ?, ?, ?)`,
    [id, urlaub.praxis_name, urlaub.urlaub_start, urlaub.urlaub_ende]
  );

  return id;
}

/**
 * Alle Arzt-Urlaube abrufen
 */
export async function getAllArztUrlaube(): Promise<ArztUrlaubRow[]> {
  const db = database.getDatabase();
  const results = await db.executeSql(
    `SELECT * FROM arzt_urlaub ORDER BY urlaub_start ASC`
  );

  const rows: ArztUrlaubRow[] = [];
  results.forEach(result => {
    for (let i = 0; i < result.rows.length; i++) {
      rows.push(result.rows.item(i));
    }
  });
  return rows;
}

/**
 * Arzt-Urlaub löschen
 */
export async function deleteArztUrlaub(id: string): Promise<void> {
  const db = database.getDatabase();
  await db.executeSql(`DELETE FROM arzt_urlaub WHERE id = ?`, [id]);
}

/**
 * Kern-Logik: Berechnet das Datum, an dem die Pillen leer sind.
 *
 * @param bestand Aktueller Bestand (Float, z.B. 28.5)
 * @param einzeldosis Einzeldosis (Float, z.B. 0.5)
 * @param einnahmenProTag Wie oft pro Tag wird eingenommen? (Standard: 1)
 * @returns Datum, an dem der Bestand auf 0 fällt
 */
export function calculateRefillDate(
  bestand: number,
  einzeldosis: number,
  einnahmenProTag: number = 1
): Date {
  const tagesverbrauch = einzeldosis * einnahmenProTag;
  if (tagesverbrauch <= 0) {
    return new Date(); // Sofort warnen bei ungültigen Daten
  }
  const tageBisLeer = Math.floor(bestand / tagesverbrauch);
  const leerDatum = new Date();
  leerDatum.setDate(leerDatum.getDate() + tageBisLeer);
  return leerDatum;
}

/**
 * Urlaubs-Warnungen berechnen
 *
 * Vergleicht Leer-Datum jedes Medikaments mit allen aktiven Arzt-Urlauben.
 * Warnung wenn: Leer-Datum <= Urlaubs-Ende + 3 Tage
 */
export async function calculateUrlaubsWarnungen(): Promise<UrlaubsWarnung[]> {
  const medikamente = await getAllMedikamente();
  const urlaube = await getAllArztUrlaube();
  const warnungen: UrlaubsWarnung[] = [];

  const heute = new Date();
  heute.setHours(0, 0, 0, 0);

  for (const med of medikamente) {
    // Nur Medikamente mit Bestand prüfen
    if (med.aktueller_bestand <= 0) continue;

    const leerDatum = calculateRefillDate(med.aktueller_bestand, med.einzeldosis);
    leerDatum.setHours(0, 0, 0, 0);

    for (const urlaub of urlaube) {
      const urlaubEnde = new Date(urlaub.urlaub_ende);
      urlaubEnde.setHours(0, 0, 0, 0);

      // Sicherheitspuffer: 3 Tage nach Urlaub
      const sicherheitsDatum = new Date(urlaubEnde);
      sicherheitsDatum.setDate(sicherheitsDatum.getDate() + 3);

      // Nur warnen, wenn Urlaub in der Zukunft liegt
      const urlaubStart = new Date(urlaub.urlaub_start);
      urlaubStart.setHours(0, 0, 0, 0);
      if (urlaubStart < heute) continue;

      const tageBisLeer = Math.ceil(
        (leerDatum.getTime() - heute.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (leerDatum <= sicherheitsDatum) {
        warnungen.push({
          medikament: med,
          leerDatum,
          urlaub,
          tageBisLeer,
        });
      }
    }
  }

  // Sortierung: Dringendste zuerst
  warnungen.sort((a, b) => a.tageBisLeer - b.tageBisLeer);
  return warnungen;
}

// --- Hilfsfunktionen ---

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
