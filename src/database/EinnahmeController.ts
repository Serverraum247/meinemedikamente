/**
 * EinnahmeController.ts – Einnahme-Historie abfragen und stornieren
 */

import { database, getDatabase, EinnahmeRow } from './Database';
import { updateBestand, getMedikamentById } from './MedikamentController';

export interface EinnahmeWithDate extends EinnahmeRow {
  datum_formatted: string; // Lesbares Datum für die Anzeige
  uhrzeit_formatted: string;
}

export interface TagesEinnahmeWithMedikament extends EinnahmeWithDate {
  medikament_name: string;
}

/**
 * Einnahmen eines Medikaments abrufen (neueste zuerst)
 */
export async function getEinnahmenByMedikament(
  medikamentId: string,
  limit: number = 30
): Promise<EinnahmeWithDate[]> {
  const db = await getDatabase();
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
 * Letzte N Einnahmen ueber alle Medikamente
 */
export async function getRecentEinnahmen(
  limit: number = 20
): Promise<EinnahmeWithDate[]> {
  const db = await getDatabase();
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

/**
 * Einnahmen fuer einen Kalendertag inkl. Medikamentenname.
 * Wird fuer die Startseiten-Protokollierung genutzt.
 */
export async function getEinnahmenForLocalDay(
  datum: Date,
  personId?: string,
): Promise<TagesEinnahmeWithMedikament[]> {
  const db = await getDatabase();
  const datumIso = toLocalIsoDate(datum);
  const params: Array<string> = [`${datumIso} 00:00:00`, `${datumIso} 23:59:59`];
  const personFilter = personId ? 'AND e.person_id = ?' : '';
  if (personId) params.push(personId);

  const results = await db.executeSql(
    `SELECT e.*, m.name AS medikament_name
     FROM einnahmen e
     LEFT JOIN medikamente m ON m.id = e.medikament_id
     WHERE e.timestamp >= ?
       AND e.timestamp <= ?
       ${personFilter}
     ORDER BY e.timestamp DESC`,
    params,
  );

  const rows: TagesEinnahmeWithMedikament[] = [];
  results.forEach(result => {
    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows.item(i);
      const d = new Date(row.timestamp);
      rows.push({
        ...row,
        medikament_name: row.medikament_name || 'Medikament',
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
 * Einnahme stornieren – loescht den Eintrag UND setzt den Bestand zurueck
 * Bestand wird um die stornierte Menge erhoeht (Bestand + menge)
 */
export async function storniereEinnahme(
  einnahmeId: string,
  medikamentId: string
): Promise<{ success: boolean; neuerBestand?: number }> {
  const db = await getDatabase();

  // 1. Menge der Einnahme holen
  const result = await db.executeSql(
    'SELECT menge FROM einnahmen WHERE id = ?',
    [einnahmeId]
  );

  if (!result[0] || result[0].rows.length === 0) {
    return { success: false };
  }

  const menge = result[0].rows.item(0).menge as number;

  // 2. Einnahme loeschen
  await db.executeSql('DELETE FROM einnahmen WHERE id = ?', [einnahmeId]);

  // 3. Bestand wieder hochsetzen (Bestand + menge)
  const med = await getMedikamentById(medikamentId);
  if (med) {
    const neuerBestand = med.aktueller_bestand + menge;
    await updateBestand(medikamentId, neuerBestand);
    return { success: true, neuerBestand };
  }

  return { success: true };
}

function toLocalIsoDate(datum: Date): string {
  const year = datum.getFullYear();
  const month = String(datum.getMonth() + 1).padStart(2, '0');
  const day = String(datum.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
