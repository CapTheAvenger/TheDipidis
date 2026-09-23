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

  1. ALLES ODER NICHTS. Liefert die Datei nicht genau so viele Listen,
     wie die Gruppe Plaetze hat, wird NICHTS geschrieben. Sonst
     wanderten die Nummern der Bloecke (data-mcl-listenblock) und die
     Regalkachel behauptete eine falsche Listenzahl.
  2. KEINE ERFUNDENEN KACHELN. Jede Karte kommt entweder als fertige
     Kachel aus dem Stueck (dann traegt sie deutschen Namen, Kartentext
     und Tims Begruendung) oder aus data/all_cards_database.csv. Laesst
     sich eine Karte dort nicht finden, bleibt das Stueck unveraendert
     und der Lauf meldet es.
  3. DIE EINLEITUNG IST EINE MESSUNG. Platz, Bilanz, Turnier, Datum aus
     den Rohdaten; dazu der Unterschied zu Tims aktueller Liste, aus
     den Kartenzahlen gerechnet. Kein Satz, den niemand belegen kann.
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
STUECK = os.path.join(WURZEL, "masterclass", "mega-stalobor.de.html")
LISTEN_JSON = os.path.join(DATEN, "masterclass_online_listen.json")

GRUPPE = "Online · letzte 7 Tage"
TIMS_BLOCK = "0"          # Tims aktuelle Liste — Bezug fuer den Unterschied
CDN = "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci"

KACHEL = re.compile(r'<button type="button" class="mcl-kk"[^>]*?data-en="([^"]*)"[^>]*?>'
                    r'.*?</button>', re.S)
# Ein Listenblock endet mit SEINER Quellenzeile. Ein Vorgriff auf den
# naechsten Block (?=<div class="mcl-liste" ...|\Z) sieht harmlos aus und
# ist es nicht: beim LETZTEN Block frisst \Z den Rest der Datei — im
# Versuch am 23.09.2026 waren das 88 KB Ausarbeitung.
BLOCK = re.compile(r'<div class="mcl-liste" data-mcl-listenblock="(\d+)"[^>]*?>'
                   r'.*?<p class="mcl-quelle">.*?</p></div>', re.S)


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


def _attr(kachel, name):
    m = re.search(r'\sdata-%s="([^"]*)"' % re.escape(name), kachel)
    return m.group(1) if m else ""


# ---------------------------------------------- Kacheln aus dem Stueck

def kachel_vorlagen(roh):
    """englischer Name -> Kachel-HTML, wie es im Stueck steht. Die erste
    gefundene Kachel je Karte gewinnt; sie unterscheiden sich nur in der
    Anzahl, und die wird ohnehin ersetzt."""
    aus = {}
    for m in KACHEL.finditer(roh):
        aus.setdefault(_schluessel(m.group(1)), m.group(0))
    return aus


def kachel_mit_anzahl(vorlage, n):
    de = _attr(vorlage, "de")
    k = re.sub(r'\sdata-n="\d+"', ' data-n="%d"' % n, vorlage, count=1)
    k = re.sub(r'aria-label="[^"]*"', 'aria-label="%s, %d mal"' % (html.escape(de), n), k, count=1)
    k = re.sub(r'<span class="mcl-anz">\d+</span>', '<span class="mcl-anz">%d</span>' % n, k, count=1)
    return k


def kachel_neu(name_en, set_code, set_number, n):
    """Eine Karte, die im Stueck noch nicht vorkommt. Namen und Text aus
    der Kartendatenbank, Druck nach derselben Regel wie der Rest der
    Listen (neuester guenstiger Druck). Ohne Begruendung — die hat Tim
    fuer diese Karte nie geschrieben, und erfunden wird keine."""
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
    return ('<button type="button" class="mcl-kk" data-mcl-karte="%s" data-de="%s" data-en="%s" '
            'data-druck="%s" data-druck-hoch="%s" data-n="%d" aria-label="%s, %d mal">'
            '<img src="%s" alt="" loading="lazy" width="245" height="342">'
            '<span class="mcl-anz">%d</span></button>'
            % (html.escape(_slug(en)), html.escape(de), html.escape(en),
               html.escape(druck), html.escape(hoch), n, html.escape(de), n, bild, n))


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


def einleitung(liste, zaehlung, tims):
    platz = int(liste.get("place_rank") or 0)
    gesamt = int(liste.get("total_players") or 0)
    kopf = "%d. Platz von %d" % (platz, gesamt) if gesamt else "%d. Platz" % platz
    bilanz = _bilanz(liste.get("score"))
    if bilanz:
        kopf += " (%s)" % bilanz
    turnier = str(liste.get("tournament_name") or "").strip()
    datum = _datum(liste.get("tournament_date"))
    fakten = "%s, „%s“, %s." % (kopf, turnier, datum) if turnier else "%s, %s." % (kopf, datum)
    return '<b>%s</b> %s' % (html.escape(fakten), html.escape(unterschied(zaehlung, tims)))


# ------------------------------------------------------------- Aufbau

def listenname(liste):
    platz = int(liste.get("place_rank") or 0)
    gesamt = int(liste.get("total_players") or 0)
    spieler = str(liste.get("player") or "").strip() or "Unbekannt"
    return "%s · %d. von %d" % (spieler, platz, gesamt) if gesamt else "%s · %d." % (spieler, platz)


def block(nummer, liste, vorlagen, tims):
    kacheln, zaehlung, fehlende = [], {}, []
    summe = 0
    for karte in liste.get("cards") or []:
        n = int(karte.get("count") or 0)
        if n <= 0:
            continue
        name = karte.get("name") or ""
        vorlage = vorlagen.get(_schluessel(name))
        if vorlage:
            k = kachel_mit_anzahl(vorlage, n)
            de = _attr(vorlage, "de") or name
        else:
            k = kachel_neu(name, karte.get("set_code"), karte.get("set_number"), n)
            if not k:
                fehlende.append(name)
                continue
            de = _attr(k, "de") or name
        kacheln.append(k)
        zaehlung[html.unescape(de)] = zaehlung.get(html.unescape(de), 0) + n
        summe += n
    if fehlende:
        return None, fehlende
    kopf = einleitung(liste, zaehlung, tims)
    return ('<div class="mcl-liste" data-mcl-listenblock="%s" hidden data-mcl-listenname="%s">'
            '<p class="mcl-listmeta">%s</p>'
            '<div class="mcl-gitter">%s</div>'
            '<p class="mcl-quelle">%d Karten · %d verschiedene'
            '<button type="button" class="mcl-kopieren" data-mcl-kopieren="%s">'
            '<span aria-hidden="true">📋</span> Liste als Bild kopieren</button></p></div>'
            % (nummer, html.escape(listenname(liste)), kopf, "".join(kacheln),
               summe, len(kacheln), nummer), [])


def chip(nummer, liste):
    return ('<button type="button" class="mcl-chip" data-mcl-liste="%s" aria-pressed="false">%s</button>'
            % (nummer, html.escape(listenname(liste))))


def tims_zaehlung(roh):
    """Kartenzahlen aus Tims aktueller Liste — der Bezug fuer den
    Unterschied in der Einleitung."""
    m = re.search(r'<div class="mcl-liste" data-mcl-listenblock="%s"[^>]*?>(.*?)'
                  r'<p class="mcl-quelle">' % TIMS_BLOCK, roh, re.S)
    if not m:
        return {}
    aus = {}
    for k in KACHEL.finditer(m.group(1)):
        de = html.unescape(_attr(k.group(0), "de"))
        n = int(_attr(k.group(0), "n") or 0)
        if de and n:
            aus[de] = aus.get(de, 0) + n
    return aus


def gruppen_nummern(roh):
    """Die Blocknummern, die in der Online-Gruppe stehen — in der
    Reihenfolge ihrer Schalter."""
    m = re.search(r'<div class="mcl-listgruppe">\s*<span class="mcl-listgruppe-titel">%s</span>'
                  r'\s*<div class="mcl-listwahl-reihe">(.*?)</div>' % re.escape(GRUPPE), roh, re.S)
    if not m:
        return [], None
    return re.findall(r'data-mcl-liste="(\d+)"', m.group(1)), m


def nachziehen(roh, listen):
    """Gibt (neuer Text, Aenderungen, Grund). Grund gesetzt = nichts getan."""
    nummern, treffer = gruppen_nummern(roh)
    if not nummern:
        return roh, [], "die Gruppe „%s“ steht nicht im Stueck" % GRUPPE
    if len(listen) != len(nummern):
        return roh, [], ("die Datei liefert %d Listen, die Gruppe hat %d Plaetze"
                         % (len(listen), len(nummern)))

    vorlagen = kachel_vorlagen(roh)
    tims = tims_zaehlung(roh)
    if not vorlagen or not tims:
        return roh, [], "im Stueck sind keine Kartenkacheln zu finden"

    neue_bloecke, aenderungen = {}, []
    for nummer, liste in zip(nummern, listen):
        b, fehlende = block(nummer, liste, vorlagen, tims)
        if b is None:
            return roh, [], ("unbekannte Karten in %s: %s"
                             % (listenname(liste), ", ".join(sorted(set(fehlende)))))
        neue_bloecke[nummer] = b

    # Bloecke ersetzen
    def ersetze(m):
        nummer = m.group(1)
        if nummer not in neue_bloecke:
            return m.group(0)
        alt = m.group(0)
        neu = neue_bloecke[nummer]
        if alt.strip() != neu.strip():
            altname = re.search(r'data-mcl-listenname="([^"]*)"', alt)
            neuname = re.search(r'data-mcl-listenname="([^"]*)"', neu)
            aenderungen.append("Block %s: %s -> %s" % (
                nummer, html.unescape(altname.group(1)) if altname else "?",
                html.unescape(neuname.group(1)) if neuname else "?"))
        return neu

    neu_roh = BLOCK.sub(ersetze, roh)

    # Schalter ersetzen
    reihe = "".join(chip(n, l) for n, l in zip(nummern, listen))
    alt_reihe = treffer.group(1)
    if alt_reihe.strip() != reihe.strip():
        aenderungen.append("Schalterreihe der Gruppe neu beschriftet")
    neu_roh = neu_roh.replace(alt_reihe, reihe, 1)
    return neu_roh, aenderungen, ""


def main():
    if not os.path.exists(LISTEN_JSON):
        print("::warning::%s liegt nicht im Baum — das Stueck bleibt, wie es ist" % LISTEN_JSON)
        return 0
    if not os.path.exists(STUECK):
        print("::warning::%s liegt nicht im Baum — nichts zu tun" % STUECK)
        return 0

    with open(LISTEN_JSON, encoding="utf-8") as f:
        daten = json.load(f)
    listen = daten.get("listen") or []

    with open(STUECK, encoding="utf-8") as f:
        roh = f.read()

    neu, aenderungen, grund = nachziehen(roh, listen)
    if grund:
        print("::warning::Online-Listen NICHT nachgezogen: %s" % grund)
        return 0
    if not aenderungen:
        print("masterclass/mega-stalobor.de.html: die Online-Listen stehen wie die Rohdaten.")
        return 0

    with open(STUECK, "w", encoding="utf-8") as f:
        f.write(neu)
    print("masterclass/mega-stalobor.de.html: %d Aenderungen an den Online-Listen"
          % len(aenderungen))
    for a in aenderungen:
        print("  " + a)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
