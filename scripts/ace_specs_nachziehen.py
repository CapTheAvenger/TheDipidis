#!/usr/bin/env python3
"""Zieht data/ace_specs.json aus der Quelle nach — automatisch, im Wochenlauf.

BESTELLUNG (Hausi, 30.09.2026, DA-22): „Falls irgendwann mal neue ACE
SPECs kommen, dann muessen die ja korrekt erkannt werden."

Bis hierhin wurde die Liste von Hand gepflegt (Stand 18.02.2026, zuletzt
am 22.09.2026 von Hand gegengeprueft). Ein neues Set mit einer ACE SPEC
haette sie unvollstaendig gemacht, ohne dass es jemand merkt: die Regel
in backend/core/ace_spec_regel.py liesse das Feld leer („unbekannt"), der
Deckbau im Frontend (window.isAceSpec liest dieselbe Datei) wuerde die
Karte zweimal zulassen.

QUELLE — gemessen am 30.09.2026 im Browser
------------------------------------------
    EN: limitlesstcg.com/cards?q=is:ace&display=list      46 Drucke, 39 Namen
    JP: limitlesstcg.com/cards/jp?q=is:ace&display=list   74 Drucke

Beide Seiten sind Tabellen: Spalte 1 Set, 2 Nummer, 3 Name; 50 Zeilen je
Seite, weiter mit &page=N, eine leere Seite beendet die Liste.

WIE EIN NAME IN DIE LISTE KOMMT — nie geraten
---------------------------------------------
  * EN-Drucke: der Name steht auf der Quellseite. Das ist der offizielle
    englische Name, derselbe, den unsere Daten tragen.
  * JP-Drucke: die Quellseite nennt japanische Namen, und ihre
    Uebersetzung (&translate=en) ist NICHT der englische Kartenname
    („Fishing Rod Max" statt „Max Rod") und laesst obendrein 13 Drucke
    weg (gemessen 30.09.2026). Deshalb wird der Name NICHT von dort
    genommen, sondern ueber (Set, Nummer) aus unserer eigenen
    data/japanese_cards_database.csv geholt — also genau der Name, unter
    dem die Karte in den City-League-Daten steht. Nie ueber den Namen
    verbunden (CLAUDE.md).
  * Ein JP-Name, den die englische Kartendatenbank als GEWOEHNLICHE Karte
    fuehrt (kein Druck davon ist eine EN-ACE-SPEC), wird nicht
    aufgenommen, sondern gemeldet: dann meinen zwei Karten denselben
    Namen, und ein „Yes" traefe die falsche.

WAS NICHT PASSIERT
------------------
  * Es wird nichts entfernt. Eine Karte hoert nicht auf, ACE SPEC zu
    sein; fehlt ein Name in der Quelle, wird das gemeldet.
  * Liefert die Quelle nichts, zu wenig oder etwas, das nicht wie die
    Liste aussieht (weniger als 90 % der bekannten Namen), wird NICHTS
    geschrieben — eine geaenderte Seite darf keine Liste aus Unsinn
    erzeugen. Das ist eine benannte Luecke (::warning::), kein Fehler,
    der den Wochenlauf anhaelt.
  * Aendert sich nichts, wird die Datei nicht angefasst.

Aufruf:  python3 scripts/ace_specs_nachziehen.py [--trocken]
Rueckgabe 0 auch bei unerreichbarer Quelle (die Warnung steht auf der
Laufseite); 2 nur, wenn die eigene Datei nicht lesbar ist.
"""

import argparse
import csv
import datetime as dt
import json
import os
import re
import sys

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATEN = os.path.join(WURZEL, "data")
LISTE = os.path.join(DATEN, "ace_specs.json")
JP_DB = os.path.join(DATEN, "japanese_cards_database.csv")
EN_DB = os.path.join(DATEN, "all_cards_database.csv")

QUELLE_EN = "https://limitlesstcg.com/cards?q=is%3Aace&display=list"
QUELLE_JP = "https://limitlesstcg.com/cards/jp?q=is%3Aace&display=list"
MAX_SEITEN = 20
NACHTRAG_KENNUNG = "scripts/ace_specs_nachziehen.py"
NACHTRAG_HINWEIS = ("NACHTRAG 30.09.2026 (DA-22) — SEITDEM AUTOMATISCH: "
                    "scripts/ace_specs_nachziehen.py zieht die Liste im Wochenlauf aus "
                    "limitlesstcg.com/cards?q=is:ace&display=list (EN) und /cards/jp (JP-Drucke "
                    "ueber Set und Nummer) nach; die Handpflege entfaellt. Es wird nur "
                    "aufgenommen, nie entfernt.")
MINDEST_ANTEIL = 0.9

_ZEILE = re.compile(r"<tr\b[^>]*>(.*?)</tr>", re.S | re.I)
_ZELLE = re.compile(r"<td\b[^>]*>(.*?)</td>", re.S | re.I)
_TAG = re.compile(r"<[^>]+>")


def _text(zelle):
    import html
    return re.sub(r"\s+", " ", html.unescape(_TAG.sub(" ", zelle))).strip()


def zeilen_der_seite(roh):
    """[(set, nummer, name)] aus einer Listenseite. Nur Zeilen mit
    Zellen — die Kopfzeile traegt <th>."""
    aus = []
    for z in _ZEILE.finditer(roh or ""):
        zellen = _ZELLE.findall(z.group(1))
        if len(zellen) < 3:
            continue
        s, n, name = (_text(zellen[0]), _text(zellen[1]), _text(zellen[2]))
        if s and n and name:
            aus.append((s, n, name))
    return aus


def _abruf_standard(url):
    sys.path.insert(0, os.path.join(WURZEL, "backend", "core"))
    from card_scraper_shared import safe_fetch_html  # noqa: E402
    return safe_fetch_html(url, timeout=20, retries=2)


def alle_seiten(basis, abruf):
    """Alle Zeilen einer Suche. None, wenn schon die erste Seite fehlt —
    dann ist die Quelle nicht erreicht, nicht leer."""
    aus = []
    for seite in range(1, MAX_SEITEN + 1):
        url = basis if seite == 1 else "%s&page=%d" % (basis, seite)
        roh = abruf(url)
        if not roh:
            return None if seite == 1 else aus
        zeilen = zeilen_der_seite(roh)
        if not zeilen:
            return aus
        aus.extend(zeilen)
    return aus


def _schluessel(set_code, nummer):
    return "%s-%s" % (str(set_code).strip().upper(), str(nummer).strip().lstrip("0") or "0")


def _norm(name):
    return re.sub(r"\s+", " ", str(name or "").replace("’", "'")).strip().lower()


def lies_db(pfad, name_spalte):
    """(Set-Nummer) -> Name aus einer unserer Kartendatenbanken."""
    aus = {}
    if not os.path.exists(pfad):
        return aus
    with open(pfad, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            name = (r.get(name_spalte) or "").strip()
            if name and r.get("set") and r.get("number"):
                aus[_schluessel(r["set"], r["number"])] = name
    return aus


def rechne(alt, en, jp, jp_db, en_db):
    """Reine Rechnung ohne Abruf, damit sie ausgefuehrt geprueft werden
    kann. Gibt (neue Datei oder None, Meldungen)."""
    meldungen = []
    bekannt = [_norm(n) for n in alt.get("ace_specs") or []]
    bekannt_set = set(bekannt)

    if en is None:
        return None, ["::warning::ACE-SPEC-Liste NICHT nachgezogen: %s nicht erreicht "
                      "— die Liste bleibt auf ihrem Stand, neue ACE SPECs werden erst "
                      "beim naechsten Lauf erkannt." % QUELLE_EN]
    en_namen = {_norm(n) for _, _, n in en}
    # Vergleichsmenge: die Namen, die beim letzten Mal aus der EN-Quelle
    # kamen — die nur ueber JP-Drucke aufgenommenen stehen dort nie.
    nur_jp_alt = {_norm(n) for n in (alt.get("_geprueft") or {}).get("nur_aus_jp") or []}
    bekannt_en = bekannt_set - nur_jp_alt
    if bekannt_en and len(en_namen & bekannt_en) < MINDEST_ANTEIL * len(bekannt_en):
        return None, ["::warning::ACE-SPEC-Liste NICHT nachgezogen: die Quelle liefert "
                      "%d Namen, davon nur %d der %d bekannten — sieht nicht wie die "
                      "Liste aus (Seitenaufbau geaendert?). Nichts geschrieben."
                      % (len(en_namen), len(en_namen & bekannt_en), len(bekannt_en))]

    drucke_en = sorted({_schluessel(s, n) for s, n, _ in en})
    drucke_jp = sorted({_schluessel(s, n) for s, n, _ in (jp or [])})
    if jp is None:
        meldungen.append("::warning::JP-Liste der ACE SPECs nicht erreicht (%s) — nur "
                         "die englischen Drucke nachgezogen." % QUELLE_JP)
        drucke_jp = sorted(set((alt.get("drucke") or {}).get("jp") or []))

    # Gewoehnliche EN-Karten: Name -> gibt es einen Druck, der KEINE ACE SPEC ist?
    ace_drucke_en = set(drucke_en)
    gewoehnlich = {_norm(n) for k, n in en_db.items() if k not in ace_drucke_en}
    gewoehnlich -= en_namen

    neue_namen = set(en_namen)
    jp_namen, fremd, luecke = set(), [], []
    jp_sets = {k.split("-")[0] for k in jp_db}
    for k in drucke_jp:
        name = jp_db.get(k)
        if not name:
            if k.split("-")[0] in jp_sets:
                luecke.append(k)
            continue
        n = _norm(name)
        if n in gewoehnlich and n not in bekannt_set:
            fremd.append("%s (%s)" % (name, k))
            continue
        jp_namen.add(n)
    neue_namen |= jp_namen

    if luecke:
        meldungen.append("::warning::%d JP-ACE-SPEC-Drucke fehlen in "
                         "japanese_cards_database.csv, obwohl ihr Set dort gefuehrt wird: %s"
                         % (len(luecke), ", ".join(luecke[:10])))
    if fremd:
        meldungen.append("::warning::NICHT aufgenommen — der Name gehoert in der englischen "
                         "Kartendatenbank einer gewoehnlichen Karte: %s" % ", ".join(fremd))
    fehlt_in_quelle = sorted(bekannt_set - en_namen - jp_namen)
    if fehlt_in_quelle:
        meldungen.append("::notice::%d Namen der Liste fuehrt die Quelle nicht (mehr) — "
                         "bleiben stehen: %s" % (len(fehlt_in_quelle), ", ".join(fehlt_in_quelle)))

    namen = sorted(bekannt_set | neue_namen)
    dazu = sorted(set(namen) - bekannt_set)
    alte_drucke = alt.get("drucke") or {}
    if (not dazu and alte_drucke.get("en") == drucke_en
            and alte_drucke.get("jp") == drucke_jp):
        meldungen.append("ACE-SPEC-Liste aktuell: %d Namen, Quelle %d EN- und %d JP-Drucke — "
                         "nichts neu." % (len(namen), len(drucke_en), len(drucke_jp)))
        return None, meldungen

    heute = dt.date.today().isoformat()
    neu = dict(alt)
    neu["ace_specs"] = namen
    neu["total_count"] = len(namen)
    neu["source"] = QUELLE_EN
    neu["drucke"] = {"en": drucke_en, "jp": drucke_jp}
    if dazu:
        neu["timestamp"] = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    geprueft = dict(alt.get("_geprueft") or {})
    geprueft.update({
        "am": heute,
        "gegen": QUELLE_EN,
        "quelle_drucke": len(drucke_en),
        "liste_namen": len(namen),
        "fehlend": len(en_namen - set(namen)),
        "ueberzaehlig": len(set(namen) - en_namen - jp_namen),
        "jp_drucke": len(drucke_jp),
        "nur_aus_jp": sorted(jp_namen - en_namen),
        "wie": "automatisch, scripts/ace_specs_nachziehen.py im Wochenlauf",
    })
    geprueft[heute] = ("%d EN-Drucke / %d JP-Drucke gegen die Quelle, %d Namen — automatisch"
                       % (len(drucke_en), len(drucke_jp), len(namen)))
    neu["_geprueft"] = geprueft
    if NACHTRAG_KENNUNG not in str(neu.get("_hinweis") or ""):
        neu["_hinweis"] = (str(neu.get("_hinweis") or "") + " " + NACHTRAG_HINWEIS).strip()
    if dazu:
        meldungen.append("::notice::ACE-SPEC-Liste nachgezogen: %d neue Namen — %s"
                         % (len(dazu), ", ".join(dazu)))
    else:
        meldungen.append("ACE-SPEC-Liste: Drucke fortgeschrieben (EN %d, JP %d), keine neuen Namen."
                         % (len(drucke_en), len(drucke_jp)))
    return neu, meldungen


def main(argv=None, abruf=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--trocken", action="store_true", help="nichts schreiben, nur berichten")
    args = ap.parse_args(argv)
    abruf = abruf or _abruf_standard
    try:
        with open(LISTE, encoding="utf-8") as f:
            alt = json.load(f)
    except (OSError, ValueError) as e:
        print("::error::%s nicht lesbar: %s" % (LISTE, e))
        return 2

    en = alle_seiten(QUELLE_EN, abruf)
    jp = alle_seiten(QUELLE_JP, abruf) if en is not None else None
    neu, meldungen = rechne(alt, en, jp, lies_db(JP_DB, "name"), lies_db(EN_DB, "name_en"))
    for m in meldungen:
        print(m)
    if neu is None or args.trocken:
        return 0
    with open(LISTE, "w", encoding="utf-8") as f:
        json.dump(neu, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("data/ace_specs.json geschrieben (%d Namen)." % neu["total_count"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
