"""WZ-3: die Firestore-Regelprobe urteilt richtig.

Ausgefuehrt wird urteil() — nicht der Quelltext durchsucht. Die
Messwerte vom 27.09.2026 (Browser gegen die Produktivdatenbank) sind der
Gutfall; jede Abweichung, die eine echte Lage beschreibt, muss rot sein.
"""
import importlib.util
import os

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))


def _lade(name, pfad):
    spec = importlib.util.spec_from_file_location(name, pfad)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


P = _lade("firestore_regelprobe", os.path.join(WURZEL, "scripts", "firestore_regelprobe.py"))

GEMESSEN_27_09 = {
    "publicProfiles": 403, "emailIndex": 403, "shared_decks": 403,
    "testingGroupInvites": 403, "ZZgibtesnicht": 403, "shared_decks/ZZZZZZ": 404,
}


def test_der_gemessene_stand_ist_wie_soll():
    assert P.urteil(dict(GEMESSEN_27_09)) == (0, [])


def test_eine_offene_sammlung_ist_ein_befund():
    e = dict(GEMESSEN_27_09, publicProfiles=200)
    code, zeilen = P.urteil(e)
    assert code == 1 and any("OFFEN" in z and "publicProfiles" in z for z in zeilen)


def test_ohne_kontrolle_1_ist_nichts_gemessen():
    # falsches Projekt: alles 404 — das darf nicht als "gesperrt" durchgehen
    e = {k: 404 for k in GEMESSEN_27_09}
    assert P.urteil(e)[0] == 2
    e = dict(GEMESSEN_27_09, ZZgibtesnicht=None)
    assert P.urteil(e)[0] == 2


def test_zu_strenge_regeln_sind_ein_befund():
    e = dict(GEMESSEN_27_09, **{"shared_decks/ZZZZZZ": 403})
    code, zeilen = P.urteil(e)
    assert code == 1 and any("ZU STRENG" in z for z in zeilen)


def test_404_auf_einer_liste_ist_nicht_gesperrt():
    e = dict(GEMESSEN_27_09, emailIndex=404)
    assert P.urteil(e)[0] == 1


def test_dieselbe_liste_wie_die_regelpruefung():
    t = _lade("t_list", os.path.join(HIER, "test_firestore_list_gesperrt.py"))
    assert set(P.NUR_PER_ID) == set(t.NUR_PER_ID)


def test_projekt_aus_der_konfiguration():
    assert P.projekt_aus_konfig('x = { projectId: "abc-123", apiKey: "k" }') == "abc-123"
    assert P.projekt_aus_konfig("") is None
    assert P.main(["--projekt", "PLACEHOLDER_PROJECT_ID"]) == 2


def test_der_ablauf_ruft_die_probe_und_schreibt_nichts():
    y = open(os.path.join(WURZEL, ".github", "workflows", "firestore-regelprobe.yml"), encoding="utf-8").read()
    assert "python3 scripts/firestore_regelprobe.py" in y
    assert "contents: read" in y and "git push" not in y
