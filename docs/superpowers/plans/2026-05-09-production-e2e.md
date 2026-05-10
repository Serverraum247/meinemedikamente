# Production E2E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the current React Native app production-checkable and add end-to-end coverage for the core medication creation journey on iOS and Android.

**Architecture:** Use the existing shared React Native UI and accessibility labels as the E2E contract, so iOS and Android are exercised through the same flows. Add Maestro YAML flows because they are platform-neutral and can run against a simulator, emulator, or connected device without adding native test projects.

**Tech Stack:** React Native 0.85, TypeScript, Jest, Xcode/Gradle builds, Maestro CLI.

---

### Task 1: Production Verification Scripts

**Files:**
- Modify: `package.json`
- Create: `scripts/check-e2e-env.sh`
- Modify: `.gitignore`
- Create: `.eslintignore`

- [x] **Step 1: Add stable npm scripts**

Add `typecheck`, scoped `lint`, `verify`, `verify:prod`, `e2e:doctor`, `e2e`, `e2e:ios`, and `e2e:android` scripts. The lint script must target app source files only, not generated iOS/Android build folders.

- [x] **Step 2: Add a Maestro environment check**

Create `scripts/check-e2e-env.sh` to verify Java, Maestro, iOS simulator availability, and Android ADB availability without mutating the machine.

- [x] **Step 3: Ignore local generated files**

Ignore `.superpowers/`, Maestro artifacts, and generated test reports so brainstorming and E2E output do not pollute source control.

### Task 2: Shared E2E Flows

**Files:**
- Create: `.maestro/smoke.yaml`
- Create: `.maestro/add-medication.yaml`

- [x] **Step 1: Add smoke launch flow**

Create a flow that clears app state, launches `dev.serverraum247.meinmediplan`, and verifies the empty medication list plus the add button.

- [x] **Step 2: Add medication creation flow**

Create a flow that clears app state, creates a test medication, confirms the success alert, returns to Home, and verifies the created medication and stock text.

### Task 3: Test Documentation

**Files:**
- Create: `docs/TESTING.md`
- Modify: `README.md`

- [x] **Step 1: Document the production gate**

Document the local verification sequence: environment check, TypeScript, Jest, native builds, and Maestro E2E.

- [x] **Step 2: Document cross-platform parity**

Call out that Android and iOS must keep one shared functional target and run the same E2E flow set.

### Task 4: Verification

**Files:**
- No source changes expected.

- [x] **Step 1: Run static verification**

Run `npm run typecheck`.

- [x] **Step 2: Run unit tests**

Run `npm test -- --runInBand --forceExit`.

- [x] **Step 3: Run E2E environment check**

Run `npm run e2e:doctor`.

- [x] **Step 4: Run native build check when feasible**

Run an iOS build with signing disabled and an Android assemble check if the local SDK is available.

Result note: iOS simulator build/run succeeded. Maestro smoke passed on the iOS 26.4 simulator, but Maestro tap gestures did not trigger the React Native button on this simulator; the same add-medication journey was verified through XcodeBuildMCP UI actions. Android E2E is implemented but not executed because no Android device/emulator is connected.
