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
    let _taxonomy = null;        // cached taxonomy JSON (loaded once)
    let _ready = false;

    function _isExCardName(name) {
        return /\bex\b/i.test(String(name || ''));
    }

    async function _loadTaxonomy() {
        if (_taxonomy) return _taxonomy;
        try {
            const resp = await fetch('./data/card_capability_taxonomy.json', { cache: 'no-cache' });
            _taxonomy = resp.ok ? await resp.json() : { tags: {} };
        } catch (_) {
            _taxonomy = { tags: {} };
        }
        return _taxonomy;
    }

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
        // Non-EX bucket (auto-derived "ability does not apply"
        // suggestions) — user can mark individual entries as not
        // a tech and they get hidden in subsequent renders.
        if (!raw.nonEx)    raw.nonEx    = { hidden: [] };
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
        // Index of allCardsDatabase by SET|NUM for German-name lookup.
        // The meta CSV only has `card_name` (English/locale-mixed); the
        // German name lives on allCardsDatabase.name_de.
        const dbIndex = (typeof window !== 'undefined' && window.cardIndexBySetNumber) || null;
        for (const r of rows) {
            if (!r) continue;
            const set = String(r.set_code || '').toUpperCase().trim();
            const num = String(r.set_number || '').trim();
            const name = String(r.card_name || '').trim();
            if (!set || !num || !name) continue;
            const key = `${set}|${num}`;
            if (seen.has(key)) continue;
            seen.add(key);
            let nameDe = '';
            if (dbIndex) {
                const dbCard = dbIndex.get(key) || dbIndex.get(`${set}-${num}`);
                if (dbCard) nameDe = String(dbCard.name_de || '').trim();
            }
            out.push({ key, name, name_de: nameDe });
        }
        _allMetaCards = out;
        _allMetaCardSet = seen;
        _devLog('haystack rebuilt:', out.length, 'unique meta cards');
    }

    // Ensures `window.currentMetaAnalysisData` is loaded before the
    // Tech Lab engine runs. The Tech Lab is reachable WITHOUT first
    // opening the Current Meta deck analysis (PR #130 moved it out
    // of the deck-builder wrapper) so the auto-trigger that
    // normally fires on tab-open might not have run yet. Without
    // this guard, the haystack is empty → engine produces zero
    // techs → user sees "No card-text counter detected" on every
    // target. Idempotent — early-returns when data is already there.
    let _ensureMetaDataPromise = null;
    async function _ensureMetaDataLoaded() {
        if (Array.isArray(window.currentMetaAnalysisData) && window.currentMetaAnalysisData.length > 0) {
            return;
        }
        if (_ensureMetaDataPromise) return _ensureMetaDataPromise;
        _ensureMetaDataPromise = (async () => {
            _devLog('currentMetaAnalysisData missing — lazy-loading');
            try {
                if (typeof window.loadCurrentMetaRowsWithFallback !== 'function'
                    && typeof loadCurrentMetaRowsWithFallback === 'function') {
                    window.loadCurrentMetaRowsWithFallback = loadCurrentMetaRowsWithFallback;
                }
                if (typeof window.loadCurrentMetaRowsWithFallback === 'function') {
                    const data = await window.loadCurrentMetaRowsWithFallback();
                    if (Array.isArray(data) && data.length > 0) {
                        window.currentMetaAnalysisData = data;
                        _devLog('lazy-loaded', data.length, 'rows');
                        _rebuildMetaCards();
                    } else {
                        _devLog('loader returned empty');
                    }
                } else {
                    _devLog('loadCurrentMetaRowsWithFallback unavailable on window');
                }
            } catch (e) {
                _devLog('lazy-load failed:', e && e.message);
            }
        })();
        return _ensureMetaDataPromise;
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
        if (_allMetaCards.length === 0) {
            await _ensureMetaDataLoaded();
            _rebuildMetaCards();
        }
        if (_allMetaCards.length === 0) {
            _devLog('haystack still empty after lazy-load — bailing');
            return [];
        }

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
        // Roll up to per-attacker-card entries.
        const byCard = new Map();
        const cardIdByName = new Map();
        for (const c of _allMetaCards) {
            const k = c.name.toLowerCase();
            if (!cardIdByName.has(k)) cardIdByName.set(k, c.key);
        }
        if (detected && detected.size > 0) {
            for (const matchups of detected.values()) {
                for (const m of matchups) {
                    if (m.result !== 'attacker_wins') continue;
                    const key = m.attackerCard.toLowerCase();
                    if (byCard.has(key)) continue;
                    byCard.set(key, {
                        name:       m.attackerCard,
                        cardId:     cardIdByName.get(key) || null,
                        narrative:  m.narrative,
                        confidence: m.confidence,
                        attackSource: m.attackerSource && m.attackerSource.name,
                        hidden:     false,
                    });
                }
            }
        }

        // Pass 2: defensive counters. Meta cards whose defender tag
        // shuts off one of the target's attacker tags (e.g. Battle Cage's
        // bench-protection blocks Dragapult ex Phantom Dive). detectMatchups
        // has a fixed direction so we resolve this branch directly via the
        // interaction matrix.
        const engine = window.CardCapabilityEngine;
        const targetRec = cardEffectsIndex.bySetNumber
            && cardEffectsIndex.bySetNumber.get(String(targetKey).toUpperCase().trim());
        if (targetRec) {
            const targetTags = engine.extractTags(targetRec, targetKey);
            const targetAttackerTags = new Set(
                targetTags.filter(t => t.tag.startsWith('attack.')).map(t => t.tag)
            );
            if (targetAttackerTags.size > 0) {
                let interactionsData = null;
                try {
                    const resp = await fetch('./data/card_capability_interactions.json', { cache: 'no-cache' });
                    interactionsData = resp.ok ? await resp.json() : null;
                } catch (_) { /* network/parse failure → skip pass 2 */ }
                const interactions = (interactionsData && interactionsData.interactions) || [];
                const blockingByDefenderTag = new Map();   // defenderTag → interaction
                for (const ix of interactions) {
                    if ((ix.result || 'attacker_wins') !== 'defender_wins') continue;
                    if (!targetAttackerTags.has(ix.attacker)) continue;
                    blockingByDefenderTag.set(ix.defender, ix);
                }
                if (blockingByDefenderTag.size > 0) {
                    const lang = (typeof getLang === 'function') ? getLang() : 'en';
                    for (const c of _allMetaCards) {
                        if (c.key === targetKey) continue;
                        const rec = cardEffectsIndex.bySetNumber.get(String(c.key).toUpperCase().trim());
                        if (!rec) continue;
                        const key = rec.name.toLowerCase();
                        if (byCard.has(key)) continue;
                        const tags = engine.extractTags(rec, c.key);
                        for (const t of tags) {
                            const ix = blockingByDefenderTag.get(t.tag);
                            if (!ix) continue;
                            const tpl = (lang === 'de' ? (ix.narrative_de || ix.narrative_en) : ix.narrative_en) || '';
                            const attackerSrc = (targetTags.find(tt => tt.tag === ix.attacker) || {}).source || {};
                            const narrative = tpl
                                .replace('{attacker_name}', targetName)
                                .replace('{attacker_source}', attackerSrc.name || '')
                                .replace('{defender_name}', rec.name)
                                .replace('{defender_ability}', t.source && t.source.name || rec.name);
                            byCard.set(key, {
                                name:       rec.name,
                                cardId:     c.key,
                                narrative,
                                confidence: t.confidence,
                                attackSource: t.source && t.source.name,
                                hidden:     false,
                            });
                            break;
                        }
                    }
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
        if (_allMetaCards.length === 0) {
            await _ensureMetaDataLoaded();
            _rebuildMetaCards();
        }
        if (_allMetaCards.length === 0) {
            _devLog('haystack still empty after lazy-load — bailing');
            return [];
        }

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

    // Render a tech grid (compact tiles). Direction is 'beatenBy' or
    // 'beats' — passed through to the reject/remove buttons so each
    // section has independent override storage. Full narrative goes
    // into the tile's title attribute (hover/long-press tooltip) so
    // the grid stays compact while keeping the rule explanation
    // accessible per card.
    function _renderTechGrid(listEl, techs, direction, emptyText) {
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
            const safeNarr = _escapeHtml(tech.narrative || '');
            const thumb = imgUrl
                ? `<button class="tech-lab-grid-thumb" data-card-img="${safeImg}" data-card-name="${safeName}" aria-label="Zoom ${safeName}"><img src="${safeImg}" alt="${safeName}" loading="lazy"></button>`
                : `<span class="tech-lab-grid-thumb tech-lab-thumb-fallback" aria-hidden="true">?</span>`;
            // Reject / remove action moved BELOW the card with
            // clear text — the previous overlay-X confused users
            // ("the X is too big and unclear" — feedback after
            // PR #128). Full-width pill button under the tile.
            const action = tech.isUserAdded
                ? `<button class="tech-lab-card-action tech-lab-card-action-remove" data-card="${safeName}" data-dir="${direction}">${_escapeHtml(_t('techLab.removeAddedBtn', 'Remove'))}</button>`
                : `<button class="tech-lab-card-action tech-lab-card-action-reject" data-card="${safeName}" data-dir="${direction}">${_escapeHtml(_t('techLab.notTechBtn', '✗ Not a tech'))}</button>`;
            return `<li class="tech-lab-grid-tile tech-lab-grid-${confCls}${tech.isUserAdded ? ' tech-lab-grid-user' : ''}" title="${safeNarr}">
                ${thumb}
                <div class="tech-lab-grid-name">${safeName}</div>
                ${tech.attackSource ? `<div class="tech-lab-grid-source">${_escapeHtml(tech.attackSource)}</div>` : ''}
                <span class="tech-lab-grid-conf tech-lab-conf-${confCls}">${_escapeHtml(confLabel)}</span>
                ${action}
            </li>`;
        }).join('');
    }

    // Legacy single-list renderer kept as a thin wrapper so internal
    // callers don't have to swap signatures. Just delegates to grid.
    function _renderTechList(listEl, techs, direction, emptyText) {
        _renderTechGrid(listEl, techs, direction, emptyText);
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
        // Cover both the old overlay button class (.tech-lab-card-thumb
        // — used elsewhere) and the grid thumbnails. data-card-img
        // is the discriminator.
        listEl.querySelectorAll('[data-card-img]').forEach(btn => {
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
        // New button-below-tile classes (replacing the corner-X).
        // Direction "nonEx" routes through the same _hideTech helper
        // — added a nonEx bucket to _getTargetOverrides earlier so
        // the override list survives across sessions like beatenBy
        // and beats already do.
        listEl.querySelectorAll('.tech-lab-card-action-reject').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!_target) return;
                _hideTech(_target.key, btn.dataset.dir, btn.dataset.card);
                _renderTechsFor(_target);
            });
        });
        listEl.querySelectorAll('.tech-lab-card-action-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!_target) return;
                _removeAddedTech(_target.key, btn.dataset.dir, btn.dataset.card);
                _renderTechsFor(_target);
            });
        });
    }

    // Look up the target card's tags split by side (attacker /
    // defender) so the renderer can pair each direction with the
    // right plain-language summary from the taxonomy.
    async function _getTargetTags(targetKey) {
        const engine = window.CardCapabilityEngine;
        if (typeof engine === 'undefined') return { attacker: [], defender: [] };
        if (typeof window._loadCardEffectsIndex !== 'function') return { attacker: [], defender: [] };
        const idx = await window._loadCardEffectsIndex();
        if (!idx || !idx.bySetNumber) return { attacker: [], defender: [] };
        const rec = idx.bySetNumber.get(String(targetKey).toUpperCase().trim());
        if (!rec) return { attacker: [], defender: [] };
        await engine.load();
        const tags = engine.extractTags(rec, targetKey);
        return {
            attacker: tags.filter(t => t.tag.startsWith('attack.')),
            defender: tags.filter(t => t.tag.startsWith('ability.')),
        };
    }

    // Build the summary banner HTML for a direction. Uses
    // summary_en/summary_de from the taxonomy. Empty string when the
    // target has no tags on that side — the section's regular
    // empty-state handles that case.
    async function _renderSummary(bannerEl, tags) {
        if (!bannerEl) return;
        if (!tags || tags.length === 0) { bannerEl.innerHTML = ''; return; }
        const taxonomy = await _loadTaxonomy();
        const lang = (typeof getLang === 'function') ? getLang() : 'en';
        const summaries = [];
        const seen = new Set();
        for (const t of tags) {
            if (seen.has(t.tag)) continue;
            seen.add(t.tag);
            const meta = (taxonomy.tags || {})[t.tag];
            if (!meta) continue;
            const text = (lang === 'de' ? meta.summary_de : meta.summary_en) || meta.summary_en || '';
            if (!text) continue;
            summaries.push(`<li class="tech-lab-summary-line"><span class="tech-lab-summary-tag">${_escapeHtml(t.tag)}</span><span class="tech-lab-summary-text">${_escapeHtml(text)}</span></li>`);
        }
        bannerEl.innerHTML = summaries.length
            ? `<ul class="tech-lab-summary-list">${summaries.join('')}</ul>`
            : '';
    }

    // Viability heuristic for the "non-EX implicit-immunes" bucket.
    // After 2026-05 full update, ~79% of records have real attack
    // cost arrays. The preferred path uses cost directly; the
    // damage-as-proxy fallback only fires for records where the
    // scraper didn't get cost (legacy SWSH/older sets).
    //
    // Damage thresholds apply in BOTH paths — a 20-damage @ 1-energy
    // attack (Hoothoot Flap, Chien-Pao Strafe) is still not a
    // credible meta tech even if the cost is low.
    //
    // Filter — must meet ALL:
    //   1. card_type starts with "Basic"
    //   2. attack text doesn't mention a coin flip (unreliable damage)
    //   3. EITHER (real cost ≤ 2) OR (no cost data, falling back to
    //      damage-as-proxy where 60-100 static implies 1-2 energy)
    //   4. damage qualifies via ONE of:
    //      a. static base ≥ 60
    //      b. "+" bonus, base ≥ 40 (relaxed in cost path, 50-80 in proxy)
    //      c. "×" multiplier, base ≥ 20 (scaling attacks ramp up)
    function _isViableNonExAttacker(rec) {
        if (!rec) return false;
        const cardType = String(rec.card_type || '').toLowerCase();
        if (!cardType.startsWith('basic')) return false;
        for (const a of (rec.attacks || [])) {
            const cost = Array.isArray(a.cost) ? a.cost : [];
            const dmgStr = String(a.damage || '').trim();
            if (!dmgStr) continue;
            const baseMatch = dmgStr.match(/^(\d+)/);
            if (!baseMatch) continue;
            const base = parseInt(baseMatch[1], 10);
            if (!Number.isFinite(base)) continue;
            const text = String(a.text || '').toLowerCase();
            if (/\bflip\s+(?:a\s+|\d+\s+)?coins?\b/.test(text)) continue;

            const isMult = /[×x]/i.test(dmgStr);
            const isPlus = /\+/.test(dmgStr);

            if (cost.length > 0) {
                if (cost.length > 2) continue;
                if (isMult && base >= 20) return true;
                if (isPlus && base >= 40) return true;
                if (base >= 60) return true;
                continue;
            }

            // Proxy fallback (no cost data) — damage range implies energy cost
            if (isMult) { if (base >= 20) return true; continue; }
            if (isPlus) { if (base >= 50 && base <= 80) return true; continue; }
            if (base >= 60 && base <= 100) return true;
        }
        return false;
    }

    // For tags with affects_subset === "ex_attackers" (e.g. Crustle's
    // Mysterious Rock Inn), surface viable non-EX meta attackers —
    // Basic Pokemon with low-cost / high-damage attacks. User
    // explicitly excluded utility cards like Eevee / Scatterbug.
    async function _renderNonExBucket(wrapEl, tags) {
        if (!wrapEl) return;
        if (!tags || tags.length === 0) { wrapEl.innerHTML = ''; return; }
        const taxonomy = _taxonomy || { tags: {} };
        const triggers = tags.filter(t => {
            const meta = (taxonomy.tags || {})[t.tag];
            return meta && meta.affects_subset === 'ex_attackers';
        });
        if (triggers.length === 0) { wrapEl.innerHTML = ''; return; }

        // Need the card-effects index to read attack costs and damage
        // — that's how the viability filter knows Passimian belongs in
        // the bucket but Eevee/Scatterbug don't.
        let cardEffectsIndex = null;
        if (typeof window._loadCardEffectsIndex === 'function') {
            try { cardEffectsIndex = await window._loadCardEffectsIndex(); }
            catch (_) { cardEffectsIndex = null; }
        }
        if (!cardEffectsIndex || !cardEffectsIndex.bySetNumber) {
            wrapEl.innerHTML = ''; return;
        }

        const rows = (typeof window !== 'undefined' && window.currentMetaAnalysisData) || [];
        const byCard = new Map();
        for (const r of rows) {
            if (!r) continue;
            const name = String(r.card_name || '').trim();
            if (!name || _isExCardName(name)) continue;
            const set  = String(r.set_code || '').toUpperCase().trim();
            const num  = String(r.set_number || '').trim();
            if (!set || !num) continue;
            const key = `${set}|${num}`;
            const rec = cardEffectsIndex.bySetNumber.get(key);
            if (!_isViableNonExAttacker(rec)) continue;
            const inclusion = parseFloat(String(r.deck_inclusion_count || 0).replace(',', '.')) || 0;
            const existing = byCard.get(name.toLowerCase());
            if (!existing || inclusion > existing.inclusion) {
                byCard.set(name.toLowerCase(), { key, name, inclusion });
            }
        }
        // Apply per-target non-EX hide overrides — user can mark
        // specific entries as "not a tech" via the button below
        // each tile and they stay hidden across sessions.
        const ov = _target ? _getTargetOverrides(_target.key) : { nonEx: { hidden: [] } };
        const nonExHidden = new Set((ov.nonEx && ov.nonEx.hidden || []).map(n => String(n).toLowerCase()));
        const sorted = Array.from(byCard.values())
            .filter(c => c.name.toLowerCase() !== (_target && _target.name.toLowerCase()))
            .filter(c => !nonExHidden.has(c.name.toLowerCase()))
            .sort((a, b) => b.inclusion - a.inclusion)
            .slice(0, 24);
        if (sorted.length === 0) { wrapEl.innerHTML = ''; return; }

        const lang = (typeof getLang === 'function') ? getLang() : 'en';
        const heading = (lang === 'de')
            ? _t('techLab.nonExHeading', 'Nicht-EX Angreifer (ignorieren die Fähigkeit)')
            : _t('techLab.nonExHeading', 'Non-EX attackers (ability does not apply)');
        const hint = (lang === 'de')
            ? _t('techLab.nonExHint', 'Diese Pokemon greifen normal an — die Fähigkeit blockt nur Pokemon-ex. Top {n} aus dem aktuellen Meta nach Deck-Inklusion.')
            : _t('techLab.nonExHint', 'These Pokemon attack normally — the ability only blocks Pokemon ex. Top {n} from the current meta by deck inclusion.');
        const tiles = sorted.map(c => {
            const img = _cardImageUrl(c.key);
            const safeName = _escapeHtml(c.name);
            const safeImg = img ? _escapeHtml(img) : '';
            const thumb = img
                ? `<button class="tech-lab-grid-thumb" data-card-img="${safeImg}" data-card-name="${safeName}" aria-label="Zoom ${safeName}"><img src="${safeImg}" alt="${safeName}" loading="lazy"></button>`
                : `<span class="tech-lab-grid-thumb tech-lab-thumb-fallback">?</span>`;
            return `<li class="tech-lab-grid-tile tech-lab-grid-nonex">
                ${thumb}
                <div class="tech-lab-grid-name">${safeName}</div>
                <button class="tech-lab-card-action tech-lab-card-action-reject" data-card="${safeName}" data-dir="nonEx">${_escapeHtml(_t('techLab.notTechBtn', '✗ Not a tech'))}</button>
            </li>`;
        }).join('');
        wrapEl.innerHTML = `
            <div class="tech-lab-nonex-header">
                <h5 class="tech-lab-nonex-title">${_escapeHtml(heading)}</h5>
                <p class="tech-lab-nonex-hint">${_escapeHtml(hint.replace('{n}', sorted.length))}</p>
            </div>
            <ul class="tech-lab-results tech-lab-grid-nonex-list">${tiles}</ul>`;
        // Wire thumbnail zoom + reject ("✗ Not a tech") on Non-EX
        // tiles. The reject persists the entry into the per-target
        // override store (nonEx.hidden) and re-renders the bucket.
        wrapEl.querySelectorAll('.tech-lab-grid-thumb[data-card-img]').forEach(btn => {
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
        wrapEl.querySelectorAll('.tech-lab-card-action-reject').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!_target) return;
                _hideTech(_target.key, 'nonEx', btn.dataset.card);
                // Re-render the non-EX section in place; the rest of
                // the page doesn't need to redraw.
                _renderNonExBucket(wrapEl, tags);
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
        const beatenBySummary = document.getElementById('techLabBeatenBySummary');
        const beatsSummary    = document.getElementById('techLabBeatsSummary');
        const beatenByNonEx   = document.getElementById('techLabBeatenByNonEx');
        const loadingHtml = `<li class="tech-lab-loading">${_escapeHtml(_t('techLab.loading', 'Searching meta…'))}</li>`;
        if (beatenByList) beatenByList.innerHTML = loadingHtml;
        if (beatsList)    beatsList.innerHTML    = loadingHtml;
        if (beatenBySummary) beatenBySummary.innerHTML = '';
        if (beatsSummary)    beatsSummary.innerHTML    = '';
        if (beatenByNonEx)   beatenByNonEx.innerHTML   = '';

        const resultsWrap = document.getElementById('techLabResultsWrap');
        if (resultsWrap) resultsWrap.classList.remove('display-none');
        const startHint = document.getElementById('techLabStartHint');
        if (startHint) startHint.classList.add('display-none');

        // Three parallel reads: engine direction A, engine direction
        // B, and the target's own tags (for summaries + non-EX bucket).
        let engineBeatenBy = [];
        let engineBeats    = [];
        let targetTags     = { attacker: [], defender: [] };
        try {
            [engineBeatenBy, engineBeats, targetTags] = await Promise.all([
                _findTechsForCard(target.key, target.name),
                _findThingsThisCardBeats(target.key, target.name),
                _getTargetTags(target.key),
            ]);
        } catch (e) {
            _devLog('lookup failed:', e && e.message);
        }

        const ov = _getTargetOverrides(target.key);
        const beatenByTechs = _applyOverridesToTechs(engineBeatenBy, ov.beatenBy);
        const beatsTechs    = _applyOverridesToTechs(engineBeats,    ov.beats);

        // Summaries — direction A explains what BLOCKS the target
        // (the target's defender tags); direction B explains what
        // the target ATTACKS THROUGH (the target's attacker tags).
        await _renderSummary(beatenBySummary, targetTags.defender);
        await _renderSummary(beatsSummary,    targetTags.attacker);

        _renderTechList(beatenByList, beatenByTechs, 'beatenBy',
            _t('techLab.noBeatenBy', 'No card-text counter detected. Click "+ Add missing" if you know one the engine missed.'));
        _renderTechList(beatsList, beatsTechs, 'beats',
            _t('techLab.noBeats', 'No meta cards this card beats via card-text interactions. Click "+ Add missing" to register one.'));
        _wireCardListInteractions(beatenByList);
        _wireCardListInteractions(beatsList);

        // Non-EX bucket — only renders when one of the target's
        // defender tags has affects_subset === 'ex_attackers'.
        await _renderNonExBucket(beatenByNonEx, targetTags.defender);

        const addBeatenByBtn = document.getElementById('techLabAddBeatenByBtn');
        const addBeatsBtn    = document.getElementById('techLabAddBeatsBtn');
        const resetBtn       = document.getElementById('techLabResetBtn');
        if (addBeatenByBtn) addBeatenByBtn.disabled = false;
        if (addBeatsBtn)    addBeatsBtn.disabled    = false;
        if (resetBtn)       resetBtn.disabled       = false;
    }

    // ── TARGET PICKER ────────────────────────────────────────────────

    async function _renderPickerResults(inputId, listId, query, onPick) {
        const list = document.getElementById(listId);
        if (!list) return;
        const q = String(query || '').trim().toLowerCase();
        if (!q || q.length < 1) { list.innerHTML = ''; return; }
        if (_allMetaCards.length === 0) _rebuildMetaCards();
        // Lazy-load currentMetaAnalysisData so the picker works even
        // when the user lands on Tech Lab without first opening the
        // Current Meta analysis. Without this the dropdown is empty
        // for fresh sessions.
        if (_allMetaCards.length === 0) {
            list.innerHTML = `<div class="tech-lab-picker-empty">${
                _escapeHtml(_t('techLab.loading', 'Loading meta data…'))
            }</div>`;
            await _ensureMetaDataLoaded();
            _rebuildMetaCards();
        }
        // Search across English name, German name, and set+number.
        // Set+number tolerates "ASC 39", "ASC-39", "ASC39", or just "ASC|39".
        const qNorm = q.replace(/[\s\-|]+/g, '');
        const matches = _allMetaCards
            .filter(c => {
                if (c.name && c.name.toLowerCase().includes(q)) return true;
                if (c.name_de && c.name_de.toLowerCase().includes(q)) return true;
                if (c.key && c.key.toLowerCase().replace(/[\s\-|]+/g, '').includes(qNorm)) return true;
                return false;
            })
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
        // Fire-and-forget pre-warm so the picker / engine don't pay
        // the lazy-load cost on the user's first interaction.
        _ensureMetaDataLoaded().catch(e => _devLog('pre-warm load failed:', e && e.message));
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
