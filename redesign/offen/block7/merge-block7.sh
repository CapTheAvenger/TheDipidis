#!/usr/bin/env bash
# merge-block7.sh — die zwei Commits aus Block 7 auf einen frischen Zweig
# legen, beide Testlaeufe fahren, den !important-Zaehler pruefen.
#
# WICHTIG: Block 7 setzt auf Block 4 auf. Erst
#   bash redesign/offen/block6/merge-block6.sh .
# mergen, dann das hier.
#
#   bash merge-block7.sh /pfad/zu/TheDipidis
#
set -euo pipefail

REPO="${1:-.}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRANCH="block7-metacall"

cd "$REPO"

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
die() { printf '\n\033[31mABBRUCH: %s\033[0m\n' "$*" >&2; exit 1; }

say "Vorpruefung"
[ -f index.html ] && [ -d js ] && [ -d css ] || die "$REPO sieht nicht nach TheDipidis aus."
[ -z "$(git status --porcelain)" ] || die "Arbeitsbaum ist nicht sauber."
git rev-parse --verify --quiet "$BRANCH" >/dev/null && die "Zweig $BRANCH existiert schon."

n=$(ls "$HERE"/000*.patch 2>/dev/null | wc -l)
[ "$n" -eq 2 ] || die "erwartet 2 Patchdateien in $HERE, gefunden $n."

# Block 4 muss drin sein, sonst faellt der Anleitungs-Patch spaeter auf
# die Nase und Patch 1 findet seinen Kontext nicht.
grep -q 'Die Kachelbreite der Deck-Analyse' css/mobile-responsive.css \
    || die "Block 6 fehlt in css/mobile-responsive.css. Erst merge-block6.sh."

say "main aktualisieren"
git checkout main
git pull --ff-only origin main

say "Zweig anlegen"
git checkout -b "$BRANCH"

say "Patches anwenden"
git am --keep-non-patch "$HERE"/0001-*.patch "$HERE"/0002-*.patch || {
    echo
    echo "git am ist stehengeblieben. NICHT mit -3 oder --skip weitermachen."
    echo "  git am --abort   und dann nachfragen."
    echo
    echo "Alternative:  git fetch \"$HERE/block7.bundle\" block7:$BRANCH"
    exit 1
}

say "JS-Unittests"
bash scripts/run-js-unit-tests.sh

say "Python-Tests"
python3 -m pytest tests/python -q
git checkout -- data/card_text_resolution.csv 2>/dev/null || true

say "!important-Zaehler"
count=$(grep -ro '!important;' css/*.css | wc -l)
echo "  aktuell: $count   (unveraendert erwartet: 3356)"
[ "$count" -le 3356 ] || die "der Zaehler ist gestiegen."

say "Fertig"
git log --oneline main.."$BRANCH"
echo
echo "Nichts gepusht. Naechster Schritt:"
echo "  git push -u origin $BRANCH && gh pr create --fill"
