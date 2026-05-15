// ─────────────────────────────────────────────────────────────────────
// Tech Lab — interactive tech-card explorer at the bottom of the
// Deck Analysis (Global) tab. The user picks any single meta card
// as a "target", and the capability engine surfaces every meta card
// that has a winning card-text interaction against it. Suggestions
// can be approved or rejected by the user; rejections + additions
// persist in localStorage so the system learns from the human's
// domain expertise across sessions.
//
// Source-of-truth files (read-only):
//   data/card_capability_taxonomy.json
//   data/card_capability_patterns.json
//   data/card_capability_interactions.json
//   data/pokemon_card_effects.json   (full card text)
//   window.currentMetaAnalysisData   (which cards exist in the meta)
//
// User overrides (read-write, localStorage):
//   techLab.overrides.v1
//   {
//     "<TARGET_SET|NUM>": {
//       "hidden": ["card_name_1", "card_name_2"],     // engine missed
//       "added":  [{name, cardId, note}, ...],         // engine wrong
//     }
//   }
//
// Public API (window.*):
//   TechLab.init()              — wire up after DOM ready
//   TechLab.refresh()           — rerun current target lookup
//   TechLab.openTargetPicker()  — show the target search modal
//   TechLab.openAddMissing()    — show the "add missing tech" picker
// ─────────────────────────────────────────────────────────────────────
(function () {
    'use strict';

    const OVERRIDES_KEY = 'techLab.overrides.v1';

    // Module state
    let _target = null;          // { key: "DRI|12", name: "Crustle" }
    let _techs  = [];            // array of {name, cardId, narrative, confidence, source, hidden}
    let _allMetaCards = [];      // [{key, name}] cached haystack
    let _allMetaCardSet = new Set(); // cardKey set for "in current meta?" checks
    let _ready = false;

    function _t(key, fallback) {
        return (typeof t === 'function' ? t(key) : null) || fallback;
    }

    function _devLog(...args) {
        console.log('[TechLab]', ...args);
    }

    function _escapeHtml(s) {
        if (typeof escapeHtml === 'function') return escapeHtml(s);
        return String(s || '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[c]);
    }

    function _cardImageUrl(cardId) {
        if (!cardId) return null;
        const parts = String(cardId).split('|');
        if (parts.length !== 2) return null;
        const set = parts[0].toUpperCase().trim();
        const num = parts[1].trim();
        if (!set || !num) return null;
        const padded = /^\d+$/.test(num) ? num.padStart(3, '0') : num;
        return `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/${set}/${set}_${padded}_R_EN_LG.png`;
    }

    // ── OVERRIDES (localStorage) ─────────────────────────────────────

    function _readOverrides() {
        try {
            const raw = localStorage.getItem(OVERRIDES_KEY);
            return raw ? (JSON.parse(raw) || {}) : {};
        } catch (_) {
            return {};
        }
    }

    function _writeOverrides(obj) {
        try {
            localStorage.setItem(OVERRIDES_KEY, JSON.stringify(obj));
        } catch (e) {
            _devLog('localStorage write failed:', e.message);
        }
    }

    function _getTargetOverrides(targetKey) {
        const all = _readOverrides();
        return all[targetKey] || { hidden: [], added: [] };
    }

    function _setTargetOverrides(targetKey, value) {
        const all = _readOverrides();
        all[targetKey] = value;
        _writeOverrides(all);
    }

    function _hideTech(targetKey, cardName) {
        const ov = _getTargetOverrides(targetKey);
        const key = String(cardName || '').toLowerCase();
        if (!ov.hidden.some(n => n.toLowerCase() === key)) {
            ov.hidden.push(cardName);
            _setTargetOverrides(targetKey, ov);
        }
    }

    function _unhideTech(targetKey, cardName) {
        const ov = _getTargetOverrides(targetKey);
        const key = String(cardName || '').toLowerCase();
        ov.hidden = ov.hidden.filter(n => n.toLowerCase() !== key);
        _setTargetOverrides(targetKey, ov);
    }

    function _addMissingTech(targetKey, name, cardId, note) {
        const ov = _getTargetOverrides(targetKey);
        const key = String(name || '').toLowerCase();
        if (!ov.added.some(e => String(e.name || '').toLowerCase() === key)) {
            ov.added.push({ name, cardId: cardId || null, note: note || '' });
            _setTargetOverrides(targetKey, ov);
        }
    }

    function _removeAddedTech(targetKey, cardName) {
        const ov = _getTargetOverrides(targetKey);
        const key = String(cardName || '').toLowerCase();
        ov.added = ov.added.filter(e => String(e.name || '').toLowerCase() !== key);
        _setTargetOverrides(targetKey, ov);
    }

    function _resetTargetOverrides(targetKey) {
        const all = _readOverrides();
        delete all[targetKey];
        _writeOverrides(all);
    }

    // ── META-CARDS HAYSTACK ──────────────────────────────────────────

    function _rebuildMetaCards() {
        const rows = (typeof window !== 'undefined' && window.currentMetaAnalysisData) || [];
        const seen = new Set();
        const out = [];
        for (const r of rows) {
            if (!r) continue;
            const set = String(r.set_code || '').toUpperCase().trim();
            const num = String(r.set_number || '').trim();
            const name = String(r.card_name || '').trim();
            if (!set || !num || !name) continue;
            const key = `${set}|${num}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ key, name });
        }
        _allMetaCards = out;
        _allMetaCardSet = seen;
        _devLog('haystack rebuilt:', out.length, 'unique meta cards');
    }

    // ── ENGINE WRAPPER ───────────────────────────────────────────────

    async function _findTechsForCard(targetKey, targetName) {
        if (typeof window.CardCapabilityEngine === 'undefined') {
            _devLog('CardCapabilityEngine missing');
            return [];
        }
        if (typeof window._loadCardEffectsIndex !== 'function') return [];
        const cardEffectsIndex = await window._loadCardEffectsIndex();
        if (!cardEffectsIndex || !cardEffectsIndex.size) return [];

        if (_allMetaCards.length === 0) _rebuildMetaCards();
        if (_allMetaCards.length === 0) return [];

        // Single-card "archetype" for the defender side.
        const targetArchetypes = new Map();
        targetArchetypes.set(targetName, [{ key: targetKey, name: targetName }]);

        let detected;
        try {
            detected = await window.CardCapabilityEngine.detectMatchups({
                userDeckCards: _allMetaCards,
                archetypeCardMap: targetArchetypes,
                cardEffectsIndex,
                lang: (typeof getLang === 'function') ? getLang() : 'en',
            });
        } catch (e) {
            _devLog('detectMatchups failed:', e && e.message);
            return [];
        }
        if (!detected || detected.size === 0) return [];

        // Roll up to per-attacker-card entries.
        const byCard = new Map();
        const cardIdByName = new Map();
        for (const c of _allMetaCards) {
            const k = c.name.toLowerCase();
            if (!cardIdByName.has(k)) cardIdByName.set(k, c.key);
        }
        for (const matchups of detected.values()) {
            for (const m of matchups) {
                if (m.result !== 'attacker_wins') continue;
                const key = m.attackerCard.toLowerCase();
                let entry = byCard.get(key);
                if (!entry) {
                    entry = {
                        name:       m.attackerCard,
                        cardId:     cardIdByName.get(key) || null,
                        narrative:  m.narrative,
                        confidence: m.confidence,
                        attackSource: m.attackerSource && m.attackerSource.name,
                        hidden:     false,
                    };
                    byCard.set(key, entry);
                }
            }
        }
        // Skip the target card itself — "this card is a tech against
        // itself" is technically a mirror-tech but clutters the list.
        // User can still see mirror-techs via the engine's own table.
        byCard.delete(targetName.toLowerCase());

        return Array.from(byCard.values()).sort((a, b) => a.name.localeCompare(b.name));
    }

    // ── RENDER ───────────────────────────────────────────────────────

    function _renderEmpty(message) {
        const list = document.getElementById('techLabResults');
        if (!list) return;
        list.innerHTML = `<div class="tech-lab-empty">${_escapeHtml(message)}</div>`;
        const addBtn = document.getElementById('techLabAddMissingBtn');
        if (addBtn) addBtn.disabled = !_target;
        const resetBtn = document.getElementById('techLabResetBtn');
        if (resetBtn) resetBtn.disabled = !_target;
    }

    async function _renderTechsFor(target) {
        _target = target;
        const headerEl = document.getElementById('techLabTargetLabel');
        const thumbEl  = document.getElementById('techLabTargetThumb');
        if (headerEl) headerEl.textContent = target.name;
        if (thumbEl) {
            const img = _cardImageUrl(target.key);
            thumbEl.innerHTML = img
                ? `<img src="${_escapeHtml(img)}" alt="${_escapeHtml(target.name)}" loading="lazy">`
                : '';
        }
        const list = document.getElementById('techLabResults');
        if (list) list.innerHTML = `<div class="tech-lab-loading">${_escapeHtml(_t('techLab.loading', 'Searching meta for techs against this card…'))}</div>`;

        // Engine pass
        let engineTechs = [];
        try {
            engineTechs = await _findTechsForCard(target.key, target.name);
        } catch (e) {
            _devLog('lookup failed:', e && e.message);
        }

        // Apply overrides
        const ov = _getTargetOverrides(target.key);
        const hiddenSet = new Set(ov.hidden.map(n => n.toLowerCase()));
        const baseList = engineTechs.filter(e => !hiddenSet.has(e.name.toLowerCase()));
        const addedList = (ov.added || []).map(a => ({
            name: a.name,
            cardId: a.cardId || null,
            narrative: a.note || _t('techLab.userAdded', 'Added by you'),
            confidence: 'user',
            attackSource: null,
            hidden: false,
            isUserAdded: true,
        }));
        _techs = [...baseList, ...addedList];

        if (_techs.length === 0) {
            _renderEmpty(_t('techLab.noTechs', 'No techs detected by the engine. Click "+ Add missing tech" if you know a card the engine missed.'));
            return;
        }

        if (!list) return;
        list.innerHTML = _techs.map(tech => {
            const safeName = _escapeHtml(tech.name);
            const imgUrl  = tech.cardId ? _cardImageUrl(tech.cardId) : null;
            const safeImg = imgUrl ? _escapeHtml(imgUrl) : '';
            const confCls = tech.isUserAdded ? 'user'
                          : tech.confidence === 'high' ? 'high'
                          : tech.confidence === 'medium' ? 'medium' : 'low';
            const confLabel = tech.isUserAdded
                ? _t('techLab.confUser', 'user-added')
                : (tech.confidence || 'unknown');
            const thumb = imgUrl
                ? `<button class="tech-lab-card-thumb" data-card-img="${safeImg}" data-card-name="${safeName}" aria-label="Zoom ${safeName}"><img src="${safeImg}" alt="${safeName}" loading="lazy"></button>`
                : `<span class="tech-lab-card-thumb tech-lab-thumb-fallback" aria-hidden="true">?</span>`;
            const action = tech.isUserAdded
                ? `<button class="tech-lab-action tech-lab-action-remove" data-card="${safeName}" title="${_escapeHtml(_t('techLab.removeAdded', 'Remove this user-added tech'))}">${_escapeHtml(_t('techLab.removeAddedBtn', 'Remove'))}</button>`
                : `<button class="tech-lab-action tech-lab-action-reject" data-card="${safeName}" title="${_escapeHtml(_t('techLab.markWrong', 'Mark this card as not a tech (hides it for this target)'))}">${_escapeHtml(_t('techLab.markWrongBtn', '✗ Not a tech'))}</button>`;
            return `<li class="tech-lab-card tech-lab-card-${confCls}${tech.isUserAdded ? ' tech-lab-card-user' : ''}">
                ${thumb}
                <div class="tech-lab-card-body">
                    <div class="tech-lab-card-name">${safeName}</div>
                    <div class="tech-lab-card-narrative">${_escapeHtml(tech.narrative || '')}</div>
                    <div class="tech-lab-card-meta">
                        <span class="tech-lab-card-conf tech-lab-conf-${confCls}">${_escapeHtml(confLabel)}</span>
                        ${tech.attackSource ? `<span class="tech-lab-card-source">${_escapeHtml(tech.attackSource)}</span>` : ''}
                    </div>
                </div>
                ${action}
            </li>`;
        }).join('');

        // Wire interactions
        list.querySelectorAll('.tech-lab-card-thumb[data-card-img]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const img  = btn.dataset.cardImg;
                const name = btn.dataset.cardName || '';
                if (img && typeof window.showSingleCard === 'function') {
                    window.showSingleCard(img, name);
                }
            });
        });
        list.querySelectorAll('.tech-lab-action-reject').forEach(btn => {
            btn.addEventListener('click', () => {
                _hideTech(_target.key, btn.dataset.card);
                _renderTechsFor(_target);
            });
        });
        list.querySelectorAll('.tech-lab-action-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                _removeAddedTech(_target.key, btn.dataset.card);
                _renderTechsFor(_target);
            });
        });

        const addBtn = document.getElementById('techLabAddMissingBtn');
        if (addBtn) addBtn.disabled = false;
        const resetBtn = document.getElementById('techLabResetBtn');
        if (resetBtn) resetBtn.disabled = false;
    }

    // ── TARGET PICKER ────────────────────────────────────────────────

    function _renderPickerResults(inputId, listId, query, onPick) {
        const list = document.getElementById(listId);
        if (!list) return;
        const q = String(query || '').trim().toLowerCase();
        if (!q || q.length < 1) { list.innerHTML = ''; return; }
        if (_allMetaCards.length === 0) _rebuildMetaCards();
        const matches = _allMetaCards
            .filter(c => c.name.toLowerCase().includes(q))
            .slice(0, 15);
        if (matches.length === 0) {
            list.innerHTML = `<div class="tech-lab-picker-empty">${
                _escapeHtml(_t('techLab.pickerEmpty', 'No meta card matches that query.'))
            }</div>`;
            return;
        }
        list.innerHTML = matches.map(c => {
            const img = _cardImageUrl(c.key);
            const safeImg = img ? _escapeHtml(img) : '';
            const safeName = _escapeHtml(c.name);
            const safeKey = _escapeHtml(c.key);
            return `<li class="tech-lab-picker-item" data-key="${safeKey}" data-name="${safeName}">
                ${img ? `<img class="tech-lab-picker-thumb" src="${safeImg}" alt="${safeName}" loading="lazy">` : '<span class="tech-lab-picker-thumb tech-lab-thumb-fallback">?</span>'}
                <span class="tech-lab-picker-name">${safeName}</span>
                <span class="tech-lab-picker-key">${safeKey}</span>
            </li>`;
        }).join('');
        list.querySelectorAll('.tech-lab-picker-item').forEach(item => {
            item.addEventListener('click', () => {
                onPick({ key: item.dataset.key, name: item.dataset.name });
            });
        });
    }

    function _wireTargetPicker() {
        const input = document.getElementById('techLabTargetSearch');
        const dropdown = document.getElementById('techLabTargetDropdown');
        if (!input || !dropdown) return;
        input.addEventListener('input', (e) => {
            _renderPickerResults('techLabTargetSearch', 'techLabTargetDropdown', e.target.value, (pick) => {
                input.value = pick.name;
                dropdown.innerHTML = '';
                _renderTechsFor(pick);
            });
        });
        input.addEventListener('focus', () => {
            if (input.value) {
                _renderPickerResults('techLabTargetSearch', 'techLabTargetDropdown', input.value, (pick) => {
                    input.value = pick.name;
                    dropdown.innerHTML = '';
                    _renderTechsFor(pick);
                });
            }
        });
        document.addEventListener('click', (e) => {
            if (!input.parentElement.contains(e.target)) {
                dropdown.innerHTML = '';
            }
        });
    }

    // ── ADD-MISSING-TECH MODAL ───────────────────────────────────────

    function openAddMissing() {
        if (!_target) return;
        const overlay = document.getElementById('techLabAddOverlay');
        const input   = document.getElementById('techLabAddSearch');
        const dropdown = document.getElementById('techLabAddDropdown');
        if (!overlay || !input || !dropdown) return;
        overlay.classList.remove('display-none');
        overlay.classList.add('show');
        input.value = '';
        dropdown.innerHTML = '';
        setTimeout(() => input.focus(), 30);
        input.oninput = (e) => {
            _renderPickerResults('techLabAddSearch', 'techLabAddDropdown', e.target.value, (pick) => {
                _addMissingTech(_target.key, pick.name, pick.key, '');
                closeAddMissing();
                _renderTechsFor(_target);
            });
        };
    }

    function closeAddMissing() {
        const overlay = document.getElementById('techLabAddOverlay');
        if (overlay) {
            overlay.classList.remove('show');
            overlay.classList.add('display-none');
        }
    }

    // ── RESET ────────────────────────────────────────────────────────

    function _onResetClick() {
        if (!_target) return;
        const msg = _t('techLab.resetConfirm', 'Reset all overrides (hidden + user-added) for this target?');
        if (typeof window !== 'undefined' && !window.confirm(msg)) return;
        _resetTargetOverrides(_target.key);
        _renderTechsFor(_target);
    }

    // ── PUBLIC API ───────────────────────────────────────────────────

    function init() {
        if (_ready) return;
        _ready = true;
        _wireTargetPicker();
        const addBtn = document.getElementById('techLabAddMissingBtn');
        if (addBtn) addBtn.addEventListener('click', openAddMissing);
        const resetBtn = document.getElementById('techLabResetBtn');
        if (resetBtn) resetBtn.addEventListener('click', _onResetClick);
        const closeBtn = document.getElementById('techLabAddCloseBtn');
        if (closeBtn) closeBtn.addEventListener('click', closeAddMissing);
        const overlay = document.getElementById('techLabAddOverlay');
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) closeAddMissing();
            });
        }
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            const o = document.getElementById('techLabAddOverlay');
            if (o && !o.classList.contains('display-none')) closeAddMissing();
        });
        _devLog('initialised');
    }

    function refresh() {
        if (_target) _renderTechsFor(_target);
    }

    function openTargetPicker() {
        const input = document.getElementById('techLabTargetSearch');
        if (input) input.focus();
    }

    window.TechLab = {
        init,
        refresh,
        openTargetPicker,
        openAddMissing,
        closeAddMissing,
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
