/**
 * BackupService.ts – Cloud-Backup (CloudKit auf iOS, Firebase auf Android)
 *
 * iOS:  Native CloudKit-Module (kein Login noetig, Apple-ID reicht)
 * Android: Firebase Firestore (anonyme Auth)
 *
 * Beide Plattformen: Premium-Feature, exportiert/importiert alle 7 SQLite-Tabellen.
 */

import { Platform, NativeModules } from 'react-native';
import { logger } from '../utils/Logger';

// CloudKit Native Module (nur iOS)
const { CloudKitBackup } = NativeModules;

// Firebase (nur Android)
let auth: any = null;
let firestoreModule: any = null;

if (Platform.OS === 'android') {
  try {
    auth = require('@react-native-firebase/auth').default;
    firestoreModule = require('@react-native-firebase/firestore').default;
  } catch {
    // Firebase native module nicht installiert
  }
}

import { getDatabase } from '../database/Database';
import { isPremium } from './PremiumService';

export interface BackupInfo {
  id: string;
  timestamp: string;
  medikamentCount: number;
  version: number;
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

// ============================================================
// Gemeinsame Hilfsfunktionen
// ============================================================

// Alle lokalen Daten aus SQLite exportieren
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

// Backup-Daten in SQLite zurueckschreiben
async function importLocalData(backupData: BackupData): Promise<number> {
  const db = await getDatabase();
  let medCount = 0;
  
  // Reihenfolge wichtig: Abhaengigkeiten zuerst leeren
  for (const table of ['einstellungen', 'pzn_cache', 'einnahmen', 'einnahmeplan', 'arzt_urlaub', 'aerzte', 'packungen', 'medikamente']) {
    const rows = (backupData as any)[table] || [];
    if (rows.length === 0) continue;
    
    try {
      await db.executeSql(`DELETE FROM ${table}`);
      
      for (const row of rows) {
        const columns = Object.keys(row);
        const values = columns.map(c => row[c]);
        const placeholders = columns.map(() => '?').join(',');
        await db.executeSql(
          `INSERT OR REPLACE INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`,
          values
        );
      }
      
      if (table === 'medikamente') {
        medCount = rows.length;
      }
    } catch (e) {
      logger.warn(`[BackupService] Restore ${table} Fehler:`, e);
    }
  }
  
  return medCount;
}

// ============================================================
// Android: Firebase Firestore
// ============================================================

async function ensureAuth(): Promise<string | null> {
  try {
    const currentUser = auth().currentUser;
    if (currentUser) return currentUser.uid;
    
    const credential = await auth().signInAnonymously();
    return credential.user.uid;
  } catch (e) {
    logger.warn('[BackupService] Auth-Fehler:', e);
    return null;
  }
}

async function uploadBackupAndroid(): Promise<{ success: boolean; error?: string }> {
  const uid = await ensureAuth();
  if (!uid) return { success: false, error: 'Anmeldung fehlgeschlagen' };
  
  try {
    const data = await exportLocalData();
    
    await firestoreModule()
      .collection('users')
      .doc(uid)
      .collection('backups')
      .add({
        ...data,
        createdAt: firestoreModule.FieldValue.serverTimestamp(),
      });
    
    await firestoreModule()
      .collection('users')
      .doc(uid)
      .set({
        lastBackup: firestoreModule.FieldValue.serverTimestamp(),
        lastBackupMedikamente: data.medikamente.length,
      }, { merge: true });
    
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || 'Unbekannter Fehler' };
  }
}

async function getBackupInfoAndroid(): Promise<BackupInfo | null> {
  const uid = await ensureAuth();
  if (!uid) return null;
  
  try {
    const doc = await firestoreModule().collection('users').doc(uid).get();
    if (!doc.exists) return null;
    
    const data = doc.data();
    return {
      id: doc.id,
      timestamp: data?.lastBackup?.toDate?.()?.toISOString() ?? '',
      medikamentCount: data?.lastBackupMedikamente ?? 0,
      version: 5,
    };
  } catch {
    return null;
  }
}

async function restoreBackupAndroid(): Promise<{ success: boolean; error?: string; medikamentCount?: number }> {
  const uid = await ensureAuth();
  if (!uid) return { success: false, error: 'Anmeldung fehlgeschlagen' };
  
  try {
    const snapshot = await firestoreModule()
      .collection('users')
      .doc(uid)
      .collection('backups')
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    
    if (snapshot.empty) {
      return { success: false, error: 'Kein Backup gefunden' };
    }
    
    const backupData = snapshot.docs[0].data() as BackupData;
    const medCount = await importLocalData(backupData);
    
    return { success: true, medikamentCount: medCount };
  } catch (e: any) {
    return { success: false, error: e.message || 'Unbekannter Fehler' };
  }
}

async function deleteBackupAndroid(): Promise<{ success: boolean }> {
  const uid = await ensureAuth();
  if (!uid) return { success: false };
  
  try {
    const snapshot = await firestoreModule()
      .collection('users')
      .doc(uid)
      .collection('backups')
      .get();
    
    const batch = firestoreModule().batch();
    snapshot.docs.forEach((doc: any) => batch.delete(doc.ref));
    await batch.commit();
    
    await firestoreModule().collection('users').doc(uid).delete();
    
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
  } catch (e: any) {
    return { success: false, error: e.message || 'iCloud-Backup fehlgeschlagen' };
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

async function restoreBackupIOS(): Promise<{ success: boolean; error?: string; medikamentCount?: number }> {
  try {
    const jsonString = await CloudKitBackup.restoreBackup();
    if (!jsonString) {
      return { success: false, error: 'Kein Backup in iCloud gefunden' };
    }
    
    const backupData = JSON.parse(jsonString) as BackupData;
    const medCount = await importLocalData(backupData);
    
    return { success: true, medikamentCount: medCount };
  } catch (e: any) {
    return { success: false, error: e.message || 'iCloud-Wiederherstellung fehlgeschlagen' };
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
// Plattform-uebergreifende API
// ============================================================

export async function uploadBackup(): Promise<{ success: boolean; error?: string }> {
  const premium = await isPremium();
  if (!premium) {
    return { success: false, error: 'Cloud-Backup ist nur mit Premium möglich.' };
  }
  
  if (Platform.OS === 'ios') {
    return uploadBackupIOS();
  }
  return uploadBackupAndroid();
}

export async function getBackupInfo(): Promise<BackupInfo | null> {
  const premium = await isPremium();
  if (!premium) return null;
  
  if (Platform.OS === 'ios') {
    return getBackupInfoIOS();
  }
  return getBackupInfoAndroid();
}

export async function restoreBackup(): Promise<{ success: boolean; error?: string; medikamentCount?: number }> {
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
