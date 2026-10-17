#!/bin/bash
# Prueft eine Masterclass-Ausarbeitung, die ins Konto geladen werden soll.
#
# UMZUG 17.10.2026: die gekauften Ausarbeitungen liegen nur noch in Hausis
# Konto (Firestore users/{uid}/masterclasses/<id>), nicht im oeffentlichen
# Repo. Die Zusicherungen an ihrem INHALT (60 Karten je Liste, hoechstens
# eine ACE SPEC, deutsche UND englische Kartennamen, Druckregel, Quellen,
# Fachbegriffe …) laufen deshalb nicht mehr in der CI, sondern hier — vor
# jedem Hochladen, gegen die Datei von der Platte:
#
#   bash scripts/pruefe_masterclass_konto.sh <datei.html>
#
# Rot heisst: nicht hochladen.
set -e
cd "$(dirname "$0")/.."
DATEI="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
[ -f "$DATEI" ] || { echo "Datei fehlt: $1"; exit 2; }
export MASTERCLASS_STUECK="$DATEI"
echo "== JS: tests/unit/test-masterclass.js gegen $DATEI"
node --test tests/unit/test-masterclass.js 2>&1 | grep -E "^# (pass|fail|skip)|^not ok" || true
node --test tests/unit/test-masterclass.js >/dev/null 2>&1 || { echo "ROT (JS)"; exit 1; }
echo "== Python: Inhaltspruefungen"
python3 -m pytest -q --no-header -p no:cacheprovider \
    tests/python/test_masterclass_kartennamen.py \
    tests/python/test_ace_spec_an_der_kachel.py \
    tests/python/test_masterclass_feldgroesse.py \
    tests/python/test_masterclass_am_wochenlauf.py
SKIP=$(node --test tests/unit/test-masterclass.js 2>&1 | grep -E "^# skipped" | awk '{print $3}')
if [ "${SKIP:-0}" != "0" ]; then echo "ROT: $SKIP Inhaltspruefungen uebersprungen — die Datei wurde nicht gelesen"; exit 1; fi
echo "GRUEN: $DATEI kann hochgeladen werden."
