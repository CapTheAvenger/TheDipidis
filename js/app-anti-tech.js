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

    function _bindInputs() {
        const input = document.getElementById('antiTechCustomInput');
        if (input && !input.__antiTechBound) {
            input.__antiTechBound = true;
            input.addEventListener('input', (e) => {
                _renderSuggestions(e.target.value);
                if (!e.target.value.trim()) {
                    _selection = null;
                    _highlightQuickPick();
                    _updateGenerateButtonState();
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

    function openAntiTechModal(source) {
        if (source !== 'currentMeta') {
            // MVP locks scope to currentMeta. The button only renders
            // on that tab, but guard in case other code paths try it.
            if (typeof showToast === 'function') {
                showToast(_t('antiTech.unsupportedSource', 'Build vs is only available on the Current Meta tab.'), 'info');
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
    }

    function closeAntiTechModal() {
        const modal = document.getElementById('antiTechModal');
        if (modal) modal.classList.add('display-none');
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
