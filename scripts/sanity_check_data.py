#!/usr/bin/env python3
"""Pre-commit data-quality gate for the weekly scraper batch.

AUDIT_DATA_PIPELINE.md F-D19 — the weekly workflow used to commit any
diff a scraper produced, including empty-header-only CSVs from a
Cloudflare escalation or similar source failure. This script enforces
a minimum-row threshold per critical CSV; below the threshold the file
is git-reverted (so the previous good snapshot survives) and the run
emits a `::warning::` instead of pushing garbage.

Files NOT listed below get a free pass — the gate is opt-in per file,
because half the CSVs in data/ are stable lookup tables (sets,
pokemon_sets_mapping, etc.) and don't need a watchdog.

Sommerpause-style intentional emptiness: set threshold = 0 to
opt-in the file as "watched" without enforcing a minimum. That keeps
the row in the table as documentation and surfaces a warning if a
future scrape DOES come back with data.

Usage:
    python3 scripts/sanity_check_data.py [DATA_DIR] [--strict]

Defaults DATA_DIR to ./data/. Returns 0 by default (the failure mode is
soft — we revert files and warn, never abort the workflow), so the
weekly commit step below still runs and the previous good snapshot is
what gets pushed.

Exit-code policy:
    0  → ran successfully (regardless of how many reverts happened)
    1  → script bug (couldn't open data dir etc.) — propagates to CI
    1  → with --strict: at least one file was reverted

Eine fehlende oder unlesbare Datei ist seit 21.08.2026 kein SKIP mehr,
sondern derselbe Revert-Pfad wie "zu wenige Zeilen", mit ::error::
statt ::warning:: — ein Loch faellt sonst leiser auf als eine Delle.
"""

from __future__ import annotations

import csv
import os
import subprocess
import sys
from typing import Dict

# Per-file minimum row count (excluding header). Tuned conservatively
# from the 2026-06-12 snapshot (AUDIT_DATA_PIPELINE.md scorecard) at
# ~50 % of observed row count so a normal weekly delta passes but a
# header-only output trips the guard.
#
# A threshold of 0 means "file is watched but allowed to be empty"
# (Sommerpause + similar) — we emit an info message but don't revert.
THRESHOLDS: Dict[str, int] = {
    # ── Online ladder + comparison: the predictor's `_shareList` source.
    'limitless_online_decks.csv':            50,    # 118 observed
    'limitless_online_decks_comparison.csv': 50,    # 118 observed
    'limitless_online_decks_matchups.csv':   500,   # 1128 observed

    # ── Online tournament dated cards: Latest Online · Typical Build
    # source on Deck Analysis (Global). Was at the centre of the
    # 2026-06 Mega Greninja "1 deck 120 cards" bug.
    'online_tournament_dated_cards.csv':     10_000,  # 26 601 observed
    'online_tournament_top8_decks.csv':      50,      # 108 observed
    'online_tournament_winners.csv':         20,      # 50 observed

    # ── Labs (major tournaments): Meta Call's empirical predictor.
    'labs_tournament_decks.csv':             2_000,   # 4 585 observed
    'labs_tournament_matchups.csv':          20_000,  # 44 458 observed

    # ── Current meta card data: the predictor's `_shareList` ground truth
    # for current-format archetype cards.
    'current_meta_card_data.csv':            2_000,   # 4 847 observed

    # ── Player continuity: Predictor 5.8 stickiness signal.
    'player_continuity.csv':                 2_000,   # 5 107 observed

    # ── Japanische Kartendatenbank: speist ueber prepare_card_data.py
    # den Deck Builder. Stand 21.08.2026: 772 Zeilen — aber nur, weil ein
    # Lauf sie auf M6 plus vier Promo-Sets zusammengestrichen hatte; M5,
    # M4 und M3 waren verschwunden. Die Datei stand bis dahin in KEINER
    # der beiden Listen hier, der Verlust fiel also nirgends auf.
    # Am 21.08.2026 wurden M4 (83) und M5 (81) aus der Git-Historie
    # zurueckgespielt — 936 Zeilen. Die Schwelle liegt jetzt UEBER den
    # damaligen 772: genau der Zusammenbruch, der unbemerkt blieb, wuerde
    # ab sofort anschlagen. Die eigentliche Absicherung ist die
    # Veraenderungspruefung in scripts/data_guardian.py (Verlust > 10 % und
    # verschwundene Set-Codes) — diese Zahl ist der grobe Auffangbalken.
    'japanese_cards_database.csv':           850,     # 936 beobachtet

    # ── Card master DB: 0-row would brick the Card Database tab.
    'all_cards_database.csv':                15_000,  # 20 248 observed
    'all_cards_merged.csv':                  15_000,  # 20 455 observed

    # ── Cardmarket prices: drives the price overlays.
    'price_data.csv':                        15_000,  # 20 242 observed
    'cardmarket_id_mapping.csv':             10_000,  # 17 220 observed

    # ── Per-decklist (Phase Y): currently only Turin is covered (see
    # F-D09). Threshold 0 = watch-but-allow-empty until the backfill
    # workflow lands; the moment any data appears we'll see it.
    'tournament_decklists_per_player.csv':   0,

    # ── City League Japan: in summer break as of 2026-06; the four
    # "current" CSVs are intentionally header-only. Threshold 0
    # documents the watch but doesn't revert.
    'city_league_analysis.csv':              0,
    'city_league_archetypes.csv':            0,
    'city_league_archetypes_comparison.csv': 0,
    'city_league_archetypes_deck_stats.csv': 0,

    # ── City League Japan, VERGANGENES Fenster (M5). Anders als die
    # vier oben duerfen diese nicht leer sein: im Vorfenster stand ein
    # grosses Championship-Turnier. Die Kartenanalyse desselben
    # Fensters hat 315 Zeilen, die Archetypdatei stand am 21.08.2026
    # bei genau einer (nur der Kopf) — die beiden widersprachen sich.
    #
    # Der Wochenlauf vom 22.08.2026 hat die Zeilen zurueckgebracht:
    # 26 / 11 / 11 aus Turnier 568 (Japan Championships 2026, elf
    # Archetypen). Damit loest diese Zeile die Zusage aus S9 ein —
    # "Schwelle 0 heisst beobachtet, solange der Past-Scraper nichts
    # liefert; sie steigt auf einen echten Wert, sobald der Lauf die
    # Zeilen zurueckbringt".
    #
    # Bewusst deutlich unter dem beobachteten Stand: ein vergangenes
    # Fenster wird beim naechsten Formatwechsel neu gefuellt und kann
    # dann legitim kleiner ausfallen. Die Schwelle soll den gemessenen
    # Fehler fangen (Datei faellt auf den Kopf zurueck), nicht eine
    # kleinere, aber richtige Rotation zurueckwerfen — ein Revert
    # ueberschreibt neue Wahrheit und ist teurer als eine Meldung.
    # Feinere Drift deckt der Waechter nicht ab: file_rows fuehrt diese
    # drei Dateien nicht.
    'city_league_analysis_past.csv':         100,   # 315 beobachtet
    'city_league_archetypes_past.csv':       10,    # 26 beobachtet
    'city_league_archetypes_past_comparison.csv':  5,   # 11 beobachtet
    'city_league_archetypes_past_deck_stats.csv':  5,   # 11 beobachtet
}


# ── S19: Glob-Regeln. Die Chunkdateien heissen nach ihrem Format
# (tournament_cards_data_cards_TEF-CRI.csv, labs_tournament_decks_
# SVI-JTG.csv …), es kommen mit jeder Rotation neue dazu. Eine feste
# Schwelle je Datei waere hier eine Pflegeaufgabe, die niemand macht —
# also wird jede Datei gegen ihren EIGENEN letzten committeten Stand
# gemessen. Verliert sie mehr als GLOB_MAX_LOSS ihrer Zeilen, wird sie
# zurueckgesetzt. Wachsen darf sie beliebig.
#
# Das ist genau der Fall, den die Zeilenzahl-Tabelle oben nicht
# abdeckt: 1.263 von 2.737 Zeilen im Turin-Chunk waren im August 2026
# beschaedigt, ohne dass eine einzige Schwelle angeschlagen haette.
GLOB_RULES: tuple = (
    'tournament_cards_data_cards_*.csv',
    'labs_tournament_decks_*.csv',
    'labs_tournament_matchups_*.csv',
)
GLOB_MAX_LOSS = 0.10   # mehr als 10 % weniger Zeilen als in HEAD = Revert


def head_csv_rows(path: str, repo_root: str) -> int:
    """Zeilenzahl derselben Datei im letzten Commit. -1, wenn die Datei
    dort nicht existiert (neu angelegt) oder git nicht antwortet."""
    try:
        rel = os.path.relpath(path, repo_root).replace(os.sep, '/')
        res = subprocess.run(
            ['git', 'show', f'HEAD:{rel}'],
            cwd=repo_root, capture_output=True, timeout=60,
        )
        if res.returncode != 0 or not res.stdout:
            return -1
        text = res.stdout.decode('utf-8', errors='replace')
        zeilen = text.count(chr(10))
        # Kopfzeile abziehen; eine Datei ohne abschliessenden Zeilenumbruch
        # zaehlt eine Zeile weniger, das faellt bei der 10-%-Grenze nicht
        # ins Gewicht.
        return max(0, zeilen - 1)
    except (subprocess.SubprocessError, OSError):
        return -1


# Files that should normally be EMPTY — emit a warning when rows
# appear, since "rows here" means the scraper couldn't classify them
# and an operator needs to look. AUDIT_DATA_PIPELINE.md F-D08.
ANOMALY_WATCH: Dict[str, str] = {
    'labs_tournament_decks__unsorted.csv': (
        'Zeilen hier heissen: labs_tournament_scraper.py konnte ein '
        'Turnier keinem Meta-Chunk zuordnen. Es gibt ZWEI Wege hierher, '
        'und der Text nannte bis zum 22.08.2026 nur den selteneren. '
        '(a) Das Turnier hat ein Datum, faellt aber in das '
        'in-person-legal-Lag-Fenster und kein Vorgaenger-Chunk deckt es '
        'ab — dann hilft previous_format_key in format_window.json. '
        '(b) Das Turnier hat GAR KEIN Datum: der Labs-Index wird '
        'teilweise clientseitig gerendert, und ohne Datum greift weder '
        'die Datums- noch die Namensableitung. Das ist der gemessene '
        'Fall der 96 Zeilen vom 25.05.2026 (Turnier 0042 Regional '
        'Brisbane, 0019 Special Event San Juan) — dort hilft '
        'previous_format_key nichts, die Turniere kommen beim naechsten '
        'Lauf von selbst zur Wiedervorlage. Beide Wege melden sich jetzt '
        'im Scraperlog mit logger.warning.'
    ),
}


def count_csv_rows(path: str) -> int:
    """Count non-header rows in `path`. Returns -1 on read error."""
    try:
        with open(path, 'r', encoding='utf-8-sig', newline='') as f:
            # csv.reader handles any delimiter without sniffing — we
            # only care about row count, not field count
            first = f.readline()
            if not first:
                return 0
            return sum(1 for _ in f)
    except (OSError, UnicodeDecodeError):
        return -1


def git_checkout(path: str, repo_root: str) -> bool:
    """Restore `path` from HEAD. True on success."""
    try:
        rel = os.path.relpath(path, repo_root)
        res = subprocess.run(
            ['git', 'checkout', '--', rel],
            cwd=repo_root,
            capture_output=True, text=True, timeout=30,
        )
        return res.returncode == 0
    except (subprocess.SubprocessError, OSError):
        return False


def main(argv: list[str]) -> int:
    args = [a for a in argv[1:] if not a.startswith('--')]
    strict = '--strict' in argv[1:]
    data_dir = args[0] if args else 'data'
    repo_root = os.path.abspath(os.path.join(os.path.dirname(data_dir), '.'))
    data_dir_abs = os.path.abspath(data_dir)

    if not os.path.isdir(data_dir_abs):
        print(f'::error::data dir not found: {data_dir_abs}', file=sys.stderr)
        return 1

    reverts: list[str] = []
    watches: list[str] = []
    passes: list[str] = []

    print(f'Data sanity check: {len(THRESHOLDS)} files watched')
    print(f'  data_dir = {data_dir_abs}')
    print(f'  repo_root = {repo_root}')
    print()

    for fname, threshold in sorted(THRESHOLDS.items()):
        path = os.path.join(data_dir_abs, fname)

        # S4 — die beiden folgenden Faelle waren bis 21.08.2026 ein
        # `continue`: eine geloeschte und eine unlesbare Datei rutschten
        # leiser durch das Tor als eine zu kurze. Beides ist schwerer als
        # "zu wenige Zeilen", also derselbe Weg (Revert aus HEAD) plus
        # ::error:: statt ::warning::.
        if not os.path.isfile(path):
            ok = git_checkout(path, repo_root)
            tag = 'RESTORED' if ok else 'RESTORE-FAILED'
            reverts.append(f'{fname}: fehlt → {tag}')
            print(f'  ❌ {fname:55s} {"fehlt":>8}        ({tag})')
            print(f'    ::error::Data sanity: {fname} fehlt auf der Platte; '
                  f'aus HEAD wiederhergestellt ({tag})')
            continue

        rows = count_csv_rows(path)
        if rows < 0:
            ok = git_checkout(path, repo_root)
            tag = 'REVERTED' if ok else 'REVERT-FAILED'
            reverts.append(f'{fname}: unlesbar → {tag}')
            print(f'  ❌ {fname:55s} {"unlesbar":>8}     ({tag})')
            print(f'    ::error::Data sanity: {fname} ist nicht lesbar '
                  f'(Kodierung oder E/A); auf den letzten guten Stand '
                  f'zurueckgesetzt ({tag})')
            continue

        if threshold == 0:
            # Watch-only — log the row count for the build summary but
            # don't revert anything.
            watches.append(f'{fname}: {rows} rows (watch-only)')
            print(f'  WATCH {fname:55s} {rows:>8} rows  (threshold=0, watch-only)')
            continue

        if rows < threshold:
            # Revert the file from HEAD. The previous good snapshot
            # carries forward; the bad scrape gets dropped from this
            # commit's diff.
            ok = git_checkout(path, repo_root)
            tag = 'REVERTED' if ok else 'REVERT-FAILED'
            reverts.append(f'{fname}: {rows} < {threshold} → {tag}')
            print(f'  ❌ {fname:55s} {rows:>8} rows  (<{threshold}, {tag})')
            print(f'    ::warning::Data sanity: {fname} dropped below threshold '
                  f'({rows} < {threshold}); reverted to last good snapshot')
        else:
            passes.append(f'{fname}: {rows} rows')
            print(f'  ✓     {fname:55s} {rows:>8} rows  (≥{threshold})')

    # ── S19: Glob-Regeln gegen den eigenen HEAD-Stand ──
    import glob as _glob
    glob_treffer = 0
    for muster in GLOB_RULES:
        for path in sorted(_glob.glob(os.path.join(data_dir_abs, muster))):
            fname = os.path.basename(path)
            if fname in THRESHOLDS:
                continue          # feste Schwelle gewinnt
            if fname in ANOMALY_WATCH:
                continue          # soll leer sein — Schrumpfen ist dort gut
            glob_treffer += 1
            rows = count_csv_rows(path)
            vorher = head_csv_rows(path, repo_root)
            if rows < 0:
                ok = git_checkout(path, repo_root)
                tag = 'REVERTED' if ok else 'REVERT-FAILED'
                reverts.append(f'{fname}: unlesbar → {tag}')
                print(f'  ❌ {fname:55s} {"unlesbar":>8}     ({tag})')
                print(f'    ::error::Data sanity: {fname} ist nicht lesbar; '
                      f'auf den letzten guten Stand zurueckgesetzt ({tag})')
                continue
            if vorher < 0:
                passes.append(f'{fname}: {rows} rows (neu)')
                print(f'  ✓     {fname:55s} {rows:>8} rows  (neu, kein Vergleich)')
                continue
            grenze = int(vorher * (1 - GLOB_MAX_LOSS))
            if rows < grenze:
                ok = git_checkout(path, repo_root)
                tag = 'REVERTED' if ok else 'REVERT-FAILED'
                reverts.append(f'{fname}: {rows} < {grenze} (HEAD {vorher}) → {tag}')
                print(f'  ❌ {fname:55s} {rows:>8} rows  (HEAD {vorher}, {tag})')
                print(f'    ::warning::Data sanity: {fname} verliert '
                      f'{vorher - rows} von {vorher} Zeilen '
                      f'(> {int(GLOB_MAX_LOSS * 100)} %); auf den letzten '
                      f'guten Stand zurueckgesetzt')
            else:
                passes.append(f'{fname}: {rows} rows (HEAD {vorher})')
                print(f'  ✓     {fname:55s} {rows:>8} rows  (HEAD {vorher})')
    if glob_treffer:
        print(f'  … {glob_treffer} Chunkdatei(en) gegen den eigenen '
              f'HEAD-Stand geprueft (Verlustgrenze '
              f'{int(GLOB_MAX_LOSS * 100)} %)')
        print()

    # Anomaly watch — files that should be empty (F-D08 __unsorted etc.).
    anomalies: list[str] = []
    for fname, why in sorted(ANOMALY_WATCH.items()):
        path = os.path.join(data_dir_abs, fname)
        if not os.path.isfile(path):
            continue
        rows = count_csv_rows(path)
        if rows > 0:
            anomalies.append(f'{fname}: {rows} rows')
            print(f'  ⚠ {fname:55s} {rows:>8} rows  (expected 0; operator review)')
            print(f'    ::warning::Data anomaly: {fname} has {rows} rows. {why}')
        else:
            print(f'  ✓     {fname:55s} {rows:>8} rows  (expected 0, OK)')

    print()
    print(f'Summary: {len(passes)} pass · {len(watches)} watch-only · '
          f'{len(reverts)} revert · {len(anomalies)} anomaly')
    if reverts:
        print('Reverted files:')
        for r in reverts:
            print(f'  - {r}')
    if anomalies:
        print('Anomaly files (operator review):')
        for a in anomalies:
            print(f'  - {a}')

    # Exit 0 by default: the failure mode is "this file got rolled back",
    # not "the entire pipeline is broken" — and a hard failure here would
    # skip the commit step below, which would throw away the good data
    # too. The reverts produce ::warning:: / ::error:: lines that the
    # workflow summary surfaces. --strict flips this for callers that
    # want the gate to bite.
    if strict and reverts:
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
