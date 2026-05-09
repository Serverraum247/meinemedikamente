/**
 * ArztController.ts – Arztkontaktdaten pflegen
 *
 * Free: 1 Arzt, Premium: unbegrenzt
 * Aerzte werden in den Einstellungen gepflegt und
 * im ArztUrlaubScreen fuer Urlaube referenziert.
 */

import { getDatabase, ArztRow } from './Database';
import { isPremium } from '../services/PremiumService';

// UUID-Generator
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export type { ArztRow };

/** Max. Anzahl Aerzte (Free vs Premium) */
const FREE_MAX_AERZTE = 1;
const PREMIUM_MAX_AERZTE = 999;

/**
 * Wie viele Aerzte darf der Nutzer anlegen?
 */
export async function getMaxAerzte(): Promise<number> {
  return (await isPremium()) ? PREMIUM_MAX_AERZTE : FREE_MAX_AERZTE;
}

/**
 * Alle Aerzte abrufen
 */
export async function getAllAerzte(): Promise<ArztRow[]> {
  const db = await getDatabase();
  const results = await db.executeSql(
    `SELECT * FROM aerzte ORDER BY name ASC`
  );

  const rows: ArztRow[] = [];
  results.forEach(result => {
    for (let i = 0; i < result.rows.length; i++) {
      rows.push(result.rows.item(i));
    }
  });
  return rows;
}

/**
 * Einzelnen Arzt abrufen
 */
export async function getArztById(id: string): Promise<ArztRow | null> {
  const db = await getDatabase();
  const results = await db.executeSql(
    `SELECT * FROM aerzte WHERE id = ?`,
    [id]
  );

  let arzt: ArztRow | null = null;
  results.forEach(result => {
    if (result.rows.length > 0) {
      arzt = result.rows.item(0);
    }
  });
  return arzt;
}

/**
 * Arzt anlegen (mit Limit-Check)
 * Gibt { success, id?, error? } zurueck
 */
export async function createArzt(
  data: Omit<ArztRow, 'id' | 'created_at'>
): Promise<{ success: boolean; id?: string; error?: string }> {
  const max = await getMaxAerzte();
  const existing = await getAllAerzte();

  if (existing.length >= max) {
    return {
      success: false,
      error: `Kostenlose Version: nur ${FREE_MAX_AERZTE} Arzt. Mehr Ärzte sind nur mit Premium möglich.`,
    };
  }

  const db = await getDatabase();
  const id = generateUUID();

  await db.executeSql(
    `INSERT INTO aerzte (id, name, telefon, adresse, fachgebiet)
     VALUES (?, ?, ?, ?, ?)`,
    [id, data.name, data.telefon || '', data.adresse || '', data.fachgebiet || '']
  );

  return { success: true, id };
}

/**
 * Arzt aktualisieren
 */
export async function updateArzt(
  id: string,
  data: Partial<Omit<ArztRow, 'id' | 'created_at'>>
): Promise<void> {
  const db = await getDatabase();
  const fields: string[] = [];
  const values: any[] = [];

  if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
  if (data.telefon !== undefined) { fields.push('telefon = ?'); values.push(data.telefon); }
  if (data.adresse !== undefined) { fields.push('adresse = ?'); values.push(data.adresse); }
  if (data.fachgebiet !== undefined) { fields.push('fachgebiet = ?'); values.push(data.fachgebiet); }

  if (fields.length === 0) return;

  values.push(id);
  await db.executeSql(
    `UPDATE aerzte SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
}

/**
 * Arzt loeschen
 */
export async function deleteArzt(id: string): Promise<void> {
  const db = await getDatabase();
  await db.executeSql(`DELETE FROM aerzte WHERE id = ?`, [id]);
}

/**
 * Anzahl der gespeicherten Aerzte
 */
export async function getArztCount(): Promise<number> {
  const aerzte = await getAllAerzte();
  return aerzte.length;
}
