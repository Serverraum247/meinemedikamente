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
import UIKit

@objc(CloudKitBackup)
class CloudKitBackup: NSObject {

  private let containerIdentifier = "iCloud.com.meinemedikamente.backup"
  private let recordType = "AppBackup"
  private let recordName = "currentBackup"
  private let backupField = "backupData"

  // MARK: - Helper

  private func getContainer() -> CKContainer {
    return CKContainer(identifier: containerIdentifier)
  }

  private func getBackupRecordID() -> CKRecord.ID {
    return CKRecord.ID(recordName: recordName, zoneID: CKRecordZone.default().zoneID)
  }

  private func fetchBackupRecord(from db: CKDatabase,
                                 completion: @escaping (Result<CKRecord?, Error>) -> Void) {
    db.fetch(withRecordID: getBackupRecordID()) { record, error in
      if let error = error {
        if let ckError = error as? CKError, ckError.code == .unknownItem {
          completion(.success(nil))
          return
        }

        completion(.failure(error))
        return
      }

      completion(.success(record))
    }
  }

  // MARK: - Backup erstellen

  @objc func createBackup(_ jsonString: String, resolver resolve: @escaping RCTPromiseResolveBlock,
                           rejecter reject: @escaping RCTPromiseRejectBlock) {
    let container = getContainer()
    let privateDB = container.privateCloudDatabase

    fetchBackupRecord(from: privateDB) { [weak self] result in
      switch result {
      case .success(let existingRecord):
        guard let self = self else {
          return
        }

        let record = existingRecord ?? CKRecord(recordType: self.recordType, recordID: self.getBackupRecordID())
        record[self.backupField] = jsonString as CKRecordValue
        record["timestamp"] = Date() as CKRecordValue
        self.saveRecord(record, to: privateDB, resolve: resolve, reject: reject)

      case .failure(let error):
        reject("CLOUDKIT_FETCH_ERROR", "Backup-Pruefung fehlgeschlagen: \(error.localizedDescription)", error)
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
                             rejecter reject: @escaping RCTPromiseRejectBlock) {
    let container = getContainer()
    let privateDB = container.privateCloudDatabase

    fetchBackupRecord(from: privateDB) { result in
      switch result {
      case .success(let record):
        guard let record = record,
              let jsonString = record[self.backupField] as? String else {
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
                            rejecter reject: @escaping RCTPromiseRejectBlock) {
    let container = getContainer()
    let privateDB = container.privateCloudDatabase

    fetchBackupRecord(from: privateDB) { result in
      guard case .success(let record) = result,
            let record = record,
            let jsonString = record[self.backupField] as? String,
            let timestamp = record["timestamp"] as? Date else {
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

    privateDB.delete(withRecordID: getBackupRecordID()) { _, error in
      if let error = error {
        if let ckError = error as? CKError, ckError.code == .unknownItem {
          resolve(true)
          return
        }

        reject("CLOUDKIT_DELETE_ERROR", "Löschen fehlgeschlagen: \(error.localizedDescription)", error)
        return
      }

      resolve(true)
    }
  }

  // MARK: - React Native Bridge Setup

  @objc static func requiresMainQueueSetup() -> Bool {
    return false
  }
}

@objc(MedicationPlanShare)
class MedicationPlanShare: NSObject {

  @objc func sharePdf(_ title: String,
                      body: String,
                      fileName: String,
                      resolver resolve: @escaping RCTPromiseResolveBlock,
                      rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      do {
        let url = try self.createPdf(title: title, body: body, fileName: fileName)
        guard let presenter = RCTPresentedViewController() else {
          reject("PDF_SHARE_ERROR", "Kein aktives Fenster zum Teilen gefunden.", nil)
          return
        }

        let controller = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        controller.popoverPresentationController?.sourceView = presenter.view
        controller.completionWithItemsHandler = { _, _, _, _ in
          resolve(true)
        }
        presenter.present(controller, animated: true)
      } catch {
        reject("PDF_SHARE_ERROR", "PDF konnte nicht geteilt werden: \(error.localizedDescription)", error)
      }
    }
  }

  private func createPdf(title: String, body: String, fileName: String) throws -> URL {
    let safeName = sanitizeFileName(fileName)
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(safeName)
    let pageRect = CGRect(x: 0, y: 0, width: 595, height: 842)
    let margin: CGFloat = 48
    let renderer = UIGraphicsPDFRenderer(bounds: pageRect)

    try renderer.writePDF(to: url) { context in
      context.beginPage()

      let titleAttributes: [NSAttributedString.Key: Any] = [
        .font: UIFont.boldSystemFont(ofSize: 20),
        .foregroundColor: UIColor(red: 0.10, green: 0.10, blue: 0.18, alpha: 1.0)
      ]
      let bodyAttributes: [NSAttributedString.Key: Any] = [
        .font: UIFont.systemFont(ofSize: 12),
        .foregroundColor: UIColor(red: 0.13, green: 0.13, blue: 0.13, alpha: 1.0)
      ]

      var y = margin
      title.draw(at: CGPoint(x: margin, y: y), withAttributes: titleAttributes)
      y += 36

      let maxWidth = pageRect.width - (margin * 2)
      let bottom = pageRect.height - margin
      let lineHeight: CGFloat = 18

      for paragraph in body.components(separatedBy: "\n") {
        let lines = self.wrapLine(paragraph, attributes: bodyAttributes, maxWidth: maxWidth)
        for line in lines {
          if y > bottom {
            context.beginPage()
            y = margin
          }
          line.draw(at: CGPoint(x: margin, y: y), withAttributes: bodyAttributes)
          y += line.isEmpty ? 10 : lineHeight
        }
      }
    }

    return url
  }

  private func wrapLine(_ line: String,
                        attributes: [NSAttributedString.Key: Any],
                        maxWidth: CGFloat) -> [String] {
    if line.isEmpty { return [""] }
    let words = line.components(separatedBy: " ")
    var lines: [String] = []
    var current = ""

    for word in words {
      let candidate = current.isEmpty ? word : "\(current) \(word)"
      let width = (candidate as NSString).size(withAttributes: attributes).width
      if width <= maxWidth {
        current = candidate
      } else {
        if !current.isEmpty { lines.append(current) }
        current = word
      }
    }

    if !current.isEmpty { lines.append(current) }
    return lines
  }

  private func sanitizeFileName(_ value: String) -> String {
    let allowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._-")
    let sanitized = value.unicodeScalars.map { allowed.contains($0) ? Character($0) : "-" }
    let name = String(sanitized)
    return name.hasSuffix(".pdf") ? name : "\(name).pdf"
  }

  @objc static func requiresMainQueueSetup() -> Bool {
    return false
  }
}
