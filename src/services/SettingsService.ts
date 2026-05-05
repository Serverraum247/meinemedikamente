/**
 * SettingsService.ts – Einfache Key-Value-Einstellungen in SQLite
 *
 * Verwendet die bestehende SQLite-Datenbank statt AsyncStorage.
 * Tabelle 'einstellungen': key TEXT PRIMARY KEY, value TEXT
 */

import { getDatabase } from '../database/Database';

/**
 * Einstellung lesen
 */
export async function getSetting(key: string): Promise<string | null> {
  const db = await getDatabase();
  const results = await db.executeSql(
    'SELECT value FROM einstellungen WHERE key = ?',
    [key],
  );
  if (results[0].rows.length > 0) {
    return results[0].rows.item(0).value;
  }
  return null;
}

/**
 * Einstellung speichern
 */
export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDatabase();
  await db.executeSql(
    'INSERT OR REPLACE INTO einstellungen (key, value) VALUES (?, ?)',
    [key, value],
  );
}

/**
 * Einstellung loeschen
 */
export async function deleteSetting(key: string): Promise<void> {
  const db = await getDatabase();
  await db.executeSql('DELETE FROM einstellungen WHERE key = ?', [key]);
}

/**
 * Alle Einstellungen einer Gruppe lesen (Key-Prefix)
 */
export async function getSettingsByPrefix(prefix: string): Promise<Record<string, string>> {
  const db = await getDatabase();
  const results = await db.executeSql(
    "SELECT key, value FROM einstellungen WHERE key LIKE ? || '%'",
    [prefix],
  );
  const map: Record<string, string> = {};
  for (let i = 0; i < results[0].rows.length; i++) {
    const row = results[0].rows.item(i);
    map[row.key] = row.value;
  }
  return map;
}
