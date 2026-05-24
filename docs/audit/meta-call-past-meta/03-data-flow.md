# Phase 2 — Data flow

## Current source (Meta Call today)

| Signal | File | Purpose |
|---|---|---|
| Online ladder share | `data/limitless_online_decks_comparison.csv` | brought-share base for Mode A |
| Tournament top8 | `data/online_tournament_top8_decks.csv` | brought share + conversion (Mode B if present) |
| Labs Major | `data/labs_tournament_decks.csv` | quality multiplier, mode switch A → B |
| Format window | `data/format_window.json` | recency cutoff |
| Matchups | `data/limitless_online_decks_matchups.csv` | per-pair WR |
| History | `data/online_share_history/<date>.csv` + `manifest.json` | trend deltas |

Scraper: see `backend/scrapers/limitless_online_scraper.py` and
`backend/scrapers/labs_tournament_scraper.py`. Output paths match the
input paths above (post-PR191 chunk-loader change is unrelated).

## Past-Meta source (new)

| Signal | File | Computed |
|---|---|---|
| Brought share | `data/tournament_cards_data_cards_<META>.csv` | Σ `total_decks_in_archetype` per archetype (deduped per tournament_id) / Σ total |
| Tournament list / field size | `data/tournament_cards_data_overview.csv` filter `format == META` | rows + sum(`players`) |
| Format catalog | `data/tournament_cards_manifest.json` `meta_keys` | dropdown options |
| Matchups | `data/limitless_online_decks_matchups.csv` (current) | unchanged — flagged as proxy in UI |

## Format dropdown filter

Hide format keys whose suffix matches `format_window.current_set`
(post-rotation, the CRI chunk doesn't exist yet so nothing is hidden;
once CRI majors land, the `*-CRI` chunk should not appear as a "past"
option because it's still active).

Sort newest-first by `manifest.chunk_dates[chunk].max_date`.

## Path/output verification

- `tournament_cards_data_cards_TEF-POR.csv` last touched
  `2026-05-24 02:51` (today's full-update), 4692 rows, 4 distinct
  tournaments (Prague/LA/Utrecht/Campinas).
- `tournament_cards_data_overview.csv` last touched same time, 5
  TEF-POR rows (Prague duplicated — known scraper artifact, treated as
  noise by aggregation).
- `tournament_cards_manifest.json` updated `2026-05-24 03:25`, lists
  all 14 chunks including TEF-POR (max_date 2026-05-16).

No path-bug risk: the chunks are the same files Past Meta tab already
reads, so adding Meta Call as a second consumer doesn't introduce a
new scraper-vs-consumer mismatch.
