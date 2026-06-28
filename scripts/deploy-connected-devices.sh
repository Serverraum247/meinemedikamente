#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_PACKAGE="${ANDROID_PACKAGE:-dev.serverraum247.meinmediplan.internal}"
ANDROID_APK="${ANDROID_APK:-android/app/build/outputs/apk/internal/app-internal.apk}"
IOS_APP="${IOS_APP:-ios/build/InternalDeviceDeploy/Build/Products/Release-iphoneos/MeineMedikamente.app}"
IOS_BUNDLE_ID="${IOS_BUNDLE_ID:-com.meinemedikamente}"

cd "$ROOT_DIR"

if [[ "${SKIP_DOCTOR_BUILD:-0}" != "1" ]]; then
  printf 'running build doctor before device deploy...\n'
  bash scripts/doctor-build-env.sh
fi

deploy_android() {
  if ! command -v adb >/dev/null 2>&1; then
    printf 'skip: adb not found\n' >&2
    return
  fi

  if [[ ! -f "$ANDROID_APK" ]]; then
    printf 'skip: Android APK missing: %s\n' "$ANDROID_APK" >&2
    return
  fi

  local devices
  devices="$(adb devices | awk 'NR > 1 && $2 == "device" {print $1}')"
  if [[ -z "$devices" ]]; then
    printf 'skip: no unlocked Android device visible via adb\n' >&2
    return
  fi

  while read -r device; do
    [[ -z "$device" ]] && continue
    printf 'checking Android installed variants on %s...\n' "$device"
    bash scripts/check-android-installed-variants.sh \
      --mode clean \
      --serial "$device" \
      --keep-package "$ANDROID_PACKAGE" \
      --allow-missing-keep
    printf 'installing Android APK on %s...\n' "$device"
    adb -s "$device" install -r "$ANDROID_APK"
    bash scripts/check-android-installed-variants.sh \
      --mode check \
      --serial "$device" \
      --keep-package "$ANDROID_PACKAGE"
    adb -s "$device" shell monkey -p "$ANDROID_PACKAGE" -c android.intent.category.LAUNCHER 1 >/dev/null
    printf 'ok: Android launched on %s\n' "$device"
  done <<<"$devices"
}

deploy_ios() {
  if ! command -v xcrun >/dev/null 2>&1; then
    printf 'skip: xcrun not found\n' >&2
    return
  fi

  if [[ ! -d "$IOS_APP" ]]; then
    printf 'skip: iOS app missing: %s\n' "$IOS_APP" >&2
    return
  fi

  local devices
  devices="$(xcrun devicectl list devices 2>/dev/null | perl -ne 'print "$1\n" if /([0-9A-F-]{36})\s+available\b.*\biPhone/' || true)"
  if [[ -z "$devices" ]]; then
    printf 'skip: no connected iPhone visible via devicectl\n' >&2
    return
  fi

  while read -r device; do
    [[ -z "$device" ]] && continue
    printf 'installing iOS app on %s...\n' "$device"
    xcrun devicectl device install app --device "$device" "$IOS_APP"
    xcrun devicectl device process launch --device "$device" "$IOS_BUNDLE_ID" || {
      printf 'warning: installed on %s, but launch failed; device may be locked\n' "$device" >&2
    }
  done <<<"$devices"
}

deploy_android
deploy_ios
