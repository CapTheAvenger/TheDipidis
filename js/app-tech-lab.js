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

    // Overrides are stored per direction so the user can curate
    // each section independently. Direction keys are 'beatenBy'
    // (cards that beat the target) and 'beats' (cards the target
    // beats). Migrates the legacy flat shape on first read.
    function _getTargetOverrides(targetKey) {
        const all = _readOverrides();
        let raw = all[targetKey];
        if (!raw) raw = {};
        // Migrate legacy flat { hidden, added } → { beatenBy: {...} }
        if (Array.isArray(raw.hidden) || Array.isArray(raw.added)) {
            raw = { beatenBy: { hidden: raw.hidden || [], added: raw.added || [] } };
            all[targetKey] = raw;
            _writeOverrides(all);
        }
        if (!raw.beatenBy) raw.beatenBy = { hidden: [], added: [] };
        if (!raw.beats)    raw.beats    = { hidden: [], added: [] };
        return raw;
    }

    function _setTargetOverrides(targetKey, value) {
        const all = _readOverrides();
        all[targetKey] = value;
        _writeOverrides(all);
    }

    function _hideTech(targetKey, direction, cardName) {
        const ov = _getTargetOverrides(targetKey);
        const bucket = ov[direction];
        if (!bucket) return;
        const key = String(cardName || '').toLowerCase();
        if (!bucket.hidden.some(n => n.toLowerCase() === key)) {
            bucket.hidden.push(cardName);
            _setTargetOverrides(targetKey, ov);
        }
    }

    function _addMissingTech(targetKey, direction, name, cardId, note) {
        const ov = _getTargetOverrides(targetKey);
        const bucket = ov[direction];
        if (!bucket) return;
        const key = String(name || '').toLowerCase();
        if (!bucket.added.some(e => String(e.name || '').toLowerCase() === key)) {
            bucket.added.push({ name, cardId: cardId || null, note: note || '' });
            _setTargetOverrides(targetKey, ov);
        }
    }

    function _removeAddedTech(targetKey, direction, cardName) {
        const ov = _getTargetOverrides(targetKey);
        const bucket = ov[direction];
        if (!bucket) return;
        const key = String(cardName || '').toLowerCase();
        bucket.added = bucket.added.filter(e => String(e.name || '').toLowerCase() !== key);
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

    // Direction A: cards in the meta that BEAT the picked card.
    // The picked card is the defender. detectMatchups with the target
    // as defender + every meta card as potential attacker returns
    // exactly this.
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
        byCard.delete(targetName.toLowerCase());

        return Array.from(byCard.values()).sort((a, b) => a.name.localeCompare(b.name));
    }

    // Direction B: cards in the meta that the picked card BEATS.
    // Invert detectMatchups: the picked card is the attacker, every
    // meta card is a candidate defender. For each meta card the
    // picked card has a winning interaction against, the meta card
    // ends up in the result. This is "what the target is good for".
    //
    // detectMatchups can't be used as-is because it iterates the
    // archetypeCardMap (defender side) and would need every meta
    // card as a separate "archetype" entry — ~700 archetypes worth.
    // Simpler: extract the target's attacker tags + the meta cards'
    // defender tags directly and intersect via the interaction matrix.
    async function _findThingsThisCardBeats(targetKey, targetName) {
        const engine = window.CardCapabilityEngine;
        if (typeof engine === 'undefined') return [];
        if (typeof window._loadCardEffectsIndex !== 'function') return [];
        const cardEffectsIndex = await window._loadCardEffectsIndex();
        if (!cardEffectsIndex || !cardEffectsIndex.size) return [];
        await engine.load();

        if (_allMetaCards.length === 0) _rebuildMetaCards();
        if (_allMetaCards.length === 0) return [];

        // Target's own tags. We treat BOTH attacker and defender tags
        // as "the target's offensive surface" — defenders also "win"
        // when they nullify an opposing attacker (`defender_wins`
        // interaction), so a card like Shaymin (only has bench-
        // protection ability, no attack tag) still has things it
        // beats.
        const targetRec = cardEffectsIndex.bySetNumber
            && cardEffectsIndex.bySetNumber.get(String(targetKey).toUpperCase().trim());
        if (!targetRec) return [];
        const targetTags = engine.extractTags(targetRec, targetKey);
        const targetAttackerTags = new Set(targetTags.filter(t => t.tag.startsWith('attack.')).map(t => t.tag));
        const targetDefenderTags = new Set(targetTags.filter(t => t.tag.startsWith('ability.')).map(t => t.tag));

        // Load the interaction matrix directly. The engine doesn't
        // expose its compiled rules but the JSON is the same shape.
        let interactionsData;
        try {
            const resp = await fetch('./data/card_capability_interactions.json', { cache: 'no-cache' });
            interactionsData = resp.ok ? await resp.json() : null;
        } catch (_) { interactionsData = null; }
        const interactions = (interactionsData && interactionsData.interactions) || [];
        if (interactions.length === 0) return [];

        // Build the "what tags does the target win against" set.
        //   target attacker tag wins → look up defender tags it beats
        //   target defender tag wins → look up attacker tags it blocks
        const wonOverDefenderTags = new Set();   // tags the target's attacks bypass
        const wonOverAttackerTags = new Set();   // tags the target's defenses block
        const tagNarrativeByPair = new Map();    // "attTag|defTag" → narrative template
        const tagConfidenceByPair = new Map();
        for (const ix of interactions) {
            const result = ix.result || 'attacker_wins';
            // Target as attacker, interaction is attacker_wins
            if (result === 'attacker_wins' && targetAttackerTags.has(ix.attacker)) {
                wonOverDefenderTags.add(ix.defender);
                tagNarrativeByPair.set(`A|${ix.defender}`, ix);
            }
            // Target as defender, interaction is defender_wins
            if (result === 'defender_wins' && targetDefenderTags.has(ix.defender)) {
                wonOverAttackerTags.add(ix.attacker);
                tagNarrativeByPair.set(`D|${ix.attacker}`, ix);
            }
        }
        if (wonOverDefenderTags.size === 0 && wonOverAttackerTags.size === 0) return [];

        // Scan meta haystack for cards carrying the won-over tags.
        const lang = (typeof getLang === 'function') ? getLang() : 'en';
        const byCard = new Map();
        for (const c of _allMetaCards) {
            if (c.key === targetKey) continue;  // skip self
            const rec = cardEffectsIndex.bySetNumber.get(String(c.key).toUpperCase().trim());
            if (!rec) continue;
            const tags = engine.extractTags(rec, c.key);
            for (const t of tags) {
                let ix = null;
                let role = null;  // 'A' = target attacks them; 'D' = target defends against them
                if (wonOverDefenderTags.has(t.tag) && t.tag.startsWith('ability.')) {
                    ix = tagNarrativeByPair.get(`A|${t.tag}`);
                    role = 'A';
                } else if (wonOverAttackerTags.has(t.tag) && t.tag.startsWith('attack.')) {
                    ix = tagNarrativeByPair.get(`D|${t.tag}`);
                    role = 'D';
                }
                if (!ix) continue;
                const key = rec.name.toLowerCase();
                if (byCard.has(key)) continue;
                // Build the narrative with target as the actor.
                const tpl = (lang === 'de' ? (ix.narrative_de || ix.narrative_en) : ix.narrative_en) || '';
                const targetSource = (role === 'A')
                    ? (Array.from(targetTags).find(tt => tt.tag === ix.attacker) || {}).source
                    : (Array.from(targetTags).find(tt => tt.tag === ix.defender) || {}).source;
                const opponentSource = t.source;
                const narrative = tpl
                    .replace('{attacker_name}', role === 'A' ? targetName : rec.name)
                    .replace('{attacker_source}', (role === 'A' ? targetSource : opponentSource)?.name || '')
                    .replace('{defender_name}', role === 'A' ? rec.name : targetName)
                    .replace('{defender_ability}', (role === 'A' ? opponentSource : targetSource)?.name || '');
                byCard.set(key, {
                    name: rec.name,
                    cardId: c.key,
                    narrative,
                    confidence: ix.confidence || 'medium',
                    attackSource: opponentSource && opponentSource.name,
                    role,
                });
            }
        }
        return Array.from(byCard.values()).sort((a, b) => a.name.localeCompare(b.name));
    }

    // ── RENDER ───────────────────────────────────────────────────────

    // Render a single section (beatenBy or beats). Returns the
    // list of techs after overrides applied. The DOM list element
    // is identified by listElId; the section's empty-state text
    // by emptyText.
    function _renderTechList(listEl, techs, direction, emptyText) {
        if (!listEl) return;
        if (techs.length === 0) {
            listEl.innerHTML = `<li class="tech-lab-empty">${_escapeHtml(emptyText)}</li>`;
            return;
        }
        listEl.innerHTML = techs.map(tech => {
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
                ? `<button class="tech-lab-action tech-lab-action-remove" data-card="${safeName}" data-dir="${direction}" title="${_escapeHtml(_t('techLab.removeAdded', 'Remove this user-added tech'))}">${_escapeHtml(_t('techLab.removeAddedBtn', 'Remove'))}</button>`
                : `<button class="tech-lab-action tech-lab-action-reject" data-card="${safeName}" data-dir="${direction}" title="${_escapeHtml(_t('techLab.markWrong', 'Mark this card as not a tech (hides it for this target)'))}">${_escapeHtml(_t('techLab.markWrongBtn', '✗ Not a tech'))}</button>`;
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
    }

    function _applyOverridesToTechs(engineTechs, directionOverrides) {
        const hiddenSet = new Set((directionOverrides.hidden || []).map(n => n.toLowerCase()));
        const filtered = engineTechs.filter(e => !hiddenSet.has(e.name.toLowerCase()));
        const added = (directionOverrides.added || []).map(a => ({
            name: a.name,
            cardId: a.cardId || null,
            narrative: a.note || _t('techLab.userAdded', 'Added by you'),
            confidence: 'user',
            attackSource: null,
            isUserAdded: true,
        }));
        return [...filtered, ...added];
    }

    function _wireCardListInteractions(listEl) {
        if (!listEl) return;
        listEl.querySelectorAll('.tech-lab-card-thumb[data-card-img]').forEach(btn => {
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
        listEl.querySelectorAll('.tech-lab-action-reject').forEach(btn => {
            btn.addEventListener('click', () => {
                _hideTech(_target.key, btn.dataset.dir, btn.dataset.card);
                _renderTechsFor(_target);
            });
        });
        listEl.querySelectorAll('.tech-lab-action-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                _removeAddedTech(_target.key, btn.dataset.dir, btn.dataset.card);
                _renderTechsFor(_target);
            });
        });
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
        const beatenByList = document.getElementById('techLabBeatenByList');
        const beatsList    = document.getElementById('techLabBeatsList');
        const loadingHtml = `<li class="tech-lab-loading">${_escapeHtml(_t('techLab.loading', 'Searching meta…'))}</li>`;
        if (beatenByList) beatenByList.innerHTML = loadingHtml;
        if (beatsList)    beatsList.innerHTML    = loadingHtml;

        // Reveal the result sections (hidden by default until a target
        // is picked so the empty state doesn't look broken).
        const resultsWrap = document.getElementById('techLabResultsWrap');
        if (resultsWrap) resultsWrap.classList.remove('display-none');
        const startHint = document.getElementById('techLabStartHint');
        if (startHint) startHint.classList.add('display-none');

        // Run both engine passes in parallel.
        let engineBeatenBy = [];
        let engineBeats    = [];
        try {
            [engineBeatenBy, engineBeats] = await Promise.all([
                _findTechsForCard(target.key, target.name),
                _findThingsThisCardBeats(target.key, target.name),
            ]);
        } catch (e) {
            _devLog('lookup failed:', e && e.message);
        }

        const ov = _getTargetOverrides(target.key);
        const beatenByTechs = _applyOverridesToTechs(engineBeatenBy, ov.beatenBy);
        const beatsTechs    = _applyOverridesToTechs(engineBeats,    ov.beats);

        _renderTechList(beatenByList, beatenByTechs, 'beatenBy',
            _t('techLab.noBeatenBy', 'No card-text counter detected. Click "+ Add missing" if you know one the engine missed.'));
        _renderTechList(beatsList, beatsTechs, 'beats',
            _t('techLab.noBeats', 'No meta cards this card beats via card-text interactions. Click "+ Add missing" to register one.'));
        _wireCardListInteractions(beatenByList);
        _wireCardListInteractions(beatsList);

        const addBeatenByBtn = document.getElementById('techLabAddBeatenByBtn');
        const addBeatsBtn    = document.getElementById('techLabAddBeatsBtn');
        const resetBtn       = document.getElementById('techLabResetBtn');
        if (addBeatenByBtn) addBeatenByBtn.disabled = false;
        if (addBeatsBtn)    addBeatsBtn.disabled    = false;
        if (resetBtn)       resetBtn.disabled       = false;
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

    let _addDirection = 'beatenBy';

    function openAddMissing(direction) {
        if (!_target) return;
        _addDirection = (direction === 'beats') ? 'beats' : 'beatenBy';
        const overlay  = document.getElementById('techLabAddOverlay');
        const input    = document.getElementById('techLabAddSearch');
        const dropdown = document.getElementById('techLabAddDropdown');
        const title    = document.getElementById('techLabAddTitle');
        const intro    = document.getElementById('techLabAddIntro');
        if (!overlay || !input || !dropdown) return;
        overlay.classList.remove('display-none');
        overlay.classList.add('show');
        if (title) {
            title.textContent = (_addDirection === 'beats')
                ? _t('techLab.addModalTitleBeats', 'Add a meta card this card is good against')
                : _t('techLab.addModalTitle', 'Add a tech the engine missed');
        }
        if (intro) {
            intro.textContent = (_addDirection === 'beats')
                ? _t('techLab.addModalIntroBeats', 'Pick a meta card that the selected target counters. It will appear in the "good against" list and persist across sessions.')
                : _t('techLab.addModalIntro', 'Search the current meta for the card you want to register as a tech against the selected target. It will show up in the list immediately and persist across sessions.');
        }
        input.value = '';
        dropdown.innerHTML = '';
        setTimeout(() => input.focus(), 30);
        input.oninput = (e) => {
            _renderPickerResults('techLabAddSearch', 'techLabAddDropdown', e.target.value, (pick) => {
                _addMissingTech(_target.key, _addDirection, pick.name, pick.key, '');
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
        const addBeatenBy = document.getElementById('techLabAddBeatenByBtn');
        if (addBeatenBy) addBeatenBy.addEventListener('click', () => openAddMissing('beatenBy'));
        const addBeats = document.getElementById('techLabAddBeatsBtn');
        if (addBeats) addBeats.addEventListener('click', () => openAddMissing('beats'));
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
