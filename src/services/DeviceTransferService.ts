import { NativeModules, Platform } from 'react-native';
import CryptoJS from 'crypto-js';

import { getDatabase, type MedikamentRow } from '../database/Database';
import { planeAlleErinnerungen } from './ErinnerungsService';
import { version as APP_VERSION } from '../../package.json';

const TRANSFER_FORMAT_VERSION = 1;
const DB_SCHEMA_VERSION = 17;
const MIN_SUPPORTED_IMPORTER_VERSION = 1;
const FILE_EXTENSION = 'mmptransfer';
const DEFAULT_KDF_ITERATIONS = 120000;

type TableName =
  | 'personen'
  | 'medikamente'
  | 'packungen'
  | 'einnahmen'
  | 'arzt_urlaub'
  | 'aerzte'
  | 'einstellungen';

type TransferRows = Record<TableName, Array<Record<string, unknown>>>;

interface NativeDeviceTransferFileModule {
  shareTransferFile?: (fileName: string, content: string) => Promise<boolean>;
  pickTransferFile?: () => Promise<string | null>;
  randomBytes?: (byteCount: number) => Promise<string>;
}

const { DeviceTransferFile } = NativeModules as {
  DeviceTransferFile?: NativeDeviceTransferFileModule;
};

const TABLE_COLUMNS: Record<TableName, string[]> = {
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

const EXPORT_TABLES: TableName[] = [
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

export interface DeviceTransferManifest {
  transferFormatVersion: number;
  appVersion: string;
  dbSchemaVersion: number;
  minSupportedImporterVersion: number;
  createdAt: string;
  platform: string;
  tables: Record<TableName, { rows: number; checksum: string }>;
  encryption: {
    algorithm: 'AES-256-CBC-HMAC-SHA256';
    kdf: 'PBKDF2-HMAC-SHA256';
    iterations: number;
    salt: string;
    iv: string;
  };
}

export interface DeviceTransferArchive {
  manifest: Omit<DeviceTransferManifest, 'encryption'>;
  data: TransferRows;
}

export interface DeviceTransferPackage {
  magic: 'MEIN_MEDIPLAN_TRANSFER';
  header: string;
  ciphertext: string;
  mac: string;
}

export interface DeviceTransferExport {
  fileName: string;
  packageText: string;
  securityCode: string;
  preview: DeviceTransferPreview;
}

export interface DeviceTransferPreview {
  createdAt: string;
  appVersion: string;
  platform: string;
  personCount: number;
  medicationCount: number;
  doctorCount: number;
  intakeCount: number;
  packageCount: number;
  activeReminderCount: number;
}

export interface CryptoOptions {
  iterations?: number;
  now?: Date;
  saltBase64?: string;
  ivBase64?: string;
}

export async function createDeviceTransferExport(options: CryptoOptions = {}): Promise<DeviceTransferExport> {
  const archive = await collectPortableData(options.now ?? new Date());
  const securityCode = await generateSecurityCode();
  const packageText = encryptArchive(archive, securityCode, await createArchiveCryptoOptions(options));
  const preview = buildPreview(archive);
  return {
    fileName: buildTransferFileName(options.now ?? new Date()),
    packageText,
    securityCode,
    preview,
  };
}

export async function createArchiveCryptoOptions(options: CryptoOptions = {}): Promise<CryptoOptions> {
  const [saltBase64, ivBase64] = await Promise.all([
    options.saltBase64 ? Promise.resolve(options.saltBase64) : getSecureRandomBase64(16),
    options.ivBase64 ? Promise.resolve(options.ivBase64) : getSecureRandomBase64(16),
  ]);
  return {
    ...options,
    saltBase64,
    ivBase64,
  };
}

export async function shareDeviceTransferFile(fileName: string, packageText: string): Promise<boolean> {
  if (!DeviceTransferFile?.shareTransferFile) {
    throw new Error('Sicheres Paket kann auf diesem Gerät noch nicht geteilt werden.');
  }
  return DeviceTransferFile.shareTransferFile(fileName, packageText);
}

export async function pickDeviceTransferFile(): Promise<string | null> {
  if (!DeviceTransferFile?.pickTransferFile) {
    throw new Error('Dateiauswahl ist auf diesem Gerät noch nicht verfügbar.');
  }
  return DeviceTransferFile.pickTransferFile();
}

export function previewDeviceTransferPackage(packageText: string, securityCode: string): DeviceTransferPreview {
  const archive = decryptArchive(packageText, securityCode);
  validateArchive(archive);
  return buildPreview(archive);
}

export async function restoreDeviceTransferPackage(
  packageText: string,
  securityCode: string,
): Promise<DeviceTransferPreview> {
  const archive = decryptArchive(packageText, securityCode);
  validateArchive(archive);
  const preview = buildPreview(archive);
  await replaceLocalDataAtomically(archive);
  await rescheduleImportedReminders(archive);
  return preview;
}

export function decryptArchive(packageText: string, securityCode: string): DeviceTransferArchive {
  let parsed: DeviceTransferPackage;
  try {
    parsed = JSON.parse(packageText) as DeviceTransferPackage;
  } catch {
    throw new Error('Das sichere Paket ist beschädigt oder unvollständig.');
  }

  if (parsed.magic !== 'MEIN_MEDIPLAN_TRANSFER' || !parsed.header || !parsed.ciphertext || !parsed.mac) {
    throw new Error('Das sichere Paket hat ein unbekanntes Format.');
  }

  const header = parseHeader(parsed.header);
  const keyMaterial = deriveKeys(securityCode, header.encryption.salt, header.encryption.iterations);
  const expectedMac = CryptoJS.HmacSHA256(`${parsed.header}.${parsed.ciphertext}`, keyMaterial.macKey).toString(CryptoJS.enc.Hex);
  if (!constantTimeEqual(expectedMac, parsed.mac)) {
    throw new Error('Der Sicherheitscode passt nicht zu diesem sicheren Paket.');
  }

  const decrypted = CryptoJS.AES.decrypt(parsed.ciphertext, keyMaterial.encryptionKey, {
    iv: CryptoJS.enc.Base64.parse(header.encryption.iv),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  }).toString(CryptoJS.enc.Utf8);

  if (!decrypted) {
    throw new Error('Das sichere Paket konnte nicht gelesen werden.');
  }

  const archive = JSON.parse(decrypted) as DeviceTransferArchive;
  return archive;
}

export function encryptArchive(
  archive: DeviceTransferArchive,
  securityCode: string,
  options: CryptoOptions = {},
): string {
  validateArchive(archive);
  const iterations = options.iterations ?? DEFAULT_KDF_ITERATIONS;
  const salt = options.saltBase64 ?? randomWordArrayForTests(16).toString(CryptoJS.enc.Base64);
  const iv = options.ivBase64 ?? randomWordArrayForTests(16).toString(CryptoJS.enc.Base64);
  const header: DeviceTransferManifest = {
    ...archive.manifest,
    encryption: {
      algorithm: 'AES-256-CBC-HMAC-SHA256',
      kdf: 'PBKDF2-HMAC-SHA256',
      iterations,
      salt,
      iv,
    },
  };
  const headerText = wordArrayToBase64(CryptoJS.enc.Utf8.parse(JSON.stringify(header)));
  const keyMaterial = deriveKeys(securityCode, salt, iterations);
  const ciphertext = CryptoJS.AES.encrypt(JSON.stringify(archive), keyMaterial.encryptionKey, {
    iv: CryptoJS.enc.Base64.parse(iv),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  }).toString();
  const mac = CryptoJS.HmacSHA256(`${headerText}.${ciphertext}`, keyMaterial.macKey).toString(CryptoJS.enc.Hex);

  return JSON.stringify({
    magic: 'MEIN_MEDIPLAN_TRANSFER',
    header: headerText,
    ciphertext,
    mac,
  } satisfies DeviceTransferPackage);
}

export async function collectPortableData(now: Date = new Date()): Promise<DeviceTransferArchive> {
  const data = createEmptyRows();
  for (const table of EXPORT_TABLES) {
    const rows = await readWhitelistedRows(table);
    data[table] = table === 'einstellungen' ? rows.filter(isPortableSettingRow) : normalizeRows(table, rows);
  }

  const manifest = {
    transferFormatVersion: TRANSFER_FORMAT_VERSION,
    appVersion: APP_VERSION,
    dbSchemaVersion: DB_SCHEMA_VERSION,
    minSupportedImporterVersion: MIN_SUPPORTED_IMPORTER_VERSION,
    createdAt: now.toISOString(),
    platform: Platform.OS,
    tables: buildTableStats(data),
  };

  return { manifest, data };
}

function parseHeader(header: string): DeviceTransferManifest {
  try {
    return JSON.parse(CryptoJS.enc.Base64.parse(header).toString(CryptoJS.enc.Utf8)) as DeviceTransferManifest;
  } catch {
    throw new Error('Das sichere Paket hat beschädigte Kopfdaten.');
  }
}

function deriveKeys(securityCode: string, salt: string, iterations: number): { encryptionKey: CryptoJS.lib.WordArray; macKey: CryptoJS.lib.WordArray } {
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

function validateArchive(archive: DeviceTransferArchive): void {
  if (!archive?.manifest || !archive?.data) {
    throw new Error('Das sichere Paket enthält keine gültigen Daten.');
  }
  if (archive.manifest.transferFormatVersion > TRANSFER_FORMAT_VERSION) {
    throw new Error('Dieses sichere Paket wurde mit einer neueren App-Version erstellt.');
  }
  for (const table of EXPORT_TABLES) {
    if (!Array.isArray(archive.data[table])) {
      throw new Error(`Das sichere Paket enthält keine gültige Tabelle: ${table}`);
    }
    for (const row of archive.data[table]) {
      const allowed = new Set(TABLE_COLUMNS[table]);
      for (const key of Object.keys(row)) {
        if (!allowed.has(key)) {
          throw new Error(`Das sichere Paket enthält ein unbekanntes Feld: ${table}.${key}`);
        }
      }
    }
  }
  validateReferences(archive.data);
}

function validateReferences(data: TransferRows): void {
  const personIds = new Set(data.personen.map(row => String(row.id)));
  const medicationIds = new Set(data.medikamente.map(row => String(row.id)));

  for (const medication of data.medikamente) {
    if (!personIds.has(String(medication.person_id))) {
      throw new Error('Ein Medikament verweist auf eine unbekannte Person.');
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
}

async function readWhitelistedRows(table: TableName): Promise<Array<Record<string, unknown>>> {
  const db = await getDatabase();
  const availableColumns = await getAvailableColumns(table);
  if (availableColumns.length === 0) return [];
  const selectedColumns = TABLE_COLUMNS[table].filter(column => availableColumns.includes(column));
  if (selectedColumns.length === 0) return [];
  const result = await db.executeSql(`SELECT ${selectedColumns.join(', ')} FROM ${table}`);
  const rows: Array<Record<string, unknown>> = [];
  for (let i = 0; i < result[0].rows.length; i++) {
    rows.push(result[0].rows.item(i));
  }
  return rows;
}

async function getAvailableColumns(table: TableName): Promise<string[]> {
  try {
    const db = await getDatabase();
    const result = await db.executeSql(`PRAGMA table_info(${table})`);
    const columns: string[] = [];
    for (let i = 0; i < result[0].rows.length; i++) {
      columns.push(result[0].rows.item(i).name);
    }
    return columns;
  } catch {
    return [];
  }
}

function normalizeRows(table: TableName, rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  if (table !== 'personen') return rows;
  return rows.map(row => ({
    ...row,
    avatar_uri: '',
  }));
}

function isPortableSettingRow(row: Record<string, unknown>): boolean {
  const key = String(row.key ?? '');
  if (!key) return false;
  if (NON_PORTABLE_SETTING_KEYS.has(key)) return false;
  return !NON_PORTABLE_SETTING_PREFIXES.some(prefix => key.startsWith(prefix));
}

async function replaceLocalDataAtomically(archive: DeviceTransferArchive): Promise<void> {
  const db = await getDatabase();
  await new Promise<void>((resolve, reject) => {
    db.transaction(
      tx => {
        for (const table of [...EXPORT_TABLES].reverse()) {
          tx.executeSql(`DELETE FROM ${table}`);
        }

        for (const table of EXPORT_TABLES) {
          const columns = TABLE_COLUMNS[table];
          for (const row of archive.data[table]) {
            const filtered = columns.reduce<Record<string, unknown>>((acc, column) => {
              if (Object.prototype.hasOwnProperty.call(row, column)) {
                acc[column] = row[column];
              }
              return acc;
            }, {});
            const rowColumns = Object.keys(filtered);
            if (rowColumns.length === 0) continue;
            const placeholders = rowColumns.map(() => '?').join(', ');
            tx.executeSql(
              `INSERT OR REPLACE INTO ${table} (${rowColumns.join(', ')}) VALUES (${placeholders})`,
              rowColumns.map(column => filtered[column]),
            );
          }
        }
      },
      error => reject(error),
      () => resolve(),
    );
  });
}

async function rescheduleImportedReminders(archive: DeviceTransferArchive): Promise<void> {
  const medications = archive.data.medikamente as unknown as MedikamentRow[];
  await planeAlleErinnerungen(medications);
}

function createEmptyRows(): TransferRows {
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

function buildTableStats(data: TransferRows): DeviceTransferManifest['tables'] {
  return EXPORT_TABLES.reduce<DeviceTransferManifest['tables']>((acc, table) => {
    const serialized = JSON.stringify(data[table]);
    acc[table] = {
      rows: data[table].length,
      checksum: CryptoJS.SHA256(serialized).toString(CryptoJS.enc.Hex),
    };
    return acc;
  }, {} as DeviceTransferManifest['tables']);
}

function buildPreview(archive: DeviceTransferArchive): DeviceTransferPreview {
  return {
    createdAt: archive.manifest.createdAt,
    appVersion: archive.manifest.appVersion,
    platform: archive.manifest.platform,
    personCount: archive.data.personen.length,
    medicationCount: archive.data.medikamente.length,
    doctorCount: archive.data.aerzte.length,
    intakeCount: archive.data.einnahmen.length,
    packageCount: archive.data.packungen.length,
    activeReminderCount: archive.data.medikamente.filter(row => Number(row.erinnerung_aktiv) === 1).length,
  };
}

export async function generateSecurityCode(): Promise<string> {
  const bytes = await getSecureRandomBytes(16);
  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, '0').toUpperCase())
    .join('')
    .replace(/(.{4})/g, '$1-')
    .replace(/-$/, '');
}

async function getSecureRandomBytes(byteCount: number): Promise<number[]> {
  if (DeviceTransferFile?.randomBytes) {
    const base64 = await DeviceTransferFile.randomBytes(byteCount);
    const words = CryptoJS.enc.Base64.parse(base64);
    const hex = words.toString(CryptoJS.enc.Hex);
    return hex.match(/.{2}/g)?.map(value => parseInt(value, 16)) ?? [];
  }

  // Jest/Node fallback. React Native production uses the native branch above.
  const nodeCrypto = getNodeCryptoForTests();
  return Array.from(nodeCrypto.randomBytes(byteCount));
}

async function getSecureRandomBase64(byteCount: number): Promise<string> {
  const bytes = await getSecureRandomBytes(byteCount);
  return CryptoJS.enc.Hex.parse(bytes.map(byte => byte.toString(16).padStart(2, '0')).join('')).toString(CryptoJS.enc.Base64);
}

function randomWordArrayForTests(byteCount: number): CryptoJS.lib.WordArray {
  const nodeCrypto = getNodeCryptoForTests();
  return CryptoJS.enc.Hex.parse(nodeCrypto.randomBytes(byteCount).toString('hex'));
}

function getNodeCryptoForTests(): typeof import('crypto') {
  if (typeof jest === 'undefined') {
    throw new Error('Sichere Zufallsbytes sind auf diesem Gerät nicht verfügbar.');
  }
  const nodeRequire = eval('require') as NodeRequire;
  return nodeRequire('crypto') as typeof import('crypto');
}

function wordArrayToBase64(value: CryptoJS.lib.WordArray): string {
  return value.toString(CryptoJS.enc.Base64);
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

function buildTransferFileName(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `mein-mediplan-transfer-${year}-${month}-${day}.${FILE_EXTENSION}`;
}
