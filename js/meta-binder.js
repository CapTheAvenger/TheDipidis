(function () {
    'use strict';

    const META_BINDER_CACHE_KEY = 'metaBinderCacheV1';

    function mbText(key, fallback) {
        if (typeof t === 'function') {
            const translated = t(key);
            if (translated && translated !== key) return translated;
        }
        return fallback;
    }

    function normalizeArchetypeKey(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/\bmega\b/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function tokenizeArchetypeNameForMatch(value) {
        const stopWords = new Set(['ex', 'gx', 'v', 'vmax', 'vstar', 'radiant', 'prism', 'star', 'mega', 'box', 'lead', 'deck']);
        const cleaned = String(value || '')
            .toLowerCase()
            .replace(/['’]s\b/g, '')
            .replace(/[^a-z0-9\s-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        return cleaned
            .split(' ')
            .map(token => token.trim())
            .filter(token => token.length > 1 && !stopWords.has(token));
    }

    function getTopArchetypesFromRows(rows, limit) {
        if (!Array.isArray(rows) || rows.length === 0) return [];

        const archetypeMap = new Map();
        rows.forEach(row => {
            const archetypeName = String(row.archetype || row.deck_name || '').trim();
            if (!archetypeName) return;

            const key = normalizeArchetypeKey(archetypeName);
            const rowCount = parseInt(row.total_decks_in_archetype || row.new_count || 0, 10) || 0;
            const current = archetypeMap.get(key);

            if (!current) {
                archetypeMap.set(key, {
                    name: archetypeName,
                    deckCount: rowCount,
                    rowCount: 1
                });
            } else {
                current.deckCount = Math.max(current.deckCount, rowCount);
                current.rowCount += 1;
            }
        });

        return Array.from(archetypeMap.values())
            .map(entry => ({
                name: entry.name,
                score: entry.deckCount > 0 ? entry.deckCount : entry.rowCount
            }))
            .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                return a.name.localeCompare(b.name);
            })
            .slice(0, limit)
            .map(entry => entry.name);
    }

    async function getTopCurrentMetaArchetypes(limit) {
        const comparisonRows = await loadCSV('limitless_online_decks_comparison.csv').catch(() => []);
        if (Array.isArray(comparisonRows) && comparisonRows.length > 0) {
            const exactMap = new Map();
            comparisonRows.forEach(row => {
                const name = String(row.deck_name || '').trim();
                if (!name) return;
                const rank = parseInt(String(row.new_rank || '').trim(), 10);
                const share = Number.parseFloat(String(row.new_share || '').replace(',', '.'));
                exactMap.set(name.toLowerCase(), {
                    rank: Number.isFinite(rank) ? rank : null,
                    share: Number.isFinite(share) ? share : null
                });
            });
            window._metaBinderCurrentMetaExactMap = exactMap;

            const ranked = comparisonRows
                .map(row => ({
                    name: String(row.deck_name || '').trim(),
                    rank: parseInt(String(row.new_rank || '').trim(), 10),
                    count: parseInt(String(row.new_count || '').trim(), 10) || 0
                }))
                .filter(item => item.name)
                .sort((a, b) => {
                    const rankA = Number.isFinite(a.rank) ? a.rank : 9999;
                    const rankB = Number.isFinite(b.rank) ? b.rank : 9999;
                    if (rankA !== rankB) return rankA - rankB;
                    if (b.count !== a.count) return b.count - a.count;
                    return a.name.localeCompare(b.name);
                });

            const deduped = [];
            const seen = new Set();
            ranked.forEach(item => {
                const key = normalizeArchetypeKey(item.name);
                if (seen.has(key)) return;
                seen.add(key);
                deduped.push(item.name);
            });

            if (deduped.length > 0) return deduped.slice(0, limit);
        }

        const currentMetaRows = Array.isArray(window.currentMetaAnalysisData) ? window.currentMetaAnalysisData : [];
        const currentMetaLiveRows = currentMetaRows.filter(row => String(row.meta || '').trim().toLowerCase() === 'meta live');
        return getTopArchetypesFromRows(currentMetaLiveRows.length > 0 ? currentMetaLiveRows : currentMetaRows, limit);
    }

    async function getTopCityArchetypes(comparisonFile, fallbackRows, limit) {
        const comparisonRows = await loadCSV(comparisonFile).catch(() => []);
        if (Array.isArray(comparisonRows) && comparisonRows.length > 0) {
            const ranked = comparisonRows
                .map(row => ({
                    name: String(row.archetype || row.deck_name || '').trim(),
                    rank: parseInt(String(row.new_rank || '').trim(), 10),
                    count: parseInt(String(row.new_count || row.total_decks || row.count || 0).trim(), 10) || 0
                }))
                .filter(item => item.name)
                .sort((a, b) => {
                    const rankA = Number.isFinite(a.rank) ? a.rank : Number.MAX_SAFE_INTEGER;
                    const rankB = Number.isFinite(b.rank) ? b.rank : Number.MAX_SAFE_INTEGER;
                    if (rankA !== rankB) return rankA - rankB;
                    if (b.count !== a.count) return b.count - a.count;
                    return a.name.localeCompare(b.name);
                });

            const deduped = [];
            const seen = new Set();
            ranked.forEach(item => {
                const key = normalizeArchetypeKey(item.name);
                if (seen.has(key)) return;
                seen.add(key);
                deduped.push(item.name);
            });

            if (deduped.length > 0) return deduped.slice(0, limit);
        }

        return getTopArchetypesFromRows(fallbackRows, limit);
    }

    function getCurrentMetaFormatLabelFromRows(rows) {
        const setOrderMap = window.setOrderMap || {};
        const mappedCodes = (Array.isArray(rows) ? rows : []).map(row => {
            const rawSet = String(row.set_code || row.set || '').trim();
            if (!rawSet) return '';
            if (typeof mapSetCodeToMetaFormat === 'function') {
                return String(mapSetCodeToMetaFormat(rawSet) || rawSet).trim();
            }
            return rawSet;
        }).filter(Boolean);

        if (mappedCodes.length === 0) return 'TEF-POR';

        const uniqueCodes = [...new Set(mappedCodes)];
        uniqueCodes.sort((a, b) => {
            const [prefixA, suffixA] = String(a).split('-');
            const [prefixB, suffixB] = String(b).split('-');
            const orderA = setOrderMap[suffixA] || setOrderMap[prefixA] || 0;
            const orderB = setOrderMap[suffixB] || setOrderMap[prefixB] || 0;
            if (orderA !== orderB) return orderB - orderA;
            return String(a).localeCompare(String(b));
        });

        return uniqueCodes[0] || 'TEF-POR';
    }

    function getCardsForArchetypeSource(archetype, sourceKey) {
        const wanted = normalizeArchetypeKey(archetype);
        if (!wanted) return [];

        const sourceMap = {
            'current-meta': window.currentMetaAnalysisData,
            'city-current': window.cityLeagueAnalysisDataCurrent || window.cityLeagueAnalysisData,
            'city-past': window.cityLeagueAnalysisDataPast || window.cityLeagueAnalysisM3Data || []
        };

        const rows = sourceMap[sourceKey];
        if (!Array.isArray(rows) || rows.length === 0) return [];
        const exactRows = rows.filter(row => normalizeArchetypeKey(row.archetype) === wanted);
        if (exactRows.length > 0) return exactRows;

        // Fuzzy fallback for naming drifts across sources (e.g. "N's Zoroark" vs "Zoroark", "Rocket's Mewtwo" vs "Rocket Mewtwo Ex").
        const targetTokens = tokenizeArchetypeNameForMatch(archetype);
        if (targetTokens.length === 0) return [];

        const uniqueNames = [...new Set(rows.map(row => String(row.archetype || '').trim()).filter(Boolean))];
        let bestName = '';
        let bestScore = -1;

        uniqueNames.forEach(name => {
            const candidateTokens = tokenizeArchetypeNameForMatch(name);
            if (candidateTokens.length === 0) return;

            const overlap = targetTokens.filter(token => candidateTokens.includes(token)).length;
            if (overlap === 0) return;

            const missing = targetTokens.length - overlap;
            const extras = candidateTokens.length - overlap;
            const score = (overlap * 100) - (missing * 10) - extras;

            if (score > bestScore) {
                bestScore = score;
                bestName = name;
            }
        });

        if (!bestName) return [];
        return rows.filter(row => String(row.archetype || '').trim() === bestName);
    }

    function resolveCityLeagueDisplayPrint(name, set, number) {
        const rawName = String(name || '').trim();
        const rawSet = String(set || '').trim();
        const rawNumber = String(number || '').trim();

        if (typeof getPreferredVersionForCard === 'function') {
            const preferred = getPreferredVersionForCard(rawName, rawSet, rawNumber);
            if (preferred && preferred.set && preferred.number) {
                return {
                    name: String(preferred.name || preferred.name_en || rawName).trim(),
                    set: String(preferred.set).trim(),
                    number: String(preferred.number).trim()
                };
            }
        }

        // Legacy fallback for JP-only set codes (M3/M4/etc): pick any non-M* EN print by name.
        if (/^M\d+$/i.test(rawSet) && Array.isArray(window.allCardsDatabase)) {
            const normalizedTarget = rawName.toLowerCase();
            const candidates = window.allCardsDatabase.filter(card =>
                String(card.name || '').trim().toLowerCase() === normalizedTarget &&
                !/^M\d+$/i.test(String(card.set || '').trim())
            );

            if (candidates.length > 0) {
                const setOrder = window.setOrderMap || {};
                const best = candidates.slice().sort((a, b) => {
                    const orderA = setOrder[a.set] || 0;
                    const orderB = setOrder[b.set] || 0;
                    if (orderA !== orderB) return orderB - orderA;
                    return String(a.number || '').localeCompare(String(b.number || ''));
                })[0];

                return {
                    name: String(best.name || rawName).trim(),
                    set: String(best.set || rawSet).trim(),
                    number: String(best.number || rawNumber).trim()
                };
            }
        }

        return { name: rawName, set: rawSet, number: rawNumber };
    }

    // ── Build canonical cardId matching collection format ──
    function buildCardId(name, set, number) {
        return `${String(name || '').trim()}|${String(set || '').trim()}|${String(number || '').trim()}`;
    }

    function normalizeIntlPrintRef(set, number) {
        return `${String(set || '').trim().toUpperCase()}-${String(number || '').trim().toUpperCase()}`;
    }

    function parseIntlPrintRef(ref) {
        const raw = String(ref || '').trim();
        if (!raw.includes('-')) return { set: '', number: '' };
        const idx = raw.indexOf('-');
        return {
            set: raw.slice(0, idx).trim(),
            number: raw.slice(idx + 1).trim()
        };
    }

    function getIntlFamilyInfo(name, set, number) {
        const refs = [];
        const cards = [];
        const setOrderMap = window.setOrderMap || {};
        const normSet = String(set || '').trim();
        const normNumber = String(number || '').trim();

        if (typeof getInternationalPrintsForCard === 'function') {
            const intlCards = getInternationalPrintsForCard(normSet, normNumber) || [];
            intlCards.forEach(card => {
                const cSet = String(card?.set || '').trim();
                const cNumber = String(card?.number || '').trim();
                if (!cSet || !cNumber) return;
                refs.push(normalizeIntlPrintRef(cSet, cNumber));
                cards.push(card);
            });
        }

        if (refs.length === 0) {
            refs.push(normalizeIntlPrintRef(normSet, normNumber));
        }

        const uniqueRefs = [...new Set(refs)].filter(ref => ref !== '-');
        uniqueRefs.sort((a, b) => {
            const pa = parseIntlPrintRef(a);
            const pb = parseIntlPrintRef(b);
            const oa = setOrderMap[pa.set] || setOrderMap[String(pa.set || '').toLowerCase()] || 0;
            const ob = setOrderMap[pb.set] || setOrderMap[String(pb.set || '').toLowerCase()] || 0;
            if (oa !== ob) return ob - oa;
            return String(pb.number || '').localeCompare(String(pa.number || ''));
        });

        const getRarityTier = (rarityValue) => {
            const r = String(rarityValue || '').toLowerCase().trim();

            // Empty rarity values are typically normal playable deck prints and must
            // never lose against ultra/secret variants.
            if (!r) return 4;

            // Order matters: "uncommon" must be checked before "common" because of includes().
            if (r.includes('uncommon')) return 2;
            if (r.includes('common')) return 1;

            if (r.includes('promo')) return 4;

            // Low / regular rare tiers
            if (r === 'rare' || r.includes('holo rare') || r.includes('reverse holo')) return 5;

            // Mid-tier competitive shiny prints / mainline ex/v prints
            if (
                r.includes('double rare') ||
                r === 'ex' ||
                r === 'v' ||
                r.includes(' ex') ||
                r.includes(' v') ||
                r === 'dr'
            ) return 10;

            // Upper-mid decorative but not top-end tiers
            if (
                r.includes('radiant') ||
                r.includes('amazing rare') ||
                r === 'ar' ||
                r.includes(' art rare')
            ) return 14;

            // High rarity / premium prints
            if (
                r.includes('illustration rare') ||
                r.includes('special illustration rare') ||
                r.includes('special illustration') ||
                r.includes('special art rare') ||
                r.includes('special art') ||
                r.includes('ultra rare') ||
                r.includes('hyper rare') ||
                r.includes('secret rare') ||
                r.includes('secret') ||
                r.includes('shiny') ||
                r === 'sr' ||
                r === 'ur' ||
                r === 'sar' ||
                r === 'chr' ||
                r === 'csr'
            ) return 20;

            // Unknown strings stay in a medium tier so they do not outrank low-rarity deck prints.
            return 9;
        };

        const familyCards = uniqueRefs
            .map(ref => {
                const parsed = parseIntlPrintRef(ref);
                const fromIntl = cards.find(card => normalizeIntlPrintRef(card?.set, card?.number) === ref);
                const record = fromIntl || findCardRecord(name, parsed.set, parsed.number);
                if (!record) return null;
                return {
                    card: record,
                    set: String(record.set || parsed.set || '').trim(),
                    number: String(record.number || parsed.number || '').trim(),
                    ref,
                    rarityTier: getRarityTier(record.rarity)
                };
            })
            .filter(Boolean);

        let selected = null;
        if (familyCards.length > 0) {
            const minTier = Math.min(...familyCards.map(item => item.rarityTier));
            selected = familyCards
                .filter(item => item.rarityTier === minTier)
                .sort((a, b) => {
                    const oa = setOrderMap[a.set] || setOrderMap[String(a.set || '').toLowerCase()] || 0;
                    const ob = setOrderMap[b.set] || setOrderMap[String(b.set || '').toLowerCase()] || 0;
                    if (oa !== ob) return ob - oa;
                    return String(a.number || '').localeCompare(String(b.number || ''));
                })[0];
        }

        const newestRef = selected ? selected.ref : (uniqueRefs[0] || normalizeIntlPrintRef(normSet, normNumber));
        const newest = parseIntlPrintRef(newestRef);
        const newestCard = selected ? selected.card : (cards.find(card =>
            normalizeIntlPrintRef(card?.set, card?.number) === newestRef
        ) || findCardRecord(name, newest.set, newest.number));

        return {
            refs: uniqueRefs,
            signature: uniqueRefs.join('|'),
            newestSet: newest.set || normSet,
            newestNumber: newest.number || normNumber,
            newestName: String(newestCard?.name || newestCard?.name_en || name || '').trim() || String(name || '').trim()
        };
    }

    // ── Core: collect max card counts across all target decks ──
    function collectBinderCards(targetArchetypes) {
        const thresholdPercent = 70;
        const intlFamilyCache = new Map();
        const setOrderMap = window.setOrderMap || {};

        function getGroupingRarityTier(rarityValue) {
            const r = String(rarityValue || '').toLowerCase().trim();
            if (!r) return 4;
            if (r.includes('uncommon')) return 2;
            if (r.includes('common')) return 1;
            if (r.includes('promo')) return 4;
            if (r === 'rare' || r.includes('holo rare') || r.includes('reverse holo')) return 5;
            if (
                r.includes('double rare') ||
                r === 'ex' ||
                r === 'v' ||
                r.includes(' ex') ||
                r.includes(' v') ||
                r === 'dr'
            ) return 10;
            if (
                r.includes('radiant') ||
                r.includes('amazing rare') ||
                r === 'ar' ||
                r.includes(' art rare')
            ) return 14;
            if (
                r.includes('illustration rare') ||
                r.includes('special illustration rare') ||
                r.includes('special illustration') ||
                r.includes('special art rare') ||
                r.includes('special art') ||
                r.includes('ultra rare') ||
                r.includes('hyper rare') ||
                r.includes('secret rare') ||
                r.includes('secret') ||
                r.includes('shiny') ||
                r === 'sr' ||
                r === 'ur' ||
                r === 'sar' ||
                r === 'chr' ||
                r === 'csr'
            ) return 20;
            return 9;
        }

        function getSetRecencyValue(setCode) {
            const code = String(setCode || '').trim();
            return setOrderMap[code] || setOrderMap[code.toLowerCase()] || 0;
        }

        function shouldPreferCandidatePrint(currentEntry, candidateEntry) {
            const currentTier = getGroupingRarityTier(currentEntry?.rarity);
            const candidateTier = getGroupingRarityTier(candidateEntry?.rarity);
            if (candidateTier !== currentTier) return candidateTier < currentTier;

            const currentSetOrder = getSetRecencyValue(currentEntry?.set);
            const candidateSetOrder = getSetRecencyValue(candidateEntry?.set);
            if (candidateSetOrder !== currentSetOrder) return candidateSetOrder > currentSetOrder;

            const currentNumber = parseCardNumberForSort(currentEntry?.number);
            const candidateNumber = parseCardNumberForSort(candidateEntry?.number);
            return candidateNumber < currentNumber;
        }

        function getCachedIntlFamilyInfo(name, set, number) {
            const key = `${String(name || '').trim()}|${String(set || '').trim()}|${String(number || '').trim()}`;
            if (intlFamilyCache.has(key)) return intlFamilyCache.get(key);
            const family = getIntlFamilyInfo(name, set, number);
            intlFamilyCache.set(key, family);
            return family;
        }

        function parseUsagePercent(row) {
            const inclusion = Number.parseFloat(String(row.deck_inclusion_count || '').replace(',', '.'));
            const total = Number.parseFloat(String(row.total_decks_in_archetype || '').replace(',', '.'));
            if (!Number.isNaN(inclusion) && !Number.isNaN(total) && total > 0) {
                return (inclusion / total) * 100;
            }

            const direct = String(row.percentage_in_archetype || row.usage_rate || row.usageRate || '').trim();
            if (direct) {
                const directNum = Number.parseFloat(direct.replace('%', '').replace(',', '.'));
                if (!Number.isNaN(directNum)) {
                    // CSV stores percentage already on 0..100 scale (including values like 0.95%).
                    return directNum;
                }
            }

            return 0;
        }

        function isAceSpecRow(row) {
            const rarity = String(row.rarity || '').toLowerCase();
            const group = String(row.group || '').toLowerCase();
            const flag = String(row.is_ace_spec || '').toLowerCase();
            return rarity.includes('ace spec') || group.includes('ace spec') || flag === 'yes' || flag === 'true';
        }

        // Map<cardId, { name, set, number, maxCount, decks: string[] }>
        const binderMap = new Map();

        targetArchetypes.forEach(target => {
            const archetype = String(target && target.name ? target.name : target || '').trim();
            const sourceKey = String(target && target.source ? target.source : 'current-meta');
            if (!archetype) return;

            const rows = getCardsForArchetypeSource(archetype, sourceKey);
            // Deduplicate by card_name within this archetype (take highest max_count)
            const deckCardMap = new Map();
            rows.forEach(row => {
                const rawName = String(row.card_name || row.full_card_name || '').trim();
                const rawSet = String(row.set_code || row.set || '').trim();
                const rawNumber = String(row.set_number || row.number || '').trim();
                const resolved = sourceKey.startsWith('city-')
                    ? resolveCityLeagueDisplayPrint(rawName, rawSet, rawNumber)
                    : { name: rawName, set: rawSet, number: rawNumber };
                const name = resolved.name;
                const set = resolved.set;
                const number = resolved.number;
                if (!name) return;

                const isAceSpec = isAceSpecRow(row);
                const usagePercent = parseUsagePercent(row);
                if (!isAceSpec && usagePercent < thresholdPercent) return;

                const family = getCachedIntlFamilyInfo(name, set, number);
                const isPokemon = isPokemonTypeString(String(row.type || ''));
                const key = isPokemon
                    ? (family.signature || `${name}|${set}|${number}`)
                    : name.toLowerCase();
                const count = parseInt(row.max_count || row.count || 0, 10);
                const existing = deckCardMap.get(key);
                const candidateEntry = {
                    name: family.newestName || name,
                    set: family.newestSet || set,
                    number: family.newestNumber || number,
                    count,
                    familyRefs: family.refs,
                    type: String(row.type || '').trim(),
                    rarity: String(row.rarity || '').trim(),
                    isAceSpec,
                    isPokemon
                };

                if (!existing) {
                    deckCardMap.set(key, candidateEntry);
                    return;
                }

                existing.count = Math.max(existing.count, count);
                existing.isAceSpec = existing.isAceSpec || isAceSpec;
                if (!existing.type && candidateEntry.type) existing.type = candidateEntry.type;
                if (!existing.familyRefs?.length && candidateEntry.familyRefs?.length) existing.familyRefs = candidateEntry.familyRefs;

                if (shouldPreferCandidatePrint(existing, candidateEntry)) {
                    existing.name = candidateEntry.name;
                    existing.set = candidateEntry.set;
                    existing.number = candidateEntry.number;
                    existing.rarity = candidateEntry.rarity;
                } else if (!existing.rarity && candidateEntry.rarity) {
                    existing.rarity = candidateEntry.rarity;
                }
            });

            deckCardMap.forEach(({ name, set, number, count, familyRefs, type, rarity, isAceSpec, isPokemon }, key) => {
                const familyKey = `intl:${key}`;
                const entry = binderMap.get(familyKey);
                if (entry) {
                    entry.maxCount = Math.max(entry.maxCount, count);
                    if (!entry.decks.includes(archetype)) entry.decks.push(archetype);
                    if (!entry.type && type) entry.type = type;
                    if (shouldPreferCandidatePrint(entry, { set, number, rarity })) {
                        entry.name = name;
                        entry.set = set;
                        entry.number = number;
                        entry.rarity = rarity;
                    } else if (!entry.rarity && rarity) {
                        entry.rarity = rarity;
                    }
                    entry.isAceSpec = entry.isAceSpec || isAceSpec;
                    if (!entry.familyRefs?.length && Array.isArray(familyRefs)) entry.familyRefs = familyRefs;
                } else {
                    binderMap.set(familyKey, {
                        name, set, number,
                        familyRefs: Array.isArray(familyRefs) ? familyRefs : [],
                        maxCount: count,
                        decks: [archetype],
                        type,
                        rarity,
                        isAceSpec,
                        isPokemon
                    });
                }
            });
        });

        return binderMap;
    }

    // ── Delta: compare with collection and cached previous binder ──
    function computeDelta(binderMap) {
        const collectionCounts = window.userCollectionCounts || new Map();
        const ownedByPrintRef = new Map();

        collectionCounts.forEach((qty, collKey) => {
            const ownedQty = parseInt(qty, 10) || 0;
            if (ownedQty <= 0) return;
            const parts = String(collKey || '').split('|');
            if (parts.length < 3) return;
            const ref = normalizeIntlPrintRef(parts[1], parts[2]);
            if (!ref || ref === '-') return;
            ownedByPrintRef.set(ref, (ownedByPrintRef.get(ref) || 0) + ownedQty);
        });

        function countOwnedIntlRefs(refs) {
            if (!Array.isArray(refs) || refs.length === 0) return 0;
            let total = 0;
            refs.forEach(ref => {
                const parsed = parseIntlPrintRef(ref);
                const normalized = normalizeIntlPrintRef(parsed.set, parsed.number);
                if (!normalized || normalized === '-') return;
                total += ownedByPrintRef.get(normalized) || 0;
            });
            return total;
        }

        // Load previous binder from cache
        let previousIds = new Set();
        try {
            const cached = JSON.parse(localStorage.getItem(META_BINDER_CACHE_KEY) || '[]');
            previousIds = new Set(cached);
        } catch (_) { /* ignore */ }

        const results = [];
        binderMap.forEach((entry, cardId) => {
            const exactCardId = buildCardId(entry.name, entry.set, entry.number);
            const ownedExact = collectionCounts.get(exactCardId) || 0;
            const ownedIntlTotal = countOwnedIntlRefs(entry.familyRefs);
            const needed = entry.maxCount;
            const effectiveOwned = ownedIntlTotal;
            const missing = Math.max(0, needed - effectiveOwned);
            const wasInPrevious = previousIds.has(cardId);
            const ownershipMode = ownedExact >= needed
                ? 'exact'
                : (ownedIntlTotal >= needed ? 'intl-complete' : 'missing');
            results.push({
                cardId,
                name: entry.name,
                set: entry.set,
                number: entry.number,
                maxCount: needed,
                owned: effectiveOwned,
                ownedExact,
                ownedIntlTotal,
                missing,
                ownershipMode,
                isNew: !wasInPrevious,
                decks: entry.decks,
                type: entry.type,
                rarity: entry.rarity,
                isAceSpec: !!entry.isAceSpec
            });
        });

        // Cards that were in the previous binder but no longer needed
        const currentIds = new Set(binderMap.keys());
        const droppedCards = [];
        previousIds.forEach(oldId => {
            if (!currentIds.has(oldId)) {
                const [name, set, number] = oldId.split('|');
                droppedCards.push({ cardId: oldId, name: name || oldId, set: set || '', number: number || '' });
            }
        });

        // Save current binder as new cache
        localStorage.setItem(META_BINDER_CACHE_KEY, JSON.stringify(Array.from(binderMap.keys())));

        return { cards: results, droppedCards };
    }

    function parseLocaleNumber(value) {
        const parsed = Number.parseFloat(String(value || '').replace(',', '.'));
        return Number.isFinite(parsed) ? parsed : null;
    }

    function normalizeMainPokemonName(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/\b(ex|gx|vmax|vstar|v|radiant|prism star)\b/g, '')
            .replace(/[^a-z0-9\s-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function tokenizeArchetypeMatch(value) {
        const stopWords = new Set(['ex', 'gx', 'v', 'vmax', 'vstar', 'radiant', 'prism', 'star', 'mega', 'box', 'lead', 'deck']);
        return normalizeMainPokemonName(value)
            .split(' ')
            .map(token => token.trim())
            .filter(token => token.length > 1 && !stopWords.has(token));
    }

    function getPrimaryArchetypeToken(value) {
        const tokens = tokenizeArchetypeMatch(value).filter(token => token.length >= 3);
        return tokens.length > 0 ? tokens[0] : '';
    }

    async function loadMetaBinderArchetypeMetricMaps() {
        const [currentCmp, cityCurrentCmp, cityPastCmp] = await Promise.all([
            loadCSV('limitless_online_decks_comparison.csv').catch(() => []),
            loadCSV('city_league_archetypes_comparison.csv').catch(() => []),
            loadCSV('city_league_archetypes_comparison_M3.csv').catch(() => [])
        ]);

        const currentMetaMap = new Map();
        (Array.isArray(currentCmp) ? currentCmp : []).forEach(row => {
            const name = String(row.deck_name || '').trim();
            if (!name) return;
            const key = normalizeArchetypeKey(name);
            const rank = parseLocaleNumber(row.new_rank);
            const share = parseLocaleNumber(row.new_share);
            const existing = currentMetaMap.get(key);
            if (!existing) {
                currentMetaMap.set(key, { rank, share });
                return;
            }

            const existingRank = Number.isFinite(existing.rank) ? existing.rank : Number.MAX_SAFE_INTEGER;
            const nextRank = Number.isFinite(rank) ? rank : Number.MAX_SAFE_INTEGER;
            if (nextRank < existingRank) {
                currentMetaMap.set(key, { rank, share });
            }
        });

        const cityCurrentMap = new Map();
        (Array.isArray(cityCurrentCmp) ? cityCurrentCmp : []).forEach(row => {
            const name = String(row.archetype || '').trim();
            if (!name) return;
            const key = normalizeArchetypeKey(name);
            const next = parseLocaleNumber(row.new_avg_placement);
            const existing = cityCurrentMap.get(key);
            if (!Number.isFinite(existing) || (Number.isFinite(next) && next < existing)) {
                cityCurrentMap.set(key, next);
            }
        });

        const cityPastMap = new Map();
        (Array.isArray(cityPastCmp) ? cityPastCmp : []).forEach(row => {
            const name = String(row.archetype || '').trim();
            if (!name) return;
            const key = normalizeArchetypeKey(name);
            const next = parseLocaleNumber(row.new_avg_placement);
            const existing = cityPastMap.get(key);
            if (!Number.isFinite(existing) || (Number.isFinite(next) && next < existing)) {
                cityPastMap.set(key, next);
            }
        });

        return { currentMetaMap, cityCurrentMap, cityPastMap };
    }

    function pickArchetypeBannerImage(archetypeName, sourceKey) {
        const rows = getCardsForArchetypeSource(archetypeName, sourceKey);
        if (!Array.isArray(rows) || rows.length === 0) return '';

        const scoredRows = rows.slice().sort((a, b) => {
            const aPct = parseLocaleNumber(a.percentage_in_archetype) || 0;
            const bPct = parseLocaleNumber(b.percentage_in_archetype) || 0;
            const aCount = parseInt(String(a.max_count || a.count || 0), 10) || 0;
            const bCount = parseInt(String(b.max_count || b.count || 0), 10) || 0;

            // Main Pokemon tends to have both high copy count and high usage.
            if (bCount !== aCount) return bCount - aCount;
            return bPct - aPct;
        });

        const pokemonRows = scoredRows.filter(row => {
            if (isPokemonTypeString(row.type)) return true;

            const rawName = String(row.card_name || row.full_card_name || '').trim();
            const rawSet = String(row.set_code || row.set || '').trim();
            const rawNumber = String(row.set_number || row.number || '').trim();
            const resolved = sourceKey.startsWith('city-')
                ? resolveCityLeagueDisplayPrint(rawName, rawSet, rawNumber)
                : { name: rawName, set: rawSet, number: rawNumber };
            const cardDb = findCardRecord(resolved.name, resolved.set, resolved.number);
            return !!(cardDb && String(cardDb.supertype || '').toLowerCase() === 'pokemon');
        });

        const archetypeNorm = normalizeMainPokemonName(archetypeName);
        const archetypeTokens = tokenizeArchetypeMatch(archetypeName);
        const primaryToken = getPrimaryArchetypeToken(archetypeName);
        const matchedPokemonRows = pokemonRows.filter(row => {
            const cardName = String(row.card_name || row.full_card_name || '').trim();
            const cardNorm = normalizeMainPokemonName(cardName);
            return cardNorm && archetypeNorm.includes(cardNorm);
        });

        const primaryPokemonRows = pokemonRows
            .map(row => {
                const cardName = String(row.card_name || row.full_card_name || '').trim();
                const cardNorm = normalizeMainPokemonName(cardName);
                const hasPrimary = !!(primaryToken && cardNorm.includes(primaryToken));
                const count = parseInt(String(row.max_count || row.count || 0), 10) || 0;
                const usage = parseLocaleNumber(row.percentage_in_archetype) || 0;
                return { row, hasPrimary, count, usage };
            })
            .filter(item => item.hasPrimary)
            .sort((a, b) => {
                if (a.count !== b.count) return b.count - a.count;
                return b.usage - a.usage;
            });

        const matchedRows = scoredRows
            .map(row => {
                const cardName = String(row.card_name || row.full_card_name || '').trim();
                const cardNorm = normalizeMainPokemonName(cardName);
                const cardTokens = tokenizeArchetypeMatch(cardName);
                const overlap = cardTokens.filter(token => archetypeTokens.includes(token)).length;
                const directMatch = !!(cardNorm && (archetypeNorm.includes(cardNorm) || cardNorm.includes(archetypeNorm)));
                const count = parseInt(String(row.max_count || row.count || 0), 10) || 0;
                const usage = parseLocaleNumber(row.percentage_in_archetype) || 0;
                return {
                    row,
                    overlap,
                    directMatch,
                    count,
                    usage,
                    isPokemon: isPokemonTypeString(row.type)
                };
            })
            .sort((a, b) => {
                if (a.directMatch !== b.directMatch) return a.directMatch ? -1 : 1;
                if (a.overlap !== b.overlap) return b.overlap - a.overlap;
                if (a.count !== b.count) return b.count - a.count;
                if (a.usage !== b.usage) return b.usage - a.usage;
                if (a.isPokemon !== b.isPokemon) return a.isPokemon ? -1 : 1;
                return 0;
            });

        // Prefer explicit deck-name/card-name match (e.g. N's Zoroark ex, Festival Grounds).
        const matchedBest = matchedRows.find(entry => entry.directMatch || entry.overlap > 0);

        // Fallback chain: best lexical match -> pokemon name match -> strongest pokemon -> strongest row.
        const pickedRow = (primaryPokemonRows[0] && primaryPokemonRows[0].row)
            || (matchedBest && matchedBest.row)
            || matchedPokemonRows[0]
            || pokemonRows[0]
            || scoredRows[0];

        if (!pickedRow) return '';

        const rawName = String(pickedRow.card_name || pickedRow.full_card_name || '').trim();
        const rawSet = String(pickedRow.set_code || pickedRow.set || '').trim();
        const rawNumber = String(pickedRow.set_number || pickedRow.number || '').trim();
        const resolved = sourceKey.startsWith('city-')
            ? resolveCityLeagueDisplayPrint(rawName, rawSet, rawNumber)
            : { name: rawName, set: rawSet, number: rawNumber };

        return findCardImage(resolved.name, resolved.set, resolved.number) || '';
    }

    function buildMetaBinderArchetypeGroups(groupDefs, metricMaps) {
        return groupDefs.map(group => ({
            title: group.title,
            source: group.source,
            items: group.names.map(name => {
                const key = normalizeArchetypeKey(name);
                const exactKey = String(name || '').trim().toLowerCase();
                const exactMetaMap = window._metaBinderCurrentMetaExactMap instanceof Map
                    ? window._metaBinderCurrentMetaExactMap
                    : null;
                const exactMeta = exactMetaMap ? exactMetaMap.get(exactKey) : null;
                const currentMeta = metricMaps.currentMetaMap.get(key) || {};
                const useExactOnly = group.source === 'current-meta';
                return {
                    name,
                    source: group.source,
                    imageUrl: pickArchetypeBannerImage(name, group.source),
                    currentMetaFormatLabel: window._metaBinderCurrentMetaLabel || 'TEF-POR',
                    currentMetaRank: useExactOnly
                        ? (Number.isFinite(exactMeta?.rank) ? exactMeta.rank : null)
                        : (Number.isFinite(exactMeta?.rank) ? exactMeta.rank : (Number.isFinite(currentMeta.rank) ? currentMeta.rank : null)),
                    currentMetaShare: useExactOnly
                        ? (Number.isFinite(exactMeta?.share) ? exactMeta.share : null)
                        : (Number.isFinite(exactMeta?.share) ? exactMeta.share : (Number.isFinite(currentMeta.share) ? currentMeta.share : null)),
                    cityCurrentAvgRank: metricMaps.cityCurrentMap.get(key) ?? null,
                    cityPastAvgRank: metricMaps.cityPastMap.get(key) ?? null
                };
            }).sort((a, b) => {
                if (group.source === 'current-meta') {
                    const rankA = Number.isFinite(a.currentMetaRank) ? a.currentMetaRank : Number.MAX_SAFE_INTEGER;
                    const rankB = Number.isFinite(b.currentMetaRank) ? b.currentMetaRank : Number.MAX_SAFE_INTEGER;
                    if (rankA !== rankB) return rankA - rankB;
                    return String(a.name || '').localeCompare(String(b.name || ''));
                }

                const getRankValue = (item) => {
                    if (group.source === 'current-meta') return item.currentMetaRank;
                    if (group.source === 'city-current') return item.cityCurrentAvgRank;
                    if (group.source === 'city-past') return item.cityPastAvgRank;
                    return null;
                };

                const rankA = getRankValue(a);
                const rankB = getRankValue(b);
                const hasA = Number.isFinite(rankA);
                const hasB = Number.isFinite(rankB);

                if (hasA && hasB && rankA !== rankB) return rankA - rankB;
                if (hasA !== hasB) return hasA ? -1 : 1;
                return String(a.name || '').localeCompare(String(b.name || ''));
            })
        }));
    }

    // ── Look up card image URL from the allCardsDatabase ──
    function findCardImage(name, set, number) {
        if (typeof window.getIndexedCardBySetNumber === 'function') {
            const card = window.getIndexedCardBySetNumber(set, number)
                || window.getIndexedCardBySetNumber(set, String(parseInt(number, 10) || number));
            if (card && card.image_url) return card.image_url;
        }
        const allCards = window.allCardsDatabase || [];
        const found = allCards.find(c =>
            c.name === name && c.set === set && String(c.number) === String(number)
        );
        return found ? (found.image_url || found.image || '') : '';
    }

    function findCardRecord(name, set, number) {
        if (typeof window.getIndexedCardBySetNumber === 'function') {
            const card = window.getIndexedCardBySetNumber(set, number)
                || window.getIndexedCardBySetNumber(set, String(parseInt(number, 10) || number));
            if (card) return card;
        }
        const allCards = window.allCardsDatabase || [];
        return allCards.find(c =>
            c.name === name && c.set === set && String(c.number) === String(number)
        ) || null;
    }

    function isPokemonTypeString(typeValue) {
        const t = String(typeValue || '').toLowerCase();
        return t.includes('basic')
            || t.includes('stage')
            || t.includes('vmax')
            || t.includes('vstar')
            || t.includes('ex')
            || t.includes('mega')
            || t.includes('break')
            || t.includes('legend')
            || t.includes('restored');
    }

    function normalizePokemonElement(value) {
        const t = String(value || '').toLowerCase();
        if (t.includes('grass')) return 'Grass';
        if (t.includes('fire')) return 'Fire';
        if (t.includes('water')) return 'Water';
        if (t.includes('lightning') || t.includes('electric')) return 'Lightning';
        if (t.includes('psychic')) return 'Psychic';
        if (t.includes('fighting')) return 'Fighting';
        if (t.includes('darkness') || t.includes('dark')) return 'Darkness';
        if (t.includes('metal') || t.includes('steel')) return 'Metal';
        if (t.includes('dragon')) return 'Dragon';
        if (t.includes('colorless') || t.includes('normal')) return 'Colorless';
        return '';
    }

    // Static Pokedex-to-element map for reliable Pokemon type detection.
    // Covers all meta-relevant Pokemon so sorting works even without PokeAPI cache.
    // 741 unique entries – deduplicated (primary type kept for dual-types).
    const POKEDEX_ELEMENT_MAP = {
        // Grass
        1:'Grass',2:'Grass',3:'Grass',13:'Grass',14:'Grass',15:'Grass',43:'Grass',44:'Grass',45:'Grass',69:'Grass',70:'Grass',71:'Grass',114:'Grass',152:'Grass',153:'Grass',
        154:'Grass',182:'Grass',251:'Grass',252:'Grass',253:'Grass',254:'Grass',270:'Grass',271:'Grass',272:'Grass',285:'Grass',286:'Grass',315:'Grass',357:'Grass',387:'Grass',388:'Grass',
        389:'Grass',407:'Grass',455:'Grass',470:'Grass',492:'Grass',495:'Grass',496:'Grass',497:'Grass',540:'Grass',541:'Grass',542:'Grass',546:'Grass',547:'Grass',548:'Grass',549:'Grass',
        556:'Grass',590:'Grass',591:'Grass',650:'Grass',651:'Grass',652:'Grass',672:'Grass',673:'Grass',708:'Grass',709:'Grass',722:'Grass',723:'Grass',724:'Grass',753:'Grass',754:'Grass',
        755:'Grass',756:'Grass',761:'Grass',762:'Grass',763:'Grass',781:'Grass',787:'Grass',810:'Grass',811:'Grass',812:'Grass',829:'Grass',830:'Grass',840:'Grass',841:'Grass',842:'Grass',
        893:'Grass',906:'Grass',907:'Grass',908:'Grass',928:'Grass',
        // Fire
        4:'Fire',5:'Fire',6:'Fire',37:'Fire',38:'Fire',58:'Fire',59:'Fire',77:'Fire',78:'Fire',126:'Fire',136:'Fire',146:'Fire',155:'Fire',156:'Fire',157:'Fire',
        218:'Fire',219:'Fire',228:'Fire',229:'Fire',240:'Fire',244:'Fire',250:'Fire',255:'Fire',256:'Fire',257:'Fire',322:'Fire',323:'Fire',324:'Fire',390:'Fire',391:'Fire',
        392:'Fire',467:'Fire',485:'Fire',494:'Fire',498:'Fire',499:'Fire',500:'Fire',513:'Fire',514:'Fire',631:'Fire',636:'Fire',637:'Fire',653:'Fire',654:'Fire',655:'Fire',
        662:'Fire',663:'Fire',667:'Fire',668:'Fire',721:'Fire',725:'Fire',726:'Fire',727:'Fire',741:'Fire',757:'Fire',758:'Fire',776:'Fire',806:'Fire',813:'Fire',814:'Fire',
        815:'Fire',838:'Fire',839:'Fire',851:'Fire',884:'Fire',911:'Fire',
        // Water
        7:'Water',8:'Water',9:'Water',54:'Water',55:'Water',60:'Water',61:'Water',62:'Water',72:'Water',73:'Water',79:'Water',80:'Water',86:'Water',87:'Water',90:'Water',
        91:'Water',98:'Water',99:'Water',116:'Water',117:'Water',118:'Water',119:'Water',120:'Water',121:'Water',129:'Water',130:'Water',131:'Water',134:'Water',138:'Water',139:'Water',
        158:'Water',159:'Water',160:'Water',170:'Water',171:'Water',183:'Water',184:'Water',186:'Water',194:'Water',195:'Water',199:'Water',211:'Water',222:'Water',223:'Water',224:'Water',
        226:'Water',230:'Water',245:'Water',258:'Water',259:'Water',260:'Water',278:'Water',279:'Water',283:'Water',318:'Water',319:'Water',339:'Water',340:'Water',349:'Water',350:'Water',
        363:'Water',364:'Water',365:'Water',366:'Water',367:'Water',368:'Water',370:'Water',382:'Water',393:'Water',394:'Water',395:'Water',418:'Water',419:'Water',456:'Water',457:'Water',
        458:'Water',471:'Water',484:'Water',489:'Water',490:'Water',501:'Water',502:'Water',503:'Water',515:'Water',516:'Water',550:'Water',564:'Water',565:'Water',580:'Water',581:'Water',
        592:'Water',593:'Water',594:'Water',656:'Water',657:'Water',658:'Water',688:'Water',689:'Water',690:'Water',691:'Water',692:'Water',693:'Water',728:'Water',729:'Water',730:'Water',
        746:'Water',747:'Water',748:'Water',751:'Water',752:'Water',771:'Water',779:'Water',788:'Water',816:'Water',817:'Water',818:'Water',833:'Water',834:'Water',845:'Water',846:'Water',
        847:'Water',882:'Water',883:'Water',912:'Water',913:'Water',914:'Water',
        // Lightning
        25:'Lightning',26:'Lightning',81:'Lightning',82:'Lightning',100:'Lightning',101:'Lightning',125:'Lightning',135:'Lightning',145:'Lightning',172:'Lightning',179:'Lightning',180:'Lightning',181:'Lightning',239:'Lightning',243:'Lightning',
        309:'Lightning',310:'Lightning',311:'Lightning',312:'Lightning',403:'Lightning',404:'Lightning',405:'Lightning',417:'Lightning',462:'Lightning',466:'Lightning',479:'Lightning',522:'Lightning',523:'Lightning',587:'Lightning',595:'Lightning',
        596:'Lightning',602:'Lightning',603:'Lightning',604:'Lightning',642:'Lightning',694:'Lightning',695:'Lightning',702:'Lightning',737:'Lightning',738:'Lightning',777:'Lightning',785:'Lightning',835:'Lightning',836:'Lightning',848:'Lightning',
        849:'Lightning',871:'Lightning',880:'Lightning',921:'Lightning',
        // Psychic
        63:'Psychic',64:'Psychic',65:'Psychic',92:'Psychic',93:'Psychic',94:'Psychic',96:'Psychic',97:'Psychic',102:'Psychic',103:'Psychic',122:'Psychic',124:'Psychic',150:'Psychic',151:'Psychic',163:'Psychic',
        164:'Psychic',177:'Psychic',178:'Psychic',196:'Psychic',200:'Psychic',201:'Psychic',202:'Psychic',203:'Psychic',238:'Psychic',249:'Psychic',280:'Psychic',281:'Psychic',282:'Psychic',292:'Psychic',325:'Psychic',
        326:'Psychic',337:'Psychic',338:'Psychic',343:'Psychic',344:'Psychic',353:'Psychic',354:'Psychic',355:'Psychic',356:'Psychic',358:'Psychic',380:'Psychic',385:'Psychic',386:'Psychic',413:'Psychic',425:'Psychic',
        426:'Psychic',429:'Psychic',436:'Psychic',437:'Psychic',439:'Psychic',475:'Psychic',478:'Psychic',480:'Psychic',481:'Psychic',482:'Psychic',488:'Psychic',517:'Psychic',518:'Psychic',527:'Psychic',528:'Psychic',
        561:'Psychic',562:'Psychic',563:'Psychic',574:'Psychic',575:'Psychic',576:'Psychic',577:'Psychic',578:'Psychic',579:'Psychic',605:'Psychic',606:'Psychic',607:'Psychic',608:'Psychic',609:'Psychic',647:'Psychic',
        648:'Psychic',669:'Psychic',670:'Psychic',671:'Psychic',677:'Psychic',678:'Psychic',710:'Psychic',711:'Psychic',720:'Psychic',742:'Psychic',743:'Psychic',765:'Psychic',770:'Psychic',786:'Psychic',789:'Psychic',
        790:'Psychic',791:'Psychic',792:'Psychic',793:'Psychic',800:'Psychic',825:'Psychic',826:'Psychic',854:'Psychic',855:'Psychic',856:'Psychic',857:'Psychic',858:'Psychic',866:'Psychic',876:'Psychic',898:'Psychic',
        915:'Psychic',916:'Psychic',
        // Fighting
        56:'Fighting',57:'Fighting',66:'Fighting',67:'Fighting',68:'Fighting',74:'Fighting',75:'Fighting',76:'Fighting',95:'Fighting',104:'Fighting',105:'Fighting',106:'Fighting',107:'Fighting',111:'Fighting',112:'Fighting',
        127:'Fighting',166:'Fighting',208:'Fighting',214:'Fighting',236:'Fighting',237:'Fighting',246:'Fighting',247:'Fighting',248:'Fighting',296:'Fighting',297:'Fighting',302:'Fighting',306:'Fighting',307:'Fighting',308:'Fighting',
        328:'Fighting',329:'Fighting',330:'Fighting',332:'Fighting',341:'Fighting',342:'Fighting',377:'Fighting',383:'Fighting',447:'Fighting',448:'Fighting',453:'Fighting',454:'Fighting',464:'Fighting',532:'Fighting',533:'Fighting',
        534:'Fighting',538:'Fighting',539:'Fighting',551:'Fighting',552:'Fighting',553:'Fighting',557:'Fighting',558:'Fighting',559:'Fighting',560:'Fighting',619:'Fighting',620:'Fighting',621:'Fighting',622:'Fighting',623:'Fighting',
        638:'Fighting',639:'Fighting',640:'Fighting',645:'Fighting',674:'Fighting',675:'Fighting',696:'Fighting',697:'Fighting',718:'Fighting',739:'Fighting',740:'Fighting',766:'Fighting',769:'Fighting',802:'Fighting',804:'Fighting',
        852:'Fighting',853:'Fighting',870:'Fighting',892:'Fighting',
        // Darkness
        19:'Darkness',20:'Darkness',23:'Darkness',24:'Darkness',41:'Darkness',42:'Darkness',48:'Darkness',49:'Darkness',51:'Darkness',52:'Darkness',53:'Darkness',88:'Darkness',89:'Darkness',109:'Darkness',110:'Darkness',
        168:'Darkness',169:'Darkness',197:'Darkness',198:'Darkness',215:'Darkness',261:'Darkness',262:'Darkness',274:'Darkness',275:'Darkness',303:'Darkness',317:'Darkness',331:'Darkness',359:'Darkness',430:'Darkness',434:'Darkness',
        435:'Darkness',442:'Darkness',451:'Darkness',452:'Darkness',461:'Darkness',491:'Darkness',509:'Darkness',510:'Darkness',543:'Darkness',544:'Darkness',545:'Darkness',570:'Darkness',571:'Darkness',624:'Darkness',625:'Darkness',
        629:'Darkness',630:'Darkness',633:'Darkness',634:'Darkness',635:'Darkness',686:'Darkness',687:'Darkness',717:'Darkness',735:'Darkness',799:'Darkness',803:'Darkness',827:'Darkness',828:'Darkness',859:'Darkness',860:'Darkness',
        861:'Darkness',862:'Darkness',877:'Darkness',891:'Darkness',903:'Darkness',
        // Metal
        205:'Metal',212:'Metal',227:'Metal',304:'Metal',305:'Metal',374:'Metal',375:'Metal',376:'Metal',379:'Metal',410:'Metal',411:'Metal',476:'Metal',530:'Metal',589:'Metal',597:'Metal',
        598:'Metal',599:'Metal',600:'Metal',601:'Metal',632:'Metal',649:'Metal',679:'Metal',680:'Metal',681:'Metal',707:'Metal',778:'Metal',823:'Metal',863:'Metal',874:'Metal',878:'Metal',
        879:'Metal',888:'Metal',890:'Metal',919:'Metal',920:'Metal',
        // Dragon
        147:'Dragon',148:'Dragon',149:'Dragon',334:'Dragon',371:'Dragon',372:'Dragon',373:'Dragon',381:'Dragon',384:'Dragon',443:'Dragon',444:'Dragon',445:'Dragon',483:'Dragon',487:'Dragon',610:'Dragon',
        611:'Dragon',612:'Dragon',643:'Dragon',644:'Dragon',646:'Dragon',780:'Dragon',782:'Dragon',783:'Dragon',784:'Dragon',881:'Dragon',885:'Dragon',886:'Dragon',887:'Dragon',895:'Dragon',896:'Dragon',
        905:'Dragon',
        // Colorless
        16:'Colorless',17:'Colorless',18:'Colorless',21:'Colorless',22:'Colorless',39:'Colorless',40:'Colorless',83:'Colorless',84:'Colorless',108:'Colorless',113:'Colorless',115:'Colorless',128:'Colorless',132:'Colorless',133:'Colorless',
        137:'Colorless',142:'Colorless',143:'Colorless',173:'Colorless',174:'Colorless',175:'Colorless',176:'Colorless',190:'Colorless',206:'Colorless',216:'Colorless',217:'Colorless',233:'Colorless',234:'Colorless',235:'Colorless',241:'Colorless',
        242:'Colorless',263:'Colorless',264:'Colorless',276:'Colorless',277:'Colorless',287:'Colorless',288:'Colorless',289:'Colorless',293:'Colorless',294:'Colorless',295:'Colorless',327:'Colorless',333:'Colorless',335:'Colorless',336:'Colorless',
        351:'Colorless',352:'Colorless',396:'Colorless',397:'Colorless',398:'Colorless',399:'Colorless',400:'Colorless',424:'Colorless',432:'Colorless',440:'Colorless',441:'Colorless',446:'Colorless',463:'Colorless',474:'Colorless',486:'Colorless',
        493:'Colorless',504:'Colorless',505:'Colorless',506:'Colorless',507:'Colorless',508:'Colorless',519:'Colorless',520:'Colorless',521:'Colorless',531:'Colorless',572:'Colorless',573:'Colorless',585:'Colorless',586:'Colorless',626:'Colorless',
        627:'Colorless',628:'Colorless',641:'Colorless',660:'Colorless',661:'Colorless',676:'Colorless',731:'Colorless',732:'Colorless',733:'Colorless',734:'Colorless',744:'Colorless',745:'Colorless',759:'Colorless',760:'Colorless',764:'Colorless',
        775:'Colorless',819:'Colorless',820:'Colorless',821:'Colorless',822:'Colorless',831:'Colorless',832:'Colorless',843:'Colorless',844:'Colorless',900:'Colorless',901:'Colorless',924:'Colorless',925:'Colorless'
    };

    function getMetaBinderTypeMeta(card) {
        const cardDb = findCardRecord(card.name, card.set, card.number);
        const rowType = String(card.type || '').trim();
        const rowTypeLower = rowType.toLowerCase();
        const rarityLower = String(card.rarity || '').toLowerCase();
        const aceSpec = !!card.isAceSpec || rarityLower.includes('ace spec');

        if (aceSpec) {
            return { supertype: 'Trainer', type: 'ACE SPEC', isAceSpec: true };
        }

        if (rowTypeLower.includes('supporter')) return { supertype: 'Trainer', type: 'Supporter', isAceSpec: false };
        if (rowTypeLower.includes('item')) return { supertype: 'Trainer', type: 'Item', isAceSpec: false };
        if (rowTypeLower.includes('tool')) return { supertype: 'Trainer', type: 'Tool', isAceSpec: false };
        if (rowTypeLower.includes('stadium')) return { supertype: 'Trainer', type: 'Stadium', isAceSpec: false };
        if (rowTypeLower.includes('special energy')) return { supertype: 'Energy', type: 'Special Energy', isAceSpec: false };
        if (rowTypeLower.includes('basic energy')) return { supertype: 'Energy', type: 'Basic Energy', isAceSpec: false };

        const looksLikePokemon = isPokemonTypeString(rowType) || (!rowTypeLower.includes('energy') && !rowTypeLower.includes('trainer'));
        if (looksLikePokemon) {
            // Try extracting element from row type or DB type string
            let element = normalizePokemonElement(rowType);
            if (!element && cardDb) {
                element = normalizePokemonElement(cardDb.energy_type || '');
            }
            if (!element && cardDb) {
                element = normalizePokemonElement(cardDb.type || '');
            }

            // Resolve Pokedex number for element lookup
            if (!element) {
                const dex = parseInt(String(
                    (cardDb && cardDb.pokedex_number) || (cardDb && cardDb.pokedexNumber) ||
                    card.pokedex_number || card.pokedexNumber || ''
                ).trim(), 10);

                if (Number.isFinite(dex) && dex > 0) {
                    // 1. Static map (always reliable)
                    const fromStatic = POKEDEX_ELEMENT_MAP[dex];
                    if (fromStatic) {
                        element = fromStatic;
                    }
                    // 2. PokeAPI cache from Collection tab
                    if (!element) {
                        const typeCache = window.pokemonTypeCache || {};
                        const cachedType = typeCache[String(dex)];
                        if (cachedType) {
                            const typeToElement = {
                                grass:'Grass', fire:'Fire', water:'Water', electric:'Lightning',
                                psychic:'Psychic', fighting:'Fighting', dark:'Darkness', steel:'Metal',
                                dragon:'Dragon', normal:'Colorless', bug:'Grass', poison:'Psychic',
                                ground:'Fighting', rock:'Fighting', ice:'Water', ghost:'Psychic',
                                fairy:'Psychic', flying:'Colorless'
                            };
                            element = typeToElement[cachedType] || '';
                        }
                    }
                }
                // 3. Pokedex number lookup by name
                if (!element) {
                    const dexMap = window.pokedexNumbers || {};
                    const rawName = String((cardDb && cardDb.name) || card.name || '').trim().toLowerCase()
                        .replace(/\b(mega |ex|gx|vmax|vstar|v |radiant )\b/g, '').replace(/[^a-z0-9\s-]/g, ' ').trim();
                    const nameDex = parseInt(String(dexMap[rawName] || '').trim(), 10);
                    if (Number.isFinite(nameDex) && nameDex > 0) {
                        const fromStatic2 = POKEDEX_ELEMENT_MAP[nameDex];
                        if (fromStatic2) element = fromStatic2;
                    }
                }
            }

            return { supertype: 'Pokemon', type: element ? `Pokemon-${element}` : 'Pokemon-Colorless', isAceSpec: false };
        }

        if (rowTypeLower.includes('energy')) return { supertype: 'Energy', type: 'Special Energy', isAceSpec: false };
        return { supertype: 'Trainer', type: 'Item', isAceSpec: false };
    }

    function parseCardNumberForSort(value) {
        const raw = String(value || '').trim();
        const match = raw.match(/^(\d+)/);
        return match ? parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
    }

    const META_BINDER_CATEGORY_ORDER = {
        Pokemon: 1,
        Supporter: 2,
        Item: 3,
        Tool: 4,
        Stadium: 5,
        'Special Energy': 6,
        'Basic Energy': 7
    };

    const META_BINDER_POKEMON_TYPE_ORDER = {
        Grass: 1,
        Fire: 2,
        Water: 3,
        Lightning: 4,
        Psychic: 5,
        Fighting: 6,
        Darkness: 7,
        Metal: 8,
        Dragon: 9,
        Colorless: 10
    };

    const META_BINDER_NAME_COLLATOR = new Intl.Collator(undefined, {
        sensitivity: 'base',
        numeric: true
    });

    const META_BINDER_SET_ORDER_FALLBACK = [
        'SSP', 'SCR', 'SFA', 'TWM', 'PRE', 'TEF', 'MEP', 'MEG', 'ASC', 'DRI', 'JTG', 'BLK'
    ];

    function extractDexFromImageUrl(imageUrl) {
        const raw = String(imageUrl || '').trim();
        if (!raw) return Number.MAX_SAFE_INTEGER;

        const patterns = [
            /\/([A-Z0-9]+)_0*(\d+)_/i,
            /[_\-]0*(\d+)(?:[_\.-]|$)/i
        ];

        for (const pattern of patterns) {
            const match = raw.match(pattern);
            if (!match) continue;
            const numericPart = match[match.length - 1];
            const parsed = parseInt(String(numericPart || '').trim(), 10);
            if (Number.isFinite(parsed) && parsed > 0) return parsed;
        }

        return Number.MAX_SAFE_INTEGER;
    }

    function getMetaBinderSortCategory(meta) {
        if (!meta) return 'Item';
        if (meta.supertype === 'Pokemon') return 'Pokemon';
        if (meta.type === 'ACE SPEC') return 'Item';
        return String(meta.type || 'Item');
    }

    function getMetaBinderSetOrderValue(setCode) {
        const code = String(setCode || '').trim();
        if (!code) return 0;

        const setOrderMap = window.setOrderMap || {};
        const directValue = setOrderMap[code] || setOrderMap[code.toLowerCase()] || 0;
        if (directValue) return directValue;

        const fallbackIndex = META_BINDER_SET_ORDER_FALLBACK.indexOf(code.toUpperCase());
        if (fallbackIndex !== -1) {
            return META_BINDER_SET_ORDER_FALLBACK.length - fallbackIndex;
        }

        return 0;
    }

    function getMetaBinderPokemonDex(card, cardDb) {
        const dexFromCard = parseInt(String(cardDb?.pokedex_number || cardDb?.pokedexNumber || card?.pokedex_number || card?.pokedexNumber || '').trim(), 10);
        if (Number.isFinite(dexFromCard) && dexFromCard > 0) return dexFromCard;

        const dexMap = window.pokedexNumbers || {};
        const rawName = String(cardDb?.name || cardDb?.name_en || card?.name || '').trim().toLowerCase();
        const candidates = [rawName];
        if (rawName) {
            candidates.push(
                rawName
                    .replace(/\b(mega|ex|gx|vmax|vstar|v|radiant)\b/g, '')
                    .replace(/[^a-z0-9\s-]/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim()
            );
        }

        for (const c of candidates) {
            if (!c) continue;
            const direct = parseInt(String(dexMap[c] || '').trim(), 10);
            if (Number.isFinite(direct) && direct > 0) return direct;
        }

        const fromImageUrl = extractDexFromImageUrl(cardDb?.image_url || cardDb?.image || card?.image_url || card?.image);
        if (Number.isFinite(fromImageUrl) && fromImageUrl > 0 && fromImageUrl !== Number.MAX_SAFE_INTEGER) {
            return fromImageUrl;
        }

        return Number.MAX_SAFE_INTEGER;
    }

    function getMetaBinderPokemonElementOrder(typeMeta) {
        const element = String(typeMeta.type || '').replace('Pokemon-', '');
        return META_BINDER_POKEMON_TYPE_ORDER[element] || 99;
    }

    function compareMetaBinderEntries(a, b) {
        const aTypeMeta = a.typeMeta || getMetaBinderTypeMeta(a);
        const bTypeMeta = b.typeMeta || getMetaBinderTypeMeta(b);

        const aCategory = getMetaBinderSortCategory(aTypeMeta);
        const bCategory = getMetaBinderSortCategory(bTypeMeta);
        const aOrder = META_BINDER_CATEGORY_ORDER[aCategory] || 99;
        const bOrder = META_BINDER_CATEGORY_ORDER[bCategory] || 99;
        if (aOrder !== bOrder) return aOrder - bOrder;

        if (aCategory === 'Pokemon') {
            // 1. Element type
            const aElementOrder = getMetaBinderPokemonElementOrder(aTypeMeta);
            const bElementOrder = getMetaBinderPokemonElementOrder(bTypeMeta);
            if (aElementOrder !== bElementOrder) return aElementOrder - bElementOrder;

            // 2. Pokedex number (ascending)
            const dexA = Number.isFinite(a.dexNumber) ? a.dexNumber : Number.MAX_SAFE_INTEGER;
            const dexB = Number.isFinite(b.dexNumber) ? b.dexNumber : Number.MAX_SAFE_INTEGER;
            if (dexA !== dexB) return dexA - dexB;

            // 3. Set from newest to oldest (higher setOrder = newer)
            const pokSetA = Number.isFinite(a.setOrder) ? a.setOrder : 0;
            const pokSetB = Number.isFinite(b.setOrder) ? b.setOrder : 0;
            if (pokSetA !== pokSetB) return pokSetB - pokSetA;

            // 4. Card number within set
            const pokNumA = Number.isFinite(a.numberSort) ? a.numberSort : Number.MAX_SAFE_INTEGER;
            const pokNumB = Number.isFinite(b.numberSort) ? b.numberSort : Number.MAX_SAFE_INTEGER;
            if (pokNumA !== pokNumB) return pokNumA - pokNumB;

            // 5. Name fallback
            return META_BINDER_NAME_COLLATOR.compare(String(a.name || ''), String(b.name || ''));
        }

        const setFirstCategories = new Set(['Supporter', 'Item', 'Tool', 'Stadium', 'Special Energy']);
        if (setFirstCategories.has(aCategory) && setFirstCategories.has(bCategory)) {
            const catOrderA = META_BINDER_CATEGORY_ORDER[aCategory] || 99;
            const catOrderB = META_BINDER_CATEGORY_ORDER[bCategory] || 99;
            if (catOrderA !== catOrderB) return catOrderA - catOrderB;

            const catSetOrderA = Number.isFinite(a.setOrder) ? a.setOrder : 0;
            const catSetOrderB = Number.isFinite(b.setOrder) ? b.setOrder : 0;
            if (catSetOrderA !== catSetOrderB) return catSetOrderB - catSetOrderA;

            const catNumberA = Number.isFinite(a.numberSort) ? a.numberSort : Number.MAX_SAFE_INTEGER;
            const catNumberB = Number.isFinite(b.numberSort) ? b.numberSort : Number.MAX_SAFE_INTEGER;
            if (catNumberA !== catNumberB) return catNumberA - catNumberB;

            const catNameA = String(a.name || '');
            const catNameB = String(b.name || '');
            return META_BINDER_NAME_COLLATOR.compare(catNameA, catNameB);
        }

        // Stable fallback for all categories:
        // newer set first -> card number -> name.
        const setOrderA = Number.isFinite(a.setOrder) ? a.setOrder : 0;
        const setOrderB = Number.isFinite(b.setOrder) ? b.setOrder : 0;
        if (setOrderA !== setOrderB) return setOrderB - setOrderA;

        const numberA = Number.isFinite(a.numberSort) ? a.numberSort : Number.MAX_SAFE_INTEGER;
        const numberB = Number.isFinite(b.numberSort) ? b.numberSort : Number.MAX_SAFE_INTEGER;
        if (numberA !== numberB) return numberA - numberB;

        const nameA = String(a.name || '');
        const nameB = String(b.name || '');
        const nameDiff = META_BINDER_NAME_COLLATOR.compare(nameA, nameB);
        if (nameDiff !== 0) return nameDiff;

        const setA = String(a.set || '');
        const setB = String(b.set || '');
        const setDiff = META_BINDER_NAME_COLLATOR.compare(setA, setB);
        if (setDiff !== 0) return setDiff;

        return 0;
    }

    function sortMetaCards(cards) {
        return cards.sort((a, b) => {
            const aCardDb = findCardRecord(a.name, a.set, a.number);
            const bCardDb = findCardRecord(b.name, b.set, b.number);

            return compareMetaBinderEntries(
                {
                    name: a.name,
                    set: a.set,
                    number: a.number,
                    typeMeta: getMetaBinderTypeMeta(a),
                    dexNumber: getMetaBinderPokemonDex(a, aCardDb),
                    setOrder: getMetaBinderSetOrderValue(a.set),
                    numberSort: parseCardNumberForSort(a.number)
                },
                {
                    name: b.name,
                    set: b.set,
                    number: b.number,
                    typeMeta: getMetaBinderTypeMeta(b),
                    dexNumber: getMetaBinderPokemonDex(b, bCardDb),
                    setOrder: getMetaBinderSetOrderValue(b.set),
                    numberSort: parseCardNumberForSort(b.number)
                }
            );
        });
    }

    function parseMetaBinderDomNumber(value) {
        const raw = String(value || '').trim();
        const parsed = parseInt(raw, 10);
        return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
    }

    function sortMetaBinder() {
        const grid = document.getElementById('metaBinderGrid');
        if (!grid) return;

        const cards = Array.from(grid.querySelectorAll('.meta-binder-card'));
        if (cards.length <= 1) return;

        cards.sort((a, b) => compareMetaBinderEntries(
            {
                name: String(a.dataset.name || ''),
                set: String(a.dataset.set || ''),
                typeMeta: {
                    supertype: String(a.dataset.supertype || ''),
                    type: String(a.dataset.type || ''),
                    isAceSpec: a.dataset.isAceSpec === 'true'
                },
                dexNumber: parseMetaBinderDomNumber(a.dataset.pokedex),
                setOrder: parseMetaBinderDomNumber(a.dataset.setOrder),
                numberSort: parseMetaBinderDomNumber(a.dataset.numberSort)
            },
            {
                name: String(b.dataset.name || ''),
                set: String(b.dataset.set || ''),
                typeMeta: {
                    supertype: String(b.dataset.supertype || ''),
                    type: String(b.dataset.type || ''),
                    isAceSpec: b.dataset.isAceSpec === 'true'
                },
                dexNumber: parseMetaBinderDomNumber(b.dataset.pokedex),
                setOrder: parseMetaBinderDomNumber(b.dataset.setOrder),
                numberSort: parseMetaBinderDomNumber(b.dataset.numberSort)
            }
        ));

        const fragment = document.createDocumentFragment();
        cards.forEach(card => fragment.appendChild(card));
        grid.appendChild(fragment);
    }

    window.sortMetaBinder = sortMetaBinder;

    // ── Active filter for the binder view ──
    let metaBinderFilter = 'all'; // 'all', 'new', 'missing'

    function setMetaBinderFilter(filter) {
        metaBinderFilter = filter;
        // Update filter button states
        document.querySelectorAll('.meta-binder-filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });
        applyComplexMetaFilter();
    }

    function updateMetaBinderSetFilter(cards) {
        const setSelect = document.getElementById('mbFilterSet');
        if (!setSelect) return;

        const currentValue = setSelect.value || 'all';
        const setOrderMap = window.setOrderMap || {};
        const setCodes = [...new Set(cards.map(c => String(c.set || '').trim()).filter(Boolean))]
            .sort((a, b) => {
                const orderA = setOrderMap[a] || setOrderMap[a.toLowerCase()] || 0;
                const orderB = setOrderMap[b] || setOrderMap[b.toLowerCase()] || 0;
                if (orderA !== orderB) return orderB - orderA; // newest -> oldest
                return a.localeCompare(b);
            });

        setSelect.innerHTML = [
            '<option value="all">Alle Sets</option>',
            ...setCodes.map(code => `<option value="${escapeHtml(code)}">${escapeHtml(code)}</option>`)
        ].join('');

        if (setCodes.includes(currentValue)) {
            setSelect.value = currentValue;
        } else {
            setSelect.value = 'all';
        }
    }

    function applyComplexMetaFilter() {
        const delta = window._metaBinderDelta;
        if (!delta) return;
        renderMetaBinderGrid(delta);
    }

    function formatMetaBinderMetric(value, digits = 1) {
        return Number.isFinite(value) ? value.toFixed(digits) : '—';
    }

    function escapeArchetypeForJs(value) {
        if (typeof escapeJsStr === 'function') return escapeJsStr(value);
        return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    }

    function renderMetaBinderArchetypeGroups(deltaEl) {
        if (!deltaEl) return;
        const groups = Array.isArray(window._metaBinderArchetypeGroups) ? window._metaBinderArchetypeGroups : [];
        if (groups.length === 0) {
            deltaEl.classList.add('display-none');
            deltaEl.innerHTML = '';
            return;
        }

        const html = groups.map(group => {
            const cardsHtml = group.items.map(item => {
                const safeName = escapeHtml(item.name || 'Unknown');
                const safeImage = escapeHtml(item.imageUrl || '');
                const escapedJsName = escapeArchetypeForJs(item.name || '');
                const navFn = item.source === 'current-meta' ? 'navigateToCurrentMetaWithDeck' : 'navigateToAnalysisWithDeck';
                const currentMetaLabel = escapeHtml(item.currentMetaFormatLabel || 'TEF-POR');
                const rankText = formatMetaBinderMetric(item.currentMetaRank, 1);
                const shareText = Number.isFinite(item.currentMetaShare) ? `${item.currentMetaShare.toFixed(1)}%` : '—';
                const cityCurrentText = formatMetaBinderMetric(item.cityCurrentAvgRank, 1);
                const cityPastText = formatMetaBinderMetric(item.cityPastAvgRank, 1);

                return `
                    <div class="deck-banner-card" onclick="${navFn}('${escapedJsName}')">
                        ${item.imageUrl ? `<div class="deck-banner-bg" style="background-image: url('${safeImage}')"></div>` : ''}
                        <div class="deck-banner-content">
                            <div class="deck-banner-name">${safeName}</div>
                            <div class="deck-banner-stats" style="display:flex;flex-direction:column;align-items:flex-start;gap:4px;">
                                <span class="stat-badge rank-performance-hint" style="background:#fff3e0;color:#e65100;" title="Lower Rank = Better Performance">🏆 ${currentMetaLabel}: ${rankText}</span>
                                <span class="stat-badge">📊 ${currentMetaLabel}: ${shareText}</span>
                                <span class="stat-badge">City current: ${cityCurrentText}</span>
                                <span class="stat-badge">City past: ${cityPastText}</span>
                            </div>
                        </div>
                    </div>`;
            }).join('');

            return `
                <div class="meta-binder-archetype-group">
                    <details class="meta-binder-archetype-panel" open>
                        <summary class="meta-binder-archetype-summary">
                            <h3 class="meta-binder-archetype-title">${escapeHtml(group.title)}</h3>
                            <span class="meta-binder-archetype-count">${group.items.length}</span>
                        </summary>
                        <div class="meta-binder-archetype-grid">${cardsHtml}</div>
                    </details>
                </div>`;
        }).join('');

        deltaEl.classList.remove('display-none');
        deltaEl.innerHTML = `<div class="meta-binder-archetype-groups">${html}</div>`;
    }

    function closeMetaBinderDroppedModal() {
        const modal = document.getElementById('metaBinderDroppedModal');
        if (!modal) return;
        modal.classList.remove('is-open');
        modal.classList.add('display-none');
    }

    function openMetaBinderDroppedModal() {
        const modal = document.getElementById('metaBinderDroppedModal');
        const listEl = document.getElementById('metaBinderDroppedList');
        const countEl = document.getElementById('metaBinderDroppedCount');
        if (!modal || !listEl || !countEl) return;

        const droppedCards = Array.isArray(window._metaBinderDroppedCards)
            ? window._metaBinderDroppedCards
            : [];

        countEl.textContent = String(droppedCards.length);

        if (droppedCards.length === 0) {
            listEl.innerHTML = `<div class="battle-journal-empty-state">${mbText('mb.noDroppedCards', 'No dropped cards this cycle.')}</div>`;
        } else {
            listEl.innerHTML = droppedCards
                .slice()
                .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
                .map(card => {
                    const name = escapeHtml(String(card.name || 'Unknown'));
                    const set = escapeHtml(String(card.set || ''));
                    const number = escapeHtml(String(card.number || ''));
                    const id = escapeHtml(String(card.cardId || ''));
                    return `<div class="battle-journal-pending-item"><div class="battle-journal-pending-main"><div class="battle-journal-pending-title">${name}</div><div class="battle-journal-pending-meta">${set && number ? `${set} ${number}` : id}</div></div></div>`;
                })
                .join('');
        }

        modal.classList.remove('display-none');
        modal.classList.add('is-open');
    }

    // ── Render ──
    function renderMetaBinder(delta) {
        const grid = document.getElementById('metaBinderGrid');
        const statsEl = document.getElementById('metaBinderStats');
        const deltaEl = document.getElementById('metaBinderDelta');
        const filtersEl = document.getElementById('metaBinderFilters');
        if (!grid) return;

        const { cards, droppedCards } = delta;
        window._metaBinderDroppedCards = droppedCards;
        const totalUnique = cards.length;
        const totalCopies = cards.reduce((s, c) => s + c.maxCount, 0);
        const missingUnique = cards.filter(c => c.missing > 0).length;
        const missingCopies = cards.reduce((s, c) => s + c.missing, 0);
        const ownedComplete = cards.filter(c => c.missing === 0).length;
        const newCount = cards.filter(c => c.isNew).length;
        const droppedCount = droppedCards.length;

        // Stats bar
        if (statsEl) {
            statsEl.classList.remove('display-none');
            statsEl.innerHTML = `
                <div class="meta-binder-stat">
                    <span class="meta-binder-stat-value">${totalUnique}</span>
                    <span class="meta-binder-stat-label">${mbText('mb.uniqueCards', 'Unique Cards')}</span>
                </div>
                <div class="meta-binder-stat">
                    <span class="meta-binder-stat-value">${totalCopies}</span>
                    <span class="meta-binder-stat-label">${mbText('mb.totalCopies', 'Total Copies')}</span>
                </div>
                <div class="meta-binder-stat">
                    <span class="meta-binder-stat-value meta-binder-stat-green">${ownedComplete}</span>
                    <span class="meta-binder-stat-label">${mbText('mb.complete', 'Complete')}</span>
                </div>
                <div class="meta-binder-stat">
                    <span class="meta-binder-stat-value meta-binder-stat-red">${missingUnique} / ${missingCopies}</span>
                    <span class="meta-binder-stat-label">${mbText('mb.missing', 'Missing (Cards / Copies)')}</span>
                </div>
                <div class="meta-binder-stat">
                    <span class="meta-binder-stat-value" style="color:#3B4CCA">${newCount}</span>
                    <span class="meta-binder-stat-label">${mbText('mb.newThisWeek', 'New This Week')}</span>
                </div>
                <button class="meta-binder-stat meta-binder-stat-clickable" type="button" onclick="openMetaBinderDroppedModal()" title="${mbText('mb.openDroppedModal', 'Show dropped cards')}">
                    <span class="meta-binder-stat-value" style="color:#e67e22">${droppedCount}</span>
                    <span class="meta-binder-stat-label">${mbText('mb.droppedCount', 'Dropped')}</span>
                </button>`;
        }

            renderMetaBinderArchetypeGroups(deltaEl);

        // Filter buttons
        if (filtersEl) {
            filtersEl.classList.remove('display-none');
            filtersEl.innerHTML = `
                <div class="filter-group">
                    <button class="meta-binder-filter-btn active" data-filter="all" onclick="setMetaBinderFilter('all')">${mbText('mb.filterAll', 'Alle')} (${totalUnique})</button>
                    <button class="meta-binder-filter-btn" data-filter="missing" onclick="setMetaBinderFilter('missing')">❌ ${mbText('mb.filterMissing', 'Fehlend')} (${missingUnique})</button>
                    <button class="meta-binder-filter-btn" data-filter="new" onclick="setMetaBinderFilter('new')">🆕 ${mbText('mb.filterNew', 'Neu')} (${newCount})</button>
                </div>
                <div class="filter-group">
                    <select id="mbFilterType" onchange="applyComplexMetaFilter()" class="select-system">
                        <option value="all">Alle Typen</option>
                        <option value="Pokemon-Grass">Pokemon: Pflanze</option>
                        <option value="Pokemon-Fire">Pokemon: Feuer</option>
                        <option value="Pokemon-Water">Pokemon: Wasser</option>
                        <option value="Pokemon-Lightning">Pokemon: Elektro</option>
                        <option value="Pokemon-Psychic">Pokemon: Psycho</option>
                        <option value="Pokemon-Fighting">Pokemon: Kampf</option>
                        <option value="Pokemon-Darkness">Pokemon: Unlicht</option>
                        <option value="Pokemon-Metal">Pokemon: Metall</option>
                        <option value="Pokemon-Dragon">Pokemon: Drache</option>
                        <option value="Pokemon-Colorless">Pokemon: Farblos</option>
                        <option value="Supporter">Unterstutzer</option>
                        <option value="Item">Item</option>
                        <option value="Tool">Ausrustung</option>
                        <option value="Stadium">Stadion</option>
                        <option value="Special Energy">Spezial-Energie</option>
                        <option value="Basic Energy">Basis-Energie</option>
                        <option value="ACE SPEC">ACE SPEC</option>
                    </select>

                    <select id="mbFilterSet" onchange="applyComplexMetaFilter()" class="select-system">
                        <option value="all">Alle Sets</option>
                    </select>
                </div>`;
        }

        // Enable action buttons if there are missing cards
        const wishlistBtn = document.getElementById('metaBinderAddWishlist');
        const proxyBtn = document.getElementById('metaBinderSendProxy');
        const proxyNewBtn = document.getElementById('metaBinderProxyNew');
        if (wishlistBtn) wishlistBtn.disabled = missingCopies === 0;
        if (proxyBtn) proxyBtn.disabled = missingCopies === 0;
        if (proxyNewBtn) proxyNewBtn.disabled = newCount === 0;

        metaBinderFilter = 'all';
        updateMetaBinderSetFilter(cards);
        renderMetaBinderGrid(delta);
    }

    // ── Render grid (filtered) ──
    function renderMetaBinderGrid(delta) {
        const grid = document.getElementById('metaBinderGrid');
        if (!grid) return;

        const { cards } = delta;

        const typeFilterEl = document.getElementById('mbFilterType');
        const setFilterEl = document.getElementById('mbFilterSet');
        const typeFilter = typeFilterEl ? String(typeFilterEl.value || 'all') : 'all';
        const setFilter = setFilterEl ? String(setFilterEl.value || 'all').toLowerCase() : 'all';

        // Apply active filter
        let filtered;
        if (metaBinderFilter === 'new') {
            filtered = cards.filter(c => c.isNew);
        } else if (metaBinderFilter === 'missing') {
            filtered = cards.filter(c => c.missing > 0);
        } else {
            filtered = cards;
        }

        filtered = filtered.filter(card => {
            const meta = getMetaBinderTypeMeta(card);
            const cardSet = String(card.set || '').toLowerCase();

            if (typeFilter !== 'all' && meta.type !== typeFilter) return false;
            if (setFilter !== 'all' && cardSet !== setFilter) return false;
            return true;
        });

        const sorted = sortMetaCards([...filtered]);

        if (sorted.length === 0) {
            grid.innerHTML = `<p class="color-grey">${mbText('mb.empty', 'No meta card data found. Make sure Current Meta or City League data is loaded.')}</p>`;
            return;
        }

        grid.innerHTML = sorted.map(card => {
            const imageUrl = findCardImage(card.name, card.set, card.number);
            const statusClass = card.ownershipMode === 'exact'
                ? 'meta-binder-card-owned card-owned'
                : (card.ownershipMode === 'intl-complete'
                    ? 'meta-binder-card-owned-intl card-owned'
                    : 'meta-binder-card-missing card-missing');
            const newBadge = card.isNew ? `<span class="meta-binder-badge-new">${mbText('mb.new', 'NEW')}</span>` : '';
            const safeImage = escapeHtml(imageUrl);
            const safeName = escapeHtml(card.name);
            const deckList = card.decks.map(d => escapeHtml(d)).join(', ');
            const typeMeta = getMetaBinderTypeMeta(card);
            const sortCategory = getMetaBinderSortCategory(typeMeta);
            const cardDb = findCardRecord(card.name, card.set, card.number);
            const dexNumber = sortCategory === 'Pokemon' ? getMetaBinderPokemonDex(card, cardDb) : Number.MAX_SAFE_INTEGER;
            const setOrder = getMetaBinderSetOrderValue(card.set);
            const numberSort = parseCardNumberForSort(card.number);
            const countLabel = card.ownershipMode === 'exact'
                ? `<span class="meta-binder-count-ok">${card.ownedExact}/${card.maxCount} ✓</span>`
                : (card.ownershipMode === 'intl-complete'
                    ? `<span class="meta-binder-count-intl">${card.ownedIntlTotal}/${card.maxCount} ✓</span>`
                    : `<span class="meta-binder-count-missing">${card.ownedIntlTotal}/${card.maxCount}</span>`);
            const ownershipHint = card.ownershipMode === 'intl-complete'
                ? ' (filled via other international prints)'
                : '';

            return `
                <div class="meta-binder-card ${statusClass}" data-type="${escapeHtml(typeMeta.type)}" data-set="${escapeHtml(String(card.set || ''))}" data-supertype="${escapeHtml(typeMeta.supertype)}" data-is-ace-spec="${typeMeta.isAceSpec ? 'true' : 'false'}" data-name="${safeName}" data-pokedex="${String(dexNumber)}" data-set-order="${String(setOrder)}" data-number-sort="${String(numberSort)}" title="Wird verwendet in: ${deckList}${ownershipHint}">
                    ${imageUrl
                        ? `<img src="${safeImage}" alt="${safeName}" class="meta-binder-card-img" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                           <div class="meta-binder-card-fallback" style="display:none">${safeName}</div>`
                        : `<div class="meta-binder-card-fallback">${safeName}<br><small>${escapeHtml(card.set)} ${escapeHtml(card.number)}</small></div>`}
                    <div class="meta-binder-card-info">
                        ${newBadge}
                        <span class="meta-binder-card-need">${card.maxCount}x</span>
                        <div class="deck-indicator-count">${card.decks.length} Decks</div>
                        ${countLabel}
                    </div>
                </div>`;
        }).join('');

            sortMetaBinder();
    }

    // ── Ensure meta data is loaded before building the binder ──
    async function ensureMetaDataLoaded() {
        const promises = [];

        // Load Current Meta Analysis if not already present
        if (!window.currentMetaAnalysisLoaded) {
            if (typeof loadCurrentAnalysis === 'function') {
                console.log('[MetaBinder] Triggering loadCurrentAnalysis()…');
                promises.push(loadCurrentAnalysis().catch(e => console.warn('[MetaBinder] loadCurrentAnalysis failed:', e)));
            } else if (typeof loadCurrentMetaAnalysis === 'function') {
                console.log('[MetaBinder] Triggering loadCurrentMetaAnalysis()…');
                promises.push(loadCurrentMetaAnalysis().catch(e => console.warn('[MetaBinder] loadCurrentMetaAnalysis failed:', e)));
            } else {
                // Direct CSV fallback
                console.log('[MetaBinder] No loader found, loading CSV directly…');
                promises.push((async () => {
                    try {
                        const data = await loadCSV('current_meta_card_data.csv');
                        if (data && data.length > 0) {
                            window.currentMetaAnalysisData = data;
                            if (typeof populateCurrentMetaDeckSelect === 'function') {
                                await populateCurrentMetaDeckSelect(data);
                            }
                            window.currentMetaAnalysisLoaded = true;
                        }
                    } catch (e) { console.warn('[MetaBinder] Direct CSV load failed:', e); }
                })());
            }
        }

        // Load City League Analysis if not already present
        if (!window.cityLeagueAnalysisLoaded) {
            if (typeof loadCityLeagueAnalysis === 'function') {
                console.log('[MetaBinder] Triggering loadCityLeagueAnalysis()…');
                promises.push(loadCityLeagueAnalysis().catch(e => console.warn('[MetaBinder] loadCityLeagueAnalysis failed:', e)));
            } else {
                // Direct CSV fallback
                console.log('[MetaBinder] No CL loader found, loading CSV directly…');
                promises.push((async () => {
                    try {
                        const data = await loadCSV('city_league_analysis.csv');
                        if (data && data.length > 0) {
                            window.cityLeagueAnalysisData = data;
                            if (typeof populateCityLeagueDeckSelect === 'function') {
                                await populateCityLeagueDeckSelect(data);
                            }
                            window.cityLeagueAnalysisLoaded = true;
                        }
                    } catch (e) { console.warn('[MetaBinder] Direct CL CSV load failed:', e); }
                })());
            }
        }

        // Always load both City League eras for Meta Binder source buckets.
        promises.push((async () => {
            try {
                const [currentRows, pastRows] = await Promise.all([
                    loadCSV('city_league_analysis.csv').catch(() => []),
                    loadCSV('city_league_analysis_M3.csv').catch(() => [])
                ]);
                if (Array.isArray(currentRows) && currentRows.length > 0) {
                    window.cityLeagueAnalysisDataCurrent = currentRows;
                }
                if (Array.isArray(pastRows) && pastRows.length > 0) {
                    window.cityLeagueAnalysisDataPast = pastRows;
                    window.cityLeagueAnalysisM3Data = pastRows;
                }
            } catch (e) {
                console.warn('[MetaBinder] Could not load both city league eras:', e);
            }
        })());

        if (promises.length > 0) {
            console.log('[MetaBinder] Waiting for', promises.length, 'data sources…');
            await Promise.all(promises);
            console.log('[MetaBinder] Data loading complete.',
                'currentMetaAnalysisData:', Array.isArray(window.currentMetaAnalysisData) ? window.currentMetaAnalysisData.length + ' rows' : 'null',
                'cityLeagueAnalysisData:', Array.isArray(window.cityLeagueAnalysisData) ? window.cityLeagueAnalysisData.length + ' rows' : 'null');
        }
    }

    // ── Main: build the binder ──
    async function buildMetaBinder() {
        const grid = document.getElementById('metaBinderGrid');
        if (grid) grid.innerHTML = `<p class="color-grey">${mbText('mb.loading', 'Loading meta data…')}</p>`;

        console.log('[MetaBinder] Building binder…');
        await ensureMetaDataLoaded();

        const currentMetaRows = Array.isArray(window.currentMetaAnalysisData) ? window.currentMetaAnalysisData : [];
        window._metaBinderCurrentMetaLabel = getCurrentMetaFormatLabelFromRows(currentMetaRows);
        const currentTop20 = await getTopCurrentMetaArchetypes(20);

        const cityCurrentRows = Array.isArray(window.cityLeagueAnalysisDataCurrent)
            ? window.cityLeagueAnalysisDataCurrent
            : (Array.isArray(window.cityLeagueAnalysisData) ? window.cityLeagueAnalysisData : []);
        const cityPastRows = Array.isArray(window.cityLeagueAnalysisDataPast)
            ? window.cityLeagueAnalysisDataPast
            : (Array.isArray(window.cityLeagueAnalysisM3Data) ? window.cityLeagueAnalysisM3Data : []);

        const cityCurrentTop10 = await getTopCityArchetypes('city_league_archetypes_comparison.csv', cityCurrentRows, 10);
        const cityPastTop10 = await getTopCityArchetypes('city_league_archetypes_comparison_M3.csv', cityPastRows, 10);

        const topGroupDefs = [
            { title: 'Top 20 Current Meta', source: 'current-meta', names: currentTop20 },
            { title: 'Top 10 City League current', source: 'city-current', names: cityCurrentTop10 },
            { title: 'Top 10 City League past', source: 'city-past', names: cityPastTop10 }
        ];

        const metricMaps = await loadMetaBinderArchetypeMetricMaps();
        window._metaBinderArchetypeGroups = buildMetaBinderArchetypeGroups(topGroupDefs, metricMaps);

        const sourceTargets = [
            ...currentTop20.map(name => ({ name, source: 'current-meta' })),
            ...cityCurrentTop10.map(name => ({ name, source: 'city-current' })),
            ...cityPastTop10.map(name => ({ name, source: 'city-past' }))
        ];

        console.log('[MetaBinder] Source archetypes:', {
            currentTop20: currentTop20.length,
            cityCurrentTop10: cityCurrentTop10.length,
            cityPastTop10: cityPastTop10.length
        });

        if (sourceTargets.length === 0) {
            showToast(mbText('mb.noData', 'No meta data loaded yet. Please visit Current Meta or City League first.'), 'warning');
            if (grid) grid.innerHTML = '';
            return;
        }

        const binderMap = collectBinderCards(sourceTargets);
        if (binderMap.size === 0) {
            showToast(mbText('mb.noCards', 'No card data found for the selected archetypes.'), 'warning');
            if (grid) grid.innerHTML = '';
            return;
        }

        const delta = computeDelta(binderMap);

        // Store on window for the action buttons
        window._metaBinderDelta = delta;

        renderMetaBinder(delta);
        showToast(mbText('mb.generated', 'Meta Binder generated!'), 'success');
    }

    // ── Quick-Action: Send NEW cards to proxy printer ──
    function metaBinderProxyNewCards() {
        const delta = window._metaBinderDelta;
        if (!delta || !delta.cards) return;

        const newCards = delta.cards.filter(c => c.isNew && c.missing > 0);
        if (newCards.length === 0) {
            showToast(mbText('mb.noNewMissing', 'No new missing cards to proxy.'), 'info');
            return;
        }

        let totalAdded = 0;
        newCards.forEach(card => {
            if (typeof addCardToProxy === 'function') {
                addCardToProxy(card.name, card.set, card.number, card.missing, true);
                totalAdded += card.missing;
            }
        });

        if (typeof renderProxyQueue === 'function') renderProxyQueue();
        showToast(mbText('mb.proxyNewDone', '{count} new cards sent to Proxy Printer.').replace('{count}', String(totalAdded)), 'success');
    }

    // ── Quick-Action: Add missing to wishlist ──
    function metaBinderAddMissingToWishlist() {
        const delta = window._metaBinderDelta;
        if (!delta || !delta.cards) return;

        if (!window.auth?.currentUser) {
            showToast(mbText('mb.signInRequired', 'Please sign in to use this feature.'), 'warning');
            return;
        }

        const missingCards = delta.cards.filter(c => c.missing > 0);
        if (missingCards.length === 0) {
            showToast(mbText('mb.nothingMissing', 'All cards are already in your collection!'), 'info');
            return;
        }

        let added = 0;
        missingCards.forEach(card => {
            if (!window.userWishlist || !window.userWishlist.has(card.cardId)) {
                if (typeof addToWishlist === 'function') {
                    addToWishlist(card.cardId);
                    added++;
                }
            }
        });

        showToast(mbText('mb.wishlistDone', '{count} cards added to wishlist.').replace('{count}', String(added)), 'success');
    }

    // ── Quick-Action: Send missing to proxy printer ──
    function metaBinderSendMissingToProxy() {
        const delta = window._metaBinderDelta;
        if (!delta || !delta.cards) return;

        const missingCards = delta.cards.filter(c => c.missing > 0);
        if (missingCards.length === 0) {
            showToast(mbText('mb.nothingMissing', 'All cards are already in your collection!'), 'info');
            return;
        }

        let totalAdded = 0;
        missingCards.forEach(card => {
            if (typeof addCardToProxy === 'function') {
                addCardToProxy(card.name, card.set, card.number, card.missing, true);
                totalAdded += card.missing;
            }
        });

        if (typeof renderProxyQueue === 'function') renderProxyQueue();
        showToast(mbText('mb.proxyDone', '{count} cards sent to Proxy Printer.').replace('{count}', String(totalAdded)), 'success');
    }

    // ── Expose ──
    window.buildMetaBinder = buildMetaBinder;
    window.metaBinderAddMissingToWishlist = metaBinderAddMissingToWishlist;
    window.metaBinderSendMissingToProxy = metaBinderSendMissingToProxy;
    window.metaBinderProxyNewCards = metaBinderProxyNewCards;
    window.setMetaBinderFilter = setMetaBinderFilter;
    window.applyComplexMetaFilter = applyComplexMetaFilter;
    window.openMetaBinderDroppedModal = openMetaBinderDroppedModal;
    window.closeMetaBinderDroppedModal = closeMetaBinderDroppedModal;

    // ── Shared internals for Custom Binder ──
    window._mbShared = {
        ensureMetaDataLoaded,
        collectBinderCards,
        computeDelta,
        sortMetaCards,
        findCardImage,
        findCardRecord,
        getMetaBinderTypeMeta,
        getMetaBinderSortCategory,
        getMetaBinderPokemonDex,
        getMetaBinderSetOrderValue,
        parseCardNumberForSort,
        compareMetaBinderEntries,
        normalizeArchetypeKey,
        getCardsForArchetypeSource,
        escapeArchetypeForJs,
        pickArchetypeBannerImage,
        mbText,
        formatMetaBinderMetric,
        loadMetaBinderArchetypeMetricMaps,
        buildMetaBinderArchetypeGroups,
        getCurrentMetaFormatLabelFromRows,
        getTopCurrentMetaArchetypes,
        getTopCityArchetypes
    };
})();
