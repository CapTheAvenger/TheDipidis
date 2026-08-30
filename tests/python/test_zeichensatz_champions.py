# -*- coding: utf-8 -*-
"""Falsche Buchstaben, die niemand gemeldet hat.

BEFUND (30.08.2026)
-------------------
In data/champions_replica_teams.json stand zweimal

    "Sidi I. Haidala's PokÃ©ChampionsDestiny Top 4 Team"

und in data/champions_team_strategies.json einmal

    "punihina1334's Extreme Speed PokÃ©mon Champions #5 Champion Team"

Drei Stellen, alle in der Oberflaeche sichtbar, keine davon gemeldet.

URSACHE: `requests` faellt fuer `resp.text` auf ISO-8859-1 zurueck, wenn
der Content-Type-Kopf keinen charset nennt — so schreibt es RFC 2616
vor. Der CSV-Export von Google Sheets nennt keinen. Die UTF-8-Bytes von
"é" (0xC3 0xA9) wurden also als zwei Latin-1-Zeichen gelesen: "Ã©".
Kein Absturz, keine Warnung, nur falsche Buchstaben — die stille Sorte
Fehler, die dieses Projekt schon oefter erwischt hat.

BEHOBEN an drei Stellen im Scraper (der Kopf sagt nichts, also sagen wir
es) und im Bestand. Die Reparatur raet nicht:
`text.encode('latin-1').decode('utf-8')` ist die EXAKTE Umkehrung des
Fehllesens. Geht sie nicht auf, bleibt der Text unangetastet.
"""

import json
import os
import re
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
DATEN = os.path.join(WURZEL, "data")
SCRAPER = os.path.join(WURZEL, "backend", "scrapers", "champions_replica_scraper.py")

# Der Scraper zieht beim Import Netzabhaengigkeiten nach; die beiden
# reinen Funktionen werden deshalb aus der Quelle heraus ausgefuehrt.
_quelle = open(SCRAPER, encoding="utf-8").read()
_von = _quelle.index("_MOJIBAKE = re.compile")
_bis = _quelle.index("\n\n", _quelle.index("return wert"))
_ns = {"re": re}
exec(compile(_quelle[_von:_bis], SCRAPER, "exec"), _ns)
entwirre = _ns["entwirre"]
entwirre_tief = _ns["entwirre_tief"]

MOJIBAKE = _ns["_MOJIBAKE"]   # dieselbe Erkennung wie der Scraper


# ── Die Umkehrung ────────────────────────────────────────────────────

@pytest.mark.parametrize("kaputt,heil", [
    ("PokÃ©ChampionsDestiny", "PokéChampionsDestiny"),
    ("PokÃ©mon Champions", "Pokémon Champions"),
    ("Ã¤Ã¶Ã¼", "äöü"),
    ("StraÃŸe", "Straße"),
    ("Cafâ€™", "Caf’"),
])
def test_fehllesen_wird_zurueckgedreht(kaputt, heil):
    assert entwirre(kaputt) == heil


@pytest.mark.parametrize("text", [
    "Pokémon",                 # schon richtig
    "normaler Text",
    "Straße",
    "Sidi I. Haidala",
    "",
    "100 % Ã",                 # einzelnes Ã ohne Folgebyte: kein Fehllesen
])
def test_heiler_text_bleibt_unangetastet(text):
    assert entwirre(text) == text


def test_nichttext_bleibt_nichttext():
    assert entwirre(None) is None
    assert entwirre(42) == 42
    assert entwirre(["PokÃ©mon"]) == ["PokÃ©mon"], "entwirre() geht nicht in Listen"


def test_tief_geht_durch_listen_und_woerterbuecher():
    ein = {"a": "PokÃ©mon", "b": [{"c": "PokÃ©ChampionsDestiny"}], "d": 7, "e": None}
    aus = entwirre_tief(ein)
    assert aus == {"a": "Pokémon", "b": [{"c": "PokéChampionsDestiny"}], "d": 7, "e": None}


def test_die_umkehrung_ist_wirklich_die_umkehrung():
    """Gegenprobe ueber den ganzen Weg: richtig -> falsch gelesen -> zurueck."""
    for original in ("Pokémon", "PokéChampionsDestiny", "Grüße", "Straße", "Café"):
        fehlgelesen = original.encode("utf-8").decode("latin-1")
        assert fehlgelesen != original, f"{original} liest sich in Latin-1 gleich"
        assert entwirre(fehlgelesen) == original


def test_doppeltes_anwenden_aendert_nichts():
    einmal = entwirre("PokÃ©mon")
    assert entwirre(einmal) == einmal


def test_zweimal_fehlgelesen_wird_auch_zweimal_zurueckgedreht():
    """Ein Text kann durch zwei Haende gegangen sein — einmal beim
    Abruf, einmal beim Weiterreichen. Nach einer Umkehrung steht dann
    immer noch ein Doppelzeichen da."""
    zweimal = "Pokémon".encode("utf-8").decode("latin-1").encode("utf-8").decode("latin-1")
    assert zweimal != "Pokémon"
    assert entwirre(zweimal) == "Pokémon"


def test_ein_anfangszeichen_ohne_gueltige_folge_bleibt_stehen():
    """0xC3 gefolgt von einem Leerzeichen ist kein UTF-8 — die Umkehrung
    geht nicht auf, also wird nichts behauptet."""
    roh = "100 % \u00c3\u00a9nde und \u00c3 mitten drin"
    # Der zweite Teil macht die Bytes als Ganzes ungueltig.
    kaputt = "\u00c3\u0020"
    assert entwirre(kaputt) == kaputt


def test_ohne_umkehrung_wird_nichts_zurueckgegeben():
    """Sicherung gegen die Version, die einfach immer umwandelt: ein
    Text, der zwar ein Anfangszeichen traegt, dessen Bytes aber kein
    gueltiges UTF-8 ergeben, muss unveraendert bleiben."""
    for kaputt in ("\u00c3\u0020x", "Test \u00c2 Ende", "\u00e2\u0020\u0020"):
        assert entwirre(kaputt) == kaputt, repr(kaputt)


# ── Der Scraper ──────────────────────────────────────────────────────

def test_scraper_liest_nicht_mehr_ueber_resp_text():
    """Jede Stelle, die ueber requests einliest, muss den Zeichensatz
    setzen — sonst kommt der Latin-1-Rueckfall zurueck."""
    ohne_kommentare = "\n".join(
        z for z in _quelle.split("\n") if not z.lstrip().startswith("#"))
    # resp.text darf nur noch in _text_utf8 selbst und in der
    # Leerpruefung davor vorkommen.
    stellen = [z.strip() for z in ohne_kommentare.split("\n")
               if re.search(r"\bresp\.text\b", z)]
    erlaubt = [z for z in stellen
               if "return resp.text" in z or "resp.text.strip()" in z
               or z.startswith('"""')]      # die Erklaerung in _text_utf8 selbst
    rest = [z for z in stellen if z not in erlaubt]
    assert not rest, "resp.text ohne Zeichensatz: %s" % rest
    assert "_text_utf8(resp)" in ohne_kommentare


def test_der_zeichensatz_wird_nur_gesetzt_wenn_der_kopf_schweigt():
    assert "if 'charset=' not in kopf:" in _quelle, (
        "_text_utf8 ueberschreibt den Zeichensatz jetzt immer — damit "
        "waere eine Quelle, die ehrlich Latin-1 meldet, kaputt")


def test_vor_dem_schreiben_wird_entwirrt():
    assert "output = entwirre_tief(output)" in _quelle, (
        "was aus einem frueheren Lauf im Zwischenspeicher liegt, bliebe "
        "kaputt")


# ── Der Bestand ──────────────────────────────────────────────────────

@pytest.mark.parametrize("datei", [
    "champions_replica_teams.json",
    "champions_team_strategies.json",
    "champions_pokedex.json",
    "champions_usage.json",
])
def test_keine_falschen_buchstaben_im_bestand(datei):
    pfad = os.path.join(DATEN, datei)
    if not os.path.exists(pfad):
        pytest.skip("%s liegt nicht im Repo" % datei)
    text = open(pfad, encoding="utf-8").read()
    treffer = MOJIBAKE.findall(text)
    beispiele = []
    for m in list(MOJIBAKE.finditer(text))[:3]:
        beispiele.append(text[max(0, m.start() - 30):m.start() + 15])
    assert not treffer, "%d falsche Buchstaben in %s: %s" % (
        len(treffer), datei, beispiele)


def test_der_sucher_findet_ueberhaupt_etwas():
    """Faende MOJIBAKE nichts mehr, waere der Test oben wertlos."""
    assert MOJIBAKE.search("PokÃ©mon")
    assert not MOJIBAKE.search("Pokémon")
