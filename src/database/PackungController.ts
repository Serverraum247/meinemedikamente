/**
 * PackungController.ts – CRUD für Packungen (Packungs-Protokoll)
 *
 * Jeder Nachkauf erzeugt eine neue Packung mit eigener Größe und PZN.
 * Ersatzprodukte werden erfasst, stören aber den normalen Flow nicht.
 * Bestand-Änderungen werden in menge_verbleibend pro Packung nachverfolgt.
 */

import { database, PackungRow } from './Database';
import { updateBestand, getMedikamentById } from './MedikamentController';

/**
 * Neue Packung nach Kauf anlegen und Bestand auffüllen
 */
export async function nachkaufErfassen(
  medikamentId: string,
  groesse: number,
  pzn: string,
  istErsatzprodukt: boolean,
  ersatzName?: string,
): Promise<PackungRow> {
  const db = database.getDatabase();
  const id = generateUUID();
  const med = await getMedikamentById(medikamentId);
  if (!med) throw new Error(`Medikament ${medikamentId} nicht gefunden`);

  // Packung anlegen
  await db.executeSql(
    `INSERT INTO packungen (id, medikament_id, groesse, pzn, ist_ersatzprodukt, ersatz_name, gekauft_am, menge_verbleibend)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?)`,
    [id, medikamentId, groesse, pzn || med.pzn, istErsatzprodukt ? 1 : 0, ersatzName || '', groesse],
  );

  // Bestand des Medikaments erhöhen
  const neuerBestand = Math.round((med.aktueller_bestand + groesse) * 1e10) / 1e10;
  await updateBestand(medikamentId, neuerBestand);

  return {
    id,
    medikament_id: medikamentId,
    groesse,
    pzn: pzn || med.pzn,
    ist_ersatzprodukt: istErsatzprodukt ? 1 : 0,
    ersatz_name: ersatzName || '',
    gekauft_am: new Date().toISOString(),
    menge_verbleibend: groesse,
  };
}

/**
 * Letzte Packung eines Medikaments abrufen (für "Letzte Packung: X Stück" Anzeige)
 */
export async function getLetztePackung(medikamentId: string): Promise<PackungRow | null> {
  const db = database.getDatabase();
  const results = await db.executeSql(
    `SELECT * FROM packungen WHERE medikament_id = ? ORDER BY gekauft_am DESC LIMIT 1`,
    [medikamentId],
  );

  let row: PackungRow | null = null;
  results.forEach(result => {
    if (result.rows.length > 0) {
      row = result.rows.item(0);
    }
  });
  return row;
}

/**
 * Alle Packungen eines Medikaments (für Historie)
 */
export async function getPackungenByMedikament(medikamentId: string): Promise<PackungRow[]> {
  const db = database.getDatabase();
  const results = await db.executeSql(
    `SELECT * FROM packungen WHERE medikament_id = ? ORDER BY gekauft_am DESC`,
    [medikamentId],
  );

  const rows: PackungRow[] = [];
  results.forEach(result => {
    for (let i = 0; i < result.rows.length; i++) {
      rows.push(result.rows.item(i));
    }
  });
  return rows;
}

/**
 * Anzahl offener Packungen (menge_verbleibend > 0)
 */
export async function getOffenePackungenCount(medikamentId: string): Promise<number> {
  const db = database.getDatabase();
  const results = await db.executeSql(
    `SELECT COUNT(*) as count FROM packungen WHERE medikament_id = ? AND menge_verbleibend > 0`,
    [medikamentId],
  );

  let count = 0;
  results.forEach(result => {
    if (result.rows.length > 0) {
      count = result.rows.item(0).count;
    }
  });
  return count;
}

/**
 * Packungen eines Medikaments löschen (bei Medikament-Löschung)
 */
export async function deletePackungenByMedikament(medikamentId: string): Promise<void> {
  const db = database.getDatabase();
  await db.executeSql(`DELETE FROM packungen WHERE medikament_id = ?`, [medikamentId]);
}

/**
 * Erste Packung bei Neuanlage eines Medikaments erstellen
 */
export async function erstpackungErstellen(
  medikamentId: string,
  groesse: number,
  pzn: string,
): Promise<PackungRow> {
  return nachkaufErfassen(medikamentId, groesse, pzn, false, '');
}

// --- Hilfsfunktion ---

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
