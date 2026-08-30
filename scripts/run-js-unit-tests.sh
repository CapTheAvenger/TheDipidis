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
    OUTPUT=$(node --test "$f" 2>&1) || true
    PASS=$(echo "$OUTPUT" | grep -oP '^# pass \K\d+' | head -1)
    FAIL=$(echo "$OUTPUT" | grep -oP '^# fail \K\d+' | head -1)
    [ -z "$PASS" ] && PASS=0
    [ -z "$FAIL" ] && FAIL=0
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
