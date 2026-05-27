#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RN_CONFIG_TIMEOUT_SECONDS="${RN_CONFIG_TIMEOUT_SECONDS:-30}"
FULL_RN_CONFIG_TIMEOUT_SECONDS="${FULL_RN_CONFIG_TIMEOUT_SECONDS:-45}"

cd "$ROOT_DIR"

status=0

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

exit "$status"
