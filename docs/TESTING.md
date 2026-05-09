# Testing

This app keeps one shared functional target for Android and iOS. New features, behavior changes, and app assets must be checked on both platforms before they are treated as production-ready.

## Local Gate

Run these checks before release work:

```bash
npm run e2e:doctor
npm run lint
npm run typecheck
npm test -- --runInBand --forceExit
```

For native build confidence:

```bash
xcodebuild -workspace ios/MeineMedikamente.xcworkspace -scheme MeineMedikamente -configuration Debug -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO SKIP_BUNDLING=1 build
cd android && JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home ./gradlew assembleDebug
```

Android builds should use JDK 17 locally. JDK 25 can fail React Native native/CMake setup with Java restricted-method warnings.

## End-to-End Tests

Android E2E uses Maestro for the full flow matrix. iOS uses XCTest UI tests for the medication add flows, because the current Maestro/iOS 26 simulator driver can read the hierarchy but does not trigger some React Native taps reliably.

Install Maestro on macOS:

```bash
brew tap mobile-dev-inc/tap
brew install mobile-dev-inc/tap/maestro
```

Run all flows against the active device or simulator:

```bash
npm run e2e
```

Run by platform intent:

```bash
npm run e2e:ios
npm run e2e:android
```

The npm E2E scripts run Maestro flows sequentially. Do not pass several flow files to one raw `maestro test` invocation on the same device; Maestro may shard them and the flows can interfere with each other.

iOS add-medication E2E runs through the native XCTest UI target:

```bash
npm run e2e:ios
npm run e2e:ios:xctest
IOS_SIMULATOR_NAME="iPhone 17 Pro" npm run e2e:ios:xctest
```

The XCTest flow launches `com.meinemedikamente`, opens the add screen, applies the tablet and liquid debug presets, saves through the normal app path, confirms the success dialog, and verifies the resulting stock labels on the home medication cards.
Before running, `scripts/run-ios-xctest.sh` tries to uninstall `com.meinemedikamente` from the target simulator so the Free-tier limit and existing local SQLite data cannot leak between runs.

The Maestro smoke flow is still available as an explicit diagnostic command. `scripts/run-ios-maestro-smoke.sh` selects a booted iOS simulator, so attached Android devices are not picked accidentally:

```bash
npm run e2e:ios:maestro
IOS_SIMULATOR_ID="<iOS simulator UDID>" npm run e2e:ios:maestro
```

For Android debug builds, make sure the emulator can reach Metro before launching the flows:

```bash
adb -s emulator-5554 reverse tcp:8081 tcp:8081
MAESTRO_DEVICE=emulator-5554 npm run e2e:android
```

The current critical flows clear app state, launch `com.meinemedikamente`, add tablet, liquid and premium spray medications, confirm the success dialog, and verify the medication appears on the home screen. Android also checks that free users cannot choose premium units.

Android numeric keyboard automation can be unreliable for stock fields in debug builds. The add-medication E2E flows therefore use debug-only preset buttons in `AddMedikamentScreen` to save deterministic preset records through the same database path and success confirmation as the production save flow:

- Tablet preset: `Ibuprofen Test`, `20 Tabletten`
- Liquid preset: `Paracetamol Saft`, `100 ml`
- Premium spray preset: `Salbutamol Spray`, `200 Hübe`

These controls are guarded by `__DEV__`, so release builds do not expose them.

## Forecast Coverage

Unit tests cover the current forecast model:

- one daily intake
- multiple daily intakes
- half-tablet / individual slot dose calculations
- selected weekdays, for example Monday/Wednesday/Friday, calculated by calendar days instead of pretending the medication is taken daily
- slot-specific stock deduction, so reminder confirmation and manual intake can reduce the stock by the planned dose instead of always using the default single dose

## PZN And Barcode

Unit tests cover scanner normalization and PZN check digits, including common scanner strings such as `PZN - 00078597` and `-00078597`. Real camera recognition still needs a physical device check with a real medication package or a printed Code 39/PZN barcode because the native camera feed cannot be fully simulated by Jest.

The dosage-form matrix is documented in [MEDICATION_TEST_MATRIX.md](MEDICATION_TEST_MATRIX.md). At minimum, E2E must cover a solid medication and a liquid medication (`ml`).

The Freemium split is documented in [PREMIUM_MODEL.md](PREMIUM_MODEL.md).

## Senior UI Check

Every visible Android and iOS change must be checked against the senior-first direction in [SENIOR_FIRST_ROADMAP.md](SENIOR_FIRST_ROADMAP.md):

- text is readable without dense blocks
- important numbers and fractions do not make cards visually noisy
- labels do not wrap awkwardly or get clipped
- free users see useful core features before premium prompts
- premium prompts appear only at clear limits or when using premium actions

If Maestro can read the hierarchy but iOS taps do not trigger UI actions on an iOS 26 simulator, keep iOS add-flow validation on XCTest until the local Maestro/iOS driver combination is updated.

## Static Quality

`npm run lint` intentionally uses a deterministic local gate: TypeScript compilation plus a repository check for raw `console.*` calls and focused tests. The installed React Native ESLint preset currently does not terminate reliably in this Node environment, so it is not part of the production gate until the toolchain is upgraded.
