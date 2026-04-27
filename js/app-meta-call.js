// ============================================================
// Meta Call – Tournament Prediction Feature
// ============================================================
window.MetaCall = (function () {
  'use strict';

  // ── Internal State ─────────────────────────────────────────
  let _matchupMap = null;  // normalize(deck) -> normalize(opp) -> {pWin, pTie, pLoss}
  let _shareList  = null;  // [{name, onlineShare}] sorted desc — onlineShare is the
                            // PREDICTED share once Predictor 2.0 has run; the raw ladder
                            // share is kept on each entry as `ladderShare` for the badge.
  let _trendMap   = null;  // normalize(deck) -> share_change (%-points week-over-week)
  let _tournamentStats = null; // normalize(deck) -> { broughtShare, top8Conv, top16Conv, ... }
  let _predictorMode  = 'A'; // 'A' = online-only fallback, 'B' = labs-major data available
  let _labsMajorRows  = 0;   // count of labs CSV rows that informed the mode decision
  let _labsRowsByDeck = {};  // labs share data — kept after loadData so re-runs work

  let _settings = {
    totalPlayers  : 1300,
    rounds        : 8,
    day2Points    : 16,
    junkPct       : 0,        // legacy: minimum-junk floor (UI removed; auto-computed now)
    junkWinRate   : 55,       // assumed WR vs small-share decks lumped into Junk (slight edge)
    myDeck        : '',
    excludeBricks : false,
  };

  let _personalShares   = {};  // deckName -> % estimate (manual "MY ESTIMATE" column)
  let _tgFieldShares    = {};  // deckName (canonical) -> TG-reported share % — folds INTO the predictor's ONLINE % column, NOT into _personalShares
  let _winRateOverrides = {};  // deckName -> 0-100 (manual user overrides only)
  let _journalRateKeys  = [];  // opponents with 3+ journal games (for badge display)
  let _journalStats     = {};  // opponent -> {wins, losses, ties, total, winRate}
  let _groupByMain      = false; // group field table by main pokemon
  let _customDecks      = [];    // [{name, share}] — user-added decks expected at the tourney
  let _currentScenarioName = ''; // name of the currently loaded saved scenario

  const TOP_N = 12;              // show top N decks; everything else rolls into Junk
  const MAX_CUSTOM = 10;         // max custom decks the user can add
  const SCENARIOS_STORAGE_KEY = 'metacall_scenarios_v1';
  // Brand shown in share-image footer.
  const BRAND_FOOTER = 'thedipidis.app';

  // ── CSV Helper ─────────────────────────────────────────────
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

  function parseEU(str) {
    return parseFloat((str || '0').replace(',', '.')) || 0;
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

  // ── Predictor 2.0 — runnable on demand ────────────────────
  // Extracted so a Testing Group import can update _tgFieldShares and
  // re-run the prediction without a full data reload. Uses module
  // state: _shareList (with raw .ladderShare), _tournamentStats,
  // _labsRowsByDeck, _tgFieldShares, _predictorMode.
  function _runPredictor() {
    if (!_shareList) return;

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

    _shareList.forEach(d => {
      const k = normalize(d.name);
      const ladderPct  = (d.ladderShare / totalLadder) * 100;
      const stats      = _tournamentStats ? _tournamentStats[k] : null;
      const broughtPct = stats ? stats.broughtShare : 0;
      const top8Conv   = stats ? stats.top8Conv : 0;
      const convFactor = meanConv > 0
        ? Math.max(0.5, Math.min(2.0, top8Conv / meanConv))
        : 1.0;
      const top8Boost  = broughtPct * convFactor;
      const trendPct   = d.trend || 0;

      // TG share for this deck (canonical lookup, normalised %).
      const rawTgShare = _findByNormalized(_tgFieldShares, d.name) || 0;
      const tgPct      = tgLoaded ? (rawTgShare / tgTotal) * 100 : 0;

      let predicted;
      if (_predictorMode === 'B') {
        const labsRow = _labsRowsByDeck[k];
        const labsPct = labsRow ? (labsRow.share / labsTotalShare) * 100 : 0;
        predicted = 0.50 * labsPct
                  + 0.30 * broughtPct
                  + 0.20 * ladderPct;
      } else if (tgLoaded) {
        // Mode A + Testing Group: TG quantities reflect the user's
        // expert prep insight from their group, so weight it heavily.
        // Other signals downscaled proportionally — sum stays 1.0.
        //   0.40 TG | 0.20 ladder | 0.20 brought | 0.10 top8 | 0.10 trend
        predicted = 0.40 * tgPct
                  + 0.20 * ladderPct
                  + 0.20 * broughtPct
                  + 0.10 * top8Boost
                  + 0.10 * trendPct;
      } else {
        // Mode A baseline (no TG data).
        //   0.25 ladder | 0.55 brought | 0.10 top8 | 0.10 trend
        predicted = 0.25 * ladderPct
                  + 0.55 * broughtPct
                  + 0.10 * top8Boost
                  + 0.10 * trendPct;
      }
      d.predictedShareRaw = Math.max(0, predicted);
    });

    // Concentration boost (^1.50) — mimics the major-tournament
    // bandwagon ratio of ~1.875× on top picks.
    const CONCENTRATION_EXP = 1.50;
    _shareList.forEach(d => {
      d.predictedShareRaw = Math.pow(d.predictedShareRaw, CONCENTRATION_EXP);
    });

    // Renormalise predicted shares to sum 100% so the field-composition
    // budget logic works unchanged.
    const predictedSum = _shareList.reduce((s, d) => s + (d.predictedShareRaw || 0), 0) || 1;
    _shareList.forEach(d => {
      d.predictedShare = (d.predictedShareRaw / predictedSum) * 100;
      d.onlineShare    = d.predictedShare; // legacy field name used by buildField()
    });
    _shareList.sort((a, b) => b.predictedShare - a.predictedShare);
  }

  // ── Data Loading ───────────────────────────────────────────
  async function loadData() {
    if (_matchupMap && _shareList) return true;
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
        .filter(r => r.deck_name && (r.new_share || r.old_share))
        .map(r => ({
          name        : r.deck_name,
          onlineShare : parseEU(r.new_share || r.old_share || '0'),
          ladderShare : parseEU(r.new_share || r.old_share || '0'),
          trend       : parseEU(r.share_change || '0'),
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

      // Labs major-tournament data (Stage-1 scraper output). Optional —
      // presence flips Predictor 2.0 from Mode A to Mode B.
      _labsMajorRows = 0;
      let labsRowsByDeck = {};
      try {
        const labsResp = await fetch('data/labs_tournament_decks.csv?t=' + Date.now());
        if (labsResp.ok) {
          const labsRows = parseCSV(await labsResp.text(), ';');
          // Aggregate share_pct per deck across the full labs CSV (could
          // refine later to filter by recent tournaments only).
          labsRows.forEach(r => {
            if (!r.deck_name) return;
            const k = normalize(r.deck_name);
            const share = parseEU(r.share_pct || '0');
            if (!labsRowsByDeck[k]) labsRowsByDeck[k] = { name: r.deck_name, share: 0, n: 0 };
            labsRowsByDeck[k].share += share;
            labsRowsByDeck[k].n += 1;
          });
          _labsMajorRows = labsRows.length;
        }
      } catch (_e) { /* optional source */ }

      _predictorMode = _labsMajorRows > 0 ? 'B' : 'A';

      // ── Predictor 2.0 — compute predicted share per deck ──
      // Mode A (online-only):
      //   predicted = 0.40 × ladder
      //             + 0.30 × online_tournament_brought
      //             + 0.20 × top8_conv_boost
      //             + 0.10 × trend
      // Mode B (with labs majors):
      //   predicted = 0.50 × labs_recent_share
      //             + 0.30 × online_tournament_brought
      //             + 0.20 × ladder
      //   (labs CSV has no placement column → folding the user-spec'd
      //    "20% labs top8 + 20% online top8" into the 30% online_top8
      //    + 20% ladder weights since we can't derive labs-top8 here.)
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
      // Cache labs data on the module so _runPredictor() can re-run later
      // (e.g. after a Testing Group load) without hitting Firestore again.
      _labsRowsByDeck = labsRowsByDeck;

      _runPredictor();

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
      return true;
    } catch (e) {
      console.error('[MetaCall] Data load error:', e);
      return false;
    }
  }

  // ── Matchup Lookup ─────────────────────────────────────────
  // Base matchup — pure online-tournament matchup data, no Testing
  // Group / Battle Journal blending. Used by the recommendations
  // engine (where personal overrides only apply to the USER'S deck,
  // not to candidate alternatives).
  function getBaseMatchup(deckA, deckB) {
    if (deckB === '_junk') {
      const wr = _settings.junkWinRate / 100;
      return { pWin: wr, pTie: 0.02, pLoss: Math.max(0, 1 - wr - 0.02) };
    }
    const a = normalize(deckA);
    const b = normalize(deckB);
    const hit = _matchupMap?.[a]?.[b];
    const rev = !hit ? _matchupMap?.[b]?.[a] : null;
    return hit ? hit
      : rev ? { pWin: rev.pLoss, pTie: rev.pTie, pLoss: rev.pWin }
      : { pWin: 0.50, pTie: 0.02, pLoss: 0.48 };
  }

  // Personal-blended matchup — folds in Testing Group win-rate overrides
  // and Battle Journal records on top of getBaseMatchup. Only meaningful
  // when `myDeck` is the user's actual deck of choice.
  function getMatchup(myDeck, opponent) {
    if (opponent === '_junk') {
      const wr = _settings.junkWinRate / 100;
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
    // Base meta rate
    const mk = normalize(myDeck);
    const ok = normalize(opponent);
    const hit = _matchupMap?.[mk]?.[ok];
    const rev = !hit ? _matchupMap?.[ok]?.[mk] : null;
    const metaBase = hit ? hit
      : rev ? { pWin: rev.pLoss, pTie: rev.pTie, pLoss: rev.pWin }
      : { pWin: 0.50, pTie: 0.02, pLoss: 0.48 };

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

  // Group field entries by main pokemon
  function buildGroups(field) {
    const groups = {}, order = [];
    field.forEach(deck => {
      const main = extractMainPokemon(deck.name);
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
  function calcRecommendations(field, topN = 5) {
    if (!_shareList || !field || field.length === 0) return [];
    const candidates = field
      .filter(d => d.name && d.name !== '_junk' && !d.isCustom)
      .map(d => d.name);
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

  // Poisson P(k; λ)
  function poissonP(k, lambda) {
    if (lambda <= 0) return k === 0 ? 1 : 0;
    let lp = -lambda + k * Math.log(lambda);
    for (let i = 1; i <= k; i++) lp -= Math.log(i);
    return Math.exp(lp);
  }

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

  function renderSettingsPanel() {
    const s = _settings;
    return `
<div class="metacall-panel">
  <div class="metacall-panel-title">
    ${t('mc.panelSettings')}
    <span class="mc-badge">${t('mc.badgeCustomizable')}</span>
  </div>
  <div class="metacall-settings-grid">
    <div class="metacall-field-group">
      <label>${t('mc.labelPlayers')}</label>
      <input type="number" id="mc-players" min="8" max="9999" value="${s.totalPlayers}"
             oninput="MetaCall._onSetting('totalPlayers', +this.value)">
    </div>
    <div class="metacall-field-group">
      <label>${t('mc.labelRounds')}</label>
      <input type="number" id="mc-rounds" min="1" max="15" value="${s.rounds}"
             oninput="MetaCall._onSetting('rounds', +this.value)">
    </div>
    <div class="metacall-field-group">
      <label>${t('mc.labelDay2Points')}</label>
      <input type="number" id="mc-day2pts" min="1" max="45" value="${s.day2Points}"
             oninput="MetaCall._onSetting('day2Points', +this.value)">
    </div>
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
    // Junk and custom decks don't have editable "personal estimate" in the field
    // (junk is computed, custom is set in the custom-decks panel)
    const personalCell = (isJunk || isCustom)
      ? '<span style="color:#aaa">—</span>'
      : `<input type="number" min="0" max="100" step="0.1" placeholder="—"
                value="${hasPersonal ? deck.personalShare : ''}"
                class="mc-personal-input" data-deck="${esc(deck.name)}"
                oninput="MetaCall._onPersonalShare('${escJs(deck.name)}', this.value)"
                style="width:68px;padding:3px 5px;border:1px solid #d0dae5;border-radius:5px;font-size:0.84rem;text-align:center;">`;
    const onlineDisplay = isCustom ? '—' : deck.onlineShare.toFixed(2) + '%';
    const badge = (isJunk || isCustom) ? '' : _renderDeckBadge(deck.name);
    return `<tr class="${rowClass}">
      <td><span class="mc-deck-name">${label}</span>${badge}</td>
      <td><span class="mc-share-online">${onlineDisplay}</span></td>
      <td>${personalCell}</td>
      <td><span class="mc-share-final${hasPersonal ? ' has-personal' : ''}">${deck.finalShare.toFixed(2)}%</span></td>
      <td><span class="mc-players-count">${deck.count.toLocaleString()}</span></td>
      <td>
        <div class="mc-encounters-bar">
          <div class="mc-bar-bg"><div class="mc-bar-fill" style="width:${barW}%"></div></div>
          <span class="mc-encounters-label">∅ ${lambda.toFixed(2)}</span>
        </div>
      </td>
    </tr>`;
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
        const header = `
<tr class="mc-group-header" onclick="MetaCall._toggleGroup('${gid}')">
  <td>
    <span class="mc-group-arrow" id="mc-gt-${gid}">▶</span>
    <span class="mc-deck-name">${_mcIconHtml(group.main)}${esc(group.main)}</span>
    <span class="mc-group-count">${group.variants.length} ${t('mc.variants')}</span>
  </td>
  <td><span class="mc-share-online">${group.totalOnline.toFixed(2)}%</span></td>
  <td><span style="color:#aaa">—</span></td>
  <td><span class="mc-share-final">${group.totalShare.toFixed(2)}%</span></td>
  <td><span class="mc-players-count">${group.totalCount.toLocaleString()}</span></td>
  <td>
    <div class="mc-encounters-bar">
      <div class="mc-bar-bg"><div class="mc-bar-fill" style="width:${barW}%"></div></div>
      <span class="mc-encounters-label">∅ ${lambda.toFixed(2)}</span>
    </div>
  </td>
</tr>`;
        const details = group.variants.map(deck => {
          const hasP   = deck.personalShare !== undefined;
          const dLam   = _settings.rounds * deck.finalShare / 100;
          const dBarW  = Math.round((deck.finalShare / maxShare) * 100);
          const pCell  = `<input type="number" min="0" max="100" step="0.1" placeholder="—"
                            value="${hasP ? deck.personalShare : ''}"
                            class="mc-personal-input" data-deck="${esc(deck.name)}"
                            oninput="MetaCall._onPersonalShare('${escJs(deck.name)}', this.value)"
                            style="width:68px;padding:3px 5px;border:1px solid #d0dae5;border-radius:5px;font-size:0.84rem;text-align:center;">`;
          return `<tr class="mc-group-detail mc-group-hidden" data-group="${gid}">
            <td style="padding-left:26px"><span class="mc-deck-name mc-variant-name">${_mcIconHtml(deck.name)}${esc(deck.name)}</span></td>
            <td><span class="mc-share-online">${deck.onlineShare.toFixed(2)}%</span></td>
            <td>${pCell}</td>
            <td><span class="mc-share-final${hasP ? ' has-personal' : ''}">${deck.finalShare.toFixed(2)}%</span></td>
            <td><span class="mc-players-count">${deck.count.toLocaleString()}</span></td>
            <td>
              <div class="mc-encounters-bar">
                <div class="mc-bar-bg"><div class="mc-bar-fill" style="width:${dBarW}%"></div></div>
                <span class="mc-encounters-label">∅ ${dLam.toFixed(2)}</span>
              </div>
            </td>
          </tr>`;
        }).join('');
        return header + details;
      }).join('');
    } else {
      const maxShare = Math.max(...field.map(d => d.finalShare), 0.1);
      rows = field.map(deck => _renderFlatDeckRow(deck, maxShare)).join('');
    }

    return `
<div class="metacall-panel">
  <div class="metacall-panel-title">
    ${t('mc.panelField')}
    <span class="mc-badge">Top ${TOP_N}</span>
    <span class="mc-badge" id="mc-players-badge">${_settings.totalPlayers.toLocaleString()} ${t('mc.labelPlayers')}</span>
    <button class="mc-group-toggle-btn" onclick="MetaCall._toggleGroupField()">
      ${_groupByMain ? t('mc.flatView') : t('mc.groupByPokemon')}
    </button>
    <button class="mc-share-btn" onclick="MetaCall.exportFieldShareImage()" title="${esc(t('mc.shareField'))}">
      📤 ${t('mc.share')}
    </button>
  </div>
  <p style="font-size:0.8rem;color:#888;margin:-8px 0 12px">
    ${t('mc.personalShareExpl')}
  </p>
  <div class="metacall-table-wrap">
    <table class="metacall-table">
      <thead>
        <tr>
          <th>${t('mc.headerDeck')}</th>
          <th>${t('mc.headerOnline')}</th>
          <th>${t('mc.headerPersonal')}</th>
          <th>${t('mc.headerFinal')}</th>
          <th>${t('mc.headerPlayers')}</th>
          <th>${t('mc.headerAvgEnc')} (${_settings.rounds} R.)</th>
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
    const options = decks.map(n =>
      `<option value="${esc(n)}" ${n === _settings.myDeck ? 'selected' : ''}>${esc(n)}</option>`
    ).join('');

    return `
<div class="metacall-panel">
  <div class="metacall-panel-title">${t('mc.panelMyDeck')}</div>
  <div class="mc-deck-select-row">
    <select id="mc-my-deck" onchange="MetaCall._onMyDeck(this.value)">
      <option value="">${t('mc.selectDeckPlaceholder')}</option>
      ${options}
    </select>
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

    const topDecks = [...field].sort((a, b) => b.finalShare - a.finalShare).slice(0, 12);
    const maxEnc   = Math.max(...topDecks.map(d => _settings.rounds * d.finalShare / 100), 0.1);
    const encRows  = topDecks.map(deck => {
      const lambda = _settings.rounds * deck.finalShare / 100;
      const m      = getMatchup(_settings.myDeck, deck.name);
      const wrPct  = Math.round(m.pWin * 100);
      const wrCls  = wrPct >= 55 ? 'favorable' : wrPct <= 45 ? 'unfavorable' : 'even';
      const barW   = Math.round((lambda / maxEnc) * 100);
      const name   = deck.name === '_junk' ? t('mc.junkDecks') : deck.name;
      const p1     = poissonP(1, lambda) * 100;
      const p2     = poissonP(2, lambda) * 100;
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
      <div class="mc-day2-label">${t('mc.day2Chance')}</div>
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

      <div class="mc-section-sep">${t('mc.encounters')}</div>
      <div class="mc-encounter-list">${encRows}</div>
    </div>
  </div>
</div>`;
  }

  // ── Full Render ────────────────────────────────────────────
  function renderAll() {
    const container = document.getElementById('profile-metacall');
    if (!container || !_shareList) return;
    const field = buildField();
    container.innerHTML = `
<div class="metacall-wrap">
  <div class="metacall-header">
    <h2>${t('mc.title')}</h2>
    <p class="color-grey">${t('mc.subtitle')}</p>
  </div>
  ${renderPredictorBanner()}
  ${renderScenariosBar()}
  ${renderSettingsPanel()}
  ${renderFieldPanel(field)}
  ${renderCustomDecksPanel()}
  ${renderMyDeckPanel()}
  ${renderResultsPanel(field)}
  ${renderRecommendationsPanel(field)}
</div>`;
  }

  // Recommendations panel — top N decks ranked by Day-2 probability
  // against the predicted field. Uses base matchups (no personal
  // overrides) since recommendations are about which deck to PICK,
  // not how a specific deck performs. The user's currently-selected
  // deck gets a small "you're playing this" badge so they see where
  // their pick ranks vs the alternatives.
  function renderRecommendationsPanel(field) {
    const recs = calcRecommendations(field, 5);
    if (!recs.length) return '';
    const myDeckNorm = normalize(_settings.myDeck || '');
    const rows = recs.map((r, i) => {
      const isMine = myDeckNorm && normalize(r.name) === myDeckNorm;
      const icon = (typeof window.ArchetypeIcons !== 'undefined')
        ? window.ArchetypeIcons.getIconHtml(r.name, { size: 'sm', layout: 'inline' })
        : '';
      const day2Pct = (r.day2Prob * 100).toFixed(1).replace('.', ',');
      const wrPct   = r.avgWR.toFixed(1).replace('.', ',');
      const safeNameJs = escJs(r.name);
      return `<tr class="mc-rec-row${isMine ? ' mc-rec-mine' : ''}"
            onclick="MetaCall._jumpToDeckAnalysis('${safeNameJs}')"
            title="${esc(t('mc.recJumpHint'))}"
            tabindex="0">
        <td class="mc-rec-rank">${i + 1}</td>
        <td class="mc-rec-name"><span class="mc-rec-name-inner">${icon}<span class="mc-rec-name-text">${esc(r.name)}</span>${isMine ? `<span class="mc-rec-mine-tag">${esc(t('mc.recYourDeck'))}</span>` : ''}</span></td>
        <td class="mc-rec-day2"><strong>${day2Pct}%</strong></td>
        <td class="mc-rec-wr">${wrPct}%</td>
        <td class="mc-rec-wins">∅ ${r.expWin.toFixed(1)}</td>
      </tr>`;
    }).join('');
    return `
<div class="metacall-panel mc-rec-panel">
  <div class="metacall-panel-title">
    🏆 ${t('mc.panelRecommendations')}
    <span class="mc-badge">${t('mc.recBadgeTopN').replace('{n}', recs.length)}</span>
  </div>
  <p class="mc-rec-hint">${t('mc.recHint')}</p>
  <table class="mc-rec-table">
    <thead><tr>
      <th>#</th>
      <th>${t('mc.recDeck')}</th>
      <th>${t('mc.recDay2')}</th>
      <th>${t('mc.recAvgWr')}</th>
      <th>${t('mc.recExpWins')}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
  }

  // Banner above the field panel that explains where the prediction
  // is sourced from. Mode A (online-only / fresh format) uses a warm
  // amber tone; Mode B (online + labs majors) uses a confident green.
  function renderPredictorBanner() {
    if (_predictorMode === 'B') {
      const tournNum = _labsMajorRows;
      return `<div class="mc-predictor-banner mc-predictor-banner-b">
        <span class="mc-predictor-banner-icon">📊</span>
        <span class="mc-predictor-banner-text">${t('mc.bannerModeB').replace('{n}', tournNum)}</span>
      </div>`;
    }
    return `<div class="mc-predictor-banner mc-predictor-banner-a">
      <span class="mc-predictor-banner-icon">⚡</span>
      <span class="mc-predictor-banner-text">${t('mc.bannerModeA')}</span>
    </div>`;
  }

  // Per-deck source breakdown rendered under the deck name in the
  // field panel. Numbers are pulled from _shareList + _tournamentStats
  // + trend so the user can see at a glance which signal pushed the
  // prediction up or down. Falls back to "no tournament data" when
  // the deck isn't in the online_tournament CSV.
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
    const trendPct  = entry.trend || 0;
    const trendArrow = trendPct > 0 ? '↑' : (trendPct < 0 ? '↓' : '→');
    const trendSign  = trendPct > 0 ? '+' : '';
    const fmt = (n, dp) => n.toFixed(dp).replace('.', ',');
    // Personal data chips — only render when the user has a deck
    // selected AND the data exists for this opponent. The values come
    // from Testing Group win-rate overrides (manual / synced) and the
    // Battle Journal record. Both are MY DECK's perspective vs the
    // opponent shown in this row.
    const tgVal = _findByNormalized(_winRateOverrides, deckName);
    const tgChip = (tgVal !== undefined && tgVal !== '' && !isNaN(parseFloat(tgVal)))
      ? `<span class="mc-badge-chip mc-badge-tg" title="${esc(t('mc.badgeTg'))}">🎯&nbsp;${fmt(parseFloat(tgVal), 0)}%</span>`
      : '';
    const jStats = _findByNormalized(_journalStats, deckName);
    const journalChip = (jStats && jStats.total > 0)
      ? `<span class="mc-badge-chip mc-badge-journal" title="${esc(t('mc.badgeJournal'))}">📓&nbsp;${jStats.wins}-${jStats.losses}-${jStats.ties} (${jStats.winRate}%)</span>`
      : '';

    // Testing Group share chip — reflects what flowed INTO the
    // predictor (raw TG quantity, normalised to %). Distinct from
    // the 🎯 chip below which is per-matchup win-rate.
    const rawTgShare = _findByNormalized(_tgFieldShares, deckName) || 0;
    const tgShareTotal = Object.values(_tgFieldShares).reduce((s, v) => s + v, 0);
    const tgShareChip = (rawTgShare > 0 && tgShareTotal > 0)
      ? `<span class="mc-badge-chip mc-badge-tg-share" title="${esc(t('mc.badgeTgShare'))}">🧪&nbsp;${fmt((rawTgShare / tgShareTotal) * 100, 1)}%</span>`
      : '';

    return `<span class="mc-deck-badge">
      <span class="mc-badge-chip" title="${esc(t('mc.badgeLadder'))}">🌐&nbsp;${fmt(ladderPct, 1)}%</span>
      <span class="mc-badge-chip" title="${esc(t('mc.badgeTournament'))}">🏆&nbsp;${fmt(broughtPct, 1)}%</span>
      <span class="mc-badge-chip" title="${esc(t('mc.badgeTop8Conv'))}">⬆️&nbsp;${fmt(convFactor, 1)}× T8</span>
      <span class="mc-badge-chip" title="${esc(t('mc.badgeTrend'))}">${trendArrow}&nbsp;${trendSign}${fmt(trendPct, 1)}%</span>
      ${tgShareChip}
      ${tgChip}
      ${journalChip}
    </span>`;
  }

  function refreshResults() {
    const container = document.getElementById('profile-metacall');
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
    const dataUrl = canvas.toDataURL('image/png');

    // Remove any existing preview first
    const old = document.getElementById('mc-share-preview-modal');
    if (old) old.remove();

    const modal = document.createElement('div');
    modal.id = 'mc-share-preview-modal';
    modal.className = 'mc-share-preview-modal';
    modal.innerHTML = `
      <div class="mc-share-preview-backdrop"></div>
      <div class="mc-share-preview-content" role="dialog" aria-modal="true">
        <div class="mc-share-preview-header">
          <h3>${esc(t('mc.sharePreviewTitle'))}</h3>
          <button type="button" class="mc-share-preview-close" aria-label="${esc(t('mc.close'))}">×</button>
        </div>
        <div class="mc-share-preview-body">
          <img src="${dataUrl}" alt="Meta Call share preview" class="mc-share-preview-img">
        </div>
        <div class="mc-share-preview-actions">
          <button type="button" class="mc-share-preview-btn-share">📤 ${esc(t('mc.share'))}</button>
          <button type="button" class="mc-share-preview-btn-download">💾 ${esc(t('mc.download'))}</button>
          <button type="button" class="mc-share-preview-btn-secondary">${esc(t('mc.close'))}</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const close = () => { modal.remove(); };
    modal.querySelector('.mc-share-preview-backdrop').addEventListener('click', close);
    modal.querySelector('.mc-share-preview-close').addEventListener('click', close);
    modal.querySelector('.mc-share-preview-btn-secondary').addEventListener('click', close);

    modal.querySelector('.mc-share-preview-btn-share').addEventListener('click', () => {
      canvas.toBlob(blob => {
        _shareOrDownloadBlob(blob, filename, title, text);
        close();
      }, 'image/png');
    });

    // Direct download button — always saves to disk, never triggers
    // the OS share sheet (which on Windows gives no "Save to file" option).
    modal.querySelector('.mc-share-preview-btn-download').addEventListener('click', () => {
      canvas.toBlob(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        close();
      }, 'image/png');
    });
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
    _paintHeader(ctx, W, 'META CALL',
      `${_settings.totalPlayers.toLocaleString()} ${t('mc.labelPlayers')} · ${_settings.rounds} ${t('mc.roundsAbbr')} · Day 2: ${_settings.day2Points} ${t('mc.ptsAbbr')}`);

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
    _paintHeader(ctx, W, 'META CALL',
      `${_settings.myDeck} · ${_settings.totalPlayers.toLocaleString()} ${t('mc.labelPlayers')} · ${_settings.rounds} ${t('mc.roundsAbbr')}`);

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
    ctx.fillText(t('mc.day2Chance').toUpperCase(), leftCx, cardY + 108);
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
    ctx.fillText(t('mc.encounters').toUpperCase(), 28, secY + 24);

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
    refreshResults();
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

  // Toggle flat ↔ grouped field view — preserve scroll so user sees the change
  function _toggleGroupField() {
    _groupByMain = !_groupByMain;
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
    let hint = '';
    if (names.length === 0) {
      const status = _scenarioStorageStatus();
      const msg = status.state === 'corrupted'
        ? t('mc.scenarioStorageCorrupted')
        : t('mc.scenarioStorageEmpty');
      hint = `<div class="mc-scenarios-hint">${esc(msg)} (${SCENARIOS_STORAGE_KEY}: ${status.bytes}B)</div>`;
    }

    return `
<div class="mc-scenarios-bar" id="mc-scenarios-bar">
  <label class="mc-scenarios-label">💾 ${t('mc.scenarios')}</label>
  <select class="mc-scenarios-select" onchange="MetaCall._onScenarioSelect(this.value)">
    ${options}
  </select>
  <button type="button" class="mc-scenarios-save-btn" onclick="MetaCall._saveScenario()">
    ${saveLabel}
  </button>
  ${hasCurrent
    ? `<button type="button" class="mc-scenarios-del-btn" onclick="MetaCall._deleteScenario()"
              title="${esc(t('mc.scenarioDelete'))}">🗑</button>`
    : ''}
  ${hint}
</div>`;
  }

  // ── Public Init ────────────────────────────────────────────
  async function init() {
    const container = document.getElementById('profile-metacall');
    if (!container) return;
    if (_shareList && _matchupMap) { renderAll(); return; }

    container.innerHTML = `
<div class="metacall-wrap">
  <div class="metacall-header"><h2>${t('mc.title')}</h2></div>
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
    if (typeof window.navigateToCurrentMetaWithDeck === 'function') {
      window.navigateToCurrentMetaWithDeck(deckName);
    } else if (typeof switchTabAndUpdateMenu === 'function') {
      // Fallback: just open the Current Meta tab without preselect.
      switchTabAndUpdateMenu('current-meta');
    }
  }

  return {
    init,
    preload: loadData,
    // Expose the current online deck list (sorted by share desc) so
    // Testing Groups can offer autocomplete that matches the names the
    // MetaCall calculation expects.
    getDeckNames: () => (_shareList || []).map(d => d.name),
    _onSetting,
    _onMyDeck,
    _onPersonalShare,
    _onWrOverride,
    _onBrickFilter,
    _toggleOverrides,
    _toggleGroup,
    _toggleGroupField,
    _addCustomDeck,
    _removeCustomDeck,
    _onCustomDeckName,
    _onCustomDeckShare,
    _testingGroupLoad,
    _jumpToDeckAnalysis,
    _saveScenario,
    _onScenarioSelect,
    _deleteScenario,
    exportFieldShareImage,
    exportDay2ShareImage,
  };
})();
