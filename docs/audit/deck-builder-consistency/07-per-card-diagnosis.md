# Phase 7 — Per-Card Diagnosis (Lucario Hariyama + Maximum Belt)

Diagnose-before-fix pass per user request: every card in the deck universe inspected in one table, no more single-card whack-a-mole.

**Tools:**
- `per-card-diagnosis.mjs` — Node script, replicates `_aceSpecConditionalAvgsMulti` (line 6069) + Energy-Floor target logic (line 5316) over the real CSVs.
- `instrumentation-per-card.js` — browser snippet, captures the FULL per-card runtime state (scores, tiers, avgs, remainders, allocation results) so we can compare prediction vs runtime.
- `07-per-card-diagnosis-output.txt` — frozen output of the Node run on 2026-05-23.

---

## What the data sources actually contain (methodological note — read first)

The user's fixture ground-truth values (`Utrecht wally=1.00`, `Prague rocky=1.25`) are **per-archetype averages**:
`avg = total_count / total_decks_in_archetype` — i.e. averaged across every Lucario deck whether it played the card or not.

The CSV `average_count` column the algorithm consumes is **per-inclusion** (= avg-when-used):
`avg_when_used = total_count / deck_inclusion_count` — i.e. averaged ONLY across the decks that played the card.

For Prague Rocky Fighting Energy the raw row is `total_count=10, inclusion=5, decks=8`:
- per-inclusion avg = 10 / 5 = **2.00** (what the CSV stores, what the algorithm uses)
- per-archetype avg = 10 / 8 = **1.25** (what the user pulled from Limitless)

`card.avgCountWhenUsed` is the name in the code — and that IS what Stage 1 rounds. So `Math.round(2.00) = 2 Rocky copies` is the algorithm's intended answer **if it decides this deck includes Rocky**. The "include or not" decision is gated separately by `consistencyScore`.

**Implication:** apparent "discrepancies" in the table below where the algorithm picks a higher integer than the GT-rounded value are usually NOT bugs — they're the algorithm correctly treating "this deck IS playing the card; how many copies" as a different question from "what's the population average."

---

## Per-card table (sorted by `|multi-ACE-cond − GT|`, biggest first)

For each card that appears in any Lucario+Max-Belt bucket (Online or Major):

| Card | Online-only ACE | Major-only ACE | **MULTI ACE** | No-ACE base | GT (user) | Round | Δ vs GT |
|---|---|---|---|---|---|---|---|
| rocky fighting energy        | 2.00 (4) | 1.94 (4) | **1.95 (8)** | 1.95 (12) | 1.38 | 2 | +0.57 ⚠ |
| night stretcher              | 2.00 (3) | 1.33 (4) | **1.38 (7)** | 1.54 (11) | 0.88 | 1 | +0.50 • |
| maximum belt                 | 1.00 (4) | 1.00 (4) | **1.00 (8)** | 1.00 (8)  | 0.53 | 1 | +0.47 • |
| wally's compassion           | 1.92 (4) | 1.17 (4) | **1.30 (8)** | 1.30 (19) | 1.06 | 1 | +0.25 |
| gravity mountain             | 1.79 (4) | 1.57 (4) | **1.61 (8)** | 1.52 (22) | 1.53 | 2 | +0.08 |
| riolu                        | 3.85 (4) | 3.53 (4) | **3.58 (8)** | 3.43 (22) | 3.59 | 4 | -0.01 |
| fighting energy              | 9.87 (4) | 9.46 (4) | **9.53 (8)** | 10.02 (22)| 9.53 | 10 | +0.01 |
| fighting gong                | 4.00 (4) | 4.00 (4) | **4.00 (8)** | 4.00 (22) | — | 4 | — |
| premium power pro            | 4.00 (4) | 4.00 (4) | **4.00 (8)** | 4.00 (22) | — | 4 | — |
| lillie's determination       | 4.00 (4) | 3.97 (4) | **3.98 (8)** | 3.99 (22) | — | 4 | — |
| ultra ball                   | 3.85 (4) | 3.75 (4) | **3.77 (8)** | 3.79 (22) | — | 4 | — |
| poké pad                     | 3.03 (4) | 3.23 (4) | **3.20 (8)** | 3.43 (22) | — | 3 | — |
| mega lucario ex              | 3.00 (4) | 3.03 (4) | **3.02 (8)** | 3.01 (22) | — | 3 | — |
| solrock                      | 3.00 (4) | 2.68 (4) | **2.74 (8)** | 2.85 (22) | — | 3 | — |
| judge                        | 2.00 (4) | 2.15 (4) | **2.12 (8)** | 2.11 (22) | — | 2 | — |
| makuhita                     | 2.00 (4) | 2.00 (4) | **2.00 (8)** | 2.00 (22) | — | 2 | — |
| hariyama                     | 2.00 (4) | 2.00 (4) | **2.00 (8)** | 2.00 (22) | — | 2 | — |
| lunatone                     | 2.00 (4) | 2.00 (4) | **2.00 (8)** | 2.10 (22) | — | 2 | — |
| boss's orders                | 2.00 (4) | 1.97 (4) | **1.98 (8)** | 1.99 (22) | — | 2 | — |
| carmine                      | 2.00 (1) | 1.93 (4) | **1.93 (5)** | 1.97 (8)  | — | 2 | — |
| air balloon                  | 1.23 (4) | 1.64 (4) | **1.57 (8)** | 1.85 (22) | — | 2 | — |
| switch                       | 1.69 (4) | 1.46 (4) | **1.50 (8)** | 1.45 (13) | — | 2 | — |
| meowth ex                    | 1.00 (3) | 1.00 (4) | **1.00 (7)** | 1.00 (17) | — | 1 | — |
| team rocket's petrel         | 1.00 (2) | 1.00 (4) | **1.00 (6)** | 1.00 (14) | — | 1 | — |
| black belt's training        | 1.00 (1) | 1.00 (4) | **1.00 (5)** | 1.00 (12) | — | 1 | — |
| ciphermaniac's codebreaking  |  —       | 1.07 (3) | **1.07 (3)** | 1.06 (4)  | — | 1 | — |
| scoop up cyclone             |  —       | 1.00 (4) | **1.00 (4)** | 1.00 (8)  | — | 1 | — |
| genesect                     |  —       | 1.00 (4) | **1.00 (4)** | 1.00 (7)  | — | 1 | — |
| secret box                   |  —       | 1.00 (4) | **1.00 (4)** | 1.00 (6)  | — | 1 | — |
| kieran                       | 2.00 (1) | 1.00 (2) | **1.09 (3)** | 1.09 (3)  | — | 1 | — |
| unfair stamp                 | 1.00 (1) | 1.00 (1) | **1.00 (2)** | 1.00 (9)  | — | 1 | — |
| pokégear 3.0                 | 2.00 (1) | 1.00 (1) | **1.14 (2)** | 1.14 (2)  | — | 1 | — |
| team rocket's watchtower     |  —       | 1.00 (3) | **1.00 (3)** | 1.00 (4)  | — | 1 | — |
| tarragon                     |  —       | 1.00 (3) | **1.00 (3)** | 1.00 (4)  | — | 1 | — |
| mega signal                  |  —       | 1.00 (2) | **1.00 (2)** | 1.00 (3)  | — | 1 | — |
| cornerstone mask ogerpon ex  |  —       | 1.00 (2) | **1.00 (2)** | 1.00 (2)  | — | 1 | — |
| dunsparce / dudunsparce      |  —       | 2.00 (1) | **2.00 (1)** | 2.00 (1)  | — | 2 | — |
| fezandipiti ex / battle cage | 1.00 (1) |  —       | **1.00 (1)** | 1.00 (1)  | — | 1 | — |
| hero's cape / tool scrapper / shaymin |  — | 1.00 (1) | **1.00 (1)** | 1.00 (1) | — | 1 | — |

Format: `avg (presence)` where presence = matching ACE-buckets that contained the card.

---

## Findings (rank-ordered)

### Finding A — Energy total target 11, runtime delivered 10

Per-card targets summed:
```
rocky fighting energy   avg 1.95  → round 2
fighting energy         avg 9.53  → round 10
                                    ────
                        sum         12  → clipped to corridor [7,11] = 11
```

Runtime delivered 10 energies (per fixture: 9 Fighting + 1 fallback Fighting, **no Rocky**).
Floor target = 11, before = 10, should add 1.

**The data path that explains this is unknown without runtime instrumentation** — the open question is whether Rocky made it through the Score gate at all. If Rocky's `consistencyScore < 75` it never enters Stage 1; if `< 40` it skips Stage 2 too. With no Rocky entry in the deck, the Floor's per-card sum becomes `round(9.53) = 10` (Fighting only), clipped to 10 → matches observed.

**Verification: run `instrumentation-per-card.js` and look for `team rocket's rocky fighting energy` in the per-card table.** If `final_count = 0` and `score` is low, that's the cause. If the card is present at 1 but Floor failed to bump to 2, the bug is in the Floor's bump-pick logic.

### Finding B — Rocky Fighting "discrepancy" is methodological, not algorithmic

Multi-ACE = 1.95 (per-inclusion), GT = 1.38 (per-archetype). When a Lucario player decides to play Rocky, they run on average 2 copies (per the major data). 1.95 → Math.round = 2 is the correct integer for "how many Rocky if this deck plays Rocky." The fact that only 5/8 Prague decks played Rocky is captured separately by inclusion-rate gating (which feeds the score). Same applies to Night Stretcher, Maximum Belt, Wally.

### Finding C — Cards with NO ground-truth comparison

Most cards have no GT entry because the fixture only captured 7 cards from the per-tournament Limitless screenshots. The other ~32 cards are diagnosed only against multi-source ACE-cond avg, with no cross-check. Picking 3-4 high-impact cards (Pokéball, Carmine, Air Balloon, Switch, Boss's Orders) for additional ground-truth extraction would let us validate the algorithm across the rest of the deck.

### Finding D — Source asymmetry: 18 cards have ZERO Online ACE presence

Cards like Scoop Up Cyclone, Genesect, Secret Box, Tarragon, Mega Signal, Cornerstone Mask Ogerpon ex, Hero's Cape, Tool Scrapper, Shaymin appear in Major ACE buckets but never in Online ACE buckets. Major weight 1.5 carries them. These are the post-rotation / freshest-print cards online tournaments haven't picked up yet. Algorithm correctly gives them Major-only valuation, which is structurally good.

### Finding E — Pokégear and Kieran flagged as 1-presence Online outliers

Pokégear shows Online 2.00 (1 bucket), Major 1.00 (1 bucket). The multi-source weighted blend is 1.14 (since Major has 1.5× weight). Round = 1. That's reasonable — single-bucket-per-source means the signal is fragile but the Major weight stabilizes it. Same for Kieran. No bug; just thin-signal cards.

### Finding F — Petrel (user-flagged): present in 6/8 ACE buckets at avg 1.0

User wrote "ich glaube den Petrel nutzt man nicht wirklich im Mex Belt Build oder?" — but the data says Petrel IS played in 75% of Max-Belt Lucario buckets (1 copy each). Online: 2/4 buckets, Major: 4/4 buckets. Multi-ACE round = 1. Algorithm correctly includes 1 Petrel. User's intuition was off in this case.

### Finding G — Wally's Compassion fix (Fix C) verified

Pre-Fix-C, ACE-cond was Online-only: 1.92 → round 2. Post-Fix-C with Major blended in: 1.30 → round 1. Major's 1.17 weighted at 1.5× pulled the blend below 1.5. ✓ Matches user's per-tournament data (avg 1.0-1.27 across regionals). Fix C is working.

---

## Anomalies that warrant attention

| # | Anomaly | What to do |
|---|---------|------------|
| 1 | Energy delivered 10 instead of target 11 | **Run `instrumentation-per-card.js`, export `__dipiAuditFull`, look at Rocky's final_count + score + lrm_remainder** |
| 2 | Maximum Belt avg 1.0 / round 1, but it's the ACE-spec slot (always 1) | Confirm the avg-1 isn't accidentally double-counting; the result IS correct (1 copy) but the avg should be a hardcoded 1 for ACE-specs, not a CSV lookup |
| 3 | Carmine multi=1.93 (round 2) — is this actually played as 2 copies in regional-winning lists? | Pull Limitless per-tournament Carmine data to ground-truth |
| 4 | 18 cards in Major ACE only with 0 Online presence | Structurally fine; flag for sanity-check that we don't over-fit to single-source signal |
| 5 | Pokégear/Kieran 2-bucket multi-source signal | Consider raising the `presence >= 3` ACE-cond presence guard to a multi-source-aware guard (e.g. presence + sourceCount) |

---

## Algorithm vs runtime — what we still need to confirm

The Node-side script predicts what the multi-source ACE-conditional path will produce. **What we CANNOT verify from the data alone:**

1. Per-card **consistencyScore** at runtime (drives Stage 1 / 2 / Floor gating)
2. Whether each card actually entered the final entries list
3. **LRM remainders post-Stage-1** (drives Floor bump-pick + Bidi swap)
4. The Floor's pick-and-bump loop trace (which energy did it try to bump, why didn't it succeed?)
5. The Ceiling's trim trace (if Ceiling ran, what did it remove?)
6. The Fallback-Energy block at line 7622+ (which added +1 Fighting per fixture — why Fighting and not Rocky?)

The new `instrumentation-per-card.js` captures all six in one shot. That's the next step.

---

## Recommended next step

**Option A** (recommended): User runs `instrumentation-per-card.js` once, exports `__dipiAuditFull`, pastes back. With that data + this diagnosis we can answer Findings A-F definitively in one pass — no more guess-and-check.

**Option B**: Skip runtime capture and just patch the symptom (raise energy corridor cap 11→12, or hard-pin Rocky). Faster but blind — and the fix would not transfer to other archetypes where the same path-bug shows up differently.

**Option C**: Extend `per-card-diagnosis.mjs` to ingest the `__dipiAuditFull` JSON and produce a unified table that shows "predicted vs actual" for every card. Then the discrepancy diagnosis writes itself.

Recommend A → C: get the runtime snapshot, then refactor the diagnostic tool to consume it, so future audits on other archetypes are one paste-and-run away from a full report.
