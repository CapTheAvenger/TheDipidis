"""Eine leere `tournament_id` ist keine Kleinigkeit — sie kostet die Bilanz.

BEFUND (22.09.2026). Die Deploy-Kette von `main` stand, weil
tests/python/test_bilanz_je_zeile.py anschlug: 559 von 1.760 Decklisten
trugen 0-0-0. Bei einem Regional ist das unmoeglich — der Erste geht
nicht 0-0-0.

DIE URSACHE, gemessen:

  data/tournament_decklists_per_player.csv, Turnier 577
      tournament_name  "Regional Baltimore, MD - Limitless"
      tournament_date  2026-09-19
      tournament_id    ""            <- leer
      wins/losses/ties 0/0/0

  data/labs_tournament_decks.csv, Turnier 0072
      tournament_name  "Regional Championship Baltimore"
      tournament_date  2026-09-18
      total_players    3118

  data/player_continuity.csv, Turnier 0072
      3.122 Zeilen mit Bilanz, darunter alle 559 Plaetze der Listen.

Name UND Datum weichen ab, der Namensabgleich in
`_resolve_labs_tournament_id` kann das nicht ueberbruecken. Genau
dafuer gibt es data/labs_tournament_id_overrides.json — der Eintrag
fehlte. Ohne `tournament_id` findet `Kontinuitaetsbilanzen.finde` gar
nichts (sie verlangt Turnier UND Platz), und die Bilanzen blieben auf
0-0-0 stehen, obwohl sie die ganze Zeit danebenlagen.

ZWEI LUECKEN, ZWEI REPARATUREN:

  1. Der Override fehlte           -> nachgetragen, mit Begruendung.
  2. Der Bestand wurde nie wieder  -> `--turnier-id-nachtragen`, nach
     angeschaut, auch wenn spaeter    demselben Muster wie
     ein Override dazukommt          `--datum-nachtragen`: lesen, GENAU
                                      eine Spalte anfassen, Abdruck aller
                                      uebrigen Spalten vergleichen,
                                      atomar zurueckschreiben.

Diese Datei haelt beides fest.
"""

import csv
import importlib.util
import io
import json
import os
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
DATEN = os.path.join(WURZEL, "data")
QUELLE = os.path.join(WURZEL, "backend", "scrapers", "per_decklist_scraper.py")
OVERRIDES = os.path.join(DATEN, "labs_tournament_id_overrides.json")
ABLAUF = os.path.join(WURZEL, ".github", "workflows", "per-decklist-scrape.yml")

SPALTEN = ["tournament_id", "limitless_tournament_id", "tournament_name",
           "tournament_date", "place", "player_name", "card_name",
           "wins", "losses", "ties"]


@pytest.fixture(scope="module")
def pds():
    sys.path.insert(0, os.path.join(WURZEL, "backend", "core"))
    sys.path.insert(0, os.path.join(WURZEL, "backend", "scrapers"))
    spec = importlib.util.spec_from_file_location("pds_turnier_id_test", QUELLE)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def _schreibe(pfad, zeilen):
    with io.open(pfad, "w", encoding="utf-8", newline="") as f:
        s = csv.DictWriter(f, fieldnames=SPALTEN)
        s.writeheader()
        s.writerows(zeilen)


def _lies(pfad):
    with io.open(pfad, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def _zeile(**kw):
    z = {k: "" for k in SPALTEN}
    z.update(kw)
    return z


# ── Der Override selbst ──────────────────────────────────────────────

def test_baltimore_hat_einen_override_mit_begruendung():
    with io.open(OVERRIDES, encoding="utf-8") as f:
        d = json.load(f)
    e = d["overrides"].get("577")
    assert e, ("577 (Regional Baltimore) hat keinen Override mehr. Ohne ihn "
               "bleibt tournament_id leer und 559 Decklisten verlieren ihre "
               "Bilanz — das hat am 22.09.2026 den Deploy angehalten")
    assert e["labs_tournament_id"] == "0072"
    assert "0072" in e["reason"] or "Baltimore" in e["reason"], (
        "der Eintrag nennt seinen Grund nicht — dann steht da eine "
        "Entscheidung ohne das, worauf sie sich stuetzt")


def test_der_uebliche_weg_loest_577_wirklich_auf():
    """Nicht der Dateiinhalt, sondern die Funktion, die ihn benutzt.

    Eine Zusicherung auf die JSON-Datei allein bliebe gruen, wenn der
    Aufloeser sie eines Tages gar nicht mehr liest.
    """
    sys.path.insert(0, os.path.join(WURZEL, "backend", "core"))
    pfad = os.path.join(WURZEL, "backend", "scrapers", "tournament_scraper_JH.py")
    spec = importlib.util.spec_from_file_location("jh_turnier_id_test", pfad)
    jh = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(jh)
    assert jh._resolve_labs_tournament_id(
        "Regional Baltimore, MD – Limitless", "2026-09-19", "577") == "0072"


# ── Der Nachtrag ─────────────────────────────────────────────────────

def test_der_nachtrag_fuellt_nur_leere_zellen(pds, tmp_path):
    ziel = str(tmp_path / "bestand.csv")
    _schreibe(ziel, [
        _zeile(limitless_tournament_id="577", tournament_name="Regional Baltimore, MD – Limitless",
               tournament_date="2026-09-19", place="1", player_name="A", card_name="X"),
        _zeile(tournament_id="0071", limitless_tournament_id="515",
               tournament_name="World Championships 2026 – Limitless",
               tournament_date="2026-08-14", place="1", player_name="B", card_name="Y"),
    ])
    b = pds.turnier_id_nachtragen(ziel)
    assert b["geaendert"] == 1, b
    nach = _lies(ziel)
    assert nach[0]["tournament_id"] == "0072"
    assert nach[1]["tournament_id"] == "0071", (
        "eine bereits gefuellte Kennung wurde ueberschrieben — eine falsche "
        "Kennung zieht eine FREMDE Bilanz an und ist schlimmer als eine "
        "fehlende")


def test_ohne_treffer_bleibt_die_zelle_leer(pds, tmp_path):
    """Online-Turniere haben keine labs-Entsprechung. Geraten wird nicht."""
    ziel = str(tmp_path / "bestand.csv")
    _schreibe(ziel, [
        _zeile(limitless_tournament_id="6ab03b02e905c1db68746671",
               tournament_name="Pumpkaweekly", tournament_date="2026-09-21",
               place="3", player_name="C", card_name="Z"),
    ])
    b = pds.turnier_id_nachtragen(ziel)
    assert b["geaendert"] == 0
    assert _lies(ziel)[0]["tournament_id"] == ""
    assert b["ohne_treffer"], "ein Turnier ohne Treffer wird nicht einmal gemeldet"


def test_der_nachtrag_fasst_keine_andere_spalte_an(pds, tmp_path):
    ziel = str(tmp_path / "bestand.csv")
    vorher = [
        _zeile(limitless_tournament_id="577", tournament_name="Regional Baltimore, MD – Limitless",
               tournament_date="2026-09-19", place="7", player_name="Dylan Kasturi",
               card_name="Switch", wins="4", losses="1", ties="2"),
    ]
    _schreibe(ziel, vorher)
    pds.turnier_id_nachtragen(ziel)
    nach = _lies(ziel)[0]
    for k in SPALTEN:
        if k == "tournament_id":
            continue
        assert nach[k] == vorher[0][k], f"{k} wurde veraendert: {nach[k]!r}"


def test_der_probelauf_schreibt_nicht(pds, tmp_path):
    ziel = str(tmp_path / "bestand.csv")
    _schreibe(ziel, [
        _zeile(limitless_tournament_id="577", tournament_name="Regional Baltimore, MD – Limitless",
               tournament_date="2026-09-19", place="1", player_name="A", card_name="X"),
    ])
    b = pds.turnier_id_nachtragen(ziel, trocken=True)
    assert b["geaendert"] == 1
    assert b["geschrieben"] is False
    assert _lies(ziel)[0]["tournament_id"] == "", "der Probelauf hat geschrieben"


# ── Der Weg nach draussen ────────────────────────────────────────────

def test_der_ablauf_kann_den_nachtrag_ausloesen():
    """Sonst gibt es den Schalter, aber niemand kommt an ihn heran.

    Die Bestandsdatei ist 35 MB gross — ueber die Weboberflaeche laesst
    sie sich nicht ausliefern. Der Nachtrag MUSS also in CI laufen
    koennen, sonst ist er beim naechsten Mal genauso unerreichbar wie
    heute.
    """
    with io.open(ABLAUF, encoding="utf-8") as f:
        y = f.read()
    for schalter in ("turnier_id_nachtragen", "datum_nachtragen", "bilanzen_nachtragen"):
        assert schalter in y, (
            f"{os.path.basename(ABLAUF)} kennt den Eingang {schalter} nicht")
    for ruf in ("--turnier-id-nachtragen", "--datum-nachtragen", "--bilanzen-nachtragen"):
        assert ruf in y, f"{os.path.basename(ABLAUF)} ruft {ruf} nicht auf"


def test_der_schalter_steht_wirklich_im_scraper():
    with io.open(QUELLE, encoding="utf-8") as f:
        quelle = f.read()
    ohne = "\n".join(z for z in quelle.split("\n")
                     if not z.lstrip().startswith("#"))
    assert len(ohne) > len(quelle) * 0.3, "das Ausschneiden hat zu viel entfernt"
    assert "'--turnier-id-nachtragen'" in ohne
    assert "_lauf_turnier_id(" in ohne, (
        "der Schalter ist da, wird aber nicht aufgerufen")


# ── Das Tor vor dem Push ─────────────────────────────────────────────

WOCHENLAUF = os.path.join(WURZEL, ".github", "workflows", "weekly-full-update.yml")


def test_der_wochenlauf_prueft_bevor_er_pusht():
    """Ein Lauf veroeffentlicht nur, was seine Zusicherungen aushalten.

    BEFUND (22.09.2026): der Wochenlauf lief um 06:19 gruen durch und
    schob seine Daten nach `main`. Danach fiel der `test`-Job von
    deploy-pages.yml um, `build` und `deploy` wurden uebersprungen, und
    die Seite hing den ganzen Tag auf dem Vortag. Kaputt war nichts —
    drei Zusicherungen hatten Zahlen aus den Daten der Vorwoche
    festgenagelt.

    Der Wochenlauf hat seine eigene Ausgabe nie geprueft. Jetzt tut er
    es, und zwar VOR dem Push: sind die Suiten rot, bleibt `main` auf
    dem letzten guten Stand. Eine Seite mit Daten der Vorwoche ist
    immer besser als eine stehende Deploy-Kette.
    """
    with io.open(WOCHENLAUF, encoding="utf-8") as f:
        y = f.read()

    tor = y.find("Zusicherungen gegen die frischen Daten")
    commit = y.find("- name: Commit + push")
    assert tor > 0, "der Wochenlauf prueft seine eigene Ausgabe nicht mehr"
    assert commit > 0, "der Commit-Schritt heisst anders — dann greift diese Pruefung ins Leere"
    assert tor < commit, (
        "das Tor steht NACH dem Push. Dann ist es wirkungslos: die roten "
        "Daten sind dann schon auf main")

    block = y[tor:commit]
    assert "run-js-unit-tests.sh" in block and "pytest tests/python" in block, (
        "das Tor faehrt nicht beide Suiten — eine allein haette am "
        "22.09.2026 nur die Haelfte der Befunde gesehen")
    assert "exit 1" in block, (
        "das Tor meldet, blockiert aber nicht — dann ist es eine Notiz, "
        "keine Sicherung")
