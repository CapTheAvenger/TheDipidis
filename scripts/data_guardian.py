#!/usr/bin/env python3
"""Data guardian — checks the data pipeline's health and REPORTS. Never repairs.

Why report-only: this data drives prices and card identity. A silently "fixed"
mapping is worse than a reported hole — a wrong price looks correct, a missing
one is obviously missing. So every finding here becomes a human-readable report;
nothing is auto-corrected.

Why baseline-diff instead of absolute thresholds: measured against the live repo,
"every set below 90% mapped" flags 62 of 153 sets, and "recent expansion without
an expansion_code" flags 93 — nearly all of them long-standing, legitimately
unmappable (old promos, Japanese-only sets). Absolute thresholds here are pure
noise. What actually signals a problem is CHANGE:

  * a set that is NEW and doesn't map            <- the PBL failure of 2026-07
  * a set whose coverage DROPS                   <- scraper/mapper regression
  * a consumer file that suddenly SHRINKS        <- upstream fetch broke
  * a consumer file missing required columns     <- contract break for consumers
  * inputs that stopped refreshing               <- silent job failure

State lives in data/_guardian_baseline.json. The daily job commits the updated
baseline so "changed since yesterday" stays meaningful.

Exit code is always 0 unless --strict: findings are reported, not enforced, so a
data hole never blocks an unrelated pipeline.
"""
import argparse
import collections
import csv
import datetime as dt
import glob
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")
BASELINE = os.path.join(DATA, "_guardian_baseline.json")

# Sets deliberately kept out of sets.json — mirrors SUPERSEDED_SETS in
# backend/core/prepare_card_data.py and INTENTIONALLY_UNORDERED_SETS in
# backend/core/update_sets.py. M3 is fully superseded by POR.
INTENTIONALLY_UNORDERED_SETS = {"M3"}

# ── Consumer contract ────────────────────────────────────────────────────────
# The files other projects (the tcg-exclusive-radar mirror + bot) read from this
# repo. Documented for humans in data/_consumers.md; this dict is the machine
# -readable source of truth the schema check runs against. Adding a column is
# safe; removing/renaming one breaks a consumer, so it is reported loudly.
CONSUMERS = {
    "cardmarket_id_mapping.csv": {
        "required": ["set", "number", "cardmarket_product_id", "match_method", "base_name"],
        "purpose": "(set, number) -> Cardmarket idProduct. The join key for prices.",
    },
    "cm_expansions.csv": {
        "required": ["id_expansion", "expansion_code", "name", "release_date",
                     "code_source", "n_singles"],
        "purpose": "Cardmarket idExpansion -> expansion_code + set name (image paths, set catalogue).",
    },
    "cardmarket_card_images.csv": {
        "required": ["idProduct", "id_category", "expansion_code", "id_expansion",
                     "number", "name_en", "name_de", "image_url", "stamped_image_url"],
        "purpose": "Prize Pack singles -> Cardmarket S3 image + official CloudFront stamped image.",
    },
    "prizepack_official_images.csv": {
        "required": ["series", "gallery_number", "set_code", "set_number",
                     "name_de", "name_en", "image_url_de", "image_url_en"],
        "purpose": "Prize Pack card -> official play.pokemon.com image + its original print.",
    },
    "japanese_cards_database.csv": {
        "required": ["name", "set", "number", "type", "rarity", "image_url"],
        "purpose": "Japanische Karten -> Deck Builder (ueber prepare_card_data). "
                   "Der Scraper holt je Lauf nur das NEUESTE JP-Set; alles "
                   "aeltere lebt allein davon, dass der Schreibweg zusammenlegt "
                   "statt zu ersetzen. Genau das hat im August 2026 nicht "
                   "gestimmt: M3, M4 und M5 waren weg, 772 Zeilen blieben. "
                   "Steht hier, damit die Veraenderungspruefung (check_shrink) "
                   "einen Wiederholungsfall sofort sieht.",
    },
    "price_data.csv": {
        "required": ["name", "set", "number", "eur_price", "eur_low",
                     "cardmarket_url", "last_updated", "price_status"],
        "purpose": "Per-print market prices consumed by the site and the bot. "
                   "price_status distinguishes ok / no_trend / stale / no_data — "
                   "eur_price alone cannot: Cardmarket publishes trend 0 to mean "
                   "'no trend computable', including on an 85 EUR card.",
    },
}

# Inputs whose staleness says something. Zwei Klassen, weil "die Datei hat sich
# nicht geändert" zwei völlig verschiedene Dinge bedeuten kann.
#
# Age is measured from the file's last GIT COMMIT, never its mtime: CI checks out
# with fetch-depth 1, which stamps every file with the clone time, so an
# mtime-based check reads 0 days for everything and can never fire. (That was a
# real dead check here — the detector for silent job death was itself silently
# dead.)
#
# REFRESH_DRIVEN: upstream publishes new values on every run, and the committing
# job writes them every time. Bleibt die Datei über ihr Fenster hinaus
# unverändert, ist der Job gestorben. Genau dafür gibt es diese Prüfung — das
# ist einen Fehler wert. Die Schwelle folgt der Kadenz des Jobs, DER SIE
# COMMITTET, nicht der des Jobs, der sie herunterlädt: price_guide_6.json wird
# täglich geladen, aber nur von weekly-full-update (Di+Fr, `git add -A`)
# committet — mit der alten 3-Tage-Schwelle hätte sie jeden Montag und Dienstag
# strukturell garantiert falsch gefeuert.
REFRESH_DRIVEN = {
    # Datei: (max_alter_in_tagen, wer committet)
    "cardmarket_id_mapping.csv":  (3,  "daily-price-refresh, jeden Lauf"),
    "price_data.csv":             (3,  "daily-price-refresh, jeden Lauf"),
    "price_guide_6.json":         (5,  "weekly-full-update Di+Fr -> max. Lücke 4 Tage"),
    "products_singles_6.json":    (10, "weekly-full-update Di+Fr"),
}

# CONTENT_DRIVEN: der Build ist ABSICHTLICH inkrementell. CLAUDE.md: "never
# re-fetch data you already have — that's why the Prize Pack build only fetches
# new series", und build_prizepack_official_images.py:356 sagt es noch einmal
# selbst: "A series' card list never changes once published ... so only fetch the
# PDFs for series we don't have yet."
#
# Diese Dateien bleiben wochenlang byte-identisch, WÄHREND ihr Job grün läuft —
# weil die Quelle nichts Neues hat. Ihr Alter sagt nichts über die Gesundheit des
# Jobs. Ein CRITICAL wäre hier reines Rauschen, und der Modulkommentar oben
# beschreibt, was Rauschen mit diesem Skript macht: es wird ignoriert.
#
# Gemessen am 18.08.2026: beide Dateien 34 bzw. 35 Tage alt, beide zugehörigen
# Wochenjobs zuletzt am 16.08. grün. Genau der Fall.
#
# Deshalb nur ein WARN nach großzügigem Horizont, und der Text sagt ausdrücklich,
# dass das Alter nichts beweist. Sauber lösen lässt sich das erst mit einem
# Heartbeat — jeder Job schreibt bei Erfolg einen Zeitstempel, unabhängig davon,
# ob sich Inhalt geändert hat. Siehe TODO unten.
CONTENT_DRIVEN = {
    "cardmarket_card_images.csv":    60,
    "prizepack_official_images.csv": 60,
}

# TODO(heartbeat): data/_job_heartbeats.json mit {job: iso-zeitstempel}, von jedem
# Datenjob bei Erfolg geschrieben. Erst damit lässt sich ein toter Job von einer
# ruhigen Quelle unterscheiden — für CONTENT_DRIVEN ist das die einzige ehrliche
# Prüfung. Bewusst nicht in dieser Änderung: es fasst sechs Workflows an.

COVERAGE_DROP_PP = 10.0   # percentage points a set may lose before we flag it
SHRINK_PCT = 10.0         # % of rows a consumer file may lose before we flag it
MIN_CARDS_FOR_COVERAGE = 5


def read_csv(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def col(row, name):
    return (row.get(name) or "").strip()


def set_coverage():
    """{set_code: (mapped, total, pct)} — how much of each set has a Cardmarket id."""
    db = collections.Counter()
    for r in read_csv(os.path.join(DATA, "all_cards_database.csv")):
        s = col(r, "set").upper()
        if s:
            db[s] += 1
    mapped = collections.Counter()
    for r in read_csv(os.path.join(DATA, "cardmarket_id_mapping.csv")):
        s = col(r, "set").upper()
        if s:
            mapped[s] += 1
    out = {}
    for s, total in db.items():
        if total < MIN_CARDS_FOR_COVERAGE:
            continue
        m = mapped.get(s, 0)
        out[s] = (m, total, round(100.0 * m / total, 1))
    return out


def file_rows():
    """{filename: row_count} for the consumer files that exist."""
    out = {}
    for fn in CONSUMERS:
        p = os.path.join(DATA, fn)
        if os.path.exists(p):
            out[fn] = len(read_csv(p))
    return out


def check_schema(findings):
    for fn, spec in CONSUMERS.items():
        p = os.path.join(DATA, fn)
        if not os.path.exists(p):
            findings.append(("CRITICAL", f"consumer file missing: data/{fn}"))
            continue
        with open(p, encoding="utf-8-sig", newline="") as f:
            header = csv.DictReader(f).fieldnames or []
        missing = [c for c in spec["required"] if c not in header]
        if missing:
            findings.append(("CRITICAL",
                             f"data/{fn} lost required column(s) {missing} — this breaks consumers"))


def _last_commit_date(path):
    """Date of the file's most recent commit, or None if git can't tell us.

    Deliberately not os.path.getmtime — see the note on FRESHNESS.
    """
    import subprocess  # noqa: PLC0415
    try:
        out = subprocess.run(
            ["git", "log", "-1", "--format=%cI", "--", path],
            cwd=ROOT, capture_output=True, text=True, timeout=20)
        stamp = (out.stdout or "").strip()
        return dt.date.fromisoformat(stamp[:10]) if stamp else None
    except Exception:  # noqa: BLE001
        return None


def check_freshness(findings):
    """Alter der Eingabedateien — CRITICAL nur, wo es einen toten Job beweist."""
    today = dt.date.today()

    def age_of(fn):
        p = os.path.join(DATA, fn)
        if not os.path.exists(p):
            findings.append(("CRITICAL", f"input missing: data/{fn}"))
            return None
        committed = _last_commit_date(p)
        if committed is None:
            findings.append(("WARN",
                             f"could not read git history for data/{fn} — freshness "
                             f"unchecked (is this a shallow clone without history?)"))
            return None
        return (today - committed).days

    for fn, (max_age, who) in REFRESH_DRIVEN.items():
        age = age_of(fn)
        if age is not None and age > max_age:
            findings.append(("CRITICAL",
                             f"data/{fn} last changed {age} days ago (expected <= "
                             f"{max_age}, written by {who}) — that job died silently"))

    for fn, max_age in CONTENT_DRIVEN.items():
        age = age_of(fn)
        if age is not None and age > max_age:
            findings.append(("WARN",
                             f"data/{fn} last changed {age} days ago. Its build is "
                             f"incremental by design, so this does NOT prove the job "
                             f"failed — the source may simply have nothing new. Check "
                             f"the workflow run before treating it as a defect."))


# How long a CSV may sit header-only before we say the refill never happened.
# Deliberately generous: a JP set rotation legitimately empties the City League
# files for a few days. Three weeks is well past any real rotation gap.
EMPTY_STALE_DAYS = 21


def empty_data_files():
    """{filename: True} for every top-level data CSV that carries only a header.

    A header-only CSV is the signature of a scraper that ran, found nothing, and
    wrote the empty result anyway. It is not the same as a missing file and it is
    not caught by check_shrink (which only looks at CONSUMERS and only at
    percentage loss — 100 % loss on a non-consumer file was invisible).
    """
    out = {}
    for fn in sorted(os.listdir(DATA)):
        if not fn.endswith(".csv"):
            continue
        p = os.path.join(DATA, fn)
        if not os.path.isfile(p):
            continue
        try:
            with open(p, encoding="utf-8-sig", newline="") as f:
                # Two reads are enough to tell "header only" from "has data".
                first = f.readline()
                second = f.readline()
            if first.strip() and not second.strip():
                out[fn] = True
        except OSError:
            continue
    return out


def _leer_erlaubt() -> set:
    """Dateien, die laut Sanity-Tor leer sein DUERFEN.

    scripts/sanity_check_data.py fuehrt sie mit Schwelle 0 — woertlich
    "watched but allowed to be empty (Sommerpause + similar)". Diese
    Deklaration existiert bereits; der Waechter hat sie bis zum
    22.08.2026 nur nicht gelesen und die vier City-League-Dateien des
    LAUFENDEN japanischen Fensters nach 21 Tagen zu CRITICAL eskaliert.

    Gemessen an diesem Tag: vier von fuenf kritischen Befunden waren
    genau diese Meldung — waehrend die japanische City League
    nachweislich in der Saisonpause steht und leer der richtige Zustand
    ist. Ein Waechter, der viermal falschen Alarm schlaegt, wird beim
    fuenften Mal nicht mehr gelesen; der Modulkommentar oben sagt das
    selbst ueber absolute Schwellen.

    Zwei Listen, eine Wahrheit: statt hier eine zweite Ausnahmeliste zu
    pflegen, wird die vorhandene gelesen. Faellt der Import aus, bleibt
    das alte, strengere Verhalten.
    """
    try:
        import sys as _sys
        _sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from sanity_check_data import THRESHOLDS as _T   # type: ignore
        return {name for name, schwelle in _T.items() if schwelle == 0}
    except Exception:
        return set()


def check_emptiness(findings, empties, base_empties):
    """Flag the TRANSITION to header-only, plus refills that never arrived.

    Change-based on purpose (see the module note on absolute thresholds): the
    seven City League files have been header-only since the 2026-07-31 M6
    rotation, and shouting about that every single day would train everyone to
    ignore this script. What matters is (a) a file going empty that wasn't, and
    (b) a file that went empty and never came back.
    """
    today = dt.date.today()
    # base_empties is None when the baseline predates this check. Everything would
    # then look like a fresh transition and the first run after the merge would
    # open an issue with seven bogus "wrote an empty result over real data" lines.
    # Without a baseline we can still answer the second question honestly ("has it
    # been empty too long?"), so we do that and record the state for next time.
    known = base_empties is not None
    base_empties = base_empties or {}
    for fn in sorted(empties):
        if known and not base_empties.get(fn):
            findings.append(("CRITICAL",
                             f"data/{fn} is now header-only — it had data at the last "
                             f"baseline. A scraper wrote an empty result over real data."))
            continue
        committed = _last_commit_date(os.path.join(DATA, fn))
        if committed is None:
            continue
        age = (today - committed).days
        if age > EMPTY_STALE_DAYS:
            if fn in _leer_erlaubt():
                # Ausdruecklich als "darf leer sein" gefuehrt. Sichtbar
                # bleibt es trotzdem — nur nicht als Notfall, und mit der
                # Angabe, was es zu einem machen wuerde.
                findings.append(("WARN",
                                 f"data/{fn} ist seit {age} Tagen leer. Das ist "
                                 f"so vorgesehen (Schwelle 0 im Sanity-Tor, "
                                 f"Saisonpause). Zum Befund wird es, wenn die "
                                 f"Quelle wieder Turniere fuehrt und die Datei "
                                 f"leer bleibt — oder wenn eine der Dateien "
                                 f"desselben Fensters Zeilen bekommt und diese "
                                 f"nicht (siehe Paar-Pruefung)."))
            else:
                findings.append(("CRITICAL",
                                 f"data/{fn} has been header-only for {age} days "
                                 f"(> {EMPTY_STALE_DAYS}) — the refill after the reset never "
                                 f"arrived, and the UI has been serving an empty view since."))

    # A file that refilled is worth one line of good news: it tells whoever reads
    # the log that the previous alarm was resolved rather than muted.
    healed = sorted(fn for fn in base_empties if fn not in empties) if known else []
    if healed:
        print(f"  Refilled since last baseline: {', '.join(healed)}")


# Paare, die nur gemeinsam etwas bedeuten.
#
# Jede Zeile: (Datei A, Datei B, was der Widerspruch heisst). Ist A leer und
# B nicht, beschreiben zwei Dateien dasselbe Fenster verschieden — und die
# Oberflaeche zeigt am Ende die leere.
#
# Gemessen am 20.08.2026: city_league_archetypes_past.csv hat nur die
# Kopfzeile, city_league_analysis_past.csv 315 Datenzeilen aus einem
# einzigen Turnier. Die Rotation auf M6 am 31.07. hat beide geleert
# (backend/core/update_sets.py), der Nachlauf hat nur eine wieder gefuellt.
# Das Auswahlmenue der Vergangenheits-Ansicht wird aus der leeren gebaut,
# also ist der Reiter tot — und meldet "Saisonpause", obwohl die
# Vergangenheit nicht pausiert. check_emptiness sieht das nicht: beide
# Dateien sind einzeln erklaerbar, der Widerspruch steht zwischen ihnen.
PAIRED_FILES = [
    ("city_league_archetypes_past.csv", "city_league_analysis_past.csv",
     "the past-rotation view builds its dropdown from the archetypes file; "
     "with only the analysis file filled, the tab renders empty"),
    ("city_league_archetypes.csv", "city_league_analysis.csv",
     "the current-rotation view builds its dropdown from the archetypes file"),
]


def check_paired_emptiness(findings, empties):
    """Flag pairs where one half is header-only and the other is not."""
    for a, b, folge in PAIRED_FILES:
        a_leer, b_leer = bool(empties.get(a)), bool(empties.get(b))
        if a_leer == b_leer:
            continue
        leer, voll = (a, b) if a_leer else (b, a)
        findings.append(("CRITICAL",
                         f"data/{leer} is header-only while data/{voll} has rows — "
                         f"two files describing the same window disagree. {folge}."))


def check_coverage(findings, cov, base_cov):
    for s, (m, total, pct) in sorted(cov.items()):
        prev = base_cov.get(s)
        if prev is None:
            # A set we've never seen before. Unmapped-on-arrival is exactly the
            # PBL case: the set exists in our card DB but never reached Cardmarket.
            if pct < 90.0:
                findings.append(("CRITICAL",
                                 f"NEW set {s} mapped only {m}/{total} ({pct}%) — "
                                 f"new sets normally reach >90%; check the mapper's "
                                 f"set->idExpansion step"))
            continue
        drop = prev[2] - pct
        if drop >= COVERAGE_DROP_PP:
            findings.append(("CRITICAL",
                             f"set {s} coverage dropped {prev[2]}% -> {pct}% "
                             f"({prev[0]}/{prev[1]} -> {m}/{total}) — likely a regression"))
    gone = [s for s in base_cov if s not in cov]
    if gone:
        findings.append(("WARN", f"set(s) disappeared from the card DB: {sorted(gone)}"))


def check_set_order(findings):
    """The current set must have an order number.

    sets.json / sets_metadata.json are generated by update_sets.py from two
    independent scrapes of limitlesstcg.com, and only one of them has to
    fail for a new set to vanish. That is what happened to PBL: the
    release-date scrape found it (format_window.json says current_set=PBL,
    released 2026-07-17) while the order scrape fell back to the hardcoded
    dict, so sets.json came out byte-identical to FALLBACK_SET_ORDER with
    no PBL entry. Order 0 means prepare_card_data bins every card of the
    set into the legacy chunk — invisible to the Deck Builder — and the
    frontend sorts it last.

    Nothing failed loudly, so this is a pure invariant check: whatever
    format_window.json calls the current set must exist in sets.json with
    an order at or above the standard-rotation boundary.
    """
    fw_path = os.path.join(DATA, "format_window.json")
    sets_path = os.path.join(DATA, "sets.json")
    if not (os.path.exists(fw_path) and os.path.exists(sets_path)):
        findings.append(("WARN", "format_window.json or sets.json missing — "
                                 "cannot verify the current set has an order"))
        return
    try:
        with open(fw_path, encoding="utf-8") as f:
            fw = json.load(f)
        with open(sets_path, encoding="utf-8") as f:
            order = json.load(f)
    except Exception as e:  # noqa: BLE001
        findings.append(("WARN", f"could not read set order files: {e}"))
        return

    # Not "is it the highest order": EN and JP share one order axis but rotate
    # independently, so the JP current set is legitimately below the newest EN
    # set. What must hold is that it is inside the standard window — below that
    # boundary prepare_card_data bins it out of the standard chunk.
    # Mirrors STANDARD_MIN_ORDER in backend/core/prepare_card_data.py.
    standard_min = 136
    # The card-database tab filters EVERYTHING through the hand-maintained
    # pokemon_sets_mapping.csv (js/app-cards-db.js englishCards filter): a
    # set missing there has ALL its cards silently removed before any
    # search or filter runs. That is exactly how all 120 PBL cards
    # vanished from the site 2026-07-17..08-01 while every other data
    # file was correct.
    mapping_codes = set()
    map_path = os.path.join(DATA, "pokemon_sets_mapping.csv")
    if os.path.exists(map_path):
        mapping_codes = {col(r, "set_code").upper()
                        for r in read_csv(map_path) if col(r, "set_code")}
    for field, region in (("current_set", "EN"), ("current_set_jp", "JP")):
        code = (fw.get(field) or "").strip().upper()
        if not code:
            continue
        if code in INTENTIONALLY_UNORDERED_SETS:
            continue
        if code not in order:
            findings.append(("CRITICAL",
                             f"{region} current set {code} has NO entry in sets.json — "
                             f"its cards land in the legacy chunk and the Deck Builder "
                             f"cannot see them; update_sets.py's order scrape fell back"))
        elif order[code] < standard_min:
            findings.append(("CRITICAL",
                             f"{region} current set {code} has order {order[code]}, below the "
                             f"standard boundary {standard_min} — its cards are binned out of "
                             f"the standard chunk the Deck Builder reads"))
        if region == "EN" and mapping_codes and code not in mapping_codes:
            findings.append(("CRITICAL",
                             f"EN current set {code} is missing from "
                             f"pokemon_sets_mapping.csv — the card database tab "
                             f"drops every card of the set before any filter runs"))


def ace_guard_prints():
    """{card name: ["SET NUM", ...]} — prints in all_cards_database.csv whose
    name is on the canonical ACE SPEC list (data/ace_specs.json) AND whose
    rarity passes the frontend's collision guard (rarity not exactly
    common/uncommon/rare — meta-binder.js isAceSpecRow).

    Why this exists: the binder's ACE detection is a NAME lookup guarded by
    rarity, verified to have 0 false positives today (old Master Ball prints
    are Uncommon, old Computer Search prints are Rare — both excluded). That
    guarantee silently breaks the day a set prints a non-ACE Ultra Rare
    with an ACE name. Baseline-diff per project rule: report the change,
    don't judge it."""
    ace_path = os.path.join(DATA, "ace_specs.json")
    if not os.path.exists(ace_path):
        return None
    try:
        with open(ace_path, encoding="utf-8") as f:
            names = {str(n).strip().lower() for n in json.load(f).get("ace_specs", []) if str(n).strip()}
    except Exception:  # noqa: BLE001
        return None
    if not names:
        return None
    guard = {"common", "uncommon", "rare"}
    out = {}
    for r in read_csv(os.path.join(DATA, "all_cards_database.csv")):
        name = (col(r, "name_en") or col(r, "name")).lower()
        if name not in names:
            continue
        if col(r, "rarity").lower() in guard:
            continue
        out.setdefault(name, []).append(f"{col(r, 'set')} {col(r, 'number')}".strip())
    return {k: sorted(v) for k, v in sorted(out.items())}


def check_ace_guard(findings, cur, base):
    if cur is None or base is None:
        return
    for name in sorted(set(cur) | set(base)):
        added = sorted(set(cur.get(name, [])) - set(base.get(name, [])))
        removed = sorted(set(base.get(name, [])) - set(cur.get(name, [])))
        if added:
            findings.append(("WARN",
                             f"ACE-name '{name}' has new guard-passing print(s) {added} — "
                             f"verify they really are ACE SPECs (a non-ACE Ultra Rare "
                             f"reprint would now wrongly bypass the binder threshold)"))
        if removed:
            findings.append(("WARN",
                             f"ACE-name '{name}' lost guard-passing print(s) {removed} — "
                             f"card DB or ace_specs.json changed"))


def price_integrity():
    """Signals that would have caught the 2026-06-04 price swap regression
    (OBF 223 <-> 228: two idProducts exchanged INSIDE a set — row counts and
    set coverage never moved, so no existing check could see it).

    Returns {nonempty_eur_price, match_methods: {method_family: n},
             duplicate_idproducts}. All diffed against the baseline — a
    changed number is REPORTED, never repaired."""
    out = {'nonempty_eur_price': 0, 'match_methods': {}, 'duplicate_idproducts': 0,
           'verified_collisions': [], 'verified_collision_owners': {}}
    price_path = os.path.join(DATA, "price_data.csv")
    if os.path.exists(price_path):
        out['nonempty_eur_price'] = sum(
            1 for r in read_csv(price_path) if col(r, 'eur_price'))
    map_path = os.path.join(DATA, "cardmarket_id_mapping.csv")
    if os.path.exists(map_path):
        methods = collections.Counter()
        ids = collections.Counter()
        nach_id = collections.defaultdict(list)
        for r in read_csv(map_path):
            m = col(r, 'match_method')
            # Family only: 'priced-by-date(4<->5)' fluctuates per run.
            methods[m.split('(')[0]] += 1
            pid = col(r, 'cardmarket_product_id')
            if pid:
                ids[pid] += 1
                nach_id[pid].append((f"{col(r, 'set')} {col(r, 'number')}".strip(), m))
        out['match_methods'] = dict(methods)
        out['duplicate_idproducts'] = sum(1 for n in ids.values() if n > 1)
        # Zwei Karten, eine Nummer, BEIDE als live-verified ausgewiesen.
        #
        # Das ist kein Drift, sondern ein Widerspruch in sich: dieselbe
        # Produktnummer kann nicht zwei Identitaeten belegen. Deshalb steht
        # er ausserhalb der Grundlinien-Logik — er wird gemeldet, solange es
        # ihn gibt, nicht erst wenn die Zahl steigt.
        out['verified_collisions'] = sorted(
            pid for pid, eintraege in nach_id.items()
            if len(eintraege) > 1 and all(m == 'live-verified' for _, m in eintraege))
        # Wer die ID beansprucht. check_verified_collisions braucht das,
        # um zu erkennen, ob ein Handpin die Kollision bereits
        # entschieden hat — die Pins wirken erst beim naechsten
        # Mapperlauf, stehen aber schon fest.
        out['verified_collision_owners'] = {
            pid: sorted((k.split(' ', 1)[0].strip().upper(),
                         k.split(' ', 1)[1].strip() if ' ' in k else '')
                        for k, _ in nach_id[pid])
            for pid in out['verified_collisions']}
    return out


def _gepinnte_karten() -> set:
    """(set, number) aus data/cardmarket_mapping_manual.csv.

    apply_manual_overrides setzt diese Pins NACH der Live-Pruefung und
    schlaegt sie damit. Eine Kollision, deren beide Karten gepinnt sind,
    ist beim naechsten Mapperlauf weg — sie steht nur noch in der
    ausgelieferten Datei.
    """
    pfad = os.path.join(DATA, "cardmarket_mapping_manual.csv")
    if not os.path.isfile(pfad):
        return set()
    try:
        with open(pfad, encoding="utf-8-sig", newline="") as f:
            return {((r.get("set") or "").strip().upper(),
                     (r.get("number") or "").strip())
                    for r in csv.DictReader(f)
                    if (r.get("cardmarket_product_id") or "").strip().isdigit()}
    except (OSError, csv.Error):
        return set()


def check_verified_collisions(findings, cur):
    """Zwei Karten auf einer Produkt-ID — und was die Handpins davon
    schon erledigt haben.

    Die Trennung ist wichtig: die Pins wirken erst, wenn der Mapper das
    naechste Mal laeuft. Bis dahin steht die Doppelbelegung weiter in
    cardmarket_id_mapping.csv. Sie deshalb zu verschweigen waere falsch,
    sie unveraendert als CRITICAL zu melden aber auch — der Befund ist
    dann bereits beantwortet und wartet nur auf den Lauf.
    """
    kol = cur.get('verified_collisions') or []
    if not kol:
        return
    gepinnt = _gepinnte_karten()
    besitzer = cur.get('verified_collision_owners') or {}
    erledigt, offen = [], []
    for pid in kol:
        karten = [tuple(k) if isinstance(k, (list, tuple)) else k
                  for k in (besitzer.get(pid) or [])]
        if karten and all(tuple(k) in gepinnt for k in karten):
            erledigt.append(pid)
        else:
            offen.append(pid)
    if offen:
        findings.append(("CRITICAL",
                         f"{len(offen)} Cardmarket product id(s) are 'live-verified' for TWO "
                         f"different cards at once: {', '.join(offen[:12])}"
                         f"{' …' if len(offen) > 12 else ''} — a verification that returns two "
                         f"answers for one product is not a verification. See "
                         f"data/_consumers.md on match_method."))
    if erledigt:
        findings.append((
            "WARN",
            f"{len(erledigt)} Doppelbelegung(en) stehen noch in "
            f"cardmarket_id_mapping.csv, sind aber in "
            f"cardmarket_mapping_manual.csv bereits von Hand entschieden "
            f"({', '.join(erledigt[:12])}"
            f"{' …' if len(erledigt) > 12 else ''}). Die Pins wirken beim "
            f"naechsten Lauf von cardmarket_id_mapper.py; verschwindet die "
            f"Meldung danach nicht, greift der Pin nicht."))


def check_meta_preiszuordnung(findings):
    """Preiszuordnungen der Karten, die im aktuellen Meta WIRKLICH gespielt
    werden.

    Die Gesamtzahl der unbestaetigten Zuordnungen ist als Kennzahl fast
    wertlos: am 22.08.2026 waren es 1.244 von 20.419 Preiszeilen — aber nur
    **28** davon standen in einer Deckliste des laufenden Formats. Die
    anderen 1.216 sind alte Karten, die niemand mehr spielt. Eine Meldung
    ueber 1.244 Zeilen laesst den Leser die falsche Groesse sehen und wird
    nach dem dritten Mal ueberblaettert.

    Diese Pruefung zaehlt deshalb nur, was zaehlt: Karten aus
    current_meta_card_data.csv, deren Zuordnung nicht bestaetigt ist.

    Die acht MEE-Grundenergien sind ein bekannter, gesondert dokumentierter
    Fall (Cardmarket fuehrt fuer MEE keine eigene Expansion, die Zuordnung
    faellt auf die SVE-Energien zurueck). Sie stehen getrennt in der
    Meldung — sonst verdecken sie den Fall, der neu waere.
    """
    meta_pfad = os.path.join(DATA, "current_meta_card_data.csv")
    preis_pfad = os.path.join(DATA, "price_data.csv")
    if not (os.path.isfile(meta_pfad) and os.path.isfile(preis_pfad)):
        return
    try:
        gespielt = set()
        with open(meta_pfad, encoding="utf-8-sig", newline="") as f:
            for r in csv.DictReader(f, delimiter=";"):
                sc = (r.get("set_code") or "").strip().upper()
                nr = (r.get("set_number") or "").strip()
                if sc and nr:
                    gespielt.add((sc, nr))
        offen, energien = [], []
        with open(preis_pfad, encoding="utf-8-sig", newline="") as f:
            for r in csv.DictReader(f):
                k = ((r.get("set") or "").strip().upper(),
                     (r.get("number") or "").strip())
                if k not in gespielt:
                    continue
                if (r.get("mapping_status") or "").strip() in ("ok", ""):
                    continue
                (energien if k[0] == "MEE" else offen).append(f"{k[0]} {k[1]}")
    except (OSError, csv.Error) as e:
        findings.append(("WARN", f"Meta-Preiszuordnung nicht pruefbar: {e}"))
        return
    if not gespielt:
        findings.append(("WARN",
                         "current_meta_card_data.csv nennt keine Karten — "
                         "die Meta-Preispruefung laeuft ins Leere"))
        return
    if offen:
        findings.append((
            "WARN",
            f"{len(offen)} von {len(gespielt)} im aktuellen Meta gespielten "
            f"Karten haben keine bestaetigte Produktzuordnung: "
            f"{', '.join(sorted(offen)[:15])}"
            f"{' …' if len(offen) > 15 else ''}. Belegbare Faelle gehoeren "
            f"nach data/cardmarket_mapping_manual.csv — tcggo.com nennt auf "
            f"jeder Kartenseite die Cardmarket-ID."))
    if energien:
        findings.append((
            "INFO",
            f"{len(energien)} MEE-Grundenergie(n) im Meta ohne bestaetigte "
            f"Zuordnung — bekannter Fall: Cardmarket fuehrt fuer MEE keine "
            f"eigene Expansion, die Zuordnung faellt auf die SVE-Energien "
            f"zurueck. Betrag je Karte im Centbereich."))


def check_geteilte_produkt_ids(findings):
    """Zwei Karten auf einer Produkt-ID, obwohl Cardmarket beide fuehrt.

    check_verified_collisions() daneben faengt nur den Fall, dass BEIDE
    Zeilen 'live-verified' sind. Der haeufigere Fall ist ein anderer und
    rutschte bis zum 03.09.2026 durch: eine bestaetigte Zeile
    ('live-verified' oder 'manual-pin') und eine erratene
    ('priced-by-date', 'priced-by-all') teilen sich eine ID. Gemessen an
    diesem Tag: 93 Produkt-IDs an 186 Karten, davon 82 nach genau diesem
    Muster.

    NICHT JEDE TEILUNG IST EIN FEHLER. Fuer Paldean Tauros (SSP 18/39),
    Chikorita (MEP 46/69) und Deoxys (CRI 32/34) fuehrt Cardmarket in der
    Erweiterung nur EIN Produkt fuer beide Nummern — dann ist die
    gemeinsame ID richtig und wir haben nichts Besseres anzubieten.

    Trennbar ist eine Teilung erst, wenn Cardmarket unter derselben
    Metacard mindestens so viele Produkte fuehrt wie wir Kartennummern
    haben. Genau das wird hier geprueft, und nur das wird gemeldet.

    DER FALL, DER DIESE PRUEFUNG AUSGELOEST HAT: CRI 116 (Special Art
    Rare) und CRI 122 (Secret Rare) trugen beide 886515 und zeigten beide
    135,45 EUR. Cardmarket fuehrt fuer Mega Greninja ex in CRI vier
    Produkte; drei waren bestaetigt, 886509 (169,10 EUR) lag unbenutzt
    herum. Der Fehler war also nicht nur eine doppelte ID, sondern eine
    um 34 EUR falsche Zahl auf einer teuren Karte.
    """
    map_pfad = os.path.join(DATA, "cardmarket_id_mapping.csv")
    prod_pfad = os.path.join(DATA, "products_singles_6.json")
    if not (os.path.isfile(map_pfad) and os.path.isfile(prod_pfad)):
        return
    BESTAETIGT = ("live-verified", "manual-pin")
    try:
        with open(prod_pfad, encoding="utf-8") as f:
            roh = json.load(f)
        produkte = roh.get("products") if isinstance(roh, dict) else roh
        nach_meta, pid_meta = {}, {}
        for p in (produkte or []):
            schluessel = (p.get("idExpansion"), p.get("idMetacard"))
            nach_meta.setdefault(schluessel, []).append(p)
            pid_meta[p.get("idProduct")] = schluessel

        preise = {}
        guide_pfad = os.path.join(DATA, "price_guide_6.json")
        if os.path.isfile(guide_pfad):
            with open(guide_pfad, encoding="utf-8") as f:
                for r in (json.load(f) or {}).get("priceGuides") or []:
                    preise[r.get("idProduct")] = r.get("trend")

        gruppen = {}
        with open(map_pfad, encoding="utf-8-sig", newline="") as f:
            for r in csv.DictReader(f):
                pid = (r.get("cardmarket_product_id") or "").strip()
                if not pid.isdigit():
                    continue
                gruppen.setdefault(int(pid), []).append(r)
    except (OSError, ValueError, csv.Error) as e:
        findings.append(("WARN", f"Geteilte Produkt-IDs nicht pruefbar: {e}"))
        return

    # Formatgrenze wie in report_unverified_prices — nur legale Sets
    # rechtfertigen eine harte Meldung.
    ordnung, aeltestes = {}, ""
    try:
        with open(os.path.join(DATA, "sets.json"), encoding="utf-8") as f:
            ordnung = json.load(f) or {}
        with open(os.path.join(DATA, "format_window.json"), encoding="utf-8") as f:
            aeltestes = ((json.load(f) or {}).get("oldest_legal_set") or "").upper()
    except (OSError, ValueError):
        pass
    grenze = ordnung.get(aeltestes)

    def legal(zeile):
        if not grenze:
            return True
        return (ordnung.get((zeile.get("set") or "").strip().upper()) or 0) >= grenze

    # Ein Pin wirkt erst beim naechsten Lauf von cardmarket_id_mapper.py.
    # Bis dahin steht die Doppelbelegung weiter in der ausgelieferten
    # Datei. Sie deshalb zu verschweigen waere falsch, sie unveraendert
    # als CRITICAL zu melden aber auch — genauso trennt es
    # check_verified_collisions() daneben schon.
    gepinnt = _gepinnte_karten()
    # Ab welchem Betrag eine Doppelbelegung laut wird. Darunter ist sie
    # richtig gemeldet, aber nicht dringend: PRE 97/99 unterscheiden sich
    # um 0,03 EUR, CRI 116/122 um 34 EUR.
    SPUERBAR = 1.0
    trennbar_legal, trennbar_alt, trennbar_klein = [], [], []
    unteilbar, erledigt = 0, []
    for pid, zeilen in gruppen.items():
        if len(zeilen) < 2:
            continue
        schluessel = pid_meta.get(pid)
        if not schluessel:
            continue
        # Wie viele Kartennummern haengen insgesamt an dieser Metacard?
        nummern = {(z.get("set"), z.get("number")) for z in zeilen}
        verwandt = {p.get("idProduct") for p in nach_meta.get(schluessel, [])}
        if len(verwandt) < len(nummern):
            unteilbar += 1
            continue
        methoden = {(z.get("match_method") or "").split("(")[0] for z in zeilen}
        if not (methoden & set(BESTAETIGT)):
            continue          # zwei Ratewerte: das faengt report_unverified_prices
        frei = sorted(verwandt - {int((z.get("cardmarket_product_id") or 0)) for z in zeilen})
        spanne, groesste = "", 0.0
        werte = [preise.get(x) for x in frei if isinstance(preise.get(x), (int, float))]
        jetzt = preise.get(pid)
        if werte and isinstance(jetzt, (int, float)) and jetzt:
            groesste = max(abs(w - jetzt) for w in werte)
            spanne = f", unbenutzt daneben bis {groesste:.2f} EUR daneben"
        text = ("/".join(f"{z.get('set')} {z.get('number')}" for z in zeilen)
                + f" auf {pid}" + (f" (frei: {', '.join(str(x) for x in frei)}{spanne})" if frei else ""))
        # Genuegt EIN Pin: er nimmt der geratenen Zeile die fremde ID weg,
        # und damit ist die Teilung aufgeloest.
        if any(((z.get("set") or "").strip().upper(),
                (z.get("number") or "").strip()) in gepinnt
               and (z.get("match_method") or "").split("(")[0] not in BESTAETIGT
               for z in zeilen):
            erledigt.append(text)
            continue
        if not any(legal(z) for z in zeilen):
            trennbar_alt.append(text)
        elif groesste >= SPUERBAR:
            trennbar_legal.append(text)
        else:
            # Dieselbe Doppelbelegung, aber im Centbereich. Als CRITICAL
            # gemeldet wuerde sie neben einem 34-EUR-Fehler stehen und
            # dessen Dringlichkeit verwaessern — die Hausregel gegen
            # absolute Schwellen gilt auch fuer die eigene Lautstaerke.
            trennbar_klein.append(text)

    if trennbar_legal:
        findings.append((
            "CRITICAL",
            f"{len(trennbar_legal)} Produkt-ID(s) sind an mehrere Karten aus "
            f"AKTUELL LEGALEN Sets vergeben, obwohl Cardmarket unter derselben "
            f"Metacard genug eigene Produkte fuehrt, um sie zu trennen: "
            + "; ".join(sorted(trennbar_legal)[:8])
            + (" …" if len(trennbar_legal) > 8 else "")
            + ". Beide Karten zeigen denselben Preis, und mindestens einer ist "
              "falsch. Die freie Produkt-ID daneben ist der Kandidat; belegbare "
              "Faelle gehoeren nach data/cardmarket_mapping_manual.csv."))
    if trennbar_klein:
        findings.append((
            "WARN",
            f"{len(trennbar_klein)} trennbare Doppelbelegung(en) in legalen Sets "
            f"bewegen weniger als {SPUERBAR:.2f} EUR: "
            + "; ".join(sorted(trennbar_klein)[:5])
            + (" …" if len(trennbar_klein) > 5 else "")
            + ". Richtig ist es trotzdem nicht — nur nicht dringend."))
    if trennbar_alt:
        findings.append((
            "WARN",
            f"{len(trennbar_alt)} weitere trennbare Doppelbelegung(en) betreffen "
            f"nur rotierte Sets: " + "; ".join(sorted(trennbar_alt)[:5])
            + (" …" if len(trennbar_alt) > 5 else "")
            + ". Nicht mehr legal, deshalb keine harte Meldung."))
    if erledigt:
        findings.append((
            "WARN",
            f"{len(erledigt)} trennbare Doppelbelegung(en) sind in "
            f"cardmarket_mapping_manual.csv bereits von Hand entschieden "
            f"({'; '.join(sorted(erledigt)[:5])}"
            f"{' …' if len(erledigt) > 5 else ''}). Der Pin wirkt beim naechsten "
            f"Lauf von cardmarket_id_mapper.py; verschwindet die Meldung danach "
            f"nicht, greift er nicht."))
    if unteilbar:
        findings.append((
            "INFO",
            f"{unteilbar} Doppelbelegung(en) sind KEIN Fehler: Cardmarket fuehrt "
            f"dort unter der Metacard weniger Produkte als wir Kartennummern "
            f"haben (z. B. Paldean Tauros SSP 18/39). Die gemeinsame ID ist dann "
            f"die richtige Antwort, nicht die bequeme."))


def check_kartentext_bericht(findings):
    """data/card_text_resolution.csv gegen die Menge, die sie beschreibt.

    Der Bericht listet je eine Zeile fuer jede Karte, deren
    mapping_status in price_data.csv 'unverified' ist — die entschiedenen
    UND die abgelehnten, weil die Abstentionen die Arbeitsliste des
    Live-Pruefers sind.

    Gemessen am 22.08.2026: der Bericht fuehrte 1314 Zeilen, die
    Grundmenge nur noch 1244. Die Differenz war KEIN Defekt — 91 Karten
    sind seit der letzten Erzeugung von 'unverified' auf 'collision'
    gewandert, 21 kamen dazu. Aber sie war auch nicht sichtbar: kein Lauf
    erzeugt diese Datei, sie wird von Hand angestossen und committet.
    Zwischen zwei Anstoessen driftet sie stumm von den Daten weg, die sie
    beschreibt, und wer sie liest, arbeitet eine veraltete Liste ab.

    Deshalb WARN und nicht CRITICAL: ein veralteter Bericht ist kein
    Datenverlust. Er ist nur eine Landkarte von gestern.
    """
    bericht = os.path.join(DATA, "card_text_resolution.csv")
    preise = os.path.join(DATA, "price_data.csv")
    if not os.path.isfile(bericht) or not os.path.isfile(preise):
        return
    try:
        with open(bericht, encoding="utf-8-sig") as f:
            zeilen = sum(1 for _ in csv.DictReader(f))
        with open(preise, encoding="utf-8-sig") as f:
            grundmenge = sum(
                1 for r in csv.DictReader(f)
                if (r.get("mapping_status") or "").strip() == "unverified")
    except (OSError, csv.Error) as e:
        findings.append(("WARN", f"card_text_resolution.csv ist unlesbar: {e}"))
        return
    if zeilen == grundmenge:
        return
    findings.append((
        "WARN",
        f"card_text_resolution.csv fuehrt {zeilen} Zeilen, price_data.csv "
        f"aber {grundmenge} Karten mit mapping_status 'unverified' "
        f"(Differenz {zeilen - grundmenge:+d}). Den Bericht erzeugt kein "
        f"Lauf — er wird von Hand angestossen. Neu erzeugen mit "
        f"'python3 scripts/resolve_by_card_text.py' (schreibt nur den "
        f"Bericht, aendert keine Zuordnung)."))


def check_champions_usage(findings, vorher=None):
    """Anteilslisten, die sich nicht auf 100 % addieren koennen.

    Ein Pokemon traegt genau EIN Item und hat genau EIN Wesen; die
    Anteile dieser Listen muessen sich auf rund 100 % summieren. Am
    20.08.2026 taten das acht Item-Listen nicht — sie kamen auf bis zu
    139,1 %, und in jeder stand an Position 6 exakt 53,9 % bei fuenf
    verschiedenen Items. Dazu sechs Wesens-Listen mit einer doppelten
    Zeile.

    Der Scraper faengt das inzwischen ab (scripts/scrape_champions_usage.py,
    pruefe_plausibel) und setzt den unmoeglichen Wert auf unbekannt. Diese
    Pruefung ist das Netz darunter: sie schlaegt an, wenn eine Liste die
    Grenze reisst, OHNE dass der Scraper sie markiert hat — dann hat sich
    die Quelle auf eine Art veraendert, die die Erkennung nicht kennt.
    """
    path = os.path.join(DATA, "champions_usage.json")
    if not os.path.exists(path):
        return
    try:
        with open(path, encoding="utf-8") as f:
            daten = json.load(f)
    except Exception as e:                                  # noqa: BLE001
        findings.append(("CRITICAL", f"champions_usage.json is unreadable: {e}"))
        return

    GRENZE = 105.0
    # Statuswertpunkte: 66 im Ganzen, 32 je Wert — dieselben Zahlen wie im
    # Rechner (js/app-side-quest-matchups.js: SP_BUDGET, SP_MAX) und im
    # Scraper. Sie kommen aus dem Spiel, nicht aus einer Schaetzung.
    SP_BUDGET, SP_MAX = 66, 32
    unmarkiert, trotz_marke, doppelt, spreads, markiert = [], [], [], [], 0
    for name, eintrag in (daten.get("pokemon") or {}).items():
        for fmt in ("doubles", "singles"):
            block = eintrag.get(fmt)
            if not isinstance(block, dict):
                continue
            if block.get("_warnungen"):
                markiert += 1
            for kat in ("held_item", "nature", "ability"):
                liste = block.get(kat) or []
                if not liste:
                    continue
                summe = sum(e.get("pct") or 0 for e in liste)
                if summe > GRENZE:
                    # Die Unterscheidung traegt die Stufe: OHNE Markierung
                    # hat die Erkennung des Scrapers die Form nicht erkannt
                    # (die Quelle hat sich veraendert) — das ist kritisch.
                    # MIT Markierung wusste er Bescheid und hat den einen
                    # Ausreisser genullt; wenn die Liste dann IMMER NOCH zu
                    # hoch ist, war es nicht ein Ausreisser, sondern die
                    # ganze Liste. Gemeldet, aber kein Notfall.
                    hat_genullt = any(e.get("pct") is None for e in liste)
                    (unmarkiert if not block.get("_warnungen")
                     else trotz_marke).append(
                        f"{name}/{fmt}/{kat} = {summe:.1f} %"
                        + (" (genullt)" if hat_genullt else ""))
                namen = [(e.get("name") or "").strip() for e in liste]
                if len(namen) != len(set(namen)):
                    doppelt.append(f"{name}/{fmt}/{kat}")
            # Doppelte Zeilen gibt es auch in Attacken- und
            # Mitstreiterlisten (25.08.2026: florges-red-flower und
            # musharna, beide doubles/move). Die Summe darf dort ueber
            # 100 % liegen, dieselbe Zeile zweimal nicht.
            for kat in ("move", "teammate"):
                namen = [(e.get("name") or "").strip() for e in (block.get(kat) or [])]
                if namen and len(namen) != len(set(namen)):
                    doppelt.append(f"{name}/{fmt}/{kat}")
            for sp in (block.get("stat_points") or []):
                werte = [w for w in (sp.get("points") or {}).values()
                         if isinstance(w, (int, float))]
                if werte and (sum(werte) > SP_BUDGET or any(w > SP_MAX for w in werte)):
                    spreads.append(f"{name}/{fmt}: {sp.get('evs')}")

    if unmarkiert:
        findings.append(("CRITICAL",
                         f"{len(unmarkiert)} champions usage list(s) sum to more than "
                         f"{GRENZE:.0f} % WITHOUT the scraper flagging them: "
                         f"{', '.join(unmarkiert[:8])}"
                         f"{' …' if len(unmarkiert) > 8 else ''} — a Pokémon holds one "
                         f"item and has one nature, so these shares cannot both be right. "
                         f"pruefe_plausibel() in scrape_champions_usage.py did not catch "
                         f"this shape; the source has changed."))
    if doppelt:
        findings.append(("WARN",
                         f"{len(doppelt)} champions usage list(s) carry the same row twice: "
                         f"{', '.join(doppelt[:8])}{' …' if len(doppelt) > 8 else ''}"))
    if trotz_marke:
        # KORRIGIERT 03.09.2026 (zweimal am selben Tag, beide Male aus
        # demselben Grund: die Meldung sagte nicht, was der Fall ist).
        #
        # Erstens stand hier "AFTER the scraper nulled its outlier" — das
        # beschrieb den falschen Zweig. pruefe_plausibel() nullt NUR, wenn
        # genau EIN Wert ausser der Reihe steht und sein Wegfall die Summe
        # rettet; sonst laesst es die Liste bewusst unveraendert. Von den
        # 22 gemeldeten Listen trug keine einen genullten Wert.
        #
        # Zweitens, und wichtiger: die Meldung nannte eine ABSOLUTE Zahl.
        # Der Fehler sitzt an der Quelle (vom Betreiber gegen weitere
        # Quellen gegengeprueft, 03.09.2026) und ist von hier aus nicht
        # heilbar. Eine Warnung, die jeden Tag dieselben 22 meldet, ohne
        # dass jemand etwas tun kann, ist genau die Sorte Dauerrauschen,
        # die dieses Repo an anderer Stelle schon abgeschafft hat
        # (CLAUDE.md: "Absolute quality thresholds produce noise here.
        # Detect *change* against a baseline instead.").
        #
        # Also: WARN nur, wenn die Zahl WAECHST — dann ist eine Liste neu
        # kaputtgegangen und die Quelle hat sich weiter verschlechtert.
        # Bleibt sie gleich oder faellt sie, ist das eine Beobachtung,
        # kein Handlungsbedarf: INFO mit Richtungsangabe, damit sichtbar
        # bleibt, ob sich die Fehler wieder legen.
        genullt = sum(1 for e in trotz_marke if "(genullt)" in e)
        jetzt = len(trotz_marke)
        frueher = (vorher or {}).get("champions_ueber_grenze")
        rumpf = (f"{jetzt} champions usage list(s) sum above {GRENZE:.0f} % and the "
                 f"scraper could NOT pin a single culprit (davon {genullt} mit bereits "
                 f"genulltem Wert). Entweder steht kein Wert ausser der Reihe, oder es "
                 f"kaemen zwei gleich gut in Frage; Raten waere schlimmer als die "
                 f"gemeldete Luecke. Die fuehrende Zeile — und damit Buildvorschlag und "
                 f"Schadensrechnung — bleibt korrekt, der Ueberschuss sitzt im "
                 f"Auslaeufer der Liste.")
        if frueher is None:
            findings.append(("INFO", rumpf + " Erste Messung; ab jetzt wird die "
                                             "Veraenderung beobachtet."))
        elif jetzt > frueher:
            findings.append((
                "WARN",
                f"{rumpf} NEU: zuletzt waren es {frueher}, jetzt {jetzt} "
                f"(+{jetzt - frueher}) — die Quelle hat sich weiter verschlechtert. "
                f"Betroffen: {', '.join(trotz_marke[:8])}"
                f"{' …' if len(trotz_marke) > 8 else ''}"))
        else:
            richtung = (f"unveraendert bei {jetzt}" if jetzt == frueher
                        else f"zurueck von {frueher} auf {jetzt} (-{frueher - jetzt})")
            findings.append(("INFO", f"{rumpf} Beobachtung: {richtung}."))

    if spreads:
        findings.append(("WARN",
                         f"{len(spreads)} champions stat spread(s) outside {SP_BUDGET} points "
                         f"total / {SP_MAX} per stat: {', '.join(spreads[:8])}"
                         f"{' …' if len(spreads) > 8 else ''} — the game does not allow these. "
                         f"Measured 25.08.2026: araquanid/doubles carried 173 attack points."))
    if markiert:
        findings.append(("INFO",
                         f"{markiert} champions usage block(s) carry a plausibility warning "
                         f"from the scraper. Wo ein einzelner Ausreisser eindeutig war, "
                         f"steht er auf unbekannt statt auf einer geratenen Zahl; wo nicht, "
                         f"ist die Liste unveraendert und nur vermerkt. Beides braucht zum "
                         f"Beheben die Quelle, nicht dieses Repo."))

    # Fuer die Baseline: nur diese eine Zahl, damit der naechste Lauf die
    # RICHTUNG kennt statt wieder nur den Stand.
    return len(trotz_marke)


def check_champions_namen(findings):
    """Loest jeder Nutzungs-Slug eine Spezies auf?

    js/champions-names.js uebersetzt den Nutzungs-Slug ("hisuian-zoroark")
    in den Showdown-Namen ("Zoroark-Hisui"). Das ist die Bruecke, ueber die
    ein selbstgebautes Team in die Speed-Leiter kommt: findet sie nichts,
    faellt das Pokémon dort STILL heraus (app-side-quest-play.js prueft
    `!spec || !spec.baseStats` und ueberspringt).

    Diese Pruefung stand bis zum 26.08.2026 in tests/unit/test-champions-
    names.js und damit im Deploy-Gate — als "alle 353 Slugs loesen auf".
    Am 26.08. um 14:12 UTC schrieb der Scraper 238 Eintraege (die Quelle hat
    rund 115 Zierformen zurueckgezogen), und die Auslieferung stand still,
    obwohl an der Aufloesung nichts kaputt war. Genau der Fehler, den PR
    #516 einen Tag vorher fuer die Plausibilitaetspruefungen behoben hat.

    Die Pruefung ist trotzdem gut: derselbe Lauf brachte 'fan-rotom' neu
    mit, und das loeste tatsaechlich nicht auf. Sie gehoert nur hierher —
    melden, nicht sperren.

    Ausgefuehrt wird die JS-Regel selbst, nicht eine Kopie davon in Python:
    zwei Implementierungen derselben Namensregeln waeren zwei Wahrheiten.
    Fehlt node, meldet die Pruefung das ehrlich, statt stumm zu bestehen.
    """
    import subprocess  # noqa: PLC0415

    usage = os.path.join(DATA, "champions_usage.json")
    dex = os.path.join(DATA, "pokemon_battle_data.json")
    modul = os.path.join(ROOT, "js", "champions-names.js")
    for pfad in (usage, dex, modul):
        if not os.path.exists(pfad):
            findings.append(("WARN",
                             f"champions name check skipped: {os.path.relpath(pfad, ROOT)} fehlt"))
            return

    skript = r"""
const fs = require('fs'), vm = require('vm');
const sb = { window: {} };
vm.createContext(sb);
vm.runInContext(fs.readFileSync(process.argv[1], 'utf8'), sb);
const CN = sb.window.ChampionsNames;
const DEX = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const slugs = Object.keys(JSON.parse(fs.readFileSync(process.argv[3], 'utf8')).pokemon || {});
const offen = slugs.filter(s => {
    const n = CN.zuShowdown(s, DEX);
    return !n || !DEX[n] || !DEX[n].baseStats;
});
console.log(JSON.stringify({ gesamt: slugs.length, offen: offen }));
"""
    try:
        out = subprocess.run(["node", "-e", skript, "--", modul, dex, usage],
                             cwd=ROOT, capture_output=True, text=True, timeout=60)
    except FileNotFoundError:
        findings.append(("WARN",
                         "champions name check skipped: node ist hier nicht verfuegbar"))
        return
    except Exception as e:                                  # noqa: BLE001
        findings.append(("WARN", f"champions name check failed to run: {e}"))
        return

    if out.returncode != 0:
        findings.append(("WARN",
                         "champions name check failed: "
                         + (out.stderr or "").strip().splitlines()[-1:][0][:200]))
        return

    try:
        res = json.loads((out.stdout or "").strip().splitlines()[-1])
    except Exception as e:                                  # noqa: BLE001
        findings.append(("WARN", f"champions name check gave no readable answer: {e}"))
        return

    offen = res.get("offen") or []
    gesamt = res.get("gesamt") or 0
    if not gesamt:
        findings.append(("WARN", "champions_usage.json fuehrt kein einziges Pokémon"))
        return
    if offen:
        findings.append(("WARN",
                         f"{len(offen)} of {gesamt} champions usage slug(s) resolve to no "
                         f"species with base stats — a team built from them loses those "
                         f"Pokémon from the speed ladder without saying so: "
                         + ", ".join(offen[:12])
                         + (" …" if len(offen) > 12 else "")))


def check_champions_freshness(findings):
    """Der stille Stillstand der In-Game-Nutzung.

    champions_usage.json wird von champions-usage-refresh.yml geschrieben.
    Gemessen am 21.08.2026 stand die Datei seit dem 17.07.2026 unveraendert —
    championsbattledata.com drosselt den Bulk-Scrape aus CI-IPs — waehrend das
    Side-Quest-Panel die Zahlen weiter als "Saison: Current" zeigte. 35 Tage
    alt, als aktuell beschriftet.

    Der Workflow-Kommentar versprach "data_guardian escalates once it passes
    its freshness budget". Dieses Budget gab es nicht: champions_usage.json
    stand in keiner der beiden Frische-Listen. Hier ist es.

    Warum nicht ueber das Git-Datum wie check_freshness(): die Datei wird auch
    von Aenderungen angefasst, die nichts mit dem Scrape zu tun haben (am
    21.08. etwa von der Plausibilitaetskorrektur aus Gruppe 3). Danach sieht
    sie frisch aus, obwohl der Scrape steht. Nur der Scraper selbst weiss, wann
    er zuletzt wirklich Daten geholt hat — deshalb _meta.scraped_at.

    WARN statt CRITICAL: der Job stirbt nicht, er committet nur nichts, und
    eine gedrosselte Fremdquelle ist ein Datenlauf-Thema, kein Repo-Fehler.
    Sichtbar altern soll sie trotzdem.
    """
    path = os.path.join(DATA, "champions_usage.json")
    if not os.path.exists(path):
        return
    try:
        with open(path, encoding="utf-8") as f:
            meta = (json.load(f) or {}).get("_meta") or {}
    except Exception as e:                                  # noqa: BLE001
        findings.append(("CRITICAL", f"champions_usage.json is unreadable: {e}"))
        return

    roh = meta.get("scraped_at")
    if not roh:
        findings.append(("INFO",
                         "champions_usage.json traegt noch kein _meta.scraped_at — "
                         "das Feld entsteht erst beim naechsten ERFOLGREICHEN Lauf von "
                         "scrape_champions_usage.py. Bis dahin laesst sich die Frische "
                         "nicht pruefen, und die Seite schreibt ehrlich 'Stand unbekannt'."))
        return

    try:
        stand = dt.datetime.fromisoformat(roh)
    except ValueError:
        findings.append(("WARN",
                         f"champions_usage.json: _meta.scraped_at ist kein lesbares "
                         f"Datum ({roh!r})"))
        return
    if stand.tzinfo is None:
        stand = stand.replace(tzinfo=dt.timezone.utc)
    alter = (dt.datetime.now(dt.timezone.utc) - stand).days

    MAX_ALTER = 7  # der Job laeuft taeglich; eine Woche ist grosszuegig
    if alter > MAX_ALTER:
        findings.append(("WARN",
                         f"champions_usage.json wurde zuletzt vor {alter} Tagen wirklich "
                         f"gescrapt (erwartet <= {MAX_ALTER}, Job champions-usage-refresh.yml "
                         f"laeuft taeglich). Der Scrape-Step wird bei Drosselung zwar rot, "
                         f"committet aber nichts — die Zahlen altern still weiter. Das "
                         f"Side-Quest-Panel weist den Stand aus, die Quelle braucht "
                         f"trotzdem einen Blick."))


def report_unverified_prices(findings):
    """Standing worklist: which unverified mappings actually matter.

    Not a threshold check — a progress report. Prices whose product
    identity is unproven are flagged in the UI, and this names the ones
    where a wrong product costs real money, so they can be pinned by hand
    (data/cardmarket_mapping_manual.csv) instead of waiting for the
    fingerprint to become decidable."""
    path = os.path.join(DATA, "price_data.csv")
    if not os.path.exists(path):
        return
    rows = read_csv(path)
    unver = [r for r in rows if col(r, "mapping_status") == "unverified"]
    if not rows or not unver:
        return

    def eur(v):
        v = (v or "").replace("€", "").replace(".", "").replace(",", ".").strip()
        try:
            return float(v)
        except ValueError:
            return 0.0

    # Nach Format trennen (Regel des Betreibers, 03.09.2026): eine
    # unbestaetigte Zuordnung an einer ROTIERTEN Karte kostet niemanden
    # etwas — die Karte ist nicht mehr legal, den Preis sieht kaum
    # jemand. Die Gesamtzahl vermischte beides und war deshalb als
    # Kennzahl unbrauchbar: am 03.09.2026 waren es 1213 Zeilen, davon
    # 1108 (91 %) in rotierten Sets. Eine Meldung, deren Zahl zu 91 %
    # aus Irrelevantem besteht, wird ueberblaettert — zu Recht.
    #
    # Die Grenze kommt aus format_window.json, nicht aus einer Liste
    # hier: sonst zeigt sie nach der naechsten Rotation auf das
    # vorletzte Format.
    ordnung, aeltestes = {}, ""
    try:
        with open(os.path.join(DATA, "sets.json"), encoding="utf-8") as f:
            ordnung = json.load(f) or {}
        with open(os.path.join(DATA, "format_window.json"), encoding="utf-8") as f:
            aeltestes = ((json.load(f) or {}).get("oldest_legal_set") or "").upper()
    except (OSError, ValueError):
        pass
    grenze = ordnung.get(aeltestes)

    def legal(r):
        # Ohne brauchbare Grenze lieber alles melden als still nichts.
        if not grenze:
            return True
        return (ordnung.get((col(r, "set") or "").strip().upper()) or 0) >= grenze

    im_format = [r for r in unver if legal(r)]
    rotiert = len(unver) - len(im_format)

    pricey = sorted(im_format, key=lambda r: -eur(col(r, "eur_price")))
    over5 = [r for r in pricey if eur(col(r, "eur_price")) > 5]
    if im_format:
        umfang = (f"in AKTUELL LEGALEN Sets (>= {aeltestes})" if grenze
                  else "mit unbestaetigter Zuordnung (Formatgrenze nicht lesbar, "
                       "deshalb ungefiltert)")
        findings.append(("WARN",
                         f"{len(im_format)} Preiszeilen {umfang} haben eine "
                         f"unbestaetigte Produktzuordnung, {len(over5)} davon "
                         f"ueber 5 EUR. Top: "
                         + ", ".join(f"{col(r, 'set')} {col(r, 'number')} "
                                     f"{col(r, 'eur_price')}" for r in pricey[:5])))
    if rotiert:
        findings.append(("INFO",
                         f"{rotiert} weitere unbestaetigte Zuordnungen betreffen "
                         f"rotierte Sets ({len(unver)}/{len(rows)} Zeilen insgesamt). "
                         f"Nicht mehr legal, deshalb keine Warnung — die Zahl steht "
                         f"hier nur, damit sie nicht als Zuwachs missverstanden wird."))


def check_price_integrity(findings, cur, base):
    if not base:
        return
    prev_prices = base.get('nonempty_eur_price', 0)
    if prev_prices and cur['nonempty_eur_price'] < prev_prices * 0.98:
        findings.append(("CRITICAL",
                         f"filled eur_price values dropped {prev_prices} -> "
                         f"{cur['nonempty_eur_price']} — a merge/mapping change is "
                         f"silently blanking prices"))
    base_methods = base.get('match_methods', {})
    for fam in set(cur['match_methods']) | set(base_methods):
        a, b = base_methods.get(fam, 0), cur['match_methods'].get(fam, 0)
        if a and abs(b - a) > max(50, a * 0.05):
            findings.append(("WARN",
                             f"mapping method '{fam}' count moved {a} -> {b} — "
                             f"verify the mapper change is intentional"))
    prev_dupes = base.get('duplicate_idproducts')
    if prev_dupes is not None and cur['duplicate_idproducts'] > prev_dupes:
        findings.append(("WARN",
                         f"idProduct assigned to multiple prints: "
                         f"{prev_dupes} -> {cur['duplicate_idproducts']} rows — "
                         f"two of our cards now claim the same product"))


def check_shrink(findings, rows, base_rows):
    for fn, n in sorted(rows.items()):
        prev = base_rows.get(fn)
        if not prev:
            continue
        if n < prev * (1 - SHRINK_PCT / 100.0):
            findings.append(("CRITICAL",
                             f"data/{fn} shrank {prev} -> {n} rows "
                             f"({100.0*(prev-n)/prev:.0f}% fewer) — upstream fetch likely failed"))


def check_champions_teams(findings, vorher):
    """Der Bestand an Champions-Replica-Teams darf nicht wegbroeckeln.

    data/champions_replica_teams.json entsteht taeglich aus
    champions-replica-scrape.yml. Die Zahl schwankt von Natur aus — die
    Quelle ist ein Fremdserver, und der Scraper ist ausdruecklich fail-soft.
    Sie darf aber nicht ueber Tage in eine Richtung laufen:

        19.08.  96 Teams
        20.08.  73
        21.08.  66
        22.08.  62
        25.08.  60  (Scrape 04:15 UTC)
        25.08.  46  (Weekly Full Update 06:22 UTC)

    Zwei getrennte Beobachtungen stecken darin. Erstens der Trend nach
    unten — das sieht nach Drosselung aus, so wie CLAUDE.md sie fuer
    play.pokemon.com beschreibt. Zweitens schreibt der WOECHENTLICHE Lauf
    regelmaessig eine duennere Datei als der taegliche Scrape wenige
    Stunden davor (46 gegen 60 am 25.08., 48 gegen 62 am 22.08., 53 gegen
    66 am 21.08.) und ueberschreibt damit den besseren Stand.

    Diese Pruefung stand vorher als feste Untergrenze (`> 50`) in
    tests/unit/test-side-quest-usage.js. Dort war sie am falschen Platz: der
    Test haengt im Deploy-Gate, also hat ein Datenrueckgang der Fremdquelle
    die gesamte Auslieferung angehalten — inklusive der Preisdaten, die
    voellig in Ordnung waren. Melden ja, blockieren nein.

    Gegen die Grundlinie, nicht gegen eine feste Zahl: wie viele Teams es
    gibt, entscheidet die Quelle, nicht dieses Skript.
    """
    pfad = os.path.join(DATA, "champions_replica_teams.json")
    if not os.path.isfile(pfad):
        return None
    try:
        with open(pfad, encoding="utf-8") as f:
            jetzt = len((json.load(f) or {}).get("teams") or [])
    except Exception as e:                                  # noqa: BLE001
        findings.append(("CRITICAL", f"champions_replica_teams.json nicht lesbar: {e}"))
        return None

    if jetzt == 0:
        findings.append(("CRITICAL",
                         "champions_replica_teams.json enthaelt 0 Teams — der Scrape hat "
                         "nichts geliefert und der fail-soft-Rueckfall hat nicht gegriffen."))
        return jetzt

    if not vorher:
        return jetzt

    if jetzt < vorher * 0.80:
        findings.append(("WARN",
                         f"champions_replica_teams.json: {vorher} -> {jetzt} Teams "
                         f"({100.0*(vorher-jetzt)/vorher:.0f} % weniger). Der Scraper ist "
                         f"fail-soft, ein Rueckgang ist also kein Absturz, sondern meist "
                         f"eine gedrosselte Quelle. Faellt die Zahl mehrere Laeufe "
                         f"hintereinander, holt der Scrape die Teams nicht mehr — dann "
                         f"hilft kein Neustart, sondern langsamer abrufen."))
    return jetzt


def check_jp_setbestand(findings):
    """Ein Set-Code darf aus der japanischen Datenbank nicht verschwinden.

    Die Zeilenzahl allein reicht nicht: ein Lauf, der M5 verliert und
    dafuer 90 neue Promos bringt, sieht in der Summe gesund aus. Der
    Bestand ist aber je Set zu betrachten — ein verschwundener Set-Code
    heisst, dass der Schreibweg wieder ersetzt statt zusammengelegt hat.

    Gegen die Grundlinie, nicht gegen eine feste Liste: welche Sets es
    gibt, entscheidet die Rotation, nicht dieses Skript.
    """
    pfad = os.path.join(DATA, "japanese_cards_database.csv")
    if not os.path.isfile(pfad):
        findings.append(("CRITICAL", "japanese_cards_database.csv fehlt."))
        return {}
    try:
        zeilen = read_csv(pfad)
    except Exception as e:  # noqa: BLE001
        findings.append(("CRITICAL", f"japanese_cards_database.csv nicht lesbar: {e}"))
        return {}
    je_set = collections.Counter(col(z, "set") for z in zeilen if col(z, "set"))
    return dict(je_set)


def check_jp_setbestand_vergleich(findings, jetzt, vorher):
    if not vorher:
        return
    verschwunden = sorted(set(vorher) - set(jetzt))
    if verschwunden:
        findings.append((
            "CRITICAL",
            "japanese_cards_database.csv hat Set-Code(s) verloren: "
            + ", ".join(f"{s} ({vorher[s]} Zeilen)" for s in verschwunden)
            + ". Der Scraper holt je Lauf nur das neueste Set — verschwindet "
              "ein aelteres, hat der Schreibweg ersetzt statt zusammengelegt."))
    geschrumpft = [
        f"{s}: {vorher[s]} → {jetzt[s]}"
        for s in sorted(set(vorher) & set(jetzt))
        if jetzt[s] < vorher[s] * 0.9
    ]
    if geschrumpft:
        findings.append((
            "WARN",
            "japanische Sets mit deutlich weniger Karten als zuvor: "
            + "; ".join(geschrumpft)))


def check_proxy_frische(findings):
    """S17 — die Proxy-URL-Karte altert unsichtbar.

    data/pokemonproxies_url_map.json ist die einzige Moeglichkeit, an
    die Bilder der japanischen Karten zu kommen: die CDN-URLs tragen
    einen Vite-Hash, der sich bei jedem Deploy der Fremdseite aendert.
    Wird die Karte nicht nachgezogen, zeigen die Kartenbilder ins
    Leere — sichtbar erst im Browser, nicht in der Datei.

    Wie bei champions_usage.json ueber `_meta.scraped_at` und nicht
    ueber das Git-Datum: die Datei wird auch von Aenderungen angefasst,
    die nichts mit dem Scrape zu tun haben, und sieht danach frisch aus.
    """
    path = os.path.join(DATA, "pokemonproxies_url_map.json")
    if not os.path.exists(path):
        return
    try:
        with open(path, encoding="utf-8") as f:
            daten = json.load(f) or {}
    except Exception as e:                                  # noqa: BLE001
        findings.append(("CRITICAL", f"pokemonproxies_url_map.json ist nicht lesbar: {e}"))
        return
    meta = daten.get("_meta") or {}
    roh = meta.get("scraped_at")
    if not roh:
        findings.append(("WARN",
                         "pokemonproxies_url_map.json traegt kein _meta.scraped_at — "
                         "die Frische der Kartenbild-URLs laesst sich nicht pruefen."))
        return
    try:
        stand = dt.datetime.fromisoformat(roh.replace("Z", "+00:00"))
    except ValueError:
        findings.append(("WARN",
                         f"pokemonproxies_url_map.json: _meta.scraped_at ist kein "
                         f"lesbares Datum ({roh!r})"))
        return
    if stand.tzinfo is None:
        stand = stand.replace(tzinfo=dt.timezone.utc)
    alter = (dt.datetime.now(dt.timezone.utc) - stand).days

    MAX_ALTER = 10   # der Scraper laeuft im Wochenlauf; zehn Tage decken
                     # einen ausgefallenen Lauf ab, zwei nicht mehr.
    if alter > MAX_ALTER:
        findings.append((
            "WARN",
            f"pokemonproxies_url_map.json wurde zuletzt vor {alter} Tagen "
            f"gescrapt (erwartet <= {MAX_ALTER}). Die URLs tragen einen "
            f"Inhalts-Hash der Fremdseite: veraltet heisst hier nicht "
            f"'aelter', sondern 'zeigt ins Leere'. "
            f"{meta.get('entry_count', '?')} Eintraege, Sets: "
            f"{', '.join(sorted((meta.get('set_breakdown') or {}).keys())) or '—'}."))


def check_proxy_karte_gegen_bestand(findings):
    """S17b — zeigen die Kartendateien auf Proxy-URLs, die die Karte
    gar nicht mehr kennt?

    Befund 03.09.2026. pokemonproxies.com hatte das Set M5 komplett
    abgeraeumt. Die URL-Karte trug die 79 alten Adressen weiter, und
    all_cards_merged.{json,csv} sowie cards_chunk_standard.json trugen
    sie mit — auf der Seite standen 79 kaputte Kartenbilder. Auffallen
    konnte das nur im Browser: die Dateien selbst waren in sich
    schluessig.

    Diese Pruefung braucht kein Netz. Sie haelt die ausgelieferten
    Kartendateien gegen die Karte, aus der ihre Proxy-URLs stammen:

      * URL in der Kartendatei, aber nicht in der Karte  -> die Karte
        wurde nachgezogen, prepare_card_data.py aber nicht. Genau die
        Luecke, durch die tote Bilder ueberleben.

    Umgekehrt ist harmlos: die Karte darf mehr kennen, als gerade
    gebraucht wird.
    """
    kartenpfad = os.path.join(DATA, "pokemonproxies_url_map.json")
    if not os.path.exists(kartenpfad):
        return
    try:
        with open(kartenpfad, encoding="utf-8") as f:
            bekannt = set(((json.load(f) or {}).get("urls") or {}).values())
    except Exception:                                       # noqa: BLE001
        return          # Lesbarkeit meldet bereits check_proxy_frische

    muster = re.compile(r"https?://[^\s\"',]*pokemonproxies\.com/[^\s\"',]+")
    for name in ("all_cards_merged.json", "all_cards_merged.csv",
                 "cards_chunk_standard.json"):
        pfad = os.path.join(DATA, name)
        if not os.path.exists(pfad):
            continue
        try:
            with open(pfad, encoding="utf-8") as f:
                inhalt = f.read()
        except Exception:                                   # noqa: BLE001
            continue
        verwaist = {u for u in muster.findall(inhalt) if u not in bekannt}
        if verwaist:
            beispiel = sorted(verwaist)[:3]
            findings.append((
                "CRITICAL",
                f"{name}: {len(verwaist)} Proxy-Bild-URLs stehen nicht "
                f"(mehr) in pokemonproxies_url_map.json. Die Karte wurde "
                f"nachgezogen, die Kartendatei nicht — diese Bilder zeigen "
                f"ins Leere. Abhilfe: backend/core/prepare_card_data.py "
                f"laufen lassen. Beispiele: {', '.join(beispiel)}"))


def check_uebersicht_gegen_chunks(findings):
    """S20 — die Turnieruebersicht gegen die Chunkdateien halten.

    data/tournament_cards_data_overview.csv fuehrt je Turnier eine
    Zeile mit `total_cards`. Die eigentlichen Kartenzeilen liegen in
    tournament_cards_data_cards_<FORMAT>.csv. Bis 21.08.2026 hat
    niemand die beiden gegeneinander gehalten — und genau dort standen
    drei Abweichungen: zwei Turniere ohne Format (540, 518) und eine
    Dublette (539) mit einem `total_cards`, das in keiner Datei
    vorkam.

    Bewusst nur melden, nie korrigieren: welche der beiden Seiten recht
    hat, entscheidet die Quelle, nicht dieses Skript (CLAUDE.md,
    "Report, don't silently repair").
    """
    pfad = os.path.join(DATA, "tournament_cards_data_overview.csv")
    if not os.path.isfile(pfad):
        return
    try:
        with open(pfad, encoding="utf-8-sig", newline="") as f:
            zeilen = list(csv.DictReader(f, delimiter=";"))
    except Exception as e:  # noqa: BLE001
        findings.append(("WARN", f"tournament_cards_data_overview.csv nicht lesbar: {e}"))
        return

    # (a) Eindeutigkeit der tournament_id
    gesehen = {}
    for z in zeilen:
        tid = col(z, "tournament_id")
        if not tid:
            continue
        gesehen.setdefault(tid, []).append(z)
    doppelt = {t: v for t, v in gesehen.items() if len(v) > 1}
    if doppelt:
        findings.append((
            "CRITICAL",
            "tournament_cards_data_overview.csv fuehrt "
            f"{len(doppelt)} Turnier-ID(s) mehrfach: "
            + ", ".join(sorted(doppelt)[:8])
            + ". Eine ID steht fuer genau ein Turnier — welche der Zeilen "
              "stimmt, muss ein Mensch entscheiden."))

    # (b) total_cards gegen die tatsaechlichen Chunkzeilen
    chunk_zaehler = {}
    for datei in sorted(glob.glob(os.path.join(DATA, "tournament_cards_data_cards_*.csv"))):
        meta = os.path.basename(datei)[len("tournament_cards_data_cards_"):-len(".csv")]
        try:
            with open(datei, encoding="utf-8-sig", newline="") as f:
                for row in csv.DictReader(f, delimiter=";"):
                    tid = (row.get("tournament_id") or "").strip()
                    if tid:
                        chunk_zaehler[(meta, tid)] = chunk_zaehler.get((meta, tid), 0) + 1
        except Exception:  # noqa: BLE001
            continue
    je_turnier = {}
    for (meta, tid), n in chunk_zaehler.items():
        je_turnier.setdefault(tid, {})[meta] = n

    abweichungen = []
    ohne_chunk = []
    for tid, gruppe in sorted(gesehen.items()):
        z = gruppe[0]
        if col(z, "status") and col(z, "status") != "success":
            continue
        gemeldet_roh = col(z, "total_cards")
        try:
            gemeldet = int(float(gemeldet_roh.replace(",", ".")))
        except (ValueError, AttributeError):
            continue
        treffer = je_turnier.get(tid) or {}
        tatsaechlich = sum(treffer.values())
        if not treffer:
            if gemeldet > 0:
                # Das Datum mitschreiben: 443 und 444 sind die Thailand-
                # und die Japan-Championships von MAI 2024, gepruefen am
                # 22.08.2026 an der Quelle. Ihre Kartendaten stammen aus
                # der Zeit vor der Chunk-Aufteilung und liegen in keiner
                # der heutigen Dateien. Ohne das Datum in der Meldung
                # wird dieser Befund alle paar Wochen neu untersucht.
                datum = col(z, "tournament_date") or "?"
                ohne_chunk.append(f"{tid} vom {datum} (Uebersicht: {gemeldet})")
            continue
        if tatsaechlich != gemeldet:
            abweichungen.append(
                f"{tid}: Uebersicht {gemeldet}, Chunk "
                f"{tatsaechlich} ({'+'.join(sorted(treffer))})")

    if abweichungen:
        findings.append((
            "WARN",
            f"{len(abweichungen)} Turnier(e) mit abweichender Kartenzahl "
            f"zwischen Uebersicht und Chunkdatei: "
            + "; ".join(abweichungen[:6])
            + ("; …" if len(abweichungen) > 6 else "")))
    if ohne_chunk:
        findings.append((
            "WARN",
            f"{len(ohne_chunk)} Turnier(e) stehen in der Uebersicht, aber in "
            f"keiner Chunkdatei (bei Turnieren von vor der Chunk-Aufteilung "
            f"ist das erwartbar, nicht reparierbar und kein Datenverlust): " + ", ".join(ohne_chunk[:8])
            + ("; …" if len(ohne_chunk) > 8 else "")))


def tote_spalten():
    """{Datei: [Spalte, ...]} — Pflichtspalten der Consumer-Dateien, in denen
    KEINE einzige Zeile einen Wert traegt.

    Warum das fehlte: check_schema prueft nur, dass der Spaltenname im Kopf
    steht. Eine Spalte darf danach zu 100 % leer sein und gilt trotzdem als
    vorhanden. GEMESSEN am 29.08.2026: cardmarket_card_images.csv fuehrt
    `number` und `name_de` im Kopf, beide sind in allen 1295 Zeilen leer —
    und `number` ist eine der beiden Spalten, ueber die die Hausregel das
    Verknuepfen ueberhaupt erlaubt. Ebenso: top8/top16/top32_conv_rate sind
    in allen 14 labs_tournament_decks*.csv durchgehend 0.

    Grundlinien-Vergleich, nicht absolute Schwelle: eine Spalte, die seit
    jeher leer ist, ist ein bekannter Zustand. Neu leer geworden ist ein
    Ereignis."""
    out = {}
    for datei, eintrag in CONSUMERS.items():
        # CONSUMERS ist {Datei: {"required": [...], "purpose": "..."}} —
        # die Pflichtspalten stehen eine Ebene tiefer. Die erste Fassung
        # iterierte ueber die Schluessel des inneren Wortverzeichnisses und
        # meldete brav "purpose und required sind leer" fuer jede Datei.
        spalten = eintrag.get("required", []) if isinstance(eintrag, dict) else eintrag
        pfad = os.path.join(DATA, datei)
        if not os.path.exists(pfad):
            continue
        zeilen = list(read_csv(pfad))
        if not zeilen:
            continue
        leer = []
        for sp in spalten:
            if all(not (col(r, sp) or "").strip() for r in zeilen):
                leer.append(sp)
        if leer:
            out[datei] = sorted(leer)
    return out


def check_tote_spalten(findings, cur, base):
    if cur is None or base is None:
        return
    for datei in sorted(set(cur) | set(base)):
        neu_leer = sorted(set(cur.get(datei, [])) - set(base.get(datei, [])))
        wieder_da = sorted(set(base.get(datei, [])) - set(cur.get(datei, [])))
        if neu_leer:
            findings.append(("CRITICAL",
                             f"{datei}: Pflichtspalte(n) {neu_leer} sind jetzt in JEDER "
                             f"Zeile leer — der Header steht noch, der Inhalt ist weg"))
        if wieder_da:
            findings.append(("INFO",
                             f"{datei}: {wieder_da} traegt/tragen wieder Werte"))


def inhalt_gegen_datei():
    """{Datei: (juengstes Datum im Inhalt, Commitdatum)} fuer die Dateien, die
    ein eigenes Datum fuehren.

    Warum: GEMESSEN am 29.08.2026 wurde labs_tournament_decks.csv am 25.08.
    committet, das juengste Turnier darin war vom 12.06. — 74 Tage Abstand.
    Der angezeigte Datenstand war damit zwei Monate optimistischer als die
    Daten. Das war KEIN Ausfall (der Betreiber hat Sommerpause bestaetigt),
    aber es war auch nicht sichtbar. Beides gehoert gemeldet: ein wachsender
    Abstand kann Sommerpause heissen oder einen stillen Scraper-Ausfall —
    unterscheiden kann das nur ein Mensch, und dafuer muss er es sehen."""
    felder = {
        "labs_tournament_decks.csv": "tournament_date",
    }
    out = {}
    for datei, spalte in felder.items():
        pfad = os.path.join(DATA, datei)
        if not os.path.exists(pfad):
            continue
        werte = set()
        for r in read_csv(pfad):
            v = (col(r, spalte) or "").strip()[:10]
            if len(v) == 10 and v[4] == "-" and v[7] == "-":
                werte.add(v)
        if not werte:
            continue
        # _last_commit_date liefert ein date-Objekt, kein ISO-Wort.
        c = _last_commit_date(os.path.join("data", datei))
        out[datei] = [max(werte), c.isoformat() if c else ""]
    return out


def check_inhalt_gegen_datei(findings, cur):
    """Braucht keine Grundlinie: der Abstand ist auch beim ersten Lauf eine
    Aussage ueber den Zustand."""
    if not cur:
        return
    for datei, (inhalt, commit) in sorted(cur.items()):
        if not commit:
            continue
        try:
            di = dt.datetime.strptime(inhalt, "%Y-%m-%d")
            dc = dt.datetime.strptime(commit, "%Y-%m-%d")
        except ValueError:
            continue
        abstand = (dc - di).days
        if abstand >= 30:
            findings.append(("WARN",
                             f"{datei}: zuletzt geschrieben am {commit}, juengster "
                             f"Eintrag aber vom {inhalt} — {abstand} Tage Abstand. "
                             f"Entweder Turnierpause oder ein Scraper, der still "
                             f"nichts Neues findet; das entscheidet nur ein Blick "
                             f"auf die Quelle"))


def check_ace_liste(findings):
    """data/ace_specs.json ist von Hand gepflegt. Geprueft wird, was sich im
    Repo pruefen LAESST: innere Stimmigkeit und Alter. NICHT geprueft werden
    kann die Vollstaendigkeit — all_cards_merged.csv kennt keine Raritaet
    'ACE SPEC', es gibt also keine unabhaengige Referenz."""
    pfad = os.path.join(DATA, "ace_specs.json")
    if not os.path.exists(pfad):
        return
    try:
        with open(pfad, encoding="utf-8") as f:
            d = json.load(f)
    except (OSError, ValueError):
        return
    namen = [str(n).strip().lower() for n in d.get("ace_specs", []) if str(n).strip()]
    eindeutig = set(namen)
    if len(namen) != len(eindeutig):
        doppelt = sorted({n for n in namen if namen.count(n) > 1})
        findings.append(("WARN",
                         f"ace_specs.json: {len(namen) - len(eindeutig)} doppelte "
                         f"Eintraege ({doppelt}) — fuer die Anwendung folgenlos, aber "
                         f"total_count zaehlt sie mit"))
    if d.get("total_count") != len(eindeutig):
        findings.append(("WARN",
                         f"ace_specs.json: total_count sagt {d.get('total_count')}, "
                         f"es sind {len(eindeutig)} eindeutige Namen"))
    ts = str(d.get("timestamp") or "")[:10]
    if ts:
        try:
            alter = (dt.datetime.now() - dt.datetime.strptime(ts, "%Y-%m-%d")).days
            if alter > 120:
                findings.append(("INFO",
                                 f"ace_specs.json ist {alter} Tage alt (Stand {ts}) und "
                                 f"wird von Hand gepflegt. Ob seither Ace Specs "
                                 f"dazugekommen sind, laesst sich hier nicht feststellen"))
        except ValueError:
            pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--update-baseline", action="store_true",
                    help="write the current state to the baseline after reporting")
    ap.add_argument("--strict", action="store_true",
                    help="exit 1 if any CRITICAL finding (default: always exit 0)")
    args = ap.parse_args()

    baseline = {}
    if os.path.exists(BASELINE):
        try:
            with open(BASELINE, encoding="utf-8") as f:
                baseline = json.load(f)
        except Exception as e:  # noqa: BLE001
            print(f"::warning::could not read baseline ({e}) — treating as first run")

    base_cov = {k: tuple(v) for k, v in baseline.get("set_coverage", {}).items()}
    base_rows = baseline.get("file_rows", {})
    first_run = not baseline

    cov = set_coverage()
    rows = file_rows()
    ace = ace_guard_prints()
    tot = tote_spalten()
    inhalt_alter = inhalt_gegen_datei()
    price = price_integrity()
    empties = empty_data_files()
    jp_sets = None

    findings = []
    check_schema(findings)
    check_freshness(findings)
    check_set_order(findings)
    check_shrink(findings, rows, base_rows)
    report_unverified_prices(findings)
    if first_run:
        print("First run — recording baseline; change-based checks start next run.")
    else:
        check_coverage(findings, cov, base_cov)
        check_ace_guard(findings, ace, baseline.get("ace_guard_prints"))
        check_price_integrity(findings, price, baseline.get("price_integrity"))
        check_emptiness(findings, empties, baseline.get("empty_files"))
        check_tote_spalten(findings, tot, baseline.get("tote_spalten"))
    # Der Paar-Widerspruch braucht keine Grundlinie: er ist auch beim ersten
    # Lauf eine Aussage ueber den Zustand, nicht ueber eine Veraenderung.
    check_paired_emptiness(findings, empties)
    # Widersprueche brauchen keine Grundlinie.
    check_verified_collisions(findings, price)
    check_inhalt_gegen_datei(findings, inhalt_alter)
    check_ace_liste(findings)
    check_kartentext_bericht(findings)
    check_meta_preiszuordnung(findings)
    check_geteilte_produkt_ids(findings)
    champions_ueber_grenze = check_champions_usage(findings, baseline)
    check_champions_namen(findings)
    check_champions_freshness(findings)
    champions_teams = check_champions_teams(findings, baseline.get("champions_teams"))
    check_uebersicht_gegen_chunks(findings)
    check_proxy_frische(findings)
    check_proxy_karte_gegen_bestand(findings)
    jp_sets = check_jp_setbestand(findings)
    if not first_run:
        check_jp_setbestand_vergleich(findings, jp_sets, baseline.get("jp_set_rows"))

    crit = [f for lvl, f in findings if lvl == "CRITICAL"]
    warn = [f for lvl, f in findings if lvl == "WARN"]
    # INFO wurde gesammelt und nie ausgegeben (20.08.2026). Zwei Pruefungen
    # melden auf dieser Stufe — report_unverified_prices und die neue
    # Champions-Pruefung —, und beide waren damit stumm. Eine Meldung, die
    # niemand sieht, ist keine Meldung.
    info = [f for lvl, f in findings if lvl == "INFO"]

    print(f"\nData guardian — {len(cov)} sets, {len(rows)} consumer files checked")
    print(f"  CRITICAL: {len(crit)} | WARN: {len(warn)} | INFO: {len(info)}")
    for f in crit:
        print(f"::error::{f}")
    for f in warn:
        print(f"::warning::{f}")
    for f in info:
        print(f"::notice::{f}")
    if not findings:
        print("  All checks passed — no action needed.")

    # Report only. Nothing above ever edits the data it inspects.
    if args.update_baseline:
        with open(BASELINE, "w", encoding="utf-8") as f:
            json.dump({
                "generated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
                "set_coverage": {k: list(v) for k, v in sorted(cov.items())},
                "file_rows": rows,
                "ace_guard_prints": ace,
                "price_integrity": price,
                "empty_files": empties,
                "tote_spalten": tot,
                "jp_set_rows": jp_sets or {},
                "champions_teams": champions_teams,
                "champions_ueber_grenze": champions_ueber_grenze,
            }, f, ensure_ascii=False, indent=1, sort_keys=True)
        print(f"  Baseline updated -> {BASELINE}")

    return 1 if (args.strict and crit) else 0


if __name__ == "__main__":
    sys.exit(main())
