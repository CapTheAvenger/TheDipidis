"""Die Proxy-URL-Karte ist ein Bestand, kein Abbild eines Laufs.

BEFUND (21.08.2026): scrape_pokemonproxies_urls.py schrieb das Ergebnis
des aktuellen Laufs als GANZE Karte — was diesmal nicht gefunden wurde,
war anschliessend weg. Dieselbe Bauart hat im selben Monat die
japanische Kartendatenbank von vier Sets auf eines zusammengestrichen
(M3, M4 und M5 verschwanden, 772 Zeilen blieben uebrig).

Dazu kam: beide Ausstiege — Netzfehler und "0 URLs gefunden" — gaben 0
zurueck. Ein Lauf, der nichts erreicht hat, sah von aussen aus wie
einer, der nichts zu tun hatte.

Der Test misst Verhalten an einer Wegwerf-Datei: Bestand vorher, Lauf,
Bestand nachher.
"""

import importlib.util
import json
import os
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
QUELLE = os.path.join(WURZEL, "backend", "scrapers", "scrape_pokemonproxies_urls.py")


@pytest.fixture()
def proxy(tmp_path):
    sys.path.insert(0, os.path.join(WURZEL, "backend", "core"))
    spec = importlib.util.spec_from_file_location("pp_test", QUELLE)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    m.OUTPUT_PATH = str(tmp_path / "pokemonproxies_url_map.json")
    bestand = {f"M5_{i:03d}": f"https://alt/{i}.png" for i in range(100)}
    m.write_map(m.OUTPUT_PATH, bestand)
    return m


def _karte(m):
    with open(m.OUTPUT_PATH, encoding="utf-8") as f:
        return json.load(f)["urls"]


def test_teilergebnis_ueberschreibt_den_bestand_nicht(proxy, capsys):
    proxy.run_scrape = lambda debug=False: {
        f"M6_{i:03d}": f"https://neu/{i}.png" for i in range(50)}
    rc = proxy.main(["x"])
    ausgabe = capsys.readouterr().out
    assert rc == 1
    assert "::error::" in ausgabe and "80" in ausgabe
    assert len(_karte(proxy)) == 100, "der Bestand wurde angetastet"


def test_gesunder_lauf_legt_zusammen(proxy):
    alt = _karte(proxy)
    neu = {k: v for k, v in list(alt.items())[:90]}
    neu.update({f"M6_{i:03d}": f"https://neu/{i}.png" for i in range(10)})
    proxy.run_scrape = lambda debug=False: neu
    rc = proxy.main(["x"])
    danach = _karte(proxy)
    assert rc == 0
    assert len(danach) == 110, "neue Eintraege kommen dazu, alte bleiben"
    assert "M5_099" in danach, "ein diesmal nicht gefundener Eintrag wurde geloescht"
    assert danach["M6_000"] == "https://neu/0.png"


def test_geaenderte_url_gewinnt(proxy):
    alt = dict(_karte(proxy))
    alt["M5_000"] = "https://neu/hash.png"
    proxy.run_scrape = lambda debug=False: alt
    proxy.main(["x"])
    assert _karte(proxy)["M5_000"] == "https://neu/hash.png"


def test_netzausfall_meldet_sich_und_laesst_die_karte_stehen(proxy, capsys):
    def kaputt(debug=False):
        raise RuntimeError("kein Netz")
    proxy.run_scrape = kaputt
    rc = proxy.main(["x"])
    assert rc == 1
    assert len(_karte(proxy)) == 100


def test_null_treffer_ist_ein_fehler(proxy, capsys):
    proxy.run_scrape = lambda debug=False: {}
    rc = proxy.main(["x"])
    ausgabe = capsys.readouterr().out
    assert rc == 1
    assert "::error::" in ausgabe
    assert len(_karte(proxy)) == 100
