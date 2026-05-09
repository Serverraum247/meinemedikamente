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

  private func fetchBackupRecords(from db: CKDatabase,
                                  sortedByTimestamp: Bool = false,
                                  completion: @escaping (Result<[CKRecord], Error>) -> Void) {
    let query = CKQuery(recordType: recordType, predicate: NSPredicate(value: true))
    if sortedByTimestamp {
      query.sortDescriptors = [NSSortDescriptor(key: "timestamp", ascending: false)]
    }

    db.fetch(withQuery: query,
             inZoneWith: CKRecordZone.default().zoneID,
             desiredKeys: nil,
             resultsLimit: CKQueryOperation.maximumResults) { result in
      switch result {
      case .success(let queryResult):
        do {
          let records = try queryResult.matchResults.map { _, recordResult in
            try recordResult.get()
          }
          completion(.success(records))
        } catch {
          completion(.failure(error))
        }
      case .failure(let error):
        completion(.failure(error))
      }
    }
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
    fetchBackupRecords(from: privateDB) { [weak self] result in
      switch result {
      case .success(let recordsToDelete):
        let deleteOperations = recordsToDelete.map { $0.recordID }

        guard !deleteOperations.isEmpty else {
          self?.saveRecord(record, to: privateDB, resolve: resolve, reject: reject)
          return
        }

        let deleteOp = CKModifyRecordsOperation(recordsToSave: nil, recordIDsToDelete: deleteOperations)
        deleteOp.modifyRecordsResultBlock = { result in
          if case .failure(let error) = result {
            // Wenn nichts zu loeschen war, trotzdem weitermachen
            print("[CloudKit] Loeschen alter Backups: \(error.localizedDescription)")
          }
          self?.saveRecord(record, to: privateDB, resolve: resolve, reject: reject)
        }
        privateDB.add(deleteOp)

      case .failure(let error):
        // Zone nicht gefunden = noch kein Backup vorhanden, einfach erstellen
        if (error as? CKError)?.errorCode == CKError.unknownItem.rawValue {
          self?.saveRecord(record, to: privateDB, resolve: resolve, reject: reject)
          return
        }

        reject("CLOUDKIT_QUERY_ERROR", "Backup-Pruefung fehlgeschlagen: \(error.localizedDescription)", error)
      }
    }
  }

  private func saveRecord(_ record: CKRecord, to db: CKDatabase,
                           resolve: @escaping RCTPromiseResolveBlock,
                           reject: @escaping RCTPromiseRejectBlock) {
    db.save(record) { _, error in
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

    fetchBackupRecords(from: privateDB, sortedByTimestamp: true) { result in
      switch result {
      case .success(let records):
        guard let latestRecord = records.first,
              let jsonString = latestRecord[self.backupField] as? String else {
          resolve(nil)
          return
        }

        resolve(jsonString)

      case .failure(let error):
        reject("CLOUDKIT_RESTORE_ERROR", "Wiederherstellung fehlgeschlagen: \(error.localizedDescription)", error)
      }
    }
  }

  // MARK: - Backup-Info

  @objc func getBackupInfo(_ resolve: @escaping RCTPromiseResolveBlock,
                            reject: @escaping RCTPromiseRejectBlock) {
    let container = getContainer()
    let privateDB = container.privateCloudDatabase

    fetchBackupRecords(from: privateDB, sortedByTimestamp: true) { result in
      guard case .success(let records) = result,
            let latestRecord = records.first,
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

    fetchBackupRecords(from: privateDB) { result in
      switch result {
      case .success(let records):
        guard !records.isEmpty else {
          resolve(true)
          return
        }

        let recordIDs = records.map { $0.recordID }
        let deleteOp = CKModifyRecordsOperation(recordsToSave: nil, recordIDsToDelete: recordIDs)
        deleteOp.modifyRecordsResultBlock = { result in
          if case .failure(let error) = result {
            reject("CLOUDKIT_DELETE_ERROR", "Löschen fehlgeschlagen: \(error.localizedDescription)", error)
            return
          }
          resolve(true)
        }
        privateDB.add(deleteOp)

      case .failure(let error):
        reject("CLOUDKIT_DELETE_ERROR", "Löschen fehlgeschlagen: \(error.localizedDescription)", error)
      }
    }
  }

  // MARK: - React Native Bridge Setup

  @objc static func requiresMainQueueSetup() -> Bool {
    return false
  }
}
