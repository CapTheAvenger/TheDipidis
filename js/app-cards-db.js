// app-cards-db.js — extracted from app.js
// Part of Hausi's Pokemon TCG Analysis

        function renderDeckAnalysisTable(data, container, countElementId, summaryElementId) {
            if (!container || !data || data.length === 0) return;

            const headers = Object.keys(data[0]);
            let html = '<table><thead><tr>';
            headers.forEach(header => {
                html += `<th>${header}</th>`;
            });
            html += '</tr></thead><tbody>';

            data.forEach(row => {
                html += '<tr>';
                headers.forEach(header => {
                    html += `<td>${row[header]}</td>`;
                });
                html += '</tr>';
            });

            html += '</tbody></table>';
            container.innerHTML = html;

            const countEl = document.getElementById(countElementId);
            const summaryEl = document.getElementById(summaryElementId);
            if (countEl && summaryEl) {
                countEl.textContent = `${data.length} ${t('deck.cards')}`;
                summaryEl.textContent = `/ ${data.length} Total`;
            }
        }
        
        // Load Cards
        let allCards = [];
        // Card Database Variables
        let allCardsData = [];
        let filteredCardsData = [];
        
        // Mutual exclusion for base meta radio buttons — no handler needed,
        // radio buttons inherently allow only one selection.
        // Kept as a no-op stub so existing onchange references don't error.
        function handleBaseMetaChange(changedCb) {}

        // Toggle card filter visibility
        function toggleCardFilter(filterId) {
            const filterOptions = document.getElementById(filterId);
            if (!filterOptions) return;
            const group = filterOptions.closest('.cards-filter-group');
            const header = group ? group.querySelector('.cards-filter-header') : null;
            
            if (filterOptions && header) {
                const isCollapsed = filterOptions.classList.contains('collapsed');
                
                if (isCollapsed) {
                    // Expand
                    filterOptions.classList.remove('collapsed');
                    header.classList.remove('collapsed');
                    header.setAttribute('aria-expanded', 'true');
                    // Show search input if present
                    const searchInput = group.querySelector('.cards-filter-search-input');
                    if (searchInput) searchInput.style.display = '';
                } else {
                    // Collapse
                    filterOptions.classList.add('collapsed');
                    header.classList.add('collapsed');
                    header.setAttribute('aria-expanded', 'false');
                    // Hide search input if present
                    const searchInput = group.querySelector('.cards-filter-search-input');
                    if (searchInput) searchInput.style.display = 'none';
                }
            }
        }

        function ensureCardsFilterMarkup() {
            const sections = [
                {
                    groupId: 'filter-meta-format',
                    targetId: 'metaFormatOptions',
                    html: `
                        <div class="cards-filter-header collapsed" onclick="toggleCardFilter('metaFormatOptions')" role="button" tabindex="0" aria-expanded="false">
                            <span>Meta / Format</span>
                            <span class="toggle-icon">▼</span>
                        </div>
                        <div class="cards-filter-options collapsed" id="metaFormatOptions">
                            <label class="label-block"><input type="radio" name="baseMetaFilter" value="total" checked onchange="filterAndRenderCards()"> Total (All Cards)</label>
                            <label class="label-block"><input type="radio" name="baseMetaFilter" value="all_playables" onchange="filterAndRenderCards()"> All Playables</label>
                            <label class="label-block"><input type="radio" name="baseMetaFilter" value="city_league" onchange="filterAndRenderCards()"> City League Only</label>
                        </div>
                    `
                },
                {
                    groupId: 'filter-set',
                    targetId: 'setFilterOptions',
                    html: `
                        <div class="cards-filter-header collapsed" onclick="toggleCardFilter('setFilterOptions')" role="button" tabindex="0" aria-expanded="false">
                            <span>Set</span>
                            <span class="toggle-icon">▼</span>
                        </div>
                        <div class="cards-filter-options collapsed" id="setFilterOptions"></div>
                    `
                },
                {
                    groupId: 'filter-rarity',
                    targetId: 'rarityFilterOptions',
                    html: `
                        <div class="cards-filter-header collapsed" onclick="toggleCardFilter('rarityFilterOptions')" role="button" tabindex="0" aria-expanded="false">
                            <span>Rarity</span>
                            <span class="toggle-icon">▼</span>
                        </div>
                        <div class="cards-filter-options collapsed" id="rarityFilterOptions"></div>
                    `
                },
                {
                    groupId: 'filter-category',
                    targetId: 'categoryFilterOptions',
                    html: `
                        <div class="cards-filter-header collapsed" onclick="toggleCardFilter('categoryFilterOptions')" role="button" tabindex="0" aria-expanded="false">
                            <span>Category</span>
                            <span class="toggle-icon">▼</span>
                        </div>
                        <div class="cards-filter-options collapsed" id="categoryFilterOptions"></div>
                    `
                },
                {
                    groupId: 'filter-element-type',
                    targetId: 'elementTypeFilterOptions',
                    html: `
                        <div class="cards-filter-header collapsed" onclick="toggleCardFilter('elementTypeFilterOptions')" role="button" tabindex="0" aria-expanded="false">
                            <span>Element Type</span>
                            <span class="toggle-icon">▼</span>
                        </div>
                        <div class="cards-filter-options collapsed" id="elementTypeFilterOptions"></div>
                    `
                },
                {
                    groupId: 'filter-main-pokemon',
                    targetId: 'mainPokemonList',
                    html: `
                        <div class="cards-filter-header collapsed" onclick="toggleCardFilter('mainPokemonList')" role="button" tabindex="0" aria-expanded="false">
                            <span>Main Pokemon</span>
                            <span class="toggle-icon">▼</span>
                        </div>
                        <input type="text" id="mainPokemonSearch" class="cards-filter-search-input" placeholder="Search main Pokemon..." oninput="filterMainPokemonList()" aria-label="Search main Pokemon filter list" style="display:none">
                        <div class="cards-filter-options collapsed" id="mainPokemonList"></div>
                    `
                },
                {
                    groupId: 'filter-archetype',
                    targetId: 'archetypeList',
                    html: `
                        <div class="cards-filter-header collapsed" onclick="toggleCardFilter('archetypeList')" role="button" tabindex="0" aria-expanded="false">
                            <span>Archetype</span>
                            <span class="toggle-icon">▼</span>
                        </div>
                        <input type="text" id="archetypeSearch" class="cards-filter-search-input" placeholder="Search archetype..." oninput="filterArchetypeList()" aria-label="Search archetype filter list" style="display:none">
                        <div class="cards-filter-options collapsed" id="archetypeList"></div>
                    `
                },
                {
                    groupId: 'filter-deck-coverage',
                    targetId: 'deckCoverageFilterOptions',
                    html: `
                        <div class="cards-filter-header collapsed" onclick="toggleCardFilter('deckCoverageFilterOptions')" role="button" tabindex="0" aria-expanded="false">
                            <span>Deck Coverage</span>
                            <span class="toggle-icon">▼</span>
                        </div>
                        <div class="cards-filter-options collapsed" id="deckCoverageFilterOptions"></div>
                    `
                }
            ];

            sections.forEach(section => {
                const group = document.getElementById(section.groupId);
                if (!group) return;
                if (group.querySelector(`#${section.targetId}`)) return;
                group.innerHTML = section.html;
            });

            // Keyboard support for filter headers (Enter/Space)
            document.querySelectorAll('.cards-filter-header[role="button"]').forEach(header => {
                if (!header._kbBound) {
                    header._kbBound = true;
                    header.addEventListener('keydown', function(e) {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.click(); }
                    });
                }
            });
        }
        
        // Pagination for Cards Tab
        let currentCardsPage = 1;
        const cardsPerPage = 63;
        let showAllCards = false;
        let showOnlyOnePrint = true; // Toggle for deduplication: true = only show 1 print per card (low rarity, newest)
        const cardsFilterRenderState = {
            isFiltering: false,
            pending: false,
            lastSignature: ''
        };
        const cardsVirtualState = {
            observer: null,
            slots: [],
            estimatedHeight: 320,
            renderedCount: 0
        };
        let _loadCardsRunning = false;
        
        async function loadCards() {
            if (_loadCardsRunning) return;
            _loadCardsRunning = true;
            const content = document.getElementById('cardsContent');
            const resultsInfo = document.getElementById('cardResultsInfo');
            const setProgress = (msg) => {
                if (content) content.innerHTML = `<div class="loading">${msg}</div>`;
            };
            setProgress('Loading card database...');
            
            try {
                ensureCardsFilterMarkup();

                // Ensure set mapping is loaded (for English sets)
                if (!window.englishSetCodes || window.englishSetCodes.size === 0) {
                    await loadSetMapping();
                }
                
                // Use already loaded cards from loadAllCardsDatabase() instead of loading again
                if (!window.allCardsDatabase || window.allCardsDatabase.length === 0) {
                    setProgress('Loading card database (this may take a moment)...');
                    await loadAllCardsDatabase();
                }
                
                // Filter to only English cards
                let englishCards = [];
                if (window.englishSetCodes && window.englishSetCodes.size > 0) {
                    englishCards = window.allCardsDatabase.filter(card => 
                        window.englishSetCodes.has(card.set)
                    );
                }
                // Fallback: if set mapping failed or no matches, keep card database usable.
                if (englishCards.length === 0 && Array.isArray(window.allCardsDatabase) && window.allCardsDatabase.length > 0) {
                    console.warn('[Cards Tab] No English sets matched. Falling back to all cards database.');
                    englishCards = window.allCardsDatabase.filter(card => card && (card.name || card.name_en));
                }
                
                // Store reference to cards
                window.allCardsData = englishCards;

                if (!window.allCardsData || window.allCardsData.length === 0) {
                    content.innerHTML = '<div class="error">No card data available. allCardsDatabase: ' + (window.allCardsDatabase ? window.allCardsDatabase.length : 'null') + ', englishSetCodes: ' + (window.englishSetCodes ? window.englishSetCodes.size : 'null') + '</div>';
                    if (resultsInfo) resultsInfo.textContent = '0 cards found';
                    window.cardsLoaded = false;
                    return;
                }
                
                // --- PHASE 1: Render cards immediately with basic filters ---
                try { populateRarityFilter(window.allCardsData); } catch (e) { console.error('[Cards Tab] populateRarityFilter error:', e); }
                try { populateCategoryFilter(); } catch (e) { console.error('[Cards Tab] populateCategoryFilter error:', e); }
                try { await loadPokemonTypeMap(); } catch (e) { console.error('[Cards Tab] loadPokemonTypeMap error:', e); }
                try { populateElementTypeFilter(); } catch (e) { console.error('[Cards Tab] populateElementTypeFilter error:', e); }
                try { await populateSetFilter(window.allCardsData); } catch (e) { console.error('[Cards Tab] populateSetFilter error:', e); }
                try { setupCardFilters(); } catch (e) { console.error('[Cards Tab] setupCardFilters error:', e); }
                try { initializeCardsFilterPanel(); } catch (e) { console.error('[Cards Tab] initializeCardsFilterPanel error:', e); }

                filterAndRenderCards({ force: true });
                window.cardsLoaded = true;

                // --- PHASE 2: Load enrichment data (playable cards, coverage, formats) in background ---
                // This avoids blocking initial render on ~200MB of CSV downloads
                _loadCardsEnrichment();
            } catch (error) {
                console.error('[Cards Tab] Error loading card database:', error);
                content.innerHTML = '<div class="error" style="padding: 20px; color: #c00;">' +
                    '<h3>Error loading card database</h3>' +
                    '<p><strong>' + (error.message || String(error)) + '</strong></p>' +
                    '<pre style="font-size:11px; white-space:pre-wrap; color:#666;">' + (error.stack || '') + '</pre>' +
                    '<p style="margin-top:12px;"><button onclick="window.cardsLoaded=false;_loadCardsRunning=false;loadCards()" class="btn-blue">Retry</button></p>' +
                    '</div>';
            } finally {
                _loadCardsRunning = false;
            }
        }

        // Phase 2: Load enrichment data after cards are already visible.
        // Runs asynchronously — does not block the initial card render.
        async function _loadCardsEnrichment() {
            try {
                devLog('[Cards Tab] Phase 2: Loading enrichment data...');
                await loadPlayableCards();
                enrichPlayablePrintIds(); // expand with international_prints from card DB
                await loadDeckCoverageStats();
                await loadFormatsForCards();

                // Populate enrichment-dependent filters
                try { populateDeckCoverageFilter(); } catch (e) { console.error('[Cards Tab] populateDeckCoverageFilter error:', e); }
                try { populateMainPokemonFilter(); } catch (e) { console.error('[Cards Tab] populateMainPokemonFilter error:', e); }
                try { populateArchetypeFilter(); } catch (e) { console.error('[Cards Tab] populateArchetypeFilter error:', e); }
                try { populateMetaFilter(); } catch (e) { console.error('[Cards Tab] populateMetaFilter error:', e); }

                // Re-render so coverage badges and enrichment filters take effect
                filterAndRenderCards({ force: true });
                devLog('[Cards Tab] Phase 2: Enrichment complete.');
            } catch (error) {
                console.error('[Cards Tab] Enrichment loading failed (cards still visible):', error);
            }
        }

        function initializeCardsFilterPanel() {
            const section = document.querySelector('#cards .cards-filter-section');
            const toggleBtn = document.getElementById('cardsFiltersToggle');
            if (!section || !toggleBtn) return;

            const isMobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
            section.classList.toggle('mobile-filters-collapsed', isMobile);
            toggleBtn.setAttribute('aria-expanded', isMobile ? 'false' : 'true');
            toggleBtn.textContent = isMobile ? 'Show Filters' : 'Hide Filters';
        }

        function toggleCardsFilterPanel() {
            const section = document.querySelector('#cards .cards-filter-section');
            const toggleBtn = document.getElementById('cardsFiltersToggle');
            if (!section || !toggleBtn) return;

            const collapsed = section.classList.toggle('mobile-filters-collapsed');
            toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
            toggleBtn.textContent = collapsed ? 'Show Filters' : 'Hide Filters';
        }
        window.toggleCardsFilterPanel = toggleCardsFilterPanel;
        
        // Cached parsed CSV rows to avoid re-downloading & re-parsing large files
        let _cachedCityLeagueRows = null;
        let _cachedTournamentRows = null;
        let _cachedCurrentMetaRows = null;

        async function _fetchAndParseCsvCached(file, cacheRef) {
            if (cacheRef === 'cityLeague' && _cachedCityLeagueRows) return _cachedCityLeagueRows;
            if (cacheRef === 'tournament' && _cachedTournamentRows) return _cachedTournamentRows;
            if (cacheRef === 'currentMeta' && _cachedCurrentMetaRows) return _cachedCurrentMetaRows;

            let rows;
            // Tournament cards: prefer latest chunk only (current format is sufficient for playability)
            if (file === 'tournament_cards_data_cards.csv') {
                try {
                    const manifestResp = await fetch(BASE_PATH + 'tournament_cards_manifest.json');
                    if (manifestResp.ok) {
                        const manifest = await manifestResp.json();
                        if (manifest && Array.isArray(manifest.chunks) && manifest.chunks.length > 0) {
                            const latestChunk = manifest.chunks[manifest.chunks.length - 1];
                            const resp = await fetch(BASE_PATH + latestChunk);
                            if (resp.ok) {
                                const text = await resp.text();
                                rows = parseCSV(text);
                            }
                        }
                    }
                } catch (e) {
                    console.warn('[Cards DB] Manifest not available, using monolith:', e);
                }
            }

            if (!rows) {
                const response = await fetch(BASE_PATH + file);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const text = await response.text();
                rows = parseCSV(text);
            }

            if (cacheRef === 'cityLeague') _cachedCityLeagueRows = rows;
            if (cacheRef === 'tournament') _cachedTournamentRows = rows;
            if (cacheRef === 'currentMeta') _cachedCurrentMetaRows = rows;
            return rows;
        }

        async function loadPlayableCards() {
            window.playableCardsSet = new Set(); // All playables (City League + Current Meta + Tournament)
            window.cityLeagueCardsSet = new Set(); // Only City League cards
            window.playablePrintIds = new Set(); // Specific print IDs (SET-NUMBER) of playable cards
            window.cityLeaguePrintIds = new Set(); // Specific print IDs for City League cards
            
            function addPrintId(setCode, setNumber, targetSet) {
                if (setCode && setNumber) {
                    const id = (setCode.trim() + '-' + String(setNumber).trim()).toUpperCase();
                    targetSet.add(id);
                }
            }
            
            try {
                // Load City League Analysis CSV
                try {
                    const cityLeagueCards = await _fetchAndParseCsvCached('city_league_analysis.csv', 'cityLeague');
                    cityLeagueCards.forEach(card => {
                        if (card.card_name) {
                            const cardNameNorm = normalizeCardName(card.card_name);
                            if (cardNameNorm) {
                                window.playableCardsSet.add(cardNameNorm);
                                window.cityLeagueCardsSet.add(cardNameNorm);
                            }
                            addPrintId(card.set_code, card.set_number, window.playablePrintIds);
                            addPrintId(card.set_code, card.set_number, window.cityLeaguePrintIds);
                        }
                    });
                    devLog(`Loaded ${cityLeagueCards.length} playable cards from City League, unique: ${window.cityLeagueCardsSet.size}`);
                } catch (err) {
                    console.warn('Could not load City League playable cards:', err);
                }
                
                // Load Current Meta Analysis CSV (direct file, not fallback — avoids double-counting tournament rows)
                try {
                    const currentMetaCards = await _fetchAndParseCsvCached('current_meta_card_data.csv', 'currentMeta');
                    currentMetaCards.forEach(card => {
                        if (card.card_name) {
                            const cardNameNorm = normalizeCardName(card.card_name);
                            if (cardNameNorm) window.playableCardsSet.add(cardNameNorm);
                            addPrintId(card.set_code, card.set_number, window.playablePrintIds);
                        }
                    });
                    devLog(`Loaded ${currentMetaCards.length} playable cards from Current Meta`);
                } catch (err) {
                    console.warn('Could not load Current Meta playable cards:', err);
                }
                
                // Load Tournament Scraper JH CSV (cached — also used by loadDeckCoverageStats)
                try {
                    const tournamentCards = await _fetchAndParseCsvCached('tournament_cards_data_cards.csv', 'tournament');
                    tournamentCards.forEach(card => {
                        if (card.card_name) {
                            const cardNameNorm = normalizeCardName(card.card_name);
                            if (cardNameNorm) window.playableCardsSet.add(cardNameNorm);
                            addPrintId(card.set_code, card.set_number, window.playablePrintIds);
                        }
                    });
                    devLog(`Loaded ${tournamentCards.length} playable cards from Tournament JH`);
                } catch (err) {
                    console.warn('Could not load Tournament JH playable cards:', err);
                }
                
                devLog(`Total unique playable cards (All Playables): ${window.playableCardsSet.size}`);
                devLog(`City League only cards: ${window.cityLeagueCardsSet.size}`);
                devLog(`Playable print IDs: ${window.playablePrintIds.size}`);
                devLog(`City League print IDs: ${window.cityLeaguePrintIds.size}`);
            } catch (error) {
                console.error('Error loading playable cards:', error);
            }
        }
        
        /**
         * Expand playablePrintIds / cityLeaguePrintIds with international_prints
         * from the card database. For each known playable print (SET-NUMBER),
         * find the matching card in allCardsData and add all its international_prints.
         */
        function enrichPlayablePrintIds() {
            if (!window.allCardsData || !window.playablePrintIds) return;
            
            // Build quick lookup: printId → card's international_prints string
            const printToIntl = new Map();
            window.allCardsData.forEach(card => {
                if (!card || !card.set || !card.number) return;
                const id = (card.set + '-' + String(card.number).trim()).toUpperCase();
                if (card.international_prints) {
                    printToIntl.set(id, card.international_prints);
                }
            });
            
            function expandSet(printIds) {
                const extra = [];
                printIds.forEach(id => {
                    const intlStr = printToIntl.get(id);
                    if (!intlStr) return;
                    intlStr.split(',').forEach(p => {
                        const trimmed = p.trim().toUpperCase();
                        if (trimmed && !printIds.has(trimmed)) extra.push(trimmed);
                    });
                });
                extra.forEach(id => printIds.add(id));
            }
            
            const beforePlay = window.playablePrintIds.size;
            const beforeCity = window.cityLeaguePrintIds ? window.cityLeaguePrintIds.size : 0;
            expandSet(window.playablePrintIds);
            if (window.cityLeaguePrintIds) expandSet(window.cityLeaguePrintIds);
            devLog(`[PlayablePrints] Expanded playable: ${beforePlay} → ${window.playablePrintIds.size}, city league: ${beforeCity} → ${window.cityLeaguePrintIds ? window.cityLeaguePrintIds.size : 0}`);
        }
        
        // Set release dates for temporal filtering (format: YYYY-MM-DD)
        const SET_RELEASE_DATES = {
            // 2026 Sets
            'POR': '2026-04-01',
            'M3': '2026-03-01',
            'ASC': '2026-02-21',
            'PFL': '2026-01-24',  // Pok Pad is in this set
            'MEG': '2025-12-20',
            'MEE': '2025-12-20',
            'MEP': '2025-12-01',
            'BLK': '2025-11-15',
            'WHT': '2025-11-15',
            'DRI': '2025-10-25',
            'JTG': '2025-09-13',
            'PRE': '2025-01-17',
            'SSP': '2024-11-08',
            // 2024 Sets
            'SCR': '2024-09-13',
            'SFA': '2024-08-02',
            'TWM': '2024-05-24',
            'TEF': '2024-03-22',
            'PAF': '2024-01-26',
            // 2023 Sets
            'PAR': '2023-11-03',
            'MEW': '2023-09-22',
            'OBF': '2023-08-11',
            'PAL': '2023-06-09',
            'SVI': '2023-03-31',
            'SVE': '2023-03-31',
            'SVP': '2023-03-01',
            // 2022-2023 Sets
            'CRZ': '2023-01-20',
            'SIR': '2022-11-11',
            'LOR': '2022-09-09',
            'PGO': '2022-07-01',
            'ASR': '2022-05-27',
            'BRS': '2022-02-25',
            // Older sets default to 2020
            'DEFAULT': '2020-01-01'
        };
        window.SET_RELEASE_DATES = SET_RELEASE_DATES;
        
        // For temporal filtering: City League data often has NO tournament_date
        // We'll treat City League as "current meta" (post-release for all cards)
        // and only filter Tournament data by date
        const CITY_LEAGUE_META_NAME = 'City League';
        window.CITY_LEAGUE_META_NAME = CITY_LEAGUE_META_NAME;
        
        async function loadDeckCoverageStats() {
            window.cardDeckCoverageMap = new Map(); // Map<card_name, {archetypesWithCard: Map, archetypes: Set, tournamentDates: Set}>
            window.archetypeDeckCounts = new Map(); // Map<meta|archetype, {totalDecks: number, tournamentDates: Set}>
            let totalDecksCount = 0;
            
            // Initialize new filter maps
            window.mainPokemonCardsMap = new Map(); // Map<mainPokemon, Set<card_name>>
            window.archetypeCardsMap = new Map(); // Map<archetype, Set<card_name>>
            window.metaCardsMap = new Map(); // Map<meta, Map<card_name, Set<set_code>>>
            window.allMainPokemons = new Set();
            window.allArchetypes = new Set();
            window.allMetas = new Set();
            
            const archetypeKeysSeen = new Set(); // Track which archetypes we've already counted (GLOBAL across sources)
            
            try {
                // Load City League, Tournament AND Current Meta data for comprehensive coverage
                const dataSources = [
                    { file: 'city_league_analysis.csv', name: 'City League', cache: 'cityLeague' },
                    { file: 'tournament_cards_data_cards.csv', name: 'Tournament', cache: 'tournament' },
                    { file: 'current_meta_card_data.csv', name: 'Current Meta', cache: 'currentMeta' }
                ];
                
                for (const source of dataSources) {
                    try {
                        devLog(`[Deck Coverage] Loading: ${source.file}`);
                        const rows = await _fetchAndParseCsvCached(source.file, source.cache);
                        
                        devLog(`[Deck Coverage] Parsed ${rows.length} rows from ${source.file}`);
                        
                        let processedRows = 0;
                        
                        rows.forEach(row => {
                            const resolvedMeta = normalizeTournamentFormatLabel(row.meta || row.format || '', row.set_code || '');
                            if (!row.card_name || !row.archetype || !resolvedMeta) {
                                if (processedRows === 0) {
                                    devLog(`[Deck Coverage] Skipping row - missing fields:`, { 
                                        has_card_name: !!row.card_name, 
                                        has_archetype: !!row.archetype, 
                                        has_meta: !!resolvedMeta,
                                        meta_value: resolvedMeta
                                    });
                                }
                                return;
                            }
                            processedRows++;
                            
                            const cardName = normalizeCardName(row.card_name);
                            
                            // Skip basic energies from coverage tracking
                            if (isBasicEnergy(row.card_name)) return;
                            
                            const cleanedArchetype = (typeof sanitizeTournamentArchetypeName === 'function')
                                ? sanitizeTournamentArchetypeName(row.archetype)
                                : String(row.archetype || '').trim();
                            if (!cleanedArchetype) return;

                            const archetypeKey = `${resolvedMeta}|${cleanedArchetype}`;
                            const tournamentDate = row.tournament_date || null; // e.g., "13th February 2026"
                            
                            // Extract the actual counts from CSV
                            // deck_count = how many decks of this archetype play THIS CARD
                            // total_decks_in_archetype = total number of decks in this archetype
                            const parsedDeckCount = parseInt(row.deck_count) || 0;
                            const parsedDeckInclusion = parseInt(row.deck_inclusion_count) || 0;
                            const parsedMaxCount = parseInt(row.max_count) || 0;
                            // Some rows miss deck_count but still provide max_count/deck_inclusion_count.
                            // In that case infer at least 1 deck so coverage and max-copy badges stay consistent.
                            const deckCountWithThisCard = parsedDeckCount || parsedDeckInclusion || (parsedMaxCount > 0 ? 1 : 0);
                            const totalDecksInArchetype = parseInt(row.total_decks_in_archetype) || deckCountWithThisCard;
                            
                            // Store total deck count for this archetype (only once per archetype)
                            if (!archetypeKeysSeen.has(archetypeKey)) {
                                archetypeKeysSeen.add(archetypeKey);
                                window.archetypeDeckCounts.set(archetypeKey, {
                                    totalDecks: totalDecksInArchetype,
                                    tournamentDates: new Set()
                                });
                                totalDecksCount += totalDecksInArchetype;
                            }
                            
                            // Track tournament dates for this archetype
                            if (tournamentDate && window.archetypeDeckCounts.has(archetypeKey)) {
                                window.archetypeDeckCounts.get(archetypeKey).tournamentDates.add(tournamentDate);
                            }
                            
                            // Track which archetype-decks this card appears in
                            if (!window.cardDeckCoverageMap.has(cardName)) {
                                window.cardDeckCoverageMap.set(cardName, {
                                    archetypesWithCard: new Map(), // Map<archetypeKey, {deckCount, tournamentDate, maxCount}>
                                    archetypes: new Set(),
                                    tournamentDates: new Set(), // All tournament dates where this card appeared
                                    setCode: row.set_code || null, // Store set code for release date lookup
                                    maxCountOverall: 0 // Track the overall maximum count across all archetypes
                                });
                            }
                            
                            const cardStats = window.cardDeckCoverageMap.get(cardName);
                            // Store set code if not already set (use first occurrence)
                            if (!cardStats.setCode && row.set_code) {
                                cardStats.setCode = row.set_code;
                            }
                            // Track tournament dates
                            if (tournamentDate) {
                                cardStats.tournamentDates.add(tournamentDate);
                            }
                            
                            // Track max_count (how many copies of this card are played in a single deck)
                            const maxCountInDeck = parseInt(row.max_count) || 0;
                            if (maxCountInDeck > cardStats.maxCountOverall) {
                                cardStats.maxCountOverall = maxCountInDeck;
                            }
                            
                            // Store how many decks of this archetype have THIS SPECIFIC CARD
                            // Multiple prints of the same card (e.g. PAL 172 + BRS 132 of Boss's Orders)
                            // are SUM-merged so the coverage reflects ALL decks playing ANY print.
                            // Cap at totalDecksInArchetype to prevent exceeding 100%.
                            const currentEntry = cardStats.archetypesWithCard.get(archetypeKey);
                            const currentCount = currentEntry ? currentEntry.deckCount : 0;
                            const combinedCount = Math.min(totalDecksInArchetype, currentCount + deckCountWithThisCard);
                            cardStats.archetypesWithCard.set(archetypeKey, {
                                deckCount: combinedCount,
                                tournamentDate: tournamentDate || (currentEntry ? currentEntry.tournamentDate : null),
                                maxCount: Math.max(maxCountInDeck, currentEntry ? currentEntry.maxCount : 0),
                                setCode: row.set_code || (currentEntry ? currentEntry.setCode : null)
                            });
                            cardStats.archetypes.add(cleanedArchetype);
                            
                            // NEW: Populate filter maps
                            // Extract main Pokemon (first word of archetype)
                            const mainPokemon = cleanedArchetype.split(' ')[0].trim();
                            if (mainPokemon) {
                                window.allMainPokemons.add(mainPokemon);
                                if (!window.mainPokemonCardsMap.has(mainPokemon)) {
                                    window.mainPokemonCardsMap.set(mainPokemon, new Set());
                                }
                                window.mainPokemonCardsMap.get(mainPokemon).add(cardName);
                            }
                            
                            // Track archetype
                            window.allArchetypes.add(cleanedArchetype);
                            if (!window.archetypeCardsMap.has(cleanedArchetype)) {
                                window.archetypeCardsMap.set(cleanedArchetype, new Set());
                            }
                            window.archetypeCardsMap.get(cleanedArchetype).add(cardName);
                            
                            // Track meta
                            if (processedRows <= 3) {
                                devLog(`[Deck Coverage] Adding meta: "${resolvedMeta}" for card: ${cardName}`);
                            }
                            window.allMetas.add(resolvedMeta);
                            if (!window.metaCardsMap.has(resolvedMeta)) {
                                window.metaCardsMap.set(resolvedMeta, new Map());
                            }
                            const metaMap = window.metaCardsMap.get(resolvedMeta);
                            if (!metaMap.has(cardName)) {
                                metaMap.set(cardName, new Set());
                            }
                            if (row.set_code) {
                                metaMap.get(cardName).add(row.set_code);
                            }
                        });
                        
                        devLog(`[Deck Coverage] Processed ${processedRows} rows from ${source.name}`);
                        devLog(`[Deck Coverage] Loaded from ${source.name}`);
                    } catch (err) {
                        console.error(`[Deck Coverage] Error loading ${source.name} deck coverage:`, err);
                    }
                }
                
                // Set total unique decks from all sources combined
                window.totalUniqueDecks = totalDecksCount;
                
                devLog(`[Deck Coverage] Total unique decks: ${window.totalUniqueDecks}`);
                devLog(`[Deck Coverage] Cards with coverage data: ${window.cardDeckCoverageMap.size}`);
                devLog(`[Filter Data] Main Pokemons: ${window.allMainPokemons.size}, Archetypes: ${window.allArchetypes.size}, Metas: ${window.allMetas.size}`);
                
                // Log metas for debugging
                devLog(`[Filter Data] Available Metas:`, Array.from(window.allMetas).sort());
                if (window.metaCardsMap.size > 0) {
                    window.metaCardsMap.forEach((cardsMap, meta) => {
                        devLog(`  Meta "${meta}": ${cardsMap.size} unique cards`);
                    });
                }
                
            } catch (error) {
                console.error('Error loading deck coverage stats:', error);
            }
        }
        
        async function loadFormatsForCards() {
            try {
                const uniqueFormats = new Set();
                
                // 1. Load formats from current meta card data
                try {
                    const currentMetaRows = await loadCurrentMetaRowsWithFallback();
                    currentMetaRows.forEach(row => {
                        const format = normalizeTournamentFormatLabel(row.format || row.meta || '', row.set_code || '');
                        if (format && format !== 'Meta Live' && format !== 'Meta Play!') {
                            uniqueFormats.add(format);
                        }
                    });
                    devLog(`[Cards Tab] Loaded formats from current meta/fallback dataset`);
                } catch (err) {
                    console.warn('[Cards Tab] Could not load current_meta_card_data.csv:', err);
                }
                
                // 2. Load formats from tournament scraper JH overview
                try {
                    const response = await fetch(BASE_PATH + 'tournament_cards_data_overview.csv');
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const csvText = await response.text();
                    
                    // Parse CSV (semicolon separated)
                    const lines = csvText.split('\n').filter(line => line.trim());
                    const headers = lines[0].split(';');
                    const formatIndex = headers.indexOf('format');
                    
                    if (formatIndex !== -1) {
                        // Extract unique format values
                        for (let i = 1; i < lines.length; i++) {
                            const cells = lines[i].split(';');
                            if (cells[formatIndex] && cells[formatIndex].trim()) {
                                const normalized = normalizeTournamentFormatLabel(cells[formatIndex].trim());
                                if (normalized && normalized !== 'Meta Live' && normalized !== 'Meta Play!') {
                                    uniqueFormats.add(normalized);
                                }
                            }
                        }
                        devLog(`[Cards Tab] Loaded formats from tournament overview`);
                    }
                } catch (err) {
                    console.warn('[Cards Tab] Could not load tournament_cards_data_overview.csv:', err);
                }

                // 3. Guarantee baseline known formats are available when data exists but misses labels.
                KNOWN_META_FORMAT_CODES.forEach(formatCode => uniqueFormats.add(formatCode));
                
                // Map Meta Play! and Meta Live to SVI-ASC (don't show them separately)
                const formatMapping = {
                    'Meta Play!': 'SVI-ASC',
                    'Meta Live': 'SVI-ASC'
                };
                
                // Sort newest -> oldest by the latest set code in the format label.
                const getFormatSortTimestamp = (formatCode) => {
                    const code = String(formatCode || '').trim().toUpperCase();
                    if (!code) return 0;

                    const latestCode = code.includes('-') ? code.split('-').pop() : code;
                    const releaseDate = SET_RELEASE_DATES[latestCode] || SET_RELEASE_DATES[code] || SET_RELEASE_DATES.DEFAULT;
                    const ts = Date.parse(releaseDate || '');
                    return Number.isNaN(ts) ? 0 : ts;
                };

                const sortedFormats = Array.from(uniqueFormats).sort((a, b) => {
                    const tsDiff = getFormatSortTimestamp(b) - getFormatSortTimestamp(a);
                    if (tsDiff !== 0) return tsDiff;
                    return b.localeCompare(a);
                });
                window.cardFormatsData = {
                    formats: sortedFormats.map(format => ({
                        code: format,
                        name: format,
                        sets: [] // Will be populated if needed
                    }))
                };
                
                // Store mapping globally for filtering (reverse mapping too)
                window.metaFormatMapping = formatMapping;
                
                devLog(`[Cards Tab] Loaded ${sortedFormats.length} total unique formats:`, sortedFormats);
                devLog(`[Cards Tab] Format mappings applied:`, formatMapping);
            } catch (error) {
                console.error('[Cards Tab] Error loading formats:', error);
                window.cardFormatsData = { formats: [] };
                window.metaFormatMapping = {};
            }
        }
        
        function populateMetaFormatFilter() {
            const container = document.getElementById('metaFormatOptions');
            if (!container) return;
            
            // Keep existing base options (Total, all playables, City League)
            // Add formats dynamically
            if (window.cardFormatsData && window.cardFormatsData.formats && window.cardFormatsData.formats.length > 0) {
                window.cardFormatsData.formats.forEach(format => {
                    const label = document.createElement('label');
                    label.className = 'label-block';
                    label.innerHTML = `<input type="checkbox" value="meta:${escapeHtml(format.code)}" onchange="filterAndRenderCards()"> ${escapeHtml(format.name)}`;
                    container.appendChild(label);
                });
                devLog(`[Cards Tab] Populated ${window.cardFormatsData.formats.length} formats in filter`);
            } else {
                console.warn('[Cards Tab] No formats available to populate');
            }
        }

        function populateRarityFilter(cards) {
            const container = document.getElementById('rarityFilterOptions');
            if (!container) return;

            const preferredOrder = [
                'Common',
                'Uncommon',
                'Rare',
                'Holo Rare',
                'Double Rare',
                'Triple Rare',
                'Ultra Rare',
                'Illustration Rare',
                'Special Illustration Rare',
                'Secret Rare',
                'Hyper Rare',
                'Promo'
            ];

            const uniqueRarities = Array.from(new Set((cards || [])
                .map(card => String(card?.rarity || '').trim())
                .filter(rarity => rarity && rarity.toLowerCase() !== 'rarity')));

            uniqueRarities.sort((a, b) => {
                const idxA = preferredOrder.findIndex(v => v.toLowerCase() === a.toLowerCase());
                const idxB = preferredOrder.findIndex(v => v.toLowerCase() === b.toLowerCase());
                if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                if (idxA !== -1) return -1;
                if (idxB !== -1) return 1;
                return a.localeCompare(b);
            });

            container.innerHTML = uniqueRarities.map(rarity => (
                `<label class="label-block"><input type="checkbox" value="${escapeHtml(rarity)}" onchange="filterAndRenderCards()"> ${escapeHtml(rarity)}</label>`
            )).join('');
        }

        function populateCategoryFilter() {
            const container = document.getElementById('categoryFilterOptions');
            if (!container) return;

            const categories = [
                { value: 'pokemon_all', label: 'Pokemon (All)' },
                { value: 'supporter', label: 'Supporter' },
                { value: 'item', label: 'Item' },
                { value: 'tool', label: 'Pokemon Tool' },
                { value: 'stadium', label: 'Stadium' },
                { value: 'special_energy', label: 'Special Energy' },
                { value: 'basic_energy', label: 'Basic Energy' }
            ];

            container.innerHTML = categories.map(category => (
                `<label class="label-block"><input type="checkbox" value="${category.value}" onchange="filterAndRenderCards()"> ${category.label}</label>`
            )).join('');
        }

        // Load Pokédex → TCG element type mapping (Fire, Water, Grass, etc.)
        async function loadPokemonTypeMap() {
            if (window.pokemonTypeMap) return;
            try {
                const resp = await fetch('data/pokemon_type_map.json');
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                window.pokemonTypeMap = await resp.json();
                devLog(`[Cards Tab] Loaded pokemon_type_map.json: ${Object.keys(window.pokemonTypeMap).length} entries`);
            } catch (e) {
                console.warn('[Cards Tab] Could not load pokemon_type_map.json:', e.message);
                window.pokemonTypeMap = {};
            }
        }

        // Get TCG element type for a card (Fire, Water, Grass, etc.)
        function getCardElementType(card) {
            if (!card) return null;
            // Primary: use energy_type from card data (scraped from Limitless ptcg-symbol)
            if (card.energy_type) return card.energy_type;
            // Fallback: PokeAPI type map by pokedex number
            if (window.pokemonTypeMap) {
                const dex = card.pokedex_number;
                if (dex) return window.pokemonTypeMap[String(dex)] || null;
            }
            return null;
        }

        function populateElementTypeFilter() {
            const container = document.getElementById('elementTypeFilterOptions');
            if (!container) return;

            const elementTypes = [
                { value: 'Grass', label: 'Grass', color: '#78C850' },
                { value: 'Fire', label: 'Fire', color: '#F08030' },
                { value: 'Water', label: 'Water', color: '#6890F0' },
                { value: 'Lightning', label: 'Lightning', color: '#F8D030' },
                { value: 'Psychic', label: 'Psychic', color: '#F85888' },
                { value: 'Fighting', label: 'Fighting', color: '#C03028' },
                { value: 'Darkness', label: 'Darkness', color: '#705848' },
                { value: 'Metal', label: 'Metal', color: '#B8B8D0' },
                { value: 'Dragon', label: 'Dragon', color: '#7038F8' },
                { value: 'Colorless', label: 'Colorless', color: '#A8A878' }
            ];

            container.innerHTML = elementTypes.map(et => (
                `<label class="label-block"><input type="checkbox" value="${et.value}" onchange="filterAndRenderCards()"> ${et.label}</label>`
            )).join('');
        }

        function populateDeckCoverageFilter() {
            const container = document.getElementById('deckCoverageFilterOptions');
            if (!container) return;

            const thresholds = [
                { value: '50', label: '>= 50%' },
                { value: '70', label: '>= 70%' },
                { value: '90', label: '>= 90%' },
                { value: '100', label: '100%' }
            ];

            container.innerHTML = thresholds.map(threshold => (
                `<label class="label-block"><input type="radio" name="deckCoverageFilter" value="${threshold.value}" onchange="filterAndRenderCards()"> ${threshold.label}</label>`
            )).join('');
        }
        
        async function populateSetFilter(cards) {
            const container = document.getElementById('setFilterOptions');
            if (!container) return;
            
            try {
                // Load pokemon_sets_mapping.csv to get proper set order (newest first)
                const response = await fetch('pokemon_sets_mapping.csv');
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const csvText = await response.text();
                const lines = csvText.split('\n').filter(line => line.trim() && !line.startsWith('set_code'));
                
                // Extract set codes in order (already sorted newest to oldest in CSV)
                const orderedSets = lines.map(line => {
                    const parts = line.split(',');
                    return parts[0]?.trim();
                }).filter(set => set);
                
                // Get unique English sets from cards only
                const availableSets = new Set();
                cards.forEach(c => {
                    if (c && c.set && c.set !== 'set' && window.englishSetCodes && window.englishSetCodes.has(c.set)) {
                        availableSets.add(c.set);
                    }
                });
                
                // Filter ordered sets to only include those that exist in cards (and are English)
                const setsToShow = orderedSets.filter(set => availableSets.has(set));
                
                devLog(`[Cards Tab] Showing ${setsToShow.length} English sets (newest first)`);
                
                container.innerHTML = '';
                setsToShow.forEach(set => {
                    const label = document.createElement('label');
                    label.className = 'label-block';
                    label.innerHTML = `<input type="checkbox" value="${escapeHtml(set)}" onchange="filterAndRenderCards()"> ${escapeHtml(set)}`;
                    container.appendChild(label);
                });
            } catch (error) {
                console.error('[Cards Tab] Error loading set order:', error);
                // Fallback: Get only English sets, alphabetically
                const sets = [...new Set(cards
                    .filter(c => c && c.set && c.set !== 'set' && window.englishSetCodes && window.englishSetCodes.has(c.set))
                    .map(c => c.set)
                )].sort();
                
                container.innerHTML = '';
                sets.forEach(set => {
                    const label = document.createElement('label');
                    label.className = 'label-block';
                    label.innerHTML = `<input type="checkbox" value="${escapeHtml(set)}" onchange="filterAndRenderCards()"> ${escapeHtml(set)}`;
                    container.appendChild(label);
                });
            }
        }
        
        function populateMainPokemonFilter() {
            const container = document.getElementById('mainPokemonList');
            if (!container || !window.allMainPokemons) return;
            
            // Sort alphabetically
            const sortedMainPokemons = Array.from(window.allMainPokemons).sort();
            
            // Store all items for search filtering
            window.mainPokemonFilterItems = [];
            
            container.innerHTML = '';
            sortedMainPokemons.forEach(pokemon => {
                const label = document.createElement('label');
                label.className = 'label-block';
                label.innerHTML = `<input type="checkbox" value="${escapeHtml(pokemon)}" onchange="filterArchetypesByMainPokemon(); filterAndRenderCards()"> ${escapeHtml(pokemon)}`;
                container.appendChild(label);
                window.mainPokemonFilterItems.push({ element: label, name: pokemon.toLowerCase() });
            });
            
            devLog(`[Cards Tab] Populated ${sortedMainPokemons.length} main pokemons`);
        }
        
        function populateArchetypeFilter() {
            const container = document.getElementById('archetypeList');
            if (!container || !window.allArchetypes) return;
            
            // Sort alphabetically
            const sortedArchetypes = Array.from(window.allArchetypes).sort();
            
            // Store all items for search filtering
            window.archetypeFilterItems = [];
            window.allArchetypeItems = []; // Store all archetypes for filtering
            
            container.innerHTML = '';
            sortedArchetypes.forEach(archetype => {
                const label = document.createElement('label');
                label.className = 'label-block';
                label.innerHTML = `<input type="checkbox" value="${escapeHtml(archetype)}" onchange="filterAndRenderCards()"> ${escapeHtml(archetype)}`;
                container.appendChild(label);
                const item = { element: label, name: archetype.toLowerCase(), archetype: archetype };
                window.archetypeFilterItems.push(item);
                window.allArchetypeItems.push(item);
            });
            
            devLog(`[Cards Tab] Populated ${sortedArchetypes.length} archetypes`);
        }
        
        function filterArchetypesByMainPokemon() {
            if (!window.allArchetypeItems) return;
            
            // Get selected main pokemons
            const selectedMainPokemons = Array.from(document.querySelectorAll('#mainPokemonList input:checked')).map(cb => cb.value.toLowerCase());
            
            // If no main pokemon selected, show all archetypes
            if (selectedMainPokemons.length === 0) {
                window.archetypeFilterItems = window.allArchetypeItems.slice();
                window.allArchetypeItems.forEach(item => {
                    item.element.classList.remove('d-none');
                });
                // Reset search filter
                filterArchetypeList();
                return;
            }
            
            // Filter archetypes that contain any of the selected main pokemons
            window.allArchetypeItems.forEach(item => {
                const archetypeLower = item.name;
                let matches = false;
                
                for (const mainPokemon of selectedMainPokemons) {
                    if (archetypeLower.includes(mainPokemon)) {
                        matches = true;
                        break;
                    }
                }
                
                if (matches) {
                    item.element.classList.remove('d-none');
                } else {
                    item.element.classList.add('d-none');
                    // Uncheck if hidden
                    const checkbox = item.element.querySelector('input[type="checkbox"]');
                    if (checkbox && checkbox.checked) {
                        checkbox.checked = false;
                    }
                }
            });
            
            // Update archetypeFilterItems to only include visible items for search
            window.archetypeFilterItems = window.allArchetypeItems.filter(item => !item.element.classList.contains('d-none'));
            
            // Apply current search filter
            filterArchetypeList();
            
            devLog(`[Cards Tab] Filtered archetypes by main pokemon: ${selectedMainPokemons.join(', ')} - ${window.archetypeFilterItems.length} visible`);
        }
        
        function populateMetaFilter() {
            const container = document.getElementById('metaFormatOptions');
            if (!container || !window.allMetas) return;
            
            const normalizeMetaCode = (meta) => String(meta || '').trim().toUpperCase();
            const isValidMetaCode = (meta) => {
                const code = normalizeMetaCode(meta);
                if (!/^[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(code)) return false;
                const parts = code.split('-');
                if (parts.length !== 2) return false;
                if (parts[0] === parts[1]) return false; // e.g. SVI-SVI
                return true;
            };

            const getMetaTimestamp = (meta) => {
                const code = normalizeMetaCode(meta);
                const latest = code.includes('-') ? code.split('-').pop() : code;
                const dateStr = SET_RELEASE_DATES[latest] || SET_RELEASE_DATES[code] || SET_RELEASE_DATES.DEFAULT;
                const ts = Date.parse(dateStr || '');
                return Number.isNaN(ts) ? 0 : ts;
            };

            // Keep only valid tournament windows and sort newest -> oldest.
            const sortedMetas = Array.from(window.allMetas)
                .map(normalizeMetaCode)
                .filter(isValidMetaCode)
                .sort((a, b) => {
                    const tsDiff = getMetaTimestamp(b) - getMetaTimestamp(a);
                    if (tsDiff !== 0) return tsDiff;
                    return b.localeCompare(a);
                });
            
            // Add separator before metas
            const separator = document.createElement('div');
            separator.className = 'meta-filter-separator';
            separator.innerHTML = '<strong class="label-block meta-filter-title">Tournament Formats:</strong>';
            container.appendChild(separator);
            
            sortedMetas.forEach(meta => {
                const label = document.createElement('label');
                label.className = 'label-block';
                label.innerHTML = `<input type="checkbox" value="meta:${escapeHtml(meta)}" onchange="filterAndRenderCards()"> ${escapeHtml(meta)}`;
                container.appendChild(label);
            });
            
            devLog(`[Cards Tab] Populated ${sortedMetas.length} metas in Meta/Format filter`);
        }
        
        function filterMainPokemonList() {
            if (!window.mainPokemonFilterItems) return;
            
            const searchInput = document.getElementById('mainPokemonSearch');
            const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
            
            window.mainPokemonFilterItems.forEach(item => {
                if (searchTerm === '' || item.name.includes(searchTerm)) {
                    item.element.classList.remove('d-none');
                } else {
                    item.element.classList.add('d-none');
                }
            });
        }
        
        function filterArchetypeList() {
            // Get all archetype items (respecting main pokemon filter)
            const itemsToFilter = window.archetypeFilterItems || [];
            
            const searchInput = document.getElementById('archetypeSearch');
            const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
            
            // Filter within currently visible items (after main pokemon filter)
            itemsToFilter.forEach(item => {
                if (searchTerm === '' || item.name.includes(searchTerm)) {
                    item.element.classList.remove('d-none');
                } else {
                    item.element.classList.add('d-none');
                }
            });
        }
        
        function setupCardFilters() {
            if (!window.scheduleFilterAndRenderCards) {
                let cardFilterDebounceTimer = null;
                window.scheduleFilterAndRenderCards = function(delay = 260) {
                    if (cardFilterDebounceTimer) {
                        clearTimeout(cardFilterDebounceTimer);
                    }
                    cardFilterDebounceTimer = setTimeout(() => {
                        filterAndRenderCards();
                    }, delay);
                };
            }

            if (window._cardsFilterEventsBound) {
                return;
            }
            window._cardsFilterEventsBound = true;

            const searchInput = document.getElementById('cardSearch');
            
            // Debounced autocomplete to avoid excessive DOM updates per keystroke
            let _autocompleteDebounce = null;
            function scheduleAutocomplete(value) {
                clearTimeout(_autocompleteDebounce);
                _autocompleteDebounce = setTimeout(() => showCardAutocomplete(value), 120);
            }
            
            // Search input with autocomplete
            if (searchInput) {
                // Show autocomplete on input (debounced)
                searchInput.addEventListener('input', (e) => {
                    scheduleAutocomplete(e.target.value);
                    window.scheduleFilterAndRenderCards();
                });
                
                // Hide autocomplete on blur (with delay to allow clicking)
                searchInput.addEventListener('blur', () => {
                    setTimeout(() => hideCardAutocomplete(), 200);
                });
                
                // Hide autocomplete on ESC
                searchInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        hideCardAutocomplete();
                    } else if (e.key === 'ArrowDown') {
                        const firstItem = document.querySelector('#cardSearchAutocomplete .cards-autocomplete-item');
                        if (firstItem) {
                            e.preventDefault();
                            firstItem.focus({ preventScroll: true });
                        }
                    }
                });

                searchInput.setAttribute('aria-autocomplete', 'list');
                searchInput.setAttribute('aria-controls', 'cardSearchAutocomplete');
            }
            
            // Coverage radio buttons: clicking an already-selected radio deselects it
            document.querySelectorAll('#deckCoverageFilterOptions input[type="radio"]').forEach(radio => {
                radio.addEventListener('click', function() {
                    if (this.dataset.wasChecked === 'true') {
                        this.checked = false;
                        this.dataset.wasChecked = 'false';
                        window.scheduleFilterAndRenderCards(80);
                    } else {
                        document.querySelectorAll('#deckCoverageFilterOptions input[type="radio"]').forEach(r => r.dataset.wasChecked = 'false');
                        this.dataset.wasChecked = 'true';
                    }
                });
            });

            window.addEventListener('resize', () => {
                initializeCardsFilterPanel();
            }, { passive: true });
        }
        
        function showCardAutocomplete(searchTerm) {
            const dropdown = document.getElementById('cardSearchAutocomplete');
            if (!dropdown || !window.allCardsData) return;
            
            // Hide if search is too short
            if (!searchTerm || searchTerm.length < 2) {
                hideCardAutocomplete();
                return;
            }
            
            const lowerSearch = searchTerm.toLowerCase();
            
            // Find matching cards (limit to 15 suggestions)
            const matches = [];
            const nameSet = new Set(); // Avoid duplicate names
            
            for (const card of window.allCardsData) {
                if (!card.name || nameSet.has(card.name)) continue;
                
                if (card.name.toLowerCase().includes(lowerSearch)) {
                    matches.push(card);
                    nameSet.add(card.name);
                    
                    if (matches.length >= 15) break;
                }
            }
            
            if (matches.length === 0) {
                hideCardAutocomplete();
                return;
            }
            
            // Build dropdown HTML
            dropdown.innerHTML = matches.map(card => {
                // Count how many versions exist
                const versions = window.allCardsData.filter(c => c.name === card.name).length;
                const cardNameEsc = escapeJsStr(card.name);
                
                return `
                    <div class="cards-autocomplete-item" role="option" tabindex="0" onclick="selectCardFromAutocomplete('${cardNameEsc}')" onkeydown="handleCardAutocompleteKeydown(event, '${cardNameEsc}')" aria-label="Select ${escapeHtml(card.name)} from autocomplete">
                        <img src="${card.image_url}" alt="${escapeHtml(card.name)}" loading="lazy">
                        <div class="cards-autocomplete-item-info">
                            <div class="cards-autocomplete-item-name">${escapeHtml(card.name)}</div>
                            <div class="cards-autocomplete-item-meta">${escapeHtml(card.set)} ${escapeHtml(card.number)} · ${escapeHtml(card.type || 'Unknown')}</div>
                        </div>
                        <div class="cards-autocomplete-count">${versions} version${versions > 1 ? 's' : ''}</div>
                    </div>
                `;
            }).join('');
            
            dropdown.setAttribute('role', 'listbox');
            dropdown.setAttribute('aria-hidden', 'false');
            dropdown.classList.remove('d-none');
        }
        
        function hideCardAutocomplete() {
            const dropdown = document.getElementById('cardSearchAutocomplete');
            if (dropdown) {
                dropdown.classList.add('d-none');
                dropdown.setAttribute('aria-hidden', 'true');
            }
        }

        function handleCardAutocompleteKeydown(event, cardName) {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                selectCardFromAutocomplete(cardName);
                return;
            }

            if (event.key === 'Escape') {
                event.preventDefault();
                hideCardAutocomplete();
                const searchInput = document.getElementById('cardSearch');
                if (searchInput) searchInput.focus({ preventScroll: true });
                return;
            }

            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const items = Array.from(document.querySelectorAll('#cardSearchAutocomplete .cards-autocomplete-item'));
                const currentIndex = items.indexOf(event.currentTarget);
                if (currentIndex === -1 || items.length === 0) return;
                const delta = event.key === 'ArrowDown' ? 1 : -1;
                const nextIndex = (currentIndex + delta + items.length) % items.length;
                items[nextIndex].focus({ preventScroll: true });
            }
        }
        window.handleCardAutocompleteKeydown = handleCardAutocompleteKeydown;
        
        function selectCardFromAutocomplete(cardName) {
            const searchInput = document.getElementById('cardSearch');
            if (searchInput) {
                searchInput.value = cardName;
                hideCardAutocomplete();
                filterAndRenderCards();
            }
        }
        
        function resetCardFilters() {
            // Card search
            const searchInput = document.getElementById('cardSearch');
            if (searchInput) searchInput.value = '';
            
            // Main Pokemon search
            const mainPokemonSearch = document.getElementById('mainPokemonSearch');
            if (mainPokemonSearch) {
                mainPokemonSearch.value = '';
                filterMainPokemonList();
            }
            
            // Archetype search
            const archetypeSearch = document.getElementById('archetypeSearch');
            if (archetypeSearch) {
                archetypeSearch.value = '';
                filterArchetypeList();
            }
            
            // Uncheck all checkboxes and coverage radios
            const allCheckboxes = document.querySelectorAll('.cards-filter-options input[type="checkbox"], #mainPokemonList input[type="checkbox"], #archetypeList input[type="checkbox"]');
            allCheckboxes.forEach(cb => cb.checked = false);
            document.querySelectorAll('#deckCoverageFilterOptions input[type="radio"]').forEach(r => r.checked = false);
            
            // Reset archetype filter (show all archetypes again)
            filterArchetypesByMainPokemon();
            
            // Reset pagination and show all mode
            currentCardsPage = 1;
            showAllCards = false;
            
            // Check "Total" radio by default
            const totalRadio = document.querySelector('#metaFormatOptions input[name="baseMetaFilter"][value="total"]');
            if (totalRadio) totalRadio.checked = true;
            
            filterAndRenderCards();
        }
        
        function getFormatLegalSetCodes(formatCode) {
            const map = window.setOrderMap;
            if (!map || !formatCode) return null;
            const parts = formatCode.split('-');
            if (parts.length !== 2) return null;
            const startOrder = map[parts[0].toUpperCase()];
            const endOrder = map[parts[1].toUpperCase()];
            if (startOrder == null || endOrder == null) return null;
            const minOrder = Math.min(startOrder, endOrder);
            const maxOrder = Math.max(startOrder, endOrder);
            const legalSets = new Set();
            for (const [code, order] of Object.entries(map)) {
                if (order >= minOrder && order <= maxOrder) legalSets.add(code);
            }
            // Promo & energy sets from current era are always Standard-legal
            ['SVP', 'SVE'].forEach(code => { if (map[code] != null) legalSets.add(code); });
            return legalSets;
        }

                function filterAndRenderCards(options = {}) {
          try {
            if (!window.allCardsData || window.allCardsData.length === 0) {
                console.warn('[Cards Tab] No cards loaded yet');
                const content = document.getElementById('cardsContent');
                const resultsInfo = document.getElementById('cardResultsInfo');
                if (content) {
                    content.innerHTML = getEmptyStateBoxHtml({ title: 'No Cards Loaded', description: 'Check your data files or reload the page.', icon: 'pokeball' });
                }
                if (resultsInfo) {
                    resultsInfo.textContent = '0 cards found';
                }
                return;
            }

            if (cardsFilterRenderState.isFiltering) {
                cardsFilterRenderState.pending = true;
                return;
            }
            
            // Always reset to page 1 when filters change
            currentCardsPage = 1;
            showAllCards = false;
            
            const searchInput = document.getElementById('cardSearch');
            const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

            // If any print of a card name matches EN/DE search, include all prints of that name.
            const searchMatchedCardNames = new Set();
            if (searchTerm) {
                window.allCardsData.forEach(card => {
                    const nameEn = (card.name_en || card.name || '').toLowerCase();
                    const nameDe = (card.name_de || '').toLowerCase();
                    if (nameEn.includes(searchTerm) || nameDe.includes(searchTerm)) {
                        searchMatchedCardNames.add((card.name || '').toLowerCase());
                    }
                });
            }
            
            // Get selected values from checkboxes
            const selectedMetas = Array.from(document.querySelectorAll('#metaFormatOptions input:checked')).map(cb => cb.value);
            const selectedSets = Array.from(document.querySelectorAll('#setFilterOptions input:checked')).map(cb => cb.value);
            const selectedRarities = Array.from(document.querySelectorAll('#rarityFilterOptions input:checked')).map(cb => cb.value);
            const selectedCategories = Array.from(document.querySelectorAll('#categoryFilterOptions input:checked')).map(cb => cb.value);
            const selectedElementTypes = Array.from(document.querySelectorAll('#elementTypeFilterOptions input:checked')).map(cb => cb.value);
            const selectedDeckCoverages = Array.from(document.querySelectorAll('#deckCoverageFilterOptions input:checked')).map(cb => parseFloat(cb.value));
            const selectedMainPokemons = Array.from(document.querySelectorAll('#mainPokemonList input:checked')).map(cb => cb.value);
            const selectedArchetypes = Array.from(document.querySelectorAll('#archetypeList input:checked')).map(cb => cb.value);
            const selectedMetaFilters = Array.from(document.querySelectorAll('#metaFormatOptions input:checked')).filter(cb => cb.value.startsWith('meta:')).map(cb => cb.value.replace('meta:', ''));
            const sortOrderSelect = document.getElementById('cardSortOrder');
            const sortOrder = sortOrderSelect ? sortOrderSelect.value : 'set';

            const signature = JSON.stringify({
                searchTerm,
                selectedMetas,
                selectedSets,
                selectedRarities,
                selectedCategories,
                selectedElementTypes,
                selectedDeckCoverages,
                selectedMainPokemons,
                selectedArchetypes,
                selectedMetaFilters,
                sortOrder,
                showOnlyOnePrint,
                dataLen: window.allCardsData.length
            });

            if (!options.force && signature === cardsFilterRenderState.lastSignature) {
                return;
            }
            cardsFilterRenderState.lastSignature = signature;
            cardsFilterRenderState.isFiltering = true;
            
            devLog(`[Cards Tab] Filtering - Search: "${searchTerm}", Metas: ${selectedMetas.length}, Sets: ${selectedSets.length}, Rarities: ${selectedRarities.length}, Categories: ${selectedCategories.length}, ElementTypes: ${selectedElementTypes.length}, DeckCov: ${selectedDeckCoverages.length}, MainPkm: ${selectedMainPokemons.length}, Archetypes: ${selectedArchetypes.length}, MetaFilters: ${selectedMetaFilters.length}`);
            devLog(`[Filter Debug] Selected Meta Values:`, selectedMetas);
            devLog(`[Filter Debug] Selected Meta Filters (meta: prefix):`, selectedMetaFilters);
            
            let passedFilters = 0;
            let failedSearch = 0;
            let failedMeta = 0;
            let failedSet = 0;
            let failedRarity = 0;
            let failedCategory = 0;
            let failedElementType = 0;
            let failedDeckCoverage = 0;
            let failedMainPokemon = 0;
            let failedArchetype = 0;
            let failedMetaFilter = 0;
            let failedFormatSet = 0;
            let failedValidation = 0;
            
            // In All Prints mode + meta period: restrict to format-legal sets
            let metaLegalSets = null;
            if (!showOnlyOnePrint && selectedMetaFilters.length > 0) {
                metaLegalSets = new Set();
                for (const meta of selectedMetaFilters) {
                    const sets = getFormatLegalSetCodes(meta);
                    if (sets) sets.forEach(s => metaLegalSets.add(s));
                }
                if (metaLegalSets.size === 0) metaLegalSets = null;
                else devLog(`[Cards Tab] All Prints + Meta: restricting to ${metaLegalSets.size} format-legal sets`);
            }
            
            window.filteredCardsData = window.allCardsData.filter(card => {
                // Skip invalid cards (allow missing image_url — UI will show placeholder)
                if (!card || !card.name || card.name === 'name') {
                    failedValidation++;
                    return false;
                }
                
                // Search filter - Omni-Search: name (EN/DE), set+number, Pokédex number
                if (searchTerm) {
                    const nameEn = (card.name_en || card.name || '').toLowerCase();
                    const nameDe = (card.name_de || '').toLowerCase();
                    const baseName = (card.name || '').toLowerCase();
                    const setCode = (card.set || '').toLowerCase();
                    const cardNum = String(card.number || '').toLowerCase();
                    const dexNum = (card.pokedex_number || '').toString();
                    const setNumSpace = `${setCode} ${cardNum}`;
                    const setNumCombined = `${setCode}${cardNum}`;
                    const matchesSearch = searchMatchedCardNames.has(baseName) ||
                                          nameEn.includes(searchTerm) ||
                                          nameDe.includes(searchTerm) ||
                                          setNumSpace.includes(searchTerm) ||
                                          setNumCombined.includes(searchTerm) ||
                                          (dexNum !== '' && dexNum === searchTerm) ||
                                          (searchTerm.length >= 3 && dexNum !== '' && dexNum.includes(searchTerm));
                    if (!matchesSearch) {
                        failedSearch++;
                        return false;
                    }
                }
                
                // Meta/Format filter (Total, All Playables, City League)
                // NOTE: Meta-Zeiträume (meta:XXX) are handled later in "Meta Filter" section
                const basicMetaFilters = selectedMetas.filter(m => !m.startsWith('meta:'));
                if (basicMetaFilters.length > 0) {
                    let metaMatch = false;
                    const cardNameNorm = normalizeCardName(card.name);
                    
                    if (basicMetaFilters.includes('total')) {
                        metaMatch = true; // Show all cards
                    } else if (basicMetaFilters.includes('all_playables')) {
                        if (showOnlyOnePrint) {
                            // Standard Print: match by name (dedup picks best later)
                            if (window.playableCardsSet && window.playableCardsSet.has(cardNameNorm)) {
                                metaMatch = true;
                            }
                        } else {
                            // All Prints: match by specific print ID (SET-NUMBER)
                            // Only show prints that are actual playable prints or their international reprints
                            const printId = (card.set + '-' + String(card.number).trim()).toUpperCase();
                            if (window.playablePrintIds && window.playablePrintIds.has(printId)) {
                                metaMatch = true;
                            }
                        }
                    } else if (basicMetaFilters.includes('city_league')) {
                        if (showOnlyOnePrint) {
                            if (window.cityLeagueCardsSet && window.cityLeagueCardsSet.has(cardNameNorm)) {
                                metaMatch = true;
                            }
                        } else {
                            const printId = (card.set + '-' + String(card.number).trim()).toUpperCase();
                            if (window.cityLeaguePrintIds && window.cityLeaguePrintIds.has(printId)) {
                                metaMatch = true;
                            }
                        }
                    }
                    
                    if (!metaMatch) {
                        failedMeta++;
                        return false;
                    }
                }
                
                // Set filter
                if (selectedSets.length > 0 && !selectedSets.includes(card.set)) {
                    failedSet++;
                    return false;
                }
                
                // Rarity filter
                if (selectedRarities.length > 0 && !selectedRarities.includes(card.rarity)) {
                    failedRarity++;
                    return false;
                }
                
                // Category filter
                if (selectedCategories.length > 0) {
                    let categoryMatch = false;
                    const type = card.type || '';
                    
                    // Card types in data: Basic, Stage 1, Stage 2, VSTAR, Item, Supporter, Stadium, Tool, Special Energy, Basic Energy
                    const pokemonTypes = ['Basic', 'Stage 1', 'Stage 2', 'VSTAR', 'VMAX', 'VUNION', 'V', 'GX', 'EX', 'ex', 'BREAK'];
                    
                    for (const category of selectedCategories) {
                        if (category === 'pokemon_all') {
                            const isPokemon = pokemonTypes.some(pt => type === pt || type.includes(pt)) && !['Item', 'Supporter', 'Stadium', 'Tool', 'Energy'].some(t => type.includes(t));
                            if (isPokemon) { categoryMatch = true; break; }
                        } else if (category === 'supporter') {
                            if (type.includes('Supporter')) { categoryMatch = true; break; }
                        } else if (category === 'item') {
                            if (type.includes('Item') && !type.includes('Tool')) { categoryMatch = true; break; }
                        } else if (category === 'tool') {
                            if (type.includes('Tool')) { categoryMatch = true; break; }
                        } else if (category === 'stadium') {
                            if (type.includes('Stadium')) { categoryMatch = true; break; }
                        } else if (category === 'special_energy') {
                            if (type.includes('Special Energy')) { categoryMatch = true; break; }
                        } else if (category === 'basic_energy') {
                            if (type === 'Basic Energy') { categoryMatch = true; break; }
                        }
                    }
                    
                    if (!categoryMatch) {
                        failedCategory++;
                        return false;
                    }
                }
                
                // Element Type filter (Fire, Water, Grass, etc.)
                if (selectedElementTypes.length > 0) {
                    const elementType = getCardElementType(card);
                    if (!elementType || !selectedElementTypes.includes(elementType)) {
                        failedElementType++;
                        return false;
                    }
                }
                
                // Deck Coverage filter
                if (selectedDeckCoverages.length > 0 && window.cardDeckCoverageMap) {
                    // Multi-strategy name lookup: normalizeCardName first, then plain lowercase as fallback
                    let coverageStats = window.cardDeckCoverageMap.get(normalizeCardName(card.name));
                    if (!coverageStats) {
                        coverageStats = window.cardDeckCoverageMap.get(card.name.toLowerCase());
                    }
                    
                    // Calculate DYNAMIC coverage based on active filters
                    // If no coverage entry found, percentage stays 0 and will fail the threshold
                    let percentage = 0;
                    if (coverageStats) {
                        const dynamicCoverage = calculateDynamicCoverage(card.name);
                        percentage = dynamicCoverage ? dynamicCoverage.percentage : 0;
                    }
                    
                    let coverageMatch = false;
                    
                    // Check if card meets any of the selected coverage thresholds
                    for (const threshold of selectedDeckCoverages) {
                        if (threshold === 100) {
                            // Exactly 100%
                            if (percentage >= 99.5) { // Allow small rounding errors
                                coverageMatch = true;
                                break;
                            }
                        } else {
                            // Greater than or equal to threshold
                            if (percentage >= threshold) {
                                coverageMatch = true;
                                break;
                            }
                        }
                    }
                    
                    if (!coverageMatch) {
                        failedDeckCoverage++;
                        return false;
                    }
                }
                
                // NEW: Main Pokemon Filter - Show cards from decks with selected main pokemon
                if (selectedMainPokemons.length > 0) {
                    const cardNameNorm = normalizeCardName(card.name);
                    let mainPokemonMatch = false;
                    
                    for (const mainPokemon of selectedMainPokemons) {
                        if (window.mainPokemonCardsMap && window.mainPokemonCardsMap.has(mainPokemon)) {
                            const cardsForMainPokemon = window.mainPokemonCardsMap.get(mainPokemon);
                            if (cardsForMainPokemon.has(cardNameNorm)) {
                                mainPokemonMatch = true;
                                break;
                            }
                        }
                    }
                    
                    if (!mainPokemonMatch) {
                        failedMainPokemon++;
                        return false;
                    }
                }
                
                // NEW: Archetype Filter - Show cards from selected archetypes
                if (selectedArchetypes.length > 0) {
                    const cardNameNorm = normalizeCardName(card.name);
                    let archetypeMatch = false;
                    
                    for (const archetype of selectedArchetypes) {
                        if (window.archetypeCardsMap && window.archetypeCardsMap.has(archetype)) {
                            const cardsForArchetype = window.archetypeCardsMap.get(archetype);
                            if (cardsForArchetype.has(cardNameNorm)) {
                                archetypeMatch = true;
                                break;
                            }
                        }
                    }
                    
                    if (!archetypeMatch) {
                        failedArchetype++;
                        return false;
                    }
                }
                
                // NEW: Meta Filter - Show cards from selected metas (combined with archetype if both selected)
                if (selectedMetaFilters.length > 0) {
                    const cardNameNorm = normalizeCardName(card.name);
                    let metaFilterMatch = false;
                    
                    // Debug log for first card only
                    if (passedFilters === 0 && failedMetaFilter === 0) {
                        devLog(`[Meta Filter Debug] Checking meta filters:`, selectedMetaFilters);
                        devLog(`[Meta Filter Debug] Available metas in metaCardsMap:`, window.metaCardsMap ? Array.from(window.metaCardsMap.keys()) : 'metaCardsMap not loaded');
                        if (window.metaCardsMap) {
                            selectedMetaFilters.forEach(meta => {
                                if (window.metaCardsMap.has(meta)) {
                                    devLog(`  Meta "${meta}" found with ${window.metaCardsMap.get(meta).size} cards`);
                                } else {
                                    devLog(`  Meta "${meta}" NOT FOUND in metaCardsMap`);
                                }
                            });
                        }
                    }
                    
                    // metaCardsMap is Map<meta, Map<cardName, Set<setCode>>>
                    // Match both card name AND set to avoid false positives
                    // (e.g. Pikachu ex SSP 57 ≠ Pikachu ex ASC 276)
                    // In all-prints mode, also accept reprints linked via international_prints
                    // (e.g. MEP-3 Alakazam is a promo reprint of MEG-56 Alakazam)
                    const _setMatchesMeta = (cardObj, metaSetCodes) => {
                        if (metaSetCodes.size === 0 || metaSetCodes.has(cardObj.set)) return true;
                        if (!showOnlyOnePrint && cardObj.international_prints) {
                            const printSets = cardObj.international_prints.split(',').map(p => p.split('-')[0].trim());
                            if (printSets.some(s => metaSetCodes.has(s))) return true;
                        }
                        return false;
                    };
                    if (selectedArchetypes.length > 0) {
                        for (const meta of selectedMetaFilters) {
                            if (window.metaCardsMap && window.metaCardsMap.has(meta)) {
                                const cardsForMeta = window.metaCardsMap.get(meta);
                                if (cardsForMeta.has(cardNameNorm)) {
                                    const metaSetCodes = cardsForMeta.get(cardNameNorm);
                                    if (_setMatchesMeta(card, metaSetCodes)) {
                                        metaFilterMatch = true;
                                        break;
                                    }
                                }
                            }
                        }
                    } else {
                        for (const meta of selectedMetaFilters) {
                            if (window.metaCardsMap && window.metaCardsMap.has(meta)) {
                                const cardsForMeta = window.metaCardsMap.get(meta);
                                if (cardsForMeta.has(cardNameNorm)) {
                                    const metaSetCodes = cardsForMeta.get(cardNameNorm);
                                    if (_setMatchesMeta(card, metaSetCodes)) {
                                        metaFilterMatch = true;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    
                    if (!metaFilterMatch) {
                        failedMetaFilter++;
                        return false;
                    }
                }
                
                // In All Prints + meta period: only show prints from format-legal sets
                if (metaLegalSets && !metaLegalSets.has(card.set)) {
                    failedFormatSet++;
                    return false;
                }
                
                passedFilters++;
                return true;
            });
            
            devLog(`[Cards Tab] Filter results:`);
            devLog(`  - Passed all filters: ${passedFilters}`);
            devLog(`  - Failed validation: ${failedValidation}`);
            devLog(`  - Failed search: ${failedSearch}`);
            devLog(`  - Failed meta: ${failedMeta}`);
            devLog(`  - Failed set: ${failedSet}`);
            devLog(`  - Failed rarity: ${failedRarity}`);
            devLog(`  - Failed category: ${failedCategory}`);
            devLog(`  - Failed element type: ${failedElementType}`);
            devLog(`  - Failed deck coverage: ${failedDeckCoverage}`);
            devLog(`  - Failed main pokemon: ${failedMainPokemon}`);
            devLog(`  - Failed archetype: ${failedArchetype}`);
            devLog(`  - Failed meta filter: ${failedMetaFilter}`);
            devLog(`  - Failed format set: ${failedFormatSet}`);
            // Deduplicate cards (same card name, different prints) - prefer print from coverage data
            // Only deduplicate if showOnlyOnePrint is enabled AND no search term active
            // When user searches for a specific card, always show all prints
            if (showOnlyOnePrint && !searchTerm) {
                deduplicateCardsForDisplay(window.filteredCardsData);
            }
            
            // Apply sorting based on user selection
            sortCardsDatabase(window.filteredCardsData);
            
                        renderCardDatabase(window.filteredCardsData, { scrollToTop: false });
                        cardsFilterRenderState.isFiltering = false;

                        if (cardsFilterRenderState.pending) {
                                cardsFilterRenderState.pending = false;
                                window.scheduleFilterAndRenderCards(60);
                        }
          } catch (err) {
                        cardsFilterRenderState.isFiltering = false;
            console.error('[Cards Tab] filterAndRenderCards error:', err);
            const content = document.getElementById('cardsContent');
            if (content) {
                content.innerHTML = '<div class="error" style="padding:20px;color:#c00;">' +
                    '<h3>Error rendering cards</h3>' +
                    '<p>' + (err.message || String(err)) + '</p>' +
                    '<pre style="font-size:11px;white-space:pre-wrap;color:#666;">' + (err.stack || '') + '</pre>' +
                    '</div>';
            }
          }
        }
        
        function togglePrintView() {
            /**
             * Toggle between showing all prints vs. only one print per card
             */
            setPrintView(!showOnlyOnePrint);
        }
        
        function setPrintView(onePrint) {
            /**
             * Set print view to specific mode
             */
            showOnlyOnePrint = onePrint;
            
            // Update button appearance
            const btnStandard = document.getElementById('btnStandardPrint');
            const btnAll = document.getElementById('btnAllPrints');
            if (btnStandard && btnAll) {
                btnStandard.classList.toggle('active', showOnlyOnePrint);
                btnAll.classList.toggle('active', !showOnlyOnePrint);
            }
            
            devLog(`[Print View] Set to: ${showOnlyOnePrint ? 'Standard Print' : 'All Prints'}`);
            
            // Re-render with new setting
            filterAndRenderCards();
        }
        
        function deduplicateCardsForDisplay(cards) {
            /**
             * Remove duplicate cards (same name, different prints)
             * Prefer the print that appears most in the CURRENTLY FILTERED archetypes
             * Otherwise prefer: newest set with lowest rarity
             * Modifies the array in-place
             */
            const cardsByName = new Map();
            
            // Group cards by name
            cards.forEach(card => {
                const cardName = card.name.toLowerCase();
                if (!cardsByName.has(cardName)) {
                    cardsByName.set(cardName, []);
                }
                cardsByName.get(cardName).push(card);
            });
            
            // Get active filters to determine which archetypes are relevant
            const selectedMainPokemons = Array.from(document.querySelectorAll('#mainPokemonList input:checked')).map(cb => cb.value);
            const selectedArchetypes = Array.from(document.querySelectorAll('#archetypeList input:checked')).map(cb => cb.value);
            const selectedMetaFilters = Array.from(document.querySelectorAll('#metaFormatOptions input:checked')).filter(cb => cb.value.startsWith('meta:')).map(cb => cb.value.replace('meta:', ''));
            
            // For each card name, choose the best print
            const selectedCards = [];

            const getBudgetRarityRank = (rarity) => {
                const r = String(rarity || '').toLowerCase();
                if (r.includes('uncommon')) return 2;
                if (/\bcommon\b/.test(r)) return 1;
                if (r.includes('holo rare')) return 4;
                if (r.includes('double rare')) return 5;
                if (r.includes('triple rare')) return 6;
                if (r.includes('ultra rare')) return 7;
                if (r.includes('special art') || r.includes('special illustration')) return 10;
                if (r.includes('illustration rare') || r === 'art rare') return 9;
                if (r.includes('secret rare')) return 11;
                if (r.includes('hyper rare') || r.includes('rainbow')) return 12;
                if (r.includes('promo')) return 13;
                if (r.includes('rare')) return 3;
                return 50;
            };
            
            cardsByName.forEach((prints, cardName) => {
                if (prints.length === 1) {
                    selectedCards.push(prints[0]);
                    return;
                }

                // Budget mode: always keep the lowest rarity tier first.
                const minRarityRank = Math.min(...prints.map(p => getBudgetRarityRank(p.rarity)));
                const budgetCandidatePrints = prints.filter(p => getBudgetRarityRank(p.rarity) === minRarityRank);
                
                // Multiple prints exist - choose the best one based on FILTERED coverage data
                const coverageData = window.cardDeckCoverageMap ? window.cardDeckCoverageMap.get(cardName) : null;
                
                if (coverageData && (selectedMainPokemons.length > 0 || selectedArchetypes.length > 0 || selectedMetaFilters.length > 0)) {
                    // Calculate which set_code appears most in the FILTERED archetypes
                    const setCodeCounts = new Map();
                    
                    if (cardName === 'hawlucha' || cardName === 'charmander' || cardName === 'charmeleon') {
                        devLog(`[Dedup Debug] ${cardName}: Active filters - MainPokemon: [${selectedMainPokemons.join(', ')}], Archetype: [${selectedArchetypes.join(', ')}], Meta: [${selectedMetaFilters.join(', ')}]`);
                        devLog(`[Dedup Debug] ${cardName}: Has ${coverageData.archetypesWithCard.size} archetypes in coverage data`);
                    }
                    
                    coverageData.archetypesWithCard.forEach((entry, archetypeKey) => {
                        const [meta, archetype] = archetypeKey.split('|');
                        const mainPokemon = archetype.split(' ')[0];
                        
                        // Check if this archetype matches active filters
                        let matchesFilters = true;
                        if (selectedMainPokemons.length > 0 && !selectedMainPokemons.includes(mainPokemon)) {
                            matchesFilters = false;
                        }
                        if (selectedArchetypes.length > 0 && !selectedArchetypes.includes(archetype)) {
                            matchesFilters = false;
                        }
                        if (selectedMetaFilters.length > 0 && !selectedMetaFilters.includes(meta)) {
                            matchesFilters = false;
                        }
                        
                        if (cardName === 'hawlucha' || cardName === 'charmander' || cardName === 'charmeleon') {
                            if (matchesFilters && entry.setCode) {
                                devLog(`[Dedup Debug] ${cardName}: Matched archetype ${archetypeKey} with setCode ${entry.setCode}`);
                            }
                        }
                        
                        if (matchesFilters && entry.setCode) {
                            const count = setCodeCounts.get(entry.setCode) || 0;
                            const deckCount = typeof entry === 'number' ? entry : (entry.deckCount || 0);
                            setCodeCounts.set(entry.setCode, count + deckCount);
                        }
                    });
                    
                    // Find the most common set_code in filtered archetypes
                    if (setCodeCounts.size > 0) {
                        let mostCommonSet = null;
                        let highestCount = 0;
                        setCodeCounts.forEach((count, setCode) => {
                            if (count > highestCount) {
                                highestCount = count;
                                mostCommonSet = setCode;
                            }
                        });
                        
                        // Try to find print matching the most common set
                        if (mostCommonSet) {
                            const matchingPrint = budgetCandidatePrints.find(p => p.set === mostCommonSet);
                            if (matchingPrint) {
                                if (cardName === 'hawlucha' || cardName === 'charmander' || cardName === 'charmeleon') {
                                    devLog(`[Dedup Debug] ${cardName}: Selected ${mostCommonSet} print (most common in filtered archetypes)`);
                                }
                                selectedCards.push(matchingPrint);
                                return;
                            } else {
                                if (cardName === 'hawlucha' || cardName === 'charmander' || cardName === 'charmeleon') {
                                    devLog(`[Dedup Debug] ${cardName}: Most common set ${mostCommonSet} but no matching print found. Available sets:`, prints.map(p => p.set));
                                }
                            }
                        } else {
                            if (cardName === 'hawlucha' || cardName === 'charmander' || cardName === 'charmeleon') {
                                devLog(`[Dedup Debug] ${cardName}: No most common set found (setCodeCounts empty)`);
                            }
                        }
                    } else {
                        if (cardName === 'hawlucha' || cardName === 'charmander' || cardName === 'charmeleon') {
                            devLog(`[Dedup Debug] ${cardName}: setCodeCounts.size = 0, no archetypes matched filters`);
                        }
                    }
                } else {
                    if (cardName === 'hawlucha' || cardName === 'charmander' || cardName === 'charmeleon') {
                        devLog(`[Dedup Debug] ${cardName}: No coverage data or no filters active (coverage: ${!!coverageData}, filters: ${selectedMainPokemons.length > 0 || selectedArchetypes.length > 0 || selectedMetaFilters.length > 0})`);
                    }
                }
                
                // No coverage data or no matching print - use standard priority
                // Prefer: Common/Uncommon from newest set
                const setOrder = {
                    // 2026 Sets (newest first)
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
                
                // Sort prints by priority
                const sortedPrints = budgetCandidatePrints.sort((a, b) => {
                    const rarityA = getBudgetRarityRank(a.rarity);
                    const rarityB = getBudgetRarityRank(b.rarity);
                    
                    // First priority: lowest rarity (Common/Uncommon preferred)
                    if (rarityA !== rarityB) {
                        return rarityA - rarityB;
                    }
                    
                    // Second priority: newest set
                    const setA = setOrder[a.set] || 0;
                    const setB = setOrder[b.set] || 0;
                    if (setA !== setB) {
                        return setB - setA; // Higher number = newer
                    }
                    
                    // Third priority: set number (lower first)
                    const numA = parseInt((a.number || '0').toString().replace(/[^\d]/g, '')) || 0;
                    const numB = parseInt((b.number || '0').toString().replace(/[^\d]/g, '')) || 0;
                    return numA - numB;
                });
                
                if (cardName === 'hawlucha' || cardName === 'charmander' || cardName === 'charmeleon') {
                    devLog(`[Dedup Debug] ${cardName}: Using fallback - selected ${sortedPrints[0].set} ${sortedPrints[0].rarity}`);
                }
                selectedCards.push(sortedPrints[0]);
            });
            
            // Replace array content with deduplicated cards
            cards.length = 0;
            cards.push(...selectedCards);
            
            const uniqueCardNames = cardsByName.size;
            const totalPrintsRemoved = uniqueCardNames - selectedCards.length;
            devLog(`[Cards Tab] Deduplicated: ${uniqueCardNames} unique cards (removed ${totalPrintsRemoved} duplicate prints)`);
        }
        
        function sortCardsDatabase(cards) {
            /**
             * Sort cards based on the selected sort order from dropdown
             * Options: "set" (default), "deck" (like deck overview), "coverage"
             */
            const sortOrderSelect = document.getElementById('cardSortOrder');
            const sortOrder = sortOrderSelect ? sortOrderSelect.value : 'set';
            
            devLog(`[Cards Tab] Sorting cards by: ${sortOrder}`);
            
            if (sortOrder === 'set') {
                // Sort by SET release order DESCENDING (newest first), then SET NUMBER ascending
                const SET_ORDER = window.setOrderMap || {};
                cards.sort((a, b) => {
                    const setCodeA = (a.set || '').toUpperCase();
                    const setCodeB = (b.set || '').toUpperCase();
                    
                    // First by set release order (descending = newest first)
                    const orderA = SET_ORDER[setCodeA] || SET_ORDER[setCodeA.toLowerCase()] || 0;
                    const orderB = SET_ORDER[setCodeB] || SET_ORDER[setCodeB.toLowerCase()] || 0;
                    if (orderA !== orderB) {
                        return orderB - orderA; // descending: newest set first
                    }
                    
                    // Then by set number ascending within same set (1, 2, 3...)
                    const setNumA = parseInt((a.number || '0').toString().replace(/[^\d]/g, '')) || 0;
                    const setNumB = parseInt((b.number || '0').toString().replace(/[^\d]/g, '')) || 0;
                    if (setNumA !== setNumB) {
                        return setNumA - setNumB;
                    }
                    
                    // Finally by name
                    return (a.name || '').localeCompare(b.name || '');
                });
            } else if (sortOrder === 'deck') {
                // Sort like deck overview: by type/element/evolution
                // Use the existing sortCardsByType logic but adapted for allCardsData structure
                
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
                
                cards.sort((a, b) => {
                    const typeA = a.type || '';
                    const typeB = b.type || '';
                    
                    // Determine category
                    const pokemonStages = ['Basic', 'Stage 1', 'Stage 2', 'VSTAR', 'VMAX', 'VUNION', 'V', 'GX', 'EX', 'ex', 'BREAK'];
                    const isPokemonA = pokemonStages.some(pt => typeA === pt || typeA.includes(pt)) && !['Item', 'Supporter', 'Stadium', 'Tool', 'Energy'].some(t => typeA.includes(t));
                    const isPokemonB = pokemonStages.some(pt => typeB === pt || typeB.includes(pt)) && !['Item', 'Supporter', 'Stadium', 'Tool', 'Energy'].some(t => typeB.includes(t));
                    
                    let categoryA, categoryB;
                    if (isPokemonA) {
                        categoryA = 'Pokemon';
                    } else if (typeA.includes('Supporter')) {
                        categoryA = 'Supporter';
                    } else if (typeA.includes('Tool')) {
                        categoryA = 'Tool';
                    } else if (typeA.includes('Item')) {
                        categoryA = 'Item';
                    } else if (typeA.includes('Stadium')) {
                        categoryA = 'Stadium';
                    } else if (typeA.includes('Special Energy')) {
                        categoryA = 'Special Energy';
                    } else if (typeA.includes('Energy')) {
                        categoryA = 'Energy';
                    } else {
                        categoryA = 'Pokemon'; // Default
                    }
                    
                    if (isPokemonB) {
                        categoryB = 'Pokemon';
                    } else if (typeB.includes('Supporter')) {
                        categoryB = 'Supporter';
                    } else if (typeB.includes('Tool')) {
                        categoryB = 'Tool';
                    } else if (typeB.includes('Item')) {
                        categoryB = 'Item';
                    } else if (typeB.includes('Stadium')) {
                        categoryB = 'Stadium';
                    } else if (typeB.includes('Special Energy')) {
                        categoryB = 'Special Energy';
                    } else if (typeB.includes('Energy')) {
                        categoryB = 'Energy';
                    } else {
                        categoryB = 'Pokemon'; // Default
                    }
                    
                    const orderA = typeOrder[categoryA] || 99;
                    const orderB = typeOrder[categoryB] || 99;
                    
                    // Sort by category first
                    if (orderA !== orderB) {
                        return orderA - orderB;
                    }
                    
                    // For Pokemon: sort by element
                    if (categoryA === 'Pokemon' && categoryB === 'Pokemon') {
                        const elementA = typeA.charAt(0);
                        const elementB = typeB.charAt(0);
                        const elemOrderA = elementOrder[elementA] || 99;
                        const elemOrderB = elementOrder[elementB] || 99;
                        
                        if (elemOrderA !== elemOrderB) {
                            return elemOrderA - elemOrderB;
                        }
                    }
                    
                    // Finally by name
                    return (a.name || '').localeCompare(b.name || '');
                });
            } else if (sortOrder === 'coverage') {
                // Sort by deck coverage (highest first)
                cards.sort((a, b) => {
                    const coverageA = (calculateDynamicCoverage(a.name.toLowerCase()) || {}).percentage || 0;
                    const coverageB = (calculateDynamicCoverage(b.name.toLowerCase()) || {}).percentage || 0;
                    
                    // Sort by coverage descending
                    if (coverageB !== coverageA) {
                        return coverageB - coverageA;
                    }
                    
                    // Then by name
                    return (a.name || '').localeCompare(b.name || '');
                });
            } else if (sortOrder === 'pokedex') {
                // Sort by National Pokédex number
                // Non-Pokémon cards (Supporter/Item/Stadium/Tool/Energy) sort to the end
                const NON_POKEMON = new Set(['supporter','item','stadium','tool','special energy','energy']);

                function getBasePokemonName(cardName) {
                    let n = (cardName || '').toLowerCase().trim();
                    // Strip possessive trainer prefix: "erika's ", "team rocket's ", etc.
                    const possMatch = n.match(/^[^']+\'s\s+(.+)$/);
                    if (possMatch) n = possMatch[1];
                    // Strip variant/form prefixes that map to same species
                    n = n.replace(/^(mega|alolan|galarian|hisuian|paldean|primal|shadow|dark|light|ancient|future|origin|blade|shield|hero of many battles )\s+/, '');
                    // Strip common card type suffixes (order matters: longest first)
                    n = n.replace(/\s+(vstar|vmax|vunion|v-union|ex|gx|v\b|lv\.x|legend|sp|lvl\.\s*x|breaking|star|prime|restored|radiant|ancient|future)$/i, '').trim();
                    // Strip leftover trailing suffixes like " ex" again in case of double
                    n = n.replace(/\s+ex$/i, '').trim();
                    // Strip Mega form suffixes: "charizard x" → "charizard", "mewtwo y" → "mewtwo"
                    n = n.replace(/\s+[xyz]$/i, '').trim();
                    return n;
                }

                function getDexNumber(card) {
                    const typeLower = (card.type || '').toLowerCase();
                    // Check if it's a non-Pokémon card type
                    if (NON_POKEMON.has(typeLower) || typeLower.includes('supporter') ||
                        typeLower.includes('item') || typeLower.includes('stadium') ||
                        typeLower.includes('tool') || typeLower.includes('energy')) {
                        return Infinity;
                    }
                    const base = getBasePokemonName(card.name);
                    // Try exact match first
                    if (pokedexNumbers[base] !== undefined) return pokedexNumbers[base];
                    // Try with hyphen instead of space
                    const hyphened = base.replace(/\s+/g, '-');
                    if (pokedexNumbers[hyphened] !== undefined) return pokedexNumbers[hyphened];
                    // Try stripping form suffixes like " (origin)", " (blade)"
                    const stripped = base.replace(/\s*\(.*\)\s*$/, '').trim();
                    if (pokedexNumbers[stripped] !== undefined) return pokedexNumbers[stripped];
                    // Not found — keep Pokémon cards together after known entries
                    return 9000 + (card.name || '').codePointAt(0);
                }

                cards.sort((a, b) => {
                    const dexA = getDexNumber(a);
                    const dexB = getDexNumber(b);
                    if (dexA !== dexB) return dexA - dexB;
                    // Same species: sort by name (handles forms) then by set
                    const nameComp = (a.name || '').localeCompare(b.name || '');
                    if (nameComp !== 0) return nameComp;
                    return (a.set || '').localeCompare(b.set || '');
                });
            }
        }
        
        function renderCardDatabase(cards, options = {}) {
            const content = document.getElementById('cardsContent');
            const resultsInfo = document.getElementById('cardResultsInfo');
            const shouldScrollToTop = options.scrollToTop !== false;

            // Wishlist/Collection updates: only refresh button states, don't rebuild grid
            if (options.wishlistUpdate === true) {
                _updateCardButtonStates();
                return;
            }

            destroyCardsVirtualGrid();
            
            if (cards.length === 0) {
                content.innerHTML = '<div style="text-align: center; padding: 40px; color: #444;"><h2>No Cards Found</h2><p style="font-weight: 500;">Try adjusting your filter settings</p></div>';
                resultsInfo.textContent = '0 cards found';
                return;
            }
            
            // Calculate pagination
            let cardsToShow, totalPages, startIndex, endIndex;
            
            if (showAllCards) {
                cardsToShow = cards;
                totalPages = 1;
                startIndex = 0;
                endIndex = cards.length;
                resultsInfo.textContent = `${cards.length.toLocaleString()} cards found (all shown)`;
            } else {
                totalPages = Math.ceil(cards.length / cardsPerPage);
                startIndex = (currentCardsPage - 1) * cardsPerPage;
                endIndex = Math.min(startIndex + cardsPerPage, cards.length);
                cardsToShow = cards.slice(startIndex, endIndex);
                resultsInfo.textContent = `${cards.length.toLocaleString()} cards found (page ${currentCardsPage} of ${totalPages})`;
            }
            
            // Create pagination controls
            const paginationTop = createPaginationControls(cards.length, totalPages);
            
            // Pre-build name→prints index for fast altPrint lookup (once per render, not per card)
            const namePrintsIndex = new Map();
            if (window.userCollectionCounts && window.allCardsData) {
                window.allCardsData.forEach(c => {
                    if (!c.name) return;
                    if (!namePrintsIndex.has(c.name)) namePrintsIndex.set(c.name, []);
                    namePrintsIndex.get(c.name).push(c);
                });
            }
            
            // Create card grid and virtualize heavy card nodes using IO placeholders
            const grid = document.createElement('div');
            grid.className = 'card-database-grid';
            mountVirtualCardsGrid(grid, cardsToShow, (card) => createCardDatabaseItem(card, namePrintsIndex));
            
            // Create pagination controls for bottom
            const paginationBottom = createPaginationControls(cards.length, totalPages);
            
            // Clear and add all elements
            content.innerHTML = '';
            content.appendChild(paginationTop);
            content.appendChild(grid);
            content.appendChild(paginationBottom);
            
            if (shouldScrollToTop) {
                // Scroll to top of cards section for filter/pagination changes.
                document.getElementById('cards').scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }

        // Update only button states (wishlist/collection) without rebuilding the grid
        function _updateCardButtonStates() {
            const items = document.querySelectorAll('#cards .card-database-item[data-card-id]');
            items.forEach(item => {
                const cardId = item.getAttribute('data-card-id');
                if (!cardId) return;

                const owned = (window.userCollectionCounts && window.userCollectionCounts.get(cardId)) || 0;

                // Owned badge
                let ownedBadge = item.querySelector('.card-database-owned-badge');
                if (owned > 0) {
                    if (!ownedBadge) {
                        ownedBadge = document.createElement('div');
                        ownedBadge.className = 'card-database-owned-badge';
                        const imgWrap = item.querySelector('.card-database-image-wrap');
                        if (imgWrap) imgWrap.appendChild(ownedBadge);
                    }
                    ownedBadge.textContent = owned;
                } else if (ownedBadge) {
                    ownedBadge.remove();
                }

                // Wishlist button
                const inWishlist = window.userWishlist && window.userWishlist.has(cardId);
                const wishBtn = item.querySelector('[onclick*="toggleWishlistFromCardDbButton"]');
                if (wishBtn) {
                    wishBtn.style.background = inWishlist ? '#E91E63' : '#F48FB1';
                    wishBtn.style.borderColor = inWishlist ? '#E91E63' : '#F48FB1';
                    wishBtn.innerHTML = inWishlist ? '&#9829;' : '&#9825;';
                    wishBtn.title = inWishlist ? 'Remove from wishlist' : 'Add to wishlist';
                }

                // Collection remove button style
                const removeBtn = item.querySelector('[onclick*="removeCollectionFromCardDbButton"]');
                if (removeBtn) {
                    removeBtn.style.color = owned > 0 ? '#fff' : '#999';
                    removeBtn.style.background = owned > 0 ? '#dc3545' : '#fff';
                }

                // Collection add button title
                const addBtn = item.querySelector('[onclick*="addCollectionFromCardDbButton"]');
                if (addBtn) {
                    addBtn.title = `Add to collection (${owned}/4)`;
                }
            });
        }

        function destroyCardsVirtualGrid() {
            if (cardsVirtualState.observer) {
                cardsVirtualState.observer.disconnect();
                cardsVirtualState.observer = null;
            }
            cardsVirtualState.slots = [];
            cardsVirtualState.renderedCount = 0;
        }

        function mountVirtualCardsGrid(grid, cards, createNode) {
            destroyCardsVirtualGrid();

            const fragment = document.createDocumentFragment();
            cardsVirtualState.slots = cards.map((card) => {
                const slot = document.createElement('div');
                slot.className = 'virtual-card-slot';
                slot.style.minHeight = `${cardsVirtualState.estimatedHeight}px`;
                slot.dataset.rendered = 'false';
                slot._cardData = card;
                fragment.appendChild(slot);
                return slot;
            });
            grid.appendChild(fragment);

            const renderSlot = (slot) => {
                if (!slot || slot.dataset.rendered === 'true') return;
                const node = createNode(slot._cardData);
                slot.textContent = '';
                if (node) {
                    slot.appendChild(node);
                    slot.dataset.rendered = 'true';
                    cardsVirtualState.renderedCount += 1;
                    requestAnimationFrame(() => {
                        const inner = slot.firstElementChild;
                        const measured = Math.round((inner ? inner.getBoundingClientRect().height : slot.getBoundingClientRect().height) || 0);
                        if (measured > 120) {
                            // Fix min-height to measured value instead of removing it
                            // This prevents layout-shifts when slots render
                            slot.style.minHeight = measured + 'px';
                            slot._measuredHeight = measured;
                            cardsVirtualState.estimatedHeight = Math.round((cardsVirtualState.estimatedHeight * 0.85) + (measured * 0.15));
                        }
                    });
                }
            };

            const unrenderSlot = (slot) => {
                if (!slot || slot.dataset.rendered !== 'true') return;
                const measured = Math.round(slot._measuredHeight || slot.getBoundingClientRect().height || cardsVirtualState.estimatedHeight);
                slot.textContent = '';
                slot.dataset.rendered = 'false';
                slot.style.minHeight = `${Math.max(120, measured)}px`;
                cardsVirtualState.renderedCount = Math.max(0, cardsVirtualState.renderedCount - 1);
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
                rootMargin: '1200px 0px 1200px 0px',
                threshold: 0.01
            });

            cardsVirtualState.observer = observer;
            cardsVirtualState.slots.forEach((slot, index) => {
                observer.observe(slot);
                if (index < 16) {
                    renderSlot(slot);
                }
            });
        }
        
        function createPaginationControls(totalCards, totalPages) {
            const container = document.createElement('div');
            container.className = 'pagination-controls';
            // Left side: Copy button
            const leftControls = document.createElement('div');
            leftControls.className = 'pagination-left-controls';
            
            const copyBtn = document.createElement('button');
            copyBtn.type = 'button';
            copyBtn.textContent = 'Copy Names';
            copyBtn.title = 'Copy all filtered card names to clipboard';
            copyBtn.className = 'btn-green btn-outline btn-lg';
            copyBtn.onclick = () => {
                const cardNames = window.filteredCardsData.map(c => c.name).join('\n');
                navigator.clipboard.writeText(cardNames).then(() => {
                    copyBtn.textContent = 'Copied!';
                    copyBtn.classList.add('btn-success');
                    setTimeout(() => {
                        copyBtn.textContent = 'Copy Names';
                        copyBtn.classList.remove('btn-success');
                    }, 2000);
                }).catch(err => {
                    console.error('Copy failed:', err);
                    showToast('Copy failed', 'error');
                });
            };
            leftControls.appendChild(copyBtn);
            
            // Center: Pagination controls
            const centerControls = document.createElement('div');
            centerControls.className = 'pagination-center-controls';
            
            // Previous button
            const prevBtn = document.createElement('button');
            prevBtn.type = 'button';
            prevBtn.textContent = '← Previous';
            prevBtn.className = 'btn-blue btn-outline btn-lg';
            prevBtn.disabled = currentCardsPage === 1 || showAllCards;
            if (prevBtn.disabled) {
                prevBtn.classList.add('btn-disabled');
            }
            prevBtn.onclick = () => {
                if (currentCardsPage > 1 && !showAllCards) {
                    currentCardsPage--;
                    renderCardDatabase(window.filteredCardsData);
                }
            };
            
            // Page numbers
            const pageInfo = document.createElement('div');
            pageInfo.className = 'pagination-page-info';
            
            // Show first page, current page area, and last page
            const pagesToShow = [];
            
            // Always show first page
            pagesToShow.push(1);
            
            // Show pages around current page
            const range = 2; // Show 2 pages before and after current
            for (let i = Math.max(2, currentCardsPage - range); i <= Math.min(totalPages - 1, currentCardsPage + range); i++) {
                if (!pagesToShow.includes(i)) {
                    pagesToShow.push(i);
                }
            }
            
            // Always show last page
            if (totalPages > 1 && !pagesToShow.includes(totalPages)) {
                pagesToShow.push(totalPages);
            }
            
            // Sort pages
            pagesToShow.sort((a, b) => a - b);
            
            // Create page buttons with ellipsis
            for (let i = 0; i < pagesToShow.length; i++) {
                const page = pagesToShow[i];
                
                // Add ellipsis if there's a gap
                if (i > 0 && page - pagesToShow[i-1] > 1) {
                    const ellipsis = document.createElement('span');
                    ellipsis.textContent = '...';
                    ellipsis.className = 'pagination-ellipsis';
                    pageInfo.appendChild(ellipsis);
                }
                
                const pageBtn = document.createElement('button');
                pageBtn.type = 'button';
                pageBtn.textContent = page;
                pageBtn.className = 'btn-blue btn-outline btn-sm pagination-page-btn';
                if (page === currentCardsPage) {
                    pageBtn.classList.add('btn-active');
                }
                
                pageBtn.onclick = () => {
                    currentCardsPage = page;
                    renderCardDatabase(window.filteredCardsData);
                };
                
                pageInfo.appendChild(pageBtn);
            }
            
            // Next button
            const nextBtn = document.createElement('button');
            nextBtn.type = 'button';
            nextBtn.textContent = 'Next →';
            nextBtn.className = 'btn-blue btn-outline btn-lg';
            nextBtn.disabled = currentCardsPage === totalPages || showAllCards;
            if (nextBtn.disabled) {
                nextBtn.classList.add('btn-disabled');
            }
            nextBtn.onclick = () => {
                if (currentCardsPage < totalPages && !showAllCards) {
                    currentCardsPage++;
                    renderCardDatabase(window.filteredCardsData);
                }
            };
            
            centerControls.appendChild(prevBtn);
            if (!showAllCards) {
                centerControls.appendChild(pageInfo);
            }
            centerControls.appendChild(nextBtn);
            
            // Right side: Show All / Show Paginated button
            const rightControls = document.createElement('div');
            rightControls.className = 'pagination-right-controls';
            
            const toggleShowAllBtn = document.createElement('button');
            toggleShowAllBtn.type = 'button';
            toggleShowAllBtn.textContent = showAllCards ? 'Paginated' : 'Show All';
            toggleShowAllBtn.title = showAllCards ? 'Switch back to paginated view' : 'Show all cards at once';
            toggleShowAllBtn.className = 'btn-purple btn-outline btn-lg';
            toggleShowAllBtn.onclick = () => {
                showAllCards = !showAllCards;
                if (!showAllCards) {
                    currentCardsPage = 1; // Reset to first page
                }
                renderCardDatabase(window.filteredCardsData);
            };
            rightControls.appendChild(toggleShowAllBtn);
            
            container.appendChild(leftControls);
            container.appendChild(centerControls);
            container.appendChild(rightControls);
            
            return container;
        }
        
        function createCardDatabaseItem(card, namePrintsIndex) {
            // Validate essential fields
            if (!card.name) {
                return null;
            }
            
            const item = document.createElement('div');
            item.className = 'card-database-item';
            item.setAttribute('data-card-id', `${card.name || ''}|${card.set || ''}|${card.number || ''}`);
            
            const rarityClass = getRarityClass(card.rarity);
            
            // Escape strings for HTML attributes
            const escapedName = escapeJsStr(card.name || '');
            const escapedImageUrl = escapeJsStr(card.image_url || '');
            const displayName = escapeHtml(card.name || 'Unknown Card');
            const displaySet = escapeHtml(card.set || '???');
            const displayNumber = escapeHtml(card.number || '?');
            const proxySetCode = card.set || '';
            const proxySetNumber = card.number || '';
            const displayType = escapeHtml(card.type || 'Unknown');
            const displayRarity = escapeHtml(card.rarity || 'Unknown');
            const rawCardMarketUrl = card.cardmarket_url || '';
            const displayCardMarketUrl = rawCardMarketUrl ? rawCardMarketUrl.split('?')[0] + '?sellerCountry=7&language=1,3' : '#';
            
            // Create unique card ID: name|set|number (tracks SPECIFIC print, not just card name)
            const cardId = `${card.name}|${displaySet}|${displayNumber}`;
            item.setAttribute('data-card-id', cardId);
            const safeCardId = escapeJsStr(cardId);
            const safeCardName = escapeJsStr(card.name || '');
            const safeDisplaySet = escapeJsStr(displaySet);
            const safeDisplayNumber = escapeJsStr(displayNumber);
            
            // Check if user owns THIS SPECIFIC PRINT
            const userOwnsCard = window.userCollection && window.userCollection.has(cardId);
            const ownedCount = window.userCollectionCounts ? (window.userCollectionCounts.get(cardId) || 0) : 0;
            const userWantsCard = window.userWishlist && window.userWishlist.has(cardId);
            const userTradesCard = window.userTradelist && window.userTradelist.has(cardId);

            // Show other-print ownership strictly from the card's international_prints family.
            const altPrintOwnedCount = ownedCount === 0
                ? getOtherInternationalPrintOwnedCount(displaySet, displayNumber, window.userCollectionCounts)
                : 0;
            
            // Format price button
            let priceButton = '';
            if (card.eur_price && card.eur_price !== '' && card.eur_price !== '0' && card.eur_price !== 'N/A') {
                const price = parseFloat(card.eur_price.replace(',', '.'));
                if (!isNaN(price)) {
                    priceButton = `<a href="${displayCardMarketUrl}" target="_blank" rel="noopener noreferrer" class="card-database-price-btn" title="View on CardMarket" aria-label="View ${displayName} on CardMarket (opens in new tab)">
                        <span class="card-database-price-value">Ø ${price.toFixed(2).replace('.', ',')} €</span>
                    </a>`;
                }
            }
            if (!priceButton) {
                priceButton = `<div class="card-database-price-placeholder" title="No CardMarket price found">No Price</div>`;
            }
            
            // Calculate DYNAMIC Deck Coverage based on active filters
            let coverageDisplay = '';
            const coverageStats = calculateDynamicCoverage(card.name);
            if (coverageStats && coverageStats.totalDecks > 0) {
                const percentage = coverageStats.percentage || 0;
                const deckCount = coverageStats.deckCount || 0;
                const archetypeCount = coverageStats.archetypeCount || 0;
                const maxCount = coverageStats.maxCount || 0;
                let coverageColor = '#95a5a6'; // Gray for < 50%
                let coverageIcon = '\u{1F4CA}'; // bar chart
                if (percentage >= 99.5) {
                    coverageColor = '#e74c3c'; // Red for 100%
                    coverageIcon = '\uD83D\uDD25'; // fire
                } else if (percentage >= 90) {
                    coverageColor = '#e67e22'; // Orange for >=90%
                    coverageIcon = '\u26A1'; // lightning
                } else if (percentage >= 70) {
                    coverageColor = '#f39c12'; // Yellow for >=70%
                    coverageIcon = '\u2B50'; // star
                } else if (percentage >= 50) {
                    coverageColor = '#3498db'; // Blue for >=50%
                    coverageIcon = '\u{1F4CA}'; // bar chart
                }
                // Format the display with max count
                const maxCountText = maxCount > 0 ? ` · Max: ${maxCount}x` : '';
                const coveragePctLabel = (percentage > 0 && percentage < 0.1) ? '<0.1' : percentage.toFixed(1);
                coverageDisplay = `<div class="card-database-coverage" style="background: ${coverageColor};" title="${deckCount} Decks / ${archetypeCount} Archetypes${maxCount > 0 ? ' · Max: ' + maxCount + 'x copies per deck' : ''}">
                    ${coverageIcon} ${coveragePctLabel}% Coverage${maxCountText}
                </div>`;
            }
            const limitlessButton = (card.set && card.number)
                ? `<button type="button" onclick="openLimitlessCard('${escapeJsStr(card.set)}', '${escapeJsStr(card.number)}')" class="btn-gradient-blue card-limitless-btn card-database-limitless-btn" title="View on Limitless" aria-label="Open ${displayName} on Limitless">Limitless</button>`
                : '<div class="card-database-limitless-placeholder"></div>';
            
            item.innerHTML = `
                <div class="pos-rel card-database-image-wrap">
                    <img src="${escapedImageUrl}" alt="${displayName}" loading="lazy" decoding="async" onclick="showImageView('${escapedImageUrl}', '${escapedName}')" role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();showImageView('${escapedImageUrl}', '${escapedName}');}" aria-label="Open ${displayName} image in fullscreen">
                    ${ownedCount > 0 ? `<div class="card-database-owned-badge">${ownedCount}</div>` : ''}
                    ${ownedCount === 0 && altPrintOwnedCount > 0 ? `<div class="card-database-alt-owned-badge" title="Owned other INT prints">${altPrintOwnedCount}</div>` : ''}
                    <div class="pos-abs card-action-row-wide card-database-top-actions">
                        <button type="button" data-card-id="${escapeHtml(cardId)}" onclick="addCollectionFromCardDbButton(this)" class="btn-green card-badge" title="Add to collection (${ownedCount}/4)" aria-label="Add ${displayName} to collection">+</button>
                        <button type="button" data-card-id="${escapeHtml(cardId)}" onclick="removeCollectionFromCardDbButton(this)" class="btn-red card-badge" style="color: ${ownedCount > 0 ? '#fff' : '#999'}; background: ${ownedCount > 0 ? '#dc3545' : '#fff'};" title="Remove from collection (${ownedCount}/4)" aria-label="Remove ${displayName} from collection">-</button>
                        <button type="button" data-card-id="${escapeHtml(cardId)}" onclick="toggleWishlistFromCardDbButton(this)" class="btn-wishlist card-badge" style="color: ${userWantsCard ? '#fff' : '#fff'}; background: ${userWantsCard ? '#E91E63' : '#F48FB1'}; border: 2px solid ${userWantsCard ? '#E91E63' : '#F48FB1'};" title="${userWantsCard ? 'Remove from wishlist' : 'Add to wishlist'}" aria-label="${userWantsCard ? 'Remove ' + displayName + ' from wishlist' : 'Add ' + displayName + ' to wishlist'}">${userWantsCard ? '&#9829;' : '&#9825;'}</button>
                        <button type="button" data-card-id="${escapeHtml(cardId)}" onclick="toggleTradelistFromCardDbButton(this)" class="btn-tradelist card-badge" style="color: #fff; background: ${userTradesCard ? '#16a085' : '#a3d9cd'}; border: 2px solid ${userTradesCard ? '#16a085' : '#a3d9cd'};" title="${userTradesCard ? 'Remove from trade list' : 'Add to trade list'}" aria-label="${userTradesCard ? 'Remove ' + displayName + ' from trade list' : 'Add ' + displayName + ' to trade list'}">${userTradesCard ? '&#8644;' : '&#8644;'}</button>
                    </div>
                </div>
                <div class="card-database-info">
                    <div class="card-database-name">${displayName}</div>
                    <div class="card-database-meta">
                        <span class="card-database-set">${displaySet} ${displayNumber}</span>
                        <span class="card-database-type">${displayType}</span>
                    </div>
                    <div class="card-database-button-row">
                        ${priceButton}
                        <div class="card-database-rarity-btn ${rarityClass} rarity-badge" data-card-name="${escapeHtml(card.name || '')}" data-card-set="${escapeHtml(displaySet)}" data-card-number="${escapeHtml(displayNumber)}" onclick="openRarityFromCardDbButton(this)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openRarityFromCardDbButton(this);}" style="--rarity-btn-bg: #888;" title="View all prints for ${displayRarity}" role="button" tabindex="0" aria-label="Open print variants for ${displayName}">
                            ${displayRarity}
                        </div>
                    </div>
                    <div class="card-database-secondary-row">
                        <button type="button" onclick="addCardToProxy('${escapedName}', '${proxySetCode}', '${proxySetNumber}', 1)" class="btn-gradient-red card-proxy-btn card-database-proxy-btn" title="Add to proxy queue" aria-label="Add ${displayName} to proxy queue">Proxy</button>
                        ${limitlessButton}
                    </div>
                    ${coverageDisplay}
                </div>
            `;
            
            return item;
        }

        function addCollectionFromCardDbButton(buttonEl) {
            const cardId = buttonEl?.getAttribute('data-card-id') || '';
            if (!cardId) return;
            addToCollection(cardId);
        }

        function removeCollectionFromCardDbButton(buttonEl) {
            const cardId = buttonEl?.getAttribute('data-card-id') || '';
            if (!cardId) return;
            removeFromCollection(cardId);
        }

        function toggleWishlistFromCardDbButton(buttonEl) {
            const cardId = buttonEl?.getAttribute('data-card-id') || '';
            if (!cardId) return;
            toggleWishlist(cardId);
        }

        // Meta Binder wishlist toggle: adds missing qty on first click, removes on second
        function toggleWishlistMetaBinder(buttonEl) {
            const cardId = buttonEl?.getAttribute('data-card-id') || '';
            if (!cardId) return;
            if (window.userWishlist && window.userWishlist.has(cardId)) {
                removeFromWishlist(cardId);
            } else {
                // Live-recalculate missing count from current collection state
                let missingNow;
                const cardEl = buttonEl.closest('.meta-binder-card');
                if (cardEl) {
                    const needEl = cardEl.querySelector('.meta-binder-card-need');
                    const maxCount = needEl ? (parseInt(needEl.textContent, 10) || 1) : 1;
                    const owned = (window.userCollectionCounts && window.userCollectionCounts.get(cardId)) || 0;
                    missingNow = Math.max(0, maxCount - owned);
                } else {
                    missingNow = parseInt(buttonEl?.getAttribute('data-missing') || '1', 10);
                }
                const qty = Math.max(1, missingNow);
                if (typeof addToWishlistWithCount === 'function') {
                    addToWishlistWithCount(cardId, qty);
                } else {
                    addToWishlist(cardId);
                }
            }
        }
        window.toggleWishlistMetaBinder = toggleWishlistMetaBinder;

        function openRarityFromCardDbButton(buttonEl) {
            const cardName = buttonEl?.getAttribute('data-card-name') || '';
            const cardSet = buttonEl?.getAttribute('data-card-set') || '';
            const cardNumber = buttonEl?.getAttribute('data-card-number') || '';
            if (!cardName) return;
            openRaritySwitcherFromDB(cardName, cardSet, cardNumber);
        }
        
        function getRarityClass(rarity) {
            if (!rarity) return '';
            const r = rarity.toLowerCase();
            if (r.includes('common')) return 'rarity-common';
            if (r.includes('uncommon')) return 'rarity-uncommon';
            if (r === 'rare') return 'rarity-rare';
            if (r.includes('holo rare')) return 'rarity-holo';
            if (r.includes('double rare')) return 'rarity-double';
            if (r.includes('triple rare')) return 'rarity-triple';
            if (r.includes('ultra rare')) return 'rarity-ultra';
            if (r.includes('secret rare')) return 'rarity-secret';
            if (r.includes('rainbow rare')) return 'rarity-rainbow';
            if (r === 'art rare') return 'rarity-art';
            if (r.includes('special art')) return 'rarity-special-art';
            if (r.includes('character holo')) return 'rarity-char-holo';
            if (r.includes('character super')) return 'rarity-char-super';
            if (r.includes('radiant')) return 'rarity-radiant';
            if (r === 'shiny rare') return 'rarity-shiny';
            if (r.includes('shiny ultra')) return 'rarity-shiny-ultra';
            if (r.includes('promo')) return 'rarity-promo';
            return '';
        }

        function parseTournamentDate(dateStr) {
            /**
             * Parse tournament date string (e.g., "13th February 2026") to Date object
             * Returns null if parsing fails
             */
            if (!dateStr || dateStr.trim() === '') return null;
            
            try {
                // Remove ordinal suffixes (st, nd, rd, th)
                const cleaned = dateStr.replace(/(\d+)(st|nd|rd|th)/, '$1');
                const parsed = new Date(cleaned);
                return isNaN(parsed.getTime()) ? null : parsed;
            } catch (e) {
                return null;
            }
        }
        
        function getCardReleaseDate(cardStats) {
            /**
             * Get the release date of a card based on its set code
             * Returns Date object or null if not determinable
             */
            if (!cardStats || !cardStats.setCode) {
                // If no set code, try to find earliest tournament date
                if (cardStats && cardStats.tournamentDates && cardStats.tournamentDates.size > 0) {
                    const dates = Array.from(cardStats.tournamentDates)
                        .map(d => parseTournamentDate(d))
                        .filter(d => d !== null);
                    if (dates.length > 0) {
                        return new Date(Math.min(...dates));
                    }
                }
                return null;
            }
            
            const setCode = cardStats.setCode;
            const releaseDateStr = window.SET_RELEASE_DATES[setCode] || window.SET_RELEASE_DATES['DEFAULT'];
            return new Date(releaseDateStr);
        }

        function calculateDynamicCoverage(cardName) {
            if (!window.cardDeckCoverageMap || !window.archetypeDeckCounts) {
                return null;
            }
            
            const cardNameLower = normalizeCardName(cardName);
            const cardStats = window.cardDeckCoverageMap.get(cardNameLower);
            
            if (!cardStats) {
                return null;
            }
            
            // Get card release date for temporal filtering
            const cardReleaseDate = getCardReleaseDate(cardStats);
            
            // Get active filters
            const selectedMainPokemons = Array.from(document.querySelectorAll('#mainPokemonList input:checked')).map(cb => cb.value);
            const selectedArchetypes = Array.from(document.querySelectorAll('#archetypeList input:checked')).map(cb => cb.value);
            const selectedMetaFilters = Array.from(document.querySelectorAll('#metaFormatOptions input:checked')).filter(cb => cb.value.startsWith('meta:')).map(cb => cb.value.replace('meta:', ''));
            
            // Get ALL actually existing archetype keys from the data
            const allExistingArchetypeKeys = Array.from(window.archetypeDeckCounts.keys());
            
            let decksFilteredByDate = 0; // Track how many decks were filtered out by date
            
            // If no filters are active, use all decks from the global calculation
            if (selectedMainPokemons.length === 0 && selectedArchetypes.length === 0 && selectedMetaFilters.length === 0) {
                let totalDecksWithCard = 0;
                let filteredMaxCount = 0;
                cardStats.archetypesWithCard.forEach((entry, archetypeKey) => {
                    const deckCount = typeof entry === 'number' ? entry : (entry.deckCount || 0);
                    const maxCount = typeof entry === 'number' ? 0 : (entry.maxCount || 0);
                    const tournamentDate = parseTournamentDate(entry.tournamentDate || null);
                    const [meta, archetype] = archetypeKey.split('|');
                    
                    // Temporal filtering: Only filter if we have BOTH a card release date AND a tournament date
                    // City League data often has NO tournament_date, so we treat it as "current meta"
                    if (cardReleaseDate && tournamentDate) {
                        if (tournamentDate < cardReleaseDate) {
                            decksFilteredByDate++;
                            return; // Skip this entry
                        }
                    }
                    // If no tournament date (like City League), we DON'T filter - assume it's current
                    
                    totalDecksWithCard += deckCount;
                    filteredMaxCount = Math.max(filteredMaxCount, maxCount);
                });
                
                if (window.totalUniqueDecks) {
                    const percentage = (totalDecksWithCard / window.totalUniqueDecks) * 100;
                    return {
                        percentage: percentage,
                        deckCount: totalDecksWithCard,
                        archetypeCount: cardStats.archetypes.size,
                        totalDecks: window.totalUniqueDecks,
                        maxCount: filteredMaxCount
                    };
                }
                return null;
            }
            
            // Filter archetype keys based on active filters
            const filteredArchetypeKeys = allExistingArchetypeKeys.filter(archetypeKey => {
                // archetypeKey format: "meta|archetype"
                const [meta, archetype] = archetypeKey.split('|');
                
                // Check meta filter
                if (selectedMetaFilters.length > 0) {
                    if (!selectedMetaFilters.includes(meta)) {
                        return false;
                    }
                }
                
                // Check archetype filter
                if (selectedArchetypes.length > 0) {
                    if (!selectedArchetypes.includes(archetype)) {
                        return false;
                    }
                }
                
                // Check main pokemon filter
                if (selectedMainPokemons.length > 0) {
                    const mainPokemon = archetype.split(' ')[0].trim();
                    if (!selectedMainPokemons.includes(mainPokemon)) {
                        return false;
                    }
                    
                    // IMPORTANT: When filtering by Main Pokemon, only count archetypes
                    // that have AT LEAST ONE card matching the main pokemon name
                    // This filters out incomplete data where the main pokemon cards weren't scraped
                    const hasMainPokemonCard = Array.from(window.cardDeckCoverageMap.keys()).some(cardName => {
                        const cardStats = window.cardDeckCoverageMap.get(cardName);
                        // Check if this card name contains the main pokemon name
                        // AND this archetype has this card
                        return cardName.includes(mainPokemon.toLowerCase()) && 
                               cardStats.archetypesWithCard.has(archetypeKey);
                    });
                    
                    if (!hasMainPokemonCard) {
                        if (cardNameLower === 'hawlucha' && archetypeKey.includes('Dragapult')) {
                            devLog(`[Coverage Debug Hawlucha Filter] Excluding archetype ${archetypeKey} - no card with '${mainPokemon.toLowerCase()}' in name found`);
                        }
                        return false; // Skip archetypes with no main pokemon cards
                    } else {
                        if (cardNameLower === 'hawlucha' && archetypeKey.includes('Dragapult')) {
                            devLog(`[Coverage Debug Hawlucha Filter] Including archetype ${archetypeKey} - has main pokemon card`);
                        }
                    }
                }
                
                return true;
            });
            
            if (filteredArchetypeKeys.length === 0) {
                return null;
            }
            
            if (cardNameLower === 'hawlucha') {
                const dragapultKeys = filteredArchetypeKeys.filter(k => k.includes('Dragapult'));
                devLog(`[Coverage Debug Hawlucha Filter] Filtered Dragapult Archetypes (${dragapultKeys.length}): ${dragapultKeys.slice(0, 5).join(', ')}${dragapultKeys.length > 5 ? ` ... and ${dragapultKeys.length - 5} more` : ''}`);
                
                const hawluchaKeys = Array.from(cardStats.archetypesWithCard.keys());
                const hawluchaDragKeys = hawluchaKeys.filter(k => k.includes('Dragapult'));
                devLog(`[Coverage Debug Hawlucha Filter] Hawlucha's Dragapult Archetypes (${hawluchaDragKeys.length}): ${hawluchaDragKeys.join(', ')}`);
                
                // Check which Hawlucha archetypes are NOT in filtered keys
                const missingKeys = hawluchaKeys.filter(k => !filteredArchetypeKeys.includes(k) && k.includes('Dragapult'));
                if (missingKeys.length > 0) {
                    devLog(`[Coverage Debug Hawlucha Filter] Hawlucha archetypes MISSING from filtered list (${missingKeys.length}): ${missingKeys.join(', ')}`);
                } else {
                    devLog(`[Coverage Debug Hawlucha Filter] All Hawlucha Dragapult archetypes are in filtered list!`);
                }
            }
            
            // Count total decks in filtered archetypes
            let totalFilteredDecks = 0;
            filteredArchetypeKeys.forEach(archetypeKey => {
                const archetypeData = window.archetypeDeckCounts.get(archetypeKey);
                const deckCount = typeof archetypeData === 'number' ? archetypeData : (archetypeData.totalDecks || 0);
                
                // DON'T apply temporal filtering here - we want to count ALL decks in the archetype
                // regardless of when the card was released. Temporal filtering is only for decksWithCard.
                totalFilteredDecks += deckCount;
            });
            
            // Count how many decks have this card
            let decksWithCard = 0;
            let filteredMaxCount = 0;
            const matchingArchetypes = new Set();
            
            if (cardNameLower === 'hawlucha') {
                devLog(`[Coverage Debug Hawlucha Count] Starting deck count. cardStats.archetypesWithCard has ${cardStats.archetypesWithCard.size} entries`);
                const releaseDate = getCardReleaseDate(cardStats);
                devLog(`[Coverage Debug Hawlucha Count] Card release date: ${releaseDate ? releaseDate.toISOString().split('T')[0] : 'NULL'}, setCode: ${cardStats.setCode}`);
            }
            
            let hawluchaDebugInfo = [];
            
            cardStats.archetypesWithCard.forEach((entry, archetypeKey) => {
                const isIncluded = filteredArchetypeKeys.includes(archetypeKey);
                
                if (cardNameLower === 'hawlucha' && archetypeKey.includes('Dragapult')) {
                    const deckCount = typeof entry === 'number' ? entry : (entry.deckCount || 0);
                    hawluchaDebugInfo.push(`${archetypeKey}:included=${isIncluded},deckCount=${deckCount}`);
                }
                
                if (isIncluded) {
                    const deckCount = typeof entry === 'number' ? entry : (entry.deckCount || 0);
                    const tournamentDate = parseTournamentDate(entry.tournamentDate || null);
                    
                    // Get the release date for THIS specific entry's set code, not the global one
                    const entrySetCode = (typeof entry === 'object' && entry.setCode) ? entry.setCode : cardStats.setCode;
                    const entryReleaseDateStr = window.SET_RELEASE_DATES[entrySetCode] || window.SET_RELEASE_DATES['DEFAULT'];
                    const entryReleaseDate = entrySetCode ? new Date(entryReleaseDateStr) : cardReleaseDate;
                    
                    if (cardNameLower === 'hawlucha') {
                        devLog(`[Coverage Debug Hawlucha Count] ? ${archetypeKey}: deckCount=${deckCount}, tournamentDate=${entry.tournamentDate || 'N/A'}, entrySetCode=${entrySetCode}, releaseDate=${entryReleaseDate ? entryReleaseDate.toISOString().split('T')[0] : 'NULL'}`);
                    }
                    
                    // Temporal filtering: Use the entry's specific set code release date
                    // Only filter if we have BOTH a card release date AND a tournament date
                    // City League data often has NO tournament_date, so we treat it as "current meta"
                    if (entryReleaseDate && tournamentDate) {
                        if (tournamentDate < entryReleaseDate) {
                            if (cardNameLower === 'hawlucha') {
                                devLog(`[Coverage Debug Hawlucha Count] ? FILTERED OUT: ${archetypeKey} (tournament ${tournamentDate.toISOString().split('T')[0]} < release ${entryReleaseDate.toISOString().split('T')[0]})`);
                            }
                            return; // Skip this entry
                        }
                    }
                    // If no tournament date, we DON'T filter - assume it's current
                    
                    decksWithCard += deckCount;
                    filteredMaxCount = Math.max(filteredMaxCount, (typeof entry === 'number' ? 0 : (entry.maxCount || 0)));
                    // Extract archetype from archetypeKey (format: meta|archetype)
                    const archetype = archetypeKey.split('|')[1];
                    if (archetype) {
                        matchingArchetypes.add(archetype);
                    }
                }
            });
            
            if (cardNameLower === 'hawlucha' && hawluchaDebugInfo.length > 0) {
                devLog(`[Coverage Debug Hawlucha Count] Dragapult archetypes checked: ${hawluchaDebugInfo.join(' | ')}`);
            }
            
            const percentage = totalFilteredDecks > 0 ? (decksWithCard / totalFilteredDecks) * 100 : 0;
            
            if (cardNameLower === 'hawlucha') {
                devLog(`[Coverage Debug Hawlucha] Final: ${decksWithCard}/${totalFilteredDecks} = ${percentage.toFixed(1)}%, matching archetypes: ${matchingArchetypes.size}, filtered keys: ${filteredArchetypeKeys.length}`);
            }
            
            // Enhanced debug logging with temporal filtering info
            if (cardNameLower.includes('dragapult') || cardNameLower.includes('poke pad') || cardNameLower.includes('poke pad')) {
                let debugMsg = `[Coverage Debug] ${cardName}: ${decksWithCard}/${totalFilteredDecks} decks = ${percentage.toFixed(1)}% | Archetypes: ${matchingArchetypes.size}/${filteredArchetypeKeys.length}`;
                
                if (cardReleaseDate) {
                    debugMsg += ` | Release: ${cardReleaseDate.toISOString().split('T')[0]}`;
                }
                if (decksFilteredByDate > 0) {
                    debugMsg += ` | Filtered (before release): ${decksFilteredByDate}`;
                }
                
                const samples = Array.from(cardStats.archetypesWithCard.keys()).filter(k => filteredArchetypeKeys.includes(k)).slice(0, 3).map(k => {
                    const entry = cardStats.archetypesWithCard.get(k);
                    const count = typeof entry === 'number' ? entry : (entry.deckCount || 0);
                    const archetypeData = window.archetypeDeckCounts.get(k);
                    const total = typeof archetypeData === 'number' ? archetypeData : (archetypeData.totalDecks || 0);
                    const dateStr = entry.tournamentDate || 'N/A';
                    return `${k}(${count}/${total}, ${dateStr})`;
                }).join(', ');
                
                debugMsg += ` | Samples: ${samples}`;
                
                // Show which archetypes DON'T have this card
                const archetypesWithoutCard = filteredArchetypeKeys.filter(k => !cardStats.archetypesWithCard.has(k));
                if (archetypesWithoutCard.length > 0) {
                    debugMsg += ` | Missing from: ${archetypesWithoutCard.slice(0, 3).join(', ')}`;
                }
                
                devLog(debugMsg);
            }
            
            return {
                percentage: percentage,
                deckCount: decksWithCard,
                archetypeCount: matchingArchetypes.size,
                totalDecks: totalFilteredDecks,
                maxCount: filteredMaxCount
            };
        }
        
        function openRaritySwitcherFromDB(cardName, set, number) {
            // Create a deckKey format that openRaritySwitcher expects
            const deckKey = `${cardName} (${set} ${number})`;
            openRaritySwitcher(cardName, deckKey);
        }
        
        function filterCards() {
            // This function is called from the old search box, now handled by filterAndRenderCards
            filterAndRenderCards();
        }
        
        // Rarity Switcher Functions
        let currentRaritySwitcherCard = null;

        function hasLoadedCardDatabaseForRaritySwitcher() {
            return Array.isArray(window.allCardsDatabase) && window.allCardsDatabase.length > 0;
        }

        async function ensureCardDatabaseReadyForRaritySwitcher(options = {}) {
            const maxWaitMs = Number(options.maxWaitMs) > 0 ? Number(options.maxWaitMs) : 5000;
            const pollIntervalMs = Number(options.pollIntervalMs) > 0 ? Number(options.pollIntervalMs) : 100;

            if (hasLoadedCardDatabaseForRaritySwitcher()) return true;

            if (typeof loadAllCardsDatabase === 'function') {
                try {
                    await Promise.resolve(loadAllCardsDatabase());
                } catch (err) {
                    devWarn('[RaritySwitch][ready] loadAllCardsDatabase failed', err);
                }
            }

            if (hasLoadedCardDatabaseForRaritySwitcher()) return true;

            const startedAt = Date.now();
            while ((Date.now() - startedAt) < maxWaitMs) {
                await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
                if (hasLoadedCardDatabaseForRaritySwitcher()) return true;
            }

            return false;
        }

        function resolveRaritySwitchTarget(cardName, deckKey, sourceHint = '') {
            const normalizedActualName = normalizeCardName(cardName || '');
            const parsedMatch = String(deckKey || '').match(/^(.+?)\s*\(([A-Z0-9-]+)\s+([A-Z0-9-]+)\)$/);
            const parsedSet = parsedMatch ? String(parsedMatch[2] || '').toUpperCase() : '';
            const parsedNumber = parsedMatch ? String(parsedMatch[3] || '').toUpperCase() : '';

            const profileHintMatch = String(sourceHint || '').match(/^profile\|(.+)$/);
            if (profileHintMatch) {
                const profileDeckId = profileHintMatch[1];
                const profileDeck = (window.userDecks || []).find(d => String(d && d.id) === String(profileDeckId));
                const profileCards = profileDeck && profileDeck.cards && typeof profileDeck.cards === 'object'
                    ? profileDeck.cards
                    : null;

                if (profileCards) {
                    const directCount = parseInt(profileCards[deckKey], 10) || 0;
                    if (directCount > 0) {
                        return { source: 'profile', oldKey: deckKey, count: directCount, profileDeckId };
                    }

                    let bySetNumberMatch = null;
                    let byNameMatch = null;
                    for (const [key, qty] of Object.entries(profileCards)) {
                        const keyQty = parseInt(qty, 10) || 0;
                        if (keyQty <= 0) continue;
                        const keyMatch = String(key).match(/^(.+?)\s*\(([A-Z0-9-]+)\s+([A-Z0-9-]+)\)$/);
                        const keyName = keyMatch ? keyMatch[1] : key;
                        const keySet = keyMatch ? String(keyMatch[2] || '').toUpperCase() : '';
                        const keyNumber = keyMatch ? String(keyMatch[3] || '').toUpperCase() : '';

                        if (parsedSet && parsedNumber && keySet === parsedSet && keyNumber === parsedNumber) {
                            bySetNumberMatch = { source: 'profile', oldKey: key, count: keyQty, profileDeckId };
                            break;
                        }

                        if (!byNameMatch && normalizeCardName(keyName) === normalizedActualName) {
                            byNameMatch = { source: 'profile', oldKey: key, count: keyQty, profileDeckId };
                        }
                    }

                    if (bySetNumberMatch) return bySetNumberMatch;
                    if (byNameMatch) return byNameMatch;
                }
            }

            const deckContexts = {
                cityLeague: window.cityLeagueDeck || {},
                currentMeta: window.currentMetaDeck || {},
                pastMeta: window.pastMetaDeck || {}
            };

            const orderedSources = [];
            if (sourceHint && deckContexts[sourceHint]) orderedSources.push(sourceHint);
            ['cityLeague', 'currentMeta', 'pastMeta'].forEach(src => {
                if (!orderedSources.includes(src)) orderedSources.push(src);
            });

            for (const source of orderedSources) {
                const deck = deckContexts[source];
                if (!deck || typeof deck !== 'object') continue;

                const directCount = parseInt(deck[deckKey], 10) || 0;
                if (directCount > 0) {
                    return { source, oldKey: deckKey, count: directCount };
                }

                let bySetNumberMatch = null;
                let byNameMatch = null;
                for (const [key, qty] of Object.entries(deck)) {
                    const keyQty = parseInt(qty, 10) || 0;
                    if (keyQty <= 0) continue;
                    const keyMatch = String(key).match(/^(.+?)\s*\(([A-Z0-9-]+)\s+([A-Z0-9-]+)\)$/);
                    const keyName = keyMatch ? keyMatch[1] : key;
                    const keySet = keyMatch ? String(keyMatch[2] || '').toUpperCase() : '';
                    const keyNumber = keyMatch ? String(keyMatch[3] || '').toUpperCase() : '';

                    if (parsedSet && parsedNumber && keySet === parsedSet && keyNumber === parsedNumber) {
                        bySetNumberMatch = { source, oldKey: key, count: keyQty };
                        break;
                    }

                    if (!byNameMatch && normalizeCardName(keyName) === normalizedActualName) {
                        byNameMatch = { source, oldKey: key, count: keyQty };
                    }
                }

                if (bySetNumberMatch) return bySetNumberMatch;
                if (byNameMatch) return byNameMatch;
            }

            devWarn('[RaritySwitch][resolve] target not found', {
                cardName,
                deckKey,
                sourceHint,
                parsedSet,
                parsedNumber,
                orderedSources
            });
            return { source: sourceHint || '', oldKey: deckKey, count: 0 };
        }

        function getRaritySwitcherDeckContext(source, profileDeckId = '') {
            if (profileDeckId) {
                const profileDeck = (window.userDecks || []).find(d => String(d && d.id) === String(profileDeckId));
                const profileCards = profileDeck && profileDeck.cards && typeof profileDeck.cards === 'object'
                    ? profileDeck.cards
                    : null;
                if (!profileDeck || !profileCards) return null;
                return {
                    type: 'profile',
                    source: 'profile',
                    profileDeckId,
                    deck: profileCards,
                    profileDeck
                };
            }

            const deckContexts = {
                cityLeague: { deck: window.cityLeagueDeck || {}, orderKey: 'cityLeagueDeckOrder' },
                currentMeta: { deck: window.currentMetaDeck || {}, orderKey: 'currentMetaDeckOrder' },
                pastMeta: { deck: window.pastMetaDeck || {}, orderKey: 'pastMetaDeckOrder' }
            };
            if (!deckContexts[source]) return null;
            return {
                type: 'temporary',
                source,
                deck: deckContexts[source].deck,
                orderKey: deckContexts[source].orderKey
            };
        }

        function getDeckDistributionForCard(deckObj, cardName) {
            const distribution = new Map();
            let total = 0;
            const wanted = normalizeCardName(cardName);
            Object.entries(deckObj || {}).forEach(([key, qty]) => {
                const count = parseInt(qty, 10) || 0;
                if (count <= 0) return;
                const match = String(key).match(/^(.+?)\s*\(([A-Z0-9-]+)\s+([A-Z0-9-]+)\)$/);
                const keyName = match ? match[1] : key;
                if (normalizeCardName(keyName) !== wanted) return;
                total += count;
                if (match) {
                    const set = String(match[2] || '').toUpperCase();
                    const number = String(match[3] || '').toUpperCase();
                    distribution.set(`${set}-${number}`, count);
                }
            });
            return { distribution, total };
        }

        async function openRaritySwitcher(cardName, deckKey, sourceHint = '') {
            const isReady = await ensureCardDatabaseReadyForRaritySwitcher();
            if (!isReady) {
                showToast('Card database not loaded yet...', 'info');
                return;
            }

            const safeDeckKey = String(deckKey || '');

            // Extract card name from deckKey if needed (handle "CardName (SET NUM)" format)
            const baseNameMatch = safeDeckKey.match(/^(.+?)\s*\(/);
            const actualCardName = baseNameMatch ? baseNameMatch[1] : cardName;
            const normalizedActualCardName = normalizeCardName(actualCardName);

            const cardMatchesActualName = (candidate) => {
                if (!candidate) return false;
                const candidateName = normalizeCardName(candidate.name || '');
                const candidateNameEn = normalizeCardName(candidate.name_en || '');
                return candidateName === normalizedActualCardName || candidateNameEn === normalizedActualCardName;
            };
            
            // Extract set and number from deckKey (e.g., "Boss's Orders (RCL 189)" -> set="RCL", number="189")
            const setNumMatch = safeDeckKey.match(/\(([A-Z0-9-]+)\s+([A-Z0-9-]+)\)/);
            let currentSet = '';
            let currentNumber = '';
            if (setNumMatch) {
                currentSet = setNumMatch[1];
                currentNumber = setNumMatch[2];
            }
            
            devLog(`[openRaritySwitcher] cardName: ${cardName}, deckKey: ${safeDeckKey}, actualCardName: ${actualCardName}`);

            const resolvedTarget = resolveRaritySwitchTarget(actualCardName, safeDeckKey, sourceHint);
            currentRaritySwitcherCard = {
                cardName: actualCardName,
                deckKey: safeDeckKey,
                source: resolvedTarget.source || sourceHint || '',
                resolvedOldKey: resolvedTarget.oldKey || safeDeckKey,
                resolvedCount: resolvedTarget.count || 0,
                profileDeckId: resolvedTarget.profileDeckId || (String(sourceHint || '').startsWith('profile|') ? String(sourceHint).slice('profile|'.length) : '')
            };

            const activeDeckContext = getRaritySwitcherDeckContext(
                currentRaritySwitcherCard.source,
                currentRaritySwitcherCard.profileDeckId
            );
            const activeDistribution = activeDeckContext
                ? getDeckDistributionForCard(activeDeckContext.deck, actualCardName)
                : { distribution: new Map(), total: 0 };
            currentRaritySwitcherCard.totalCopies = activeDistribution.total;
            devLog('[RaritySwitch][open] resolved target', {
                input: { cardName, deckKey: safeDeckKey, sourceHint },
                resolved: currentRaritySwitcherCard
            });
            
            // Find current card's data
            let currentCard = null;
            if (currentSet && currentNumber) {
                currentCard = (window.cardsBySetNumberMap || {})[`${currentSet}-${currentNumber}`] || null;
            }
            
            // Fallback: If no SET/NUMBER available, find the card with HIGHEST RARITY and MOST international_prints
            // This ensures we get the complete list AND prefer special versions (e.g., MEP Promos over Common prints)
            if (!currentCard && window.allCardsDatabase) {
                const candidateCards = window.allCardsDatabase.filter(c => 
                    cardMatchesActualName(c) && c.type && c.type.trim() !== '' && c.international_prints
                );
                
                if (candidateCards.length > 0) {
                    // Sort by rarity (descending), then by number of international_prints (descending)
                    candidateCards.sort((a, b) => {
                        // First: Compare rarity (higher rarity = better)
                        const rarityDiff = getRarityRank(b.rarity) - getRarityRank(a.rarity);
                        if (rarityDiff !== 0) {
                            return rarityDiff;
                        }
                        
                        // Second: Compare number of international_prints (more prints = more complete data)
                        const aCount = (a.international_prints || '').split(',').length;
                        const bCount = (b.international_prints || '').split(',').length;
                        return bCount - aCount;
                    });
                    
                    currentCard = candidateCards[0];
                    const intPrintCount = (currentCard.international_prints || '').split(',').length;
                    devLog(`[openRaritySwitcher] Using card with HIGHEST RARITY as reference: ${currentCard.set}-${currentCard.number} (${currentCard.rarity}, ${intPrintCount} prints)`);
                } else {
                    // Fallback to any card with this name (for type detection)
                    let fallbackCard = (window.cardIndexMap && window.cardIndexMap.get(actualCardName)) || null;
                    if (!fallbackCard) {
                        fallbackCard = window.allCardsDatabase.find(c => cardMatchesActualName(c)) || null;
                    }
                    if (fallbackCard) {
                        currentCard = fallbackCard;
                        devLog(`[openRaritySwitcher] Using fallback card for type detection: ${fallbackCard.set}-${fallbackCard.number} (${fallbackCard.type})`);
                    }
                }
            }
            
            // Determine if this is a Pokemon card or Trainer/Energy card
            // Trainer/Energy types: Supporter, Item, Stadium, Tool, Energy, Special Energy, Basic Energy
            const trainerEnergyTypes = ['Supporter', 'Item', 'Stadium', 'Tool', 'Energy', 'Special Energy', 'Basic Energy'];
            const isPokemonCard = currentCard && currentCard.type && !trainerEnergyTypes.includes(currentCard.type);
            
            // Find all versions based on card type
            let versions = [];
            
            if (isPokemonCard) {
                // POKEMON CARDS: Use international_prints from Limitless "Int. Prints" table
                // This is THE definitive source - shows ALL functionally identical cards
                // regardless of artwork, illustrator, or set
                if (currentCard && currentCard.international_prints) {
                    // Build transitive closure of international_prints starting
                    // from the current card.  Two cards are "connected" when their
                    // int-print lists overlap.  This correctly groups reprints
                    // (e.g. MEP-33 ↔ MEG-77) without merging functionally
                    // different cards that happen to share the same name
                    // (e.g. Riolu ASC-112 vs Riolu PRE-50).

                    // Seed: int-prints of the current card
                    const seedIds = new Set(
                        currentCard.international_prints.split(',').map(s => s.trim()).filter(Boolean)
                    );

                    // Collect every card with the same name that has int-prints
                    const allMatchingCards = window.allCardsDatabase.filter(c => cardMatchesActualName(c) && c.international_prints);

                    // Iteratively grow the set until stable (transitive closure)
                    let changed = true;
                    while (changed) {
                        changed = false;
                        for (const c of allMatchingCards) {
                            const ids = c.international_prints.split(',').map(s => s.trim()).filter(Boolean);
                            const overlaps = ids.some(id => seedIds.has(id));
                            if (overlaps) {
                                for (const id of ids) {
                                    if (!seedIds.has(id)) {
                                        seedIds.add(id);
                                        changed = true;
                                    }
                                }
                            }
                        }
                    }

                    // Find all DB cards that belong to this closure
                    versions = window.allCardsDatabase.filter(card => {
                        const cardId = `${card.set}-${card.number}`;
                        return seedIds.has(cardId);
                    });

                    // Prefer exact/normalized name matches when available.
                    const nameMatchedVersions = versions.filter(card => cardMatchesActualName(card));
                    if (nameMatchedVersions.length > 0) {
                        versions = nameMatchedVersions;
                    }
                    
                    devLog(`[Pokemon Card] Found ${versions.length} international prints (transitive closure)`);
                    devLog(`[Pokemon Card] Closure IDs:`, [...seedIds]);
                } else {
                    // No international_prints data available - show only current card
                    versions = currentCard ? [currentCard] : [];
                    console.warn(`[Pokemon Card] No international_prints data available, showing only current version`);
                }
            } else {
                // TRAINER/ENERGY CARDS: Use name-based matching
                // All versions with same name are functionally identical (reprints)
                if (window.cardsByNameMap && window.cardsByNameMap[actualCardName]) {
                    versions = window.cardsByNameMap[actualCardName].slice();
                    devLog(`[Trainer/Energy] Found ${versions.length} reprints via name matching`);
                } else if (window.allCardsDatabase) {
                    versions = window.allCardsDatabase.filter(card => cardMatchesActualName(card));
                    devLog(`[Trainer/Energy] Found ${versions.length} reprints via direct search`);
                } else {
                    versions = currentCard ? [currentCard] : [];
                }
            }
            
            // Filter to English/international sets only.
            // Japanese-only sets (image_url contains _JP_LG) are excluded –
            // they are only useful for Deck Analysis Japan previews.
            const JAPANESE_SET_PATTERN = /\/(M[0-9]+)\//i;
            const isJapaneseCard = (card) => {
                const imgUrl = card.image_url || '';
                if (imgUrl.includes('_JP_LG.') || imgUrl.includes('/tpc/')) return true;
                if (JAPANESE_SET_PATTERN.test(imgUrl) && !imgUrl.includes('/tpci/')) return true;
                return false;
            };
            const beforeJpFilter = versions.length;
            versions = versions.filter(v => !isJapaneseCard(v));
            if (beforeJpFilter > versions.length) {
                devLog(`[openRaritySwitcher] Removed ${beforeJpFilter - versions.length} Japanese-only versions`);
            }

            if (!isPokemonCard && window.englishSetCodes && window.englishSetCodes.size > 0) {
                const beforeEnglishFilter = versions.length;
                versions = versions.filter(version => window.englishSetCodes.has(version.set));
                devLog(`[openRaritySwitcher] English filter: ${beforeEnglishFilter} → ${versions.length} versions (Trainer/Energy only)`);
            }
            
            // Filter to only show cards with COMPLETE data
            // Special handling: Pokemon cards found via international_prints are trusted (Limitless data is reliable)
            // For Trainer/Energy (name-based matching), apply lighter filter - we only need rarity + image_url
            const beforeCompleteFilter = versions.length;
            if (!isPokemonCard) {
                // TRAINER/ENERGY: Basic filter - must have rarity and image_url
                // Note: international_prints not required for Trainer/Energy (all same name = functionally identical)
                versions = versions.filter(version => {
                    const hasRarity = version.rarity && version.rarity.trim() !== '';
                    const hasImageUrl = (version.image_url && version.image_url.trim() !== '') || !!getUnifiedCardImage(version.set, version.number);
                    return hasRarity && hasImageUrl;
                });
                if (beforeCompleteFilter > versions.length) {
                    devLog(`[Trainer/Energy Filter] Filtered out ${beforeCompleteFilter - versions.length} incomplete cards`);
                    devLog(`[openRaritySwitcher] After complete data filter: ${versions.length} versions`);
                }
            } else {
                // POKEMON: Trust international_prints data from Limitless - show all versions even if rarity/image missing
                // These are functionally identical cards validated by Limitless TCG database
                devLog(`[Pokemon Filter] Showing all ${versions.length} international prints (trusted Limitless data)`);
            }
            
            if (versions.length === 0) {
                showToast(`No complete versions found for "${actualCardName}". Card may not be fully indexed yet.`, 'warning', 5000);
                console.error(`[openRaritySwitcher] No complete versions found for "${actualCardName}".`);
                return;
            }

            // Build rarity options
            const optionsList = document.getElementById('rarityOptionsList');
            if (!optionsList) {
                console.error('[openRaritySwitcher] #rarityOptionsList not found in DOM');
                showToast('Rarity switcher UI not available.', 'warning', 4000);
                return;
            }
            optionsList.innerHTML = '';

            versions.forEach(version => {
                const optionDiv = document.createElement('div');
                optionDiv.className = 'rarity-option-card';
                
                // Check if this is the current version
                const versionKey = `${actualCardName} (${version.set} ${version.number})`;
                if (safeDeckKey === versionKey) {
                    optionDiv.classList.add('selected');
                }
                
                let imageHtml = '';
                const imageUrl = getUnifiedCardImage(version.set, version.number) || version.image_url || '';

                // Collection count badge for this exact print
                const _rsCollId = `${actualCardName}|${version.set}|${version.number}`;
                const _rsOwnedQty = (window.userCollectionCounts && window.userCollectionCounts.get(_rsCollId)) || 0;
                const _rsOwnedBadge = _rsOwnedQty > 0
                    ? `<div class="card-database-owned-badge-alt">${_rsOwnedQty}×</div>`
                    : '';
                imageHtml = `<div style="position:relative;display:block;"><img src="${imageUrl}" alt="${actualCardName} - ${version.rarity}" loading="lazy">${_rsOwnedBadge}</div>`;
                
                const rarityBadgeColor = getRarityColor(version.rarity);
                
                // Get price and Cardmarket URL
                const eurPrice = version.eur_price || '';
                const cardmarketUrl = version.cardmarket_url || '';
                const priceDisplay = eurPrice || 'Preis N/A';
                const cardmarketBtnClass = eurPrice ? 'btn-cardmarket rarity-option-cardmarket' : 'btn-cardmarket rarity-option-cardmarket no-price';

                const _rsOwnedLine = _rsOwnedQty > 0
                    ? `<div class="card-database-owned-line">&#10003; ${_rsOwnedQty}x ${t('rarity.inCollection')}</div>`
                    : `<div class="card-database-not-owned-line">${t('rarity.notInCollection')}</div>`;

                let _rsOtherPrintsQty = 0;
                if (window.userCollectionCounts instanceof Map && window.userCollectionCounts.size > 0) {
                    const normalizedCurrentName = normalizeCardName(actualCardName);
                    const normalizedSet = String(version.set || '').toUpperCase();
                    const normalizedNumber = String(version.number || '').toUpperCase();
                    window.userCollectionCounts.forEach((qty, collKey) => {
                        const ownedQty = parseInt(qty, 10) || 0;
                        if (ownedQty <= 0) return;
                        const parts = String(collKey || '').split('|');
                        if (parts.length < 3) return;
                        const keyName = parts[0];
                        const keySet = String(parts[1] || '').toUpperCase();
                        const keyNumber = String(parts[2] || '').toUpperCase();
                        if (normalizeCardName(keyName) !== normalizedCurrentName) return;
                        if (keySet === normalizedSet && keyNumber === normalizedNumber) return;
                        _rsOtherPrintsQty += ownedQty;
                    });
                }
                const _rsOtherPrintLine = _rsOtherPrintsQty > 0
                    ? `<div class="card-database-other-prints-line">${t('rarity.otherPrints')}: ${_rsOtherPrintsQty}x</div>`
                    : '';

                const optionSet = String(version.set || '').toUpperCase();
                const optionNumber = String(version.number || '').toUpperCase();
                const optionDistributionKey = `${optionSet}-${optionNumber}`;
                const assignedQty = activeDistribution.distribution.get(optionDistributionKey) || 0;
                const safeOptionCardName = escapeJsStr(actualCardName);
                
                optionDiv.innerHTML = `
                    ${imageHtml}
                    <div class="rarity-option-info">
                        <div><strong>${version.set} ${version.number}</strong></div>
                        <div class="rarity-option-rarity">Rarity: ${version.rarity || 'N/A'}</div>
                        ${_rsOwnedLine}
                        ${_rsOtherPrintLine}
                    </div>
                    <div class="rarity-option-qty-wrap">
                        <label class="rarity-option-qty-label">Deck Qty</label>
                        <input
                            type="number"
                            class="rarity-option-qty-input"
                            min="0"
                            max="60"
                            step="1"
                            value="${assignedQty}"
                            data-set="${optionSet}"
                            data-number="${optionNumber}"
                            onclick="event.stopPropagation();"
                            oninput="this.value = Math.max(0, Math.min(60, parseInt(this.value || '0', 10) || 0));"
                        >
                    </div>
                    <div class="rarity-badge" style="--rarity-badge-bg: ${rarityBadgeColor};">
                        ${version.rarity || 'Unknown'}
                    </div>
                    <button class="btn btn-primary rarity-option-swap-all-btn"
                            onclick="event.stopPropagation(); selectRarityVersion('${optionSet}', '${optionNumber}', '${escapeJsStr(safeDeckKey)}', '${safeOptionCardName}', '${escapeJsStr((currentRaritySwitcherCard && currentRaritySwitcherCard.source) || '')}')"
                            title="${t('rarity.swapAll')}">
                        ${t('rarity.swapAll')}
                    </button>
                    ${cardmarketUrl ? `
                        <button class="${cardmarketBtnClass} card-database-price-btn" 
                                onclick="event.stopPropagation(); openCardmarket('${cardmarketUrl}', '');" 
                                title="${t('rarity.buyCardmarket')} ${priceDisplay}">
                            ${priceDisplay}
                        </button>
                    ` : ''}
                `;
                
                optionsList.appendChild(optionDiv);
            });

            const controlsHost = document.getElementById('raritySwitcherDistributionControls');
            const totalCopies = currentRaritySwitcherCard.totalCopies || 0;
            const controlsHtml = `
                <div class="rarity-switcher-modal-buttons" id="raritySwitcherDistributionControls">
                    <div class="rarity-distribution-summary">${t('rarity.deckCopies')}: <strong>${totalCopies}</strong>. ${t('rarity.sumMustMatch')}</div>
                    <button class="btn btn-primary" onclick="applyRarityDistribution()">Apply Quantities</button>
                    <button class="btn btn-secondary" onclick="closeRaritySwitcher()">Close</button>
                </div>
            `;
            if (controlsHost) {
                controlsHost.outerHTML = controlsHtml;
            } else {
                optionsList.insertAdjacentHTML('afterend', controlsHtml);
            }

            document.getElementById('raritySwitcherTitle').textContent = `${actualCardName} - Rarity Switcher`;
            const modal = document.getElementById('raritySwitcherModal');
            if (!modal) {
                console.error('[openRaritySwitcher] #raritySwitcherModal not found in DOM');
                showToast('Rarity switcher modal not available.', 'warning', 4000);
                return;
            }
            modal.classList.add('show');
        }

        async function selectRarityVersion(setCode, setNumber, oldDeckKey, cardName, sourceHint = '') {
            const match = String(oldDeckKey || '').match(/^(.+?)\s*\(/);
            const actualCardName = cardName || (match ? match[1] : oldDeckKey);
            const newKey = `${actualCardName} (${setCode} ${setNumber})`;
            const normalizedActualName = normalizeCardName(actualCardName);

            const profileDeckId = (currentRaritySwitcherCard && currentRaritySwitcherCard.profileDeckId)
                || ((String(sourceHint || '').startsWith('profile|')) ? String(sourceHint).slice('profile|'.length) : '');
            if (profileDeckId) {
                const profileDeck = (window.userDecks || []).find(d => String(d && d.id) === String(profileDeckId));
                const profileCards = profileDeck && profileDeck.cards && typeof profileDeck.cards === 'object'
                    ? profileDeck.cards
                    : null;

                if (!profileDeck || !profileCards) {
                    showToast(t('cardsDb.savedDeckLoadError'), 'warning');
                    closeRaritySwitcher();
                    return;
                }

                let resolvedOldKey = '';
                let resolvedCount = 0;

                const preOldKey = currentRaritySwitcherCard && currentRaritySwitcherCard.resolvedOldKey;
                if (preOldKey) {
                    const preCount = parseInt(profileCards[preOldKey], 10) || 0;
                    if (preCount > 0) {
                        resolvedOldKey = preOldKey;
                        resolvedCount = preCount;
                    }
                }

                if (!resolvedOldKey) {
                    const directCount = parseInt(profileCards[oldDeckKey], 10) || 0;
                    if (directCount > 0) {
                        resolvedOldKey = oldDeckKey;
                        resolvedCount = directCount;
                    }
                }

                if (!resolvedOldKey) {
                    for (const [key, qty] of Object.entries(profileCards)) {
                        const keyQty = parseInt(qty, 10) || 0;
                        if (keyQty <= 0) continue;
                        const keyMatch = String(key).match(/^(.+?)\s*\(/);
                        const keyName = keyMatch ? keyMatch[1] : key;
                        if (normalizeCardName(keyName) === normalizedActualName) {
                            resolvedOldKey = key;
                            resolvedCount = keyQty;
                            break;
                        }
                    }
                }

                if (!resolvedOldKey || resolvedCount <= 0) {
                    showToast(t('cardsDb.cardNotInSavedDeck'), 'warning');
                    closeRaritySwitcher();
                    return;
                }

                delete profileCards[resolvedOldKey];
                profileCards[newKey] = (parseInt(profileCards[newKey], 10) || 0) + resolvedCount;

                const totalCards = Object.values(profileCards).reduce((sum, qty) => sum + (parseInt(qty, 10) || 0), 0);
                const updatedProfileDeck = {
                    ...profileDeck,
                    cards: profileCards,
                    totalCards
                };

                setRarityPreference(actualCardName, { mode: 'specific', set: setCode, number: setNumber });

                if (typeof saveDeck === 'function') {
                    await saveDeck(updatedProfileDeck);
                } else {
                    throw new Error('saveDeck function is not available');
                }

                if (typeof updateDecksUI === 'function') {
                    updateDecksUI();
                }

                closeRaritySwitcher();
                return;
            }

            const deckContexts = {
                cityLeague: { deck: window.cityLeagueDeck || {}, orderKey: 'cityLeagueDeckOrder' },
                currentMeta: { deck: window.currentMetaDeck || {}, orderKey: 'currentMetaDeckOrder' },
                pastMeta: { deck: window.pastMetaDeck || {}, orderKey: 'pastMetaDeckOrder' }
            };

            const orderedSources = [];
            if (sourceHint && deckContexts[sourceHint]) orderedSources.push(sourceHint);
            ['cityLeague', 'currentMeta', 'pastMeta'].forEach(src => {
                if (!orderedSources.includes(src)) orderedSources.push(src);
            });

            let resolvedSource = '';
            let resolvedOldKey = '';
            let resolvedCount = 0;

            if (currentRaritySwitcherCard) {
                const preSource = currentRaritySwitcherCard.source || '';
                const preOldKey = currentRaritySwitcherCard.resolvedOldKey || '';
                if (preSource && deckContexts[preSource]) {
                    const preDeck = deckContexts[preSource].deck;
                    const preCount = parseInt(preDeck[preOldKey], 10) || 0;
                    if (preCount > 0) {
                        resolvedSource = preSource;
                        resolvedOldKey = preOldKey;
                        resolvedCount = preCount;
                    }
                }
            }

            for (const source of orderedSources) {
                if (resolvedCount > 0) break;
                const ctx = deckContexts[source];
                const deck = ctx.deck;
                if (!deck || typeof deck !== 'object') continue;

                const directCount = parseInt(deck[oldDeckKey], 10) || 0;
                if (directCount > 0) {
                    resolvedSource = source;
                    resolvedOldKey = oldDeckKey;
                    resolvedCount = directCount;
                    break;
                }

                // Fallback: find matching card-name key in that deck.
                for (const [key, qty] of Object.entries(deck)) {
                    const keyQty = parseInt(qty, 10) || 0;
                    if (keyQty <= 0) continue;
                    const keyMatch = String(key).match(/^(.+?)\s*\(/);
                    const keyName = keyMatch ? keyMatch[1] : key;
                    if (normalizeCardName(keyName) === normalizedActualName) {
                        resolvedSource = source;
                        resolvedOldKey = key;
                        resolvedCount = keyQty;
                        break;
                    }
                }
                if (resolvedCount > 0) break;
            }

            if (!resolvedSource || resolvedCount <= 0) {
                devWarn('[RaritySwitch][select] replacement failed - card not found in deck', {
                    setCode,
                    setNumber,
                    oldDeckKey,
                    actualCardName,
                    sourceHint,
                    preResolved: currentRaritySwitcherCard || null
                });
                showToast(t('cardsDb.cardNotInCurrentDeck'), 'warning');
                closeRaritySwitcher();
                return;
            }

            const ctx = deckContexts[resolvedSource];
            const deck = ctx.deck;
            delete deck[resolvedOldKey];
            deck[newKey] = (parseInt(deck[newKey], 10) || 0) + resolvedCount;

            const order = Array.isArray(window[ctx.orderKey]) ? window[ctx.orderKey] : [];
            const oldKeyIndex = order.indexOf(resolvedOldKey);
            if (oldKeyIndex !== -1) {
                order[oldKeyIndex] = newKey;
            } else if (!order.includes(newKey)) {
                order.push(newKey);
            }
            // De-duplicate order entries after replacement.
            window[ctx.orderKey] = order.filter((value, index, arr) => arr.indexOf(value) === index);

            // Save preference and refresh complete deck UI/persistence.
            setRarityPreference(actualCardName, { mode: 'specific', set: setCode, number: setNumber });
            devLog('[RaritySwitch][select] replacement success', {
                source: resolvedSource,
                oldKey: resolvedOldKey,
                newKey,
                movedCount: resolvedCount
            });
            updateDeckDisplay(resolvedSource);

            closeRaritySwitcher();
        }

        async function applyRarityDistribution() {
            if (!currentRaritySwitcherCard) {
                showToast('No active rarity selection.', 'warning');
                return;
            }

            const cardName = currentRaritySwitcherCard.cardName || '';
            const expectedTotal = parseInt(currentRaritySwitcherCard.totalCopies, 10) || 0;
            if (expectedTotal <= 0) {
                showToast('Card is not present in the active deck.', 'warning');
                return;
            }

            const qtyInputs = Array.from(document.querySelectorAll('#rarityOptionsList .rarity-option-qty-input'));
            if (qtyInputs.length === 0) {
                showToast('No print options available.', 'warning');
                return;
            }

            const desiredEntries = [];
            let desiredTotal = 0;
            qtyInputs.forEach(input => {
                const setCode = String(input.dataset.set || '').toUpperCase();
                const setNumber = String(input.dataset.number || '').toUpperCase();
                const qty = Math.max(0, parseInt(input.value || '0', 10) || 0);
                if (!setCode || !setNumber || qty <= 0) return;
                desiredEntries.push({ setCode, setNumber, qty, key: `${cardName} (${setCode} ${setNumber})` });
                desiredTotal += qty;
            });

            if (desiredTotal !== expectedTotal) {
                showToast(`Total qty must be ${expectedTotal} (currently ${desiredTotal}).`, 'warning', 4500);
                return;
            }

            const deckContext = getRaritySwitcherDeckContext(
                currentRaritySwitcherCard.source,
                currentRaritySwitcherCard.profileDeckId
            );
            if (!deckContext || !deckContext.deck) {
                showToast('Unable to resolve active deck.', 'warning');
                return;
            }

            const wantedName = normalizeCardName(cardName);
            const keysToRemove = Object.keys(deckContext.deck).filter(key => {
                const keyMatch = String(key).match(/^(.+?)\s*\(/);
                const keyName = keyMatch ? keyMatch[1] : key;
                return normalizeCardName(keyName) === wantedName;
            });

            keysToRemove.forEach(key => delete deckContext.deck[key]);
            desiredEntries.forEach(entry => {
                deckContext.deck[entry.key] = entry.qty;
            });

            if (deckContext.type === 'profile') {
                const profileDeck = deckContext.profileDeck;
                const updatedProfileDeck = {
                    ...profileDeck,
                    cards: deckContext.deck,
                    totalCards: Object.values(deckContext.deck).reduce((sum, qty) => sum + (parseInt(qty, 10) || 0), 0)
                };
                if (typeof saveDeck === 'function') {
                    await saveDeck(updatedProfileDeck);
                }
                if (typeof updateDecksUI === 'function') {
                    updateDecksUI();
                }
            } else {
                const order = Array.isArray(window[deckContext.orderKey]) ? window[deckContext.orderKey] : [];
                const cleanedOrder = order.filter(key => {
                    const keyMatch = String(key).match(/^(.+?)\s*\(/);
                    const keyName = keyMatch ? keyMatch[1] : key;
                    return normalizeCardName(keyName) !== wantedName;
                });
                desiredEntries.forEach(entry => cleanedOrder.push(entry.key));
                window[deckContext.orderKey] = cleanedOrder;
                updateDeckDisplay(deckContext.source);
            }

            const firstPrint = desiredEntries[0];
            if (firstPrint) {
                setRarityPreference(cardName, { mode: 'specific', set: firstPrint.setCode, number: firstPrint.setNumber });
            }

            showToast('Print quantities updated.', 'success');
            closeRaritySwitcher();
        }

        function closeRaritySwitcher() {
            const modal = document.getElementById('raritySwitcherModal');
            modal.classList.remove('show');
            currentRaritySwitcherCard = null;
        }

        // Explicit exports for inline onclick handlers across all tabs.
        window.openRaritySwitcher = openRaritySwitcher;
        window.closeRaritySwitcher = closeRaritySwitcher;
        window.selectRarityVersion = selectRarityVersion;
        window.applyRarityDistribution = applyRarityDistribution;
        window.openRaritySwitcherFromDB = openRaritySwitcherFromDB;
        
        // Add ESC key handler for Rarity Switcher
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                const modal = document.getElementById('raritySwitcherModal');
                if (modal && modal.classList.contains('show')) {
                    closeRaritySwitcher();
                }
            }
        });

        // ── Global click-outside-to-close for overlay modals ───────────
        window.addEventListener('click', function(e) {
            const target = e.target;
            // Rarity Switcher Modal
            const rarityModal = document.getElementById('raritySwitcherModal');
            if (rarityModal && target === rarityModal && rarityModal.classList.contains('show')) {
                closeRaritySwitcher();
                return;
            }
            // Fullscreen Card Modal
            const fsModal = document.getElementById('fullscreenCardModal');
            if (fsModal && target === fsModal && fsModal.classList.contains('active')) {
                closeFullscreenCard();
                return;
            }
            // Image View Modal
            const imgModal = document.getElementById('imageViewModal');
            if (imgModal && target === imgModal && !imgModal.classList.contains('d-none')) {
                if (typeof closeImageView === 'function') closeImageView();
                return;
            }
            // Deck Compare Modal
            const dcModal = document.getElementById('deckCompareModal');
            if (dcModal && target === dcModal && dcModal.style.display !== 'none') {
                if (typeof closeDeckCompare === 'function') closeDeckCompare();
                return;
            }
        });

        function showImageView(imageUrl, cardName) {
            // Delegate to showSingleCard so users always see the action panel
            if (typeof showSingleCard === 'function') {
                showSingleCard(imageUrl, cardName);
                return;
            }
            const modal = document.getElementById('fullscreenCardModal');
            const img = document.getElementById('fullscreenCardImage');
            
            if (!modal || !img) {
                console.error('Fullscreen modal elements not found');
                return;
            }
            
            img.src = imageUrl;
            img.alt = cardName;
            modal.classList.add('active');
            
            // Close on ESC key
            const escapeHandler = (e) => {
                if (e.key === 'Escape') {
                    closeFullscreenCard();
                    document.removeEventListener('keydown', escapeHandler);
                }
            };
            document.addEventListener('keydown', escapeHandler);
        }

        function closeFullscreenCard() {
            const modal = document.getElementById('fullscreenCardModal');
            if (modal) {
                modal.classList.remove('active');
            }
        }

        function openCardmarket(cardmarketUrl, cardName) {
            if (!cardmarketUrl || cardmarketUrl.trim() === '') {
                showToast(`Cardmarket link not available for ${cardName}`, 'warning');
                return;
            }
            
            // Strip Limitless tracking params, add German seller + EN/DE language filter
            const cleanUrl = cardmarketUrl.split('?')[0];
            window.open(cleanUrl + '?sellerCountry=7&language=1,3', '_blank');
        }

        function openLimitlessCard(setCode, setNumber) {
            if (!setCode || !setNumber) return;
            // Map promo set codes to Limitless format
            const limitlessSetMap = {
                'SVP': 'PR-SV', 'SVPEN': 'PR-SV',
                'SWSHP': 'PR-SW', 'SWP': 'PR-SW',
                'SMP': 'PR-SM', 'SMPRO': 'PR-SM',
                'XYP': 'PR-XY', 'BWP': 'PR-BW'
            };
            const mappedSet = limitlessSetMap[setCode.toUpperCase()] || setCode;
            const url = `https://limitlesstcg.com/cards/${encodeURIComponent(mappedSet)}/${encodeURIComponent(setNumber)}`;
            window.open(url, '_blank');
        }

        function getRarityColor(rarity) {
            const colors = {
                'Common': '#A0A0A0',
                'Uncommon': '#6B8E23',
                'Rare': '#DAA520',
                'Holo Rare': '#FFD700',
                'Double Rare': '#FF6B9D',
                'Double Rare Holo': '#FF1493',
                'Secret Rare': '#8B008B',
                'Secret Rare Gold': '#FF8C00'
            };
            return colors[rarity] || '#CCCCCC';
        }

        function getRarityRank(rarity) {
            // Higher number = rarer/more valuable
            const rarityHierarchy = {
                'Common': 1,
                'Uncommon': 2,
                'Rare': 3,
                'Holo Rare': 4,
                'Rare Holo': 4,
                'Radiant Rare': 5,
                'Art Rare': 6,
                'Illustration Rare': 6,
                'Double Rare': 7,
                'Ultra Rare': 8,
                'Shiny Rare': 9,
                'Special Illustration Rare': 10,
                'Hyper Rare': 11,
                'Secret Rare': 12,
                'Secret Rare Gold': 13,
                'Promo': 14  // Promo highest priority for MEP cards
            };
            return rarityHierarchy[rarity] || 0;
        }

        function hideAppLoadingOverlay() {
            const overlay = document.getElementById('loadingOverlay')
                || document.getElementById('loading-overlay')
                || document.getElementById('appLoadingOverlay')
                || document.getElementById('app-loading');
            if (overlay) {
                overlay.remove();
            }

            const spinnerSelectors = [
                '.loading-spinner',
                '.spinner',
                '.spinning',
                '[data-loading-spinner="true"]'
            ];
            document.querySelectorAll(spinnerSelectors.join(',')).forEach(el => {
                el.remove();
            });
        }

        function runAppLoadingWatchdog(delayMs = 25000) {
            window.setTimeout(() => {
                const staleSelectors = [
                    '#loadingOverlay',
                    '#loading-overlay',
                    '#appLoadingOverlay',
                    '#app-loading',
                    '.loading-spinner',
                    '.spinner',
                    '.spinning',
                    '[data-loading-spinner="true"]'
                ];

                const staleNodes = Array.from(document.querySelectorAll(staleSelectors.join(',')));

                // Catch custom loaders that still animate infinitely even without standard class names.
                const infiniteAnimatedNodes = Array.from(document.querySelectorAll('body *')).filter(el => {
                    const style = window.getComputedStyle(el);
                    const iterations = style.animationIterationCount || '';
                    const animationName = (style.animationName || '').toLowerCase();
                    if (!animationName || animationName === 'none') return false;
                    return iterations === 'infinite' && animationName.includes('spin');
                });

                const nodesToRemove = new Set([...staleNodes, ...infiniteAnimatedNodes]);
                if (nodesToRemove.size > 0) {
                    nodesToRemove.forEach(node => node.remove());
                    devLog(`[Init] Loading watchdog removed ${nodesToRemove.size} stale loading node(s).`);
                }
            }, delayMs);
        }

        // Initialize