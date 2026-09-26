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
    """AUSGEFUEHRT STATT GEGRIFFEN (26.09.2026).

    Bis heute suchte diese Zusicherung die Zeichenkette `meta_map.get(tid`
    im Quelltext. Beim Umbau der Reihenfolge in eine eigene Funktion hiess
    dieselbe Stelle ploetzlich `(meta_map or {}).get(tid, '')` — die
    Zusicherung fiel um, obwohl die Karte weiter benutzt wird. Eine
    Zusicherung, die an einer Schreibweise haengt, prueft die Schreibweise.
    """
    q = _quelltext()
    assert "def load_meta_map(" in q, (
        "load_meta_map fehlt — meta kaeme wieder nur aus labs_tournaments.json, "
        "und dieser Index fuehrt den Schluessel nicht."
    )
    m = _continuity_modul()
    assert m.meta_fuer_turnier({}, "0042", "", {"0042": "AUS-KARTE"}) == "AUS-KARTE", (
        "die meta-Karte aus labs_tournament_decks.csv wird nicht benutzt")


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


def test_fehlendes_meta_wird_gemeldet_nicht_verschwiegen(caplog):
    """Auch diese: ausgefuehrt, nicht gegriffen.

    Bleibt am Ende aller drei Quellen nichts uebrig, muss es im Protokoll
    stehen — genau so ist der Befund vom 29.08.2026 monatelang unbemerkt
    geblieben.
    """
    import logging
    m = _continuity_modul()
    with caplog.at_level(logging.WARNING):
        erg = m.meta_fuer_turnier({}, "0000", "", {})
    assert erg == ""
    assert any("ohne meta" in r.getMessage() for r in caplog.records), (
        "ein Turnier ohne meta laeuft still durch: "
        f"{[r.getMessage() for r in caplog.records]}")


# ── Die Luecke in der Reihenfolge (26.09.2026) ─────────────────────

def _continuity_modul():
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "player_continuity_scraper", SCRAPER)
    m = importlib.util.module_from_spec(spec)
    import sys
    sys.path.insert(0, os.path.join(WURZEL, "backend"))
    try:
        spec.loader.exec_module(m)
    except Exception as e:                                   # noqa: BLE001
        pytest.skip(f"player_continuity_scraper nicht ladbar: {e}")
    return m


def test_ein_turnier_ohne_eintrag_in_der_deckuebersicht_bekommt_sein_format():
    """BEFUND: Wochenlauf #161 am 26.09.2026, 05:03 UTC.

    Das Tor vor dem Push schlug zu — „817 von 25238 Zeilen ohne meta",
    alle aus Turnier 0073 vom 2026-09-26. Kein Parserfehler: ein Turnier
    steht in der Standings-Liste, BEVOR es in der Deck-Uebersicht steht,
    und `load_meta_map` liest genau die Deck-Uebersicht. Das Datum war
    da, das Format waere ableitbar gewesen, und die Spalte blieb leer.
    Der ganze Wochenlauf hat deshalb nichts ausgeliefert; die Seite lief
    mit den Daten der Vorwoche weiter.

    Geprueft wird die ABLEITUNG, ausgefuehrt — nicht ihr Vorkommen im
    Quelltext. Die Sollwerte kommen aus format_window.json, nicht aus
    dieser Datei: welches Set diese Woche laeuft, ist der Zusicherung
    egal.
    """
    m = _continuity_modul()
    assert hasattr(m, "meta_aus_datum"), (
        "die dritte Quelle fehlt — ein Turnier vom Vortag bleibt wieder ohne "
        "Format und haelt den ganzen Wochenlauf an")

    fw_pfad = os.path.join(DATEN, "format_window.json")
    if not os.path.exists(fw_pfad):
        pytest.skip("format_window.json fehlt")
    with open(fw_pfad, encoding="utf-8") as f:
        fw = json.load(f)
    laufend = f"{fw.get('oldest_legal_set', '')}-{fw.get('current_set', '')}"
    vorher = (fw.get("previous_format_key") or "").strip()
    legal = (fw.get("in_person_legal_date") or "").strip()
    if not legal or not vorher or "-" not in laufend:
        pytest.skip("format_window.json ohne Rotationsangaben")

    import datetime as _dt
    tag = _dt.date.fromisoformat(legal)

    # Am Tag, an dem das neue Set in Person legal wird, und danach:
    # das laufende Format.
    assert m.meta_aus_datum(legal) == laufend, (
        f"ein Turnier am {legal} bekommt {m.meta_aus_datum(legal)!r} statt "
        f"{laufend!r} — genau der Fall, an dem der Wochenlauf haengenblieb")
    danach = (tag + _dt.timedelta(days=1)).isoformat()
    assert m.meta_aus_datum(danach) == laufend, (
        f"ein Turnier am {danach} bekommt {m.meta_aus_datum(danach)!r}")

    # EINEN TAG VORHER gilt noch das Vorformat. Ohne diese Haelfte waere
    # die Reparatur die naechste Fehleinsortierung: am 23.05.2026 landete
    # Melbourne unter TEF-CRI, obwohl CRI erst am 05.06. legal war.
    davor = (tag - _dt.timedelta(days=1)).isoformat()
    assert m.meta_aus_datum(davor) == vorher, (
        f"ein Turnier am {davor} — noch im Lag-Fenster — bekommt "
        f"{m.meta_aus_datum(davor)!r} statt {vorher!r}")

    # Ohne Datum wird nichts erfunden.
    assert m.meta_aus_datum("") == ""
    assert m.meta_aus_datum("kein datum") == ""


def test_die_reihenfolge_der_drei_quellen_stimmt():
    """Der Kern der Reparatur vom 26.09.2026 — ausgefuehrt.

    VERFAELSCHUNGSPROBE, DIE ZUERST NICHT BISS: den Aufruf der dritten
    Quelle aus der Schleife zu entfernen liess alles gruen, weil nur die
    Ableitung selbst geprueft war und nicht, DASS sie benutzt wird. Die
    Reihenfolge steht deshalb jetzt in einer eigenen Funktion, und die
    laeuft hier wirklich.
    """
    m = _continuity_modul()
    assert hasattr(m, "meta_fuer_turnier"), (
        "die Reihenfolge der drei Quellen ist nicht mehr pruefbar")

    fw_pfad = os.path.join(DATEN, "format_window.json")
    if not os.path.exists(fw_pfad):
        pytest.skip("format_window.json fehlt")
    with open(fw_pfad, encoding="utf-8") as f:
        fw = json.load(f)
    legal = (fw.get("in_person_legal_date") or "").strip()
    laufend = f"{fw.get('oldest_legal_set', '')}-{fw.get('current_set', '')}"
    if not legal or "-" not in laufend:
        pytest.skip("format_window.json ohne Rotationsangaben")

    # 1 · Der Index gewinnt, wenn er die Spalte je bekommt.
    assert m.meta_fuer_turnier({"meta": "AUS-INDEX"}, "0073", legal,
                               {"0073": "AUS-KARTE"}) == "AUS-INDEX"
    # 2 · Sonst die Karte aus der Deck-Uebersicht.
    assert m.meta_fuer_turnier({}, "0073", legal,
                               {"0073": "AUS-KARTE"}) == "AUS-KARTE"
    # 3 · Und wenn die das Turnier noch nicht kennt — GENAU DER FALL, an
    #     dem Wochenlauf #161 haengenblieb — das Datum.
    assert m.meta_fuer_turnier({}, "0073", legal, {}) == laufend, (
        "ein Turnier, das noch nicht in der Deck-Uebersicht steht, bleibt "
        "wieder ohne Format — und das Tor vor dem Push laesst nichts durch")
    # Ohne alles bleibt es leer; erfunden wird nichts.
    assert m.meta_fuer_turnier({}, "0073", "", {}) == ""


def test_ein_datum_im_fenster_behaelt_sein_format(monkeypatch):
    """Ein altes Turnier bleibt in SEINEM Format — auch nachdem das neue
    Set legal geworden ist.

    VERFAELSCHUNGSPROBE, DIE ZWEIMAL NICHT BISS: die Chunk-Abfrage
    (Schritt 1) aus der Ableitung zu entfernen liess alles gruen. Der
    Grund ist kein schwacher Test, sondern der Bestand dieser Woche:
    `_previous_meta_for_date` liest DENSELBEN Auszugsbestand und liefert
    fuer jedes Datum innerhalb eines Fensters dasselbe Ergebnis wie die
    Chunk-Abfrage — nachgemessen an allen 16 Fenstern. Und ein Datum
    INNERHALB eines Fensters, das zugleich NACH `in_person_legal_date`
    liegt, gibt es gerade nicht: das juengste Fenster endet am 19.09.,
    legal ist der 25.09.

    Genau dieser Fall entsteht aber nach jeder Rotation, sobald der neue
    Auszug existiert. Er wird hier deshalb HERGESTELLT, indem das
    Legal-Datum weit nach vorne gesetzt wird. Ohne Schritt 1 bekaeme
    dann jedes alte Turnier das laufende Format zugesprochen — und die
    Klebrigkeit rechnete wieder ueber die Rotation hinweg.
    """
    import sys
    sys.path.insert(0, os.path.join(WURZEL, "backend"))
    try:
        from scrapers import labs_tournament_scraper as labs   # noqa: PLC0415
    except Exception as e:                                     # noqa: BLE001
        pytest.skip(f"labs_tournament_scraper nicht ladbar: {e}")
    m = _continuity_modul()

    fenster = labs._load_meta_date_lookup()
    if len(fenster) < 3:
        pytest.skip("zu wenige Auszuege fuer diese Probe")

    # Das neue Set gilt seit dem Urknall — damit liegt JEDES Fenster
    # dahinter, und nur Schritt 1 kann noch das richtige Format liefern.
    monkeypatch.setattr(labs, "_load_in_person_legal_date", lambda: "2000-01-01")
    laufend = labs._current_meta_key()
    geprueft = 0
    for d_min, d_max, meta in fenster:
        if meta == laufend:
            continue
        mitte = (d_min + (d_max - d_min) / 2).strftime("%Y-%m-%d")
        assert m.meta_aus_datum(mitte) == meta, (
            f"{mitte} liegt im Fenster {meta} und bekommt "
            f"{m.meta_aus_datum(mitte)!r} — ohne die Auszugsabfrage traegt "
            f"jedes alte Turnier das laufende Format {laufend!r}, und die "
            "Klebrigkeit rechnet wieder ueber die Rotation hinweg")
        geprueft += 1
    assert geprueft >= 10, (
        f"nur {geprueft} Fenster geprueft — die Probe traegt so nichts")


def test_die_dritte_quelle_haengt_an_der_regel_des_labs_scrapers():
    """Eine zweite Abschrift der Lag-Fenster-Regel waere die Stelle, an der
    die beiden Dateien auseinanderlaufen. Geprueft wird deshalb, dass
    beide fuer dieselben Daten dasselbe sagen — ausgefuehrt, beide."""
    import sys
    sys.path.insert(0, os.path.join(WURZEL, "backend"))
    try:
        from scrapers import labs_tournament_scraper as labs   # noqa: PLC0415
    except Exception as e:                                     # noqa: BLE001
        pytest.skip(f"labs_tournament_scraper nicht ladbar: {e}")
    m = _continuity_modul()

    fw_pfad = os.path.join(DATEN, "format_window.json")
    if not os.path.exists(fw_pfad):
        pytest.skip("format_window.json fehlt")
    with open(fw_pfad, encoding="utf-8") as f:
        legal = (json.load(f).get("in_person_legal_date") or "").strip()
    if not legal:
        pytest.skip("kein in_person_legal_date")

    import datetime as _dt
    tag = _dt.date.fromisoformat(legal)
    daten = [(tag + _dt.timedelta(days=v)).isoformat()
             for v in (-30, -10, -1, 0, 1, 10)]
    # UND DIE MITTE JEDES BEKANNTEN CHUNK-FENSTERS.
    #
    # VERFAELSCHUNGSPROBE, DIE ZUERST NICHT BISS: die Chunk-Abfrage aus
    # der Ableitung zu entfernen liess alles gruen — rund um
    # `in_person_legal_date` liefern Chunk-Abfrage und Rueckfall
    # dieselbe Antwort. Erst ein Datum mitten in einem alten Fenster
    # trennt die beiden Wege. Die Daten kommen aus dem Bestand, nicht
    # aus dieser Datei: welches Fenster diese Woche welches ist, bleibt
    # der Zusicherung egal.
    for d_min, d_max, _m in labs._load_meta_date_lookup():
        mitte = d_min + (d_max - d_min) / 2
        daten.append(mitte.strftime('%Y-%m-%d'))
    geprueft = 0
    for d in daten:
        # Der Labs-Scraper entscheidet fuer eine Zeile ohne Namenstreffer
        # genau ueber diese Funktion.
        erwartet, _ = labs._derive_meta_for_labs_tournament(
            "0000", "Ein Turnier", d, {}, labs._current_meta_key())
        assert m.meta_aus_datum(d) == erwartet, (
            f"{d}: die Fortschreibung sagt {m.meta_aus_datum(d)!r}, "
            f"der Labs-Scraper {erwartet!r}")
        geprueft += 1
    assert geprueft >= 12, (
        f"nur {geprueft} Daten verglichen — ohne die Mitte der alten "
        "Chunk-Fenster trennt der Vergleich die zwei Wege der Ableitung nicht")
