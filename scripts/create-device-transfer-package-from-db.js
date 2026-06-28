#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const CryptoJS = require('crypto-js');

const { version: APP_VERSION } = require('../package.json');

const TRANSFER_FORMAT_VERSION = 1;
const DB_SCHEMA_VERSION = 17;
const MIN_SUPPORTED_IMPORTER_VERSION = 1;
const DEFAULT_KDF_ITERATIONS = 120000;

const FILE_EXTENSION = 'mmptransfer';

const TABLE_COLUMNS = {
  personen: ['id', 'name', 'avatar_emoji', 'avatar_uri', 'ist_standard', 'created_at'],
  medikamente: [
    'id',
    'name',
    'zusatz',
    'person_id',
    'aktueller_bestand',
    'einzeldosis',
    'einheit',
    'pzn',
    'packungsgroesse',
    'warnung_ab_bestand',
    'sync_status',
    'erinnerung_aktiv',
    'einnahme_uhrzeiten',
    'auto_abzug_aktiv',
    'fruehe_einnahme_erlaubt',
    'arzt_id',
    'staerke_wert',
    'staerke_einheit',
    'created_at',
    'updated_at',
  ],
  packungen: [
    'id',
    'medikament_id',
    'groesse',
    'pzn',
    'ist_ersatzprodukt',
    'ersatz_name',
    'gekauft_am',
    'menge_verbleibend',
  ],
  einnahmen: ['id', 'medikament_id', 'person_id', 'menge', 'timestamp', 'slot', 'notiz'],
  arzt_urlaub: [
    'id',
    'person_id',
    'arzt_id',
    'praxis_name',
    'telefon',
    'urlaub_start',
    'urlaub_ende',
    'created_at',
  ],
  aerzte: [
    'id',
    'name',
    'telefon_landesvorwahl',
    'telefon',
    'email',
    'adresse',
    'plz',
    'ort',
    'land',
    'fachgebiet',
    'created_at',
  ],
  einstellungen: ['key', 'value'],
};

const EXPORT_TABLES = [
  'personen',
  'medikamente',
  'packungen',
  'einnahmen',
  'arzt_urlaub',
  'aerzte',
  'einstellungen',
];

const NON_PORTABLE_SETTING_KEYS = new Set([
  'premium_aktiv',
  'dev_premium_override',
  'premium_scans_date',
  'premium_calendar_month',
]);

const NON_PORTABLE_SETTING_PREFIXES = [
  'rezept_termin:',
  'urlaubs_erinnerung_erledigt:',
  'urlaubs_erinnerung_spaeter:',
  'einnahme_erinnerung_letzter_',
];

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    process.exit(0);
  }

  if (!options.dbPath) {
    printUsage('Fehlender Parameter: --db /pfad/zur/meine_medikamente.db');
    process.exit(1);
  }

  const dbPath = path.resolve(options.dbPath);
  if (!fs.existsSync(dbPath)) {
    console.error(`Datenbank nicht gefunden: ${dbPath}`);
    process.exit(1);
  }

  const archive = collectPortableData(dbPath, options);
  validateArchive(archive);

  const securityCode = options.securityCode || generateSecurityCode();
  const packageText = encryptArchive(archive, securityCode, {
    iterations: options.iterations,
  });

  if (options.verify) {
    verifyPackage(packageText, securityCode, archive);
  }

  const outputPath = path.resolve(
    options.outputPath || buildDefaultOutputPath(dbPath, archive.manifest.createdAt),
  );
  fs.writeFileSync(outputPath, packageText, 'utf8');

  const preview = buildPreview(archive);
  console.log(`Sicheres Paket geschrieben: ${outputPath}`);
  console.log(`Sicherheitscode: ${securityCode}`);
  console.log(`Erstellt am: ${archive.manifest.createdAt}`);
  console.log(
    `Inhalt: ${preview.personCount} Personen, ${preview.medicationCount} Medikamente, ${preview.packageCount} Packungen, ${preview.intakeCount} Einnahmen, ${preview.doctorCount} Ärzte`,
  );
}

function parseArgs(argv) {
  const options = {
    help: false,
    verify: false,
    dbPath: '',
    outputPath: '',
    securityCode: '',
    appVersion: APP_VERSION,
    platform: 'android-db-import',
    iterations: DEFAULT_KDF_ITERATIONS,
    createdAt: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--verify':
        options.verify = true;
        break;
      case '--db':
        options.dbPath = next || '';
        index += 1;
        break;
      case '--out':
        options.outputPath = next || '';
        index += 1;
        break;
      case '--code':
        options.securityCode = normalizeSecurityCode(next || '');
        index += 1;
        break;
      case '--app-version':
        options.appVersion = next || APP_VERSION;
        index += 1;
        break;
      case '--platform':
        options.platform = next || options.platform;
        index += 1;
        break;
      case '--iterations':
        options.iterations = Number(next || DEFAULT_KDF_ITERATIONS);
        index += 1;
        break;
      case '--created-at':
        options.createdAt = next || '';
        index += 1;
        break;
      default:
        printUsage(`Unbekannter Parameter: ${arg}`);
        process.exit(1);
    }
  }

  return options;
}

function printUsage(errorMessage) {
  if (errorMessage) {
    console.error(errorMessage);
    console.error('');
  }
  console.error(`Verwendung:
  node scripts/create-device-transfer-package-from-db.js --db /pfad/zur/meine_medikamente.db [optionen]

Optionen:
  --out /pfad/datei.${FILE_EXTENSION}   Ausgabedatei
  --code XXXX-XXXX-...                  Fester Sicherheitscode
  --verify                              Paket nach dem Erzeugen lokal gegenprüfen
  --app-version 0.1.60                 Absender-App-Version im Manifest
  --platform android-db-import         Plattform-Hinweis im Manifest
  --iterations 120000                  PBKDF2-Iterationen
  --created-at 2026-06-13T12:00:00Z    Zeitstempel im Manifest
  --help                               Diese Hilfe anzeigen`);
}

function collectPortableData(dbPath, options) {
  const data = createEmptyRows();
  for (const table of EXPORT_TABLES) {
    const rows = readWhitelistedRows(dbPath, table);
    data[table] = table === 'einstellungen' ? rows.filter(isPortableSettingRow) : normalizeRows(table, rows);
  }

  const createdAt = options.createdAt || new Date(fs.statSync(dbPath).mtimeMs || Date.now()).toISOString();
  return {
    manifest: {
      transferFormatVersion: TRANSFER_FORMAT_VERSION,
      appVersion: options.appVersion,
      dbSchemaVersion: DB_SCHEMA_VERSION,
      minSupportedImporterVersion: MIN_SUPPORTED_IMPORTER_VERSION,
      createdAt,
      platform: options.platform,
      tables: buildTableStats(data),
    },
    data,
  };
}

function readWhitelistedRows(dbPath, table) {
  const availableColumns = getAvailableColumns(dbPath, table);
  if (availableColumns.length === 0) return [];

  const selectedColumns = TABLE_COLUMNS[table].filter(column => availableColumns.includes(column));
  if (selectedColumns.length === 0) return [];

  return runSqliteJson(dbPath, `SELECT ${selectedColumns.join(', ')} FROM ${table}`);
}

function getAvailableColumns(dbPath, table) {
  try {
    return runSqliteJson(dbPath, `PRAGMA table_info(${table})`).map(column => String(column.name));
  } catch {
    return [];
  }
}

function runSqliteJson(dbPath, sql) {
  const output = execFileSync('/usr/bin/sqlite3', ['-json', dbPath, sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  if (!output) return [];
  return JSON.parse(output);
}

function normalizeRows(table, rows) {
  if (table !== 'personen') return rows;
  return rows.map(row => ({
    ...row,
    avatar_uri: '',
  }));
}

function isPortableSettingRow(row) {
  const key = String(row.key || '');
  if (!key) return false;
  if (NON_PORTABLE_SETTING_KEYS.has(key)) return false;
  return !NON_PORTABLE_SETTING_PREFIXES.some(prefix => key.startsWith(prefix));
}

function validateArchive(archive) {
  if (!archive || !archive.manifest || !archive.data) {
    throw new Error('Archivdaten fehlen oder sind beschädigt.');
  }
  if (archive.manifest.transferFormatVersion > TRANSFER_FORMAT_VERSION) {
    throw new Error('Archivformat wird von dieser App-Version nicht unterstützt.');
  }

  for (const table of EXPORT_TABLES) {
    if (!Array.isArray(archive.data[table])) {
      throw new Error(`Ungültige Tabelle im Archiv: ${table}`);
    }
    const allowedColumns = new Set(TABLE_COLUMNS[table]);
    for (const row of archive.data[table]) {
      for (const key of Object.keys(row)) {
        if (!allowedColumns.has(key)) {
          throw new Error(`Unbekanntes Feld im Archiv: ${table}.${key}`);
        }
      }
    }
  }

  validateReferences(archive.data);
}

function validateReferences(data) {
  const personIds = new Set(data.personen.map(row => String(row.id)));
  const medicationIds = new Set(data.medikamente.map(row => String(row.id)));
  const doctorIds = new Set(data.aerzte.map(row => String(row.id)));

  for (const medication of data.medikamente) {
    if (!personIds.has(String(medication.person_id))) {
      throw new Error('Ein Medikament verweist auf eine unbekannte Person.');
    }
    const doctorId = String(medication.arzt_id || '');
    if (doctorId && !doctorIds.has(doctorId)) {
      throw new Error('Ein Medikament verweist auf einen unbekannten Arzt.');
    }
  }

  for (const intake of data.einnahmen) {
    if (!medicationIds.has(String(intake.medikament_id))) {
      throw new Error('Eine Einnahme verweist auf ein unbekanntes Medikament.');
    }
    if (!personIds.has(String(intake.person_id))) {
      throw new Error('Eine Einnahme verweist auf eine unbekannte Person.');
    }
  }

  for (const packageRow of data.packungen) {
    if (!medicationIds.has(String(packageRow.medikament_id))) {
      throw new Error('Eine Packung verweist auf ein unbekanntes Medikament.');
    }
  }

  for (const vacation of data.arzt_urlaub) {
    if (!personIds.has(String(vacation.person_id))) {
      throw new Error('Ein Arzt-Urlaub verweist auf eine unbekannte Person.');
    }
    const doctorId = String(vacation.arzt_id || '');
    if (doctorId && !doctorIds.has(doctorId)) {
      throw new Error('Ein Arzt-Urlaub verweist auf einen unbekannten Arzt.');
    }
  }
}

function encryptArchive(archive, securityCode, options = {}) {
  const iterations = options.iterations || DEFAULT_KDF_ITERATIONS;
  const salt = crypto.randomBytes(16).toString('base64');
  const iv = crypto.randomBytes(16).toString('base64');
  const header = {
    ...archive.manifest,
    encryption: {
      algorithm: 'AES-256-CBC-HMAC-SHA256',
      kdf: 'PBKDF2-HMAC-SHA256',
      iterations,
      salt,
      iv,
    },
  };

  const headerText = CryptoJS.enc.Utf8.parse(JSON.stringify(header)).toString(CryptoJS.enc.Base64);
  const keyMaterial = deriveKeys(securityCode, salt, iterations);
  const ciphertext = CryptoJS.AES.encrypt(JSON.stringify(archive), keyMaterial.encryptionKey, {
    iv: CryptoJS.enc.Base64.parse(iv),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  }).toString();
  const mac = CryptoJS.HmacSHA256(`${headerText}.${ciphertext}`, keyMaterial.macKey).toString(CryptoJS.enc.Hex);

  return JSON.stringify(
    {
      magic: 'MEIN_MEDIPLAN_TRANSFER',
      header: headerText,
      ciphertext,
      mac,
    },
    null,
    2,
  );
}

function verifyPackage(packageText, securityCode, originalArchive) {
  const parsedPackage = JSON.parse(packageText);
  const header = JSON.parse(CryptoJS.enc.Base64.parse(parsedPackage.header).toString(CryptoJS.enc.Utf8));
  const keyMaterial = deriveKeys(securityCode, header.encryption.salt, header.encryption.iterations);
  const mac = CryptoJS.HmacSHA256(
    `${parsedPackage.header}.${parsedPackage.ciphertext}`,
    keyMaterial.macKey,
  ).toString(CryptoJS.enc.Hex);

  if (mac !== parsedPackage.mac) {
    throw new Error('Die lokale Gegenprüfung des MAC ist fehlgeschlagen.');
  }

  const decrypted = CryptoJS.AES.decrypt(parsedPackage.ciphertext, keyMaterial.encryptionKey, {
    iv: CryptoJS.enc.Base64.parse(header.encryption.iv),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  }).toString(CryptoJS.enc.Utf8);

  const verifiedArchive = JSON.parse(decrypted);
  if (JSON.stringify(verifiedArchive) !== JSON.stringify(originalArchive)) {
    throw new Error('Die lokale Gegenprüfung des Paketinhalts ist fehlgeschlagen.');
  }
}

function deriveKeys(securityCode, salt, iterations) {
  const keyMaterial = CryptoJS.PBKDF2(securityCode.trim(), CryptoJS.enc.Base64.parse(salt), {
    keySize: 512 / 32,
    iterations,
    hasher: CryptoJS.algo.SHA256,
  });

  return {
    encryptionKey: CryptoJS.lib.WordArray.create(keyMaterial.words.slice(0, 8), 32),
    macKey: CryptoJS.lib.WordArray.create(keyMaterial.words.slice(8, 16), 32),
  };
}

function buildTableStats(data) {
  return EXPORT_TABLES.reduce((accumulator, table) => {
    const serialized = JSON.stringify(data[table]);
    accumulator[table] = {
      rows: data[table].length,
      checksum: CryptoJS.SHA256(serialized).toString(CryptoJS.enc.Hex),
    };
    return accumulator;
  }, {});
}

function buildPreview(archive) {
  return {
    personCount: archive.data.personen.length,
    medicationCount: archive.data.medikamente.length,
    doctorCount: archive.data.aerzte.length,
    intakeCount: archive.data.einnahmen.length,
    packageCount: archive.data.packungen.length,
  };
}

function createEmptyRows() {
  return {
    personen: [],
    medikamente: [],
    packungen: [],
    einnahmen: [],
    arzt_urlaub: [],
    aerzte: [],
    einstellungen: [],
  };
}

function generateSecurityCode() {
  return normalizeSecurityCode(crypto.randomBytes(16).toString('hex'));
}

function normalizeSecurityCode(value) {
  return value
    .trim()
    .replace(/[^0-9a-fA-F]/g, '')
    .toUpperCase()
    .replace(/(.{4})/g, '$1-')
    .replace(/-$/, '');
}

function buildDefaultOutputPath(dbPath, createdAt) {
  const date = new Date(createdAt);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const directory = path.dirname(dbPath);
  return path.join(directory, `mein-mediplan-transfer-${year}-${month}-${day}.${FILE_EXTENSION}`);
}

main();
