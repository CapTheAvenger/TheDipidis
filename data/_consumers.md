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

`match_method` tells you how confident the row is: `unique` (only one candidate,
safest) vs. `priced-by-*` (several same-named variants, paired by card number and
price — reliable when prices differ a lot, less so for near-identical variants).

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
`name, set, number, eur_price, eur_low, cardmarket_url, last_updated, price_status`

Per-print market prices. `eur_price` is the trend/average, `eur_low` the cheapest
current offer — a card legitimately shows both (e.g. 13,07 € average vs. "from
4,89 €"). Rebuilt daily.

**Read `price_status` before trusting `eur_price`.** Cardmarket publishes
`trend: 0` to mean *no trend can be computed*, not *this card is worthless* —
idProduct 653295 (RCL 200 Boss's Orders) ships as `{"trend": 0, "low": 85}`,
an 85 € card. `eur_price` copies that faithfully, so a consumer reading it as
*the* price shows an 85 € card at 0,00 €. The column removes the guesswork:

| value      | meaning                                                        |
|------------|----------------------------------------------------------------|
| `ok`       | current Cardmarket trend — use `eur_price`                      |
| `no_trend` | current entry, no usable trend — **fall back to `eur_low`**     |
| `stale`    | no current entry; price carried over (see `last_updated`)       |
| `no_data`  | no price at all; the row exists so the card is visible          |

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
