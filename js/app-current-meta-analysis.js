// app-current-meta-analysis.js — extracted from app.js
// Part of Hausi's Pokemon TCG Analysis

        // CURRENT META DECK ANALYSIS - Complete Implementation
        // ========================================================================
        
        // Current Meta Global Variables
        let currentMetaFormatFilter = 'all'; // 'all', 'live', 'play'
        let currentMetaRarityMode = 'min'; // 'min', 'max', 'all'
        let currentMetaGlobalRarityPreference = 'min';
        
        // Initialize Current Meta Deck from localStorage
        if (!window.currentMetaDeck) {
            window.currentMetaDeck = {};
        }
        if (!window.currentMetaDeckOrder) {
            window.currentMetaDeckOrder = [];
        }
        
        // Load Current Meta Analysis Data
        async function loadCurrentMetaAnalysis() {
          try {
            devLog('Loading Current Meta Analysis...');
            const data = await loadCurrentMetaRowsWithFallback();
            devLog('Loaded data:', data ? `${data.length} rows` : 'null');
            
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
            // Load comparison data for correct ranking
            const comparisonData = await loadCSV('limitless_online_decks_comparison.csv');
            const comparisonMap = new Map();
            
            if (comparisonData && comparisonData.length > 0) {
                comparisonData.forEach(row => {
                    if (row.deck_name && row.new_count) {
                        comparisonMap.set(row.deck_name.toLowerCase(), {
                            count: parseInt(row.new_count || 0),
                            rank: parseInt(row.new_rank || 999)
                        });
                    }
                });
                devLog('Loaded comparison data for', comparisonMap.size, 'decks');
            }
            
            // Apply format filter to data BEFORE building archetype list
            let filteredData = data;
            if (currentMetaFormatFilter !== 'all' && !window.currentMetaUsingFallback) {
                const filterValue = currentMetaFormatFilter === 'live' ? 'Meta Live' : 'Meta Play!';
                filteredData = data.filter(row => row.meta === filterValue);
                devLog(`Filtered archetypes by ${currentMetaFormatFilter}: ${filteredData.length} cards`);
            }
            
            const archetypeMap = new Map();
            filteredData.forEach(row => {
                const archetype = row.archetype;
                if (!archetype) return;
                
                if (!archetypeMap.has(archetype)) {
                    // Use comparison data for deck count if available
                    const comparisonInfo = comparisonMap.get(archetype.toLowerCase());
                    const deckCount = comparisonInfo ? comparisonInfo.count : parseInt(row.total_decks_in_archetype || 0);
                    const rank = comparisonInfo ? comparisonInfo.rank : 999;
                    
                    archetypeMap.set(archetype, {
                        name: archetype,
                        deckCount: deckCount,
                        rank: rank,
                        limitlessCount: 0,
                        majorCount: 0
                    });
                }
            });
            
            // Calculate split between Limitless and Major for each archetype
            archetypeMap.forEach((archetypeInfo, archetypeName) => {
                const archetypeDecks = data.filter(row => row.archetype === archetypeName);
                
                // Find an entry with Meta Live to get total_decks_in_archetype
                const liveEntry = archetypeDecks.find(row => row.meta === 'Meta Live');
                const limitlessCount = liveEntry ? parseInt(liveEntry.total_decks_in_archetype || 0) : 0;
                
                // Find an entry with Meta Play! to get total_decks_in_archetype
                const playEntry = archetypeDecks.find(row => row.meta === 'Meta Play!');
                const majorCount = playEntry ? parseInt(playEntry.total_decks_in_archetype || 0) : 0;
                
                archetypeInfo.limitlessCount = limitlessCount;
                archetypeInfo.majorCount = majorCount;
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
            
            select.innerHTML = '<option value="">-- Select a Deck --</option>';
            
            if (top10.length > 0) {
                const optgroup = document.createElement('optgroup');
                optgroup.label = '🏆 Top 10 Meta Decks';
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
                optgroup.label = '🎴 All Other Decks';
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
                    // Display the deck after loading archetype data
                    if (window.currentMetaDeck && Object.keys(window.currentMetaDeck).length > 0) {
                        updateDeckDisplay('currentMeta');
                        devLog('[Dropdown] Displaying saved deck for selected archetype');
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

            // Enable search functionality
            const searchInput = document.getElementById('currentMetaDeckSearch');
            if (searchInput) {
                searchInput.oninput = function() {
                    const searchTerm = this.value.toLowerCase();
                    const options = select.querySelectorAll('option');
                    options.forEach(opt => {
                        if (opt.value === '') return;
                        const text = opt.textContent.toLowerCase();
                        opt.style.display = text.includes(searchTerm) ? '' : 'none';
                    });
                };
            }
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
                    'all': 'All Tournaments',
                    'live': 'Limitless Decks Only',
                    'play': 'Major Tournament Decks Only'
                };
                statusEl.textContent = `Active filter: ${labels[format]}`;
            }
            
            // Refresh dropdown list to show only archetypes matching the filter
            const currentMetaDeckSelect = document.getElementById('currentMetaDeckSelect');
            const previouslySelected = currentMetaDeckSelect ? currentMetaDeckSelect.value : null;
            
            if (window.currentMetaAnalysisData) {
                await populateCurrentMetaDeckSelect(window.currentMetaAnalysisData);
            }
            
            // Check if previously selected archetype still exists in filtered list
            if (previouslySelected && currentMetaDeckSelect) {
                const stillExists = Array.from(currentMetaDeckSelect.options).some(opt => opt.value === previouslySelected);
                
                if (stillExists) {
                    // Restore selection and reload deck
                    currentMetaDeckSelect.value = previouslySelected;
                    loadCurrentMetaDeckData(previouslySelected);
                } else {
                    // Clear selection and deck view
                    currentMetaDeckSelect.value = '';
                    clearCurrentMetaDeckView();
                    devLog('?? Previously selected archetype not available in this filter');
                }
            } else {
                console.warn('?? No deck selected - filter saved for when deck is selected');
            }
        }
        
        // Load deck data with format filtering
        function loadCurrentMetaDeckData(archetype) {
            const data = window.currentMetaAnalysisData;
            if (!data) return;
            
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
            let deckCards = data.filter(row => 
                row.archetype && row.archetype.toLowerCase() === archetype.toLowerCase()
            );
            
            // Apply format filter (only when primary CSV is loaded; fallback data is
            // already all 'Meta Play!' so the live-filter guard must be skipped).
            if (currentMetaFormatFilter !== 'all' && !window.currentMetaUsingFallback) {
                const filterValue = currentMetaFormatFilter === 'live' ? 'Meta Live' : 'Meta Play!';
                deckCards = deckCards.filter(row => row.meta === filterValue);
            }
            
            if (deckCards.length === 0) {
                showToast(`No data found for ${archetype} with filter "${currentMetaFormatFilter}"!`, 'warning');
                clearCurrentMetaDeckView();
                return;
            }
            
            // Fallback CSV (tournament_cards_data_cards.csv) stores one row per tournament
            // per print, so stats must be aggregated before deduplication.
            // Primary CSV is already pre-aggregated — skip the expensive aggregation pass.
            if (window.currentMetaUsingFallback && deckCards.length > 0) {
                deckCards = aggregateCardStatsByDate(deckCards);
            }

            // Deduplicate only after statistics have been merged across tournaments/prints.
            deckCards = deduplicateCards(deckCards);
            
            window.currentCurrentMetaDeckCards = deckCards;
            
            // Calculate stats
            const totalCardsInDeck = deckCards.reduce((sum, card) => sum + parseInt(card.max_count || 0), 0);
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
            document.getElementById('currentMetaStatCards').textContent = `${uniqueCards} / ${totalCardsInDeck}`;
            document.getElementById('currentMetaStatWinrate').textContent = winrate;
            document.getElementById('currentMetaStatMatchup').textContent = matchupVsTop20;
            document.getElementById('currentMetaStatsSection').classList.remove('d-none');
            
            // Render matchups
            renderCurrentMetaMatchups(archetype);
            
            // Render cards using current active view (defaults to table when both are hidden)
            applyCurrentMetaFilter();
            
            // DON'T auto-display deck here - let the caller decide
            // (only display when user actively selects archetype from dropdown)
        }
        
        function clearCurrentMetaDeckView() {
            ['currentMetaStatsSection', 'currentMetaMatchupsSection', 'currentMetaDeckVisual', 'currentMetaDeckTableView'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.add('d-none');
            });
            const countEl = document.getElementById('currentMetaCardCount');
            if (countEl) countEl.textContent = '0 ' + t('cl.cards');
            const summaryEl = document.getElementById('currentMetaCardCountSummary');
            if (summaryEl) summaryEl.textContent = '/ 0 Total';
        }
        
        // Render best/worst matchups for Current Meta - extract directly from loaded HTML (1:1 copy)
        function renderCurrentMetaMatchups(archetype) {
            devLog('?? Rendering matchups for:', archetype);
            const deckStats = window.currentMetaDeckStats || [];
            const matchupsSection = document.getElementById('currentMetaMatchupsSection');
            const bestTable = document.getElementById('currentMetaBestMatchups');
            const worstTable = document.getElementById('currentMetaWorstMatchups');
            const titleEl = document.getElementById('currentMetaMatchupsTitle');
            
            // Find the matchup tables directly from the loaded HTML content (1:1 same as Current Meta Tab)
            const currentMetaContent = document.getElementById('currentMetaContent');
            if (!currentMetaContent) {
                console.error('? Current Meta content not loaded');
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
                    <h4 style="margin-top: 0; color: #2c3e50;">⚡ Matchup: vs ${escapeHtml(opponent)}</h4>
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
            devLog('?? Setting Current Meta overview rarity mode to:', mode);
            currentMetaRarityMode = mode;
            
            if (mode === 'all') {
                currentMetaGlobalRarityPreference = null;
            } else {
                currentMetaGlobalRarityPreference = mode;
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
                console.warn('?? No cards available to render - mode saved for when deck is selected');
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
            
            let html = '';
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
                    let otherPrintOwnedCount = 0;
                    if (window.userCollectionCounts instanceof Map && window.userCollectionCounts.size > 0) {
                        const normalizedCurrentName = normalizeCardName(cardName);
                        const normalizedSet = String(setCode || '').toUpperCase();
                        const normalizedNumber = String(setNumber || '').toUpperCase();
                        window.userCollectionCounts.forEach((qty, collKey) => {
                            const ownedQty = parseInt(qty, 10) || 0;
                            if (ownedQty <= 0) return;
                            const parts = String(collKey || '').split('|');
                            if (parts.length < 3) return;
                            if (normalizeCardName(parts[0]) !== normalizedCurrentName) return;
                            if (String(parts[1] || '').toUpperCase() === normalizedSet && String(parts[2] || '').toUpperCase() === normalizedNumber) return;
                            otherPrintOwnedCount += ownedQty;
                        });
                    }
                    const otherPrintSparkleHtml = otherPrintOwnedCount > 0
                        ? `<div class="city-league-other-print-sparkle${deckCount > 0 ? ' city-league-other-print-sparkle-hasdeck' : ''}">
                            <span class="city-league-other-print-sparkle-icon">✨</span>
                            <span class="city-league-other-print-sparkle-count">${otherPrintOwnedCount}</span>
                        </div>`
                        : '';
                    
                    html += `
                        <div class="card-item city-league-card-item" data-card-name="${cardName.toLowerCase()}" data-card-name-de="${germanCardNameEscaped}" data-card-set="${setCode.toLowerCase()}" data-card-number="${setNumber.toLowerCase()}" data-card-type="${filterCategory}">
                            <div class="card-image-container city-league-card-image-container">
                                <img src="${imageUrl}" alt="${cardName}" loading="lazy" referrerpolicy="no-referrer" class="city-league-card-image" onerror="handleCardImageError(this, '${setCode}', '${setNumber}')" onclick="if (typeof event !== 'undefined' && event) event.stopPropagation(); showSingleCard(this.src, '${cardNameEscaped}');">
                                <div class="city-league-card-badge city-league-card-badge-max">${maxCount}</div>
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
                    `;
                });
            });
            
            gridContainer.innerHTML = html;
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
                                <img src="${imageUrl}" alt="${cardName}" loading="lazy" referrerpolicy="no-referrer" style="width: 100%; border-radius: 6px; cursor: zoom-in; aspect-ratio: 2.5/3.5; object-fit: cover;" onerror="handleCardImageError(this, '${setCode}', '${setNumber}')" onclick="showSingleCard(this.src, '${cardNameEscaped}');">
                                ${deckCount > 0 ? `<div style="position: absolute; top: 5px; left: 5px; background: #28a745; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.85em; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${deckCount}</div>` : ''}
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
            html += renderTier(coreCards, 'Core Cards (80% - 100%)', '🔥');
            html += renderTier(aceSpecCards, 'Ace Spec (Max 1 per Deck)', '💎');
            html += renderTier(techCards, 'Tech Cards (15% - 79%)', '🛠️');
            html += renderTier(spicyCards, 'Spicy Techs (< 15%)', '🌶️');
            
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
                console.warn('?? Grid or table container not found');
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
                if (button) button.textContent = '🖼️ Grid View';
            } else {
                tableViewContainer.classList.add('d-none');
                if (button) button.textContent = '📋 List View';
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