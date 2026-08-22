"""Aus einer leeren Eingangsdatei darf keine Kartendatenbank entstehen.

BEFUND (S8, Rest): prepare_card_data.create_merged_database() liest
all_cards_database.csv und japanese_cards_database.csv ueber load_csv.
load_csv gibt fuer eine FEHLENDE Datei dieselbe leere Liste zurueck wie
fuer eine leere — beide Faelle liefen stumm durch.

Das Ergebnis waere kein Absturz, sondern das Schlimmere: eine
syntaktisch tadellose all_cards_merged.json, der eine ganze
Sprachhaelfte fehlt. Der Lauf meldet Erfolg, die Chunks werden neu
geschrieben, und die japanischen Karten sind aus der Oberflaeche
verschwunden.

Dass das kein Gedankenspiel ist, zeigt der 21.08.2026: die
japanische Datenbank stand bei 772 Zeilen und genau einem regulaeren
Set, weil der Schreibweg ersetzte statt zusammenzulegen.

Derselbe Fehler wie bei build_threat_intel (S3): ein Teilergebnis wird
wie ein vollstaendiges behandelt.
"""

import importlib.util
import os
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
QUELLE = os.path.join(WURZEL, "backend", "core", "prepare_card_data.py")

KOPF = "set,number,name_en,name_de\n"
ZEILE = "SVI,001,Sprigatito,Felori\n"
JP_ZEILE = "M6,001,Pikachu,Pikachu\n"


@pytest.fixture()
def modul():
    sys.path.insert(0, os.path.join(WURZEL, "backend", "core"))
    spec = importlib.util.spec_from_file_location("pcd_test", QUELLE)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def _datenordner(tmp_path, en: str, jp: str):
    """Legt einen Datenordner an. en/jp: 'voll', 'leer' oder 'fehlt'."""
    d = tmp_path / "data"
    d.mkdir()
    for name, zustand, zeile in (
        ("all_cards_database.csv", en, ZEILE),
        ("japanese_cards_database.csv", jp, JP_ZEILE),
    ):
        if zustand == "fehlt":
            continue
        inhalt = KOPF + (zeile if zustand == "voll" else "")
        (d / name).write_text(inhalt, encoding="utf-8")
    return d


@pytest.mark.parametrize("en,jp,erwartet", [
    ("voll", "leer",  "japanese_cards_database.csv"),
    ("voll", "fehlt", "japanese_cards_database.csv"),
    ("leer", "voll",  "all_cards_database.csv"),
    ("fehlt", "voll", "all_cards_database.csv"),
])
def test_leere_haelfte_bricht_ab(modul, tmp_path, monkeypatch, en, jp, erwartet):
    d = _datenordner(tmp_path, en, jp)
    monkeypatch.setattr(modul, "get_data_dir", lambda: str(d))
    monkeypatch.setattr(modul, "get_app_path", lambda: str(tmp_path / "app" / "x"))

    with pytest.raises(RuntimeError) as fehler:
        modul.create_merged_database()

    text = str(fehler.value)
    assert erwartet in text, f"die Meldung muss sagen, welche Datei fehlt: {text}"
    assert "NICHT geschrieben" in text, (
        "die Meldung muss sagen, dass nichts geschrieben wurde — sonst "
        "sucht der Operator nach einer halben Datei")


def test_fehlend_und_leer_werden_unterschieden(modul, tmp_path, monkeypatch):
    """Beides ist ein Abbruch, aber die Ursache ist eine andere: eine
    fehlende Datei ist ein Pfad- oder Sync-Problem, eine leere ein
    Scraper-Problem. Wer das verwechselt, sucht am falschen Ende."""
    def _melde(en, jp):
        d = _datenordner(tmp_path / en / jp, en, jp)
        monkeypatch.setattr(modul, "get_data_dir", lambda: str(d))
        monkeypatch.setattr(modul, "get_app_path",
                            lambda: str(tmp_path / "app" / "x"))
        with pytest.raises(RuntimeError) as f:
            modul.create_merged_database()
        return str(f.value)

    (tmp_path / "voll").mkdir()
    (tmp_path / "voll" / "fehlt").mkdir()
    (tmp_path / "voll" / "leer").mkdir()

    assert "existiert nicht" in _melde("voll", "fehlt")
    assert "keine verwertbare Zeile" in _melde("voll", "leer")


def test_beide_gefuellt_laeuft_weiter(modul, tmp_path, monkeypatch):
    """Gegenprobe: der Riegel darf den Normalfall nicht blockieren. Ohne
    diese Haelfte waere ein Riegel, der immer zuschlaegt, ein bestandener
    Test.

    Statt den ganzen Lauf durchzuspielen (dem Testordner fehlen Preise
    und Pokedex) wird der naechste Schritt nach dem Riegel durch eine
    Marke ersetzt: kommt sie an, ist der Riegel passiert."""
    d = _datenordner(tmp_path, "voll", "voll")
    monkeypatch.setattr(modul, "get_data_dir", lambda: str(d))
    monkeypatch.setattr(modul, "get_app_path", lambda: str(tmp_path / "app" / "x"))

    class Marke(Exception):
        pass

    def _marke():
        raise Marke()

    monkeypatch.setattr(modul, "load_pokedex", _marke)

    with pytest.raises(Marke):
        modul.create_merged_database()
