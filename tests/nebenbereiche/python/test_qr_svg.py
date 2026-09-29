# -*- coding: utf-8 -*-
"""DER EIGENE QR-ERZEUGER GEGEN EINEN ECHTEN LESER

Der Reiter "Pocket" zeichnet das 2D-Muster selbst (js/qr-svg.js) und
zeigt nicht Game8s Bild. Ob das Ergebnis SCANNBAR ist, kann keine
Rechnung im selben Modul beantworten — dafür braucht es einen fremden
Leser. Hier ist es zxing-cpp, dieselbe Bibliothek, mit der die Codes
ursprünglich aus Game8s Mustern gelesen wurden.

WAS DIESE DATEI ZUSÄTZLICH ZU tests/unit/test-qr-svg.js LEISTET
---------------------------------------------------------------
Die JS-Datei prüft Struktur: Version, Suchmuster, Taktspur,
Ausrichtungsmuster, Formatinformation, Rückweg des Datenstroms. Sie
prüft uns gegen uns selbst. Erst hier kommt eine fremde Instanz dazu.

Am 07.09.2026 hat genau dieser Unterschied zwei Fehler getrennt, die
beide „rechnerisch in Ordnung" aussahen: die bitverkehrte
Formatinformation, und ausgefallene Ausrichtungsmuster bei Version 8
und 9. Beide ergaben ein sauber aufgebautes Raster, das kein Leser
annimmt.

WARUM DAS HIER IN PYTHON STEHT
------------------------------
zxing-cpp und Pillow gibt es nur auf der Python-Seite. Der Testschritt
in deploy-pages.yml richtet Node.js VOR dem Python-Schritt ein, beide
laufen im selben Job — `node` ist hier also da.
"""

import json
import os
import shutil
import subprocess

import pytest

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
MODUL = os.path.join(WURZEL, "js", "qr-svg.js")
# Die echten, in Pocket gescannten Game8-Codes, eingefroren am 29.09.2026.
DATEN = os.path.join(WURZEL, "tests", "fixtures", "pocket_game8_decks.json")

# Gemessen am 07.09.2026 mit segno über alle 33 Codes, Byte-Modus, ohne
# Aufwertung der Stufe.
ERWARTETE_VERSION = {"L": 5, "M": 6, "Q": 8, "H": 9}


def _noetig():
    """Ohne Node oder ohne die QR-Bibliotheken kann hier nichts geprüft werden.

    Übersprungen zu werden ist die ZWEITBESTE Lösung — deshalb hält
    `test_der_testschritt_installiert_die_qr_bibliotheken` in
    test_pocket_limitless.py fest, dass der Ablauf sie installiert.
    """
    if not shutil.which("node"):
        pytest.skip("node fehlt — der JS-Erzeuger lässt sich nicht ausführen")
    try:
        import zxingcpp  # noqa: F401
        from PIL import Image  # noqa: F401
    except ImportError as e:
        pytest.skip(f"QR-Bibliothek fehlt: {e}")


def _raster(codes, stufe):
    """Die Modulmatrizen aus dem ECHTEN Modul holen, über node."""
    skript = (
        "const qr=require(process.argv[1]);"
        "const codes=JSON.parse(process.argv[2]);"
        "const stufe=process.argv[3];"
        "console.log(JSON.stringify(codes.map(c=>qr.matrix(c,stufe))"
        ".map(m=>({v:m.version,mod:m.module}))));"
    )
    aus = subprocess.run(
        ["node", "-e", skript, MODUL, json.dumps(codes), stufe],
        capture_output=True, text=True, timeout=120)
    assert aus.returncode == 0, f"node brach ab: {aus.stderr[:400]}"
    return json.loads(aus.stdout)


def _bild(module, kachel=6, rand=4):
    from PIL import Image
    n = len(module)
    breite = (n + 2 * rand) * kachel
    bild = Image.new("L", (breite, breite), 255)
    px = bild.load()
    for y in range(n):
        for x in range(n):
            if module[y][x]:
                for dy in range(kachel):
                    for dx in range(kachel):
                        px[(x + rand) * kachel + dx, (y + rand) * kachel + dy] = 0
    return bild


def _lies(bild):
    import zxingcpp
    treffer = zxingcpp.read_barcodes(bild)
    return treffer[0].text if treffer else None


@pytest.fixture(scope="module")
def codes():
    with open(DATEN, encoding="utf-8") as f:
        return [d["code"] for d in json.load(f)["decks"]]


@pytest.mark.parametrize("stufe", ["L", "M", "Q", "H"])
def test_ein_fremder_leser_nimmt_unser_muster_an(codes, stufe):
    """Alle ausgelieferten Codes, alle vier Fehlerkorrekturstufen.

    Q und H sind hier nicht Zierde: sie ergeben Version 8 und 9, und
    nur dort gibt es Ausrichtungsmuster, deren Mittelpunkt auf der
    Taktspur liegt. Der Fehler vom 07.09.2026 war bei L und M
    unsichtbar und schlug erst hier durch.
    """
    _noetig()
    assert len(codes) >= 30, f"nur {len(codes)} Codes in der Datei"
    raster = _raster(codes, stufe)
    fehler = []
    for i, (soll, eintrag) in enumerate(zip(codes, raster)):
        assert eintrag["v"] == ERWARTETE_VERSION[stufe], (
            f"Code #{i} bei Stufe {stufe}: Version {eintrag['v']} statt "
            f"{ERWARTETE_VERSION[stufe]}")
        gelesen = _lies(_bild(eintrag["mod"]))
        if gelesen != soll:
            fehler.append(f"#{i}: {'nichts gelesen' if gelesen is None else 'anderer Inhalt'}")
    assert not fehler, (
        f"Stufe {stufe}: {len(fehler)} von {len(codes)} Mustern sind nicht "
        f"lesbar — {', '.join(fehler[:5])}")


def test_der_leser_wuerde_ein_kaputtes_muster_auch_ablehnen(codes):
    """Die Gegenprobe. Sonst prüft der Test oben nur, dass zxing nie meckert.

    Ein einziges umgedrehtes Modul im Datenbereich reicht der
    Fehlerkorrektur noch nicht; hier wird deshalb ein ganzer Streifen
    gekippt.
    """
    _noetig()
    raster = _raster(codes[:1], "M")[0]
    module = [zeile[:] for zeile in raster["mod"]]
    n = len(module)
    for y in range(10, 30):
        for x in range(10, 30):
            module[y][x] ^= 1
    assert _lies(_bild(module)) != codes[0], (
        "ein Muster mit 400 gekippten Modulen wurde trotzdem als der "
        "richtige Inhalt gelesen — dann misst dieser Test nicht, was er "
        "behauptet")
    assert n == 41


def test_die_ruhezone_steht_im_bild(codes):
    """Vier Module Ruhezone, wie die Norm sie verlangt.

    GEMESSEN am 07.09.2026, und das Ergebnis widerlegt die naheliegende
    Behauptung: zxing-cpp liest unser Muster AUCH GANZ OHNE Ruhezone.
    Dieser Test kann also NICHT zeigen, dass die Ruhezone gebraucht
    wird — er zeigt nur, dass sie da ist. Ein Handyscanner in
    schlechtem Licht ist nicht zxing-cpp auf einem sauberen Bild;
    weggelassen wird sie deshalb trotzdem nicht.
    """
    _noetig()
    raster = _raster(codes[:1], "M")[0]
    assert _lies(_bild(raster["mod"], rand=4)) == codes[0]


def test_das_svg_traegt_dieselben_module_wie_das_raster(codes):
    """Zwischen Rechnung und Bild darf nichts verlorengehen."""
    _noetig()
    skript = (
        "const qr=require(process.argv[1]);"
        "const c=process.argv[2];"
        "const m=qr.matrix(c,'M');"
        "console.log(JSON.stringify({svg:qr.svg(c,{stufe:'M'}),"
        "dunkel:m.module.flat().filter(Boolean).length,n:m.groesse}));"
    )
    aus = subprocess.run(["node", "-e", skript, MODUL, codes[0]],
                         capture_output=True, text=True, timeout=60)
    assert aus.returncode == 0, aus.stderr[:400]
    d = json.loads(aus.stdout)
    import re
    summe = sum(int(t) for t in re.findall(r"h(\d+)v1", d["svg"]))
    assert summe == d["dunkel"], (
        f"das SVG zeichnet {summe} Module, das Raster hat {d['dunkel']} dunkle")
    assert f'viewBox="0 0 {d["n"] + 8} {d["n"] + 8}"' in d["svg"], (
        "die Ruhezone von vier Modulen fehlt im viewBox")
