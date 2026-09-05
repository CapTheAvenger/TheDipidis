#!/usr/bin/env python3
"""Aktuelles Zeitfenster aus den kumulativen Online-Anteilen rechnen.

WARUM ES DAS GIBT (05.09.2026)
------------------------------
`data/limitless_online_decks.csv` fuehrt Anteile, die seit Formatbeginn
KUMULIEREN. Der Scraper fragt play.limitlesstcg.com ohne jeden
Zeitparameter ab und bekommt zurueck, was die Quelle als Gesamtstand
fuehrt. Sichtbar wird das nur, wenn man die Tagesstaende vergleicht:

    Deck                   kumulativ   14 Tage   Rang kum. -> Fenster
    Toucannon                  2,55 %     0,82 %      11 -> 29
    Festival Lead              5,90 %     4,21 %       3 ->  8
    Alakazam Dudunsparce       5,79 %     7,59 %       4 ->  2
    Mega Excadrill             7,40 %     6,38 %       2 ->  4
    Dragapult Dusknoir         5,58 %     6,44 %       6 ->  3

(Kumulativ = new_share aus limitless_online_decks_comparison.csv, also
die Zahl, die die Seite zeigt. Diese Datei rechnet daneben eine eigene
Spalte share_kumulativ mit einem anderen Nenner — 38.398 statt 39.826,
weil Tagesstaende und Vergleichsdatei nicht dieselbe Menge zaehlen. Wer
die Zahlen oben nachschlaegt, muss die Vergleichsdatei nehmen.)

Das ist kein kleiner Versatz, sondern eine andere Rangfolge. Und kein
Waechter kann es sehen: die Datei waechst taeglich, ist nie leer und
nie widerspruechlich — sie beantwortet nur eine andere Frage als die,
die der Leser stellt ("was spielen die Leute GERADE").

Auf die gewichtete Win Rate wirkt sich das kaum aus (fuer Mega Excadrill
-0,56 Punkte, also 0,05 Siege ueber neun Runden). Es verschiebt aber,
WELCHE Decks man erwartet — und daran haengen Tech-Entscheidungen.
Alakazam Dudunsparce ist Mega Excadrills schlechtestes Matchup
(10,5 % Praesenz / 25,0 % online) und ist 1,6 Punkte groesser als
angezeigt; Festival Lead (75 % fuer Excadrill) ist 2 Punkte kleiner.
Beide Fehler zeigen in dieselbe Richtung: die Seite ist zu optimistisch.

WIE DAS FENSTER ENTSTEHT
------------------------
Nicht durch einen neuen Abruf — die Quelle bietet keinen Zeitparameter,
und ob sie einen versteckten kennt, laesst sich aus dem Sandkasten nicht
pruefen. Stattdessen aus dem, was ohnehin schon taeglich mitgeschrieben
wird: `data/online_share_history/YYYY-MM-DD.csv`, 66 Staende seit dem
29.04.2026.

    zaehler_fenster = count(heute) - count(vor N Tagen)

Das ist eine Differenz zweier gemessener Kumulativstaende, keine
Schaetzung. Fenstergroesse ist 14 Tage, entschieden vom Betreiber am
05.09.2026. Nachgemessen am selben Tag: sieben Tage fassen 4.243 Decks,
vierzehn fassen 10.042 — und die Anteile wandern dabei sichtbar (Mega
Excadrill 5,49 % gegen 6,38 %, Festival Lead 3,65 % gegen 4,21 %). Bei
4.243 Decks entspricht ein halber Prozentpunkt gut zwanzig Listen; kleine
Archetypen schwanken dort mit einzelnen Ladder-Wochenenden. 14 Tage sind
gegenueber "seit April" immer noch drastisch aktueller.

WAS DIESE DATEI NICHT KANN
--------------------------
* Sie kann nur so weit zurueck, wie Staende da sind. Fehlt ein Stand,
  wird der naechstaeltere genommen — und dabei kann die Spanne LAENGER
  als angefragt werden (bei Staenden an Tag 0 und Tag -40 sind es
  40 Tage). Ausgewiesen wird die tatsaechliche Spanne in
  meta.fenster_tage, und das Frontend verwirft ein Fenster ueber
  FENSTER_MAX_TAGE — sonst traegt die Umstellung ihre eigene
  Begruendung nicht mehr.
* Sie kennt keine Win Rate je Fenster. Die Quelle liefert die Win Rate
  nur kumulativ, und aus zwei Kumulativquoten laesst sich ohne die
  Bilanz keine Fensterquote rekonstruieren. Die Spalte fehlt deshalb,
  statt geraten zu werden.
* Ein Deck, das im Fenster nicht gespielt wurde, steht mit 0 da — nicht
  mit seinem alten Anteil.
"""

import argparse
import csv
import io
import json
import os
import sys
from datetime import datetime, timedelta

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, ".."))
VERLAUF = os.path.join(WURZEL, "data", "online_share_history")
FORMATFENSTER = os.path.join(WURZEL, "data", "format_window.json")
ZIEL = os.path.join(WURZEL, "data", "limitless_online_fenster.csv")

FENSTER_TAGE = 14
SPALTEN = [
    "deck_name", "rank_fenster", "count_fenster", "share_fenster",
    "count_kumulativ", "share_kumulativ", "rang_kumulativ", "rang_versatz",
    "share_vorfenster", "trend_fenster",
]


def _staende():
    """Alle Tagesstaende, nach Datum sortiert."""
    if not os.path.isdir(VERLAUF):
        return []
    out = []
    for name in sorted(os.listdir(VERLAUF)):
        if not name.endswith(".csv"):
            continue
        stamm = name[:-4]
        try:
            datetime.strptime(stamm, "%Y-%m-%d")
        except ValueError:
            continue
        out.append((stamm, os.path.join(VERLAUF, name)))
    return out


def _formatstart():
    """set_release_date aus data/format_window.json, oder None."""
    try:
        with io.open(FORMATFENSTER, encoding="utf-8") as f:
            d = json.load(f)
    except Exception:
        return None
    if not isinstance(d, dict):
        return None
    v = str(d.get("set_release_date") or "")
    try:
        datetime.strptime(v, "%Y-%m-%d")
    except ValueError:
        return None
    return v


def _lies(pfad):
    with io.open(pfad, encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f, delimiter=";"))
    if rows and "deck_name" not in rows[0]:
        with io.open(pfad, encoding="utf-8-sig") as f:
            rows = list(csv.DictReader(f))
    return {r["deck_name"]: r for r in rows if r.get("deck_name")}


def _zahl(v):
    try:
        return int(str(v).strip() or 0)
    except ValueError:
        return 0


def baue(fenster_tage=FENSTER_TAGE):
    staende = _staende()
    if len(staende) < 2:
        return None, f"nur {len(staende)} Tagesstand/-staende — ein Fenster braucht zwei"

    heute_stamm, heute_pfad = staende[-1]
    heute_dt = datetime.strptime(heute_stamm, "%Y-%m-%d")
    ziel_dt = heute_dt - timedelta(days=fenster_tage)

    # Den Stand nehmen, der dem Zielpunkt am naechsten liegt und NICHT
    # juenger ist — ein juengerer wuerde das Fenster verkuerzen und die
    # Anteile verzerren.
    kandidaten = [(s, p) for s, p in staende[:-1]
                  if datetime.strptime(s, "%Y-%m-%d") <= ziel_dt]
    if kandidaten:
        basis_stamm, basis_pfad = kandidaten[-1]
    else:
        basis_stamm, basis_pfad = staende[0]

    # ── Die Basis darf nie vor dem Formatstart liegen ─────────────
    #
    # BEFUND DER GEGENPRUEFUNG (05.09.2026): der Zaehler der Quelle
    # wird bei jeder Rotation auf null gesetzt. In den 66 Staenden
    # steht das zweimal:
    #
    #   23.05. Summe 31.889  ->  24.05. Summe 1.508
    #   17.07. Summe 30.762  ->  21.07. Summe 2.299   (= set_release_date)
    #
    # Ein Fenster ueber so einen Sturz ist keine Differenz, sondern
    # Unsinn. `neu_gesamt <= 0` faengt es zwar ab — aber dann wird gar
    # nichts geschrieben, die ALTE Datei bleibt liegen, und das
    # Frontend liefert bis zu zwoelf Tage lang ein Fenster aus dem
    # abgelaufenen Format aus, mit einem Etikett, das Frische
    # behauptet. Genau der Fehler, gegen den diese Datei antritt.
    #
    # Also: nach einer Rotation wird die Basis auf den ersten Stand ab
    # dem Formatstart gezogen. Das Fenster ist dann kuerzer als
    # angefragt — und sagt das in meta.fenster_tage. Dieselbe Regel
    # fahren schon _effectiveDateCutoff() (Predictor 5.5) und der
    # Datumsfilter im Frontend.
    #
    # Zwei Merkmale schliessen einen Stand als Basis aus, und zwar
    # unabhaengig voneinander:
    #
    #  (a) Er liegt vor `set_release_date` aus format_window.json.
    #      Das ist die gepflegte Angabe, dieselbe, an der sich schon
    #      _effectiveDateCutoff() (Predictor 5.5) festhaelt.
    #  (b) Sein Gesamtstand ist GROESSER als der von heute. Das ist der
    #      Fingerabdruck des Zaehlersturzes selbst und braucht keine
    #      gepflegte Angabe — der Stand vom 17.07. traegt zum Beispiel
    #      noch 30.762, obwohl er auf `set_release_date` faellt, weil
    #      die Quelle erst am 21.07. zurueckgesetzt hat.
    #
    # (a) allein haette also nicht gereicht. Beide zusammen ziehen die
    # Basis auf den ersten Stand, der wirklich zum laufenden Format
    # gehoert; das Fenster ist dann kuerzer als angefragt und sagt das
    # in meta.fenster_tage.
    formatstart = _formatstart()
    ges_heute_roh = sum(_zahl(v.get("count")) for v in _lies(heute_pfad).values())

    def _taugt(st, pf):
        if formatstart and st < formatstart:
            return False
        return sum(_zahl(v.get("count")) for v in _lies(pf).values()) <= ges_heute_roh

    if not formatstart:
        print("::warning::data/format_window.json liefert kein brauchbares "
              "set_release_date — der Rotationsschutz stuetzt sich allein auf "
              "den gemessenen Zaehlersturz.")

    if not _taugt(basis_stamm, basis_pfad):
        # Der ERSTE taugliche Stand NACH dem letzten Zaehlersturz, nicht
        # der aelteste taugliche ueberhaupt.
        #
        # BEFUND (Runde 3): fehlt format_window.json oder traegt es ein
        # kaputtes Datum, greift nur noch das Sturzmerkmal — und
        # "Gesamtstand <= heute" trifft im laufenden Format auch die
        # Anfangsstaende des VORLETZTEN Formats. Gemessen fuer den
        # 03.08.2026: Basis 24.05., Spanne 71 Tage, quer ueber den
        # Julisturz. Das Frontend haette es zwar verworfen (71 >
        # FENSTER_MAX_TAGE), aber die schlechte Datei ueberschreibt die
        # gute, und das Feature faellt ganz aus statt auf den letzten
        # guten Stand zurueckzufallen.
        #
        # Der letzte Sturz laesst sich messen und braucht keine
        # gepflegte Angabe: ein Stand, dessen Gesamtsumme kleiner ist
        # als die seines Vorgaengers, IST der Sturz.
        summen = [(st, pf, sum(_zahl(v.get("count")) for v in _lies(pf).values()))
                  for st, pf in staende]
        letzter_sturz = 0
        for i in range(1, len(summen)):
            if summen[i][2] < summen[i - 1][2]:
                letzter_sturz = i
        ab = [(st, pf) for st, pf, _g in summen[letzter_sturz:-1] if _taugt(st, pf)]
        if not ab:
            return None, (f"kein Tagesstand aus dem laufenden Format taugt als "
                          f"Basis (Formatstart {formatstart}) — kein Fenster daraus")
        print(f"::warning::Basis {basis_stamm} gehoert nicht zum laufenden "
              f"Format (Formatstart {formatstart}, Zaehlersturz bei der "
              f"Rotation); das Fenster beginnt stattdessen bei {ab[0][0]} und "
              f"ist entsprechend kuerzer.")
        basis_stamm, basis_pfad = ab[0]

    basis_dt = datetime.strptime(basis_stamm, "%Y-%m-%d")
    spanne = (heute_dt - basis_dt).days
    if spanne <= 0:
        return None, "Basis und aktueller Stand sind derselbe Tag"

    heute, basis = _lies(heute_pfad), _lies(basis_pfad)
    if not heute:
        return None, f"{heute_stamm}.csv ist leer"

    # ── Das Fenster DAVOR, fuer den Trend ──────────────────────────
    #
    # BEFUND (05.09.2026, beim Ansehen der ausgelieferten Seite): neben
    # "Online-Anteil (14 Tage) 6,4 %" stand "Trend (7 Tage) -0,0 %".
    # Der Trend kam aus share_change der Vergleichsdatei — der
    # Wochenbewegung des KUMULATIVSTANDS. Der ist um Groessenordnungen
    # traeger als das Fenster: fuer Mega Excadrill -0,03 Punkte gegen
    # -1,39 im Fenster, im Mittel Faktor 23. Der Leser sah eine
    # 14-Tage-Zahl und daneben eine Bewegung, die eine andere Uhr las.
    #
    # Der ehrliche Trend ist die Differenz zweier gleich langer,
    # gleich gerechneter Fenster: das aktuelle gegen das unmittelbar
    # davor. Beide aus gemessenen Tagesstaenden, beide mit ihrem
    # eigenen Nenner — also wieder eine Subtraktion und keine
    # Schaetzung.
    #
    # Fehlt der Stand von vor zwei Fensterlaengen (frisches Format,
    # Luecke im Verlauf), bleibt der Trend LEER statt null. Null hiesse
    # "keine Bewegung"; leer heisst "nicht messbar", und das ist der
    # Unterschied, um den es hier geht.
    vor_dt = basis_dt - timedelta(days=spanne)
    vor_kand = [(st, pf) for st, pf in staende
                if datetime.strptime(st, "%Y-%m-%d") <= vor_dt and _taugt(st, pf)]
    vorher = _lies(vor_kand[-1][1]) if vor_kand else None
    vor_stamm = vor_kand[-1][0] if vor_kand else None

    ges_heute = sum(_zahl(v.get("count")) for v in heute.values())
    ges_basis = sum(_zahl(v.get("count")) for v in basis.values())
    neu_gesamt = ges_heute - ges_basis
    roh_differenz = neu_gesamt
    if neu_gesamt <= 0:
        return None, (f"zwischen {basis_stamm} und {heute_stamm} sind "
                      f"{neu_gesamt} Decks dazugekommen — kein Fenster daraus")

    kum_rang = {}
    for i, (name, _c) in enumerate(sorted(
            ((n, _zahl(v.get("count"))) for n, v in heute.items()),
            key=lambda x: -x[1]), start=1):
        kum_rang[name] = i

    # ── Namen, die im Basisstand fehlen ───────────────────────────
    #
    # BEFUND DER GEGENPRUEFUNG (05.09.2026): `neu = kum - alt` mit
    # alt = 0 gibt einem Deck seinen KOMPLETTEN Kumulativstand als
    # Fensterzuwachs. Das ist kein Randfall — ueber die 66 Staende
    # finden sich 31 Namenswechsel mit count >= 20:
    #
    #   19.05. -> 22.05.  "Mega Zygarde ex" (43) weg, "Mega Zygarde" (44) neu
    #   31.07. -> 03.08.  "Toucannon" erscheint mit 590 auf einen Schlag
    #
    # Toucannon waere mit 590 von ~10.000 als 5,9 %-Deck ins Fenster
    # gegangen, Platz 7, zwei Wochen lang — aus dem Nichts. Und in der
    # ersten ausgelieferten Fassung stand "Alakazam Dusknoir" bereits
    # mit seinem vollen Kumulativstand drin.
    #
    # Unterschieden wird nicht geraten, sondern GEMESSEN: fuer jedes
    # Deck ohne Basiszeile wird der erste Stand IM FENSTER gesucht, in
    # dem es auftaucht. Steht es dort schon mit einem grossen Zaehler,
    # ist es keine Neuentdeckung, sondern eine Umbenennung oder ein
    # Schwellenwechsel bei der Quelle — dann zaehlt es 0 und meldet
    # sich. Faengt es klein an, ist es wirklich neu und der Zuwachs
    # wird ab seinem ersten Stand gerechnet.
    #
    # Das ist die Hausregel "melden, nicht still reparieren": kein
    # geschaetzter Zaehler, sondern eine 0 mit Begruendung.
    ERSTAUFTRITT_MAX = 50

    fenster_staende = [(st, pf) for st, pf in staende
                       if basis_stamm < st < heute_stamm]
    erster_stand = {}          # Deckname -> (Stand, Zaehler) beim ersten Auftritt
    for st, pf in fenster_staende:
        for n, r in _lies(pf).items():
            if n in basis or n in erster_stand:
                continue
            erster_stand[n] = (st, _zahl(r.get("count")))

    verdacht = []
    nicht_im_fenster = 0     # Zaehler, die schon vor dem Fenster standen

    zeilen = []
    for name, v in heute.items():
        kum = _zahl(v.get("count"))
        fehlt_in_basis = name not in basis
        alt = _zahl((basis.get(name) or {}).get("count"))
        if fehlt_in_basis:
            st_zahl = erster_stand.get(name)
            if st_zahl is None:
                # Erst im HEUTIGEN Stand aufgetaucht — es gibt keinen
                # Zwischenstand, der den Block einordnen koennte.
                #
                # Hier gilt das Argument aus dem else-Zweig NICHT.
                # Dort gibt es gemessenes Wachstum nach dem Auftritt,
                # das man verloere; hier gibt es genau eine Beobachtung
                # und kein Wachstum. `alt = kum` wirft also nichts
                # Gemessenes weg, sondern verweigert nur, einen nicht
                # zuordenbaren Block 14 Tagen zuzuschreiben.
                #
                # Ohne diese zwei Zeilen stand Toucannon am 03.08.2026
                # mit 590 Listen auf Fensterplatz 5 (5,68 %) — aus dem
                # Nichts, und KEIN Waechter sah es: die Datei war frisch,
                # formatrein, die Anteilssumme stimmte, das 20-%-Tor
                # hielt. Schlimmer noch, die Meldung unten behauptete
                # die Reparatur, die nicht stattfand.
                if kum > ERSTAUFTRITT_MAX:
                    verdacht.append((name, kum, heute_stamm, kum))
                    alt = kum
            else:
                # EINE Regel fuer beide Faelle: ab dem ersten eigenen
                # Stand rechnen. Der Block, mit dem das Deck auftauchte,
                # faellt heraus (er ist nicht im Fenster entstanden),
                # das gemessene Wachstum danach bleibt.
                #
                # Die erste Fassung warf bei grossen Erstauftritten den
                # GANZEN Zuwachs weg. Das kostete am 11.08.2026
                # 209 echte Toucannon-Listen, 83 Mega-Chandelure-Listen
                # und 29 Mega-Darkrai-Listen, und die Anteilssumme fiel
                # auf 90,4 % — an sieben von 47 Bautagen fehlten 5 bis
                # 10 Punkte, waehrend die Kopfzeile weiter die volle
                # Deckzahl behauptete. Ausserdem hing an der Schwelle
                # eine Klippe: eine Liste Unterschied entschied ueber
                # 200 Fensterlisten.
                #
                # ERSTAUFTRITT_MAX entscheidet jetzt nur noch, ob sich
                # der Fall MELDET — nicht mehr, wie gerechnet wird.
                if st_zahl[1] > ERSTAUFTRITT_MAX:
                    verdacht.append((name, kum, st_zahl[0], st_zahl[1]))
                alt = st_zahl[1]
                # Der herausgefallene Block gehoert auch nicht in den
                # Nenner — sonst summieren sich die Anteile auf unter
                # 100 % und die Kachel zeigt jedes Deck zu klein.
                nicht_im_fenster += st_zahl[1]   # nur als Kennzahl fuer meta
        neu = kum - alt
        if neu < 0:            # Quelle hat umgruppiert — nicht raten
            neu = 0
        zeilen.append({
            "deck_name": name,
            "count_fenster": neu,
            "count_kumulativ": kum,
            "share_kumulativ": round(kum / ges_heute * 100, 2) if ges_heute else 0.0,
            "rang_kumulativ": kum_rang.get(name, 0),
        })

    # ── Der Nenner ist die Summe der Zeilen, nicht die Differenz ──
    #
    # `neu_gesamt` war bisher ges_heute - ges_basis. Das ist NICHT
    # dasselbe wie die Summe der Fensterzuwaechse, und zwar aus drei
    # Gruenden, die alle vorkommen:
    #
    #   * geklemmte negative Zuwaechse zaehlen im Zaehler 0, in der
    #     Differenz aber negativ (am 11.08.2026: 104 Listen),
    #   * Namen, die aus der Quelle verschwinden, stecken in ges_basis
    #     und in keiner Zeile,
    #   * Bloecke, mit denen umbenannte Decks auftauchen, stecken in
    #     ges_heute und gehoeren keinem Fenstertag.
    #
    # Am 11.08.2026 standen so 11.704 (Differenz) gegen 11.810 (Summe
    # der Zeilen) — die Anteile summierten auf 101,1 %. Der Nenner ist
    # deshalb ab jetzt die Summe dessen, was in der Tabelle steht.
    # Damit stimmt die Kopfzeile mit der Spalte darunter ueberein, und
    # jede Quote traegt einen Nenner, den der Leser nachaddieren kann.
    zeilen_summe = sum(r["count_fenster"] for r in zeilen)
    if zeilen_summe <= 0:
        return None, (f"zwischen {basis_stamm} und {heute_stamm} hat kein "
                      f"einziges Deck zugelegt — kein Fenster daraus")
    neu_gesamt = zeilen_summe
    for r in zeilen:
        r["share_fenster"] = round(r["count_fenster"] / neu_gesamt * 100, 2)

    # ── Selbstpruefung vor dem Schreiben ──────────────────────────
    #
    # Der Wochenlauf fuehrt keine Testsuite; eine Zusicherung in
    # tests/ sieht die frisch gebaute Datei nie. Also prueft sie sich
    # hier selbst — und eine Datei mit falschem Nenner ist schlimmer
    # als keine, weil das Frontend `share_fenster` ROH in die Kachel
    # und in presenceCap schreibt.
    #
    # (1) Die Anteilssumme. Seit der Nenner die Zeilensumme IST, kann
    #     sie konstruktionsbedingt kaum abweichen (groesste gemessene
    #     Abweichung ueber alle Bautage: 0,14 Punkte). Die Schranke
    #     bleibt trotzdem stehen — sie kostet nichts und faengt eine
    #     kuenftige Aenderung am Nenner sofort.
    summe = sum(r["share_fenster"] for r in zeilen)
    if not (99.0 <= summe <= 101.0):
        return None, (f"die Fensteranteile summieren auf {summe:.2f} % statt "
                      f"auf 100 — der Nenner ({neu_gesamt}) passt nicht zu den "
                      f"gezaehlten Zuwaechsen")

    # (2) Die Divergenz zwischen Zeilensumme und roher Differenz. DAS
    #     ist die Zahl, die wirklich etwas sagt: sie misst, wie viel
    #     des Fensters aus geklemmten Zuwaechsen, verschwundenen Namen
    #     und nicht zuordenbaren Bloecken besteht — also wie weit die
    #     Datei rekonstruiert statt gemessen ist. Groesste gemessene
    #     Divergenz ueber alle Bautage: 8,7 % am 04.08.2026 (898 von
    #     10.274 Listen). Ueber 15 % ist das Fenster keine Messung mehr.
    divergenz = abs(neu_gesamt - roh_differenz) / max(1, neu_gesamt)
    if divergenz > 0.15:
        return None, (f"Zeilensumme ({neu_gesamt}) und rohe Differenz "
                      f"({roh_differenz}) weichen um {divergenz * 100:.1f} % "
                      f"voneinander ab — zu viel des Fensters ist geklemmt, "
                      f"verschwunden oder nicht zuordenbar, um daraus eine "
                      f"Messung zu machen")

    for name, kum, st, zahl in verdacht:
        print(f"::warning::{name} fehlt im Basisstand {basis_stamm} und steht "
              f"am {st} sofort mit {zahl} Listen da (kumulativ {kum}). Das ist "
              f"eine Umbenennung oder ein Schwellenwechsel der Quelle. "
              f"Dieser Block zaehlt nicht als Fensterzuwachs; was das Deck "
              f"danach gespielt hat, zaehlt weiter.")
    # Eine eigene Schranke auf die Verdachtssumme stand hier bis zum
    # 05.09.2026 und ist entfallen: sie mass dasselbe wie die
    # Divergenzschranke weiter oben, nur ungenauer. Die Bloecke
    # umbenannter Decks sind GENAU der Anteil, um den Zeilensumme und
    # rohe Differenz auseinanderlaufen — zwei Tore fuer dieselbe Groesse
    # haetten sich nur gegenseitig verdeckt.

    # ── Trend: dieses Fenster gegen das davor ─────────────────────
    if vorher is not None:
        vor_neu = {}
        for name, v in basis.items():
            alt = _zahl((vorher.get(name) or {}).get("count"))
            vor_neu[name] = max(0, _zahl(v.get("count")) - alt)
        vor_gesamt = sum(vor_neu.values())
        if vor_gesamt > 0:
            for r in zeilen:
                vor_anteil = vor_neu.get(r["deck_name"], 0) / vor_gesamt * 100
                r["share_vorfenster"] = round(vor_anteil, 2)
                r["trend_fenster"] = round(r["share_fenster"] - vor_anteil, 2)

    zeilen.sort(key=lambda r: (-r["count_fenster"], r["deck_name"]))
    for i, r in enumerate(zeilen, start=1):
        r["rank_fenster"] = i
        r["rang_versatz"] = r["rang_kumulativ"] - i

    meta = {
        "fenster_von": basis_stamm,
        "fenster_bis": heute_stamm,
        "fenster_tage": spanne,
        "decks_im_fenster": neu_gesamt,
        "decks_differenz_roh": roh_differenz,
        "vorfenster_von": vor_stamm,
        "nicht_im_fenster_entstanden": nicht_im_fenster,
        "decks_kumulativ": ges_heute,
        "staende_vorhanden": len(staende),
    }
    return (zeilen, meta), None


def schreibe(zeilen, meta):
    with io.open(ZIEL, "w", encoding="utf-8-sig", newline="") as f:
        f.write(
            f"# Fenster {meta['fenster_von']} bis {meta['fenster_bis']} "
            f"({meta['fenster_tage']} Tage) · {meta['decks_im_fenster']} Decks "
            f"im Fenster · {meta['decks_kumulativ']} kumulativ seit Formatbeginn. "
            f"count_fenster ist die Differenz zweier gemessener Kumulativstaende, "
            f"keine Schaetzung. Erzeugt von scripts/build_online_fenster.py\n")
        w = csv.DictWriter(f, fieldnames=SPALTEN, delimiter=";",
                           extrasaction="ignore")
        w.writeheader()
        for r in zeilen:
            r = dict(r)
            for k in ("share_fenster", "share_kumulativ",
                      "share_vorfenster", "trend_fenster"):
                if r.get(k) is None or r.get(k) == "":
                    r[k] = ""      # nicht messbar — und das steht auch so da
                else:
                    r[k] = str(r[k]).replace(".", ",")
            w.writerow(r)
    with io.open(ZIEL.replace(".csv", "_meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--tage", type=int, default=FENSTER_TAGE)
    ap.add_argument("--apply", action="store_true", help="Datei schreiben")
    a = ap.parse_args(argv)

    ergebnis, fehler = baue(a.tage)
    if fehler:
        print(f"::warning::Online-Fenster nicht gebaut: {fehler}")
        return 0                      # nicht blockierend — die Kumulativdatei bleibt
    zeilen, meta = ergebnis
    print(f"Fenster {meta['fenster_von']} .. {meta['fenster_bis']} "
          f"({meta['fenster_tage']} Tage), {meta['decks_im_fenster']} Decks")
    print(f"{'Deck':28} {'Fenster':>9} {'kumulativ':>10} {'Rangversatz':>12}")
    for r in zeilen[:10]:
        v = r["rang_versatz"]
        print(f"{r['deck_name'][:28]:28} {r['share_fenster']:>8.2f}% "
              f"{r['share_kumulativ']:>9.2f}% {v:>+12}")
    if a.apply:
        schreibe(zeilen, meta)
        print(f"\ngeschrieben: {os.path.relpath(ZIEL, WURZEL)} ({len(zeilen)} Zeilen)")
    else:
        print("\n(Bericht — mit --apply schreiben)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
