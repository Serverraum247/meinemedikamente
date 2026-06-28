#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="${ANDROID_BUILD_LOG:-/tmp/meinmediplan-android-internal-build.log}"
BUILD_TIMEOUT_SECONDS="${ANDROID_BUILD_TIMEOUT_SECONDS:-900}"

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

printf 'Checking build environment before Android build...\n'
RN_CONFIG_TIMEOUT_SECONDS="${RN_CONFIG_TIMEOUT_SECONDS:-30}" \
FULL_RN_CONFIG_TIMEOUT_SECONDS="${FULL_RN_CONFIG_TIMEOUT_SECONDS:-45}" \
  bash scripts/doctor-build-env.sh

printf 'Building Android internal APK. Log: %s\n' "$LOG_FILE"
mkdir -p "$(dirname "$LOG_FILE")"

if run_with_timeout "$BUILD_TIMEOUT_SECONDS" bash -lc '
  cd android
  export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
  export JAVA_HOME="${JAVA_HOME:-$(/usr/libexec/java_home -v 17)}"
  export NODE_BINARY="${NODE_BINARY:-/Users/danielbrussig/.local/bin/node}"
  export PATH="$(dirname "$NODE_BINARY"):$PATH"
  ./gradlew app:assembleInternal \
    -PreactNativeArchitectures=arm64-v8a \
    -Pkotlin.compiler.execution.strategy=in-process \
    -Dkotlin.daemon.enabled=false \
    --console=plain \
    --no-daemon \
    --max-workers=1
' >"$LOG_FILE" 2>&1; then
  printf 'ok: Android internal APK built\n'
  ls -lh android/app/build/outputs/apk/internal/app-internal.apk
else
  rc=$?
  printf 'failed: Android build exited with %s or timed out after %ss\n' "$rc" "$BUILD_TIMEOUT_SECONDS" >&2
  tail -120 "$LOG_FILE" >&2 || true
  exit "$rc"
fi
