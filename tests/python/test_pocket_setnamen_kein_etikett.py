"""„New Set" ist kein Set-Name.

BEFUND (25.09.2026, an der Quellseite nachgesehen):

  game8.co/…/archives/482685 fuehrt die Kennung B4a an zwei Stellen —

      "Team Rocket's Ambition (B4a)   Release: August 26, 2026"
      "New Set (B4a)"                 (Banner in der Seitennavigation)

  Beide treffen das Muster "Name (Kennung)" in build_pocket_sets.lies().
  Welche zuerst kommt, entscheidet die Reihenfolge im Baum. Gewinnt das
  Banner, steht in der Oberflaeche "New Set" als Set-Name — und der
  Anlass fuer diese Datei war woertlich: „wenn ich weiß wie das set
  heißt kann ich noch schnell fehlende Karten besorgen".

  Dazu kommt: main() schrieb `sets` vollstaendig neu. Ein Name, den die
  Quellseite an einem Tag nicht fuehrt, war damit weg — samt der
  nachgeschlagenen Quelle.

Geprueft wird das VERHALTEN von lies() an echtem Seitenaufbau, nicht der
Wortlaut im Quelltext.
"""

import importlib.util
import json
import os
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
SKRIPT = os.path.join(WURZEL, "scripts", "build_pocket_sets.py")
DATEN = os.path.join(WURZEL, "data", "pocket_sets.json")


@pytest.fixture(scope="module")
def mod():
    pytest.importorskip("bs4")
    sys.path.insert(0, os.path.join(WURZEL, "scripts"))
    spec = importlib.util.spec_from_file_location("build_pocket_sets", SKRIPT)
    m = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(m)
    except Exception as e:  # scrape_pocket_tierlist braucht evtl. Pakete
        pytest.skip(f"Modul nicht ladbar: {e}")
    return m


# Aufbau woertlich wie auf der Quellseite am 25.09.2026 gemessen:
# das Banner steht VOR der Tabelle.
SEITE = """<html><body>
<ul class="nav"><li><a href="/x">New Set (B4a)</a></li></ul>
<table>
  <tr><td>Deluxe Pack Mega (B4b)</td><td>Release: September 29, 2026</td></tr>
  <tr><td>Team Rocket's Ambition (B4a)</td><td>Release: August 26, 2026</td></tr>
  <tr><td>Ruler of the Skies (B4)</td><td>Release: July 30, 2026</td></tr>
</table>
</body></html>"""


def test_das_banner_gewinnt_nicht(mod):
    namen = mod.lies(SEITE)
    assert namen.get("B4a") == "Team Rocket's Ambition", (
        f"B4a heisst {namen.get('B4a')!r} — das Navigationsbanner hat "
        f"den echten Namen ueberholt")


def test_kein_etikett_kommt_durch(mod):
    for etikett in ("New Set", "TBA", "Coming Soon", "Latest Set"):
        seite = f'<html><body><td>{etikett} (B9z)</td></body></html>'
        namen = mod.lies(seite)
        assert "B9z" not in namen, (
            f"{etikett!r} wurde als Set-Name uebernommen")


def test_echte_namen_kommen_weiter_durch(mod):
    """Gegenprobe: die Sperre darf nicht alles wegwerfen."""
    namen = mod.lies(SEITE)
    assert namen.get("B4b") == "Deluxe Pack Mega"
    assert namen.get("B4") == "Ruler of the Skies"
    assert len(namen) == 3, f"erwartet 3 Namen, bekommen {sorted(namen)}"


def test_bestand_geht_nicht_verloren(mod, tmp_path, monkeypatch):
    """Ein Name, den die Quelle heute nicht fuehrt, bleibt stehen."""
    ziel = tmp_path / "pocket_sets.json"
    ziel.write_text(json.dumps({"sets": {"A1": "Genetic Apex"}}), encoding="utf-8")
    monkeypatch.setattr(mod, "ZIEL", str(ziel))
    assert mod.bestand() == {"A1": "Genetic Apex"}


def test_b4b_steht_in_den_daten():
    """Gemessen am 25.09.2026 an der Quellseite."""
    with open(DATEN, encoding="utf-8") as f:
        d = json.load(f)
    assert d["sets"].get("B4b") == "Deluxe Pack Mega", (
        "B4b fehlt — die Kartenliste zeigt dafuer die blanke Kennung")
    assert d["sets"].get("B4a") == "Team Rocket's Ambition", (
        "B4a traegt nicht mehr seinen Namen")
    assert d["_meta"]["anzahl"] == len(d["sets"]), (
        "die Zahl im Kopf passt nicht zu den Zeilen")


def test_nachtrag_nennt_seinen_beleg():
    """Was von Hand hereinkam, sagt woher und warum."""
    with open(DATEN, encoding="utf-8") as f:
        d = json.load(f)
    nach = d["_meta"].get("nachgetragen") or []
    assert nach, "kein Nachtrag vermerkt, obwohl B4b von Hand kam"
    for e in nach:
        assert e.get("beleg"), f"{e.get('kennung')} ohne Beleg"
        assert e.get("warum_von_hand"), f"{e.get('kennung')} ohne Begruendung"
        assert e.get("am"), f"{e.get('kennung')} ohne Datum"
