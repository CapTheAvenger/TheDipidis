# -*- coding: utf-8 -*-
"""Pocket geht nicht falsch, Pocket geht ALT — und niemand sagte es vorher.

BEFUND 22.09.2026. `data/pocket_tierlist.json` stand in keiner
automatischen Frischepruefung: nicht in data_stand.json, nicht in den
Schwellen von scripts/sanity_check_data.py, und der Data Guardian kannte
die Datei gar nicht (grep 'pocket' → 0 Treffer). Der einzige
Alterungsalarm war ein Banner im Browser ab 28 Tagen.

Der Bereich ist dabei voellig in Ordnung gebaut: die Oberflaeche schreibt
den Stand an und warnt ab PLAUSIBEL_TAGE. Nur faellt das eben einem
BESUCHER auf, und erst nach vier Wochen.

Der Lauf hat bewusst keinen Zeitplan — Game8 antwortet dem GitHub-Laeufer
auf jedem Weg mit HTTP 202 (Cloudflare, dreimal gemessen am 04.09.2026),
geerntet wird von Hand. Ein Lauf, der nie faellig ist, faellt auch nie
aus: genau deshalb braucht es hier eine Meldung.

Gemeldet wird, nicht gesperrt, und mit DERSELBEN Schwelle wie im
Browser — zwei Schwellen fuer dieselbe Frage waeren eine zu viel.
"""

import io
import os
import re

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
WAECHTER = os.path.join(WURZEL, "scripts", "data_guardian.py")
OBERFLAECHE = os.path.join(WURZEL, "js", "ds-pocket.js")


def _lies(p):
    with io.open(p, encoding="utf-8-sig") as f:
        return f.read()


def test_der_waechter_kennt_pocket_ueberhaupt():
    quelle = _lies(WAECHTER)
    assert "def check_pocket_frische(" in quelle, (
        "der Data Guardian prueft die Frische von pocket_tierlist.json nicht "
        "mehr — dann altert der Bereich wieder unsichtbar, und der Einzige, "
        "dem es auffaellt, ist ein Besucher nach vier Wochen")
    # Auf die AUFRUFZEILE pruefen, nicht auf die Zeichenkette: die
    # Definitionszeile enthaelt sie sonst selbst, und der Test bestuende,
    # obwohl die Pruefung nie laeuft. (Genau so durchgefallen bei der
    # Verfaelschungsprobe am 22.09.2026.)
    gerufen = any(z.strip() == "check_pocket_frische(findings)"
                  for z in quelle.split("\n"))
    assert gerufen, "die Pruefung ist definiert, wird aber nicht aufgerufen"


def test_der_waechter_meldet_und_sperrt_nicht():
    """Ein Lauf ohne Zeitplan ist kein Defekt."""
    quelle = _lies(WAECHTER)
    i = quelle.find("def check_pocket_frische(")
    block = quelle[i:quelle.find("\ndef ", i + 10)]
    assert '"WARN"' in block, "die Altersmeldung ist keine Warnung mehr"
    assert '"CRITICAL"' not in block.split("abgerufen")[-1], (
        "das ALTER von pocket_tierlist.json wird als CRITICAL gemeldet — "
        "eine alte Datei ist hier kein Defekt, sondern der Normalfall eines "
        "Laufs, der von Hand angestossen wird")


def test_waechter_und_browser_benutzen_dieselbe_schwelle():
    """Zwei Schwellen fuer dieselbe Frage waeren eine zu viel."""
    quelle = _lies(WAECHTER)
    i = quelle.find("def check_pocket_frische(")
    block = quelle[i:quelle.find("\ndef ", i + 10)]
    m = re.search(r"PLAUSIBEL_TAGE\s*=\s*(\d+)", block)
    assert m, "der Waechter nennt seine Schwelle nicht als PLAUSIBEL_TAGE"
    waechter = int(m.group(1))

    o = re.search(r"PLAUSIBEL_TAGE\s*=\s*(\d+)", _lies(OBERFLAECHE))
    assert o, ("js/ds-pocket.js fuehrt kein PLAUSIBEL_TAGE mehr — dann zeigt "
               "die Oberflaeche das Alter anders an als der Waechter es misst")
    assert waechter == int(o.group(1)), (
        f"der Waechter meldet ab {waechter} Tagen, der Browser ab "
        f"{o.group(1)} — dieselbe Frage, zwei Antworten")
