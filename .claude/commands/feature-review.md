Run a multi-round review of a feature or change before building or shipping it,
then produce **one** recommended solution.

Feature/change under review: $ARGUMENTS

The point of this loop is to argue a thing through from several angles *before*
committing to an implementation — cheaper than shipping the wrong thing twice.
Do not skip to a recommendation after round 1.

## Round 1 — build it right (parallel)

Launch together, in one message:
- `senior-developer` — correctness, blast radius, failure modes, does it belong
  in this surface at all.
- `ui-ux-designer` — where would the user actually look for this; placement,
  mobile, hierarchy, German wording.

## Round 2 — does it survive real users (parallel)

Give both personas the *concrete plan* from round 1 (not the raw idea), so they
react to what would actually ship:
- `persona-casual` — discoverability and plain-language comprehension.
- `persona-pro` — data accuracy, completeness, workflow at volume.

## Round 3 — adversarial pass

Launch `ruthless-analyst` with the findings of rounds 1–2. Its job is to kill
weak findings and unproven assumptions, and to name what is still merely assumed.
Treat a finding as real only if it survives this round.

## Round 4 — synthesis (you, not an agent)

Write the answer yourself:

1. **Recommended solution** — one clear option, described concretely enough to
   implement (which surface, which files, what the user sees).
2. **Why this over the alternatives** — name the rejected options in one line
   each, with the reason.
3. **Conflicts and how you resolved them** — the personas and the engineer will
   disagree; say whose concern won and why. Don't average them into mush.
4. **Open questions for the user** — only genuine forks where their preference
   changes the build. Ask them *before* implementing, not after.
5. **Risks / what could still be wrong** — from round 3.

## Rules

- Round 3 findings outrank round 1–2 enthusiasm.
- If rounds disagree about *placement*, the UX verdict wins unless the engineer
  shows it breaks state the user owns (deck quantities, collection, prices).
- Don't implement during this command. This produces a decision; implementation
  is a separate, explicit step.
- Keep the final synthesis under ~40 lines. Detail lives in the rounds.
