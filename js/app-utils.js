// app-utils.js — extracted from app.js
// Part of Hausi's Pokemon TCG Analysis

        const INTL_PRINTS_CACHE_MAX = 500;

        function _intlCacheSet(key, value) {
            if (internationalPrintsCache.size >= INTL_PRINTS_CACHE_MAX) internationalPrintsCache.clear();
            internationalPrintsCache.set(key, value);
        }

        // Get international prints for a specific card (set + number)
        function getInternationalPrintsForCard(set, number) {
            if (!cardsBySetNumberMap || Object.keys(cardsBySetNumberMap).length === 0) {
                debugVersionSelectionLog('[getInternationalPrintsForCard] Index not loaded yet');
                return [];
            }

            const normalizedSet = normalizeSetCode(set);
            const normalizedNumber = normalizeCardNumber(number);
            if (!normalizedSet || !normalizedNumber) {
                return [];
            }

            const cacheKey = `${normalizedSet}-${normalizedNumber}`;
            if (internationalPrintsCache.has(cacheKey)) {
                return internationalPrintsCache.get(cacheKey);
            }
            
            const baseCard = getIndexedCardBySetNumber(normalizedSet, normalizedNumber);
            
            if (!baseCard) {
                _intlCacheSet(cacheKey, []);
                debugVersionSelectionLog(`[getInternationalPrintsForCard] Card not found: ${normalizedSet} ${normalizedNumber}`);
                return [];
            }
            
            if (!baseCard.international_prints) {
                const result = [baseCard];
                _intlCacheSet(cacheKey, result);
                debugVersionSelectionLog(`[getInternationalPrintsForCard] No international prints for ${normalizedSet} ${normalizedNumber}, returning base card only`);
                return result;
            }
            
            // Parse "ASC-112,MEG-76,MEP-10" -> [{set: "ASC", number: "112"}, ...]
            const printRefs = baseCard.international_prints.split(',').map(p => {
                const [s, n] = p.trim().split('-');
                return {set: s, number: n};
            });

            // Fast lookup for all international prints using index + de-duplicate by set-number.
            const uniqueCards = new Map();
            printRefs.forEach(ref => {
                const key = `${ref.set}-${ref.number}`;
                const candidate = cardsBySetNumberMap[key];
                if (!candidate) return;

                const uniqueKey = `${String(candidate.set || ref.set).toUpperCase()}-${String(candidate.number || ref.number).trim()}`;
                const existing = uniqueCards.get(uniqueKey);

                // Prefer entries with valid image and non-mojibake names.
                if (!existing) {
                    uniqueCards.set(uniqueKey, candidate);
                    return;
                }

                const existingScore = (existing.image_url ? 2 : 0) + (hasMojibake(existing.name || existing.name_en || '') ? 0 : 1);
                const candidateScore = (candidate.image_url ? 2 : 0) + (hasMojibake(candidate.name || candidate.name_en || '') ? 0 : 1);
                if (candidateScore > existingScore) {
                    uniqueCards.set(uniqueKey, candidate);
                }
            });

            const intPrintCards = Array.from(uniqueCards.values());
            _intlCacheSet(cacheKey, intPrintCards);
            debugVersionSelectionLog(
                `[getInternationalPrintsForCard] Found ${intPrintCards.length} international prints for ${baseCard.name_en || baseCard.name} (${normalizedSet} ${normalizedNumber}):`,
                intPrintCards.map(c => `${c.set} ${c.number} (${c.rarity || 'NO RARITY'})`).join(', ')
            );
            
            return intPrintCards;
        }

        // Repair common mojibake sequences (UTF-8 bytes interpreted as Latin-1/Windows-1252).
        function fixMojibake(value) {
            if (value === null || value === undefined) return '';
            const text = String(value).trim();
            if (!text) return '';

            // Fast path: only attempt conversion when suspicious byte patterns are present.
            if (!/[ÃÂâ]/.test(text)) {
                return text;
            }

            try {
                const repaired = decodeURIComponent(escape(text));
                if (repaired && repaired !== text) {
                    return repaired;
                }
            } catch (e) {
                // Fallback below
            }

            return text
                .replace(/Ã©/g, 'é')
                .replace(/Ã¨/g, 'è')
                .replace(/Ã¡/g, 'á')
                .replace(/Ã¢/g, 'â')
                .replace(/Ã¤/g, 'ä')
                .replace(/Ã¶/g, 'ö')
                .replace(/Ã¼/g, 'ü')
                .replace(/Ã±/g, 'ñ')
                .replace(/Ã§/g, 'ç')
                .replace(/â€™/g, '’')
                .replace(/â€œ/g, '“')
                .replace(/â€/g, '”')
                .replace(/â€“/g, '–')
                .replace(/â€”/g, '—')
                .replace(/Â/g, '');
        }

        function hasMojibake(value) {
            return /[ÃÂâ]/.test(String(value || ''));
        }

        function escapeHtmlAttr(value) {
            return String(value || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        // Global alias so every module can use the same function
        window.escapeHtml = escapeHtmlAttr;

        function escapeJsStr(value) {
            return String(value || '')
                .replace(/\\/g, '\\\\')
                .replace(/'/g, "\\'")
                .replace(/"/g, '\\"')
                .replace(/\r/g, '\\r')
                .replace(/\n/g, '\\n');
        }

        function getDisplayCardName(cardName, setCode = '', cardNumber = '') {
            const repairedInputName = fixMojibake(cardName);
            const canonicalCard = getCanonicalCardRecord(setCode, cardNumber);
            const canonicalName = fixMojibake(canonicalCard?.name_en || canonicalCard?.name || '');

            // Prefer canonical DB name only when incoming name is clearly mojibake.
            if (canonicalName && /[ÃÂâ]/.test(String(cardName || ''))) {
                return canonicalName;
            }

            return repairedInputName || canonicalName || 'Unknown Card';
        }

        function getNameWarningHtml(rawName, displayName, setCode = '', cardNumber = '') {
            const original = String(rawName || '').trim();
            const display = String(displayName || '').trim();
            const repaired = fixMojibake(original);
            const canonicalCard = getCanonicalCardRecord(setCode, cardNumber);
            const canonicalName = fixMojibake(canonicalCard?.name_en || canonicalCard?.name || '').trim();

            const repairedFromRaw = hasMojibake(original) && repaired && repaired !== original;
            const canonicalMismatch = Boolean(
                canonicalName &&
                display &&
                normalizeCardName(canonicalName) !== normalizeCardName(display)
            );

            if (!repairedFromRaw && !canonicalMismatch) {
                return '';
            }

            const infoParts = [];
            if (repairedFromRaw) {
                infoParts.push(`Name repaired: ${repaired}`);
            }
            if (canonicalMismatch) {
                infoParts.push(`DB canonical: ${canonicalName}`);
            }
            const title = escapeHtmlAttr(infoParts.join(' | '));

            return `<span title="${title}" class="name-warning-icon">!</span>`;
        }

        function getCanonicalDeckKey(cardName, setCode, setNumber) {
            const rawName = String(cardName || '').trim();
            const normalizedSet = String(setCode || '').toUpperCase().trim();
            const normalizedNumber = String(setNumber || '').trim();

            if (normalizedSet && normalizedNumber) {
                const canonicalName = getDisplayCardName(rawName, normalizedSet, normalizedNumber);
                return `${canonicalName} (${normalizedSet} ${normalizedNumber})`;
            }

            return getDisplayCardName(rawName, '', '');
        }

        function normalizeDeckEntries(source) {
            let deck, deckOrderKey;
            if (source === 'cityLeague') {
                deck = window.cityLeagueDeck || {};
                deckOrderKey = 'cityLeagueDeckOrder';
            } else if (source === 'currentMeta') {
                deck = window.currentMetaDeck || {};
                deckOrderKey = 'currentMetaDeckOrder';
            } else if (source === 'pastMeta') {
                deck = window.pastMetaDeck || {};
                deckOrderKey = 'pastMetaDeckOrder';
            } else {
                return false;
            }

            const parseDeckKey = (key) => {
                const match = String(key || '').match(/^(.+?)\s+\(([A-Z0-9-]+)\s+([A-Z0-9-]+)\)$/);
                if (match) {
                    return {
                        name: match[1].trim(),
                        set: match[2].trim(),
                        number: match[3].trim()
                    };
                }
                return { name: String(key || '').trim(), set: '', number: '' };
            };

            const normalizedDeck = {};
            const rawEntries = Object.entries(deck);
            rawEntries.forEach(([key, count]) => {
                const qty = parseInt(count, 10) || 0;
                if (qty <= 0) return;
                const parsed = parseDeckKey(key);
                const canonicalKey = getCanonicalDeckKey(parsed.name, parsed.set, parsed.number);
                normalizedDeck[canonicalKey] = (normalizedDeck[canonicalKey] || 0) + qty;
            });

            const originalKeys = Object.keys(deck).sort();
            const normalizedKeys = Object.keys(normalizedDeck).sort();
            let changed = originalKeys.length !== normalizedKeys.length;
            if (!changed) {
                for (let i = 0; i < normalizedKeys.length; i++) {
                    const key = normalizedKeys[i];
                    if (originalKeys[i] !== key || (deck[key] || 0) !== (normalizedDeck[key] || 0)) {
                        changed = true;
                        break;
                    }
                }
            }

            if (!changed) return false;

            const existingOrder = Array.isArray(window[deckOrderKey]) ? window[deckOrderKey] : [];
            const normalizedOrder = [];
            existingOrder.forEach(oldKey => {
                const parsed = parseDeckKey(oldKey);
                const canonicalKey = getCanonicalDeckKey(parsed.name, parsed.set, parsed.number);
                if (normalizedDeck[canonicalKey] > 0 && !normalizedOrder.includes(canonicalKey)) {
                    normalizedOrder.push(canonicalKey);
                }
            });
            normalizedKeys.forEach(key => {
                if (!normalizedOrder.includes(key)) {
                    normalizedOrder.push(key);
                }
            });

            if (source === 'cityLeague') {
                window.cityLeagueDeck = normalizedDeck;
            } else if (source === 'currentMeta') {
                window.currentMetaDeck = normalizedDeck;
            } else {
                window.pastMetaDeck = normalizedDeck;
            }
            window[deckOrderKey] = normalizedOrder;

            devLog(`[normalizeDeckEntries] ${source}: normalized ${originalKeys.length} -> ${normalizedKeys.length} keys`);
            return true;
        }

        // Normalize card names for matching: lowercase, remove parenthetical suffixes, unify apostrophes
        function normalizeCardName(name) {
            if (!name) return '';
            return fixMojibake(name)
                .replace(/\([^)]*\)/g, '')  // remove (Ghetsis), (PAL), etc.
                .replace(/\[[^\]]*\]/g, '') // remove [anything]
                .replace(/[\u2019\u2018\u201B\u0060\u00B4]/g, "'") // unify curly/smart apostrophes
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase();
        }

        function getSafeCardIdentityName(name) {
            const raw = fixMojibake(String(name || '')).trim();
            if (!raw) return '';

            // Remove trailing print markers only (e.g. "(SVI 123)", "SVI 123")
            // while preserving gameplay-critical suffixes like ex/V/GX/VMAX.
            const noTrailingPrint = raw
                .replace(/\s*\(([A-Z0-9]{2,6})\s+([A-Z0-9-]{1,8})\)\s*$/i, '')
                .replace(/\s+([A-Z0-9]{2,6})\s+([A-Z0-9-]{1,8})\s*$/i, '')
                .trim();

            return noTrailingPrint || raw;
        }

        // Check if card is a basic energy (Fire, Water, Grass, etc.)
        function isBasicEnergy(cardName) {
            const normalized = normalizeCardName(cardName);
            if (!normalized) return false;

            const basicEnergyNames = [
                'fire energy', 'water energy', 'grass energy', 'lightning energy',
                'psychic energy', 'fighting energy', 'darkness energy', 'metal energy',
                'fairy energy', 'dragon energy', 'colorless energy'
            ];

            if (basicEnergyNames.includes(normalized)) return true;
            if (/^basic\s+energy(?:\s+.*)?$/i.test(normalized)) return true;
            if (/^basic\s+\{[grwlpfdm]\}\s+energy(?:\s+.*)?$/i.test(normalized)) return true;

            // Allow common source suffixes, e.g. "Fighting Energy SVE 22"
            return /^(fire|water|grass|lightning|psychic|fighting|darkness|metal|fairy|dragon|colorless)\s+energy(?:\s+.*)?$/i.test(normalized);
        }

        function isRadiantPokemon(cardName) {
            const normalized = normalizeCardName(cardName);
            return /^radiant\s+/.test(normalized);
        }

        function isPrismStarCard(cardName) {
            const raw = String(cardName || '');
            return raw.includes('◇') || /\bprism\s*star\b/i.test(raw);
        }

        function getDeckCopiesForCardName(deckObj, cardName) {
            const target = getSafeCardIdentityName(cardName);
            if (!target) return 0;

            return Object.entries(deckObj || {}).reduce((sum, [key, count]) => {
                const keyMatch = String(key || '').match(/^(.+?)\s+\([A-Z0-9-]+\s+[A-Z0-9-]+\)$/);
                const keyName = getSafeCardIdentityName(keyMatch ? keyMatch[1] : key);
                if (keyName !== target) return sum;
                return sum + (parseInt(count, 10) || 0);
            }, 0);
        }

        function getTotalAceSpecCopiesInDeck(deckObj) {
            return Object.entries(deckObj || {}).reduce((sum, [key, count]) => {
                const keyMatch = String(key || '').match(/^(.+?)\s+\([A-Z0-9-]+\s+[A-Z0-9-]+\)$/);
                const keyName = keyMatch ? keyMatch[1] : key;
                if (!isAceSpec(keyName)) return sum;
                return sum + (parseInt(count, 10) || 0);
            }, 0);
        }

        function getTotalRadiantCopiesInDeck(deckObj) {
            return Object.entries(deckObj || {}).reduce((sum, [key, count]) => {
                const keyMatch = String(key || '').match(/^(.+?)\s+\([A-Z0-9-]+\s+[A-Z0-9-]+\)$/);
                const keyName = keyMatch ? keyMatch[1] : key;
                if (!isRadiantPokemon(keyName)) return sum;
                return sum + (parseInt(count, 10) || 0);
            }, 0);
        }

        function getLegalMaxCopies(cardNameOrCard, fallbackCard = null) {
            const cardLike = (typeof cardNameOrCard === 'string')
                ? (fallbackCard || { card_name: cardNameOrCard, name: cardNameOrCard })
                : (cardNameOrCard || fallbackCard || {});
            const cardName = (typeof cardNameOrCard === 'string')
                ? cardNameOrCard
                : (cardLike.card_name || cardLike.full_card_name || cardLike.name || '');

            if (isBasicEnergyCardEntry(cardLike)) return 59;
            if (isAceSpec(cardLike) || isRadiantPokemon(cardName) || isPrismStarCard(cardName)) return 1;
            return 4;
        }

        function getOpeningHandProbability(copies, deckSize = 60) {
            if (copies <= 0 || deckSize < 7) return 0;
            let pNotDrawing = 1;
            for (let i = 0; i < 7; i++) {
                pNotDrawing *= (deckSize - copies - i) / (deckSize - i);
            }
            if (pNotDrawing < 0 || isNaN(pNotDrawing)) pNotDrawing = 0;
            return ((1 - pNotDrawing) * 100).toFixed(1);
        }

        let averageDisplayMode = (localStorage.getItem('averageDisplayMode') || 'exact').toLowerCase() === 'recommended'
            ? 'recommended'
            : 'exact';

        function formatAverageValueForUi(avgValue) {
            const value = Number(avgValue) || 0;
            if (averageDisplayMode === 'recommended') {
                return String(Math.max(0, Math.round(value))).replace('.', ',');
            }
            return value.toFixed(2).replace('.', ',');
        }

        function getAverageValueSuffix() {
            return averageDisplayMode === 'recommended' ? '(empf.)' : '(exakt)';
        }

        function setAverageDisplayMode(mode) {
            averageDisplayMode = String(mode || '').toLowerCase() === 'recommended' ? 'recommended' : 'exact';
            localStorage.setItem('averageDisplayMode', averageDisplayMode);

            const exactBtn = document.getElementById('avgModeExactBtn');
            const recommendedBtn = document.getElementById('avgModeRecommendedBtn');
            if (exactBtn) {
                exactBtn.classList.toggle('btn-active', averageDisplayMode === 'exact');
                exactBtn.classList.toggle('btn-inactive', averageDisplayMode !== 'exact');
            }
            if (recommendedBtn) {
                recommendedBtn.classList.toggle('btn-active', averageDisplayMode === 'recommended');
                recommendedBtn.classList.toggle('btn-inactive', averageDisplayMode !== 'recommended');
            }

            if (window.currentCityLeagueDeckCards && window.currentCityLeagueDeckCards.length > 0) {
                applyCityLeagueFilter();
            }
            if (window.currentCurrentMetaDeckCards && window.currentCurrentMetaDeckCards.length > 0) {
                filterCurrentMetaCards();
            }
            if (Array.isArray(pastMetaFilteredCards) && pastMetaFilteredCards.length > 0) {
                renderPastMetaCards();
            }
            if (metaCardData.cityLeague.length > 0) renderMetaCards('cityLeague');
            if (metaCardData.currentMeta.length > 0) renderMetaCards('currentMeta');
        }

        function ensureAverageDisplayToggleUi() {
            if (document.getElementById('avgModeToggleBar')) return;

            const host = document.querySelector('.header') || document.body;
            if (!host) return;

            const wrap = document.createElement('div');
            wrap.id = 'avgModeToggleBar';
            wrap.className = 'avg-mode-toggle-bar';
            wrap.innerHTML = `
                <span class="avg-mode-label">Average Anzeige</span>
                <button id="avgModeExactBtn" type="button" class="btn-modern avg-mode-btn" onclick="setAverageDisplayMode('exact')">Exakt (2,60)</button>
                <button id="avgModeRecommendedBtn" type="button" class="btn-modern avg-mode-btn" onclick="setAverageDisplayMode('recommended')">Empfohlen (3)</button>
            `;

            host.appendChild(wrap);
            setAverageDisplayMode(averageDisplayMode);
        }

        function sanitizeDeckDependencies(cardsToAdd) {
            const list = Array.isArray(cardsToAdd) ? cardsToAdd : [];
            if (list.length === 0) return list;

            const hasStage2 = list.some(entry => String(entry?.type || entry?.card_type || '').toLowerCase().includes('stage 2'));
            if (!hasStage2) {
                return list.filter(entry => normalizeCardName(entry.card_name) !== 'rare candy');
            }

            const next = list.map(entry => ({ ...entry }));
            const rareCandy = next.find(entry => normalizeCardName(entry.card_name) === 'rare candy');
            if (rareCandy && Number.isFinite(rareCandy.addCount)) {
                rareCandy.addCount = Math.min(rareCandy.addCount, 3);
            }
            return next;
        }

        // ====================================================================
        // STRICT BASE CARD NAME – Intelligent name normalizer for Combined
        // Variants.  Preserves gameplay-critical suffixes (ex, V, GX, VMAX,
        // VSTAR, V-UNION) so that e.g. "Lucario ex" and "Lucario" are NEVER
        // merged, while different set prints of the same card ARE merged.
        // ====================================================================
        function getStrictBaseCardName(rawName) {
            let name = fixMojibake(String(rawName || '')).trim();
            if (!name) return '';

            // 1. Remove trailing set/number markers: "Lucario ex (PAL 123)" → "Lucario ex"
            name = name
                .replace(/\s*\(([A-Z0-9]{2,6})\s+([A-Z0-9-]{1,8})\)\s*$/i, '')
                .replace(/\s+([A-Z0-9]{2,6})\s+([A-Z0-9-]{1,8})\s*$/i, '')
                .trim();

            // 2. Normalize Unicode curly quotes / apostrophes → straight apostrophe
            name = name.replace(/[\u2018\u2019\u201A\u201B`\u0060]/g, "'");

            // 3. Collapse whitespace
            name = name.replace(/\s+/g, ' ').trim();

            // 4. Lowercase for comparison, but we keep original casing in
            //    the returned value so display labels look nice.
            return name;
        }

        // ====================================================================
        // COMBINED VARIANT STATS – Aggregates multiple set prints of the
        // same logical card into one entry with mathematically correct stats.
        //
        // Parameters:
        //   variants  – array of per-print objects, each MUST have at least:
        //               { card_name, deck_count, total_count, percentage_in_archetype }
        //   totalDecksInArchetype – the denominator for share calculation
        //
        // Returns an object with:
        //   combinedShare        – capped at 100 %
        //   combinedAvgWhenUsed  – capped at legal max copies
        //   recommendedCount     – integer copy count for auto-builder
        //   baseName             – the canonical display name (best variant)
        //   legalMax             – legal max copies for this card
        // ====================================================================
        function calculateCombinedVariantStats(variants, totalDecksInArchetype) {
            if (!Array.isArray(variants) || variants.length === 0) {
                return { combinedShare: 0, combinedAvgWhenUsed: 0, recommendedCount: 0, baseName: '', legalMax: 4 };
            }

            // ------ Determine legal max for this card group ------
            const representative = variants[0];
            const baseName = getStrictBaseCardName(representative.card_name || representative.name || '');
            const legalMax = getLegalMaxCopies(baseName, representative);

            // ------ Step 1: Robust extraction from all variant rows ------
            let totalCopiesInAllDecks = 0;
            let sumOfDecksPlayed = 0;
            let maxDeckCount = 0;

            variants.forEach(v => {
                // Robust CSV column name handling
                let deckCount = parseFloat(String(v.deck_count || v.deckCount || v.deck_inclusion_count || 0).replace(',', '.')) || 0;
                let totalCount = parseFloat(String(v.total_count || v.totalCount || v.total_copies || 0).replace(',', '.')) || 0;
                const avgWhenUsed = parseFloat(String(v.avgCountWhenUsed || v.average_count || v.avg_count || 0).replace(',', '.')) || 0;

                // Fallback: reconstruct totalCount from average if missing
                if (totalCount === 0 && avgWhenUsed > 0 && deckCount > 0) {
                    totalCount = avgWhenUsed * deckCount;
                }

                totalCopiesInAllDecks += totalCount;
                sumOfDecksPlayed += deckCount;
                maxDeckCount = Math.max(maxDeckCount, deckCount);
            });

            // ------ Step 2: Safe denominator ------
            // CRITICAL: If the passed denominator (totalDecksInArchetype) is
            // smaller than the observed deck counts (format-filter mismatch),
            // use the larger value to prevent inflated averages.
            const safeTotalDecks = Math.max(1, totalDecksInArchetype || 1, sumOfDecksPlayed);

            // For Combined Variants: use max(deck_count) as union estimate
            const estimatedUniqueDecks = Math.min(safeTotalDecks, maxDeckCount);

            // ------ Step 3: Combined share ------
            const rawCombinedShare = (estimatedUniqueDecks / safeTotalDecks) * 100;
            const combinedShare = Math.min(100, Math.max(0, rawCombinedShare));

            // ------ Step 4: Average copies when used ------
            const rawAvg = estimatedUniqueDecks > 0 ? totalCopiesInAllDecks / estimatedUniqueDecks : 0;
            const combinedAvgWhenUsed = Math.min(legalMax, Math.max(0, rawAvg));

            // ------ Step 5: Recommended copy count for auto-builder ------
            const recommendedCount = Math.min(legalMax, Math.max(1, Math.round(combinedAvgWhenUsed)));

            return {
                combinedShare: parseFloat(combinedShare.toFixed(1)),
                combinedAvgWhenUsed: parseFloat(combinedAvgWhenUsed.toFixed(2)),
                recommendedCount,
                baseName,
                legalMax
            };
        }

        function safeParseFloat(val, fallback = 0) {
            const n = parseFloat(String(val ?? fallback).replace(',', '.'));
            return Number.isFinite(n) ? n : fallback;
        }

        function getPreferredVersionForCard(cardName, originalSet = null, originalNumber = null) {
            const pref = getRarityPreference(cardName);
            const globalPref = getGlobalRarityPreference();
            const normalizedSet = normalizeSetCode(originalSet);
            const normalizedNumber = normalizeCardNumber(originalNumber);
            const prefSignature = pref ? JSON.stringify(pref) : 'none';
            const cacheKey = `${normalizeCardName(cardName)}|${normalizedSet}|${normalizedNumber}|${globalPref || 'none'}|${prefSignature}`;

            if (preferredVersionCache.has(cacheKey)) {
                return preferredVersionCache.get(cacheKey);
            }
            
            // If originalSet and originalNumber provided, try international prints first
            let versions;
            if (normalizedSet && normalizedNumber) {
                versions = getInternationalPrintsForCard(normalizedSet, normalizedNumber);
                debugVersionSelectionLog(
                    `[getPreferredVersionForCard] International prints for ${cardName} (${normalizedSet} ${normalizedNumber}):`,
                    versions.map(v => `${v.set}-${v.number} (rarity: "${v.rarity || 'NONE'}")`)
                );
                
                // Intelligent fallback: If no international prints OR if international prints has NO rarity data,
                // fall back to all versions (fixes Judge DRI 222 issue while preserving Promo cards)
                const hasSufficientRarity = versions.length > 0 && 
                    versions.some(v => v.rarity && v.rarity.trim() !== '');
                debugVersionSelectionLog(`[getPreferredVersionForCard] hasSufficientRarity for ${cardName}: ${hasSufficientRarity}`);
                
                if (versions.length === 0 || !hasSufficientRarity) {
                    const fallbackReason = versions.length === 0 ? 'no international prints' : 
                        'international prints has no rarity data';
                    versions = getEnglishCardVersions(cardName);
                    debugVersionSelectionLog(`[getPreferredVersionForCard] ${fallbackReason} for ${cardName} (${normalizedSet} ${normalizedNumber}), using ALL ${versions.length} versions`);
                } else {
                    debugVersionSelectionLog(`[getPreferredVersionForCard] Using international prints for ${cardName} (${normalizedSet} ${normalizedNumber})`);
                    // If the original card is from a non-English set, prefer English versions only
                    // This prevents Japanese cards from being selected as the preferred version
                    if (window.englishSetCodes && window.englishSetCodes.size > 0 && 
                        normalizedSet && !window.englishSetCodes.has(normalizedSet)) {
                        const englishVersions = versions.filter(v => window.englishSetCodes.has(v.set));
                        if (englishVersions.length > 0) {
                            versions = englishVersions;
                            debugVersionSelectionLog(`[getPreferredVersionForCard] Filtered to ${versions.length} English versions for non-English original (${normalizedSet})`);
                        } else {
                            // No English int prints found, fall back to English by name
                            versions = getEnglishCardVersions(cardName);
                            debugVersionSelectionLog(`[getPreferredVersionForCard] No English int prints for ${cardName} (${normalizedSet}), falling back to name lookup: ${versions.length} versions`);
                        }
                    }
                }
            } else {
                versions = getEnglishCardVersions(cardName);
            }

            // MERGE: When we resolved via international prints for a specific set/number,
            // also include ALL English versions for this card name so that newer reprints
            // are in the selection pool (e.g. Boss's Orders reprints across sets).
            // SAFETY: This merge is ONLY allowed for Trainer/Energy cards. Pokémon with the
            // same name can have completely different attacks in different sets — merging them
            // by name would corrupt deck building (e.g. turning TEF Drilbur into BLK Drilbur).
            // Pokémon stay strictly bound to the exact prints returned by getInternationalPrintsForCard.
            const _mergeCardType = (versions[0] && versions[0].type) ? versions[0].type.toLowerCase() : '';
            const _isNonPokemon = _mergeCardType.includes('energy') ||
                _mergeCardType.includes('trainer') || _mergeCardType.includes('supporter') ||
                _mergeCardType.includes('item') || _mergeCardType.includes('stadium') || _mergeCardType.includes('tool');

            if (_isNonPokemon && normalizedSet && normalizedNumber && versions.length > 0) {
                const allEnglish = getEnglishCardVersions(cardName);
                if (allEnglish.length > 0) {
                    const seenKeys = new Set(versions.map(v => `${v.set}-${v.number}`));
                    const extras = allEnglish.filter(v => !seenKeys.has(`${v.set}-${v.number}`));
                    if (extras.length > 0) {
                        versions = [...versions, ...extras];
                        debugVersionSelectionLog(`[getPreferredVersionForCard] Merged ${extras.length} additional English reprints for "${cardName}" (pool now ${versions.length})`);
                    }
                }
            } else if (!_isNonPokemon && normalizedSet && normalizedNumber) {
                // Pokémon from promo sets (SVP, MEP, etc.) often have standard set prints
                // that should be selectable. Since all prints of the SAME promo are identical
                // (same attacks/HP), merging by name is safe for cards originating from promo sets.
                const promoSets = ['MEP', 'SVP', 'SP', 'SMP', 'XYP', 'BWP', 'HSP', 'DPP', 'NP', 'WP'];
                if (promoSets.includes(normalizedSet)) {
                    const allEnglish = getEnglishCardVersions(cardName);
                    if (allEnglish.length > 0) {
                        const seenKeys = new Set(versions.map(v => `${v.set}-${v.number}`));
                        const extras = allEnglish.filter(v => !seenKeys.has(`${v.set}-${v.number}`));
                        if (extras.length > 0) {
                            versions = [...versions, ...extras];
                            debugVersionSelectionLog(`[getPreferredVersionForCard] Promo Pokémon "${cardName}" — merged ${extras.length} standard-set reprints (pool now ${versions.length})`);
                        }
                    }
                } else {
                    debugVersionSelectionLog(`[getPreferredVersionForCard] Pokémon "${cardName}" — name-merge suppressed, using strict set/number binding`);
                }
            }
            
            // DEBUG: Log when versions are not found
            if (versions.length === 0) {
                debugVersionSelectionLog(`[getPreferredVersionForCard] No versions found for: "${cardName}"`);
                debugVersionSelectionLog(`[getPreferredVersionForCard] cardsByNameMap has:`, Object.keys(cardsByNameMap).filter(k => k.toLowerCase().includes(cardName.toLowerCase().substring(0, 5))).slice(0, 5));
            }
            
            if (versions.length === 0) {
                preferredVersionCache.set(cacheKey, null);
                return null;
            }

            // SPECIAL HANDLING: Basic Energies should always use SVE prints (17-24)
            if (isBasicEnergy(cardName) && globalPref === 'min') {
                // Map each energy type to its correct SVE number
                const energyToSVENumber = {
                    'Grass Energy': '17',
                    'Fire Energy': '18',
                    'Water Energy': '19',
                    'Lightning Energy': '20',
                    'Psychic Energy': '21',
                    'Fighting Energy': '22',
                    'Darkness Energy': '23',
                    'Metal Energy': '24',
                    'Fairy Energy': '25',  // If exists
                    'Dragon Energy': '26'   // If exists
                };
                
                const correctSVENumber = energyToSVENumber[cardName];
                
                if (correctSVENumber) {
                    // Find the SVE version with the correct number
                    const correctSVEVersion = versions.find(v => 
                        v.set === 'SVE' && v.number === correctSVENumber
                    );
                    
                    if (correctSVEVersion) {
                        debugVersionSelectionLog(`⚡ Basic Energy "${cardName}": Using SVE ${correctSVEVersion.number} ⚡`);
                        preferredVersionCache.set(cacheKey, correctSVEVersion);
                        return correctSVEVersion;
                    }
                }
                
                // Fallback: If specific SVE number not found, use any SVE version
                const sveVersions = versions.filter(v => v.set === 'SVE');
                if (sveVersions.length > 0) {
                    debugVersionSelectionLog(`⚡ Basic Energy "${cardName}": Using fallback SVE ${sveVersions[0].number}`);
                    preferredVersionCache.set(cacheKey, sveVersions[0]);
                    return sveVersions[0];
                }
            }

            // ── Regulation-mark scoring (used by both sort blocks below) ──────────────
            // H (newest SV era 2024-2025) > G (SV 2023-2024) > F (SWSH late) >
            // E (SWSH early) > D (XY era) > C (late BW) > no mark (BW/older)
            const _REG_MARK_SCORE = { 'H': 6, 'G': 5, 'F': 4, 'E': 3, 'D': 2, 'C': 1 };
            const _SET_TO_REG_MARK = {
                // H mark (2024-2025, late Scarlet & Violet)
                'SSP': 'H', 'PRE': 'H', 'SCR': 'H',
                // G mark (2023-2024, Scarlet & Violet)
                'SVI': 'G', 'PAL': 'G', 'OBF': 'G', 'MEW': 'G', 'PAR': 'G',
                'PAF': 'G', 'TEF': 'G', 'TWM': 'G', 'SFA': 'G', 'SVP': 'G',
                // F mark (2022-2023, late Sword & Shield)
                'LOR': 'F', 'SIT': 'F', 'CRZ': 'F', 'ASR': 'F', 'FST': 'F', 'BRS': 'F',
                // E mark (2020-2021, early/mid Sword & Shield)
                'SSH': 'E', 'RCL': 'E', 'DAA': 'E', 'CPA': 'E', 'VIV': 'E',
                'SHF': 'E', 'BST': 'E', 'CRE': 'E', 'EVS': 'E', 'CEL': 'E', 'PGO': 'E',
                // D mark (XY era 2013-2016)
                'XY': 'D', 'FLF': 'D', 'FFI': 'D', 'PHF': 'D', 'PRC': 'D', 'ROS': 'D',
                'AOR': 'D', 'BKT': 'D', 'BKP': 'D', 'FCO': 'D', 'STS': 'D', 'EVO': 'D',
                // C mark (late BW / BW-XY transition)
                'PLB': 'C', 'PLF': 'C', 'BCR': 'C', 'NXD': 'C', 'DEX': 'C', 'LTR': 'C',
                // BW era (BLK, BRS base, etc.) has no entry → score 0
            };
            const _getRegMarkScore = (setCode) => {
                const mark = _SET_TO_REG_MARK[(setCode || '').toUpperCase()];
                return mark ? (_REG_MARK_SCORE[mark] ?? 0) : 0;
            };
            // ─────────────────────────────────────────────────────────────────────────────

            if (globalPref && (globalPref === 'max' || globalPref === 'min')) {
                // Set order loaded from sets.json at startup (higher = newer)
                const SET_ORDER = window.setOrderMap || {};
                
                const sorted = versions.slice().sort((a, b) => {
                    const priorityA = getRarityPriority(a.rarity, a.set);
                    const priorityB = getRarityPriority(b.rarity, b.set);
                    
                    // Primary sort: by rarity priority
                    if (priorityA !== priorityB) {
                        return priorityA - priorityB;
                    }

                    // Secondary sort (same rarity): by SET ORDER (newer sets first)
                    // This ensures we truly pick the latest print among equal low-rarity variants.
                    const setOrderA = SET_ORDER[a.set] || 0;
                    const setOrderB = SET_ORDER[b.set] || 0;
                    if (setOrderA !== setOrderB) {
                        return setOrderB - setOrderA; // Higher number = newer = preferred
                    }
                    
                    // Tertiary sort: regulation mark (H > G > F > E > D > C > no mark)
                    // Ensures modern SV-era reprints (TEF 85) beat old BW-era prints (BLK 45)
                    const regA = _getRegMarkScore(a.set);
                    const regB = _getRegMarkScore(b.set);
                    if (regA !== regB) {
                        return regB - regA; // Higher score = newer mark = preferred
                    }

                    // Quaternary sort (same set): by card number (lower number first)
                    const numA = parseInt((a.number || '0').toString().replace(/[^\d]/g, '')) || 0;
                    const numB = parseInt((b.number || '0').toString().replace(/[^\d]/g, '')) || 0;
                    return numA - numB;
                });
                
                // CRITICAL FIX: Filter out NO RARITY cards (priority 999) before selecting
                // These cards have invalid/missing rarity data and often broken image URLs
                const validSorted = sorted.filter(v => getRarityPriority(v.rarity, v.set) < 999);
                const finalList = validSorted.length > 0 ? validSorted : sorted; // Fallback if all are NO RARITY
                const selected = globalPref === 'max' ? finalList[finalList.length - 1] : finalList[0];
                
                // DEBUG: Log all versions and their priorities
                debugVersionSelectionLog(`[getPreferredVersionForCard] All versions for "${cardName}":`, 
                    versions.map((v, idx) => `${v.set} ${v.number} (${v.rarity || 'NO RARITY'}, regMark: ${_getRegMarkScore(v.set)}, priority: ${getRarityPriority(v.rarity, v.set)}, index: ${idx})`).join(', ')
                );
                debugVersionSelectionLog(`[getPreferredVersionForCard] Sorted order:`, 
                    sorted.map(v => `${v.set} ${v.number} (priority: ${getRarityPriority(v.rarity, v.set)}, regMark: ${_getRegMarkScore(v.set)})`).join(', ')
                );
                debugVersionSelectionLog(`[getPreferredVersionForCard] ${globalPref} rarity for "${cardName}": ${selected.set} ${selected.number} (${selected.rarity}, priority: ${getRarityPriority(selected.rarity, selected.set)})`);
                preferredVersionCache.set(cacheKey, selected);
                return selected;
            }

            // If no global preference (shouldn't happen as default is 'min'), return null
            if (!pref) {
                preferredVersionCache.set(cacheKey, null);
                return null;
            }

            if (pref.mode === 'specific' && pref.set && pref.number) {
                const specificVersion = versions.find(v => v.set === pref.set && v.number === pref.number) || null;
                preferredVersionCache.set(cacheKey, specificVersion);
                return specificVersion;
            }

            if (pref.mode === 'max' || pref.mode === 'min') {
                const SET_ORDER = window.setOrderMap || {};
                const sorted = versions.slice().sort((a, b) => {
                    const priorityA = getRarityPriority(a.rarity, a.set);
                    const priorityB = getRarityPriority(b.rarity, b.set);
                    if (priorityA !== priorityB) return priorityA - priorityB;
                    const setOrderA = SET_ORDER[a.set] || 0;
                    const setOrderB = SET_ORDER[b.set] || 0;
                    if (setOrderA !== setOrderB) return setOrderB - setOrderA;
                    const regA = _getRegMarkScore(a.set);
                    const regB = _getRegMarkScore(b.set);
                    if (regA !== regB) return regB - regA;
                    const numA = parseInt((a.number || '0').toString().replace(/[^\d]/g, '')) || 0;
                    const numB = parseInt((b.number || '0').toString().replace(/[^\d]/g, '')) || 0;
                    return numA - numB;
                });
                
                // CRITICAL FIX: Filter out NO RARITY cards (priority 999) before selecting
                const validSorted = sorted.filter(v => getRarityPriority(v.rarity, v.set) < 999);
                const finalList = validSorted.length > 0 ? validSorted : sorted;
                const selected = pref.mode === 'max' ? finalList[finalList.length - 1] : finalList[0];
                preferredVersionCache.set(cacheKey, selected);
                return selected;
            }

            preferredVersionCache.set(cacheKey, null);
            return null;
        }

        function getRarityPriority(rarity, setCode = '') {
            if (!rarity) {
                // Special handling: Promo sets without rarity should be treated between Low and Mid tier
                // Priority: Low Rarity (1-3) < Mid Rarity (5-9) < Promo (8) < High Rarity (10-16)
                const promoSets = ['MEP', 'SVP', 'SP', 'SMP', 'XYP', 'BWP', 'HSP', 'DPP', 'NP', 'WP'];
                if (setCode && promoSets.includes(setCode)) {
                    return 8; // Between Double Rare (6) and Amazing Rare (9) - Promos are collectible/valuable
                }
                // Cards without rarity data are incomplete/old - deprioritize them
                return 999; // Very high priority = avoid in "min" mode
            }
            const r = rarity.toLowerCase();

            // Low Tier (1-3)
            if (r.includes('uncommon')) return 2;
            if (r.includes('common')) return 1;

            // High-end & secret rarities (check BEFORE plain rare to avoid matching "rare" in all)
            if (r.includes('secret rare')) return 16;
            if (r.includes('rainbow rare')) return 15;
            // SAR is most valuable in modern sets (MEG, TEF, TWM, etc.) - priority 14
            if (r.includes('special art rare') || r.includes('special illustration rare')) return 14;
            if (r.includes('ultra rare')) return 13;

            // Art rarities
            if (r.includes('shiny rare')) return 12; // Shiny Vault cards - below Ultra Rare
            if (r.includes('character super rare')) return 11;
            if (r.includes('character holo rare') || r.includes('art rare') || r.includes('illustration rare')) return 10;

            // Gameplay & Mid rarities
            if (r.includes('amazing rare')) return 9;
            if (r.includes('radiant rare')) return 8;
            if (r.includes('triple rare')) return 7;
            if (r.includes('double rare')) return 6;

            // Mid tier
            if (r.includes('holo rare')) return 5;
            
            // Plain rare (check BEFORE promo as catch-all for rare variants)
            if (r === 'rare' || r.includes('rare')) return 3;
            
            // Promo cards (MEP, SVP, etc.) - treated as collectible/valuable (priority 8)
            // This ensures normal Double Rares (6) are preferred over Promos in "min" mode
            if (r.includes('promo') || r === 'promo') return 8;

            return 0;
        }
        
        // Helper function to convert rarity to abbreviation for image URLs
        function getRarityAbbreviation(rarity) {
            if (!rarity) return 'C'; // Default to Common
            
            const rarityMap = {
                'Common': 'C',
                'Uncommon': 'U',
                'Rare': 'R',
                'Holo Rare': 'R',
                'Double Rare': 'R',
                'Ultra Rare': 'UR',
                'Special Art Rare': 'SAR',
                'Secret Rare': 'SR',
                'Shiny Rare': 'SHR',
                'Art Rare': 'AR',
                'Promo': 'P'
            };
            
            return rarityMap[rarity] || 'R'; // Default to Rare if unknown
        }
        
        // Render generic table
        function renderTable(data, containerId, title) {
            const content = document.getElementById(containerId);
            if (!data || data.length === 0) return;

            const headers = Object.keys(data[0]);
            let html = `<h2>${title}</h2><table><thead><tr>`;

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
            content.innerHTML = html;
        }

        function buildCityLeaguePlacementStatsMap(archetypesData) {
            const placementStatsMap = new Map();
            if (!archetypesData || archetypesData.length === 0) return placementStatsMap;

            archetypesData.forEach(row => {
                const archetype = (row.archetype || '').trim();
                if (!archetype) return;

                if (!placementStatsMap.has(archetype)) {
                    placementStatsMap.set(archetype, {
                        placementSum: 0,
                        placementCount: 0
                    });
                }

                const stats = placementStatsMap.get(archetype);
                const placement = parseInt(row.placement || '0', 10);
                if (!Number.isNaN(placement) && placement > 0) {
                    stats.placementSum += placement;
                    stats.placementCount += 1;
                }
            });

            return placementStatsMap;
        }

        function enrichCityLeagueDataWithPlacementStats(data, placementStatsMap) {
            if (!data || data.length === 0) return [];

            return data.map(row => {
                const archetype = (row.archetype || '').trim();
                const stats = placementStatsMap.get(archetype);
                if (!stats) return row;

                const avgPlacement = stats.placementCount > 0 ? (stats.placementSum / stats.placementCount) : 0;
                const shareValue = row.share || row.percentage_in_archetype || row.new_meta_share || row.new_share || '';

                return {
                    ...row,
                    average_placement: row.average_placement || row.avg_placement || row.new_avg_placement || avgPlacement.toFixed(2).replace('.', ','),
                    avg_placement: row.avg_placement || row.average_placement || row.new_avg_placement || avgPlacement.toFixed(2).replace('.', ','),
                    share: row.share || row.percentage_in_archetype || row.new_meta_share || row.new_share || shareValue,
                    percentage_in_archetype: row.percentage_in_archetype || row.share || row.new_meta_share || row.new_share || shareValue
                };
            });
        }

        // ============================================================================
        // 🔥 META DECK TIER LIST SYSTEM (PokemonMeta.com Style)