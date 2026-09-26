#!/usr/bin/env bash
# Daten nach main schreiben — auch wenn gleichzeitig ein anderer Lauf schreibt.
#
# WARUM (27.09.2026): Verify Cardmarket mapping #15 endete mit Code 128.
# Drei Laeufe schrieben binnen Minuten nach main, alle mit
# data/data_stand.json. Die alte Schleife
#     git push && break; git pull --rebase && sleep ...
# lief in einen Rebase-Konflikt auf data_stand.json, und jeder weitere
# Versuch scheiterte am haengenden Rebase. Die gemessenen Zeilen waren weg.
#
# Die Datenstaende sind ABGELEITET — sie werden nicht zusammengefuehrt,
# sondern auf dem neuen Stand neu gebaut: zuruecksetzen auf origin/main,
# die eigenen Dateien zurueckkopieren, build_data_stand.py, neu committen.
#
# Aufruf:  bash scripts/daten_pushen.sh "<Commit-Nachricht>" datei1 [datei2 ...]
# Rueckgabe: 0 = geschrieben oder nichts zu schreiben, 1 = aufgegeben.
set -uo pipefail

nachricht="$1"; shift
dateien=("$@")
[ ${#dateien[@]} -gt 0 ] || { echo "::error::daten_pushen: keine Dateien"; exit 1; }

ablage="$(mktemp -d)"
sichern() { for f in "${dateien[@]}"; do [ -f "$f" ] && mkdir -p "$ablage/$(dirname "$f")" && cp "$f" "$ablage/$f"; done; }
zurueck() { for f in "${dateien[@]}"; do [ -f "$ablage/$f" ] && mkdir -p "$(dirname "$f")" && cp "$ablage/$f" "$f"; done; }
stand() { [ -f scripts/build_data_stand.py ] && python3 scripts/build_data_stand.py >/dev/null || true; }
festhalten() {
    git add -- "${dateien[@]}" 2>/dev/null
    [ -f data/data_stand.json ] && git add data/data_stand.json
    if git diff --cached --quiet; then return 1; fi
    git commit -q -m "$nachricht"
}

sichern
if ! festhalten; then echo "Nichts zu schreiben."; exit 0; fi

for versuch in 1 2 3 4 5; do
    if git push -q origin HEAD:main; then
        echo "Geschrieben (Versuch $versuch)."
        exit 0
    fi
    echo "Push abgelehnt (Versuch $versuch) — auf origin/main neu aufsetzen."
    git rebase --abort >/dev/null 2>&1 || true
    git fetch -q origin main || { sleep $((2 ** versuch)); continue; }
    git reset -q --hard origin/main
    zurueck
    stand
    if ! festhalten; then echo "Nach dem Neuaufsetzen nichts mehr zu schreiben."; exit 0; fi
    sleep $((2 ** versuch))
done
echo "::error::daten_pushen: nach 5 Versuchen aufgegeben"
exit 1
