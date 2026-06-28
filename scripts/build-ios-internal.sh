#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="${IOS_BUILD_LOG:-/tmp/meinmediplan-ios-internal-build.log}"
DERIVED_DATA_PATH="${IOS_DERIVED_DATA_PATH:-ios/build/InternalDeviceDeploy}"
BUILD_TIMEOUT_SECONDS="${IOS_BUILD_TIMEOUT_SECONDS:-1200}"

cd "$ROOT_DIR"

run_with_timeout() {
  local seconds="$1"
  shift

  if command -v timeout >/dev/null 2>&1; then
    timeout "$seconds"s "$@"
  else
    perl -e 'alarm shift; exec @ARGV' "$seconds" "$@"
  fi
}

printf 'Checking build environment before iOS build...\n'
RN_CONFIG_TIMEOUT_SECONDS="${RN_CONFIG_TIMEOUT_SECONDS:-30}" \
FULL_RN_CONFIG_TIMEOUT_SECONDS="${FULL_RN_CONFIG_TIMEOUT_SECONDS:-45}" \
  bash scripts/doctor-build-env.sh

printf 'Installing iOS Pods through the stable CocoaPods path...\n'
POD_INSTALL_TIMEOUT_SECONDS="${POD_INSTALL_TIMEOUT_SECONDS:-180}" \
NODE_BINARY="${NODE_BINARY:-/Users/danielbrussig/.local/bin/node}" \
  bash scripts/pod-install-ios.sh

printf 'Building iOS internal device app. Log: %s\n' "$LOG_FILE"
mkdir -p "$(dirname "$LOG_FILE")"
rm -rf "$DERIVED_DATA_PATH"

if run_with_timeout "$BUILD_TIMEOUT_SECONDS" env \
  NODE_BINARY="${NODE_BINARY:-/Users/danielbrussig/.local/bin/node}" \
  PATH="$(dirname "${NODE_BINARY:-/Users/danielbrussig/.local/bin/node}"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
  xcodebuild \
  -workspace ios/MeineMedikamente.xcworkspace \
  -scheme MeineMedikamente \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -derivedDataPath "$DERIVED_DATA_PATH" \
  -allowProvisioningUpdates \
  MM_INTERNAL_PREMIUM_TEST_MODE=YES \
  build >"$LOG_FILE" 2>&1; then
  printf 'ok: iOS internal app built\n'
  find "$DERIVED_DATA_PATH/Build/Products/Release-iphoneos" -maxdepth 1 -name '*.app' -print
else
  rc=$?
  printf 'failed: iOS build exited with %s or timed out after %ss\n' "$rc" "$BUILD_TIMEOUT_SECONDS" >&2
  tail -120 "$LOG_FILE" >&2 || true
  exit "$rc"
fi
