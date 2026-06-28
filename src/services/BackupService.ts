/**
 * BackupService.ts – Cloud-Backup (CloudKit auf iOS, Firebase mit Sicherungscode auf Android)
 *
 * iOS: Native CloudKit-Module (kein Login nötig, Apple-ID reicht)
 * Android: Firebase Firestore + anonyme Firebase-Session, gekoppelt über einen Sicherungscode
 *
 * Beide Plattformen: Premium-Feature für zusätzliche Sicherungen.
 */

import CryptoJS from 'crypto-js';
import { NativeModules, Platform } from 'react-native';

import { getDatabase } from '../database/Database';
import { logger } from '../utils/Logger';
import {
  collectPortableData,
  createArchiveCryptoOptions,
  encryptArchive,
  generateSecurityCode,
  restoreDeviceTransferPackage,
} from './DeviceTransferService';
import { isPremium } from './PremiumService';
import { deleteSetting, getSetting, setSetting } from './SettingsService';

const ANDROID_RECOVERY_CODE_STORAGE_KEY = 'cloud_backup_recovery_code_v1';
const ANDROID_BACKUP_COLLECTION = 'cloud_backup_vaults';
const ANDROID_BACKUP_FORMAT = 'MEIN_MEDIPLAN_CLOUD_BACKUP';
const ANDROID_BACKUP_VERSION = 1;
const FIRESTORE_SOFT_LIMIT_BYTES = 900000;

// CloudKit Native Module (nur iOS)
const { CloudKitBackup } = NativeModules;

// Firebase (nur Android)
let auth: any = null;
let firestoreModule: any = null;

function ensureFirebaseModulesLoaded(): boolean {
  if (auth && firestoreModule) {
    return true;
  }

  if (Platform.OS !== 'android') {
    return false;
  }

  try {
    auth = auth ?? require('@react-native-firebase/auth').default;
    firestoreModule = firestoreModule ?? require('@react-native-firebase/firestore').default;
    return Boolean(auth && firestoreModule);
  } catch {
    return false;
  }
}

export interface BackupInfo {
  id: string;
  timestamp: string;
  medikamentCount: number;
  version: number;
}

export interface BackupUploadResult {
  success: boolean;
  error?: string;
  recoveryCode?: string;
  generatedRecoveryCode?: boolean;
}

export interface BackupRestoreResult {
  success: boolean;
  error?: string;
  medikamentCount?: number;
}

export interface BackupConnectResult {
  success: boolean;
  error?: string;
  info?: BackupInfo | null;
  recoveryCode?: string;
}

export interface BackupData {
  version: number;
  timestamp: string;
  medikamente: any[];
  packungen: any[];
  einnahmen: any[];
  einnahmeplan: any[];
  arzt_urlaub: any[];
  einstellungen: any[];
  pzn_cache: any[];
}

interface AndroidBackupDocument {
  format?: string;
  version?: number;
  packageText?: string;
  manifestCreatedAt?: string;
  medicationCount?: number;
  updatedAt?: {
    toDate?: () => Date;
  };
}

// ============================================================
// Gemeinsame Hilfsfunktionen
// ============================================================

async function exportLocalData(): Promise<BackupData> {
  const db = await getDatabase();

  const tables = ['medikamente', 'packungen', 'einnahmen', 'einnahmeplan', 'arzt_urlaub', 'aerzte', 'einstellungen', 'pzn_cache'];
  const data: any = {};

  for (const table of tables) {
    try {
      const results = await db.executeSql(`SELECT * FROM ${table}`);
      const rows = results[0].rows;
      const arr: any[] = [];
      for (let i = 0; i < rows.length; i++) {
        arr.push(rows.item(i));
      }
      data[table] = arr;
    } catch {
      data[table] = [];
    }
  }

  return {
    version: 5,
    timestamp: new Date().toISOString(),
    ...data,
  } as BackupData;
}

async function importLocalData(backupData: BackupData): Promise<number> {
  const db = await getDatabase();
  let medCount = 0;

  for (const table of ['einstellungen', 'pzn_cache', 'einnahmen', 'einnahmeplan', 'arzt_urlaub', 'aerzte', 'packungen', 'medikamente']) {
    const rows = (backupData as any)[table] || [];

    try {
      await db.executeSql(`DELETE FROM ${table}`);

      for (const row of rows) {
        const columns = Object.keys(row);
        const values = columns.map(column => row[column]);
        const placeholders = columns.map(() => '?').join(',');
        await db.executeSql(
          `INSERT OR REPLACE INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`,
          values,
        );
      }

      if (table === 'medikamente') {
        medCount = rows.length;
      }
    } catch (error) {
      logger.warn(`[BackupService] Restore ${table} Fehler:`, error);
    }
  }

  return medCount;
}

// ============================================================
// Android: Firebase Firestore + Sicherungscode
// ============================================================

function normalizeRecoveryCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/(.{4})/g, '$1-')
    .replace(/-$/, '');
}

function validateRecoveryCode(value: string): string {
  const normalized = normalizeRecoveryCode(value);
  const compact = normalized.replace(/-/g, '');
  if (!/^[A-F0-9]{32}$/.test(compact)) {
    throw new Error('Der Sicherungscode ist ungültig. Er muss aus 32 Zeichen in 4er-Gruppen bestehen.');
  }
  return normalized;
}

function buildAndroidBackupDocId(recoveryCode: string): string {
  return CryptoJS.SHA256(validateRecoveryCode(recoveryCode)).toString(CryptoJS.enc.Hex);
}

function getUtf8ByteLength(value: string): number {
  return encodeURIComponent(value).replace(/%[A-F0-9]{2}/g, 'x').length;
}

function buildAndroidBackupInfo(docId: string, data: AndroidBackupDocument): BackupInfo {
  return {
    id: docId,
    timestamp: data.updatedAt?.toDate?.()?.toISOString?.() ?? data.manifestCreatedAt ?? '',
    medikamentCount: data.medicationCount ?? 0,
    version: data.version ?? ANDROID_BACKUP_VERSION,
  };
}

async function getStoredRecoveryCodeAndroid(): Promise<string | null> {
  try {
    const stored = await getSetting(ANDROID_RECOVERY_CODE_STORAGE_KEY);
    if (!stored) return null;
    return validateRecoveryCode(stored);
  } catch (error) {
    logger.warn('[BackupService] Gespeicherter Sicherungscode ist ungültig und wird ignoriert:', error);
    await deleteSetting(ANDROID_RECOVERY_CODE_STORAGE_KEY);
    return null;
  }
}

async function setStoredRecoveryCodeAndroid(recoveryCode: string): Promise<string> {
  const normalized = validateRecoveryCode(recoveryCode);
  await setSetting(ANDROID_RECOVERY_CODE_STORAGE_KEY, normalized);
  return normalized;
}

async function ensureStoredRecoveryCodeAndroid(): Promise<{ recoveryCode: string; generated: boolean }> {
  const stored = await getStoredRecoveryCodeAndroid();
  if (stored) {
    return { recoveryCode: stored, generated: false };
  }

  const generatedCode = await generateSecurityCode();
  const recoveryCode = await setStoredRecoveryCodeAndroid(generatedCode);
  return { recoveryCode, generated: true };
}

async function ensureAuth(): Promise<string | null> {
  if (!ensureFirebaseModulesLoaded()) {
    logger.warn('[BackupService] Firebase-Module fehlen auf Android.');
    return null;
  }

  try {
    const currentUser = auth().currentUser;
    if (currentUser) return currentUser.uid;

    const credential = await auth().signInAnonymously();
    return credential.user.uid;
  } catch (error) {
    logger.warn('[BackupService] Auth-Fehler:', error);
    return null;
  }
}

function getAndroidBackupRef(recoveryCode: string) {
  return firestoreModule().collection(ANDROID_BACKUP_COLLECTION).doc(buildAndroidBackupDocId(recoveryCode));
}

async function uploadBackupAndroid(): Promise<BackupUploadResult> {
  const uid = await ensureAuth();
  if (!uid) {
    return { success: false, error: 'Firebase ist auf diesem Android-Gerät noch nicht einsatzbereit.' };
  }

  try {
    const { recoveryCode, generated } = await ensureStoredRecoveryCodeAndroid();
    const archive = await collectPortableData();
    const packageText = encryptArchive(archive, recoveryCode, await createArchiveCryptoOptions());
    if (getUtf8ByteLength(packageText) > FIRESTORE_SOFT_LIMIT_BYTES) {
      return {
        success: false,
        error: 'Das Cloud-Backup ist für die direkte Firebase-Speicherung zu groß. Bitte nutze vorerst „Handy wechseln“.',
      };
    }

    await getAndroidBackupRef(recoveryCode).set(
      {
        format: ANDROID_BACKUP_FORMAT,
        version: ANDROID_BACKUP_VERSION,
        packageText,
        manifestCreatedAt: archive.manifest.createdAt,
        medicationCount: archive.data.medikamente.length,
        personCount: archive.data.personen.length,
        doctorCount: archive.data.aerzte.length,
        intakeCount: archive.data.einnahmen.length,
        packageCount: archive.data.packungen.length,
        updatedAt: firestoreModule.FieldValue.serverTimestamp(),
        lastWriterUid: uid,
      },
      { merge: true },
    );

    return {
      success: true,
      recoveryCode,
      generatedRecoveryCode: generated,
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unbekannter Fehler' };
  }
}

async function getBackupInfoAndroid(): Promise<BackupInfo | null> {
  const recoveryCode = await getStoredRecoveryCodeAndroid();
  if (!recoveryCode) return null;

  if (!(await ensureAuth())) return null;

  try {
    const doc = await getAndroidBackupRef(recoveryCode).get();
    if (!doc.exists) return null;
    return buildAndroidBackupInfo(doc.id, doc.data() as AndroidBackupDocument);
  } catch {
    return null;
  }
}

async function connectBackupWithRecoveryCodeAndroid(recoveryCode: string): Promise<BackupConnectResult> {
  let normalizedCode: string;
  try {
    normalizedCode = validateRecoveryCode(recoveryCode);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Der Sicherungscode ist ungültig.',
    };
  }

  if (!(await ensureAuth())) {
    return { success: false, error: 'Firebase ist auf diesem Android-Gerät noch nicht einsatzbereit.' };
  }

  try {
    const snapshot = await getAndroidBackupRef(normalizedCode).get();
    if (!snapshot.exists) {
      return {
        success: false,
        error: 'Zu diesem Sicherungscode wurde kein Cloud-Backup gefunden.',
      };
    }

    const data = snapshot.data() as AndroidBackupDocument;
    if (!data.packageText) {
      return {
        success: false,
        error: 'Das gefundene Cloud-Backup ist unvollständig gespeichert.',
      };
    }

    await setStoredRecoveryCodeAndroid(normalizedCode);
    return {
      success: true,
      info: buildAndroidBackupInfo(snapshot.id, data),
      recoveryCode: normalizedCode,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'Der Sicherungscode konnte nicht geprüft werden.',
    };
  }
}

async function restoreBackupAndroid(): Promise<BackupRestoreResult> {
  const recoveryCode = await getStoredRecoveryCodeAndroid();
  if (!recoveryCode) {
    return { success: false, error: 'Bitte gib zuerst deinen Sicherungscode ein.' };
  }

  if (!(await ensureAuth())) {
    return { success: false, error: 'Firebase ist auf diesem Android-Gerät noch nicht einsatzbereit.' };
  }

  try {
    const snapshot = await getAndroidBackupRef(recoveryCode).get();
    if (!snapshot.exists) {
      return {
        success: false,
        error: 'Zu diesem Sicherungscode wurde kein Cloud-Backup gefunden. Erstelle das Backup zuerst auf dem alten Gerät.',
      };
    }

    const backupData = snapshot.data() as AndroidBackupDocument;
    if (!backupData.packageText) {
      return { success: false, error: 'Das Cloud-Backup ist unvollständig gespeichert.' };
    }

    const preview = await restoreDeviceTransferPackage(backupData.packageText, recoveryCode);
    return { success: true, medikamentCount: preview.medicationCount };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unbekannter Fehler' };
  }
}

async function deleteBackupAndroid(): Promise<{ success: boolean }> {
  const recoveryCode = await getStoredRecoveryCodeAndroid();
  if (!recoveryCode) return { success: false };

  if (!(await ensureAuth())) return { success: false };

  try {
    await getAndroidBackupRef(recoveryCode).delete();
    await deleteSetting(ANDROID_RECOVERY_CODE_STORAGE_KEY);
    return { success: true };
  } catch {
    return { success: false };
  }
}

// ============================================================
// iOS: CloudKit
// ============================================================

async function uploadBackupIOS(): Promise<{ success: boolean; error?: string }> {
  try {
    const data = await exportLocalData();
    const jsonString = JSON.stringify(data);

    const result = await CloudKitBackup.createBackup(jsonString);
    return { success: !!result };
  } catch (error: any) {
    return { success: false, error: error.message || 'iCloud-Backup fehlgeschlagen' };
  }
}

async function getBackupInfoIOS(): Promise<BackupInfo | null> {
  try {
    const info = await CloudKitBackup.getBackupInfo();
    if (!info) return null;

    return {
      id: 'cloudkit',
      timestamp: info.timestamp ?? '',
      medikamentCount: info.medikamentCount ?? 0,
      version: 5,
    };
  } catch {
    return null;
  }
}

async function restoreBackupIOS(): Promise<BackupRestoreResult> {
  try {
    const jsonString = await CloudKitBackup.restoreBackup();
    if (!jsonString) {
      return { success: false, error: 'Kein Backup in iCloud gefunden' };
    }

    const backupData = JSON.parse(jsonString) as BackupData;
    const medCount = await importLocalData(backupData);

    return { success: true, medikamentCount: medCount };
  } catch (error: any) {
    return { success: false, error: error.message || 'iCloud-Wiederherstellung fehlgeschlagen' };
  }
}

async function deleteBackupIOS(): Promise<{ success: boolean }> {
  try {
    await CloudKitBackup.deleteBackup();
    return { success: true };
  } catch {
    return { success: false };
  }
}

// ============================================================
// Plattform-übergreifende API
// ============================================================

export async function uploadBackup(): Promise<BackupUploadResult> {
  const premium = await isPremium();
  if (!premium) {
    return { success: false, error: 'Cloud-Backup ist nur mit Premium möglich.' };
  }

  if (Platform.OS === 'ios') {
    return uploadBackupIOS();
  }
  return uploadBackupAndroid();
}

export async function getBackupRecoveryCode(): Promise<string | null> {
  if (Platform.OS !== 'android') {
    return null;
  }

  return getStoredRecoveryCodeAndroid();
}

export async function connectBackupWithRecoveryCode(recoveryCode: string): Promise<BackupConnectResult> {
  if (Platform.OS !== 'android') {
    return {
      success: false,
      error: 'Ein Sicherungscode wird nur für Android-Cloud-Backups benötigt.',
    };
  }

  return connectBackupWithRecoveryCodeAndroid(recoveryCode);
}

export async function getBackupInfo(): Promise<BackupInfo | null> {
  const premium = await isPremium();
  if (!premium) return null;

  if (Platform.OS === 'ios') {
    return getBackupInfoIOS();
  }
  return getBackupInfoAndroid();
}

export async function restoreBackup(): Promise<BackupRestoreResult> {
  const premium = await isPremium();
  if (!premium) {
    return { success: false, error: 'Cloud-Backup ist nur mit Premium möglich.' };
  }

  if (Platform.OS === 'ios') {
    return restoreBackupIOS();
  }
  return restoreBackupAndroid();
}

export async function deleteBackup(): Promise<{ success: boolean }> {
  if (Platform.OS === 'ios') {
    return deleteBackupIOS();
  }
  return deleteBackupAndroid();
}
