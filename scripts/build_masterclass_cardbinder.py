#!/usr/bin/env python3
"""Baut je gekaufter Masterclass eine Kartenmappe: data/masterclass_cardbinder/<id>.json

ANLASS (Betreiber, 24.09.2026):

    „Dann nehme ich noch einen Reiter, Cardbinder, wo ich sehe, aus
     allen, seitdem es den Archetype gibt, alle Karten, die jemals fuer
     diesen Archetype benutzt worden sind, egal ob City League, Past
     Meta, Current Meta … dass ich den Masterclass-Bereich einfach nicht
     verlassen moechte. … Wenn ich hier schon Geld investiere, um mir
     eine Masterclass zu kaufen, dann moechte ich auch mit den
     Informationen, die wir selber zu dem Deck haben, die Masterclass
     erweitern."

Und zur Zuordnung, auf Nachfrage entschieden: **nach Kopf-Pokemon**.

WAS HIER ZUSAMMENKOMMT
----------------------
Vier Kartenquellen, ein Turnierbestand, ein Matchup-Bestand, ein
Preisbestand. Alle liegen schon im Haus; neu ist nur, dass sie je
Archetyp an EINER Stelle stehen.

    data/online_api_cards_<META>.csv          Online-Turniere, je Turnier
    data/tournament_cards_data_cards_<META>.csv   Majors, je Turnier
    data/online_tournament_dated_cards.csv    Online-Turniere, datiert
    data/city_league_analysis*.csv            japanische City League
    data/labs_tournament_decks_<META>.csv     Turnierergebnisse des Decks
    data/labs_tournament_matchups_<META>.csv  Matchups aus echten Majors
    data/price_data.csv                       Preis je (set, number)

WAS DIESES SKRIPT NICHT TUT
---------------------------
Es rechnet nichts hoch und erfindet keine Zeile. Eine Karte steht in der
Mappe, weil eine Quelle sie fuehrt — mit dem Namen der Quelle daneben.
Fehlt ein Preis, steht kein Preis da; fehlt ein Bild, steht kein Bild da.

DOPPELZAEHLUNG
--------------
Die Quellen ueberschneiden sich: gemessen am 25.09.2026 fuehren
online_api_cards_TEF-PBL und online_tournament_dated_cards drei Turniere
gemeinsam (218 bzw. 15 Turniere fuer Mega-Stalobor). Deshalb wird je
Turnierkennung nur EINE Quelle gezaehlt, nach fester Rangfolge — und die
uebersprungenen Turniere stehen im Kopf der Datei.
"""

import csv
import datetime as dt
import glob
import json
import os
import sys

csv.field_size_limit(min(sys.maxsize, 2**31 - 1))

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.dirname(HIER)

# Die Gruppenregel (Pokemon/Supporter/Item/Tool/Stadion/Spezial-/
# Basis-Energie) liegt neben diesem Skript; das Formatfenster und die
# ACE-SPEC-Liste liegen im Bestand. Alle drei werden GEHOLT und nicht
# hier ein zweites Mal ausgeschrieben.
sys.path.insert(0, HIER)
sys.path.insert(0, os.path.join(WURZEL, "backend", "scrapers"))
sys.path.insert(0, os.path.join(WURZEL, "backend", "core"))
import kartengruppe  # noqa: E402
from limitless_api_scraper import formatschluessel  # noqa: E402
from ace_spec_regel import lade_ace_liste  # noqa: E402
DATA = os.path.join(WURZEL, "data")
REGISTER = os.path.join(WURZEL, "config", "masterclass_cardbinder.json")
AUSGABE_DIR = os.path.join(DATA, "masterclass_cardbinder")

# Rangfolge bei doppelten Turnierkennungen: wer zuerst steht, zaehlt.
# online_api ist am feinsten (je Turnier, je Karte, mit Quote), die
# Major-Datei fuehrt Turniere, die sonst nirgends stehen.
RANG = ["online_api", "majors", "online_datiert", "city_league"]


# Preise stehen in data/price_data.csv als "0,04\u20ac" — Komma als
# Dezimaltrennzeichen UND Waehrungszeichen. Ein blankes float() darauf
# gibt ValueError, und der erste Durchlauf am 25.09.2026 lieferte
# deshalb 228 Karten OHNE einen einzigen Preis, ohne dass etwas rot
# wurde. Deswegen wird hier alles entfernt, was keine Zahl ist.
_ZIFFERN = set("0123456789.-")


def _zahl(x, standard=0.0):
    if x is None:
        return standard
    s = str(x).strip().replace(",", ".")
    if not s:
        return standard
    try:
        return float(s)
    except ValueError:
        pass
    s = "".join(c for c in s if c in _ZIFFERN)
    try:
        return float(s)
    except ValueError:
        return standard


def _ganz(x, standard=0):
    return int(round(_zahl(x, standard)))


_MONATE = {m: i + 1 for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july",
     "august", "september", "october", "november", "december"])}


def _datum(text):
    """ISO zurueck, oder None. Kein Ratewerk.

    Die Quellen schreiben Daten in zwei Formen — "2026-09-18" und
    "19th September 2026". Ein String-Vergleich ueber beide liefert
    Unsinn: der erste Durchlauf am 25.09.2026 meldete fuer TEF-PBL
    "von 19th September 2026 bis 28th August 2026".
    """
    t = (text or "").strip()
    if not t:
        return None
    if len(t) >= 10 and t[4] == "-" and t[7] == "-":
        return t[:10]
    import re as _re
    m = _re.match(r"^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})$", t)
    if m and m.group(2).lower() in _MONATE:
        return "%s-%02d-%02d" % (m.group(3), _MONATE[m.group(2).lower()],
                                 int(m.group(1)))
    return None


def lies_csv(pfad, trenner=";"):
    if not os.path.exists(pfad):
        return
    with open(pfad, newline="", encoding="utf-8-sig") as fh:
        for zeile in csv.DictReader(fh, delimiter=trenner):
            yield zeile


# ── WELCHE ARCHETYPEN ZUM KOPF-POKEMON GEHOEREN ───────────────────────

def archetypen_zum_kopf(kopf):
    """Namen und Slugs aller Archetypen, deren LEITKARTE `kopf` ist.

    data/archetype_icons.json fuehrt je Archetyp die Pokemon-Slugs in
    Anzeigereihenfolge; der erste ist die Leitkarte. Das ist dieselbe
    Reihenfolge, die die Oberflaeche zeichnet — es wird also nichts
    eigens festgelegt, was anderswo schon entschieden ist.
    """
    namen = set()
    pfad = os.path.join(DATA, "archetype_icons.json")
    if os.path.exists(pfad):
        with open(pfad, encoding="utf-8") as fh:
            tabelle = (json.load(fh) or {}).get("archetypes") or {}
        for name, slugs in tabelle.items():
            if slugs and str(slugs[0]).strip().lower() == kopf:
                namen.add(name)

    # Die Online-API fuehrt Archetypen unter einer eigenen Kennung
    # (mega-excadrill-ex). Sie wird ueber den ANZEIGENAMEN angebunden,
    # nicht ueber eine zweite Namensliste.
    slugs = set()
    for zeile in lies_csv(os.path.join(DATA, "online_api_archetypes.csv")):
        if (zeile.get("archetype_name") or "").strip() in namen:
            kennung = (zeile.get("archetype_id") or "").strip()
            if kennung:
                slugs.add(kennung)
    for zeile in lies_csv(os.path.join(DATA, "labs_tournament_decks.csv"), ","):
        if (zeile.get("pokemon") or "").split(",")[0].strip().lower() == kopf:
            if zeile.get("deck_name"):
                namen.add(zeile["deck_name"].strip())
            if zeile.get("deck_slug"):
                slugs.add(zeile["deck_slug"].strip())
    return namen, slugs


# ── DIE KARTENQUELLEN ─────────────────────────────────────────────────
#
# Jede Quelle liefert dieselbe Form:
#   (quelle, meta, turnier, datum, set, nummer, name, gruppe,
#    listen_mit_karte, listen_gesamt, schnitt, hoechstzahl)

def q_online_api(namen, slugs):
    for pfad in sorted(glob.glob(os.path.join(DATA, "online_api_cards_*.csv"))):
        for z in lies_csv(pfad):
            if (z.get("archetype_id") or "").strip() not in slugs:
                continue
            yield ("online_api", (z.get("meta") or "").strip(),
                   (z.get("tournament_id") or "").strip(),
                   (z.get("date") or "").strip(),
                   (z.get("set") or "").strip(), (z.get("number") or "").strip(),
                   (z.get("card") or "").strip(), (z.get("group") or "").strip(),
                   _ganz(z.get("lists_with_card")), _ganz(z.get("lists_total")),
                   _zahl(z.get("avg_count")), 0)


def q_majors(namen, slugs):
    for pfad in sorted(glob.glob(os.path.join(DATA, "tournament_cards_data_cards_*.csv"))):
        for z in lies_csv(pfad):
            if (z.get("archetype") or "").strip() not in namen:
                continue
            yield ("majors", (z.get("meta") or "").strip(),
                   (z.get("tournament_id") or "").strip(),
                   (z.get("tournament_date") or "").strip(),
                   (z.get("set_code") or "").strip(), (z.get("set_number") or "").strip(),
                   (z.get("card_name") or "").strip(), (z.get("type") or "").strip(),
                   _ganz(z.get("deck_inclusion_count")),
                   _ganz(z.get("total_decks_in_archetype")),
                   _zahl(z.get("average_count")), _ganz(z.get("max_count")))


def q_online_datiert(namen, slugs):
    for z in lies_csv(os.path.join(DATA, "online_tournament_dated_cards.csv")):
        if (z.get("archetype") or "").strip() not in namen:
            continue
        yield ("online_datiert", (z.get("meta") or "").strip(),
               (z.get("tournament_id") or "").strip(),
               (z.get("tournament_date") or "").strip(),
               (z.get("set_code") or "").strip(), (z.get("set_number") or "").strip(),
               (z.get("card_name") or "").strip(), (z.get("type") or "").strip(),
               _ganz(z.get("deck_inclusion_count")),
               _ganz(z.get("total_decks_in_archetype")),
               _zahl(z.get("average_count")), _ganz(z.get("max_count")))


def q_city_league(namen, slugs):
    for pfad in sorted(glob.glob(os.path.join(DATA, "city_league_analysis*.csv"))):
        if pfad.endswith("_scraped.json"):
            continue
        for z in lies_csv(pfad):
            if (z.get("archetype") or "").strip() not in namen:
                continue
            yield ("city_league", (z.get("meta") or "City League").strip(),
                   (z.get("tournament_id") or "").strip(),
                   (z.get("tournament_date") or z.get("date") or "").strip(),
                   (z.get("set_code") or "").strip(), (z.get("set_number") or "").strip(),
                   (z.get("card_name") or "").strip(), (z.get("type") or "").strip(),
                   _ganz(z.get("deck_inclusion_count")),
                   _ganz(z.get("total_decks_in_archetype")),
                   _zahl(z.get("average_count")), _ganz(z.get("max_count")))


QUELLEN = {
    "online_api": q_online_api,
    "majors": q_majors,
    "online_datiert": q_online_datiert,
    "city_league": q_city_league,
}


# ── WELCHES FORMAT WURDE GESPIELT ─────────────────────────────────────
#
# BEFUND (Betreiber, 25.09.2026, mit Bildschirmfoto): „was genau ist
# denn Online ohne Meta, das kann ja nicht sein."
#
# Er hat recht. data/online_tournament_dated_cards.csv traegt in ALLEN
# 24.555 Zeilen die Meta-Angabe „Online Dated" (backend/core/
# limitless_dated.py, DATED_META_LABEL) — das ist kein Format, sondern
# der Name der Datei. Ein Chip „Online, ohne Meta-Angabe 2" sagt dem
# Leser nichts, und die zwei Turniere dahinter haben selbstverstaendlich
# ein Format gespielt.
#
# ZWEI WEGE, IN DIESER REIHENFOLGE
# --------------------------------
# 1. DER INDEX. Mehrere Quellen fuehren je Turnier die Meta selbst:
#    data/online_api_tournaments.csv (452 Turniere, gemessen
#    25.09.2026), die Kartendateien der Online-API und die der Majors.
#    Steht ein Turnier dort, wird seine Meta uebernommen — gemessen,
#    nicht gerechnet.
#
# 2. DAS FORMATFENSTER. Online wechselt das Format am SET-RELEASE;
#    genau das rechnet formatschluessel() in backend/scrapers/
#    limitless_api_scraper.py aus data/format_window.json und
#    data/sets_metadata.json — dieselbe Funktion, die jedem
#    API-Turnier seine Meta gibt.
#
# WIE GUT DER ZWEITE WEG IST, NACHGEMESSEN
# ----------------------------------------
# Gegenprobe am 25.09.2026 ueber alle 452 Turniere, die ihre Meta
# selbst fuehren: 445 Mal sagt formatschluessel(Datum) dasselbe, 7 Mal
# nicht. Alle sieben liegen am 16./17.09.2026 — dem Release von 30C.
# Am Umschalttag laufen beide Formate nebeneinander.
#
# Deshalb: der Index gewinnt, wo es ihn gibt; das Fenster fuellt die
# Luecke und wird ALS ABGELEITET AUSGEWIESEN (`abgeleitet` je Turnier,
# `turniere_abgeleitet` je Meta, plus ein Hinweis am Chip). Eine
# abgeleitete Zahl, die sich als gemessen ausgibt, waere schlimmer als
# der namenlose Topf von vorher.

META_UNBEKANNT = "Online Dated"     # = limitless_dated.DATED_META_LABEL

# Die Kartenauswertung der City League stempelt JEDER Zeile
# `meta = "City League"` auf (backend/scrapers/city_league_analysis_
# scraper.py). Welche Turnierklasse wirklich gespielt wurde, steht dort
# nicht — wohl aber in der Archetypdatei desselben Fensters, Spalte
# `format`.
#
# BEFUND (Betreiber, 25.09.2026): der Chip hiess „City League (Japan) 2",
# dahinter stand die Champions League Yokohama mit 10.000 Spielern. Eine
# City League hat 4 bis 16. Genau davor warnt js/app-city-league.js im
# Herkunftssatz schon: „Ein Platz 8 heisst in beiden Faellen etwas
# voellig anderes."
META_CITY_LEAGUE = "City League"


def meta_index():
    """Turnier -> (Meta, Quelldatei) aus allen Quellen, die sie fuehren."""
    index = {}

    def nimm(pfad, spalte_id, spalte_meta, trenner=";"):
        name = os.path.basename(pfad)
        for z in lies_csv(pfad, trenner):
            t = (z.get(spalte_id) or "").strip()
            m = (z.get(spalte_meta) or "").strip()
            if t and m and m != META_UNBEKANNT and t not in index:
                index[t] = (m, name)

    nimm(os.path.join(DATA, "online_api_tournaments.csv"), "tournament_id", "meta")
    for pfad in sorted(glob.glob(os.path.join(DATA, "online_api_cards_*.csv"))):
        nimm(pfad, "tournament_id", "meta")
    for pfad in sorted(glob.glob(os.path.join(DATA, "tournament_cards_data_cards_*.csv"))):
        nimm(pfad, "tournament_id", "meta")
    return index


def turnierklassen():
    """Turnier -> Turnierklasse aus der Archetypdatei desselben Fensters."""
    tab = {}
    for name in ("city_league_archetypes.csv", "city_league_archetypes_past.csv"):
        for z in lies_csv(os.path.join(DATA, name)):
            t = (z.get("tournament_id") or "").strip()
            k = (z.get("format") or "").strip()
            if t and k:
                tab.setdefault(t, k)
    return tab


def loese_meta(meta, turnier, datum, index, klassen=None):
    """(Meta, abgeleitet?, Quelle). Nur Platzhalter werden angefasst."""
    roh = (meta or "").strip()
    if roh == META_CITY_LEAGUE and klassen:
        klasse = klassen.get((turnier or "").strip())
        if klasse:
            # Gemessen, nicht abgeleitet: die Klasse steht so in der
            # Archetypdatei, geschrieben aus der Turnierliste.
            return klasse, False, "city_league_archetypes.csv"
    if roh != META_UNBEKANNT:
        return (meta or "ohne Meta-Angabe"), False, None
    treffer = index.get((turnier or "").strip())
    if treffer:
        return treffer[0], False, treffer[1]
    iso = _datum(datum)
    if iso:
        schluessel = formatschluessel(iso, DATA)
        if schluessel and schluessel != "vor-bekanntem-fenster":
            return schluessel, True, "format_window.json + sets_metadata.json"
    # Kein Datum, kein Index: dann bleibt die Angabe aus, und sie wird
    # auch nicht erfunden.
    return META_UNBEKANNT, False, None


ABGELEITET_HINWEIS = (
    "Fuer %d der %d Turniere in diesem Meta fuehrt keine Quelle das Format "
    "selbst. Es ist aus dem Turnierdatum abgeleitet: online wechselt das "
    "Format am Set-Release, und genau dieses Fenster steht in "
    "data/format_window.json und data/sets_metadata.json. Gegenprobe am "
    "25.09.2026 an 452 Turnieren, die ihr Format selbst fuehren: 445 Mal "
    "stimmt die Ableitung, 7 Mal nicht — alle sieben am Release-Tag von 30C, "
    "an dem beide Formate nebeneinander laufen."
)


# ── WELCHE KARTENART ──────────────────────────────────────────────────
#
# Die Standardsortierung, um die der Betreiber am 25.09.2026 gebeten hat
# („Pokemon, supporter, Item, Tool, Stadion, Spezial Energie, Basis
# Energie"), braucht die FEINE Kartenart. Die Online-API fuehrt nur eine
# grobe Spalte `group` (pokemon/trainer/energy) — und weil sie in der
# Rangfolge vorne steht, stand bisher bei 105 von 228 Karten „trainer".
#
# Die feine Art steht in den `type`-Spalten der anderen Quellen und,
# vollstaendig, in data/cards_chunk_*.json (21.092 Karten). Die
# Zuordnung selbst macht scripts/kartengruppe.py.

def typtabelle():
    """(set, nummer) -> feine Kartenart, aus dem Bestand."""
    tab = {}
    for pfad in sorted(glob.glob(os.path.join(DATA, "cards_chunk_*.json"))):
        try:
            with open(pfad, encoding="utf-8") as fh:
                karten = json.load(fh)
        except Exception as e:  # noqa: BLE001
            print(f"::warning::{os.path.basename(pfad)} nicht lesbar: {e}")
            continue
        if not isinstance(karten, list):
            continue
        for k in karten:
            typ = (k.get("type") or "").strip()
            if not typ:
                continue
            satz = (k.get("set") or "").strip().upper()
            nr = (k.get("number") or "").strip().lstrip("0") or (k.get("number") or "").strip()
            if satz:
                tab.setdefault((satz, nr), typ)
    return tab


# ── PREISE UND BILDER ─────────────────────────────────────────────────

def preistabelle():
    tab = {}
    for z in lies_csv(os.path.join(DATA, "price_data.csv"), ","):
        s = (z.get("set") or "").strip().upper()
        n = (z.get("number") or "").strip().lstrip("0") or "0"
        preis = _zahl(z.get("eur_price"), -1.0)
        if not s or preis < 0:
            continue
        tab.setdefault((s, n), {
            "eur": round(preis, 2),
            "eur_niedrig": round(_zahl(z.get("eur_low"), -1.0), 2) if _zahl(z.get("eur_low"), -1.0) >= 0 else None,
            "url": (z.get("cardmarket_url") or "").strip() or None,
            "stand": (z.get("last_updated") or "").strip() or None,
        })
    return tab


def deutsche_namen():
    """(set, nummer) -> deutscher Kartenname, soweit einer gefuehrt wird.

    Die Oberflaeche der Masterclass ist deutsch. Wo kein deutscher Name
    im Bestand steht, bleibt der englische stehen — uebersetzt wird
    nicht, geraten schon gar nicht.
    """
    tab = {}
    for pfad in sorted(glob.glob(os.path.join(DATA, "cards_chunk_*.json"))):
        try:
            with open(pfad, encoding="utf-8") as fh:
                karten = json.load(fh)
        except Exception as e:  # noqa: BLE001
            print(f"::warning::{os.path.basename(pfad)} nicht lesbar: {e}")
            continue
        if not isinstance(karten, list):
            continue
        for k in karten:
            de = (k.get("name_de") or "").strip()
            if not de:
                continue
            satz = (k.get("set") or "").strip().upper()
            nr = (k.get("number") or "").strip().lstrip("0") or (k.get("number") or "").strip()
            if satz:
                tab.setdefault((satz, nr), de)
    return tab


# Wie eine Meta-Kennung in der Oberflaeche heissen soll. Was hier nicht
# steht, wird unveraendert gezeigt — ein erfundener Klarname waere
# schlimmer als eine Kennung.
META_KLARNAME = {
    "Online Dated": "Online, ohne Meta-Angabe",
    "City League": "City League (Japan)",
    "City League (JP)": "City League (Japan)",
    "Champions League (JP)": "Champions League (Japan)",
    "Regional League (JP)": "Regional League (Japan)",
    "Japan Championships (JP)": "Japan Championships",
    "Korean League (JP)": "Korean League (japanisches Format)",
    "Premier Ball League (JP)": "Premier Ball League (Japan)",
    "Sonstiges (JP)": "Sonstiges Turnier (japanisches Format)",
}
META_HINWEIS = {
    "Online Dated": ("Die Quelldatei online_tournament_dated_cards.csv fuehrt fuer "
                     "jede Zeile die Meta-Angabe \u201eOnline Dated\u201c. Welches Format "
                     "gespielt wurde, steht dort nicht — es wird deshalb auch "
                     "nicht behauptet."),
}


def bildtabelle():
    """Bild je (set, nummer) aus den Quellen, die es ohnehin fuehren."""
    tab = {}
    for pfad in (sorted(glob.glob(os.path.join(DATA, "tournament_cards_data_cards_*.csv")))
                 + [os.path.join(DATA, "online_tournament_dated_cards.csv"),
                    os.path.join(DATA, "current_meta_card_data.csv")]):
        for z in lies_csv(pfad):
            url = (z.get("image_url") or "").strip()
            if not url:
                continue
            s = (z.get("set_code") or "").strip().upper()
            n = (z.get("set_number") or "").strip().lstrip("0") or "0"
            if s:
                tab.setdefault((s, n), url)
    return tab


# ── TURNIERERGEBNISSE UND MATCHUPS ────────────────────────────────────

def turnierergebnisse(slugs):
    raus = []
    for pfad in sorted(glob.glob(os.path.join(DATA, "labs_tournament_decks_*.csv"))):
        for z in lies_csv(pfad, ","):
            if (z.get("deck_slug") or "").strip() not in slugs:
                continue
            raus.append({
                "turnier": (z.get("tournament_name") or "").strip(),
                "datum": (z.get("tournament_date") or "").strip(),
                "art": (z.get("tournament_type") or "").strip(),
                "land": (z.get("country") or "").strip(),
                "meta": (z.get("meta") or "").strip(),
                "spieler_gesamt": _ganz(z.get("total_players")),
                "spieler_deck": _ganz(z.get("player_count")),
                "anteil": _zahl(z.get("share_pct")),
                "siege": _ganz(z.get("wins")), "niederlagen": _ganz(z.get("losses")),
                "unentschieden": _ganz(z.get("ties")),
                "siegquote": _zahl(z.get("win_pct")),
                "quelle": os.path.basename(pfad),
            })
    raus.sort(key=lambda t: _datum(t["datum"]) or "", reverse=True)
    return raus


def matchups(slugs):
    raus = {}
    for pfad in sorted(glob.glob(os.path.join(DATA, "labs_tournament_matchups_*.csv"))):
        for z in lies_csv(pfad, ","):
            eigen = (z.get("my_deck_slug") or "").strip()
            gegen = (z.get("opponent_deck_slug") or "").strip()
            if eigen in slugs:
                schluessel, name = gegen, (z.get("opponent_deck_name") or "").strip()
                w = _zahl(z.get("vs_win_pct"))
            elif gegen in slugs:
                # Dieselbe Begegnung von der anderen Seite. Die Quote wird
                # NICHT aus 100 minus der anderen gerechnet — Unentschieden
                # gehen sonst verloren. Diese Richtung wird uebersprungen.
                continue
            else:
                continue
            # Die Datei fuehrt jede Begegnung dreimal: day_filter
            # overall / day1 / day2 (gemessen 25.09.2026: 2373 / 2373 /
            # 745 Zeilen). Genommen wird der Gesamtwert; ohne diese
            # Zeile stuenden Tag-1-Zahlen unter derselben Ueberschrift.
            if (z.get("day_filter") or "overall").strip() != "overall":
                continue
            n = _ganz(z.get("vs_count"))
            if not schluessel or n <= 0:
                continue
            vorher = raus.get(schluessel)
            if vorher and vorher["partien"] >= n:
                continue
            raus[schluessel] = {
                "gegner": name or schluessel, "gegner_slug": schluessel,
                "partien": n, "siegquote": w,
                "meta": (z.get("meta") or "").strip(),
                "turniere": _ganz(z.get("tournament_count")),
                "quelle": os.path.basename(pfad),
            }
    liste = sorted(raus.values(), key=lambda m: -m["partien"])
    return liste


# ── BASIS-ENERGIEN: EIN DRUCK JE ENERGIEART ───────────────────────────
#
# BEFUND (Betreiber, 25.09.2026, am Bildschirmfoto): „für Basis Metal
# brauchen wir nicht verschiede Prints zeigen, eins reicht".
#
# Er hat recht: die Mappe zeigte acht Basis-Energie-Kacheln, drei davon
# Metall (MEE-8 mit 2592 Listen, MEE-16 mit 42, EVO-98 mit 8). Fuer den
# Deckbau sind Basis-Energien austauschbar — welcher Druck im Karton
# liegt, entscheidet niemand nach der Quote.
#
# WAS NICHT GEMACHT WIRD: die Listenzahlen addieren. 2592 + 42 + 8 sind
# 2642 — bei 2641 Listen insgesamt. Der Ueberschuss beweist, dass
# Listen mehrere Drucke fuehren; eine Summe zaehlte sie doppelt.
#
# Gezeigt wird deshalb der meistgespielte Druck mit SEINEN gemessenen
# Zahlen, und die anderen stehen als `weitere_drucke` daneben — nicht
# verschwiegen, nur nicht mehr als eigene Kachel.

def _energieart(name):
    """„Basic Metal Energy" und „Metal Energy" sind dieselbe Energieart."""
    n = " ".join(str(name or "").strip().lower().split())
    if n.startswith("basic "):
        n = n[6:]
    return n


def energien_zusammenfassen(karten):
    fuehrend = {}
    aus = []
    for k in karten:
        if k.get("gruppe") != "basic-energy":
            aus.append(k)
            continue
        art = _energieart(k.get("name"))
        vorher = fuehrend.get(art)
        if vorher is None:
            fuehrend[art] = k
            k["weitere_drucke"] = []
            aus.append(k)
            continue
        # Der meistgespielte Druck fuehrt; der andere wandert an ihn.
        a = (vorher.get("gesamt") or {}).get("listen_mit_karte") or 0
        b = (k.get("gesamt") or {}).get("listen_mit_karte") or 0
        if b > a:
            # Rollentausch: der neue fuehrt, der alte wird Nebendruck.
            k["weitere_drucke"] = vorher.pop("weitere_drucke", [])
            aus[aus.index(vorher)] = k
            fuehrend[art] = k
            vorher, k = k, vorher
        vorher.setdefault("weitere_drucke", []).append({
            "name": k.get("name"), "name_de": k.get("name_de"),
            "set": k.get("set"), "nummer": k.get("nummer"),
            "listen_mit_karte": (k.get("gesamt") or {}).get("listen_mit_karte"),
            "schnitt": (k.get("gesamt") or {}).get("schnitt"),
            "preis": (k.get("preis") or {}).get("eur"),
        })
    for k in aus:
        if k.get("gruppe") == "basic-energy":
            k["weitere_drucke"] = sorted(
                k.get("weitere_drucke") or [],
                key=lambda d: -(d.get("listen_mit_karte") or 0))
    return aus


# ── ZUSAMMENBAUEN ─────────────────────────────────────────────────────

def baue_einen(mc_id, eintrag):
    kopf = (eintrag.get("kopf_pokemon") or "").strip().lower()
    if not kopf:
        raise SystemExit(f"::error::{mc_id}: kein kopf_pokemon in {REGISTER}")

    namen, slugs = archetypen_zum_kopf(kopf)
    if not namen and not slugs:
        print(f"::warning::{mc_id}: kein Archetyp mit Leitkarte {kopf!r} "
              f"gefunden — die Mappe bleibt leer, geraten wird nicht.")

    # Turnier -> Quelle, nach Rangfolge. Ein Turnier zaehlt genau einmal.
    besitzer = {}
    rohzeilen = []
    for quellenname in RANG:
        for zeile in QUELLEN[quellenname](namen, slugs):
            rohzeilen.append(zeile)
            t = zeile[2]
            if t:
                besitzer.setdefault(t, quellenname)

    index = meta_index()
    klassen = turnierklassen()
    karten = {}
    metas = {}
    uebersprungen = {}
    for (quelle, meta, turnier, datum, satz, nr, name, gruppe,
         mit, gesamt, schnitt, hoechst) in rohzeilen:
        if turnier and besitzer.get(turnier) != quelle:
            uebersprungen[turnier] = uebersprungen.get(turnier) or quelle
            continue
        if not name:
            continue
        meta, abgeleitet, meta_quelle = loese_meta(meta, turnier, datum, index, klassen)
        satz = (satz or "").strip().upper()
        nr = (nr or "").strip().lstrip("0") or (nr or "").strip()
        schluessel = (satz, nr, name)

        m = metas.setdefault(meta, {"id": meta, "turniere": set(), "listen": 0,
                                    "von": None, "bis": None,
                                    "abgeleitet": set(), "meta_quellen": set()})
        if turnier and turnier not in m["turniere"]:
            m["turniere"].add(turnier)
            m["listen"] += gesamt
            if abgeleitet:
                m["abgeleitet"].add(turnier)
        if meta_quelle:
            m["meta_quellen"].add(meta_quelle)
        iso = _datum(datum)
        if iso:
            m["von"] = min(m["von"] or iso, iso)
            m["bis"] = max(m["bis"] or iso, iso)

        k = karten.setdefault(schluessel, {
            "name": name, "set": satz, "nummer": nr, "gruppe": gruppe or "",
            "typen": set(), "je_meta": {}, "quellen": set(),
        })
        k["quellen"].add(quelle)
        if gruppe:
            k["typen"].add(gruppe)
            # Die FEINE Angabe gewinnt. Die Online-API steht in der
            # Rangfolge vorn, fuehrt aber nur pokemon/trainer/energy —
            # ohne diesen Vorrang stuende bei 105 von 228 Karten
            # „trainer", und die Standardsortierung koennte Supporter,
            # Item, Tool und Stadion nicht trennen.
            if not k["gruppe"] or (kartengruppe.gruppe(k["gruppe"]) is None
                                   and kartengruppe.gruppe(gruppe) is not None):
                k["gruppe"] = gruppe
        jm = k["je_meta"].setdefault(meta, {"listen_mit_karte": 0, "schnitt_summe": 0.0,
                                            "hoechstzahl": 0, "turniere": set()})
        jm["listen_mit_karte"] += mit
        jm["schnitt_summe"] += schnitt * mit
        jm["hoechstzahl"] = max(jm["hoechstzahl"], hoechst)
        if turnier:
            jm["turniere"].add(turnier)

    preise = preistabelle()
    bilder = bildtabelle()
    de_namen = deutsche_namen()
    typen = typtabelle()
    ace_namen = lade_ace_liste()

    karten_raus = []
    for (satz, nr, name), k in karten.items():
        gesamt_mit = 0
        gesamt_schnittsumme = 0.0
        gesamt_hoechst = 0
        je_meta = {}
        for meta, jm in k["je_meta"].items():
            listen_gesamt = metas[meta]["listen"]
            mit = jm["listen_mit_karte"]
            gesamt_mit += mit
            gesamt_schnittsumme += jm["schnitt_summe"]
            gesamt_hoechst = max(gesamt_hoechst, jm["hoechstzahl"])
            je_meta[meta] = {
                "listen_mit_karte": mit,
                "listen_gesamt": listen_gesamt,
                "anteil": round(100.0 * mit / listen_gesamt, 1) if listen_gesamt else None,
                "schnitt": round(jm["schnitt_summe"] / mit, 2) if mit else None,
                "hoechstzahl": jm["hoechstzahl"] or None,
                "turniere": len(jm["turniere"]),
            }
        listen_gesamt_alle = sum(m["listen"] for m in metas.values() if m["id"] in k["je_meta"])
        # Die feine Kartenart: was eine Quelle geschrieben hat, sonst der
        # Bestand. Die Gruppe daraus nach der gemeinsamen Regel.
        typ = k["gruppe"] or ""
        grp = kartengruppe.gruppe(typ, name)
        if grp is None:
            typ_bestand = typen.get((satz, nr)) or ""
            grp = kartengruppe.gruppe(typ_bestand, name)
            if grp is not None:
                typ = typ_bestand
        karten_raus.append({
            "name": name, "name_de": de_namen.get((satz, nr)),
            "set": satz, "nummer": nr,
            "typ": typ or None,
            "gruppe": grp,
            "gruppe_name": kartengruppe.LABEL_DE.get(grp) if grp else None,
            "gruppe_rang": kartengruppe.rang(grp),
            # ACE SPEC: hoechstens eine je Deck. Dieselben zwei Beine wie
            # in scripts/masterclass_listen_nachziehen.py — das Register
            # data/ace_specs.json ODER das Feld der Quelle.
            "ace": (str(name).strip().lower().replace("\u2019", "'") in ace_namen) or None,
            "bild": bilder.get((satz, nr)),
            "preis": preise.get((satz, nr)),
            "je_meta": je_meta,
            # ueber ALLE Metas dieselben vier Angaben wie je Meta. Ohne
            # Schnitt und Hoechstzahl kann die Ansicht „Alle Metas"
            # nicht sagen, wie viele Kopien ins Deck gehoeren — das +
            # legte dort immer genau eine hinein (gemessen 25.09.2026).
            # Der Schnitt ist mit der Zahl der Listen gewichtet, die die
            # Karte WIRKLICH enthalten; das ist dieselbe Frage wie je
            # Meta, nur ueber einen groesseren Bestand.
            "gesamt": {
                "listen_mit_karte": gesamt_mit,
                "listen_gesamt": listen_gesamt_alle,
                "anteil": round(100.0 * gesamt_mit / listen_gesamt_alle, 1) if listen_gesamt_alle else None,
                "schnitt": round(gesamt_schnittsumme / gesamt_mit, 2) if gesamt_mit else None,
                "hoechstzahl": gesamt_hoechst or None,
            },
            "quellen": sorted(k["quellen"]),
        })
    karten_raus = energien_zusammenfassen(karten_raus)
    karten_raus.sort(key=lambda c: (-(c["gesamt"]["listen_mit_karte"]), c["name"]))

    def _meta_zeile(m):
        abgeleitet = len(m.get("abgeleitet") or ())
        hinweis = META_HINWEIS.get(m["id"])
        if abgeleitet:
            zusatz = ABGELEITET_HINWEIS % (abgeleitet, len(m["turniere"]))
            hinweis = (hinweis + " " + zusatz) if hinweis else zusatz
        return {
            "id": m["id"], "name": META_KLARNAME.get(m["id"], m["id"]),
            "hinweis": hinweis,
            "turniere": len(m["turniere"]),
            "turniere_abgeleitet": abgeleitet,
            "listen": m["listen"],
            "von": m["von"], "bis": m["bis"],
            "meta_quellen": sorted(m.get("meta_quellen") or ()),
        }

    metas_raus = [_meta_zeile(m) for m in
                  sorted(metas.values(), key=lambda x: (x["bis"] or ""), reverse=True)]

    return {
        "_meta": {
            "masterclass": mc_id,
            "titel_en": eintrag.get("titel_en"),
            "kopf_pokemon": kopf,
            "archetypen": sorted(namen),
            "archetyp_kennungen": sorted(slugs),
            "gebaut": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            "karten": len(karten_raus),
            "metas": [m["id"] for m in metas_raus],
            "doppelte_turniere_uebersprungen": len(uebersprungen),
            # Zahl der UNTERSCHIEDLICHEN Turniere ueber alle Metas. Sie
            # muss der Summe der Turnierzahlen je Meta entsprechen — tut
            # sie es nicht, steht dasselbe Turnier in zwei Meta-Toepfen
            # und jede Gesamtzahl waere doppelt gezaehlt.
            "turniere_gesamt": len(set().union(*[m["turniere"] for m in metas.values()])
                                    if metas else set()),
            "hinweis": ("Jede Zeile kommt aus einer Quelle unter data/. Nichts ist "
                        "hochgerechnet. Fehlt ein Preis oder ein Bild, steht dort "
                        "nichts — geraten wird nicht."),
            "rangfolge_bei_doppelten_turnieren": RANG,
        },
        "metas": metas_raus,
        "karten": karten_raus,
        "turniere": turnierergebnisse(slugs),
        "matchups": matchups(slugs),
    }


def main():
    with open(REGISTER, encoding="utf-8") as fh:
        register = (json.load(fh) or {}).get("masterclasses") or {}
    if not register:
        print(f"::error::{REGISTER} fuehrt keine Masterclass")
        return 1

    os.makedirs(AUSGABE_DIR, exist_ok=True)
    fehler = 0
    for mc_id, eintrag in sorted(register.items()):
        mappe = baue_einen(mc_id, eintrag)
        ziel = os.path.join(AUSGABE_DIR, f"{mc_id}.json")
        with open(ziel, "w", encoding="utf-8") as fh:
            json.dump(mappe, fh, ensure_ascii=False, indent=1)
            fh.write("\n")
        k = mappe["_meta"]["karten"]
        print(f"  {mc_id}: {k} Karten, {len(mappe['metas'])} Metas, "
              f"{len(mappe['turniere'])} Turniere, {len(mappe['matchups'])} Matchups "
              f"-> {os.path.relpath(ziel, WURZEL)}")
        if k == 0:
            print(f"::warning::{mc_id}: keine einzige Karte gefunden — "
                  f"stimmt kopf_pokemon in {os.path.relpath(REGISTER, WURZEL)}?")
            fehler = 1
    return fehler


if __name__ == "__main__":
    raise SystemExit(main())
