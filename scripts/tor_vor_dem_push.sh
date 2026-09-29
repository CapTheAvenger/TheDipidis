#!/bin/bash
# DAS TOR VOR DEM PUSH — fuer jeden Ablauf, der nach `main` schreibt.
#
# Aufruf:
#   bash scripts/tor_vor_dem_push.sh kern    # TCG-Kern: tests/unit + tests/python
#   bash scripts/tor_vor_dem_push.sh alle    # Kern + tests/nebenbereiche/{unit,python}
#
# Rueckgabewert 0 = alle Zusicherungen gruen, der Ablauf darf pushen.
# Rueckgabewert 1 = etwas ist rot (oder das Tor konnte nicht pruefen) —
#                   NICHTS pushen.
#
# WARUM ES DAS GIBT (29.09.2026)
# ------------------------------
# Seit dem 22.09.2026 prueft der Wochenlauf seine eigene Ausgabe, bevor er
# pusht. Alle anderen Ablaeufe, die nach main schreiben, taten das nicht:
# die Champions-Nachtlaeufe (04:00, 05:00 UTC), die Pocket-Liste, der
# Limitless-API-Lauf (03:40) und der Preislauf (08:00). Ein Tagesstand,
# der eine Zusicherung rot macht, landete damit ungeprueft auf main —
# und hielt zwei Dinge an: den Deploy (test-Job) UND das Tor des naechsten
# Wochenlaufs, der main plus frische Daten prueft. Gemessen am 29.09.2026:
# eine einzige neue Art im Champions-Pokedex macht zwei JS-Zusicherungen
# rot.
#
# Die Regel: WER NACH MAIN SCHREIBT, PRUEFT VORHER. Dann ist main immer
# gruen, und ein roter Befund bleibt bei dem Ablauf, der ihn verursacht.
#
# Die Paketliste ist dieselbe wie im Testschritt von deploy-pages.yml
# (tests/python/test_tor_und_testschritt_ziehen_gleich.py haelt das fest).
# TOR_OHNE_INSTALL=1 ueberspringt die Installation (fuer die Zusicherung,
# die dieses Skript ausfuehrt).
set -u
cd "$(dirname "$0")/.."

bereich="${1:-kern}"
case "$bereich" in
    kern|alle) ;;
    *) echo "::error::tor_vor_dem_push.sh: unbekannter Bereich '$bereich' (kern|alle)"; exit 1 ;;
esac

zusammenfassung="${GITHUB_STEP_SUMMARY:-/dev/null}"
protokolle="${RUNNER_TEMP:-/tmp}/tor"
mkdir -p "$protokolle"

if ! command -v node >/dev/null 2>&1; then
    echo "::error::node fehlt — das Tor kann nicht pruefen und laesst deshalb NICHTS durch."
    exit 1
fi

if [ "${TOR_OHNE_INSTALL:-0}" != "1" ]; then
    npm install --no-save papaparse >/dev/null 2>&1
    python3 -m pip install --quiet \
        pytest beautifulsoup4 requests lxml \
        zxing-cpp segno Pillow PyYAML >/dev/null 2>&1
fi

# Die Nachschlagetabellen wie im Deploy-Test (deploy-pages.yml, Schritt
# "Nachschlagetabellen fuer die Tests saeen"): 22 Python-Tests lesen
# backend/core/data. Ohne diesen Schritt prueft das Tor etwas anderes als
# der Deploy.
mkdir -p backend/core/data
cp -al data/*.csv data/*.json backend/core/data/ 2>/dev/null \
    || cp -f data/*.csv data/*.json backend/core/data/ 2>/dev/null || true

rot=0
laeufe=("js-kern|bash scripts/run-js-unit-tests.sh tests/unit"
        "py-kern|python3 -m pytest tests/python -q")
if [ "$bereich" = "alle" ]; then
    laeufe+=("js-neben|bash scripts/run-js-unit-tests.sh tests/nebenbereiche/unit"
             "py-neben|python3 -m pytest tests/nebenbereiche/python -q")
fi

{
    echo "## Tor vor dem Push ($bereich)"
    echo ""
    echo "| Suite | Rueckgabewert | Ergebnis |"
    echo "| --- | ---: | --- |"
} >> "$zusammenfassung"

for lauf in "${laeufe[@]}"; do
    name="${lauf%%|*}"
    befehl="${lauf#*|}"
    log="$protokolle/$name.log"
    bash -c "$befehl" > "$log" 2>&1
    rc=$?
    ergebnis=$(grep -E 'JS unit tests:|[0-9]+ (passed|failed|error)' "$log" | tail -n 1)
    echo "| $name | $rc | $ergebnis |" >> "$zusammenfassung"
    echo "$name: Rueckgabewert $rc — $ergebnis"
    if [ "$rc" -ne 0 ]; then
        rot=1
    fi
done

if [ "$rot" -ne 0 ]; then
    {
        echo ""
        echo "**Es wird NICHTS gepusht.** \`main\` bleibt auf dem letzten guten Stand."
        echo ""
        echo "### Rot — die Meldungen"
        echo '```'
        grep -hE '^✗|^FAILED|^ *error:|^ *[A-Za-z]*Error|^E ' "$protokolle"/*.log 2>/dev/null | head -80 || true
        echo '```'
        for log in "$protokolle"/*.log; do
            echo ""
            echo "<details><summary>$(basename "$log"), letzte 120 Zeilen</summary>"
            echo ""
            echo '```'
            tail -n 120 "$log"
            echo '```'
            echo "</details>"
        done
    } >> "$zusammenfassung"
    grep -hE '^✗|^FAILED' "$protokolle"/*.log 2>/dev/null | head -20 || true
    echo "::error::Das Tor ist zu: Zusicherungen rot ($bereich) — nicht gepusht. Siehe Zusammenfassung."
    exit 1
fi
echo "Tor offen: alle Suiten gruen ($bereich)."
exit 0
