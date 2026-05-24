# labs Matchup Scraper — Phase 7 final

## What landed

### Scraper (`backend/scrapers/labs_tournament_scraper.py`)
- New `scrape_archetype_matchups(tournament_id, deck_slug, day_filter)` —
  fetches `/{tid}/decks/{slug}` (with optional `?day1`/`?day2`),
  parses the per-opponent matchup table.
- `_parse_player_summary()` extracts the "N players: W-L-T (WR% WR)"
  header line via a robust regex that tolerates spacing/punctuation
  variants.
- Defensive parser — multi-selector fallbacks for both the summary
  text and the matchup table; per-row try/except keeps a single bad
  parse from killing the whole pass.
- New `MATCHUP_CSV_HEADER` + `build_matchup_rows()` + `save_matchup_rows()`
  emit `data/labs_tournament_matchups.csv` with full provenance
  (tournament_id, tournament_date, meta tag, my_deck + opp_deck +
  count + WR + day_filter + scraped_at).
- New CLI flags:
  - `--matchups` — opt-in second pass after deck-list scrape
  - `--matchup-days {overall day1 day2}` — which filter(s) to scrape
    (default `overall`); each filter = one extra HTTP per deck
  - `--matchup-meta TEF-POR` — tag matchup rows with the format key
    for downstream chunking

### Frontend (`js/app-meta-call.js`)
- New `_majorMatchupMap` state + lazy loader in `loadData()` (graceful
  no-op when CSV missing).
- Aggregator: per (`my_deck`, `opp_deck`) pair, sum games + weighted-
  avg WR across tournaments. Only keep pairs with ≥10 games sample.
- `getBaseMatchup()` now blends: when Major data has the pair (forward
  OR reverse-mirrored), apply `(major × 3 + online × 1) / 4` to the
  win-probability, clip to `[0.05, 0.95]`, preserve the base tie rate.

### Test coverage
- 7/7 `test_labs_matchup_parser.py` — parser contract against
  synthetic fixture mirroring 2026-05-24 screenshots (header summary,
  6 opponent rows, edge cases).
- 58/58 backend pytest pass (was 51 — +7 new).
- 7/7 Node blend-math test — Crustle/Dragapult canonical case shifts
  67% online → 49.2% blended, in line with user's flagged labs reality.

## What did NOT land in this PR

- **Actual historical backfill** of matchup data. The scraper code is
  here, but the sandbox env can't fetch labs.* (Cloudflare 403 on
  both WebFetch and cloudscraper). User must trigger from CI or local:

  ```bash
  # Dry-run on one tournament to validate the parser against live HTML
  python backend/scrapers/labs_tournament_scraper.py \
      --matchups --tournament-id 539 --matchup-meta TEF-POR

  # Full backfill for one meta (4 TEF-POR tournaments × ~50 decks
  # × 1.5 s delay ≈ 5 min per filter; overall + day1 + day2 ≈ 15 min)
  python backend/scrapers/labs_tournament_scraper.py \
      --matchups --tournament-id 539 540 544 558 \
      --matchup-days overall day2 --matchup-meta TEF-POR
  ```

  When CRI majors land, the weekly workflow can be extended with
  `--matchups --matchup-days overall day2` to keep the matrix fresh.

- **Share-weight 3:1 bump** the user also mentioned. Existing
  Predictor 2.0 has a sophisticated share-blending chain (`_runPredictor`)
  with multiple weighted contributors (ladder, labs broughts, tournament
  stats, Day-2 conv multiplier). Bumping the Major-share weight to 3×
  requires touching several blend points and is risky without a careful
  audit. Filed as follow-up after first matchup-blend dry-run lands.

- **UI badge** showing when Major-driven blend fired on a specific
  matchup. Currently logged via console only. Adding a small ⓘ on the
  matchup detail UI is a 30-line follow-up.

## Caveats user should know

1. **Parser is screenshot-derived**, not live-verified. First real
   scrape is the validation step — if the live HTML differs from the
   fixture (different class names, different cell order), the parser
   may return empty matchup lists. Each row is logged, so a zero-row
   tournament is immediately visible.
2. **Backfill cost**: 65 historical tournaments × ~50 decks × 1.5s
   delay = ~80 min for overall filter only. Day-2 filter doubles it.
   Run during off-hours.
3. **Cloudflare** may rate-limit a long scrape. Existing
   `safe_fetch_html` retries with 30s backoff on 429/503; if it
   plateaus, add a `--delay 3.0` to extend the gap.
4. **Major matchup data outdates** when a meta rotates. The CSV row's
   `meta` column lets Meta Call filter per format like the chunks
   do — needed once Past Meta Source (PR #198) consumes Major
   matchups too.
5. **Blend gate**: matchups with <10 sample games are NOT blended
   (the Major number alone is too noisy). Tuned per `MAJOR_MATCHUP_MIN_GAMES`
   in `app-meta-call.js`.

## How to validate post-merge

1. Trigger a dry-run scrape on one tournament:
   ```
   python backend/scrapers/labs_tournament_scraper.py \
       --matchups --tournament-id 539 --matchup-meta TEF-POR
   ```
2. Open `data/labs_tournament_matchups.csv` — should contain ~50
   rows × N-1 opponents per row.
3. Visually compare against the labs.* page for the same tournament
   to verify the numbers match.
4. Open Meta Call in browser. With source=Past Meta + format=TEF-POR
   (from PR #198), the matchup column in any deck card should now
   reflect Major-blended WR; check console for the
   `Major matchup map: ... pairs with ≥10 games (3× weight blend active)`
   log line.
