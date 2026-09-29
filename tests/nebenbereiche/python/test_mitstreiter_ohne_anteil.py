"""Ein leeres Feld, das die Quelle nie fuellt, ist kein Loch im Abzug.

BEFUND (10.09.2026): `data/champions_usage.json` trug bei JEDER
Mitstreiterzeile `pct: null` — 3.768 von 3.768. Das sieht aus wie ein
Abzug, dem die Zahlen abhanden gekommen sind, und liess sich von einem
kaputten Abzug nicht unterscheiden.

GEGENGEMESSEN direkt an der Quelle am 10.09.2026, an vier Eintraegen
(Absol, Dragapult, Incineroar, Pelipper): 0 von 36 Mitstreiterzeilen
tragen einen Wert in der Spalte `percentage`, waehrend `held_item` in
DERSELBEN Datei "43.7%" traegt. Beispielzeile:

    Absol,180,teammate,1,Whimsicott,,,,,,,,,
    Absol,180,held_item,1,Absolite,43.7%,,,,,,,,

Die Quelle veroeffentlicht Mitstreiter also als RANGLISTE ohne Anteile.
Der Rang steht in der Spalte `rank` und ist echt.

DIE REGEL: kein `pct: null` bei Mitstreitern. Entweder die Quelle liefert
einen Anteil — dann steht er da —, oder sie liefert keinen, dann steht
das Feld nicht da und `_meta` sagt warum. So bleibt ein spaeteres
fehlendes `pct` bei Attacken oder Items weiterhin ein Alarmzeichen,
waehrend es hier eine Eigenschaft der Quelle ist.

Die Anzeige stimmte schon vorher: app-side-quest-usage.js und
app-side-quest-pokedex.js zeigen Sprite plus Rang und keinen Balken.
Repariert wird die Datenschicht, nicht die Oberflaeche.
"""

import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
DATEI = os.path.join(ROOT, "data", "champions_usage.json")
SCRAPER = os.path.join(ROOT, "scripts", "scrape_champions_usage.py")

with open(DATEI, encoding="utf-8") as f:
    DATEN = json.load(f)
with open(SCRAPER, encoding="utf-8") as f:
    QUELLTEXT = f.read()


def _mitstreiterlisten():
    for slug, eintrag in (DATEN.get("pokemon") or {}).items():
        for fmt in ("doubles", "singles"):
            block = eintrag.get(fmt)
            if isinstance(block, dict) and block.get("teammate"):
                yield slug, fmt, block["teammate"]


def test_die_datei_hat_ueberhaupt_mitstreiter():
    """Vorpruefung gegen ein leeres Bestehen: haette die Datei gar keine
    Mitstreiter, bestuende jede Zusicherung unten stillschweigend."""
    listen = list(_mitstreiterlisten())
    assert len(listen) > 100, (
        f"nur {len(listen)} Mitstreiterlisten in der Datei — dann prueft "
        f"der Rest dieser Datei nichts mehr"
    )
    assert sum(len(l) for _, _, l in listen) > 1000


def test_kein_mitstreiter_traegt_einen_leeren_anteil():
    leer = [f"{slug}/{fmt}[{i}] {e.get('name')!r}"
            for slug, fmt, liste in _mitstreiterlisten()
            for i, e in enumerate(liste)
            if "pct" in e and e["pct"] is None]
    assert not leer, (
        f"{len(leer)} Mitstreiter tragen `pct: null`. Die Quelle liefert "
        f"dort keinen Anteil — dann gehoert das Feld weg, nicht auf null. "
        f"Sonst ist eine Eigenschaft der Quelle von einem kaputten Abzug "
        f"nicht zu unterscheiden. Die ersten drei: {leer[:3]}"
    )


def test_ein_echter_anteil_wuerde_stehenbleiben():
    """Die Regel lautet NICHT `pct` ist bei Mitstreitern verboten. Faengt
    die Quelle an, Anteile zu liefern, sollen sie ankommen."""
    assert re.search(r"if pct is not None:\s*\n\s*eintrag\[.pct.\] = pct",
                     QUELLTEXT), (
        "der Scraper verwirft bei Mitstreitern jeden Anteil unbesehen — "
        "dann bemerkt niemand, wenn die Quelle anfaengt, welche zu liefern"
    )


def test_der_scraper_traegt_den_rang_ein():
    assert '"rang": rang_aus_zeile(' in QUELLTEXT, (
        "der Scraper schreibt den Rang nicht mehr — dann bleibt vom "
        "Mitstreitereintrag nur der Name uebrig"
    )
    assert "def rang_aus_zeile(" in QUELLTEXT
    assert 'zeile.get("rank")' in QUELLTEXT, (
        "der Rang wird aus der Listenposition geraten statt aus der "
        "Spalte `rank` der Quelle gelesen"
    )


def test_die_datei_sagt_selbst_warum_der_anteil_fehlt():
    meta = DATEN.get("_meta") or {}
    assert meta.get("teamkameraden_ohne_anteil") is True, (
        "_meta sagt nicht, dass die Quelle bei Mitstreitern keine Anteile "
        "liefert — dann muss ein spaeterer Leser es wieder herausfinden"
    )
    hinweis = meta.get("teamkameraden_hinweis") or ""
    assert "Rangliste" in hinweis and "rang" in hinweis, (
        f"der Hinweis erklaert die Form nicht: {hinweis!r}"
    )


def test_der_scraper_schreibt_denselben_hinweis():
    assert '"teamkameraden_ohne_anteil": True' in QUELLTEXT, (
        "der naechste Scraper-Lauf wuerde den Hinweis aus _meta wieder "
        "entfernen"
    )
