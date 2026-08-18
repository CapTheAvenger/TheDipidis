#!/usr/bin/env bash
# merge-block4.sh — die vier Commits aus Block 4 auf einen frischen Zweig
# legen, beide Testlaeufe fahren, den !important-Zaehler pruefen.
#
# Was dieses Skript NICHT tut: pushen, mergen, squashen, rebasen,
# bump-version.sh laufen lassen. Es baut den Zweig und tritt zurueck.
#
#   bash merge-block4.sh /pfad/zu/TheDipidis
#
set -euo pipefail

REPO="${1:-.}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRANCH="block4-anleitung"

cd "$REPO"

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
die() { printf '\n\033[31mABBRUCH: %s\033[0m\n' "$*" >&2; exit 1; }

say "Vorpruefung"
[ -f index.html ] && [ -d js ] && [ -d css ] || die "$REPO sieht nicht nach TheDipidis aus."
git rev-parse --git-dir >/dev/null 2>&1 || die "kein Git-Repository."
[ -z "$(git status --porcelain)" ] || die "Arbeitsbaum ist nicht sauber. Erst aufraeumen."
git rev-parse --verify --quiet "$BRANCH" >/dev/null && die "Zweig $BRANCH existiert schon."

n=$(ls "$HERE"/000*.patch 2>/dev/null | wc -l)
[ "$n" -eq 4 ] || die "erwartet 4 Patchdateien in $HERE, gefunden $n."

# Block 4 setzt auf Block 3 auf (PR #453). Ohne den fehlt css/ds-share.css
# in der Ladereihenfolge und die Patches greifen ins Leere.
git merge-base --is-ancestor \
    "$(git rev-list -1 --grep='^share: zwei Bilder' main 2>/dev/null || echo HEAD)" main 2>/dev/null \
    || echo "  Hinweis: Block 3 nicht in main gefunden — pruefen, ob PR #453 gemergt ist."

say "main aktualisieren"
git checkout main
git pull --ff-only origin main

say "Zweig anlegen"
git checkout -b "$BRANCH"

say "Patches anwenden"
# 0004 ist gross (1,1 MB): er verschiebt 543.271 Zeichen Anleitung aus
# index.html in zwei neue Dateien. Das ist kein Fehler, das ist der Block.
git am --keep-non-patch \
    "$HERE"/0001-*.patch "$HERE"/0002-*.patch \
    "$HERE"/0003-*.patch "$HERE"/0004-*.patch || {
    echo
    echo "git am ist stehengeblieben. NICHT mit -3 oder --skip weitermachen:"
    echo "die Reihenfolge der vier Commits traegt die Begruendung."
    echo "  git am --abort   und dann nachfragen."
    echo
    echo "Alternative ohne Patches, falls main stark abgewichen ist:"
    echo "  git am --abort && git checkout main && git branch -D $BRANCH"
    echo "  git fetch \"$HERE/block4.bundle\" block4:$BRANCH"
    exit 1
}

say "Die Anleitung liegt da, wo sie hingehoert"
[ -f tutorial/tutorial.de.html ] || die "tutorial/tutorial.de.html fehlt."
[ -f tutorial/tutorial.en.html ] || die "tutorial/tutorial.en.html fehlt."
grep -q 'cp -r tutorial _site/tutorial' .github/workflows/deploy-pages.yml \
    || die "deploy-pages.yml kopiert tutorial/ nicht — die Anleitung waere im Repo, aber nicht auf der Seite."
printf '  index.html: %s Zeichen (vorher 838.814)\n' "$(wc -c < index.html)"

say "JS-Unittests"
bash scripts/run-js-unit-tests.sh

say "Python-Tests"
python3 -m pytest tests/python -q

git checkout -- data/card_text_resolution.csv 2>/dev/null || true

say "!important-Zaehler"
count=$(grep -ro '!important;' css/*.css | wc -l)
echo "  aktuell: $count   (vorher: 3399, erwartet: 3396)"
[ "$count" -le 3399 ] || die "der Zaehler ist gestiegen."

say "Fertig"
git log --oneline main.."$BRANCH"
echo
echo "Nichts gepusht. Naechster Schritt, wenn du zufrieden bist:"
echo "  git push -u origin $BRANCH"
echo "  gh pr create --fill"
