"""Der Datums-Override muss auch in der Einzellisten-Datei ankommen.

BEFUND (07.09.2026), an der Quelle belegt:

  labs.limitlesstcg.com/0070/decks fuehrt im Kopf
  "International Championship New Orleans - June 12-14, 2026 - 3752 players".

  data/labs_tournament_decks.csv                traegt fuer 0070  2026-06-12  (richtig)
  data/tournament_decklists_per_player.csv      traegt fuer 0070  2026-06-10  (falsch)

  Betroffen sind 16.960 Zeilen — das ganze Turnier.

URSACHE, im Code nachgewiesen:

  Limitless liefert das Turnier auf seiner eigenen Seite mit dem falschen
  Datum aus (dem 10. Juni, einem Mittwoch). Genau dafuer gibt es seit dem
  22.08.2026 data/labs_tournament_id_overrides.json und
  tournament_scraper_JH._datum_mit_override(). Der JH-Scraper geht an
  BEIDEN Schreibstellen durch den Override — deshalb steht in
  data/tournament_cards_data_overview.csv das richtige "12th June 2026".

  backend/scrapers/per_decklist_scraper.py importiert aus demselben Modul
  _parse_iso_date, _resolve_labs_tournament_id und _derive_meta_from_date_JH
  — aber NICHT _datum_mit_override. Es schreibt darum das rohe Quelldatum
  weiter. Der Override war da, die Einzellisten-Datei ging nur an ihm vorbei.

Die Regel dieses Repos (siehe test_turnierdatum_override.py): eine
Handkorrektur allein in der CSV waere eine stille Reparatur, die der
naechste Lauf ueberschreibt. Also muss der Scraper durch den Override
gehen UND der Bestand offline nachgetragen werden.
"""

import csv
import importlib.util
import os
import re
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
DATEN = os.path.join(WURZEL, "data")
QUELLE = os.path.join(WURZEL, "backend", "scrapers", "per_decklist_scraper.py")
PER_PLAYER = DATEN   # SC-45: Ordner mit den Auszuegen je Format und Monat
sys.path.insert(0, os.path.join(WURZEL, "scripts"))
import per_player_auszuege as _ppa  # noqa: E402
LABS = os.path.join(DATEN, "labs_tournament_decks.csv")


@pytest.fixture(scope="module")
def quelltext():
    with open(QUELLE, encoding="utf-8-sig") as f:
        return f.read()


@pytest.fixture(scope="module")
def jh():
    """Das JH-Modul, aus dem der Override kommt."""
    sys.path.insert(0, os.path.join(WURZEL, "backend", "core"))
    pfad = os.path.join(WURZEL, "backend", "scrapers", "tournament_scraper_JH.py")
    spec = importlib.util.spec_from_file_location("jh_fuer_per_decklist", pfad)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    m.get_data_dir = lambda: DATEN
    m._DATE_OVERRIDES_CACHE = None
    return m


# ── Die Regel ────────────────────────────────────────────────────────────────

def test_der_scraper_holt_sich_den_override(quelltext):
    """Ohne den Import kann er ihn nicht anwenden."""
    assert re.search(r"^\s*_datum_mit_override,\s*$", quelltext, re.M), (
        "per_decklist_scraper.py importiert _datum_mit_override nicht aus "
        "tournament_scraper_JH — es schreibt dann das rohe Quelldatum weiter")


def test_das_geschriebene_datum_geht_durch_den_override(quelltext):
    """Die eine Stelle, die tournament_date fuer eine Zeile bestimmt.

    Sie liest heute `info.get('date', '')` von der Turnierseite. Genau
    dieser Wert ist bei Turnier 518 falsch, und genau ihn korrigiert der
    Override.
    """
    treffer = re.search(r"t_date_raw\s*=\s*(.+)", quelltext)
    assert treffer, "die Zuweisung an t_date_raw wurde umbenannt oder entfernt"
    assert "_datum_mit_override" in treffer.group(1), (
        "t_date_raw wird ohne Override gesetzt: " + treffer.group(1).strip())


def test_andere_turniere_bleiben_unberuehrt(jh):
    """Der Override gilt fuer 518 — und nur dort, wo einer hinterlegt ist."""
    assert jh._datum_mit_override("518", "10th June 2026") == "12th June 2026"
    assert jh._datum_mit_override("540", "6th June 2026") == "6th June 2026"
    assert jh._datum_mit_override("515", "28th August 2026") == "28th August 2026"


# ── Der ausgelieferte Bestand ────────────────────────────────────────────────

def _per_player_daten():
    """{limitless_tid: {datum: zeilen}} aus der Einzellisten-Datei."""
    aus = {}
    if True:
        for r in _ppa.quelle_zeilen(PER_PLAYER):
            lid = (r.get("limitless_tournament_id") or "").strip()
            d = (r.get("tournament_date") or "").strip()
            aus.setdefault(lid, {}).setdefault(d, 0)
            aus[lid][d] += 1
    return aus


def test_naic_traegt_das_korrigierte_datum():
    daten = _per_player_daten()
    assert "518" in daten, "Turnier 518 (NAIC 2026) fehlt in der Einzellisten-Datei"
    assert list(daten["518"]) == ["2026-06-12"], (
        f"Turnier 518 traegt {daten['518']} statt 2026-06-12 — "
        "die Quelle sagt June 12-14, 2026")


def test_jedes_turnier_traegt_genau_ein_datum():
    """Ein Turnier mit zwei Daten waere ein halb nachgetragener Bestand."""
    daten = _per_player_daten()
    mehrdeutig = {lid: d for lid, d in daten.items() if len(d) > 1}
    assert not mehrdeutig, f"Turniere mit mehreren Daten: {mehrdeutig}"


def test_die_beiden_dateien_sind_sich_ueber_die_daten_einig():
    """labs_tournament_decks.csv und die Einzellisten-Datei beschreiben
    dieselben Turniere. Weichen ihre Daten ab, zeigt die Seite je nach
    Reiter ein anderes Datum fuer dasselbe Ereignis."""
    labs = {}
    with open(LABS, encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            labs.setdefault(r["tournament_id"], (r.get("tournament_date") or "").strip())

    abweichungen = []
    if True:
        gesehen = set()
        for r in _ppa.quelle_zeilen(PER_PLAYER):
            tid = (r.get("tournament_id") or "").strip()
            d = (r.get("tournament_date") or "").strip()
            if not tid or (tid, d) in gesehen:
                continue
            gesehen.add((tid, d))
            erwartet = labs.get(tid)
            if erwartet and d != erwartet:
                abweichungen.append(f"{tid}: per_player={d} labs={erwartet}")
    assert not abweichungen, "Datumsabweichung:\n  " + "\n  ".join(abweichungen)


# ── Der Nachtrag-Schalter ────────────────────────────────────────────────────

def test_der_nachtrag_schalter_existiert(quelltext):
    """Der Bestand laesst sich ohne Netz korrigieren — sonst muesste man
    fuer eine Datumskorrektur 30.459 Zeilen neu scrapen."""
    assert "--datum-nachtragen" in quelltext, (
        "kein Offline-Schalter zum Nachtragen der Datumsspalte")


def test_der_nachtrag_ruehrt_nur_die_datumsspalte_an(tmp_path):
    """Der Kern der Zusage: alle anderen Spalten bleiben Zeichen fuer
    Zeichen gleich. Geprueft an einer kleinen Datei mit demselben Kopf
    wie der echte Bestand."""
    sys.path.insert(0, os.path.join(WURZEL, "backend", "core"))
    sys.path.insert(0, os.path.join(WURZEL, "backend", "scrapers"))
    spec = importlib.util.spec_from_file_location("pds_fuer_test", QUELLE)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)

    pfad = tmp_path / "per_player.csv"
    kopf = m.CSV_FIELDS
    zeilen = [
        # 518 hat einen Override (10. -> 12. Juni), 540 keinen.
        {**{k: f"w_{k}" for k in kopf},
         "limitless_tournament_id": "518", "tournament_date": "2026-06-10"},
        {**{k: f"x_{k}" for k in kopf},
         "limitless_tournament_id": "540", "tournament_date": "2026-06-06"},
    ]
    with open(pfad, "w", encoding="utf-8", newline="") as f:
        s = csv.DictWriter(f, fieldnames=kopf)
        s.writeheader()
        for z in zeilen:
            s.writerow(z)

    bericht = m.datum_nachtragen(str(pfad), datenverzeichnis=DATEN)

    with open(pfad, encoding="utf-8", newline="") as f:
        neu = list(csv.DictReader(f))

    assert len(neu) == 2
    assert neu[0]["tournament_date"] == "2026-06-12", "518 wurde nicht korrigiert"
    assert neu[1]["tournament_date"] == "2026-06-06", "540 haette gleich bleiben muessen"
    for alt, jetzt in zip(zeilen, neu):
        for spalte in kopf:
            if spalte == "tournament_date":
                continue
            assert alt[spalte] == jetzt[spalte], (
                f"Spalte {spalte} wurde mitveraendert: "
                f"{alt[spalte]!r} -> {jetzt[spalte]!r}")
    assert bericht["geaendert"] == 1
    assert bericht["zeilen_vorher"] == bericht["zeilen_nachher"] == 2


# ── Der Override muss auch DA sein, wo der echte Lauf ihn sucht ──────────────

def test_der_override_wird_im_echten_lauf_gefunden():
    """ZUSATZBEFUND (07.09.2026), gemessen ohne jedes Umbiegen:

        >>> import tournament_scraper_JH as jh
        >>> jh.get_data_dir()
        '.../backend/core/data'          # im Repo nur .log-Dateien
        >>> jh._load_date_overrides()
        {}

    `get_data_dir()` haengt an `get_app_path()`, und das ist der Ordner
    von backend/core/card_scraper_shared.py — nicht die Wurzel des Repos.
    Die Override-Datei liegt aber in data/.

    PRAEZISIERUNG (07.09.2026, Nachpruefung): "wird nie gelesen" waere zu
    stark. Nachgezaehlt in .github/workflows/:

      per-decklist-scrape.yml:102 kopiert labs_tournament_id_overrides.json
        vor dem Lauf nach backend/core/data/ (Schritt "Seed
        backend/core/data/ from data/", Zeile 97) und ruft den Scraper
        erst danach auf (Zeile 183). In DIESEM Ablauf lag die Datei da,
        wo get_data_dir() sie sucht — sie wurde gelesen.
      weekly-full-update.yml seedet sie NICHT (geprueft:
        `grep -n labs_tournament_id_overrides.json` findet dort nichts),
        ruft den Scraper aber auf (Zeile 522). In DIESEM Ablauf und in
        jedem Lauf von Hand fand get_data_dir() nichts, und
        _load_date_overrides() gab {} zurueck.

    Der Fehler war also nicht "nie gelesen", sondern: gelesen wurde nur,
    wenn ein Workflow-Schritt die Datei vorher zufaellig hinlegte. Genau
    diese Abhaengigkeit nimmt `_overrides_verzeichnis()` weg — es sucht
    die reine Lesequelle zuerst im Repo.

    Dieser Test biegt bewusst NICHTS um. Weil er im selben Prozess wie
    alle anderen laeuft und ein frueherer Test das Modul umgebogen haben
    koennte (genau das war der Fall, bis `datum_nachtragen` seinen
    Monkeypatch zurueckgab), stellt
    tests/python/test_r2_override_mechanik.py dieselbe Frage zusaetzlich
    in einem frischen Unterprozess.
    """
    sys.path.insert(0, os.path.join(WURZEL, "backend", "core"))
    sys.path.insert(0, os.path.join(WURZEL, "backend", "scrapers"))
    import tournament_scraper_JH as jh_roh  # noqa: PLC0415
    jh_roh._DATE_OVERRIDES_CACHE = None
    jh_roh._LABS_ID_OVERRIDES_CACHE = None

    daten = jh_roh._load_date_overrides()
    assert "518" in daten, (
        "der Datums-Override fuer Turnier 518 wird im echten Lauf nicht "
        "geladen — er wird an einem Ort gesucht, an dem er nicht liegt")
    assert jh_roh._datum_mit_override("518", "10th June 2026") == "12th June 2026"
    assert jh_roh._load_labs_id_overrides(), (
        "auch die Labs-ID-Zuordnungen werden im echten Lauf nicht geladen")
