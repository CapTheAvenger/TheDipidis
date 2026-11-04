#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Die Decklisten je Spieler liegen im Repo als Auszuege je Format und Monat.

WARUM (SC-45, 03./04.11.2026)
-----------------------------
`data/tournament_decklists_per_player.csv` war EINE Datei fuer alles: Majors
(limitlesstcg.com, `quelle=papier`) und Online-Listen (play.limitlesstcg.com,
`quelle=online`). Gemessen am 04.11.2026 auf main `33f3697`:

    470.777 Zeilen, 104.351.587 Byte (99,5 MiB)
    379.146 Zeilen online (80 %), 91.631 papier
    online: 2026-09 206.729 Zeilen, 2026-10 172.417 — rund 40 MB je Monat

Mit Puebla (0078) und Danzig (0079) wuchs sie auf 111.180.554 Byte = 106,51 MiB.
GitHubs pre-receive-Hook lehnt Dateien ueber 100 MiB ab; Wochenlauf #196
(41703978231) verwarf deshalb den ganzen Wochenstand, dreimal. Seit PR #1007
setzt `scripts/github_dateigrenze.py` so eine Datei vor dem Tor auf den Stand
von main zurueck — die Decklisten standen damit auf dem Stand bis Nizza.

Ein Auszug NUR je Format (wie `labs_tournament_decks_<META>.csv`) reicht nicht:
die Online-Listen eines viermonatigen Formats laegen allein ueber 100 MiB.
Deshalb der Schluessel **Format + Monat des Turnierdatums**:

    data/tournament_decklists_per_player_TEF-30C_2026-10.csv
    data/tournament_decklists_per_player_verzeichnis.json

Der Monat haelt jeden Auszug unter ~50 MB (der volle September 2026 inklusive
Majors: 206.729 Online-Zeilen + Papier). Zeilen ohne Format oder ohne lesbares
Datum landen in `_unsorted` bzw. `<META>_unbekannt` — benannt, nicht verloren.

WIE ES LAEUFT
-------------
Die Scraper (per_decklist_scraper.py, limitless_online_decklist_scraper.py)
kennen weiter nur den Monolithen `tournament_decklists_per_player.csv` in
ihrem Arbeitsordner (`backend/core/data/`, unverfolgt). Die Ablaeufe saeen die
Auszuege aus `data/` dorthin, rufen `zusammensetzen`, lassen die Scraper laufen,
rufen `aufteilen` und sichern nur die Auszuege plus Verzeichnis nach `data/`.
Dasselbe Muster wie `tournament_cards_data_cards_<META>.csv` (Prague-Fix).

Der Monolith liegt NICHT mehr in `data/` — er darf dort nie wieder liegen
(`tests/python/test_per_player_auszuege.py`), `github_dateigrenze.py` bleibt
als Waechter davor.

Leser rufen `pfade()` oder `zeilen()` und bekommen alle Auszuege in fester
Reihenfolge (Schluessel sortiert). Wer nur ein Format braucht, gibt `meta`
mit. Das Frontend liest das Verzeichnis (`js/deck-builder-consistency.js`).

SCHRUMPF-WAECHTER
-----------------
`aufteilen` vergleicht die Zeilen des Monolithen mit der Summe der Auszuege,
die schon im Zielordner liegen. Unter 0,5 (Festlegung WZ-38: Stopp) wird
nichts geschrieben und rc 2 zurueckgegeben, unter 0,75 gewarnt — ein halb
gesaeter Arbeitsordner (Prague, 12.05.2026) darf die Historie nicht
ueberschreiben. `--schrumpfen-erlauben` hebt die Sperre auf.
"""
from __future__ import annotations

import argparse
import csv
import glob
import json
import os
import re
import sys
from datetime import datetime, timezone

WURZEL = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
DATA = os.path.join(WURZEL, "data")

PRAEFIX = "tournament_decklists_per_player"
MONOLITH = PRAEFIX + ".csv"
VERZEICHNIS = PRAEFIX + "_verzeichnis.json"
UNSORTIERT = "_unsorted"
MONAT_UNBEKANNT = "unbekannt"

SCHRUMPF_WARNUNG = 0.75
SCHRUMPF_STOPP = 0.5

_MONAT_RE = re.compile(r"^(\d{4}-\d{2})")
_SCHLUESSEL_RE = re.compile(r"^(?P<meta>[^_]+(?:_[^_]+)*)_(?P<monat>\d{4}-\d{2}|" +
                            re.escape(MONAT_UNBEKANNT) + r")$")

HINWEIS = ("Welche Auszuege der Decklisten je Spieler es gibt: je Format und "
           "Monat des Turnierdatums (SC-45, GitHub-100-MiB-Grenze). Das Frontend "
           "fragt hier nach, statt Dateien zu raten; Python-Leser nehmen "
           "scripts/per_player_auszuege.py. Gebaut aus demselben Ordner, in dem "
           "die Auszuege liegen.")

csv.field_size_limit(min(sys.maxsize, 2 ** 31 - 1))


# ---------------------------------------------------------------------------
# Schluessel
# ---------------------------------------------------------------------------
def schluessel(zeile: dict) -> str:
    """Format + Monat einer Zeile. Ohne Format: `_unsorted` (ohne Monat, wie
    bei den Labs-Dateien). Ohne lesbares Datum: `<META>_unbekannt`."""
    meta = str(zeile.get("meta") or "").strip()
    if not meta:
        return UNSORTIERT
    m = _MONAT_RE.match(str(zeile.get("tournament_date") or "").strip())
    return f"{meta}_{m.group(1) if m else MONAT_UNBEKANNT}"


def meta_aus_schluessel(key: str) -> str:
    if key == UNSORTIERT:
        return ""
    m = _SCHLUESSEL_RE.match(key)
    return m.group("meta") if m else key


def monat_aus_schluessel(key: str) -> str:
    if key == UNSORTIERT:
        return ""
    m = _SCHLUESSEL_RE.match(key)
    return m.group("monat") if m else ""


def dateiname(key: str) -> str:
    return f"{PRAEFIX}_{key}.csv"


def _ist_auszug(name: str) -> bool:
    return (name.startswith(PRAEFIX + "_") and name.endswith(".csv")
            and name != MONOLITH)


def schluessel_aus_dateiname(name: str) -> str:
    return name[len(PRAEFIX) + 1:-len(".csv")]


# ---------------------------------------------------------------------------
# Lesen
# ---------------------------------------------------------------------------
def verzeichnis_lesen(ordner: str = DATA) -> dict | None:
    pfad = os.path.join(ordner, VERZEICHNIS)
    if not os.path.exists(pfad):
        return None
    with open(pfad, encoding="utf-8") as f:
        return json.load(f)


def pfade(ordner: str = DATA, meta: str | None = None) -> list[str]:
    """Die Auszuege in fester Reihenfolge (Schluessel sortiert). Massgeblich
    ist das Verzeichnis; fehlt es, zaehlt, was im Ordner liegt."""
    vz = verzeichnis_lesen(ordner)
    if vz and isinstance(vz.get("auszuege"), list):
        keys = [a["schluessel"] for a in vz["auszuege"] if a.get("schluessel")]
    else:
        keys = [schluessel_aus_dateiname(os.path.basename(p))
                for p in glob.glob(os.path.join(ordner, PRAEFIX + "_*.csv"))
                if _ist_auszug(os.path.basename(p))]
    keys = sorted(set(keys))
    if meta is not None:
        keys = [k for k in keys if meta_aus_schluessel(k) == meta]
    return [os.path.join(ordner, dateiname(k)) for k in keys
            if os.path.exists(os.path.join(ordner, dateiname(k)))]


def metas(ordner: str = DATA) -> list[str]:
    return sorted({meta_aus_schluessel(schluessel_aus_dateiname(os.path.basename(p)))
                   for p in pfade(ordner)} - {""})


def kopfzeile(ordner: str = DATA) -> list[str] | None:
    for p in pfade(ordner):
        with open(p, newline="", encoding="utf-8") as f:
            r = csv.reader(f)
            try:
                return next(r)
            except StopIteration:
                continue
    return None


def zeilen(ordner: str = DATA, meta: str | None = None):
    """Alle Zeilen aller Auszuege als dict, Auszug fuer Auszug."""
    for p in pfade(ordner, meta):
        with open(p, newline="", encoding="utf-8") as f:
            for zeile in csv.DictReader(f):
                yield zeile


def quelle_vorhanden(pfad_oder_ordner: str = DATA) -> bool:
    """Fuer Leser, deren Quelle entweder ein Ordner mit Auszuegen (Repo) oder
    eine einzelne CSV ist (Tests, Arbeitsordner eines Scrapers)."""
    if os.path.isdir(pfad_oder_ordner):
        return bool(pfade(pfad_oder_ordner))
    return os.path.isfile(pfad_oder_ordner)


def quelle_zeilen(pfad_oder_ordner: str = DATA, meta: str | None = None):
    """Wie zeilen(), aber auch fuer eine einzelne CSV (siehe quelle_vorhanden)."""
    if os.path.isdir(pfad_oder_ordner):
        yield from zeilen(pfad_oder_ordner, meta)
        return
    with open(pfad_oder_ordner, newline="", encoding="utf-8-sig") as f:
        for zeile in csv.DictReader(f):
            if meta is None or (zeile.get("meta") or "").strip() == meta:
                yield zeile


def quelle_pfade(pfad_oder_ordner: str = DATA) -> list[str]:
    if os.path.isdir(pfad_oder_ordner):
        return pfade(pfad_oder_ordner)
    return [pfad_oder_ordner] if os.path.isfile(pfad_oder_ordner) else []


def text(ordner: str = DATA, meta: str | None = None) -> str:
    """Der Inhalt aller Auszuege als EIN CSV-Text (eine Kopfzeile). Fuer Leser,
    die den alten Monolithen als Text verarbeitet haben."""
    teile = []
    kopf = None
    for p in pfade(ordner, meta):
        with open(p, encoding="utf-8", newline="") as f:
            inhalt = f.read()
        if not inhalt:
            continue
        erste, _, rest = inhalt.partition("\n")
        if kopf is None:
            kopf = erste
            teile.append(kopf + "\n")
        teile.append(rest if rest.endswith("\n") or not rest else rest + "\n")
    return "".join(teile)


def anzahl_zeilen(ordner: str = DATA, meta: str | None = None) -> int:
    n = 0
    for p in pfade(ordner, meta):
        with open(p, newline="", encoding="utf-8") as f:
            n += max(0, sum(1 for _ in f) - 1)
    return n


# ---------------------------------------------------------------------------
# Zusammensetzen (Auszuege -> Monolith im Arbeitsordner)
# ---------------------------------------------------------------------------
def zusammensetzen(ordner: str, ziel: str | None = None) -> int:
    """Schreibt aus den Auszuegen in `ordner` den Monolithen (Vorgabe:
    `<ordner>/tournament_decklists_per_player.csv`). Gibt die Zeilenzahl
    zurueck. Ohne Auszuege wird nichts geschrieben (0)."""
    ziel = ziel or os.path.join(ordner, MONOLITH)
    quellen = pfade(ordner)
    if not quellen:
        print(f"per_player_auszuege: keine Auszuege in {ordner} — nichts zusammengesetzt")
        return 0
    n = 0
    kopf = None
    tmp = ziel + ".tmp"
    with open(tmp, "w", newline="", encoding="utf-8") as out:
        w = csv.writer(out)
        for p in quellen:
            with open(p, newline="", encoding="utf-8") as f:
                r = csv.reader(f)
                try:
                    k = next(r)
                except StopIteration:
                    continue
                if kopf is None:
                    kopf = k
                    w.writerow(kopf)
                elif k != kopf:
                    raise SystemExit(f"per_player_auszuege: Kopfzeile von {os.path.basename(p)} "
                                     f"weicht ab — nicht zusammengesetzt")
                for zeile in r:
                    w.writerow(zeile)
                    n += 1
    os.replace(tmp, ziel)
    print(f"per_player_auszuege: {len(quellen)} Auszuege -> {os.path.basename(ziel)} ({n} Zeilen)")
    return n


# ---------------------------------------------------------------------------
# Aufteilen (Monolith -> Auszuege + Verzeichnis)
# ---------------------------------------------------------------------------
def _vorhandene_zeilen(ordner: str) -> int:
    return anzahl_zeilen(ordner)


def aufteilen(ordner: str, quelle: str | None = None, ziel: str | None = None,
              schrumpfen_erlauben: bool = False) -> int:
    """Teilt den Monolithen `quelle` (Vorgabe `<ordner>/MONOLITH`) in Auszuege
    unter `ziel` (Vorgabe `ordner`) und schreibt das Verzeichnis. Auszuege,
    deren Schluessel im Monolithen nicht mehr vorkommt, werden entfernt.
    Rueckgabe 0; 1 ohne Quelle; 2 wenn der Schrumpf-Waechter stoppt."""
    quelle = quelle or os.path.join(ordner, MONOLITH)
    ziel = ziel or ordner
    if not os.path.exists(quelle):
        print(f"::error::per_player_auszuege: {quelle} fehlt — nichts aufgeteilt")
        return 1
    os.makedirs(ziel, exist_ok=True)

    gruppen: dict[str, list[list[str]]] = {}
    with open(quelle, newline="", encoding="utf-8") as f:
        r = csv.reader(f)
        try:
            kopf = next(r)
        except StopIteration:
            print(f"::error::per_player_auszuege: {quelle} ist leer — nichts aufgeteilt")
            return 1
        idx = {name: i for i, name in enumerate(kopf)}
        i_meta = idx.get("meta")
        i_datum = idx.get("tournament_date")
        for zeile in r:
            if not zeile:
                continue
            key = schluessel({
                "meta": zeile[i_meta] if i_meta is not None and i_meta < len(zeile) else "",
                "tournament_date": zeile[i_datum] if i_datum is not None and i_datum < len(zeile) else "",
            })
            gruppen.setdefault(key, []).append(zeile)
    neu = sum(len(z) for z in gruppen.values())

    alt = _vorhandene_zeilen(ziel)
    if alt > 0:
        anteil = neu / alt
        if anteil < SCHRUMPF_STOPP and not schrumpfen_erlauben:
            print(f"::error::per_player_auszuege: Schrumpf-Waechter STOPP — Monolith "
                  f"{neu} Zeilen, Auszuege bisher {alt} ({anteil:.2f} < {SCHRUMPF_STOPP}); "
                  f"nichts geschrieben. Arbeitsordner halb gesaet? "
                  f"(--schrumpfen-erlauben hebt die Sperre auf)")
            return 2
        if anteil < SCHRUMPF_WARNUNG:
            print(f"::warning::per_player_auszuege: Monolith {neu} Zeilen, Auszuege bisher "
                  f"{alt} ({anteil:.2f} < {SCHRUMPF_WARNUNG}) — geschrieben")

    eintraege = []
    for key in sorted(gruppen):
        pfad = os.path.join(ziel, dateiname(key))
        tmp = pfad + ".tmp"
        with open(tmp, "w", newline="", encoding="utf-8") as out:
            w = csv.writer(out)
            w.writerow(kopf)
            w.writerows(gruppen[key])
        os.replace(tmp, pfad)
        eintraege.append({
            "schluessel": key,
            "meta": meta_aus_schluessel(key),
            "monat": monat_aus_schluessel(key),
            "datei": dateiname(key),
            "zeilen": len(gruppen[key]),
            "bytes": os.path.getsize(pfad),
        })

    entfernt = []
    for p in glob.glob(os.path.join(ziel, PRAEFIX + "_*.csv")):
        name = os.path.basename(p)
        if _ist_auszug(name) and schluessel_aus_dateiname(name) not in gruppen:
            os.remove(p)
            entfernt.append(name)

    vz = {
        "quelle": PRAEFIX,
        "stand": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "schluessel": "<meta>_<jjjj-mm des tournament_date>; ohne Format: _unsorted",
        "meta_keys": sorted({e["meta"] for e in eintraege} - {""}),
        "zeilen": neu,
        "auszuege": eintraege,
        "_hinweis": HINWEIS,
    }
    with open(os.path.join(ziel, VERZEICHNIS), "w", encoding="utf-8") as f:
        json.dump(vz, f, ensure_ascii=False, indent=2)
        f.write("\n")

    groesste = max(eintraege, key=lambda e: e["bytes"]) if eintraege else None
    print(f"per_player_auszuege: {neu} Zeilen -> {len(eintraege)} Auszuege in {ziel}"
          + (f", groesster {groesste['datei']} {groesste['bytes'] / 2**20:.1f} MiB" if groesste else "")
          + (f", entfernt: {', '.join(entfernt)}" if entfernt else ""))
    return 0


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = p.add_subparsers(dest="befehl", required=True)
    z = sub.add_parser("zusammensetzen", help="Auszuege -> Monolith")
    z.add_argument("ordner")
    z.add_argument("--ziel", default=None)
    a = sub.add_parser("aufteilen", help="Monolith -> Auszuege + Verzeichnis")
    a.add_argument("ordner")
    a.add_argument("--quelle", default=None)
    a.add_argument("--ziel", default=None)
    a.add_argument("--schrumpfen-erlauben", action="store_true", dest="schrumpfen_erlauben")
    s = sub.add_parser("stand", help="Was liegt wo")
    s.add_argument("ordner", nargs="?", default=DATA)
    args = p.parse_args(argv)

    if args.befehl == "zusammensetzen":
        zusammensetzen(args.ordner, args.ziel)
        return 0
    if args.befehl == "aufteilen":
        return aufteilen(args.ordner, args.quelle, args.ziel, args.schrumpfen_erlauben)
    for pf in pfade(args.ordner):
        print(f"{os.path.getsize(pf) / 2**20:8.1f} MiB  {os.path.basename(pf)}")
    print(f"{anzahl_zeilen(args.ordner)} Zeilen in {len(pfade(args.ordner))} Auszuegen")
    return 0


if __name__ == "__main__":
    sys.exit(main())
