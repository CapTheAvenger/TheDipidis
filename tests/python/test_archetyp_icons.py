"""Die Slugs der Archetyp-Icons — Form und Herkunft.

BEFUND (31.08.2026): zehn der 203 kuratierten Slugs in
data/archetype_icons.json luden nicht. Live gegen
r2.limitlesstcg.net geprueft, nicht geraten:

    mega-charizard-x   ->  charizard-mega-x
    charizard-x-mega   ->  charizard-mega-x
    charizard-y-mega   ->  charizard-mega-y
    mega-eelektross    ->  eelektross-mega
    mega-froslass      ->  froslass-mega
    mega-greninja      ->  greninja-mega
    mega-manectric     ->  manectric-mega
    mega-starmie       ->  starmie-mega
    alolan             ->  exeggutor-alola
    ogerpon-teal-mask  ->  ogerpon

WOHER SIE KAMEN

Nicht vom Scraper: der liest die Slugs aus Limitless' eigenen
<img src> und ist damit per Konstruktion richtig. Sie stammen aus
einem einmaligen Backfill (Commit 278bc840, 05.05.2026), der 342
Archetypen nachtrug, die die EN-Deckliste nicht zeigt — und die
Slugs dafuer AUS DEN NAMEN ABLEITETE, ohne je zu pruefen, ob sie
laden. Vier Monate lang fiel das niemandem auf, weil ein
fehlschlagendes Icon sich per <img onerror> lautlos versteckt.

WAS HIER GEPRUEFT WIRD

Ob eine Adresse LAEDT, kann eine Unit-Zusicherung nicht wissen —
das macht scripts/pruefe_archetyp_icons.py im Netz. Hier steht die
Form: die Regeln, gegen die neun der zehn Faelle verstossen haben.
Beides zusammen, weil keins allein gereicht haette.
"""
import json
import os
import re

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, "data")


@pytest.fixture(scope="module")
def icons():
    with open(os.path.join(DATA, "archetype_icons.json"), encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def slugs(icons):
    raus = set()
    for v in icons["archetypes"].values():
        if isinstance(v, list):
            raus.update(v)
    return raus


# Woerter, die eine FORM bezeichnen und nie fuer sich eine Art sind.
FORMWORTE = {
    "mega", "alolan", "alola", "galarian", "galar", "hisuian", "hisui",
    "paldean", "paldea", "bloodmoon", "tealmask", "teal", "mask",
    "wellspring", "cornerstone", "hearthflame", "x", "y",
}


def test_slugs_sind_url_tauglich(slugs):
    schlecht = sorted(s for s in slugs if not re.fullmatch(r"[a-z0-9-]+", str(s)))
    assert schlecht == [], (
        "Leerzeichen, Apostroph oder Grossbuchstaben ergeben eine Adresse, "
        f"die nie laedt: {schlecht}")


def test_kein_slug_ist_nur_ein_formwort(slugs):
    """`alolan` stand fuer "Alolan Exeggutor" — der Formzusatz wurde als
    eigene Art gelesen. Es gibt kein Pokemon namens Alolan."""
    schlecht = sorted(s for s in slugs if s in FORMWORTE)
    assert schlecht == [], f"Formwort als eigene Art: {schlecht}"


def test_der_formzusatz_steht_hinten(slugs):
    """Limitless schreibt <art>-<form>, nicht <form>-<art>.

    Sechs Slugs standen verkehrt herum (`mega-starmie` statt
    `starmie-mega`), waehrend 34 andere im selben File die richtige
    Reihenfolge benutzten. Die Datei widersprach sich selbst.
    """
    praefixe = ("mega-", "alolan-", "alola-", "galarian-", "galar-",
                "hisuian-", "hisui-", "paldean-", "paldea-")
    schlecht = sorted(s for s in slugs if s.startswith(praefixe))
    assert schlecht == [], (
        "der Formzusatz gehoert ans ENDE des Slugs, nicht an den Anfang: "
        f"{schlecht}")


def test_die_variante_steht_hinter_der_form(slugs):
    """`charizard-x-mega` statt `charizard-mega-x`.

    Faellt durch die Regel oben NICHT auf, weil der Slug korrekt auf
    `-mega` endet — die Variante steht nur an der falschen Stelle.
    """
    schlecht = sorted(s for s in slugs if re.search(r"-[xy]-(mega|alola|galar|hisui|paldea)$", s))
    assert schlecht == [], (
        "X/Y gehoert HINTER den Formzusatz (charizard-mega-x): " + str(schlecht))


@pytest.mark.parametrize("slug", sorted([
    "mega-charizard-x", "charizard-x-mega", "charizard-y-mega",
    "mega-eelektross", "mega-froslass", "mega-greninja",
    "mega-manectric", "mega-starmie", "alolan",
]))
def test_die_neun_alten_faelle_kommen_nicht_zurueck(slugs, slug):
    """Namentlich, damit ein spaeterer Backfill sie nicht neu erzeugt."""
    assert slug not in slugs


def test_die_richtigen_slugs_stehen_drin(icons):
    """Gegenprobe: die Korrektur ist wirklich angekommen.

    Ohne diese Zusicherung wuerden die Regeln oben auch dann gruen,
    wenn jemand die kaputten Eintraege einfach GELOESCHT haette — dann
    stuenden die Archetypen wieder ohne Icon da.
    """
    a = icons["archetypes"]
    assert a["Alolan Exeggutor"] == ["exeggutor-alola"]
    assert a["Teal Mask Ogerpon"] == ["ogerpon"]
    assert a["Mega Charizard-X Mega Charizard-Y"] == ["charizard-mega-x", "charizard-mega-y"]
    assert a["Mega Eelektross Mega Manectric"] == ["eelektross-mega", "manectric-mega"]
    assert a["Dusknoir Mega Starmie"] == ["dusknoir", "starmie-mega"]
    assert a["Mega Greninja Drakloak"] == ["greninja-mega", "drakloak"]
    assert a["Arboliva Mega Froslass"] == ["arboliva", "froslass-mega"]
    assert a["Delphox Mega Charizard-X"] == ["delphox", "charizard-mega-x"]
    assert a["Typhlosion Mega Charizard-X"] == ["typhlosion", "charizard-mega-x"]


def test_kein_eintrag_zeigt_dasselbe_icon_zweimal(icons):
    doppelt = {k: v for k, v in icons["archetypes"].items()
               if isinstance(v, list) and len(v) != len(set(v))}
    assert doppelt == {}, f"dieselbe Art zweimal im selben Eintrag: {doppelt}"


def test_hoechstens_zwei_icons_je_archetyp(icons):
    """Die Oberflaeche stellt zwei nebeneinander; mehr sprengt die Zeile."""
    zuviel = {k: v for k, v in icons["archetypes"].items()
              if isinstance(v, list) and len(v) > 2}
    assert zuviel == {}, f"mehr als zwei Icons: {zuviel}"


# ── Das Pruefskript ────────────────────────────────────────────────
#
# Ob eine Adresse laedt, entscheidet sich im Netz. Was sich hier
# entscheiden laesst: dass das Skript einen NETZAUSSETZER nicht als
# kaputten Slug meldet. Ein Fehlalarm, der den Wochenlauf rot faerbt,
# wird nach dem zweiten Mal ignoriert — und dann meldet auch der echte
# Befund niemandem mehr etwas.

def _pruefer():
    import importlib.util
    pfad = os.path.join(ROOT, "scripts", "pruefe_archetyp_icons.py")
    spec = importlib.util.spec_from_file_location("icon_pruefer", pfad)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_ein_404_gilt_als_kaputt(monkeypatch):
    import urllib.error
    mod = _pruefer()

    def wirf(*_a, **_k):
        raise urllib.error.HTTPError("u", 404, "Not Found", {}, None)
    monkeypatch.setattr(mod.urllib.request, "urlopen", wirf)
    ok, hinweis = mod.erreichbar("http://x/y.png")
    assert ok is False
    assert "404" in hinweis


@pytest.mark.parametrize("fehler", [
    TimeoutError("zu langsam"),
    ConnectionResetError("Verbindung weg"),
    OSError("Netz weg"),
])
def test_ein_netzaussetzer_gilt_NICHT_als_kaputt(monkeypatch, fehler):
    mod = _pruefer()

    def wirf(*_a, **_k):
        raise fehler
    monkeypatch.setattr(mod.urllib.request, "urlopen", wirf)
    ok, _ = mod.erreichbar("http://x/y.png")
    assert ok is None, "ein Aussetzer darf keinen Slug beschuldigen"


def test_ein_500_gilt_auch_nicht_als_kaputt(monkeypatch):
    """Serverfehler sagt nichts ueber den Slug."""
    import urllib.error
    mod = _pruefer()

    def wirf(*_a, **_k):
        raise urllib.error.HTTPError("u", 500, "Server Error", {}, None)
    monkeypatch.setattr(mod.urllib.request, "urlopen", wirf)
    ok, _ = mod.erreichbar("http://x/y.png")
    assert ok is None


def test_eine_fehlerseite_mit_status_200_gilt_als_kaputt(monkeypatch):
    """Manche CDNs liefern HTML mit 200 statt 404. Ohne die Pruefung der
    PNG-Signatur waere so ein Slug 'in Ordnung' und das Bild leer."""
    mod = _pruefer()

    class Antwort:
        def read(self, _n):
            return b"<!DOCTYPE"
        def __enter__(self):
            return self
        def __exit__(self, *_a):
            return False
    monkeypatch.setattr(mod.urllib.request, "urlopen", lambda *_a, **_k: Antwort())
    ok, hinweis = mod.erreichbar("http://x/y.png")
    assert ok is False
    assert "PNG" in hinweis


def test_ein_echtes_png_gilt_als_in_ordnung(monkeypatch):
    mod = _pruefer()

    class Antwort:
        def read(self, _n):
            return b"\x89PNG\r\n\x1a\n"
        def __enter__(self):
            return self
        def __exit__(self, *_a):
            return False
    monkeypatch.setattr(mod.urllib.request, "urlopen", lambda *_a, **_k: Antwort())
    assert mod.erreichbar("http://x/y.png")[0] is True


def test_das_skript_geht_freundlich_mit_dem_cdn_um():
    mod = _pruefer()
    assert mod.PAUSE_S >= 0.1, "zu schnell hintereinander"
    assert "thedipidis.app" in mod.UA, "der Absender muss erkennbar sein"
