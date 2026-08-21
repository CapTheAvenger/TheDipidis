"""Ein Scraper, der abstuerzt, muss das nach aussen sagen.

BEFUND (21.08.2026): drei Skripte fingen im `if __name__ == "__main__"`
jede Exception ab, schrieben sie ins Log und endeten mit Rueckgabewert 0.
Der Wochenlauf wertet Rueckgabewerte aus — sein Kritisch-Regex konnte
fuer genau diese Skripte also nie ausloesen. all_cards_scraper.py und
japanese_cards_scraper.py stehen in der Liste der kritischen Schritte;
beide hatten keinen Weg, kritisch zu werden.

Der Test prueft das an der Struktur, nicht am Text: er parst die Datei,
sucht den Rahmen `if __name__ == "__main__"`, und verlangt, dass jeder
`except Exception`-Zweig darin ein `sys.exit` mit einem Wert ungleich 0
enthaelt. Ein spaeteres Umformulieren des Kommentars faellt damit nicht
auf die Nase, ein entferntes `sys.exit(1)` schon.
"""

import ast
import os
import re

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))

DATEIEN = [
    os.path.join("backend", "core", "prepare_card_data.py"),
    os.path.join("backend", "scrapers", "all_cards_scraper.py"),
    os.path.join("backend", "scrapers", "japanese_cards_scraper.py"),
    os.path.join("backend", "scrapers", "city_league_past_archetype_scraper.py"),
    os.path.join("backend", "scrapers", "city_league_archetype_scraper.py"),
]


def _baum(pfad):
    with open(pfad, encoding="utf-8-sig") as f:
        return ast.parse(f.read())


def _hauptblock(baum):
    """Der Rumpf von `if __name__ == "__main__":`, oder None."""
    for knoten in baum.body:
        if not isinstance(knoten, ast.If):
            continue
        quelle = ast.dump(knoten.test)
        if "__name__" in quelle and "__main__" in quelle:
            return knoten.body
    return None


def _gerufene_namen(rumpf):
    """Namen der Funktionen, die der __main__-Block direkt aufruft."""
    namen = set()
    for knoten in ast.walk(ast.Module(body=rumpf, type_ignores=[])):
        if isinstance(knoten, ast.Call) and isinstance(knoten.func, ast.Name):
            namen.add(knoten.func.id)
    return namen


def _einstiegsrahmen(baum):
    """Alle try/except-Rahmen, die einen Absturz des Programms abfangen:
    der __main__-Block selbst und die Funktionen, die er ruft.

    Ohne den zweiten Teil geht der Test daneben, wo das try/except in
    main() steht statt im __main__-Block — genau der Fall von
    all_cards_scraper.py.
    """
    rumpf = _hauptblock(baum)
    if rumpf is None:
        return None
    rahmen = [k for k in rumpf if isinstance(k, ast.Try)]
    gerufen = _gerufene_namen(rumpf)
    for knoten in baum.body:
        if isinstance(knoten, ast.FunctionDef) and knoten.name in gerufen:
            rahmen += [k for k in knoten.body if isinstance(k, ast.Try)]
    return rahmen


def _exit_werte(zweig):
    """Alle Werte, mit denen in `zweig` sys.exit(...) gerufen wird."""
    werte = []
    for knoten in ast.walk(ast.Module(body=zweig, type_ignores=[])):
        if not isinstance(knoten, ast.Call):
            continue
        ziel = knoten.func
        name = ""
        if isinstance(ziel, ast.Attribute):
            name = ziel.attr
            if isinstance(ziel.value, ast.Name):
                name = f"{ziel.value.id}.{ziel.attr}"
        elif isinstance(ziel, ast.Name):
            name = ziel.id
        if name in ("sys.exit", "exit"):
            if knoten.args:
                arg = knoten.args[0]
                if isinstance(arg, ast.Constant):
                    werte.append(arg.value)
                else:
                    werte.append("dynamisch")
            else:
                werte.append(None)
    return werte


@pytest.mark.parametrize("rel", DATEIEN)
def test_except_zweig_endet_mit_exit_ungleich_null(rel):
    pfad = os.path.join(WURZEL, rel)
    assert os.path.isfile(pfad), f"{rel} fehlt"
    versuche = _einstiegsrahmen(_baum(pfad))
    assert versuche is not None, f"{rel}: kein __main__-Block gefunden"

    if not versuche:
        # Kein try/except im Einstieg heisst: eine Exception schlaegt
        # ohnehin durch und der Rueckgabewert ist ungleich 0. Auch gut.
        return

    gesehen = 0
    for versuch in versuche:
        for handler in versuch.handlers:
            if not isinstance(handler.type, ast.Name) or handler.type.id != "Exception":
                continue
            gesehen += 1
            werte = _exit_werte(handler.body)
            assert werte, (
                f"{rel}: der except-Exception-Zweig im __main__-Block endet "
                f"ohne sys.exit — ein Absturz sieht von aussen wie Erfolg aus."
            )
            assert all(w not in (0, None) for w in werte), (
                f"{rel}: sys.exit{werte} im except-Zweig — ein Absturz darf "
                f"nicht mit 0 enden."
            )
    assert gesehen, (
        f"{rel}: kein `except Exception` im Einstieg gefunden — dann muss "
        f"eine Ausnahme durchschlagen; sollte sich das geaendert haben, "
        f"gehoert dieser Test angepasst."
    )


def test_kritisch_regex_kennt_die_beiden_scraper():
    """Der Rueckgabewert nuetzt nur, wenn der Wochenlauf ihn auch liest."""
    pfad = os.path.join(WURZEL, ".github", "workflows", "weekly-full-update.yml")
    with open(pfad, encoding="utf-8") as f:
        inhalt = f.read()
    treffer = re.search(r"grep -E '\^FAIL \((?P<liste>[^)]*)\)'", inhalt)
    assert treffer, "Kritisch-Regex im Wochenlauf nicht gefunden"
    kritisch = set(treffer.group("liste").split("|"))
    for erwartet in (
        "core/update_sets",
        "core/prepare_card_data",
        "scrapers/all_cards_scraper",
        "scrapers/japanese_cards_scraper",
        "scrapers/current_meta_analysis_scraper",
        "scrapers/limitless_online_scraper",
    ):
        assert erwartet in kritisch, (
            f"{erwartet} fehlt im Kritisch-Regex — ein Ausfall dieses "
            f"Schritts loest keine Benachrichtigung aus.")
