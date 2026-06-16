# Project State — TheDipidis

> Restart anchor. If a session crashes, **read this file first** instead of
> re-deriving the whole project. Keep it updated at the end of every session.
> Last updated: 2026-06-15.

## What this project is
Pokémon TCG analysis platform (thedipidis.app). Python scrapers pull data from
Limitless TCG, Cardmarket and Play! Pokémon, write CSV/JSON into `data/`, which
a monolithic vanilla-JS SPA (`index.html` + `js/*.js`, IIFEs, no bundler) renders.
User data (decks, collection, battle journal) lives in Firebase (v9.22.0 compat).
A Telegram bot (Render) + Puppeteer prerender are companions.

## Working conventions
- Replies to the maintainer: **German**. Code/filenames/commits/branches: English.
- Maintainer has little programming experience → explain the *why*, deliver
  complete proactive solutions, avoid debugging ping-pong.
- Philosophy: stable before complex, useful before perfect, automation over manual.
- Always work on a feature branch, never commit to `main` unasked, run tests
  before declaring done. Treat recovered-session notes as **hints, verify in code**.
- Active dev branch: `claude/dipidis-project-overview-cf6b95`.

## Data pipeline (the part that bites)
Three tournament pipelines, each with its own "scraped-ids" ledger:
- `labs_tournament_scraper.py` → `labs_tournament_decks_*.csv` (source: labs.limitlesstcg.com, ids like `0070`).
- `current_meta_analysis_scraper.py` → `current_meta_card_data.csv` ("Current Meta Global"; Meta Live ladder + Meta Play! from labs).
- `tournament_scraper_JH.py` → `tournament_cards_data_cards_*.csv` ("Past Meta"; source: limitlesstcg.com, different id scheme).
`prepare_card_data.py` (backend/core) is the finalizer; it splits the JH monolith
into per-meta chunks **by the `meta` column** and merges EN+JP+prices into
`cards_chunk_*.json`. The monolith `tournament_cards_data*.csv` is gitignored and
reassembled in CI from the committed per-meta chunks.

## Bugs found & their status (2026-06-15 session)

### FIXED this session — NAIC / empty-probe ledger poisoning
Root cause: a scraper probes a tournament before its decklists are published →
gets 0 decks → still writes the id into its ledger as "done" → skips it forever
(no revisit). Labs got a revisit fix on 2026-06-15; the other two pipelines did not.
- **Current Meta Global**: `0070` (NAIC) was poisoned in
  `data/current_meta_scraped_tournaments.json`. The code guard already exists
  (only marks scraped when decks found). **Fix applied: removed `0070` from the
  ledger** → next CI run re-pulls NAIC from labs.
- **Past Meta (JH)**: `tournament_scraper_JH.py` marked empty/failed probes as
  scraped (lines ~1074 and ~1101). **Fix applied: only commit an id to the ledger
  when the tournament yielded real deck rows; empty/failed probes are revisited.**
  ROOT CAUSE FOUND 2026-06-16 (from the 11:05 UTC run's CI log via the GitHub
  MCP): the JH scraper was **crashing at startup every run** —
  `_reassemble_monolith_from_chunks` raised `ValueError: dict contains fields
  not in fieldnames: 'is_ace_spec,'`. The committed
  `tournament_cards_data_cards_TEF-CRI.csv` had a **corrupted header** with a
  stray trailing comma on its last column (`is_ace_spec,`); every other chunk
  has `is_ace_spec`. The writer crashed on the mismatch, so the scraper aborted
  BEFORE discovering any tournament — 518 was never even reached (my earlier
  Expanded tweak + the JP flag heuristic were red herrings: the discovery loop
  never ran). FIX: (1) repaired the TEF-CRI header, (2) hardened
  `_reassemble_monolith_from_chunks` to strip trailing commas/whitespace from
  every chunk's field names + `extrasaction="ignore"`, so a malformed header
  can never silently kill the scraper again (2 regression tests). The
  reconciliation sanity-gate I added earlier CORRECTLY fired the
  `::warning::` for the missing NAIC — good validation. Next run should now
  discover + scrape 518 and land NAIC in Past Meta + Deck Analysis Global.
  POST-RUN GOOD STATE: current_meta ledger has 0069+0070, deck-cache holds 512
  decks from both, Meta Play! grew to ~1309 rows, and the new EN-beats-JP dedup
  suppressed **1632** JP prints — those pipelines work; only the JH cards side
  was blocked by the crash.

### Meta Call display — stack ALL current-format majors (2026-06-16)
Current Meta showed only the LAST major per deck (single chip = NAIC), hiding
Turin and its 🏆 winner. Past Meta already stacks every major with a 🏆 on the
winner. Fixed: Current Meta uses the same stack when the in-person majors are
the current format (not the lag window), so each deck shows NAIC (winner
Lillie's Clefairy 🏆) AND Turin (winner Hop's Trevenant 🏆). Display only —
predictor math untouched. Meta Call freeze LIFTED by maintainer (accuracy = top
priority). Data verified: Lillie's won NAIC (top1=1, 1.12%), Hop's won Turin
(top1=1, 0.44%) — so the winner markings were a display gap, not bad data.
- ⚠️ Discarded a dangerous idea: purging all JH-ledger ids >540. Verified those
  (542–563) are **legit older-meta tournaments with data** in SVI-ASC/SVI-PFL/
  TEF-POR chunks — purging them would have created duplicates.

### Verified REAL, not yet fixed
- **Denominator bug** in `current_meta_card_data.csv` — FIXED 2026-06-16
  (PRs #420 + deck-cache): `_merge_current_meta_rows` replaces each meta's rows
  wholesale (no stale rows, `meta` in key so Live can't clobber Play). Mojibake
  fixed (`fix_mojibake()` on Meta Play! names). Meta Play! cumulative
  denominators fixed via a raw-deck cache: `data/meta_play_decks_cache.json`
  holds each major's raw decks keyed by tournament_id, so the full Meta Play!
  aggregate is recomputed every run WITHOUT re-scraping (ledger still gates
  fetching). The cache is a state file paired with the ledger everywhere:
  weekly seed step, `prepare_card_data.SYNC_PATTERNS`, and the `update_sets.py`
  rotation reset. The current_meta ledger was reset to empty once so the next
  run re-scrapes all current majors to populate the cache (and lands NAIC in
  Meta Play!).
- **PUSH_TO_GITHUB.bat footgun** — FIXED 2026-06-16: pointed the bat at
  `backend\core\prepare_card_data.py` and deleted the 0-byte dead root file.
  CI was always fine (uses full path); this only affected local `.bat` pushes.
- **keep_latest_sets divergence**: config=1, japanese settings=12, hardcode=4.
  Decision: don't drive by set count — keep JP CSVs but make the **international
  (EN) print always win on card identity** in merge/dedup.
- **SHA-pinning**: workflows use floating tags (`@v4`); should pin to commit SHAs.
- **Trainer-variant normalization** (N's/Rocket's/Hop's) duplicated in 4 JS files,
  missing in the predictor → consolidate into one `app-core.js` helper.

### Cleared (NOT bugs)
- F-D07 slug collisions: the merged slugs are synonyms of the *same* deck, not
  distinct archetypes. Family shares are not inflated.
- F-001 (all_cards_scraper not in CI): now in weekly CI.
- F-24 Firestore drift: repo rules == live rules (maintainer confirmed). Minor:
  publicProfiles/invites world-readable to authed users; no size validation on
  user writes (cost, not security). No auto-sync of rules (process gap, later).
- F-01 dead playtester loader: removed (we point to TCG Showdown instead).
- Champions strategies: **0 hallucinations** in the 20 live strategies (verified).
  Only guard today is the Mega-form check; see guardrail plan below.

## Approved backlog (maintainer said yes; do on feature branch, with tests)
P0 data integrity: NAIC fix (DONE) · denominator+mojibake fix · .bat footgun.
P1: ~~cross-pipeline reconciliation sanity-gate~~ DONE 2026-06-16
(`scripts/reconcile_tournament_coverage.py` + test + wired into
weekly-full-update.yml; soft `::warning::`, matches labs↔cards majors by
date+fuzzy-name, grace period so fresh majors don't false-alarm; flip to
`--strict` later to hard-gate). The existing `scripts/sanity_check_data.py`
already covers the F-D19 row-count layer (revert empty/short CSVs). ·
~~SHA-pinning~~ DONE 2026-06-16 (all 30 action uses across 11 workflows pinned
to full commit SHAs with `# vX` comments; added `.github/dependabot.yml` to keep
them current).

~~Trainer-variant consolidation~~ DONE 2026-06-16: `window.stripTrainerOwnerPrefix`
in app-core.js is the single source of truth (generic `X's ` match, both
apostrophes, multi-word owners). custom-binder (hardcoded 3-owner list — the real
bug), app-cards-db (straight-quote-only regex) and app-deck-builder (single-word
regex) all switched to it; meta-binder's fuzzy tokenizer left as-is. JS unit
test added. Predictor (app-meta-call.js) injection — VERIFIED NOT NEEDED
2026-06-16 (freeze lifted): the predictor matches archetypes via `normalize()`
which strips only apostrophe TYPOGRAPHY, not the owner prefix, so "N's Zoroark"
(`nszoroark`) already stays distinct from "Zoroark" (`zoroark`). Injecting the
strip helper would MERGE distinct archetypes and HARM accuracy — the old
"trainer-disambiguation bug" suspicion was a false alarm. Deliberately left
unchanged. Any real predictor tuning belongs with the August backtest harness.

**JP "EN beats JP" dedup — DONE 2026-06-16** (maintainer supplied the missing
data source). The EN card detail page (`/cards/CRI/1`) lists the JP counterpart
under "JP. Prints" (`/cards/jp/M4/1`). `all_cards_scraper.parse_prints_table`
now captures those into a new `jp_prints` column ("<SET>-<NUM>"), and
`prepare_card_data.create_merged_database` drops any JP card whose id appears in
some EN card's `jp_prints` — so the international print wins and genuinely-JP-only
cards (no EN counterpart yet) stay. Parser verified against the real HTML sample;
4 unit tests. Takes effect on the next detail-scraping run (the weekly batch).
(Name-based dedup was correctly rejected earlier — it would hide genuinely-new
JP cards like Tropius M5-1 that merely share a name with an older EN Tropius.)
~~P1 champions guardrails~~ DONE 2026-06-16: `find_offteam_moves` rejects any
move the German guide attributes that no team Pokémon runs (prompt rule #2) —
German-guide + English-canonical-only matching, validated zero false positives
on all 20 live strategies; wired into `validate_strategy_facts`. Plus a
per-rotation `reference_coverage` `::warning::`. NOT done (with reasons):
temperature stays unset — extended thinking requires temperature=1, so the
audit's "set it low" is impossible; the validators are the lever instead. The
numeric speed/KO guard + loading speed_corpus/battle_data into the prompt is
deferred (current guides are qualitative; preventive only). Clean v4 regen needs
no code — cached entries are v2/v3 < PROMPT_VERSION=4 so the next run
regenerates them through the new validator.
P2: F-006 HTML-as-data confirm · npm lockfiles in bot/+prerender · firebase-admin pin.
P3 (own sessions): Firebase v9→v10 modular · monolith code-split per tab.

## Open questions for the maintainer
- **Past Meta NAIC**: it's in labs but not (yet) on limitlesstcg.com/JH. Should
  Past Meta fall back to labs data for in-person majors, or do we wait for
  limitlesstcg.com to publish? (The JH code fix is in either way.)
- Sequence: bundle the denominator+mojibake fix with the reconciliation sanity-gate
  next, or ship the small wins (.bat, SHA-pinning) first?
