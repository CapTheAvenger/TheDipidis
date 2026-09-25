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
        meta = meta or "ohne Meta-Angabe"
        satz = (satz or "").strip().upper()
        nr = (nr or "").strip().lstrip("0") or (nr or "").strip()
        schluessel = (satz, nr, name)

        m = metas.setdefault(meta, {"id": meta, "turniere": set(), "listen": 0,
                                    "von": None, "bis": None})
        if turnier and turnier not in m["turniere"]:
            m["turniere"].add(turnier)
            m["listen"] += gesamt
        iso = _datum(datum)
        if iso:
            m["von"] = min(m["von"] or iso, iso)
            m["bis"] = max(m["bis"] or iso, iso)

        k = karten.setdefault(schluessel, {
            "name": name, "set": satz, "nummer": nr, "gruppe": gruppe or "",
            "je_meta": {}, "quellen": set(),
        })
        k["quellen"].add(quelle)
        if gruppe and not k["gruppe"]:
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

    karten_raus = []
    for (satz, nr, name), k in karten.items():
        gesamt_mit = 0
        je_meta = {}
        for meta, jm in k["je_meta"].items():
            listen_gesamt = metas[meta]["listen"]
            mit = jm["listen_mit_karte"]
            gesamt_mit += mit
            je_meta[meta] = {
                "listen_mit_karte": mit,
                "listen_gesamt": listen_gesamt,
                "anteil": round(100.0 * mit / listen_gesamt, 1) if listen_gesamt else None,
                "schnitt": round(jm["schnitt_summe"] / mit, 2) if mit else None,
                "hoechstzahl": jm["hoechstzahl"] or None,
                "turniere": len(jm["turniere"]),
            }
        listen_gesamt_alle = sum(m["listen"] for m in metas.values() if m["id"] in k["je_meta"])
        karten_raus.append({
            "name": name, "name_de": de_namen.get((satz, nr)),
            "set": satz, "nummer": nr,
            "gruppe": k["gruppe"] or None,
            "bild": bilder.get((satz, nr)),
            "preis": preise.get((satz, nr)),
            "je_meta": je_meta,
            "gesamt": {
                "listen_mit_karte": gesamt_mit,
                "listen_gesamt": listen_gesamt_alle,
                "anteil": round(100.0 * gesamt_mit / listen_gesamt_alle, 1) if listen_gesamt_alle else None,
            },
            "quellen": sorted(k["quellen"]),
        })
    karten_raus.sort(key=lambda c: (-(c["gesamt"]["listen_mit_karte"]), c["name"]))

    metas_raus = [{
        "id": m["id"], "name": META_KLARNAME.get(m["id"], m["id"]),
        "hinweis": META_HINWEIS.get(m["id"]),
        "turniere": len(m["turniere"]), "listen": m["listen"],
        "von": m["von"], "bis": m["bis"],
    } for m in sorted(metas.values(), key=lambda x: (x["bis"] or ""), reverse=True)]

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
