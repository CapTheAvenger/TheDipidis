#!/usr/bin/env python3
"""Spielt einen Setwechsel in einem WEGWERF-Baum durch — mit dem echten Code.

WARUM (29.09.2026, SC-7)
------------------------
Beim Wechsel auf 30C (16.09.2026) stand die Deploy-Kette vom 17. bis zum
20.09.: Zusicherungen verlangten Handaenderungen im Code (Commit 6ffcd00
"Formatwechsel 30C: Rueckfalltabellen ..."). Hausi, 29.09.2026: "auf Dauer
nichts mehr manuell". Dieses Werkzeug stellt den Zustand her, den der erste
Wochenlauf nach einem neuen Set schreibt, damit die Suiten DAGEGEN laufen
koennen, BEVOR das echte Set kommt.

WIE (nicht nachgebaut, sondern ausgefuehrt)
-------------------------------------------
1. Die Quelle: Limitless beschriftet Online-Turniere ab dem Erscheinen mit
   dem neuen Format. Nachgestellt, indem die Turniere ab `--datum` in
   online_api_tournaments/-archetypes den neuen Schluessel tragen und ihre
   Zeilen aus online_api_cards/-matchups_<alt>.csv nach ..._<neu>.csv
   wandern — genau so, wie scrapers/limitless_api_scraper.py nach `meta`
   ablegt. Damit ist auch der Ankerriegel (update_sets.anker_belegt,
   Tor 2) echt erfuellt statt umgangen.
2. Der Wochenlauf: die Schritte aus update_sets.main() laufen mit einer
   Erscheinungsliste, die das neue Set enthaelt (das liefert sonst
   limitlesstcg.com/cards): Ordnung, sets_metadata, format_window
   (inkl. Riegel und abgeleitetem Vorformat), neuestes Set,
   config/scraper_settings.json, Set-Liste des Kartenreiters.
3. Danach backend/tools/build_threat_intel.py, das im selben Lauf steht.

Alles schreibt NUR in den angegebenen Baum. Im echten Repo-Baum wird der
Lauf verweigert.

AUFRUF
    python3 scripts/simuliere_setwechsel.py <baum> [--en ZZN] [--jp M7Z]
                                            [--datum JJJJ-MM-TT]
"""
import argparse
import contextlib
import csv
import importlib
import json
import os
import subprocess
import sys

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _lies(pfad):
    with open(pfad, encoding="utf-8") as f:
        return json.load(f)


def _csv(pfad):
    with open(pfad, encoding="utf-8-sig", newline="") as f:
        r = csv.DictReader(f, delimiter=";")
        return r.fieldnames, list(r)


def _csv_schreiben(pfad, kopf, zeilen):
    with open(pfad, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=kopf, delimiter=";", lineterminator="\n")
        w.writeheader()
        w.writerows(zeilen)


def quelle_umbeschriften(daten, alt, neu, datum):
    """Online-Turniere ab `datum` tragen das neue Format — wie bei Limitless."""
    ids = set()
    for name in ("online_api_tournaments.csv", "online_api_archetypes.csv"):
        pfad = os.path.join(daten, name)
        kopf, zeilen = _csv(pfad)
        for z in zeilen:
            # Ab dem Tag NACH dem Erscheinen — wie format_window.json
            # `neues_set_filter_ab` und limitless_api_scraper.formatschluessel().
            if z.get("meta") == alt and (z.get("date") or "")[:10] > datum:
                z["meta"] = neu
                ids.add(z["tournament_id"])
        _csv_schreiben(pfad, kopf, zeilen)
    for art in ("cards", "matchups"):
        quelle = os.path.join(daten, f"online_api_{art}_{alt}.csv")
        kopf, zeilen = _csv(quelle)
        bleibt = [z for z in zeilen if z["tournament_id"] not in ids]
        wandert = [dict(z, meta=neu) for z in zeilen if z["tournament_id"] in ids]
        _csv_schreiben(quelle, kopf, bleibt)
        _csv_schreiben(os.path.join(daten, f"online_api_{art}_{neu}.csv"), kopf, wandert)
    return len(ids)


def wochenlauf_update_sets(baum, en, jp, datum):
    sys.path.insert(0, os.path.join(baum, "backend", "core"))
    for m in ("update_sets", "turnier_legalitaet", "card_scraper_shared"):
        sys.modules.pop(m, None)
    us = importlib.import_module("update_sets")
    daten = os.path.join(baum, "data")
    us.data_dir = daten
    meta = _lies(os.path.join(daten, "sets_metadata.json"))
    sets_order = _lies(os.path.join(daten, "sets.json"))
    en_dates = {k: v["release_date"] for k, v in meta.items() if v.get("release_date")}
    if en:
        en_dates.update({en: datum})
    jp_dates = dict(us.FALLBACK_JP_RELEASE_DATES)
    jp_dates.update({jp: datum})
    us.backfill_order_from_release_dates(sets_order, en_dates, jp_dates)
    with open(os.path.join(daten, "sets.json"), "w", encoding="utf-8") as f:
        json.dump(sets_order, f, indent=2, sort_keys=True)
    meta_pfad = us.write_sets_metadata(sets_order, en_dates, jp_dates)
    fw = us.write_format_window(meta_pfad, en_release_dates=en_dates, jp_release_dates=jp_dates)
    fw_pfad = fw or os.path.join(daten, "format_window.json")
    us.aktualisiere_neuestes_set(fw_pfad, en_dates)
    if fw:
        us.apply_format_window_to_scraper_settings(
            fw, os.path.join(baum, "config", "scraper_settings.json"))
    us.ensure_set_in_pokemon_sets_mapping(fw_pfad)
    return bool(fw)


# Dateien, die update_sets.apply_format_window_to_scraper_settings() bei
# einer Rotation leert oder ins Archiv schiebt und die DERSELBE Wochenlauf
# gleich danach mit seinen Scrapern neu fuellt (current_meta_analysis,
# online_tournament, labs_tournament, city_league_*). Die Scraper brauchen
# Netz, die Simulation nicht — also bekommen diese Dateien ihren Stand von
# vorher zurueck. Das ist die eine bewusste Grenze der Simulation: sie
# prueft den CODE beim Setwechsel, nicht die Frische dieser Auszuege.
NEU_GEFUELLT = (
    "city_league_analysis.csv", "city_league_analysis_past.csv",
    "city_league_archetypes.csv", "city_league_archetypes_comparison.csv",
    "city_league_archetypes_deck_stats.csv", "city_league_archetypes_past.csv",
    "city_league_archetypes_past_comparison.csv",
    "city_league_archetypes_past_deck_stats.csv",
    "current_meta_card_data.csv", "current_meta_scraped_tournaments.json",
    "labs_tournament_decks.csv", "meta_play_decks_cache.json",
    "online_tournament_dated_cards.csv",
)


def setwechsel(baum, en, jp, datum):
    daten = os.path.join(baum, "data")
    vorher = {}
    for name in NEU_GEFUELLT:
        pfad = os.path.join(daten, name)
        if os.path.isfile(pfad):
            with open(pfad, "rb") as f:
                vorher[name] = f.read()
    fw_alt = _lies(os.path.join(daten, "format_window.json"))
    alt = f"{fw_alt['oldest_legal_set']}-{fw_alt['current_set']}"
    neu = f"{fw_alt['oldest_legal_set']}-{en}" if en else alt
    # Nur ein JP-Set (--en ""): JP und EN laufen getrennt, das naechste
    # JP-Set kommt Monate vor seinem EN-Gegenstueck. Dann bleibt die
    # Online-Quelle, wie sie ist.
    turniere = quelle_umbeschriften(daten, alt, neu, datum) if en else 0
    geschrieben = wochenlauf_update_sets(baum, en, jp, datum)
    for name, inhalt in vorher.items():
        with open(os.path.join(daten, name), "wb") as f:
            f.write(inhalt)
    # Die Nachbearbeitung desselben Wochenlaufs, soweit sie ohne Netz
    # laeuft — in der Reihenfolge von weekly-full-update.yml.
    schritte = {}
    for skript in ("backend/tools/build_threat_intel.py", "scripts/datenluecken.py",
                   "scripts/build_deckempfehlung.py", "scripts/masterclass_zahlen_nachziehen.py",
                   "scripts/masterclass_listen_nachziehen.py",
                   "scripts/build_masterclass_cardbinder.py"):
        r = subprocess.run([sys.executable, os.path.join(baum, skript)],
                           cwd=baum, capture_output=True, text=True)
        schritte[skript] = r.returncode
    fw = _lies(os.path.join(daten, "format_window.json"))
    return {"alt": alt, "neu": neu, "turniere_umbeschriftet": turniere,
            "format_window_geschrieben": geschrieben,
            "current_set": fw.get("current_set"), "current_set_jp": fw.get("current_set_jp"),
            "previous_format_key": fw.get("previous_format_key"),
            "nachbearbeitung_rc": schritte}


def auto_datum(baum, mindestens=3):
    """Ein Erscheinungstag, der in den vorhandenen Daten wirklich traegt.

    Der Ankerriegel (update_sets.anker_belegt, Tor 2) verlangt Turniere
    unter dem neuen Schluessel. Genommen wird deshalb das Datum, ab dem
    noch `mindestens` Online-Turniere des laufenden Fensters liegen —
    immer nach dem Erscheinen des laufenden Sets und nie in der Zukunft.
    So laeuft die Probe jede Woche mit dem Bestand, den sie vorfindet,
    statt an einem festen Tag zu haengen."""
    daten = os.path.join(baum, "data")
    fw = _lies(os.path.join(daten, "format_window.json"))
    schluessel = f"{fw['oldest_legal_set']}-{fw['current_set']}"
    _, zeilen = _csv(os.path.join(daten, "online_api_tournaments.csv"))
    tage = sorted({(z.get("date") or "")[:10] for z in zeilen
                   if z.get("meta") == schluessel
                   and (z.get("date") or "")[:10] > str(fw.get("set_release_date") or "")})
    for tag in reversed(tage):
        spaeter = sum(1 for z in zeilen if z.get("meta") == schluessel
                      and (z.get("date") or "")[:10] > tag)
        if spaeter >= mindestens:
            return tag
    raise SystemExit("::error::simuliere_setwechsel.py: im laufenden Fenster liegen zu "
                     "wenige Online-Turniere fuer eine Probe")


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("baum")
    ap.add_argument("--en", default="ZZN")
    ap.add_argument("--jp", default="M7Z")
    ap.add_argument("--datum", default="auto",
                    help="Erscheinungstag (JJJJ-MM-TT); Online-Turniere danach tragen das "
                         "neue Format. 'auto': aus dem vorhandenen Bestand gewaehlt")
    a = ap.parse_args(argv)
    baum = os.path.abspath(a.baum)
    if os.path.samefile(baum, WURZEL):
        print("::error::simuliere_setwechsel.py laeuft nur in einer Kopie, nicht im Repo-Baum")
        return 2
    datum = auto_datum(baum) if a.datum == "auto" else a.datum
    # stdout traegt NUR die Ergebniszeile: setwechsel-probe.yml liest sie
    # als JSON. Das Protokoll von update_sets.py („[Update Sets] …") ging
    # bis 30.09.2026 ebenfalls nach stdout, und die erste Probe (PR #874)
    # scheiterte an „Expecting value: line 1 column 2".
    with contextlib.redirect_stdout(sys.stderr):
        erg = setwechsel(baum, a.en, a.jp, datum)
    erg["datum"] = datum
    print(json.dumps(erg, ensure_ascii=False))
    ok = erg["current_set_jp"] == a.jp and (not a.en or erg["current_set"] == a.en)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
