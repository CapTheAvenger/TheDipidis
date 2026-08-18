#!/usr/bin/env bash
# merge-block3.sh — die sechs Commits aus Block 3 auf einen frischen
# Zweig legen, beide Testlaeufe fahren, den !important-Zaehler pruefen.
#
# Was dieses Skript NICHT tut: pushen, mergen, squashen, rebasen,
# bump-version.sh laufen lassen. Es baut den Zweig und tritt zurueck.
#
#   bash merge-block3.sh /pfad/zu/TheDipidis
#
set -euo pipefail

REPO="${1:-.}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRANCH="block3-share"

cd "$REPO"

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
die() { printf '\n\033[31mABBRUCH: %s\033[0m\n' "$*" >&2; exit 1; }

say "Vorpruefung"
[ -f index.html ] && [ -d js ] && [ -d css ] || die "$REPO sieht nicht nach TheDipidis aus."
git rev-parse --git-dir >/dev/null 2>&1 || die "kein Git-Repository."
[ -z "$(git status --porcelain)" ] || die "Arbeitsbaum ist nicht sauber. Erst aufraeumen."
git rev-parse --verify --quiet "$BRANCH" >/dev/null && die "Zweig $BRANCH existiert schon."

n=$(ls "$HERE"/000*.patch 2>/dev/null | wc -l)
[ "$n" -eq 6 ] || die "erwartet 6 Patchdateien in $HERE, gefunden $n."

say "main aktualisieren"
git checkout main
git pull --ff-only origin main

say "Zweig anlegen"
git checkout -b "$BRANCH"

say "Patches anwenden"
git am --keep-non-patch \
    "$HERE"/0001-*.patch "$HERE"/0002-*.patch "$HERE"/0003-*.patch \
    "$HERE"/0004-*.patch "$HERE"/0005-*.patch "$HERE"/0006-*.patch || {
    echo
    echo "git am ist stehengeblieben. NICHT mit -3 oder --skip weitermachen:"
    echo "die Reihenfolge der sechs Commits traegt die Begruendung."
    echo "  git am --abort   und dann nachfragen."
    exit 1
}

say "JS-Unittests"
bash scripts/run-js-unit-tests.sh

say "Python-Tests"
python3 -m pytest tests/python -q

# scripts/resolve_by_card_text.py schreibt beim Testlauf in eine
# versionierte Datei. Bekannter offener Punkt, hier nur zuruecksetzen,
# damit der Zweig sauber bleibt.
git checkout -- data/card_text_resolution.csv 2>/dev/null || true

say "!important-Zaehler"
count=$(grep -ro '!important;' css/*.css | wc -l)
echo "  aktuell: $count   (vorher: 3402, erwartet: 3399)"
[ "$count" -le 3402 ] || die "der Zaehler ist gestiegen."

say "Fertig"
git log --oneline main.."$BRANCH"
echo
echo "Nichts gepusht. Naechster Schritt, wenn du zufrieden bist:"
echo "  git push -u origin $BRANCH"
echo "  gh pr create --fill"
