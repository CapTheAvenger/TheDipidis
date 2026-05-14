// ─────────────────────────────────────────────────────────────────────
// Anti-Tech Build-vs-Deck modal — picks a single target archetype and
// hands its name + aggression preset off to autoCompleteConsistency,
// which switches into a target-restricted TechAudit pass.
//
// Module-scoped state — never touched outside this file:
//   _source     — which deck-builder source the modal was opened for
//   _selection  — the currently picked target archetype name (or null)
//
// Public API (window.*):
//   openAntiTechModal(source)
//   closeAntiTechModal()
//   confirmAntiTechBuild()
// ─────────────────────────────────────────────────────────────────────
(function () {
    'use strict';

    let _source = null;
    let _selection = null;

    function _t(key, fallback) {
        return (typeof t === 'function' ? t(key) : null) || fallback;
    }

    function _devLog(...args) {
        if (typeof devLog === 'function') devLog(...args);
    }

    // Cap the modal field-share dropdown at the top 12 — same number
    // the predicted-field WR panel uses for "meaningful meta share".
    const QUICK_PICK_LIMIT = 12;

    function _getMetaCallField() {
        if (typeof window.MetaCall === 'undefined') return [];
        if (typeof window.MetaCall.getPredictedField !== 'function') return [];
        return window.MetaCall.getPredictedField() || [];
    }

    function _getAllDeckNames() {
        if (typeof window.MetaCall === 'undefined') return [];
        if (typeof window.MetaCall.getDeckNames !== 'function') return [];
        return window.MetaCall.getDeckNames() || [];
    }

    function _updateGenerateButtonState() {
        const btn = document.getElementById('antiTechGenerateBtn');
        if (!btn) return;
        btn.disabled = !_selection;
        if (_selection) {
            btn.textContent =
                (_t('antiTech.generateBtnWithTarget', 'Generate vs {target}'))
                    .replace('{target}', _selection);
        } else {
            btn.textContent = _t('antiTech.generateBtn', 'Generate');
        }
    }

    function _highlightQuickPick() {
        const wrap = document.getElementById('antiTechQuickPicks');
        if (!wrap) return;
        wrap.querySelectorAll('.anti-tech-quick-pick').forEach(el => {
            const isMatch = _selection &&
                String(el.dataset.target || '').toLowerCase() === _selection.toLowerCase();
            el.classList.toggle('is-active', isMatch);
        });
    }

    function _selectTarget(name) {
        _selection = (name && String(name).trim()) || null;
        const input = document.getElementById('antiTechCustomInput');
        if (input && _selection && input.value.trim() !== _selection) {
            input.value = _selection;
        }
        const suggestions = document.getElementById('antiTechSuggestions');
        if (suggestions) suggestions.innerHTML = '';
        _highlightQuickPick();
        _updateGenerateButtonState();
        _renderPreview();
    }

    function _populateQuickPicks() {
        const wrap = document.getElementById('antiTechQuickPicks');
        if (!wrap) return;
        const field = _getMetaCallField().slice(0, QUICK_PICK_LIMIT);
        if (field.length === 0) {
            wrap.innerHTML = `<div class="anti-tech-quick-picks-empty">${
                _t('antiTech.quickPicksEmpty', 'Meta Call field unavailable — open the Meta Call tab once to populate quick picks, then come back.')
            }</div>`;
            return;
        }
        wrap.innerHTML = field.map(d => {
            const name = String(d.name || '').trim();
            const sharePct = (d.finalShare || 0) * 100;
            return `<button type="button" class="anti-tech-quick-pick" data-target="${name.replace(/"/g, '&quot;')}">
                <span class="anti-tech-quick-pick-name">${name}</span>
                <span class="anti-tech-quick-pick-share">${sharePct.toFixed(1)}%</span>
            </button>`;
        }).join('');
        wrap.querySelectorAll('.anti-tech-quick-pick').forEach(btn => {
            btn.addEventListener('click', () => _selectTarget(btn.dataset.target));
        });
    }

    function _renderSuggestions(query) {
        const suggestionsEl = document.getElementById('antiTechSuggestions');
        if (!suggestionsEl) return;
        const q = String(query || '').trim().toLowerCase();
        if (!q) {
            suggestionsEl.innerHTML = '';
            return;
        }
        const names = _getAllDeckNames();
        const matches = names
            .filter(n => n && String(n).toLowerCase().includes(q))
            .slice(0, 10);
        if (matches.length === 0) {
            suggestionsEl.innerHTML = `<div class="anti-tech-suggestion-empty">${
                _t('antiTech.autocompleteEmpty', 'No archetype matches that query.')
            }</div>`;
            return;
        }
        suggestionsEl.innerHTML = matches.map(name => {
            const safe = String(name).replace(/"/g, '&quot;');
            return `<button type="button" class="anti-tech-suggestion" data-target="${safe}">${name}</button>`;
        }).join('');
        suggestionsEl.querySelectorAll('.anti-tech-suggestion').forEach(btn => {
            btn.addEventListener('click', () => _selectTarget(btn.dataset.target));
        });
    }

    function _bindAggressionInputs() {
        document.querySelectorAll('input[name="antiTechAggression"]').forEach(el => {
            if (el.__antiTechBound) return;
            el.__antiTechBound = true;
            el.addEventListener('change', () => _renderPreview());
        });
    }

    function _bindInputs() {
        _bindAggressionInputs();
        const input = document.getElementById('antiTechCustomInput');
        if (input && !input.__antiTechBound) {
            input.__antiTechBound = true;
            input.addEventListener('input', (e) => {
                _renderSuggestions(e.target.value);
                if (!e.target.value.trim()) {
                    _selection = null;
                    _highlightQuickPick();
                    _updateGenerateButtonState();
                    _renderPreview();
                }
            });
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const names = _getAllDeckNames();
                    const q = String(input.value || '').trim().toLowerCase();
                    const exact = names.find(n => String(n).toLowerCase() === q);
                    if (exact) _selectTarget(exact);
                    else if (q) {
                        // Allow free-text targets even if MetaCall hasn't
                        // indexed them — the algorithm just falls back to
                        // baseline tech audit when active_threats.json
                        // doesn't list the archetype.
                        _selectTarget(input.value.trim());
                    }
                }
            });
        }
    }

    function _readAggression() {
        const checked = document.querySelector('input[name="antiTechAggression"]:checked');
        return (checked && checked.value) || 'standard';
    }

    // ── Preview computation ─────────────────────────────────────────
    // Shows: base WR vs target (from matchup CSV) → tech-adjusted WR
    // (base + +3pts per matched threat category, cap +9). Mirrors the
    // heuristic from #103 plus the slot logic the generator uses, so
    // the user sees roughly what the build is about to deliver.

    const _BONUS_PER_CAT  = 3;
    const _BONUS_CAP      = 9;

    function _wrClass(wr) {
        if (!Number.isFinite(wr)) return 'wr-neutral';
        if (wr >= 60) return 'wr-strong-pos';
        if (wr >= 53) return 'wr-pos';
        if (wr >= 47) return 'wr-neutral';
        if (wr >= 40) return 'wr-neg';
        return 'wr-strong-neg';
    }

    function _stripEx(name) {
        return String(name || '').replace(/\s+ex\b/i, '').trim();
    }

    function _ensureActiveThreats() {
        if (typeof window === 'undefined') return Promise.resolve(null);
        if (window._activeThreatsCache !== undefined) return Promise.resolve(window._activeThreatsCache);
        return fetch('data/active_threats.json', { cache: 'no-cache' })
            .then(r => r.ok ? r.json() : null)
            .catch(() => null)
            .then(data => {
                window._activeThreatsCache = data;
                return data;
            });
    }

    function _baseWrFromCsv(userArchetype, targetArchetype) {
        const rows = window.currentMetaMatchupData;
        if (!Array.isArray(rows) || rows.length === 0) return null;
        const userLower = String(userArchetype || '').trim().toLowerCase();
        const userStripped = _stripEx(userArchetype).toLowerCase();
        const tgtLower = String(targetArchetype || '').trim().toLowerCase();
        const tgtStripped = _stripEx(targetArchetype).toLowerCase();
        for (const r of rows) {
            const d = String(r.deck_name || '').trim().toLowerCase();
            if (d !== userLower && d !== userStripped) continue;
            const opp = String(r.opponent || '').trim().toLowerCase();
            if (opp === tgtLower || opp === tgtStripped) {
                const v = parseFloat(String(r.win_rate || '0').replace(',', '.').replace('%', '').trim());
                if (Number.isFinite(v) && v > 0) return v;
            }
        }
        return null;
    }

    // Mirror the share floors the generator uses in app-deck-builder.
    function _shareFloorFor(aggression) {
        if (aggression === 'heavy') return 0.10;
        if (aggression === 'mild')  return 0.25;
        return 0.15;
    }
    function _archetypeShareFloorPct(aggression) {
        // Generator's TECH_AUDIT_MIN_ARCHETYPE_SHARE in app-deck-builder.
        return aggression === 'heavy' ? 5.0 : 15.0;
    }

    // For the picked target, return the set of categories that:
    //   1. The TARGET deck actually runs at the active share floor.
    //   2. The USER deck's available-cards pool has a qualifying
    //      counter for (matches archetype-share floor too).
    // That's the same intersection the generator computes — without
    // it, base-WR + bonus would over-report categories the algo
    // wouldn't actually fill.
    function _computeMatchedCategories(intel, targetArchetype, aggression) {
        if (!intel || !intel.threats || !intel.counters) return new Set();
        const tgtLower = String(targetArchetype || '').trim().toLowerCase();
        const tgtStripped = _stripEx(targetArchetype).toLowerCase();
        const shareFloor = _shareFloorFor(aggression);
        const archShareFloorPct = _archetypeShareFloorPct(aggression);

        // 1) Categories the target qualifies for.
        const targetCats = new Set();
        for (const [cat, info] of Object.entries(intel.threats)) {
            const cards = info && info.cards;
            if (!Array.isArray(cards)) continue;
            let max = 0;
            cards.forEach(c => {
                (c.archetypes || []).forEach(a => {
                    const an = String(a.archetype || '').toLowerCase();
                    if (an !== tgtLower && an !== tgtStripped) return;
                    const s = parseFloat(a.share_in_archetype || 0) || 0;
                    if (s > max) max = s;
                });
            });
            if (max >= shareFloor) targetCats.add(cat);
        }
        if (targetCats.size === 0) return targetCats;

        // 2) Of those, which categories does the user's available-cards
        //    pool have a qualifying counter for? We use the same
        //    available-cards list the generator consumes
        //    (window.currentCurrentMetaDeckCards) and the same
        //    archetype-share floor.
        const available = window.currentCurrentMetaDeckCards || [];
        if (!Array.isArray(available) || available.length === 0) {
            // Without a card pool we can't validate; assume target cats
            // are all reachable so the preview at least shows a bonus.
            // The actual generate may show fewer matches.
            return targetCats;
        }
        const availByName = new Map();
        available.forEach(card => {
            const nm = String(card.card_name || '').trim().toLowerCase();
            if (!nm) return;
            const sharePctRaw = (card.percentage_in_archetype || card.share_percent || '0').toString().replace(',', '.');
            const sharePct = parseFloat(sharePctRaw);
            const prev = availByName.get(nm) || 0;
            availByName.set(nm, Number.isFinite(sharePct) && sharePct > prev ? sharePct : prev);
        });

        const matched = new Set();
        targetCats.forEach(cat => {
            const counterCards = intel.counters[cat] || [];
            const hasCounter = counterCards.some(c => {
                const nm = String(c.card_name || '').trim().toLowerCase();
                if (!nm) return false;
                const userShare = availByName.get(nm);
                return userShare != null && userShare >= archShareFloorPct;
            });
            if (hasCounter) matched.add(cat);
        });
        return matched;
    }

    async function _renderPreview() {
        const wrap = document.getElementById('antiTechPreview');
        const body = document.getElementById('antiTechPreviewBody');
        if (!wrap || !body) return;
        if (!_selection) {
            wrap.classList.add('display-none');
            body.innerHTML = '';
            return;
        }

        // Wait until intel is loaded before rendering anything — the
        // empty flash is uglier than a 200 ms delay.
        const intel = await _ensureActiveThreats();
        // The user might have switched targets while we were awaiting;
        // bail if so to avoid clobbering a fresher render.
        if (!_selection) return;

        const userArchetype = (typeof window !== 'undefined' && window.currentMetaArchetype) || null;
        const aggression = _readAggression();

        if (!userArchetype) {
            body.innerHTML = `<div class="anti-tech-preview-empty">${
                _t('antiTech.previewNoArchetype', 'Select an archetype in the deck-builder first to see a WR preview.')
            }</div>`;
            wrap.classList.remove('display-none');
            return;
        }

        const baseWr = _baseWrFromCsv(userArchetype, _selection);
        const matchedCats = _computeMatchedCategories(intel, _selection, aggression);
        const bonus = Math.min(_BONUS_CAP, matchedCats.size * _BONUS_PER_CAT);

        if (baseWr == null) {
            body.innerHTML = `<div class="anti-tech-preview-empty">${
                (_t('antiTech.previewNoMatchup', 'No matchup data for {user} vs {target} — bonus only.')
                    .replace('{user}', userArchetype)
                    .replace('{target}', _selection))
            }</div>`;
            wrap.classList.remove('display-none');
            return;
        }

        const adjustedWr = Math.max(0, Math.min(100, baseWr + bonus));
        const delta = adjustedWr - baseWr;
        const baseCls = _wrClass(baseWr);
        const adjCls = _wrClass(adjustedWr);
        const deltaCls = bonus > 0 ? 'wr-pos' : 'wr-neutral';
        const fmt = (v) => v.toFixed(1).replace('.', ((typeof getLang === 'function' && getLang() === 'de') ? ',' : '.'));
        const arrow = bonus > 0 ? '↑' : '→';

        const headerTpl = _t('antiTech.previewHeader', 'vs {target}').replace('{target}', _selection);
        const catLine = matchedCats.size > 0
            ? (_t('antiTech.previewCatsHit', 'Counter coverage: {cats}')
                .replace('{cats}', Array.from(matchedCats).join(', ')))
            : _t('antiTech.previewNoCats', 'No qualifying counter categories at this aggression — bonus = 0.');

        body.innerHTML = `
            <div class="anti-tech-preview-header">${headerTpl}</div>
            <div class="anti-tech-preview-pills">
                <div class="anti-tech-preview-pill-block">
                    <span class="anti-tech-preview-pill-label">${_t('antiTech.previewBaseLabel', 'Base')}</span>
                    <span class="mc-vs-pill ${baseCls}">${fmt(baseWr)}%</span>
                </div>
                <span class="uv-arrow ${deltaCls}">${arrow}</span>
                <div class="anti-tech-preview-pill-block">
                    <span class="anti-tech-preview-pill-label">${_t('antiTech.previewAdjustedLabel', 'With techs')}</span>
                    <span class="mc-vs-pill ${adjCls}">${fmt(adjustedWr)}%</span>
                </div>
                <div class="anti-tech-preview-pill-block">
                    <span class="anti-tech-preview-pill-label">${_t('antiTech.previewDeltaLabel', 'Delta')}</span>
                    <span class="mc-vs-pill ${deltaCls}">${bonus > 0 ? '+' : ''}${fmt(delta)}pts</span>
                </div>
            </div>
            <div class="anti-tech-preview-cats">${catLine}</div>
            <div class="anti-tech-preview-note">${
                _t('antiTech.previewHeuristicNote', 'Heuristic estimate — same +3pts/cat, cap +9 model as the Deck-Analysis panel.')
            }</div>`;

        wrap.classList.remove('display-none');
    }

    function openAntiTechModal(source) {
        // All three deck-builder sources are supported. The TechAudit
        // pipeline that backs the build is source-agnostic — it only
        // reads `antiTechTarget` + `antiTechAggression` and feeds them
        // into autoCompleteConsistency, which already routes by source.
        if (source !== 'cityLeague' && source !== 'currentMeta' && source !== 'pastMeta') {
            if (typeof showToast === 'function') {
                showToast(_t('antiTech.unsupportedSource', 'Build vs is not supported on this view.'), 'info');
            }
            return;
        }
        _source = source;
        _selection = null;
        const modal = document.getElementById('antiTechModal');
        if (!modal) return;
        modal.classList.remove('display-none');
        const input = document.getElementById('antiTechCustomInput');
        if (input) input.value = '';
        const suggestions = document.getElementById('antiTechSuggestions');
        if (suggestions) suggestions.innerHTML = '';
        _populateQuickPicks();
        _bindInputs();
        _highlightQuickPick();
        _updateGenerateButtonState();
        // Default to Standard so first-time users get a sensible build.
        const standard = document.querySelector('input[name="antiTechAggression"][value="standard"]');
        if (standard) standard.checked = true;
        // Hide stale preview from previous session — _renderPreview
        // will re-show it once a target is picked.
        const previewWrap = document.getElementById('antiTechPreview');
        if (previewWrap) previewWrap.classList.add('display-none');
    }

    function closeAntiTechModal() {
        const modal = document.getElementById('antiTechModal');
        if (modal) modal.classList.add('display-none');
        const previewWrap = document.getElementById('antiTechPreview');
        if (previewWrap) previewWrap.classList.add('display-none');
        _source = null;
        _selection = null;
    }

    async function confirmAntiTechBuild() {
        if (!_selection) return;
        const target = _selection;
        const aggression = _readAggression();
        const source = _source || 'currentMeta';
        closeAntiTechModal();
        if (typeof autoCompleteConsistency !== 'function') {
            _devLog('[AntiTech] autoCompleteConsistency unavailable');
            return;
        }
        _devLog(`[AntiTech] Generating ${source} deck vs target="${target}" aggression=${aggression}`);
        try {
            await autoCompleteConsistency(source, 'min', {
                antiTechTarget: target,
                antiTechAggression: aggression,
            });
        } catch (e) {
            _devLog('[AntiTech] Generate failed:', e);
            if (typeof showToast === 'function') {
                showToast(_t('antiTech.errorToast', 'Anti-tech build failed — see console.'), 'error');
            }
        }
    }

    // Esc closes the modal — matches the rarity-switcher UX.
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const modal = document.getElementById('antiTechModal');
        if (modal && !modal.classList.contains('display-none')) closeAntiTechModal();
    });

    window.openAntiTechModal = openAntiTechModal;
    window.closeAntiTechModal = closeAntiTechModal;
    window.confirmAntiTechBuild = confirmAntiTechBuild;
})();
