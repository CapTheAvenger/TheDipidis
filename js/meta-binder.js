(function () {
    'use strict';

    const META_BINDER_CACHE_KEY = 'metaBinderCacheV1';

    function mbText(key, fallback) {
        if (typeof t === 'function') {
            const translated = t(key);
            if (translated && translated !== key) return translated;
        }
        return fallback;
    }

    // ── Gather top archetype names from the <select> dropdowns ──
    function getTopArchetypesFromSelect(selectId, limit) {
        const select = document.getElementById(selectId);
        if (!select) return [];
        return Array.from(select.querySelectorAll('option'))
            .map(o => String(o.value || '').trim())
            .filter(Boolean)
            .slice(0, limit);
    }

    // ── Gather cards for one archetype from available analysis data ──
    function getCardsForArchetype(archetype) {
        // Try current meta analysis data first, then city league
        const sources = [
            window.currentMetaAnalysisData,
            window.cityLeagueAnalysisData
        ];

        for (const data of sources) {
            if (!Array.isArray(data)) continue;
            const cards = data.filter(row =>
                String(row.archetype || '').trim().toLowerCase() === archetype.toLowerCase()
            );
            if (cards.length > 0) return cards;
        }

        // Fallback: tournament cards data
        if (Array.isArray(window.currentMetaTournamentCardsData)) {
            const cards = window.currentMetaTournamentCardsData.filter(row => {
                const rowArch = typeof normalizeCurrentMetaTournamentArchetypeName === 'function'
                    ? normalizeCurrentMetaTournamentArchetypeName(row.archetype)
                    : String(row.archetype || '').trim();
                return rowArch.toLowerCase() === archetype.toLowerCase();
            });
            if (cards.length > 0) return cards;
        }
        return [];
    }

    // ── Build canonical cardId matching collection format ──
    function buildCardId(name, set, number) {
        return `${String(name || '').trim()}|${String(set || '').trim()}|${String(number || '').trim()}`;
    }

    // ── Core: collect max card counts across all target decks ──
    function collectBinderCards(archetypes) {
        const thresholdPercent = 70;

        function parseUsagePercent(row) {
            const direct = String(row.percentage_in_archetype || row.usage_rate || row.usageRate || '').trim();
            if (direct) {
                const directNum = Number.parseFloat(direct.replace(',', '.'));
                if (!Number.isNaN(directNum)) {
                    // Support both 0-1 and 0-100 scales.
                    return directNum <= 1 ? directNum * 100 : directNum;
                }
            }

            const inclusion = Number.parseFloat(String(row.deck_inclusion_count || '').replace(',', '.'));
            const total = Number.parseFloat(String(row.total_decks_in_archetype || '').replace(',', '.'));
            if (!Number.isNaN(inclusion) && !Number.isNaN(total) && total > 0) {
                return (inclusion / total) * 100;
            }

            return 0;
        }

        function isAceSpecRow(row) {
            const rarity = String(row.rarity || '').toLowerCase();
            const group = String(row.group || '').toLowerCase();
            const flag = String(row.is_ace_spec || '').toLowerCase();
            return rarity.includes('ace spec') || group.includes('ace spec') || flag === 'yes' || flag === 'true';
        }

        // Map<cardId, { name, set, number, maxCount, decks: string[] }>
        const binderMap = new Map();

        archetypes.forEach(archetype => {
            const rows = getCardsForArchetype(archetype);
            // Deduplicate by card_name within this archetype (take highest max_count)
            const deckCardMap = new Map();
            rows.forEach(row => {
                const name = String(row.card_name || row.full_card_name || '').trim();
                const set = String(row.set_code || row.set || '').trim();
                const number = String(row.set_number || row.number || '').trim();
                if (!name) return;

                const isAceSpec = isAceSpecRow(row);
                const usagePercent = parseUsagePercent(row);
                if (!isAceSpec && usagePercent < thresholdPercent) return;

                const key = `${name}|${set}|${number}`;
                const count = parseInt(row.max_count || row.count || 0, 10);
                const existing = deckCardMap.get(key);
                if (!existing || count > existing.count) {
                    deckCardMap.set(key, {
                        name,
                        set,
                        number,
                        count,
                        type: String(row.type || '').trim(),
                        rarity: String(row.rarity || '').trim(),
                        isAceSpec
                    });
                }
            });

            deckCardMap.forEach(({ name, set, number, count, type, rarity, isAceSpec }, key) => {
                const cardId = buildCardId(name, set, number);
                const entry = binderMap.get(cardId);
                if (entry) {
                    entry.maxCount = Math.max(entry.maxCount, count);
                    if (!entry.decks.includes(archetype)) entry.decks.push(archetype);
                    if (!entry.type && type) entry.type = type;
                    if (!entry.rarity && rarity) entry.rarity = rarity;
                    entry.isAceSpec = entry.isAceSpec || isAceSpec;
                } else {
                    binderMap.set(cardId, {
                        name, set, number,
                        maxCount: count,
                        decks: [archetype],
                        type,
                        rarity,
                        isAceSpec
                    });
                }
            });
        });

        return binderMap;
    }

    // ── Delta: compare with collection and cached previous binder ──
    function computeDelta(binderMap) {
        const collection = window.userCollection || new Set();
        const collectionCounts = window.userCollectionCounts || new Map();

        // Load previous binder from cache
        let previousIds = new Set();
        try {
            const cached = JSON.parse(localStorage.getItem(META_BINDER_CACHE_KEY) || '[]');
            previousIds = new Set(cached);
        } catch (_) { /* ignore */ }

        const results = [];
        binderMap.forEach((entry, cardId) => {
            const owned = collectionCounts.get(cardId) || 0;
            const needed = entry.maxCount;
            const missing = Math.max(0, needed - owned);
            const wasInPrevious = previousIds.has(cardId);
            results.push({
                cardId,
                name: entry.name,
                set: entry.set,
                number: entry.number,
                maxCount: needed,
                owned,
                missing,
                isNew: !wasInPrevious,
                decks: entry.decks,
                type: entry.type,
                rarity: entry.rarity,
                isAceSpec: !!entry.isAceSpec
            });
        });

        // Cards that were in the previous binder but no longer needed
        const currentIds = new Set(binderMap.keys());
        const droppedCards = [];
        previousIds.forEach(oldId => {
            if (!currentIds.has(oldId)) {
                const [name, set, number] = oldId.split('|');
                droppedCards.push({ cardId: oldId, name: name || oldId, set: set || '', number: number || '' });
            }
        });

        // Save current binder as new cache
        localStorage.setItem(META_BINDER_CACHE_KEY, JSON.stringify(Array.from(binderMap.keys())));

        return { cards: results, droppedCards };
    }

    // ── Look up card image URL from the allCardsDatabase ──
    function findCardImage(name, set, number) {
        if (typeof window.getIndexedCardBySetNumber === 'function') {
            const card = window.getIndexedCardBySetNumber(set, number)
                || window.getIndexedCardBySetNumber(set, String(parseInt(number, 10) || number));
            if (card && card.image_url) return card.image_url;
        }
        const allCards = window.allCardsDatabase || [];
        const found = allCards.find(c =>
            c.name === name && c.set === set && String(c.number) === String(number)
        );
        return found ? (found.image_url || found.image || '') : '';
    }

    function findCardRecord(name, set, number) {
        if (typeof window.getIndexedCardBySetNumber === 'function') {
            const card = window.getIndexedCardBySetNumber(set, number)
                || window.getIndexedCardBySetNumber(set, String(parseInt(number, 10) || number));
            if (card) return card;
        }
        const allCards = window.allCardsDatabase || [];
        return allCards.find(c =>
            c.name === name && c.set === set && String(c.number) === String(number)
        ) || null;
    }

    function isPokemonTypeString(typeValue) {
        const t = String(typeValue || '').toLowerCase();
        return t.includes('basic')
            || t.includes('stage')
            || t.includes('vmax')
            || t.includes('vstar')
            || t.includes('ex')
            || t.includes('mega')
            || t.includes('break')
            || t.includes('legend')
            || t.includes('restored');
    }

    function normalizePokemonElement(value) {
        const t = String(value || '').toLowerCase();
        if (t.includes('grass')) return 'Grass';
        if (t.includes('fire')) return 'Fire';
        if (t.includes('water')) return 'Water';
        if (t.includes('lightning') || t.includes('electric')) return 'Lightning';
        if (t.includes('psychic')) return 'Psychic';
        if (t.includes('fighting')) return 'Fighting';
        if (t.includes('darkness') || t.includes('dark')) return 'Darkness';
        if (t.includes('metal') || t.includes('steel')) return 'Metal';
        if (t.includes('dragon')) return 'Dragon';
        if (t.includes('colorless') || t.includes('normal')) return 'Colorless';
        return '';
    }

    function getMetaBinderTypeMeta(card) {
        const cardDb = findCardRecord(card.name, card.set, card.number);
        const rowType = String(card.type || '').trim();
        const rowTypeLower = rowType.toLowerCase();
        const rarityLower = String(card.rarity || '').toLowerCase();
        const aceSpec = !!card.isAceSpec || rarityLower.includes('ace spec');

        if (aceSpec) {
            return { supertype: 'Trainer', type: 'ACE SPEC', isAceSpec: true };
        }

        if (rowTypeLower.includes('supporter')) return { supertype: 'Trainer', type: 'Supporter', isAceSpec: false };
        if (rowTypeLower.includes('item')) return { supertype: 'Trainer', type: 'Item', isAceSpec: false };
        if (rowTypeLower.includes('tool')) return { supertype: 'Trainer', type: 'Tool', isAceSpec: false };
        if (rowTypeLower.includes('stadium')) return { supertype: 'Trainer', type: 'Stadium', isAceSpec: false };
        if (rowTypeLower.includes('special energy')) return { supertype: 'Energy', type: 'Special Energy', isAceSpec: false };
        if (rowTypeLower.includes('basic energy')) return { supertype: 'Energy', type: 'Basic Energy', isAceSpec: false };

        const looksLikePokemon = isPokemonTypeString(rowType) || (!rowTypeLower.includes('energy') && !rowTypeLower.includes('trainer'));
        if (looksLikePokemon) {
            let element = normalizePokemonElement(rowType);
            if (!element && cardDb) {
                if (typeof window.getPokemonElementFromCard === 'function') {
                    const fromCard = window.getPokemonElementFromCard(cardDb);
                    element = normalizePokemonElement(fromCard);
                }
                if (!element) {
                    element = normalizePokemonElement(cardDb.type);
                }
            }
            return { supertype: 'Pokemon', type: element ? `Pokemon-${element}` : 'Pokemon-Colorless', isAceSpec: false };
        }

        if (rowTypeLower.includes('energy')) return { supertype: 'Energy', type: 'Special Energy', isAceSpec: false };
        return { supertype: 'Trainer', type: 'Item', isAceSpec: false };
    }

    function sortMetaCards(cards) {
        const typeOrder = {
            Pokemon: 1,
            Trainer: 2,
            Energy: 3
        };
        return cards.sort((a, b) => {
            const aTypeMeta = getMetaBinderTypeMeta(a);
            const bTypeMeta = getMetaBinderTypeMeta(b);
            const aOrder = typeOrder[aTypeMeta.supertype] || 99;
            const bOrder = typeOrder[bTypeMeta.supertype] || 99;
            if (aOrder !== bOrder) return aOrder - bOrder;
            if (aTypeMeta.type !== bTypeMeta.type) return aTypeMeta.type.localeCompare(bTypeMeta.type);
            return a.name.localeCompare(b.name);
        });
    }

    // ── Active filter for the binder view ──
    let metaBinderFilter = 'all'; // 'all', 'new', 'missing'

    function setMetaBinderFilter(filter) {
        metaBinderFilter = filter;
        // Update filter button states
        document.querySelectorAll('.meta-binder-filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });
        applyComplexMetaFilter();
    }

    function updateMetaBinderSetFilter(cards) {
        const setSelect = document.getElementById('mbFilterSet');
        if (!setSelect) return;

        const currentValue = setSelect.value || 'all';
        const setCodes = [...new Set(cards.map(c => String(c.set || '').trim()).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b));

        setSelect.innerHTML = [
            '<option value="all">Alle Sets</option>',
            ...setCodes.map(code => `<option value="${escapeHtml(code)}">${escapeHtml(code)}</option>`)
        ].join('');

        if (setCodes.includes(currentValue)) {
            setSelect.value = currentValue;
        } else {
            setSelect.value = 'all';
        }
    }

    function applyComplexMetaFilter() {
        const delta = window._metaBinderDelta;
        if (!delta) return;
        renderMetaBinderGrid(delta);
    }

    // ── Render ──
    function renderMetaBinder(delta) {
        const grid = document.getElementById('metaBinderGrid');
        const statsEl = document.getElementById('metaBinderStats');
        const deltaEl = document.getElementById('metaBinderDelta');
        const filtersEl = document.getElementById('metaBinderFilters');
        if (!grid) return;

        const { cards, droppedCards } = delta;
        const totalUnique = cards.length;
        const totalCopies = cards.reduce((s, c) => s + c.maxCount, 0);
        const missingUnique = cards.filter(c => c.missing > 0).length;
        const missingCopies = cards.reduce((s, c) => s + c.missing, 0);
        const ownedComplete = cards.filter(c => c.missing === 0).length;
        const newCount = cards.filter(c => c.isNew).length;
        const droppedCount = droppedCards.length;

        // Stats bar
        if (statsEl) {
            statsEl.classList.remove('display-none');
            statsEl.innerHTML = `
                <div class="meta-binder-stat">
                    <span class="meta-binder-stat-value">${totalUnique}</span>
                    <span class="meta-binder-stat-label">${mbText('mb.uniqueCards', 'Unique Cards')}</span>
                </div>
                <div class="meta-binder-stat">
                    <span class="meta-binder-stat-value">${totalCopies}</span>
                    <span class="meta-binder-stat-label">${mbText('mb.totalCopies', 'Total Copies')}</span>
                </div>
                <div class="meta-binder-stat">
                    <span class="meta-binder-stat-value meta-binder-stat-green">${ownedComplete}</span>
                    <span class="meta-binder-stat-label">${mbText('mb.complete', 'Complete')}</span>
                </div>
                <div class="meta-binder-stat">
                    <span class="meta-binder-stat-value meta-binder-stat-red">${missingUnique} / ${missingCopies}</span>
                    <span class="meta-binder-stat-label">${mbText('mb.missing', 'Missing (Cards / Copies)')}</span>
                </div>
                <div class="meta-binder-stat">
                    <span class="meta-binder-stat-value" style="color:#3B4CCA">${newCount}</span>
                    <span class="meta-binder-stat-label">${mbText('mb.newThisWeek', 'New This Week')}</span>
                </div>
                <div class="meta-binder-stat">
                    <span class="meta-binder-stat-value" style="color:#e67e22">${droppedCount}</span>
                    <span class="meta-binder-stat-label">${mbText('mb.droppedCount', 'Dropped')}</span>
                </div>`;
        }

        // Filter buttons
        if (filtersEl) {
            filtersEl.classList.remove('display-none');
            filtersEl.innerHTML = `
                <div class="filter-group">
                    <button class="meta-binder-filter-btn active" data-filter="all" onclick="setMetaBinderFilter('all')">${mbText('mb.filterAll', 'Alle')} (${totalUnique})</button>
                    <button class="meta-binder-filter-btn" data-filter="missing" onclick="setMetaBinderFilter('missing')">❌ ${mbText('mb.filterMissing', 'Fehlend')} (${missingUnique})</button>
                    <button class="meta-binder-filter-btn" data-filter="new" onclick="setMetaBinderFilter('new')">🆕 ${mbText('mb.filterNew', 'Neu')} (${newCount})</button>
                </div>
                <div class="filter-group">
                    <select id="mbFilterType" onchange="applyComplexMetaFilter()" class="select-system">
                        <option value="all">Alle Typen</option>
                        <option value="Pokemon-Grass">Pokemon: Pflanze</option>
                        <option value="Pokemon-Fire">Pokemon: Feuer</option>
                        <option value="Pokemon-Water">Pokemon: Wasser</option>
                        <option value="Pokemon-Lightning">Pokemon: Elektro</option>
                        <option value="Pokemon-Psychic">Pokemon: Psycho</option>
                        <option value="Pokemon-Fighting">Pokemon: Kampf</option>
                        <option value="Pokemon-Darkness">Pokemon: Unlicht</option>
                        <option value="Pokemon-Metal">Pokemon: Metall</option>
                        <option value="Pokemon-Dragon">Pokemon: Drache</option>
                        <option value="Pokemon-Colorless">Pokemon: Farblos</option>
                        <option value="Supporter">Unterstutzer</option>
                        <option value="Item">Item</option>
                        <option value="Tool">Ausrustung</option>
                        <option value="Stadium">Stadion</option>
                        <option value="Special Energy">Spezial-Energie</option>
                        <option value="Basic Energy">Basis-Energie</option>
                        <option value="ACE SPEC">ACE SPEC</option>
                    </select>

                    <select id="mbFilterSet" onchange="applyComplexMetaFilter()" class="select-system">
                        <option value="all">Alle Sets</option>
                    </select>
                </div>`;
        }

        // Enable action buttons if there are missing cards
        const wishlistBtn = document.getElementById('metaBinderAddWishlist');
        const proxyBtn = document.getElementById('metaBinderSendProxy');
        const proxyNewBtn = document.getElementById('metaBinderProxyNew');
        if (wishlistBtn) wishlistBtn.disabled = missingCopies === 0;
        if (proxyBtn) proxyBtn.disabled = missingCopies === 0;
        if (proxyNewBtn) proxyNewBtn.disabled = newCount === 0;

        metaBinderFilter = 'all';
        updateMetaBinderSetFilter(cards);
        renderMetaBinderGrid(delta);
    }

    // ── Render grid (filtered) ──
    function renderMetaBinderGrid(delta) {
        const grid = document.getElementById('metaBinderGrid');
        if (!grid) return;

        const { cards } = delta;

        const typeFilterEl = document.getElementById('mbFilterType');
        const setFilterEl = document.getElementById('mbFilterSet');
        const typeFilter = typeFilterEl ? String(typeFilterEl.value || 'all') : 'all';
        const setFilter = setFilterEl ? String(setFilterEl.value || 'all').toLowerCase() : 'all';

        // Apply active filter
        let filtered;
        if (metaBinderFilter === 'new') {
            filtered = cards.filter(c => c.isNew);
        } else if (metaBinderFilter === 'missing') {
            filtered = cards.filter(c => c.missing > 0);
        } else {
            filtered = cards;
        }

        filtered = filtered.filter(card => {
            const meta = getMetaBinderTypeMeta(card);
            const cardSet = String(card.set || '').toLowerCase();

            if (typeFilter !== 'all' && meta.type !== typeFilter) return false;
            if (setFilter !== 'all' && cardSet !== setFilter) return false;
            return true;
        });

        const sorted = sortMetaCards([...filtered]);

        if (sorted.length === 0) {
            grid.innerHTML = `<p class="color-grey">${mbText('mb.empty', 'No meta card data found. Make sure Current Meta or City League data is loaded.')}</p>`;
            return;
        }

        grid.innerHTML = sorted.map(card => {
            const imageUrl = findCardImage(card.name, card.set, card.number);
            const statusClass = card.missing > 0 ? 'meta-binder-card-missing card-missing' : 'meta-binder-card-owned card-owned';
            const newBadge = card.isNew ? `<span class="meta-binder-badge-new">${mbText('mb.new', 'NEW')}</span>` : '';
            const safeImage = escapeHtml(imageUrl);
            const safeName = escapeHtml(card.name);
            const deckList = card.decks.map(d => escapeHtml(d)).join(', ');
            const typeMeta = getMetaBinderTypeMeta(card);
            const countLabel = card.missing > 0
                ? `<span class="meta-binder-count-missing">${card.owned}/${card.maxCount}</span>`
                : `<span class="meta-binder-count-ok">${card.owned}/${card.maxCount} ✓</span>`;

            return `
                <div class="meta-binder-card ${statusClass}" data-type="${escapeHtml(typeMeta.type)}" data-set="${escapeHtml(String(card.set || ''))}" data-supertype="${escapeHtml(typeMeta.supertype)}" data-is-ace-spec="${typeMeta.isAceSpec ? 'true' : 'false'}" title="Wird verwendet in: ${deckList}">
                    ${imageUrl
                        ? `<img src="${safeImage}" alt="${safeName}" class="meta-binder-card-img" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                           <div class="meta-binder-card-fallback" style="display:none">${safeName}</div>`
                        : `<div class="meta-binder-card-fallback">${safeName}<br><small>${escapeHtml(card.set)} ${escapeHtml(card.number)}</small></div>`}
                    <div class="meta-binder-card-info">
                        ${newBadge}
                        <span class="meta-binder-card-need">${card.maxCount}x</span>
                        <div class="deck-indicator-count">${card.decks.length} Decks</div>
                        ${countLabel}
                    </div>
                </div>`;
        }).join('');
    }

    // ── Ensure meta data is loaded before building the binder ──
    async function ensureMetaDataLoaded() {
        const promises = [];

        // Load Current Meta Analysis if not already present
        if (!window.currentMetaAnalysisLoaded) {
            if (typeof loadCurrentAnalysis === 'function') {
                console.log('[MetaBinder] Triggering loadCurrentAnalysis()…');
                promises.push(loadCurrentAnalysis().catch(e => console.warn('[MetaBinder] loadCurrentAnalysis failed:', e)));
            } else if (typeof loadCurrentMetaAnalysis === 'function') {
                console.log('[MetaBinder] Triggering loadCurrentMetaAnalysis()…');
                promises.push(loadCurrentMetaAnalysis().catch(e => console.warn('[MetaBinder] loadCurrentMetaAnalysis failed:', e)));
            } else {
                // Direct CSV fallback
                console.log('[MetaBinder] No loader found, loading CSV directly…');
                promises.push((async () => {
                    try {
                        const data = await loadCSV('current_meta_card_data.csv');
                        if (data && data.length > 0) {
                            window.currentMetaAnalysisData = data;
                            if (typeof populateCurrentMetaDeckSelect === 'function') {
                                await populateCurrentMetaDeckSelect(data);
                            }
                            window.currentMetaAnalysisLoaded = true;
                        }
                    } catch (e) { console.warn('[MetaBinder] Direct CSV load failed:', e); }
                })());
            }
        }

        // Load City League Analysis if not already present
        if (!window.cityLeagueAnalysisLoaded) {
            if (typeof loadCityLeagueAnalysis === 'function') {
                console.log('[MetaBinder] Triggering loadCityLeagueAnalysis()…');
                promises.push(loadCityLeagueAnalysis().catch(e => console.warn('[MetaBinder] loadCityLeagueAnalysis failed:', e)));
            } else {
                // Direct CSV fallback
                console.log('[MetaBinder] No CL loader found, loading CSV directly…');
                promises.push((async () => {
                    try {
                        const data = await loadCSV('city_league_analysis.csv');
                        if (data && data.length > 0) {
                            window.cityLeagueAnalysisData = data;
                            if (typeof populateCityLeagueDeckSelect === 'function') {
                                await populateCityLeagueDeckSelect(data);
                            }
                            window.cityLeagueAnalysisLoaded = true;
                        }
                    } catch (e) { console.warn('[MetaBinder] Direct CL CSV load failed:', e); }
                })());
            }
        }

        if (promises.length > 0) {
            console.log('[MetaBinder] Waiting for', promises.length, 'data sources…');
            await Promise.all(promises);
            console.log('[MetaBinder] Data loading complete.',
                'currentMetaAnalysisData:', Array.isArray(window.currentMetaAnalysisData) ? window.currentMetaAnalysisData.length + ' rows' : 'null',
                'cityLeagueAnalysisData:', Array.isArray(window.cityLeagueAnalysisData) ? window.cityLeagueAnalysisData.length + ' rows' : 'null');
        }
    }

    // ── Main: build the binder ──
    async function buildMetaBinder() {
        const grid = document.getElementById('metaBinderGrid');
        if (grid) grid.innerHTML = `<p class="color-grey">${mbText('mb.loading', 'Loading meta data…')}</p>`;

        console.log('[MetaBinder] Building binder…');
        await ensureMetaDataLoaded();

        const currentMetaArchetypes = getTopArchetypesFromSelect('currentMetaDeckSelect', 20);
        const cityLeagueArchetypes = getTopArchetypesFromSelect('cityLeagueDeckSelect', 10);
        console.log('[MetaBinder] Archetypes found — currentMeta:', currentMetaArchetypes.length, ', cityLeague:', cityLeagueArchetypes.length);

        // Merge, deduplicate
        const seen = new Set();
        const allArchetypes = [];
        [...currentMetaArchetypes, ...cityLeagueArchetypes].forEach(name => {
            const lower = name.toLowerCase();
            if (!seen.has(lower)) {
                seen.add(lower);
                allArchetypes.push(name);
            }
        });

        if (allArchetypes.length === 0) {
            showToast(mbText('mb.noData', 'No meta data loaded yet. Please visit Current Meta or City League first.'), 'warning');
            if (grid) grid.innerHTML = '';
            return;
        }

        const binderMap = collectBinderCards(allArchetypes);
        if (binderMap.size === 0) {
            showToast(mbText('mb.noCards', 'No card data found for the selected archetypes.'), 'warning');
            if (grid) grid.innerHTML = '';
            return;
        }

        const delta = computeDelta(binderMap);

        // Store on window for the action buttons
        window._metaBinderDelta = delta;

        renderMetaBinder(delta);
        showToast(mbText('mb.generated', 'Meta Binder generated!'), 'success');
    }

    // ── Quick-Action: Send NEW cards to proxy printer ──
    function metaBinderProxyNewCards() {
        const delta = window._metaBinderDelta;
        if (!delta || !delta.cards) return;

        const newCards = delta.cards.filter(c => c.isNew && c.missing > 0);
        if (newCards.length === 0) {
            showToast(mbText('mb.noNewMissing', 'No new missing cards to proxy.'), 'info');
            return;
        }

        let totalAdded = 0;
        newCards.forEach(card => {
            if (typeof addCardToProxy === 'function') {
                addCardToProxy(card.name, card.set, card.number, card.missing, true);
                totalAdded += card.missing;
            }
        });

        if (typeof renderProxyQueue === 'function') renderProxyQueue();
        showToast(mbText('mb.proxyNewDone', '{count} new cards sent to Proxy Printer.').replace('{count}', String(totalAdded)), 'success');
    }

    // ── Quick-Action: Add missing to wishlist ──
    function metaBinderAddMissingToWishlist() {
        const delta = window._metaBinderDelta;
        if (!delta || !delta.cards) return;

        if (!window.auth?.currentUser) {
            showToast(mbText('mb.signInRequired', 'Please sign in to use this feature.'), 'warning');
            return;
        }

        const missingCards = delta.cards.filter(c => c.missing > 0);
        if (missingCards.length === 0) {
            showToast(mbText('mb.nothingMissing', 'All cards are already in your collection!'), 'info');
            return;
        }

        let added = 0;
        missingCards.forEach(card => {
            if (!window.userWishlist || !window.userWishlist.has(card.cardId)) {
                if (typeof addToWishlist === 'function') {
                    addToWishlist(card.cardId);
                    added++;
                }
            }
        });

        showToast(mbText('mb.wishlistDone', '{count} cards added to wishlist.').replace('{count}', String(added)), 'success');
    }

    // ── Quick-Action: Send missing to proxy printer ──
    function metaBinderSendMissingToProxy() {
        const delta = window._metaBinderDelta;
        if (!delta || !delta.cards) return;

        const missingCards = delta.cards.filter(c => c.missing > 0);
        if (missingCards.length === 0) {
            showToast(mbText('mb.nothingMissing', 'All cards are already in your collection!'), 'info');
            return;
        }

        let totalAdded = 0;
        missingCards.forEach(card => {
            if (typeof addCardToProxy === 'function') {
                addCardToProxy(card.name, card.set, card.number, card.missing, true);
                totalAdded += card.missing;
            }
        });

        if (typeof renderProxyQueue === 'function') renderProxyQueue();
        showToast(mbText('mb.proxyDone', '{count} cards sent to Proxy Printer.').replace('{count}', String(totalAdded)), 'success');
    }

    // ── Expose ──
    window.buildMetaBinder = buildMetaBinder;
    window.metaBinderAddMissingToWishlist = metaBinderAddMissingToWishlist;
    window.metaBinderSendMissingToProxy = metaBinderSendMissingToProxy;
    window.metaBinderProxyNewCards = metaBinderProxyNewCards;
    window.setMetaBinderFilter = setMetaBinderFilter;
    window.applyComplexMetaFilter = applyComplexMetaFilter;
})();
