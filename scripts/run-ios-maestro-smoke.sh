#!/usr/bin/env bash
set -euo pipefail

if [[ $# -eq 0 ]]; then
  set -- .maestro/smoke.yaml
fi

if [[ -n "${MAESTRO_DEVICE:-}" ]]; then
  device_id="$MAESTRO_DEVICE"
elif [[ -n "${IOS_SIMULATOR_ID:-}" ]]; then
  device_id="$IOS_SIMULATOR_ID"
else
  device_id="$(
    xcrun simctl list devices booted -j | node -e "
      let input = '';
      process.stdin.on('data', chunk => input += chunk);
      process.stdin.on('end', () => {
        const data = JSON.parse(input);
        const runtimes = Object.entries(data.devices || {});
        for (const [runtime, devices] of runtimes) {
          if (!runtime.includes('iOS')) continue;
          const booted = devices.find(device => device.state === 'Booted' && device.isAvailable !== false);
          if (booted) {
            process.stdout.write(booted.udid);
            return;
          }
        }
      });
    "
  )"
fi

if [[ -z "${device_id:-}" ]]; then
  printf 'error: no booted iOS simulator found. Boot a simulator or set IOS_SIMULATOR_ID.\n' >&2
  exit 1
fi

printf 'ok: using iOS simulator %s for Maestro\n' "$device_id"
MAESTRO_DEVICE="$device_id" bash scripts/run-maestro-flows.sh "$@"
