// app-current-meta.js — extracted from app.js
// Part of Hausi's Pokemon TCG Analysis

        // Debounce timer for heatmap search inputs
        let _heatmapDebounceTimer = null;
        function debouncedRenderHeatmap() {
            clearTimeout(_heatmapDebounceTimer);
            _heatmapDebounceTimer = setTimeout(() => {
                if (typeof renderMatchupHeatmap === 'function') renderMatchupHeatmap();
            }, 200);
        }

        // Matchup data registry (avoids Object.keys(window) scan)
        window._matchupRegistry = window._matchupRegistry || {};

        // Render Interactive Matchup Heatmap
        function renderMatchupHeatmap() {
            try {
                devLog('Rendering Matchup Heatmap...');

                const activeElement = document.activeElement;
                const activeHeatmapInputId = (activeElement && (activeElement.id === 'heatmapSearchY' || activeElement.id === 'heatmapSearchX'))
                    ? activeElement.id
                    : null;
                const activeSelectionStart = activeHeatmapInputId && typeof activeElement.selectionStart === 'number'
                    ? activeElement.selectionStart
                    : null;
                const activeSelectionEnd = activeHeatmapInputId && typeof activeElement.selectionEnd === 'number'
                    ? activeElement.selectionEnd
                    : null;
                
                // Initialize expanded state if not set
                if (typeof window.heatmapExpanded === 'undefined') {
                    window.heatmapExpanded = false;
                }
                
                // Collect matchup data from registry (fast path) or fallback to window scan
                const registry = window._matchupRegistry || {};
                let matchupData = {};
                if (Object.keys(registry).length > 0) {
                    matchupData = registry;
                } else {
                    const matchupVars = Object.keys(window).filter(k => k.startsWith('matchupData_'));
                    matchupVars.forEach(varName => {
                        const deckName = varName.replace('matchupData_', '').replace(/_/g, ' ');
                        matchupData[deckName] = window[varName];
                    });
                }
                
                if (Object.keys(matchupData).length === 0) {
                    console.warn('No matchup data available');
                    return;
                }
                
                // Normalize deck names consistently for matching/filtering (all apostrophe variants + spaces/hyphens).
                const normalizeName = (name) => name
                    ? String(name).toLowerCase().replace(/[\u2019\u2018\u201B'`´\s-]/g, '')
                    : '';
                
                const escapeAttr = (value) => String(value || '')
                    .replace(/&/g, '&amp;')
                    .replace(/"/g, '&quot;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');

                const existingSearchYInput = document.getElementById('heatmapSearchY');
                const existingSearchXInput = document.getElementById('heatmapSearchX');
                const rawSearchY = ((existingSearchYInput && existingSearchYInput.value) || window.heatmapSearchY || '').toLowerCase().trim();
                const rawSearchX = ((existingSearchXInput && existingSearchXInput.value) || window.heatmapSearchX || '').toLowerCase().trim();
                window.heatmapSearchY = rawSearchY;
                window.heatmapSearchX = rawSearchX;
                const normalizedSearchY = rawSearchY.replace(/['’\s-]/g, '');
                const normalizedSearchX = rawSearchX.replace(/['’\s-]/g, '');
                const searchControlsHtml = `
                    <div id="heatmapSearchWrapper" class="heatmap-search-wrapper">
                        <div class="heatmap-search-row">
                            <label class="heatmap-search-label">
                                ${t('heatmap.yLabel')}
                                <input type="text" id="heatmapSearchY" value="${escapeAttr(rawSearchY)}" placeholder="${t('heatmap.placeholderY')}" oninput="if(typeof debouncedRenderHeatmap === 'function') debouncedRenderHeatmap();" class="heatmap-search-input">
                            </label>
                            <label class="heatmap-search-label">
                                ${t('heatmap.xLabel')}
                                <input type="text" id="heatmapSearchX" value="${escapeAttr(rawSearchX)}" placeholder="${t('heatmap.placeholderX')}" oninput="if(typeof debouncedRenderHeatmap === 'function') debouncedRenderHeatmap();" class="heatmap-search-input">
                            </label>
                        </div>
                    </div>
                `;
                
                // 2. DECK-LISTEN AUFTEILEN (X-Achse = Gegner, Y-Achse = Dein Deck)
                // The axis order used to depend on three globals that are
                // assigned NOWHERE in the project (currentMetaArchetypes /
                // metaArchetypes / currentMetaData), so metaDeckShareMap was
                // always empty; and the fallback read opp.matches / total /
                // totalMatches while the registry stores total_games, so that
                // was always 0 too. Both comparators returned 0 for every
                // pair and the axis simply kept CSV order. No visible damage
                // so far — the scraper happens to emit rank order — which is
                // exactly why it went unnoticed: the sorting silently
                // depended on its input already being sorted.
                const metaDecks = window.currentMetaArchetypes || window.metaArchetypes
                    || window.currentMetaData || [];
                let deckNames = Object.keys(matchupData);

                // PERFORMANCE: Build lookup map once (O(M)) instead of O(M) per comparator call during sort
                const metaDeckShareMap = new Map();
                metaDecks.forEach(d => {
                    // parseLocaleNumber, not parseFloat: these values can
                    // carry a decimal comma, and a parseFloat fallback would
                    // quietly reintroduce the truncation it is guarding
                    // against. app-utils.js loads before this file.
                    const share = parseLocaleNumber(d.share || d.percentage_in_archetype || 0, 0);
                    if (d.name) metaDeckShareMap.set(d.name, share);
                    if (d.archetype && d.archetype !== d.name) metaDeckShareMap.set(d.archetype, share);
                });
                
                const countGames = (row) => {
                    if (!row) return 0;
                    return Object.values(row).reduce((sum, opp) => sum + (
                        parseInt(opp.total_games ?? opp.matches ?? opp.total
                                 ?? opp.totalMatches ?? 0, 10) || 0), 0);
                };

                // Sortierung: Prio 1 = Meta-Share, Prio 2 = Anzahl Spiele
                deckNames.sort((a, b) => {
                    const shareA = metaDeckShareMap.get(a) ?? 0;
                    const shareB = metaDeckShareMap.get(b) ?? 0;
                    
                    if (shareA !== shareB && (shareA > 0 || shareB > 0)) {
                        return shareB - shareA;
                    }
                    
                    // Fallback: total games played. `total_games` is what
                    // buildMatchupRegistryFromCsv actually writes
                    // (js/app-meta-cards.js:1258); the older key names are
                    // kept for the legacy window-scan shape.
                    return countGames(matchupData[b]) - countGames(matchupData[a]);
                });
                
                const axisDeckLimit = (window.heatmapExpanded ? deckNames : deckNames.slice(0, 10));
                const matchesAxisSearch = (deckName, rawSearch, normalizedSearch) => {
                    const normalDeck = String(deckName || '').toLowerCase();
                    const strippedDeck = normalDeck.replace(/[\u2019\u2018\u201B'`´\s-]/g, '');
                    return normalDeck.includes(rawSearch) || strippedDeck.includes(normalizedSearch);
                };

                // X-Achse (Gegner): nur X-Suche beeinflusst X.
                const xDecks = rawSearchX
                    ? deckNames.filter(deck => matchesAxisSearch(deck, rawSearchX, normalizedSearchX))
                    : axisDeckLimit;

                // Y-Achse (dein Deck): nur Y-Suche beeinflusst Y.
                const yDecks = rawSearchY
                    ? deckNames.filter(deck => matchesAxisSearch(deck, rawSearchY, normalizedSearchY))
                    : axisDeckLimit;

                if (rawSearchY || rawSearchX) {
                    devLog(`Suche aktiv: Y='${rawSearchY || '-'}' (${yDecks.length}), X='${rawSearchX || '-'}' (${xDecks.length})`);
                }

                if (yDecks.length === 0 || xDecks.length === 0) {
                    const safeSearchDisplayY = rawSearchY.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    const safeSearchDisplayX = rawSearchX.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    let emptyReason = t('heatmap.noDecks');
                    if (yDecks.length === 0 && rawSearchY) {
                        emptyReason = `${t('heatmap.noDecksY')} '${safeSearchDisplayY}'.`;
                    } else if (xDecks.length === 0 && rawSearchX) {
                        emptyReason = `${t('heatmap.noDecksX')} '${safeSearchDisplayX}'.`;
                    }
                    const emptyHtml = `
                        <div id="matchupHeatmapContainer" class="matchup-heatmap-container heatmap-container-std">
                            <h2 class="heatmap-title heatmap-title-std"><span class="heatmap-title-icon"></span> ${t('heatmap.title')}</h2>
                            ${searchControlsHtml}
                            <p class="heatmap-empty-reason">${emptyReason}</p>
                        </div>
                    `;

                    const existingContainer = document.getElementById('matchupHeatmapContainer');
                    if (existingContainer) {
                        existingContainer.outerHTML = emptyHtml;
                    } else {
                        const currentMetaContent = document.getElementById('currentMetaContent');
                        if (currentMetaContent) {
                            currentMetaContent.insertAdjacentHTML('afterbegin', emptyHtml);
                        }
                    }
                    return;
                }
                
                devLog(`Heatmap-Decks: X-Achse=${xDecks.length}, Y-Achse=${yDecks.length}`);
                
                // 3. HTML GENERIEREN
                let tableHtml = '<table class="heatmap-table">';
                tableHtml += `<colgroup><col class="heatmap-col-first">${xDecks.map(() => '<col class="heatmap-col-data">').join('')}</colgroup>`;
                
                // PERFORMANCE: Pre-compute normalized colDeck names (once per render, not per cell)
                const normalizedColDeckMap = new Map(xDecks.map(d => [d, normalizeName(d)]));
                
                // PERFORMANCE: Pre-build per-rowDeck normalized lookup maps (O(N+M) total vs O(N*M*K) inline)
                const rowLookupMaps = new Map();
                yDecks.forEach(rowDeck => {
                    const rowData = matchupData[rowDeck];
                    if (!rowData) return;
                    const lookup = new Map();
                    if (Array.isArray(rowData)) {
                        rowData.forEach(opp => {
                            const norm = normalizeName(opp.deck || opp.name || opp.archetype || opp.opponent || '');
                            if (norm) lookup.set(norm, opp);
                        });
                    } else {
                        Object.entries(rowData).forEach(([k, v]) => lookup.set(normalizeName(k), v));
                    }
                    rowLookupMaps.set(rowDeck, lookup);
                });
                
                // Small helper: Pokémon-icon HTML for an archetype, empty
                // string when no mapping exists. Keeps the text label as
                // fallback when ArchetypeIcons is missing or unknown.
                const iconHtml = (name) => {
                    if (typeof window.ArchetypeIcons === 'undefined') return '';
                    const urls = window.ArchetypeIcons.getIconUrls(name);
                    if (!urls || !urls.length) return '';
                    const imgs = urls.map(u =>
                        `<img class="tcg-pokemon-icon tcg-pokemon-icon--sm" src="${u}" alt="" loading="lazy" onerror="this.style.display='none'">`
                    ).join('');
                    return urls.length > 1
                        ? `<span class="tcg-pokemon-icon-group tcg-pokemon-icon-group--inline">${imgs}</span>`
                        : imgs;
                };
                const escAttr = (s) => String(s).replace(/"/g, '&quot;');

                // Tabellenkopf (X-Achse mit Zeilenumbrüchen)
                tableHtml += '<thead><tr><th class="heatmap-th-x">' + t('heatmap.yourDeck') + '</th>';
                xDecks.forEach(colDeck => {
                    // Icons stacked above the wrapped name; title keeps full name on hover
                    const ic = iconHtml(colDeck);
                    const inner = ic
                        ? `<span style="display:flex;flex-direction:column;align-items:center;gap:2px;">${ic}<span>${colDeck}</span></span>`
                        : colDeck;
                    tableHtml += `<th title="${escAttr(colDeck)}" class="heatmap-th-y">${inner}</th>`;
                });
                tableHtml += '</tr></thead><tbody>';

                // Tabellenzeilen (Y-Achse)
                yDecks.forEach(rowDeck => {
                    const rIc = iconHtml(rowDeck);
                    const rowLabel = rIc
                        ? `<span style="display:inline-flex;align-items:center;gap:6px;">${rIc}<span>${rowDeck}</span></span>`
                        : rowDeck;
                    tableHtml += `<tr><th class="heatmap-th-row" title="${escAttr(rowDeck)}">${rowLabel}</th>`;
                    const rowLookup = rowLookupMaps.get(rowDeck);
                    
                    xDecks.forEach(colDeck => {
                        // Mirror Match
                        if (normalizeName(rowDeck) === normalizedColDeckMap.get(colDeck)) {
                            tableHtml += '<td class="heatmap-td heatmap-td-mirror" title="' + t('heatmap.mirror') + '">\\</td>';
                            return;
                        }
                        
                        // O(1) lookup using pre-built map
                        const cellData = rowLookup ? (rowLookup.get(normalizedColDeckMap.get(colDeck)) ?? null) : null;
                        
                        if (!cellData) {
                            tableHtml += '<td class="heatmap-td heatmap-td-nodata" title="' + t('heatmap.noData') + '">-</td>';
                            return;
                        }
                        
                        // Parse record field "W - L - D" to extract wins/losses
                        let parsedWins = 0, parsedLosses = 0, parsedDraws = 0;
                        const recordStr = cellData.record || '';
                        if (recordStr) {
                            const parts = recordStr.split(/\s*-\s*/);
                            if (parts.length >= 2) {
                                parsedWins = parseInt(parts[0]) || 0;
                                parsedLosses = parseInt(parts[1]) || 0;
                                parsedDraws = parts.length >= 3 ? (parseInt(parts[2]) || 0) : 0;
                            }
                        }
                        // Fallback to explicit wins/losses fields if record not available
                        if (!recordStr && (cellData.wins !== undefined || cellData.losses !== undefined)) {
                            parsedWins = parseInt(cellData.wins) || 0;
                            parsedLosses = parseInt(cellData.losses) || 0;
                        }

                        // Flexibles Auslesen der Winrate
                        const winRateStr = cellData.winRate || cellData.winrate || cellData.win_rate || cellData.wr;
                        let winRate = parseFloat(winRateStr);
                        
                        // Fallback: Winrate selbst berechnen
                        if (isNaN(winRate) && (parsedWins + parsedLosses) > 0) {
                            winRate = (parsedWins / (parsedWins + parsedLosses)) * 100;
                        }
                        
                        if (isNaN(winRate)) {
                            tableHtml += '<td class="heatmap-td heatmap-td-nodata">-</td>';
                        } else {
                            const totalGames = parseInt(cellData.total_games) || (parsedWins + parsedLosses + parsedDraws);
                            // Angezeigt wird die geglaettete Quote, nicht der
                            // Rohwert. Der Median unserer Paarungen hat 16
                            // Partien, 55 % liegen unter 20 — roh stand in
                            // dieser Tabelle "100,0 %" auf einem 3-0.
                            // js/matchup-glaettung.js haelt die Formel, der
                            // Rohwert steht weiter im Tooltip.
                            const _G = window.DsGlaettung;
                            const winRateRoh = winRate;
                            if (_G) {
                                winRate = Number.isFinite(Number(cellData.win_rate_shrunk))
                                    ? Number(cellData.win_rate_shrunk)
                                    : _G.quote(parsedWins, parsedLosses);
                            }
                            let bgColor, textColor;
                            
                            // Blau <-> Rot mit grauem Nullpunkt, nicht Gruen <-> Rot.
                            //
                            // Die Heatmap war die dritte Stelle auf der Seite mit
                            // einer rot-gruenen Skala, und die schlimmste: hier
                            // steht die Farbe FUER die Aussage, nicht neben ihr.
                            // Wer Rot und Gruen nicht trennt, liest aus dieser
                            // Tabelle nichts. css/tokens.css hat die Entscheidung
                            // fuer die ganze Seite getroffen — die Werte hier sind
                            // --dv-pos (42,120,214) und --dv-neg (227,73,72).
                            //
                            // Und die Schrift traegt immer dieselbe Textfarbe. Die
                            // alte Fassung schaltete ab 65 % auf Weiss und ab 35 %
                            // auf Weiss um, was den Kontrast von der Zahl abhaengig
                            // machte. Getoente Zelle, feste Schrift: der Kontrast
                            // muss nie geprueft werden.
                            if (winRate >= 55.0) {
                                const intensity = Math.min((winRate - 55) / 20, 1);
                                bgColor = `rgba(42, 120, 214, ${0.12 + intensity * 0.34})`;
                                textColor = 'var(--ink)';
                                var tdClass = 'heatmap-td heatmap-td-fav';
                            } else if (winRate <= 45.0) {
                                const intensity = Math.min((45 - winRate) / 20, 1);
                                bgColor = `rgba(227, 73, 72, ${0.12 + intensity * 0.34})`;
                                textColor = 'var(--ink)';
                                var tdClass = 'heatmap-td heatmap-td-unfav';
                            } else {
                                bgColor = 'var(--surface-2)';
                                textColor = 'var(--ink-3)';
                                var tdClass = 'heatmap-td heatmap-td-even';
                            }
                            const tooltip = `${parsedWins}W - ${parsedLosses}L (${totalGames} ${t('heatmap.games')}) · ${t('heatmap.raw')} ${winRateRoh.toFixed(1)} %`;
                            const safeRow = escapeJsStr(rowDeck);
                            const safeCol = escapeJsStr(colDeck);
                            // Inline sample-size below the WR. Cells with n<10 get a
                            // muted "low" tag so users can see at a glance which numbers
                            // are statistically thin (TrainerHill's confidence cue).
                            // Duenn wird ueber eine gestrichelte Umrandung
                            // gezeigt, nicht ueber Blaesse. Blaesse war der
                            // Grund fuer den Kontrast von 3,42:1 an genau
                            // diesen Zellen — die Information "wenig Partien"
                            // wurde bezahlt mit "schlechter lesbar". Die
                            // Strichelung traegt dieselbe Aussage und laesst
                            // den Kontrast in Ruhe. Schwelle 20, dieselbe wie
                            // THIN_GAMES in js/app-archetype-card.js.
                            const lowSample = totalGames < 20;
                            const sampleClass = 'heatmap-td-n';
                            // "n=638" ist Rechnerjargon. Gemeldet am 19.08.2026:
                            // "n ist gleich sagt nichts aus … es muss fuer jeden
                            // von der Strasse klar sein, was sind hier die Daten,
                            // die ich sehen kann." Also steht da jetzt, was es ist.
                            const sampleHtml = `<small class="${sampleClass}">${totalGames} ${
                                t('heatmap.gamesShort')}</small>`;
                            tableHtml += `<td class="${tdClass} heatmap-td-dyn${lowSample ? ' heatmap-td-thin' : ''}" style="--heatmap-bg: ${bgColor}; --heatmap-color: ${textColor};" title="${tooltip}" onclick="showToast('${safeRow} vs ${safeCol}: ${tooltip}', 'info', 3000)">${(typeof window.formatPercent === 'function')
                                ? window.formatPercent(winRate) : winRate.toFixed(1) + ' %'}${sampleHtml}</td>`;
                        }
                    });
                    tableHtml += '</tr>';
                });
                tableHtml += '</tbody></table>';
                
                // Wrapper HTML
                let html = `
                    <div id="matchupHeatmapContainer" class="heatmap-container">
                        <h2 class="heatmap-title"><span style="font-size: 1.2em;"></span> ${t('heatmap.title')}</h2>
                        <p class="heatmap-desc">
                            ${t('heatmap.desc')}
                            <span class="heatmap-key heatmap-key-fav"></span> ${t('heatmap.favorable')} (≥ 55 %),
                            <span class="heatmap-key heatmap-key-even"></span> ${t('heatmap.even')} (45–54,9 %),
                            <span class="heatmap-key heatmap-key-unfav"></span> ${t('heatmap.unfavorable')} (≤ 45 %)
                        </p>
                        ${searchControlsHtml}
                        <div class="heatmap-table-scroll">
                            ${tableHtml}
                        </div>
                        <div class="heatmap-btn-row">
                            <button class="ds-btn" onclick="window.heatmapExpanded = !window.heatmapExpanded; renderMatchupHeatmap();">
                                ${window.heatmapExpanded ? t('heatmap.showTop10') : t('heatmap.showAll')}
                            </button>
                        </div>
                        <p class="heatmap-hint">
                            ${t('heatmap.hint')}
                        </p>
                    </div>
                `;
                
                // Insert or replace heatmap
                const existingContainer = document.getElementById('matchupHeatmapContainer');
                if (existingContainer) {
                    existingContainer.outerHTML = html;
                } else {
                    const currentMetaContent = document.getElementById('currentMetaContent');
                    if (currentMetaContent) {
                        currentMetaContent.insertAdjacentHTML('afterbegin', html);
                    }
                }

                if (activeHeatmapInputId) {
                    requestAnimationFrame(() => {
                        const input = document.getElementById(activeHeatmapInputId);
                        if (!input) return;
                        input.focus({ preventScroll: true });
                        if (typeof activeSelectionStart === 'number' && typeof activeSelectionEnd === 'number') {
                            try {
                                input.setSelectionRange(activeSelectionStart, activeSelectionEnd);
                            } catch (e) {
                                // ignore selection restore errors for unsupported input states
                            }
                        }
                    });
                }
                
                devLog('Matchup Heatmap rendered successfully');
                
            } catch (error) {
                console.error('Error rendering Matchup Heatmap:', error);
            }
        }



        
        // Load Current Analysis
        async function loadCurrentAnalysis() {
            devLog('Loading Current Meta Analysis Tab...');
            
            // Load Current Meta HTML (for matchup data) if not already loaded
            if (!window.currentMetaLoaded) {
                devLog('Loading Current Meta HTML for matchup data...');
                await loadCurrentMeta();
            }
            
            // Load Current Meta Analysis (deck analysis)
            if (!window.currentMetaAnalysisLoaded) {
                await loadCurrentMetaAnalysis();
            }

            const metaGrid = document.getElementById('currentMetaMetaGrid');
            const shouldRefreshMetaAnalysis =
                !metaGrid ||
                !metaGrid.children.length ||
                /no data|load meta analysis|loading/i.test(metaGrid.textContent || '');
            if (shouldRefreshMetaAnalysis && typeof loadMetaCardAnalysis === 'function') {
                loadMetaCardAnalysis('currentMeta').catch(err => {
                    console.warn('[loadCurrentAnalysis] Auto-load meta analysis failed:', err);
                });
            }
            
            // Load saved deck from localStorage
            loadCurrentMetaDeck();
            
            window.currentAnalysisLoaded = true;
        }
        
        // LocalStorage functions for Current Meta
        function loadCurrentMetaDeck() {
            const saved = localStorage.getItem('currentMetaDeck');
            if (!saved) {
                devLog('No saved Current Meta deck found');
                return;
            }
            
            try {
                const data = JSON.parse(saved);
                devLog('Loaded Current Meta deck from localStorage:', data);
                
                if (data.deck) {
                    window.currentMetaDeck = data.deck;
                }
                if (data.order) {
                    window.currentMetaDeckOrder = data.order;
                }
                if (data.archetype) {
                    window.currentMetaArchetype = data.archetype;
                    // Pre-select archetype in dropdown if it exists (but don't display deck yet)
                    devLog('Saved archetype found:', data.archetype, '(waiting for user to select archetype)');
                }
                if (Array.isArray(data.pinned) && typeof window.pinnedCardsFromArray === 'function') {
                    window.pinnedCardsFromArray('currentMeta', data.pinned);
                }
                if (Array.isArray(data.excluded) && typeof window.excludedCardsFromArray === 'function') {
                    window.excludedCardsFromArray('currentMeta', data.excluded);
                }
                if (Array.isArray(data.techSlots) && typeof window.techSlotsFromArray === 'function') {
                    window.techSlotsFromArray('currentMeta', data.techSlots);
                }

                // DON'T automatically display deck - wait for archetype selection
                devLog('Current Meta Deck loaded but not displayed (waiting for archetype selection)');
            } catch (e) {
                console.error('Error loading Current Meta deck:', e);
            }
        }
        
        function saveCurrentMetaDeck() {
            try {
                const deck = window.currentMetaDeck || {};
                const deckSize = Object.keys(deck).length;
                
                // If deck is empty, remove from localStorage instead of saving empty object
                if (deckSize === 0) {
                    localStorage.removeItem('currentMetaDeck');
                    devLog('Current Meta deck is empty - removed from localStorage');
                    return;
                }
                
                const data = {
                    deck: deck,
                    order: window.currentMetaDeckOrder || [],
                    archetype: window.currentMetaArchetype || null,
                    pinned: typeof window.pinnedCardsToArray === 'function' ? window.pinnedCardsToArray('currentMeta') : [],
                    excluded: typeof window.excludedCardsToArray === 'function' ? window.excludedCardsToArray('currentMeta') : [],
                    techSlots: typeof window.techSlotsToArray === 'function' ? window.techSlotsToArray('currentMeta') : [],
                    timestamp: new Date().toISOString()
                };

                localStorage.setItem('currentMetaDeck', JSON.stringify(data));
                devLog('Current Meta deck saved to localStorage:', deckSize, 'cards');
            } catch (e) {
                console.error('Error saving Current Meta deck:', e);
            }
        }
        
        function loadPastMetaDeck() {
            try {
                const saved = localStorage.getItem('pastMetaDeck');
                if (saved) {
                    const parsed = JSON.parse(saved);
                    window.pastMetaDeck = parsed.deck || {};
                    window.pastMetaDeckOrder = parsed.order || [];
                    window.pastMetaCurrentArchetype = parsed.archetype || null;
                    if (Array.isArray(parsed.pinned) && typeof window.pinnedCardsFromArray === 'function') {
                        window.pinnedCardsFromArray('pastMeta', parsed.pinned);
                    }
                    if (Array.isArray(parsed.excluded) && typeof window.excludedCardsFromArray === 'function') {
                        window.excludedCardsFromArray('pastMeta', parsed.excluded);
                    }
                    if (Array.isArray(parsed.techSlots) && typeof window.techSlotsFromArray === 'function') {
                        window.techSlotsFromArray('pastMeta', parsed.techSlots);
                    }
                    devLog('Loaded Past Meta deck from localStorage:', Object.keys(window.pastMetaDeck).length, 'cards');
                    return true;
                }
            } catch (e) {
                console.error('Error loading Past Meta deck:', e);
            }
            window.pastMetaDeck = {};
            window.pastMetaDeckOrder = [];
            window.pastMetaCurrentArchetype = null;
            return false;
        }
        
        function savePastMetaDeck() {
            try {
                const deck = window.pastMetaDeck || {};
                const deckSize = Object.keys(deck).length;
                
                // If deck is empty, remove from localStorage instead of saving empty object
                if (deckSize === 0) {
                    localStorage.removeItem('pastMetaDeck');
                    devLog('Past Meta deck is empty - removed from localStorage');
                    return;
                }
                
                const data = {
                    deck: deck,
                    order: window.pastMetaDeckOrder || [],
                    archetype: window.pastMetaCurrentArchetype || null,
                    pinned: typeof window.pinnedCardsToArray === 'function' ? window.pinnedCardsToArray('pastMeta') : [],
                    excluded: typeof window.excludedCardsToArray === 'function' ? window.excludedCardsToArray('pastMeta') : [],
                    techSlots: typeof window.techSlotsToArray === 'function' ? window.techSlotsToArray('pastMeta') : [],
                    timestamp: new Date().toISOString()
                };

                localStorage.setItem('pastMetaDeck', JSON.stringify(data));
                devLog('Past Meta deck saved to localStorage:', deckSize, 'cards');
            } catch (e) {
                console.error('Error saving Past Meta deck:', e);
            }
        }

        // ── i18n: re-render on language change ──────────────────
        document.addEventListener('languageChanged', () => {
            if (typeof renderMatchupHeatmap === 'function' && document.getElementById('matchupAnalysisModal')?.style.display !== 'none') renderMatchupHeatmap();
        });
        