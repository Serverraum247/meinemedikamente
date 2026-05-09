#!/usr/bin/env bash
set -euo pipefail

status=0

console_matches="$(
  rg -n 'console\.(debug|error|info|log|warn)' App.tsx index.js src __tests__ \
    -g '*.js' -g '*.jsx' -g '*.ts' -g '*.tsx' \
    -g '!src/utils/Logger.ts' || true
)"

if [[ -n "$console_matches" ]]; then
  printf 'Raw console usage found. Use src/utils/Logger.ts instead:\n%s\n' "$console_matches"
  status=1
fi

focused_test_matches="$(
  rg -n '\b(fdescribe|fit|describe\.only|it\.only|test\.only)\b' __tests__ src \
    -g '*.js' -g '*.jsx' -g '*.ts' -g '*.tsx' || true
)"

if [[ -n "$focused_test_matches" ]]; then
  printf 'Focused test found. Remove .only/fit/fdescribe before committing:\n%s\n' "$focused_test_matches"
  status=1
fi

exit "$status"
