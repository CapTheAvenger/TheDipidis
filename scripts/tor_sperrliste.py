"""Welche rote Zusicherung haelt einen Datenlauf an? (SC-50, 09.11.2026)

ENTSCHEIDUNG HAUSI (09.11.2026, nach Wochenlauf #200): „Feste Sperrliste".
Nur eine benannte Liste echter Schadenspruefungen sperrt den Push. Jede
andere rote Zusicherung ist ein TOR-BEFUND: die Daten gehen trotzdem raus,
der Befund steht als Warnung im Lauf, und steht er zwei Laeufe in Folge,
wird der Data Guardian rot (WZ-48, scripts/zurueckgehalten.py).

WARUM. Das Fehlerbuch (`claude/scraper-fehlerbuch.md`) zaehlte vom 07.10.
bis 09.11.2026 16 Vorfaelle und 24 Scraper-PRs. Acht davon hatten dieselbe
Bauart: die Quelle aenderte sich (neue Pokemon-Form, neue Saison, neue
Attacke, Tippfehler bei Labs, unfertiges Turnier, neue Decks, Turnier
ohne Listen, neues Set), eine Zusicherung las das als Fehler, und das Tor
hielt die ganze Datenfamilie an — oft tagelang, im Wochenlauf #200 alles.
Zusicherungen, die "so sieht die Welt heute aus" pruefen, sind als
Meldung wertvoll und als Sperre schaedlich.

WAS SPERRT (bewusst kurz — wer etwas hinzufuegt, schreibt den Schaden dazu,
den ein Durchlassen anrichten wuerde):
  * eine rote Zusicherung aus SPERRLISTE;
  * jedes Rot, das sich keiner Zusicherung zuordnen laesst (Absturz,
    Fehler beim Einsammeln, gestorbener Prozess) — unbekannt heisst sperren;
  * unveraendert daneben: der Schrumpf-Waechter (STOPP), die GitHub-
    Dateigrenze und der Frische-/Sanity-Riegel; die laufen vor dem Tor.

Aufruf (aus scripts/tor_vor_dem_push.sh):
    python3 scripts/tor_sperrliste.py einordnen <protokollordner> <ausgabeordner>
Rueckgabewert 0: nichts Sperrendes (nur Befunde oder gar nichts rot).
Rueckgabewert 1: es sperrt. <ausgabe>/<suite>.log enthaelt dann NUR die
sperrenden Zeilen im Format der Suiten — die Rueckroll-Suche bekommt diesen
Ordner, damit sie nicht wegen eines Befunds zurueckrollt.
<ausgabe>/befunde.txt: eine Zeile je nicht sperrendem Befund.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tor_rollback  # noqa: E402

# Datei -> der Schaden, wenn sie rot ist und trotzdem gepusht wuerde.
SPERRLISTE = {
    "tests/python/test_consumers_vertrag_deckt_sich.py":
        "die Seite laedt eine Datei, die es nicht gibt oder der Spalten fehlen "
        "(Wochenlauf #200: format_window TEF-DLR ohne online_api_*_TEF-DLR.csv)",
    "tests/python/test_data_integrity.py":
        "Turniere im falschen Format, Phantom-Auszuege (Melbourne 23.05.2026)",
    "tests/python/test_ein_turnier_einmal.py":
        "ein Turnier doppelt gezaehlt — jede Quote daraus ist falsch (Yokohama 25.09.2026)",
    "tests/python/test_format_fenster_gleichlauf.py":
        "drei Dateien nennen drei verschiedene Formatgrenzen (21.08.2026)",
    "tests/unit/test-formatfenster-vollstaendig.js":
        "das Formatfenster kommt nicht vollstaendig in der Oberflaeche an (16.09.2026)",
    "tests/python/test_daten_lesbar.py":
        "eine Datei unter data/ laesst sich nicht parsen — die Seite wirft bei fetch().json(), "
        "die Ansicht bleibt leer (Pruefagent S5, 09.11.2026)",
    "tests/unit/test-sc45-auszuege-je-format.js":
        "der Deck-Builder findet die Decklisten-Auszuege des laufenden Formats nicht (SC-45)",
}


def datei_von(zusicherung: str) -> str:
    """'tests/python/x.py::test_y' -> 'tests/python/x.py'; JS bleibt die Datei."""
    return zusicherung.split("::", 1)[0]


PY_SCHLUSS = re.compile(r"\b(\d+) (?:passed|failed|error|errors|skipped)\b")
PY_FAILED = re.compile(r"\b(\d+) failed\b")
JS_SCHLUSS = re.compile(r"JS unit tests: \d+ passed, \d+ failed")


def suiten_pruefung(ordner: str) -> list:
    """Rot, das sich nicht EINZELNEN Zusicherungen zuordnen laesst (B1 des
    Pruefagenten, 09.11.2026): vor SC-50 sperrte so etwas, weil die
    Rueckroll-Suche aufgab; mit der Sperrliste haette ein gestorbenes
    pytest (os._exit, INTERNALERROR, fehlendes Modul, OOM) das Tor
    GEOEFFNET. Jetzt zaehlt je Suite der Rueckgabewert (<name>.rc, vom Tor
    geschrieben) gegen das Protokoll:
      * Rueckgabewert != 0, aber keine benannte Zusicherung im Protokoll;
      * pytest mit einem anderen Rueckgabewert als 0/1 (2 Abbruch,
        3 interner Fehler, 4 Aufruf, 5 nichts gesammelt, >5 Signal);
      * keine Schlusszeile (pytest "N passed/failed", JS "JS unit tests:");
      * pytest "N failed" ungleich der Zahl der FAILED-Zeilen.
    """
    raus = []
    for name in sorted(os.listdir(ordner)):
        if not name.endswith(".log"):
            continue
        rc_pfad = os.path.join(ordner, name[:-4] + ".rc")
        if not os.path.exists(rc_pfad):
            continue
        try:
            rc = int(open(rc_pfad).read().strip() or "0")
        except ValueError:
            raus.append(f"{name}: Rueckgabewert unlesbar")
            continue
        if rc == 0:
            continue
        text = open(os.path.join(ordner, name), encoding="utf-8", errors="replace").read()
        failed_zeilen = re.findall(r"^FAILED \S", text, re.M)
        js_zeilen = re.findall(r"^✗ \S+ —", text, re.M)
        if name.startswith("py"):
            if rc != 1:
                raus.append(f"{name}: pytest endete mit {rc} (Abbruch, kein Testergebnis)")
                continue
            schluss = [z for z in text.splitlines()[-15:] if PY_SCHLUSS.search(z)]
            if not schluss:
                raus.append(f"{name}: Rueckgabewert {rc}, aber keine Schlusszeile")
                continue
            m = PY_FAILED.search(schluss[-1])
            n_failed = int(m.group(1)) if m else 0
            if n_failed != len(failed_zeilen):
                raus.append(f"{name}: {n_failed} failed gemeldet, {len(failed_zeilen)} benannt")
        else:
            m = None
            for z in text.splitlines()[-15:]:
                m = JS_SCHLUSS.search(z) or m
            if not m:
                raus.append(f"{name}: Rueckgabewert {rc}, aber keine Schlusszeile")
                continue
            if not js_zeilen:
                raus.append(f"{name}: Rueckgabewert {rc}, aber keine Zusicherung benannt")
    return raus


def einordnen(ordner: str):
    """-> (sperrend, befunde, unlesbar) aus den Suite-Protokollen in `ordner`."""
    py, js, unlesbar = tor_rollback.rote_zusicherungen(ordner)
    unlesbar = list(unlesbar) + suiten_pruefung(ordner)
    sperrend, befunde = [], []
    for z in py + js:
        (sperrend if datei_von(z) in SPERRLISTE else befunde).append(z)
    return sperrend, befunde, unlesbar


def schreibe(ausgabe: str, ordner: str, sperrend, befunde, unlesbar):
    """Je Suite-Protokoll eine gleichnamige Datei mit NUR den sperrenden
    Zeilen, im Format, das tor_rollback.rote_zusicherungen liest — sonst
    rollte die Suche auch fuer Befunde zurueck. Gleichnamig, weil die Suche
    am Namen erkennt, ob die Nebenbereiche gefahren wurden
    (tor_rollback.bereich_aus_protokollen)."""
    os.makedirs(ausgabe, exist_ok=True)
    gesperrt = set(sperrend)
    for name in sorted(os.listdir(ordner)):
        if not name.endswith(".log"):
            continue
        with open(os.path.join(ordner, name), encoding="utf-8", errors="replace") as f:
            text = f.read()
        zeilen = []
        for zeile in text.splitlines():
            if zeile.startswith("FAILED "):
                z = zeile[len("FAILED "):].split(" - ", 1)[0]
                if z in gesperrt:
                    zeilen.append(zeile)
            elif zeile.startswith("✗ "):
                z = zeile[2:].split(" —", 1)[0]
                if z in gesperrt:
                    zeilen.append(zeile)
        with open(os.path.join(ausgabe, name), "w", encoding="utf-8") as f:
            f.write("".join(z + "\n" for z in zeilen))
    with open(os.path.join(ausgabe, "befunde.txt"), "w", encoding="utf-8") as f:
        f.write("".join(z + "\n" for z in befunde))


def main(argv):
    if len(argv) != 3 or argv[0] != "einordnen":
        print("Aufruf: tor_sperrliste.py einordnen <protokolle> <ausgabe>", file=sys.stderr)
        return 2
    ordner, ausgabe = argv[1], argv[2]
    sperrend, befunde, unlesbar = einordnen(ordner)
    schreibe(ausgabe, ordner, sperrend, befunde, unlesbar)
    for z in unlesbar:
        print(f"SPERREND (nicht zuordenbar): {z}")
    for z in sperrend:
        print(f"SPERREND: {z} — {SPERRLISTE[datei_von(z)]}")
    for z in befunde:
        print(f"Befund (nicht sperrend): {z}")
    return 1 if (sperrend or unlesbar) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
