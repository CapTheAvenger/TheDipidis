"""Wer gespielt wird, muss auch waehlbar sein.

ANLASS (Betreiber, 16.09.2026): „es sind nicht alle Rotoms waehlbar beim
Gegner gerade gesehen".

Gemessen an dem Tag: 27 Schluessel aus data/champions_usage.json hatten
keinen Eintrag in data/champions_pokedex.json — vier Rotom-Formen und 23
weitere Arten. Der Rechner baut seine Auswahlliste aus dem Pokedex
(buildRoster in js/app-side-quest-matchups.js); wer dort fehlt, ist in
der Oberflaeche nicht vorhanden.

WAS HIER GEPRUEFT WIRD — UND WAS AUSDRUECKLICH NICHT

Geprueft wird die REGEL in scripts/scrape_champions_roster.py, nicht der
Dateistand: die Daten entstehen in CI (pokebase.app ist aus dem
Bausandkasten nicht erreichbar), und eine Zusicherung, die auf den
naechsten Lauf wartet, bewacht nichts.

Die Regel lautet: jeder Nutzungsschluessel ohne Pokedex-Eintrag wird
entweder ERGAENZT (wenn Smogon Basiswerte fuehrt) oder NAMENTLICH
GEMELDET (wenn nicht). Ein stilles Loch darf es nicht geben — das war
genau der Zustand vor dem 16.09.2026.
"""
import importlib.util
import json
import os

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, "data")


def _json(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def roster_modul():
    pfad = os.path.join(ROOT, "scripts", "scrape_champions_roster.py")
    spec = importlib.util.spec_from_file_location("scrape_champions_roster", pfad)
    modul = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modul)
    return modul


@pytest.fixture(scope="module")
def daten():
    return {
        "smogon": _json("pokemon_battle_data.json"),
        "usage": _json("champions_usage.json"),
        "dex": _json("champions_pokedex.json"),
        "extra": _json("champions_roster_extra.json"),
    }


def test_kein_nutzungsschluessel_faellt_still_durch(roster_modul, daten):
    vorhanden = set(daten["extra"]["smogonKeys"])
    neu, ohne = roster_modul.nutzungsformen(
        vorhanden, daten["smogon"], daten["usage"], daten["dex"])
    bekannt = roster_modul.pokedex_schluessel(daten["dex"])
    unter_grundform = set(roster_modul.TEAM_UNTER_GRUNDFORM)

    still = []
    for schluessel in sorted((daten["usage"].get("pokemon") or {})):
        if schluessel in bekannt or schluessel in ohne:
            continue
        nm = roster_modul.slug_to_smogon(schluessel)
        if nm in vorhanden or nm in neu or nm in unter_grundform:
            continue
        still.append(schluessel)
    assert not still, (
        "Diese Formen werden gespielt, stehen nicht im Pokedex und werden weder "
        "ergaenzt noch gemeldet: " + ", ".join(still))


def test_ergaenzt_wird_nur_mit_basiswerten(roster_modul, daten):
    """Kein Eintrag ohne Zahlen — der Rechner koennte mit ihm nichts anfangen."""
    neu, _ohne = roster_modul.nutzungsformen(
        set(daten["extra"]["smogonKeys"]), daten["smogon"], daten["usage"], daten["dex"])
    ohne_werte = [n for n in neu
                  if n not in daten["smogon"] or "baseStats" not in daten["smogon"][n]]
    assert not ohne_werte, ("ergaenzt ohne Smogon-Basiswerte: " + ", ".join(ohne_werte))


def test_ergaenzt_wird_nur_mit_eigener_nutzungszeile(roster_modul, daten):
    """Die Gegenrichtung: nichts wird aus der Luft ergaenzt."""
    neu, _ohne = roster_modul.nutzungsformen(
        set(daten["extra"]["smogonKeys"]), daten["smogon"], daten["usage"], daten["dex"])
    zeilen = set(daten["usage"].get("pokemon") or {})
    ohne_beleg = [n for n in neu
                  if not any(roster_modul.slug_to_smogon(z) == n for z in zeilen)]
    assert not ohne_beleg, ("ergaenzt ohne eigene Nutzungszeile: " + ", ".join(ohne_beleg))


def test_nichts_wird_doppelt_angelegt(roster_modul, daten):
    vorhanden = set(daten["extra"]["smogonKeys"])
    neu, _ohne = roster_modul.nutzungsformen(
        vorhanden, daten["smogon"], daten["usage"], daten["dex"])
    assert len(neu) == len(set(neu)), "dieselbe Form steht mehrfach in der Ergaenzung"
    doppelt = sorted(set(neu) & vorhanden)
    assert not doppelt, ("schon im Kader und trotzdem ergaenzt: " + ", ".join(doppelt))


def test_die_sonderfaelle_sind_nachgeschlagen_und_nicht_geraten(roster_modul, daten):
    """Farfetch'd und Mr. Mime tragen Zeichen, die kein Schluessel hergibt.

    Der typografische Apostroph ist in diesem Projekt schon einmal teuer
    geworden ("Forest's Curse", 15.09.2026). Hier wird geprueft, dass
    jeder Sonderfall wirklich auf einen Smogon-Eintrag zeigt — eine
    Tabelle mit einem Tippfehler waere schlimmer als keine.
    """
    for schluessel, name in roster_modul.SLUG_SONDERFALL.items():
        assert name in daten["smogon"], (
            f"{schluessel} -> {name!r} steht nicht in pokemon_battle_data.json")
        assert roster_modul.slug_to_smogon(schluessel) == name


def test_formen_unter_der_grundform_werden_nicht_ergaenzt(roster_modul, daten):
    neu, _ohne = roster_modul.nutzungsformen(
        set(daten["extra"]["smogonKeys"]), daten["smogon"], daten["usage"], daten["dex"])
    drin = sorted(set(neu) & set(roster_modul.TEAM_UNTER_GRUNDFORM))
    assert not drin, ("als eigene Form angelegt, obwohl der Pokedex sie unter der "
                      "Grundform fuehrt: " + ", ".join(drin))


def test_was_der_pokedex_schon_fuehrt_wird_nicht_erneut_angelegt(roster_modul, daten):
    """Ohne diese Zusicherung bliebe der Abgleich gegen den Pokedex blind.

    Verfaelschungsprobe am 16.09.2026: faellt die Zeile
    `if schluessel in da: continue` weg, schlaegt die Regel 200 Arten
    vor, die laengst im Pokedex stehen — und KEINE der uebrigen
    Zusicherungen wurde rot, weil sie alle nur gegen die
    Ergaenzungsliste (`vorhanden`) pruefen, nicht gegen den Pokedex.
    """
    neu, _ohne = roster_modul.nutzungsformen(
        set(daten["extra"]["smogonKeys"]), daten["smogon"], daten["usage"], daten["dex"])
    bekannt = roster_modul.pokedex_schluessel(daten["dex"])
    doppelt = sorted(n for n in neu
                     if n.lower().replace(" ", "-").replace(".", "") in bekannt
                     or n.lower() in bekannt)
    assert not doppelt, ("schon im Pokedex und trotzdem vorgeschlagen: "
                         + ", ".join(doppelt[:20]))
    # Gegenprobe zur Probe selbst: die Menge darf nicht leer sein, sonst
    # vergliche die Zeile darueber gegen nichts.
    assert len(bekannt) > 200, "die Pokedex-Menge ist verdaechtig klein"


def test_eine_form_ohne_basiswerte_wird_gemeldet_statt_verschluckt(roster_modul, daten):
    """Die Meldeseite der Regel — mit gekuerzten Daten geprueft.

    Im echten Bestand hat am 16.09.2026 JEDE der 25 vorgeschlagenen
    Formen Smogon-Werte; `ohne_werte` ist leer, und eine Verfaelschung
    des Melde-Zweigs blieb deshalb gruen (gemessen). Ein Fall, den es in
    den Daten nicht gibt, muss gebaut werden — sonst bewacht die Regel
    ihre wichtigere Haelfte nicht.
    """
    vorhanden = set(daten["extra"]["smogonKeys"])
    neu, _ohne = roster_modul.nutzungsformen(
        vorhanden, daten["smogon"], daten["usage"], daten["dex"])
    assert neu, "die Regel schlaegt gar nichts vor — die Probe greift nicht"

    # Genau EINEM Vorschlag die Basiswerte nehmen.
    opfer = sorted(neu)[0]
    schmal = {k: v for k, v in daten["smogon"].items() if k != opfer}
    neu2, ohne2 = roster_modul.nutzungsformen(
        vorhanden, schmal, daten["usage"], daten["dex"])
    assert opfer not in neu2, f"{opfer} wird ohne Basiswerte trotzdem ergaenzt"
    passend = [z for z in ohne2 if roster_modul.slug_to_smogon(z) == opfer]
    assert passend, (f"{opfer} verschwindet still, statt gemeldet zu werden — "
                     "genau der Zustand, der den Rotom-Fall verursacht hat")
