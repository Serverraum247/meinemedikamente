#!/usr/bin/env bash
set -euo pipefail

bundle_id="${IOS_BUNDLE_ID:-com.meinemedikamente}"
simulator_name="${IOS_SIMULATOR_NAME:-iPhone 17 Pro}"

if [[ -n "${IOS_SIMULATOR_ID:-}" ]]; then
  destination="id=${IOS_SIMULATOR_ID}"
  reset_target="${IOS_SIMULATOR_ID}"
else
  destination="${IOS_DESTINATION:-platform=iOS Simulator,name=${simulator_name},OS=latest}"
  reset_target="booted"
fi

if xcrun simctl uninstall "$reset_target" "$bundle_id" >/dev/null 2>&1; then
  printf 'ok: cleared %s on %s\n' "$bundle_id" "$reset_target"
else
  printf 'warning: could not uninstall %s on %s; continuing\n' "$bundle_id" "$reset_target" >&2
fi

xcodebuild test \
  -workspace ios/MeineMedikamente.xcworkspace \
  -scheme MeineMedikamente \
  -configuration Debug \
  -destination "$destination" \
  CODE_SIGNING_ALLOWED=NO
