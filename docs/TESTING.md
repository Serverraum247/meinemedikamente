# Testing

This app keeps one shared functional target for Android and iOS. New features, behavior changes, and app assets must be checked on both platforms before they are treated as production-ready.

## Local Gate

Run these checks before release work:

```bash
npm run doctor:build
npm run e2e:doctor
npm run lint
npm run typecheck
npm test -- --runInBand --forceExit
```

`doctor:build` is the fail-fast gate for native deploy work. It checks the local toolchain, attached Android/iOS device visibility, React Native config/autolinking health, and duplicate Git branch ref files before Gradle or Xcode are allowed to spend minutes in a build.

Wenn Android-Cloud-Backup-Code im Projekt aktiv ist, prüft `doctor:build` zusätzlich hart die Firebase-Verdrahtung: `google-services`-Classpath, App-Plugin und `android/app/google-services.json` inklusive der erwarteten Package-Clients für `dev.serverraum247.meinmediplan` und `dev.serverraum247.meinmediplan.internal`. Fehlt davon etwas, darf weder Build noch Geräte-Deploy als gesund gelten.

For native build confidence and device installation, use the project harness:

```bash
npm run android:internal:build
npm run ios:internal:build
npm run deploy:devices
```

Before Android deployment, `npm run deploy:devices` removes duplicate local Android launcher variants and keeps the internal test package `dev.serverraum247.meinmediplan.internal`. The same guard can be run directly:

```bash
npm run android:variants:check
npm run android:variants:clean
```

The internal build scripts write full logs to `/tmp/meinmediplan-android-internal-build.log` and `/tmp/meinmediplan-ios-internal-build.log`. On failure they print the last relevant lines, so the next action is visible without scrolling through a full native build.

The lower-level manual commands remain useful when isolating platform-specific signing or Gradle/Xcode issues:

```bash
xcodebuild -workspace ios/MeineMedikamente.xcworkspace -scheme MeineMedikamente -configuration Debug -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO SKIP_BUNDLING=1 build
cd android && JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home ./gradlew assembleDebug
```

Android builds should use JDK 17 locally. JDK 25 can fail React Native native/CMake setup with Java restricted-method warnings.

## Native Harness Rules

Native builds must not be started directly when `npm run doctor:build` fails. The most expensive current failure mode is a hanging `react-native config` call inside React Native autolinking. Android reaches this path through Gradle settings autolinking; iOS reaches it during React Native bundling. The probe script `scripts/rn-config-probe.js` prints the dependency it is checking before touching its platform config, so a hang points at the last printed native package instead of a black-box Gradle/Xcode timeout.

If the doctor reports duplicate Git ref files such as `.git/refs/heads/... 2`, inspect the normal ref and the duplicate before removing only the duplicated `* 2` file. This prevents failed rebase/push cycles caused by stale local refs.

Recommended day-to-day loop:

```bash
npm run typecheck
npm run static:quality
npm run doctor:build
```

Only after these are clean should a local device build or deploy be started.

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

The current critical flows clear app state, launch `dev.serverraum247.meinmediplan`, add tablet, liquid and premium spray medications, confirm the success dialog, and verify the medication appears on the home screen. Android also checks that free users cannot choose premium units.

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

## Datenwiederherstellung

Die aktuelle Android-App bietet unter `Einstellungen` → `Speicherung` → `Handy wechseln` den Import eines sicheren Transferpakets (`.mmptransfer`) an. Dieser Pfad ist nicht nur für ein altes Handy gedacht, sondern auch für wiedergefundene Alt-Daten.

Für einen Gerätewechsel vom iPhone gilt derselbe Pfad: Auf dem alten iPhone in `Handy wechseln` ein sicheres Paket erzeugen und teilen, auf dem Android-Zielgerät dasselbe Paket auswählen und mit dem separat notierten Sicherheitscode importieren.

Wenn eine alte SQLite-Datei `meine_medikamente.db` vorliegt, kann daraus lokal ein importierbares Paket erzeugt werden:

```bash
npm run device-transfer:from-db -- --db /pfad/zur/meine_medikamente.db --out /tmp/mein-transfer.mmptransfer --verify
```

Optional kann ein fester Sicherheitscode gesetzt werden:

```bash
npm run device-transfer:from-db -- --db /pfad/zur/meine_medikamente.db --out /tmp/mein-transfer.mmptransfer --code 1111-2222-3333-4444-5555-6666-7777-8888 --verify
```

Der Konverter entfernt nicht portable Einstellungen wie lokale Premium-Overrides und erzeugt genau das Paketformat, das `Handy wechseln` in der App importiert.

Der Konverter selbst hat einen reproduzierbaren Smoke-Test:

```bash
npm run device-transfer:from-db:test
```

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
