#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Zieht die Gruppe "Online · letzte 7 Tage" der Masterclass nach.

BESTELLUNG (23.09.2026): "Die Masterclass unbedingt auf den Wochenlauf
haengen, damit ich immer die aktuellsten Daten habe."

Die Gruppe haelt die fuenf bestplatzierten echten Mega-Stalobor-Listen
der letzten sieben Tage. Sie sind am 22.09.2026 von Hand gebaut worden
und standen seitdem still — eine Gruppe, die "letzte 7 Tage" heisst und
es nicht ist, ist schlechter als keine.

Eingabe: data/masterclass_online_listen.json, geschrieben vom selben
Lauf, der die Listen ohnehin scrapt (backend/scrapers/
current_meta_analysis_scraper.py, build_masterclass_listen). Kein
zusaetzlicher Abruf.

DREI REGELN, damit das Stueck nie schlechter dasteht als vorher:

  1. NUR FRISCHE LISTEN (seit 30.09.2026, DA-26). Die Gruppe hat genau
     so viele Plaetze, wie die Datei Listen liefert (0 bis 5); alte
     Listen bleiben nicht stehen. Die Regalkachel nennt deshalb nur die
     festen Listen und „+ Online (7 Tage)" (js/ds-masterclass.js).
     Bis 30.09. galt hier „alles oder nichts" — siehe nachziehen().
  2. KEINE ERFUNDENEN KACHELN. Jede Karte kommt entweder als fertige
     Kachel aus dem Stueck (dann traegt sie deutschen Namen, Kartentext
     und Tims Begruendung) oder aus data/all_cards_database.csv. Laesst
     sich eine Karte dort nicht finden, bleibt das Stueck unveraendert
     und der Lauf meldet es.
  3. DIE EINLEITUNG IST EINE MESSUNG. Platz, Bilanz, Turnier, Datum aus
     den Rohdaten; dazu der Unterschied zu Tims aktueller Liste, aus
     den Kartenzahlen gerechnet. Kein Satz, den niemand belegen kann.

UMZUG 17.10.2026: die Ausarbeitung liegt nur noch in Hausis Konto
(Firestore), das Repo ist oeffentlich. Dieses Skript schreibt deshalb den
Schluessel `online_listen` in data/masterclass_live/mega-stalobor.json
(scripts/masterclass_live.py): je Liste Name, die Fakten der Einleitung
und die Karten samt der Kachel-Angaben aus der Kartendatenbank. Die
Kacheln mit Tims Begruendung und der Unterschied zu Tims aktueller Liste
entstehen beim Oeffnen in js/ds-masterclass.js — sie brauchen den Text
der Ausarbeitung, und der steht nicht im Repo.
"""

import html
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import masterclass_drucke as DRUCKE  # noqa: E402

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATEN = os.path.join(WURZEL, "data")
GUIDE_ID = "mega-stalobor"
LISTEN_JSON = os.path.join(DATEN, "masterclass_online_listen.json")

# ── WORAN EINE ACE SPEC ERKANNT WIRD ──────────────────────────────────
#
# BEFUND (Wochenlauf 159, 25.09.2026): eine frisch gezogene Liste fuehrte
# „Prime Catcher" — eine ACE SPEC — und die Kachel trug keine Markierung.
# Der Grund steht seit je im Bestand, in js/app-city-league.js:
#
#     "CSV is_ace_spec is buggy"
#
# Derselbe Lauf meldete es sogar mit: „is_ace_spec driftet wieder: 5
# Felder in den ausgelieferten CSVs sind anders belegt als die Regel es
# vorgibt."
#
# Deshalb entscheidet nicht EIN Signal, sondern beide: das Feld
# is_ace_spec ODER der Name im Register data/ace_specs.json (39 Karten,
# Quelle limitlesstcg.com/cards?q=is:ace). Das Register ist dieselbe
# Quelle, gegen die tests/python/test_ace_spec_an_der_kachel.py prueft —
# und dieselbe, aus der window.isAceSpec im Frontend liest.
ACE_REGISTER_DATEI = "ace_specs.json"


def _ace_register():
    pfad = os.path.join(DATEN, ACE_REGISTER_DATEI)
    try:
        with open(pfad, encoding="utf-8") as f:
            namen = (json.load(f) or {}).get("ace_specs") or []
    except Exception as e:  # noqa: BLE001
        print("::warning::%s nicht lesbar (%s) — die ACE-SPEC-Markierung "
              "haengt dann allein am Feld is_ace_spec" % (ACE_REGISTER_DATEI, e))
        return set()
    return {str(n).strip().lower().replace("\u2019", "'") for n in namen if str(n).strip()}


ACE_NAMEN = _ace_register()


def ist_ace_spec(name_en, feld=False):
    """Eins von beiden genuegt. Geraten wird nichts: beide Quellen sind
    gefuehrte Angaben, keine Heuristik ueber Seltenheit oder Kartentext."""
    if feld:
        return True
    n = html.unescape(str(name_en or "")).strip().lower().replace("\u2019", "'")
    return bool(n) and n in ACE_NAMEN


GRUPPE = "Online · letzte 7 Tage"
TIMS_BLOCK = "0"          # Tims aktuelle Liste — Bezug fuer den Unterschied
CDN = "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci"

# ---------------------------------------------------------------- Werkzeug

def _schluessel(name):
    """Vergleichsform eines Kartennamens: Kleinschreibung, ohne
    Apostroph-Varianten, ohne fuehrendes "Basic" (die Scraper schreiben
    mal "Metal Energy", mal "Basic Metal Energy")."""
    n = html.unescape(str(name or "")).strip().lower()
    n = n.replace("’", "'").replace("`", "'")
    n = re.sub(r"^basic\s+", "", n)
    return re.sub(r"\s+", " ", n)


def _slug(name):
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", _schluessel(name))).strip("-")


def _bild(druck):
    t = str(druck or "").split("-")
    if len(t) != 2 or not t[0] or not t[1]:
        return ""
    return f"{CDN}/{t[0]}/{t[0]}_{t[1].zfill(3)}_R_EN_LG.png"


def kachel_neu(name_en, set_code, set_number, ist_ace=False):
    """Eine Karte, die im Stueck noch nicht vorkommt. Namen und Text aus
    der Kartendatenbank, Druck nach derselben Regel wie der Rest der
    Listen (neuester guenstiger Druck). Ohne Begruendung — die hat Tim
    fuer diese Karte nie geschrieben, und erfunden wird keine.

    `ist_ace` setzt die Markierung data-ace="1" an der Kachel. Warum das hier
    entsteht und nicht im Test:

    BEFUND (Wochenlauf 158, 25.09.2026): tests/unit/test-masterclass.js
    zaehlte ACE SPEC gegen vier deutsche Namen im Test. Das Format kennt
    39. Eine frisch gezogene Liste mit einer fuenften zaehlte als null,
    und der Lauf wurde rot, ohne dass etwas kaputt war.

    Die Namensliste im Test nachzupflegen waere derselbe Fehler, den
    js/app-city-league.js schon einmal gemacht hat: eine handgefuehrte
    Kopie von data/ace_specs.json, die um 12 fehlende und 3 erfundene
    Namen abgedriftet ist. Deshalb sagt die KACHEL selbst, was sie ist —
    aus derselben Quelle, aus der die Liste kommt.
    """
    # Seit dem Umzug (17.10.2026) liefert diese Funktion die ANGABEN der
    # Kachel, nicht mehr ihr HTML: js/ds-masterclass.js baut daraus
    # dieselbe Kachel (kachelNeuHtml).
    roh = "%s-%s" % (str(set_code or "").strip(), str(set_number or "").strip())
    kandidaten, basis = DRUCKE.kandidaten(roh)
    if not basis:
        return None
    druck = DRUCKE.neuester_billiger_druck(roh)[0] or roh
    druck = DRUCKE.neuester_billiger_druck(druck)[0] or druck
    hoch = DRUCKE.hoechster_druck(druck)[0] or druck
    de = (basis.get("name_de") or "").strip() or (basis.get("name_en") or "").strip()
    en = (basis.get("name_en") or "").strip() or str(name_en or "").strip()
    bild = _bild(druck)
    if not bild:
        return None
    return {"karte": _slug(en), "de": de, "en": en, "druck": druck, "hoch": hoch,
            "bild": bild, "ace": bool(ist_ace)}


# ------------------------------------------------------- Einleitungstext

def _bilanz(score):
    m = re.match(r"^\s*(\d+)\s*-\s*(\d+)\s*-\s*(\d+)\s*$", str(score or ""))
    return "%s–%s–%s" % m.groups() if m else ""


def _datum(iso):
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", str(iso or "").strip())
    return "%s.%s.%s" % (m.group(3), m.group(2), m.group(1)) if m else str(iso or "")


def unterschied(zaehlung, tims):
    """Der Unterschied zu Tims aktueller Liste, in deutschen Namen und
    aus den Kartenzahlen gerechnet — nicht beschrieben, sondern
    gezaehlt."""
    mehr, weniger, neu, fehlt = [], [], [], []
    for name, n in sorted(zaehlung.items(), key=lambda x: (-x[1], x[0])):
        alt = tims.get(name)
        if alt is None:
            neu.append("%d× %s" % (n, name))
        elif n > alt:
            mehr.append("%d statt %d %s" % (n, alt, name))
        elif n < alt:
            weniger.append("%d statt %d %s" % (n, alt, name))
    for name, alt in sorted(tims.items(), key=lambda x: (-x[1], x[0])):
        if name not in zaehlung:
            fehlt.append("kein %s" % name)
    teile = []
    if neu:
        teile.append("dazu " + ", ".join(neu[:4]))
    if fehlt:
        teile.append(", ".join(fehlt[:4]))
    if mehr or weniger:
        teile.append(", ".join((mehr + weniger)[:4]))
    if not teile:
        return "Kartengleich mit Tims aktueller Liste."
    return "Gegenüber Tims aktueller Liste: " + "; ".join(teile) + "."


def fakten(liste):
    """Der erste Satz der Einleitung: Platz, Bilanz, Turnier, Datum — alles
    aus den Rohdaten. Den zweiten Satz (Unterschied zu Tims aktueller
    Liste) rechnet die Seite beim Einsetzen mit derselben Regel wie
    `unterschied`."""
    platz = int(liste.get("place_rank") or 0)
    gesamt = int(liste.get("total_players") or 0)
    kopf = "%d. Platz von %d" % (platz, gesamt) if gesamt else "%d. Platz" % platz
    bilanz = _bilanz(liste.get("score"))
    if bilanz:
        kopf += " (%s)" % bilanz
    turnier = str(liste.get("tournament_name") or "").strip()
    datum = _datum(liste.get("tournament_date"))
    return "%s, „%s“, %s." % (kopf, turnier, datum) if turnier else "%s, %s." % (kopf, datum)


def listenname(liste):
    platz = int(liste.get("place_rank") or 0)
    gesamt = int(liste.get("total_players") or 0)
    spieler = str(liste.get("player") or "").strip() or "Unbekannt"
    return "%s · %d. von %d" % (spieler, platz, gesamt) if gesamt else "%s · %d." % (spieler, platz)


def live_liste(liste):
    karten = []
    for karte in liste.get("cards") or []:
        n = int(karte.get("count") or 0)
        if n <= 0:
            continue
        name = karte.get("name") or ""
        ace = ist_ace_spec(name, bool(karte.get("is_ace_spec")))
        karten.append({
            "name": name,
            "schluessel": _schluessel(name),
            "n": n,
            "ace": ace,
            "neu": kachel_neu(name, karte.get("set_code"), karte.get("set_number"), ace),
        })
    return {"name": listenname(liste), "fakten": fakten(liste), "karten": karten}


# Hoechstens so viele Plaetze hat die Gruppe — so viele liefert
# build_masterclass_listen (MASTERCLASS_LISTEN im Scraper).
MAX_PLAETZE = 5

LEER_HINWEIS = ('<span class="mcl-listgruppe-leer">Keine Online-Liste ab 100 Spielern in den '
                'letzten 7 Tagen — ältere Listen stehen unter „Worlds · Day 2“.</span>')


def live_daten(listen):
    """Gibt (Daten, Grund). Grund gesetzt = nichts schreiben.

    WENIGER LISTEN = WENIGER PLAETZE (Hausi, 30.09.2026, DA-26): die
    Gruppe hat genau so viele Plaetze, wie das Fenster frische Listen hat
    (0 bis 5); bei 0 steht LEER_HINWEIS. Mehr Listen als Plaetze: nichts
    schreiben. Eine Karte ohne Kachel-Angaben (`neu` leer) UND ohne Kachel
    in der Ausarbeitung laesst die Seite die Gruppe unveraendert — das
    entscheidet erst das Einsetzen, weil nur dort die Ausarbeitung liegt.
    """
    if len(listen) > MAX_PLAETZE:
        return None, ("die Datei liefert %d Listen, die Gruppe hat hoechstens %d Plaetze"
                      % (len(listen), MAX_PLAETZE))
    return {
        "gruppe": GRUPPE,
        "max_plaetze": MAX_PLAETZE,
        "leer_hinweis": LEER_HINWEIS,
        "mindest_spieler": 100,
        "listen": [live_liste(l) for l in listen],
    }, ""


def main():
    import masterclass_live as LIVE
    if not os.path.exists(LISTEN_JSON):
        print("::warning::%s liegt nicht im Baum — die Online-Listen bleiben, wie sie sind" % LISTEN_JSON)
        return 0
    with open(LISTEN_JSON, encoding="utf-8") as f:
        daten = json.load(f)
    listen = daten.get("listen") or []
    neu, grund = live_daten(listen)
    if grund:
        print("::warning::Online-Listen NICHT nachgezogen: %s" % grund)
        return 0
    ohne = sorted({k["name"] for l in neu["listen"] for k in l["karten"] if not k["neu"]})
    if ohne:
        print("::notice::ohne Eintrag in der Kartendatenbank (die Seite nimmt dafuer "
              "Tims Kachel, sonst bleibt die Gruppe stehen): " + ", ".join(ohne))
    if len(listen) < MAX_PLAETZE:
        print("::notice::Masterclass, Gruppe „%s“: %d von %d Plaetzen — mehr frische "
              "Listen ab %s Spielern gibt das Fenster nicht her. Alte Listen werden "
              "nicht stehen gelassen (DA-26)." % (GRUPPE, len(listen), MAX_PLAETZE, 100))
    if LIVE.schreibe_teil(GUIDE_ID, "online_listen", neu):
        print("%s: Online-Listen neu (%d Listen)" % (LIVE.pfad(GUIDE_ID), len(listen)))
    else:
        print("%s: die Online-Listen stehen wie die Rohdaten." % LIVE.pfad(GUIDE_ID))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
