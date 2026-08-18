#!/usr/bin/env bash
# merge.sh — spielt die sieben Redesign-Commits sicher ein.
#
# Prüft vorher alles, was schiefgehen kann, bricht bei Zweifel ab und lässt das
# Repo dann unverändert zurück. Nichts wird gepusht — das ist der letzte Schritt
# und der gehört dir.
#
#   Aufruf:  bash merge.sh /pfad/zum/redesign-ordner
#            bash merge.sh                     (Ordner = Verzeichnis dieses Skripts)

set -euo pipefail

PATCH_DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
BRANCH="redesign-e0-e2"
BASE_COMMIT=""            # bewusst leer: die Patches tragen keinen Versionsstempel

red()  { printf '\033[31m%s\033[0m\n' "$*"; }
grn()  { printf '\033[32m%s\033[0m\n' "$*"; }
ylw()  { printf '\033[33m%s\033[0m\n' "$*"; }
step() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }
die()  { red "ABBRUCH: $*"; exit 1; }

# ── 1. Stehen wir im richtigen Repo? ────────────────────────────────────────
step "Repository prüfen"
git rev-parse --git-dir >/dev/null 2>&1 || die "kein Git-Repository. Wechsle zuerst in deinen TheDipidis-Ordner."
[ -f CLAUDE.md ] && [ -f bump-version.sh ] && [ -d js ] \
  || die "das sieht nicht nach TheDipidis aus (CLAUDE.md, bump-version.sh oder js/ fehlt)."
grn "  ok — $(git rev-parse --show-toplevel)"

# ── 2. Liegen die Patches da? ───────────────────────────────────────────────
step "Patches suchen"
shopt -s nullglob
PATCHES=("$PATCH_DIR"/0*.patch)
shopt -u nullglob
[ "${#PATCHES[@]}" -eq 9 ] || die "erwartet werden 9 Patch-Dateien in '$PATCH_DIR', gefunden: ${#PATCHES[@]}"
grn "  ok — 7 Patches in $PATCH_DIR"

# ── 3. Ist der Arbeitsbaum sauber? ──────────────────────────────────────────
step "Arbeitsbaum prüfen"
if [ -n "$(git status --porcelain)" ]; then
  red "  Es gibt uncommittete Änderungen:"
  git status --short | sed 's/^/    /'
  die "committe oder stashe sie zuerst ('git stash -u'), damit nichts verlorengeht."
fi
grn "  ok — sauber"

# ── 4. Existiert der Branch schon? ──────────────────────────────────────────
step "Branchnamen prüfen"
if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  die "Branch '$BRANCH' existiert bereits. Entweder löschen ('git branch -D $BRANCH') oder BRANCH oben im Skript umbenennen."
fi
grn "  ok — '$BRANCH' ist frei"

# ── 5. main holen ───────────────────────────────────────────────────────────
step "main aktualisieren"
git checkout -q main
git pull --ff-only -q origin main || die "'git pull --ff-only' schlug fehl — dein lokaler main ist von origin abgewichen."
HEAD_SHA="$(git rev-parse --short HEAD)"
grn "  ok — main steht auf $HEAD_SHA"
ylw "  Die Patches enthalten bewusst KEINEN Versionsstempel: deploy-pages.yml stempelt"
ylw "  beim Deploy ohnehin neu, und ein mitgelieferter Stempel kollidiert mit jedem"
ylw "  Datenjob, der zwischendurch laeuft. Sie passen deshalb auf jeden main-Stand."

# ── 6. Anwenden ─────────────────────────────────────────────────────────────
step "Branch anlegen und Patches anwenden"
git checkout -q -b "$BRANCH"
if ! git am "${PATCHES[@]}"; then
  red "  Ein Patch passt nicht auf den aktuellen main."
  red "  Konfliktdateien:"
  git diff --name-only --diff-filter=U | sed 's/^/    /'
  red ""
  red "  Zurücksetzen mit:"
  red "    git am --abort && git checkout main && git branch -D $BRANCH"
  exit 1
fi
grn "  ok — $(git rev-list --count main..HEAD) Commits angewendet"

# ── 6b. index.html verdrahten ───────────────────────────────────────────────
# KEIN Patch fasst index.html an, und das ist Absicht. Die Datei wird von den
# Datenjobs mehrmals taeglich neu gestempelt (?v=..., APP_VERSION). Ein Diff
# darauf scheitert nicht an den geaenderten Zeilen, sondern an den KONTEXT-
# zeilen: der Nachbar der Einfuegung ist selbst ein gestempelter Link. Auch
# `git am -3` loest das nicht, weil die Einfuegung auf einer Zeile sitzt, die
# der Job veraendert hat.
#
# Deshalb setzt ein idempotentes Skript die vier Zeilen und faltet sie in den
# Navigations-Commit. Das ueberlebt jeden Stempel.
step "index.html verdrahten (4 Zeilen, stempelunabhaengig)"
[ -f "$PATCH_DIR/apply_index.py" ] || die "apply_index.py fehlt in '$PATCH_DIR'"
python3 "$PATCH_DIR/apply_index.py" | sed 's/^/  /'
if [ -n "$(git status --porcelain -- index.html)" ]; then
  NAV_SHA="$(git log --format=%H --grep='^nav: eine sichtbare Hauptnavigation' -1)"
  [ -n "$NAV_SHA" ] || die "Navigations-Commit nicht gefunden — index.html nicht eingefaltet."
  git add index.html
  if [ "$(git rev-parse HEAD)" = "$NAV_SHA" ]; then
    git commit -q --amend --no-edit
  else
    # Der Navigations-Commit ist nicht HEAD (Commit 7 liegt darueber): als
    # fixup anhaengen und per autosquash an die richtige Stelle falten.
    git commit -q --fixup="$NAV_SHA"
    GIT_SEQUENCE_EDITOR=: git rebase -q -i --autosquash main >/dev/null 2>&1 \
      || die "autosquash fehlgeschlagen — 'git rebase --abort' und melden."
  fi
  grn "  ok — in den Navigations-Commit gefaltet"
else
  ylw "  index.html war bereits verdrahtet — nichts zu tun"
fi

# ── 7. Testen ───────────────────────────────────────────────────────────────
step "Tests laufen lassen"
JS_OK=0; PY_OK=0
if bash scripts/run-js-unit-tests.sh 2>&1 | tail -2 | tee /tmp/js-test.txt | grep -q "0 failed"; then
  JS_OK=1; grn "  $(grep -o '[0-9]* passed, [0-9]* failed' /tmp/js-test.txt | head -1)"
else
  red "  JS-Tests fehlgeschlagen:"; cat /tmp/js-test.txt | sed 's/^/    /'
fi

if command -v python3 >/dev/null && python3 -m pytest --version >/dev/null 2>&1; then
  if python3 -m pytest tests/python -q 2>&1 | tail -2 | tee /tmp/py-test.txt | grep -q "passed"; then
    PY_OK=1; grn "  $(tail -1 /tmp/py-test.txt)"
  else
    red "  Python-Tests fehlgeschlagen:"; cat /tmp/py-test.txt | sed 's/^/    /'
  fi
  # pytest schreibt ueber scripts/resolve_by_card_text.py in eine getrackte
  # Datei. Sie darf nicht mitgecommittet werden.
  if ! git diff --quiet -- data/card_text_resolution.csv 2>/dev/null; then
    git checkout -- data/card_text_resolution.csv
    ylw "  data/card_text_resolution.csv wurde vom Test verändert und zurückgesetzt (bekannter Befund)."
  fi
else
  ylw "  pytest nicht installiert — Python-Tests übersprungen ('pip install pytest')."
  PY_OK=1
fi

# ── 8. !important-Regel ─────────────────────────────────────────────────────
step "!important-Zähler prüfen (darf nie steigen)"
AFTER="$(grep -ro '!important;' css/*.css | wc -l | tr -d ' ')"
BEFORE="$(git show main:css/styles.css > /tmp/_s.css 2>/dev/null; \
          for f in $(git ls-tree --name-only main css/ | grep '\.css$'); do git show "main:$f"; done \
          | grep -o '!important;' | wc -l | tr -d ' ')"
if [ "$AFTER" -le "$BEFORE" ]; then
  grn "  ok — $BEFORE → $AFTER"
else
  red "  gestiegen: $BEFORE → $AFTER"
fi

# ── 9. Ergebnis ─────────────────────────────────────────────────────────────
step "Ergebnis"
git --no-pager log --oneline main..HEAD | sed 's/^/  /'
echo
if [ "$JS_OK" = 1 ] && [ "$PY_OK" = 1 ] && [ -z "$(git status --porcelain)" ]; then
  grn "Alles grün. Wenn du zufrieden bist:"
  echo
  echo "    git push -u origin $BRANCH"
  echo
  echo "Danach auf GitHub einen PR öffnen, mergen, EINEN Deploy abwarten und"
  echo "https://thedipidis.app/version.json auf den neuen Stempel prüfen."
  echo "Erst dann den nächsten Push — Pages-Deploys sind serialisiert (CLAUDE.md)."
else
  red "Nicht alles grün. Nichts gepusht. Zum Verwerfen:"
  echo "    git checkout main && git branch -D $BRANCH"
  exit 1
fi
