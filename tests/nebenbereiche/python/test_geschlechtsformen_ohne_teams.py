"""Geschlechtsformen haengen nicht an den Top-Teams.

BEFUND 01.10.2026: Champions Replica Scrape #139 (04:02 UTC) und sein
Neulauf (07:40) hielten am Tor — "nur 2 Geschlechtsformen im Pokedex",
"Psiaugon-Eintraege fehlen". Meowstic-F stand im Kader nur, weil die
Top-Teams es spielten; geschlechtsformen() sah die Grundform nicht, weil
`vorhanden` nur kennt, was pokebase listet (Meowstic fehlt dort,
Indeedee heisst dort indeedee-female/-male).

Geprueft wird die REGEL, ausgefuehrt gegen Eingaben, die die Datenlage
vom 01.10. nachstellen — nicht der Dateistand. Die Verfaelschungsprobe
fuehrt dieselbe Funktion mit herausgeschnittenem zweiten Weg aus und
verlangt, dass dort die Form fehlt.
"""
import importlib.util
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
PFAD = os.path.join(ROOT, "scripts", "scrape_champions_roster.py")


def _lade(quelltext):
    spec = importlib.util.spec_from_loader("roster_probe", loader=None)
    modul = importlib.util.module_from_spec(spec)
    modul.__dict__["__file__"] = PFAD
    exec(compile(quelltext, PFAD, "exec"), modul.__dict__)  # noqa: S102
    return modul


def _quelle():
    with open(PFAD, encoding="utf-8") as f:
        return f.read()


SMOGON = {
    "Meowstic": {"baseStats": {}}, "Meowstic-F": {"baseStats": {}},
    "Oinkologne": {"baseStats": {}}, "Oinkologne-F": {"baseStats": {}},
    "Wobbuffet": {"baseStats": {}}, "Wobbuffet-F": {},          # ohne Werte
    "Unfezant": {"baseStats": {}}, "Unfezant-F": {"baseStats": {}},
}
NUTZUNG = {"pokemon": {
    "meowstic": {}, "meowstic-f": {},
    "oinkologne-f": {},                      # Form ohne Zeile der Grundform
    "wobbuffet": {}, "wobbuffet-f": {},
    "unfezant": {},                          # Grundform ohne Zeile der Form
}}


def test_form_kommt_ohne_grundform_im_kader_der_quelle():
    m = _lade(_quelle())
    # Teams und pokebase kennen weder Meowstic noch Meowstic-F:
    assert m.geschlechtsformen({"Basculegion"}, SMOGON, NUTZUNG) == ["Meowstic-F"]


def test_ohne_zeile_der_grundform_oder_ohne_smogon_werte_kommt_nichts_herein():
    m = _lade(_quelle())
    erg = m.geschlechtsformen(set(), SMOGON, NUTZUNG)
    assert "Oinkologne-F" not in erg      # Grundform ohne eigene Nutzungszeile
    assert "Wobbuffet-F" not in erg       # Smogon fuehrt keine Basiswerte
    assert "Unfezant-F" not in erg        # Form ohne eigene Nutzungszeile


def test_schon_vorhandene_form_wird_nicht_doppelt_angelegt():
    m = _lade(_quelle())
    assert m.geschlechtsformen({"Meowstic-F"}, SMOGON, NUTZUNG) == []


def test_der_alte_weg_ueber_den_kader_bleibt():
    m = _lade(_quelle())
    smogon = {"Basculegion": {"baseStats": {}}, "Basculegion-F": {"baseStats": {}}}
    nutzung = {"pokemon": {"basculegion-f": {}}}
    assert m.geschlechtsformen({"Basculegion"}, smogon, nutzung) == ["Basculegion-F"]


def test_probe_ohne_den_zweiten_weg_fehlt_die_form():
    q = _quelle()
    marke = "for schluessel in sorted(zeilen):"
    assert q.count(marke) == 1, "die Mutation muss genau eine Stelle treffen"
    kaputt = q.replace(marke, "for schluessel in []:")
    assert kaputt != q
    m = _lade(kaputt)
    assert m.geschlechtsformen({"Basculegion"}, SMOGON, NUTZUNG) == []
