# Phase 7b — Runtime Trace Diagnosis (Lucario Hariyama + Max Belt)

Source: `__dipiAuditFull` runtime snapshot from 2026-05-23 (delivered by user, captured via `instrumentation-per-card.js`).

## Confirmed runtime sequence

```
Stage 0 (Ace-Spec): Maximum Belt × 1                                    → total 1
Stage 1 (score ≥ 75, 21 cards):                                         → total 58
  Poké Pad 3, Boss's Orders 2, Lillie's 4, Ultra Ball 4, Air Balloon 2,
  Judge 2, Solrock 3, Lunatone 2, Fighting Gong 4, Riolu 4, Mega Luc 3,
  Gravity Mtn 2, Makuhita 2, Hariyama 2, Premium Power Pro 4,
  Fighting Energy 9, Switch 1, Wally's 1, Meowth ex 1, Petrel 1,
  Night Stretcher 1
Stage 2 (score ≥ 40 MID, ≥ 50 TECH):
  Black Belt's Training: round(1.0) = 1 — pushCard(1), spaceLeft=2 → +1 → total 59
  Rocky Fighting Energy: round(1.939) = 2 — pushCard(2), spaceLeft=1
                       → actualCount = min(2,1) = 1                     → total 60
                       → _lrmRemainder = avg − intendedCount
                                       = 1.939 − 2 = −0.061  ⚠ WRONG SIGN
LRM Forward: total=60 — SKIPPED (never called per __dipiAuditFull)
LRM Reverse: total=60 — SKIPPED
Bidi Swap: −1 Black Belt's Training, +1 Poké Pad                        → total 60
Fallback Energy: total=60 — SKIPPED
Energy Floor:
  target = round(9.478) + round(1.939) = 9 + 2 = 11
  before = 9 Fighting + 1 Rocky = 10
  Needs +1. Bump candidates filter: rem > 0 AND count < perCardTarget.
    Fighting Energy: rem +0.478, count 9, perCardTarget round(9.478)=9
      → count NOT < target → SKIP
    Rocky Fighting Energy: rem −0.061 → rem NOT > 0 → SKIP
  → No eligible bumps. Floor exits. total stays at 10. ❌
```

## Root cause — single line

`pushCard` at js/app-deck-builder.js:7044-7053 silently truncates `count` to `spaceLeft` when the deck is filling toward 60. Stage 2 at js/app-deck-builder.js:7676-7677 has ALREADY set `_lrmRemainder = exactAvg − addCount` based on the INTENDED count, not the truncated actual count.

The downstream Floor / Ceiling / Bidi / LRM passes all read `_lrmRemainder` to decide who's "over" vs "under" target. After truncation, an under-allocated card has the OPPOSITE sign of rem from what it should have. That makes the card invisible to every subsequent corrective pass.

## Three compounding issues — one fix kills all three

| # | Symptom | Root | Fix coverage |
|---|---------|------|--------------|
| 1 | `_lrmRemainder` reflects intent, not delivery | `pushCard` doesn't update rem after truncation | ✓ (single line in pushCard) |
| 2 | Energy Floor can't bump Rocky (rem < 0) | Same — Floor reads the wrong-sign rem | ✓ (downstream of #1) |
| 3 | Energy Floor can't bump Fighting either (per-card-target blocks it) | Fighting is already at its rounded target | Not a bug — correct behaviour |

The Floor's per-card-target check (line 5365) IS correct — Fighting Energy at count=9 has already met its target of round(9.478)=9. Bumping Fighting beyond its data-supported avg would be wrong. The fix is to make Rocky bumpable, not to let Fighting overshoot.

## Proposed fix (3 lines)

```diff
 const pushCard = (cardData, count, logPrefix = '') => {
     if (count <= 0 || currentTotal >= 60) return;
     const spaceLeft = 60 - currentTotal;
     const actualCount = Math.min(count, spaceLeft);
+    if (actualCount < count && Number.isFinite(cardData.avgCountWhenUsed)) {
+        cardData._lrmRemainder = cardData.avgCountWhenUsed - actualCount;
+    }
     consistencyDeck.push({ card: cardData, count: actualCount });
     currentTotal += actualCount;
     devLog(`${logPrefix} + ${actualCount}x ${cardData.card_name} ...`);
 };
```

## Predicted post-fix behaviour for Lucario+MaxBelt

```
Stage 2 → Rocky pushCard(2), truncated to 1 → _lrmRemainder recomputed
                                              = 1.939 − 1 = +0.939
…bidi swap runs (same as before: −Black Belt, +Poké Pad)…
Energy Floor:
  target = 11, before = 10, needs +1
  Bump candidates:
    Rocky:    rem +0.939, count 1, perCardTarget 2 → ELIGIBLE (highest rem)
    Fighting: rem +0.478, count 9, perCardTarget 9 → SKIP (at target)
  Demote candidates (TECH first, lowest rem first):
    Premium Power Pro (tier TECH, rem 0, count 4) ← picked
  Swap: Premium 4 → 3, Rocky 1 → 2
  Floor delivers total 60 → 60, energies 10 → 11 ✓
```

Final deck after fix: ... 9 Fighting + 2 Rocky + 3 Premium Power Pro + 21 other slots = 60.
Energies = 11 (= corridor cap). Matches user-confirmed doctrine corridor.

## Risk assessment for shipping this fix

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Other archetypes regress | Low — the fix only triggers when truncation occurs at deck-fill. Most archetypes hit Stage 2 well before total=60. | Run `verify-baseline.mjs` post-fix; spot-check 2-3 other archetypes' Quick Overview output. |
| Floor over-trims (demotes a card the user wanted) | Low — Floor's demote logic already prefers TECH over MID/CORE. Premium Power Pro 4→3 is a legitimate doctrine-correct outcome (TECH tools rarely need max copies). | Watch for user-flagged regressions on Premium Power Pro / Fighting Gong / similar 4-of TECH cards. |
| Floor over-bumps (adds an energy the meta doesn't want) | Negligible — per-card-target gate prevents bumping beyond `round(avg)`. | None needed. |

Recommend: ship the fix. The 3-line change has a single clear behavioural effect (truncated cards become visible to the Floor pass), and the Floor's existing guards (per-card-target, tier-priority, corridor) prevent secondary-effect bugs.

## Related future work (NOT in this fix)

- **Stage 2 ordering by impact, not just score.** When two cards are within ~1 score point and both qualify for Stage 2, the higher-`avg`-of-2 card (Rocky 1.939) should be processed before the lower-`avg` 1-of (Black Belt 1.0) to avoid truncation. Current logic picks by raw `consistencyScore`, which doesn't capture "this card wants more copies than that card." Possible Stage-2 sort change: `b.score * Math.max(1, round(b.avg)) - a.score * Math.max(1, round(a.avg))`. **Out of scope here — but worth a follow-up audit.**
- **Floor's bump filter should accept zero-remainder energies too.** A card at `count = round(avg)` with `rem = 0` is exactly at target. Bumping it would overshoot. The current filter is correct. But: a card at `count = round(avg) - 1` with `rem ≈ 0.5` is eligible. The +0.939 case post-fix is already covered. So no change needed.
