import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
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

// Sicherstellen dass User eingeloggt ist
export async function ensureAuth(): Promise<string | null> {
  try {
    const currentUser = auth().currentUser;
    if (currentUser) return currentUser.uid;
    
    const credential = await auth().signInAnonymously();
    return credential.user.uid;
  } catch (e) {
    console.warn('[BackupService] Auth-Fehler:', e);
    return null;
  }
}

// Alle lokalen Daten exportieren
async function exportLocalData(): Promise<BackupData> {
  const db = await getDatabase();
  
  const tables = ['medikamente', 'packungen', 'einnahmen', 'einnahmeplan', 'arzt_urlaub', 'einstellungen', 'pzn_cache'];
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
      // Tabelle existiert evtl. nicht
      data[table] = [];
    }
  }
  
  return {
    version: 5,
    timestamp: new Date().toISOString(),
    ...data,
  } as BackupData;
}

// Backup in Firestore hochladen
export async function uploadBackup(): Promise<{ success: boolean; error?: string }> {
  // Premium-Check
  const premium = await isPremium();
  if (!premium) {
    return { success: false, error: 'Premium erforderlich fuer Cloud-Backup' };
  }
  
  const uid = await ensureAuth();
  if (!uid) {
    return { success: false, error: 'Anmeldung fehlgeschlagen' };
  }
  
  try {
    const data = await exportLocalData();
    
    await firestore()
      .collection('users')
      .doc(uid)
      .collection('backups')
      .add({
        ...data,
        createdAt: firestore.FieldValue.serverTimestamp(),
      });
    
    // Letztes Backup-Datum speichern
    await firestore()
      .collection('users')
      .doc(uid)
      .set({
        lastBackup: firestore.FieldValue.serverTimestamp(),
        lastBackupMedikamente: data.medikamente.length,
      }, { merge: true });
    
    console.log('[BackupService] Backup erfolgreich:', data.medikamente.length, 'Medikamente');
    return { success: true };
  } catch (e: any) {
    console.warn('[BackupService] Upload-Fehler:', e);
    return { success: false, error: e.message || 'Unbekannter Fehler' };
  }
}

// Letzte Backup-Infos abrufen
export async function getBackupInfo(): Promise<BackupInfo | null> {
  const premium = await isPremium();
  if (!premium) return null;
  
  const uid = await ensureAuth();
  if (!uid) return null;
  
  try {
    const doc = await firestore().collection('users').doc(uid).get();
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

// Backup herunterladen und wiederherstellen
export async function restoreBackup(): Promise<{ success: boolean; error?: string; medikamentCount?: number }> {
  const premium = await isPremium();
  if (!premium) {
    return { success: false, error: 'Premium erforderlich' };
  }
  
  const uid = await ensureAuth();
  if (!uid) {
    return { success: false, error: 'Anmeldung fehlgeschlagen' };
  }
  
  try {
    // Neustes Backup holen
    const snapshot = await firestore()
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
    const db = await getDatabase();
    
    // Daten in SQLite zurueckschreiben
    for (const table of ['einstellungen', 'pzn_cache', 'einnahmen', 'einnahmeplan', 'arzt_urlaub', 'packungen', 'medikamente']) {
      const rows = (backupData as any)[table] || [];
      if (rows.length === 0) continue;
      
      try {
        // Tabelle leeren
        await db.executeSql(`DELETE FROM ${table}`);
        
        // Zeile fuer-Zeile einfuegen
        for (const row of rows) {
          const columns = Object.keys(row);
          const values = columns.map(c => row[c]);
          const placeholders = columns.map(() => '?').join(',');
          await db.executeSql(
            `INSERT OR REPLACE INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`,
            values
          );
        }
      } catch (e) {
        console.warn(`[BackupService] Restore ${table} Fehler:`, e);
      }
    }
    
    console.log('[BackupService] Restore erfolgreich:', backupData.medikamente?.length, 'Medikamente');
    return { success: true, medikamentCount: backupData.medikamente?.length ?? 0 };
  } catch (e: any) {
    console.warn('[BackupService] Restore-Fehler:', e);
    return { success: false, error: e.message || 'Unbekannter Fehler' };
  }
}

// Backup loeschen
export async function deleteBackup(): Promise<{ success: boolean }> {
  const uid = await ensureAuth();
  if (!uid) return { success: false };
  
  try {
    const snapshot = await firestore()
      .collection('users')
      .doc(uid)
      .collection('backups')
      .get();
    
    const batch = firestore().batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    
    await firestore().collection('users').doc(uid).delete();
    
    return { success: true };
  } catch {
    return { success: false };
  }
}
