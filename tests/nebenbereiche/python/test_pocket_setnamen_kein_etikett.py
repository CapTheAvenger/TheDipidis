"""„New Set" ist kein Set-Name — und ein Name geht nicht verloren.

BEFUND (25.09.2026, damals an Game8s Seite): ein Navigationsbanner
"New Set (B4a)" traf dasselbe Muster wie der echte Name "Team Rocket's
Ambition (B4a)". Gewann das Banner, stand in der Oberflaeche "New Set"
als Set-Name — und der Anlass fuer die Namen war woertlich: „wenn ich
weiß wie das set heißt kann ich noch schnell fehlende Karten besorgen".

Seit 29.09.2026 kommen die Namen aus der Kartendatenbank
(flibustier/pokemon-tcg-pocket-database, dist/sets.json), weil Game8 den
GitHub-Laeufer abweist und die Pocket-Daten jetzt taeglich aus CI kommen.
Die Sperre gegen Etiketten bleibt, ebenso der Bestand: ein Name, den die
Quelle an einem Tag nicht fuehrt, bleibt stehen.

Geprueft wird das VERHALTEN von lies() und main(), nicht der Wortlaut.
"""

import importlib.util
import json
import os
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", "..", ".."))
SKRIPT = os.path.join(WURZEL, "scripts", "build_pocket_sets.py")
DATEN = os.path.join(WURZEL, "data", "pocket_sets.json")


@pytest.fixture(scope="module")
def mod():
    sys.path.insert(0, os.path.join(WURZEL, "scripts"))
    spec = importlib.util.spec_from_file_location("build_pocket_sets", SKRIPT)
    m = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(m)
    except Exception as e:  # noqa: BLE001
        pytest.skip(f"Modul nicht ladbar: {e}")
    return m


# Aufbau wie dist/sets.json der Datenbank (gemessen 29.09.2026): Gruppen
# je Buchstabe, darin code, releaseDate und name je Sprache. TESTDATEN.
SEITE = json.dumps({
    "A": [{"code": "PROMO-A", "releaseDate": "2024-10-30", "name": {"en": "Promo A"}}],
    "B": [{"code": "B4b", "releaseDate": "2026-09-29", "name": {"en": "Deluxe Pack Mega"}},
          {"code": "B4a", "releaseDate": "2026-08-27", "name": {"en": "Team Rocket’s Ambition"}},
          {"code": "B4", "releaseDate": "2026-07-30", "name": {"en": "Ruler of the Skies"}}],
})


def test_der_name_kommt_in_unserer_schreibweise(mod):
    namen = mod.lies(SEITE)
    assert namen.get("B4a") == "Team Rocket's Ambition", (
        f"B4a heisst {namen.get('B4a')!r} — der typografische Apostroph der "
        f"Quelle steht nicht in unserer Schreibweise")
    assert namen.get("P-A") == "Promo A", "PROMO-A wurde nicht zu P-A"


def test_kein_etikett_kommt_durch(mod):
    for etikett in ("New Set", "TBA", "Coming Soon", "Latest Set"):
        seite = json.dumps({"B": [{"code": "B9z", "name": {"en": etikett}}]})
        namen = mod.lies(seite)
        assert "B9z" not in namen, (
            f"{etikett!r} wurde als Set-Name uebernommen")


def test_echte_namen_kommen_weiter_durch(mod):
    """Gegenprobe: die Sperre darf nicht alles wegwerfen."""
    namen = mod.lies(SEITE)
    assert namen.get("B4b") == "Deluxe Pack Mega"
    assert namen.get("B4") == "Ruler of the Skies"
    assert len(namen) == 4, f"erwartet 4 Namen, bekommen {sorted(namen)}"


def test_bestand_geht_nicht_verloren(mod, tmp_path, monkeypatch):
    """Ein Name, den die Quelle heute nicht fuehrt, bleibt stehen."""
    ziel = tmp_path / "pocket_sets.json"
    ziel.write_text(json.dumps({"sets": {"A1": "Genetic Apex"}}), encoding="utf-8")
    monkeypatch.setattr(mod, "ZIEL", str(ziel))
    assert mod.bestand() == {"A1": "Genetic Apex"}


def test_b4b_steht_in_den_daten(mod):
    """B4b traegt einen echten Namen — nicht die blanke Kennung, kein Etikett.

    Bis 30.09.2026 stand hier der Wortlaut "Deluxe Pack Mega" (Game8,
    25.09.). Am 30.09. fuehrte die Kartendatenbank B4b selbst, als
    "Deluxe Pack: Mega", und Pocket #10 wurde am Tor rot, obwohl der Lauf
    genau das tat, was er soll: den Namen der Quelle uebernehmen. Die
    Zusicherung prueft jetzt ihren Zweck, nicht die Schreibweise eines Tages.
    """
    with open(DATEN, encoding="utf-8") as f:
        d = json.load(f)
    name = str(d["sets"].get("B4b") or "").strip()
    assert name and name != "B4b", (
        "B4b fehlt — die Kartenliste zeigt dafuer die blanke Kennung")
    assert name.lower() not in mod.PLATZHALTER, f"B4b traegt das Etikett {name!r}"
    klein = name.lower()
    assert "deluxe" in klein and "mega" in klein, (
        f"B4b heisst {name!r} — das ist nicht das Deluxe Pack Mega")
    assert d["sets"].get("B4a") == "Team Rocket's Ambition", (
        "B4a traegt nicht mehr seinen Namen")
    assert d["_meta"]["anzahl"] == len(d["sets"]), (
        "die Zahl im Kopf passt nicht zu den Zeilen")


def test_nachtrag_nennt_seinen_beleg():
    """Was von Hand hereinkam, sagt woher und warum."""
    with open(DATEN, encoding="utf-8") as f:
        d = json.load(f)
    # Hier stand bis 26.09.2026 zusaetzlich `assert nach` ("B4b kam von
    # Hand"). Das war eine Aussage ueber den Stand eines Tages: sobald die
    # Quelle B4b selbst fuehrt, ist der Nachtrag bestaetigt und wandert
    # nach `nachtrag_bestaetigt` (SC-4). Die Zusicherung haette den
    # ersten Erntelauf rot gemacht. Geprueft wird jetzt die Regel: jeder
    # Nachtrag — offen oder bestaetigt — nennt Herkunft und Datum.
    nach = d["_meta"].get("nachgetragen") or []
    for e in d["_meta"].get("nachtrag_bestaetigt") or []:
        assert e.get("kennung") and e.get("name"), f"bestaetigter Nachtrag ohne Namen: {e}"
    for e in nach:
        assert e.get("beleg"), f"{e.get('kennung')} ohne Beleg"
        assert e.get("warum_von_hand"), f"{e.get('kennung')} ohne Begruendung"
        assert e.get("am"), f"{e.get('kennung')} ohne Datum"


def test_ein_nachtrag_bleibt_bis_die_quelle_ihn_selbst_fuehrt(mod):
    """SC-4: der Nachweis eines Nachtrags geht nicht mit dem naechsten Lauf verloren."""
    nachtrag = {"kennung": "B4b", "name": "Deluxe Pack Mega", "am": "2026-09-25",
                "beleg": "Quellseite", "warum_von_hand": "Laeufer bekam 202"}
    bleibt, bestaetigt = mod.nachtraege_fortschreiben([nachtrag], {"B4a": "x"})
    assert bleibt == [nachtrag] and bestaetigt == [], "Nachtrag verschwand, obwohl die Quelle B4b nicht fuehrt"
    bleibt, bestaetigt = mod.nachtraege_fortschreiben([nachtrag], {"B4b": "Deluxe Pack Mega"})
    assert bleibt == [], "bestaetigter Nachtrag steht weiter als offen da"
    assert bestaetigt == [{"kennung": "B4b", "name": "Deluxe Pack Mega",
                           "nachgetragen_am": "2026-09-25"}]


def test_main_schreibt_die_nachtraege_mit(mod, tmp_path, monkeypatch):
    """Verhalten, nicht Schreibweise: main() laeuft gegen eine gebaute Quelle."""
    ziel = tmp_path / "pocket_sets.json"
    ziel.write_text(json.dumps({"_meta": {"nachgetragen": [
        {"kennung": "B9x", "name": "Kommt noch", "am": "2026-09-25",
         "beleg": "Quellseite", "warum_von_hand": "202"},
        {"kennung": "B4b", "name": "Deluxe Pack Mega", "am": "2026-09-25",
         "beleg": "Quellseite", "warum_von_hand": "202"}]},
        "sets": {"B9x": "Kommt noch"}}), encoding="utf-8")
    monkeypatch.setattr(mod, "ZIEL", str(ziel))
    monkeypatch.setattr(mod, "hole", lambda url: SEITE)
    monkeypatch.setattr(mod, "MINDESTENS", 1)
    monkeypatch.setattr(mod, "gebrauchte_kennungen", lambda: set())
    assert mod.main() == 0
    d = json.loads(ziel.read_text(encoding="utf-8"))
    assert [e["kennung"] for e in d["_meta"]["nachgetragen"]] == ["B9x"]
    assert [e["kennung"] for e in d["_meta"]["nachtrag_bestaetigt"]] == ["B4b"]
    assert d["sets"]["B9x"] == "Kommt noch"


def test_eine_bestaetigung_ueberlebt_den_naechsten_lauf(mod, tmp_path, monkeypatch):
    """Rutsch 12: der zweite Lauf nach der Bestaetigung warf sie weg."""
    ziel = tmp_path / "pocket_sets.json"
    ziel.write_text(json.dumps({"_meta": {"nachgetragen": [],
        "nachtrag_bestaetigt": [{"kennung": "B4b", "name": "Deluxe Pack Mega",
                                 "nachgetragen_am": "2026-09-25"}]},
        "sets": {"B4b": "Deluxe Pack Mega"}}), encoding="utf-8")
    monkeypatch.setattr(mod, "ZIEL", str(ziel))
    monkeypatch.setattr(mod, "hole", lambda url: SEITE)
    monkeypatch.setattr(mod, "MINDESTENS", 1)
    monkeypatch.setattr(mod, "gebrauchte_kennungen", lambda: set())
    for _ in range(2):
        assert mod.main() == 0
        d = json.loads(ziel.read_text(encoding="utf-8"))
        assert d["_meta"]["nachtrag_bestaetigt"] == [
            {"kennung": "B4b", "name": "Deluxe Pack Mega", "nachgetragen_am": "2026-09-25"}], (
            "die Bestaetigung eines Nachtrags ging mit dem naechsten Lauf verloren")
