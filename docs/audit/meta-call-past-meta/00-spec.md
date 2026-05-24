# Feature: Meta Call — Past Meta Source

**Status:** Phase 0 — User asleep, working from interpretation of brief.
Every design decision below is marked **ASSUMPTION** where the user
didn't explicitly specify. Review on waking — happy to revert any.

## Problem statement (from user, 2026-05-24)

> Current Meta jetzt schon auf das neue Meta CRI springt beim scrapen
> und damit greift das Meta Call feature auf diese Daten zu. Dies ist
> auch korrekt so um sich auf künftige Turniere vorzubereiten. Aber
> jetzt haben wir den Fall, dass nach veröffentlich von CRI noch 3
> Turniere in TEF-POR stattfinden und eventuell möchte ja noch jemand
> ein Meta Call dafür machen. Dafür müssten im Meta Call noch die
> Option geben auf Past Meta Daten zuzugreifen. Wir haben ja in Past
> Meta die alten Major Daten drin und auf der Basis können wir ja
> wunderbar ein Meta predicten was "in der Vergangenheit" war.
>
> Das müssen wir einfach als neue Funktion anbieten. und wenn wir
> einstellen, dass wir für ein Past Meta einen Meta Call erstellen.
> Dann müssen wir sobald wir auf ein Archetype drücken dann auch
> dafür sorgen, dass wir auf Past Meta weitergeleitet werden und
> nicht auf Deck Analysis global und dann sollte auch in Past MEta
> direkt das Meta ausgewählt werden was wir im Meta Call eingegeben
> haben.

## Soll-Verhalten

### Source picker (new UI element)

Meta Call's settings panel gets a new **Source** selector with two options:

1. **Current Meta** (default; unchanged behavior) — uses
   `limitless_online_decks_comparison.csv` + `labs_tournament_decks.csv`
   + `online_tournament_top8_decks.csv` + `limitless_online_decks_matchups.csv`
2. **Past Meta** — user picks a past format from a dropdown (e.g.
   `TEF-POR`, `SVI-PFL`); Meta Call uses the matching per-format chunk
   for shares.

**ASSUMPTION (no user input):** The Past Meta source persists per
session only (matches existing `_metaCallMode` pattern at
`js/app-meta-call.js:39`). A page reload resets to Current Meta.

### Past Meta data sources

When source = Past Meta + format = `<META>`:

| Signal | Source | Computed how |
|---|---|---|
| Brought share | `data/tournament_cards_data_cards_<META>.csv` | aggregate `total_decks_in_archetype / sum(players)` per archetype across all tournaments in that chunk |
| Tournament count | `data/tournament_cards_data_overview.csv` filtered by `format == <META>` | row count |
| Total field size | overview rows | sum of `players` |
| Matchups | `data/limitless_online_decks_matchups.csv` (current data) | **ASSUMPTION:** Re-use the current matchup CSV as a proxy. We don't have historical matchups per past meta. UI warning required. |
| Day-2 / Top-8 conversion | not available for past metas in current data | omitted from predictor when source = Past Meta |

**ASSUMPTION (no user input):** Past Meta Meta Call does NOT run the
labs-Day-2-quality multiplier (no data); it does NOT compute trend
deltas (no week-over-week share history for old metas); it DOES
compute predicted field via the share aggregate above.

### Archetype-click routing

When source = Past Meta + user clicks an archetype card in the
Recommendations panel:

1. Switch to the Past Meta tab (`switchTabAndUpdateMenu('past-meta')`)
2. Set `pastMetaFormatFilter` to the format the user picked in Meta Call
3. Trigger chunk load via the format-change handler
4. Select the deck in `pastMetaDeckSelect` and trigger `onPastMetaDeckSelect`

When source = Current Meta: unchanged
(`navigateToCurrentMetaWithDeck` switches to Current Meta Analysis).

### Available formats (filter)

Past Meta dropdown shows formats from
`data/tournament_cards_manifest.json` `meta_keys` array, EXCLUDING the
currently-active format (`format_window.current_set` suffix match —
e.g. if `current_set = CRI`, hide `*-CRI` chunks; current
implementation has no `*-CRI` chunk yet so all listed formats are
past).

**ASSUMPTION (no user input):** Sort newest-first using
`chunk_dates.max_date`. Display the format key (e.g. "TEF-POR")
with an expanded label when one is known (matches
`expandPastMetaCode` at `js/app-past-meta.js`).

## Acceptance Criteria

### AC1 — Source picker is visible

- Given: user opens Meta Call panel
- When: panel renders
- Then: a source-selector UI element is visible with options "Current Meta" + "Past Meta"

### AC2 — Past Meta loads alternate data

- Given: user picks source = "Past Meta", format = "TEF-POR"
- When: predictor runs
- Then: the predicted field is composed from `tournament_cards_data_cards_TEF-POR.csv`
  archetypes; the field summary header shows "Past Meta — TEF-POR (5 tournaments)"

### AC3 — Source switch resets state

- Given: user is in Past Meta source
- When: user switches back to Current Meta
- Then: predicted field reverts to current-data composition without page reload

### AC4 — Archetype click routes to Past Meta tab

- Given: source = Past Meta, format = "TEF-POR", user clicks "Lucario Hariyama" in Recommendations
- When: click handler fires
- Then:
  - active tab becomes `past-meta`
  - `pastMetaFormatFilter.value === 'TEF-POR'`
  - format-change handler ran (chunk loaded)
  - `pastMetaDeckSelect.value === 'Lucario Hariyama'`
  - deck renders in the Past Meta deck-display area

### AC5 — Current Meta routing unchanged

- Given: source = Current Meta, user clicks any archetype
- When: click handler fires
- Then: behavior is identical to today —
  `navigateToCurrentMetaWithDeck` is invoked, tab becomes
  `current-analysis`, deck is preselected there.

### AC6 — Matchup data caveat

- Given: source = Past Meta
- When: matchup-derived columns/widgets render
- Then: a tooltip or inline note indicates matchups are current-meta
  data (not historical), since per-past-meta matchups are not scraped.
  **ASSUMPTION:** A small inline icon with a hover-tooltip is
  sufficient; no separate warning banner.

### AC7 — Edge cases

- Empty past-meta chunk → "No past meta data available for this format"
  message in the field panel
- Format dropdown empty (manifest missing) → fall back to "Current Meta"
  only; hide the source-selector
- User switches format mid-render → cancel old render, restart with new format

## Out of scope

- Historical matchup scraping (data doesn't exist; user can re-evaluate later)
- Per-past-meta trend/week-over-week deltas (no time-series share data
  for old metas)
- Online-vs-Major weighting toggle in Past Meta (only Major data
  available for past chunks)
- Day-2/Top-8 conversion multiplier in Past Meta (no labs CSV per past)

## Open questions for user on waking

1. Are the assumptions above (session-scoped, matchup proxy, hide
   currently-active format from picker) acceptable?
2. Should the source picker live in the Settings panel
   (`#mc-settings-panel`) or as a top-level toggle above the field
   summary?
3. Should there be a UI hint when matchups in Past Meta are
   approximations? (current spec says inline icon)
