// ─────────────────────────────────────────────────────────────────────
// Anti-Tech "Build vs Specific Decks" modal — 2-step wizard.
//
// Step 1: pick one or more target decks to tech against.
// Step 2: pick which suggested counter cards to include in the build.
// Confirm: selected cards get written to techSlots[source] (force-pin
// list the consistency generator respects), then autoCompleteConsistency
// runs on the current source so the user lands on a regenerated deck
// containing exactly those techs.
//
// Public API (window.*):
//   openAntiTechModal(source)
//   closeAntiTechModal()
//   advanceAntiTechModal()      — Step 1 → Step 2
//   backToAntiTechStep1()       — Step 2 → Step 1
//   confirmAntiTechBuild()      — finish, write techSlots, generate
//
// Diagnostic prints: console.log('[AntiTechModal] ...') at key
// entry points so the trail is visible without flipping DEV_MODE.
// ─────────────────────────────────────────────────────────────────────
(function () {
    'use strict';

    // Module state. Both Sets are recreated on openAntiTechModal so
    // stale picks from a previous session never leak in.
    let _source         = null;
    let _step           = 1;
    let _targets        = new Set();   // lower-cased archetype names
    let _targetDisplay  = new Map();   // lower-cased → original case
    let _suggestedCards = [];          // [{name, threatCategories, targets, counterScore}]
    let _selectedCards  = new Set();   // lower-cased card names

    function _t(key, fallback) {
        return (typeof t === 'function' ? t(key) : null) || fallback;
    }

    function _devLog(...args) {
        console.log('[AntiTechModal]', ...args);
    }

    const QUICK_PICK_LIMIT = 12;
    const TECH_SLOTS_HARD_CAP = 10;

    function _normKey(s) {
        if (typeof normalizeCardName === 'function') return normalizeCardName(s || '');
        return String(s || '').toLowerCase().trim();
    }

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

    function _readAggression() {
        const checked = document.querySelector('input[name="antiTechAggression"]:checked');
        return (checked && checked.value) || 'standard';
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

    // ── STEP 1: TARGET SELECTION ─────────────────────────────────────

    // WR color classification — same thresholds the matchup table uses,
    // so the pill colors in the Build-vs picker visually match the
    // "Matchups vs Meta Call" view the user already knows.
    function _wrClass(wr) {
        if (wr == null || !Number.isFinite(wr)) return 'wr-neutral';
        if (wr >= 60) return 'wr-strong-pos';
        if (wr >= 53) return 'wr-pos';
        if (wr >= 47) return 'wr-neutral';
        if (wr >= 40) return 'wr-neg';
        return 'wr-strong-neg';
    }

    function _stripEx(name) {
        return String(name || '').replace(/\s+ex\b/i, '').trim();
    }

    // Build Map<opponentNameLower → wr> from currentMetaMatchupData
    // rows scoped to the user's currently-loaded archetype. The matchup
    // CSV is row-per-(deck, opponent) so a single pass groups what we
    // need. Returns an empty map when no archetype is loaded or the
    // matchup data isn't available yet.
    function _wrByOpponentForUser() {
        const map = new Map();
        const rows = (typeof window !== 'undefined') ? window.currentMetaMatchupData : null;
        const userArch = (typeof window !== 'undefined' && window.currentMetaArchetype) || null;
        if (!Array.isArray(rows) || !userArch) return map;
        const userLower    = userArch.trim().toLowerCase();
        const userStripped = _stripEx(userArch).toLowerCase();
        for (const r of rows) {
            const d = String(r.deck_name || '').trim().toLowerCase();
            if (d !== userLower && d !== userStripped) continue;
            const opp = String(r.opponent || '').trim();
            if (!opp) continue;
            const wr = parseFloat(String(r.win_rate || '0').replace(',', '.').replace('%', '').trim());
            if (Number.isFinite(wr) && wr > 0 && !map.has(opp.toLowerCase())) {
                map.set(opp.toLowerCase(), wr);
            }
        }
        return map;
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
        // Pull WR for each opponent from the matchup CSV so the user
        // sees immediately which decks they lose to (= tech priority)
        // alongside how often the deck appears in the predicted field.
        // Without this the picker shows only popularity, which is
        // exactly what the user reported as confusing in the v0 release.
        const wrByOpp = _wrByOpponentForUser();
        wrap.innerHTML = field.map(d => {
            const name = String(d.name || '').trim();
            const sharePct = (d.finalShare || 0);
            const wr = wrByOpp.get(name.toLowerCase());
            const wrText = (wr != null) ? wr.toFixed(1) + '%' : '—';
            const wrCls  = _wrClass(wr);
            const isOn = _targets.has(name.toLowerCase());
            return `<button type="button"
                            class="anti-tech-quick-pick${isOn ? ' is-active' : ''}"
                            data-target="${name.replace(/"/g, '&quot;')}">
                <span class="anti-tech-quick-pick-name">${name}</span>
                <span class="anti-tech-quick-pick-meta">
                    <span class="anti-tech-quick-pick-share" title="${_t('antiTech.fieldShareTooltip', 'Share of the predicted field')}">${sharePct.toFixed(1)}%</span>
                    <span class="mc-vs-pill ${wrCls} anti-tech-quick-pick-wr" title="${_t('antiTech.wrTooltip', 'Your current win rate against this deck — red means tech priority')}">${wrText}</span>
                </span>
            </button>`;
        }).join('');
        wrap.querySelectorAll('.anti-tech-quick-pick').forEach(btn => {
            btn.addEventListener('click', () => _toggleTarget(btn.dataset.target));
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
            .filter(n => n && String(n).toLowerCase().includes(q) && !_targets.has(String(n).toLowerCase()))
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
            btn.addEventListener('click', () => {
                _toggleTarget(btn.dataset.target);
                const input = document.getElementById('antiTechCustomInput');
                if (input) { input.value = ''; suggestionsEl.innerHTML = ''; }
            });
        });
    }

    function _toggleTarget(name) {
        const trimmed = String(name || '').trim();
        if (!trimmed) return;
        const key = trimmed.toLowerCase();
        if (_targets.has(key)) {
            _targets.delete(key);
            _targetDisplay.delete(key);
        } else {
            _targets.add(key);
            _targetDisplay.set(key, trimmed);
        }
        _renderChips();
        _populateQuickPicks(); // re-render so active state matches
        _updateContinueButton();
    }

    function _renderChips() {
        const wrap = document.getElementById('antiTechSelectedChips');
        if (!wrap) return;
        if (_targets.size === 0) {
            wrap.innerHTML = `<div class="anti-tech-chips-empty">${
                _t('antiTech.chipsEmpty', 'No targets picked yet. Tap a quick pick below or type a deck name.')
            }</div>`;
            return;
        }
        wrap.innerHTML = Array.from(_targets).map(k => {
            const display = _targetDisplay.get(k) || k;
            const safe = display.replace(/"/g, '&quot;');
            return `<span class="anti-tech-chip" data-target="${safe}">
                <span class="anti-tech-chip-label">${display}</span>
                <button type="button" class="anti-tech-chip-x" data-target="${safe}" aria-label="Remove">×</button>
            </span>`;
        }).join('');
        wrap.querySelectorAll('.anti-tech-chip-x').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                _toggleTarget(btn.dataset.target);
            });
        });
    }

    function _updateContinueButton() {
        const btn = document.getElementById('antiTechContinueBtn');
        if (!btn) return;
        btn.disabled = _targets.size === 0;
        const tpl = _t('antiTech.continueBtnCount', 'Continue → Pick Tech Cards ({n})');
        btn.textContent = _targets.size > 0
            ? tpl.replace('{n}', _targets.size)
            : (_t('antiTech.continueBtn', 'Continue → Pick Tech Cards'));
    }

    function _bindInputs() {
        const input = document.getElementById('antiTechCustomInput');
        if (input && !input.__antiTechBound) {
            input.__antiTechBound = true;
            input.addEventListener('input', (e) => _renderSuggestions(e.target.value));
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const q = (input.value || '').trim().toLowerCase();
                    const names = _getAllDeckNames();
                    const exact = names.find(n => String(n).toLowerCase() === q);
                    if (exact) {
                        _toggleTarget(exact);
                        input.value = '';
                        _renderSuggestions('');
                    } else if (q) {
                        _toggleTarget(input.value.trim());
                        input.value = '';
                        _renderSuggestions('');
                    }
                }
            });
        }
    }

    // ── STEP 2: TECH CARD SELECTION ──────────────────────────────────

    // For each target archetype, scan active_threats.json to find
    // which threat categories the target actually runs (at the
    // aggression-gated share floor), then pull counter cards from
    // those categories. Aggregates per-card across targets — a card
    // that counters multiple targets shows that list explicitly.
    async function _computeSuggestedCards() {
        const intel = await _ensureActiveThreats();
        if (!intel || !intel.threats || !intel.counters) return [];
        const aggression = _readAggression();
        const shareFloor = aggression === 'heavy' ? 0.10
                         : aggression === 'mild'  ? 0.25
                         : 0.15;

        const byCard = new Map(); // nameLower → {name, threatCategories, targets, counterScore}

        // For every selected target, find threat categories the
        // target uses, then collect counters from those categories.
        for (const targetKey of _targets) {
            const target = _targetDisplay.get(targetKey) || targetKey;
            const targetLower = targetKey;
            for (const [cat, info] of Object.entries(intel.threats)) {
                // Is this threat category present in the target deck
                // at the aggression-gated archetype-share floor?
                let usesCat = false;
                for (const threatCard of (info.cards || [])) {
                    for (const arch of (threatCard.archetypes || [])) {
                        if (String(arch.archetype || '').toLowerCase() !== targetLower) continue;
                        const share = parseFloat(arch.share_in_archetype || 0) || 0;
                        if (share >= shareFloor) { usesCat = true; break; }
                    }
                    if (usesCat) break;
                }
                if (!usesCat) continue;

                // Pull counter cards for this category. The data
                // file stores counters as a flat array per category
                // (NOT an object with a .cards member like threats
                // does) — `intel.counters.hand_disruption` is
                // directly [{card_id, card_name, card_type}, ...].
                const counters = (intel.counters && Array.isArray(intel.counters[cat]))
                    ? intel.counters[cat]
                    : [];
                for (const c of counters) {
                    const name = String(c.card_name || '').trim();
                    if (!name) continue;
                    const nameLower = name.toLowerCase();
                    let entry = byCard.get(nameLower);
                    if (!entry) {
                        entry = {
                            name,
                            threatCategories: new Set(),
                            targets: new Set(),
                            counterScore: 0,
                        };
                        byCard.set(nameLower, entry);
                    }
                    entry.threatCategories.add(cat);
                    entry.targets.add(target);
                    const score = parseFloat(c.counter_score || c.score || 0) || 0;
                    if (score > entry.counterScore) entry.counterScore = score;
                }
            }
        }

        // Sort: cards that counter MORE targets first, then by
        // counter score, then alphabetical.
        return Array.from(byCard.values()).sort((a, b) => {
            if (b.targets.size !== a.targets.size) return b.targets.size - a.targets.size;
            if (b.counterScore !== a.counterScore) return b.counterScore - a.counterScore;
            return a.name.localeCompare(b.name);
        });
    }

    function _renderTechSuggestions() {
        const list = document.getElementById('antiTechCardList');
        const targetsEl = document.getElementById('antiTechStep2Targets');
        if (!list) return;

        if (targetsEl) {
            targetsEl.textContent = Array.from(_targets)
                .map(k => _targetDisplay.get(k) || k)
                .join(', ');
        }

        if (_suggestedCards.length === 0) {
            list.innerHTML = `<div class="anti-tech-card-empty">${
                _t('antiTech.cardsEmpty', 'No counter cards found for the selected targets in active_threats.json. Try a different aggression preset or add a more meta-relevant target.')
            }</div>`;
            return;
        }

        list.innerHTML = _suggestedCards.map(c => {
            const safe = c.name.replace(/"/g, '&quot;');
            const targetsTxt = Array.from(c.targets).join(', ');
            const catsTxt = Array.from(c.threatCategories).join(' · ');
            const isOn = _selectedCards.has(c.name.toLowerCase());
            return `<label class="anti-tech-card-item${isOn ? ' is-selected' : ''}">
                <input type="checkbox" class="anti-tech-card-check" data-card="${safe}" ${isOn ? 'checked' : ''}>
                <span class="anti-tech-card-body">
                    <span class="anti-tech-card-name">${c.name}</span>
                    <span class="anti-tech-card-meta">
                        <span class="anti-tech-card-targets">vs ${targetsTxt}</span>
                        <span class="anti-tech-card-cats">${catsTxt}</span>
                    </span>
                </span>
            </label>`;
        }).join('');
        list.querySelectorAll('.anti-tech-card-check').forEach(box => {
            box.addEventListener('change', () => _toggleSuggestedCard(box.dataset.card, box.checked));
        });
    }

    function _toggleSuggestedCard(cardName, checked) {
        const key = String(cardName || '').toLowerCase();
        if (checked) {
            if (_selectedCards.size >= TECH_SLOTS_HARD_CAP) {
                _selectedCards.delete(key);
                const tpl = _t('antiTech.cardsCap', 'Tech slots are capped at {n}. Uncheck one before adding another.');
                if (typeof showToast === 'function') showToast(tpl.replace('{n}', TECH_SLOTS_HARD_CAP), 'warning', 2500);
                _renderTechSuggestions();
                return;
            }
            _selectedCards.add(key);
        } else {
            _selectedCards.delete(key);
        }
        // Update is-selected class without re-rendering the whole list.
        document.querySelectorAll('.anti-tech-card-item').forEach(el => {
            const cb = el.querySelector('.anti-tech-card-check');
            if (!cb) return;
            el.classList.toggle('is-selected', cb.checked);
        });
        _updateBuildButton();
    }

    function _updateBuildButton() {
        const btn = document.getElementById('antiTechBuildBtn');
        if (!btn) return;
        btn.disabled = _selectedCards.size === 0;
        const tpl = _t('antiTech.buildBtnCount', 'Build with {n} cards');
        btn.textContent = tpl.replace('{n}', _selectedCards.size);
    }

    function _showStep(n) {
        _step = n;
        const s1 = document.getElementById('antiTechStep1Wrap');
        const s2 = document.getElementById('antiTechStep2Wrap');
        if (s1) s1.classList.toggle('display-none', n !== 1);
        if (s2) s2.classList.toggle('display-none', n !== 2);
    }

    // ── PUBLIC API ───────────────────────────────────────────────────

    function openAntiTechModal(source) {
        _devLog('openAntiTechModal called with source:', source);
        if (source !== 'cityLeague' && source !== 'currentMeta' && source !== 'pastMeta') {
            _devLog('unsupported source — bailing');
            if (typeof showToast === 'function') {
                showToast(_t('antiTech.unsupportedSource', 'Build vs is not supported on this view.'), 'info');
            }
            return;
        }
        const modal = document.getElementById('antiTechModal');
        if (!modal) {
            _devLog('modal element #antiTechModal missing from DOM');
            return;
        }
        _source = source;
        _targets = new Set();
        _targetDisplay = new Map();
        _suggestedCards = [];
        _selectedCards = new Set();

        modal.classList.remove('display-none');
        modal.classList.add('show');
        _showStep(1);

        const input = document.getElementById('antiTechCustomInput');
        if (input) input.value = '';
        const suggestions = document.getElementById('antiTechSuggestions');
        if (suggestions) suggestions.innerHTML = '';
        const standard = document.querySelector('input[name="antiTechAggression"][value="standard"]');
        if (standard) standard.checked = true;

        _populateQuickPicks();
        _renderChips();
        _bindInputs();
        _updateContinueButton();
        _devLog('modal opened, step 1 ready');
    }

    function closeAntiTechModal() {
        _devLog('closeAntiTechModal');
        const modal = document.getElementById('antiTechModal');
        if (modal) {
            modal.classList.remove('show');
            modal.classList.add('display-none');
        }
        _source = null;
        _targets = new Set();
        _targetDisplay = new Map();
        _suggestedCards = [];
        _selectedCards = new Set();
    }

    async function advanceAntiTechModal() {
        _devLog('advanceAntiTechModal — computing suggestions for', _targets.size, 'targets');
        if (_targets.size === 0) return;
        _showStep(2);
        const list = document.getElementById('antiTechCardList');
        if (list) {
            list.innerHTML = `<div class="anti-tech-card-loading">${
                _t('antiTech.cardsLoading', 'Loading suggested counters…')
            }</div>`;
        }
        try {
            _suggestedCards = await _computeSuggestedCards();
            _devLog('computed', _suggestedCards.length, 'suggestions');
        } catch (e) {
            _devLog('compute failed:', e);
            _suggestedCards = [];
        }
        // Pre-select top 3 across all targets so the user sees a
        // reasonable starting build without having to click through
        // every card. They can toggle from there.
        _selectedCards = new Set();
        const preselect = _suggestedCards.slice(0, Math.min(3, _suggestedCards.length));
        preselect.forEach(c => _selectedCards.add(c.name.toLowerCase()));
        _renderTechSuggestions();
        _updateBuildButton();
    }

    function backToAntiTechStep1() {
        _devLog('backToAntiTechStep1');
        _showStep(1);
    }

    async function confirmAntiTechBuild() {
        _devLog('confirmAntiTechBuild — selected:', _selectedCards.size, 'cards');
        if (_selectedCards.size === 0) return;
        const source = _source || 'currentMeta';
        const selectedNames = _suggestedCards
            .filter(c => _selectedCards.has(c.name.toLowerCase()))
            .map(c => c.name);
        const aggression = _readAggression();
        closeAntiTechModal();

        // Write the selected cards into techSlots BEFORE running the
        // generator. techSlots fold into Stage 0 of autoComplete-
        // Consistency so these cards are force-included no matter
        // what the consistency-score gate says.
        if (typeof window.techSlotsFromArray === 'function') {
            window.techSlotsFromArray(source, selectedNames.slice(0, TECH_SLOTS_HARD_CAP));
            if (typeof renderTechSlotsUI === 'function') renderTechSlotsUI(source);
            if (typeof showToast === 'function') {
                const tpl = _t('antiTech.toastInjected', 'Loaded {n} tech card(s) into your slots — generating build now.');
                showToast(tpl.replace('{n}', selectedNames.length), 'info', 2500);
            }
        } else {
            _devLog('techSlotsFromArray missing — cannot inject techs');
        }

        if (typeof autoCompleteConsistency !== 'function') {
            _devLog('autoCompleteConsistency unavailable');
            return;
        }
        try {
            // Run without antiTechTarget — the techSlots themselves
            // carry the user's intent. aggression is still passed so
            // the threat-category gating still affects the audit.
            await autoCompleteConsistency(source, 'min', { antiTechAggression: aggression });
            _devLog('build complete');
        } catch (e) {
            _devLog('build failed:', e);
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

    window.openAntiTechModal     = openAntiTechModal;
    window.closeAntiTechModal    = closeAntiTechModal;
    window.advanceAntiTechModal  = advanceAntiTechModal;
    window.backToAntiTechStep1   = backToAntiTechStep1;
    window.confirmAntiTechBuild  = confirmAntiTechBuild;
})();
