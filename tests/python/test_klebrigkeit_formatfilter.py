"""Die Klebrigkeit rechnete ueber drei Formate hinweg.

BEFUND (29.08.2026): `player_continuity.csv` fuehrte die Spalte `meta`
in ALLEN 5619 Zeilen leer. Ursache war kein Parserfehler, sondern ein
Schemabruch zwischen zwei Dateien: `player_continuity_scraper.py` las
`t.get('meta')` aus `labs_tournaments.json` — und dieser Index fuehrt
den Schluessel `meta` ueberhaupt nicht (er hat tournament_id,
tournament_name, tournament_date, tournament_type, country,
total_players). `t.get('meta')` war also immer None.

Warum das teuer war: `js/app-meta-call.js` filtert die Klebrigkeit
ueber genau diese Spalte

    if (prev && meta && meta !== prev) return;

Ist `meta` leer, greift der Filter nie. Das Fenster umfasste dann alle
zehn Turniere aus SVI-ASC, TEF-POR *und* TEF-CRI. Gemessen wurden so
**16 Decks ueber der Schwelle brought >= 100, davon 14 mit Faktor
0.70** — mit Klebrigkeitswerten wie 0.00 %. Diese Null misst keine
Spielertreue, sondern eine Formatrotation: nach einer Rotation nimmt
niemand sein Deck mit. Der Daempfer bestrafte Decks dafuer, dass sich
das Format geaendert hatte.

Mit korrekt gefuelltem `meta` bleibt im Fenster (TEF-CRI) genau ein
verwertbares Turnier. `PREDICTOR_5_8_MIN_TURNIERE = 3` greift, der
Daempfer schaltet sich ab — und genau dafuer wurde die Sperre gebaut.

Diese Datei haelt beide Enden fest: die Daten duerfen die Spalte nicht
wieder verlieren, und der Scraper darf sie nicht wieder aus einer
Quelle holen, die sie nicht hat.
"""

import csv
import json
import os

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
DATEN = os.path.join(WURZEL, "data")
SCRAPER = os.path.join(WURZEL, "backend", "scrapers", "player_continuity_scraper.py")


def _zeilen():
    pfad = os.path.join(DATEN, "player_continuity.csv")
    if not os.path.exists(pfad):
        pytest.skip("player_continuity.csv fehlt")
    with open(pfad, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def _quelltext():
    with open(SCRAPER, encoding="utf-8") as f:
        return f.read()


# ── Die Daten ──────────────────────────────────────────────────────

def test_meta_ist_in_jeder_zeile_gefuellt():
    zeilen = _zeilen()
    assert zeilen, "player_continuity.csv ist leer"
    leer = [z for z in zeilen if not (z.get("meta") or "").strip()]
    assert not leer, (
        f"{len(leer)} von {len(zeilen)} Zeilen ohne meta. Ohne diese Spalte "
        f"mischt das Klebrigkeits-Fenster mehrere Formate und daempft Decks "
        f"fuer eine Rotation statt fuer fehlende Spielertreue."
    )


def test_ein_turnier_traegt_genau_ein_format():
    """Faende sich ein Turnier mit zwei metas, waere die Ableitung falsch."""
    proT = {}
    for z in _zeilen():
        proT.setdefault(z["tournament_id"], set()).add((z.get("meta") or "").strip())
    mehrdeutig = {t: sorted(m) for t, m in proT.items() if len(m) > 1}
    assert not mehrdeutig, f"Turniere mit mehreren metas: {mehrdeutig}"


def test_meta_passt_zur_aggregatdatei():
    """Die Spalte muss dieselbe Aussage treffen wie labs_tournament_decks.csv."""
    pfad = os.path.join(DATEN, "labs_tournament_decks.csv")
    if not os.path.exists(pfad):
        pytest.skip("labs_tournament_decks.csv fehlt")
    quelle = {}
    with open(pfad, newline="", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            tid = (r.get("tournament_id") or "").strip()
            m = (r.get("meta") or "").strip()
            if tid and m:
                quelle.setdefault(tid, m)
    abweichung = []
    for z in _zeilen():
        tid, m = z["tournament_id"], (z.get("meta") or "").strip()
        if tid in quelle and quelle[tid] != m:
            abweichung.append((tid, m, quelle[tid]))
    assert not abweichung, f"meta weicht von der Aggregatdatei ab: {abweichung[:5]}"


def test_fenstertiefe_wird_nicht_stillschweigend_gemischt():
    """Das Fenster des Prognosemotors darf nur EIN Format enthalten."""
    fw_pfad = os.path.join(DATEN, "format_window.json")
    if not os.path.exists(fw_pfad):
        pytest.skip("format_window.json fehlt")
    with open(fw_pfad, encoding="utf-8") as f:
        prev = (json.load(f).get("previous_format_key") or "").strip()
    if not prev:
        pytest.skip("kein previous_format_key gesetzt")
    im_fenster = {z["tournament_id"] for z in _zeilen()
                  if (z.get("meta") or "").strip() == prev}
    andere = {z["tournament_id"] for z in _zeilen()
              if (z.get("meta") or "").strip() != prev}
    assert not (im_fenster & andere), (
        "dasselbe Turnier liegt innerhalb und ausserhalb des Fensters"
    )


# ── Der Scraper ────────────────────────────────────────────────────

def test_scraper_holt_meta_nicht_mehr_allein_aus_dem_index():
    q = _quelltext()
    assert "def load_meta_map(" in q, (
        "load_meta_map fehlt — meta kaeme wieder nur aus labs_tournaments.json, "
        "und dieser Index fuehrt den Schluessel nicht."
    )
    assert "meta_map.get(tid" in q, "die meta-Karte wird nicht benutzt"


def test_der_index_hat_die_spalte_wirklich_nicht():
    """Die Begruendung der Reparatur, als Zusicherung.

    Bekaeme labs_tournaments.json eines Tages doch ein `meta`, waere der
    Umweg unnoetig — dann soll diese Zusage auffallen und jemand die
    Begruendung im Scraper nachziehen."""
    pfad = os.path.join(DATEN, "labs_tournaments.json")
    if not os.path.exists(pfad):
        pytest.skip("labs_tournaments.json fehlt")
    with open(pfad, encoding="utf-8") as f:
        eintraege = json.load(f)
    mit_meta = [e for e in eintraege if (e.get("meta") or "").strip()]
    assert not mit_meta, (
        "labs_tournaments.json fuehrt jetzt doch meta — die Begruendung von "
        "load_meta_map in player_continuity_scraper.py gehoert aktualisiert."
    )


def test_laenderspalte_wird_ueber_die_flagge_gefunden():
    """Die Flaggenspalte auf labs hat eine LEERE Kopfzeile.

    `find_col(['country','cc','flag'])` gleicht Kopf-TEXT ab und konnte
    sie deshalb nie finden — country stand in allen 5619 Zeilen leer.
    Am 29.08.2026 in Chrome gegen die echte Seite geprueft: die Spalte
    traegt <img alt="US"> und einen Link ?c=US."""
    q = _quelltext()
    assert "col_country is None" in q, "kein Rueckfall fuer die Laenderspalte"
    assert "[A-Za-z]{2}" in q, (
        "die Flaggenerkennung sucht nicht mehr nach einem zweibuchstabigen alt"
    )


def test_fehlendes_meta_wird_gemeldet_nicht_verschwiegen():
    q = _quelltext()
    i = q.find("meta_map.get(tid")
    assert i != -1
    umfeld = q[i:i + 400]
    assert "logger.warning" in umfeld, (
        "ein Turnier ohne meta laeuft still durch — genau so ist der Befund "
        "monatelang unbemerkt geblieben."
    )
