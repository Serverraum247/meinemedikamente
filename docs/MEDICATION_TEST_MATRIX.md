# Medication Test Matrix

The app must cover one shared medication model on Android and iOS. Test data should include more than tablets because real medication inventories use solid, liquid, topical, transdermal, rectal, inhaled and injectable forms.

Sources used for the categories:

- FDA dosage-form terms include tablets, capsules, creams, solutions, suspensions and drops: https://www.fda.gov/industry/structured-product-labeling-resources/dosage-forms
- FDA strength guidance distinguishes oral solids, injectable liquids, inhalation liquids and topical creams/ointments by quantity basis: https://www.fda.gov/drugs/electronic-drug-registration-and-listing-system-edrls/strength-conversion-drug-listing
- gesund.bund.de describes common German patient-facing forms such as tablets, capsules, sprays, drops, suppositories, patches, ointments and juices: https://gesund.bund.de/arzneimittel-anwendungsformen
- EDQM Standard Terms are the European reference for pharmaceutical dose forms, administration routes and units of presentation: https://www.edqm.eu/en/standard-terms-database

## Required Regression Examples

| Category | Example test medication | Unit | Why it matters |
| --- | --- | --- | --- |
| Solid oral | Ibuprofen Test | Tabletten | Baseline stock, dose and range calculation. |
| Capsule | Omeprazol Test | Kapseln | Same oral workflow, different unit label. |
| Oral liquid | Paracetamol Saft | ml | Liquid dose and stock must not be forced into tablets. |
| Drops | Vitamin D Tropfen | Tropfen | Small integer doses and bottle stock. |
| Spray / inhaler | Salbutamol Spray | Hübe | Stock is counted in actuations, not pieces or ml. |
| Topical | Diclofenac Gel | g | Creams/gels are tracked by weight. |
| Transdermal | Schmerzpflaster Test | Pflaster | Replacement intervals and stock are unit-based patches. |
| Rectal | Fieberzäpfchen Test | Zäpfchen | Pediatric/elder-care use case, solid but not tablet/capsule. |
| Injectable vial | B12 Ampullen | Ampullen | Single-use containers are counted as ampoules. |
| Prefilled syringe | Heparin Spritzen | Spritzen | Injection stock is counted as syringes. |

Current automated E2E coverage:

- `.maestro/add-medication.yaml`: solid oral medication (`Tabletten`)
- `.maestro/add-liquid-medication.yaml`: oral liquid medication (`ml`)
- `.maestro/free-premium-gating.yaml`: free tier blocks a premium unit (`Hübe`)
- `.maestro/premium-advanced-unit.yaml`: premium allows spray/inhaler stock (`Hübe`)

Freemium rule:

- Free units: `Tabletten`, `Kapseln`, `Tropfen`, `ml`, `Stück`
- Premium units: `Hübe`, `g`, `Pflaster`, `Zäpfchen`, `Ampullen`, `Spritzen`

Next E2E expansion should add one compact flow that creates the remaining unit categories up to the free limit, or seed premium/dev mode for a larger matrix run. Weekday-specific medication plans, such as "only three days per week", are represented in the reminder plan JSON and covered by unit tests; a full UI E2E should be added once the Add/Edit weekday chips are stable in Maestro/XCTest automation.
