// ============================================================
// Meta Call – Tournament Prediction Feature
// ============================================================
//
// Rotation contract (Surface-Audit 2026-05-27):
// All rotation-specific values in this module are derived at runtime
// from `_formatWindow` (loaded from data/format_window.json) or from
// the `meta` column of labs/cards CSVs. There are NO hardcoded set
// codes or meta keys in any code path; string literals like 'TEF-POR'
// appear only in `// e.g.` comments as illustrative examples and are
// safe to leave through future rotations.
//
window.MetaCall = (function () {
  'use strict';

  // Build-version stamp — surfaced at module bootstrap so a stale
  // PWA cache can be diagnosed by reading this single console line.
  // Should match the ?v= query param on the index.html script tag
  // and the CACHE_NAME suffix in service-worker.js. If the user
  // reports "feature X isn't working", check whether this number is
  // older than the expected deploy version before debugging further.
  const _BUILD_VERSION = 'v202606030200';
  try {
    console.info(
      '%c[MetaCall] Engine boot · build %s · ' + new Date().toISOString(),
      'color: #6b21a8; font-weight: bold',
      _BUILD_VERSION,
    );
  } catch (_e) { /* console may be muted */ }


  // ── Internal State ─────────────────────────────────────────
  let _matchupMap = null;  // normalize(deck) -> normalize(opp) -> {pWin, pTie, pLoss}
                           // Online-source matchup matrix. Loaded from
                           // data/limitless_online_decks_matchups.csv via the
                           // online_tournament_scraper. Always present;
                           // serves as the 20 % minority component in
                           // the 3-source blend below.
  let _majorMatchupMap     = null; // overall day_filter (legacy / fallback anchor)
  let _majorMatchupMapDay1 = null; // day_filter='day1' rows — full Swiss field
  let _majorMatchupMapDay2 = null; // day_filter='day2' rows — cut-qualifying field
                                   // All three labs maps share the same shape:
                                   //   { meta: { normDeck: { normOpp: { games, winPct, source } } } }
                                   // Loaded from data/labs_tournament_matchups.csv
                                   // (scraper-produced). Floor per source is
                                   // documented at the constants below.

  // ── 3-source matchup blend ────────────────────────────────
  // User-flagged 2026-06: matchup predictions should blend three
  // distinct sources rather than switching between them. Day-2 carries
  // the most weight (cut-quality play, lowest noise), Day-1 the second
  // (covers the entire Swiss field), Online the third (always available
  // but elite-pilot biased). The 45 / 35 / 20 split is a quality-weighted
  // judgment — not a games-weighted one — designed to surface "what's
  // actually winning in cut" while keeping the Day-1 base and the live
  // Online signal in the picture.
  const MATCHUP_BLEND_WEIGHT_DAY2   = 0.45;
  const MATCHUP_BLEND_WEIGHT_DAY1   = 0.35;
  const MATCHUP_BLEND_WEIGHT_ONLINE = 0.20;
  // Overall fallback weight = DAY1 + DAY2 = 0.80. When neither Day-1
  // nor Day-2 has enough samples for a pair (early-meta gap, rare
  // archetype matchup), Overall replaces the entire Day-split component
  // at its combined weight. Online stays at 0.20 so the relative
  // major-online balance holds across both code paths.
  const MATCHUP_BLEND_WEIGHT_OVERALL_FALLBACK = MATCHUP_BLEND_WEIGHT_DAY1 + MATCHUP_BLEND_WEIGHT_DAY2;
  // Sample-size floors per source. Overall is the most generous (full
  // tournament sample); Day-1 and Day-2 fire at lower thresholds because
  // each filtered slice is naturally smaller. 5 games gives a 22 pp
  // 95 % CI on a 50 % deck — wide but already a stronger signal than
  // online ladder noise on a fresh archetype.
  const MAJOR_MATCHUP_MIN_GAMES       = 10;
  const MAJOR_MATCHUP_MIN_GAMES_DAY1  = 5;
  const MAJOR_MATCHUP_MIN_GAMES_DAY2  = 5;
  // Past-Meta runs against a FINISHED dataset — no more games will be
  // added to last year's Phantasmal Flames meta, ever. A 10-game cutoff
  // that's reasonable for an in-progress format wastes 80 % of the
  // matchups: at 3 majors there are typically 5-9 games per pair, not
  // 10+. Past-Meta drops to a 3-game floor so the same WRs the Past-
  // Meta Module displays directly (e.g. Alakazam Dudunsparce vs
  // Archaludon Dudunsparce = 25.93 % across 9 games) also drive the
  // Meta Call simulation, instead of being silently rounded to 50/50.
  // Below 3 games is genuinely noise (one win/loss flips it 33 pp),
  // so the floor stays — sparse pairs default to honest 50/50.
  const MAJOR_MATCHUP_MIN_GAMES_PAST = 3;
  const MAJOR_MATCHUP_TIE_RATE = 0.02;     // labs CSV doesn't carry tie rate; use the same default the online matrix uses
  let _deckWRAdjustment = {}; // normalize(deck) -> pp delta (labs WR − online cumulative WR). Predictor 5.3 — corrects the matchup simulator for the gap between online-ladder WR (elite-pilot inflated) and major-tournament WR (typical pilot). See _computeMatchupAdjustments() and applied in getBaseMatchup().
  let _shareList  = null;  // [{name, onlineShare}] sorted desc — onlineShare is the
                            // PREDICTED share once Predictor 2.0 has run; the raw ladder
                            // share is kept on each entry as `ladderShare` for the badge.

  // Meta bucket labels — Limitless aggregates everything below their
  // archetype-classification threshold into a single "Other" row.
  // Treating it as an archetype produces nonsense everywhere (the
  // 2026-06-12 dark-horse-tips bug: "Other" landed at 22.3 % Day-2
  // odds because the bucket's combined Day-2 shares look like a
  // strong deck). Filtered out at the share-list / labs-aggregation
  // gates so the bucket never reaches the predictor or the
  // recommendation surfaces. Keeps the long-tail count fixed (no
  // re-imputation) — we just refuse to treat the bucket as a deck.
  const _META_BUCKET_LABELS = new Set(['other', 'unclassified', 'misc']);
  function _isMetaBucketLabel(name) {
    return _META_BUCKET_LABELS.has(String(name || '').trim().toLowerCase());
  }
  let _trendMap   = null;  // normalize(deck) -> share_change (%-points week-over-week)
  let _tournamentStats = null; // normalize(deck) -> { broughtShare, top8Conv, top16Conv, ... }
  // Diagnose-Marken im Vorhersage-Streifen. Standard aus: sie richten
  // sich an Entwickler, nicht an Spieler. Einschalten mit
  // MetaCall.setDiagnostics(true) in der Konsole.
  let _showDiagnostics = false;
  let _predictorMode  = 'A'; // 'A' = online-only fallback, 'B' = labs-major data available
  let _labsMajorRows  = 0;   // count of labs CSV rows that informed the mode decision
  let _labsRowsByDeck = {};  // labs share data — kept after loadData so re-runs work
  let _clCurrentByDeck = {}; // normalize(deck) -> share % from city_league_archetypes_comparison.csv (current Pokémon block)
  let _clPastByDeck    = {}; // normalize(deck) -> share % from city_league_archetypes_past_comparison.csv (last-rotation snapshot)
  let _useClCurrent    = false; // user toggle: include Current City League in predictor
  let _useClPast       = false; // user toggle: include Past City League in predictor

  // Meta Call Mode — user-pickable behavioural lens for counter-meta.
  //   'standard' (default) — online ladder is treated as the truth.
  //     The 4.6 family-suppression and 4.7 counter-adoption-boost
  //     stages early-return as no-ops. Matches the majority of recent
  //     majors (LA 31.9 %, Prague 29.4 %, Campinas 32.9 % all had
  //     Dragapult-family near or above online level).
  //   'counter' — players actively counter the dominant family.
  //     4.6 and 4.7 fire at full strength. Fits events where the
  //     player base has visibly hedged against the top deck after
  //     consecutive regionals dominated by it (Utrecht 25.1 %).
  //
  // Session-scoped: a fresh page load always starts in 'standard'.
  let _metaCallMode = 'standard';
  let _metaCallModeLastLogKey = null;  // tracked per (majorId + mode) so toggling within the same major re-logs

  // ── Meta Source (Current | Past) ─────────────────────────
  // Session-scoped, defaults to current. When _metaSource === 'past',
  // _runPredictor() consumes archetype shares aggregated from the
  // per-format Major chunk file selected by _pastMetaFormatKey instead
  // of the live online ladder + labs CSVs. Matchup matrix stays the
  // current-online proxy (we don't have historical matchup-pair data
  // scraped) — flagged in the UI when source = past.
  let _metaSource = 'current';     // 'current' | 'past'
  let _pastMetaFormatKey = null;   // e.g. 'TEF-POR' when _metaSource = 'past'
  let _pastMetaAvailableFormats = []; // [{ key, label, maxDate }] sorted newest-first
  let _pastMetaCachedShares = new Map(); // formatKey -> [{name, share}] memo
  // Frozen-meta labs aggregate (Final-Cumulative ranking). Populated
  // lazily by _loadPastMetaLabsAggregate when the user opens a closed
  // past meta — that mode swaps out the live predictor for a deterministic
  // historical ranking driven by labs_tournament_decks_<META>.csv.
  // null value cached separately from absence to memoize "no labs file
  // for this format" without re-fetching on every render pass.
  let _pastMetaLabsCache = new Map(); // formatKey -> { archetypes, tournamentCount } | null

  // ── Predictor 3.0 — history-aware trend signals ───────────
  let _lastMajorDate     = null; // 'YYYY-MM-DD' — most recent labs tournament_date
  let _historyManifest   = null; // { dates: [...], latest: 'YYYY-MM-DD' } from data/online_share_history/manifest.json
  let _snapshotAtMajor   = {};   // normalize(deck) -> share% on (closest available date ≤ _lastMajorDate)
  let _snapshotWeekAgo   = {};   // normalize(deck) -> share% on (closest available date ≤ today-7d)
  let _labsConvByDeck    = {};   // normalize(deck) -> { sum, n } weighted top8_conv_rate (legacy)
  let _labsQualityByDeck = {};   // normalize(deck) -> { d1: sum, d2: sum } per-deck day1/day2 totals across recent majors
  // Original (pre-filter) ladder + brought shares — populated the first
  // time _applyDateFilter overrides them, restored when the user clears
  // the date filter so a "Clear" doesn't require a full reload.
  let _origLadderShareByDeck  = null; // Map<normName, share>
  let _origBroughtShareByDeck = null; // Map<normName, share>
  let _labsDay2ConvByDeck = {};  // normalize(deck) -> { sum, n } weighted day1_to_day2_conv. Quality signal that
                                 // captures "this deck punches above its share at majors" — user-flagged via the
                                 // LA-Regionals strategy doc (Grimmsnarl/Froslass at ~53.7 % Day-2 win-rate from
                                 // a mid-share field). Direct conversion rate is more robust than the d2/d1 share
                                 // ratio in _labsQualityByDeck because it's normalised by the deck's own Day-1
                                 // base size, so it doesn't reward decks that Just had more Day-1 players.
  let _baselineSnapshotDate = null; // actual date used for the post-major baseline (for banner)
  let _lastAccuracyReport = null; // { mae, baselineDate, majorDate, decks } — shown next to the banner when a new major is detected
  // ── Last major snapshot (for text-first deck cards) ───────
  // Identified via the highest tournament_id (Limitless assigns sequentially)
  // and exposes per-deck share + win_pct to the field-card renderer.
  let _lastMajorInfo     = null; // { id, name, shortName, date, country, totalPlayers }
  let _lastMajorByDeck   = {};   // normalize(deck) -> { share, winPct, players }
  // Predictor 6.0 — Tier-1 Convergence family aggregates (rebuilt
  // each time the predictor runs; see _shareList.forEach block).
  let _famLadderAgg      = Object.create(null);
  let _famLastMajorAgg   = Object.create(null);
  let _famMedianAgg      = Object.create(null);
  // Predictor 6.1 — Live-Share Floor family aggregates (rebuilt
  // each predictor run); exposed via _diag for inspection.
  let _lsFamsLastRun     = Object.create(null);

  // ── Predictor 4.6 — Underdog-Champion-Boost ──────────────────────
  // The textbook case: a deck WINS a 1,000+ player regional while
  // sitting at <3 % usage, then jumps multi-x at the next event in the
  // same continental circuit (Campinas 2026 → Indianapolis: Ogerpon
  // Meganium 2.6 % → 7.9 %). We capture the most-recent such win per
  // deck and apply a freshness-decayed boost in Stage 5.x.
  //
  // Why most-recent only: a deck that's now Tier-1 doesn't need a
  // historical underdog title to predict its share. The signal is
  // strongest when it's the deck's MOST RECENT major appearance.
  let _underdogChampionByDeck = {}; // normalize(deck) -> { tid, date, share, players, top1Count, eventName }
  const PREDICTOR_4_6_MAX_SHARE_PCT     = 4.0;    // "underdog" cutoff
  const PREDICTOR_4_6_MIN_PLAYERS       = 500;    // regional-tier event
  const PREDICTOR_4_6_FULL_DECAY_DAYS   = 14;     // full boost within 14 days
  const PREDICTOR_4_6_ZERO_DECAY_DAYS   = 28;     // zero boost past 28 days
  const PREDICTOR_4_6_BOOST_PP_MAX      = 2.5;    // hard cap on extra PP

  // ── Predictor 4.7 — Online-Tournament-Win Signal ────────────────
  // Companion to Predictor 4.6 (Underdog-Champion-Boost, regional
  // wins). The Indianapolis post-mortem cited online wins as leading
  // indicators in their own right: Ogerpon Meganium Hydrapple won
  // "1st of 341 at Championships of Doom VIII, 1st of 194 at N's
  // Castle Showdown, 1st of 70 at Oceania Open" — all before its
  // regional spike at Indianapolis. A fresh place-1 finish in a
  // ≥150-player online tournament for the SAME archetype is a
  // weaker but real signal that the deck is in the meta's attention
  // funnel. We boost smaller than P4.6 (cap 1.0 pp vs 2.5 pp) since
  // online events are higher-variance + smaller samples per pilot.
  //
  // Fires only when the win's format matches the active in-person
  // rotation — during the lag window CRI online wins do NOT boost
  // TEF-POR predictions (they're a different format).
  let _onlineWinsByDeck = {};       // normalize(deck) -> { date, players, format, tournamentId }
  const PREDICTOR_4_7_MAX_SHARE_PCT     = 5.0;    // "underrated online" cutoff
  const PREDICTOR_4_7_MIN_PLAYERS       = 150;    // online tournament size floor
  const PREDICTOR_4_7_FULL_DECAY_DAYS   = 7;      // tighter window — online events are more frequent
  const PREDICTOR_4_7_ZERO_DECAY_DAYS   = 21;     // signal gone past 3 weeks
  const PREDICTOR_4_7_BOOST_PP_MAX      = 1.0;    // smaller cap than P4.6

  // ── Predictor 5.4 — Day-2 share-growth (Δ-share) ────────────────
  // Conversion ratio (`day1_to_day2_conv`) and aggregate WR already
  // boost decks that overperform their Day-1 base, but neither tracks
  // ABSOLUTE share growth. A deck that climbs 3.8 → 5.3 (+1.5 pp) like
  // Lillie's Clefairy did at Indianapolis is a stronger forward signal
  // than the same deck staying at 5 → 5 with 100 % conversion. We
  // separately capture the per-deck weighted Δ-share so the predictor
  // can boost decks the cut actively pulls IN, not just the ones the
  // cut doesn't shed.
  let _labsShareGrowthByDeck = {}; // normalize(deck) -> { sum, n } weighted (day2_share_pct - day1_share_pct)
  let _labsDay2WrByDeck      = {}; // normalize(deck) -> { sum, n, samples[] } weighted day2_win_pct
                                   // 2026-06 Indy-reco-calibration: user analysis showed that
                                   // empirical Day-2 conversion alone is "variance" unless the
                                   // deck also WINS in cut. d2WR (= avg win-pct AFTER making
                                   // Day 2) is the single best aggregate signal that
                                   // distinguishes the user's best Indy picks (Basic Box
                                   // 55.5 %, Dragapult Dudunsparce 51.5 %) from the misses
                                   // (Festival Lead 47.5 %, Lopunny declining 80 → 38). The
                                   // recommendations engine uses this to dampen day2Prob for
                                   // decks that historically lose in cut and lift it for
                                   // decks that historically grind through.
  const PREDICTOR_5_4_MIN_GROWTH_PP     = 0.5;    // ignore noise under +0.5 pp Δ
  const PREDICTOR_5_4_BOOST_PER_PP      = 0.4;    // +0.4 PP added share per +1 PP Δ
                                                   // Reduced 0.6 → 0.4 in the 2026-06 Indy calibration: the
                                                   // earlier 0.6 was injecting +1.2 pp into Festival Lead /
                                                   // Slowking-like online-hype decks that didn't show up in
                                                   // person, pushing the predicted share above the 1.83 pp
                                                   // naive-baseline MAE.
  const PREDICTOR_5_4_BOOST_PP_MAX      = 1.0;    // hard cap, lowered 1.5 → 1.0 for the same reason.

  // ── Phase α / β (2026-06) — calibration-driven helpers ──────────
  // Built once per loadData() pass from the active-meta labs CSV.
  // Used by:
  //   • CRI-Format-Filter (Phase α A): online-only decks that have
  //     ZERO labs rows in the active meta are dropped from the
  //     prediction list. Catches Mega Greninja / Beedrill et al.
  //     that live on the online ladder but never appeared in any
  //     TEF-POR Regional.
  //   • In-Person-Absent-Damper (Phase α C): decks that have labs
  //     rows but never broke top-15 of any active-meta tournament
  //     get their online_share dampened by 0.4×, since they're
  //     online-only experimentation that historically hasn't
  //     translated in-person (the Slowking pattern).
  //   • Major-First-Anchor (Phase β): decks with ≥2 labs majors at
  //     ≥2 % share get a primary base of recency-weighted major
  //     average (0.50/0.30/0.20) blended 0.7/0.3 with online; the
  //     bare online ladder stays as the fallback for everyone else.
  let _activeFormatLabsDecks   = new Set(); // norm(name) — appears in active-meta labs CSV
  let _activeFormatTop15Decks  = new Set(); // norm(name) — broke top-15 in any active-meta tournament
  let _majorSharesByDeck       = {};        // norm(name) -> [{ date, tid, share, day1, day2 }, ...] DESC by date

  // ── Predictor 5.5 — Last-Meta-Labs floor ────────────────────────
  // The TEF-CRI rotation (2026-06-05) is a SET ADDITION — every card
  // legal in TEF-POR is still legal in TEF-CRI. Decks that put up a
  // measurable share in the closed meta (Festival Lead 3.90 % across
  // all TEF-POR Regionals, Basic Box 2.12 %, Cynthia's Garchomp
  // 4.25 %) don't disappear overnight; their pilots keep playing them
  // until the new set produces a deck that knocks them off. The
  // baseline Mode A predictor was floor-blind to this continuity and
  // came in below 2 % on each of them at the first TEF-CRI major.
  //
  // _lastMetaLabsByDeck holds the player-weighted average share each
  // archetype put up across all tournaments of `previous_format_key`
  // (read from format_window.json). It is consumed as a SOFT FLOOR in
  // Mode A baseline only — applied as max(predicted, share*FACTOR) —
  // and gated by format_window.set_addition_only. When that flag is
  // false (a true rotation, oldest set leaves the legal pool), last-
  // meta data becomes misleading (key support cards are gone) and the
  // floor must NOT be applied.
  //
  // Why player-weighted: sum(share * players) / sum(players) gives a
  // single "out of every brought deck across the whole meta, what
  // fraction was this archetype" — which is exactly the unit our
  // predicted-share output uses. Equal-tournament averaging would
  // overweight tiny side events relative to the 1000-player
  // Regionals.
  let _lastMetaLabsByDeck      = {};        // norm(name) -> { share, players, n }
  const PREDICTOR_5_5_FLOOR_FACTOR = 0.7;   // soft floor = lastMetaShare × 0.7
  // Predictor 5.6 — growth-boost on the floor + post-floor decline-damper.
  // Backtest-tuned 2026-06-07 against Turin Final ground truth. Reduces
  // MAE-top20 from 1.65 (production) to 0.93. See the in-line comment
  // block in the Mode A baseline branch for the full derivation.
  const PREDICTOR_5_6_GROWTH_THRESHOLD  = 1.20;  // ratio late/early needs to exceed
  const PREDICTOR_5_6_GROWTH_CAP        = 1.80;  // upper bound on growth multiplier
  const PREDICTOR_5_6_DECLINE_THRESHOLD = 0.85;  // ratio below which damper fires
  const PREDICTOR_5_6_DECLINE_DAMPER    = 0.85;  // multiplier applied AFTER floor
  // Predictor 5.8 — Player-Stickiness-Damper (2026-06-08, post-Turin).
  // Maps deck → { broughtTotal, uniquePilots, repeatPilots } from
  // data/player_continuity.csv. A "repeat pilot" is a player who
  // brought the same archetype to ≥ 2 previous-format tournaments.
  // Stickiness = repeat / unique × 100.
  //
  // High brought + low stickiness = "the deck gets tried a lot but
  // pilots don't stay with it" — typical online-popular but in-person-
  // disposable archetype (Lopunny 1.23 %, OMH 0.93 %, Cynthia 0.81 %,
  // Dragapult Dudunsparce 0.87 % at TEF-POR). The Turin abgleich
  // showed these were the cluster of remaining over-calls after
  // Predictor 5.6 fixed Solo Dragapult.
  //
  // Damp baseline (pre-floor) by:
  //   stickiness < 1 %  AND brought ≥ 100  →  × 0.70  (strong damp)
  //   stickiness 1-3 % AND brought ≥ 100  →  × 0.85  (mild damp)
  //   otherwise → no damp (sample too small, or proven sticky)
  let _stickinessByDeck = {};               // norm(name) -> { brought, sticky_pct }
  const PREDICTOR_5_8_MIN_BROUGHT      = 100;
  const PREDICTOR_5_8_VERY_LOW_STICK   = 1.0;
  const PREDICTOR_5_8_LOW_STICK        = 3.0;
  const PREDICTOR_5_8_STRONG_DAMP      = 0.70;
  const PREDICTOR_5_8_MILD_DAMP        = 0.85;

  // Predictor 5.9 — Format-Migration-Boost (2026-06-08).
  // Compares the latest CRI-era online snapshot against the latest
  // pre-rotation POR-era snapshot to detect decks that emerged or
  // exploded after the rotation. Slowking (POR 1.66 % → CRI 5.29 %,
  // 3.18× growth, 52.2 % WR) and Crustle (POR low → CRI 1.63 % at
  // 56.2 % WR) are the canonical cases the Mode A baseline misses
  // because the predicted share is anchored to ladder averages,
  // not migration deltas.
  //
  // Classification:
  //   NEW    — POR share < 0.5 %, CRI share ≥ 1.0 %
  //   RISING — POR share ≥ 0.5 %, CRI/POR ratio > 1.2
  //   STABLE / DECLINING — no boost from this stage
  //
  // Boost is gated by win-rate so we don't lift "rising but losing"
  // decks (Mega Greninja: NEW, 6.9 % share, 44.75 % WR → wrFactor
  // collapses to 0, no boost). The boost is additive PP, applied
  // post-family-cap but BEFORE 5.8 damp — the 5.8 re-renorm then
  // restores the 100 % sum with the freed damp share absorbed
  // proportionally by the boosted decks.
  let _porSnapshotByDeck = {};              // norm(name) -> { share, wr }
  let _curSnapshotByDeck = {};              // norm(name) -> { share, wr }
  const PREDICTOR_5_9_NEW_POR_THRESHOLD = 0.5;
  const PREDICTOR_5_9_NEW_CUR_MIN       = 1.0;
  const PREDICTOR_5_9_RISING_RATIO_MIN  = 1.2;
  const PREDICTOR_5_9_NEW_BOOST_FACTOR  = 0.30;   // current_share × factor
  const PREDICTOR_5_9_NEW_BOOST_PP_MAX  = 2.0;
  const PREDICTOR_5_9_RISING_BOOST_FACT = 0.40;   // (current - prev) × factor
  const PREDICTOR_5_9_RISING_BOOST_PP_MAX = 1.5;
  // Tightened 2026-06-08 after the Beedrill over-pump (Beedrill WR
  // 50.45 % at NEW formula produced +0.8 pp boost → ended +0.59 over
  // real). Lifting the WR-neutral to 50 % keeps mediocre online-WR
  // decks out of the boost cluster while still rewarding 52-56 % WR.
  const PREDICTOR_5_9_WR_NEUTRAL        = 50;
  const PREDICTOR_5_9_WR_SLOPE          = 3;     // every +3 WR adds +1 to factor
  const PREDICTOR_5_9_WR_FACTOR_MAX     = 1.5;
  // Quality-Concentration pattern (Crustle case): the deck's online
  // share DECLINED POR → CUR (people stopped grinding it) but the WR
  // climbed materially (the pilots who STAYED win more). Signals
  // "this archetype consolidated into committed pilots" — real Turin
  // Crustle 1.67 % despite online ladder share dropping POR 2.06 % →
  // CUR 1.50 % (WR 51.06 → 55.02, +3.96 %). Fires when:
  //   POR share > 1.0  AND  CUR < POR  AND  CUR WR > 53  AND  ΔWR > 2
  // Flat +0.5 pp boost (no scaling — these are typically small decks
  // where a large boost would over-correct).
  const PREDICTOR_5_9_QC_MIN_POR_SHARE  = 1.0;
  const PREDICTOR_5_9_QC_MIN_WR         = 53;
  const PREDICTOR_5_9_QC_MIN_WR_DELTA   = 2.0;
  const PREDICTOR_5_9_QC_BOOST_PP       = 0.5;
                                            //   (allows for some natural decay between formats; a
                                            //    deck at 3.90 % last meta floors at 2.73 %, not 3.90 %)
  let _activeInPersonSetCode   = '';        // e.g. "POR" during the lag window when current_set="CRI" but
                                            // in-person events still play TEF-POR. Derived once per
                                            // loadData() from labs_tournament_decks.csv's newest meta column.
                                            // Used by Predictor 4.7 (Online-Tournament-Win Signal) to filter
                                            // winners CSV rows to the rotation that's actually producing
                                            // in-person results.
  // What set code should appear in the "Current Meta (XXX)" header
  // label on rendered Meta-Call PNGs / canvases? `_activeInPersonSetCode`
  // is data-derived and lags behind the official rotation by however
  // long it takes for the first new-format tournament to be scraped.
  // During that gap (e.g. 2026-06-05 — first TEF-CRI major has just
  // started, labs still only has TEF-POR rows) the bare
  // `_activeInPersonSetCode` would label everything "(POR)" even
  // though the format has officially rotated to CRI — confusing for
  // users who already see Past Meta = TEF-POR in the dropdown above.
  //
  // Fix: once today >= in_person_legal_date, the official rotation is
  // live; report current_set (CRI) regardless of labs lag. Before
  // that, fall back to _activeInPersonSetCode (POR — what labs has).
  function _displayInPersonSetCode() {
    const fw = _formatWindow || {};
    const today = new Date().toISOString().slice(0, 10);
    const legal = String(fw.in_person_legal_date || '').trim();
    const current = String(fw.current_set || '').trim().toUpperCase();
    if (legal && today >= legal && current) return current;
    return _activeInPersonSetCode || current || '';
  }
  // Newest scraped_at timestamp seen across the labs + online CSVs.
  // Surfaced in the Mode B banner so the user can sanity-check that
  // they aren't looking at months-old cached data — if it reads
  // "Daten von 2025-XX-XX" while the user knows the scraper ran today,
  // the browser cache is lying and they should clear it. User-flagged
  // 2026-06 after the Miraidon/Lugia-Archeops incident.
  let _dataLastScrapedAt       = '';        // ISO 'YYYY-MM-DD HH:MM:SS+00:00' or just date
  const PHASE_B_MIN_TOURNAMENTS = 2;        // require ≥2 majors to count as "established"
  const PHASE_B_MIN_SHARE_PCT   = 2.0;      // each at ≥2 % share
  // Tuned 2026-06 against Indy actuals via tools/calibrate_sweep_indy.py.
  // The anchor uses the MEDIAN of the deck's last 3 majors (robust to
  // single-tournament peaks like Dragapult Dudunsparce 8.94 % at
  // Campinas) blended 20 % into the online ladder. Earlier variants
  // tried weighted averages with recency bias; the median consistently
  // delivered the lowest MAE on the calibration harness (1.76 pp vs
  // 1.81 pp recency-weighted vs 1.83 pp naive-online baseline).
  //
  // Why blend so light (20 % major / 80 % online)? Majors are infrequent
  // (5-6 per format), and meta shifts happen between events. An anchor
  // dragging more than ~20 % toward the major average over-predicts
  // decks that faded between regionals. 20 % is enough to lift
  // genuinely under-online-priced decks (Raging Bolt 3.64 → ~4.2)
  // without inflating fading ones.
  const PHASE_B_LOOKBACK_MAJORS = 3;        // how many recent majors enter the median
  const PHASE_B_BLEND_MAJOR     = 0.20;     // 20 % major-nudge / 80 % online
  const PHASE_A_C_DAMP_FACTOR   = 0.40;     // multiply online_share by this when the deck never broke top-15
  const PHASE_A_C_TOP_N         = 15;       // "top-15" threshold for the damper gate

  // ── Predictor 6.0 — Tier-1 Convergence Detector ─────────────────────
  // Post-NAIC review (third-party Claude analysis 2026-06-12) flagged
  // Hausi v2 missed Dragapult by +7.0 pp (predicted 28.7 %, actual
  // 35.7 %): the median-anchored blend correctly resists single-
  // tournament noise but smooths over genuine field consolidation
  // onto a new Tier-1 leader. A pure last-major × conversion model
  // caught it at +3.1 pp.
  //
  // Fix: when (a) the deck IS Tier 1 (online ≥ 10 %), (b) the LAST
  // major shows consolidation (share ≥ median × 1.3), and (c) we have
  // enough pilots to trust the conversion signal (day-1 ≥ 300),
  // inject a conversion-weighted last-major projection into the
  // existing ladderPct via a 50/50 blend:
  //
  //   convMult       = 1 + 0.4 × (lastMajorConv / fieldD2ConvBaseline − 1)
  //   convProjection = lastMajorShare × convMult
  //   ladderPct      = 0.5 × ladderPct + 0.5 × convProjection
  //
  // The 0.4 conversion-damping factor mirrors the post-NAIC analysis,
  // which produced ~0.7 pp MAE on Dragapult after the ensemble layer.
  //
  // Safety gate (Regional-Spike-Detektor): when online share massively
  // DISAGREES with last major (online < lastMajorShare × 0.5), the
  // consolidation is regional, not global. Skip the boost — that's
  // the Honchkrow case in the analysis (Turin 4.18 % vs Online 2.37 %).
  // Threshold applies to FAMILY-level raw ladder share (sum across
  // variants). 5.0 % corresponds to roughly 15-30 % predicted share
  // in Mode B, since labs amplification ~3-5× the online signal for
  // established families. Reference points from the 2026-06 NAIC
  // snapshot: Dragapult 7.77 %, Ogerpon Meganium 6.29 %,
  // Lillie's Clefairy 3.77 %, Mega Starmie 2.29 %, Slowking 2.06 %.
  // The 10 % threshold in the post-NAIC analysis was on LIVE share,
  // not online ladder — different unit, so we don't copy it verbatim.
  const TIER1_CONVERGENCE_THRESHOLD = 5.0;
  // The detector originally checked share growth across multiple
  // recent majors (lastMajor ≥ median × 1.3). That breaks in a fresh
  // format like CRI where only ONE current-format major exists — the
  // median collapses to lastMajor and the gate never fires. The
  // CONVERSION-EXCESS gate replaces it: the deck's Day-1 → Day-2 conv
  // ratio must exceed the field mean by ≥ 15 %. This catches the
  // Dragapult consolidation case (Turin conv 25.47 % vs field 18.8 %
  // → ratio 1.354) AND blocks the Honchkrow regional-spike case
  // (Turin conv 17.65 % vs field 18.8 % → ratio 0.94) without needing
  // a separate regional-spike-guard — bad-conv decks never reach the
  // boost regardless of how spiky their last-major share looks.
  const TIER1_CONV_EXCESS_RATIO     = 1.15;
  const TIER1_MIN_DAY1_PILOTS       = 300;   // sample-size gate for trusting the conv signal
  const TIER1_CONV_DAMPING          = 0.4;   // same damping the post-NAIC analysis used
  const TIER1_BLEND_WEIGHT          = 0.5;   // 50/50 blend with existing predicted

  // Long-tail-preference redistribution. When the Tier-1 floor (or
  // the Live-Share floor below) lifts a meta-relevant deck, the
  // extra pp first comes out of the LONG TAIL — decks below 2 %
  // displayed share — rather than proportionally from the whole
  // field. Reason: a 4 % mid-tier deck like Alakazam would otherwise
  // give up the same RELATIVE share as a 0.3 % niche deck (8-10×
  // more in absolute pp). The user's intuition was right that the
  // budget should come from non-meta-relevant decks, not from the
  // mid-tier the predictor is trying to forecast accurately.
  //
  // Live-data check (NAIC 2026-06-12): long tail (< 2 %) is ~28.9 %
  // of the field across ~48 decks; a Dragapult-sized 3.8 pp lift
  // takes ~13 % relative off each tail deck — barely visible — and
  // leaves the 2-5 % mid-tier completely untouched.
  //
  // RESERVE keeps a fraction of long-tail share so we never crush
  // the tail completely. If the long-tail can't absorb the full
  // lift, fall back to proportional from everyone.
  const LONG_TAIL_THRESHOLD_PCT = 2.0;
  const LONG_TAIL_RESERVE_FRAC  = 0.30;

  // ── Predictor 6.1 — Live-Share Floor ────────────────────────────────
  // Catches the Mega-Starmie pattern from the post-NAIC analysis:
  // Turin showed 2.76 % brought share but our predictor lands at
  // 0.9 %. The labs signal is there in _lastMajorByDeck[k].share —
  // we just don't trust it enough as a floor. The 5.2 quality-floor
  // exists for high-conv underdogs but caps at 2 % AND uses raw-pow
  // units, so it rarely reaches a visible floor for decks that
  // actually had brought-share at the last major.
  //
  // Gate set:
  //   (a) lastMajor brought share ≥ MIN_LM_SHARE_PCT
  //   (b) lastMajor day-1 pilots ≥ MIN_LM_PILOTS (sample-size)
  //   (c) current predicted < lastMajor brought × DIVERGENCE_RATIO
  //       (only floor when our prediction is significantly off)
  //
  // Floor: lastMajorBroughtShare × SHRINKAGE — 30 % shrink to avoid
  // recency-overfit a deck that briefly spiked at one event.
  const LIVE_SHARE_FLOOR_MIN_LM_SHARE   = 2.5;
  const LIVE_SHARE_FLOOR_MIN_LM_PILOTS  = 30;
  const LIVE_SHARE_FLOOR_DIVERGENCE     = 0.5;   // current < lm × this triggers
  const LIVE_SHARE_FLOOR_SHRINKAGE      = 0.70;  // floor = lm × this

  // ── Predictor 4.1 — Format-Window ───────────────────────────────
  // Loaded from data/format_window.json (auto-generated by
  // backend/core/update_sets.py). Drives two behaviours:
  //   (a) Labs/major-tournament filter: only rows with date ≥
  //       in_person_legal_date are mixed into _labsRowsByDeck etc.
  //       Older rows are pre-format-rotation noise and get dropped.
  //   (b) Linear recency weight inside the format: a tournament right
  //       at the in-person-legal date weighs 0.5×, today's weighs 1.0×.
  //       Late-format majors carry more signal because the meta has
  //       refined; first-week majors carry half because deck choices
  //       are still being figured out.
  // Missing / malformed file → predictor falls back to no filter / no
  // weighting (= legacy 4.0 behaviour, never breaks).
  let _formatWindow = null;      // { current_set, set_release_date, in_person_legal_date, lag_days }
  // Zustand des Lag-Fensters, damit die Oberflaeche ihn benennen kann,
  // statt ihn zu behaupten. Siehe die lange Notiz bei der Erkennung.
  let _lagFensterAlterTage = null;   // Alter der neuesten Labs-Zeile in Tagen
  let _lagFensterAbgelaufen = false; // aelter als lag_days + Karenz
  let _lagNeuesteLabsZeile = '';     // deren Datum
  let _activeMetaKeyVoll = '';       // voller Format-Schluessel, z. B. 'TEF-CRI'

  // ── Predictor 4.0a — Meta Dynamics (counter-meta surge detection) ──
  // After a major, decks that overperformed surge on the online ladder
  // (Bandwagon). Counters against them rise next as the meta reacts.
  // 4.0a doesn't shift the surge deck itself (weekly_trend already
  // does that) — it boosts the COUNTERS to surge decks, with magnitude
  // weighted by surge size, days-since-major decay, and matchup WR.
  // Numbers populated lazily during _runPredictor; surface only via
  // background prediction adjustment + a dev-console log (no UI noise).
  const PREDICTOR_4_SURGE_PP        = 1.0;   // pp gain to qualify as a surge
  const PREDICTOR_4_COUNTER_WR_MIN  = 0.55;  // min WR vs surge to count as counter
  const PREDICTOR_4_COUNTER_AMP     = 2.0;   // multiplier on (WR - threshold)
  const PREDICTOR_4_DECAY_DAYS      = 21;    // hype fully fades after 21 days
  const PREDICTOR_4_BOOST_CAP_PP    = 0.5;   // hard cap (pre-concentration); ^1.5 amplifies it
  let _metaDynamicsByDeck = {}; // normalize(deck) -> { boost: pp, reasons: [...] }
  let _metaDynamicsLastLogId = null; // tournament id we last printed the dev log for

  // ── Predictor 4.5 — Concentration-Aware Counter Boost ──────
  // 4.0a above only triggers when a deck "surges since last major" — chronic
  // dominance (a deck that's been top-1 for weeks without growing) sails
  // right past it because the share delta is zero. Utrecht regional 16.5.26
  // exposed this: Dragapult family held ~30 % of the online field, every
  // known anti-Dragapult deck under-predicted by 2-3 pp (Raging Bolt,
  // Garchomp, Mega Lucario / Hariyama, Mega Starmie). The players knew
  // they'd face Dragapult and brought counters; the predictor didn't.
  //
  // 4.5 adds a SECOND counter-boost channel that fires on family-level
  // concentration regardless of growth. When a family holds ≥ 15 % of the
  // field, every deck with ≥ 55 % WR against any of its variants gets a
  // boost scaled by (a) how far above the floor the family sits and (b)
  // how strong the counter's matchup edge is. Stacks additively with
  // 4.0a so a deck that's BOTH a known counter AND saw a fresh surge
  // ride still gets full credit for both.
  const PREDICTOR_45_FAMILY_FLOOR_PCT  = 15;    // family must hold ≥ this share to trigger
  const PREDICTOR_45_FAMILY_EXCESS_DIV = 10;    // family-excess factor = (familyPct - floor) / this
  const PREDICTOR_45_WR_FACTOR_SCALE   = 10;    // wr-edge factor = (wr - threshold) * this
  const PREDICTOR_45_BASE_CONTRIB_PP   = 0.7;   // pp contribution per "unit" (factors multiplied)
  const PREDICTOR_45_COUNTER_WR_MIN    = 0.50;  // min WR vs family member to count
                                                // Lowered from 0.55: Limitless online matchup data
                                                // shows Lucario Hariyama / Raging Bolt / Cynthia's
                                                // Garchomp vs Dragapult sitting in the 38-57 % band
                                                // — players still bring them offline because the
                                                // tiny edge × dominant-family-prevalence × better
                                                // tournament-floor preparation is worth it. 50 %
                                                // accepts the slight-edge counters; the magnitude
                                                // still scales with the WR-edge so 50.1 % WR gives
                                                // a near-zero boost while 60 %+ scales up cleanly.
  const PREDICTOR_45_BOOST_CAP_PP      = 3.5;   // hard cap per deck (raised from 2.0 — Utrecht
                                                // showed counter-decks under-predicted by 2-3 pp
                                                // each; 2.0 pp cap couldn't close the gap)
  let _concentrationLastLogId = null;

  // ── Predictor 4.6 — Counter-Field Suppression ──────────────
  // 4.5 boosts counter decks but doesn't TOUCH the concentrated
  // family itself. Result: at 30 % Dragapult-family, the family
  // stays at 30 % even as counters get boosted, so the field
  // composition over-predicts the dominant family. When the
  // tournament-floor reality is that players hedge AGAINST the
  // dominant deck, the dominant deck's actual share is lower
  // than the online ladder suggests. 4.6 reduces the family's
  // predicted share proportional to its excess concentration —
  // shifting share INTO the counters via renormalisation.
  //
  // 2026-05-16 tune: original PER_PP=0.10 + CAP=3.0 only moved
  // Dragapult-family from 31.3 % predicted → ~30 % predicted vs
  // ~25 % expected actual at Utrecht (two consecutive 30 %-Dragapult
  // regionals trigger player counter-adaption that the online
  // ladder doesn't yet reflect). Bumped to PER_PP=0.30 + CAP=6.0
  // so at 31.3 % family, suppression = min(6.0, 11.3 × 0.30) =
  // 3.39 pp → predicted family ~28 %, then renormalisation pulls
  // it closer to ~26 % as counters absorb the freed share.
  const PREDICTOR_46_FAMILY_FLOOR_PCT  = 20;    // family must hold ≥ this share to start suppression
  const PREDICTOR_46_SUPPRESS_PER_PP   = 0.30;  // suppress 0.30 pp of family share per pp of excess
  const PREDICTOR_46_SUPPRESS_CAP_PP   = 6.0;   // hard cap on total family suppression
  let _fieldSuppressionLastLogId = null;

  // ── Predictor 4.7 — Counter-Adoption Boost ─────────────────
  // 4.5 only fires when online matchup WR ≥ 50 % vs the dominant
  // family. But the labs ground-truth shows decks like Alakazam
  // Dudunsparce (5.10 % at LA, 6.07 % at Prague) and Festival
  // Lead (5.97 % at LA) get brought heavily despite their online
  // matchup vs every Dragapult variant sitting at 37-49 %. The
  // signal is BEHAVIOURAL ADAPTION — players bring these decks
  // because (a) their offline pilot pool or tech choices outperform
  // the online sample, or (b) the deck is strong vs the rest of
  // the field even if it loses to Dragapult head-to-head.
  //
  // The adaption signal: `brought_share > ladder_share` means the
  // deck was brought MORE than the online ladder predicted —
  // a direct measure of "players are picking this OVER what online
  // play suggests." Only fires when there IS a dominant family to
  // counter (otherwise it's not an adaption signal, just noise).
  const PREDICTOR_47_DOMINANT_FAMILY_PCT = 25;   // dominant family must hold ≥ this for adaption signal to fire
  const PREDICTOR_47_DELTA_MIN_PP        = 0.5;  // brought - ladder must exceed this to be a signal
  const PREDICTOR_47_BOOST_PER_PP        = 0.50; // 50 % of (brought - ladder) gets added as a pp boost
  const PREDICTOR_47_BOOST_CAP_PP        = 1.5;  // hard cap per deck
  let _adoptionBoostLastLogId = null;

  // ── Predictor 5.5 — Online-Presence Floor ──────────────────
  // Guarantee a minimum predicted share for decks with verified
  // multi-source presence. Lucario Hariyama was getting crushed
  // to < 1.5 % predicted despite 5.52 % online share (rank 3) +
  // 3.5 % at LA + 6 % at Prague (real-world brought rate),
  // because its low top8 conv (2.59 %) hit every damper in the
  // chain.
  //
  // Two-source floor — whichever is higher:
  //   • Online floor:  60 % × online_share   (ladder signal)
  //   • Labs   floor:  85 % × weighted_avg_labs_share_pct
  //                    (real-world tournament brought-rate)
  //
  // Labs share is recency-weighted, so a recent strong major
  // dominates over an old early-format one. For Lucario:
  //   • LA (2026-05-08, w=0.905)  share_pct = 3.25
  //   • Prague (2026-04-25, w=0.75) share_pct = 5.56
  //   • weighted_avg = (3.25 × 0.905 + 5.56 × 0.75) / 1.655 ≈ 4.46
  //   • labs floor    = 4.46 × 0.85 ≈ 3.79 %
  //   • online floor  = 5.52 × 0.60 ≈ 3.31 %
  //   • final floor   = max(3.79, 3.31) = 3.79 %
  const PREDICTOR_55_PRESENCE_FLOOR_MIN  = 3.0;  // online share must be ≥ this to qualify
  const PREDICTOR_55_PRESENCE_FLOOR_PCT  = 0.60; // online-based floor multiplier
  const PREDICTOR_55_LABS_FLOOR_PCT      = 0.85; // labs-based floor multiplier
  const PREDICTOR_55_LABS_FLOOR_MIN_N    = 0.5;  // need ≥ this weighted labs count
  const PREDICTOR_55_LABS_FLOOR_MIN_PCT  = 1.5;  // labs share_pct must be ≥ this to anchor
  const PREDICTOR_55_REQUIRE_LABS_N      = 1;    // need ≥ N labs samples to apply (filters
                                                  // pure-online noise decks)

  // ── Predictor 4.2 — Ladder-Bias-Damper ─────────────────────
  // Casual decks (Alakazam, Starmie, Grimmsnarl …) over-index on the
  // online ladder relative to in-person majors. Pre-Prague backtest
  // had them over-predicted by 1.7-3.1 pp each. Damp the LADDER term
  // by each deck's own Top-8 conversion factor so a casual deck's
  // ladder weight collapses while a competitive deck's stays intact.
  // The factor uses the same field-mean baseline as Predictor 3.0's
  // labsT8Boost; bounds tighter (0.75..1.25) because we only want
  // to nudge the ladder term, not steamroll it.
  const PREDICTOR_4_2_LADDER_DAMP_LO = 0.75;
  const PREDICTOR_4_2_LADDER_DAMP_HI = 1.25;

  // ── Predictor 4.4 — Variant-Family-Aware Labs Anchor ───────
  // The labs term anchors on a single tournament's share per variant.
  // When that one major over-emphasised one variant (Querétaro had
  // Dragapult Dusknoir at 17 % while the rest of the family was
  // small), the predictor over-anchored on that exact variant for
  // weeks. 4.4 fixes that by aggregating labs share at the FAMILY
  // level (Dragapult-family = sum of all Dragapult variants) and
  // redistributing it back to variants by their CURRENT online share-
  // of-family. Result: the model knows "Dragapult-family is 30 %
  // of the field" and lets today's online ladder decide which sub-
  // variant carries that share.
  let _familyLabsTotal   = {}; // family -> aggregated labs share (raw, pre-norm)
  let _familyOnlineTotal = {}; // family -> aggregated online ladder count

  // Tournament-type presets. Selecting a tab swaps in the appropriate
  // round / target-points defaults; user-override persists per tab so
  // hopping between Regional ↔ Local Cup ↔ Local Challenge doesn't
  // wipe customisation. The predictor itself reads `rounds` +
  // `day2Points` exactly as before — `day2Points` is repurposed as
  // the generic "target points to clear" for the active type.
  const TOURNAMENT_TYPES = ['regional', 'challenge', 'cup'];
  const TOURNAMENT_SETTINGS_KEY = 'metacall_tournament_settings_v1';

  let _settings = {
    tournamentType: 'regional',
    totalPlayers  : 2000,
    rounds        : 8,
    day2Points    : 16,         // repurposed: "target points to clear"
    topCutSize    : 8,          // only used when tournamentType === 'cup'
    junkPct       : 0,          // legacy: minimum-junk floor (UI removed; auto-computed now)
    // Nur noch der Rueckfall. Der wirkliche Wert wird in
    // _junkWinRatePct() aus den Anteilen und Win Rates des Restfeldes
    // gerechnet — siehe die Notiz dort.
    junkWinRate   : 55,         // Rueckfall, wenn nichts messbar ist
    myDeck        : '',
    excludeBricks : false,
  };

  // Per-type overrides — when the user changes Players / Rounds / target
  // on one tab we keep those numbers around so switching back doesn't
  // re-suggest the auto-defaults over their carefully-tuned values.
  let _settingsByType = {
    regional:  { totalPlayers: 2000, rounds: 8, day2Points: 16 },
    challenge: { totalPlayers: 24,   rounds: 5, day2Points: 13, topCutSize: 0 },
    cup:       { totalPlayers: 32,   rounds: 5, day2Points: 12, topCutSize: 8 },
  };

  // Reload persisted tournament settings if any.
  try {
    const raw = localStorage.getItem(TOURNAMENT_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if (parsed.byType && typeof parsed.byType === 'object') {
          _settingsByType = { ..._settingsByType, ...parsed.byType };
        }
        if (TOURNAMENT_TYPES.includes(parsed.activeType)) {
          _settings.tournamentType = parsed.activeType;
        }
        const active = _settingsByType[_settings.tournamentType] || {};
        Object.assign(_settings, active);
      }
    }
  } catch (_e) { /* localStorage disabled — fall back to defaults */ }

  // Whether the user has explicitly typed into the Players input.
  // Calculations always use _settings.totalPlayers (default 2000), but
  // the input itself shows blank until touched so the user is invited
  // to type their own field size instead of accepting an arbitrary
  // pre-filled number.
  let _playersInputTouched = false;
  let _personalShares   = {};  // deckName -> % estimate (manual "MY ESTIMATE" column)
  let _tgFieldShares    = {};  // deckName (canonical) -> TG-reported share % — folds INTO the predictor's ONLINE % column, NOT into _personalShares
  let _winRateOverrides = {};  // deckName -> 0-100 (manual user overrides only)
  let _journalRateKeys  = [];  // opponents with 3+ journal games (for badge display)
  let _journalStats     = {};  // opponent -> {wins, losses, ties, total, winRate}

  const TOP_N = 25;              // show top N decks; everything else rolls into Junk
  const MAX_CUSTOM = 10;         // max custom decks the user can add
  const SCENARIOS_STORAGE_KEY = 'metacall_scenarios_v1';
  const PREDICTOR_LOG_KEY      = 'metacall_predictor_log_v1';
  const LAST_KNOWN_MAJOR_KEY   = 'metacall_last_known_major_v1';
  const PREDICTOR_LOG_MAX      = 100;
  // Backtest log — every time _checkAccuracyAgainstNewMajor finds a
  // new major, the per-deck predicted-vs-actual report is appended
  // here. Aggregated across runs, this surfaces systematic biases
  // (e.g. "Dragapult is consistently underestimated by X pp across
  // the last 6 majors") that single-major reports can't catch.
  // Capped at last 12 majors (~1 year of data on a Regional cadence).
  const ACCURACY_LOG_KEY       = 'metacall_accuracy_log_v1';
  const ACCURACY_LOG_MAX       = 12;
  // Persisted toggle state — see _toggleGroupField. Survives page reload
  // so the user doesn't have to flip "Familie zusammenfassen" every time
  // they open Meta Call.
  const GROUP_BY_MAIN_STORAGE_KEY = 'metacall_group_by_main_v1';

  // Group field table by main Pokémon family (Dragapult + Dragapult
  // Blaziken + Dragapult Dusknoir → one "Dragapult" row that sums their
  // shares). Default off; persisted across sessions.
  let _groupByMain = false;
  try {
    _groupByMain = localStorage.getItem(GROUP_BY_MAIN_STORAGE_KEY) === '1';
  } catch (_) { /* private mode — fall back to default */ }
  let _customDecks      = [];    // [{name, share}] — user-added decks expected at the tourney
  let _currentScenarioName = ''; // name of the currently loaded saved scenario
  // Detail-row state model — keyed by normalized deck name so it
  // survives re-renders triggered by editing a personal-estimate.
  //
  //   _detailGlobalMode  : 'expanded' (default) | 'collapsed'
  //   _detailOverrides   : Set of deck keys that DEVIATE from the
  //                        global mode (so a single "Expand/Collapse
  //                        all" click can wipe per-row state cleanly
  //                        without losing track of intentional flips)
  //
  // Effective expansion for deck k:
  //     def = (_detailGlobalMode === 'expanded')
  //     expanded = _detailOverrides.has(k) ? !def : def
  let _detailGlobalMode = 'expanded';
  const _detailOverrides = new Set();
  // Brand shown in share-image footer.
  const BRAND_FOOTER = 'thedipidis.app';

  // ── CSV Helper ─────────────────────────────────────────────
  // Naive CSV parser for app-meta-call's own consumers. The big PapaParse
  // pipeline lives in app-core (fetchAndParseCSV) and handles every CSV
  // the rest of the app downloads \u2014 this module reads its own files
  // (labs_tournament_*.csv, limitless_online_*.csv, etc.) which are all
  // well-formed: ASCII headers, no quoted commas, no embedded newlines.
  // For the one source that needs RFC-4180 quoting (the labs matchups
  // file), use parseCSVQuoted() below.
  //
  // If you ever extend this to parse a CSV produced by an external tool
  // with quoted fields, switch the call site to parseCSVQuoted or
  // delegate to the shared PapaParse helper rather than touching this.
  function parseCSV(text, sep) {
    const lines   = text.replace(/\r/g, '').split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(sep).map(h => h.trim().replace(/^\uFEFF/, ''));
    return lines.slice(1).filter(l => l.trim()).map(l => {
      const vals = l.split(sep);
      const obj  = {};
      headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });
      return obj;
    });
  }

  // Quote-aware CSV parser. The labs CSV is comma-delimited and contains
  // fields with embedded commas wrapped in double quotes (e.g. the
  // pokemon column: "dragapult, dusknoir"). The naive `parseCSV` above
  // mis-splits those rows, so we use this for any source that needs
  // RFC-4180-style quoting.
  function parseCSVQuoted(text, sep) {
    const splitLine = (line) => {
      const out = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
          else inQuotes = !inQuotes;
        } else if (c === sep && !inQuotes) {
          out.push(cur);
          cur = '';
        } else {
          cur += c;
        }
      }
      out.push(cur);
      return out;
    };
    const lines = text.replace(/\r/g, '').split('\n');
    if (lines.length < 2) return [];
    const headers = splitLine(lines[0]).map(h => h.trim().replace(/^\uFEFF/, ''));
    return lines.slice(1).filter(l => l.trim()).map(l => {
      const vals = splitLine(l);
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });
      return obj;
    });
  }

  function normalize(name) {
    // Strip whitespace, hyphens, and ALL common apostrophe variants so
    // deck names match regardless of which typography the source used.
    // Covers: straight (U+0027), left/right curly (U+2018/U+2019), reverse
    // high-9 (U+201B), grave accent (U+0060), acute accent (U+00B4), and
    // the less-common modifier letter apostrophe (U+02BC).
    return (name || '').toLowerCase().replace(/[\s\-\u0027\u2018\u2019\u201B\u0060\u00B4\u02BC]/g, '');
  }

  // Look up a value in an object by key, falling back to a normalize-equal
  // comparison when the exact key isn't present. Used for WR overrides and
  // journal stats so that "N's Zoroark" (U+0027) in the stored key matches
  // "N's Zoroark" (U+2019) in the lookup name.
  function _findByNormalized(obj, name) {
    if (!obj) return undefined;
    if (Object.prototype.hasOwnProperty.call(obj, name)) return obj[name];
    const norm = normalize(name);
    for (const k of Object.keys(obj)) {
      if (normalize(k) === norm) return obj[k];
    }
    return undefined;
  }

  // (2026-06-10 audit) Thin alias around window.parseLocaleNumber —
  // see app-utils.js. The old single-arg signature is preserved.
  function parseEU(str) {
    return window.parseLocaleNumber(str, 0);
  }

  // Load a city_league_archetypes_comparison*.csv and return
  // { normalize(deck) -> share% } using the `new_meta_share` column.
  // Missing file = empty object (feature is opt-in, absence is fine).
  // ── Past Meta source helpers ──────────────────────────────
  //
  // Loads tournament_cards_manifest.json + tournament_cards_data_overview.csv
  // and builds the list of selectable past-meta formats. Run once at
  // loadData(); cached on `_pastMetaAvailableFormats`. The currently-
  // active format (suffix-match against format_window.current_set) is
  // EXCLUDED — that one is the "current meta" which the default source
  // already covers.
  let _pastMetaCatalogLoading = null;
  async function _loadPastMetaCatalog() {
    // Re-entry guard: if a second caller arrives while the first fetch
    // is in flight, return the same promise so both end up sharing the
    // single populated list — without it, parallel callers could each
    // reset the array and push their 14 keys, leaving the dropdown
    // showing every option twice.
    if (_pastMetaCatalogLoading) return _pastMetaCatalogLoading;
    _pastMetaCatalogLoading = (async () => {
      const next = [];
      let manifest = null;
      try {
        const resp = await fetch('data/tournament_cards_manifest.json?t=' + Date.now());
        if (!resp.ok) { _pastMetaAvailableFormats = next; return; }
        manifest = await resp.json();
      } catch (_e) { _pastMetaAvailableFormats = next; return; }
      if (!manifest || !Array.isArray(manifest.meta_keys) || manifest.meta_keys.length === 0) {
        _pastMetaAvailableFormats = next;
        return;
      }

      // current_set suffix is hidden — those chunks belong to the active meta
      let currentSet = '';
      try {
        if (_formatWindow && _formatWindow.current_set) {
          currentSet = String(_formatWindow.current_set).trim().toUpperCase();
        }
      } catch (_e) { /* tolerate */ }

      const dates = manifest.chunk_dates || {};
      const seenKeys = new Set();
      for (const key of manifest.meta_keys) {
        const upper = String(key || '').trim().toUpperCase();
        if (!upper) continue;
        // Suffix-match: 'TEF-CRI' or just 'CRI' is the current set's chunk → skip
        if (currentSet) {
          if (upper === currentSet || upper.endsWith('-' + currentSet)) continue;
        }
        // Defence in depth: never push the same key twice even if the
        // upstream manifest contains duplicates.
        if (seenKeys.has(upper)) continue;
        seenKeys.add(upper);
        const chunkFile = `tournament_cards_data_cards_${key}.csv`;
        const dateInfo = dates[chunkFile] || {};
        next.push({
          key,
          label: key,  // Expanded label resolved at render time via expandPastMetaCode
          maxDate: dateInfo.max_date || '',
          minDate: dateInfo.min_date || '',
        });
      }
      next.sort((a, b) => (b.maxDate || '').localeCompare(a.maxDate || ''));
      _pastMetaAvailableFormats = next;
    })().finally(() => { _pastMetaCatalogLoading = null; });
    return _pastMetaCatalogLoading;
  }

  // Aggregate brought-shares for a single past-meta format. Returns
  //   { shares: [{name, count, share}], totalDecks, tournamentCount, dateRange }
  // or null on load failure / empty data.
  //
  // Aggregation contract (locked by tests/python/test_past_meta_aggregation.py):
  //   For each (tournament_id, archetype) pair: count total_decks_in_archetype
  //   once (chunk has multiple rows per deck — one per card). Sum across the
  //   format's tournaments to get per-archetype total. Divide by sum of totals
  //   for the share %.
  // Past-meta field composition. Primary source is the labs CSV
  // (player-share — every Day-1 player attributed to an archetype, the
  // metric Limitless itself uses on its past-meta pages and the one
  // users expect when they read "Share %"). The earlier implementation
  // read tournament_cards_data_cards (decklist-share, biased toward
  // top-cut publishers — Crustle showed up at 6.67 % decklist-share
  // while only 1.96 % of the actual player field), so the predictor
  // was systematically over-weighting decks that submit lists.
  //
  // Fallback: a handful of legacy formats (BRS-TEF, BRS-TWM, BST-PAR)
  // have no labs chunk; for those we still read the cards CSV but log
  // a warning so the discrepancy is visible.
  async function _loadPastMetaShares(formatKey) {
    if (!formatKey) return null;
    if (_pastMetaCachedShares.has(formatKey)) return _pastMetaCachedShares.get(formatKey);

    const labsAgg = await _loadPastMetaLabsAggregate(formatKey);
    if (labsAgg && Array.isArray(labsAgg.archetypes) && labsAgg.archetypes.length > 0 && labsAgg.totalPlayers > 0) {
      const shares = labsAgg.archetypes
        .map(a => ({
          name           : a.name,
          count          : a.players,
          share          : 100 * a.players / labsAgg.totalPlayers,
          tournamentsSeen: a.tournaments,
        }))
        .sort((a, b) => b.share - a.share);
      const result = {
        shares,
        totalDecks     : labsAgg.totalPlayers,
        tournamentCount: labsAgg.tournamentCount,
        formatKey,
        source         : 'labs',
      };
      _pastMetaCachedShares.set(formatKey, result);
      return result;
    }

    // Fallback: no labs aggregate — read decklist-share from cards CSV.
    console.warn(`[MetaCall] No labs aggregate for ${formatKey}; falling back to decklist-share from tournament_cards_data_cards (biased toward top-cut submissions).`);
    return _loadPastMetaSharesFromCards(formatKey);
  }

  async function _loadPastMetaSharesFromCards(formatKey) {
    let csvText = null;
    try {
      const resp = await fetch(`data/tournament_cards_data_cards_${formatKey}.csv?t=` + Date.now());
      if (!resp.ok) return null;
      csvText = await resp.text();
    } catch (_e) { return null; }
    if (!csvText) return null;

    const rows = parseCSV(csvText, ';');
    if (rows.length === 0) return null;

    // Strip the price-tag suffix the Limitless scraper used to concatenate
    // onto .decklist-title (e.g. "Crustle16.57$9.53€"). Fixed in the
    // Python scraper (commit ac6d36c) but the 13 pre-fix CSVs remain
    // contaminated; keep the strip as defence in depth.
    const stripPriceTag = (s) => String(s || '')
      .replace(/\d+(?:[.,]\d+)?\$\d+(?:[.,]\d+)?€.*$/u, '')
      .trim();

    const archTotal = new Map();
    const archTournaments = new Map();
    const allTournaments = new Set();
    const seen = new Set();
    for (const r of rows) {
      const tid = (r.tournament_id || '').trim();
      const arch = stripPriceTag(r.archetype || '');
      if (!tid || !arch) continue;
      allTournaments.add(tid);
      const key = `${tid}|||${arch}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const cnt = parseInt(r.total_decks_in_archetype || '0', 10);
      if (!Number.isFinite(cnt) || cnt <= 0) continue;
      archTotal.set(arch, (archTotal.get(arch) || 0) + cnt);
      if (!archTournaments.has(arch)) archTournaments.set(arch, new Set());
      archTournaments.get(arch).add(tid);
    }

    let totalDecks = 0;
    for (const v of archTotal.values()) totalDecks += v;
    if (totalDecks <= 0) return null;

    const shares = [];
    for (const [name, count] of archTotal) {
      shares.push({
        name,
        count,
        share: 100 * count / totalDecks,
        tournamentsSeen: archTournaments.get(name).size,
      });
    }
    shares.sort((a, b) => b.share - a.share);

    const result = {
      shares,
      totalDecks,
      tournamentCount: allTournaments.size,
      formatKey,
      source: 'cards-fallback',
    };
    _pastMetaCachedShares.set(formatKey, result);
    return result;
  }

  // True when a past-meta chunk is "closed" — no in-person events left
  // that can play it, so its share table + WR/Day-2 numbers are final
  // and the live predictor (trend, meta-dynamics, counter-meta boosts)
  // adds no value. Rule:
  //   - in_person_legal_date of current_set has passed → ALL past metas
  //     are closed (current_set is now the in-person format).
  //   - in_person_legal_date is still in the future → the newest past
  //     meta is still hosting in-person events and stays "active";
  //     everything older than it is closed.
  // Defensive default when format_window or the catalog is missing:
  // treat as closed so we never serve a stale predictor on a meta whose
  // freshness we can't confirm.
  function _isPastMetaFrozen(metaKey) {
    if (!metaKey) return false;
    // "Frozen" = the format is no longer played in-person anywhere.
    // That's strictly the OLDER past metas. TEF-POR during the CRI
    // lag window is still in-person-legal (regionals run TEF-POR
    // until 2026-06-05), so it must NOT show the "Closed meta —
    // Fun-Event mode" banner. The retrospective-view aspect (labs
    // aggregate, no predictor reshape) is enforced separately —
    // see the predictor-skip-for-past-meta logic in _setMetaSource.
    if (!_formatWindow || !_formatWindow.in_person_legal_date) return true;
    const today = new Date().toISOString().slice(0, 10);
    if (today >= _formatWindow.in_person_legal_date) return true;
    if (!Array.isArray(_pastMetaAvailableFormats) || _pastMetaAvailableFormats.length === 0) return true;
    const latest = _pastMetaAvailableFormats[0]; // sorted newest-first by maxDate
    return metaKey !== latest.key;
  }

  // Aggregate labs_tournament_decks_<META>.csv into per-archetype totals
  // for the Final-Cumulative ranking shown in frozen-meta mode. Returns
  //   { archetypes: [{ name, winPct, day2Conv, players, games, score, tournaments }],
  //     tournamentCount }
  // or null if the labs chunk is missing/empty. Cached on the module so
  // toggling between past metas doesn't refetch.
  //
  // Score formula: winPct × (1 + day2Conv).
  //   - winPct in [0, 100]  → headline measure of in-game success
  //   - day2Conv in [0, 1]  → bonus weight for decks that didn't just
  //     play well in Swiss but actually punched into Day 2 (the user-
  //     flagged proxy for "this deck rewarded tournament prep, not just
  //     ladder mash-up").
  // 200 is the hard ceiling (100 % WR × 2× day2 multiplier); typical
  // top entries land around 60-90.
  async function _loadPastMetaLabsAggregate(metaKey) {
    if (!metaKey) return null;
    if (_pastMetaLabsCache.has(metaKey)) return _pastMetaLabsCache.get(metaKey);

    let csvText = null;
    try {
      const resp = await fetch(`data/labs_tournament_decks_${metaKey}.csv?t=` + Date.now());
      if (!resp.ok) { _pastMetaLabsCache.set(metaKey, null); return null; }
      csvText = await resp.text();
    } catch (_e) { _pastMetaLabsCache.set(metaKey, null); return null; }
    if (!csvText) { _pastMetaLabsCache.set(metaKey, null); return null; }

    // labs CSV is comma-delimited with a quoted `pokemon` column → use
    // the RFC-4180-aware parser, not the naive split-on-sep one.
    const rows = parseCSVQuoted(csvText, ',');
    if (rows.length === 0) { _pastMetaLabsCache.set(metaKey, null); return null; }

    const byDeck = new Map();  // name -> aggregate
    const allTournaments = new Set();
    // Per-tournament total_players — used to compute the grand-total
    // denominator for player-share without double-counting (every row
    // of a tournament repeats the same total_players value).
    const tournamentTotalPlayers = new Map();
    for (const r of rows) {
      const tid = (r.tournament_id || '').trim();
      const name = (r.deck_name || '').trim();
      if (!tid || !name) continue;
      allTournaments.add(tid);
      if (!tournamentTotalPlayers.has(tid)) {
        const tp = parseInt(r.total_players || '0', 10) || 0;
        if (tp > 0) tournamentTotalPlayers.set(tid, tp);
      }

      const players = parseInt(r.player_count || '0', 10) || 0;
      const wins    = parseFloat(r.wins   || '0') || 0;
      const losses  = parseFloat(r.losses || '0') || 0;
      const ties    = parseFloat(r.ties   || '0') || 0;
      const day1    = parseInt(r.day1_players || '0', 10) || 0;
      const day2    = parseInt(r.day2_players || '0', 10) || 0;

      if (!byDeck.has(name)) {
        byDeck.set(name, {
          players: 0, wins: 0, losses: 0, ties: 0,
          day1: 0, day2: 0, tournaments: new Set(),
        });
      }
      const e = byDeck.get(name);
      e.players += players;
      e.wins    += wins;
      e.losses  += losses;
      e.ties    += ties;
      e.day1    += day1;
      e.day2    += day2;
      e.tournaments.add(tid);
    }

    const archetypes = [];
    for (const [name, agg] of byDeck) {
      const games = agg.wins + agg.losses + agg.ties;
      // Ties count as half a win so the metric matches how players
      // describe winrate ("I went 6-2-1 → 6.5/9 = 72 %") and stays
      // consistent with labs's own win_pct definition.
      const winPct = games > 0 ? (agg.wins + 0.5 * agg.ties) / games * 100 : 0;
      const day2Conv = agg.day1 > 0 ? agg.day2 / agg.day1 : 0;
      archetypes.push({
        name,
        players: agg.players,
        winPct,
        day2Conv,
        day1: agg.day1,
        day2: agg.day2,
        games,
        score: winPct * (1 + day2Conv),
        tournaments: agg.tournaments.size,
      });
    }
    archetypes.sort((a, b) => b.score - a.score);

    let totalPlayers = 0;
    for (const v of tournamentTotalPlayers.values()) totalPlayers += v;

    const result = {
      metaKey,
      archetypes,
      tournamentCount: allTournaments.size,
      totalPlayers,
    };
    _pastMetaLabsCache.set(metaKey, result);
    return result;
  }

  // Map past-meta share aggregate onto the _shareList shape Meta Call's
  // predictor + renderer expect. trend/onlineWinPct default to 0 (no
  // week-over-week history or per-deck cumulative WR for past formats).
  function _pastMetaToShareList(aggregate) {
    if (!aggregate || !Array.isArray(aggregate.shares)) return [];
    return aggregate.shares
      .filter(s => !_isMetaBucketLabel(s.name))
      .map(s => ({
        name        : s.name,
        onlineShare : s.share,
        ladderShare : s.share,
        trend       : 0,
        onlineWinPct: 0,
        _pastMetaSeen: s.tournamentsSeen,  // diagnostic only — not used by predictor
      }));
  }

  async function _loadClShares(path) {
    const out = {};
    try {
      const resp = await fetch(path + '?t=' + Date.now());
      if (!resp.ok) return out;
      const rows = parseCSV(await resp.text(), ';');
      rows.forEach(r => {
        const name = (r.archetype || '').trim();
        if (!name) return;
        const share = parseEU(r.new_meta_share || '0');
        if (share > 0) out[normalize(name)] = { name, share };
      });
    } catch (_e) { /* tolerate missing source */ }
    return out;
  }

  // Fetch online_share_history/manifest.json — frontend can't list dirs,
  // so the limitless scraper writes a manifest of available date files.
  async function _loadHistoryManifest() {
    try {
      const resp = await fetch('data/online_share_history/manifest.json?t=' + Date.now());
      if (!resp.ok) return null;
      const data = await resp.json();
      if (data && Array.isArray(data.dates)) return data;
    } catch (_e) { /* manifest missing — feature degrades gracefully */ }
    return null;
  }

  // Pick the closest available date <= targetDate from the manifest. Returns
  // ISO date string or null. Used so trend baselines fall back gracefully
  // when the exact target date wasn't scraped (e.g. user installed app
  // after the last major and has no day-of snapshot).
  function _resolveHistoryDate(targetDateISO) {
    if (!_historyManifest || !_historyManifest.dates || !targetDateISO) return null;
    const dates = _historyManifest.dates.slice().sort();
    let pick = null;
    for (const d of dates) {
      if (d <= targetDateISO) pick = d;
      else break;
    }
    return pick;
  }

  // ────────────────────────────────────────────────────────────────────
  // Meta Call Predictor 5.0 — multi-snapshot recency-weighted trend
  //
  // The Predictor 3.0/4.x code uses two discrete baseline points (at-major
  // and week-ago) to compute a single trend factor per deck. With the
  // online_share_history/ directory containing daily snapshots
  // (currently 7+ dates), we can replace those two points with a smooth
  // recency-weighted aggregate across the full window — same decay curve
  // the consistency builder uses for tournament-level data.
  //
  // Two anchors:
  //   1. _metaRecencyWeight(ageDays) — piecewise linear decay
  //         0–7d   → 1.0     (recent meta dominates)
  //         7–21d  → 1.0 → 0.4  (linear)
  //         21–42d → 0.4 → 0.1  (linear)
  //         >42d   → 0.05    (legacy)
  //
  //   2. Format rotation cutoff — snapshots BEFORE _FORMAT_ROTATION_DATE
  //      get an additional × 0.10 multiplier. The 2026-04-10 rotation
  //      removed Iono / Counter Catcher / Professor's Research, which
  //      fundamentally changed which decks can compete. Pre-rotation
  //      shares describe a different format and should not drag the
  //      post-rotation predictor.
  // ────────────────────────────────────────────────────────────────────
  const _FORMAT_ROTATION_DATE = '2026-04-10';

  function _metaRecencyWeight(ageDays) {
    if (!Number.isFinite(ageDays) || ageDays < 0) return 1.0;
    if (ageDays <= 7) return 1.0;
    if (ageDays <= 21) return 1.0 - ((ageDays - 7) / 14) * 0.6;
    if (ageDays <= 42) return 0.4 - ((ageDays - 21) / 21) * 0.3;
    return 0.05;
  }

  // Loaded once at predictor init; lives on the module so _runPredictor
  // can reference it without re-fetching every snapshot.
  let _allHistorySnapshots = null;

  // Effective date cutoff for the predictor's tournament-row pipelines.
  // Returns the user's explicit window.currentMetaDateFrom when set,
  // otherwise an auto-default of "28 days ago from today". The auto-
  // default keeps the cumulative aggregates (limitless online + dated
  // CSV) from being diluted by old, off-meta tournaments — user-flagged
  // via the LA Regionals gap (Dragapult predicted 17 % vs actual 31.9 %
  // because cumulative inputs included pre-rotation / pre-consolidation
  // data that was no longer representative).
  //
  // When the user picks an explicit date, that wins. Hitting Clear
  // resets to the auto-default (NOT to "no filter"). To get the
  // historical "all-time cumulative" view back, the user can pick a
  // very old date (e.g. 2024-01-01).
  const _AUTO_WINDOW_DAYS = 28;
  function _effectiveDateCutoff() {
    const explicit = (typeof window !== 'undefined') ? window.currentMetaDateFrom : null;
    if (explicit && /^\d{4}-\d{2}-\d{2}$/.test(explicit)) return explicit;
    let cutoff = null;
    try { cutoff = _isoMinusDays(_todayISO(), _AUTO_WINDOW_DAYS); }
    catch (_e) { cutoff = null; }
    // Predictor 5.5 — format-rotation guard. The auto-28-day window
    // is calibrated for stable formats. During the first ~4 weeks of
    // a new set rotation (set_release_date < today < release+28),
    // the window reaches back into the previous format's dated rows
    // and silently overwrites ladderShare / broughtShare with
    // prior-format buckets. This was the exact mechanism that pushed
    // Mega Greninja's 8.23 % online share down to ~0.9 % at the CRI
    // rotation (deck was 4 days old, 28-day bucket count was almost
    // entirely TEF-POR rows it wasn't in) — and shoved Grimmsnarl
    // Froslass to predicted #1 from its TEF-POR cumulative count.
    // Floor the auto cutoff to the current set's release date when
    // the format_window says rotation is fresh — never reach back
    // into a previous format on autopilot.
    const releaseISO = _formatWindow && _formatWindow.set_release_date;
    if (releaseISO && /^\d{4}-\d{2}-\d{2}$/.test(releaseISO)) {
      if (!cutoff || releaseISO > cutoff) cutoff = releaseISO;
    }
    return cutoff;
  }

  async function _loadAllHistorySnapshots() {
    if (!_historyManifest || !Array.isArray(_historyManifest.dates) || _historyManifest.dates.length === 0) {
      return new Map();
    }
    // Honour the effective date cutoff (explicit user filter, or the
    // auto-28-day default when none is set). Drops history snapshots
    // earlier than the cutoff so the recency baseline + trend signals
    // see only meta-current data. Auto-default kicks in when no
    // explicit window.currentMetaDateFrom is set.
    const cutoff = _effectiveDateCutoff();
    const dates = _historyManifest.dates.slice().sort()
      .filter(d => !cutoff || d >= cutoff);
    if (dates.length === 0) return new Map();
    const out = new Map();
    const results = await Promise.all(dates.map(d => _loadHistorySnapshot(d).then(snap => [d, snap])));
    for (const [d, snap] of results) {
      if (snap && Object.keys(snap).length > 0) out.set(d, snap);
    }
    return out;
  }

  // Recency-weighted baseline share% for a single deck across all
  // available snapshots. Returns null when the deck has no entries in
  // any snapshot — caller falls back to legacy week-ago baseline.
  function _computeWeightedBaseline(allSnapshots, todayISO, normName) {
    if (!allSnapshots || !allSnapshots.size) return null;
    const todayMs = Date.parse(todayISO + 'T00:00:00Z');
    if (!Number.isFinite(todayMs)) return null;

    let sumWeightedShare = 0;
    let sumWeights = 0;
    for (const [dateISO, snap] of allSnapshots) {
      const dateMs = Date.parse(dateISO + 'T00:00:00Z');
      if (!Number.isFinite(dateMs)) continue;
      const ageDays = Math.max(0, Math.floor((todayMs - dateMs) / 86400000));
      let weight = _metaRecencyWeight(ageDays);
      if (dateISO < _FORMAT_ROTATION_DATE) weight *= 0.10;  // post-rotation cutoff
      if (weight <= 0) continue;
      const totalShare = Object.values(snap).reduce((s, e) => s + (e.share || 0), 0) || 1;
      const entry = snap[normName];
      if (!entry) continue;  // deck wasn't in this day's snapshot
      const sharePct = (entry.share / totalShare) * 100;
      sumWeightedShare += sharePct * weight;
      sumWeights += weight;
    }
    if (sumWeights <= 0) return null;
    return sumWeightedShare / sumWeights;
  }

  // ACE-SPEC variant breakdown per archetype. Reads the dated CSV
  // (already produced as a side-effect of current_meta_analysis_scraper),
  // groups by (tournament_id, archetype) — each = one deck — and counts
  // which ACE-SPEC each deck ran. Surfaces a "Most-played ACE-SPEC: X
  // (60% of decks)" annotation per top-N predicted deck.
  const _ACE_SPEC_NAMES_LOWER = new Set([
    "prime catcher", "unfair stamp", "master ball", "maximum belt",
    "hero's cape", "awakening drum", "reboot pod", "survival brace",
    "grand tree", "neutral center", "sparkling crystal", "dangerous laser",
    "scoop up cyclone", "computer search", "dowsing machine", "rock guard",
    "life dew", "victory star", "g booster", "g scope",
    "rich energy", "legacy energy", "secret box", "hyper aroma",
    "neo upper energy", "scramble switch", "deluxe bomb", "megaton blower",
    "amulet of hope", "poké vital a", "poke vital a",
  ]);

  let _aceSpecVariantsByDeck = {};  // normName → [{aceSpec, count, sharePct}]
  let _datedCardsRows        = null; // parsed online_tournament_dated_cards.csv, shared between
                                     // ACE-SPEC + doctrine pillar pipelines

  // Cache holds the FULL parsed CSV; the date-filter is applied per
  // consumer to keep one fetch per session and let the same raw rows
  // serve different filter windows without re-fetching.
  let _datedCardsRowsRaw = null;
  async function _loadDatedCardsRows() {
    if (!_datedCardsRowsRaw) {
      try {
        const resp = await fetch('data/online_tournament_dated_cards.csv?t=' + Date.now());
        if (!resp.ok) { _datedCardsRowsRaw = []; }
        else { _datedCardsRowsRaw = parseCSV(await resp.text(), ';'); }
      } catch (_e) {
        _datedCardsRowsRaw = [];
      }
      // W3 Phase 0 — load all rows, no drop-filter. Phase 1 applies
      // attendance weighting at the per-tournament aggregation step
      // (≥ threshold → 0.8, < threshold → 0.2) so small events still
      // contribute to rogue-deck detection.
    }
    const cutoff = _effectiveDateCutoff();
    if (!cutoff || !/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) {
      _datedCardsRows = _datedCardsRowsRaw;
      return _datedCardsRows;
    }
    // Filter rows whose tournament_date is on or after the cutoff. Same
    // helper Card Analysis uses (window.filterRowsByDateFrom) when
    // available — falls back to a local string compare otherwise.
    if (typeof window !== 'undefined' && typeof window.filterRowsByDateFrom === 'function') {
      _datedCardsRows = window.filterRowsByDateFrom(_datedCardsRowsRaw, cutoff);
    } else {
      _datedCardsRows = _datedCardsRowsRaw.filter(r => {
        const raw = (r && r.tournament_date) || '';
        return raw && raw >= cutoff; // ISO yyyy-mm-dd compares lexicographically
      });
    }
    return _datedCardsRows;
  }

  async function _loadAceSpecVariants() {
    _aceSpecVariantsByDeck = {};
    const rows = await _loadDatedCardsRows();
    if (!rows || rows.length === 0) return;
    // Group rows by (tournament_id, archetype) into per-deck buckets.
    const buckets = new Map();
    for (const r of rows) {
      const tid = (r.tournament_id || '').trim();
      const arch = (r.archetype || '').trim();
      const cardName = (r.card_name || '').trim().toLowerCase();
      if (!tid || !arch || !cardName) continue;
      const key = `${tid}|${arch}`;
      if (!buckets.has(key)) buckets.set(key, { archetype: arch, cards: new Set() });
      buckets.get(key).cards.add(cardName);
    }
    // For each archetype, count which ACE-SPEC each deck ran.
    const archStats = {};
    for (const bucket of buckets.values()) {
      const norm = normalize(bucket.archetype);
      if (!archStats[norm]) archStats[norm] = { _total: 0 };
      archStats[norm]._total += 1;
      for (const cn of bucket.cards) {
        if (_ACE_SPEC_NAMES_LOWER.has(cn)) {
          archStats[norm][cn] = (archStats[norm][cn] || 0) + 1;
        }
      }
    }
    for (const [norm, counts] of Object.entries(archStats)) {
      const total = counts._total || 0;
      delete counts._total;
      const variants = Object.entries(counts)
        .map(([aceSpec, count]) => ({
          aceSpec,
          count,
          sharePct: total > 0 ? (count / total) * 100 : 0,
        }))
        .sort((a, b) => b.count - a.count);
      if (variants.length > 0) _aceSpecVariantsByDeck[norm] = variants;
    }
  }

  // ── Predictor 5.0 — Phase 2 / 3 helpers ──────────────────────
  // Three additional per-deck annotations on top of the recency-
  // weighted baseline + ACE-SPEC variants from Phase 1:
  //   • bestMatchups / worstMatchups — share-weighted top 3 each,
  //     pulled from _matchupMap once it's populated.
  //   • mainPokemon / mainPokemonHp / hpTier — main-attacker HP
  //     pulled from pokemon_card_effects.json (10 MB, lazy-loaded
  //     once and shared with the deck-builder cache via
  //     window._cardEffectsIndex).
  //   • doctrineScore / doctrinePillars / doctrineMissing —
  //     pillar-coverage of typical archetype builds (draw / search /
  //     gust / energy). 0–100 score + list of missing pillars.
  // ────────────────────────────────────────────────────────────

  // Post-rotation (2026-04+) supporters that drive the draw engine.
  // Curated against the current SCR + DRI sets — additions land here
  // when a new set ships.
  const _DOCTRINE_DRAW_SUPPORTERS_LOWER = new Set([
    "iono", "arven", "roxanne", "crispin", "drayton", "judge",
    "professor's research", "professor turo's scenario",
    "professor sada's vitality", "thorton", "atticus", "marnie",
    "n's plan", "n", "n's pp up", "cynthia's roar",
    "ethan's adventure", "steven's resolve", "kieran",
    "tulip", "tate & liza", "pokégear 3.0", "pokegear 3.0",
  ]);
  // Pokémon-search items that count as the deck's tutor pillar.
  const _DOCTRINE_SEARCH_ITEMS_LOWER = new Set([
    "ultra ball", "nest ball", "buddy-buddy poffin", "tera orb",
    "level ball", "great ball", "premier ball", "evolution incense",
    "rare candy", "earthen vessel", "trekking shoes", "hyper aroma",
    "iron bundle", "energy search", "energy switch",
  ]);
  // Cards that gust / pull a benched Pokémon active. Iono is
  // intentionally OMITTED — it disrupts the hand, not the bench,
  // and conflating the two would mask decks that brick on closer-
  // game gust outs. Plain "Switch" / "Switch Cart" are also
  // omitted because they swap YOUR active, not the opponent's.
  const _DOCTRINE_GUST_CARDS_LOWER = new Set([
    "boss's orders", "counter catcher", "cyrus's manipulation",
    "ariana's calling card", "morty's conviction",
    "calamitous snowy mountain", "switcheroo bait",
  ]);

  // HP tier thresholds — derived from the user's strategic analysis:
  //   ≥ 340  = wall (survives most 2-shots; Mega Lucario tier)
  //   ≥ 320  = tanky (survives common Dragapult/standard 2-shots)
  //   ≥ 280  = standard (the EX baseline)
  //   <  280 = fragile (KO'd by a single hit from a ~280 attacker)
  const _HP_TIER_FRAGILE = 280;
  const _HP_TIER_TANKY   = 320;
  const _HP_TIER_WALL    = 340;

  let _archetypeHpMap       = null; // normName → { mainPokemon, hp, tier }
  let _archetypeDoctrineMap = null; // normName → { score, pillars, missing }

  function _classifyHpTier(hp) {
    if (!Number.isFinite(hp) || hp <= 0) return null;
    if (hp >= _HP_TIER_WALL)    return 'wall';
    if (hp >= _HP_TIER_TANKY)   return 'tanky';
    if (hp >= _HP_TIER_FRAGILE) return 'standard';
    return 'fragile';
  }

  // Lazy-loader for pokemon_card_effects.json. Reuses the deck-
  // builder's window._cardEffectsIndex when present so the 10 MB
  // file is fetched at most once per session, regardless of which
  // panel the user opened first.
  //
  // Builds BOTH bySetNumber and byName maps even though MetaCall
  // itself only needs byName. Other consumers (capability detector
  // in app-current-meta-analysis, deck-builder's effect lookups)
  // need bySetNumber to identify the exact print. When MetaCall
  // wins the race and is the first to cache the index, those
  // consumers silently failed before — bySetNumber was undefined
  // and `.get()` threw TypeError inside a swallowed try/catch.
  async function _loadCardEffectsForHp() {
    if (typeof window !== 'undefined' && window._cardEffectsIndex
        && window._cardEffectsIndex.byName
        && window._cardEffectsIndex.bySetNumber) {
      return window._cardEffectsIndex;
    }
    try {
      const resp = await fetch('./data/pokemon_card_effects.json');
      if (!resp.ok) return null;
      const raw = await resp.json();
      const bySetNumber = new Map();
      const byName = new Map();
      if (raw && typeof raw === 'object') {
        for (const k of Object.keys(raw)) {
          const v = raw[k];
          if (!v) continue;
          const upperKey = String(k).toUpperCase().trim();
          bySetNumber.set(upperKey, v);
          const nm = String(v.name || '').toLowerCase().trim();
          if (nm && !byName.has(nm)) byName.set(nm, v);
        }
      }
      const idx = { bySetNumber, byName, size: bySetNumber.size };
      if (typeof window !== 'undefined') window._cardEffectsIndex = idx;
      return idx;
    } catch (_e) {
      return null;
    }
  }

  // Pure helper — given the card-effects byName map and an
  // archetype's main-Pokémon name, return the highest-HP card that
  // matches as a name prefix. Tournament metas converge on the
  // tankiest version of an evolution line, so max HP is the right
  // signal. Exposed for unit tests.
  function _resolveMainPokemonHp(byName, mainPokemon) {
    if (!byName || !mainPokemon) return null;
    const lower = String(mainPokemon).toLowerCase().trim();
    if (!lower) return null;
    let bestHp = 0;
    let bestName = null;
    for (const [nm, v] of byName) {
      // Match: exact OR card name starts with "<main> ". Avoids
      // false positives like "Mega Dragapult ex" matching a
      // search for "Dragapult".
      if (nm === lower || nm.startsWith(lower + ' ')) {
        const hp = parseInt(v.hp || '0', 10);
        if (Number.isFinite(hp) && hp > bestHp) {
          bestHp = hp;
          bestName = v.name;
        }
      }
    }
    if (bestHp <= 0) return null;
    return { mainPokemon: bestName, hp: bestHp, tier: _classifyHpTier(bestHp) };
  }

  async function _loadArchetypeHpMap(archetypeNames) {
    _archetypeHpMap = {};
    if (!archetypeNames || archetypeNames.length === 0) return _archetypeHpMap;
    const idx = await _loadCardEffectsForHp();
    if (!idx || !idx.byName) return _archetypeHpMap;
    for (const archName of archetypeNames) {
      const main = extractMainPokemon(archName);
      if (!main) continue;
      const r = _resolveMainPokemonHp(idx.byName, main);
      if (r) _archetypeHpMap[normalize(archName)] = r;
    }
    return _archetypeHpMap;
  }

  // Pure helper — given parsed dated-cards rows, return per-
  // archetype doctrine quality. Exposed for unit tests.
  //
  //   Pillar = present when ≥ 50 % of an archetype's per-tournament
  //   builds carry a card from the pillar's whitelist (or a
  //   Basic/Special Energy line for the energy pillar).
  //
  //   Score = (# pillars present) / 4 × 100.
  //   missing = list of pillar names not covered.
  //
  // Skips archetypes with < 2 tournament samples — single-sample
  // doctrine scores are noise.
  function _computeArchetypeDoctrine(rows) {
    const out = {};
    if (!rows || rows.length === 0) return out;
    // Bucket rows by (tournament_id, archetype). Each bucket = one
    // build of that archetype at that tournament.
    const buckets = new Map();
    for (const r of rows) {
      const tid = (r.tournament_id || '').trim();
      const arch = (r.archetype || '').trim();
      const cardName = (r.card_name || '').trim().toLowerCase();
      const cardType = (r.type || '').trim().toLowerCase();
      if (!tid || !arch || !cardName) continue;
      const norm = normalize(arch);
      const key = `${tid}|${norm}`;
      if (!buckets.has(key)) buckets.set(key, { norm, cards: [] });
      buckets.get(key).cards.push({ name: cardName, type: cardType });
    }

    const totalByArch = {};
    const presentByArch = {};
    for (const bucket of buckets.values()) {
      const norm = bucket.norm;
      totalByArch[norm] = (totalByArch[norm] || 0) + 1;
      if (!presentByArch[norm]) {
        presentByArch[norm] = { draw: 0, search: 0, gust: 0, energy: 0 };
      }
      let hasDraw = false, hasSearch = false, hasGust = false, hasEnergy = false;
      for (const c of bucket.cards) {
        if (_DOCTRINE_DRAW_SUPPORTERS_LOWER.has(c.name)) hasDraw = true;
        if (_DOCTRINE_SEARCH_ITEMS_LOWER.has(c.name))    hasSearch = true;
        if (_DOCTRINE_GUST_CARDS_LOWER.has(c.name))      hasGust = true;
        if (c.type.includes('basic energy') || c.type.includes('special energy')) {
          hasEnergy = true;
        }
      }
      if (hasDraw)   presentByArch[norm].draw   += 1;
      if (hasSearch) presentByArch[norm].search += 1;
      if (hasGust)   presentByArch[norm].gust   += 1;
      if (hasEnergy) presentByArch[norm].energy += 1;
    }

    for (const [norm, total] of Object.entries(totalByArch)) {
      if (total < 2) continue; // single-sample noise — skip
      const p = presentByArch[norm];
      const pillars = {
        draw:   (p.draw   / total) >= 0.5,
        search: (p.search / total) >= 0.5,
        gust:   (p.gust   / total) >= 0.5,
        energy: (p.energy / total) >= 0.5,
      };
      const present = Object.values(pillars).filter(Boolean).length;
      const missing = Object.entries(pillars)
        .filter(([_, v]) => !v)
        .map(([k]) => k);
      out[norm] = { score: (present / 4) * 100, pillars, missing };
    }
    return out;
  }

  async function _loadArchetypeDoctrineMap() {
    const rows = await _loadDatedCardsRows();
    _archetypeDoctrineMap = _computeArchetypeDoctrine(rows);
    return _archetypeDoctrineMap;
  }

  // Pure helper — given the matchup map, the deck's normalized key
  // and the predicted-share field, return top-3 best (mode='best')
  // or worst (mode='worst') matchups, share-weighted. Excludes
  // shares < 0.5 % to keep niche matchups out of the headline
  // hint. Exposed for unit tests.
  function _topMatchupsForDeck(matchupMap, deckKey, field, mode) {
    if (!Array.isArray(field)) return [];
    // Source-priority: getBaseMatchup applies the 65 / 35 Major-Online
    // blend AND prefers Day-2 over Overall when sample size allows.
    // Earlier versions of this helper read directly from _matchupMap
    // (online-only) — which meant Top / Worst surfaced different
    // matchup numbers than the simulator and the field table used
    // for the same pair. Calling getBaseMatchup unifies them. We
    // fall back to the raw map only when getBaseMatchup isn't yet
    // reachable (e.g. during tests that stub the module).
    const useBlended = typeof getBaseMatchup === 'function';
    const candidates = [];
    for (const opp of field) {
      if (!opp || !opp.name) continue;
      if (opp.name === '_junk') continue;
      const ok = normalize(opp.name);
      if (ok === deckKey) continue;
      let pWin;
      let source = 'online';
      let games  = 0;
      if (useBlended) {
        const blended = getBaseMatchup(deckKey, ok);
        if (!blended || typeof blended.pWin !== 'number') continue;
        pWin = blended.pWin;
        // Diagnostic for tooltip surfacing: stringify the source list
        // so the per-deck Top / Worst rows can describe whether the
        // WR comes from Day-2 + Day-1 + Online, Overall + Online, or
        // online-only. The total games figure is the sum across the
        // labs-side sources (online has no per-pair game count).
        if (Array.isArray(blended._majorSources) && blended._majorSources.length > 0) {
          const labs = blended._majorSources.filter(s => s.kind !== 'online');
          if (labs.length > 0) {
            source = 'major-' + labs.map(s => s.kind).join('+');
            games  = labs.reduce((s, x) => s + (x.games || 0), 0);
          }
        }
      } else {
        const m = matchupMap?.[deckKey]?.[ok];
        if (!m || typeof m.pWin !== 'number') continue;
        pWin = m.pWin;
      }
      // Round to 1 decimal — IEEE-754 noise (0.55 → 55.00000000000001)
      // would otherwise leak into renderers.
      const wr = Math.round(pWin * 1000) / 10;
      const share = opp.predictedShare || opp.onlineShare || 0;
      if (share < 0.5) continue;
      candidates.push({ opponent: opp.name, wr, share, source, games });
    }
    if (mode === 'best') {
      return candidates
        .filter(r => r.wr >= 50)
        .sort((a, b) => (b.wr - a.wr) || (b.share - a.share))
        .slice(0, 3);
    }
    return candidates
      .filter(r => r.wr < 50)
      .sort((a, b) => (a.wr - b.wr) || (b.share - a.share))
      .slice(0, 3);
  }

  // Decoration pass — runs after _runPredictor() and after the
  // matchup CSV is loaded. Attaches Phase 2 + 3 fields onto each
  // _shareList entry. Top-N only (default 12) keeps render cost
  // bounded; lower-share decks aren't worth the HP lookup or the
  // matchup hint.
  async function _decorateMetaCallEntries(topN = 12) {
    if (!_shareList || _shareList.length === 0) return;
    const slice = _shareList.slice(0, topN);
    const archetypeNames = slice.map(d => d.name).filter(Boolean);

    // Fire HP + doctrine loads in parallel — they touch different
    // files and don't depend on each other.
    const [hpMap] = await Promise.all([
      _loadArchetypeHpMap(archetypeNames),
      _loadArchetypeDoctrineMap(),
    ]);

    for (const d of slice) {
      const k = normalize(d.name);
      // HP / main attacker.
      const hp = hpMap[k];
      d.mainPokemon   = (hp && hp.mainPokemon) || null;
      d.mainPokemonHp = (hp && Number.isFinite(hp.hp)) ? hp.hp : null;
      d.hpTier        = (hp && hp.tier) || null;
      // Doctrine quality.
      const doc = _archetypeDoctrineMap && _archetypeDoctrineMap[k];
      d.doctrineScore   = (doc && Number.isFinite(doc.score)) ? doc.score : null;
      d.doctrinePillars = (doc && doc.pillars) || null;
      d.doctrineMissing = (doc && doc.missing) || [];
      // Best / worst matchups.
      d.bestMatchups  = _topMatchupsForDeck(_matchupMap, k, _shareList, 'best');
      d.worstMatchups = _topMatchupsForDeck(_matchupMap, k, _shareList, 'worst');
    }
  }

  if (typeof window !== 'undefined') {
    window._metaRecencyWeight       = _metaRecencyWeight;
    window._computeWeightedBaseline = _computeWeightedBaseline;
    window._classifyHpTier          = _classifyHpTier;
    window._resolveMainPokemonHp    = _resolveMainPokemonHp;
    window._computeArchetypeDoctrine = _computeArchetypeDoctrine;
    window._topMatchupsForDeck      = _topMatchupsForDeck;
  }

  // Load a per-date history snapshot CSV (deck_name; share columns) and
  // return { normalize(deck) -> share% }. Empty when file is missing.
  async function _loadHistorySnapshot(dateISO) {
    if (!dateISO) return {};
    const out = {};
    try {
      const resp = await fetch(`data/online_share_history/${dateISO}.csv?t=` + Date.now());
      if (!resp.ok) return out;
      const rows = parseCSV(await resp.text(), ';');
      rows.forEach(r => {
        const name = (r.deck_name || '').trim();
        if (!name) return;
        const share = parseEU(r.share || '0');
        if (share > 0) out[normalize(name)] = { name, share };
      });
    } catch (_e) { /* tolerate */ }
    return out;
  }

  // Subtract whole days from an ISO date string ('YYYY-MM-DD').
  function _isoMinusDays(isoDate, days) {
    if (!isoDate) return null;
    const d = new Date(isoDate + 'T00:00:00Z');
    if (isNaN(d.getTime())) return null;
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
  }

  function _todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function _clip(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // Rank-weighted mean for per-tournament conversion samples (Predictor
  // 5.2 Fix #C). Newest tournament gets weight 1.0, second newest 0.55,
  // third 0.30, fourth 0.17, etc. Stronger recency curve than the
  // linear date-distance weighting used elsewhere — captures the fact
  // that Prag → LA conversion drift is huge (Crustle 46.5 % → 13.3 %,
  // Festival Lead 41.3 % → 14.5 %) and equal-weighting two majors of
  // that magnitude misrepresents the current meta. Returns 0 when no
  // samples; falls back to plain sum/n when samples array is missing.
  function _rankWeightedConv(deckEntry) {
    if (!deckEntry) return 0;
    if (!Array.isArray(deckEntry.samples) || deckEntry.samples.length === 0) {
      return deckEntry.n > 0 ? deckEntry.sum / deckEntry.n : 0;
    }
    // Sort newest → oldest. Empty dates sink to bottom of list.
    const sorted = deckEntry.samples.slice().sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return b.date.localeCompare(a.date);
    });
    let weightedSum = 0, weightTotal = 0;
    sorted.forEach((s, i) => {
      const w = Math.pow(0.55, i);
      weightedSum += s.conv * w;
      weightTotal += w;
    });
    return weightTotal > 0 ? weightedSum / weightTotal : 0;
  }

  // Short display name for a major tournament. Strips common Limitless
  // prefixes so the field cards can fit "Prague" / "IC London" etc.
  // Falls back to the full name when no known prefix matches.
  function _shortMajorName(fullName) {
    if (!fullName) return '';
    const cleaned = fullName
      // The labs CSV occasionally has mojibake on accented city names
      // ("QuerÃ©taro"); collapse those back to ASCII so the short name
      // doesn't carry corrupt bytes into the UI.
      .replace(/Querétaro|QuerÃ©taro|Queretaro/i, 'Querétaro');
    return cleaned
      .replace(/^Regional Championship\s+/i, '')
      .replace(/^International Championship\s+/i, 'IC ')
      .replace(/^World Championship[s]?\s+/i, 'Worlds ')
      .replace(/^Special Event\s+/i, '')
      .trim();
  }

  // dd.MM. for short display under deck cards (e.g. "27.4.").
  function _formatShortDate(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
    // Match groups are [full, year, month, day]. The old `[, m, d]` bound
    // year+month and dropped the day, rendering "2026-06-12" as "6.2026."
    // instead of "12.6.". Bind month + day explicitly.
    const [, , mo, da] = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return `${parseInt(da, 10)}.${parseInt(mo, 10)}.`;
  }

  // Extract the "main pokemon" for grouping purposes.
  //
  // Real-world Limitless deck names use SPACES to separate Pokémon, not " / ".
  // Examples from the data:
  //   "Dragapult"               → "Dragapult"
  //   "Dragapult Blaziken"      → "Dragapult"          (2nd Pokémon is the tech partner)
  //   "N's Zoroark"             → "N's Zoroark"        (trainer-linked: keep "X's Y")
  //   "Mega Absol Box"          → "Mega Absol"         (form prefix: keep "Mega Y")
  //   "Raging Bolt Ogerpon"     → "Raging Bolt"        (2-word Paradox Pokémon name)
  //   "Alolan Exeggutor ex"     → "Alolan Exeggutor"   (regional form)
  //
  // Also supports legacy " / " separator in case some sources still use it.
  const _FORM_PREFIXES = new Set([
    'Mega', 'Alolan', 'Galarian', 'Hisuian', 'Paldean',
    'White', 'Black', 'Primal', 'Origin', 'Shiny',
  ]);
  const _COMPOUND_POKEMON_FIRSTS = new Set([
    // Paradox Pokémon (2-word names)
    'Iron', 'Raging', 'Flutter', 'Walking', 'Brute', 'Sandy',
    'Roaring', 'Scream', 'Slither', 'Gouging',
  ]);

  // Pretty display labels for the family-grouping header. The keys are
  // whatever extractMainPokemon() returns; values are the Pokémon-Reports
  // / Limitless-recap style names that read better at a glance.
  // Unknown families fall back to extractMainPokemon's output. Add new
  // entries as new ex/Mega Pokémon enter the meta — single-line to keep
  // it easy to maintain.
  const _FAMILY_DISPLAY_NAMES = {
    'Dragapult':            'Dragapult ex',
    'Mega Lucario':         'Mega Lucario ex',
    'Mega Charizard':       'Mega Charizard ex',
    'Mega Venusaur':        'Mega Venusaur ex',
    'Mega Diancie':         'Mega Diancie ex',
    'Mega Dragonite':       'Mega Dragonite ex',
    'Mega Starmie':         'Mega Starmie ex',
    'Mega Latias':          'Mega Latias ex',
    'Mega Lopunny':         'Mega Lopunny ex',
    'Mega Camerupt':        'Mega Camerupt ex',
    'Mega Zygarde':         'Mega Zygarde ex',
    'Mega Abomasnow':       'Mega Abomasnow ex',
    'Mega Gengar':          'Mega Gengar ex',
    'Mega Feraligatr':      'Mega Feraligatr ex',
    'Mega Froslass':        'Mega Froslass ex',
    'Mega Meganium':        'Mega Meganium ex',
    'Mega Absol':           'Mega Absol ex',
    'Alakazam':             'Alakazam ex',
    'Hydreigon':            'Hydreigon ex',
    'Hydrapple':            'Hydrapple ex',
    'Yanmega':              'Yanmega ex',
    'Decidueye':            'Decidueye ex',
    'Ceruledge':            'Ceruledge ex',
    'Greninja':             'Greninja ex',
    'Archaludon':           'Archaludon ex',
    'Mamoswine':            'Mamoswine ex',
    'Slaking':              'Slaking ex',
    'Farigiraf':            'Farigiraf ex',
    'Blissey':              'Blissey ex',
    'Cinderace':            'Cinderace ex',
    'Miraidon':             'Miraidon ex',
    'Palafin':              'Palafin ex',
    'Terapagos':            'Terapagos ex',
    'Flareon':              'Flareon ex',
    'Scizor':               'Scizor ex',
    "Cynthia's Garchomp":   "Cynthia's Garchomp ex",
    "Steven's Metagross":   "Steven's Metagross ex",
    "Marnie's Grimmsnarl":  "Marnie's Grimmsnarl ex",
    "N's Zoroark":          "N's Zoroark ex",
    "Rocket's Mewtwo":      "Rocket's Mewtwo ex",
    "Iono's Bellibolt":     "Iono's Bellibolt ex",
    "Hop's Zacian":         "Hop's Zacian ex",
    "Hop's Trevenant":      "Hop's Trevenant",
    "Lillie's Clefairy":    "Lillie's Clefairy ex",
    "Erika's Victreebel":   "Erika's Victreebel ex",
    "Ethan's Typhlosion":   "Ethan's Typhlosion",
    "Ethan's Magcargo":     "Ethan's Magcargo",
    "Misty's Gyarados":     "Misty's Gyarados ex",
    "Alolan Exeggutor":     "Alolan Exeggutor ex",
    "Bloodmoon Ursaluna":   "Bloodmoon Ursaluna ex",
    "Iron Thorns":          "Iron Thorns ex",
    "Raging Bolt":          "Raging Bolt ex",
  };

  function _familyDisplayName(main) {
    if (!main || main === '_junk') return main;
    return _FAMILY_DISPLAY_NAMES[main] || main;
  }

  // ── Family override map ──────────────────────────────────────────
  // Loaded once from data/deck_families.json. Overrides the
  // first-word heuristic of extractMainPokemon for cases where it
  // mis-groups (Ogerpon Meganium variants getting vacuumed up with
  // Ogerpon Noivern under the broad "Ogerpon" bucket). When a deck
  // name appears in this map, its family-key and display name come
  // from the override; otherwise fall through to the heuristic.
  // See data/deck_families.json for the schema + rationale.
  let _deckFamilyOverrideByName  = null;   // Map<deckName, familyKey>
  let _familyDisplayOverride     = null;   // Map<familyKey, displayName>

  async function _loadDeckFamilyOverride() {
    if (_deckFamilyOverrideByName !== null) return;
    _deckFamilyOverrideByName = new Map();
    _familyDisplayOverride    = new Map();
    try {
      const resp = await fetch('data/deck_families.json?t=' + Date.now());
      if (!resp.ok) return;
      const json = await resp.json();
      if (!json || !Array.isArray(json.families)) return;
      for (const fam of json.families) {
        if (!fam || !fam.key || !Array.isArray(fam.members)) continue;
        if (fam.display) _familyDisplayOverride.set(fam.key, fam.display);
        for (const m of fam.members) {
          if (typeof m === 'string' && m.trim()) {
            _deckFamilyOverrideByName.set(m.trim(), fam.key);
          }
        }
      }
    } catch (_e) {
      // Optional source — failing to load just means we keep the
      // pure-heuristic behavior. Don't spam the console.
    }
  }

  // Public lookup used by _aggregateFieldByFamily and
  // _aggregateRecsByFamily. Override map wins; otherwise fall
  // through to extractMainPokemon. Display name lookup is a
  // separate helper because the existing _FAMILY_DISPLAY_NAMES is
  // keyed by extractMainPokemon's output, while overrides bring
  // their own display layer.
  function _familyKeyForDeck(name) {
    if (!name) return name;
    if (_deckFamilyOverrideByName && _deckFamilyOverrideByName.has(name)) {
      return _deckFamilyOverrideByName.get(name);
    }
    return extractMainPokemon(name) || name;
  }

  function _familyDisplayForKey(key) {
    if (!key) return key;
    if (_familyDisplayOverride && _familyDisplayOverride.has(key)) {
      return _familyDisplayOverride.get(key);
    }
    return _familyDisplayName(key);
  }

  function extractMainPokemon(name) {
    if (!name || name === '_junk') return name;
    let s = String(name).trim();

    // Legacy " / " separator — take the first segment if present
    if (s.includes('/')) s = s.split(/\s*\/\s*/)[0].trim();

    const words = s.split(/\s+/);
    if (words.length <= 1) return s;

    const first = words[0];

    // "X's Y" — trainer's Pokémon (N's Zoroark, Rocket's Mewtwo, ...)
    if (/'s$/.test(first)) {
      return words.slice(0, 2).join(' ');
    }

    // "Mega/Alolan/etc. Y" — form prefix + species
    if (_FORM_PREFIXES.has(first)) {
      return words.slice(0, 2).join(' ');
    }

    // Compound Pokémon name (Iron Thorns, Raging Bolt, Flutter Mane, ...)
    if (_COMPOUND_POKEMON_FIRSTS.has(first)) {
      return words.slice(0, 2).join(' ');
    }

    // Default: single-word species name — first word is the main
    return first;
  }

  // ── Predictor 4.0a — Meta Dynamics ─────────────────────────
  // Detect surge decks (online share gain since last major) and boost
  // their counters. Returns nothing — populates _metaDynamicsByDeck.
  //
  // Inputs:
  //   _shareList[i].ladderShare       (current online share, raw count)
  //   _snapshotAtMajor[k].share       (online share at major day)
  //   _matchupMap[ck][sk].pWin        (counter-vs-surge win rate, 0..1)
  //   _lastMajorInfo.date             (drives the linear decay over 21d)
  //
  // Output per counter deck:
  //   { boost: pp, reasons: [{ vs: surgeDeck, surge: pp, wr: 0..1, contrib: pp }, ...] }
  //
  // Falls through silently when a required input is missing — early in
  // a format the model just contributes 0 and the rest of the predictor
  // runs unchanged.
  function _computeMetaDynamics() {
    _metaDynamicsByDeck = {};

    if (!_matchupMap || !_lastMajorInfo || !_lastMajorInfo.date) return;
    if (!_shareList || _shareList.length === 0) return;

    // Decay: 1.0 right after major, 0.0 after PREDICTOR_4_DECAY_DAYS.
    // Skip the whole calculation when hype has fully decayed — the
    // surge has already been baked into the regular weekly_trend
    // signal by then.
    const today = new Date();
    const majorDate = new Date(_lastMajorInfo.date);
    if (isNaN(majorDate.getTime())) return;
    const daysSince = Math.max(0, Math.floor((today - majorDate) / 86400000));
    const decay = Math.max(0, 1 - daysSince / PREDICTOR_4_DECAY_DAYS);
    if (decay <= 0) return;

    // Renormalise both share basises to %.
    const totalLadder = _shareList.reduce((s, d) => s + (d.ladderShare || 0), 0) || 1;
    const totalSnap   = Object.values(_snapshotAtMajor).reduce((s, e) => s + e.share, 0) || 1;

    // Find surge decks: current online share - share-at-major.
    const surges = [];
    _shareList.forEach(d => {
      const k = normalize(d.name);
      const baselineSnap = _snapshotAtMajor[k];
      if (!baselineSnap) return; // no baseline → can't measure surge
      const currentPct  = (d.ladderShare / totalLadder) * 100;
      const baselinePct = (baselineSnap.share / totalSnap) * 100;
      const delta = currentPct - baselinePct;
      if (delta >= PREDICTOR_4_SURGE_PP) {
        surges.push({
          name: d.name,
          key: k,
          surgePp: delta,
          hype: delta * decay
        });
      }
    });

    if (surges.length === 0) return;

    // For each candidate deck (anything with online share — counters can
    // sit at low share themselves), sum boost over surge decks beat ≥ 55%.
    // Lookup is direct (counter → surge) first, with reverse-lookup
    // fallback so we don't miss matchups stored only one-way.
    _shareList.forEach(c => {
      const ck = normalize(c.name);
      let totalBoost = 0;
      const reasons = [];
      surges.forEach(s => {
        if (ck === s.key) return; // a deck can't counter itself
        const direct  = _matchupMap[ck] && _matchupMap[ck][s.key];
        const reverse = _matchupMap[s.key] && _matchupMap[s.key][ck];
        let wr;
        if (direct && typeof direct.pWin === 'number') {
          wr = direct.pWin;
        } else if (reverse && typeof reverse.pWin === 'number') {
          // c's WR vs s = 1 - (s's WR vs c) - tie share, but tie is small
          // and roughly symmetric → use 1 - pWin as a close approximation.
          wr = 1 - reverse.pWin;
        } else {
          return; // no matchup data
        }
        if (wr < PREDICTOR_4_COUNTER_WR_MIN) return;
        const contrib = s.hype * (wr - PREDICTOR_4_COUNTER_WR_MIN) * PREDICTOR_4_COUNTER_AMP;
        if (contrib <= 0) return;
        totalBoost += contrib;
        reasons.push({ vs: s.name, surgePp: s.surgePp, wr, contrib });
      });
      if (totalBoost > 0) {
        // Cap so 4.0a never dominates the prediction. The cap also
        // protects against runaway boosts when many surges stack up.
        const capped = Math.min(totalBoost, PREDICTOR_4_BOOST_CAP_PP);
        _metaDynamicsByDeck[ck] = {
          boost:   capped,
          rawSum:  totalBoost,
          reasons: reasons.sort((a, b) => b.contrib - a.contrib)
        };
      }
    });

    // Dev-console log — one entry per fresh major. Helps eyeball the
    // detection without putting noise in the UI. Only logs when a new
    // major is encountered (so reload + scenario tweaks don't spam).
    try {
      if (_lastMajorInfo.id && _metaDynamicsLastLogId !== _lastMajorInfo.id) {
        _metaDynamicsLastLogId = _lastMajorInfo.id;
        const surgeSummary = surges
          .map(s => `${s.name} (+${s.surgePp.toFixed(2)} pp → hype ${s.hype.toFixed(2)})`)
          .join(', ');
        const topCounters = Object.entries(_metaDynamicsByDeck)
          .sort((a, b) => b[1].boost - a[1].boost)
          .slice(0, 8)
          .map(([k, v]) => {
            const name = (_shareList.find(d => normalize(d.name) === k) || {}).name || k;
            const top = v.reasons[0];
            return `${name} +${v.boost.toFixed(2)} pp (vs ${top.vs}: ${(top.wr*100).toFixed(0)}% WR)`;
          })
          .join('\n  ');
        console.log(
          `[Predictor 4.0a] Major ${_lastMajorInfo.shortName || _lastMajorInfo.id}, ` +
          `${daysSince}d ago, decay ${(decay*100).toFixed(0)}%\n` +
          `  Surge decks (${surges.length}): ${surgeSummary || 'none'}\n` +
          `  Top counters:\n  ${topCounters || '(none — no matchup data hit threshold)'}`
        );
      }
    } catch (_e) { /* dev log only — never block prediction */ }
  }

  // ── Predictor 4.5 — Concentration-Aware Counter Boost ──────
  // See constants block at top of file for motivation. Adds to (does not
  // replace) the per-deck entries _computeMetaDynamics produced — both
  // channels can fire on the same deck.
  function _computeConcentrationCounters() {
    if (!_matchupMap || !_shareList || _shareList.length === 0) return;

    // Group online share by family (extractMainPokemon collapses
    // "Dragapult Dudunsparce" + "Dragapult Dusknoir" + "Dragapult
    // Blaziken" + "Dragapult Froslass" + "Dragapult" → "Dragapult").
    const familyShare = new Map();   // family → summed ladderShare
    const familyMembers = new Map(); // family → [{ name, key }, ...]
    let totalLadder = 0;
    _shareList.forEach(d => {
      const share = d.ladderShare || 0;
      totalLadder += share;
      const family = extractMainPokemon(d.name);
      if (!family) return;
      familyShare.set(family, (familyShare.get(family) || 0) + share);
      if (!familyMembers.has(family)) familyMembers.set(family, []);
      familyMembers.get(family).push({ name: d.name, key: normalize(d.name) });
    });
    if (totalLadder <= 0) return;

    // Identify families above the concentration floor.
    const dominantFamilies = [];
    familyShare.forEach((share, family) => {
      const pct = (share / totalLadder) * 100;
      if (pct >= PREDICTOR_45_FAMILY_FLOOR_PCT) {
        dominantFamilies.push({ family, pct, members: familyMembers.get(family) || [] });
      }
    });
    if (dominantFamilies.length === 0) return;
    dominantFamilies.sort((a, b) => b.pct - a.pct);

    // For each candidate deck, sum boost across every dominant family it
    // can punish. A deck never counters itself or its own family
    // (Dragapult Blaziken doesn't get credit for "beating Dragapult").
    _shareList.forEach(c => {
      const ck = normalize(c.name);
      const myFamily = extractMainPokemon(c.name);
      let totalBoost = 0;
      const reasons = [];

      dominantFamilies.forEach(df => {
        if (df.family === myFamily) return;

        // Best WR across all of the family's variants — use the matchup
        // we know about. _matchupMap stores (deckA → deckB → pWin); fall
        // back to (1 - reverse pWin) when only one direction is stored.
        let bestWr = 0;
        let bestVs = null;
        df.members.forEach(m => {
          const mk = m.key;
          const direct  = _matchupMap[ck] && _matchupMap[ck][mk];
          const reverse = _matchupMap[mk] && _matchupMap[mk][ck];
          let wr;
          if (direct && typeof direct.pWin === 'number') {
            wr = direct.pWin;
          } else if (reverse && typeof reverse.pWin === 'number') {
            wr = 1 - reverse.pWin;
          } else {
            return;
          }
          if (wr > bestWr) { bestWr = wr; bestVs = m.name; }
        });
        if (bestWr < PREDICTOR_45_COUNTER_WR_MIN) return;

        const familyExcessFactor = (df.pct - PREDICTOR_45_FAMILY_FLOOR_PCT) / PREDICTOR_45_FAMILY_EXCESS_DIV;
        const wrEdgeFactor       = (bestWr - PREDICTOR_45_COUNTER_WR_MIN) * PREDICTOR_45_WR_FACTOR_SCALE;
        const contrib            = familyExcessFactor * wrEdgeFactor * PREDICTOR_45_BASE_CONTRIB_PP;
        if (contrib <= 0) return;

        totalBoost += contrib;
        reasons.push({
          type:      'concentration',
          family:    df.family,
          familyPct: df.pct,
          vs:        bestVs,
          wr:        bestWr,
          contrib
        });
      });

      if (totalBoost <= 0) return;
      const capped = Math.min(totalBoost, PREDICTOR_45_BOOST_CAP_PP);

      // Merge with anything 4.0a already wrote. Both boosts are pp-
      // additive to the same downstream `boost` field, so summing here
      // is what flows through to the per-deck prediction line.
      const existing = _metaDynamicsByDeck[ck] || { boost: 0, rawSum: 0, reasons: [] };
      _metaDynamicsByDeck[ck] = {
        boost:   existing.boost + capped,
        rawSum:  (existing.rawSum || 0) + totalBoost,
        reasons: existing.reasons.concat(reasons.sort((a, b) => b.contrib - a.contrib))
      };
    });

    // Dev-console log — one entry per fresh major (or whenever 4.0a
    // would have logged). Same gating mechanism so the two predictors'
    // logs naturally line up.
    try {
      const majorId = _lastMajorInfo && _lastMajorInfo.id;
      if (majorId && _concentrationLastLogId !== majorId) {
        _concentrationLastLogId = majorId;
        const families = dominantFamilies
          .map(f => `${f.family} ${f.pct.toFixed(1)}%`)
          .join(', ');
        const topCounters = Object.entries(_metaDynamicsByDeck)
          .filter(([_, v]) => v.reasons.some(r => r.type === 'concentration'))
          .sort((a, b) => b[1].boost - a[1].boost)
          .slice(0, 8)
          .map(([k, v]) => {
            const name = (_shareList.find(d => normalize(d.name) === k) || {}).name || k;
            const concReasons = v.reasons.filter(r => r.type === 'concentration');
            const top = concReasons[0];
            return `${name} +${v.boost.toFixed(2)} pp (vs ${top.family} ${top.familyPct.toFixed(1)}%, ${(top.wr*100).toFixed(0)}% WR)`;
          })
          .join('\n  ');
        console.log(
          `[Predictor 4.5] Concentration-aware boosts | Dominant families: ${families || '(none above ' + PREDICTOR_45_FAMILY_FLOOR_PCT + '%)'}\n` +
          `  Top counters:\n  ${topCounters || '(none — no matchup data hit threshold)'}`
        );
      }
    } catch (_e) { /* dev log only — never block prediction */ }
  }

  // ── Predictor 4.6 — Counter-Field Suppression ──────────────
  // Reduce the dominant family's predicted share when its
  // concentration exceeds 20 %. Operates on `predictedShareRaw`
  // AFTER the main predictor loop has run, so it shifts share
  // away from the family at the same stage 4.5 boosts counters.
  // Suppression total = min(SUPPRESS_CAP_PP, (familyPct - 20) ×
  // SUPPRESS_PER_PP), distributed across family members
  // proportional to each member's share within the family.
  //
  // Combined with the 5.2 concentration boost: 5.2 amplifies
  // raw → 4.6 then subtracts the post-amplification value. Net
  // effect at 30 % Dragapult family: ~1.0 pp suppression off the
  // family total, redistributed via renormalisation into the
  // boosted counter decks.
  function _computeFieldSuppression() {
    if (!_shareList || _shareList.length === 0) return;
    // Gated by the Meta Call mode toggle. Standard mode treats the
    // online ladder as truth — counter-suppression off.
    if (_metaCallMode !== 'counter') return;

    // Aggregate post-amplification predicted share per family.
    const familyTotal = new Map();    // family → summed predictedShareRaw
    const familyMembers = new Map();  // family → [{deck, family, share}, ...]
    let grandTotal = 0;
    _shareList.forEach(d => {
      const share = d.predictedShareRaw || 0;
      grandTotal += share;
      const family = extractMainPokemon(d.name);
      if (!family) return;
      familyTotal.set(family, (familyTotal.get(family) || 0) + share);
      if (!familyMembers.has(family)) familyMembers.set(family, []);
      familyMembers.get(family).push({ deck: d, share });
    });
    if (grandTotal <= 0) return;

    const dominant = [];
    familyTotal.forEach((share, family) => {
      const pct = (share / grandTotal) * 100;
      if (pct >= PREDICTOR_46_FAMILY_FLOOR_PCT) {
        dominant.push({ family, pct, share, members: familyMembers.get(family) || [] });
      }
    });
    if (dominant.length === 0) return;

    dominant.forEach(df => {
      const excessPct  = df.pct - PREDICTOR_46_FAMILY_FLOOR_PCT;
      const suppressPp = Math.min(PREDICTOR_46_SUPPRESS_CAP_PP, excessPct * PREDICTOR_46_SUPPRESS_PER_PP);
      if (suppressPp <= 0) return;

      // Convert pp to raw share units using the same grandTotal denominator.
      const suppressShareUnits = (suppressPp / 100) * grandTotal;

      // Distribute proportionally — bigger variants of the family lose more.
      df.members.forEach(m => {
        if (df.share <= 0) return;
        const weight = m.share / df.share;
        const reduction = suppressShareUnits * weight;
        m.deck.predictedShareRaw = Math.max(0, (m.deck.predictedShareRaw || 0) - reduction);
        m.deck.fieldSuppressionPp = (m.deck.fieldSuppressionPp || 0) + (suppressPp * weight);
      });
    });

    // Dev-console log — one entry per fresh major.
    try {
      const majorId = _lastMajorInfo && _lastMajorInfo.id;
      if (majorId && _fieldSuppressionLastLogId !== majorId) {
        _fieldSuppressionLastLogId = majorId;
        const lines = dominant.map(df => {
          const excessPct  = df.pct - PREDICTOR_46_FAMILY_FLOOR_PCT;
          const suppressPp = Math.min(PREDICTOR_46_SUPPRESS_CAP_PP, excessPct * PREDICTOR_46_SUPPRESS_PER_PP);
          return `${df.family} ${df.pct.toFixed(1)}% → -${suppressPp.toFixed(2)} pp`;
        }).join(', ');
        console.log(`[Predictor 4.6] Field suppression | ${lines}`);
      }
    } catch (_e) { /* dev log only */ }
  }

  // ── Predictor 4.7 — Counter-Adoption Boost ─────────────────
  // Boost decks where the labs brought-share exceeds the online
  // ladder share — direct signal that players are picking the
  // deck over what online play suggests, typically as a counter
  // to a dominant online family. Runs AFTER 4.5/4.6 so it
  // captures decks 4.5 missed (matchup WR < 50 %) but which the
  // tournament-floor data clearly shows as adopted counters.
  function _computeCounterAdoptionBoost() {
    if (!_shareList || _shareList.length === 0) return;
    if (!_tournamentStats) return;
    // Gated by the Meta Call mode toggle. Standard mode treats the
    // online ladder as truth — adoption boost off too.
    if (_metaCallMode !== 'counter') return;

    // Need a dominant family for the adaption signal to make
    // sense — at low concentration, brought > ladder is just
    // noise, not counter-meta behaviour.
    const totalLadder = _shareList.reduce((s, d) => s + (d.ladderShare || 0), 0) || 1;
    const familyLadder = new Map();
    _shareList.forEach(d => {
      const family = extractMainPokemon(d.name);
      if (!family) return;
      familyLadder.set(family, (familyLadder.get(family) || 0) + (d.ladderShare || 0));
    });
    let maxFamilyPct = 0;
    let dominantFamily = null;
    familyLadder.forEach((share, family) => {
      const pct = (share / totalLadder) * 100;
      if (pct > maxFamilyPct) { maxFamilyPct = pct; dominantFamily = family; }
    });
    if (maxFamilyPct < PREDICTOR_47_DOMINANT_FAMILY_PCT) return;

    const totalRaw = _shareList.reduce((s, d) => s + (d.predictedShareRaw || 0), 0) || 1;
    const applied = [];

    _shareList.forEach(d => {
      // Skip members of the dominant family — they're being
      // suppressed by 4.6, not boosted.
      if (extractMainPokemon(d.name) === dominantFamily) return;

      const k = normalize(d.name);
      const stats = _tournamentStats[k];
      if (!stats || !stats.broughtShare) return;

      const broughtPct = stats.broughtShare;
      const ladderPct  = (d.ladderShare / totalLadder) * 100;
      const deltaPp    = broughtPct - ladderPct;
      if (deltaPp < PREDICTOR_47_DELTA_MIN_PP) return;

      const boostPp = Math.min(PREDICTOR_47_BOOST_CAP_PP, deltaPp * PREDICTOR_47_BOOST_PER_PP);
      if (boostPp <= 0) return;

      // Convert pp to raw share units in the same scale.
      const boostRawShare = (boostPp / 100) * totalRaw;
      d.predictedShareRaw     = (d.predictedShareRaw || 0) + boostRawShare;
      d.adoptionBoostPp       = boostPp;
      d.adoptionBoostBrought  = broughtPct;
      d.adoptionBoostLadder   = ladderPct;
      applied.push({ name: d.name, boostPp, broughtPct, ladderPct, deltaPp });
    });

    try {
      const majorId = _lastMajorInfo && _lastMajorInfo.id;
      if (majorId && _adoptionBoostLastLogId !== majorId) {
        _adoptionBoostLastLogId = majorId;
        if (applied.length === 0) {
          console.log(`[Predictor 4.7] Counter-adoption boost: no decks qualified vs ${dominantFamily} (${maxFamilyPct.toFixed(1)} %)`);
        } else {
          const lines = applied
            .sort((a, b) => b.boostPp - a.boostPp)
            .map(a => `${a.name}: +${a.boostPp.toFixed(2)} pp (brought ${a.broughtPct.toFixed(2)} % vs ladder ${a.ladderPct.toFixed(2)} %, Δ ${a.deltaPp.toFixed(2)})`)
            .join('\n  ');
          console.log(`[Predictor 4.7] Counter-adoption boost vs ${dominantFamily} (${maxFamilyPct.toFixed(1)} %):\n  ${lines}`);
        }
      }
    } catch (_e) { /* dev log only */ }
  }

  // ── Predictor 5.5 — Online-Presence Floor ──────────────────
  // Guarantee a minimum predicted share for decks with verified
  // multi-source presence. Lucario Hariyama was getting crushed
  // to < 1.5 % predicted despite 5.52 % online share + labs
  // presence at LA (60 brought) and Prague (76 brought), because
  // its low top8 conv (2.59 %) hit every damper in the chain.
  // The floor only fires when BOTH conditions hold:
  //   1. Online share ≥ 3 % (real ladder presence)
  //   2. ≥ 1 labs sample (somebody actually brought it to a
  //      tournament — guards against pure-online noise decks)
  // Floor = 60 % of online share (allows the dampers to still
  // do their job, just bounded).
  function _computeOnlinePresenceFloor() {
    if (!_shareList || _shareList.length === 0) return;
    const totalLadder = _shareList.reduce((s, d) => s + (d.ladderShare || 0), 0) || 1;
    const totalRaw    = _shareList.reduce((s, d) => s + (d.predictedShareRaw || 0), 0) || 1;

    const applied = [];
    _shareList.forEach(d => {
      // Skip decks that 4.6 explicitly suppressed — those are
      // INTENTIONALLY lower than their online share suggests
      // (player counter-adaption hypothesis). Without this skip,
      // the floor at 60 % × online_share immediately undoes the
      // suppression (e.g. pure Dragapult: 4.6 cuts to ~6 %, then
      // 5.5 raises floor to 10.2 % = 60 % × 17 % online). 5.5's
      // job is to prevent the QUALITY DAMPERS from over-crushing
      // counters like Lucario, not to second-guess 4.6's
      // adaption signal.
      if ((d.fieldSuppressionPp || 0) > 0) return;

      const onlinePct = (d.ladderShare / totalLadder) * 100;
      const k         = normalize(d.name);
      const q         = _labsDay2ConvByDeck && _labsDay2ConvByDeck[k];
      const labsRow   = _labsRowsByDeck && _labsRowsByDeck[k];

      // Compute candidate floors from both signals.
      let onlineFloorPct = 0;
      if (onlinePct >= PREDICTOR_55_PRESENCE_FLOOR_MIN &&
          q && (q.n || 0) >= PREDICTOR_55_REQUIRE_LABS_N) {
        onlineFloorPct = onlinePct * PREDICTOR_55_PRESENCE_FLOOR_PCT;
      }

      let labsFloorPct = 0;
      let labsAvgPct   = 0;
      if (labsRow && (labsRow.n || 0) >= PREDICTOR_55_LABS_FLOOR_MIN_N) {
        // Recency-weighted average labs share_pct across recent majors.
        // share is the weighted sum, n is the summed weight.
        labsAvgPct = labsRow.share / labsRow.n;
        if (labsAvgPct >= PREDICTOR_55_LABS_FLOOR_MIN_PCT) {
          labsFloorPct = labsAvgPct * PREDICTOR_55_LABS_FLOOR_PCT;
        }
      }

      const floorPct = Math.max(onlineFloorPct, labsFloorPct);
      if (floorPct <= 0) return;

      // Convert floor pct to raw share units in the same scale.
      const floorRawShare = (floorPct / 100) * totalRaw;
      if ((d.predictedShareRaw || 0) < floorRawShare) {
        d.onlinePresenceFloorApplied = true;
        d.predictedShareRawPreFloor  = d.predictedShareRaw;
        d.predictedShareRaw          = floorRawShare;
        d.presenceFloorSource        = labsFloorPct > onlineFloorPct ? 'labs' : 'online';
        d.presenceFloorPct           = floorPct;
        applied.push({
          name: d.name, floorPct, source: d.presenceFloorSource,
          onlinePct, labsAvgPct, onlineFloorPct, labsFloorPct,
        });
      }
    });

    // Dev-console log — one entry per fresh major listing which decks
    // got floored. Critical for debugging when an expected deck (e.g.
    // Lucario Hariyama) doesn't appear: console will show whether the
    // floor fired and at what value, or — if absent — that the deck
    // failed one of the gates (online < 3 %, no labs sample, or labs
    // avg < 1.5 %).
    try {
      const majorId = _lastMajorInfo && _lastMajorInfo.id;
      if (majorId && _presenceFloorLastLogId !== majorId) {
        _presenceFloorLastLogId = majorId;
        if (applied.length === 0) {
          console.log('[Predictor 5.5] Online-presence floor: no decks floored');
        } else {
          const lines = applied
            .sort((a, b) => b.floorPct - a.floorPct)
            .map(a => `${a.name} → ${a.floorPct.toFixed(2)}% (${a.source}: online×0.6=${a.onlineFloorPct.toFixed(2)}, labs×0.85=${a.labsFloorPct.toFixed(2)})`)
            .join('\n  ');
          console.log(`[Predictor 5.5] Online-presence floor applied:\n  ${lines}`);
        }
      }
    } catch (_e) { /* dev log only */ }
  }
  let _presenceFloorLastLogId = null;

  // ── Predictor 5.6 — Format-Leader Within-Family Consolidation ──
  // As a format matures, players consolidate the dominant multi-
  // variant family onto its safest / most-pedigreed variant. The
  // Indianapolis (2026-05-29) calibration showed pure Dragapult
  // grew from 35 % within-family (TEF-POR labs average) to 62 %
  // within-family — sub-variants (Dudunsparce, Blaziken) got
  // dropped, Dusknoir mostly held. Net effect: pure Dragapult was
  // under-predicted by 9.45 pp at Indy.
  //
  // Rule: for families with ≥ MIN_VARIANTS components AND family
  // share ≥ FAMILY_DOMINANCE_THRESHOLD, redistribute CONSOLIDATION_RATE
  // of sub-variant predictedShareRaw to the lead variant (highest
  // current predictedShareRaw within family). Proportional split
  // on the way out so sub-variants shrink in relation to their
  // current size.
  //
  // Tuning notes:
  //   • CONSOLIDATION_RATE 0.40 reproduces Dragapult ex 10.4 % →
  //     ~16 % (still under 19.75 % actual but closes 5/9 pp).
  //   • Higher rates (0.60) get closer to the leader but crush
  //     Dusknoir (which actually held at Indy 6.29 %). 0.40 is
  //     the conservative middle.
  const PREDICTOR_56_FAMILY_DOMINANCE_THRESHOLD = 20.0;
  const PREDICTOR_56_MIN_VARIANTS = 3;
  const PREDICTOR_56_CONSOLIDATION_RATE = 0.40;
  // Absolute family growth (cross-family) — counteracts the renorm
  // absorption when P5.7 adds counter boosts elsewhere, AND models
  // the small but real "format-leader consolidation also grows the
  // family" effect (Indy: Dragapult family 29.3 % labs avg → 32.2 %
  // actual, +2.9 pp absolute family growth). Without this boost the
  // family ended up REGRESSING under P5.7's renorm impact (Dragapult
  // family 29.3 → 24.9 % in v202606020800, then back to 29-32 %
  // after this absolute-growth term lands).
  //
  // Tuning math (Indy anchor):
  //   target family fraction = 32.2 %
  //   labs family fraction   = 29.3 %
  //   typical other-boost pp = 7  (P5.4 + P5.7 + P4.6 across field)
  //   absolute growth pp X solves: (29.3 + X) / (107 + X) = 0.322
  //   → X ≈ 7.3 pp
  // 5.0 pp lands family at ~30.5 % post-renorm — under-shoots Indy
  // by ~2 pp but stays conservative so a less-spiky meta doesn't
  // get an artificial leader inflation.
  const PREDICTOR_56_FAMILY_GROWTH_BOOST_PP = 5.0;
  let _consolidationLastLogId = null;
  function _computeFormatLeaderConsolidation() {
    if (!_shareList || _shareList.length === 0) return;

    const familyMap = new Map();
    let totalRaw = 0;
    _shareList.forEach(d => {
      const family = extractMainPokemon(d.name);
      if (!family || family === '_junk') return;
      const share = d.predictedShareRaw || 0;
      totalRaw += share;
      if (!familyMap.has(family)) familyMap.set(family, []);
      familyMap.get(family).push({ deck: d, share });
    });
    if (totalRaw <= 0) return;

    const applied = [];
    familyMap.forEach((variants, family) => {
      if (variants.length < PREDICTOR_56_MIN_VARIANTS) return;
      const familyTotal = variants.reduce((s, v) => s + v.share, 0);
      const familyPct = (familyTotal / totalRaw) * 100;
      if (familyPct < PREDICTOR_56_FAMILY_DOMINANCE_THRESHOLD) return;

      variants.sort((a, b) => b.share - a.share);
      const leader = variants[0];
      const subVariants = variants.slice(1);
      const subTotal = subVariants.reduce((s, v) => s + v.share, 0);
      if (subTotal <= 0) return;

      const redistribute = subTotal * PREDICTOR_56_CONSOLIDATION_RATE;
      leader.deck.predictedShareRaw = (leader.deck.predictedShareRaw || 0)
        + redistribute
        + PREDICTOR_56_FAMILY_GROWTH_BOOST_PP;
      leader.deck.consolidationBoostPp = redistribute;
      leader.deck.familyGrowthBoostPp  = PREDICTOR_56_FAMILY_GROWTH_BOOST_PP;

      subVariants.forEach(sv => {
        const take = (sv.share / subTotal) * redistribute;
        sv.deck.predictedShareRaw = Math.max(0, (sv.deck.predictedShareRaw || 0) - take);
        sv.deck.consolidationDecayPp = -take;
      });

      applied.push({
        family,
        familyPct,
        leader: leader.deck.name,
        leaderShareBefore: leader.share,
        leaderShareAfter: leader.deck.predictedShareRaw,
        redistribute,
        familyGrowth: PREDICTOR_56_FAMILY_GROWTH_BOOST_PP,
        subVariantCount: subVariants.length,
      });
    });

    try {
      const majorId = _lastMajorInfo && _lastMajorInfo.id;
      if (applied.length > 0 && majorId && _consolidationLastLogId !== majorId) {
        _consolidationLastLogId = majorId;
        const lines = applied
          .sort((a, b) => b.redistribute - a.redistribute)
          .map(a => `${a.family} (family ${a.familyPct.toFixed(1)}%, ${a.subVariantCount} sub-variants): ${a.leader} +${a.redistribute.toFixed(2)} pp internal + ${a.familyGrowth.toFixed(2)} pp family-growth → ${a.leaderShareAfter.toFixed(2)}`)
          .join('\n  ');
        console.log(`[Predictor 5.6] Format-leader consolidation + family growth:\n  ${lines}`);
      }
    } catch (_e) { /* dev log only */ }
  }

  // ── Predictor 5.7 — Anti-Leader Tech-Boost ──────────────────
  // When a leading family dominates the field, the player base
  // brings hard counters in anticipation. At Indianapolis, Hydrapple,
  // Mega Lucario, and Basic Box were ALL under-predicted (−3.35,
  // −2.35, −1.55 pp) because online ladder shares didn't reflect
  // this anti-Dragapult tech wave. Limitless labs matchup data
  // would have surfaced the signal: Ogerpon Meganium 65 % vs
  // N's Zoroark, 58 % vs Dragapult Dusknoir; Mega Lucario ~55 %
  // vs Dragapult family.
  //
  // Rule: when ANY family's post-5.6 predictedShareRaw exceeds
  // LEADER_DOMINANCE_THRESHOLD, look up the labs WR of every
  // low-share non-family deck against the leader's lead variant.
  // Decks with WR ≥ COUNTER_WR_THRESHOLD AND current field share
  // ≤ COUNTER_MAX_FIELD_SHARE get an additive boost scaled by
  // wrEdge × BOOST_SCALE, capped at BOOST_PP_MAX.
  //
  // Why the field-share cap? The boost is meant to surface
  // genuine surprise counters, not double-boost decks that are
  // already big in the field. The Counter-Pick badge logic uses
  // the same 3 % rule of thumb.
  const PREDICTOR_57_LEADER_DOMINANCE_THRESHOLD = 25.0;
  const PREDICTOR_57_COUNTER_WR_THRESHOLD = 0.55;
  const PREDICTOR_57_COUNTER_MAX_FIELD_SHARE = 5.0;
  const PREDICTOR_57_BOOST_SCALE = 8.0; // wrEdge 0.05 → 0.4 pp, 0.10 → 0.8 pp, 0.18 → 1.5 pp cap
  const PREDICTOR_57_BOOST_PP_MAX = 1.5;
  let _antiLeaderLastLogId = null;
  function _computeAntiLeaderTechBoost() {
    if (!_shareList || _shareList.length === 0) return;
    if (typeof getBaseMatchup !== 'function') return;

    const familyMap = new Map();
    let totalRaw = 0;
    _shareList.forEach(d => {
      const family = extractMainPokemon(d.name);
      if (!family || family === '_junk') return;
      const share = d.predictedShareRaw || 0;
      totalRaw += share;
      if (!familyMap.has(family)) familyMap.set(family, []);
      familyMap.get(family).push({ deck: d, share });
    });
    if (totalRaw <= 0) return;

    let leaderFamily = null;
    let leaderPct = 0;
    let leaderDeckName = null;
    familyMap.forEach((variants, family) => {
      const familyTotal = variants.reduce((s, v) => s + v.share, 0);
      const familyPct = (familyTotal / totalRaw) * 100;
      if (familyPct >= PREDICTOR_57_LEADER_DOMINANCE_THRESHOLD && familyPct > leaderPct) {
        leaderPct = familyPct;
        leaderFamily = family;
        variants.sort((a, b) => b.share - a.share);
        leaderDeckName = variants[0].deck.name;
      }
    });
    if (!leaderFamily || !leaderDeckName) return;

    const applied = [];
    _shareList.forEach(d => {
      const family = extractMainPokemon(d.name);
      if (family === leaderFamily) return;
      const fieldShare = ((d.predictedShareRaw || 0) / totalRaw) * 100;
      if (fieldShare > PREDICTOR_57_COUNTER_MAX_FIELD_SHARE) return;

      let matchup = null;
      try { matchup = getBaseMatchup(d.name, leaderDeckName); }
      catch (_e) { /* no data → skip */ }
      if (!matchup || typeof matchup.pWin !== 'number') return;
      if (matchup.pWin < PREDICTOR_57_COUNTER_WR_THRESHOLD) return;

      const wrEdge = matchup.pWin - 0.50;
      const boost = Math.min(PREDICTOR_57_BOOST_PP_MAX, wrEdge * PREDICTOR_57_BOOST_SCALE);
      if (boost <= 0.05) return;

      d.predictedShareRaw = (d.predictedShareRaw || 0) + boost;
      d.antiLeaderBoostPp = boost;
      applied.push({
        name: d.name,
        wr: matchup.pWin,
        fieldShare,
        boost,
      });
    });

    try {
      const majorId = _lastMajorInfo && _lastMajorInfo.id;
      if (applied.length > 0 && majorId && _antiLeaderLastLogId !== majorId) {
        _antiLeaderLastLogId = majorId;
        const lines = applied
          .sort((a, b) => b.boost - a.boost)
          .map(a => `${a.name}: +${a.boost.toFixed(2)} pp (WR ${(a.wr * 100).toFixed(1)} % vs ${leaderDeckName}, field ${a.fieldShare.toFixed(2)} %)`)
          .join('\n  ');
        console.log(`[Predictor 5.7] Anti-leader tech-boost vs ${leaderFamily} (${leaderPct.toFixed(1)} % field):\n  ${lines}`);
      }
    } catch (_e) { /* dev log only */ }
  }

  // ── Diagnostic: Counter Coverage vs Dominant Family ────────
  // Surfaces decks that should have a matchup row vs the
  // dominant family but don't, or whose WR falls below the 4.5
  // threshold (so the boost won't fire). One-shot console log
  // per major id so manual auditing is quick.
  function _logCounterCoverageGaps() {
    if (!_matchupMap || !_shareList || _shareList.length === 0) return;
    const familyShare = new Map();
    const familyMembers = new Map();
    let totalLadder = 0;
    _shareList.forEach(d => {
      totalLadder += (d.ladderShare || 0);
      const family = extractMainPokemon(d.name);
      if (!family) return;
      familyShare.set(family, (familyShare.get(family) || 0) + (d.ladderShare || 0));
      if (!familyMembers.has(family)) familyMembers.set(family, []);
      familyMembers.get(family).push({ name: d.name, key: normalize(d.name) });
    });
    if (totalLadder <= 0) return;
    let dominant = null;
    familyShare.forEach((share, family) => {
      const pct = (share / totalLadder) * 100;
      if (pct >= PREDICTOR_45_FAMILY_FLOOR_PCT && (!dominant || pct > dominant.pct)) {
        dominant = { family, pct, members: familyMembers.get(family) || [] };
      }
    });
    if (!dominant) return;
    try {
      const majorId = _lastMajorInfo && _lastMajorInfo.id;
      if (!majorId || _matchupCoverageLastLogId === majorId) return;
      _matchupCoverageLastLogId = majorId;
      const gaps = [];
      _shareList.forEach(c => {
        if (extractMainPokemon(c.name) === dominant.family) return;
        const ck = normalize(c.name);
        let bestWr = null;
        let coverage = 0;
        dominant.members.forEach(m => {
          const direct  = _matchupMap[ck] && _matchupMap[ck][m.key];
          const reverse = _matchupMap[m.key] && _matchupMap[m.key][ck];
          let wr;
          if (direct  && typeof direct.pWin === 'number')  wr = direct.pWin;
          else if (reverse && typeof reverse.pWin === 'number') wr = 1 - reverse.pWin;
          else return;
          coverage++;
          if (bestWr == null || wr > bestWr) bestWr = wr;
        });
        if (coverage === 0) {
          gaps.push(`${c.name}: NO matchup data vs ${dominant.family}`);
        } else if (bestWr != null && bestWr < PREDICTOR_45_COUNTER_WR_MIN) {
          gaps.push(`${c.name}: best WR ${(bestWr * 100).toFixed(1)} % vs ${dominant.family} (below ${(PREDICTOR_45_COUNTER_WR_MIN * 100).toFixed(0)} % — 4.5 won't fire)`);
        }
      });
      if (gaps.length > 0) {
        console.log(
          `[Matchup-Audit] Counter-coverage gaps vs ${dominant.family} (${dominant.pct.toFixed(1)} %):\n  ` +
          gaps.slice(0, 15).join('\n  ')
        );
      }
    } catch (_e) { /* dev only */ }
  }
  let _matchupCoverageLastLogId = null;

  // ── Predictor 2.0 — runnable on demand ────────────────────
  // Extracted so a Testing Group import can update _tgFieldShares and
  // re-run the prediction without a full data reload. Uses module
  // state: _shareList (with raw .ladderShare), _tournamentStats,
  // _labsRowsByDeck, _tgFieldShares, _predictorMode.
  function _runPredictor() {
    if (!_shareList) return;

    // Predictor 4.0a — compute meta-dynamics boosts up front so the
    // per-deck loop below can add them as a small additive bonus.
    _computeMetaDynamics();

    // Predictor 4.5 — concentration-aware counter boost. Stacks
    // additively with 4.0a; a deck that's both a fresh-surge counter
    // AND a chronic-top-deck counter gets both boosts (subject to
    // each channel's own cap).
    _computeConcentrationCounters();

    // Predictor 4.4 — pre-aggregate labs share + online ladder per
    // family so the per-deck loop can redistribute the labs term by
    // current online share-of-family instead of locking onto whichever
    // variant happened to dominate the most recent major.
    _familyLabsTotal = {};
    _familyOnlineTotal = {};
    _shareList.forEach(d => {
      const k = normalize(d.name);
      const family = extractMainPokemon(d.name);
      if (!family || family === '_junk') return;
      _familyOnlineTotal[family] = (_familyOnlineTotal[family] || 0) + (d.ladderShare || 0);
      const labsRow = _labsRowsByDeck && _labsRowsByDeck[k];
      if (labsRow && labsRow.share > 0) {
        _familyLabsTotal[family] = (_familyLabsTotal[family] || 0) + labsRow.share;
      }
    });

    // Use raw ladderShare (immutable) for normalisation — onlineShare
    // gets overwritten by the predicted value at the end of the run, so
    // re-running would compound if we read from it.
    const totalLadder = _shareList.reduce((s, d) => s + (d.ladderShare || 0), 0) || 1;

    // Field-WEIGHTED mean top-8 conversion — equals total_top8 /
    // total_brought ≈ 8/100 = 0.08 for an 8-cut at 100-player events.
    // 1.0× = "average deck cuts at the natural rate".
    const convStats = _tournamentStats
      ? Object.values(_tournamentStats).filter(s => s && s.broughtShare > 0)
      : [];
    const totalBroughtForConv = convStats.reduce((a, s) => a + s.broughtShare, 0) || 1;
    const meanConv = convStats.length > 0
      ? convStats.reduce((a, s) => a + (s.top8Conv || 0) * s.broughtShare, 0) / totalBroughtForConv
      : 0.08;

    // Testing Group share — present only when the user has imported a
    // group via "Load into Meta Call". Renormalise to sum 100% so it
    // aligns with the other %-shaped signals (ladder / brought).
    const tgEntries  = Object.values(_tgFieldShares);
    const tgTotal    = tgEntries.reduce((s, v) => s + v, 0);
    const tgLoaded   = tgTotal > 0;
    const labsTotalShare = Object.values(_labsRowsByDeck).reduce((s, d) => s + d.share, 0) || 1;

    // City League shares — opt-in via _useClCurrent / _useClPast toggles.
    // Each comparison file's `new_meta_share` doesn't necessarily sum to
    // 100 (overlapping new/existing rows etc.), so normalise to a 100%
    // basis to match ladder/brought/labs.
    const clCurrentTotal = Object.values(_clCurrentByDeck).reduce((s, e) => s + e.share, 0) || 1;
    const clPastTotal    = Object.values(_clPastByDeck).reduce((s, e) => s + e.share, 0) || 1;
    const clCurrentActive = _useClCurrent && Object.keys(_clCurrentByDeck).length > 0;
    const clPastActive    = _useClPast    && Object.keys(_clPastByDeck).length > 0;

    // Total online shares from snapshots — used to renormalise share-%
    // inputs to a 100% basis (matches the field-shape of the other signals).
    const totalSnapAtMajor = Object.values(_snapshotAtMajor).reduce((s, e) => s + e.share, 0) || 1;
    const totalSnapWeekAgo = Object.values(_snapshotWeekAgo).reduce((s, e) => s + e.share, 0) || 1;

    // Trend signal: ladder share shaped by relative momentum vs a baseline.
    // Boosters move with the meta (factor > 1); fallers get damped.
    // Clipped to [0.7, 1.3] to keep the predictor well-behaved when a
    // deck moves dramatically in a single window.
    const MOMENTUM_WEIGHT = 1.0;
    function _trendSignal(currentSharePct, baselineSharePct) {
      if (!baselineSharePct || baselineSharePct <= 0) return currentSharePct;
      const factor = (currentSharePct - baselineSharePct) / baselineSharePct;
      return currentSharePct * _clip(1 + factor * MOMENTUM_WEIGHT, 0.7, 1.3);
    }

    // Field-mean Day-2 conversion — the typical "fraction of Day 1
    // players that make Day 2" across the meta. Used as the reference
    // point for the per-deck Day-2 boost below: a deck that converts
    // ABOVE the mean gets a small multiplicative boost; below-mean
    // converters are slightly damped. Skipped entirely when the labs
    // data is missing (early format or no recent majors).
    const _day2ConvSamples = Object.values(_labsDay2ConvByDeck).filter(q => q && q.n > 0);
    const _meanDay2Conv = _day2ConvSamples.length > 0
      ? _day2ConvSamples.reduce((s, q) => s + _rankWeightedConv(q), 0) / _day2ConvSamples.length
      : 0;

    // Predictor 6.0 — Tier-1 family aggregate pre-pass. _shareList is
    // VARIANT-level (Dragapult ex splits into Dragapult / Dragapult
    // Dusknoir / Dragapult Blaziken / Dragapult Dudunsparce), so a
    // variant's rawLadderPct (~2 %) never crosses the 10 % Tier-1
    // threshold even when the family aggregate is the dominant deck.
    // The gate fires on family-level totals, then the boost gets
    // distributed across variants weighted by their existing last-
    // major share within the family.
    //
    // Stored on module-level state (declared above) so the _diag
    // inspector and any maintainer poking around the console can read
    // family-level eligibility without recomputing.
    _famLadderAgg    = Object.create(null); // famKey → Σ rawLadderPct across variants
    _famLastMajorAgg = Object.create(null); // famKey → { share, day1Players, conv, … }
    _famMedianAgg    = Object.create(null); // famKey → family-level median share across recent majors
    if (_shareList && totalLadder > 0) {
      // (a) Ladder + last-major aggregation per family.
      _shareList.forEach(d => {
        const fam = _familyKeyForDeck(d.name);
        const ladderPctVariant = (d.ladderShare / totalLadder) * 100;
        _famLadderAgg[fam] = (_famLadderAgg[fam] || 0) + ladderPctVariant;

        const lm = _lastMajorByDeck[normalize(d.name)];
        if (lm && lm.share > 0) {
          const slot = _famLastMajorAgg[fam] || { share: 0, day1Players: 0, convNumerator: 0 };
          slot.share        += lm.share;
          slot.day1Players  += lm.day1Players || 0;
          // Pilot-weighted conv: variants with more pilots dominate the
          // family conv signal. Falls back to plain share-weighted when
          // day1Players isn't populated (older labs CSVs).
          const weight = lm.day1Players > 0 ? lm.day1Players : lm.share;
          slot.convNumerator += (lm.dayConv || 0) * weight;
          slot._weightSum = (slot._weightSum || 0) + weight;
          _famLastMajorAgg[fam] = slot;
        }
      });
      for (const fam of Object.keys(_famLastMajorAgg)) {
        const slot = _famLastMajorAgg[fam];
        slot.conv = slot._weightSum > 0 ? slot.convNumerator / slot._weightSum : 0;
      }

      // (b) Family-level median across tournaments. Each variant's
      // _majorSharesByDeck entry holds [{tid, date, share, …}, …] DESC
      // by date. Per-variant medians fail the "2+ majors at ≥ 2 %"
      // gate for split families (Dragapult / Dusknoir / Blaziken /
      // Dudunsparce). At the family level the union has 9+ tournaments,
      // which is what we actually want as the "typical share" baseline.
      const famByTid = Object.create(null); // famKey → tid → Σ share
      _shareList.forEach(d => {
        const fam   = _familyKeyForDeck(d.name);
        const rows  = _majorSharesByDeck[normalize(d.name)] || [];
        for (const r of rows) {
          if (!r.tid || !(r.share > 0)) continue;
          famByTid[fam] = famByTid[fam] || Object.create(null);
          famByTid[fam][r.tid] = (famByTid[fam][r.tid] || 0) + r.share;
        }
      });
      for (const fam of Object.keys(famByTid)) {
        const shares = Object.values(famByTid[fam])
          .filter(s => s > 0)
          .sort((a, b) => a - b);
        if (shares.length === 0) continue;
        const n = shares.length;
        _famMedianAgg[fam] = n % 2
          ? shares[Math.floor(n / 2)]
          : (shares[n / 2 - 1] + shares[n / 2]) / 2;
      }
    }

    // Phase β — Major-First-Anchor helper. Returns the MEDIAN share
    // across the deck's PHASE_B_LOOKBACK_MAJORS most-recent labs majors
    // IF the deck qualifies as "in-person established" (≥
    // PHASE_B_MIN_TOURNAMENTS majors at ≥ PHASE_B_MIN_SHARE_PCT each).
    // Otherwise returns null and the caller falls back to the unmodified
    // online_share anchor.
    //
    // Why median, not weighted average: an earlier iteration weighted
    // [0.70 / 0.20 / 0.10] toward the most recent regional. That gave
    // some good calls (Raging Bolt) but consistently over-predicted
    // decks that PEAKED in one regional then faded (Dragapult
    // Dudunsparce 8.94 % Campinas → 2.03 % Indy). The median ignores
    // single-tournament peaks AND single-tournament dips, producing a
    // more stable "where this deck typically lands" signal. The
    // calibration sweep (tools/calibrate_sweep_indy.py) lowered MAE
    // from 1.81 pp (recency-weighted) to 1.76 pp (median) against the
    // Indy ground truth.
    function _medianMajorShare(k) {
      const list = _majorSharesByDeck[k];
      if (!Array.isArray(list) || list.length === 0) return null;
      const eligible = list.filter(x => x.share >= PHASE_B_MIN_SHARE_PCT);
      if (eligible.length < PHASE_B_MIN_TOURNAMENTS) return null;
      const shares = list.slice(0, PHASE_B_LOOKBACK_MAJORS)
                         .map(x => x.share)
                         .sort((a, b) => a - b);
      if (shares.length === 0) return null;
      const n = shares.length;
      return n % 2
        ? shares[Math.floor(n / 2)]
        : (shares[n / 2 - 1] + shares[n / 2]) / 2;
    }
    // Back-compat alias used by older diagnostics + tests.
    const _recencyWeightedMajorShare = _medianMajorShare;

    _shareList.forEach(d => {
      const k = normalize(d.name);
      const rawLadderPct = (d.ladderShare / totalLadder) * 100;
      // Phase β — Major-First-Anchor. For decks that are "in-person
      // established" (≥2 recent majors at ≥2 % share), replace the
      // online ladder share with a 70 / 30 blend of the recency-
      // weighted major average and the ladder. This matches the
      // empirical finding that, on average, the last-three-majors
      // shape Tier-1/2 share at the next event far better than the
      // online ladder does (Raging Bolt Ogerpon: ladder 3.64 %,
      // last-3-major-avg 6.48 %, Indy actual 7.36 %).
      const majorMedian = _medianMajorShare(k);
      const ladderPct = (majorMedian != null && majorMedian > 0)
        ? (majorMedian * PHASE_B_BLEND_MAJOR + rawLadderPct * (1 - PHASE_B_BLEND_MAJOR))
        : rawLadderPct;
      // Diagnostic for the per-deck tooltip / debug overlay.
      d._phaseBMajorMedian = (majorMedian != null && majorMedian > 0) ? majorMedian : null;
      d._phaseBMajorAvg    = d._phaseBMajorMedian;   // back-compat alias
      d._phaseBLadderRaw   = rawLadderPct;

      // Predictor 6.0 — Tier-1 Convergence Detector. Gates fire on
      // FAMILY-level aggregates (Dragapult ex = sum of all four
      // Dragapult variants); the resulting boost gets distributed
      // back to each variant in proportion to its last-major share
      // within the family, preserving the variant split. The actual
      // 50/50 blend happens at the FINAL `predicted` step (search for
      // `_tier1ConvProjection`), AFTER all six weighted Mode-B inputs
      // are summed. Earlier prototype gated on variant-level rawLadderPct,
      // which never crossed the 10 % threshold even when the family
      // dominated the field — invisible in the output.
      // Stash the family key on the deck for the post-loop pass; the
      // family-level boost (if any) is applied AFTER every variant's
      // `predicted` is finalised, because scaling per-variant in this
      // loop would distort the within-family split (Dragapult base vs
      // Dusknoir vs Blaziken vs Dudunsparce ratios come from labsPct +
      // brought + ladder, not from last-major distribution alone).
      d._tier1FamKey = _familyKeyForDeck(d.name);
      const stats      = _tournamentStats ? _tournamentStats[k] : null;
      const broughtPct = stats ? stats.broughtShare : 0;
      const top8Conv   = stats ? stats.top8Conv : 0;
      const convFactor = meanConv > 0
        ? Math.max(0.5, Math.min(2.0, top8Conv / meanConv))
        : 1.0;
      const top8Boost  = broughtPct * convFactor;
      const trendPct   = d.trend || 0;

      // Predictor 5.1 — Day-2 conversion quality boost. User flagged via
      // the LA-Regionals strategy doc that mid-share decks like
      // Marnie's Grimmsnarl / Froslass ran ≈ 53.7 % Day-2 win-rate at
      // Seattle: structurally strong picks the share-only signal misses.
      // _meanDay2Conv is the field reference; a deck's day1_to_day2_conv
      // RATIO to the mean drives a multiplicative factor in [0.85, 1.20].
      // Bounds tight (no steamroll) and the boost only fires when the
      // archetype has enough sample (≥ 3 weighted tournaments) so a
      // single outlier major can't move the predictor.
      const _day2Q = _labsDay2ConvByDeck[k];
      // Predictor 5.2 Fix #C — rank-weighted recency. Falls back to
      // legacy sum/n when no per-tournament samples are stored.
      const _deckDay2Conv = (_day2Q && _day2Q.n > 0) ? _rankWeightedConv(_day2Q) : 0;
      let day2Boost = 1.0;
      // Predictor 5.2 — bounds widened from [0.85, 1.20] to [0.80, 1.40]
      // and sample threshold dropped from n≥3 to n≥1, with sample-size
      // damping. LA showed strong-conv variants (Dragapult Dusknoir
      // 32.9 %, Dudunsparce 30.3 %) get clipped by the narrow band;
      // the new range catches the real signal. Single-major samples
      // get extra damping (0.50 trust) so a noise spike doesn't move
      // the predictor by itself.
      //
      // Past Meta — skip the multiplicative boost entirely. Day-2-conv
      // ratios are designed to forecast a deck's performance at the
      // NEXT major given its history; applied retrospectively against
      // the same labs aggregate the boost was computed from, it just
      // redistributes share away from the family leader (Dragapult
      // family 29 % actual → ~20 % after the booster/laggard split
      // hits Blaziken/Dusknoir/Dudunsparce variants differently).
      if (_metaSource !== 'past'
          && _meanDay2Conv > 0 && _deckDay2Conv > 0 && _day2Q && _day2Q.n >= 1) {
        const rawBoost = _deckDay2Conv / _meanDay2Conv;
        const trust = _day2Q.n >= 3 ? 1.00 : (_day2Q.n === 2 ? 0.80 : 0.50);
        const tempered = 1.0 + (rawBoost - 1.0) * trust;
        day2Boost = _clip(tempered, 0.80, 1.40);

        // Predictor 5.3 — Pilot-Skill-Proxy. A high conv ratio from a
        // tiny pilot pool can mean "this deck genuinely works" OR
        // "two elite pilots got lucky." We can't distinguish from
        // data alone, so damp the boost when last-major D1 < 20.
        // pilotPool counts max D1 across the deck's recent labs samples;
        // damp factor falls from 1.0 at pool ≥ 20 to 0.5 at pool ≤ 5,
        // applied as a multiplier on the boost-delta-from-1.0 so a
        // 1.40 boost on a 5-pilot deck becomes (1 + 0.40 × 0.5) = 1.20.
        // Skips when no last-major data exists (early format).
        const lm = _lastMajorByDeck[k];
        const pilotPool = lm && typeof lm.day1Players === 'number' ? lm.day1Players : 0;
        if (pilotPool > 0 && pilotPool < 20) {
          const pilotDamp = _clip(pilotPool / 20, 0.5, 1.0);
          const before = day2Boost;
          day2Boost = 1.0 + (day2Boost - 1.0) * pilotDamp;
          d.pilotSkillDamped = {
            pilotPool,
            before: Math.round(before * 100) / 100,
            after:  Math.round(day2Boost * 100) / 100,
          };
        }
      }
      d.day2ConvAvg = _deckDay2Conv > 0 ? Math.round(_deckDay2Conv * 1000) / 10 : null; // % with 1 decimal
      d.day2ConvFieldMean = _meanDay2Conv > 0 ? Math.round(_meanDay2Conv * 1000) / 10 : null;
      d.day2Boost = Math.round(day2Boost * 100) / 100;

      // TG share for this deck (canonical lookup, normalised %).
      const rawTgShare = _findByNormalized(_tgFieldShares, d.name) || 0;
      const tgPct      = tgLoaded ? (rawTgShare / tgTotal) * 100 : 0;

      // City League shares for this deck (canonical lookup, normalised %).
      const clCurEntry = _clCurrentByDeck[k];
      const clPastEntry = _clPastByDeck[k];
      const clCurPct  = clCurEntry  ? (clCurEntry.share  / clCurrentTotal) * 100 : 0;
      const clPastPct = clPastEntry ? (clPastEntry.share / clPastTotal)    * 100 : 0;

      // History-baseline shares (Predictor 3.0). Renormalise so the unit
      // matches ladderPct (% of total online).
      const majSnap = _snapshotAtMajor[k];
      const wkSnap  = _snapshotWeekAgo[k];
      const majBaselinePct = majSnap ? (majSnap.share / totalSnapAtMajor) * 100 : 0;
      const wkBaselinePct  = wkSnap  ? (wkSnap.share  / totalSnapWeekAgo) * 100
                                     // Fallback: comparison.csv carries last-week's share inline.
                                     : Math.max(0, ladderPct - trendPct);
      const postMajorSignal = _trendSignal(ladderPct, majBaselinePct);

      // Predictor 5.0: prefer the recency-weighted multi-snapshot baseline
      // over the single week-ago point. Every available daily snapshot
      // contributes to the baseline, weighted by tournament age and
      // de-weighted × 0.10 for pre-rotation dates. Falls back to the
      // legacy week-ago baseline when the multi-snapshot store is empty
      // (fresh install / scraper hasn't run yet).
      const weightedBaselinePct = _computeWeightedBaseline(_allHistorySnapshots, _todayISO(), k);
      const weeklySignal = (weightedBaselinePct != null)
        ? _trendSignal(ladderPct, weightedBaselinePct)
        : _trendSignal(ladderPct, wkBaselinePct);

      // Labs cut-performance boost. Two signals, in priority order:
      //   (1) top8_conv_rate (Predictor 3.0 default) — when populated,
      //       use the field-mean-relative formula `conv / 0.25` clipped
      //       to [0.5, 2.0]. 0.25 is the natural cut rate for an 8-cut
      //       in a 32-deck top.
      //   (2) Day-1 → Day-2 share ratio (Predictor 4.4b fallback) —
      //       used when top8_conv_rate is missing/zero. d2_share /
      //       d1_share = 1.0 means a deck holds its representation in
      //       the cut; > 1 = overperformer (gains share in Day-2);
      //       < 1 = underperformer (drops share). Same [0.5, 2.0]
      //       range and same semantics, but anchored at 1.0 instead
      //       of 0.25 because the ratio is naturally normalised.
      // The fallback exists because the live labs scraper currently
      // does not populate top8_conv_rate (rows are 0 in the labs
      // CSV). Without the fallback, the labs term would lose its
      // quality amplification entirely, so we use the Day-1 → Day-2
      // share ratio to preserve a meaningful over/underperformance
      // signal until top8_conv_rate data becomes available.
      const convStats3 = _labsConvByDeck[k];
      const t8ConvAvg = (convStats3 && convStats3.n > 0) ? convStats3.sum / convStats3.n : 0;
      let labsT8Boost;
      if (t8ConvAvg > 0) {
        labsT8Boost = _clip(t8ConvAvg / 0.25, 0.5, 2.0);
      } else {
        const q = _labsQualityByDeck[k];
        labsT8Boost = (q && q.d1 > 0) ? _clip(q.d2 / q.d1, 0.5, 2.0) : 1.0;
      }

      // Predictors 4.0a + 4.5 — counter-meta boost (additive, capped pp).
      // Sits ON TOP of the weighted predictor signals; doesn't shift
      // them. 4.0a fires for fresh post-major surges, 4.5 fires for
      // chronic family-level concentration (Dragapult-style "always
      // ~30 % of the field"). Both channels write to the same `boost`
      // field so a deck that counters both kinds of threat gets the
      // sum (each subject to its own per-channel cap).
      const metaDynBoostPp = (_metaDynamicsByDeck[k] && _metaDynamicsByDeck[k].boost) || 0;

      // Predictor 4.2 — Ladder-Bias-Damper. Casual decks have high
      // ladder share but underperform competitively; competitive decks
      // are the opposite. Damp the LADDER term by each deck's own
      // top-8 conversion factor. Bounds tight (0.75..1.25) so this
      // is a nudge, not a steamroll. Convolution-aware: when the
      // deck has no conv data yet (top8Conv == 0) the damper is
      // exactly 1.0× (no effect), which preserves Predictor 3.0
      // behaviour for fresh decks.
      //
      // Predictor 5.4 — in Mode A, the top8Conv values come from
      // online tournaments only (same data stream as the ladder
      // share). Damping ladder by conv == damping a signal by itself,
      // which under-weights new decks that haven't had time to
      // accumulate online-tournament conv samples yet. Tighten the
      // bounds to (0.90..1.10) so the damper is only a soft nudge in
      // Mode A; keep the original (0.75..1.25) range in Mode B where
      // the conv signal is anchored against major-event data.
      const _dampLo = _predictorMode === 'B' ? PREDICTOR_4_2_LADDER_DAMP_LO : 0.90;
      const _dampHi = _predictorMode === 'B' ? PREDICTOR_4_2_LADDER_DAMP_HI : 1.10;
      const ladderDamp = top8Conv > 0
        ? _clip(top8Conv / meanConv, _dampLo, _dampHi)
        : 1.0;
      const ladderPctDamped = ladderPct * ladderDamp;

      // Predictor 4.4 — Variant-Family-Aware Labs Anchor. Replace the
      // raw variant labs share with: (family labs total) × (this
      // variant's share-of-family from current online ladder). Falls
      // back to the raw variant share when the family aggregate is
      // missing (e.g. solo deck, or family had zero online presence).
      const family = extractMainPokemon(d.name);
      const labsRow = _labsRowsByDeck[k];
      const rawVariantLabsPct = labsRow ? (labsRow.share / labsTotalShare) * 100 : 0;
      let labsPct;
      const famLabs   = _familyLabsTotal[family] || 0;
      const famOnline = _familyOnlineTotal[family] || 0;
      if (famLabs > 0 && famOnline > 0 && (d.ladderShare || 0) > 0) {
        const familyLabsPct = (famLabs / labsTotalShare) * 100;
        const variantWeight = d.ladderShare / famOnline;
        labsPct = familyLabsPct * variantWeight;
      } else {
        labsPct = rawVariantLabsPct;
      }

      let predicted;
      if (_predictorMode === 'B') {
        // Mode B (Predictor 3.0 + 4.2 + 4.4): labs majors authoritative
        // + conv-rate weighted, plus post-major and weekly trend signals
        // from the online ladder. Ladder term damped by 4.2; labs term
        // family-aware via 4.4.
        //
        // Baseline (no CL toggle):
        //   0.40 labs (4.4-redistributed) × t8_conv_boost
        //   0.20 brought
        //   0.15 ladder (4.2-damped)
        //   0.15 post-major-trend
        //   0.10 weekly-trend
        //   + meta-dynamics counter-boost (4.0a, capped pp, additive)
        //
        // 2026-06 (Phase 1 follow-up): CL toggles are now wired into
        // Mode B too. Previously the toggles were a silent no-op when
        // labs data was available — confusing UX since the toggle
        // buttons are visible regardless of mode. When the user
        // explicitly enables CL Past and/or CL Current, those signals
        // get mixed in alongside labs, with labs staying primary
        // (slightly reduced from 0.40 to 0.32-0.35). CL acts as a
        // supplementary "what is JP / the most recent locals are
        // playing" voice, not a replacement for labs.
        //
        // Why smaller CL weights than Mode-A toggle branches: in
        // Mode A, CL fills the in-person gap because labs is absent
        // — so it can carry 0.12-0.15. In Mode B, labs already
        // covers that gap; CL is a colour-tint on top, hence 0.08-
        // 0.12.
        if (clCurrentActive && clPastActive) {
          //   0.32 labs × t8_conv | 0.17 brought | 0.12 ladder |
          //   0.12 post-major | 0.08 weekly | 0.11 cl_cur | 0.08 cl_past
          predicted = 0.32 * labsPct * labsT8Boost
                    + 0.17 * broughtPct
                    + 0.12 * ladderPctDamped
                    + 0.12 * postMajorSignal
                    + 0.08 * weeklySignal
                    + 0.11 * clCurPct
                    + 0.08 * clPastPct
                    + metaDynBoostPp;
        } else if (clCurrentActive) {
          //   0.35 labs × t8_conv | 0.18 brought | 0.13 ladder |
          //   0.13 post-major | 0.09 weekly | 0.12 cl_current
          predicted = 0.35 * labsPct * labsT8Boost
                    + 0.18 * broughtPct
                    + 0.13 * ladderPctDamped
                    + 0.13 * postMajorSignal
                    + 0.09 * weeklySignal
                    + 0.12 * clCurPct
                    + metaDynBoostPp;
        } else if (clPastActive) {
          //   0.35 labs × t8_conv | 0.18 brought | 0.13 ladder |
          //   0.13 post-major | 0.09 weekly | 0.12 cl_past
          predicted = 0.35 * labsPct * labsT8Boost
                    + 0.18 * broughtPct
                    + 0.13 * ladderPctDamped
                    + 0.13 * postMajorSignal
                    + 0.09 * weeklySignal
                    + 0.12 * clPastPct
                    + metaDynBoostPp;
        } else {
          // Baseline Mode B — neither CL toggle on, original weights
          predicted = 0.40 * labsPct * labsT8Boost
                    + 0.20 * broughtPct
                    + 0.15 * ladderPctDamped
                    + 0.15 * postMajorSignal
                    + 0.10 * weeklySignal
                    + metaDynBoostPp;
        }
      } else if (tgLoaded) {
        // Mode A + Testing Group: TG quantities reflect the user's
        // expert prep insight from their group, so weight it heavily.
        // Other signals downscaled proportionally — sum stays 1.0.
        // CL toggles ignored here (TG already replaces 40% of formula).
        //   0.40 TG | 0.20 ladder | 0.20 brought | 0.10 top8 | 0.10 trend
        predicted = 0.40 * tgPct
                  + 0.20 * ladderPctDamped
                  + 0.20 * broughtPct
                  + 0.10 * top8Boost
                  + 0.10 * trendPct;
      } else if (clCurrentActive && clPastActive) {
        // Mode A + both CL sources.
        //   0.20 ladder | 0.40 brought | 0.10 top8 | 0.10 trend
        //   + 0.12 cl_current + 0.08 cl_past
        predicted = 0.20 * ladderPctDamped
                  + 0.40 * broughtPct
                  + 0.10 * top8Boost
                  + 0.10 * trendPct
                  + 0.12 * clCurPct
                  + 0.08 * clPastPct;
      } else if (clCurrentActive) {
        //   0.20 ladder | 0.45 brought | 0.10 top8 | 0.10 trend | 0.15 cl_current
        predicted = 0.20 * ladderPctDamped
                  + 0.45 * broughtPct
                  + 0.10 * top8Boost
                  + 0.10 * trendPct
                  + 0.15 * clCurPct;
      } else if (clPastActive) {
        //   0.20 ladder | 0.45 brought | 0.10 top8 | 0.10 trend | 0.15 cl_past
        predicted = 0.20 * ladderPctDamped
                  + 0.45 * broughtPct
                  + 0.10 * top8Boost
                  + 0.10 * trendPct
                  + 0.15 * clPastPct;
      } else {
        // Mode A baseline 3.2 (no TG, no explicit CL toggle, no labs).
        //
        // 2026-06 rebalance, second iteration after first generation
        // backtest against Turin Phase 1:
        //
        //   What Phase 1 (3.1) did right:
        //     Mega Greninja  9,1 % → 7,5 %  (still high, but trending right)
        //     Beedrill ex    5,1 % → 4,2 %  (similar)
        //     Recommendations swapped Diancie #1 → Crustle #1
        //     Dark-Horse caught Lillie's Clefairy ex
        //
        //   What Phase 1 (3.1) did wrong:
        //     Dragapult Family  34,1 % → 38,5 %  (Δ +4,4 pp WORSE)
        //
        //   Root cause of the Dragapult regression: the 0.08 clPast
        //   default-on term injected JP M4 share unprocessed. JP M4
        //   has the SAME Dragapult bias as the international meta —
        //   Dragapult Meowth 12,81 %, Dragapult Blaziken 4,05 %,
        //   Dragapult Dusknoir 3,60 %, Dragapult Dudunsparce 3,51 %.
        //   Sum: ~25 % JP-side Dragapult variants → 25 × 0.08 ≈ 2 pp
        //   extra boost to the Dragapult family on top of an already-
        //   over-called share.
        //
        //   And the decks the 3.1 clPast term was supposed to help
        //   (Festival Lead, Basic Box / Ogerpon Clefairy) are at
        //   1,12 % / 1,41 % in JP M4 — too small to lift them
        //   meaningfully even at 0.08 × share.
        //
        //   Lesson: JP M4 as raw-share continuity term ≠ free
        //   precision. JP's meta is anchored to the same Dragapult
        //   axis we are; using its share as an additive prior
        //   amplifies our own bias instead of correcting it.
        //   Festival Lead / Basic Box wins at Turin were regional /
        //   BO3 phenomena that JP didn't pioneer either.
        //
        // 3.2 changes:
        //   - clPast term REMOVED from baseline. Users who want
        //     JP CL data in the mix can still flip the CL Past toggle
        //     — Branch-5 at line ~3060 above still gives it 0.15
        //     weight as before. The toggle stays the explicit
        //     opt-in path it was designed to be.
        //   - 0.08 freed up by clPast removal: redistribute 0.03 to
        //     ladder (back closer to its historical weight) and 0.05
        //     to top8 (push T8 conv even harder as the dominant
        //     signal — that's what actually worked in 3.1).
        //
        // Final mix (sums to 1.00):
        //   0.30 ladder (4.2-damped)
        //   0.10 brought
        //   0.50 top8_boost (brought × conv-factor) — dominant signal
        //   0.10 weekly_trend
        //
        // weeklySignal already incorporates the share-vs-week-ago
        // dynamic; when no week-ago snapshot exists it falls back
        // to (ladder - trendPct) so the formula degrades gracefully
        // on first install.
        predicted = 0.30 * ladderPctDamped
                  + 0.10 * broughtPct
                  + 0.50 * top8Boost
                  + 0.10 * weeklySignal;
      }

      // ── Predictor 5.6 + 5.8 — Last-Meta-Continuity stages ──────
      // CRITICAL ordering note (2026-06-08):
      // These stages fire regardless of Mode A / Mode B because during
      // a set-addition rotation lag-window, production runs in Mode B
      // (the previous-format labs CSV still has rows that match the
      // active-set filter — labs.length > 0 → Mode B even though no
      // current-format major has been scraped yet). Earlier versions
      // had these stages inside the Mode A branch and silently no-op'd
      // for every Turin Phase 1 user. They MUST run outside the mode
      // switch so the floor / damper / stickiness logic applies
      // whichever predictor branch produced `predicted`.
      //
      // Gated by _lastMetaLabsByDeck (only populated when
      // set_addition_only=true) so true rotations stay no-op.

      // Predictor 5.8 application MOVED to post-everything block —
      // see end of _runPredictor() after Family-Cap. Reason: the
      // intermediate Floor / Family-Cap stages were overriding the
      // damp before it could affect the final UI. Damping post-
      // everything (with re-normalisation) is the only way to make
      // the stickiness signal stick.

      // Predictor 5.6 — Growth-Boosted Last-Meta Floor + Post-Floor
      // Decline-Damper. Backtest-driven redesign (2026-06-07).
      //
      // Floor uses lm.full × 0.70 × growth, where growth =
      //   min(1.80, lateShare/earlyShare) when ratio > 1.20, else 1.0.
      // Captures the "this archetype is gaining share at the end of
      // the previous format" pattern that the flat-floor missed
      // (Basic Box TEF-POR 1.86 → 3.46, Slowking 1.26 → 1.87,
      // Dragapult 10.67 → 19.80).
      //
      // Decline-damper (× 0.85 when ratio < 0.85) runs AFTER the
      // floor so over-floored declining decks land at the right
      // level. Production previously damped BEFORE the floor which
      // immediately undid it.
      const lastMetaEntry = _lastMetaLabsByDeck[k];
      if (lastMetaEntry && lastMetaEntry.share > 0) {
        // Step 1 — growth-boosted floor
        let growth = 1.0;
        const e = lastMetaEntry.earlyShare;
        const l = lastMetaEntry.lateShare;
        if (e > 0 && l > 0) {
          const ratio = l / e;
          if (ratio > PREDICTOR_5_6_GROWTH_THRESHOLD) {
            growth = Math.min(PREDICTOR_5_6_GROWTH_CAP, ratio);
          }
        }
        const floorPct = lastMetaEntry.share * PREDICTOR_5_5_FLOOR_FACTOR * growth;
        if (predicted < floorPct) {
          d.lastMetaLabsFloor = {
            prevShare: Math.round(lastMetaEntry.share * 100) / 100,
            floorPct:  Math.round(floorPct * 100) / 100,
            growth:    Math.round(growth * 100) / 100,
            liftPP:    Math.round((floorPct - predicted) * 100) / 100,
          };
          predicted = floorPct;
        }
        // Step 2 — post-floor decline damper
        if (e > 0 && l > 0) {
          const ratio = l / e;
          if (ratio < PREDICTOR_5_6_DECLINE_THRESHOLD) {
            d.declineDamper = {
              earlyShare: Math.round(e * 100) / 100,
              lateShare:  Math.round(l * 100) / 100,
              ratio:      Math.round(ratio * 100) / 100,
              factor:     PREDICTOR_5_6_DECLINE_DAMPER,
              prePP:      Math.round(predicted * 100) / 100,
            };
            predicted *= PREDICTOR_5_6_DECLINE_DAMPER;
          }
        }
      }
      // Predictor 5.1 — apply the Day-2 conversion quality multiplier.
      // Fires across all modes (A / B / mixed) so the signal lifts
      // structurally-strong decks regardless of which data source
      // dominates the base formula. day2Boost = 1.0 when no labs data
      // is available, so this is a no-op early in the format.
      predicted *= day2Boost;

      // Online-Hype-Damper (Predictor 5.2) — when a deck's current
      // ladder share runs ahead of its most-recent brought-share at a
      // major by ≥ 25 %, treat the gap as online hype rather than
      // real adoption and damp the prediction. At LA, this would have
      // pulled Pure Dragapult (online 17.5 % vs Prag brought 13.75 %,
      // ratio 1.27) and Crustle (online 4.1 % vs Prag brought 3.15 %,
      // ratio 1.30) ≈ 25 % lower — closer to actuals (10.3 % / 0.8 %).
      //
      // Predictor 5.4 — Hype-Damper requires a real major-data anchor.
      // In Mode A (no current-format majors), "brought share" comes
      // from online tournaments only, which are themselves driven by
      // the same ladder hype. Comparing ladder against an online-only
      // brought share is comparing online to online — there's no
      // counter-signal to validate the "this is hype" claim. The
      // damper was killing legitimately new decks like Mega Greninja
      // at the CRI rotation: 8.23 % ladder vs 2.4 % online-brought
      // (deck was 4 days old) → ratio 3.43 → 25 % cut → ~1.85 %
      // predicted → dropped out of Top 25 entirely. Skip the damper
      // in Mode A; reactivate as soon as labs major data lands.
      const HYPE_DAMPER_RATIO_MIN  = 1.25;
      const HYPE_DAMPER_FACTOR     = 0.75;
      if (_predictorMode === 'B'
          && broughtPct > 0
          && ladderPct > broughtPct * HYPE_DAMPER_RATIO_MIN) {
        d.hypeDamperApplied = true;
        predicted *= HYPE_DAMPER_FACTOR;
      }

      // Predictor 5.4 — Day-2 share-growth boost.
      // Captures the absolute-PP-gained signal that day2Boost (a
      // ratio) underweights. Adds an additive PP on top of the
      // multiplicatively-scaled `predicted`, capped at 1.5 pp so a
      // fluky single-major Δ can't dominate.
      const growthAgg = _labsShareGrowthByDeck[k];
      d.day2GrowthPP = null;
      if (growthAgg && growthAgg.n > 0) {
        const avgGrowthPP = growthAgg.sum / growthAgg.n;
        d.day2GrowthPP = Math.round(avgGrowthPP * 100) / 100;
        if (avgGrowthPP >= PREDICTOR_5_4_MIN_GROWTH_PP) {
          const bonus = Math.min(
            PREDICTOR_5_4_BOOST_PP_MAX,
            avgGrowthPP * PREDICTOR_5_4_BOOST_PER_PP
          );
          d.day2GrowthBoostPP = Math.round(bonus * 100) / 100;
          predicted += bonus;
        }
      }

      // Predictor 4.6 — Underdog-Champion-Boost.
      // Recent regional win at <4 % usage in a 500+ player event
      // forecasts a share spike at the next comparable event. Boost
      // decays linearly between FULL_DECAY_DAYS and ZERO_DECAY_DAYS
      // so a fresh win lands the cap, a 3-week-old win gets a sliver,
      // a month+ old win contributes zero.
      const champ = _underdogChampionByDeck[k];
      d.underdogChampion = null;
      if (champ && champ.date) {
        const todayISO = _todayISO();
        const ageDays = Math.max(
          0,
          Math.round((new Date(todayISO) - new Date(champ.date)) / 86400000)
        );
        let freshness = 0;
        if (ageDays <= PREDICTOR_4_6_FULL_DECAY_DAYS) {
          freshness = 1.0;
        } else if (ageDays < PREDICTOR_4_6_ZERO_DECAY_DAYS) {
          freshness = 1.0 - (ageDays - PREDICTOR_4_6_FULL_DECAY_DAYS) /
                      (PREDICTOR_4_6_ZERO_DECAY_DAYS - PREDICTOR_4_6_FULL_DECAY_DAYS);
        }
        // Underdog strength scales with how far BELOW the underdog
        // ceiling the deck sat — winning at 1 % usage is a bigger
        // signal than winning at 3.9 %.
        const underdogStrength = Math.max(
          0,
          (PREDICTOR_4_6_MAX_SHARE_PCT - champ.share) / PREDICTOR_4_6_MAX_SHARE_PCT
        );
        const rawBonus = PREDICTOR_4_6_BOOST_PP_MAX * freshness * underdogStrength;
        // 2026-06-08 — presence-cap added after the Turin/Hop's Trevenant
        // over-call: HT won Turin at 0.44 % share, underdogStrength
        // calculated 0.89 → rawBonus 2.22 pp → after renorm + 4.7
        // → predicted 7.7 % vs real Turin 0.44 %.
        //
        // Root cause: a sub-1 % deck winning ONE regional is a single
        // data point. Without confirming online presence, that boost
        // is just noise amplified across renorm. Cap the boost at the
        // deck's CURRENT online + brought signal — if the field isn't
        // taking notice (ladder still <1 %), the champion-win signal
        // doesn't get to lift the prediction past where the field
        // already is.
        //
        // For decks with strong existing presence (Slowking 5.29 %
        // ladder, Crustle 1.50 %), the cap doesn't bind and the full
        // bonus applies.
        const ladderShare = d.ladderShare || 0;
        const broughtShare = d.broughtShare || 0;
        const presenceCap = Math.max(ladderShare, broughtShare);
        const bonus = Math.min(rawBonus, presenceCap);
        if (bonus > 0.01) {
          d.underdogChampion = {
            event:      champ.eventName,
            shareAtWin: Math.round(champ.share * 100) / 100,
            ageDays,
            boostPP:    Math.round(bonus * 100) / 100,
            rawBoostPP: Math.round(rawBonus * 100) / 100,
            presenceCap: Math.round(presenceCap * 100) / 100,
          };
          predicted += bonus;
        }
      }

      // Predictor 4.7 — Online-Tournament-Win Signal.
      // Companion to P4.6 but for online tournament place-1 finishes.
      // Smaller cap (1.0 pp vs 2.5), tighter freshness window (7/21 vs
      // 14/28), wider underrated ceiling (5 % vs 4 %) — online events
      // are more frequent and lower stakes per pilot than regionals.
      const onlineWin = _onlineWinsByDeck[k];
      d.onlineWin = null;
      const currentOnlineShare = d.onlineShare || 0;
      if (onlineWin && currentOnlineShare < PREDICTOR_4_7_MAX_SHARE_PCT) {
        const todayISO = _todayISO();
        const ageDays = Math.max(
          0,
          Math.round((new Date(todayISO) - new Date(onlineWin.date)) / 86400000)
        );
        let freshness = 0;
        if (ageDays <= PREDICTOR_4_7_FULL_DECAY_DAYS) {
          freshness = 1.0;
        } else if (ageDays < PREDICTOR_4_7_ZERO_DECAY_DAYS) {
          freshness = 1.0 - (ageDays - PREDICTOR_4_7_FULL_DECAY_DAYS) /
                      (PREDICTOR_4_7_ZERO_DECAY_DAYS - PREDICTOR_4_7_FULL_DECAY_DAYS);
        }
        const underrated = Math.max(
          0,
          (PREDICTOR_4_7_MAX_SHARE_PCT - currentOnlineShare) / PREDICTOR_4_7_MAX_SHARE_PCT
        );
        // Bigger tournaments produce stronger signal — scale by
        // sqrt(players/MIN_PLAYERS) capped at 2x. 150-player event
        // = 1.0×, 600-player event = 2.0× the base strength.
        const sizeMult = Math.min(2.0, Math.sqrt((onlineWin.players || 0) / PREDICTOR_4_7_MIN_PLAYERS));
        const bonus = PREDICTOR_4_7_BOOST_PP_MAX * freshness * underrated * sizeMult * 0.5;
        if (bonus > 0.01) {
          d.onlineWin = {
            ageDays,
            players: onlineWin.players,
            boostPP: Math.round(bonus * 100) / 100,
          };
          predicted += bonus;
        }
      }

      d.predictedShareRaw = Math.max(0, predicted);

      // Predictor 5.0 — surface the per-deck ACE-SPEC split for the
      // top-N output. Empty when the dated CSV doesn't have the
      // archetype yet (newly-rotated decks, freshly-released sets).
      const variantsForDeck = _aceSpecVariantsByDeck[k];
      d.aceSpecVariants = (Array.isArray(variantsForDeck) && variantsForDeck.length > 0)
        ? variantsForDeck.slice(0, 3)  // top 3 variants is enough for the modal
        : [];
      d.weightedBaselinePct = (typeof weightedBaselinePct === 'number') ? weightedBaselinePct : null;
    });

    // Predictor 6.0 — Tier-1 Convergence Detector, family scaling pass.
    // The detector's signal lives at FAMILY level (Σ variants of one
    // archetype) — see the constants block + pre-pass aggregation
    // above. We now scale each variant's predictedShareRaw uniformly
    // within its family so the family total moves toward
    // (1 − BLEND_WEIGHT) × current + BLEND_WEIGHT × convProjection,
    // preserving the within-family variant split.
    //
    // Doing this AFTER the main per-variant loop has two advantages:
    //   • we can sum the current family-predicted total in one pass
    //     instead of estimating it inside the variant loop
    //   • variant splits stay determined by the existing 6-signal
    //     blend, not by the last-major distribution alone
    if (_shareList && _shareList.length > 0 && _meanDay2Conv > 0) {
      const famAggCurrent = Object.create(null);   // famKey → Σ predictedShareRaw
      _shareList.forEach(d => {
        const fk = d._tier1FamKey;
        if (!fk) return;
        famAggCurrent[fk] = (famAggCurrent[fk] || 0) + (d.predictedShareRaw || 0);
      });

      const famTier1Result = Object.create(null);  // famKey → { fromTotal, toTotal, … }
      for (const famKey of Object.keys(_famLastMajorAgg)) {
        const famLad = _famLadderAgg[famKey] || 0;
        const famLm  = _famLastMajorAgg[famKey];
        const fromTotal = famAggCurrent[famKey] || 0;
        if (!famLm
            || famLad < TIER1_CONVERGENCE_THRESHOLD
            || famLm.day1Players < TIER1_MIN_DAY1_PILOTS
            || famLm.conv <= 0
            || famLm.conv < _meanDay2Conv * TIER1_CONV_EXCESS_RATIO
            || fromTotal <= 0) {
          continue;
        }
        const convMult         = 1 + TIER1_CONV_DAMPING * (famLm.conv / _meanDay2Conv - 1);
        const famConvProjection = famLm.share * convMult;
        const toTotal           = fromTotal * (1 - TIER1_BLEND_WEIGHT)
                                + famConvProjection * TIER1_BLEND_WEIGHT;
        const scale             = toTotal / fromTotal;
        famTier1Result[famKey]  = {
          familyLadderPct:    famLad,
          familyLmShare:      famLm.share,
          familyLmConv:       famLm.conv,
          familyLmDay1:       famLm.day1Players,
          fieldConvBaseline:  _meanDay2Conv,
          convExcessRatio:    famLm.conv / _meanDay2Conv,
          convMult,
          famConvProjection,
          fromTotal,
          toTotal,
          scale,
        };
      }

      _shareList.forEach(d => {
        const fk = d._tier1FamKey;
        const result = fk ? famTier1Result[fk] : null;
        if (result) {
          d.predictedShareRaw = Math.max(0, (d.predictedShareRaw || 0) * result.scale);
          d._tier1Eligible    = true;
          d._tier1Diag        = result;
          // Convenience field for tooling — the family-level convergence
          // projection isn't directly displayed but is useful for the
          // per-deck inspector tile.
          d._tier1ConvProjection = result.famConvProjection;
        } else {
          d._tier1Eligible       = false;
          d._tier1Diag           = null;
          d._tier1ConvProjection = null;
        }
      });
    }

    // Concentration boost — Predictor 5.2: dynamic exponent.
    // The flat ^1.50 amplifies the family-leader too hard: at LA the
    // dominant deck (Pure Dragapult, raw ~6.7 %) blew up to 17.45 %
    // predicted vs 10.28 % actual (+7.2 pp), while sub-variants
    // (Dudunsparce) underestimated by -2.9 pp. Softening the exponent
    // for high-input-share decks redistributes within-family weight
    // toward the underweighted variants without changing low-share
    // behaviour. exp(0..5%) = 1.50, exp(5..10%) decays linearly to
    // 1.10, exp(10%+) = 1.10. Sub-3% decks keep full bandwagon boost.
    const CONCENTRATION_EXP_BASE = 1.50;
    const CONCENTRATION_EXP_MIN  = 1.10;
    const CONCENTRATION_SOFT_LO  = 5.0;   // below this: full boost
    const CONCENTRATION_SOFT_HI  = 10.0;  // at/above: minimum boost
    // Past Meta — skip the concentration boost entirely. The boost
    // exists to bridge "online ladder under-counts dominant decks
    // because casual players spread thin" → that gap doesn't exist
    // in past-meta major data, which IS the ground truth: 738
    // Dragapult players is 738, not "really 1100 once concentration
    // is applied". With the boost the family-leader inflates from
    // its real ~29.8 % share to ~40 % after renormalisation — a
    // distortion the user spotted instantly.
    const _skipConcentration = (_metaSource === 'past');
    _shareList.forEach(d => {
      const raw = d.predictedShareRaw || 0;
      if (_skipConcentration) {
        d.concentrationExp = 1.00;
        d.predictedShareRaw = raw;
        return;
      }
      let exp = CONCENTRATION_EXP_BASE;
      if (raw > CONCENTRATION_SOFT_LO) {
        const t = Math.min(1, (raw - CONCENTRATION_SOFT_LO) /
                              (CONCENTRATION_SOFT_HI - CONCENTRATION_SOFT_LO));
        exp = CONCENTRATION_EXP_BASE - (CONCENTRATION_EXP_BASE - CONCENTRATION_EXP_MIN) * t;
      }
      d.concentrationExp   = Math.round(exp * 100) / 100;
      d.predictedShareRaw  = Math.pow(raw, exp);
    });

    // Quality-Floor (Predictor 5.2) — Coverage fix for high-conv
    // underdogs. LA showed Lopunny Dudunsparce (Prag 3 D1 / 33.3 %
    // conv) jump to 53 D1 / 18.9 % conv. Decks that VASTLY out-
    // perform field-mean at the last major signal real strength,
    // not statistical noise, even at tiny brought-share — but the
    // predictor wrote them off entirely because their ladder/labs
    // signals stayed sub-noise. Floor scales with the conv ratio
    // and caps at 2 % so a freak outlier can't hijack the field.
    const QUALITY_FLOOR_RATIO_MIN  = 1.5;   // ≥ 1.5× field-mean conv
    const QUALITY_FLOOR_MAX_PCT    = 2.0;   // hard cap on the floor
    const QUALITY_FLOOR_MIN_N      = 1;     // works from 1 major of data
    if (_meanDay2Conv > 0) {
      _shareList.forEach(d => {
        const k = normalize(d.name);
        const q = _labsDay2ConvByDeck[k];
        if (!q || q.n < QUALITY_FLOOR_MIN_N) return;
        const deckConv = _rankWeightedConv(q);
        const ratio    = deckConv / _meanDay2Conv;
        if (ratio < QUALITY_FLOOR_RATIO_MIN) return;
        // Floor pct rises linearly from 0.5 % at ratio 1.5 to 2.0 % at
        // ratio 3.0; clipped at the max. Boosted in the same ^exp space
        // so it competes with concentration-boosted shares on equal terms.
        const floorPct = Math.min(QUALITY_FLOOR_MAX_PCT, (ratio - 1.0));
        const floorRaw = Math.pow(floorPct, d.concentrationExp || 1.50);
        if (d.predictedShareRaw < floorRaw) {
          d.qualityFloorApplied = floorPct;
          d.predictedShareRaw   = floorRaw;
        }
      });
    }

    // Predictor 4.6 — Counter-Field Suppression. Reduce dominant
    // family's predicted share (operates on post-amplification raw).
    // Order matters: runs AFTER 5.2 concentration boost so we trim
    // the amplified value, not the pre-boost one. Combined with 4.5
    // boosting counters, the renormalisation step naturally shifts
    // share from the dominant family INTO the counters.
    //
    // Gated by _metaCallMode: 'standard' (default) skips 4.6 + 4.7
    // entirely. 'counter' runs both at the strength tuned for the
    // Utrecht counter-meta case.
    try {
      const majorId = _lastMajorInfo && _lastMajorInfo.id;
      // Key by (major + mode) so toggling the mode within the same
      // major still emits a fresh log line — useful for debugging the
      // delta between Standard and Counter on the same field.
      const logKey = majorId ? `${majorId}:${_metaCallMode}` : '';
      if (logKey && _metaCallModeLastLogKey !== logKey) {
        _metaCallModeLastLogKey = logKey;
        console.log(`[Meta Call Mode] ${_metaCallMode === 'counter'
          ? 'counter — 4.6 family suppression + 4.7 adoption boost ACTIVE'
          : 'standard — online ladder respected, 4.6 + 4.7 OFF'}`);
      }
    } catch (_e) { /* dev log only */ }
    _computeFieldSuppression();

    // Predictor 4.7 — Counter-Adoption Boost. Catches decks 4.5
    // missed (matchup WR < 50 %) but which the labs brought-share
    // shows are being adopted as counters anyway. Runs after 4.6
    // so the boost lands on post-suppression raw values; renorm
    // step then redistributes the freed share from the dominant
    // family into these adopted counters.
    _computeCounterAdoptionBoost();

    // Predictor 5.6 — Format-Leader Within-Family Consolidation
    // and 5.7 — Anti-Leader Tech-Boost. Both target the
    // "Indianapolis pattern": as the format matures, the dominant
    // multi-variant family consolidates onto its lead variant
    // (Dragapult family: pure Dragapult went 35 % within-family
    // → 62 % within-family at Indy) and the player base brings
    // hard counters in anticipation (Hydrapple, Mega Lucario,
    // Basic Box all underpredicted by 1.5–3.5 pp at Indy because
    // the online ladder didn't reflect this anti-Dragapult tech
    // wave). 5.6 runs first so the leader's predicted share
    // reflects consolidation; 5.7 then reads that updated share
    // when deciding whether the leader threshold is breached.
    // Predictor 5.6 — Format-Leader Consolidation: DISABLED 2026-06-08.
    // Replaced by the post-renorm within-family donation block below
    // (search "Within-family donation"). The old consolidation logic
    // was double-stacking with the new donation in the Turin abgleich:
    //   Production pre-fix had Dragapult solo at 73 % within-family
    //   (20.4 / 28.0) vs real Turin 46 % (13.29 / 28.99). The old
    //   stage pushed solo to ~60 % within-family, the new donation
    //   then pushed it to 73 %, ending +7 pp over.
    // Anti-Leader Tech-Boost (5.7) stays — that addresses counter-deck
    // discovery which the new code path does NOT replicate.
    // _computeFormatLeaderConsolidation();
    _computeAntiLeaderTechBoost();

    // Predictor 5.5 — Online-Presence Floor. Final safety floor for
    // decks with verified online + labs presence that the dampers
    // crushed too hard (Lucario Hariyama: 5.52 % online, 1.5 %
    // predicted pre-floor). Runs last so it can override the
    // suppression for any deck that's both a counter target and
    // an actually-popular online deck (rare but possible).
    _computeOnlinePresenceFloor();

    // Diagnostic — surfaces matchup-coverage gaps once per major.
    _logCounterCoverageGaps();

    // Renormalise predicted shares to sum 100% so the field-composition
    // budget logic works unchanged.
    const predictedSum = _shareList.reduce((s, d) => s + (d.predictedShareRaw || 0), 0) || 1;
    _shareList.forEach(d => {
      d.predictedShare = (d.predictedShareRaw / predictedSum) * 100;
      d.onlineShare    = d.predictedShare; // legacy field name used by buildField()
    });

    // Predictor 5.5.5 — Family-Aggregate Cap (post-renorm).
    // The TEF-POR → TEF-CRI Turin abgleich kept landing Dragapult
    // Family at 33-34 % while real Turin Phase 1 came in at 29 %.
    // Each variant prediction is roughly accurate vs its own TEF-POR
    // brought share (solo ~13, Dusknoir ~7, Blaziken ~6, Dudunsparce
    // ~5); the over-call lives at the AGGREGATE level — four small
    // individual over-predictions compound.
    //
    // Recent regional Dragapult-family shares (Indianapolis 29.3 %,
    // Utrecht 25.1 %, Prague 29.4 %, Campinas 32.9 %, LA 31.9 %,
    // Turin Phase 1 29 %) cluster around 29 % with a ceiling near 33.
    //
    // Hard cap on the family-aggregate post-renorm predictedShare.
    // When a multi-variant family exceeds FAMILY_CAP_PCT, scale every
    // member down to bring the aggregate to the cap, and redistribute
    // the freed pp proportionally to every other deck so the
    // share-list still sums to 100 %. Doing this AFTER the renorm
    // (rather than before) keeps the cap value an actual percentage
    // and avoids the raw-vs-pp unit mismatch that v1 of this hook
    // landed at — capping raw at 28 produced Dragapult at 22.8 %
    // because the raw sum was ~150, not 100.
    //
    // Only fires for families with ≥ 2 named variants (solo archetypes
    // pass through untouched, governed by their own predictor checks).
    const FAMILY_CAP_PCT = 28.0;
    const FAMILY_CAP_MIN_VARIANTS = 2;
    const familyAgg = {}; // family-key -> { total, members[] }
    _shareList.forEach(d => {
      const fam = extractMainPokemon(d.name);
      if (!fam || fam === '_junk') return;
      if (!familyAgg[fam]) familyAgg[fam] = { total: 0, members: [] };
      familyAgg[fam].total += d.predictedShare || 0;
      familyAgg[fam].members.push(d);
    });
    Object.keys(familyAgg).forEach(fam => {
      const f = familyAgg[fam];
      if (f.members.length < FAMILY_CAP_MIN_VARIANTS) return;
      // Predictor 6.0 cap-exemption: when the Tier-1 Convergence
      // Detector fires for a family, the famConvProjection is a
      // data-driven ceiling that explicitly anticipates the
      // consolidation the 28 % cap was calibrated AGAINST (Turin
      // landed at ~29 % family aggregate; the cap protected us from
      // over-calling). NAIC came in at 35.7 % and the cap clipped us
      // ~7 pp short. Use max(cap, projection) so the cap stays a floor
      // for normal cases but yields to the conv-weighted projection
      // when the detector signals consolidation.
      const tier1Member = f.members.find(m => m._tier1Eligible && m._tier1Diag);
      const effectiveCap = tier1Member
        ? Math.max(FAMILY_CAP_PCT, tier1Member._tier1Diag.famConvProjection || 0)
        : FAMILY_CAP_PCT;
      if (f.total <= effectiveCap) return;
      const familyScale  = effectiveCap / f.total;
      const reductionPP  = f.total - effectiveCap;
      const othersTotal  = 100 - f.total;
      // othersScale = (othersTotal + reductionPP) / othersTotal
      // Edge case: othersTotal == 0 (the only family on the list)
      // means there's nowhere to redistribute — skip in that case.
      if (othersTotal <= 0) return;
      const othersScale  = (othersTotal + reductionPP) / othersTotal;
      const famSet = new Set(f.members);
      f.members.forEach(d => {
        const before = d.predictedShare || 0;
        d.predictedShare = before * familyScale;
        d.onlineShare    = d.predictedShare;
        d.familyCap = {
          family:    fam,
          totalPP:   Math.round(f.total * 100) / 100,
          capPP:     Math.round(effectiveCap * 100) / 100,
          baseCapPP: FAMILY_CAP_PCT,
          tier1Lifted: effectiveCap > FAMILY_CAP_PCT,
          scale:     Math.round(familyScale * 1000) / 1000,
          beforePP:  Math.round(before * 100) / 100,
        };
      });
      _shareList.forEach(d => {
        if (famSet.has(d)) return;
        d.predictedShare = (d.predictedShare || 0) * othersScale;
        d.onlineShare    = d.predictedShare;
      });
      try {
        const capNote = effectiveCap > FAMILY_CAP_PCT
          ? `→ cap raised to ${effectiveCap.toFixed(2)} % by Predictor 6.0 Tier-1`
          : `> ${FAMILY_CAP_PCT} %`;
        console.log(
          `[Predictor 5.5.5] Family-cap: ${fam} ${f.total.toFixed(2)} % ` +
          `${capNote} → ${f.members.length} variants ×${familyScale.toFixed(3)}, ` +
          `others ×${othersScale.toFixed(3)}.`
        );
      } catch (_e) { /* ignore */ }
    });

    // Helper: lift `winnerSet` by `liftPP` total percentage points,
    // taking the cost preferentially from the LONG TAIL (decks below
    // LONG_TAIL_THRESHOLD_PCT). Returns `{ longTailScale, fallbackScale,
    // tookFromTail }` so the caller can log the redistribution shape.
    //
    // Algorithm:
    //   • Sum long-tail share (members of _shareList not in winnerSet
    //     with predictedShare < threshold).
    //   • Available = longTailTotal × (1 − RESERVE_FRAC).
    //   • If liftPP ≤ available: scale only long tail.
    //   • Else: take longTailTake = available from tail, the rest
    //     proportionally from the protected mid-tier band.
    //
    // The 30 % reserve keeps the tail from being crushed entirely —
    // it's where new / emerging archetypes live and must stay visible.
    function _liftFromLongTail(winnerSet, liftPP) {
      if (!(liftPP > 0)) return null;
      const tail = [];
      const protectedDecks = [];
      let tailTotal = 0, protectedTotal = 0;
      _shareList.forEach(d => {
        if (winnerSet.has(d)) return;
        const s = d.predictedShare || 0;
        if (s < LONG_TAIL_THRESHOLD_PCT) { tail.push(d); tailTotal += s; }
        else { protectedDecks.push(d); protectedTotal += s; }
      });
      if (tailTotal + protectedTotal <= 0) return null;

      const tailAvailable = tailTotal * (1 - LONG_TAIL_RESERVE_FRAC);
      let tailTake, protectedTake;
      if (liftPP <= tailAvailable) {
        tailTake = liftPP;
        protectedTake = 0;
      } else {
        tailTake = tailAvailable;
        protectedTake = liftPP - tailAvailable;
        if (protectedTake > protectedTotal) {
          // Pathological: the field can't actually afford the lift.
          // Bail out and let the caller fall back to plain
          // proportional redistribution.
          return null;
        }
      }
      const tailScale       = tailTotal > 0 ? (tailTotal - tailTake) / tailTotal : 1;
      const protectedScale  = protectedTotal > 0 ? (protectedTotal - protectedTake) / protectedTotal : 1;
      tail.forEach(d => {
        d.predictedShare = (d.predictedShare || 0) * tailScale;
        d.onlineShare    = d.predictedShare;
      });
      protectedDecks.forEach(d => {
        d.predictedShare = (d.predictedShare || 0) * protectedScale;
        d.onlineShare    = d.predictedShare;
      });
      return {
        tailTotal, tailTake, tailScale,
        protectedTotal, protectedTake, protectedScale,
      };
    }

    // Predictor 6.0 — Tier-1 Family Floor (post-renorm anchor).
    // The Tier-1 family scaling (above the concentration boost) only
    // moves the family raw share by ~+4 %. After concentration + renorm
    // that ends up as ~+0.8 pp on the displayed family total — far
    // less than the conv-weighted projection demanded. The cause: the
    // other decks' raw values don't shrink to make room, and 5.5.5's
    // cap was tuned as a CEILING, not an anchor.
    //
    // To honor the detector's projection, anchor the Tier-1 family at
    // a 50/50 blend between its current renormed total and its
    // famConvProjection (the conversion-weighted target). The cost
    // comes preferentially from the LONG TAIL (sub-2 % decks) — see
    // _liftFromLongTail above for the rationale: a 4 % mid-tier deck
    // shouldn't take the same relative hit as a 0.3 % niche deck.
    Object.keys(familyAgg).forEach(fam => {
      const f = familyAgg[fam];
      if (f.members.length < 2) return;
      const tier1Member = f.members.find(m => m._tier1Eligible && m._tier1Diag);
      if (!tier1Member) return;
      const projection = tier1Member._tier1Diag.famConvProjection || 0;
      if (projection <= 0) return;
      const currentTotal = f.members.reduce((s, d) => s + (d.predictedShare || 0), 0);
      const target       = currentTotal * (1 - TIER1_BLEND_WEIGHT)
                         + projection * TIER1_BLEND_WEIGHT;
      if (target <= currentTotal) return; // already at/above target
      const liftPP       = target - currentTotal;
      const memberScale  = target / currentTotal;
      const famSet       = new Set(f.members);

      const dist = _liftFromLongTail(famSet, liftPP);
      if (!dist) return; // unable to redistribute cleanly — skip the anchor

      f.members.forEach(d => {
        d.predictedShare = (d.predictedShare || 0) * memberScale;
        d.onlineShare    = d.predictedShare;
      });
      try {
        console.log(
          `[Predictor 6.0] Tier-1 floor: ${fam} ${currentTotal.toFixed(2)} % → ` +
          `${target.toFixed(2)} % (proj ${projection.toFixed(2)} %) — ` +
          `family ×${memberScale.toFixed(3)}; tail ×${dist.tailScale.toFixed(3)} (took ${dist.tailTake.toFixed(2)} pp), ` +
          `protected ×${dist.protectedScale.toFixed(3)} (took ${dist.protectedTake.toFixed(2)} pp).`
        );
      } catch (_e) { /* ignore */ }
      f.members.forEach(d => {
        if (d._tier1Diag) {
          d._tier1Diag.postRenormFromTotal = currentTotal;
          d._tier1Diag.postRenormToTotal   = target;
          d._tier1Diag.postRenormScale     = memberScale;
          d._tier1Diag.tailDistribution    = dist;
        }
      });
    });

    // Predictor 6.1 — Live-Share Floor.
    // Catches the Mega-Starmie pattern from the post-NAIC analysis:
    // labs data at the last major shows substantial brought-share
    // (Turin: Mega Starmie ex umbrella = 56 pilots / 2.76 % combined)
    // but our predictor lands at ~0.8 % per variant. The Limitless
    // variant-grouping ON view aggregates "Mega <X>" with "<X> <tech>"
    // under one archetype label — extractMainPokemon's first-word
    // heuristic splits them. data/deck_families.json carries the
    // curated overrides; _familyKeyForDeck consumes them.
    //
    // Gates (per family):
    //   • Σ lm.share across family members ≥ MIN_LM_SHARE
    //   • Σ lm.day1Players ≥ MIN_LM_PILOTS
    //   • Σ current predicted < Σ lm.share × DIVERGENCE
    //
    // Floor: Σ lm.share × SHRINKAGE, distributed across members in
    // proportion to their current predicted (preserves variant split).
    // 30 % shrinkage prevents recency-overfitting a deck that spiked
    // once. Cost comes from the long tail via _liftFromLongTail so
    // mid-tier predictions are protected (same policy as the Tier-1
    // floor above).
    const lsFams = Object.create(null);
    _shareList.forEach(d => {
      const k = normalize(d.name);
      const lm = _lastMajorByDeck[k];
      if (!lm || !(lm.share > 0)) return;
      const fk = _familyKeyForDeck(d.name);
      if (!lsFams[fk]) lsFams[fk] = { members: [], lmShare: 0, lmPilots: 0, currentTotal: 0 };
      const slot = lsFams[fk];
      slot.members.push(d);
      slot.lmShare      += lm.share;
      slot.lmPilots     += lm.day1Players || 0;
      slot.currentTotal += d.predictedShare || 0;
    });

    const liveFloorWinners = new Set();
    const liveFloorLog     = [];
    let   totalLiveLift    = 0;
    // Diagnostic for the user-invoked inspector — see _diag below.
    _lsFamsLastRun = lsFams;
    Object.entries(lsFams).forEach(([fk, slot]) => {
      if (slot.lmShare < LIVE_SHARE_FLOOR_MIN_LM_SHARE) return;
      if (slot.lmPilots < LIVE_SHARE_FLOOR_MIN_LM_PILOTS) return;
      if (slot.currentTotal >= slot.lmShare * LIVE_SHARE_FLOOR_DIVERGENCE) return;
      const floorTotal = slot.lmShare * LIVE_SHARE_FLOOR_SHRINKAGE;
      if (slot.currentTotal >= floorTotal) return;
      const lift = floorTotal - slot.currentTotal;
      totalLiveLift += lift;
      slot.members.forEach(m => liveFloorWinners.add(m));
      liveFloorLog.push({ key: fk, slot, floorTotal, lift });
    });
    if (totalLiveLift > 0) {
      const dist = _liftFromLongTail(liveFloorWinners, totalLiveLift);
      if (dist) {
        liveFloorLog.forEach(entry => {
          const scale = entry.floorTotal / entry.slot.currentTotal;
          entry.slot.members.forEach(d => {
            const before = d.predictedShare || 0;
            d.predictedShare = before * scale;
            d.onlineShare    = d.predictedShare;
            d._liveShareFloor = {
              familyKey:       entry.key,
              fromPct:         before,
              toPct:           d.predictedShare,
              familyLiftPP:    entry.lift,
              familyFromTotal: entry.slot.currentTotal,
              familyToTotal:   entry.floorTotal,
              lastMajorShareTotal:  entry.slot.lmShare,
              lastMajorPilotsTotal: entry.slot.lmPilots,
            };
          });
        });
        try {
          const names = liveFloorLog
            .map(e => `${e.key} ${e.slot.currentTotal.toFixed(2)}→${e.floorTotal.toFixed(2)}`)
            .join(', ');
          console.log(
            `[Predictor 6.1] Live-Share floor: ${liveFloorLog.length} families lifted ` +
            `(+${totalLiveLift.toFixed(2)} pp): ${names}; ` +
            `tail ×${dist.tailScale.toFixed(3)}, protected ×${dist.protectedScale.toFixed(3)}.`
          );
        } catch (_e) { /* ignore */ }
      }
    }

    // Predictor 5.6.1 — Within-family donation.
    // After the family-aggregate cap, the cap'd shares are split
    // proportionally across all variants. The Turin abgleich showed
    // this produces a too-flat within-family distribution — the lead
    // and #2 variants consolidate at majors more than the proportional
    // split predicts (real Turin: Dragapult solo 46 %, Dusknoir 34 %,
    // Blaziken 14 %, Dudunsparce 6 % within-family — predicted 40 / 19
    // / 19 / 19 with the bare cap).
    //
    // Move 15 % of every non-top-2 variant's share to the top-2 split
    // 60/40 (leader gets 60 %, #2 gets 40 %). Per-deck cleanup;
    // family aggregate unchanged.
    //
    // Backtest evidence: this single change cut MAE-top20 on Turin
    // from 1.17 (floor_then_damper alone) to 1.04 (consolidation).
    const WITHIN_FAMILY_DONATION_PCT = 0.15;
    const WITHIN_FAMILY_TOP_SPLIT    = 0.60;
    Object.keys(familyAgg).forEach(fam => {
      const f = familyAgg[fam];
      if (f.members.length < 2) return;
      // Sort by previous-format full share where available (TEF-POR
      // Dusknoir was 7.43 % vs Dudunsparce 6.47 % — a clear hierarchy
      // that the in-person field follows when the family-leader spikes).
      // Fall back to current predictedShare if previous-format data
      // missing (new family, true rotation, etc.).
      const sortKey = (m) => {
        const k = normalize(m.name);
        const lm = _lastMetaLabsByDeck[k];
        if (lm && lm.share > 0) return lm.share;
        return m.predictedShare || 0;
      };
      const sorted = f.members.slice().sort((a, b) => sortKey(b) - sortKey(a));
      const top2 = sorted.slice(0, 2);
      const rest = sorted.slice(2);
      if (rest.length === 0) return;
      let donation = 0;
      rest.forEach(d => {
        const give = (d.predictedShare || 0) * WITHIN_FAMILY_DONATION_PCT;
        donation += give;
        d.predictedShare = (d.predictedShare || 0) - give;
        d.onlineShare    = d.predictedShare;
      });
      if (top2.length === 2) {
        top2[0].predictedShare += donation * WITHIN_FAMILY_TOP_SPLIT;
        top2[0].onlineShare    = top2[0].predictedShare;
        top2[1].predictedShare += donation * (1 - WITHIN_FAMILY_TOP_SPLIT);
        top2[1].onlineShare    = top2[1].predictedShare;
      } else {
        top2[0].predictedShare += donation;
        top2[0].onlineShare    = top2[0].predictedShare;
      }
    });

    // ── Predictor 5.9 — Format-Migration-Boost (post-everything) ──
    // Decks that emerged or exploded between the POR snapshot and
    // the current CRI snapshot get an additive PP boost, gated by
    // win-rate so we don't lift "rising but losing" decks (Mega
    // Greninja 6.9 % current share but 44.75 % WR → wrFactor = 0,
    // no boost). The boost addresses the chronic under-call of
    // Slowking (POR 1.66 % → CRI 5.29 %, 52.2 % WR), Crustle (POR
    // marginal → CRI 1.63 % at 56.2 % WR), Honchkrow (POR 2.26 % →
    // CRI 2.85 %, 51.4 % WR) — the exact cluster the Turin abgleich
    // showed as Tier-2 in-person mainstays the predictor couldn't see.
    //
    // Applied BEFORE the 5.8 stickiness damp. The 5.8 re-renorm then
    // restores the 100 % sum, absorbing the boost-induced increase
    // proportionally from the non-damped pool.
    let migrationBoostFired = 0;
    if (Object.keys(_porSnapshotByDeck).length > 0 &&
        Object.keys(_curSnapshotByDeck).length > 0) {
      _shareList.forEach(d => {
        const k = normalize(d.name);
        const por = _porSnapshotByDeck[k];
        const cur = _curSnapshotByDeck[k];
        if (!cur || cur.share <= 0) return;
        // 2026-06-08 gate: a deck about to be stickiness-damped by 5.8
        // gets NO format-migration boost. The damp says "the field
        // tries this but doesn't bring it" — boosting on top would
        // fight 5.8 and end up over-pumping (OMH: damp ×0.7 + boost
        // +1 pp → 7.1 % vs real 5.61). Stickiness signal wins.
        const stickEntry = _stickinessByDeck[k];
        if (stickEntry && stickEntry.brought >= PREDICTOR_5_8_MIN_BROUGHT
            && stickEntry.sticky_pct < PREDICTOR_5_8_LOW_STICK) {
          return;
        }
        const porShare = por ? por.share : 0;
        const porWr    = por ? por.wr    : 0;
        const wr = cur.wr;
        const wrFactor = Math.max(0, Math.min(
          PREDICTOR_5_9_WR_FACTOR_MAX,
          (wr - PREDICTOR_5_9_WR_NEUTRAL) / PREDICTOR_5_9_WR_SLOPE
        ));
        let boost = 0;
        let kind = '';
        if (wrFactor > 0 &&
            porShare < PREDICTOR_5_9_NEW_POR_THRESHOLD &&
            cur.share >= PREDICTOR_5_9_NEW_CUR_MIN) {
          // NEW deck (didn't exist meaningfully in POR)
          boost = Math.min(PREDICTOR_5_9_NEW_BOOST_PP_MAX,
                           cur.share * PREDICTOR_5_9_NEW_BOOST_FACTOR) * wrFactor;
          kind = 'NEW';
        } else if (wrFactor > 0 &&
                   porShare >= PREDICTOR_5_9_NEW_POR_THRESHOLD &&
                   cur.share / porShare > PREDICTOR_5_9_RISING_RATIO_MIN) {
          // RISING deck (existed in POR but exploded in CRI)
          boost = Math.min(PREDICTOR_5_9_RISING_BOOST_PP_MAX,
                           (cur.share - porShare) * PREDICTOR_5_9_RISING_BOOST_FACT) * wrFactor;
          kind = 'RISING';
        } else if (porShare >= PREDICTOR_5_9_QC_MIN_POR_SHARE &&
                   cur.share < porShare &&
                   wr >= PREDICTOR_5_9_QC_MIN_WR &&
                   (wr - porWr) >= PREDICTOR_5_9_QC_MIN_WR_DELTA) {
          // QUALITY-CONCENTRATION (Crustle pattern): share shrunk but
          // WR jumped — committed pilots stayed, casual pilots left.
          // Flat boost (these are typically small decks where the
          // % scaling would over-correct).
          boost = PREDICTOR_5_9_QC_BOOST_PP;
          kind = 'QUALITY-CONC';
        }
        if (boost > 0.1) {
          d.formatMigrationBoost = {
            kind,
            porShare: Math.round(porShare * 100) / 100,
            curShare: Math.round(cur.share * 100) / 100,
            wr:       Math.round(wr * 100) / 100,
            wrFactor: Math.round(wrFactor * 100) / 100,
            boostPP:  Math.round(boost * 100) / 100,
            prePP:    Math.round((d.predictedShare || 0) * 100) / 100,
          };
          d.predictedShare = (d.predictedShare || 0) + boost;
          d.onlineShare    = d.predictedShare;
          migrationBoostFired++;
        }
      });
      try {
        if (migrationBoostFired > 0) {
          console.log(
            `[Predictor 5.9] Format-migration boost: ${migrationBoostFired} ` +
            `decks lifted by NEW/RISING + WR gate.`
          );
        }
      } catch (_e) { /* ignore */ }
    }

    // ── Predictor 5.8 — Player-Stickiness-Damper (post-everything) ──
    // Production-trace evidence (2026-06-08) showed the pre-floor
    // version was a no-op: 5.6 Floor lifted Lopunny / OMH / Cynthia
    // / Dragapult-Dudunsparce above their damped baseline (the floor
    // value × 0.7 growth boost is bigger than baseline × 0.85), and
    // Family-Cap "others × 1.087" boost then inflated them further
    // via redistribution. The stickiness signal was being thrown away.
    //
    // New strategy: damp the FINAL post-renorm / post-family-cap
    // predictedShare. Decks with very low previous-format stickiness
    // (< 1 % with ≥ 100 brought) get × 0.70, low (1-3 %) get × 0.85.
    // The freed share is redistributed proportionally to every other
    // deck so the share-list still sums to 100 %.
    //
    // Backtest expectation (Turin Final):
    //   OMH     9.18 % → 6.43 %  (real 5.61, Δ +0.82 vs +3.57 pre-fix)
    //   Lopunny 5.15 % → 4.38 %  (real 2.61, Δ +1.77 vs +2.54 pre-fix)
    //   Cynthia 3.20 % → 2.24 %  (real 2.61, Δ -0.37, near-perfect)
    //   Dragapult Dudunsparce 5.95 % → 4.17 %  (real 1.67, Δ +2.50
    //                                            vs +4.28 pre-fix)
    let stickinessDamped = false;
    _shareList.forEach(d => {
      const k = normalize(d.name);
      const stickEntry = _stickinessByDeck[k];
      if (!stickEntry || stickEntry.brought < PREDICTOR_5_8_MIN_BROUGHT) return;
      let dampFactor = 1.0;
      if (stickEntry.sticky_pct < PREDICTOR_5_8_VERY_LOW_STICK) {
        dampFactor = PREDICTOR_5_8_STRONG_DAMP;
      } else if (stickEntry.sticky_pct < PREDICTOR_5_8_LOW_STICK) {
        dampFactor = PREDICTOR_5_8_MILD_DAMP;
      }
      if (dampFactor < 1.0) {
        d.stickinessDamper = {
          brought:    stickEntry.brought,
          sticky_pct: Math.round(stickEntry.sticky_pct * 100) / 100,
          factor:     dampFactor,
          prePP:      Math.round((d.predictedShare || 0) * 100) / 100,
        };
        d.predictedShare = (d.predictedShare || 0) * dampFactor;
        d.onlineShare    = d.predictedShare;
        stickinessDamped = true;
      }
    });
    // Re-normalise so the list still sums to 100 % — but ONLY scale
    // the non-damped decks. Damped decks keep their reduced values
    // exactly. The freed share gets absorbed by every other deck
    // proportionally to their current share.
    //
    // Previous version scaled ALL decks (damped + non-damped) by the
    // same factor, which partially undid the damp: scale ×1.053 on
    // Lopunny damped to 4.38 → 4.61. The new scheme keeps Lopunny at
    // 4.38 and instead lifts Solo Dragapult / Raging Bolt / etc. by
    // a slightly larger factor that just absorbs the freed share.
    if (stickinessDamped) {
      const dampedTotal = _shareList
        .filter(d => d.stickinessDamper)
        .reduce((s, d) => s + (d.predictedShare || 0), 0);
      const nonDampedTotal = _shareList
        .filter(d => !d.stickinessDamper)
        .reduce((s, d) => s + (d.predictedShare || 0), 0);
      const targetForNonDamped = Math.max(0, 100 - dampedTotal);
      const scale = nonDampedTotal > 0 ? targetForNonDamped / nonDampedTotal : 1;
      _shareList.forEach(d => {
        if (!d.stickinessDamper) {
          d.predictedShare = (d.predictedShare || 0) * scale;
          d.onlineShare    = d.predictedShare;
        }
      });
      try {
        const damped = _shareList.filter(d => d.stickinessDamper).length;
        console.log(
          `[Predictor 5.8] Post-everything stickiness damp: ${damped} decks ` +
          `damped (sum ${dampedTotal.toFixed(2)} %), non-damped scale ` +
          `×${scale.toFixed(3)} (target ${targetForNonDamped.toFixed(2)} %).`
        );
      } catch (_e) { /* ignore */ }
    }

    _shareList.sort((a, b) => b.predictedShare - a.predictedShare);

    // Append run-log entry — Part 6 / system-learning groundwork. Captures
    // the top-5 predictions + mode + last-major anchor so we can later
    // diff against actual major outcomes once new labs data lands.
    _appendPredictorLogEntry();
  }

  function _appendPredictorLogEntry() {
    if (!_shareList) return;
    const top5 = _shareList.slice(0, 5).map(d => ({
      name      : d.name,
      predicted : Number(d.predictedShare.toFixed(2)),
    }));
    const entry = {
      timestamp     : new Date().toISOString(),
      mode          : _predictorMode,
      metaCallMode  : _metaCallMode,   // 'standard' (default) or 'counter' — gates 4.6 + 4.7
      lastMajorDate : _lastMajorDate || '',
      baselineDate  : _baselineSnapshotDate || '',
      topDecks      : top5,
    };
    try {
      const raw = localStorage.getItem(PREDICTOR_LOG_KEY);
      let log = [];
      if (raw) {
        try { log = JSON.parse(raw); if (!Array.isArray(log)) log = []; }
        catch (_) { log = []; }
      }
      log.push(entry);
      if (log.length > PREDICTOR_LOG_MAX) log = log.slice(-PREDICTOR_LOG_MAX);
      localStorage.setItem(PREDICTOR_LOG_KEY, JSON.stringify(log));
    } catch (_) { /* private mode / quota — log is nice-to-have */ }
    console.info('[MetaCall] predictor run', entry.mode,
      'top5:', top5.map(d => `${d.name}=${d.predicted}%`).join(', '));

    // Predictor 5.0 — verify the new multi-snapshot baseline + variant
    // pipeline is wired up. Reports how many distinct daily snapshots
    // contributed to the weighted baseline, and how many archetypes have
    // ACE-SPEC variant breakdowns available. Both should be > 0 in
    // production.
    if (_allHistorySnapshots && _allHistorySnapshots.size > 0) {
      const variantCount = Object.keys(_aceSpecVariantsByDeck).length;
      console.info(`[MetaCall] predictor 5.0 — ${_allHistorySnapshots.size} daily snapshots in baseline; ${variantCount} archetypes with ACE-SPEC variant breakdown`);
      const top3WithVariants = _shareList.slice(0, 3).filter(d => Array.isArray(d.aceSpecVariants) && d.aceSpecVariants.length > 0);
      if (top3WithVariants.length > 0) {
        console.info('[MetaCall] top-3 ACE-SPEC variants:',
          top3WithVariants.map(d => `${d.name}: ${d.aceSpecVariants.map(v => `${v.aceSpec}=${v.sharePct.toFixed(0)}%`).join(', ')}`).join(' | '));
      }
    }
    // Backtest summary — historical predicted-vs-actual bias per
    // archetype across the rolling ACCURACY_LOG_MAX major-tournament
    // history. Surfaces patterns like "Dragapult is consistently
    // underestimated by 12 pp across the last 4 majors" that a single-
    // major MAE can't catch. User-flagged via the LA-Regionals gap
    // (predicted 17 % vs actual 31.9 %).
    try {
      const summary = _historicalAccuracySummary();
      if (summary.perDeck.length > 0 && summary.history.length >= 2) {
        const top = summary.perDeck.slice(0, 5);
        const fmt = d => `${d.name} bias=${d.bias > 0 ? '+' : ''}${d.bias}pp (mae ${d.mae}, n=${d.samples})`;
        console.info(`[MetaCall] backtest — ${summary.history.length} majors logged, per-deck systematic bias:`, top.map(fmt).join(' | '));
      }
    } catch (_e) { /* tolerate */ }

    // Predictor 5.1 — Day-2 conversion boost summary. Surfaces the
    // top boosters (decks above field-mean conv) and laggards so a
    // user reviewing the prediction can sanity-check that
    // structurally strong but mid-share decks (Marnie's Grimmsnarl,
    // Gardevoir mirror) get their lift.
    const day2Field = _shareList.filter(d => Number.isFinite(d.day2Boost));
    if (day2Field.length > 0) {
      const boosters = day2Field.filter(d => d.day2Boost > 1.05).slice(0, 3);
      const laggards = day2Field.filter(d => d.day2Boost < 0.95).slice(0, 3);
      const fmt = (d) => `${d.name} ×${d.day2Boost.toFixed(2)} (Day-2 ${d.day2ConvAvg ?? '—'}% vs mean ${d.day2ConvFieldMean ?? '—'}%)`;
      if (boosters.length > 0) console.info('[MetaCall] predictor 5.1 — Day-2 boosters:', boosters.map(fmt).join(' | '));
      if (laggards.length > 0) console.info('[MetaCall] predictor 5.1 — Day-2 laggards:', laggards.map(fmt).join(' | '));
    }

    // Predictor 5.2 — telemetry for Concentration / Quality-Floor /
    // Hype-Damper application. Surfaces which decks were touched by
    // each new mechanism so the user can verify the fixes are firing
    // on the right targets in their current dataset.
    const damped = _shareList.filter(d => d.hypeDamperApplied);
    const floored = _shareList.filter(d => typeof d.qualityFloorApplied === 'number');
    const softExp = _shareList.filter(d => typeof d.concentrationExp === 'number' && d.concentrationExp < 1.49);
    if (damped.length) {
      console.info('[MetaCall] predictor 5.2 — Hype-Damper fired on:',
        damped.slice(0, 5).map(d => `${d.name} (×0.75)`).join(', '));
    }
    if (floored.length) {
      console.info('[MetaCall] predictor 5.2 — Quality-Floor applied to:',
        floored.slice(0, 5).map(d => `${d.name} (floor ${d.qualityFloorApplied.toFixed(2)}%)`).join(', '));
    }
    if (softExp.length) {
      console.info('[MetaCall] predictor 5.2 — Concentration-Exp softened for:',
        softExp.slice(0, 5).map(d => `${d.name} (^${d.concentrationExp.toFixed(2)})`).join(', '));
    }
    const pilotDamped = _shareList.filter(d => d.pilotSkillDamped);
    if (pilotDamped.length) {
      console.info('[MetaCall] predictor 5.3 — Pilot-Skill-Damper applied to:',
        pilotDamped.slice(0, 5).map(d => {
          const p = d.pilotSkillDamped;
          return `${d.name} (pool ${p.pilotPool}, ${p.before}× → ${p.after}×)`;
        }).join(', '));
    }
  }

  // Detect when a new major tournament has appeared (vs the last one we
  // saw on this device) and compute MAE between the prediction we made
  // 7-14 days before the major vs the actual share at the major. Updates
  // _lastAccuracyReport so the banner can surface it.
  function _checkAccuracyAgainstNewMajor(labsRowsByDeck) {
    if (!_lastMajorDate) return;
    let prevSeen = null;
    try { prevSeen = localStorage.getItem(LAST_KNOWN_MAJOR_KEY); } catch (_) { prevSeen = null; }
    // Persist the current latest so subsequent loads only fire the
    // accuracy check once per new major.
    try { localStorage.setItem(LAST_KNOWN_MAJOR_KEY, _lastMajorDate); } catch (_) { /* tolerate */ }

    if (!prevSeen || prevSeen >= _lastMajorDate) return;

    // Find a predictor log entry from 7-14 days before the new major.
    let log = [];
    try {
      const raw = localStorage.getItem(PREDICTOR_LOG_KEY);
      log = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(log)) log = [];
    } catch (_) { return; }
    const targetMin = _isoMinusDays(_lastMajorDate, 14);
    const targetMax = _isoMinusDays(_lastMajorDate, 7);
    const candidates = log.filter(e => {
      const ts = (e.timestamp || '').slice(0, 10);
      return ts >= targetMin && ts <= targetMax;
    });
    if (candidates.length === 0) return;
    // Use the most recent candidate (closest to the major).
    const baseline = candidates[candidates.length - 1];
    if (!baseline.topDecks || baseline.topDecks.length === 0) return;

    // Actual major share per deck — from labs rows on the major's date,
    // renormalised within the major (since one major = one event).
    const majorDecks = Object.values(labsRowsByDeck).map(d => ({ name: d.name, share: d.share }));
    const totalMajor = majorDecks.reduce((s, d) => s + d.share, 0) || 1;
    const actualByName = {};
    majorDecks.forEach(d => { actualByName[normalize(d.name)] = (d.share / totalMajor) * 100; });

    let sumAbs = 0, n = 0;
    const perDeck = [];
    baseline.topDecks.forEach(td => {
      const k = normalize(td.name);
      if (!(k in actualByName)) return;
      const diff = Math.abs((td.predicted || 0) - actualByName[k]);
      sumAbs += diff;
      n += 1;
      perDeck.push({ name: td.name, predicted: td.predicted, actual: Number(actualByName[k].toFixed(2)), diff: Number(diff.toFixed(2)) });
    });
    if (n === 0) return;
    const mae = Number((sumAbs / n).toFixed(2));
    _lastAccuracyReport = {
      mae,
      baselineDate : (baseline.timestamp || '').slice(0, 10),
      majorDate    : _lastMajorDate,
      decks        : perDeck,
    };
    console.info('[MetaCall] new-major accuracy check — MAE=%s pp across %d top decks (baseline %s vs major %s)',
      mae, n, _lastAccuracyReport.baselineDate, _lastMajorDate, perDeck);

    // Persist this report into the rolling accuracy history so the
    // backtest helper can surface systematic per-archetype biases
    // across multiple majors. Append at end, cap at ACCURACY_LOG_MAX.
    try {
      const rawLog = localStorage.getItem(ACCURACY_LOG_KEY);
      let history = rawLog ? JSON.parse(rawLog) : [];
      if (!Array.isArray(history)) history = [];
      // De-dup: skip if we already logged this major.
      if (!history.some(h => h.majorDate === _lastMajorDate)) {
        history.push(_lastAccuracyReport);
        if (history.length > ACCURACY_LOG_MAX) history = history.slice(-ACCURACY_LOG_MAX);
        localStorage.setItem(ACCURACY_LOG_KEY, JSON.stringify(history));
      }
    } catch (_e) { /* private mode / disabled storage — tolerate */ }
  }

  // Aggregated per-archetype bias across the persisted accuracy log.
  // For each deck appearing in ≥ 2 historical major reports, computes:
  //   bias = mean(actual − predicted)  (pp; positive = under-predicted,
  //                                     negative = over-predicted)
  //   mae  = mean(abs(actual − predicted))
  // Surfaced as a console.info on each predictor run + accessible via
  // window.metaCallAccuracyHistory() for an ad-hoc inspection.
  function _historicalAccuracySummary() {
    let history = [];
    try {
      const raw = localStorage.getItem(ACCURACY_LOG_KEY);
      history = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(history)) history = [];
    } catch (_e) { history = []; }
    const perDeck = new Map();
    for (const report of history) {
      if (!Array.isArray(report.decks)) continue;
      for (const d of report.decks) {
        if (!d || !d.name) continue;
        const k = normalize(d.name);
        let entry = perDeck.get(k);
        if (!entry) { entry = { name: d.name, samples: 0, sumDiff: 0, sumAbs: 0 }; perDeck.set(k, entry); }
        const diff = (d.actual || 0) - (d.predicted || 0);
        entry.samples += 1;
        entry.sumDiff += diff;
        entry.sumAbs  += Math.abs(diff);
      }
    }
    const out = [];
    for (const e of perDeck.values()) {
      if (e.samples < 2) continue; // single-major sample is noise
      out.push({
        name: e.name,
        samples: e.samples,
        bias: Number((e.sumDiff / e.samples).toFixed(2)),
        mae:  Number((e.sumAbs  / e.samples).toFixed(2)),
      });
    }
    out.sort((a, b) => Math.abs(b.bias) - Math.abs(a.bias));
    return { history, perDeck: out };
  }
  if (typeof window !== 'undefined') {
    window.metaCallAccuracyHistory = _historicalAccuracySummary;
  }

  // ── Data Loading ───────────────────────────────────────────
  // In-flight guard: when two callers race (e.g. app-init.js's
  // setTimeout(preload, 1500) background fire + a prerender's explicit
  // await preload()), they would BOTH enter loadData, the second one
  // would see _matchupMap + _shareList set partway through the first's
  // execution and early-return — but _majorMatchupMap is populated
  // LATE in the body, so the second caller's continuation runs
  // against a half-loaded state. Symptom: past-mode renders had
  // _majorMatchupMap[pastMeta] = undefined, every getBaseMatchup
  // returned the 50/50 fallback, and the recommendations column
  // collapsed to identical day2Prob across all 10 entries.
  // Sharing the promise serialises the two callers without forcing a
  // re-fetch on the second one.
  let _loadDataPromise = null;
  let _loadDataComplete = false;
  async function loadData() {
    if (_loadDataComplete) return true;
    if (_loadDataPromise) return _loadDataPromise;
    _loadDataPromise = _loadDataImpl().then((ok) => {
      if (ok) _loadDataComplete = true;
      return ok;
    }).finally(() => { _loadDataPromise = null; });
    return _loadDataPromise;
  }

  async function _loadDataImpl() {
    // ─────────────────────────────────────────────────────────────
    // TABLE OF CONTENTS (1,200-line function — navigation aid added
    // 2026-06-11 audit Punkt 3). Loads 9 data sources sequentially
    // into module-scoped state. Each block writes to its own caches
    // (no shared mutation between blocks), so the function is
    // structurally extractable — but every block reads helpers from
    // the surrounding closure (parseEU, normalize, parseCSV, etc.),
    // making the per-block extraction a non-trivial refactor.
    //
    //   §1  Limitless online decks (share + trend)            L4190
    //   §2  Online tournament top-8 stats                     L4229
    //   §3  format_window.json (rotation + lag_days)          L4257
    //   §4  Online share history manifest + sources           L4295
    //   §5  Player continuity (Predictor 5.8 stickiness)      L4341
    //   §6  Labs tournament decks (live WR per archetype)     L4397
    //   §7  Online matchup CSV (per-deck matchup matrix)      L5135
    //   §8  Labs matchup CSV (Major tournaments)              L5212
    //   §9  Online tournament winners (Predictor 5.6/5.7)     L5340
    //
    // Recommended split path (1 PR per source, low-risk):
    //   1. Move parseEU / normalize / parseCSV out of closure
    //      (already global after the 2026-06-10 helper migration —
    //      this step is mostly verifying nothing depends on the
    //      shadowed local versions).
    //   2. Extract each §X block to `_load<SourceName>()` returning
    //      a fresh object. Caller assigns to the module-scoped
    //      caches.
    //   3. Add per-loader unit tests using mocked fetch.
    //
    // Skipped for now (audit Punkt 3): the extraction without
    // screenshot diffing or strong integration tests is high-risk
    // for the heaviest predictor pipeline in the app. The TOC + the
    // helper-migration foundation (audit Punkt 1) clear the runway
    // for a per-source PR.
    // ─────────────────────────────────────────────────────────────

    // No early-return on partial state here — the outer loadData() owns
    // the "is it fully loaded" decision via _loadDataComplete. Leaving
    // the old `if (_matchupMap && _shareList) return true;` shortcut
    // would re-introduce the race we just fixed.

    // §1 — limitless_online_decks_comparison.csv → _trendMap + _shareList
    try {
      const shareResp = await fetch('data/limitless_online_decks_comparison.csv?t=' + Date.now());
      if (!shareResp.ok) throw new Error('share CSV not found');
      const shareRows = parseCSV(await shareResp.text(), ';');

      // Build the trend map (week-over-week share delta in pp) — used
      // by Predictor 2.0 as the 10% trend term.
      _trendMap = {};
      shareRows.forEach(r => {
        if (!r.deck_name) return;
        _trendMap[normalize(r.deck_name)] = parseEU(r.share_change || '0');
      });

      // Provisional list — gets refined by Predictor 2.0 below once
      // tournament + labs data is loaded. The predicted share replaces
      // `onlineShare` so the rest of the field-composition code stays
      // unchanged; the raw ladder share is kept on `ladderShare` for
      // the per-deck badge.
      _shareList = shareRows
        .filter(r => r.deck_name && !_isMetaBucketLabel(r.deck_name) && (r.new_share || r.old_share))
        .map(r => ({
          name          : r.deck_name,
          onlineShare   : parseEU(r.new_share || r.old_share || '0'),
          ladderShare   : parseEU(r.new_share || r.old_share || '0'),
          trend         : parseEU(r.share_change || '0'),
          // Capture cumulative online WR (Predictor 5.3 — per-variant
          // matchup overrides). The matchup CSV reflects online play
          // which over-rewards elite-pilot decks (Crustle 67% online vs
          // Dragapult, 43.3% at LA). _deckWRAdjustment below uses the
          // delta between this and labs WR to correct the simulator.
          onlineWinPct  : parseEU(r.new_winrate || r.old_winrate || '0'),
        }))
        .filter(d => d.onlineShare > 0)
        .sort((a, b) => b.onlineShare - a.onlineShare);

      // Online tournament top-8 stats (Stage-1 scraper output). Optional —
      // missing file means we run pure-ladder. Predictor 2.0 will then
      // simply fall back to the ladder share.
      _tournamentStats = {};
      try {
        const tournResp = await fetch('data/online_tournament_top8_decks.csv?t=' + Date.now());
        if (tournResp.ok) {
          const tournRows = parseCSV(await tournResp.text(), ';');
          const broughtSum = tournRows.reduce(
            (s, r) => s + parseEU(r.total_brought_weighted || '0'), 0
          ) || 1;
          tournRows.forEach(r => {
            if (!r.deck_name) return;
            const brought = parseEU(r.total_brought_weighted || '0');
            _tournamentStats[normalize(r.deck_name)] = {
              broughtShare: (brought / broughtSum) * 100,
              top8Conv    : parseEU(r.top8_conv_rate  || '0'),  // 0..1
              top16Conv   : parseEU(r.top16_conv_rate || '0'),
              top8Count   : parseEU(r.top8_count_weighted  || '0'),
              tournamentsSeen: parseInt(r.tournaments_seen || '0', 10),
              avgWrTop8   : parseEU(r.avg_winrate_in_top8 || '0'),
              sourceFormat: r.source_format || '',
            };
          });
        }
      } catch (_e) { /* optional source — tolerate missing */ }

      // Format window (Predictor 4.1). Optional — when present, drives
      // the labs filter + recency-weight below. Auto-generated by
      // backend/core/update_sets.py from sets_metadata.json + the
      // current_meta_analysis.set setting.
      _formatWindow = null;
      try {
        const fwResp = await fetch('data/format_window.json?t=' + Date.now());
        if (fwResp.ok) {
          const fw = await fwResp.json();
          if (fw && /^\d{4}-\d{2}-\d{2}$/.test(fw.in_person_legal_date || '')) {
            _formatWindow = fw;
          }
        }
      } catch (_e) { /* optional — no filter when missing */ }

      // Labs major-tournament data (Stage-1 scraper output). Optional —
      // presence flips Predictor 2.0 from Mode A to Mode B.
      _labsMajorRows = 0;
      _lastMajorDate = null;
      _labsConvByDeck = {};
      _labsQualityByDeck = {};
      _labsDay2ConvByDeck = {};
      _labsDay2WrByDeck = {};
      _labsShareGrowthByDeck = {};
      _underdogChampionByDeck = {};
      _lastMajorInfo = null;
      _lastMajorByDeck = {};
      _activeFormatLabsDecks  = new Set();
      _activeFormatTop15Decks = new Set();
      _majorSharesByDeck      = {};
      _lastMetaLabsByDeck     = {};
      _stickinessByDeck       = {};
      _porSnapshotByDeck      = {};
      _curSnapshotByDeck      = {};
      _activeInPersonSetCode  = '';
      _onlineWinsByDeck       = {};
      _dataLastScrapedAt      = '';

      // Predictor 5.9 — load POR-era and current online snapshots so
      // we can compute per-deck format-migration deltas. Snapshots
      // come from data/online_share_history/YYYY-MM-DD.csv. POR
      // snapshot = latest one strictly BEFORE set_release_date.
      // Current = the most recent snapshot.
      try {
        const manResp = await fetch('data/online_share_history/manifest.json?t=' + Date.now());
        if (manResp.ok) {
          const manifest = await manResp.json();
          const dates = manifest.dates || [];
          const releaseDate = (_formatWindow && _formatWindow.set_release_date) || '';
          const porDates = dates.filter(d => releaseDate && d < releaseDate);
          const porDate = porDates.length ? porDates[porDates.length - 1] : '';
          const curDate = dates.length ? dates[dates.length - 1] : '';

          const loadSnapshot = async (date, target) => {
            if (!date) return;
            try {
              const r = await fetch(`data/online_share_history/${date}.csv?t=` + Date.now());
              if (!r.ok) return;
              const text = await r.text();
              const rows = parseCSVQuoted(text, ';');
              rows.forEach(row => {
                const name = (row.deck_name || '').trim();
                const share = parseEU(row.share || '0');
                const wr = parseEU(row.winrate || '0');
                if (name && share > 0) {
                  target[normalize(name)] = { share, wr };
                }
              });
            } catch (_e) { /* ignore */ }
          };

          await Promise.all([
            loadSnapshot(porDate, _porSnapshotByDeck),
            loadSnapshot(curDate, _curSnapshotByDeck),
          ]);

          try {
            console.log(
              `[Predictor 5.9] Migration snapshots loaded: POR=${porDate} ` +
              `(${Object.keys(_porSnapshotByDeck).length} decks), ` +
              `CUR=${curDate} (${Object.keys(_curSnapshotByDeck).length} decks).`
            );
          } catch (_e) { /* ignore */ }
        }
      } catch (_e) { /* optional — no boost when missing */ }

      // Predictor 5.8 — load player_continuity.csv → per-deck
      // {brought, sticky_pct}. Optional CSV; predictor degrades to
      // "no damper" gracefully when the file is missing.
      try {
        const stickResp = await fetch('data/player_continuity.csv?t=' + Date.now());
        if (stickResp.ok) {
          const rows = parseCSVQuoted(await stickResp.text(), ',');
          const prev = (_formatWindow && _formatWindow.previous_format_key) || '';
          // Aggregate: per (player, archetype) → set of tournament_ids
          const seenByPair = {};
          const broughtByArch = {};
          rows.forEach(r => {
            if (!r) return;
            const player = (r.player_name || '').trim();
            const arch   = (r.deck_archetype || '').trim();
            const tid    = (r.tournament_id || '').trim();
            const meta   = (r.meta || '').trim().toUpperCase();
            if (!player || !arch || !tid) return;
            // Restrict to previous-format rows when format_window is set
            // (Turin uses TEF-POR continuity, not SVI-ASC etc.). If the
            // CSV row has no meta we still count it — labs is the source
            // of truth, missing meta is a scraper-side gap not relevant
            // to the signal.
            if (prev && meta && meta !== prev) return;
            const k = normalize(arch);
            const key = player + '|' + k;
            if (!seenByPair[key]) seenByPair[key] = new Set();
            seenByPair[key].add(tid);
            broughtByArch[k] = (broughtByArch[k] || 0) + 1;
          });
          const uniqueByArch = {};
          const repeatByArch = {};
          Object.keys(seenByPair).forEach(key => {
            const k = key.split('|', 2)[1];
            uniqueByArch[k] = (uniqueByArch[k] || 0) + 1;
            if (seenByPair[key].size >= 2) {
              repeatByArch[k] = (repeatByArch[k] || 0) + 1;
            }
          });
          Object.keys(broughtByArch).forEach(k => {
            const u = uniqueByArch[k] || 0;
            const r = repeatByArch[k] || 0;
            _stickinessByDeck[k] = {
              brought:    broughtByArch[k],
              unique:     u,
              repeat:     r,
              sticky_pct: u > 0 ? (r / u) * 100 : 0,
            };
          });
          try {
            const decks = Object.keys(_stickinessByDeck).length;
            console.log(
              `[Predictor 5.8] Player-stickiness loaded: ${decks} archetypes ` +
              `from previous-format (${prev || 'any'}) continuity data.`
            );
          } catch (_e) { /* ignore */ }
        }
      } catch (_e) { /* optional — no damper when missing */ }
      let labsRowsByDeck = {};
      try {
        const labsResp = await fetch('data/labs_tournament_decks.csv?t=' + Date.now());
        if (labsResp.ok) {
          // Labs CSV is comma-delimited with quoted fields (e.g. the
          // `pokemon` column wraps values like "dragapult, dusknoir").
          // The naive split-on-`;` we used before silently produced
          // 1-column rows — every field except the first ended up
          // empty, which is why the last-major card row never appeared.
          const labsRowsAll = parseCSVQuoted(await labsResp.text(), ',');

          // Helper: best-effort date for a labs row (tournament_date is
          // sometimes empty, fall back to the date portion of scraped_at).
          const _rowISO = (r) => {
            const td = (r.tournament_date || '').trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(td)) return td;
            const scr = (r.scraped_at || '').trim();
            const m = scr.match(/^(\d{4}-\d{2}-\d{2})/);
            return m ? m[1] : '';
          };

          // Predictor 4.1 — Format-Window filter. Drop tournaments that
          // pre-date the in-person legal date for the current format.
          // Keeps everything when no format_window is configured (back-compat).
          //
          // Predictor 4.5 — defence-in-depth format-suffix filter. The
          // date cutoff above is the primary mechanism, but a missing /
          // stale format_window.json would silently let prior-format
          // labs data bleed into the current-format prediction (the
          // exact bug that caused Mega Greninja to vanish from the
          // CRI-era field — Campinas/Utrecht TEF-POR rows were being
          // counted with 40 % weight). Now we ALSO check the labs row
          // `meta` column (e.g. "TEF-POR") against the current set: if
          // current_set is the trailing segment of meta, keep; else
          // drop. Both filters compose — a row must pass BOTH date and
          // format-suffix to be counted.
          const cutoffISO = (_formatWindow && _formatWindow.in_person_legal_date) || '';
          const currentSetCode = (_formatWindow && _formatWindow.current_set)
            ? String(_formatWindow.current_set).trim().toUpperCase()
            : '';

          // ── Lag-window bug fix (2026-06) ─────────────────────────
          // During the in-person lag window (today < in_person_legal_date),
          // `current_set` is already the NEXT rotation (e.g. CRI) but
          // every in-person tournament still uses the PREVIOUS rotation
          // (TEF-POR). The pre-fix filter required `meta` to end with
          // current_set AND date >= in_person_legal_date — both
          // conditions failed for legitimate TEF-POR rows, silently
          // dropping every labs row and disabling Phase α/β + every
          // predictor that consumes labs data. The bug shipped 2026-06
          // when CRI went online-legal but in-person events stayed on
          // TEF-POR.
          //
          // Fix: derive an `activeSetCode` that names the rotation
          // currently producing in-person tournament data. We pick the
          // newest tournament_date row in `labsRowsAll` and take its
          // meta-suffix. This is purely data-driven (no format_window
          // schema change), and converges to current_set once new
          // tournaments arrive (CRI events post-2026-06-05).
          let activeSetCode = currentSetCode;
          let activeMetaKey = '';
          let activeNewestDate = '';
          for (const r of labsRowsAll) {
            const iso = _rowISO(r);
            const meta = String(r.meta || '').trim().toUpperCase();
            if (!iso || !meta || meta === '_UNSORTED') continue;
            if (iso > activeNewestDate) {
              activeNewestDate = iso;
              activeMetaKey = meta;
            }
          }
          if (activeMetaKey) {
            const m = activeMetaKey.match(/-([A-Z0-9]+)$/);
            activeSetCode = m ? m[1] : activeMetaKey;
          }
          // ── Ein Lag-Fenster, das nicht mehr zugeht (20.08.2026) ──
          //
          // Die Erkennung oben ist rein datengetrieben: sie nimmt die
          // NEUESTE Labs-Zeile und liest deren Format. Das ist richtig,
          // solange ueberhaupt noch Turniere im alten Format stattfinden —
          // genau dafuer wurde sie 2026-06 gebaut.
          //
          // Sie kann aber nicht zwischen "die Rotation hinkt nach" und
          // "seit Wochen ist gar nichts mehr gescrapt" unterscheiden.
          // Gemessen am 20.08.2026: die neueste Labs-Zeile ist vom
          // 10.06.2026 — 71 Tage alt, aus zwei Turnieren. in_person_legal
          // fuer PBL war am 31.07. Es gibt also kein Nachhinken mehr, es
          // gibt eine Luecke. Das Fenster blieb trotzdem offen und hatte
          // zwei Folgen:
          //
          //   * Der Guard weiter unten leerte JEDE Labs-Kennzahl — richtig
          //     im Ergebnis (TEF-CRI darf eine PBL-Prognose nicht ankern),
          //     aber mit der falschen Begruendung auf dem Bildschirm.
          //   * Predictor 4.7 filterte die Online-Siege gegen 'CRI' und
          //     warf damit alle 38 Siege des LAUFENDEN Formats weg, die
          //     ueber der Spielerschwelle im Zerfallsfenster lagen. Das
          //     einzige frische Signal, das es gibt, fiel dem Fenster zum
          //     Opfer, das die Abwesenheit von Daten ueberbruecken sollte.
          //
          // Das Fenster bekommt deshalb eine Altersgrenze: es ist nur
          // offen, solange die alten Turniere wirklich noch laufen.
          // Danach gilt schlicht "fuer dieses Format liegen keine
          // Vor-Ort-Daten vor" — dieselbe leere Labs-Ebene, aber unter
          // ihrem richtigen Namen, und die Online-Siege zaehlen wieder.
          const LAG_KARENZ_TAGE = 21;
          const lagTage = (_formatWindow && Number(_formatWindow.lag_days)) || 14;
          let lagAlterTage = null;
          if (activeNewestDate) {
            const d = new Date(activeNewestDate + 'T00:00:00Z');
            if (!isNaN(d.getTime())) {
              lagAlterTage = Math.floor((Date.now() - d.getTime()) / 86400000);
            }
          }
          const lagFensterAbgelaufen = lagAlterTage != null
            && lagAlterTage > (lagTage + LAG_KARENZ_TAGE);
          if (lagFensterAbgelaufen && activeSetCode !== currentSetCode) {
            console.info(
              '[MetaCall] Lag-Fenster abgelaufen — neueste Labs-Zeile %s ist %d Tage alt '
              + '(Grenze %d). Kein Nachhinken, sondern eine Datenluecke: aktives Format '
              + 'bleibt %s, die Vor-Ort-Ebene fehlt fuer dieses Format.',
              activeNewestDate, lagAlterTage, lagTage + LAG_KARENZ_TAGE, currentSetCode);
            activeSetCode = currentSetCode;
          }
          _lagFensterAlterTage = lagAlterTage;
          _lagFensterAbgelaufen = lagFensterAbgelaufen;
          _lagNeuesteLabsZeile = activeNewestDate;
          _activeMetaKeyVoll = activeMetaKey;

          // Expose to outer scope for Predictor 4.7 (Online winners
          // filter) which needs to know the active in-person rotation.
          _activeInPersonSetCode = activeSetCode;
          // Lag-window detected: log it so the operator can confirm
          // the predictor is using the right rotation.
          if (activeSetCode !== currentSetCode) {
            console.info(
              '[MetaCall] Lag-window detected — current_set=%s but active in-person set=%s ' +
              '(newest labs row %s, meta=%s). Using %s for the labs filter.',
              currentSetCode, activeSetCode, activeNewestDate, activeMetaKey, activeSetCode,
            );
          }
          // Date cutoff: during the lag window the new in_person_legal_date
          // would drop every previous-rotation row, so suppress it.
          // Otherwise keep the original guard (filters out previous-format
          // pollution after the rotation flips).
          const lagWindowActive = activeSetCode !== currentSetCode;
          const effectiveCutoffISO = lagWindowActive ? '' : cutoffISO;

          const _rowMatchesCurrentFormat = (r) => {
            if (!activeSetCode) return true; // no format_window → no filter
            const meta = String(r.meta || '').trim().toUpperCase();
            // 2026-06 fix — DROP rows with empty meta. The previous
            // "keep on unknown" rule was naive: it let the scraper's
            // malformed "Special Event San Juan" output (96 rows, empty
            // meta column AND empty date, deck shares from pre-rotation
            // BRS-era — Miraidon 13.9 %, Lugia Archeops 40 %, Gardevoir
            // 12.2 %, Charizard Pidgeot 10 %, Lost Zone Box 8 %) into
            // the active aggregate. Predictor 5.5 then read those as
            // "current labs presence" and floored those decks at
            // 5–12 % in the current-meta prediction, even though they
            // have zero presence in TEF-POR. If the scraper can't
            // classify a tournament's meta, it doesn't go in the
            // active-rotation pile. Period.
            if (!meta || meta === '_UNSORTED') return false;
            return meta === activeSetCode || meta.endsWith('-' + activeSetCode);
          };
          const labsRows = (effectiveCutoffISO || activeSetCode)
            ? labsRowsAll.filter(r => {
                const iso = _rowISO(r);
                const dateOK = !effectiveCutoffISO || !iso || iso >= effectiveCutoffISO;
                const formatOK = _rowMatchesCurrentFormat(r);
                return dateOK && formatOK;
              })
            : labsRowsAll;

          if (cutoffISO || currentSetCode) {
            const dropped = labsRowsAll.length - labsRows.length;
            try {
              window.__mcLabsDroppedCount = dropped;
            } catch (_e) { /* ignore */ }
            if (dropped > 0) {
              try {
                console.log(
                  `[Predictor 4.1+4.5] Format filter (active-set=${activeSetCode || 'n/a'}, ` +
                  `cutoff=${effectiveCutoffISO || 'n/a'}${lagWindowActive ? ' [lag-window]' : ''}): ` +
                  `dropped ${dropped} of ${labsRowsAll.length} labs rows. ` +
                  `Keeping ${labsRows.length} matching the active in-person format.`
                );
              } catch (_e) { /* ignore */ }
            }
          }

          // Predictor 5.5 — Last-Meta-Labs aggregation (split early/late,
          // floor uses MAX of the two periods).
          //
          // 5.5.3 — Post-Turin redesign (2026-06):
          //   The first iteration's binary 2× late multiplier had two
          //   failure modes the Turin Phase 1 abgleich exposed:
          //   (a) Festival Lead declined late (4.50 → 2.83) but came
          //       back at 4 % at Turin → a late-weighted aggregate
          //       suppressed its floor exactly when we needed it.
          //   (b) Raging Bolt grew slightly late (6.32 → 7.22) and
          //       got its already-stable share over-pumped via the
          //       multiplier × player-count amplification.
          //
          //   Fix: compute early-period and late-period player-weighted
          //   averages separately, store BOTH on _lastMetaLabsByDeck.
          //   The floor uses max(earlyShare, lateShare) — captures the
          //   "best version" of the deck across the format. The split
          //   also lets the Decline-Damper (Mode A baseline) read
          //   lateShare/earlyShare directly without re-aggregating.
          //
          //   The 2 latest tournaments (Indianapolis + Lima for
          //   TEF-POR) are the "late" window; everything earlier is
          //   the "early" window. Special Events with < ~500 players
          //   are kept — they're noisy but the player-weight already
          //   discounts them.
          const prevFmtKey = String((_formatWindow && _formatWindow.previous_format_key) || '')
            .trim().toUpperCase();
          const setAdditionOnly = !!(_formatWindow && _formatWindow.set_addition_only);
          if (prevFmtKey && setAdditionOnly) {
            const prevRows = labsRowsAll.filter(r => {
              const meta = String(r.meta || '').trim().toUpperCase();
              return meta === prevFmtKey;
            });
            const tidsByDate = {};
            prevRows.forEach(r => {
              const tid = (r.tournament_id || '').trim();
              if (!tid) return;
              const iso = _rowISO(r);
              if (!tidsByDate[tid] || iso > tidsByDate[tid]) tidsByDate[tid] = iso;
            });
            const sortedTids = Object.keys(tidsByDate).sort((a, b) => {
              const da = tidsByDate[a] || '';
              const db = tidsByDate[b] || '';
              if (da !== db) return da < db ? -1 : 1;
              return a < b ? -1 : 1;
            });
            const lateTidSet = new Set(sortedTids.slice(-2));

            // Per-deck: separate early/late accumulators
            const lastMetaAgg = {}; // k -> { name, eSW, eP, lSW, lP, n }
            prevRows.forEach(r => {
              if (!r.deck_name) return;
              const share = parseEU(r.share_pct || '0');
              const players = parseInt(r.player_count || '0', 10) || 0;
              if (players <= 0 || share <= 0) return;
              const tid = (r.tournament_id || '').trim();
              const isLate = tid && lateTidSet.has(tid);
              const k = normalize(r.deck_name);
              if (!lastMetaAgg[k]) {
                lastMetaAgg[k] = { name: r.deck_name, eSW: 0, eP: 0, lSW: 0, lP: 0, n: 0 };
              }
              if (isLate) {
                lastMetaAgg[k].lSW += share * players;
                lastMetaAgg[k].lP  += players;
              } else {
                lastMetaAgg[k].eSW += share * players;
                lastMetaAgg[k].eP  += players;
              }
              lastMetaAgg[k].n += 1;
            });
            Object.keys(lastMetaAgg).forEach(k => {
              const a = lastMetaAgg[k];
              const earlyShare = a.eP > 0 ? a.eSW / a.eP : 0;
              const lateShare  = a.lP > 0 ? a.lSW / a.lP : 0;
              // Floor source: full player-weighted average across the
              // whole previous format. MAX(early, late) over-pumped
              // decks with a single late-format spike — Dragapult solo
              // jumped 10.67 → 19.80 at Indianapolis alone, MAX picked
              // 19.80 as the floor reference, the family aggregate
              // climbed 30.4 → 34.0 % in Phase 3c when the real Turin
              // share stayed at 29 %. The full average smooths the
              // single-event spike and is conservative for stable-late
              // decks; the Decline-Damper handles the opposite case
              // (early-strong, late-declining) on the baseline side.
              const fullPlayers = a.eP + a.lP;
              const floorShare  = fullPlayers > 0 ? (a.eSW + a.lSW) / fullPlayers : 0;
              if (floorShare > 0) {
                _lastMetaLabsByDeck[k] = {
                  name:       a.name,
                  share:      floorShare,
                  earlyShare: earlyShare,
                  lateShare:  lateShare,
                  players:    a.eP + a.lP,
                  n:          a.n,
                };
              }
            });
            try {
              const decks = Object.keys(_lastMetaLabsByDeck).length;
              if (decks > 0) {
                console.log(
                  `[Predictor 5.5] Last-Meta-Labs floor armed (prev=${prevFmtKey}, ` +
                  `set-addition, full-player-weighted): ${decks} archetypes loaded. ` +
                  `Late tids: ${Array.from(lateTidSet).join(', ') || 'n/a'}.`
                );
              }
            } catch (_e) { /* ignore */ }
          } else if (prevFmtKey && !setAdditionOnly) {
            try {
              console.log(
                `[Predictor 5.5] Last-Meta-Labs floor DISABLED — ${prevFmtKey} ` +
                `was a true rotation (set_addition_only=false). Last-meta shares ` +
                `would mislead because key cards have left the legal pool.`
              );
            } catch (_e) { /* ignore */ }
          }

          // Predictor 4.1 — Recency weight (linear ramp 0.5 → 1.0 from
          // in-person-legal date to today). Tournaments at the start of
          // a format carry less signal because deck choices are still
          // being figured out; late-format events carry full weight.
          const todayISO_ = _todayISO();
          const formatLifeDays = cutoffISO
            ? Math.max(1, Math.round((new Date(todayISO_) - new Date(cutoffISO)) / 86400000))
            : 0;
          const _recencyWeight = (rowISO) => {
            if (!cutoffISO || !rowISO) return 1.0;
            const tDays = Math.max(0, Math.round((new Date(rowISO) - new Date(cutoffISO)) / 86400000));
            return _clip(0.5 + 0.5 * (tDays / formatLifeDays), 0.5, 1.0);
          };

          // Pass 1 (filtered): find the latest tournament. Limitless assigns
          // tournament_id sequentially, so the highest id is the most
          // recent — more reliable than tournament_date which is empty
          // for some entries. Fall back to scraped_at if needed.
          let latestId = null;
          let latestRow = null;
          labsRows.forEach(r => {
            const tid = (r.tournament_id || '').trim();
            if (!tid) return;
            if (!latestId || tid > latestId) {
              latestId = tid;
              latestRow = r;
            }
            // Track newest scraped_at across ALL rows — surfaced in
            // the Mode B banner so the user can spot stale-cache
            // problems at a glance.
            const scr = (r.scraped_at || '').trim();
            if (scr && scr > _dataLastScrapedAt) {
              _dataLastScrapedAt = scr;
            }
          });
          if (latestRow) {
            // Try to derive a display date: tournament_date first,
            // otherwise the date portion of scraped_at.
            let displayDate = (latestRow.tournament_date || '').trim();
            if (!/^\d{4}-\d{2}-\d{2}$/.test(displayDate)) {
              const scrap = (latestRow.scraped_at || '').trim();
              const m = scrap.match(/^(\d{4}-\d{2}-\d{2})/);
              displayDate = m ? m[1] : '';
            }
            const fullName = (latestRow.tournament_name || '').trim();
            _lastMajorInfo = {
              id: latestId,
              name: fullName,
              shortName: _shortMajorName(fullName),
              date: displayDate,
              country: (latestRow.country || '').trim(),
              totalPlayers: parseInt(latestRow.total_players || '0', 10) || 0
            };
          }
          // Pass 2 (filtered): aggregate per-deck data + capture last-major slice.
          // share / top8_conv aggregates are recency-weighted so late-format
          // majors dominate over first-week-of-format ones.
          //
          // Also populates the Phase α / β calibration helpers:
          //   • _activeFormatLabsDecks  — any deck that appears here
          //   • _majorSharesByDeck[k]  — per-deck (date, tid, share)
          //     list, sorted later for the recency-weighted average.
          //   • per-tournament top-15 lists, later consolidated into
          //     _activeFormatTop15Decks.
          const _topByTournament = {}; // tid -> [{ k, share }, …]

          // Slug-dedup guard (2026-06-12 audit F-D07): 4 archetype names
          // in labs_tournament_decks.csv carry two slug variants —
          // Okidogi (ex/twm), Alakazam (ex/meg), Tyranitar (ex/jtg),
          // Toxtricity Box (pfl/box). Both rows share the same
          // tournament_id + deck_name but differ on deck_slug. Without
          // a guard, the aggregator below would sum BOTH slug rows'
          // share / day1/day2 / top8_conv values into one
          // `normalize(deck_name)` bucket → that archetype's labs share
          // appears doubled per major (= the bug behind Toxtricity Box
          // showing up in dark-horse tips on a 2-pilot Turin sample).
          // Pick the slug with the higher share_pct as the canonical
          // row for that (tournament, name); ties resolve to the first
          // occurrence for stable ordering. Long-tail decks where both
          // slugs sit at < 0.1 % each barely move, but the doubling on
          // bigger samples is what we want to kill.
          const _winnerByTournamentName = new Map(); // "tid|nameLower" -> row index
          labsRows.forEach((r, i) => {
            if (!r.deck_name) return;
            if (_isMetaBucketLabel(r.deck_name)) return;
            const tid = (r.tournament_id || '').trim();
            if (!tid) return;
            const key = tid + '|' + normalize(r.deck_name);
            const myShare = parseEU(r.share_pct || '0');
            const prev = _winnerByTournamentName.get(key);
            if (!prev || myShare > prev.share) {
              _winnerByTournamentName.set(key, { idx: i, share: myShare });
            }
          });

          labsRows.forEach((r, i) => {
            if (!r.deck_name) return;
            // The "Other" bucket has high combined d2_share at every
            // major (it's the sum of every long-tail deck), which
            // poisons the synthetic-conv / quality-ratio aggregators
            // and produces phantom "strong signal" tips. Skip at
            // ingest so the bucket can't influence any per-deck stat.
            if (_isMetaBucketLabel(r.deck_name)) return;
            // Slug-dedup (F-D07): if this (tid, name) has a winner
            // chosen above and we're not it, skip — the winner row
            // already represents the canonical share for the name.
            const _tid = (r.tournament_id || '').trim();
            if (_tid) {
              const _w = _winnerByTournamentName.get(_tid + '|' + normalize(r.deck_name));
              if (_w && _w.idx !== i) return;
            }
            const k = normalize(r.deck_name);
            const share = parseEU(r.share_pct || '0');
            const w = _recencyWeight(_rowISO(r));
            if (!labsRowsByDeck[k]) labsRowsByDeck[k] = { name: r.deck_name, share: 0, n: 0 };
            labsRowsByDeck[k].share += share * w;
            labsRowsByDeck[k].n += w;

            // Phase α / β capture — collect per-(deck, tournament) data
            // for the active-meta presence / top-15 / recency-weighted
            // major average computations below.
            _activeFormatLabsDecks.add(k);
            const tid = (r.tournament_id || '').trim();
            const rowDate = _rowISO(r);
            if (tid && rowDate) {
              if (!_majorSharesByDeck[k]) _majorSharesByDeck[k] = [];
              _majorSharesByDeck[k].push({
                date  : rowDate,
                tid   : tid,
                tournamentName: (r.tournament_name || '').trim(),
                shortName: _shortMajorName((r.tournament_name || '').trim()),
                share : share,
                day1  : parseEU(r.day1_share_pct || '0'),
                day2  : parseEU(r.day2_share_pct || '0'),
                // Extended fields for the Past Meta per-tournament
                // breakdown UI — overall WR, Day-1 WR + share, Day-2
                // WR + share, conv, top-1 marker so the renderer can
                // ✓ a deck that won the event.
                players:       parseInt(r.player_count || '0', 10) || 0,
                winPct:        parseEU(r.win_pct || '0'),
                day1Share:     parseEU(r.day1_share_pct || '0'),
                day1WinPct:    parseEU(r.day1_win_pct || '0'),
                day1Players:   parseInt(r.day1_players || '0', 10) || 0,
                day2Share:     parseEU(r.day2_share_pct || '0'),
                day2WinPct:    parseEU(r.day2_win_pct || '0'),
                day2Players:   parseInt(r.day2_players || '0', 10) || 0,
                dayConv:       parseEU(r.day1_to_day2_conv || '0'),
                top1Count:     parseInt(r.top1_count || '0', 10) || 0,
              });
              if (!_topByTournament[tid]) _topByTournament[tid] = [];
              _topByTournament[tid].push({ k, share });
            }
            // Conversion rates (added in Predictor 3.0). Track per-deck
            // weighted averages so a recent strong major matters more
            // than an old "early format" one.
            //
            // NOTE: top8_conv_rate is not populated by the labs
            // scraper for any tournament in the current format window
            // (verified 2026-06-12: 0 of 236 window rows carry it;
            // historical rows do at 0–100 percent scale). The Day-1
            // → Day-2 quality ratio below is the live replacement
            // signal — it captures the same "this deck overperforms
            // its share in the cut" idea using fields that ARE
            // populated. labsT8Boost falls back to the quality ratio
            // when this top-8-conv aggregate is empty.
            const t8raw = parseEU(r.top8_conv_rate || '0');
            // Historical CSV rows store this as 0–100 (e.g. 52.05);
            // the aggregate is consumed as a 0–1 fraction everywhere
            // downstream. Normalise here so a future scraper fix
            // doesn't silently render "5205 % conversion".
            const t8 = t8raw > 1 ? t8raw / 100 : t8raw;
            if (t8 > 0) {
              if (!_labsConvByDeck[k]) _labsConvByDeck[k] = { sum: 0, n: 0 };
              _labsConvByDeck[k].sum += t8 * w;
              _labsConvByDeck[k].n += w;
            }
            // Day-1 / Day-2 share aggregator (fix for the dead top-8
            // conv signal). The ratio d2_share / d1_share is the cut-
            // performance signal: > 1.0 means the deck GAINED share
            // in the cut (overperformed); < 1.0 means it LOST share
            // (underperformed). Aggregated weighted by recency so a
            // recent major dominates over older ones.
            const d1Pct = parseEU(r.day1_share_pct || '0');
            const d2Pct = parseEU(r.day2_share_pct || '0');
            if (d1Pct > 0) {
              if (!_labsQualityByDeck[k]) _labsQualityByDeck[k] = { d1: 0, d2: 0, d1Players: 0, d2Players: 0 };
              _labsQualityByDeck[k].d1 += d1Pct * w;
              _labsQualityByDeck[k].d2 += d2Pct * w;
              // Raw (unweighted) pilot counts across the window's
              // majors — sample-size guard for the synthetic conv
              // signal. 2026-06-12 user report: Archaludon showed
              // "Strong 40 % Top-8 conversion" off a 2-pilot Turin
              // sample (1 of 2 made Day 2 → ratio 2.65 → cap). With
              // ≤ 2 pilots the ratio is a coin flip, not a signal.
              _labsQualityByDeck[k].d1Players += parseInt(r.day1_players || '0', 10) || 0;
              _labsQualityByDeck[k].d2Players += parseInt(r.day2_players || '0', 10) || 0;
            }
            // Predictor 5.4 — Day-2 share growth (Δ pp). Captures
            // ABSOLUTE share gained Day-1 → Day-2 (e.g. Lillie's
            // Clefairy at Indy: 3.8 → 5.3 = +1.5 pp). Strictly
            // complementary to dayConv: a deck can have 100 %
            // conversion at flat share, or <100 % at climbing share —
            // this one only fires on the latter.
            if (d1Pct > 0 && d2Pct > 0) {
              const growthPP = d2Pct - d1Pct;
              if (!_labsShareGrowthByDeck[k]) _labsShareGrowthByDeck[k] = { sum: 0, n: 0 };
              _labsShareGrowthByDeck[k].sum += growthPP * w;
              _labsShareGrowthByDeck[k].n += w;
            }

            // Predictor 4.6 — Underdog-Champion-Boost capture.
            // Track the deck's most recent low-share regional WIN. Only
            // keep the freshest row that satisfies the underdog gate;
            // older wins fall out of scope on the date-decay anyway.
            const top1Count   = parseInt(r.top1_count || '0', 10) || 0;
            const totalPlayers = parseInt(r.total_players || '0', 10) || 0;
            if (
              top1Count >= 1 &&
              share < PREDICTOR_4_6_MAX_SHARE_PCT &&
              totalPlayers >= PREDICTOR_4_6_MIN_PLAYERS
            ) {
              const rowIso = _rowISO(r) || '';
              const prev = _underdogChampionByDeck[k];
              // Keep the most recent such win (highest ISO date) so a
              // re-scrape that appends earlier rows can't overwrite a
              // fresh signal.
              if (!prev || rowIso > (prev.date || '')) {
                _underdogChampionByDeck[k] = {
                  tid:        (r.tournament_id || '').trim(),
                  date:       rowIso,
                  share:      share,
                  players:    totalPlayers,
                  top1Count:  top1Count,
                  eventName:  (r.tournament_name || '').trim(),
                };
              }
            }

            // Direct Day-1 → Day-2 conversion rate. Recency-weighted
            // average across recent majors. Used by the predictor as
            // a "deck quality" multiplier independent of the share-
            // ratio above. Skip rows where day1_players is too small
            // for the conversion to be statistically meaningful.
            const dayConv = parseEU(r.day1_to_day2_conv || '0');
            const day1Players = parseInt(r.day1_players || '0', 10) || 0;
            if (dayConv > 0 && day1Players >= 10) {
              if (!_labsDay2ConvByDeck[k]) {
                _labsDay2ConvByDeck[k] = { sum: 0, n: 0, samples: [] };
              } else if (!_labsDay2ConvByDeck[k].samples) {
                // Backward-compat: older callers may have inited
                // without samples; ensure the array exists.
                _labsDay2ConvByDeck[k].samples = [];
              }
              _labsDay2ConvByDeck[k].sum += dayConv * w;
              _labsDay2ConvByDeck[k].n += w;
              // Per-tournament samples — used for rank-weighted recency
              // aggregation (Predictor 5.2 Fix #C). Date matters for
              // ranking; weight `w` preserved for blended scoring.
              _labsDay2ConvByDeck[k].samples.push({
                date:   _rowISO(r) || '',
                conv:   dayConv,
                weight: w,
                tid:    (r.tournament_id || '').trim(),
              });
            }
            // d2WR — Day-2 win rate aggregate. Feeds the reco engine's
            // d2WR multiplier. Skip rows where day2_players is too
            // small to give a meaningful WR (< 5 players = 4 games at
            // most, way too noisy).
            const day2Wr = parseEU(r.day2_win_pct || '0');
            const day2Players = parseInt(r.day2_players || '0', 10) || 0;
            if (day2Wr > 0 && day2Players >= 5) {
              if (!_labsDay2WrByDeck[k]) {
                _labsDay2WrByDeck[k] = { sum: 0, n: 0, samples: [] };
              }
              // Sample-size-weighted aggregation. The Hydrapple-at-
              // Indy reco post-mortem flagged this: Prague had 1 Day-2
              // player at 26.67 % d2WR (already filtered by the >= 5
              // gate), LA had 4 (also filtered), so legitimate kept
              // samples (Campinas 9 / 58 %, Utrecht 14 / 51 %, Melbourne
              // 8 / 52 %) averaged to ~54 %. Weighting by day2_players
              // makes the 14-player Utrecht sample worth more than the
              // 8-player Melbourne, which matches statistical intuition
              // (more games = lower variance, deserves more weight).
              // Combined with the recency weight `w`, the final weight
              // is `w × day2Players`.
              const sampleWeight = w * day2Players;
              _labsDay2WrByDeck[k].sum += day2Wr * sampleWeight;
              _labsDay2WrByDeck[k].n += sampleWeight;
              _labsDay2WrByDeck[k].samples.push({
                date:        _rowISO(r) || '',
                d2wr:        day2Wr,
                day2Players,
                weight:      sampleWeight,
                tid:         (r.tournament_id || '').trim(),
              });
            }
            // Track latest tournament date (for trend snapshots).
            const td = (r.tournament_date || '').trim();
            if (td && /^\d{4}-\d{2}-\d{2}$/.test(td)) {
              if (!_lastMajorDate || td > _lastMajorDate) _lastMajorDate = td;
            }
            // Capture the slice for the most-recent tournament so the
            // field cards can show "last major" share + win-pct per deck.
            // Day-1 / Day-2 fields stay 0 when the CSV pre-dates the
            // Day-1+Day-2 scraper extension — the renderer falls back
            // to the overall row in that case.
            if (latestId && (r.tournament_id || '').trim() === latestId) {
              _lastMajorByDeck[k] = {
                share:        share,
                winPct:       parseEU(r.win_pct || '0'),
                players:      parseInt(r.player_count || '0', 10) || 0,
                day1Players:  parseInt(r.day1_players || '0', 10) || 0,
                day1Share:    parseEU(r.day1_share_pct || '0'),
                day1WinPct:   parseEU(r.day1_win_pct || '0'),
                day2Players:  parseInt(r.day2_players || '0', 10) || 0,
                day2Share:    parseEU(r.day2_share_pct || '0'),
                day2WinPct:   parseEU(r.day2_win_pct || '0'),
                dayConv:      parseEU(r.day1_to_day2_conv || '0')
              };
            }
          });
          // Fall back to the latest row's display date if no
          // tournament_date matched the YYYY-MM-DD pattern.
          if (!_lastMajorDate && _lastMajorInfo && _lastMajorInfo.date) {
            _lastMajorDate = _lastMajorInfo.date;
          }
          _labsMajorRows = labsRows.length;

          // Phase α C — finalise the top-15 set across all active-meta
          // tournaments. A deck that broke top-15 in even one regional
          // is "in-person established" enough to escape the damper.
          for (const tid of Object.keys(_topByTournament)) {
            const top = _topByTournament[tid]
              .sort((a, b) => b.share - a.share)
              .slice(0, PHASE_A_C_TOP_N);
            for (const t of top) _activeFormatTop15Decks.add(t.k);
          }
          // Sort per-deck major-share lists newest-first so the
          // recency-weighted average in Phase β picks up the latest
          // three entries via slice(0, 3) without a re-sort.
          for (const k of Object.keys(_majorSharesByDeck)) {
            _majorSharesByDeck[k].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
          }
          console.info(
            '[MetaCall] Phase α / β capture — active-meta decks=%d, top-15-active=%d, deck-major-histories=%d',
            _activeFormatLabsDecks.size,
            _activeFormatTop15Decks.size,
            Object.keys(_majorSharesByDeck).length,
          );
        }
      } catch (_e) { /* optional source */ }

      // History snapshots for Predictor 3.0 trend signals. Manifest
      // tells us which dates are available; we pick closest dates ≤ the
      // target. Both snapshots are optional — missing data just leaves
      // the trend term at the deck's current ladder share (no boost or
      // damping). Predictor 3.0 falls through to vanilla 2.0 behavior
      // when neither snapshot resolves.
      // Family-override map for the variant rollup. Cheap, optional —
      // loads once per session and is reused across reloads via SW.
      await _loadDeckFamilyOverride();

      _historyManifest = await _loadHistoryManifest();
      _baselineSnapshotDate = _resolveHistoryDate(_lastMajorDate);
      _snapshotAtMajor = await _loadHistorySnapshot(_baselineSnapshotDate);
      const weekAgoTarget = _isoMinusDays(_todayISO(), 7);
      const weekAgoActual = _resolveHistoryDate(weekAgoTarget);
      _snapshotWeekAgo = await _loadHistorySnapshot(weekAgoActual);

      // Predictor 5.0: load ALL daily snapshots once for the recency-
      // weighted baseline (replaces the binary at-major / week-ago
      // baseline) and the ACE-SPEC variant breakdown (per-deck "most-
      // played ACE-SPEC" annotation).
      _allHistorySnapshots = await _loadAllHistorySnapshots();
      await _loadAceSpecVariants();

      // City League aggregates (optional). Both files come from the
      // city_league_archetype scraper and contain pre-aggregated shares
      // per archetype. We use `new_meta_share` (current period within
      // each file) as the deck's share; the field stays a number even
      // when the comparison row is "NEU" (new arch).
      _clCurrentByDeck = await _loadClShares('data/city_league_archetypes_comparison.csv');
      _clPastByDeck    = await _loadClShares('data/city_league_archetypes_past_comparison.csv');

      // ── Current-meta lag-window guard (2026-06) ────────────────
      // When CRI is online-legal but TEF-POR is still the in-person
      // rotation, the labs aggregate represents TEF-POR play, NOT
      // CRI. Anchoring CRI predictions to TEF-POR labs surfaces
      // misleading "Melbourne (TEF-POR)" references next to CRI
      // decks like Festival Lead / Raging Bolt Ogerpon — decks that
      // were strong in TEF-POR but won't carry forward at the same
      // share once CRI hits in-person.
      //
      // Rule: when source=current AND active in-person rotation ≠
      // current_set, drop all rotation-specific labs aggregates and
      // force Mode A (online ladder only). Keep the cross-rotation
      // signals (4.6 Underdog-Champion regional winners + 4.7 Online
      // wins) — those are deck-level "this deck just proved itself"
      // signals that DO carry across rotations.
      const _currentSetCodeUpper = (_formatWindow && _formatWindow.current_set)
        ? String(_formatWindow.current_set).trim().toUpperCase()
        : '';
      const _currentMetaLagWindow = _metaSource === 'current'
        && _activeInPersonSetCode
        && _currentSetCodeUpper
        && _activeInPersonSetCode !== _currentSetCodeUpper;
      if (_currentMetaLagWindow) {
        // Drop the labs aggregates that the predictor would read —
        // these represent the PREVIOUS rotation (TEF-POR) and would
        // anchor CRI predictions to the wrong format.
        labsRowsByDeck = {};
        _labsRowsByDeck = {};
        _labsConvByDeck = {};
        _labsQualityByDeck = {};
        _labsDay2ConvByDeck = {};
        _labsDay2WrByDeck = {};
        _labsShareGrowthByDeck = {};
        _activeFormatLabsDecks = new Set();
        _activeFormatTop15Decks = new Set();
        _tournamentStats = {};
        _labsMajorRows = 0;
        // KEEP _majorSharesByDeck, _lastMajorByDeck, _lastMajorInfo
        // populated even in lag-window — Past Meta needs them for
        // the per-tournament breakdown UI. The renderer suppresses
        // the Current-Meta "Last Major" chip via the lag-window
        // guard at the chip site instead of clearing the data here.
        console.info(
          '[MetaCall] Lag-window guard — dropped TEF-POR (%s) labs aggregates for CRI (%s) ' +
          'current-meta predictions. Mode A (online ladder only). Kept underdog-champion + online-win signals.',
          _activeInPersonSetCode, _currentSetCodeUpper,
        );
      }

      _predictorMode = _labsMajorRows > 0 ? 'B' : 'A';

      // ── Predictor 3.0 — compute predicted share per deck ──
      // Mode A baseline (no labs, no TG, no CL):
      //   0.40 × ladder + 0.30 × brought + 0.20 × top8_conv_boost
      //                 + 0.10 × weekly_trend_signal
      // Mode A + Testing Group / + CL toggles:
      //   keep 2.x weights (TG/CL replace the brought/ladder pillar).
      // Mode B (labs majors present):
      //   0.40 × labs × t8_conv_boost
      //   + 0.20 × brought
      //   + 0.15 × ladder
      //   + 0.15 × post_major_trend_signal
      //   + 0.10 × weekly_trend_signal
      // *_trend_signal(d) = ladder × clip(1 + (curr-base)/base, 0.7, 1.3)
      // labs_t8_boost(d)  = clip(top8_conv_rate / 0.25, 0.5, 2.0)
      const totalLadder = _shareList.reduce((s, d) => s + d.onlineShare, 0) || 1;
      const labsTotalShare = Object.values(labsRowsByDeck).reduce((s, d) => s + d.share, 0) || 1;
      // Make sure every deck in labsRowsByDeck appears in _shareList so
      // its share isn't dropped silently (treat unknowns with no ladder
      // entry as if ladder == 0). For Mode A we don't need this.
      if (_predictorMode === 'B') {
        Object.values(labsRowsByDeck).forEach(d => {
          const k = normalize(d.name);
          if (!_shareList.find(x => normalize(x.name) === k)) {
            _shareList.push({ name: d.name, onlineShare: 0, ladderShare: 0, trend: 0 });
          }
        });
      }
      // Same for CL — a deck that's prominent in City League but absent
      // from the online ladder must still appear in _shareList so its CL
      // weight isn't silently dropped. Toggle state is consulted at run
      // time, so we add unconditionally when CL data exists.
      [_clCurrentByDeck, _clPastByDeck].forEach(map => {
        Object.values(map).forEach(d => {
          const k = normalize(d.name);
          if (!_shareList.find(x => normalize(x.name) === k)) {
            _shareList.push({ name: d.name, onlineShare: 0, ladderShare: 0, trend: 0 });
          }
        });
      });
      // Cache labs data on the module so _runPredictor() can re-run later
      // (e.g. after a Testing Group load) without hitting Firestore again.
      _labsRowsByDeck = labsRowsByDeck;

      // ── Phase α (Indy calibration, 2026-06) ─────────────────────
      // Apply the CRI-Format-Filter + In-Person-Absent-Damper to
      // `_shareList` BEFORE _runPredictor sees it. Only fires when:
      //   • we have meaningful active-meta labs data (active list has
      //     ≥ 10 decks — otherwise we're in a fresh-format gap and
      //     have no signal to filter on)
      //   • we're not in past-meta mode (which uses its own data path)
      if (_metaSource !== 'past' && _activeFormatLabsDecks.size >= 10) {
        const before = _shareList.length;
        let droppedFormatAbsent = 0;
        let dampedHype = 0;
        _shareList = _shareList.filter(d => {
          const k = normalize(d.name);
          if (!_activeFormatLabsDecks.has(k)) {
            // CRI-Format-Filter: the deck has online presence but zero
            // labs rows in the active in-person meta. Drop it from the
            // prediction pool so renormalisation doesn't dilute real
            // TEF-POR decks. Common case during the in-person lag
            // window — online players move to the new rotation before
            // any Regional uses it (e.g. Mega Greninja, Beedrill at
            // 7 % + 5 % online while invisible at Indianapolis).
            droppedFormatAbsent += 1;
            return false;
          }
          return true;
        });
        _shareList.forEach(d => {
          const k = normalize(d.name);
          // In-Person-Absent-Damper: deck has labs presence but never
          // broke top-15 of any active-meta tournament. Online ladder
          // share gets multiplicatively dampened so Slowking-style
          // online-hype decks (4.92 % online, 1.98 % at Indy) don't
          // poison the prediction. Ladder share kept intact for the
          // per-deck badge — only the engine-internal onlineShare is
          // dampened.
          if (!_activeFormatTop15Decks.has(k)) {
            d.onlineShare = d.onlineShare * PHASE_A_C_DAMP_FACTOR;
            d._phaseAcDamped = true;
            dampedHype += 1;
          }
        });
        if (droppedFormatAbsent > 0 || dampedHype > 0) {
          console.info(
            '[MetaCall] Phase α — dropped %d format-absent decks (was %d → %d), dampened %d in-person-absent decks (×%s on onlineShare).',
            droppedFormatAbsent, before, _shareList.length, dampedHype, PHASE_A_C_DAMP_FACTOR,
          );
        }
      }

      // Detect a newly-arrived major and compute prediction MAE against
      // it. Done before the first _runPredictor() so the banner can pick
      // up the report on the initial render. Idempotent per major.
      _checkAccuracyAgainstNewMajor(labsRowsByDeck);

      _runPredictor();

      // Always run _applyDateFilter() once after the initial predictor
      // pass — this either honours the user's explicit cutoff (set on
      // Card Analysis before the tab was first opened) OR applies the
      // auto-28-day default. Without this, fresh page loads would
      // show the cumulative-aggregate predictor for one render before
      // the auto-window kicks in. Idempotent + safe: when no cutoff
      // is effective, the override is a no-op.
      try { await _applyDateFilter(); } catch (_e) { /* tolerate */ }

      const matchResp = await fetch('data/limitless_online_decks_matchups.csv?t=' + Date.now());
      if (!matchResp.ok) throw new Error('matchup CSV not found');
      const matchRows = parseCSV(await matchResp.text(), ';');

      _matchupMap = {};
      matchRows.forEach(r => {
        if (!r.deck_name || !r.opponent) return;
        const dk = normalize(r.deck_name);
        const ok = normalize(r.opponent);
        if (!_matchupMap[dk]) _matchupMap[dk] = {};
        let pWin, pTie, pLoss;
        if (r.record && r.record.includes('-')) {
          const parts = r.record.split(/\s*-\s*/).map(s => parseInt(s.trim(), 10));
          const W = parts[0] || 0, L = parts[1] || 0, T = parts[2] || 0;
          const tot = W + L + T;
          pWin  = tot > 0 ? W / tot : 0.50;
          pTie  = tot > 0 ? T / tot : 0.02;
          pLoss = tot > 0 ? L / tot : 0.48;
        } else {
          pWin  = parseEU(r.win_rate) / 100;
          pTie  = 0.02;
          pLoss = Math.max(0, 1 - pWin - pTie);
        }
        _matchupMap[dk][ok] = { pWin, pTie, pLoss };
      });

      // Predictor 5.3 — Per-Variant Matchup Adjustments. The online
      // matchup CSV reflects ladder play, which over-rewards elite-
      // pilot niche decks: Crustle 67 % vs Dragapult online → 43 %
      // win-pct at LA (-8 pp deck-wide). Compute a per-deck delta =
      // last-major WR − cumulative online WR, then in getBaseMatchup
      // shift pWin by (adj[A] − adj[B]) / 100 so the simulator
      // reflects the tournament-pilot reality. Sample-size and
      // magnitude guards keep the correction conservative.
      _computeMatchupAdjustments();

      // ── Der Rennlauf, den niemand gewinnen konnte (20.08.2026) ──
      //
      // Die Empfehlungstabelle wurde einmal gerendert und nie wieder.
      // Gemessen mit einer Sonde in renderRecommendationsPanel: der
      // Aufruf faellt auf t = 5.577 ms, _matchupMap ist zu dem Zeitpunkt
      // noch `null`, und diese Datei hier ist erst bei t = 5.770 ms
      // fertig. 193 Millisekunden — und danach aendert sich nichts mehr.
      //
      // Ohne Matchup-Karte faellt JEDE Paarung auf die Vorgabe zurueck.
      // Alle zehn Zeilen zeigten dann dieselbe Day-2-Chance (17,3 %) und
      // dieselbe Win Rate (50,1–50,2 %); die Reihenfolge entstand aus
      // Rundungsresten. Mit geladener Karte steht Dragapult mit 21,3 %
      // ueber der Schwelle und Mega Excadrill bei 14,6 % — die Tabelle
      // zeigte also nicht eine ungenaue Rangfolge, sondern gar keine.
      //
      // Der Kommentar zwei Absaetze weiter unten ("subsequent panel
      // renders pick up the fields") beschrieb genau die Nachziehung,
      // die es nie gab. Hier ist sie. Sie fasst nur die zwei Bereiche
      // an, die von Matchups abhaengen — die Feldtabelle bleibt
      // unberuehrt, damit eine gerade getippte eigene Schaetzung nicht
      // unter den Fingern verschwindet.
      try { _panelsNachMatchupsNachziehen(); } catch (_e) { /* nicht toedlich */ }

      // Predictor 5.0 Phase 2 + 3 — decorate top-N entries with
      // best/worst matchups (now that _matchupMap is populated),
      // main-attacker HP + tier, and doctrine-quality score. Fires
      // in the background; subsequent panel renders pick up the
      // fields. Failures are non-fatal — the predictor still works
      // without these annotations.
      try {
        await _decorateMetaCallEntries();
        if (_shareList && _shareList.length > 0) {
          const top3 = _shareList.slice(0, 3);
          const hpInfo = top3
            .filter(d => d.mainPokemonHp != null)
            .map(d => `${d.name}: ${d.mainPokemonHp} HP (${d.hpTier})`)
            .join(' | ');
          const docInfo = top3
            .filter(d => d.doctrineScore != null)
            .map(d => `${d.name}: ${d.doctrineScore.toFixed(0)}/100${d.doctrineMissing && d.doctrineMissing.length ? ` (missing: ${d.doctrineMissing.join(',')})` : ''}`)
            .join(' | ');
          if (hpInfo)  console.info('[MetaCall] phase 2 — main-attacker HP:', hpInfo);
          if (docInfo) console.info('[MetaCall] phase 3 — doctrine quality:', docInfo);
        }
      } catch (e) {
        console.warn('[MetaCall] phase 2/3 decoration failed (non-fatal):', e);
      }

      // Past Meta source catalog — load once so the picker can offer
      // the list of past formats. Loader is silent on failure (no
      // manifest = no source picker shown, current-only behavior).
      try {
        await _loadPastMetaCatalog();
      } catch (_e) { /* tolerate */ }

      // W3 — Optional Major matchup data. Produced by the labs scraper's
      // --matchups pass (data/labs_tournament_matchups.csv). When the
      // file is present, getBaseMatchup() blends Major rows 3:1 over
      // the online ladder for any opponent-pair with ≥10 games. When
      // absent, behavior is identical to pre-PR (online-only).
      _majorMatchupMap = null;
      _majorMatchupMapDay1 = null;
      _majorMatchupMapDay2 = null;
      try {
        const mmResp = await fetch('data/labs_tournament_matchups.csv?t=' + Date.now());
        if (mmResp.ok) {
          const mmText = await mmResp.text();
          const mmRows = parseCSVQuoted(mmText, ',');  // CSV is comma-delimited per labs scraper
          // Aggregate per META × pair. The CSV holds rows from multiple
          // metas (SVI-JTG, TEF-POR, …) and the same archetype name can
          // exist in both with very different WR — e.g. Archaludon Duduns
          // vs Dragapult is 16.67 % in SVI-JTG (14 games) but 46.15 % in
          // TEF-POR (13 games). Aggregating across metas would average
          // them to 30.9 % and silently inject pre-rotation matchups
          // into a current-format prediction. Keying by meta keeps the
          // two cleanly separated; lookup picks the right meta at
          // query time (see getBaseMatchup).
          //   _majorMatchupMap[meta][myKey][oppKey]      = overall WR
          //   _majorMatchupMapDay1[meta][myKey][oppKey]  = Day-1 WR
          //   _majorMatchupMapDay2[meta][myKey][oppKey]  = Day-2 WR
          // All three maps share the same aggregation logic; only
          // which day_filter rows feed which bucket differs.
          const aggOverall = {}; // meta -> norm(deck) -> norm(opp) -> { games, weightedSum }
          const aggDay1    = {};
          const aggDay2    = {};
          let rowsConsumedOverall = 0;
          let rowsConsumedDay1    = 0;
          let rowsConsumedDay2    = 0;
          for (const r of mmRows) {
            const dayFilter = (r.day_filter || 'overall').trim().toLowerCase();
            const meta   = (r.meta || '').trim().toUpperCase();
            const myName = (r.my_deck_name || '').trim();
            const opName = (r.opponent_deck_name || '').trim();
            if (!meta || !myName || !opName) continue;
            const games = parseInt(r.vs_count || '0', 10);
            const wpRaw = parseLocaleNumber(r.vs_win_pct || '0', 0);
            if (!Number.isFinite(games) || games <= 0) continue;
            if (!Number.isFinite(wpRaw)) continue;
            const d = normalize(myName);
            const o = normalize(opName);
            let bucket;
            if (dayFilter === 'overall') {
              bucket = aggOverall;
              rowsConsumedOverall += 1;
            } else if (dayFilter === 'day1') {
              bucket = aggDay1;
              rowsConsumedDay1 += 1;
            } else if (dayFilter === 'day2') {
              bucket = aggDay2;
              rowsConsumedDay2 += 1;
            } else {
              continue;
            }
            if (!bucket[meta]) bucket[meta] = {};
            if (!bucket[meta][d]) bucket[meta][d] = {};
            if (!bucket[meta][d][o]) bucket[meta][d][o] = { games: 0, weightedSum: 0 };
            bucket[meta][d][o].games += games;
            bucket[meta][d][o].weightedSum += games * wpRaw;
          }
          const _collapseAgg = (agg, minGames) => {
            const out = {};
            let pairs = 0;
            for (const meta of Object.keys(agg)) {
              out[meta] = {};
              for (const d of Object.keys(agg[meta])) {
                for (const o of Object.keys(agg[meta][d])) {
                  const a = agg[meta][d][o];
                  if (a.games < minGames) continue;
                  const winPct = a.weightedSum / a.games; // 0..100
                  if (!out[meta][d]) out[meta][d] = {};
                  out[meta][d][o] = {
                    games  : a.games,
                    winPct,
                    source : 'major',
                  };
                  pairs += 1;
                }
              }
            }
            return { map: out, pairs };
          };
          // Keep Overall at ≥ MAJOR_MATCHUP_MIN_GAMES_PAST so Past Meta
          // has a usable map; the higher current-meta threshold is
          // re-applied at query time in getBaseMatchup.
          const overall = _collapseAgg(aggOverall, MAJOR_MATCHUP_MIN_GAMES_PAST);
          _majorMatchupMap = overall.map;
          const day1 = _collapseAgg(aggDay1, MAJOR_MATCHUP_MIN_GAMES_DAY1);
          _majorMatchupMapDay1 = day1.map;
          // Day-2 uses the lower MAJOR_MATCHUP_MIN_GAMES_DAY2 floor
          // because cut samples are inherently smaller (~10-20 % of
          // Day-1 player counts → 3-15 games per pair is typical).
          const day2 = _collapseAgg(aggDay2, MAJOR_MATCHUP_MIN_GAMES_DAY2);
          _majorMatchupMapDay2 = day2.map;
          const _pairsForMeta = (map, m) =>
            Object.values(map[m] || {}).reduce((s, x) => s + Object.keys(x).length, 0);
          const metaSummary = Object.keys(_majorMatchupMap)
            .map(m => `${m}=${_pairsForMeta(_majorMatchupMap, m)}`)
            .join(', ');
          const day1Summary = Object.keys(_majorMatchupMapDay1)
            .map(m => `${m}=${_pairsForMeta(_majorMatchupMapDay1, m)}`)
            .filter(s => !s.endsWith('=0'))
            .join(', ');
          const day2Summary = Object.keys(_majorMatchupMapDay2)
            .map(m => `${m}=${_pairsForMeta(_majorMatchupMapDay2, m)}`)
            .filter(s => !s.endsWith('=0'))
            .join(', ');
          const pct = (x) => Math.round(x * 100);
          console.info(
            `[MetaCall] Major matchup map — ` +
            `Overall: ${rowsConsumedOverall} rows → ${overall.pairs} pairs (${metaSummary || 'none'}); ` +
            `Day-1: ${rowsConsumedDay1} rows → ${day1.pairs} pairs (${day1Summary || 'none'}); ` +
            `Day-2: ${rowsConsumedDay2} rows → ${day2.pairs} pairs (${day2Summary || 'none'}); ` +
            `blend ${pct(MATCHUP_BLEND_WEIGHT_DAY2)}/${pct(MATCHUP_BLEND_WEIGHT_DAY1)}/${pct(MATCHUP_BLEND_WEIGHT_ONLINE)} (Day-2/Day-1/Online); ` +
            `min ${MAJOR_MATCHUP_MIN_GAMES} games (Overall fallback) / ${MAJOR_MATCHUP_MIN_GAMES_DAY1} (Day-1) / ${MAJOR_MATCHUP_MIN_GAMES_DAY2} (Day-2)`
          );
        } else {
          console.info('[MetaCall] No labs_tournament_matchups.csv — Major matchup blend skipped (online-only matchups)');
        }
      } catch (_e) {
        console.warn('[MetaCall] Major matchup load failed (non-fatal):', _e);
        _majorMatchupMap = null;
        _majorMatchupMapDay1 = null;
        _majorMatchupMapDay2 = null;
      }

      // Predictor 4.7 — Online-Tournament-Win Signal. Optional CSV
      // produced by the online_tournament_scraper's winners pass.
      // When absent, the predictor cleanly degrades to "no online-win
      // boost" — exactly how P4.6 behaves when there are no labs
      // top-1 finishes yet.
      _onlineWinsByDeck = {};
      try {
        const winsResp = await fetch('data/online_tournament_winners.csv?t=' + Date.now());
        if (winsResp.ok) {
          const winsRows = parseCSVQuoted(await winsResp.text(), ',');
          for (const r of winsRows) {
            const name = (r.winner_archetype || '').trim();
            if (!name) continue;
            const date    = (r.tournament_date || '').trim();
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
            const players = parseInt(r.player_count || '0', 10) || 0;
            const fmt     = (r.format || '').trim().toUpperCase();
            // Format filter: only wins matching the active in-person
            // rotation contribute. During the lag window CRI online
            // wins are NOT signal for a TEF-POR in-person event.
            if (fmt && _activeInPersonSetCode && fmt !== _activeInPersonSetCode) continue;
            // Tournament-size floor — small events are too noisy.
            if (players < PREDICTOR_4_7_MIN_PLAYERS) continue;
            const k = normalize(name);
            const prev = _onlineWinsByDeck[k];
            // Keep most-recent win.
            if (!prev || date > prev.date) {
              _onlineWinsByDeck[k] = {
                date, players, format: fmt,
                tournamentId: (r.tournament_id || '').trim(),
              };
            }
          }
          if (Object.keys(_onlineWinsByDeck).length > 0) {
            console.info(
              '[MetaCall] Predictor 4.7 — Online-Tournament-Win map: %d decks (format=%s, ≥%d players, freshness %d/%d days, cap +%s pp)',
              Object.keys(_onlineWinsByDeck).length,
              _activeInPersonSetCode || '?',
              PREDICTOR_4_7_MIN_PLAYERS,
              PREDICTOR_4_7_FULL_DECAY_DAYS, PREDICTOR_4_7_ZERO_DECAY_DAYS,
              PREDICTOR_4_7_BOOST_PP_MAX,
            );
          }
        }
      } catch (_e) {
        // Optional file — keep the engine running.
        _onlineWinsByDeck = {};
      }

      return true;
    } catch (e) {
      console.error('[MetaCall] Data load error:', e);
      return false;
    }
  }

  // ── Source switch (Current ↔ Past Meta) ───────────────────
  //
  // Single mutation point for `_metaSource` / `_pastMetaFormatKey`.
  // When switching TO past:
  //   1. Load the per-format chunk and aggregate brought-shares
  //   2. Replace _shareList with the past-meta-derived list
  //   3. Clear trend map (no week-over-week history for past metas)
  //   4. Re-run the predictor + decorator + renderAll
  // When switching back TO current:
  //   1. Drop the cached _shareList and call loadData() to repopulate
  //   2. Re-run the predictor
  //
  // Matchup map (_matchupMap) is reused as-is — we don't have
  // historical per-meta matchups; the current online matrix is the
  // best proxy and is flagged in the UI when source = past.
  async function _setMetaSource(source, formatKey) {
    const nextSource = source === 'past' ? 'past' : 'current';
    const nextKey = nextSource === 'past' ? (formatKey || _pastMetaFormatKey) : null;
    if (nextSource === _metaSource && nextKey === _pastMetaFormatKey) return;
    _metaSource = nextSource;
    _pastMetaFormatKey = nextKey;

    if (_metaSource === 'past') {
      if (!_pastMetaFormatKey) {
        // No format selected yet — render empty placeholder until user picks
        _shareList = [];
        _trendMap = {};
        try { renderAll(); } catch (_e) { /* tolerate */ }
        return;
      }
      const aggregate = await _loadPastMetaShares(_pastMetaFormatKey);
      if (!aggregate) {
        console.warn(`[MetaCall] Past Meta load failed for ${_pastMetaFormatKey}`);
        _shareList = [];
        _trendMap = {};
        try { renderAll(); } catch (_e) { /* tolerate */ }
        return;
      }
      _shareList = _pastMetaToShareList(aggregate);
      _trendMap = {};                  // no week-over-week for past metas

      // Detect whether the Past Meta format the user selected matches
      // the rotation the labs CSV currently covers (= the active
      // in-person meta during the lag window, or current_set after
      // it ends). When they match, the engine KEEPS the labs-derived
      // predictor state so the user can use Past Meta as a calibration
      // surface — testing what the engine would have predicted on the
      // morning of a recent regional. When they DON'T match (e.g.
      // viewing SVI-JTG past meta while labs holds TEF-POR rows),
      // wipe labs state so we don't accidentally apply rotation-N data
      // to a rotation-N-2 prediction. User-flagged 2026-06: the Indy
      // calibration is only useful if Past Meta = TEF-POR sees the
      // Phase α/β + Predictor 4.6/4.7 + d2WR machinery fire.
      const labsRotationSuffix = _activeInPersonSetCode || '';
      const formatMatchesLabs = labsRotationSuffix &&
        String(_pastMetaFormatKey || '').toUpperCase().endsWith(labsRotationSuffix);

      _tournamentStats = {};            // no top8/conv data for past metas
      if (!formatMatchesLabs) {
        // Cross-rotation past meta — strip labs state to avoid cross-
        // contamination. Same behaviour as before the 2026-06 fix.
        _labsRowsByDeck = {};
        _labsConvByDeck = {};
        _labsQualityByDeck = {};
        _labsDay2ConvByDeck = {};
        _labsDay2WrByDeck = {};
        _labsShareGrowthByDeck = {};
        _underdogChampionByDeck = {};
        _onlineWinsByDeck = {};
        _predictorMode = 'A';           // online-only mode (no labs signal)
        console.info(
          '[MetaCall] Past Meta %s ≠ labs rotation %s — wiping labs state.',
          _pastMetaFormatKey, labsRotationSuffix || '(unknown)',
        );
      } else {
        // Format match — keep labs state so the Phase α / β anchors,
        // Predictor 4.6 (Underdog-Champion), 4.7 (Online-Win), 5.4
        // (Day-2 growth), and the d2WR multiplier all fire against
        // the appropriate labs majors. Mode stays at whatever the
        // current_meta load decided (typically 'B' when ≥1 major has
        // landed for the rotation).
        console.info(
          '[MetaCall] Past Meta %s matches labs rotation %s — keeping labs state for predictor parity with Current Meta.',
          _pastMetaFormatKey, labsRotationSuffix,
        );
      }
      // Closed past meta — pin to standard so the hidden mode toggle
      // can't leave a 'counter' value sitting in state from the live
      // meta. Frozen view replaces predictor recommendations with the
      // Final-Cumulative ranking, which has no counter-meta dimension.
      const frozen = _isPastMetaFrozen(_pastMetaFormatKey);
      if (frozen) {
        _metaCallMode = 'standard';
        // Labs aggregate is already loaded by _loadPastMetaShares (which
        // now derives shares from labs as primary source). The fire-and-
        // forget renderAll() below ensures the Final-Cumulative panel
        // paints once even if shares came from the cards-CSV fallback.
        _loadPastMetaLabsAggregate(_pastMetaFormatKey).then(() => {
          try { renderAll(); } catch (_e) { /* tolerate */ }
        }).catch(() => { /* tolerate */ });
      }
      // 2026-06 — Past Meta predictor runs IF the format matches the
      // current labs rotation (TEF-POR during the lag window). The
      // predictor inherits the additive boost signals — Predictor 4.6
      // Underdog-Champion (Hydrapple +0.87 pp from the Campinas win),
      // 4.7 Online-Win signal, 5.4 Day-2 share-growth — on top of the
      // labs aggregate base, so the user can see the "calibration
      // sandbox" view: "what would the engine have predicted for the
      // next regional given this rotation's labs history?"
      //
      // The multiplicative dampers (P5.1 Day-2 booster/laggard, P5.3
      // Pilot-Skill, P5.2 Concentration-Exp) are SKIPPED for past
      // meta inside _runPredictor itself — those distort the family
      // aggregate (Dragapult family 29 % actual → 20 % predicted) and
      // their value is only for forward forecasting where the field
      // hasn't crystallised yet.
      //
      // Truly closed past metas (frozen=true) still skip the predictor
      // entirely — the Final-Cumulative table from the frozen panel
      // is the right view there.
      if (!frozen) {
        _runPredictor();
      }
      try { await _decorateMetaCallEntries(); } catch (_e) { /* tolerate */ }
      try { renderAll(); } catch (_e) { /* tolerate */ }
      // Diagnostic: surface whether _majorMatchupMap has data for this
      // past format. When it's empty, getBaseMatchup falls back to
      // 50/50 for every (deck, opp) pair → recs collapse to identical
      // values and the degenerate-spread guard in
      // exportFieldAndRecsShareImage hides the column. Logging here so
      // we can see if/when the lookup is broken vs just sparse.
      const pastMetaUpper = (_pastMetaFormatKey || '').toUpperCase();
      const metaMapForPast = pastMetaUpper && _majorMatchupMap
        ? _majorMatchupMap[pastMetaUpper]
        : null;
      const metaMapSize = metaMapForPast
        ? Object.values(metaMapForPast).reduce((s, x) => s + Object.keys(x).length, 0)
        : 0;
      console.info(`[MetaCall] source = past, format = ${_pastMetaFormatKey} (${aggregate.shares.length} archetypes, ${aggregate.tournamentCount} tournaments, frozen=${frozen}, source=${aggregate.source || 'labs'}, majorMatchupPairs=${metaMapSize})`);
    } else {
      // Switching back to current — invalidate caches that loadData fills
      _shareList = null;
      _matchupMap = null;
      _loadDataComplete = false;      // force the in-flight-guarded loadData to actually re-run
      const ok = await loadData();
      if (!ok) {
        console.warn('[MetaCall] reverting to current source failed');
        return;
      }
      _runPredictor();
      try { await _decorateMetaCallEntries(); } catch (_e) { /* tolerate */ }
      try { renderAll(); } catch (_e) { /* tolerate */ }
      console.info('[MetaCall] source = current');
    }
  }

  // ── Matchup Lookup ─────────────────────────────────────────
  // Base matchup — pure online-tournament matchup data, no Testing
  // Group / Battle Journal blending. Used by the recommendations
  // engine (where personal overrides only apply to the USER'S deck,
  // not to candidate alternatives).
  // Compute per-deck WR adjustments — the gap between most-recent
  // labs WR and cumulative online WR. Predictor 5.3 deferred item:
  // online matchup data over-rewards elite-pilot decks (Crustle 67 %
  // online vs Dragapult, 43.3 % at LA). The per-deck delta is added
  // symmetrically in getBaseMatchup so the simulator reflects what
  // tournament pilots actually do, not what online enthusiasts do.
  //
  // Guards:
  //   - Need at least 20 D1 players at the most recent major (small
  //     samples produce noisy deltas).
  //   - Need a non-zero online WR (otherwise the delta is undefined).
  //   - Adjustment clamped to [-12, +12] pp so a freak outlier major
  //     can't swing the simulator wildly.
  function _computeMatchupAdjustments() {
    _deckWRAdjustment = {};
    if (!_shareList) return;
    let count = 0;
    _shareList.forEach(d => {
      const k = normalize(d.name);
      const lm = _lastMajorByDeck[k];
      if (!lm || !(lm.day1Players >= 20) || !(lm.winPct > 0)) return;
      const onlineWr = d.onlineWinPct || 0;
      if (onlineWr <= 0) return;
      const delta = _clip(lm.winPct - onlineWr, -12, 12);
      // Skip negligible deltas to keep the map small and the apply
      // path cheap.
      if (Math.abs(delta) < 1.0) return;
      _deckWRAdjustment[k] = delta;
      count++;
    });
    if (count > 0) {
      const top = Object.entries(_deckWRAdjustment)
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
        .slice(0, 5)
        .map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v.toFixed(1)}pp`);
      console.info('[MetaCall] predictor 5.3 — Matchup WR adjustments computed for',
        count, 'decks. Largest:', top.join(', '));
    }
  }

  /**
   * Die Win Rate gegen den Rest des Feldes — gemessen, nicht angenommen.
   *
   * '_junk' fasst alles jenseits von TOP_N zusammen: am 20.08.2026 sind
   * das 106 Decks mit 4.718 Listen, 17,9 % des Feldes. Dagegen stand hier
   * eine feste 55 mit dem Kommentar "assumed WR ... (slight edge)" —
   * ohne Quelle, ohne Bedienelement, ohne einen Hinweis auf der Seite
   * (der zugehoerige Erklaertext mc.junkExplanation wird seit dem Umbau
   * von keiner Stelle mehr gerendert). Sie steuert rund ein Fuenftel
   * jeder angezeigten Day-1-Win-Rate.
   *
   * Nachgemessen: die gewichtete Ø-Win-Rate dieser 106 Decks ist 45,53 %.
   * Ihre Gegner gewinnen also im Mittel 54,47 % — die 55 war gut geraten,
   * aber eben geraten. Jetzt wird sie aus denselben Daten gerechnet, aus
   * denen auch die Anteile kommen, und faellt nur auf die 55 zurueck,
   * wenn nichts messbar ist.
   */
  let _junkWrCacheQuelle = null;
  let _junkWrCacheWert = null;
  function _junkWinRatePct() {
    if (_junkWrCacheQuelle === _shareList && _junkWrCacheWert != null) {
      return _junkWrCacheWert;
    }
    let wert = _settings.junkWinRate;
    try {
      if (Array.isArray(_shareList) && _shareList.length > TOP_N) {
        const rest = [..._shareList]
          .sort((a, b) => (b.onlineShare || 0) - (a.onlineShare || 0))
          .slice(TOP_N)
          .filter(d => (d.onlineShare || 0) > 0 && (d.onlineWinPct || 0) > 0);
        const gewicht = rest.reduce((s, d) => s + d.onlineShare, 0);
        if (gewicht > 0 && rest.length >= 5) {
          const wrRest = rest.reduce((s, d) => s + d.onlineShare * d.onlineWinPct, 0) / gewicht;
          // Ihre Quote ist die Gegenquote meiner. Geklemmt, damit ein
          // kaputter Datentag nicht 0 oder 100 durchreicht.
          wert = Math.min(70, Math.max(30, 100 - wrRest));
        }
      }
    } catch (_e) { /* Rueckfall bleibt die Voreinstellung */ }
    _junkWrCacheQuelle = _shareList;
    _junkWrCacheWert = wert;
    return wert;
  }
  if (typeof window !== 'undefined') window._mcJunkWinRatePct = _junkWinRatePct;

  function getBaseMatchup(deckA, deckB) {
    if (deckB === '_junk') {
      const wr = _junkWinRatePct() / 100;
      return { pWin: wr, pTie: 0.02, pLoss: Math.max(0, 1 - wr - 0.02) };
    }
    const a = normalize(deckA);
    const b = normalize(deckB);

    // Past Meta — ignore the live online matchup matrix and adjustments
    // entirely. The online matrix reflects whatever's currently legal
    // (today: CRI), so blending it 3:1 with TEF-POR major data biases
    // the prediction toward decks/matchups that didn't exist in the
    // past meta. Use labs_tournament_matchups.csv FILTERED to the
    // selected past format as the SOLE source; pairs without
    // ≥MAJOR_MATCHUP_MIN_GAMES sample default to 50/50 (honest
    // "unknown" instead of a fabricated CRI-era guess). The user
    // spotted this when Archaludon Dudunsparce showed a friendly
    // simulated Day-2 chance in Meta Call but actually went 42-54-27
    // (45 % WR, 13 % Day-2) across the real TEF-POR regionals.
    if (_metaSource === 'past') {
      const pastMeta = (_pastMetaFormatKey || '').toUpperCase();
      const metaMap  = pastMeta && _majorMatchupMap ? _majorMatchupMap[pastMeta] : null;
      let majorWin = null;
      let majorGames = 0;
      if (metaMap) {
        const mHit = metaMap[a]?.[b];
        const mRev = !mHit ? metaMap[b]?.[a] : null;
        if (mHit) {
          majorWin = mHit.winPct / 100;
          majorGames = mHit.games;
        } else if (mRev) {
          majorWin = 1 - (mRev.winPct / 100);
          majorGames = mRev.games;
        }
      }
      if (majorWin != null && majorGames >= MAJOR_MATCHUP_MIN_GAMES_PAST) {
        const pWin  = _clip(majorWin, 0.05, 0.95);
        const pTie  = MAJOR_MATCHUP_TIE_RATE;
        return { pWin, pTie, pLoss: Math.max(0, 1 - pWin - pTie) };
      }
      // No labs sample in this meta → honest 50/50. Old behavior was
      // to fall through to the online matrix, which silently injected
      // current-format matchups into a past-format prediction.
      return { pWin: 0.50, pTie: MAJOR_MATCHUP_TIE_RATE, pLoss: 0.48 };
    }

    const hit = _matchupMap?.[a]?.[b];
    const rev = !hit ? _matchupMap?.[b]?.[a] : null;
    let base = hit ? hit
      : rev ? { pWin: rev.pLoss, pTie: rev.pTie, pLoss: rev.pWin }
      : { pWin: 0.50, pTie: 0.02, pLoss: 0.48 };

    // 3-source matchup blend (Day-2 45 % / Day-1 35 % / Online 20 % —
    // user-flagged 2026-06). Fires per-pair when at least one labs-side
    // source has enough samples; missing sources have their weight
    // redistributed proportionally across what's present (no "switching"
    // between sources, no hard cliffs at the sample-size floors).
    //
    // Fallback: if neither Day-1 nor Day-2 has ≥MIN_GAMES samples for a
    // pair (early-meta gap, niche archetype combo), Overall acts as
    // a single Major anchor at weight = Day-1 + Day-2 = 0.80. Online
    // stays at 0.20 so the relative Major-Online split holds across
    // both code paths.
    //
    // Looking across all metas would mix SVI-JTG / TEF-POR / CRI rates
    // for the same archetype name, which is what broke the Past-Meta
    // branch above. Format comes from format_window.current_set;
    // absence (no labs majors for the live format yet) cleanly skips
    // the entire blend and we fall through to online-only.
    // Der Schluessel muss der VOLLE Format-Schluessel sein, nicht das
    // Set allein.
    //
    // _majorMatchupMap wird mit der meta-Spalte von
    // labs_tournament_matchups.csv gefuellt, und die enthaelt
    // ausschliesslich Paarschluessel wie 'TEF-CRI' oder 'SVI-MEG' — nie
    // ein blosses 'PBL'. Der Scraper leitet sie aus den Chunk-Namen
    // 'ALT-NEU' ab (backend/scrapers/labs_tournament_scraper.py), ein
    // PBL-Major bekaeme also 'TEF-PBL'. Mit current_set als Schluessel
    // konnte dieser Blend deshalb NIE greifen — auch kuenftig nicht.
    //
    // Heute faellt das nicht auf, weil ohnehin keine Major-Matchups fuer
    // das laufende Format vorliegen. Es faellt in dem Moment auf, in dem
    // welche vorliegen und der Blend trotzdem stumm bleibt.
    //
    // _lagNeuesteLabsZeile/_activeMetaKeyVoll fuehren den vollen
    // Schluessel; als Rueckfall wird ein Schluessel gesucht, dessen
    // letztes Segment current_set ist — dasselbe Muster, das diese Datei
    // an anderer Stelle schon richtig anwendet.
    const _currentSetOnly = (_formatWindow && _formatWindow.current_set)
      ? String(_formatWindow.current_set).trim().toUpperCase()
      : '';
    const currentMeta = (function () {
      if (!_currentSetOnly) return '';
      if (_activeMetaKeyVoll
          && _activeMetaKeyVoll.split('-').pop() === _currentSetOnly) {
        return _activeMetaKeyVoll;
      }
      const quellen = [_majorMatchupMap, _majorMatchupMapDay1, _majorMatchupMapDay2];
      for (const m of quellen) {
        if (!m) continue;
        const treffer = Object.keys(m).find(
          k => String(k).toUpperCase().split('-').pop() === _currentSetOnly);
        if (treffer) return treffer;
      }
      return _currentSetOnly;
    })();
    const _lookupPair = (map, key1, key2) => {
      if (!map) return null;
      const direct = map[key1]?.[key2];
      if (direct) {
        return { winPct: direct.winPct, games: direct.games, reversed: false };
      }
      const reverse = map[key2]?.[key1];
      if (reverse) {
        return { winPct: 100 - reverse.winPct, games: reverse.games, reversed: true };
      }
      return null;
    };
    const overallMap = (currentMeta && _majorMatchupMap)     ? _majorMatchupMap[currentMeta]     : null;
    const day1Map    = (currentMeta && _majorMatchupMapDay1) ? _majorMatchupMapDay1[currentMeta] : null;
    const day2Map    = (currentMeta && _majorMatchupMapDay2) ? _majorMatchupMapDay2[currentMeta] : null;

    // Gather every qualifying source for this pair. Day-2 + Day-1 carry
    // their own static weights; Overall is held back until we know
    // whether the day-split anchors qualified.
    const sources = [];
    const day2Hit = _lookupPair(day2Map, a, b);
    if (day2Hit && day2Hit.games >= MAJOR_MATCHUP_MIN_GAMES_DAY2) {
      sources.push({
        kind   : 'day2',
        win    : day2Hit.winPct / 100,
        weight : MATCHUP_BLEND_WEIGHT_DAY2,
        games  : day2Hit.games,
      });
    }
    const day1Hit = _lookupPair(day1Map, a, b);
    if (day1Hit && day1Hit.games >= MAJOR_MATCHUP_MIN_GAMES_DAY1) {
      sources.push({
        kind   : 'day1',
        win    : day1Hit.winPct / 100,
        weight : MATCHUP_BLEND_WEIGHT_DAY1,
        games  : day1Hit.games,
      });
    }
    if (sources.length === 0) {
      // No day-split signal at all — try Overall as a single anchor at
      // the combined Day-1 + Day-2 weight. Keeps coverage during the
      // early-meta period when only weekly aggregates have populated.
      const overallHit = _lookupPair(overallMap, a, b);
      if (overallHit && overallHit.games >= MAJOR_MATCHUP_MIN_GAMES) {
        sources.push({
          kind   : 'overall',
          win    : overallHit.winPct / 100,
          weight : MATCHUP_BLEND_WEIGHT_OVERALL_FALLBACK,
          games  : overallHit.games,
        });
      }
    }
    if (sources.length > 0) {
      // Major signal present → add Online as the static 20 % minority
      // and renormalise so the active weights sum to 1.
      sources.push({
        kind   : 'online',
        win    : base.pWin,
        weight : MATCHUP_BLEND_WEIGHT_ONLINE,
        games  : null,
      });
      const totalWeight = sources.reduce((s, x) => s + x.weight, 0);
      let blendedWin = 0;
      for (const s of sources) {
        blendedWin += s.win * (s.weight / totalWeight);
      }
      blendedWin = _clip(blendedWin, 0.05, 0.95);
      const pTie = base.pTie || MAJOR_MATCHUP_TIE_RATE;
      base = {
        pWin : blendedWin,
        pTie ,
        pLoss: Math.max(0, 1 - blendedWin - pTie),
        // Diagnostic — read by the matchup tooltip / debug overlay.
        // Carries the normalised weight per source so a future UI can
        // show "Day-2 45 % (8 games) + Day-1 35 % (24) + Online 20 %".
        _majorSources: sources.map(s => ({
          kind   : s.kind,
          games  : s.games,
          weight : s.weight / totalWeight,
        })),
      };
    }
    // If sources.length === 0 → no labs data for this pair → leave
    // `base` as the online-only matchup. Caller proceeds normally.
    // Predictor 5.3 — apply per-deck WR adjustments. adj is in pp,
    // pWin is 0..1, so divide by 100 to convert. The delta is split
    // between deckA "gets better" and deckB "gets worse"; we apply
    // half as a shift to pWin to keep ties roughly invariant. Clamp
    // to [0.05, 0.95] so the simulator never sees a degenerate
    // matchup (zero or certain).
    const adjA = _deckWRAdjustment[a] || 0;
    const adjB = _deckWRAdjustment[b] || 0;
    if (adjA === 0 && adjB === 0) return base;
    const shift = (adjA - adjB) / 100;
    const pWin = _clip(base.pWin + shift, 0.05, 0.95);
    const pTie = base.pTie;
    const pLoss = Math.max(0, 1 - pWin - pTie);
    return { pWin, pTie, pLoss };
  }

  // Personal-blended matchup — folds in Testing Group win-rate overrides
  // and Battle Journal records on top of getBaseMatchup. Only meaningful
  // when `myDeck` is the user's actual deck of choice.
  function getMatchup(myDeck, opponent) {
    if (opponent === '_junk') {
      const wr = _junkWinRatePct() / 100;
      return { pWin: wr, pTie: 0.02, pLoss: Math.max(0, 1 - wr - 0.02) };
    }
    // Manual override (user-entered) takes top priority. Use normalize-
    // aware lookup so that e.g. 'N's Zoroark' stored via Testing Groups
    // with a straight apostrophe still matches the online-share name
    // 'N's Zoroark' with a curly apostrophe.
    const ov = _findByNormalized(_winRateOverrides, opponent);
    if (ov !== undefined && ov !== '') {
      const pWin = Math.min(0.98, Math.max(0, ov / 100));
      return { pWin, pTie: 0.02, pLoss: Math.max(0, 1 - pWin - 0.02) };
    }
    // Base meta rate — go through getBaseMatchup() so the Past-Meta
    // branch (labs-majors-only matchup matrix), the W3 major×online
    // 3:1 blend, and the Predictor 5.3 WR adjustments all apply
    // consistently. Previously this function looked _matchupMap up
    // directly, which silently bypassed every one of those layers
    // and made the My-Deck Day-2 simulation use the live CRI online
    // matrix even when the user picked TEF-POR as Past Meta.
    const metaBase = getBaseMatchup(myDeck, opponent);

    // Bayesian blend with journal data (meta treated as 30-game prior)
    // Same normalize-aware lookup — the opponent name in the journal
    // may use a different apostrophe style than the online share name.
    const js = _findByNormalized(_journalStats, opponent);
    if (js && js.total >= 1) {
      const META_CONFIDENCE = 30;
      const journalWR   = js.wins / js.total;
      const totalWeight = META_CONFIDENCE + js.total;
      const blendedWin  = (metaBase.pWin * META_CONFIDENCE + journalWR * js.total) / totalWeight;
      const pTie        = metaBase.pTie;
      return { pWin: blendedWin, pTie, pLoss: Math.max(0, 1 - blendedWin - pTie) };
    }
    return metaBase;
  }

  // ── Field Composition ──────────────────────────────────────
  // Build the tournament field: top N decks + custom decks + Junk (auto-rest).
  //
  // Budget model (total = 100%):
  //   1. Start at baseline: each top-N deck = its normalized online share,
  //      Junk = sum of online share of decks outside top N.
  //   2. User personal estimate on a top deck → set that deck's share to
  //      the given value, DELTA is deducted from Junk.
  //   3. Custom decks → added to field, share deducted from Junk.
  //   4. Junk slider sets a minimum-junk floor: if current junk is below
  //      the slider value, pull the shortfall from non-overridden top
  //      decks proportionally.
  //   5. If junk goes negative (too many overrides), cap at 0 and reduce
  //      non-overridden top decks proportionally.
  //
  // This matches Pokémon's official "Main decks ≥ 5% + Best of the Rest +
  // Unclassified" reporting style (see Seville 2026 Phase 1 slides).
  function buildField() {
    if (!_shareList) return [];

    // Normalize online shares so the full list sums to 100
    const totalOnline = _shareList.reduce((s, d) => s + d.onlineShare, 0) || 1;
    const sorted = [..._shareList]
      .map(d => ({ name: d.name, onlineShare: (d.onlineShare / totalOnline) * 100 }))
      .sort((a, b) => b.onlineShare - a.onlineShare);

    const topDecks  = sorted.slice(0, TOP_N);
    const restDecks = sorted.slice(TOP_N);
    const restShare = restDecks.reduce((s, d) => s + d.onlineShare, 0);

    // Baseline allocation
    const alloc = {};
    topDecks.forEach(d => { alloc[d.name] = d.onlineShare; });
    let junk = restShare;

    // Apply personal estimates on top decks — delta comes from Junk
    topDecks.forEach(d => {
      const personal = _personalShares[d.name];
      if (personal !== undefined) {
        junk -= (personal - alloc[d.name]);
        alloc[d.name] = personal;
      }
    });

    // Custom decks — each pulls its share from Junk
    const customs = _customDecks.filter(c => c && c.name && Number(c.share) > 0);
    customs.forEach(c => { junk -= Number(c.share); });

    // Junk slider = minimum floor (pulls from non-overridden top decks if needed)
    const junkFloor = Math.max(0, Math.min(100, Number(_settings.junkPct) || 0));
    if (junkFloor > junk) {
      const needed = junkFloor - junk;
      const nonOv  = topDecks.filter(d => _personalShares[d.name] === undefined);
      const nonOvSum = nonOv.reduce((s, d) => s + alloc[d.name], 0);
      if (nonOvSum > 0) {
        nonOv.forEach(d => { alloc[d.name] -= (alloc[d.name] / nonOvSum) * needed; });
      }
      junk = junkFloor;
    }

    // Cap negative junk (user over-allocated) by reducing non-overridden top decks
    if (junk < 0) {
      const overshoot = -junk;
      const nonOv     = topDecks.filter(d => _personalShares[d.name] === undefined);
      const nonOvSum  = nonOv.reduce((s, d) => s + alloc[d.name], 0);
      if (nonOvSum > 0) {
        nonOv.forEach(d => {
          alloc[d.name] = Math.max(0, alloc[d.name] - (alloc[d.name] / nonOvSum) * overshoot);
        });
      }
      junk = 0;
    }

    // Assemble field
    const field = [];
    topDecks.forEach(deck => {
      field.push({
        name         : deck.name,
        onlineShare  : deck.onlineShare,
        personalShare: _personalShares[deck.name],
        finalShare   : alloc[deck.name],
        count        : Math.round(_settings.totalPlayers * alloc[deck.name] / 100),
      });
    });

    customs.forEach(c => {
      const share = Number(c.share);
      field.push({
        name         : c.name,
        onlineShare  : 0,
        personalShare: share,
        finalShare   : share,
        count        : Math.round(_settings.totalPlayers * share / 100),
        isCustom     : true,
      });
    });

    if (junk > 0.01) {
      field.push({
        name        : '_junk',
        onlineShare : restShare,
        finalShare  : junk,
        count       : Math.round(_settings.totalPlayers * junk / 100),
      });
    }

    return field;
  }

  // Group field entries by main pokemon. Uses _familyKeyForDeck so
  // the override map (data/deck_families.json) wins over the
  // extractMainPokemon heuristic — keeps the variant rollup
  // consistent with _aggregateFieldByFamily.
  function buildGroups(field) {
    const groups = {}, order = [];
    field.forEach(deck => {
      const main = _familyKeyForDeck(deck.name);
      if (!groups[main]) { groups[main] = []; order.push(main); }
      groups[main].push(deck);
    });
    return order.map(main => ({
      main,
      variants   : groups[main],
      totalShare : groups[main].reduce((s, d) => s + d.finalShare, 0),
      totalOnline: groups[main].reduce((s, d) => s + d.onlineShare, 0),
      totalCount : groups[main].reduce((s, d) => s + d.count, 0),
    }));
  }

  // ── Markov Chain – Day 2 Probability ──────────────────────
  function calcDay2(field, deckOverride) {
    const { rounds, day2Points } = _settings;
    // Two modes: blended (with TG / Journal) for the user's own deck,
    // or base-only when computing recommendations for alternative decks
    // where personal overrides don't apply.
    const myDeck     = deckOverride || _settings.myDeck;
    const matchupFn  = deckOverride ? getBaseMatchup : getMatchup;
    const maxPts = rounds * 3;
    let dp = new Float64Array(maxPts + 1);
    dp[0] = 1.0;

    for (let r = 0; r < rounds; r++) {
      const newDp = new Float64Array(maxPts + 1);
      for (let pts = 0; pts <= r * 3; pts++) {
        if (dp[pts] < 1e-14) continue;
        const p = dp[pts];
        for (const deck of field) {
          const share = deck.finalShare / 100;
          if (share <= 1e-9) continue;
          // Skip the candidate matching itself in the field (mirror
          // matches contribute neutral but we treat them as ties).
          const isMirror = normalize(deck.name) === normalize(myDeck);
          const m = isMirror
            ? { pWin: 0.45, pTie: 0.10, pLoss: 0.45 } // mirror approx
            : matchupFn(myDeck, deck.name);
          if (pts + 3 <= maxPts) newDp[pts + 3] += p * share * m.pWin;
          if (pts + 1 <= maxPts) newDp[pts + 1] += p * share * m.pTie;
          newDp[pts]            += p * share * m.pLoss;
        }
      }
      dp = newDp;
    }

    let day2Prob = 0;
    for (let pt = day2Points; pt <= maxPts; pt++) day2Prob += dp[pt];

    let expWin = 0, expTie = 0, expLoss = 0;
    for (const deck of field) {
      const share = deck.finalShare / 100;
      const isMirror = normalize(deck.name) === normalize(myDeck);
      const m = isMirror
        ? { pWin: 0.45, pTie: 0.10, pLoss: 0.45 }
        : matchupFn(myDeck, deck.name);
      expWin  += rounds * share * m.pWin;
      expTie  += rounds * share * m.pTie;
      expLoss += rounds * share * m.pLoss;
    }
    return { day2Prob, dp, expWin, expTie, expLoss };
  }

  // ── Recommendations engine ─────────────────────────────────
  // For each non-junk, non-custom deck in the field, simulates that
  // deck playing through the predicted field (using base matchups,
  // not personal blend) and returns the top N by Day-2 probability.
  // The "winner" of the predicted meta — which deck a player should
  // bring to maximise their tournament-win chance.
  //
  // Candidate pool: top 25 decks from the predicted share list (matches
  // the field's TOP_N=25). High-WR counter-meta picks like Crustle or
  // Festival Lead that sit just outside the top of the share list often
  // have the BEST Day-2 odds against the actual top decks — keeping the
  // pool at 25 ensures they're evaluated. (Bumped from 20 to 25 after
  // Utrecht 2026 surfaced Lucario/Hariyama and Lopunny/Froslass at
  // ~4 % field each — both invisible at the old 20-deck horizon.)
  function calcRecommendations(field, topN = 5) {
    if (!_shareList || !field || field.length === 0) return [];

    const RECO_POOL_SIZE = 25;
    const seen = new Set();
    const candidates = [];

    // 1) Top-N from the share list (RECO_POOL_SIZE = field's TOP_N).
    _shareList.slice(0, RECO_POOL_SIZE).forEach(d => {
      const k = normalize(d.name);
      if (!k || seen.has(k)) return;
      seen.add(k);
      candidates.push(d.name);
    });

    // 2) The user's currently-selected deck — always include so they
    //    can see where their pick ranks even if it's outside top-20.
    if (_settings.myDeck) {
      const myK = normalize(_settings.myDeck);
      if (myK && !seen.has(myK)) {
        seen.add(myK);
        candidates.push(_settings.myDeck);
      }
    }

    // 3) Custom decks the user added to the field — they're intentional
    //    candidates, evaluate them too.
    (_customDecks || []).forEach(c => {
      if (!c || !c.name) return;
      const k = normalize(c.name);
      if (!k || seen.has(k)) return;
      seen.add(k);
      candidates.push(c.name);
    });

    const results = candidates.map(name => {
      const r = calcDay2(field, name);
      return {
        name,
        day2Prob: r.day2Prob,
        expWin: r.expWin,
        avgWR: (r.expWin / _settings.rounds) * 100,
      };
    });
    return results
      .sort((a, b) => (b.day2Prob - a.day2Prob) || (b.avgWR - a.avgWR))
      .slice(0, topN);
  }

  // Dynamic recommendations split — Day-2-fähig list + Geheimtipps.
  //
  //  Day-2-fähig: every candidate from the narrow top-30 pool with
  //               day2Prob ≥ 0.20 ("competitive threshold" — at least
  //               a 1-in-5 chance to make Day 2), bounded to [5..10]
  //               so the list always reads cleanly. If the meta is
  //               shallow, top up to 5 with the next best decks; if
  //               it's deep, cap at 10.
  //
  //  Geheimtipps: 3 off-radar picks below the Day-2 line. Evaluates a
  //               WIDE pool (top-100 of _shareList) so genuinely long-
  //               tail decks — the kind that sit at < 1 % online share
  //               but rate strongly at the last major — can surface
  //               here. Filter: online share < 3 % (genuinely under
  //               the radar) AND at least one strong signal — labs
  //               T8-conv ≥ 0.15, weekly trend ≥ +0.5 %, last-major
  //               win-pct ≥ 50 %, or own day2Prob ≥ 0.20. Each pick
  //               ships with a text reason explaining the signal.
  function calcRecommendationsSplit(field) {
    if (!_shareList || !field || field.length === 0) {
      return { day2: [], geheimtipps: [], day2UeberSchwelle: 0 };
    }
    // Two-tier candidate pool:
    //   - DAY2_POOL_SIZE (30): "established" decks — feed the Day-2-fähig
    //     list. Same top-30 by online share as before.
    //   - TIP_POOL_SIZE (100): wide long-tail pool — feed the Geheimtipps
    //     evaluation so genuinely off-radar decks (e.g. Archaludon
    //     Dudunsparce sitting at ~0.5 % global share but strong labs
    //     Day-2 conv) can reach the scorer. Without this, anything below
    //     rank 30 silently fell into "Others" and was never considered,
    //     even though the Geheimtipps section is explicitly designed for
    //     online-share < 3 % picks.
    //   - MIN_TIP_SHARE: skip microscopic 0.0x % entries that are
    //     statistical noise, not real meta candidates.
    const DAY2_POOL_SIZE = 30;
    const TIP_POOL_SIZE  = 100;
    const MIN_TIP_SHARE  = 0.10;
    const seen = new Set();
    const candidates = [];
    _shareList
      .filter(d => (d.onlineShare || 0) >= MIN_TIP_SHARE)
      .slice(0, TIP_POOL_SIZE)
      .forEach(d => {
        const k = normalize(d.name);
        if (!k || seen.has(k)) return;
        seen.add(k);
        candidates.push(d.name);
      });
    if (_settings.myDeck) {
      const myK = normalize(_settings.myDeck);
      if (myK && !seen.has(myK)) {
        seen.add(myK);
        candidates.push(_settings.myDeck);
      }
    }
    (_customDecks || []).forEach(c => {
      if (!c || !c.name) return;
      const k = normalize(c.name);
      if (!k || seen.has(k)) return;
      seen.add(k);
      candidates.push(c.name);
    });

    // Which candidates are eligible for the Day-2-fähig list (i.e. the
    // narrow "established" subset)? Top-30 by online share, plus the
    // user's own deck + any custom decks they added.
    const day2Eligible = new Set(
      _shareList.slice(0, DAY2_POOL_SIZE).map(d => normalize(d.name))
    );
    if (_settings.myDeck) day2Eligible.add(normalize(_settings.myDeck));
    (_customDecks || []).forEach(c => {
      if (c && c.name) day2Eligible.add(normalize(c.name));
    });

    // Top-N favourable matchups vs the predicted field for a candidate.
    // "Contribution" weighs WR by the opponent's predicted share, so a
    // 65 % WR vs a 10 %-of-field deck outranks an 80 % WR vs a 1 %-of-
    // field niche pick. Used to populate the click-to-expand reason
    // row under each Day-2 recommendation.
    function _topMatchupsVsField(deckName, field, n) {
      const out = [];
      const myK = normalize(deckName);
      field.forEach(opp => {
        if (opp.name === '_junk') return;
        if (normalize(opp.name) === myK) return;
        const m = getBaseMatchup(deckName, opp.name);
        const wr = m.pWin || 0;
        const share = opp.finalShare || opp.onlineShare || 0;
        const contribution = wr * share;
        out.push({ opponent: opp.name, wr, share, contribution });
      });
      return out
        .filter(r => r.share >= 0.5)  // skip tiny share decks for a cleaner reason
        .sort((a, b) => b.contribution - a.contribution)
        .slice(0, n);
    }

    // Recency-weighted aggregate of Day-2 win rate. Used by the d2WR
    // multiplier below. Built per-deck on every reco evaluation;
    // cheap relative to the matchup simulation that dominates this
    // function's runtime.
    function _d2WrAggregate(k) {
      const q = _labsDay2WrByDeck[k];
      if (!q || q.n <= 0) return null;
      return q.sum / q.n;   // 0..100
    }
    // d2WR multiplier — gently scales day2Prob by the deck's
    // historical Day-2 win rate. User-flagged 2026-06 (Indy reco
    // post-mortem): empirical Day-2 *conversion* alone is variance
    // when not backed by WR. d2WR = the share of GAMES a deck wins
    // AFTER making cut. Centered at 50 % (multiplier = 1.0), linear
    // ramp ±10 pp, capped at [0.4, 1.6] so a single weak / strong
    // sample can't dominate.
    //
    //   d2WR  35 %  →  0.40   heavy damp ("deck consistently loses cut")
    //   d2WR  45 %  →  0.50
    //   d2WR  50 %  →  1.00   neutral
    //   d2WR  55 %  →  1.50
    //   d2WR  65 %+ →  1.60   capped
    //
    // Indy reco validation (Festival Lead: avg d2WR 47.5 % → ×0.75;
    // Basic Box: 55.5 % → ×1.55) — the multiplier moves Basic Box
    // and Dragapult-Dudunsparce ahead of Festival Lead in the
    // ranking, matching the user's after-the-fact assessment.
    function _d2WrMultiplier(d2WrPct, majors) {
      if (d2WrPct == null) return 1.0;
      let raw = 1.0 + (d2WrPct - 50) / 10;
      // Eine einzige Beobachtung darf den Hebel nicht bis an die
      // Kappung reissen. Bei n = 1 zaehlt der Ausschlag halb — dieselbe
      // Idee wie die Glaettung der Matchup-Ebene, nur grober, weil hier
      // nur die Turnierzahl bekannt ist.
      if (majors != null && majors <= 1) raw = 1.0 + (raw - 1.0) * 0.5;
      return Math.max(0.4, Math.min(1.6, raw));
    }

    /** Wie viele Majors stecken in der d2WR-Zahl? */
    function _d2WrMajors(k) {
      const q = _labsDay2WrByDeck[k];
      if (!q || !Array.isArray(q.samples)) return 0;
      return new Set(q.samples.map(x => x.tid || x.date)).size;
    }

    const evaluated = candidates.map(name => {
      const r = calcDay2(field, name);
      const topMatchups = _topMatchupsVsField(name, field, 3);
      // Predictor 5.2 Fix #A — blend empirical labs Day-2 conv into
      // the matchup-simulated day2Prob. At LA the simulated top-5
      // were all niche WR picks (Ogerpon Box / Crustle / Clefairy
      // Ogerpon) that underperformed their predictions by ~7 pp,
      // while Dragapult-Family — actual top D2-conv at LA (26.4 %)
      // — wasn't in the list. The matchup matrix flat-lines variants
      // of the same family; empirical labs conv distinguishes them
      // (Dusknoir 32.9 %, Dudunsparce 30.3 %, Pure 25.3 %). 70/30 blend
      // keeps simulation as primary signal but lets labs conv break
      // ties and surface variant specialists.
      const k = normalize(name);
      const q = _labsDay2ConvByDeck[k];
      let blendedDay2 = r.day2Prob;
      let empConv = null;
      if (q && q.n > 0) {
        empConv = _rankWeightedConv(q);
        // Wie viele MAJORS, nicht wie viel Gewicht.
        //
        // q.n ist die Summe der Recency-Gewichte (siehe die Zeile
        // `_labsDay2ConvByDeck[k].n += w` beim Aufbau) — ein Nenner fuer
        // den Mittelwert, keine Anzahl. Der Test darauf las sie aber als
        // Turnierzahl. Im aktuellen Fenster ist w konstant 0,5, weil alle
        // Zeilen vor dem Stichtag liegen: 24 Decks mit ZWEI Majors kamen
        // damit auf n = 1,0 und bekamen 15 % statt 30 % Gewicht, und 12
        // Decks mit EINEM Major auf n = 0,5 und scheiterten an `>= 1`,
        // bekamen also gar kein Gewicht statt 15 %.
        //
        // Die Zahl der Turniere steht daneben, in samples.
        const majors = Array.isArray(q.samples) && q.samples.length
          ? new Set(q.samples.map(x => x.tid || x.date)).size
          : (q.n >= 2 ? 2 : 1);
        const blendW = majors >= 2 ? 0.30 : 0.15;
        blendedDay2 = r.day2Prob * (1 - blendW) + empConv * blendW;
      }
      // d2WR multiplier — applies AFTER the conv blend so the
      // "wins-in-cut" signal modulates the merged simulation +
      // empirical-conversion number, not just one of them.
      const d2WrPct = _d2WrAggregate(k);
      const d2WrMajors = _d2WrMajors(k);
      const d2WrMult = _d2WrMultiplier(d2WrPct, d2WrMajors);
      let adjustedDay2 = blendedDay2 * d2WrMult;

      // Predictor 4.6 inheritance for the reco engine (Hydrapple Indy
      // reco gap). The share-side predictor (in _runPredictor) already
      // boosts a deck's predicted META share when it won a recent
      // regional at low usage — but the reco-side day2Prob never saw
      // that signal, so a fresh Campinas-winner sat behind aggregate
      // metrics. User-flagged 2026-06: a deck that just won a major
      // at < 4 % usage IS the kind of pick that climbs into Top-Cut
      // at the next event (that's what "Underdog-Champion" means);
      // applying the freshness-decayed boost as a multiplicative lift
      // on day2Prob mirrors the share side.
      //
      // Bonus uses the SAME freshness curve as the share-side P4.6
      // (full < 14d, linear decay to 0 at 28d) but the multiplier is
      // a smaller [1.0, 1.5] range so a fresh champion isn't lifted
      // ABOVE Basic-Box-shape decks that have aggregate metrics
      // backing them.
      const champ = _underdogChampionByDeck[k];
      let p46RecoMult = 1.0;
      if (champ && champ.date) {
        const todayISO = _todayISO();
        const ageDays = Math.max(0,
          Math.round((new Date(todayISO) - new Date(champ.date)) / 86400000));
        let fresh = 0;
        if (ageDays <= PREDICTOR_4_6_FULL_DECAY_DAYS) {
          fresh = 1.0;
        } else if (ageDays < PREDICTOR_4_6_ZERO_DECAY_DAYS) {
          fresh = 1.0 - (ageDays - PREDICTOR_4_6_FULL_DECAY_DAYS) /
                  (PREDICTOR_4_6_ZERO_DECAY_DAYS - PREDICTOR_4_6_FULL_DECAY_DAYS);
        }
        const underdogStrength = Math.max(0,
          (PREDICTOR_4_6_MAX_SHARE_PCT - champ.share) / PREDICTOR_4_6_MAX_SHARE_PCT);
        // Multiplier range [1.00, 1.50] — a max-strength fresh win
        // boosts day2Prob by 50 %, decays linearly with age + dilutes
        // with how-close-to-the-4-%-ceiling the deck was at win time.
        p46RecoMult = 1.0 + 0.50 * fresh * underdogStrength;
      }
      adjustedDay2 *= p46RecoMult;

      return {
        name,
        day2Prob: adjustedDay2,
        simDay2Prob: r.day2Prob,
        blendedDay2Prob: blendedDay2,
        empConv,
        d2WrPct,
        d2WrMajors,
        d2WrMult,
        p46RecoMult,
        underdogChampion: champ || null,
        expWin: r.expWin,
        avgWR: (r.expWin / _settings.rounds) * 100,
        topMatchups
      };
    }).sort((a, b) => {
      // Primary: blended day2Prob. Tie-breaker (< 0.02): empirical
      // labs Day-2 conversion — when two candidates have near-equal
      // simulation odds, the one with stronger field-tested cut rate
      // wins. Falls through to avgWR as the final tiebreaker.
      if (Math.abs(a.day2Prob - b.day2Prob) > 0.02) return b.day2Prob - a.day2Prob;
      const ac = a.empConv != null ? a.empConv : 0;
      const bc = b.empConv != null ? b.empConv : 0;
      if (Math.abs(ac - bc) > 0.05) return bc - ac;
      return b.avgWR - a.avgWR;
    });

    // Day-2 list — threshold then bounds.
    // Threshold lowered to 0.20 so a concentrated meta (one mega-family
    // dominating the field, like Dragapult-family at 34 % post-Prag)
    // still surfaces the natural set of Day-2-capable counters instead
    // of artificially stopping at 25 % and padding from there.
    // Restricted to `day2Eligible` (top-30 + user decks) so the long-
    // tail decks we only loaded for the Geheimtipps tier can't leak in.
    // Min/Max bumped to 10/10 (was 5/10) so frozen Past Meta views and
    // calm metas with few decks above the threshold still surface a
    // full list of ranked options instead of stopping at 5.
    const DAY2_THRESHOLD = 0.20;
    const DAY2_MIN = 10;
    const DAY2_MAX = 10;
    const day2Eval = evaluated.filter(e => day2Eligible.has(normalize(e.name)));
    let day2 = day2Eval.filter(e => e.day2Prob >= DAY2_THRESHOLD);
    // Wie viele es WIRKLICH ueber die Schwelle schaffen. Das Abzeichen
    // zeigte bisher die Laenge der aufgefuellten Liste und behauptete
    // damit "10 Day-2-faehig", auch wenn es sechs waren. Die Auffuellung
    // selbst bleibt — sie ist im Kommentar oben begruendet —, sie wird
    // nur nicht mehr mitgezaehlt, und aufgefuellte Zeilen sind markiert.
    const day2UeberSchwelle = day2.length;
    if (day2.length < DAY2_MIN) day2 = day2Eval.slice(0, DAY2_MIN);
    if (day2.length > DAY2_MAX) day2 = day2.slice(0, DAY2_MAX);
    day2 = day2.map(e => (e.day2Prob >= DAY2_THRESHOLD
      ? e : Object.assign({}, e, { unterSchwelle: true })));
    const day2Names = new Set(day2.map(d => normalize(d.name)));

    // Geheimtipps — off-radar, strong-signal picks below the Day-2 line.
    const tipPool = evaluated.filter(e => {
      if (_isMetaBucketLabel(e.name)) return false; // belt-and-braces
      const k = normalize(e.name);
      if (day2Names.has(k)) return false;
      const shareEntry = _shareList.find(d => normalize(d.name) === k);
      const onlineShare = shareEntry ? shareEntry.onlineShare : 0;
      return onlineShare < 3.0; // genuinely off-radar
    });

    const tips = tipPool.map(e => {
      const k = normalize(e.name);
      const shareEntry = _shareList.find(d => normalize(d.name) === k);
      const onlineShare = shareEntry ? shareEntry.onlineShare : 0;
      const trend       = shareEntry ? (shareEntry.trend || 0) : 0;
      const labsConv    = _labsConvByDeck[k] && _labsConvByDeck[k].n > 0
        ? _labsConvByDeck[k].sum / _labsConvByDeck[k].n
        : 0;
      // Predictor 4.4b fallback — when top8_conv_rate is missing,
      // synthesise an equivalent "conv" from the day1→day2 share
      // ratio (qualityRatio − 1) × 0.25 maps a 1.5× overperformer to
      // 0.125 conv-equivalent (just below the 0.15 threshold) and a
      // 2.0× overperformer to 0.25 (= field-mean baseline = strong).
      // Hard-cap at 0.40 (40 %) so a freak qualityRatio of 5× doesn't
      // blow up to a nonsense 113 % "conversion" in the tip-reason
      // tooltip — Top-8 conversion is bounded by 1.0 mathematically
      // (a deck can't have > 100 % of its players make Top 8) and
      // 40 % is already an extreme upper bound for any real archetype.
      const qStats = _labsQualityByDeck[k];
      const qualityRatio = (qStats && qStats.d1 > 0) ? qStats.d2 / qStats.d1 : 0;
      const qD1Pilots = qStats ? (qStats.d1Players || 0) : 0;
      const qD2Pilots = qStats ? (qStats.d2Players || 0) : 0;
      const _labsConvCapped = Math.min(1.0, labsConv);
      // Sample guard (2026-06-12): the synthetic conv only counts
      // when at least 3 pilots played the deck on Day 1 across the
      // window's majors. Below that, "1 of 2 made Day 2" produced a
      // capped 40 % pseudo-conversion that the tips presented as a
      // strong signal (Archaludon / Toxtricity Box at Turin).
      const _syntheticConv  = (qualityRatio > 0 && qD1Pilots >= 3)
        ? Math.min(0.40, Math.max(0, (qualityRatio - 1)) * 0.25 + 0.05)
        : 0;
      const convIsSynthetic = _labsConvCapped <= 0;
      const labsConvEffective = _labsConvCapped > 0 ? _labsConvCapped : _syntheticConv;
      const lm = _lastMajorByDeck[k];
      const lmWr = lm ? lm.winPct : 0;
      // Aggregate score — picks the deck that's most "underrated" on
      // any of the strong-signal axes. Each axis contributes its own
      // strength so we don't lose decks that are strong on just one.
      let score = 0;
      const reasons = [];
      if (labsConvEffective >= 0.15) {
        score += labsConvEffective * 100;
        reasons.push({
          kind: 'conv',
          value: labsConvEffective,
          synthetic: convIsSynthetic,
          ratio: qualityRatio,
          d1Pilots: qD1Pilots,
          d2Pilots: qD2Pilots,
        });
      }
      if (trend >= 0.5) {
        score += trend * 10;
        reasons.push({ kind: 'trend', value: trend });
      }
      // Same sample-size logic for the last-major WR claim: a 54 %
      // win rate from a 2-pilot showing is noise, not a tip reason.
      if (lm && lmWr >= 50 && (lm.players || 0) >= 3) {
        score += (lmWr - 50) * 1.5;
        reasons.push({ kind: 'wr', value: lmWr, share: lm.share, players: lm.players });
      }
      if (e.day2Prob >= 0.20) {
        score += e.day2Prob * 30;
        reasons.push({ kind: 'day2', value: e.day2Prob });
      }
      // Predictor 4.6 surface: a fresh underdog regional win is a
      // strong, qualitatively-different signal from labs WR — it's
      // the empirical "won the last big event at low play rate"
      // pattern (Campinas → Indy). Surfaces alongside the other
      // axes in the Geheimtipp tooltip so the user knows the source.
      const champ = shareEntry ? shareEntry.underdogChampion : null;
      if (champ && champ.boostPP > 0) {
        score += champ.boostPP * 10;
        reasons.push({
          kind:       'underdog',
          event:      champ.event,
          shareAtWin: champ.shareAtWin,
          ageDays:    champ.ageDays,
        });
      }
      // Predictor 5.4 surface: positive Day-2 Δ-share. Distinct
      // from `day2Prob` (Day-2 probability) — this one specifically
      // captures decks the cut PULLS IN (Lillie's Clefairy +1.5 pp
      // at Indy) vs decks the cut merely doesn't shed.
      const growthPP = shareEntry ? (shareEntry.day2GrowthPP || 0) : 0;
      if (growthPP >= 1.0) {
        score += growthPP * 5;
        reasons.push({ kind: 'growth', value: growthPP });
      }
      return {
        ...e,
        score,
        reasons,
        onlineShare,
        labsConv,
        trend,
        lastMajor: lm || null
      };
    })
    .filter(e => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

    return { day2, geheimtipps: tips, day2UeberSchwelle };
  }

  // Poisson P(k; λ)
  function poissonP(k, lambda) {
    if (lambda <= 0) return k === 0 ? 1 : 0;
    let lp = -lambda + k * Math.log(lambda);
    for (let i = 1; i <= k; i++) lp -= Math.log(i);
    return Math.exp(lp);
  }

  /**
   * Genau die Verteilung, die die Day-2-Kette daneben schon benutzt
   * (20.08.2026).
   *
   * P(1×) und P(2×) in der Begegnungsliste rechneten Poisson, waehrend
   * im SELBEN Bereich die Day-2-Wahrscheinlichkeit exakt binomial
   * gerechnet wird. Zwei Verteilungen fuer dieselbe Frage — "wie oft
   * treffe ich dieses Deck in n Runden" —, und die Poisson-Naeherung ist
   * hier nicht einmal gut: sie gilt fuer viele Versuche mit kleiner
   * Wahrscheinlichkeit, und hier sind es acht bis neun Runden mit
   * Anteilen bis ueber 30 %.
   *
   * Gemessen bei 9 Runden:
   *     Anteil 10 %   P(1×)  36,6 %  statt  38,7 %   (-2,2 pp)
   *     Anteil 25 %   P(2×)  26,7 %  statt  30,0 %   (-3,4 pp)
   *     Junk 40 %     P(1×)   9,8 %  statt   6,0 %   (+3,8 pp)
   *
   * Die groesste Abweichung ueber den gepruefteren Bereich lag bei
   * 5,4 Prozentpunkten. Binomial ist hier nicht nur richtiger, sondern
   * auch billiger — n ist einstellig.
   *
   * poissonP bleibt: es wird an anderer Stelle fuer eine andere Frage
   * gebraucht, und ein Loeschen waere eine Aenderung, die niemand
   * angefordert hat.
   */
  function binomialP(k, n, p) {
    if (!(n >= 0) || k < 0 || k > n) return 0;
    if (p <= 0) return k === 0 ? 1 : 0;
    if (p >= 1) return k === n ? 1 : 0;
    let lp = 0;
    for (let i = 1; i <= k; i++) lp += Math.log(n - k + i) - Math.log(i);
    lp += k * Math.log(p) + (n - k) * Math.log1p(-p);
    return Math.exp(lp);
  }
  if (typeof window !== 'undefined') window._mcBinomialP = binomialP;

  // ── Rendering ──────────────────────────────────────────────
  function esc(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Render Limitless Pokémon icons for an archetype name. Returns an
  // <img> or .tcg-pokemon-icon-group HTML ready to inline next to the
  // deck-name text. Empty string when the mapping is absent or the
  // ArchetypeIcons helper hasn't loaded yet — callers MUST keep the
  // text label so missing icons degrade gracefully.
  function _mcIconHtml(deckName) {
    if (typeof window.ArchetypeIcons === 'undefined') return '';
    const urls = window.ArchetypeIcons.getIconUrls(deckName);
    if (!urls || !urls.length) return '';
    const imgs = urls.map(u =>
      `<img class="tcg-pokemon-icon tcg-pokemon-icon--sm" src="${esc(u)}" alt="" loading="lazy" onerror="this.style.display='none'">`
    ).join('');
    return urls.length > 1
      ? `<span class="tcg-pokemon-icon-group tcg-pokemon-icon-group--inline">${imgs}</span>`
      : imgs;
  }

  // Escape for JS string literal inside HTML attribute — needed for
  // deck names with apostrophes (e.g. "N's Zoroark", "Rocket's Mewtwo",
  // "Cynthia's Garchomp"). The apostrophe would otherwise terminate the
  // JS string and break the inline oninput / onclick handler.
  function escJs(s) {
    return String(s)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n');
  }

  // Suggested Swiss round count by attendance — matches the standard
  // table the Limitless Swiss Calculator uses
  // (limitlesstcg.com/tools/swisscalc). Pure heuristic, the user can
  // always override; we just save them the menial step.
  function _suggestSwissRounds(players) {
    const n = Math.max(0, +players || 0);
    if (n <= 8)   return 3;
    if (n <= 16)  return 4;
    if (n <= 32)  return 5;
    if (n <= 64)  return 6;
    if (n <= 128) return 7;
    if (n <= 226) return 8;
    return 9;
  }

  // Suggested Top-Cut size by attendance for Local Cup events:
  // <=16 players run Top 4, 17+ players run Top 8. Matches the
  // typical organiser practice in Pokémon TCG Local Cups.
  function _suggestTopCutSize(players) {
    return (+players || 0) <= 16 ? 4 : 8;
  }

  // Sensible default points-target per tournament type — what the
  // user typically needs to clear to hit the predictor's "success"
  // outcome.
  //
  //   regional  → existing Day 2 threshold (don't touch)
  //   challenge → "shot at 1st/2nd place" — needs near-perfect Swiss
  //               (≈ 3*rounds - 2, e.g. 13 pts in 5 rounds = 4-1)
  //   cup       → safe top-cut threshold. Cut height in Pokémon TCG
  //               Cups depends on cut size, not field size: smaller
  //               cuts demand fewer losses.
  //                 Top 4 → r*3 - 2  (one tie tolerated; e.g. 4R = 3-0-1 = 10 pts, 5R = 4-0-1 = 13 pts)
  //                 Top 8 → r*3 - 3  (one loss tolerated; e.g. 5R = 4-1 = 12 pts, 6R = 5-1 = 15 pts)
  //               These are the floors that historically clear the
  //               cut on resistance — anything lower bubbles too
  //               often to be a useful "success" target.
  function _defaultTargetPoints(type, rounds, topCutSize) {
    const r = Math.max(1, +rounds || 1);
    if (type === 'challenge') {
      // 4-1 in 5 rounds = 12 pts is realistic; we suggest 13 (tied
      // for 4-0-1) as the "1st/2nd ambition" point so the predictor
      // keeps a healthy bar.
      return Math.max(3, r * 3 - 2);
    }
    if (type === 'cup') {
      const tc = +topCutSize || 8;
      const slack = tc <= 4 ? 2 : 3;
      return Math.max(3, r * 3 - slack);
    }
    // regional fallback — keep whatever the user / preset has.
    return null;
  }

  function _typeLabelI18nKey(type) {
    return ({
      regional:  'mc.tournamentTypeRegional',
      challenge: 'mc.tournamentTypeChallenge',
      cup:       'mc.tournamentTypeCup',
    })[type] || 'mc.tournamentTypeRegional';
  }

  function _typeDescI18nKey(type) {
    return ({
      regional:  'mc.tournamentTypeRegionalDesc',
      challenge: 'mc.tournamentTypeChallengeDesc',
      cup:       'mc.tournamentTypeCupDesc',
    })[type] || 'mc.tournamentTypeRegionalDesc';
  }

  // Result-banner title key per active tournament type.
  function _predictTitleKey() {
    const type = _settings.tournamentType;
    if (type === 'cup')       return 'mc.predictTitleTopCut';
    if (type === 'challenge') return 'mc.predictTitleTopFinish';
    return 'mc.predictTitleDay2';
  }

  function renderSettingsPanel() {
    const s = _settings;
    const type = TOURNAMENT_TYPES.includes(s.tournamentType) ? s.tournamentType : 'regional';

    const tabBtn = (key) => {
      const active = key === type ? ' mc-tt-tab-active' : '';
      return `<button type="button" class="mc-tt-tab${active}"
        onclick="MetaCall._setTournamentType('${key}')">${esc(t(_typeLabelI18nKey(key)))}</button>`;
    };

    // Tab-specific field set. Players + Rounds are always there;
    // target-points label changes per type; Cup adds Top Cut size;
    // Local types get a Swiss-calculator helper link.
    const targetLabelKey = type === 'regional'
      ? 'mc.labelDay2Points'
      : (type === 'cup' ? 'mc.labelTargetCutPoints' : 'mc.labelTargetTopPoints');
    const targetHintKey = type === 'regional'
      ? 'mc.targetHintRegional'
      : (type === 'cup' ? 'mc.targetHintCup' : 'mc.targetHintChallenge');

    const swissLink = type === 'regional'
      ? ''
      : `<a class="mc-tt-swisscalc" href="https://limitlesstcg.com/tools/swisscalc" target="_blank" rel="noopener">↗ ${esc(t('mc.swissCalcLink'))}</a>`;

    const cupTopCutField = type === 'cup'
      ? `<div class="metacall-field-group">
           <label>${t('mc.labelTopCut')}</label>
           <select id="mc-topcut" onchange="MetaCall._onSetting('topCutSize', +this.value)">
             <option value="4"${s.topCutSize === 4 ? ' selected' : ''}>${t('mc.topCut4')}</option>
             <option value="8"${s.topCutSize === 8 ? ' selected' : ''}>${t('mc.topCut8')}</option>
           </select>
         </div>`
      : '';

    return `
<div class="metacall-panel">
  <div class="metacall-panel-title">
    ${t('mc.panelSettings')}
  </div>
  <div class="mc-tt-tabs" role="tablist" aria-label="Tournament type">
    ${TOURNAMENT_TYPES.map(tabBtn).join('')}
  </div>
  <p class="mc-tt-hint mc-tt-hint-type">${t(_typeDescI18nKey(type))}</p>
  <div class="metacall-settings-grid">
    <div class="metacall-field-group">
      <label>${t('mc.labelPlayers')}</label>
      <input type="number" id="mc-players" min="2" max="9999"
             value="${_playersInputTouched ? s.totalPlayers : ''}"
             placeholder="${s.totalPlayers}"
             oninput="MetaCall._onSetting('totalPlayers', +this.value)">
    </div>
    <div class="metacall-field-group">
      <label>${t('mc.labelRounds')}</label>
      <input type="number" id="mc-rounds" min="1" max="15" value="${s.rounds}"
             oninput="MetaCall._onSetting('rounds', +this.value)">
    </div>
    <div class="metacall-field-group">
      <label>${t(targetLabelKey)}</label>
      <input type="number" id="mc-day2pts" min="1" max="45" value="${s.day2Points}"
             oninput="MetaCall._onSetting('day2Points', +this.value)">
    </div>
    ${cupTopCutField}
  </div>
  <p class="mc-tt-hint">${t(targetHintKey)} ${swissLink}</p>
</div>`;
  }

  // Source-mix panel — opt-in toggles for City League data. Always
  // enabled so the user can mix CL into the predictor and play with
  // the numbers, even when labs majors / Testing Group data are
  // already driving the field. Earlier the toggles were locked in
  // Meta Call mode panel — pill toggle between 'standard' (online
  // ladder = truth, default) and 'counter' (4.6 family-suppression +
  // 4.7 adoption boost active). Default is standard because 3 of 4
  // recent majors (LA, Prague, Campinas) trended bandwagon-style;
  // counter-mode is opt-in for events where the player base visibly
  // hedges against the dominant deck (Utrecht-style).
  // Combines Source + Meta-Call-Mode + Data Sources into one panel
  // so the user doesn't burn three card-shaped panels on what are
  // really three toggles. Each sub-row is one compact line: label on
  // the left, pill toggles in the middle, hint on the right (or
  // below on narrow viewports — flexbox handles it).
  function _renderCombinedConfigPanel() {
    const source = renderMetaSourcePanel();
    const mode   = renderMetaCallModePanel();
    const data   = renderSourcesPanel();
    if (!source && !mode && !data) return '';
    return `
<div class="metacall-panel mc-combo-panel">
  ${source}
  ${mode}
  ${data}
</div>`;
  }

  function renderMetaCallModePanel() {
    const mode = _metaCallMode === 'counter' ? 'counter' : 'standard';
    const pill = (key, labelKey) => {
      const active = key === mode ? ' mc-tt-tab-active' : '';
      return `<button type="button" class="mc-tt-tab${active}"
        onclick="MetaCall._setMetaCallMode('${key}')">${esc(t(labelKey))}</button>`;
    };
    const hintKey = mode === 'counter' ? 'mc.modeCounterHint' : 'mc.modeStandardHint';
    return `
<div class="mc-combo-row" title="${esc(t(hintKey))}">
  <span class="mc-combo-label">${t('mc.panelMode')}</span>
  <div class="mc-tt-tabs mc-tt-tabs-inline" role="tablist" aria-label="Meta Call mode">
    ${pill('standard', 'mc.modeStandard')}
    ${pill('counter',  'mc.modeCounter')}
  </div>
</div>`;
  }

  // Mode B / when a TG was loaded — that prevented the user from
  // experimenting with what CL data adds on top.
  // Source picker (Current Meta | Past Meta + format dropdown).
  // Hidden entirely when no past-meta chunks are available (manifest
  // missing or empty after current-set filter).
  function renderMetaSourcePanel() {
    if (!Array.isArray(_pastMetaAvailableFormats) || _pastMetaAvailableFormats.length === 0) return '';

    const expander = (typeof window !== 'undefined' && typeof window.expandPastMetaCode === 'function')
      ? window.expandPastMetaCode
      : (k => k);

    // Current-meta pill shows the *live* in-person legal format right
    // in the label so beginners know which set is the source. e.g.
    // "Current Meta · Phantasmal Flames" instead of bare "Current
    // Meta". Falls back to the code (or just the base label) when
    // format_window isn't loaded yet.
    const currentSetCode = (_formatWindow && _formatWindow.current_set)
      ? String(_formatWindow.current_set).trim().toUpperCase()
      : '';
    const currentSetName = currentSetCode ? expander(currentSetCode) : '';
    const currentLabel = currentSetName
      ? `Current Meta · ${currentSetName}`
      : 'Current Meta';

    const pill = (key, label) => {
      const active = key === _metaSource ? ' mc-tt-tab-active' : '';
      return `<button type="button" class="mc-tt-tab${active}"
        onclick="MetaCall._setMetaSource('${key}')">${esc(label)}</button>`;
    };
    const dropdownOptions = _pastMetaAvailableFormats.map(f => {
      const expanded = expander(f.key);
      const display = expanded && expanded !== f.key ? `${expanded} (${f.key})` : f.key;
      const sel = (f.key === _pastMetaFormatKey) ? ' selected' : '';
      return `<option value="${esc(f.key)}"${sel}>${esc(display)}</option>`;
    }).join('');

    // Hint shown next to the format dropdown. In frozen mode the
    // matchup-proxy warning is irrelevant — the frozen panels don't
    // use the matchup matrix at all — so we swap it for a brief note
    // explaining what the user is looking at.
    const frozen = _inFrozenPastMode();
    const hintHtml = frozen
      ? `<span class="mc-source-hint" title="${esc(t('mc.frozenSourceHintTitle'))}">📌 ${esc(t('mc.frozenSourceHint'))}</span>`
      : `<span class="mc-source-hint" title="Matchups use the labs major-tournament matrix for this past format (pairs without ≥10 games default to 50/50). The live online matrix is not blended in — current-format decks don't represent past-format play.">ⓘ Matchups = labs majors</span>`;
    const formatRow = _metaSource === 'past'
      ? `<div class="mc-source-format-row">
           <label class="mc-source-format-label">Format:</label>
           <select class="mc-source-format-select" onchange="MetaCall._setMetaSource('past', this.value)">
             <option value="">— select format —</option>
             ${dropdownOptions}
           </select>
           ${hintHtml}
         </div>`
      : '';

    // Inline hint under the pill row — tells the beginner which tab
    // does what, instead of leaving them to guess from the label.
    const sourceHintText = _metaSource === 'past'
      ? t('mc.sourceHintPast')
      : t('mc.sourceHintCurrent');

    // When Past Meta is active, the row needs the full width — the
    // Source label + 2 pills + Format dropdown + matchup-proxy hint
    // are too wide to share one flex line with Mode + Data Sources.
    const wideClass = _metaSource === 'past' ? ' mc-combo-row-wide' : '';
    return `
<div class="mc-combo-row${wideClass}" title="${esc(sourceHintText)}">
  <span class="mc-combo-label">${t('mc.panelSource')}</span>
  <div class="mc-tt-tabs mc-tt-tabs-inline" role="tablist" aria-label="Meta source">
    ${pill('current', currentLabel)}
    ${pill('past', t('mc.sourcePastMeta'))}
  </div>
  ${formatRow}
</div>`;
  }

  function renderSourcesPanel() {
    const hasCurrent = Object.keys(_clCurrentByDeck).length > 0;
    const hasPast    = Object.keys(_clPastByDeck).length > 0;
    if (!hasCurrent && !hasPast) return ''; // no CL data at all → hide panel

    // Disable only when the dataset itself is empty — never because
    // of mode/TG. The predictor honours `_useClCurrent`/`_useClPast`
    // regardless of mode, so flipping the toggle has a real effect.
    const cbAttrs = (active, hasData) =>
      `${active ? 'checked' : ''}${!hasData ? ' disabled' : ''}`;
    const curCount  = Object.keys(_clCurrentByDeck).length;
    const pastCount = Object.keys(_clPastByDeck).length;

    return `
<div class="mc-combo-row mc-combo-row-checkboxes">
  <span class="mc-combo-label">${t('mc.panelDataSources')}</span>
  <div class="mc-sources-row">
    <label class="mc-source-toggle">
      <input type="checkbox" ${cbAttrs(_useClCurrent, hasCurrent)}
             onchange="MetaCall._onToggleSource('clCurrent', this.checked)">
      <span class="mc-source-label">
        <strong>${t('mc.sourceCurrentCityLeague')}</strong>
        <span class="mc-source-meta">${hasCurrent ? curCount + ' archetypes' : 'no data'}</span>
      </span>
    </label>
    <label class="mc-source-toggle">
      <input type="checkbox" ${cbAttrs(_useClPast, hasPast)}
             onchange="MetaCall._onToggleSource('clPast', this.checked)">
      <span class="mc-source-label">
        <strong>${t('mc.sourcePastCityLeague')}</strong>
        <span class="mc-source-meta">${hasPast ? pastCount + ' archetypes' : 'no data'}</span>
      </span>
    </label>
  </div>
</div>`;
  }

  function _renderFlatDeckRow(deck, maxShare) {
    const isJunk      = deck.name === '_junk';
    const isCustom    = !!deck.isCustom;
    const icons       = isJunk ? '' : _mcIconHtml(deck.name);
    const label       = isJunk ? t('mc.junkDecks') : (icons + esc(deck.name));
    const lambda      = _settings.rounds * deck.finalShare / 100;
    const hasPersonal = deck.personalShare !== undefined;
    const barW        = Math.round((deck.finalShare / Math.max(maxShare, 0.01)) * 100);
    const rowClass    = isJunk ? 'mc-row-junk' : (isCustom ? 'mc-row-custom' : '');
    const encTier     = _avgEncTier(lambda);
    const personalCell = (isJunk || isCustom)
      ? '<span class="mc-cell-dash">—</span>'
      : `<input type="number" min="0" max="100" step="0.1" placeholder="${esc(t('mc.estimatePh'))}"
                value="${hasPersonal ? deck.personalShare : ''}"
                class="mc-personal-input${hasPersonal ? ' has-value' : ''}" data-deck="${esc(deck.name)}"
                oninput="MetaCall._onPersonalShare('${escJs(deck.name)}', this.value)">`;
    const onlineDisplay = isCustom ? '—' : deck.onlineShare.toFixed(2) + '%';
    const intelHtml = (isJunk || isCustom) ? '' : _renderDeckBadge(deck.name);
    const k = normalize(deck.name);
    const expanded = _isDetailExpanded(k);
    const toggleHtml = intelHtml
      ? `<button type="button" class="mc-row-toggle${expanded ? ' is-expanded' : ''}"
                aria-expanded="${expanded ? 'true' : 'false'}"
                aria-label="${esc(t('mc.toggleDetailsAria'))}"
                title="${esc(t('mc.toggleDetailsAria'))}"
                data-deck-key="${esc(k)}"
                onclick="MetaCall._toggleDetail(this)">▾</button>`
      : '';
    const mainRow = `<tr class="mc-row-main ${rowClass}">
      <td class="mc-cell-deck">
        <span class="mc-deck-name">${label}</span>
        ${toggleHtml}
      </td>
      <td class="mc-cell-online"><span class="mc-share-online">${onlineDisplay}</span></td>
      <td class="mc-cell-est">${personalCell}</td>
      <td class="mc-cell-final"><span class="mc-share-final${hasPersonal ? ' has-personal' : ''}">${deck.finalShare.toFixed(2)}%</span></td>
      <td class="mc-cell-players"><span class="mc-players-count">${deck.count.toLocaleString()}</span></td>
      <td class="mc-cell-enc">
        <div class="mc-encounters-bar mc-enc-${encTier}">
          <div class="mc-bar-bg"><div class="mc-bar-fill" style="width:${barW}%"></div></div>
          <span class="mc-encounters-label">∅ ${lambda.toFixed(2)}</span>
        </div>
      </td>
    </tr>`;
    const detailRow = intelHtml
      ? `<tr class="mc-row-detail${expanded ? '' : ' is-collapsed'}" data-deck-key="${esc(k)}">
          <td colspan="6">${intelHtml}</td>
        </tr>`
      : '';
    return mainRow + detailRow;
  }

  // Effective expanded-state for a deck row, given the global mode +
  // per-row overrides. See _detailGlobalMode comment for the model.
  function _isDetailExpanded(k) {
    const def = _detailGlobalMode === 'expanded';
    return _detailOverrides.has(k) ? !def : def;
  }

  // Classify the AVG. ENC. lambda into a 3-tier traffic-light scale so
  // the bar colour conveys "is this deck rare / normal / very common
  // for the chosen field size?" at a glance.
  //   ≤ 0.8  → green   (you'll likely face this 0–1 times in 8 rounds)
  //   ≤ 1.2  → yellow  (about once)
  //   > 1.2  → red     (multiple expected encounters)
  function _avgEncTier(lambda) {
    if (lambda <= 0.8) return 'low';
    if (lambda <= 1.2) return 'mid';
    return 'high';
  }

  // Renders a status banner showing the predictor's data picture —
  // mode (A = online-only, B = major-anchored), how many labs rows
  // were dropped by the format-window filter, what the current set is
  // and when it rotates in-person. Surfaces the "TEF-POR data being
  // weighed for a CRI-era prediction" failure mode the user spotted.
  function _renderPredictorStatusBanner() {
    const fw = _formatWindow;
    if (!fw && _predictorMode !== 'B' && _labsMajorRows === 0) return '';
    // Suppress in Mode A — the "Online ladder only / Data window from …"
    // detail surfaces noise without informing a routine read. The
    // Source panel + per-deck Online column already convey the live
    // source. Once major data lands and the predictor flips to Mode B,
    // the banner becomes substantive (counts the weighted majors) and
    // is shown again.
    // UMGEKEHRT gegenueber dem Zustand bis zum 17.08.2026. Der Banner war
    // ausgerechnet in Mode A unterdrueckt — also genau dann, wenn die
    // Prognose auf reiner Online-Ladder beruht. Am 17.08. lief die Seite so:
    // PBL war seit 17 Tagen in Person legal, die neueste Labs-Zeile stammte
    // vom 10.06. aus dem Vorformat, 4520 von 4667 Turnierzeilen wurden
    // verworfen — und die UI zeigte "Source: Current Meta · PBL" ueber einer
    // vollstaendigen Feldtabelle. Der Nutzer konnte "Prognose aus sechs
    // Regionals" nicht von "Prognose aus reiner Ladder" unterscheiden; beide
    // Faelle sahen identisch aus, obwohl die Verlaesslichkeit um
    // Groessenordnungen auseinanderliegt.
    //
    // Mode A ist der Fall, der den Hinweis BRAUCHT. In Mode B faellt er
    // knapper aus, weil dort echte Turnierdaten dahinterstehen.

    const mode    = _predictorMode === 'B' ? 'B' : 'A';
    const setCode = (fw && fw.current_set) ? String(fw.current_set).toUpperCase() : '';
    const expander = (typeof window !== 'undefined' && typeof window.expandPastMetaCode === 'function')
      ? window.expandPastMetaCode
      : (k => k);
    const setName = setCode ? expander(setCode) : '';
    const legalISO = fw && fw.in_person_legal_date;
    const todayISO = _todayISO();
    const daysToLegal = (legalISO && todayISO)
      ? Math.round((new Date(legalISO) - new Date(todayISO)) / 86400000)
      : null;
    const rotationPending = daysToLegal !== null && daysToLegal > 0;

    const labsCount = _labsMajorRows || 0;
    const labsDropped = (window.__mcLabsDroppedCount | 0);
    const effCutoff = (typeof _effectiveDateCutoff === 'function') ? _effectiveDateCutoff() : null;

    // Mode label + class
    const modeLabel = mode === 'B'
      ? t('mc.predStatusModeB').replace('{n}', labsCount)
      : t('mc.predStatusModeA');
    const modeClass = mode === 'B' ? 'mc-pred-status-mode-b' : 'mc-pred-status-mode-a';

    // Format line — "Current format: TEF-CRI (CRI · Chaos Rising) · rotates in-person in N days"
    const formatLine = setCode
      ? (rotationPending
          ? t('mc.predStatusFormatPending')
              .replace('{set}', setCode)
              .replace('{name}', setName)
              .replace('{days}', daysToLegal)
              .replace('{date}', legalISO)
          : t('mc.predStatusFormatActive')
              .replace('{set}', setCode)
              .replace('{name}', setName))
      : '';

    // Filter line — only shown when the format-window filter actually
    // dropped rows (gives a clear audit trail for why mode A is on).
    const filterLine = labsDropped > 0
      ? t('mc.predStatusFilterDropped')
          .replace('{dropped}', labsDropped)
          .replace('{total}', labsDropped + labsCount)
      : '';

    // Cutoff line — surface the effective date window. During a fresh
    // rotation this is the set release date (so prior-format buckets
    // never leak in); after ~28 days it's the rolling 28-day window.
    const cutoffLine = effCutoff
      ? t('mc.predStatusCutoff').replace('{date}', effCutoff)
      : '';

    return `
<div class="mc-predictor-status ${modeClass}">
  <div class="mc-pred-status-row">
    <span class="mc-pred-status-mode-badge">${esc(modeLabel)}</span>
    ${formatLine ? `<span class="mc-pred-status-format">${esc(formatLine)}</span>` : ''}
  </div>
  ${cutoffLine ? `<div class="mc-pred-status-filter">${esc(cutoffLine)}</div>` : ''}
  ${filterLine ? `<div class="mc-pred-status-filter">${esc(filterLine)}</div>` : ''}
</div>`;
  }

  function renderFieldPanel(field) {
    let rows;
    if (_groupByMain) {
      const groups  = buildGroups(field);
      const maxShare = Math.max(...groups.map(g => g.totalShare), 0.1);
      rows = groups.map((group, gi) => {
        if (group.variants.length === 1) {
          return _renderFlatDeckRow(group.variants[0], maxShare);
        }
        const gid    = `mcg-${gi}`;
        const lambda = _settings.rounds * group.totalShare / 100;
        const barW   = Math.round((group.totalShare / maxShare) * 100);
        const groupEncTier = _avgEncTier(lambda);
        const header = `
<tr class="mc-row-main mc-group-header" onclick="MetaCall._toggleGroup('${gid}')">
  <td class="mc-cell-deck">
    <span class="mc-group-arrow" id="mc-gt-${gid}">▶</span>
    <span class="mc-deck-name">${_mcIconHtml(group.main)}${esc(_familyDisplayForKey(group.main))}</span>
    <span class="mc-group-count">${group.variants.length} ${t('mc.variants')}</span>
  </td>
  <td class="mc-cell-online"><span class="mc-share-online">${group.totalOnline.toFixed(2)}%</span></td>
  <td class="mc-cell-est"><span class="mc-cell-dash">—</span></td>
  <td class="mc-cell-final"><span class="mc-share-final">${group.totalShare.toFixed(2)}%</span></td>
  <td class="mc-cell-players"><span class="mc-players-count">${group.totalCount.toLocaleString()}</span></td>
  <td class="mc-cell-enc">
    <div class="mc-encounters-bar mc-enc-${groupEncTier}">
      <div class="mc-bar-bg"><div class="mc-bar-fill" style="width:${barW}%"></div></div>
      <span class="mc-encounters-label">∅ ${lambda.toFixed(2)}</span>
    </div>
  </td>
</tr>`;
        const details = group.variants.map(deck => {
          const hasP   = deck.personalShare !== undefined;
          const dLam   = _settings.rounds * deck.finalShare / 100;
          const dBarW  = Math.round((deck.finalShare / maxShare) * 100);
          const dEncTier = _avgEncTier(dLam);
          const pCell  = `<input type="number" min="0" max="100" step="0.1" placeholder="${esc(t('mc.estimatePh'))}"
                            value="${hasP ? deck.personalShare : ''}"
                            class="mc-personal-input${hasP ? ' has-value' : ''}" data-deck="${esc(deck.name)}"
                            oninput="MetaCall._onPersonalShare('${escJs(deck.name)}', this.value)">`;
          const variantIntel = _renderDeckBadge(deck.name);
          const dk = normalize(deck.name);
          const variantExpanded = _isDetailExpanded(dk);
          const variantToggle = variantIntel
            ? `<button type="button" class="mc-row-toggle${variantExpanded ? ' is-expanded' : ''}"
                       aria-expanded="${variantExpanded ? 'true' : 'false'}"
                       aria-label="${esc(t('mc.toggleDetailsAria'))}"
                       title="${esc(t('mc.toggleDetailsAria'))}"
                       data-deck-key="${esc(dk)}"
                       onclick="event.stopPropagation();MetaCall._toggleDetail(this)">▾</button>`
            : '';
          const variantMain = `<tr class="mc-row-main mc-group-detail mc-group-hidden" data-group="${gid}">
            <td class="mc-cell-deck mc-cell-deck-variant">
              <span class="mc-deck-name mc-variant-name">${_mcIconHtml(deck.name)}${esc(deck.name)}</span>
              ${variantToggle}
            </td>
            <td class="mc-cell-online"><span class="mc-share-online">${deck.onlineShare.toFixed(2)}%</span></td>
            <td class="mc-cell-est">${pCell}</td>
            <td class="mc-cell-final"><span class="mc-share-final${hasP ? ' has-personal' : ''}">${deck.finalShare.toFixed(2)}%</span></td>
            <td class="mc-cell-players"><span class="mc-players-count">${deck.count.toLocaleString()}</span></td>
            <td class="mc-cell-enc">
              <div class="mc-encounters-bar mc-enc-${dEncTier}">
                <div class="mc-bar-bg"><div class="mc-bar-fill" style="width:${dBarW}%"></div></div>
                <span class="mc-encounters-label">∅ ${dLam.toFixed(2)}</span>
              </div>
            </td>
          </tr>`;
          // Detail row for the variant — hidden both by group-collapse
          // (mc-group-hidden, parent state) AND by per-row collapse
          // (is-collapsed, this row's own state).
          const variantDetail = variantIntel
            ? `<tr class="mc-row-detail mc-group-detail mc-group-hidden${variantExpanded ? '' : ' is-collapsed'}" data-group="${gid}" data-deck-key="${esc(dk)}">
                 <td colspan="6">${variantIntel}</td>
               </tr>`
            : '';
          return variantMain + variantDetail;
        }).join('');
        return header + details;
      }).join('');
    } else {
      const maxShare = Math.max(...field.map(d => d.finalShare), 0.1);
      rows = field.map(deck => _renderFlatDeckRow(deck, maxShare)).join('');
    }

    // The "Group variants by family" toggle is a power-user feature.
    // On mobile, keep only the icon (🔗 / 📊) — the verbose label
    // would otherwise hog the row and push other controls off-screen.
    // The .mc-btn-text span is hidden via CSS at <600px.
    const groupBtnFullLabel = _groupByMain ? t('mc.flatView') : t('mc.groupByPokemon');
    const groupBtnIcon  = _groupByMain ? '📊' : '🔗';
    const groupBtnTextOnly = groupBtnFullLabel.replace(/^[^\wÀ-ſ]+\s*/, '').trim();

    // Global "Collapse / Expand all" — flips the default state for
    // every detail row. Label reflects what clicking will DO, not
    // the current state.
    const allCollapsed = _detailGlobalMode === 'collapsed';
    const allBtnLabel  = allCollapsed ? t('mc.expandAll') : t('mc.collapseAll');
    const allBtnIcon   = allCollapsed ? '▾' : '▴';

    return `
<div class="metacall-panel">
  <div class="metacall-panel-title">
    <span class="mc-panel-title-text">${t('mc.panelField')}</span>
    <span class="mc-badge">Top ${TOP_N}</span>
    <span class="mc-badge" id="mc-players-badge">${_settings.totalPlayers.toLocaleString()} ${t('mc.labelPlayers')}</span>
    <button class="mc-collapse-all-btn" onclick="MetaCall._toggleAllDetails()" title="${esc(allBtnLabel)}" aria-label="${esc(allBtnLabel)}">
      <span class="mc-btn-icon">${allBtnIcon}</span>
      <span class="mc-btn-text">${esc(allBtnLabel)}</span>
    </button>
    <button class="mc-group-toggle-btn" onclick="MetaCall._toggleGroupField()" title="${esc(groupBtnFullLabel)}" aria-label="${esc(groupBtnFullLabel)}">
      <span class="mc-btn-icon">${groupBtnIcon}</span>
      <span class="mc-btn-text">${esc(groupBtnTextOnly)}</span>
    </button>
    <button class="mc-share-btn" onclick="MetaCall.exportFieldShareImage()" title="${esc(t('mc.shareField'))}" aria-label="${esc(t('mc.shareField'))}">
      <span class="mc-btn-icon">📤</span>
      <span class="mc-btn-text">${t('mc.share')}</span>
    </button>
  </div>
  <div class="mc-field-info" role="note">
    <span class="mc-field-info-icon" aria-hidden="true">ℹ️</span>
    <span class="mc-field-info-text">${t('mc.personalShareExpl')}</span>
  </div>
  <div class="metacall-table-wrap">
    <table class="metacall-table">
      <colgroup>
        <col class="col-deck">
        <col class="col-online">
        <col class="col-est">
        <col class="col-final">
        <col class="col-players">
        <col class="col-enc">
      </colgroup>
      <thead>
        <tr>
          <th class="mc-th-deck">${t('mc.headerDeck')}</th>
          ${/* Hiess bis zum 18.08.2026 "Online %", zeigt aber d.onlineShare —
               und das ist seit Zeile 3916 (d.onlineShare = d.predictedShare)
               die Modellausgabe, nicht der rohe Anteil. Gemessen am selben
               Tag, Zeile Dragapult: Spalte 13,10 %, Detailzeile derselben
               Zeile "Online-Share heute 7,1 %", Quelldatei
               limitless_online_decks.csv 7,06 %. Faktor 1,86. Der Tooltip
               nannte die Spalte dabei "die Basisdaten".
               Der Wert ist richtig, der Name war falsch. */ ''}
          <th class="mc-th-online" title="${esc(t('mc.headerOnlineTooltip'))}">${t('mc.headerOnline')}</th>
          <th class="mc-th-est" title="${esc(t('mc.headerPersonalTooltip'))}">${t('mc.headerPersonal')}</th>
          <th class="mc-th-final" title="${esc(t('mc.headerFinalTooltip'))}">${t('mc.headerFinal')}</th>
          <th class="mc-th-players">${t('mc.headerPlayers')}</th>
          <th class="mc-th-enc" title="${esc(t('mc.headerAvgEncTooltip').replace('{n}', _settings.rounds))}">${t('mc.headerAvgEnc')} (${_settings.rounds} R.)</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</div>`;
  }

  function renderCustomDecksPanel() {
    const suggestionOpts = (_shareList || [])
      .map(d => `<option value="${esc(d.name)}">`).join('');

    const rowsHtml = _customDecks.map((c, idx) => `
      <div class="mc-custom-row">
        <input type="text" class="mc-custom-name-input" list="mc-custom-datalist"
               placeholder="${esc(t('mc.customDeckNamePh'))}" value="${esc(c.name || '')}"
               oninput="MetaCall._onCustomDeckName(${idx}, this.value)">
        <input type="number" class="mc-custom-share-input" min="0" max="100" step="0.1"
               placeholder="%" value="${c.share > 0 ? c.share : ''}"
               oninput="MetaCall._onCustomDeckShare(${idx}, this.value)">
        <button type="button" class="mc-custom-remove-btn" title="${esc(t('mc.remove'))}"
                onclick="MetaCall._removeCustomDeck(${idx})">×</button>
      </div>`).join('');

    const canAdd = _customDecks.length < MAX_CUSTOM;
    const maxedLabel = t('mc.customDecksMaxed').replace(/\{n\}/g, MAX_CUSTOM);
    const hintText   = t('mc.customDecksHint').replace('{max}', MAX_CUSTOM);
    const addBtn = canAdd
      ? `<button type="button" class="mc-custom-add-btn" onclick="MetaCall._addCustomDeck()">
           + ${t('mc.addCustomDeck')}
         </button>`
      : `<p class="mc-custom-max-hint">${maxedLabel}</p>`;

    return `
<div class="metacall-panel mc-custom-decks-panel" id="mc-custom-decks-panel">
  <div class="metacall-panel-title">
    ${t('mc.customDecksTitle')}
    <span class="mc-badge">${_customDecks.length}/${MAX_CUSTOM}</span>
  </div>
  <p class="mc-custom-hint">${hintText}</p>
  <div class="mc-custom-list">${rowsHtml}</div>
  ${addBtn}
  <datalist id="mc-custom-datalist">${suggestionOpts}</datalist>
</div>`;
  }

  function renderMyDeckPanel() {
    const decks   = (_shareList || []).map(d => d.name);
    const options = decks.map(n => `<option value="${esc(n)}"></option>`).join('');
    const currentDeck = _settings.myDeck || '';

    return `
<div class="metacall-panel">
  <div class="metacall-panel-title">${t('mc.panelMyDeck')}</div>
  <div class="mc-deck-select-row">
    <div class="mc-deck-search-wrap">
      <input type="text" id="mc-my-deck"
             class="mc-deck-search-input"
             list="mc-my-deck-options"
             placeholder="${esc(t('mc.selectDeckPlaceholder'))}"
             value="${esc(currentDeck)}"
             autocomplete="off"
             spellcheck="false"
             aria-label="${esc(t('mc.panelMyDeck'))}"
             oninput="MetaCall._onMyDeckInput(this.value)"
             onchange="MetaCall._onMyDeckCommit(this)">
      <datalist id="mc-my-deck-options">${options}</datalist>
    </div>
    <button class="mc-override-toggle" onclick="MetaCall._toggleOverrides()" id="mc-override-btn">
      ${t('mc.adjustWinRates')}
    </button>
    <div class="mc-brick-filter-wrap">
      <label class="mc-brick-filter-label">${t('mc.journalBricks')}</label>
      <select class="mc-brick-filter-select" onchange="MetaCall._onBrickFilter(this.value)">
        <option value="all" ${!_settings.excludeBricks ? 'selected' : ''}>${t('mc.inclBricks')}</option>
        <option value="exclude" ${_settings.excludeBricks ? 'selected' : ''}>${t('mc.exclBricks')}</option>
      </select>
    </div>
  </div>
  <div class="mc-override-panel" id="mc-override-panel">
    ${renderOverrideTable()}
  </div>
  <div class="mc-swiss-note">${t('mc.swissNote')}</div>
</div>`;
  }

  function renderOverrideTable() {
    if (!_settings.myDeck || !_shareList) {
      return `<p style="color:#aaa;font-size:0.85rem;padding:8px 0">${t('mc.selectDeckFirst')}</p>`;
    }
    const field = buildField().filter(d => d.name !== '_junk');
    const rows  = field.map(deck => {
      const m   = getMatchup(_settings.myDeck, deck.name);
      const wr  = Math.round(m.pWin * 100);
      const ind = wr >= 55 ? 'favorable' : wr <= 45 ? 'unfavorable' : 'even';
      const lbl = wr >= 55 ? t('mc.favorable') : wr <= 45 ? t('mc.unfavorable') : t('mc.even');
      const ov  = _winRateOverrides[deck.name];
      const js  = _journalStats[deck.name];
      const fromJournal = _journalRateKeys.includes(deck.name);
      const badge = fromJournal && js
        ? ` <span class="mc-journal-badge-inline" title="${t('mc.personalGames').replace('{n}', js.total)}">📓 ${js.total}</span>`
        : '';
      return `<tr>
        <td style="font-size:0.85rem;font-weight:600">${esc(deck.name)}${badge}</td>
        <td><span class="mc-wr-meta">${wr}%</span></td>
        <td class="mc-wr-indicator ${ind}">${lbl}</td>
        <td class="mc-wr-override">
          <input type="number" min="0" max="100" placeholder="${wr}"
                 value="${ov !== undefined ? ov : ''}"
                 oninput="MetaCall._onWrOverride('${escJs(deck.name)}', this.value)">
        </td>
      </tr>`;
    }).join('');

    return `
<p style="font-size:0.78rem;color:#888;margin:10px 0 8px">${t('mc.overrideHint')}</p>
<table class="mc-override-table">
  <thead>
    <tr><th>${t('mc.colOpponent')}</th><th>${t('mc.colWrBlended')}</th><th>${t('mc.colIndicator')}</th><th>${t('mc.colManualWr')}</th></tr>
  </thead>
  <tbody>${rows}</tbody>
</table>`;
  }

  function renderResultsPanel(field) {
    if (!_settings.myDeck) {
      return `
<div class="metacall-panel">
  <div class="mc-no-deck-msg">${t('mc.noDeckMsg')}</div>
</div>`;
    }

    const { day2Prob, dp, expWin, expTie, expLoss } = calcDay2(field);
    const pct    = (day2Prob * 100).toFixed(1);
    const cls    = day2Prob >= 0.6 ? '' : day2Prob >= 0.4 ? ' pct-mid' : ' pct-low';
    const maxPts = _settings.rounds * 3;

    // Journal influence summary
    const journalOpps = Object.keys(_journalStats).filter(opp => (_journalStats[opp] || {}).total > 0);
    const totalJGames = journalOpps.reduce((s, opp) => s + (_journalStats[opp].total || 0), 0);
    const journalBadge = journalOpps.length > 0 ? `
<div class="mc-journal-influence">
  <span class="mc-ji-icon">📓</span>
  <div>
    <strong>${t('mc.journalInfluence')}</strong> ${t('mc.journalMatchups').replace('{n}', journalOpps.length).replace('{g}', totalJGames)}
    <span class="mc-ji-hint"> ${t('mc.journalWeightHint')}</span>
  </div>
</div>` : '';

    // Points histogram
    const maxProb  = Math.max(...dp, 0.001);
    const histBars = Array.from(dp).map((prob, pts) => {
      const h   = Math.round((prob / maxProb) * 100);
      const cls = pts >= _settings.day2Points ? 'above-threshold' : 'below-threshold';
      const lbl = pts % 3 === 0 ? pts : '';
      return `<div class="mc-hist-bar-wrap">
        <div class="mc-hist-bar ${cls}" style="height:${h}%"></div>
        <div class="mc-hist-label">${lbl}</div>
      </div>`;
    }).join('');

    const thresholdPct = (_settings.day2Points / maxPts * 100).toFixed(1);

    const topDecks = [...field].sort((a, b) => b.finalShare - a.finalShare).slice(0, TOP_N);
    const maxEnc   = Math.max(...topDecks.map(d => _settings.rounds * d.finalShare / 100), 0.1);
    const encRows  = topDecks.map(deck => {
      const lambda = _settings.rounds * deck.finalShare / 100;
      const m      = getMatchup(_settings.myDeck, deck.name);
      const wrPct  = Math.round(m.pWin * 100);
      const wrCls  = wrPct >= 55 ? 'favorable' : wrPct <= 45 ? 'unfavorable' : 'even';
      const barW   = Math.round((lambda / maxEnc) * 100);
      const name   = deck.name === '_junk' ? t('mc.junkDecks') : deck.name;
      // Binomial, nicht Poisson — siehe die Notiz bei binomialP().
      const pRunde = Math.max(0, Math.min(1, deck.finalShare / 100));
      const p1     = binomialP(1, _settings.rounds, pRunde) * 100;
      const p2     = binomialP(2, _settings.rounds, pRunde) * 100;
      const js     = _journalStats[deck.name];
      const jTag   = js && js.total > 0
        ? `<span class="mc-enc-journal-tag" title="${t('mc.personalGames').replace('{n}', js.total)}">📓${js.total}</span>`
        : '';
      return `<div class="mc-encounter-row">
        <div>
          <div class="mc-enc-name" title="${esc(deck.name)}">${esc(name)}${jTag}</div>
          <div class="mc-enc-wr ${wrCls}">WR ${wrPct}% · P(1×) ${p1.toFixed(0)}% · P(2×) ${p2.toFixed(0)}%</div>
        </div>
        <div class="mc-enc-bar-bg"><div class="mc-enc-bar-fill" style="width:${barW}%"></div></div>
        <div class="mc-enc-val">∅ ${lambda.toFixed(2)}</div>
      </div>`;
    }).join('');

    const day2Sub = t('mc.day2Sub')
      .replace('{pts}', _settings.day2Points)
      .replace('{r}',   _settings.rounds)
      .replace('{n}',   _settings.totalPlayers.toLocaleString());

    return `
<div class="metacall-panel">
  <div class="metacall-panel-title">
    ${t('mc.panelResult')}
    <button class="mc-share-btn" onclick="MetaCall.exportDay2ShareImage()" title="${esc(t('mc.shareDay2'))}">
      📤 ${t('mc.share')}
    </button>
  </div>
  ${journalBadge}
  <div class="metacall-results-grid">

    <div class="mc-day2-card">
      <div class="mc-day2-deck-name">${esc(_settings.myDeck)}</div>
      <div class="mc-day2-pct${cls}">${pct}%</div>
      <div class="mc-day2-label">${t(_predictTitleKey())}</div>
      <div class="mc-day2-sub">${day2Sub}</div>
      <div class="mc-day2-stats">
        <div class="mc-day2-stat">
          <div class="mc-day2-stat-val" style="color:#27ae60">${expWin.toFixed(1)}</div>
          <div class="mc-day2-stat-lbl">${t('mc.avgWins')}</div>
        </div>
        <div class="mc-day2-stat">
          <div class="mc-day2-stat-val" style="color:#f39c12">${expTie.toFixed(1)}</div>
          <div class="mc-day2-stat-lbl">${t('mc.avgTies')}</div>
        </div>
        <div class="mc-day2-stat">
          <div class="mc-day2-stat-val" style="color:#e74c3c">${expLoss.toFixed(1)}</div>
          <div class="mc-day2-stat-lbl">${t('mc.avgLosses')}</div>
        </div>
      </div>
    </div>

    <div>
      <div class="mc-histogram-wrap">
        <div class="mc-histogram-title">${t('mc.histTitle').replace('{r}', _settings.rounds)}</div>
        <div class="mc-histogram" style="position:relative">
          ${histBars}
          <div class="mc-threshold-line" style="left:${thresholdPct}%">
            <div class="mc-threshold-tag">${t('mc.thresholdTag').replace('{n}', _settings.day2Points)}</div>
          </div>
        </div>
        <div class="mc-histogram-axis">
          <span>0 ${t('mc.ptsAbbr')}</span>
          <span style="color:#27ae60">${t('mc.histDay2Label').replace('{n}', _settings.day2Points)}</span>
          <span>${maxPts} ${t('mc.ptsAbbr')}</span>
        </div>
      </div>

      <div class="mc-section-sep">${esc(t('mc.encounters').replace('{r}', String(_settings.rounds)))}</div>
      <div class="mc-encounter-list">${encRows}</div>
    </div>
  </div>
</div>`;
  }

  // ── Full Render ────────────────────────────────────────────
  function renderAll() {
    const container = document.getElementById('metaCallHost');
    if (!container || !_shareList) return;
    const field = buildField();
    // Date-window control — duplicates the picker in Card Analysis so
    // users on the Meta Call tab can narrow the predictor's input
    // window without context-switching. Both inputs read/write the
    // same window.currentMetaDateFrom state via the global
    // setCurrentMetaDateFrom (defined in app-current-meta-analysis.js)
    // so changes here also re-paint the Card Analysis tables.
    const _dateCutoff = (typeof window !== 'undefined') ? window.currentMetaDateFrom : null;
    const _dateValue = (_dateCutoff && /^\d{4}-\d{2}-\d{2}$/.test(_dateCutoff)) ? _dateCutoff : '';
    const _autoCutoff = (!_dateValue && typeof _effectiveDateCutoff === 'function')
      ? _effectiveDateCutoff() : null;
    const _activeWindowText = _dateValue
      ? t('mc.dateWindowActive').replace('{date}', _dateValue)
      : (_autoCutoff
          ? t('mc.dateWindowAuto').replace('{date}', _autoCutoff)
          : t('mc.dateWindowNone'));
    const dateBanner = `
      <div class="metacall-date-window">
        <label class="metacall-date-label" for="metacallDateFrom"
               title="${esc(t('mc.dateWindowHelp'))}">📅 ${t('mc.dateWindowLabel')}
          <span class="metacall-date-help-icon" title="${esc(t('mc.dateWindowHelp'))}">ⓘ</span>
        </label>
        <input type="date" id="metacallDateFrom" class="metacall-date-input"
               value="${_dateValue}"
               onchange="if (typeof setCurrentMetaDateFrom === 'function') setCurrentMetaDateFrom(this.value)">
        <button type="button" class="metacall-date-clear"
                onclick="if (typeof clearCurrentMetaDateFrom === 'function') clearCurrentMetaDateFrom()"
                ${_dateValue ? '' : 'style="display:none"'}>Clear</button>
        <span class="metacall-date-window-hint">${_activeWindowText}</span>
      </div>`;
    container.innerHTML = `
<div class="metacall-wrap">
  <div class="metacall-header">
    <h2>${t('mc.title')} <button class="tab-help-btn" onclick="openTabHelp('meta-call')" title="Help" aria-label="Help for Meta Call" data-i18n-title="btn.helpTitle"></button></h2>
    <p class="color-grey">${t('mc.subtitle')}</p>
  </div>
  <div class="mc-top-bar">
    ${renderScenariosBar()}
    ${dateBanner}
  </div>
  ${_inFrozenPastMode() ? '' : _renderCombinedConfigPanel()}
  ${renderSettingsPanel()}
  ${_inFrozenPastMode() ? renderFrozenBanner() : ''}
  ${/* Der GROSSE Statusstreifen (_renderPredictorStatusBanner) bleibt
       aus. Am 12.06.2026 abgeschaltet, mit Recht: "Data window: from
       2026-05-22 onwards · 4520 of 4585 major-tournament rows
       excluded" ist Maschinenzustand, keine Nutzeraussage. Abrufbar
       ueber MetaCall._renderPredictorStatusBanner in der Konsole. */ ''}
  ${/* Der KLEINE Streifen dagegen war nie verdrahtet — renderPredictorBanner
       existierte samt Stylesheet (css/meta-call.css:1646) und wurde von
       keiner Stelle aufgerufen. Nachgemessen am 18.08.2026: 0 Aufrufe im
       ganzen Projekt.
       Er beantwortet die eine Frage, die man einer Vorhersage stellen
       muss, bevor man ein Turnier danach plant: worauf beruht sie? Der
       Satz dazu lag fertig und uebersetzt in i18n.js ('mc.bannerModeA':
       "Erstes Major im Meta — Vorhersage basiert auf Online-Ladder und
       Online-Turnier-Top-8"). Ohne ihn verwirft die Maschine still
       4.520 von 4.667 Turnierzeilen und laeuft im reinen Ladder-Modus
       weiter, und im sichtbaren Text steht davon kein Wort.
       Die Diagnose-Marken (Quelle, aktive Rotation) sind dabei
       ausgeblendet — sonst waere das derselbe Fehler wie oben. */ ''}
  ${_inFrozenPastMode() ? '' : renderPredictorBanner()}
  ${_inFrozenPastMode() ? '' : renderFieldPanel(field)}
  ${_inFrozenPastMode() ? '' : renderCustomDecksPanel()}
  ${_inFrozenPastMode() ? '' : renderMyDeckPanel()}
  ${_inFrozenPastMode() ? '' : renderResultsPanel(field)}
  ${_inFrozenPastMode() ? renderFrozenSharePanel() : ''}
  ${_inFrozenPastMode() ? renderFrozenRecommendationsPanel() : renderRecommendationsPanel(field)}
</div>`;
  }

  // True when the currently-selected source is a closed past meta. Used
  // by renderAll to swap the live-predictor panels (Mode toggle, CL
  // sources, custom decks, My Deck simulation, Results) for the smaller
  // "Fun-Event" view that just shows the final share table + the
  // Final-Cumulative ranking. Custom decks / My Deck / Results all
  // depend on the matchup simulator which isn't meaningful for a closed
  // historical meta, so hiding them removes the temptation to read
  // simulator output as real prediction.
  function _inFrozenPastMode() {
    return _metaSource === 'past'
      && !!_pastMetaFormatKey
      && _isPastMetaFrozen(_pastMetaFormatKey);
  }

  // Recommendations panel — top N decks ranked by Day-2 probability
  // against the predicted field. Uses base matchups (no personal
  // overrides) since recommendations are about which deck to PICK,
  // not how a specific deck performs. The user's currently-selected
  // deck gets a small "you're playing this" badge so they see where
  // their pick ranks vs the alternatives.
  function renderRecommendationsPanel(field) {
    const split = calcRecommendationsSplit(field);
    if (!split.day2.length && !split.geheimtipps.length) return '';
    const myDeckNorm = normalize(_settings.myDeck || '');

    // Build a normalized → finalShare lookup so the rec row can
    // surface a "Counter-Pick" chip when a recommendation has very
    // low field presence (F-05 from visual sweep: Crustle as #1 at
    // 1.38 % field share looked like a bug to the user; it isn't,
    // it's the predictor surfacing a niche deck with strong matchups
    // — but the UI had nothing telling them that). Threshold mirrors
    // the geheimtipps cutoff so the labelling stays consistent across
    // the two surfaces.
    const fieldShareByName = {};
    field.forEach(d => {
      if (d && d.name && typeof d.finalShare === 'number') {
        fieldShareByName[normalize(d.name)] = d.finalShare;
      }
    });
    const COUNTER_PICK_MAX_SHARE = 3.0;

    const renderRow = (r, i) => {
      const isMine = myDeckNorm && normalize(r.name) === myDeckNorm;
      const icon = (typeof window.ArchetypeIcons !== 'undefined')
        ? window.ArchetypeIcons.getIconHtml(r.name, { size: 'sm', layout: 'inline' })
        : '';
      const day2Pct = (r.day2Prob * 100).toFixed(1).replace('.', ',');
      const wrPct   = r.avgWR.toFixed(1).replace('.', ',');
      // Aufgefuellte Zeilen als solche kennzeichnen: die Liste ist immer
      // zehn Zeilen lang, auch wenn weniger Decks die 20 % erreichen.
      const unterSchwelleTag = r.unterSchwelle
        ? `<span class="mc-rec-unter-schwelle" title="${esc(t('mc.recBelowThresholdTip'))}">${
            esc(t('mc.recBelowThreshold'))}</span>`
        : '';
      const fieldShare = fieldShareByName[normalize(r.name)] || 0;
      // 2026-06-12: counter-pick badge removed from the rec rows per user
      // feedback — the truncated "COUNTER-P" pill (see CSS clip) was
      // visually noisy and the signal is already implicit in the
      // ranking (low field share + high Day-2 odds = counter-pick by
      // construction). The classifier + i18n keys stay live so we can
      // re-introduce as a filter/legend later without re-deriving it.
      const isCounterPick = fieldShare > 0 && fieldShare < COUNTER_PICK_MAX_SHARE;
      void isCounterPick;
      const counterPickTag = '';
      const safeNameJs = escJs(r.name);
      const reasonId = 'mc-rec-reason-' + normalize(r.name).replace(/[^a-z0-9]/g, '');
      // Reason row HTML — top-3 favourable matchups + the Day-2-odds
      // breakdown. Hidden by default; toggled by the chevron button.
      const matchupRows = (r.topMatchups || []).map(mu => {
        const wrPctStr = (mu.wr * 100).toFixed(0);
        const shareStr = mu.share.toFixed(1).replace('.', ',');
        return `<li>
          <span class="mc-rec-reason-vs">${t('mc.reasonVs')} ${esc(mu.opponent)}</span>
          <span class="mc-rec-reason-wr">${wrPctStr} % ${t('mc.reasonWr')}</span>
          <span class="mc-rec-reason-share">${t('mc.reasonShare').replace('{n}', shareStr)}</span>
        </li>`;
      }).join('');
      // d2WR diagnostic — when available, surface the deck's
      // recency-weighted Day-2 win rate alongside the matchup
      // breakdown. Color-coded so a < 50 % d2WR is clearly a red
      // flag even if the row sits high on simulated day2Prob.
      // User-flagged 2026-06 Indy reco post-mortem: distinguishes
      // Basic Box-shape (55 % d2WR, wins cut) from Festival Lead
      // shape (47 % d2WR, makes cut but loses early).
      // Die Beschriftung sagte "letzte 5 Majors" und meinte hoechstens
      // zwei. Der Bestand enthaelt genau zwei Turniere; bei 9 von 23
      // Decks steht die Zahl auf EINEM. Der Multiplikator laeuft
      // trotzdem bis an seine Kappung (x0,4 / x1,6) — eine einzige
      // Beobachtung von 46 % oder 56 % reicht dafuer. Jetzt traegt die
      // Zeile ihre Stichprobe, und bei einem einzigen Major wird der
      // Ausschlag halbiert.
      const d2WrN = r.d2WrMajors || 0;
      const d2WrHtml = (r.d2WrPct != null)
        ? `<div class="mc-rec-d2wr ${r.d2WrPct >= 52 ? 'mc-rec-d2wr-good'
              : r.d2WrPct >= 49 ? 'mc-rec-d2wr-mid'
              : 'mc-rec-d2wr-weak'}"
             title="${esc(t('mc.d2WrTooltip'))}">
            <span class="mc-rec-d2wr-label">${esc(t('mc.d2WrLabel'))}:</span>
            <span class="mc-rec-d2wr-value">${r.d2WrPct.toFixed(1).replace('.', ',')} %</span>
            ${d2WrN ? `<span class="mc-rec-d2wr-n">${esc(
                t('mc.d2WrSample').replace('{n}', String(d2WrN)))}</span>` : ''}
            <span class="mc-rec-d2wr-mult">×${r.d2WrMult.toFixed(2).replace('.', ',')}</span>
          </div>`
        : '';
      // Empirical companion to the simulated Day-2 odds: how often
      // this deck actually made cut at majors (regionals + special
      // events), recency-weighted. User asked to extend the
      // dark-horse-style track-record signal to the Top-10 list —
      // r.empConv is already on every evaluated row, just wasn't
      // exposed in the rec-row expand panel. Re-uses the same
      // good/mid/weak color tiers as d2WrHtml so the two read as one
      // history block. Threshold tiers chosen to match the
      // tipReasonConv "Strong ≥ 0.15" cutoff: good ≥ 25 %, mid ≥ 15 %,
      // weak otherwise.
      const d2ConvHtml = (r.empConv != null && r.empConv > 0)
        ? (() => {
            const pct = r.empConv * 100;
            const cls = pct >= 25 ? 'mc-rec-d2wr-good'
                      : pct >= 15 ? 'mc-rec-d2wr-mid'
                      : 'mc-rec-d2wr-weak';
            return `<div class="mc-rec-d2wr ${cls}" title="${esc(t('mc.d2ConvTooltip'))}">
              <span class="mc-rec-d2wr-label">${esc(t('mc.d2ConvLabel'))}:</span>
              <span class="mc-rec-d2wr-value">${pct.toFixed(1).replace('.', ',')} %</span>
            </div>`;
          })()
        : '';
      // Always-visible compact history line under the deck name —
      // user feedback 2026-06-12: the Major track record shouldn't
      // hide behind the expand chevron ("wollten wir nicht bei den
      // Top 10 Picks auch Daten dazu schreiben"). Shows the same two
      // numbers the expand panel details: empirical Day-2 cut rate +
      // post-cut win rate, both from labs majors.
      const historyParts = [];
      if (r.empConv != null && r.empConv > 0) {
        historyParts.push(`${t('mc.histD2Conv')} ${(r.empConv * 100).toFixed(1).replace('.', ',')} %`);
      }
      if (r.d2WrPct != null) {
        historyParts.push(`${t('mc.histD2Wr')} ${r.d2WrPct.toFixed(1).replace('.', ',')} %`);
      }
      const historyLine = historyParts.length
        ? `<span class="mc-rec-history-line" title="${esc(t('mc.d2ConvTooltip'))}">${esc(t('mc.histPrefix'))} ${esc(historyParts.join(' · '))}</span>`
        : '';

      const reasonHtml = matchupRows
        ? `<div class="mc-rec-reason-block">
            ${d2WrHtml}
            ${d2ConvHtml}
            <div class="mc-rec-reason-title">${esc(t('mc.reasonTopMatchups'))}</div>
            <ul class="mc-rec-reason-list">${matchupRows}</ul>
            <div class="mc-rec-reason-breakdown">${
              t('mc.reasonBreakdown')
                .replace('{wins}', r.expWin.toFixed(2).replace('.', ','))
                .replace('{rounds}', String(_settings.rounds))
                .replace('{day2}', day2Pct)
            }</div>
            <button class="mc-rec-reason-jump" type="button"
                    onclick="event.stopPropagation(); MetaCall._jumpToDeckAnalysis('${safeNameJs}')">
              ${esc(t('mc.reasonOpenAnalysis'))} →
            </button>
          </div>`
        : `<div class="mc-rec-reason-block mc-rec-reason-empty">${esc(t('mc.reasonNone'))}</div>`;
      return `<tr class="mc-rec-row${isMine ? ' mc-rec-mine' : ''}"
            onclick="MetaCall._toggleRecReason('${reasonId}', this)"
            title="${esc(t('mc.recReasonHint'))}"
            tabindex="0"
            data-reason-id="${reasonId}">
        <td class="mc-rec-rank">${i + 1}</td>
        <td class="mc-rec-name"><span class="mc-rec-name-inner">${icon}<span class="mc-rec-name-text">${esc(r.name)}</span>${isMine ? `<span class="mc-rec-mine-tag">${esc(t('mc.recYourDeck'))}</span>` : ''}${counterPickTag}</span>${historyLine}</td>
        <td class="mc-rec-day2"><strong>${day2Pct}%</strong>${unterSchwelleTag}</td>
        <td class="mc-rec-wr">${wrPct}%</td>
        <td class="mc-rec-wins">∅ ${r.expWin.toFixed(2)}</td>
        <td class="mc-rec-toggle"><span class="mc-rec-chevron" aria-hidden="true">▼</span></td>
      </tr>
      <tr class="mc-rec-reason-row" id="${reasonId}" hidden>
        <td colspan="6">${reasonHtml}</td>
      </tr>`;
    };

    const day2Rows = split.day2.map(renderRow).join('');

    // Geheimtipps — text-first cards under the Day-2 list. Each one
    // explains in plain language why the deck is being highlighted.
    const tipsHtml = split.geheimtipps.length ? `
      <div class="mc-tips-block">
        <div class="mc-tips-title">${esc(t('mc.tipsTitle'))}</div>
        <p class="mc-tips-hint">${esc(t('mc.tipsHint'))}</p>
        <div class="mc-tips-grid">
          ${split.geheimtipps.map((tip) => {
            const safeNameJs = escJs(tip.name);
            const icon = (typeof window.ArchetypeIcons !== 'undefined')
              ? window.ArchetypeIcons.getIconHtml(tip.name, { size: 'sm', layout: 'inline' })
              : '';
            const day2Pct = (tip.day2Prob * 100).toFixed(1).replace('.', ',');
            const reasonText = _formatTipReasons(tip);
            // Pill label matches active tournament type so Cup tabs
            // show "Top 4 / Top 8" and Challenge shows "1.-2.".
            const pillLabel = _settings.tournamentType === 'cup'
              ? `Top ${_settings.topCutSize || 8}`
              : (_settings.tournamentType === 'challenge' ? '1.-2.' : t('mc.recDay2'));
            return `<div class="mc-tip-card" tabindex="0"
                  title="${esc(t('mc.recJumpHint'))}"
                  onclick="MetaCall._jumpToDeckAnalysis('${safeNameJs}')">
              <div class="mc-tip-head">
                <span class="mc-tip-name">${icon}${esc(tip.name)}</span>
                <span class="mc-tip-day2">${esc(pillLabel)}: <strong>${day2Pct}%</strong></span>
              </div>
              <div class="mc-tip-reason">${esc(reasonText)}</div>
            </div>`;
          }).join('')}
        </div>
      </div>` : '';

    const day2Section = split.day2.length ? `
      <p class="mc-rec-hint">${esc(t('mc.recHintDay2'))}</p>
      <table class="mc-rec-table">
        <thead><tr>
          <th>#</th>
          <th>${t('mc.recDeck')}</th>
          <th>${t('mc.recDay2')}</th>
          <th>${t('mc.recAvgWr')}</th>
          <th>${t('mc.recExpWins')}</th>
          <th class="mc-rec-toggle-th" aria-label="Why?"></th>
        </tr></thead>
        <tbody>${day2Rows}</tbody>
      </table>` : '';

    // Share button mirrors the one on the Field panel — same teal
    // style, same icon-only rendering on mobile (inherits the
    // existing .mc-share-btn rules). Calls the side-by-side export
    // so the produced PNG combines Field Composition + the Day-2
    // recommendations the user is currently looking at.
    const shareLabel = t('mc.shareFieldAndRecs') || t('mc.share');
    const shareBtn = `<button class="mc-share-btn" onclick="MetaCall.exportFieldAndRecsShareImage()" title="${esc(shareLabel)}" aria-label="${esc(shareLabel)}">
      <span class="mc-btn-icon">📤</span>
      <span class="mc-btn-text">${esc(t('mc.share'))}</span>
    </button>`;

    return `
<div class="metacall-panel mc-rec-panel">
  <div class="metacall-panel-title">
    ${t('mc.panelRecommendations')}
    <span class="mc-badge">${t('mc.recBadgeDay2Count').replace('{n}',
        (split.day2UeberSchwelle != null ? split.day2UeberSchwelle : split.day2.length))}</span>
    ${shareBtn}
  </div>
  ${day2Section}
  ${tipsHtml}
</div>`;
  }

  // ── Frozen past meta — closed-format Fun-Event view ──────────
  //
  // When the user opens a past meta whose in-person window has elapsed,
  // the live predictor adds no value (no future tournaments to predict
  // against, no fresh online data shaping the field). renderAll swaps
  // the predictor panels for this pair of read-only views:
  //
  //   - renderFrozenBanner — explains the mode, no controls
  //   - renderFrozenRecommendationsPanel — Final-Cumulative ranking
  //     (winPct × (1 + day2Conv)) sourced from the per-meta labs CSV
  //
  // Both intentionally avoid the simulator entirely. The user asked for
  // a "Fun-Event-Modus" — a list of decks that actually performed in
  // that meta, not a prediction of how they'd do today.
  function renderFrozenBanner() {
    const expander = (typeof window !== 'undefined' && typeof window.expandPastMetaCode === 'function')
      ? window.expandPastMetaCode
      : (k => k);
    const expanded = expander(_pastMetaFormatKey);
    const display = expanded && expanded !== _pastMetaFormatKey
      ? `${expanded} (${_pastMetaFormatKey})`
      : (_pastMetaFormatKey || '');
    return `
<div class="metacall-frozen-banner">
  <span class="metacall-frozen-icon">📌</span>
  <div class="metacall-frozen-text">
    <strong>${esc(t('mc.frozenBannerTitle'))}</strong>
    <span class="metacall-frozen-meta">${esc(display)}</span>
    <p class="metacall-frozen-hint">${esc(t('mc.frozenBannerHint'))}</p>
  </div>
</div>`;
  }

  // Final-Cumulative ranking table. Reads from the labs aggregate cache
  // that _setMetaSource kicks off when switching INTO a frozen meta;
  // if the aggregate hasn't resolved yet (first paint), renders a
  // "loading" placeholder — the .then() in _setMetaSource calls
  // renderAll again once data lands. If there's no labs file for the
  // meta (older chunks pre-date the labs scraper), renders an empty
  // state instead of failing.
  // Final share breakdown for a frozen past meta. Reads straight from
  // the labs aggregate (player-share — what fraction of every Day-1
  // entrant brought that deck) so the table matches what users see on
  // Limitless's past-meta pages. No predictor inflation here, no
  // group-by-family toggle, no personal-share input — this is a
  // retrospective record, not a prediction surface.
  function renderFrozenSharePanel() {
    if (!_pastMetaFormatKey) return '';
    const cached = _pastMetaLabsCache.get(_pastMetaFormatKey);
    if (cached === undefined) {
      return `
<div class="metacall-panel mc-frozen-share-panel">
  <div class="metacall-panel-title">${esc(t('mc.frozenShareTitle'))}</div>
  <p class="mc-rec-hint">${esc(t('mc.frozenRecLoading'))}</p>
</div>`;
    }
    if (cached === null || !cached.archetypes || cached.archetypes.length === 0 || !cached.totalPlayers) {
      return '';
    }

    const total = cached.totalPlayers;
    const sorted = cached.archetypes
      .slice()
      .sort((a, b) => b.players - a.players);

    const maxShare = (sorted[0].players / total) * 100 || 0.1;
    const rows = sorted.map((a, i) => {
      const share = (a.players / total) * 100;
      const shareStr = share.toFixed(2).replace('.', ',');
      const barW = Math.round((share / maxShare) * 100);
      const icon = (typeof window.ArchetypeIcons !== 'undefined')
        ? window.ArchetypeIcons.getIconHtml(a.name, { size: 'sm', layout: 'inline' })
        : '';
      return `<tr class="mc-frozen-share-row">
        <td class="mc-frozen-share-rank">${i + 1}</td>
        <td class="mc-frozen-share-name"><span class="mc-rec-name-inner">${icon}<span class="mc-rec-name-text">${esc(a.name)}</span></span></td>
        <td class="mc-frozen-share-pct">
          <div class="mc-frozen-share-bar"><div class="mc-frozen-share-bar-fill" style="width:${barW}%"></div></div>
          <span class="mc-frozen-share-pct-val"><strong>${shareStr}%</strong></span>
        </td>
        <td class="mc-frozen-share-players">${a.players.toLocaleString()}</td>
      </tr>`;
    }).join('');

    const totalsHint = t('mc.frozenShareTotals')
      .replace('{archetypes}', String(sorted.length))
      .replace('{players}', total.toLocaleString())
      .replace('{n}', String(cached.tournamentCount));

    return `
<div class="metacall-panel mc-frozen-share-panel">
  <div class="metacall-panel-title">
    ${esc(t('mc.frozenShareTitle'))}
    <span class="mc-badge">${esc(t('mc.frozenShareBadge'))}</span>
  </div>
  <p class="mc-rec-hint">${esc(t('mc.frozenShareHint'))}</p>
  <p class="mc-rec-hint mc-rec-hint-meta">${esc(totalsHint)}</p>
  <table class="mc-frozen-share-table">
    <thead><tr>
      <th>#</th>
      <th>${esc(t('mc.recDeck'))}</th>
      <th>${esc(t('mc.frozenShareColShare'))}</th>
      <th>${esc(t('mc.frozenColPlayers'))}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
  }

  function renderFrozenRecommendationsPanel() {
    if (!_pastMetaFormatKey) return '';
    const cached = _pastMetaLabsCache.get(_pastMetaFormatKey);
    if (cached === undefined) {
      // Not loaded yet — show a slim loading state. The .then() in
      // _setMetaSource triggers a re-render once the labs CSV resolves.
      return `
<div class="metacall-panel mc-rec-panel">
  <div class="metacall-panel-title">${t('mc.frozenRecPanelTitle')}</div>
  <p class="mc-rec-hint">${esc(t('mc.frozenRecLoading'))}</p>
</div>`;
    }
    if (cached === null || !cached.archetypes || cached.archetypes.length === 0) {
      return `
<div class="metacall-panel mc-rec-panel">
  <div class="metacall-panel-title">${t('mc.frozenRecPanelTitle')}</div>
  <p class="mc-rec-hint">${esc(t('mc.frozenRecEmpty'))}</p>
</div>`;
    }

    // Filter out micro-sample archetypes — anything with <30 total
    // players across the meta's tournaments is noise (one player going
    // 6-0 lands at 100 % winPct and would otherwise top the list).
    const MIN_PLAYERS = 30;
    const eligible = cached.archetypes.filter(a => a.players >= MIN_PLAYERS);
    const display  = (eligible.length >= 5 ? eligible : cached.archetypes).slice(0, 10);

    const rows = display.map((a, i) => {
      const icon = (typeof window.ArchetypeIcons !== 'undefined')
        ? window.ArchetypeIcons.getIconHtml(a.name, { size: 'sm', layout: 'inline' })
        : '';
      const winStr   = a.winPct.toFixed(1).replace('.', ',');
      const day2Str  = (a.day2Conv * 100).toFixed(1).replace('.', ',');
      const scoreStr = a.score.toFixed(1).replace('.', ',');
      return `<tr class="mc-rec-row">
        <td class="mc-rec-rank">${i + 1}</td>
        <td class="mc-rec-name"><span class="mc-rec-name-inner">${icon}<span class="mc-rec-name-text">${esc(a.name)}</span></span></td>
        <td class="mc-rec-score"><strong>${scoreStr}</strong></td>
        <td class="mc-rec-wr">${winStr}%</td>
        <td class="mc-rec-day2conv">${day2Str}%</td>
        <td class="mc-rec-players">${a.players.toLocaleString()}</td>
      </tr>`;
    }).join('');

    const tournHint = t('mc.frozenRecTournHint')
      .replace('{n}', String(cached.tournamentCount))
      .replace('{archetypes}', String(display.length));

    return `
<div class="metacall-panel mc-rec-panel">
  <div class="metacall-panel-title">
    ${t('mc.frozenRecPanelTitle')}
    <span class="mc-badge">${esc(t('mc.frozenRecBadge'))}</span>
  </div>
  <p class="mc-rec-hint">${esc(t('mc.frozenRecHint'))}</p>
  <p class="mc-rec-hint mc-rec-hint-meta">${esc(tournHint)}</p>
  <table class="mc-rec-table mc-rec-table-frozen">
    <thead><tr>
      <th>#</th>
      <th>${t('mc.recDeck')}</th>
      <th title="${esc(t('mc.frozenColScoreHint'))}">${t('mc.frozenColScore')}</th>
      <th>${t('mc.frozenColWinPct')}</th>
      <th>${t('mc.frozenColDay2Conv')}</th>
      <th>${t('mc.frozenColPlayers')}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
  }

  // Build the human-readable reason line for a Geheimtipp. Picks the
  // strongest reason (or combines two short ones) so the text stays
  // scannable without burying the user in numbers.
  function _formatTipReasons(tip) {
    if (!tip.reasons || !tip.reasons.length) return '';
    const fmt = (n, dp) => n.toFixed(dp).replace('.', ',');
    const onlineShareTxt = `${fmt(tip.onlineShare, 1)} %`;
    // Reason priority: underdog-win > labs conv > major WR > Δ-growth > trend > day2.
    // The underdog champion signal is the rarest + strongest predictor
    // (Campinas → Indy pattern), so it leads when present. Growth (Δ-pp
    // gained in Day-2) outranks raw Day-2 probability since the Day-2
    // probability mostly reflects the deck's existing share.
    const order = ['underdog', 'conv', 'wr', 'growth', 'trend', 'day2'];
    const sorted = tip.reasons.slice().sort(
      (a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)
    );
    const parts = sorted.slice(0, 2).map(r => {
      switch (r.kind) {
        case 'underdog':
          return t('mc.tipReasonUnderdog')
            .replace('{event}',  r.event || t('mc.intelMajorFallback'))
            .replace('{share}',  fmt(r.shareAtWin, 1))
            .replace('{ageDays}', String(r.ageDays));
        case 'conv':
          // Synthetic conv = derived from the Day-1→Day-2 share ratio
          // at majors, NOT from a real top-8 stat (the scraper doesn't
          // populate top8_conv_rate in the current window). Say what
          // the data actually shows — pilots in, pilots through —
          // instead of dressing it up as a Top-8 number (2026-06-12
          // user report: Archaludon "40 % Top-8 conversion" despite
          // never seeing Turin's Top 8).
          if (r.synthetic) {
            return t('mc.tipReasonCutGain')
              .replace('{d2}', String(r.d2Pilots))
              .replace('{d1}', String(r.d1Pilots))
              .replace('{ratio}', fmt(r.ratio, 1))
              .replace('{share}', onlineShareTxt);
          }
          return t('mc.tipReasonConv')
            .replace('{conv}', fmt(r.value * 100, 1))
            .replace('{share}', onlineShareTxt);
        case 'wr': {
          const where = (_lastMajorInfo && _lastMajorInfo.shortName) || t('mc.intelMajorFallback');
          return t('mc.tipReasonWr')
            .replace('{wr}', fmt(r.value, 0))
            .replace('{share}', `${fmt(r.share, 1)} %`)
            .replace('{where}', where);
        }
        case 'growth':
          return t('mc.tipReasonGrowth')
            .replace('{growth}', '+' + fmt(r.value, 1))
            .replace('{share}', onlineShareTxt);
        case 'trend':
          return t('mc.tipReasonTrend')
            .replace('{trend}', '+' + fmt(r.value, 1))
            .replace('{share}', onlineShareTxt);
        case 'day2':
          return t('mc.tipReasonDay2')
            .replace('{day2}', fmt(r.value * 100, 1))
            .replace('{share}', onlineShareTxt);
      }
      return '';
    }).filter(Boolean);
    return parts.join(' · ');
  }

  // Banner above the field panel that explains where the prediction
  // is sourced from. Mode A (online-only / fresh format) uses a warm
  // amber tone; Mode B (online + labs majors) uses a confident green.
  // CL toggle state appended as suffix (Mode A only — B/TG ignore CL).
  function _formatDDMM(iso) {
    const m = (iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}.${m[2]}.` : (iso || '');
  }

  function renderPredictorBanner() {
    const tgLoaded = Object.values(_tgFieldShares).reduce((s, v) => s + v, 0) > 0;
    const clTags = [];
    if (_useClCurrent && Object.keys(_clCurrentByDeck).length > 0) clTags.push('CL Current');
    if (_useClPast    && Object.keys(_clPastByDeck).length > 0)    clTags.push('CL Past');
    const clSuffix = (clTags.length && _predictorMode === 'A' && !tgLoaded)
      ? ` <span class="mc-predictor-banner-cl">+ ${clTags.join(' + ')}</span>`
      : '';

    // Diagnostic state chip (2026-06): surfaces the exact mode + data
    // source the engine is running in so a "this looks wrong" report
    // can be cross-checked without F12 console access. Shows:
    //   • Source — current / past
    //   • Past format key, if past
    //   • Whether labs state survived into past-meta mode
    //   • Active-rotation suffix (POR during lag, CRI after)
    // Diese beiden Marken sind Diagnose, keine Nutzeraussage: sie sagen
    // dem Entwickler, in welchem Zustand die Maschine laeuft, wenn
    // jemand "das sieht falsch aus" meldet. Fuer den Spieler sind sie
    // Rauschen — genau der Grund, aus dem am 12.06.2026 der andere,
    // groessere Statusstreifen (_renderPredictorStatusBanner)
    // abgeschaltet wurde. Sie bleiben abrufbar, aber nur auf Wunsch:
    //   MetaCall.setDiagnostics(true)
    const _diag = !!_showDiagnostics;
    const sourceTag = !_diag ? '' : (_metaSource === 'past'
      ? ` <span class="mc-predictor-banner-source" style="font-weight:600;color:#6b21a8;">Past Meta · ${_pastMetaFormatKey || '?'}</span>`
      : ` <span class="mc-predictor-banner-source" style="font-weight:600;color:#065f46;">Current Meta</span>`);
    const activeTag = (_diag && _activeInPersonSetCode)
      ? ` <span class="mc-predictor-banner-active" style="opacity:0.75;">active rotation: ${_activeInPersonSetCode}</span>`
      : '';
    // Lag-window chip (2026-06). When current_set is online-legal but
    // the in-person rotation is the previous format, surface that the
    // engine has dropped the cross-format labs aggregate and is
    // running online-only for the current-meta view.
    const _currentSetUpper = (_formatWindow && _formatWindow.current_set)
      ? String(_formatWindow.current_set).trim().toUpperCase()
      : '';
    const _lagWindowChip = (_metaSource === 'current'
        && _activeInPersonSetCode
        && _currentSetUpper
        && _activeInPersonSetCode !== _currentSetUpper)
      ? ` <span class="mc-predictor-banner-lagwindow" style="opacity:0.85;color:#b45309;" title="${esc(t('mc.bannerLagWindowHelp').replace(/\{new\}/g, _currentSetUpper).replace(/\{old\}/g, _activeInPersonSetCode))}">${esc(t('mc.bannerLagWindow').replace('{new}', _currentSetUpper))}</span>`
      : '';
    // Stale-cache canary (2026-06). Surfaces the newest scraped_at
    // timestamp we saw across the loaded labs CSV. If this displays
    // a date the user knows is older than the latest scraper run,
    // their browser is serving stale-cached CSVs and they need to
    // hard-reload / clear site data.
    // Zwei verschiedene Daten, und der Chip zeigte das falsche.
    //
    // _dataLastScrapedAt ist das Maximum der Spalte scraped_at — wann der
    // Scraper zuletzt gelaufen ist. Was ein Spieler wissen will, ist,
    // WIE ALT DIE TURNIERE SIND. Gemessen am 20.08.2026: der Chip sagte
    // "Turnierdaten: 2026-07-29 — 22 Tage alt", waehrend das juengste
    // Turnier im Bestand vom 10.06.2026 stammt, also 71 Tage her ist.
    // 49 Tage Unterschied, und der groessere davon ist der, der zaehlt.
    //
    // Der Scrape-Zeitstempel bleibt als das erhalten, wofuer er laut
    // Kommentar gedacht war: ein Kanarienvogel fuer veraltete Caches.
    // Er steht jetzt im Titel, nicht in der Zeile.
    let staleTag = '';
    const _chipDatum = _lagNeuesteLabsZeile || (_dataLastScrapedAt || '').slice(0, 10);
    if (_chipDatum) {
      const shortDate = _chipDatum;
      const ageDays = (function () {
        try {
          return Math.floor((Date.now() - new Date(shortDate + 'T00:00:00Z').getTime()) / 86400000);
        } catch (_e) { return 0; }
      })();
      // Die Schwelle misst jetzt das Alter der TURNIERE, nicht das des
      // Laufs. Majors sind selten; acht Tage waren fuer einen Wochenlauf
      // gedacht und sind fuer Turniere zu streng. 35 Tage = lag_days plus
      // Karenz, dieselbe Grenze, an der auch das Lag-Fenster zugeht.
      const isStale = ageDays > 35;
      const color = isStale ? '#b91c1c' : '#374151';
      // "⚠ STALE" sagt einem Spieler nichts. Was er wissen will, ist
      // das Alter — und zwar ohne dass wir ihm die Ursache andichten.
      // Der englische Originaltext behauptete "browser is serving
      // cached data, hard-reload to refresh"; nachgemessen am
      // 18.08.2026 stimmt das nicht: labs_tournament_decks.csv traegt
      // scraped_at 2026-07-29 und liegt seit dem 31.07. unveraendert
      // im Repo. Ein Neuladen aendert daran nichts. Majors sind selten;
      // 20 Tage koennen einfach heissen, dass keins gespielt wurde.
      const label = isStale
        ? t('mc.bannerDataStale').replace('{date}', shortDate).replace('{days}', String(ageDays))
        : t('mc.bannerDataDate').replace('{date}', shortDate);
      const scrapeHinweis = _dataLastScrapedAt
        ? ` — ${t('mc.bannerScrapedAt').replace('{date}', _dataLastScrapedAt.slice(0, 10))}`
        : '';
      staleTag = ` <span class="mc-predictor-banner-stale" style="opacity:0.85;color:${color};" title="${esc(t('mc.bannerDataHelp') + scrapeHinweis)}">${esc(label)}</span>`;
    }

    // Predictor 3.0: when a post-major baseline snapshot is loaded, append
    // "+ Online-Entwicklung seit DD.MM." so the user sees that the trend
    // signal is live. Falls silent when no snapshot exists.
    const trendSuffix = _baselineSnapshotDate
      ? ` <span class="mc-predictor-banner-trend">+ Online-Entwicklung seit ${_formatDDMM(_baselineSnapshotDate)}</span>`
      : '';

    // Predictor 3.0 system-learning chip — shows MAE of the previous
    // prediction once a fresh major has arrived. Surfaces the accuracy
    // story so the user can tune trust over time.
    const accuracySuffix = _lastAccuracyReport
      ? ` <span class="mc-predictor-banner-accuracy" title="Mean Absolute Error of the prediction made ${_formatDDMM(_lastAccuracyReport.baselineDate)} vs the major on ${_formatDDMM(_lastAccuracyReport.majorDate)}">Letzte Prognose-Accuracy: ø ${String(_lastAccuracyReport.mae).replace('.', ',')} pp Abweichung</span>`
      : '';

    if (_predictorMode === 'B') {
      const tournNum = _labsMajorRows;
      return `<div class="mc-predictor-banner mc-predictor-banner-b">
        <span class="mc-predictor-banner-icon">📊</span>
        <span class="mc-predictor-banner-text">${t('mc.bannerModeB').replace('{n}', tournNum)}${sourceTag}${activeTag}${_lagWindowChip}${staleTag}${trendSuffix}${clSuffix}${accuracySuffix}</span>
      </div>`;
    }
    return `<div class="mc-predictor-banner mc-predictor-banner-a">
      <span class="mc-predictor-banner-icon">⚡</span>
      <span class="mc-predictor-banner-text">${t('mc.bannerModeA')}${sourceTag}${activeTag}${_lagWindowChip}${staleTag}${trendSuffix}${clSuffix}${accuracySuffix}</span>
    </div>`;
  }

  // Per-deck text-first intel block — used in the EXPANDED detail row
  // (see `_renderDetailRow`). Renders a 3-col stat grid for the public
  // data points (Online %, Top-8 conv, Trend), a single inline chip
  // for last-major Day-1/Day-2 numbers, and a personal-data row for
  // any user data (TG WR, journal stats, TG share). Returns '' when
  // the deck has no intel at all so the caller can decide whether to
  // even emit a detail row.
  function _renderDeckBadge(deckName) {
    if (!_shareList) return '';
    const k = normalize(deckName);
    const entry = _shareList.find(d => normalize(d.name) === k);
    if (!entry) return '';
    const stats = _tournamentStats ? _tournamentStats[k] : null;
    const ladderPct = entry.ladderShare || 0;
    const broughtPct = stats ? stats.broughtShare : 0;
    const top8Conv  = stats ? stats.top8Conv : 0;
    // Field-weighted baseline — same calc as in loadData so the badge
    // shows the same factor that the predictor used. Weighted by
    // broughtShare so the natural cut rate (~8%) is the 1.0× anchor.
    const allConvs = _tournamentStats
      ? Object.values(_tournamentStats).filter(s => s && s.broughtShare > 0)
      : [];
    const totalBroughtForConv = allConvs.reduce((a, s) => a + s.broughtShare, 0) || 1;
    const meanConv = allConvs.length > 0
      ? allConvs.reduce((a, s) => a + (s.top8Conv || 0) * s.broughtShare, 0) / totalBroughtForConv
      : 0.08;
    const convFactor = meanConv > 0
      ? Math.max(0.5, Math.min(2.0, top8Conv / meanConv))
      : 1.0;
    // top8Conv ist ein Anteil (0,101), die Kachel zeigt Prozent.
    const convPct = (top8Conv || 0) * 100;
    const trendPct  = entry.trend || 0;
    const trendArrow = trendPct > 0 ? '↑' : (trendPct < 0 ? '↓' : '→');
    const trendSign  = trendPct > 0 ? '+' : '';
    const trendCls   = trendPct > 0.05 ? ' mc-intel-trend-pos' : (trendPct < -0.05 ? ' mc-intel-trend-neg' : '');
    const fmt = (n, dp) => n.toFixed(dp).replace('.', ',');

    // ── Public-data stat tiles (3-col grid) ──
    const tiles = [];
    tiles.push(_intelStatTile(t('mc.intelOnlineShareToday'), `${fmt(ladderPct, 1)} %`));
    if (broughtPct > 0) {
      // Beschriftung und Hauptwert passten nicht zusammen.
      //
      // Die Kachel hiess "Top-8-Major-Conversion" und zeigte als
      // Hauptwert broughtShare, also den ANTEIL AN DEN ANTRITTEN
      // (brought / broughtSum). Bei Mega Excadrill waren das 7,84 %,
      // waehrend die Top-8-Quote desselben Decks 4,61 % betraegt. Und
      // "Major" war auch nicht richtig: online_tournament_top8_decks.csv
      // fuehrt ausschliesslich source_format 'PBL', also Online-Turniere.
      //
      // Jetzt oben die Quote, darunter der Anteil, und der Name nennt
      // die Quelle.
      tiles.push(_intelStatTile(
        t('mc.intelTop8Conv'),
        `${fmt(convPct, 1)} %`,
        `${fmt(convFactor, 1)}× ${t('mc.intelTop8AvgSuffix')} · `
          + `${fmt(broughtPct, 1)} % ${t('mc.intelTop8BroughtSuffix')}`
      ));
    }
    if (Math.abs(trendPct) > 0.05 || _baselineSnapshotDate) {
      tiles.push(_intelStatTile(
        t('mc.intelTrend7d'),
        `<span class="mc-intel-tile-value-emph${trendCls}">${trendArrow} ${trendSign}${fmt(trendPct, 1)} %</span>`
      ));
    }

    // ── Last-major chip — replaces the old big bordered "Last Major"
    // box. Single inline line: "Prag · D1 5,2% (WR 46%) · D2 5,5% (WR
    // 37%) · Konv 19,7%". Visually subordinate to the stat tiles so
    // the user reads "current state first, history second".
    //
    // Past Meta override: the rotation has a handful of regionals
    // (TEF-POR has 5: Prague, LA, Utrecht, Campinas, Melbourne) and
    // the user wants to see them ALL stacked per deck rather than
    // just the last one. Renders a compact mini-row per tournament
    // with a 🏆 marker on the winner (top1_count > 0), D1 share/WR,
    // D2 share/WR, conversion. Falls back to the single-chip path
    // for Current Meta.
    let majorChipHtml = '';
    // Current Meta lag-window: suppress the chip even though the
    // data exists. _lastMajorByDeck / _majorSharesByDeck still
    // hold TEF-POR rows for the Past Meta UI, but they're not
    // representative of CRI predictions and showed up as
    // misleading "Melbourne (D1 4.7 %)" chips on CRI deck rows.
    const _currentSetCodeUpperRender = (_formatWindow && _formatWindow.current_set)
      ? String(_formatWindow.current_set).trim().toUpperCase()
      : '';
    const _renderLagWindow = _metaSource === 'current'
      && _activeInPersonSetCode
      && _currentSetCodeUpperRender
      && _activeInPersonSetCode !== _currentSetCodeUpperRender;
    // Stack ALL in-person majors of the active format (🏆 on each winner),
    // newest-first — Past Meta always, and Current Meta too when the in-person
    // majors ARE the current format (i.e. NOT the lag window, where
    // _majorSharesByDeck still holds the previous format's regionals). This is
    // what "show every recent major, not just the last" means: e.g. TEF-CRI
    // shows both NAIC (winner Lillie's Clefairy 🏆) and Turin (winner Hop's
    // Trevenant 🏆) instead of only the latest single chip. Display only — the
    // predictor math (4.6 underdog-champion boost etc.) is untouched.
    const _stackMajors = (_metaSource === 'past' || !_renderLagWindow)
      && Array.isArray(_majorSharesByDeck[k])
      && _majorSharesByDeck[k].length > 0;
    if (_stackMajors) {
      majorChipHtml = _renderPastMetaTournamentStack(_majorSharesByDeck[k]);
    } else if (!_renderLagWindow && _lastMajorInfo && _lastMajorByDeck[k]) {
      const lm      = _lastMajorByDeck[k];
      const dateStr = _formatShortDate(_lastMajorInfo.date);
      const where   = _lastMajorInfo.shortName || t('mc.intelMajorFallback');
      const headerLabel = `${t('mc.intelLastMajor')} (${where}${dateStr ? ', ' + dateStr : ''})`;
      const hasDaySplit = (lm.day1Players > 0) || (lm.day1Share > 0) ||
                          (lm.day2Players > 0) || (lm.day2Share > 0);
      if (hasDaySplit) {
        majorChipHtml = _intelMajorChip(where, lm);
      } else {
        const wr = lm.winPct > 0 ? ` (WR ${fmt(lm.winPct, 0)} %)` : '';
        majorChipHtml = `<div class="mc-intel-major-chip mc-intel-major-chip-legacy" title="${esc(headerLabel)}">
          <span class="mc-intel-major-chip-place">${esc(where)}</span>
          <span class="mc-intel-major-chip-sep">·</span>
          <span class="mc-intel-major-chip-val">${fmt(lm.share, 1)} %${wr}</span>
        </div>`;
      }
    }

    // ── Personal data tiles — only render when the user has data.
    const personals = [];
    const tgVal = _findByNormalized(_winRateOverrides, deckName);
    if (tgVal !== undefined && tgVal !== '' && !isNaN(parseFloat(tgVal))) {
      personals.push(_intelStatTile(t('mc.intelTgWr'), `${fmt(parseFloat(tgVal), 0)} %`, '', 'mc-intel-tile-personal'));
    }
    const jStats = _findByNormalized(_journalStats, deckName);
    if (jStats && jStats.total > 0) {
      personals.push(_intelStatTile(
        t('mc.intelJournal'),
        `${jStats.wins}–${jStats.losses}–${jStats.ties}`,
        `${jStats.winRate} %`,
        'mc-intel-tile-personal'
      ));
    }
    const rawTgShare = _findByNormalized(_tgFieldShares, deckName) || 0;
    const tgShareTotal = Object.values(_tgFieldShares).reduce((s, v) => s + v, 0);
    if (rawTgShare > 0 && tgShareTotal > 0) {
      personals.push(_intelStatTile(
        t('mc.intelTgShare'),
        `${fmt((rawTgShare / tgShareTotal) * 100, 1)} %`,
        '',
        'mc-intel-tile-personal'
      ));
    }

    if (tiles.length === 0 && !majorChipHtml && personals.length === 0) return '';
    // Wrap the intel in a per-row container so phone screens can hide
    // the body behind a "Details ▾" toggle (CSS-only). Desktop keeps
    // the wrapper but renders the intel always-visible. The toggle's
    // onclick uses `this.closest()` so it walks up to the wrapper
    // regardless of where the rendered button ends up.
    return `<div class="mc-deck-intel-wrap">
      <button type="button" class="mc-mobile-detail-toggle"
              onclick="this.closest('.mc-deck-intel-wrap').classList.toggle('is-open')">
        Details <span class="mc-mobile-detail-toggle-arrow" aria-hidden="true">▾</span>
      </button>
      <div class="mc-deck-intel">
        ${tiles.length ? `<div class="mc-intel-tile-grid">${tiles.join('')}</div>` : ''}
        ${majorChipHtml}
        ${personals.length ? `<div class="mc-intel-tile-grid mc-intel-tile-grid-personal">${personals.join('')}</div>` : ''}
      </div>
    </div>`;
  }

  // Helper: render a single stat tile (label + big value + optional
  // small extra). Used for the public-data and personal-data grids
  // inside the expanded detail row.
  function _intelStatTile(label, value, extra, extraCls) {
    const cls = 'mc-intel-tile' + (extraCls ? ' ' + extraCls : '');
    const extraHtml = extra ? `<span class="mc-intel-tile-extra">${esc(extra)}</span>` : '';
    return `<div class="${cls}">
      <span class="mc-intel-tile-label">${esc(label)}</span>
      <span class="mc-intel-tile-value">${value}</span>
      ${extraHtml}
    </div>`;
  }

  // Helper: render the Last-Major info as a single inline chip line.
  // Replaces the old bordered card. Format:
  //   📍 Prag · D1 5,2% (WR 46%) · D2 5,5% (WR 37%) · Konv 19,7%
  // Past-Meta-only: stack ALL tournaments of the rotation in one
  // compact block. Each row = 🏆 (if winner) · short event name + date
  // · D1 X % (WR Y %) · D2 X % (WR Y %) · Konv Z %.
  // Sorted newest-first so the most recent regional reads first;
  // the user's eye lands on Melbourne / the latest data point and
  // then scans backward in time for trend context.
  function _renderPastMetaTournamentStack(events) {
    if (!Array.isArray(events) || events.length === 0) return '';
    const fmt = (n, dp) => n.toFixed(dp).replace('.', ',');
    const sorted = events.slice().sort((a, b) =>
      (b.date || '').localeCompare(a.date || '')
    );
    const rows = sorted.map(ev => {
      const isWinner = (ev.top1Count || 0) > 0;
      const winnerMark = isWinner
        ? `<span class="mc-pmt-winner" title="Won this event">🏆</span>`
        : '';
      const dateStr = _formatShortDate(ev.date);
      const where = ev.shortName || ev.tournamentName || '—';
      const day1Val = ev.day1Share > 0 ? `${fmt(ev.day1Share, 1)} %` : '—';
      const day1Wr  = ev.day1WinPct > 0 ? ` (WR ${fmt(ev.day1WinPct, 0)} %)` : '';
      const day2Made = ev.day2Players > 0;
      const day2Val = day2Made ? `${fmt(ev.day2Share, 1)} %` : '—';
      const day2Wr  = (day2Made && ev.day2WinPct > 0) ? ` (WR ${fmt(ev.day2WinPct, 0)} %)` : '';
      const conv = (ev.dayConv && ev.dayConv > 0)
        ? ev.dayConv
        : (ev.day1Players > 0 ? ev.day2Players / ev.day1Players : 0);
      const convVal = conv > 0 ? `${fmt(conv * 100, 1)} %` : '—';
      return `<div class="mc-pmt-row${isWinner ? ' mc-pmt-row-winner' : ''}">
        <span class="mc-pmt-place">${winnerMark}${esc(where)}${dateStr ? `<span class="mc-pmt-date">${esc(dateStr)}</span>` : ''}</span>
        <span class="mc-pmt-stats">
          <span class="mc-pmt-seg"><span class="mc-pmt-k">${esc(t('mc.intelMajorDay1'))}</span> ${day1Val}${day1Wr}</span>
          <span class="mc-pmt-seg"><span class="mc-pmt-k">${esc(t('mc.intelMajorDay2'))}</span> ${day2Val}${day2Wr}</span>
          <span class="mc-pmt-seg"><span class="mc-pmt-k">${esc(t('mc.intelMajorConv'))}</span> ${convVal}</span>
        </span>
      </div>`;
    }).join('');
    return `<div class="mc-pmt-stack" title="All ${sorted.length} ${_pastMetaFormatKey || ''} regionals">
      ${rows}
    </div>`;
  }

  function _intelMajorChip(where, lm) {
    const fmt = (n, dp) => n.toFixed(dp).replace('.', ',');
    const made = lm.day2Players > 0;
    const conv = (lm.dayConv && lm.dayConv > 0)
      ? lm.dayConv
      : (lm.day1Players > 0 ? lm.day2Players / lm.day1Players : 0);
    const day1Val = lm.day1Share > 0 ? `${fmt(lm.day1Share, 1)} %` : '—';
    const day1Wr  = lm.day1WinPct > 0 ? ` (WR ${fmt(lm.day1WinPct, 0)} %)` : '';
    const day2Val = made ? `${fmt(lm.day2Share, 1)} %` : '—';
    const day2Wr  = (made && lm.day2WinPct > 0) ? ` (WR ${fmt(lm.day2WinPct, 0)} %)` : '';
    const convVal = conv > 0 ? `${fmt(conv * 100, 1)} %` : '—';
    return `<div class="mc-intel-major-chip" title="${esc(t('mc.intelLastMajor'))}">
      <span class="mc-intel-major-chip-place">📍 ${esc(where)}</span>
      <span class="mc-intel-major-chip-sep">·</span>
      <span class="mc-intel-major-chip-seg"><span class="mc-intel-major-chip-k">${esc(t('mc.intelMajorDay1'))}</span> ${day1Val}${day1Wr}</span>
      <span class="mc-intel-major-chip-sep">·</span>
      <span class="mc-intel-major-chip-seg"><span class="mc-intel-major-chip-k">${esc(t('mc.intelMajorDay2'))}</span> ${day2Val}${day2Wr}</span>
      <span class="mc-intel-major-chip-sep">·</span>
      <span class="mc-intel-major-chip-seg"><span class="mc-intel-major-chip-k">${esc(t('mc.intelMajorConv'))}</span> ${convVal}</span>
    </div>`;
  }

  /**
   * Zieht die matchup-abhaengigen Bereiche nach, sobald _matchupMap
   * geladen ist. Absichtlich enger als refreshResults(): die
   * Feldtabelle enthaelt Eingabefelder fuer die eigene Schaetzung und
   * wird deshalb nicht angefasst.
   *
   * Tut nichts, wenn der Tab noch nicht gerendert ist — dann rendert er
   * ohnehin gleich mit vollstaendiger Karte.
   */
  function _panelsNachMatchupsNachziehen() {
    const container = document.getElementById('metaCallHost');
    if (!container || !_shareList) return;
    const recPanel = container.querySelector('.mc-rec-panel');
    const resultsGrid = container.querySelector('.metacall-results-grid');
    if (!recPanel && !resultsGrid) return;   // noch nichts da
    const field = buildField();
    if (resultsGrid) {
      const wrap = resultsGrid.closest('.metacall-panel');
      if (wrap) {
        const tmp = document.createElement('div');
        tmp.innerHTML = renderResultsPanel(field);
        const neu = tmp.querySelector('.metacall-panel');
        if (neu) wrap.innerHTML = neu.innerHTML;
      }
    }
    if (recPanel) {
      const tmp = document.createElement('div');
      tmp.innerHTML = renderRecommendationsPanel(field);
      const neu = tmp.querySelector('.mc-rec-panel');
      if (neu) recPanel.innerHTML = neu.innerHTML;
    }
    console.info('[MetaCall] Empfehlungen nach dem Laden der Matchup-Karte nachgezogen '
      + '(%d Decks in der Karte).', _matchupMap ? Object.keys(_matchupMap).length : 0);
  }

  function refreshResults() {
    const container = document.getElementById('metaCallHost');
    if (!container || !_shareList) return;
    const field = buildField();
    const fieldTbody = container.querySelector('.metacall-table tbody');
    if (fieldTbody) {
      const tmp = document.createElement('div');
      tmp.innerHTML = renderFieldPanel(field);
      const newTbody = tmp.querySelector('tbody');
      if (newTbody) fieldTbody.innerHTML = newTbody.innerHTML;
    }
    // Player-count badge in the field-panel header is rendered alongside
    // the panel title (not inside the tbody we just swapped). Sync it
    // surgically so changing "Players" in Tournament Settings reflects
    // immediately without re-rendering the whole panel and losing
    // focus on any active personal-share input.
    const playersBadge = container.querySelector('#mc-players-badge');
    if (playersBadge) {
      playersBadge.textContent = `${_settings.totalPlayers.toLocaleString()} ${t('mc.labelPlayers')}`;
    }
    const resultsPanel = container.querySelector('.metacall-results-grid');
    const resultsWrap  = resultsPanel ? resultsPanel.closest('.metacall-panel') : null;
    if (resultsWrap) {
      const tmp = document.createElement('div');
      tmp.innerHTML = renderResultsPanel(field);
      const newPanel = tmp.querySelector('.metacall-panel');
      if (newPanel) resultsWrap.innerHTML = newPanel.innerHTML;
    }
    // Recommendations panel — re-runs calcRecommendations with the
    // updated field. Day-2 numbers shift whenever the field shifts so
    // this always keeps the recommendation table in sync.
    const recPanel = container.querySelector('.mc-rec-panel');
    if (recPanel) {
      const tmp = document.createElement('div');
      tmp.innerHTML = renderRecommendationsPanel(field);
      const newPanel = tmp.querySelector('.mc-rec-panel');
      if (newPanel) recPanel.innerHTML = newPanel.innerHTML;
    }
  }

  // ── Share Images (WhatsApp-friendly PNG export) ───────────
  //
  // Two shareable views:
  //   A) Field Share      — meta field only (no personal deck info)
  //   B) Day 2 Image      — deck choice + Day 2 chance + top matchups
  //
  // Both use the Web Share API on mobile (navigator.share with files),
  // falling back to PNG download on desktop.

  // Actual share/download action (called from the preview modal).
  function _shareOrDownloadBlob(blob, filename, title, text) {
    if (!blob) return;
    const file = new File([blob], filename, { type: 'image/png' });

    const doDownload = () => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title, text }).catch(err => {
        if (err && err.name === 'AbortError') return;
        doDownload();
      });
    } else {
      doDownload();
    }
  }

  // Show a preview modal with the generated image, then let the user
  // decide to share/download or just close. Matches the user flow:
  // "erst das Bild selbst sehen, dann teilen".
  function _showSharePreview(canvas, filename, title, text) {
    /* Das Fenster ist umgezogen.
     *
     * Es war hier zuerst gebaut, mit dem richtigen Gedanken im Kommentar:
     * "erst das Bild selbst sehen, dann teilen". Nur hatte die Tier-Liste
     * es nie bekommen — ihr Knopf "Bild" lud sofort herunter. Statt es
     * dort ein zweites Mal zu bauen, liegt es jetzt in
     * js/ds-bildvorschau.js und beide benutzen dasselbe.
     *
     * Diese Funktion bleibt als Name stehen: sie hat drei Aufrufer in
     * dieser Datei, und die sollen sich nicht darum kuemmern muessen. */
    if (window.DsBildvorschau && typeof window.DsBildvorschau.zeige === 'function') {
      return window.DsBildvorschau.zeige(canvas, {
        dateiname: filename,
        titel: title || t('mc.sharePreviewTitle'),
        text: text,
      });
    }
    // Ohne das Modul wenigstens speichern, statt gar nichts zu tun.
    canvas.toBlob(function (blob) {
      if (blob) _shareOrDownloadBlob(blob, filename, title, text);
    }, 'image/png');
    return Promise.resolve(false);
  }

  // Shared canvas helpers
  function _paintBackground(ctx, w, h) {
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#1a2340');
    bg.addColorStop(1, '#0f1528');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const accent = ctx.createLinearGradient(0, 0, w, 0);
    accent.addColorStop(0, '#3498db');
    accent.addColorStop(0.5, '#9b59b6');
    accent.addColorStop(1, '#e74c3c');
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, w, 6);
  }

  function _paintHeader(ctx, w, title, subtitle) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 38px system-ui, -apple-system, sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(title, 28, 60);

    ctx.fillStyle = '#9ab1d4';
    ctx.font = '16px system-ui, -apple-system, sans-serif';
    ctx.fillText(subtitle, 28, 88);
  }

  function _paintFooter(ctx, w, h) {
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, h - 42, w, 1);

    ctx.fillStyle = '#6b7c93';
    ctx.font = '12px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(BRAND_FOOTER + ' · Meta Call', 28, h - 16);

    ctx.textAlign = 'right';
    ctx.fillText(new Date().toLocaleDateString(), w - 28, h - 16);
    ctx.textAlign = 'left';
  }

  // ── Shared paint helpers used by both Field-only and Field+Recs
  // share-image variants. Extracted so the two-column layout doesn't
  // copy-paste the row-rendering loop. Each helper paints into the
  // given (originX, originY) box of width `columnW` and returns the
  // height it used, so the caller can size the canvas correctly.
  function _paintFieldRows(ctx, originX, originY, columnW, field) {
    const ROW_H = 46;
    const maxShare = Math.max(...field.map(d => d.finalShare), 0.1);
    // Layout inside the column: name on the left, bar in the middle,
    // percentage on the right. Same proportions as the original
    // single-column image so the look is identical when used alone.
    const padL  = 12;
    const padR  = 12;
    const pctW  = 70;
    const countW = 56;
    const barX  = originX + padL + 220;          // name takes ~220px
    const barW  = columnW - padL - padR - 220 - pctW - countW - 16;
    const barH  = 10;
    const pctX  = originX + columnW - padR - countW - 8;
    const countX = originX + columnW - padR;

    let y = originY;
    field.forEach((deck, i) => {
      const isJunk   = deck.name === '_junk';
      const isCustom = !!deck.isCustom;

      if (i % 2 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.fillRect(originX + 4, y, columnW - 8, ROW_H);
      }

      ctx.fillStyle = isJunk ? '#f39c12' : (isCustom ? '#c39bd3' : '#e2e8f0');
      ctx.font = (isJunk || isCustom) ? 'bold 17px system-ui, sans-serif' : '600 17px system-ui, sans-serif';
      let label = isJunk ? t('mc.junkDecks') : deck.name;
      if (isCustom) label += ' ★';
      // When this row is a family aggregate (combined view), append
      // the variant count so the reader sees that 'Dragapult'
      // bundles N separate per-variant entries from the underlying
      // share list. Single-variant rows (variantCount = 1 or absent)
      // stay unmarked — '(1)' next to every per-variant name in the
      // single view would just be noise.
      if (!isJunk && !isCustom && deck.variantCount && deck.variantCount > 1) {
        label += ' (' + deck.variantCount + ')';
      }
      const maxLabelW = barX - originX - padL - 12;
      if (ctx.measureText(label).width > maxLabelW) {
        while (label.length > 4 && ctx.measureText(label + '…').width > maxLabelW) {
          label = label.slice(0, -1);
        }
        label += '…';
      }
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(label, originX + padL, y + ROW_H / 2);

      // Bar
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(barX, y + ROW_H / 2 - barH / 2, barW, barH);
      const pct = Math.max(0, Math.min(1, deck.finalShare / maxShare));
      const fillGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
      if (isJunk) {
        fillGrad.addColorStop(0, '#e67e22'); fillGrad.addColorStop(1, '#f39c12');
      } else if (isCustom) {
        fillGrad.addColorStop(0, '#8e44ad'); fillGrad.addColorStop(1, '#c39bd3');
      } else {
        fillGrad.addColorStop(0, '#27ae60'); fillGrad.addColorStop(1, '#2ecc71');
      }
      ctx.fillStyle = fillGrad;
      ctx.fillRect(barX, y + ROW_H / 2 - barH / 2, barW * pct, barH);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 17px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(deck.finalShare.toFixed(1) + '%', pctX, y + ROW_H / 2);

      ctx.fillStyle = '#9ab1d4';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText('(' + deck.count.toLocaleString() + ')', countX, y + ROW_H / 2);
      ctx.textAlign = 'left';

      y += ROW_H;
    });
    return y - originY;
  }

  // Paint the recommendations column (Day-2-rec list, top N).
  // Mirrors _paintFieldRows visually so the two columns line up.
  function _paintRecRows(ctx, originX, originY, columnW, recs) {
    const ROW_H = 46;
    const padL  = 12;
    const padR  = 12;
    const titleKey = _predictTitleKey(); // type-aware label
    const titleLabel = t(titleKey);
    const maxProb = Math.max(...recs.map(r => r.day2Prob), 0.001);

    // Column header strip (mini-header inside the recs column).
    const hdrW = columnW - 24;
    ctx.fillStyle = 'rgba(155, 89, 182, 0.12)';
    ctx.fillRect(originX + 12, originY - 28, hdrW, 22);
    ctx.fillStyle = '#c39bd3';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('#', originX + padL + 4, originY - 17);
    ctx.fillText(t('mc.recDeck').toUpperCase(), originX + padL + 30, originY - 17);
    ctx.textAlign = 'right';
    ctx.fillText(titleLabel.toUpperCase(), originX + columnW - padR - 70, originY - 17);
    ctx.fillText(t('mc.recAvgWr').toUpperCase(), originX + columnW - padR, originY - 17);
    ctx.textAlign = 'left';

    let y = originY;
    recs.forEach((r, i) => {
      if (i % 2 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.fillRect(originX + 4, y, columnW - 8, ROW_H);
      }

      // Rank
      ctx.fillStyle = '#9ab1d4';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText('#' + (i + 1), originX + padL, y + ROW_H / 2);

      // Deck name (truncate)
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '600 16px system-ui, sans-serif';
      let label = r.name;
      // Mirror the field column's variant-count suffix on combined-
      // view aggregates so 'Dragapult (5)' reads the same in both
      // halves of the share image.
      if (r.variantCount && r.variantCount > 1) {
        label += ' (' + r.variantCount + ')';
      }
      const maxLabelW = columnW - padL - 30 - padR - 70 - 70 - 16;
      if (ctx.measureText(label).width > maxLabelW) {
        while (label.length > 4 && ctx.measureText(label + '…').width > maxLabelW) {
          label = label.slice(0, -1);
        }
        label += '…';
      }
      ctx.fillText(label, originX + padL + 30, y + ROW_H / 2);

      // Day-2 / Top-Cut / 1-2 chance — the headline number.
      const probPct = (r.day2Prob * 100).toFixed(1);
      ctx.fillStyle = r.day2Prob >= 0.5 ? '#2ecc71' : (r.day2Prob >= 0.3 ? '#f1c40f' : '#e74c3c');
      ctx.font = 'bold 17px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(probPct + '%', originX + columnW - padR - 70, y + ROW_H / 2);

      // Avg win-rate
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText(r.avgWR.toFixed(1) + '%', originX + columnW - padR, y + ROW_H / 2);
      ctx.textAlign = 'left';

      y += ROW_H;
    });
    return y - originY;
  }

  // Paint the dark-horse tips block under the recommendations column.
  // Title strip + hint line + up to 3 stacked cards. Each card mirrors
  // the on-page .mc-tip-card visual: deck name, "Day 2: X%" pill on
  // the right, reason line below. Returns the total height used so
  // callers can size the canvas.
  function _paintTipsBlock(ctx, originX, originY, columnW, tips) {
    if (!tips || tips.length === 0) return 0;
    const padL  = 12;
    const padR  = 12;
    const TITLE_H    = 26;
    const HINT_H     = 22;
    const CARD_H     = 64;
    const CARD_GAP   = 8;
    const TOP_GAP    = 14;

    let y = originY + TOP_GAP;

    // Section title — same orange/amber accent the on-page block uses
    // so the share-image reads as the same affordance as the UI.
    ctx.fillStyle = 'rgba(243, 156, 18, 0.12)';
    ctx.fillRect(originX + 4, y, columnW - 8, TITLE_H);
    ctx.fillStyle = '#f39c12';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(t('mc.tipsTitle').toUpperCase(), originX + padL, y + TITLE_H / 2);
    y += TITLE_H + 4;

    // Hint line (smaller, muted) — "Diese Decks könnten überraschen…"
    ctx.fillStyle = '#9ab1d4';
    ctx.font = '12px system-ui, sans-serif';
    let hint = t('mc.tipsHint');
    const hintMaxW = columnW - padL - padR;
    if (ctx.measureText(hint).width > hintMaxW) {
      while (hint.length > 4 && ctx.measureText(hint + '…').width > hintMaxW) {
        hint = hint.slice(0, -1);
      }
      hint += '…';
    }
    ctx.fillText(hint, originX + padL, y + HINT_H / 2);
    y += HINT_H + 4;

    // Cards — one per tip, stacked.
    tips.forEach((tip) => {
      ctx.fillStyle = 'rgba(243, 156, 18, 0.06)';
      ctx.fillRect(originX + 4, y, columnW - 8, CARD_H);
      ctx.strokeStyle = 'rgba(243, 156, 18, 0.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(originX + 4.5, y + 0.5, columnW - 9, CARD_H - 1);

      // Pill on the right — label adapts to active tournament type so
      // a Cup share image reads "Top 4: 8,2 %" instead of the
      // misleading "Day-2: 8,2 %". Measure first so the name truncates
      // around it instead of behind it.
      const day2Pct = (tip.day2Prob * 100).toFixed(1);
      const pillLabel = _settings.tournamentType === 'cup'
        ? `Top ${_settings.topCutSize || 8}: ${day2Pct}%`
        : (_settings.tournamentType === 'challenge'
            ? `1.-2.: ${day2Pct}%`
            : `${t('mc.recDay2')}: ${day2Pct}%`);
      ctx.font = 'bold 13px system-ui, sans-serif';
      const pillTextW = ctx.measureText(pillLabel).width;
      const pillW = pillTextW + 16;
      const pillH = 22;
      const pillX = originX + columnW - padR - pillW;
      const pillY = y + 10;
      ctx.fillStyle = 'rgba(46, 204, 113, 0.18)';
      ctx.fillRect(pillX, pillY, pillW, pillH);
      ctx.fillStyle = '#2ecc71';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pillLabel, pillX + pillW / 2, pillY + pillH / 2);

      // Deck name — truncate to fit available space (column minus pill).
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '600 16px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const nameMaxW = pillX - (originX + padL) - 12;
      let name = tip.name;
      if (ctx.measureText(name).width > nameMaxW) {
        while (name.length > 4 && ctx.measureText(name + '…').width > nameMaxW) {
          name = name.slice(0, -1);
        }
        name += '…';
      }
      ctx.fillText(name, originX + padL, y + 10 + 11);

      // Reason line — same _formatTipReasons text the UI shows. Wrap
      // to 2 lines max if it overflows the card width.
      const reason = _formatTipReasons(tip);
      ctx.fillStyle = '#9ab1d4';
      ctx.font = '12px system-ui, sans-serif';
      const reasonMaxW = columnW - padL - padR;
      const reasonLines = _wrapText(ctx, reason, reasonMaxW, 2);
      let ry = y + 38;
      reasonLines.forEach((line) => {
        ctx.fillText(line, originX + padL, ry);
        ry += 14;
      });

      y += CARD_H + CARD_GAP;
    });

    return (y - CARD_GAP) - originY;
  }

  // Greedy word-wrap to N lines. Final line gets ellipsis if the
  // remaining text doesn't fit. Used by _paintTipsBlock for the
  // reason text under each tip card.
  function _wrapText(ctx, text, maxW, maxLines) {
    if (!text) return [];
    const words = String(text).split(/\s+/);
    const lines = [];
    let current = '';
    for (let i = 0; i < words.length; i++) {
      const candidate = current ? current + ' ' + words[i] : words[i];
      if (ctx.measureText(candidate).width <= maxW) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = words[i];
        if (lines.length >= maxLines - 1) {
          // Final line — fit remaining words then ellipsis if needed.
          let rest = words.slice(i).join(' ');
          while (rest.length > 0 && ctx.measureText(rest + '…').width > maxW) {
            rest = rest.slice(0, -1);
          }
          lines.push(rest + (rest.length < words.slice(i).join(' ').length ? '…' : ''));
          return lines;
        }
      }
    }
    if (current) lines.push(current);
    return lines.slice(0, maxLines);
  }

  // ── A) Field Composition Share Image ─────────────────────
  function exportFieldShareImage() {
    if (!_shareList) return;
    // Sort descending by final share so the meta-relevant decks are on
    // top, but pin the "Others" bucket (junk) to the bottom regardless of
    // its share — we want to see the real decks first, then the catch-all.
    const rawField = buildField();
    if (!rawField.length) return;
    const junkEntry = rawField.find(d => d.name === '_junk') || null;
    const field = rawField.filter(d => d.name !== '_junk')
                          .sort((a, b) => b.finalShare - a.finalShare);
    if (junkEntry) field.push(junkEntry);

    const W = 860;
    const ROW_H = 46;
    const HEADER_H = 120;
    const SECTION_H = 48;
    const FOOTER_H = 50;
    const H = HEADER_H + SECTION_H + field.length * ROW_H + 28 + FOOTER_H;

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    _paintBackground(ctx, W, H);
    const _srcLabel = _metaSource === 'past'
      ? ` · Past Meta: ${_pastMetaFormatKey || '?'}`
      : ` · Current Meta${(() => { const c = _displayInPersonSetCode(); return c ? ' (' + c + ')' : ''; })()}`;
    _paintHeader(ctx, W, 'META CALL',
      `${_settings.totalPlayers.toLocaleString()} ${t('mc.labelPlayers')} · ${_settings.rounds} ${t('mc.roundsAbbr')} · Day 2: ${_settings.day2Points} ${t('mc.ptsAbbr')}${_srcLabel}`);

    // Section label
    ctx.fillStyle = '#3498db';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(t('mc.panelField').toUpperCase(), 28, HEADER_H + 24);

    const maxShare = Math.max(...field.map(d => d.finalShare), 0.1);
    let y = HEADER_H + SECTION_H;

    const barX  = 300;
    const barW  = 360;
    const barH  = 10;
    const pctX  = W - 120;
    const countX = W - 28;

    field.forEach((deck, i) => {
      const isJunk   = deck.name === '_junk';
      const isCustom = !!deck.isCustom;

      if (i % 2 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.fillRect(16, y, W - 32, ROW_H);
      }

      // Deck name (truncate if very long)
      ctx.fillStyle = isJunk ? '#f39c12' : (isCustom ? '#c39bd3' : '#e2e8f0');
      ctx.font = (isJunk || isCustom) ? 'bold 17px system-ui, sans-serif' : '600 17px system-ui, sans-serif';
      let label = isJunk ? t('mc.junkDecks') : deck.name;
      if (isCustom) label += ' ★';
      const maxLabelW = barX - 40;
      if (ctx.measureText(label).width > maxLabelW) {
        while (label.length > 4 && ctx.measureText(label + '…').width > maxLabelW) {
          label = label.slice(0, -1);
        }
        label += '…';
      }
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 28, y + ROW_H / 2);

      // Bar
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(barX, y + ROW_H / 2 - barH / 2, barW, barH);
      const pct = Math.max(0, Math.min(1, deck.finalShare / maxShare));
      const fillGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
      if (isJunk) {
        fillGrad.addColorStop(0, '#e67e22'); fillGrad.addColorStop(1, '#f39c12');
      } else if (isCustom) {
        fillGrad.addColorStop(0, '#8e44ad'); fillGrad.addColorStop(1, '#c39bd3');
      } else {
        fillGrad.addColorStop(0, '#27ae60'); fillGrad.addColorStop(1, '#2ecc71');
      }
      ctx.fillStyle = fillGrad;
      ctx.fillRect(barX, y + ROW_H / 2 - barH / 2, barW * pct, barH);

      // Percentage
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 17px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(deck.finalShare.toFixed(1) + '%', pctX, y + ROW_H / 2);

      // Player count
      ctx.fillStyle = '#9ab1d4';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText('(' + deck.count.toLocaleString() + ')', countX, y + ROW_H / 2);
      ctx.textAlign = 'left';

      y += ROW_H;
    });

    _paintFooter(ctx, W, H);
    _showSharePreview(canvas, `metacall-field-${_formatDateFilename()}.png`,
      'Meta Call — Field Composition',
      `Meta share prognosis for ${_settings.totalPlayers.toLocaleString()} players · ${_settings.rounds} rounds`);
  }

  // ── A2) Field + Recommendations side-by-side share image ──
  // Same Field-Composition block on the left, Day-2 (or Top-Cut /
  // 1st-2nd) recommendation list on the right. One image, both
  // useful pieces of info — share once, both decisions are visible.
  // Aggregate a field list by family (Dragapult, Dragapult Dusknoir,
  // Dragapult Blaziken → "Dragapult" with summed shares). Used by the
  // combined-view share image so Telegram readers see the same
  // family-grouped composition that limitlesstcg / official tournament
  // pages display. Per-variant rendering goes through the un-aggregated
  // path; this helper is only invoked when viewMode === 'combined'.
  //
  // Returns a field-shaped array sorted by finalShare desc, with the
  // junk entry pushed last to mirror what exportFieldAndRecsShareImage
  // expects downstream.
  function _aggregateFieldByFamily(field) {
    if (!Array.isArray(field) || field.length === 0) return [];
    const byFamily = new Map();
    let junkAcc = null;
    for (const d of field) {
      if (!d || !d.name) continue;
      if (d.name === '_junk') {
        // Junk passes through as-is — there's no family to fold it into.
        junkAcc = { ...d };
        continue;
      }
      const family = _familyKeyForDeck(d.name);
      const display = _familyDisplayForKey(family);
      const existing = byFamily.get(family);
      if (!existing) {
        byFamily.set(family, {
          name: display,
          familyKey: family,
          finalShare: d.finalShare || 0,
          onlineShare: d.onlineShare || 0,
          count: d.count || 0,
          variantCount: 1,
          // Keep the heaviest variant's name so downstream tooltips can
          // identify which deck dominates the family aggregate.
          representativeVariant: d.name,
          representativeShare: d.finalShare || 0,
        });
      } else {
        existing.finalShare += d.finalShare || 0;
        existing.onlineShare += d.onlineShare || 0;
        existing.count += d.count || 0;
        existing.variantCount += 1;
        if ((d.finalShare || 0) > existing.representativeShare) {
          existing.representativeVariant = d.name;
          existing.representativeShare = d.finalShare || 0;
        }
      }
    }
    const out = Array.from(byFamily.values())
      .sort((a, b) => b.finalShare - a.finalShare);
    if (junkAcc) out.push(junkAcc);
    return out;
  }

  // Aggregate recommendations the same way. Each rec keeps the
  // representative variant's day2Prob / avgWR (which is what the
  // matchup math actually computed against the per-variant matchup
  // map) — collapsing those into a family weighted-average would
  // muddy the very signal the column is supposed to surface. The
  // family rollup is purely cosmetic on the recs side: the row's
  // name reads 'Dragapult' instead of 'Dragapult Dusknoir', with
  // the variant exposed in the title attribute.
  function _aggregateRecsByFamily(recs) {
    if (!Array.isArray(recs) || recs.length === 0) return [];
    const byFamily = new Map();
    for (const r of recs) {
      if (!r || !r.name) continue;
      const family = _familyKeyForDeck(r.name);
      const display = _familyDisplayForKey(family);
      const existing = byFamily.get(family);
      if (!existing) {
        byFamily.set(family, {
          ...r,
          name: display,
          familyKey: family,
          representativeVariant: r.name,
          variantCount: 1,
        });
      } else if ((r.day2Prob || 0) > (existing.day2Prob || 0)) {
        // Keep the better-performing variant as the family's "headline"
        // pick — that's what an aspirational reader cares about. The
        // weaker variants fall off the visible list but stay reachable
        // via the per-variant view.
        byFamily.set(family, {
          ...r,
          name: display,
          familyKey: family,
          representativeVariant: r.name,
          variantCount: existing.variantCount + 1,
        });
      } else {
        existing.variantCount += 1;
      }
    }
    return Array.from(byFamily.values())
      .sort((a, b) => (b.day2Prob || 0) - (a.day2Prob || 0));
  }

  function exportFieldAndRecsShareImage(viewMode) {
    const mode = viewMode === 'combined' ? 'combined' : 'single';
    if (!_shareList) return;
    const rawField = buildField();
    if (!rawField.length) return;

    let field;
    if (mode === 'combined') {
      // Combined: fold variants of the same family into a single row.
      // We aggregate AFTER buildField so personal estimates / junk
      // floor / custom decks all flow through the normal pipeline
      // first; the rollup just reshapes the display layer.
      field = _aggregateFieldByFamily(rawField);
    } else {
      const junkEntry = rawField.find(d => d.name === '_junk') || null;
      field = rawField.filter(d => d.name !== '_junk')
                     .sort((a, b) => b.finalShare - a.finalShare);
      if (junkEntry) field.push(junkEntry);
    }

    const split = calcRecommendationsSplit(rawField);
    // Cap to top 12 — long lists eat tall images and the tail of
    // the list isn't actionable anyway.
    let recs = (split.day2 || []).slice(0, 12);
    let tips = (split.geheimtipps || []).slice(0, 3);
    if (mode === 'combined') {
      // Fold variant rows into family rows for visual consistency
      // with the (now family-grouped) field column.
      recs = _aggregateRecsByFamily(recs).slice(0, 12);
      tips = _aggregateRecsByFamily(tips).slice(0, 3);
    }

    if (recs.length === 0) {
      // Nothing to recommend yet (no shareList or pre-predictor) —
      // fall back to the regular field-only image so the user
      // still gets something useful.
      exportFieldShareImage();
      return;
    }

    // Degenerate-spread guard. Past Meta renders fall through to this
    // path with a candidate set whose matchups all default to 50/50
    // when _majorMatchupMap[pastMeta] doesn't cover the archetypes in
    // _shareList — predictor then produces near-identical day2Prob
    // values for every rec, the column is filled with "17.8 % / 50.5 %"
    // ten times in a row, and the only differentiation is mirror
    // penalty (non-mirror candidates rank above mirror ones). The
    // resulting image is actively misleading: it suggests off-meta
    // niche picks beat the dominant archetypes. Better to drop the
    // column entirely and show the field-only image — same fallback
    // we already use when there are no recs at all.
    if (recs.length > 1) {
      const probs = recs.map(r => r.day2Prob || 0);
      const spread = Math.max(...probs) - Math.min(...probs);
      if (spread < 0.005) {  // < 0.5 pp spread = no meaningful ranking
        console.warn(
          `[MetaCall] Recommendations spread is ${(spread * 100).toFixed(2)} pp — ` +
          'matchup data missing for this view, falling back to field-only image.',
        );
        exportFieldShareImage();
        return;
      }
    }

    // Layout: 2-column grid, field on left, recs on right.
    const W = 1280;
    const COL_GAP = 24;
    const SIDE_PAD = 16;
    const FIELD_W = 720;
    const RECS_W = W - SIDE_PAD * 2 - FIELD_W - COL_GAP;
    const ROW_H = 46;
    const HEADER_H = 120;
    const SECTION_H = 48;
    const FOOTER_H = 50;
    // Estimate the tips-block height so we can grow the canvas if
    // recs + tips ends up taller than the field column. Numbers
    // mirror the ones inside _paintTipsBlock.
    const TIPS_TITLE_H  = 26;
    const TIPS_HINT_H   = 22;
    const TIPS_CARD_H   = 64;
    const TIPS_CARD_GAP = 8;
    const TIPS_TOP_GAP  = 14;
    const tipsH = tips.length
      ? TIPS_TOP_GAP + TIPS_TITLE_H + 4 + TIPS_HINT_H + 4 +
        tips.length * TIPS_CARD_H + (tips.length - 1) * TIPS_CARD_GAP
      : 0;
    const fieldColH = field.length * ROW_H;
    const recsColH  = recs.length * ROW_H + tipsH;
    const contentH  = Math.max(fieldColH, recsColH);
    const H = HEADER_H + SECTION_H + contentH + 28 + FOOTER_H;

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    _paintBackground(ctx, W, H);

    // Header subtitle adapts to active tournament type — Day 2,
    // Top Cut, or 1./2. Platz.
    const baseTitleLine = _settings.tournamentType === 'cup'
      ? `${_settings.totalPlayers.toLocaleString()} ${t('mc.labelPlayers')} · ${_settings.rounds} ${t('mc.roundsAbbr')} · Top ${_settings.topCutSize}: ${_settings.day2Points} ${t('mc.ptsAbbr')}`
      : (_settings.tournamentType === 'challenge'
          ? `${_settings.totalPlayers.toLocaleString()} ${t('mc.labelPlayers')} · ${_settings.rounds} ${t('mc.roundsAbbr')} · 1.-2.: ${_settings.day2Points} ${t('mc.ptsAbbr')}`
          : `${_settings.totalPlayers.toLocaleString()} ${t('mc.labelPlayers')} · ${_settings.rounds} ${t('mc.roundsAbbr')} · Day 2: ${_settings.day2Points} ${t('mc.ptsAbbr')}`);
    // View-mode suffix so the reader can tell single (per-variant) from
    // combined (family-grouped) at a glance — matters when both PNGs
    // arrive in the same Telegram thread.
    const viewLabel = mode === 'combined' ? ' · Combined' : ' · Per Variant';
    // Engine-state tag in the title bar so a screenshot self-documents
    // which data source produced these numbers (Indy reco post-mortem:
    // the user couldn't tell whether a "wrong-looking" share image was
    // generated in Current Meta vs Past Meta vs a TG snapshot).
    const sourceLabel = _metaSource === 'past'
      ? ` · Past Meta: ${_pastMetaFormatKey || '?'}`
      : ` · Current Meta${(() => { const c = _displayInPersonSetCode(); return c ? ' (' + c + ')' : ''; })()}`;
    const titleLine = baseTitleLine + viewLabel + sourceLabel;
    _paintHeader(ctx, W, 'META CALL', titleLine);

    // Section labels — one per column.
    const labelY = HEADER_H + 24;
    ctx.fillStyle = '#3498db';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillText(t('mc.panelField').toUpperCase(), SIDE_PAD + 12, labelY);
    ctx.fillStyle = '#9b59b6';
    ctx.fillText(t('mc.panelRecommendations').toUpperCase(), SIDE_PAD + FIELD_W + COL_GAP + 12, labelY);

    // Vertical separator between the two columns.
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(SIDE_PAD + FIELD_W + COL_GAP / 2, HEADER_H + 8, 1, contentH + SECTION_H - 8);

    const startY = HEADER_H + SECTION_H;
    _paintFieldRows(ctx, SIDE_PAD, startY, FIELD_W, field);
    _paintRecRows(ctx, SIDE_PAD + FIELD_W + COL_GAP, startY, RECS_W, recs);
    if (tips.length) {
      // Tips block sits directly under the rec rows in the right column.
      _paintTipsBlock(
        ctx,
        SIDE_PAD + FIELD_W + COL_GAP,
        startY + recs.length * ROW_H,
        RECS_W,
        tips,
      );
    }

    _paintFooter(ctx, W, H);
    _showSharePreview(
      canvas,
      `metacall-field-and-recs-${_formatDateFilename()}.png`,
      'Meta Call — Field & Recommendations',
      `Meta + top picks for ${_settings.totalPlayers.toLocaleString()} players · ${_settings.rounds} rounds`,
    );
  }

  // ── B) Day 2 Share Image (with personal deck) ─────────────
  function exportDay2ShareImage() {
    if (!_shareList || !_settings.myDeck) return;
    const field = buildField();
    if (!field.length) return;

    const { day2Prob, expWin, expTie, expLoss } = calcDay2(field);
    const pct = (day2Prob * 100).toFixed(1);
    const day1WR = _settings.rounds > 0 ? (expWin / _settings.rounds) * 100 : 0;

    // ALL matchups (sorted desc by final share), not just the top 10 —
    // user wants the full picture visible. "Others" (junk) pinned to the
    // bottom so meta-relevant matchups stay at the top.
    const junkEntry = field.find(d => d.name === '_junk') || null;
    const matchups  = field.filter(d => d.name !== '_junk')
                           .sort((a, b) => b.finalShare - a.finalShare);
    if (junkEntry) matchups.push(junkEntry);

    const W = 860;
    const ROW_H = 44;
    const HEADER_H = 120;
    const CARD_H = 200;
    const STATS_H = 50;
    const SECTION_H = 48;
    const FOOTER_H = 50;
    const H = HEADER_H + CARD_H + STATS_H + SECTION_H + matchups.length * ROW_H + 28 + FOOTER_H;

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    _paintBackground(ctx, W, H);
    const _srcLabel2 = _metaSource === 'past'
      ? ` · Past Meta: ${_pastMetaFormatKey || '?'}`
      : ` · Current Meta${(() => { const c = _displayInPersonSetCode(); return c ? ' (' + c + ')' : ''; })()}`;
    _paintHeader(ctx, W, 'META CALL',
      `${_settings.myDeck} · ${_settings.totalPlayers.toLocaleString()} ${t('mc.labelPlayers')} · ${_settings.rounds} ${t('mc.roundsAbbr')}${_srcLabel2}`);

    // Day 2 / Day 1 WR twin card
    const cardY = HEADER_H + 10;
    const cardX = (W - 620) / 2;
    const cardW = 620;
    const cardH = 170;

    const cardGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
    const pctNum = parseFloat(pct);
    if (pctNum >= 60) {
      cardGrad.addColorStop(0, '#27ae60'); cardGrad.addColorStop(1, '#16a085');
    } else if (pctNum >= 40) {
      cardGrad.addColorStop(0, '#f39c12'); cardGrad.addColorStop(1, '#e67e22');
    } else {
      cardGrad.addColorStop(0, '#e74c3c'); cardGrad.addColorStop(1, '#c0392b');
    }
    ctx.fillStyle = cardGrad;
    _roundRect(ctx, cardX, cardY, cardW, cardH, 16);
    ctx.fill();

    // Vertical divider between the two halves
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(cardX + cardW / 2 - 1, cardY + 28, 2, cardH - 56);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // LEFT: Day 2 chance
    const leftCx = cardX + cardW / 4;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 58px system-ui, -apple-system, sans-serif';
    ctx.fillText(pct + '%', leftCx, cardY + 66);
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText(t(_predictTitleKey()).toUpperCase(), leftCx, cardY + 108);
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.fillText(`${_settings.day2Points} ${t('mc.ptsAbbr')} · ${_settings.rounds} ${t('mc.roundsAbbr')}`, leftCx, cardY + 132);

    // RIGHT: Day 1 avg win rate
    const rightCx = cardX + cardW * 3 / 4;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 58px system-ui, -apple-system, sans-serif';
    ctx.fillText(day1WR.toFixed(1) + '%', rightCx, cardY + 66);
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText(t('mc.day1WinRate').toUpperCase(), rightCx, cardY + 108);
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.fillText(t('mc.day1WinRateSub').replace('{r}', _settings.rounds), rightCx, cardY + 132);

    ctx.textAlign = 'left';

    // Expected stats
    const statsY = cardY + cardH + 30;
    ctx.textBaseline = 'middle';
    const statBlocks = [
      { label: t('mc.avgWins'),   val: expWin.toFixed(1),  color: '#2ecc71' },
      { label: t('mc.avgTies'),   val: expTie.toFixed(1),  color: '#f39c12' },
      { label: t('mc.avgLosses'), val: expLoss.toFixed(1), color: '#e74c3c' },
    ];
    const blockW = W / 3;
    statBlocks.forEach((b, i) => {
      const cx = blockW * i + blockW / 2;
      ctx.fillStyle = b.color;
      ctx.font = 'bold 24px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.val, cx, statsY);
      ctx.fillStyle = '#9ab1d4';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(b.label, cx, statsY + 20);
    });
    ctx.textAlign = 'left';

    // Matchups section
    const secY = HEADER_H + CARD_H + STATS_H;
    ctx.fillStyle = '#3498db';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(t('mc.encounters').replace('{r}', String(_settings.rounds)).toUpperCase(), 28, secY + 24);

    let y = secY + SECTION_H;
    matchups.forEach((deck, i) => {
      const isJunk   = deck.name === '_junk';
      const isCustom = !!deck.isCustom;
      const m        = getMatchup(_settings.myDeck, deck.name);
      const wr       = Math.round(m.pWin * 100);
      const lambda   = _settings.rounds * deck.finalShare / 100;

      if (i % 2 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.fillRect(16, y, W - 32, ROW_H);
      }

      // Deck name
      ctx.fillStyle = isJunk ? '#f39c12' : (isCustom ? '#c39bd3' : '#e2e8f0');
      ctx.font = '600 16px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      let label = isJunk ? t('mc.junkDecks') : deck.name;
      if (isCustom) label += ' ★';
      const maxLabelW = 320;
      if (ctx.measureText(label).width > maxLabelW) {
        while (label.length > 4 && ctx.measureText(label + '…').width > maxLabelW) {
          label = label.slice(0, -1);
        }
        label += '…';
      }
      ctx.fillText(label, 28, y + ROW_H / 2);

      // Encounters
      ctx.fillStyle = '#9ab1d4';
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText(`∅ ${lambda.toFixed(2)}`, 360, y + ROW_H / 2);

      // WR bar
      const wrBarX = 460;
      const wrBarW = 260;
      const wrBarH = 10;
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(wrBarX, y + ROW_H / 2 - wrBarH / 2, wrBarW, wrBarH);
      const wrColor = wr >= 55 ? '#2ecc71' : wr <= 45 ? '#e74c3c' : '#f39c12';
      ctx.fillStyle = wrColor;
      ctx.fillRect(wrBarX, y + ROW_H / 2 - wrBarH / 2, wrBarW * Math.max(0, Math.min(1, wr / 100)), wrBarH);

      // WR number
      ctx.fillStyle = wrColor;
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(wr + '%', W - 28, y + ROW_H / 2);
      ctx.textAlign = 'left';

      y += ROW_H;
    });

    _paintFooter(ctx, W, H);
    _showSharePreview(canvas, `metacall-day2-${_formatDateFilename()}.png`,
      `Meta Call — ${_settings.myDeck}`,
      `Day 2 chance: ${pct}% · ${_settings.myDeck} vs ${_settings.totalPlayers.toLocaleString()} players`);
  }

  function _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y,     x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x,     y + h, r);
    ctx.arcTo(x,     y + h, x,     y,     r);
    ctx.arcTo(x,     y,     x + w, y,     r);
    ctx.closePath();
  }

  function _formatDateFilename() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }

  // ── Event Handlers ─────────────────────────────────────────
  function _onSetting(key, val) {
    if (isNaN(val) || val <= 0) return;
    _settings[key] = val;
    if (key === 'totalPlayers') {
      _playersInputTouched = true;
      // For Local tabs (Challenge / Cup) every other setting follows
      // deterministic Swiss tournament rules, so we don't make the
      // user re-enter them — auto-fill rounds, top-cut size (Cup
      // only), and target points in lock-step. Manual override is
      // still possible by editing those inputs afterwards; on the
      // next player-count change the auto-fill kicks in again.
      if (_settings.tournamentType !== 'regional') {
        _settings.rounds = _suggestSwissRounds(val);
        if (_settings.tournamentType === 'cup') {
          _settings.topCutSize = _suggestTopCutSize(val);
        }
        const target = _defaultTargetPoints(
          _settings.tournamentType, _settings.rounds, _settings.topCutSize,
        );
        if (target) _settings.day2Points = target;
        _syncSettingsInputsFromState();
      }
    }
    if (key === 'topCutSize' && _settings.tournamentType === 'cup') {
      // Re-suggest target points when Top Cut size flips between 4 ↔ 8.
      const target = _defaultTargetPoints('cup', _settings.rounds, val);
      if (target) {
        _settings.day2Points = target;
        _syncSettingsInputsFromState();
      }
    }
    if (key === 'rounds' && _settings.tournamentType !== 'regional') {
      // Manual rounds override — re-derive target so the points
      // floor matches the new round count (5R T8 = 12 pts vs
      // 6R T8 = 15 pts, etc.). User can still type their own
      // target afterwards; cascade fires only on rounds-change.
      const target = _defaultTargetPoints(
        _settings.tournamentType, val, _settings.topCutSize,
      );
      if (target) {
        _settings.day2Points = target;
        _syncSettingsInputsFromState();
      }
    }
    _persistTournamentSettingsForActiveType();
    refreshResults();
  }

  // refreshResults() rebuilds the field-table + result panels but
  // not the settings panel — those input elements live across the
  // re-render. When _onSetting auto-fills sibling fields (rounds,
  // top-cut, target-pts) the user types into Players, we need to
  // push the new values back into the input/select DOM so what's
  // shown matches state. Surgical updates only — full re-render
  // would steal focus from the input the user is still typing in.
  function _syncSettingsInputsFromState() {
    const roundsEl  = document.getElementById('mc-rounds');
    const targetEl  = document.getElementById('mc-day2pts');
    const topCutEl  = document.getElementById('mc-topcut');
    if (roundsEl && document.activeElement !== roundsEl) {
      roundsEl.value = _settings.rounds;
    }
    if (targetEl && document.activeElement !== targetEl) {
      targetEl.value = _settings.day2Points;
    }
    if (topCutEl && _settings.tournamentType === 'cup') {
      topCutEl.value = String(_settings.topCutSize);
    }
  }

  // Active-tab state in localStorage so the chosen tournament-type
  // (and its per-tab overrides) survives a page reload.
  function _persistTournamentSettingsForActiveType() {
    const type = _settings.tournamentType;
    if (!TOURNAMENT_TYPES.includes(type)) return;
    _settingsByType[type] = {
      totalPlayers: _settings.totalPlayers,
      rounds:       _settings.rounds,
      day2Points:   _settings.day2Points,
      topCutSize:   _settings.topCutSize,
    };
    try {
      localStorage.setItem(TOURNAMENT_SETTINGS_KEY, JSON.stringify({
        activeType: type,
        byType: _settingsByType,
      }));
    } catch (_e) { /* private mode — runtime state still works */ }
  }

  // Switch tournament type. Pulls the per-type stored values back
  // into _settings (or auto-derives them if the user hasn't tweaked
  // that tab yet) and re-renders the whole MetaCall view so the
  // settings panel + the predictor banner labels reflect the new
  // mode.
  function _setTournamentType(type) {
    if (!TOURNAMENT_TYPES.includes(type)) return;
    if (_settings.tournamentType === type) return;
    _settings.tournamentType = type;
    const stored = _settingsByType[type] || {};
    if (stored.totalPlayers) _settings.totalPlayers = stored.totalPlayers;
    if (stored.rounds)       _settings.rounds       = stored.rounds;
    if (stored.day2Points)   _settings.day2Points   = stored.day2Points;
    if (typeof stored.topCutSize === 'number') _settings.topCutSize = stored.topCutSize;
    // Forget input-touched state when switching tabs so the player
    // input shows the type's default until the user types again.
    _playersInputTouched = !!stored.totalPlayers;
    _persistTournamentSettingsForActiveType();
    renderAll();
  }

  // Toggle for the CL data sources panel. Mutates _useClCurrent /
  // _useClPast, re-runs the predictor with the new mix, and re-renders
  // so the field composition + recommendations reflect the new shares.
  function _onToggleSource(key, on) {
    if (key === 'clCurrent') _useClCurrent = !!on;
    else if (key === 'clPast') _useClPast = !!on;
    else return;
    _runPredictor();
    renderAll();
  }

  // Switch the Meta Call mode (standard / counter). Re-runs the
  // predictor so the field-composition list immediately reflects
  // whether 4.6 / 4.7 are firing.
  function _setMetaCallMode(mode) {
    const next = mode === 'counter' ? 'counter' : 'standard';
    if (_metaCallMode === next) return;
    _metaCallMode = next;
    _runPredictor();
    renderAll();
  }

  function _onMyDeck(val) {
    _settings.myDeck = val;
    _winRateOverrides = {};
    _journalStats     = {};
    _journalRateKeys  = [];
    if (val && typeof window.getBattleJournalWinRates === 'function') {
      const rates = window.getBattleJournalWinRates(val, 1, { excludeBricks: _settings.excludeBricks });
      Object.keys(rates).forEach(opp => {
        _journalStats[opp] = rates[opp];
        if (rates[opp].total >= 3) _journalRateKeys.push(opp);
      });
    }
    // Preserve scroll so the user stays where they were picking the deck
    const sy = window.scrollY;
    renderAll();
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, sy)));
  }

  // Filter / select handler for the searchable My-Deck input. The
  // <input list> + <datalist> combo lets users type to filter the
  // archetype list instead of scrolling through a long <select>.
  // We only commit a selection (and trigger the expensive renderAll
  // path inside _onMyDeck) when the typed text matches a real deck
  // name exactly — otherwise mid-keystroke re-renders would steal
  // focus and erase what the user is typing.
  function _onMyDeckInput(val) {
    const trimmed = (val || '').trim();
    if (!trimmed) {
      if (_settings.myDeck) _onMyDeck('');
      return;
    }
    const list = _shareList || [];
    const match = list.find(d => d.name === trimmed)
               || list.find(d => d.name.toLowerCase() === trimmed.toLowerCase());
    if (match && match.name !== _settings.myDeck) {
      _onMyDeck(match.name);
    }
  }

  // Companion to _onMyDeckInput — fires on blur / datalist-pick
  // (the `change` event). If the user typed something that doesn't
  // match any deck and then walked away, snap the input back to the
  // currently selected deck so the field doesn't sit with stale
  // partial text that looks like a failed selection.
  function _onMyDeckCommit(input) {
    if (!input) return;
    const trimmed = (input.value || '').trim();
    if (!trimmed) return; // empty is already handled by _onMyDeckInput
    const list = _shareList || [];
    const match = list.find(d => d.name === trimmed)
               || list.find(d => d.name.toLowerCase() === trimmed.toLowerCase());
    if (!match) {
      input.value = _settings.myDeck || '';
    }
  }

  function _onBrickFilter(val) {
    _settings.excludeBricks = (val === 'exclude');
    // Reload journal stats with new filter
    _onMyDeck(_settings.myDeck);
  }

  function _onPersonalShare(deckName, val) {
    const num = parseFloat(val);
    if (val === '' || isNaN(num)) {
      delete _personalShares[deckName];
    } else {
      _personalShares[deckName] = Math.max(0, Math.min(100, num));
    }
    clearTimeout(_personalShares.__timer);
    _personalShares.__timer = setTimeout(refreshResults, 600);
  }

  // ── Custom Decks ─────────────────────────────────────────────
  function _addCustomDeck() {
    if (_customDecks.length >= MAX_CUSTOM) return;
    _customDecks.push({ name: '', share: 0 });
    refreshCustomDecksPanel();
    refreshResults();
  }

  function _removeCustomDeck(idx) {
    if (idx < 0 || idx >= _customDecks.length) return;
    _customDecks.splice(idx, 1);
    refreshCustomDecksPanel();
    refreshResults();
  }

  function _onCustomDeckName(idx, val) {
    if (idx < 0 || idx >= _customDecks.length) return;
    _customDecks[idx].name = String(val || '').trim();
    clearTimeout(_customDecks.__nameTimer);
    _customDecks.__nameTimer = setTimeout(refreshResults, 500);
  }

  function _onCustomDeckShare(idx, val) {
    if (idx < 0 || idx >= _customDecks.length) return;
    const num = parseFloat(val);
    _customDecks[idx].share = isNaN(num) ? 0 : Math.max(0, Math.min(100, num));
    clearTimeout(_customDecks.__shareTimer);
    _customDecks.__shareTimer = setTimeout(refreshResults, 500);
  }

  // Called by TestingGroups to import a group's data into this MetaCall
  // session. We map group data as follows:
  //   • group.quantity → personal-share overrides on matching top decks;
  //     anything in the group but NOT in the top 12 becomes a custom deck
  //   • group.matchups[myDeck] → per-opponent WR overrides (if a deck is
  //     currently selected in MetaCall)
  // We don't touch settings (players / rounds / day2Points) — those stay
  // as the user set them.
  function _testingGroupLoad(groupData) {
    if (!groupData) {
      console.warn('[MetaCall] _testingGroupLoad: no groupData');
      return { personalCount: 0, customCount: 0, overrideCount: 0 };
    }
    if (!_shareList) {
      // This is the silent-fail scenario — caller should await preload()
      // before reaching here. Log loudly so any future caller who skips
      // preload notices in the console.
      console.error('[MetaCall] _testingGroupLoad: _shareList not loaded yet; aborting');
      return { personalCount: 0, customCount: 0, overrideCount: 0 };
    }
    const decks   = groupData.decks   || [];
    const qty     = groupData.quantity|| {};
    const matrix  = groupData.matchups|| {};

    // Normalize names from the online share list for fuzzy matching
    const shareNames = new Set(_shareList.map(d => normalize(d.name)));

    // 1) TG shares for matching decks → fold INTO the predictor (one of
    //    its weighted signals), NOT into _personalShares. This leaves
    //    the "MY ESTIMATE" column free for last-minute manual tweaks
    //    on top of the TG-informed prediction. Unknown decks (not in
    //    the online ladder list) still go to _customDecks since they
    //    have no ladder/brought data to fold them into.
    _tgFieldShares  = {};
    _customDecks    = [];
    decks.forEach(name => {
      const q = Number(qty[name]);
      if (isNaN(q) || q <= 0) return;
      if (name === 'Rest') return;  // skip the residual bucket
      if (shareNames.has(normalize(name))) {
        const canonical = (_shareList.find(d => normalize(d.name) === normalize(name)) || {}).name || name;
        _tgFieldShares[canonical] = q;
      } else if (_customDecks.length < MAX_CUSTOM) {
        _customDecks.push({ name, share: q });
      }
    });

    // 2) Win-rate overrides, only if the user has picked a deck.
    //    Apostrophe-robust: find myDeck's row via normalize so a testing
    //    group key "N's Zoroark" (straight) matches "N's Zoroark" (curly)
    //    stored in _settings.myDeck (which came from _shareList). Store
    //    each override under the CANONICAL _shareList name so later
    //    lookups from getMatchup() hit cleanly.
    _winRateOverrides = {};
    if (_settings.myDeck) {
      const myDeckNorm = normalize(_settings.myDeck);
      const myRowKey   = Object.keys(matrix).find(k => normalize(k) === myDeckNorm);
      const myRow      = (myRowKey && matrix[myRowKey]) || {};
      Object.keys(myRow).forEach(opp => {
        const wr = Number(myRow[opp]);
        if (isNaN(wr) || wr < 0 || wr > 100) return;
        // Prefer canonical name from online share list
        const canonical = (_shareList.find(d => normalize(d.name) === normalize(opp)) || {}).name || opp;
        _winRateOverrides[canonical] = wr;
      });
    }

    // Re-run the predictor so TG shares immediately fold into the
    // ONLINE % column rather than waiting for the next loadData call.
    _runPredictor();
    renderAll();

    // Return a summary so TestingGroups can show the user what was
    // actually imported (helps debug when names don't match).
    const summary = {
      personalCount: Object.keys(_tgFieldShares).length, // legacy key name; TG shares now
      customCount:   _customDecks.length,
      overrideCount: Object.keys(_winRateOverrides).length,
    };
    console.log('[MetaCall] Testing group loaded:', summary);
    return summary;
  }

  function refreshCustomDecksPanel() {
    const panel = document.getElementById('mc-custom-decks-panel');
    if (panel) panel.outerHTML = renderCustomDecksPanel();
  }

  function _onWrOverride(deckName, val) {
    const num = parseFloat(val);
    if (val === '' || isNaN(num)) {
      delete _winRateOverrides[deckName];
    } else {
      _winRateOverrides[deckName] = Math.max(0, Math.min(100, num));
    }
    // refreshResults only — don't rebuild the override panel itself or the
    // user loses focus and the whole panel collapses back to closed state
    clearTimeout(_winRateOverrides.__timer);
    _winRateOverrides.__timer = setTimeout(refreshResults, 600);
  }

  function _toggleOverrides() {
    const panel = document.getElementById('mc-override-panel');
    const btn   = document.getElementById('mc-override-btn');
    if (!panel) return;
    const open = panel.classList.toggle('open');
    if (btn) btn.textContent = open ? 'Win-Rates anpassen ▲' : 'Win-Rates anpassen ▼';
    if (open && _settings.myDeck) panel.innerHTML = renderOverrideTable();
  }

  // Expand/collapse a pokemon variant group in the field table
  function _toggleGroup(gid) {
    const rows   = document.querySelectorAll(`.mc-group-detail[data-group="${gid}"]`);
    const arrow  = document.getElementById(`mc-gt-${gid}`);
    if (!rows.length) return;
    const opening = rows[0].classList.contains('mc-group-hidden');
    rows.forEach(r => r.classList.toggle('mc-group-hidden', !opening));
    if (arrow) arrow.textContent = opening ? '▼' : '▶';
  }

  // Toggle the per-deck detail row. Flips this row's deviation from
  // the global mode — so clicking ▾ on an open row marks it as
  // "deviates from default" if default is expanded, and clears the
  // override if it was already deviating. Pure DOM walk — finds the
  // detail row as the next sibling of the button's main row — so the
  // click is instant and doesn't blow away focus elsewhere.
  function _toggleDetail(btn) {
    if (!btn) return;
    const k = btn.getAttribute('data-deck-key') || '';
    const mainRow = btn.closest('tr');
    if (!mainRow) return;
    const detail = mainRow.nextElementSibling;
    if (!detail || !detail.classList.contains('mc-row-detail')) return;
    const opening = detail.classList.contains('is-collapsed');
    detail.classList.toggle('is-collapsed', !opening);
    btn.classList.toggle('is-expanded', opening);
    btn.setAttribute('aria-expanded', opening ? 'true' : 'false');
    if (k) {
      // XOR-toggle the deviation. Adds to the set if not present
      // (row now differs from the global default), removes if it
      // was already deviating (row matches the default again).
      if (_detailOverrides.has(k)) _detailOverrides.delete(k);
      else _detailOverrides.add(k);
    }
  }

  // Flip the global "everything expanded by default" mode and clear
  // any per-row deviations. Re-renders the field panel so the new
  // default sweeps through every row at once.
  function _toggleAllDetails() {
    _detailGlobalMode = _detailGlobalMode === 'expanded' ? 'collapsed' : 'expanded';
    _detailOverrides.clear();
    refreshResults();
  }

  // Toggle flat ↔ grouped field view — preserve scroll so user sees the
  // change. Choice persists in localStorage so the next visit picks up
  // where the user left off (separate from per-scenario storage).
  function _toggleGroupField() {
    _groupByMain = !_groupByMain;
    try { localStorage.setItem(GROUP_BY_MAIN_STORAGE_KEY, _groupByMain ? '1' : '0'); }
    catch (_) { /* private mode — runtime state still works */ }
    const sy = window.scrollY;
    renderAll();
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, sy)));
  }

  // ── Saved Scenarios ──────────────────────────────────────────
  //
  // A "scenario" captures the full MetaCall editing state under a user-
  // chosen name so the user can come back later and keep iterating.
  // Persisted in localStorage as:
  //   { [name]: { savedAt, settings, personalShares, winRateOverrides,
  //               customDecks, groupByMain } }

  function _loadScenarios() {
    try {
      const raw = localStorage.getItem(SCENARIOS_STORAGE_KEY);
      return raw ? (JSON.parse(raw) || {}) : {};
    } catch (_) {
      return {};
    }
  }

  // Inspect the raw storage state so the UI can distinguish between
  // "never saved anything" and "saved data is unreadable / lost".
  function _scenarioStorageStatus() {
    try {
      const raw = localStorage.getItem(SCENARIOS_STORAGE_KEY);
      if (raw == null) return { state: 'empty', bytes: 0, count: 0 };
      const bytes = raw.length;
      let parsed;
      try { parsed = JSON.parse(raw); }
      catch (_) { return { state: 'corrupted', bytes, count: 0 }; }
      const count = parsed && typeof parsed === 'object' ? Object.keys(parsed).length : 0;
      return { state: count > 0 ? 'ok' : 'empty', bytes, count };
    } catch (e) {
      return { state: 'corrupted', bytes: 0, count: 0, error: String(e && e.message || e) };
    }
  }

  // Returns true on success, false on failure. On failure, surfaces an
  // alert so the user knows their save did not actually persist (older
  // versions silently swallowed the error, which made data loss invisible).
  function _writeScenarios(obj) {
    try {
      const payload = JSON.stringify(obj || {});
      localStorage.setItem(SCENARIOS_STORAGE_KEY, payload);
      // Read-back verification: confirms the value is actually in storage
      // (catches private-mode browsers that accept setItem but discard).
      const verify = localStorage.getItem(SCENARIOS_STORAGE_KEY);
      if (verify !== payload) {
        const msg = 'read-back mismatch';
        console.error('[MetaCall] Scenario persist verification failed:', msg);
        try { alert(t('mc.scenarioSaveError').replace('{error}', msg)); } catch (_) {}
        return false;
      }
      return true;
    } catch (e) {
      console.error('[MetaCall] Failed to persist scenarios:', e);
      try { alert(t('mc.scenarioSaveError').replace('{error}', String(e && e.message || e))); } catch (_) {}
      return false;
    }
  }

  function _snapshotState() {
    return {
      savedAt          : new Date().toISOString(),
      settings         : { ..._settings },
      personalShares   : { ..._personalShares },
      winRateOverrides : { ..._winRateOverrides },
      customDecks      : _customDecks.map(c => ({ name: c.name, share: c.share })),
      groupByMain      : _groupByMain,
    };
  }

  function _applyState(state) {
    if (!state) return;
    _settings = { ..._settings, ...(state.settings || {}) };
    _personalShares   = { ...(state.personalShares   || {}) };
    _winRateOverrides = { ...(state.winRateOverrides || {}) };
    _customDecks      = Array.isArray(state.customDecks)
      ? state.customDecks.map(c => ({ name: c.name || '', share: Number(c.share) || 0 }))
      : [];
    _groupByMain      = !!state.groupByMain;

    // Rebuild journal stats for the new deck if one is set
    _journalStats = {};
    _journalRateKeys = [];
    if (_settings.myDeck && typeof window.getBattleJournalWinRates === 'function') {
      const rates = window.getBattleJournalWinRates(_settings.myDeck, 1, { excludeBricks: _settings.excludeBricks });
      Object.keys(rates).forEach(opp => {
        _journalStats[opp] = rates[opp];
        if (rates[opp].total >= 3) _journalRateKeys.push(opp);
      });
    }
  }

  function _saveScenario() {
    const existing = _loadScenarios();
    const preset   = _currentScenarioName || '';
    const name = (prompt(t('mc.scenarioPromptName'), preset) || '').trim();
    if (!name) return;
    if (name.length > 60) {
      alert(t('mc.scenarioNameTooLong'));
      return;
    }
    if (existing[name] && name !== _currentScenarioName) {
      if (!confirm(t('mc.scenarioOverwrite').replace('{name}', name))) return;
    }
    existing[name] = _snapshotState();
    if (!_writeScenarios(existing)) {
      // Persistence failed — do not pretend the save succeeded.
      refreshScenariosBar();
      return;
    }
    _currentScenarioName = name;
    refreshScenariosBar();
  }

  function _onScenarioSelect(name) {
    if (!name) {
      _currentScenarioName = '';
      refreshScenariosBar();
      return;
    }
    const scenarios = _loadScenarios();
    const state = scenarios[name];
    if (!state) return;
    _applyState(state);
    _currentScenarioName = name;
    const sy = window.scrollY;
    renderAll();
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, sy)));
  }

  function _deleteScenario() {
    if (!_currentScenarioName) return;
    const name = _currentScenarioName;
    if (!confirm(t('mc.scenarioDeleteConfirm').replace('{name}', name))) return;
    const existing = _loadScenarios();
    delete existing[name];
    _writeScenarios(existing);
    _currentScenarioName = '';
    refreshScenariosBar();
  }

  // Update the currently-loaded scenario in place: re-run the predictor
  // against the latest CSV data, write the fresh predicted shares + a
  // history snapshot back into the scenario, and surface a toast that
  // tells the user how many decks shifted by >2pp.
  function _refreshScenario() {
    if (!_currentScenarioName) return;
    const scenarios = _loadScenarios();
    const scenario = scenarios[_currentScenarioName];
    if (!scenario) return;

    // Capture the previous top-deck shares so we can diff. Pulled from
    // the most recent history snapshot; falls back to scenario.topDecks
    // (older scenarios saved before we tracked history).
    const lastHist = Array.isArray(scenario.history) && scenario.history.length
      ? scenario.history[scenario.history.length - 1]
      : null;
    const prevByName = {};
    const prevSrc = lastHist ? lastHist.topDecks : (scenario.topDecks || []);
    (prevSrc || []).forEach(d => { if (d && d.name) prevByName[d.name] = d.predicted || 0; });

    // Re-run with fresh inputs.
    _runPredictor();

    // Build the new top-10 snapshot.
    const sorted = [..._shareList].sort((a, b) => b.predictedShare - a.predictedShare);
    const top = sorted.slice(0, 10).map(d => {
      const k = normalize(d.name);
      const labsRow = _labsRowsByDeck[k];
      const stats = _tournamentStats ? _tournamentStats[k] : null;
      const conv = _labsConvByDeck[k];
      return {
        name      : d.name,
        predicted : Number(d.predictedShare.toFixed(2)),
        ladder    : Number((d.ladderShare || 0).toFixed(2)),
        labs      : labsRow ? Number(labsRow.share.toFixed(2)) : 0,
        brought   : stats ? Number(stats.broughtShare.toFixed(2)) : 0,
        top8Conv  : (conv && conv.n > 0) ? Number((conv.sum / conv.n).toFixed(3)) : 0,
      };
    });

    // Count significant moves vs previous snapshot (≥2pp predicted shift).
    let movers = 0;
    top.forEach(d => {
      const prev = prevByName[d.name];
      if (prev !== undefined && Math.abs(d.predicted - prev) >= 2) movers++;
    });

    const histEntry = {
      updatedAt     : new Date().toISOString(),
      predictorMode : _predictorMode,
      metaCallMode  : _metaCallMode,
      lastMajorDate : _lastMajorDate || '',
      baselineDate  : _baselineSnapshotDate || '',
      topDecks      : top,
    };

    scenario.history = Array.isArray(scenario.history) ? scenario.history.slice() : [];
    scenario.history.push(histEntry);
    // Cap history at 25 entries to keep localStorage payload reasonable.
    if (scenario.history.length > 25) scenario.history = scenario.history.slice(-25);
    scenario.topDecks = top;        // also expose latest at top level for older readers
    scenario.savedAt = histEntry.updatedAt;

    scenarios[_currentScenarioName] = scenario;
    if (!_writeScenarios(scenarios)) return;

    const today = histEntry.updatedAt.slice(0, 10).split('-').reverse().join('.');
    const msg = `Szenario auf Stand vom ${today} aktualisiert. ${movers} Decks haben sich um >2% verändert.`;
    if (typeof window.showNotification === 'function') {
      try { window.showNotification(msg, 'success'); } catch (_) { /* tolerate */ }
    } else {
      console.info('[MetaCall]', msg);
    }
    renderAll();
  }

  function refreshScenariosBar() {
    const bar = document.getElementById('mc-scenarios-bar');
    if (bar) bar.outerHTML = renderScenariosBar();
  }

  function renderScenariosBar() {
    const scenarios = _loadScenarios();
    const names = Object.keys(scenarios).sort((a, b) =>
      (scenarios[b].savedAt || '').localeCompare(scenarios[a].savedAt || ''));

    const options = [
      `<option value="">${esc(t('mc.scenarioNone'))}</option>`,
      ...names.map(n =>
        `<option value="${esc(n)}" ${n === _currentScenarioName ? 'selected' : ''}>${esc(n)}</option>`),
    ].join('');

    const hasCurrent = !!_currentScenarioName;
    const saveLabel  = hasCurrent ? t('mc.scenarioUpdate') : t('mc.scenarioSave');

    // Diagnostic hint: when the dropdown has no entries, tell the user
    // *why* — distinguishes "never saved" from "save data unreadable".
    // The (storage_key: bytes) tail is only appended on corruption,
    // where it actually helps debugging — beginners shouldn't see it
    // on a fresh empty install.
    let hint = '';
    if (names.length === 0) {
      const status = _scenarioStorageStatus();
      if (status.state === 'corrupted') {
        const msg = t('mc.scenarioStorageCorrupted');
        hint = `<div class="mc-scenarios-hint">${esc(msg)} (${SCENARIOS_STORAGE_KEY}: ${status.bytes}B)</div>`;
      }
      // "Storage empty" case → no inline hint. The dropdown's
      // own "— no scenario —" placeholder + the Save… button next
      // to it make the empty state self-evident; the long explainer
      // was burning a full row on every load.
    }

    // Predictions-history block: show the last few snapshots' top-3 so
    // the user can see how the prediction has evolved since they first
    // saved the scenario. Only renders when a scenario is loaded AND
    // it has history entries.
    let historyBlock = '';
    if (hasCurrent) {
      const cur = scenarios[_currentScenarioName];
      const hist = (cur && Array.isArray(cur.history)) ? cur.history.slice(-5).reverse() : [];
      if (hist.length > 0) {
        const histRows = hist.map(h => {
          const dt = (h.updatedAt || '').slice(0, 10).split('-').reverse().join('.');
          const top3 = (h.topDecks || []).slice(0, 3)
            .map(d => `${esc(d.name)} ${d.predicted.toFixed(1)}%`).join(' · ');
          const modeTag = h.predictorMode === 'B' ? 'B' : 'A';
          return `<li class="mc-scenario-hist-row">
            <span class="mc-scenario-hist-date">${dt}</span>
            <span class="mc-scenario-hist-mode" title="Predictor mode">${modeTag}</span>
            <span class="mc-scenario-hist-top">${top3 || '—'}</span>
          </li>`;
        }).join('');
        historyBlock = `
<details class="mc-scenario-history">
  <summary>📜 Predictions-History (${(cur.history || []).length})</summary>
  <ul class="mc-scenario-hist-list">${histRows}</ul>
</details>`;
      }
    }

    return `
<div class="mc-scenarios-bar" id="mc-scenarios-bar">
  <label class="mc-scenarios-label">💾 ${t('mc.scenarios')}</label>
  <select class="mc-scenarios-select" onchange="MetaCall._onScenarioSelect(this.value)">
    ${options}
  </select>
  ${hasCurrent
    ? `<button type="button" class="mc-scenarios-refresh-btn" onclick="MetaCall._refreshScenario()"
              title="Mit aktuellen Daten aktualisieren + History-Eintrag">🔄</button>`
    : ''}
  <button type="button" class="mc-scenarios-save-btn" onclick="MetaCall._saveScenario()">
    ${saveLabel}
  </button>
  ${hasCurrent
    ? `<button type="button" class="mc-scenarios-del-btn" onclick="MetaCall._deleteScenario()"
              title="${esc(t('mc.scenarioDelete'))}">🗑</button>`
    : ''}
  ${hint}
  ${historyBlock}
</div>`;
  }

  // ── Public Init ────────────────────────────────────────────
  //
  // Zielcontainer ist seit dem 18.08.2026 #metaCallHost im eigenen Tab
  // #meta-call, nicht mehr #profile-metacall in #profile-content. Der
  // alte Container lag hinter der Anmeldung, obwohl dieses Modul in
  // 10.839 Zeilen keinen einzigen Treffer fuer currentUser,
  // getCurrentUser oder window.auth hat.
  async function init() {
    const container = document.getElementById('metaCallHost');
    if (!container) return;
    if (_shareList && _matchupMap) { renderAll(); return; }

    container.innerHTML = `
<div class="metacall-wrap">
  <div class="metacall-header"><h2>${t('mc.title')} <button class="tab-help-btn" onclick="openTabHelp('meta-call')" title="Help" aria-label="Help for Meta Call" data-i18n-title="btn.helpTitle"></button></h2></div>
  <div class="metacall-loading">${t('mb.loading')}</div>
</div>`;

    const ok = await loadData();
    if (!ok) {
      container.innerHTML = `<div class="metacall-error">
        ${t('mb.loadError')}
      </div>`;
      return;
    }
    renderAll();

    // Re-render when language is switched while MetaCall is open
    document.addEventListener('languageChanged', () => {
      if (_shareList) renderAll();
    }, { once: false });
  }

  // Click-handler for a Recommendations row → jumps to the global
  // Current Meta Deck Analysis tab with that archetype pre-selected,
  // so the user lands directly on the deck-builder context for the
  // pick they liked. Uses navigateToCurrentMetaWithDeck (same handler
  // the tier cards use), which lives in app-core.js.
  function _jumpToDeckAnalysis(deckName) {
    if (!deckName) return;
    // Source-aware routing: Past Meta source → Past Meta tab with the
    // user's chosen format + deck pre-selected; Current Meta → existing
    // Current Meta Analysis routing.
    if (_metaSource === 'past' && _pastMetaFormatKey
        && typeof window.navigateToPastMetaWithDeck === 'function') {
      window.navigateToPastMetaWithDeck(deckName, _pastMetaFormatKey);
      return;
    }
    if (typeof window.navigateToCurrentMetaWithDeck === 'function') {
      window.navigateToCurrentMetaWithDeck(deckName);
    } else if (typeof switchTabAndUpdateMenu === 'function') {
      // Fallback: just open the Current Meta tab without preselect.
      switchTabAndUpdateMenu('current-meta');
    }
  }

  // Apply the global "data window from" date filter — invoked by Card
  // Analysis's setCurrentMetaDateFrom whenever the user picks a new
  // cutoff. Drops Meta Call's derived caches (history snapshots, ACE-SPEC
  // variants, doctrine map) so the next predictor run consumes the
  // freshly-filtered data instead of stale full-window aggregates.
  // Re-runs _runPredictor when the share list is already populated so
  // the user sees the change immediately without a page navigation.
  // Re-derive per-archetype share% from the filtered dated tournament
  // rows. The original ladder share comes from
  // limitless_online_decks_comparison.csv which is a CURRENT cumulative
  // snapshot with no per-row dates — it can't honour a date window. To
  // make the date filter actually move the predictor's headline
  // numbers, we reconstruct ladder share + brought share from
  // online_tournament_dated_cards.csv (per-tournament rows) when the
  // filter is active. The bucket key (tournament_id, archetype) is one
  // deck appearance; share = bucket count / total buckets in the
  // window. Returns Map<archetype-normalized, bucketCount>.
  function _bucketCountsFromDatedRows(rows) {
    const counts = new Map();
    const seen = new Set();
    for (const r of rows || []) {
      const a = (r && r.archetype || '').trim();
      const t = (r && r.tournament_id || '').trim();
      if (!a || !t) continue;
      const key = `${t}|${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const norm = normalize(a);
      counts.set(norm, (counts.get(norm) || 0) + 1);
    }
    return counts;
  }

  async function _applyDateFilter() {
    _allHistorySnapshots = null;
    _aceSpecVariantsByDeck = {};
    _archetypeDoctrineMap = null;
    _datedCardsRows = null; // raw stays cached on _datedCardsRowsRaw
    if (!_shareList || _shareList.length === 0) return;
    // Use the EFFECTIVE cutoff (explicit user pick OR auto-28-day default)
    // so the override fires even when the user hasn't picked a date — a
    // user-flagged LA Regionals gap (Dragapult predicted 17 % vs actual
    // 31.9 %) showed that cumulative aggregates dilute current-meta
    // share. The auto-default keeps the predictor on a recent window.
    const cutoff = _effectiveDateCutoff();
    try {
      // Lazy-load history snapshots (filter applied inside loader).
      _allHistorySnapshots = await _loadAllHistorySnapshots();
      await _loadAceSpecVariants();
      await _loadArchetypeDoctrineMap();

      // Substantive override — recompute ladder share + brought share
      // from filtered dated rows. Without this, the predictor stays
      // anchored to the cumulative (all-time) snapshot and the date
      // window has only a tiny effect via the recency baseline term.
      // User flagged: 27.04 vs 05.05 cutoffs gave Dragapult 17.45 vs
      // 17.46 % — a 0.01 pp move that's effectively a no-op.
      //
      // Predictor 5.6 — skip the substantive override in Mode A.
      // online_tournament_dated_cards.csv is a small per-tournament
      // ARCHETYPE-COUNT aggregate (~15 k rows, 572 deck-buckets over
      // the current 4-day CRI window). It's NOT the ladder — it's the
      // organized-play subset, which has a totally different deck
      // distribution from what casual ladder players bring:
      //     Ladder    Dated-Tournament
      //   Dragapult         8.40 %     2.27 %   (-6.13 pp)
      //   Mega Greninja     8.23 %     1.57 %   (-6.66 pp)
      //   Grimmsnarl Frosl  1.65 %     3.32 %   (+1.67 pp)
      // Overwriting the LADDER with that distribution is a category
      // error during a fresh rotation — Mega Greninja vanishes and
      // Grimmsnarl Froslass jumps to predicted #1 with 4.7 %. In
      // Mode B (real major data exists), the dated-cards stream is
      // re-anchored against the major shares and the dilution
      // matters; in Mode A, the limitless ladder snapshot IS the
      // authoritative current-format signal and must not be
      // overwritten. Skip the override entirely.
      const skipLadderOverride = _predictorMode !== 'B';
      if (skipLadderOverride) {
        try {
          console.info(
            `[Predictor 5.6] Mode A — skipping ladder/brought rewrite ` +
            `from dated-cards (kept raw limitless ladder share).`
          );
        } catch (_e) { /* ignore */ }
      }
      if (!skipLadderOverride && cutoff && /^\d{4}-\d{2}-\d{2}$/.test(cutoff)) {
        // Cache pre-filter values on first override so a later "Clear"
        // can restore them without a full reload.
        if (!_origLadderShareByDeck) {
          _origLadderShareByDeck = new Map();
          for (const d of _shareList) {
            _origLadderShareByDeck.set(normalize(d.name), d.ladderShare);
          }
        }
        if (!_origBroughtShareByDeck && _tournamentStats) {
          _origBroughtShareByDeck = new Map();
          for (const k of Object.keys(_tournamentStats)) {
            _origBroughtShareByDeck.set(k, _tournamentStats[k].broughtShare);
          }
        }
        const counts = _bucketCountsFromDatedRows(_datedCardsRows || []);
        const totalBuckets = Array.from(counts.values()).reduce((s, n) => s + n, 0);
        if (totalBuckets > 0) {
          for (const d of _shareList) {
            const k = normalize(d.name);
            const c = counts.get(k) || 0;
            d.ladderShare = (c / totalBuckets) * 100;
          }
          if (_tournamentStats) {
            for (const k of Object.keys(_tournamentStats)) {
              const c = counts.get(k) || 0;
              _tournamentStats[k].broughtShare = (c / totalBuckets) * 100;
            }
          }
          console.info(`[MetaCall] date filter — recomputed ladder + brought from ${totalBuckets} dated buckets (cutoff ${cutoff})`);
        }
      } else if (_origLadderShareByDeck) {
        // Cutoff cleared — restore original values.
        for (const d of _shareList) {
          const orig = _origLadderShareByDeck.get(normalize(d.name));
          if (typeof orig === 'number') d.ladderShare = orig;
        }
        if (_origBroughtShareByDeck && _tournamentStats) {
          for (const [k, v] of _origBroughtShareByDeck) {
            if (_tournamentStats[k]) _tournamentStats[k].broughtShare = v;
          }
        }
        _origLadderShareByDeck = null;
        _origBroughtShareByDeck = null;
        console.info('[MetaCall] date filter cleared — restored original ladder + brought shares');
      }

      _runPredictor();
      try { await _decorateMetaCallEntries(); } catch (_e) { /* tolerate */ }
      try { renderAll(); } catch (_e) { /* tolerate */ }
      console.info(`[MetaCall] date filter applied — cutoff ${cutoff || '(none)'}`);
    } catch (e) {
      console.warn('[MetaCall] date filter re-run failed (non-fatal):', e);
    }
  }
  if (typeof window !== 'undefined') {
    window.metaCallApplyDateFilter = _applyDateFilter;
  }

  // Toggle the click-to-expand reason row for a recommendation.
  // Triggered from the row's onclick — keeps the user on Meta Call so
  // they can read why a deck is being suggested without context-switch.
  // The dedicated "Open in Deck Analysis →" button inside the expanded
  // panel calls _jumpToDeckAnalysis when the user wants to dive in.
  function _toggleRecReason(reasonId, rowEl) {
    if (!reasonId) return;
    const reasonRow = document.getElementById(reasonId);
    if (!reasonRow) return;
    const isHidden = reasonRow.hasAttribute('hidden');
    if (isHidden) {
      reasonRow.removeAttribute('hidden');
      if (rowEl) rowEl.classList.add('mc-rec-row-expanded');
    } else {
      reasonRow.setAttribute('hidden', '');
      if (rowEl) rowEl.classList.remove('mc-rec-row-expanded');
    }
  }

  return {
    init,
    preload: loadData,
    // Diagnose-Marken im Vorhersage-Streifen ein- oder ausschalten.
    // Standard aus: Quelle und aktive Rotation sind Maschinenzustand
    // und gehoeren nicht in eine Ansicht, die ein Spieler vor dem
    // Turnier liest. Fuer eine Fehlermeldung dagegen sind sie genau
    // das, was man wissen will:
    //   MetaCall.setDiagnostics(true)
    setDiagnostics: (on) => {
        _showDiagnostics = !!on;
        try { renderAll(); } catch (_e) { /* noch nicht gerendert */ }
        return _showDiagnostics;
    },
    _renderPredictorStatusBanner,
    // Expose the current online deck list (sorted by share desc) so
    // Testing Groups can offer autocomplete that matches the names the
    // MetaCall calculation expects.
    getDeckNames: () => (_shareList || []).map(d => d.name),
    // Expose the predicted field — name + Final % (Estimate-blended)
    // or onlineShare fallback. Consumed by Deck Analysis (Global) to
    // show a "Matchups vs Meta Call" panel so a deck-builder can see
    // at a glance whether their build is favoured vs the predicted
    // tournament composition.
    getPredictedField: () => (_shareList || [])
      .filter(d => d && d.name && d.name !== '_junk')
      .map(d => ({
        name:         d.name,
        finalShare:   typeof d.finalShare === 'number' ? d.finalShare : (d.onlineShare || 0),
        onlineShare:  d.onlineShare || 0,
        ladderShare:  d.ladderShare || 0,
      }))
      .sort((a, b) => b.finalShare - a.finalShare),
    // Expose the matchup-matrix lookup so other tabs can compute
    // per-opponent WR using the same (Predictor-5.3-corrected) data
    // the recommendation engine uses. Falls back to 50/50 when no
    // matchup row exists.
    getBaseMatchup: (deckA, deckB) => getBaseMatchup(deckA, deckB),
    _onSetting,
    _setTournamentType,
    _setMetaCallMode,
    _onToggleSource,
    _onMyDeck,
    _onMyDeckInput,
    _onMyDeckCommit,
    _onPersonalShare,
    _onWrOverride,
    _onBrickFilter,
    _toggleOverrides,
    _toggleGroup,
    _toggleGroupField,
    _toggleDetail,
    _toggleAllDetails,
    _addCustomDeck,
    _removeCustomDeck,
    _onCustomDeckName,
    _onCustomDeckShare,
    _testingGroupLoad,
    _jumpToDeckAnalysis,
    _setMetaSource,
    _toggleRecReason,
    _saveScenario,
    _onScenarioSelect,
    _deleteScenario,
    _refreshScenario,
    exportFieldShareImage,
    exportFieldAndRecsShareImage,
    exportDay2ShareImage,
    // Diagnostic getters — used by the prerender step to verify that
    // _majorMatchupMap actually has data for the past format before
    // rendering the past PNG. Without them the prerender would have
    // to peek at module-local state via a hack; cleaner to expose a
    // tiny read-only API.
    _diag: {
      pastFormatKey: () => _pastMetaFormatKey || null,
      pastMatchupPairs: () => {
        const meta = (_pastMetaFormatKey || '').toUpperCase();
        if (!meta || !_majorMatchupMap || !_majorMatchupMap[meta]) return 0;
        let n = 0;
        for (const d of Object.values(_majorMatchupMap[meta])) {
          n += Object.keys(d).length;
        }
        return n;
      },
      // Predictor 6.0 — Tier-1 Convergence Detector inspector.
      // Returns per-deck eligibility + projection for the top-N decks
      // currently in _shareList, so a maintainer can verify in the
      // browser console which decks are being boosted (and by how much)
      // after a code change. Returns [] when _shareList isn't built yet.
      tier1Convergence: (limit = 15) => {
        if (!_shareList) return [];
        return _shareList
          .slice()
          .sort((a, b) => (b.predictedShare || 0) - (a.predictedShare || 0))
          .slice(0, limit)
          .map(d => ({
            name:           d.name,
            predictedShare: d.predictedShare,
            predictedShareRaw: d.predictedShareRaw,
            concentrationExp:  d.concentrationExp,
            rawLadderPct:   d._phaseBLadderRaw,
            majorMedian:    d._phaseBMajorMedian,
            eligible:       d._tier1Eligible || false,
            convProjection: d._tier1ConvProjection,
            diag:           d._tier1Diag,
          }));
      },
      // Predictor 6.0 inspector — raw underlying data sources. One
      // canonical sample (Dragapult) plus the family-level aggregates
      // is enough to debug both Tier-1 and Live-Share Floor decisions;
      // the per-deck `_tier1Diag` / `_liveShareFloor` fields on each
      // _shareList entry carry the rest.
      tier1DataSources: () => ({
        majorSharesByDeckCount: Object.keys(_majorSharesByDeck || {}).length,
        lastMajorByDeckCount:   Object.keys(_lastMajorByDeck || {}).length,
        lastMajorDate:          _lastMajorDate,
        sampleDragapultMajors:  _majorSharesByDeck && _majorSharesByDeck.dragapult,
        sampleDragapultLm:      _lastMajorByDeck && _lastMajorByDeck.dragapult,
        famLadderAgg:           _famLadderAgg,
        famLastMajorAgg:        _famLastMajorAgg,
        famMedianAgg:           _famMedianAgg,
      }),
      // Predictor 6.1 inspector — look up the Live-Share Floor's
      // last-run aggregate for the family that contains `deckName`.
      // Returns null when the predictor hasn't built _shareList yet
      // or when the deck's family didn't accumulate any last-major
      // brought-share. Use from the console:
      //   MetaCall._diag.liveFloorFamily('Mega Starmie')
      liveFloorFamily: (deckName) => {
        if (!deckName || !_lsFamsLastRun) return null;
        const fk = _familyKeyForDeck(deckName);
        return _lsFamsLastRun[fk] || null;
      },
    },
  };
})();
