# Phase 4 — Fix plan

## Risk class: 🟡 MEDIUM
Touches Meta Call's central data load + render pipeline. Isolated by a
new source-flag (`_pastMetaActive` boolean + `_pastMetaFormatKey` string).
When the flag is false (default), code path is unchanged.

## Changes

### Change 1 — Past-meta loader (`js/app-meta-call.js`)

Add `async function _loadPastMetaSource(formatKey)`:
- Fetch `data/tournament_cards_data_cards_${formatKey}.csv` and `data/tournament_cards_data_overview.csv`
- Aggregate per-archetype share via dedup `(tournament_id, archetype)` → `total_decks_in_archetype`
- Build `_shareList`-compatible structure: `[{name, onlineShare, ladderShare, trend: 0, onlineWinPct: 0}]`
- Build `_tournamentStats` placeholder (empty — past metas don't carry the same fields)
- Return success/failure flag

### Change 2 — State + setter

```
let _pastMetaActive = false;
let _pastMetaFormatKey = null;
let _pastMetaAvailableFormats = []; // [{key, label, maxDate}]
function _setMetaSource(source, formatKey) { ... reload + rerun + render }
```

### Change 3 — New panel renderer

`renderSourcePanel()` returns a small panel:
- Two pills: "Current Meta" / "Past Meta"
- When Past Meta pill active: a dropdown of `_pastMetaAvailableFormats`

Slot into `renderAll()` between Settings and Mode panels.

### Change 4 — Routing

Add `window.navigateToPastMetaWithDeck(deckName, formatKey)` in `js/app-core.js`.
Mirror `navigateToCurrentMetaWithDeck` but:
1. `switchTabAndUpdateMenu('past-meta')`
2. Set `pastMetaFormatFilter.value = formatKey` + dispatch `change` event
3. Poll `pastMetaDeckSelect` for the deck and select + dispatch `change`

Modify `_jumpToDeckAnalysis` in app-meta-call.js to branch:
```
if (_pastMetaActive && _pastMetaFormatKey) {
    window.navigateToPastMetaWithDeck(deckName, _pastMetaFormatKey);
} else {
    window.navigateToCurrentMetaWithDeck(deckName);
}
```

### Change 5 — Load-time scaffolding

In `loadData()` post-hook (after current-data fetch):
- Fetch `tournament_cards_manifest.json` (already loaded for `_loadAllHistorySnapshots`? No — different file. New fetch.)
- Populate `_pastMetaAvailableFormats` sorted by max_date desc
- Filter out current-set suffix

### Change 6 — Matchup proxy notice

Tooltip on the source-picker when Past Meta is selected: small icon with
"Matchups are current online data (no historical matchup pairs scraped)".

### Change 7 — Empty-data fallback

When source = Past Meta + selected format chunk loads 0 archetypes →
show "No past-meta data for `{formatKey}`" message in the field panel
and leave the rest of the predictor unrun.

## Files modified

| File | Lines (est.) | Notes |
|---|---|---|
| `js/app-meta-call.js` | +180 | new loader + state + setter + panel + routing branch |
| `js/app-core.js` | +50 | `navigateToPastMetaWithDeck` |
| `css/meta-call.css` | +20 | source-picker styling |
| `js/i18n.js` | +12 | new strings (with EN fallback) |

## Tests

- New `/tmp/test_past_meta_aggregator.mjs`: deterministic share
  aggregation against TEF-POR fixture (verifies the 14.96% Dragapult
  / 37.17% combined family / 44 archetypes numbers).
- New `verify-baseline.mjs` extension: same assertions inside CI.

## Risks + mitigations

- 🟡 `_shareList` shape must stay identical so downstream predictor
  doesn't break → return same field names; `trend` and `onlineWinPct`
  default to 0
- 🟡 Source switch mid-render → reset transient state via
  `_setMetaSource` (`_shareList = null; _matchupMap` left intact since
  it's source-agnostic)
- 🟢 Past Meta tab routing — `navigateToPastMetaWithDeck` is purely
  additive, mirrors `navigateToCurrentMetaWithDeck` which already works
- 🟢 Loader failure → returns null, `_setMetaSource` shows error toast
  and stays on Current Meta

## Rollback strategy

`_pastMetaActive = false` (one boolean flip) reverts every code path
to identical behavior. PR can be reverted cleanly via `git revert`.
