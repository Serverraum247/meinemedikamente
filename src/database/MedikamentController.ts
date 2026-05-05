/**
 * MedikamentController.ts – CRUD-Operationen für Medikamente
 *
 * Alle Bestands-Operationen verwenden REAL (Float), damit
 * halbe Tabletten (0.5) korrekt verarbeitet werden.
 */

import { database, MedikamentRow } from './Database';

/**
 * Neues Medikament anlegen
 * aktueller_bestand und einzeldosis sind Float-Werte
 */
export async function createMedikament(
  medikament: Omit<MedikamentRow, 'created_at' | 'updated_at'>
): Promise<string> {
  const db = database.getDatabase();
  const id = medikament.id || generateUUID();

  await db.executeSql(
    `INSERT INTO medikamente (id, name, aktueller_bestand, einzeldosis, einheit, pzn, packungsgroesse, warnung_ab_bestand)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      medikament.name,
      medikament.aktueller_bestand,  // Float: z.B. 28.5
      medikament.einzeldosis,        // Float: z.B. 0.5
      medikament.einheit,
      medikament.pzn,
      medikament.packungsgroesse,    // Float
      medikament.warnung_ab_bestand, // Float
    ]
  );

  return id;
}

/**
 * Alle Medikamente abrufen
 */
export async function getAllMedikamente(): Promise<MedikamentRow[]> {
  const db = database.getDatabase();
  const results = await db.executeSql(
    `SELECT * FROM medikamente ORDER BY name ASC`
  );

  const rows: MedikamentRow[] = [];
  results.forEach(result => {
    for (let i = 0; i < result.rows.length; i++) {
      rows.push(result.rows.item(i));
    }
  });
  return rows;
}

/**
 * Einzelnes Medikament per ID abrufen
 */
export async function getMedikamentById(id: string): Promise<MedikamentRow | null> {
  const db = database.getDatabase();
  const results = await db.executeSql(
    `SELECT * FROM medikamente WHERE id = ?`,
    [id]
  );

  let row: MedikamentRow | null = null;
  results.forEach(result => {
    if (result.rows.length > 0) {
      row = result.rows.item(0);
    }
  });
  return row;
}

/**
 * Bestand aktualisieren (Float-Arithmetik)
 * Wird bei Einnahme und Nachkauf aufgerufen
 */
export async function updateBestand(
  id: string,
  neuerBestand: number // Float – IMPORTANT: Caller computes this
): Promise<void> {
  const db = database.getDatabase();
  await db.executeSql(
    `UPDATE medikamente
     SET aktueller_bestand = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [neuerBestand, id]
  );
}

/**
 * Bestand nach Einnahme reduzieren
 * Bestand_Neu = Bestand_Alt - Einzeldosis (Float-Subtraktion)
 */
export async function einnahmeVerbuchen(medikamentId: string): Promise<number> {
  const med = await getMedikamentById(medikamentId);
  if (!med) throw new Error(`Medikament ${medikamentId} nicht gefunden`);

  const neuerBestand = med.aktueller_bestand - med.einzeldosis;
  // Verhindere negative Bestände
  const finalBestand = Math.max(0, neuerBestand);

  await updateBestand(medikamentId, finalBestand);

  // Einnahme-Log speichern
  await logEinnahme(medikamentId, med.einzeldosis);

  return finalBestand;
}

/**
 * Einnahme im Log speichern
 */
export async function logEinnahme(
  medikamentId: string,
  menge: number // Float
): Promise<void> {
  const db = database.getDatabase();
  await db.executeSql(
    `INSERT INTO einnahmen (id, medikament_id, menge, timestamp)
     VALUES (?, ?, ?, datetime('now'))`,
    [generateUUID(), medikamentId, menge]
  );
}

/**
 * Medikament komplett aktualisieren
 */
export async function updateMedikament(
  id: string,
  updates: Partial<Omit<MedikamentRow, 'id' | 'created_at'>>
): Promise<void> {
  const db = database.getDatabase();
  const fields: string[] = [];
  const values: (string | number)[] = [];

  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.aktueller_bestand !== undefined) { fields.push('aktueller_bestand = ?'); values.push(updates.aktueller_bestand); }
  if (updates.einzeldosis !== undefined) { fields.push('einzeldosis = ?'); values.push(updates.einzeldosis); }
  if (updates.einheit !== undefined) { fields.push('einheit = ?'); values.push(updates.einheit); }
  if (updates.pzn !== undefined) { fields.push('pzn = ?'); values.push(updates.pzn); }
  if (updates.packungsgroesse !== undefined) { fields.push('packungsgroesse = ?'); values.push(updates.packungsgroesse); }
  if (updates.warnung_ab_bestand !== undefined) { fields.push('warnung_ab_bestand = ?'); values.push(updates.warnung_ab_bestand); }

  fields.push("updated_at = datetime('now')");
  values.push(id);

  if (fields.length > 1) {
    await db.executeSql(
      `UPDATE medikamente SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
  }
}

/**
 * Medikament löschen (Cascade löscht auch Einnahmen)
 */
export async function deleteMedikament(id: string): Promise<void> {
  const db = database.getDatabase();
  // Erst Einnahmen löschen
  await db.executeSql(`DELETE FROM einnahmen WHERE medikament_id = ?`, [id]);
  // Dann Medikament
  await db.executeSql(`DELETE FROM medikamente WHERE id = ?`, [id]);
}

/**
 * Prüfen, welche Medikamente unter der Warnungsschwelle sind
 */
export async function getMedikamenteUnterSchwelle(): Promise<MedikamentRow[]> {
  const db = database.getDatabase();
  const results = await db.executeSql(
    `SELECT * FROM medikamente WHERE aktueller_bestand <= warnung_ab_bestand ORDER BY aktueller_bestand ASC`
  );

  const rows: MedikamentRow[] = [];
  results.forEach(result => {
    for (let i = 0; i < result.rows.length; i++) {
      rows.push(result.rows.item(i));
    }
  });
  return rows;
}

// --- Hilfsfunktionen ---

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
