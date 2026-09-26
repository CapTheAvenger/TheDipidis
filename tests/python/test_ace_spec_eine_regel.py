"""DA-2: alle Schreiber nach EINER Regel, und die ist die starke.

Gemessen 26.09.2026: `repariere_ace_spec.py --melden` meldete 7 Felder
Drift in 6 Dateien. Zwei Ursachen:

1. `entscheide` (Bestandsbelege) kannte die Kopienzahl DER ZEILE nicht.
   Eine Karte, die zum ersten Mal mehrfach lag (Adventuring Lantern, M6 64,
   max_count 2), bekam ein leeres Feld — die schwache Regel haette "No"
   geschrieben.
2. per_decklist_scraper.py und tournament_scraper_JH.py schrieben weiter
   mit `entscheide_zeile` in dieselben Dateien, die der Abgleich mit dem
   ganzen Bestand prueft.
"""
import itertools
import os
import re
import sys

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(WURZEL, "backend", "core"))

import ace_spec_regel as regel  # noqa: E402


def test_die_starke_regel_ist_nie_schwaecher_als_die_zeilenweise():
    """Ueber alle Kombinationen: wo entscheide_zeile entscheidet, entscheidet
    entscheide genauso — auch mit LEEREM Bestand."""
    ace = {"unfair stamp"}
    namen = ["Unfair Stamp", "Adventuring Lantern", "Cleffa", ""]
    kopien = [None, 0, 1, 2, "2,0", 4]
    typen = ["", "Item", "Basic", "Supporter", "Basic Energy"]
    for name, m, t in itertools.product(namen, kopien, typen):
        schwach = regel.entscheide_zeile(name, ace, max_count=m, typ=t)
        stark = regel.entscheide(name, ace, set(), {}, typ=t, max_count=m)
        if schwach:
            assert stark == schwach, (name, m, t, schwach, stark)


def test_erste_mehrfache_nennung_wird_no():
    assert regel.entscheide("Adventuring Lantern", set(), set(), {}, typ="Item", max_count=2) == "No"
    assert regel.entscheide("Adventuring Lantern", set(), set(), {}, typ="Item", max_count=1) == ""


def _ohne_kommentare(quelle):
    return "\n".join(z for z in quelle.splitlines() if not z.lstrip().startswith("#"))


def test_kein_schreiber_benutzt_mehr_die_zeilenweise_regel():
    schreiber = [
        "backend/scrapers/per_decklist_scraper.py",
        "backend/scrapers/tournament_scraper_JH.py",
        "backend/scrapers/limitless_online_decklist_scraper.py",
        "backend/core/limitless_dated.py",
        "backend/core/card_scraper_shared.py",
    ]
    for pfad in schreiber:
        q = _ohne_kommentare(open(os.path.join(WURZEL, pfad), encoding="utf-8").read())
        assert "entscheide_zeile(" not in q, f"{pfad} schreibt noch nach der zeilenweisen Regel"
        for aufruf in re.findall(r"entscheide\((?:[^()]|\([^()]*\))*\)", q):
            if "is_ace_spec" in aufruf:
                continue
            assert "max_count=" in aufruf, f"{pfad}: entscheide ohne Kopienzahl der Zeile: {aufruf[:80]}"
