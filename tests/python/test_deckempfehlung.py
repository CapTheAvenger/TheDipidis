"""Die Deckempfehlung muss besser sein als das Durchschnittsdeck — nachweislich.

Der Betreiber will einen Archetyp genannt bekommen, ihn spielen und Day 2
erreichen. Damit ist die Zielgroesse nicht der Prognosefehler, sondern die
tatsaechliche Day-2-Quote des empfohlenen Decks.

Gemessen am 23.08.2026 ueber 44 vergangene Turniere:

    Durchschnittsdeck des Feldes      14,88 %
    diese Regel                       24,75 %
    bestmoegliche Wahl im Nachhinein  35,83 %

Diese Datei haelt drei Dinge fest, die getrennt kaputtgehen koennen:

  1. Die Schrumpfungsformel selbst — ein Deck mit sechs Spielern und 66,7 %
     darf nicht ueber einem mit 2.000 Spielern und 31,7 % stehen.
  2. Die Leckfreiheit — die Empfehlung darf kein Turnier sehen, das am oder
     nach dem Zieldatum liegt. Ohne diese Pruefung waere die 24,75 %
     wertlos, und der Fehler waere von aussen unsichtbar.
  3. Die Wirkung am echten Datenbestand, mit grosszuegigem Abstand zur
     gemessenen Zahl. Der Test soll anschlagen, wenn die Regel kaputtgeht —
     nicht, wenn ein neues Turnier die Quote um einen Punkt verschiebt.
"""

import importlib.util
import io
import json
import os
import statistics
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
QUELLE = os.path.join(WURZEL, "scripts", "build_deckempfehlung.py")


@pytest.fixture(scope="module")
def modul():
    spec = importlib.util.spec_from_file_location("deckempf", QUELLE)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def _turnier(tid, meta, datum, zeilen, spieler=1000):
    return {"id": tid, "meta": meta, "datum": datum, "name": f"T{tid}",
            "spieler": spieler, "zeilen": zeilen}


def _zeile(name, day1, konv):
    return {"deck_name": name, "day1_players": str(day1),
            "day1_to_day2_conv": str(konv), "total_players": "1000"}


# ── 1. Die Formel ──────────────────────────────────────────────────────

def test_duenne_datenlage_wird_geschrumpft(modul):
    """Der Fall, fuer den die Schrumpfung da ist — am echten Anker geprueft.

    Sylveon steht im aktuellen Anker mit 6 Spielern und 66,7 % Rohquote.
    Ohne Schrumpfung waere es die Empfehlung fuer Worlds gewesen; mit ihr
    faellt es hinter Dragapult (2.038 Spieler, 31,7 %) zurueck.

    WICHTIG, weil nicht offensichtlich: die Schrumpfung garantiert das nicht
    fuer jede denkbare Konstellation. Ein Deck mit n Spielern behaelt das
    Gewicht n/(n+k) auf seinem Rohwert — bei n=6 und k=60 sind das 9 %. Liegt
    der Prior nahe am Wert des dicken Decks, kann ein extremer Ausreisser
    trotzdem obenauf landen. Im echten Anker ist das ausgeschlossen, weil
    Dragapult 13 Punkte ueber dem Prior liegt: ein 6-Spieler-Deck muesste
    dafuer ueber 160 % Konversion zeigen. Der Test unten sichert genau diese
    Lage, nicht die Formel im Allgemeinen.
    """
    turniere = modul.lies_turniere(os.path.join(WURZEL, "data"))
    if not turniere:
        pytest.skip("keine Turnierdaten")
    format_key, vorformat = modul.aktuelles_format(os.path.join(WURZEL, "data"))
    anker, k, _ = modul.waehle_anker(turniere, format_key, vorformat)
    score, detail, _ = modul.bewerte(anker, k)
    if not score:
        pytest.skip("kein Anker")
    beste = max(score, key=lambda x: score[x])
    assert detail["d1"][beste] >= 100, (
        f"empfohlen wurde {detail['namen'][beste]!r} mit nur "
        f"{detail['d1'][beste]:.0f} Ankerspielern — die Schrumpfung greift nicht")
    duenn = [x for x in score if detail["d1"][x] < 20]
    for x in duenn:
        assert score[x] < score[beste], (
            f"{detail['namen'][x]!r} hat nur {detail['d1'][x]:.0f} Spieler "
            f"({detail['roh'][x]:.1f} % roh) und steht trotzdem oben")


def test_gewicht_auf_dem_rohwert_ist_n_durch_n_plus_k(modul):
    """Die Formel ist eine gewichtete Mischung aus Rohwert und Prior. Das
    Gewicht auf dem Rohwert muss exakt n/(n+k) sein — daran haengt die
    ganze Wirkung der Schrumpfung."""
    anker = [_turnier("1", "X", "2026-01-01", [
        _zeile("Gross", 900, 0.20),
        _zeile("Klein", 100, 0.50),
    ])]
    score, detail, p0 = modul.bewerte(anker, modul.K_NORMAL)
    for name in ("Gross", "Klein"):
        kk = modul.schluessel(name)
        n = detail["d1"][kk]
        erwartet = (n * detail["roh"][kk] + modul.K_NORMAL * p0) / (n + modul.K_NORMAL)
        assert abs(score[kk] - erwartet) < 1e-9, f"{name}: Mischung stimmt nicht"


def test_schrumpfung_zieht_zum_feldmittel(modul):
    """Richtung und Staerke: je duenner, desto naeher am Prior."""
    anker = [_turnier("1", "X", "2026-01-01", [
        _zeile("Gross", 1000, 0.30),
        _zeile("Mittel", 100, 0.60),
        _zeile("Klein", 5, 0.60),
    ])]
    score, detail, p0 = modul.bewerte(anker, modul.K_NORMAL)
    gross = score[modul.schluessel("Gross")]
    mittel = score[modul.schluessel("Mittel")]
    klein = score[modul.schluessel("Klein")]
    assert abs(gross - 30.0) < 1.0, "ein grosses Deck bleibt fast bei seinem Rohwert"
    assert klein < mittel, "gleiche Rohquote, weniger Spieler -> staerker geschrumpft"
    assert abs(klein - p0) < abs(mittel - p0), "das kleinste Deck liegt am naechsten am Prior"


def test_prior_ist_die_feldkonversion(modul):
    anker = [_turnier("1", "X", "2026-01-01", [
        _zeile("A", 100, 0.20), _zeile("B", 100, 0.40),
    ])]
    _, _, p0 = modul.bewerte(anker, modul.K_NORMAL)
    assert abs(p0 - 30.0) < 0.01, "spielergewichteter Schnitt aus 20 % und 40 %"


def test_leerer_anker_liefert_nichts(modul):
    score, _, _ = modul.bewerte([], modul.K_NORMAL)
    assert score == {}


# ── 2. Leckfreiheit ────────────────────────────────────────────────────

def test_rueckwaertsstrecke_sieht_das_ziel_nicht(modul):
    """Der wichtigste Test der Datei.

    Beim Zielturnier gewinnt ein Deck, das in den Vorturnieren miserabel war.
    Wuerde die Strecke das Ziel mitlesen, empfaehle sie genau dieses Deck.
    """
    zeilen_vor = [_zeile("Solide", 300, 0.30), _zeile("Ueberraschung", 300, 0.02)]
    ziel_zeilen = [_zeile("Solide", 300, 0.10), _zeile("Ueberraschung", 300, 0.90),
                   _zeile("C", 50, 0.10), _zeile("D", 50, 0.10), _zeile("E", 50, 0.10)]
    turniere = {
        "1": _turnier("1", "X", "2026-01-01", zeilen_vor),
        "2": _turnier("2", "X", "2026-01-08", zeilen_vor),
        "3": _turnier("3", "X", "2026-01-15", ziel_zeilen),
    }
    faelle = modul.rueckwaertsstrecke(turniere, "A")
    assert len(faelle) == 1
    assert faelle[0]["deck"] == modul.schluessel("Solide"), (
        "empfohlen wurde das Deck mit dem besten Ergebnis AM ZIEL — "
        "die Strecke liest die Zukunft mit")


def test_gleiches_datum_zaehlt_nicht_als_vorgaenger(modul):
    """Ein Turnier am selben Tag ist kein Vorwissen. Strikt frueher, sonst nichts."""
    z = [_zeile("A", 100, 0.30), _zeile("B", 100, 0.10), _zeile("C", 20, 0.2),
         _zeile("D", 20, 0.2), _zeile("E", 20, 0.2)]
    turniere = {
        "1": _turnier("1", "X", "2026-01-01", z),
        "2": _turnier("2", "X", "2026-01-08", z),
        "3": _turnier("3", "X", "2026-01-08", z),
    }
    faelle = modul.rueckwaertsstrecke(turniere, "A")
    # Ziel 3 hat nur EINEN strikt frueheren Vorgaenger (1), also < ANKERTIEFE.
    assert all(f["datum"] != "2026-01-08" or f["turnier"] != "T3" for f in faelle) or not faelle


def test_nur_die_eigene_epoche_zaehlt(modul):
    """Ein Turnier aus einer anderen Meta-Epoche ist kein Vorgaenger."""
    z = [_zeile("A", 100, 0.30), _zeile("B", 100, 0.10), _zeile("C", 20, 0.2),
         _zeile("D", 20, 0.2), _zeile("E", 20, 0.2)]
    turniere = {
        "1": _turnier("1", "ALT", "2026-01-01", z),
        "2": _turnier("2", "ALT", "2026-01-08", z),
        "3": _turnier("3", "NEU", "2026-01-15", z),
    }
    assert modul.rueckwaertsstrecke(turniere, "A") == []


# ── 3. Wirkung am echten Bestand ───────────────────────────────────────

@pytest.fixture(scope="module")
def echte_turniere(modul):
    turniere = modul.lies_turniere(os.path.join(WURZEL, "data"))
    if not turniere:
        pytest.skip("keine Turnierdaten im Repo")
    return turniere


@pytest.fixture(scope="module")
def echte_strecke(modul, echte_turniere):
    """Betriebsart A — der Normalfall."""
    return modul.rueckwaertsstrecke(echte_turniere, "A")


@pytest.fixture(scope="module")
def echte_strecke_kalt(modul, echte_turniere):
    """Betriebsart B — der Kaltstart. Muss getrennt gemessen werden: die
    erste Fassung pruefte nur A und stellte deren Zahl neben eine
    B-Empfehlung. Genau das soll hier nie wieder unbemerkt passieren."""
    return modul.rueckwaertsstrecke(echte_turniere, "B")


def test_die_strecke_hat_genug_ziele(echte_strecke):
    assert len(echte_strecke) >= 30, (
        f"nur {len(echte_strecke)} Ziele — darunter traegt keine Aussage")


def test_empfehlung_schlaegt_das_durchschnittsdeck(modul, echte_strecke):
    """Die Kernaussage. Grosszuegige Schwelle: gemessen sind es +9,9 pp,
    der Test schlaegt erst unter +5 an. Er soll Defekte fangen, nicht
    normale Datenbewegung."""
    empf = statistics.mean(f["quote"] for f in echte_strecke)
    feld = statistics.mean(f["feld"] for f in echte_strecke)
    assert empf - feld >= 5.0, (
        f"Empfehlung {empf:.2f} % gegen Feldschnitt {feld:.2f} % — "
        f"der Vorsprung ist auf {empf - feld:.2f} pp gefallen")


def test_empfehlung_holt_ein_drittel_des_erreichbaren_zugewinns(modul, echte_strecke):
    """Anteil am erreichbaren ZUGEWINN, nicht am Bestwert.

    Die erste Fassung rechnete Empfehlung / bestmoeglich und kam auf 69 %.
    Diese Groesse ist wertlos: wer immer das Feldmittel trifft, steht damit
    schon bei 42 %, ohne irgendetwas beigetragen zu haben. Gemessen mit der
    richtigen Formel sind es 47 %; der Test schlaegt unter 33 % an.
    """
    empf = statistics.mean(f["quote"] for f in echte_strecke)
    feld = statistics.mean(f["feld"] for f in echte_strecke)
    best = statistics.mean(f["best"] for f in echte_strecke)
    anteil = (empf - feld) / (best - feld)
    assert anteil >= 0.33, (
        f"nur {anteil * 100:.0f} % des erreichbaren Zugewinns")


def test_kaltstart_wird_gegen_eigene_faelle_gemessen(modul, echte_strecke, echte_strecke_kalt):
    """Die beiden Betriebsarten teilen sich kein einziges Turnier.

    Waere das nicht so, koennte die Zahl der einen als Beleg fuer die andere
    durchgehen — der Fehler, den diese Datei gemacht hat.
    """
    a = {(f["turnier"], f["datum"]) for f in echte_strecke}
    b = {(f["turnier"], f["datum"]) for f in echte_strecke_kalt}
    assert a and b, "beide Betriebsarten brauchen eigene Faelle"
    assert not (a & b), f"{len(a & b)} Turniere zaehlen fuer beide Betriebsarten"


def test_kaltstart_schlaegt_das_feld_wenn_auch_schwaecher(modul, echte_strecke_kalt):
    """Der Kaltstart darf schwaecher sein als der Normalfall — aber nicht wertlos.

    Gemessen +7,1 pp bei SE 2,4 ueber 22 Turniere. Der Test schlaegt unter
    +2 pp an. Bewusst weit unter dem Messwert: bei 22 Faellen schwankt die
    Zahl, und ein Test, der bei normaler Datenbewegung rot wird, wird
    abgeschaltet statt gelesen.
    """
    empf = statistics.mean(f["quote"] for f in echte_strecke_kalt)
    feld = statistics.mean(f["feld"] for f in echte_strecke_kalt)
    assert empf - feld >= 2.0, (
        f"Kaltstart {empf:.2f} % gegen Feld {feld:.2f} % — "
        f"nur noch {empf - feld:.2f} pp Vorsprung")


def test_kaltstart_findet_weniger_zieldecks_wieder(modul, echte_strecke, echte_strecke_kalt):
    """Der benennbare Grund, warum B schwaecher ist: ueber eine Epochengrenze
    kennt der Anker weniger Decks des Zielturniers. Faellt dieser Test, ist
    die Erklaerung im Kopf der Datei nicht mehr wahr."""
    ab_a = statistics.mean(f["abdeckung"] for f in echte_strecke)
    ab_b = statistics.mean(f["abdeckung"] for f in echte_strecke_kalt)
    assert ab_b < ab_a, (
        f"Kaltstart-Abdeckung {ab_b:.3f} nicht unter Normalfall {ab_a:.3f}")


def test_haeufiger_besser_als_der_feldschnitt(echte_strecke):
    besser = sum(1 for f in echte_strecke if f["quote"] > f["feld"])
    anteil = besser / len(echte_strecke)
    assert anteil >= 0.75, (
        f"nur in {besser} von {len(echte_strecke)} Turnieren ueber dem Feldschnitt")


def test_das_meistgespielte_deck_waere_schlechter(modul):
    """Gegenprobe: die Regel muss die naheliegende Alternative schlagen,
    sonst ist sie ihren Aufwand nicht wert."""
    turniere = modul.lies_turniere(os.path.join(WURZEL, "data"))
    if not turniere:
        pytest.skip("keine Turnierdaten")
    sortiert = sorted(turniere.values(), key=lambda t: (t["datum"], t["id"]))
    eigene, populaer = [], []
    for ziel in sortiert:
        vor = [t for t in sortiert if t["meta"] == ziel["meta"] and t["datum"] < ziel["datum"]]
        if len(vor) < modul.ANKERTIEFE:
            continue
        ist = modul.ziel_quoten(ziel)
        if len(ist) < 5:
            continue
        anker = vor[-modul.ANKERTIEFE:]
        score, _, _ = modul.bewerte(anker, modul.K_NORMAL)
        moeglich = [k for k in score if k in ist]
        if not moeglich:
            continue
        eigene.append(ist[max(moeglich, key=lambda k: (score[k], k))])
        gebracht = {}
        for t in anker:
            for r in t["zeilen"]:
                k = modul.schluessel(r.get("deck_name"))
                if k:
                    gebracht[k] = gebracht.get(k, 0.0) + modul.zahl(r.get("day1_players"))
        kand = [k for k in gebracht if k in ist]
        if kand:
            populaer.append(ist[max(kand, key=lambda k: gebracht[k])])
    assert statistics.mean(eigene) > statistics.mean(populaer) + 3.0, (
        f"Regel {statistics.mean(eigene):.2f} % gegen 'meistgespieltes Deck' "
        f"{statistics.mean(populaer):.2f} % — der Aufwand lohnt nicht mehr")


# ── 4. Betriebsartwahl ─────────────────────────────────────────────────

def test_kaltstart_wird_erkannt(modul):
    z = [_zeile("A", 100, 0.3)]
    # Drei Turniere in der Vorepoche, damit "komplett" und "letzte zwei"
    # unterscheidbar sind. Mit nur zweien waere der Test blind.
    turniere = {
        "1": _turnier("1", "ALT", "2026-01-01", z),
        "2": _turnier("2", "ALT", "2026-01-08", z),
        "3": _turnier("3", "ALT", "2026-01-15", z),
    }
    anker, k, art = modul.waehle_anker(turniere, "NEU", "ALT")
    assert art == "B" and k == modul.K_KALTSTART
    assert len(anker) == 3, (
        "im Kaltstart zaehlt die KOMPLETTE Vorepoche, nicht ihre letzten zwei — "
        "gemessen: komplette Vorepoche 22,2 %, nur die letzten zwei 18,2 %")


def test_ein_einziges_turnier_reicht_fuer_betriebsart_A(modul):
    """Ab dem ersten Praesenzturnier des Formats zaehlt nur noch dieses.
    Gemessen: die Vorepoche beizumischen verschlechtert monoton."""
    z = [_zeile("A", 100, 0.3)]
    turniere = {
        "1": _turnier("1", "ALT", "2026-01-01", z),
        "2": _turnier("2", "NEU", "2026-02-01", z),
    }
    anker, k, art = modul.waehle_anker(turniere, "NEU", "ALT")
    assert art == "A" and k == modul.K_NORMAL
    assert [t["id"] for t in anker] == ["2"], "keine Vorepoche beimischen"


def test_ausgabedatei_ist_vollstaendig(modul, tmp_path):
    ziel = tmp_path / "deckempfehlung.json"
    rc = modul.main.__wrapped__() if hasattr(modul.main, "__wrapped__") else None
    sys.argv = ["build_deckempfehlung.py", "--out", str(ziel)]
    assert modul.main() == 0
    d = json.loads(io.open(ziel, encoding="utf-8").read())
    for feld in ("format", "betriebsart", "schrumpfung_k", "anker", "empfehlung",
                 "rangliste", "vertrauen"):
        assert feld in d, f"{feld} fehlt in der Ausgabe"
    assert d["empfehlung"]["deck"], "keine Empfehlung erzeugt"
    v = d["vertrauen"]
    assert v["empfehlung_mittel"] > v["feld_mittel"], (
        "die Vertrauensangabe muss den echten Vorsprung tragen")
    assert v["bestmoeglich_mittel"] > v["empfehlung_mittel"], (
        "bestmoeglich muss ueber der Empfehlung liegen, sonst stimmt die Rechnung nicht")


# ── 4. Anzeige: was der Nutzer zu sehen bekommt ────────────────────────

def test_duenne_decks_stehen_nicht_in_der_rangliste(modul, echte_turniere):
    """Kein Deck unter MIN_ANZEIGE Ankerspielern bekommt einen Rang.

    Geprueft wird die ausgelieferte Funktion, nicht die Regel nachgebaut —
    ein Test, der die Filterung selbst noch einmal hinschreibt, bleibt gruen,
    wenn die Filterung im Skript verschwindet.
    """
    sortiert = sorted(echte_turniere.values(), key=lambda t: (t["datum"], t["id"]))
    anker = sortiert[-modul.ANKERTIEFE:]
    score, detail, _ = modul.bewerte(anker, modul.K_NORMAL)
    voll, sichtbar = modul.ranglisten(score, detail)
    assert sichtbar, "die Rangliste darf nicht leer werden"
    for e in sichtbar:
        assert e["ankerspieler"] >= modul.MIN_ANZEIGE, (
            f"{e['deck']} steht mit nur {e['ankerspieler']} Ankerspielern in der Rangliste")
    # Die vollstaendige Liste bleibt nachpruefbar und ist laenger.
    assert len(voll) >= len(sichtbar)


def test_die_duennen_verschwinden_nicht_spurlos(modul):
    """Was gefiltert wird, muss in der vollstaendigen Liste noch auftauchen."""
    detail = {
        "d1": {"dick": 1000.0, "duenn": 4.0},
        "roh": {"dick": 25.0, "duenn": 75.0},
        "namen": {"dick": "Dickes Deck", "duenn": "Duennes Deck"},
    }
    voll, sichtbar = modul.ranglisten({"duenn": 40.0, "dick": 25.0}, detail)
    assert [e["schluessel"] for e in sichtbar] == ["dick"], (
        "das duenne Deck darf trotz hoeherem Score nicht angezeigt werden")
    assert {e["schluessel"] for e in voll} == {"dick", "duenn"}


def test_kaltstart_anker_umfasst_mehr_als_eine_epoche(modul, echte_turniere):
    """Zwei Epochen statt einer — gemessen +1,87 pp bei SE 0,83.

    Der Test prueft die Wirkung, nicht die Konstante: der Anker muss mehr
    Turniere enthalten als die juengste Epoche allein hergibt.
    """
    assert modul.EPOCHENTIEFE_KALTSTART >= 2
    sortiert = sorted(echte_turniere.values(), key=lambda t: (t["datum"], t["id"]))
    folge = modul.epochenfolge(sortiert)
    assert len(folge) >= 3, "zu wenige Epochen im Bestand, um das zu pruefen"
    ziel_epoche = folge[-1]
    anker = modul.kaltstart_anker(sortiert, ziel_epoche, folge[-2])
    nur_eine = [t for t in sortiert if t["meta"] == folge[-2]]
    assert len(anker) > len(nur_eine), (
        f"Kaltstart-Anker hat {len(anker)} Turniere, die Vorepoche allein "
        f"schon {len(nur_eine)} — die zweite Epoche fehlt")
    assert all(t["meta"] != ziel_epoche for t in anker), (
        "der Kaltstart-Anker darf kein Turnier aus dem Zielformat enthalten")


def test_kaltstart_anker_respektiert_das_stichdatum(modul, echte_turniere):
    """bis_datum muss wirken, sonst leckt die Rueckwaertsstrecke."""
    sortiert = sorted(echte_turniere.values(), key=lambda t: (t["datum"], t["id"]))
    folge = modul.epochenfolge(sortiert)
    ziel_epoche = folge[-1]
    voll = modul.kaltstart_anker(sortiert, ziel_epoche, folge[-2])
    assert voll, "ohne Stichdatum muss ein Anker herauskommen"
    grenze = sorted(t["datum"] for t in voll)[len(voll) // 2]
    beschnitten = modul.kaltstart_anker(sortiert, ziel_epoche, folge[-2], grenze)
    assert len(beschnitten) < len(voll), "das Stichdatum hat nichts abgeschnitten"
    for t in beschnitten:
        assert t["datum"] < grenze, f"{t['datum']} liegt nicht vor {grenze}"


def test_vertrauen_meldet_vorsprung_und_streuung(modul, echte_strecke):
    """Ohne Standardfehler liest sich jede Differenz wie ein Ergebnis."""
    v = modul.vertrauen(echte_strecke)
    assert v["vorsprung"] > 0
    assert v["vorsprung_standardfehler"] is not None and v["vorsprung_standardfehler"] > 0
    erwartet = (statistics.mean(f["quote"] for f in echte_strecke)
                - statistics.mean(f["feld"] for f in echte_strecke))
    assert abs(v["vorsprung"] - erwartet) < 0.01
    # Der Anteil am Erreichbaren muss der Zugewinn sein, nicht das Verhaeltnis
    # zum Bestwert — sonst steht dort auch fuer eine wertlose Regel eine
    # zweistellige Zahl.
    best = statistics.mean(f["best"] for f in echte_strecke)
    feld = statistics.mean(f["feld"] for f in echte_strecke)
    assert abs(v["anteil_am_erreichbaren"] - erwartet / (best - feld) * 100) < 0.2
