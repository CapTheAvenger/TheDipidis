// ============================================================
// Meta Call – Tournament Prediction Feature
// ============================================================
window.MetaCall = (function () {
  'use strict';

  // ── Internal State ─────────────────────────────────────────
  let _matchupMap = null;  // normalize(deck) -> normalize(opp) -> {pWin, pTie, pLoss}
  let _shareList  = null;  // [{name, onlineShare}] sorted desc

  let _settings = {
    totalPlayers  : 1300,
    rounds        : 8,
    day2Points    : 16,
    junkPct       : 0,        // legacy: minimum-junk floor (UI removed; auto-computed now)
    junkWinRate   : 55,       // assumed WR vs small-share decks lumped into Junk (slight edge)
    myDeck        : '',
    excludeBricks : false,
  };

  let _personalShares   = {};  // deckName -> % estimate
  let _winRateOverrides = {};  // deckName -> 0-100 (manual user overrides only)
  let _journalRateKeys  = [];  // opponents with 3+ journal games (for badge display)
  let _journalStats     = {};  // opponent -> {wins, losses, ties, total, winRate}
  let _groupByMain      = false; // group field table by main pokemon
  let _customDecks      = [];    // [{name, share}] — user-added decks expected at the tourney
  let _currentScenarioName = ''; // name of the currently loaded saved scenario

  const TOP_N = 12;              // show top N decks; everything else rolls into Junk
  const MAX_CUSTOM = 10;         // max custom decks the user can add
  const SCENARIOS_STORAGE_KEY = 'metacall_scenarios_v1';
  // Brand shown in share-image footer. Update this one line when the
  // custom domain goes live (e.g. 'thedipidis.de' → 'pokemon-tcg-hub.de').
  const BRAND_FOOTER = 'thedipidis.de';

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
    return (name || '').toLowerCase().replace(/[\s\-'''\u2019\u2018\u201B`´]/g, '');
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

  // ── Data Loading ───────────────────────────────────────────
  async function loadData() {
    if (_matchupMap && _shareList) return true;
    try {
      const shareResp = await fetch('data/limitless_online_decks_comparison.csv?t=' + Date.now());
      if (!shareResp.ok) throw new Error('share CSV not found');
      const shareRows = parseCSV(await shareResp.text(), ';');

      _shareList = shareRows
        .filter(r => r.deck_name && (r.new_share || r.old_share))
        .map(r => ({
          name        : r.deck_name,
          onlineShare : parseEU(r.new_share || r.old_share || '0'),
        }))
        .filter(d => d.onlineShare > 0)
        .sort((a, b) => b.onlineShare - a.onlineShare);

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

  // ── Matchup Lookup with Journal Blending ───────────────────
  function getMatchup(myDeck, opponent) {
    if (opponent === '_junk') {
      const wr = _settings.junkWinRate / 100;
      return { pWin: wr, pTie: 0.02, pLoss: Math.max(0, 1 - wr - 0.02) };
    }
    // Manual override (user-entered) takes top priority
    const ov = _winRateOverrides[opponent];
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
    const js = _journalStats[opponent];
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
  function calcDay2(field) {
    const { rounds, day2Points, myDeck } = _settings;
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
          const { pWin, pTie, pLoss } = getMatchup(myDeck, deck.name);
          if (pts + 3 <= maxPts) newDp[pts + 3] += p * share * pWin;
          if (pts + 1 <= maxPts) newDp[pts + 1] += p * share * pTie;
          newDp[pts]            += p * share * pLoss;
        }
      }
      dp = newDp;
    }

    let day2Prob = 0;
    for (let pt = day2Points; pt <= maxPts; pt++) day2Prob += dp[pt];

    let expWin = 0, expTie = 0, expLoss = 0;
    for (const deck of field) {
      const share = deck.finalShare / 100;
      const { pWin, pTie, pLoss } = getMatchup(myDeck, deck.name);
      expWin  += rounds * share * pWin;
      expTie  += rounds * share * pTie;
      expLoss += rounds * share * pLoss;
    }
    return { day2Prob, dp, expWin, expTie, expLoss };
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
    const label       = isJunk ? t('mc.junkDecks') : esc(deck.name);
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
    return `<tr class="${rowClass}">
      <td><span class="mc-deck-name">${label}</span></td>
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
    <span class="mc-deck-name">${esc(group.main)}</span>
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
            <td style="padding-left:26px"><span class="mc-deck-name mc-variant-name">${esc(deck.name)}</span></td>
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
    <span class="mc-badge">${_settings.totalPlayers.toLocaleString()} ${t('mc.labelPlayers')}</span>
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
  ${renderScenariosBar()}
  ${renderSettingsPanel()}
  ${renderFieldPanel(field)}
  ${renderCustomDecksPanel()}
  ${renderMyDeckPanel()}
  ${renderResultsPanel(field)}
</div>`;
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
    const resultsPanel = container.querySelector('.metacall-results-grid');
    const resultsWrap  = resultsPanel ? resultsPanel.closest('.metacall-panel') : null;
    if (resultsWrap) {
      const tmp = document.createElement('div');
      tmp.innerHTML = renderResultsPanel(field);
      const newPanel = tmp.querySelector('.metacall-panel');
      if (newPanel) resultsWrap.innerHTML = newPanel.innerHTML;
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

  function _writeScenarios(obj) {
    try {
      localStorage.setItem(SCENARIOS_STORAGE_KEY, JSON.stringify(obj || {}));
    } catch (e) {
      console.error('[MetaCall] Failed to persist scenarios:', e);
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
    _writeScenarios(existing);
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

  return {
    init,
    preload: loadData,
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
    _saveScenario,
    _onScenarioSelect,
    _deleteScenario,
    exportFieldShareImage,
    exportDay2ShareImage,
  };
})();
