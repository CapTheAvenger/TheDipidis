// app-past-meta.js — extracted from app.js
// Part of Hausi's Pokemon TCG Analysis

        // ====================================
        // PAST META - Deck Analysis & Builder
        // ====================================
        
        let pastMetaAllData = [];
        let pastMetaDecks = [];
        let pastMetaTournaments = [];
        let pastMetaCurrentDeck = null;
        let pastMetaCurrentCards = [];
        let pastMetaFilteredCards = [];
        let pastMetaCurrentScope = null;
        let pastMetaRarityMode = 'min'; // 'min', 'max', 'all'
        let pastMetaShowGridView = true; // Default: Grid View

        function sanitizePastMetaArchetypeName(value) {
            const raw = String(value || '').trim();
            if (!raw) return 'Unknown Deck';

            // Remove trailing price artifacts such as "58.60$41.80€" from scraped deck labels.
            return raw
                .replace(/\s*\d+[.,]\d+\$\d+[.,]\d+€\s*$/u, '')
                .replace(/\s*\d+[.,]\d+€\s*$/u, '')
                .trim() || 'Unknown Deck';
        }

        function resetSelectWithPlaceholder(selectEl, placeholderText, placeholderValue) {
            if (!selectEl) return;
            selectEl.innerHTML = '';
            const placeholderOption = document.createElement('option');
            placeholderOption.value = placeholderValue;
            placeholderOption.textContent = placeholderText;
            selectEl.appendChild(placeholderOption);
        }

        function parsePastMetaNumber(value, fallback = 0) {
            if (value === null || value === undefined || value === '') return fallback;
            const raw = String(value).trim();
            if (!raw) return fallback;
            const normalized = raw.includes(',') && !raw.includes('.')
                ? raw.replace(',', '.')
                : raw;
            const parsed = Number.parseFloat(normalized);
            return Number.isFinite(parsed) ? parsed : fallback;
        }

        function normalizeCardAggregationKey(name) {
            if (typeof normalizeCardName === 'function') {
                return normalizeCardName(name);
            }

            return String(name || '')
                .toLowerCase()
                .replace(/[\u2019'`]/g, '')
                .replace(/\s+/g, ' ')
                .trim();
        }

        function parsePastMetaDateMs(dateValue) {
            if (!dateValue) return 0;
            const raw = String(dateValue).trim();
            if (!raw) return 0;

            const direct = new Date(raw);
            if (!Number.isNaN(direct.getTime())) {
                return direct.getTime();
            }

            const cleaned = raw.replace(/(\d+)(st|nd|rd|th)/gi, '$1');
            const fallback = new Date(cleaned);
            if (!Number.isNaN(fallback.getTime())) {
                return fallback.getTime();
            }

            return 0;
        }

        function getPastMetaSortScore(metaName, setOrderMap, latestDateMap) {
            const normalizedMeta = String(metaName || '').trim().toUpperCase();
            if (!normalizedMeta) return 0;

            const parts = normalizedMeta.split('-').map(p => p.trim()).filter(Boolean);
            const firstSet = parts[0] || '';
            const lastSet = parts[parts.length - 1] || '';
            const firstOrder = setOrderMap[firstSet] || 0;
            const lastOrder = setOrderMap[lastSet] || 0;
            const dateMs = latestDateMap.get(String(metaName || '').trim()) || 0;

            // Primary sort by ending-set recency (e.g. SVI-ASC > SVI-PFL), fallback by latest tournament date.
            if (lastOrder > 0 || firstOrder > 0) {
                return (lastOrder * 1000000) + (firstOrder * 1000) + Math.floor(dateMs / 1000000000);
            }

            return dateMs;
        }

        function derivePastMetaLabelFromSetCode(setCode, setOrderMap) {
            const code = String(setCode || '').trim().toUpperCase();
            if (!code) return '';
            const mapped = mapSetCodeToMetaFormat(code);
            return mapped || code;
        }

        function getPastMetaDeckTournamentKey(deck) {
            const tournamentId = String(deck?.tournament_id || '').trim();
            const tournamentName = String(deck?.tournament_name || '').trim();
            const tournamentDate = String(deck?.tournament_date || '').trim();
            const format = String(deck?.format || '').trim();

            if (tournamentId) return `id:${tournamentId}`;
            if (tournamentName && tournamentDate) return `${format}|||${tournamentDate}|||${tournamentName}`;
            if (tournamentDate) return `${format}|||${tournamentDate}`;
            if (tournamentName) return `${format}|||${tournamentName}`;
            return format || 'unknown';
        }

        function getPastMetaRepresentativeCardCopies(card) {
            const avgOverall = parsePastMetaNumber(card?.card_count ?? card?.average_count_overall, 0);
            const maxCount = parseInt(card?.max_count || 0, 10) || 0;
            const deckCount = parseInt(card?.deck_count || card?.deck_inclusion_count || 0, 10) || 0;

            if (!pastMetaCurrentScope || pastMetaCurrentScope.totalDecklists <= 1) {
                return maxCount;
            }

            if (avgOverall > 0) {
                return avgOverall;
            }

            if (deckCount > 0) {
                return 1;
            }

            return maxCount;
        }

        function getPastMetaDisplayCount(card) {
            const representativeCopies = getPastMetaRepresentativeCardCopies(card);
            const maxCount = parseInt(card?.max_count || 0, 10) || 0;

            if (!pastMetaCurrentScope || pastMetaCurrentScope.totalDecklists <= 1) {
                return maxCount;
            }

            if (representativeCopies > 0) {
                return Math.max(1, Math.round(representativeCopies));
            }

            return maxCount;
        }

        function getPastMetaSummaryTotalCount(cards) {
            if (!Array.isArray(cards) || cards.length === 0) return 0;

            // Sum the rounded display counts so the total matches what the user
            // sees on each individual card badge.
            return cards.reduce((sum, card) => sum + getPastMetaDisplayCount(card), 0);
        }
        
        async function loadPastMeta() {
          try {
            devLog('Loading Past Meta Deck Analysis...');
            const pastMetaGrid = document.getElementById('pastMetaDeckGrid');
            if (pastMetaGrid && !pastMetaGrid.innerHTML.trim()) {
                showTableSkeleton(pastMetaGrid, { rows: 6, cols: 4, withImage: true });
            }
            showToast('Loading Past Meta data...', 'info');
            
            // Phase 1: Load lightweight overview CSV (24KB) for tournament/format dropdowns
            const tournamentOverview = await loadCSV('tournament_cards_data_overview.csv');
            
            // Store tournament overview data — exclude Expanded (only Standard is scraped)
            pastMetaTournaments = (tournamentOverview || []).filter(t => String(t.format || '').trim().toLowerCase() !== 'expanded');

            // Build tournament lookup index (by date) for fast matching later
            const tournamentsByDate = new Map();
            pastMetaTournaments.forEach(t => {
                const date = String(t.tournament_date || '').trim();
                if (!date) return;
                if (!tournamentsByDate.has(date)) tournamentsByDate.set(date, []);
                tournamentsByDate.get(date).push(t);
            });

            // Load dynamic set order map for proper meta sorting (newest -> oldest)
            let pastMetaSetOrderMap = {};
            try {
                const ts = Date.now();
                const setOrderResponse = await fetch(`./data/sets.json?t=${ts}`);
                if (setOrderResponse.ok) {
                    const json = await setOrderResponse.json();
                    if (json && typeof json === 'object') {
                        pastMetaSetOrderMap = json;
                    }
                }
            } catch (e) {
                console.warn('[Past Meta] Could not load sets.json for format sorting, using date fallback.', e);
            }
            // Store for later use in lazy card loading
            window._pastMetaSetOrderMap = pastMetaSetOrderMap;
            window._pastMetaTournamentsByDate = tournamentsByDate;

            // Phase 2: Load manifest for lazy per-format chunk loading
            let pastMetaManifest = null;
            try {
                const manifestResp = await fetch(BASE_PATH + 'tournament_cards_manifest.json?t=' + Date.now());
                if (manifestResp.ok) pastMetaManifest = await manifestResp.json();
            } catch (e) { /* ignore */ }
            window._pastMetaManifest = pastMetaManifest;
            window._pastMetaLoadedChunks = new Set();

            // Populate Format Filter from manifest meta_keys (no full data load yet)
            const formatSelect = document.getElementById('pastMetaFormatFilter');
            resetSelectWithPlaceholder(formatSelect, '-- All Formats --', 'all');
            let defaultFormat = 'all';

            if (pastMetaManifest && Array.isArray(pastMetaManifest.meta_keys) && pastMetaManifest.meta_keys.length > 0) {
                const sortedKeys = [...pastMetaManifest.meta_keys].sort((a, b) => {
                    const scoreA = getPastMetaSortScore(a, pastMetaSetOrderMap, new Map());
                    const scoreB = getPastMetaSortScore(b, pastMetaSetOrderMap, new Map());
                    if (scoreA !== scoreB) return scoreB - scoreA;
                    return a.localeCompare(b);
                });
                sortedKeys.forEach(key => {
                    const option = document.createElement('option');
                    option.value = key;
                    option.textContent = key;
                    formatSelect.appendChild(option);
                });
                // Default to newest format for fast initial load (~17MB instead of ~100MB)
                defaultFormat = sortedKeys[0];
                formatSelect.value = defaultFormat;
            }

            // Load only the selected format's chunk (lazy)
            pastMetaDecks = [];
            await _loadPastMetaChunksIfNeeded(defaultFormat, pastMetaSetOrderMap, tournamentsByDate);

            if (pastMetaDecks.length === 0) {
                showToast('No past tournament data found', 'error');
                console.error('[Past Meta] No decks found in tournament CSV');
                return;
            }
            
            // Populate Tournament Filter (will be updated dynamically)
            const tournamentSelect = document.getElementById('pastMetaTournamentFilter');
            
            // Setup event listeners - Format filter triggers lazy chunk load + update
            formatSelect.addEventListener('change', async () => {
                const format = formatSelect.value;
                await _loadPastMetaChunksIfNeeded(format, window._pastMetaSetOrderMap, window._pastMetaTournamentsByDate);
                updatePastMetaTournamentFilter();
                updatePastMetaDeckList();
            });
            tournamentSelect.addEventListener('change', updatePastMetaDeckList);
            document.getElementById('pastMetaDeckSelect').addEventListener('change', onPastMetaDeckSelect);
            document.getElementById('pastMetaFilterSelect').addEventListener('change', filterPastMetaCards);
            
            // Initial population
            updatePastMetaTournamentFilter();
            updatePastMetaDeckList();
            
            // Initialize rarity mode button styling
            setPastMetaRarityMode('min');
            
            const tournamentCount = [...new Set(pastMetaDecks.map(d => d.tournament_id))].length;
            devLog(`Loaded ${pastMetaDecks.length} decks from ${tournamentCount} tournaments (lazy card loading)`);
            showToast(`Past Meta: ${pastMetaDecks.length} decks loaded`, 'success');
            window.pastMetaLoaded = true;
          } catch (err) {
            console.error('[Past Meta] loadPastMeta failed:', err);
            showToast('Error loading Past Meta: ' + (err.message || err), 'error');
          }
        }
        
        // Lazy-load tournament chunks for a specific format (or all formats).
        // Appends new decks to pastMetaDecks without duplicating already-loaded data.
        async function _loadPastMetaChunksIfNeeded(format, setOrderMap, tournamentsByDate) {
            const manifest = window._pastMetaManifest;
            const loaded = window._pastMetaLoadedChunks || new Set();

            if (!manifest || !Array.isArray(manifest.chunks)) {
                // No manifest — fall back to full monolith load (once)
                if (!loaded.has('__all__')) {
                    const deckIndex = await streamPastMetaDeckIndex(setOrderMap, tournamentsByDate);
                    pastMetaDecks = Array.from(deckIndex.values());
                    loaded.add('__all__');
                }
                return;
            }

            let chunksToLoad = [];
            if (format === 'all') {
                manifest.meta_keys.forEach((key, i) => {
                    if (!loaded.has(key)) chunksToLoad.push({ key, file: manifest.chunks[i] });
                });
            } else {
                const idx = manifest.meta_keys.indexOf(format);
                if (idx >= 0 && !loaded.has(format)) {
                    chunksToLoad.push({ key: format, file: manifest.chunks[idx] });
                }
            }

            if (chunksToLoad.length === 0) return; // Already loaded

            const chunkUrls = chunksToLoad.map(c => BASE_PATH + c.file);
            devLog(`[Past Meta] Lazy-loading ${chunkUrls.length} chunk(s) for format: ${format}`);
            const deckIndex = await streamPastMetaDeckIndex(setOrderMap, tournamentsByDate, chunkUrls);
            const newDecks = Array.from(deckIndex.values());
            pastMetaDecks = pastMetaDecks.concat(newDecks);

            chunksToLoad.forEach(c => loaded.add(c.key));
            window._pastMetaLoadedChunks = loaded;
            devLog(`[Past Meta] Now ${pastMetaDecks.length} total decks loaded (${loaded.size} chunks)`);
        }

        // Stream-parse the large cards CSV to build the deck index AND store cards per deck.
        // Uses PapaParse streaming so PapaParse never holds all 429k rows internally.
        // Prefers chunked files via tournament_cards_manifest.json when available.
        // Optional chunkUrls: array of specific chunk URLs to load (for lazy per-format loading).
        function streamPastMetaDeckIndex(setOrderMap, tournamentsByDate, chunkUrls) {
            return new Promise(async (resolve, reject) => {
                const deckMap = new Map();
                const inferredMeta = new Map(); // deckKey → newest set code

                // Shared row handler (same logic for monolith and chunks)
                function processRow(card) {
                    if (!card) return;
                    
                    const meta = String(card.meta || '').trim();
                    if (meta.toLowerCase() === 'expanded') return;
                    
                    const rawArchetype = String(card.archetype || '').trim();
                    const deckArchetype = sanitizePastMetaArchetypeName(rawArchetype);
                    if (!deckArchetype || deckArchetype === 'Unknown Deck') return;
                    
                    const tournamentDate = String(card.tournament_date || '').trim() || 'Unknown Date';
                    const cardTournamentId = String(card.tournament_id || '').trim();
                    const cardTournamentName = String(card.tournament_name || '').trim();
                    const setCode = String(card.set_code || '').trim().toUpperCase();
                    
                    // Infer format from newest set code
                    const deckPeriodKey = cardTournamentId || tournamentDate;
                    const metaLookupKey = `${deckPeriodKey}|||${rawArchetype}`;
                    if (setCode) {
                        const nextOrder = setOrderMap[setCode] || 0;
                        const currentCode = inferredMeta.get(metaLookupKey);
                        const currentOrder = currentCode ? (setOrderMap[currentCode] || 0) : -1;
                        if (nextOrder > currentOrder) {
                            inferredMeta.set(metaLookupKey, setCode);
                        }
                    }
                    
                    // Match tournament from overview (indexed by date)
                    const candidates = tournamentsByDate.get(tournamentDate) || [];
                    let tournament = null;
                    if (candidates.length === 1) {
                        tournament = candidates[0];
                    } else if (candidates.length > 1) {
                        tournament = candidates.find(t => {
                            const overviewFormat = String(t.format || '').trim();
                            return !meta || !overviewFormat || overviewFormat === meta;
                        }) || null;
                    }
                    
                    const inferredMetaSetCode = inferredMeta.get(metaLookupKey) || '';
                    const inferredMetaLabel = derivePastMetaLabelFromSetCode(inferredMetaSetCode, setOrderMap);
                    
                    const resolvedFormat = meta
                        || String((tournament && tournament.format) || '').trim()
                        || inferredMetaLabel
                        || 'Unknown';
                    const resolvedTournamentId = cardTournamentId || String((tournament && tournament.tournament_id) || '').trim() || tournamentDate;
                    const resolvedTournamentName = cardTournamentName || String((tournament && tournament.tournament_name) || '').trim() || tournamentDate;
                    const deckKey = `${resolvedFormat}|||${resolvedTournamentId}|||${deckArchetype}`;
                    
                    if (!deckMap.has(deckKey)) {
                        deckMap.set(deckKey, {
                            key: deckKey,
                            tournament_id: resolvedTournamentId,
                            tournament_name: resolvedTournamentName,
                            tournament_date: tournamentDate,
                            deck_name: deckArchetype,
                            archetype: deckArchetype,
                            format: resolvedFormat,
                            decklist_count: parseInt(card.total_decks_in_archetype || 1),
                            _rawArchetypes: new Set([rawArchetype]),
                            cards: []
                        });
                    } else {
                        const existing = deckMap.get(deckKey);
                        const rowDecklistCount = parseInt(card.total_decks_in_archetype || 1);
                        existing.decklist_count = Math.max(existing.decklist_count, rowDecklistCount);
                        existing._rawArchetypes.add(rawArchetype);
                    }
                    
                    // Store card data directly in the deck
                    deckMap.get(deckKey).cards.push({
                        ...card,
                        total_count: parsePastMetaNumber(card.total_count, 0),
                        card_count: parsePastMetaNumber(card.average_count_overall, 0),
                        average_count: parsePastMetaNumber(card.average_count, 0),
                        average_count_overall: parsePastMetaNumber(card.average_count_overall, 0),
                        percentage_in_archetype: parsePastMetaNumber(card.percentage_in_archetype, 0),
                        decklist_count: parseInt(card.total_decks_in_archetype || 1, 10) || 1,
                        deck_count: parseInt(card.deck_inclusion_count || card.deck_count || 0, 10) || 0,
                        deck_inclusion_count: parseInt(card.deck_inclusion_count || card.deck_count || 0, 10) || 0
                    });
                }

                function finalize() {
                    deckMap.forEach(deck => {
                        if (deck._rawArchetypes && deck._rawArchetypes.size > deck.decklist_count) {
                            deck.decklist_count = deck._rawArchetypes.size;
                        }
                        delete deck._rawArchetypes;
                    });
                    devLog(`[Past Meta] Streamed deck index: ${deckMap.size} unique decks`);
                    resolve(deckMap);
                }

                // Helper: stream-parse a single CSV file
                function streamFile(url) {
                    return new Promise((res, rej) => {
                        Papa.parse(url, {
                            download: true,
                            header: true,
                            delimiter: ';',
                            worker: false,
                            skipEmptyLines: true,
                            step: function(result) { processRow(result.data); },
                            complete: function() { res(); },
                            error: function(err) { rej(err); }
                        });
                    });
                }

                try {
                    if (chunkUrls && chunkUrls.length > 0) {
                        // Lazy: load only the specified chunk files
                        devLog(`[Past Meta] Loading ${chunkUrls.length} specified chunk(s)`);
                        for (const url of chunkUrls) {
                            await streamFile(url);
                        }
                    } else {
                        // Full load: try chunked loading via manifest, else monolith
                        let useChunks = false;
                        try {
                            const manifestResp = await fetch(BASE_PATH + 'tournament_cards_manifest.json');
                            if (manifestResp.ok) {
                                const manifest = await manifestResp.json();
                                if (manifest && Array.isArray(manifest.chunks) && manifest.chunks.length > 0) {
                                    devLog(`[Past Meta] Loading ${manifest.chunks.length} tournament chunks`);
                                    for (const chunkFile of manifest.chunks) {
                                        await streamFile(BASE_PATH + chunkFile);
                                    }
                                    useChunks = true;
                                }
                            }
                        } catch (e) {
                            console.warn('[Past Meta] Manifest not available, using monolith:', e);
                        }

                        // Fallback: stream the single monolith file
                        if (!useChunks) {
                            await streamFile(BASE_PATH + 'tournament_cards_data_cards.csv');
                        }
                    }

                    finalize();
                } catch (err) {
                    console.error('[Past Meta] Stream parse error:', err);
                    reject(err);
                }
            });
        }
        
        function updatePastMetaTournamentFilter() {
            const formatFilter = document.getElementById('pastMetaFormatFilter').value;
            const tournamentSelect = document.getElementById('pastMetaTournamentFilter');
            const previousSelection = tournamentSelect ? tournamentSelect.value : 'all';
            
            // Filter decks by selected format to get relevant tournaments
            let filteredDecks = pastMetaDecks;
            if (formatFilter !== 'all') {
                filteredDecks = pastMetaDecks.filter(deck => deck.format === formatFilter);
            }
            
            // Get unique tournament IDs from filtered decks
            const tournamentIds = [...new Set(filteredDecks.map(d => d.tournament_id))];
            
            // Get tournament details from pastMetaTournaments
            const tournaments = tournamentIds
                .map(id => pastMetaTournaments.find(t => t.tournament_id === id))
                .filter(t => t) // Remove undefined entries
                .sort((a, b) => {
                    // Sort by date (newest first); use parser that handles "14th March 2026" ordinal format
                    const dateA = parsePastMetaDateMs(a.tournament_date);
                    const dateB = parsePastMetaDateMs(b.tournament_date);
                    return dateB - dateA;
                });
            
            // Rebuild tournament filter dropdown
            resetSelectWithPlaceholder(tournamentSelect, '-- All Tournaments --', 'all');
            tournaments.forEach(tournament => {
                // Clean tournament name: remove " - Limitless"
                let cleanName = tournament.tournament_name.replace(/\s*[-|•]\s*Limitless\s*$/i, '');
                const option = document.createElement('option');
                option.value = String(tournament.tournament_id || '');
                option.textContent = cleanName;
                tournamentSelect.appendChild(option);
            });

            if (tournamentSelect) {
                const canRestore = Array.from(tournamentSelect.options).some(opt => opt.value === previousSelection);
                tournamentSelect.value = canRestore ? previousSelection : 'all';
            }
            
            devLog(`[Past Meta] Tournament filter updated: ${tournaments.length} tournaments for format ${formatFilter}`);
        }
        
        function updatePastMetaDeckList() {
            const formatFilter = document.getElementById('pastMetaFormatFilter').value;
            const tournamentFilter = document.getElementById('pastMetaTournamentFilter').value;
            const deckSelect = document.getElementById('pastMetaDeckSelect');
            const previousSelection = deckSelect ? deckSelect.value : '';
            
            // Filter decks
            let filteredDecks = pastMetaDecks.filter(deck => {
                const matchesFormat = formatFilter === 'all' || deck.format === formatFilter;
                const matchesTournament = tournamentFilter === 'all' || deck.tournament_id === tournamentFilter;
                return matchesFormat && matchesTournament;
            });
            
            // Group by archetype (deck_name) to merge across tournaments
            const archetypeMap = new Map();
            filteredDecks.forEach(deck => {
                const archetype = deck.deck_name || 'Unknown';
                if (!archetypeMap.has(archetype)) {
                    archetypeMap.set(archetype, {
                        archetype: archetype,
                        tournaments: [],
                        totalDecklists: 0
                    });
                }
                const entry = archetypeMap.get(archetype);
                entry.tournaments.push(deck);
                entry.totalDecklists += (deck.decklist_count || 0);
            });
            
            // Convert to array and sort by archetype name
            const archetypes = Array.from(archetypeMap.values());
            archetypes.sort((a, b) => a.archetype.localeCompare(b.archetype));
            
            // Populate deck select dropdown
            resetSelectWithPlaceholder(deckSelect, typeof t === 'function' ? t('currentMeta.selectDeck') : '-- Select a Deck --', '');
            
            archetypes.forEach(entry => {
                const tournamentCount = entry.tournaments.length;
                const displayName = tournamentCount > 1 
                    ? `${entry.archetype} (${tournamentCount} Tournaments)`
                    : entry.archetype;
                const option = document.createElement('option');
                option.value = entry.archetype;
                option.textContent = displayName;
                deckSelect.appendChild(option);
            });

            if (deckSelect) {
                const canRestore = Array.from(deckSelect.options).some(opt => opt.value === previousSelection);
                if (canRestore) {
                    deckSelect.value = previousSelection;
                } else if (deckSelect.options.length > 1) {
                    deckSelect.value = deckSelect.options[1].value;
                } else {
                    deckSelect.value = '';
                }

                if (deckSelect.value) {
                    onPastMetaDeckSelect();
                } else {
                    pastMetaCurrentDeck = null;
                    pastMetaCurrentCards = [];
                    pastMetaFilteredCards = [];
                    renderPastMetaCards();
                }
            }
            
            devLog(`Filtered to ${archetypes.length} unique archetypes from ${filteredDecks.length} tournament entries`);

            // Convert native <select> to custom searchable dropdown
            if (deckSelect && typeof initSearchableSelect === 'function') initSearchableSelect(deckSelect);
        }
        
        function onPastMetaDeckSelect() {
            const selectedArchetype = document.getElementById('pastMetaDeckSelect').value;
            
            if (!selectedArchetype) {
                // Hide stats and cards
                document.getElementById('pastMetaStatsSection').classList.add('d-none');
                document.getElementById('pastMetaDeckTableView').classList.add('d-none');
                document.getElementById('pastMetaDeckVisual').classList.add('d-none');
                pastMetaCurrentDeck = null;
                pastMetaCurrentCards = [];
                pastMetaFilteredCards = [];
                pastMetaCurrentScope = null;
                resetDeckOverviewCounts('pastMetaCardCount', 'pastMetaCardCountSummary', '0 Cards', '/ 0 Total');
                renderNoDeckSelectedState('pastMetaDeckGrid', 'Bitte waehle ein Deck aus dem Dropdown, um die Karten zu laden');
                return;
            }
            
            // Async wrapper for lazy card loading
            _loadPastMetaDeckCards(selectedArchetype);
        }
        
        async function _loadPastMetaDeckCards(selectedArchetype) {
          try {
            
            const formatFilter = document.getElementById('pastMetaFormatFilter').value;
            const tournamentFilter = document.getElementById('pastMetaTournamentFilter').value;
            
            // Find all decks with matching archetype (respecting current filters)
            const matchingDecks = pastMetaDecks.filter(deck => {
                const matchesArchetype = deck.deck_name === selectedArchetype;
                const matchesFormat = formatFilter === 'all' || deck.format === formatFilter;
                const matchesTournament = tournamentFilter === 'all' || deck.tournament_id === tournamentFilter;
                return matchesArchetype && matchesFormat && matchesTournament;
            });
            
            if (matchingDecks.length === 0) {
                console.error('No matching decks found for archetype:', selectedArchetype);
                return;
            }

            const uniqueTournamentKeys = new Set(matchingDecks.map(deck => getPastMetaDeckTournamentKey(deck)));
            const uniqueTournamentCount = uniqueTournamentKeys.size;
            
            // Aggregate cards across all matching decks (same statistical pipeline as City/Global)
            const selectedRows = [];
            let totalDecklists = 0;
            const tournamentNames = [];
            
            matchingDecks.forEach(deck => {
                totalDecklists += (deck.decklist_count || 0);
                
                // Track tournament names for stats display
                const cleanTournamentName = (deck.tournament_name || '').replace(/\s*[-|•]\s*Limitless\s*$/i, '');
                if (!tournamentNames.includes(cleanTournamentName)) {
                    tournamentNames.push(cleanTournamentName);
                }
                
                // Collect rows for unified aggregation (cards stored during initial stream)
                deck.cards.forEach(card => {
                    selectedRows.push({
                        ...card,
                        archetype: deck.deck_name || card.archetype || '',
                        tournament_id: deck.tournament_id || '',
                        tournament_date: deck.tournament_date || card.tournament_date || 'Unknown Date',
                        total_decks_in_archetype: deck.decklist_count || card.total_decks_in_archetype || 1,
                        deck_count: card.deck_count || card.deck_inclusion_count || 0,
                        deck_inclusion_count: card.deck_inclusion_count || card.deck_count || 0,
                        total_count: card.total_count || 0,
                        max_count: card.max_count || 0
                    });
                });
            });

            // Preserve raw per-tournament rows for Recency scoring in Consistency builder
            window.pastMetaRawDeckCards = selectedRows.slice();

            const aggregatedCardsRaw = aggregateCardStatsByDate(selectedRows).map(card => ({
                ...card,
                card_count: parsePastMetaNumber(card.average_count_overall, 0),
                decklist_count: parseInt(card.total_decks_in_archetype || totalDecklists || 1, 10) || 1,
                deck_inclusion_count: parseInt(card.deck_inclusion_count || card.deck_count || 0, 10) || 0,
                deck_count: parseInt(card.deck_count || card.deck_inclusion_count || 0, 10) || 0,
                max_count: parseInt(card.max_count || 0, 10) || 0
            }));
            const aggregatedCards = deduplicateCards(aggregatedCardsRaw);
            pastMetaCurrentScope = {
                format: formatFilter,
                tournamentFilter,
                totalDecklists,
                uniqueTournamentCount,
                selectedDeckEntryCount: matchingDecks.length,
                multiTournament: uniqueTournamentCount > 1
            };
            
            // Create a virtual deck object for the aggregated data
            pastMetaCurrentDeck = {
                deck_name: selectedArchetype,
                archetype: selectedArchetype,
                format: formatFilter === 'all' ? 'Multi-Format' : formatFilter,
                tournament_name: tournamentNames.join(', '),
                tournament_count: uniqueTournamentCount,
                decklist_count: totalDecklists,
                cards: aggregatedCards
            };
            
            pastMetaCurrentCards = aggregatedCards;
            
            // Update stats
            document.getElementById('pastMetaStatsSection').classList.remove('d-none');
            const totalCards = getPastMetaSummaryTotalCount(aggregatedCards);
            document.getElementById('pastMetaStatCards').textContent = `${aggregatedCards.length} / ${Math.round(totalCards)}`;
            
            // Show tournament info based on count
            if (uniqueTournamentCount === 1) {
                const cleanName = tournamentNames[0];
                document.getElementById('pastMetaStatTournament').textContent = `${cleanName} (${totalDecklists} decklists)`;
            } else {
                document.getElementById('pastMetaStatTournament').textContent = `${uniqueTournamentCount} Tournaments (${totalDecklists} total decklists)`;
            }
            
            document.getElementById('pastMetaStatFormat').textContent = pastMetaCurrentDeck.format;
            
            // Save to window for deck builder
            window.pastMetaCurrentArchetype = selectedArchetype;
            
            // Apply filters and render
            filterPastMetaCards();
            
            devLog(`Selected archetype: ${selectedArchetype} (${aggregatedCards.length} unique cards across ${uniqueTournamentCount} tournaments, ${totalDecklists} total decklists)`);
          } catch (err) {
            console.error('[Past Meta] Error loading deck cards:', err);
            showToast('Error loading deck: ' + (err.message || err), 'error');
          }
        }
        
        function filterPastMetaCards() {
            if (!pastMetaCurrentCards || pastMetaCurrentCards.length === 0) {
                pastMetaFilteredCards = [];
                renderPastMetaCards();
                return;
            }
            
            const filterValue = document.getElementById('pastMetaFilterSelect').value;

            // Apply share-threshold where share data exists, and include top Ace Specs by filter level.
            pastMetaFilteredCards = applyShareFilterWithAceSpecBoost(pastMetaCurrentCards, filterValue);
            
            renderPastMetaCards();
        }
        
        function renderPastMetaCards() {
            if (!pastMetaFilteredCards || pastMetaFilteredCards.length === 0) {
                document.getElementById('pastMetaDeckTableView').classList.add('d-none');
                document.getElementById('pastMetaDeckVisual').classList.add('d-none');
                resetDeckOverviewCounts('pastMetaCardCount', 'pastMetaCardCountSummary', '0 Cards', '/ 0 Total');
                const gridContainer = document.getElementById('pastMetaDeckGrid');
                if (gridContainer) {
                    const selectedArchetype = String(document.getElementById('pastMetaDeckSelect')?.value || '').trim();
                    if (!selectedArchetype) {
                        renderNoDeckSelectedState('pastMetaDeckGrid', 'Bitte waehle ein Deck aus dem Dropdown, um die Karten zu laden');
                    } else {
                        gridContainer.innerHTML = getEmptyStateBoxHtml({ title: 'No cards found', description: 'No cards match the current filters.', icon: 'cards' });
                    }
                }
                return;
            }
            
            const searchTerm = document.getElementById('pastMetaOverviewSearch').value.toLowerCase();
            
            // Apply search filter
            let cardsToShow = pastMetaFilteredCards.filter(card => {
                if (!searchTerm) return true;
                const cardName = (card.full_card_name || card.card_name || '').toLowerCase();
                return cardName.includes(searchTerm);
            });
            
            // Sort cards (Pokemon, Trainer, Energy)
            const sortedCards = sortCardsByType(cardsToShow);
            
            // Update counts
            const totalCards = getPastMetaSummaryTotalCount(sortedCards);
            document.getElementById('pastMetaCardCount').textContent = `${sortedCards.length} Cards`;
            document.getElementById('pastMetaCardCountSummary').textContent = `/ ${Math.round(totalCards)} Total`;
            
            // Render based on view mode
            if (pastMetaShowGridView) {
                renderPastMetaGridView(sortedCards);
            } else {
                renderPastMetaTableView(sortedCards);
            }
        }
        
        function renderPastMetaTableView(cards) {
            document.getElementById('pastMetaDeckTableView').classList.remove('d-none');
            document.getElementById('pastMetaDeckVisual').classList.add('d-none');
            
            const tableContainer = document.getElementById('pastMetaDeckTable');
            
            if (cards.length === 0) {
                tableContainer.innerHTML = getEmptyStateBoxHtml({ title: typeof t === 'function' ? t('currentMeta.noCards') : 'No cards found', description: typeof t === 'function' ? t('currentMeta.selectDeckHint') : 'Select a deck to see its card breakdown.', icon: 'cards' });
                return;
            }
            
            let html = '<thead><tr>';
            html += '<th style="width: 60px;">Count</th>';
            html += '<th>Card Name</th>';
            html += '<th style="width: 100px;">ACE SPEC</th>';
            html += '<th style="width: 120px;">Action</th>';
            html += '</tr></thead><tbody>';
            
            cards.forEach(card => {
                const cardName = card.full_card_name || card.card_name || 'Unknown Card';
                const count = getPastMetaDisplayCount(card);
                const isAceSpecCard = isAceSpec(cardName);
                const proxySetCode = card.set_code || card.set || '';
                const proxySetNumber = card.set_number || card.number || '';
                
                html += '<tr>';
                html += `<td style="text-align: center; font-weight: bold; color: #2c3e50;">${count}</td>`;
                html += `<td>${cardName}</td>`;
                html += `<td style="text-align: center;">${isAceSpecCard ? '<span style="color: #e74c3c; font-weight: bold;">★</span>' : '-'}</td>`;
                html += `<td style="text-align: center; display:flex; gap:6px; justify-content:center;"><button class="btn btn-primary" onclick='addCardToDeck("pastMeta", "${escapeJsStr(cardName)}");' style="padding: 6px 12px; font-size: 0.85em;">+ Add</button><button class="btn" style="padding: 6px 10px; font-size: 0.8em; background:#e74c3c; color:white;" onclick='addCardToProxy("${escapeJsStr(cardName)}", "${proxySetCode}", "${proxySetNumber}", 1)'>Proxy</button></td>`;
                html += '</tr>';
            });
            
            html += '</tbody>';
            tableContainer.innerHTML = `<div class="past-meta-table-scroll"><table class="past-meta-table-zebra">${html}</table></div>`;
        }
        
        function renderPastMetaGridView(cards) {
            devLog(`[Past Meta] renderPastMetaGridView called with ${cards.length} cards, rarity mode: ${pastMetaRarityMode}`);
            document.getElementById('pastMetaDeckTableView').classList.add('d-none');
            document.getElementById('pastMetaDeckVisual').classList.remove('d-none');
            
            const gridContainer = document.getElementById('pastMetaDeckGrid');
            
            if (cards.length === 0) {
                gridContainer.innerHTML = '<p style="text-align: center; color: #444; padding: 20px; font-weight: 500;">No cards found</p>';
                return;
            }
            
            // Sort cards by type for better organization
            const sortedCards = sortCardsByType([...cards]);
            
            // Get current deck to show deck counts
            const currentDeck = window.pastMetaDeck || {};
            
            const cardHtmls = [];
            
            sortedCards.forEach(card => {
                const cardFullName = fixMojibake(card.full_card_name || card.card_name || 'Unknown Card');
                const cardNameEscaped = escapeJsStr(cardFullName);
                const avgCount = parseFloat(String(card.card_count || card.average_count_overall || 0).replace(',', '.')) || 0; // Average count across all decklists (e.g., 0.98)
                const maxCount = getPastMetaDisplayCount(card);
                const decklistCount = parseFloat(String(card.decklist_count || card.total_decks_in_archetype || 0).replace(',', '.')) || 0; // Total decklists in archetype
                const deckCountByStats = parseFloat(String(card.deck_count || card.deck_inclusion_count || 0).replace(',', '.')) || 0; // Number of decks containing this card
                
                // Prefer explicit CSV fields first; only parse from full_card_name as fallback.
                let cardName = cardFullName;
                let setCodeFromName = String(card.set_code || card.set || '').trim().toUpperCase();
                let setNumberFromName = String(card.set_number || card.number || '').trim();

                if ((!setCodeFromName || !setNumberFromName) && card.card_identifier) {
                    const identifierMatch = String(card.card_identifier).trim().match(/^([A-Z0-9]{2,6})\s+([A-Z0-9-]+)$/i);
                    if (identifierMatch) {
                        if (!setCodeFromName) setCodeFromName = identifierMatch[1].toUpperCase();
                        if (!setNumberFromName) setNumberFromName = identifierMatch[2];
                    }
                }
                
                // Match pattern: "Card Name SET NUMBER" (e.g., "Abra MEG 54", "Dragapult ex TWM 130")
                if (!setCodeFromName || !setNumberFromName) {
                    const cardMatch = cardFullName.match(/^(.+?)\s+([A-Z0-9]{2,4})\s+([A-Z0-9]+)$/);
                    if (cardMatch) {
                        cardName = cardMatch[1].trim();
                        setCodeFromName = cardMatch[2];
                        setNumberFromName = cardMatch[3];
                        devLog(`[Past Meta] Parsed card: "${cardFullName}" -> name: "${cardName}", set: "${setCodeFromName}", number: "${setNumberFromName}"`);
                    }
                }
                const rawCardName = cardName;
                cardName = getDisplayCardName(cardName, setCodeFromName, setNumberFromName);
                
                // Calculate statistics
                const rawPercentage = parseFloat(String(card.percentage_in_archetype || card.share_percent || '').replace(',', '.'));
                const avgInUsingDecksRaw = parseFloat(String(card.average_count || card.avg_count || '').replace(',', '.'));

                const resolvedPercentage = Number.isFinite(rawPercentage) && rawPercentage > 0
                    ? rawPercentage
                    : (decklistCount > 0 ? ((deckCountByStats / decklistCount) * 100) : 0);
                const avgInUsingDecksValue = Number.isFinite(avgInUsingDecksRaw) && avgInUsingDecksRaw > 0
                    ? avgInUsingDecksRaw
                    : (deckCountByStats > 0 ? (avgCount * decklistCount / deckCountByStats) : 0);

                const percentage = Math.max(0, resolvedPercentage).toFixed(1).replace('.', ',');
                const avgInUsingDecks = Math.max(0, avgInUsingDecksValue).toFixed(2).replace('.', ',');
                const avgCountOverallDisplay = Math.max(0, avgCount).toFixed(2).replace('.', ',');
                const deckCountByStatsDisplay = Math.round(Math.max(0, deckCountByStats));
                const decklistCountDisplay = Math.round(Math.max(0, decklistCount));
                
                // O(1) lookup: canonical set+number first, then robust name index
                const cardInDb = (() => {
                    if (setCodeFromName && setNumberFromName) {
                        const bySetNumber = getCanonicalCardRecord(setCodeFromName, setNumberFromName);
                        if (bySetNumber) return bySetNumber;
                    }
                    return getCardByNameFromIndex(cardName);
                })();
                
                if (cardInDb) {
                    devLog(`[Past Meta] ? Found in DB: ${cardName} -> ${cardInDb.set} ${cardInDb.number}, image: ${cardInDb.image_url ? 'YES' : 'NO'}`);
                } else {
                    devLog(`[Past Meta] ? NOT found in DB: ${cardName} (searched: set="${setCodeFromName}", number="${setNumberFromName}")`);
                }
                
                // Apply rarity mode to determine which versions to show
                let versionsToRender = [];
                
                devLog(`[Past Meta] Applying rarity mode "${pastMetaRarityMode}" for card: ${cardName}`);
                
                if (pastMetaRarityMode === 'all' && cardInDb) {
                    // Show ALL international prints
                    let allVersions = getInternationalPrintsForCard(cardInDb.set, cardInDb.number);
                    devLog(`[Past Meta] ALL mode: found ${allVersions ? allVersions.length : 0} versions`);
                    
                    if (allVersions && allVersions.length > 0) {
                        versionsToRender = allVersions.map(v => ({
                            ...card,
                            set_code: v.set,
                            set_number: v.number,
                            image_url: v.image_url,
                            rarity: v.rarity
                        }));
                    } else {
                        // No versions found, use original
                        versionsToRender = [{ ...card, set_code: cardInDb?.set || '', set_number: cardInDb?.number || '', image_url: cardInDb?.image_url || '' }];
                    }
                } else if (cardInDb) {
                    // 'min' or 'max' mode: Get preferred version
                    // CRITICAL FIX: Set global rarity preference to match Past Meta mode
                    const previousGlobalPref = globalRarityPreference;
                    globalRarityPreference = pastMetaRarityMode; // Temporarily set global to match Past Meta
                    
                    const preferredVersion = getPreferredVersionForCard(cardName, cardInDb.set, cardInDb.number);
                    devLog(`[Past Meta] MIN/MAX mode: preferred version:`, preferredVersion);
                    
                    globalRarityPreference = previousGlobalPref; // Restore global preference
                    
                    if (preferredVersion) {
                        versionsToRender = [{
                            ...card,
                            set_code: preferredVersion.set,
                            set_number: preferredVersion.number,
                            image_url: preferredVersion.image_url,
                            rarity: preferredVersion.rarity
                        }];
                    } else {
                        // No preferred version, use original
                        versionsToRender = [{ ...card, set_code: cardInDb.set, set_number: cardInDb.number, image_url: cardInDb.image_url }];
                    }
                } else {
                    // Card not found in database, use placeholder
                    devLog(`[Past Meta] Card not in DB - using placeholder`);
                    versionsToRender = [{ ...card, set_code: '', set_number: '', image_url: '' }];
                }
                
                // Render each version
                versionsToRender.forEach(displayCard => {
                    const setCode = displayCard.set_code || '';
                    const setNumber = displayCard.set_number || '';
                    const cardNameWarning = getNameWarningHtml(rawCardName, cardName, setCode, setNumber);
                    let germanCardName = (displayCard.name_de || (cardInDb && cardInDb.name_de) || card.card_name_de || '').toLowerCase();
                    
                    const imageUrl = getBestCardImage({
                        ...displayCard,
                        set_code: setCode,
                        set_number: setNumber,
                        card_name: cardName
                    }) || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22280%22%3E%3Crect width=%22200%22 height=%22280%22 fill=%22%23333%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23999%22 font-size=%2218%22%3ENo Image%3C/text%3E%3C/svg%3E';
                    
                    // Check if card is in deck builder
                    let deckCount = 0;
                    if (Object.keys(currentDeck).length > 0 && setCode && setNumber) {
                        // Match by set code + set number
                        for (const deckKey in currentDeck) {
                            const match = deckKey.match(/\(([A-Z0-9]+)\s+([A-Z0-9]+)\)$/);
                            if (match) {
                                const deckSetCode = match[1];
                                const deckSetNumber = match[2];
                                
                                if (deckSetCode === setCode && deckSetNumber === setNumber) {
                                    deckCount = currentDeck[deckKey] || 0;
                                    break;
                                }
                            }
                        }
                    } else if (Object.keys(currentDeck).length > 0 && !setCode && !setNumber) {
                        // Fallback: exact card name match
                        deckCount = currentDeck[cardName] || 0;
                    }
                    
                    // Get price and Cardmarket URL
                    let eurPrice = '';
                    let cardmarketUrl = '';
                    if (setCode && setNumber) {
                        let priceCard = (cardsBySetNumberMap || {})[`${setCode}-${setNumber}`] || null;
                        if (!priceCard) {
                            const normalizedNumber = setNumber.replace(/^0+/, '') || '0';
                            priceCard = (cardsBySetNumberMap || {})[`${setCode}-${normalizedNumber}`] || null;
                        }
                        
                        if (priceCard) {
                            eurPrice = priceCard.eur_price || '';
                            cardmarketUrl = priceCard.cardmarket_url || '';
                            if (priceCard.name_de) {
                                germanCardName = String(priceCard.name_de).toLowerCase();
                            }
                        }
                    }
                    const priceDisplay = eurPrice || '0,00€';
                    const priceBackground = eurPrice ? 'linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)' : 'linear-gradient(135deg, #777 0%, #999 100%)';
                    const cardmarketUrlEscaped = escapeJsStr(cardmarketUrl || '');
                    
                    // Determine card type for filtering with database-based approach
                    const filterCategory = getCardType(cardName, setCode, setNumber);
                    const germanCardNameEscaped = germanCardName.replace(/"/g, '&quot;');
                    
                    // Collection badge
                    const otherPrintOwnedCount = getOtherInternationalPrintOwnedCount(setCode, setNumber);
                    const otherPrintSparkleHtml = otherPrintOwnedCount > 0
                        ? `<div class="city-league-other-print-sparkle${deckCount > 0 ? ' city-league-other-print-sparkle-hasdeck' : ''}" title="Owned other INT prints: ${otherPrintOwnedCount}x">
                            <span class="city-league-other-print-sparkle-icon"></span>
                            <span class="city-league-other-print-sparkle-count">${otherPrintOwnedCount}</span>
                        </div>`
                        : '';
                    
                    cardHtmls.push(`
                        <div class="card-item city-league-card-item" data-card-name="${cardName.toLowerCase()}" data-card-name-de="${germanCardNameEscaped}" data-card-set="${setCode.toLowerCase()}" data-card-number="${setNumber.toLowerCase()}" data-card-type="${filterCategory}">
                            <div class="card-image-container city-league-card-image-container">
                                <img src="${imageUrl}" alt="${cardName}" loading="lazy" referrerpolicy="no-referrer" class="city-league-card-image" onerror="handleCardImageError(this, '${setCode}', '${setNumber}')" onclick="if (typeof event !== 'undefined' && event) event.stopPropagation(); showSingleCard(this.src, '${cardNameEscaped} (${setCode} ${setNumber})');">
                                <div class="city-league-card-badge city-league-card-badge-max">${maxCount}</div>
                                ${typeof getWishlistBadgeHtml === 'function' ? getWishlistBadgeHtml(cardName, setCode, setNumber) : ''}
                                ${deckCount > 0 ? `<div class="city-league-card-badge city-league-card-badge-deck">${deckCount}</div>` : ''}
                                ${otherPrintSparkleHtml}
                                <div class="card-info-bottom city-league-card-info-bottom">
                                    <div class="card-info-text city-league-card-info-text">
                                        <div class="city-league-card-title-mobile">${cardName}${cardNameWarning}</div>
                                        <div class="city-league-card-set-mobile">${setCode} ${setNumber}</div>
                                        <div class="city-league-card-stats-mobile">${percentage}% | Ø ${avgInUsingDecks}x (${avgCountOverallDisplay}x)</div>
                                        <div class="city-league-card-deck-stats-mobile">${deckCountByStatsDisplay} / ${decklistCountDisplay} Decks</div>
                                    </div>
                                    <div class="card-action-buttons city-league-card-action-buttons">
                                        <div class="city-league-card-action-row">
                                            <button class="city-league-card-action-btn city-league-card-remove-btn" onclick="event.stopPropagation(); removeCardFromDeck('pastMeta', '${cardNameEscaped}')" title="${t('cl.removeFromDeck')}">-</button>
                                            <button class="city-league-card-action-btn city-league-card-rarity-btn" onclick="event.stopPropagation(); openRaritySwitcher('${cardNameEscaped}', '${cardNameEscaped} (${setCode} ${setNumber})')" title="${t('cl.switchPrint')}">★</button>
                                            <button class="city-league-card-action-btn city-league-card-add-btn" onclick="event.stopPropagation(); addCardToDeck('pastMeta', '${cardNameEscaped}', '${setCode}', '${setNumber}')" title="${t('cl.addToDeckTooltip')}">+</button>
                                        </div>
                                        <div class="city-league-card-action-row">
                                            ${setCode && setNumber ? `<button class="city-league-card-action-btn city-league-card-limitless-btn" onclick="event.stopPropagation(); openLimitlessCard('${setCode}', '${setNumber}')" title="${t('cl.openLimitless')}">L</button>` : '<span></span>'}
                                            <button class="city-league-card-action-btn city-league-card-proxy-btn" onclick="event.stopPropagation(); addCardToProxy('${cardNameEscaped}', '${setCode}', '${setNumber}', 1)" title="${t('cl.proxyTooltip')}">P</button>
                                            <button class="city-league-card-action-btn city-league-card-market-btn" onclick="event.stopPropagation(); openCardmarket('${cardmarketUrlEscaped}', '${cardNameEscaped}')" data-market-bg="${priceBackground}" data-market-cursor="${eurPrice ? 'pointer' : 'not-allowed'}" title="${eurPrice ? t('cl.buyCardmarket') + ' ' + eurPrice : t('cl.priceNA')}">${priceDisplay}</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                `);
                }); // End of versionsToRender.forEach
            }); // End of cards.forEach
            
            // Progressive batch rendering: show first cards instantly, load rest in background
            // Increment generation counter to cancel any in-flight batch from a previous render call
            const renderGen = ++_pastMetaRenderGen;
            const BATCH_SIZE = 12;
            gridContainer.innerHTML = cardHtmls.slice(0, BATCH_SIZE).join('');
            if (cardHtmls.length > BATCH_SIZE) {
                let offset = BATCH_SIZE;
                (function renderNextBatch() {
                    if (renderGen !== _pastMetaRenderGen) return; // stale render — abort
                    if (offset >= cardHtmls.length) return;
                    const batch = cardHtmls.slice(offset, offset + BATCH_SIZE);
                    gridContainer.insertAdjacentHTML('beforeend', batch.join(''));
                    offset += BATCH_SIZE;
                    requestAnimationFrame(renderNextBatch);
                })();
            }
        }
        
        function filterPastMetaOverviewCards() {
            const searchInput = document.getElementById('pastMetaOverviewSearch');
            if (!searchInput) return;
            
            const searchTerm = searchInput.value.toLowerCase().trim();
            const gridContainer = document.getElementById('pastMetaDeckGrid');
            if (!gridContainer) return;
            
            const cards = gridContainer.querySelectorAll('.card-item');
            let visibleCount = 0;
            
            cards.forEach(card => {
                const cardName = card.getAttribute('data-card-name') || '';
                const cardNameDe = card.getAttribute('data-card-name-de') || '';
                const cardType = card.getAttribute('data-card-type') || '';
                const cardSet = card.getAttribute('data-card-set') || '';
                const cardNumber = card.getAttribute('data-card-number') || '';

                // Check search term filter (name, set+number)
                const setNumSpace = `${cardSet} ${cardNumber}`;
                const setNumCombined = `${cardSet}${cardNumber}`;
                const matchesSearch = searchTerm === '' ||
                    cardName.includes(searchTerm) ||
                    cardNameDe.includes(searchTerm) ||
                    setNumSpace.includes(searchTerm) ||
                    setNumCombined.includes(searchTerm);

                const matchesType = pastMetaOverviewCardTypeFilter === 'all' || cardType === pastMetaOverviewCardTypeFilter
                    || (pastMetaOverviewCardTypeFilter === 'Energy' && cardType === 'Basic Energy');
                
                // Show card only if it matches both filters
                if (matchesSearch && matchesType) {
                    card.classList.remove('d-none');
                    visibleCount++;
                } else {
                    card.classList.add('d-none');
                }
            });
            
            // Update card count
            const countElement = document.getElementById('pastMetaCardCount');
            if (countElement) {
                countElement.textContent = `${visibleCount} Cards`;
            }
        }
        
        function setPastMetaRarityMode(mode) {
            devLog(`[Past Meta] Rarity mode changed to: ${mode}`);
            pastMetaRarityMode = mode;
            
            // Sync global rarity preference so getPreferredVersionForCard() uses the correct mode
            globalRarityPreference = (mode === 'all') ? null : mode;
            
            // Update button styles
            const minBtn = document.getElementById('pastMetaRarityMin');
            const maxBtn = document.getElementById('pastMetaRarityMax');
            const allBtn = document.getElementById('pastMetaRarityAll');
            
            if (minBtn) {
                minBtn.classList.remove('btn-active', 'btn-inactive');
                minBtn.classList.add(mode === 'min' ? 'btn-active' : 'btn-inactive');
            }
            if (maxBtn) {
                maxBtn.classList.remove('btn-active', 'btn-inactive');
                maxBtn.classList.add(mode === 'max' ? 'btn-active' : 'btn-inactive');
            }
            if (allBtn) {
                allBtn.classList.remove('btn-active', 'btn-inactive');
                allBtn.classList.add(mode === 'all' ? 'btn-active' : 'btn-inactive');
            }
            
            // Re-render
            renderPastMetaCards();
        }
        
        function togglePastMetaDeckGridView() {
            const gridViewContainer = document.getElementById('pastMetaDeckVisual');
            const tableViewContainer = document.getElementById('pastMetaDeckTableView');
            const gridButtons = document.querySelectorAll('button[onclick*="togglePastMetaDeckGridView"]');
            const button = gridButtons[0];
            
            if (!gridViewContainer || !tableViewContainer) {
                console.warn('[WARN] Grid or table container not found');
                return;
            }
            
            if (!pastMetaCurrentCards || pastMetaCurrentCards.length === 0) {
                showToast(typeof t === 'function' ? t('currentMeta.selectDeckFirst') : 'Please select a deck first!', 'warning');
                return;
            }
            
            // Toggle between views
            pastMetaShowGridView = !pastMetaShowGridView;
            
            if (pastMetaShowGridView) {
                if (button) button.textContent = 'List View';
            } else {
                if (button) button.textContent = 'Grid View';
            }
            
            // Re-render with new view
            renderPastMetaCards();
            
            // Re-apply search filter
            filterPastMetaOverviewCards();
        }
        
        function copyPastMetaDeckOverview() {
            if (!pastMetaFilteredCards || pastMetaFilteredCards.length === 0) {
                showToast('No cards available to copy', 'warning');
                return;
            }
            
            let deckText = '';
            pastMetaFilteredCards.forEach(card => {
                const cardName = card.full_card_name || card.card_name || 'Unknown Card';
                const count = Math.round(parseFloat(card.card_count) || 0);
                deckText += `${count} ${cardName}\n`;
            });
            
            navigator.clipboard.writeText(deckText).then(() => {
                showToast('Deck list copied!', 'success');
            }).catch(err => {
                console.error('Failed to copy:', err);
                showToast('Error copying', 'error');
            });
        }
        
        // (removed duplicate togglePastMetaDeckGridView — full version above)

        // Generic function to render deck analysis tables