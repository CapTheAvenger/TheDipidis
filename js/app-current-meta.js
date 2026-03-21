// app-current-meta.js — extracted from app.js
// Part of Hausi's Pokemon TCG Analysis

        // Render Interactive Matchup Heatmap
        function renderMatchupHeatmap() {
            try {
                devLog('🔥 Rendering Matchup Heatmap...');

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
                
                // Collect all matchup data from window.matchupData_* variables
                const matchupVars = Object.keys(window).filter(k => k.startsWith('matchupData_'));
                
                if (matchupVars.length === 0) {
                    console.warn('⚠️ No matchup data available');
                    return;
                }
                
                // Build matchup data object (key = deckName)
                const matchupData = {};
                matchupVars.forEach(varName => {
                    const deckName = varName.replace('matchupData_', '').replace(/_/g, ' ');
                    matchupData[deckName] = window[varName];
                });
                
                // Normalisierungs-Helfer für Namen (entfernt Apostrophe, Leerzeichen, Bindestriche)
                const normalizeName = (name) => name ? name.toLowerCase().replace(/[''`\s-]/g, '') : '';
                
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
                    <div id="heatmapSearchWrapper" style="margin: 0 0 15px 0;">
                        <div style="display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end;">
                            <label style="display: flex; flex-direction: column; gap: 4px; color: #2c3e50; font-size: 0.85rem; font-weight: 700; min-width: 240px; flex: 1;">
                                Y-axis (Your deck)
                                <input type="text" id="heatmapSearchY" value="${escapeAttr(rawSearchY)}" placeholder="z.B. N's Zoroark" oninput="if(typeof renderMatchupHeatmap === 'function') renderMatchupHeatmap();" style="padding: 10px; width: 100%; border-radius: 8px; border: 1px solid #ccc; font-family: inherit; font-size: 0.95rem; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
                            </label>
                            <label style="display: flex; flex-direction: column; gap: 4px; color: #2c3e50; font-size: 0.85rem; font-weight: 700; min-width: 240px; flex: 1;">
                                X-axis (Opponents, optional)
                                <input type="text" id="heatmapSearchX" value="${escapeAttr(rawSearchX)}" placeholder="z.B. Dragapult" oninput="if(typeof renderMatchupHeatmap === 'function') renderMatchupHeatmap();" style="padding: 10px; width: 100%; border-radius: 8px; border: 1px solid #ccc; font-family: inherit; font-size: 0.95rem; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
                            </label>
                        </div>
                    </div>
                `;
                
                // 2. DECK-LISTEN AUFTEILEN (X-Achse = Gegner, Y-Achse = Dein Deck)
                const metaDecks = window.currentMetaArchetypes || window.metaArchetypes || window.currentMetaData || [];
                let deckNames = Object.keys(matchupData);
                
                // Sortierung: Prio 1 = Meta-Share, Prio 2 = Match-Anzahl
                deckNames.sort((a, b) => {
                    const deckA = metaDecks.find(d => d.name === a || d.archetype === a);
                    const deckB = metaDecks.find(d => d.name === b || d.archetype === b);
                    const shareA = deckA ? parseFloat(deckA.share || deckA.percentage_in_archetype || 0) : 0;
                    const shareB = deckB ? parseFloat(deckB.share || deckB.percentage_in_archetype || 0) : 0;
                    
                    if (shareA !== shareB && (shareA > 0 || shareB > 0)) {
                        return shareB - shareA;
                    }
                    
                    // Fallback: Match-Anzahl
                    let gamesA = 0, gamesB = 0;
                    if (matchupData[a]) {
                        Object.values(matchupData[a]).forEach(opp => {
                            gamesA += parseInt(opp.matches || opp.total || opp.totalMatches || 0, 10) || 0;
                        });
                    }
                    if (matchupData[b]) {
                        Object.values(matchupData[b]).forEach(opp => {
                            gamesB += parseInt(opp.matches || opp.total || opp.totalMatches || 0, 10) || 0;
                        });
                    }
                    return gamesB - gamesA;
                });
                
                // X-Achse: Top 10/alle; bei Suche werden passende Gegner verwendet
                const xSourceDecks = rawSearchX
                    ? deckNames.filter(deck => {
                        const normalDeck = deck.toLowerCase();
                        const strippedDeck = normalDeck.replace(/['’\s-]/g, '');
                        return normalDeck.includes(rawSearchX) || strippedDeck.includes(normalizedSearchX);
                    })
                    : (window.heatmapExpanded ? deckNames : deckNames.slice(0, 10));

                const xDecks = xSourceDecks;

                // Y-Achse: Suche auf dein Deck; ohne Suche wie bisher (gleich X-Achse)
                const yDecks = rawSearchY
                    ? deckNames.filter(deck => {
                        const normalDeck = deck.toLowerCase();
                        const strippedDeck = normalDeck.replace(/['’\s-]/g, '');
                        return normalDeck.includes(rawSearchY) || strippedDeck.includes(normalizedSearchY);
                    })
                    : xDecks;

                if (rawSearchY || rawSearchX) {
                    devLog(`🔍 Suche aktiv: Y='${rawSearchY || '-'}' (${yDecks.length}), X='${rawSearchX || '-'}' (${xDecks.length})`);
                }

                if (yDecks.length === 0 || xDecks.length === 0) {
                    const safeSearchDisplayY = rawSearchY.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    const safeSearchDisplayX = rawSearchX.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    let emptyReason = 'No decks found.';
                    if (yDecks.length === 0 && rawSearchY) {
                        emptyReason = `No decks found on Y-axis for '${safeSearchDisplayY}'.`;
                    } else if (xDecks.length === 0 && rawSearchX) {
                        emptyReason = `No decks found on X-axis for '${safeSearchDisplayX}'.`;
                    }
                    const emptyHtml = `
                        <div id="matchupHeatmapContainer" class="matchup-heatmap-container" style="margin: 30px 0; padding: 20px; background: white; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                            <h2 style="margin: 0 0 20px 0; color: #2c3e50; font-size: 1.5em; display: flex; align-items: center; gap: 10px;">
                                <span style="font-size: 1.2em;">🔥</span> Matchup Heatmap
                            </h2>
                            ${searchControlsHtml}
                            <p style="text-align: center; color: #444; padding: 20px; font-weight: 500;">${emptyReason}</p>
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
                
                devLog(`🔥 Heatmap-Decks: X-Achse=${xDecks.length}, Y-Achse=${yDecks.length}`);
                
                // 3. HTML GENERIEREN
                let tableHtml = '<table class="matchup-heatmap" style="border-collapse: collapse; width: 100%; font-size: 0.85em;">';
                
                // Tabellenkopf (X-Achse mit Zeilenumbrüchen)
                tableHtml += '<thead><tr><th style="position: sticky; left: 0; z-index: 3; background: #34495e; color: white; padding: 12px 8px; text-align: left; font-weight: 600; border: 1px solid #2c3e50; min-width: 150px;">Your Deck ⚔</th>';
                xDecks.forEach(colDeck => {
                    // KEIN Substring mehr → CSS word-wrap für Zeilenumbrüche
                    tableHtml += `<th title="${colDeck}" style="background: #34495e; color: white; padding: 8px 4px; text-align: center; font-weight: 600; border: 1px solid #2c3e50; min-width: 80px; max-width: 100px; white-space: normal; word-wrap: break-word; font-size: 0.8rem; line-height: 1.2;">${colDeck}</th>`;
                });
                tableHtml += '</tr></thead><tbody>';
                
                // Tabellenzeilen (Y-Achse)
                yDecks.forEach(rowDeck => {
                    tableHtml += `<tr><th style="position: sticky; left: 0; z-index: 2; background: #ecf0f1; color: #2c3e50; padding: 10px 8px; text-align: left; font-weight: bold; border: 1px solid #bdc3c7; white-space: normal; word-wrap: break-word; max-width: 120px; font-size: 0.9rem; line-height: 1.3;">${rowDeck}</th>`;
                    
                    xDecks.forEach(colDeck => {
                        // Mirror Match
                        if (normalizeName(rowDeck) === normalizeName(colDeck)) {
                            tableHtml += '<td style="background: rgba(52, 73, 94, 0.1); color: #7f8c8d; padding: 10px 6px; text-align: center; font-weight: 600; border: 1px solid #ddd;" title="Mirror match">\\</td>';
                            return;
                        }
                        
                        let cellData = null;
                        const rowData = matchupData[rowDeck];
                        
                        // Kugelsicher: Handle both Arrays and Objects mit Normalisierung
                        if (Array.isArray(rowData)) {
                            cellData = rowData.find(opp => 
                                normalizeName(opp.deck) === normalizeName(colDeck) || 
                                normalizeName(opp.name) === normalizeName(colDeck) || 
                                normalizeName(opp.archetype) === normalizeName(colDeck) || 
                                normalizeName(opp.opponent) === normalizeName(colDeck)
                            );
                        } else if (rowData) {
                            // Objekt-Format: Suche mit normalisiertem Key
                            const matchedKey = Object.keys(rowData).find(k => normalizeName(k) === normalizeName(colDeck));
                            if (matchedKey) cellData = rowData[matchedKey];
                        }
                        
                        if (!cellData) {
                            tableHtml += '<td style="background: rgba(149, 165, 166, 0.15); color: #95a5a6; padding: 10px 6px; text-align: center; font-weight: 600; border: 1px solid #ddd;" title="No data available">-</td>';
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
                            tableHtml += '<td style="background: rgba(149, 165, 166, 0.15); color: #95a5a6; padding: 10px 6px; text-align: center; font-weight: 600; border: 1px solid #ddd;">-</td>';
                        } else {
                            const totalGames = parseInt(cellData.total_games) || (parsedWins + parsedLosses + parsedDraws);
                            let bgColor, textColor;
                            
                            if (winRate >= 55.0) {
                                const intensity = Math.min((winRate - 55) / 20, 1);
                                bgColor = `rgba(76, 175, 80, ${0.3 + intensity * 0.4})`;
                                textColor = winRate >= 65 ? 'white' : '#27ae60';
                            } else if (winRate <= 45.0) {
                                const intensity = Math.min((45 - winRate) / 20, 1);
                                bgColor = `rgba(244, 67, 54, ${0.3 + intensity * 0.4})`;
                                textColor = winRate <= 35 ? 'white' : '#e74c3c';
                            } else {
                                bgColor = 'rgba(241, 196, 15, 0.2)';
                                textColor = '#7f8c8d';
                            }
                            
                            const tooltip = `${parsedWins}W - ${parsedLosses}L (${totalGames} games)`;
                            const safeRow = escapeJsStr(rowDeck);
                            const safeCol = escapeJsStr(colDeck);
                            tableHtml += `<td style="background: ${bgColor}; color: ${textColor}; padding: 10px 6px; text-align: center; font-weight: 600; border: 1px solid #ddd; cursor: help; transition: all 0.2s;" title="${tooltip}" onclick="showToast('${safeRow} vs ${safeCol}: ${tooltip}', 'info', 3000)" onmouseover="this.style.transform='scale(1.1)'; this.style.zIndex='10'; this.style.boxShadow='0 4px 8px rgba(0,0,0,0.2)'" onmouseout="this.style.transform='scale(1)'; this.style.zIndex='1'; this.style.boxShadow='none'">${winRate.toFixed(1)}%</td>`;
                        }
                    });
                    tableHtml += '</tr>';
                });
                tableHtml += '</tbody></table>';
                
                // Wrapper HTML
                let html = `
                    <div id="matchupHeatmapContainer" class="matchup-heatmap-container" style="margin: 30px 0; padding: 20px; background: white; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                        <h2 style="margin: 0 0 20px 0; color: #2c3e50; font-size: 1.5em; display: flex; align-items: center; gap: 10px;">
                            <span style="font-size: 1.2em;">🔥</span> Matchup Heatmap
                        </h2>
                        <p style="color: #7f8c8d; margin: 0 0 20px 0; font-size: 0.9em;">
                            Interactive win rate matrix. <span style="color: #27ae60; font-weight: 600;">Green</span> = Favorable (≥55%), 
                            <span style="color: #7f8c8d; font-weight: 600;">Gray</span> = Even (45-54.9%), 
                            <span style="color: #e74c3c; font-weight: 600;">Red</span> = Unfavorable (≤45%)
                        </p>
                        ${searchControlsHtml}
                        <div style="overflow-x: auto;">
                            ${tableHtml}
                            <div style="text-align: center; margin-top: 15px;">
                                <button class="action-btn" onclick="window.heatmapExpanded = !window.heatmapExpanded; renderMatchupHeatmap();">
                                    ${window.heatmapExpanded ? '▲ Show top 10 only' : '▼ Show all decks'}
                                </button>
                            </div>
                        </div>
                        <p style="color: #95a5a6; margin: 15px 0 0 0; font-size: 0.8em; font-style: italic;">
                            💡 Hover over cells to see detailed game counts. Data from Limitless Online.
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
                        input.focus();
                        if (typeof activeSelectionStart === 'number' && typeof activeSelectionEnd === 'number') {
                            try {
                                input.setSelectionRange(activeSelectionStart, activeSelectionEnd);
                            } catch (e) {
                                // ignore selection restore errors for unsupported input states
                            }
                        }
                    });
                }
                
                devLog('✅ Matchup Heatmap rendered successfully');
                
            } catch (error) {
                console.error('❌ Error rendering Matchup Heatmap:', error);
            }
        }



        
        // Load Current Analysis
        async function loadCurrentAnalysis() {
            devLog('?? Loading Current Meta Analysis Tab...');
            
            // Load Current Meta HTML (for matchup data) if not already loaded
            if (!window.currentMetaLoaded) {
                devLog('?? Loading Current Meta HTML for matchup data...');
                await loadCurrentMeta();
            }
            
            // Load Current Meta Analysis (deck analysis)
            if (!window.currentMetaAnalysisLoaded) {
                await loadCurrentMetaAnalysis();
            }
            
            // Load saved deck from localStorage
            loadCurrentMetaDeck();
            
            window.currentAnalysisLoaded = true;
        }
        
        // LocalStorage functions for Current Meta
        function loadCurrentMetaDeck() {
            const saved = localStorage.getItem('currentMetaDeck');
            if (!saved) {
                devLog('?? No saved Current Meta deck found');
                return;
            }
            
            try {
                const data = JSON.parse(saved);
                devLog('? Loaded Current Meta deck from localStorage:', data);
                
                if (data.deck) {
                    window.currentMetaDeck = data.deck;
                }
                if (data.order) {
                    window.currentMetaDeckOrder = data.order;
                }
                if (data.archetype) {
                    window.currentCurrentMetaArchetype = data.archetype;
                    // Pre-select archetype in dropdown if it exists (but don't display deck yet)
                    devLog('?? Saved archetype found:', data.archetype, '(waiting for user to select archetype)');
                }
                
                // DON'T automatically display deck - wait for archetype selection
                devLog('?? Current Meta Deck loaded but not displayed (waiting for archetype selection)');
            } catch (e) {
                console.error('? Error loading Current Meta deck:', e);
            }
        }
        
        function saveCurrentMetaDeck() {
            try {
                const deck = window.currentMetaDeck || {};
                const deckSize = Object.keys(deck).length;
                
                // If deck is empty, remove from localStorage instead of saving empty object
                if (deckSize === 0) {
                    localStorage.removeItem('currentMetaDeck');
                    devLog('?? Current Meta deck is empty - removed from localStorage');
                    return;
                }
                
                const data = {
                    deck: deck,
                    order: window.currentMetaDeckOrder || [],
                    archetype: window.currentCurrentMetaArchetype || null,
                    timestamp: new Date().toISOString()
                };
                
                localStorage.setItem('currentMetaDeck', JSON.stringify(data));
                devLog('?? Current Meta deck saved to localStorage:', deckSize, 'cards');
            } catch (e) {
                console.error('? Error saving Current Meta deck:', e);
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
                    devLog('?? Loaded Past Meta deck from localStorage:', Object.keys(window.pastMetaDeck).length, 'cards');
                    return true;
                }
            } catch (e) {
                console.error('? Error loading Past Meta deck:', e);
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
                    devLog('?? Past Meta deck is empty - removed from localStorage');
                    return;
                }
                
                const data = {
                    deck: deck,
                    order: window.pastMetaDeckOrder || [],
                    archetype: window.pastMetaCurrentArchetype || null,
                    timestamp: new Date().toISOString()
                };
                
                localStorage.setItem('pastMetaDeck', JSON.stringify(data));
                devLog('?? Past Meta deck saved to localStorage:', deckSize, 'cards');
            } catch (e) {
                console.error('? Error saving Past Meta deck:', e);
            }
        }
        