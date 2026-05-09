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

    waitForMedicationCard(name: "Wochentag Test", stock: "Bestand: 6 Tabletten")
    waitForMedicationCardLabelContaining("Reichweite: 13 Tage")
    waitForMedicationCardLabelContaining("bis 22.05.2026")
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

  private func openAddMedication() {
    let addButton = app.buttons["add-medication-button"]
    XCTAssertTrue(addButton.waitForExistence(timeout: 20))

    if addButton.isHittable {
      addButton.tap()
    } else {
      app.coordinate(withNormalizedOffset: CGVector(dx: 0.87, dy: 0.90)).tap()
    }
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
}
