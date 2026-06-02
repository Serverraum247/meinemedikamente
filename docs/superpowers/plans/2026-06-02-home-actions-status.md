# Home Actions Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the technical `Protokollieren` block with a senior-friendly `Aktionen` block that prioritizes missed intake backfills, today's open intakes, and the all-done state.

**Architecture:** Add a small pure helper for deriving the Home action status from existing HomeScreen state and backfill groups. HomeScreen loads the backfill summary alongside the existing daily refresh and renders one clear status card. The existing `EinnahmeNachtragService` and modals remain the source of truth.

**Tech Stack:** React Native, TypeScript, Jest, existing SQLite-backed medication services.

---

## File Structure

- Create `src/utils/HomeActionStatus.ts`: pure status derivation for `missed`, `todayOpen`, and `done`.
- Create `src/__tests__/HomeActionStatus.test.ts`: unit tests for status priority, severity, German copy, and pluralization.
- Modify `src/screens/HomeScreen.tsx`: load missed backfill groups, rename `Protokollieren` to `Aktionen`, remove help button, render the new single action card, keep the existing modals.
- Modify `package.json`: bump version to `0.1.57`.
- Modify `android/app/build.gradle`: bump `versionCode` to `58`, `versionName` to `0.1.57`.
- Modify `ios/MeineMedikamente.xcodeproj/project.pbxproj`: bump `CURRENT_PROJECT_VERSION` to `58`, `MARKETING_VERSION` to `0.1.57`.

---

### Task 1: Add Pure Home Action Status Helper

**Files:**
- Create: `src/utils/HomeActionStatus.ts`
- Test: `src/__tests__/HomeActionStatus.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/HomeActionStatus.test.ts`:

```ts
import {
  buildHomeActionStatus,
  formatProtocolEntryCount,
  type HomeMissedGroup,
} from '../utils/HomeActionStatus';

const yesterdayOnly: HomeMissedGroup[] = [
  { datumIso: '2026-06-01', itemCount: 3 },
];

const multipleDays: HomeMissedGroup[] = [
  { datumIso: '2026-06-01', itemCount: 3 },
  { datumIso: '2026-05-31', itemCount: 2 },
];

describe('HomeActionStatus', () => {
  it('prioritizes missed past intakes over today open intakes', () => {
    expect(buildHomeActionStatus({
      missedGroups: yesterdayOnly,
      todayOpenCount: 2,
      plannedTodayCount: 3,
      loggedTodayCount: 0,
    })).toEqual({
      kind: 'missed',
      severity: 'warning',
      title: 'Einnahmen fehlen',
      message: 'Für gestern sind geplante Einnahmen nicht protokolliert.',
      actionLabel: 'Jetzt nachtragen',
      missedDayCount: 1,
      missedItemCount: 3,
    });
  });

  it('uses critical severity when missed intakes span more than one day', () => {
    expect(buildHomeActionStatus({
      missedGroups: multipleDays,
      todayOpenCount: 0,
      plannedTodayCount: 3,
      loggedTodayCount: 0,
    })).toEqual({
      kind: 'missed',
      severity: 'critical',
      title: 'Einnahmen fehlen',
      message: 'Für mehrere Tage fehlen geplante Einnahmen.',
      actionLabel: 'Jetzt nachtragen',
      missedDayCount: 2,
      missedItemCount: 5,
    });
  });

  it('shows today open when no older missed intakes exist', () => {
    expect(buildHomeActionStatus({
      missedGroups: [],
      todayOpenCount: 1,
      plannedTodayCount: 3,
      loggedTodayCount: 0,
    })).toEqual({
      kind: 'todayOpen',
      severity: 'attention',
      title: 'Heute noch offen',
      message: 'Eine Einnahme kann bestätigt werden.',
      actionLabel: 'Heute bestätigen',
    });
  });

  it('shows done when no action is pending', () => {
    expect(buildHomeActionStatus({
      missedGroups: [],
      todayOpenCount: 0,
      plannedTodayCount: 3,
      loggedTodayCount: 0,
    })).toEqual({
      kind: 'done',
      severity: 'success',
      title: 'Heute erledigt',
      message: 'Alle geplanten Einnahmen sind protokolliert.',
      actionLabel: undefined,
    });
  });

  it('formats protocol count with German umlaut plural', () => {
    expect(formatProtocolEntryCount(0)).toBe('0 Einträge im heutigen Protokoll');
    expect(formatProtocolEntryCount(1)).toBe('1 Eintrag im heutigen Protokoll');
    expect(formatProtocolEntryCount(2)).toBe('2 Einträge im heutigen Protokoll');
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm test -- --runInBand --no-cache src/__tests__/HomeActionStatus.test.ts
```

Expected: FAIL because `src/utils/HomeActionStatus.ts` does not exist.

- [ ] **Step 3: Implement the helper**

Create `src/utils/HomeActionStatus.ts`:

```ts
export type HomeActionStatusKind = 'missed' | 'todayOpen' | 'done';
export type HomeActionSeverity = 'critical' | 'warning' | 'attention' | 'success';

export interface HomeMissedGroup {
  datumIso: string;
  itemCount: number;
}

export interface BuildHomeActionStatusInput {
  missedGroups: HomeMissedGroup[];
  todayOpenCount: number;
  plannedTodayCount: number;
  loggedTodayCount: number;
}

export interface HomeActionStatus {
  kind: HomeActionStatusKind;
  severity: HomeActionSeverity;
  title: string;
  message: string;
  actionLabel?: string;
  missedDayCount?: number;
  missedItemCount?: number;
}

export function buildHomeActionStatus(input: BuildHomeActionStatusInput): HomeActionStatus {
  const missedDayCount = input.missedGroups.length;

  if (missedDayCount > 0) {
    const missedItemCount = input.missedGroups.reduce((sum, group) => sum + group.itemCount, 0);
    return {
      kind: 'missed',
      severity: missedDayCount > 1 ? 'critical' : 'warning',
      title: 'Einnahmen fehlen',
      message: missedDayCount > 1
        ? 'Für mehrere Tage fehlen geplante Einnahmen.'
        : 'Für gestern sind geplante Einnahmen nicht protokolliert.',
      actionLabel: 'Jetzt nachtragen',
      missedDayCount,
      missedItemCount,
    };
  }

  if (input.todayOpenCount > 0) {
    return {
      kind: 'todayOpen',
      severity: 'attention',
      title: 'Heute noch offen',
      message: input.todayOpenCount === 1
        ? 'Eine Einnahme kann bestätigt werden.'
        : `${input.todayOpenCount} Einnahmen können bestätigt werden.`,
      actionLabel: 'Heute bestätigen',
    };
  }

  return {
    kind: 'done',
    severity: 'success',
    title: 'Heute erledigt',
    message: input.plannedTodayCount > 0
      ? 'Alle geplanten Einnahmen sind protokolliert.'
      : 'Heute keine feste Einnahme geplant.',
    actionLabel: undefined,
  };
}

export function formatProtocolEntryCount(count: number): string {
  return `${count} ${count === 1 ? 'Eintrag' : 'Einträge'} im heutigen Protokoll`;
}
```

- [ ] **Step 4: Verify helper tests pass**

Run:

```bash
npm test -- --runInBand --no-cache src/__tests__/HomeActionStatus.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit helper**

Run:

```bash
git add src/utils/HomeActionStatus.ts src/__tests__/HomeActionStatus.test.ts
git commit -m "Add home action status helper"
```

---

### Task 2: Load Missed Backfill Summary on HomeScreen

**Files:**
- Modify: `src/screens/HomeScreen.tsx`

- [ ] **Step 1: Add state and imports**

In `src/screens/HomeScreen.tsx`, import the helper:

```ts
import {
  buildHomeActionStatus,
  formatProtocolEntryCount,
  type HomeMissedGroup,
} from '../utils/HomeActionStatus';
```

Add state near the existing Nachtrag state:

```ts
const [missedNachtragGroups, setMissedNachtragGroups] = useState<HomeMissedGroup[]>([]);
```

- [ ] **Step 2: Add loader for missed groups**

Add this callback after `ladeNachtrag`:

```ts
const ladeMissedNachtragSummary = useCallback(async () => {
  try {
    const groups = await getOffeneEinnahmeNachtraege(aktivePerson?.id, 'sevenDays');
    setMissedNachtragGroups(groups.map(group => ({
      datumIso: group.datumIso,
      itemCount: group.items.length,
    })));
  } catch (error) {
    logger.error('Nachtrags-Zusammenfassung konnte nicht geladen werden:', error);
    setMissedNachtragGroups([]);
  }
}, [aktivePerson?.id]);
```

- [ ] **Step 3: Wire loader into daily refresh**

In `refreshTagesstand`, add `ladeMissedNachtragSummary()` to the `Promise.all` list:

```ts
await Promise.all([
  refresh(),
  ladeEinnahmeStatus(nextHeuteDatum),
  ladeUrlaubsReminder(),
  ladeMissedNachtragSummary(),
  getVerifiedAllRezeptTermine()
    .then(setRezeptTermine)
    .catch(error => {
      logger.error('Rezepttermine konnten nicht geladen werden:', error);
    }),
]);
```

Update the dependency list:

```ts
}, [ladeEinnahmeStatus, ladeMissedNachtragSummary, ladeUrlaubsReminder, refresh]);
```

- [ ] **Step 4: Refresh summary after saving backfills**

In `handleNachtragSpeichern`, after `await ladeEinnahmeStatus();`, add:

```ts
await ladeMissedNachtragSummary();
```

- [ ] **Step 5: Refresh summary after intake confirmation**

In both `onBestaetigen` and `onAlleBestaetigen`, after `const { offene } = await ladeEinnahmeStatus();`, add:

```ts
await ladeMissedNachtragSummary();
```

- [ ] **Step 6: Run TypeScript**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit loader wiring**

Run:

```bash
git add src/screens/HomeScreen.tsx
git commit -m "Load missed intake summary on home"
```

---

### Task 3: Render the New Aktionen Block

**Files:**
- Modify: `src/screens/HomeScreen.tsx`

- [ ] **Step 1: Remove the old help action**

Delete `openProtokollHilfe`.

Replace the section title block in `renderTagesHeader`:

```tsx
<View style={styles.sectionTitleRow}>
  <Text style={styles.sectionTitle}>Aktionen</Text>
</View>
```

Do not render the `TouchableOpacity` with `styles.helpButton`.

- [ ] **Step 2: Derive the action status**

Inside `renderTagesHeader`, after `const protokolliert = groupHeutigeProtokolle(heutigeProtokolle);`, add:

```ts
const actionStatus = buildHomeActionStatus({
  missedGroups: missedNachtragGroups,
  todayOpenCount: offeneCount,
  plannedTodayCount: geplantCount,
  loggedTodayCount: erledigtCount,
});
```

- [ ] **Step 3: Add a single action handler**

Add this local function inside `renderTagesHeader`:

```ts
const handleActionPress = () => {
  if (actionStatus.kind === 'missed') {
    openNachtragModal().catch(logger.error);
    return;
  }
  if (actionStatus.kind === 'todayOpen') {
    openEinnahmeModal();
  }
};
```

- [ ] **Step 4: Replace old action/done cards with one status card**

Replace the current `{offeneCount > 0 ? (...) : (...)}` block with:

```tsx
<TouchableOpacity
  style={[
    styles.homeActionCard,
    actionStatus.severity === 'critical' && styles.homeActionCardCritical,
    actionStatus.severity === 'warning' && styles.homeActionCardWarning,
    actionStatus.severity === 'attention' && styles.homeActionCardAttention,
    actionStatus.severity === 'success' && styles.homeActionCardSuccess,
  ]}
  onPress={actionStatus.actionLabel ? handleActionPress : undefined}
  disabled={!actionStatus.actionLabel}
  activeOpacity={0.84}
  accessibilityRole={actionStatus.actionLabel ? 'button' : 'text'}
  accessibilityLabel={`${actionStatus.title}. ${actionStatus.message}${actionStatus.actionLabel ? `. ${actionStatus.actionLabel}` : ''}`}
>
  <View style={styles.homeActionTextWrap}>
    <Text style={[
      styles.homeActionTitle,
      actionStatus.severity === 'critical' && styles.homeActionTextCritical,
      actionStatus.severity === 'warning' && styles.homeActionTextWarning,
      actionStatus.severity === 'attention' && styles.homeActionTextAttention,
      actionStatus.severity === 'success' && styles.homeActionTextSuccess,
    ]}>
      {actionStatus.title}
    </Text>
    <Text style={[
      styles.homeActionSub,
      actionStatus.severity === 'critical' && styles.homeActionTextCritical,
      actionStatus.severity === 'warning' && styles.homeActionTextWarning,
      actionStatus.severity === 'attention' && styles.homeActionTextAttention,
      actionStatus.severity === 'success' && styles.homeActionTextSuccess,
    ]}>
      {actionStatus.message}
    </Text>
  </View>
  {actionStatus.actionLabel ? (
    <Text style={[
      styles.homeActionButton,
      actionStatus.severity === 'critical' && styles.homeActionTextCritical,
      actionStatus.severity === 'warning' && styles.homeActionTextWarning,
      actionStatus.severity === 'attention' && styles.homeActionTextAttention,
    ]}>
      {actionStatus.actionLabel}
    </Text>
  ) : null}
</TouchableOpacity>
```

- [ ] **Step 5: Make backfill secondary unless it is the primary warning**

Replace the always-visible `nachtragActionCard` with a conditional secondary link:

```tsx
{actionStatus.kind !== 'missed' ? (
  <TouchableOpacity
    style={styles.nachtragSecondaryAction}
    onPress={openNachtragModal}
    activeOpacity={0.8}
    accessibilityRole="button"
    accessibilityLabel="Vergessene Einnahmen nachtragen"
  >
    <Text style={styles.nachtragSecondaryText}>Einnahmen nachtragen</Text>
    <Text style={styles.nachtragSecondaryChevron}>›</Text>
  </TouchableOpacity>
) : null}
```

- [ ] **Step 6: Fix protocol pluralization**

Replace:

```tsx
`${erledigtCount} Eintrag${erledigtCount === 1 ? '' : 'e'} im heutigen Protokoll`
```

with:

```tsx
formatProtocolEntryCount(erledigtCount)
```

- [ ] **Step 7: Run TypeScript**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit UI rendering**

Run:

```bash
git add src/screens/HomeScreen.tsx
git commit -m "Show prioritized home actions"
```

---

### Task 4: Update Styles and Version

**Files:**
- Modify: `src/screens/HomeScreen.tsx`
- Modify: `package.json`
- Modify: `android/app/build.gradle`
- Modify: `ios/MeineMedikamente.xcodeproj/project.pbxproj`

- [ ] **Step 1: Replace old action styles**

In `styles`, keep `sectionTitleRow` and `sectionTitle`. Remove or stop using `helpButton`, `helpButtonText`, `logActionCard`, `logActionTextWrap`, `logActionTitle`, `logActionSub`, `logActionButton`, `logDoneCard`, `logDoneTitle`, `logDoneSub`, `nachtragActionCard`, `nachtragActionTextWrap`, `nachtragActionTitle`, `nachtragActionSub`, and `nachtragActionChevron`.

Add:

```ts
homeActionCard: {
  flexDirection: 'row',
  alignItems: 'center',
  borderRadius: 12,
  padding: 16,
  marginBottom: 10,
  minHeight: 104,
  borderWidth: 1,
},
homeActionCardCritical: {
  backgroundColor: '#FEECEC',
  borderColor: '#F3B3B3',
},
homeActionCardWarning: {
  backgroundColor: '#FFF7E0',
  borderColor: '#E8C96A',
},
homeActionCardAttention: {
  backgroundColor: '#EAF3FF',
  borderColor: '#B8D4F8',
},
homeActionCardSuccess: {
  backgroundColor: '#EAF7F0',
  borderColor: '#BFE6CE',
},
homeActionTextWrap: {
  flex: 1,
  paddingRight: 12,
},
homeActionTitle: {
  fontSize: 22,
  lineHeight: 28,
  fontWeight: '800',
},
homeActionSub: {
  fontSize: 16,
  lineHeight: 22,
  marginTop: 6,
  fontWeight: '600',
},
homeActionButton: {
  fontSize: 17,
  fontWeight: '800',
  textAlign: 'right',
  maxWidth: 128,
},
homeActionTextCritical: {
  color: '#8A1F1F',
},
homeActionTextWarning: {
  color: '#6D4A00',
},
homeActionTextAttention: {
  color: '#155C96',
},
homeActionTextSuccess: {
  color: '#14532D',
},
nachtragSecondaryAction: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  backgroundColor: '#FFFFFF',
  borderRadius: 10,
  paddingVertical: 12,
  paddingHorizontal: 14,
  marginBottom: 14,
  borderWidth: 1,
  borderColor: '#E5E7EB',
},
nachtragSecondaryText: {
  fontSize: 17,
  color: '#374151',
  fontWeight: '700',
},
nachtragSecondaryChevron: {
  fontSize: 26,
  color: '#6B7280',
  fontWeight: '700',
},
```

- [ ] **Step 2: Bump package version**

In `package.json`, change:

```json
"version": "0.1.56"
```

to:

```json
"version": "0.1.57"
```

- [ ] **Step 3: Bump Android version**

In `android/app/build.gradle`, change:

```gradle
versionCode 57
versionName "0.1.56"
```

to:

```gradle
versionCode 58
versionName "0.1.57"
```

- [ ] **Step 4: Bump iOS version**

In `ios/MeineMedikamente.xcodeproj/project.pbxproj`, change both app target occurrences:

```text
CURRENT_PROJECT_VERSION = 57;
MARKETING_VERSION = 0.1.56;
```

to:

```text
CURRENT_PROJECT_VERSION = 58;
MARKETING_VERSION = 0.1.57;
```

- [ ] **Step 5: Run TypeScript**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit style and version**

Run:

```bash
git add src/screens/HomeScreen.tsx package.json android/app/build.gradle ios/MeineMedikamente.xcodeproj/project.pbxproj
git commit -m "Polish home action status styling"
```

---

### Task 5: Full Verification and Device Deploy

**Files:**
- No source edits unless verification finds a bug.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- --runInBand --no-cache src/__tests__/HomeActionStatus.test.ts src/__tests__/EinnahmeNachtrag.test.ts src/__tests__/LocalDate.test.ts
```

Expected: all suites PASS.

- [ ] **Step 2: Run static quality**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Build Android**

Run:

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export JAVA_HOME=$(/usr/libexec/java_home -v 17 2>/dev/null || /usr/libexec/java_home)
cd android
./gradlew app:assembleInternal -PreactNativeArchitectures=arm64-v8a --console=plain --no-daemon
cd ..
```

Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: Install and launch Android**

Run:

```bash
adb -s ZY22J5R69L install -r android/app/build/outputs/apk/internal/app-internal.apk
adb -s ZY22J5R69L logcat -c
adb -s ZY22J5R69L shell monkey -p dev.serverraum247.meinmediplan -c android.intent.category.LAUNCHER 1
sleep 5
adb -s ZY22J5R69L logcat -d | rg -i "FATAL EXCEPTION|AndroidRuntime|ReactNativeJS|Rendered more hooks|TypeError|Unable to load script"
```

Expected: no app crash. ReactNativeJS startup logs are acceptable; no fatal exception.

- [ ] **Step 5: Check Android visible copy**

Run:

```bash
adb -s ZY22J5R69L shell uiautomator dump /sdcard/window.xml >/dev/null
adb -s ZY22J5R69L shell cat /sdcard/window.xml | tr '>' '>\n' | rg -n "Aktionen|Einnahmen fehlen|Heute noch offen|Heute erledigt|Einträge|Protokollieren"
```

Expected: `Aktionen` and one status title are visible. `Protokollieren` is not visible.

- [ ] **Step 6: Build iOS internal app**

Run:

```bash
cd ios
pod install
cd ..
IOS_BUILD_TIMEOUT_SECONDS=1200 bash scripts/build-ios-internal.sh
```

Expected: `ios/build/InternalDeviceDeploy/Build/Products/Release-iphoneos/MeineMedikamente.app` exists.

- [ ] **Step 7: Install and launch iOS**

Run:

```bash
xcrun devicectl device install app --device B2293D69-96D1-5B5C-AB07-CAAE14C67425 ios/build/InternalDeviceDeploy/Build/Products/Release-iphoneos/MeineMedikamente.app
xcrun devicectl device process launch --device B2293D69-96D1-5B5C-AB07-CAAE14C67425 com.meinemedikamente
```

Expected: install succeeds and launch succeeds when the iPhone is unlocked.

- [ ] **Step 8: Final commit if verification required fixes**

If verification required fixes, inspect the changed files and commit the exact files reported by Git:

```bash
git status --short
git add src/screens/HomeScreen.tsx src/utils/HomeActionStatus.ts src/__tests__/HomeActionStatus.test.ts package.json android/app/build.gradle ios/MeineMedikamente.xcodeproj/project.pbxproj
git commit -m "Fix home action status verification issues"
```

- [ ] **Step 9: Push branch**

Run:

```bash
git push origin HEAD:codex/medication-e2e-premium-dosing
```

Expected: push succeeds.

---

## Self-Review

- Spec coverage: The plan covers status priority, warning colors, removed question mark, renamed `Aktionen`, plural `Einträge`, existing dialog reuse, refresh after Nachtrag/Einnahme, version bump, Android/iOS verification.
- Placeholder scan: No `TODO`, `TBD`, or vague implementation steps remain.
- Type consistency: `HomeMissedGroup`, `HomeActionStatus`, `buildHomeActionStatus`, and `formatProtocolEntryCount` are defined before use and imported consistently.
