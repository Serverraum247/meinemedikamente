/**
 * Database.ts – SQLite-Datenbankanbindung für "Meine Medikamente"
 *
 * WICHTIG: aktueller_bestand und einzeldosis sind REAL (Float),
 * damit halbe Tabletten (0.5) korrekt gespeichert werden.
 */

import SQLite from 'react-native-sqlite-storage';

// SQLite-Debug-Flags aktivieren (nur Entwicklung)
SQLite.DEBUG(true);
SQLite.enablePromise(true);

const DATABASE_NAME = 'meine_medikamente.db';
const DATABASE_VERSION = 1;

export interface MedikamentRow {
  id: string;
  name: string;
  aktueller_bestand: number; // Float, z.B. 28.5
  einzeldosis: number;       // Float, z.B. 0.5
  einheit: string;           // 'Tabletten', 'Kapseln', etc.
  pzn: string;               // Pharmazentralnummer / Barcode
  packungsgroesse: number;   // Float – Anzahl Tabletten pro Packung
  warnung_ab_bestand: number; // Float – Schwelle für Nachbestell-Warnung
  created_at: string;
  updated_at: string;
}

export interface EinnahmeRow {
  id: string;
  medikament_id: string;
  menge: number;      // Float – eingenommene Menge
  timestamp: string;  // ISO 8601
  notiz: string;
}

export interface ArztUrlaubRow {
  id: string;
  praxis_name: string;
  urlaub_start: string; // ISO Date YYYY-MM-DD
  urlaub_ende: string;  // ISO Date YYYY-MM-DD
  created_at: string;
}

class Database {
  private db: SQLite.SQLiteDatabase | null = null;

  /**
   * Datenbank öffnen und Schema initialisieren
   */
  async init(): Promise<SQLite.SQLiteDatabase> {
    if (this.db) {
      return this.db;
    }

    this.db = await SQLite.openDatabase({
      name: DATABASE_NAME,
      location: 'default',
    });

    await this.createSchema();
    console.log('[DB] Datenbank erfolgreich initialisiert');
    return this.db;
  }

  /**
   * Schema-Erstellung – alle Tabellen mit REAL-Spalten für Float-Werte
   */
  private async createSchema(): Promise<void> {
    if (!this.db) throw new Error('Datenbank nicht geöffnet');

    await this.db.executeSql(`
      CREATE TABLE IF NOT EXISTS medikamente (
        id                TEXT PRIMARY KEY NOT NULL,
        name              TEXT NOT NULL,
        aktueller_bestand REAL NOT NULL DEFAULT 0,
        einzeldosis       REAL NOT NULL DEFAULT 1.0,
        einheit           TEXT NOT NULL DEFAULT 'Tabletten',
        pzn               TEXT NOT NULL DEFAULT '',
        packungsgroesse   REAL NOT NULL DEFAULT 0,
        warnung_ab_bestand REAL NOT NULL DEFAULT 7.0,
        created_at        TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    await this.db.executeSql(`
      CREATE TABLE IF NOT EXISTS einnahmen (
        id              TEXT PRIMARY KEY NOT NULL,
        medikament_id   TEXT NOT NULL,
        menge           REAL NOT NULL,
        timestamp       TEXT NOT NULL DEFAULT (datetime('now')),
        notiz           TEXT NOT NULL DEFAULT '',
        FOREIGN KEY (medikament_id) REFERENCES medikamente(id) ON DELETE CASCADE
      );
    `);

    await this.db.executeSql(`
      CREATE TABLE IF NOT EXISTS arzt_urlaub (
        id          TEXT PRIMARY KEY NOT NULL,
        praxis_name TEXT NOT NULL,
        urlaub_start TEXT NOT NULL,
        urlaub_ende  TEXT NOT NULL,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // Indices für Performance
    await this.db.executeSql(
      `CREATE INDEX IF NOT EXISTS idx_einnahmen_medikament ON einnahmen(medikament_id);`
    );
    await this.db.executeSql(
      `CREATE INDEX IF NOT EXISTS idx_einnahmen_timestamp ON einnahmen(timestamp);`
    );
    await this.db.executeSql(
      `CREATE INDEX IF NOT EXISTS idx_medikamente_pzn ON medikamente(pzn);`
    );
  }

  /**
   * Datenbank-Instanz abrufen (muss zuvor init() aufgerufen haben)
   */
  getDatabase(): SQLite.SQLiteDatabase {
    if (!this.db) throw new Error('Datenbank nicht initialisiert – erst init() aufrufen');
    return this.db;
  }

  /**
   * Datenbank schließen
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
      console.log('[DB] Datenbank geschlossen');
    }
  }
}

// Singleton-Export
export const database = new Database();
