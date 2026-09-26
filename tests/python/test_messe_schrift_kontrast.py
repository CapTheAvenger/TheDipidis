"""WZ-1: das Kontrast-Messwerkzeug rechnet richtig — ohne Browser gepruef.

Die Messung selbst laeuft in Chromium (scripts/messe_schrift_kontrast.py);
hier werden die drei Teile geprueft, auf denen jede Zahl beruht:
WCAG-Kontrast, Farbangabe lesen, Hintergrund aus dem Bildschirmfoto.
Der dritte Teil traegt den Befund vom 26.09.2026: auf einem Farbverlauf
war die haeufigste EXAKTE Farbe eine 1-px-Trennlinie.
"""
import importlib.util
import os

import pytest

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@pytest.fixture(scope="module")
def mod():
    spec = importlib.util.spec_from_file_location(
        "messe", os.path.join(WURZEL, "scripts", "messe_schrift_kontrast.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_wcag_kontrast(mod):
    assert round(mod.kontrast((0, 0, 0), (255, 255, 255)), 2) == 21.0
    assert round(mod.kontrast((255, 255, 255), (255, 255, 255)), 2) == 1.0
    # #6b21a8 auf #111730 — der Befund aus UI-1
    assert round(mod.kontrast((0x6b, 0x21, 0xa8), (0x11, 0x17, 0x30)), 2) == 2.03


def test_farbe_lesen(mod):
    assert mod.rgba("rgb(1, 2, 3)") == (1, 2, 3, 1.0)
    assert mod.rgba("rgba(1, 2, 3, 0.5)") == (1, 2, 3, 0.5)


def test_hintergrund_auf_verlauf_ist_nicht_die_trennlinie(mod):
    Image = pytest.importorskip("PIL.Image")
    # 40 x 12 — so klein, dass das Werkzeug nicht verkleinert; jedes Pixel
    # des Verlaufs hat eine eigene Farbe, die Trennlinie 40-mal dieselbe.
    bild = Image.new("RGB", (40, 12))
    for x in range(40):
        for y in range(12):
            bild.putpixel((x, y), (70 + x, 60 + y, 200 - x))
    for x in range(40):
        bild.putpixel((x, 6), (255, 255, 255))
    bg = mod.hintergrund(bild, {"x": 0, "y": 0, "b": 40, "h": 12})
    assert bg != (255, 255, 255), "die Trennlinie wurde als Hintergrund gemessen"
    assert bg[2] > 150 and bg[0] < 120, bg
