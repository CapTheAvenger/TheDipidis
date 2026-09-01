#!/bin/bash
# Run every tests/unit/test-*.js with node --test and roll the per-file
# pass/fail counters into a single summary. Mirrors the loop that
# .github/workflows/deploy-pages.yml uses for the JS unit suite — local
# parity prevents the "broke a vm.createContext sandbox in app-core.js
# and didn't notice until CI flagged it" failure mode that bit us once.
#
# Exit code: 0 when every suite passes, 1 on the first failure.
#
# Usage:
#   bash scripts/run-js-unit-tests.sh
#   npm run test:unit
set -e
cd "$(dirname "$0")/.."

# LEERE DATEIEN ZAEHLEN NICHT ALS BESTANDEN.
#
# BEFUND (30.08.2026): 15 Dateien unter tests/unit/ sind 0 Byte gross —
# test-parseCSV.js, test-deckBuilder.js, test-dataIntegrity.js und zwoelf
# weitere. `node --test` auf eine leere Datei meldet `# pass 1`, und die
# Schleife hier addierte das mit. Die Gesamtzahl war also um 15
# ueberhoeht, und zwar ausgerechnet mit Dateien, deren NAME Abdeckung
# behauptet, die es nicht gibt.
#
# Sie werden nicht geloescht — jeder Name benennt eine Luecke, die
# jemand schliessen wollte, und ein geloeschter Name ist eine vergessene
# Luecke. Sie werden gezaehlt und benannt, damit die Zahl darueber
# ehrlich bleibt.
TOTAL_PASS=0
TOTAL_FAIL=0
FAILED_FILES=()
LEERE=()

for f in tests/unit/test-*.js; do
    if [ ! -s "$f" ]; then
        LEERE+=("$f")
        continue
    fi
    # `set -e` steht oben: eine Zuweisung aus einem fehlgeschlagenen
    # Kommando wuerde das Skript sofort beenden. Deshalb der if-Zweig
    # statt `CODE=$?` — der wird bei einem roten Lauf nie erreicht.
    if OUTPUT=$(node --test "$f" 2>&1); then CODE=0; else CODE=$?; fi
    PASS=$(echo "$OUTPUT" | grep -oP '^# pass \K\d+' | head -1)
    FAIL=$(echo "$OUTPUT" | grep -oP '^# fail \K\d+' | head -1)
    [ -z "$PASS" ] && PASS=0
    [ -z "$FAIL" ] && FAIL=0

    # EIN ABSTURZ BEIM LADEN IST KEIN BESTANDEN.
    #
    # BEFUND (01.09.2026): tests/unit/test-abnahme-agentenrunde-30-08.js
    # rief im describe-Rumpf CSS.match(...)[0] auf einer Regel auf, die
    # es nicht mehr gab. Der TypeError flog, BEVOR node --test eine
    # einzige Zusicherung gezaehlt hatte. Vier Zusicherungen
    # verschwanden lautlos aus der Gesamtzahl, und die Suite war gruen.
    #
    # NACHGEMESSEN, weil die erste Reparatur danebengriff: der
    # Exit-Code taugt dafuer NICHT.
    #
    #   throw im describe-Rumpf   -> "not ok 1 - <Suite>", # fail 0, Exit 0
    #   throw auf oberster Ebene  ->                       # fail 1, Exit 1
    #
    # Der erste Fall ist genau der aufgetretene, und er sieht am
    # Exit-Code aus wie ein sauberer Lauf. Was ihn verraet, ist die
    # TAP-Zeile: `not ok` auf oberster Ebene, ohne dass der Zaehler
    # darunter davon weiss. Also wird gezaehlt, was TAP meldet, und mit
    # dem Zaehler verglichen. Mehr `not ok` als `# fail` heisst: hier
    # ist etwas fehlgeschlagen, das niemand mitgezaehlt hat.
    NOTOK=$(echo "$OUTPUT" | grep -cE '^not ok ' || true)
    if [ "$NOTOK" -gt "$FAIL" ]; then
        echo "✗ $f — $NOTOK Fehlschlag/Fehlschlaege gemeldet, aber nur $FAIL gezaehlt"
        echo "   (typisch: ein Fehler im describe-Rumpf, bevor eine Zusicherung lief)"
        echo "$OUTPUT" | grep -B2 -A6 'Error' | head -20
        FAILED_FILES+=("$f")
        TOTAL_PASS=$((TOTAL_PASS + PASS))
        TOTAL_FAIL=$((TOTAL_FAIL + NOTOK))
        continue
    fi
    if [ "$CODE" -ne 0 ] && [ "$FAIL" -eq 0 ]; then
        echo "✗ $f — abgebrochen, ohne dass ein Fehlschlag gezaehlt wurde (Exit $CODE)"
        echo "$OUTPUT" | grep -B2 -A6 'Error' | head -20
        FAILED_FILES+=("$f")
        TOTAL_PASS=$((TOTAL_PASS + PASS))
        TOTAL_FAIL=$((TOTAL_FAIL + 1))
        continue
    fi

    TOTAL_PASS=$((TOTAL_PASS + PASS))
    TOTAL_FAIL=$((TOTAL_FAIL + FAIL))
    if [ "$FAIL" -gt 0 ]; then
        echo "✗ $f — $FAIL failure(s)"
        echo "$OUTPUT" | grep -A2 'not ok\|error:' | head -20
        FAILED_FILES+=("$f")
    fi
done

echo ""
echo "JS unit tests: $TOTAL_PASS passed, $TOTAL_FAIL failed"

if [ ${#LEERE[@]} -gt 0 ]; then
    echo ""
    echo "${#LEERE[@]} leere Testdatei(en) — nicht mitgezaehlt, Luecke offen:"
    for f in "${LEERE[@]}"; do
        echo "  • $f"
    done
fi

if [ "$TOTAL_FAIL" -gt 0 ]; then
    echo ""
    echo "Failed file(s):"
    for f in "${FAILED_FILES[@]}"; do
        echo "  • $f"
    done
    exit 1
fi
