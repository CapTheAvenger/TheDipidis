Review a change to the data pipeline (scrapers, mappings, price/image data)
before it is trusted or published.

Change under review: $ARGUMENTS

Data changes fail differently from UI changes: a wrong price or a mis-joined
print **looks correct**. Nobody reports it, and consumers downstream copy it.
So this loop is about proof, not opinion.

## Round 1 — engineering pass

Launch `senior-developer` on the change. Beyond normal review, require answers to:
- Which join key is used? (`(set, number)` / `idProduct` — **never** the card
  name; see CLAUDE.md for the four *Mega Darkrai ex* products at 1,03–331,99 €.)
- What happens to rows that don't match — dropped silently, or reported?
- Could this shrink or overwrite good data if an upstream fetch fails?

## Round 2 — adversarial verification

Launch `ruthless-analyst` and make it verify **on the real files**, not on the
diff. It must:
- isolate the change (old code vs new code on the *same* input) rather than
  comparing against yesterday's committed output, which also moved;
- state counts with denominators (`117/120`, not "most");
- confirm the check itself isn't circular (does it read a file the new code just
  wrote?);
- name what remains unverified.

## Round 3 — consumer impact

- Does `data/_consumers.md` still describe reality? Any column added, renamed or
  removed?
- If a published file changed shape, that is a breaking change for
  `tcg-exclusive-radar` and the bot — call it out explicitly.
- Run `python scripts/data_guardian.py` and report its findings. Remember its
  contract: **report, never auto-repair.**

## Round 4 — power-user sanity check

Launch `persona-pro` on a handful of concrete cards (include at least one card
with several same-named variants, and one brand-new set). Wrong-but-plausible
prices are exactly what this catches.

## Synthesis (you)

1. **Verdict** — trust / trust with caveats / don't publish.
2. **Proven vs. assumed** — the numbers that are verified, and what isn't.
3. **Consumer impact** — breaking or not, and who to tell.
4. **Follow-up** — what the guardian should watch from now on.

Keep it tight. If something is unverified, say so plainly instead of rounding up
to "looks good".
