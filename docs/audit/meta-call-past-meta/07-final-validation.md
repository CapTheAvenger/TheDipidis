# Phase 7 — Final validation

## What was changed

- New `_metaSource` / `_pastMetaFormatKey` / `_pastMetaAvailableFormats` state in
  `js/app-meta-call.js:38-50`
- New `_loadPastMetaCatalog()` (manifest fetcher, current-set-filter)
- New `_loadPastMetaShares(formatKey)` (chunk aggregator with price-tag strip)
- New `_pastMetaToShareList(aggregate)` (shape mapper to `_shareList` contract)
- New `_setMetaSource(source, formatKey)` (single mutation point + re-render)
- New `renderMetaSourcePanel()` (UI: pills + format dropdown + matchup-proxy hint)
- Source-aware routing in `_jumpToDeckAnalysis` (branches to
  `navigateToPastMetaWithDeck` when source = past)
- New `window.navigateToPastMetaWithDeck(deckName, formatKey)` in
  `js/app-core.js` (parallel to `navigateToCurrentMetaWithDeck` —
  two-stage poll on format dropdown then deck dropdown)
- CSS additions for `.mc-source-format-*` in `css/meta-call.css`

## Verified

### Data integrity
- TEF-POR aggregation: 44 archetypes, 1297 decks, 4 tournaments —
  matches probed reality
- Dragapult lead 14.96 %, family combined 37.17 % — consistent with
  TEF-POR meta documentation in pipeline comments
- All 6 past-meta formats aggregate without explosion (price-tag
  strip works across the board)
- SVI-PFL regression: 2238 archetypes → 62 (post-strip)
- Manifest filter: current_set=CRI hides nothing (no `*-CRI` chunks);
  hypothetical current_set=POR correctly hides TEF-POR

### Tests
- 10/10 new `test_past_meta_aggregation.py` pass — locks the
  aggregation contract + the price-tag-strip regression
- 61/61 backend pytest pass (was 51 before this PR)
- 40/40 verify-baseline (W3 Phase 1-6 pipeline unchanged)
- 17/17 manifest+format E2E smoke
- 13/13 cross-format aggregation smoke (post-strip)

### Routing
- `navigateToPastMetaWithDeck` mirrors `navigateToCurrentMetaWithDeck`
- Two-stage polling handles the lazy chunk-load that fires on
  format-filter change
- 80 + 60 retry attempts × 100 ms each → 8 s + 6 s timeouts max
- Errors log to console; no silent failures

## Not verified (no clean way without user-driven browser test)
- Full UI smoke (clicking through the new picker, switching back and forth)
- Visual styling of the format dropdown on mobile / small screens
- That the format dropdown order matches what the user mentally expects
  (sorted by `max_date` desc — newest meta first)
- That `expandPastMetaCode` resolves the keys to human-friendly names
  in every case (some keys may lack a mapping)

## Caveats user should know on waking

1. Matchup matrix stays the current-online proxy. UI shows a small ⓘ
   hint "Matchups = current proxy" next to the format dropdown. If
   they want full historical matchup accuracy, the labs scraper would
   need to capture per-pair WR per past Major (not in scope).
2. Past-meta source has NO trend deltas / NO week-over-week history /
   NO labs-Day-2 quality multiplier. The predictor falls back to Mode
   A (online-only, no labs boost) when in past source — by design.
3. Source picker is hidden entirely when the manifest is missing or
   the catalog ends up empty after filtering — graceful degradation
   to current-only behavior.

## Open assumptions from 00-spec.md still requiring user sign-off

1. Session-scoped source (no localStorage persistence) ✓ implemented
2. Source picker between Settings and Mode panels ✓ implemented
3. Matchup-proxy hint as inline icon ✓ implemented
4. current_set suffix-match filter to hide active meta ✓ implemented
5. Newest-first sort by `chunk_dates.max_date` ✓ implemented

If any of these is wrong, revert is a single boolean flip
(`_metaSource = 'current'`) plus removing the source-picker panel from
`renderAll()` — atomic.

## Suggested follow-ups (out of scope, not done)

- Persist source choice across page reloads (localStorage)
- Per-past-meta matchup scraping (would require labs CSV per Major
  that's now archived)
- "Suggested" past meta = the previous active meta (heuristic, not
  the user's choice)
