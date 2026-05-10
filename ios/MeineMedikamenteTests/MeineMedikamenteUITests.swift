import XCTest

final class MeineMedikamenteUITests: XCTestCase {
  private var app: XCUIApplication!

  override func setUpWithError() throws {
    continueAfterFailure = false
    app = XCUIApplication()
    app.launchArguments = ["--e2e-ui-tests"]
    app.launch()
  }

  func testAddMedicationPresetsPersistExpectedStockValues() throws {
    addMedication(
      presetButton: "Testdaten Tablette einsetzen",
      expectedName: "Ibuprofen Test",
      expectedStock: "Bestand: 20 Tabletten"
    )

    addMedication(
      presetButton: "Testdaten Flüssigkeit einsetzen",
      expectedName: "Paracetamol Saft",
      expectedStock: "Bestand: 100 ml"
    )
  }

  func testFreeBlocksPremiumUnitsAndPremiumAllowsSprayPreset() throws {
    openAddMedication()
    enableFreeOverrideFromCurrentForm()
    assertPremiumUnitIsBlocked()

    enablePremiumOverrideFromCurrentForm()

    addMedicationFromCurrentForm(
      presetButton: "Testdaten Spray einsetzen",
      expectedName: "Salbutamol Spray",
      expectedStock: "Bestand: 200 Hübe"
    )
  }

  func testWeekdayChipsCreateMoMiFrForecast() throws {
    openAddMedication()

    tapControl("Testdaten Wochentage einsetzen")
    tapControl("Morgens Mo inaktiv")
    tapControl("Morgens Mi inaktiv")
    tapControl("Morgens Fr inaktiv")

    let doseSummary = firstElement(label: "Dosis an Einnahmetagen: 1 Tabletten")
    scrollUntilExists(doseSummary, maxScrolls: 4)

    let saveButton = app.buttons["Medikament speichern"]
    scrollUntilHittable(saveButton)
    saveButton.tap()

    let savedAlert = app.alerts["Gespeichert"]
    XCTAssertTrue(savedAlert.waitForExistence(timeout: 10))
    savedAlert.buttons["OK"].tap()

    let expectedForecast = expectedMoMiFrForecast(stock: 6)
    waitForMedicationCard(name: "Wochentag Test", stock: "Bestand: 6 Tabletten")
    waitForMedicationCardLabelContaining("Reichweite: \(expectedForecast.days) Tage")
    waitForMedicationCardLabelContaining("bis \(expectedForecast.dateText)")
  }

  func testDuplicateMedicationShowsWarningButAllowsSave() throws {
    let duplicateName = "Duplikat E2E \(Int(Date().timeIntervalSince1970))"

    addManualMedication(name: duplicateName)

    openAddMedication()
    fillMedicationName(duplicateName)

    let saveButton = app.buttons["Medikament speichern"]
    scrollUntilHittable(saveButton)
    saveButton.tap()

    let duplicateAlert = app.alerts["Mögliches Duplikat"]
    XCTAssertTrue(duplicateAlert.waitForExistence(timeout: 10))
    duplicateAlert.buttons["Trotzdem speichern"].tap()

    let savedAlert = app.alerts["Gespeichert"]
    XCTAssertTrue(savedAlert.waitForExistence(timeout: 10))
    savedAlert.buttons["OK"].tap()

    waitForMedicationCardLabelContaining(duplicateName)
  }

  private func addManualMedication(name: String) {
    openAddMedication()
    enablePremiumOverrideFromCurrentForm()
    fillMedicationName(name)

    let saveButton = app.buttons["Medikament speichern"]
    scrollUntilHittable(saveButton)
    saveButton.tap()

    let savedAlert = app.alerts["Gespeichert"]
    XCTAssertTrue(savedAlert.waitForExistence(timeout: 10))
    savedAlert.buttons["OK"].tap()

    waitForMedicationCardLabelContaining(name)
  }

  func testICloudBackupCreateStatusAndRestore() throws {
    openAddMedication()
    enablePremiumOverrideFromCurrentForm()

    app.terminate()
    app.launch()

    openBackup()

    XCTAssertTrue(firstElement(label: "Lokale Daten auf diesem Gerät").waitForExistence(timeout: 10))

    let createButton = app.buttons["Cloud-Backup erstellen"]
    scrollUntilHittable(createButton)
    createButton.tap()

    let createAlert = app.alerts["iCloud-Backup erstellen"]
    XCTAssertTrue(createAlert.waitForExistence(timeout: 10))
    createAlert.buttons["Backup erstellen"].tap()

    let createSuccess = app.alerts["Backup erfolgreich"]
    XCTAssertTrue(createSuccess.waitForExistence(timeout: 30))
    createSuccess.buttons["OK"].tap()

    waitForBackupStatus()

    let restoreButton = app.buttons["Backup wiederherstellen"]
    scrollUntilHittable(restoreButton)
    restoreButton.tap()

    let restoreAlert = app.alerts["Backup wiederherstellen"]
    XCTAssertTrue(restoreAlert.waitForExistence(timeout: 10))
    restoreAlert.buttons["Wiederherstellen"].tap()

    let restoreSuccess = app.alerts["Wiederherstellung erfolgreich"]
    XCTAssertTrue(restoreSuccess.waitForExistence(timeout: 30))
    restoreSuccess.buttons["OK"].tap()

    waitForBackupStatus()
  }

  private func addMedication(
    presetButton: String,
    expectedName: String,
    expectedStock: String
  ) {
    openAddMedication()
    addMedicationFromCurrentForm(
      presetButton: presetButton,
      expectedName: expectedName,
      expectedStock: expectedStock
    )
  }

  private func addMedicationFromCurrentForm(
    presetButton: String,
    expectedName: String,
    expectedStock: String
  ) {
    let preset = app.buttons[presetButton]
    XCTAssertTrue(preset.waitForExistence(timeout: 10))
    preset.tap()

    let saveButton = app.buttons["Medikament speichern"]
    scrollUntilHittable(saveButton)
    saveButton.tap()

    let savedAlert = app.alerts["Gespeichert"]
    XCTAssertTrue(savedAlert.waitForExistence(timeout: 10))
    savedAlert.buttons["OK"].tap()

    waitForMedicationCard(name: expectedName, stock: expectedStock)
  }

  private func assertPremiumUnitIsBlocked() {
    let premiumUnit = app.buttons["Einheit: Hübe, nur mit Premium möglich"]
    scrollUntilExists(premiumUnit)
    premiumUnit.tap()

    let premiumAlert = app.alerts["Nur mit Premium möglich"]
    XCTAssertTrue(premiumAlert.waitForExistence(timeout: 10))
    premiumAlert.buttons["Abbrechen"].tap()
  }

  private func enablePremiumOverrideFromCurrentForm() {
    let premiumButton = app.buttons["Premium für E2E simulieren"]
    scrollTowardTopUntilExists(premiumButton)
    premiumButton.tap()

    XCTAssertTrue(app.buttons["Testdaten Spray einsetzen"].waitForExistence(timeout: 10))
  }

  private func enableFreeOverrideFromCurrentForm() {
    let freeButton = app.buttons["Free für E2E simulieren"]
    scrollTowardTopUntilExists(freeButton)
    freeButton.tap()

    XCTAssertTrue(app.buttons["Einheit: Hübe, nur mit Premium möglich"].waitForExistence(timeout: 10))
  }

  private func openAddMedication() {
    let addButton = app.buttons["add-medication-button"]
    XCTAssertTrue(addButton.waitForExistence(timeout: 20))

    if addButton.isHittable {
      addButton.tap()
    } else {
      app.coordinate(withNormalizedOffset: CGVector(dx: 0.87, dy: 0.90)).tap()
    }
  }

  private func fillMedicationName(_ name: String) {
    let nameInputByIdentifier = app.textFields["medication-name-input"]
    let nameInput = nameInputByIdentifier.exists ? nameInputByIdentifier : app.textFields["Name"]
    XCTAssertTrue(nameInput.waitForExistence(timeout: 10))
    nameInput.tap()
    nameInput.typeText(name)
    dismissKeyboardIfNeeded()
  }

  private func dismissKeyboardIfNeeded() {
    guard app.keyboards.element.exists else { return }

    let returnButton = app.keyboards.buttons["Return"]
    if returnButton.exists {
      returnButton.tap()
    } else {
      app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.15)).tap()
    }
  }

  private func openBackup() {
    let menuButton = app.buttons["Menü öffnen"]
    XCTAssertTrue(menuButton.waitForExistence(timeout: 10))
    menuButton.tap()

    let backupButton = app.buttons["Cloud-Backup"]
    XCTAssertTrue(backupButton.waitForExistence(timeout: 10))
    backupButton.tap()
  }

  private func scrollUntilHittable(_ element: XCUIElement, maxScrolls: Int = 8) {
    for _ in 0..<maxScrolls where !element.isHittable {
      app.swipeUp()
    }
    XCTAssertTrue(element.isHittable)
  }

  private func scrollUntilExists(_ element: XCUIElement, maxScrolls: Int = 8) {
    for _ in 0..<maxScrolls where !element.exists {
      app.swipeUp()
    }
    XCTAssertTrue(element.exists)
  }

  private func scrollTowardTopUntilExists(_ element: XCUIElement, maxScrolls: Int = 8) {
    for _ in 0..<maxScrolls where !element.exists {
      app.swipeDown()
    }
    XCTAssertTrue(element.exists)
  }

  private func tapControl(_ label: String) {
    let element = firstElement(label: label)
    scrollUntilExists(element, maxScrolls: 10)
    if !element.isHittable {
      scrollUntilHittable(element, maxScrolls: 4)
    }
    element.tap()
  }

  private func firstElement(label: String) -> XCUIElement {
    let exact = NSPredicate(format: "label == %@", label)
    return app.descendants(matching: .any).matching(exact).firstMatch
  }

  private func waitForMedicationCard(name: String, stock: String) {
    let namePredicate = NSPredicate(format: "label CONTAINS %@", name)
    let stockPredicate = NSPredicate(format: "label CONTAINS %@", stock)

    XCTAssertTrue(app.buttons.matching(namePredicate).firstMatch.waitForExistence(timeout: 10))
    XCTAssertTrue(app.buttons.matching(stockPredicate).firstMatch.waitForExistence(timeout: 10))
  }

  private func waitForMedicationCardLabelContaining(_ text: String) {
    let predicate = NSPredicate(format: "label CONTAINS %@", text)
    XCTAssertTrue(app.buttons.matching(predicate).firstMatch.waitForExistence(timeout: 10))
  }

  private func waitForBackupStatus() {
    let lastBackupPredicate = NSPredicate(format: "label CONTAINS %@", "Letztes Backup:")
    let medicationCountPredicate = NSPredicate(format: "label CONTAINS %@", "Medikamente gesichert")
    XCTAssertTrue(app.staticTexts.matching(lastBackupPredicate).firstMatch.waitForExistence(timeout: 20))
    XCTAssertTrue(app.staticTexts.matching(medicationCountPredicate).firstMatch.waitForExistence(timeout: 20))
  }

  private func expectedMoMiFrForecast(stock: Int) -> (days: Int, dateText: String) {
    let calendar = Calendar.current
    let intakeWeekdays: Set<Int> = [2, 4, 6] // Calendar weekday: So=1, Mo=2, Mi=4, Fr=6
    var remaining = stock
    var days = 0
    var date = Date()

    while remaining > 0 {
      days += 1
      date = calendar.date(byAdding: .day, value: 1, to: date) ?? date
      if intakeWeekdays.contains(calendar.component(.weekday, from: date)) {
        remaining -= 1
      }
    }

    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "de_DE")
    formatter.dateFormat = "dd.MM.yyyy"
    return (days, formatter.string(from: date))
  }
}
