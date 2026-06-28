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
import Security
import UIKit
import UniformTypeIdentifiers
import VisionKit

@objc(AppRuntimeConfig)
class AppRuntimeConfig: NSObject {
  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc
  func constantsToExport() -> [AnyHashable: Any] {
    return [
      "internalPremiumTestMode": Bundle.main.object(forInfoDictionaryKey: "MMInternalPremiumTestMode") ?? false
    ]
  }
}

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

@objc(MedicationVisionScanner)
class MedicationVisionScanner: NSObject {

  private var resolve: RCTPromiseResolveBlock?
  private var reject: RCTPromiseRejectBlock?
  private var scanner: Any?
  private var recognizedTexts = Set<String>()
  private var recognizedBarcode: String?

  @objc static func requiresMainQueueSetup() -> Bool {
    return true
  }

  @objc func scanMedicationPackage(_ resolve: @escaping RCTPromiseResolveBlock,
                                    rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      guard #available(iOS 16.0, *) else {
        reject("VISION_SCANNER_UNAVAILABLE", "Apple Vision Scan benoetigt iOS 16 oder neuer.", nil)
        return
      }

      guard DataScannerViewController.isSupported else {
        reject("VISION_SCANNER_UNSUPPORTED", "Dieses iPhone unterstuetzt den Apple Vision Scanner nicht.", nil)
        return
      }

      guard DataScannerViewController.isAvailable else {
        reject("VISION_SCANNER_NOT_AVAILABLE", "Kamera-Zugriff ist nicht verfuegbar oder nicht erlaubt.", nil)
        return
      }

      guard let presenter = RCTPresentedViewController() else {
        reject("VISION_SCANNER_PRESENT_ERROR", "Kein aktives Fenster zum Scannen gefunden.", nil)
        return
      }

      self.resolve = resolve
      self.reject = reject
      self.recognizedTexts.removeAll()
      self.recognizedBarcode = nil

      let controller = DataScannerViewController(
        recognizedDataTypes: [
          .barcode(symbologies: [.ean13, .ean8, .code39, .code128, .qr, .dataMatrix]),
          .text(languages: ["de-DE", "en-US"], textContentType: nil)
        ],
        qualityLevel: .balanced,
        recognizesMultipleItems: true,
        isHighFrameRateTrackingEnabled: false,
        isPinchToZoomEnabled: true,
        isGuidanceEnabled: true,
        isHighlightingEnabled: true
      )
      controller.delegate = self

      let navigationController = UINavigationController(rootViewController: controller)
      navigationController.modalPresentationStyle = .fullScreen
      controller.title = "Packung scannen"
      controller.navigationItem.leftBarButtonItem = UIBarButtonItem(
        title: "Abbrechen",
        style: .plain,
        target: self,
        action: #selector(self.cancelScan)
      )
      controller.navigationItem.rightBarButtonItem = UIBarButtonItem(
        title: "Übernehmen",
        style: .done,
        target: self,
        action: #selector(self.finishScan)
      )

      self.scanner = controller
	    presenter.present(navigationController, animated: true) {
	        do {
	          try controller.startScanning()
	        } catch {
	          Task { @MainActor in
	            self.cleanupAndDismiss(controller)
	          }
	          reject("VISION_SCANNER_START_ERROR", "Scan konnte nicht gestartet werden: \(error.localizedDescription)", error)
	        }
	      }
	    }
	  }

	  @objc private func cancelScan() {
	    guard resolve != nil else { return }
	    guard #available(iOS 16.0, *), let controller = scanner as? DataScannerViewController else {
	      cleanup()
	      return
	    }
	    Task { @MainActor in
	      cleanupAndDismiss(controller)
	      resolve?(["cancelled": true])
	      cleanup()
	    }
	  }

	  @objc private func finishScan() {
	    guard resolve != nil else { return }
	    guard #available(iOS 16.0, *), let controller = scanner as? DataScannerViewController else {
	      resolve?(buildResult())
	      cleanup()
	      return
	    }
	    let result = buildResult()
	    Task { @MainActor in
	      cleanupAndDismiss(controller)
	      resolve?(result)
	      cleanup()
	    }
	  }

  private func buildResult() -> [String: Any] {
    return [
      "barcode": recognizedBarcode ?? "",
      "textLines": Array(recognizedTexts).sorted(),
      "text": Array(recognizedTexts).sorted().joined(separator: "\n")
    ]
  }

  @available(iOS 16.0, *)
  @MainActor
  private func cleanupAndDismiss(_ controller: DataScannerViewController) {
    controller.stopScanning()
    controller.dismiss(animated: true)
  }

  private func cleanup() {
    resolve = nil
    reject = nil
    scanner = nil
    recognizedTexts.removeAll()
    recognizedBarcode = nil
  }
}

@available(iOS 16.0, *)
extension MedicationVisionScanner: DataScannerViewControllerDelegate {
  func dataScanner(_ dataScanner: DataScannerViewController,
                   didAdd addedItems: [RecognizedItem],
                   allItems: [RecognizedItem]) {
    collect(items: allItems)
  }

  func dataScanner(_ dataScanner: DataScannerViewController,
                   didUpdate updatedItems: [RecognizedItem],
                   allItems: [RecognizedItem]) {
    collect(items: allItems)
  }

  func dataScanner(_ dataScanner: DataScannerViewController,
                   didTapOn item: RecognizedItem) {
    collect(items: [item])
    if recognizedBarcode != nil {
      finishScan()
    }
  }

  private func collect(items: [RecognizedItem]) {
    for item in items {
      switch item {
      case .barcode(let barcode):
        if let value = barcode.payloadStringValue, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
          recognizedBarcode = value
        }
      case .text(let text):
        let value = text.transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        if !value.isEmpty {
          recognizedTexts.insert(value)
        }
      @unknown default:
        continue
      }
    }
  }
}

@objc(MedicationPackageScanner)
class MedicationPackageScanner: MedicationVisionScanner {
  @objc func scanPackage(_ resolve: @escaping RCTPromiseResolveBlock,
                         rejecter reject: @escaping RCTPromiseRejectBlock) {
    scanMedicationPackage(resolve, rejecter: reject)
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
    let readable = value
      .replacingOccurrences(of: "ß", with: "ss")
      .replacingOccurrences(of: "ẞ", with: "SS")
    let allowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ._-")
    let sanitized = readable.unicodeScalars.map { allowed.contains($0) ? Character($0) : " " }
    let name = String(sanitized)
      .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
      .trimmingCharacters(in: .whitespacesAndNewlines)
    return name.hasSuffix(".pdf") ? name : "\(name).pdf"
  }

  @objc static func requiresMainQueueSetup() -> Bool {
    return false
  }
}

@objc(DeviceTransferFile)
class DeviceTransferFile: NSObject, UIDocumentPickerDelegate {

  private let pendingTransferPackageKey = "MMPPendingTransferPackage"
  private var pickResolve: RCTPromiseResolveBlock?
  private var pickReject: RCTPromiseRejectBlock?

  @objc static func requiresMainQueueSetup() -> Bool {
    return true
  }

  @objc func shareTransferFile(_ fileName: String,
                               content: String,
                               resolver resolve: @escaping RCTPromiseResolveBlock,
                               rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      do {
        let url = try self.writeTransferFile(fileName: fileName, content: content)
        guard let presenter = RCTPresentedViewController() else {
          reject("TRANSFER_SHARE_ERROR", "Kein aktives Fenster zum Teilen gefunden.", nil)
          return
        }

        let hint = "Im Anhang liegt ein verschlüsseltes Mein MediPlan Transferpaket. Den Sicherheitscode bitte getrennt übermitteln."
        let controller = UIActivityViewController(activityItems: [url, hint], applicationActivities: nil)
        controller.popoverPresentationController?.sourceView = presenter.view
        controller.completionWithItemsHandler = { _, _, _, _ in
          resolve(true)
        }
        presenter.present(controller, animated: true)
      } catch {
        reject("TRANSFER_SHARE_ERROR", "Sicheres Paket konnte nicht geteilt werden: \(error.localizedDescription)", error)
      }
    }
  }

  @objc func pickTransferFile(_ resolve: @escaping RCTPromiseResolveBlock,
                              rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      guard self.pickResolve == nil else {
        reject("TRANSFER_PICK_ERROR", "Es läuft bereits eine Dateiauswahl.", nil)
        return
      }
      guard let presenter = RCTPresentedViewController() else {
        reject("TRANSFER_PICK_ERROR", "Kein aktives Fenster zum Auswählen gefunden.", nil)
        return
      }

      self.pickResolve = resolve
      self.pickReject = reject

      let supportedTypes: [UTType] = [
        UTType(filenameExtension: "mmptransfer") ?? .data,
        .data,
        .plainText
      ]
      let picker = UIDocumentPickerViewController(forOpeningContentTypes: supportedTypes, asCopy: true)
      picker.delegate = self
      picker.allowsMultipleSelection = false
      presenter.present(picker, animated: true)
    }
  }

  @objc func getPendingTransferFile(_ resolve: @escaping RCTPromiseResolveBlock,
                                    rejecter reject: @escaping RCTPromiseRejectBlock) {
    let content = UserDefaults.standard.string(forKey: pendingTransferPackageKey)
    guard let content, content.contains("MEIN_MEDIPLAN_TRANSFER") else {
      resolve(nil)
      return
    }
    resolve(content)
  }

  @objc func clearPendingTransferFile(_ resolve: @escaping RCTPromiseResolveBlock,
                                      rejecter reject: @escaping RCTPromiseRejectBlock) {
    UserDefaults.standard.removeObject(forKey: pendingTransferPackageKey)
    resolve(nil)
  }

  @objc func randomBytes(_ byteCount: NSNumber,
                         resolver resolve: @escaping RCTPromiseResolveBlock,
                         rejecter reject: @escaping RCTPromiseRejectBlock) {
    let count = byteCount.intValue
    guard count > 0 && count <= 1024 else {
      reject("TRANSFER_RANDOM_ERROR", "Ungültige Anzahl Zufallsbytes.", nil)
      return
    }
    var bytes = [UInt8](repeating: 0, count: count)
    let status = SecRandomCopyBytes(kSecRandomDefault, count, &bytes)
    guard status == errSecSuccess else {
      reject("TRANSFER_RANDOM_ERROR", "Zufallsbytes konnten nicht erzeugt werden.", nil)
      return
    }
    resolve(Data(bytes).base64EncodedString())
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    pickResolve?(nil)
    clearPickPromise()
  }

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    guard let url = urls.first else {
      pickReject?("TRANSFER_PICK_ERROR", "Keine Datei ausgewählt.", nil)
      clearPickPromise()
      return
    }

    do {
      let content = try String(contentsOf: url, encoding: .utf8)
      pickResolve?(content)
    } catch {
      pickReject?("TRANSFER_PICK_ERROR", "Sicheres Paket konnte nicht gelesen werden: \(error.localizedDescription)", error)
    }
    clearPickPromise()
  }

  private func clearPickPromise() {
    pickResolve = nil
    pickReject = nil
  }

  private func writeTransferFile(fileName: String, content: String) throws -> URL {
    let safeName = sanitizeTransferFileName(fileName)
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(safeName)
    try content.write(to: url, atomically: true, encoding: .utf8)
    return url
  }

  private func sanitizeTransferFileName(_ value: String) -> String {
    let allowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._-")
    let scalars = value.unicodeScalars.map { allowed.contains($0) ? Character($0) : "-" }
    let sanitized = String(scalars).replacingOccurrences(of: "-+", with: "-", options: .regularExpression)
      .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    let base = sanitized.isEmpty ? "mein-mediplan-transfer.mmptransfer" : sanitized
    return base.hasSuffix(".mmptransfer") ? base : "\(base).mmptransfer"
  }
}
