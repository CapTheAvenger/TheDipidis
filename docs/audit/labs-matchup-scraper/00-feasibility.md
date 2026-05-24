# labs.limitlesstcg.com Matchup-Scraper — Feasibility & Plan

**Status:** User asleep, autonomous investigation + implementation.
**Branch:** `audit/labs-matchup-scraper`

## What the user discovered

`labs.limitlesstcg.com` exposes per-archetype matchup data — for each
deck in a tournament (or combined-tournament view), clicking through
shows a full matchup matrix with **opponent deck**, **count**, and
**win %**, plus a **Day 2 filter** toggle.

Today our Meta Call uses `data/limitless_online_decks_matchups.csv`
(current online ladder matchups) as a proxy. Major-tournament
matchups are demonstrably more representative of in-person play. User
wants the Major matchups weighted **3:1** over online.

## What we already scrape

`backend/scrapers/labs_tournament_scraper.py` hits per-tournament
`/{tournament_id}/decks` and produces `data/labs_tournament_decks.csv`
with:

- `deck_slug` (e.g. `dragapult`) — captured from the deck-list href
- `player_count`, `share_pct`, `wins`/`losses`/`ties`, `win_pct`
- Day-1 / Day-2 splits via `/{tid}/decks?day1` and `?day2`
- `top8_conv_rate` etc. via `/{tid}/decks?conversion`

What we DO NOT scrape: per-archetype detail pages with matchup matrix.

## URL pattern (inferred — needs verification)

From `labs_tournament_scraper.py:332`:
```python
deck_slug = deck_href.rsplit('/', 1)[-1]
```

The deck-list table at `/{tid}/decks` has `<a href="...">` links to
per-archetype details. The slug is the last path segment. Convention
suggests the full URL is:

```
https://labs.limitlesstcg.com/{tournament_id}/decks/{deck_slug}
```

Day-filter variants would follow the same `?day1` / `?day2` pattern
the per-tournament summary uses.

**Verification path:** the existing scraper captures the full `href`
in `deck_link.get('href', '')` at line 331 but only uses the slug. We
can log the FULL href on next scrape run to confirm the URL structure
without doing exploratory fetches.

## Expected HTML structure (from screenshots)

```
<h1>Dragapult</h1>
<p>738 players: 2891 wins - 2447 losses - 1004 ties (50.86% WR)</p>

<button>Day 2 filter OFF</button>

<table class="data-table">
  <thead><tr><th></th><th>Deck</th><th>#</th><th>Win %</th></tr></thead>
  <tbody>
    <tr>
      <td><img class="pokemon" src="..."></td>
      <td><a href="/539/decks/dragapult-dusknoir">Dragapult Dusknoir</a></td>
      <td>456</td>
      <td>58.92%</td>
    </tr>
    ...
  </tbody>
</table>
```

**Confidence:** medium-high — matches the patterns in the existing
fixture (`tests/python/fixtures/limitless_decks_listing_2026_05.html`).
Defensive coding required for production: multi-selector fallbacks,
graceful skip on parse failures.

## What I'll deliver in this PR

### Phase A — Scraper extension (CODE)
1. `scrape_archetype_matchups(tournament_id, deck_slug, day_filter)` —
   fetches `/{tid}/decks/{slug}` (with optional `?day1`/`?day2`)
   and parses the matchup table.
2. Wire into existing `scrape_tournament_decks()` flow as an opt-in
   second pass (CLI flag `--matchups`); writes `data/labs_tournament_matchups.csv`.
3. Defensive parser: multiple selector fallbacks, logs skip reasons.

### Phase B — Meta Call consumer (CODE)
1. Load `data/labs_tournament_matchups.csv` if present.
2. Build `_majorMatchupMap[norm(deck)][norm(opp)] -> {wins, losses, ties, count, winPct}`.
3. New `_blendMatchup(pair)` helper: when Major data exists with
   sufficient sample (≥10 games), return `(major × 3 + online × 1) / 4`;
   else return online unchanged.
4. Apply in `getBaseMatchup()` (line 2912 area).
5. UI hint: small ⓘ on per-deck matchup column when Major data drove the blend.

### Phase C — Tests
1. `tests/python/fixtures/labs_archetype_matchup_*.html` — synthetic
   fixtures matching the screenshot structure.
2. `tests/python/test_labs_matchup_parser.py` — parser contract:
   correct counts, win-rates, no zero-division, day-filter detection.
3. `tests/python/test_labs_matchup_aggregation.py` — multi-tournament
   aggregation contract (deck Dragapult played across 4 majors).

### Phase D — NOT IN THIS PR
- Actual scrape backfill (3250+ HTTP requests, ~80 min) — user must
  trigger from CI or local once they've reviewed the parser. This
  sandbox can't fetch labs.* anyway (Cloudflare 403 confirmed via
  WebFetch + cloudscraper probes).

## Rollout plan (user-driven, post-merge)

1. Review parser logic against a 1-tournament dry-run:
   `python backend/scrapers/labs_tournament_scraper.py --matchups --tournament 539 --dry-run`
2. If output looks right, run full backfill: `--matchups --all`
3. Schedule weekly via existing labs workflow when CRI majors begin
4. Meta Call lights up the 3:1 Major-weighted blend automatically when
   the new CSV is present (gracefully no-op when missing)

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Real HTML differs from screenshot-inferred structure | Multi-selector fallbacks; first dry-run flagged as user-validation step |
| Cloudflare rate limits at scale | Reuse existing `safe_fetch_html` (cloudscraper) + 1.5s delay |
| ~80 min backfill blocks CI | Make scraper opt-in via CLI flag, not auto-on |
| CSV explosion (3250+ rows) | Per-deck per-tournament per-opponent ~ 100k rows max — manageable; chunk if needed later |
| Meta Call breaks when CSV missing | Loader returns null gracefully; consumer guards with `if (majorMap)` |
| Major data outdates (TEF-POR closes) | Tag rows with `meta` (format key) so we can filter per format like the chunks |
