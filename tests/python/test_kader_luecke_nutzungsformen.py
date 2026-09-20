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


def test_beide_zweige_an_einem_gebauten_fall(roster_modul, daten):
    """Die Regel in BEIDE Richtungen — an einem gebauten Fall.

    Hier stand zuerst eine Probe, die sich auf die echte Luecke stuetzte
    ("nimm den ersten Vorschlag"). Sie war grün, solange die 27 Arten im
    Pokedex fehlten — und fiel in dem Moment um, in dem die Regel ihre
    Arbeit getan hatte und nichts mehr vorzuschlagen war. Eine
    Zusicherung, die nur vor ihrer eigenen Behebung haelt, bewacht
    nichts.

    Der Fall wird deshalb GEBAUT: eine Art, die der Pokedex fuehrt, wird
    aus einer Kopie entfernt. Danach muss die Regel sie
      * ERGAENZEN, solange Smogon Werte fuehrt, und
      * MELDEN, sobald die Werte fehlen.
    Beides unabhaengig davon, wie vollstaendig der echte Bestand gerade
    ist.
    """
    vorhanden = set(daten["extra"]["smogonKeys"])
    # Eine Art suchen, die der Pokedex fuehrt UND die eine Nutzungszeile hat.
    zeilen = sorted((daten["usage"].get("pokemon") or {}))
    opfer_slug = None
    for schluessel in zeilen:
        nm = roster_modul.slug_to_smogon(schluessel)
        if nm in daten["smogon"] and "baseStats" in daten["smogon"][nm] \
                and nm not in vorhanden \
                and schluessel in roster_modul.pokedex_schluessel(daten["dex"]):
            opfer_slug, opfer_name = schluessel, nm
            break
    assert opfer_slug, "keine passende Art fuer den gebauten Fall gefunden"

    ohne_eintrag = {"entries": [e for e in daten["dex"]["entries"]
                                if (e.get("meta") or {}).get("slug") != opfer_slug
                                and _norm_en(e.get("en")) != opfer_slug]}

    neu, ohne = roster_modul.nutzungsformen(
        vorhanden, daten["smogon"], daten["usage"], ohne_eintrag)
    assert opfer_name in neu, (
        f"{opfer_name} fehlt im Pokedex, hat Nutzungszeile und Werte — "
        "und wird trotzdem nicht ergaenzt")
    assert opfer_slug not in ohne, f"{opfer_name} wird zugleich gemeldet und ergaenzt"

    schmal = {k: v for k, v in daten["smogon"].items() if k != opfer_name}
    neu2, ohne2 = roster_modul.nutzungsformen(
        vorhanden, schmal, daten["usage"], ohne_eintrag)
    assert opfer_name not in neu2, f"{opfer_name} wird ohne Basiswerte trotzdem ergaenzt"
    assert opfer_slug in ohne2, (
        f"{opfer_name} verschwindet still, statt gemeldet zu werden — genau der "
        "Zustand, der den Rotom-Fall verursacht hat")


def _norm_en(en):
    import re
    return re.sub(r"[^a-z0-9]+", "-", str(en or "").lower()).strip("-")
