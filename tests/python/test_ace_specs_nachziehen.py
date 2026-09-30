"""scripts/ace_specs_nachziehen.py — neue ACE SPECs werden erkannt (DA-22).

Hausi, 30.09.2026: „Falls irgendwann mal neue ACE SPECs kommen, dann
muessen die ja korrekt erkannt werden."

Die Seiten sind im Aufbau der Quelle nachgestellt, wie er am 30.09.2026 im
Browser gemessen wurde (limitlesstcg.com/cards?q=is:ace&display=list):
<tr> mit <td>Set</td><td>Nummer</td><td>Name</td><td>Typ</td>…, die
Kopfzeile mit <th>, 50 Zeilen je Seite, eine leere Seite beendet die Liste.
Der Sandkasten erreicht die Quelle nicht; das Abrufen wird deshalb durch
eine Attrappe ersetzt, alles andere laeuft echt — auch das Schreiben der
Datei (in einen Wegwerf-Ordner).
"""
import importlib.util
import json
import os

import pytest

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SKRIPT = os.path.join(WURZEL, "scripts", "ace_specs_nachziehen.py")


@pytest.fixture()
def m():
    spec = importlib.util.spec_from_file_location("ace_nachziehen", SKRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _zeile(s, n, name, typ="Item"):
    return ('<tr data-hover="URL"> <td><span class="card-set" data-tooltip="X">'
            '<img class="set" alt="%s" src="URL" loading="lazy">%s</span></td> '
            '<td><a href="/cards/%s/%s">%s</a></td> <td><a href="/cards/%s/%s">%s</a></td> '
            '<td class="md-only"> <a href="/cards/%s/%s"> %s </a></td> '
            '<td class="md-only"><a href="/cards/%s/%s"> Ultra Rare </a></td></tr>'
            % (s, s, s, n, n, s, n, name, s, n, typ, s, n))


def _seite(zeilen):
    return ('<html><body><table><tr><th>Set</th><th>No.</th><th>Name</th></tr>%s</table></body></html>'
            % "".join(_zeile(*z) for z in zeilen))


BEKANNT = [("PRE", "116", "Max Rod"), ("TEF", "153", "Master Ball"), ("TWM", "165", "Unfair Stamp"),
           ("SSP", "185", "Precious Trolley"), ("TEF", "157", "Prime Catcher"), ("PRE", "119", "Prime Catcher")]


def _alt(namen=("max rod", "master ball", "unfair stamp", "precious trolley", "prime catcher")):
    return {"timestamp": "2026-02-18T11:58:18", "source": "x", "total_count": len(namen),
            "ace_specs": sorted(namen), "_hinweis": "Die Liste wird von Hand gepflegt.",
            "_geprueft": {"2026-09-22": "von Hand"}}


def _abruf(en_seiten, jp_seiten):
    """Attrappe: Seite N der EN- bzw. JP-Suche, danach leer."""
    aufrufe = []

    def abruf(url):
        aufrufe.append(url)
        seiten = jp_seiten if "/cards/jp" in url else en_seiten
        nr = int(url.split("&page=")[1]) if "&page=" in url else 1
        if seiten is None:
            return ""
        return _seite(seiten[nr - 1]) if nr <= len(seiten) else _seite([])
    abruf.aufrufe = aufrufe
    return abruf


# ── Lesen der Seite ────────────────────────────────────────────────

def test_die_zeilen_der_seite_werden_gelesen(m):
    z = m.zeilen_der_seite(_seite([("PRE", "116", "Max Rod"), ("SFA", "62", "Poké Vital A")]))
    assert z == [("PRE", "116", "Max Rod"), ("SFA", "62", "Poké Vital A")]


def test_alle_seiten_bis_zur_leeren(m):
    ab = _abruf([BEKANNT[:3], BEKANNT[3:]], [])
    z = m.alle_seiten(m.QUELLE_EN, ab)
    assert len(z) == 6 and any("page=3" in u for u in ab.aufrufe)


def test_erste_seite_fehlt_heisst_nicht_erreicht(m):
    assert m.alle_seiten(m.QUELLE_EN, _abruf(None, None)) is None


# ── Die Rechnung ──────────────────────────────────────────────────

def test_eine_neue_en_ace_spec_wird_aufgenommen(m):
    en = BEKANNT + [("M9", "150", "Brand New Gadget")]
    neu, meld = m.rechne(_alt(), en, [], {}, {})
    assert "brand new gadget" in neu["ace_specs"]
    assert neu["total_count"] == 6 and neu["timestamp"] != "2026-02-18T11:58:18"
    assert any("::notice::" in x and "brand new gadget" in x for x in meld), meld
    assert "M9-150" in neu["drucke"]["en"]
    assert neu["_geprueft"]["fehlend"] == 0 and neu["_geprueft"]["liste_namen"] == 6
    assert "scripts/ace_specs_nachziehen.py" in neu["_hinweis"]


def test_eine_jp_ace_spec_kommt_ueber_set_und_nummer_aus_unserer_datenbank(m):
    """Der Name kommt aus data/japanese_cards_database.csv (so steht die
    Karte in den City-League-Daten), NICHT aus der Quellseite."""
    jp = [("M7", "65", "スペシャルなにか"), ("SV8a", "142", "つりざおMAX")]
    jp_db = {"M7-65": "Special Gizmo"}
    neu, meld = m.rechne(_alt(), BEKANNT, jp, jp_db, {})
    assert "special gizmo" in neu["ace_specs"]
    assert not any("スペシャル" in n for n in neu["ace_specs"])
    assert neu["_geprueft"]["nur_aus_jp"] == ["special gizmo"]
    assert "M7-65" in neu["drucke"]["jp"] and "SV8A-142" in neu["drucke"]["jp"]


def test_jp_name_einer_gewoehnlichen_en_karte_wird_nicht_aufgenommen(m):
    jp_db = {"M7-65": "Switch"}
    en_db = {"SVI-194": "Switch", "PRE-116": "Max Rod"}
    neu, meld = m.rechne(_alt(), BEKANNT, [("M7", "65", "x")], jp_db, en_db)
    assert "switch" not in neu["ace_specs"]
    assert any("NICHT aufgenommen" in x and "Switch" in x for x in meld), meld


def test_fehlender_jp_druck_eines_gefuehrten_sets_wird_gemeldet(m):
    jp_db = {"M7-1": "Irgendwas"}
    _, meld = m.rechne(_alt(), BEKANNT, [("M7", "65", "x"), ("BW7", "68", "y")], jp_db, {})
    w = [x for x in meld if "fehlen in" in x]
    assert w and "M7-65" in w[0] and "BW7-68" not in w[0], meld


def test_es_wird_nie_ein_name_entfernt(m):
    zehn = ["karte %d" % i for i in range(10)]
    alt = _alt(tuple(zehn) + ("alte karte",))
    neu, meld = m.rechne(alt, [("S", str(i), n) for i, n in enumerate(zehn)], [], {}, {})
    assert "alte karte" in neu["ace_specs"]
    assert neu["_geprueft"]["ueberzaehlig"] == 1
    assert any("alte karte" in x for x in meld)


def test_nichts_neu_heisst_nichts_schreiben(m):
    neu1, _ = m.rechne(_alt(), BEKANNT, [], {}, {})
    neu2, meld = m.rechne(neu1, BEKANNT, [], {}, {})
    assert neu2 is None and any("nichts neu" in x for x in meld), meld


def test_unerreichbare_quelle_schreibt_nichts(m):
    neu, meld = m.rechne(_alt(), None, None, {}, {})
    assert neu is None and "::warning::" in meld[0]


def test_eine_fremde_seite_erzeugt_keine_liste(m):
    """Liefert die Quelle Namen, die nicht wie die Liste aussehen
    (Seitenaufbau geaendert, Fehlerseite mit Tabelle), wird nichts
    geschrieben — sonst stuende Unsinn als ACE SPEC im Deckbau."""
    muell = [("A", "1", "Impressum"), ("B", "2", "Datenschutz"), ("C", "3", "Max Rod")]
    neu, meld = m.rechne(_alt(), muell, [], {}, {})
    assert neu is None and "Seitenaufbau" in meld[0], meld


def test_jp_nicht_erreicht_behaelt_die_alten_jp_drucke(m):
    alt = _alt()
    alt["drucke"] = {"en": [], "jp": ["MC-633"]}
    neu, meld = m.rechne(alt, BEKANNT, None, {}, {})
    assert neu["drucke"]["jp"] == ["MC-633"]
    assert any("JP-Liste" in x for x in meld)


# ── Ganz durch, mit Datei ────────────────────────────────────────────

def test_main_schreibt_die_datei_und_bleibt_beim_zweiten_lauf_still(m, tmp_path, capsys):
    liste = tmp_path / "ace_specs.json"
    liste.write_text(json.dumps(_alt(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    m.LISTE, m.JP_DB, m.EN_DB = str(liste), str(tmp_path / "fehlt.csv"), str(tmp_path / "fehlt2.csv")
    ab = _abruf([BEKANNT + [("M9", "150", "Brand New Gadget")]], [[("MC", "633", "x")]])
    assert m.main([], abruf=ab) == 0
    d = json.loads(liste.read_text(encoding="utf-8"))
    assert "brand new gadget" in d["ace_specs"] and d["total_count"] == 6
    vorher = liste.read_bytes()
    assert m.main([], abruf=ab) == 0
    assert liste.read_bytes() == vorher
    assert "nichts neu" in capsys.readouterr().out


def test_trocken_schreibt_nichts(m, tmp_path):
    liste = tmp_path / "ace_specs.json"
    liste.write_text(json.dumps(_alt()), encoding="utf-8")
    vorher = liste.read_bytes()
    m.LISTE, m.JP_DB, m.EN_DB = str(liste), str(tmp_path / "a"), str(tmp_path / "b")
    assert m.main(["--trocken"], abruf=_abruf([BEKANNT + [("M9", "1", "Neu")]], [])) == 0
    assert liste.read_bytes() == vorher


def test_die_echte_liste_bleibt_mit_der_quelle_vom_30_09_unveraendert(m):
    """Am echten Bestand: mit den 46 EN-Drucken vom 30.09.2026 kommt kein
    neuer Name dazu — die 39 bekannten sind vollstaendig."""
    with open(os.path.join(WURZEL, "data", "ace_specs.json"), encoding="utf-8") as f:
        alt = json.load(f)
    en = [("X", str(i), n) for i, n in enumerate(alt["ace_specs"])]
    neu, _ = m.rechne(alt, en, [], m.lies_db(m.JP_DB, "name"), m.lies_db(m.EN_DB, "name_en"))
    namen = neu["ace_specs"] if neu else alt["ace_specs"]
    assert sorted(namen) == sorted(alt["ace_specs"])
