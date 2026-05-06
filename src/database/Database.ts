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
const DATABASE_VERSION = 10; // V10: arzt_id in medikamente (Premium: Arzt-Zuordnung)

export interface MedikamentRow {
  id: string;
  name: string;
  zusatz: string;            // z.B. "Blutdrucksenker", "Schilddrüse"
  person_id: string;         // zugehoerige Person
  aktueller_bestand: number; // Float, z.B. 28.5
  einzeldosis: number;       // Float, z.B. 0.5
  einheit: string;           // 'Tabletten', 'Kapseln', etc.
  pzn: string;               // Pharmazentralnummer / Barcode
  packungsgroesse: number;   // Float – Anzahl Tabletten pro Packung
  warnung_ab_bestand: number; // Float – Schwelle für Nachbestell-Warnung
  sync_status: number;       // 0=lokal, 1=änderung ausstehend, 2=synchronisiert
  // Erinnerung & Auto-Abzug (V3)
  erinnerung_aktiv: number;     // 0=aus, 1=an
  einnahme_uhrzeiten: string;   // JSON-Array, z.B. '["08:00","20:00"]'
  auto_abzug_aktiv: number;     // 0=aus, 1=an – Bestand automatisch pro Einnahme abziehen
  arzt_id: string;              // verschreibender Arzt (Premium, '' = nicht zugeordnet)
  created_at: string;
  updated_at: string;
}

export interface EinnahmeRow {
  id: string;
  medikament_id: string;
  person_id: string;     // zugehoerige Person
  menge: number;      // Float – eingenommene Menge
  timestamp: string;  // ISO 8601
  notiz: string;
}

export interface ArztUrlaubRow {
  id: string;
  person_id: string;    // zugehoerige Person
  praxis_name: string;
  telefon?: string;       // Telefonnummer des Arztes (optional)
  urlaub_start: string; // ISO Date YYYY-MM-DD
  urlaub_ende: string;  // ISO Date YYYY-MM-DD
  created_at: string;
}

export interface ArztRow {
  id: string;
  name: string;          // Name der Praxis / des Arztes
  telefon: string;       // Telefonnummer
  adresse: string;       // Adresse (optional)
  fachgebiet: string;    // Fachgebiet (optional)
  created_at: string;
}

export interface PersonRow {
  id: string;
  name: string;            // z.B. "Daniel", "Mama"
  avatar_emoji: string;    // z.B. "👴" – vorgefertigte Auswahl
  avatar_uri: string;      // Pfad zum Foto in App-Sandbox (optional)
  ist_standard: number;    // 1 = Hauptperson, kann nicht geloescht werden
  created_at: string;
}

export interface PackungRow {
  id: string;
  medikament_id: string;
  groesse: number;           // REAL – Stück pro Packung (z.B. 50)
  pzn: string;               // PZN dieser spezifischen Packung
  ist_ersatzprodukt: number; // 0=Original, 1=Ersatzprodukt
  ersatz_name: string;       // Optional, z.B. "Ibuprofen AbZ 400"
  gekauft_am: string;        // ISO Date
  menge_verbleibend: number; // REAL – was noch übrig ist
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
        zusatz            TEXT NOT NULL DEFAULT '',
        aktueller_bestand REAL NOT NULL DEFAULT 0,
        einzeldosis       REAL NOT NULL DEFAULT 1.0,
        einheit           TEXT NOT NULL DEFAULT 'Tabletten',
        pzn               TEXT NOT NULL DEFAULT '',
        packungsgroesse   REAL NOT NULL DEFAULT 0,
        warnung_ab_bestand REAL NOT NULL DEFAULT 7.0,
        sync_status        INTEGER NOT NULL DEFAULT 0,
        erinnerung_aktiv   INTEGER NOT NULL DEFAULT 0,
        einnahme_uhrzeiten TEXT NOT NULL DEFAULT '[]',
        auto_abzug_aktiv   INTEGER NOT NULL DEFAULT 0,
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

    await this.db.executeSql(`
      CREATE TABLE IF NOT EXISTS aerzte (
        id          TEXT PRIMARY KEY NOT NULL,
        name        TEXT NOT NULL,
        telefon     TEXT NOT NULL DEFAULT '',
        adresse     TEXT NOT NULL DEFAULT '',
        fachgebiet  TEXT NOT NULL DEFAULT '',
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    await this.db.executeSql(`
      CREATE TABLE IF NOT EXISTS packungen (
        id                 TEXT PRIMARY KEY NOT NULL,
        medikament_id      TEXT NOT NULL,
        groesse            REAL NOT NULL,
        pzn                TEXT NOT NULL DEFAULT '',
        ist_ersatzprodukt  INTEGER NOT NULL DEFAULT 0,
        ersatz_name        TEXT NOT NULL DEFAULT '',
        gekauft_am         TEXT NOT NULL DEFAULT (datetime('now')),
        menge_verbleibend  REAL NOT NULL DEFAULT 0,
        FOREIGN KEY (medikament_id) REFERENCES medikamente(id) ON DELETE CASCADE
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
    await this.db.executeSql(
      `CREATE INDEX IF NOT EXISTS idx_medikamente_sync ON medikamente(sync_status);`
    );
    await this.db.executeSql(
      `CREATE INDEX IF NOT EXISTS idx_packungen_medikament ON packungen(medikament_id);`
    );

    // Einstellungen (Key-Value)
    await this.db.executeSql(`
      CREATE TABLE IF NOT EXISTS einstellungen (
        key   TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `);

    // Migrationen
    await this.migrateV1toV2();
    await this.migrateV2toV3();
    await this.migrateV3toV4();
    await this.migrateV4toV5();
    await this.migrateV5toV6();
    await this.migrateV6toV7();
    await this.migrateV7toV8();
    await this.migrateV8toV9();
    await this.migrateV9toV10();
  }

  /**
   * Migration V1 -> V2: sync_status Spalte für Cloud-Backup
   * Prueft ob die Spalte existiert und fuegt sie ggf. hinzu.
   */
  private async migrateV1toV2(): Promise<void> {
    if (!this.db) return;

    try {
      // Pruefe ob sync_status bereits existiert
      const result = await this.db.executeSql(
        `PRAGMA table_info(medikamente);`
      );
      const columns = result[0];
      const hasSyncStatus = columns.rows.raw().some(
        (col: any) => col.name === 'sync_status'
      );

      if (!hasSyncStatus) {
        await this.db.executeSql(
          `ALTER TABLE medikamente ADD COLUMN sync_status INTEGER NOT NULL DEFAULT 0;`
        );
        console.log('[DB] Migration V1->V2: sync_status Spalte hinzugefuegt');
      }
    } catch (error) {
      console.warn('[DB] Migration V1->V2 Pruefung:', error);
    }
  }

  /**
   * Migration V2 -> V3: Erinnerung + Auto-Abzug Felder
   */
  private async migrateV2toV3(): Promise<void> {
    if (!this.db) return;

    try {
      const result = await this.db.executeSql(
        `PRAGMA table_info(medikamente);`
      );
      const columns = result[0];
      const cols = columns.rows.raw().map((col: any) => col.name);

      if (!cols.includes('erinnerung_aktiv')) {
        await this.db.executeSql(
          `ALTER TABLE medikamente ADD COLUMN erinnerung_aktiv INTEGER NOT NULL DEFAULT 0;`
        );
      }
      if (!cols.includes('einnahme_uhrzeiten')) {
        await this.db.executeSql(
          `ALTER TABLE medikamente ADD COLUMN einnahme_uhrzeiten TEXT NOT NULL DEFAULT '[]';`
        );
      }
      if (!cols.includes('auto_abzug_aktiv')) {
        await this.db.executeSql(
          `ALTER TABLE medikamente ADD COLUMN auto_abzug_aktiv INTEGER NOT NULL DEFAULT 0;`
        );
      }
      console.log('[DB] Migration V2->V3: Erinnerung + Auto-Abzug Felder geprueft');
    } catch (error) {
      console.warn('[DB] Migration V2->V3 Pruefung:', error);
    }
  }

  /**
   * Migration V3 -> V4: Packungen-Tabelle anlegen
   */
  private async migrateV3toV4(): Promise<void> {
    if (!this.db) return;
    // CREATE TABLE IF NOT EXISTS ist sicher – macht nichts wenn Tabelle existiert
    try {
      await this.db.executeSql(`
        CREATE TABLE IF NOT EXISTS packungen (
          id                 TEXT PRIMARY KEY NOT NULL,
          medikament_id      TEXT NOT NULL,
          groesse            REAL NOT NULL,
          pzn                TEXT NOT NULL DEFAULT '',
          ist_ersatzprodukt  INTEGER NOT NULL DEFAULT 0,
          ersatz_name        TEXT NOT NULL DEFAULT '',
          gekauft_am         TEXT NOT NULL DEFAULT (datetime('now')),
          menge_verbleibend  REAL NOT NULL DEFAULT 0,
          FOREIGN KEY (medikament_id) REFERENCES medikamente(id) ON DELETE CASCADE
        );
      `);
      await this.db.executeSql(
        `CREATE INDEX IF NOT EXISTS idx_packungen_medikament ON packungen(medikament_id);`
      );
      console.log('[DB] Migration V3->V4: packungen Tabelle geprueft');
    } catch (error) {
      console.warn('[DB] Migration V3->V4 Pruefung:', error);
    }
  }

  /**
   * Migration V4 -> V5: Einstellungen-Tabelle anlegen
   */
  private async migrateV4toV5(): Promise<void> {
    if (!this.db) return;
    try {
      await this.db.executeSql(`
        CREATE TABLE IF NOT EXISTS einstellungen (
          key   TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );
      `);
      console.log('[DB] Migration V4->V5: einstellungen Tabelle geprueft');
    } catch (error) {
      console.warn('[DB] Migration V4->V5 Pruefung:', error);
    }
  }

  /**
   * Migration V5 -> V6: telefon Spalte in arzt_urlaub
   */
  private async migrateV5toV6(): Promise<void> {
    if (!this.db) return;
    try {
      const result = await this.db.executeSql(`PRAGMA table_info(arzt_urlaub);`);
      const columns = result[0];
      const cols = columns.rows.raw().map((col: any) => col.name);

      if (!cols.includes('telefon')) {
        await this.db.executeSql(
          `ALTER TABLE arzt_urlaub ADD COLUMN telefon TEXT NOT NULL DEFAULT '';`
        );
        console.log('[DB] Migration V5->V6: telefon Spalte in arzt_urlaub hinzugefuegt');
      }
    } catch (error) {
      console.warn('[DB] Migration V5->V6 Pruefung:', error);
    }
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

  /**
   * Migration V6 -> V7: aerzte Tabelle fuer Arztkontaktdaten
   */
  private async migrateV6toV7(): Promise<void> {
    if (!this.db) return;
    try {
      await this.db.executeSql(`SELECT id FROM aerzte LIMIT 1`);
    } catch {
      await this.db.executeSql(`
        CREATE TABLE IF NOT EXISTS aerzte (
          id          TEXT PRIMARY KEY NOT NULL,
          name        TEXT NOT NULL,
          telefon     TEXT NOT NULL DEFAULT '',
          adresse     TEXT NOT NULL DEFAULT '',
          fachgebiet  TEXT NOT NULL DEFAULT '',
          created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
      console.log('[DB] Migration V6->V7: aerzte Tabelle erstellt');
    }
  }

  /**
   * Migration V7 -> V8: zusatz Spalte in medikamente (Wirkstoff-Alias)
   */
  private async migrateV7toV8(): Promise<void> {
    if (!this.db) return;
    try {
      const result = await this.db.executeSql(`PRAGMA table_info(medikamente);`);
      const columns: string[] = [];
      result.forEach((r: any) => {
        for (let i = 0; i < r.rows.length; i++) {
          columns.push(r.rows.item(i).name);
        }
      });
      if (!columns.includes('zusatz')) {
        await this.db.executeSql(
          `ALTER TABLE medikamente ADD COLUMN zusatz TEXT NOT NULL DEFAULT '';`
        );
        console.log('[DB] Migration V7->V8: zusatz Spalte in medikamente hinzugefuegt');
      }
    } catch (error) {
      console.warn('[DB] Migration V7->V8 Pruefung:', error);
    }
  }

  /**
   * Migration V8 -> V9: personen Tabelle + person_id in bestehenden Tabellen
   */
  private async migrateV8toV9(): Promise<void> {
    if (!this.db) return;
    try {
      // 1. personen Tabelle erstellen
      try {
        await this.db.executeSql(`SELECT id FROM personen LIMIT 1`);
      } catch {
        await this.db.executeSql(`
          CREATE TABLE IF NOT EXISTS personen (
            id            TEXT PRIMARY KEY NOT NULL,
            name          TEXT NOT NULL,
            avatar_emoji  TEXT NOT NULL DEFAULT '👤',
            avatar_uri    TEXT NOT NULL DEFAULT '',
            ist_standard  INTEGER NOT NULL DEFAULT 0,
            created_at    TEXT NOT NULL DEFAULT (datetime('now'))
          );
        `);
        // Default-Person anlegen
        await this.db.executeSql(
          `INSERT INTO personen (id, name, avatar_emoji, ist_standard) VALUES (?, 'Ich', '👤', 1);`,
          ['person-default-001']
        );
        console.log('[DB] Migration V8->V9: personen Tabelle + Default-Person erstellt');
      }

      // 2. person_id in medikamente
      const medCols = await this.getColumnNames('medikamente');
      if (!medCols.includes('person_id')) {
        await this.db.executeSql(
          `ALTER TABLE medikamente ADD COLUMN person_id TEXT NOT NULL DEFAULT 'person-default-001';`
        );
      }

      // 3. person_id in einnahmen
      const einCols = await this.getColumnNames('einnahmen');
      if (!einCols.includes('person_id')) {
        await this.db.executeSql(
          `ALTER TABLE einnahmen ADD COLUMN person_id TEXT NOT NULL DEFAULT 'person-default-001';`
        );
      }

      // 4. person_id in arzt_urlaub
      const urlCols = await this.getColumnNames('arzt_urlaub');
      if (!urlCols.includes('person_id')) {
        await this.db.executeSql(
          `ALTER TABLE arzt_urlaub ADD COLUMN person_id TEXT NOT NULL DEFAULT 'person-default-001';`
        );
      }

      // 5. Indices
      await this.db.executeSql(
        `CREATE INDEX IF NOT EXISTS idx_medikamente_person ON medikamente(person_id);`
      );
      await this.db.executeSql(
        `CREATE INDEX IF NOT EXISTS idx_einnahmen_person ON einnahmen(person_id);`
      );

      console.log('[DB] Migration V8->V9: person_id Spalten + Indices hinzugefuegt');
    } catch (error) {
      console.warn('[DB] Migration V8->V9 Pruefung:', error);
    }
  }

  /** Helper: Spaltennamen einer Tabelle lesen */
  private async getColumnNames(table: string): Promise<string[]> {
    if (!this.db) return [];
    const result = await this.db.executeSql(`PRAGMA table_info(${table});`);
    const columns: string[] = [];
    result.forEach((r: any) => {
      for (let i = 0; i < r.rows.length; i++) {
        columns.push(r.rows.item(i).name);
      }
    });
    return columns;
  }

  /**
   * Migration V9 -> V10: arzt_id in medikamente (Arzt-Zuordnung, Premium)
   */
  private async migrateV9toV10(): Promise<void> {
    const medCols = await this.getColumnNames('medikamente');
    if (!medCols.includes('arzt_id')) {
      await this.db!.executeSql(
        `ALTER TABLE medikamente ADD COLUMN arzt_id TEXT NOT NULL DEFAULT '';`
      );
      console.log('[DB] Migration V9->V10: arzt_id Spalte in medikamente hinzugefuegt');
    }
  }
}

// Singleton-Export
export const database = new Database();

/**
 * Async-Helper: Gibt die initialisierte DB-Instanz zurueck.
 * Verwendet in Services die keine eigene DB-Referenz halten.
 */
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  return database.init();
}
