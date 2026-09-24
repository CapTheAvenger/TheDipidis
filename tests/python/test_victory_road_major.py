# -*- coding: utf-8 -*-
"""Der Scraper fuer das letzte Major, gegen ECHTE Proben der Quelle.

Die Sandkiste erreicht victoryroad.pro und vrpastes.com nicht (Proxy 403,
gemessen 24.09.2026). Die Proben unter tests/python/fixtures/ sind deshalb
der einzige Weg, den Parser ohne Netz zu pruefen. Sie tragen ECHTE Werte in
der am 24.09.2026 gemessenen Tag-Struktur; entfernt sind nur die Bild-URLs,
die der Parser nicht liest.

KEINE Zusicherung hier nagelt einen Wochenwert fest. Geprueft werden
Eigenschaften des Parsers und Gleichungen gegen die Probe selbst — welcher
Spieler diese Woche gewonnen hat, ist jeder Zusicherung egal. Wo eine
Untergrenze noetig ist, steht sie als `>=`: ein Turnier darf wachsen.
"""

import json
import os
import sys
from datetime import date

import pytest

WURZEL = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(WURZEL, "backend", "scrapers"))
sys.path.insert(0, os.path.join(WURZEL, "backend", "core"))

pytest.importorskip("bs4")
vr = pytest.importorskip("victory_road_major_scraper")
vrr = pytest.importorskip("victory_road_replika_scraper")

PROBEN = os.path.join(WURZEL, "tests", "python", "fixtures")


def _lies(name):
    pfad = os.path.join(PROBEN, name)
    assert os.path.isfile(pfad), "Probe fehlt: %s" % pfad
    with open(pfad, encoding="utf-8") as f:
        return f.read()


@pytest.fixture(scope="module")
def kalender_html():
    return _lies("victoryroad_kalender.html")


@pytest.fixture(scope="module")
def turnier_html():
    return _lies("victoryroad_turnier.html")


@pytest.fixture(scope="module")
def replika_html():
    return _lies("victoryroad_replika.html")


@pytest.fixture(scope="module")
def paste_json():
    return json.loads(_lies("vrpastes_api_paste.json"))


# ── Datumsspanne ─────────────────────────────────────────────────────

class TestDatumsspanne:
    """Der Kalender schreibt Zeitraeume in vier Formen."""

    def test_die_gewoehnliche_form_mit_einem_monat(self):
        assert vr.datum_spanne("19–20 Sep 2026") == (date(2026, 9, 19), date(2026, 9, 20))

    def test_ein_einzelner_tag(self):
        assert vr.datum_spanne("5 Dec 2026") == (date(2026, 12, 5), date(2026, 12, 5))

    def test_ueber_einen_monatswechsel(self):
        assert vr.datum_spanne("31 Oct–1 Nov 2026") == (date(2026, 10, 31), date(2026, 11, 1))

    def test_ueber_den_jahreswechsel_beginnt_im_vorjahr(self):
        """Steht nur EIN Jahr da und laeuft der Zeitraum von Dez nach Jan,
        gehoert der erste Tag ins Vorjahr. Ohne diese Regel laege der
        Beginn elf Monate NACH dem Ende."""
        beginn, ende = vr.datum_spanne("31 Dec–1 Jan 2027")
        assert beginn == date(2026, 12, 31)
        assert ende == date(2027, 1, 1)
        assert beginn < ende

    def test_ohne_datum_kommt_nichts_zurueck(self):
        """"TBD" ist im Kalender ein normaler Zustand, kein Fehler."""
        assert vr.datum_spanne("TBD") is None
        assert vr.datum_spanne("") is None

    def test_der_bindestrich_wird_auch_akzeptiert(self):
        """Die Quelle setzt einen EN DASH. Ein gewoehnlicher Bindestrich
        darf denselben Zeitraum ergeben — sonst haengt der Parser an
        einem Zeichen, das eine fremde Quelle jederzeit tauschen kann."""
        assert vr.datum_spanne("19-20 Sep 2026") == vr.datum_spanne("19–20 Sep 2026")


# ── Kalender ─────────────────────────────────────────────────────────

class TestKalender:

    def test_die_probe_gibt_ueberhaupt_zeilen_her(self, kalender_html):
        """Vorpruefung gegen ein leeres Bestehen: ohne sie waeren alle
        Zusicherungen darunter gruen, weil nichts geprueft wurde."""
        assert len(vr.lies_kalender(kalender_html)) >= 5

    def test_jede_zeile_mit_datum_traegt_beginn_und_ende(self, kalender_html):
        for e in vr.lies_kalender(kalender_html):
            if e["beginn"]:
                assert e["ende"] >= e["beginn"], e["name"]

    def test_ein_turnier_ohne_seite_traegt_keinen_link(self, kalender_html):
        """Der Kalender fuehrt Turniere, fuer die es noch keine Seite gibt.
        Sie duerfen nicht als Major gezogen werden."""
        ohne = [e for e in vr.lies_kalender(kalender_html) if not e["url"]]
        assert ohne, "die Probe enthaelt keinen Fall ohne Seite — dann prueft das hier nichts"

    def test_das_letzte_wochenende_kommt_aus_dem_datum_nicht_aus_dem_sieger(self, kalender_html):
        """Ein Turnier gilt als gelaufen, wenn sein Enddatum vorbei ist —
        NICHT, weil im Siegerfeld ein Name steht. Welche Aufrufe Victory
        Road dort vor dem Turnier hinschreibt, entscheidet Victory Road."""
        eintraege = vr.lies_kalender(kalender_html)
        majors = vr.letztes_wochenende(eintraege, heute=date(2026, 9, 24))
        assert majors
        for m in majors:
            assert date.fromisoformat(m["ende"]) <= date(2026, 9, 24)
            assert m["url"]

    def test_mehrere_majors_am_selben_wochenende_kommen_alle_mit(self, kalender_html):
        """Der Fall, der die Anzeige traegt: an EINEM Wochenende laufen
        mehrere Regionals. Am 19./20.09.2026 waren es zwei, am
        26./27.09.2026 sind es wieder zwei."""
        eintraege = vr.lies_kalender(kalender_html)
        assert len(vr.letztes_wochenende(eintraege, heute=date(2026, 9, 24))) >= 2

    def test_das_letzte_wochenende_wandert_mit_der_zeit(self, kalender_html):
        """Dieselbe Datei, ein spaeteres Datum — es muss ein ANDERES
        Wochenende herauskommen. Ohne diese Probe koennte die Auswahl
        fest auf dem ersten Eintrag stehen und niemand saehe es."""
        eintraege = vr.lies_kalender(kalender_html)
        frueh = {m["name"] for m in vr.letztes_wochenende(eintraege, heute=date(2026, 9, 24))}
        spaet = {m["name"] for m in vr.letztes_wochenende(eintraege, heute=date(2026, 9, 30))}
        assert frueh and spaet
        assert frueh.isdisjoint(spaet), (
            "nach einem weiteren Wochenende stehen dieselben Turniere da: %s" % frueh)

    def test_vor_dem_ersten_turnier_kommt_nichts(self, kalender_html):
        eintraege = vr.lies_kalender(kalender_html)
        assert vr.letztes_wochenende(eintraege, heute=date(2020, 1, 1)) == []


# ── Turnierseite ─────────────────────────────────────────────────────

class TestPlatzierungen:

    def test_die_probe_gibt_ueberhaupt_platzierungen_her(self, turnier_html):
        assert len(vr.lies_platzierungen(turnier_html)) >= 8

    def test_die_plaetze_stehen_aufsteigend(self, turnier_html):
        plaetze = [z["platz"] for z in vr.lies_platzierungen(turnier_html)]
        assert plaetze == sorted(plaetze)

    def test_jede_zeile_traegt_einen_trainer_und_sechs_pokemon(self, turnier_html):
        for z in vr.lies_platzierungen(turnier_html):
            assert z["trainer"], z
            assert len(z["team_vorschau"]) == 6, z["trainer"]

    def test_der_ots_link_wird_in_beiden_schreibweisen_erkannt(self, turnier_html):
        """Gemessen 24.09.2026: die Quelle schreibt den Link mal mit und
        mal ohne "www.". Beide muessen dieselbe Kennung ergeben, sonst
        faellt jede zweite Zeile still unter den Tisch."""
        zeilen = vr.lies_platzierungen(turnier_html)
        mit_www = [z for z in zeilen if "www." in z["ots_url"]]
        ohne_www = [z for z in zeilen if z["ots_url"] and "www." not in z["ots_url"]]
        assert mit_www and ohne_www, "die Probe enthaelt nicht beide Schreibweisen"
        for z in mit_www + ohne_www:
            assert z["paste_id"], z["ots_url"]

    def test_der_replika_code_wird_aus_zwei_zeilen_zusammengefuehrt(self, turnier_html):
        """Auf der Quelle steht der Code umgebrochen ("X9L10" / "UL8JM").
        Das Spiel erwartet ihn in einem Stueck."""
        mit_code = [z for z in vr.lies_platzierungen(turnier_html) if z["replica_code"]]
        assert mit_code, "die Probe enthaelt keinen Replika-Code"
        for z in mit_code:
            assert z["replica_code"].isalnum(), z["replica_code"]
            assert len(z["replica_code"]) >= 8, z["replica_code"]

    def test_ein_replika_code_ist_die_ausnahme_eine_teamliste_die_regel(self, turnier_html):
        """DER BEFUND, der die Anzeige bestimmt (gemessen 24.09.2026 an
        Baltimore): von 155 Platzierungen trugen 16 einen Replika-Code,
        aber 155 eine Teamliste. Wer nur Teams MIT Code zeigt, zeigt fast
        nichts. Geprueft wird die Eigenschaft, nicht die Zahl."""
        zeilen = vr.lies_platzierungen(turnier_html)
        mit_code = sum(1 for z in zeilen if z["replica_code"])
        mit_liste = sum(1 for z in zeilen if z["paste_id"])
        assert mit_liste == len(zeilen), "nicht jede Zeile traegt eine Teamliste"
        assert mit_code < mit_liste, (
            "in dieser Probe traegt jede Zeile einen Code — dann prueft der "
            "Fall nicht mehr, wofuer er da ist")

    def test_dieselbe_platzierung_steht_nur_einmal_da(self, turnier_html):
        """Top-Cut und Standings ueberschneiden sich auf der Quelle."""
        zeilen = vr.lies_platzierungen(turnier_html)
        schluessel = [(z["platz"], z["trainer"]) for z in zeilen]
        assert len(schluessel) == len(set(schluessel))


# ── Paste-Schnittstelle ──────────────────────────────────────────────

class TestPaste:

    def test_deutsch_und_englisch_stehen_beide_da(self, paste_json):
        """Die Oberflaeche zeigt Deutsch; Sprites und Nutzungsdaten haengen
        am englischen Namen. Faellt eines weg, bricht eine der beiden
        Seiten."""
        u = vr.lies_paste(paste_json)
        assert u["pokemon"]
        for m in u["pokemon"]:
            assert m["name"] and m["name_de"], m
            assert m["item"] and m["item_de"], m
            assert m["ability"] and m["ability_de"], m
            assert m["nature"] and m["nature_de"], m

    def test_vier_attacken_in_beiden_sprachen(self, paste_json):
        for m in vr.lies_paste(paste_json)["pokemon"]:
            assert len(m["moves"]) == len(m["moves_de"]) >= 1
            assert all(a for a in m["moves_de"]), m["name"]

    def test_eine_ots_liste_fuehrt_keine_evs_und_das_steht_auch_so_da(self, paste_json):
        """DER ZWEITE BEFUND: eine Open Team List blendet EVs und IVs aus.
        Sie werden NICHT geschaetzt und nicht mit uebliche-Werte gefuellt —
        das Feld bleibt leer, und die Oberflaeche sagt es hin."""
        for m in vr.lies_paste(paste_json)["pokemon"]:
            assert m["evs"] == ""


# ── Zusammenbau ──────────────────────────────────────────────────────

def _baue(kalender_html, turnier_html, paste_json, **kw):
    def html(url):
        return kalender_html if "calendar" in url else turnier_html
    return vr.baue(hole_html=html, hole_paste_fn=lambda pid: paste_json, **kw)


class TestZusammenbau:

    def test_beide_majors_des_wochenendes_landen_im_ergebnis(
            self, kalender_html, turnier_html, paste_json):
        d = _baue(kalender_html, turnier_html, paste_json, heute=date(2026, 9, 24))
        assert len(d["_meta"]["turniere"]) >= 2
        assert d["_meta"]["team_count"] >= 2

    def test_jedes_turnier_meldet_seine_bilanz(
            self, kalender_html, turnier_html, paste_json):
        """Was gezogen wurde, muss nachzaehlbar sein — sonst laesst sich
        spaeter nicht sagen, ob ein Lauf vollstaendig war."""
        d = _baue(kalender_html, turnier_html, paste_json, heute=date(2026, 9, 24))
        for t in d["_meta"]["turniere"]:
            assert t["platzierungen_gesamt"] >= t["gezogen"] >= 0
            assert t["mit_ots"] <= t["platzierungen_gesamt"]
            assert t["mit_replica_code"] <= t["platzierungen_gesamt"]

    def test_die_tiefe_begrenzt_wirklich(self, kalender_html, turnier_html, paste_json):
        """Jede Platzierung kostet einen Aufruf der Schnittstelle. Greift
        die Tiefe nicht, laeuft der Wochenlauf ueber alle 155."""
        flach = _baue(kalender_html, turnier_html, paste_json, tiefe=3, heute=date(2026, 9, 24))
        tief = _baue(kalender_html, turnier_html, paste_json, tiefe=32, heute=date(2026, 9, 24))
        assert flach["_meta"]["team_count"] < tief["_meta"]["team_count"]
        for t in flach["_meta"]["turniere"]:
            assert t["gezogen"] <= 3

    def test_jedes_team_sagt_dass_ihm_die_evs_fehlen(
            self, kalender_html, turnier_html, paste_json):
        d = _baue(kalender_html, turnier_html, paste_json, heute=date(2026, 9, 24))
        assert d["_meta"]["hat_ev"] is False
        for t in d["teams"]:
            assert t["hat_ev"] is False, t["team_name"]

    def test_jedes_team_nennt_sein_turnier_und_seinen_platz(
            self, kalender_html, turnier_html, paste_json):
        """Ohne beides liesse sich in der Anzeige nicht sagen, WOHER ein
        Team kommt — bei zwei Majors am selben Wochenende der Unterschied
        zwischen Auskunft und Ratespiel."""
        d = _baue(kalender_html, turnier_html, paste_json, heute=date(2026, 9, 24))
        for t in d["teams"]:
            assert t["turnier"] and t["turnier_url"] and t["platz"] >= 1

    def test_ohne_gelaufenes_turnier_wird_nichts_behauptet(
            self, kalender_html, turnier_html, paste_json):
        with pytest.raises(RuntimeError):
            _baue(kalender_html, turnier_html, paste_json, heute=date(2020, 1, 1))


# ── Replika-Sammlung ─────────────────────────────────────────────────

class TestReplikaSammlung:

    def test_nur_eintraege_mit_code_kommen_mit(self, replika_html):
        """Die Seite fuehrt alte Scarlet/Violet-Teams ohne Code, die auf
        pokepast.es zeigen. Sie gehoeren nicht in den Champions-Bestand."""
        eintraege = vrr.lies_sammlung(replika_html)
        assert eintraege
        for e in eintraege:
            assert e["replica_code"]
            assert "vrpastes.com" in e["ots_url"]

    def test_der_eintrag_ohne_code_steht_in_der_probe_und_faellt_raus(self, replika_html):
        """Gegenprobe: waere in der Probe gar kein solcher Fall, wuerde
        die Zusicherung darueber leer bestehen."""
        assert "pokepast.es" in replika_html
        assert not any("pokepast.es" in e["ots_url"] for e in vrr.lies_sammlung(replika_html))

    def test_ohne_code_faellt_der_eintrag_auch_mit_vrpastes_link_raus(self):
        """AN EINER GESETZTEN ZEILE, und zwar aus einem gemessenen Grund.

        Die Verfaelschungsprobe vom 24.09.2026 hat hier eine Luecke
        aufgedeckt: nimmt man den Code-Filter aus dem Scraper heraus,
        bleibt die Zusicherung darueber trotzdem gruen — weil in der
        echten Probe jede Zeile ohne Code auf pokepast.es zeigt und
        damit schon am ZWEITEN Filter haengen bleibt. Der Code-Filter
        war also ungeprueft.

        Hier steht deshalb eine Zeile, die es in der Probe nicht gibt:
        ohne Code, aber MIT vrpastes-Link. Sie muss allein am Code-Filter
        scheitern. Die Werte sind gesetzt und als solche gekennzeichnet —
        auf der Quelle ist dieser Fall nicht belegt, ausschliessen laesst
        er sich aber auch nicht."""
        gesetzt = (
            '<table><tr><th>Flag</th><th>Player</th><th>Best results</th>'
            '<th>Team</th><th>Code</th><th>Paste</th></tr>'
            '<tr><td></td><td>Mit Code</td><td>Testlage</td><td></td>'
            '<td>AAAAA<br>BBBBB</td>'
            '<td><a href="https://www.vrpastes.com/mitCode00">P</a></td></tr>'
            '<tr><td></td><td>Ohne Code</td><td>Testlage</td><td></td>'
            '<td></td>'
            '<td><a href="https://www.vrpastes.com/ohneCode0">P</a></td></tr>'
            '</table>')
        namen = [e["trainer"] for e in vrr.lies_sammlung(gesetzt)]
        assert namen == ["Mit Code"], (
            "der Eintrag ohne Replika-Code ist durchgerutscht: %s" % namen)

    def test_jeder_eintrag_traegt_trainer_ergebnis_und_sechs_pokemon(self, replika_html):
        for e in vrr.lies_sammlung(replika_html):
            assert e["trainer"] and e["ergebnis"]
            assert len(e["team_vorschau"]) == 6, e["trainer"]

    def test_die_untergrenze_gegen_leeres_bestehen_greift(self, replika_html, paste_json):
        """Sie ist der Schutz davor, dass ein Umbau der fremden Seite
        still eine leere Liste ergibt. Sie steht als Parameter da, damit
        diese Probe sie pruefen kann, ohne sie in Produktion zu senken."""
        with pytest.raises(RuntimeError):
            vrr.baue(hole_html=lambda u: replika_html,
                     hole_paste_fn=lambda p: paste_json)
        d = vrr.baue(hole_html=lambda u: replika_html,
                     hole_paste_fn=lambda p: paste_json, mindest=1)
        assert d["_meta"]["team_count"] >= 1
