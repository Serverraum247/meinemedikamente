# Premium Model

The app uses one shared Freemium model on Android and iOS.

## Free

Free must remain medically usable for basic medication tracking:

- Up to 3 medications
- 1 person
- 1 doctor
- 1 reminder slot per medication
- Intake tracking
- Basic units: `Tabletten`, `Kapseln`, `Tropfen`, `ml`, `Stück`
- Barcode scans: 3 per day
- No calendar entries
- No stock warnings

## Premium In-App Purchase

Premium unlocks larger households and more detailed workflows:

- Unlimited medications
- Unlimited people and doctors
- All reminder slots and custom reminder times
- Doctor assignment, doctor vacation management and calling
- Stock warnings
- Stock correction
- Calendar entries for prescription pickup or similar appointments
- Cloud backup
- Unlimited barcode scans and calendar entries
- Advanced units: `Hübe`, `g`, `Pflaster`, `Zäpfchen`, `Ampullen`, `Spritzen`

## Test Implication

E2E must verify both sides:

- Free can create a basic solid medication and a basic liquid medication.
- Free is blocked when selecting an advanced unit.
- Premium/dev override can create at least one advanced unit medication.

Implemented flow files:

- `.maestro/add-medication.yaml`
- `.maestro/add-liquid-medication.yaml`
- `.maestro/free-premium-gating.yaml`
- `.maestro/premium-advanced-unit.yaml`
