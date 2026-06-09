/*
 * Quick Reference Lists + 3-way Compare (Feature B)
 *
 * Renders two reference-list panels in the Current Meta tab — Latest
 * Major (one specific best-placed player's deck) and Latest Online
 * (typical aggregated build) — plus a custom modal that compares the
 * deck-builder's output against both lists side-by-side.
 *
 * Data flow:
 *   • Best Major:  MostConsistencyBuilder.listsForArchetype() →
 *                  filter to latest tournament_date → lowest place
 *                  → tiebreak by weighted win-rate. Same lookup the
 *                  Past Meta "Most Successful List" panel uses.
 *   • Best Online: online_tournament_dated_cards.csv → filter to
 *                  archetype's latest tournament_date → build a
 *                  60-ish-card list from Math.round(average_count)
 *                  per card. The online data is per-tournament
 *                  aggregated (no per-player decklists exist for
 *                  online events on limitless), so a synthesized
 *                  "typical build" is the most faithful one-list
 *                  representation we can produce.
 *
 * 3-way compare: collects card-name → {builder, major, online}
 * counts, sorts by max(count) desc, renders a single table where
 * each row is color-coded by how many sources carry the card:
 *   green = all 3, yellow = 2 of 3, red = only 1.
 *
 * No global state beyond two lazy caches (online CSV + last loaded
 * archetype's reference lists) so the panels stay cheap to re-render
 * when the user flips archetypes.
 */
(function (global) {
  'use strict';

  // ── Online data cache ─────────────────────────────────────────────
  // online_tournament_dated_cards.csv is ~3 MB; we parse it once
  // per session and keep it in memory. Refreshes on hard-reload.
  let _onlineRowsPromise = null;

  function _loadOnlineDatedCards() {
    if (_onlineRowsPromise) return _onlineRowsPromise;
    _onlineRowsPromise = new Promise((resolve) => {
      if (typeof Papa === 'undefined' || !Papa.parse) {
        console.warn('[QuickRef] PapaParse not loaded — online data unavailable');
        resolve([]);
        return;
      }
      Papa.parse('data/online_tournament_dated_cards.csv?t=' + Date.now(), {
        download:       true,
        header:         true,
        delimiter:      ';',
        skipEmptyLines: true,
        complete:       (res) => resolve(res.data || []),
        error:          (err) => {
          console.warn('[QuickRef] Failed to load online dated cards:', err);
          resolve([]);
        },
      });
    });
    return _onlineRowsPromise;
  }

  function _norm(s) {
    return String(s || '').trim().toLowerCase();
  }

  function _escHtml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function _cleanTournamentName(name) {
    return String(name || '').replace(/\s*[-|•–]\s*Limitless\s*$/i, '');
  }

  function _winRate(list) {
    const games = (list.wins || 0) + (list.losses || 0) + (list.ties || 0);
    if (games <= 0) return 0;
    return ((list.wins || 0) + 0.5 * (list.ties || 0)) / games;
  }

  // Consolidate same-name printings inside one list — mirrors the
  // de-dup we apply in MostConsistencyBuilder + Past Meta, so basic
  // energies split across set prints render as one entry instead of
  // one row per printing.
  function _consolidateCards(rawCards) {
    const byName = new Map();
    for (const c of (rawCards || [])) {
      const key = _norm(c.name);
      if (!key) continue;
      if (!byName.has(key)) {
        byName.set(key, {
          name: c.name,
          set_code: c.set_code || '',
          set_number: c.set_number || '',
          count: 0,
          type: c.type || '',
          is_ace_spec: !!c.is_ace_spec,
        });
      }
      const e = byName.get(key);
      e.count += (c.count || 0);
      if (!e.set_code && c.set_code) {
        e.set_code = c.set_code;
        e.set_number = c.set_number;
      }
      if (c.is_ace_spec) e.is_ace_spec = true;
      if (!e.type && c.type) e.type = c.type;
    }
    return Array.from(byName.values());
  }

  // ── Best Major: best-placed list from latest tournament ──────────
  //
  // Reuses MostConsistencyBuilder's per-decklist index. "Latest"
  // means the most recent tournament_date across all tournaments
  // that carry this archetype — current meta is forward-looking,
  // so the freshest event always wins.
  async function findBestMajorList(archetype) {
    const builder = global.MostConsistencyBuilder;
    if (!builder || typeof builder.loadData !== 'function') {
      throw new Error('builder-not-loaded');
    }
    await builder.loadData();
    let lists = (builder.listsForArchetype(archetype) || []).slice();
    if (lists.length === 0) return null;

    // Narrow to the latest tournament_date.
    const latestDate = lists.reduce((acc, l) => {
      const d = (l.tournament_date || '');
      return d > acc ? d : acc;
    }, '');
    if (latestDate) {
      lists = lists.filter(l => (l.tournament_date || '') === latestDate);
    }

    lists.sort((a, b) => {
      const pA = a.place || 99999, pB = b.place || 99999;
      if (pA !== pB) return pA - pB;
      return _winRate(b) - _winRate(a);
    });
    const best = lists[0];
    return { ...best, cards: _consolidateCards(best.cards) };
  }

  // ── Best Online: typical build from latest online tournament ─────
  //
  // The online CSV is per-tournament aggregated (no player-level
  // decklists exist on limitless for online events). We pick the
  // latest tournament_date for the archetype, then synthesize a
  // single representative deck by taking Math.round(average_count)
  // for every card with positive average. This is the same shape
  // the deck-builder produces, so the 3-way diff is apples-to-apples.
  async function findBestOnlineBuild(archetype) {
    const rows = await _loadOnlineDatedCards();
    if (!Array.isArray(rows) || rows.length === 0) return null;

    const archNorm = _norm(archetype);
    const archRows = rows.filter(r => _norm(r.archetype) === archNorm);
    if (archRows.length === 0) return null;

    const latestDate = archRows.reduce((acc, r) => {
      const d = String(r.tournament_date || '').trim();
      return d > acc ? d : acc;
    }, '');
    if (!latestDate) return null;

    const dayRows = archRows.filter(r => String(r.tournament_date || '').trim() === latestDate);
    if (dayRows.length === 0) return null;

    // The dated CSV uses one row per (tournament × archetype × card).
    // Since we already narrowed to a single tournament_date AND a
    // single archetype, every row here is one card variant. Build
    // the synthesized list straight off Math.round(average_count).
    const cards = [];
    let tournamentId = '';
    let tournamentName = '';
    let totalDecksInArchetype = 0;
    for (const r of dayRows) {
      const name = String(r.card_name || '').trim();
      if (!name) continue;
      const avg = parseFloat(String(r.average_count || '0').replace(',', '.'));
      if (!Number.isFinite(avg) || avg < 0.5) continue;  // <0.5 rounds to 0
      const count = Math.min(60, Math.max(1, Math.round(avg)));
      cards.push({
        name,
        set_code:   String(r.set_code || '').trim(),
        set_number: String(r.set_number || '').trim(),
        count,
        type:       String(r.type || '').trim(),
        is_ace_spec: String(r.is_ace_spec || '').toLowerCase() === 'yes',
      });
      if (!tournamentId)   tournamentId   = String(r.tournament_id || '').trim();
      if (!tournamentName) tournamentName = String(r.tournament_name || '').trim();
      const td = parseInt(r.total_decks_in_archetype || '0', 10) || 0;
      if (td > totalDecksInArchetype) totalDecksInArchetype = td;
    }
    if (cards.length === 0) return null;

    return {
      tournament_id:    tournamentId,
      tournament_name:  tournamentName,
      tournament_date:  latestDate,
      total_decks_in_archetype: totalDecksInArchetype,
      cards: _consolidateCards(cards),
    };
  }

  // ── UI: render the two reference panels ──────────────────────────

  function _typeRank(c) {
    const ty = _norm(c.type);
    if (ty.includes('pok')) return 0;
    if (ty.includes('supp') || ty.includes('item') || ty.includes('trainer') || ty.includes('stadium') || ty.includes('tool')) return 1;
    if (ty.includes('energy')) return 2;
    return 3;
  }

  function _renderCardGrid(cards) {
    const sorted = cards.slice().sort((a, b) => {
      const tr = _typeRank(a) - _typeRank(b);
      if (tr !== 0) return tr;
      return (b.count || 0) - (a.count || 0);
    });
    const cells = sorted.map(c => {
      const set = String(c.set_code || '').trim().toUpperCase();
      const num = String(c.set_number || '').trim();
      // Prefer the site's unified image resolver — it (1) checks the
      // canonical all_cards_database for the real CDN URL, (2) falls
      // back to PokemonProxies for M-series JP sets, (3) zero-pads
      // the number for the limitless CDN pattern, (4) handles JP
      // fallback URLs. Hardcoding `${set}_${num}_R_EN_LG.png` (no
      // padding, no rarity variants) misses ~40 % of cards across
      // a typical deck — that was the missing-images report from
      // 2026-06-09.
      let img = '';
      if (set && num) {
        if (typeof global.getUnifiedCardImage === 'function') {
          try { img = global.getUnifiedCardImage(set, num) || ''; } catch (_) { img = ''; }
        }
        if (!img) {
          const padded = /^\d+$/.test(num) ? num.padStart(3, '0') : num;
          img = `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/${set}/${set}_${padded}_R_EN_LG.png`;
        }
      }
      return `
        <div class="past-meta-best-card" title="${_escHtml(c.name)} (${c.count}x)">
          ${img ? `<img src="${img}" alt="${_escHtml(c.name)}" loading="lazy" onerror="this.style.display='none'">` : `<span style="display:flex;align-items:center;justify-content:center;height:100%;font-size:0.7rem;color:#6b7280;text-align:center;padding:4px;">${_escHtml(c.name)}</span>`}
          <div class="past-meta-best-card-count">${c.count}</div>
        </div>`;
    }).join('');
    return `<div class="past-meta-best-grid">${cells}</div>`;
  }

  function _tt(key, fallback) {
    return (typeof t === 'function') ? (t(key) || fallback) : fallback;
  }

  async function renderQuickRefPanels(archetype) {
    const section    = document.getElementById('currentMetaQuickRefSection');
    const majorBody  = document.getElementById('currentMetaQuickRefMajorBody');
    const onlineBody = document.getElementById('currentMetaQuickRefOnlineBody');
    if (!section || !majorBody || !onlineBody) return;

    if (!archetype) {
      section.classList.add('d-none');
      global.currentMetaBestMajor = null;
      global.currentMetaBestOnline = null;
      return;
    }

    section.classList.remove('d-none');
    const loading = `<div class="past-meta-loading-state">${_escHtml(_tt('cm.quickRefLoading', 'Loading…'))}</div>`;
    majorBody.innerHTML  = loading;
    onlineBody.innerHTML = loading;

    // Parallel — Major comes from per-decklist CSV (already in
    // memory via MostConsistencyBuilder), Online comes from a
    // separate CSV; no point sequencing them.
    const [majorRes, onlineRes] = await Promise.allSettled([
      findBestMajorList(archetype),
      findBestOnlineBuild(archetype),
    ]);

    if (majorRes.status === 'fulfilled' && majorRes.value) {
      global.currentMetaBestMajor = majorRes.value;
      majorBody.innerHTML = _renderRefHeader(majorRes.value, 'major') + _renderCardGrid(majorRes.value.cards);
    } else {
      global.currentMetaBestMajor = null;
      const msg = majorRes.status === 'rejected'
        ? _tt('cm.quickRefLoadError', 'Could not load reference data.')
        : _tt('cm.quickRefNoMajor', 'No per-decklist data for this archetype yet.');
      majorBody.innerHTML = `<p class="past-meta-section-hint past-meta-empty-state">${_escHtml(msg)}</p>`;
    }

    if (onlineRes.status === 'fulfilled' && onlineRes.value) {
      global.currentMetaBestOnline = onlineRes.value;
      onlineBody.innerHTML = _renderRefHeader(onlineRes.value, 'online') + _renderCardGrid(onlineRes.value.cards);
    } else {
      global.currentMetaBestOnline = null;
      const msg = onlineRes.status === 'rejected'
        ? _tt('cm.quickRefLoadError', 'Could not load reference data.')
        : _tt('cm.quickRefNoOnline', 'No online tournament card data for this archetype yet.');
      onlineBody.innerHTML = `<p class="past-meta-section-hint past-meta-empty-state">${_escHtml(msg)}</p>`;
    }
  }

  function _renderRefHeader(ref, kind) {
    const total = (ref.cards || []).reduce((s, c) => s + (c.count || 0), 0);
    const tournName = _cleanTournamentName(ref.tournament_name);
    const cardsLbl  = _tt('cm.quickRefCards', 'cards');
    if (kind === 'major') {
      const placeStr = (ref.place && ref.place < 9999) ? `#${ref.place}` : '—';
      // Suppress the record block when wins/losses/ties are all 0 —
      // that signals the per-decklist scraper couldn't extract the
      // W-L column (currently breaks on Special-Event standings
      // tables). 0-0-0 / 0,0% reads as "this player went 0-0-0" which
      // is misleading; better to show nothing than wrong data.
      const games = (ref.wins || 0) + (ref.losses || 0) + (ref.ties || 0);
      const recordBlock = games > 0
        ? `<span class="past-meta-best-record">${ref.wins || 0}-${ref.losses || 0}-${ref.ties || 0} · ${(_winRate(ref) * 100).toFixed(1).replace('.', ',')}%</span>`
        : '';
      return `
        <div class="past-meta-best-header" style="background: linear-gradient(135deg, #fff9f0 0%, #fff3e0 100%);">
          <div class="past-meta-best-headline">
            <span class="past-meta-best-place">${_escHtml(placeStr)}</span>
            <span class="past-meta-best-name">${_escHtml(ref.player_name || '')}</span>
            ${recordBlock}
          </div>
          <div class="past-meta-best-sub">${_escHtml(tournName)} · ${_escHtml(ref.tournament_date)} · ${total} ${_escHtml(cardsLbl)}</div>
        </div>`;
    }
    // Online — no player/placement, just tournament + aggregated total
    return `
      <div class="past-meta-best-header" style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);">
        <div class="past-meta-best-headline">
          <span class="past-meta-best-name">${_escHtml(tournName || 'Limitless Online')}</span>
        </div>
        <div class="past-meta-best-sub">${_escHtml(ref.tournament_date)} · ${ref.total_decks_in_archetype || 0} Decks · ${total} ${_escHtml(cardsLbl)}</div>
      </div>`;
  }

  // ── 3-way compare modal ──────────────────────────────────────────

  function _readBuilderDeck() {
    const map = global.currentMetaDeck || {};
    const out = [];
    for (const [key, count] of Object.entries(map)) {
      const m = String(key).match(/^(.+?)\s+\(([A-Z0-9]+)\s+(\d+)\)$/);
      if (m) {
        out.push({ name: m[1], set_code: m[2], set_number: m[3], count });
      } else {
        out.push({ name: key, set_code: '', set_number: '', count });
      }
    }
    return _consolidateCards(out);
  }

  function _agreeBucket(b, m, o) {
    const hits = (b > 0 ? 1 : 0) + (m > 0 ? 1 : 0) + (o > 0 ? 1 : 0);
    if (hits === 3) return 'all';
    if (hits === 2) return 'two';
    return 'one';
  }

  function openThreeWayCompare() {
    const archetype = String(global.currentMetaArchetype || '').trim();
    if (!archetype) {
      if (typeof showToast === 'function') {
        showToast(_tt('cm.threeWayNoArchetype', 'Pick an archetype first.'), 'warning');
      }
      return;
    }
    const major  = global.currentMetaBestMajor;
    const online = global.currentMetaBestOnline;
    const builderCards = _readBuilderDeck();
    if (builderCards.length === 0) {
      if (typeof showToast === 'function') {
        showToast(_tt('cm.threeWayNoBuilder', 'Deck builder is empty.'), 'warning');
      }
      return;
    }

    // Merge into a single per-card record { name, builder, major, online }
    const byName = new Map();
    const pushCards = (cards, field) => {
      if (!cards) return;
      for (const c of cards) {
        const key = _norm(c.name);
        if (!key) continue;
        if (!byName.has(key)) {
          byName.set(key, { name: c.name, builder: 0, major: 0, online: 0 });
        }
        byName.get(key)[field] += (c.count || 0);
      }
    };
    pushCards(builderCards, 'builder');
    pushCards(major && major.cards, 'major');
    pushCards(online && online.cards, 'online');

    const rows = Array.from(byName.values()).sort((a, b) => {
      const maxA = Math.max(a.builder, a.major, a.online);
      const maxB = Math.max(b.builder, b.major, b.online);
      if (maxB !== maxA) return maxB - maxA;
      return a.name.localeCompare(b.name);
    });

    const tallies = { all: 0, two: 0, one: 0 };
    const trs = rows.map(r => {
      const bucket = _agreeBucket(r.builder, r.major, r.online);
      tallies[bucket]++;
      const cell = (n) => `<td class="${n > 0 ? '' : 'three-way-cell-zero'}">${n > 0 ? n : '–'}</td>`;
      return `<tr class="three-way-row-${bucket}">
        <td class="three-way-card-col">${_escHtml(r.name)}</td>
        ${cell(r.builder)}${cell(r.major)}${cell(r.online)}
      </tr>`;
    }).join('');

    const builderTotal = builderCards.reduce((s, c) => s + (c.count || 0), 0);
    const majorTotal   = major  ? major.cards.reduce((s, c) => s + (c.count || 0), 0)  : 0;
    const onlineTotal  = online ? online.cards.reduce((s, c) => s + (c.count || 0), 0) : 0;

    const html = `
      <div class="three-way-compare-summary">
        <span class="three-way-chip-all">●  ${tallies.all} ${_escHtml(_tt('cm.threeWayAgreeAll', 'all 3 agree'))}</span>
        <span class="three-way-chip-two">●  ${tallies.two} ${_escHtml(_tt('cm.threeWayAgree2', '2 of 3'))}</span>
        <span class="three-way-chip-one">●  ${tallies.one} ${_escHtml(_tt('cm.threeWayOnlyOne', 'only 1'))}</span>
      </div>
      <table class="three-way-compare-table">
        <thead>
          <tr>
            <th class="three-way-card-col">${_escHtml(_tt('cm.threeWayCardCol', 'Card'))}</th>
            <th>${_escHtml(_tt('cm.threeWayColBuilder', 'Your Builder'))}<br><small style="font-weight:500;color:#6b7280;">${builderTotal}</small></th>
            <th>${_escHtml(_tt('cm.threeWayColMajor', 'Latest Major'))}<br><small style="font-weight:500;color:#6b7280;">${majorTotal || '—'}</small></th>
            <th>${_escHtml(_tt('cm.threeWayColOnline', 'Latest Online'))}<br><small style="font-weight:500;color:#6b7280;">${onlineTotal || '—'}</small></th>
          </tr>
        </thead>
        <tbody>${trs}</tbody>
      </table>`;

    const body = document.getElementById('threeWayCompareBody');
    const modal = document.getElementById('threeWayCompareModal');
    if (body) body.innerHTML = html;
    if (modal) {
      modal.classList.remove('d-none');
      modal.style.display = 'flex';
    }
  }

  function closeThreeWayCompare() {
    const modal = document.getElementById('threeWayCompareModal');
    if (modal) {
      modal.classList.add('d-none');
      modal.style.display = 'none';
    }
  }

  // ── Exports ──────────────────────────────────────────────────────
  global.renderCurrentMetaQuickRef = renderQuickRefPanels;
  global.openThreeWayCompare       = openThreeWayCompare;
  global.closeThreeWayCompare      = closeThreeWayCompare;
  // Exposed for debugging / unit tests:
  global._currentMetaQuickRefInternals = {
    findBestMajorList,
    findBestOnlineBuild,
  };
})(typeof window !== 'undefined' ? window : globalThis);
