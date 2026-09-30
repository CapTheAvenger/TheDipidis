"""Eine neue Art ohne Bild ist eine benannte, datierte Luecke — kein roter Lauf.

ANLASS (29.09.2026): seit dem Tor vor dem Push haette eine einzige neue Art
im Champions-Pokedex den Nachtlauf champions-usage-refresh angehalten
(gemessen: test-champions-sprites.js und test-champions-raster.js rot).
`luecken_fortschreiben` benennt Eintraege ohne Bild mit dem Tag, an dem sie
zuerst gesehen wurden, und laesst sie fallen, sobald ein Bild da ist.
Ausgefuehrt an gesetzten Daten.
"""
import importlib.util
import os

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
SKRIPT = os.path.join(WURZEL, "scripts", "build_champions_sprites.py")


def _modul():
    spec = importlib.util.spec_from_file_location("bcs_luecken", SKRIPT)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_neu_ohne_bild_wird_mit_datum_benannt():
    m = _modul()
    erg = m.luecken_fortschreiben({"Absol": {}}, [{"en": "Absol"}, {"en": "Amoonguss"}], {}, "2026-09-29")
    assert erg == {"Amoonguss": "2026-09-29"}


def test_das_erste_datum_bleibt_stehen():
    m = _modul()
    erg = m.luecken_fortschreiben({}, [{"en": "Amoonguss"}], {"Amoonguss": "2026-09-20"}, "2026-09-29")
    assert erg == {"Amoonguss": "2026-09-20"}, (
        "das Datum der Luecke wandert mit jedem Lauf — dann sieht niemand, wie alt sie ist")


def test_mit_bild_faellt_der_eintrag_heraus():
    m = _modul()
    erg = m.luecken_fortschreiben({"Amoonguss": {"datei": "x"}}, [{"en": "Amoonguss"}],
                                  {"Amoonguss": "2026-09-20"}, "2026-09-29")
    assert erg == {}, "eine Luecke bleibt benannt, obwohl das Bild inzwischen da ist"


# ── Verdrahtung: beide Nachtlaeufe, die den Pokedex bauen ───────────────
import re  # noqa: E402

import pytest  # noqa: E402
import yaml  # noqa: E402


@pytest.mark.parametrize("ablauf", ["champions-usage-refresh.yml", "champions-replica-scrape.yml"])
def test_nach_dem_pokedex_kommen_editionen_und_bild_luecken(ablauf):
    """Die Editionen lesen den Pokedex. Stehen sie davor, fehlt einer neuen
    Art bis zum naechsten Morgen die Liste (bis 29.09.2026 im 04:00-Lauf so)."""
    with open(os.path.join(WURZEL, ".github", "workflows", ablauf), encoding="utf-8") as f:
        schritte = list(yaml.safe_load(f)["jobs"].values())[0]["steps"]
    run = [str(s.get("run", "")) for s in schritte]
    i_dex = next(i for i, r in enumerate(run) if "build_champions_pokedex.py" in r)
    i_ed = [i for i, r in enumerate(run) if "build_champions_editionen.py" in r]
    i_lu = [i for i, r in enumerate(run) if "build_champions_sprites.py --nur-luecken" in r]
    i_push = next(i for i, r in enumerate(run)
                  if "git push" in r or "scripts/push_nach_rebase.sh" in r)
    assert i_ed and all(i_dex < i < i_push for i in i_ed), (
        f"{ablauf}: die Editionen werden nicht zwischen Pokedex und Push gebaut")
    assert i_lu and all(i_dex < i < i_push for i in i_lu), (
        f"{ablauf}: die Bild-Luecken werden nicht zwischen Pokedex und Push benannt")
    commit = run[i_push]
    for datei in ("data/champions_editionen.json", "data/champions_sprites.json"):
        assert datei in commit, f"{ablauf}: {datei} fehlt in der git-add-Liste"
