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

  // Extract "main pokemon" = first segment before " / "
  function extractMainPokemon(name) {
    if (!name || name === '_junk') return name;
    return name.split(/\s*\/\s*/)[0].trim();
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
  function buildField() {
    if (!_shareList) return [];
    const junkPct   = Math.max(0, Math.min(90, _settings.junkPct || 0));
    const metaScale = (100 - junkPct) / 100;
    const totalOnline = _shareList.reduce((s, d) => s + d.onlineShare, 0) || 1;

    const field = _shareList.map(deck => {
      const normOnline = (deck.onlineShare / totalOnline) * 100;
      const personal   = _personalShares[deck.name];
      const finalNorm  = personal !== undefined ? (normOnline + personal) / 2 : normOnline;
      const finalShare = finalNorm * metaScale;
      return {
        name         : deck.name,
        onlineShare  : normOnline,
        personalShare: personal,
        finalShare,
        count        : Math.round(_settings.totalPlayers * finalShare / 100),
      };
    });

    if (junkPct > 0) {
      field.push({
        name        : '_junk',
        displayName : 'Junk Decks',
        onlineShare : junkPct,
        personalShare: undefined,
        finalShare  : junkPct,
        count       : Math.round(_settings.totalPlayers * junkPct / 100),
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
    Turniereinstellungen
    <span class="mc-badge">Anpassbar</span>
  </div>
  <div class="metacall-settings-grid">
    <div class="metacall-field-group">
      <label>Spieler</label>
      <input type="number" id="mc-players" min="8" max="9999" value="${s.totalPlayers}"
             oninput="MetaCall._onSetting('totalPlayers', +this.value)">
    </div>
    <div class="metacall-field-group">
      <label>Runden</label>
      <input type="number" id="mc-rounds" min="1" max="15" value="${s.rounds}"
             oninput="MetaCall._onSetting('rounds', +this.value)">
    </div>
    <div class="metacall-field-group">
      <label>Punkte für Day 2</label>
      <input type="number" id="mc-day2pts" min="1" max="45" value="${s.day2Points}"
             oninput="MetaCall._onSetting('day2Points', +this.value)">
    </div>
    <div class="metacall-field-group">
      <label>Junk-Win% (vs Junk)</label>
      <input type="number" id="mc-junk-wr" min="0" max="100" value="${s.junkWinRate}"
             oninput="MetaCall._onSetting('junkWinRate', +this.value)">
    </div>
  </div>
  <div class="metacall-field-group" style="max-width:420px">
    <label>Junk-Spieler <span id="mc-junk-display">${s.junkPct}%</span></label>
    <div class="mc-junk-row">
      <input type="range" id="mc-junk-slider" min="0" max="70" step="5" value="${s.junkPct}"
             oninput="MetaCall._onJunk(+this.value)">
      <span class="mc-junk-value" id="mc-junk-val">${s.junkPct}%</span>
    </div>
    <p style="font-size:0.76rem;color:#999;margin:4px 0 0">
      z.B. 30 % → 30% der Spieler spielen irgendetwas und haben keine Ahnung vom Meta.
    </p>
  </div>
</div>`;
  }

  function _renderFlatDeckRow(deck, maxShare) {
    const isJunk      = deck.name === '_junk';
    const label       = isJunk ? 'Junk Decks' : esc(deck.name);
    const lambda      = _settings.rounds * deck.finalShare / 100;
    const hasPersonal = deck.personalShare !== undefined;
    const barW        = Math.round((deck.finalShare / maxShare) * 100);
    const personalCell = isJunk
      ? '<span style="color:#aaa">—</span>'
      : `<input type="number" min="0" max="100" step="0.1" placeholder="—"
                value="${hasPersonal ? deck.personalShare : ''}"
                class="mc-personal-input" data-deck="${esc(deck.name)}"
                oninput="MetaCall._onPersonalShare('${esc(deck.name)}', this.value)"
                style="width:68px;padding:3px 5px;border:1px solid #d0dae5;border-radius:5px;font-size:0.84rem;text-align:center;">`;
    return `<tr class="${isJunk ? 'mc-row-junk' : ''}">
      <td><span class="mc-deck-name">${label}</span></td>
      <td><span class="mc-share-online">${deck.onlineShare.toFixed(2)}%</span></td>
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
    <span class="mc-group-count">${group.variants.length} Varianten</span>
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
    Feld-Zusammensetzung
    <span class="mc-badge">${_settings.totalPlayers.toLocaleString()} Spieler</span>
    <button class="mc-group-toggle-btn" onclick="MetaCall._toggleGroupField()">
      ${_groupByMain ? 'Flache Ansicht' : 'Nach Pokémon'}
    </button>
  </div>
  <p style="font-size:0.8rem;color:#888;margin:-8px 0 12px">
    „Meine Schätzung" optional — wird mit dem Online-Share gemittelt.
  </p>
  <div class="metacall-table-wrap">
    <table class="metacall-table">
      <thead>
        <tr>
          <th>Deck</th>
          <th>Online %</th>
          <th>Meine Schätzung</th>
          <th>Final %</th>
          <th>Spieler</th>
          <th>Ø Begegnungen (${_settings.rounds} R.)</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</div>`;
  }

  function renderMyDeckPanel() {
    const decks   = (_shareList || []).map(d => d.name);
    const options = decks.map(n =>
      `<option value="${esc(n)}" ${n === _settings.myDeck ? 'selected' : ''}>${esc(n)}</option>`
    ).join('');

    return `
<div class="metacall-panel">
  <div class="metacall-panel-title">Mein Deck</div>
  <div class="mc-deck-select-row">
    <select id="mc-my-deck" onchange="MetaCall._onMyDeck(this.value)">
      <option value="">— Deck wählen —</option>
      ${options}
    </select>
    <button class="mc-override-toggle" onclick="MetaCall._toggleOverrides()" id="mc-override-btn">
      Win-Rates anpassen ▼
    </button>
    <div class="mc-brick-filter-wrap">
      <label class="mc-brick-filter-label">🧱 Journal-Bricks</label>
      <select class="mc-brick-filter-select" onchange="MetaCall._onBrickFilter(this.value)">
        <option value="all" ${!_settings.excludeBricks ? 'selected' : ''}>Inkl. Bricks</option>
        <option value="exclude" ${_settings.excludeBricks ? 'selected' : ''}>Exkl. Bricks</option>
      </select>
    </div>
  </div>
  <div class="mc-override-panel" id="mc-override-panel">
    ${renderOverrideTable()}
  </div>
  <div class="mc-swiss-note">
    <strong>Swiss-Hinweis:</strong> Ab Runde 4–5 trifft Swiss-Pairing Spieler mit ähnlichem Ergebnis.
    Starke Spieler treffen dann tendenziell stärkere Gegner — das Modell geht von Random-Pairing aus
    und kann die Wahrscheinlichkeit daher leicht überschätzen.
  </div>
</div>`;
  }

  function renderOverrideTable() {
    if (!_settings.myDeck || !_shareList) {
      return '<p style="color:#aaa;font-size:0.85rem;padding:8px 0">Erst Deck auswählen.</p>';
    }
    const field = buildField().filter(d => d.name !== '_junk');
    const rows  = field.map(deck => {
      const m   = getMatchup(_settings.myDeck, deck.name);
      const wr  = Math.round(m.pWin * 100);
      const ind = wr >= 55 ? 'favorable' : wr <= 45 ? 'unfavorable' : 'even';
      const lbl = wr >= 55 ? 'Vorteil' : wr <= 45 ? 'Nachteil' : 'Even';
      const ov  = _winRateOverrides[deck.name];
      const js  = _journalStats[deck.name];
      const fromJournal = _journalRateKeys.includes(deck.name);
      const badge = fromJournal && js
        ? ` <span class="mc-journal-badge-inline" title="${js.total} pers. Spiele · Bayesian Blending">📓 ${js.total} Spiele</span>`
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
<p style="font-size:0.78rem;color:#888;margin:10px 0 8px">
  Manuelle WR überschreibt alles. Leer = Meta + Journal werden automatisch gemischt.
</p>
<table class="mc-override-table">
  <thead>
    <tr><th>Gegner</th><th>WR (gemischt)</th><th>Indikator</th><th>Manuelle WR</th></tr>
  </thead>
  <tbody>${rows}</tbody>
</table>`;
  }

  function renderResultsPanel(field) {
    if (!_settings.myDeck) {
      return `
<div class="metacall-panel">
  <div class="mc-no-deck-msg">
    Wähle dein Deck oben aus, um die Day-2-Chance zu berechnen.
  </div>
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
    <strong>Journal-Einfluss aktiv:</strong> ${journalOpps.length} Matchups · ${totalJGames} persönliche Spiele fließen ein
    <span class="mc-ji-hint"> (Meta = 30 Gewicht · Journal = Spielanzahl)</span>
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
      const name   = deck.name === '_junk' ? 'Junk' : deck.name;
      const p1     = poissonP(1, lambda) * 100;
      const p2     = poissonP(2, lambda) * 100;
      const js     = _journalStats[deck.name];
      const jTag   = js && js.total > 0
        ? `<span class="mc-enc-journal-tag" title="${js.total} pers. Spiele · blended">📓${js.total}</span>`
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

    return `
<div class="metacall-panel">
  <div class="metacall-panel-title">Ergebnis</div>
  ${journalBadge}
  <div class="metacall-results-grid">

    <div class="mc-day2-card">
      <div class="mc-day2-deck-name">${esc(_settings.myDeck)}</div>
      <div class="mc-day2-pct${cls}">${pct}%</div>
      <div class="mc-day2-label">Day-2-Chance</div>
      <div class="mc-day2-sub">${_settings.day2Points} Pkt. in ${_settings.rounds} R. · ${_settings.totalPlayers.toLocaleString()} Spieler</div>
      <div class="mc-day2-stats">
        <div class="mc-day2-stat">
          <div class="mc-day2-stat-val" style="color:#27ae60">${expWin.toFixed(1)}</div>
          <div class="mc-day2-stat-lbl">Ø Siege</div>
        </div>
        <div class="mc-day2-stat">
          <div class="mc-day2-stat-val" style="color:#f39c12">${expTie.toFixed(1)}</div>
          <div class="mc-day2-stat-lbl">Ø Ties</div>
        </div>
        <div class="mc-day2-stat">
          <div class="mc-day2-stat-val" style="color:#e74c3c">${expLoss.toFixed(1)}</div>
          <div class="mc-day2-stat-lbl">Ø Niederl.</div>
        </div>
      </div>
    </div>

    <div>
      <div class="mc-histogram-wrap">
        <div class="mc-histogram-title">Punkteverteilung nach ${_settings.rounds} Runden</div>
        <div class="mc-histogram" style="position:relative">
          ${histBars}
          <div class="mc-threshold-line" style="left:${thresholdPct}%">
            <div class="mc-threshold-tag">${_settings.day2Points} Pkt.</div>
          </div>
        </div>
        <div class="mc-histogram-axis">
          <span>0 Pkt.</span><span style="color:#27ae60">≥${_settings.day2Points} = Day 2</span><span>${maxPts} Pkt.</span>
        </div>
      </div>

      <div class="mc-section-sep">Erwartete Begegnungen (Poisson-Approximation)</div>
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
    <h2>Meta Call</h2>
    <p class="color-grey">Prognostiziere das Turnierfeld und berechne deine Day-2-Chancen.</p>
  </div>
  ${renderSettingsPanel()}
  ${renderFieldPanel(field)}
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
    _personalShares.__timer = setTimeout(renderAll, 600);
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
  <div class="metacall-header"><h2>Meta Call</h2></div>
  <div class="metacall-loading">Lade Meta-Daten…</div>
</div>`;

    const ok = await loadData();
    if (!ok) {
      container.innerHTML = `<div class="metacall-error">
        Meta-Daten konnten nicht geladen werden. Bitte Seite neu laden.
      </div>`;
      return;
    }
    renderAll();
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
  };
})();
