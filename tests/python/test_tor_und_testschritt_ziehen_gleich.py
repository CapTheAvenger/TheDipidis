"""Das Tor im Wochenlauf muss dieselbe Suite fahren koennen wie der Deploy.

BEFUND (22.09.2026, erster Lauf des Tors).

`weekly-full-update.yml` prueft seit heute beide Suiten, BEVOR es
pusht — die Antwort darauf, dass der Wochenlauf am selben Morgen die
Deploy-Kette angehalten hatte. Der allererste Lauf meldete:

    | Suite  | Ergebnis                          |
    | JS     | 6822 passed, 1 failed             |
    | Python | Rueckgabewert 2                   |

Rueckgabewert 2 heisst bei pytest: **beim Einsammeln abgebrochen**.
Kein einziger Fehlschlag, ein Importfehler. Der Grund stand im Tor
selbst:

    python3 -m pip install --quiet pytest beautifulsoup4

`deploy-pages.yml` installiert an derselben Stelle acht Pakete:

    pip install pytest beautifulsoup4 requests lxml
    pip install zxing-cpp segno Pillow PyYAML

Sechs davon fehlten. Damit haette das Tor **jeden** Wochenlauf
blockiert, unabhaengig von den Daten — ein Tor, das immer zu ist, ist
kein Tor, sondern ein Riegel. Und es haette genau das verhindert,
wofuer es gebaut wurde: frische Daten auszuliefern, wenn sie in
Ordnung sind.

WAS HIER GEPRUEFT WIRD

Nicht "acht bestimmte Pakete" — das waere wieder eine festgenagelte
Liste, die beim naechsten Zusatz umfaellt. Geprueft wird die BEZIEHUNG:
**was der Testschritt installiert, installiert das Tor auch.** Mehr
darf das Tor haben, weniger nicht. Wer `deploy-pages.yml` um ein Paket
ergaenzt und das Tor vergisst, faellt hier um — und zwar bevor der
naechste Dienstag kommt.
"""

import io
import os
import re

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
ABLAEUFE = os.path.join(WURZEL, ".github", "workflows")
DEPLOY = os.path.join(ABLAEUFE, "deploy-pages.yml")
WOCHENLAUF = os.path.join(ABLAEUFE, "weekly-full-update.yml")

# Zeilenfortsetzungen einsammeln: die Tor-Zeile ist auf drei Zeilen
# umbrochen, die Deploy-Zeilen sind es nicht. Wer nur Zeile fuer Zeile
# liest, sieht im Tor nur das erste Paket.
_FORTSETZUNG = re.compile(r"\\\s*\n\s*")
_PIP = re.compile(r"(?:python3?\s+-m\s+)?pip\s+install\s+([^\n]*)")
# Schalter wie --quiet oder -r zaehlen nicht als Paket.
_SCHALTER = re.compile(r"^-")


def _pakete(pfad, ab=None, bis=None):
    """Alle in pip-install-Zeilen genannten Pakete, klein geschrieben."""
    with io.open(pfad, encoding="utf-8") as f:
        text = f.read()
    if ab is not None:
        i = text.find(ab)
        assert i >= 0, f"{os.path.basename(pfad)}: '{ab}' nicht gefunden"
        text = text[i:]
    if bis is not None:
        j = text.find(bis)
        assert j >= 0, f"{os.path.basename(pfad)}: '{bis}' nicht gefunden"
        text = text[:j]
    text = _FORTSETZUNG.sub(" ", text)
    heraus = set()
    for treffer in _PIP.finditer(text):
        for wort in treffer.group(1).split():
            wort = wort.strip().strip("\"'")
            if not wort or _SCHATTEN(wort):
                continue
            heraus.add(wort.lower())
    return heraus


def _SCHATTEN(wort):
    """Kein Paketname: Schalter, Umleitungen, Dateiangaben."""
    if _SCHALTER.match(wort):
        return True
    if wort.startswith(">") or wort.startswith("2>") or wort.startswith("|"):
        return True
    if wort.endswith(".txt"):
        return True
    return False


def test_der_testschritt_und_das_tor_installieren_dasselbe():
    testschritt = _pakete(
        DEPLOY,
        ab="Install Python test dependencies",
        bis="Run Python unit tests")
    tor = _pakete(
        WOCHENLAUF,
        ab="Zusicherungen gegen die frischen Daten",
        bis="Frische Daten sichern")

    assert testschritt, (
        "im Testschritt von deploy-pages.yml steht keine pip-install-Zeile "
        "mehr — dann prueft diese Zusicherung ins Leere")
    assert tor, (
        "das Tor im Wochenlauf installiert gar nichts mehr. Ohne die Pakete "
        "bricht pytest beim Einsammeln ab (Rueckgabewert 2), und das Tor "
        "blockiert jeden Lauf, egal wie gut die Daten sind")

    fehlt = sorted(testschritt - tor)
    assert not fehlt, (
        f"das Tor im Wochenlauf installiert {fehlt} nicht, der Testschritt "
        f"in deploy-pages.yml aber schon. Dann faellt im Tor etwas aus, was "
        f"im Deploy laeuft — und der Wochenlauf haelt an, ohne dass an den "
        f"Daten etwas ist. Genau das ist am 22.09.2026 passiert.")


def test_das_tor_faehrt_beide_suiten_und_blockiert_wirklich():
    """Die Form des Tors, nicht seine Pakete.

    Ohne diese zweite Pruefung koennte jemand die pip-Zeile angleichen
    und gleichzeitig den Aufruf herausnehmen — die Zusicherung darueber
    bliebe gruen.
    """
    with io.open(WOCHENLAUF, encoding="utf-8") as f:
        y = f.read()
    tor = y.find("Zusicherungen gegen die frischen Daten")
    commit = y.find("- name: Commit + push")
    assert 0 < tor < commit, "das Tor steht nicht mehr vor dem Push"
    block = y[tor:commit]
    assert "run-js-unit-tests.sh" in block, "das Tor faehrt die JS-Suite nicht"
    assert "pytest tests/python" in block, "das Tor faehrt die Python-Suite nicht"
    assert "exit 1" in block, "das Tor meldet nur, es blockiert nicht"


def test_das_tor_zeigt_die_meldung_nicht_nur_den_dateinamen():
    """Sonst kostet jede Diagnose einen zweiten Lauf.

    Der erste Lauf am 22.09.2026 meldete `✗ test-tag2-grundgesamtheit.js
    — 1 failure(s)` und sonst nichts. Welche Zahl gegen welche Grenze
    gelaufen war, stand nur in einem Log, an das ohne Anmeldung niemand
    herankommt, und die frischen Daten lagen als 41-MB-Artefakt daneben.
    """
    with io.open(WOCHENLAUF, encoding="utf-8") as f:
        y = f.read()
    tor = y.find("Zusicherungen gegen die frischen Daten")
    commit = y.find("- name: Commit + push")
    block = y[tor:commit]
    assert "tail -n 120 /tmp/js.log" in block and "tail -n 120 /tmp/py.log" in block, (
        "das Tor legt die Logs nicht in die Zusammenfassung. Dann sieht man "
        "beim naechsten Zuschlagen wieder nur den Dateinamen und braucht "
        "einen zweiten Lauf, um zu erfahren, was eigentlich los war")
