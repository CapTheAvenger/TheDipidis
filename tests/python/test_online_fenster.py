"""Das 14-Tage-Fenster darf nicht raten.

Der Limitless-Online-Scraper liefert nur KUMULATIVE Zaehlstaende seit
Formatbeginn. Ein Deck, das vor sechs Wochen stark war und seitdem
verschwunden ist, steht im Kumulativstand weiter oben — der angezeigte
Anteil beschreibt dann eine Vergangenheit, die niemand mehr spielt.

scripts/build_online_fenster.py rechnet deshalb aus zwei gemessenen
Staenden die Differenz: count_fenster = count(heute) - count(vor N Tagen).
Das ist keine Schaetzung, sondern eine Subtraktion zweier echter Zahlen.

Diese Suite haelt die Eigenschaften fest, an denen die Rechnung scheitern
wuerde:

* Die Basis darf NICHT juenger als der Zielpunkt sein — sonst ist das
  Fenster kuerzer als angeschrieben und die Anteile sind zu klein.
* Ein negativer Zuwachs (die Quelle hat Archetypen umgruppiert) wird auf
  0 geklemmt, nicht durchgereicht.
* Ein Deck ohne Fensterspiele steht mit 0 da, nicht mit seinem alten Anteil.
* Zu wenige Staende ergeben KEINE Datei und keinen Abbruch, sondern eine
  Warnung — der Wochenlauf soll daran nicht zerbrechen.
"""

import csv
import importlib.util
import json
import io
import json
import os

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
SKRIPT = os.path.join(WURZEL, "scripts", "build_online_fenster.py")


def _modul():
    spec = importlib.util.spec_from_file_location("bof", SKRIPT)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def _stand(ordner, datum, paare):
    pfad = os.path.join(ordner, datum + ".csv")
    with io.open(pfad, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["deck_name", "count", "share"])
        for name, count in paare:
            w.writerow([name, count, ""])
    return pfad


@pytest.fixture()
def welt(tmp_path):
    m = _modul()
    verlauf = tmp_path / "verlauf"
    verlauf.mkdir()
    m.VERLAUF = str(verlauf)
    m.ZIEL = str(tmp_path / "fenster.csv")
    return m, str(verlauf)


def test_fenster_ist_die_differenz_zweier_staende(welt):
    m, ordner = welt
    _stand(ordner, "2026-08-01", [("Alpha", 100), ("Beta", 100)])
    _stand(ordner, "2026-08-15", [("Alpha", 400), ("Beta", 100)])

    (zeilen, meta), fehler = m.baue(fenster_tage=14)
    assert fehler is None
    nach_name = {r["deck_name"]: r for r in zeilen}

    # Alpha hat 300 der 300 neuen Decks gestellt, Beta keins.
    assert nach_name["Alpha"]["count_fenster"] == 300
    assert nach_name["Beta"]["count_fenster"] == 0
    assert nach_name["Alpha"]["share_fenster"] == 100.0
    assert nach_name["Beta"]["share_fenster"] == 0.0
    assert meta["decks_im_fenster"] == 300
    assert meta["fenster_tage"] == 14


def test_kumulativ_und_fenster_koennen_weit_auseinanderliegen(welt):
    """Genau der Fall, wegen dem das Fenster gebaut wurde."""
    m, ordner = welt
    # Beta war frueher stark, spielt aber im Fenster fast nicht mehr.
    _stand(ordner, "2026-08-01", [("Alpha", 100), ("Beta", 900)])
    _stand(ordner, "2026-08-15", [("Alpha", 400), ("Beta", 1000)])

    (zeilen, _meta), fehler = m.baue(fenster_tage=14)
    assert fehler is None
    nach_name = {r["deck_name"]: r for r in zeilen}

    # Kumulativ fuehrt Beta klar, im Fenster fuehrt Alpha klar.
    assert nach_name["Beta"]["rang_kumulativ"] == 1
    assert nach_name["Alpha"]["rank_fenster"] == 1
    assert nach_name["Beta"]["share_kumulativ"] > nach_name["Alpha"]["share_kumulativ"]
    assert nach_name["Alpha"]["share_fenster"] > nach_name["Beta"]["share_fenster"]
    # Der Versatz macht den Unterschied sichtbar, statt ihn zu verschweigen.
    assert nach_name["Beta"]["rang_versatz"] == -1
    assert nach_name["Alpha"]["rang_versatz"] == 1


def test_basis_ist_nie_juenger_als_der_zielpunkt(welt):
    """Ein juengerer Stand wuerde das Fenster heimlich verkuerzen."""
    m, ordner = welt
    _stand(ordner, "2026-08-01", [("Alpha", 100)])   # 14 Tage vorher
    _stand(ordner, "2026-08-10", [("Alpha", 300)])   # zu jung fuer 14 Tage
    _stand(ordner, "2026-08-15", [("Alpha", 400)])

    (zeilen, meta), fehler = m.baue(fenster_tage=14)
    assert fehler is None
    assert meta["fenster_von"] == "2026-08-01"
    assert meta["fenster_tage"] == 14
    assert zeilen[0]["count_fenster"] == 300


def test_zu_kurzer_verlauf_nimmt_den_aeltesten_stand(welt):
    m, ordner = welt
    _stand(ordner, "2026-08-10", [("Alpha", 100)])
    _stand(ordner, "2026-08-15", [("Alpha", 400)])

    (_zeilen, meta), fehler = m.baue(fenster_tage=14)
    assert fehler is None
    # Kein erfundener 14-Tage-Zeitraum: die Meldung nennt die echte Spanne.
    assert meta["fenster_von"] == "2026-08-10"
    assert meta["fenster_tage"] == 5


def test_negativer_zuwachs_wird_geklemmt_nicht_durchgereicht(welt):
    """Die Quelle gruppiert Archetypen gelegentlich um."""
    m, ordner = welt
    # Realistisch skaliert: die Klemmung muss klein gegenueber dem
    # Fenster bleiben, sonst schlaegt (zu Recht) die Divergenzschranke an.
    _stand(ordner, "2026-08-01", [("Alpha", 1000), ("Beta", 500)])
    _stand(ordner, "2026-08-15", [("Alpha", 9000), ("Beta", 300)])

    (zeilen, meta), fehler = m.baue(fenster_tage=14)
    assert fehler is None, fehler
    nach_name = {r["deck_name"]: r for r in zeilen}
    assert nach_name["Beta"]["count_fenster"] == 0
    assert nach_name["Beta"]["share_fenster"] == 0.0
    # Kein Anteil ist negativ.
    assert all(r["share_fenster"] >= 0 for r in zeilen)


def test_ein_einziger_stand_ergibt_kein_fenster(welt):
    m, ordner = welt
    _stand(ordner, "2026-08-15", [("Alpha", 400)])
    ergebnis, fehler = m.baue(fenster_tage=14)
    assert ergebnis is None
    assert fehler and "Tagesstand" in fehler


def test_kein_zuwachs_ergibt_kein_fenster(welt):
    m, ordner = welt
    _stand(ordner, "2026-08-01", [("Alpha", 400)])
    _stand(ordner, "2026-08-15", [("Alpha", 400)])
    ergebnis, fehler = m.baue(fenster_tage=14)
    assert ergebnis is None
    assert fehler and "Fenster" in fehler


def test_lauf_bricht_nicht_ab_wenn_kein_fenster_baubar_ist(welt, capsys):
    """Nicht blockierend: der Wochenlauf soll daran nicht zerbrechen."""
    m, ordner = welt
    _stand(ordner, "2026-08-15", [("Alpha", 400)])
    code = m.main([])
    assert code == 0
    assert "::warning::" in capsys.readouterr().out


def test_geschriebene_datei_traegt_ihren_nenner(welt):
    """Jede Quote traegt ihren Nenner — hier: Fenster UND Kumulativ."""
    m, ordner = welt
    _stand(ordner, "2026-08-01", [("Alpha", 100), ("Beta", 100)])
    _stand(ordner, "2026-08-15", [("Alpha", 400), ("Beta", 150)])

    (zeilen, meta), fehler = m.baue(fenster_tage=14)
    assert fehler is None
    m.schreibe(zeilen, meta)

    with io.open(m.ZIEL, encoding="utf-8-sig") as f:
        kopf = f.readline()
        rows = list(csv.DictReader(f, delimiter=";"))

    assert "Fenster 2026-08-01 bis 2026-08-15" in kopf
    assert "14 Tage" in kopf
    assert "350 Decks im Fenster" in kopf
    assert "keine Schaetzung" in kopf
    # Beide Nenner stehen in der Datei, nicht nur einer.
    assert "count_fenster" in rows[0] and "count_kumulativ" in rows[0]
    assert rows[0]["share_fenster"].count(",") == 1   # deutsches Dezimalkomma

    with io.open(m.ZIEL.replace(".csv", "_meta.json"), encoding="utf-8") as f:
        meta_datei = json.load(f)
    assert meta_datei["decks_im_fenster"] == 350
    assert meta_datei["fenster_tage"] == 14


def test_echte_ausgabe_ist_plausibel():
    """Die ausgelieferte Datei selbst, nicht nur die Rechnung."""
    pfad = os.path.join(WURZEL, "data", "limitless_online_fenster.csv")
    if not os.path.exists(pfad):
        pytest.skip("noch nicht erzeugt")
    with io.open(pfad, encoding="utf-8-sig") as f:
        f.readline()
        rows = list(csv.DictReader(f, delimiter=";"))
    assert len(rows) > 20
    summe = sum(float(r["share_fenster"].replace(",", ".")) for r in rows)
    assert 99.0 <= summe <= 101.0, f"Anteile summieren auf {summe}"
    # Raenge sind lueckenlos und aufsteigend.
    assert [int(r["rank_fenster"]) for r in rows] == list(range(1, len(rows) + 1))


def test_umbenennung_wird_nicht_als_zuwachs_gezaehlt(welt):
    """Der Befund der Gegenpruefung vom 05.09.2026.

    `neu = kum - alt` mit alt = 0 gibt einem Deck seinen KOMPLETTEN
    Kumulativstand als Fensterzuwachs. Ueber die 66 echten Staende
    finden sich 31 Namenswechsel mit count >= 20 — "Toucannon"
    erschien am 03.08. auf einen Schlag mit 590 Listen und waere als
    5,9 %-Deck auf Platz 7 ins Fenster gegangen, zwei Wochen lang.
    """
    m, ordner = welt
    _stand(ordner, "2026-08-01", [("Alpha", 100)])
    _stand(ordner, "2026-08-08", [("Alpha", 3000), ("Beta", 300)])  # Beta aus dem Nichts
    _stand(ordner, "2026-08-15", [("Alpha", 5000), ("Beta", 340)])

    (zeilen, meta), fehler = m.baue(fenster_tage=14)
    assert fehler is None
    nach_name = {r["deck_name"]: r for r in zeilen}
    # Der Block, mit dem Beta auftauchte (300), zaehlt nicht — was es
    # danach gespielt hat (40), schon. Die erste Reparatur warf BEIDES
    # weg und riss damit ein Loch in den Nenner.
    assert nach_name["Beta"]["count_fenster"] == 40, (
        "entweder ist der Phantomblock durchgerutscht oder es wurde "
        "gemessenes Wachstum weggeworfen")
    assert nach_name["Alpha"]["count_fenster"] == 4900
    # UND die Anteile muessen sich weiter auf 100 summieren. Ohne diese
    # Zusage stuende die Fehlmenge als Sollverhalten in der Suite.
    summe = sum(r["share_fenster"] for r in zeilen)
    assert 99.0 <= summe <= 101.0, f"Anteile summieren auf {summe}"


def test_ein_wirklich_neues_deck_zaehlt_ab_seinem_ersten_stand(welt):
    """Die Gegenprobe: klein angefangen heisst wirklich neu."""
    m, ordner = welt
    _stand(ordner, "2026-08-01", [("Alpha", 100)])
    _stand(ordner, "2026-08-08", [("Alpha", 250), ("Beta", 5)])
    _stand(ordner, "2026-08-15", [("Alpha", 400), ("Beta", 90)])

    (zeilen, _meta), fehler = m.baue(fenster_tage=14)
    assert fehler is None
    nach_name = {r["deck_name"]: r for r in zeilen}
    # 90 minus die 5, mit denen es zum ersten Mal auftauchte —
    # dieselbe Regel wie beim grossen Erstauftritt. ERSTAUFTRITT_MAX
    # entscheidet nur noch, ob sich der Fall MELDET.
    assert nach_name["Beta"]["count_fenster"] == 85


def test_die_verdachtsmeldung_nennt_deck_stand_und_zahl(welt, capsys):
    m, ordner = welt
    _stand(ordner, "2026-08-01", [("Alpha", 100)])
    _stand(ordner, "2026-08-08", [("Alpha", 3000), ("Beta", 300)])
    _stand(ordner, "2026-08-15", [("Alpha", 5000), ("Beta", 340)])
    m.baue(fenster_tage=14)
    aus = capsys.readouterr().out
    assert "::warning::" in aus
    assert "Beta" in aus and "2026-08-08" in aus and "300" in aus
    assert "zaehlt nicht als Fensterzuwachs" in aus


def test_zu_viele_umbenennungen_ergeben_gar_kein_fenster(welt):
    """Melden statt still reparieren: kippt die Quelle die halbe
    Namensmenge, ist die Differenz keine Groesse mehr.

    Gefangen wird das von der Divergenzschranke — die Bloecke
    umbenannter Decks sind genau der Anteil, um den Zeilensumme und
    rohe Differenz auseinanderlaufen. Eine zweite, eigene Schranke auf
    die Verdachtssumme stand bis zum 05.09.2026 daneben und mass
    dasselbe ungenauer.
    """
    m, ordner = welt
    _stand(ordner, "2026-08-01", [("Alpha", 100)])
    _stand(ordner, "2026-08-08", [("Alpha", 150), ("Beta", 900), ("Gamma", 800)])
    _stand(ordner, "2026-08-15", [("Alpha", 200), ("Beta", 950), ("Gamma", 850)])

    ergebnis, fehler = m.baue(fenster_tage=14)
    assert ergebnis is None
    assert fehler and "weichen um" in fehler


def test_die_echte_datei_traegt_keinen_kompletten_bestand():
    """Nachpruefung an der ausgelieferten Datei selbst.

    In der ersten Fassung stand "Alakazam Dusknoir" mit
    count_fenster 86 — genau seinem Kumulativstand.
    """
    import os
    pfad = os.path.join(WURZEL, "data", "limitless_online_fenster.csv")
    if not os.path.exists(pfad):
        pytest.skip("noch nicht erzeugt")
    with io.open(pfad, encoding="utf-8-sig") as f:
        f.readline()
        rows = list(csv.DictReader(f, delimiter=";"))
    gleich = [r["deck_name"] for r in rows
              if int(r["count_fenster"]) > 20
              and r["count_fenster"] == r["count_kumulativ"]]
    assert gleich == [], (
        "Decks, deren Fensterzuwachs ihrem ganzen Bestand entspricht — "
        "das ist der Umbenennungsfall: " + ", ".join(gleich))


def test_die_basis_ueberspringt_den_zaehlersturz_einer_rotation(welt, tmp_path):
    """Der gefaehrlichste Fall, gefunden bei der Gegenpruefung.

    Die Quelle setzt ihren Zaehler bei jeder Rotation auf null (in den
    echten Staenden am 24.05. und am 21.07.2026). Ein Fenster ueber so
    einen Sturz ist keine Differenz, sondern Unsinn — und wenn baue()
    nur abbricht, bleibt die ALTE Datei liegen und das Frontend liefert
    tagelang ein Fenster aus dem abgelaufenen Format aus.

    Zwei Merkmale schliessen einen Stand aus, und BEIDE werden
    gebraucht: das gepflegte set_release_date UND der gemessene
    Gesamtstand. Der echte Stand vom 17.07. faellt genau auf
    set_release_date und traegt trotzdem noch 30.762 Listen aus dem
    alten Format.
    """
    m, ordner = welt
    fw = tmp_path / "format_window.json"
    fw.write_text(json.dumps({"set_release_date": "2026-08-05"}), encoding="utf-8")
    m.FORMATFENSTER = str(fw)

    _stand(ordner, "2026-08-01", [("Alpha", 9000), ("Beta", 8000)])   # altes Format
    _stand(ordner, "2026-08-05", [("Alpha", 9500), ("Beta", 8400)])   # Sturz noch nicht da
    _stand(ordner, "2026-08-08", [("Alpha", 100)])                    # zurueckgesetzt
    _stand(ordner, "2026-08-15", [("Alpha", 400)])

    (zeilen, meta), fehler = m.baue(fenster_tage=14)
    assert fehler is None, fehler
    assert meta["fenster_von"] == "2026-08-08", (
        "die Basis liegt im alten Format — das Fenster misst den "
        "Zaehlersturz statt der Bewegung")
    assert meta["fenster_tage"] == 7
    assert zeilen[0]["count_fenster"] == 300


def test_ohne_gueltige_basis_gibt_es_kein_fenster(welt, tmp_path):
    m, ordner = welt
    fw = tmp_path / "format_window.json"
    fw.write_text(json.dumps({"set_release_date": "2026-08-20"}), encoding="utf-8")
    m.FORMATFENSTER = str(fw)
    _stand(ordner, "2026-08-01", [("Alpha", 9000)])
    _stand(ordner, "2026-08-15", [("Alpha", 100)])
    ergebnis, fehler = m.baue(fenster_tage=14)
    assert ergebnis is None
    assert fehler and "Format" in fehler


def test_der_nenner_ist_die_summe_der_zeilen(welt):
    """Nicht die Differenz der Gesamtstaende.

    Die beiden gehen auseinander, sobald ein Zuwachs geklemmt wird oder
    ein Name aus der Quelle verschwindet. Am 11.08.2026 standen 11.704
    (Differenz) gegen 11.810 (Summe der Zeilen) — die Anteile
    summierten auf 101,1 %, und die Kopfzeile behauptete eine Deckzahl,
    die unter ihr nicht stand.
    """
    m, ordner = welt
    _stand(ordner, "2026-08-01", [("Alpha", 1000), ("Beta", 500), ("Gamma", 200)])
    # Beta faellt (Quelle gruppiert um), Gamma verschwindet ganz.
    _stand(ordner, "2026-08-15", [("Alpha", 9000), ("Beta", 300)])

    (zeilen, meta), fehler = m.baue(fenster_tage=14)
    assert fehler is None, fehler
    spalte = sum(r["count_fenster"] for r in zeilen)
    assert meta["decks_im_fenster"] == spalte, (
        "die Kopfzeile nennt eine andere Zahl als die Spalte darunter")
    assert meta["decks_im_fenster"] == 8000       # nur Alphas echter Zuwachs
    assert meta["decks_differenz_roh"] == 7600    # die rohe Differenz weicht ab
    summe = sum(r["share_fenster"] for r in zeilen)
    assert 99.0 <= summe <= 101.0, f"Anteile summieren auf {summe}"


def test_baue_prueft_sich_selbst_vor_dem_schreiben():
    """Der Wochenlauf faehrt keine Testsuite.

    `grep -E "pytest|node --test" .github/workflows/weekly-full-update.yml`
    findet nichts — eine Zusicherung in dieser Datei sieht die frisch
    gebaute Ausgabe also nie. Die Pruefung muss deshalb IN baue()
    stehen, nicht nur hier.
    """
    quelle = io.open(SKRIPT, encoding="utf-8").read()
    assert "die Fensteranteile summieren auf" in quelle, (
        "baue() prueft die Anteilssumme nicht selbst")
    i = quelle.index("die Fensteranteile summieren auf")
    j = quelle.index("def schreibe(")
    assert i < j, "die Selbstpruefung steht nach dem Schreiben"


def test_ein_deck_das_erst_heute_auftaucht_bekommt_keinen_bestand(welt):
    """Der Phantomblock, wenn der Schwellenwechsel AUF den Bautag faellt.

    Runde 2 reparierte den Fall, in dem ein Deck zwischen Basis und
    heute auftaucht. Der Fall "erst im heutigen Stand" blieb offen —
    und da gibt es keinen Zwischenstand, der den Block einordnen
    koennte. Nachgestellt mit dem echten 03.08.2026 stand Toucannon
    danach mit 590 Listen auf Fensterplatz 5 (5,68 %), aus dem Nichts,
    und kein Waechter sah es: die Datei war frisch, formatrein, die
    Anteilssumme stimmte, das 20-%-Tor hielt.

    Hier gilt das Argument aus dem anderen Zweig nicht: es gibt kein
    gemessenes Wachstum, das man verloere — nur eine einzige
    Beobachtung, die keinen 14 Tagen zuzuschreiben ist.
    """
    m, ordner = welt
    _stand(ordner, "2026-08-01", [("Alpha", 1000)])
    _stand(ordner, "2026-08-08", [("Alpha", 3000)])
    _stand(ordner, "2026-08-15", [("Alpha", 5000), ("Beta", 600)])   # Beta erst heute

    (zeilen, meta), fehler = m.baue(fenster_tage=14)
    assert fehler is None, fehler
    nach_name = {r["deck_name"]: r for r in zeilen}
    assert nach_name["Beta"]["count_fenster"] == 0, (
        "ein Deck, das erst im heutigen Stand auftaucht, hat seinen ganzen "
        "Bestand als Fensterzuwachs bekommen")
    assert nach_name["Alpha"]["count_fenster"] == 4000
    assert meta["decks_im_fenster"] == 4000
    summe = sum(r["share_fenster"] for r in zeilen)
    assert 99.0 <= summe <= 101.0


def test_ein_kleiner_neuzugang_am_bautag_zaehlt_normal(welt):
    """Die Gegenprobe: unter ERSTAUFTRITT_MAX ist es ein echtes Deck."""
    m, ordner = welt
    _stand(ordner, "2026-08-01", [("Alpha", 1000)])
    _stand(ordner, "2026-08-15", [("Alpha", 5000), ("Beta", 12)])
    (zeilen, _meta), fehler = m.baue(fenster_tage=14)
    assert fehler is None
    nach_name = {r["deck_name"]: r for r in zeilen}
    assert nach_name["Beta"]["count_fenster"] == 12


def test_ohne_format_window_faengt_die_basis_nach_dem_letzten_sturz_an(welt):
    """Der gemessene Sturz traegt auch allein.

    BEFUND (Runde 3): fehlt die Datei, greift nur noch das
    Sturzmerkmal — und "Gesamtstand <= heute" trifft im laufenden
    Format auch die ANFANGSSTAENDE des vorletzten Formats. Gemessen
    fuer den 03.08.2026: Basis 24.05., Spanne 71 Tage, quer ueber den
    Julisturz. Deshalb faengt die Ersatzsuche beim ersten Stand NACH
    dem letzten gemessenen Sturz an, nicht beim aeltesten tauglichen.
    """
    m, ordner = welt
    m.FORMATFENSTER = "/gibt/es/nicht.json"
    # Der Verlauf muss den Ersatzzweig WIRKLICH ausloesen: die
    # natuerliche 14-Tage-Basis (06-20, noch Vorformat) darf _taugt()
    # nicht bestehen, und danach muss es zwischen dem alten Anfang und
    # dem Sturz einen Stand geben, den "Gesamtstand <= heute" allein
    # durchliesse. Ohne den mittleren Stand (07-06) laeuft der Zweig gar
    # nicht an, und die Zusage prueft nur die 14-Tage-Basis — genau der
    # blinde Fleck, den die Gegenpruefung in Runde 4 gefunden hat.
    _stand(ordner, "2026-06-01", [("Alpha", 50)])       # Anfang Vorformat
    _stand(ordner, "2026-06-20", [("Alpha", 9000)])     # Vorformat gewachsen
    _stand(ordner, "2026-07-06", [("Alpha", 9500)])     # Vorformat, Summe > heute
    _stand(ordner, "2026-07-10", [("Alpha", 80)])       # STURZ
    _stand(ordner, "2026-07-20", [("Alpha", 400)])

    (zeilen, meta), fehler = m.baue(fenster_tage=14)
    assert fehler is None, fehler
    assert meta["fenster_von"] == "2026-07-10", (
        f"die Basis liegt vor dem letzten Zaehlersturz: {meta['fenster_von']} "
        f"— die Ersatzsuche faengt beim aeltesten tauglichen Stand an statt "
        f"nach dem Sturz")
    assert meta["fenster_tage"] == 10
    assert zeilen[0]["count_fenster"] == 320


def test_zu_viel_rekonstruktion_ergibt_kein_fenster(welt):
    """Die Divergenzschranke.

    Zeilensumme und rohe Differenz laufen auseinander, sobald geklemmt
    wird, Namen verschwinden oder Bloecke nicht zuordenbar sind. Das
    ist die Zahl, die sagt, wie weit die Datei rekonstruiert statt
    gemessen ist — groesste gemessene Divergenz ueber alle echten
    Bautage: 8,7 %. Ueber 15 % ist es keine Messung mehr.
    """
    m, ordner = welt
    _stand(ordner, "2026-08-01", [("Alpha", 1000), ("Weg", 5000)])
    _stand(ordner, "2026-08-15", [("Alpha", 9000)])   # "Weg" verschwindet ganz

    ergebnis, fehler = m.baue(fenster_tage=14)
    assert ergebnis is None
    assert fehler and "weichen um" in fehler


def test_die_meta_datei_fuehrt_beide_zahlen(welt):
    """Die rohe Differenz bleibt nachlesbar — sonst waere die
    Divergenz aus der Datei nicht mehr nachrechenbar."""
    m, ordner = welt
    _stand(ordner, "2026-08-01", [("Alpha", 100)])
    _stand(ordner, "2026-08-15", [("Alpha", 400)])
    (_z, meta), fehler = m.baue(fenster_tage=14)
    assert fehler is None
    for feld in ("decks_im_fenster", "decks_differenz_roh",
                 "nicht_im_fenster_entstanden"):
        assert feld in meta, f"{feld} fehlt in der Meta-Datei"


def test_das_gepflegte_datum_traegt_eine_rotation_ohne_zaehlersturz(welt, tmp_path):
    """Warum set_release_date NEBEN dem gemessenen Sturz stehen bleibt.

    `set_addition_only: true` in format_window.json sagt, dass es
    Rotationen gibt, bei denen nur Karten dazukommen — dort muss die
    Quelle ihren Zaehler nicht zuruecksetzen. Dann gibt es keinen
    Sturz, den man messen koennte, und das gepflegte Datum ist die
    einzige Wache.

    Ohne diese Zusage waere in der Suite nicht belegt, dass Merkmal (a)
    ueberhaupt noch etwas tut: in allen anderen Faellen faengt schon
    der gemessene Sturz den Fehler ab.
    """
    m, ordner = welt
    fw = tmp_path / "format_window.json"
    fw.write_text(json.dumps({"set_release_date": "2026-08-10"}), encoding="utf-8")
    m.FORMATFENSTER = str(fw)

    # Durchgehend steigend — kein Sturz, den man messen koennte.
    _stand(ordner, "2026-08-01", [("Alpha", 1000)])
    _stand(ordner, "2026-08-12", [("Alpha", 4000)])
    _stand(ordner, "2026-08-15", [("Alpha", 5000)])

    (zeilen, meta), fehler = m.baue(fenster_tage=14)
    assert fehler is None, fehler
    assert meta["fenster_von"] == "2026-08-12", (
        "die Basis liegt vor dem Formatstart, obwohl das gepflegte Datum "
        "es sagt — bei einer Rotation ohne Zaehlersturz ist es die einzige "
        "Wache")
    assert zeilen[0]["count_fenster"] == 1000
