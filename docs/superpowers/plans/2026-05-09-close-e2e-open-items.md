# Close E2E Open Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining Android/iOS E2E and asset parity items for "Meine Medikamente".

**Architecture:** Keep Android on Maestro and iOS on XCTest for mutation-heavy flows. Use the existing debug premium override for iOS Premium coverage instead of adding production reset/test hooks.

**Tech Stack:** React Native, Maestro, XCTest UI tests, Xcode simulator, Android adb/Maestro.

---

### Task 1: Extend iOS XCTest Coverage

**Files:**
- Modify: `ios/MeineMedikamenteTests/MeineMedikamenteUITests.swift`

- [x] Add an XCTest that verifies Free blocks `Hübe`.
- [x] Activate `Premium simulieren` via the Settings debug controls.
- [x] Add the spray preset and assert `Salbutamol Spray` with `Bestand: 200 Hübe`.
- [x] Run `npm run e2e:ios`.

### Task 2: Reconfirm Android E2E

**Files:**
- No code changes expected.

- [x] Run `adb devices`.
- [x] Run Android Maestro on the connected Android target.
- [x] Record whether all Maestro flows pass.

### Task 3: Production Gate And Asset Parity

**Files:**
- Modify docs only if commands or findings change.

- [x] Run `npm run e2e:doctor`.
- [x] Run `npm run lint`.
- [x] Run `npm test -- --runInBand --forceExit`.
- [x] Check Android/iOS app icon assets for matching source identity and complete generated sizes.

Result on 2026-05-09:

- Android Maestro passed on `ZY22J5R69L`: smoke, tablet, liquid, free premium gate, premium spray.
- iOS XCTest passed on iPhone 17 Pro simulator: 2 tests, 0 failures.
- Icon assets now use the shared `assets/app-icon-c1.svg` source and RGB PNG outputs on both platforms.
