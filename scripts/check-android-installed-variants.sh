#!/usr/bin/env bash
set -euo pipefail

KNOWN_PACKAGES=(
  "dev.serverraum247.meinmediplan"
  "dev.serverraum247.meinmediplan.debug"
  "dev.serverraum247.meinmediplan.internal"
)
LEGACY_PACKAGE="com.meinemedikamente"

mode="check"
keep_package="${ANDROID_PACKAGE:-dev.serverraum247.meinmediplan.internal}"
serial="${ANDROID_SERIAL:-}"
include_legacy=0
allow_missing_keep=0

usage() {
  cat <<'EOF'
Usage: scripts/check-android-installed-variants.sh [options]

Options:
  --mode check|clean|clean-internal|clean-release|clean-debug
  --keep-package PACKAGE
  --serial DEVICE_SERIAL
  --include-legacy
    Include the legacy package in clean mode. Check mode always treats it as a conflict.
  --allow-missing-keep
  -h, --help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      mode="${2:?missing value for --mode}"
      shift 2
      ;;
    --keep-package)
      keep_package="${2:?missing value for --keep-package}"
      shift 2
      ;;
    --serial)
      serial="${2:?missing value for --serial}"
      shift 2
      ;;
    --include-legacy)
      include_legacy=1
      shift
      ;;
    --allow-missing-keep)
      allow_missing_keep=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'failed: unknown option: %s\n' "$1" >&2
      usage >&2
      exit 64
      ;;
  esac
done

case "$mode" in
  check|clean)
    ;;
  clean-internal)
    keep_package="dev.serverraum247.meinmediplan.internal"
    ;;
  clean-release)
    keep_package="dev.serverraum247.meinmediplan"
    ;;
  clean-debug)
    keep_package="dev.serverraum247.meinmediplan.debug"
    ;;
  *)
    printf 'failed: unsupported mode: %s\n' "$mode" >&2
    exit 64
    ;;
esac

if [[ "$mode" == "check" ]] || (( include_legacy )); then
  KNOWN_PACKAGES+=("$LEGACY_PACKAGE")
fi

is_known_package() {
  local package_name="$1"
  local known
  for known in "${KNOWN_PACKAGES[@]}"; do
    [[ "$known" == "$package_name" ]] && return 0
  done
  return 1
}

if ! is_known_package "$keep_package"; then
  printf 'failed: keep package is not in the known variant list: %s\n' "$keep_package" >&2
  exit 64
fi

if ! command -v adb >/dev/null 2>&1; then
  printf 'failed: adb not found\n' >&2
  exit 127
fi

resolve_device() {
  if [[ -n "$serial" ]]; then
    printf '%s\n' "$serial"
    return
  fi

  local devices
  devices="$(adb devices | awk 'NR > 1 && $2 == "device" {print $1}')"
  if [[ -z "$devices" ]]; then
    printf 'failed: no unlocked Android device visible via adb\n' >&2
    exit 1
  fi

  local count
  count="$(printf '%s\n' "$devices" | sed '/^$/d' | wc -l | tr -d ' ')"
  if [[ "$count" != "1" ]]; then
    printf 'failed: multiple Android devices visible; pass --serial\n' >&2
    printf '%s\n' "$devices" >&2
    exit 1
  fi

  printf '%s\n' "$devices"
}

list_known_installed_packages() {
  local device="$1"
  local user_id="$2"
  local installed_packages
  installed_packages="$(adb -s "$device" shell pm list packages --user "$user_id" | sed 's/^package://')"

  local known
  for known in "${KNOWN_PACKAGES[@]}"; do
    if printf '%s\n' "$installed_packages" | grep -qxF "$known"; then
      printf '%s\n' "$known"
    fi
  done
}

print_installed_packages() {
  local installed="$1"
  while IFS= read -r package_name; do
    [[ -z "$package_name" ]] && continue
    printf '  - %s\n' "$package_name" >&2
  done <<<"$installed"
}

device="$(resolve_device)"
user_id="$(adb -s "$device" shell am get-current-user | tr -d '\r[:space:]')"
if [[ -z "$user_id" ]]; then
  user_id="0"
fi

installed="$(list_known_installed_packages "$device" "$user_id")"
installed_count="$(printf '%s\n' "$installed" | sed '/^$/d' | wc -l | tr -d ' ')"

has_keep=0
if printf '%s\n' "$installed" | grep -qxF "$keep_package"; then
  has_keep=1
fi

if [[ "$mode" == "check" ]]; then
  if (( ! has_keep )); then
    printf 'failed: missing expected Android app variant on %s: %s\n' "$device" "$keep_package" >&2
    if [[ "$installed_count" != "0" ]]; then
      print_installed_packages "$installed"
    fi
    exit 1
  fi

  if [[ "$installed_count" != "1" ]]; then
    printf 'failed: found %s known Android app variants on %s; keep only %s\n' "$installed_count" "$device" "$keep_package" >&2
    print_installed_packages "$installed"
    exit 1
  fi

  printf 'ok: only %s installed on %s\n' "$keep_package" "$device"
  exit 0
fi

while IFS= read -r package_name; do
  [[ -z "$package_name" ]] && continue
  [[ "$package_name" == "$keep_package" ]] && continue

  printf 'removing %s from %s user %s\n' "$package_name" "$device" "$user_id"
  adb -s "$device" shell pm uninstall --user "$user_id" "$package_name" >/dev/null
done <<<"$installed"

installed="$(list_known_installed_packages "$device" "$user_id")"
installed_count="$(printf '%s\n' "$installed" | sed '/^$/d' | wc -l | tr -d ' ')"
has_keep=0
if printf '%s\n' "$installed" | grep -qxF "$keep_package"; then
  has_keep=1
fi

if (( has_keep )) && [[ "$installed_count" == "1" ]]; then
  printf 'ok: only %s remains on %s\n' "$keep_package" "$device"
  exit 0
fi

if (( ! has_keep )) && (( allow_missing_keep )) && [[ "$installed_count" == "0" ]]; then
  printf 'ok: no conflicting Android app variants remain on %s\n' "$device"
  exit 0
fi

if (( ! has_keep )); then
  printf 'failed: missing expected Android app variant on %s: %s\n' "$device" "$keep_package" >&2
else
  printf 'failed: still found multiple Android app variants on %s\n' "$device" >&2
fi
if [[ "$installed_count" != "0" ]]; then
  print_installed_packages "$installed"
fi
exit 1
