"""Gemeinsame Vorkehrung fuer alle Python-Tests dieses Ordners.

DIE ABLAUFUMGEBUNG IST NICHT DIE DES TESTS (29.09.2026)
------------------------------------------------------
Das Tor im Wochenlauf faehrt diese Suite INNERHALB des echten Ablaufs. Die
Umgebung traegt dort GITHUB_ENV, GITHUB_OUTPUT und GITHUB_STEP_SUMMARY —
Dateien, aus denen GitHub nach dem Schritt Umgebungsvariablen, Ausgaben und
die Zusammenfassung des ECHTEN Laufs liest. Mehrere Tests fuehren Schritte
aus den Ablaeufen aus und reichen `os.environ` durch.

Wochenlauf #170 (29.09.2026) wurde so rot, obwohl alles gruen war: das Tor
lief, test_wochenlauf_bilanz.py spielte die Bilanz mit zwei erfundenen
FAIL-Zeilen durch, und die Bilanz schrieb "WEEKLY_FAIL_REASON=2 nicht
blockierende Schritte gescheitert" in die GITHUB_ENV des echten Laufs. Der
letzte Schritt las sie und faerbte den Lauf rot — Daten gepusht, Deploy
angestossen, trotzdem ein rotes X und eine Fehlermail.

Deshalb zeigen diese Variablen fuer jeden Test auf eigene Wegwerfdateien,
sofern sie gesetzt sind (lokal sind sie es nicht; dort aendert sich nichts).
tests/python/test_ablaufumgebung_abgeschirmt.py faehrt die Tests, die
Ablaufschritte ausfuehren, als eigenen pytest-Lauf mit gesetzten Dateien
und prueft, dass sie leer bleiben.
"""
import pytest

ABLAUF_DATEIEN = ("GITHUB_ENV", "GITHUB_OUTPUT", "GITHUB_STEP_SUMMARY",
                  "GITHUB_PATH", "GITHUB_STATE")


@pytest.fixture(autouse=True)
def _ablaufumgebung_abschirmen(tmp_path_factory, monkeypatch):
    import os
    gesetzt = [n for n in ABLAUF_DATEIEN if os.environ.get(n)]
    if gesetzt:
        ordner = tmp_path_factory.mktemp("ablaufumgebung")
        for name in gesetzt:
            datei = ordner / name.lower()
            datei.write_text("", encoding="utf-8")
            monkeypatch.setenv(name, str(datei))
    yield
