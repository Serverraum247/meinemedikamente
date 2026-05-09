/**
 * CloudKitBackupModule.swift
 *
 * Native CloudKit Bridge fuer React Native.
 * Exportiert/Importiert alle Medikamenten-Daten in iCloud (Private Database).
 * Kein Login noetig – Apple-ID reicht. Kostenlos, nativ in iOS.
 *
 * Nutzung aus JS:
 *   import { NativeModules } from 'react-native';
 *   const { CloudKitBackup } = NativeModules;
 *   await CloudKitBackup.createBackup(jsonData);  // jsonData = JSON-String
 *   const data = await CloudKitBackup.restoreBackup(); // → JSON-String oder null
 *   const info = await CloudKitBackup.getBackupInfo(); // → { timestamp, medikamentCount } oder null
 *   await CloudKitBackup.deleteBackup();
 */

import CloudKit
import Foundation

@objc(CloudKitBackup)
class CloudKitBackup: NSObject {

  private let containerIdentifier = "iCloud.com.meinemedikamente.backup"
  private let recordType = "AppBackup"
  private let backupField = "backupData"

  // MARK: - Helper

  private func getContainer() -> CKContainer {
    return CKContainer(identifier: containerIdentifier)
  }

  // MARK: - Backup erstellen

  @objc func createBackup(_ jsonString: String, resolver resolve: @escaping RCTPromiseResolveBlock,
                           rejecter reject: @escaping RCTPromiseRejectBlock) {
    let container = getContainer()
    let privateDB = container.privateCloudDatabase

    let record = CKRecord(recordType: recordType)
    record[backupField] = jsonString as CKRecordValue
    record["timestamp"] = Date() as CKRecordValue

    // Altes Backup loeschen, dann neues erstellen
    let query = CKQuery(recordType: recordType, predicate: NSPredicate(value: true))
    privateDB.perform(query, inZoneWith: CKRecordZone.default().zoneID) { [weak self] results, error in
      if let error = error {
        // Zone nicht gefunden = noch kein Backup vorhanden, einfach erstellen
        if (error as? CKError)?.errorCode == CKError.unknownItem.rawValue {
          self?.saveRecord(record, to: privateDB, resolve: resolve, reject: reject)
          return
        }
      }

      // Alte Records loeschen
      let recordsToDelete = results ?? []
      let deleteOperations = recordsToDelete.map { CKRecord.ID(recordName: $0.recordID.recordName) }

      let deleteOp = CKModifyRecordsOperation(recordsToSave: nil, recordIDsToDelete: deleteOperations)
      deleteOp.modifyRecordsCompletionBlock = { _, _, error in
        if let error = error {
          // Wenn nichts zu loeschen war, trotzdem weitermachen
          print("[CloudKit] Loeschen alter Backups: \(error.localizedDescription)")
        }
        self?.saveRecord(record, to: privateDB, resolve: resolve, reject: reject)
      }
      privateDB.add(deleteOp)
    }
  }

  private func saveRecord(_ record: CKRecord, to db: CKDatabase,
                           resolve: @escaping RCTPromiseResolveBlock,
                           reject: @escaping RCTPromiseRejectBlock) {
    db.save(record) { savedRecord, error in
      if let error = error {
        reject("CLOUDKIT_SAVE_ERROR", "Backup fehlgeschlagen: \(error.localizedDescription)", error)
        return
      }
      resolve(true)
    }
  }

  // MARK: - Backup wiederherstellen

  @objc func restoreBackup(_ resolve: @escaping RCTPromiseResolveBlock,
                             reject: @escaping RCTPromiseRejectBlock) {
    let container = getContainer()
    let privateDB = container.privateCloudDatabase

    let query = CKQuery(recordType: recordType, predicate: NSPredicate(value: true))
    query.sortDescriptors = [NSSortDescriptor(key: "timestamp", ascending: false)]

    privateDB.perform(query, inZoneWith: CKRecordZone.default().zoneID) { results, error in
      if let error = error {
        reject("CLOUDKIT_RESTORE_ERROR", "Wiederherstellung fehlgeschlagen: \(error.localizedDescription)", error)
        return
      }

      guard let latestRecord = results?.first,
            let jsonString = latestRecord[self.backupField] as? String else {
        resolve(nil)
        return
      }

      resolve(jsonString)
    }
  }

  // MARK: - Backup-Info

  @objc func getBackupInfo(_ resolve: @escaping RCTPromiseResolveBlock,
                            reject: @escaping RCTPromiseRejectBlock) {
    let container = getContainer()
    let privateDB = container.privateCloudDatabase

    let query = CKQuery(recordType: recordType, predicate: NSPredicate(value: true))
    query.sortDescriptors = [NSSortDescriptor(key: "timestamp", ascending: false)]

    privateDB.perform(query, inZoneWith: CKRecordZone.default().zoneID) { results, error in
      if let error = error {
        // Kein Backup = kein Fehler
        resolve(nil)
        return
      }

      guard let latestRecord = results?.first,
            let jsonString = latestRecord[self.backupField] as? String,
            let timestamp = latestRecord["timestamp"] as? Date else {
        resolve(nil)
        return
      }

      // Zaehle Medikamente im JSON
      var medCount = 0
      if let data = jsonString.data(using: .utf8),
         let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
         let medications = json["medikamente"] as? [[String: Any]] {
        medCount = medications.count
      }

      let formatter = ISO8601DateFormatter()
      resolve([
        "timestamp": formatter.string(from: timestamp),
        "medikamentCount": medCount
      ])
    }
  }

  // MARK: - Backup loeschen

  @objc func deleteBackup(_ resolve: @escaping RCTPromiseResolveBlock,
                            reject: @escaping RCTPromiseRejectBlock) {
    let container = getContainer()
    let privateDB = container.privateCloudDatabase

    let query = CKQuery(recordType: recordType, predicate: NSPredicate(value: true))
    privateDB.perform(query, inZoneWith: CKRecordZone.default().zoneID) { results, error in
      if let error = error {
        reject("CLOUDKIT_DELETE_ERROR", "Löschen fehlgeschlagen: \(error.localizedDescription)", error)
        return
      }

      guard let records = results, !records.isEmpty else {
        resolve(true)
        return
      }

      let recordIDs = records.map { $0.recordID }
      let deleteOp = CKModifyRecordsOperation(recordsToSave: nil, recordIDsToDelete: recordIDs)
      deleteOp.modifyRecordsCompletionBlock = { _, _, error in
        if let error = error {
          reject("CLOUDKIT_DELETE_ERROR", "Löschen fehlgeschlagen: \(error.localizedDescription)", error)
          return
        }
        resolve(true)
      }
      privateDB.add(deleteOp)
    }
  }

  // MARK: - React Native Bridge Setup

  @objc static func requiresMainQueueSetup() -> Bool {
    return false
  }
}
