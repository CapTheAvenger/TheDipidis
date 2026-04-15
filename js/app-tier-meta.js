// app-tier-meta.js — extracted from app.js
// Part of Hausi's Pokemon TCG Analysis

        // ============================================================================

        /**
         * Formula: (share * 2) + ((winRate - 50) * 3), normalized to 0-100
         * If winRate doesn't exist, use only share
         */
        function calculatePowerScore(share, winRate = null) {
            let score = 0;

            if (winRate !== null && !isNaN(winRate)) {
                // Full formula with winrate
                score = (share * 2) + ((winRate - 50) * 3);
            } else {
                score = share * 5; // Boost share influence when no winrate
            }

            // Normalize to 0-100 scale
            score = Math.max(0, Math.min(100, score));
            return Math.round(score);
        }

        /**
         * Determine tier for a deck
         * @param {Object} deck - Deck object with share, winrate, etc.
         * @returns {string} - 'tier-1', 'tier-2', 'tier-3', or 'tier-trending'
         */
        function getDeckTier(deck) {
            const shareRaw = deck.share || deck.new_share || deck.new_meta_share || deck.percentage_in_archetype || 0;
            const share = parseFloat(String(shareRaw).replace(',', '.')) || 0;
            const winRate = parseFloat(deck.winrate || deck.new_winrate || null);
            const countChange = parseInt(deck.count_change || 0);

            // Tier 1: Share >= 8%
            if (share >= 8) return 'tier-1';
            
            // Tier 2: Share >= 4% and < 8%
            if (share >= 4 && share < 8) return 'tier-2';

            // Tier 3: Share >= 1.5% and < 4%
            if (share >= 1.5 && share < 4) return 'tier-3';
            
            // Trending / Rogue: below Tier 3
            if (share < 1.5) {
                if (winRate && winRate > 52) return 'tier-trending';
                if (countChange > 0) return 'tier-trending';
                return 'tier-rogue';
            }
            
            return null; // Don't show in tier list
        }
        
        /**
         * Get trend badge HTML based on share changes
         * @param {string} deckName - Name of the deck/archetype
         * @param {number} shareChange - Change in meta share (new - old)
         * @returns {string} - HTML for trend badge or empty string
         */
        function getDeckTrendBadge(deckName, shareChange) {
            if (!shareChange || Math.abs(shareChange) < 0.1) return '';
            
            if (shareChange > 0) {
                return `<span class="stat-badge stat-trend-up">+${Math.abs(shareChange).toFixed(1)}%</span>`;
            } else {
                return `<span class="stat-badge stat-trend-down">-${Math.abs(shareChange).toFixed(1)}%</span>`;
            }
        }

        /**
         * Trend indicator based on last two history points.
         * Expects objects like: { share: number|string }
         * @param {Array} history
         * @returns {string}
         */
        function getTrendIndicator(history) {
            if (!Array.isArray(history) || history.length < 2) return '';

            const parseShare = (value) => {
                const parsed = parseFloat(String(value ?? 0).replace(',', '.'));
                return Number.isFinite(parsed) ? parsed : NaN;
            };

            // Compare strictly the last two available time points.
            const validPoints = history.filter(point => Number.isFinite(parseShare(point?.share)));
            if (validPoints.length < 2) return '';

            const recentPoints = validPoints.slice(-2);
            const previous = parseShare(recentPoints[0]?.share);
            const current = parseShare(recentPoints[1]?.share);
            if (!Number.isFinite(previous) || !Number.isFinite(current)) return '';

            const diff = current - previous;

            // STAPLE SCHUTZ: Keine roten Pfeile bei Staples (>95%),
            // es sei denn der Absturz ist massiv (>10%).
            if (current > 95 && diff > -10) return '';

            if (diff > 2) return `<span class="trend-up">▲ +${diff.toFixed(1)}%</span>`;
            if (diff < -2) return `<span class="trend-down">▼ ${diff.toFixed(1)}%</span>`;

            // Verstecke das Badge komplett, wenn stabil.
            return '';
        }

        function getCityLeagueCardShareHistory(cardName, targetArchetype = null) {
            const rows = window.cityLeagueAnalysisData || [];
            if (!cardName || rows.length === 0) return [];

            const normalizeName = (name) => {
                const raw = String(name || '');
                if (typeof fixCardNameEncoding === 'function') {
                    return fixCardNameEncoding(raw).trim().toLowerCase();
                }
                return raw.trim().toLowerCase();
            };

            const targetName = normalizeName(cardName);
            const targetArchNormalized = targetArchetype && targetArchetype !== 'all' ? targetArchetype.trim().toLowerCase() : null;
            const parseNum = (value) => parseFloat(String(value ?? 0).replace(',', '.')) || 0;

            const getIsoWeekFromDate = (isoDate) => {
                const match = String(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
                if (!match) return '';

                const year = parseInt(match[1], 10);
                const month = parseInt(match[2], 10);
                const day = parseInt(match[3], 10);
                const dt = new Date(Date.UTC(year, month - 1, day));
                if (Number.isNaN(dt.getTime())) return '';

                const isoDay = dt.getUTCDay() || 7;
                dt.setUTCDate(dt.getUTCDate() + 4 - isoDay);
                const isoYear = dt.getUTCFullYear();
                const yearStart = new Date(Date.UTC(isoYear, 0, 1));
                const weekNo = Math.ceil((((dt - yearStart) / 86400000) + 1) / 7);
                return `${isoYear}-W${String(weekNo).padStart(2, '0')}`;
            };

            const getWeekPeriod = (row) => {
                const rawPeriod = String(row.period || '').trim();
                const periodMatch = rawPeriod.match(/^(\d{4})-W(\d{1,2})$/i);
                if (periodMatch) {
                    return `${periodMatch[1]}-W${String(periodMatch[2]).padStart(2, '0')}`;
                }

                const rawDate = String(row.tournament_date || row.date || '').trim();
                const normalizedDate = parseJapaneseDate(rawDate) || rawDate;
                return getIsoWeekFromDate(normalizedDate);
            };

            const getTournamentBucket = (row, weekPeriod) => {
                const tId = String(row.tournament_id || '').trim();
                if (tId && weekPeriod) return `${tId}|||${weekPeriod}`;
                if (tId) return `id:${tId}`;
                if (weekPeriod) return `week:${weekPeriod}`;
                return 'global';
            };

            const tournamentArchetypeDecks = new Map();
            rows.forEach(row => {
                const period = getWeekPeriod(row);
                const archetype = String(row.archetype || '').trim().toLowerCase();
                if (!period || !archetype) return;

                if (targetArchNormalized && archetype !== targetArchNormalized) return;

                const decks = parseNum(row.total_decks_in_archetype_in_period || row.total_decks_in_archetype || 0);
                const tournamentBucket = getTournamentBucket(row, period);
                const key = `${tournamentBucket}|||${archetype}`;
                const prev = tournamentArchetypeDecks.get(key) || 0;
                if (decks > prev) tournamentArchetypeDecks.set(key, decks);
            });

            const totalDecksByPeriod = new Map();
            tournamentArchetypeDecks.forEach((decks, key) => {
                const keyParts = key.split('|||');
                const period = keyParts.length >= 2 ? keyParts[1] : '';
                if (!period) return;
                totalDecksByPeriod.set(period, (totalDecksByPeriod.get(period) || 0) + decks);
            });

            const decksWithCardByPeriod = new Map();
            rows.forEach(row => {
                const rowName = normalizeName(row.card_name || row.full_card_name || '');
                if (!rowName || rowName !== targetName) return;

                const period = getWeekPeriod(row);
                const archetype = String(row.archetype || '').trim().toLowerCase();
                if (!period || !archetype) return;

                if (targetArchNormalized && archetype !== targetArchNormalized) return;

                const decksWithCard = parseNum(row.deck_inclusion_count || row.deck_count || 0);
                decksWithCardByPeriod.set(period, (decksWithCardByPeriod.get(period) || 0) + decksWithCard);
            });

            return Array.from(totalDecksByPeriod.keys())
                .sort((a, b) => String(a).localeCompare(String(b)))
                .map(period => {
                    const totalDecks = totalDecksByPeriod.get(period) || 0;
                    const decksWithCard = decksWithCardByPeriod.get(period) || 0;
                    const share = totalDecks > 0 ? (decksWithCard / totalDecks) * 100 : 0;
                    return { period, share };
                })
                .filter(entry => Number.isFinite(entry.share));
        }
        
        /**
         * Fuzzy lookup for cardDataByArchetype.
         * Handles apostrophe/possessive differences (Rocket's → Rocket), "ex" suffixes, partial matches.
         */
        function _normArchName(name) {
            return String(name || '').toLowerCase()
                .replace(/[''`]s\b/g, '')   // strip possessive 's (Rocket's → Rocket)
                .replace(/[''`]/g, '')        // strip remaining apostrophes
                .replace(/\s+/g, ' ').trim();
        }

        function fuzzyArchetypeLookup(archetypeName, cardDataByArchetype) {
            if (!archetypeName || !cardDataByArchetype) return [];

            // 1) Exact match
            if (cardDataByArchetype[archetypeName]) return cardDataByArchetype[archetypeName];

            const norm = _normArchName(archetypeName);
            const normalizedMap = window._cardArchetypeNormalizedMap || {};

            // 2) Normalized exact match (handles apostrophe/possessive)
            if (normalizedMap[norm]) return cardDataByArchetype[normalizedMap[norm]] || [];

            // 3) Try with/without "ex" suffix
            const normEx = norm.endsWith(' ex') ? norm : norm + ' ex';
            const normNoEx = norm.endsWith(' ex') ? norm.slice(0, -3).trim() : norm;
            if (normalizedMap[normEx]) return cardDataByArchetype[normalizedMap[normEx]] || [];
            if (normalizedMap[normNoEx]) return cardDataByArchetype[normalizedMap[normNoEx]] || [];

            // 4) Partial match: archetype key starts with our query or vice versa
            const allNormKeys = Object.keys(normalizedMap);
            const startMatch = allNormKeys.find(k => k.startsWith(norm) || norm.startsWith(k));
            if (startMatch) return cardDataByArchetype[normalizedMap[startMatch]] || [];

            // 5) Word-overlap matching (for multi-word names like "Rocket's Mewtwo" → "Rocket Mewtwo Ex")
            const normWords = norm.split(' ');
            const ignoreWords = new Set(['ex', 'jtg', 'tef', 'scr', 'twm', 'dri', 'meg', 'box']);
            let bestKey = null;
            let bestOverlap = 0;
            allNormKeys.forEach(k => {
                const kWords = k.split(' ').filter(w => !ignoreWords.has(w));
                const overlap = normWords.filter(w => kWords.includes(w)).length;
                if (overlap > bestOverlap) {
                    bestOverlap = overlap;
                    bestKey = k;
                }
            });
            if (bestKey && bestOverlap >= 1) return cardDataByArchetype[normalizedMap[bestKey]] || [];

            return [];
        }

        /**
         * Find the best representative image for an archetype
         * Priority: 1) Pokemon ex/VSTAR/VMAX, 2) Stage 2, 3) First Pokemon
         * @param {string} archetypeName - Name of the archetype
         * @param {Array} archetypeCardsData - Array of card objects for this deck
         * @returns {string} - Image URL or fallback
         */
        function getArchetypeImage(archetypeName, archetypeCardsData) {
            if (!archetypeCardsData || archetypeCardsData.length === 0) {
                return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="280"%3E%3Crect fill="%23ddd" width="200" height="280"/%3E%3C/svg%3E';
            }
            
            // Priority 0: If a non-Pokemon card matches the archetype name, use it
            // (e.g., "Festival Lead" → "Festival Grounds" stadium card)
            const archetypeBase = archetypeName.split(' ').slice(0, 2).join(' ').toLowerCase();
            const archetypeFirstWord = archetypeName.split(' ')[0].toLowerCase();
            const nameMatchAll = archetypeCardsData.filter(card => {
                const cardName = (card.card_name || '').toLowerCase();
                return cardName.includes(archetypeBase) || cardName.startsWith(archetypeFirstWord);
            });
            if (nameMatchAll.length > 0) {
                // Prefer Pokemon cards over Trainers, but still use Trainer if no Pokemon match
                const pokemonMatch = nameMatchAll.filter(c => {
                    const t = (c.type || '').toLowerCase();
                    return !t.includes('trainer') && !t.includes('energy') && !t.includes('item') && !t.includes('supporter') && !t.includes('stadium');
                });
                if (pokemonMatch.length > 0) {
                    pokemonMatch.sort((a, b) => parseFloat(b.percentage_in_archetype || 0) - parseFloat(a.percentage_in_archetype || 0));
                    return pokemonMatch[0].image_url || '';
                }
                // Use Trainer/Stadium match (e.g., Festival Grounds)
                nameMatchAll.sort((a, b) => parseFloat(b.percentage_in_archetype || 0) - parseFloat(a.percentage_in_archetype || 0));
                return nameMatchAll[0].image_url || '';
            }

            // Filter only Pokemon cards
            const pokemonCards = archetypeCardsData.filter(card => {
                const cardType = card.type || '';
                return !cardType.toLowerCase().includes('trainer') && 
                       !cardType.toLowerCase().includes('energy') &&
                       !cardType.toLowerCase().includes('item') &&
                       !cardType.toLowerCase().includes('supporter') &&
                       !cardType.toLowerCase().includes('stadium');
            });
            
            if (pokemonCards.length === 0) return '';
            
            // Priority 2: Pokemon ex, VSTAR, VMAX, V-UNION (sorted by usage)
            const specialPokemon = pokemonCards.filter(card => {
                const name = (card.card_name || '').toLowerCase();
                return name.includes(' ex') || name.includes('vstar') || 
                       name.includes('vmax') || name.includes('v-union');
            });
            
            if (specialPokemon.length > 0) {
                // Sort by percentage_in_archetype AND total_count (main attacker has higher usage)
                specialPokemon.sort((a, b) => {
                    const pctA = parseFloat(a.percentage_in_archetype || 0);
                    const pctB = parseFloat(b.percentage_in_archetype || 0);
                    const countA = parseInt(a.total_count || 0);
                    const countB = parseInt(b.total_count || 0);
                    
                    // Primary sort by percentage, secondary by count
                    if (pctB !== pctA) return pctB - pctA;
                    return countB - countA;
                });
                return specialPokemon[0].image_url || '';
            }
            
            // Priority 3: Stage 2 Pokemon (includes "Stage 2" in type)
            const stage2Pokemon = pokemonCards.filter(card => {
                const type = (card.type || '').toLowerCase();
                return type.includes('stage 2');
            });
            
            if (stage2Pokemon.length > 0) {
                stage2Pokemon.sort((a, b) => {
                    const pctA = parseFloat(a.percentage_in_archetype || 0);
                    const pctB = parseFloat(b.percentage_in_archetype || 0);
                    return pctB - pctA;
                });
                return stage2Pokemon[0].image_url || '';
            }
            
            // Priority 4: Most common Pokemon card
            pokemonCards.sort((a, b) => {
                const pctA = parseFloat(a.percentage_in_archetype || 0);
                const pctB = parseFloat(b.percentage_in_archetype || 0);
                return pctB - pctA;
            });
            
            return pokemonCards[0].image_url || '';
        }

        function getCombinedMainArchetypeLabel(archetypeName) {
            const raw = String(archetypeName || '').trim().toLowerCase();
            if (!raw) return '';

            if (raw.startsWith('mega ')) {
                const parts = raw.split(' ');
                return parts.slice(0, 2).join(' ');
            }
            if (raw.startsWith('alolan ') || raw.startsWith('galarian ') || raw.startsWith('hisuian ')) {
                const parts = raw.split(' ');
                return parts.slice(0, 2).join(' ');
            }
            return raw.split(' ')[0];
        }

        function toTitleCaseWords(value) {
            return String(value || '')
                .split(' ')
                .filter(Boolean)
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
        }
        
        /**
         * Render Tier List for City League
         * Generates banner-style deck cards grouped by tier
         */
        async function renderCityLeagueTierList(prefetchedAnalysisData = null, imageMap = null) {
            const content = document.getElementById('cityLeagueContent');
            if (!content || !cityLeagueData || cityLeagueData.length === 0) return;
            
            // Load card data for images
            const timestamp = new Date().getTime();
            let cardDataByArchetype = {};
            
            // Wenn imageMap vorhanden (vorberechnete Archetype→Image-URL-Map, ~30 KB),
            // koennen wir das Laden/Parsen der 35 MB Analysis-CSV komplett ueberspringen.
            if (!imageMap) {
                try {
                    const cardsData = prefetchedAnalysisData || await (async () => {
                        const formatSuffix = window.currentCityLeagueFormat === 'M3' ? '_M3' : '';
                        const cardsResponse = await fetch(`${BASE_PATH}city_league_analysis${formatSuffix}.csv?t=${timestamp}`);
                        if (!cardsResponse.ok) return [];
                        const cardsText = await cardsResponse.text();
                        return parseCSV(cardsText);
                    })();

                    // Group cards by archetype
                    cardsData.forEach(card => {
                        const arch = card.archetype;
                        if (!cardDataByArchetype[arch]) cardDataByArchetype[arch] = [];
                        cardDataByArchetype[arch].push(card);
                    });

                    // Build normalized lookup for fuzzy matching (same as current meta)
                    window._cardArchetypeNormalizedMap = {};
                    Object.keys(cardDataByArchetype).forEach(key => {
                        window._cardArchetypeNormalizedMap[_normArchName(key)] = key;
                    });
                } catch (e) {
                    console.warn('Could not load card data for images:', e);
                }
            }
            
            const parseDeckCount = (deck) => {
                const countRaw = deck.count || deck.new_count || deck.deck_count || 0;
                const parsed = parseInt(String(countRaw).replace(',', '.'), 10);
                return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
            };

            const parseDeckRank = (deck) => {
                const isM4Format = window.currentCityLeagueFormat === 'M4';
                const rankRaw = isM4Format
                    ? (deck.new_avg_placement || deck.avg_placement || deck.average_placement || '999')
                    : (deck.average_placement || deck.avg_placement || deck.new_avg_placement || '999');
                const parsed = parseFloat(String(rankRaw).replace(',', '.'));
                return Number.isFinite(parsed) && parsed > 0 ? parsed : 999;
            };

            // 1. Sort descending by count (= Meta-Share / deck-list count).
            const archetypeArray = [...cityLeagueData].sort((a, b) => parseDeckCount(b) - parseDeckCount(a));

            // Hero section: combine variants by main Pokemon using same grouping rules as Archetype Combined.
            const combinedHeroMap = new Map();
            archetypeArray.forEach(deck => {
                const archetypeName = String(deck.archetype || '').trim();
                if (!archetypeName) return;

                const mainKey = getCombinedMainArchetypeLabel(archetypeName);
                if (!mainKey) return;

                const deckCount = parseDeckCount(deck);
                const avgRank = parseDeckRank(deck);

                if (!combinedHeroMap.has(mainKey)) {
                    combinedHeroMap.set(mainKey, {
                        key: mainKey,
                        label: toTitleCaseWords(mainKey),
                        totalCount: 0,
                        weightedRankSum: 0,
                        variants: [],
                        representativeVariant: archetypeName,
                        representativeDeckCount: 0
                    });
                }

                const group = combinedHeroMap.get(mainKey);
                group.totalCount += deckCount;
                group.weightedRankSum += avgRank * Math.max(1, deckCount);
                group.variants.push(archetypeName);

                if (deckCount > group.representativeDeckCount) {
                    group.representativeVariant = archetypeName;
                    group.representativeDeckCount = deckCount;
                }
            });

            const topHeroArchetypes = Array.from(combinedHeroMap.values())
                .sort((a, b) => b.totalCount - a.totalCount)
                .slice(0, 5)
                .map(item => ({
                    ...item,
                    weightedRank: item.totalCount > 0 ? (item.weightedRankSum / item.totalCount) : 999
                }));

            // 2. Fixed index-based tier assignment: Top-3 | Next-7 | Next-10 | Rest
            const tierGroups = { 'tier-1': [], 'tier-2': [], 'tier-3': [], 'tier-trending': [] };
            archetypeArray.forEach((deck, idx) => {
                if (idx <= 2)       tierGroups['tier-1'].push(deck);
                else if (idx <= 9)  tierGroups['tier-2'].push(deck);
                else if (idx <= 19) tierGroups['tier-3'].push(deck);
                else                tierGroups['tier-trending'].push(deck);
            });

            const tierTitles = {
                'tier-1':        { title: 'Tier 1',          subtitle: 'Meta Definition'      },
                'tier-2':        { title: 'Tier 2',          subtitle: 'Strong Contenders'     },
                'tier-3':        { title: 'Tier 3',          subtitle: 'Viable Options'        },
                'tier-trending': { title: 'Rogue / Trending', subtitle: 'Emerging Archetypes' }
            };

            // 3. Within each tier sort by avg_placement ascending (lower = better).
            Object.keys(tierGroups).forEach((tierKey) => {
                tierGroups[tierKey].sort((a, b) => parseDeckRank(a) - parseDeckRank(b));
            });

            let heroHtml = '';
            if (topHeroArchetypes.length > 0) {
                heroHtml = `
                    <section class="tier-hero-section" aria-label="${escapeHtml(t('cl.heroAria'))}">
                        <div class="tier-hero-header">
                            <h2>${t('cl.heroTitle')}</h2>
                            <p>${t('cl.heroSubtitle')}</p>
                        </div>
                        <div class="tier-hero-grid">`;

                topHeroArchetypes.forEach((item, index) => {
                    const representativeCards = cardDataByArchetype[item.representativeVariant] || [];
                    const imageUrl = imageMap
                        ? (imageMap[item.representativeVariant] || '')
                        : getArchetypeImage(item.representativeVariant, representativeCards);
                    const combinedMainEscaped = escapeJsStr(item.key || item.label || item.representativeVariant || '');
                    const combinedVariantsJsonEscaped = escapeJsStr(encodeURIComponent(JSON.stringify(item.variants || [])));
                    const avgRankText = Number.isFinite(item.weightedRank) && item.weightedRank < 999
                        ? item.weightedRank.toFixed(1)
                        : '0.0';
                    const variantCount = item.variants.length;
                    const variantLabel = variantCount === 1 ? t('cl.heroVariantSingular') : t('cl.heroVariantPlural');

                    heroHtml += `
                        <div class="tier-hero-card" onclick="analyzeCombinedArchetype('${combinedMainEscaped}', '${combinedVariantsJsonEscaped}')">
                            ${imageUrl ? `<div class="tier-hero-bg" style="background-image: url('${imageUrl}')"></div>` : ''}
                            <div class="tier-hero-content">
                                <div class="archetype-card-header">
                                    <span class="archetype-rank-badge">#${index + 1}</span>
                                    <h3 class="archetype-card-title">${item.label}</h3>
                                </div>
                                <div class="tier-hero-meta">${variantCount} ${variantLabel}</div>
                                <div class="tier-hero-stats">
                                    <span class="stat-badge">${item.totalCount} ${t('cl.decks')}</span>
                                    <span class="stat-badge rank-performance-hint" title="${escapeHtml(t('cl.heroRankHint'))}">${t('cl.heroAvgRank')} ${avgRankText}</span>
                                </div>
                            </div>
                        </div>`;
                });

                heroHtml += `
                        </div>
                    </section>`;
            }

            let html = heroHtml + '<div style="margin-bottom: 30px;">';
            
            // Render each tier
            ['tier-1', 'tier-2', 'tier-3', 'tier-trending'].forEach(tierKey => {
                const decks = tierGroups[tierKey];
                if (decks.length === 0) return;
                const tierMeta = tierTitles[tierKey];
                const isTrending = tierKey === 'tier-trending';

                if (isTrending) {
                    html += `
                    <div class="tier-section ${tierKey}" id="${tierKey}">
                        <details>
                            <summary class="tier-trending-summary">
                                <h3 style="display:inline;">${tierMeta.title} <small>${tierMeta.subtitle}</small></h3>
                                <span class="tier-trending-count">${decks.length} ${t('cl.decks')}</span>
                            </summary>
                            <div class="deck-grid tier-deck-grid">`;
                } else {
                    html += `
                    <div class="tier-section ${tierKey}" id="${tierKey}">
                        <h3>${tierMeta.title} <small>${tierMeta.subtitle}</small></h3>
                        <div class="deck-grid tier-deck-grid">`;
                }

                decks.forEach(deck => {
                    const archetypeName = deck.archetype;
                    const deckName = archetypeName;
                    const isM4Format = window.currentCityLeagueFormat === 'M4';
                    
                    // Use format-appropriate values while keeping the banner layout identical for M3 and M4
                    const currentRankValue = parseFloat(
                        isM4Format
                            ? (deck.new_avg_placement || deck.avg_placement || deck.average_placement || 0)
                            : (deck.average_placement || deck.avg_placement || deck.new_avg_placement || 0)
                    );
                    const currentShareValue = parseFloat(
                        isM4Format
                            ? (deck.new_meta_share || deck.new_share || deck.share || deck.percentage_in_archetype || 0)
                            : (deck.share || deck.percentage_in_archetype || deck.new_meta_share || deck.new_share || 0)
                    );
                    
                    // Get archetype image
                    const archetypeCards = fuzzyArchetypeLookup(archetypeName, cardDataByArchetype);
                    const imageUrl = imageMap
                        ? (imageMap[archetypeName] || '')
                        : getArchetypeImage(archetypeName, archetypeCards);
                    
                    const currentRank = currentRankValue > 0 ? currentRankValue.toFixed(1) : '0.0';
                    const currentShare = currentShareValue.toFixed(1);
                    const m3Deck = window.m3BaselineData ? window.m3BaselineData[deckName] : null;

                    let rankTrendClass = 'trend-neutral';
                    let shareTrendClass = 'trend-neutral';
                    let rankIcon = '';
                    let shareIcon = '';
                    let m3RankDisplay = '';
                    let m3ShareDisplay = '';
                    const isM4WithComparison = window.currentCityLeagueFormat === 'M4' && !!m3Deck;

                    if (isM4WithComparison) {
                        // 1. Werte sicher als Zahlen extrahieren
                        const currentR = parseFloat(String(currentRankValue || 0).replace(',', '.'));
                        const previousR = m3Deck
                            ? parseFloat(String(m3Deck.average_placement || m3Deck.avg_placement || 0).replace(',', '.'))
                            : null;

                        const normalizedCurrentS = parseFloat(currentShareValue || 0);
                        const normalizedPreviousS = m3Deck
                            ? parseFloat((m3Deck.share || m3Deck.percentage_in_archetype || 0).toString().replace(',', '.'))
                            : null;

                        let rankClass = "trend-neutral";
                        rankIcon = "\u2013";

                        if (Number.isFinite(currentR) && Number.isFinite(previousR) && previousR > 0) {
                            // TCG LOGIK: Kleinerer Rang = Besser (Aufstieg)
                            if (currentR < previousR) {
                                // Beispiel: 7.0 (M4) < 8.5 (M3) -> Verbesserung!
                                rankIcon = "▲";
                                rankClass = "trend-positive"; // Grün
                            } else if (currentR > previousR) {
                                // Beispiel: 9.0 (M4) > 8.5 (M3) -> Verschlechterung!
                                rankIcon = "▼";
                                rankClass = "trend-negative"; // Rot
                            }
                        }
                        rankTrendClass = rankClass;

                        // 3. SHARE-TREND (Höher ist besser!)
                        let shareClass = "trend-neutral";
                        shareIcon = "\u2013";
                        if (normalizedPreviousS !== null) {
                            if (normalizedCurrentS > normalizedPreviousS) {
                                // Mehr Marktanteil
                                shareIcon = "▲";
                                shareClass = "trend-positive";
                            } else if (normalizedCurrentS < normalizedPreviousS) {
                                // Weniger Marktanteil
                                shareIcon = "▼";
                                shareClass = "trend-negative";
                            }
                        }
                        shareTrendClass = shareClass;

                        m3RankDisplay = Number.isFinite(previousR)
                            ? `<span class="stat-compare-value">(M3: ${previousR.toFixed(1)})</span>`
                            : '';
                        m3ShareDisplay = Number.isFinite(normalizedPreviousS)
                            ? `<span class="stat-compare-value">(M3: ${normalizedPreviousS.toFixed(1)}%)</span>`
                            : '';
                    }

                    const statsHtml = `
                        <div class="deck-banner-stats" style="display: flex; flex-direction: column; align-items: flex-start;">
                            <span class="stat-badge rank-performance-hint" style="background: #fff3e0; color: #e65100;" title="Lower Rank = Better Performance">
                                Rank: ${currentRank} ${m3RankDisplay} ${isM4WithComparison ? `<span class="trend-icon ${rankTrendClass}">${rankIcon}</span>` : ''}
                            </span>
                            <span class="stat-badge">
                                Share: ${currentShare}% ${m3ShareDisplay} ${isM4WithComparison ? `<span class="trend-icon ${shareTrendClass}">${shareIcon}</span>` : ''}
                            </span>
                        </div>
                    `;
                    
                    const archetypeEscaped = escapeJsStr(archetypeName);
                    
                    html += `
                        <div class="deck-banner-card" onclick="navigateToAnalysisWithDeck('${archetypeEscaped}')">
                            ${imageUrl ? `<div class="deck-banner-bg" style="background-image: url('${imageUrl}')"></div>` : ''}
                            <div class="deck-banner-content">
                                <div class="deck-banner-name">${archetypeName}</div>
                                ${statsHtml}
                            </div>
                        </div>`;
                });
                
                if (isTrending) {
                    html += `
                            </div>
                        </details>
                    </div>`;
                } else {
                    html += `
                        </div>
                    </div>`;
                }
            });
            
            html += '</div>';
            
            // Inject into dedicated mount when available, fallback to prepend.
            const tierMount = document.getElementById('cityLeagueTierSections');
            if (tierMount) {
                tierMount.innerHTML = html;
            } else {
                content.innerHTML = html + content.innerHTML;
            }
        }
        
        /**
         * Render Tier List for Current Meta (Global)
         * Includes Top Archetypes hero section + Tier 1-3 + Rogue banners.
         * Clicking navigates to Deck Analysis (global) tab.
         */
        async function renderCurrentMetaTierList() {
            const container = document.getElementById('currentMetaContent');
            if (!container) return;
            
            // Load CSV data
            let metaData = [];
            let cardDataByArchetype = {};
            const timestamp = Date.now();
            
            try {
                metaData = await fetchAndParseCSV(`${BASE_PATH}limitless_online_decks_comparison.csv?t=${timestamp}`);
                
                // Load card data for images
                const cardsData = await loadCurrentMetaRowsWithFallback({ forceRefresh: true });

                // Group cards by archetype
                cardsData.forEach(card => {
                    const arch = card.archetype;
                    if (!cardDataByArchetype[arch]) cardDataByArchetype[arch] = [];
                    cardDataByArchetype[arch].push(card);
                });

                // Build normalized lookup for fuzzy archetype matching
                // Handles apostrophe differences (N's vs Ns), "ex" suffix, etc.
                window._cardArchetypeNormalizedMap = {};
                const allArchKeys = Object.keys(cardDataByArchetype);
                allArchKeys.forEach(key => {
                    const norm = _normArchName(key);
                    window._cardArchetypeNormalizedMap[norm] = key;
                });
            } catch (e) {
                console.warn('Could not load meta data for tier list:', e);
                return;
            }
            
            if (metaData.length === 0) return;
            
            // Normalisiere alle Decks und sortiere nach Share (absteigend)
            const normalizedDecks = metaData.map(deck => ({
                archetype: deck.deck_name || deck.archetype,
                share: parseFloat(deck.new_share || 0),
                new_share: parseFloat(deck.new_share || 0),
                old_share: parseFloat(deck.old_share || 0),
                winrate: parseFloat(deck.new_winrate || 0),
                new_winrate: parseFloat(deck.new_winrate || 0),
                count_change: parseInt(deck.count_change || 0),
                new_count: parseInt(deck.new_count || 0)
            }));
            normalizedDecks.sort((a, b) => b.share - a.share);

            // ===================== HERO SECTION =====================
            const combinedHeroMap = new Map();
            normalizedDecks.forEach(deck => {
                const archetypeName = String(deck.archetype || '').trim();
                if (!archetypeName) return;

                const mainKey = getCombinedMainArchetypeLabel(archetypeName);
                if (!mainKey) return;

                const deckCount = deck.new_count || 0;
                const winrate = deck.winrate || 0;
                const share = deck.share || 0;

                if (!combinedHeroMap.has(mainKey)) {
                    combinedHeroMap.set(mainKey, {
                        key: mainKey,
                        label: toTitleCaseWords(mainKey),
                        totalCount: 0,
                        totalShare: 0,
                        weightedWinrateSum: 0,
                        variants: [],
                        representativeVariant: archetypeName,
                        representativeDeckCount: 0
                    });
                }

                const group = combinedHeroMap.get(mainKey);
                group.totalCount += deckCount;
                group.totalShare += share;
                group.weightedWinrateSum += winrate * Math.max(1, deckCount);
                group.variants.push(archetypeName);

                if (deckCount > group.representativeDeckCount) {
                    group.representativeVariant = archetypeName;
                    group.representativeDeckCount = deckCount;
                }
            });

            const topHeroArchetypes = Array.from(combinedHeroMap.values())
                .sort((a, b) => b.totalShare - a.totalShare)
                .slice(0, 5)
                .map(item => ({
                    ...item,
                    weightedWinrate: item.totalCount > 0 ? (item.weightedWinrateSum / item.totalCount) : 0
                }));

            let heroHtml = '';
            if (topHeroArchetypes.length > 0) {
                const heroTitle = typeof t === 'function' ? t('currentMeta.topArchetypes') : 'Top Archetypes';
                const heroSubtitle = typeof t === 'function' ? t('currentMeta.topArchetypesSub') : 'Most played deck variants (Global)';

                heroHtml = `
                    <section class="tier-hero-section" aria-label="${heroTitle}">
                        <div class="tier-hero-header">
                            <h2>${heroTitle}</h2>
                            <p>${heroSubtitle}</p>
                        </div>
                        <div class="tier-hero-grid">`;

                topHeroArchetypes.forEach((item, index) => {
                    const representativeCards = fuzzyArchetypeLookup(item.representativeVariant, cardDataByArchetype);
                    const imageUrl = getArchetypeImage(item.representativeVariant, representativeCards);
                    const combinedMainEscaped = escapeJsStr(item.key || item.label || item.representativeVariant || '');
                    const combinedVariantsJsonEscaped = escapeJsStr(encodeURIComponent(JSON.stringify(item.variants || [])));
                    const winrateText = Number.isFinite(item.weightedWinrate) && item.weightedWinrate > 0
                        ? item.weightedWinrate.toFixed(1)
                        : '0.0';
                    const shareText = item.totalShare > 0 ? item.totalShare.toFixed(1) : '0.0';
                    const variantCount = item.variants.length;
                    const variantLabel = variantCount === 1
                        ? (getLang() === 'de' ? 'Variante' : 'Variant')
                        : (getLang() === 'de' ? 'Varianten' : 'Variants');

                    heroHtml += `
                        <div class="tier-hero-card" onclick="navigateToCMAnalysisWithCombinedDeck('${combinedMainEscaped}', '${combinedVariantsJsonEscaped}')">
                            ${imageUrl ? `<div class="tier-hero-bg" style="background-image: url('${imageUrl}')"></div>` : ''}
                            <div class="tier-hero-content">
                                <div class="archetype-card-header">
                                    <span class="archetype-rank-badge">#${index + 1}</span>
                                    <h3 class="archetype-card-title">${item.label}</h3>
                                </div>
                                <div class="tier-hero-meta">${variantCount} ${variantLabel}</div>
                                <div class="tier-hero-stats">
                                    <span class="stat-badge">Share: ${shareText}%</span>
                                    <span class="stat-badge" title="Weighted average winrate">WR: ${winrateText}%</span>
                                </div>
                            </div>
                        </div>`;
                });

                heroHtml += `
                        </div>
                    </section>`;
            }

            // ===================== TIER SECTIONS =====================
            const tierGroups = { 'tier-1': [], 'tier-2': [], 'tier-3': [], 'tier-trending': [] };

            // Tier-Einteilung mit festen Limits und Mindestspielanzahl
            // Alle Tier 1-3 Decks müssen ≥ 10 % der Spielanzahl des Rang-1-Decks haben
            const rank1Count = normalizedDecks.length > 0 ? (normalizedDecks[0].new_count || 0) : 0;
            const minCountThreshold = rank1Count * 0.10;

            const T1_MAX = 6;
            const T2_MAX = 9;
            const T3_MAX = 12;
            const T1_MIN_SHARE = 5; // Tier 1 zusätzlich: Share > 5 %

            let t1 = 0, t2 = 0, t3 = 0;
            normalizedDecks.forEach((deck) => {
                const meetsMinCount = (deck.new_count || 0) >= minCountThreshold;

                if (t1 < T1_MAX && meetsMinCount && deck.share > T1_MIN_SHARE) {
                    tierGroups['tier-1'].push(deck);
                    t1++;
                } else if (t2 < T2_MAX && meetsMinCount) {
                    tierGroups['tier-2'].push(deck);
                    t2++;
                } else if (t3 < T3_MAX && meetsMinCount) {
                    tierGroups['tier-3'].push(deck);
                    t3++;
                } else {
                    tierGroups['tier-trending'].push(deck);
                }
            });
            
            const tierTitles = {
                'tier-1':        { title: 'Tier 1',          subtitle: 'Meta Dominators'     },
                'tier-2':        { title: 'Tier 2',          subtitle: 'Strong Contenders'    },
                'tier-3':        { title: 'Tier 3',          subtitle: 'Viable Options'       },
                'tier-trending': { title: 'Rogue / Trending', subtitle: 'Emerging Archetypes' }
            };
            
            // Limit trending decks to top 20
            if (tierGroups['tier-trending'].length > 20) {
                tierGroups['tier-trending'] = tierGroups['tier-trending'].slice(0, 20);
            }
            
            let html = heroHtml + '<div style="margin-bottom: 30px;">';
            
            // Render each tier
            ['tier-1', 'tier-2', 'tier-3', 'tier-trending'].forEach(tierKey => {
                const decks = tierGroups[tierKey];
                if (decks.length === 0) return;
                const tierMeta = tierTitles[tierKey];
                const isTrending = tierKey === 'tier-trending';

                if (isTrending) {
                    html += `
                    <div class="tier-section ${tierKey}" id="cm-${tierKey}">
                        <details>
                            <summary class="tier-trending-summary">
                                <h3 style="display:inline;">${tierMeta.title} <small>${tierMeta.subtitle}</small></h3>
                                <span class="tier-trending-count">${decks.length} Decks</span>
                            </summary>
                            <div class="deck-grid tier-deck-grid">`;
                } else {
                    html += `
                    <div class="tier-section ${tierKey}" id="cm-${tierKey}">
                        <h3>${tierMeta.title} <small>${tierMeta.subtitle}</small></h3>
                        <div class="deck-grid tier-deck-grid">`;
                }
                
                decks.forEach(deck => {
                    const archetypeName = deck.archetype;
                    
                    const share = parseFloat(deck.share || deck.new_share || 0);
                    const oldShare = parseFloat(deck.old_share || 0);
                    const winRate = parseFloat(deck.winrate || deck.new_winrate || 0);
                    const powerScore = calculatePowerScore(share, winRate);
                    
                    // Get archetype image
                    const archetypeCards = fuzzyArchetypeLookup(archetypeName, cardDataByArchetype);
                    const imageUrl = getArchetypeImage(archetypeName, archetypeCards);
                    
                    // Trend indicator
                    const shareChange = share - oldShare;
                    let trendHtml = getDeckTrendBadge(archetypeName, shareChange);
                    
                    const countChange = parseInt(deck.count_change || 0);
                    if (!trendHtml) {
                        if (countChange > 0) {
                            trendHtml = `<span class="stat-badge stat-trend-up">+${countChange}</span>`;
                        } else if (countChange < 0) {
                            trendHtml = `<span class="stat-badge stat-trend-down">${countChange}</span>`;
                        }
                    }
                    
                    const archetypeEscaped = escapeJsStr(archetypeName);
                    
                    html += `
                        <div class="deck-banner-card" onclick="navigateToCurrentMetaWithDeck('${archetypeEscaped}')">
                            ${imageUrl ? `<div class="deck-banner-bg" style="background-image: url('${imageUrl}')"></div>` : ''}
                            <div class="deck-banner-content">
                                <div class="deck-banner-name">${archetypeName}</div>
                                <div class="deck-banner-stats">
                                    <span class="stat-badge">${share.toFixed(1)}% · ${winRate.toFixed(1)}% WR</span>
                                    ${trendHtml}
                                </div>
                            </div>
                        </div>`;
                });
                
                if (isTrending) {
                    html += `
                            </div>
                        </details>
                    </div>`;
                } else {
                    html += `
                        </div>
                    </div>`;
                }
            });
            
            html += '</div>';
            
            // Prepend hero + tier sections before existing content
            container.innerHTML = html + container.innerHTML;
        }
        
        /**
         * Calculate global card statistics across all decks
         * Counts how often each card appears in the meta (ignoring basic energies)
         */
        function calculateGlobalCardStats(cardDataArray) {
            // Basic energies to exclude
            const basicEnergies = new Set([
                'grass energy', 'fire energy', 'water energy', 'lightning energy', 
                'psychic energy', 'fighting energy', 'darkness energy', 'metal energy', 
                'fairy energy', 'dragon energy', 'basic grass energy', 'basic fire energy',
                'basic water energy', 'basic lightning energy', 'basic psychic energy',
                'basic fighting energy', 'basic darkness energy', 'basic metal energy'
            ]);
            
            if (!cardDataArray || cardDataArray.length === 0) return [];
            
            // Get unique archetypes to count total decks
            const uniqueArchetypes = new Set(cardDataArray.map(c => c.archetype).filter(Boolean));
            const totalDecks = uniqueArchetypes.size;
            const safeTotalDecks = Math.max(1, Math.floor(totalDecks));
            
            // Aggregate cards globally
            const globalCardStats = {};
            
            cardDataArray.forEach(card => {
                const cardName = card.card_name;
                const normalizedName = cardName.toLowerCase().trim();
                
                // Skip basic energies
                if (basicEnergies.has(normalizedName)) return;
                
                // Initialize card entry if doesn't exist
                if (!globalCardStats[cardName]) {
                    globalCardStats[cardName] = {
                        name: cardName,
                        archetypes: new Set(),
                        total_appearances: 0,
                        image_url: card.image_url || '',
                        type: card.type || '',
                        rarity: card.rarity || '',
                        set_code: card.set_code || '',
                        set_number: card.set_number || ''
                    };
                }
                
                // Add archetype to set (for unique deck count)
                globalCardStats[cardName].archetypes.add(card.archetype);
                globalCardStats[cardName].total_appearances++;
            });
            
            // Calculate global share and convert to array
            const result = Object.values(globalCardStats).map(card => {
                const deckInclusionCount = card.archetypes.size;
                const rawShare = (deckInclusionCount / safeTotalDecks) * 100;
                const globalShare = Math.min(100, Math.max(0, rawShare));
                if (rawShare > 100.01) {
                    console.warn('[TopCards] Global share capped above 100%', {
                        card: card.name,
                        rawShare,
                        cappedShare: globalShare,
                        deckInclusionCount,
                        safeTotalDecks
                    });
                }
                
                return {
                    name: card.name,
                    deck_inclusion_count: deckInclusionCount,
                    global_share: parseFloat(globalShare.toFixed(1)),
                    total_appearances: card.total_appearances,
                    image_url: card.image_url,
                    type: card.type,
                    rarity: card.rarity,
                    set_code: card.set_code,
                    set_number: card.set_number
                };
            });
            
            // Sort by global share (descending)
            result.sort((a, b) => b.global_share - a.global_share);
            
            return result;
        }
        
        /**
         * Render Top Cards Widget (Format Staples)
         * Shows the most used cards across all decks in the current meta
         */
        function renderTopCardsWidget(topCards) {
            if (!topCards || topCards.length === 0) return '';
            
            const top15 = topCards.slice(0, 15);
            
            let html = `
                <div class="top-cards-container">
                    <h3 style="color: #2c3e50; margin: 0 0 15px 0; font-size: 1.3em; font-weight: 800; display: flex; align-items: center; gap: 10px;">
                        Most Used Cards (Format Staples)
                    </h3>
                    <div class="top-cards-grid">`;
            
            top15.forEach((card, index) => {
                const rank = index + 1;
                const imageUrl = card.image_url || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="280"%3E%3Crect fill="%23ddd" width="200" height="280"/%3E%3C/svg%3E';
                
                // Determine rank badge color
                let rankColor = '#95a5a6'; // Default gray
                if (rank === 1) rankColor = '#f39c12'; // Gold
                else if (rank === 2) rankColor = '#95a5a6'; // Silver
                else if (rank === 3) rankColor = '#cd7f32'; // Bronze
                else if (rank <= 5) rankColor = '#3498db'; // Blue for top 5
                
                html += `
                    <div class="top-card-item">
                        <div style="position:relative;">
                            <img src="${imageUrl}" class="top-card-img" alt="${card.name}" loading="lazy" data-image-source="limitless-en">
                            <div class="top-card-rank" style="background: ${rankColor};">#${rank}</div>
                        </div>
                        <div class="top-card-stats">
                            <div class="top-card-name">${card.name}</div>
                            <div class="top-card-share">${card.global_share.toFixed(1)}% Usage</div>
                            <div class="top-card-decks">${card.deck_inclusion_count} decks</div>
                        </div>
                    </div>`;
            });
            
            html += `
                    </div>
                </div>`;
            
            return html;
        }
        
        /**
         * Render and inject Top Cards Widget into Current Meta tab
         */
        async function renderCurrentMetaTopCards() {
            const container = document.querySelector('#currentMetaContent .container') || document.getElementById('currentMetaContent');
            if (!container) return;
            
            // Load card data
            let cardData = [];
            
            try {
                cardData = await loadCurrentMetaRowsWithFallback({ forceRefresh: true });
            } catch (e) {
                console.warn('Could not load card data for top cards widget:', e);
                return;
            }
            
            if (cardData.length === 0) return;
            
            // Calculate global card stats
            const globalStats = calculateGlobalCardStats(cardData);
            
            // Render widget HTML
            const widgetHtml = renderTopCardsWidget(globalStats);
            
            // Find existing widget or prepend new one
            let existingWidget = container.querySelector('.top-cards-container');
            if (existingWidget) {
                existingWidget.outerHTML = widgetHtml;
            } else {
                // Insert after tier list but before stat cards
                const firstStatCard = container.querySelector('.stat-card');
                if (firstStatCard && firstStatCard.parentElement) {
                    firstStatCard.parentElement.insertAdjacentHTML('beforebegin', widgetHtml);
                } else {
                    container.insertAdjacentHTML('afterbegin', widgetHtml);
                }
            }
        }
        