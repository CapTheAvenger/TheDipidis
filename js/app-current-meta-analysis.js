// app-current-meta-analysis.js — extracted from app.js
// Part of Hausi's Pokemon TCG Analysis

        // CURRENT META DECK ANALYSIS - Complete Implementation
        // ========================================================================
        
        // Current Meta Global Variables
        let currentMetaFormatFilter = 'all'; // 'all', 'live', 'play'
        let currentMetaRarityMode = 'min'; // 'min', 'max', 'all'
        let currentMetaGlobalRarityPreference = 'min';
        let currentMetaTournamentStartDate = null; // Date object from settings start_date

        // Parse "14th March 2026" style dates into Date objects
        function parseEnglishTournamentDate(str) {
            if (!str) return null;
            const d = new Date(String(str).replace(/(\d+)(st|nd|rd|th)/, '$1'));
            return isNaN(d.getTime()) ? null : d;
        }

        // Parse DD.MM.YYYY from settings into Date object
        function parseDDMMYYYY(str) {
            if (!str) return null;
            const parts = String(str).split('.');
            if (parts.length !== 3) return null;
            const d = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
            return isNaN(d.getTime()) ? null : d;
        }

        // Load tournament start date from settings (called once during init)
        async function loadCurrentMetaTournamentStartDate() {
            const paths = [
                './config/current_meta_analysis_settings.json?t=' + Date.now(),
                './current_meta_analysis_settings.json?t=' + Date.now()
            ];
            for (const p of paths) {
                try {
                    const resp = await fetch(p);
                    if (!resp.ok) continue;
                    const settings = await resp.json();
                    const raw = settings?.sources?.tournaments?.start_date;
                    if (raw) {
                        currentMetaTournamentStartDate = parseDDMMYYYY(raw);
                        devLog(`[Current Meta] Tournament start_date from settings: ${raw} → ${currentMetaTournamentStartDate}`);
                        return;
                    }
                } catch (e) { /* ignore */ }
            }
            devLog('[Current Meta] No tournament start_date found in settings');
        }

        // Filter tournament CSV rows to only include tournaments >= start_date
        function filterTournamentRowsByMetaDate(rows) {
            if (!currentMetaTournamentStartDate || !Array.isArray(rows)) return rows;
            const cutoff = currentMetaTournamentStartDate;
            const filtered = rows.filter(row => {
                const d = parseEnglishTournamentDate(row.tournament_date);
                return d && d >= cutoff;
            });
            devLog(`[Current Meta] Tournament date filter: ${rows.length} → ${filtered.length} rows (cutoff: ${cutoff.toISOString().slice(0, 10)})`);
            return filtered;
        }
        
        // Initialize Current Meta Deck from localStorage
        if (!window.currentMetaDeck) {
            window.currentMetaDeck = {};
        }
        if (!window.currentMetaDeckOrder) {
            window.currentMetaDeckOrder = [];
        }

        function normalizeCurrentMetaTournamentArchetypeName(value) {
            return String(value || '')
                .replace(/\d+(?:[.,]\d+)?\$\d+(?:[.,]\d+)?€.*$/u, '')
                .trim();
        }

        function normalizeCurrentMetaArchetypeKey(value) {
            return String(value || '')
                .toLowerCase()
                .replace(/[''`]/g, '')
                .replace(/\bex\b/g, '')
                .replace(/[^a-z0-9\s-]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        }
        
        // Load Current Meta Analysis Data
        async function loadCurrentMetaAnalysis() {
          try {
            devLog('Loading Current Meta Analysis...');
            const deckGrid = document.getElementById('currentMetaDeckGrid');
            if (deckGrid && !deckGrid.innerHTML.trim()) {
                showTableSkeleton(deckGrid, { rows: 6, cols: 4, withImage: true });
            }
            const data = await loadCurrentMetaRowsWithFallback();
            devLog('Loaded data:', data ? `${data.length} rows` : 'null');
            
            // Load tournament start_date from settings for Major Tournament date filtering
            await loadCurrentMetaTournamentStartDate();
            
            // Note: Major Tournament data (tournament_cards_data_cards.csv) is VERY LARGE (50MB+)
            // and will be loaded lazily only when a deck is actually opened in Major Tournament mode.
            
            // Load deck stats (winrates)
            const deckStats = await loadCSV('limitless_online_decks.csv');
            if (deckStats) {
                window.currentMetaDeckStats = deckStats;
                devLog('Loaded deck stats:', deckStats.length, 'decks');
                // Phase 1: render current meta chart
                const chartData = deckStats.map(d => ({
                    archetype: d.deck_name || d.archetype || '',
                    new_count: parseInt(d.total_decks || d.count || d.new_count || 0)
                })).filter(d => d.archetype && d.new_count > 0).sort((a, b) => b.new_count - a.new_count);
                setTimeout(() => renderMetaChart('currentMeta', chartData), 400);
            }
            
            // Load matchup data
            const matchupData = await loadCSV('limitless_online_decks_matchups.csv');
            if (matchupData) {
                window.currentMetaMatchupData = matchupData;
                devLog('Loaded matchup data:', matchupData.length, 'matchups');
            }
            
            if (data && data.length > 0) {
                // Fix card name encoding issues (e.g. PokÃ© → Poké) in-place so
                // all subsequent deck lookups use correctly encoded names.
                healCurrentMetaCardRows(data);
                window.currentMetaAnalysisData = data;
                await populateCurrentMetaDeckSelect(data);
                setCurrentMetaFormatFilter('all'); // Set default filter
                window.currentMetaAnalysisLoaded = true;
                
                // Load meta card analysis for consistency calculations
                devLog('Loading meta card analysis for consistency...');
                loadMetaCardAnalysis('currentMeta');
            } else {
                const content = document.getElementById('currentMetaDeckSelect');
                if (content) {
                    content.innerHTML = '<option value="">Error loading data</option>';
                }
            }
          } catch (error) {
            console.error('[Current Meta Analysis] Error loading:', error);
            const content = document.getElementById('currentMetaDeckSelect');
            if (content) {
                content.innerHTML = '<option value="">Error loading analysis data</option>';
            }
          }
        }
        
        // Populate deck select dropdown
        async function populateCurrentMetaDeckSelect(data) {
            const comparisonData = await loadCSV('limitless_online_decks_comparison.csv');
            const comparisonMap = new Map();

            const normalizeRankKey = (value) => String(value || '')
                .toLowerCase()
                .replace(/['’]s\b/g, '')
                .replace(/[^a-z0-9\s-]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            if (comparisonData && comparisonData.length > 0) {
                comparisonData.forEach(row => {
                    if (row.deck_name && row.new_count) {
                        const entry = {
                            count: parseInt(row.new_count || 0, 10),
                            rank: parseInt(row.new_rank || 999, 10)
                        };
                        const exactKey = String(row.deck_name || '').toLowerCase();
                        const normalizedKey = normalizeRankKey(row.deck_name);
                        comparisonMap.set(exactKey, entry);
                        if (normalizedKey) comparisonMap.set(`norm:${normalizedKey}`, entry);
                    }
                });
                devLog('Loaded comparison data for', comparisonMap.size, 'decks');
            }

            let filteredData = data;
            if (currentMetaFormatFilter === 'live') {
                filteredData = data.filter(row => row.meta === 'Meta Live');
                devLog(`Filtered archetypes to Limitless only: ${filteredData.length} rows`);
            } else if (currentMetaFormatFilter === 'all') {
                devLog(`Keeping all archetype data: ${filteredData.length} rows`);
            } else if (currentMetaFormatFilter === 'play') {
                filteredData = data.filter(row => row.meta === 'Meta Play!');
                devLog(`Filtered archetypes to Major Tournament only: ${filteredData.length} rows`);

                if (filteredData.length === 0) {
                    if (!window.currentMetaTournamentCardsData) {
                        const rawTournament = await loadCSV('tournament_cards_data_cards.csv', { latestChunkOnly: true });
                        window.currentMetaTournamentCardsDataRaw = rawTournament;
                        window.currentMetaTournamentCardsData = filterTournamentRowsByMetaDate(rawTournament);
                    }

                    const tournamentRows = Array.isArray(window.currentMetaTournamentCardsData)
                        ? window.currentMetaTournamentCardsData
                        : [];
                    const perArchetypeTournamentCounts = new Map();

                    tournamentRows.forEach(row => {
                        const rawArchetype = normalizeCurrentMetaTournamentArchetypeName(row.archetype);
                        if (!rawArchetype) return;

                        const tournamentKey = String(row.tournament_id || row.tournament_name || '').trim();
                        if (!tournamentKey) return;

                        const normalizedKey = normalizeCurrentMetaArchetypeKey(rawArchetype) || rawArchetype.toLowerCase();
                        const deckCount = parseInt(row.total_decks_in_archetype || 0, 10) || 0;

                        if (!perArchetypeTournamentCounts.has(normalizedKey)) {
                            perArchetypeTournamentCounts.set(normalizedKey, {
                                name: rawArchetype,
                                tournaments: new Map()
                            });
                        }

                        const archetypeEntry = perArchetypeTournamentCounts.get(normalizedKey);
                        const existingCount = archetypeEntry.tournaments.get(tournamentKey) || 0;
                        if (deckCount > existingCount) {
                            archetypeEntry.tournaments.set(tournamentKey, deckCount);
                        }
                    });

                    filteredData = Array.from(perArchetypeTournamentCounts.values()).map(entry => ({
                        archetype: entry.name,
                        total_decks_in_archetype: Array.from(entry.tournaments.values()).reduce((sum, count) => sum + count, 0),
                        meta: 'Meta Play!'
                    }));

                    devLog(`Built Major Tournament archetype list from tournament CSV: ${filteredData.length} archetypes`);
                }
            }

            devLog(`Building archetype list from ${filteredData.length} rows...`);
            const archetypeMap = new Map();

            filteredData.forEach(row => {
                const archetype = String(row.archetype || '').trim();
                if (!archetype) return;

                if (!archetypeMap.has(archetype)) {
                    const comparisonInfo = comparisonMap.get(archetype.toLowerCase())
                        || comparisonMap.get(`norm:${normalizeRankKey(archetype)}`);
                    const deckCount = currentMetaFormatFilter === 'play'
                        ? parseInt(row.total_decks_in_archetype || 0, 10)
                        : (comparisonInfo ? comparisonInfo.count : parseInt(row.total_decks_in_archetype || 0, 10));
                    const rank = comparisonInfo ? comparisonInfo.rank : 999;

                    archetypeMap.set(archetype, {
                        name: archetype,
                        deckCount,
                        rank,
                        limitlessCount: 0,
                        majorCount: 0
                    });
                }
            });

            archetypeMap.forEach((archetypeInfo, archetypeName) => {
                const archetypeDecks = filteredData.filter(row => row.archetype === archetypeName);

                if (archetypeDecks.length > 0 && archetypeDecks[0].meta) {
                    const liveEntry = archetypeDecks.find(row => row.meta === 'Meta Live');
                    const limitlessCount = liveEntry ? parseInt(liveEntry.total_decks_in_archetype || 0, 10) : 0;

                    const playEntry = archetypeDecks.find(row => row.meta === 'Meta Play!');
                    const majorCount = playEntry ? parseInt(playEntry.total_decks_in_archetype || 0, 10) : 0;

                    archetypeInfo.limitlessCount = limitlessCount;
                    archetypeInfo.majorCount = majorCount;
                }
            });
            
            const archetypeList = Array.from(archetypeMap.values());
            devLog('Found archetypes:', archetypeList.length);
            
            // Sort by rank first (lower rank = higher position), then by deck count descending
            const sortedByMeta = [...archetypeList].sort((a, b) => {
                if (a.rank !== b.rank) {
                    return a.rank - b.rank; // Lower rank number = better position
                }
                return b.deckCount - a.deckCount; // Higher deck count = better
            });
            const top10 = sortedByMeta.slice(0, 10);
            const rest = sortedByMeta.slice(10).sort((a, b) => a.name.localeCompare(b.name));
            
            const select = document.getElementById('currentMetaDeckSelect');
            if (!select) return;
            
            select.innerHTML = `<option value="">${typeof t === 'function' ? t('currentMeta.selectDeck') : '-- Select a Deck --'}</option>`;
            
            if (top10.length > 0) {
                const optgroup = document.createElement('optgroup');
                optgroup.label = 'Top 10 Meta Decks';
                top10.forEach(deck => {
                    const option = document.createElement('option');
                    option.value = deck.name;
                    option.textContent = `${deck.name}`;
                    optgroup.appendChild(option);
                });
                select.appendChild(optgroup);
            }
            
            if (rest.length > 0) {
                const optgroup = document.createElement('optgroup');
                optgroup.label = 'All Other Decks';
                rest.forEach(deck => {
                    const option = document.createElement('option');
                    option.value = deck.name;
                    option.textContent = `${deck.name}`;
                    optgroup.appendChild(option);
                });
                select.appendChild(optgroup);
            }
            
            select.onchange = function() {
                const archetype = this.value;
                if (archetype) {
                    loadCurrentMetaDeckData(archetype);
                    if (window.currentMetaDeck && Object.keys(window.currentMetaDeck).length > 0) {
                        updateDeckDisplay('currentMeta');
                    }
                } else {
                    clearCurrentMetaDeckView();
                }
            };

            // Apply pending navigation selection (from jumpToCardAnalysis)
            const pendingMeta = String(window.pendingCurrentMetaDeckSelection || '').trim();
            if (pendingMeta) {
                const matchingOption = Array.from(select.options).find(option =>
                    option.value && option.value.toLowerCase() === pendingMeta.toLowerCase()
                );
                if (matchingOption) {
                    select.value = matchingOption.value;
                    window.pendingCurrentMetaDeckSelection = null;
                    window.currentCurrentMetaArchetype = matchingOption.value;
                    loadCurrentMetaDeckData(matchingOption.value);
                }
            }

            if (!pendingMeta) {
                const savedArchetype = String(window.currentCurrentMetaArchetype || '').trim();
                if (savedArchetype) {
                    const savedOption = Array.from(select.options).find(option =>
                        option.value && option.value.toLowerCase() === savedArchetype.toLowerCase()
                    );
                    if (savedOption) {
                        select.value = savedOption.value;
                        loadCurrentMetaDeckData(savedOption.value);
                    }
                }
            }

            if (!select.value) {
                window.currentCurrentMetaArchetype = '';
                clearCurrentMetaDeckView();
            }

            // Convert native <select> to custom searchable dropdown
            if (typeof initSearchableSelect === 'function') initSearchableSelect(select);
        }
        
        // Format filter functions
        async function setCurrentMetaFormatFilter(format) {
            currentMetaFormatFilter = format;
            devLog('[Current Meta] Format filter set to:', format);
            
            // Update button styles with null-checks
            ['All', 'Live', 'Play'].forEach(f => {
                const btn = document.getElementById(`currentMetaFilter${f}`);
                if (btn) {
                    if (f.toLowerCase() === format) {
                        btn.className = 'btn btn-primary';
                    } else {
                        btn.className = 'btn btn-secondary';
                    }
                    btn.disabled = false;
                    btn.title = '';
                    btn.classList.add('btn-active', 'pointer');
                    btn.classList.remove('btn-inactive');
                }
            });
            
            // Update status text
            const statusEl = document.getElementById('currentMetaFilterStatus');
            if (statusEl) {
                const labels = {
                    'all': typeof t === 'function' ? t('currentMeta.allTournaments') : 'All Tournaments',
                    'live': typeof t === 'function' ? t('currentMeta.limitlessOnly') : 'Limitless Decks Only',
                    'play': typeof t === 'function' ? t('currentMeta.majorOnly') : 'Major Tournament Decks Only'
                };
                const filterLabel = typeof t === 'function' ? t('currentMeta.activeFilter') : 'Active filter:';
                statusEl.textContent = `${filterLabel} ${labels[format]}`;
            }
            
            // Refresh dropdown list to show only archetypes matching the filter
            const currentMetaDeckSelect = document.getElementById('currentMetaDeckSelect');
            const previouslySelected = currentMetaDeckSelect ? currentMetaDeckSelect.value : null;

            const dataToUse = window.currentMetaAnalysisData;

            if (dataToUse) {
                await populateCurrentMetaDeckSelect(dataToUse);
            }
            
            // Respect value already set by populateCurrentMetaDeckSelect (pending selection)
            const currentValue = currentMetaDeckSelect ? currentMetaDeckSelect.value : '';
            if (!currentValue && previouslySelected && currentMetaDeckSelect) {
                const stillExists = Array.from(currentMetaDeckSelect.options).some(opt => opt.value === previouslySelected);
                
                if (stillExists) {
                    currentMetaDeckSelect.value = previouslySelected;
                    if (typeof syncSearchableSelectDisplay === 'function') syncSearchableSelectDisplay(currentMetaDeckSelect);
                    loadCurrentMetaDeckData(previouslySelected);
                } else {
                    currentMetaDeckSelect.value = '';
                    clearCurrentMetaDeckView();
                }
            } else {
                console.warn('No deck selected - filter saved for when deck is selected');
            }
        }
        
        // Load deck data with format filtering
        async function loadCurrentMetaDeckData(archetype) {
            // CRITICAL: Use different data sources based on filter to ensure correct numbers:
            // - 'play' (Major Tournament Decks): tournament_cards_data_cards.csv (Top 256 only, ~31 cards for Alakazam)
            // - 'live' (Limitless Decks): current_meta_card_data.csv with Meta Live rows (~47 cards)
            // - 'all': current_meta_card_data.csv with all rows (~85 cards)
            
            let data = null;
            let needsAggregation = false;
            
            if (currentMetaFormatFilter === 'play') {
                // Use Major Tournament data (Top 256 only), filtered to current meta period
                if (!window.currentMetaTournamentCardsData) {
                    showToast('Lade Major-Tournament-Kartendaten...', 'info');
                    const rawTournament = await loadCSV('tournament_cards_data_cards.csv', { latestChunkOnly: true });
                    window.currentMetaTournamentCardsDataRaw = rawTournament;
                    window.currentMetaTournamentCardsData = filterTournamentRowsByMetaDate(rawTournament);
                }
                data = window.currentMetaTournamentCardsData;
                needsAggregation = true;
            } else {
                // Use current meta (Limitless) data with optional format filtering
                data = window.currentMetaAnalysisData;
                needsAggregation = false;
            }
            
            if (!data) {
                console.error('[loadCurrentMetaDeckData] No data available for filter:', currentMetaFormatFilter);
                clearCurrentMetaDeckView();
                return;
            }
            
            window.currentCurrentMetaArchetype = archetype;
            
            // Check if we have a saved deck for this archetype
            const savedDeck = localStorage.getItem('currentMetaDeck');
            if (savedDeck) {
                try {
                    const parsed = JSON.parse(savedDeck);
                    if (parsed.archetype !== archetype) {
                        // Different archetype - CLEAR old deck
                        window.currentMetaDeck = {};
                        window.currentMetaDeckOrder = [];
                        saveCurrentMetaDeck();
                    }
                } catch (e) {
                    console.error('[loadCurrentMetaDeckData] Error reading saved deck:', e);
                }
            }
            
            // Filter by archetype
            const normalizedTarget = normalizeCurrentMetaArchetypeKey(archetype);
            let deckCards = data.filter(row => {
                const rowArchetype = currentMetaFormatFilter === 'play'
                    ? normalizeCurrentMetaTournamentArchetypeName(row.archetype)
                    : String(row.archetype || '').trim();

                if (!rowArchetype) return false;
                const exactMatch = rowArchetype.toLowerCase() === archetype.toLowerCase();
                if (exactMatch) return true;

                const normalizedRow = normalizeCurrentMetaArchetypeKey(rowArchetype);
                return normalizedRow && normalizedRow === normalizedTarget;
            });
            
            // Apply format filter only when using current_meta data with 'live' or 'all'
            // (tournament_cards_data is already filtered to Top 256, should NOT be filtered further by meta)
            if (currentMetaFormatFilter === 'live' && !needsAggregation) {
                deckCards = deckCards.filter(row => row.meta === 'Meta Live');
            }

            
            if (deckCards.length === 0) {
                showToast(`No data found for ${archetype} with filter "${currentMetaFormatFilter}"!`, 'warning');
                clearCurrentMetaDeckView();
                return;
            }
            
            // Show loading indicator for aggregation work
            if (needsAggregation && deckCards.length > 100) {
                showToast(`Processing ${deckCards.length} card entries... This may take a moment`, 'info');
            }
            
            // Use setTimeout to allow UI to update and prevent complete freezing
            setTimeout(() => {
                // Tournament cards data stores one row per tournament per card print,
                // so stats must be aggregated before deduplication (like Past Meta).
                // Current meta data is already pre-aggregated — skip aggregation for that.
                
                // Preserve raw per-tournament rows for Recency scoring in Consistency builder
                window.currentMetaRawDeckCards = deckCards.slice();

                if (needsAggregation && deckCards.length > 0) {
                    deckCards = aggregateCardStatsByDate(deckCards);
                }

                // Deduplicate only after statistics have been merged across tournaments/prints.
                deckCards = deduplicateCards(deckCards);
            
                window.currentCurrentMetaDeckCards = deckCards;
                
                // Calculate stats
                // Use max_count to match the filter view calculations for consistency
                // (both must use the same base to avoid logical impossibilities like "87 unique / 75 total")
                const totalCardsInDeck = deckCards.reduce((sum, card) => sum + parseInt(card.max_count || 0, 10), 0);
                const uniqueCards = deckCards.length;
                
                // Get winrate from deck stats
                let winrate = '-';
                const deckStats = window.currentMetaDeckStats || [];
                const deckStatEntry = deckStats.find(d => d.deck_name && d.deck_name.toLowerCase() === archetype.toLowerCase());
                if (deckStatEntry && deckStatEntry.win_rate) {
                    winrate = deckStatEntry.win_rate;
                }
                
                // Calculate matchup vs Top 20
                let matchupVsTop20 = '-';
                const matchupData = window.currentMetaMatchupData || [];
                if (deckStats.length > 0 && matchupData.length > 0) {
                    // Get top 20 decks by rank
                    const top20Decks = deckStats
                        .filter(d => d.rank && parseInt(d.rank) <= 20)
                        .map(d => d.deck_name);
                    
                    // Get matchups against top 20
                    const relevantMatchups = matchupData.filter(m => 
                        m.deck_name && m.deck_name.toLowerCase() === archetype.toLowerCase() &&
                        m.opponent && top20Decks.some(deck => deck && deck.toLowerCase() === m.opponent.toLowerCase())
                    );
                    
                    if (relevantMatchups.length > 0) {
                        // Calculate weighted average winrate
                        let totalGames = 0;
                        let totalWins = 0;
                        
                        relevantMatchups.forEach(m => {
                            const games = parseInt(m.total_games) || 0;
                            const winRate = parseFloat((m.win_rate || '0').replace(',', '.'));
                            totalGames += games;
                            totalWins += (games * winRate / 100);
                        });
                        
                        if (totalGames > 0) {
                            const avgWinrate = (totalWins / totalGames * 100).toFixed(2);
                            matchupVsTop20 = `${avgWinrate}% (${relevantMatchups.length} MU)`;
                        }
                    }
                }
                
                // Update stats
                updateDeckStatsByIds({
                    currentMetaStatCards: `${uniqueCards} / ${totalCardsInDeck}`,
                    currentMetaStatWinrate: winrate,
                    currentMetaStatMatchup: matchupVsTop20
                }, 'currentMetaStatsSection');
                
                // Render matchups
                renderCurrentMetaMatchups(archetype);
                
                // Render Top 256 tournament breakdown (only visible on Major Tournament filter)
                renderCurrentMetaTop256(archetype);
                
                // Render cards using current active view (defaults to table when both are hidden)
                applyCurrentMetaFilter();
                
                // DON'T auto-display deck here - let the caller decide
                // (only display when user actively selects archetype from dropdown)
            }, 100);  // Delay to allow UI to update
        }
        
        function clearCurrentMetaDeckView() {
            ['currentMetaStatsSection', 'currentMetaMatchupsSection', 'currentMetaDeckVisual', 'currentMetaDeckTableView', 'currentMetaTop256Section'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.add('d-none');
            });
            renderNoDeckSelectedState('currentMetaDeckGrid', 'Bitte waehle ein Deck aus dem Dropdown, um die Karten zu laden');
            resetDeckOverviewCounts('currentMetaCardCount', 'currentMetaCardCountSummary', '0 ' + t('cl.cards'), '/ 0 Total');
        }
        
        // Render "Used in Top 256" breakdown per major tournament for selected archetype
        async function renderCurrentMetaTop256(archetype) {
            const section = document.getElementById('currentMetaTop256Section');
            const listEl = document.getElementById('currentMetaTop256List');
            if (!section || !listEl) return;

            if (currentMetaFormatFilter !== 'play') {
                section.classList.add('d-none');
                return;
            }

            // Load and cache tournament cards data (filtered by meta date)
            if (!window.currentMetaTournamentCardsData) {
                const rawTournament = await loadCSV('tournament_cards_data_cards.csv', { latestChunkOnly: true });
                window.currentMetaTournamentCardsDataRaw = rawTournament;
                window.currentMetaTournamentCardsData = filterTournamentRowsByMetaDate(rawTournament);
            }
            const tourData = window.currentMetaTournamentCardsData || [];

            // Collect unique tournament entries for this archetype
            // Use the maximum total_decks_in_archetype across all rows for the same
            // tournament, because price-variant rows can carry different counts.
            const tourMap = new Map();
            tourData.forEach(row => {
                const rowArchetype = normalizeCurrentMetaTournamentArchetypeName(row.archetype);
                if (!rowArchetype || rowArchetype.toLowerCase() !== archetype.toLowerCase()) return;
                const key = row.tournament_name || String(row.tournament_id);
                const rowCount = parseInt(row.total_decks_in_archetype || 0, 10);
                if (!tourMap.has(key)) {
                    tourMap.set(key, {
                        name: row.tournament_name || key,
                        date: row.tournament_date || '',
                        count: rowCount
                    });
                } else {
                    // Keep the highest count seen across all rows for this tournament
                    const existing = tourMap.get(key);
                    if (rowCount > existing.count) {
                        existing.count = rowCount;
                    }
                }
            });

            if (tourMap.size === 0) {
                section.classList.add('d-none');
                return;
            }

            // Sort newest first using ordinal-aware date parsing
            const parseDate = s => {
                const d = new Date((s || '').replace(/(\d+)(st|nd|rd|th)/, '$1'));
                return isNaN(d) ? new Date(0) : d;
            };
            const tourList = Array.from(tourMap.values()).sort((a, b) => parseDate(b.date) - parseDate(a.date));

            listEl.innerHTML = tourList.map(t =>
                `<div class="top256-entry">` +
                `<span class="top256-count">${t.count}\u00d7</span>` +
                `<span class="top256-tournament">${t.name}</span>` +
                (t.date ? `<span class="top256-date">(${t.date})</span>` : '') +
                `</div>`
            ).join('');
            section.classList.remove('d-none');
        }

        // Render best/worst matchups for Current Meta - extract directly from loaded HTML (1:1 copy)
        function renderCurrentMetaMatchups(archetype) {
            const deckStats = window.currentMetaDeckStats || [];
            const matchupsSection = document.getElementById('currentMetaMatchupsSection');
            const bestTable = document.getElementById('currentMetaBestMatchups');
            const worstTable = document.getElementById('currentMetaWorstMatchups');
            const titleEl = document.getElementById('currentMetaMatchupsTitle');
            
            // Find the matchup tables directly from the loaded HTML content (1:1 same as Current Meta Tab)
            const currentMetaContent = document.getElementById('currentMetaContent');
            if (!currentMetaContent) {
                console.error('Current Meta content not loaded');
                if (matchupsSection) matchupsSection.classList.add('d-none');
                return;
            }
            
            // Find all h3 elements (deck names) and locate the one matching our archetype
            const allH3 = currentMetaContent.querySelectorAll('h3');
            let matchingSection = null;
            
            for (let h3 of allH3) {
                const h3Text = h3.textContent.trim();
                // Check if h3 starts with the archetype name
                if (h3Text.startsWith(archetype + ' ')) {
                    // Found it! The parent div contains the matchup tables
                    matchingSection = h3.parentElement;
                    devLog(`? Found HTML section for: ${archetype}`);
                    break;
                }
            }
            
            if (!matchingSection) {
                console.error(`? No HTML matchup section found for: ${archetype}`);
                matchupsSection.classList.add('d-none');
                return;
            }
            
            // Extract the Best and Worst Matchups tables directly from HTML
            // (Look for .matchups-grid-container class OR inline grid style)
            let tablesGrid = matchingSection.querySelector('.matchups-grid-container');
            if (!tablesGrid) {
                tablesGrid = matchingSection.querySelector('div[style*="grid-template-columns"]');
            }
            if (!tablesGrid) {
                console.error(`? No matchup tables found in section for: ${archetype}`);
                matchupsSection.classList.add('d-none');
                return;
            }
            
            const allTablesInGrid = tablesGrid.querySelectorAll('table');
            if (allTablesInGrid.length < 2) {
                console.error(`? Expected 2 tables (best/worst), found: ${allTablesInGrid.length}`);
                matchupsSection.classList.add('d-none');
                return;
            }
            
            const bestMatchupsTable = allTablesInGrid[0]; // First table = Best Matchups
            const worstMatchupsTable = allTablesInGrid[1]; // Second table = Worst Matchups
            
            devLog(`? Extracted matchup tables from HTML for: ${archetype}`);
            
            // Extract title from H3 (already contains all info: "Gholdengo Lunatone (Rank #2 | Total WR: 52.2%, Vs Top20: 15:4)")
            const h3El = matchingSection.querySelector('h3');
            if (h3El) {
                titleEl.innerHTML = h3El.innerHTML; // Copy title exactly 1:1
            }
            
            // Copy table body rows directly from HTML (1:1 same data as Current Meta Tab)
            const bestTbody = bestMatchupsTable.querySelector('tbody');
            const worstTbody = worstMatchupsTable.querySelector('tbody');
            
            if (bestTbody) {
                // Copy all <tr> rows except the header row
                const bestRows = Array.from(bestMatchupsTable.querySelectorAll('tr')).slice(1); // Skip header
                let bestHtml = '';
                bestRows.forEach(row => {
                    bestHtml += row.outerHTML;
                });
                bestTable.innerHTML = bestHtml || '<tr><td colspan="3" style="text-align: center; padding: 20px;">' + t('heatmap.noData') + '</td></tr>';
            } else {
                bestTable.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px;">' + t('heatmap.noData') + '</td></tr>';
            }
            
            if (worstTbody) {
                // Copy all <tr> rows except the header row
                const worstRows = Array.from(worstMatchupsTable.querySelectorAll('tr')).slice(1); // Skip header
                let worstHtml = '';
                worstRows.forEach(row => {
                    worstHtml += row.outerHTML;
                });
                worstTable.innerHTML = worstHtml || '<tr><td colspan="3" style="text-align: center; padding: 20px;">' + t('heatmap.noData') + '</td></tr>';
            } else {
                worstTable.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px;">' + t('heatmap.noData') + '</td></tr>';
            }
            
            // Populate opponent dropdown from window.matchupData (for search feature)
            const deckNameForVar = archetype.replace(/\s+/g, '_').replace(/'/g, '');
            const varName = 'matchupData_' + deckNameForVar;
            const matchupData = window[varName];
            
            const dropdown = document.getElementById('currentMetaOpponentDropdown');
            if (matchupData) {
                const allOpponents = Object.keys(matchupData).filter(o => o).sort();
                let dropdownHtml = '';
                allOpponents.forEach(opponent => {
                    dropdownHtml += `<div class="opponent-option" data-value="${opponent}" onclick="selectCurrentMetaOpponent(this, '${opponent}')" style="padding: 10px; cursor: pointer; border-bottom: 1px solid #eee; transition: background 0.2s;">${opponent}</div>`;
                });
                dropdown.innerHTML = dropdownHtml;
                
                // Store for filtering
                window.currentMetaDeckMatchups = Object.entries(matchupData).map(([opponent, data]) => ({
                    opponent: opponent,
                    win_rate: data.win_rate,
                    win_rate_numeric: data.win_rate_numeric,
                    record: data.record,
                    total_games: data.total_games
                }));
            } else {
                dropdown.innerHTML = '<div style="padding: 10px; color: #444; font-weight: 500;">' + t('heatmap.noData') + '</div>';
                window.currentMetaDeckMatchups = [];
            }
            
            matchupsSection.classList.remove('d-none');
        }
        
        // Filter opponents in dropdown
        function filterCurrentMetaOpponents(inputEl) {
            const searchValue = inputEl.value.toLowerCase();
            const dropdown = document.getElementById('currentMetaOpponentDropdown');
            const options = dropdown.querySelectorAll('.opponent-option');
            
            let hasVisibleOptions = false;
            options.forEach(option => {
                const opponentName = option.getAttribute('data-value').toLowerCase();
                if (opponentName.includes(searchValue)) {
                    option.classList.remove('d-none');
                    hasVisibleOptions = true;
                } else {
                    option.classList.add('d-none');
                }
            });

            if (hasVisibleOptions) {
                dropdown.classList.remove('d-none');
            } else {
                dropdown.classList.add('d-none');
            }
        }
        
        // Select opponent and show matchup details
        function selectCurrentMetaOpponent(optionEl, opponent) {
            const inputEl = document.getElementById('currentMetaOpponentSearch');
            const hiddenEl = document.getElementById('currentMetaOpponentSelected');
            const dropdown = document.getElementById('currentMetaOpponentDropdown');
            const detailsEl = document.getElementById('currentMetaMatchupDetails');
            
            // Update input and hidden field
            inputEl.value = opponent;
            hiddenEl.value = opponent;
            dropdown.classList.add('d-none');
            
            // Find matchup data
            const deckMatchups = window.currentMetaDeckMatchups || [];
            const matchup = deckMatchups.find(m => m.opponent === opponent);
            
            if (matchup) {
                const winRate = matchup.win_rate || '-';
                const record = matchup.record || '-';
                const totalGames = matchup.total_games || '0';
                
                detailsEl.innerHTML = `
                    <h4 style="margin-top: 0; color: #2c3e50;">Matchup: vs ${escapeHtml(opponent)}</h4>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-top: 10px;">
                        <div>
                            <strong style="color: #333;">Win Rate:</strong><br>
                            <span style="font-size: 1.5em; color: #3498db;">${escapeHtml(winRate)}</span>
                        </div>
                        <div>
                            <strong style="color: #333;">Record:</strong><br>
                            <span style="font-size: 1.2em; color: #2c3e50;">${escapeHtml(record)}</span>
                        </div>
                        <div>
                            <strong style="color: #333;">Total Games:</strong><br>
                            <span style="font-size: 1.5em; color: #2c3e50;">${escapeHtml(totalGames)}</span>
                        </div>
                    </div>
                `;
                detailsEl.classList.remove('d-none');
            } else {
                detailsEl.innerHTML = '<p style="color: #444; text-align: center; font-weight: 500;">No matchup data found</p>';
                detailsEl.classList.remove('d-none');
            }
        }
        
        // Close dropdown when clicking outside
        document.addEventListener('click', function(e) {
            const dropdown = document.getElementById('currentMetaOpponentDropdown');
            const input = document.getElementById('currentMetaOpponentSearch');
            if (dropdown && input && !input.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.add('d-none');
            }
        });
        
        function applyCurrentMetaFilter() {
            const filterSelect = document.getElementById('currentMetaFilterSelect');
            const archetype = document.getElementById('currentMetaDeckSelect')?.value;
            
            if (!filterSelect || !archetype || !window.currentCurrentMetaDeckCards) return;
            
            const filterValue = filterSelect.value;
            const allCards = window.currentCurrentMetaDeckCards;
            const filteredCards = applyShareFilterWithAceSpecBoost(allCards, filterValue);
            
            devLog(`Filter applied: ${filterValue}, showing ${filteredCards.length} of ${allCards.length} cards`);
            
            const filteredTotal = filteredCards.reduce((sum, card) => sum + parseInt(card.max_count || 0), 0);
            const allTotal = allCards.reduce((sum, card) => sum + parseInt(card.max_count || 0), 0);
            
            const tableViewContainer = document.getElementById('currentMetaDeckTableView');
            const gridViewContainer = document.getElementById('currentMetaDeckVisual');
            // Active view = the one NOT hidden; default to grid when both are hidden
            const isTableViewActive = tableViewContainer && !tableViewContainer.classList.contains('d-none');
            
            if (isTableViewActive) {
                renderCurrentMetaDeckTable(filteredCards);
            } else {
                renderCurrentMetaDeckGrid(filteredCards);
            }

            if (gridViewContainer && !isTableViewActive) {
                gridViewContainer.classList.remove('d-none');
            }
            if (tableViewContainer && isTableViewActive) {
                tableViewContainer.classList.remove('d-none');
            }
            
            updateCurrentMetaCardCounts(filteredCards.length, filteredTotal, allTotal);
        }
        
        function updateCurrentMetaCardCounts(uniqueCount, filteredTotal, allTotal) {
            const countEl = document.getElementById('currentMetaCardCount');
            const summaryEl = document.getElementById('currentMetaCardCountSummary');
            
            if (countEl) countEl.textContent = `${uniqueCount} ${t('deck.cards')}`;
            if (summaryEl) summaryEl.textContent = `/ ${filteredTotal} Total`;
        }
        
        // Set overview rarity mode
        function setCurrentMetaOverviewRarityMode(mode) {
            devLog('Setting Current Meta overview rarity mode to:', mode);
            currentMetaRarityMode = mode;
            
            if (mode === 'all') {
                currentMetaGlobalRarityPreference = null;
                globalRarityPreference = null;
            } else {
                currentMetaGlobalRarityPreference = mode;
                globalRarityPreference = mode;
            }
            
            // Update button styles with null-checks
            const btnMin = document.getElementById('currentMetaOverviewRarityMin');
            const btnMax = document.getElementById('currentMetaOverviewRarityMax');
            const btnAll = document.getElementById('currentMetaOverviewRarityAll');
            
            if (btnMin) {
                btnMin.classList.remove('btn-active', 'btn-inactive');
                btnMin.classList.add(mode === 'min' ? 'btn-active' : 'btn-inactive');
            }
            if (btnMax) {
                btnMax.classList.remove('btn-active', 'btn-inactive');
                btnMax.classList.add(mode === 'max' ? 'btn-active' : 'btn-inactive');
            }
            if (btnAll) {
                btnAll.classList.remove('btn-active', 'btn-inactive');
                btnAll.classList.add(mode === 'all' ? 'btn-active' : 'btn-inactive');
            }
            
            const cards = window.currentCurrentMetaDeckCards;
            if (cards && cards.length > 0) {
                applyCurrentMetaFilter();  // Use filter function to preserve percentage filter
            } else {
                console.warn('No cards available to render - mode saved for when deck is selected');
            }
            
            if (window.currentMetaDeck && Object.keys(window.currentMetaDeck).length > 0) {
                updateDeckDisplay('currentMeta');
            }
        }
        
        // Global helper function to determine card type for filtering and sorting
        function getCardType(name, set, number) {
            // Try to get card from database first
            if (set && number) {
                const dbCard = getCanonicalCardRecord(set, number) || null;
                
                if (dbCard && dbCard.type) {
                    const dbType = dbCard.type;
                    
                    // Map database type to display category
                    // Energy types
                    if (dbType === 'Basic Energy' || dbType === 'Special Energy') {
                        return 'Energy';
                    }
                    
                    // Trainer types - exact match
                    if (dbType === 'Supporter') return 'Supporter';
                    if (dbType === 'Stadium') return 'Stadium';
                    
                    // Item and Tool - check for Ace Spec first
                    if (dbType === 'Item' || dbType === 'Tool' || dbType === 'Item/Technical Machine') {
                        if (isAceSpec(name)) return 'Ace Spec';
                        if (dbType === 'Tool' || dbType === 'Item/Technical Machine') return 'Tool';
                        return 'Item';
                    }
                    
                    // Pokemon types (any type starting with element: G Basic, R Stage 1, W Stage 2, etc.)
                    return 'Pokemon';
                }
            }
            
            // FALLBACK: If card not in database, use name-based detection
            console.warn(`[getCardType] Card not found in database: ${name} (${set} ${number}), using fallback detection`);
            
            // 1. Check if it's energy
            if (isBasicEnergy(name)) return 'Energy';
            if (name.includes('Energy')) return 'Energy';
            
            // 2. Check for Ace Spec (special items - highest priority)
            if (isAceSpec(name)) return 'Ace Spec';
            
            // 3. Check for Tools (Pokemon Tools attached to Pokemon)
            if (['Balloon', 'Belt', 'Cape', 'Charm', 'Band', 'Guard', 'Helmet', 
                 'Glasses', 'Shard', 'Stone'].some(t => name.includes(t))) {
                return 'Tool';
            }
            
            // 4. Check for Stadiums
            if (['Stadium', 'Tower', 'Watchtower', 'Path', 'Temple', 'Forest', 'Mountain', 
                 'Beach', 'Town', 'Hall', 'Garden', 'Ruins', 'Lake', 'Crater'].some(t => name.includes(t))) {
                return 'Stadium';
            }
            
            // 5. Check for Supporters
            if (name.includes("'s ") || 
                ['Professor', 'Arven', 'Iono', 'Judge', 'Cynthia', 'Marnie', 'Irida', 'Carmine', 
                 'Penny', 'Colress', 'Raihan', 'Tulip', 'Grusha', 'Larry', 'Kieran'].some(t => name.includes(t))) {
                return 'Supporter';
            }
            
            // 6. Check for Items
            if (['Ball', 'Pad', 'Rod', 'Cart', 'Poffin', 'Nest', 'Candy', 'Switch',
                 'Stretcher', 'Letter', 'Bike', 'Scooter', 'Scoop', 'Gong', 'Device', 
                 'Container', 'Scrapper', 'Deck', 'Doll', 'Fossil', 'Potion', 'Mail',
                 'Premium Power Pro', 'Escape Rope', 'Max Elixir'].some(t => name.includes(t))) {
                return 'Item';
            }
            
            // 7. Check for Pokemon with ex/GX/V suffix
            if (/\s(ex|GX|V|VMAX|VSTAR|BREAK)$/i.test(name)) {
                return 'Pokemon';
            }
            
            // 8. Default: assume Pokemon
            return 'Pokemon';
        }
        
        // Render grid view
        function renderCurrentMetaDeckGrid(cards) {
            const visualContainer = document.getElementById('currentMetaDeckVisual');
            const gridContainer = document.getElementById('currentMetaDeckGrid');
            if (!gridContainer) return;

            if (!Array.isArray(cards) || cards.length === 0) {
                gridContainer.innerHTML = getEmptyStateHtml();
                if (visualContainer) {
                    document.getElementById('currentMetaDeckTableView')?.classList.add('d-none');
                    visualContainer.classList.remove('d-none');
                }
                return;
            }
            
            const sortedCards = sortCardsByType([...cards]);
            const currentDeck = window.currentMetaDeck || {};
            const priceMap = getOverviewPriceLookupCache();
            
            const cardHtmls = [];
            sortedCards.forEach(card => {
                const originalSetCode = card.set_code || '';
                const originalSetNumber = card.set_number || '';
                const rawCardName = card.card_name || '';
                const cardName = getDisplayCardName(rawCardName, originalSetCode, originalSetNumber);
                const cardNameEscaped = escapeJsStr(cardName);
                
                let versionsToRender = [];
                
                if (currentMetaRarityMode === 'all') {
                    let allVersions = getInternationalPrintsForCard(originalSetCode, originalSetNumber);
                    if (allVersions && allVersions.length > 0) {
                        versionsToRender = allVersions.map(v => ({
                            ...card,
                            set_code: v.set,
                            set_number: v.number,
                            image_url: v.image_url,
                            rarity: v.rarity
                        }));
                    } else {
                        versionsToRender = [card];
                    }
                } else {
                    const preferredVersion = getPreferredVersionForCard(cardName, originalSetCode, originalSetNumber);
                    if (preferredVersion) {
                        versionsToRender = [{
                            ...card,
                            set_code: preferredVersion.set,
                            set_number: preferredVersion.number,
                            image_url: preferredVersion.image_url,
                            rarity: preferredVersion.rarity
                        }];
                    } else {
                        versionsToRender = [card];
                    }
                }
                
                versionsToRender.forEach(displayCard => {
                    const setCode = displayCard.set_code || '';
                    const setNumber = displayCard.set_number || '';
                    const cardNameWarning = getNameWarningHtml(rawCardName, cardName, setCode, setNumber);

                    const imageUrl = getBestCardImage({
                        ...displayCard,
                        set_code: setCode,
                        set_number: setNumber,
                        card_name: cardName
                    });
                    const rawPercentage = safeParseFloat(card.percentage_in_archetype || card.share_percent || 0);
                    
                    const legalMaxCopies = getLegalMaxCopies(cardName, card);
                    const rawMaxCount = parseInt(card.max_count) || 0;
                    const totalCount = safeParseFloat(card.total_count || 0);
                    const decksWithCard = safeParseFloat(card.deck_count || card.deck_inclusion_count || 0);
                    const finalMaxCount = rawMaxCount > 0
                        ? Math.min(legalMaxCopies, rawMaxCount)
                        : 0;
                    
                    let deckCount = 0;
                    if (Object.keys(currentDeck).length > 0 && setCode && setNumber) {
                        for (const deckKey in currentDeck) {
                            const match = deckKey.match(/\(([A-Z0-9]+)\s+([A-Z0-9]+)\)$/);
                            if (match) {
                                if (match[1] === setCode && match[2] === setNumber) {
                                    deckCount = currentDeck[deckKey] || 0;
                                    break;
                                }
                            }
                        }
                    } else if (Object.keys(currentDeck).length > 0 && !setCode && !setNumber) {
                        deckCount = currentDeck[cardName] || 0;
                    }
                    
                    const totalDecksInArchetype = safeParseFloat(card.total_decks_in_archetype || 0);
                    const avgCountOverallRaw = safeParseFloat(card.average_count_overall || '', NaN);
                    const avgCountInUsedRaw = safeParseFloat(card.average_count || card.avg_count || '', NaN);

                    const resolvedPercentage = Number.isFinite(rawPercentage) && rawPercentage > 0
                        ? rawPercentage
                        : (totalDecksInArchetype > 0 && decksWithCard > 0 ? (decksWithCard / totalDecksInArchetype) * 100 : 0);
                    const avgCountOverallValue = Number.isFinite(avgCountOverallRaw) && avgCountOverallRaw > 0
                        ? avgCountOverallRaw
                        : (totalDecksInArchetype > 0 ? (totalCount / totalDecksInArchetype) : 0);
                    const avgCountInUsedValue = Number.isFinite(avgCountInUsedRaw) && avgCountInUsedRaw > 0
                        ? avgCountInUsedRaw
                        : (decksWithCard > 0 ? (totalCount / decksWithCard) : 0);

                    const finalAvgUsed = Math.min(legalMaxCopies, avgCountInUsedValue);
                    const finalAvgOverall = Math.min(legalMaxCopies, avgCountOverallValue);
                    const maxCount = finalMaxCount;

                    const percentage = Math.max(0, resolvedPercentage).toFixed(1).replace('.', ',');
                    const avgCountOverall = Math.max(0, finalAvgOverall).toFixed(2).replace('.', ',');
                    const avgCountInUsedDecks = Math.max(0, finalAvgUsed).toFixed(2).replace('.', ',');
                    const decksWithCardDisplay = Math.round(Math.max(0, decksWithCard));
                    const totalDecksDisplay = Math.round(Math.max(0, totalDecksInArchetype));
                    
                    // Price lookup
                    let eurPrice = '';
                    let cardmarketUrl = '';
                    let germanCardName = (displayCard.name_de || card.name_de || card.card_name_de || '').toLowerCase();
                    if (setCode && setNumber) {
                        const normalizedSet = normalizeSetCode(setCode);
                        const normalizedNumber = normalizeCardNumber(setNumber);
                        let priceCard = priceMap.get(`${normalizedSet}-${normalizedNumber}`);
                        if (!priceCard && /^\d+$/.test(normalizedNumber)) {
                            priceCard = priceMap.get(`${normalizedSet}-${normalizedNumber.padStart(3, '0')}`);
                        }
                        if (priceCard) {
                            eurPrice = priceCard.eur_price || '';
                            cardmarketUrl = priceCard.cardmarket_url || '';
                            if (priceCard.name_de) germanCardName = String(priceCard.name_de).toLowerCase();
                        }
                    }
                    const isBasicEnergyEntry = (typeof isBasicEnergyCardEntry === 'function' && isBasicEnergyCardEntry({
                        card_name: cardName,
                        type: card.type || card.card_type,
                        supertype: card.supertype,
                        subtypes: card.subtypes
                    })) || /basic energy/i.test(String(card.type || card.card_type || ''));

                    if (isBasicEnergyEntry) {
                        eurPrice = '0,05€';
                        cardmarketUrl = '';
                    }
                    const priceDisplay = eurPrice || '0,00€';
                    const priceBackground = eurPrice ? 'linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)' : 'linear-gradient(135deg, #777 0%, #999 100%)';
                    const cardmarketUrlEscaped = escapeJsStr(cardmarketUrl || '');
                    
                    // Card type category
                    const cardType = card.type || card.card_type || '';
                    const cardCategory = getCardTypeCategory(cardType);
                    const isAceSpecCard = isAceSpec(cardName);
                    const filterCategory = isAceSpecCard ? 'Ace Spec' : cardCategory;
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
                                        <div class="city-league-card-stats-mobile">${resolvedPercentage > 0 ? `${percentage}% | Ø ${avgCountInUsedDecks}x (${avgCountOverall}x)` : ''}</div>
                                        <div class="city-league-card-deck-stats-mobile">${decksWithCardDisplay}/${totalDecksDisplay} (${percentage}%)</div>
                                    </div>
                                    <div class="card-action-buttons city-league-card-action-buttons">
                                        <div class="city-league-card-action-row">
                                            <button class="city-league-card-action-btn city-league-card-remove-btn" onclick="event.stopPropagation(); removeCardFromDeck('currentMeta', '${cardNameEscaped}')" title="${t('cl.removeFromDeck')}">-</button>
                                            <button class="city-league-card-action-btn city-league-card-rarity-btn" onclick="event.stopPropagation(); openRaritySwitcher('${cardNameEscaped}', '${cardNameEscaped} (${setCode} ${setNumber})')" title="${t('cl.switchPrint')}">★</button>
                                            <button class="city-league-card-action-btn city-league-card-add-btn" onclick="event.stopPropagation(); addCardToDeck('currentMeta', '${cardNameEscaped}', '${setCode}', '${setNumber}')" title="${t('cl.addToDeckTooltip')}">+</button>
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
                });
            });
            
            // Progressive batch rendering: show first cards instantly, load rest in background
            // Increment generation counter to cancel any in-flight batch from a previous render call
            const renderGen = ++_currentMetaRenderGen;
            const BATCH_SIZE = 12;
            gridContainer.innerHTML = cardHtmls.slice(0, BATCH_SIZE).join('');
            if (cardHtmls.length > BATCH_SIZE) {
                let offset = BATCH_SIZE;
                (function renderNextBatch() {
                    if (renderGen !== _currentMetaRenderGen) return; // stale render — abort
                    if (offset >= cardHtmls.length) return;
                    const batch = cardHtmls.slice(offset, offset + BATCH_SIZE);
                    gridContainer.insertAdjacentHTML('beforeend', batch.join(''));
                    offset += BATCH_SIZE;
                    requestAnimationFrame(renderNextBatch);
                })();
            }
            document.getElementById('currentMetaDeckTableView')?.classList.add('d-none');
            visualContainer.classList.remove('d-none');
        }
        
        function renderCurrentMetaDeckTable(cards) {
            const tableContainer = document.getElementById('currentMetaDeckTable');
            const tableViewContainer = document.getElementById('currentMetaDeckTableView');
            if (!tableContainer) return;
            
            // Group cards into FOUR tiers: Check Ace Spec FIRST, then by usage percentage
            const coreCards = [];
            const aceSpecCards = [];
            const techCards = [];
            const spicyCards = [];
            
            // Hardcoded Ace Spec names for reliable detection (CSV is_ace_spec is buggy)
            const _aceSpecNamesMeta = ['prime catcher','unfair stamp','master ball','maximum belt','hero\'s cape','awakening drum','reboot pod','survival brace','grand tree','neutral center','sparkling crystal','dangerous laser','scoop up cyclone','computer search','dowsing machine','rock guard','life dew','victory star','g booster','g scope','rich energy','legacy energy','secret box','hyper aroma','neo upper energy','scramble switch','deluxe bomb','megaton blower','amulet of hope','pok\u00e9 vital a'];
            cards.forEach(card => {
                // Check if card is Ace Spec (exclusive category)
                const _cn = String(card.card_name || card.name || '').trim().toLowerCase();
                const isAceSpec = _aceSpecNamesMeta.includes(_cn) ||
                                  (card.rarity && card.rarity.toLowerCase().includes('ace spec')) ||
                                  (Array.isArray(card.rules) && card.rules.some(r => r.toUpperCase().includes('ACE SPEC')));
                
                if (isAceSpec) {
                    aceSpecCards.push(card);
                } else {
                    const pct = parsePct(card.percentage_in_archetype);
                    if (pct >= 80) {
                        coreCards.push(card);
                    } else if (pct >= 15) {
                        techCards.push(card);
                    } else {
                        spicyCards.push(card);
                    }
                }
            });
            
            // Sort each tier using PTCG card sorting
            sortCardsPTCG(coreCards);
            sortCardsPTCG(techCards);
            sortCardsPTCG(spicyCards);
            
            // Sort Ace Spec cards by usage percentage (descending - most played first)
            aceSpecCards.sort((a, b) => parsePct(b.percentage_in_archetype) - parsePct(a.percentage_in_archetype));
            
            const currentDeck = window.currentMetaDeck || {};
            
            // Helper function to render a single tier
            const renderTier = (tierCards, tierTitle, tierEmoji) => {
                if (tierCards.length === 0) return '';
                
                let html = `<div style="margin-bottom: 30px;">`;
                html += `<h3 style="margin: 20px 0 15px 0; color: #2c3e50; font-size: 1.3em; display: flex; align-items: center; gap: 10px;"><span>${tierEmoji}</span> ${tierTitle}</h3>`;
                html += '<div style="display: flex; flex-direction: column; gap: 15px;">';
                
                tierCards.forEach(card => {
                    const cardName = card.card_name;
                    let displayCard = card;
                    const allCards = window.allCardsDatabase || [];
                    const allVersions = allCards.filter(c => (c.name_en || c.name) === cardName && c.set && c.number);
                    
                    if (currentMetaRarityMode !== 'all' && allVersions.length > 0) {
                        // Set order loaded from sets.json at startup (higher = newer)
                        const SET_ORDER = window.setOrderMap || {};
                        
                        const getRarityValue = (card) => {
                            const r = (card.rarity || card.card_rarity || '').toLowerCase();
                            if (!r || r === '') return 0;
                            if (r.includes('common')) return 1;
                            if (r.includes('uncommon')) return 2;
                            if (r.includes('rare')) return 3;
                            return -1;
                        };
                        
                        allVersions.sort((a, b) => {
                            const rarityDiff = currentMetaRarityMode === 'min' ? getRarityValue(a) - getRarityValue(b) : getRarityValue(b) - getRarityValue(a);
                            if (rarityDiff !== 0) return rarityDiff;
                            return (SET_ORDER[b.set] || 0) - (SET_ORDER[a.set] || 0);
                        });
                        
                        const preferredVersion = allVersions[0];
                        displayCard = {
                            ...card,
                            set_code: preferredVersion.set,
                            set_number: preferredVersion.number,
                            image_url: preferredVersion.image_url || card.image_url
                        };
                    }
                    
                    const imageUrl = getBestCardImage({
                        ...displayCard,
                        card_name: cardName
                    });
                    const rawPercentage = parseFloat(String(card.percentage_in_archetype || card.share_percent || 0).replace(',', '.'));
                    const maxCount = parseInt(card.max_count) || card.max_count || '?';
                    const cardNameEscaped = escapeJsStr(cardName);
                    const setCode = displayCard.set_code || '';
                    const setNumber = displayCard.set_number || '';
                    const avgCountUsedRaw = parseFloat(String(card.average_count || card.avg_count || 0).replace(',', '.'));
                    
                    let deckCount = 0;
                    if (setCode && setNumber) {
                        for (const deckKey in currentDeck) {
                            const match = deckKey.match(/\(([A-Z0-9]+)\s+([A-Z0-9]+)\)$/);
                            if (match && match[1] === setCode && match[2] === setNumber) {
                                deckCount = currentDeck[deckKey] || 0;
                                break;
                            }
                        }
                    } else {
                        deckCount = currentDeck[cardName] || 0;
                    }
                    
                    const decksWithCard = parseFloat(String(card.deck_count || card.deck_inclusion_count || 0).replace(',', '.')) || 0;
                    const totalDecksInArchetype = parseFloat(String(card.total_decks_in_archetype || 0).replace(',', '.')) || 0;
                    const totalCount = parseFloat(String(card.total_count || 0).replace(',', '.')) || 0;
                    const avgCountOverallRaw = parseFloat(String(card.average_count_overall || 0).replace(',', '.'));

                    const resolvedPercentage = Number.isFinite(rawPercentage) && rawPercentage > 0
                        ? rawPercentage
                        : (totalDecksInArchetype > 0 && decksWithCard > 0 ? (decksWithCard / totalDecksInArchetype) * 100 : 0);
                    const avgCountUsedValue = Number.isFinite(avgCountUsedRaw) && avgCountUsedRaw > 0
                        ? avgCountUsedRaw
                        : (decksWithCard > 0 ? (totalCount / decksWithCard) : 0);
                    const avgCountOverallValue = Number.isFinite(avgCountOverallRaw) && avgCountOverallRaw > 0
                        ? avgCountOverallRaw
                        : (totalDecksInArchetype > 0 ? (totalCount / totalDecksInArchetype) : 0);

                    const percentage = Math.max(0, resolvedPercentage).toFixed(1).replace('.', ',');
                    const avgCount = Math.max(0, avgCountUsedValue).toFixed(2).replace('.', ',');
                    const avgCountOverall = Math.max(0, avgCountOverallValue).toFixed(2).replace('.', ',');
                    const decksWithCardDisplay = Math.round(Math.max(0, decksWithCard));
                    const totalDecksDisplay = Math.round(Math.max(0, totalDecksInArchetype));
                
                    html += `
                        <div class="card-table-row" data-card-name="${cardName.toLowerCase()}" style="display: flex; align-items: center; background: white; border-radius: 8px; padding: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); gap: 20px;">
                            <div style="flex-shrink: 0; position: relative; width: 120px;">
                                <img src="${imageUrl}" alt="${cardName}" loading="lazy" referrerpolicy="no-referrer" style="width: 100%; border-radius: 6px; cursor: zoom-in; aspect-ratio: 2.5/3.5; object-fit: cover;" onerror="handleCardImageError(this, '${setCode}', '${setNumber}')" onclick="showSingleCard(this.src, '${cardNameEscaped} (${setCode} ${setNumber})');">
                                ${deckCount > 0 ? `<div style="position: absolute; top: 5px; left: 5px; background: #28a745; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.85em; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${deckCount}</div>` : ''}
                                ${typeof getWishlistBadgeHtml === 'function' ? getWishlistBadgeHtml(cardName, setCode, setNumber) : ''}
                            </div>
                            <div style="flex-grow: 1; min-width: 0;">
                                <h3 style="margin: 0 0 8px 0; font-size: 1.2em; color: #333;">${cardName}</h3>
                                <div style="color: #333; font-size: 0.9em; margin-bottom: 10px; font-weight: 600;">${setCode} ${setNumber}</div>
                                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin-bottom: 10px;">
                                    <div><span style="color: #555; font-size: 0.85em; font-weight: 600;">Usage Share:</span> <span style="font-weight: 600; color: #667eea; margin-left: 5px;">${percentage}%</span></div>
                                    <div><span style="color: #555; font-size: 0.85em; font-weight: 600;">Ø Count (if used):</span> <span style="font-weight: 600; color: #27ae60; margin-left: 5px;">${avgCount}x</span></div>
                                    <div><span style="color: #555; font-size: 0.85em; font-weight: 600;">Ø Count (overall):</span> <span style="font-weight: 600; color: #f39c12; margin-left: 5px;">${avgCountOverall}x</span></div>
                                    <div><span style="color: #555; font-size: 0.85em; font-weight: 600;">Deck Count:</span> <span style="font-weight: 600; color: #333; margin-left: 5px;">${decksWithCardDisplay} / ${totalDecksDisplay}</span></div>
                                    <div><span style="color: #555; font-size: 0.85em; font-weight: 600;">Max Count:</span> <span style="font-weight: 600; color: #dc3545; margin-left: 5px;">${maxCount}</span></div>
                                </div>
                            </div>
                            <div style="flex-shrink: 0; display:flex; flex-direction:column; gap:6px;">
                                <button class="btn btn-success" style="padding: 10px 20px; font-size: 0.95em;" onclick="addCardToDeck('currentMeta', '${cardNameEscaped}', '${setCode}', '${setNumber}')">Add to Deck</button>
                                <button class="btn" style="padding: 10px 20px; font-size: 0.85em; background:#e74c3c; color:white;" onclick="addCardToProxy('${cardNameEscaped}', '${setCode}', '${setNumber}', 1)">Proxy</button>
                            </div>
                        </div>
                    `;
                });
                
                html += '</div></div>';
                return html;
            };
            
            // Render all FOUR tiers
            let html = '';
            html += renderTier(coreCards, 'Core Cards (80% - 100%)', '');
            html += renderTier(aceSpecCards, 'Ace Spec (Max 1 per Deck)', '');
            html += renderTier(techCards, 'Tech Cards (15% - 79%)', '');
            html += renderTier(spicyCards, 'Spicy Techs (< 15%)', '');
            
            if (html === '') {
                html = '<p style="text-align: center; padding: 20px; color: #444;">No cards found</p>';
            }
            
            tableContainer.innerHTML = html;
            document.getElementById('currentMetaDeckVisual')?.classList.add('d-none');
            tableViewContainer.classList.remove('d-none');
            devLog('Current Meta table rendered with tier grouping:', { core: coreCards.length, aceSpec: aceSpecCards.length, tech: techCards.length, spicy: spicyCards.length });
        }
        
        function filterCurrentMetaOverviewCards() {
            const searchInput = document.getElementById('currentMetaOverviewSearch');
            if (!searchInput) return;
            
            const searchTerm = searchInput.value.toLowerCase().trim();
            const gridContainer = document.getElementById('currentMetaDeckGrid');
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

                const matchesType = currentMetaOverviewCardTypeFilter === 'all' || cardType === currentMetaOverviewCardTypeFilter
                    || (currentMetaOverviewCardTypeFilter === 'Energy' && cardType === 'Basic Energy');
                
                // Show card only if it matches both filters
                if (matchesSearch && matchesType) {
                    card.style.display = '';
                    visibleCount++;
                } else {
                    card.style.display = 'none';
                }
            });
            
            // Update card count
            const countElement = document.getElementById('currentMetaCardCount');
            if (countElement) {
                countElement.textContent = `${visibleCount} Cards`;
            }
        }
        
        function toggleCurrentMetaDeckGridView() {
            const gridViewContainer = document.getElementById('currentMetaDeckVisual');
            const tableViewContainer = document.getElementById('currentMetaDeckTableView');
            // Get button from DOM instead of event
            const gridButtons = document.querySelectorAll('button[onclick*="toggleCurrentMetaDeckGridView"]');
            const button = gridButtons[0];
            
            if (!gridViewContainer || !tableViewContainer) {
                console.warn('Grid or table container not found');
                return;
            }
            
            const cards = window.currentCurrentMetaDeckCards;
            if (!cards || cards.length === 0) {
                showToast('Please select a deck first!', 'warning');
                return;
            }
            
            const isGridViewActive = !gridViewContainer.classList.contains('d-none');
            
            if (isGridViewActive) {
                gridViewContainer.classList.add('d-none');
                if (button) button.textContent = 'Grid View';
            } else {
                tableViewContainer.classList.add('d-none');
                if (button) button.textContent = 'List View';
            }
            
            // Re-apply filter to preserve percentage filter and render correct view
            applyCurrentMetaFilter();
            
            filterCurrentMetaOverviewCards();
        }
        
        function copyCurrentMetaDeckOverview() {
            const deck = window.currentMetaDeck;
            const hasDeck = deck && Object.keys(deck).length > 0;
            
            const allCards = window.currentCurrentMetaDeckCards || [];
            const allCardsFromDb = window.allCardsDatabase || [];
            
            if (!hasDeck && allCards.length === 0) {
                showToast('No cards to copy! Please select an archetype first.', 'warning');
                return;
            }
            
            const cardDataByName = {};
            allCards.forEach(card => {
                cardDataByName[card.card_name] = card;
            });
            allCardsFromDb.forEach(card => {
                if (!cardDataByName[card.name]) {
                    cardDataByName[card.name] = {
                        card_name: card.name,
                        type: card.type || 'Unknown',
                        card_type: card.type || 'Unknown',
                        set_code: card.set,
                        set_number: card.number,
                        rarity: card.rarity
                    };
                }
            });
            
            const deckCards = [];
            
            if (hasDeck) {
                for (const [deckKey, count] of Object.entries(deck)) {
                    if (count <= 0) continue;
                    
                    const baseNameMatch = deckKey.match(/^(.+?)\s*\(/);
                    const baseName = baseNameMatch ? baseNameMatch[1] : deckKey;
                    const setMatch = deckKey.match(/\(([A-Z0-9]+)\s+([A-Z0-9]+)\)$/);
                    const originalSet = setMatch ? setMatch[1] : null;
                    const originalNumber = setMatch ? setMatch[2] : null;
                    
                    let cardData = cardDataByName[baseName];
                    if (!cardData) continue;
                    
                    cardData = { ...cardData };
                    
                    const pref = getRarityPreference(baseName);
                    
                    if (pref && pref.mode === 'specific' && pref.set && pref.number) {
                        const specificCard = allCardsFromDb.find(c => 
                            c.name === baseName && c.set === pref.set && c.number === pref.number
                        );
                        if (specificCard) {
                            cardData.set_code = specificCard.set;
                            cardData.set_number = specificCard.number;
                        }
                    }
                    else if (currentMetaGlobalRarityPreference === 'max' || currentMetaGlobalRarityPreference === 'min') {
                        if (originalSet && originalNumber) {
                            const preferredVersion = getPreferredVersionForCard(baseName, originalSet, originalNumber);
                            if (preferredVersion) {
                                cardData.set_code = preferredVersion.set;
                                cardData.set_number = preferredVersion.number;
                            }
                        }
                    }
                    else if (originalSet && originalNumber) {
                        cardData.set_code = originalSet;
                        cardData.set_number = originalNumber;
                    }
                    
                    deckCards.push({ ...cardData, count: count });
                }
            } else {
                allCards.forEach(card => {
                    const cardName = card.card_name;
                    const maxCount = parseInt(card.max_count) || 0;
                    if (maxCount <= 0) return;
                    
                    const originalSet = card.set_code || '';
                    const originalNumber = card.set_number || '';
                    let cardData = { ...card };
                    
                    if (currentMetaRarityMode === 'min' || currentMetaRarityMode === 'max') {
                        if (originalSet && originalNumber) {
                            const preferredVersion = getPreferredVersionForCard(cardName, originalSet, originalNumber);
                            if (preferredVersion) {
                                cardData.set_code = preferredVersion.set;
                                cardData.set_number = preferredVersion.number;
                            }
                        }
                    }
                    
                    deckCards.push({
                        card_name: cardName,
                        type: cardData.type || cardData.card_type || 'Unknown',
                        card_type: cardData.type || cardData.card_type || 'Unknown',
                        set_code: cardData.set_code || '',
                        set_number: cardData.set_number || '',
                        count: maxCount
                    });
                });
            }
            
            const sortedCards = sortCardsByType(deckCards);
            
            const pokemon = [];
            const trainer = [];
            const energy = [];
            let pokemonCount = 0;
            let trainerCount = 0;
            let energyCount = 0;
            
            sortedCards.forEach(card => {
                const cardType = card.type || card.card_type || '';
                const category = getCardTypeCategory(cardType);
                const count = card.count;
                const cardName = card.card_name || '';
                const setCode = card.set_code || '';
                const setNumber = card.set_number || '';
                
                const line = `${count} ${cardName} ${setCode} ${setNumber}`.trim();
                
                if (category === 'Pokemon') {
                    pokemon.push(line);
                    pokemonCount += count;
                } else if (category === 'Basic Energy' || category === 'Energy' || category === 'Special Energy') {
                    energy.push(line);
                    energyCount += count;
                } else {
                    trainer.push(line);
                    trainerCount += count;
                }
            });
            
            let output = '';
            if (pokemon.length > 0) output += `Pokémon: ${pokemonCount}\n` + pokemon.join('\n') + '\n\n';
            if (trainer.length > 0) output += `Trainer: ${trainerCount}\n` + trainer.join('\n') + '\n\n';
            if (energy.length > 0) output += `Energy: ${energyCount}\n` + energy.join('\n');
            
            navigator.clipboard.writeText(output).then(() => {
                showToast('Deck copied to clipboard!', 'success');
            }).catch(err => {
                console.error('Error copying:', err);
                showToast('Error copying to clipboard!', 'error');
            });
        }
        
        // Add filter change listener
        document.addEventListener('DOMContentLoaded', function() {
            const filterSelect = document.getElementById('currentMetaFilterSelect');
            if (filterSelect) {
                filterSelect.onchange = applyCurrentMetaFilter;
            }
        });