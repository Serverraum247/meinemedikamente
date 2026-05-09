#!/usr/bin/env bash
set -euo pipefail

missing=0

check_command() {
  local command_name="$1"
  local install_hint="$2"

  if command -v "$command_name" >/dev/null 2>&1; then
    printf 'ok: %s (%s)\n' "$command_name" "$(command -v "$command_name")"
  else
    printf 'missing: %s\n  %s\n' "$command_name" "$install_hint"
    missing=1
  fi
}

check_command java 'Install Java 17 or newer and set JAVA_HOME.'
check_command maestro 'Install Maestro: brew tap mobile-dev-inc/tap && brew install mobile-dev-inc/tap/maestro'
check_command xcodebuild 'Install Xcode and select it with xcode-select.'

if command -v xcrun >/dev/null 2>&1; then
  if xcrun simctl list devices available >/dev/null 2>&1; then
    printf 'ok: iOS simulator tooling available\n'
  else
    printf 'warning: xcrun exists, but no available iOS simulators were reported\n'
  fi
else
  printf 'warning: xcrun not found; iOS E2E requires Xcode command line tools\n'
fi

if command -v adb >/dev/null 2>&1; then
  printf 'ok: adb (%s)\n' "$(command -v adb)"
  adb devices | sed 's/^/  /'
else
  printf 'warning: adb not found; Android E2E requires Android platform-tools\n'
fi

exit "$missing"
