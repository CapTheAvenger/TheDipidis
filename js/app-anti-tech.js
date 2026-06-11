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
            const wr = parseLocaleNumber(r.win_rate || '0', 0);
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

    // Build archetype → cards map from window.currentMetaAnalysisData.
    // Mirrors the helper in app-current-meta-analysis.js so the
    // anti-tech modal can run standalone (before the user-vs-vanilla
    // panel has been opened in this session). Cached on window with
    // a row-count tag so it rebuilds when new analysis data arrives.
    function _buildArchetypeCardMapLocal() {
        const rows = (typeof window !== 'undefined' && window.currentMetaAnalysisData) || [];
        const cacheTag = `rows=${rows.length}`;
        if (window._archetypeCardMap && window._archetypeCardMapTag === cacheTag) {
            return window._archetypeCardMap;
        }
        const map = new Map();
        for (const r of rows) {
            if (!r) continue;
            const arch = String(r.archetype || '').trim().toLowerCase();
            if (!arch) continue;
            const set = String(r.set_code || '').toUpperCase().trim();
            const num = String(r.set_number || '').trim();
            if (!set || !num) continue;
            const key = `${set}|${num}`;
            const name = String(r.card_name || '').trim();
            if (!map.has(arch)) map.set(arch, []);
            map.get(arch).push({ key, name });
        }
        window._archetypeCardMap = map;
        window._archetypeCardMapTag = cacheTag;
        return map;
    }

    // Run the capability engine inverted: pass ALL unique meta cards
    // as the "user deck" (haystack of potential attackers) and the
    // target archetypes as the defender side. Returns the same shape
    // as the active_threats path so both sources fold into one list.
    //
    // This is what surfaces Mega Lopunny ex (PFL|84) as a tech vs
    // Crustle (DRI|12) — its Spiky Hopper attack has the
    // `attack.ignores_effects` tag which bypasses Crustle's
    // `ability.ex_immunity` (Mysterious Rock Inn). active_threats.json
    // doesn't classify Lopunny because the bypass isn't one of the
    // four narrow threat categories (hand_disruption, retreat_lock,
    // ability_lock, bench_damage) — but the card-text engine catches
    // it via the taxonomy + interaction matrix in data/card_capability_*.
    async function _computeCapabilityTechSuggestions() {
        if (typeof window.CardCapabilityEngine === 'undefined') {
            _devLog('CardCapabilityEngine missing — skipping capability path');
            return [];
        }
        if (typeof window._loadCardEffectsIndex !== 'function') return [];
        const cardEffectsIndex = await window._loadCardEffectsIndex();
        if (!cardEffectsIndex || !cardEffectsIndex.size) return [];
        const archetypeCardMap = _buildArchetypeCardMapLocal();
        if (archetypeCardMap.size === 0) {
            _devLog('archetypeCardMap empty — currentMetaAnalysisData not loaded yet');
            return [];
        }

        // Restrict the defender side to the user's selected targets
        const targetArchetypes = new Map();
        for (const targetKey of _targets) {
            const cards = archetypeCardMap.get(targetKey);
            if (cards && cards.length) {
                targetArchetypes.set(_targetDisplay.get(targetKey) || targetKey, cards);
            }
        }
        if (targetArchetypes.size === 0) return [];

        // Build the haystack: every unique card that appears in some
        // current-meta deck. Dedupe by SET|number so the engine
        // doesn't waste work re-extracting tags for the same print.
        const seen = new Set();
        const allMetaCards = [];
        for (const [, cards] of archetypeCardMap.entries()) {
            for (const c of cards) {
                if (seen.has(c.key)) continue;
                seen.add(c.key);
                allMetaCards.push(c);
            }
        }

        const lang = (typeof getLang === 'function') ? getLang() : 'en';
        let detected;
        try {
            detected = await window.CardCapabilityEngine.detectMatchups({
                userDeckCards: allMetaCards,
                archetypeCardMap: targetArchetypes,
                cardEffectsIndex,
                lang,
            });
        } catch (e) {
            _devLog('capability detectMatchups failed:', e && e.message);
            return [];
        }
        if (!detected || detected.size === 0) return [];

        // Roll up the per-opponent matchups into per-attacker-card
        // aggregations so the same physical card surfaces ONCE in the
        // picker even if it wins against multiple targets.
        const byCard = new Map();
        const cardIdByName = new Map();
        for (const c of allMetaCards) {
            const k = c.name.toLowerCase();
            if (!cardIdByName.has(k)) cardIdByName.set(k, c.key);
        }
        for (const [targetName, matchups] of detected.entries()) {
            for (const m of matchups) {
                if (m.result !== 'attacker_wins') continue;
                const key = m.attackerCard.toLowerCase();
                let entry = byCard.get(key);
                if (!entry) {
                    entry = {
                        name: m.attackerCard,
                        cardId: cardIdByName.get(key) || null,
                        threatCategories: new Set(),
                        targets: new Set(),
                        counterScore: 0,
                        source: 'capability',
                    };
                    byCard.set(key, entry);
                }
                // Use the interaction's defender tag as a human-
                // readable category label. attack.ignores_effects →
                // ability.ex_immunity becomes "card-text: ex_immunity"
                const defTag = String(m.interactionTag || '').split('→')[1] || '';
                const label = defTag ? `card-text: ${defTag.replace(/^ability\./, '').replace(/_/g, ' ')}` : 'card-text tech';
                entry.threatCategories.add(label);
                entry.targets.add(targetName);
            }
        }
        return Array.from(byCard.values());
    }

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
                            // Track card_id so the suggestion list can
                            // render a thumbnail. First match wins —
                            // each counter card normally has one
                            // canonical print listed in the JSON.
                            cardId: String(c.card_id || '').trim(),
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

        // Merge in card-text capability tech suggestions. Same
        // entry shape as the active_threats path so the renderer
        // doesn't care which source produced a row. If a card
        // appears in both sources, the active_threats classification
        // wins (already in byCard) and the capability targets/cats
        // get folded in as additional context.
        let capabilitySuggestions = [];
        try {
            capabilitySuggestions = await _computeCapabilityTechSuggestions();
        } catch (e) {
            _devLog('capability suggestion error:', e && e.message);
        }
        for (const cap of capabilitySuggestions) {
            const key = cap.name.toLowerCase();
            const existing = byCard.get(key);
            if (existing) {
                cap.threatCategories.forEach(c => existing.threatCategories.add(c));
                cap.targets.forEach(t => existing.targets.add(t));
                if (!existing.cardId && cap.cardId) existing.cardId = cap.cardId;
            } else {
                byCard.set(key, cap);
            }
        }

        // Archetype-aware filter — STRICT pool-only mode.
        //
        // User feedback after the looser energy-compat heuristic let
        // through cards that don't actually fit the deck:
        // > "Was sind das denn für Vorschläge für n's zoroark?
        //    Guck dir mal die Karten in zoroark an die gespielt
        //    werden [...] Wo soll denn da das dudunsparce ex
        //    herkommen oder Iron crown"
        //
        // Dudunsparce ex (Colorless) and Iron Crown ex (Psychic)
        // both passed the previous filter because the user's deck
        // includes Psychic energy and Colorless cards were
        // universally allowed. But neither card actually appears in
        // ANY N's Zoroark deck list in the meta CSV — they're from
        // unrelated archetypes (Dudunsparce solo, Future Box).
        //
        // New rule: a suggestion passes ONLY if the card is in the
        // user's archetype's existing card pool (matched by name,
        // case-insensitive). Pool membership is derived from
        // current_meta_card_data.csv — every print of every card
        // that any meta deck of this archetype is known to run.
        //
        // For broader exploration the user can go to Tech Lab, or
        // manually + Add missing in step 2. Build-vs stays
        // opinionated and only surfaces proven-fit cards.
        const userArch = _getCurrentArchetype();
        if (userArch) {
            const archCards = _archetypeCardsFromMap(userArch);
            const archPoolNames = new Set(archCards.map(c => c.name.toLowerCase()));
            // Defense: when no pool data is available for the active
            // source (e.g. user is on cityLeague but currentMeta data
            // isn't loaded), skip the filter so the picker still
            // surfaces candidates rather than going empty. The user
            // can manually + Add missing the ones that fit their
            // deck.
            if (archPoolNames.size === 0) {
                _devLog('archetype pool empty for', userArch, '— skipping filter');
            } else {
                const before = byCard.size;
                for (const [key, entry] of Array.from(byCard.entries())) {
                    if (!archPoolNames.has(entry.name.toLowerCase())) {
                        byCard.delete(key);
                    }
                }
                _devLog('archetype pool-only filter', `${userArch}`,
                    'pool size=', archPoolNames.size,
                    `${before} → ${byCard.size}`);
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

    // Look up the user's currently-loaded archetype for the active
    // deck-builder source. The three sources keep their archetype
    // in different globals — current-meta is the common case but
    // build-vs is also reachable from city-league and past-meta.
    function _getCurrentArchetype() {
        if (typeof window === 'undefined') return null;
        if (_source === 'currentMeta') return window.currentMetaArchetype || null;
        if (_source === 'cityLeague') return window.currentCityLeagueArchetype || null;
        if (_source === 'pastMeta')   return window.pastMetaCurrentArchetype || null;
        return null;
    }

    // Helper — get the cards array for an archetype name from the
    // archetypeCardMap, case-insensitive.
    function _archetypeCardsFromMap(archName) {
        const map = (typeof window !== 'undefined' && window._archetypeCardMap)
            ? window._archetypeCardMap
            : _buildArchetypeCardMapLocal();
        return map.get(String(archName || '').toLowerCase()) || [];
    }

    // Infer the deck's energy types from the Basic Energy cards
    // present in the archetype's pool. Energy card names follow the
    // pattern "<Color> Energy" — e.g. "Darkness Energy",
    // "Fire Energy". Extract the color prefix. Special Energy cards
    // (Legacy, Reverse, Counter, etc.) are ignored — they're
    // typically universal so don't narrow the energy set.
    function _getArchetypeEnergyTypes(archName) {
        const rows = (typeof window !== 'undefined' && window.currentMetaAnalysisData) || [];
        const archLower = String(archName || '').toLowerCase();
        const out = new Set();
        for (const r of rows) {
            if (!r) continue;
            if (String(r.archetype || '').trim().toLowerCase() !== archLower) continue;
            const type = String(r.type || '').trim();
            if (type !== 'Basic Energy') continue;
            const name = String(r.card_name || '').trim();
            const m = name.match(/^(\w+)\s+Energy$/i);
            if (m) out.add(m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase());
        }
        return out;
    }

    // Build Limitless CDN URL from a SET|number card_id.
    // - Numeric numbers get zero-padded to 3 digits (PFL|84 → PFL_084)
    // - Non-numeric prints (TG12, SV23, etc.) stay as-is
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
            // Thumbnail with on-tap full-card zoom. Wrapped in its own
            // span so the tap doesn't toggle the checkbox label.
            const imgUrl = _cardImageUrl(c.cardId);
            const safeImgUrl = imgUrl ? imgUrl.replace(/"/g, '&quot;') : '';
            const thumb = imgUrl
                ? `<span class="anti-tech-card-thumb-wrap" data-card-img="${safeImgUrl}" data-card-name="${safe}" role="button" aria-label="Zoom card ${safe}" tabindex="0"><img class="anti-tech-card-thumb" src="${safeImgUrl}" alt="${safe}" loading="lazy"></span>`
                : `<span class="anti-tech-card-thumb-wrap anti-tech-card-thumb-fallback" aria-hidden="true">?</span>`;
            return `<label class="anti-tech-card-item${isOn ? ' is-selected' : ''}">
                <input type="checkbox" class="anti-tech-card-check" data-card="${safe}" ${isOn ? 'checked' : ''}>
                ${thumb}
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
        // Tap on the thumbnail opens the full-resolution single-card
        // modal so the user can read the card text without leaving the
        // wizard. Stop propagation so the surrounding <label> doesn't
        // toggle the checkbox when the user is just trying to inspect.
        list.querySelectorAll('.anti-tech-card-thumb-wrap[data-card-img]').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const img = el.dataset.cardImg;
                const name = el.dataset.cardName || '';
                if (img && typeof window.showSingleCard === 'function') {
                    window.showSingleCard(img, name);
                }
            });
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

    // Walk the "Evolves from X" chain on a card record and return
    // the basic Pokemon's name. For a Mega Pokemon "Evolves from
    // Buneary" returns "Buneary". For a Stage 2 "Evolves from
    // Hisuian Decidueye" (Stage 1) it recurses: looks up Hisuian
    // Decidueye, sees "Evolves from Hisuian Dartrix" (Stage 1),
    // recurses again, gets to "Basic" → returns the basic name.
    // Returns null if the chain can't be walked.
    function _walkEvolutionChainToBasic(rec, cardEffectsIndex, depth) {
        if (!rec || depth > 4) return null;
        const ct = String(rec.card_type || '').trim();
        if (/^basic\b/i.test(ct)) return rec.name;
        const m = ct.match(/^Evolves\s+from\s+(.+)$/i);
        if (!m) return null;
        const prevName = m[1].trim().toLowerCase();
        if (!cardEffectsIndex || !cardEffectsIndex.byName) return prevName;
        const prevRec = cardEffectsIndex.byName.get(prevName);
        if (!prevRec) return prevName; // basic name as best-effort
        return _walkEvolutionChainToBasic(prevRec, cardEffectsIndex, depth + 1);
    }

    // For each selected attacker, find its evolution-chain basic and
    // include it in the techSlots payload too. Otherwise a user who
    // picks "Mega Lopunny ex" gets a Lopunny pinned but no Buneary
    // to evolve from — the build is unplayable. The basic gets a
    // "[auto-included for X]" trace in the devLog so the user can
    // tell where it came from.
    async function _expandSelectionWithBasics(selectedSuggestions) {
        if (typeof window._loadCardEffectsIndex !== 'function') return selectedSuggestions.map(s => s.name);
        let cardEffectsIndex = null;
        try { cardEffectsIndex = await window._loadCardEffectsIndex(); }
        catch (_) { cardEffectsIndex = null; }
        if (!cardEffectsIndex) return selectedSuggestions.map(s => s.name);
        const out = [];
        const seenLower = new Set();
        const pushUnique = (name) => {
            const k = String(name || '').toLowerCase();
            if (!k || seenLower.has(k)) return;
            seenLower.add(k);
            out.push(name);
        };
        for (const s of selectedSuggestions) {
            pushUnique(s.name);
            const rec = s.cardId && cardEffectsIndex.bySetNumber
                ? cardEffectsIndex.bySetNumber.get(String(s.cardId).toUpperCase().trim())
                : null;
            if (!rec) continue;
            const basic = _walkEvolutionChainToBasic(rec, cardEffectsIndex, 0);
            if (basic && basic.toLowerCase() !== s.name.toLowerCase()) {
                pushUnique(basic);
                _devLog('auto-included basic', basic, 'for', s.name);
            }
        }
        return out;
    }

    async function confirmAntiTechBuild() {
        _devLog('confirmAntiTechBuild — selected:', _selectedCards.size, 'cards');
        if (_selectedCards.size === 0) return;
        const source = _source || 'currentMeta';
        const selectedSuggestions = _suggestedCards
            .filter(c => _selectedCards.has(c.name.toLowerCase()));
        const aggression = _readAggression();
        closeAntiTechModal();

        // Auto-include the basic for any selected Stage 1/2/Mega card
        // so the deck actually has the evolution line to play. User:
        // "wenn ich Mega lopunny auswähle dann muss natürlich auch
        // das passende Basic dazu ausgewählt werden ansonsten
        // funktioniert es ja nicht."
        const expandedNames = await _expandSelectionWithBasics(selectedSuggestions);
        _devLog('expanded names', expandedNames);

        // Write the selected cards into techSlots BEFORE running the
        // generator. techSlots fold into Stage 0 of autoComplete-
        // Consistency so these cards are force-included no matter
        // what the consistency-score gate says.
        if (typeof window.techSlotsFromArray === 'function') {
            window.techSlotsFromArray(source, expandedNames.slice(0, TECH_SLOTS_HARD_CAP));
            if (typeof renderTechSlotsUI === 'function') renderTechSlotsUI(source);
            if (typeof showToast === 'function') {
                const tpl = _t('antiTech.toastInjected', 'Loaded {n} tech card(s) into your slots — generating build now.');
                showToast(tpl.replace('{n}', expandedNames.length), 'info', 2500);
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
