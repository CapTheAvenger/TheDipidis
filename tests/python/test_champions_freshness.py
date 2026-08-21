"""Die Nutzungszahlen duerfen nicht still altern.

Befund (21.08.2026): data/champions_usage.json stand seit dem 17.07.2026
unveraendert, weil championsbattledata.com den Bulk-Scrape aus CI-IPs drosselt.
Der Workflow-Kommentar versprach "data_guardian escalates once it passes its
freshness budget" — dieses Budget existierte nicht: keine champions_*-Datei
stand in REFRESH_DRIVEN oder CONTENT_DRIVEN.

Warum nicht ueber das Git-Datum wie check_freshness(): die Datei wird auch von
Aenderungen angefasst, die nichts mit dem Scrape zu tun haben. Am 21.08. etwa
von der Plausibilitaetskorrektur aus Gruppe 3 — danach war ihr Git-Datum
taggleich, obwohl der letzte echte Scrape 35 Tage zurueck lag. Nur der Scraper
selbst weiss, wann er zuletzt Daten geholt hat: _meta.scraped_at.
"""
import datetime as dt
import importlib.util
import json
import os

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _guardian():
    pfad = os.path.join(ROOT, "scripts", "data_guardian.py")
    spec = importlib.util.spec_from_file_location("data_guardian_unter_test", pfad)
    modul = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modul)
    return modul


def _lauf(tmp_path, meta):
    """check_champions_freshness gegen eine gebaute Datei laufen lassen."""
    g = _guardian()
    daten = os.path.join(tmp_path, "data")
    os.makedirs(daten, exist_ok=True)
    with open(os.path.join(daten, "champions_usage.json"), "w", encoding="utf-8") as f:
        json.dump({"_meta": meta, "pokemon": {}}, f)
    g.DATA = daten
    befunde = []
    g.check_champions_freshness(befunde)
    return befunde


def _vor(tagen):
    return (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=tagen)) \
        .replace(microsecond=0).isoformat()


def test_frischer_scrape_meldet_nichts(tmp_path):
    assert _lauf(str(tmp_path), {"scraped_at": _vor(1)}) == []


def test_alter_scrape_wird_gemeldet(tmp_path):
    # Der reale Fall vom 21.08.2026: letzter echter Scrape 35 Tage her.
    befunde = _lauf(str(tmp_path), {"scraped_at": _vor(35)})
    assert len(befunde) == 1, befunde
    stufe, text = befunde[0]
    # WARN, nicht CRITICAL: der Job stirbt nicht, er committet nur nichts,
    # und eine gedrosselte Fremdquelle ist kein Repo-Fehler.
    assert stufe == "WARN", befunde
    assert "35" in text, text


def test_fehlendes_feld_ist_kein_fehler_sondern_ein_hinweis(tmp_path):
    # Altbestand bis zum naechsten geglueckten Lauf. Die Seite schreibt dann
    # ehrlich "Stand unbekannt" — das ist keine Stoerung, nur eine Luecke.
    befunde = _lauf(str(tmp_path), {"season": "Current"})
    assert [s for s, _ in befunde] == ["INFO"], befunde


def test_unlesbares_datum_wird_gemeldet(tmp_path):
    befunde = _lauf(str(tmp_path), {"scraped_at": "irgendwann"})
    assert [s for s, _ in befunde] == ["WARN"], befunde


def test_der_scraper_stempelt_erst_nach_dem_regressionsschutz():
    """Ein gedrosselter Lauf darf keinen frischen Stand hinterlassen."""
    quelle = open(os.path.join(ROOT, "scripts", "scrape_champions_usage.py"),
                  encoding="utf-8").read()
    i_guard = quelle.index("keeping committed JSON")
    i_stamp = quelle.index('"scraped_at"')
    assert i_stamp > i_guard, (
        "scraped_at wird gesetzt, bevor der 92-%-Regressionsschutz greift — "
        "dann sieht auch ein abgebrochener Lauf frisch aus"
    )


@pytest.mark.parametrize("feld", ["source", "season", "count", "formats"])
def test_die_uebrigen_meta_felder_bleiben(feld):
    """Der Zeitstempel kommt hinzu, er ersetzt nichts (Vertrag zum Frontend)."""
    quelle = open(os.path.join(ROOT, "scripts", "scrape_champions_usage.py"),
                  encoding="utf-8").read()
    assert f'"{feld}"' in quelle


def test_der_check_haengt_auch_wirklich_in_main():
    """Eine Pruefung, die niemand aufruft, ist keine Pruefung.

    Beim Gegentest fiel auf, dass sich check_champions_freshness aus main()
    entfernen liess, ohne dass ein Test rot wurde — die uebrigen Faelle rufen
    die Funktion ja direkt auf. Genau diese Luecke schliesst dieser Fall.
    """
    quelle = open(os.path.join(ROOT, "scripts", "data_guardian.py"),
                  encoding="utf-8").read()
    i_main = quelle.index("def main(")
    assert "check_champions_freshness(findings)" in quelle[i_main:], (
        "check_champions_freshness wird in main() nicht aufgerufen"
    )
