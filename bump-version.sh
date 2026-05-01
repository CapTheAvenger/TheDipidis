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

# --- service-worker.js: header comment + CACHE_NAME ---
sed -i -E "s|// v[0-9]+|// v${ts}|" service-worker.js
sed -i -E "s/CACHE_NAME = 'tcg-analysis-v[0-9]+'/CACHE_NAME = 'tcg-analysis-v${ts}'/" service-worker.js

# --- version.json: minimal JSON the SPA pulls on each load ---
printf '{"version":"%s"}' "${ts}" > version.json

echo "Version bumped: ${ts}"
echo "  index.html        ?v=${ts} + APP_VERSION"
echo "  service-worker.js CACHE_NAME = tcg-analysis-v${ts}"
echo "  version.json      ${ts}"
