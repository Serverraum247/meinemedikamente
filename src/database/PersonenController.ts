/**
 * PersonenController.ts – Personen (Patienten) verwalten
 *
 * Free: 1 Person, Premium: unbegrenzt
 * Jede Person hat Avatar (Emoji oder Foto) und Name.
 */

import { getDatabase } from './Database';
import { PersonRow } from './Database';
export type { PersonRow } from './Database';
import { isPremium } from '../services/PremiumService';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---------- Avatar-Emoji Auswahl ----------

export const AVATAR_EMOJIS = [
  '👤', '👨', '👩', '👦', '👧', '👴', '👵',
  '🧑', '👶', '🧓', '👼', '🧔',
] as const;

// ---------- CRUD ----------

export async function getAllPersonen(): Promise<PersonRow[]> {
  const db = await getDatabase();
  const result = await db.executeSql(
    `SELECT * FROM personen ORDER BY ist_standard DESC, created_at ASC;`
  );
  const personen: PersonRow[] = [];
  result.forEach((r: any) => {
    for (let i = 0; i < r.rows.length; i++) {
      personen.push(r.rows.item(i));
    }
  });
  return personen;
}

export async function getPersonById(id: string): Promise<PersonRow | null> {
  const db = await getDatabase();
  const result = await db.executeSql(
    `SELECT * FROM personen WHERE id = ?;`,
    [id]
  );
  let person: PersonRow | null = null;
  result.forEach((r: any) => {
    if (r.rows.length > 0) {
      person = r.rows.item(0);
    }
  });
  return person;
}

export async function getStandardPerson(): Promise<PersonRow> {
  const db = await getDatabase();
  const result = await db.executeSql(
    `SELECT * FROM personen WHERE ist_standard = 1 LIMIT 1;`
  );
  let person: PersonRow | null = null;
  result.forEach((r: any) => {
    if (r.rows.length > 0) {
      person = r.rows.item(0);
    }
  });
  // Fallback: Default-Person erstellen falls nicht vorhanden
  if (!person) {
    await db.executeSql(
      `INSERT INTO personen (id, name, avatar_emoji, ist_standard) VALUES (?, 'Ich', '👤', 1);`,
      ['person-default-001']
    );
    person = {
      id: 'person-default-001',
      name: 'Ich',
      avatar_emoji: '👤',
      avatar_uri: '',
      ist_standard: 1,
      created_at: new Date().toISOString(),
    };
  }
  return person;
}

export interface CreatePersonResult {
  success: boolean;
  person?: PersonRow;
  error?: string;
}

export async function createPerson(data: {
  name: string;
  avatar_emoji?: string;
  avatar_uri?: string;
}): Promise<CreatePersonResult> {
  const premium = await isPremium();
  if (!premium) {
    const existing = await getAllPersonen();
    if (existing.length >= 1) {
      return {
        success: false,
        error: 'Kostenlose Version: nur 1 Person möglich. Premium freischalten für mehrere.',
      };
    }
  }

  const db = await getDatabase();
  const id = generateUUID();
  await db.executeSql(
    `INSERT INTO personen (id, name, avatar_emoji, avatar_uri) VALUES (?, ?, ?, ?);`,
    [id, data.name.trim(), data.avatar_emoji || '👤', data.avatar_uri || '']
  );

  return {
    success: true,
    person: {
      id,
      name: data.name.trim(),
      avatar_emoji: data.avatar_emoji || '👤',
      avatar_uri: data.avatar_uri || '',
      ist_standard: 0,
      created_at: new Date().toISOString(),
    },
  };
}

export async function updatePerson(
  id: string,
  updates: Partial<Pick<PersonRow, 'name' | 'avatar_emoji' | 'avatar_uri'>>
): Promise<void> {
  const db = await getDatabase();
  const fields: string[] = [];
  const values: string[] = [];

  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.avatar_emoji !== undefined) { fields.push('avatar_emoji = ?'); values.push(updates.avatar_emoji); }
  if (updates.avatar_uri !== undefined) { fields.push('avatar_uri = ?'); values.push(updates.avatar_uri); }

  if (fields.length === 0) return;

  values.push(id);
  await db.executeSql(
    `UPDATE personen SET ${fields.join(', ')} WHERE id = ?;`,
    values
  );
}

export async function deletePerson(id: string): Promise<{ success: boolean; error?: string }> {
  const db = await getDatabase();

  // Standard-Person kann nicht geloescht werden
  const person = await getPersonById(id);
  if (!person) return { success: false, error: 'Person nicht gefunden.' };
  if (person.ist_standard === 1) {
    return { success: false, error: 'Die Hauptperson kann nicht gelöscht werden.' };
  }

  // Alle Medikamente/Einnahmen/Urlaube dieser Person auf Standard-Person umziehen
  const standard = await getStandardPerson();
  await db.executeSql(
    `UPDATE medikamente SET person_id = ? WHERE person_id = ?;`,
    [standard.id, id]
  );
  await db.executeSql(
    `UPDATE einnahmen SET person_id = ? WHERE person_id = ?;`,
    [standard.id, id]
  );
  await db.executeSql(
    `UPDATE arzt_urlaub SET person_id = ? WHERE person_id = ?;`,
    [standard.id, id]
  );

  // Person loeschen
  await db.executeSql(`DELETE FROM personen WHERE id = ?;`, [id]);
  return { success: true };
}

export async function getMaxPersonen(): Promise<number> {
  const premium = await isPremium();
  return premium ? 999 : 1;
}
