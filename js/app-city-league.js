// app-city-league.js — extracted from app.js
// Part of Hausi's Pokemon TCG Analysis

        // =======================================================================
        // CITY LEAGUE FORMAT SWITCHING (M4 vs M3)
        // =======================================================================
        // 
        // This system allows switching between different City League formats:
        // - M4 (Ninja Spinner): Current format - uses standard CSV files
        // - M3 (Perfect Order): Archive format - uses _M3 suffix CSV files
        //
        // Required CSV files:
        // ┌─────────────────────────────────────────────────────────────────────┐
        // │ M4 (Current):                                                       │
        // │  - city_league_archetypes_comparison.csv                            │
        // │  - city_league_archetypes.csv                                       │
        // │  - city_league_analysis.csv                                         │
        // ├─────────────────────────────────────────────────────────────────────┤
        // │ M3 (Archive):                                                       │
        // │  - city_league_archetypes_comparison_M3.csv                         │
        // │  - city_league_archetypes_M3.csv                                    │
        // │  - city_league_analysis_M3.csv                                      │
        // └─────────────────────────────────────────────────────────────────────┘
        //
        // When in M4 mode, M3 data is loaded for comparison to show:
        // - Share trends (M4 vs M3)
        // - Average placement trends (lower rank = better)
        // - Visual indicators (⬆️ improved, ⬇️ declined, ➖ unchanged)
        //
        // The selected format is persisted in localStorage.
        // =======================================================================
        
        // Global variables for format management
        window.currentCityLeagueFormat = localStorage.getItem('cityLeagueFormat') || 'M4';
        window.m3ArchetypeData = null; // Backward-compatible comparison data from M3
        window.m3BaselineData = {}; // Globales Dictionary fuer den Vergleich
        
        /**
         * Load M3 archetype data for comparison (only when in M4 mode)
         */
        async function loadM3ComparisonData() {
            if (window.m3ArchetypeData) return; // Already loaded
            
            try {
                const timestamp = new Date().getTime();
                const response = await fetch(`${BASE_PATH}city_league_archetypes_comparison_M3.csv?t=${timestamp}`);
                if (response.ok) {
                    const text = await response.text();
                    const m3Data = parseCSV(text);
                    
                    // Convert to Map for quick lookup by archetype name
                    window.m3ArchetypeData = {};
                    m3Data.forEach(deck => {
                        const key = deck.archetype || deck.deck_name;
                        if (key) {
                            window.m3ArchetypeData[key] = {
                                share: parseFloat(deck.new_meta_share || deck.new_share || deck.share || 0),
                                avgPlacement: parseFloat(deck.new_avg_placement || 0),
                                count: parseInt(deck.new_count || 0)
                            };
                        }
                    });
                    devLog(`Loaded M3 comparison data: ${Object.keys(window.m3ArchetypeData).length} archetypes`);
                } else {
                    console.warn('M3 comparison data not available');
                }
            } catch (e) {
                console.warn('Could not load M3 comparison data:', e);
            }
        }
        
        /**
         * Switch between M4 and M3 formats
         */
        async function switchCityLeagueFormat(format) {
            const selectMain = document.getElementById('cityLeagueFormatSelect');
            const selectAnalysis = document.getElementById('cityLeagueFormatSelectAnalysis');
            if (selectMain) selectMain.value = format;
            if (selectAnalysis) selectAnalysis.value = format;

            devLog(`Switching City League format to: ${format}`);
            
            // Store selection
            window.currentCityLeagueFormat = format;
            localStorage.setItem('cityLeagueFormat', format);
            
            // Show skeleton loader while data loads
            const content = document.getElementById('cityLeagueContent');
            if (content) {
                showTableSkeleton(content, { rows: 8, cols: 5, withImage: true });
            }
            
            // Load M3 comparison data only on non-mobile to avoid blocking slower devices.
            const isMobileRuntime = !!(window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
            if (format === 'M4' && !isMobileRuntime) {
                await loadM3ComparisonData();
            }
            
            // Reload City League data with new format
            window.cityLeagueLoaded = false;
            window.cityLeagueAnalysisLoaded = false;
            await loadCityLeagueData();

            // Also refresh analysis tab data so the secondary format switch is globally usable
            await loadCityLeagueAnalysis();
        }
        
        // Load City League data from CSV (with cache-busting)
        let cityLeagueData = [];
        function deriveCityLeagueComparisonData(archetypesData) {
            if (!archetypesData || archetypesData.length === 0) return [];

            const grouped = new Map();
            archetypesData.forEach(row => {
                const archetype = (row.archetype || '').trim();
                if (!archetype) return;

                if (!grouped.has(archetype)) {
                    grouped.set(archetype, {
                        archetype,
                        count: 0,
                        placementSum: 0,
                        bestPlacement: Number.POSITIVE_INFINITY
                    });
                }

                const entry = grouped.get(archetype);
                const placement = parseInt(row.placement || '0', 10);
                entry.count += 1;
                if (!Number.isNaN(placement) && placement > 0) {
                    entry.placementSum += placement;
                    entry.bestPlacement = Math.min(entry.bestPlacement, placement);
                }
            });

            const totalCount = Array.from(grouped.values()).reduce((sum, entry) => sum + entry.count, 0);

            return Array.from(grouped.values())
                .map(entry => {
                    const metaShare = totalCount > 0 ? (entry.count / totalCount) * 100 : 0;
                    const avgPlacement = entry.count > 0 ? (entry.placementSum / entry.count) : 0;
                    return {
                        archetype: entry.archetype,
                        status: 'AKTUELL',
                        trend: 'STABIL',
                        old_count: String(entry.count),
                        new_count: String(entry.count),
                        count_change: '0',
                        old_meta_share: metaShare.toFixed(2).replace('.', ','),
                        new_meta_share: metaShare.toFixed(2).replace('.', ','),
                        meta_share_change: '0',
                        old_avg_placement: avgPlacement.toFixed(2).replace('.', ','),
                        new_avg_placement: avgPlacement.toFixed(2).replace('.', ','),
                        avg_placement_change: '0',
                        old_best: entry.bestPlacement === Number.POSITIVE_INFINITY ? '' : String(entry.bestPlacement),
                        new_best: entry.bestPlacement === Number.POSITIVE_INFINITY ? '' : String(entry.bestPlacement)
                    };
                })
                .sort((a, b) => parseInt(b.new_count || 0, 10) - parseInt(a.new_count || 0, 10));
        }

        async function loadCityLeagueData() {
            const content = document.getElementById('cityLeagueContent');
            try {
                const timestamp = new Date().getTime();
                const isMobileRuntime = !!(window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
                
                // Dynamic file paths based on current format
                const format = window.currentCityLeagueFormat || 'M4';
                const formatSuffix = format === 'M3' ? '_M3' : '';
                const analysisUrl = `${BASE_PATH}city_league_analysis${formatSuffix}.csv`;
                const archetypesUrl = `${BASE_PATH}city_league_archetypes${formatSuffix}.csv`;
                const comparisonUrl = `${BASE_PATH}city_league_archetypes_comparison${formatSuffix}.csv`;
                const hasComparisonFile = format !== 'M3';

                devLog(`Loading City League data for format: ${format}`);

                const fetchPromises = [
                    fetch(`${analysisUrl}?t=${timestamp}`)
                        .then(response => response.ok ? response.text() : null)
                        .catch(error => {
                            console.error(`Could not load analysis data (${analysisUrl}):`, error);
                            return null;
                        }),
                    fetch(`${archetypesUrl}?t=${timestamp}`)
                        .then(response => response.ok ? response.text() : null)
                        .catch(error => {
                            console.error(`Could not load archetypes data (${archetypesUrl}):`, error);
                            return null;
                        }),
                    hasComparisonFile
                        ? fetch(`${comparisonUrl}?t=${timestamp}`)
                            .then(response => response.ok ? response.text() : null)
                            .catch(error => {
                                console.warn(`Comparison file could not be loaded (${comparisonUrl}):`, error);
                                return null;
                            })
                        : Promise.resolve(null)
                ];

                // NEU: Lade M3-Archetypen im Hintergrund, wenn wir in M4 sind (desktop only)
                if (window.currentCityLeagueFormat === 'M4' && !isMobileRuntime) {
                    fetchPromises.push(
                        fetch(`${BASE_PATH}city_league_archetypes_M3.csv?t=${timestamp}`)
                            .then(response => response.ok ? response.text() : null)
                            .catch(() => null)
                    );
                }

                const results = await Promise.all(fetchPromises);
                const analysisText = results[0];
                const archetypesText = results[1];
                const comparisonText = results[2];
                const m3DataRaw = results.length > 3 ? results[3] : null;

                if (!analysisText || !archetypesText) {
                    console.error('Hauptdaten fehlen fuer Format:', format);
                    content.innerHTML = '<div class="error">Error loading City League Meta data</div>';
                    return;
                }

                const analysisData = parseCSV(analysisText);
                const archetypesData = parseCSV(archetypesText);
                const comparisonData = comparisonText ? parseCSV(comparisonText) : null;
                const placementStatsMap = buildCityLeaguePlacementStatsMap(archetypesData);

                // NEU: M3 Daten parsen und im globalen Objekt speichern
                if (m3DataRaw) {
                    const parsedM3 = parseCSV(m3DataRaw);
                    const aggregatedM3 = deriveCityLeagueComparisonData(parsedM3);
                    const m3PlacementStatsMap = buildCityLeaguePlacementStatsMap(parsedM3);
                    const enrichedM3 = enrichCityLeagueDataWithPlacementStats(aggregatedM3, m3PlacementStatsMap);
                    window.m3BaselineData = {};
                    window.m3ArchetypeData = {};
                    enrichedM3.forEach(row => {
                        const deckName = row.name || row.archetype;
                        if (!deckName) return;

                        const normalizedAvgPlacement = (row.new_avg_placement || row.average_placement || row.avg_placement || '0').replace(',', '.');
                        const normalizedShare = (row.new_meta_share || row.new_share || row.share || row.percentage_in_archetype || '0').replace(',', '.');

                        window.m3BaselineData[deckName] = {
                            ...row,
                            average_placement: normalizedAvgPlacement,
                            avg_placement: normalizedAvgPlacement,
                            share: normalizedShare,
                            percentage_in_archetype: normalizedShare
                        };
                        window.m3ArchetypeData[deckName] = {
                            share: parseFloat(normalizedShare),
                            avgPlacement: parseFloat(normalizedAvgPlacement),
                            count: parseInt(row.new_count || '0', 10)
                        };
                    });
                } else {
                    window.m3BaselineData = {};
                    window.m3ArchetypeData = {};
                }

                if (!analysisData.length || !archetypesData.length) {
                    console.error('Leere Hauptdaten fuer Format:', format);
                    content.innerHTML = '<div class="error">Error loading City League Meta data</div>';
                    return;
                }

                cityLeagueData = comparisonData && comparisonData.length > 0
                    ? enrichCityLeagueDataWithPlacementStats(comparisonData, placementStatsMap)
                    : enrichCityLeagueDataWithPlacementStats(deriveCityLeagueComparisonData(archetypesData), placementStatsMap);

                if (!comparisonData || comparisonData.length === 0) {
                    console.warn(`Comparison data missing for ${format}; using derived fallback from archetypes data`);
                }

                // Load M3 comparison data only on non-mobile to keep M4 load path fast and reliable.
                if (format === 'M4' && !isMobileRuntime) {
                    await loadM3ComparisonData();
                } else if (format === 'M4') {
                    window.m3BaselineData = {};
                    window.m3ArchetypeData = null;
                }
                
                // Load tournament count and date range from main archetype CSV
                let tournamentCount = 0;
                let dateRange = '';
                try {
                    const uniqueTournaments = new Set(archetypesData.map(d => d.tournament_id));
                    tournamentCount = uniqueTournaments.size;
                    
                    // Extract date range with proper date parsing
                    if (archetypesData.length > 0) {
                        const dates = archetypesData.map(d => d.date).filter(d => d);
                        if (dates.length > 0) {
                            const parsedDates = dates.map(d => {
                                const parts = d.split(' ');
                                if (parts.length >= 3) {
                                    const day = parts[0];
                                    const month = parts[1];
                                    const year = parts[2];
                                    const monthMap = {'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'};
                                    const monthNum = monthMap[month] || '01';
                                    const fullYear = '20' + year;
                                    return {original: d, comparable: fullYear + monthNum + day.padStart(2, '0')};
                                }
                                return {original: d, comparable: '99999999'};
                            });
                            
                            const minDateObj = parsedDates.reduce((a, b) => a.comparable < b.comparable ? a : b);
                            const maxDateObj = parsedDates.reduce((a, b) => a.comparable > b.comparable ? a : b);
                            dateRange = `${minDateObj.original} - ${maxDateObj.original}`;
                        }
                    }
                } catch (e) {
                    console.warn('Could not load tournament data:', e);
                }
                
                window._cityLeagueTournamentCount = tournamentCount;
                window._cityLeagueDateRange = dateRange;
                renderCityLeagueTable(tournamentCount, dateRange);

                // Keep the analysis dropdown in sync with the freshly loaded format data
                window.cityLeagueAnalysisData = analysisData;
                window.cityLeagueArchetypesData = archetypesData;
                window.cityLeagueComparisonData = cityLeagueData;
                const previousDeckValue = document.getElementById('cityLeagueDeckSelect')?.value || '';
                populateCityLeagueDeckSelect(analysisData, cityLeagueData);

                const deckSelect = document.getElementById('cityLeagueDeckSelect');
                // populateCityLeagueDeckSelect may have applied a pending selection — respect it
                const currentValue = deckSelect ? deckSelect.value : '';
                let restoredSelection = currentValue; // already set by pending
                if (!currentValue && deckSelect && previousDeckValue) {
                    const stillExists = Array.from(deckSelect.options).some(option => option.value === previousDeckValue);
                    if (stillExists) {
                        deckSelect.value = previousDeckValue;
                        restoredSelection = previousDeckValue;
                        syncSearchableSelectDisplay(deckSelect);
                    }
                }
                if (!restoredSelection && deckSelect) {
                    deckSelect.value = '';
                }

                if (restoredSelection) {
                    // Reload analysis for the restored deck with the new data
                    loadCityLeagueDeckData(restoredSelection);
                } else {
                    clearCityLeagueDeckView();
                }
                
                // Render tier list banner view
                await renderCityLeagueTierList(analysisData);
                
                window.cityLeagueLoaded = true;
            } catch (error) {
                console.error('Error loading City League data:', error);
                content.innerHTML = '<div class="error">Error loading City League Meta data</div>';
            }
        }
        
        // Cached city league sort results (invalidated when data changes)
        let _cityLeagueSortCache = null;
        let _cityLeagueSortDataRef = null;

        function getCityLeagueSortedSections(data) {
            // Return cached result if data reference hasn't changed
            if (_cityLeagueSortCache && _cityLeagueSortDataRef === data) return _cityLeagueSortCache;
            
            const newArchetypes = data.filter(d => d.status === 'NEU');
            const disappeared = data.filter(d => d.status === 'VERSCHWUNDEN');
            const increased = data.filter(d => d.status !== 'NEU' && parseInt(d.count_change || 0) > 0)
                .sort((a, b) => parseInt(b.count_change) - parseInt(a.count_change));
            const decreased = data.filter(d => parseInt(d.count_change || 0) < 0)
                .sort((a, b) => parseInt(a.count_change) - parseInt(b.count_change));
            
            const maxCountForThreshold = Math.max(...data.map(d => parseInt(d.new_count || 0)));
            const countThreshold = maxCountForThreshold * 0.1;
            
            const improvers = data
                .filter(d => parseFloat((d.avg_placement_change || '0').replace(',', '.')) < 0 && parseInt(d.new_count || 0) >= countThreshold)
                .sort((a, b) => parseFloat((a.avg_placement_change || '0').replace(',', '.')) - parseFloat((b.avg_placement_change || '0').replace(',', '.')))
                .slice(0, 10);
            
            const decliners = data
                .filter(d => parseFloat((d.avg_placement_change || '0').replace(',', '.')) > 0 && parseInt(d.new_count || 0) >= countThreshold)
                .sort((a, b) => parseFloat((b.avg_placement_change || '0').replace(',', '.')) - parseFloat((a.avg_placement_change || '0').replace(',', '.')))
                .slice(0, 10);
            
            const sorted = [...data].sort((a, b) => parseInt(b.new_count || 0) - parseInt(a.new_count || 0));
            
            // PERFORMANCE: compute and cache all derived sorts here so renderCityLeagueTable never re-sorts
            const topByCount = sorted.slice(0, 3);
            const maxCount = parseInt(topByCount[0]?.new_count || 0);
            const minCountThreshold = maxCount * 0.1;
            const topByPlacement = [...data]
                .filter(d => parseInt(d.new_count || 0) >= minCountThreshold)
                .sort((a, b) => parseFloat((a.new_avg_placement || '0').replace(',', '.')) - parseFloat((b.new_avg_placement || '0').replace(',', '.')))
                .slice(0, 3);
            const top10New = sorted.slice(0, 10).map(d => d.archetype);
            const top10Old = [...data]
                .sort((a, b) => parseInt(b.old_count || 0) - parseInt(a.old_count || 0))
                .slice(0, 10).map(d => d.archetype);
            
            _cityLeagueSortDataRef = data;
            _cityLeagueSortCache = { newArchetypes, disappeared, increased, decreased, improvers, decliners, sorted, topByCount, topByPlacement, top10New, top10Old };
            return _cityLeagueSortCache;
        }
        
        // Render City League table with full structure matching original HTML
        function renderCityLeagueTable(tournamentCount = 0, dateRange = '') {
            const content = document.getElementById('cityLeagueContent');
            if (!content || !cityLeagueData || cityLeagueData.length === 0) return;
            
            // Use cached sort results
            const { newArchetypes, disappeared, increased, decreased, improvers, decliners, sorted, topByCount, topByPlacement, top10New, top10Old } = getCityLeagueSortedSections(cityLeagueData);
            const totalArchetypes = cityLeagueData.length;
            
            // Generate timestamp
            const now = new Date();
            const generatedDate = now.toLocaleString('de-DE', { 
                year: 'numeric', month: '2-digit', day: '2-digit', 
                hour: '2-digit', minute: '2-digit', second: '2-digit' 
            });
            
            const maxCount = parseInt(topByCount[0]?.new_count || 0);
            
            const entries = top10New.filter(arch => !top10Old.includes(arch));
            const exits = top10Old.filter(arch => !top10New.includes(arch));
            
            let html = `
                <div id="cityLeagueTierSections"></div>
                <div class="city-league-info-grid">
                    <div class="city-league-info-card">
                        <h3 class="city-league-info-card-title">${t('cl.archetypeOverview')}</h3>
                        <div class="city-league-info-card-total">${totalArchetypes}</div>
                        <div class="city-league-info-card-details">
                            <strong>${t('cl.top3Count')}</strong><br>
                            ${topByCount.map(d => `${d.archetype}: ${d.new_count}x`).join('<br>')}
                            <br><br>
                            <strong>${t('cl.top3Placement')}</strong><br>
                            ${topByPlacement.map(d => `${d.archetype}: ${d.new_avg_placement}`).join('<br>')}
                        </div>
                    </div>
                    <div class="city-league-info-card">
                        <h3 class="city-league-info-card-title">${t('cl.top10Changes')}</h3>
                        <div class="city-league-info-card-details">
                            ${entries.length > 0 ? `<strong class="city-league-info-card-entry">➕ ${t('cl.entries')}</strong><br>${entries.map(arch => `${arch}`).join('<br>')}<br><br>` : ''}
                            ${exits.length > 0 ? `<strong class="city-league-info-card-exit">➖ ${t('cl.exits')}</strong><br>${exits.map(arch => `${arch}`).join('<br>')}<br>` : ''}
                            ${entries.length === 0 && exits.length === 0 ? t('cl.noTop10Changes') : ''}
                        </div>
                    </div>
                    <div class="city-league-info-card">
                        <h3 class="city-league-info-card-title">${t('cl.dataSource')}</h3>
                        <div class="city-league-info-card-details">
                            <strong>${t('cl.period')}</strong><br>${dateRange || 'N/A'}<br><br>
                            <strong>${t('cl.tournaments')}</strong><br>${tournamentCount || 0}
                        </div>
                    </div>
                </div>`;
            
            // Add conditional tables
            if (decreased.length > 0) {
                html += `
                    <div class="city-league-info-table-block">
                        <h2 class="city-league-info-table-title">${t('cl.popDecreases')}</h2>
                        <table class="city-league-info-table">
                            <thead>
                                <tr class="city-league-info-table-header-row">
                                    <th class="city-league-info-table-header city-league-info-table-header-archetype">${t('cl.thArchetype')}</th>
                                    <th class="city-league-info-table-header">${t('cl.thOldCount')}</th>
                                    <th class="city-league-info-table-header">${t('cl.thNewCount')}</th>
                                    <th class="city-league-info-table-header">${t('cl.thChange')}</th>
                                    <th class="city-league-info-table-header">${t('cl.thAvgPlacement')}</th>
                                </tr>
                            </thead>
                            <tbody>`;
                decreased.slice(0, 10).forEach(d => {
                    const change = parseInt(d.count_change || 0);
                    const placement_change = parseFloat((d.avg_placement_change || '0').replace(',', '.'));
                    const placement_color = placement_change < 0 ? '#27ae60' : '#e74c3c';
                    const archetypeEscaped = escapeJsStr(d.archetype);
                    html += `
                        <tr class="city-league-info-table-row" tabindex="0">
                            <td class="city-league-info-table-cell city-league-info-table-cell-archetype" title="${t('cl.goToAnalysis')} ${d.archetype}"><a href="javascript:void(0)" onclick="jumpToCardAnalysis('${archetypeEscaped}', 'cityLeague')" class="archetype-jump-link">${d.archetype}</a></td>
                            <td class="city-league-info-table-cell city-league-info-table-cell-center">${d.old_count}</td>
                            <td class="city-league-info-table-cell city-league-info-table-cell-center">${d.new_count}</td>
                            <td class="city-league-info-table-cell city-league-info-table-cell-center city-league-info-table-cell-exit">${change}</td>
                            <td class="city-league-info-table-cell city-league-info-table-cell-center">${d.new_avg_placement} <span class="city-league-info-table-placement" style="--placement-color: ${placement_color};">(${placement_change > 0 ? '+' : ''}${placement_change.toFixed(2)})</span></td>
                        </tr>`;
                });
                html += `</tbody></table></div>`;
            }
            
            if (improvers.length > 0 || decliners.length > 0) {
                // Container for side-by-side layout (Desktop) / stacked (Mobile)
                html += `<div class="city-league-info-flex">`;
            }
            
            if (improvers.length > 0) {
                // Performance Improvers
                html += `
                    <div class="city-league-info-flex-block">
                        <h2 class="city-league-info-table-title">${t('cl.perfImprovers')}</h2>
                        <table class="city-league-info-table">
                            <thead>
                                <tr class="city-league-info-table-header-row">
                                    <th class="city-league-info-table-header city-league-info-table-header-archetype">${t('cl.thArchetype')}</th>
                                    <th class="city-league-info-table-header">${t('cl.thCount')}</th>
                                    <th class="city-league-info-table-header">${t('cl.thAvgPlacementShort')}</th>
                                </tr>
                            </thead>
                            <tbody>`;
                improvers.slice(0, 10).forEach(d => {
                    const improvement = Math.abs(parseFloat((d.avg_placement_change || '0').replace(',', '.')));
                    const countChange = parseInt(d.new_count) - parseInt(d.old_count);
                    const countChangeText = countChange > 0 ? `+${countChange}` : `${countChange}`;
                    const archetypeEscaped = escapeJsStr(d.archetype);
                    html += `
                        <tr class="city-league-info-table-row" tabindex="0">
                            <td class="city-league-info-table-cell city-league-info-table-cell-archetype" title="${t('cl.goToAnalysis')} ${d.archetype}"><a href="javascript:void(0)" onclick="jumpToCardAnalysis('${archetypeEscaped}', 'cityLeague')" class="archetype-jump-link">${d.archetype}</a></td>
                            <td class="city-league-info-table-cell city-league-info-table-cell-center">${d.new_count} <span class="city-league-info-table-count-change">(${countChangeText})</span></td>
                            <td class="city-league-info-table-cell city-league-info-table-cell-center city-league-info-table-cell-entry">${d.new_avg_placement} <span class="city-league-info-table-placement" style="--placement-color: #27ae60;">(-${improvement.toFixed(2)})</span></td>
                        </tr>`;
                });
                html += `</tbody></table></div>`;
            }
            
            if (decliners.length > 0) {
                // Performance Decliners
                html += `
                    <div class="city-league-info-flex-block">
                        <h2 class="city-league-info-table-title">${t('cl.perfDecliners')}</h2>
                        <table class="city-league-info-table">
                            <thead>
                                <tr class="city-league-info-table-header-row">
                                    <th class="city-league-info-table-header city-league-info-table-header-archetype">${t('cl.thArchetype')}</th>
                                    <th class="city-league-info-table-header">${t('cl.thCount')}</th>
                                    <th class="city-league-info-table-header">${t('cl.thAvgPlacementShort')}</th>
                                </tr>
                            </thead>
                            <tbody>`;
                decliners.slice(0, 10).forEach(d => {
                    const decline = parseFloat((d.avg_placement_change || '0').replace(',', '.'));
                    const countChange = parseInt(d.new_count) - parseInt(d.old_count);
                    const countChangeText = countChange > 0 ? `+${countChange}` : `${countChange}`;
                    const archetypeEscaped = escapeJsStr(d.archetype);
                    html += `
                        <tr class="city-league-info-table-row" tabindex="0">
                            <td class="city-league-info-table-cell city-league-info-table-cell-archetype" title="${t('cl.goToAnalysis')} ${d.archetype}"><a href="javascript:void(0)" onclick="jumpToCardAnalysis('${archetypeEscaped}', 'cityLeague')" class="archetype-jump-link">${d.archetype}</a></td>
                            <td class="city-league-info-table-cell city-league-info-table-cell-center">${d.new_count} <span class="city-league-info-table-count-change">(${countChangeText})</span></td>
                            <td class="city-league-info-table-cell city-league-info-table-cell-center city-league-info-table-cell-exit">${d.new_avg_placement} <span class="city-league-info-table-placement" style="--placement-color: #e74c3c;">(+${decline.toFixed(2)})</span></td>
                        </tr>`;
                });
                html += `</tbody></table></div>`;
            }
            
            // Close flex container if it was opened
            if (improvers.length > 0 || decliners.length > 0) {
                html += `</div>`; // Close flex container
            }
            
            // Full comparison tables - side by side on Desktop
            html += `
                <div class="city-league-info-flex">
                    <!-- Full Comparison Table (Detailed) -->
                    <div class="city-league-info-flex-block city-league-info-flex-block-wide">
                        <h2 class="city-league-info-table-title">${t('cl.fullComparison')}</h2>
                        <div class="city-league-info-search-block">
                            <input type="text" id="cityLeagueSearchFilter" placeholder="${t('cl.searchPlaceholder')}" class="city-league-info-search-input" oninput="debouncedFilterCityLeagueTable()">
                            <div id="cityLeagueSearchResults" class="city-league-info-search-results"></div>
                        </div>
                        <div id="cityLeagueFullTable"></div>
                    </div>
                    <!-- Grouped by Main Pokemon -->
                    <div class="city-league-info-flex-block city-league-info-flex-block-wide">
                        <h2 class="city-league-info-table-title">${t('cl.archetypeCombined')}</h2>
                        <div class="city-league-info-combined-explanation">
                            ${t('cl.combinedExplanation')}
                        </div>
                        <div id="cityLeagueCombinedTable"></div>
                    </div>
                </div>
                <div class="city-league-info-generated-block">
                    <span class="city-league-info-generated-date">📅 ${t('cl.generated')} ${generatedDate}</span>
                    <span class="city-league-info-generated-total">📋 ${t('cl.totalTracked')} ${totalArchetypes}</span>
                </div>`;
            
            content.innerHTML = html;
            
            // Store sorted data globally for filtering
            window.cityLeagueSortedData = sorted;
            
            // Group data by main Pokemon (first word)
            const groupedData = groupByMainPokemon(cityLeagueData);
            
            // Initial render
            renderFullComparisonTable(sorted.slice(0, 30));
            renderCombinedTable(groupedData.slice(0, 20));
            ensureCityLeagueSearchFilterBinding();
            // Phase 1: render meta share chart
            renderMetaChart('cityLeague', sorted);
        }



        function ensureCityLeagueSearchFilterBinding() {
            const searchInput = document.getElementById('cityLeagueSearchFilter');
            if (!searchInput) return;

            // Keep an explicit runtime hook in addition to inline HTML handlers.
            searchInput.oninput = filterCityLeagueTable;
        }
        
        // Group archetypes by main Pokemon (first word/words before space)
        function groupByMainPokemon(data) {
            const grouped = {};
            
            data.forEach(d => {
                // Extract main Pokemon name (everything before first space or whole name)
                // Handle multi-word Pokemon like "mega lucario", "mega froslass", "alolan exeggutor"
                let mainPokemon = d.archetype.toLowerCase();
                
                // Special handling for multi-word Pokemon
                if (mainPokemon.startsWith('mega ')) {
                    const parts = mainPokemon.split(' ');
                    mainPokemon = parts.slice(0, 2).join(' '); // "mega lucario"
                } else if (mainPokemon.startsWith('alolan ') || mainPokemon.startsWith('galarian ') || mainPokemon.startsWith('hisuian ')) {
                    const parts = mainPokemon.split(' ');
                    mainPokemon = parts.slice(0, 2).join(' '); // "alolan exeggutor"
                } else {
                    mainPokemon = mainPokemon.split(' ')[0]; // First word
                }
                
                if (!grouped[mainPokemon]) {
                    grouped[mainPokemon] = {
                        main: mainPokemon,
                        new_count: 0,
                        old_count: 0,
                        new_placement_sum: 0,
                        old_placement_sum: 0,
                        variants: []
                    };
                }
                
                grouped[mainPokemon].new_count += parseInt(d.new_count || 0);
                grouped[mainPokemon].old_count += parseInt(d.old_count || 0);
                grouped[mainPokemon].new_placement_sum += parseFloat((d.new_avg_placement || '0').replace(',', '.')) * parseInt(d.new_count || 0);
                grouped[mainPokemon].old_placement_sum += parseFloat((d.old_avg_placement || '0').replace(',', '.')) * parseInt(d.old_count || 0);
                grouped[mainPokemon].variants.push(d.archetype);
            });
            
            // Calculate weighted averages and format
            const result = Object.values(grouped).map(g => {
                const new_avg = g.new_count > 0 ? (g.new_placement_sum / g.new_count).toFixed(2) : '0.00';
                const old_avg = g.old_count > 0 ? (g.old_placement_sum / g.old_count).toFixed(2) : '0.00';
                const count_change = g.new_count - g.old_count;
                const avg_change = parseFloat(new_avg) - parseFloat(old_avg);
                
                return {
                    main: g.main,
                    new_count: g.new_count,
                    old_count: g.old_count,
                    count_change: count_change,
                    new_avg_placement: new_avg,
                    old_avg_placement: old_avg,
                    avg_placement_change: avg_change.toFixed(2),
                    variant_count: g.variants.length,
                    variants: g.variants
                };
            });
            
            // Sort by new_count descending
            return result.sort((a, b) => b.new_count - a.new_count);
        }
        
        // Render Combined Table
        async function renderCombinedTable(data) {
            const container = document.getElementById('cityLeagueCombinedTable');
            if (!container) return;
            
            const isMobile = window.innerWidth <= 768;
            let tableHTML = '';
            if (isMobile) {
                // Mobile: Compact Version
                tableHTML = `
                <table class="city-league-info-table city-league-info-table-mobile">
                    <colgroup>
                        <col class="city-league-info-col-main">
                        <col class="city-league-info-col-variants">
                        <col class="city-league-info-col-count">
                        <col class="city-league-info-col-placement">
                    </colgroup>
                    <thead>
                        <tr class="city-league-info-table-header-row">
                            <th class="city-league-info-table-header city-league-info-table-header-archetype">${t('cl.thMainPokemon')}</th>
                            <th class="city-league-info-table-header">${t('cl.thVariants')}</th>
                            <th class="city-league-info-table-header">${t('cl.thCount')}</th>
                            <th class="city-league-info-table-header">${t('cl.thAvgPlacementShort')}</th>
                        </tr>
                    </thead>
                    <tbody>`;

                data.forEach(d => {
                    const changeValue = parseInt(d.count_change || 0);
                    const changeColor = changeValue > 0 ? '#27ae60' : changeValue < 0 ? '#e74c3c' : '#95a5a6';
                    const placementChange = parseFloat(d.avg_placement_change || '0');
                    const placementColor = placementChange < 0 ? '#27ae60' : placementChange > 0 ? '#e74c3c' : '#95a5a6';
                    const displayName = d.main.charAt(0).toUpperCase() + d.main.slice(1);
                    const variantsJson = encodeURIComponent(JSON.stringify(d.variants || []));

                    tableHTML += `
                        <tr class="city-league-info-table-row city-league-info-table-row-mobile" title="${d.variants.join(', ')}">
                            <td class="city-league-info-table-cell city-league-info-table-cell-archetype city-league-info-table-cell-main-mobile" onclick="analyzeCombinedArchetype('${escapeJsStr(d.main || '')}', '${variantsJson}')" title="${t('cl.analyzeVariants')}">${displayName}</td>
                            <td class="city-league-info-table-cell city-league-info-table-cell-center city-league-info-table-cell-variants-mobile">${d.variant_count}</td>
                            <td class="city-league-info-table-cell city-league-info-table-cell-center city-league-info-table-cell-count-mobile">${d.new_count} <span class="city-league-info-table-count-change-mobile" style="color: ${changeColor};">(${changeValue > 0 ? '+' : ''}${changeValue})</span></td>
                            <td class="city-league-info-table-cell city-league-info-table-cell-center city-league-info-table-cell-placement-mobile">${d.new_avg_placement} <span class="city-league-info-table-placement-mobile" style="color: ${placementColor};">(${placementChange > 0 ? '+' : ''}${placementChange.toFixed(2)})</span></td>
                        </tr>`;
                });

                tableHTML += `</tbody></table>`;
            } else {
                // Desktop: Full Version
                tableHTML = `
                <table class="city-league-info-table city-league-info-table-desktop">
                    <thead>
                        <tr class="city-league-info-table-header-row">
                            <th class="city-league-info-table-header city-league-info-table-header-archetype">${t('cl.thMainPokemon')}</th>
                            <th class="city-league-info-table-header">${t('cl.thVariants')}</th>
                            <th class="city-league-info-table-header">${t('cl.thCount')}</th>
                            <th class="city-league-info-table-header">${t('cl.thAvgPlacementShort')}</th>
                        </tr>
                    </thead>
                    <tbody>`;
            
                data.forEach(d => {
                    const changeValue = parseInt(d.count_change || 0);
                    const changeColor = changeValue > 0 ? '#27ae60' : changeValue < 0 ? '#e74c3c' : '#95a5a6';
                    const changeText = changeValue > 0 ? `+${changeValue}` : `${changeValue}`;
                    
                    const placementChange = parseFloat(d.avg_placement_change || '0');
                    const placementColor = placementChange < 0 ? '#27ae60' : placementChange > 0 ? '#e74c3c' : '#95a5a6';
                    const placementText = placementChange > 0 ? `+${placementChange.toFixed(2)}` : placementChange.toFixed(2);
                    
                    // Capitalize first letter
                    const displayName = d.main.charAt(0).toUpperCase() + d.main.slice(1);
                    const variantsJson = encodeURIComponent(JSON.stringify(d.variants || []));
                    
                    tableHTML += `
                        <tr class="city-league-info-table-row city-league-info-table-row-desktop" title="${d.variants.join(', ')}">
                            <td class="city-league-info-table-cell city-league-info-table-cell-archetype city-league-info-table-cell-main-desktop" onclick="analyzeCombinedArchetype('${escapeJsStr(d.main || '')}', '${variantsJson}')" title="${t('cl.analyzeVariants')}">${displayName}</td>
                            <td class="city-league-info-table-cell city-league-info-table-cell-center city-league-info-table-cell-variants-desktop">${d.variant_count}</td>
                            <td class="city-league-info-table-cell city-league-info-table-cell-center city-league-info-table-cell-count-desktop">${d.new_count} <span class="city-league-info-table-count-change-desktop" style="--change-color: ${changeColor};">(${changeText})</span></td>
                            <td class="city-league-info-table-cell city-league-info-table-cell-center city-league-info-table-cell-placement-desktop">${d.new_avg_placement} <span class="city-league-info-table-placement-desktop" style="--placement-color: ${placementColor};">(${placementText})</span></td>
                        </tr>`;
                })
                
                tableHTML += `</tbody></table>`;
            }
            
            container.innerHTML = tableHTML;
        }
        
        // Render Full Comparison Table
        function renderFullComparisonTable(data) {
            const container = document.getElementById('cityLeagueFullTable');
            if (!container) return;
            
            const isMobile = window.innerWidth <= 768;
            let tableHTML = '';
            
            if (isMobile) {
                // Mobile: Kompakte Version
                tableHTML = `
                <table class="city-league-info-table city-league-info-table-mobile">
                    <colgroup>
                        <col class="city-league-info-col-main">
                        <col class="city-league-info-col-count">
                        <col class="city-league-info-col-placement">
                    </colgroup>
                    <thead>
                        <tr class="city-league-info-table-header-row">
                            <th class="city-league-info-table-header city-league-info-table-header-archetype">${t('cl.thDeck')}</th>
                            <th class="city-league-info-table-header">${t('cl.thCount')}</th>
                            <th class="city-league-info-table-header">${t('cl.thAvgPlacementShort')}</th>
                        </tr>
                    </thead>
                    <tbody>`;
                
                data.forEach(d => {
                    const changeValue = parseInt(d.count_change || 0);
                    const changeColor = changeValue > 0 ? '#27ae60' : changeValue < 0 ? '#e74c3c' : '#95a5a6';
                    const placementChange = parseFloat((d.avg_placement_change || '0').replace(',', '.'));
                    const placementColor = placementChange < 0 ? '#27ae60' : placementChange > 0 ? '#e74c3c' : '#95a5a6';
                    const archetypeEscaped = escapeJsStr(d.archetype);
                    
                    tableHTML += `
                        <tr class="city-league-info-table-row city-league-info-table-row-mobile" title="${t('cl.goToAnalysis')} ${escapeHtml(d.archetype)}">
                            <td class="city-league-info-table-cell city-league-info-table-cell-archetype city-league-info-table-cell-main-mobile"><a href="javascript:void(0)" onclick="jumpToCardAnalysis('${archetypeEscaped}', 'cityLeague')" class="archetype-jump-link">${escapeHtml(d.archetype)}</a></td>
                            <td class="city-league-info-table-cell city-league-info-table-cell-center city-league-info-table-cell-count-mobile">${d.new_count} <span class="city-league-info-table-count-change-mobile" style="color: ${changeColor};">(${changeValue > 0 ? '+' : ''}${changeValue})</span></td>
                            <td class="city-league-info-table-cell city-league-info-table-cell-center city-league-info-table-cell-placement-mobile">${d.new_avg_placement} <span class="city-league-info-table-placement-mobile" style="color: ${placementColor};">(${placementChange > 0 ? '+' : ''}${placementChange.toFixed(2)})</span></td>
                        </tr>`;
                });
                
                tableHTML += `</tbody></table>`;
            } else {
                // Desktop: Kompakte Version mit Aenderungen in Klammern
                tableHTML = `
                <table class="city-league-info-table city-league-info-table-desktop">
                    <thead>
                        <tr class="city-league-info-table-header-row">
                            <th class="city-league-info-table-header city-league-info-table-header-archetype">${t('cl.thArchetype')}</th>
                            <th class="city-league-info-table-header">${t('cl.thCount')}</th>
                            <th class="city-league-info-table-header">${t('cl.thAvgPlacementShort')}</th>
                        </tr>
                    </thead>
                    <tbody>`;
            
                data.forEach(d => {
                    const changeValue = parseInt(d.count_change || 0);
                    const changeColor = changeValue > 0 ? '#27ae60' : changeValue < 0 ? '#e74c3c' : '#95a5a6';
                    const changeText = changeValue > 0 ? `+${changeValue}` : `${changeValue}`;
                    
                    const placementChange = parseFloat((d.avg_placement_change || '0').replace(',', '.'));
                    const placementColor = placementChange < 0 ? '#27ae60' : placementChange > 0 ? '#e74c3c' : '#95a5a6';
                    const placementText = placementChange > 0 ? `+${placementChange.toFixed(2)}` : placementChange.toFixed(2);
                    const archetypeEscaped = escapeJsStr(d.archetype);
                    
                    tableHTML += `
                        <tr class="city-league-info-table-row city-league-info-table-row-desktop" title="${t('cl.goToAnalysis')} ${escapeHtml(d.archetype)}">
                            <td class="city-league-info-table-cell city-league-info-table-cell-archetype city-league-info-table-cell-main-desktop"><a href="javascript:void(0)" onclick="jumpToCardAnalysis('${archetypeEscaped}', 'cityLeague')" class="archetype-jump-link">${escapeHtml(d.archetype)}</a></td>
                            <td class="city-league-info-table-cell city-league-info-table-cell-center city-league-info-table-cell-count-desktop">${d.new_count} <span class="city-league-info-table-count-change-desktop" style="color: ${changeColor};">(${changeText})</span></td>
                            <td class="city-league-info-table-cell city-league-info-table-cell-center city-league-info-table-cell-placement-desktop">${d.new_avg_placement} <span class="city-league-info-table-placement-desktop" style="color: ${placementColor};">(${placementText})</span></td>
                        </tr>`;
                });
                
                tableHTML += `</tbody></table>`;
            }
            
            container.innerHTML = tableHTML;
        }
        
        // Filter City League Table
        const debouncedFilterCityLeagueTable = debounce(filterCityLeagueTable, 250);
        function filterCityLeagueTable() {
            const searchInput = document.getElementById('cityLeagueSearchFilter');
            const resultsDiv = document.getElementById('cityLeagueSearchResults');
            if (!searchInput || !window.cityLeagueSortedData) return;
            
            const searchText = searchInput.value.trim();
            
            // If empty, show top 30
            if (!searchText) {
                renderFullComparisonTable(window.cityLeagueSortedData.slice(0, 30));
                resultsDiv.textContent = '';
                return;
            }
            
            // Split by comma and trim
            const searchTerms = searchText.split(',').map(term => term.trim().toLowerCase()).filter(term => term);
            
            // Filter: show decks that contain ANY of the search terms
            const filtered = window.cityLeagueSortedData.filter(d => {
                const archetype = d.archetype.toLowerCase();
                return searchTerms.some(term => archetype.includes(term));
            });
            
            // Render filtered results
            renderFullComparisonTable(filtered);
            
            // Update results info
            if (filtered.length === 0) {
                resultsDiv.textContent = t('cl.noResults');
                resultsDiv.classList.remove('results-success');
                resultsDiv.classList.add('results-error');
            } else {
                resultsDiv.textContent = `${filtered.length} ${t('cl.resultsFound')}`;
                resultsDiv.classList.remove('results-error');
                resultsDiv.classList.add('results-success');
            }
        }

        // Explicit window bindings for deterministic E2E and inline event compatibility.
        window.filterCityLeagueTable = filterCityLeagueTable;
        window.switchCityLeagueFormat = switchCityLeagueFormat;
        
        // Load City League Analysis
        async function loadCityLeagueAnalysis() {
            devLog('Loading City League Analysis...');
            
            const format = window.currentCityLeagueFormat || 'M4';
            const formatSuffix = format === 'M3' ? '_M3' : '';
            const timestamp = new Date().getTime();
            const analysisUrl = `${BASE_PATH}city_league_analysis${formatSuffix}.csv`;
            const archetypesUrl = `${BASE_PATH}city_league_archetypes${formatSuffix}.csv`;
            const comparisonUrl = `${BASE_PATH}city_league_archetypes_comparison${formatSuffix}.csv`;
            const hasComparisonFile = format !== 'M3';
            
            devLog(`Loading City League Analysis for format: ${format}`);

            const [analysisText, archetypesText, comparisonText] = await Promise.all([
                fetch(`${analysisUrl}?t=${timestamp}`)
                    .then(response => response.ok ? response.text() : null)
                    .catch(error => {
                        console.error(`Error loading analysis CSV (${analysisUrl}):`, error);
                        return null;
                    }),
                fetch(`${archetypesUrl}?t=${timestamp}`)
                    .then(response => response.ok ? response.text() : null)
                    .catch(error => {
                        console.error(`Error loading archetypes CSV (${archetypesUrl}):`, error);
                        return null;
                    }),
                hasComparisonFile
                    ? fetch(`${comparisonUrl}?t=${timestamp}`)
                        .then(response => response.ok ? response.text() : null)
                        .catch(error => {
                            console.warn(`Ignoring missing comparison CSV (${comparisonUrl}):`, error);
                            return null;
                        })
                    : Promise.resolve(null)
            ]);

            const data = analysisText ? await fetchAndParseCSV(analysisUrl) : null;
            const archetypesData = archetypesText ? await fetchAndParseCSV(archetypesUrl) : null;
            const comparisonData = comparisonText ? await fetchAndParseCSV(comparisonUrl) : deriveCityLeagueComparisonData(archetypesData || []);

            devLog('Loaded data:', data ? `${data.length} rows` : 'null');
            devLog('Loaded archetypes data:', archetypesData ? `${archetypesData.length} rows` : 'null');
            devLog('Loaded comparison data:', comparisonData ? `${comparisonData.length} rows` : 'null');

            if (data && data.length > 0 && archetypesData && archetypesData.length > 0) {
                devLog('Processing archetypes...');
                window.cityLeagueAnalysisData = data;
                window.cityLeagueArchetypesData = archetypesData;
                window.cityLeagueComparisonData = comparisonData;
                const previousDeckValue = document.getElementById('cityLeagueDeckSelect')?.value || '';
                populateCityLeagueDeckSelect(data, comparisonData);
                const deckSelect = document.getElementById('cityLeagueDeckSelect');
                // Respect value already set by populateCityLeagueDeckSelect (pending selection)
                const currentValue = deckSelect ? deckSelect.value : '';
                let restoredAnalysisDeck = currentValue;
                if (!currentValue && deckSelect && previousDeckValue) {
                    const stillExists = Array.from(deckSelect.options).some(option => option.value === previousDeckValue);
                    if (stillExists) {
                        deckSelect.value = previousDeckValue;
                        restoredAnalysisDeck = previousDeckValue;
                        syncSearchableSelectDisplay(deckSelect);
                    }
                }
                // Reload analysis for restored deck with fresh data
                if (restoredAnalysisDeck) {
                    loadCityLeagueDeckData(restoredAnalysisDeck);
                }
                window.cityLeagueAnalysisLoaded = true;
                
                // Load meta card analysis for consistency calculations
                devLog('Loading meta card analysis for consistency...');
                loadMetaCardAnalysis('cityLeague');
            } else {
                const tableContainer = document.getElementById('cityLeagueAnalysisTable');
                if (tableContainer) {
                    const errorMsg = 'Error loading City League Analysis data';
                    console.error(errorMsg, { format, hasAnalysis: !!data, hasArchetypes: !!archetypesData });
                    tableContainer.innerHTML = `<div class="error">${errorMsg}</div>`;
                }
            }
        }
        
        function populateCityLeagueDeckSelect(data, comparisonData) {
            // Always use FULL (unfiltered) archetype data for deck counts in the
            // dropdown so the number reflects the total meta regardless of date filter.
            // The date-specific "Used Decks" count is shown separately in Deck Stats.
            const allArchetypesData = window.cityLeagueArchetypesData || [];

            const archetypeCountMap = new Map();
            allArchetypesData.forEach(row => {
                const archetypeName = String(row.archetype || '').trim();
                if (!archetypeName) return;

                const key = archetypeName.toLowerCase();
                archetypeCountMap.set(key, (archetypeCountMap.get(key) || 0) + 1);
            });

            // Create a map of archetype names to their current deck counts from comparison data
            const comparisonMap = new Map();
            if (comparisonData && comparisonData.length > 0) {
                comparisonData.forEach(row => {
                    if (row.archetype && row.new_count) {
                        comparisonMap.set(row.archetype.toLowerCase(), parseInt(row.new_count || 0));
                    }
                });
                devLog('Loaded comparison counts for', comparisonMap.size, 'archetypes');
            }
            
            // Extract unique archetypes with their deck counts (total meta counts)
            const archetypeMap = new Map();
            const sourceRows = allArchetypesData.length > 0 ? allArchetypesData : data;
            sourceRows.forEach(row => {
                if (row.archetype && !archetypeMap.has(row.archetype)) {
                    // Use total meta counts so dropdown always shows full picture.
                    const deckCount = archetypeCountMap.get(row.archetype.toLowerCase())
                        || comparisonMap.get(row.archetype.toLowerCase())
                        || parseInt(row.total_decks_in_archetype || 0, 10)
                        || 0;
                    archetypeMap.set(row.archetype, {
                        name: row.archetype,
                        deckCount: deckCount
                    });
                }
            });
            
            const archetypeList = Array.from(archetypeMap.values());
            devLog('Found archetypes:', archetypeList.length);
            
            // Sort by deck count descending to get top meta decks
            const sortedByMeta = [...archetypeList].sort((a, b) => b.deckCount - a.deckCount);
            const top10 = sortedByMeta.slice(0, 10);
            const rest = sortedByMeta.slice(10).sort((a, b) => a.name.localeCompare(b.name));
            
            devLog('Top 10 meta decks:', top10.map(d => `${d.name} (${d.deckCount})`));
            
            const select = document.getElementById('cityLeagueDeckSelect');
            if (!select) return;
            
            // Clear and repopulate
            select.innerHTML = '<option value="">' + t('cl.selectDeck') + '</option>';
            
            // Add top 10 meta decks
            if (top10.length > 0) {
                const topGroup = document.createElement('optgroup');
                topGroup.label = t('cl.topMetaDecks');
                top10.forEach(archetype => {
                    const option = document.createElement('option');
                    option.value = archetype.name;
                    option.textContent = `${archetype.name} (${archetype.deckCount} ${t('cl.decks')})`;
                    topGroup.appendChild(option);
                });
                select.appendChild(topGroup);
            }
            
            // Add remaining decks alphabetically
            if (rest.length > 0) {
                const restGroup = document.createElement('optgroup');
                restGroup.label = t('cl.allOtherDecks');
                rest.forEach(archetype => {
                    const option = document.createElement('option');
                    option.value = archetype.name;
                    option.textContent = `${archetype.name} (${archetype.deckCount} ${t('cl.decks')})`;
                    restGroup.appendChild(option);
                });
                select.appendChild(restGroup);
            }
            

            // Add combined (multi-variant) archetypes at end of alphabet
            const combinedGroupMap = {};
            archetypeList.forEach(archetype => {
                let main = archetype.name.toLowerCase();
                if (main.startsWith('mega ') || main.startsWith('alolan ') || main.startsWith('galarian ') || main.startsWith('hisuian ')) {
                    main = main.split(' ').slice(0, 2).join(' ');
                } else {
                    main = main.split(' ')[0];
                }
                if (!combinedGroupMap[main]) combinedGroupMap[main] = { main, totalDecks: 0, variants: [] };
                combinedGroupMap[main].totalDecks += archetype.deckCount;
                combinedGroupMap[main].variants.push(archetype.name);
            });
            const combinedGroups = Object.values(combinedGroupMap)
                .filter(g => g.variants.length >= 2)
                .sort((a, b) => a.main.localeCompare(b.main));
            if (combinedGroups.length > 0) {
                const combinedOptGroup = document.createElement('optgroup');
                combinedOptGroup.label = t('cl.combinedArchetypes');
                combinedGroups.forEach(g => {
                    const opt = document.createElement('option');
                    opt.value = 'GROUP:' + g.variants.join('|');
                    opt.textContent = `🧩 ${g.main.charAt(0).toUpperCase() + g.main.slice(1)} — ${t('cl.allVariants')} (${g.totalDecks} ${t('cl.decks')})`;
                    combinedOptGroup.appendChild(opt);
                });
                select.appendChild(combinedOptGroup);
            }

            // Add change event listener (for programmatic changes)
            select.onchange = function() {
                if (this.value) {
                    loadCityLeagueDeckData(this.value);
                    devLog('[Dropdown] Archetype selected:', this.value);
                } else {
                    clearCityLeagueDeckView();
                }
            };

            // If navigation requested a specific deck while data was loading, apply it now.
            const pendingDeck = String(window.pendingCityLeagueDeckSelection || '').trim();
            if (pendingDeck) {
                const matchingOption = Array.from(select.options).find(option =>
                    option.value && option.value.toLowerCase() === pendingDeck.toLowerCase()
                );
                if (matchingOption) {
                    select.value = matchingOption.value;
                    window.pendingCityLeagueDeckSelection = null;
                    loadCityLeagueDeckData(matchingOption.value);
                    devLog('✅ Applied pending City League deck selection:', matchingOption.value);
                }
            }

            // Apply pending combined archetype selection (from analyzeCombinedArchetype click)
            applyPendingCombinedArchetypeSelection();

            // Convert native <select> to a custom searchable dropdown
            initSearchableSelect(select);
        }

        /**
         * Converts a native <select> into a custom searchable dropdown.
         * The <select> stays hidden for data / programmatic access.
         * A visual overlay with a built-in search input replaces it.
         */
        function initSearchableSelect(selectEl) {
            // Remove previous instance if populateCityLeagueDeckSelect is called again
            const prev = selectEl.parentElement.querySelector('.searchable-select');
            if (prev) prev.remove();

            selectEl.style.display = 'none';

            // --- Wrapper ---
            const wrapper = document.createElement('div');
            wrapper.className = 'searchable-select';

            // --- Display (shows current selection) ---
            const display = document.createElement('div');
            display.className = 'searchable-select-display control-input modern-select';
            display.tabIndex = 0;
            display.textContent = selectEl.options[selectEl.selectedIndex]?.textContent || t('cl.selectDeck');

            // --- Dropdown panel ---
            const dropdown = document.createElement('div');
            dropdown.className = 'searchable-select-dropdown';

            const search = document.createElement('input');
            search.type = 'text';
            search.className = 'searchable-select-search';
            search.placeholder = t('filter.searchDeckPlaceholder') || 'Search deck…';
            search.autocomplete = 'off';

            const list = document.createElement('div');
            list.className = 'searchable-select-options';

            dropdown.appendChild(search);
            dropdown.appendChild(list);

            // --- Build visible option items from <select> ---
            function buildList(filter) {
                list.innerHTML = '';
                const q = (filter || '').toLowerCase().trim();

                // Default "-- Select a Deck --"
                if (!q) {
                    const def = document.createElement('div');
                    def.className = 'searchable-select-option' + (!selectEl.value ? ' selected' : '');
                    def.textContent = selectEl.options[0]?.textContent || '-- Select a Deck --';
                    def.dataset.value = '';
                    def.onclick = () => pick('', def.textContent);
                    list.appendChild(def);
                }

                // Grouped options (<optgroup>)
                Array.from(selectEl.querySelectorAll('optgroup')).forEach(group => {
                    const opts = Array.from(group.querySelectorAll('option')).filter(o =>
                        !q || o.textContent.toLowerCase().includes(q)
                    );
                    if (opts.length === 0) return;

                    const label = document.createElement('div');
                    label.className = 'searchable-select-group';
                    label.textContent = group.label;
                    list.appendChild(label);

                    opts.forEach(o => {
                        const item = document.createElement('div');
                        item.className = 'searchable-select-option' + (o.value === selectEl.value ? ' selected' : '');
                        item.textContent = o.textContent;
                        item.dataset.value = o.value;
                        item.onclick = () => pick(o.value, o.textContent);
                        list.appendChild(item);
                    });
                });

                // Standalone options (not inside <optgroup>)
                Array.from(selectEl.children).forEach(child => {
                    if (child.tagName !== 'OPTION' || child === selectEl.options[0]) return;
                    if (q && !child.textContent.toLowerCase().includes(q)) return;
                    const item = document.createElement('div');
                    item.className = 'searchable-select-option' + (child.value === selectEl.value ? ' selected' : '');
                    item.textContent = child.textContent;
                    item.dataset.value = child.value;
                    item.onclick = () => pick(child.value, child.textContent);
                    list.appendChild(item);
                });
            }

            function pick(value, text) {
                selectEl.value = value;
                display.textContent = text;
                close();
                // Trigger the existing change handler on the hidden <select>
                selectEl.dispatchEvent(new Event('change', { bubbles: true }));
            }

            function open() {
                dropdown.classList.add('open');
                search.value = '';
                buildList('');
                search.focus();
            }

            function close() {
                dropdown.classList.remove('open');
            }

            function isOpen() {
                return dropdown.classList.contains('open');
            }

            display.onclick = (e) => {
                e.stopPropagation();
                isOpen() ? close() : open();
            };

            search.oninput = () => buildList(search.value);
            search.onclick = (e) => e.stopPropagation();

            // Close on outside click
            document.addEventListener('click', (e) => {
                if (!wrapper.contains(e.target)) close();
            });

            // Keyboard: Escape closes
            search.onkeydown = (e) => {
                if (e.key === 'Escape') close();
            };

            wrapper.appendChild(display);
            wrapper.appendChild(dropdown);
            selectEl.parentElement.insertBefore(wrapper, selectEl.nextSibling);

            // Keep display text in sync when select.value changes programmatically
            selectEl._searchableDisplay = display;
        }

        // Helper: update searchable select display when value set externally
        function syncSearchableSelectDisplay(selectEl) {
            if (!selectEl) return;
            var doSync = function() {
                var displayEl = selectEl._searchableDisplay
                    || (selectEl.parentElement && selectEl.parentElement.querySelector('.searchable-select-display'));
                if (displayEl) {
                    var opt = selectEl.options[selectEl.selectedIndex];
                    displayEl.textContent = opt ? opt.textContent : '';
                    selectEl._searchableDisplay = displayEl;
                }
            };
            doSync();
            // Retry once after a tick in case initSearchableSelect hasn't run yet
            setTimeout(doSync, 50);
        }
        
        // Date filter functions for City League
        function getFilteredCityLeagueArchetypesData() {
            const archetypesData = window.cityLeagueArchetypesData || [];
            if (!window.cityLeagueDateFilterActive) {
                return archetypesData;
            }

            const dateFrom = window.cityLeagueDateFrom || '1900-01-01';
            const dateTo = window.cityLeagueDateTo || '2099-12-31';

            return archetypesData.filter(row => {
                const rawDate = row.date || row.tournament_date || '';
                const parsedDate = parseJapaneseDate(rawDate);
                return parsedDate ? parsedDate >= dateFrom && parsedDate <= dateTo : false;
            });
        }

        function getCityLeagueArchetypeStats(archetype) {
            const selection = parseArchetypeSelection(archetype);
            const targetsLower = selection.targetArchetypes.map(v => v.toLowerCase());

            const matches = getFilteredCityLeagueArchetypesData().filter(row => {
                const rowArch = String(row.archetype || '').trim().toLowerCase();
                return rowArch && targetsLower.includes(rowArch);
            });

            const decksCount = matches.length;
            const avgPlacement = matches.length > 0
                ? (matches.reduce((sum, row) => sum + parseInt(row.placement || 0, 10), 0) / matches.length).toFixed(2)
                : '-';

            return {
                rows: matches,
                decksCount,
                avgPlacement
            };
        }

        function getSelectedCityLeagueDeckCount(archetype) {
            const selectEl = document.getElementById('cityLeagueDeckSelect');
            if (!selectEl || !archetype) return 0;

            const option = Array.from(selectEl.options).find(o => o.value === archetype);
            const label = option ? option.textContent : '';
            const match = label ? label.match(/\((\d+)\s+Decks\)/i) : null;
            return match ? parseInt(match[1], 10) || 0 : 0;
        }

        function applyPendingCombinedArchetypeSelection() {
            const pending = window.pendingCombinedArchetypeSelection;
            if (!pending) return;
            const select = document.getElementById('cityLeagueDeckSelect');
            if (!select || select.options.length <= 1) return;
            window.pendingCombinedArchetypeSelection = null;
            // Option should exist in the combined optgroup; add a temporary one if not
            let option = Array.from(select.options).find(opt => opt.value === pending.value);
            if (!option) {
                option = document.createElement('option');
                option.value = pending.value;
                option.textContent = pending.label;
                select.appendChild(option);
            }
            select.value = pending.value;
            syncSearchableSelectDisplay(select);
            loadCityLeagueDeckData(pending.value);
            devLog('✅ Applied combined archetype:', pending.value.replace('GROUP:', '').split('|')[0]);
        }

        function refreshCityLeagueDeckSelect() {
            const select = document.getElementById('cityLeagueDeckSelect');
            const previousValue = select ? select.value : '';

            populateCityLeagueDeckSelect(window.cityLeagueAnalysisData || [], window.cityLeagueComparisonData || []);

            if (!select) return '';

            const currentValue = select.value; // populateCityLeagueDeckSelect may have applied pending
            if (currentValue) {
                syncSearchableSelectDisplay(select);
                return currentValue;
            }

            const stillExists = Array.from(select.options).some(option => option.value === previousValue);
            if (stillExists && previousValue) {
                select.value = previousValue;
                syncSearchableSelectDisplay(select);
            } else {
                select.value = '';
            }
            return select.value;
        }

        function resetCityLeagueDateFilter() {
            const dateFromEl = document.getElementById('cityLeagueDateFrom');
            const dateToEl = document.getElementById('cityLeagueDateTo');
            
            if (dateFromEl) dateFromEl.value = '';
            if (dateToEl) dateToEl.value = '';
            
            window.cityLeagueDateFilterActive = false;
            updateCityLeagueDateFilterStatus();
            
            const selectedArchetype = refreshCityLeagueDeckSelect();
            if (selectedArchetype) {
                loadCityLeagueDeckData(selectedArchetype);
            } else {
                clearCityLeagueDeckView();
            }
        }
        
        function applyCityLeagueDateFilter() {
            const dateFromEl = document.getElementById('cityLeagueDateFrom');
            const dateToEl = document.getElementById('cityLeagueDateTo');
            const dateFrom = dateFromEl ? dateFromEl.value : '';
            const dateTo = dateToEl ? dateToEl.value : '';
            
            // Set filter active if at least one date is set
            if (dateFrom || dateTo) {
                window.cityLeagueDateFilterActive = true;
                window.cityLeagueDateFrom = dateFrom || '1900-01-01';
                window.cityLeagueDateTo = dateTo || '2099-12-31';
            } else {
                // If both dates are cleared, disable filter
                window.cityLeagueDateFilterActive = false;
            }
            
            updateCityLeagueDateFilterStatus();
            
            const selectedArchetype = refreshCityLeagueDeckSelect();
            if (selectedArchetype) {
                loadCityLeagueDeckData(selectedArchetype);
            } else {
                clearCityLeagueDeckView();
            }
        }
        
        function updateCityLeagueDateFilterStatus() {
            const statusEl = document.getElementById('cityLeagueDateFilterStatus');
            if (!statusEl) return;
            
            const dateFromEl = document.getElementById('cityLeagueDateFrom');
            const dateToEl = document.getElementById('cityLeagueDateTo');
            const dateFrom = dateFromEl ? dateFromEl.value : '';
            const dateTo = dateToEl ? dateToEl.value : '';
            
            if (dateFrom && dateTo) {
                statusEl.textContent = `${t('cl.filteredRange')} ${formatDate(dateFrom)} to ${formatDate(dateTo)}`;
                statusEl.className = 'city-league-status city-league-status-active';
            } else if (dateFrom) {
                statusEl.textContent = `${t('cl.filteredFrom')} ${formatDate(dateFrom)}`;
                statusEl.className = 'city-league-status city-league-status-active';
            } else if (dateTo) {
                statusEl.textContent = `${t('cl.filteredUntil')} ${formatDate(dateTo)}`;
                statusEl.className = 'city-league-status city-league-status-active';
            } else {
                statusEl.textContent = t('cl.showingAll');
                statusEl.className = 'city-league-status city-league-status-inactive';
            }
        }
        
        function formatDate(dateStr) {
            if (!dateStr) return '';
            const date = new Date(dateStr + 'T00:00:00');
            const day = date.getDate();
            const month = date.getMonth() + 1;
            const year = date.getFullYear();
            return `${day.toString().padStart(2, '0')}.${month.toString().padStart(2, '0')}.${year}`;
        }
        
        function getCityLeagueDeckCountFallback(archetype) {
            if (!archetype) return 0;

            const selection = parseArchetypeSelection(archetype);
            const targetsLower = selection.targetArchetypes.map(v => v.toLowerCase());

            const liveStats = getCityLeagueArchetypeStats(archetype);
            if (liveStats.decksCount > 0) return liveStats.decksCount;

            // 1) Prefer comparison dataset (new_count)
            const comparisonRows = window.cityLeagueComparisonData || [];
            const comparisonCount = comparisonRows
                .filter(row => row.archetype && targetsLower.includes(String(row.archetype).toLowerCase()))
                .reduce((sum, row) => sum + (parseInt(row.new_count || row.count || row.total_decks_in_archetype || 0, 10) || 0), 0);
            if (comparisonCount > 0) return comparisonCount;

            // 2) Fallback to selected dropdown label: "Archetype (43 Decks)"
            const selectEl = document.getElementById('cityLeagueDeckSelect');
            if (selectEl) {
                const option = Array.from(selectEl.options).find(o => o.value === archetype);
                const label = option ? option.textContent : '';
                const match = label ? label.match(/\((\d+)\s+Decks\)/i) : null;
                if (match) {
                    const parsed = parseInt(match[1], 10);
                    if (parsed > 0) return parsed;
                }
            }

            // 3) Last fallback from analysis rows
            const analysisRows = window.cityLeagueAnalysisData || [];
            const analysisCount = analysisRows
                .filter(row => row.archetype && targetsLower.includes(String(row.archetype).toLowerCase()))
                .reduce((max, row) => Math.max(max, parseInt(row.total_decks_in_archetype || 0, 10) || 0), 0);
            return analysisCount > 0 ? analysisCount : 0;
        }

        // Parse tournament dates to YYYY-MM-DD (supports multiple formats)
        function parseJapaneseDate(dateStr) {
            if (!dateStr || dateStr.trim() === '') return '';

            const raw = dateStr.trim();

            // Already ISO-like
            const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (isoMatch) return raw;

            // German/European numeric format: dd.mm.yyyy or dd.mm.yy
            const dotMatch = raw.match(/^(\d{1,2})[.](\d{1,2})[.](\d{2,4})$/);
            if (dotMatch) {
                const day = dotMatch[1].padStart(2, '0');
                const month = dotMatch[2].padStart(2, '0');
                const yearRaw = dotMatch[3];
                const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
                return `${year}-${month}-${day}`;
            }

            // Normalize ordinal suffixes: 14th -> 14
            const cleaned = raw.replace(/(\d+)(st|nd|rd|th)/gi, '$1');
            const parts = cleaned.split(/[.\s]+/).filter(Boolean);
            if (parts.length < 3) return '';

            const day = parts[0].padStart(2, '0');
            const monthStr = parts[1].toLowerCase();
            const yearRaw = parts[2];
            const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;

            const monthMap = {
                jan: '01', january: '01', januar: '01',
                feb: '02', february: '02', februar: '02',
                mar: '03', march: '03', maerz: '03', märz: '03',
                apr: '04', april: '04',
                may: '05', mai: '05',
                jun: '06', june: '06', juni: '06',
                jul: '07', july: '07', juli: '07',
                aug: '08', august: '08',
                sep: '09', sept: '09', september: '09',
                oct: '10', october: '10', oktober: '10',
                nov: '11', november: '11',
                dec: '12', december: '12', dezember: '12'
            };

            const month = monthMap[monthStr];
            if (!month) return '';
            return `${year}-${month}-${day}`;
        }
        
        // Recalculate card statistics based on filtered tournament data
        function recalculateCardStatsForFilteredData(filteredCards, archetype) {
            // Count unique tournaments/decks in filtered data
            const uniqueTournamentIds = new Set();
            filteredCards.forEach(card => {
                if (card.tournament_id) {
                    uniqueTournamentIds.add(card.tournament_id);
                }
            });
            const totalDecks = uniqueTournamentIds.size;
            
            // Group cards by card_name and recalculate stats
            const cardStatsMap = new Map();
            
            filteredCards.forEach(row => {
                const cardName = row.card_name;
                if (!cardStatsMap.has(cardName)) {
                    cardStatsMap.set(cardName, {
                        tournaments: new Set(),
                        counts: [],
                        sampleRow: row
                    });
                }
                
                const stats = cardStatsMap.get(cardName);
                if (row.tournament_id) {
                    stats.tournaments.add(row.tournament_id);
                }
                const count = parseInt(row.count || 0);
                if (count > 0) {
                    stats.counts.push(count);
                }
            });
            
            // Create new cards array with recalculated stats
            const recalculatedCards = [];
            cardStatsMap.forEach((stats, cardName) => {
                const row = { ...stats.sampleRow };
                
                // Recalculate deck_count (how many decks contain this card)
                const deck_count = stats.tournaments.size;
                
                // max_count = actual maximum copies in any single deck
                let max_count = 0;
                if (stats.counts.length > 0) {
                    max_count = Math.max(...stats.counts);
                }
                
                // Recalculate percentage
                const percentage = totalDecks > 0 ? (deck_count / totalDecks * 100) : 0;
                
                // Recalculate average count
                const avg_count = stats.counts.length > 0 
                    ? (stats.counts.reduce((a, b) => a + b, 0) / stats.counts.length) 
                    : 0;
                
                // Update row with recalculated values
                row.deck_count_in_selected = deck_count;
                row.max_count = max_count;
                row.percentage_in_archetype = percentage.toFixed(1);
                row.avg_count = avg_count.toFixed(2);
                row.total_decks_in_archetype = totalDecks;
                
                recalculatedCards.push(row);
            });
            
            devLog(`Recalculated stats for ${recalculatedCards.length} unique cards based on ${totalDecks} filtered tournaments`);
            return recalculatedCards;
        }
        
        // Aggregate card statistics from filtered tournament data
        function aggregateCardStatsByDate(filteredCards) {
            // Group by card_name
            const cardMap = new Map();

            const getAggregationBucketKey = (row) => {
                const tournamentId = String(row.tournament_id || '').trim();
                const period = String(row.period || row.date || row.tournament_date || '').trim();

                if (tournamentId && period) return `${tournamentId}|||${period}`;
                if (tournamentId) return `id:${tournamentId}`;
                if (period) return `period:${period}`;
                return 'global';
            };
            
            // Calculate total decks across all tournaments.
            // For GROUP selections (multiple sub-archetypes), we must SUM
            // deck counts across different archetypes within each tournament,
            // while avoiding double-counting within the same archetype.
            // E.g. Mega Lucario Hariyama (608) + Solrock (196) = 804 in one tournament.
            const tournamentArchetypeDecksMap = new Map();
            filteredCards.forEach(row => {
                const tournamentKey = getAggregationBucketKey(row);
                const archetype = String(row.archetype || '').trim();
                const decksInTournament = parseInt(row.total_decks_in_archetype_in_period || row.total_decks_in_archetype || 0, 10) || 0;
                if (!tournamentArchetypeDecksMap.has(tournamentKey)) {
                    tournamentArchetypeDecksMap.set(tournamentKey, new Map());
                }
                const archetypeMap = tournamentArchetypeDecksMap.get(tournamentKey);
                // Take max per archetype per tournament (avoid double-counting from multiple card rows)
                if (!archetypeMap.has(archetype) || archetypeMap.get(archetype) < decksInTournament) {
                    archetypeMap.set(archetype, decksInTournament);
                }
            });
            // Sum across archetypes within each tournament
            const tournamentDecksMap = new Map();
            tournamentArchetypeDecksMap.forEach((archetypeMap, tournamentKey) => {
                let total = 0;
                archetypeMap.forEach(count => { total += count; });
                tournamentDecksMap.set(tournamentKey, total);
            });
            
            // Sum up decks across all tournaments.
            // If the source rows don't have tournament_date (already aggregated CSV),
            // fall back to the total_decks_in_archetype value carried by the rows.
            let totalDecks = 0;
            tournamentDecksMap.forEach(decks => {
                totalDecks += decks;
            });

            if (totalDecks <= 0) {
                totalDecks = filteredCards.reduce((maxValue, row) => {
                    const rowTotalDecks = parseInt(row.total_decks_in_archetype || row.total_decks || 0, 10) || 0;
                    return Math.max(maxValue, rowTotalDecks);
                }, 0);
            }
            
            devLog('DEBUG: Tournament deck counts:', Array.from(tournamentDecksMap.entries()));
            devLog('DEBUG: Total decks across all tournaments:', totalDecks);
            
            filteredCards.forEach(row => {
                const cardNameRaw = String(row.card_name || row.full_card_name || '').trim();
                const cardName = normalizeCardAggregationKey(cardNameRaw);
                if (!cardName) return;
                
                if (!cardMap.has(cardName)) {
                    const rowWithDisplayName = { ...row, card_name: cardNameRaw || row.card_name || '' };
                    cardMap.set(cardName, {
                        sampleRow: rowWithDisplayName,
                        totalCount: 0,
                        maxCountValues: [],
                        deckCounts: 0,
                        tournamentsWithCard: new Set(),
                        deckCountByTournament: new Map()
                    });
                } else {
                    const cardData = cardMap.get(cardName);
                    // Update sample row if current row has more complete data
                    if (!cardData.sampleRow.image_url && row.image_url) {
                        cardData.sampleRow = { ...row, card_name: cardNameRaw || row.card_name || '' };
                    } else if (!cardData.sampleRow.set_code && row.set_code) {
                        cardData.sampleRow = { ...row, card_name: cardNameRaw || row.card_name || '' };
                    }
                }
                
                const cardData = cardMap.get(cardName);
                
                // Aggregate counts
                cardData.totalCount += parseFloat(String(row.total_count || 0).replace(',', '.')) || 0;
                const maxCount = parseInt(row.max_count || 0);
                if (maxCount > 0) {
                    cardData.maxCountValues.push(maxCount);
                }
                const rowDeckCount = parseInt(row.deck_count || row.deck_inclusion_count || 0, 10) || 0;
                const tournamentKey = getAggregationBucketKey(row);
                cardData.deckCountByTournament.set(
                    tournamentKey,
                    (cardData.deckCountByTournament.get(tournamentKey) || 0) + rowDeckCount
                );
                
                cardData.tournamentsWithCard.add(tournamentKey);
            });
            
            // Create aggregated result
            const result = [];
            
            cardMap.forEach((data, cardName) => {
                const row = { ...data.sampleRow };
                const legalMaxCopies = getLegalMaxCopies(data.sampleRow?.card_name || cardName, data.sampleRow);
                
                // max_count = actual maximum across all tournament periods
                let max_count = 0;
                if (data.maxCountValues.length > 0) {
                    max_count = Math.max(...data.maxCountValues);
                }

                // Recalculate deckCounts per tournament with cap (prevents split-print double counting).
                // Use the corrected tournamentDecksMap which sums across archetypes for GROUP selections.
                let deckCounts = 0;
                data.deckCountByTournament.forEach((sumDeckCount, tournamentKey) => {
                    const decksInTournament = tournamentDecksMap.get(tournamentKey) || 0;
                    const bounded = decksInTournament > 0 ? Math.min(sumDeckCount, decksInTournament) : sumDeckCount;
                    deckCounts += bounded;
                });

                // Single-deck selection: max_count must equal full card copies in that deck (including mixed prints).
                if (totalDecks === 1) {
                    max_count = Math.round(data.totalCount);
                    deckCounts = deckCounts > 0 ? 1 : 0;
                }

                if (max_count > 0) {
                    max_count = Math.min(max_count, legalMaxCopies);
                }

                const cappedTotalCount = deckCounts > 0
                    ? Math.min(data.totalCount, deckCounts * legalMaxCopies)
                    : data.totalCount;
                
                // Calculate percentage based on actual deck counts
                // data.deckCounts is the sum of deck_count values (number of decks containing this card)
                // totalDecks is the sum of total_decks_in_archetype values (total number of decks in all tournaments)
                // Cap at 100 to prevent > 100% values from data anomalies
                const percentage = totalDecks > 0 ? Math.min(100, (deckCounts / totalDecks * 100)) : 0;
                
                // Calculate averages.
                // average_count = average copies in decks that actually use the card.
                // average_count_overall = average copies across all decks in the archetype.
                const avgCountWhenUsed = Math.min(legalMaxCopies, deckCounts > 0 ? (cappedTotalCount / deckCounts) : 0);
                const avgCountOverall = Math.min(legalMaxCopies, totalDecks > 0 ? (cappedTotalCount / totalDecks) : 0);
                
                // Update row and preserve important fields from sampleRow
                row.total_count = cappedTotalCount;
                row.max_count = max_count;
                row.deck_count = deckCounts;
                row.deck_inclusion_count = deckCounts;
                row.deck_count_in_selected = deckCounts; // Number of decks containing this card
                row.total_decks_in_archetype = totalDecks;
                row.percentage_in_archetype = percentage.toFixed(1);
                row.avg_count = avgCountWhenUsed.toFixed(2);
                row.average_count = avgCountWhenUsed.toFixed(2);
                row.average_count_overall = avgCountOverall.toFixed(2);
                // Explicitly preserve these fields from sampleRow
                row.set_code = data.sampleRow.set_code || '';
                row.image_url = data.sampleRow.image_url || '';
                row.rarity = data.sampleRow.rarity || '';
                row.set_number = data.sampleRow.set_number || '';
                
                // Debug: Log M3 cards
                if (row.set_code === 'M3' || (row.image_url && row.image_url.includes('/M3/'))) {
                    devLog(`M3 card aggregated: ${row.card_name}, set_code: ${row.set_code}, url: ${row.image_url}`);
                }
                
                result.push(row);
            });
            
            devLog(`Aggregated ${result.length} unique cards from ${totalDecks} decks across ${tournamentDecksMap.size} tournaments`);
            return result;
        }

        // Persist City League deck state to localStorage
        function saveCityLeagueDeck() {
            try {
                const deck = window.cityLeagueDeck || {};
                const deckSize = Object.keys(deck).length;

                // Avoid storing empty deck payloads
                if (deckSize === 0) {
                    localStorage.removeItem('cityLeagueDeck');
                    devLog('[City League] Deck is empty - removed from localStorage');
                    return;
                }

                const data = {
                    deck: deck,
                    order: window.cityLeagueDeckOrder || [],
                    archetype: window.currentCityLeagueArchetype || null,
                    timestamp: new Date().toISOString()
                };

                localStorage.setItem('cityLeagueDeck', JSON.stringify(data));
                devLog('[City League] Deck saved to localStorage:', deckSize, 'cards');
            } catch (e) {
                console.error('[City League] Error saving deck:', e);
            }
        }

        // Ensure cross-file callers (e.g. app-deck-builder.js) can always access it.
        window.saveCityLeagueDeck = saveCityLeagueDeck;
        
        function loadCityLeagueDeckData(archetype) {
            devLog('Loading deck data for:', archetype);
            const data = window.cityLeagueAnalysisData;
            if (!data) return;

            const selection = parseArchetypeSelection(archetype);

            const archetypeStats = getCityLeagueArchetypeStats(archetype);
            
            // Store current archetype
            window.currentCityLeagueArchetype = archetype;
            
            // Check if we have a saved deck for this archetype
            const savedDeck = localStorage.getItem('cityLeagueDeck');
            if (savedDeck) {
                try {
                    const parsed = JSON.parse(savedDeck);
                    if (parsed.archetype === archetype) {
                        // Deck matches current archetype - already loaded
                        devLog('[loadCityLeagueDeckData] Deck already loaded for this archetype');
                    } else {
                        // Different archetype - CLEAR old deck
                        devLog('[loadCityLeagueDeckData] Clearing old deck from different archetype:', parsed.archetype);
                        window.cityLeagueDeck = {};
                        window.cityLeagueDeckOrder = [];
                        saveCityLeagueDeck();
                    }
                } catch (e) {
                    console.error('[loadCityLeagueDeckData] Error reading saved deck:', e);
                }
            }
            
            // Filter cards for this archetype or GROUP selection
            let deckCards = data.filter(row =>
                selection.targetArchetypes.includes(String(row.archetype || '').trim())
            );
            devLog('Found cards (before date filter):', deckCards.length);
            
            // Apply date filter if active
            if (window.cityLeagueDateFilterActive) {
                const dateFrom = window.cityLeagueDateFrom;
                const dateTo = window.cityLeagueDateTo;
                
                devLog('DEBUG: Filtering by date range:', dateFrom, 'to', dateTo);
                
                const dateDebugSample = [];
                const hasParseableTournamentDates = deckCards.some(row =>
                    !!parseJapaneseDate(row.tournament_date || row.date || '')
                );
                if (!hasParseableTournamentDates) {
                    console.error('[City League] Date filter requires per-tournament card rows (tournament_date). Current analysis CSV is fully aggregated, so share/average metrics cannot be recalculated by date.');
                    window.currentCityLeagueDeckCards = [];
                    window.currentCityLeagueTotalDecks = 0;
                    clearCityLeagueDeckView();

                    const statusEl = document.getElementById('cityLeagueDateFilterStatus');
                    if (statusEl) {
                        statusEl.textContent = 'Date filter active, but card data has no tournament dates. Re-run City League Analysis scraper and regenerate city_league_analysis.csv.';
                        statusEl.classList.add('color-red-light');
                    }
                    return;
                }

                deckCards = deckCards.filter(row => {
                    const rawTournamentDate = row.tournament_date || row.date || '';
                    const tournamentDate = parseJapaneseDate(rawTournamentDate);
                    
                    // Collect first 5 examples for debugging
                    if (dateDebugSample.length < 5) {
                        dateDebugSample.push({
                            raw: rawTournamentDate,
                            parsed: tournamentDate,
                            passes: tournamentDate && tournamentDate >= dateFrom && tournamentDate <= dateTo
                        });
                    }
                    
                    // Strict date filtering: calculations must only use rows with parseable dates in range.
                    if (!tournamentDate) return false;
                    return tournamentDate >= dateFrom && tournamentDate <= dateTo;
                });
                
                devLog('DEBUG: Date filter examples:', dateDebugSample);
                devLog(`Date filter applied (${dateFrom} to ${dateTo}):`, deckCards.length, 'cards');
            }
            
            devLog('Found cards (before deduplication):', deckCards.length);
            
            // Preserve raw per-tournament rows for Recency scoring in Consistency builder
            window.cityLeagueRawDeckCards = deckCards.slice();

            // Always aggregate cards stats (not just when date filter is active)
            // This ensures deck_count is correctly summed across all tournaments
            if (deckCards.length > 0) {
                deckCards = aggregateCardStatsByDate(deckCards);
                devLog('After aggregating by date:', deckCards.length, 'unique cards');
            }
            
            // Dedupliziere: Nur neueste low-rarity Version pro Karte
            deckCards = deduplicateCards(deckCards);
            devLog('Found cards (after deduplication):', deckCards.length);
            
            // Store unfiltered deck cards for filter function
            window.currentCityLeagueDeckCards = deckCards;
            
            // Calculate stats - use max_count which represents typical deck composition
            const totalCardsInDeck = deckCards.reduce((sum, card) => sum + parseInt(card.max_count || 0), 0);
            const uniqueCards = deckCards.length;
            
            // Get current deck count from date-filtered archetype data first,
            // so the stat reflects the active date filter.
            let decksCount = archetypeStats.decksCount
                || getSelectedCityLeagueDeckCount(archetype)
                || parseInt(deckCards[0]?.total_decks_in_archetype || 0, 10);
            if (!decksCount || decksCount <= 0) {
                decksCount = getCityLeagueDeckCountFallback(archetype);
            }
            if (!decksCount || decksCount <= 0) {
                decksCount = '-';
            }
            devLog(`Using deck count from aggregated data: ${decksCount} decks`);
            
            // Calculate average placement from archetypes data
            const avgPlacement = archetypeStats.avgPlacement;
            
            // Store total decks count globally for use in card displays
            window.currentCityLeagueTotalDecks = parseInt(decksCount) || 0;
            devLog(`Stored global deck count: ${window.currentCityLeagueTotalDecks}`);
            
            // Update stats
            updateDeckStatsByIds({
                cityLeagueStatCards: `${uniqueCards} / ${totalCardsInDeck}`,
                cityLeagueStatDecksUsed: decksCount,
                cityLeagueStatAvgPlacement: avgPlacement !== '-' ? avgPlacement : '-'
            }, 'cityLeagueStatsSection');
            
            // Reset button text to show list view option
            const gridButtons = document.querySelectorAll('button[onclick="toggleDeckGridView()"]');
            gridButtons.forEach(btn => btn.textContent = '📋 List View');
            
            // Apply current filter (this renders the grid - do not call renderCityLeagueDeckGrid separately)
            applyCityLeagueFilter();
            
            // DON'T auto-display deck here - let the caller decide
            // (only display when user actively selects archetype from dropdown)
        }
        
        function clearCityLeagueDeckView() {
            ['cityLeagueStatsSection', 'cityLeagueDeckVisual', 'cityLeagueDeckTableView'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.add('d-none');
            });
            resetDeckOverviewCounts('cityLeagueCardCount', 'cityLeagueCardCountSummary', '0 ' + t('cl.cards'), '/ 0 ' + t('cl.total'));
            
            // Reset button text
            const gridButtons = document.querySelectorAll('button[onclick="toggleDeckGridView()"]');
            gridButtons.forEach(btn => btn.textContent = '📋 List View');
        }
        
        function normalizeSetCode(rawSetCode) {
            return String(rawSetCode || '').toUpperCase().trim();
        }

        function normalizeCardNumber(rawCardNumber) {
            const raw = String(rawCardNumber || '').trim();
            if (!raw) return '';

            // Remove query/hash fragments often passed by translated proxy URLs.
            const noFragment = raw.split('?')[0].split('#')[0].trim();
            if (!noFragment) return '';

            // Keep a conservative set for valid card numbers (digits, letters, hyphen, slash).
            const cleaned = noFragment.replace(/[^0-9A-Za-z\-\/]/g, '');
            if (!cleaned) return '';

            // Normalize pure numeric values by dropping leading zeroes.
            if (/^\d+$/.test(cleaned)) {
                return cleaned.replace(/^0+/, '') || '0';
            }

            return cleaned;
        }

        // Helper function to get Limitless Japanese fallback URL for M3/M4 cards
        function getM3JapaneseFallbackUrl(setCode, cardNumber) {
            const num = normalizeCardNumber(cardNumber);
            if (!num) return '';
            const normalizedSet = normalizeSetCode(setCode || 'M3');
            return `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/${normalizedSet}/${normalizedSet}_${num}_R_JP_LG.png`;
        }

        function getIndexedCardBySetNumber(setCode, cardNumber) {
            const normalizedSet = normalizeSetCode(setCode);
            const rawNumber = normalizeCardNumber(cardNumber);
            if (!normalizedSet || !rawNumber) {
                return null;
            }

            if (cardIndexBySetNumber instanceof Map && cardIndexBySetNumber.size > 0) {
                const exactMatch = cardIndexBySetNumber.get(`${normalizedSet}-${rawNumber}`);
                if (exactMatch) return exactMatch;

                const normalizedNumber = /^\d+$/.test(rawNumber) ? (rawNumber.replace(/^0+/, '') || '0') : rawNumber;
                const normalizedMatch = cardIndexBySetNumber.get(`${normalizedSet}-${normalizedNumber}`);
                if (normalizedMatch) return normalizedMatch;

                const paddedMatch = cardIndexBySetNumber.get(`${normalizedSet}-${normalizedNumber.padStart(3, '0')}`);
                if (paddedMatch) return paddedMatch;
            }

            return null;
        }

        function getCanonicalCardRecord(setCode, cardNumber) {
            const indexedCard = getIndexedCardBySetNumber(setCode, cardNumber);
            if (indexedCard) {
                return indexedCard;
            }

            const normalizedSet = normalizeSetCode(setCode);
            const rawNumber = normalizeCardNumber(cardNumber);
            if (!normalizedSet || !rawNumber || !cardsBySetNumberMap) {
                return null;
            }

            const exactKey = `${normalizedSet}-${rawNumber}`;
            if (cardsBySetNumberMap[exactKey]) {
                return cardsBySetNumberMap[exactKey];
            }

            const normalizedNumber = /^\d+$/.test(rawNumber) ? (rawNumber.replace(/^0+/, '') || '0') : rawNumber;
            const normalizedKey = `${normalizedSet}-${normalizedNumber}`;
            if (cardsBySetNumberMap[normalizedKey]) {
                return cardsBySetNumberMap[normalizedKey];
            }

            const paddedNumber = normalizedNumber.padStart(3, '0');
            const paddedKey = `${normalizedSet}-${paddedNumber}`;
            return cardsBySetNumberMap[paddedKey] || null;
        }

        function getUnifiedCardImage(set, number) {
            const normalizedSet = normalizeSetCode(set);
            const rawNumber = normalizeCardNumber(number);
            if (!normalizedSet || !rawNumber) {
                return '';
            }

            const card = getIndexedCardBySetNumber(normalizedSet, rawNumber);

            // 1. Canonical image from all_cards_merged
            if (card && (card.image || card.image_url)) {
                return fixJapaneseCardImageUrl(card.image || card.image_url, normalizedSet, card.name || '', card.number || rawNumber);
            }

            // 2. Proactive PokemonProxies standard route for M3/M4
            if (normalizedSet === 'M3' || normalizedSet === 'M4') {
                return `https://pokemonproxies.com/images/${normalizedSet.toLowerCase()}/${rawNumber}.png`;
            }

            // 3. Last fallback: Japanese Limitless URL
            return getM3JapaneseFallbackUrl(normalizedSet, rawNumber);
        }

        function isBasicEnergyCardEntry(cardLike) {
            if (!cardLike) return false;

            // 1) Safest check via official card metadata.
            if (cardLike.supertype === 'Energy' && Array.isArray(cardLike.subtypes) && cardLike.subtypes.includes('Basic')) {
                return true;
            }

            // 2) Bulletproof name check for the 8 basic energies and common aliases.
            const basicNames = [
                'Grass Energy', 'Fire Energy', 'Water Energy', 'Lightning Energy',
                'Psychic Energy', 'Fighting Energy', 'Darkness Energy', 'Metal Energy',
                'Basic {G} Energy', 'Basic {R} Energy', 'Basic {W} Energy', 'Basic {L} Energy',
                'Basic {P} Energy', 'Basic {F} Energy', 'Basic {D} Energy', 'Basic {M} Energy'
            ];
            const cardName = String(cardLike.card_name || cardLike.full_card_name || cardLike.name || '').trim();
            if (basicNames.includes(cardName)) return true;
            if (isBasicEnergy(cardName)) return true;

            // 3) Fallback for localized explicit labels.
            if (cardLike.type === 'Basis-Energie' || cardLike.supertype === 'Basis-Energie') return true;

            // Everything else must be treated as Special Energy (4x cap applies).
            return false;
        }

        function getEmptyStateHtml() {
            return getEmptyStateBoxHtml({
                title: t('cl.noDataFound'),
                description: t('cl.noDataFoundDesc'),
                icon: 'cards'
            });
        }

        // Universal image URL resolver used across grids, analysis, and deckbuilder.
        // Priority order:
        //  1. canonical image from all_cards_merged via set+number index
        //  2. unified set+number fallback chain
        //  3. row-level image only when no set+number is available
        function getBestCardImage(card) {
            const setCodeRaw = card?.set_code || card?.set || '';
            const setCode = String(setCodeRaw || '').toUpperCase();
            const cardNumberRaw = card?.set_number || card?.number || '';
            const cardNumber = String(cardNumberRaw || '').trim();
            const imageUrl = card?.image_url || card?.imageUrl || card?.image || '';

            if (setCode && cardNumber) {
                return getUnifiedCardImage(setCode, cardNumber);
            }

            return imageUrl ? fixJapaneseCardImageUrl(imageUrl, setCode, card?.card_name || card?.name || '', cardNumber) : '';
        }

        /**
         * Named explicit-API version of getBestCardImage.
         * getCardImageSource(cardName, set, number) mirrors getBestCardImage's
         * full priority chain (DB image_url → row image_url → Limitless-JP fallback)
         * but accepts individual params instead of a card object.
         */
        function getCardImageSource(cardName, set, number) {
            return getUnifiedCardImage(set, number) || getBestCardImage({ card_name: cardName, set_code: set, set_number: number });
        }

        function classifyImageSource(url) {
            const src = String(url || '').toLowerCase();
            if (!src) return 'none';
            if (src.includes('pokemonproxies.com')) return 'proxy';
            if (src.includes('limitlesstcg') && src.includes('/tpc/')) return 'limitless-jp';
            if (src.includes('limitlesstcg') && src.includes('/tpci/')) return 'limitless-en';
            if (src.startsWith('data:image/svg')) return 'placeholder';
            return 'other';
        }

        function buildInlineCardPlaceholder(cardName = 'No Image') {
            const safeLabel = String(cardName || 'No Image').slice(0, 32);
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="245" height="342" viewBox="0 0 245 342"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#2a2a2a"/><stop offset="100%" stop-color="#3a3a3a"/></linearGradient></defs><rect width="245" height="342" fill="url(#g)"/><rect x="10" y="10" width="225" height="322" rx="12" ry="12" fill="none" stroke="#666" stroke-width="2"/><text x="50%" y="47%" dominant-baseline="middle" text-anchor="middle" fill="#cfcfcf" font-size="17" font-family="Arial, sans-serif">No Image</text><text x="50%" y="56%" dominant-baseline="middle" text-anchor="middle" fill="#9f9f9f" font-size="12" font-family="Arial, sans-serif">${safeLabel}</text></svg>`;
            return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
        }

        if (!window.__cardImageSourceTrackingBound) {
            // Capture image load events globally and tag each card image with its source.
            document.addEventListener('load', function(e) {
                const target = e.target;
                if (!target || target.tagName !== 'IMG') return;
                const sourceType = classifyImageSource(target.currentSrc || target.src || '');
                target.setAttribute('data-image-source', sourceType);
            }, true);
            window.__cardImageSourceTrackingBound = true;
        }
        
        // Global function to handle image errors with one fallback retry.
        window.handleCardImageError = function(img, setCode = '', cardNumber = '', explicitFallbackUrl = '') {
            if (img.getAttribute('data-fallback-tried') === 'true') {
                // All fallbacks exhausted – show inline SVG placeholder
                img.src = 'data:image/svg+xml,%3Csvg xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22 width%3D%22200%22 height%3D%22280%22%3E%3Crect width%3D%22200%22 height%3D%22280%22 fill%3D%22%23333%22%2F%3E%3Ctext x%3D%2250%25%22 y%3D%2250%25%22 dominant-baseline%3D%22middle%22 text-anchor%3D%22middle%22 fill%3D%22%23999%22 font-size%3D%2218%22%3ENo Image%3C%2Ftext%3E%3C%2Fsvg%3E';
                img.classList.add('img-fallback');
                return;
            }

            let fallbackUrl = explicitFallbackUrl || '';
            const src = img.getAttribute('src') || '';
            const normalizedSet = normalizeSetCode(setCode);
            const normalizedNumber = normalizeCardNumber(cardNumber);

            // For M3/M4 cards, fallback to Limitless JP when the primary URL fails.
            if (!fallbackUrl) {
                const isM3M4 = (normalizedSet === 'M3' || normalizedSet === 'M4' || /\/(M3|M4)\//i.test(src));
                if (isM3M4) {
                    const fallbackSet = normalizedSet === 'M4' ? 'M4' : 'M3';
                    fallbackUrl = getM3JapaneseFallbackUrl(fallbackSet, normalizedNumber);
                }
            }

            if (fallbackUrl) {
                devLog(`🖼️ Image Error → Trying fallback: ${fallbackUrl}`);
                img.setAttribute('data-fallback-tried', 'true');
                img.setAttribute('data-image-source', 'fallback-limitless');
                img.src = fallbackUrl;
            } else {
                // No fallback URL available – show placeholder immediately
                img.src = 'data:image/svg+xml,%3Csvg xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22 width%3D%22200%22 height%3D%22280%22%3E%3Crect width%3D%22200%22 height%3D%22280%22 fill%3D%22%23333%22%2F%3E%3Ctext x%3D%2250%25%22 y%3D%2250%25%22 dominant-baseline%3D%22middle%22 text-anchor%3D%22middle%22 fill%3D%22%23999%22 font-size%3D%2218%22%3ENo Image%3C%2Ftext%3E%3C%2Fsvg%3E';
                img.classList.add('img-fallback');
            }
        };

        // Backward compatibility for existing handlers.
        window.handleM3ImageError = function(img, setCode, cardNumber) {
            const fallbackUrl = getM3JapaneseFallbackUrl(setCode, cardNumber);
            window.handleCardImageError(img, setCode, cardNumber, fallbackUrl);
        };
        
        // Helper function to fix Japanese card image URLs with intelligent fallback logic
        function fixJapaneseCardImageUrl(url, setCode, cardName = '', cardNumber = '') {
            if (!url) return url;

            // Prefer any direct PokemonProxies image URL from the merged card database.
            if (/pokemonproxies\.com\/(assets|images\/cards\/sets)\//i.test(url)) {
                return url;
            }
            
            // PRIORITY 1: M3 fallback from Limitless/TPCI to Limitless JP.
            const isM3Set = setCode === 'M3' || url.includes('/M3/');
            
            if (isM3Set) {
                // Extract card number if not provided
                if (!cardNumber && url) {
                    const numberMatch = url.match(/M3_0*(\d+)_/);
                    if (numberMatch) {
                        cardNumber = numberMatch[1]; // 46 or 046
                    }
                }
                
                // M3 Fallback: Limitless Japanese
                const originalUrl = url;
                url = url.replace('/tpci/', '/tpc/');
                url = url.replace(/_EN_/g, '_JP_');
                url = url.replace(/\/M3_0+(\d+)_/g, '/M3_$1_');
                devLog(`🇯🇵 M3 Card → Limitless JP fallback: ${originalUrl} → ${url}`);
                return url;
            }

            const isM4Set = setCode === 'M4' || url.includes('/M4/');
            if (isM4Set) {
                const originalUrl = url;
                url = url.replace('/tpci/', '/tpc/');
                url = url.replace(/_EN_/g, '_JP_');
                url = url.replace(/\/M4_0+(\d+)_/g, '/M4_$1_');
                devLog(`🇯🇵 M4 Card → Limitless JP fallback: ${originalUrl} → ${url}`);
                return url;
            }
            
            // Keep other real image URLs unchanged.
            if (/\.(png|jpe?g|webp)(\?|$)/i.test(url)) {
                return url;
            }

            // Generic JP fallback only if we can safely derive a Limitless image URL.
            if (url.includes('/jp/')) {
                if (setCode && cardNumber) {
                    return getM3JapaneseFallbackUrl(setCode, cardNumber);
                } else {
                    // Fallback: Replace /jp/ with /en/ if we don't have set/number info
                    const originalUrl = url;
                    url = url.replace('/jp/', '/en/');
                    devLog(`🔄 Japanese → English Proxy: ${originalUrl} → ${url}`);
                    return url;
                }
            }
            
            // Default: return original URL unchanged
            return url;
        }
        
        // Render function for table view (default, detailed view)
        function renderCityLeagueDeckTable(cards) {
            const tableContainer = document.getElementById('cityLeagueDeckTable');
            const tableViewContainer = document.getElementById('cityLeagueDeckTableView');
            if (!tableContainer) return;
            
            // Use the same sorting logic
            const sortedCards = sortCardsByType([...cards]);
            
            // Get current deck to show deck counts
            const currentDeck = window.cityLeagueDeck || {};
            
            let html = '<div class="city-league-card-table-list">';
            sortedCards.forEach(card => {
                const cardName = card.card_name;
                
                // CRITICAL: Use same version selection logic as Grid View
                // This ensures List View shows the same version (e.g., ASC instead of MEG)
                let displayCard = card;
                const allCards = window.allCardsDatabase || [];
                const allVersions = allCards.filter(c => (c.name_en || c.name) === cardName && c.set && c.number);
                
                if (overviewRarityMode !== 'all' && allVersions.length > 0) {
                    // Set order loaded from sets.json at startup (higher = newer)
                    const SET_ORDER = window.setOrderMap || {};
                    
                    const getRarityValue = (card) => {
                        const r = (card.rarity || card.card_rarity || '').toLowerCase();
                        if (!r || r === '' || r === 'none' || r === 'no rarity') return 0;
                        if (r.includes('common')) return 1;
                        if (r.includes('uncommon')) return 2;
                        if (r.includes('rare') && !r.includes('ultra') && !r.includes('secret') && !r.includes('hyper')) return 3;
                        if (r.includes('promo')) return 4;
                        if (r.includes('double rare')) return 5;
                        if (r.includes('ultra rare')) return 6;
                        if (r.includes('special art rare') || r.includes('special illustration rare')) return 7;
                        if (r.includes('secret rare')) return 8;
                        if (r.includes('hyper rare')) return 9;
                        return -1;
                    };
                    
                    allVersions.sort((a, b) => {
                        const rarityA = getRarityValue(a);
                        const rarityB = getRarityValue(b);
                        
                        // Primary sort: by rarity value
                        const rarityDiff = overviewRarityMode === 'min' ? rarityA - rarityB : rarityB - rarityA;
                        if (rarityDiff !== 0) {
                            return rarityDiff;
                        }
                        
                        // Secondary sort (same rarity): prefer NEWER sets (ASC > MEG)
                        const setOrderA = SET_ORDER[a.set] || 0;
                        const setOrderB = SET_ORDER[b.set] || 0;
                        return setOrderB - setOrderA;
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
                const rawPercentage = safeParseFloat(card.percentage_in_archetype || card.share_percent || 0);
                const maxCount = parseInt(card.max_count) || card.max_count || '?';
                const cardNameEscaped = escapeJsStr(cardName);
                const setCode = displayCard.set_code || '';
                const setNumber = displayCard.set_number || '';
                
                // CRITICAL: Match by SET CODE + SET NUMBER only (not card name)
                let deckCount = 0;
                if (setCode && setNumber) {
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
                } else {
                    deckCount = currentDeck[cardName] || 0;
                }
                
                // Get deck statistics
                const decksWithCard = safeParseFloat(card.deck_count || card.deck_inclusion_count || 0);
                // Use global total decks count instead of per-date total_decks_in_archetype
                const totalDecksInArchetype = safeParseFloat(window.currentCityLeagueTotalDecks || card.total_decks_in_archetype || 0);
                const totalCount = safeParseFloat(card.total_count || 0);
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

                const percentage = Math.max(0, resolvedPercentage).toFixed(1).replace('.', ',');
                const avgCountOverall = Math.max(0, avgCountOverallValue).toFixed(2).replace('.', ',');
                const avgCountInUsedDecks = Math.max(0, avgCountInUsedValue).toFixed(2).replace('.', ',');
                const decksWithCardDisplay = Math.round(Math.max(0, decksWithCard));
                const totalDecksDisplay = Math.round(Math.max(0, totalDecksInArchetype));
                
                html += `
                    <div class="card-table-row city-league-card-table-row" data-card-name="${cardName.toLowerCase()}">
                        <!-- Card Image -->
                        <div class="city-league-card-image-container">
                            <img src="${imageUrl}" alt="${cardName}" loading="lazy" referrerpolicy="no-referrer" class="city-league-card-image" onerror="handleCardImageError(this, '${setCode}', '${setNumber}')" onclick="showSingleCard(this.src, '${cardNameEscaped}');">
                            ${deckCount > 0 ? `<div class="city-league-card-deck-count">${deckCount}</div>` : ''}
                        </div>
                        <!-- Card Info -->
                        <div class="city-league-card-info">
                            <h3 class="city-league-card-title">${cardName}</h3>
                            <div class="city-league-card-set">${setCode} ${setNumber}</div>
                            <div class="city-league-card-stats">
                                <div>
                                    <span class="city-league-card-stat-label">${t('cl.usageShare')}</span>
                                    <span class="city-league-card-stat-value">${percentage}%</span>
                                  </div>
                                <div>
                                    <span class="city-league-card-stat-label">${t('cl.avgUsedDecks')}</span>
                                    <span class="city-league-card-stat-value">${avgCountInUsedDecks}x</span>
                                </div>
                                <div>
                                    <span class="city-league-card-stat-label">${t('cl.avgAllDecks')}</span>
                                    <span class="city-league-card-stat-value">${avgCountOverall}x</span>
                                </div>
                                <div>
                                    <span class="city-league-card-stat-label">${t('cl.deckCount')}</span>
                                    <span class="city-league-card-stat-value">${decksWithCardDisplay}/${totalDecksDisplay} (${percentage}%)</span>
                                </div>
                                <div>
                                    <span class="city-league-card-stat-label">${t('cl.maxCount')}</span>
                                    <span class="city-league-card-stat-value city-league-card-stat-value-max">${maxCount}</span>
                                </div>
                            </div>
                        </div>
                        <!-- Add Button -->
                        <div class="city-league-card-actions">
                            <button class="btn btn-success city-league-card-add-btn" onclick="addCardToDeck('cityLeague', '${cardNameEscaped}', '${setCode}', '${setNumber}')" title="${t('cl.addToDeckTooltip')}">${t('cl.addToDeck')}</button>
                            <button class="btn btn-primary city-league-card-proxy-btn" onclick="addCardToProxy('${cardNameEscaped}', '${setCode}', '${setNumber}', 1)" title="${t('cl.proxyTooltip')}">${t('cl.proxy')}</button>
                        </div>
                    </div>`;
                // ...existing code...
            }); // Ende der forEach-Schleife
            html += '</div>';
            tableContainer.innerHTML = html;
            if (tableViewContainer) tableViewContainer.classList.remove('d-none', 'city-league-deck-table-view-hidden');
        }
        
        // Get all versions of a card from allCardsDatabase
        function getAllVersionsOfCard(cardName) {
            const allCards = window.allCardsDatabase || [];
            return allCards.filter(c => c.name === cardName);
        }
        
        // Set overview rarity mode and refresh display
        function setOverviewRarityMode(mode) {
            debugVersionSelectionLog('?? Setting overview rarity mode to:', mode);
            overviewRarityMode = mode;
            
            // Synchronize with global rarity preference so deck builder uses same setting
            // For 'all' mode, keep original cards (no preference), otherwise use min/max
            if (mode === 'all') {
                // For "Alle Prints" mode in deck builder, use original card (no rarity swap)
                globalRarityPreference = null;
            } else {
                globalRarityPreference = mode; // 'min' or 'max'
            }
            debugVersionSelectionLog('?? Global rarity preference synced to:', globalRarityPreference || 'none (original cards)');
            
            // Update button styles - make sure elements exist first
            const btnMin = document.getElementById('overviewRarityMin');
            const btnMax = document.getElementById('overviewRarityMax');
            const btnAll = document.getElementById('overviewRarityAll');
            
            if (btnMin) {
                btnMin.classList.toggle('btn-active', mode === 'min');
                btnMin.classList.toggle('btn-inactive', mode !== 'min');
            }
            if (btnMax) {
                btnMax.classList.toggle('btn-active', mode === 'max');
                btnMax.classList.toggle('btn-inactive', mode !== 'max');
            }
            if (btnAll) {
                btnAll.classList.toggle('btn-active', mode === 'all');
                btnAll.classList.toggle('btn-inactive', mode !== 'all');
            }
            
            // Re-render the grid with current cards (preserve percentage filter)
            const cards = window.currentCityLeagueDeckCards;
            debugVersionSelectionLog('?? Cards available for re-render:', cards ? cards.length : 'none');
            if (cards && cards.length > 0) {
                debugVersionSelectionLog('? Re-rendering grid with mode:', mode);
                applyCityLeagueFilter();  // Use filter function to preserve percentage filter
            } else {
                debugVersionSelectionLog('?? No cards available to render - mode saved for when deck is selected');
            }
            
            // Also update the deck display with new rarity preference
            if (window.cityLeagueDeck && Object.keys(window.cityLeagueDeck).length > 0) {
                debugVersionSelectionLog('?? Re-rendering deck with new rarity preference');
                updateDeckDisplay('cityLeague');
            }
        }
        
        // ============================================================================
        // TREND CALCULATION - Calculate usage trends over time
        // ============================================================================
        // Render function for grid view (compact view)
        function renderCityLeagueDeckGrid(cards) {
            debugVersionSelectionLog('?? renderCityLeagueDeckGrid called with:', cards.length, 'cards, mode:', overviewRarityMode);
            const visualContainer = document.getElementById('cityLeagueDeckVisual');
            const gridContainer = document.getElementById('cityLeagueDeckGrid');
            if (!gridContainer) {
                console.warn('[CityLeague] cityLeagueDeckGrid container not found - cannot render card overview grid');
                return;
            }

            if (!Array.isArray(cards) || cards.length === 0) {
                console.info('[CityLeague] Rendering empty card overview state (0 cards after filtering)');
                gridContainer.innerHTML = getEmptyStateHtml();
                if (visualContainer) {
                    visualContainer.classList.remove('d-none', 'city-league-deck-visual-hidden');
                    visualContainer.style.display = 'block';
                }
                return;
            }
            
            // Use the same sorting logic as "Karten Uebersicht (sortiert)"
            const sortedCards = sortCardsByType([...cards]);
            
            // Get current deck to show deck counts
            const currentDeck = window.cityLeagueDeck || {};
            const priceMap = getOverviewPriceLookupCache();
            
            // PERFORMANCE: Resolve once outside render loop (avoids repeated DOM query + N*M data scans)
            const selectedArchetypeForTrend = document.getElementById('cityLeagueArchetypeSelect')?.value || window.currentCityLeagueArchetype || 'all';
            const trendHistoryCache = new Map();
            
            let html = '';
            sortedCards.forEach(card => {
                // Get original card's set/number from the City League deck data
                const originalSetCode = card.set_code || '';
                const originalSetNumber = card.set_number || '';
                const rawCardName = card.card_name || '';
                const cardName = getDisplayCardName(rawCardName, originalSetCode, originalSetNumber);
                const cardNameEscaped = escapeJsStr(cardName);
                
                // Apply rarity mode to determine which versions to show
                let versionsToRender = [];
                
                if (overviewRarityMode === 'all') {
                    // Show ALL international prints of this specific card
                    let allVersions = getInternationalPrintsForCard(originalSetCode, originalSetNumber);
                    debugVersionSelectionLog(`?? All mode for ${cardName} (${originalSetCode} ${originalSetNumber}): found ${allVersions.length} int prints`);
                    
                    if (allVersions && allVersions.length > 0) {
                        versionsToRender = allVersions.map(v => ({
                            ...card,
                            set_code: v.set,
                            set_number: v.number,
                            image_url: v.image_url,
                            rarity: v.rarity
                        }));
                    } else {
                        // No versions found in database, use original card
                        versionsToRender = [card];
                    }
                } else {
                    // 'min' or 'max' mode: Get preferred version (lowest/highest rarity, prefer NEWER sets)
                    const preferredVersion = getPreferredVersionForCard(cardName, originalSetCode, originalSetNumber);
                    
                    if (preferredVersion) {
                        debugVersionSelectionLog(`?? ${overviewRarityMode} mode for ${cardName}: using PREFERRED version ${preferredVersion.set} ${preferredVersion.number} (${preferredVersion.rarity})`);
                        versionsToRender = [{
                            ...card,
                            set_code: preferredVersion.set,
                            set_number: preferredVersion.number,
                            image_url: preferredVersion.image_url,
                            rarity: preferredVersion.rarity
                        }];
                    } else {
                        // No preferred version found, use original
                        debugVersionSelectionLog(`?? ${overviewRarityMode} mode for ${cardName}: no preferred version found, using original`);
                        versionsToRender = [card];
                    }
                }
                
                // Render each version
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
                // finalMaxCount = highest copies of this card (across all int prints) used in any single deck
                const finalMaxCount = rawMaxCount > 0
                    ? Math.min(legalMaxCopies, rawMaxCount)
                    : 0;
                
                // CRITICAL: ALWAYS show green marker ONLY on the exact version that is in the deck
                // Match by SET CODE + SET NUMBER only (not by card name, which may differ in different languages)
                let deckCount = 0;
                
                // Only check if deck is not empty to avoid unnecessary processing
                if (Object.keys(currentDeck).length > 0 && setCode && setNumber) {
                    // Loop through all deck entries and match by set/number only
                    for (const deckKey in currentDeck) {
                        // Extract set and number from deckKey format: "CardName (SET NUM)"
                        const match = deckKey.match(/\(([A-Z0-9]+)\s+([A-Z0-9]+)\)$/);
                        if (match) {
                            const deckSetCode = match[1];
                            const deckSetNumber = match[2];
                            
                            // Match by set code and number ONLY (ignore card name)
                            if (deckSetCode === setCode && deckSetNumber === setNumber) {
                                deckCount = currentDeck[deckKey] || 0;
                                break;
                            }
                        }
                    }
                } else if (Object.keys(currentDeck).length > 0 && !setCode && !setNumber) {
                    // Fallback: If no set/number available, try exact card name match
                    deckCount = currentDeck[cardName] || 0;
                }
                
                // Get deck statistics: how many decks use this card vs total decks in archetype
                // Use global total decks count instead of per-date total_decks_in_archetype
                const totalDecksInArchetype = safeParseFloat(window.currentCityLeagueTotalDecks || card.total_decks_in_archetype || 0);
                // Get average count statistics

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

                // finalMaxCount already declared above, do not redeclare here.
                const finalAvgUsed = Math.min(legalMaxCopies, avgCountInUsedValue);
                const finalAvgOverall = Math.min(legalMaxCopies, avgCountOverallValue);
                const maxCount = finalMaxCount;

                const percentage = Math.max(0, resolvedPercentage).toFixed(1).replace('.', ',');
                const avgCountOverall = Math.max(0, finalAvgOverall).toFixed(2).replace('.', ',');  // Average over all decks
                const avgCountInUsedDecks = Math.max(0, finalAvgUsed).toFixed(2).replace('.', ',');  // Average in decks that use this card
                const decksWithCardDisplay = Math.round(Math.max(0, decksWithCard));
                const totalDecksDisplay = Math.round(Math.max(0, totalDecksInArchetype));
                const selectedArchetype = selectedArchetypeForTrend;
                const trendCacheKey = cardName + '||' + selectedArchetype;
                if (!trendHistoryCache.has(trendCacheKey)) {
                    trendHistoryCache.set(trendCacheKey, getCityLeagueCardShareHistory(cardName, selectedArchetype));
                }
                const trendHistory = trendHistoryCache.get(trendCacheKey);
                const trendIndicator = getTrendIndicator(trendHistory);
                const showTrendOverlay = trendIndicator && !trendIndicator.includes('trend-stable');
                
                // PERFORMANCE: Get price using Map lookup instead of find()
                let eurPrice = '';
                let cardmarketUrl = '';
                let germanCardName = (displayCard.name_de || card.name_de || card.card_name_de || '').toLowerCase();
                if (setCode && setNumber) {
                    const normalizedSet = normalizeSetCode(setCode);
                    const normalizedNumber = normalizeCardNumber(setNumber);
                    let priceCard = priceMap.get(`${normalizedSet}-${normalizedNumber}`);
                    
                    // If no exact match, try with normalized numbers (remove leading zeros)
                    if (!priceCard && /^\d+$/.test(normalizedNumber)) {
                        priceCard = priceMap.get(`${normalizedSet}-${normalizedNumber.padStart(3, '0')}`);
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
                
                // Determine card type category for filtering
                const cardType = card.type || card.card_type || '';
                const cardCategory = getCardTypeCategory(cardType);
                const isAceSpecCard = isAceSpec(cardName);
                const filterCategory = isAceSpecCard ? 'Ace Spec' : cardCategory;
                const germanCardNameEscaped = germanCardName.replace(/"/g, '&quot;');
                const otherPrintOwnedCount = getOtherInternationalPrintOwnedCount(setCode, setNumber);
                const otherPrintSparkleHtml = otherPrintOwnedCount > 0
                    ? `<div class="city-league-other-print-sparkle${deckCount > 0 ? ' city-league-other-print-sparkle-hasdeck' : ''}" title="Owned other INT prints: ${otherPrintOwnedCount}x">
                        <span class="city-league-other-print-sparkle-icon">✨</span>
                        <span class="city-league-other-print-sparkle-count">${otherPrintOwnedCount}</span>
                    </div>`
                    : '';
                
                html += `
                    <div class="card-item city-league-card-item" data-card-name="${cardName.toLowerCase()}" data-card-name-de="${germanCardNameEscaped}" data-card-set="${setCode.toLowerCase()}" data-card-number="${setNumber.toLowerCase()}" data-card-type="${filterCategory}">
                        <div class="card-image-container city-league-card-image-container">
                            <img src="${imageUrl}" alt="${cardName}" loading="lazy" referrerpolicy="no-referrer" class="city-league-card-image" onerror="handleCardImageError(this, '${setCode}', '${setNumber}')" onclick="if (typeof event !== 'undefined' && event) event.stopPropagation(); showSingleCard(this.src, '${cardNameEscaped}');">
                            <!-- Red badge: Max Count (top-right) -->
                            <div class="city-league-card-badge city-league-card-badge-max">${finalMaxCount}</div>
                            <!-- Green badge: Deck Count (top-left) - only show if > 0 -->
                            ${deckCount > 0 ? `<div class="city-league-card-badge city-league-card-badge-deck">${deckCount}</div>` : ''}
                            ${otherPrintSparkleHtml}
                            ${showTrendOverlay ? `<div class="trend-badge-overlay">${trendIndicator}</div>` : ''}
                            <!-- Card info section - Mobile Overlay -->
                            <div class="card-info-bottom city-league-card-info-bottom">
                                <div class="card-info-text city-league-card-info-text">
                                    <div class="city-league-card-title-mobile">${cardName}${cardNameWarning}</div>
                                    <div class="city-league-card-set-mobile">${setCode} ${setNumber}</div>
                                    <div class="city-league-card-stats-mobile">${resolvedPercentage > 0 ? `${percentage}% | Ø ${avgCountInUsedDecks}x (${avgCountOverall}x)` : ''}</div>
                                    <div class="city-league-card-deck-stats-mobile">${decksWithCardDisplay}/${totalDecksDisplay} (${percentage}%)</div>
                                </div>
                                <!-- Card Actions: Row 1 = - ★ + | Row 2 = L + Cardmarket -->
                                <div class="card-action-buttons city-league-card-action-buttons">
                                    <div class="city-league-card-action-row">
                                        <button class="city-league-card-action-btn city-league-card-remove-btn" onclick="event.stopPropagation(); removeCardFromDeck('cityLeague', '${cardNameEscaped}')" title="${t('cl.removeFromDeck')}">-</button>
                                        <button class="city-league-card-action-btn city-league-card-rarity-btn" onclick="event.stopPropagation(); openRaritySwitcher('${cardNameEscaped}', '${cardNameEscaped} (${setCode} ${setNumber})')" title="${t('cl.switchPrint')}">★</button>
                                        <button class="city-league-card-action-btn city-league-card-add-btn" onclick="event.stopPropagation(); addCardToDeck('cityLeague', '${cardNameEscaped}', '${setCode}', '${setNumber}')" title="${t('cl.addToDeckTooltip')}">+</button>
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
                }); // End of versionsToRender.forEach
            }); // End of sortedCards.forEach
            
            gridContainer.innerHTML = html;
            if (visualContainer) {
                visualContainer.classList.remove('d-none', 'city-league-deck-visual-hidden');
                visualContainer.style.display = 'block';
            }
            console.info(`[CityLeague] Rendered ${sortedCards.length} overview cards`);
        }
        
        function filterOverviewCards() {
            const searchInput = document.getElementById('cityLeagueOverviewSearch');
            if (!searchInput) return;
            
            const searchTerm = searchInput.value.toLowerCase().trim();
            const gridContainer = document.getElementById('cityLeagueDeckGrid');
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

                const matchesType = overviewCardTypeFilter === 'all' || cardType === overviewCardTypeFilter
                    || (overviewCardTypeFilter === 'Energy' && cardType === 'Basic Energy');
                
                // Show card only if it matches both filters
                if (matchesSearch && matchesType) {
                    card.classList.remove('d-none');
                    visibleCount++;
                } else {
                    card.classList.add('d-none');
                }
            });
            
            // Update card count
            const countElement = document.getElementById('cityLeagueCardCount');
            if (countElement) {
                countElement.textContent = `${visibleCount} ${t('cl.cards')}`;
            }
        }
        
        function setOverviewCardTypeFilter(type) {
            overviewCardTypeFilter = type;
            
            // Update button styles
            const buttons = {
                'all': document.getElementById('overviewTypeAll'),
                'Pokemon': document.getElementById('overviewTypePokemon'),
                'Supporter': document.getElementById('overviewTypeSupporter'),
                'Item': document.getElementById('overviewTypeItem'),
                'Tool': document.getElementById('overviewTypeTool'),
                'Stadium': document.getElementById('overviewTypeStadium'),
                'Energy': document.getElementById('overviewTypeEnergy'),
                'Special Energy': document.getElementById('overviewTypeSpecialEnergy'),
                'Ace Spec': document.getElementById('overviewTypeAceSpec')
            };
            
            // Reset all button styles to match actual markup/CSS classes
            Object.values(buttons).forEach(btn => {
                if (btn) {
                    btn.classList.remove('active');
                }
            });

            // Highlight active button
            if (buttons[type]) {
                buttons[type].classList.add('active');
            }
            
            // Apply filter
            filterOverviewCards();
        }
        
        function setCurrentMetaOverviewCardTypeFilter(type) {
            currentMetaOverviewCardTypeFilter = type;
            
            // Update button styles
            const buttons = {
                'all': document.getElementById('currentMetaOverviewTypeAll'),
                'Pokemon': document.getElementById('currentMetaOverviewTypePokemon'),
                'Supporter': document.getElementById('currentMetaOverviewTypeSupporter'),
                'Item': document.getElementById('currentMetaOverviewTypeItem'),
                'Tool': document.getElementById('currentMetaOverviewTypeTool'),
                'Stadium': document.getElementById('currentMetaOverviewTypeStadium'),
                'Energy': document.getElementById('currentMetaOverviewTypeEnergy'),
                'Special Energy': document.getElementById('currentMetaOverviewTypeSpecialEnergy'),
                'Ace Spec': document.getElementById('currentMetaOverviewTypeAceSpec')
            };
            
            // Reset all button styles
            Object.values(buttons).forEach(btn => {
                if (btn) {
                    btn.classList.remove('btn-active', 'btn-inactive');
                    btn.classList.add('btn-inactive');
                }
            });
            
            // Highlight active button
            if (buttons[type]) {
                buttons[type].classList.remove('btn-inactive');
                buttons[type].classList.add('btn-active');
            }
            
            // Apply filter
            filterCurrentMetaOverviewCards();
        }
        
        function setPastMetaOverviewCardTypeFilter(type) {
            pastMetaOverviewCardTypeFilter = type;
            
            // Update button styles
            const buttons = {
                'all': document.getElementById('pastMetaOverviewTypeAll'),
                'Pokemon': document.getElementById('pastMetaOverviewTypePokemon'),
                'Supporter': document.getElementById('pastMetaOverviewTypeSupporter'),
                'Item': document.getElementById('pastMetaOverviewTypeItem'),
                'Tool': document.getElementById('pastMetaOverviewTypeTool'),
                'Stadium': document.getElementById('pastMetaOverviewTypeStadium'),
                'Energy': document.getElementById('pastMetaOverviewTypeEnergy'),
                'Special Energy': document.getElementById('pastMetaOverviewTypeSpecialEnergy'),
                'Ace Spec': document.getElementById('pastMetaOverviewTypeAceSpec')
            };
            
            // Reset all button styles
            Object.values(buttons).forEach(btn => {
                if (btn) {
                    btn.classList.remove('btn-active', 'btn-inactive');
                    btn.classList.add('btn-inactive');
                }
            });
            
            // Highlight active button
            if (buttons[type]) {
                buttons[type].classList.remove('btn-inactive');
                buttons[type].classList.add('btn-active');
            }
            
            // Apply filter
            filterPastMetaOverviewCards();
        }
        
        function toggleDeckGridView() {
            const gridViewContainer = document.getElementById('cityLeagueDeckVisual');
            const tableViewContainer = document.getElementById('cityLeagueDeckTableView');
            // Get button from DOM instead of event
            const gridButtons = document.querySelectorAll('button[onclick*="toggleDeckGridView"]');
            const button = gridButtons[0];
            
            if (!gridViewContainer || !tableViewContainer) {
                console.warn('?? Grid or table container not found');
                return;
            }
            
            const cards = window.currentCityLeagueDeckCards;
            if (!cards || cards.length === 0) {
                showToast(t('cl.selectDeckFirst'), 'warning');
                return;
            }
            
            // Check current view mode (grid is default)
            const isGridViewActive = !gridViewContainer.classList.contains('d-none');
            if (isGridViewActive) {
                // Switch to list/table view
                gridViewContainer.classList.add('d-none');
                tableViewContainer.classList.remove('d-none', 'city-league-deck-table-view-hidden');
                if (button) button.textContent = '📊 Grid View';
            } else {
                // Switch back to grid view
                tableViewContainer.classList.add('d-none');
                gridViewContainer.classList.remove('d-none', 'city-league-deck-visual-hidden');
                if (button) button.textContent = '📋 List View';
            }
            
            // Re-apply filter to preserve percentage filter and render correct view
            applyCityLeagueFilter();
            
            // Re-apply current search filter
            filterOverviewCards();
        }
        
        function copyDeckOverview() {
            const deck = window.cityLeagueDeck;
            const hasDeck = deck && Object.keys(deck).length > 0;
            
            const allCards = window.currentCityLeagueDeckCards || [];
            const allCardsFromDb = window.allCardsDatabase || [];
            
            // If no deck AND no archetype cards, show error
            if (!hasDeck && allCards.length === 0) {
                showToast(t('cl.noCopyCards'), 'warning');
                return;
            }
            
            // Build card data maps
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
            const globalPref = getGlobalRarityPreference();
            const currentRarityMode = overviewRarityMode || 'min';
            
            if (hasDeck) {
                // COPY USER'S DECK with displayed versions
                devLog('[copyDeckOverview] Copying user deck with', Object.keys(deck).length, 'card types');
                
                for (const [deckKey, count] of Object.entries(deck)) {
                    if (count <= 0) continue;
                    
                    // Extract base name and original set info
                    const baseNameMatch = deckKey.match(/^(.+?)\s*\(/);
                    const baseName = baseNameMatch ? baseNameMatch[1] : deckKey;
                    const setMatch = deckKey.match(/\(([A-Z0-9]+)\s+([A-Z0-9]+)\)$/);
                    const originalSet = setMatch ? setMatch[1] : null;
                    const originalNumber = setMatch ? setMatch[2] : null;
                    
                    let cardData = cardDataByName[baseName];
                    if (!cardData) continue;
                    
                    // Clone cardData to avoid modifying original
                    cardData = { ...cardData };
                    
                    // Apply rarity preference to get DISPLAYED version
                    const pref = getRarityPreference(baseName);
                    
                    // PRIORITY 1: Specific user preference
                    if (pref && pref.mode === 'specific' && pref.set && pref.number) {
                        const specificCard = allCardsFromDb.find(c => 
                            c.name === baseName && c.set === pref.set && c.number === pref.number
                        );
                        if (specificCard) {
                            cardData.set_code = specificCard.set;
                            cardData.set_number = specificCard.number;
                        }
                    }
                    // PRIORITY 2: Global rarity preference (min/max)
                    else if (globalPref === 'max' || globalPref === 'min') {
                        if (originalSet && originalNumber) {
                            const preferredVersion = getPreferredVersionForCard(baseName, originalSet, originalNumber);
                            if (preferredVersion) {
                                cardData.set_code = preferredVersion.set;
                                cardData.set_number = preferredVersion.number;
                            }
                        }
                    }
                    // PRIORITY 3: Use original version from deck key
                    else if (originalSet && originalNumber) {
                        cardData.set_code = originalSet;
                        cardData.set_number = originalNumber;
                    }
                    
                    deckCards.push({
                        ...cardData,
                        count: count
                    });
                }
            } else {
                // COPY ARCHETYPE CARDS with max_count
                devLog('[copyDeckOverview] Copying archetype cards with max_count, mode:', currentRarityMode);
                
                // Process each card from archetype
                allCards.forEach(card => {
                    const cardName = card.card_name;
                    const maxCount = parseInt(card.max_count) || 0;
                    if (maxCount <= 0) return;
                    
                    const originalSet = card.set_code || '';
                    const originalNumber = card.set_number || '';
                    
                    // Clone card data
                    let cardData = { ...card };
                    
                    // Apply rarity mode to get displayed version
                    if (currentRarityMode === 'min' || currentRarityMode === 'max') {
                        if (originalSet && originalNumber) {
                            const preferredVersion = getPreferredVersionForCard(cardName, originalSet, originalNumber);
                            if (preferredVersion) {
                                cardData.set_code = preferredVersion.set;
                                cardData.set_number = preferredVersion.number;
                            }
                        }
                    }
                    // If 'all' mode, we only copy the first version (can be improved later to include all)
                    
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
            
            // Sort cards using the same logic
            const sortedCards = sortCardsByType(deckCards);
            
            // Group by category
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
                    // Supporter, Item, Tool, Stadium all go to Trainer
                    trainer.push(line);
                    trainerCount += count;
                }
            });
            
            // Build output text
            let output = '';
            
            if (pokemon.length > 0) {
                output += `${t('cl.pokemon')} ${pokemonCount}\n`;
                output += pokemon.join('\n') + '\n\n';
            }
            
            if (trainer.length > 0) {
                output += `${t('cl.trainer')} ${trainerCount}\n`;
                output += trainer.join('\n') + '\n\n';
            }
            
            if (energy.length > 0) {
                output += `${t('cl.energy')} ${energyCount}\n`;
                output += energy.join('\n');
            }
            
            // Copy to clipboard
            navigator.clipboard.writeText(output).then(() => {
                showToast(t('cl.deckCopied'), 'success');
            }).catch(err => {
                console.error('Error copying:', err);
                showToast(t('cl.copyError'), 'error');
            });
        }

        // Helper function to safely parse percentage_in_archetype (can be string with comma)
        const parsePct = (val) => parseFloat(String(val || "0").replace(',', '.'));

        function renderCityLeagueAnalysisTable(data) {
            devLog('renderCityLeagueAnalysisTable called with', data ? data.length : 0, 'rows');
            const tableContainer = document.getElementById('cityLeagueAnalysisTable');
            if (!tableContainer) {
                console.error('Table container not found!');
                return;
            }
            if (!data || data.length === 0) {
                console.warn('No data to render');
                tableContainer.innerHTML = getEmptyStateBoxHtml({
                    title: t('cl.selectDeckPlaceholder'),
                    description: t('cl.noDataFoundDesc'),
                    icon: 'cards'
                });
                return;
            }

            // Group cards into FOUR tiers: Check Ace Spec FIRST, then by usage percentage
            const coreCards = [];
            const aceSpecCards = [];
            const techCards = [];
            const spicyCards = [];
            
            // Hardcoded Ace Spec names for reliable detection (CSV is_ace_spec is buggy)
            const _aceSpecNamesOverview = ['prime catcher','unfair stamp','master ball','maximum belt','hero\'s cape','awakening drum','reboot pod','survival brace','grand tree','neutral center','sparkling crystal','dangerous laser','scoop up cyclone','computer search','dowsing machine','rock guard','life dew','victory star','g booster','g scope','rich energy','legacy energy','secret box','hyper aroma','neo upper energy','scramble switch','deluxe bomb','megaton blower','amulet of hope','pok\u00e9 vital a'];
            data.forEach(card => {
                // Check if card is Ace Spec (exclusive category)
                const _cn = String(card.card_name || card.name || '').trim().toLowerCase();
                const isAceSpec = _aceSpecNamesOverview.includes(_cn) ||
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
            
            // Helper function to render a single tier
            const renderTier = (tierCards, tierTitle, tierEmoji) => {
                if (tierCards.length === 0) return '';
                
                let html = `<div class="city-league-tier-block">`;
                html += `<h3 class="city-league-tier-title"><span>${tierEmoji}</span> ${tierTitle}</h3>`;
                html += '<table class="responsive-table"><thead><tr>';
                const thImage = t('cl.thImage');
                const thCardsInDeck = t('cl.thCardsInDeck');
                const thCardName = t('cl.thCardName');
                const thSet = t('cl.thSet');
                const thNumber = t('cl.thNumber');
                const thPctArchetype = t('cl.thPctArchetype');
                const thAvgCount = t('cl.thAvgCountUsed');
                html += `<th class="col-image">${thImage}</th>`;
                html += `<th>${thCardsInDeck}</th>`;
                html += `<th>${thCardName}</th>`;
                html += `<th>${thSet}</th>`;
                html += `<th>${thNumber}</th>`;
                html += `<th>${thPctArchetype}</th>`;
                html += `<th>${thAvgCount}</th>`;
                html += `<th>${t('cl.thAction')}</th>`;
                html += '</tr></thead><tbody>';

                tierCards.forEach(row => {
                    const imageUrl = getBestCardImage(row) || '';
                    const cardName = row.card_name || '';
                    const setCode = row.set_code || '';
                    const setNumber = row.set_number || '';
                    const maxCount = parseInt(row.max_count) || row.max_count || '?';
                    const percentage = parsePct(row.percentage_in_archetype).toFixed(1);
                    const deckCount = row.deck_count || '?';
                    const totalDecks = row.total_decks_in_archetype || '?';
                    const avgCount = parsePct(row.average_count || 0).toFixed(2);
                    
                    // Get current deck count from window.cityLeagueDeck
                    const deck = window.cityLeagueDeck || {};
                    const currentDeckCount = deck[cardName] || 0;
                    
                    html += '<tr>';
                    // Image with green badge if card is in deck
                    html += `<td class="col-image" data-label="${thImage}"><div class="city-league-img-badge-wrap">`;
                    html += `<img src="${imageUrl}" alt="${cardName}" loading="lazy" class="city-league-card-img" onerror="handleCardImageError(this, '${setCode}', '${setNumber}')" onclick="showSingleCard(this.src, '${escapeJsStr(cardName)}')">`;
                    if (currentDeckCount > 0) {
                        html += `<div class="city-league-img-badge">${currentDeckCount}</div>`;
                    }
                    html += `</div></td>`;
                    html += `<td data-label="${thCardsInDeck}"><strong>${currentDeckCount}/${maxCount}</strong></td>`;
                    html += `<td data-label="${thCardName}"><strong>${cardName}</strong></td>`;
                    html += `<td data-label="${thSet}">${setCode}</td>`;
                    html += `<td data-label="${thNumber}">${setNumber}</td>`;
                    html += `<td data-label="${thPctArchetype}"><strong class="city-league-pct">${percentage}%</strong></td>`;
                    html += `<td data-label="${thAvgCount}"><strong class="city-league-avg-count">${avgCount}x</strong></td>`;
                    html += `<td class="city-league-action-btns"><button class="btn btn-primary" onclick="addCardToDeck('cityLeague', '${escapeJsStr(cardName)}')">${t('cl.addBtn')}</button><button class="btn btn-red" onclick="addCardToProxy('${escapeJsStr(cardName)}', '${setCode}', '${setNumber}', 1)">${t('cl.proxy')}</button></td>`;
                    html += '</tr>';
                });

                html += '</tbody></table></div>';
                return html;
            };
            
            // Render all FOUR tiers
            let html = '';
            html += renderTier(coreCards, t('cl.tierCore'), '🔥');
            html += renderTier(aceSpecCards, t('cl.tierAceSpec'), '💎');
            html += renderTier(techCards, t('cl.tierTech'), '🛠️');
            html += renderTier(spicyCards, t('cl.tierSpicy'), '🌶️');
            
            if (html === '') {
                html = '<p class="city-league-empty-state">' + t('cl.noCardsFound') + '</p>';
            }
            
            tableContainer.innerHTML = html;
            devLog('Table rendered with tier grouping:', { core: coreCards.length, aceSpec: aceSpecCards.length, tech: techCards.length, spicy: spicyCards.length });
        }
        
        function getCardShareValue(card) {
            if (!card || typeof card !== 'object') return null;
            const candidates = [
                card.percentage_in_archetype,
                card.share,
                card.new_share,
                card.old_share
            ];
            for (const candidate of candidates) {
                const parsed = parseFloat(String(candidate ?? '').replace(',', '.'));
                if (Number.isFinite(parsed)) return parsed;
            }
            return null;
        }

        function getAceSpecBonusCountForFilter(filterValue) {
            if (filterValue === '90') return 1;
            if (filterValue === '70') return 2;
            if (filterValue === '50') return 3;
            return 0;
        }

        function applyShareFilterWithAceSpecBoost(cards, filterValue) {
            const allCards = Array.isArray(cards) ? cards : [];
            if (filterValue === 'all') return [...allCards];

            const threshold = parseInt(filterValue, 10);
            if (!Number.isFinite(threshold)) return [...allCards];

            const hasShareData = allCards.some(card => Number.isFinite(getCardShareValue(card)));
            if (!hasShareData) return [...allCards];

            const filteredSet = new Set();
            allCards.forEach(card => {
                const share = getCardShareValue(card);
                if (Number.isFinite(share) && share >= threshold) {
                    filteredSet.add(card);
                }
            });

            const aceSpecBonusCount = getAceSpecBonusCountForFilter(filterValue);
            if (aceSpecBonusCount > 0) {
                const aceSpecCandidates = allCards
                    .filter(card => {
                        const cardName = card.card_name || card.full_card_name || card.name || '';
                        return isAceSpec(cardName);
                    })
                    .sort((a, b) => {
                        const shareA = getCardShareValue(a) ?? -1;
                        const shareB = getCardShareValue(b) ?? -1;
                        return shareB - shareA;
                    });

                let addedBonus = 0;
                for (const aceCard of aceSpecCandidates) {
                    if (filteredSet.has(aceCard)) continue;
                    filteredSet.add(aceCard);
                    addedBonus += 1;
                    if (addedBonus >= aceSpecBonusCount) break;
                }
            }

            return allCards.filter(card => filteredSet.has(card));
        }

        function applyCityLeagueFilter() {
            const filterSelect = document.getElementById('cityLeagueFilterSelect');
            const archetype = document.getElementById('cityLeagueDeckSelect')?.value;
            
            if (!filterSelect) {
                console.warn('[CityLeague] cityLeagueFilterSelect not found - card overview cannot be rendered');
                return;
            }
            if (!archetype) {
                console.info('[CityLeague] No archetype selected - skipping card overview render');
                return;
            }
            if (!window.currentCityLeagueDeckCards) {
                console.warn('[CityLeague] No deck cards loaded yet for selected archetype');
                return;
            }
            
            const filterValue = filterSelect.value;
            const allCards = window.currentCityLeagueDeckCards;
            const filteredCards = applyShareFilterWithAceSpecBoost(allCards, filterValue);
            
            devLog(`Filter applied: ${filterValue}, showing ${filteredCards.length} of ${allCards.length} cards`);
            
            // Calculate total card counts (sum of max_count)
            const filteredTotal = filteredCards.reduce((sum, card) => sum + parseInt(card.max_count || 0), 0);
            const allTotal = allCards.reduce((sum, card) => sum + parseInt(card.max_count || 0), 0);
            
            // Update deck visual - check which view is active
            const tableViewContainer = document.getElementById('cityLeagueDeckTableView');
            const gridViewContainer = document.getElementById('cityLeagueDeckVisual');
            const isTableViewActive = tableViewContainer && !tableViewContainer.classList.contains('d-none');
            if (isTableViewActive) {
                renderCityLeagueDeckTable(filteredCards);
            } else {
                renderCityLeagueDeckGrid(filteredCards);
            }

            if (gridViewContainer && !isTableViewActive) {
                gridViewContainer.style.display = 'block';
            }
            if (tableViewContainer && isTableViewActive) {
                tableViewContainer.style.display = 'block';
            }
            
            // Update card counts (unique filtered cards / total cards in deck)
            updateCityLeagueCardCounts(filteredCards.length, filteredTotal, allTotal);
        }
        
        function updateCityLeagueCardCounts(uniqueCount, filteredTotal, allTotal) {
            const countEl = document.getElementById('cityLeagueCardCount');
            const summaryEl = document.getElementById('cityLeagueCardCountSummary');
            
            if (countEl) {
                countEl.textContent = `${uniqueCount} ${t('cl.cards')}`;
            }
            if (summaryEl) {
                summaryEl.textContent = `/ ${filteredTotal} ${t('cl.total')}`;
            }
        }
        
        // Add filter change listener
        document.addEventListener('DOMContentLoaded', function() {
            const filterSelect = document.getElementById('cityLeagueFilterSelect');
            if (filterSelect) {
                filterSelect.onchange = applyCityLeagueFilter;
            }
        })

        function filterCityLeagueAnalysisCards() {
            const searchTerm = (document.getElementById('cityLeagueCardSearchInput')?.value || '').toLowerCase();
            const rows = document.querySelectorAll('#cityLeagueAnalysisTable table tbody tr');
            let visibleCount = 0;

            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                const visible = text.includes(searchTerm);
                row.classList.toggle('d-none', !visible);
                if (visible) visibleCount += 1;
            });

            const countEl = document.getElementById('cityLeagueCardCount');
            if (countEl) {
                countEl.textContent = `${visibleCount} ${t('cl.cards')}`;
            }
        }

        // ── i18n: re-render on language change ──────────────────
        document.addEventListener('languageChanged', () => {
            if (window.cityLeagueLoaded) {
                // Re-render the comparison tables if data is available
                if (window.cityLeagueSortedData) {
                    renderCityLeagueTable(window._cityLeagueTournamentCount || 0, window._cityLeagueDateRange || '');
                }
                // Re-populate the deck dropdown
                if (typeof populateCityLeagueDeckSelect === 'function') {
                    populateCityLeagueDeckSelect();
                }
                // Re-render analysis table if a deck is selected
                if (window.currentCityLeagueDeckCards) {
                    renderCityLeagueAnalysisTable(window.currentCityLeagueDeckCards);
                }
                // Re-render deck grid/table if visible
                if (typeof refreshCityLeagueDeckDisplay === 'function') {
                    refreshCityLeagueDeckDisplay();
                }
            }
        });


