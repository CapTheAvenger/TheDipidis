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
import pytest
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


# ── GELAUFEN IST NICHT GELIEFERT (23.09.2026) ─────────────────────────
#
# Der Satz oben war wahr und deckte trotzdem weniger ab, als er klang —
# zum zweiten Mal, eine Ebene tiefer. Nachdem
# scripts/build_champions_move_flags.py am 22.09. in RHYTHMUS aufgenommen
# war, meldete die Pruefung jede Nacht "FRISCH, lief vor 0.1 Tagen". Der
# Erzeuger lief auch. Sein Ergebnis kam nur nie an: die Datei fehlte in
# der `git add`-Liste ihres Ablaufs und wurde mit dem Runner weggeworfen.
# Sieben Tage lang, bis der Bestand sich aenderte und Deploy 3025/3026/3027
# rot wurden.
#
# `nicht_ausgeliefert()` haelt jetzt den Stempel des Ergebnisses gegen den
# Lauf. Diese Zusicherungen halten, dass die Regel wirkt UND dass sie
# ueberhaupt etwas zu pruefen hat.


def _quelldatei(job):
    """Der Pfad zur Erzeugerdatei hinter einem Herzschlag-Schluessel.

    BEFUND 24.09.2026: die Schluessel sind NICHT durchgaengig
    repo-relativ. "scripts/x.py" liegt unter <repo>/scripts/, aber
    "scrapers/x.py" und "core/x.py" liegen unter <repo>/backend/. Das
    fiel nie auf, weil in ERGEBNIS_MIT_STEMPEL bisher nur scripts/-
    Eintraege standen — der erste scrapers/-Eintrag lief sofort in einen
    FileNotFoundError, und zwar in der Zusicherung, nicht im Erzeuger.
    """
    direkt = os.path.join(WURZEL, job)
    if os.path.isfile(direkt):
        return direkt
    unter_backend = os.path.join(WURZEL, "backend", job)
    assert os.path.isfile(unter_backend), (
        "zu %s gibt es weder %s noch %s — der Herzschlag-Schluessel zeigt "
        "auf keine Datei" % (job, direkt, unter_backend))
    return unter_backend


def test_der_pfadhelfer_findet_beide_bauarten_von_schluessel():
    """An gesetzten Schluesseln — der Helfer darf kein ungeprueftes Stueck sein.

    Die Herzschlag-Schluessel sind zweierlei Bauart, und das faellt erst
    auf, wenn der erste scrapers/-Eintrag in ERGEBNIS_MIT_STEMPEL landet:
    "scripts/x.py" liegt unter <repo>/, "scrapers/x.py" unter
    <repo>/backend/. Gesucht werden hier zwei Dateien, die es WIRKLICH
    gibt — welche, ist der Zusicherung egal, sie kommen aus RHYTHMUS.
    """
    m = _pruefe_frische()
    unter_scripts = [j for j in m.RHYTHMUS if j.startswith("scripts/")]
    unter_backend = [j for j in m.RHYTHMUS if j.startswith(("scrapers/", "core/"))]
    assert unter_scripts and unter_backend, (
        "RHYTHMUS fuehrt nicht mehr beide Bauarten — dann prueft das hier nichts")

    for job in (unter_scripts[0], unter_backend[0]):
        pfad = _quelldatei(job)
        assert os.path.isfile(pfad), job

    # Gegenprobe: ein Schluessel, hinter dem keine Datei liegt, muss
    # auffallen — sonst liefe die Regel auf einem Tippfehler leer.
    with pytest.raises(AssertionError):
        _quelldatei("scrapers/gibt_es_nicht_12345.py")


def test_jedes_gestempelte_ergebnis_gehoert_zu_einem_erzeuger_mit_zeitplan():
    m = _pruefe_frische()
    for job in m.ERGEBNIS_MIT_STEMPEL:
        assert job in m.RHYTHMUS, (
            f"{job} steht in ERGEBNIS_MIT_STEMPEL, hat aber keinen Rhythmus — "
            "dann wird der Stempel nie gegen etwas gehalten")


def test_jede_gestempelte_datei_traegt_den_stempel_wirklich():
    """Sonst laeuft die Regel leer: kein Stempel, kein Vergleich, gruen."""
    m = _pruefe_frische()
    for job, datei in m.ERGEBNIS_MIT_STEMPEL.items():
        pfad = os.path.join(WURZEL, "data", datei)
        assert os.path.isfile(pfad), f"{datei} ({job}) liegt nicht in data/"
        with open(pfad, encoding="utf-8") as fh:
            meta = (json.load(fh) or {}).get("_meta") or {}
        assert any(meta.get(f) for f in m.STEMPEL_FELDER), (
            f"data/{datei} traegt keinen der Stempel {m.STEMPEL_FELDER} — "
            f"dann kann nicht_ausgeliefert() fuer {job} nichts pruefen")


def test_der_erzeuger_setzt_den_stempel_bei_jedem_lauf_neu():
    """Die Regel STIMMT nur, wenn der Stempel unbedingt neu geschrieben wird.

    Steht er hinter einer Bedingung ("nur wenn sich etwas geaendert hat"),
    ist ein alter Stempel kein Beweis mehr, sondern ein Verdacht — und die
    Pruefung erzeugte Rauschen.
    """
    m = _pruefe_frische()
    for job in m.ERGEBNIS_MIT_STEMPEL:
        with open(_quelldatei(job), encoding="utf-8") as fh:
            quelle = fh.read()
        assert "datetime.now" in quelle or "utcnow" in quelle, (
            f"{job} holt sich keine aktuelle Zeit — dann ist der Stempel "
            "kein Nachweis des Laufs")


def test_die_regel_schlaegt_bei_einem_alten_stempel_an():
    """Verfaelschungsprobe an GESETZTEN Werten, nicht an der Woche.

    Gerechnet wird mit einem Lauf von heute und einem Stempel von vor
    sieben Tagen — genau der Stand vom 16.-23.09.2026.
    """
    import datetime as dt

    m = _pruefe_frische()
    jetzt = dt.datetime(2026, 9, 23, 6, 0, tzinfo=dt.timezone.utc)
    lauf = m._alter_tage("2026-09-23T04:10:00+00:00", jetzt)
    stempel = m._alter_tage("2026-09-16T11:29:20+00:00", jetzt)
    erlaubt = m.ERWARTET_TAGE["taeglich"] + m.STEMPEL_LUFT_TAGE
    assert stempel - lauf > erlaubt, (
        f"ein Stempel {stempel:.1f} Tage hinter einem Lauf von "
        f"{lauf:.1f} Tagen gilt noch als in Ordnung (erlaubt {erlaubt:.1f}) — "
        "dann haette die Regel den 23.09.2026 nicht gefangen")
    # Und die Gegenrichtung: derselbe Tag ist KEIN Befund.
    gleich = m._alter_tage("2026-09-23T05:10:00+00:00", jetzt)
    assert gleich - lauf <= erlaubt, "ein frischer Stempel loest einen Befund aus"


def test_am_heutigen_stand_gibt_es_keinen_befund():
    """Der Arbeitsbaum selbst muss sauber sein — sonst ist etwas offen."""
    m = _pruefe_frische()
    offen = m.nicht_ausgeliefert()
    assert not offen, "; ".join(f"{j}: {h}" for j, _, h in offen)
