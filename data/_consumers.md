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

### `online_api_tournaments.csv`
`tournament_id, name, date, meta, format, players, organizer_id, is_online, has_decklists, swiss_rounds, phases, standings_rows, pairings_rows, depth, scraped_at`

The memory of the Limitless-API run, and its incremental key. One row per
tournament already fetched. `meta` is the format window (`TEF-PBL`,
`TEF-CRI`, …) derived from the date, **not** from the API's `format` field —
that field says `STANDARD` for every card pool since 2024 and cannot tell them
apart. `depth` is `voll` (all four levels) or `archetypen` (share and record
only); `voll` supersedes `archetypen`, which is how a thinly fetched window can
later be deepened.

> A completed Limitless tournament never changes. A row in this file means
> "already fetched, do not fetch again". Delete a row and the next run
> re-fetches that tournament — and appends its rows a second time.

> **`has_decklists` is the source's claim, not a verified fact — do not
> filter on it.** The column is the API's `decklists` field from
> `/tournaments/{id}/details`, written through unchanged. Measured
> 2026-09-12 over all 410 rows against `online_api_cards_TEF-PBL.csv`:
> 199 `True` (all of them with card rows), **1 `False` that has 816 card
> rows** (tournament `6a8c23ae8302ae761e5fb0bc`, 126 standings rows),
> and 210 empty — those are exactly the `depth=archetypen` rows, where
> `/details` is never requested, so the empty cell means "not asked",
> not "no". To find out whether decklists actually exist for a
> tournament, count its rows in `online_api_cards_<WINDOW>.csv`; that is
> the measured answer. The claim is kept rather than corrected because a
> disagreement between claim and holdings is information about the
> source (see the repo rule "report, don't silently repair").

### `online_api_archetypes.csv`
`tournament_id, date, meta, players, archetype_id, archetype_name, lists, lists_total, share, wins, losses, ties, matches, win_rate, win_rate_convention, record_source`

One row per tournament × archetype, across **all** format windows. Covers the
whole field, not just successful lists.

> **`share` never travels without its denominator.** `lists` and `lists_total`
> sit beside it in every row, and `lists_total` counts only players with a deck
> assignment. A share quoted without them is not reproducible.

`win_rate_convention` is always `mitUnentschieden` — S / (S + N + U), the
convention named in `js/win-rate-konvention.js`. `record_source` says which
route produced the record: `pairings` (computed from every match) or `records`
(summed from the standings' own `record` fields). Both were cross-checked live
on 2026-09-08 and agreed exactly (32-40-0 either way); `records` costs one
request instead of three and is what the thin depth uses.

`archetype_name` comes from the API's own `deck.name`. **Do not derive it from
`archetype_id`**: measured against 62 archetypes, the slug route gets 26 right,
the delivered name 61 (the 62nd is the `other` bucket).

### `online_api_cards_<FORMAT>.csv`
`tournament_id, date, meta, archetype_id, group, set, number, card, copies_total, lists_with_card, lists_total, avg_count, inclusion_rate`

One file **per format window** (`online_api_cards_TEF-PBL.csv`). Card counts
across the whole field of an archetype, joinable on `(set, number)`.

> **`avg_count` and `inclusion_rate` mean different things and both are needed.**
> `avg_count` divides by *all* lists of the archetype — the number Limitless
> shows on its own cards page. `inclusion_rate` divides by the lists that play
> the card at all. Two copies in half the lists is `avg_count` 1.0 and
> `inclusion_rate` 0.5; dividing by `lists_with_card` alone would report 2.0
> and claim a staple that isn't one.

Split per window because the card pool changes at every set release, and
because it is 146 KB per tournament: one flat file over six months reaches
65 MB and keeps growing. A window's file stops growing once the window closes.

The `other` bucket contributes **no** card rows — it is not one deck but twenty.

### `online_api_matchups_<FORMAT>.csv`
`tournament_id, date, meta, archetype_id, opponent_id, wins, losses, ties, matches, win_rate, win_rate_convention`

One file per format window. Archetype vs archetype from the **whole** field,
computed from every pairing.

> The matrix is **not** mirror-symmetric. `winner: -1` is a double loss and
> counts as a loss for both sides, so A-vs-B and B-vs-A can both show a loss
> for the same match. Byes and tardiness losses (`player2` empty) count in
> `online_api_archetypes.csv` but not here — they have no opponent archetype.

## Contract check

`scripts/data_guardian.py` verifies daily that every file above exists and still
has its required columns, and reports (never repairs) when a file suddenly
shrinks, a set stops mapping, or an input goes stale.

**If you need a new column or a new file, open an issue here** rather than
parsing around the gap — that keeps the contract explicit and checkable.

### `japanese_cards_database.csv`
`name_jp,name_en,set,number,type,energy_type,hp,rarity,image_url,…`

**NACHGETRAGEN 10.09.2026, Gegenrichtung.** Diese Datei stand im
Waechtervertrag (`scripts/data_guardian.py`), aber in keinem Absatz dieses
Dokuments — die Zusicherung war also da, die Beschreibung fehlte. Sie ist die
japanische Haelfte der Kartendatenbank; `backend/core/prepare_card_data.py`
fuehrt sie mit `all_cards_database.csv` zu `all_cards_merged.json` zusammen.
Gemessen am 21.08.2026, als sie im Saatgut des Preislaufs fehlte: die
zusammengefuehrte Datenbank fuehrte danach **0** japanische Karten statt 772,
und im Deck Builder waren JP-Karten an fuenf von sieben Tagen verschwunden.

### `archetype_aliases.json`
`{_meta, turnier_zu_ladder: [{turnier, ladder, beleg}], bewusst_nicht_verbunden: [{turnier, vermutet, grund}], decklisten_zu_labs: [...]}`

**NACHGETRAGEN 10.09.2026:** der vierte Schluessel `decklisten_zu_labs` steht
seit dem 09.09.2026 in der Datei (Commit `b0e0e5ed`), gelesen von
`js/deck-builder-consistency.js:492`, gehalten von
`tests/unit/test-namensbruecke-decklisten.js`. In dieser
Schnittstellenbeschreibung fehlte er — und genau das ist der Fehler, vor dem
diese Datei oben warnt: eine veroeffentlichte Struktur waechst, das Dokument
nicht, und ein fremder Leser plant mit drei Schluesseln statt vier.

The curated bridge between archetype names in `limitless_online_decks.csv`
(ladder) and `online_tournament_top8_decks.csv` (tournaments) — two sources
that name the same deck differently. Hand-written, never generated. The
ladder name is always canonical.

An entry goes in only after both rows have been checked individually and
their numbers line up. A plausible name is not enough: dropping "Mega"
would merge Mega Greninja with Greninja, Mega Gengar with Gengar and Mega
Feraligatr with Feraligatr — three distinct decks per pair.

`bewusst_nicht_verbunden` is not a TODO list, it is part of the contract:
these names stay separate on purpose, and the page lists them as
unresolved. A visible gap is recoverable; a wrong merge looks right.

> Read by `js/app-tier-meta.js` for the Meta-Performance table. Without the
> file the join falls back to exact string matching — the previous
> behaviour, which put a deck with 326.5 weighted entries on row 132 of 138.

### `champions_type_chart.json`
`{_meta, chart: { attackingType: { defendingType: multiplier } }}`

The 18x18 type effectiveness table, listing only deviations from 1.0.
Public game rules, hand-written — not scraped from anywhere, and not
derived from another project's output. Read by `js/champions-damage.js`
for the Champions matchup and damage views.

> Anything absent is neutral (1.0). A missing entry therefore never
> means "unknown", which is why the file can stay this small.

## `champions_editionen.json` — in welchen Editionen eine Art vorkommt

Gebaut von `scripts/build_champions_editionen.py` aus dem PokeAPI-CSV-Abzug,
derselben Quelle, aus der schon die deutschen Namen kommen. Gelesen von
`js/app-side-quest-pokedex.js` (Abschnitt „Wo gibt es das?" im Detail).

* Schluessel ist die **Pokedex-Nummer der Art**, nicht der Form. 292
  Roster-Eintraege verteilen sich auf 204 Arten; Mega- und Regionalformen
  teilen sich den Eintrag ihrer Grundform.
* Die Datei sagt **„kommt vor in"**, nicht **„ist zu fangen in"**. Eine Art
  kann im Dex einer Edition stehen und dort nur ueber Tausch oder Entwicklung
  erreichbar sein. Wer die Spalte anders beschriftet, behauptet mehr als die
  Quelle hergibt.
* **`legends-za` und `mega-dimension` fehlen mit Absicht.** Der Abzug fuehrt
  fuer beide exakt dieselbe Menge wie fuer `scarlet` (733 Eintraege, Differenz
  in beide Richtungen 0). Legends Z-A hat real einen deutlich kleineren
  Bestand — zwei Editionen mit identischer Menge sind eine kopierte
  Vorbelegung, keine Messung. Zum Vergleich, wo die Quelle traegt:
  `sword` 664 gegen `scarlet` 733. Die Sperre steht in `_meta.ausgeschlossen`
  und wird von `tests/unit/test-champions-raster.js` gehalten.
* Die japanischen Erstausgaben (`red-japan`, `green-japan`, `blue-japan`)
  fehlen ebenfalls: sie tragen im Deutschen dieselben Namen wie die
  internationalen und stuenden sonst doppelt in der Liste.

## `pokemon_go_liste.json` — welche Arten es in Pokemon GO gibt

Geholt von `scripts/scrape_pokemon_go_liste.py` aus der vom Betreiber am
09.09.2026 benannten Quelle (PokeWiki). Gelesen von
`js/app-side-quest-pokedex.js`.

**Diese Datei kennt kein Nein.** Die Quelle markiert sich selbst als seit
Anfang 2026 veraltet und fehlerhaft; der Warnkasten steht woertlich in
`_meta.warnung` und wird in der Oberflaeche angezeigt. Daraus folgt fuer
jeden Verbraucher:

| Fall | erlaubte Aussage |
| --- | --- |
| Art steht in `basis` bzw. `regional` | „war zum Stand der Quelle in GO verfuegbar" |
| Art steht nicht drin | „steht nicht in dieser Liste" — **niemals** „gibt es in GO nicht" |
| Mega-Form | die Liste fuehrt nur Grundformen, also gar keine Aussage |

Gemessen am 09.09.2026: von 217 Roster-Eintraegen ohne Mega sind 195
gelistet und 22 nicht — darunter Mimigma, Wolwerock und Durengard, die es in
GO tatsaechlich gibt. Das ist der Beleg dafuer, dass ein fehlender Eintrag
nichts beweist.

## `pokemon_go_shiny.json` — wo ein Shiny in GO veroeffentlicht ist

Geholt von `scripts/scrape_pokemon_go_shiny.py` aus
`https://leekduck.com/shiny/pms.json` — der Datei, aus der die
LeekDuck-Checkliste ihre Seite baut. Vom Betreiber am 09.09.2026 benannt.
Gelesen von `js/app-side-quest-pokedex.js`.

**Diese Datei darf ein Nein sagen** — anders als `pokemon_go_liste.json`.
Jeder Eintrag traegt ein Veroeffentlichungsdatum, und die Quelle wird
gepflegt. Ein fehlender Eintrag heisst deshalb tatsaechlich "kein
veroeffentlichtes Shiny".

**Der Datumsfilter ist Pflicht.** Die Quelle fuehrt auch ANGEKUENDIGTE
Veroeffentlichungen: gemessen am 09.09.2026 sind 12 der 1.475 Eintraege in
der Zukunft datiert (bis 2027/02/13), durchweg Kostuemformen aus geplanten
Events. Wer ungefiltert liest, behauptet, ein Shiny sei fangbar, das es noch
nicht gibt. Der Scraper filtert auf `released_date <= heute` und legt die
Zahl der uebersprungenen in `_meta.angekuendigt_uebersprungen` ab.

**Nebenwirkung, die zaehlt:** ein veroeffentlichtes Shiny BEWEIST, dass es die
Art in GO gibt. Damit schliesst diese Datei Luecken der veralteten Artenliste.
Gemessen: drei Roster-Eintraege (Arktilas (Hisui), Schlurm, Psiaugon) fehlen
dort, haben aber ein Shiny — die Oberflaeche zeigt bei ihnen deshalb "In GO —
belegt durch das veroeffentlichte Shiny" statt eines Widerspruchs.

## Item-Nutzung liest `champions_usage.json` andersherum

`js/app-side-quest-items.js` dreht die Nutzungsdaten um: statt "welches Item
spielt dieses Pokemon" beantwortet die Ansicht "welche Pokemon spielen dieses
Item".

**Der Nenner aendert sich dabei NICHT, und das ist der Fallstrick.** Der
Prozentwert in `held_item` ist der Anteil an den Bauten **eines** Pokemon. Er
ist NICHT dessen Anteil an allen Traegern des Items — diese Zahl steht
nirgends und laesst sich aus der ersten nicht herleiten, weil jeder Wert einen
anderen Nenner hat. Die Ansicht schreibt das ueber jede Traegerliste und
rechnet die verbotene Zahl nicht aus; `tests/unit/test-item-nutzung.js` haelt
fest, dass es in `itemTabelle()` genau eine Summe gibt.

Zwei Sortierungen, beide beschriftet:

| Sortierung | Rechnung | Frage |
| --- | --- | --- |
| Bindung | roher Hoechstwert | wer spielt das Item fast immer? |
| Praesenz | Σ (Anteil × Team-Auftritte) | wo begegnet es mir am ehesten? |

Praesenz ist die Voreinstellung. Nach Bindung sortiert stehen oben
ausschliesslich Mega-Steine (Floetteonit 99,1 % bei einem Traeger) — richtig
gerechnet und als erster Bildschirm wertlos.

## `opgg_champions_moves.json` — Attacken je Champion von op.gg

**NACHGETRAGEN 10.09.2026.** Die Datei wurde am selben Tag um 04:10 zum ersten
Mal erzeugt (92.757 Bytes). Im Waechter stand seit Wochen der Satz
"opgg_champions_moves.json gehoert hier ebenfalls hin — Eintragen, sobald sie
da ist"; die Bedingung war seit dem Morgen erfuellt, der Eintrag fehlte
trotzdem. Genau dafuer taugt eine Notiz im Quelltext nicht: niemand liest sie
zum richtigen Zeitpunkt. Jetzt haelt
`tests/python/test_consumers_vertrag_deckt_sich.py` beide Listen deckungsgleich.

Geholt von `scripts/scrape_opgg_champions_moves.py`. Sie ergaenzt
`champions_resources.json` um Attacken, die der Schalter `inChampions` dort
nicht hergibt — die beiden Dateien sind also **kein** Ersatz fuereinander.

Gelesen wird sie im Champions-Bereich der Oberflaeche. Fehlt sie, bleiben die
Attackenzeilen leer; erfunden wird nichts.

## `champions_resources.json` traegt Attacken aus den Nutzungsdaten nach

`scripts/build_champions_resources.py` baut das Nachschlagewerk aus dem
Champions-Datensatz (otterlyclueless/pokemon-champions-data) und uebernimmt
Attacken normalerweise nur, wenn dort `inChampions: true` steht.

**Dieser Schalter ist unvollstaendig.** Gemessen am 09.09.2026 tragen sechs
Attacken `inChampions: false`, obwohl `champions_usage.json` belegt, dass
Pokemon sie in Champions einsetzen:

| Attacke | deutsch | Typ | wer spielt sie |
| --- | --- | --- | --- |
| Barb Barrage | Giftstachelregen | Gift | Overqwil, Qwilfish |
| Make It Rain | Goldrausch | Stahl | Gholdengo (96,6 %) |
| No Retreat | Finalformation | Kampf | Falinks (83,2 %) |
| Rage Fist | Zornesfaust | Geist | Annihilape (97,3 %) |
| Spirit Break | Seelenbruch | Fee | Grimmsnarl (70,4 %) |
| Topsy-Turvy | Invertigo | Unlicht | Malamar |

Ohne Nachtrag fehlt ihr Eintrag komplett, und die Typwirksamkeit im Pokedex
(`js/app-side-quest-pokedex.js`) zeigt fuer sie **"Typ unbekannt"** — was
korrekt war, aber vermeidbar.

**Worauf der Nachtrag sich stuetzt — und worauf nicht.** Die erste Fassung
dieses Abschnitts nannte zwei Belege; nachgemessen haelt nur einer:

| angeblicher Beleg | gemessen | taugt er? |
| --- | --- | --- |
| `championsVerified: true` in der Quelle | steht bei **900 von 900** Attacken auf true, auch bei allen 406 zu Recht ausgeschlossenen | **nein**, trennt nichts |
| "hat in der Quelle einen Typ" | **alle 900** haben einen Typ | **nein**, greift nie |
| Vorkommen in `champions_usage.json` | 391 genutzte Attacken, davon 6 ohne Eintrag | **ja**, der einzige |

Der Nachtrag haengt damit an genau einem Scraper. Schriebe
`scripts/scrape_champions_usage.py` nach einem Layout-Wechsel der Quellseite
einen falschen Attackennamen, und traefe der einen der 406 ausgeschlossenen
Namen, landete er hier als Champions-Attacke.

Dagegen steht eine **Obergrenze** (`NACHTRAG_OBERGRENZE = 20`): ein
systematischer Parse-Fehler erzeugt viele falsche Namen, nicht sechs. Reisst
die Grenze, wird **nichts** nachgetragen und der Lauf meldet es — lieber
wieder "Typ unbekannt" als eine erfundene Champions-Attacke. Eine leere,
aber syntaktisch gueltige Nutzungsdatei bricht den Lauf ab, statt still 494
Attacken zu schreiben.

Jeder so entstandene Eintrag traegt `nachgetragen: true`;
`_meta.counts.nachgetragen` fuehrt die Zahl. Die deutschen Namen stammen wie
ueberall aus `de_name_overrides.json` (PokeWiki) und wurden gegen die
Wiki-Seiten geprueft — Goldrausch = Stahl, Finalformation = Kampf.

**Was der Nachtrag NICHT schliesst:** drei der sechs (Barb Barrage, Make It
Rain, Rage Fist) haben kein `de_effect`. PokéAPI fuehrt fuer sie keine
deutsche Beschreibung — im Reiter "Nachschlagen" steht bei ihnen "Keine
Beschreibung hinterlegt", wie bei 42 weiteren Attacken schon vorher. Der Typ
ist da, der deutsche Beschreibungstext nicht.

**Reihenfolge in CI ist Pflicht.** Beide Laeufe, die `champions_usage.json`
committen (`champions-replica-scrape.yml`, `champions-usage-refresh.yml`),
muessen das Nachschlagewerk **nach** dem Usage-Scrape neu bauen und
mitcommitten. Sonst kann eine neu aufgetauchte Attacke ohne Eintrag im Repo
landen — der Test unten wird rot, der `test`-Job blockt `build` und `deploy`,
und die Seite haengt auf dem alten Stand, ohne dass jemand einen Fehler
gemacht hat.

Gehalten von `tests/python/test_attacken_typen_vollstaendig.py`: keine
genutzte Attacke ohne Eintrag, keine ohne Typ, kein Nachtrag ohne
Nutzungsbeleg, Obergrenze und Leer-Abbruch im Bauer, und die
CI-Reihenfolge in beiden Laeufen.

## Zwei Spalten heissen `deck_slug` und meinen nicht dasselbe

GEMESSEN am 10.09.2026. Beide Dateien fuehren eine Spalte dieses Namens:

| Datei | Beispielwerte |
| --- | --- |
| `tournament_decklists_per_player.csv` | `24442`, `25592`, `26263` — eine Kennung der Quelle |
| `labs_tournament_decks.csv` | `alakazam-dudunsparce`, `aegislash-par` — ein Namensschluessel |

Ein Verbund darueber ergibt **0 Treffer** — 934 verschiedene Werte auf der
einen Seite, 267 auf der anderen, Schnittmenge leer. Und genau das ist die
Falle: eine leere Ergebnismenge sieht aus wie "diese Woche gab es keine
Uebereinstimmung" und nicht wie "diese beiden Spalten sind nicht dasselbe
Ding".

**Der Verbund, der traegt, laeuft ueber die Namen:**

    tournament_decklists_per_player.deck_archetype  ==  labs_tournament_decks.deck_name

Gemessen: 52 von 53 Archetypen der Decklisten haben dort ein Gegenstueck. Der
eine ohne ist `Ogerpon Box` — labs fuehrt ihn unter einem anderen Namen, und
das ist ein Namensunterschied der Quellen, kein Datenfehler.

Ein Umbenennen der Spalten waere die saubere Loesung und ist genau das, was
diese Datei oben verbietet: die Namen sind veroeffentlicht, und ein anderes
Projekt liest sie. Deshalb steht hier die Warnung statt einer Umbenennung.

### NACHTRAG 10.09.2026: jetzt sind es DREI Bedeutungen, nicht zwei

Der Wochenlauf #135 hat erstmals Online-Zeilen in
`tournament_decklists_per_player.csv` geschrieben (`quelle` = `online`,
Quelle: play.limitlesstcg.com). Deren `deck_slug` ist **kein** Zahlenschluessel,
sondern ein Namensschluessel derselben Bauart wie in
`labs_tournament_decks.csv`:

| Zeilen | `deck_slug` | Beispiel |
| --- | --- | --- |
| `quelle` = `papier` | Zahlenkennung von limitlesstcg.com | `28752` |
| `quelle` = `online` | Namensschluessel von play.limitlesstcg.com | `alakazam-dusknoir` |
| `labs_tournament_decks.csv` | Namensschluessel der Labs-Daten | `alakazam-dudunsparce` |

Gemessen am selben Tag: **79 Werte** ueberschneiden sich jetzt zwischen der
Decklisten- und der Labs-Datei — ausschliesslich ueber die Online-Zeilen.

**Was das fuer einen Verbund heisst:** ein `JOIN` ueber `deck_slug` trifft
jetzt etwas, aber nur die Online-Haelfte, und still. Wer die ganze Datei
verbindet, bekommt ein Ergebnis, das nach "teilweise gefunden" aussieht und in
Wahrheit "nur eine Herkunft gefunden" heisst. Der Verbund ueber
`deck_archetype` == `deck_name` bleibt deshalb der richtige — er gilt fuer
beide Herkuenfte.

Umbenannt wird weiterhin nichts: die Spaltennamen sind veroeffentlicht.

Gehalten von `tests/python/test_deck_slug_kein_verbund.py`: dass die
Papierzeilen weiterhin Zahlen fuehren und die Online-Zeilen Namen (eine
Vermischung INNERHALB einer Herkunft waere der Befund), dass eine
Ueberschneidung mit den Labs-Werten nur ueber Online-Zeilen zustande kommt,
und dass der Namensverbund weiterhin die grosse Mehrheit trifft.
