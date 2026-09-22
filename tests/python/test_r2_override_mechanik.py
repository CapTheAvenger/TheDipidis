"""Die Overrides sollen WIRKEN — nicht bloss vorhanden sein.

WARUM ES DIESE DATEI GIBT (Nachpruefung vom 07.09.2026)

Ein unabhaengiger Pruefer hat 17 Mutationen gegen den Datums- und
Labs-ID-Override gefahren. Zehn davon ueberlebten: die vorhandenen Tests
pruefen ARTEFAKTE — steht der Import im Quelltext, existiert die Datei,
stimmt die Zeilenzahl — und nicht den MECHANISMUS. Ein Scraper, der den
Override importiert und dann verwirft, kommt an solchen Tests vorbei.

Dazu kam ein zweiter Befund, der schwerer wog: `datum_nachtragen` setzte
`get_data_dir` auf dem ECHTEN Modul in `sys.modules` und nahm es nie
zurueck. Der Wachhund-Test, der danach lief, sah ein bereits umgebogenes
Modul — und blieb gruen, obwohl der bewachte Fix vollstaendig
zurueckgedreht war (1583 passed). Ein Test, der in einer bestimmten
Reihenfolge blind wird, ist kein Wachhund.

Die Tests hier fragen darum drei Dinge, und zwar an der Wirkung:

  1. Kommt bei vorhandenem Override EXAKT der Override-Wert heraus, und
     bei fehlendem Override EXAKT das Quelldatum? (nicht: "irgendetwas
     hat sich geaendert")
  2. Greifen die zehn Labs-ID-Zuordnungen wirklich — jede einzeln?
  3. Findet ein FRISCHER Prozess die Override-Datei? Das laeuft in einem
     Unterprozess mit eigenem Arbeitsverzeichnis, damit keine
     Testreihenfolge und kein `sys.modules`-Zustand die Antwort
     faelschen kann.

Erwartungswerte kommen, wo immer moeglich, aus
data/labs_tournament_id_overrides.json selbst. Ein Test, der die Zahlen
noch einmal abschreibt, prueft nur die Abschrift.

Geschrieben wird ausschliesslich in tmp_path. data/ wird gelesen.
"""

import csv
import importlib.util
import json
import os
import subprocess
import sys
import textwrap

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
DATEN = os.path.join(WURZEL, "data")
CORE = os.path.join(WURZEL, "backend", "core")
SCRAPERS = os.path.join(WURZEL, "backend", "scrapers")
QUELLE = os.path.join(SCRAPERS, "per_decklist_scraper.py")
OVERRIDE_DATEI = os.path.join(DATEN, "labs_tournament_id_overrides.json")


def _overrides_aus_der_datei():
    """{tid: eintrag} — die Quelle der Wahrheit, einmal gelesen."""
    with open(OVERRIDE_DATEI, encoding="utf-8") as f:
        return json.load(f).get("overrides") or {}


OVERRIDES = _overrides_aus_der_datei()
MIT_DATUM = {t: e for t, e in OVERRIDES.items()
             if isinstance(e, dict) and (e.get("tournament_date") or "").strip()}
MIT_LABS_ID = {t: e["labs_tournament_id"] for t, e in OVERRIDES.items()
               if isinstance(e, dict) and (e.get("labs_tournament_id") or "").strip()}


@pytest.fixture()
def pds():
    """Eine EIGENE Kopie von per_decklist_scraper.py.

    Bewusst `function`-Scope und ein eigener Modulname: jeder Test
    bekommt einen unberuehrten Modulzustand. Die JH-Abhaengigkeit
    dahinter ist dieselbe wie im echten Lauf — genau das soll geprueft
    werden.
    """
    for p in (CORE, SCRAPERS):
        if p not in sys.path:
            sys.path.insert(0, p)
    spec = importlib.util.spec_from_file_location("pds_r2_mechanik", QUELLE)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


@pytest.fixture()
def jh_echt():
    """Das ECHTE JH-Modul aus sys.modules — dasselbe, das der Scraper benutzt."""
    for p in (CORE, SCRAPERS):
        if p not in sys.path:
            sys.path.insert(0, p)
    import tournament_scraper_JH as m  # noqa: PLC0415
    return m


def _bestand_schreiben(pfad, kopf, zeilen):
    with open(pfad, "w", encoding="utf-8", newline="") as f:
        s = csv.DictWriter(f, fieldnames=kopf)
        s.writeheader()
        for z in zeilen:
            s.writerow(z)


def _bestand_lesen(pfad):
    with open(pfad, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


# ── 1. Der Scrape-Weg: welcher Wert landet in der Zeile? ─────────────────────

def _turnier_scrapen(pds, monkeypatch, limitless_tid, quelldatum):
    """`scrape_one_tournament` ohne Netz — nur die drei Holer sind ersetzt.

    Alles andere laeuft echt: der Datums-Override, `_parse_iso_date`,
    die Meta-Ableitung und die Labs-ID-Aufloesung. Zurueck kommt die
    erste erzeugte Zeile.
    """
    monkeypatch.setattr(pds, "get_tournament_info",
                        lambda url: {"name": "Testturnier", "date": quelldatum,
                                     "format": "TEF-CRI"})
    monkeypatch.setattr(pds, "parse_standings_rows", lambda url: [
        {"place": "1", "player_name": "Testspieler", "deck_id": "abc",
         "deck_url": "https://example.invalid/decks/list/abc",
         "deck_name": "Testdeck", "wins": "5", "losses": "0", "ties": "0"},
    ])
    monkeypatch.setattr(pds, "fetch_decklist_cards_and_title",
                        lambda url, db: ([{"name": "Testkarte", "set_code": "TEF",
                                           "card_number": "1", "count": 4,
                                           "type": "Pokemon",
                                           "is_ace_spec": False}], "Testdeck"))
    zeilen = pds.scrape_one_tournament(
        {"id": limitless_tid, "url": f"https://example.invalid/tournaments/{limitless_tid}"},
        card_db=None, delay=0, continuity_records=None)
    assert zeilen, "der Stub hat keine Zeile erzeugt — der Aufbau des Tests ist kaputt"
    return zeilen[0]


def test_mit_override_steht_exakt_der_override_wert_in_der_zeile(pds, monkeypatch):
    """Turnier 518: die Quelle sagt 10. Juni, hinterlegt ist der 12.

    Geprueft wird nicht "das Datum hat sich geaendert", sondern der
    exakte Sollwert — und der wird aus
    data/labs_tournament_id_overrides.json geholt, nicht abgeschrieben.
    """
    tid = "518"
    assert tid in MIT_DATUM, "Turnier 518 fuehrt keinen Datums-Override mehr"
    soll = pds._parse_iso_date(MIT_DATUM[tid]["tournament_date"])
    assert soll == "2026-06-12", (
        f"der hinterlegte Wert fuer 518 ist {soll!r} — die Quelle "
        "labs/0070 nennt June 12-14, 2026")

    zeile = _turnier_scrapen(pds, monkeypatch, tid, "10th June 2026")
    assert zeile["tournament_date"] == soll, (
        f"geschrieben wurde {zeile['tournament_date']!r} statt des "
        f"hinterlegten {soll!r} — der Scraper geht am Override vorbei")


def test_ohne_override_steht_exakt_das_quelldatum_in_der_zeile(pds, monkeypatch):
    """Die andere Haelfte der Zusage: wo nichts hinterlegt ist, wird
    nichts erfunden. Das Datum ist absichtlich eines, das nirgends
    hinterlegt ist — ein pauschal gesetzter Wert faellt sofort auf."""
    tid = "540"
    assert tid not in MIT_DATUM, "540 hat inzwischen einen Override — Test anpassen"
    zeile = _turnier_scrapen(pds, monkeypatch, tid, "6th June 2026")
    assert zeile["tournament_date"] == "2026-06-06", (
        f"ohne hinterlegten Override wurde {zeile['tournament_date']!r} "
        "geschrieben statt des Quelldatums 2026-06-06")


def test_der_override_zieht_die_labs_id_mit_in_die_zeile(pds, monkeypatch):
    """`tournament_id` ist die Spalte, ueber die die Seite joint.

    Fuer 518 kommt sie aus derselben Datei (0070). Faellt die
    Zuordnung aus, steht dort '' — und die Zeile findet im Frontend
    weder Turniergroesse noch Spielerhistorie."""
    zeile = _turnier_scrapen(pds, monkeypatch, "518", "10th June 2026")
    assert zeile["tournament_id"] == MIT_LABS_ID["518"] == "0070", (
        f"die Labs-ID wurde als {zeile['tournament_id']!r} geschrieben — "
        "die hinterlegte Zuordnung 518 -> 0070 hat nicht gegriffen")


# ── 2. Alle zehn Labs-ID-Zuordnungen, jede einzeln ───────────────────────────

@pytest.mark.parametrize("cards_tid,labs_tid", sorted(MIT_LABS_ID.items()))
def test_jede_hinterlegte_labs_zuordnung_greift(jh_echt, cards_tid, labs_tid):
    """Die Zuordnungen existieren, weil der Namensabgleich hier bricht
    (Sevilla/Seville, EUIC/International Championship London, Worlds
    2026/World Championship San Francisco). Wird die Datei nicht
    gelesen, faellt `_resolve_labs_tournament_id` auf den Namensabgleich
    zurueck — und der findet fuer diese zehn nichts.

    Der Name wird darum absichtlich leer uebergeben: was hier
    herauskommt, kann NUR aus dem Override stammen.
    """
    assert jh_echt._resolve_labs_tournament_id("", "", cards_tid) == labs_tid, (
        f"die Zuordnung {cards_tid} -> {labs_tid} greift nicht")


# Stand, gegen den verglichen wird. Es ist eine UNTERGRENZE, kein
# Sollwert: die Datei waechst, wenn ein Turniername wieder einmal
# auseinanderlaeuft. Ein Verlust dagegen heisst, dass jemand eine
# nachgeschlagene Entscheidung weggeworfen hat — und dieses Repo wirft
# Belege nicht stillschweigend weg (CLAUDE.md, 13.09.2026).
MINDESTENS_ZUORDNUNGEN = 10      # gemessen 22.09.2026 (mit 577 sind es 11)


def test_die_zuordnungen_gehen_nicht_verloren(jh_echt):
    """Ein Waechter fuer den Waechter: faellt die Datei weg oder wird sie
    leer gelesen, steht der Parametersatz oben ploetzlich auf null
    Faellen und die Tests darueber verschwinden lautlos.

    HIER STAND BIS ZUM 22.09.2026 `== 10`. Das war die falsche Form.
    An diesem Tag kam mit 577 (Regional Baltimore) eine elfte Zuordnung
    dazu — eine REPARATUR, die 559 Decklisten ihre Bilanz zurueckgab —
    und die Zusicherung machte daraus einen roten Deploy. Genau die
    Sorte Stillstand, die CLAUDE.md seit dem 12.09.2026 beschreibt:
    `== n` und `<= n` brechen durch Zuwachs, `>= n` nicht.
    """
    geladen = jh_echt._load_labs_id_overrides()
    assert len(MIT_LABS_ID) >= MINDESTENS_ZUORDNUNGEN, (
        f"data/labs_tournament_id_overrides.json fuehrt {len(MIT_LABS_ID)} "
        f"Labs-Zuordnungen, am 22.09.2026 waren es {MINDESTENS_ZUORDNUNGEN}. "
        "Ein Verlust ist hier immer ein Fehler — jede Zeile ist eine von "
        "Hand nachgeschlagene Entscheidung")
    assert len(geladen) == len(MIT_LABS_ID), (
        f"das JH-Modul laedt {len(geladen)} Zuordnungen, die Datei fuehrt "
        f"{len(MIT_LABS_ID)} — es sucht die Datei am falschen Ort oder liest "
        "sie unvollstaendig")


# ── 3. Der Nachtrag: welcher Wert, aus welchem Verzeichnis ───────────────────

def test_der_nachtrag_schreibt_exakt_den_hinterlegten_wert(pds, tmp_path):
    """Ein Turnier MIT und eines OHNE Override in derselben Datei.

    Das Datum des Turniers ohne Override ist absichtlich absurd
    (1999-01-01): wuerde der Nachtrag irgendetwas pauschal setzen —
    heute, den ersten Override, das Datum des Nachbarn — waere es hier
    zu sehen.
    """
    kopf = pds.CSV_FIELDS
    zeilen = [
        {**{k: "" for k in kopf}, "limitless_tournament_id": "518",
         "tournament_date": "2026-06-10"},
        {**{k: "" for k in kopf}, "limitless_tournament_id": "540",
         "tournament_date": "1999-01-01"},
    ]
    pfad = tmp_path / "bestand.csv"
    _bestand_schreiben(pfad, kopf, zeilen)

    bericht = pds.datum_nachtragen(str(pfad), datenverzeichnis=DATEN)
    neu = _bestand_lesen(pfad)

    soll = pds._parse_iso_date(MIT_DATUM["518"]["tournament_date"])
    assert neu[0]["tournament_date"] == soll
    assert neu[1]["tournament_date"] == "1999-01-01", (
        "ein Turnier ohne hinterlegten Override wurde angefasst")
    assert bericht["je_turnier"] == {
        "518": {"von": "2026-06-10", "auf": soll, "zeilen": 1}}, (
        f"der Bericht sagt {bericht['je_turnier']} — er soll Turnier, "
        "Ausgangswert, Zielwert und Zeilenzahl genau benennen")


def test_das_datenverzeichnis_bestimmt_wirklich_die_quelle(pds, tmp_path):
    """BEFUND B2 (07.09.2026): der Parameter war wirkungslos.

    Gesetzt wurde `get_data_dir`, waehrend `_overrides_verzeichnis()`
    den Ort bestimmt und `get_data_dir()` nur noch Rueckfall ist. Der
    Nachtrag las also immer data/ — egal was der Aufrufer sagte.

    Hier steht in tmp_path eine erfundene Override-Datei: sie kennt 540
    (in data/ ohne Override) und kennt 518 NICHT (in data/ mit
    Override). Liest der Nachtrag das uebergebene Verzeichnis, dreht
    sich das Ergebnis genau um.
    """
    eigenes = tmp_path / "eigenes_daten"
    eigenes.mkdir()
    (eigenes / "labs_tournament_id_overrides.json").write_text(json.dumps({
        "overrides": {
            "540": {"labs_tournament_id": "0099",
                    "tournament_date": "3rd March 2033",
                    "date_reason": "erfunden, nur fuer diesen Test"},
        }
    }), encoding="utf-8")

    kopf = pds.CSV_FIELDS
    zeilen = [
        {**{k: "" for k in kopf}, "limitless_tournament_id": "518",
         "tournament_date": "2026-06-10"},
        {**{k: "" for k in kopf}, "limitless_tournament_id": "540",
         "tournament_date": "2026-06-06"},
    ]
    pfad = tmp_path / "bestand.csv"
    _bestand_schreiben(pfad, kopf, zeilen)

    bericht = pds.datum_nachtragen(str(pfad), datenverzeichnis=str(eigenes))
    neu = _bestand_lesen(pfad)

    assert neu[1]["tournament_date"] == "2033-03-03", (
        f"540 traegt {neu[1]['tournament_date']!r} — die Override-Datei in "
        "dem uebergebenen Verzeichnis wurde nicht gelesen, der Parameter "
        "datenverzeichnis ist wirkungslos")
    assert neu[0]["tournament_date"] == "2026-06-10", (
        f"518 traegt {neu[0]['tournament_date']!r} — es wurde aus data/ "
        "gelesen statt aus dem uebergebenen Verzeichnis")
    assert bericht["geaendert"] == 1


def test_ein_unlesbarer_override_fasst_nichts_an(pds, tmp_path):
    """"Sommer 2026" ist kein Datum. Lieber nichts schreiben als raten —
    ein halb geparster Wert in tournament_date waere schlimmer als der
    alte."""
    eigenes = tmp_path / "eigenes_daten"
    eigenes.mkdir()
    (eigenes / "labs_tournament_id_overrides.json").write_text(json.dumps({
        "overrides": {"518": {"tournament_date": "Sommer 2026",
                              "date_reason": "unlesbar, nur fuer diesen Test"}}
    }), encoding="utf-8")

    kopf = pds.CSV_FIELDS
    zeilen = [{**{k: "" for k in kopf}, "limitless_tournament_id": "518",
               "tournament_date": "2026-06-10"}]
    pfad = tmp_path / "bestand.csv"
    _bestand_schreiben(pfad, kopf, zeilen)

    bericht = pds.datum_nachtragen(str(pfad), datenverzeichnis=str(eigenes))
    neu = _bestand_lesen(pfad)
    assert neu[0]["tournament_date"] == "2026-06-10", (
        f"aus einem unlesbaren Override wurde {neu[0]['tournament_date']!r} "
        "gemacht")
    assert bericht["geaendert"] == 0
    assert bericht["geschrieben"] is False


# ── 4. Der Nachtrag darf das globale Modul nicht verbiegen ───────────────────

def test_der_nachtrag_gibt_das_jh_modul_unveraendert_zurueck(pds, jh_echt, tmp_path):
    """BEFUND B1 (07.09.2026), die Ursache der Scheingruen-Meldung.

    `datum_nachtragen` setzte `_jh.get_data_dir = lambda: datenverzeichnis`
    auf dem ECHTEN Modul in sys.modules und nahm es nie zurueck. Jeder
    spaeter laufende Test sah danach ein umgebogenes Modul — auch der
    Wachhund, dessen Docstring "biegt bewusst NICHTS um" sagt. Folge:
    das vollstaendige Zurueckdrehen des Fixes liess die Suite gruen.

    Geprueft wird auf IDENTITAET der Funktionsobjekte, nicht auf
    Gleichheit ihrer Rueckgabe: ein Lambda, das zufaellig denselben Pfad
    liefert, waere trotzdem eine dauerhafte Veraenderung.
    """
    vorher = {
        "_overrides_verzeichnis": getattr(jh_echt, "_overrides_verzeichnis", None),
        "get_data_dir": jh_echt.get_data_dir,
        "_DATE_OVERRIDES_CACHE": jh_echt._DATE_OVERRIDES_CACHE,
        "_LABS_ID_OVERRIDES_CACHE": jh_echt._LABS_ID_OVERRIDES_CACHE,
    }
    eigenes = tmp_path / "eigenes_daten"
    eigenes.mkdir()
    (eigenes / "labs_tournament_id_overrides.json").write_text(json.dumps({
        "overrides": {"540": {"tournament_date": "3rd March 2033"}}
    }), encoding="utf-8")

    kopf = pds.CSV_FIELDS
    pfad = tmp_path / "bestand.csv"
    _bestand_schreiben(pfad, kopf, [
        {**{k: "" for k in kopf}, "limitless_tournament_id": "540",
         "tournament_date": "2026-06-06"}])
    pds.datum_nachtragen(str(pfad), datenverzeichnis=str(eigenes))

    assert getattr(jh_echt, "_overrides_verzeichnis", None) is vorher["_overrides_verzeichnis"], (
        "tournament_scraper_JH._overrides_verzeichnis ist nach dem Nachtrag "
        "ein anderes Objekt — der Monkeypatch wurde nicht zurueckgenommen")
    assert jh_echt.get_data_dir is vorher["get_data_dir"], (
        "tournament_scraper_JH.get_data_dir ist nach dem Nachtrag ein anderes "
        "Objekt — der Monkeypatch wurde nicht zurueckgenommen. Genau das hat "
        "am 07.09.2026 den Wachhund blind gemacht")
    assert jh_echt._DATE_OVERRIDES_CACHE == vorher["_DATE_OVERRIDES_CACHE"], (
        "der Datums-Cache traegt nach dem Nachtrag den Inhalt des fremden "
        "Verzeichnisses")
    assert jh_echt._LABS_ID_OVERRIDES_CACHE == vorher["_LABS_ID_OVERRIDES_CACHE"]

    # Und die Probe aufs Exempel: der echte Override gilt danach wieder.
    assert jh_echt._datum_mit_override("518", "10th June 2026") == \
        MIT_DATUM["518"]["tournament_date"]


# ── 5. Der reihenfolgefeste Wachhund ─────────────────────────────────────────

_KINDPROGRAMM = textwrap.dedent("""
    import json, os, sys
    sys.path.insert(0, {core!r})
    sys.path.insert(0, {scrapers!r})
    import tournament_scraper_JH as jh
    print("---MESSUNG---" + json.dumps({{
        "datum": sorted(jh._load_date_overrides()),
        "labs": jh._load_labs_id_overrides(),
        "518": jh._datum_mit_override("518", "10th June 2026"),
        "ohne_override": jh._datum_mit_override("540", "6th June 2026"),
    }}))
""")


def test_ein_frischer_prozess_findet_die_overrides(tmp_path):
    """Derselbe Befund wie in test_per_decklist_datum_override.py — aber
    reihenfolgefest.

    Der Wachhund dort laeuft im selben Prozess wie alle anderen Tests.
    Am 07.09.2026 hat genau das ihn blind gemacht: ein frueherer Test
    hatte `get_data_dir` auf dem echten Modul umgebogen, und der Fehler,
    den er bewachen soll, war fuer ihn unsichtbar. Ein neuer Prozess mit
    einem FREMDEN Arbeitsverzeichnis kann so nicht getaeuscht werden.

    PRAEZISIERUNG zur Aussage "wird nie gelesen": zu stark. Der Ablauf
    .github/workflows/per-decklist-scrape.yml kopiert die Datei in
    Zeile 102 vor dem Lauf nach backend/core/data/ — dort fand
    get_data_dir() sie sehr wohl. weekly-full-update.yml tut das nicht
    (Zeile 522 ruft denselben Scraper auf) und ein Lauf von Hand
    ebenfalls nicht. Der Scraper hing also davon ab, dass ein
    Workflow-Schritt ihm die Datei zufaellig hinlegt. Genau diese
    Abhaengigkeit prueft dieser Test weg: kein Seeding, fremdes
    Arbeitsverzeichnis, und die Overrides muessen trotzdem da sein.
    """
    programm = _KINDPROGRAMM.format(core=CORE, scrapers=SCRAPERS)
    lauf = subprocess.run([sys.executable, "-c", programm],
                          cwd=str(tmp_path), capture_output=True, text=True,
                          timeout=180)
    assert lauf.returncode == 0, (
        f"der frische Prozess ist gescheitert:\n{lauf.stdout}\n{lauf.stderr}")
    marke = [z for z in lauf.stdout.splitlines() if z.startswith("---MESSUNG---")]
    assert marke, f"keine Messzeile in der Ausgabe:\n{lauf.stdout}\n{lauf.stderr}"
    gemessen = json.loads(marke[0][len("---MESSUNG---"):])

    assert gemessen["datum"] == sorted(MIT_DATUM), (
        f"ein frischer Prozess laedt die Datums-Overrides {gemessen['datum']} "
        f"statt {sorted(MIT_DATUM)} — er sucht die Datei an einem Ort, an dem "
        "sie nur nach einem Seeding liegt")
    assert gemessen["labs"] == MIT_LABS_ID, (
        f"ein frischer Prozess laedt die Labs-Zuordnungen {gemessen['labs']} "
        f"statt {MIT_LABS_ID}")
    assert gemessen["518"] == MIT_DATUM["518"]["tournament_date"]
    assert gemessen["ohne_override"] == "6th June 2026", (
        "ein Turnier ohne Override bekam im frischen Prozess ein anderes "
        "Datum als das der Quelle")


def test_der_wachhund_haengt_nicht_am_arbeitsverzeichnis(tmp_path):
    """Der Ort der Override-Datei wird aus dem Ort der MODULDATEI
    hergeleitet, nicht aus dem Arbeitsverzeichnis. Sonst waere der Fix
    nur ein anderer Zufall: gruen, solange man im Repo steht."""
    programm = _KINDPROGRAMM.format(core=CORE, scrapers=SCRAPERS)
    unter = tmp_path / "ganz" / "woanders"
    unter.mkdir(parents=True)
    lauf = subprocess.run([sys.executable, "-c", programm],
                          cwd=str(unter), capture_output=True, text=True,
                          timeout=180)
    assert lauf.returncode == 0, f"{lauf.stdout}\n{lauf.stderr}"
    marke = [z for z in lauf.stdout.splitlines() if z.startswith("---MESSUNG---")]
    gemessen = json.loads(marke[0][len("---MESSUNG---"):])
    assert "518" in gemessen["datum"] and gemessen["labs"] == MIT_LABS_ID, (
        f"aus {unter} heraus wurden {gemessen['datum']} / {gemessen['labs']} "
        "geladen — die Overrides haengen am Arbeitsverzeichnis")
