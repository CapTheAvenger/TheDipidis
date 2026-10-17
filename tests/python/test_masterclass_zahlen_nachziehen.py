# -*- coding: utf-8 -*-
"""Der Erzeuger der Masterclass-Zahlen — und die Kette, die ihn traegt.

BEFUND 23.09.2026. masterclass/mega-stalobor.de.html traegt je Matchup drei
Zahlen aus data/online_api_matchups_*.csv und data/labs_tournament_matchups.csv.
tests/python/test_masterclass_kartennamen.py rechnet sie nach — aber niemand
zog sie nach, wenn die Daten wuchsen. Am 23.09.2026 standen 52 Partien gegen
Dragapult im Stueck und 66 in der Datei; der Deploy hing an sechzehn Zellen.

scripts/masterclass_zahlen_nachziehen.py ist der fehlende Erzeuger. Damit er
wirkt, muessen DREI Dinge stimmen, und alle drei stehen hier:

  1. Er laeuft in dem Ablauf, der seine EINGABE schreibt.
  2. Sein Ergebnis steht in der `git add`-Liste dieses Ablaufs — sonst wird
     es mit dem Laeufer weggeworfen (genau die Falle, die
     data/champions_move_flags.json sieben Tage lang erwischt hat).
  3. Er rechnet nach DERSELBEN Konvention wie die Zusicherung, und er
     erfindet nichts: keine Bilanz -> Gedankenstrich, unter 30 Partien ->
     Bilanz statt Quote.

UMZUG 17.10.2026: das Stueck liegt nur noch in Hausis Konto. Der Erzeuger
schreibt seitdem den Schluessel `matchups` in
data/masterclass_live/mega-stalobor.json; die Seite setzt die Werte beim
Oeffnen ein (das Umbenennen der Spalten prueft
tests/unit/test-masterclass-live.js). Alle drei Bedingungen oben gelten
unveraendert — nur fuer die JSON statt fuer das Stueck.
"""

import importlib.util
import os
import re
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
SKRIPT = os.path.join(WURZEL, "scripts", "masterclass_zahlen_nachziehen.py")
ABLAUF = os.path.join(WURZEL, ".github", "workflows", "limitless-api-scrape.yml")
LIVE = os.path.join(WURZEL, "data", "masterclass_live", "mega-stalobor.json")


def _modul():
    spec = importlib.util.spec_from_file_location("mcl_nachziehen", SKRIPT)
    m = importlib.util.module_from_spec(spec)
    sys.modules["mcl_nachziehen"] = m
    spec.loader.exec_module(m)
    return m


def _ablauf():
    with open(ABLAUF, encoding="utf-8") as f:
        return f.read()


def test_der_erzeuger_laeuft_in_dem_ablauf_der_seine_eingabe_schreibt():
    text = _ablauf()
    assert "scripts/masterclass_zahlen_nachziehen.py" in text, (
        "der Erzeuger ist in limitless-api-scrape.yml nicht verdrahtet — "
        "dann zieht niemand das Stueck nach, wenn die CSVs wachsen")
    # Und er muss NACH dem Scrape stehen, sonst rechnet er mit dem
    # Vortagesstand. Gemessen an der Reihenfolge im Ablauf.
    assert text.index("online_api_matchups") < text.index(
        "scripts/masterclass_zahlen_nachziehen.py"), (
        "der Erzeuger steht vor dem Schritt, der seine Eingabe schreibt")


def test_die_live_daten_stehen_in_der_commitliste_dieses_ablaufs():
    text = _ablauf()
    assert re.search(r"git add\s+data/masterclass_live/", text), (
        "data/masterclass_live/ fehlt in der `git add`-Liste — der Schritt waere "
        "wirkungslos, genau wie bei champions_move_flags.json am 23.09.2026")
    assert "masterclass/mega-stalobor" not in re.sub(r"(?m)^\s*#.*$", "", text), (
        "der Ablauf fasst noch das Stueck an, das nur noch im Konto liegt")


def test_er_erfindet_nichts():
    m = _modul()
    kopf = "Online-Meta TEF\u201330C (laufendes Format): 53,8 % Win % nach Matchpunkten"
    # Keine Bilanz -> Gedankenstrich, KEIN geschaetzter Wert.
    klasse, titel, wert, nenner = m.soll_zelle([0, 0, 0], "mcl-wrz", kopf)
    assert wert == "\u2014" and nenner == ""
    assert klasse.endswith("mcl-wrz-leer")
    assert titel.endswith("keine Partien in den Daten")
    # Unter 30 Partien bleibt es eine Bilanz — die Regel, die das Stueck
    # selbst ausspricht.
    assert m.soll_zelle([5, 6, 0], "mcl-wrz", kopf)[2] == "5\u20136\u20130"
    assert m.soll_zelle([14, 14, 0], "mcl-wrz", kopf)[2] == "14\u201314\u20130"
    # Ab 30 eine Quote, und zwar (3S+U)/(3n).
    klasse, titel, wert, nenner = m.soll_zelle([17, 17, 0], "mcl-wrz", kopf)
    assert wert == "50,0 %", wert
    assert nenner == "<i>(34)</i>", nenner
    assert klasse == "mcl-wrz", klasse


def test_die_sprechblase_wird_mitgezogen():
    """BEFUND 23.09.2026: die Zelle traegt die Zahl ZWEIMAL — sichtbar und
    in der Sprechblase. Wer nur die sichtbare nachzieht, hinterlaesst eine
    Sprechblase, die etwas anderes behauptet als der Wert daneben."""
    m = _modul()
    kopf = "Online-Meta TEF\u201330C (laufendes Format): irgendwas Altes"
    _k, titel, wert, _n = m.soll_zelle([17, 17, 0], "mcl-wrz", kopf)
    assert titel.startswith("Online-Meta TEF\u201330C (laufendes Format): ")
    assert wert in titel, "die Sprechblase nennt einen anderen Wert als die Zelle"
    assert "34 Partien" in titel and "17\u201317\u20130" in titel
    # Und der ANFANG bleibt stehen: er benennt die Spalte und stammt nicht
    # aus diesem Skript.
    _k2, titel2, _w2, _n2 = m.soll_zelle(
        [1, 1, 0], "mcl-wrz", "Letzte Pr\u00e4senzturniere, Format X: alt")
    assert titel2.startswith("Letzte Pr\u00e4senzturniere, Format X: ")


def test_die_verschiebung_wird_gerechnet_nicht_gesetzt():
    """Unter 30 Partien nennt die Sprechblase, wie stark eine einzelne
    Partie die Quote verschiebt: 100/n Prozentpunkte, eine Nachkommastelle."""
    m = _modul()
    _k, titel, _w, _n = m.soll_zelle([14, 14, 0], "mcl-wrz", "X: alt")
    assert "3.6 Punkte" in titel, titel
    _k, titel, _w, _n = m.soll_zelle([12, 4, 5], "mcl-wrz", "X: alt")
    assert "4.8 Punkte" in titel, titel


def test_die_spaltenkoepfe_kommen_aus_den_daten():
    """Kein Spaltenname steht im Skript. Er wird abgeleitet — aus dem
    Dateinamen des Scrapers und aus der Spalte `meta` der Majors-Zeilen,
    genau wie in tests/python/test_masterclass_kartennamen.py."""
    m = _modul()
    k = m.koepfe()
    assert k["jetzt"] != k["davor"], "beide Online-Spalten traegen denselben Kopf"
    assert k["majors"].startswith("Majors (")
    assert "\u2013" in k["jetzt"], "der Kopf nutzt den Halbgeviertstrich"
    assert "Jetzt" not in k.values() and "Davor" not in k.values()


def test_die_grenze_liegt_bei_dreissig_und_zwar_beidseitig():
    """29 ist eine Bilanz, 30 ist eine Quote. Eine Grenze, die nur von
    einer Seite geprueft ist, ist nicht geprueft."""
    m = _modul()
    assert m.MINDEST_PARTIEN == 30
    assert "\u2013" in m.soll_zelle([15, 14, 0], "mcl-wrz", "X: alt")[2]   # 29 Partien
    assert "%" in m.soll_zelle([15, 15, 0], "mcl-wrz", "X: alt")[2]        # 30 Partien


def test_die_konvention_ist_die_des_hauses():
    """Dieselbe Formel wie js/win-rate-konvention.js und wie die
    Zusicherung. Eine zweite Formel waere eine vierte Konvention."""
    m = _modul()
    assert m._matchpunkte(1, 0, 0) == 100.0
    assert m._matchpunkte(0, 1, 0) == 0.0
    # Ein Unentschieden zaehlt einen von drei Punkten, nicht einen halben.
    assert m._matchpunkte(0, 0, 3) == pytest.approx(100 / 3)
    assert m._matchpunkte(0, 0, 0) is None


def test_der_tausenderpunkt_ist_der_des_stuecks():
    m = _modul()
    assert m._tausender(1053) == "1.053"
    assert m._tausender(66) == "66"


def _schreibe_in(tmp_path, monkeypatch):
    sys.path.insert(0, os.path.join(WURZEL, "scripts"))
    import masterclass_live as L
    monkeypatch.setattr(L, "ORDNER", str(tmp_path))
    return L


def test_jede_zelle_der_json_ist_aus_den_rohdaten_gerechnet():
    """Die eigentliche Verknuepfung: jede Zelle in live_daten() ist genau
    soll_zelle(Bilanz) der Rohdaten — fuer jeden Gegner und jede Spalte.
    Bis zum Umzug rechnete test_masterclass_kartennamen.py das am Stueck
    nach; jetzt an der Datei, die die Seite einsetzt."""
    m = _modul()
    d = m.live_daten()
    quellen = {"jetzt": m._online(m.ONLINE_JETZT), "davor": m._online(m.ONLINE_DAVOR),
               "majors": m._majors()}
    n = 0
    for spalte, q in quellen.items():
        assert len(q) >= 20, f"Spalte {spalte}: nur {len(q)} Gegner in den Rohdaten"
        for slug, bilanz in q.items():
            k, t, w, nn = m.soll_zelle(bilanz, "mcl-wrz", "X: ")
            assert d["zellen"][slug][spalte] == [k, t[3:], w, nn], (slug, spalte)
            n += 1
    assert n == sum(len(z) for z in d["zellen"].values()), "die JSON fuehrt Zellen ohne Rohdaten"
    # Ein Gegner ohne Eintrag bekommt die leere Zelle — kein Wert erfunden.
    assert d["leer"][2] == "\u2014" and d["leer"][0].endswith("mcl-wrz-leer")


def test_die_koepfe_und_saetze_der_json_kommen_aus_den_daten():
    m = _modul()
    d = m.live_daten()
    assert d["koepfe"] == m.koepfe()
    w = d["werte"]
    assert w["kopf-jetzt"] == d["koepfe"]["jetzt"] and w["kopf-majors"] == d["koepfe"]["majors"]
    assert w["datei-online-jetzt"] == "data/" + os.path.basename(m.ONLINE_JETZT)
    assert os.path.exists(os.path.join(WURZEL, w["datei-online-jetzt"]))
    assert re.match(r"^\d{4}-\d\d-\d\d$", w["stand-online-jetzt"])
    assert d["majors_praefix"].startswith("Letzte Präsenzturniere (") and d["majors_praefix"].endswith(": ")
    assert d["koepfe"]["majors"].replace("Majors (", "").rstrip(")") in d["majors_praefix"]


@pytest.mark.skipif(not os.path.exists(LIVE), reason="Live-Datei nicht im Baum")
def test_am_heutigen_stand_ist_nichts_nachzuziehen():
    """Der Arbeitsbaum muss sauber sein: weicht die eingecheckte JSON von
    den Rohdaten ab, zeigt die Seite veraltete Zahlen. Nachziehen mit
    'python3 scripts/masterclass_zahlen_nachziehen.py'."""
    import json
    m = _modul()
    with open(LIVE, encoding="utf-8") as f:
        da = json.load(f).get("matchups")
    soll = m.live_daten()
    abw = sorted(s for s in set(soll["zellen"]) | set((da or {}).get("zellen") or {})
                 if (da or {}).get("zellen", {}).get(s) != soll["zellen"].get(s))
    assert da == soll, ("die Live-Daten stehen anders da als die Rohdaten — "
                        f"{len(abw)} Gegner abweichend, z. B. {abw[:5]}")


def test_zweimal_nachziehen_aendert_nichts_mehr(tmp_path, monkeypatch):
    """Ein Erzeuger, der bei jedem Lauf etwas anderes schreibt, erzeugt
    jede Nacht einen Commit und niemand sieht mehr, wann sich wirklich
    etwas geaendert hat."""
    L = _schreibe_in(tmp_path, monkeypatch)
    m = _modul()
    d = m.live_daten()
    assert L.schreibe_teil("probe", "matchups", d) is True
    assert L.schreibe_teil("probe", "matchups", m.live_daten()) is False, "der Erzeuger ist nicht stabil"
    # Der andere Schluessel bleibt stehen.
    assert L.schreibe_teil("probe", "online_listen", {"listen": []}) is True
    import json
    with open(L.pfad("probe"), encoding="utf-8") as f:
        inhalt = json.load(f)
    assert inhalt["matchups"] == d and inhalt["online_listen"] == {"listen": []}


def test_zu_wenige_gegner_schreibt_nichts(tmp_path, monkeypatch):
    """VERFAELSCHUNGSPROBE: findet der Erzeuger in einer Spalte unter 20
    Gegner, stimmt mit den Eingaben etwas nicht — dann wird NICHTS
    geschrieben (je Spalte gezaehlt, nicht in Summe)."""
    L = _schreibe_in(tmp_path, monkeypatch)
    m = _modul()
    d = m.live_daten()
    for z in d["zellen"].values():
        z.pop("davor", None)
    monkeypatch.setattr(m, "GUIDE_ID", "probe")
    monkeypatch.setattr(m, "live_daten", lambda: d)
    monkeypatch.setattr(sys, "argv", ["x"])
    assert m.main() == 1
    assert not os.path.exists(L.pfad("probe"))


# ---------------------------------------------------------------------------
# DAS ERSTE MAJOR IM NEUEN FORMAT (29.09.2026, Wochenlauf #168)
# ---------------------------------------------------------------------------
#
# Brisbane und Frankfurt brachten TEF-30C-Zeilen neben die TEF-PBL-Zeilen.
# Der Erzeuger verlangte "genau ein Format" und brach ab, das Stueck blieb
# stehen, und das Tor fand seine Meta-Anteile veraltet — der ganze
# Wochenlauf wurde nicht gepusht. Beide Zusicherungen fuehren die
# Funktionen aus, an gesetzten Dateien.



def _labs_mu(tmp_path, zeilen):
    p = tmp_path / "labs_tournament_matchups.csv"
    felder = ["meta", "tournaments_used", "my_deck_slug", "day_filter",
              "opponent_deck_slug", "opponent_deck_name", "vs_wins", "vs_losses", "vs_ties"]
    import csv as _csv
    with open(p, "w", encoding="utf-8", newline="") as f:
        w = _csv.DictWriter(f, fieldnames=felder)
        w.writeheader()
        for z in zeilen:
            w.writerow(dict(zip(felder, z)))
    return str(p)


def test_die_majors_spalte_nimmt_das_juengste_format(tmp_path, monkeypatch):
    m = _modul()
    monkeypatch.setattr(m, "LABS_MU", _labs_mu(tmp_path, [
        # Das juengere Format ZUERST: ohne Filter ueberschriebe die spaetere
        # PBL-Zeile die 30C-Zahl — genau das muss rot werden.
        ("TEF-30C", "73,74", m.EIGEN, "overall", "dragapult", "Dragapult", "3", "4", "0"),
        ("TEF-PBL", "71,72", m.EIGEN, "overall", "dragapult", "Dragapult", "10", "5", "1"),
        ("TEF-30C", "73,74", "anderes-deck", "overall", "dragapult", "Dragapult", "9", "9", "9"),
    ]))
    assert m._majors_meta() == "TEF-30C", (
        "die Majors-Spalte nimmt nicht die letzten Majors — oder bricht wie "
        "bis 29.09.2026 am zweiten Format ab")
    assert m._majors() == {"dragapult": [3, 4, 0]}, (
        "die Zahlen der Majors-Spalte mischen die Formate: die Zeile des "
        "aelteren Formats ueberschreibt oder ergaenzt die des juengsten")


def test_der_kopfwechsel_nennt_die_neuen_majors(monkeypatch):
    """Mit dem ersten Major eines neuen Formats wechseln Spaltenkopf,
    Sprechblasenanfang, Legendensatz und Turniernummern (29.09.2026). Die
    Texte kommen aus majors_texte; eingesetzt werden sie auf der Seite."""
    m = _modul()
    monkeypatch.setattr(m, "_majors_turniere", lambda meta: ([73, 74], ["Brisbane", "Frankfurt"]))
    t = m.majors_texte("TEF-30C", "TEF-30C")
    assert t["praefix"] == "Letzte Präsenzturniere (Brisbane und Frankfurt), Format TEF–30C: "
    assert t["turniere"] == "73 und 74"
    assert "schon im laufenden Format" in t["satz"] and "gab es noch nicht" not in t["satz"]
    alt = m.majors_texte("TEF-PBL", "TEF-30C")
    assert "liefen noch im Format TEF–PBL" in alt["satz"], alt["satz"]
    monkeypatch.setattr(m, "_majors_turniere", lambda meta: ([], []))
    with pytest.raises(SystemExit):
        m.majors_texte("TEF-30C", "TEF-30C")


# DA-20 (01.10.2026): die Online-Dateien kommen aus format_window.json.
def test_formatfenster_aus_den_daten(tmp_path):
    import importlib.util, json, os
    spec = importlib.util.spec_from_file_location(
        "mc_nz", os.path.join(os.path.dirname(__file__), "..", "..", "scripts", "masterclass_zahlen_nachziehen.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    f = tmp_path / "fw.json"
    f.write_text(json.dumps({"oldest_legal_set": "ABC", "current_set": "XYZ", "previous_format_key": "ABC-QRS"}))
    assert m._formatfenster(str(f)) == ("ABC-XYZ", "ABC-QRS")
    # Verfaelschungsprobe: ein fehlendes Feld bricht ab, statt zu raten
    f.write_text(json.dumps({"oldest_legal_set": "ABC", "current_set": "XYZ"}))
    import pytest
    with pytest.raises(SystemExit):
        m._formatfenster(str(f))
    # die echten Daten ergeben die vorhandenen Dateien
    assert os.path.basename(m.ONLINE_JETZT) == f"online_api_matchups_{m._JETZT}.csv"
    assert os.path.exists(m.ONLINE_JETZT) and os.path.exists(m.ONLINE_DAVOR)
