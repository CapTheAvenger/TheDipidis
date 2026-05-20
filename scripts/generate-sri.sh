#!/usr/bin/env bash
# generate-sri.sh — fetch CDN scripts referenced in index.html, compute
# their SHA-384 hashes, and write integrity="..." attributes back into
# index.html.
#
# Why a script and not hand-pinned hashes: jsdelivr / cdnjs can re-mint
# the same version (cache-warm regenerated), and a hand-pinned hash would
# break us silently if it ever drifts. Generating at build time keeps
# the hash always-correct.
#
# Why subresource-integrity at all: jsDelivr was abused for phishing in
# 2024 (Check Point report); a single bad re-publish of mobile-drag-drop@
# 3.0.0-rc.0 (RC since 2022, single maintainer, classic event-stream-shape
# supply-chain target) would inject arbitrary JS on our origin. SRI makes
# the browser refuse to execute any CDN file whose hash drifts.
#
# Run locally: ./scripts/generate-sri.sh
# Run in CI: deploy-pages.yml step "Inject SRI" calls this before minify.
set -euo pipefail

# URLs we want SRI on — selector matches the <script src="..."> / <link href="...">
# attributes in index.html exactly so the sed-replace can target them by URL.
URLS=(
  "https://cdn.jsdelivr.net/npm/mobile-drag-drop@3.0.0-rc.0/default.css"
  "https://cdn.jsdelivr.net/npm/mobile-drag-drop@3.0.0-rc.0/index.min.js"
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"
  "https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js"
  "https://cdnjs.cloudflare.com/ajax/libs/localforage/1.10.0/localforage.min.js"
)

TARGET_FILE="${1:-index.html}"

if [[ ! -f "$TARGET_FILE" ]]; then
  echo "ERROR: target file not found: $TARGET_FILE" >&2
  exit 1
fi

TMPDIR=$(mktemp -d)
trap "rm -rf '$TMPDIR'" EXIT

for url in "${URLS[@]}"; do
  fname=$(echo "$url" | sed 's|[/:?&=]|_|g')
  local_path="$TMPDIR/$fname"

  if ! curl -fsSL "$url" -o "$local_path" 2>/dev/null; then
    echo "WARN: failed to fetch $url — leaving its integrity= unchanged" >&2
    continue
  fi

  hash=$(openssl dgst -sha384 -binary "$local_path" | openssl base64 -A)
  integrity="sha384-${hash}"

  # Escape URL for sed regex (only special chars that matter: . ? &)
  esc_url=$(echo "$url" | sed 's|[.&]|\\&|g; s|?|\\?|g')

  # Three patterns: existing integrity= (replace), no integrity (insert before crossorigin),
  # no crossorigin either (insert before closing >).
  # Strategy: insert as new attribute after the URL, before the next attribute or >.
  # Idempotent: matches both "with-integrity" and "without-integrity" cases.

  # Remove any existing integrity= for this URL (so we can re-insert fresh)
  sed -i -E "s|(\"${esc_url}\")\s+integrity=\"[^\"]+\"|\1|g" "$TARGET_FILE"

  # Insert integrity= + crossorigin="anonymous" right after the URL.
  # If crossorigin is already present, this still produces a duplicate
  # crossorigin attribute that browsers tolerate but we'll guard against:
  sed -i -E "s|(\"${esc_url}\")(\s+crossorigin=\"anonymous\")?|\1 integrity=\"${integrity}\" crossorigin=\"anonymous\"|g" "$TARGET_FILE"

  # Collapse duplicate crossorigin attributes we may have just introduced
  sed -i -E "s| crossorigin=\"anonymous\" crossorigin=\"anonymous\"| crossorigin=\"anonymous\"|g" "$TARGET_FILE"

  echo "✓ $url"
  echo "    -> $integrity"
done

echo ""
echo "Done. ${#URLS[@]} resources processed in $TARGET_FILE"
