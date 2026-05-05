/**
 * AutoAbzugService.ts – Automatischer Bestandsabzug bei Einnahme
 *
 * Wird aufgerufen wenn:
 * 1. Eine Erinnerungs-Benachrichtigung eintrifft (Foreground-Handler)
 * 2. Der Benutzer die Einnahme manuell bestätigt
 *
 * Reduziert den Bestand um die Einzeldosis und erstellt einen
 * Einnahme-Eintrag in der Datenbank.
 */

import { database, getDatabase } from '../database/Database';
import { reduceBestand } from '../utils/FloatUtils';

export interface AutoAbzugResult {
  success: boolean;
  neuerBestand: number;
  error?: string;
}

/**
 * Bestand automatisch abziehen (aufgerufen durch Erinnerung oder manuell)
 *
 * @param medikamentId ID des Medikaments
 * @returns Neuer Bestand oder Fehler
 */
export async function fuehreAutoAbzugDurch(
  medikamentId: string
): Promise<AutoAbzugResult> {
  const db = await getDatabase();

  try {
    // Medikament laden
    const result = await db.executeSql(
      `SELECT * FROM medikamente WHERE id = ?;`,
      [medikamentId]
    );

    if (result[0].rows.length === 0) {
      return { success: false, neuerBestand: 0, error: 'Medikament nicht gefunden' };
    }

    const med = result[0].rows.item(0);

    if (!med.auto_abzug_aktiv) {
      return { success: false, neuerBestand: med.aktueller_bestand, error: 'Auto-Abzug nicht aktiviert' };
    }

    // Bestand reduzieren (mit IEEE 754 Rounding)
    const neuerBestand = reduceBestand(med.aktueller_bestand, med.einzeldosis);

    if (neuerBestand < 0) {
      // Negativen Bestand nicht zulassen – aber trotzdem Einnahme loggen
      console.warn(`[AutoAbzug] Bestand würde negativ: ${med.name}`);
    }

    const finalBestand = Math.max(0, neuerBestand);

    // Bestand updaten
    await db.executeSql(
      `UPDATE medikamente SET aktueller_bestand = ?, sync_status = 1, updated_at = datetime('now') WHERE id = ?;`,
      [finalBestand, medikamentId]
    );

    // Einnahme loggen
    const einnahmeId = `auto-${Date.now()}-${medikamentId.substring(0, 8)}`;
    await db.executeSql(
      `INSERT INTO einnahmen (id, medikament_id, menge, timestamp, notiz) VALUES (?, ?, ?, datetime('now'), 'Automatische Einnahme');`,
      [einnahmeId, medikamentId, med.einzeldosis]
    );

    console.log(
      `[AutoAbzug] ${med.name}: ${med.aktueller_bestand} - ${med.einzeldosis} = ${finalBestand}`
    );

    return { success: true, neuerBestand: finalBestand };
  } catch (error) {
    console.error('[AutoAbzug] Fehler:', error);
    return { success: false, neuerBestand: 0, error: String(error) };
  }
}

/**
 * Alle Medikamente mit aktivem Auto-Abzug und heutiger Erinnerung abfragen
 * (für z.B. einen Background-Fetch oder App-Start-Check)
 */
export async function getMedikamenteMitAutoAbzug(): Promise<string[]> {
  const db = await getDatabase();

  try {
    const result = await db.executeSql(
      `SELECT id FROM medikamente WHERE auto_abzug_aktiv = 1 AND erinnerung_aktiv = 1;`
    );
    const ids: string[] = [];
    for (let i = 0; i < result[0].rows.length; i++) {
      ids.push(result[0].rows.item(i).id);
    }
    return ids;
  } catch {
    return [];
  }
}
