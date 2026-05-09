#!/usr/bin/env bash
set -euo pipefail

if ! command -v maestro >/dev/null 2>&1; then
  printf 'missing: maestro\n' >&2
  exit 1
fi

if [[ $# -eq 0 ]]; then
  set -- .maestro/*.yaml
fi

device_args=()
if [[ -n "${MAESTRO_DEVICE:-}" ]]; then
  device_args=(--device "$MAESTRO_DEVICE")
fi

export MAESTRO_CLI_NO_ANALYTICS="${MAESTRO_CLI_NO_ANALYTICS:-true}"
export MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED="${MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED:-true}"

for flow in "$@"; do
  printf '\n==> maestro %s\n' "$flow"
  maestro "${device_args[@]}" test "$flow"
done
