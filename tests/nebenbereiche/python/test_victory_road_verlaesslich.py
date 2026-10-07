# -*- coding: utf-8 -*-
"""Die Victory-Road-Scraper duerfen den Wochenlauf nicht mehr rot machen,
wenn NICHTS kaputt ist (Wochenlauf #178, 07.10.2026).

Zwei Ursachen, beide hier festgehalten:

1. Der Major-Scraper nahm als "zuletzt gelaufenes Turnier" die LADDER-Saison
   "Season M-6" (endete am 07.10.), die keine Platzierungen hat. Das trifft
   jedes Saisonende, nicht nur dieses.
2. Victory Road hat die Replika-Sammlung getauscht: 56 Eintraege mit Code,
   aber nur 4 mit vrpastes-Link (am 24.09.: 104 und 107). Die Schutzgrenze
   hat richtig verweigert — und den Lauf trotzdem rot gemacht.

Die Proben sind ECHT (verkleinert); keine Zusicherung nagelt einen
Wochenwert fest.
"""

import json
import os
import sys
from datetime import date, timedelta

import pytest

WURZEL = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, os.path.join(WURZEL, "backend", "scrapers"))
sys.path.insert(0, os.path.join(WURZEL, "backend", "core"))

pytest.importorskip("bs4")
vr = pytest.importorskip("victory_road_major_scraper")
vrr = pytest.importorskip("victory_road_replika_scraper")

PROBEN = os.path.join(WURZEL, "tests", "python", "fixtures")


def _lies(name):
    with open(os.path.join(PROBEN, name), encoding="utf-8") as f:
        return f.read()


@pytest.fixture(scope="module")
def replika_neu():
    return _lies("victoryroad_replika_2026-10-07.html")


@pytest.fixture(scope="module")
def turnier_html():
    return _lies("victoryroad_turnier.html")


@pytest.fixture(scope="module")
def paste_json():
    return json.loads(_lies("vrpastes_api_paste.json"))


def _kalender(zeilen):
    """Minimaler Kalender in der Struktur der Seite: Date | Event | Winner | Format."""
    kopf = "<tr><th>Date</th><th>Event</th><th>Winner</th><th>Format</th></tr>"
    z = "".join('<tr><td>%s</td><td><a href="%s">%s</a></td><td></td><td>M-C</td></tr>'
                % (d, u, n) for d, n, u in zeilen)
    return "<table>%s%s</table>" % (kopf, z)


# ── 1. Ladder-Saisons sind keine Turniere ────────────────────────────

class TestLadderSaison:

    def test_season_m6_wird_als_ladder_erkannt_ein_turnier_nicht(self):
        assert vr.ist_ladder_saison("Season M-6")
        assert vr.ist_ladder_saison("Season M-12 ")
        assert not vr.ist_ladder_saison("Baltimore Regional Championships")
        assert not vr.ist_ladder_saison("Seasonal Cup")

    def test_das_letzte_wochenende_nimmt_keine_ladder_saison(self):
        eintraege = vr.lies_kalender(_kalender([
            ("19–20 Sep 2026", "Baltimore Regional Championships", "/baltimore/"),
            ("9 Sep–7 Oct 2026", "Season M-6", "/season-m-6/"),
        ]))
        majors = vr.letztes_wochenende(eintraege, heute=date(2026, 10, 7))
        assert [m["name"] for m in majors] == ["Baltimore Regional Championships"]

    def test_geht_auf_das_davor_wenn_das_juengste_wochenende_nichts_hergibt(
            self, turnier_html, paste_json):
        kal = _kalender([
            ("26–27 Sep 2026", "Frankfurt Regional Championships", "/frankfurt/"),
            ("19–20 Sep 2026", "Baltimore Regional Championships", "/baltimore/"),
            ("9 Sep–7 Oct 2026", "Season M-6", "/season-m-6/"),
            ("5–6 Sep 2026", "Fueller A", "/a/"),
            ("1–2 Aug 2026", "Fueller B", "/b/"),
        ])   # mindestens 5 Zeilen, sonst gilt die Seite als umgebaut
        seiten = {
            vr.KALENDER_URL: kal,
            "/frankfurt/": "<html><body>noch keine Standings</body></html>",
            "/baltimore/": turnier_html,
        }
        d = vr.baue(heute=date(2026, 10, 7), hole_html=lambda u: seiten[u],
                    hole_paste_fn=lambda pid: paste_json)
        assert d["teams"], "es muss auf Baltimore zurueckgegangen werden"
        assert {t["turnier"] for t in d["teams"]} == {"Baltimore Regional Championships"}
        namen = [t["name"] for t in d["_meta"]["turniere"]]
        assert "Season M-6" not in namen


# ── 2. Bestand behalten statt rot ────────────────────────────────────

class TestBestandBehalten:

    def _bestand(self, tmp_path):
        ziel = tmp_path / "x.json"
        ziel.write_text(json.dumps({"_meta": {"erzeugt_am": "2026-10-02", "team_count": 1},
                                    "teams": [{"replica_code": "AAAAA"}]}), encoding="utf-8")
        return str(ziel)

    def test_bestand_bleibt_hinweis_ist_datiert_erzeugt_am_unveraendert(self, tmp_path, capsys):
        ziel = self._bestand(tmp_path)
        assert vr.behalte_bestand(ziel, "Seite umgebaut") == 0
        d = json.loads(open(ziel, encoding="utf-8").read())
        assert d["teams"] == [{"replica_code": "AAAAA"}]
        assert d["_meta"]["erzeugt_am"] == "2026-10-02", \
            "der Stempel darf NICHT neu gesetzt werden, sonst sieht die Frischepruefung nichts"
        assert d["_meta"]["quellenhinweis"] == {"datum": date.today().isoformat(),
                                                "grund": "Seite umgebaut"}
        assert "::warning::" in capsys.readouterr().out

    def test_ohne_bestand_bleibt_es_ein_fehler(self, tmp_path):
        assert vr.behalte_bestand(str(tmp_path / "gibtsnicht.json"), "x") == 1

    def test_trockenlauf_schreibt_nichts(self, tmp_path):
        ziel = self._bestand(tmp_path)
        vor = open(ziel, encoding="utf-8").read()
        assert vr.behalte_bestand(ziel, "x", trocken=True) == 0
        assert open(ziel, encoding="utf-8").read() == vor


# ── 3. Replika: Seite ohne Paste-Links ist nicht kaputt ──────────────

class TestReplikaOhnePaste:

    def test_die_probe_hat_sechs_codes_aber_nur_zwei_links(self, replika_neu):
        assert len(vrr.lies_sammlung(replika_neu, nur_mit_paste=False)) == 6
        assert len(vrr.lies_sammlung(replika_neu)) == 2

    def test_eine_seite_ohne_links_loest_keinen_aufbau_alarm_aus(self, replika_neu, paste_json):
        d = vrr.baue(hole_html=lambda u: replika_neu, hole_paste_fn=lambda pid: paste_json,
                     mindest=5, heute=date(2026, 10, 7))
        m = d["_meta"]
        assert m["eintraege_mit_code"] == 6
        assert m["ohne_paste"] == 4 and len(m["ohne_paste_codes"]) == 4
        assert m["ohne_paste_stand"] == "2026-10-07"
        assert len(d["teams"]) == 2

    def test_die_untergrenze_zaehlt_den_code_nicht_den_link(self, replika_neu, paste_json):
        with pytest.raises(RuntimeError, match="Aufbau"):
            vrr.baue(hole_html=lambda u: replika_neu, hole_paste_fn=lambda pid: paste_json,
                     mindest=7)

    def test_ein_bekanntes_team_ohne_link_behaelt_seine_teamliste(self, replika_neu, paste_json):
        code = "9NNN3N8A4G"   # Eric Rios, in der Probe OHNE Link
        bestand = {"_meta": {"erzeugt_am": "2026-10-02"},
                   "teams": [{"replica_code": code, "pokemon": [{"name": "Garchomp"}],
                              "zuletzt_gesehen": "2026-10-02"}]}
        d = vrr.baue(hole_html=lambda u: replika_neu, hole_paste_fn=lambda pid: paste_json,
                     mindest=5, bestand=bestand, heute=date(2026, 10, 7))
        t = [x for x in d["teams"] if x["replica_code"] == code]
        assert len(t) == 1 and t[0]["pokemon"] == [{"name": "Garchomp"}]
        assert t[0]["zuletzt_gesehen"] == "2026-10-07"
        assert code not in d["_meta"]["ohne_paste_codes"]
        assert d["_meta"]["ohne_paste"] == 3

    def test_team_das_von_der_seite_verschwand_bleibt_bis_zur_frist(self, replika_neu, paste_json):
        bestand = {"_meta": {"erzeugt_am": "2026-10-02"}, "teams": [
            {"replica_code": "ALT01", "pokemon": [{"name": "A"}], "zuletzt_gesehen": "2026-10-02"},
            {"replica_code": "ALT02", "pokemon": [{"name": "B"}], "zuletzt_gesehen": "2026-08-01"},
            {"replica_code": "ALT03", "pokemon": [{"name": "C"}]},   # ohne Datum: Stand der Datei
        ]}
        d = vrr.baue(hole_html=lambda u: replika_neu, hole_paste_fn=lambda pid: paste_json,
                     mindest=5, bestand=bestand, heute=date(2026, 10, 7))
        codes = {t["replica_code"]: t for t in d["teams"]}
        assert "ALT01" in codes and codes["ALT01"]["nicht_mehr_auf_quelle"] is True
        assert "ALT03" in codes
        assert "ALT02" not in codes, "ueber der Frist von %d Tagen" % vrr.BEHALTEN_TAGE
        assert d["_meta"]["entfallen_nach_frist"] == 1
        assert d["_meta"]["behalten_vom_bestand"] == 2
        assert [t["rank"] for t in d["teams"]] == list(range(1, len(d["teams"]) + 1))
        # Teams, die auf der Seite stehen, kommen VOR denen aus dem Bestand.
        live = [t for t in d["teams"] if not t.get("nicht_mehr_auf_quelle")]
        assert d["teams"][:len(live)] == live


# ── 4. main(): rot nur, wenn es wirklich nichts zu behalten gibt ─────

class TestMain:

    def _main(self, monkeypatch, tmp_path, html, paste_json, bestand=None):
        monkeypatch.setattr(vrr, "AUSGABE_DIR", str(tmp_path))
        monkeypatch.setattr(sys, "argv", ["x"])
        ziel = tmp_path / "victory_road_replika_teams.json"
        if bestand is not None:
            ziel.write_text(json.dumps(bestand), encoding="utf-8")
        echt = vrr.baue
        monkeypatch.setattr(vrr, "baue", lambda grenze=None, bestand=None: echt(
            hole_html=lambda u: html, hole_paste_fn=lambda pid: paste_json,
            bestand=bestand, heute=date(2026, 10, 7), mindest=5))
        return vrr.main(), ziel

    def test_seite_ohne_paste_links_ist_exit_0_mit_warnung(
            self, monkeypatch, tmp_path, capsys, replika_neu, paste_json):
        rc, ziel = self._main(monkeypatch, tmp_path, replika_neu, paste_json)
        assert rc == 0
        d = json.loads(ziel.read_text(encoding="utf-8"))
        assert d["_meta"]["ohne_paste"] == 4
        assert "::warning::" in capsys.readouterr().out

    def test_umgebaute_seite_mit_bestand_ist_exit_0_und_bestand_bleibt(
            self, monkeypatch, tmp_path, paste_json):
        bestand = {"_meta": {"erzeugt_am": "2026-10-02"}, "teams": [{"replica_code": "AAAAA"}]}
        rc, ziel = self._main(monkeypatch, tmp_path, "<html><body>neu</body></html>",
                              paste_json, bestand=bestand)
        assert rc == 0
        d = json.loads(ziel.read_text(encoding="utf-8"))
        assert d["teams"] == [{"replica_code": "AAAAA"}]
        assert "Aufbau" in d["_meta"]["quellenhinweis"]["grund"]

    def test_umgebaute_seite_ohne_bestand_bleibt_ein_fehler(
            self, monkeypatch, tmp_path, paste_json):
        rc, _ = self._main(monkeypatch, tmp_path, "<html></html>", paste_json)
        assert rc == 1
