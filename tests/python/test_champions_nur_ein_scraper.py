"""Die Champions-Teams werden an genau einer Stelle gescraped.

Bis zum 25.08.2026 liefen zwei Laeufe auf dieselbe Datei:

    champions-replica-scrape.yml   taeglich 04:00 UTC   --top 40
    weekly-full-update.yml         Di+Fr    06:00 UTC   --top 20

Der Wochenlauf kam Stunden nach dem Tageslauf und schrieb ein
schmaleres Ergebnis ueber ein breiteres. Gemessen an vier Tagen:

    18.08.  96 -> 86
    21.08.  66 -> 53
    22.08.  62 -> 48
    25.08.  60 -> 46

Jedes Mal 12-23 % weniger Teams aus derselben Quelle in derselben
Stunde — kein neuer Datenpunkt, nur eine engere Auswahl.

Was `--top` bedeutet, macht den Verlust erklaerbar: der Scraper nimmt
die besten N nach Rang VEREINIGT mit allen Teams der letzten
`--speed-window-days` Tage. `--top` ist damit ein Boden. Ein kleinerer
Boden heisst weniger Teams, sobald die Quelle eine ruhige Woche hat —
und genau das war der Fall.
"""

import os
import re

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WF = os.path.join(ROOT, ".github", "workflows")


def _quelle(name):
    return open(os.path.join(WF, name), encoding="utf-8").read()


def _ohne_kommentar(text):
    """YAML-Kommentare raus — sonst stolpert die Suche ueber die
    Erklaerung des alten Fehlers, die den alten Fehler zitiert."""
    return "\n".join(re.sub(r"(^|\s)#.*$", "", z) for z in text.splitlines())


def test_der_wochenlauf_scraped_die_champions_nicht_mehr():
    code = _ohne_kommentar(_quelle("weekly-full-update.yml"))
    assert "champions_replica_scraper.py" not in code, (
        "der Wochenlauf startet den Champions-Scraper wieder — er kommt nach "
        "dem Tageslauf und ueberschreibt dessen breiteres Ergebnis"
    )


def test_der_wochenlauf_schreibt_die_datei_auch_nicht_zurueck():
    """Den Scraper zu entfernen reicht nicht, wenn der Rueckkopier-Schritt
    die geseedete Fassung weiter nach data/ traegt."""
    code = _ohne_kommentar(_quelle("weekly-full-update.yml"))
    sync = re.search(r"for f in labs_tournament_decks\.csv[^\n]*", code)
    assert sync, "die Rueckkopier-Schleife ist nicht mehr auffindbar"
    assert "champions_replica_teams.json" not in sync.group(0), (
        "der Wochenlauf kopiert die Champions-Datei wieder zurueck"
    )
    assert "champions_speed_corpus.json" not in sync.group(0)


def test_der_tageslauf_scraped_sie_weiterhin():
    """Beide Seiten der Regel — sonst faellt die Datei ganz aus."""
    code = _quelle("champions-replica-scrape.yml")
    assert "champions_replica_scraper.py" in code
    assert re.search(r"cron:\s*'0 4 \* \* \*'", code), (
        "der taegliche Lauf hat seinen Zeitplan verloren — dann wird die "
        "Datei nirgends mehr aktualisiert"
    )


def test_der_boden_des_tageslaufs_ist_nicht_kleiner_geworden():
    """--top ist der garantierte Boden. Faellt er, faellt die Liste mit."""
    code = _quelle("champions-replica-scrape.yml")
    m = re.search(r'TOP="\$\{TOP:-(\d+)\}"', code)
    assert m, "der Vorgabewert fuer --top ist nicht mehr auffindbar"
    # Am 25.08.2026 von 40 auf 60 angehoben. Begruendung: der feste Anteil
    # der Liste (top-N nach Rang) lag durchgehend bei 25-31, das rollende
    # 14-Tage-Fenster schwankte zwischen 71 und 30. Ein Boden von 60 liegt
    # ueber dieser Schwankung — die Liste kann in einer ruhigen Woche nicht
    # mehr sichtbar schrumpfen.
    assert int(m.group(1)) >= 60, (
        f"der Boden steht auf {m.group(1)} — unter 60 schrumpft die Side "
        f"Quest in ruhigen Wochen wieder sichtbar"
    )

    # Der Vorgabewert des Handlaufs muss denselben Boden tragen. Stehen
    # die beiden auseinander, holt ein Klick auf "Run workflow" still
    # weniger als der Zeitplan — und niemand sieht warum.
    d = re.search(r"top:\s*\n\s*description:[^\n]*\n\s*type: string\n(?:\s*#[^\n]*\n)*\s*default: '(\d+)'", code)
    assert d, "der Vorgabewert des workflow_dispatch-Eingabefeldes fehlt"
    assert d.group(1) == m.group(1), (
        f"Handlauf holt {d.group(1)}, Zeitplan {m.group(1)} — das laeuft "
        f"auseinander"
    )


def test_die_yaml_ist_noch_gueltig():
    """Ein entfernter Schritt darf die Datei nicht zerlegen."""
    yaml = pytest.importorskip("yaml")
    for name in ("weekly-full-update.yml", "champions-replica-scrape.yml"):
        d = yaml.safe_load(_quelle(name))
        jobs = d.get("jobs") or {}
        assert jobs, f"{name} hat keine Jobs mehr"
        for job in jobs.values():
            assert job.get("steps"), f"{name}: ein Job ohne Schritte"
