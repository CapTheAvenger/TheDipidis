# Data consumers — the published interface of this repo

Other projects read these files straight from `main`. That makes them a public
interface, not internal scratch data: **adding** a column is safe, **renaming or
removing** one breaks somebody else's build.

`scripts/data_guardian.py` enforces this list daily (see "Contract check" below),
so this document cannot silently drift from reality.

## Known consumers

| Consumer | What it does |
|---|---|
| [`Suuntory-Han/tcg-exclusive-radar`](https://github.com/Suuntory-Han/tcg-exclusive-radar) | Mirrors card/sealed images, builds a price catalogue, feeds a Telegram bot |
| This repo's own SPA (`thedipidis.app`) | Card database, prices, Prize Pack prints |

## The files

### `cardmarket_id_mapping.csv`
`set, number, cardmarket_product_id, match_method, base_name`

The join key for everything price-related: our `(set, number)` → Cardmarket
`idProduct`. Rebuilt daily.

> **Join on `(set, number)` or on `cardmarket_product_id` — never on the card
> name.** Names are not unique within a set. PBL has four products all called
> *Mega Darkrai ex*, priced 1,03 € / 9,69 € / 184,03 € / 331,99 € (#48 Double
> Rare, #101 Ultra Rare, #116 Special Art Rare, #120 Secret Rare). A name join
> collapses them and can show the 1 € card at 332 €.

`match_method` tells you how confident the row is:
* `unique` — only one candidate product with that name in the expansion. Safe.
* `live-verified` — **a price fingerprint, not an identity statement.** This
  line used to claim the idProduct was read off the live Cardmarket product
  page. It is not. `scripts/verify_cardmarket_mapping.py` compares the price
  shown on the Limitless per-print page against the price-guide metric of each
  candidate and accepts the closest one within `FP_TOLERANCE = 1.15`. Measured
  over all 5.048 verified rows on 2026-08-20: every single one carries the
  evidence form `limitless-fingerprint <A>EUR~<B>EUR (ratio X, pool N)`, ratios
  run from 1.00 to 1.15, and 802 rows (15,9 %) sit more than 5 % apart. It is
  the strongest signal we have and much better than the positional heuristic —
  but it can be wrong, and it demonstrably is: nine product ids are
  `live-verified` for **two different cards at once** (BUS 112a/142, BWP 30/31,
  DRM 60/60a, FLF 18/19, HL 28/29, JTG 143/144, ROS 54/55, TRR 19/20,
  UPR 20/21). An identity check would make that impossible.
* `priced-by-*` — several same-named variants, paired POSITIONALLY (card
  number rank ↔ trend price rank). **Known failure mode:** the pairing
  inverts when a Special Art Rare sits at a lower number than a more
  expensive Secret Rare — OBF 223/228 (Charizard ex) shipped swapped from
  2026-06-04 to 2026-08-01, and all 40 SAR-vs-Secret-Rare groups were
  affected. Treat these rows as unverified until they turn `live-verified`.

### `cardmarket_mapping_verified.csv`
`set, number, verified_product_id, status, evidence, heuristic_product_id, agrees_with_heuristic, checked_at, url`

Live verification results (built incrementally by the
`verify-cardmarket-mapping` CI job). Only rows with `status=verified` carry a
`verified_product_id`; other statuses (`http_403`, `unparseable`, …) document
why a row could not be verified — a 403 means Cardmarket throttling, never
"missing". The mapper consumes this file and prefers verified ids.

### `cm_expansions.csv`
`id_expansion, expansion_code, name, release_date, code_source, n_singles`

Cardmarket `idExpansion` → string `expansion_code` + set name. Needed because the
Cardmarket image path takes the *string* code (`…/51/PPS8/…`), not the numeric id.

`code_source` is the confidence marker:
* `pps` — derived from the Prize Pack booster name and verified against the live
  image URL.
* `tcg` — the dominant TCG set code of that expansion's singles. Correct for
  modern English sets (verified on PHF, BS, DRI, MEG, PFL, PBL). Still worth
  confirming against the image URL before relying on it.
* *empty* — no code derivable (old promo / Japanese-only sets). Not a bug.

Roughly 154 of 762 expansions carry a code; most of the rest are Japanese-only
sets we legitimately do not map.

### `cardmarket_card_images.csv`
`idProduct, id_category, expansion_code, id_expansion, number, name_en, name_de, image_url, stamped_image_url`

* `image_url` — Cardmarket S3. **Hotlink-protected**: requires a browser
  User-Agent *and* `Referer: https://www.cardmarket.com/`, and returns a bogus
  `Content-Type` (`multerS3.AUTO_CONTENT_TYPE`) — trust the JPEG magic bytes.
* `stamped_image_url` — the official Play! Pokémon CloudFront image (German).
  **Not** hotlink-protected, so it can be embedded directly. Filled for ~335 rows
  (Prize Pack series 7–9, the ones the official gallery serves).

### `prizepack_official_images.csv`
`series, gallery_number, set_code, set_number, name_de, name_en, image_url_de, image_url_en`

Each Prize Pack card mapped to its **original** print (`set_code` + `set_number`,
the join key into any card database) and to both official image URLs.

### `price_data.csv`
`name, set, number, eur_price, eur_low, cardmarket_url, last_updated, price_status, mapping_status`

**Two independent trust dimensions — don't collapse them.**
`price_status` answers *which number to read* (see the table below).
`mapping_status` answers *is this the right product's price at all*:

| value | meaning |
|---|---|
| `ok`         | the (set,number) → idProduct row is `unique` or live-verified. 15.960 rows on 2026-08-20. |
| `unverified` | the row comes from the positional heuristic (`match_method priced-by-*`) — the price may belong to a same-named sibling print. 1.244 rows. |
| `unmapped`   | **there is no mapping row at all.** Added 2026-08-20. Until then these rows carried `ok`, because a missing entry fell through the merger's default branch — 3.015 rows, 66.549 € (24,8 % of the catalogue value), none of them touched since 2026-04-01. `ok` meant "verified" for 16k rows and "nothing known" for 3k, in the same column. |
| `collision`  | **the product id serves more than one card.** Added 2026-08-20. 100 ids appear twice in the mapping (200 rows); in the published file all of those pairs share one `eur_price` while their `cardmarket_url` point at two different products, so at least one of the two numbers belongs to the other card. The price is kept — it is right for one of them — and marked, per the house rule *report, don't silently repair*. |

**A new value is not a new column.** Consumers that branch on
`mapping_status === 'ok'` were, before 2026-08-20, silently including 3.015
rows with no mapping at all; after it they are not. Consumers that only test
`!== 'unverified'` need updating.

`mapping_status` is computed independently of the guide lookup, so it
survives a failed price download (the `stale` / `no_data` paths would
otherwise overwrite the flag and every marker on the site would vanish
for a day). `price_status=unverified_mapping` stays as the legacy
carrier of the same fact for consumers that already read it.

Per-print market prices. `eur_price` is the trend/average, `eur_low` the cheapest
current offer — a card legitimately shows both (e.g. 13,07 € average vs. "from
4,89 €"). Rebuilt daily.

**Read `price_status` before trusting `eur_price`.** Cardmarket publishes
`trend: 0` to mean *no trend can be computed*, not *this card is worthless* —
idProduct 653295 (RCL 200 Boss's Orders) ships as `{"trend": 0, "low": 85}`,
an 85 € card. `eur_price` copies that faithfully, so a consumer reading it as
*the* price shows an 85 € card at 0,00 €. The column removes the guesswork:

| value | meaning |
|---|---|
| `ok`              | current Cardmarket trend, verified product identity — use `eur_price`         |
| `unverified_mapping` | current trend, but the (set,number)→idProduct row is a POSITIONAL guess (`match_method priced-by-*`) — the price may belong to a same-named sibling print. Value semantics are `ok`; trust is not. |
| `no_trend`        | current entry, no usable trend — **fall back to `eur_low`** (26 rows)         |
| `trend_below_low` | trend is BELOW the cheapest offer — **use `eur_low`** (110 rows)              |
| `stale`           | no current entry; price carried over (see `last_updated`)                    |
| `no_data`         | no price at all; the row exists so the card is visible                       |

Precedence: `no_trend` / `trend_below_low` win over `unverified_mapping`
(they change WHICH number to read; mapping trust is secondary). Rows shed
`unverified_mapping` as the live-verification job confirms or corrects them.

`trend_below_low` is the vintage/promo case: the trend is computed from old
sales while the market moved on. TR 5 Dark Dragonite trends at 0,02 € against a
cheapest offer of 18,90 € — a 945× gap. Nobody can buy at the trend, so treat
`eur_low` as the floor. The CSV deliberately keeps Cardmarket's real numbers;
only thedipidis.app's own display substitutes.

Rows with `price_status=no_data` are new as of 2026-07: the file previously
omitted them, which left three states behind one column (a value, an empty
cell, and an absent row) and made "no price" indistinguishable from "no such
card" without also reading `all_cards_merged.csv`. Currently 11 rows.

## Rate limits worth knowing

* **Cardmarket S3 images** — hotlink-protected (see above).
* **play.pokemon.com CloudFront** — freely embeddable, but AWS throttles *bulk*
  scraping from datacenter IPs (403, then hanging connections). Pace requests
  (~0.3–0.6 s apart), back off on 403 rather than treating it as "missing", and
  never re-fetch data you already have.

## Contract check

`scripts/data_guardian.py` verifies daily that every file above exists and still
has its required columns, and reports (never repairs) when a file suddenly
shrinks, a set stops mapping, or an input goes stale.

**If you need a new column or a new file, open an issue here** rather than
parsing around the gap — that keeps the contract explicit and checkable.

### `champions_type_chart.json`
`{_meta, chart: { attackingType: { defendingType: multiplier } }}`

The 18x18 type effectiveness table, listing only deviations from 1.0.
Public game rules, hand-written — not scraped from anywhere, and not
derived from another project's output. Read by `js/champions-damage.js`
for the Champions matchup and damage views.

> Anything absent is neutral (1.0). A missing entry therefore never
> means "unknown", which is why the file can stay this small.
