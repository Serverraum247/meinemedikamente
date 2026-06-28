#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RN_CONFIG_TIMEOUT_SECONDS="${RN_CONFIG_TIMEOUT_SECONDS:-30}"
FULL_RN_CONFIG_TIMEOUT_SECONDS="${FULL_RN_CONFIG_TIMEOUT_SECONDS:-45}"

cd "$ROOT_DIR"

status=0
ANDROID_GOOGLE_SERVICES_FILE="android/app/google-services.json"

check_command() {
  local command_name="$1"
  local install_hint="$2"

  if command -v "$command_name" >/dev/null 2>&1; then
    printf 'ok: %s (%s)\n' "$command_name" "$(command -v "$command_name")"
  else
    printf 'missing: %s\n  %s\n' "$command_name" "$install_hint" >&2
    status=1
  fi
}

check_file_contains() {
  local file_path="$1"
  local pattern="$2"
  local ok_label="$3"
  local fail_hint="$4"

  if [[ ! -f "$file_path" ]]; then
    printf 'failed: %s fehlt\n  %s\n' "$file_path" "$fail_hint" >&2
    status=1
    return
  fi

  if grep -Fq "$pattern" "$file_path"; then
    printf 'ok: %s\n' "$ok_label"
  else
    printf 'failed: %s\n  %s\n' "$ok_label" "$fail_hint" >&2
    status=1
  fi
}

check_google_services_package() {
  local package_name="$1"

  if [[ ! -f "$ANDROID_GOOGLE_SERVICES_FILE" ]]; then
    return
  fi

  if node -e '
const fs = require("fs");
const filePath = process.argv[1];
const expectedPackage = process.argv[2];
const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
const packages = (json.client || [])
  .map(client => client?.client_info?.android_client_info?.package_name)
  .filter(Boolean);
process.exit(packages.includes(expectedPackage) ? 0 : 1);
' "$ANDROID_GOOGLE_SERVICES_FILE" "$package_name"; then
    printf 'ok: google-services client für %s vorhanden\n' "$package_name"
  else
    printf 'failed: google-services client für %s fehlt\n' "$package_name" >&2
    printf '  hint: Ergänze in Firebase einen Android-Client für %s und lade danach die neue google-services.json lokal nach android/app/.\n' "$package_name" >&2
    status=1
  fi
}

run_with_timeout() {
  local seconds="$1"
  shift

  if command -v timeout >/dev/null 2>&1; then
    timeout "$seconds"s "$@"
  else
    perl -e 'alarm shift; exec @ARGV' "$seconds" "$@"
  fi
}

printf '== Toolchain ==\n'
check_command node 'Install Node.js matching package.json engines.'
check_command npm 'Install npm with Node.js.'
check_command java 'Install Java 17 and set JAVA_HOME.'
check_command xcodebuild 'Install Xcode and select it with xcode-select.'
check_command xcrun 'Install Xcode command line tools.'
check_command pod 'Install CocoaPods. On this Mac, /opt/homebrew/bin/pod is the stable path.'

if command -v node >/dev/null 2>&1; then
  printf 'ok: node version %s\n' "$(node -v)"
fi

if command -v java >/dev/null 2>&1; then
  java -version 2>&1 | sed 's/^/  /'
fi

if [[ "$(uname -s)" == "Darwin" ]]; then
  if /usr/libexec/java_home -v 17 >/dev/null 2>&1; then
    printf 'ok: Java 17 available at %s\n' "$(/usr/libexec/java_home -v 17)"
  else
    printf 'failed: Java 17 is not available via /usr/libexec/java_home -v 17\n' >&2
    printf 'hint: Android React Native builds in this project should run with JDK 17, not the default JDK 25.\n' >&2
    status=1
  fi
fi

if command -v adb >/dev/null 2>&1; then
  printf 'ok: adb (%s)\n' "$(command -v adb)"
  adb devices | sed 's/^/  /'
else
  printf 'warning: adb not found; Android deploy will be skipped\n' >&2
fi

if command -v pod >/dev/null 2>&1; then
  pod_path="$(command -v pod)"
  if [[ "$pod_path" == "/opt/homebrew/bin/pod" ]]; then
    printf 'ok: stable CocoaPods path (%s)\n' "$pod_path"
  else
    printf 'warning: CocoaPods path is %s; /opt/homebrew/bin/pod has been the stable path for this repo\n' "$pod_path" >&2
  fi
fi

printf '\n== React Native config ==\n'
for platform in android ios; do
  log_file="/tmp/meinmediplan-rn-config-${platform}.log"
  if run_with_timeout "$RN_CONFIG_TIMEOUT_SECONDS" node scripts/rn-config-probe.js "$platform" >"$log_file" 2>&1; then
    printf 'ok: react-native config probe %s (%ss timeout)\n' "$platform" "$RN_CONFIG_TIMEOUT_SECONDS"
  else
    printf 'failed: react-native config probe %s did not finish within %ss\n' "$platform" "$RN_CONFIG_TIMEOUT_SECONDS" >&2
    tail -40 "$log_file" >&2 || true
    status=1
  fi
done

full_log="/tmp/meinmediplan-rn-config-full.log"
if run_with_timeout "$FULL_RN_CONFIG_TIMEOUT_SECONDS" node node_modules/react-native/cli.js config >"$full_log" 2>&1; then
  printf 'ok: npx/react-native full config (%ss timeout)\n' "$FULL_RN_CONFIG_TIMEOUT_SECONDS"
else
  printf 'failed: full react-native config hangs or fails within %ss\n' "$FULL_RN_CONFIG_TIMEOUT_SECONDS" >&2
  printf 'hint: native Gradle/Xcode builds call this path unless bypassed; fix this before deploy.\n' >&2
  tail -40 "$full_log" >&2 || true
  status=1
fi

printf '\n== Git refs ==\n'
if find .git/refs/heads -name '* 2' -print -quit | grep -q .; then
  printf 'failed: duplicate git ref files found:\n' >&2
  find .git/refs/heads -name '* 2' -print >&2
  printf 'hint: remove only duplicated \" * 2\" ref files after confirming they are not active branches.\n' >&2
  status=1
else
  printf 'ok: no duplicate \" * 2\" branch refs\n'
fi

printf '\n== Android Cloud-Backup Wiring ==\n'
if grep -Fq '@react-native-firebase/auth' package.json || grep -Fq 'uploadBackupAndroid' src/services/BackupService.ts; then
  printf 'info: Android Cloud-Backup-Code erkannt; Firebase-Verdrahtung wird geprüft\n'
  check_file_contains \
    "android/build.gradle" \
    'com.google.gms:google-services' \
    'google-services Gradle classpath vorhanden' \
    'Füge in android/build.gradle die Dependency com.google.gms:google-services hinzu, sonst initialisiert Firebase auf Android nie.'
  check_file_contains \
    "android/app/build.gradle" \
    'com.google.gms.google-services' \
    'google-services App-Plugin vorhanden' \
    'Wende in android/app/build.gradle das Plugin com.google.gms.google-services an, damit die Firebase-Optionen generiert werden.'

  if [[ -f "$ANDROID_GOOGLE_SERVICES_FILE" ]]; then
    printf 'ok: %s vorhanden\n' "$ANDROID_GOOGLE_SERVICES_FILE"
    check_google_services_package 'dev.serverraum247.meinmediplan'
    check_google_services_package 'dev.serverraum247.meinmediplan.internal'
  else
    printf 'failed: %s fehlt\n' "$ANDROID_GOOGLE_SERVICES_FILE" >&2
    printf '  hint: Lade die Android-Firebase-Clientkonfiguration nach android/app/google-services.json. Ohne diese Datei bleibt Cloud-Backup auf Android kaputt.\n' >&2
    status=1
  fi
else
  printf 'ok: kein Android-Firebase-Backup-Code aktiv\n'
fi

exit "$status"
