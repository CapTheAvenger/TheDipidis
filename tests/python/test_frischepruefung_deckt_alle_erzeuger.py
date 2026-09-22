# -*- coding: utf-8 -*-
"""Der Satz "alle Erzeuger haben in ihrer Frist gelaufen" muss alle meinen.

BEFUND 22.09.2026. `scripts/pruefe_frische.py` fuehrt zwei Listen:
RHYTHMUS (Erzeuger mit Zeitplan) und OHNE_ZEITPLAN (bewusst ohne, je mit
Begruendung). Der Wochenlauf meldet daraus:

    Erzeuger mit Zeitplan: 36 · davon stumm: 0
    Alle Erzeuger mit Zeitplan haben in ihrer Frist erfolgreich gelaufen.

`data/_job_heartbeats.json` fuehrte am selben Tag aber **39** Erzeuger.
Drei standen in KEINER der beiden Listen:

    scrapers/scrape_kartentexte.py        (fuellt card_text_de, 14.617 Zeilen)
    scripts/build_champions_item_sprites.py
    scripts/build_champions_move_flags.py

Sie konnten damit nie einen Befund ausloesen — weder "stumm" noch
"bewusst ohne Zeitplan". Waeren sie stehen geblieben, haette die
Frischepruefung weiter gemeldet, es sei alles in Ordnung. Der Satz war
wahr und deckte weniger ab, als er klang.

DIE FORM: geprueft wird keine Zahl, sondern die BEZIEHUNG. Wer einen
Herzschlag schreibt, steht in einer der beiden Listen. Ein neuer Erzeuger
faellt hier um — und zwar bevor er zum ersten Mal ausfaellt.
"""

import importlib.util
import io
import json
import os
import sys

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
HERZSCHLAG = os.path.join(WURZEL, "data", "_job_heartbeats.json")


def _pruefe_frische():
    sys.path.insert(0, os.path.join(WURZEL, "scripts"))
    spec = importlib.util.spec_from_file_location(
        "pruefe_frische_test", os.path.join(WURZEL, "scripts", "pruefe_frische.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_jeder_erzeuger_mit_herzschlag_steht_in_einer_liste():
    pf = _pruefe_frische()
    with io.open(HERZSCHLAG, encoding="utf-8") as f:
        herz = json.load(f) or {}
    # Schluessel, die mit _ beginnen, sind Notizen der Datei, keine Erzeuger.
    erzeuger = {k for k in herz if not str(k).startswith("_")}
    assert erzeuger, "data/_job_heartbeats.json fuehrt keinen Erzeuger mehr"

    abgedeckt = set(pf.RHYTHMUS) | set(pf.OHNE_ZEITPLAN)
    fehlt = sorted(erzeuger - abgedeckt)
    assert not fehlt, (
        f"diese Erzeuger schreiben einen Herzschlag, stehen aber in keiner "
        f"der beiden Listen von scripts/pruefe_frische.py: {fehlt}. Sie "
        f"koennen damit nie einen Befund ausloesen — weder 'stumm' noch "
        f"'bewusst ohne Zeitplan' —, und der Satz 'alle Erzeuger haben in "
        f"ihrer Frist gelaufen' deckt sie nicht ab. Entweder in RHYTHMUS "
        f"eintragen (mit Takt) oder in OHNE_ZEITPLAN (mit Begruendung).")


def test_jede_begruendung_ohne_zeitplan_ist_eine_begruendung():
    """Eine Ausnahme ohne Grund ist eine stille Genehmigung."""
    pf = _pruefe_frische()
    zu_kurz = [k for k, v in pf.OHNE_ZEITPLAN.items()
               if len(str(v).strip()) < 40]
    assert not zu_kurz, (
        f"diese Erzeuger stehen ohne tragende Begruendung in OHNE_ZEITPLAN: "
        f"{zu_kurz}")


def test_die_beiden_listen_ueberschneiden_sich_nicht():
    pf = _pruefe_frische()
    doppelt = sorted(set(pf.RHYTHMUS) & set(pf.OHNE_ZEITPLAN))
    assert not doppelt, (
        f"{doppelt} stehen in BEIDEN Listen — dann ist unklar, ob ein "
        f"ausbleibender Lauf ein Befund ist oder nicht")
