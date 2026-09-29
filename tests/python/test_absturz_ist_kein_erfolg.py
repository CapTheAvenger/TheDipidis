"""Ein Scraper, der abstuerzt, meldet das mit einem Rueckgabewert.

BEFUND (29.09.2026, Pruefung des Wochenlaufs). Vier Scraper im Schritt
"Run scrapers" von weekly-full-update.yml fingen jede Ausnahme in ihrem
`__main__`-Block, schrieben sie ins Protokoll — und endeten mit Code 0.
Gemessen mit einer Attrappe, die am Anfang von main() eine Ausnahme wirft:
alle vier lieferten 0. Der Wochenlauf zaehlte den Absturz als OK, im
Herzschlag stand OK, und die Liste der kritischen Scraper (Z. ~373) griff
fuer current_meta_analysis_scraper und limitless_online_scraper nie.

Diese Zusicherung fuehrt den ECHTEN `__main__`-Block jedes Scrapers aus,
mit einem main(), das abstuerzt, und verlangt SystemExit mit Code != 0.
"""
import ast
import os
import sys
import types

import pytest

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCRAPER = [
    "backend/scrapers/current_meta_analysis_scraper.py",
    "backend/scrapers/limitless_online_scraper.py",
    "backend/scrapers/tournament_scraper_JH.py",
    "backend/scrapers/city_league_analysis_scraper.py",
]


def _main_block(pfad):
    with open(os.path.join(WURZEL, pfad), encoding="utf-8-sig") as f:
        baum = ast.parse(f.read())
    for knoten in baum.body:
        if (isinstance(knoten, ast.If) and isinstance(knoten.test, ast.Compare)
                and getattr(knoten.test.left, "id", "") == "__name__"):
            return ast.Module(body=knoten.body, type_ignores=[])
    raise AssertionError(f"{pfad}: kein __main__-Block")


@pytest.mark.parametrize("pfad", SCRAPER)
def test_ein_absturz_endet_nicht_mit_code_null(pfad, capsys):
    block = _main_block(pfad)

    def main():
        raise RuntimeError("Attrappe: Quelle nicht erreichbar")

    logger = types.SimpleNamespace(
        critical=lambda *a, **k: None, error=lambda *a, **k: None,
        warning=lambda *a, **k: None, info=lambda *a, **k: None)
    umgebung = {"main": main, "logger": logger, "sys": sys, "__name__": "__main__"}
    with pytest.raises(SystemExit) as ende:
        exec(compile(block, pfad, "exec"), umgebung)
    assert ende.value.code not in (0, None), (
        f"{pfad}: nach einem Absturz endet der Scraper mit Code {ende.value.code!r} "
        "— der Wochenlauf zaehlt das als Erfolg")


@pytest.mark.parametrize("pfad", SCRAPER)
def test_ein_normaler_lauf_endet_ohne_fehlercode(pfad, capsys):
    """Die Gegenprobe: ein main(), das durchlaeuft, darf nicht rot werden."""
    block = _main_block(pfad)
    umgebung = {"main": lambda: None, "logger": None, "sys": sys, "__name__": "__main__"}
    try:
        exec(compile(block, pfad, "exec"), umgebung)
    except SystemExit as e:
        assert e.code in (0, None), f"{pfad}: ein fehlerfreier Lauf endet mit {e.code!r}"
