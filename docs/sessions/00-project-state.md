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
  NOTE: NAIC's JH-id is **not yet in the JH ledger** (max id 563) → NAIC has not
  been scraped by the limitlesstcg.com pipeline yet (its lists may not be posted
  there). The code fix prevents future poisoning; whether NAIC ever lands in
  Past Meta depends on limitlesstcg.com publishing it (OPEN — see below).
- ⚠️ Discarded a dangerous idea: purging all JH-ledger ids >540. Verified those
  (542–563) are **legit older-meta tournaments with data** in SVI-ASC/SVI-PFL/
  TEF-POR chunks — purging them would have created duplicates.

### Verified REAL, not yet fixed
- **Denominator bug** in `current_meta_card_data.csv`: append-merge in
  `card_scraper_shared.py:889` keys on `archetype|card_name` (not `meta`, denom
  not in key). 55/105 (archetype,meta) groups have inconsistent
  `total_decks_in_archetype`; ~38% of rows carry a stale denominator → wrong
  `percentage_in_archetype` (up to +83pp). Frontend masks it with max()/min()
  band-aids (`app-current-meta-analysis.js:524`). Root cause unfixed.
  + Compounding: Meta Play! card names skip `fix_mojibake()`
  (`current_meta_analysis_scraper.py:~491`) → `PokÃ© Pad` duplicates (52 rows).
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
P1: cross-pipeline reconciliation sanity-gate ("every tournament in the current
labs file must appear in the cards + current_meta outputs"; allowlist the
intentionally-empty JP City League files — Japan summer break) · SHA-pinning ·
trainer-variant consolidation · JP "EN beats JP" dedup.
P1 champions guardrails: post-generation validator that every referenced
move/item/ability/species is on the team's paste (resolve Mega-derived forms!) ·
regex-guard numeric speed/KO claims + actually load speed_corpus + battle_data ·
per-rotation reference-coverage check · set temperature low · force clean v4 regen.
P2: F-006 HTML-as-data confirm · npm lockfiles in bot/+prerender · firebase-admin pin.
P3 (own sessions): Firebase v9→v10 modular · monolith code-split per tab.

## Open questions for the maintainer
- **Past Meta NAIC**: it's in labs but not (yet) on limitlesstcg.com/JH. Should
  Past Meta fall back to labs data for in-person majors, or do we wait for
  limitlesstcg.com to publish? (The JH code fix is in either way.)
- Sequence: bundle the denominator+mojibake fix with the reconciliation sanity-gate
  next, or ship the small wins (.bat, SHA-pinning) first?
