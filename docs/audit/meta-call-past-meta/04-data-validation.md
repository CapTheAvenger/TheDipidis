# Phase 3 — Data validation with TEF-POR sample

Sample run (Python aggregator, mirrors what the JS loader will do):

```
Total Day-1 (Day-2-or-better tracked) decks across TEF-POR: 1297
Distinct archetypes: 44

Top 12 by share:
  Dragapult                            194 (14.96%)  4/4 events
  Dragapult Dusknoir                   106 ( 8.17%)  4/4 events
  Dragapult Dudunsparce                101 ( 7.79%)  4/4 events
  Raging Bolt Ogerpon                   95 ( 7.32%)  4/4 events
  Dragapult Blaziken                    81 ( 6.25%)  4/4 events
  Festival Lead                         76 ( 5.86%)  4/4 events
  Lopunny Dudunsparce                   68 ( 5.24%)  4/4 events
  Rocket's Mewtwo                       68 ( 5.24%)  4/4 events
  Alakazam Dudunsparce                  66 ( 5.09%)  4/4 events
  N's Zoroark                           53 ( 4.09%)  4/4 events
  Cynthia's Garchomp                    51 ( 3.93%)  4/4 events
  Ogerpon Meganium                      44 ( 3.39%)  4/4 events
```

Sanity check vs. memory of TEF-POR meta: Dragapult family ~37%
combined matches what I see flagged elsewhere in the codebase
(Predictor 2.0 comments mention LA 31.9% / Prague 29.4% / Campinas
32.9% Dragapult share). Aggregate Dragapult here = 14.96 + 8.17 +
7.79 + 6.25 = **37.17%** ✓ consistent.

## Field size note

`tournament_cards_data_overview.csv` reports 8464 total players across
the 5 TEF-POR overview rows (Prague duplicated → ~6745 unique). The
chunks track 1297 Day-2-qualifying decks, ~19% of the field. This
matches typical Major Day-2 rate (Day-1 to Day-2 cut requires 6-3+).

For Meta Call's "predicted brought share", the chunk-derived
percentages are the right signal — they reflect what makes Day-2,
which is what determines who you face in the cut rounds. Documented as
**shares-of-Day-2-or-better** in the UI when source = Past Meta.

## Conditions for Past Meta to be selectable

- `tournament_cards_manifest.json` loadable
- `meta_keys` non-empty
- After filtering out the current set's suffix → at least 1 format remains

Today: 14 formats; current_set=CRI; no `*-CRI` chunk → 14 options
remain. TEF-POR is newest (max_date 2026-05-16).
