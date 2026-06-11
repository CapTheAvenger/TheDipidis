/*
 * Card Replacement Suggester (audit Sprint 3 — 2026-06-10)
 *
 * "I don't own Iron Hands ex / Cynthia / Lillie's Determination —
 * what does the field actually substitute it with?" — data-driven
 * answer from the per-decklist CSV instead of hand-crafted swap
 * tables that go stale with every rotation.
 *
 * Approach:
 *
 *   For a target card T inside an archetype A:
 *
 *     1. Pull every per-decklist row for archetype A from the
 *        MostConsistencyBuilder index (already loaded for the
 *        deck-builder path).
 *
 *     2. Split lists into "ran T" and "did not run T" buckets.
 *
 *     3. Count cards with the SAME type as T inside the "did not
 *        run T" bucket. The cards that show up most often there are
 *        what the field uses when T is absent.
 *
 *     4. Bonus signal: when a card appears far more often in the
 *        no-T bucket than in the with-T bucket, that's a strong
 *        "this is the replacement" indicator (delta-share rank).
 *
 * Output: top-5 candidates with the relative-frequency numbers so
 * the user can judge whether "the field does X 35% of the time vs
 * 8% with the original" is a meaningful swap signal.
 *
 * No live override of the deck — this is a *suggestion* surfaced
 * to the user, matching the same "user decides" philosophy as the
 * Phase 4.5 alternative-count diagnostic.
 */
(function (global) {
    'use strict';

    const TOP_N = 5;
    const MIN_NO_T_LISTS = 3;        // need this many no-T lists to trust delta
    const MIN_OCCURRENCE_SHARE = 0.10; // candidate must appear in ≥10 % of no-T lists

    function _norm(s) { return String(s || '').trim().toLowerCase(); }

    // Same-type matcher — keeps Pokemon-ex slot → Pokemon-ex
    // candidates, Supporter → Supporter, etc. Uses the canonical
    // category via window.getCardTypeCategory so the categories are
    // identical to what the deck-builder sort uses.
    function _sameCategory(typeA, typeB) {
        if (!typeA || !typeB) return false;
        if (typeof global.getCardTypeCategory === 'function') {
            return global.getCardTypeCategory(typeA) === global.getCardTypeCategory(typeB);
        }
        // Fallback: lowercase equality on the raw type string.
        return _norm(typeA) === _norm(typeB);
    }

    /**
     * @param {string} targetCardName    The card the user wants to substitute.
     * @param {string} archetype         Archetype label (matches MostConsistencyBuilder).
     * @returns {Promise<{
     *   target:       { name, type, setCode, setNumber },
     *   candidates:   Array<{ name, type, setCode, setNumber,
     *                         noT_lists, noT_share, withT_lists,
     *                         withT_share, delta }>,
     *   n_lists:      number,
     *   n_no_T_lists: number,
     *   warning:      string,
     * }>}
     */
    async function findSubstitutes(targetCardName, archetype) {
        const builder = global.MostConsistencyBuilder;
        if (!builder || typeof builder.loadData !== 'function') {
            return { target: null, candidates: [], n_lists: 0, n_no_T_lists: 0,
                     warning: 'Per-decklist data not loaded.' };
        }
        await builder.loadData();
        const lists = builder.listsForArchetype(archetype) || [];
        if (lists.length === 0) {
            return { target: null, candidates: [], n_lists: 0, n_no_T_lists: 0,
                     warning: 'No per-decklist data for archetype "' + archetype + '".' };
        }

        const tName = _norm(targetCardName);

        // Find target type from any list that ran the target — needed
        // for the "same category" filter on candidates.
        let targetType = '';
        let targetSetCode = '';
        let targetSetNumber = '';
        for (const l of lists) {
            for (const c of (l.cards || [])) {
                if (_norm(c.name) === tName) {
                    targetType = c.type || targetType;
                    targetSetCode = c.set_code || targetSetCode;
                    targetSetNumber = c.set_number || targetSetNumber;
                }
            }
            if (targetType && targetSetCode) break;
        }

        // Partition lists by whether they ran the target.
        const noT_lists = [];
        const withT_lists = [];
        for (const l of lists) {
            const ran = (l.cards || []).some(c => _norm(c.name) === tName);
            (ran ? withT_lists : noT_lists).push(l);
        }

        if (noT_lists.length < MIN_NO_T_LISTS) {
            return {
                target: { name: targetCardName, type: targetType, setCode: targetSetCode, setNumber: targetSetNumber },
                candidates: [],
                n_lists: lists.length,
                n_no_T_lists: noT_lists.length,
                warning: 'Only ' + noT_lists.length + ' list(s) in the archetype skip "' + targetCardName + '" — too few to learn what replaces it. Need at least ' + MIN_NO_T_LISTS + '.',
            };
        }

        // Count same-category cards per bucket. Dedup by lower-case
        // name within a list (so split-printing energies aren't counted
        // twice for the same list).
        const _countListWith = (cards, predicate) => {
            const seenInList = new Set();
            let any = false;
            for (const c of (cards || [])) {
                const key = _norm(c.name);
                if (seenInList.has(key)) continue;
                seenInList.add(key);
                if (predicate(c)) any = true;
            }
            return any;
        };

        // For each candidate name we find in no-T lists, how often it
        // appears in (a) no-T and (b) with-T lists.
        const cardMeta = new Map();   // key → { name, type, set_code, set_number }
        const tally    = new Map();   // key → { noT, withT }
        const _bump = (bucketKey, listSubset) => {
            for (const l of listSubset) {
                const seenInList = new Set();
                for (const c of (l.cards || [])) {
                    const key = _norm(c.name);
                    if (!key || key === tName) continue;
                    if (seenInList.has(key)) continue;
                    seenInList.add(key);
                    if (!_sameCategory(c.type, targetType)) continue;
                    if (!cardMeta.has(key)) {
                        cardMeta.set(key, {
                            name: c.name,
                            type: c.type || '',
                            set_code: c.set_code || '',
                            set_number: c.set_number || '',
                        });
                    } else {
                        // Upgrade meta when later list has better set info
                        const m = cardMeta.get(key);
                        if (!m.set_code && c.set_code) {
                            m.set_code = c.set_code;
                            m.set_number = c.set_number;
                        }
                    }
                    if (!tally.has(key)) tally.set(key, { noT: 0, withT: 0 });
                    tally.get(key)[bucketKey]++;
                }
            }
        };
        _bump('noT',   noT_lists);
        _bump('withT', withT_lists);

        const noT_n   = noT_lists.length;
        const withT_n = withT_lists.length;
        const candidates = [];
        for (const [key, counts] of tally) {
            const noTShare   = counts.noT   / noT_n;
            const withTShare = withT_n > 0 ? counts.withT / withT_n : 0;
            if (noTShare < MIN_OCCURRENCE_SHARE) continue;
            const meta = cardMeta.get(key);
            candidates.push({
                name:        meta.name,
                type:        meta.type,
                setCode:     meta.set_code,
                setNumber:   meta.set_number,
                noT_lists:   counts.noT,
                noT_share:   noTShare,
                withT_lists: counts.withT,
                withT_share: withTShare,
                delta:       noTShare - withTShare,
            });
        }

        // Rank: delta share desc (cards that show up more without T
        // than with T are the strongest replacement signal), then by
        // absolute no-T share desc, then by name for determinism.
        candidates.sort((a, b) => {
            if (b.delta !== a.delta) return b.delta - a.delta;
            if (b.noT_share !== a.noT_share) return b.noT_share - a.noT_share;
            return a.name.localeCompare(b.name);
        });

        return {
            target: { name: targetCardName, type: targetType, setCode: targetSetCode, setNumber: targetSetNumber },
            candidates: candidates.slice(0, TOP_N),
            n_lists: lists.length,
            n_no_T_lists: noT_n,
            warning: '',
        };
    }

    // ── UI: modal ─────────────────────────────────────────────────
    //
    // Lazily build a modal on first open. Anchored to the body so
    // any tab/scroll context can launch it. Closed via backdrop, X
    // button, or Escape.

    function _ensureModal() {
        let modal = document.getElementById('cardReplacementModal');
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = 'cardReplacementModal';
        modal.className = 'rarity-switcher-modal ui-modal-backdrop z-10000 d-none';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-label', 'Card Replacement Suggestions');
        modal.innerHTML = `
            <div class="card-replacement-dialog">
                <div class="card-replacement-header">
                    <h3 id="cardReplacementTitle">Card Replacement</h3>
                    <button class="card-replacement-close" aria-label="Close">×</button>
                </div>
                <div class="card-replacement-body" id="cardReplacementBody"></div>
            </div>
        `;
        modal.addEventListener('click', (e) => {
            if (e.target === modal) _close();
        });
        modal.querySelector('.card-replacement-close').addEventListener('click', _close);
        document.body.appendChild(modal);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modal.classList.contains('d-none')) _close();
        });
        return modal;
    }

    function _close() {
        const modal = document.getElementById('cardReplacementModal');
        if (!modal) return;
        modal.classList.add('d-none');
        modal.style.display = 'none';
    }

    function _esc(s) {
        return (typeof global.escapeHtml === 'function')
            ? global.escapeHtml(s)
            : String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function _imgFor(set, num) {
        if (!set || !num) return '';
        if (typeof global.getUnifiedCardImage === 'function') {
            try { return global.getUnifiedCardImage(set, num) || ''; } catch (_) { return ''; }
        }
        const padded = /^\d+$/.test(num) ? String(num).padStart(3, '0') : num;
        return `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/${set}/${set}_${padded}_R_EN_LG.png`;
    }

    function _t(key, fallback) {
        return (typeof global.t === 'function') ? (global.t(key) || fallback) : fallback;
    }

    /**
     * Opens the modal and runs the lookup for (cardName, archetype).
     */
    async function openCardReplacementModal(cardName, archetype) {
        const modal = _ensureModal();
        const body  = modal.querySelector('#cardReplacementBody');
        const title = modal.querySelector('#cardReplacementTitle');
        title.textContent = _t('replacement.title', 'Field substitutes for') + ' ' + cardName;
        body.innerHTML = `<div class="card-replacement-loading">${_esc(_t('replacement.loading', 'Looking at what the field plays without this card…'))}</div>`;
        modal.classList.remove('d-none');
        modal.style.display = 'flex';

        let result;
        try {
            result = await findSubstitutes(cardName, archetype);
        } catch (err) {
            console.warn('[CardReplacement] lookup failed:', err);
            body.innerHTML = `<p class="card-replacement-empty">${_esc(_t('replacement.error', 'Could not load per-decklist data.'))}</p>`;
            return;
        }

        if (result.warning && result.candidates.length === 0) {
            body.innerHTML = `<p class="card-replacement-empty">${_esc(result.warning)}</p>`;
            return;
        }
        if (result.candidates.length === 0) {
            body.innerHTML = `<p class="card-replacement-empty">${_esc(_t('replacement.none', 'No same-category substitutes found in the data.'))}</p>`;
            return;
        }

        // Intro line: sample sizes the algorithm is working from.
        const intro = _t('replacement.intro', 'From')
            + ' <strong>' + result.n_lists + '</strong> ' + _t('replacement.lists', 'lists')
            + ', <strong>' + result.n_no_T_lists + '</strong> '
            + _t('replacement.skipTarget', 'skip the target card. Same-category cards that show up in those lists, ranked by Δ vs lists that DO run the target:');

        const rows = result.candidates.map((c, i) => {
            const img = _imgFor((c.setCode || '').toUpperCase(), c.setNumber);
            const noTPct   = (c.noT_share   * 100).toFixed(0);
            const withTPct = (c.withT_share * 100).toFixed(0);
            const deltaPct = (c.delta * 100).toFixed(0);
            const deltaCls = c.delta > 0 ? 'card-replacement-delta--pos' : 'card-replacement-delta--zero';
            return `
                <div class="card-replacement-row" data-rank="${i + 1}">
                    <div class="card-replacement-rank">#${i + 1}</div>
                    <div class="card-replacement-thumb">
                        ${img ? `<img src="${img}" alt="${_esc(c.name)}" loading="lazy" onerror="this.style.display='none'">` : '<div class="card-replacement-thumb-fallback"></div>'}
                    </div>
                    <div class="card-replacement-meta">
                        <div class="card-replacement-name">${_esc(c.name)}</div>
                        <div class="card-replacement-detail">
                            <span class="card-replacement-stat" title="${_esc(_t('replacement.withoutTooltip', 'Share of lists that do not play the target'))}">
                                ${_esc(_t('replacement.without', 'without'))}: <strong>${noTPct}%</strong>
                                <span class="card-replacement-stat-count">(${c.noT_lists}/${result.n_no_T_lists})</span>
                            </span>
                            <span class="card-replacement-stat" title="${_esc(_t('replacement.withTooltip', 'Share of lists that play the target'))}">
                                ${_esc(_t('replacement.with', 'with'))}: ${withTPct}%
                            </span>
                            <span class="card-replacement-delta ${deltaCls}">Δ ${deltaPct > 0 ? '+' : ''}${deltaPct} pp</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        body.innerHTML = `
            <p class="card-replacement-intro">${intro}</p>
            <div class="card-replacement-list">${rows}</div>
            <p class="card-replacement-note">${_esc(_t('replacement.note', 'These are field-observed swaps from real decklists — no curated table. Cards that appear ONLY in lists without the target are the strongest replacement signal (high Δ).'))}</p>
        `;
    }

    // ── Public ────────────────────────────────────────────────────
    global.findCardSubstitutes        = findSubstitutes;
    global.openCardReplacementModal   = openCardReplacementModal;
})(typeof window !== 'undefined' ? window : globalThis);
