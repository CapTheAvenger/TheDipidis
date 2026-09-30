#!/usr/bin/env bash
# Den schon gebauten Commit eines Datenlaufs nach main bringen — auch wenn
# main inzwischen weitergezogen ist. Rueckgabe 0 heisst: gepusht ODER
# ehrlich nichts zu pushen. Ein Push, der nichts traegt, heisst nie Erfolg.
#
# WARUM (30.09.2026, Scraper-Durchgang): vierzehn Ablaeufe hatten je eine
# eigene Push-Schleife, und drei Bauarten davon verloren Daten oder meldeten
# Gruen fuer nichts:
#
#   1. `git pull --rebase ... && break` (Pocket, Limitless-API, Online-
#      Einzellisten). Scheitert der Rebase am Konflikt auf data_stand.json,
#      bleibt er stehen; jeder weitere `pull` scheitert an den offenen
#      Dateien, und `git push origin HEAD:main` schiebt den Stand von
#      origin/main — der Rebase steht ja noch VOR dem eigenen Commit.
#      "Everything up-to-date", rc 0, pushed=true, Deploy angestossen.
#      Gemessen: Pocket Tier List #11 (Lauf 36706113546), die neuen
#      B4b-Kennungen und Set-Namen kamen nie auf main.
#   2. `-X ours` beim Rebase (neun Ablaeufe). Beim Rebase ist "ours" die
#      Basis, also origin/main — im Konflikt verliert dieser Lauf; aendert
#      er nur, was ein anderer auch geaendert hat, faellt der Commit ganz
#      weg und der Push meldet wieder Erfolg. Im Wochenlauf am 29.09.
#      berichtigt, in den anderen Ablaeufen stand es weiter.
#   3. ein nacktes `git push` ohne zweiten Versuch (Champions-Sprites #9:
#      das Tor lief acht Minuten, main war danach weiter, rot).
#
# Dieses Skript macht es an EINER Stelle so, wie der Wochenlauf es seit
# dem 29.09. tut:
#   - im Konflikt gewinnt dieser Lauf (`-X theirs` — beim Rebase ist
#     "theirs" der neu aufgesetzte Commit);
#   - ein Rebase, der scheitert, wird abgebrochen und der Lauf ist rot;
#   - ist nach dem Rebase nichts Eigenes mehr uebrig, heisst das
#     pushed=false, nicht Erfolg;
#   - data_stand.json wird auf dem neuen Stand neu gebaut: die Fassung von
#     main, fortgeschrieben um die Dateien, die DIESER Commit aendert;
#   - der zusammengefuehrte Stand ist nicht der gepruefte — mit einer
#     Tor-Stufe laeuft das Tor vor dem naechsten Versuch noch einmal.
#
# Aufruf (der Commit ist schon gemacht):
#   bash scripts/push_nach_rebase.sh [kern|alle]
# Umgebung: ZWEIG (Standard main), GITHUB_OUTPUT (pushed=true|false).
set -uo pipefail

zweig="${ZWEIG:-main}"
tor="${1:-}"
ausgabe="${GITHUB_OUTPUT:-/dev/null}"
warte="${PUSH_WARTEN:-10}"

echo "pushed=false" >> "$ausgabe"

git fetch -q origin "$zweig" 2>/dev/null || true
if git rev-parse -q --verify "origin/$zweig" >/dev/null \
   && [ -z "$(git rev-list "origin/$zweig..HEAD")" ]; then
    echo "Nichts Eigenes vor origin/$zweig — nichts zu pushen."
    exit 0
fi

stand_neu_bauen() {
    # Die Fassung von main nehmen und nur die Dateien dieses Commits neu
    # stempeln: build_data_stand.py stempelt, was `git status` als geaendert
    # zeigt — deshalb den Commit kurz in den Index zurueckholen.
    [ -f scripts/build_data_stand.py ] && [ -f data/data_stand.json ] || return 0
    local nachricht
    nachricht="$(git log -1 --format=%B)"
    git reset -q --soft "origin/$zweig"
    git checkout -q "origin/$zweig" -- data/data_stand.json 2>/dev/null || true
    if ! python3 scripts/build_data_stand.py >/dev/null; then
        echo "::warning::push_nach_rebase: build_data_stand.py scheiterte — data_stand.json bleibt die Fassung von main"
        git checkout -q "origin/$zweig" -- data/data_stand.json 2>/dev/null || true
    fi
    git add data/data_stand.json
    git commit -q -m "$nachricht"
}

for versuch in 1 2 3 4 5; do
    if git push origin "HEAD:$zweig"; then
        echo "pushed=true" >> "$ausgabe"
        echo "Geschrieben (Versuch $versuch)."
        exit 0
    fi
    echo "Push abgelehnt (Versuch $versuch) — auf origin/$zweig neu aufsetzen."
    sleep $((versuch * warte))
    git rebase --abort >/dev/null 2>&1 || true
    if ! git fetch -q origin "$zweig"; then
        echo "::warning::push_nach_rebase: fetch gescheitert"
        continue
    fi
    if ! git rebase -q --autostash -X theirs "origin/$zweig"; then
        git rebase --abort >/dev/null 2>&1 || true
        echo "::error::push_nach_rebase: Rebase auf origin/$zweig gescheitert — nicht gepusht"
        exit 1
    fi
    if [ -z "$(git rev-list "origin/$zweig..HEAD")" ]; then
        echo "::warning::push_nach_rebase: nach dem Rebase steht nichts Eigenes mehr vor origin/$zweig — nichts gepusht"
        exit 0
    fi
    stand_neu_bauen
    if [ -n "$tor" ]; then
        if ! TOR_OHNE_INSTALL=1 bash scripts/tor_vor_dem_push.sh "$tor"; then
            echo "::error::push_nach_rebase: auf dem neuen Stand ist das Tor zu — nicht gepusht"
            exit 1
        fi
    fi
done
echo "::error::push_nach_rebase: nach 5 Versuchen aufgegeben"
exit 1
