"""Japanische Majors stehen nicht in /tournaments/jp.

BEFUND (25.09.2026): der laufende japanische Reiter war leer —
data/city_league_archetypes.csv hatte 73 Byte, nur die Kopfzeile. Kein
Scraper war defekt. Gemessen an diesem Tag:

  * https://limitlesstcg.com/tournaments/jp fuehrt AUSSCHLIESSLICH City
    Leagues, Spaltenkopf "Date | Prefecture | Shop | Winner", neuester
    Eintrag 06 May 26. In der Saisonpause steht dort nichts Neues.
  * Die Champions League Yokohama vom 20.09.2026 (Turnier 569, 10.000
    Spieler, Sieger Keiyo Watanabe mit Mega-Stalobor, 16 Platzierungen
    und 3 veroeffentlichte Listen) steht nur in der HAUPTLISTE
    /tournaments, Spaltenkopf "Date | Country | Name | | Players |
    Winner".
  * Seit der M6A-Rotation am 16.09.2026 ist die Champions League
    Yokohama das EINZIGE Turnier im laufenden japanischen Fenster.

Der Unterscheider ist nicht der Name. "Champions League",
"Regional League", "Japan Championships" ist eine Liste, die mit jedem
neuen Turnierformat veraltet — und sie waere falsch: das Formatbild
standard-jp steht auch ueber "Korean League Final Season". Der
Unterscheider ist das Format der Zeile, und das steht zweimal drin:
als data-format am <tr> und als alt-Text am Formatbild.
"""

import os
import re
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
QUELLE = os.path.join(WURZEL, "backend", "scrapers",
                      "city_league_archetype_scraper.py")
BELEG = os.path.join(HIER, "fixtures", "limitless_hauptliste_jp.html")

for _p in (os.path.join(WURZEL, "backend", "core"),
           os.path.join(WURZEL, "backend", "scrapers")):
    if _p not in sys.path:
        sys.path.insert(0, _p)


@pytest.fixture(scope="module")
def mod():
    return pytest.importorskip("city_league_archetype_scraper")


@pytest.fixture(scope="module")
def beleg_html():
    with open(BELEG, encoding="utf-8") as f:
        return f.read()


def _suppe(html):
    bs4 = pytest.importorskip("bs4")
    return bs4.BeautifulSoup(html, "lxml")


def _lauf(mod, html, von, bis, monkeypatch):
    from datetime import datetime
    monkeypatch.setattr(mod, "fetch_page_bs4", lambda url, *a, **k: _suppe(html))
    return mod.get_jp_major_tournaments(
        datetime.strptime(von, "%d.%m.%Y"),
        datetime.strptime(bis, "%d.%m.%Y"))


# ── 1 · das Turnier, um das es geht ───────────────────────────────────
def test_yokohama_wird_im_laufenden_fenster_gefunden(mod, beleg_html, monkeypatch):
    gefunden = _lauf(mod, beleg_html, "16.09.2026", "25.09.2026", monkeypatch)
    ids = [t["tournament_id"] for t in gefunden]
    assert ids == ["569"], (
        f"im Fenster ab der M6A-Rotation (16.09.2026) darf genau die "
        f"Champions League Yokohama stehen, gefunden: {ids}")
    t = gefunden[0]
    assert t["shop"] == "Champions League Yokohama"
    assert t["format"] == "Champions League (JP)"
    assert t["prefecture"] == "JP", (
        "die Ortsangabe muss der Laendercode AUS der Quelle sein — ein "
        "gesetzter Wert waere ein Platzhalter und muesste als solcher "
        "ausgewiesen werden")
    assert t["url"] == "https://limitlesstcg.com/tournaments/569"
    assert t["date_str"] == "20 Sep 26"


# ── 2 · das Fenster gilt ──────────────────────────────────────────────
def test_turniere_vor_dem_fenster_bleiben_draussen(mod, beleg_html, monkeypatch):
    gefunden = _lauf(mod, beleg_html, "16.09.2026", "25.09.2026", monkeypatch)
    ids = {t["tournament_id"] for t in gefunden}
    assert "568" not in ids, "Japan Championships 2026 (06.06.) liegt vor dem Fenster"
    assert "567" not in ids, "Korean League Final Season (24.05.) liegt vor dem Fenster"


# ── 3 · internationale Turniere gehoeren nicht in diesen Bestand ──────
def test_internationale_turniere_kommen_nie_mit(mod, beleg_html, monkeypatch):
    gefunden = _lauf(mod, beleg_html, "01.01.2024", "25.09.2026", monkeypatch)
    ids = {t["tournament_id"] for t in gefunden}
    assert "577" not in ids, (
        "Regional Baltimore (data-format=standard) darf nicht im "
        "japanischen Bestand landen — das waere ein anderes Meta")
    assert "606" not in ids, (
        "Indonesia Premier Ball League laeuft im internationalen "
        "Standard (gemessen 25.09.2026) und gehoert nicht hierher")


# ── 4 · jede Klasse wird benannt, keine wird zur City League ──────────
def test_jede_klasse_traegt_ihren_eigenen_namen(mod, beleg_html, monkeypatch):
    gefunden = _lauf(mod, beleg_html, "01.01.2024", "25.09.2026", monkeypatch)
    nach_id = {t["tournament_id"]: t["format"] for t in gefunden}
    assert nach_id.get("569") == "Champions League (JP)"
    assert nach_id.get("568") == "Japan Championships (JP)"
    assert nach_id.get("567") == "Korean League (JP)", (
        "ein koreanisches Turnier im japanischen Format ist keine "
        "Champions League und keine City League")
    assert "City League (JP)" not in set(nach_id.values()), (
        "kein Major darf als City League verbucht werden — sonst liest "
        "sich ein Top-8-Platz bei 10.000 Spielern wie ein Ladensieg")


# ── 5 · der Erkenner haengt nicht am Namen ────────────────────────────
def test_erkennung_haengt_am_format_nicht_am_namen(mod, beleg_html, monkeypatch):
    """Verfaelschungsprobe in die andere Richtung.

    Ein Turnier, dessen Name in KEINER Klassenliste steht, muss trotzdem
    gefunden werden — sonst haengt die Erkennung doch am Namen und das
    naechste neue japanische Turnierformat faellt wieder durch.
    """
    umbenannt = beleg_html.replace("Champions League Yokohama",
                                   "Voelligneues Turnierformat 2027")
    gefunden = _lauf(mod, umbenannt, "16.09.2026", "25.09.2026", monkeypatch)
    ids = [t["tournament_id"] for t in gefunden]
    assert ids == ["569"], (
        f"ohne bekannten Namen nicht mehr gefunden — die Erkennung "
        f"haengt am Namen statt am Format. Gefunden: {ids}")
    assert gefunden[0]["format"] == "Sonstiges (JP)", (
        "eine unbekannte Klasse muss sichtbar unbestimmt bleiben, nicht "
        "geraten werden")


# ── 6 · ein Merkmal darf wegfallen ────────────────────────────────────
@pytest.mark.parametrize("weg,name", [
    ('data-format="standard-jp"', "das data-Attribut am <tr>"),
    ('alt="standard-jp"', "der alt-Text am Formatbild"),
])
def test_ein_merkmal_reicht(mod, beleg_html, monkeypatch, weg, name):
    verstuemmelt = beleg_html.replace(weg, 'data-entfernt="probe"')
    gefunden = _lauf(mod, verstuemmelt, "16.09.2026", "25.09.2026", monkeypatch)
    ids = [t["tournament_id"] for t in gefunden]
    assert ids == ["569"], (
        f"faellt {name} weg, findet der Erkenner nichts mehr — er muss "
        f"mit einem der beiden Merkmale auskommen. Gefunden: {ids}")


# ── 7 · ohne Datum wird nicht geraten ─────────────────────────────────
def test_ohne_lesbares_datum_wird_uebersprungen(mod, beleg_html, monkeypatch):
    ohne = beleg_html.replace("<td>20 Sep 26</td>", "<td>irgendwann</td>")
    gefunden = _lauf(mod, ohne, "16.09.2026", "25.09.2026", monkeypatch)
    assert [t["tournament_id"] for t in gefunden] == [], (
        "ein Turnier ohne lesbares Datum muss ausfallen, nicht mit "
        "geratenem Datum ins Fenster rutschen")


# ── 8 · die Klasse landet wirklich in der Zeile ───────────────────────
def test_die_klasse_geht_in_die_csv_zeile(mod):
    """`format` in der Ergebniszeile kommt aus dem Turnier.

    Bis 25.09.2026 stand dort die feste Zeichenkette 'City League (JP)'.
    """
    quelle = open(QUELLE, encoding="utf-8-sig").read()
    ohne_kommentare = re.sub(r"(?m)^\s*#.*$", "", quelle)
    assert "tournament.get('format') or 'City League (JP)'" in ohne_kommentare, (
        "_scrape_single_tournament schreibt die Turnierklasse nicht mehr "
        "aus dem Turnier — ein Major wuerde als City League verbucht")
    assert not re.search(
        r"^\s*'format': 'City League \(JP\)',\s*$", ohne_kommentare, re.M), (
        "es steht wieder eine fest verdrahtete Klasse in einer Zeile")


# ── 9 · main() zieht sie wirklich mit ─────────────────────────────────
def test_main_zieht_die_majors_mit(mod):
    import ast
    quelle = open(QUELLE, encoding="utf-8-sig").read()
    baum = ast.parse(quelle)
    main = next((k for k in baum.body
                 if isinstance(k, ast.FunctionDef) and k.name == "main"), None)
    assert main is not None, "main() nicht gefunden"
    aufrufe = {getattr(k.func, "id", getattr(k.func, "attr", ""))
               for k in ast.walk(main) if isinstance(k, ast.Call)}
    assert "get_jp_major_tournaments" in aufrufe, (
        "main() ruft die Major-Suche nicht auf — der laufende japanische "
        "Reiter bleibt in der Saisonpause leer")


# ── 10 · beide Auswertungen stehen auf demselben Turnierbestand ────────
ANALYSE = os.path.join(WURZEL, "backend", "scrapers",
                       "city_league_analysis_scraper.py")


def test_kartenauswertung_steht_auf_demselben_bestand():
    """Archetypen und Karten muessen dieselben Turniere sehen.

    Am 21.08.2026 haben genau diese zwei Dateien wochenlang
    widersprochen: city_league_archetypes_past.csv hatte 73 Byte, die
    Kartenauswertung desselben Fensters 315 Zeilen. Zieht nur einer der
    beiden Scraper die japanischen Majors mit, entsteht derselbe
    Widerspruch von der anderen Seite.
    """
    quelle = open(ANALYSE, encoding="utf-8-sig").read()
    ohne_kommentare = re.sub(r"(?m)^\s*#.*$", "", quelle)
    assert "get_jp_major_tournaments" in ohne_kommentare, (
        "city_league_analysis_scraper zieht die japanischen Majors nicht "
        "mit — die Kartenauswertung wuerde ein anderes Fenster "
        "beschreiben als die Archetyp-Auswertung")
    assert len(ohne_kommentare) > len(quelle) * 0.3, (
        "das Ausschneiden der Kommentare hat zu viel entfernt")


def test_beide_haben_denselben_schalter():
    for pfad in (QUELLE, ANALYSE):
        quelle = open(pfad, encoding="utf-8-sig").read()
        assert "include_jp_majors" in quelle, (
            f"{os.path.basename(pfad)} kennt den Schalter "
            f"include_jp_majors nicht")


def test_schalter_steht_in_den_zentralen_einstellungen():
    import json
    pfad = os.path.join(WURZEL, "config", "scraper_settings.json")
    with open(pfad, encoding="utf-8-sig") as f:
        cfg = json.load(f)
    assert cfg["city_league_archetype"].get("include_jp_majors") is True
    assert (cfg["city_league_analysis"]["sources"]["city_league"]
            .get("include_jp_majors") is True)
