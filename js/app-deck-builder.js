// app-deck-builder.js — extracted from app.js
// Part of Hausi's Pokemon TCG Analysis

// Bootstrap pending autosave payload from localStorage for optional restore flows.
(function() {
    try {
        const savedAutosave = localStorage.getItem('autosave_deck');
        if (!savedAutosave) return;

        const parsedAutosave = JSON.parse(savedAutosave);
        if (!parsedAutosave || typeof parsedAutosave !== 'object') return;

        const sources = ['cityLeague', 'currentMeta', 'pastMeta'];
        const hasAnyDeckCards = sources.some((source) => {
            const section = parsedAutosave[source];
            if (!section || typeof section !== 'object') return false;
            const deck = section.deck;
            if (!deck || typeof deck !== 'object' || Array.isArray(deck)) return false;
            return Object.keys(deck).length > 0;
        });

        if (hasAnyDeckCards) {
            window._pendingAutosave = parsedAutosave;
        }
    } catch (_) {
        // Ignore malformed autosave payloads.
    }
})();

// On reload we intentionally start fresh for temporary deck-builder state.
try { localStorage.removeItem('autosave_deck'); } catch (_) {}
        localStorage.removeItem('cityLeagueDeck');
        localStorage.removeItem('currentMetaDeck');
        localStorage.removeItem('pastMetaDeck');
        window.cityLeagueDeck = {};
        window.cityLeagueDeckOrder = [];
        window.currentCityLeagueArchetype = null;
        window.currentMetaDeck = {};
        window.currentMetaDeckOrder = [];
        window.currentMetaArchetype = null;
        window.pastMetaDeck = {};
        window.pastMetaDeckOrder = [];
        window.pastMetaCurrentArchetype = null;
        // Pinned cards — per source, set of normalized card names that the
        // user wants in every regenerated deck regardless of the
        // consistency-score gates. Count + best print are still chosen by
        // the algorithm (see Stage 0 in autoCompleteConsistency). State is
        // kept here as Sets and mirrored to localStorage by the
        // save*Deck() functions so pins survive Consistency-Generate
        // runs but get wiped on full page reload, same lifecycle as the
        // deck itself.
        window.pinnedCards = {
            cityLeague: new Set(),
            currentMeta: new Set(),
            pastMeta: new Set(),
        };

        // Mirror of pinnedCards for the opposite intent: cards the user
        // never wants in the next regenerated deck. Mutually exclusive
        // with pins — toggling exclude clears any matching pin and vice
        // versa. Excluded cards are filtered out of the candidate pool
        // at the top of autoCompleteConsistency so neither the algorithm
        // nor Stage 0 can re-introduce them.
        window.excludedCards = {
            cityLeague: new Set(),
            currentMeta: new Set(),
            pastMeta: new Set(),
        };

        function isExcludedCard(source, cardName) {
            const bucket = (window.excludedCards || {})[source];
            if (!bucket || !bucket.has) return false;
            return bucket.has(_pinKey(cardName));
        }
        window.isExcludedCard = isExcludedCard;

        function getExcludedCardNames(source) {
            const bucket = (window.excludedCards || {})[source];
            if (!bucket) return new Set();
            return new Set(bucket);
        }
        window.getExcludedCardNames = getExcludedCardNames;

        function toggleExcludeCard(source, cardName) {
            if (source !== 'cityLeague' && source !== 'currentMeta' && source !== 'pastMeta') return;
            const excludeBucket = window.excludedCards[source];
            const pinBucket     = window.pinnedCards[source];
            if (!excludeBucket || !pinBucket) return;
            const key = _pinKey(cardName);
            if (!key) return;
            const nowExcluded = !excludeBucket.has(key);
            if (nowExcluded) {
                excludeBucket.add(key);
                pinBucket.delete(key); // mutual exclusivity: can't both pin and exclude
            } else {
                excludeBucket.delete(key);
            }
            try {
                if (source === 'cityLeague' && typeof saveCityLeagueDeck === 'function') saveCityLeagueDeck();
                else if (source === 'currentMeta' && typeof saveCurrentMetaDeck === 'function') saveCurrentMetaDeck();
                else if (source === 'pastMeta' && typeof savePastMetaDeck === 'function') savePastMetaDeck();
            } catch (_) { /* swallow — UI redraw still happens */ }
            if (typeof updateDeckDisplay === 'function') updateDeckDisplay(source);
            if (typeof showToast === 'function') {
                if (nowExcluded) {
                    const tpl = t('deck.excludeAdded') || 'Excluded "{n}" — will not be added on next Consistency Generate.';
                    showToast(tpl.replace('{n}', cardName), 'info', 2500);
                } else {
                    const tpl = t('deck.excludeRemoved') || 'Un-excluded "{n}".';
                    showToast(tpl.replace('{n}', cardName), 'info', 2000);
                }
            }
        }
        window.toggleExcludeCard = toggleExcludeCard;

        window.excludedCardsToArray = function(source) {
            const bucket = (window.excludedCards || {})[source];
            return bucket ? Array.from(bucket) : [];
        };
        window.excludedCardsFromArray = function(source, arr) {
            if (!window.excludedCards) return;
            const list = Array.isArray(arr) ? arr : [];
            window.excludedCards[source] = new Set(list.map(_pinKey).filter(Boolean));
        };

        function _pinKey(name) {
            if (typeof normalizeCardName === 'function') return normalizeCardName(name || '');
            return String(name || '').toLowerCase().trim();
        }

        function isPinnedCard(source, cardName) {
            const bucket = (window.pinnedCards || {})[source];
            if (!bucket || !bucket.has) return false;
            return bucket.has(_pinKey(cardName));
        }
        window.isPinnedCard = isPinnedCard;

        function getPinnedCardNames(source) {
            const bucket = (window.pinnedCards || {})[source];
            if (!bucket) return new Set();
            return new Set(bucket);
        }
        window.getPinnedCardNames = getPinnedCardNames;

        function togglePinCard(source, cardName) {
            if (source !== 'cityLeague' && source !== 'currentMeta' && source !== 'pastMeta') return;
            const bucket = window.pinnedCards[source];
            if (!bucket) return;
            const key = _pinKey(cardName);
            if (!key) return;
            const nowPinned = !bucket.has(key);
            if (nowPinned) {
                bucket.add(key);
                // Mutual exclusivity with the exclude list — pinning a
                // previously-excluded card automatically un-excludes it.
                const excludeBucket = (window.excludedCards || {})[source];
                if (excludeBucket && excludeBucket.has(key)) excludeBucket.delete(key);
            } else {
                bucket.delete(key);
            }
            // Persist alongside the deck so the pin survives regen.
            try {
                if (source === 'cityLeague' && typeof saveCityLeagueDeck === 'function') saveCityLeagueDeck();
                else if (source === 'currentMeta' && typeof saveCurrentMetaDeck === 'function') saveCurrentMetaDeck();
                else if (source === 'pastMeta' && typeof savePastMetaDeck === 'function') savePastMetaDeck();
            } catch (_) { /* swallow — UI redraw still happens */ }
            if (typeof updateDeckDisplay === 'function') updateDeckDisplay(source);
            if (typeof showToast === 'function') {
                if (nowPinned) {
                    const tpl = t('deck.pinAdded') || 'Pinned "{n}" — will stay through Consistency Generate.';
                    showToast(tpl.replace('{n}', cardName), 'success', 2500);
                } else {
                    const tpl = t('deck.pinRemoved') || 'Unpinned "{n}".';
                    showToast(tpl.replace('{n}', cardName), 'info', 2000);
                }
            }
        }
        window.togglePinCard = togglePinCard;

        // localStorage round-trip helpers — called from save/load*Deck
        // wrappers in app-current-meta.js / app-city-league.js. Stored as
        // a plain Array so JSON.stringify works.
        window.pinnedCardsToArray = function(source) {
            const bucket = (window.pinnedCards || {})[source];
            return bucket ? Array.from(bucket) : [];
        };
        window.pinnedCardsFromArray = function(source, arr) {
            if (!window.pinnedCards) return;
            const list = Array.isArray(arr) ? arr : [];
            window.pinnedCards[source] = new Set(list.map(_pinKey).filter(Boolean));
        };

        // Tech-Slot state — separate bucket from pinnedCards so the UX
        // can show the user "your 10 chosen tech cards" without polluting
        // the regular pin list (heart icons in the deck grid). At build
        // time they fold into the same Stage-0 pin pipeline so the
        // algorithm sees one merged set of forced inclusions.
        //
        // Max 10 per source. Stored as ordered Array (not Set) so the
        // UI can render the slot tiles in the order the user picked
        // them. Persisted alongside the deck via the save/load wrappers.
        const TECH_SLOTS_MAX = 10;
        window.TECH_SLOTS_MAX = TECH_SLOTS_MAX;
        window.techSlots = {
            cityLeague: [],
            currentMeta: [],
            pastMeta: [],
        };

        function getTechSlotNames(source) {
            const bucket = (window.techSlots || {})[source];
            return Array.isArray(bucket) ? bucket.slice() : [];
        }
        window.getTechSlotNames = getTechSlotNames;

        function _hasTechSlot(source, cardName) {
            const bucket = (window.techSlots || {})[source];
            if (!Array.isArray(bucket)) return false;
            const key = _pinKey(cardName);
            return bucket.some(n => _pinKey(n) === key);
        }
        window.hasTechSlot = _hasTechSlot;

        function addTechSlot(source, cardName) {
            if (source !== 'cityLeague' && source !== 'currentMeta' && source !== 'pastMeta') return false;
            const bucket = window.techSlots[source];
            if (!Array.isArray(bucket)) return false;
            const trimmed = String(cardName || '').trim();
            if (!trimmed) return false;
            if (bucket.length >= TECH_SLOTS_MAX) {
                if (typeof showToast === 'function') {
                    const tpl = t('techSlots.full') || 'Tech slots full (max {n}).';
                    showToast(tpl.replace('{n}', TECH_SLOTS_MAX), 'warning', 2500);
                }
                return false;
            }
            if (_hasTechSlot(source, trimmed)) {
                if (typeof showToast === 'function') {
                    const tpl = t('techSlots.duplicate') || '"{n}" is already in your tech slots.';
                    showToast(tpl.replace('{n}', trimmed), 'info', 2000);
                }
                return false;
            }
            bucket.push(trimmed);
            try {
                if (source === 'cityLeague' && typeof saveCityLeagueDeck === 'function') saveCityLeagueDeck();
                else if (source === 'currentMeta' && typeof saveCurrentMetaDeck === 'function') saveCurrentMetaDeck();
                else if (source === 'pastMeta' && typeof savePastMetaDeck === 'function') savePastMetaDeck();
            } catch (_) { /* swallow */ }
            if (typeof renderTechSlotsUI === 'function') renderTechSlotsUI(source);
            return true;
        }
        window.addTechSlot = addTechSlot;

        function removeTechSlot(source, cardName) {
            if (source !== 'cityLeague' && source !== 'currentMeta' && source !== 'pastMeta') return false;
            const bucket = window.techSlots[source];
            if (!Array.isArray(bucket)) return false;
            const key = _pinKey(cardName);
            const idx = bucket.findIndex(n => _pinKey(n) === key);
            if (idx < 0) return false;
            bucket.splice(idx, 1);
            try {
                if (source === 'cityLeague' && typeof saveCityLeagueDeck === 'function') saveCityLeagueDeck();
                else if (source === 'currentMeta' && typeof saveCurrentMetaDeck === 'function') saveCurrentMetaDeck();
                else if (source === 'pastMeta' && typeof savePastMetaDeck === 'function') savePastMetaDeck();
            } catch (_) { /* swallow */ }
            if (typeof renderTechSlotsUI === 'function') renderTechSlotsUI(source);
            return true;
        }
        window.removeTechSlot = removeTechSlot;

        function clearTechSlots(source) {
            if (source !== 'cityLeague' && source !== 'currentMeta' && source !== 'pastMeta') return;
            window.techSlots[source] = [];
            try {
                if (source === 'cityLeague' && typeof saveCityLeagueDeck === 'function') saveCityLeagueDeck();
                else if (source === 'currentMeta' && typeof saveCurrentMetaDeck === 'function') saveCurrentMetaDeck();
                else if (source === 'pastMeta' && typeof savePastMetaDeck === 'function') savePastMetaDeck();
            } catch (_) { /* swallow */ }
            if (typeof renderTechSlotsUI === 'function') renderTechSlotsUI(source);
            if (typeof showToast === 'function') {
                showToast(t('techSlots.cleared') || 'Tech slots cleared.', 'info', 1800);
            }
        }
        window.clearTechSlots = clearTechSlots;

        window.techSlotsToArray = function(source) {
            const bucket = (window.techSlots || {})[source];
            return Array.isArray(bucket) ? bucket.slice() : [];
        };
        window.techSlotsFromArray = function(source, arr) {
            if (!window.techSlots) return;
            const list = Array.isArray(arr) ? arr.slice(0, TECH_SLOTS_MAX) : [];
            window.techSlots[source] = list.filter(n => typeof n === 'string' && n.trim().length > 0);
        };

        // ────────────────────────────────────────────────────────────
        // TECH-SLOT UI — renders 10 tiles (filled or empty) plus a
        // typeahead picker. Re-rendered whenever the slots change.
        // The picker reuses the deckBuilderShowAutocomplete pattern:
        // input.length >= 2 triggers a dropdown of card-DB suggestions.
        // ────────────────────────────────────────────────────────────
        function _tsEscapeHtml(s) {
            return String(s == null ? '' : s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }
        function _tsEscapeJs(s) {
            return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        }

        function renderTechSlotsUI(source) {
            if (source !== 'cityLeague' && source !== 'currentMeta' && source !== 'pastMeta') return;
            const grid = document.getElementById(source + 'TechSlotsGrid');
            const countEl = document.getElementById(source + 'TechSlotsCount');
            if (!grid) return;
            const names = getTechSlotNames(source);
            grid.innerHTML = '';
            for (let i = 0; i < TECH_SLOTS_MAX; i++) {
                const tile = document.createElement('div');
                const name = names[i];
                if (name) {
                    tile.className = 'tech-slot-tile tech-slot-filled';
                    const safeName = _tsEscapeHtml(name);
                    const jsName = _tsEscapeJs(name);
                    tile.innerHTML =
                        '<span class="tech-slot-name" title="' + safeName + '">' + safeName + '</span>' +
                        '<button class="tech-slot-remove" type="button" ' +
                        'onclick="removeTechSlot(\'' + source + '\', \'' + jsName + '\')" ' +
                        'aria-label="Remove tech card" title="Remove">×</button>';
                } else {
                    tile.className = 'tech-slot-tile tech-slot-empty';
                    tile.setAttribute('role', 'button');
                    tile.setAttribute('tabindex', '0');
                    tile.innerHTML = '<span class="tech-slot-plus">+</span>';
                    tile.addEventListener('click', () => showTechSlotPicker(source));
                    tile.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            showTechSlotPicker(source);
                        }
                    });
                }
                grid.appendChild(tile);
            }
            if (countEl) countEl.textContent = names.length + '/' + TECH_SLOTS_MAX;
        }
        window.renderTechSlotsUI = renderTechSlotsUI;

        function showTechSlotPicker(source) {
            if (getTechSlotNames(source).length >= TECH_SLOTS_MAX) {
                if (typeof showToast === 'function') {
                    const tpl = t('techSlots.full') || 'Tech slots full (max {n}).';
                    showToast(tpl.replace('{n}', TECH_SLOTS_MAX), 'warning', 2500);
                }
                return;
            }
            const picker = document.getElementById(source + 'TechSlotPicker');
            const input = document.getElementById(source + 'TechSlotInput');
            const dropdown = document.getElementById(source + 'TechSlotDropdown');
            if (!picker || !input) return;
            picker.classList.remove('d-none');
            input.value = '';
            if (dropdown) dropdown.innerHTML = '';
            try { input.focus(); } catch (_) { /* swallow */ }
        }
        window.showTechSlotPicker = showTechSlotPicker;

        function hideTechSlotPicker(source) {
            const picker = document.getElementById(source + 'TechSlotPicker');
            if (picker) picker.classList.add('d-none');
        }
        window.hideTechSlotPicker = hideTechSlotPicker;

        function techSlotSearch(inputEl, source) {
            const dropdown = document.getElementById(source + 'TechSlotDropdown');
            if (!dropdown) return;
            const searchTerm = String(inputEl.value || '').trim().toLowerCase();
            const cardsDb = window.allCardsDatabase || window.allCardsData || [];
            if (cardsDb.length === 0 || searchTerm.length < 2) {
                dropdown.innerHTML = '';
                return;
            }
            const matches = [];
            const seen = new Set();
            for (const card of cardsDb) {
                if (!card.name || seen.has(card.name)) continue;
                if (_hasTechSlot(source, card.name)) continue;
                const nameEn = (card.name || '').toLowerCase();
                const nameDe = (card.name_de || card.german_name || '').toLowerCase();
                if (nameEn.includes(searchTerm) || nameDe.includes(searchTerm)) {
                    matches.push(card);
                    seen.add(card.name);
                    if (matches.length >= 12) break;
                }
            }
            if (matches.length === 0) {
                dropdown.innerHTML = '<div class="tech-slot-suggestion tech-slot-suggestion-empty">' +
                    _tsEscapeHtml(t('techSlots.noMatches') || 'No matches.') + '</div>';
                return;
            }
            dropdown.innerHTML = matches.map(c => {
                const safeName = _tsEscapeHtml(c.name);
                const jsName = _tsEscapeJs(c.name);
                const meta = [(c.set || ''), (c.number || '')].filter(Boolean).join(' ');
                // mousedown (not click) so the suggestion fires BEFORE the
                // input's blur tears the picker down.
                return '<div class="tech-slot-suggestion" ' +
                    'onmousedown="event.preventDefault(); addTechSlot(\'' + source + '\', \'' + jsName + '\'); hideTechSlotPicker(\'' + source + '\');">' +
                    '<span class="tech-slot-suggestion-name">' + safeName + '</span>' +
                    '<span class="tech-slot-suggestion-meta">' + _tsEscapeHtml(meta) + '</span>' +
                    '</div>';
            }).join('');
        }
        window.techSlotSearch = techSlotSearch;

        // Auto-render on init for any source whose UI is already in DOM.
        // Initial state is just 10 empty tiles — no slots picked yet.
        setTimeout(function() {
            ['cityLeague', 'currentMeta', 'pastMeta'].forEach(src => {
                try { renderTechSlotsUI(src); } catch (_) { /* swallow */ }
                try { renderTechVsNormalPanel(src); } catch (_) { /* swallow */ }
            });
        }, 50);

        // ────────────────────────────────────────────────────────────
        // TECH-VS-NORMAL COMPARE PANEL — page-bottom diff between the
        // last Vanilla build (lastVanillaDeck[source]) and the last
        // Tech build (lastTechDeck[source]). Hidden unless BOTH
        // snapshots exist for the source. Shows card-level diff
        // (added / removed / count changed) + total consistency-score
        // delta from the algorithm. Only renders the diff for the
        // source whose tab the user is currently looking at; the JS
        // is cheap enough that we re-render all 3 on every call.
        // ────────────────────────────────────────────────────────────
        function _humanTimeAgo(ts) {
            if (!ts || !Number.isFinite(ts)) return '';
            const secs = Math.max(0, Math.round((Date.now() - ts) / 1000));
            if (secs < 60) return secs + 's ago';
            const mins = Math.round(secs / 60);
            if (mins < 60) return mins + 'm ago';
            const hrs = Math.round(mins / 60);
            if (hrs < 24) return hrs + 'h ago';
            const days = Math.round(hrs / 24);
            return days + 'd ago';
        }

        function _tvnDiff(vanilla, tech) {
            // Both baselines are { cardName: count, __key: ... }. Filter
            // out the __keys then bucket cards into added / removed /
            // count-changed lists vs the vanilla baseline.
            const vMap = new Map();
            Object.entries(vanilla || {}).forEach(([k, v]) => {
                if (k.startsWith('__')) return;
                vMap.set(k, Number(v) || 0);
            });
            const tMap = new Map();
            Object.entries(tech || {}).forEach(([k, v]) => {
                if (k.startsWith('__')) return;
                tMap.set(k, Number(v) || 0);
            });
            const added = [], removed = [], changed = [];
            tMap.forEach((tc, name) => {
                const vc = vMap.get(name) || 0;
                if (vc === 0) added.push({ name, count: tc });
                else if (tc !== vc) changed.push({ name, vc, tc, delta: tc - vc });
            });
            vMap.forEach((vc, name) => {
                if (!tMap.has(name)) removed.push({ name, count: vc });
            });
            added.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
            removed.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
            changed.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.name.localeCompare(b.name));
            return { added, removed, changed };
        }

        function renderTechVsNormalPanel(source) {
            if (source !== 'cityLeague' && source !== 'currentMeta' && source !== 'pastMeta') return;
            const section = document.getElementById(source + 'TechVsNormalSection');
            const body = document.getElementById(source + 'TechVsNormalBody');
            if (!section || !body) return;

            const vanilla = (window.lastVanillaDeck || {})[source];
            const tech = (window.lastTechDeck || {})[source];

            if (!vanilla || !tech) {
                section.classList.add('d-none');
                body.innerHTML = '';
                return;
            }
            section.classList.remove('d-none');

            const diff = _tvnDiff(vanilla, tech);
            const vScore = Number(vanilla.__totalConsistencyScore) || 0;
            const tScore = Number(tech.__totalConsistencyScore) || 0;
            const dScore = tScore - vScore;
            const dScoreText = (dScore >= 0 ? '+' : '') + dScore.toFixed(0);
            const dScoreClass = dScore >= 0 ? 'tvn-delta-positive' : 'tvn-delta-negative';

            const vAgo = _humanTimeAgo(vanilla.__capturedAt);
            const tAgo = _humanTimeAgo(tech.__capturedAt);
            const target = tech.__antiTechTarget ? _tsEscapeHtml(tech.__antiTechTarget) : '';
            const techHeadingTpl = target
                ? ((t('techVsNormal.techHeadingVs') || 'Tech Build vs {target}').replace('{target}', target))
                : (t('techVsNormal.techHeading') || 'Tech Build');

            const noChangesMsg = t('techVsNormal.noChanges') || 'No card differences between the two builds.';
            const addedLabel = t('techVsNormal.added') || 'Added for Tech';
            const removedLabel = t('techVsNormal.removed') || 'Cut for Tech';
            const changedLabel = t('techVsNormal.changed') || 'Count changes';
            const scoreLabel = t('techVsNormal.score') || 'Total consistency score';
            const deltaLabel = t('techVsNormal.delta') || 'Δ vs Normal';
            const normalHeadingLabel = t('techVsNormal.normalHeading') || 'Normal Build';

            const renderList = (items, fmt) => items.length === 0
                ? '<li class="tvn-diff-empty">—</li>'
                : items.map(fmt).join('');

            const hasDiff = diff.added.length || diff.removed.length || diff.changed.length;

            body.innerHTML = `
                <div class="tech-vs-normal-snapshots">
                    <div class="tvn-snapshot tvn-vanilla">
                        <h4 class="tvn-snapshot-title">${_tsEscapeHtml(normalHeadingLabel)}</h4>
                        <span class="tvn-snapshot-meta">${_tsEscapeHtml(vAgo)}</span>
                        <span class="tvn-snapshot-score">${_tsEscapeHtml(scoreLabel)}: <strong>${vScore.toFixed(0)}</strong></span>
                    </div>
                    <div class="tvn-snapshot tvn-tech">
                        <h4 class="tvn-snapshot-title">${techHeadingTpl}</h4>
                        <span class="tvn-snapshot-meta">${_tsEscapeHtml(tAgo)}</span>
                        <span class="tvn-snapshot-score">${_tsEscapeHtml(scoreLabel)}: <strong>${tScore.toFixed(0)}</strong> <span class="tvn-delta ${dScoreClass}">${_tsEscapeHtml(deltaLabel)} ${dScoreText}</span></span>
                    </div>
                </div>
                ${hasDiff ? `
                <div class="tech-vs-normal-diff">
                    <div class="tvn-diff-col tvn-col-added">
                        <h5 class="tvn-diff-heading">${_tsEscapeHtml(addedLabel)} <span class="tvn-diff-count">(${diff.added.length})</span></h5>
                        <ul class="tvn-diff-list">${renderList(diff.added, x => `<li><span class="tvn-card-count">${x.count}×</span> ${_tsEscapeHtml(x.name)}</li>`)}</ul>
                    </div>
                    <div class="tvn-diff-col tvn-col-removed">
                        <h5 class="tvn-diff-heading">${_tsEscapeHtml(removedLabel)} <span class="tvn-diff-count">(${diff.removed.length})</span></h5>
                        <ul class="tvn-diff-list">${renderList(diff.removed, x => `<li><span class="tvn-card-count">${x.count}×</span> ${_tsEscapeHtml(x.name)}</li>`)}</ul>
                    </div>
                    <div class="tvn-diff-col tvn-col-changed">
                        <h5 class="tvn-diff-heading">${_tsEscapeHtml(changedLabel)} <span class="tvn-diff-count">(${diff.changed.length})</span></h5>
                        <ul class="tvn-diff-list">${renderList(diff.changed, x => `<li>${_tsEscapeHtml(x.name)}: <span class="tvn-card-count">${x.vc}→${x.tc}</span> <span class="tvn-delta ${x.delta >= 0 ? 'tvn-delta-positive' : 'tvn-delta-negative'}">${x.delta >= 0 ? '+' : ''}${x.delta}</span></li>`)}</ul>
                    </div>
                </div>` : `<div class="tech-vs-normal-empty">${_tsEscapeHtml(noChangesMsg)}</div>`}
            `;
        }
        window.renderTechVsNormalPanel = renderTechVsNormalPanel;

        function refreshTechVsNormalPanel(source) {
            if (source) {
                try { renderTechVsNormalPanel(source); } catch (_) { /* swallow */ }
                return;
            }
            ['cityLeague', 'currentMeta', 'pastMeta'].forEach(src => {
                try { renderTechVsNormalPanel(src); } catch (_) { /* swallow */ }
            });
        }
        window.refreshTechVsNormalPanel = refreshTechVsNormalPanel;

        devLog('[Init] Starting with empty deck (localStorage cleared on page load)');
        // Check for a shared deck in the URL – runs after clearing so it wins
        setTimeout(function() { if (typeof importDeckFromUrl === 'function') importDeckFromUrl(); }, 100);
        
        // ---------------------------------------------------------------
        // BATCH ADD FUNCTION - For Auto-Generate Performance
        // ---------------------------------------------------------------
        // This version adds cards WITHOUT triggering display updates
        // Use this for bulk operations, then call updateDeckDisplay() once at the end
        
        function addCardToDeckBatch(source, cardName, setCode, setNumber) {
            if (source !== 'cityLeague' && source !== 'currentMeta' && source !== 'pastMeta') return false;
            
            let deck, deckOrderKey;
            if (source === 'cityLeague') {
                deck = window.cityLeagueDeck;
                deckOrderKey = 'cityLeagueDeckOrder';
            } else if (source === 'currentMeta') {
                deck = window.currentMetaDeck;
                deckOrderKey = 'currentMetaDeckOrder';
            } else if (source === 'pastMeta') {
                deck = window.pastMetaDeck;
                deckOrderKey = 'pastMetaDeckOrder';
            }
            
            // Initialize deck order array if not exists
            if (!window[deckOrderKey]) {
                window[deckOrderKey] = [];
            }

            // When auto-generating, save version preference
            if (setCode && setNumber) {
                setRarityPreference(cardName, {
                    mode: 'specific',
                    set: setCode,
                    number: setNumber
                });
            }
            
            let deckKey = getCanonicalDeckKey(cardName, setCode, setNumber);
            
            // Check if there's already an entry for this card
            let existingKey = null;
            if (deck[deckKey]) {
                existingKey = deckKey;
            } else if (deck[cardName]) {
                existingKey = cardName;
            } else {
                for (const key in deck) {
                    if (key === cardName || key.startsWith(cardName + ' (')) {
                        existingKey = key;
                        break;
                    }
                }
            }
            
            // Migrate key if needed
            if (existingKey && existingKey !== deckKey && setCode && setNumber) {
                deck[deckKey] = deck[existingKey];
                delete deck[existingKey];
                if (window[deckOrderKey]) {
                    const oldKeyIndex = window[deckOrderKey].indexOf(existingKey);
                    if (oldKeyIndex !== -1) {
                        window[deckOrderKey][oldKeyIndex] = deckKey;
                    }
                }
            } else if (existingKey) {
                deckKey = existingKey;
            }
            
            if (!deck[deckKey]) {
                deck[deckKey] = 0;
            }
            
            const currentTotal = Object.values(deck).reduce((sum, count) => sum + count, 0);
            if (currentTotal >= 70) {
                return false; // Silent fail for batch operations
            }
            
            // Check card limits
            let cardsKey, cards;
            if (source === 'cityLeague') {
                cardsKey = 'currentCityLeagueDeckCards';
                cards = window[cardsKey] || [];
            } else if (source === 'currentMeta') {
                cardsKey = 'currentCurrentMetaDeckCards';
                cards = window[cardsKey] || [];
            } else if (source === 'pastMeta') {
                cards = pastMetaFilteredCards || [];
            }
            let cardData = cards.find(c => (c.card_name || c.full_card_name) === cardName);
            if (!cardData && setCode && setNumber) {
                cardData = getIndexedCardBySetNumber(setCode, setNumber) || (window.cardsBySetNumberMap || {})[`${setCode}-${setNumber}`] || null;
            }
            const isBaseEnergy = isBasicEnergyCardEntry(cardData || { card_name: cardName, name: cardName });
            const isAceSpecCard = isAceSpec(cardName);
            
            // Check limits (silent fail for batch)
            if (!isBaseEnergy && !isAceSpecCard && deck[deckKey] >= 4) {
                return false;
            }
            if (isAceSpecCard && deck[deckKey] >= 1) {
                return false;
            }
            // Deck-wide Ace Spec limit
            if (isAceSpecCard && getTotalAceSpecCopiesInDeck(deck) >= 1) {
                return false;
            }
            // Radiant Pokémon limits
            if (isRadiantPokemon(cardName)) {
                if (deck[deckKey] >= 1) return false;
                if (getTotalRadiantCopiesInDeck(deck) >= 1) return false;
            }
            
            deck[deckKey]++;
            
            // Track insertion order
            if (!window[deckOrderKey].includes(deckKey)) {
                window[deckOrderKey].push(deckKey);
            }
            
            return true; // Success
        }

        function getDeckRefBySource(source) {
            if (source === 'cityLeague') return window.cityLeagueDeck;
            if (source === 'currentMeta') return window.currentMetaDeck;
            if (source === 'pastMeta') return window.pastMetaDeck;
            return null;
        }

        function getDeckTotalCards(deck) {
            return Object.values(deck || {}).reduce((sum, count) => sum + (parseInt(count, 10) || 0), 0);
        }

        function isBasicEnergyName(cardName) {
            const name = String(cardName || '').toLowerCase().trim();
            return name === 'grass energy'
                || name === 'fire energy'
                || name === 'water energy'
                || name === 'lightning energy'
                || name === 'psychic energy'
                || name === 'fighting energy'
                || name === 'darkness energy'
                || name === 'metal energy';
        }

        function normalizeGeneratedDeckTo60(source, plannedCards, fallbackCards) {
            const deck = getDeckRefBySource(source);
            if (!deck) return 0;

            let total = getDeckTotalCards(deck);
            if (total >= 60) return total;

            const byName = new Map();
            const ingest = (card) => {
                if (!card || !card.card_name) return;
                const key = String(card.card_name).trim().toLowerCase();
                if (!key) return;
                if (!byName.has(key)) byName.set(key, card);
            };

            (plannedCards || []).forEach(ingest);
            (fallbackCards || []).forEach(ingest);

            const candidates = Array.from(byName.values()).sort((a, b) => {
                const shareA = parseFloat(String(a.sharePercent || a.percentage_in_archetype || 0).replace(',', '.')) || 0;
                const shareB = parseFloat(String(b.sharePercent || b.percentage_in_archetype || 0).replace(',', '.')) || 0;
                return shareB - shareA;
            });

            let guard = 0;
            while (total < 60 && guard < 180) {
                guard++;
                let added = false;

                for (const card of candidates) {
                    const cardName = String(card.card_name || '').trim();
                    if (!cardName) continue;

                    const originalSetCode = card.set_code || '';
                    const originalSetNumber = card.set_number || '';
                    const preferredVersion = getPreferredVersionForCard(cardName, originalSetCode, originalSetNumber);
                    const setCode = preferredVersion ? preferredVersion.set : originalSetCode;
                    const setNumber = preferredVersion ? preferredVersion.number : originalSetNumber;

                    const success = addCardToDeckBatch(source, cardName, setCode, setNumber);
                    if (success) {
                        total++;
                        added = true;
                        if (total >= 60) break;
                    }
                }

                // Absolute fallback: try adding basic energy if normal candidates are blocked by limits.
                if (!added) {
                    const basicEnergy = candidates.find(card => isBasicEnergyName(card.card_name));
                    if (basicEnergy) {
                        const success = addCardToDeckBatch(source, basicEnergy.card_name, basicEnergy.set_code || '', basicEnergy.set_number || '');
                        if (success) {
                            total++;
                            added = true;
                        }
                    }
                }

                if (!added) break;
            }

            if (total < 60) {
                console.warn(`[DeckBuilder] Could not normalize deck to 60 for ${source}. Current total: ${total}`);
            }

            return total;
        }
        
        // ---------------------------------------------------------------
        // SINGLE ADD FUNCTION - For Manual Card Addition
        // ---------------------------------------------------------------
        
        function addCardToDeck(source, cardName, setCode, setNumber) {
            if (source !== 'cityLeague' && source !== 'currentMeta' && source !== 'pastMeta') return;
            
            let deck, deckOrderKey;
            if (source === 'cityLeague') {
                deck = window.cityLeagueDeck;
                deckOrderKey = 'cityLeagueDeckOrder';
            } else if (source === 'currentMeta') {
                deck = window.currentMetaDeck;
                deckOrderKey = 'currentMetaDeckOrder';
            } else if (source === 'pastMeta') {
                deck = window.pastMetaDeck;
                deckOrderKey = 'pastMetaDeckOrder';
            }
            
            // Initialize deck order array if not exists
            if (!window[deckOrderKey]) {
                window[deckOrderKey] = [];
            }

            // CRITICAL FIX: When user manually adds a card with specific version, save it as preference
            // This ensures the exact version shows up in the deck (not auto-swapped to low rarity)
            if (setCode && setNumber) {
                setRarityPreference(cardName, {
                    mode: 'specific',
                    set: setCode,
                    number: setNumber
                });
                devLog(`[addCardToDeck] Saved specific version preference for ${cardName}: ${setCode} ${setNumber}`);
            }
            
            // CRITICAL FIX: Check if card already exists with a different key format
            // If card exists as "CardName" but we're adding "CardName (SET NUM)", update the existing key
            let deckKey = getCanonicalDeckKey(cardName, setCode, setNumber);
            
            // Check if there's already an entry for this card (with or without version info)
            let existingKey = null;
            if (deck[deckKey]) {
                existingKey = deckKey; // Exact match
            } else if (deck[cardName]) {
                existingKey = cardName; // Card exists without version
            } else {
                // Check if any key starts with this card name
                for (const key in deck) {
                    if (key === cardName || key.startsWith(cardName + ' (')) {
                        existingKey = key;
                        break;
                    }
                }
            }
            
            // If we found an existing key and it's different from our new key, migrate it
            if (existingKey && existingKey !== deckKey && setCode && setNumber) {
                devLog(`Migrating deck entry from "${existingKey}" to "${deckKey}"`);
                deck[deckKey] = deck[existingKey];
                delete deck[existingKey];
                
                // Update order array when migrating key
                if (window[deckOrderKey]) {
                    const oldKeyIndex = window[deckOrderKey].indexOf(existingKey);
                    if (oldKeyIndex !== -1) {
                        window[deckOrderKey][oldKeyIndex] = deckKey;
                        devLog(`Updated deck order during migration: ${existingKey} -> ${deckKey} at position ${oldKeyIndex}`);
                    }
                }
            } else if (existingKey) {
                deckKey = existingKey; // Use the existing key
            }
            
            if (!deck[deckKey]) {
                deck[deckKey] = 0;
            }
            
            const currentTotal = Object.values(deck).reduce((sum, count) => sum + count, 0);
            if (currentTotal >= 70) {
                showToast(t('deck.maxReached'), 'warning');
                return;
            }
            
            // Check if card is a base energy or Ace Spec (no 4-copy limit for these)
            let cardsKey, cards;
            if (source === 'cityLeague') {
                cardsKey = 'currentCityLeagueDeckCards';
                cards = window[cardsKey] || [];
            } else if (source === 'currentMeta') {
                cardsKey = 'currentCurrentMetaDeckCards';
                cards = window[cardsKey] || [];
            } else if (source === 'pastMeta') {
                cards = pastMetaFilteredCards || [];
            }
            let cardData = cards.find(c => (c.card_name || c.full_card_name) === cardName);
            if (!cardData && setCode && setNumber) {
                cardData = getIndexedCardBySetNumber(setCode, setNumber) || (window.cardsBySetNumberMap || {})[`${setCode}-${setNumber}`] || null;
            }
            const isBaseEnergy = isBasicEnergyCardEntry(cardData || { card_name: cardName, name: cardName });
            const isAceSpecCard = isAceSpec(cardName);
            
            // Check if card already has 4 copies (only applies to non-energy, non-ace-spec cards)
            if (!isBaseEnergy && !isAceSpecCard && deck[deckKey] >= 4) {
                showToast(t('deck.maxCopies'), 'warning');
                return;
            }
            
            // Ace Spec cards can only have 1 copy in deck
            if (isAceSpecCard && deck[deckKey] >= 1) {
                showToast(t('deck.aceSpecOnce'), 'warning');
                return;
            }
            
            // DECK-WIDE Ace Spec limit: only 1 Ace Spec card total in entire deck
            if (isAceSpecCard && getTotalAceSpecCopiesInDeck(deck) >= 1) {
                showToast(t('deck.aceSpecLimit'), 'warning');
                return;
            }
            
            // Radiant Pokémon: max 1 copy, and only 1 Radiant total in deck
            if (isRadiantPokemon(cardName)) {
                if (deck[deckKey] >= 1) {
                    showToast(t('deck.radiantOnce'), 'warning');
                    return;
                }
                if (getTotalRadiantCopiesInDeck(deck) >= 1) {
                    showToast(t('deck.radiantLimit'), 'warning');
                    return;
                }
            }
            
            deck[deckKey]++;
            
            // Track insertion order
            if (!window[deckOrderKey].includes(deckKey)) {
                window[deckOrderKey].push(deckKey);
            }
            
            devLog(`Added card to deck: ${deckKey} -> ${deck[deckKey]}`);
            
            // Save to localStorage
            if (source === 'cityLeague') {
                saveCityLeagueDeck();
            } else if (source === 'currentMeta') {
                saveCurrentMetaDeck();
            } else if (source === 'pastMeta') {
                savePastMetaDeck();
            }
            
            updateDeckDisplay(source);
        }

        // ---------------------------------------------------------------
        // Deck Builder Inline Autocomplete (Add Card via search field)
        // ---------------------------------------------------------------
        function deckBuilderShowAutocomplete(inputEl, source) {
            const dropdownId = source + 'DeckAutocomplete';
            const dropdown = document.getElementById(dropdownId);
            if (!dropdown) return;

            const searchTerm = (inputEl.value || '').trim().toLowerCase();
            if (searchTerm.length < 2) {
                dropdown.classList.add('d-none');
                return;
            }

            const cardsDb = window.allCardsDatabase || window.allCardsData || [];
            if (cardsDb.length === 0) {
                dropdown.classList.add('d-none');
                return;
            }

            // Find matching cards — unique by name, max 10
            const matches = [];
            const seen = new Set();
            for (const card of cardsDb) {
                if (!card.name || seen.has(card.name)) continue;
                const nameEn = (card.name || '').toLowerCase();
                const nameDe = (card.name_de || card.german_name || '').toLowerCase();
                const setCode = (card.set || '').toLowerCase();
                const cardNum = (card.number || '').toLowerCase();
                const dexNum = (card.pokedex_number || '').toString();
                const setNumCombo = setCode + ' ' + cardNum;
                if (nameEn.includes(searchTerm) || nameDe.includes(searchTerm) ||
                    setNumCombo.includes(searchTerm) || (dexNum && dexNum === searchTerm)) {
                    matches.push(card);
                    seen.add(card.name);
                    if (matches.length >= 10) break;
                }
            }

            if (matches.length === 0) {
                dropdown.classList.add('d-none');
                return;
            }

            // Get current deck counts
            const deck = source === 'cityLeague' ? (window.cityLeagueDeck || {})
                       : source === 'currentMeta' ? (window.currentMetaDeck || {})
                       : (window.pastMetaDeck || {});

            dropdown.innerHTML = matches.map(card => {
                const safeNameJs = (card.name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                const safeSet = (card.set || '').replace(/'/g, "\\'");
                const safeNum = (card.number || '').replace(/'/g, "\\'");
                const safeNameHtml = (card.name || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const imgUrl = card.image_url || (card.set && card.number ? getUnifiedCardImage(card.set, card.number) : '');
                const typeBadge = card.type ? '<span style="font-size:0.65em;color:#888;margin-left:4px;">' + (card.type || '').replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</span>' : '';
                // Count how many of this card are already in deck
                let deckCount = 0;
                for (const key in deck) {
                    if (key === card.name || key.startsWith(card.name + ' (')) {
                        deckCount += deck[key] || 0;
                    }
                }
                const countBadge = deckCount > 0 ? '<span style="background:#667eea;color:#fff;padding:1px 7px;border-radius:10px;font-size:0.75em;font-weight:700;margin-left:auto;">' + deckCount + 'x</span>' : '';

                return '<div onclick="addCardToDeck(\'' + source + '\', \'' + safeNameJs + '\', \'' + safeSet + '\', \'' + safeNum + '\'); deckBuilderShowAutocomplete(document.getElementById(\'' + source + 'DeckGridSearch\'), \'' + source + '\')" ' +
                    'style="display:flex;align-items:center;gap:8px;padding:6px 10px;cursor:pointer;border-bottom:1px solid #f0f0f0;transition:background 0.15s;" ' +
                    'onmouseover="this.style.background=\'#f0f4ff\'" onmouseout="this.style.background=\'white\'">' +
                    (imgUrl ? '<img src="' + imgUrl.replace(/"/g, '&quot;') + '" style="width:32px;height:45px;object-fit:cover;border-radius:3px;" loading="lazy" onerror="this.style.display=\'none\'">' : '') +
                    '<div style="flex:1;min-width:0;">' +
                    '<div style="font-size:0.85em;font-weight:600;color:#2c3e50;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + safeNameHtml + typeBadge + '</div>' +
                    '<div style="font-size:0.7em;color:#999;">' + (card.set || '') + ' ' + (card.number || '') + '</div>' +
                    '</div>' +
                    countBadge +
                    '</div>';
            }).join('');
            dropdown.classList.remove('d-none');
        }

        function deckBuilderHideAutocomplete(source) {
            const dropdown = document.getElementById(source + 'DeckAutocomplete');
            if (dropdown) dropdown.classList.add('d-none');
        }

        function removeCardFromDeck(source, deckKey) {
            if (source !== 'cityLeague' && source !== 'currentMeta' && source !== 'pastMeta') return;
            
            let deck, deckOrderKey;
            if (source === 'cityLeague') {
                deck = window.cityLeagueDeck;
                deckOrderKey = 'cityLeagueDeckOrder';
            } else if (source === 'currentMeta') {
                deck = window.currentMetaDeck;
                deckOrderKey = 'currentMetaDeckOrder';
            } else if (source === 'pastMeta') {
                deck = window.pastMetaDeck;
                deckOrderKey = 'pastMetaDeckOrder';
            }
            
            // CRITICAL FIX: Find the actual key in deck
            // If deckKey is just "CardName" but deck has "CardName (SET NUM)", find it
            let actualKey = deckKey;
            if (!deck[deckKey] || deck[deckKey] <= 0) {
                // Search for alternative keys (with set info)
                for (const key in deck) {
                    if (key === deckKey || key.startsWith(deckKey + ' (')) {
                        if (deck[key] > 0) {
                            actualKey = key;
                            break;
                        }
                    }
                }
            }
            
            if (deck[actualKey] && deck[actualKey] > 0) {
                deck[actualKey]--;
                if (deck[actualKey] === 0) {
                    delete deck[actualKey];
                    // Remove from order tracking
                    if (window[deckOrderKey]) {
                        const idx = window[deckOrderKey].indexOf(actualKey);
                        if (idx !== -1) {
                            window[deckOrderKey].splice(idx, 1);
                        }
                    }
                }
                
                // Save to localStorage
                if (source === 'cityLeague') {
                    saveCityLeagueDeck();
                } else if (source === 'currentMeta') {
                    saveCurrentMetaDeck();
                } else if (source === 'pastMeta') {
                    savePastMetaDeck();
                }
                
                updateDeckDisplay(source);
            }
        }

        const pendingDeckRefreshBySource = {};
        const pendingDeckRefreshTimeoutBySource = {};
        const pendingDeckDisplayUpdateBySource = {};

        function scheduleDeckDisplayUpdate(source) {
            if (source !== 'cityLeague' && source !== 'currentMeta' && source !== 'pastMeta') return;

            if (pendingDeckDisplayUpdateBySource[source]) {
                return;
            }

            pendingDeckDisplayUpdateBySource[source] = requestAnimationFrame(() => {
                pendingDeckDisplayUpdateBySource[source] = null;
                updateDeckDisplay(source);
            });
        }

        function scheduleDeckDependentRefresh(source) {
            if (pendingDeckRefreshBySource[source]) {
                cancelAnimationFrame(pendingDeckRefreshBySource[source]);
            }

            if (pendingDeckRefreshTimeoutBySource[source]) {
                clearTimeout(pendingDeckRefreshTimeoutBySource[source]);
            }

            // Debounce expensive overview rerenders while user is rapidly tapping +/-.
            pendingDeckRefreshTimeoutBySource[source] = setTimeout(() => {
                pendingDeckRefreshTimeoutBySource[source] = null;

                pendingDeckRefreshBySource[source] = requestAnimationFrame(() => {
                    pendingDeckRefreshBySource[source] = null;

                    // Preserve scroll position across re-render to prevent page jumping
                    const scrollY = window.scrollY;

                    if (source === 'cityLeague') {
                        applyCityLeagueFilter();
                    } else if (source === 'currentMeta') {
                        applyCurrentMetaFilter();
                    } else if (source === 'pastMeta') {
                        renderPastMetaCards();
                    }

                    updateOpeningHandStats(source);

                    // Restore scroll position if it shifted due to layout changes
                    if (Math.abs(window.scrollY - scrollY) > 2) {
                        window.scrollTo({ top: scrollY, behavior: 'instant' });
                    }
                });
            }, 140);
        }
        
        function clearDeck(source) {
            if (source !== 'cityLeague' && source !== 'currentMeta' && source !== 'pastMeta') return;
            
            if (confirm(t('deck.clearConfirm'))) {
                if (source === 'cityLeague') {
                    window.cityLeagueDeck = {};
                    window.cityLeagueDeckOrder = [];
                    window.currentCityLeagueArchetype = null;
                    // CRITICAL: Remove from localStorage completely
                    localStorage.removeItem('cityLeagueDeck');
                    devLog('[clearDeck] City League deck cleared and removed from localStorage');
                } else if (source === 'currentMeta') {
                    window.currentMetaDeck = {};
                    window.currentMetaDeckOrder = [];
                    window.currentMetaArchetype = null;
                    // CRITICAL: Remove from localStorage completely
                    localStorage.removeItem('currentMetaDeck');
                    devLog('[clearDeck] Current Meta deck cleared and removed from localStorage');
                } else if (source === 'pastMeta') {
                    window.pastMetaDeck = {};
                    window.pastMetaDeckOrder = [];
                    window.pastMetaCurrentArchetype = null;
                    // CRITICAL: Remove from localStorage completely
                    localStorage.removeItem('pastMetaDeck');
                    devLog('[clearDeck] Past Meta deck cleared and removed from localStorage');
                }
                
                // CRITICAL: Clear all rarity preferences when clearing deck
                rarityPreferences = {};
                saveRarityPreferences();
                
                updateDeckDisplay(source);
                
                // Force re-render to remove all badges
                const tabId = source === 'cityLeague' ? 'city-league-tab' : 'current-meta-tab';
                if (document.getElementById(tabId) && document.getElementById(tabId).classList.contains('active')) {
                    // Re-render the current view to update badges
                    if (source === 'cityLeague') {
                        renderCityLeagueDeckGrid(cityLeagueCardsFiltered, cityLeagueOverviewRarityMode);
                    } else {
                        renderCurrentMetaDeckGrid(currentMetaCardsFiltered, currentMetaOverviewRarityMode);
                    }
                }
            }
        }
        
        function updateDeckDisplay(source) {
            if (source !== 'cityLeague' && source !== 'currentMeta' && source !== 'pastMeta') return;

            const normalized = normalizeDeckEntries(source);
            if (normalized) {
                if (source === 'cityLeague') saveCityLeagueDeck();
                else if (source === 'currentMeta') saveCurrentMetaDeck();
                else if (source === 'pastMeta') savePastMetaDeck();
            }
            
            let deck;
            if (source === 'cityLeague') {
                deck = window.cityLeagueDeck;
            } else if (source === 'currentMeta') {
                deck = window.currentMetaDeck;
            } else if (source === 'pastMeta') {
                deck = window.pastMetaDeck;
            }
            const total = Object.values(deck).reduce((sum, count) => sum + count, 0);
            const unique = Object.keys(deck).filter(k => deck[k] > 0).length;
            
            let countElId, uniqueElId;
            if (source === 'cityLeague') {
                countElId = 'cityLeagueDeckCount';
                uniqueElId = 'cityLeagueDeckCountUnique';
            } else if (source === 'currentMeta') {
                countElId = 'currentMetaDeckCount';
                uniqueElId = 'currentMetaDeckCountUnique';
            } else if (source === 'pastMeta') {
                countElId = 'pastMetaDeckCount';
                uniqueElId = 'pastMetaDeckCountUnique';
            }
            
            const countEl = document.getElementById(countElId);
            const uniqueEl = document.getElementById(uniqueElId);
            
            if (countEl) {
                countEl.textContent = total;
                // Highlight in red if over 60 cards
                if (total > 60) {
                    countEl.classList.add('color-red');
                    countEl.parentElement.classList.add('color-red');
                } else {
                    countEl.classList.remove('color-red');
                    countEl.parentElement.classList.remove('color-red');
                }
            }
            if (uniqueEl) uniqueEl.textContent = `(${unique} ${t('deck.uniqueLabel')})`;

            // --- Price calculation ---
            let priceElId;
            if (source === 'cityLeague')  priceElId = 'cityLeagueDeckPrice';
            else if (source === 'currentMeta') priceElId = 'currentMetaDeckPrice';
            else if (source === 'pastMeta')    priceElId = 'pastMetaDeckPrice';
            const priceEl = document.getElementById(priceElId);
            if (priceEl) {
                let totalPrice = 0;
                let hasAnyPrice = false;
                for (const [deckKey, count] of Object.entries(deck)) {
                    if (!count || count <= 0) continue;
                    let cardData = null;
                    const setMatch = deckKey.match(/^(.+?)\s+\(([A-Z0-9-]+)\s+([A-Z0-9-]+)\)$/);
                    if (setMatch) {
                        const key = `${setMatch[2]}-${setMatch[3]}`;
                        cardData = getIndexedCardBySetNumber(setMatch[2], setMatch[3]);
                        if (!cardData && cardsBySetNumberMap) cardData = cardsBySetNumberMap[key] || null;
                    } else {
                        cardData = (cardIndexMap && cardIndexMap.get(deckKey)) || null;
                    }
                    if (cardData && cardData.eur_price && cardData.eur_price !== '' && cardData.eur_price !== 'N/A') {
                        const p = parseFloat(String(cardData.eur_price).replace(',', '.'));
                        if (!isNaN(p)) { totalPrice += p * (parseInt(count) || 0); hasAnyPrice = true; }
                    }
                }
                priceEl.textContent = hasAnyPrice ? (isNaN(totalPrice) ? '0.00' : totalPrice.toFixed(2)) + ' \u20ac' : t('deck.priceNA');
            }

            // Add visual warning to deck container if over 60 cards
            let deckVisualId;
            if (source === 'cityLeague') {
                deckVisualId = 'cityLeagueMyDeckVisual';
            } else if (source === 'currentMeta') {
                deckVisualId = 'currentMetaMyDeckVisual';
            } else if (source === 'pastMeta') {
                deckVisualId = 'pastMetaMyDeckVisual';
            }
            const deckVisualEl = document.getElementById(deckVisualId);
            if (deckVisualEl) {
                if (total > 60) {
                    deckVisualEl.classList.add('border-3-red', 'bg-red-light');
                } else {
                    deckVisualEl.classList.remove('border-3-red', 'bg-red-light');
                    deckVisualEl.classList.add('bg-grey-light');
                }
            }
            
            // Update the My Deck grid immediately for responsive button feedback.
            renderMyDeckGrid(source);

            // Auto-save deck to localStorage for crash recovery
            try {
                const allDecks = {
                    cityLeague:  { deck: window.cityLeagueDeck  || {}, order: window.cityLeagueDeckOrder  || [], archetype: window.currentCityLeagueArchetype  || null },
                    currentMeta: { deck: window.currentMetaDeck || {}, order: window.currentMetaDeckOrder || [], archetype: window.currentMetaArchetype || null },
                    pastMeta:    { deck: window.pastMetaDeck    || {}, order: window.pastMetaDeckOrder    || [], archetype: window.pastMetaCurrentArchetype    || null },
                    timestamp: new Date().toISOString()
                };
                const totalCards = Object.values(allDecks.cityLeague.deck).reduce((s,c)=>s+c,0)
                               + Object.values(allDecks.currentMeta.deck).reduce((s,c)=>s+c,0)
                               + Object.values(allDecks.pastMeta.deck).reduce((s,c)=>s+c,0);
                if (totalCards > 0) {
                    localStorage.setItem('autosave_deck', JSON.stringify(allDecks));
                } else {
                    localStorage.removeItem('autosave_deck');
                }
            } catch(e) { /* ignore autosave errors */ }

            // Refresh overview badges and opening hand stats on the next frame.
            scheduleDeckDependentRefresh(source);

            // Refresh the Meta-Call-weighted "Your Build vs Vanilla"
            // panel whenever the current-meta deck mutates so the
            // tech-counter bonus reflects the latest card list.
            if (source === 'currentMeta' && typeof window.refreshUserVsVanillaPanel === 'function') {
                try { window.refreshUserVsVanillaPanel(); }
                catch (e) { /* swallow — panel is best-effort */ }
            }
        }
        
        function renderMyDeckGrid(source) {
            if (source !== 'cityLeague' && source !== 'currentMeta' && source !== 'pastMeta') return;
            
            let deck, deckOrderKey, currentCardsKey, gridContainerId;
            if (source === 'cityLeague') {
                deck = window.cityLeagueDeck;
                deckOrderKey = 'cityLeagueDeckOrder';
                currentCardsKey = 'currentCityLeagueDeckCards';
                gridContainerId = 'cityLeagueMyDeckGrid';
            } else if (source === 'currentMeta') {
                deck = window.currentMetaDeck;
                deckOrderKey = 'currentMetaDeckOrder';
                currentCardsKey = 'currentCurrentMetaDeckCards';
                gridContainerId = 'currentMetaMyDeckGrid';
            } else if (source === 'pastMeta') {
                deck = window.pastMetaDeck;
                deckOrderKey = 'pastMetaDeckOrder';
                currentCardsKey = null; // Past Meta uses different data source
                gridContainerId = 'pastMetaMyDeckGrid';
            }
            
            const allCards = currentCardsKey ? (window[currentCardsKey] || []) : (pastMetaFilteredCards || []);
            const dbCache = getMyDeckRenderDbCache();

            const getDeckBuilderEmptyStateHtml = (scope) => {
                const generateAction = `autoCompleteConsistency('${scope}', 'min')`;
                const testDrawAction = `openDrawSimulator('${scope}')`;
                const emptyText = t('deck.emptyPlaceholder');
                return `
                    <div class="deck-builder-empty-state" role="status" aria-live="polite">
                        <div class="deck-builder-empty-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M8 8h8"></path><path d="M8 12h8"></path><path d="M8 16h5"></path></svg>
                        </div>
                        <h4 class="deck-builder-empty-title">Your deck is empty</h4>
                        <p class="deck-builder-empty-text">${emptyText}</p>
                        <div class="deck-builder-empty-actions">
                            <button class="btn-modern primary" onclick="${generateAction}">Generate Deck</button>
                            <button class="btn-modern" onclick="${testDrawAction}">Open Test Draw</button>
                        </div>
                    </div>
                `;
            };
            
            // Build card data maps: by name and by name+set+number
            const cardDataByName = Object.create((dbCache && dbCache.cardDataByName) || null);
            const cardDataByKey = Object.create((dbCache && dbCache.cardDataByKey) || null);
            const cardStatsByNormalizedName = {};
            const cardStatsBySetNumber = {};
            
            // Initialize deck order array if not exists
            if (!window[deckOrderKey]) {
                window[deckOrderKey] = Object.keys(deck).filter(k => deck[k] > 0);
            }
            
            // First, add cards from current deck cards
            allCards.forEach(card => {
                // Handle both 'card_name' (cityLeague/currentMeta) and 'full_card_name' (pastMeta)
                const cardName = card.card_name || card.full_card_name;
                if (cardName) {
                    cardDataByName[cardName] = card;

                    const normalizedName = normalizeCardName(cardName);
                    if (normalizedName) {
                        const prev = cardStatsByNormalizedName[normalizedName];
                        const prevShare = parseFloat(String(prev?.percentage_in_archetype || prev?.share || 0).replace(',', '.')) || 0;
                        const currentShare = parseFloat(String(card.percentage_in_archetype || card.share || 0).replace(',', '.')) || 0;
                        if (!prev || currentShare >= prevShare) {
                            cardStatsByNormalizedName[normalizedName] = card;
                        }
                    }

                    const setCode = String(card.set_code || card.set || '').toUpperCase().trim();
                    const setNumberRaw = String(card.set_number || card.number || '').trim();
                    if (setCode && setNumberRaw) {
                        const normalizedNumber = setNumberRaw.replace(/^0+/, '') || '0';
                        cardStatsBySetNumber[`${setCode}-${setNumberRaw}`] = card;
                        cardStatsBySetNumber[`${setCode}-${normalizedNumber}`] = card;
                        cardStatsBySetNumber[`${setCode}-${normalizedNumber.padStart(3, '0')}`] = card;
                    }
                }
            });
            
            // Convert deck to array with card data
            const deckCards = [];
            for (const [deckKey, count] of Object.entries(deck)) {
                if (count <= 0) continue;
                
                // Try exact match first (with SET NUM), then fallback to name only
                let cardData = cardDataByKey[deckKey] || cardDataByName[deckKey];
                
                // If still not found, extract card name from "CardName (SET NUM)" format
                if (!cardData) {
                    const baseNameMatch = deckKey.match(/^(.+?)\s*\(/);
                    if (baseNameMatch) {
                        const baseName = baseNameMatch[1];
                        const setMatch = deckKey.match(/\(([A-Z0-9]+)\s+([A-Z0-9]+)\)$/);
                        
                        if (setMatch) {
                            const setCode = setMatch[1];
                            const setNumber = setMatch[2];
                            
                            // Fast lookup using index instead of find()
                            const key = `${setCode}-${setNumber}`;
                            const exactCard = cardsBySetNumberMap ? cardsBySetNumberMap[key] : null;
                            
                            if (exactCard) {
                                const imageUrl = getUnifiedCardImage(exactCard.set, exactCard.number) || exactCard.image_url || '';
                                cardData = {
                                    card_name: exactCard.name,
                                    image_url: imageUrl,
                                    percentage_in_archetype: 0,
                                    type: exactCard.type || 'Unknown',
                                    card_type: exactCard.type || 'Unknown',
                                    set_code: exactCard.set,
                                    set_number: exactCard.number,
                                    rarity: exactCard.rarity,
                                    pokedex_number: exactCard.pokedex_number || ''
                                };
                            } else {
                                const baseCardData = cardDataByName[baseName];
                                if (baseCardData) {
                                    cardData = {
                                        ...baseCardData,
                                        set_code: setCode,
                                        set_number: setNumber
                                    };
                                }
                            }
                        } else {
                            cardData = cardDataByName[baseName];
                        }
                    }
                }
                
                if (!cardData) continue;

                const baseNameMatch = deckKey.match(/^(.+?)\s*\(/);
                const baseName = baseNameMatch ? baseNameMatch[1] : (cardData.card_name || deckKey);
                const normalizedBaseName = normalizeCardName(baseName);

                const setMatch = deckKey.match(/\(([A-Z0-9]+)\s+([A-Z0-9]+)\)$/);
                const originalSet = setMatch ? setMatch[1] : cardData.set_code;
                const originalNumber = setMatch ? setMatch[2] : cardData.set_number;

                const cardSetForStats = String(cardData.set_code || cardData.set || originalSet || '').toUpperCase().trim();
                const cardNumberForStatsRaw = String(cardData.set_number || cardData.number || originalNumber || '').trim();
                const cardNumberForStatsNormalized = cardNumberForStatsRaw.replace(/^0+/, '') || '0';
                const setNumberKeyExact = cardSetForStats && cardNumberForStatsRaw ? `${cardSetForStats}-${cardNumberForStatsRaw}` : '';
                const setNumberKeyNormalized = cardSetForStats && cardNumberForStatsNormalized ? `${cardSetForStats}-${cardNumberForStatsNormalized}` : '';

                const archetypeData =
                    (setNumberKeyExact && cardStatsBySetNumber[setNumberKeyExact]) ||
                    (setNumberKeyNormalized && cardStatsBySetNumber[setNumberKeyNormalized]) ||
                    cardDataByName[baseName] ||
                    cardStatsByNormalizedName[normalizedBaseName];
                if (archetypeData) {
                    cardData = {
                        ...cardData,
                        percentage_in_archetype: archetypeData.percentage_in_archetype || cardData.percentage_in_archetype,
                        total_count: archetypeData.total_count || archetypeData.card_count || cardData.total_count,
                        card_count: archetypeData.card_count || cardData.card_count,
                        deck_count: archetypeData.deck_count || archetypeData.deck_inclusion_count || cardData.deck_count,
                        deck_inclusion_count: archetypeData.deck_inclusion_count || archetypeData.deck_count || cardData.deck_inclusion_count,
                        total_decks_in_archetype: archetypeData.total_decks_in_archetype || archetypeData.decklist_count || archetypeData.total_decks || cardData.total_decks_in_archetype,
                        average_count: archetypeData.average_count || archetypeData.avg_count || cardData.average_count,
                        avg_count: archetypeData.avg_count || archetypeData.average_count || cardData.avg_count,
                        average_count_overall: archetypeData.average_count_overall || archetypeData.avg_count_overall || archetypeData.card_count || cardData.average_count_overall,
                        card_type: archetypeData.card_type || archetypeData.type || cardData.card_type,
                        type: archetypeData.type || archetypeData.card_type || cardData.type
                    };
                }

                const globalPref = getGlobalRarityPreference();
                const pref = getRarityPreference(baseName);
                
                // Only apply rarity preference when deck key does NOT already
                // carry an explicit set/number (i.e. user assigned via rarity switcher).
                const deckKeyHasExplicitPrint = !!setMatch;

                if (!deckKeyHasExplicitPrint && pref && pref.mode === 'specific' && pref.set && pref.number) {
                    const key = `${pref.set}-${pref.number}`;
                    const specificCard = cardsBySetNumberMap ? cardsBySetNumberMap[key] : null;
                    if (specificCard && specificCard.image_url && specificCard.name === baseName) {
                        cardData.image_url = specificCard.image_url;
                        cardData.set_code = specificCard.set;
                        cardData.set_number = specificCard.number;
                        cardData.rarity = specificCard.rarity;
                    }
                }
                else if (!deckKeyHasExplicitPrint && (globalPref === 'max' || globalPref === 'min')) {
                    if (originalSet && originalNumber) {
                        const preferredVersion = getPreferredVersionForCard(baseName, originalSet, originalNumber);
                        if (preferredVersion) {
                            const key = `${preferredVersion.set}-${preferredVersion.number}`;
                            const preferredCard = cardsBySetNumberMap ? cardsBySetNumberMap[key] : null;
                            if (preferredCard && preferredCard.image_url && preferredCard.name === baseName) {
                                cardData.image_url = preferredCard.image_url;
                                cardData.set_code = preferredCard.set;
                                cardData.set_number = preferredCard.number;
                                cardData.rarity = preferredCard.rarity;
                            }
                        }
                    }
                }
                
                // Ensure image_url is never empty before adding to deck
                if (!cardData.image_url || cardData.image_url.trim() === '') {
                    const setCode = originalSet || cardData.set_code;
                    const setNumber = originalNumber || cardData.set_number;
                    if (setCode && setNumber) {
                        cardData.image_url = getUnifiedCardImage(setCode, setNumber);
                    }
                }
                
                deckCards.push({
                    ...cardData, 
                    deck_count_in_selected: count, 
                    deck_key: deckKey,
                    original_set_code: originalSet,
                    original_set_number: originalNumber
                });
            }
            
            const sortedDeckCards = sortCardsByType(deckCards);
            
            // Build grid from deck
            let html = '';
            sortedDeckCards.forEach(card => {
                const deckKeyNameMatch = typeof card.deck_key === 'string' ? card.deck_key.match(/^(.+?)\s*\(/) : null;
                const fallbackDeckName = deckKeyNameMatch ? deckKeyNameMatch[1] : '';
                const safeCardName = (typeof card.card_name === 'string' && card.card_name.trim())
                    ? card.card_name
                    : (fallbackDeckName || 'Unknown Card');
                const setCode = card.set_code || '';
                const setNumber = card.set_number || '';
                
                // Safe image fallback chain for inconsistent M3/M4 card objects
                const cardImg = card.image || card.imageUrl || (card.images && card.images.small) || card.image_url || '';
                const safeImg = typeof cardImg === 'string' ? cardImg.replace('original', 'small') : '';

                let imageUrl = '';
                if (setCode && setNumber && cardsBySetNumberMap) {
                    imageUrl = getUnifiedCardImage(setCode, setNumber);
                    if (!imageUrl && safeImg) {
                        imageUrl = safeImg;
                    }
                } else if (safeImg) {
                    imageUrl = safeImg;
                } else {
                    imageUrl = getUnifiedCardImage(setCode, setNumber);
                }

                if (typeof imageUrl !== 'string' || imageUrl.trim() === '') {
                    imageUrl = buildCardImageUrl(setCode, setNumber, card.rarity || 'C');
                }

                imageUrl = getBestCardImage({
                    ...card,
                    card_name: safeCardName,
                    image_url: imageUrl,
                    set_code: setCode,
                    set_number: setNumber
                });
                
                const percentage = parseFloat(card.percentage_in_archetype || 0).toFixed(1);
                const count = card.deck_count_in_selected || 1;
                const cardNameEscaped = escapeJsStr(safeCardName);
                const deckKeyEscaped = escapeJsStr(card.deck_key || safeCardName);
                
                // Fast price lookup using index
                let eurPrice = '';
                let cardmarketUrl = '';
                if (setCode && setNumber && cardsBySetNumberMap) {
                    const key = `${setCode}-${setNumber}`;
                    const priceCard = cardsBySetNumberMap[key];
                    if (priceCard) {
                        eurPrice = priceCard.eur_price || '';
                        cardmarketUrl = priceCard.cardmarket_url || '';
                    }
                }
                const priceDisplay = eurPrice || '0,00€';
                const priceClass = eurPrice ? 'btn-cardmarket' : 'btn-cardmarket no-price';
                const priceBackground = eurPrice ? 'linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)' : 'linear-gradient(135deg, #777 0%, #999 100%)';
                const cardmarketUrlEscaped = escapeJsStr(cardmarketUrl || '');
                
                const baseName = safeCardName;
                const baseCardData =
                    (setCode && setNumber && (cardStatsBySetNumber[`${String(setCode).toUpperCase()}-${String(setNumber).trim()}`] || cardStatsBySetNumber[`${String(setCode).toUpperCase()}-${(String(setNumber).trim().replace(/^0+/, '') || '0')}`])) ||
                    cardDataByName[baseName] ||
                    cardStatsByNormalizedName[normalizeCardName(baseName)] ||
                    card;
                const totalCount = parseFloat(String(baseCardData.total_count || 0).replace(',', '.')) || 0;
                const cardCountOverallRaw = parseFloat(String(baseCardData.card_count || 0).replace(',', '.')) || 0;
                const decksWithCard = parseFloat(String(baseCardData.deck_count || baseCardData.deck_inclusion_count || baseCardData.decks_with_card || 0).replace(',', '.')) || 0;
                const totalDecksInArchetype = parseFloat(String(baseCardData.total_decks_in_archetype || baseCardData.decklist_count || baseCardData.total_decks || 0).replace(',', '.')) || 0;
                const shareFromDataRaw = parseFloat(String(
                    baseCardData.percentage_in_archetype ||
                    baseCardData.share ||
                    baseCardData.share_percent ||
                    baseCardData.meta_share ||
                    baseCardData.metaShare ||
                    percentage ||
                    0
                ).replace(',', '.'));
                const computedShareRaw = totalDecksInArchetype > 0 && decksWithCard > 0 ? (decksWithCard / totalDecksInArchetype) * 100 : 0;
                const fallbackShareValue = Number.isFinite(shareFromDataRaw) && shareFromDataRaw > 0 ? shareFromDataRaw : computedShareRaw;

                const avgWhenUsedRaw = parseFloat(String(baseCardData.average_count || baseCardData.avg_count || baseCardData.avgCountWhenUsed || 0).replace(',', '.'));
                const avgOverallRaw = parseFloat(String(baseCardData.average_count_overall || baseCardData.avg_count_overall || baseCardData.avgCount || baseCardData.card_count || 0).replace(',', '.'));

                // Only derive averages from totals when totals are truly available.
                // Some datasets provide card_count as an average already (not as total_count).
                const computedAvgWhenUsedRaw = (decksWithCard > 0 && totalCount > 0)
                    ? (totalCount / decksWithCard)
                    : (avgOverallRaw > 0 && totalDecksInArchetype > 0 && decksWithCard > 0
                        ? (avgOverallRaw * totalDecksInArchetype) / decksWithCard
                        : 0);
                const computedAvgOverallRaw = (totalDecksInArchetype > 0 && totalCount > 0)
                    ? (totalCount / totalDecksInArchetype)
                    : cardCountOverallRaw;
                const fallbackAvgValue = Number.isFinite(avgWhenUsedRaw) && avgWhenUsedRaw > 0
                    ? avgWhenUsedRaw
                    : (Number.isFinite(computedAvgWhenUsedRaw) && computedAvgWhenUsedRaw > 0
                        ? computedAvgWhenUsedRaw
                        : (Number.isFinite(avgOverallRaw) && avgOverallRaw > 0 ? avgOverallRaw : computedAvgOverallRaw));

                const fallbackShare = Math.max(0, fallbackShareValue).toFixed(1).replace('.', ',');
                const fallbackAvg = Math.max(0, fallbackAvgValue).toFixed(2).replace('.', ',');

                const isM3Special = ((setCode || '').toUpperCase() === 'M3')
                    || ((card.original_set_code || '').toUpperCase() === 'M3')
                    || (typeof imageUrl === 'string' && /\/M3\//i.test(imageUrl));

                let overlayText = '';
                if (fallbackShareValue > 0 || fallbackAvgValue > 0) {
                    overlayText = `${fallbackShare}% | Ø ${fallbackAvg}x`;
                } else if (isM3Special) {
                    overlayText = t('deck.m3Exclusive');
                } else {
                    overlayText = `${fallbackShare}% | Ø ${fallbackAvg}x`;
                }
                
                // Check if user owns this card (specific print)
                const cardId = `${safeCardName}|${setCode}|${setNumber}`;
                const isOwned = window.userCollection && window.userCollection.has(cardId);
                const ownedBadge = isOwned ? '<div style="position: absolute; top: 5px; left: 5px; background: #4CAF50; color: white; width: 25px; height: 25px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.5); z-index: 4;">✓</div>' : '';

                html += `
                    <div class="deck-card pos-rel" title="${safeCardName} (${count}x) - ${percentage}%">
                        <img src="${imageUrl}" alt="${safeCardName}" loading="lazy" class="card-img-std cursor-zoom" onerror="handleCardImageError(this, '${setCode}', '${setNumber}')" onclick="showSingleCard(this.src, '${cardNameEscaped} (${setCode} ${setNumber})')">
                        ${ownedBadge}
                        ${typeof getWishlistBadgeHtml === 'function' ? getWishlistBadgeHtml(safeCardName, setCode, setNumber) : ''}
                        <div class="card-max-count">${count}</div>
                        <div class="deck-card-overlay">${overlayText}</div>
                        <div class="deck-card-actions">
                            <div class="deck-card-action-row" style="grid-template-columns: 1fr 1fr 1fr;">
                                <button onclick="removeCardFromDeck('${source}', '${deckKeyEscaped}')" class="city-league-card-action-btn city-league-card-remove-btn" title="Remove from deck">-</button>
                                <button onclick="openRaritySwitcher('${cardNameEscaped}', '${deckKeyEscaped}')" class="city-league-card-action-btn city-league-card-rarity-btn" title="Switch rarity/print">★</button>
                                <button onclick="addCardToDeck('${source}', '${cardNameEscaped}', '${setCode}', '${setNumber}')" class="city-league-card-action-btn city-league-card-add-btn" title="Add to deck">+</button>
                            </div>
                            <div class="deck-card-action-row" style="grid-template-columns: 1fr 1fr 2fr;">
                                ${setCode && setNumber ? `<button onclick="openLimitlessCard('${setCode}', '${setNumber}')" class="city-league-card-action-btn city-league-card-limitless-btn" title="${t('deck.openLimitless')}">L</button>` : '<span></span>'}
                                <button onclick="addCardToProxy('${cardNameEscaped}', '${setCode}', '${setNumber}', 1)" class="city-league-card-action-btn city-league-card-proxy-btn" title="${t('deck.addToProxy')}">P</button>
                                <button class="city-league-card-action-btn city-league-card-market-btn" onclick="openCardmarket('${cardmarketUrlEscaped}', '${cardNameEscaped}')" data-market-bg="${priceBackground}" data-market-cursor="${eurPrice ? 'pointer' : 'not-allowed'}" title="${eurPrice ? t('deck.buyCardmarket') + ' ' + eurPrice : t('deck.priceUnavailable')}">${priceDisplay}</button>
                            </div>
                        </div>
                    </div>
                `;
            });
            
            const gridContainer = document.getElementById(gridContainerId);
            if (gridContainer) {
                gridContainer.innerHTML = html || getDeckBuilderEmptyStateHtml(source);
            }
        }
        
        // Filter deck grid based on search input
        function filterDeckGrid(source) {
            if (source !== 'cityLeague' && source !== 'currentMeta' && source !== 'pastMeta') return;
            
            let searchInputId, gridContainerId;
            if (source === 'cityLeague') {
                searchInputId = 'cityLeagueDeckGridSearch';
                gridContainerId = 'cityLeagueMyDeckGrid';
            } else if (source === 'currentMeta') {
                searchInputId = 'currentMetaDeckGridSearch';
                gridContainerId = 'currentMetaMyDeckGrid';
            } else if (source === 'pastMeta') {
                searchInputId = 'pastMetaDeckGridSearch';
                gridContainerId = 'pastMetaMyDeckGrid';
            }
            
            const searchInput = document.getElementById(searchInputId);
            if (!searchInput) return;
            
            const searchTerm = searchInput.value.toLowerCase().trim();
            const gridContainer = document.getElementById(gridContainerId);
            if (!gridContainer) return;
            
            const cards = gridContainer.querySelectorAll('.deck-card');
            cards.forEach(card => {
                const cardTitle = (card.getAttribute('title') || '').toLowerCase();
                if (searchTerm === '' || cardTitle.includes(searchTerm)) {
                    card.style.display = '';
                } else {
                    card.style.display = 'none';
                }
            });
        }
        
        // ========== CARD SORTING & ORGANIZATION FUNCTIONS ==========
        
        function getCardTypeCategory(cardType) {
            /**
             * Determines the category of a card based on the type field
             * type format: "GBasic", "WBasic", "PStage1", "PStage2", "Supporter", "Item", "Tool", "Stadium", "Special Energy", "Energy"
             */
            if (!cardType) return 'Pokemon';
            
            // IMPORTANT: Check Special Energy BEFORE generic energy check,
            // so that Special Energy gets its own sort category (before Basic Energy).
            const typeLower = cardType.toLowerCase();
            if (typeLower.includes('special energy')) return 'Special Energy';
            if (typeLower.includes('energy')) return 'Basic Energy';
            
            // Check if it's a Pokemon (type starts with element letter)
            if (cardType.charAt(0).match(/[GRWLPFDMNC]/)) {
                return 'Pokemon';
            }
            
            // Check exact matches for trainer types
            if (cardType === 'Supporter') return 'Supporter';
            if (cardType === 'Item') return 'Item';
            if (cardType === 'Tool') return 'Tool';
            if (cardType === 'Stadium') return 'Stadium';
            if (cardType === 'Trainer') return 'Item';
            
            // Fallback to Pokemon
            return 'Pokemon';
        }
        
        function sortCardsByType(cards) {
            /**
             * Sort cards:
             * 1. By Category (Pokemon, Supporter, Item, etc.)
             * 2. By Element (for Pokemon: G, R, W, L, P, F, D, M, N, C)
             * 3. By PERCENTAGE (highest first!)
             * 4. By Evolution Chain (keep together: Basic, Stage1, Stage2)
             * 5. By Set Number
             */
            
            // Pokemon Evolution Chains (from pokemondb.net/evolution)
            const evolutionChains = {
                'Bulbasaur': ['Bulbasaur', 'Ivysaur', 'Venusaur'],
                'Ivysaur': ['Bulbasaur', 'Ivysaur', 'Venusaur'],
                'Venusaur': ['Bulbasaur', 'Ivysaur', 'Venusaur'],
                'Charmander': ['Charmander', 'Charmeleon', 'Charizard'],
                'Charmeleon': ['Charmander', 'Charmeleon', 'Charizard'],
                'Charizard': ['Charmander', 'Charmeleon', 'Charizard'],
                'Squirtle': ['Squirtle', 'Wartortle', 'Blastoise'],
                'Wartortle': ['Squirtle', 'Wartortle', 'Blastoise'],
                'Blastoise': ['Squirtle', 'Wartortle', 'Blastoise'],
                'Pichu': ['Pichu', 'Pikachu', 'Raichu'],
                'Pikachu': ['Pichu', 'Pikachu', 'Raichu'],
                'Raichu': ['Pichu', 'Pikachu', 'Raichu'],
                'Riolu': ['Riolu', 'Lucario', 'Mega Lucario ex'],
                'Lucario': ['Riolu', 'Lucario', 'Mega Lucario ex'],
                'Mega Lucario ex': ['Riolu', 'Lucario', 'Mega Lucario ex'],
                'Eevee': ['Eevee', 'Vaporeon', 'Jolteon', 'Flareon', 'Espeon', 'Umbreon', 'Leafeon', 'Glaceon', 'Sylveon'],
                'Vaporeon': ['Eevee', 'Vaporeon', 'Jolteon', 'Flareon', 'Espeon', 'Umbreon', 'Leafeon', 'Glaceon', 'Sylveon'],
                'Jolteon': ['Eevee', 'Vaporeon', 'Jolteon', 'Flareon', 'Espeon', 'Umbreon', 'Leafeon', 'Glaceon', 'Sylveon'],
                'Flareon': ['Eevee', 'Vaporeon', 'Jolteon', 'Flareon', 'Espeon', 'Umbreon', 'Leafeon', 'Glaceon', 'Sylveon'],
                'Espeon': ['Eevee', 'Vaporeon', 'Jolteon', 'Flareon', 'Espeon', 'Umbreon', 'Leafeon', 'Glaceon', 'Sylveon'],
                'Umbreon': ['Eevee', 'Vaporeon', 'Jolteon', 'Flareon', 'Espeon', 'Umbreon', 'Leafeon', 'Glaceon', 'Sylveon'],
                'Leafeon': ['Eevee', 'Vaporeon', 'Jolteon', 'Flareon', 'Espeon', 'Umbreon', 'Leafeon', 'Glaceon', 'Sylveon'],
                'Glaceon': ['Eevee', 'Vaporeon', 'Jolteon', 'Flareon', 'Espeon', 'Umbreon', 'Leafeon', 'Glaceon', 'Sylveon'],
                'Sylveon': ['Eevee', 'Vaporeon', 'Jolteon', 'Flareon', 'Espeon', 'Umbreon', 'Leafeon', 'Glaceon', 'Sylveon'],
                'Shaymin': ['Shaymin'],
                'Dialga': ['Dialga'],
                'Palkia': ['Palkia'],
                'Kyogre': ['Kyogre'],
                'Groudon': ['Groudon'],
                'Rayquaza': ['Rayquaza'],
                'Jirachi': ['Jirachi'],
                'Deoxys': ['Deoxys'],
                'Budew': ['Budew', 'Roserade'],
                'Roserade': ['Budew', 'Roserade'],
                'Chimecho': ['Chimecho', 'Chimchar', 'Monferno', 'Infernape'],
                'Chimchar': ['Chimecho', 'Chimchar', 'Monferno', 'Infernape'],
                'Monferno': ['Chimecho', 'Chimchar', 'Monferno', 'Infernape'],
                'Infernape': ['Chimecho', 'Chimchar', 'Monferno', 'Infernape'],
                'Piplup': ['Piplup', 'Prinplup', 'Empoleon'],
                'Prinplup': ['Piplup', 'Prinplup', 'Empoleon'],
                'Empoleon': ['Piplup', 'Prinplup', 'Empoleon'],
                'Turtwig': ['Turtwig', 'Grotle', 'Torterra'],
                'Grotle': ['Turtwig', 'Grotle', 'Torterra'],
                'Torterra': ['Turtwig', 'Grotle', 'Torterra'],
                'Makuhita': ['Makuhita', 'Hariyama'],
                'Hariyama': ['Makuhita', 'Hariyama'],
                'Lunatone': ['Lunatone'],
                'Solrock': ['Solrock'],
                'Cornerstone Mask Oger': ['Cornerstone Mask Oger'],
                'Ting-Lu': ['Ting-Lu'],
                'Oricorio': ['Oricorio'],
                'Drilbur': ['Drilbur', 'Excadrill'],
                'Excadrill': ['Drilbur', 'Excadrill'],
                'Hawlucha': ['Rowlet', 'Dartrix', 'Decidueye', 'Hawlucha'],
                'Rowlet': ['Rowlet', 'Dartrix', 'Decidueye', 'Hawlucha'],
                'Dartrix': ['Rowlet', 'Dartrix', 'Decidueye', 'Hawlucha'],
                'Decidueye': ['Rowlet', 'Dartrix', 'Decidueye', 'Hawlucha'],
                'Ethan\'s Sudowoodo': ['Ethan\'s Sudowoodo'],
                'Fezandipiti ex': ['Fezandipiti ex'],
                'Mega Zygarde ex': ['Mega Zygarde ex'],
                'Escadrill': ['Escadrill'],
                'Psyduck': ['Psyduck', 'Golduck'],
                'Golduck': ['Psyduck', 'Golduck'],
                'Flutter Mane': ['Flutter Mane'],
                'Lillie\'s Certainty ex': ['Lillie\'s Certainty ex'],
                'Munkidori': ['Munkidori'],
                'Togepi': ['Togepi', 'Togetic', 'Togekiss'],
                'Togetic': ['Togepi', 'Togetic', 'Togekiss'],
                'Togekiss': ['Togepi', 'Togetic', 'Togekiss']
            };
            
            const elementOrder = {
                'G': 1,  // Grass
                'R': 2,  // Fire
                'W': 3,  // Water
                'L': 4,  // Lightning
                'P': 5,  // Psychic
                'F': 6,  // Fighting
                'D': 7,  // Darkness
                'M': 8,  // Metal
                'N': 9,  // Dragon
                'C': 10  // Colorless
            };
            
            const evolutionOrder = {
                'Basic': 1,
                'Stage1': 2,
                'Stage2': 3
            };
            
            const typeOrder = {
                'Pokemon': 1,
                'Supporter': 2,
                'Item': 3,
                'Tool': 4,
                'Stadium': 5,
                'Special Energy': 6,
                'Basic Energy': 7,
                'Energy': 7
            };
            
            const sorted = cards.sort((a, b) => {
                const cardTypeA = a.type || a.card_type || '';
                const cardTypeB = b.type || b.card_type || '';
                
                const categoryA = getCardTypeCategory(cardTypeA);
                const categoryB = getCardTypeCategory(cardTypeB);
                
                const orderA = typeOrder[categoryA] || 99;
                const orderB = typeOrder[categoryB] || 99;
                
                // FIRST: Sort by main category (Pokemon, Supporter, etc.)
                if (orderA !== orderB) {
                    return orderA - orderB;
                }
                
                // Parse percentage once for both cards
                const percA = parseFloat((a.percentage_in_archetype || '0').toString().replace(',', '.')) || 0;
                const percB = parseFloat((b.percentage_in_archetype || '0').toString().replace(',', '.')) || 0;
                
                // Helper: resolve Pokedex number from card data or global map.
                //
                // Card-name shapes we need to handle:
                //   "Garchomp ex"                 → garchomp
                //   "Cynthia's Garchomp ex"       → garchomp (trainer-possessive)
                //   "Hop's Trevenant"             → trevenant
                //   "Bloodmoon Ursaluna ex"       → ursaluna (form prefix)
                //   "Hisuian Zoroark"             → zoroark (regional)
                //   "Hisui Goomy"                 → goomy
                //   "Paldean Tauros"              → tauros
                //   "Galarian Slowking"           → slowking
                //   "Alolan Vulpix"               → vulpix
                //   "Origin Forme Dialga"         → dialga
                //   "Dusk Mane Necrozma"          → necrozma
                //   "Dawn Wings Necrozma"         → necrozma
                //   "Iron Hands ex"               → iron hands  (no prefix to strip)
                //
                // pokemon_dex_numbers.json keys cards by bare base name only,
                // so the regional/form prefixes MUST come off before the
                // lookup or the card falls to 99999 and lands in the wrong
                // pokedex position.
                function _getDexNum(card) {
                    const direct = parseInt(card.pokedex_number || card.pokedex || card.dex_number, 10);
                    if (!isNaN(direct) && direct > 0) return direct;
                    const dexMap = window.pokedexNumbers || {};
                    const rawName = String(card.card_name || card.name || '').trim().toLowerCase();
                    return _getDexNumFromName(rawName, dexMap);
                }

                // Lookup-only variant — same multi-stage fallback as
                // _getDexNum (direct → trainer-prefix-strip → form-prefix-
                // strip → ex/vmax/... suffix-strip → first-word-strip)
                // but takes a name string instead of a card object.
                // Used by _getFamilyBaseDex when walking up the
                // evolution chain.
                function _getDexNumFromName(rawName, dexMap) {
                    dexMap = dexMap || window.pokedexNumbers || {};
                    const direct = parseInt(dexMap[rawName], 10);
                    if (!isNaN(direct) && direct > 0) return direct;
                    // Strip trainer-possessive prefixes ("Cynthia's Gible" →
                    // "gible", "Hop's Trevenant" → "trevenant", etc.).
                    const trainerStripped = rawName.replace(/^[a-zäöüß]+'s\s+/, '').trim();
                    if (trainerStripped !== rawName) {
                        const stripMap = parseInt(dexMap[trainerStripped], 10);
                        if (!isNaN(stripMap) && stripMap > 0) return stripMap;
                    }
                    // Strip form / regional prefixes that the dex map doesn't
                    // index ("Bloodmoon Ursaluna ex" → "ursaluna ex"). The
                    // ex / vmax / etc. suffix strip below then drops the
                    // tail and leaves the bare base name.
                    const formStripped = trainerStripped
                        .replace(/^(?:bloodmoon|origin\s+forme|origin|dusk\s+mane|dawn\s+wings|crowned\s+sword|crowned\s+shield|crowned|hisuian|hisui|paldean|paldea|galarian|galar|alolan|alola)\s+/, '')
                        .trim();
                    if (formStripped !== trainerStripped) {
                        const formMap = parseInt(dexMap[formStripped], 10);
                        if (!isNaN(formMap) && formMap > 0) return formMap;
                    }
                    const baseName = formStripped
                        .replace(/\b(ex|vmax|vstar|v-union|v|gx|radiant|mega)\b/g, '')
                        .replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
                    const baseMap = parseInt(dexMap[baseName], 10);
                    if (!isNaN(baseMap) && baseMap > 0) return baseMap;
                    // Final fallback for unknown form prefixes not in the
                    // explicit list — drop the first word and try again.
                    // Compound species (Iron Thorns, Raging Bolt) resolve
                    // directly via baseMap above and never reach this branch.
                    const words = baseName.split(/\s+/).filter(Boolean);
                    if (words.length >= 2) {
                        const stripped = words.slice(1).join(' ');
                        const formMap = parseInt(dexMap[stripped], 10);
                        if (!isNaN(formMap) && formMap > 0) return formMap;
                    }
                    return 99999;
                }

                // Family-line grouping — walks up the evolution chain via
                // pokemon_card_effects.json's "Evolves from X" card_type
                // text and returns the dex of the BASE species. With this,
                // Dusknoir (#477) sorts alongside Dusclops (#356) and
                // Duskull (#355) under the family base dex 355 instead of
                // landing 122 numbers later in strict pokédex order. User
                // flagged: "duskull, dusclops und Dusknoir stehen immer
                // noch nicht nebeneinander" — TCG convention is to group
                // evolution lines together, not split them by Gen.
                //
                // Falls back to plain _getDexNum when card-effects isn't
                // loaded yet (e.g. the index is lazy-loaded during
                // autoCompleteConsistency; on a fresh page load before any
                // build, sort runs without it). Walk depth capped at 4 to
                // protect against malformed cycles.
                function _getFamilyBaseDex(card) {
                    const idx = (typeof window !== 'undefined') && window._cardEffectsIndex;
                    if (!idx || !idx.byName || idx.byName.size === 0) return _getDexNum(card);
                    let currentName = String(card.card_name || card.name || '').toLowerCase().trim();
                    const dexMap = window.pokedexNumbers || {};
                    for (let depth = 0; depth < 4; depth++) {
                        const eff = idx.byName.get(currentName);
                        if (!eff) break;
                        const cardType = String(eff.card_type || '').toLowerCase().trim();
                        const m = /^evolves from\s+(.+)$/.exec(cardType);
                        if (!m) break;
                        currentName = m[1].trim();
                    }
                    return _getDexNumFromName(currentName, dexMap);
                }

                // For Pokemon: sort by element type → family-base Pokedex →
                // evolution stage → share%.
                //
                // Pokedex MUST come before share% so evolution lines stay together
                // (Dreepy 885 → Drakloak 886 → Dragapult 887; Dusclops 356 → Dusknoir 477).
                // Sorting by share% first scrambles the column visually because the
                // pre-evolutions almost always carry a lower share than the final
                // form — Dusknoir (100%) would jump above Dusclops (~70%) when in
                // pokedex order Dusclops comes first. This regressed in commit
                // 410cebd ("element > share% desc > pokedex"); the share-first order
                // was the bug, not the intent.
                //
                // Family-base lookup (via card-effects "Evolves from X" walk)
                // additionally groups Dusknoir (#477) under its base species
                // Duskull (#355) so the whole Duskull → Dusclops → Dusknoir
                // line stays adjacent instead of split by Gen.
                if (categoryA === 'Pokemon' && categoryB === 'Pokemon') {
                    const elementA = cardTypeA.charAt(0);
                    const elementB = cardTypeB.charAt(0);

                    const elemOrderA = elementOrder[elementA] || 99;
                    const elemOrderB = elementOrder[elementB] || 99;

                    if (elemOrderA !== elemOrderB) {
                        return elemOrderA - elemOrderB;
                    }

                    // SAME ELEMENT: family-base Pokedex FIRST so evolution
                    // lines stay grouped (and late-Gen evolutions like
                    // Dusknoir #477 sort with Duskull #355).
                    const dexA = _getFamilyBaseDex(a);
                    const dexB = _getFamilyBaseDex(b);
                    if (dexA !== dexB) {
                        return dexA - dexB;
                    }

                    // Same Pokedex: evolution stage (Basic → Stage1 → Stage2).
                    const evolutionA = cardTypeA.substring(1).replace(/\s+/g, '');
                    const evolutionB = cardTypeB.substring(1).replace(/\s+/g, '');
                    const evolOrderA = evolutionOrder[evolutionA] || 99;
                    const evolOrderB = evolutionOrder[evolutionB] || 99;
                    if (evolOrderA !== evolOrderB) {
                        return evolOrderA - evolOrderB;
                    }

                    // Same dex + same stage (regional forms, alternate prints):
                    // share% descending picks the more-played variant first.
                    if (percA !== percB) {
                        return percB - percA;
                    }

                    // Final tiebreak: name alphabetical.
                    const nameA = a.card_name || a.name || '';
                    const nameB = b.card_name || b.name || '';
                    return nameA.localeCompare(nameB);
                }
                
                // For non-Pokemon cards: Sort by share% descending first
                if (percA !== percB) {
                    return percB - percA;
                }
                
                // Same share: sort by count/quantity (highest first)
                const countA = a.deck_count_in_selected || a.total_count || a.card_count || 0;
                const countB = b.deck_count_in_selected || b.total_count || b.card_count || 0;
                if (countA !== countB) {
                    return countB - countA;
                }
                
                // Finally by name
                const nameA = a.card_name || a.name || '';
                const nameB = b.card_name || b.name || '';
                return nameA.localeCompare(nameB);
            });

            // ── Post-pass: group different prints of the same card together ──
            //
            // The main sort above ranks cards by category → element → % → etc.
            // But different prints of the same card (e.g. 3 prints of Lillie's
            // Determination) can end up scattered if their per-print data
            // differs (counts, set numbers, etc.). A secondary grouping makes
            // sure all prints of a given card name appear adjacent.
            //
            // Algorithm preserves the overall sort order: each name group is
            // placed at the position of its first-occurring print in `sorted`.
            // Within each group, prints are sub-sorted by set code → number.
            const firstIdx = new Map();
            const groups   = new Map();
            sorted.forEach((card, idx) => {
                const rawName = card.card_name || card.name || card.name_en || '';
                const key = String(rawName).trim().toLowerCase();
                if (!groups.has(key)) {
                    groups.set(key, []);
                    firstIdx.set(key, idx);
                }
                groups.get(key).push(card);
            });
            const orderedKeys = Array.from(firstIdx.entries())
                .sort((a, b) => a[1] - b[1])
                .map(([k]) => k);
            const grouped = [];
            orderedKeys.forEach(key => {
                const list = groups.get(key);
                if (list.length > 1) {
                    list.sort((a, b) => {
                        const sa = String(a.set_code || a.set || '').toUpperCase();
                        const sb = String(b.set_code || b.set || '').toUpperCase();
                        if (sa !== sb) return sa.localeCompare(sb);
                        const na = parseInt(a.set_number || a.number, 10) || 0;
                        const nb = parseInt(b.set_number || b.number, 10) || 0;
                        return na - nb;
                    });
                }
                grouped.push(...list);
            });
            return grouped;
        }

        function deduplicateCards(cards) {
            /**
             * Fuer jede Karte (gleicher Name) nur die neueste low-rarity Version behalten
             */
            const setOrder = {
                // 2026 Sets (newest first, based on pokemon_sets_mapping.csv)
                'POR': 117, 'M3': 116, 'ASC': 115, 'PFL': 114, 'MEG': 113, 'MEE': 112, 'MEP': 111,
                'BLK': 110, 'WHT': 109, 'DRI': 108, 'JTG': 107, 'PRE': 106, 'SSP': 105,
                // 2024-2025 Sets
                'SCR': 104, 'SFA': 103, 'TWM': 102, 'TEF': 101, 'PAF': 100, 'PAR': 99,
                'MEW': 98, 'OBF': 97, 'PAL': 96, 'SVI': 95, 'SVE': 94, 'SVP': 93,
                // 2023 Sets
                'CRZ': 92, 'SIR': 91, 'LOR': 90, 'PGO': 89,
                // 2022 Sets
                'ASR': 88, 'BRS': 87, 'FST': 86, 'CEL': 85, 'EVS': 84, 'CRE': 83,
                // 2021 Sets
                'BST': 82, 'TM': 81, 'SHF': 80, 'VIV': 79, 'CPA': 78,
                // 2020 Sets
                'DAA': 77, 'RCL': 76, 'SSH': 75, 'SP': 74, 'CEC': 73
            };
            
            const rarityOrder = {
                'Common': 1,
                'Uncommon': 2,
                'Rare': 3,
                'Holo Rare': 4,
                'Ultra Rare': 5,
                'Secret Rare': 6,
                'Hyper Rare': 7,
                'Special Rare': 8,
                'Illustration Rare': 9,
                'Promo': 10
            };

            function getCardAggregationKey(card) {
                const rawName = card?.card_name || card?.name || '';
                if (typeof normalizeCardName === 'function') {
                    return normalizeCardName(rawName);
                }
                return String(rawName || '').toLowerCase().trim();
            }

            function getCanonicalDisplayName(card) {
                const rawName = card?.card_name || card?.name || '';
                const setCode = card?.set_code || card?.set || '';
                const setNumber = card?.set_number || card?.number || '';

                if (typeof getDisplayCardName === 'function') {
                    return getDisplayCardName(rawName, setCode, setNumber) || rawName;
                }

                return rawName;
            }

            function applyRepresentativePrint(target, source) {
                if (!target || !source) return;

                if (source.image_url) target.image_url = source.image_url;
                if (source.set_code) target.set_code = source.set_code;
                if (source.rarity) target.rarity = source.rarity;
                if (source.set_number) target.set_number = source.set_number;

                const canonicalName = getCanonicalDisplayName(source);
                if (canonicalName) {
                    target.card_name = canonicalName;
                    if (Object.prototype.hasOwnProperty.call(target, 'name')) {
                        target.name = canonicalName;
                    }
                }
            }
            
            const cardMap = new Map();
            
            cards.forEach(card => {
                const cardName = getCardAggregationKey(card);
                if (!cardName) return;
                if (!cardMap.has(cardName)) {
                    const entry = { ...card };
                    const canonicalName = getCanonicalDisplayName(card);
                    if (canonicalName) {
                        entry.card_name = canonicalName;
                        if (Object.prototype.hasOwnProperty.call(entry, 'name')) {
                            entry.name = canonicalName;
                        }
                    }
                    cardMap.set(cardName, entry);
                } else {
                    const existing = cardMap.get(cardName);
                    const existingSetPriority = setOrder[existing.set_code] || 0;
                    const newSetPriority = setOrder[card.set_code] || 0;
                    const existingRarityPriority = rarityOrder[existing.rarity] || 99;
                    const newRarityPriority = rarityOrder[card.rarity] || 99;
                    // Bevorzuge: 1. Low Rarity (Common/Uncommon), 2. Neuestes Set
                    if (newRarityPriority < existingRarityPriority) {
                        applyRepresentativePrint(existing, card);
                    } else if (newRarityPriority === existingRarityPriority && newSetPriority > existingSetPriority) {
                        applyRepresentativePrint(existing, card);
                    }
                    // Aggregiere max_count (höchsten Wert behalten)
                    existing.max_count = Math.max(parseInt(existing.max_count || 0), parseInt(card.max_count || 0));
                    if (!existing.set_code && existing.image_url) {
                        if (existing.image_url.includes('/M3/')) {
                            existing.set_code = 'M3';
                            devLog(`Set code M3 extracted from URL for: ${existing.card_name}`);
                        }
                    }
                }
            });
            
            // Debug: Count cards with set_code after deduplication
            const result = Array.from(cardMap.values());
            const m3Cards = result.filter(c => c.set_code === 'M3' || (c.image_url && c.image_url.includes('/M3/')));
            if (m3Cards.length > 0) {
                devLog(`After deduplicateCards: ${m3Cards.length} M3 cards. First 3:`, 
                    m3Cards.slice(0, 3).map(c => ({ name: c.card_name, set_code: c.set_code, url: c.image_url }))
                );
            }
            
            return result;
        }
        
        // ========== DECK OVERVIEW RENDERING FUNCTIONS ==========

        const deckOverviewVirtualState = {
            observer: null,
            slots: [],
            estimatedHeight: 360
        };

        function destroyDeckOverviewVirtualGrid() {
            if (deckOverviewVirtualState.observer) {
                deckOverviewVirtualState.observer.disconnect();
                deckOverviewVirtualState.observer = null;
            }
            deckOverviewVirtualState.slots = [];
        }

        function mountDeckOverviewVirtualGrid(container, cards, createNode) {
            destroyDeckOverviewVirtualGrid();
            container.textContent = '';

            const fragment = document.createDocumentFragment();
            deckOverviewVirtualState.slots = cards.map((card) => {
                const slot = document.createElement('div');
                slot.className = 'virtual-card-slot';
                slot.style.minHeight = `${deckOverviewVirtualState.estimatedHeight}px`;
                slot.dataset.rendered = 'false';
                slot._cardData = card;
                fragment.appendChild(slot);
                return slot;
            });
            container.appendChild(fragment);

            const renderSlot = (slot) => {
                if (!slot || slot.dataset.rendered === 'true') return;
                const node = createNode(slot._cardData);
                slot.textContent = '';
                if (node) {
                    slot.appendChild(node);
                    slot.dataset.rendered = 'true';
                    requestAnimationFrame(() => {
                        const measured = Math.round(slot.getBoundingClientRect().height || 0);
                        if (measured > 100) {
                            slot.style.minHeight = `${measured}px`;
                            deckOverviewVirtualState.estimatedHeight = Math.round((deckOverviewVirtualState.estimatedHeight * 0.85) + (measured * 0.15));
                        }
                    });
                }
            };

            const unrenderSlot = (slot) => {
                if (!slot || slot.dataset.rendered !== 'true') return;
                const measured = Math.round(slot.getBoundingClientRect().height || deckOverviewVirtualState.estimatedHeight);
                slot.textContent = '';
                slot.dataset.rendered = 'false';
                slot.style.minHeight = `${Math.max(100, measured)}px`;
            };

            const observer = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    const slot = entry.target;
                    if (entry.isIntersecting) {
                        renderSlot(slot);
                    } else {
                        unrenderSlot(slot);
                    }
                });
            }, {
                root: null,
                rootMargin: '600px 0px 600px 0px',
                threshold: 0.01
            });

            deckOverviewVirtualState.observer = observer;
            deckOverviewVirtualState.slots.forEach((slot, index) => {
                observer.observe(slot);
                if (index < 20) {
                    renderSlot(slot);
                }
            });
        }
        
        function renderOverviewCards(cards) {
            /**
             * Renders deck overview for City League Analysis
             * Shows cards in a responsive grid with:
             * - Card image
             * - Red circle (top-right): max_count
             * - Green circle (top-left): deck_count (how many in selected deck - starts at 0)
             * - Card name
             * - Percentage and average count
             */
            // Karten sind bereits in loadCityLeagueDeckData() dedupliziert
            const sortedCards = sortCardsByType([...cards]);
            
            // Get current deck state
            const deck = window.cityLeagueDeck || {};
            
            // Log for debugging
            devLog('RENDERED OVERVIEW CARDS - Sorted by type:');
            sortedCards.slice(0, 10).forEach((card, idx) => {
                devLog(`${idx + 1}. ${card.card_name} (${card.type || card.card_type || 'UNKNOWN'}) - ${getCardTypeCategory(card.type || card.card_type || '')}`);
            });
            
            const overviewContainer = document.getElementById('cityLeagueDeckOverview');
            if (!overviewContainer) return;

            mountDeckOverviewVirtualGrid(overviewContainer, sortedCards, (card) => {
                const imageUrl = getBestCardImage(card);
                // Konvertiere Komma zu Punkt fuer parseFloat (CSV verwendet Komma als Dezimaltrennzeichen)
                const percentageStr = (card.percentage_in_archetype || '0').toString().replace(',', '.');
                let percentage = parseFloat(percentageStr);
                // FIX: Zuerst Durchschnitt berechnen, dann Max-Wert absichern
                // totalCount already declared above, do not redeclare here.
                const decksWithCard = parseFloat(String(card.deck_count || card.deck_inclusion_count || 0).replace(',', '.')) || 0;
                const avgCountFromRow = parseFloat(String(card.average_count || card.avg_count || '').replace(',', '.'));
                const avgCountValue = Number.isFinite(avgCountFromRow) && avgCountFromRow > 0
                    ? avgCountFromRow
                    : (decksWithCard > 0 ? (totalCount / decksWithCard) : 0);
                const avgCount = Math.max(0, avgCountValue).toFixed(2).replace('.', ',');
                // Max Count sichern (darf nicht kleiner sein als gerundeter Durchschnitt)
                const rawMaxCount = parseInt(card.max_count) || 0;
                const roundedAvg = Math.round(avgCountValue);
                const maxCount = Math.max(rawMaxCount, roundedAvg) || '-';
                
                // Get actual deck count from window.cityLeagueDeck
                // Try both: card name only AND "CardName (SET NUM)" format
                let deckCount = deck[card.card_name] || 0;
                if (deckCount === 0 && card.set_code && card.set_number) {
                    const versionKey = `${card.card_name} (${card.set_code} ${card.set_number})`;
                    deckCount = deck[versionKey] || 0;
                }
                // Also check all deck keys that start with the card name
                if (deckCount === 0) {
                    for (const key in deck) {
                        if (key.startsWith(card.card_name + ' (')) {
                            deckCount += deck[key];
                        }
                    }
                }
                
                // Prefer "average in decks that use this card" for UI consistency.
                // totalCount already declared above, do not redeclare here.
                // decksWithCard already declared above, do not redeclare here.
                // avgCountFromRow already declared above, do not redeclare here.
                // ...existing code...
                
                // Card image or placeholder
                let imgHtml = '';
                if (imageUrl && imageUrl.trim() !== '') {
                    imgHtml = `<img src="${imageUrl}" alt="${card.card_name}" loading="lazy" referrerpolicy="no-referrer" style="width: 100%; aspect-ratio: 2.5/3.5; object-fit: cover; cursor: zoom-in;" onerror="handleCardImageError(this, '${card.set_code || ''}', '${card.set_number || ''}')" onclick="if (typeof event !== 'undefined' && event) event.stopPropagation(); showSingleCard(this.src, '${escapeJsStr(card.card_name)} (${card.set_code || ''} ${card.set_number || ''})');">`;
                } else {
                    imgHtml = `<div style="width: 100%; aspect-ratio: 2.5/3.5; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; font-size: 2em;"></div>`;
                }

                const html = `
                    <div class="card-item card-item-shadow">
                        <div class="pos-rel w-100">
                            ${imgHtml}
                            <!-- Red badge: Max Count (top-right) -->
                            <div class="card-badge card-badge-red pos-abs top-right">${maxCount}</div>
                            ${typeof getWishlistBadgeHtml === 'function' ? getWishlistBadgeHtml(card.card_name, card.set_code || '', card.set_number || '') : ''}
                            <!-- Green badge: Deck Count (top-left) - only show if > 0 -->
                            ${deckCount > 0 ? `<div class="card-badge card-badge-green pos-abs top-left">${deckCount}</div>` : ''}
                        </div>
                        
                        <!-- Card info section -->
                        <div style="padding: 8px; background: white; font-size: 0.75em; text-align: center; min-height: 60px; display: flex; flex-direction: column; justify-content: space-between;">
                            <div>
                                <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; margin-bottom: 3px; color: #333; font-size: 0.9em;">
                                    ${card.card_name}
                                </div>
                                <div style="color: #333; font-size: 0.75em; margin-bottom: 3px; font-weight: 600;">
                                    ${card.set_code || ''} ${card.set_number || ''}
                                </div>
                                <div style="color: #333; font-size: 0.85em; font-weight: 600;">
                                    ${percentage.toFixed(2).replace('.', ',')}% | Ø ${avgCount}x
                                </div>
                            </div>
                            
                            <!-- Add button -->
                            <button class="btn btn-success" style="padding: 4px 8px; font-size: 0.75em; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; transition: all 0.2s; margin-top: 8px; width: 100%;" onclick="addCardToDeck('cityLeague', '${escapeJsStr(card.card_name)}', '${card.set_code || ''}', '${card.set_number || ''}')" title="${t('deck.addToDeck')}">${t('deck.addToDeck')}</button>
                        </div>
                    </div>
                `;
                const wrapper = document.createElement('div');
                wrapper.innerHTML = html;
                return wrapper.firstElementChild;
            });
        }
        
        function generateDeckGrid(source) {
            if (source !== 'cityLeague' && source !== 'currentMeta' && source !== 'pastMeta') return;
            
            let deck, currentCardsKey;
            if (source === 'cityLeague') {
                deck = window.cityLeagueDeck;
                currentCardsKey = 'currentCityLeagueDeckCards';
            } else if (source === 'currentMeta') {
                deck = window.currentMetaDeck;
                currentCardsKey = 'currentCurrentMetaDeckCards';
            } else if (source === 'pastMeta') {
                deck = window.pastMetaDeck;
                currentCardsKey = null; // Past Meta uses different data source
            }
            
            if (!deck || Object.keys(deck).length === 0) {
                showToast(t('deck.empty'), 'warning');
                return;
            }
            
            const modal = document.getElementById('imageViewModal');
            const grid = document.getElementById('compactCardGrid');
            const allCards = currentCardsKey ? (window[currentCardsKey] || []) : (pastMetaFilteredCards || []);
            const allCardsDb = window.allCardsDatabase || [];
            
            // PERFORMANCE: Build map for O(1) lookups
            const cardDataMap = new Map();
            allCards.forEach(card => {
                const cardName = card.card_name || card.full_card_name;
                if (cardName) {
                    cardDataMap.set(cardName, card);
                }
            });
            
            // PERFORMANCE: Pre-build allCardsDb Map by name for O(1) lookup
            const allCardsDbMap = new Map();
            allCardsDb.forEach(card => {
                if (card.name) {
                    allCardsDbMap.set(card.name, card);
                }
            });
            
            // Convert deck to array with card data
            const deckCards = [];
            for (const [deckKey, count] of Object.entries(deck)) {
                if (count <= 0) continue;
                
                // Extract card name from deckKey (handle "CardName (SET NUM)" format)
                const baseNameMatch = deckKey.match(/^(.+?)\s*\(/);
                const cardName = baseNameMatch ? baseNameMatch[1] : deckKey;

                // Extract explicit set/number from deck key so we honour
                // the print the user picked in the Rarity Switcher.
                const setMatch = deckKey.match(/\(([A-Z0-9-]+)\s+([A-Z0-9-]+)\)$/);
                const explicitSet = setMatch ? setMatch[1] : '';
                const explicitNumber = setMatch ? setMatch[2] : '';
                
                let cardData = cardDataMap.get(cardName) || cardDataMap.get(deckKey);
                
                // If not found in analysis data, try cardsBySetNumberMap for image/type
                if (!cardData && explicitSet && explicitNumber) {
                    const dbCard = (window.cardsBySetNumberMap || {})[`${explicitSet}-${explicitNumber}`];
                    if (dbCard) {
                        cardData = {
                            card_name: dbCard.name || cardName,
                            image_url: dbCard.image_url || '',
                            type: dbCard.type || 'Unknown',
                            set_code: dbCard.set,
                            set_number: dbCard.number,
                            rarity: dbCard.rarity
                        };
                    }
                }
                
                if (!cardData) continue;

                // Override set_code / set_number so the image resolves to the
                // exact print shown in the deck builder.
                if (explicitSet && explicitNumber) {
                    cardData = { ...cardData, set_code: explicitSet, set_number: explicitNumber };
                }
                
                deckCards.push({...cardData, deck_count_in_selected: count, card_name: cardName});
            }
            
            // Sort cards using the standard sorting function
            const sortedCards = sortCardsByType(deckCards);
            
            // Check if mobile device
            const isMobile = window.innerWidth <= 768;
            
            // Build grid HTML
            grid.innerHTML = sortedCards.map(card => {
                const imageUrl = getBestCardImage(card);
                const count = card.deck_count_in_selected || 1;
                const cardName = card.card_name || '';
                const cardNameEscaped = escapeJsStr(cardName || '');
                
                if (imageUrl && imageUrl.trim() !== '') {
                    return `
                        <div class="compact-card" title="${cardName} (${count}x)" style="cursor: zoom-in;" onclick="showSingleCard(this.querySelector('img').src, '${cardNameEscaped} (${card.set_code || ''} ${card.set_number || ''})')">
                            <img src="${imageUrl}" 
                                 alt="${cardName}" 
                                 loading="lazy"
                                 referrerpolicy="no-referrer"
                                 onerror="handleCardImageError(this, '${card.set_code || ''}', '${card.set_number || ''}')">
                            <div class="compact-badge">${count}</div>
                        </div>
                    `;
                } else {
                    return `
                        <div class="compact-card" style="display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                            <div style="text-align: center;">
                                <div style="font-size: 0.8em; margin-bottom: 5px;">${cardName.substring(0, 15)}</div>
                                <div class="compact-badge" style="position: static;">${count}</div>
                            </div>
                        </div>
                    `;
                }
            }).join('');
            
            // Add mobile-specific class for compact layout
            if (isMobile) {
                grid.classList.add('mobile-compact-grid');
            } else {
                grid.classList.remove('mobile-compact-grid');
            }
            
            modal.classList.add('show');
            
            // Close on ESC key
            const escapeHandler = (e) => {
                if (e.key === 'Escape') {
                    closeImageView();
                    document.removeEventListener('keydown', escapeHandler);
                }
            };
            document.addEventListener('keydown', escapeHandler);
        }
        
        function closeImageView() {
            const modal = document.getElementById('imageViewModal');
            modal.classList.remove('show');
        }

        // ========== DECK IMAGE EXPORT (Screenshot) ==========

        /**
         * Renders the current grid view (compactCardGrid or a saved deck's card grid)
         * onto a <canvas>, then offers download / native share.
         *
         * @param {HTMLElement} gridEl  – the container whose .compact-card / card-image
         *                                children should be captured.
         * @param {string}      title   – deck name shown at the top of the image.
         */
        async function _buildDeckCanvas(gridEl, title) {
            if (!gridEl) return null;

            const cards = gridEl.querySelectorAll('.compact-card, [data-export-card]');
            if (!cards.length) return null;

            // --- Layout constants ---
            const COLS       = Math.min(cards.length, 10);
            const CARD_W     = 245;
            const CARD_H     = 342;
            const GAP        = 8;
            const PAD        = 24;
            const HEADER_H   = 56;
            const FOOTER_H   = 36;
            // Badge sized so the count is readable at thumbnail size —
            // the previous radius of 18 px (~7 % of card width) became
            // illegible when the export got resized down for chat
            // sharing.  Bumped twice now (18 → 36 → 44) so the badge has
            // the same visual weight as Limitless's deck-overview
            // screenshots — ~36 % of card width once the white stroke
            // is included, which is the threshold the user accepted as
            // "kräftig genug".
            const BADGE_R       = 44;
            const BADGE_FONT    = 'bold 40px sans-serif';
            const BADGE_STROKE  = 5;
            // Same scarlet as Limitless's deck-overview badges and the
            // .compact-badge gradient anchor in styles.css.
            const BADGE_FILL = '#e74c3c';

            const rows   = Math.ceil(cards.length / COLS);
            const canvasW = PAD * 2 + COLS * CARD_W + (COLS - 1) * GAP;
            const canvasH = PAD + HEADER_H + rows * CARD_H + (rows - 1) * GAP + FOOTER_H + PAD;

            const canvas = document.createElement('canvas');
            canvas.width  = canvasW;
            canvas.height = canvasH;
            const ctx = canvas.getContext('2d');

            // roundRect polyfill for older browsers
            if (!ctx.roundRect) {
                ctx.roundRect = function(x, y, w, h, r) {
                    if (typeof r === 'number') r = [r, r, r, r];
                    this.moveTo(x + r[0], y);
                    this.lineTo(x + w - r[1], y);
                    this.quadraticCurveTo(x + w, y, x + w, y + r[1]);
                    this.lineTo(x + w, y + h - r[2]);
                    this.quadraticCurveTo(x + w, y + h, x + w - r[2], y + h);
                    this.lineTo(x + r[3], y + h);
                    this.quadraticCurveTo(x, y + h, x, y + h - r[3]);
                    this.lineTo(x, y + r[0]);
                    this.quadraticCurveTo(x, y, x + r[0], y);
                    this.closePath();
                };
            }

            // Background gradient
            const grad = ctx.createLinearGradient(0, 0, canvasW, canvasH);
            grad.addColorStop(0, '#1a1a2e');
            grad.addColorStop(1, '#16213e');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, canvasW, canvasH);

            // Header
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 28px system-ui, -apple-system, sans-serif';
            ctx.textBaseline = 'middle';
            ctx.fillText(title || 'Deck Overview', PAD, PAD + HEADER_H / 2);

            // Card count pill
            const countText = `${cards.length} cards`;
            ctx.font = '16px system-ui, sans-serif';
            const countW = ctx.measureText(countText).width + 20;
            const pillX = canvasW - PAD - countW;
            const pillY = PAD + HEADER_H / 2 - 14;
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.beginPath();
            ctx.roundRect(pillX, pillY, countW, 28, 14);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.fillText(countText, pillX + 10, PAD + HEADER_H / 2);

            // Pre-load all card images via CORS-friendly proxy to avoid canvas tainting.
            // The Limitless CDN does NOT send Access-Control-Allow-Origin headers,
            // so we route through images.weserv.nl which proxies with CORS enabled.
            function _toCorsUrl(originalUrl) {
                if (!originalUrl || originalUrl.startsWith('data:') || originalUrl.startsWith('blob:')) return originalUrl;
                // Already CORS-friendly (same-origin, blob, data URI)
                try {
                    const u = new URL(originalUrl);
                    if (u.origin === location.origin) return originalUrl;
                } catch (_) { return originalUrl; }
                // Route external images through weserv.nl proxy (adds CORS headers)
                return 'https://images.weserv.nl/?url=' + encodeURIComponent(originalUrl);
            }

            const imgPromises = Array.from(cards).map(async (cardEl) => {
                const imgEl = cardEl.querySelector('img');
                const src = imgEl ? (imgEl.currentSrc || imgEl.src) : '';
                if (!src) return null;
                if (src.startsWith('data:')) {
                    if (imgEl && imgEl.complete && imgEl.naturalWidth > 0) return imgEl;
                    return null;
                }

                const corsUrl = _toCorsUrl(src);

                // Load image via CORS proxy
                const corsImg = await new Promise(resolve => {
                    const image = new Image();
                    image.crossOrigin = 'anonymous';
                    image.onload  = () => resolve(image);
                    image.onerror = () => resolve(null);
                    image.src = corsUrl;
                });
                if (corsImg) return corsImg;

                // Fallback: fetch via proxy as blob
                try {
                    const resp = await fetch(corsUrl, { mode: 'cors' }).catch(() => null);
                    if (resp && resp.ok) {
                        const blob = await resp.blob();
                        const blobUrl = URL.createObjectURL(blob);
                        return await new Promise(resolve => {
                            const image = new Image();
                            image.onload  = () => { URL.revokeObjectURL(blobUrl); resolve(image); };
                            image.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(null); };
                            image.src = blobUrl;
                        });
                    }
                } catch (_) { /* ignore */ }

                return null;
            });

            const images = await Promise.all(imgPromises);

            // Draw cards
            const startY = PAD + HEADER_H;
            images.forEach((img, i) => {
                const col = i % COLS;
                const row = Math.floor(i / COLS);
                const x   = PAD + col * (CARD_W + GAP);
                const y   = startY + row * (CARD_H + GAP);

                // Card shadow
                ctx.fillStyle = 'rgba(0,0,0,0.35)';
                ctx.beginPath();
                ctx.roundRect(x + 3, y + 3, CARD_W, CARD_H, 8);
                ctx.fill();

                // Card background
                ctx.fillStyle = '#2a2a3e';
                ctx.beginPath();
                ctx.roundRect(x, y, CARD_W, CARD_H, 8);
                ctx.fill();

                if (img) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.roundRect(x, y, CARD_W, CARD_H, 8);
                    ctx.clip();
                    ctx.drawImage(img, x, y, CARD_W, CARD_H);
                    ctx.restore();
                } else {
                    // Placeholder
                    ctx.fillStyle = '#555';
                    ctx.font = 'bold 16px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText('?', x + CARD_W / 2, y + CARD_H / 2);
                    ctx.textAlign = 'start';
                }

                // Badge (count) — drawn for every card including 1-of so
                // the export tells the same story as the Limitless meta
                // screenshots: glance at the thumbnail, see how many of
                // each card the deck runs.  Previously the 1-of badge
                // was suppressed and counts ≥2 used a tiny purple dot.
                const cardEl = cards[i];
                const badge = cardEl.querySelector('.compact-badge, .card-max-count');
                const badgeText = badge ? badge.textContent.trim() : '';
                if (badgeText) {
                    const bx = x + CARD_W - BADGE_R - 6;
                    const by = y + BADGE_R + 6;
                    // Soft drop-shadow so the badge stays readable on
                    // light card backgrounds (basic energies, item cards).
                    ctx.save();
                    ctx.shadowColor = 'rgba(0,0,0,0.45)';
                    ctx.shadowBlur = 8;
                    ctx.shadowOffsetY = 2;
                    ctx.fillStyle = BADGE_FILL;
                    ctx.beginPath();
                    ctx.arc(bx, by, BADGE_R, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = BADGE_STROKE;
                    ctx.beginPath();
                    ctx.arc(bx, by, BADGE_R, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.fillStyle = '#fff';
                    ctx.font = BADGE_FONT;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(badgeText, bx, by);
                    ctx.textAlign = 'start';
                    ctx.textBaseline = 'alphabetic';
                }

                // Max price badge (bottom-left, for wishlist cards)
                const maxPriceAttr = cardEl.dataset.maxPrice;
                if (maxPriceAttr) {
                    const pText = 'max ' + parseFloat(maxPriceAttr).toFixed(2).replace('.', ',') + '€';
                    ctx.font = 'bold 12px sans-serif';
                    const tw = ctx.measureText(pText).width + 10;
                    const ph = 18;
                    const px = x + 4;
                    const py = y + CARD_H - ph - 4;
                    ctx.fillStyle = 'rgba(142,68,173,0.9)';
                    ctx.beginPath();
                    ctx.roundRect(px, py, tw, ph, 4);
                    ctx.fill();
                    ctx.fillStyle = '#fff';
                    ctx.textBaseline = 'middle';
                    ctx.textAlign = 'left';
                    ctx.fillText(pText, px + 5, py + ph / 2);
                    ctx.textBaseline = 'alphabetic';
                }
            });

            // Footer
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.font = '13px system-ui, sans-serif';
            ctx.textBaseline = 'bottom';
            ctx.fillText("Hausi's Pokemon TCG Analysis", PAD, canvasH - PAD / 2);

            return canvas;
        }

        async function exportDeckAsImage(gridEl, title) {
            if (!gridEl) return;

            const cards = gridEl.querySelectorAll('.compact-card, [data-export-card]');
            if (!cards.length) {
                showToast(t('deck.empty') || 'No cards to export', 'warning');
                return;
            }

            showToast(getLang() === 'de' ? 'Bild wird erstellt...' : 'Creating image...', 'info');

            const canvas = await _buildDeckCanvas(gridEl, title);
            if (!canvas) {
                showToast(getLang() === 'de' ? 'Bild-Export fehlgeschlagen' : 'Image export failed', 'error');
                return;
            }

            // --- Export ---
            try {
                const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
                if (!blob) {
                    showToast(getLang() === 'de' ? 'Bild-Export fehlgeschlagen' : 'Image export failed', 'error');
                    return;
                }

                const safeName = (title || 'deck').replace(/[^a-zA-Z0-9äöüÄÖÜß _-]/g, '').replace(/\s+/g, '_');
                const fileName = `${safeName}_${new Date().toISOString().slice(0,10)}.png`;
                const file = new File([blob], fileName, { type: 'image/png' });

                // Mobile: native Share API → saves to photo library / WhatsApp etc.
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    try {
                        await navigator.share({ files: [file], title: title || 'Deck' });
                        showToast(getLang() === 'de' ? 'Bild geteilt!' : 'Image shared!', 'success');
                        return;
                    } catch (e) {
                        if (e.name === 'AbortError') return; // User cancelled
                        // Share failed — fall through to download
                    }
                }

                // PC / Fallback: direct download to Downloads folder
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showToast(getLang() === 'de' ? 'Bild heruntergeladen!' : 'Image downloaded!', 'success');
            } catch (e) {
                console.error('Image export error:', e);
                showToast(getLang() === 'de' ? 'Bild-Export fehlgeschlagen' : 'Image export failed', 'error');
            }
        }

        // ========== SHARE IMAGE MODAL ==========

        /** State for the Share Image Modal */
        let _shareImageBlob = null;
        let _shareImageTitle = '';

        /** Open Share Image Modal with preview of the current deck grid */
        async function openShareImageModal() {
            const grid = document.getElementById('compactCardGrid');
            const deckName = _getActiveGridDeckName();

            if (!grid || !grid.querySelectorAll('.compact-card, [data-export-card]').length) {
                showToast(getLang() === 'de' ? 'Kein Deck zum Teilen' : 'No deck to share', 'warning');
                return;
            }

            const modal = document.getElementById('shareImageModal');
            const preview = document.getElementById('shareImagePreview');
            const titleEl = document.getElementById('shareImageTitle');
            const shareBtn = document.getElementById('shareImageShareBtn');

            titleEl.textContent = (deckName || 'Deck');
            preview.innerHTML = '<p style="color:#888; font-size:1.1em;">' + (getLang() === 'de' ? 'Bild wird erstellt...' : 'Generating image…') + '</p>';
            _shareImageBlob = null;
            _shareImageTitle = deckName || 'Deck';

            modal.classList.add('show');

            // Show native share button only if supported
            const testBlob = new Blob(['test'], { type: 'image/png' });
            const testFile = new File([testBlob], 'test.png', { type: 'image/png' });
            shareBtn.style.display = (navigator.canShare && navigator.canShare({ files: [testFile] })) ? '' : 'none';

            // ESC handler
            const escHandler = (e) => {
                if (e.key === 'Escape') { closeShareImageModal(); document.removeEventListener('keydown', escHandler); }
            };
            document.addEventListener('keydown', escHandler);

            // Render canvas
            const canvas = await _buildDeckCanvas(grid, deckName);
            if (!canvas) {
                preview.innerHTML = '<p style="color:#e74c3c;">' + (getLang() === 'de' ? 'Bild konnte nicht erstellt werden' : 'Could not generate image') + '</p>';
                return;
            }

            _shareImageBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));

            if (!_shareImageBlob) {
                preview.innerHTML = '<p style="color:#e74c3c;">' + (getLang() === 'de' ? 'Bild konnte nicht erstellt werden (Canvas tainted?)' : 'Could not generate image (canvas tainted?)') + '</p>';
                return;
            }

            // Show preview as <img>. Don't revoke the object URL inside
            // onload — once revoked the browser can't re-decode if the
            // img is detached/reattached or the modal repaints, leaving
            // a broken-image icon. Track the URL on the modal element
            // and revoke when the modal closes (or the next preview
            // overwrites it).
            preview.innerHTML = '';
            if (_sharePreviewObjectUrl) {
                URL.revokeObjectURL(_sharePreviewObjectUrl);
                _sharePreviewObjectUrl = null;
            }
            const img = document.createElement('img');
            _sharePreviewObjectUrl = URL.createObjectURL(_shareImageBlob);
            img.src = _sharePreviewObjectUrl;
            img.alt = deckName;
            img.style.cssText = 'max-width:100%; border-radius:8px; box-shadow:0 4px 20px rgba(0,0,0,0.3);';
            preview.appendChild(img);
        }

        // Outlives a single openShareImageModal() call so closeShareImageModal
        // can revoke it after the user's done viewing — see openShareImageModal.
        let _sharePreviewObjectUrl = null;

        function closeShareImageModal() {
            const modal = document.getElementById('shareImageModal');
            modal.classList.remove('show');
            _shareImageBlob = null;
            if (_sharePreviewObjectUrl) {
                URL.revokeObjectURL(_sharePreviewObjectUrl);
                _sharePreviewObjectUrl = null;
            }
        }

        async function shareImageDownload() {
            if (!_shareImageBlob) {
                showToast(getLang() === 'de' ? 'Bild noch nicht bereit' : 'Image not ready yet', 'warning');
                return;
            }
            const safeName = (_shareImageTitle || 'deck').replace(/[^a-zA-Z0-9äöüÄÖÜß _-]/g, '').replace(/\s+/g, '_');
            const fileName = `${safeName}_${new Date().toISOString().slice(0,10)}.png`;
            const url = URL.createObjectURL(_shareImageBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast(getLang() === 'de' ? 'Bild gespeichert!' : 'Image saved!', 'success');
        }

        async function shareImageNative() {
            if (!_shareImageBlob) {
                showToast(getLang() === 'de' ? 'Bild noch nicht bereit' : 'Image not ready yet', 'warning');
                return;
            }
            const safeName = (_shareImageTitle || 'deck').replace(/[^a-zA-Z0-9äöüÄÖÜß _-]/g, '').replace(/\s+/g, '_');
            const fileName = `${safeName}_${new Date().toISOString().slice(0,10)}.png`;
            const file = new File([_shareImageBlob], fileName, { type: 'image/png' });
            try {
                await navigator.share({ files: [file], title: _shareImageTitle || 'Deck' });
                showToast(getLang() === 'de' ? 'Bild geteilt!' : 'Image shared!', 'success');
            } catch (e) {
                if (e.name !== 'AbortError') {
                    showToast(getLang() === 'de' ? 'Teilen fehlgeschlagen' : 'Share failed', 'error');
                }
            }
        }

        window.openShareImageModal = openShareImageModal;
        window.closeShareImageModal = closeShareImageModal;
        window.shareImageDownload = shareImageDownload;
        window.shareImageNative = shareImageNative;

        /** Export the current Grid Modal as image. */
        function exportGridModalAsImage() {
            const grid = document.getElementById('compactCardGrid');
            const deckName = _getActiveGridDeckName();
            exportDeckAsImage(grid, deckName);
        }

        /** Determine a human-readable name for the currently open grid modal deck.
         *  Tab-active check is the primary path (deck-builder workflow) but
         *  imageViewModal can also be opened from My Decks via
         *  exportSavedDeckAsImage, in which case _currentPreviewDeckIndex
         *  points at the saved deck. As a final fallback, read the
         *  imageViewModal's <h3> if a caller stamped a deck name there
         *  directly. */
        function _getActiveGridDeckName() {
            const clTab = document.getElementById('city-league-tab');
            const cmTab = document.getElementById('current-meta-tab');
            const pmTab = document.getElementById('past-meta-tab');

            if (clTab && clTab.classList.contains('active')) {
                return window.currentCityLeagueArchetype || 'City League Deck';
            }
            if (cmTab && cmTab.classList.contains('active')) {
                return window.currentMetaArchetype || 'Current Meta Deck';
            }
            if (pmTab && pmTab.classList.contains('active')) {
                return window.pastMetaCurrentArchetype || 'Past Meta Deck';
            }

            // Saved-deck path — exportSavedDeckAsImage stashes the index
            // it just opened on _currentPreviewDeckIndex. Resolve that
            // back to the user's deck name so the share image header
            // shows "MyCoolDeck" instead of the generic "Deck" fallback.
            if (typeof _currentPreviewDeckIndex !== 'undefined' && _currentPreviewDeckIndex >= 0) {
                const decks = window.userDecks || [];
                const d = decks[_currentPreviewDeckIndex];
                if (d) return d.name || d.archetype || 'Saved Deck';
            }

            // Last resort — pick up whatever the parent imageViewModal's
            // <h3> already says (callers like generateDeckGrid sometimes
            // set it to the archetype name even when their tab isn't
            // .active for whatever reason).
            const ivmTitle = document.querySelector('#imageViewModal .image-view-header h3');
            const titleText = (ivmTitle && ivmTitle.textContent || '').trim();
            if (titleText && titleText !== 'Deck Cards Overview' && titleText !== 'Deck') {
                return titleText;
            }
            return 'Deck';
        }

        // ── Deck Grid Preview Modal ──────────────────────────────────
        let _currentPreviewDeckIndex = -1;

        /** Export a saved deck (My Decks): opens grid preview modal first. */
        function exportSavedDeckAsImage(deckIndex) {
            const decks = window.userDecks || [];
            if (deckIndex < 0 || deckIndex >= decks.length) return;

            const deck = decks[deckIndex];
            const deckName = deck.name || deck.archetype || 'Saved Deck';
            const cards = deck.cards || {};

            if (!Object.keys(cards).length) {
                showToast(getLang() === 'de' ? 'Keine Karten im Deck' : 'No cards in deck', 'warning');
                return;
            }

            _currentPreviewDeckIndex = deckIndex;

            // Set title
            document.getElementById('deckGridPreviewTitle').textContent = deckName;

            // Build sorted card entries
            const sortedEntries = sortCardsByType(
                Object.entries(cards)
                    .filter(([, count]) => count > 0)
                    .map(([deckKey, count]) => {
                        const baseMatch = deckKey.match(/^(.+?)\s*\(([A-Z0-9-]+)\s+([A-Z0-9-]+)\)$/);
                        const cardName = baseMatch ? baseMatch[1] : deckKey;
                        const setCode  = baseMatch ? baseMatch[2] : '';
                        const setNumber = baseMatch ? baseMatch[3] : '';

                        let imageUrl = '';
                        if (setCode && setNumber) {
                            imageUrl = getUnifiedCardImage(setCode, setNumber);
                            if (!imageUrl && window.cardsBySetNumberMap) {
                                const dbCard = window.cardsBySetNumberMap[`${setCode}-${setNumber}`];
                                if (dbCard) imageUrl = dbCard.image_url || '';
                            }
                        }

                        return {
                            card_name: cardName,
                            set_code: setCode,
                            set_number: setNumber,
                            image_url: imageUrl,
                            type: _lookupCardType(cardName, setCode, setNumber),
                            deck_count_in_selected: count
                        };
                    })
            );

            // Consolidate international prints (same card name, different sets)
            const consolidated = [];
            const nameMap = new Map();
            sortedEntries.forEach(card => {
                const key = (card.card_name || '').trim().toLowerCase();
                if (nameMap.has(key)) {
                    const existing = nameMap.get(key);
                    existing.deck_count_in_selected = (existing.deck_count_in_selected || 1) + (card.deck_count_in_selected || 1);
                } else {
                    const entry = Object.assign({}, card);
                    nameMap.set(key, entry);
                    consolidated.push(entry);
                }
            });

            // Render card grid — one cell per unique card with count badge
            const gridContainer = document.getElementById('deckGridPreviewCards');
            gridContainer.innerHTML = '';

            const totalCards = consolidated.reduce((s, c) => s + (c.deck_count_in_selected || 1), 0);
            document.getElementById('deckGridPreviewCount').textContent = `${totalCards} ${getLang() === 'de' ? 'Karten' : 'Cards'}`;

            consolidated.forEach(card => {
                const count = card.deck_count_in_selected || 1;
                const wrapper = document.createElement('div');
                wrapper.style.cssText = 'position:relative;';

                const img = document.createElement('img');
                img.src = getBestCardImage(card);
                img.alt = card.card_name || '';
                img.style.cssText = 'width:100%; border-radius:6px; aspect-ratio:63/88; object-fit:cover; display:block;';
                img.loading = 'lazy';
                img.onerror = function() { this.src = 'images/card-back.png'; };
                wrapper.appendChild(img);

                const badge = document.createElement('div');
                badge.className = 'compact-badge';
                badge.textContent = String(count);
                wrapper.appendChild(badge);

                gridContainer.appendChild(wrapper);
            });

            // Show modal
            document.getElementById('deckGridPreviewModal').style.display = 'flex';
        }

        function closeDeckGridPreview() {
            document.getElementById('deckGridPreviewModal').style.display = 'none';
            _currentPreviewDeckIndex = -1;
        }

        /** Called by the save button inside the grid preview modal. */
        function saveDeckGridAsImage() {
            if (_currentPreviewDeckIndex < 0) return;
            const decks = window.userDecks || [];
            const deck = decks[_currentPreviewDeckIndex];
            if (!deck) return;

            const deckName = deck.name || deck.archetype || 'Saved Deck';
            const cards = deck.cards || {};

            showToast(getLang() === 'de' ? 'Bild wird erstellt...' : 'Creating image...', 'info');

            // Build temp off-screen grid for canvas export
            const sortedEntries = sortCardsByType(
                Object.entries(cards)
                    .filter(([, count]) => count > 0)
                    .map(([deckKey, count]) => {
                        const baseMatch = deckKey.match(/^(.+?)\s*\(([A-Z0-9-]+)\s+([A-Z0-9-]+)\)$/);
                        const cardName = baseMatch ? baseMatch[1] : deckKey;
                        const setCode  = baseMatch ? baseMatch[2] : '';
                        const setNumber = baseMatch ? baseMatch[3] : '';
                        let imageUrl = '';
                        if (setCode && setNumber) {
                            imageUrl = getUnifiedCardImage(setCode, setNumber);
                            if (!imageUrl && window.cardsBySetNumberMap) {
                                const dbCard = window.cardsBySetNumberMap[`${setCode}-${setNumber}`];
                                if (dbCard) imageUrl = dbCard.image_url || '';
                            }
                        }
                        return {
                            card_name: cardName, set_code: setCode, set_number: setNumber,
                            image_url: imageUrl,
                            type: _lookupCardType(cardName, setCode, setNumber),
                            deck_count_in_selected: count
                        };
                    })
            );

            const tempGrid = document.createElement('div');
            tempGrid.style.cssText = 'position:absolute;left:-9999px;top:-9999px;';
            sortedEntries.forEach(card => {
                const div = document.createElement('div');
                div.className = 'compact-card';
                div.setAttribute('data-export-card', '1');
                const img = document.createElement('img');
                img.src = getBestCardImage(card);
                div.appendChild(img);
                const badge = document.createElement('div');
                badge.className = 'compact-badge';
                badge.textContent = String(card.deck_count_in_selected || 1);
                div.appendChild(badge);
                tempGrid.appendChild(div);
            });
            document.body.appendChild(tempGrid);

            exportDeckAsImage(tempGrid, deckName).finally(() => {
                document.body.removeChild(tempGrid);
            });
        }

        /** Helper: look up card type from available indexes. */
        function _lookupCardType(cardName, setCode, setNumber) {
            if (setCode && setNumber && window.cardsBySetNumberMap) {
                const db = window.cardsBySetNumberMap[`${setCode}-${setNumber}`];
                if (db && db.type) return db.type;
            }
            if (window.cardIndexMap) {
                const c = window.cardIndexMap.get(cardName);
                if (c && c.type) return c.type;
            }
            return '';
        }
        
        function copyDeck(source) {
            devLog('[copyDeck] Called with source:', source);

            if (source === 'cityLeague') {
                copyDeckOverview();
            } else if (source === 'currentMeta') {
                copyCurrentMetaDeckOverview();
            } else if (source === 'pastMeta') {
                copyPastMetaDeckOverview();
            } else {
                devLog('[copyDeck] Unsupported source:', source);
                showToast(t('deck.notAvailable'), 'warning');
            }
        }

        /**
         * Show the "ⓘ Build Info" modal — explains why each card landed
         * in the deck after autoCompleteConsistency ran. Reads the
         * structured report we persist on window.lastConsistencyBuild
         * (keyed by source) and renders it as a styled list with the
         * algorithm header + per-card reasoning badges.
         *
         * Silently no-ops with a toast hint when no build has run yet
         * for the requested source — the user just hasn't pressed
         * "Max Consistency" on this tab in the current session.
         */
        function showConsistencyBuildInfo(source) {
            const all = window.lastConsistencyBuild || {};
            const report = all[source];
            if (!report || !Array.isArray(report.cards) || report.cards.length === 0) {
                showToast(t('buildInfo.noBuildYet') || 'Run "Max Consistency" first to see build reasoning.', 'info');
                return;
            }

            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            const modal = document.createElement('div');
            modal.className = 'modal-dialog build-info-modal';

            // Title
            const title = document.createElement('h3');
            const archLabel = report.archetype ? ` — ${report.archetype}` : '';
            title.textContent = (t('buildInfo.title') || 'Why this deck?') + archLabel + ` (${report.deck_size}/60)`;
            modal.appendChild(title);

            // Algo desc + active layers as pills
            const algoLine = document.createElement('p');
            algoLine.className = 'build-info-algo';
            algoLine.textContent = report.algo_desc || '';
            modal.appendChild(algoLine);

            const layers = report.layers || {};
            const pillRow = document.createElement('div');
            pillRow.className = 'build-info-pills';
            const addPill = (label, active) => {
                if (!active) return;
                const span = document.createElement('span');
                span.className = 'build-info-pill';
                span.textContent = label;
                pillRow.appendChild(span);
            };
            addPill('+Meta Boost', layers.meta_boost);
            addPill('+Time-Decay (last 7d full weight, decay to 21d)', layers.time_decay);
            if (layers.latest_major_anchor) {
                addPill('+Latest Major' + (layers.latest_major_date ? ` (${layers.latest_major_date})` : ''), true);
            }
            const techCats = Array.isArray(layers.tech_audit_active_categories) ? layers.tech_audit_active_categories : [];
            if (techCats.length > 0) addPill(`+Tech Audit (${techCats.join(', ')})`, true);
            if (pillRow.childElementCount > 0) modal.appendChild(pillRow);

            // Build Quality Audit — doctrine-level findings (energy
            // economy, Stadium bump for colorless engines, Mega-ex prize
            // math, opening-hand hypergeometric, ACE-SPEC prize backup).
            // Renders before the per-card list because it answers the
            // "is this build structurally sound?" question first.
            const audit = report.quality_audit || { findings: [] };
            if (Array.isArray(audit.findings) && audit.findings.length > 0) {
                const auditWrap = document.createElement('div');
                auditWrap.className = 'build-info-audit';
                const auditTitle = document.createElement('h4');
                // t() returns the literal key when no translation exists,
                // which is truthy and would defeat the `||` fallback.
                // Strip the broken-translation case explicitly.
                const _auditT = t('buildInfo.auditTitle');
                auditTitle.textContent = (_auditT && _auditT !== 'buildInfo.auditTitle')
                    ? _auditT
                    : 'Build Quality Audit';
                auditWrap.appendChild(auditTitle);
                audit.findings.forEach(f => {
                    const row = document.createElement('div');
                    row.className = `build-info-audit-row build-info-audit-${f.level || 'info'}`;
                    const icon = document.createElement('span');
                    icon.className = 'build-info-audit-icon';
                    icon.textContent = f.level === 'crit' ? '✗' : (f.level === 'warn' ? '⚠' : '✓');
                    const txt = document.createElement('div');
                    txt.className = 'build-info-audit-text';
                    const msg = document.createElement('div');
                    msg.className = 'build-info-audit-msg';
                    msg.textContent = f.message || '';
                    txt.appendChild(msg);
                    if (f.hint) {
                        const hint = document.createElement('div');
                        hint.className = 'build-info-audit-hint';
                        hint.textContent = f.hint;
                        txt.appendChild(hint);
                    }
                    row.appendChild(icon);
                    row.appendChild(txt);
                    auditWrap.appendChild(row);
                });
                modal.appendChild(auditWrap);
            }

            // ACE-SPEC pick rationale — explains why this archetype's
            // ACE-SPEC slot went to the chosen card. Latest-Major share
            // dominates picks within ~14 days of a Major (decays linear
            // to 0 by day 28); this section surfaces the actual numbers
            // so a user staring at "Secret Box at 16% archetype share"
            // can see that Secret Box won because of its 31.6% Major
            // share, not its overall popularity. Copy is plain English
            // (no t() — the modal mixes English headers with German
            // audit body and adding broken translation keys to the
            // chrome would only make it worse).
            const acePick = report.ace_spec_pick;
            if (acePick && acePick.chosen && Array.isArray(acePick.candidates) && acePick.candidates.length > 0) {
                const aceWrap = document.createElement('div');
                aceWrap.className = 'build-info-ace-pick';
                const aceTitle = document.createElement('h4');
                aceTitle.textContent = `ACE-SPEC pick — why ${acePick.chosen}?`;
                aceWrap.appendChild(aceTitle);

                const summary = document.createElement('p');
                summary.className = 'build-info-ace-summary';
                const weight = (typeof acePick.major_weight === 'number') ? acePick.major_weight : 0;
                if (acePick.has_major_anchor && weight > 0) {
                    const winner = acePick.candidates[0];
                    const winnerShare = (winner && winner.major_share != null) ? `${winner.major_share}%` : '—';
                    const winnerDecks = (winner && winner.major_deck_count > 0 && acePick.major_total_decks > 0)
                        ? `${winner.major_deck_count} of ${acePick.major_total_decks} decks`
                        : '';
                    const dateLabel = acePick.major_date || 'the latest Major';
                    const ageLabel = (acePick.major_age_days != null) ? `${acePick.major_age_days} days ago` : 'recent';
                    summary.textContent =
                        `At the latest Major (${dateLabel} · ${ageLabel}), ${acePick.chosen} was the most-played ACE-SPEC` +
                        (winnerDecks ? ` — ${winnerDecks} (${winnerShare}). ` : ` (${winnerShare}). `) +
                        `Within 14 days of a Major the picker weights it at ${Math.round(weight * 100)}% — fresh tournament results outweigh older cross-tournament Online data because they reflect what the meta is settling on right now. The Online archetype share (cross-tournament aggregate) is shown next to each candidate so you can sanity-check the gap.`;
                } else {
                    summary.textContent =
                        `No recent Major in scope — ${acePick.chosen} was picked from the highest cross-tournament Online aggregate. ` +
                        `(Major-anchor weight kicks in once an archetype shows up at a Major within the last 28 days, ` +
                        `at which point Major data overtakes Online aggregate because it's a more recent snapshot of the meta.)`;
                }
                aceWrap.appendChild(summary);

                // Candidate table — chosen highlighted, alternatives
                // listed with their Major share + deck count and the
                // online consistency score so the delta is visible at
                // a glance. We deliberately skip the blended-score
                // column (the section's prose already explains the
                // blend rule).
                const table = document.createElement('div');
                table.className = 'build-info-ace-table';
                acePick.candidates.forEach((c, i) => {
                    const row = document.createElement('div');
                    row.className = 'build-info-ace-row' + (i === 0 ? ' build-info-ace-chosen' : '');
                    const nameCell = document.createElement('span');
                    nameCell.className = 'build-info-ace-name';
                    nameCell.textContent = (i === 0 ? '✓ ' : '· ') + c.card_name;
                    row.appendChild(nameCell);

                    const statCell = document.createElement('span');
                    statCell.className = 'build-info-ace-stats';
                    const parts = [];
                    if (c.major_share != null) {
                        const fraction = (c.major_deck_count > 0 && acePick.major_total_decks > 0)
                            ? `${c.major_deck_count}/${acePick.major_total_decks}`
                            : '—';
                        parts.push(`Major ${fraction} (${c.major_share}%)`);
                    } else if (acePick.has_major_anchor) {
                        parts.push('Major: not played');
                    }
                    // Online archetype share + score side by side. The
                    // share% lets users compare to the Major fraction
                    // (e.g. "Major 31.6% but only Online 16%" makes the
                    // Major-vs-Online gap visible without reading the
                    // per-card row below).
                    const onlinePieces = [];
                    if (c.archetype_share != null) onlinePieces.push(`${c.archetype_share}% share`);
                    onlinePieces.push(`score ${c.consistency_score}`);
                    parts.push(`Online ${onlinePieces.join(', ')}`);
                    statCell.textContent = parts.join('  ·  ');
                    row.appendChild(statCell);
                    table.appendChild(row);
                });
                aceWrap.appendChild(table);
                modal.appendChild(aceWrap);
            }

            // Card reasoning list — one row per card, badges explain
            // which layer(s) contributed.
            const list = document.createElement('div');
            list.className = 'build-info-cards';
            const cards = report.cards.slice().sort((a, b) =>
                (b.consistency_score || 0) - (a.consistency_score || 0) ||
                a.card_name.localeCompare(b.card_name)
            );
            cards.forEach(c => {
                const row = document.createElement('div');
                row.className = 'build-info-card-row';
                const left = document.createElement('div');
                left.className = 'build-info-card-name';
                left.textContent = `${c.addCount}× ${c.card_name}`;
                const mid = document.createElement('div');
                mid.className = 'build-info-card-badges';
                const addBadge = (txt, cls) => {
                    if (!txt) return;
                    const b = document.createElement('span');
                    b.className = `build-info-badge ${cls || ''}`.trim();
                    b.textContent = txt;
                    mid.appendChild(b);
                };
                addBadge(`${c.share_percent}% share`, 'neutral');
                if (c.meta_share > 0) addBadge(`meta ${Math.round(c.meta_share)}%`, 'meta');
                // Time-decay shift badge: weighted_share - baseline share.
                // Only shown when the swing is >5pp so the modal isn't
                // cluttered by ±2% noise.
                const shift = parseFloat(c.weighted_share_shift || 0);
                if (Number.isFinite(shift) && Math.abs(shift) > 5) {
                    const arrow = shift > 0 ? '↑' : '↓';
                    addBadge(`recency:${arrow}${Math.abs(Math.round(shift))}%`, shift > 0 ? 'rec-up' : 'rec-down');
                }
                if (c.latest_major_anchored) addBadge('Major staple', 'major');
                if (c.latest_major_absent) addBadge('Major-absent', 'major-absent');
                if (Array.isArray(c.tech_counter_for) && c.tech_counter_for.length > 0) {
                    addBadge(`counters: ${c.tech_counter_for.join(', ')}`, 'tech');
                }
                // ACE-SPEC-conditional avg shift badge — surfaces when the
                // build re-priced this card because the chosen ACE-SPEC
                // implies a different count (e.g. Cynthia + Neo Upper →
                // 4 Fighting; Cynthia + Unfair Stamp → 5 Fighting).
                if (c.ace_spec_conditional_shift != null && c.ace_spec_conditional_base != null) {
                    const arrow = c.ace_spec_conditional_shift > 0 ? '↑' : '↓';
                    addBadge(`ACE-cond:${arrow}${c.ace_spec_conditional_base.toFixed(2)}→${c.ace_spec_conditional_avg.toFixed(2)}`, c.ace_spec_conditional_shift > 0 ? 'rec-up' : 'rec-down');
                }
                // Function-tier badge — surfaces whether the build
                // treated this card as CORE consistency, MID role, or
                // TECH (match-up-dependent). Helps the user see at a
                // glance why a 1× supporter made it in (or didn't).
                if (c.card_function && c.card_function !== 'unknown') {
                    const tier = c.card_function_tier || 'MID';
                    const tierClass = tier === 'CORE' ? 'rec-up' : (tier === 'TECH' ? 'major-absent' : 'neutral');
                    addBadge(`fn:${c.card_function}`, tierClass);
                }
                const right = document.createElement('div');
                right.className = 'build-info-card-score';
                right.textContent = `score ${c.consistency_score}`;
                row.appendChild(left);
                row.appendChild(mid);
                row.appendChild(right);
                list.appendChild(row);
            });
            modal.appendChild(list);

            // Notes — short legend so the badges aren't cryptic
            const notes = document.createElement('p');
            notes.className = 'build-info-notes';
            notes.textContent = t('buildInfo.notes') ||
                'Cards are picked from the archetype\'s actual data. "Major staple" = present in the most recent Major; "counters" = boosted because the deck already runs a counter to a currently-active meta threat. Nothing is auto-injected — only existing cards are re-prioritised.';
            modal.appendChild(notes);

            // Buttons
            const btnRow = document.createElement('div');
            btnRow.className = 'modal-btn-row';
            const closeBtn = document.createElement('button');
            closeBtn.textContent = t('btn.close') || 'Close';
            closeBtn.className = 'modal-btn-ok';
            closeBtn.onclick = () => overlay.remove();
            btnRow.appendChild(closeBtn);
            modal.appendChild(btnRow);

            overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
            document.addEventListener('keydown', function escListener(e) {
                if (e.key === 'Escape') {
                    overlay.remove();
                    document.removeEventListener('keydown', escListener);
                }
            });

            overlay.appendChild(modal);
            document.body.appendChild(overlay);
        }


        function showSingleCard(imageUrl, cardName, cardData = null) {
            const overlay = document.getElementById('fullCardOverlay') || document.getElementById('singleCardModal');
            const img = overlay?.querySelector('img') || document.getElementById('singleCardImage');
            const title = document.getElementById('singleCardTitle');

            if (!overlay || !img) return;

            const parseIdentityFromInput = () => {
                let inferredSet = '';
                let inferredNumber = '';

                const nameMatch = String(cardName || '').match(/\(([A-Z0-9]+)\s+([A-Z0-9]+)\)$/);
                if (nameMatch) {
                    inferredSet = nameMatch[1];
                    inferredNumber = nameMatch[2];
                }

                if (!inferredSet || !inferredNumber) {
                    const proxyMatch = String(imageUrl || '').match(/pokemonproxies\.com\/images\/([a-z0-9]+)\/([^/.]+)\.png/i);
                    if (proxyMatch) {
                        inferredSet = inferredSet || proxyMatch[1].toUpperCase();
                        inferredNumber = inferredNumber || proxyMatch[2];
                    }
                }

                if (!inferredSet || !inferredNumber) {
                    const limitlessMatch = String(imageUrl || '').match(/\/(M[34])\/\1_0*([A-Z0-9]+)_/i);
                    if (limitlessMatch) {
                        inferredSet = inferredSet || limitlessMatch[1].toUpperCase();
                        inferredNumber = inferredNumber || limitlessMatch[2];
                    }
                }

                return { inferredSet, inferredNumber };
            };

            const { inferredSet, inferredNumber } = parseIdentityFromInput();
            const normalizedCardData = (cardData && typeof cardData === 'object')
                ? cardData
                : {
                    card_name: String(cardName || '').replace(/\s*\([A-Z0-9]+\s+[A-Z0-9]+\)$/, ''),
                    image_url: imageUrl,
                    set_code: inferredSet,
                    set_number: inferredNumber
                };

            const resolvedImage = getBestCardImage(normalizedCardData) || imageUrl;

            img.src = resolvedImage;
            img.alt = cardName;
            img.onerror = function() {
                handleCardImageError(img, inferredSet || normalizedCardData.set_code || '', inferredNumber || normalizedCardData.set_number || '');
            };
            if (title) {
                title.textContent = cardName;
            }

            // Limitless link in zoom modal
            const modalContent = overlay.querySelector('.single-card-modal-content');
            // Remove previous action panel
            const existingPanel = overlay.querySelector('#singleCardActionsPanel');
            if (existingPanel) existingPanel.remove();
            const existingLimitlessBtn = overlay.querySelector('#singleCardLimitlessBtn');
            if (existingLimitlessBtn) existingLimitlessBtn.remove();

            const resolvedSet = inferredSet || normalizedCardData.set_code || '';
            const resolvedNum = inferredNumber || normalizedCardData.set_number || '';
            const resolvedName = String(cardName || '').replace(/\s*\([A-Z0-9]+\s+[A-Z0-9]+\)$/, '');
            const cardId = `${resolvedName}|${resolvedSet}|${resolvedNum}`;

            if (modalContent) {
                const panel = document.createElement('div');
                panel.id = 'singleCardActionsPanel';
                panel.className = 'single-card-actions-panel';
                panel.onclick = function(e) { e.stopPropagation(); };

                const isW = window.userWishlist && window.userWishlist.has(cardId);
                const isOwned = window.userCollection && window.userCollection.has(cardId);
                const ownedCount = window.userCollectionCounts ? (window.userCollectionCounts.get(cardId) || 0) : 0;
                const safeCardId = cardId.replace(/'/g, "\\'");
                const safeCardName = resolvedName.replace(/'/g, "\\'");

                let btns = '';
                // Wishlist
                btns += `<button class="sc-action-btn sc-action-wishlist${isW ? ' active' : ''}" onclick="toggleWishlist('${safeCardId}'); setTimeout(()=>{const p=document.getElementById('singleCardActionsPanel'); if(p){const b=p.querySelector('.sc-action-wishlist'); const w=window.userWishlist&&window.userWishlist.has('${safeCardId}'); b.classList.toggle('active',w); b.querySelector('.sc-action-icon').textContent=w?'♥':'♡'; b.querySelector('.sc-action-label').textContent=w?t('action.wishlistActive'):t('action.wishlist');}},200);">
                    <span class="sc-action-icon">${isW ? '♥' : '♡'}</span>
                    <span class="sc-action-label">${isW ? t('action.wishlistActive') : t('action.wishlist')}</span>
                </button>`;
                // Collection +
                btns += `<button class="sc-action-btn sc-action-collect" onclick="if(typeof toggleCollection==='function')toggleCollection('${safeCardId}')">
                    <span class="sc-action-icon">+</span>
                    <span class="sc-action-label">${t('action.collection')}${ownedCount ? ' (' + ownedCount + 'x)' : ''}</span>
                </button>`;
                // Rarity / Print
                btns += `<button class="sc-action-btn sc-action-rarity" onclick="if(typeof openRaritySwitcher==='function')openRaritySwitcher('${safeCardName}','${safeCardName} (${resolvedSet} ${resolvedNum})')">
                    <span class="sc-action-icon">★</span>
                    <span class="sc-action-label">${t('action.otherPrint')}</span>
                </button>`;
                // Limitless
                if (resolvedSet && resolvedNum) {
                    btns += `<a class="sc-action-btn sc-action-limitless" href="https://limitlesstcg.com/cards/${encodeURIComponent(resolvedSet)}/${encodeURIComponent(resolvedNum)}" target="_blank" rel="noopener noreferrer">
                        <span class="sc-action-icon">L</span>
                        <span class="sc-action-label">${t('action.openLimitless')}</span>
                    </a>`;
                }
                // Proxy
                btns += `<button class="sc-action-btn sc-action-proxy" onclick="if(typeof addCardToProxy==='function')addCardToProxy('${safeCardName}','${resolvedSet}','${resolvedNum}',1)">
                    <span class="sc-action-icon">P</span>
                    <span class="sc-action-label">${t('action.printProxy')}</span>
                </button>`;
                // Cardmarket
                btns += `<button class="sc-action-btn sc-action-market" onclick="if(typeof openCardmarket==='function')openCardmarket('','${safeCardName}')">
                    <span class="sc-action-icon">€</span>
                    <span class="sc-action-label">${t('action.cardmarket')}</span>
                </button>`;

                panel.innerHTML = btns;
                modalContent.appendChild(panel);
            }

            document.body.style.overflow = 'hidden';

            // Cancel any pending hide-timeout from a previous close
            if (overlay._hideTimeout) {
                clearTimeout(overlay._hideTimeout);
                overlay._hideTimeout = null;
            }
            overlay._closing = false;

            overlay.style.removeProperty('display');
            overlay.classList.remove('d-none');
            // Force reflow before adding animation class
            overlay.classList.add('active');
            overlay.classList.add('show');
            void overlay.offsetWidth;
            img.classList.add('active');

            if (window._singleCardOverlayClickHandler) {
                overlay.removeEventListener('click', window._singleCardOverlayClickHandler);
            }
            window._singleCardOverlayClickHandler = function(e) {
                if (e.target === overlay) hideSingleCard();
            };
            overlay.addEventListener('click', window._singleCardOverlayClickHandler);
            img.onclick = function(e) { e.stopPropagation(); };

            // Escape-Taste schließt das Modal
            if (window._singleCardEscHandler) {
                document.removeEventListener('keydown', window._singleCardEscHandler);
            }
            window._singleCardEscHandler = (e) => {
                if (e.key === 'Escape') {
                    hideSingleCard();
                    document.removeEventListener('keydown', window._singleCardEscHandler);
                    window._singleCardEscHandler = null;
                }
            };
            document.addEventListener('keydown', window._singleCardEscHandler);
        }

        function hideSingleCard() {
            const overlay = document.getElementById('fullCardOverlay') || document.getElementById('singleCardModal');
            if (!overlay) return;
            // Re-entrancy guard: prevent double-close from duplicate handlers
            if (overlay._closing) return;
            overlay._closing = true;

            const img = overlay.querySelector('img') || document.getElementById('singleCardImage');
            overlay.classList.remove('active');
            overlay.classList.remove('show');
            if (img) {
                img.classList.remove('active');
            }

            if (window._singleCardOverlayClickHandler) {
                overlay.removeEventListener('click', window._singleCardOverlayClickHandler);
                window._singleCardOverlayClickHandler = null;
            }

            document.body.style.overflow = '';

            if (window._singleCardEscHandler) {
                document.removeEventListener('keydown', window._singleCardEscHandler);
                window._singleCardEscHandler = null;
            }

            // CSS uses display:none !important on :not(.active):not(.show),
            // so removing those classes already hides the modal instantly.
            // Clean up inline display and d-none for consistency.
            overlay.style.removeProperty('display');
            overlay.classList.remove('d-flex');
            overlay.classList.add('d-none');

            // Allow reopen after brief delay
            if (overlay._hideTimeout) clearTimeout(overlay._hideTimeout);
            overlay._hideTimeout = setTimeout(() => {
                overlay._hideTimeout = null;
                overlay._closing = false;
            }, 100);
        }

        // Backward compatibility for existing inline handlers.
        function closeSingleCard() {
            hideSingleCard();
        }

        // Safety net: if body.overflow is stuck on 'hidden' but no modal is
        // visible, restore scrollability.  This prevents "frozen page" bugs.
        if (!window.__overflowSafetyBound) {
            setInterval(() => {
                if (document.body.style.overflow !== 'hidden') return;
                const singleModal = document.getElementById('singleCardModal') || document.getElementById('fullCardOverlay');
                const isVisible = singleModal && (singleModal.classList.contains('active') || singleModal.classList.contains('show'));
                if (!isVisible) {
                    document.body.style.overflow = '';
                }
            }, 2000);
            window.__overflowSafetyBound = true;
        }

        // One-shot bulk rarity swap: walks the active deck and replaces
        // each card's print with the highest- OR lowest-rarity print
        // available in the global card database. Drives the "↑ Max
        // Rarity" / "↓ Low Rarity" toggle in the deck-builder action
        // row — replaces the old Low / Max regenerate buttons that
        // nobody used. Counts and the deck-order array are preserved:
        // if a deck has 2× Poké Pad (SVI 042) + 2× Poké Pad (PAF 187),
        // they collapse to 4× Poké Pad on whichever print wins.
        //
        // `direction` is either 'max' (highest-rank print) or 'min'
        // (lowest-rank print). The two public wrappers below preserve
        // the legacy one-way entrypoints used elsewhere.
        function _swapDeckRarity(source, direction) {
            const dir = direction === 'min' ? 'min' : 'max';
            let deck, orderKey, saveFn;
            if (source === 'cityLeague') {
                deck = window.cityLeagueDeck;
                orderKey = 'cityLeagueDeckOrder';
                saveFn = typeof saveCityLeagueDeck === 'function' ? saveCityLeagueDeck : null;
            } else if (source === 'currentMeta') {
                deck = window.currentMetaDeck;
                orderKey = 'currentMetaDeckOrder';
                saveFn = typeof saveCurrentMetaDeck === 'function' ? saveCurrentMetaDeck : null;
            } else if (source === 'pastMeta') {
                deck = window.pastMetaDeck;
                orderKey = 'pastMetaDeckOrder';
                saveFn = typeof savePastMetaDeck === 'function' ? savePastMetaDeck : null;
            } else {
                return 0;
            }
            if (!deck || Object.keys(deck).filter(k => deck[k] > 0).length === 0) {
                if (typeof showToast === 'function') showToast(t('deck.noCardsToAdd'), 'warning');
                return 0;
            }
            if (!window.allCardsDatabase || !window.allCardsDatabase.length) {
                if (typeof showToast === 'function') showToast(t('cards.notLoadedYet') || 'Card database not loaded yet...', 'warning');
                return 0;
            }

            const rank = typeof getRarityRank === 'function' ? getRarityRank : (() => 0);
            const norm = typeof normalizeCardName === 'function' ? normalizeCardName : (s => String(s || '').toLowerCase().trim());

            const newDeck = {};
            const order = Array.isArray(window[orderKey]) ? window[orderKey].slice() : Object.keys(deck);
            const newOrder = [];
            let swaps = 0;

            const seenInOrder = new Set();
            const pushKey = (key, count) => {
                if (!key || count <= 0) return;
                newDeck[key] = (newDeck[key] || 0) + count;
                if (!seenInOrder.has(key)) {
                    newOrder.push(key);
                    seenInOrder.add(key);
                }
            };

            const keys = order.length ? order : Object.keys(deck);
            const allKeys = new Set(keys);
            Object.keys(deck).forEach(k => allKeys.add(k));

            allKeys.forEach(key => {
                const count = deck[key] || 0;
                if (count <= 0) return;
                const m = String(key).match(/^(.+?)\s*\(([A-Z0-9-]+)\s+([A-Z0-9-]+)\)$/);
                if (!m) { pushKey(key, count); return; }
                const cardName = m[1];
                const currentSet = m[2];
                const currentNumber = m[3];
                const wantedName = norm(cardName);

                // Name-only match collapses 16 different Yveltal prints (different attacks) into one pool; international_prints lists true reprints across sets.
                const sourceCard = (window.allCardsDatabase || []).find(c =>
                    c && c.set && String(c.set).toUpperCase() === String(currentSet).toUpperCase() &&
                    String(c.number).toUpperCase() === String(currentNumber).toUpperCase()
                );
                const intlRaw = (sourceCard && sourceCard.international_prints) || '';
                const intlSet = new Set(String(intlRaw).split(',').map(s => s.trim()).filter(Boolean).map(s => s.toUpperCase()));
                intlSet.add(`${String(currentSet).toUpperCase()}-${String(currentNumber).toUpperCase()}`);

                const prints = (window.allCardsDatabase || []).filter(c => {
                    if (!c || !c.type || !String(c.type).trim()) return false;
                    if (!c.set || !c.number) return false;
                    const id = `${String(c.set).toUpperCase()}-${String(c.number).toUpperCase()}`;
                    if (!intlSet.has(id)) return false;
                    return norm(c.name || '') === wantedName || norm(c.name_en || '') === wantedName;
                });
                if (!prints.length) { pushKey(key, count); return; }

                // Pick the print the user actually wants. Three-tier
                // comparator so the result is deterministic and matches
                // the button label literally:
                //   1. Effective rarity — Max picks the highest, Low
                //      the lowest. The default getRarityRank chart
                //      places Promo (3) below plain Rare (4), but in
                //      practice Promos out of dedicated promo sets
                //      (MEP, SVP, SP, SMP, …) are stamped-foil reprints
                //      and are the premium collectible version of the
                //      card. Lunatone case: ASC 105 Rare + MEG 74 Rare
                //      + MEP 4 Promo — Max should pick MEP 4. We bump
                //      the rank of those Promos above Rare so the
                //      collector hierarchy lines up.
                //   2. Set release date — among same-rank prints, Max
                //      AND Low both prefer the newer set so the
                //      printed card looks current at the table. This
                //      is the fix for "low rarity should be the latest
                //      print": Poké Pad PFL 042 (2026-01) wins over
                //      PAR 042 (2023-11) when both are Common.
                //   3. Price — final tiebreaker among prints in the
                //      same set with identical rank. Max picks the
                //      pricier (likely reverse-holo / special), Low
                //      picks the cheapest.
                const PROMO_SET_CODES = new Set([
                    'MEP', 'SVP', 'SP', 'SMP', 'XYP', 'BWP', 'HSP', 'DPP', 'NP', 'WP',
                ]);
                // Promo Premium tier — sits between Triple Rare (9)
                // and Art Rare (10) so it beats plain Rare (4) and
                // every common/uncommon, but stays below the modern
                // alt-art tier where the truly premium prints live.
                const PROMO_PREMIUM_RANK = 10;
                const effectiveRank = (c) => {
                    const base   = rank(c && c.rarity);
                    const code   = String(c && c.set || '').toUpperCase();
                    const isPromo = String(c && c.rarity || '').toLowerCase() === 'promo';
                    if (isPromo && PROMO_SET_CODES.has(code)) {
                        return Math.max(base, PROMO_PREMIUM_RANK);
                    }
                    return base;
                };
                const priceVal = (c) => {
                    const raw = c && c.eur_price;
                    if (!raw) return null;
                    const n = parseFloat(String(raw).replace(/[^0-9,.\-]/g, '').replace(',', '.'));
                    return isFinite(n) && n > 0 ? n : null;
                };
                const releaseTs = (c) => {
                    const code = String(c && c.set || '').toUpperCase();
                    const map = (typeof window !== 'undefined' && window.SET_RELEASE_DATES) || {};
                    const iso = map[code] || map.DEFAULT || '2000-01-01';
                    const t  = Date.parse(iso);
                    return isFinite(t) ? t : 0;
                };
                const isBetter = (cand, current) => {
                    // 1. Effective rarity rank — direction-aware.
                    const cr = effectiveRank(cand);
                    const br = effectiveRank(current);
                    if (cr !== br) {
                        return dir === 'max' ? cr > br : cr < br;
                    }
                    // 2. Set release date — newer wins regardless of
                    //    direction; both Max and Low want a current print.
                    const ct = releaseTs(cand);
                    const bt = releaseTs(current);
                    if (ct !== bt) return ct > bt;

                    // 3. Price — direction-aware.
                    const cp = priceVal(cand);
                    const bp = priceVal(current);
                    if (cp != null && bp != null && cp !== bp) {
                        return dir === 'max' ? cp > bp : cp < bp;
                    }
                    // Same set + same rank + same/missing price: prefer
                    // the one that has a price at all (signals a real,
                    // traded print rather than a data-gap entry).
                    return cp != null && bp == null;
                };
                let best = prints[0];
                for (let i = 1; i < prints.length; i++) {
                    if (isBetter(prints[i], best)) best = prints[i];
                }
                const bestSet = String(best.set || '').toUpperCase();
                const bestNum = String(best.number || '').toUpperCase();
                if (bestSet === String(currentSet).toUpperCase() && bestNum === String(currentNumber).toUpperCase()) {
                    pushKey(key, count);
                    return;
                }
                const newKey = `${cardName} (${bestSet} ${bestNum})`;
                pushKey(newKey, count);
                swaps++;
            });

            if (source === 'cityLeague') window.cityLeagueDeck = newDeck;
            else if (source === 'currentMeta') window.currentMetaDeck = newDeck;
            else if (source === 'pastMeta') window.pastMetaDeck = newDeck;
            window[orderKey] = newOrder;

            if (saveFn) { try { saveFn(); } catch (_e) { /* swallow — re-render still happens */ } }
            if (typeof updateDeckDisplay === 'function') updateDeckDisplay(source);

            if (typeof showToast === 'function') {
                if (swaps === 0) {
                    const noneKey = dir === 'max' ? 'deck.upgradeRarityNone' : 'deck.downgradeRarityNone';
                    const noneFallback = dir === 'max' ? 'All cards already at highest rarity.' : 'All cards already at lowest rarity.';
                    const tpl = t(noneKey);
                    showToast(tpl && tpl !== noneKey ? tpl : noneFallback, 'info');
                } else {
                    // Separate singular / plural keys so each language can
                    // pluralise naturally (EN: card → cards, DE: Karte →
                    // Karten) without a one-letter suffix hack.
                    const base = dir === 'max' ? 'deck.upgradeRarity' : 'deck.downgradeRarity';
                    const key = base + (swaps === 1 ? '1' : 'N');
                    const fallback = dir === 'max'
                        ? (swaps === 1 ? '1 card upgraded to max rarity.' : '{n} cards upgraded to max rarity.')
                        : (swaps === 1 ? '1 card reverted to low rarity.' : '{n} cards reverted to low rarity.');
                    const tpl = t(key);
                    const msg = (tpl && tpl !== key ? tpl : fallback).replace('{n}', swaps);
                    showToast(msg, 'success');
                }
            }
            return swaps;
        }

        function upgradeDeckToMaxRarity(source) { return _swapDeckRarity(source, 'max'); }
        function downgradeDeckToLowRarity(source) { return _swapDeckRarity(source, 'min'); }

        // Stateful toggle for the "↑ Max Rarity" / "↓ Low Rarity"
        // button in the deck-builder action row. Reads `data-mode`
        // off the button to know which direction the NEXT click
        // should swap, flips it post-swap, and re-labels via the
        // i18n keys above. data-mode="max" means the next click
        // upgrades; data-mode="min" means the next click downgrades.
        // A fresh deck always starts at low rarity, so HTML sets
        // data-mode="max" initially.
        function toggleDeckRarity(source, buttonEl) {
            const direction = (buttonEl && buttonEl.dataset && buttonEl.dataset.mode === 'min') ? 'min' : 'max';
            _swapDeckRarity(source, direction);
            if (buttonEl) {
                const next = direction === 'max' ? 'min' : 'max';
                buttonEl.dataset.mode = next;
                const labelKey = next === 'max' ? 'deck.upgradeRarity' : 'deck.downgradeRarity';
                const titleKey = next === 'max' ? 'deck.upgradeRarityTitle' : 'deck.downgradeRarityTitle';
                const labelFallback = next === 'max' ? '↑ Max Rarity' : '↓ Low Rarity';
                const titleFallback = next === 'max'
                    ? 'Swap every card in the current deck to its highest-rarity print'
                    : 'Swap every card in the current deck back to its lowest-rarity print';
                const labelTpl = t(labelKey);
                const titleTpl = t(titleKey);
                buttonEl.textContent = labelTpl && labelTpl !== labelKey ? labelTpl : labelFallback;
                buttonEl.setAttribute('title', titleTpl && titleTpl !== titleKey ? titleTpl : titleFallback);
                buttonEl.setAttribute('data-i18n', labelKey);
                buttonEl.setAttribute('data-i18n-title', titleKey);
            }
        }

        // Reset a deck-rarity toggle button back to its "next click
        // upgrades" baseline. Called after Auto-Generate so the label
        // tracks the freshly-built (low-rarity) deck.
        function resetDeckRarityToggle(source) {
            try {
                const btn = document.querySelector('button[data-rarity-toggle="' + source + '"]');
                if (!btn) return;
                btn.dataset.mode = 'max';
                const labelTpl = t('deck.upgradeRarity');
                const titleTpl = t('deck.upgradeRarityTitle');
                btn.textContent = labelTpl && labelTpl !== 'deck.upgradeRarity' ? labelTpl : '↑ Max Rarity';
                btn.setAttribute('title', titleTpl && titleTpl !== 'deck.upgradeRarityTitle' ? titleTpl : 'Swap every card in the current deck to its highest-rarity print');
                btn.setAttribute('data-i18n', 'deck.upgradeRarity');
                btn.setAttribute('data-i18n-title', 'deck.upgradeRarityTitle');
            } catch (_e) { /* swallow — toggle is cosmetic */ }
        }

        window.upgradeDeckToMaxRarity = upgradeDeckToMaxRarity;
        window.downgradeDeckToLowRarity = downgradeDeckToLowRarity;
        window.toggleDeckRarity = toggleDeckRarity;
        window.resetDeckRarityToggle = resetDeckRarityToggle;

        function autoComplete(source, rarityMode) {
            if (source !== 'cityLeague' && source !== 'currentMeta' && source !== 'pastMeta') return;
            
            // CRITICAL: Clear all specific rarity preferences before generating deck
            // This ensures the selected rarity mode (min/max) is applied correctly
            rarityPreferences = {};
            saveRarityPreferences();
            
            // Set global rarity preference based on button clicked
            if (rarityMode) {
                globalRarityPreference = rarityMode;
            }
            
            let cardsKey, cards;
            if (source === 'cityLeague') {
                cardsKey = 'currentCityLeagueDeckCards';
                cards = window[cardsKey];
            } else if (source === 'currentMeta') {
                cardsKey = 'currentCurrentMetaDeckCards';
                cards = window[cardsKey];
            } else if (source === 'pastMeta') {
                cards = pastMetaCurrentCards; // Use the currently selected deck cards
            }
            
            if (!cards || cards.length === 0) {
                showToast(t('deck.noCardsToAdd'), 'warning');
                return;
            }
            
            devLog('[autoComplete] Starting autoComplete for', source);
            devLog('[autoComplete] Total available cards:', cards.length);
            
            // ===================================================================
            // CRITICAL FIX: Always clear deck when generating
            // This ensures we build a fresh deck from scratch, not add to existing
            // ===================================================================
            devLog('[autoComplete] Clearing existing deck to build fresh...');
            if (source === 'cityLeague') {
                window.cityLeagueDeck = {};
                window.cityLeagueDeckOrder = [];
                saveCityLeagueDeck();
            } else if (source === 'currentMeta') {
                window.currentMetaDeck = {};
                window.currentMetaDeckOrder = [];
                saveCurrentMetaDeck();
            } else if (source === 'pastMeta') {
                window.pastMetaDeck = {};
                window.pastMetaDeckOrder = [];
                savePastMetaDeck();
            }
            
            // Get current archetype (for saving later)
            let currentArchetype;
            if (source === 'cityLeague') {
                currentArchetype = window.currentCityLeagueArchetype;
            } else if (source === 'currentMeta') {
                currentArchetype = window.currentMetaArchetype;
            } else if (source === 'pastMeta') {
                currentArchetype = window.pastMetaCurrentArchetype;
            }
            devLog('[autoComplete] Building deck for archetype:', currentArchetype);
            
            // Get deck reference and initialize card counter
            let deck;
            if (source === 'cityLeague') {
                deck = window.cityLeagueDeck;
            } else if (source === 'currentMeta') {
                deck = window.currentMetaDeck;
            } else if (source === 'pastMeta') {
                deck = window.pastMetaDeck;
            }
            let currentTotal = 0; // Start from 0 since we just cleared the deck
            
            // Step 1: Aggregate cards by card_name (sum deck_count across all tournaments)
            const uniqueCards = {};
            for (const card of cards) {
                const cardName = card.card_name;
                
                if (!uniqueCards[cardName]) {
                    uniqueCards[cardName] = {
                        ...card,
                        deck_count: parseInt(card.deck_count || 0),
                        total_count: parseFloat(card.total_count || 0),
                        max_count: parseInt(card.max_count || 0)
                    };
                } else {
                    uniqueCards[cardName].deck_count += parseInt(card.deck_count || 0);
                    uniqueCards[cardName].total_count += parseFloat(card.total_count || 0);
                    uniqueCards[cardName].max_count = Math.max(
                        parseInt(uniqueCards[cardName].max_count || 0),
                        parseInt(card.max_count || 0)
                    );
                }
            }
            
            const resolvedTotalDecks = resolveBuilderTotalDecks(source, currentArchetype, cards, uniqueCards);

            // Recalculate percentage_in_archetype for each card based on aggregated deck_count
            // Cap total_count at legal maximum (Ace Spec/Radiant = 1, Basic Energy = 59, else = 4)
            for (const cardName in uniqueCards) {
                const card = uniqueCards[cardName];
                const legalMaxCopies = getLegalMaxCopies(cardName, card);
                card.total_count = Math.min(card.total_count, card.deck_count * legalMaxCopies);
                const deckCount = card.deck_count;
                const percentage = Math.min(100, Math.max(0, (deckCount / resolvedTotalDecks) * 100));
                card.total_decks_in_archetype = resolvedTotalDecks;
                card.percentage_in_archetype = percentage.toFixed(2).replace('.', ',');
            }
            
            // ===================================================================
            // COMBINED VARIANTS: Group by strict base name, merge set prints,
            // and use mathematically correct recommendedCount.
            // ===================================================================
            const variantGroups = {};
            for (const cardName in uniqueCards) {
                const baseName = getStrictBaseCardName(cardName);
                if (!variantGroups[baseName]) variantGroups[baseName] = [];
                variantGroups[baseName].push(uniqueCards[cardName]);
            }

            const mergedUniqueCards = {};
            for (const baseName in variantGroups) {
                const group = variantGroups[baseName];
                if (group.length === 1) {
                    // Single print — keep as-is
                    mergedUniqueCards[baseName] = group[0];
                } else {
                    // Multiple prints — merge via Combined Variant Stats
                    const stats = calculateCombinedVariantStats(group, resolvedTotalDecks);
                    // Pick the variant with the highest deck_count as representative
                    const bestVariant = group.reduce((best, v) =>
                        (parseFloat(v.deck_count || 0) > parseFloat(best.deck_count || 0)) ? v : best, group[0]);
                    mergedUniqueCards[baseName] = {
                        ...bestVariant,
                        card_name: stats.baseName || bestVariant.card_name,
                        percentage_in_archetype: stats.combinedShare.toFixed(2).replace('.', ','),
                        sharePercent: stats.combinedShare,
                        avgCountWhenUsed: stats.combinedAvgWhenUsed,
                        _recommendedCount: stats.recommendedCount,
                        _legalMax: stats.legalMax,
                        _isMerged: group.length > 1
                    };
                    devLog(`[autoComplete][CombinedVariants] Merged ${group.length} prints of "${baseName}" → share=${stats.combinedShare}%, avg=${stats.combinedAvgWhenUsed}, rec=${stats.recommendedCount}`);
                }
            }
            
            let deckCards = Object.values(mergedUniqueCards);
            devLog('[autoComplete] After aggregation:', deckCards.length, 'unique cards');
            
            // Debug: Log all card types to understand structure
            const typeSet = new Set();
            deckCards.forEach(card => {
                const type = card.type || card.card_type || '';
                typeSet.add(type);
            });
            devLog('[autoComplete] Card types found:', Array.from(typeSet));
            
            // Step 2: Sort by percentage (descending)
            deckCards.sort((a, b) => {
                const percentageA = parseFloat((a.percentage_in_archetype || '0').toString().replace(',', '.'));
                const percentageB = parseFloat((b.percentage_in_archetype || '0').toString().replace(',', '.'));
                return percentageB - percentageA;
            });
            
            let cardsToAdd = [];
            const addedNames = new Set(Object.keys(deck).filter(name => deck[name] > 0));
            
            // ===================================================================
            // CRITICAL: Step 3 - Add Ace Spec FIRST (highest percentage, max 1x)
            // ===================================================================
            // Find all Ace Spec cards and sort by percentage
            const aceSpecCards = deckCards.filter(card => isAceSpec(card));
            aceSpecCards.sort((a, b) => {
                const percentageA = parseFloat((a.percentage_in_archetype || '0').toString().replace(',', '.'));
                const percentageB = parseFloat((b.percentage_in_archetype || '0').toString().replace(',', '.'));
                return percentageB - percentageA; // Sort descending by percentage
            });
            
            // Add the MOST USED Ace Spec (highest percentage) - exactly 1 copy
            let bestAceSpec = null;
            if (aceSpecCards.length > 0) {
                bestAceSpec = aceSpecCards[0]; // First one = highest percentage
                const acePercentage = parseFloat((bestAceSpec.percentage_in_archetype || '0').toString().replace(',', '.'));
                devLog('[autoComplete] ACE SPEC SELECTED:', bestAceSpec.card_name, `(${acePercentage}%)`);
                
                if (!addedNames.has(bestAceSpec.card_name)) {
                    cardsToAdd.push({ ...bestAceSpec, addCount: 1 });
                    addedNames.add(bestAceSpec.card_name);
                    currentTotal += 1;
                    devLog('[autoComplete] Added Ace Spec (1x):', bestAceSpec.card_name);
                } else {
                    devLog('[autoComplete] Ace Spec already in deck:', bestAceSpec.card_name);
                }
            } else {
                devLog('[autoComplete] WARNING: No Ace Spec found in deck list!');
            }
            
            
            // ===================================================================
            // Step 4: Add remaining cards from 100% downwards until deck is full
            // ===================================================================
            devLog('[autoComplete] Building deck from highest percentage downwards...');
            
            let radiantAdded = false; // Deck-wide: max 1 Radiant Pokémon total
            
            // Cards are already sorted by percentage (descending) from Step 2
            for (const card of deckCards) {
                if (currentTotal >= 60) {
                    devLog('[autoComplete] Deck complete (60 cards) - stopping');
                    break;
                }
                const cardName = card.card_name;
                if (addedNames.has(cardName)) continue;
                if (isAceSpec(card)) { devLog('[autoComplete] Skipping Ace Spec (already added):', cardName); continue; }
                if (isRadiantPokemon(cardName)) { if (radiantAdded) { devLog('[autoComplete] Skipping Radiant (deck already has one):', cardName); continue; } radiantAdded = true; }
                const percentage = parseFloat((card.percentage_in_archetype || '0').toString().replace(',', '.'));
                // --- LARGEST REMAINDER METHOD ---
                let addCount;
                let exactAvg = 0;
                if (card._recommendedCount != null) {
                    addCount = card._recommendedCount;
                    exactAvg = card.avgCountWhenUsed || card._recommendedCount;
                } else {
                    const totalCount = parseFloat(card.total_count) || 0;
                    const decksWithCard = parseFloat(card.deck_count || card.deck_inclusion_count) || 0;
                    const avgCountFromRow = parseFloat(String(card.average_count || card.avg_count || '').replace(',', '.'));
                    const avgWhenUsed = Number.isFinite(avgCountFromRow) && avgCountFromRow > 0 ? avgCountFromRow : (decksWithCard > 0 ? (totalCount / decksWithCard) : 1);
                    exactAvg = avgWhenUsed;
                    addCount = Math.round(avgWhenUsed);
                }
                const legalMax = card._legalMax || getLegalMaxCopies(cardName, card);
                if (!isBasicEnergy(cardName)) {
                    addCount = Math.max(1, Math.min(addCount, legalMax));
                } else {
                    addCount = Math.max(1, addCount);
                }
                addCount = Math.min(addCount, 60 - currentTotal);
                if (addCount > 0) {
                    cardsToAdd.push({ ...card, addCount: addCount, exactAvg: exactAvg });
                    addedNames.add(cardName);
                    currentTotal += addCount;
                }
            }
            // --- FEHLENDE KARTEN INTELLIGENT AUFFÜLLEN ---
            // ===================================================================
            // FIX: FALLBACK - Deck auf exakt 60 Karten auffüllen
            // ===================================================================
            if (currentTotal < 60) {
                devLog(`[autoComplete] Deck has only ${currentTotal} cards. Filling up to 60...`);
                // 1. Priorität: Largest Remainder (Nachkommastelle) für Trainer/Pokémon
                cardsToAdd.sort((a, b) => {
                    const remA = (a.exactAvg || 0) % 1;
                    const remB = (b.exactAvg || 0) % 1;
                    return remB - remA;
                });
                for (let i = 0; i < cardsToAdd.length && currentTotal < 60; i++) {
                    const cardToAdd = cardsToAdd[i];
                    const legalMax = cardToAdd._legalMax || getLegalMaxCopies(cardToAdd.card_name, cardToAdd);
                    if (cardToAdd.addCount < legalMax || isBasicEnergy(cardToAdd.card_name)) {
                        cardToAdd.addCount++;
                        currentTotal++;
                    }
                }
                // 2. absolute Notfall-Priorität: Basis-Energie reindrücken
                if (currentTotal < 60) {
                    const topBasicEnergy = deckCards.find(c => {
                        const typeStr = String(c.type || c.card_type || '').toLowerCase();
                        const nameStr = String(c.card_name || '').toLowerCase();
                        return typeStr.includes('basis-energie') || typeStr === 'basic energy' || nameStr.includes('energy');
                    });
                    if (topBasicEnergy) {
                        const spaceLeft = 60 - currentTotal;
                        const existing = cardsToAdd.find(c => c.card_name === topBasicEnergy.card_name);
                        if (existing) {
                            existing.addCount += spaceLeft;
                        } else {
                            cardsToAdd.push({ ...topBasicEnergy, addCount: spaceLeft });
                            addedNames.add(topBasicEnergy.card_name);
                        }
                        currentTotal += spaceLeft;
                        devLog(`[autoComplete] Fallback: Added ${spaceLeft}x ${topBasicEnergy.card_name} to reach 60`);
                    }
                }
            }
            // --- ENDE FIX ---
            
            
            devLog('[autoComplete] Total cards to add:', currentTotal, 'in', cardsToAdd.length, 'unique entries');
            
            // Show summary grouped by type
            let summary = `${t('deck.autoCompleteHeader')} ${currentTotal} ${t('deck.cards')}:\n\n`;
            let pokemon = [], trainer = [], energy = [];
            
            cardsToAdd.forEach(card => {
                const cardType = card.type || card.card_type || '';
                const category = getCardTypeCategory(cardType);
                const line = `${card.addCount}x ${card.card_name}`;
                
                if (category === 'Pokemon') pokemon.push(line);
                else if (category === 'Basic Energy' || category === 'Special Energy') energy.push(line);
                else trainer.push(line);
            });
            
            if (pokemon.length > 0) summary += `${t('deck.pokemon')}\n${pokemon.join('\n')}\n\n`;
            if (trainer.length > 0) summary += `${t('deck.trainer')}\n${trainer.join('\n')}\n\n`;
            if (energy.length > 0) summary += `${t('deck.energy')}\n${energy.join('\n')}`;
            
            devLog('[autoComplete] Summary:', summary);
            {
                // Add all cards to deck using PREFERRED versions (newest low-rarity)
                cardsToAdd.forEach(card => {
                    // CRITICAL: Get preferred version for this card to match Grid View display
                    const originalSetCode = card.set_code || '';
                    const originalSetNumber = card.set_number || '';
                    const preferredVersion = getPreferredVersionForCard(card.card_name, originalSetCode, originalSetNumber);
                    
                    let setCode, setNumber;
                    if (preferredVersion) {
                        setCode = preferredVersion.set;
                        setNumber = preferredVersion.number;
                        devLog(`[autoComplete] Using PREFERRED version for ${card.card_name}: ${setCode} ${setNumber} (${preferredVersion.rarity})`);
                    } else {
                        // Fallback to original if no preferred version found
                        setCode = originalSetCode;
                        setNumber = originalSetNumber;
                        devLog(`[autoComplete] No preferred version for ${card.card_name}, using original: ${setCode} ${setNumber}`);
                    }
                    
                    // PERFORMANCE: Use batch add (no display updates per card)
                    for (let i = 0; i < card.addCount; i++) {
                        addCardToDeckBatch(source, card.card_name, setCode, setNumber);
                    }
                });

                const normalizedTotal = normalizeGeneratedDeckTo60(source, cardsToAdd, deckCards);
                devLog(`[autoComplete] Final normalized deck size: ${normalizedTotal}`);
                devLog('[autoComplete] Deck completed with rarity mode:', globalRarityPreference);
                
                // Save deck to localStorage
                if (source === 'cityLeague') {
                    saveCityLeagueDeck();
                } else if (source === 'currentMeta') {
                    saveCurrentMetaDeck();
                } else if (source === 'pastMeta') {
                    savePastMetaDeck();
                }
                
                // PERFORMANCE: Update display ONCE at the end (not 60 times!)
                scheduleDeckDisplayUpdate(source);
                if (typeof resetDeckRarityToggle === 'function') resetDeckRarityToggle(source);
            }
        }

        /**
         * Auto-Complete with Max Consistency Algorithm
         * Based on Justin Basil's Professional Deck Building Guide:
         * - Deck Skeleton: 20 Pokemon, 30 Trainer, 10 Energy (+-3 deviation normal)
         * - Opening Hand Probabilities: 4x = 40%, 3x = 32%, 2x = 22%, 1x = 12%
         * - Consistency Score = (Share %) * (Avg Count) * (Reliability Factor) * (Meta Relevance Factor)
         * - Meta Relevance: Cards with high meta-share are prioritized (tech cards against meta)
         * - Smart Copy Counts based on usage patterns and probability math
         */
        
        // Helper: Get meta share for a card (if meta analysis is loaded)
        function getMetaShareForCard(cardName, source) {
            const metaData = source === 'cityLeague' ? metaCardData.cityLeague : 
                           source === 'currentMeta' ? metaCardData.currentMeta : null;
            
            if (!metaData || metaData.length === 0) return 0;
            
            const metaCard = metaData.find(c => c.card_name === cardName);
            return metaCard ? metaCard.metaShare : 0;
        }

        function resolveBuilderTotalDecks(source, currentArchetype, rawCards, uniqueCards) {
            const explicitTotals = (rawCards || [])
                .map(card => parseInt(card.total_decks_in_archetype || card.total_decks || 0, 10))
                .filter(value => Number.isFinite(value) && value > 0);

            const inferredDeckCount = Object.values(uniqueCards || {}).reduce((maxValue, card) => {
                const deckCount = parseInt(card.deck_count || card.deck_inclusion_count || 0, 10) || 0;
                return Math.max(maxValue, deckCount);
            }, 0);

            const cityLeagueFallback = source === 'cityLeague'
                ? getCityLeagueDeckCountFallback(currentArchetype)
                : 0;

            return Math.max(1, cityLeagueFallback, inferredDeckCount, ...explicitTotals);
        }

        // W3 Phase 0 — Online tournament attendance signal.
        //
        // Each row carries `total_players` (parsed upstream from the
        // "Nth of TOTAL" text in the per-deck history row — free signal,
        // no extra HTTP fetch). Phase 0 only PLUMBS the field through;
        // Phase 1 consumes it as a per-bucket attendance weight
        // (≥ threshold → 0.8, < threshold → 0.2) so small online events
        // still contribute (rogue-deck detection) but with reduced
        // influence.
        //
        // Threshold is settable via window so tests / dev can override.
        // Reference: docs/audit/deck-builder-consistency/08-w3-refactor-plan.md
        if (typeof window.ONLINE_ATTENDANCE_TIER_THRESHOLD === 'undefined') {
            window.ONLINE_ATTENDANCE_TIER_THRESHOLD = 250;
        }
        function _onlineAttendanceWeight(totalPlayers) {
            const threshold = Number(window.ONLINE_ATTENDANCE_TIER_THRESHOLD) || 250;
            const tp = parseInt(totalPlayers, 10) || 0;
            // 0 = unknown (pre-Phase-0 scrapes) → treated as small, the
            // conservative-low bucket. Once the scraper re-runs and
            // populates total_players, real values dominate.
            return tp >= threshold ? 0.8 : 0.2;
        }
        if (typeof window !== 'undefined') {
            window._onlineAttendanceWeight = _onlineAttendanceWeight;
        }

        // Lazy-load Limitless dated tournament rows (per-tournament breakdown
        // of the same Online events that current_meta_card_data.csv aggregates
        // by `meta` bucket). Cached on window after first call.  Used by the
        // currentMeta recency-scoring path: aggregate rows have no dates, so
        // the recency block can only produce signal once we feed in this
        // per-tournament source.
        async function loadOnlineTournamentDatedRows() {
            if (Array.isArray(window.onlineTournamentDatedRows)) {
                return window.onlineTournamentDatedRows;
            }
            if (window._onlineTournamentDatedPromise) {
                return await window._onlineTournamentDatedPromise;
            }
            window._onlineTournamentDatedPromise = (async () => {
                try {
                    const rows = await loadCSV('online_tournament_dated_cards.csv');
                    // Phase 0 — load all rows, no drop-filter. Attendance
                    // weighting is applied at the per-bucket aggregation
                    // step in Phase 1 (so small online events still
                    // contribute to rogue-deck detection at reduced
                    // weight, instead of being silently excluded).
                    window.onlineTournamentDatedRows = Array.isArray(rows) ? rows : [];
                } catch (e) {
                    devLog('[OnlineTournamentDated] Could not load dated CSV:', e);
                    window.onlineTournamentDatedRows = [];
                }
                return window.onlineTournamentDatedRows;
            })();
            return await window._onlineTournamentDatedPromise;
        }

        // Smooth time-decay weight for tournament age (days since today).
        // Replaces the binary 14-day cutoff.
        //   0–7d   = 1.0   (last 7 days carry full weight — Regional-Day-0
        //                   should dominate for one cycle)
        //   7–21d  = linear 1.0 → 0.4   (Online players adapting their lists)
        //   21–42d = linear 0.4 → 0.1   (3-week relevance horizon)
        //   > 42d  = 0.05               (background residue, not 0 so very
        //                                old archetypes still emit fallback
        //                                signal instead of producing NaN)
        function _recencyWeight(ageDays) {
            if (!Number.isFinite(ageDays) || ageDays < 0) return 1.0;
            if (ageDays <= 7) return 1.0;
            if (ageDays <= 21) return 1.0 - ((ageDays - 7) / 14) * 0.6;
            if (ageDays <= 42) return 0.4 - ((ageDays - 21) / 21) * 0.3;
            return 0.05;
        }
        if (typeof window !== 'undefined') window._recencyWeight = _recencyWeight;

        // ────────────────────────────────────────────────────────────
        // CARD FUNCTION CLASSIFIER — turns the raw text rules from
        // pokemon_card_effects.json into a small set of consistency-
        // relevant function tags so the builder can tell a 4× search
        // item ("structurally important", same role every game) apart
        // from a 1× damage-buff supporter ("tech sprinkle", only useful
        // in specific match-ups). Without this, Black Belt's Training
        // ("attacks do 40 more damage to opponent's ex Pokémon") and
        // Poké Pad ("search your deck for a Pokémon") look identical
        // to the score-based gate — both are Supporter/Item-level
        // cards with similar archetype share — and the build can pick
        // a 1-of tech over a 4th copy of a core search engine.
        //
        // Function tiers used downstream:
        //   CORE  — core-draw, search-pokemon, search-energy,
        //           search-trainer, draw, pokemon-engine.
        //           These are the deck's consistency layer; LRM and
        //           Stage 2 favour them.
        //   MID   — pivot, gust, energy-recovery, attacker, stadium,
        //           energy. Default; no priority adjustment.
        //   TECH  — damage-buff, healing, defense-tool, disruption.
        //           Match-up-dependent. Stage 2 raises the threshold
        //           and LRM lowers their effective remainder so a
        //           consistency-leaning build emerges.
        //
        // Pure helper: no DOM, no network. Takes a card object plus an
        // optional effects record (the value out of
        // pokemon_card_effects.json keyed by `SET|number`) and returns
        // one of the function tags above (or 'unknown' when there is
        // genuinely nothing to go on).
        // ────────────────────────────────────────────────────────────
        function _classifyCardFunction(card, effects) {
            const cardType = String(
                (card && (card.type || card.card_type))
                || (effects && effects.card_type)
                || ''
            ).toLowerCase();

            // Energy first — covers basic + special; most reliable signal.
            if (/\b(basic|special)\s*energy\b/.test(cardType)) return 'energy';
            if (cardType.includes('basis-energie')) return 'energy';

            // Stadium next.
            if (cardType.includes('stadium')) return 'stadium';

            // Pull effect text from rules (Trainers) or abilities + attacks
            // (Pokémon). Concatenate so a single regex pass can hit any.
            const rulesText = (effects && Array.isArray(effects.rules))
                ? effects.rules.join(' ').toLowerCase() : '';
            const abilitiesText = (effects && Array.isArray(effects.abilities))
                ? effects.abilities.map(a => `${a.name || ''} ${a.text || ''}`).join(' ').toLowerCase()
                : '';

            // Pokémon — classify by ABILITY text (the consistency-relevant
            // surface). Drakloak ("Recon Directive — look at top 2"),
            // Dudunsparce ("Run Away Draw"), Fezandipiti ex ("Flip the
            // Script"), Meowth ex ("Last-Ditch Catch"), Noctowl all
            // surface here as 'pokemon-engine'. Plain attackers fall
            // through to 'attacker'.
            if (cardType.includes('basic') || cardType.includes('stage 1') || cardType.includes('stage 2') || cardType.includes('evolves from')) {
                if (/\b(draw \d+|draw cards|until you have \d+ cards|search your deck|put.*into your hand|look at the top)\b/.test(abilitiesText)) {
                    return 'pokemon-engine';
                }
                return 'attacker';
            }

            // Trainer (Item / Supporter / Tool) — read the rules text.
            const text = rulesText;

            // Tools. Damage-boost tools (Maximum Belt, Choice Band) are
            // TECH. Defense tools (Hero's Cape, Lillie's Sunny Smile,
            // Cynthia's Power Weight) get +HP / can't be KO'd → TECH
            // (defense-tool). Mobility tools (Air Balloon — retreat
            // reduction) are MID — they're structural movement aids,
            // not match-up sprinkles.
            if (cardType.includes('tool')) {
                if (/\b\d+\s*more\s*damage\b/.test(text) || /damage to your opponent's active pok/.test(text) || /damage from this pok[eé]mon/.test(text)) {
                    return 'damage-buff';
                }
                // Retreat-cost reduction → mobility tool (Air Balloon,
                // Float Stone). Treat as 'pivot' so LRM weights it
                // alongside Switch / Switch Cart instead of as TECH.
                if (/retreat cost.*(?:less|\bis\b)\s*\[?\s*c\s*\]?\s*\[?\s*c\s*\]?/.test(text) || /no retreat cost/.test(text)) {
                    return 'pivot';
                }
                // Defense tools — both "+N HP" (Hero's Cape, Power
                // Weight) and "HP +N" wording, plus the OHKO-block
                // and damage-reduction families.
                if (/\+\s*\d+\s*hp\b/.test(text) || /\bhp\b[^.]{0,40}\+\s*\d+/.test(text)
                    || /can't be knocked out/.test(text) || /prevent.*knocked/.test(text)
                    || /reduce.*damage/.test(text) || /takes\s*\d+\s*less\s*damage/.test(text)) {
                    return 'defense-tool';
                }
                return 'tech';
            }

            // Search items / supporters. Order matters: check
            // "search ... pok[eé]mon" first so the broader branch
            // doesn't catch energy-only searches. Fighting Gong
            // ("search a Basic [F] Energy OR a Basic [F] Pokémon")
            // hits the pokemon branch; that's the right tier
            // (broader strategic role).
            if (/search your deck for[^.]*pok[eé]mon/.test(text)) return 'search-pokemon';
            // Energy search: only check the "search ... energy" clause,
            // not the whole text. Crispin reads "Search your deck for
            // ... 2 Basic Energy cards ... Attach the other to 1 of
            // your Pokémon" — the second clause mentions Pokémon for
            // ATTACH context, not search context. Restrict the
            // pokemon-exclusion to just the search clause itself.
            const energySearchMatch = text.match(/search your deck for[^.]*energy[^.]*/);
            if (energySearchMatch && !/pok[eé]mon/.test(energySearchMatch[0])) return 'search-energy';
            // Supporter search — "search your deck for ... Supporter",
            // OR Pokégear-style "look at the top N cards of your deck.
            // You may reveal a Supporter card".
            if (/search your deck for[^.]*supporter/.test(text)) return 'search-trainer';
            if (/look at the top \d+ cards.*supporter card/.test(text)) return 'search-trainer';

            // Energy recovery (basic energy from discard → attach).
            if (/\b(attach|put|move).*basic.*energy.*(?:discard|to)\b/.test(text)) return 'energy-recovery';
            if (/take a (basic )?energy.*from your discard/.test(text)) return 'energy-recovery';

            // Pivot vs Gust — the same "switch" verb but on different
            // sides of the table.
            if (/switch.*opponent['']s benched/.test(text) || /switch.*opponent['']s active.*with.*opponent['']s/.test(text)) return 'gust';
            if (/switch your active/.test(text)) return 'pivot';

            // Healing — both numeric ("heal 30 damage") and the
            // "heal all damage from..." pattern (Wally's Compassion,
            // Super Potion).
            if (/\bheal \d+ damage\b/.test(text)) return 'healing';
            if (/heal all damage/.test(text)) return 'healing';

            // Damage buff supporters (Black Belt's Training, Premium
            // Power Pro, Calamitous Wasteland). Must come BEFORE the
            // disruption check — Black Belt's Training mentions "ex
            // Pokémon" but isn't disruption.
            if (/\b\d+\s*more\s*damage\b/.test(text) || /attacks.*do additional .*\d+ damage/.test(text) || /\d+ more damage to your opponent's active pok/.test(text)) {
                return 'damage-buff';
            }

            // Core draw — the Lillie's Determination / Iono / Roxanne
            // mould (shuffle hand into deck, then draw N).
            if (/shuffle your hand.*into your deck.*draw/.test(text)) return 'core-draw';

            // Disruption — opponent hand reset / deck shuffle.
            if (/each player shuffles? their hand into their deck/.test(text)) return 'disruption';
            if (/your opponent shuffles? their hand/.test(text)) return 'disruption';
            if (/(?:put|reveal).*opponent['']s.*deck/.test(text)) return 'disruption';

            // Generic draw (Pokégear-style "search for a Supporter" is
            // already caught above; this is the residual "draw N").
            if (/\bdraw \d+ cards?\b/.test(text) || /\bdraw cards until\b/.test(text)) return 'draw';

            return 'unknown';
        }
        if (typeof window !== 'undefined') window._classifyCardFunction = _classifyCardFunction;

        // Map card-function tags to a tier (CORE / MID / TECH) the
        // builder uses for Stage-2 gating + LRM remainder weighting.
        const _CARD_FUNCTION_TIERS = {
            'core-draw': 'CORE',
            'search-pokemon': 'CORE',
            'search-energy': 'CORE',
            'search-trainer': 'CORE',
            'draw': 'CORE',
            'pokemon-engine': 'CORE',
            'pivot': 'MID',
            'gust': 'MID',
            'energy-recovery': 'MID',
            'attacker': 'MID',
            'stadium': 'MID',
            'energy': 'MID',
            'damage-buff': 'TECH',
            'healing': 'TECH',
            'defense-tool': 'TECH',
            'disruption': 'TECH',
            'tech': 'TECH',
            'unknown': 'MID',
        };
        function _functionTier(fn) {
            return _CARD_FUNCTION_TIERS[fn] || 'MID';
        }
        if (typeof window !== 'undefined') {
            window._CARD_FUNCTION_TIERS = _CARD_FUNCTION_TIERS;
            window._functionTier = _functionTier;
        }

        // Energy multiplier — how many "Energy attachments" a single
        // copy of the card provides when attached. Most basic and
        // special energies provide 1 (multiplier 1). A few "double"
        // energies provide 2 (multiplier 2):
        //   - Neo Upper Energy (TEF 162): "provides only 2 Energy at a
        //     time" when attached to a Stage 2 Pokémon.
        //   - Legacy Energy (PFL 86): "provides 2 [C] Energy".
        //   - Double Turbo Energy (BRS 151): "provides 2 [C] Energy"
        //     (legality-dependent).
        //
        // The deck-card-count of energies stays the same (1 card per
        // copy) — but the doctrine-relevant "effective energy supply"
        // is 2× for double-energy cards. Energy Floor enforcement
        // uses the multiplier to compute the right per-card contribution
        // when checking whether a deck has enough effective energy.
        function _energyProvides(card, effects) {
            if (!effects) return 1;
            const rules = (Array.isArray(effects.rules) ? effects.rules.join(' ') : '').toLowerCase();
            // "provides 2 Energy" / "provides only 2 Energy" / "provides
            // 2 [C] Energy" — all match the same intent.
            if (/provides[^.]*?\b2\s*(?:\[\s*[a-z]\s*\])?\s*energy/.test(rules)) return 2;
            if (/provides[^.]*?\b3\s*(?:\[\s*[a-z]\s*\])?\s*energy/.test(rules)) return 3;
            return 1;
        }
        if (typeof window !== 'undefined') window._energyProvides = _energyProvides;

        // ────────────────────────────────────────────────────────────
        // CARD DEPENDENCY DETECTOR — surfaces hard prerequisites that
        // a card's ability/attack text expresses. Without these, a
        // card's value is structurally compromised:
        //
        //   needs-tool      — ability fires only "If this Pokémon has
        //                     a Pokémon Tool attached" (Genesect SFA's
        //                     ACE Nullifier is the user-flagged case).
        //                     Including the Pokémon without a Tool
        //                     leaves the slot stranded.
        //
        // Returned as a Set of dependency tags. Empty Set = no hard
        // prerequisites detected. The post-build resolution pass
        // (`_resolveCardDependencies`) demotes stranded cards whose
        // tags can't be satisfied by the rest of the deck.
        //
        // The set of tags is intentionally small — only patterns we
        // CAN detect reliably AND CAN check downstream. Match-state-
        // dependent texts ("If your opponent has 2 Prize cards
        // remaining") are out of scope: the builder doesn't model
        // game state.
        // ────────────────────────────────────────────────────────────
        function _detectCardDependencies(card, effects) {
            const deps = new Set();
            if (!effects) return deps;
            const abilitiesText = (Array.isArray(effects.abilities) ? effects.abilities : [])
                .map(a => `${a.name || ''} ${a.text || ''}`).join(' ').toLowerCase();
            const attacksText = (Array.isArray(effects.attacks) ? effects.attacks : [])
                .map(a => `${a.name || ''} ${a.text || ''}`).join(' ').toLowerCase();
            const rulesText = (Array.isArray(effects.rules) ? effects.rules : []).join(' ').toLowerCase();
            const text = abilitiesText + ' ' + attacksText + ' ' + rulesText;

            // "If this Pokémon has a Pokémon Tool attached" / "if a
            // Pokémon Tool is attached to this Pokémon" / "this
            // Pokémon has a Pokémon Tool attached".
            // Excludes "tool from this pokémon" (discard tool wording).
            if (/(if|while)[^.]{0,40}pok[eé]mon tool[^.]{0,40}attach/.test(text)) {
                deps.add('needs-tool');
            }
            if (/has a pok[eé]mon tool attached/.test(text)) {
                deps.add('needs-tool');
            }

            return deps;
        }
        if (typeof window !== 'undefined') window._detectCardDependencies = _detectCardDependencies;

        // ──────────────────────────────────────────────────────────
        // Co-occurrence detection
        //
        // Builds a per-card synergy map from per-tournament rows. Two
        // cards "synergy-bind" each other when they appear together in
        // ≥ minProb of decks (default 90 %) with sample size ≥ minSample
        // (default 5).
        //
        // When archetypeKey is null/falsy, aggregates ACROSS ALL
        // archetypes — meta-wide synergies (e.g. Neo Upper Energy ↔
        // Dragapult ex regardless of which deck plays them). When set,
        // restricts to the named archetype.
        //
        // User-flagged Mega Starmie regression: Major data classifies
        // the same physical decks as "Starmie Dusknoir" / "Starmie
        // Froslass" — the per-archetype slice for "Mega Starmie" is
        // empty, so per-archetype co-occurrence misses obvious
        // pairings. Cross-archetype aggregation fixes that.
        //
        // Returns:
        //   Map<cardLower, {
        //     partners: [{ card, prob, sample, isAnchor }, ...],
        //     presence: int
        //   }>
        // The `isAnchor` flag flags partner cards likely to be
        // archetype-defining win-conditions — Pokémon ex / VMAX /
        // VSTAR / V-Union. The synergy filter only counts anchor
        // partners as "satisfying" requirements (Dreepy alone in the
        // deck doesn't validate Neo Upper Energy when its actual
        // payoff Pokémon, Dragapult ex, is missing).
        // ──────────────────────────────────────────────────────────
        function _computeCardCoOccurrence(rows, archetypeKey, options) {
            const minProb   = (options && options.minProb)   != null ? options.minProb   : 0.90;
            const minSample = (options && options.minSample) != null ? options.minSample : 5;
            const minDecks  = (options && options.minDecks)  != null ? options.minDecks  : 10;
            const out = new Map();
            if (!Array.isArray(rows) || rows.length === 0) return out;
            const archLower = archetypeKey ? String(archetypeKey).trim().toLowerCase() : null;
            // Anchor pattern: card name ends in (or contains) the ex /
            // V / VMAX / VSTAR / V-Union suffix. Plain Mega lines (e.g.
            // "Mega Lucario ex") are caught by the " ex" branch.
            const _isAnchorName = (n) => {
                const s = String(n || '').toLowerCase();
                return / ex$/.test(s) || /\bvmax\b/.test(s) || /\bvstar\b/.test(s)
                    || /\bv-union\b/.test(s) || /\sv$/.test(s);
            };

            // Bucket rows by (tournament_id, archetype) → Set<cardLower>.
            const buckets = new Map();
            for (const r of rows) {
                if (!r) continue;
                const arch = String(r.archetype || '').trim().toLowerCase();
                if (archLower && arch !== archLower) continue;
                const tid = String(r.tournament_id || '').trim();
                const card = String(r.card_name || '').trim().toLowerCase();
                if (!tid || !card) continue;
                const key = `${tid}|${arch}`;
                let bucket = buckets.get(key);
                if (!bucket) { bucket = new Set(); buckets.set(key, bucket); }
                bucket.add(card);
            }
            const totalDecks = buckets.size;
            // Sample-size guard — small archetypes are noisy. Single-deck
            // co-occurrence can't be distinguished from coincidence.
            if (totalDecks < minDecks) return out;

            // Per-card presence count + per-pair count.
            const presence = new Map(); // card → count
            const pairCounts = new Map(); // card → Map<partner, count>
            for (const bucket of buckets.values()) {
                const cards = Array.from(bucket);
                for (const a of cards) {
                    presence.set(a, (presence.get(a) || 0) + 1);
                    let inner = pairCounts.get(a);
                    if (!inner) { inner = new Map(); pairCounts.set(a, inner); }
                    for (const b of cards) {
                        if (a === b) continue;
                        inner.set(b, (inner.get(b) || 0) + 1);
                    }
                }
            }

            for (const [card, count] of presence) {
                if (count < minSample) continue;
                const partners = [];
                const inner = pairCounts.get(card);
                if (inner) {
                    for (const [partner, both] of inner) {
                        const p = both / count;
                        if (p >= minProb) {
                            partners.push({
                                card: partner,
                                prob: p,
                                sample: count,
                                isAnchor: _isAnchorName(partner),
                            });
                        }
                    }
                }
                if (partners.length === 0) continue;
                partners.sort((a, b) => b.prob - a.prob);
                out.set(card, { partners, presence: count });
            }
            return out;
        }
        if (typeof window !== 'undefined') window._computeCardCoOccurrence = _computeCardCoOccurrence;

        // Stranded-card resolution. Iterates the finalized deck and
        // demotes cards whose `_dependencies` tags aren't satisfied
        // by the rest of the deck. The freed slot goes to the
        // highest-remainder eligible bump candidate (mirrors the
        // Energy Floor's reroute logic). ACE-SPEC and Stage-1
        // identity cards are protected (same guards as the other
        // post-allocation passes).
        function _resolveCardDependencies(entries, helpers) {
            if (!Array.isArray(entries) || entries.length === 0) {
                return { resolved: 0 };
            }
            const getLegalMax = (helpers && helpers.getLegalMax) || (() => 4);
            const isBasicEnergy = (helpers && helpers.isBasicEnergy) || (() => false);
            const log = (helpers && helpers.log) || (() => {});

            // Quick presence checks for each dependency tag.
            const presenceFns = {
                'needs-tool': () => entries.some(e => {
                    const t = String(e && e.card && (e.card.type || e.card.card_type) || '').toLowerCase();
                    return t.includes('tool');
                }),
            };

            let resolved = 0;
            // Iterate over a snapshot so we can splice without
            // mutating the active iterator.
            const snapshot = entries.slice();
            for (const entry of snapshot) {
                const card = entry && entry.card;
                if (!card) continue;
                if (card._isAceSpec) continue;
                if (card._isPinned) continue;
                if ((card.consistencyScore || 0) >= 75) continue;
                const deps = card._dependencies;
                if (!deps || (deps.size != null ? deps.size === 0 : Object.keys(deps).length === 0)) continue;
                const unmet = [];
                for (const tag of deps) {
                    const fn = presenceFns[tag];
                    if (!fn) continue;
                    if (!fn()) unmet.push(tag);
                }
                if (unmet.length === 0) continue;

                // Demote 1 copy. If count drops to 0, remove from deck.
                entry.count -= 1;
                resolved += 1;
                log({ type: 'dep_demote', card: card.card_name, unmet });
                if (entry.count <= 0) {
                    const idx = entries.indexOf(entry);
                    if (idx >= 0) entries.splice(idx, 1);
                }

                // Re-route the freed slot to the highest-remainder
                // non-stranded card under its per-card target. CORE
                // tier first.
                const bumpCandidates = entries
                    .filter(e => e && e.card)
                    .filter(e => !e.card._isAceSpec && !e.card._isPinned)
                    .filter(e => {
                        const eDeps = e.card._dependencies;
                        if (!eDeps) return true;
                        for (const tag of eDeps) {
                            const fn = presenceFns[tag];
                            if (fn && !fn()) return false; // also stranded
                        }
                        return true;
                    })
                    .filter(e => Number.isFinite(e.card._lrmRemainder) && e.card._lrmRemainder > 0)
                    .filter(e => {
                        const legalMax = e.card._legalMax || getLegalMax(e.card.card_name, e.card);
                        return isBasicEnergy(e.card) || e.count < legalMax;
                    })
                    .sort((a, b) => {
                        const tierOrder = { CORE: 0, MID: 1, TECH: 2 };
                        const ta = tierOrder[a.card._cardFunctionTier] != null ? tierOrder[a.card._cardFunctionTier] : 1;
                        const tb = tierOrder[b.card._cardFunctionTier] != null ? tierOrder[b.card._cardFunctionTier] : 1;
                        if (ta !== tb) return ta - tb;
                        return (b.card._lrmRemainder || 0) - (a.card._lrmRemainder || 0);
                    });
                if (bumpCandidates.length > 0) {
                    bumpCandidates[0].count += 1;
                    log({ type: 'dep_reroute', from: card.card_name, to: bumpCandidates[0].card.card_name });
                }
            }
            return { resolved };
        }
        if (typeof window !== 'undefined') window._resolveCardDependencies = _resolveCardDependencies;

        // ──────────────────────────────────────────────────────────
        // Synergy-based card resolution
        //
        // Demotes non-CORE / non-ACE-SPEC cards whose high-co-occurrence
        // partners are absent from the built deck. User-flagged Mega
        // Starmie regression: 3 Dreepy + 3 Drakloak + 2 Munkidori + 1
        // Neo Upper Energy made the cut without any Dragapult ex —
        // structurally dead in the actual deck. Co-occurrence data
        // says these all appear in ≈ 100 % of decks alongside Dragapult
        // ex; without the partner the slots are wasted.
        //
        // Same demote-and-reroute pattern as _resolveCardDependencies.
        // Stage-1 / CORE / ACE-SPEC cards are protected so a deck's
        // identity line never gets demoted by synergy analysis alone.
        // ──────────────────────────────────────────────────────────
        function _resolveCardSynergyMissing(entries, cooccurrenceMap, helpers) {
            if (!Array.isArray(entries) || entries.length === 0) return { resolved: 0 };
            if (!cooccurrenceMap || cooccurrenceMap.size === 0) return { resolved: 0 };
            const getLegalMax  = (helpers && helpers.getLegalMax)  || (() => 4);
            const isBasicEnergy = (helpers && helpers.isBasicEnergy) || (() => false);
            const log          = (helpers && helpers.log)          || (() => {});

            // Index deck cards by lowercased name with their counts so the
            // partner-presence check is O(1).
            const deckIndex = new Map();
            for (const e of entries) {
                if (!e || !e.card) continue;
                const nm = String(e.card.card_name || '').trim().toLowerCase();
                if (nm) deckIndex.set(nm, e);
            }

            let resolved = 0;
            const snapshot = entries.slice();
            for (const entry of snapshot) {
                const card = entry && entry.card;
                if (!card) continue;
                if (card._isAceSpec) continue;
                if (card._isPinned) continue;
                if ((card.consistencyScore || 0) >= 75) continue;
                const nm = String(card.card_name || '').trim().toLowerCase();
                const synergy = cooccurrenceMap.get(nm);
                if (!synergy || !Array.isArray(synergy.partners) || synergy.partners.length === 0) continue;

                // Conservative scope: this pass targets TIGHT pairings only
                // (Genesect SFA → Pokémon Tool, Neo Upper Energy →
                // Cynthia's Garchomp ex, etc.). Cards with many partners
                // (≥ 4) belong to broad clusters where finding one
                // present partner doesn't really validate the cluster's
                // keystone — that's better handled by the ACE-SPEC
                // synergy pre-filter (which knows about the keystone
                // role) and by future sub-archetype detection.
                const TIGHT_PAIRING_MAX_PARTNERS = 3;
                if (synergy.partners.length > TIGHT_PAIRING_MAX_PARTNERS) continue;

                // For tight pairings: card is satisfied when AT LEAST ONE
                // partner is in the deck. With ≤ 3 partners, ANY of them
                // missing is meaningful.
                const satisfied = synergy.partners.some(p => deckIndex.has(p.card));
                if (satisfied) continue;

                // Demote one copy. If count drops to 0, splice out.
                entry.count -= 1;
                resolved += 1;
                const missing = synergy.partners.slice(0, 3).map(p => p.card);
                log({ type: 'synergy_demote', card: card.card_name, missing });
                if (entry.count <= 0) {
                    const idx = entries.indexOf(entry);
                    if (idx >= 0) entries.splice(idx, 1);
                    deckIndex.delete(nm);
                }

                // Re-route the freed slot to the highest-remainder
                // non-stranded card under its per-card target. CORE first,
                // then MID, then TECH. Skip cards with their own unmet
                // synergy (would just create another stranded card).
                const bumpCandidates = entries
                    .filter(e => e && e.card)
                    .filter(e => !e.card._isAceSpec && !e.card._isPinned)
                    .filter(e => {
                        const otherNm = String(e.card.card_name || '').trim().toLowerCase();
                        const otherSyn = cooccurrenceMap.get(otherNm);
                        if (!otherSyn || !otherSyn.partners) return true;
                        return otherSyn.partners.some(p => deckIndex.has(p.card));
                    })
                    .filter(e => Number.isFinite(e.card._lrmRemainder) && e.card._lrmRemainder > 0)
                    .filter(e => {
                        const legalMax = e.card._legalMax || getLegalMax(e.card.card_name, e.card);
                        return isBasicEnergy(e.card) || e.count < legalMax;
                    })
                    .sort((a, b) => {
                        const tierOrder = { CORE: 0, MID: 1, TECH: 2 };
                        const ta = tierOrder[a.card._cardFunctionTier] != null ? tierOrder[a.card._cardFunctionTier] : 1;
                        const tb = tierOrder[b.card._cardFunctionTier] != null ? tierOrder[b.card._cardFunctionTier] : 1;
                        if (ta !== tb) return ta - tb;
                        return (b.card._lrmRemainder || 0) - (a.card._lrmRemainder || 0);
                    });
                if (bumpCandidates.length > 0) {
                    bumpCandidates[0].count += 1;
                    log({ type: 'synergy_reroute', from: card.card_name, to: bumpCandidates[0].card.card_name });
                }
            }
            return { resolved };
        }
        if (typeof window !== 'undefined') window._resolveCardSynergyMissing = _resolveCardSynergyMissing;

        // Lazy-loader for pokemon_card_effects.json. Returns an index
        // keyed by `SET|number` (uppercase set, trimmed number) plus a
        // name fallback (lowercased card name → first matching record).
        // The file is ~10 MB so this loads exactly once per session
        // and is cached on window. Returns { bySetNumber, byName,
        // size }; both maps may be empty if the file is unavailable.
        async function _loadCardEffectsIndex() {
            if (window._cardEffectsIndex) return window._cardEffectsIndex;
            if (window._cardEffectsPromise) return await window._cardEffectsPromise;
            window._cardEffectsPromise = (async () => {
                const empty = { bySetNumber: new Map(), byName: new Map(), size: 0 };
                try {
                    const resp = await fetch('./data/pokemon_card_effects.json');
                    if (!resp.ok) {
                        devLog('[CardEffects] HTTP', resp.status, '— effects index unavailable');
                        window._cardEffectsIndex = empty;
                        return empty;
                    }
                    const raw = await resp.json();
                    const bySetNumber = new Map();
                    const byName = new Map();
                    if (raw && typeof raw === 'object') {
                        for (const k of Object.keys(raw)) {
                            const v = raw[k];
                            if (!v) continue;
                            const upperKey = String(k).toUpperCase().trim();
                            bySetNumber.set(upperKey, v);
                            const nm = String(v.name || '').toLowerCase().trim();
                            if (nm && !byName.has(nm)) byName.set(nm, v);
                        }
                    }
                    const idx = { bySetNumber, byName, size: bySetNumber.size };
                    devLog(`[CardEffects] loaded ${idx.size} card-effect records`);
                    window._cardEffectsIndex = idx;
                    return idx;
                } catch (e) {
                    devLog('[CardEffects] load failed:', e);
                    window._cardEffectsIndex = empty;
                    return empty;
                }
            })();
            return await window._cardEffectsPromise;
        }
        if (typeof window !== 'undefined') window._loadCardEffectsIndex = _loadCardEffectsIndex;

        // Look up a card's effects record from the index. Tries
        // SET|number first (most reliable — exactly identifies the
        // card print), falls back to lowercased card-name (works for
        // canonical-named cards even when the print is unknown).
        function _findCardEffects(card, index) {
            if (!card || !index) return null;
            const sc = String(card.set_code || '').toUpperCase().trim();
            const sn = String(card.set_number || card.set_num || '').trim();
            if (sc && sn) {
                const k = `${sc}|${sn}`;
                if (index.bySetNumber.has(k)) return index.bySetNumber.get(k);
            }
            const nm = String(card.card_name || card.name || '').toLowerCase().trim();
            if (nm && index.byName.has(nm)) return index.byName.get(nm);
            return null;
        }
        if (typeof window !== 'undefined') window._findCardEffects = _findCardEffects;

        // Largest-Remainder Method: distribute remaining slots up to
        // ``targetTotal`` to cards with the largest fractional remainders
        // on ``card._lrmRemainder``. Respects legal-max + tech-counter caps.
        // Mutates ``entries[i].count`` in place; returns # slots added.
        //
        // Each entry has shape ``{ card, count }`` (the consistencyDeck
        // shape used in autoCompleteConsistency). ``card._lrmRemainder``
        // is the leftover fraction from Math.floor(avgCountWhenUsed) and
        // is set during the Stage 1/2 floor-allocation pass.
        function _redistributeByLargestRemainder(entries, currentTotal, targetTotal, helpers) {
            const getLegalMax = (helpers && helpers.getLegalMax) || (() => 4);
            const isBasicEnergy = (helpers && helpers.isBasicEnergy) || (() => false);
            const log = (helpers && helpers.log) || (() => {});
            if (!Array.isArray(entries) || currentTotal >= targetTotal) return 0;

            // Function-aware LRM weighting: when the consistency builder
            // tagged each card with _cardFunctionTier (CORE / MID /
            // TECH), bias the sort so search items / core draws / pokemon
            // engines (CORE) win bump-ties over match-up tech (TECH).
            // Without this, a TECH card with a slightly higher remainder
            // (e.g. 0.78) can steal a slot from a CORE card with a
            // slightly lower remainder (e.g. 0.72), even though the CORE
            // card's role is structurally more important to the deck's
            // game-plan stability. Multipliers are conservative on
            // purpose so pure-remainder ordering still dominates when
            // tiers match — tier just becomes the tie-breaker (and a
            // 0.15-shift swing for clear cross-tier mismatches).
            const _tierMultiplier = (tier) => {
                if (tier === 'CORE') return 1.15;
                if (tier === 'TECH') return 0.85;
                return 1.0; // MID / unknown
            };
            const _effectiveRemainder = (entry) => {
                const baseRem = (entry && entry.card && entry.card._lrmRemainder) || 0;
                const tier = entry && entry.card && entry.card._cardFunctionTier;
                return baseRem * _tierMultiplier(tier);
            };

            const sorted = entries
                .filter(e => e && e.card && Number.isFinite(e.card._lrmRemainder) && e.card._lrmRemainder > 0)
                .slice()
                .sort((a, b) => _effectiveRemainder(b) - _effectiveRemainder(a));

            let added = 0;
            for (const entry of sorted) {
                if (currentTotal + added >= targetTotal) break;
                const card = entry.card;
                const legalMax = card._legalMax || getLegalMax(card.card_name, card);
                const isBasic = isBasicEnergy(card);
                if (!isBasic && entry.count >= legalMax) continue;
                if (card._techCounterMaxCount != null && entry.count >= card._techCounterMaxCount) continue;
                entry.count += 1;
                added += 1;
                log(card, entry);
            }
            return added;
        }
        if (typeof window !== 'undefined') window._redistributeByLargestRemainder = _redistributeByLargestRemainder;

        // ────────────────────────────────────────────────────────────
        // REVERSE-LRM TRIM — paired with _redistributeByLargestRemainder
        // for the round-based generator. When Stage 1+2 round each
        // card's avg, the sum can land ABOVE 60 (cards rounded UP).
        // Trim slots from cards with the smallest / most-negative
        // remainder first, biased so CORE-tier cards keep their slots
        // and TECH-tier cards eat the cut. Pinned cards exempt — the
        // user explicitly requested them. Each card stays at >= 1 so
        // we never silently remove a deck entry.
        //
        // Mirror of _redistributeByLargestRemainder: same entries
        // shape ({card, count}), same tier-multiplier weighting. The
        // multiplier is INVERTED for trim — CORE (1.15) gets a bigger
        // remainder magnitude, pushing it later in the ascending sort
        // (i.e. less likely to be picked first for trimming).
        // ────────────────────────────────────────────────────────────
        function _trimByReverseLrm(entries, currentTotal, targetTotal, helpers) {
            const log = (helpers && helpers.log) || (() => {});
            if (!Array.isArray(entries) || currentTotal <= targetTotal) return 0;

            const _tierMultiplier = (tier) => {
                if (tier === 'CORE') return 1.15;
                if (tier === 'TECH') return 0.85;
                return 1.0;
            };
            const _effectiveRemainder = (entry) => {
                const baseRem = (entry && entry.card && entry.card._lrmRemainder) || 0;
                const tier = entry && entry.card && entry.card._cardFunctionTier;
                return baseRem * _tierMultiplier(tier);
            };

            // Ascending: most-negative remainder first (these are the
            // cards we over-allocated by rounding up the most).
            const sorted = entries
                .filter(e => {
                    if (!e || !e.card) return false;
                    if (e.card._isPinned) return false;
                    if (!(e.count > 1)) return false; // keep at least 1 copy
                    return Number.isFinite(e.card._lrmRemainder);
                })
                .slice()
                .sort((a, b) => _effectiveRemainder(a) - _effectiveRemainder(b));

            let trimmed = 0;
            for (const entry of sorted) {
                if (currentTotal - trimmed <= targetTotal) break;
                entry.count -= 1;
                trimmed += 1;
                log(entry.card, entry);
            }
            return trimmed;
        }
        if (typeof window !== 'undefined') window._trimByReverseLrm = _trimByReverseLrm;

        // ────────────────────────────────────────────────────────────
        // BIDIRECTIONAL LRM SWAP — runs after the standard add-only LRM
        // pass. When the deck is at the target size (60) but contains
        // TECH-tier 1-of cards while CORE-tier cards have un-bumped
        // remainder, swap a TECH slot for a CORE bump.
        //
        // Use case: Stage 2 admits Black Belt's Training (score 36,
        // TECH) before the threshold lift, taking a slot that LRM
        // could otherwise have given to Poké Pad (CORE, remainder
        // 0.70). Add-only LRM can't reach Pad once the deck is full;
        // the swap pass demotes the TECH card by 1 (often removing it
        // entirely if count was 1) and bumps the CORE card. Net deck
        // size unchanged; CORE tier maximised.
        //
        // Guards:
        //   - TECH count must be > 0; if count goes to 0, the entry
        //     is removed from the deck array.
        //   - Tech-CHOSEN counters (active-threats audit picked them)
        //     are exempt — they're not "incidental tech", they're
        //     budgeted threat coverage.
        //   - Stage-1 cards (score ≥ 75) protected from demotion
        //     below 1 — those are the deck's identity cards.
        //   - Maximum 5 swap iterations to bound runtime.
        //
        // Pure helper: takes a deck array (consistencyDeck shape) and
        // mutates it in place; returns the number of swaps applied.
        // ────────────────────────────────────────────────────────────
        function _bidirectionalLrmSwap(entries, helpers) {
            if (!Array.isArray(entries) || entries.length === 0) return 0;
            const getLegalMax = (helpers && helpers.getLegalMax) || (() => 4);
            const isBasicEnergy = (helpers && helpers.isBasicEnergy) || (() => false);
            const log = (helpers && helpers.log) || (() => {});

            let swaps = 0;
            const maxIterations = 5;

            for (let iter = 0; iter < maxIterations; iter++) {
                // TECH demote candidates: TECH-tier, count ≥ 1, NOT a
                // chosen tech-counter (those are budgeted), NOT
                // Stage-1 (score < 75 OK to demote, score ≥ 75 are
                // identity cards), NOT an ACE-SPEC (single-of by
                // format rule — demoting would void the deck's
                // ACE-SPEC pick entirely).
                const techCandidates = entries
                    .filter(e => e && e.card)
                    .filter(e => e.card._cardFunctionTier === 'TECH')
                    .filter(e => e.count >= 1)
                    .filter(e => e.card._techCounterMaxCount == null)
                    .filter(e => (e.card.consistencyScore || 0) < 75)
                    .filter(e => !e.card._isAceSpec && !e.card._isPinned)
                    .sort((a, b) => (a.card._lrmRemainder || 0) - (b.card._lrmRemainder || 0));

                // CORE bump candidates: CORE-tier, has positive remainder,
                // not at legal max (or basic energy which has no legal cap).
                const coreCandidates = entries
                    .filter(e => e && e.card)
                    .filter(e => e.card._cardFunctionTier === 'CORE')
                    .filter(e => Number.isFinite(e.card._lrmRemainder) && e.card._lrmRemainder > 0)
                    .filter(e => {
                        const legalMax = e.card._legalMax || getLegalMax(e.card.card_name, e.card);
                        return isBasicEnergy(e.card) || e.count < legalMax;
                    })
                    .sort((a, b) => (b.card._lrmRemainder || 0) - (a.card._lrmRemainder || 0));

                if (techCandidates.length === 0 || coreCandidates.length === 0) break;

                const tech = techCandidates[0];
                const core = coreCandidates[0];
                const techRem = tech.card._lrmRemainder || 0;
                const coreRem = core.card._lrmRemainder || 0;

                // Only swap if CORE remainder is meaningfully higher.
                // 0.05 buffer prevents flip-flopping on near-ties.
                if (coreRem <= techRem + 0.05) break;

                tech.count -= 1;
                core.count += 1;
                swaps += 1;
                log({
                    type: 'swap',
                    tech: tech.card.card_name,
                    core: core.card.card_name,
                    techRem,
                    coreRem,
                });

                // If TECH demoted to 0 copies, remove from the deck array.
                if (tech.count <= 0) {
                    const idx = entries.indexOf(tech);
                    if (idx >= 0) entries.splice(idx, 1);
                }
            }
            return swaps;
        }
        if (typeof window !== 'undefined') window._bidirectionalLrmSwap = _bidirectionalLrmSwap;

        // ────────────────────────────────────────────────────────────
        // ACE-SPEC-AWARE ENERGY FLOOR — enforces a minimum total energy
        // count derived from the ACE-SPEC-conditional aggregate.
        //
        // The doctrine reference says "modern decks run 7–11 energies"
        // but the exact target inside that window depends on the
        // ACE-SPEC. Cynthia's Garchomp + Neo Upper Energy: 7 fighting +
        // 1 Neo Upper = 8 total (Neo Upper substitutes one energy per
        // attack so fewer raw energies are needed). Cynthia's Garchomp
        // + Unfair Stamp: 8 raw fighting (no substitution). Same
        // archetype, different energy floor.
        //
        // After Stage 1 / 2 / LRM / swap, this helper:
        //   1. Computes target = round(sum of conditional avg energy
        //      counts in matching ACE-SPEC buckets), capped to the
        //      doctrine 7–11 corridor.
        //   2. Counts actual energies in the deck.
        //   3. If actual < target, demotes the lowest-remainder non-
        //      energy non-Stage-1 card and adds 1 to the highest-
        //      remainder energy. Repeats until the floor is met or
        //      no demotion candidate remains.
        //
        // Non-ACE-SPEC builds skip the floor (we only have a robust
        // target when a conditional bucket exists). Pure helper.
        // ────────────────────────────────────────────────────────────
        function _enforceEnergyFloor(entries, conditionalAvgs, helpers) {
            if (!Array.isArray(entries) || !conditionalAvgs || conditionalAvgs.size === 0) {
                return { added: 0, target: 0, before: 0, after: 0 };
            }
            const isBasicEnergy = (helpers && helpers.isBasicEnergy) || (() => false);
            const isEnergyEntry = (helpers && helpers.isEnergyEntry) || (e => isBasicEnergy(e && e.card));
            const getLegalMax = (helpers && helpers.getLegalMax) || (() => 4);
            const log = (helpers && helpers.log) || (() => {});

            // Per-card target = round(conditional_avg). Sum those for
            // the deck's energy-card target. Reason for rounding per
            // card instead of round(sum): the user-flagged Cynthia +
            // Unfair Stamp build had recency-weighted Fighting 4.89 +
            // Rocky 3.55 = 8.44 cards. round(8.44) = 8, but
            // round(4.89) + round(3.55) = 5 + 4 = 9 — and 5 + 4 is what
            // recent meta lists actually run. Rounding per card matches
            // the Floor's stage 1/2 floor+LRM allocation behaviour.
            //
            // Skip cards with presence < 3 (small-sample noise).
            let energyTargetCards = 0;
            let energyTargetRaw = 0;
            for (const entry of entries) {
                if (!entry || !entry.card) continue;
                if (!isEnergyEntry(entry)) continue;
                const cn = String(entry.card.card_name || '').toLowerCase().trim();
                const stat = conditionalAvgs.get(cn);
                if (stat && Number.isFinite(stat.avg) && stat.presence >= 3) {
                    energyTargetCards += Math.max(0, Math.round(stat.avg));
                    energyTargetRaw += stat.avg;
                }
            }
            // Doctrine corridor: 7–11 modern energies. Don't enforce a
            // floor outside that window; below 7 means the data is
            // incomplete, above 11 means the deck is doctrinally
            // already over-energy (a different audit warning catches
            // it).
            const target = Math.max(7, Math.min(11, energyTargetCards));
            const before = entries
                .filter(e => isEnergyEntry(e))
                .reduce((s, e) => s + (e.count || 0), 0);
            if (before >= target) {
                return { added: 0, target, before, after: before };
            }
            if (energyTargetRaw < 6.5) {
                // Conditional aggregate is too thin to trust; skip
                // (avoid forcing 7 energies into a deck whose data
                // genuinely supports 5–6).
                return { added: 0, target, before, after: before };
            }

            let added = 0;
            const maxIter = (target - before) + 2;
            for (let iter = 0; iter < maxIter; iter++) {
                const currentEnergies = entries
                    .filter(e => isEnergyEntry(e))
                    .reduce((s, e) => s + (e.count || 0), 0);
                if (currentEnergies >= target) break;

                // Pick the highest-remainder energy that's not at legal max
                // AND not yet at its own per-card conditional target. Per-
                // card cap mirrors the Ceiling: don't push Darkness Energy
                // to 8 if its conditional target is 7 — that just feeds
                // the Ceiling's trim → bump-cascade and over-allocates a
                // non-energy card downstream.
                const energyBumps = entries
                    .filter(e => isEnergyEntry(e))
                    .filter(e => Number.isFinite(e.card._lrmRemainder) && e.card._lrmRemainder > 0)
                    .filter(e => {
                        const legalMax = e.card._legalMax || getLegalMax(e.card.card_name, e.card);
                        return isBasicEnergy(e.card) || e.count < legalMax;
                    })
                    .filter(e => {
                        const cn = String(e.card.card_name || '').toLowerCase().trim();
                        const stat = conditionalAvgs.get(cn);
                        if (!stat || stat.presence < 3) return true;
                        const perCardTarget = Math.max(1, Math.round(stat.avg));
                        return e.count < perCardTarget;
                    })
                    .sort((a, b) => (b.card._lrmRemainder || 0) - (a.card._lrmRemainder || 0));
                if (energyBumps.length === 0) break;

                // Demote the lowest-priority non-energy non-Stage-1
                // card. Prefer TECH first (any count); fall back to MID
                // with count > 1 (don't drop below 1 for non-Stage-1
                // MID either — those are deck-shape cards). ACE-SPEC
                // cards excluded — single-of by format rule.
                const demoteCandidates = entries
                    .filter(e => !isEnergyEntry(e))
                    .filter(e => (e.card.consistencyScore || 0) < 75)
                    .filter(e => e.card._techCounterMaxCount == null)
                    .filter(e => !e.card._isAceSpec && !e.card._isPinned)
                    .filter(e => e.count >= 1)
                    .sort((a, b) => {
                        // TECH first (lower tier order), then by remainder asc.
                        const tierOrder = { TECH: 0, MID: 1, CORE: 2 };
                        const ta = tierOrder[a.card._cardFunctionTier] != null ? tierOrder[a.card._cardFunctionTier] : 1;
                        const tb = tierOrder[b.card._cardFunctionTier] != null ? tierOrder[b.card._cardFunctionTier] : 1;
                        if (ta !== tb) return ta - tb;
                        return (a.card._lrmRemainder || 0) - (b.card._lrmRemainder || 0);
                    });
                if (demoteCandidates.length === 0) break;
                const demote = demoteCandidates[0];
                const bump = energyBumps[0];

                demote.count -= 1;
                bump.count += 1;
                added += 1;
                log({
                    type: 'energy_floor',
                    demoted: demote.card.card_name,
                    bumped: bump.card.card_name,
                    target,
                });
                if (demote.count <= 0) {
                    const idx = entries.indexOf(demote);
                    if (idx >= 0) entries.splice(idx, 1);
                }
            }

            const after = entries
                .filter(e => isEnergyEntry(e))
                .reduce((s, e) => s + (e.count || 0), 0);
            return { added, target, before, after };
        }
        if (typeof window !== 'undefined') window._enforceEnergyFloor = _enforceEnergyFloor;

        // ────────────────────────────────────────────────────────────
        // ENERGY CEILING — mirror of the Energy Floor that prevents
        // OVER-allocation when LRM accidentally bumps an energy past
        // the ACE-SPEC-conditional target. User-flagged regression in
        // Cynthia's Garchomp + Neo Upper Energy: target was 4 Fighting
        // + 3 Rocky + 1 Neo Upper = 8 cards, but the build delivered
        // 4 Fighting + 4 Rocky + 1 Neo Upper = 9 cards. The extra
        // Rocky came from an LRM bump that should have gone to
        // Team Rocket's Petrel (rem 0.62) instead, but a downstream
        // data path made Petrel's effective remainder smaller than
        // Rocky's (0.20).
        //
        // Rather than chasing the data-path bug (which depends on
        // CSV column mapping and would need careful trace-debugging),
        // the Ceiling enforces the doctrine-correct outcome
        // architecturally: if the deck has MORE energies than the
        // ACE-SPEC-conditional target says, demote the lowest-rem
        // energy and bump the highest-rem non-energy non-Stage-1
        // card. Repeats until at target.
        //
        // Doctrine corridor (7-11) still applies — Ceiling never
        // pushes below 7 (over-trimming would risk an energy-starved
        // build).
        // ────────────────────────────────────────────────────────────
        function _enforceEnergyCeiling(entries, conditionalAvgs, helpers) {
            if (!Array.isArray(entries) || !conditionalAvgs || conditionalAvgs.size === 0) {
                return { removed: 0, target: 0, before: 0, after: 0 };
            }
            const isBasicEnergy = (helpers && helpers.isBasicEnergy) || (() => false);
            const isEnergyEntry = (helpers && helpers.isEnergyEntry) || (e => isBasicEnergy(e && e.card));
            const log = (helpers && helpers.log) || (() => {});

            // Compute target = sum-of-rounded for the cards present in
            // the deck (matches Energy Floor logic).
            let energyTargetCards = 0;
            let energyTargetRaw = 0;
            for (const entry of entries) {
                if (!entry || !entry.card) continue;
                if (!isEnergyEntry(entry)) continue;
                const cn = String(entry.card.card_name || '').toLowerCase().trim();
                const stat = conditionalAvgs.get(cn);
                if (stat && Number.isFinite(stat.avg) && stat.presence >= 3) {
                    energyTargetCards += Math.max(0, Math.round(stat.avg));
                    energyTargetRaw += stat.avg;
                }
            }
            const target = Math.max(7, Math.min(11, energyTargetCards));
            const before = entries
                .filter(e => isEnergyEntry(e))
                .reduce((s, e) => s + (e.count || 0), 0);
            if (before <= target) {
                return { removed: 0, target, before, after: before };
            }
            if (energyTargetRaw < 6.5) {
                // Conditional aggregate too thin to trust — leave
                // existing allocation alone.
                return { removed: 0, target, before, after: before };
            }

            let removed = 0;
            const maxIter = (before - target) + 2;
            for (let iter = 0; iter < maxIter; iter++) {
                const currentEnergies = entries
                    .filter(e => isEnergyEntry(e))
                    .reduce((s, e) => s + (e.count || 0), 0);
                if (currentEnergies <= target) break;

                // Demote the energy entry whose CURRENT count exceeds
                // its conditional rounded target the most. (Energy
                // entries that are at-or-below their per-card target
                // shouldn't be touched.) ACE-SPEC energies (Neo Upper,
                // Legacy Energy) are excluded — they're single-of by
                // format rule and shape the deck's energy economy.
                const energyDemoteCandidates = entries
                    .filter(e => isEnergyEntry(e))
                    .filter(e => !e.card._isAceSpec && !e.card._isPinned)
                    .filter(e => {
                        const cn = String(e.card.card_name || '').toLowerCase().trim();
                        const stat = conditionalAvgs.get(cn);
                        if (!stat || stat.presence < 3) return e.count > 1; // unknown energy: keep at 1+
                        const perCardTarget = Math.max(0, Math.round(stat.avg));
                        return e.count > perCardTarget;
                    })
                    .sort((a, b) => {
                        // Prefer demoting energies that are MOST over
                        // their per-card target (largest excess first).
                        const aStat = conditionalAvgs.get(String(a.card.card_name || '').toLowerCase().trim());
                        const bStat = conditionalAvgs.get(String(b.card.card_name || '').toLowerCase().trim());
                        const aExcess = (a.count || 0) - (aStat ? Math.round(aStat.avg) : 0);
                        const bExcess = (b.count || 0) - (bStat ? Math.round(bStat.avg) : 0);
                        return bExcess - aExcess;
                    });
                if (energyDemoteCandidates.length === 0) break;

                // Find a non-energy non-Stage-1 card that could
                // accept a bump. Prefer high-remainder un-bumped
                // cards (TECH last via reverse sort). Per-card cap:
                // a card at-or-above its own conditional target
                // (round(avg)) shouldn't be pushed further — N's
                // Zoroark + Unfair Stamp regression had Ceiling
                // bumping Ultra Ball 2→3 even though Ultra Ball's
                // own conditional avg is 1.88 → target 2.
                const bumpCandidates = entries
                    .filter(e => !isEnergyEntry(e))
                    .filter(e => Number.isFinite(e.card._lrmRemainder) && e.card._lrmRemainder > 0)
                    .filter(e => (e.card.consistencyScore || 0) >= 25)  // viable cards only
                    .filter(e => {
                        const legalMax = e.card._legalMax || (helpers && helpers.getLegalMax ? helpers.getLegalMax(e.card.card_name, e.card) : 4);
                        return e.count < legalMax;
                    })
                    .filter(e => {
                        const cn = String(e.card.card_name || '').toLowerCase().trim();
                        const stat = conditionalAvgs.get(cn);
                        if (!stat || stat.presence < 3) return true; // unknown card — no per-card cap
                        const perCardTarget = Math.max(1, Math.round(stat.avg));
                        return e.count < perCardTarget;
                    })
                    .sort((a, b) => {
                        // Tier order: CORE first, then MID, then TECH.
                        const tierOrder = { CORE: 0, MID: 1, TECH: 2 };
                        const ta = tierOrder[a.card._cardFunctionTier] != null ? tierOrder[a.card._cardFunctionTier] : 1;
                        const tb = tierOrder[b.card._cardFunctionTier] != null ? tierOrder[b.card._cardFunctionTier] : 1;
                        if (ta !== tb) return ta - tb;
                        return (b.card._lrmRemainder || 0) - (a.card._lrmRemainder || 0);
                    });

                const demote = energyDemoteCandidates[0];
                if (bumpCandidates.length === 0) {
                    // No bump target — just trim the energy without a
                    // replacement. Total deck size will drop; an outer
                    // safety net should re-fill.
                    demote.count -= 1;
                    removed += 1;
                    log({ type: 'energy_ceiling_trim', demoted: demote.card.card_name, target });
                    if (demote.count <= 0) {
                        const idx = entries.indexOf(demote);
                        if (idx >= 0) entries.splice(idx, 1);
                    }
                    continue;
                }
                const bump = bumpCandidates[0];
                demote.count -= 1;
                bump.count += 1;
                removed += 1;
                log({
                    type: 'energy_ceiling',
                    demoted: demote.card.card_name,
                    bumped: bump.card.card_name,
                    target,
                });
                if (demote.count <= 0) {
                    const idx = entries.indexOf(demote);
                    if (idx >= 0) entries.splice(idx, 1);
                }
            }

            const after = entries
                .filter(e => isEnergyEntry(e))
                .reduce((s, e) => s + (e.count || 0), 0);
            return { removed, target, before, after };
        }
        if (typeof window !== 'undefined') window._enforceEnergyCeiling = _enforceEnergyCeiling;

        // ────────────────────────────────────────────────────────────
        // BUILD QUALITY AUDIT — surfaces the principles from the
        // "Most Consistency List" doctrine to the user. Doesn't change
        // the build; produces structured findings (severity, message)
        // that the build-info modal renders so the user can see whether
        // the produced list lines up with the doctrine on:
        //
        //   • Energy economy  (modern norm 7–11 cards; flagged if outside)
        //   • Stadium bump    (decks running Colorless ability engines —
        //                     Drakloak, Dudunsparce, Fezandipiti, Meowth ex,
        //                     Noctowl — must run their own stadium to
        //                     "bump" Team Rocket's Watchtower; without
        //                     one their entire draw engine collapses if
        //                     Watchtower hits the table)
        //   • Mega-ex prizing (3-prize attackers like Mega Lucario / Zygarde
        //                     / Starmie / Charizard X make any KO twice as
        //                     punishing — flag the Hero's Cape ACE-SPEC as
        //                     a recommended defensive tech)
        //   • Opening hand    (hypergeometric P(≥1 basic) and P(at least
        //                     one core attacker) — sub-60% should bump
        //                     the basic count up)
        //
        // Pure helper: takes a finalized deck (consistencyDeck-shape:
        // [{ card, count }, ...]). Returns { findings: [{level, message,
        // hint}] }. No DOM, no network, fully testable.
        // ────────────────────────────────────────────────────────────
        const _COLORLESS_ABILITY_ENGINES = new Set([
            "drakloak",        // Recon Directive — top-2 filter draw
            "dudunsparce",     // Run Away Draw — refresh + cycle
            "dudunsparce ex",
            "fezandipiti ex",  // Flip the Script — revenge draw
            "meowth ex",       // Last-Ditch Catch — supporter tutor
            "noctowl",         // Item tutor lines
            "bibarel",         // Industrious Incisors — legacy draw
        ]);
        const _MEGA_EX_PATTERN = /^mega\s+.+\s+ex$/i;
        const _STADIUM_TYPE_PATTERN = /\bstadium\b/i;
        const _BASIC_POKEMON_PATTERN = /\bbasic\b/i;
        const _BASIC_ENERGY_PATTERN = /\b(basis-energie|basic energy)\b/i;
        const _SPECIAL_ENERGY_PATTERN = /\bspecial energy\b/i;
        const _ENERGY_TYPE_PATTERN = /\benergy\b/i;

        function _binomialChoose(n, k) {
            // n choose k as an exact integer-valued float; n,k assumed
            // small enough (≤60) that no overflow happens.
            if (k < 0 || k > n) return 0;
            if (k === 0 || k === n) return 1;
            k = Math.min(k, n - k);
            let acc = 1;
            for (let i = 0; i < k; i++) acc = acc * (n - i) / (i + 1);
            return acc;
        }

        function _probAtLeastOneInOpening(deckSize, copies, handSize) {
            // Hypergeometric P(X ≥ 1) = 1 - C(deck-copies, hand) / C(deck, hand).
            // Returns 0 when copies==0 or copies > deck-hand+0 (>= guaranteed).
            if (deckSize <= 0 || copies <= 0 || handSize <= 0) return 0;
            if (copies + handSize > deckSize) return 1;
            return 1 - _binomialChoose(deckSize - copies, handSize) / _binomialChoose(deckSize, handSize);
        }

        function _isBasicPokemonEntry(entry) {
            const c = entry && entry.card;
            if (!c) return false;
            const t = String(c.type || c.card_type || '').toLowerCase();
            // Type field for basic Pokémon usually contains "Basic" without
            // "Energy" (Basic energies show as "Basis-Energie" / "Basic Energy").
            if (!_BASIC_POKEMON_PATTERN.test(t)) return false;
            if (_ENERGY_TYPE_PATTERN.test(t)) return false;
            return true;
        }

        function _isEnergyEntry(entry) {
            const c = entry && entry.card;
            if (!c) return false;
            const t = String(c.type || c.card_type || '').toLowerCase();
            return _BASIC_ENERGY_PATTERN.test(t) || _SPECIAL_ENERGY_PATTERN.test(t);
        }

        function _isStadiumEntry(entry) {
            const c = entry && entry.card;
            if (!c) return false;
            const t = String(c.type || c.card_type || '').toLowerCase();
            return _STADIUM_TYPE_PATTERN.test(t);
        }

        function _buildQualityAudit(consistencyDeck) {
            const findings = [];
            if (!Array.isArray(consistencyDeck) || consistencyDeck.length === 0) {
                return { findings };
            }

            const deckSize = consistencyDeck.reduce((s, e) => s + (e.count || 0), 0);

            // 1. Energy economy — modern norm 7–11.
            const totalEnergies = consistencyDeck
                .filter(_isEnergyEntry)
                .reduce((s, e) => s + (e.count || 0), 0);
            if (totalEnergies < 7) {
                findings.push({
                    level: 'warn',
                    key: 'energy_low',
                    message: `Energie-Economy: ${totalEnergies} (Modern: 7–11)`,
                    hint: 'Decks unter 7 Energien laufen Gefahr, in mittlerer Spielphase ohne Beschleuniger zu stehen.',
                });
            } else if (totalEnergies > 11) {
                findings.push({
                    level: 'warn',
                    key: 'energy_high',
                    message: `Energie-Economy: ${totalEnergies} (Modern: 7–11)`,
                    hint: 'Decks über 11 Energien produzieren spät häufige Dead-Draws — eine Energie ist hier weniger wert als ein Such-Item.',
                });
            } else {
                findings.push({
                    level: 'info',
                    key: 'energy_ok',
                    message: `Energie-Economy: ${totalEnergies} (im 7–11 Korridor)`,
                });
            }

            // 2. Stadium bump — colorless ability engines need own stadium.
            const colorlessEngineNames = consistencyDeck
                .map(e => String(e.card && e.card.card_name || '').trim().toLowerCase())
                .filter(n => _COLORLESS_ABILITY_ENGINES.has(n));
            const hasOwnStadium = consistencyDeck.some(_isStadiumEntry);
            if (colorlessEngineNames.length > 0 && !hasOwnStadium) {
                findings.push({
                    level: 'warn',
                    key: 'stadium_missing',
                    message: `Farblose Engine ohne Stadium: ${[...new Set(colorlessEngineNames)].join(', ')}`,
                    hint: "Team Rocket's Watchtower (DRI 180) deaktiviert alle Fähigkeiten farbloser Pokémon. Ohne eigenes Stadium zum „Bumpen“ liegt die Draw-Engine still, sobald der Gegner Watchtower spielt.",
                });
            }

            // 3. Mega-ex prize math.
            const megaEx = consistencyDeck.find(e => _MEGA_EX_PATTERN.test(String(e.card && e.card.card_name || '').trim()));
            if (megaEx) {
                const heroCape = consistencyDeck.some(e => /^hero'?s cape$/i.test(String(e.card && e.card.card_name || '').trim()));
                findings.push({
                    level: heroCape ? 'info' : 'warn',
                    key: 'mega_ex_prizing',
                    message: `Mega-ex Hauptangreifer: ${megaEx.card.card_name} (3 Preiskarten bei KO)`,
                    hint: heroCape
                        ? 'Hero\'s Cape ist im Deck — gute Defensive gegen den Drei-Preis-Verlust.'
                        : 'Hero\'s Cape (ACE SPEC) erhöht HP signifikant und schützt vor One-Hit-KO; in Mega-ex-Decks praktisch alternativlos.',
                });
            }

            // 4. Opening-hand probability — hypergeometric P(≥1 basic in 7).
            // Counts ALL basic Pokémon (any type) in the deck.
            const totalBasics = consistencyDeck
                .filter(_isBasicPokemonEntry)
                .reduce((s, e) => s + (e.count || 0), 0);
            const pBasic = _probAtLeastOneInOpening(deckSize || 60, totalBasics, 7);
            const pctBasic = Math.round(pBasic * 100);
            // Doctrine: 7–11 Basics → ~60–80% Keep-Rate is the modern
            // optimum. Anything ≥70% is healthy; 50–69% means too many
            // Mulligans (gives the opponent free cards every game);
            // <50% is a structural defect.
            findings.push({
                level: pctBasic >= 70 ? 'info' : (pctBasic >= 50 ? 'warn' : 'crit'),
                key: 'opening_basic_prob',
                message: `P(≥1 Basis-Pokémon in Starthand): ${pctBasic}% (${totalBasics} Basics)`,
                hint: pctBasic < 70
                    ? 'Mulligan-Rate über 30% verschenkt Karten an den Gegner — modernes Optimum sind 7–11 Basics für ~70–80% Keep-Rate.'
                    : undefined,
            });

            // 5. Single-of irreplaceables → Exchange Ticket recommendation.
            // ACE-SPECs are inherently 1-of; if Exchange Ticket isn't in the
            // deck, the build is one bad prize away from collapse.
            const aceSpecEntry = consistencyDeck.find(e => {
                const r = String(e.card && e.card.rarity || '').toUpperCase();
                if (r.includes('ACE SPEC')) return true;
                if (Array.isArray(e.card && e.card.rules)) {
                    return e.card.rules.some(rl => String(rl).toUpperCase().includes('ACE SPEC'));
                }
                return false;
            });
            const hasExchangeTicket = consistencyDeck.some(e => /^exchange ticket$/i.test(String(e.card && e.card.card_name || '').trim()));
            if (aceSpecEntry && !hasExchangeTicket) {
                findings.push({
                    level: 'info',
                    key: 'exchange_ticket_missing',
                    message: `Single-of-Risiko: ${aceSpecEntry.card.card_name} (ACE SPEC) kann in den Preisen feststecken`,
                    hint: 'Exchange Ticket (JTG 156) erlaubt es, alle verbleibenden Preiskarten neu zu ziehen — Standard-Tech in Konsistenz-Listen mit 1-of-Schlüsselkarten.',
                });
            }

            return { findings };
        }
        if (typeof window !== 'undefined') window._buildQualityAudit = _buildQualityAudit;

        // Parse any tournament_date format used across sources:
        //   - ISO "YYYY-MM-DD"                  → online_tournament_dated_cards
        //   - English ordinal "25th April 2026" → tournament_cards_data_cards (Major)
        //   - German numeric "02.05.2026"       → city_league_analysis (JP)
        // Returns Date (UTC) or null.
        //
        // Implementation note: all three formats are handled by
        // parseJapaneseDate (it strips ordinal suffixes, then splits on
        // [.\s] and looks up English+German month names). Calling
        // parseEnglishTournamentDate first would mis-parse the German
        // dot-format because new Date("02.05.2026") interprets it as
        // MM.DD/YYYY → Feb 5 instead of May 2.
        function _parseAnyTournamentDate(rawDate) {
            if (!rawDate) return null;
            const s = String(rawDate).trim();
            if (!s) return null;
            if (typeof parseJapaneseDate === 'function') {
                const iso = parseJapaneseDate(s);
                if (iso) {
                    const d = new Date(iso + 'T00:00:00Z');
                    return isNaN(d.getTime()) ? null : d;
                }
            }
            return null;
        }

        // Aggregate one date-tagged tournament source into per-card weighted
        // numerator + a shared denominator. Returns null when the source has
        // no usable rows for this archetype, so the caller can fall back to
        // baseline share.
        //
        // mode='aggregate' (default):
        //   Each row is already an archetype-aggregate at the tournament —
        //   total_decks_in_archetype is the real per-tournament total and
        //   deck_inclusion_count is "of those N decks, how many ran this
        //   card". Used by online_tournament_dated_cards.csv and the JP
        //   city_league_analysis rows.
        //
        // mode='snapshot':
        //   Each row's `archetype` field is a unique-per-deck identifier
        //   (Major source uses a price-tag suffix like
        //   "Cynthia's Garchomp27.91$22.10€"; same archetype + same
        //   tournament with different prices = different deck snapshots,
        //   each carrying total_decks_in_archetype=1). The real
        //   per-tournament total is the count of distinct (tid, archRaw)
        //   pairs, and a card's inclusion count is the number of those
        //   pairs whose row-set contains the card. Without this branch
        //   every card present in any snapshot collapses to 100 % share
        //   (the dec-2026 build regression).
        //
        // archetypeFieldNormalizer is for stripping snapshot-specific
        // suffixes (price-tag for Major) before the archetype matcher runs;
        // Online + JP rows pass through clean.
        function _aggregateWeightedSource(rows, archetypeKey, sourceWeight, todayMs, archetypeFieldNormalizer, mode, attendanceWeightFn) {
            if (!Array.isArray(rows) || rows.length === 0) return null;
            const matcher = (typeof window.normalizeArchetypeForMatch === 'function')
                ? window.normalizeArchetypeForMatch
                : (s) => (s || '').toLowerCase().trim();
            const targetKey = matcher(archetypeKey || '');
            if (!targetKey) return null;
            const aggregationMode = (mode === 'snapshot') ? 'snapshot' : 'aggregate';
            // W3 Phase 1 — per-tournament attendance weight multiplier.
            // Online sources pass `_onlineAttendanceWeight` so events with
            // ≥ ONLINE_ATTENDANCE_TIER_THRESHOLD players (default 250)
            // count at 0.8× while smaller events count at 0.2× — keeps
            // small-event signal for rogue-deck detection without letting
            // them dominate per-card averages. Major + City League pass
            // undefined (no per-event attendance modulation; their source
            // weights already encode quality).
            const _attWeight = typeof attendanceWeightFn === 'function' ? attendanceWeightFn : null;

            if (aggregationMode === 'snapshot') {
                // (tid, archRaw) — one entry per distinct deck snapshot.
                const deckMeta = new Map();        // deckKey → { weight, ageDays, tid }
                const cardDecks = new Map();       // cardName_lower → Set<deckKey>

                rows.forEach(row => {
                    const archRaw = row.archetype || '';
                    const archForMatch = archetypeFieldNormalizer
                        ? archetypeFieldNormalizer(archRaw)
                        : archRaw;
                    if (matcher(archForMatch) !== targetKey) return;

                    const tid = String(row.tournament_id || row.tournament_name || '').trim();
                    if (!tid) return;
                    const deckKey = tid + '||' + archRaw;

                    if (!deckMeta.has(deckKey)) {
                        const d = _parseAnyTournamentDate(row.tournament_date || row.date || '');
                        if (!d) return;
                        const ageDays = Math.max(0, (todayMs - d.getTime()) / 86400000);
                        const attMult = _attWeight ? _attWeight(row.total_players) : 1.0;
                        const weight = _recencyWeight(ageDays) * (sourceWeight || 1.0) * attMult;
                        deckMeta.set(deckKey, { weight, ageDays, tid });
                    }

                    const cardName = (row.card_name || row.full_card_name || '').toString().trim().toLowerCase();
                    if (!cardName) return;
                    const inclusion = parseInt(row.deck_inclusion_count || row.deck_count || 0, 10) || 0;
                    if (inclusion <= 0) return;

                    if (!cardDecks.has(cardName)) cardDecks.set(cardName, new Set());
                    cardDecks.get(cardName).add(deckKey);
                });

                if (deckMeta.size === 0) return null;
                let weightedDenominator = 0;
                const tournamentSet = new Set();
                deckMeta.forEach(m => { weightedDenominator += m.weight; tournamentSet.add(m.tid); });
                if (weightedDenominator <= 0) return null;

                const weightedNumerators = new Map();
                cardDecks.forEach((deckKeys, cardName) => {
                    let num = 0;
                    deckKeys.forEach(deckKey => {
                        const m = deckMeta.get(deckKey);
                        if (m) num += m.weight;
                    });
                    weightedNumerators.set(cardName, num);
                });

                return {
                    weightedNumerators,
                    weightedDenominator,
                    tournamentCount: tournamentSet.size,
                    deckCount: deckMeta.size,
                };
            }

            // aggregate mode (default)
            const tournamentMeta = new Map();      // tid → { weight, archetypeTotal, ageDays }
            const cardByTournament = new Map();    // cardName_lower → Map<tid, inclusionSum>

            rows.forEach(row => {
                const archRaw = archetypeFieldNormalizer
                    ? archetypeFieldNormalizer(row.archetype || '')
                    : (row.archetype || '');
                if (matcher(archRaw) !== targetKey) return;

                const tid = String(row.tournament_id || row.tournament_name || '').trim();
                if (!tid) return;
                const cardName = (row.card_name || row.full_card_name || '').toString().trim().toLowerCase();
                if (!cardName) return;

                if (!tournamentMeta.has(tid)) {
                    const d = _parseAnyTournamentDate(row.tournament_date || row.date || '');
                    if (!d) return;
                    const ageDays = Math.max(0, (todayMs - d.getTime()) / 86400000);
                    const archTotal = parseInt(row.total_decks_in_archetype || 0, 10) || 0;
                    if (archTotal <= 0) return;
                    const attMult = _attWeight ? _attWeight(row.total_players) : 1.0;
                    const weight = _recencyWeight(ageDays) * (sourceWeight || 1.0) * attMult;
                    tournamentMeta.set(tid, { weight, archetypeTotal: archTotal, ageDays });
                }

                const inclusion = parseInt(row.deck_inclusion_count || row.deck_count || 0, 10) || 0;
                if (inclusion <= 0) return;
                if (!cardByTournament.has(cardName)) cardByTournament.set(cardName, new Map());
                const tidMap = cardByTournament.get(cardName);
                tidMap.set(tid, (tidMap.get(tid) || 0) + inclusion);
            });

            if (tournamentMeta.size === 0) return null;

            let weightedDenominator = 0;
            let aggregateDeckCount = 0;
            tournamentMeta.forEach(meta => {
                weightedDenominator += meta.archetypeTotal * meta.weight;
                aggregateDeckCount += meta.archetypeTotal;
            });
            if (weightedDenominator <= 0) return null;

            const weightedNumerators = new Map();
            cardByTournament.forEach((tidMap, cardName) => {
                let num = 0;
                tidMap.forEach((inclusion, tid) => {
                    const meta = tournamentMeta.get(tid);
                    if (!meta) return;
                    const safeInclusion = Math.min(inclusion, meta.archetypeTotal);
                    num += safeInclusion * meta.weight;
                });
                weightedNumerators.set(cardName, num);
            });

            return {
                weightedNumerators,
                weightedDenominator,
                tournamentCount: tournamentMeta.size,
                deckCount: aggregateDeckCount,
            };
        }
        if (typeof window !== 'undefined') {
            window._aggregateWeightedSource = _aggregateWeightedSource;
            window._parseAnyTournamentDate = _parseAnyTournamentDate;
        }

        // ────────────────────────────────────────────────────────────
        // ACE-SPEC CO-OCCURRENCE — conditional avgCountWhenUsed per ACE-SPEC.
        //
        // Pokémon TCG decks are not a flat distribution: the ACE-SPEC
        // choice meaningfully shifts the rest of the list. Cynthia's
        // Garchomp ex is the textbook case — Neo Upper Energy lists run
        // ~4 Basic Fighting + ~3 Rocky (Neo Upper covers a 1-energy
        // attack), while Unfair Stamp lists run ~5 Basic + ~3 Rocky
        // (no energy substitution available, so more raw energies).
        // The global avgCountWhenUsed (4.55 Fighting across ALL Cynthia
        // decks) papers over this and biases the build toward the wrong
        // count for whichever ACE-SPEC was actually picked.
        //
        // This helper buckets the dated CSV by (tournament_id, archetype)
        // — each bucket = one deck — finds the buckets that ran the
        // chosen ACE-SPEC, and computes a per-card "avg copies when used"
        // conditional on that ACE-SPEC. Caller decides whether to swap
        // it in (we do, with a small-sample guard + shift threshold so
        // the override only fires on signals strong enough to matter).
        // ────────────────────────────────────────────────────────────
        function _aceSpecConditionalAvgs(rows, archetypeKey, aceSpecLower, archetypeFieldNormalizer, todayMs) {
            const empty = { conditionalAvgs: new Map(), bucketCount: 0 };
            if (!Array.isArray(rows) || !archetypeKey || !aceSpecLower) return empty;
            const archKey = String(archetypeKey).trim().toLowerCase();
            const aceSpec = String(aceSpecLower).trim().toLowerCase();
            const useRecency = Number.isFinite(todayMs) && todayMs > 0;

            // Bucket rows by (tournament_id, archetype). Each bucket
            // models one deck. Track the bucket's date so we can apply
            // recency-weighting at aggregation time — without it, an old
            // 2-Rocky-Energy deck (April 1) and a recent 4-Rocky-Energy
            // deck (May 5) average to ~3 Rocky, hiding the real meta
            // shift the recent decks already encoded.
            const buckets = new Map();
            const bucketDates = new Map();
            for (const r of rows) {
                if (!r) continue;
                const archRaw = String(r.archetype || '');
                const archNorm = archetypeFieldNormalizer ? archetypeFieldNormalizer(archRaw) : archRaw;
                if (archNorm.trim().toLowerCase() !== archKey) continue;
                const tid = r.tournament_id || '';
                const cn = String(r.card_name || '').trim().toLowerCase();
                if (!tid || !cn) continue;
                const avgRaw = parseFloat(String(r.average_count || '0').replace(',', '.'));
                if (!Number.isFinite(avgRaw) || avgRaw <= 0) continue;
                const k = `${tid}|${archNorm}`;
                if (!buckets.has(k)) buckets.set(k, new Map());
                buckets.get(k).set(cn, avgRaw);
                if (!bucketDates.has(k)) {
                    const dateRaw = r.tournament_date || '';
                    const parsed = dateRaw ? Date.parse(dateRaw) : NaN;
                    if (Number.isFinite(parsed)) bucketDates.set(k, parsed);
                }
            }

            // Find buckets that contain the chosen ACE-SPEC, paired with
            // their date for recency weighting.
            const matching = [];
            for (const [k, cards] of buckets.entries()) {
                if (!cards.has(aceSpec)) continue;
                matching.push({ cards, dateMs: bucketDates.get(k) });
            }
            if (matching.length === 0) return empty;

            // Per-card avg "when used", recency-weighted by tournament age.
            // sum_w(card) = Σ(avg × weight) over buckets containing card
            // weight_sum(card) = Σ(weight) over those same buckets
            // conditional_avg = sum_w / weight_sum
            // Without todayMs we fall back to uniform weights (legacy
            // behaviour preserved for tests that exercise the helper
            // without a clock).
            const sums = new Map();
            const weights = new Map();
            const presence = new Map();
            for (const { cards, dateMs } of matching) {
                let weight = 1.0;
                if (useRecency && Number.isFinite(dateMs)) {
                    const ageDays = Math.max(0, Math.floor((todayMs - dateMs) / 86400000));
                    weight = _recencyWeight(ageDays);
                }
                for (const [cn, avg] of cards) {
                    sums.set(cn, (sums.get(cn) || 0) + avg * weight);
                    weights.set(cn, (weights.get(cn) || 0) + weight);
                    presence.set(cn, (presence.get(cn) || 0) + 1);
                }
            }

            const conditionalAvgs = new Map();
            for (const [cn, sum] of sums) {
                const w = weights.get(cn) || 1;
                conditionalAvgs.set(cn, { avg: sum / w, presence: presence.get(cn) || 0 });
            }
            return { conditionalAvgs, bucketCount: matching.length };
        }
        if (typeof window !== 'undefined') window._aceSpecConditionalAvgs = _aceSpecConditionalAvgs;

        // Multi-source variant: merge ACE-conditional aggregates across
        // Online + Major data with a per-source weight.  Audit Phase 6
        // PR2 (Fix C) requires Major data to dominate the conditional
        // avg — the previous single-source version ignored Major
        // entirely and let a 5-deck Online-Max-Belt subset (where 4 of
        // 5 happened to run 2× Wally's Compassion) push the
        // conditional avg to 1.92, overriding the cross-source baseline
        // of 1.26 even though Major decks consistently played 1.0-1.27
        // copies.
        //
        // ``sources`` shape:
        //   [{ rows, sourceWeight, archetypeFieldNormalizer? }, ...]
        // The weight is applied AS A MULTIPLIER on top of the recency
        // decay, so a Major bucket at age 7 (recency 1.0, source 1.5)
        // contributes 1.5× as much as an Online bucket at the same
        // recency. Falls back to single-source behavior when only one
        // source has data.
        function _aceSpecConditionalAvgsMulti(sources, archetypeKey, aceSpecLower, todayMs) {
            const empty = { conditionalAvgs: new Map(), bucketCount: 0 };
            if (!Array.isArray(sources) || sources.length === 0 || !archetypeKey || !aceSpecLower) return empty;
            const archKey = String(archetypeKey).trim().toLowerCase();
            const aceSpec = String(aceSpecLower).trim().toLowerCase();
            const useRecency = Number.isFinite(todayMs) && todayMs > 0;

            // Per-bucket card-avg map AND per-bucket effective weight
            // (source-weight × attendance-weight, computed at bucket build
            // time so the recency loop just multiplies in recency last).
            const buckets = new Map();
            const bucketDates = new Map();
            const bucketEffectiveWeight = new Map();
            for (const src of sources) {
                if (!src || !Array.isArray(src.rows) || src.rows.length === 0) continue;
                const sourceWeight = Number.isFinite(src.sourceWeight) && src.sourceWeight > 0
                    ? src.sourceWeight : 1.0;
                const normalizer = src.archetypeFieldNormalizer;
                // W3 Phase 1 — Per-source attendance weighting toggle.
                // When `applyAttendanceWeight=true`, each bucket's effective
                // weight gets multiplied by _onlineAttendanceWeight(total_players),
                // so small Online events (<250 players) contribute at 0.2×
                // while big events count at 0.8×. Major sources omit this
                // flag — their source-weight (3.0×) already encodes quality
                // and all regionals are >1000 players anyway.
                const applyAttendance = Boolean(src.applyAttendanceWeight)
                    && typeof window !== 'undefined'
                    && typeof window._onlineAttendanceWeight === 'function';
                for (const r of src.rows) {
                    if (!r) continue;
                    const archRaw = String(r.archetype || '');
                    const archNorm = normalizer ? normalizer(archRaw) : archRaw;
                    if (archNorm.trim().toLowerCase() !== archKey) continue;
                    const tid = r.tournament_id || '';
                    const cn = String(r.card_name || '').trim().toLowerCase();
                    if (!tid || !cn) continue;
                    const avgRaw = parseFloat(String(r.average_count || '0').replace(',', '.'));
                    if (!Number.isFinite(avgRaw) || avgRaw <= 0) continue;
                    // Bucket key namespaced by source-weight so the same
                    // tournament_id appearing in both sources (unlikely
                    // but possible if Major + Online share IDs) doesn't
                    // collapse to one bucket.
                    const k = `${sourceWeight}|${tid}|${archNorm}`;
                    if (!buckets.has(k)) buckets.set(k, new Map());
                    buckets.get(k).set(cn, avgRaw);
                    if (!bucketDates.has(k)) {
                        const dateRaw = r.tournament_date || '';
                        const parsed = dateRaw ? Date.parse(dateRaw) : NaN;
                        if (Number.isFinite(parsed)) bucketDates.set(k, parsed);
                    }
                    if (!bucketEffectiveWeight.has(k)) {
                        const attMult = applyAttendance
                            ? window._onlineAttendanceWeight(r.total_players)
                            : 1.0;
                        bucketEffectiveWeight.set(k, sourceWeight * attMult);
                    }
                }
            }

            // Find buckets that contain the chosen ACE-SPEC.
            const matching = [];
            for (const [k, cards] of buckets.entries()) {
                if (!cards.has(aceSpec)) continue;
                matching.push({
                    cards,
                    dateMs: bucketDates.get(k),
                    effectiveWeight: bucketEffectiveWeight.get(k) || 1.0,
                });
            }
            if (matching.length === 0) return empty;

            const sums = new Map();
            const weights = new Map();
            const presence = new Map();
            for (const { cards, dateMs, effectiveWeight } of matching) {
                let recency = 1.0;
                if (useRecency && Number.isFinite(dateMs)) {
                    const ageDays = Math.max(0, Math.floor((todayMs - dateMs) / 86400000));
                    recency = _recencyWeight(ageDays);
                }
                const w = recency * effectiveWeight;
                for (const [cn, avg] of cards) {
                    sums.set(cn, (sums.get(cn) || 0) + avg * w);
                    weights.set(cn, (weights.get(cn) || 0) + w);
                    presence.set(cn, (presence.get(cn) || 0) + 1);
                }
            }

            const conditionalAvgs = new Map();
            for (const [cn, sum] of sums) {
                const w = weights.get(cn) || 1;
                conditionalAvgs.set(cn, { avg: sum / w, presence: presence.get(cn) || 0 });
            }
            return { conditionalAvgs, bucketCount: matching.length };
        }
        if (typeof window !== 'undefined') window._aceSpecConditionalAvgsMulti = _aceSpecConditionalAvgsMulti;

        async function autoCompleteConsistency(source, rarityMode, options) {
            if (source !== 'cityLeague' && source !== 'currentMeta' && source !== 'pastMeta') return;

            // Anti-Tech build mode — caller hands a single target
            // archetype name + aggression preset; the TechAudit pass
            // below switches from "weighted meta field" to "this one
            // opponent" when these are set. Passed in instead of read
            // from window state so unit tests / future callers can
            // drive the algo without UI plumbing.
            const _opts = options || {};
            const _antiTechTarget = (_opts.antiTechTarget || '').toString().trim() || null;
            const _antiTechAggression = (_opts.antiTechAggression || 'standard').toString();

            // Clear specific rarity preferences before generating
            rarityPreferences = {};
            saveRarityPreferences();
            
            // Set global rarity preference
            if (rarityMode) {
                globalRarityPreference = rarityMode;
            }
            
            let cardsKey, cards;
            if (source === 'cityLeague') {
                cardsKey = 'currentCityLeagueDeckCards';
                cards = window[cardsKey];
            } else if (source === 'currentMeta') {
                cardsKey = 'currentCurrentMetaDeckCards';
                cards = window[cardsKey];
            } else if (source === 'pastMeta') {
                cards = pastMetaCurrentCards;
            }
            
            if (!cards || cards.length === 0) {
                showToast(t('deck.noCardsToAdd'), 'warning');
                return;
            }
            
            devLog('[autoCompleteConsistency] Starting CONSISTENCY-based deck generation');
            devLog('[autoCompleteConsistency] Total available cards:', cards.length);
            
            // Clear existing deck
            devLog('[autoCompleteConsistency] Clearing existing deck...');
            if (source === 'cityLeague') {
                window.cityLeagueDeck = {};
                window.cityLeagueDeckOrder = [];
                saveCityLeagueDeck();
            } else if (source === 'currentMeta') {
                window.currentMetaDeck = {};
                window.currentMetaDeckOrder = [];
                saveCurrentMetaDeck();
            } else if (source === 'pastMeta') {
                window.pastMetaDeck = {};
                window.pastMetaDeckOrder = [];
                savePastMetaDeck();
            }
            
            // Get current archetype
            let currentArchetype;
            if (source === 'cityLeague') {
                currentArchetype = window.currentCityLeagueArchetype;
            } else if (source === 'currentMeta') {
                currentArchetype = window.currentMetaArchetype;
            } else if (source === 'pastMeta') {
                currentArchetype = window.pastMetaCurrentArchetype;
            }
            devLog('[autoCompleteConsistency] Building consistency deck for:', currentArchetype);
            
            // ==========================================
            // 1. AGGREGATE CARDS BY CARD_NAME
            // ==========================================
            const uniqueCards = {};
            for (const card of cards) {
                const cardName = fixCardNameEncoding((card.card_name || card.full_card_name || card.name || '').toString().trim());
                if (!cardName) continue;

                const deckCountValue = parseInt(card.deck_count || card.deck_inclusion_count || 0) || 0;
                const totalCountValue = parseFloat(card.total_count || 0) || 0;
                const avgCountValue = parseFloat(String(card.average_count || card.avg_count || 0).replace(',', '.')) || 0;

                if (!uniqueCards[cardName]) {
                    uniqueCards[cardName] = { 
                        ...card, card_name: cardName, deck_count: deckCountValue, total_count: totalCountValue,
                        sum_avg_count: avgCountValue, count_entries: 1,
                        max_count: parseInt(card.max_count || 0)
                    };
                } else {
                    uniqueCards[cardName].deck_count += deckCountValue;
                    uniqueCards[cardName].total_count += totalCountValue;
                    uniqueCards[cardName].sum_avg_count += avgCountValue;
                    uniqueCards[cardName].count_entries += 1;
                    uniqueCards[cardName].max_count = Math.max(
                        parseInt(uniqueCards[cardName].max_count || 0),
                        parseInt(card.max_count || 0)
                    );
                }
            }
            
            const resolvedTotalDecks = resolveBuilderTotalDecks(source, currentArchetype, cards, uniqueCards);

            // Cap total_count at legal maximum (Ace Spec/Radiant = 1, Basic Energy = 59, else = 4)
            for (const cardName in uniqueCards) {
                const card = uniqueCards[cardName];
                const legalMaxCopies = getLegalMaxCopies(cardName, card);
                card.total_count = Math.min(card.total_count, card.deck_count * legalMaxCopies);
                const percentage = Math.min(100, Math.max(0, (card.deck_count / resolvedTotalDecks) * 100));
                card.total_decks_in_archetype = resolvedTotalDecks;
                card.percentage_in_archetype = percentage.toFixed(2).replace('.', ',');
            }
            
            let deckCards = Object.values(uniqueCards);
            devLog('[autoCompleteConsistency] After aggregation:', deckCards.length, 'unique cards');
            
            // ==========================================
            // COMBINED VARIANTS: Group by strict base name, merge set prints
            // ==========================================
            const variantGroups = {};
            for (const card of deckCards) {
                const baseName = getStrictBaseCardName(card.card_name);
                if (!variantGroups[baseName]) variantGroups[baseName] = [];
                variantGroups[baseName].push(card);
            }

            const mergedDeckCards = [];
            for (const baseName in variantGroups) {
                const group = variantGroups[baseName];
                if (group.length === 1) {
                    mergedDeckCards.push(group[0]);
                } else {
                    const stats = calculateCombinedVariantStats(group, resolvedTotalDecks);
                    const bestVariant = group.reduce((best, v) =>
                        (parseFloat(v.deck_count || 0) > parseFloat(best.deck_count || 0)) ? v : best, group[0]);
                    mergedDeckCards.push({
                        ...bestVariant,
                        card_name: stats.baseName || bestVariant.card_name,
                        percentage_in_archetype: stats.combinedShare.toFixed(2).replace('.', ','),
                        _recommendedCount: stats.recommendedCount,
                        _legalMax: stats.legalMax,
                        _isMerged: true
                    });
                    devLog(`[autoCompleteConsistency][CombinedVariants] Merged ${group.length} prints of "${baseName}" → share=${stats.combinedShare}%, rec=${stats.recommendedCount}`);
                }
            }
            deckCards = mergedDeckCards;
            devLog('[autoCompleteConsistency] After Combined Variants merge:', deckCards.length, 'unique cards');

            // User-excluded cards are stripped from the candidate pool
            // before any allocation pass runs. Stage 0 (pins, tech-slots,
            // Ace-Spec) and Stages 1-3 (core/staple/utility) see them as
            // if they didn't exist in the archetype, so neither the
            // forced-include path nor the score-based picks can put them
            // back into the deck. Empty filter = no excluded cards.
            const _excludedSet = (typeof getExcludedCardNames === 'function')
                ? getExcludedCardNames(source)
                : new Set();
            if (_excludedSet.size > 0) {
                const _normName = typeof normalizeCardName === 'function'
                    ? normalizeCardName
                    : (s => String(s || '').toLowerCase().trim());
                const beforeLen = deckCards.length;
                deckCards = deckCards.filter(card => !_excludedSet.has(_normName(card.card_name)));
                devLog('[autoCompleteConsistency] Excluded cards filter:', beforeLen, '→', deckCards.length, '(removed', beforeLen - deckCards.length, 'excluded)');
            }
            
            // ==========================================
            // 2. COMPUTE PER-CARD STATISTICS + META BOOST + RECENCY
            // ==========================================

            // ── 2a. Meta Card Boost ──
            // Cards that are heavily played across the Top 10 meta decks get a
            // bonus.  If a card already appears in this archetype AND is a
            // meta-staple, it is objectively more important for consistency.
            const metaCards = (typeof metaCardData !== 'undefined' && metaCardData)
                ? (metaCardData[source === 'pastMeta' ? 'cityLeague' : source] || [])
                : [];
            const metaShareMap = new Map();
            metaCards.forEach(mc => {
                const name = (mc.card_name || '').trim().toLowerCase();
                if (name && mc.metaShare > 0) metaShareMap.set(name, mc.metaShare);
            });
            devLog(`[Consistency][Meta] Loaded ${metaShareMap.size} meta card entries for boost`);

            // ── 2b. Recency Scoring (smooth time-decay across two sources) ──
            // Replaces the previous binary 14-day cutoff with a continuous
            // decay function (see _recencyWeight): 0–7d full weight, 1.0→0.4
            // through 21d, 0.4→0.1 through 42d, then 0.05 residue.
            //
            // Two date-tagged sources feed the decay:
            //   1. Major  – tournament_cards_data_cards.csv  (source weight 1.5×)
            //              curated tournament-tested signal that pulls Online
            //              players onto its lists; we trust it more.
            //   2. Online – online_tournament_dated_cards.csv (source weight 1.0×)
            //              broader sample, weekly cadence.
            //
            //   weighted_share[card] = Σ (inclusion × weight) /
            //                          Σ (archetype_total × weight)
            //
            // The result REPLACES baseline share in the consistency-score
            // formula.  Display values in the deck grid still come from
            // baseline (additive Online+Major from PR #49) — only the
            // build-time score uses the time-weighted form.
            //
            // Edge cases:
            //   - archetype with no dated rows in either source → fallback
            //     to baselineShare (no decay applied).
            //   - both CSVs empty                             → fallback to baselineShare.
            //   - card present in deckCards but not in either source  → keeps baselineShare.
            const todayMs = Date.now();
            // W3 Phase 1 — Major regional source weight raised from 1.5×
            // to 3.0× so Day-2 lists from real majors dominate over
            // Online tournament data (which is much noisier and contains
            // many small-event lists). Online is unchanged at 1.0× as
            // baseline; per-event attendance weight (0.8 / 0.2) further
            // modulates Online buckets in _aceSpecConditionalAvgsMulti
            // and _aggregateWeightedSource.
            const SOURCE_WEIGHT_MAJOR = 3.0;
            const SOURCE_WEIGHT_ONLINE = 1.0;
            const _stripPriceTag = (s) => String(s || '')
                .replace(/\d+(?:[.,]\d+)?\$\d+(?:[.,]\d+)?€.*$/u, '')
                .trim();

            let majorAgg = null;
            let onlineAgg = null;
            // Held at function scope so the ACE-SPEC-conditional pass
            // (after the ACE-SPEC pick) can reuse the same rows the
            // recency aggregator just consumed — no second load.
            let onlineRowsRaw = null;

            if (currentArchetype) {
                if (source === 'currentMeta') {
                    // Load Major FIRST so we know whether to gate the
                    // Online attendance weight. In the first ~2 weeks
                    // after a set rotation, the format-aware chunk loader
                    // returns [] (no Major chunk for the new set yet),
                    // and attendance weighting should NOT fire — every
                    // bucket is precious in a sparse Online-only dataset.
                    if (!window.currentMetaTournamentCardsData && typeof loadCSV === 'function') {
                        try {
                            const rawTournament = await loadCSV('tournament_cards_data_cards.csv', { latestChunkOnly: true });
                            if (rawTournament && rawTournament.length) {
                                window.currentMetaTournamentCardsDataRaw = rawTournament;
                                window.currentMetaTournamentCardsData = rawTournament;
                            }
                        } catch (e) {
                            devLog('[Consistency][Recency] Major source load failed:', e);
                        }
                    }
                    const majorRows = window.currentMetaTournamentCardsData || [];
                    const _hasMajorData = Array.isArray(majorRows) && majorRows.length > 0;

                    // Online dated CSV — lazy-load once, cached on window.
                    // Apply the user's "data window from" date filter so
                    // every downstream pass (recency scoring, ACE-cond,
                    // Major-blend) sees the same date-windowed row set.
                    try {
                        onlineRowsRaw = await loadOnlineTournamentDatedRows();
                        const _windowFrom = (typeof window !== 'undefined') ? window.currentMetaDateFrom : null;
                        if (_windowFrom && typeof window !== 'undefined' && typeof window.filterRowsByDateFrom === 'function') {
                            const beforeN = onlineRowsRaw.length;
                            onlineRowsRaw = window.filterRowsByDateFrom(onlineRowsRaw, _windowFrom);
                            devLog(`[Consistency][DateWindow] Online rows ${beforeN} → ${onlineRowsRaw.length} (cutoff ${_windowFrom})`);
                        }
                        // Attendance weighting (0.8/0.2 based on
                        // total_players ≥ 250) is GATED on Major data
                        // existing for the current format. Without Major
                        // ground-truth, penalizing small Online events
                        // at 0.2× over-restricts the only dataset we
                        // have during the first weeks of a new format —
                        // user-confirmed 2026-05-24. Once the first
                        // CRI-format major lands, this flips on
                        // automatically (no config change needed).
                        const _attFn = _hasMajorData ? window._onlineAttendanceWeight : undefined;
                        if (!_hasMajorData) {
                            devLog('[Consistency][Recency] No current-format Major data — Online attendance weighting OFF (every event counts equally)');
                        }
                        onlineAgg = _aggregateWeightedSource(
                            onlineRowsRaw, currentArchetype, SOURCE_WEIGHT_ONLINE, todayMs, null,
                            undefined, _attFn
                        );
                    } catch (e) {
                        devLog('[Consistency][Recency] Online dated source failed:', e);
                    }

                    majorAgg = _aggregateWeightedSource(
                        majorRows, currentArchetype, SOURCE_WEIGHT_MAJOR, todayMs, _stripPriceTag, 'snapshot'
                    );
                } else if (source === 'cityLeague') {
                    // City League JP rows already in window.cityLeagueRawDeckCards
                    // — date-tagged per-tournament. Single-source decay (no Major).
                    const cityRows = window.cityLeagueRawDeckCards || [];
                    onlineAgg = _aggregateWeightedSource(
                        cityRows, currentArchetype, SOURCE_WEIGHT_ONLINE, todayMs, null
                    );
                } else if (source === 'pastMeta') {
                    // pastMeta is intentionally a historical bucket; only
                    // apply decay if its rawRows happen to carry dates.
                    const pastRows = window.pastMetaRawDeckCards || [];
                    onlineAgg = _aggregateWeightedSource(
                        pastRows, currentArchetype, SOURCE_WEIGHT_ONLINE, todayMs, null
                    );
                }
            }

            // Combine numerators across sources; denominator is shared
            // (sum of weighted deck-counts from both sources). Result is a
            // per-card weighted_share in 0–100 % space.
            //
            // Small-sample guard: if the combined deck count across both
            // sources is below MIN_DECKS_FOR_DECAY, weighted_share is too
            // noisy to trust as a score input — a single outlier deck would
            // give a niche tech card a huge share. Fall back to baseline by
            // emitting an empty weightedShareMap.
            const MIN_DECKS_FOR_DECAY = 5;
            const majorDecks = majorAgg ? (majorAgg.deckCount || 0) : 0;
            const onlineDecks = onlineAgg ? (onlineAgg.deckCount || 0) : 0;
            const totalDecks = majorDecks + onlineDecks;

            const weightedShareMap = new Map();
            let combinedDenominator = 0;
            if (majorAgg) combinedDenominator += majorAgg.weightedDenominator;
            if (onlineAgg) combinedDenominator += onlineAgg.weightedDenominator;
            if (combinedDenominator > 0 && totalDecks >= MIN_DECKS_FOR_DECAY) {
                const combinedNumerator = new Map();
                [majorAgg, onlineAgg].forEach(agg => {
                    if (!agg) return;
                    agg.weightedNumerators.forEach((num, cardName) => {
                        combinedNumerator.set(cardName, (combinedNumerator.get(cardName) || 0) + num);
                    });
                });
                combinedNumerator.forEach((num, cardName) => {
                    weightedShareMap.set(cardName, (num / combinedDenominator) * 100);
                });
            }
            const hasTimeDecay = weightedShareMap.size > 0;
            const sampleStatus = (totalDecks < MIN_DECKS_FOR_DECAY)
                ? ` — sample below MIN_DECKS_FOR_DECAY=${MIN_DECKS_FOR_DECAY}, falling back to baseline`
                : '';
            devLog(`[Consistency][Recency] Major=${majorDecks} decks (${majorAgg ? majorAgg.tournamentCount : 0} tournaments), Online=${onlineDecks} decks (${onlineAgg ? onlineAgg.tournamentCount : 0} tournaments), decay window=42d → ${weightedShareMap.size} cards with weighted_share${sampleStatus}`);

            // ── 2b2. Latest-Major Anchor (currentMeta) ──
            // The Major-anchor data is loaded for ALL currentMeta filters
            // (not just 'all') because the ACE SPEC slot picker below
            // wants to know what tournament-tested decks actually played
            // even when the user is on the Online-only filter — the ace
            // spec is a deck-defining 1-of, and the Online aggregate is
            // noisy enough that a less-popular but tactically-correct
            // pick (Neo Upper Energy for Cynthia's Garchomp) loses to a
            // more-popular but less-correct one (Unfair Stamp).
            //
            // Score *re-baselining* (using Major share/avg as the score
            // input for every card) still only fires on filter='all' —
            // see the gate further down. Without that gate the Online
            // and Major filter modes would converge.
            const latestMajorStats = new Map(); // cardName_lower → { share, avg }
            let hasLatestMajorAnchor = false;
            let latestMajorDate = '';
            let latestMajorAgeDays = null;       // days between today and latest Major
            let latestMajorTotalDecks = 0;       // bucket size of the latest Major
            const _filter = (typeof currentMetaFormatFilter !== 'undefined' ? currentMetaFormatFilter : 'all');
            if (source === 'currentMeta') {
                if (!window.currentMetaTournamentCardsData && typeof loadCSV === 'function') {
                    try {
                        const rawTournament = await loadCSV('tournament_cards_data_cards.csv', { latestChunkOnly: true });
                        if (rawTournament && rawTournament.length) {
                            window.currentMetaTournamentCardsDataRaw = rawTournament;
                            window.currentMetaTournamentCardsData = rawTournament;
                        }
                    } catch (e) {
                        devLog('[Consistency][LatestMajorAnchor] Could not load tournament data:', e);
                    }
                }
                let tournamentRows = window.currentMetaTournamentCardsData || [];
                // Apply the user's "data window from" date filter — when
                // set, the Major-anchor only considers rows on or after
                // the cutoff. With a fresh cutoff this lets the user say
                // "anchor on the last Regional only", "exclude the SCR
                // pre-release wave", etc.
                const _majorWindowFrom = (typeof window !== 'undefined') ? window.currentMetaDateFrom : null;
                if (_majorWindowFrom && typeof window !== 'undefined' && typeof window.filterRowsByDateFrom === 'function') {
                    const beforeN = tournamentRows.length;
                    tournamentRows = window.filterRowsByDateFrom(tournamentRows, _majorWindowFrom);
                    devLog(`[Consistency][DateWindow] Major rows ${beforeN} → ${tournamentRows.length} (cutoff ${_majorWindowFrom})`);
                }
                if (Array.isArray(tournamentRows) && tournamentRows.length > 0 && currentArchetype) {
                    // tournament_cards_data tags each placement with a price
                    // suffix (e.g. "Cynthia's Garchomp27.91$22.10€"); strip
                    // those before matching. Also strip " Ex".
                    const stripPriceTag = (s) => String(s || '')
                        .replace(/\d+(?:[.,]\d+)?\$\d+(?:[.,]\d+)?€.*$/u, '')
                        .trim();
                    const stripEx = (typeof stripExSuffix === 'function')
                        ? (s) => stripExSuffix(s || '')
                        : (s) => String(s || '').replace(/\s+ex$/i, '');
                    const archLower = stripEx(currentArchetype).toLowerCase();
                    const archetypeRows = tournamentRows.filter(r => {
                        const cleaned = stripEx(stripPriceTag(r.archetype || '')).toLowerCase();
                        return cleaned && cleaned === archLower;
                    });
                    if (archetypeRows.length > 0) {
                        // tournament_date is "25th April 2026" — parse properly
                        // because lexicographic compare reorders months wrongly.
                        const dateParser = (typeof parseEnglishTournamentDate === 'function')
                            ? parseEnglishTournamentDate
                            : (s) => { const d = new Date(String(s || '').replace(/(\d+)(st|nd|rd|th)/, '$1')); return isNaN(d.getTime()) ? null : d; };
                        let latestTs = -Infinity;
                        let latestRaw = '';
                        archetypeRows.forEach(r => {
                            const raw = String(r.tournament_date || '').trim();
                            if (!raw) return;
                            const d = dateParser(raw);
                            if (d && d.getTime() > latestTs) {
                                latestTs = d.getTime();
                                latestRaw = raw;
                            }
                        });
                        if (latestRaw) {
                            // Aggregate per-card stats from the latest Major
                            // rows. Each row of tournament_cards_data is a
                            // single price-tagged archetype-deck-snapshot at
                            // the tournament; total_decks_in_archetype is
                            // 1-2 per snapshot, so the bucket total is the
                            // sum across distinct (price-tagged) archetypes.
                            const latestRows = archetypeRows.filter(r => String(r.tournament_date || '').trim() === latestRaw);
                            const archTotalsByTag = new Map();
                            const cardAgg = new Map(); // cardName_lower → { deckCount, totalCount }
                            latestRows.forEach(r => {
                                const tag = String(r.archetype || '').trim();
                                const archTotal = parseInt(r.total_decks_in_archetype || 0, 10) || 0;
                                if (tag && !archTotalsByTag.has(tag)) {
                                    archTotalsByTag.set(tag, archTotal);
                                }
                                const cn = String(r.card_name || '').trim().toLowerCase();
                                if (!cn) return;
                                const dc = parseInt(r.deck_inclusion_count || 0, 10) || 0;
                                const tc = parseFloat(String(r.total_count || 0).replace(',', '.')) || 0;
                                if (!cardAgg.has(cn)) cardAgg.set(cn, { deckCount: 0, totalCount: 0 });
                                const e = cardAgg.get(cn);
                                e.deckCount += dc;
                                e.totalCount += tc;
                            });
                            let majorTotalDecks = 0;
                            archTotalsByTag.forEach(v => { majorTotalDecks += v; });
                            // Require at least 4 placements to consider the
                            // anchor reliable — small-sample noise otherwise.
                            if (majorTotalDecks >= 4) {
                                cardAgg.forEach((stats, cn) => {
                                    const share = (stats.deckCount / majorTotalDecks) * 100;
                                    const avg = stats.deckCount > 0 ? (stats.totalCount / stats.deckCount) : 0;
                                    latestMajorStats.set(cn, { share, avg, deckCount: stats.deckCount });
                                });
                                latestMajorDate = latestRaw;
                                latestMajorTotalDecks = majorTotalDecks;
                                if (latestTs > 0 && Number.isFinite(latestTs)) {
                                    const ageMs = Date.now() - latestTs;
                                    latestMajorAgeDays = Math.max(0, Math.round(ageMs / 86400000));
                                }
                                hasLatestMajorAnchor = true;
                                devLog(`[Consistency][LatestMajorAnchor] Latest Major: ${latestRaw} (${latestMajorAgeDays}d ago) | ${majorTotalDecks} decks | ${latestMajorStats.size} cards aggregated`);
                            } else {
                                devLog(`[Consistency][LatestMajorAnchor] Latest Major has only ${majorTotalDecks} placements — anchor skipped (need ≥4).`);
                            }
                        }
                    }
                }
            }

            // ──────────────────────────────────────────────────────────
            // ACE SPEC checker — hoisted up here so the Tech-Audit
            // counter-allocation sort below can use it. Before commit
            // 9XXXXXX it lived in the BUILD-DECK section (line ~4565)
            // and the tech-audit comparator hit a TDZ ReferenceError
            // when sort actually fired with ≥2 candidates per category
            // (the snapshot-mode aggregation surfaced more of those
            // candidates than the previous binary-cutoff path did).
            //
            // Hardcoded name list + rarity/rules check — NO csv
            // is_ace_spec, NO aceSpecsList.json (legacy paths that
            // produced false positives on rotation).
            // ──────────────────────────────────────────────────────────
            const aceSpecNames = [
                "Prime Catcher", "Unfair Stamp", "Master Ball", "Maximum Belt",
                "Hero's Cape", "Awakening Drum", "Reboot Pod", "Survival Brace",
                "Grand Tree", "Neutral Center", "Sparkling Crystal", "Dangerous Laser",
                "Scoop Up Cyclone", "Computer Search", "Dowsing Machine", "Rock Guard",
                "Life Dew", "Victory Star", "G Booster", "G Scope",
                "Rich Energy", "Legacy Energy", "Secret Box", "Hyper Aroma",
                "Neo Upper Energy", "Scramble Switch", "Deluxe Bomb", "Megaton Blower",
                "Amulet of Hope", "Poké Vital A"
            ];
            const aceSpecNamesLower = aceSpecNames.map(n => n.toLowerCase());

            const isAceSpecCard = (c) => {
                if (!c) return false;
                const name = String(c.card_name || c.name || '').trim().toLowerCase();
                if (aceSpecNamesLower.includes(name)) return true;
                const rarity = String(c.rarity || '').trim().toUpperCase();
                if (rarity.includes('ACE SPEC')) return true;
                if (Array.isArray(c.rules)) {
                    for (const rule of c.rules) {
                        if (String(rule).toUpperCase().includes('ACE SPEC')) return true;
                    }
                }
                return false;
            };

            // ── 2b3. Meta Tech Audit (currentMeta only) ──
            // Reads data/active_threats.json (built by Stage 2) and tags
            // cards in the user's archetype data that already serve as
            // counters to currently-active meta threats. The score loop
            // below boosts those cards instead of injecting new ones —
            // the user explicitly asked for "boost what's already in
            // the deck data, don't sinnlos eine Switch reinpacken".
            //
            // Boost magnitude (+18 flat) is calibrated so a card sitting
            // at ~10% archetype share crosses the Stage 2 (≥25) threshold
            // when it counters an active threat — enough to move it from
            // "occasional inclusion" to "core slot" if the meta calls for
            // it, but not enough to override genuine Stage 1 staples.
            // Counter lookup is by lower-case card NAME, not card_id —
            // a deck may run an older legal print (Switch MEG 130) while
            // the JSON only lists the newest legal print (Switch PFL 123).
            // Same card, same effect, same counter role.
            const techAuditCounterCats = new Map(); // nameLower → Set(threat-categories)
            const techAuditActiveThreats = new Map(); // category → {weighted_meta_share, sample_threat_card_names}
            const TECH_AUDIT_ACTIVE_FLOOR = 0.05; // 5 % of meta — lower bar
                                                  // than the JSON's own
                                                  // category_floor (2 %)
                                                  // to avoid boosting on
                                                  // very-niche threats.

            // Core draw engines are NEVER tech-cap-able. They're the
            // foundation of the deck's draw economy, not tech inclusions
            // — even if they happen to "counter" a threat as a side
            // effect (Lillie's Determination shuffles your hand back,
            // which undoes Iono/Marnie hand-disruption; that doesn't
            // make Lillie's a 1–2-of tech card, it's still 4× standard).
            // Excluding them here means they don't show up in the
            // counter pool, never get a tech-audit cap applied, and
            // never trigger the "redundant counter" -20 penalty.
            const CORE_DRAW_ENGINES_LOWER = new Set([
                "lillie's determination",
                "professor's research",
                "iono",
                "professor sycamore",
                "professor juniper",
                "marnie",
                "judge", // shuffles hand to 4 — also a draw/disruption staple
                "boss's orders", // gusting; classifier sometimes mis-tags
                "buddy-buddy poffin", // pokemon search staple
                "ultra ball",
                "poké pad",
                "poke pad",
                "crispin", // energy search staple
                "night stretcher", // resource recovery staple
            ]);

            if (source === 'currentMeta') {
                if (window._activeThreatsCache === undefined) {
                    try {
                        const resp = await fetch('data/active_threats.json', { cache: 'no-cache' });
                        window._activeThreatsCache = resp.ok ? await resp.json() : null;
                    } catch (e) {
                        devLog('[Consistency][TechAudit] active_threats.json unavailable:', e);
                        window._activeThreatsCache = null;
                    }
                }
                const intel = window._activeThreatsCache;
                if (intel && intel.threats && intel.counters) {
                    // Anti-Tech mode — restrict the "active category"
                    // set to threats this ONE target archetype actually
                    // runs. share_in_archetype gates noise: a 0.05-
                    // share threat in the opponent's list is too
                    // marginal to plan against.
                    const _antiTechShareFloor = _antiTechAggression === 'heavy' ? 0.10
                                            : _antiTechAggression === 'mild'  ? 0.25
                                            : 0.15;
                    const _antiTechTargetLower = (_antiTechTarget || '').toLowerCase();
                    const _antiTechMatchedAny = { v: false };

                    for (const [cat, info] of Object.entries(intel.threats)) {
                        let activeShare = 0; // effective weight used for slot budgeting
                        const sampleNames = (info.cards || [])
                            .slice(0, 3)
                            .map(c => c.card_name)
                            .filter(Boolean);

                        if (_antiTechTarget) {
                            // Pick the largest share_in_archetype among
                            // threat cards the target archetype runs.
                            // Treat that as the effective meta share so
                            // _outsTarget can still scale slots by it
                            // below, just relative to ONE deck.
                            let maxShare = 0;
                            (info.cards || []).forEach(threatCard => {
                                (threatCard.archetypes || []).forEach(a => {
                                    if (String(a.archetype || '').toLowerCase() !== _antiTechTargetLower) return;
                                    const s = parseFloat(a.share_in_archetype || 0) || 0;
                                    if (s > maxShare) maxShare = s;
                                });
                            });
                            if (maxShare < _antiTechShareFloor) continue;
                            activeShare = maxShare;
                            _antiTechMatchedAny.v = true;
                        } else {
                            const wms = parseFloat(info?.weighted_meta_share || 0) || 0;
                            if (wms < TECH_AUDIT_ACTIVE_FLOOR) continue;
                            activeShare = wms;
                        }

                        techAuditActiveThreats.set(cat, {
                            weighted_meta_share: activeShare,
                            sample_threat_card_names: sampleNames,
                            anti_tech_mode: !!_antiTechTarget,
                            anti_tech_aggression: _antiTechTarget ? _antiTechAggression : null,
                        });
                    }
                    if (_antiTechTarget && !_antiTechMatchedAny.v) {
                        devLog(`[Consistency][TechAudit][AntiTech] no threat categories matched target="${_antiTechTarget}" — falling back to weighted-meta TechAudit`);
                        // Repopulate with the standard weighted-meta
                        // logic so the deck still gets tech coverage.
                        // The user will see a toast at the end.
                        for (const [cat, info] of Object.entries(intel.threats)) {
                            const wms = parseFloat(info?.weighted_meta_share || 0) || 0;
                            if (wms < TECH_AUDIT_ACTIVE_FLOOR) continue;
                            const sampleNames = (info.cards || [])
                                .slice(0, 3)
                                .map(c => c.card_name)
                                .filter(Boolean);
                            techAuditActiveThreats.set(cat, {
                                weighted_meta_share: wms,
                                sample_threat_card_names: sampleNames,
                            });
                        }
                    }
                    // For every active category, index the counter card
                    // NAMES (lower-case) so we match every legal print of
                    // the same card.
                    techAuditActiveThreats.forEach((_meta, cat) => {
                        const counters = intel.counters[cat] || [];
                        counters.forEach(c => {
                            const nameLower = String(c.card_name || '').trim().toLowerCase();
                            if (!nameLower) return;
                            // Core draw engines are exempt — they're the
                            // deck's foundation, not a tech inclusion. See
                            // CORE_DRAW_ENGINES_LOWER above for rationale.
                            if (CORE_DRAW_ENGINES_LOWER.has(nameLower)) return;
                            const setOfCats = techAuditCounterCats.get(nameLower) || new Set();
                            setOfCats.add(cat);
                            techAuditCounterCats.set(nameLower, setOfCats);
                        });
                    });
                    if (techAuditActiveThreats.size > 0) {
                        devLog(`[Consistency][TechAudit] active categories: ${Array.from(techAuditActiveThreats.keys()).join(', ')} | counter cards indexed: ${techAuditCounterCats.size}`);
                    }
                }
            }

            // Per-category cap: pick AT MOST ONE counter card per active
            // threat category, even when the archetype's data carries
            // multiple. The user flagged Cynthia's Garchomp building with
            // BOTH Switch (1×) and Surfer (2×) for retreat-lock — three
            // tech slots for one threat is wasteful, especially when the
            // surplus eats energies the deck needs to keep attacking
            // through the lock.
            //
            // The chosen counter per category was previously the single
            // highest-share card. User feedback flagged that as too rigid:
            // when the meta runs the threat in >50% of matches, a single
            // out is too thin (you'll see retreat lock in 3-4 of a 7-round
            // bracket and one Switch reliably prized in the wrong game),
            // but at <30% one is plenty.
            //
            // Tier the budget on weighted_meta_share (from active_threats.json):
            //   < 30 %  →  1 out  (face threat in ~2 of 7 rounds)
            //   30-60 % →  2 outs (face in ~3-4 rounds)
            //   ≥ 60 %  →  3 outs (basically every match)
            //
            // Greedy-fill counter cards (sorted by archetype share desc)
            // until the budget is met. Each picked card carries a
            // _techCounterMaxCount cap that the Stage-1 / Stage-2 push
            // logic respects, so two counters whose natural addCounts
            // would sum past the budget get trimmed to fit.
            //
            // Tie-break inside a category: non-ace-spec preferred so the
            // deck's ace-spec slot stays free for its primary ace-spec
            // choice (Cynthia's Garchomp's Neo Upper Energy, for example).
            const techAuditChosenCounters = new Set(); // nameLower of card chosen for ANY cat
            const techAuditCategoryBudget = new Map(); // cat → { target, picked: [{name, alloc}] }
            if (techAuditActiveThreats.size > 0 && techAuditCounterCats.size > 0) {
                const _shareOf = (c) => {
                    const raw = (c.percentage_in_archetype || c.share_percent || '0').toString().replace(',', '.');
                    const v = parseFloat(raw);
                    return Number.isFinite(v) ? v : 0;
                };
                const _avgOf = (c) => {
                    if (c._recommendedCount != null && Number.isFinite(c._recommendedCount)) return c._recommendedCount;
                    if (Number.isFinite(c.avgCountWhenUsed) && c.avgCountWhenUsed > 0) return c.avgCountWhenUsed;
                    const parsed = parseFloat(String(c.average_count || c.avg_count || '').replace(',', '.'));
                    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
                };
                const _outsTarget = (metaShare) => {
                    if (!Number.isFinite(metaShare) || metaShare < 0.30) return 1;
                    if (metaShare < 0.60) return 2;
                    return 3;
                };
                // Aggression presets — heavy lifts both slot count and
                // lowers the archetype-share floor so the algorithm can
                // reach for niche counters; standard adds a single slot
                // per category; mild matches the default weighted-meta
                // behaviour so users have an opt-out path.
                const _antiTechSlotBonus = !_antiTechTarget ? 0
                    : _antiTechAggression === 'heavy' ? 2
                    : _antiTechAggression === 'mild' ? 0
                    : 1;
                techAuditActiveThreats.forEach((info, cat) => {
                    const baseTarget = _outsTarget(info && info.weighted_meta_share);
                    const target = Math.min(4, baseTarget + _antiTechSlotBonus);
                    const candidates = deckCards.filter(card => {
                        const nm = (card.card_name || '').trim().toLowerCase();
                        const cats = techAuditCounterCats.get(nm);
                        return cats && cats.has(cat);
                    });
                    // Tech-audit floor — skip the category entirely if no
                    // candidate clears the archetype-share floor. User
                    // flagged Crustle building 1× Lacey at 5 % archetype
                    // share for hand_disruption: a 1-of slot only 1-in-20
                    // builds actually run is statistically marginal, and
                    // the boost crowded out a useful card (the user
                    // wanted a 2nd Rocky Energy in the slot). 15 % is
                    // strict enough to drop Lacey while still keeping
                    // genuine archetype counters (Cynthia's Surfer at
                    // 60 %, etc.). Anti-Tech Heavy drops the floor to
                    // 5 % so niche-but-targeted counters can land.
                    const TECH_AUDIT_MIN_ARCHETYPE_SHARE = (_antiTechTarget && _antiTechAggression === 'heavy') ? 5.0 : 15.0;
                    const topShare = candidates.reduce((max, c) => Math.max(max, _shareOf(c)), 0);
                    if (topShare < TECH_AUDIT_MIN_ARCHETYPE_SHARE) {
                        devLog(`[Consistency][TechAudit] category=${cat} skipped — best counter has only ${topShare.toFixed(1)}% archetype share (floor: ${TECH_AUDIT_MIN_ARCHETYPE_SHARE}%)`);
                        techAuditCategoryBudget.set(cat, { target, picked: [], skipped_low_share: true });
                        return;
                    }
                    candidates.sort((a, b) => {
                        const sa = _shareOf(a), sb = _shareOf(b);
                        if (sa !== sb) return sb - sa;
                        // ACE-SPEC deprioritisation: use the GLOBAL
                        // isAceSpec from app-core.js, NOT the local
                        // const isAceSpecCard declared further down in
                        // autoCompleteConsistency. The local const is
                        // hoisted into the enclosing function scope, so
                        // referencing it here triggers a Temporal Dead
                        // Zone error ("Cannot access … before
                        // initialization") in strict mode — even the
                        // typeof guard doesn't save you with let/const.
                        // The global isAceSpec is a function declaration
                        // (var-hoisted), so typeof is safe.
                        const aIsAce = (typeof isAceSpec === 'function') ? isAceSpec(a) : false;
                        const bIsAce = (typeof isAceSpec === 'function') ? isAceSpec(b) : false;
                        return (aIsAce ? 1 : 0) - (bIsAce ? 1 : 0);
                    });
                    let remaining = target;
                    const picked = [];
                    for (const c of candidates) {
                        if (remaining <= 0) break;
                        const naturalCount = Math.max(1, Math.round(_avgOf(c)));
                        const alloc = Math.min(naturalCount, remaining);
                        if (alloc <= 0) continue;
                        const nm = (c.card_name || '').trim().toLowerCase();
                        // Use the LARGER allowance when one card counters
                        // multiple categories (e.g. Iono covering both
                        // hand_disruption AND its symmetric refresh role).
                        const prevCap = c._techCounterMaxCount;
                        if (prevCap == null || alloc > prevCap) {
                            c._techCounterMaxCount = alloc;
                        }
                        techAuditChosenCounters.add(nm);
                        picked.push({ name: nm, alloc });
                        remaining -= alloc;
                    }
                    techAuditCategoryBudget.set(cat, { target, picked });
                    devLog(`[Consistency][TechAudit] category=${cat} weighted_meta_share=${(info?.weighted_meta_share || 0).toFixed(2)} target=${target} picked=${picked.map(p => `${p.name}×${p.alloc}`).join(', ') || '(none)'}`);
                });
            }

            // ── 2c. Compute final consistencyScore per card ──
            deckCards.forEach(card => {
                const sharePercent = Math.min(100, Math.max(0, parseFloat((card.percentage_in_archetype || '0').toString().replace(',', '.')) || 0));

                let avgCountWhenUsed = 0;
                if (card.total_count > 0 && card.deck_count > 0) {
                    avgCountWhenUsed = card.total_count / card.deck_count;
                } else if (card.sum_avg_count > 0 && card.count_entries > 0) {
                    avgCountWhenUsed = card.sum_avg_count / card.count_entries;
                } else {
                    const parsedAvg = parseFloat(String(card.average_count || card.avg_count || '').replace(',', '.'));
                    if (Number.isFinite(parsedAvg) && parsedAvg > 0) avgCountWhenUsed = parsedAvg;
                }

                card.sharePercent = sharePercent;
                card.avgCountWhenUsed = avgCountWhenUsed;

                // Meta boost: 0 to 0.15 extra multiplier based on metaShare (0-100)
                const nameLower = (card.card_name || '').trim().toLowerCase();
                const metaShare = metaShareMap.get(nameLower) || 0;
                const metaBoost = (metaShare / 100) * 0.15; // max +15%
                card._metaShare = metaShare;

                // Time-decay weighted share — recent tournaments dominate
                // the score input. Cards present in the dated source get
                // their weighted_share substituted for baselineShare; cards
                // absent from the dated source keep baselineShare.  The
                // shift (weighted - baseline) is what the build-info modal
                // surfaces as the recency badge.
                const weightedShare = weightedShareMap.has(nameLower)
                    ? weightedShareMap.get(nameLower)
                    : null;
                card._weightedShare = weightedShare;
                card._weightedShareShift = (weightedShare != null)
                    ? (weightedShare - sharePercent)
                    : 0;

                // Latest-Major presence flags — used for explanation
                // badges in the build-info modal AND for the Stage-2
                // hard-cap below ("absent from latest Major" → don't
                // auto-add). We no longer re-baseline the share itself
                // because mergeOnlineMajorAdditive() in
                // app-current-meta-analysis.js already produces the
                // correct combined Online+Major share — re-baselining
                // here would replace that combined share with pure
                // Major and undo the additive math.
                let baselineShare = sharePercent;
                let baselineAvg = avgCountWhenUsed;
                if (hasLatestMajorAnchor) {
                    const major = latestMajorStats.get(nameLower);
                    if (major) {
                        card._latestMajorShare = major.share;
                        card._latestMajorAvg = major.avg;
                        card._latestMajorAnchored = true;
                    } else {
                        card._latestMajorAbsent = true;
                    }
                }

                // Final consistency score: weighted_share when available,
                // baseline otherwise. Drops the previous (1 + recencyBoost)
                // multiplier — time-decay is now baked into the share input.
                const scoreShare = (weightedShare != null && weightedShare >= 0)
                    ? weightedShare
                    : baselineShare;
                card._scoreShare = scoreShare;
                card.consistencyScore = scoreShare * (1 + metaBoost);
                card.consistencyScore = Math.min(120, Math.max(0, card.consistencyScore)); // cap at 120 for safety

                // Hard-cap absent-from-Major cards below auto-add threshold.
                if (card._latestMajorAbsent) {
                    card.consistencyScore = Math.min(card.consistencyScore, 24);
                }

                // Tech audit — only ONE card per active threat category
                // earns the boost (see per-category cap above). The
                // chosen counter gets +18, taking it from a borderline
                // Stage-2 candidate to a comfortable inclusion. Other
                // counters listed in the JSON for the same category get
                // the OPPOSITE treatment: a flat -20 penalty so they
                // don't ride their natural archetype share into the
                // build alongside the chosen counter (the user flagged
                // Cynthia's Garchomp building Switch 1× + Surfer 2× —
                // three retreat-lock slots is wasteful at the expense of
                // attacking-energy slots). Match by lower-case card
                // name so older legal prints (Switch MEG vs PFL) follow
                // the same rule.
                if (techAuditActiveThreats.size > 0) {
                    const cats = techAuditCounterCats.get(nameLower);
                    if (cats && cats.size > 0) {
                        const before = card.consistencyScore;
                        if (techAuditChosenCounters.has(nameLower)) {
                            card.consistencyScore = Math.min(120, card.consistencyScore + 18);
                            card._techCounterFor = Array.from(cats);
                            devLog(`[Consistency][TechAudit] BOOST ${card.card_name} counters [${card._techCounterFor.join(', ')}]: ${before.toFixed(1)} → ${card.consistencyScore.toFixed(1)}`);
                        } else {
                            // Redundant counter — already covered by the
                            // chosen pick. Penalise so the deck doesn't
                            // burn slots on a second copy of the same
                            // tech role.
                            card.consistencyScore = Math.max(0, card.consistencyScore - 20);
                            card._techCounterRedundant = Array.from(cats);
                            devLog(`[Consistency][TechAudit] REDUNDANT ${card.card_name} counters [${card._techCounterRedundant.join(', ')}]: ${before.toFixed(1)} → ${card.consistencyScore.toFixed(1)}`);
                        }
                    }
                }

                const shiftAbs = Math.abs(card._weightedShareShift || 0);
                if (metaBoost > 0 || shiftAbs > 1 || card._latestMajorAnchored || card._latestMajorAbsent || card._techCounterFor) {
                    const anchorTag = card._latestMajorAnchored ? ` [Major:${baselineShare.toFixed(0)}%]`
                                    : card._latestMajorAbsent ? ' [Major:absent]'
                                    : '';
                    const techTag = card._techCounterFor ? ` [Tech:${card._techCounterFor.join(',')}]` : '';
                    const recencyTag = (weightedShare != null)
                        ? ` weighted=${weightedShare.toFixed(1)}% (Δ${(card._weightedShareShift >= 0 ? '+' : '')}${card._weightedShareShift.toFixed(1)})`
                        : ' weighted=baseline';
                    devLog(`[Consistency][Score] ${card.card_name}: baseline=${baselineShare.toFixed(1)}%${recencyTag} × meta=${(1+metaBoost).toFixed(2)}${anchorTag}${techTag} → score=${card.consistencyScore.toFixed(1)}`);
                }
            });

            // ==========================================
            // 3. BUILD CONSISTENCY DECK
            // ==========================================
            let consistencyDeck = [];
            let currentTotal = 0;

            // aceSpecNames / aceSpecNamesLower / isAceSpecCard are
            // hoisted to before the Tech-Audit block (search for
            // "ACE SPEC checker — hoisted up here") so that block's
            // candidate sort can use isAceSpecCard without TDZing.
            const deckHasAceSpec = () => consistencyDeck.some(entry => isAceSpecCard(entry.card));

            const isBasicEnergyCardEntry = (c) => {
                if (!c) return false;
                const bNames = ['grass energy', 'fire energy', 'water energy', 'lightning energy', 'psychic energy', 'fighting energy', 'darkness energy', 'metal energy'];
                const n = String(c.card_name || c.name || '').trim().toLowerCase();
                return bNames.includes(n) || String(c.type || '').toLowerCase() === 'basis-energie';
            };

            const pushCard = (cardData, count, logPrefix = '') => {
                if (count <= 0 || currentTotal >= 60) return;
                
                const spaceLeft = 60 - currentTotal;
                const actualCount = Math.min(count, spaceLeft);
                
                consistencyDeck.push({ card: cardData, count: actualCount });
                currentTotal += actualCount;
                devLog(`${logPrefix} + ${actualCount}x ${cardData.card_name} (Share: ${cardData.sharePercent.toFixed(1)}%, Score: ${cardData.consistencyScore.toFixed(1)}, Avg: ${cardData.avgCountWhenUsed.toFixed(2)}x) -- Total: ${currentTotal}/60`);
            };

            // Sortiere Karten nach consistencyScore (absteigend)
            deckCards.sort((a, b) => b.consistencyScore - a.consistencyScore);

            let radiantAdded = false; // Deck-wide: max 1 Radiant Pokémon total

            // ==========================================
            // 1. ACE SPEC PRIORITY (Lokal)
            // ==========================================
            // Find THE ace spec for the archetype. The ace spec is a 1-of
            // and very deck-defining (Cynthia's Garchomp dumps 2 energy
            // for its strong attack → Neo Upper Energy literally pays
            // for that cost; Unfair Stamp doesn't help energy math at all).
            //
            // The signal we use depends on how recent the latest Major is:
            //   ≤ 14 days → Major share is the canonical reference
            //               (just-played, players haven't had time to drift).
            //   14–28 days → blend Major and consistencyScore 50/50
            //               (decay window — Online aggregate may have
            //               already shifted post-Major).
            //   > 28 days → fall back to consistencyScore
            //               (Major data is stale, trust Online aggregate).
            //
            // This replaces the earlier "always prefer Major" tie-break
            // which was correct for archetypes with a recent Major
            // appearance but would have wrongly favoured stale Major data
            // for archetypes that haven't shown up at a Major in months.
            const _aceSpecMajorWeight = (() => {
                if (latestMajorAgeDays == null) return 0;
                if (latestMajorAgeDays <= 14) return 1.0;
                if (latestMajorAgeDays <= 28) return 1.0 - ((latestMajorAgeDays - 14) / 14) * 0.5; // 1.0 → 0.5 linear
                return 0;
            })();
            const _aceSpecScoreOf = (card) => {
                const major = (latestMajorStats && latestMajorStats.size > 0)
                    ? latestMajorStats.get((card.card_name || '').trim().toLowerCase())
                    : null;
                const score = card.consistencyScore || 0;
                if (!major || _aceSpecMajorWeight <= 0) return score;
                return major.share * _aceSpecMajorWeight + score * (1 - _aceSpecMajorWeight);
            };
            // Co-occurrence map — meta-wide (NOT per-archetype). Major
            // data classifies the same physical decks under different
            // archetype names (e.g. "Mega Starmie" online aggregates as
            // "Starmie Dusknoir" / "Starmie Froslass" at major events),
            // so a per-archetype slice misses obvious cross-archetype
            // synergies. The cross-archetype view captures the real
            // pattern: Neo Upper Energy → Dragapult ex co-occurs in
            // 96 % of Major decks regardless of which deck slug the
            // scrape used.
            //
            // Combines two sources:
            //   • onlineRowsRaw (online_tournament_dated_cards.csv) —
            //     dated per-tournament rows, archetype unmodified.
            //   • window.currentMetaTournamentCardsData
            //     (tournament_cards_data_cards.csv) — Major rows with
            //     price-tag-suffixed archetype names; stripped so each
            //     price variant counts as one deck under the canonical
            //     name.
            const _cooccurrenceRows = [];
            if (Array.isArray(onlineRowsRaw)) {
                for (const r of onlineRowsRaw) _cooccurrenceRows.push(r);
            }
            if (typeof window !== 'undefined' && Array.isArray(window.currentMetaTournamentCardsData)) {
                const _stripPriceTag = (s) => String(s || '')
                    .replace(/\d+(?:[.,]\d+)?\$\d+(?:[.,]\d+)?€.*$/u, '')
                    .trim();
                for (const r of window.currentMetaTournamentCardsData) {
                    if (!r) continue;
                    _cooccurrenceRows.push({
                        tournament_id: r.tournament_id,
                        archetype: _stripPriceTag(r.archetype || ''),
                        card_name: r.card_name,
                    });
                }
            }
            // archetypeKey = null → meta-wide aggregation.
            const _cooccurrenceMap = _cooccurrenceRows.length > 0
                ? _computeCardCoOccurrence(_cooccurrenceRows, null)
                : new Map();
            if (_cooccurrenceMap.size > 0) {
                devLog(`[Consistency][Synergy] cross-archetype co-occurrence map: ${_cooccurrenceMap.size} cards with synergy partners (${_cooccurrenceRows.length} rows)`);
            }

            const aceSpecCandidates = deckCards.filter(c => isAceSpecCard(c));

            // Synergy-aware ACE-SPEC pre-filter — user-flagged Mega
            // Starmie regression: builder picked Neo Upper Energy as
            // ACE-SPEC despite no Dragapult ex in deckCards above the
            // auto-add threshold. Cross-archetype Major data shows Neo
            // Upper Energy → Dragapult ex at 96 % co-occurrence; without
            // the payoff Pokémon ex the ACE-SPEC slot is wasted.
            //
            // Filter rule: only ANCHOR partners count (Pokémon ex /
            // VMAX / VSTAR / V-Union — name-pattern detected). Non-
            // anchor partners (Trainer staples like Iono / Boss's
            // Orders, or Basic precursors like Dreepy) ride along with
            // EVERY archetype and would always satisfy the filter,
            // masking the missing payoff. Anchor-only check forces the
            // filter to ask the right question: is the actual win
            // condition this card synergises with present?
            //
            // Threshold: anchor partner must be in deckCards with
            // consistencyScore ≥ 50 (Extended-tier — likely to make
            // the build).  Falls back to the unfiltered list when the
            // filter would empty the candidate pool.
            const _aceSpecCandidatesFiltered = aceSpecCandidates.filter(c => {
                const nm = String(c.card_name || '').trim().toLowerCase();
                const synergy = _cooccurrenceMap.get(nm);
                if (!synergy || !synergy.partners || synergy.partners.length === 0) return true;
                const anchorPartners = synergy.partners.filter(p => p.isAnchor);
                if (anchorPartners.length === 0) return true; // no anchor in synergy → no claim
                return anchorPartners.some(p => {
                    const partnerCard = deckCards.find(d => String(d.card_name || '').trim().toLowerCase() === p.card);
                    return partnerCard && (partnerCard.consistencyScore || 0) >= 50;
                });
            });
            const _aceSpecPool = _aceSpecCandidatesFiltered.length > 0
                ? _aceSpecCandidatesFiltered
                : aceSpecCandidates;
            if (_aceSpecCandidatesFiltered.length < aceSpecCandidates.length) {
                const dropped = aceSpecCandidates
                    .filter(c => !_aceSpecCandidatesFiltered.includes(c))
                    .map(c => c.card_name);
                devLog(`[Consistency][ACE-SPEC-Synergy] Skipped ${dropped.length} candidate(s) with missing partners: ${dropped.join(', ')}`);
            }

            _aceSpecPool.sort((a, b) => _aceSpecScoreOf(b) - _aceSpecScoreOf(a));
            // Replace the candidate list in-place so the rest of the
            // build (report capture, conditional re-pricing) sees the
            // synergy-filtered pool.
            aceSpecCandidates.length = 0;
            for (const c of _aceSpecPool) aceSpecCandidates.push(c);

            // PIN OVERRIDE for ACE-SPEC slot. Stage 0 below skips Ace
            // Specs (`if (isAceSpecCard(card)) return;`) so a user pin on
            // an Ace Spec card would otherwise be silently ignored — the
            // scoring algorithm would still pick whichever Ace Spec has
            // the highest consistency score (e.g. Max Belt at Ø 1.00),
            // dropping the pinned card (e.g. Scoop Up Cyclone). When the
            // user has pinned exactly one Ace Spec that's actually in
            // the candidate pool, honour that pin instead of the score.
            // Multiple pinned Ace Specs falls back to score-order — the
            // format rule "one Ace Spec per deck" means we can only
            // forcibly add one anyway.
            const _aceSpecPinBucket = (window.pinnedCards || {})[source];
            const _aceSpecPinNorm = (s) => (typeof normalizeCardName === 'function')
                ? normalizeCardName(s || '')
                : String(s || '').toLowerCase().trim();
            let _pinForcedAceSpec = null;
            if (_aceSpecPinBucket && _aceSpecPinBucket.size > 0) {
                _pinForcedAceSpec = aceSpecCandidates.find(c => _aceSpecPinBucket.has(_aceSpecPinNorm(c.card_name))) || null;
            }
            if (_pinForcedAceSpec) {
                devLog(`[Consistency][ACE-SPEC-PinOverride] Forced by user pin: ${_pinForcedAceSpec.card_name}`);
            }
            const aceSpecSlotCard = _pinForcedAceSpec || aceSpecCandidates[0] || null;
            // Expose the pin-forced Ace Spec name so Stage 0's missing-
            // pin diagnostic doesn't flag it as "pinned but not added".
            window.__pinForcedAceSpecName = _pinForcedAceSpec ? _aceSpecPinNorm(_pinForcedAceSpec.card_name) : null;
            // Capture the ACE-SPEC pick reasoning so the "Why?" modal can
            // explain it. Without this the user sees Secret Box instead of
            // Maximum Belt and has no way to tell that Secret Box won
            // because of higher Major share, not because of overall
            // popularity. Top-4 candidates so we can render the close
            // alternatives without flooding the modal.
            let _aceSpecPickReport = null;
            if (aceSpecSlotCard) {
                _aceSpecPickReport = {
                    chosen: aceSpecSlotCard.card_name,
                    major_weight: Math.round(_aceSpecMajorWeight * 100) / 100,
                    major_age_days: latestMajorAgeDays,
                    major_date: latestMajorDate || '',
                    major_total_decks: latestMajorTotalDecks || 0,
                    has_major_anchor: !!hasLatestMajorAnchor,
                    candidates: aceSpecCandidates.slice(0, 4).map(c => {
                        const m = latestMajorStats && latestMajorStats.size > 0
                            ? latestMajorStats.get((c.card_name || '').trim().toLowerCase())
                            : null;
                        // Cross-tournament archetype share — the same
                        // figure shown in the per-card score row's
                        // "16% share" badge. Surfacing it next to the
                        // online consistency score lets users see at a
                        // glance how often the card actually shows up
                        // in builds of this archetype, separate from
                        // its score (which folds in meta boost +
                        // recency + Major anchor).
                        const archShareRaw = parseFloat(
                            String(c.percentage_in_archetype || c.sharePercent || '0').replace(',', '.')
                        );
                        return {
                            card_name: c.card_name,
                            consistency_score: Math.round(c.consistencyScore || 0),
                            archetype_share: Number.isFinite(archShareRaw) ? Math.round(archShareRaw) : null,
                            major_share: m ? Math.round(m.share * 10) / 10 : null,
                            major_deck_count: m ? (m.deckCount || 0) : 0,
                            blended_score: Math.round(_aceSpecScoreOf(c) * 10) / 10,
                        };
                    }),
                };
                devLog(`[Consistency][ACE-SPEC-Picker] Major-recency weight: ${_aceSpecMajorWeight.toFixed(2)} (Major ${latestMajorAgeDays != null ? latestMajorAgeDays + 'd ago' : 'unavailable'})`);
                _aceSpecPickReport.candidates.forEach(c => {
                    devLog(`  candidate: ${c.card_name} score=${c.consistency_score} majorShare=${c.major_share ?? '—'} → blended=${c.blended_score}`);
                });
            }

            if (aceSpecSlotCard) {
                // Mark as ACE-SPEC so post-allocation passes (bidirectional
                // swap, Energy Ceiling) NEVER demote it. ACE-SPECs are
                // single-of by format rule and represent a deck-defining
                // choice — losing the slot to LRM redistribution would
                // void the entire ACE-SPEC-conditional avg pass that
                // shapes the rest of the deck around this pick.
                aceSpecSlotCard._isAceSpec = true;
                pushCard(aceSpecSlotCard, 1, '[Consistency][ACE-SPEC-Priority]');
                devLog(`[Consistency][ACE-SPEC-Priority] Erkannt: ${aceSpecSlotCard.card_name} (Rarity: ${aceSpecSlotCard.rarity || '?'})`);
            } else {
                devLog('[Consistency][ACE-SPEC-Priority] Keine echte ACE SPEC gefunden.');
            }

            // Card-function classification — turns the raw rules text from
            // pokemon_card_effects.json into one of CORE / MID / TECH so
            // downstream Stage 2 + LRM can favour structurally important
            // cards (search items, core draw, Pokémon engines) over
            // match-up-dependent tech (damage-buffs, healing tools,
            // disruption supporters). Without this, Black Belt's Training
            // and Poké Pad both look identical to the score-based gate
            // and the build can pick a 1-of tech instead of a 4th search
            // item. Tagging happens once per deckCards entry; failures
            // (missing effect record, unknown card type) fall back to
            // 'unknown' which maps to MID — same priority as before, no
            // behaviour change for the unclassified path.
            try {
                const effectsIndex = await _loadCardEffectsIndex();
                deckCards.forEach(card => {
                    const effects = _findCardEffects(card, effectsIndex);
                    card._cardFunction = _classifyCardFunction(card, effects || {});
                    card._cardFunctionTier = _functionTier(card._cardFunction);
                    // Hard prerequisites (e.g. needs-tool for Genesect's
                    // ACE Nullifier ability). Empty Set when none.
                    card._dependencies = _detectCardDependencies(card, effects || {});
                    // Per-card energy multiplier. Most cards = 1; Neo
                    // Upper / Legacy Energy = 2 (each card provides 2
                    // energy when attached). Used by Energy Floor when
                    // computing effective energy supply.
                    if (card._cardFunction === 'energy') {
                        card._energyProvides = _energyProvides(card, effects || {});
                    } else {
                        card._energyProvides = 0;
                    }
                });
                if (effectsIndex && effectsIndex.size > 0) {
                    const tierCounts = { CORE: 0, MID: 0, TECH: 0 };
                    deckCards.forEach(c => { tierCounts[c._cardFunctionTier] = (tierCounts[c._cardFunctionTier] || 0) + 1; });
                    devLog(`[Consistency][Function] tagged ${deckCards.length} cards: CORE=${tierCounts.CORE}, MID=${tierCounts.MID}, TECH=${tierCounts.TECH}`);
                }
            } catch (e) {
                devLog('[Consistency][Function] tagging failed:', e);
            }

            // ──────────────────────────────────────────────────────────
            // Major-Avg Blending — when the latest Major is recent
            // enough to drive the ACE-SPEC pick, it should also drive
            // per-card counts. The previous logic locked the ACE-SPEC
            // choice to the Major (100 % weight at ≤ 14 d) but kept
            // every other count on the Online-aggregate avg, which is
            // older and pre-rotation-blended. User-flagged Crustle:
            //   - Prague Poké Pad avg = 1.27 (11/20 decks)
            //   - Online Pad avg = 1.64, ACE-cond shifts UP to 2.16
            //   → builder picked 2 copies; Major says 1.
            //   - Prague Mega Kangaskhan ex avg = 2.38 (13/20)
            //   - Online avg = 2.58, ACE-cond ↑2.86 → builder picked 3
            //   → Major says 2.
            //
            // The blend uses the SAME weight curve as the ACE-SPEC
            // picker (100 % at ≤ 14 d, 1.0 → 0.5 linear to day 28,
            // then 0). Small-sample guard (≥ 3 Major decks) avoids
            // letting one outlier deck distort a card's avg.
            //
            // Cards that get a Major-blended avg also short-circuit
            // the ACE-cond override below — Major data is ALREADY
            // conditional on the chosen ACE-SPEC (when Hero's Cape
            // was 20/20 at Prague, the Major Pad avg of 1.27 IS the
            // Hero's-Cape-conditional avg). Re-applying the
            // pre-Major ACE-cond shift on top would just walk the
            // count back to the older signal.
            const _MAJOR_BLEND_MIN_DECKS = 3;
            const _MAJOR_BLEND_MIN_DELTA = 0.15;
            let _majorAvgOverrides = 0;
            if (_aceSpecMajorWeight > 0 && latestMajorStats && latestMajorStats.size > 0) {
                deckCards.forEach(card => {
                    const nm = (card.card_name || '').trim().toLowerCase();
                    const major = latestMajorStats.get(nm);
                    if (!major) return;
                    if ((major.deckCount || 0) < _MAJOR_BLEND_MIN_DECKS) return;
                    const onlineAvg = card.avgCountWhenUsed || 0;
                    const majorAvg = major.avg || 0;
                    if (onlineAvg <= 0 || majorAvg <= 0) return;
                    const blended = majorAvg * _aceSpecMajorWeight + onlineAvg * (1 - _aceSpecMajorWeight);
                    if (Math.abs(blended - onlineAvg) < _MAJOR_BLEND_MIN_DELTA) return;
                    card._majorAvg = majorAvg;
                    card._onlineAvg = onlineAvg;
                    card._majorBlendedAvg = blended;
                    card.avgCountWhenUsed = blended;
                    _majorAvgOverrides += 1;
                    devLog(`[Consistency][MajorAvgBlend] ${card.card_name}: online ${onlineAvg.toFixed(2)} → blended ${blended.toFixed(2)} (Major ${majorAvg.toFixed(2)} × ${_aceSpecMajorWeight.toFixed(2)} weight, ${major.deckCount} decks)`);
                });
                if (_majorAvgOverrides > 0) {
                    devLog(`[Consistency][MajorAvgBlend] applied to ${_majorAvgOverrides} card(s)`);
                }
            }

            // ACE-SPEC-conditional avgCountWhenUsed override.
            //
            // The ACE-SPEC choice is a deck-shaping decision: Cynthia's
            // Garchomp ex with Neo Upper Energy runs ~4 Basic Fighting
            // because Neo Upper substitutes one energy per attack;
            // Cynthia's Garchomp ex with Unfair Stamp instead runs ~5
            // Basic Fighting because there's no substitution. Same
            // archetype, different energy counts. Global avgs blur the
            // two and pick the wrong number for whichever ACE-SPEC the
            // build actually chose.
            //
            // After the ACE-SPEC pick, recompute per-card "avg copies
            // when used" against the SUBSET of dated decks that ran the
            // same ACE-SPEC, and swap that conditional value into
            // card.avgCountWhenUsed before Stage 1/2 floor allocation.
            // Guards: ≥3 matching buckets (small-sample), card present
            // in ≥3 of those buckets (per-card noise), and shift ≥0.3
            // (don't bother for cosmetic ±0.1 differences). Stays a
            // no-op when those guards aren't met.
            // Held at function scope so the Energy Floor pass after Stage 4
            // can reuse the same conditional bucket aggregate the per-card
            // override below produces — re-running _aceSpecConditionalAvgs
            // would burn another full pass over the dated CSV for nothing.
            let _aceSpecCondResult = null;
            if (aceSpecSlotCard) {
                const aceSpecLower = (aceSpecSlotCard.card_name || '').trim().toLowerCase();
                // Audit Phase 6 PR2 (Fix C): blend Online + Major into the
                // ACE-conditional aggregate. Major weight 1.5× Online (=
                // SOURCE_WEIGHT_MAJOR / SOURCE_WEIGHT_ONLINE, same ratio
                // as the share-decay block above). User-confirmed reason:
                // a 5-deck Online-Max-Belt subset of 20 Lucario lists is
                // not enough evidence on its own to override the
                // cross-source baseline. Major data shows the same card
                // at avg 1.0-1.27 across 4 regionals, which should dominate
                // when only 1/4 of Online happens to play that ACE-SPEC.
                const _condSources = [];
                const _majorRowsForCond = window.currentMetaTournamentCardsData;
                const _hasMajorForCond = Array.isArray(_majorRowsForCond) && _majorRowsForCond.length > 0;
                if (Array.isArray(onlineRowsRaw) && onlineRowsRaw.length > 0) {
                    _condSources.push({
                        rows: onlineRowsRaw,
                        sourceWeight: SOURCE_WEIGHT_ONLINE,
                        archetypeFieldNormalizer: null,
                        // Attendance weight gated on Major presence — see
                        // the recency-aggregator block above for rationale.
                        applyAttendanceWeight: _hasMajorForCond,
                    });
                }
                if (_hasMajorForCond) {
                    _condSources.push({
                        rows: _majorRowsForCond,
                        sourceWeight: SOURCE_WEIGHT_MAJOR,
                        archetypeFieldNormalizer: _stripPriceTag,
                        // Major rows have no total_players column; relying
                        // solely on source-weight (3.0×) is intended.
                    });
                }
                _aceSpecCondResult = _condSources.length > 0
                    ? _aceSpecConditionalAvgsMulti(_condSources, currentArchetype, aceSpecLower, todayMs)
                    : { conditionalAvgs: new Map(), bucketCount: 0 };
                const condResult = _aceSpecCondResult;
                if (condResult.bucketCount >= 3) {
                    let overrides = 0;
                    deckCards.forEach(card => {
                        const cn = (card.card_name || '').trim().toLowerCase();
                        // Major-blend short-circuit — when the card's
                        // count is already driven by recent Major data,
                        // the older ACE-cond aggregate is stale. Major
                        // data is already conditional on the chosen
                        // ACE-SPEC, so re-applying the pre-Major shift
                        // would just walk the count back to outdated
                        // signal (Pad: 1.27 Major → 2.16 ACE-cond).
                        if (card._majorBlendedAvg != null && _aceSpecMajorWeight >= 0.5) return;
                        const condStat = condResult.conditionalAvgs.get(cn);
                        if (!condStat || condStat.presence < 3) return;
                        const baseAvg = card.avgCountWhenUsed || 0;
                        const cond = condStat.avg;
                        // Threshold lowered 0.30 → 0.15 (user-flagged
                        // regression in Cynthia's Garchomp + Unfair Stamp):
                        // production data showed Fighting Energy shift
                        // 4.55 → 4.83 = +0.28, just under the previous
                        // 0.30 cutoff. The shift is real and changes the
                        // LRM remainder from 0.55 to 0.83, which IS the
                        // signal that bumps Fighting Energy from 4 → 5
                        // copies in Unfair Stamp builds. With 0.30 the
                        // build delivered 7 fighting energies; the data
                        // and doctrine both say 8 (4.83 + 3.17 = 8.00).
                        if (Math.abs(cond - baseAvg) >= 0.15) {
                            // Pokémon DOWN-shift guard — line size is
                            // strategy-driven (4-3 Stage-1 line stays 4-3
                            // regardless of the chosen ACE-SPEC). User
                            // flagged Crustle's Hero's-Cape build pulling
                            // Dwebble 3.83 → 3.67 — the LRM remainder dropped
                            // from 0.83 to 0.67 and Dwebble landed at 3 copies
                            // instead of the structurally-required 4. ACE-
                            // SPEC-Conditional UP-shifts on Pokémon are
                            // still applied (an ACE-SPEC that genuinely
                            // wants a 3rd attacker copy is a legit signal).
                            const cardTypeStr = String((card.type || card.card_type || '')).trim().toLowerCase();
                            const isPokemonType = /^(basic|stage 1|stage 2|vmax|vstar|v-union|mega|tera)\b/.test(cardTypeStr);
                            if (isPokemonType && cond < baseAvg) {
                                devLog(`[Consistency][ACE-SPEC-Conditional] SKIP down-shift for Pokémon ${card.card_name}: ${baseAvg.toFixed(2)} → ${cond.toFixed(2)} (line-size guard)`);
                                return;
                            }
                            card._aceSpecConditionalAvg = cond;
                            card._aceSpecConditionalShift = cond - baseAvg;
                            card._aceSpecConditionalBaseAvg = baseAvg;
                            card.avgCountWhenUsed = cond;
                            overrides += 1;
                            devLog(`[Consistency][ACE-SPEC-Conditional] ${card.card_name}: ${baseAvg.toFixed(2)} → ${cond.toFixed(2)} (presence ${condStat.presence}/${condResult.bucketCount}, ace-spec=${aceSpecSlotCard.card_name})`);
                        }
                    });
                    if (overrides > 0) {
                        devLog(`[Consistency][ACE-SPEC-Conditional] ${overrides} card(s) re-priced for ACE-SPEC=${aceSpecSlotCard.card_name} (${condResult.bucketCount} matching buckets)`);
                    }
                } else {
                    devLog(`[Consistency][ACE-SPEC-Conditional] Skipped — only ${condResult.bucketCount} matching deck(s) for ACE-SPEC=${aceSpecSlotCard.card_name} (need ≥3)`);
                }
            }

            // ==========================================
            // 1.5 STUFE 0 (User-Pinned cards)
            //
            // The user has explicitly demanded that these cards be in
            // every regenerated build. Pin identity is the normalized
            // card NAME — the algorithm still picks the print and
            // computes the count via the same FLOOR(avg) rule as Stage
            // 1, then marks the card with `_isPinned` so downstream
            // demotion / swap / LRM passes leave it alone (mirrors the
            // ACE-SPEC protection pattern).
            //
            // If a pin matches a card the algorithm wouldn't otherwise
            // pick (score below all gates), it still goes in — that's
            // the whole point of pinning. Counts fall back to 2 when
            // avgCountWhenUsed is missing (off-meta tech), preserving
            // the user's intent without over-committing slots.
            //
            // The Setup-Consistency audit below this pass flags pins
            // that knock the deck's CORE-tier slot count too low.
            // ==========================================
            const _pinnedSet = (typeof getPinnedCardNames === 'function')
                ? getPinnedCardNames(source)
                : new Set();
            // Tech-Slots fold into the same Stage-0 pipeline as user
            // pins. The user picked these cards explicitly via the
            // tech-slot UI (or via the Build-vs auto-fill), so the
            // builder treats them as forced inclusions just like pins.
            // The two sets stay separate at the UI level so the
            // builder can show them differently, but merge here so the
            // algorithm only needs one code path.
            const _techSlotNames = (typeof getTechSlotNames === 'function')
                ? getTechSlotNames(source)
                : [];
            _techSlotNames.forEach(nm => {
                const key = (typeof normalizeCardName === 'function')
                    ? normalizeCardName(nm || '')
                    : String(nm || '').toLowerCase().trim();
                if (key) _pinnedSet.add(key);
            });
            window.__lastBuildPinDiagnostics = {
                source,
                pinned: Array.from(_pinnedSet),
                techSlots: _techSlotNames.slice(),
                injected: [],
                missing: [],
            };
            if (_pinnedSet.size > 0) {
                const _normName = typeof normalizeCardName === 'function'
                    ? normalizeCardName
                    : (s => String(s || '').toLowerCase().trim());
                const _seenPinNames = new Set();
                deckCards.forEach(card => {
                    if (currentTotal >= 60) return;
                    if (isAceSpecCard(card)) return;
                    const nm = _normName(card.card_name);
                    if (!_pinnedSet.has(nm)) return;
                    if (_seenPinNames.has(nm)) return; // dedupe across variant rows
                    _seenPinNames.add(nm);
                    card._isPinned = true;
                    if (isRadiantPokemon(card.card_name)) radiantAdded = true;
                    const exactAvg = card.avgCountWhenUsed || card._recommendedCount || 2;
                    let addCount = Math.max(1, Math.round(exactAvg));
                    // Signed remainder so the LRM redistribution pass can
                    // trim cards that round() pushed up (avg − round() can
                    // be negative) and bump cards rounded down. Replaces
                    // the prior floor-only model that under-allocated
                    // staples like Poké Pad (avg 2.8 → 2) and Lillie's
                    // Determination (avg 3.9 → 3).
                    card._lrmRemainder = exactAvg - addCount;
                    const legalMax = card._legalMax || getLegalMaxCopies(card.card_name, card);
                    if (!isBasicEnergyCardEntry(card)) addCount = Math.min(addCount, legalMax);
                    pushCard(card, addCount, '[Consistency][Stage0-Pinned]');
                    window.__lastBuildPinDiagnostics.injected.push({ name: card.card_name, count: addCount });
                });
                // Pins the user requested that aren't in the
                // archetype's card pool: collect their names so the
                // Setup-Consistency warning can surface them later. The
                // pin-forced Ace Spec (handled separately above) doesn't
                // count as missing — Stage 0 deliberately skips Ace Specs
                // so its `_seenPinNames` will never have it, but the
                // Ace-Spec slot picker did honour the pin.
                if (window.__pinForcedAceSpecName) {
                    _seenPinNames.add(window.__pinForcedAceSpecName);
                    window.__lastBuildPinDiagnostics.injected.push({ name: window.__pinForcedAceSpecName, count: 1, slot: 'ace-spec' });
                }
                _pinnedSet.forEach(nm => {
                    if (!_seenPinNames.has(nm)) {
                        window.__lastBuildPinDiagnostics.missing.push(nm);
                    }
                });
            }

            // ==========================================
            // 2. STUFE 1 (Core: consistencyScore >= 75)
            // Meta-boosted + trending cards can exceed 100
            //
            // Allocation uses FLOOR(avgCountWhenUsed) plus a Largest-
            // Remainder-Method redistribution pass after Stage 2. Per-card
            // Math.round() under-allocated when several cards had avg
            // just below the .5 line — e.g. Cynthia's Garchomp's Fighting
            // Energy 4.44 + Rocky Special Energy 3.43 = 7.87 deck-total
            // rounded to 4+3=7, never reaching the deck-correct 8 fighting
            // energies. Floor + remainder is deterministic and matches the
            // overall deck average.
            // ==========================================
            deckCards.forEach(card => {
                if (currentTotal >= 60) return;
                if (isAceSpecCard(card)) return; // Ace Spec haben wir schon
                if (card._isPinned) return;      // Stage 0 schon erledigt

                // Deck-wide Radiant limit
                if (isRadiantPokemon(card.card_name)) {
                    if (radiantAdded) return;
                    radiantAdded = true;
                }

                if (card.consistencyScore >= 75) {
                    const exactAvg = card.avgCountWhenUsed || card._recommendedCount || 0;
                    // Round (not floor) so Stage 1 lands on the avg-the-
                    // user-sees. The signed _lrmRemainder downstream lets
                    // the reverse-LRM pass shave overshoots when the
                    // round-up total exceeds 60.
                    let addCount = Math.round(exactAvg);
                    card._lrmRemainder = exactAvg - addCount;
                    addCount = Math.max(1, addCount); // Core Karten MÜSSEN mindestens 1x rein
                    const legalMax = card._legalMax || getLegalMaxCopies(card.card_name, card);
                    if (!isBasicEnergyCardEntry(card)) addCount = Math.min(addCount, legalMax);
                    if (card._techCounterMaxCount != null) {
                        addCount = Math.min(addCount, card._techCounterMaxCount);
                    }
                    if (addCount >= 1) {
                        pushCard(card, addCount, '[Consistency][Stage1-Core]');
                    }
                }
            });

            // ==========================================
            // 3. STUFE 2 (Extended: consistencyScore >= 40)
            //
            // Threshold tightened in two passes after user review:
            //   - Pass 1 (PR #56): 25 → 35  dropped Larry's Skill (32) and
            //     Budew (26) from Cynthia's Garchomp.
            //   - Pass 2 (this commit): 35 → 40  drops Black Belt's
            //     Training (36) from Lucario Hariyama. The user observed
            //     that a 4th Riolu / 4th Poké Pad (both core consistency
            //     cards) make a stronger consistency list than a 1×
            //     situational tech that's only relevant in a hard pivot
            //     match-up. The freed Stage-2 slot lets LRM re-distribute
            //     to higher-remainder cards, typically the search-engine
            //     items the user actually wants more of.
            //
            // 40 is also a clean cut-off mathematically: a card needs
            // weighted_share ≈ 35 % AND meta_boost > 0, OR weighted_share
            // ≈ 40 % at zero meta share, to clear it. Below that, the
            // doctrine reference describes the card as a "tech sprinkle"
            // that's deck-pilot-dependent rather than consistency-core.
            //
            // Tech-chosen counters (Switch for retreat_lock, etc.) keep
            // their +18 boost and clear the gate when the active-threats
            // audit explicitly budgets them.
            //
            // Allocation rule (Stage 2 only): use Math.floor without the
            // Math.max(1, ...) bump. Cards with avgCountWhenUsed < 1 are
            // SKIPPED unless explicitly chosen as tech counters.
            // Stage 1 keeps Math.max(1, ...) because score≥75 is the
            // deck's identity layer — those cards always belong in.
            // ==========================================
            deckCards.forEach(card => {
                if (currentTotal >= 60) return;
                if (isAceSpecCard(card)) return;
                if (card._isPinned) return; // Stage 0 schon erledigt
                if (consistencyDeck.some(entry => entry.card.card_name === card.card_name)) return; // Schon im Deck?

                // Deck-wide Radiant limit
                if (isRadiantPokemon(card.card_name)) {
                    if (radiantAdded) return;
                    radiantAdded = true;
                }

                // Function-aware Stage-2 gate. TECH-tier cards (damage-
                // buffs, healing tools, defense tools, opponent-hand
                // disruption) need a 10-point higher score than the
                // generic 40 floor — they're match-up-dependent, not
                // structurally consistency-relevant. This keeps cards
                // like Black Belt's Training (score 36) and similar
                // tech sprinkles out even if the data shows them
                // ticking just over the regular threshold.
                // Tech-CHOSEN counters bypass the higher gate via
                // _techCounterMaxCount (the active-threats audit
                // already explicitly budgeted them for the deck's
                // actual meta).
                const _techGate = card._cardFunctionTier === 'TECH' ? 50 : 40;
                const _isChosenCounter = card._techCounterMaxCount != null;
                if (_isChosenCounter ? card.consistencyScore >= 25 : card.consistencyScore >= _techGate) {
                    const exactAvg = card.avgCountWhenUsed || card._recommendedCount || 0;
                    // Round to match Stage 1 — see the rationale above.
                    let addCount = Math.round(exactAvg);
                    card._lrmRemainder = exactAvg - addCount;
                    const isChosenCounter = card._techCounterMaxCount != null;
                    if (addCount < 1) {
                        // Tech-chosen counters with floor=0 (avg < 1) STILL
                        // make it in at 1 copy — they're explicitly
                        // budgeted by the active-threats audit. Everything
                        // else with avg < 1 is a tech sprinkle and gets
                        // skipped (LRM may still pick it up by remainder).
                        if (!isChosenCounter) return;
                        addCount = 1;
                    }
                    if (isChosenCounter) {
                        addCount = Math.min(addCount, card._techCounterMaxCount);
                    }
                    if (addCount >= 1) {
                        const legalMax = card._legalMax || getLegalMaxCopies(card.card_name, card);
                        if (!isBasicEnergyCardEntry(card)) addCount = Math.min(addCount, legalMax);
                        pushCard(card, addCount, '[Consistency][Stage2-Extended]');
                    }
                }
            });

            // ==========================================
            // 3.5 LARGEST-REMAINDER-METHOD REDISTRIBUTION
            // Stage 1+2 round each card's avg. The signed remainder
            // (avg − round(avg)) is positive when the card was rounded
            // down (deserves a +1 bump) and negative when rounded up
            // (overshoot, trim candidate). The forward LRM bumps when
            // the deck is below 60; the reverse LRM (3.5b) trims when
            // above. Together they bring the deck to exactly 60 while
            // honouring avg as closely as possible.
            // ==========================================
            if (currentTotal < 60) {
                const added = _redistributeByLargestRemainder(consistencyDeck, currentTotal, 60, {
                    getLegalMax: getLegalMaxCopies,
                    isBasicEnergy: isBasicEnergyCardEntry,
                    log: (card, entry) => devLog(`[Consistency][LRM] +1x ${card.card_name} (rem=${(card._lrmRemainder || 0).toFixed(2)}, count=${entry.count})`),
                });
                currentTotal += added;
                if (added > 0) devLog(`[Consistency][LRM] Redistributed ${added} slot(s) -- Total: ${currentTotal}/60`);
            } else if (currentTotal > 60) {
                const trimmed = _trimByReverseLrm(consistencyDeck, currentTotal, 60, {
                    log: (card, entry) => devLog(`[Consistency][LRM-Reverse] -1x ${card.card_name} (rem=${(card._lrmRemainder || 0).toFixed(2)}, count→${entry.count})`),
                });
                currentTotal -= trimmed;
                if (trimmed > 0) devLog(`[Consistency][LRM-Reverse] Trimmed ${trimmed} slot(s) -- Total: ${currentTotal}/60`);
            }

            // ==========================================
            // 3.6 BIDIRECTIONAL LRM SWAP — even when the deck is at 60,
            // we may have TECH-tier 1-of cards (Black Belt's Training,
            // damage-buff supporters) holding slots while CORE cards
            // (Poké Pad, Riolu) have positive un-bumped remainders.
            // Swap a TECH demotion for a CORE bump if it improves the
            // consistency-by-remainder math. Pure improvement: never
            // changes deck total, only re-routes slots from match-up
            // tech to structural consistency.
            // ==========================================
            const _swaps = _bidirectionalLrmSwap(consistencyDeck, {
                getLegalMax: getLegalMaxCopies,
                isBasicEnergy: isBasicEnergyCardEntry,
                log: (info) => devLog(`[Consistency][LRM-Swap] ${info.tech} -1 → ${info.core} +1 (techRem=${info.techRem.toFixed(2)}, coreRem=${info.coreRem.toFixed(2)})`),
            });
            if (_swaps > 0) devLog(`[Consistency][LRM-Swap] ${_swaps} TECH→CORE swap(s) applied`);

            // ==========================================
            // 4. FALLBACK: Basis-Energien auffüllen
            // ==========================================
            if (currentTotal < 60) {
                const topBasicEnergy = deckCards.filter(c => isBasicEnergyCardEntry(c)).sort((a, b) => b.sharePercent - a.sharePercent)[0];
                if (topBasicEnergy) {
                    const spaceLeft = 60 - currentTotal;
                    const existingEntry = consistencyDeck.find(e => e.card.card_name === topBasicEnergy.card_name);
                    if (existingEntry) {
                        existingEntry.count += spaceLeft;
                        currentTotal += spaceLeft;
                        devLog(`[Consistency][Fallback-Energy] + ${spaceLeft}x ${topBasicEnergy.card_name} (merged) -- Total: ${currentTotal}/60`);
                    } else {
                        pushCard(topBasicEnergy, spaceLeft, '[Consistency][Fallback-Energy]');
                    }
                }
            }

            // ==========================================
            // 5. ACE-SPEC-AWARE ENERGY FLOOR — final safety net.
            // The doctrine reference says modern decks run 7–11 energies,
            // but the EXACT target inside that window depends on the
            // ACE-SPEC choice (Cynthia + Neo Upper = 8 with Neo Upper
            // counted; Cynthia + Unfair Stamp = 8 raw fighting). When
            // Stage 1+2+LRM+swap+fallback ends up below the conditional
            // target — typically because non-energy cards over-allocated
            // and squeezed out an energy slot — this pass demotes the
            // lowest-priority non-energy card (TECH first, then MID with
            // count > 1, never Stage 1) and adds 1 to the highest-
            // remainder energy. Repeats until target met or no demotion
            // candidate remains. No-op when no ACE-SPEC bucket exists.
            // ==========================================
            if (_aceSpecCondResult && _aceSpecCondResult.bucketCount >= 3) {
                const _energyResult = _enforceEnergyFloor(consistencyDeck, _aceSpecCondResult.conditionalAvgs, {
                    getLegalMax: getLegalMaxCopies,
                    isBasicEnergy: isBasicEnergyCardEntry,
                    isEnergyEntry: (e) => isBasicEnergyCardEntry(e && e.card) || /special energy/i.test(String((e && e.card && e.card.type) || '')),
                    log: (info) => devLog(`[Consistency][EnergyFloor] target=${info.target} — ${info.demoted} -1 → ${info.bumped} +1`),
                });
                if (_energyResult.added > 0) {
                    devLog(`[Consistency][EnergyFloor] enforced ${_energyResult.before}→${_energyResult.after}/${_energyResult.target} (added ${_energyResult.added})`);
                } else if (_energyResult.target > 0) {
                    devLog(`[Consistency][EnergyFloor] OK: ${_energyResult.before}/${_energyResult.target} energies`);
                }

                // Energy Ceiling — opposite direction from Floor.
                // Catches cases where LRM accidentally bumped an
                // energy past the conditional target (Cynthia + Neo
                // Upper user-flagged: target 8 cards, build delivered
                // 9). Demotes the most over-allocated energy and
                // re-routes its slot to the highest-remainder
                // non-energy card (CORE first).
                const _ceilingResult = _enforceEnergyCeiling(consistencyDeck, _aceSpecCondResult.conditionalAvgs, {
                    getLegalMax: getLegalMaxCopies,
                    isBasicEnergy: isBasicEnergyCardEntry,
                    isEnergyEntry: (e) => isBasicEnergyCardEntry(e && e.card) || /special energy/i.test(String((e && e.card && e.card.type) || '')),
                    log: (info) => {
                        if (info.type === 'energy_ceiling') {
                            devLog(`[Consistency][EnergyCeiling] target=${info.target} — ${info.demoted} -1 → ${info.bumped} +1`);
                        } else {
                            devLog(`[Consistency][EnergyCeiling] trim ${info.demoted} -1 (no bump target)`);
                        }
                    },
                });
                if (_ceilingResult.removed > 0) {
                    devLog(`[Consistency][EnergyCeiling] enforced ${_ceilingResult.before}→${_ceilingResult.after}/${_ceilingResult.target} (removed ${_ceilingResult.removed})`);
                }
            }

            // ==========================================
            // 6. CARD DEPENDENCY RESOLUTION — final pass.
            // The user-flagged Alakazam Dudunsparce regression had
            // Genesect SFA in the deck (ability "ACE Nullifier" only
            // fires WITH a Pokémon Tool attached) but no Tools in the
            // trainer line. The slot was structurally dead. This pass
            // demotes any non-Stage-1 non-ACE-SPEC card whose hard
            // prerequisites (e.g. needs-tool) aren't met by the rest
            // of the deck, then re-routes the freed slot to the
            // highest-remainder eligible bump candidate (CORE first).
            // ==========================================
            const _depResult = _resolveCardDependencies(consistencyDeck, {
                getLegalMax: getLegalMaxCopies,
                isBasicEnergy: isBasicEnergyCardEntry,
                log: (info) => {
                    if (info.type === 'dep_demote') {
                        devLog(`[Consistency][Dependencies] ${info.card} stranded — missing: ${info.unmet.join(', ')}`);
                    } else if (info.type === 'dep_reroute') {
                        devLog(`[Consistency][Dependencies] reroute slot from ${info.from} → ${info.to}`);
                    }
                },
            });
            if (_depResult.resolved > 0) {
                devLog(`[Consistency][Dependencies] resolved ${_depResult.resolved} stranded card(s)`);
            }

            // Synergy demotion — second post-allocation pass that uses
            // the co-occurrence map (built earlier from onlineRowsRaw)
            // to demote non-CORE / non-ACE-SPEC cards whose required
            // partners didn't make the build. Catches the Mega-Starmie
            // case where Dreepy / Drakloak / Munkidori made the cut
            // without any Dragapult ex (≈ 100 % co-occurrence partner
            // missing → entire sub-line dead in actual play).
            if (_cooccurrenceMap && _cooccurrenceMap.size > 0) {
                const _synResult = _resolveCardSynergyMissing(consistencyDeck, _cooccurrenceMap, {
                    getLegalMax: getLegalMaxCopies,
                    isBasicEnergy: isBasicEnergyCardEntry,
                    log: (info) => {
                        if (info.type === 'synergy_demote') {
                            devLog(`[Consistency][Synergy] ${info.card} stranded — missing partners: ${info.missing.join(', ')}`);
                        } else if (info.type === 'synergy_reroute') {
                            devLog(`[Consistency][Synergy] reroute slot from ${info.from} → ${info.to}`);
                        }
                    },
                });
                if (_synResult.resolved > 0) {
                    devLog(`[Consistency][Synergy] resolved ${_synResult.resolved} synergy-stranded card(s)`);
                }
            }

            // Recompute currentTotal after potential swap/floor mutations
            // so the post-build summary log matches the actual deck size.
            currentTotal = consistencyDeck.reduce((s, e) => s + (e.count || 0), 0);

            devLog(`[autoCompleteConsistency] Deck complete: ${currentTotal}/60`);

            // Altes Deck löschen und neues speichern
            let cardsToAdd = consistencyDeck.map(entry => {
                return { ...entry.card, addCount: entry.count };
            });

            // Keep output deterministic
            cardsToAdd.sort((a, b) => {
                if (b.consistencyScore !== a.consistencyScore) return b.consistencyScore - a.consistencyScore;
                return a.card_name.localeCompare(b.card_name);
            });

            // ──────────────────────────────────────────────────────────
            // Setup-Consistency audit (Pin side-effect detection)
            //
            // Count slots tagged CORE by _classifyCardFunction — the
            // structural search / draw / engine cards that build the
            // board on T1-T2. Threshold of 12 reflects observed healthy
            // archetypes: 4 ball-search items + 4-5 draw supporters +
            // 3-4 engine-pokemon copies typically clears it. Below 12,
            // the deck struggles to set up reliably.
            //
            // We only WARN when:
            //   (a) score is below threshold AND
            //   (b) pins were injected this run.
            // Without pins the low score is just the archetype's nature,
            // not user error — no toast spam. With pins, the toast tells
            // the user which pin(s) likely crowded out the engine.
            //
            // Off-meta pins (cards the user pinned that aren't in the
            // archetype's card pool) are surfaced even when CORE is
            // healthy — those pins were silently dropped this run, so
            // the user needs to know.
            // ──────────────────────────────────────────────────────────
            try {
                const SETUP_THRESHOLD = 12;
                const coreSlots = cardsToAdd
                    .filter(c => c._cardFunctionTier === 'CORE')
                    .reduce((sum, c) => sum + (c.addCount || 0), 0);
                const diag = window.__lastBuildPinDiagnostics || { injected: [], missing: [] };
                const pinsInjected = (diag.injected || []).length;
                const pinsMissing = (diag.missing || []).length;
                window.__lastBuildSetupScore = { coreSlots, threshold: SETUP_THRESHOLD, source };
                devLog(`[Consistency][SetupAudit] CORE slots = ${coreSlots} / threshold ${SETUP_THRESHOLD} · pins injected = ${pinsInjected} · pins missing from data = ${pinsMissing}`);

                if (typeof showToast === 'function') {
                    if (pinsMissing > 0) {
                        // Off-meta pins → tell the user directly, full
                        // names so they can decide whether to re-add manually.
                        const namesList = (diag.missing || []).slice(0, 3).join(', ');
                        const tpl = t('deck.pinMissingWarn')
                            || 'Pinned card(s) not in archetype data: {names}. Re-add manually if you want them.';
                        showToast(tpl.replace('{names}', namesList), 'warning', 5500);
                    }
                    if (coreSlots < SETUP_THRESHOLD && pinsInjected > 0) {
                        const tpl = t('deck.pinSetupWarn')
                            || 'Setup consistency low ({core}/{thr} core slots). Pins may have crowded out search/draw — try unpinning a tech card.';
                        showToast(
                            tpl.replace('{core}', coreSlots).replace('{thr}', SETUP_THRESHOLD),
                            'warning',
                            6500
                        );
                    }
                }
            } catch (e) {
                devLog('[Consistency][SetupAudit] failed:', e);
            }

            // Build confirm summary
            const hasMetaData = metaShareMap.size > 0;
            // hasTimeDecay was computed in the recency block above.
            let algoDesc = 'ACE SPEC → Core (≥75) → Extended (≥25) → Energy Fill';
            if (hasMetaData) algoDesc += ' | +Meta Boost';
            if (hasTimeDecay) algoDesc += ' | +Time-Decay (last 7d full weight, decay to 21d)';
            if (hasLatestMajorAnchor) algoDesc += ` | +Latest Major Anchor (${latestMajorDate})`;
            if (techAuditActiveThreats.size > 0) {
                const cats = Array.from(techAuditActiveThreats.keys()).join(', ');
                algoDesc += ` | +Tech Audit (active: ${cats})`;
            }

            let summary = `MAX CONSISTENCY Deck (${currentTotal} ${t('deck.cards')}):\n`;
            summary += `Algorithm: ${algoDesc}\n\n`;
            cardsToAdd.forEach(c => {
                let line = `${c.addCount}x ${c.card_name} (${c.sharePercent.toFixed(0)}%`;
                if (c._metaShare > 0) line += ` | meta:${c._metaShare.toFixed(0)}%`;
                const shift = c._weightedShareShift || 0;
                if (Math.abs(shift) > 5) {
                    const arrow = shift > 0 ? '↑' : '↓';
                    line += ` ${arrow}${Math.abs(Math.round(shift))}%`;
                }
                if (c._latestMajorAnchored) line += ' ✓Major';
                if (c._techCounterFor && c._techCounterFor.length) {
                    line += ` ⚔counters:${c._techCounterFor.join(',')}`;
                }
                line += ` → ${c.consistencyScore.toFixed(0)})`;
                summary += line + '\n';
            });
            devLog('[autoCompleteConsistency] Summary:', summary);

            // Persist a structured build report so the deck-toolbar's
            // "ⓘ Build Info" icon (renderConsistencyBuildInfo below) can
            // explain the build retrospectively. Keyed by source so each
            // tab (cityLeague / currentMeta / pastMeta) keeps its own
            // last-build state.
            window.lastConsistencyBuild = window.lastConsistencyBuild || {};
            window.lastConsistencyBuild[source] = {
                source,
                archetype: currentArchetype || '',
                generated_at: new Date().toISOString(),
                deck_size: currentTotal,
                algo_desc: algoDesc,
                layers: {
                    meta_boost: hasMetaData,
                    time_decay: hasTimeDecay,
                    time_decay_major_tournaments: majorAgg ? majorAgg.tournamentCount : 0,
                    time_decay_online_tournaments: onlineAgg ? onlineAgg.tournamentCount : 0,
                    latest_major_anchor: !!hasLatestMajorAnchor,
                    latest_major_date: hasLatestMajorAnchor ? (latestMajorDate || '') : '',
                    // Derived from per-card flags — works whether Stage 3
                    // (PR #46 tech-audit) is merged or not. When Stage 3
                    // isn't present, no card carries _techCounterFor and
                    // the deduped list is empty.
                    tech_audit_active_categories: Array.from(new Set(
                        cardsToAdd.flatMap(c => Array.isArray(c._techCounterFor) ? c._techCounterFor : [])
                    )),
                },
                cards: cardsToAdd.map(c => ({
                    addCount: c.addCount,
                    card_name: c.card_name,
                    set_code: c.set_code || '',
                    set_number: c.set_number || '',
                    share_percent: Math.round(c.sharePercent || 0),
                    avg_count: c.avgCountWhenUsed || 0,
                    consistency_score: Math.round(c.consistencyScore || 0),
                    meta_share: c._metaShare || 0,
                    weighted_share: (c._weightedShare != null) ? Math.round(c._weightedShare) : null,
                    weighted_share_shift: Math.round(c._weightedShareShift || 0),
                    latest_major_anchored: !!c._latestMajorAnchored,
                    latest_major_absent: !!c._latestMajorAbsent,
                    tech_counter_for: Array.isArray(c._techCounterFor) ? c._techCounterFor.slice() : [],
                    // ACE-SPEC-conditional avg-count override (badge in modal).
                    // null when no override was applied; populated with the
                    // base→conditional shift (e.g. "4.55 → 4.07") otherwise.
                    ace_spec_conditional_shift: Number.isFinite(c._aceSpecConditionalShift)
                        ? Math.round(c._aceSpecConditionalShift * 100) / 100
                        : null,
                    ace_spec_conditional_base: Number.isFinite(c._aceSpecConditionalBaseAvg)
                        ? Math.round(c._aceSpecConditionalBaseAvg * 100) / 100
                        : null,
                    ace_spec_conditional_avg: Number.isFinite(c._aceSpecConditionalAvg)
                        ? Math.round(c._aceSpecConditionalAvg * 100) / 100
                        : null,
                    card_function: c._cardFunction || null,
                    card_function_tier: c._cardFunctionTier || null,
                })),
                // Doctrine-driven audit: energy economy 7–11, Stadium bump
                // for colorless engines, Mega-ex prize math, opening-hand
                // probability, ACE-SPEC prize-back-up. Computed once at
                // build time so the modal can render without recomputing.
                quality_audit: _buildQualityAudit(consistencyDeck),
                // ACE-SPEC pick reasoning — chosen card + top alternatives
                // with their Major-tournament shares + the blend weight
                // applied at pick time. Lets the Why?-modal explain why
                // (e.g.) Secret Box won over Maximum Belt despite Maximum
                // Belt's higher cross-tournament Online aggregate.
                ace_spec_pick: _aceSpecPickReport,
            };

            {
                // ──────────────────────────────────────────────────────
                // Phase-6 PR1 — Display ≡ Allocation Source (AC5).
                //
                // Persist the FINAL avgCountWhenUsed (= the value
                // Math.round actually used to pick each card's count)
                // into a side-channel Map keyed by lower-case card name.
                // The card-tile renderer in app-current-meta-analysis.js
                // reads this map to show the EFFECTIVE avg (e.g. 1.92
                // for Wally's when Maximum-Belt-ACE-conditional fired)
                // instead of the naïve combined Online+Major avg (1.26)
                // that the data merge baked into `average_count`.
                //
                // Without this, the user sees "Ø 1.26x" but the algo
                // picks 2 copies (= Math.round(1.92)), which looks
                // mathematically wrong even though it's actually
                // BETTER data driving the choice.
                //
                // Map shape: window.__effectiveAvgMap[source][cardLower]
                //   = { effective, baseline, overrideReason }
                window.__effectiveAvgMap = window.__effectiveAvgMap || {};
                window.__effectiveAvgMap[source] = {};
                cardsToAdd.forEach(card => {
                    const key = (card.card_name || '').trim().toLowerCase();
                    if (!key) return;
                    const eff = Number.isFinite(card.avgCountWhenUsed) ? card.avgCountWhenUsed : null;
                    if (eff == null) return;
                    const baseline = Number.isFinite(card._aceSpecConditionalBaseAvg)
                        ? card._aceSpecConditionalBaseAvg
                        : (Number.isFinite(card._onlineAvg) ? card._onlineAvg : null);
                    let reason = null;
                    if (Number.isFinite(card._aceSpecConditionalAvg)) reason = 'ACE-SPEC';
                    else if (Number.isFinite(card._majorBlendedAvg))  reason = 'Major-blend';
                    window.__effectiveAvgMap[source][key] = {
                        effective: eff,
                        baseline: baseline,
                        overrideReason: reason,
                    };
                });
                devLog(`[Consistency][EffectiveAvg] Persisted ${Object.keys(window.__effectiveAvgMap[source]).length} card avgs for source=${source}`);

                cardsToAdd.forEach(card => {
                    const cardName = fixCardNameEncoding((card.card_name || '').toString().trim());
                    if (!cardName) return;
                    const originalSetCode = card.set_code || '';
                    const originalSetNumber = card.set_number || '';
                    const preferredVersion = getPreferredVersionForCard(cardName, originalSetCode, originalSetNumber);
                    let setCode, setNumber;
                    if (preferredVersion) {
                        setCode = preferredVersion.set;
                        setNumber = preferredVersion.number;
                    } else {
                        setCode = originalSetCode;
                        setNumber = originalSetNumber;
                    }
                    for (let i = 0; i < card.addCount; i++) {
                        addCardToDeckBatch(source, cardName, setCode, setNumber);
                    }
                });

                const normalizedTotal = normalizeGeneratedDeckTo60(source, cardsToAdd, deckCards);
                devLog(`[autoCompleteConsistency] Final normalized deck size: ${normalizedTotal}`);

                devLog('[autoCompleteConsistency] Consistency deck completed with rarity mode:', globalRarityPreference);

                if (source === 'cityLeague') {
                    saveCityLeagueDeck();
                } else if (source === 'currentMeta') {
                    saveCurrentMetaDeck();
                } else if (source === 'pastMeta') {
                    savePastMetaDeck();
                }

                // Snapshot the freshly generated deck. Vanilla builds
                // (no anti-tech target, no tech slots filled) write to
                // `lastVanillaDeck`. Tech builds (anti-tech target set
                // OR tech-slots filled) ALSO write to `lastTechDeck` so
                // the Tech-vs-Normal compare panel at the page bottom
                // can diff the two snapshots. The vanilla bucket isn't
                // overwritten by tech builds — that would erase the
                // baseline the user just built against.
                try {
                    const generatedDeck =
                        source === 'cityLeague' ? window.cityLeagueDeck :
                        source === 'currentMeta' ? window.currentMetaDeck :
                        window.pastMetaDeck;
                    if (generatedDeck) {
                        const baseline = {};
                        Object.entries(generatedDeck).forEach(([key, count]) => {
                            if ((count || 0) <= 0) return;
                            const m = String(key).match(/^(.+?)\s*\(/);
                            const baseName = (m ? m[1] : key).trim();
                            if (!baseName) return;
                            baseline[baseName] = (baseline[baseName] || 0) + count;
                        });
                        baseline.__archetype = currentArchetype || null;
                        baseline.__capturedAt = Date.now();
                        // Per-card consistency score isn't on the deck
                        // map itself, but we have the latest scored
                        // pool in `consistencyDeck` from the build pass
                        // above. Sum its consistencyScore × count for a
                        // total-deck score the compare panel can show.
                        try {
                            const _scoreLookup = new Map();
                            if (Array.isArray(consistencyDeck)) {
                                consistencyDeck.forEach(entry => {
                                    if (!entry || !entry.card) return;
                                    const nm = String(entry.card.card_name || '').trim();
                                    if (!nm) return;
                                    _scoreLookup.set(nm.toLowerCase(), Number(entry.card.consistencyScore) || 0);
                                });
                            }
                            let totalScore = 0;
                            Object.entries(baseline).forEach(([nm, count]) => {
                                if (nm.startsWith('__')) return;
                                const s = _scoreLookup.get(String(nm).toLowerCase()) || 0;
                                totalScore += s * (Number(count) || 0);
                            });
                            baseline.__totalConsistencyScore = totalScore;
                        } catch (_) { /* swallow — score is optional */ }

                        const _wasTechBuild = !!_antiTechTarget || (_techSlotNames && _techSlotNames.length > 0);
                        baseline.__wasTechBuild = _wasTechBuild;
                        baseline.__antiTechTarget = _antiTechTarget || null;

                        if (_wasTechBuild) {
                            if (!window.lastTechDeck) window.lastTechDeck = {};
                            window.lastTechDeck[source] = baseline;
                        } else {
                            if (!window.lastVanillaDeck) window.lastVanillaDeck = {};
                            window.lastVanillaDeck[source] = baseline;
                        }

                        if (source === 'currentMeta' && typeof window.refreshUserVsVanillaPanel === 'function') {
                            window.refreshUserVsVanillaPanel();
                        }
                        if (typeof window.refreshTechVsNormalPanel === 'function') {
                            window.refreshTechVsNormalPanel(source);
                        }
                    }
                } catch (e) { devLog('[autoCompleteConsistency] vanilla snapshot failed:', e); }

                scheduleDeckDisplayUpdate(source);
                if (typeof resetDeckRarityToggle === 'function') resetDeckRarityToggle(source);

                // Build-vs auto-fill: when the user opened the anti-tech
                // modal and picked a target, surface the TechAudit picks
                // in the Tech-Slot UI so they can see + tweak. We rebuild
                // techSlots[source] from the picked counters across all
                // active threat categories. Caps at TECH_SLOTS_MAX so a
                // heavy aggression with many threats doesn't overflow.
                if (_antiTechTarget && typeof techAuditCategoryBudget !== 'undefined' && techAuditCategoryBudget && techAuditCategoryBudget.forEach) {
                    try {
                        const _names = [];
                        const _seen = new Set();
                        techAuditCategoryBudget.forEach((budget) => {
                            if (!budget || !Array.isArray(budget.picked)) return;
                            budget.picked.forEach(p => {
                                const nm = p && p.name ? String(p.name).trim() : '';
                                if (!nm || _seen.has(nm.toLowerCase())) return;
                                _seen.add(nm.toLowerCase());
                                _names.push(nm);
                            });
                        });
                        if (_names.length > 0 && typeof window.techSlotsFromArray === 'function') {
                            const cap = (typeof TECH_SLOTS_MAX === 'number' ? TECH_SLOTS_MAX : 10);
                            window.techSlotsFromArray(source, _names.slice(0, cap));
                            if (typeof renderTechSlotsUI === 'function') renderTechSlotsUI(source);
                            try {
                                if (source === 'cityLeague' && typeof saveCityLeagueDeck === 'function') saveCityLeagueDeck();
                                else if (source === 'currentMeta' && typeof saveCurrentMetaDeck === 'function') saveCurrentMetaDeck();
                                else if (source === 'pastMeta' && typeof savePastMetaDeck === 'function') savePastMetaDeck();
                            } catch (_) { /* swallow */ }
                        }
                    } catch (e) { devLog('[autoCompleteConsistency] tech-slot autofill failed:', e); }
                }

                if (normalizedTotal >= 60) {
                    let successMsg = t('deck.consistencySuccess');
                    if (_antiTechTarget) {
                        const pickedCats = Array.from(techAuditCategoryBudget.entries())
                            .filter(([, b]) => b.picked && b.picked.length > 0)
                            .map(([cat]) => cat);
                        if (pickedCats.length > 0) {
                            successMsg = (t('antiTech.successWithCats') || 'Anti-tech build vs {target} ready. Counters loaded for: {cats}.')
                                .replace('{target}', _antiTechTarget)
                                .replace('{cats}', pickedCats.join(', '));
                        } else {
                            successMsg = (t('antiTech.successNoCats') || 'Anti-tech build vs {target} ready, but no qualifying counter cards were available — baseline TechAudit applied instead.')
                                .replace('{target}', _antiTechTarget);
                        }
                    }
                    if (typeof showDeckShareToast === 'function') {
                        showDeckShareToast(successMsg);
                    } else {
                        showToast(successMsg, 'success');
                    }
                }
            }
        }
        
        // ---------------------------------------------------------------
        // META CARD ANALYSIS (Cross-Archetype Analysis)
        // ---------------------------------------------------------------
        