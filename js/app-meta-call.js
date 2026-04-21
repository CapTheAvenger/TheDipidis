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
    junkPct       : 0,
    junkWinRate   : 80,
    myDeck        : '',
    excludeBricks : false,
  };

  let _personalShares   = {};  // deckName -> % estimate
  let _winRateOverrides = {};  // deckName -> 0-100 (manual user overrides only)
  let _journalRateKeys  = [];  // opponents with 3+ journal games (for badge display)
  let _journalStats     = {};  // opponent -> {wins, losses, ties, total, winRate}
  let _groupByMain      = false; // group field table by main pokemon
  let _customDecks      = [];    // [{name, share}] — user-added decks expected at the tourney

  const TOP_N = 12;              // show top N decks; everything else rolls into Junk
  const MAX_CUSTOM = 3;          // max custom decks the user can add

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
    <div class="metacall-field-group">
      <label>${t('mc.labelJunkWinRate')}</label>
      <input type="number" id="mc-junk-wr" min="0" max="100" value="${s.junkWinRate}"
             oninput="MetaCall._onSetting('junkWinRate', +this.value)">
    </div>
  </div>
  <div class="metacall-field-group" style="max-width:420px">
    <label>${t('mc.labelJunkPlayers')} <span id="mc-junk-display">${s.junkPct}%</span></label>
    <div class="mc-junk-row">
      <input type="range" id="mc-junk-slider" min="0" max="70" step="5" value="${s.junkPct}"
             oninput="MetaCall._onJunk(+this.value)">
      <span class="mc-junk-value" id="mc-junk-val">${s.junkPct}%</span>
    </div>
    <p style="font-size:0.76rem;color:#999;margin:4px 0 0">
      ${t('mc.junkExplanation')}
    </p>
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
                oninput="MetaCall._onPersonalShare('${esc(deck.name)}', this.value)"
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
                            oninput="MetaCall._onPersonalShare('${esc(deck.name)}', this.value)"
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
                 oninput="MetaCall._onWrOverride('${esc(deck.name)}', this.value)">
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
  <div class="metacall-panel-title">${t('mc.panelResult')}</div>
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

  // ── Event Handlers ─────────────────────────────────────────
  function _onSetting(key, val) {
    if (isNaN(val) || val <= 0) return;
    _settings[key] = val;
    refreshResults();
  }

  function _onJunk(val) {
    _settings.junkPct = val;
    const v = document.getElementById('mc-junk-val');
    const d = document.getElementById('mc-junk-display');
    if (v) v.textContent = val + '%';
    if (d) d.textContent = val + '%';
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
    renderAll();
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
    clearTimeout(_winRateOverrides.__timer);
    _winRateOverrides.__timer = setTimeout(renderAll, 600);
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
    _onJunk,
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
  };
})();
