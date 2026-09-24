#!/usr/bin/env python3
"""Victory Roads eigene Replika-Sammlung.

Neben dem VGCPastes-Google-Sheet (backend/scrapers/champions_replica_scraper.py)
fuehrt Victory Road unter /champions-replica/ eine eigene, kuratierte Liste
von Teams mit Replika-Code. Gemessen am 24.09.2026: 128 Eintraege in sieben
Tabellen, davon 104 mit Code und 107 mit Paste-Link.

BEIDE Quellen stehen in der Oberflaeche getrennt und namentlich da. Sie
werden NICHT zu einer Liste verschmolzen: wer wissen will, woher ein Team
kommt, soll es sehen koennen.

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
from datetime import date
from typing import Dict, List, Optional

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_CORE_DIR = os.path.join(_SCRIPT_DIR, '..', 'core')
if _CORE_DIR not in sys.path:
    sys.path.insert(0, _CORE_DIR)

from card_scraper_shared import (            # noqa: E402
    setup_console_encoding, setup_logging, get_data_dir, safe_fetch_html,
)
from victory_road_major_scraper import (     # noqa: E402
    paste_id, lies_paste, hole_paste,
)

setup_console_encoding()
logger = setup_logging("victory_road_replika_scraper")

QUELLE_URL = "https://victoryroad.pro/champions-replica/"

# Untergrenze gegen ein leeres Bestehen — `>=`, damit Zuwachs kein
# Fehler ist. Gemessen am 24.09.2026 waren es 104 Eintraege mit Code.
MINDEST_EINTRAEGE = 20


def _kopf_index(zeile) -> Dict[str, int]:
    return {" ".join(c.get_text(" ").split()).lower(): i
            for i, c in enumerate(zeile.find_all(["th", "td"]))}


def lies_sammlung(html: str) -> List[Dict]:
    """Alle Eintraege MIT Replika-Code.

    Eine Tabelle zaehlt, wenn sie "player" und "code" fuehrt — die
    Bedeutung der Spalten, nicht ihre Reihenfolge und nicht eine
    CSS-Klasse. Aendert Victory Road das Aussehen, faellt das nicht um.
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
            pid = paste_id(url)
            if not pid:
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


def baue(hole_html=safe_fetch_html, hole_paste_fn=hole_paste,
         grenze: Optional[int] = None,
         mindest: int = MINDEST_EINTRAEGE) -> Dict:
    """`mindest` ist die Untergrenze gegen ein leeres Bestehen.

    Sie steht als Parameter da, damit eine Zusicherung den Zusammenbau an
    einer KLEINEN Probe pruefen kann, ohne die Grenze in Produktion zu
    senken. Wer sie im Lauf herabsetzt, nimmt dem Scraper seinen Schutz —
    deshalb ruft main() ohne dieses Argument auf.
    """
    eintraege = lies_sammlung(hole_html(QUELLE_URL))
    if len(eintraege) < mindest:
        raise RuntimeError(
            "Die Replika-Sammlung gibt nur %d Eintraege mit Code her "
            "(erwartet mindestens %d) — die Seite hat vermutlich ihren "
            "Aufbau geaendert." % (len(eintraege), mindest))

    teams = []
    for i, e in enumerate(eintraege if grenze is None else eintraege[:grenze], 1):
        roh = hole_paste_fn(e["paste_id"])
        if not roh:
            continue
        paste = lies_paste(roh)
        if not paste["pokemon"]:
            continue
        teams.append({
            "rank": len(teams) + 1,
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
        })

    return {
        "_meta": {
            "title": "Victory Road — Replika-Sammlung",
            "erzeugt_am": date.today().isoformat(),
            "quelle": QUELLE_URL,
            "eintraege_mit_code": len(eintraege),
            "team_count": len(teams),
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

    daten = baue(grenze=args.grenze)
    logger.info("%d Eintraege mit Code, %d Teams gezogen",
                daten["_meta"]["eintraege_mit_code"], daten["_meta"]["team_count"])
    if not daten["teams"]:
        logger.error("Kein einziges Team gezogen — es wird NICHTS geschrieben.")
        return 1
    if args.dry_run:
        return 0
    ziel = os.path.join(get_data_dir(), "victory_road_replika_teams.json")
    with open(ziel, "w", encoding="utf-8") as f:
        json.dump(daten, f, ensure_ascii=False, indent=1)
    logger.info("%d Teams -> %s", len(daten["teams"]), ziel)
    return 0


if __name__ == "__main__":
    sys.exit(main())
