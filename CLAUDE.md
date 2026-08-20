# TheDipidis — working rules

## Default process for every feature

**Run `/feature-review` before building any user-facing feature or change**, and
`/data-review` before trusting any data-pipeline change. This is the default, not
the exception — the extra round trip is cheaper than shipping the wrong thing and
rebuilding it, which is exactly what happened with the Prize Pack print.

Skip it only for genuinely trivial edits (a typo, a colour value), and say so.


German-language Pokémon TCG SPA (vanilla JS, GitHub Pages, deploys from `main`)
plus a Telegram bot on Render. These are the rules this project learned the hard
way; each one exists because breaking it cost real time.

## Shipping frontend changes

1. **Any change to `js/`, `css/` or `index.html` needs `./bump-version.sh`.**
   All 74 assets are cache-busted via `?v=<timestamp>`; without a bump the
   service worker keeps serving the old file and the change is invisible. "The
   user can't see my fix" has almost always been a missing bump.
2. **Ship one commit, then wait.** Pages deploys are serialised — rapid
   consecutive pushes cancel each other's deploys and the site can sit on an
   older build for 15+ minutes.
3. **A change is not "live" until `thedipidis.app/version.json` shows the new
   timestamp.** Verify that before telling the user it's done. Code merged to
   `main` ≠ deployed.
4. Tell the user to hard-refresh (`Strg`+`Umschalt`+`R`) for JS/CSS changes;
   pure data files (`data/*.json`) are fetched fresh and need no bump.
5. **If `git push` is blocked, ship onto a branch and merge — never a series
   of commits straight to `main`.** Some sessions cannot push (the git proxy
   answers 403 for this repo) and have to use the GitHub web upload UI, which
   commits **one directory at a time**. Code and its tests live in different
   directories, so every intermediate commit is an inconsistent tree: CI goes
   red, the deploy job is skipped, and the owner gets a failure mail per
   commit. Measured 20.08.2026: six red runs for two green deploys, all
   self-inflicted (`test-design-tokens.js` failing on the commit that carried
   the CSS but not yet the updated test).
   The fix costs nothing: on the first upload pick *"Create a new branch for
   this commit and start a pull request"*, then upload the remaining
   directories to `.../upload/<branch>/<dir>`, then merge. `main` sees one
   commit and one CI run. The clean alternative is a PAT with push rights —
   the user has to create it, and the assistant must never handle it.

## Data rules

* **Never join card data by name.** Names are not unique within a set. PBL has
  four products called *Mega Darkrai ex* priced 1,03 € / 9,69 € / 184,03 € /
  331,99 €. Join on `(set, number)` or `cardmarket_product_id`.
* **Report, don't silently repair.** This data drives prices and card identity.
  A reported hole is recoverable; a guessed correction looks right and is wrong.
  See `scripts/data_guardian.py`.
* **Absolute quality thresholds produce noise here.** "<90 % mapped" flags 62 of
  153 sets, nearly all legitimately unmappable (old promos, JP-only sets). Detect
  *change* against a baseline instead.
* `data/_consumers.md` is a real published interface — other projects read those
  files from `main`. Adding a column is safe; renaming/removing one breaks them.
* Verify claims against the source before changing data. Never invent card data.

## External sources & rate limits

* **Cardmarket S3 images** — hotlink-protected: need a browser User-Agent *and*
  `Referer: https://www.cardmarket.com/`, `GET` (not `HEAD`), and they return a
  bogus `Content-Type` — trust the JPEG magic bytes.
* **play.pokemon.com CloudFront** — freely embeddable, but AWS throttles bulk
  scraping from datacenter/CI IPs (403, then hanging connections). Pace requests,
  back off on 403 instead of treating it as "missing", and **never re-fetch data
  you already have** — that's why the Prize Pack build only fetches *new* series.
* The sandbox cannot reach cardmarket.com, play.pokemon.com or thedipidis.app.
  To check anything live, run it in CI (workflow_dispatch) and read the job log.

## Verification

* Prefer driving the real thing over asserting it works. There is Playwright
  tooling: `tests/e2e-playtester-smoke.js`, `tests/mobile_ux_audit.js`, and the
  `visual-*.yml` workflows.
* When a CI check contradicts your expectation, find out *why* before concluding
  — a "0 rows" result was once CDN throttling, not a code bug.
