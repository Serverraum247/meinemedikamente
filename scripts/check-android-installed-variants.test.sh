#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT_DIR/scripts/check-android-installed-variants.sh"

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

assert_contains() {
  local haystack="$1"
  local needle="$2"
  if [[ "$haystack" != *"$needle"* ]]; then
    printf 'Expected output to contain:\n%s\n\nActual output:\n%s\n' "$needle" "$haystack" >&2
    exit 1
  fi
}

with_fake_adb() {
  local packages="$1"
  shift

  local tmp_dir
  tmp_dir="$(mktemp -d)"

  mkdir -p "$tmp_dir/bin"
  printf '%s\n' "$packages" >"$tmp_dir/packages.txt"
  cat >"$tmp_dir/bin/adb" <<'ADB'
#!/usr/bin/env bash
set -euo pipefail

packages_file="${FAKE_ADB_PACKAGES_FILE:?}"
case "$*" in
  "devices")
    printf 'List of devices attached\nfake-device\tdevice\n'
    ;;
  "-s fake-device shell am get-current-user")
    printf '0\n'
    ;;
  "-s fake-device shell pm list packages --user 0")
    while IFS= read -r package_name; do
      [[ -z "$package_name" ]] && continue
      printf 'package:%s\n' "$package_name"
    done <"$packages_file"
    ;;
  "-s fake-device shell pm uninstall --user 0 "*)
    package_name="${*: -1}"
    tmp_file="$(mktemp)"
    grep -vxF "$package_name" "$packages_file" >"$tmp_file" || true
    mv "$tmp_file" "$packages_file"
    printf 'Success\n'
    ;;
  *)
    printf 'unexpected adb call: %s\n' "$*" >&2
    exit 64
    ;;
esac
ADB
  chmod +x "$tmp_dir/bin/adb"

  set +e
  PATH="$tmp_dir/bin:$PATH" FAKE_ADB_PACKAGES_FILE="$tmp_dir/packages.txt" "$@"
  local rc=$?
  set -e
  rm -rf "$tmp_dir"
  return "$rc"
}

test_check_fails_when_multiple_variants_are_installed() {
  local output rc
  rc=0
  output="$(
    with_fake_adb $'dev.serverraum247.meinmediplan\ndev.serverraum247.meinmediplan.debug\ndev.serverraum247.meinmediplan.internal' \
      "$SCRIPT" --mode check 2>&1
  )" || rc=$?

  [[ "$rc" -ne 0 ]] || fail 'check mode should fail when multiple variants are installed'
  assert_contains "$output" 'found 3 known Android app variants on fake-device'
  assert_contains "$output" 'dev.serverraum247.meinmediplan.internal'
}

test_clean_internal_removes_other_variants() {
  local output
  output="$(
    with_fake_adb $'dev.serverraum247.meinmediplan\ndev.serverraum247.meinmediplan.debug\ndev.serverraum247.meinmediplan.internal' \
      "$SCRIPT" --mode clean-internal 2>&1
  )"

  assert_contains "$output" 'removing dev.serverraum247.meinmediplan from fake-device user 0'
  assert_contains "$output" 'removing dev.serverraum247.meinmediplan.debug from fake-device user 0'
  assert_contains "$output" 'ok: only dev.serverraum247.meinmediplan.internal remains on fake-device'
}

test_clean_mode_uses_explicit_keep_package() {
  local output
  output="$(
    with_fake_adb $'dev.serverraum247.meinmediplan\ndev.serverraum247.meinmediplan.internal' \
      "$SCRIPT" --mode clean --keep-package dev.serverraum247.meinmediplan 2>&1
  )"

  assert_contains "$output" 'removing dev.serverraum247.meinmediplan.internal from fake-device user 0'
  assert_contains "$output" 'ok: only dev.serverraum247.meinmediplan remains on fake-device'
}

test_check_passes_when_only_target_variant_is_installed() {
  local output
  output="$(
    with_fake_adb 'dev.serverraum247.meinmediplan.internal' \
      "$SCRIPT" --mode check --keep-package dev.serverraum247.meinmediplan.internal 2>&1
  )"

  assert_contains "$output" 'ok: only dev.serverraum247.meinmediplan.internal installed on fake-device'
}

test_check_fails_when_target_variant_is_missing() {
  local output rc
  rc=0
  output="$(
    with_fake_adb 'dev.serverraum247.meinmediplan.debug' \
      "$SCRIPT" --mode check --keep-package dev.serverraum247.meinmediplan.internal 2>&1
  )" || rc=$?

  [[ "$rc" -ne 0 ]] || fail 'check mode should fail when the target variant is missing'
  assert_contains "$output" 'missing expected Android app variant on fake-device: dev.serverraum247.meinmediplan.internal'
}

test_check_fails_when_legacy_package_is_installed_by_default() {
  local output rc
  rc=0
  output="$(
    with_fake_adb $'dev.serverraum247.meinmediplan.internal\ncom.meinemedikamente' \
      "$SCRIPT" --mode check 2>&1
  )" || rc=$?

  [[ "$rc" -ne 0 ]] || fail 'check mode should fail when legacy package is installed by default'
  assert_contains "$output" 'com.meinemedikamente'
}

test_check_fails_when_legacy_package_is_installed_for_current_user() {
  local output rc
  rc=0
  output="$(
    with_fake_adb $'dev.serverraum247.meinmediplan.internal\ncom.meinemedikamente' \
      "$SCRIPT" --mode check --include-legacy 2>&1
  )" || rc=$?

  [[ "$rc" -ne 0 ]] || fail 'check mode should fail when legacy package is installed'
  assert_contains "$output" 'com.meinemedikamente'
}

test_check_fails_when_no_device_is_visible() {
  local tmp_dir output rc
  tmp_dir="$(mktemp -d)"
  mkdir -p "$tmp_dir/bin"
  cat >"$tmp_dir/bin/adb" <<'ADB'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == "devices" ]]; then
  printf 'List of devices attached\n'
  exit 0
fi
printf 'unexpected adb call: %s\n' "$*" >&2
exit 64
ADB
  chmod +x "$tmp_dir/bin/adb"

  rc=0
  output="$(PATH="$tmp_dir/bin:$PATH" "$SCRIPT" --mode check 2>&1)" || rc=$?
  rm -rf "$tmp_dir"
  [[ "$rc" -ne 0 ]] || fail 'check mode should fail when no Android device is visible'
  assert_contains "$output" 'failed: no unlocked Android device visible via adb'
}

test_check_fails_when_multiple_devices_are_visible() {
  local tmp_dir output rc
  tmp_dir="$(mktemp -d)"
  mkdir -p "$tmp_dir/bin"
  cat >"$tmp_dir/bin/adb" <<'ADB'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == "devices" ]]; then
  printf 'List of devices attached\nfirst\tdevice\nsecond\tdevice\n'
  exit 0
fi
printf 'unexpected adb call: %s\n' "$*" >&2
exit 64
ADB
  chmod +x "$tmp_dir/bin/adb"

  rc=0
  output="$(PATH="$tmp_dir/bin:$PATH" "$SCRIPT" --mode check 2>&1)" || rc=$?
  rm -rf "$tmp_dir"
  [[ "$rc" -ne 0 ]] || fail 'check mode should fail when multiple devices need an explicit serial'
  assert_contains "$output" 'failed: multiple Android devices visible; pass --serial'
}

test_check_fails_when_keep_package_is_not_known() {
  local output rc
  rc=0
  output="$(
    with_fake_adb 'dev.serverraum247.meinmediplan.internal' \
      "$SCRIPT" --mode check --keep-package dev.example.other 2>&1
  )" || rc=$?

  [[ "$rc" -ne 0 ]] || fail 'unknown keep packages should be rejected'
  assert_contains "$output" 'failed: keep package is not in the known variant list'
}

main() {
  test_check_fails_when_multiple_variants_are_installed
  test_clean_internal_removes_other_variants
  test_clean_mode_uses_explicit_keep_package
  test_check_passes_when_only_target_variant_is_installed
  test_check_fails_when_target_variant_is_missing
  test_check_fails_when_legacy_package_is_installed_by_default
  test_check_fails_when_legacy_package_is_installed_for_current_user
  test_check_fails_when_no_device_is_visible
  test_check_fails_when_multiple_devices_are_visible
  test_check_fails_when_keep_package_is_not_known
  printf 'ok: android installed variant guard tests passed\n'
}

main "$@"
