#!/usr/bin/env python3
"""Victory-Road-Scraper fuer das letzte Major (oder die letzten Majors).

WOZU
----
Der Champions-Reiter zeigte bisher nur die Replika-Codes aus dem
VGCPastes-Google-Sheet. Wer das Siegerteam des letzten Regionals
nachbauen wollte, musste es sich woanders im Netz suchen. Das holt
dieser Scraper auf die eigene Seite.

WAS GEMESSEN WURDE (24.09.2026, an Baltimore)
---------------------------------------------
* victoryroad.pro liefert fertiges HTML — `requests` + BeautifulSoup
  reichen, kein Browser noetig.
* Die Standings stehen in <table>-Bloecken mit der Kopfzeile
  #  Swiss  Flag  Player  Prize  Team  OTS  Replica
* Baltimore hatte 155 Masters-Platzierungen. Davon trugen
  **16 einen Replika-Code**, aber **155 einen OTS-Link**.
  Ein Replika-Code ist also die Ausnahme, die Teamliste die Regel —
  deshalb haengt dieser Scraper am OTS-Link und nimmt den Code mit,
  wo es einen gibt.
* vrpastes.com rendert im Browser; das ausgelieferte HTML enthaelt die
  Teamdaten NICHT. Die Seite holt sie aus einer offenen JSON-Schnitt-
  stelle, und die kann Deutsch:
      https://vrpaste-backend.vercel.app/api/paste/<id>?lang=german
  Sie liefert je Pokemon Art, Item, Faehigkeit, vier Attacken, Wesen,
  Typen und Basiswerte — jeweils englisch UND uebersetzt.

WAS SIE NICHT LIEFERT
---------------------
**Keine EVs und keine IVs.** Eine Open Team List blendet sie aus; die
Felder fehlen in der Antwort, sie sind nicht etwa leer. Jedes Team aus
dieser Quelle traegt deshalb `hat_ev: false`, und die Oberflaeche sagt
das hin. Geschaetzte oder "uebliche" Werte werden NICHT ergaenzt.

Aufruf:
  python backend/scrapers/victory_road_major_scraper.py
  python backend/scrapers/victory_road_major_scraper.py --tiefe 32
  python backend/scrapers/victory_road_major_scraper.py --dry-run
"""

import argparse
import json
import logging
import os
import re
import sys
import time
from datetime import date, datetime
from typing import Dict, List, Optional, Tuple

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_CORE_DIR = os.path.join(_SCRIPT_DIR, '..', 'core')
if _CORE_DIR not in sys.path:
    sys.path.insert(0, _CORE_DIR)

from card_scraper_shared import (            # noqa: E402
    setup_console_encoding,
    setup_logging,
    get_data_dir,
    safe_fetch_html,
)

setup_console_encoding()
logger = setup_logging("victory_road_major_scraper")

ROOT = os.path.abspath(os.path.join(_SCRIPT_DIR, '..', '..'))

KALENDER_URL = "https://victoryroad.pro/2027-season-calendar/"
PASTE_API = "https://vrpaste-backend.vercel.app/api/paste/{id}?lang=german"

# Wie viele Platzierungen je Turnier angereichert werden. Jede kostet
# einen Aufruf der Paste-Schnittstelle.
TIEFE_VORGABE = 32

# Untergrenzen gegen ein leeres Bestehen. Sie sind `>=`, nicht `==`:
# ein Turnier darf wachsen, verlieren darf es nichts.
MINDEST_TURNIERE_IM_KALENDER = 5
MINDEST_PLAETZE_JE_TURNIER = 8


# ── Kalender ─────────────────────────────────────────────────────────

MONATE = {m: i + 1 for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun",
     "jul", "aug", "sep", "oct", "nov", "dec"])}

# "19–20 Sep 2026", "3–4 Oct 2026", "31 Oct–1 Nov 2026", "5 Dec 2026".
# Der Trenner ist ein EN DASH (U+2013), kommt aber auch als "-" vor.
_TRENNER = "[–—-]"


def _monat(text: str) -> Optional[int]:
    return MONATE.get(text.strip().lower()[:3])


def datum_spanne(roh: str) -> Optional[Tuple[date, date]]:
    """Aus der Datumszelle Beginn und Ende lesen.

    Gibt None zurueck, wenn dort kein Datum steht ("TBD") — das ist ein
    normaler Zustand im Kalender, kein Fehler.
    """
    t = " ".join(str(roh or "").split())
    if not t or "tbd" in t.lower():
        return None

    # Fall 1: Monat und Jahr stehen nur einmal — "19–20 Sep 2026"
    m = re.match(r"^(\d{1,2})\s*%s\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$" % _TRENNER, t)
    if m:
        mon = _monat(m.group(3))
        if not mon:
            return None
        jahr = int(m.group(4))
        return (date(jahr, mon, int(m.group(1))), date(jahr, mon, int(m.group(2))))

    # Fall 2: der Zeitraum laeuft ueber einen Monatswechsel —
    # "31 Oct–1 Nov 2026"
    m = re.match(r"^(\d{1,2})\s+([A-Za-z]+)\s*%s\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$"
                 % _TRENNER, t)
    if m:
        m1, m2 = _monat(m.group(2)), _monat(m.group(4))
        if not (m1 and m2):
            return None
        jahr = int(m.group(5))
        # Ein Jahreswechsel innerhalb der Spanne: Dez -> Jan
        j1 = jahr - 1 if (m1 == 12 and m2 == 1) else jahr
        return (date(j1, m1, int(m.group(1))), date(jahr, m2, int(m.group(3))))

    # Fall 3: ein einzelner Tag — "5 Dec 2026"
    m = re.match(r"^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$", t)
    if m:
        mon = _monat(m.group(2))
        if not mon:
            return None
        d = date(int(m.group(3)), mon, int(m.group(1)))
        return (d, d)

    return None


def _ist_standings_kopf(zeile) -> bool:
    """Traegt diese Kopfzeile die Spalten einer Platzierungstabelle?

    Geprueft wird die BEDEUTUNG der Spalten, nicht eine CSS-Klasse:
    eine Tabelle zaehlt, wenn sie sowohl "Player" als auch "OTS" fuehrt.
    Dreht Victory Road sein Aussehen, faellt das hier nicht um.
    """
    koepfe = [" ".join(c.get_text(" ").split()).lower()
              for c in zeile.find_all(["th", "td"])]
    return "player" in koepfe and "ots" in koepfe


def _spaltenindex(zeile) -> Dict[str, int]:
    idx = {}
    for i, c in enumerate(zeile.find_all(["th", "td"])):
        idx[" ".join(c.get_text(" ").split()).lower()] = i
    return idx


def lies_kalender(html: str) -> List[Dict]:
    """Alle Kalenderzeilen mit Datum, Name, Link und Format."""
    from bs4 import BeautifulSoup
    suppe = BeautifulSoup(html, "html.parser")
    eintraege = []
    for tab in suppe.find_all("table"):
        zeilen = tab.find_all("tr")
        if not zeilen:
            continue
        kopf = [" ".join(c.get_text(" ").split()).lower()
                for c in zeilen[0].find_all(["th", "td"])]
        if "date" not in kopf or "event" not in kopf:
            continue
        i_datum, i_event = kopf.index("date"), kopf.index("event")
        i_sieger = kopf.index("winner") if "winner" in kopf else None
        i_format = kopf.index("format") if "format" in kopf else None
        for zeile in zeilen[1:]:
            zellen = zeile.find_all(["td", "th"])
            if len(zellen) <= max(i_datum, i_event):
                continue
            spanne = datum_spanne(zellen[i_datum].get_text(" "))
            a = zellen[i_event].find("a", href=True)
            eintraege.append({
                "name": " ".join(zellen[i_event].get_text(" ").split()),
                "url": a["href"] if a else None,
                "beginn": spanne[0].isoformat() if spanne else None,
                "ende": spanne[1].isoformat() if spanne else None,
                "sieger": (" ".join(zellen[i_sieger].get_text(" ").split())
                           if i_sieger is not None and len(zellen) > i_sieger else ""),
                "format": (" ".join(zellen[i_format].get_text(" ").split())
                           if i_format is not None and len(zellen) > i_format else ""),
            })
    return eintraege


def letztes_wochenende(eintraege: List[Dict], heute: Optional[date] = None) -> List[Dict]:
    """Die Turniere des zuletzt GELAUFENEN Wochenendes.

    "Gelaufen" heisst hier: das Enddatum liegt nicht in der Zukunft und
    es gibt eine Turnierseite. Bewusst NICHT am Siegerfeld festgemacht —
    dort steht vor dem Turnier ein Aufruf ("Sign-ups are open!") und
    danach ein Name, und welche Aufrufe es gibt, entscheidet Victory
    Road, nicht wir.

    Mehrere Turniere am selben Wochenende sind der Normalfall, nicht
    die Ausnahme: am 19./20.09.2026 liefen Baltimore und Tangerang, am
    26./27.09.2026 laufen Frankfurt und Brisbane. Deshalb gibt diese
    Funktion eine LISTE zurueck, nie ein einzelnes Turnier.
    """
    heute = heute or date.today()
    gelaufen = [e for e in eintraege
                if e.get("ende") and e.get("url")
                and date.fromisoformat(e["ende"]) <= heute]
    if not gelaufen:
        return []
    juengstes = max(date.fromisoformat(e["ende"]) for e in gelaufen)
    # Alles, was HOECHSTENS EINEN TAG frueher endet, gehoert zum selben
    # Wochenende. Ein Tag Luft, weil ein zweitaegiges und ein eintaegiges
    # Turnier am selben Wochenende auf verschiedenen Enddaten stehen
    # koennen; zwei Tage waeren schon das naechste Wochenende.
    return [e for e in gelaufen
            if 0 <= (juengstes - date.fromisoformat(e["ende"])).days <= 1]


# ── Turnierseite ─────────────────────────────────────────────────────

_PASTE_ID = re.compile(r"vrpastes\.com/([A-Za-z0-9_-]+)", re.I)


def paste_id(url: str) -> Optional[str]:
    """Die Paste-Kennung aus einem OTS-Link.

    Gemessen 24.09.2026: der Link steht in ZWEI Schreibweisen da, mit
    und ohne "www." — beide muessen dieselbe Kennung ergeben.
    """
    if not url:
        return None
    m = _PASTE_ID.search(str(url))
    return m.group(1) if m else None


def lies_platzierungen(html: str) -> List[Dict]:
    """Alle Platzierungszeilen einer Turnierseite."""
    from bs4 import BeautifulSoup
    suppe = BeautifulSoup(html, "html.parser")
    raus: List[Dict] = []
    for tab in suppe.find_all("table"):
        zeilen = tab.find_all("tr")
        if not zeilen or not _ist_standings_kopf(zeilen[0]):
            continue
        idx = _spaltenindex(zeilen[0])
        for zeile in zeilen[1:]:
            zellen = zeile.find_all(["td", "th"])
            if len(zellen) < len(idx):
                continue

            def zelle(name: str):
                i = idx.get(name)
                return zellen[i] if i is not None and i < len(zellen) else None

            c_platz, c_spieler = zelle("#"), zelle("player")
            c_ots, c_rep = zelle("ots"), zelle("replica")
            if not (c_platz and c_spieler):
                continue
            platz_roh = " ".join(c_platz.get_text(" ").split())
            m = re.match(r"^(\d+)", platz_roh)
            if not m:
                continue

            # Der Spielername steht als <b>Name</b><br><a>Tag</a>.
            fett = c_spieler.find("b")
            name = " ".join((fett or c_spieler).get_text(" ").split())
            a_tag = c_spieler.find("a")
            tag = " ".join(a_tag.get_text(" ").split()) if a_tag else ""

            a_ots = c_ots.find("a", href=True) if c_ots else None
            ots = a_ots["href"] if a_ots else ""

            # Der Replika-Code steht ueber ZWEI Zeilen ("X9L10" / "UL8JM").
            # Zusammengefuehrt ohne Trennzeichen ergibt er den Code, den
            # das Spiel erwartet.
            rep = ""
            if c_rep:
                rep = "".join(c_rep.get_text("\n").split())

            c_team = zelle("team")
            team = ([img.get("alt", "").strip()
                     for img in c_team.find_all("img") if img.get("alt", "").strip()]
                    if c_team else [])
            c_swiss, c_preis = zelle("swiss"), zelle("prize")

            raus.append({
                "platz": int(m.group(1)),
                "swiss": " ".join(c_swiss.get_text(" ").split()) if c_swiss else "",
                "trainer": name,
                "trainer_tag": tag,
                "preis": " ".join(c_preis.get_text(" ").split()) if c_preis else "",
                "team_vorschau": team,
                "ots_url": ots,
                "paste_id": paste_id(ots),
                "replica_code": rep,
            })

    # Dieselbe Platzierung kann in Top-Cut UND Standings stehen. Der
    # erste Treffer gewinnt, danach nach Platz sortiert.
    gesehen, eindeutig = set(), []
    for z in raus:
        schluessel = (z["platz"], z["trainer"])
        if schluessel in gesehen:
            continue
        gesehen.add(schluessel)
        eindeutig.append(z)
    eindeutig.sort(key=lambda z: z["platz"])
    return eindeutig


# ── Paste-Schnittstelle ──────────────────────────────────────────────

def lies_paste(roh: Dict) -> Dict:
    """Eine Antwort der Paste-Schnittstelle in unser Schema uebersetzen.

    Englisch UND deutsch werden beide behalten: die Oberflaeche zeigt
    Deutsch, die Sprites und die Nutzungsdaten haengen am englischen
    Namen.
    """
    mons = []
    for m in (roh.get("teams") or []):
        attacken = m.get("movesWithTypes") or []
        mons.append({
            "name": m.get("species") or m.get("name") or "",
            "name_de": m.get("speciesTranslation") or "",
            "item": m.get("item") or "",
            "item_de": m.get("itemTranslation") or "",
            "ability": m.get("ability") or "",
            "ability_de": m.get("abilityTranslation") or "",
            "nature": m.get("nature") or "",
            "nature_de": m.get("natureTranslation") or "",
            "moves": list(m.get("moves") or []),
            "moves_de": [a.get("translation") or a.get("name") or "" for a in attacken],
            "typen": [t for t in (m.get("type1"), m.get("type2")) if t],
            "base_stats": m.get("baseStats") or {},
            # Eine Open Team List fuehrt keine EVs. Das Feld bleibt leer
            # und wird NICHT geschaetzt.
            "evs": "",
        })
    return {
        "titel": roh.get("title") or "",
        "format": roh.get("format") or "",
        "pokemon": mons,
    }


def hole_paste(pid: str, session=None, pause: float = 0.35) -> Optional[Dict]:
    import requests
    url = PASTE_API.format(id=pid)
    try:
        s = session or requests
        antwort = s.get(url, timeout=20,
                        headers={"User-Agent": "TheDipidis/1.0 (+https://thedipidis.app)"})
        if antwort.status_code != 200:
            logger.warning("Paste %s: HTTP %s", pid, antwort.status_code)
            return None
        return antwort.json()
    except Exception as e:                                   # noqa: BLE001
        logger.warning("Paste %s nicht lesbar: %s", pid, e)
        return None
    finally:
        time.sleep(pause)


# ── Zusammenbau ──────────────────────────────────────────────────────

def baue(tiefe: int = TIEFE_VORGABE, heute: Optional[date] = None,
         hole_html=safe_fetch_html, hole_paste_fn=hole_paste) -> Dict:
    kal_html = hole_html(KALENDER_URL)
    eintraege = lies_kalender(kal_html)
    if len(eintraege) < MINDEST_TURNIERE_IM_KALENDER:
        raise RuntimeError(
            "Der Kalender gibt nur %d Zeilen her (erwartet mindestens %d) — "
            "die Seite hat vermutlich ihren Aufbau geaendert."
            % (len(eintraege), MINDEST_TURNIERE_IM_KALENDER))

    majors = letztes_wochenende(eintraege, heute=heute)
    if not majors:
        raise RuntimeError("Im Kalender steht kein gelaufenes Turnier mit Seite.")

    turniere, teams = [], []
    for major in majors:
        try:
            html = hole_html(major["url"])
        except Exception as e:                               # noqa: BLE001
            logger.warning("Turnierseite %s nicht lesbar: %s", major["url"], e)
            continue
        plaetze = lies_platzierungen(html)
        if len(plaetze) < MINDEST_PLAETZE_JE_TURNIER:
            logger.warning("%s gibt nur %d Platzierungen her — uebersprungen.",
                           major["name"], len(plaetze))
            continue

        mit_code = sum(1 for p in plaetze if p["replica_code"])
        mit_ots = sum(1 for p in plaetze if p["paste_id"])
        gezogen = 0

        for p in plaetze[:tiefe]:
            if not p["paste_id"]:
                continue
            roh = hole_paste_fn(p["paste_id"])
            if not roh:
                continue
            paste = lies_paste(roh)
            if not paste["pokemon"]:
                continue
            gezogen += 1
            teams.append({
                "turnier": major["name"],
                "turnier_url": major["url"],
                "turnier_datum": major["ende"],
                "platz": p["platz"],
                "swiss": p["swiss"],
                "trainer": p["trainer"],
                "trainer_tag": p["trainer_tag"],
                "preis": p["preis"],
                "replica_code": p["replica_code"],
                "ots_url": p["ots_url"],
                "paste_id": p["paste_id"],
                "team_name": paste["titel"] or ("%s — Platz %d" % (major["name"], p["platz"])),
                "format": paste["format"] or major.get("format", ""),
                "team_vorschau": p["team_vorschau"],
                "pokemon": paste["pokemon"],
                # Die ehrliche Kennzeichnung: eine OTS-Liste hat keine EVs.
                "hat_ev": False,
                "quelle": "victory-road-major",
            })

        turniere.append({
            "name": major["name"],
            "url": major["url"],
            "beginn": major["beginn"],
            "ende": major["ende"],
            "format": major.get("format", ""),
            "sieger": major.get("sieger", ""),
            "platzierungen_gesamt": len(plaetze),
            "mit_replica_code": mit_code,
            "mit_ots": mit_ots,
            "gezogen": gezogen,
        })

    teams.sort(key=lambda t: (t["turnier"], t["platz"]))
    for i, t in enumerate(teams, 1):
        t["rank"] = i

    return {
        "_meta": {
            "title": "Letztes Major — Teams zum Nachbauen",
            "erzeugt_am": date.today().isoformat(),
            "quelle": KALENDER_URL,
            "quelle_pastes": "https://www.vrpastes.com/",
            "tiefe": tiefe,
            "turniere": turniere,
            "team_count": len(teams),
            "hat_ev": False,
            "hinweis": ("Open Team Lists fuehren keine EVs und IVs. Art, Item, "
                        "Faehigkeit, Attacken und Wesen stehen so da, wie sie "
                        "gespielt wurden; die Verteilung der Fleisspunkte nicht."),
        },
        "teams": teams,
    }


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--tiefe", type=int, default=TIEFE_VORGABE,
                   help="Platzierungen je Turnier (Vorgabe: %d)" % TIEFE_VORGABE)
    p.add_argument("--dry-run", action="store_true",
                   help="nur messen und berichten, nichts schreiben")
    args = p.parse_args()

    logging.getLogger().setLevel(logging.INFO)
    daten = baue(tiefe=args.tiefe)

    for t in daten["_meta"]["turniere"]:
        logger.info("%s (%s): %d Platzierungen, %d mit Replika-Code, %d gezogen",
                    t["name"], t["ende"], t["platzierungen_gesamt"],
                    t["mit_replica_code"], t["gezogen"])

    if not daten["teams"]:
        logger.error("Kein einziges Team gezogen — es wird NICHTS geschrieben.")
        return 1

    if args.dry_run:
        logger.info("dry-run: %d Teams, nichts geschrieben.", len(daten["teams"]))
        return 0

    ziel = os.path.join(get_data_dir(), "victory_road_major_teams.json")
    with open(ziel, "w", encoding="utf-8") as f:
        json.dump(daten, f, ensure_ascii=False, indent=1)
    logger.info("%d Teams -> %s", len(daten["teams"]), ziel)
    return 0


if __name__ == "__main__":
    sys.exit(main())
