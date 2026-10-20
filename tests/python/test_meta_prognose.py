"""Die Regeln der Meta-Prognose.

WAS DIESES MODELL BEHAUPTET UND WORAUF ES SITZT
-----------------------------------------------
Gemessen am 08.09.2026 an ALLEN ZEHN Praesenzturnieren der Fenster
TEF-POR, TEF-CRI und TEF-PBL (17.061 Spieler), je gegen die
Online-Anteile der 14 Tage davor:

  * Online sagt Praesenz gut voraus: mittleres r = 0,903, mittlerer
    absoluter Fehler 0,67 Prozentpunkte.
  * Das Praesenzfeld verdichtet sich auf die Spitze — bei ZEHN von ZEHN
    Ankern. Median +10,0 pp ueber alle, Spanne +3,1 bis +22,6.
  * Nur ueber die sechs Regionals: Verdichtung +9,3 pp (+3,1 bis +11,9),
    r = 0,936, Fehler 0,51 pp. Worlds ist der schlechteste Anker der
    zehn und gehoert nicht in ein Regional-Modell.

DIE ZWEI FEHLER, DIE DIESE DATEI VERHINDERN SOLL
------------------------------------------------
1. **Der Vorher-Nenner ueber Formatgrenzen.** Mega Excadrill ex ist
   PBL-65 und hat in TEF-CRI/TEF-POR NULL Zeilen. Rechnet man den
   Vorher-Anteil ueber alle Fenster, wird aus 1.983/26.130 = 7,59 %
   ploetzlich 1.983/61.011 = 3,25 % — und aus einem Fall um 42 % ein
   Anstieg um 35 %. Gleiche Datei, gleiche Karte, umgekehrtes Vorzeichen,
   und nichts schlaegt Alarm.

2. **Anteile als Mittel statt aus Summen.** Ueber Turniere von 104 bis
   3.000 Spielern ist der Mittelwert der Turnieranteile eine andere Zahl
   als Summe(lists)/Summe(lists_total).
"""

import csv
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "scripts"))
WURZEL = os.path.join(os.path.dirname(__file__), "..", "..")

import build_meta_prognose as bp  # noqa: E402


def _zeile(tid, datum, meta, arch, lists, gesamt):
    return {"tournament_id": tid, "date": datum, "meta": meta,
            "archetype_id": arch, "archetype_name": arch.title(),
            "lists": str(lists), "lists_total": str(gesamt),
            "share": str(lists / gesamt), "wins": "0", "losses": "0",
            "ties": "0", "matches": "0", "win_rate": "0",
            "win_rate_convention": "mitUnentschieden", "record_source": "pairings",
            "players": str(gesamt)}


# ── Anteile aus Summen ───────────────────────────────────────────────

def test_anteile_kommen_aus_summen_nicht_aus_mitteln():
    """Ein 900er- und ein 100er-Turnier: Deck A hat 90 und 5 Listen.

    Summenweg:  95/1000 =  9,50 %
    Mittelweg: (10 % + 5 %)/2 = 7,50 %

    Der Mittelweg gibt dem kleinen Turnier dasselbe Gewicht wie dem
    neunmal groesseren.
    """
    zeilen = [_zeile("gross", "2026-09-01", "TEF-PBL", "a", 90, 900),
              _zeile("gross", "2026-09-01", "TEF-PBL", "b", 810, 900),
              _zeile("klein", "2026-09-02", "TEF-PBL", "a", 5, 100),
              _zeile("klein", "2026-09-02", "TEF-PBL", "b", 95, 100)]
    anteile, gesamt, roh = bp.online_anteile(zeilen, "TEF-PBL", "2026-09-01", "2026-09-30")
    assert gesamt == 1000
    assert roh["a"] == 95
    assert anteile["a"] == pytest.approx(9.5), "Mittelwert statt Summe gerechnet"


def test_der_sammeleimer_steht_im_nenner_aber_nicht_in_den_zeilen():
    """Der Unterschied ist keine Feinheit.

    `other` ist kein Deck, sondern zwanzig — er bekommt keine Zeile.
    Aber die Spieler darin haben gespielt und gehoeren in die Feldgroesse.
    Nimmt man sie aus dem Nenner, ist JEDER Anteil zu hoch: Mega
    Excadrill vor Worlds steigt von 7,59 auf 7,87 %.

    Diese Zusicherung stand beim ersten Schreiben andersherum da und
    haette die falsche Konvention eingefroren; der Regressionsriegel
    weiter unten hat sie gefangen.
    """
    zeilen = [_zeile("t", "2026-09-01", "TEF-PBL", "a", 50, 100),
              _zeile("t", "2026-09-01", "TEF-PBL", "other", 50, 100)]
    anteile, gesamt, _ = bp.online_anteile(zeilen, "TEF-PBL", "2026-09-01", "2026-09-30")
    assert "other" not in anteile, "der Sammeleimer darf keine Zeile werden"
    assert gesamt == 100, "der Sammeleimer gehoert in den Nenner"
    assert anteile["a"] == pytest.approx(50.0), (
        "ohne den Sammeleimer im Nenner waeren es 100 % statt 50 %")


def test_fremde_fenster_werden_nicht_mitgezaehlt():
    """DER teure Fehler. Ein Deck, das es im alten Fenster gar nicht gab,
    bekommt sonst einen kuenstlich kleinen Vorher-Anteil — und ein Fall
    wird zum Anstieg."""
    zeilen = [_zeile("neu", "2026-09-01", "TEF-PBL", "a", 100, 1000),
              _zeile("neu", "2026-09-01", "TEF-PBL", "b", 900, 1000),
              _zeile("alt", "2026-06-01", "TEF-CRI", "b", 2000, 2000)]
    anteile, gesamt, _ = bp.online_anteile(zeilen, "TEF-PBL", "2026-01-01", "2026-12-31")
    assert gesamt == 1000, "eine TEF-CRI-Zeile ist in den TEF-PBL-Nenner geraten"
    assert anteile["a"] == pytest.approx(10.0)


# ── Verdichtung ──────────────────────────────────────────────────────

def _anker(datum, name, meta, art, spieler, anteile):
    return {"datum": datum, "name": name, "meta": meta, "art": art,
            "spieler": spieler, "anteile": anteile}


def test_verdichtung_wird_als_differenz_der_spitze_gemessen():
    zeilen = []
    for i, (a, n) in enumerate([("a", 200), ("b", 200), ("c", 200), ("d", 200),
                                ("e", 200), ("f", 200), ("g", 200)]):
        zeilen.append(_zeile(f"t{i}", "2026-08-20", "TEF-PBL", a, n, 1400))
    # online: sieben Decks zu je 14,29 % -> Spitze (5) = 71,43 %
    anker = [_anker("2026-08-28", "Regional X", "TEF-PBL", "regional", 1000,
                    {"a": 30.0, "b": 25.0, "c": 20.0, "d": 10.0, "e": 8.0,
                     "f": 4.0, "g": 3.0})]  # Spitze = 93,0 %
    v = bp.messe_verdichtung(zeilen, anker)[0]
    assert v["auswertbar"]
    assert v["spitze_online"] == pytest.approx(71.43, abs=0.02)
    assert v["spitze_praesenz"] == pytest.approx(93.0)
    assert v["verdichtung"] == pytest.approx(21.57, abs=0.02)


def test_anker_ohne_online_vorlauf_ist_nicht_auswertbar():
    """Statt eine Zahl aus nichts zu rechnen, sagt der Anker warum."""
    anker = [_anker("2026-08-28", "Regional X", "TEF-PBL", "regional", 1000, {"a": 100.0})]
    v = bp.messe_verdichtung([], anker)[0]
    assert v["auswertbar"] is False
    assert "300" in v["grund"], "der Grund muss die noetige Zahl nennen"


def test_das_modell_trennt_nach_turnierart():
    """Worlds ist der schlechteste der zehn Anker: hoechste Verdichtung,
    niedrigstes r, groesster Fehler. Ein Feld mit Einladungsschranke ist
    kein Regional."""
    v = [{"auswertbar": True, "art": "regional", "verdichtung": 3.0, "r": 0.95,
          "mae": 0.4, "name": "R1"},
         {"auswertbar": True, "art": "regional", "verdichtung": 11.0, "r": 0.93,
          "mae": 0.5, "name": "R2"},
         {"auswertbar": True, "art": "worlds", "verdichtung": 22.6, "r": 0.80,
          "mae": 1.34, "name": "W"}]
    reg = bp.modell(v, "regional")
    assert reg["anker"] == 2 and "W" not in reg["grundlage"]
    assert reg["verdichtung_median"] == pytest.approx(7.0)
    alle = bp.modell(v, None)
    assert alle["anker"] == 3
    assert alle["verdichtung_median"] > reg["verdichtung_median"], (
        "Worlds muss den Median nach oben ziehen — sonst wirkt der Filter nicht")


# ── Prognose ─────────────────────────────────────────────────────────

def test_die_prognose_erhaelt_die_summe():
    """Was die Spitze gewinnt, verliert der Rest. Sonst summieren sich
    die Anteile nicht mehr auf 100 % und jede Zahl ist um denselben
    Faktor zu hoch."""
    aktuell = {c: v for c, v in zip("abcdefgh", [20, 15, 12, 10, 8, 6, 5, 24])}
    m = {"verdichtung_median": 9.0, "verdichtung_min": 3.0,
         "verdichtung_max": 12.0, "art": "regional", "anker": 6}
    p = bp.prognose(aktuell, {c: 1 for c in aktuell}, 100, m)
    assert sum(z["prognose"] for z in p) == pytest.approx(100.0, abs=0.01)


def test_die_spitze_steigt_und_der_rest_faellt():
    aktuell = {c: v for c, v in zip("abcdefgh", [20, 15, 12, 10, 8, 6, 5, 24])}
    m = {"verdichtung_median": 9.0, "verdichtung_min": 3.0,
         "verdichtung_max": 12.0, "art": "regional", "anker": 6}
    p = {z["archetyp_id"]: z for z in bp.prognose(aktuell, {}, 100, m)}
    assert p["h"]["in_der_spitze"] and p["h"]["bewegung"] > 0
    assert not p["g"]["in_der_spitze"] and p["g"]["bewegung"] < 0


def test_ohne_modell_gibt_es_keine_prognose():
    """Lieber der nackte Online-Anteil als eine Zahl, die so tut."""
    p = bp.prognose({"a": 50.0, "b": 50.0}, {}, 100, None)
    assert all("prognose" not in z for z in p)
    assert all("online_anteil" in z for z in p)


def test_jede_prognosezeile_traegt_ihren_nenner():
    m = {"verdichtung_median": 9.0, "verdichtung_min": 3.0,
         "verdichtung_max": 12.0, "art": "regional", "anker": 6}
    p = bp.prognose({"a": 60.0, "b": 40.0}, {"a": 600, "b": 400}, 1000, m)
    for z in p:
        assert z["online_listen"] > 0 and z["online_listen_gesamt"] == 1000


# ── Der Bestand von heute ────────────────────────────────────────────

DATEN = os.path.join(WURZEL, "data")


@pytest.mark.skipif(
    not os.path.exists(os.path.join(DATEN, "online_api_archetypes.csv")),
    reason="online_api_archetypes.csv nicht vorhanden")
def test_der_gemessene_fall_von_mega_excadrill_bleibt_stehen():
    """Der Regressionsriegel gegen den Vorher-Nenner.

    Sauber TEF-PBL gegen TEF-PBL, am Turniertag getrennt. Rutscht ein
    fremdes Fenster in den Nenner, faellt der Vorwert von 7,59 % auf
    3,25 % und die Bewegung dreht das Vorzeichen. Genau das faengt diese
    Zusicherung.

    WAS HIER EINGEFROREN IST UND WAS NICHT — korrigiert am 10.09.2026,
    nachdem dieser Test `main` rot gemacht hat:

    Das VORHER-Fenster ist ABGESCHLOSSEN (bis 27.08.2026). Da kann kein
    Turnier mehr hineinkommen, also ist 7,59 % bei 26.130 Listen ein
    fester Wert und darf als Zahl dastehen — er IST der Riegel.

    Das NACHHER-Fenster ist OFFEN. Es waechst mit jedem Lauf: am
    08.09.2026 waren es 249 von 5.687 Listen (4,38 %), am 10.09. schon
    6.938 Listen (4,30 %). Die eingefrorene 4,38 war damit ein
    Wochenwert, und der Auto-Lauf der Limitless-API hat ihn planmaessig
    umgeworfen — die Zusicherung wurde rot, ohne dass etwas kaputt war,
    und hat den Deploy angehalten.

    An seine Stelle tritt eine GLEICHUNG gegen dieselbe Datei: die
    Listen des Vorher-Fensters plus die des Luecken-Tages plus die des
    Nachher-Fensters muessen genau die Listen des ganzen Fensters
    ergeben. Genau das faellt um, wenn ein fremdes Fenster
    hineinrutscht — und sie gilt bei jedem Datenstand.
    """
    zeilen = list(csv.DictReader(
        open(os.path.join(DATEN, "online_api_archetypes.csv"), encoding="utf-8"),
        delimiter=";"))
    vor, gv, rv = bp.online_anteile(zeilen, "TEF-PBL", "2026-01-01", "2026-08-27")
    nach, gn, rn = bp.online_anteile(zeilen, "TEF-PBL", "2026-08-29", "2099-01-01")
    _luecke, gl, _rl = bp.online_anteile(zeilen, "TEF-PBL", "2026-08-28", "2026-08-28")
    _ganz, gg, _rg = bp.online_anteile(zeilen, "TEF-PBL", "2026-01-01", "2099-01-01")

    # 1. Der feste Wert des abgeschlossenen Fensters. DAS ist der Riegel.
    #    GEAENDERT 30.09.2026 (WZ-22): hier stand `== 7.59 ± 0,05`. Weil
    #    der Nenner durch nachgetragene Turniere wachsen darf (siehe unten),
    #    verschiebt schon ein Nachtrag von rund 170 Listen den Anteil um
    #    0,05 — ein richtiger Lauf haette das Tor geschlossen. Die Regel
    #    dahinter ist rechnerisch exakt: kommen k Listen dazu, liegt der
    #    neue Anteil zwischen "keine davon Excadrill" und "alle Excadrill".
    #    Bei k = 0 ist das wieder genau 7,59 %.
    k = gv - 26130
    unten = 7.59 * 26130 / gv - 0.05
    oben = (7.59 * 26130 + 100 * k) / gv + 0.05
    assert unten <= vor["mega-excadrill-ex"] <= oben, (
        f"Vorwert {vor['mega-excadrill-ex']:.2f} % liegt ausserhalb dessen, was "
        f"{k} nachgetragene Listen erlauben ({unten:.2f}–{oben:.2f} %) — steht "
        f"ein fremdes Formatfenster im Nenner? (Nenner: {gv}, gemessen 10.09.2026: 26.130)")
    # GEAENDERT 22.09.2026: hier stand `gv == 26130` mit der Begruendung
    # "er kann nicht wachsen". Er kann es doch: der Labs-Scraper probiert
    # aeltere Turnier-IDs nach (siehe tests/python/test_labs_gap_fill.py).
    # Ein erfolgreich nachgetragenes Juli-Turnier fuegt Zeilen MITTEN in
    # das geschlossene Fenster ein — legitimer Zuwachs, der die Deploy-
    # Kette angehalten haette. Verlust bleibt ein Fehler: dann wurden
    # alte Zeilen entfernt oder das Fenster ist nicht mehr auf TEF-PBL
    # begrenzt. Was das Fenster sauber haelt, steht ohnehin eine Zeile
    # darueber (7,59 %) und in der Gleichung darunter.
    assert gv >= 26130, (
        f"der Nenner des abgeschlossenen Fensters ist auf {gv} gefallen "
        f"(gemessen am 10.09.2026: 26.130). Ein abgeschlossenes Fenster "
        f"verliert keine Listen — entweder wurden alte Zeilen entfernt "
        f"oder das Fenster ist nicht mehr sauber auf TEF-PBL begrenzt")

    # 2. Die Gleichung gegen die Datei: nichts faellt heraus, nichts
    #    kommt doppelt vor. Welche Zahlen das diese Woche sind, ist egal.
    assert gv + gl + gn == gg, (
        f"die Fenster decken die Datei nicht sauber ab: "
        f"{gv} + {gl} + {gn} = {gv + gl + gn}, ganzes Fenster {gg}. "
        f"Entweder ueberlappen sie oder es fehlt ein Zeitraum")

    # 3. Die Richtung der Bewegung — das eigentliche Ergebnis.
    assert vor["mega-excadrill-ex"] > nach["mega-excadrill-ex"], (
        "die Bewegung hat das Vorzeichen gedreht")

    # 4. Und das Nachher-Fenster traegt ueberhaupt Listen. Ohne diese
    #    Vorpruefung bestuende Punkt 3 auch bei einem leeren Fenster.
    assert gn > 1000, f"das Nachher-Fenster hat nur {gn} Listen"


@pytest.mark.skipif(
    not os.path.exists(os.path.join(DATEN, "online_api_archetypes.csv")),
    reason="online_api_archetypes.csv nicht vorhanden")
def test_die_verdichtung_wiederholt_sich_an_allen_ankern():
    """Der Kern des Modells. Waere sie nur bei manchen Ankern da, waere
    sie eine Eigenheit einzelner Turniere und keine Regel."""
    zeilen = list(csv.DictReader(
        open(os.path.join(DATEN, "online_api_archetypes.csv"), encoding="utf-8"),
        delimiter=";"))
    v = [x for x in bp.messe_verdichtung(zeilen, bp.praesenz_anker(DATEN))
         if x.get("auswertbar")]
    assert len(v) >= 8, f"nur {len(v)} auswertbare Anker"
    positiv = [x for x in v if x["verdichtung"] > 0]
    assert len(positiv) == len(v), (
        "die Verdichtung ist nicht mehr an allen Ankern positiv: "
        + ", ".join(f"{x['name']} {x['verdichtung']:+.1f}" for x in v
                    if x["verdichtung"] <= 0))
    assert all(x["r"] > 0.7 for x in v), "ein Anker sagt Praesenz kaum voraus"


@pytest.mark.skipif(
    not os.path.exists(os.path.join(DATEN, "online_api_archetypes.csv")),
    reason="online_api_archetypes.csv nicht vorhanden")
def test_das_regional_modell_ist_enger_als_das_ueber_alle_arten():
    """Wenn die Trennung nach Turnierart nichts brächte, wäre sie
    überflüssige Maschinerie."""
    zeilen = list(csv.DictReader(
        open(os.path.join(DATEN, "online_api_archetypes.csv"), encoding="utf-8"),
        delimiter=";"))
    v = bp.messe_verdichtung(zeilen, bp.praesenz_anker(DATEN))
    reg = bp.modell(v, "regional")
    alle = bp.modell(v, None)
    assert reg and alle
    spanne_reg = reg["verdichtung_max"] - reg["verdichtung_min"]
    spanne_alle = alle["verdichtung_max"] - alle["verdichtung_min"]
    assert spanne_reg < spanne_alle, (
        f"Regionals {spanne_reg:.1f} pp Spanne, alle {spanne_alle:.1f} pp — "
        f"die Trennung nach Turnierart bringt nichts")
    assert reg["r_mittel"] > alle["r_mittel"]


# ── Seit 21.10.2026: Potenz, Erfolg beim letzten Major, Mischung ──────
# Anlass: Abgleich gegen Louisville und Nizza (Projektwissen
# claude/metacall-lernbuch.md) — zweimal rund 6 pp zu viel bei den kleinen
# Decks, die erfolgreichen Decks des Vor-Majors zu klein geschaetzt.

def _major(anteile, day2, datum="2026-10-17", meta="TEF-30C", spieler=1000, name="R"):
    return {"datum": datum, "meta": meta, "name": name, "spieler": spieler,
            "art": "regional", "anteile": anteile, "day2": day2}


def test_ohne_major_wachsen_die_grossen_und_die_kleinen_schrumpfen():
    aktuell = {"a": 30.0, "b": 20.0, "c": 10.0, "d": 5.0, "e": 2.0}
    p = bp.rechne(aktuell, None)
    assert sum(p.values()) == pytest.approx(sum(aktuell.values()), abs=1e-6), (
        "die Summe der Online-Zeilen muss bleiben — der Sammeleimer behaelt seinen Teil")
    assert p["a"] > aktuell["a"], "das groesste Deck waechst nicht"
    assert p["e"] < aktuell["e"], "das kleinste Deck schrumpft nicht"
    assert sorted(p, key=p.get, reverse=True) == ["a", "b", "c", "d", "e"], (
        "die Potenz darf die Reihenfolge nicht umwerfen")


def test_erfolg_beim_letzten_major_hebt_das_deck():
    """Gleicher Online-Anteil, gleicher Anteil beim Major — aber x kam
    doppelt so oft in Day 2 wie y. Dann muss x vorn liegen."""
    aktuell = {"x": 10.0, "y": 10.0, "z": 80.0}
    vorher = _major({"x": 10.0, "y": 10.0, "z": 80.0},
                    {"x": (100, 40), "y": (100, 10), "z": (800, 150)})
    p = bp.rechne(aktuell, vorher)
    assert p["x"] > p["y"], f"x {p['x']:.2f} nicht vor y {p['y']:.2f}"
    assert sum(p.values()) == pytest.approx(100.0, abs=1e-6)


def test_die_mischung_zieht_zum_anteil_beim_major():
    """Ein Deck, das online kaum vorkommt, aber beim Major 20 % hatte,
    bekommt einen sichtbaren Teil davon — ein Deck, das online gross ist
    und beim Major fehlte, verliert."""
    aktuell = {"klein": 1.0, "gross": 49.0, "rest": 50.0}
    vorher = _major({"klein": 20.0, "gross": 0.0, "rest": 80.0},
                    {"klein": (200, 40), "rest": (800, 160)})
    p = bp.rechne(aktuell, vorher, exponent=0)
    ohne = bp.rechne(aktuell, None)
    assert p["klein"] > ohne["klein"] + 5, f"klein {ohne['klein']:.2f} -> {p['klein']:.2f}"
    assert p["gross"] < ohne["gross"], "das beim Major fehlende Deck verliert nichts"


def test_das_letzte_major_kommt_aus_dem_laufenden_format():
    anker = [
        _major({"a": 50.0}, {}, datum="2026-10-03", name="alt"),
        _major({"a": 30.0}, {}, datum="2026-10-09", name="Louisville", spieler=3000),
        _major({"a": 10.0}, {}, datum="2026-10-12", meta="TEF-PBL", name="fremdes Format"),
        _major({"a": 90.0}, {}, datum="2026-10-20", name="nach dem Stichtag"),
    ]
    v = bp.letztes_major(anker, "TEF-30C", "2026-10-16")
    assert v and v["namen"] == ["Louisville"], v and v["namen"]
    assert bp.letztes_major(anker, "TEF-30C", "2026-12-31") is None or \
        bp.letztes_major(anker, "TEF-30C", "2026-12-31")["datum"] >= "2026-11-26", (
        "ein Major aelter als die Hoechstfrist darf nicht mehr zaehlen")


def test_zwei_majors_am_selben_tag_werden_nach_spielern_gewichtet():
    anker = [_major({"a": 10.0}, {"a": (100, 20)}, datum="2026-09-26", spieler=3000, name="F"),
             _major({"a": 30.0}, {"a": (50, 20)}, datum="2026-09-26", spieler=1000, name="B")]
    v = bp.letztes_major(anker, "TEF-30C", "2026-10-01")
    assert sorted(v["namen"]) == ["B", "F"]
    assert v["anteile"]["a"] == pytest.approx(15.0)
    assert v["day2"]["a"] == (150, 40)


def test_das_band_umschliesst_die_prognose_auch_mit_major():
    aktuell = {c: v for c, v in zip("abcdefgh", [20, 15, 12, 10, 8, 6, 5, 24])}
    vorher = _major({"a": 25.0, "h": 30.0, "c": 5.0, "neu": 4.0},
                    {"a": (250, 60), "h": (300, 50), "c": (50, 5), "neu": (40, 15)})
    m = {"verdichtung_median": 9.0, "verdichtung_min": 3.0,
         "verdichtung_max": 12.0, "art": "regional", "anker": 6}
    p = bp.prognose(aktuell, {c: 1 for c in aktuell}, 100, m, vorher)
    assert sum(z["prognose"] for z in p) == pytest.approx(100.0, abs=0.01)
    for z in p:
        assert z["prognose_von"] <= z["prognose"] <= z["prognose_bis"], z
    neu = [z for z in p if z["archetyp_id"] == "neu"]
    assert neu and neu[0]["online_anteil"] == 0 and neu[0]["prognose"] > 0, (
        "ein Deck, das nur beim Major gespielt wurde, fehlt in der Prognose")


def test_der_rueckblick_misst_die_rechnung_an_vergangenen_majors():
    """Die Zahl, die der Meta Call als Fehler der Prediction nennt, muss
    aus genau dieser Rechnung kommen — und ein Worlds zaehlt nicht."""
    zeilen = []
    for tag in ("2026-10-05", "2026-10-08"):
        decks = [("a", 40), ("b", 30), ("c", 20), ("other", 10)] + [(chr(100 + i), 1) for i in range(30)]
        for aid, n in decks:
            zeilen.append({"meta": "TEF-30C", "date": tag, "archetype_id": aid,
                           "archetype_name": aid.upper(), "lists": str(n * 10)})
    anteile = {chr(100 + i): 0.1 for i in range(30)}
    anteile.update({"a": 45.0, "b": 30.0, "c": 15.0})
    anker = [
        {"datum": "2026-10-10", "name": "Regional Championship X", "meta": "TEF-30C",
         "art": "regional", "spieler": 1000, "anteile": dict(anteile), "day2": {}},
        {"datum": "2026-10-10", "name": "World Championship Y", "meta": "TEF-30C",
         "art": "worlds", "spieler": 500, "anteile": dict(anteile), "day2": {}},
    ]
    rb = bp.rueckblick(zeilen, anker)
    assert rb and rb["turniere"] == 1, "Worlds darf nicht mitzaehlen"
    erwartet = bp.rechne(bp.online_anteile(zeilen, "TEF-30C", "2026-09-26", "2026-10-09")[0], None)
    oben = sorted(erwartet.items(), key=lambda x: -x[1])[:25]
    mae = sum(abs(v - anteile.get(k, 0.0)) for k, v in oben) / len(oben)
    assert rb["mae"] == pytest.approx(mae, abs=1e-3)
