"""Gruen, aber Daten still — die Zurueckhalte-Pruefung des Data Guardians (SC-37).

Vom 13. bis 17.10.2026 rollten acht gruene Champions-Laeufe ihre ganze
Familie zurueck; niemand erfuhr es. scripts/zurueckgehalten.py meldet jede
Datei, die der juengste UND der vorherige Lauf eines Ablaufs zurueckgehalten
haben — es sei denn, ein anderer Ablauf hat sie seither geliefert.
Geprueft wird die Funktion (ausgefuehrt), dazu der Draht zwischen dem
Wortlaut des Tors und dem Muster des Lesers und der Einbau im Guardian.
"""
import importlib.util
import os
import re

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _modul():
    spec = importlib.util.spec_from_file_location(
        "zurueckgehalten_test", os.path.join(WURZEL, "scripts", "zurueckgehalten.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def _lauf(nr, zeit, *gehalten):
    return {"id": nr, "nummer": nr, "zeit": zeit, "url": f"u/{nr}",
            "gehalten": list(gehalten), "erstlauf": ["FAILED tests/x.py::y"]}


U, P = "data/champions_usage.json", "data/champions_pokedex.json"


def test_zweimal_in_folge_ist_ein_befund():
    m = _modul()
    f = m.befunde({"usage.yml": [_lauf(3, "2026-10-16T05:08", U, P),
                                 _lauf(2, "2026-10-15T05:08", U),
                                 _lauf(1, "2026-10-14T05:08")]})
    assert [(x["datei"], x["serie"], x["seit"]) for x in f] == [(U, 2, "2026-10-15T05:08")]
    assert "CRITICAL" in m.als_markdown(f) and "usage.yml" in m.als_markdown(f)


def test_einmal_ist_bestandsschutz_kein_befund():
    m = _modul()
    assert m.befunde({"usage.yml": [_lauf(2, "2026-10-15T05:08", U),
                                    _lauf(1, "2026-10-14T05:08")]}) == []
    # Serie unterbrochen: aelteres Zurueckhalten zaehlt nicht mit.
    assert m.befunde({"usage.yml": [_lauf(3, "2026-10-16T05:08", U),
                                    _lauf(2, "2026-10-15T05:08"),
                                    _lauf(1, "2026-10-14T05:08", U)]}) == []


def test_ein_anderer_ablauf_hat_inzwischen_geliefert():
    """17.10.: Usage #125 hielt zurueck, Replica #162 lieferte drei Stunden spaeter."""
    m = _modul()
    laeufe = {"usage.yml": [_lauf(2, "2026-10-17T05:07", U), _lauf(1, "2026-10-16T05:08", U)]}
    assert m.befunde(laeufe, {U: "2026-10-17T08:11"}) == []
    assert len(m.befunde(laeufe, {U: "2026-10-14T06:30"})) == 1, \
        "ein Commit VOR dem Zurueckhalten ist keine Lieferung"


def test_die_serie_zaehlt_bis_zum_ende_der_abgefragten_laeufe():
    m = _modul()
    f = m.befunde({"u.yml": [_lauf(2, "b", U), _lauf(1, "a", U)]})
    assert f[0]["voll"] and "2+" in m.als_markdown(f)


def test_der_wortlaut_des_tors_passt_zum_muster_des_lesers():
    """Auch Text ist Code: aendert jemand die Annotation im Tor, liest der
    Guardian nichts mehr — und meldet dann still nichts."""
    m = _modul()
    tor = open(os.path.join(WURZEL, "scripts", "tor_vor_dem_push.sh"), encoding="utf-8").read()
    zeile = re.search(r'echo "::warning::(Tor: \$f bleibt auf dem alten Stand[^"]*)"', tor)
    assert zeile, "die Rueckroll-Annotation steht nicht mehr im Tor"
    assert m.GEHALTEN.match(zeile.group(1).replace("$f", U)).group(1) == U
    assert "s/^/::warning::Tor, erster Durchlauf: /" in tor
    assert m.ERSTLAUF.match("Tor, erster Durchlauf: ✗ tests/unit/a.js — 1 failure(s)")


def test_der_guardian_ruft_die_pruefung_und_zaehlt_sie_mit():
    yml = open(os.path.join(WURZEL, ".github", "workflows", "data-guardian.yml"),
               encoding="utf-8").read()
    assert "python3 scripts/zurueckgehalten.py" in yml
    assert "STILL: ${{ steps.still.outputs.anzahl }}" in yml
    assert "${STILL:-0}" in yml, "ohne STILL in der Summe schliesst der Guardian das Issue trotz Befund"
    assert "/comments" in yml, "ohne Kommentar verschickt ein neuer Befund im offenen Issue keine Mail"


def test_jeder_ablauf_mit_tor_wird_abgefragt():
    m = _modul()
    alle = m.ablaeufe_mit_tor(os.path.join(WURZEL, ".github", "workflows"))
    assert "champions-usage-refresh.yml" in alle and "champions-replica-scrape.yml" in alle
    assert len(alle) >= 15, f"nur {len(alle)} Ablaeufe mit Tor gefunden"
