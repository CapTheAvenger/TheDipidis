#!/usr/bin/env bash
# Pocket-Ernte — die Tier-Liste von Game8 aus einer Umgebung holen, die
# Game8 durchlaesst.
#
# WARUM ES DIESES SKRIPT GIBT (SC-4, gemessen 26.09.2026)
# --------------------------------------------------------
#   GitHub-Laeufer   pocket-tierlist.yml Lauf #5 (26.09.2026, 18:38 UTC):
#                    cloudscraper 202 | curl_cffi 202 | requests 202
#                    — dasselbe Bild wie an drei Laeufen am 04.09.2026.
#   Cowork-Umgebung  game8.co 200 (600 KB, echte Seite), voller
#                    Trockenlauf: 25 Tier-Decks, 28 Set-Decks, 34
#                    ausgeliefert, QR-Bilder von img.game8.co gelesen.
#
# Eine 202 beweist, DASS der Laeufer nicht durchkommt, nicht WARUM. Die
# Vermutung "Rechenzentrums-Adressbereich" steht seit dem 04.09.2026 im
# Ablauf und ist NICHT GEPRUEFT; gemessen ist nur: Laeufer nein,
# Cowork-Umgebung ja.
#
# Deshalb laeuft die Ernte als woechentliche Aufgabe in der
# Cowork-Umgebung, und dieses Skript ist alles, was sie dort ausfuehrt.
# Das Ausliefern (ein Commit nach main) macht die Aufgabe selbst ueber
# den GitHub-Weg, der dort geht — git push ist dort gesperrt.
#
# Aufruf aus der Wurzel des Repos:   bash scripts/pocket_ernte.sh
# Rueckgabe:  0 = geerntet (geaendert oder nicht), sonst Abbruch.
# Letzte Zeilen der Ausgabe:  "GEAENDERT <datei>" je geaenderte Datei,
#                             oder "UNVERAENDERT".
set -uo pipefail

cd "$(dirname "$0")/.."

python3 scripts/scrape_pocket_tierlist.py "$@"
rc=$?
if [ $rc -ne 0 ]; then
    echo "ABBRUCH scrape_pocket_tierlist.py (Code $rc) — nichts ausliefern" >&2
    exit $rc
fi

# Die Set-Namen gehoeren in denselben Lauf (siehe pocket-tierlist.yml).
# Faellt die Namensseite aus, bleibt die blanke Kennung stehen — das ist
# kein Grund, frische Decks zurueckzuhalten.
if ! python3 scripts/build_pocket_sets.py; then
    echo "WARNUNG build_pocket_sets.py fehlgeschlagen — Set-Namen bleiben alt" >&2
fi

# Den Datenstand VOR dem Commit fortschreiben; build_data_stand.py liest
# git status und schreibt nur fort, was dieser Lauf angefasst hat.
python3 scripts/build_data_stand.py || {
    echo "ABBRUCH build_data_stand.py — nichts ausliefern" >&2
    exit 1
}

geaendert=0
for f in data/pocket_tierlist.json data/pocket_sets.json data/data_stand.json; do
    if [ -n "$(git status --porcelain -- "$f")" ]; then
        echo "GEAENDERT $f"
        geaendert=1
    fi
done
[ $geaendert -eq 0 ] && echo "UNVERAENDERT"
exit 0
