#!/usr/bin/env bash
# bump-version.sh — bash counterpart of bump-version.ps1.
#
# Bumps every cache-busting timestamp the frontend checks against:
#   - all "?v=NNNNNNNNNNNN" query params in index.html
#   - the embedded window.APP_VERSION constant in index.html
#   - the service-worker.js header comment "// vNNNNNNNNNNNN"
#   - the service-worker.js CACHE_NAME = 'tcg-analysis-vNNNNNNNNNNNN'
#   - version.json (network-only freshness probe the SPA polls)
#
# The PowerShell version is what runs locally on Windows; this bash
# version runs on the GitHub Actions Linux runner so the weekly
# workflow can bump versions identically without installing
# PowerShell-on-Linux. Both must produce the same yyyyMMddHHmm
# timestamp shape so consumers don't notice a difference.
#
# Run from the repo root:
#   ./bump-version.sh

set -euo pipefail

ts="$(date -u +'%Y%m%d%H%M')"

# --- index.html: ?v=... + APP_VERSION ---
# sed -i works in place. The capture-and-replace patterns mirror the
# regexes in bump-version.ps1 exactly. Using POSIX BRE because GNU sed
# accepts \d via the -E switch only — we stick to [0-9] for portability.
sed -i -E "s/\\?v=[0-9]+/?v=${ts}/g" index.html
sed -i -E "s/window\\.APP_VERSION[[:space:]]*=[[:space:]]*'[^']+'/window.APP_VERSION = '${ts}'/" index.html

# --- index.html: window._formatWindow snapshot ---
# Sync the three rotation-defining fields from data/format_window.json
# into the inline script so every later JS module has them synchronously.
# Tools used: python's json reader (already a build dep) — avoids a jq
# dependency on the Actions runner.
if [ -f data/format_window.json ]; then
  cs=$(python3 -c "import json; print(json.load(open('data/format_window.json')).get('current_set',''))" 2>/dev/null || echo "")
  ols=$(python3 -c "import json; print(json.load(open('data/format_window.json')).get('oldest_legal_set',''))" 2>/dev/null || echo "")
  csjp=$(python3 -c "import json; print(json.load(open('data/format_window.json')).get('current_set_jp',''))" 2>/dev/null || echo "")
  if [ -n "$cs" ];  then sed -i -E "s/(current_set:[[:space:]]*)'[^']*'/\\1'${cs}'/"  index.html; fi
  if [ -n "$ols" ]; then sed -i -E "s/(oldest_legal_set:[[:space:]]*)'[^']*'/\\1'${ols}'/" index.html; fi
  if [ -n "$csjp" ];then sed -i -E "s/(current_set_jp:[[:space:]]*)'[^']*'/\\1'${csjp}'/" index.html; fi
  echo "  index.html        _formatWindow = {current_set:${cs}, oldest_legal_set:${ols}, current_set_jp:${csjp}}"
fi

# --- service-worker.js: header comment + CACHE_NAME ---
sed -i -E "s|// v[0-9]+|// v${ts}|" service-worker.js
sed -i -E "s/CACHE_NAME = 'tcg-analysis-v[0-9]+'/CACHE_NAME = 'tcg-analysis-v${ts}'/" service-worker.js

# --- version.json: minimal JSON the SPA pulls on each load ---
printf '{"version":"%s"}' "${ts}" > version.json

echo "Version bumped: ${ts}"
echo "  index.html        ?v=${ts} + APP_VERSION"
echo "  service-worker.js CACHE_NAME = tcg-analysis-v${ts}"
echo "  version.json      ${ts}"
