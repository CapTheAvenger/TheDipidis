"""Der Datenstand liest jedes Datumsformat, das in den Daten wirklich steht.

BEFUND (10.09.2026): `data_stand.json` trug fuer KEINE einzige
City-League-Datei ein Inhaltsdatum — obwohl
`city_league_archetypes_past.csv` in INHALT_BIS eingetragen war und eine
gefuellte Spalte `date` hat. Der Leser nahm ausschliesslich ISO; die
Datei fuehrt "6th June 2026". Er gab also still nichts zurueck.

Sichtbar wurde das erst, als der Frischechip auf diese Datei gezogen
wurde: er haette dann das SCHREIBdatum (22.08.2026) neben Inhalt vom
06.06.2026 gestellt — 77 Tage Abstand, und die falsche der beiden Zahlen
in der Ueberschrift.

ZWEI DINGE HALTEN DIESE DATEI FEST:

1. Die Formate, die vorkommen, werden gelesen. Die Regel ist nicht neu
   erfunden: backend/core/card_scraper_shared.py `parse_tournament_date`
   kennt genau dieselben Schreibweisen, weil der Scraper sie von der
   Quelle uebernimmt. Hier wird gegengeprueft, dass beide Umsetzungen
   dasselbe sagen — sonst laufen sie irgendwann auseinander, und der
   Datenstand liest dann etwas anderes als der Scraper schreibt.

2. Eine Spalte, die DA ist und trotzdem nichts hergibt, wird gemeldet
   statt verschwiegen. Genau dieser Unterschied hat gefehlt: "Spalte
   fehlt" und "Spalte unlesbar" sahen beide nach nichts aus.
"""

import datetime
import os
import sys

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(WURZEL, "scripts"))

import build_data_stand as B  # noqa: E402


# Schreibweisen, die in den Datendateien vorkommen, mit dem Tag, den sie
# meinen. Kein erfundener Fall: jede Zeile ist entweder in data/ belegt
# oder in parse_tournament_date ausdruecklich behandelt.
FAELLE = [
    ("2026-06-06", "2026-06-06"),          # ISO, die Mehrheit der Dateien
    ("2026-06-06T14:00:00Z", "2026-06-06"),  # ISO mit Uhrzeit
    ("6th June 2026", "2026-06-06"),       # City League
    ("1st March 2026", "2026-03-01"),
    ("22nd December 2025", "2025-12-22"),
    ("3rd April 2026", "2026-04-03"),
    ("06 Jun 26", "2026-06-06"),           # Limitless-Kurzform
]

UNLESBAR = ["", "   ", "Quatsch", "2026-13-40", "June 2026", "6th Juni 2026"]


def test_die_vorkommenden_formate_werden_gelesen():
    for roh, erwartet in FAELLE:
        assert B._als_iso_tag(roh) == erwartet, (
            f"{roh!r} wird als {B._als_iso_tag(roh)!r} gelesen, "
            f"erwartet {erwartet!r}"
        )


def test_unlesbares_bleibt_unlesbar():
    """Kein Ersatzwert. Ein geratenes Inhaltsdatum waere derselbe Fehler
    wie das geratene Dateidatum, nur eine Ebene tiefer."""
    for roh in UNLESBAR:
        assert B._als_iso_tag(roh) is None, (
            f"{roh!r} wird zu {B._als_iso_tag(roh)!r} — das ist geraten"
        )


def test_dasselbe_ergebnis_wie_der_scraper():
    """Die zweite Umsetzung derselben Regel darf nicht abdriften."""
    try:
        sys.path.insert(0, WURZEL)
        from backend.core.card_scraper_shared import parse_tournament_date
    except Exception as fehler:            # pragma: no cover
        import pytest
        pytest.skip(f"Scraper-Kette nicht importierbar: {fehler}")

    for roh, erwartet in FAELLE:
        ihres = parse_tournament_date(roh)
        if ihres is None:
            # Der Scraper kennt kein ISO — das ist in Ordnung, er liest
            # nie ISO-Dateien. Geprueft wird nur, wo BEIDE etwas sagen.
            continue
        assert ihres.strftime("%Y-%m-%d") == erwartet, (
            f"{roh!r}: Scraper liest {ihres:%Y-%m-%d}, hier {erwartet}"
        )
        assert B._als_iso_tag(roh) == ihres.strftime("%Y-%m-%d"), (
            f"{roh!r}: die beiden Umsetzungen sind auseinandergelaufen"
        )


def test_die_city_league_dateien_haben_jetzt_ein_inhaltsdatum():
    """Die Datei, an der der Ausfall aufgefallen ist."""
    import json
    with open(os.path.join(WURZEL, "data", "data_stand.json"), encoding="utf-8") as f:
        stand = json.load(f)
    inhalt = stand.get("inhalt_bis") or {}
    for datei in ("city_league_archetypes_past.csv", "city_league_analysis_past.csv"):
        assert datei in inhalt, (
            f"{datei} traegt kein Inhaltsdatum — dann zeigt ihr Frischechip "
            f"wieder das Schreibdatum einer Datei, deren Inhalt Wochen "
            f"aelter ist"
        )
        wert = inhalt[datei]
        assert B._als_iso_tag(wert) == wert, f"{datei}: {wert!r} ist kein ISO-Tag"


def test_eine_unlesbare_spalte_wird_gemeldet_nicht_verschwiegen(tmp_path, monkeypatch):
    """Der Melder muss auf einer erfundenen kaputten Spalte anschlagen —
    sonst waere sein leeres Ergebnis heute nichts wert.

    WZ-36 (07.10.2026): die Probedatei lag frueher in data/ des echten
    Baums. Konnte sie nicht geloescht werden (Arbeitsplatz ohne Loeschrecht),
    blieb sie liegen — und das Tor-Zurueckrollen haette sie als neue
    Datendatei gesehen. Jetzt in einem Wegwerf-Baum."""
    import csv

    (tmp_path / "data").mkdir()
    monkeypatch.setattr(B, "WURZEL", str(tmp_path))
    name = "_pruefung_unlesbare_spalte.csv"
    with open(tmp_path / "data" / name, "w", newline="", encoding="utf-8") as fh:
        schreiber = csv.writer(fh, delimiter=";")
        schreiber.writerow(["archetype", "date"])
        schreiber.writerow(["Testdeck", "irgendwann"])
        schreiber.writerow(["Testdeck", "auch nicht"])
    treffer = B.unlesbare_inhaltsspalten({name: "date"})
    assert treffer, "eine Spalte mit ausschliesslich unlesbaren Werten wird nicht gemeldet"
    assert treffer[0][0] == name
    assert treffer[0][2] == "irgendwann"
    assert not os.path.exists(os.path.join(WURZEL, "data", name)), "Probedatei im echten data/"


def test_eine_fehlende_spalte_ist_kein_ausfall():
    """Der Unterschied, um den es geht: fehlende Spalte = Aussage ueber
    die Datei, unlesbare Spalte = Ausfall des Skripts."""
    treffer = B.unlesbare_inhaltsspalten({"data_stand.json": "date"})
    assert treffer == [], "eine Datei ohne CSV-Spalte wird faelschlich gemeldet"
    treffer = B.unlesbare_inhaltsspalten({"gibt_es_nicht.csv": "date"})
    assert treffer == []
