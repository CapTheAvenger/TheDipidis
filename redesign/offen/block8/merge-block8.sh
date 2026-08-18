#!/usr/bin/env bash
# merge-block8.sh — die sechs Commits aus Block 8 auf einen frischen Zweig
# legen, beide Testlaeufe fahren, den !important-Zaehler pruefen.
#
# Block 8 setzt auf Block 7 auf (PR #457, bereits in main).
#
#   bash merge-block8.sh /pfad/zu/TheDipidis
#
set -euo pipefail

REPO="${1:-.}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRANCH="block8-fehlerliste"

cd "$REPO"

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
die() { printf '\n\033[31mABBRUCH: %s\033[0m\n' "$*" >&2; exit 1; }

say "Vorpruefung"
[ -f index.html ] && [ -d js ] && [ -d css ] || die "$REPO sieht nicht nach TheDipidis aus."
[ -z "$(git status --porcelain)" ] || die "Arbeitsbaum ist nicht sauber."
git rev-parse --verify --quiet "$BRANCH" >/dev/null && die "Zweig $BRANCH existiert schon."

n=$(ls "$HERE"/000*.patch 2>/dev/null | wc -l)
[ "$n" -eq 6 ] || die "erwartet 6 Patchdateien in $HERE, gefunden $n."

# Block 7 muss drin sein, sonst findet Patch 3 in index.html seinen
# Kontext nicht (der Meta-Call-Tab).
grep -q 'metaCallHost' index.html \
    || die "Block 7 fehlt in index.html. Erst PR #457 mergen."

say "main aktualisieren"
git checkout main
git pull --ff-only origin main

say "Zweig anlegen"
git checkout -b "$BRANCH"

say "Patches anwenden"
git am --keep-non-patch "$HERE"/000*.patch || {
    echo
    echo "git am ist stehengeblieben. NICHT mit -3 oder --skip weitermachen."
    echo "  git am --abort   und dann nachfragen."
    echo
    echo "Alternative:  git fetch \"$HERE/block8.bundle\" block8:$BRANCH"
    exit 1
}

say "JS-Unittests"
bash scripts/run-js-unit-tests.sh

say "Python-Tests"
python3 -m pytest tests/python -q
git checkout -- data/card_text_resolution.csv 2>/dev/null || true

say "!important-Zaehler"
count=$(grep -ro '!important;' css/*.css | wc -l)
echo "  aktuell: $count   (erwartet: 3347, vorher 3356)"
[ "$count" -le 3347 ] || die "der Zaehler ist gestiegen."

say "Doppelte globale Namen"
# Block 8 raeumt die letzten drei auf. Wenn hier wieder welche
# auftauchen, ist beim Mergen etwas verlorengegangen.
node --test tests/unit/test-globale-namen.js >/dev/null \
    || die "test-globale-namen.js faellt durch."
echo "  keine"

say "Fertig"
git log --oneline main.."$BRANCH"
echo
echo "Nichts gepusht. Naechster Schritt:"
echo "  git push -u origin $BRANCH && gh pr create --fill"
