#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
POD_INSTALL_TIMEOUT_SECONDS="${POD_INSTALL_TIMEOUT_SECONDS:-180}"
NODE_BINARY="${NODE_BINARY:-/Users/danielbrussig/.local/bin/node}"

run_with_timeout() {
  local seconds="$1"
  shift

  if command -v timeout >/dev/null 2>&1; then
    timeout "$seconds"s "$@"
  else
    perl -e 'alarm shift; exec @ARGV' "$seconds" "$@"
  fi
}

if [[ ! -x "$NODE_BINARY" ]]; then
  printf 'failed: NODE_BINARY not executable: %s\n' "$NODE_BINARY" >&2
  exit 1
fi

export NODE_BINARY
export PATH="$(dirname "$NODE_BINARY"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

if ! command -v pod >/dev/null 2>&1; then
  printf 'failed: CocoaPods not found on PATH\n' >&2
  exit 1
fi

pod_path="$(command -v pod)"
if [[ "$pod_path" != "/opt/homebrew/bin/pod" ]]; then
  printf 'warning: using CocoaPods at %s; expected /opt/homebrew/bin/pod\n' "$pod_path" >&2
fi

cd "$ROOT_DIR/ios"
printf 'Running pod install with %s. Timeout: %ss\n' "$pod_path" "$POD_INSTALL_TIMEOUT_SECONDS"

if run_with_timeout "$POD_INSTALL_TIMEOUT_SECONDS" pod install "$@"; then
  printf 'ok: pod install completed\n'
else
  rc=$?
  printf 'failed: pod install exited with %s or timed out after %ss\n' "$rc" "$POD_INSTALL_TIMEOUT_SECONDS" >&2
  printf 'hint: do not use `bundle exec pod install` in this repo; the local Bundler/Ruby path has been observed hanging during CocoaPods require/load.\n' >&2
  exit "$rc"
fi
