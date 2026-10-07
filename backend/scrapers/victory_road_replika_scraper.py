#!/usr/bin/env python3
"""Victory Roads eigene Replika-Sammlung.

Neben dem VGCPastes-Google-Sheet (backend/scrapers/champions_replica_scraper.py)
fuehrt Victory Road unter /champions-replica/ eine eigene, kuratierte Liste
von Teams mit Replika-Code. Gemessen am 24.09.2026: 128 Eintraege in sieben
Tabellen, davon 104 mit Code und 107 mit Paste-Link.

BEIDE Quellen stehen in der Oberflaeche getrennt und namentlich da. Sie
werden NICHT zu einer Liste verschmolzen: wer wissen will, woher ein Team
kommt, soll es sehen koennen.

STAND 07.10.2026: Die Seite hat ihre Sammlung getauscht — 56 Eintraege mit
Code, aber nur 4 mit vrpastes-Link. Eintraege ohne lesbare Teamliste stehen
nur als Code in `_meta.ohne_paste_codes`; Teams, die von der Seite
verschwinden, bleiben BEHALTEN_TAGE Tage im Bestand (`nicht_mehr_auf_quelle`).
Eine Seite ohne Paste-Links macht den Lauf NICHT rot — siehe `baue()`.

AUSGELASSEN werden die Eintraege ohne Code. Es sind alte Teams aus
Scarlet/Violet, die auf pokepast.es statt auf vrpastes.com zeigen und
nicht in den Champions-Bestand gehoeren.

Aufruf:
  python backend/scrapers/victory_road_replika_scraper.py
  python backend/scrapers/victory_road_replika_scraper.py --dry-run
"""

import argparse
import json
import logging
import os
import re
import sys
from datetime import date, timedelta
from typing import Dict, List, Optional

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_CORE_DIR = os.path.join(_SCRIPT_DIR, '..', 'core')
if _CORE_DIR not in sys.path:
    sys.path.insert(0, _CORE_DIR)

from card_scraper_shared import (            # noqa: E402
    setup_console_encoding, setup_logging, safe_fetch_html,
)
from victory_road_major_scraper import (     # noqa: E402
    paste_id, lies_paste, hole_paste, behalte_bestand,
)

ROOT = os.path.abspath(os.path.join(_SCRIPT_DIR, "..", ".."))

# ── WOHIN DAS ERGEBNIS GEHOERT ───────────────────────────────────────
#
# NICHT get_data_dir(). Das loest auf backend/core/data auf — den
# gitignoreten Saatordner. Dorthin geschrieben landet die Datei NIE im
# Repo: der Wochenlauf kopiert von dort nur eine VON HAND GEPFLEGTE
# Liste zurueck nach data/, und wer nicht darin steht, faellt mit dem
# Runner weg.
#
# GEMESSEN 25.09.2026, nachdem genau das passiert ist: die Wochenlaeufe
# 151 und 152 liefen gruen durch, beide Scraper meldeten
# `status: OK` im Herzschlag — und keine der beiden Dateien war im
# Repo. Ein Lauf, der gruen ist und nichts liefert, ist schlimmer als
# einer, der rot wird.
#
# Diese beiden Scraper LESEN nichts aus dem Saatordner (sie holen alles
# aus dem Netz), also gibt es keinen Grund, dorthin zu schreiben. Das
# Ergebnis gehoert in den Projektstamm, wo `git add` es findet.
AUSGABE_DIR = os.path.join(ROOT, "data")


setup_console_encoding()
logger = setup_logging("victory_road_replika_scraper")

QUELLE_URL = "https://victoryroad.pro/champions-replica/"

# Untergrenze gegen ein leeres Bestehen — `>=`, damit Zuwachs kein
# Fehler ist. Gemessen am 24.09.2026 waren es 104 Eintraege mit Code.
MINDEST_EINTRAEGE = 20


def _kopf_index(zeile) -> Dict[str, int]:
    return {" ".join(c.get_text(" ").split()).lower(): i
            for i, c in enumerate(zeile.find_all(["th", "td"]))}


def lies_sammlung(html: str, nur_mit_paste: bool = True) -> List[Dict]:
    """Alle Eintraege MIT Replika-Code.

    Eine Tabelle zaehlt, wenn sie "player" und "code" fuehrt — die
    Bedeutung der Spalten, nicht ihre Reihenfolge und nicht eine
    CSS-Klasse. Aendert Victory Road das Aussehen, faellt das nicht um.

    `nur_mit_paste=False` liefert AUCH Eintraege, deren Paste-Spalte leer
    ist oder auf pokepast.es zeigt (`paste_id` ist dann leer). Seit dem
    07.10.2026 sind das die meisten: 52 von 56 Eintraegen mit Code tragen
    keinen vrpastes-Link mehr.
    """
    from bs4 import BeautifulSoup
    suppe = BeautifulSoup(html, "html.parser")
    raus: List[Dict] = []
    for tab in suppe.find_all("table"):
        zeilen = tab.find_all("tr")
        if not zeilen:
            continue
        idx = _kopf_index(zeilen[0])
        if "player" not in idx or "code" not in idx:
            continue
        for zeile in zeilen[1:]:
            zellen = zeile.find_all(["td", "th"])

            def zelle(name: str):
                i = idx.get(name)
                return zellen[i] if i is not None and i < len(zellen) else None

            c_code = zelle("code")
            code = "".join(c_code.get_text("\n").split()) if c_code else ""
            if not code:
                continue                      # alte SV-Teams ohne Code

            c_paste = zelle("paste")
            a = c_paste.find("a", href=True) if c_paste else None
            url = a["href"] if a else ""
            pid = paste_id(url) or ""
            if not pid and nur_mit_paste:
                continue                      # pokepast.es statt vrpastes

            c_spieler, c_erg, c_team = zelle("player"), zelle("best results"), zelle("team")
            team = ([img.get("alt", "").strip()
                     for img in c_team.find_all("img") if img.get("alt", "").strip()]
                    if c_team else [])
            raus.append({
                "trainer": " ".join(c_spieler.get_text(" ").split()) if c_spieler else "",
                "ergebnis": " ".join(c_erg.get_text(" ").split()) if c_erg else "",
                "replica_code": code,
                "ots_url": url,
                "paste_id": pid,
                "team_vorschau": team,
            })
    return raus


# So lange bleibt ein Team im Bestand, nachdem es von Victory Roads Seite
# verschwunden ist. Am 07.10.2026 hat die Seite ihre Sammlung getauscht:
# von 84 gespeicherten Teams standen noch 4 dort. Ohne Frist waeren 80
# Teams von einem Tag auf den anderen weg gewesen; ohne Ende bliebe jedes
# Team fuer immer. Die Frist ist eine ENTSCHEIDUNG, keine Messung — wie
# lange ein Replika-Code im Spiel gueltig bleibt, ist NICHT GEPRUEFT.
BEHALTEN_TAGE = 28


def lade_bestand(pfad: str) -> Dict:
    try:
        with open(pfad, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def _team_aus(e: Dict, paste: Dict) -> Dict:
    return {
        "rank": 0,
        "trainer": e["trainer"],
        "ergebnis": e["ergebnis"],
        "team_name": paste["titel"] or e["ergebnis"] or e["trainer"],
        "format": paste["format"],
        "replica_code": e["replica_code"],
        "ots_url": e["ots_url"],
        "paste_id": e["paste_id"],
        "team_vorschau": e["team_vorschau"],
        "pokemon": paste["pokemon"],
        "hat_ev": False,
        "quelle": "victory-road-replika",
    }


def baue(hole_html=safe_fetch_html, hole_paste_fn=hole_paste,
         grenze: Optional[int] = None,
         mindest: int = MINDEST_EINTRAEGE,
         bestand: Optional[Dict] = None,
         heute: Optional[date] = None) -> Dict:
    """Die Sammlung der Seite, abgeglichen mit dem Bestand.

    `mindest` ist die Untergrenze gegen ein leeres Bestehen: so viele
    Eintraege MIT CODE muss die Seite hergeben, sonst hat sie ihren Aufbau
    geaendert. Sie steht als Parameter da, damit eine Zusicherung den
    Zusammenbau an einer KLEINEN Probe pruefen kann, ohne die Grenze in
    Produktion zu senken. Wer sie im Lauf herabsetzt, nimmt dem Scraper
    seinen Schutz — deshalb ruft main() ohne dieses Argument auf.

    GEMESSEN 07.10.2026: die Seite fuehrt 56 Eintraege mit Code, aber nur
    4 davon einen vrpastes-Link (am 24.09. waren es 104 mit Code und 107
    mit Link). Die Untergrenze zaehlt deshalb den CODE, nicht den Link —
    eine Seite ohne Paste-Links ist nicht kaputt, nur ohne Teamlisten.
    Eintraege, deren Teamliste wir kennen (Bestand, gleicher Replika-Code),
    behalten sie; die uebrigen stehen mit ihrem Code in `_meta.ohne_paste`,
    damit die Luecke benannt und datiert ist.
    """
    heute = heute or date.today()
    alle = lies_sammlung(hole_html(QUELLE_URL), nur_mit_paste=False)
    if len(alle) < mindest:
        raise RuntimeError(
            "Die Replika-Sammlung gibt nur %d Eintraege mit Code her "
            "(erwartet mindestens %d) — die Seite hat vermutlich ihren "
            "Aufbau geaendert." % (len(alle), mindest))

    bestand = bestand or {}
    bekannt = {t["replica_code"]: t for t in bestand.get("teams", [])
               if t.get("replica_code")}
    stand = (bestand.get("_meta") or {}).get("erzeugt_am")
    live_codes = {e["replica_code"] for e in alle}

    teams, ohne_paste = [], []
    for e in (alle if grenze is None else alle[:grenze]):
        team = None
        if e["paste_id"]:
            roh = hole_paste_fn(e["paste_id"])
            paste = lies_paste(roh) if roh else None
            if paste and paste["pokemon"]:
                team = _team_aus(e, paste)
        if team is None and e["replica_code"] in bekannt:
            team = dict(bekannt[e["replica_code"]])   # Teamliste kennen wir schon
        if team is None:
            ohne_paste.append(e["replica_code"])
            continue
        team["zuletzt_gesehen"] = heute.isoformat()
        team.pop("nicht_mehr_auf_quelle", None)
        teams.append(team)

    behalten, entfallen = [], 0
    for code, t in bekannt.items():
        if code in live_codes:
            continue
        gesehen = t.get("zuletzt_gesehen") or stand
        try:
            alter = (heute - date.fromisoformat(gesehen)).days
        except (TypeError, ValueError):
            alter = 0     # ohne Datum: nicht stillschweigend wegwerfen
        if alter <= BEHALTEN_TAGE:
            t2 = dict(t)
            t2["zuletzt_gesehen"] = gesehen or heute.isoformat()
            t2["nicht_mehr_auf_quelle"] = True
            behalten.append(t2)
        else:
            entfallen += 1
    live_n = len(teams)
    teams += behalten
    for i, t in enumerate(teams, 1):
        t["rank"] = i

    return {
        "_meta": {
            "title": "Victory Road — Replika-Sammlung",
            "erzeugt_am": heute.isoformat(),
            "quelle": QUELLE_URL,
            "eintraege_mit_code": len(alle),
            "team_count": len(teams),
            "davon_auf_der_seite": live_n,
            "behalten_vom_bestand": len(behalten),
            "entfallen_nach_frist": entfallen,
            "behalten_tage": BEHALTEN_TAGE,
            "ohne_paste": len(ohne_paste),
            "ohne_paste_codes": ohne_paste,
            "ohne_paste_stand": heute.isoformat(),
            "hat_ev": False,
            "hinweis": ("Die verlinkten Listen sind Open Team Lists und fuehren "
                        "keine EVs und IVs."),
        },
        "teams": teams,
    }


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--grenze", type=int, default=None,
                   help="hoechstens so viele Eintraege anreichern")
    args = p.parse_args()
    logging.getLogger().setLevel(logging.INFO)

    ziel = os.path.join(AUSGABE_DIR, "victory_road_replika_teams.json")
    try:
        daten = baue(grenze=args.grenze, bestand=lade_bestand(ziel))
    except RuntimeError as e:          # Seite umgebaut
        return behalte_bestand(ziel, str(e), trocken=args.dry_run)
    m = daten["_meta"]
    logger.info("%d Eintraege mit Code, %d Teams (%d auf der Seite, %d behalten, "
                "%d nach Frist entfallen), %d ohne Paste",
                m["eintraege_mit_code"], m["team_count"], m["davon_auf_der_seite"],
                m["behalten_vom_bestand"], m["entfallen_nach_frist"], m["ohne_paste"])
    if m["ohne_paste"]:
        print("::warning::Victory Road Replika: %d von %d Eintraegen mit Code haben keine "
              "lesbare Teamliste (kein vrpastes-Link) und stehen nur als Code in "
              "_meta.ohne_paste_codes." % (m["ohne_paste"], m["eintraege_mit_code"]))
    if not daten["teams"]:
        return behalte_bestand(ziel, "Kein einziges Team gezogen und kein Bestand zum Behalten",
                               trocken=args.dry_run)
    if args.dry_run:
        return 0
    os.makedirs(AUSGABE_DIR, exist_ok=True)
    with open(ziel, "w", encoding="utf-8") as f:
        json.dump(daten, f, ensure_ascii=False, indent=1)
    logger.info("%d Teams -> %s", len(daten["teams"]), ziel)
    return 0


if __name__ == "__main__":
    sys.exit(main())
