// app-meta-cards.js — extracted from app.js
// Part of Hausi's Pokemon TCG Analysis

        let metaCardData = {
            cityLeague: [],
            currentMeta: []
        };
        
        let metaCardFilter = {
            cityLeague: { shareThreshold: 'all', cardType: 'all', sortBy: 'type', searchTerm: '' },
            currentMeta: { shareThreshold: 'all', cardType: 'all', sortBy: 'type', searchTerm: '' }
        };

        function getActiveCityLeagueFormat() {
            const formatFromAnalysisSelect = document.getElementById('cityLeagueFormatSelectAnalysis')?.value;
            const formatFromMainSelect = document.getElementById('cityLeagueFormatSelect')?.value;
            const raw = formatFromAnalysisSelect || formatFromMainSelect || window.currentCityLeagueFormat || localStorage.getItem('cityLeagueFormat') || 'M4';
            const normalized = String(raw).trim().toUpperCase();
            return normalized === 'M3' ? 'M3' : 'M4';
        }
        
        async function loadMetaCardAnalysis(source) {
            const gridId = source === 'cityLeague' ? 'cityLeagueMetaGrid' : 'currentMetaMetaGrid';
            const grid = document.getElementById(gridId);
            setGridLoadingSkeleton(grid, 10);
            
            try {
                // ? FIX: Use comparison data for correct Top 10, then analysis data for cards
                const timestamp = new Date().getTime();
                const cityLeagueFormat = source === 'cityLeague'
                    ? getActiveCityLeagueFormat()
                    : (window.currentCityLeagueFormat || 'M4');
                if (source === 'cityLeague') {
                    // Keep all loaders aligned even if a stale global value lingers.
                    window.currentCityLeagueFormat = cityLeagueFormat;
                    localStorage.setItem('cityLeagueFormat', cityLeagueFormat);
                }
                const cityLeagueSuffix = (source === 'cityLeague' && cityLeagueFormat === 'M3') ? '_M3' : '';
                
                // Load comparison data (has correct unique deck counts per archetype)
                const comparisonFile = source === 'cityLeague'
                    ? `city_league_archetypes_comparison${cityLeagueSuffix}.csv`
                    : 'limitless_online_decks_comparison.csv';
                const archetypeField = source === 'cityLeague' ? 'archetype' : 'deck_name'; // City League uses 'archetype', Current Meta uses 'deck_name'
                let comparisonData = [];
                const loadCityLeagueComparisonFallback = async () => {
                    // Fallback for format-specific missing/unreachable comparison files: derive from archetype rows.
                    const archetypesFallbackFile = `city_league_archetypes${cityLeagueSuffix}.csv`;
                    const archResp = await fetch(`${BASE_PATH}${archetypesFallbackFile}?t=${timestamp}`);
                    if (!archResp.ok) throw new Error('Failed to load comparison and fallback archetypes data');
                    const archText = await archResp.text();
                    comparisonData = deriveCityLeagueComparisonData(parseCSV(archText));
                    console.warn(`[loadMetaCardAnalysis] Comparison CSV unavailable for ${cityLeagueFormat}; using derived fallback from archetypes`);
                };

                try {
                    const comparisonResponse = await fetch(`${BASE_PATH}${comparisonFile}?t=${timestamp}`);
                    if (comparisonResponse.ok) {
                        const comparisonText = await comparisonResponse.text();
                        comparisonData = parseCSV(comparisonText);
                    } else if (source === 'cityLeague') {
                        await loadCityLeagueComparisonFallback();
                    } else {
                        throw new Error('Failed to load comparison data');
                    }
                } catch (comparisonError) {
                    if (source === 'cityLeague') {
                        console.warn('[loadMetaCardAnalysis] Comparison fetch failed, trying fallback:', comparisonError);
                        await loadCityLeagueComparisonFallback();
                    } else {
                        throw comparisonError;
                    }
                }

                if (source === 'cityLeague' && cityLeagueFormat === 'M3') {
                    // Guard: if comparison rows look like current format (M4), force-load explicit M3 file.
                    const looksLikeM4Comparison = Array.isArray(comparisonData) && comparisonData.length > 0 && comparisonData.length < 200;
                    if (looksLikeM4Comparison) {
                        console.warn('[loadMetaCardAnalysis] Guard triggered: comparison data shape looks like M4 while M3 is selected. Forcing explicit M3 comparison file.');
                        const forcedComparisonResponse = await fetch(`${BASE_PATH}city_league_archetypes_comparison_M3.csv?t=${timestamp}&forceM3=1`);
                        if (forcedComparisonResponse.ok) {
                            const forcedComparisonText = await forcedComparisonResponse.text();
                            comparisonData = parseCSV(forcedComparisonText);
                        }
                    }
                }
                
                // Get Top 10 archetypes by new_count (unique deck count)
                const top10Archetypes = comparisonData
                    .filter(row => row[archetypeField] && row.new_count)
                    .map(row => ({
                        name: row[archetypeField],
                        deckCount: parseInt(row.new_count) || 0
                    }))
                    .sort((a, b) => b.deckCount - a.deckCount)
                    .slice(0, 10);
                
                const top10Names = new Set(top10Archetypes.map(a => a.name.toLowerCase()));
                const totalDecksInTop10 = top10Archetypes.reduce((sum, a) => sum + a.deckCount, 0);
                const safeTotalDecksInTop10 = Math.max(1, Math.floor(totalDecksInTop10));
                
                // Load analysis data (has cards per archetype)
                const analysisFile = source === 'cityLeague'
                    ? `city_league_analysis${cityLeagueSuffix}.csv`
                    : 'current_meta_card_data.csv';
                let allAnalysisData = [];

                if (source === 'currentMeta') {
                    allAnalysisData = await loadCurrentMetaRowsWithFallback({ forceRefresh: true });
                } else {
                    const analysisResponse = await fetch(`${BASE_PATH}${analysisFile}?t=${timestamp}`);
                    if (!analysisResponse.ok) throw new Error('Failed to load analysis data');
                    const analysisText = await analysisResponse.text();
                    allAnalysisData = parseCSV(analysisText);
                }

                if (source === 'cityLeague' && cityLeagueFormat === 'M3') {
                    // Guard: if analysis rows are suspiciously small for M3 history, force-load explicit M3 file.
                    const looksLikeM4Analysis = Array.isArray(allAnalysisData) && allAnalysisData.length > 0 && allAnalysisData.length < 50000;
                    if (looksLikeM4Analysis) {
                        console.warn('[loadMetaCardAnalysis] Guard triggered: analysis data shape looks like M4 while M3 is selected. Forcing explicit M3 analysis file.');
                        const forcedAnalysisResponse = await fetch(`${BASE_PATH}city_league_analysis_M3.csv?t=${timestamp}&forceM3=1`);
                        if (forcedAnalysisResponse.ok) {
                            const forcedAnalysisText = await forcedAnalysisResponse.text();
                            allAnalysisData = parseCSV(forcedAnalysisText);
                        }
                    }
                }
                if (source === 'currentMeta') {
                    healCurrentMetaCardRows(allAnalysisData);
                }
                
                // Filter to only Top 10 archetypes
                const top10AnalysisData = allAnalysisData.filter(row => {
                    const arch = (row.archetype || '').toLowerCase();
                    return top10Names.has(arch);
                });
                
                // Build map of archetype -> deckCount from comparison data
                const archetypeMap = {};
                top10Archetypes.forEach(arch => {
                    archetypeMap[arch.name.toLowerCase()] = arch.deckCount;
                });
                
                // Aggregate cards using raw included-deck counts so small samples do not skew the meta share.
                const cardArchetypeMap = {}; // card -> archetype -> aggregated usage totals
                
                top10AnalysisData.forEach(row => {
                    const cardName = source === 'currentMeta'
                        ? fixCardNameEncoding(row.card_name)
                        : row.card_name;
                    const archetype = row.archetype;
                    const archetypeLower = (archetype || '').toLowerCase();
                    const percentage = parseFloat((row.percentage_in_archetype || '0').replace(',', '.'));
                    const deckCount = parseFloat(String(row.deck_count || row.deck_inclusion_count || '0').replace(',', '.')) || 0;
                    const totalCount = parseFloat(String(row.total_count || '0').replace(',', '.')) || 0;
                    const avgCountWhenUsed = parseFloat(String(row.average_count || row.avg_count || '0').replace(',', '.')) || 0;
                    const avgCountOverall = parseFloat(String(row.average_count_overall || '0').replace(',', '.')) || 0;
                    const archetypeDeckCount = archetypeMap[archetypeLower] || 0;
                    const safePercentage = Math.min(100, Math.max(0, percentage));
                    
                    if (!cardName || !archetype) return;
                    if (isBasicEnergyCardEntry({
                        card_name: cardName,
                        set_code: row.set_code,
                        set_number: row.set_number,
                        type: row.type || row.card_type,
                        supertype: row.supertype,
                        subtypes: row.subtypes
                    })) return;
                    
                    if (!cardArchetypeMap[cardName]) {
                        cardArchetypeMap[cardName] = {
                            card_name: cardName,
                            set_code: row.set_code,
                            set_number: row.set_number,
                            type: row.type || row.card_type,
                            rarity: row.rarity,
                            image_url: row.image_url,
                            byArchetype: {}
                        };
                    }
                    
                    if (!cardArchetypeMap[cardName].byArchetype[archetypeLower]) {
                        cardArchetypeMap[cardName].byArchetype[archetypeLower] = {
                            name: archetype,
                            deckCount: archetypeDeckCount,
                            estimatedDecksWithCard: 0,
                            totalCopies: 0,
                            fallbackPercentages: [],
                            fallbackCopiesWhenUsed: []
                        };
                    }

                    const archetypeEntry = cardArchetypeMap[cardName].byArchetype[archetypeLower];

                    if (deckCount > 0) {
                        archetypeEntry.estimatedDecksWithCard += deckCount;
                    } else if (safePercentage > 0 && archetypeDeckCount > 0) {
                        archetypeEntry.fallbackPercentages.push(safePercentage);
                    }

                    if (totalCount > 0) {
                        archetypeEntry.totalCopies += totalCount;
                    } else {
                        let copiesPerDeckWhenUsed = 0;
                        if (avgCountWhenUsed > 0) {
                            copiesPerDeckWhenUsed = avgCountWhenUsed;
                        } else if (avgCountOverall > 0 && archetypeDeckCount > 0 && safePercentage > 0) {
                            const impliedDecksWithCard = (safePercentage / 100) * archetypeDeckCount;
                            copiesPerDeckWhenUsed = impliedDecksWithCard > 0
                                ? (avgCountOverall * archetypeDeckCount) / impliedDecksWithCard
                                : 0;
                        }

                        if (Number.isFinite(copiesPerDeckWhenUsed) && copiesPerDeckWhenUsed > 0) {
                            archetypeEntry.fallbackCopiesWhenUsed.push(copiesPerDeckWhenUsed);
                        }
                    }
                });
                
                // Calculate meta-wide stats
                const metaCards = Object.values(cardArchetypeMap).map(cardData => {
                    let totalDecksWithCard = 0;
                    let totalCopies = 0;
                    const archetypes = [];
                    const legalMaxCopies = getLegalMaxCopies(cardData.card_name, cardData);
                    
                    // For each archetype this card appears in
                    Object.values(cardData.byArchetype).forEach(archData => {
                        const cappedDecksWithCard = Math.min(
                            archData.deckCount,
                            Math.max(0, archData.estimatedDecksWithCard || 0)
                        );

                        const fallbackAveragePercentage = archData.fallbackPercentages.length > 0
                            ? archData.fallbackPercentages.reduce((sum, p) => sum + p, 0) / archData.fallbackPercentages.length
                            : 0;
                        const fallbackEstimatedDecks = Math.min(
                            archData.deckCount,
                            Math.max(0, (fallbackAveragePercentage / 100) * archData.deckCount)
                        );

                        const estimatedDecks = cappedDecksWithCard > 0 ? cappedDecksWithCard : fallbackEstimatedDecks;

                        const fallbackAverageCopiesWhenUsed = archData.fallbackCopiesWhenUsed.length > 0
                            ? archData.fallbackCopiesWhenUsed.reduce((sum, v) => sum + v, 0) / archData.fallbackCopiesWhenUsed.length
                            : 0;

                        let totalCopiesForArchetype = Math.max(0, archData.totalCopies || 0);

                        // FIX 1: When deck count was capped (multi-tournament rows
                        // accumulated more than the archetype's known deck count from
                        // comparison data), proportionally scale down totalCopies.
                        // Without this, global card copies get divided by a capped
                        // (format-filtered) deck count, inflating averages to 4x.
                        const rawEstimatedDecks = Math.max(0, archData.estimatedDecksWithCard || 0);
                        if (totalCopiesForArchetype > 0 && rawEstimatedDecks > 0 && estimatedDecks < rawEstimatedDecks) {
                            const scaleFactor = estimatedDecks / rawEstimatedDecks;
                            totalCopiesForArchetype = totalCopiesForArchetype * scaleFactor;
                        }

                        if (totalCopiesForArchetype <= 0 && estimatedDecks > 0 && fallbackAverageCopiesWhenUsed > 0) {
                            totalCopiesForArchetype = estimatedDecks * fallbackAverageCopiesWhenUsed;
                        }

                        if (estimatedDecks > 0) {
                            totalCopiesForArchetype = Math.min(totalCopiesForArchetype, estimatedDecks * legalMaxCopies);
                        }

                        const avgCopiesPerDeckWhenUsed = estimatedDecks > 0
                            ? totalCopiesForArchetype / estimatedDecks
                            : 0;
                        const archetypePercentage = archData.deckCount > 0
                            ? Math.min(100, Math.max(0, (estimatedDecks / archData.deckCount) * 100))
                            : 0;
                        
                        totalDecksWithCard += estimatedDecks;
                        totalCopies += totalCopiesForArchetype;
                        
                        archetypes.push({
                            name: archData.name,
                            deckCount: Math.round(estimatedDecks),
                            totalDecks: archData.deckCount,
                            percentage: archetypePercentage.toFixed(1)
                        });
                    });
                    
                    const rawMetaShare = (totalDecksWithCard / safeTotalDecksInTop10) * 100;
                    const correctedMetaShare = Math.min(100, Math.max(0, rawMetaShare));
                    if (rawMetaShare > 100.01) {
                        console.warn('[loadMetaCardAnalysis] metaShare capped above 100%', {
                            card: cardData.card_name,
                            rawMetaShare,
                            correctedMetaShare,
                            totalDecksWithCard,
                            safeTotalDecksInTop10
                        });
                    }

                    return {
                        card_name: cardData.card_name,
                        set_code: cardData.set_code,
                        set_number: cardData.set_number,
                        type: cardData.type,
                        rarity: cardData.rarity,
                        image_url: cardData.image_url,
                        totalDecksWithCard: Math.round(totalDecksWithCard),
                        metaShare: parseFloat(correctedMetaShare.toFixed(1)),
                        avgCount: Math.min(legalMaxCopies, safeTotalDecksInTop10 > 0 ? totalCopies / safeTotalDecksInTop10 : 0),
                        avgCountWhenUsed: Math.min(legalMaxCopies, totalDecksWithCard > 0 ? totalCopies / totalDecksWithCard : 0),
                        archetypes: archetypes
                    };
                });

                // ==============================================================
                // COMBINED VARIANTS – Merge different set prints of the same
                // logical card so that e.g. "Riolu (OBF 112)" + "Riolu (PAL 113)"
                // become a single "Riolu" entry with share ≤ 100% and average
                // capped at the legal maximum.
                // ==============================================================
                const variantGroups = {};
                metaCards.forEach(card => {
                    const baseName = getStrictBaseCardName(card.card_name);
                    if (!variantGroups[baseName]) variantGroups[baseName] = [];
                    variantGroups[baseName].push(card);
                });

                const mergedMetaCards = [];
                Object.entries(variantGroups).forEach(([baseName, variants]) => {
                    if (variants.length <= 1) {
                        // Single print – keep as-is but still cap values
                        const card = variants[0];
                        const legalMax = getLegalMaxCopies(card.card_name, card);
                        card.metaShare = Math.min(100, card.metaShare);
                        card.avgCountWhenUsed = Math.min(legalMax, card.avgCountWhenUsed);
                        card.avgCount = Math.min(legalMax, card.avgCount);
                        card.recommendedCount = Math.min(legalMax, Math.max(1, Math.round(card.avgCountWhenUsed)));
                        mergedMetaCards.push(card);
                        return;
                    }

                    // Multiple prints → combine using calculateCombinedVariantStats
                    const combinedVariantInputs = variants.map(v => ({
                        card_name: v.card_name,
                        deck_count: v.totalDecksWithCard,
                        total_count: v.avgCountWhenUsed * v.totalDecksWithCard, // reconstruct from avg
                        percentage_in_archetype: v.metaShare,
                        type: v.type,
                        rarity: v.rarity,
                        set_code: v.set_code,
                        set_number: v.set_number,
                        image_url: v.image_url,
                        archetypes: v.archetypes
                    }));
                    const combined = calculateCombinedVariantStats(combinedVariantInputs, safeTotalDecksInTop10);

                    // Pick the "best" variant for display (highest inclusion)
                    const bestVariant = variants.reduce((a, b) => (a.totalDecksWithCard >= b.totalDecksWithCard) ? a : b, variants[0]);

                    // Merge all archetype breakdowns
                    const mergedArchetypes = [];
                    const seenArch = new Set();
                    variants.forEach(v => {
                        (v.archetypes || []).forEach(arch => {
                            if (!seenArch.has(arch.name.toLowerCase())) {
                                seenArch.add(arch.name.toLowerCase());
                                mergedArchetypes.push(arch);
                            }
                        });
                    });

                    mergedMetaCards.push({
                        card_name: bestVariant.card_name,
                        set_code: bestVariant.set_code,
                        set_number: bestVariant.set_number,
                        type: bestVariant.type,
                        rarity: bestVariant.rarity,
                        image_url: bestVariant.image_url,
                        totalDecksWithCard: Math.round(Math.max(...variants.map(v => v.totalDecksWithCard))),
                        metaShare: combined.combinedShare,
                        avgCount: Math.min(combined.legalMax, combined.combinedAvgWhenUsed * (combined.combinedShare / 100)),
                        avgCountWhenUsed: combined.combinedAvgWhenUsed,
                        recommendedCount: combined.recommendedCount,
                        archetypes: mergedArchetypes,
                        _combinedVariants: variants.length // marker for debugging
                    });
                });

                // Meta Card Analysis should always show the latest low-rarity print.
                // Force 'min' resolution here so it is independent from current UI rarity settings.
                const previousGlobalRarityPreference = globalRarityPreference;
                globalRarityPreference = 'min';
                mergedMetaCards.forEach(card => {
                    const preferredVersion = getPreferredVersionForCard(card.card_name, card.set_code, card.set_number);
                    if (preferredVersion) {
                        card.set_code = preferredVersion.set;
                        card.set_number = preferredVersion.number;
                        card.rarity = preferredVersion.rarity || card.rarity;
                        const preferredImage = getUnifiedCardImage(preferredVersion.set, preferredVersion.number);
                        if (preferredImage) {
                            card.image_url = preferredImage;
                        } else if (preferredVersion.image_url) {
                            card.image_url = preferredVersion.image_url;
                        }
                    }
                });
                globalRarityPreference = previousGlobalRarityPreference;
                
                metaCardData[source] = mergedMetaCards;
                
                renderMetaCards(source);
                
            } catch (error) {
                console.error('[loadMetaCardAnalysis] Error:', error);
                clearGridLoadingSkeleton(grid);
                grid.innerHTML = '<p style="text-align: center; color: #dc3545; padding: 40px; grid-column: 1 / -1;">? Error loading meta analysis</p>';
            }
        }
        
        function renderMetaCards(source) {
            const gridId = source === 'cityLeague' ? 'cityLeagueMetaGrid' : 'currentMetaMetaGrid';
            const countId = source === 'cityLeague' ? 'cityLeagueMetaCardCount' : 'currentMetaMetaCardCount';
            const grid = document.getElementById(gridId);
            const countSpan = document.getElementById(countId);
            clearGridLoadingSkeleton(grid);
            
            if (!metaCardData[source] || metaCardData[source].length === 0) {
                grid.innerHTML = getEmptyStateHtml();
                countSpan.textContent = '0 Cards';
                return;
            }
            
            const filter = metaCardFilter[source];
            let cards = [...metaCardData[source]];
            
            // Apply share threshold filter
            if (filter.shareThreshold !== 'all') {
                cards = cards.filter(c => c.metaShare >= filter.shareThreshold);
            }
            
            // Apply card type filter
            if (filter.cardType !== 'all') {
                if (filter.cardType === 'Trainer') {
                    cards = cards.filter(c => {
                        const type = (c.type || '').toLowerCase();
                        return type.includes('supporter') || type.includes('item') || type.includes('tool') || type.includes('stadium');
                    });
                } else if (filter.cardType === 'Pokemon') {
                    cards = cards.filter(c => getCardTypeCategory(c.type) === 'Pokemon');
                } else if (filter.cardType === 'Energy') {
                    cards = cards.filter(c => {
                        const cat = getCardTypeCategory(c.type);
                        return cat === 'Basic Energy' || cat === 'Special Energy';
                    });
                }
            }
            
            // Apply search filter - OMNI-SEARCH
            if (filter.searchTerm) {
                const term = filter.searchTerm.toLowerCase();
                cards = cards.filter(c => {
                    // Search in card_name directly
                    if (c.card_name.toLowerCase().includes(term)) return true;
                    
                    // Try to find this card in allCardsDatabase for additional fields
                    const allCardsDb = window.allCardsDatabase || [];
                    const matchingCards = allCardsDb.filter(card => 
                        card.name === c.card_name || 
                        (c.set_code && c.set_number && card.set === c.set_code && card.number === c.set_number)
                    );
                    
                    if (matchingCards.length > 0) {
                        // Check name_en, name_de, set+number, pokedex_number
                        for (const card of matchingCards) {
                            const nameEn = (card.name_en || card.name || '').toLowerCase();
                            const nameDe = (card.name_de || '').toLowerCase();
                            const setCode = (card.set || '').toLowerCase();
                            const cardNum = (card.number || '').toLowerCase();
                            const dexNum = (card.pokedex_number || '').toString();
                            const setNumSpace = `${setCode} ${cardNum}`;
                            const setNumCombined = `${setCode}${cardNum}`;
                            
                            if (nameEn.includes(term) ||
                                nameDe.includes(term) ||
                                setNumSpace.includes(term) ||
                                setNumCombined.includes(term) ||
                                (dexNum !== '' && dexNum === term) ||
                                (term.length >= 3 && dexNum !== '' && dexNum.includes(term))) {
                                return true;
                            }
                        }
                    }
                    
                    return false;
                });
            }
            
            // Apply minimum share filter (card type specific, always active)
            cards = cards.filter(c => {
                if (isBasicEnergyCardEntry(c)) {
                    return false;
                }

                const category = getCardTypeCategory(c.type);
                
                // Pokemon: Only show if >40% meta share (user requirement)
                if (category === 'Pokemon') {
                    return c.metaShare >= 40;
                }
                
                // Trainer and Special Energy: Show if >30% meta share (user requirement)
                return c.metaShare >= 30;
            });
            
            devLog(`[renderMetaCards] After filters: ${cards.length} cards remaining (from ${metaCardData[source].length} total)`);
            if (cards.length > 0) {
                devLog(`[renderMetaCards] Top 5 cards by meta share:`, cards.slice(0, 5).map(c => `${c.card_name}: ${c.metaShare.toFixed(1)}%`));
            }
            
            // Sort
            if (filter.sortBy === 'share') {
                cards.sort((a, b) => b.metaShare - a.metaShare);
            } else if (filter.sortBy === 'avgCount') {
                cards.sort((a, b) => b.avgCount - a.avgCount);
            } else if (filter.sortBy === 'type') {
                // Sort by card type category (Pokemon, Supporter, Item, Tool, Stadium, Energy)
                const typeOrder = { 'Pokemon': 0, 'Supporter': 1, 'Item': 2, 'Tool': 3, 'Stadium': 4, 'Special Energy': 5, 'Basic Energy': 6, 'Energy': 6 };
                cards.sort((a, b) => {
                    const catA = getCardTypeCategory(a.type);
                    const catB = getCardTypeCategory(b.type);
                    const orderA = typeOrder[catA] !== undefined ? typeOrder[catA] : 99;
                    const orderB = typeOrder[catB] !== undefined ? typeOrder[catB] : 99;
                    
                    if (orderA !== orderB) return orderA - orderB;
                    
                    // Within same category, sort by share% descending
                    return b.metaShare - a.metaShare;
                });
            }
            
            countSpan.textContent = `${cards.length} Cards`;
            
            if (cards.length === 0) {
                grid.innerHTML = getEmptyStateHtml();
                return;
            }
            
            // Render cards (similar to card overview grid)
            grid.innerHTML = cards.map(card => {
                const imageUrl = getBestCardImage(card) || buildInlineCardPlaceholder(card.card_name);
                const fallbackUrl = buildInlineCardPlaceholder(card.card_name);
                const selectedArchetype = source === 'cityLeague'
                    ? (document.getElementById('cityLeagueArchetypeSelect')?.value || window.currentCityLeagueArchetype || 'all')
                    : (document.getElementById('currentMetaArchetypeSelect')?.value || 'all');
                const trendHistory = source === 'cityLeague' ? getCityLeagueCardShareHistory(card.card_name, selectedArchetype) : [];
                const trendIndicator = source === 'cityLeague' ? getTrendIndicator(trendHistory) : '';
                
                // Create JSON string for archetypes (escape properly for HTML attribute)
                const archetypesJson = JSON.stringify(card.archetypes || []).replace(/"/g, '&quot;');
                const cardNameEscaped = escapeJsStr(card.card_name);
                
                // Check if card is in deck
                const currentDeck = source === 'cityLeague' ? window.cityLeagueDeck : 
                                   source === 'currentMeta' ? window.currentMetaDeck : 
                                   window.pastMetaDeck;
                const deckKey = `${card.card_name} (${card.set_code} ${card.set_number})`;
                const deckCount = (currentDeck && currentDeck[deckKey]) ? currentDeck[deckKey] : 
                                 (currentDeck && currentDeck[card.card_name]) ? currentDeck[card.card_name] : 0;
                
                return `
                    <div class="card-item" style="position: relative; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.15); transition: transform 0.2s, box-shadow 0.2s; background: white;">
                        <div class="card-image-container" style="position: relative; width: 100%;">
                            <img src="${imageUrl}" alt="${escapeHtml(card.card_name)}" loading="lazy" style="width: 100%; aspect-ratio: 2.5/3.5; object-fit: cover; cursor: zoom-in;" onerror="handleCardImageError(this, '${card.set_code || ''}', '${card.set_number || ''}', '${fallbackUrl}')" onclick="if (typeof event !== 'undefined' && event) event.stopPropagation(); showSingleCard(this.src, '${cardNameEscaped}');"
                                 onmouseover="showMetaCardTooltip(event, '${cardNameEscaped}', '${archetypesJson}')" 
                                 onmouseout="hideMetaCardTooltip()">
                            
                            <!-- Green badge: Deck Count (top-left) - only show if > 0 -->
                            ${deckCount > 0 ? `<div style="position: absolute; top: 5px; left: 5px; background: #28a745; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.8em; box-shadow: 0 2px 4px rgba(0,0,0,0.3); z-index: 2;">${deckCount}</div>` : ''}
                            
                            <!-- Card info section -->
                            <div class="card-info-bottom" style="padding: 6px; background: white; font-size: 0.75em; text-align: center;">
                                <div class="card-info-text" style="margin-bottom: 6px;">
                                    <div style="font-weight: bold; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${card.card_name}</div>
                                    ${card.metaShare > 0 ? `<div style="color: #ffd700; font-weight: 600; margin-bottom: 1px;">${card.metaShare.toFixed(1)}% ${trendIndicator} | Ø ${Math.round(card.avgCount)}x</div><div style="color: #555; font-size: 0.9em; font-weight: 500;">(${Math.round(card.avgCountWhenUsed)}x when used)</div>` : ''}
                                </div>
                                
                                <!-- Card Actions: Row 1 = - ★ + | Row 2 = L (full-width) -->
                                <div class="card-action-buttons" style="display: flex; flex-direction: column; gap: 3px;">
                                    <div style="display: grid; grid-template-columns: 1fr 2fr 1fr; gap: 3px;">
                                        <button onclick="event.stopPropagation(); removeCardFromDeck('${source}', '${cardNameEscaped}')" style="background: #dc3545; color: white; border: none; border-radius: 4px; padding: 6px 8px; cursor: pointer; font-weight: bold; font-size: 14px; transition: all 0.2s;" onmouseover="this.style.background='#c82333'" onmouseout="this.style.background='#dc3545'" title="Remove from deck">-</button>
                                        <button onclick="event.stopPropagation(); openRaritySwitcher('${cardNameEscaped}', '${cardNameEscaped} (${card.set_code} ${card.set_number})')" style="background: #ffc107; color: #333; border: none; border-radius: 4px; padding: 6px 8px; cursor: pointer; font-weight: bold; font-size: 12px; transition: all 0.2s;" onmouseover="this.style.background='#e0a800'" onmouseout="this.style.background='#ffc107'" title="Switch rarity/print">★</button>
                                        <button onclick="event.stopPropagation(); addCardToDeck('${source}', '${cardNameEscaped}', '${card.set_code}', '${card.set_number}')" style="background: #28a745; color: white; border: none; border-radius: 4px; padding: 6px 8px; cursor: pointer; font-weight: bold; font-size: 14px; transition: all 0.2s;" onmouseover="this.style.background='#218838'" onmouseout="this.style.background='#28a745'" title="Add to deck">+</button>
                                    </div>
                                    <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 3px;">
                                        <button onclick="event.stopPropagation(); addCardToProxy('${cardNameEscaped}', '${card.set_code}', '${card.set_number}', 1)" style="background: #e74c3c; color: white; border: none; border-radius: 4px; padding: 5px 8px; cursor: pointer; font-weight: bold; font-size: 11px; transition: all 0.2s;" onmouseover="this.style.background='#c0392b'" onmouseout="this.style.background='#e74c3c'" title="Add to proxy">Proxy</button>
                                        <button onclick="event.stopPropagation(); openLimitlessCard('${card.set_code}', '${card.set_number}')" style="background: #6c3dc5; color: white; border: none; border-radius: 4px; padding: 5px 8px; cursor: pointer; font-weight: bold; font-size: 11px; width: 100%; transition: all 0.2s;" onmouseover="this.style.background='#5a32a3'" onmouseout="this.style.background='#6c3dc5'" title="Open on Limitless (${card.set_code} ${card.set_number})">Limitless — ${card.set_code} ${card.set_number}</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }
        
        function setMetaShareFilter(source, threshold) {
            metaCardFilter[source].shareThreshold = threshold;
            
            // Update button styles
            const prefix = source === 'cityLeague' ? 'cityLeagueMetaShare' : 'currentMetaMetaShare';
            ['All', '90', '70', '50'].forEach(t => {
                const btn = document.getElementById(prefix + t);
                if (btn) {
                    const isActive = (t === 'All' && threshold === 'all') || (t === String(threshold));
                    btn.style.opacity = isActive ? '1' : '0.6';
                    btn.style.fontWeight = isActive ? 'bold' : 'normal';
                }
            });
            
            renderMetaCards(source);
        }
        
        function setMetaCardTypeFilter(source, type) {
            metaCardFilter[source].cardType = type;
            
            // Update button styles
            const prefix = source === 'cityLeague' ? 'cityLeagueMetaType' : 'currentMetaMetaType';
            ['All', 'Trainer', 'Pokemon', 'Energy'].forEach(t => {
                const btn = document.getElementById(prefix + t);
                if (btn) {
                    const isActive = (t.toLowerCase() === type.toLowerCase());
                    btn.style.opacity = isActive ? '1' : '0.6';
                    btn.style.fontWeight = isActive ? 'bold' : 'normal';
                }
            });
            
            renderMetaCards(source);
        }
        
        function sortMetaCards(source, sortBy) {
            metaCardFilter[source].sortBy = sortBy;
            
            // Update button styles - find all sort buttons for this source
            const buttons = document.querySelectorAll(`button[onclick*="sortMetaCards('${source}'"]`);
            buttons.forEach(btn => {
                const isActive = btn.getAttribute('onclick').includes(`'${sortBy}'`);
                btn.style.fontWeight = isActive ? 'bold' : 'normal';
                btn.style.opacity = isActive ? '1' : '0.7';
            });
            
            renderMetaCards(source);
        }
        
        function filterMetaCards(source) {
            const inputId = source === 'cityLeague' ? 'cityLeagueMetaSearch' : 'currentMetaMetaSearch';
            const input = document.getElementById(inputId);
            metaCardFilter[source].searchTerm = input.value;
            renderMetaCards(source);
        }
        
        // Tooltip for Meta Card Analysis - show archetypes
        let metaCardTooltip = null;
        
        function showMetaCardTooltip(event, cardName, archetypesJson) {
            // Parse archetypes from JSON string
            const archetypes = JSON.parse(archetypesJson.replace(/&quot;/g, '"'));
            
            if (!archetypes || archetypes.length === 0) return;
            
            // Create tooltip if it doesn't exist
            if (!metaCardTooltip) {
                metaCardTooltip = document.createElement('div');
                metaCardTooltip.id = 'metaCardTooltip';
                metaCardTooltip.style.cssText = `
                    position: fixed;
                    background: rgba(0, 0, 0, 0.95);
                    color: white;
                    padding: 12px 16px;
                    border-radius: 8px;
                    font-size: 0.85em;
                    z-index: 10000;
                    pointer-events: none;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                    max-width: 300px;
                    border: 1px solid rgba(255,255,255,0.2);
                `;
                document.body.appendChild(metaCardTooltip);
            }
            
            // Build tooltip content
            const title = `<div style="font-weight: bold; margin-bottom: 8px; color: #ffd700; border-bottom: 1px solid rgba(255,255,255,0.3); padding-bottom: 6px;">${escapeHtml(cardName)}</div>`;
            const archetypeItems = archetypes
                .sort((a, b) => parseFloat(b.percentage) - parseFloat(a.percentage))
                .map(a => `
                    <div style="padding: 4px 0; display: flex; justify-content: space-between; gap: 15px;">
                        <span style="color: #ddd;">${escapeHtml(a.name)}</span>
                        <span style="color: #ffd700; font-weight: bold;">${escapeHtml(a.percentage)}%</span>
                    </div>
                `).join('');
            
            metaCardTooltip.innerHTML = title + '<div style="font-size: 0.9em; color: #aaa; margin-bottom: 6px;">Used in archetypes:</div>' + archetypeItems;
            metaCardTooltip.style.display = 'block';
            
            // Position tooltip near mouse
            const x = event.clientX + 15;
            const y = event.clientY + 15;
            
            metaCardTooltip.style.left = `${x}px`;
            metaCardTooltip.style.top = `${y}px`;
        }
        
        function hideMetaCardTooltip() {
            if (metaCardTooltip) {
                metaCardTooltip.style.display = 'none';
            }
        }
        
        function searchDeckCards(source = 'cityLeague') {
            const searchInputId = source === 'cityLeague' ? 'cityLeagueDeckCardSearch' : 
                                  source === 'currentMeta' ? 'currentMetaDeckCardSearch' : 
                                  'pastMetaDeckCardSearch';
            const resultsContainerId = source === 'cityLeague' ? 'cityLeagueDeckSearchResults' : 
                                       source === 'currentMeta' ? 'currentMetaDeckSearchResults' : 
                                       'pastMetaDeckSearchResults';
            
            const searchInput = document.getElementById(searchInputId);
            if (!searchInput) return;
            
            const searchTerm = searchInput.value.toLowerCase().trim();
            const resultsContainer = document.getElementById(resultsContainerId);
            if (!resultsContainer) return;
            
            // Clear selection when search changes
            if (searchTerm !== window.lastCardSearch) {
                window.selectedCardName = null;
                window.lastCardSearch = searchTerm;
            }
            
            if (!searchTerm) {
                resultsContainer.innerHTML = '';
                window.selectedCardName = null;
                return;
            }
            
            // Search in ALL cards database
            const allAvailableCards = window.allCardsDatabase || [];
            
            // Debug logging
            if (allAvailableCards.length === 0) {
                console.warn('[searchDeckCards] allCardsDatabase is empty or not loaded yet');
                resultsContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #444; font-weight: 500;">Loading card database...</div>';
                return;
            }
            
            // If a card name is selected, show all versions
            if (window.selectedCardName) {
                showCardVersions(window.selectedCardName, resultsContainer, source);
                return;
            }
            
            // STAGE 1: Show unique card names - OMNI-SEARCH
            const matchingCards = allAvailableCards.filter(card => {
                const nameEn = (card.name_en || card.name || '').toLowerCase();
                const nameDe = (card.name_de || '').toLowerCase();
                const setCode = (card.set || '').toLowerCase();
                const cardNum = (card.number || '').toLowerCase();
                const dexNum = (card.pokedex_number || '').toString();
                const setNumSpace = `${setCode} ${cardNum}`;
                const setNumCombined = `${setCode}${cardNum}`;
                
                return nameEn.includes(searchTerm) ||
                       nameDe.includes(searchTerm) ||
                       setNumSpace.includes(searchTerm) ||
                       setNumCombined.includes(searchTerm) ||
                       (dexNum !== '' && dexNum === searchTerm) ||
                       (searchTerm.length >= 3 && dexNum !== '' && dexNum.includes(searchTerm));
            });
            
            // Get unique card names
            const uniqueNames = [...new Set(matchingCards.map(c => c.name_en || c.name))].sort();
            
            devLog(`[searchDeckCards] Search term: "${searchTerm}", found ${uniqueNames.length} unique cards (${matchingCards.length} versions)`);
            
            if (uniqueNames.length === 0) {
                resultsContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #444; font-weight: 500;">No cards found</div>';
                return;
            }
            
            // 1. Count all found cards
            const totalFound = uniqueNames.length;

            // 2. Hard cap rendering at 60 entries
            const MAX_RENDER = 60;
            const cardsToRender = uniqueNames.slice(0, MAX_RENDER);

            // 3. Generate HTML only for capped list
            let htmlString = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 6px;">';

            cardsToRender.forEach(cardName => {
                const cardNameEscaped = escapeJsStr(cardName);
                const cardVersions = matchingCards.filter(c => c.name === cardName);
                // Filter out Japanese versions if international versions exist
                let displayVersions = cardVersions;
                if (window.englishSetCodes && window.englishSetCodes.size > 0) {
                    const intl = cardVersions.filter(v => window.englishSetCodes.has(v.set));
                    if (intl.length > 0) displayVersions = intl;
                }
                const versionsCount = displayVersions.length;
                const deck = source === 'cityLeague' ? (window.cityLeagueDeck || {}) : (window.currentMetaDeck || {});
                const currentCount = deck[cardName] || 0;
                
                // Get first version for thumbnail image (prefer international)
                const firstVersion = displayVersions[0] || cardVersions[0];
                const imageUrl = firstVersion ? getUnifiedCardImage(firstVersion.set, firstVersion.number) : '';
                
                htmlString += `
                    <div onclick="selectCardName('${cardNameEscaped}', '${source}')" style="background: white; padding: 8px; border-radius: 4px; cursor: pointer; transition: all 0.2s; border-left: 2px solid #667eea; display: flex; gap: 8px; align-items: center;" onmouseover="this.style.background='#f9f9f9'; this.style.transform='translateX(3px)';" onmouseout="this.style.background='white'; this.style.transform='translateX(0)';">
                        <div style="width: 40px; height: 50px; background: #f5f5f5; border-radius: 3px; overflow: hidden; flex-shrink: 0;">
                            <img src="${imageUrl}" alt="${cardName}" style="width: 100%; height: 100%; object-fit: contain; cursor: zoom-in;" onerror="handleCardImageError(this, '${firstVersion ? firstVersion.set : ''}', '${firstVersion ? firstVersion.number : ''}')" loading="lazy">
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-weight: 600; color: #333; font-size: 0.9em; line-height: 1.2; white-space: normal; word-break: break-word;">${cardName}</div>
                            <div style="font-size: 0.75em; color: #444; font-weight: 500;">${versionsCount} Version${versionsCount > 1 ? 'en' : ''}</div>
                        </div>
                        ${currentCount > 0 ? `<div style="background: #28a745; color: white; padding: 2px 6px; border-radius: 10px; font-size: 0.75em; font-weight: bold; flex-shrink: 0;">${currentCount}x</div>` : ''}
                    </div>
                `;
            });

            // 4. Add hint when results were truncated
            if (totalFound > MAX_RENDER) {
                htmlString += `
                    <div style="text-align: center; padding: 20px; color: #7f8c8d; font-size: 14px; width: 100%; grid-column: 1 / -1;">
                        ⚠️ <b>+ ${totalFound - MAX_RENDER} weitere Karten gefunden.</b><br>
                        Bitte tippe mehr Text in die Suche, um die Ergebnisse einzugrenzen.
                    </div>
                `;
            }

            htmlString += '</div>';

            // 5. Inject HTML into container
            resultsContainer.innerHTML = htmlString;
        }
        
        function selectCardName(cardName, source = 'cityLeague') {
            window.selectedCardName = cardName;
            searchDeckCards(source); // Refresh to show versions
        }
        
        function showCardVersions(cardName, container, source = 'cityLeague') {
            const allCards = window.allCardsDatabase || [];
            let versions = allCards.filter(c => c.name === cardName);
            
            // Filter out Japanese versions if international versions exist
            if (window.englishSetCodes && window.englishSetCodes.size > 0) {
                const intlVersions = versions.filter(v => window.englishSetCodes.has(v.set));
                if (intlVersions.length > 0) {
                    versions = intlVersions;
                }
            }
            
            const deck = source === 'cityLeague' ? (window.cityLeagueDeck || {}) : (window.currentMetaDeck || {});
            
            // Calculate total count of all versions of this card in deck
            let totalCount = 0;
            for (const [key, count] of Object.entries(deck)) {
                if (key.startsWith(cardName + ' (') || key === cardName) {
                    totalCount += count;
                }
            }
            
            let html = '<div style="grid-column: 1 / -1; background: #f8f9fa; padding: 10px; border-radius: 8px; margin-bottom: 10px;">';
            html += `<div style="display: flex; justify-content: space-between; align-items: center;">`;
            html += `<div style="font-weight: bold; color: #333;">${cardName}</div>`;
            html += `<button onclick="window.selectedCardName=null; searchDeckCards('${source}');" style="background: #6c757d; color: white; border: none; padding: 5px 15px; border-radius: 5px; cursor: pointer; font-size: 0.85em;">← Back</button>`;
            html += '</div>';
            html += `<div style="font-size: 0.85em; color: #333; margin-top: 8px; font-weight: 600;">${versions.length} Versionen | ${totalCount}x im Deck</div>`;
            html += '</div>';
            
            // Add card versions directly - they will be grid items in the parent grid
            versions.forEach(card => {
                const setCode = card.set || '';
                const setNumber = card.number || '';
                const rarityFull = card.rarity || '';
                
                // Check if THIS specific version is in the deck
                const deckKey = `${cardName} (${setCode} ${setNumber})`;
                const versionCount = deck[deckKey] || 0;
                
                // Use image_url from database if available and valid, otherwise try to build it
                const hasValidImageUrl = card.image_url && card.image_url.trim() !== '' && card.image_url.startsWith('http');
                let imageUrl = getUnifiedCardImage(setCode, setNumber) || (hasValidImageUrl ? card.image_url : '');
                imageUrl = getBestCardImage({
                    ...card,
                    set_code: setCode,
                    set_number: setNumber,
                    card_name: cardName,
                    image_url: imageUrl
                });
                const cardNameEscaped = escapeJsStr(cardName);
                
                html += `
                    <div style="position: relative; text-align: center; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 6px rgba(0,0,0,0.15); transition: transform 0.2s, box-shadow 0.2s;" onmouseover="this.style.transform='scale(1.03)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.25)';" onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 2px 6px rgba(0,0,0,0.15)';">
                        <div style="position: relative; cursor: zoom-in; background: #f5f5f5;" onclick="showSingleCard(this.querySelector('img').src, '${cardNameEscaped} (${setCode} ${setNumber})')">
                            <img src="${imageUrl}" alt="${cardName}" style="width: 100%; height: 160px; object-fit: contain;" onerror="handleCardImageError(this, '${setCode}', '${setNumber}'); this.nextElementSibling.style.display='flex';" loading="lazy">
                            <div style="display: none; width: 100%; height: 160px; align-items: center; justify-content: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; flex-direction: column; padding: 8px;">
                                <div style="font-size: 2em; margin-bottom: 5px;">??</div>
                                <div style="font-size: 0.7em; text-align: center;">${setCode}<br>${setNumber}</div>
                            </div>
                        </div>
                        ${versionCount > 0 ? `<div style="position: absolute; top: 4px; left: 4px; background: #28a745; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 0.75em; font-weight: bold; z-index: 5; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${versionCount}</div>` : ''}
                        <button onclick="addCardToDeck('${source}', '${cardNameEscaped}', '${setCode}', '${setNumber}')" style="position: absolute; top: 4px; right: 4px; background: #28a745; color: white; border: none; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: bold; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.3); z-index: 10; transition: all 0.2s;" onmouseover="this.style.transform='scale(1.1)'; this.style.background='#218838';" onmouseout="this.style.transform='scale(1)'; this.style.background='#28a745';" title="Add to Deck">+</button>
                        <div style="padding: 8px; background: white; border-top: 1px solid #f0f0f0;">
                            <div style="font-size: 0.7em; color: #333; font-weight: 600;">${setCode} ${setNumber}</div>
                        </div>
                    </div>
                `;
            });
            
            container.innerHTML = html;
        }
        
        function buildCardImageUrl(setCode, setNumber, rarity) {
            if (!setCode || !setNumber) {
                return 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22245%22 height=%22342%22%3E%3Crect fill=%22%23667eea%22 width=%22245%22 height=%22342%22/%3E%3Ctext fill=%22white%22 x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 font-size=%2220%22%3EKeine Daten%3C/text%3E%3C/svg%3E';
            }

            return getUnifiedCardImage(setCode, setNumber);
        }
        
        // Initialize deck card search listener
        document.addEventListener('DOMContentLoaded', function() {
            const searchInput = document.getElementById('cityLeagueDeckCardSearch');
            if (searchInput) {
                searchInput.addEventListener('input', () => searchDeckCards('cityLeague'));
            }
            
            // Current Meta search listener
            const currentMetaSearchInput = document.getElementById('currentMetaDeckCardSearch');
            if (currentMetaSearchInput) {
                currentMetaSearchInput.addEventListener('input', () => searchDeckCards('currentMeta'));
            }
            
            // Past Meta search listener
            const pastMetaSearchInput = document.getElementById('pastMetaDeckCardSearch');
            if (pastMetaSearchInput) {
                pastMetaSearchInput.addEventListener('input', () => searchDeckCards('pastMeta'));
            }
        });

        function toggleCurrentCards() {
            const content = document.getElementById('currentCardsContent');
            const toggle = document.getElementById('currentCardsToggle');
            if (content && toggle) {
                if (content.style.display === 'none') {
                    content.style.display = 'block';
                    toggle.classList.remove('collapsed');
                } else {
                    content.style.display = 'none';
                    toggle.classList.add('collapsed');
                }
            }
        }

        function togglePastCards() {
            const content = document.getElementById('pastCardsContent');
            const toggle = document.getElementById('pastCardsToggle');
            if (content && toggle) {
                if (content.style.display === 'none') {
                    content.style.display = 'block';
                    toggle.classList.remove('collapsed');
                } else {
                    content.style.display = 'none';
                    toggle.classList.add('collapsed');
                }
            }
        }

        // Filter functions
        function filterCurrentAnalysisCards() {
            const searchTerm = (document.getElementById('currentCardSearchInput')?.value || '').toLowerCase();
            const rows = document.querySelectorAll('#currentAnalysisTable table tbody tr');
            let visibleCount = 0;

            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                const visible = text.includes(searchTerm);
                row.style.display = visible ? '' : 'none';
                if (visible) visibleCount += 1;
            });

            const countEl = document.getElementById('currentCardCount');
            if (countEl) {
                countEl.textContent = `${visibleCount} Karten`;
            }
        }

        function filterPastMetaCards() {
            const searchTerm = (document.getElementById('pastCardSearchInput')?.value || '').toLowerCase();
            const rows = document.querySelectorAll('#pastMetaTable table tbody tr');
            let visibleCount = 0;

            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                const visible = text.includes(searchTerm);
                row.style.display = visible ? '' : 'none';
                if (visible) visibleCount += 1;
            });

            const countEl = document.getElementById('pastCardCount');
            if (countEl) {
                countEl.textContent = `${visibleCount} Karten`;
            }
        }

        // Deck Builder functions (placeholder implementations)
        const deckBuilders = {
            cityLeague: [],
            current: [],
            past: []
        };

        // Toggle for Current Meta cards
        // Load Current Meta - load HTML and patch the table
        async function loadCurrentMeta() {
            const currentMetaContent = document.getElementById('currentMetaContent');
            
            try {
                // Load the full HTML file
                const response = await fetch(BASE_PATH + 'limitless_online_decks_comparison.html?t=' + Date.now());
                if (!response.ok) throw new Error('HTML not found');
                
                const html = await response.text();
                
                // Parse the loaded HTML
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                
                // FIRST: Execute all scripts to load matchup data into window.matchupData_*
                const scripts = doc.querySelectorAll('script');
                let scriptsExecuted = 0;
                scripts.forEach(script => {
                    if (script.textContent && script.textContent.trim() && script.textContent.includes('window.matchupData_')) {
                        try {
                            // Create a real script element and append to head for global scope execution
                            const scriptElement = document.createElement('script');
                            scriptElement.textContent = script.textContent;
                            document.head.appendChild(scriptElement);
                            document.head.removeChild(scriptElement); // Clean up immediately
                            scriptsExecuted++;
                        } catch (scriptError) {
                            console.warn('?? Error executing matchup script:', scriptError);
                        }
                    }
                });
                devLog(`?? Loaded ${scriptsExecuted} matchup data scripts`);
                
                // Verify that matchup data was loaded
                const matchupVars = Object.keys(window).filter(k => k.startsWith('matchupData_'));
                devLog(`? Available matchup variables: ${matchupVars.length}`);
                
                // THEN: Extract the container content
                const container = doc.querySelector('.container');
                if (container) {
                    // Insert the full container HTML (includes stats, climbers, matchups, table)
                    currentMetaContent.innerHTML = container.innerHTML;
                    
                    // PATCH: Remove inline grid styles from matchup containers for mobile responsiveness
                    const matchupGrids = currentMetaContent.querySelectorAll('div[style*="grid-template-columns"]');
                    matchupGrids.forEach(grid => {
                        // Only remove grid styles from matchup sections (they typically have 2 direct children with tables)
                        const directChildren = grid.children;
                        if (directChildren.length === 2) {
                            const hasMatchupTables = grid.querySelectorAll('table').length >= 2;
                            if (hasMatchupTables) {
                                // Remove inline grid style, let CSS take over
                                grid.style.display = '';
                                grid.style.gridTemplateColumns = '';
                                grid.style.gap = '';
                                // Add the CSS class instead
                                grid.classList.add('matchups-grid-container');
                                devLog('? Removed inline grid styles from matchup container');
                            }
                        }
                    });
                    
                    // Now patch ONLY the Full Comparison Table with our improved version
                    patchLimitlessComparisonTable();
                    
                    // Patch matchup box tables (Best/Worst) for proper column widths and name wrapping
                    patchMatchupBoxTables();
                    
                    // Patch the Archetype Overview stat card with current CSV data
                    await patchArchetypeOverview();
                    
                    // Patch the Meta stat card with tournament stats
                    await patchMetaStats();
                    
                    // Render Matchup Heatmap
                    renderMatchupHeatmap();
                    
                    // Render tier list banner view
                    await renderCurrentMetaTierList();
                    
                    // Render top cards widget (format staples)
                    await renderCurrentMetaTopCards();
                    
                    devLog('? Current Meta data loaded successfully');
                } else {
                    currentMetaContent.innerHTML = '<div style="color: #e74c3c; padding: 20px;">Error loading comparison data</div>';
                }
                
                window.currentMetaLoaded = true;
            } catch (error) {
                console.error('Error loading Current Meta:', error);
                currentMetaContent.innerHTML = `
                    <div style="color: #e74c3c; padding: 20px;">
                        <strong>Error:</strong> Could not load comparison HTML.
                        <br><small>${error.message}</small>
                    </div>
                `;
            }
        }
        
        // Patch the Full Comparison Table to use condensed rank format
        // Patch Best/Worst Matchup tables in loaded Limitless HTML for proper column widths and name wrapping
        function patchMatchupBoxTables() {
            const matchupGrids = document.querySelectorAll('#currentMetaContent .matchups-grid-container');
            matchupGrids.forEach(grid => {
                const tables = grid.querySelectorAll('table');
                tables.forEach(table => {
                    // Ensure table fills its container with fixed layout
                    table.style.width = '100%';
                    table.style.tableLayout = 'fixed';
                    table.style.borderCollapse = 'collapse';

                    // Set column widths via the header row (table-layout:fixed uses first row)
                    const firstRow = table.querySelector('tr');
                    if (firstRow) {
                        const ths = firstRow.querySelectorAll('th');
                        if (ths.length === 3) {
                            ths[0].style.width = '55%'; // Opponent name
                            ths[1].style.width = '20%'; // Win Rate
                            ths[2].style.width = '25%'; // Record
                        }
                    }

                    // Allow opponent name cells to wrap (not truncate)
                    table.querySelectorAll('tr td:first-child').forEach(td => {
                        td.style.whiteSpace = 'normal';
                        td.style.wordWrap = 'break-word';
                        td.style.overflowWrap = 'break-word';
                        td.style.overflow = 'visible';
                        td.style.maxWidth = 'none';
                    });
                });
            });
            devLog('\u2705 Matchup box tables patched');
        }

        function patchLimitlessComparisonTable() {
            // Find all tables in the current meta content
            const tables = document.querySelectorAll('#currentMetaContent table');
            
            // The Full Comparison Table is typically the last table
            tables.forEach(table => {
                const thead = table.querySelector('thead tr');
                if (!thead) return;
                
                const headers = Array.from(thead.querySelectorAll('th')).map(th => th.textContent.trim());
                
                // Check if this is the Full Comparison Table (has Old Rank, New Rank, Rank ? columns)
                if (headers.includes('Old Rank') && headers.includes('New Rank') && headers.includes('Rank ?')) {
                    devLog('?? Patching Full Comparison Table...');
                    
                    // Find column indices
                    const oldRankIdx = headers.indexOf('Old Rank');
                    const newRankIdx = headers.indexOf('New Rank');
                    const rankDeltaIdx = headers.indexOf('Rank ?');
                    
                    // Remove Old Rank and Rank ? headers, keep only New Rank and rename it to "Rank"
                    const thOldRank = thead.querySelectorAll('th')[oldRankIdx];
                    const thRankDelta = thead.querySelectorAll('th')[rankDeltaIdx];
                    const thNewRank = thead.querySelectorAll('th')[newRankIdx];
                    
                    thOldRank.remove();
                    thRankDelta.remove();
                    thNewRank.textContent = 'Rank';
                    
                    // Update each data row
                    const rows = table.querySelectorAll('tbody tr');
                    rows.forEach(row => {
                        const cells = row.querySelectorAll('td');
                        if (cells.length < Math.max(oldRankIdx, newRankIdx, rankDeltaIdx) + 1) return;
                        
                        const oldRankCell = cells[oldRankIdx];
                        const newRankCell = cells[newRankIdx];
                        const rankDeltaCell = cells[rankDeltaIdx];
                        
                        // Extract rank change from the delta cell
                        const deltaHtml = rankDeltaCell.innerHTML;
                        let changeText = '';
                        if (deltaHtml.includes('rank-up')) {
                            const match = deltaHtml.match(/(\d+)/);
                            if (match) changeText = ` <span style="color: #27ae60; font-size: 0.9em;">(↑${match[1]})</span>`;
                        } else if (deltaHtml.includes('rank-down')) {
                            const match = deltaHtml.match(/(\d+)/);
                            if (match) changeText = ` <span style="color: #e74c3c; font-size: 0.9em;">(↓${match[1]})</span>`;
                        } else {
                            changeText = ' <span style="color: #95a5a6; font-size: 0.9em;">(-)</span>';
                        }
                        
                        // Update new rank cell to include change
                        newRankCell.innerHTML = newRankCell.textContent + changeText;
                        
                        // Remove old rank and delta cells
                        oldRankCell.remove();
                        rankDeltaCell.remove();

                        // Make archetype clickable for deep-dive navigation
                        const deckNameCell = row.querySelector('td');
                        if (deckNameCell && !deckNameCell.querySelector('.archetype-jump-link')) {
                            const archetype = String(deckNameCell.textContent || '').trim();
                            if (archetype) {
                                const archetypeEscaped = escapeJsStr(archetype);
                                deckNameCell.innerHTML = `<a href="javascript:void(0)" onclick="jumpToCardAnalysis('${archetypeEscaped}', 'currentMeta')" class="archetype-jump-link">${escapeHtml(archetype)}</a>`;
                            }
                        }
                    });
                    
                    devLog('? Full Comparison Table patched successfully');
                }
            });
        }

        // Patch Archetype Overview stat card with live CSV data
        async function patchArchetypeOverview() {
            try {
                // Load CSV data
                const csvData = await loadCSV('limitless_online_decks_comparison.csv');
                if (!csvData || csvData.length === 0) {
                    console.warn('?? No CSV data available for stat patching');
                    return;
                }
                
                // Calculate total archetypes
                const totalArchetypes = csvData.length;
                
                // Group by main Pokemon (first word before space)
                const mainPokemonGroups = new Set();
                csvData.forEach(row => {
                    if (row.deck_name) {
                        const mainPokemon = row.deck_name.split(' ')[0];
                        mainPokemonGroups.add(mainPokemon);
                    }
                });
                const groupedArchetypes = mainPokemonGroups.size;
                
                // Calculate Top 3 by Count
                const decksByCount = csvData
                    .map(row => ({
                        name: row.deck_name,
                        count: parseInt(row.new_count || '0', 10)
                    }))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 3);
                
                // Calculate Top 3 by Win Rate (=10% of #1 deck count)
                const maxCount = Math.max(...csvData.map(row => parseInt(row.new_count || '0', 10)));
                const minCountThreshold = maxCount * 0.1;
                
                const decksByWinRate = csvData
                    .filter(row => parseInt(row.new_count || '0', 10) >= minCountThreshold)
                    .map(row => ({
                        name: row.deck_name,
                        winRate: parseFloat(row.new_winrate || '0'),
                        count: parseInt(row.new_count || '0', 10)
                    }))
                    .sort((a, b) => b.winRate - a.winRate)
                    .slice(0, 3);
                
                // Generate HTML for display
                const top3ByCountHtml = decksByCount
                    .map(d => `<span style="color: white; font-weight: 600;">${escapeHtml(d.name)}</span> (${d.count.toLocaleString()})`)
                    .join('<br>');
                
                const top3ByWinRateHtml = decksByWinRate
                    .map(d => `<span style="color: white; font-weight: 600;">${escapeHtml(d.name)}</span> (${d.winRate.toFixed(1)}%)`)
                    .join('<br>');
                
                // Find and update the Archetype Overview stat card
                const statCards = document.querySelectorAll('#currentMetaContent .stat-card');
                statCards.forEach(card => {
                    const h3 = card.querySelector('h3');
                    if (h3 && h3.textContent.includes('Archetype Overview')) {
                        // Update the value
                        const valueDiv = card.querySelector('.value');
                        if (valueDiv) {
                            valueDiv.textContent = `${totalArchetypes} (${groupedArchetypes})`;
                        }
                        
                        // Update Top 3 by Count
                        const paragraphs = card.querySelectorAll('p');
                        paragraphs.forEach(p => {
                            const strong = p.querySelector('strong');
                            if (strong && strong.textContent.includes('Top 3 by Count')) {
                                p.innerHTML = `<strong>Top 3 by Count:</strong><br>${top3ByCountHtml}`;
                            } else if (strong && strong.textContent.includes('Win Rate')) {
                                p.innerHTML = `<strong>Top 3 by Win Rate:</strong><br>${top3ByWinRateHtml}`;
                            }
                        });
                        
                        devLog('? Archetype Overview patched:', {
                            totalArchetypes,
                            groupedArchetypes,
                            top3Count: decksByCount.map(d => d.name),
                            top3WR: decksByWinRate.map(d => d.name)
                        });
                    }
                });
            } catch (error) {
                console.error('? Error patching Archetype Overview:', error);
            }
        }
        
        // Patch Meta stat card with tournament statistics
        async function patchMetaStats() {
            try {
                // Load format from settings
                let currentFormat = 'SVI-PFL'; // Default fallback
                try {
                    const settingsResponse = await fetch('./current_meta_analysis_settings.json?t=' + Date.now());
                    if (settingsResponse.ok) {
                        const settings = await settingsResponse.json();
                        const formatFilter = settings?.sources?.limitless_online?.format_filter;
                        if (formatFilter) {
                            // formatFilter is just the set code (e.g., "ASC"), prefix with "SVI-"
                            currentFormat = `SVI-${formatFilter}`;
                            devLog(`?? Loaded format from settings: ${currentFormat}`);
                        }
                    }
                } catch (e) {
                    console.warn('Could not load current_meta_analysis_settings.json:', e);
                }
                
                // Load Limitless meta statistics from JSON file
                let metaStats = { tournaments: 0, players: 0, matches: 0 };
                try {
                    const metaResponse = await fetch(BASE_PATH + 'limitless_meta_stats.json?t=' + Date.now());
                    if (metaResponse.ok) {
                        metaStats = await metaResponse.json();
                    }
                } catch (e) {
                    console.warn('Could not load limitless_meta_stats.json:', e);
                }
                
                // Load tournament overview data - filter by current format
                const tournamentData = await loadCSV('tournament_cards_data_overview.csv');
                let majorTournaments = 0;
                let totalPlayers = 0;
                
                if (tournamentData && tournamentData.length > 0) {
                    const formatTournaments = tournamentData.filter(row => row.format === currentFormat);
                    majorTournaments = formatTournaments.length;
                    totalPlayers = formatTournaments.reduce((sum, row) => {
                        return sum + (parseInt(row.players, 10) || 0);
                    }, 0);
                }
                
                // Find and update the Meta stat card
                const statCards = document.querySelectorAll('#currentMetaContent .stat-card');
                statCards.forEach(card => {
                    const h3 = card.querySelector('h3');
                    if (h3 && h3.textContent.includes('Meta')) {
                        // Update format display
                        const valueDiv = card.querySelector('.value');
                        if (valueDiv) {
                            valueDiv.textContent = currentFormat;
                            devLog(`? Format updated to: ${currentFormat}`);
                        }
                        
                        // Add tournament stats below the current format
                        const existingP = card.querySelector('p');
                        if (existingP && existingP.textContent.includes('Current Format')) {
                            // Add new stats
                            const statsHtml = `
                                <p style="font-size: 0.85em; color: #555; margin: 15px 0 5px 0; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px; font-weight: 500;">
                                    <strong style="color: #3498db;">?? Online Meta:</strong><br>
                                    <span style="font-size: 0.95em;">${metaStats.tournaments.toLocaleString()} tournaments · ${metaStats.players.toLocaleString()} players · ${metaStats.matches.toLocaleString()} matches</span>
                                </p>
                                <p style="font-size: 0.85em; color: #555; margin: 5px 0 0 0; font-weight: 500;">
                                    <strong style="color: #27ae60;">?? Major Tournaments:</strong><br>
                                    <span style="font-size: 0.95em;">${majorTournaments} tournaments · ${totalPlayers.toLocaleString()} players</span>
                                </p>
                            `;
                            existingP.insertAdjacentHTML('afterend', statsHtml);
                        }
                        
                        devLog('? Meta stats patched:', {
                            onlineStats: metaStats,
                            majorTournaments,
                            totalPlayers,
                            format: currentFormat
                        });
                    }
                });
            } catch (error) {
                console.error('? Error patching Meta stats:', error);
            }
        }