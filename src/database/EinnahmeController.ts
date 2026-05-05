/**
 * EinnahmeController.ts – Einnahme-Historie abfragen
 */

import { database, EinnahmeRow } from './Database';

export interface EinnahmeWithDate extends EinnahmeRow {
  datum_formatted: string; // Lesbares Datum für die Anzeige
  uhrzeit_formatted: string;
}

/**
 * Einnahmen eines Medikaments abrufen (neueste zuerst)
 */
export async function getEinnahmenByMedikament(
  medikamentId: string,
  limit: number = 30
): Promise<EinnahmeWithDate[]> {
  const db = database.getDatabase();
  const results = await db.executeSql(
    `SELECT * FROM einnahmen
     WHERE medikament_id = ?
     ORDER BY timestamp DESC
     LIMIT ?`,
    [medikamentId, limit]
  );

  const rows: EinnahmeWithDate[] = [];
  results.forEach(result => {
    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows.item(i);
      const d = new Date(row.timestamp);
      rows.push({
        ...row,
        datum_formatted: d.toLocaleDateString('de-DE', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }),
        uhrzeit_formatted: d.toLocaleTimeString('de-DE', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      });
    }
  });
  return rows;
}

/**
 * Letzte N Einnahmen über alle Medikamente
 */
export async function getRecentEinnahmen(
  limit: number = 20
): Promise<EinnahmeWithDate[]> {
  const db = database.getDatabase();
  const results = await db.executeSql(
    `SELECT * FROM einnahmen
     ORDER BY timestamp DESC
     LIMIT ?`,
    [limit]
  );

  const rows: EinnahmeWithDate[] = [];
  results.forEach(result => {
    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows.item(i);
      const d = new Date(row.timestamp);
      rows.push({
        ...row,
        datum_formatted: d.toLocaleDateString('de-DE', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }),
        uhrzeit_formatted: d.toLocaleTimeString('de-DE', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      });
    }
  });
  return rows;
}
