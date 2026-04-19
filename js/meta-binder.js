(function () {
    'use strict';

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
            const getCardName = (card) => String(card.name_en || card.name || '').trim().toLowerCase();
            let candidates = window.allCardsDatabase.filter(card =>
                getCardName(card) === normalizedTarget &&
                !/^M\d+$/i.test(String(card.set || '').trim())
            );

            // Fuzzy fallback for JP special energies with slightly different EN names
            // e.g. "Growth Grass Energy" → "Growing Grass Energy", "Telepath Psychic Energy" → "Telepathic Psychic Energy"
            if (candidates.length === 0) {
                const energySuffix = normalizedTarget.match(/((?:grass|fire|water|lightning|psychic|fighting|darkness|metal|fairy|dragon)\s+energy)$/i);
                if (energySuffix) {
                    const suffix = energySuffix[1].toLowerCase();
                    candidates = window.allCardsDatabase.filter(card => {
                        const cName = getCardName(card);
                        const cType = String(card.type || '').trim().toLowerCase();
                        return cName.endsWith(suffix) && cName !== normalizedTarget &&
                            cType.includes('special energy') && !/^M\d+$/i.test(String(card.set || '').trim());
                    });
                }
            }

            if (candidates.length > 0) {
                const setOrder = window.setOrderMap || {};
                const best = candidates.slice().sort((a, b) => {
                    const orderA = setOrder[a.set] || 0;
                    const orderB = setOrder[b.set] || 0;
                    if (orderA !== orderB) return orderB - orderA;
                    return String(a.number || '').localeCompare(String(b.number || ''));
                })[0];

                return {
                    name: String(best.name_en || best.name || rawName).trim(),
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

            // Common and Uncommon are both standard playable prints — same tier
            // so that set recency (newer set wins) breaks the tie.
            if (r.includes('uncommon')) return 1;
            if (r.includes('common')) return 1;

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

            // Promos are from tins/boxes/events, not regular booster packs.
            // Prefer any regular pack rarity (including Double Rare for ex) over Promos.
            if (r.includes('promo')) return 11;

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
            if (r === 'rare' || r.includes('holo rare') || r.includes('reverse holo')) return 5;
            if (
                r.includes('double rare') ||
                r === 'ex' ||
                r === 'v' ||
                r.includes(' ex') ||
                r.includes(' v') ||
                r === 'dr'
            ) return 10;
            if (r.includes('promo')) return 11;
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
            // ACE SPECs are always Ultra Rare or higher — Common/Uncommon/Rare can never be ACE SPEC
            const nonAceRarities = ['common', 'uncommon', 'rare'];
            if (nonAceRarities.some(r => rarity === r)) return false;
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
                const resolved = resolveCityLeagueDisplayPrint(rawName, rawSet, rawNumber);
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
    /**
     * Load the previous binder snapshot.
     * Logged-in users: from Firestore (cross-device).
     * Guest users: empty set (no comparison).
     */
    async function loadPreviousBinderIds() {
        const user = window.auth?.currentUser;
        if (user && window.db) {
            try {
                const doc = await window.db.collection('users').doc(user.uid).get();
                const data = doc.exists ? doc.data() : {};
                const arr = Array.isArray(data.metaBinderSnapshot) ? data.metaBinderSnapshot : [];
                const ts = data.metaBinderSnapshotDate || null;
                return { ids: new Set(arr), date: ts, hasProfile: true };
            } catch (e) {
                console.warn('[MetaBinder] Firestore load failed, falling back to localStorage', e);
            }
        }
        // Guest: no comparison data
        return { ids: new Set(), date: null, hasProfile: false };
    }

    /**
     * Save the current binder snapshot.
     * Logged-in users: to Firestore (IDs for comparison + full card defs for reload).
     */
    async function saveBinderSnapshot(cardIds, cards) {
        const arr = Array.from(cardIds);
        const user = window.auth?.currentUser;
        if (user && window.db) {
            try {
                const payload = {
                    metaBinderSnapshot: arr,
                    metaBinderSnapshotDate: new Date().toISOString()
                };
                // Save card definitions for "load last binder" feature
                if (Array.isArray(cards) && cards.length > 0) {
                    payload.metaBinderCards = cards.map(c => ({
                        cardId: c.cardId, name: c.name, set: c.set, number: c.number,
                        maxCount: c.maxCount, decks: c.decks || [], type: c.type || '',
                        rarity: c.rarity || '', isAceSpec: !!c.isAceSpec,
                        familyRefs: c.familyRefs || []
                    }));
                }
                await window.db.collection('users').doc(user.uid).update(payload);
            } catch (e) {
                console.warn('[MetaBinder] Firestore save failed', e);
            }
        }
    }

    /**
     * Recalculate ownership for a list of saved card definitions
     * using the current collection state.
     */
    function recalcOwnership(savedCards) {
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
        return savedCards.map(c => {
            const exactCardId = buildCardId(c.name, c.set, c.number);
            const ownedExact = collectionCounts.get(exactCardId) || 0;
            const ownedIntlTotal = countOwnedIntlRefs(c.familyRefs);
            const needed = c.maxCount || 0;
            const effectiveOwned = ownedIntlTotal;
            const missing = Math.max(0, needed - effectiveOwned);
            const ownershipMode = ownedExact >= needed
                ? 'exact'
                : (ownedIntlTotal >= needed ? 'intl-complete' : 'missing');
            return {
                cardId: c.cardId, name: c.name, set: c.set, number: c.number,
                maxCount: needed, owned: effectiveOwned, ownedExact, ownedIntlTotal,
                missing, ownershipMode, isNew: false,
                decks: c.decks || [], type: c.type || '',
                rarity: c.rarity || '', isAceSpec: !!c.isAceSpec,
                familyRefs: c.familyRefs || []
            };
        });
    }

    /**
     * Load the last saved Meta Binder from Firestore and render it.
     * Ownership is recalculated from the current collection.
     */
    async function loadSavedMetaBinder() {
        const user = window.auth?.currentUser;
        if (!user || !window.db) {
            showToast(mbText('mb.loginRequired', 'Bitte einloggen um den letzten Binder zu laden.'), 'warning');
            return;
        }
        try {
            showToast(mbText('mb.loadingSaved', 'Lade gespeicherten Binder…'), 'info');
            const doc = await window.db.collection('users').doc(user.uid).get();
            const data = doc.exists ? doc.data() : {};
            const savedCards = Array.isArray(data.metaBinderCards) ? data.metaBinderCards : [];
            const savedDate = data.metaBinderSnapshotDate || null;
            if (savedCards.length === 0) {
                showToast(mbText('mb.noSaved', 'Kein gespeicherter Binder vorhanden. Bitte zuerst generieren.'), 'warning');
                return;
            }
            const cards = recalcOwnership(savedCards);
            const delta = {
                cards,
                droppedCards: [],
                hasProfile: true,
                snapshotDate: savedDate
            };
            window._metaBinderDelta = delta;
            renderMetaBinder(delta);
            const dateStr = savedDate ? new Date(savedDate).toLocaleDateString('de-DE') : '?';
            showToast(mbText('mb.loadedSaved', `Binder vom ${dateStr} geladen – Besitzstand aktualisiert.`), 'success');
        } catch (e) {
            console.error('[MetaBinder] loadSavedMetaBinder failed', e);
            showToast(mbText('mb.loadError', 'Fehler beim Laden des Binders.'), 'error');
        }
    }

    async function computeDelta(binderMap) {
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

        // Load previous binder snapshot (Firestore for logged-in, empty for guests)
        const prev = await loadPreviousBinderIds();
        const previousIds = prev.ids;
        const hasProfile = prev.hasProfile;
        const snapshotDate = prev.date;

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
                isNew: hasProfile && previousIds.size > 0 ? !wasInPrevious : false,
                decks: entry.decks,
                type: entry.type,
                rarity: entry.rarity,
                isAceSpec: !!entry.isAceSpec,
                familyRefs: entry.familyRefs || []
            });
        });

        // Cards that were in the previous binder but no longer needed
        // For guests without profile: no New/Dropped comparison
        const currentIds = new Set(binderMap.keys());
        const droppedCards = [];
        if (hasProfile && previousIds.size > 0) {
            previousIds.forEach(oldId => {
                if (!currentIds.has(oldId)) {
                    const [name, set, number] = oldId.split('|');
                    droppedCards.push({ cardId: oldId, name: name || oldId, set: set || '', number: number || '' });
                }
            });
        }

        // Save current binder snapshot to Firestore (logged-in) 
        await saveBinderSnapshot(currentIds, results);

        return { cards: results, droppedCards, hasProfile, snapshotDate };
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
            const resolved = resolveCityLeagueDisplayPrint(rawName, rawSet, rawNumber);
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
        const resolved = resolveCityLeagueDisplayPrint(rawName, rawSet, rawNumber);

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
        if (found && (found.image_url || found.image)) return found.image_url || found.image;

        // Fallback: use getUnifiedCardImage if available (handles M3/M4 proxy URLs)
        if (typeof window.getUnifiedCardImage === 'function') {
            const unified = window.getUnifiedCardImage(set, number);
            if (unified) return unified;
        }
        return '';
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
            // 1. Try DB energy_type (TCG card type from limitlesstcg detail page)
            let element = '';
            if (cardDb) {
                element = normalizePokemonElement(cardDb.energy_type || '');
            }

            // 2. Try row type from analysis CSV (sometimes has element info)
            if (!element) {
                element = normalizePokemonElement(rowType);
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

            // Trainer cards: sort by deck count descending (most-used first)
            const aDeckCount = Number.isFinite(a.deckCount) ? a.deckCount : 0;
            const bDeckCount = Number.isFinite(b.deckCount) ? b.deckCount : 0;
            if (aDeckCount !== bDeckCount) return bDeckCount - aDeckCount;

            // Name before setOrder — keeps all prints of a card grouped together
            const catNameA = String(a.name || '');
            const catNameB = String(b.name || '');
            const catNameCmp = META_BINDER_NAME_COLLATOR.compare(catNameA, catNameB);
            if (catNameCmp !== 0) return catNameCmp;

            const catSetOrderA = Number.isFinite(a.setOrder) ? a.setOrder : 0;
            const catSetOrderB = Number.isFinite(b.setOrder) ? b.setOrder : 0;
            if (catSetOrderA !== catSetOrderB) return catSetOrderB - catSetOrderA;

            const catNumberA = Number.isFinite(a.numberSort) ? a.numberSort : Number.MAX_SAFE_INTEGER;
            const catNumberB = Number.isFinite(b.numberSort) ? b.numberSort : Number.MAX_SAFE_INTEGER;
            return catNumberA !== catNumberB ? catNumberA - catNumberB : 0;
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
                    numberSort: parseCardNumberForSort(a.number),
                    deckCount: Array.isArray(a.decks) ? a.decks.length : 0
                },
                {
                    name: b.name,
                    set: b.set,
                    number: b.number,
                    typeMeta: getMetaBinderTypeMeta(b),
                    dexNumber: getMetaBinderPokemonDex(b, bCardDb),
                    setOrder: getMetaBinderSetOrderValue(b.set),
                    numberSort: parseCardNumberForSort(b.number),
                    deckCount: Array.isArray(b.decks) ? b.decks.length : 0
                }
            );
        });
    }

    /**
     * Sort for All Prints mode: group by name, within each name newest set first.
     * Category order (Pokemon > Supporter > Item …) is kept as primary sort.
     */
    function sortMetaCardsAllPrints(cards) {
        return cards.sort((a, b) => {
            const aTypeMeta = getMetaBinderTypeMeta(a);
            const bTypeMeta = getMetaBinderTypeMeta(b);
            const aCat = META_BINDER_CATEGORY_ORDER[getMetaBinderSortCategory(aTypeMeta)] || 99;
            const bCat = META_BINDER_CATEGORY_ORDER[getMetaBinderSortCategory(bTypeMeta)] || 99;
            if (aCat !== bCat) return aCat - bCat;

            // For Trainer categories: sort by deck count descending before grouping by name
            const trainerCats = new Set(['Supporter', 'Item', 'Tool', 'Stadium', 'Special Energy']);
            const aCatName = getMetaBinderSortCategory(aTypeMeta);
            const bCatName = getMetaBinderSortCategory(bTypeMeta);
            if (trainerCats.has(aCatName) && trainerCats.has(bCatName)) {
                const aDeck = Array.isArray(a.decks) ? a.decks.length : 0;
                const bDeck = Array.isArray(b.decks) ? b.decks.length : 0;
                if (aDeck !== bDeck) return bDeck - aDeck;
            }

            // Primary: group by card name
            const nameCmp = META_BINDER_NAME_COLLATOR.compare(
                String(a.name || ''), String(b.name || '')
            );
            if (nameCmp !== 0) return nameCmp;

            // Secondary: newest set first within same name
            const setA = getMetaBinderSetOrderValue(a.set) || 0;
            const setB = getMetaBinderSetOrderValue(b.set) || 0;
            if (setA !== setB) return setB - setA;

            // Tertiary: card number
            const numA = parseCardNumberForSort(a.number);
            const numB = parseCardNumberForSort(b.number);
            return numA - numB;
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
                numberSort: parseMetaBinderDomNumber(a.dataset.numberSort),
                deckCount: parseMetaBinderDomNumber(a.dataset.deckCount)
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
                numberSort: parseMetaBinderDomNumber(b.dataset.numberSort),
                deckCount: parseMetaBinderDomNumber(b.dataset.deckCount)
            }
        ));

        const fragment = document.createDocumentFragment();
        cards.forEach(card => fragment.appendChild(card));
        grid.appendChild(fragment);
    }

    window.sortMetaBinder = sortMetaBinder;

    // ── Active filter for the binder view ──
    let metaBinderFilter = 'all'; // 'all', 'new', 'missing'
    let metaBinderAllPrints = false;

    function setMetaBinderPrintView(showAll) {
        metaBinderAllPrints = showAll;
        const btnStd = document.getElementById('mbBtnStandardPrint');
        const btnAll = document.getElementById('mbBtnAllPrints');
        if (btnStd) btnStd.classList.toggle('active', !showAll);
        if (btnAll) btnAll.classList.toggle('active', showAll);
        applyComplexMetaFilter();
    }

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
                                <span class="stat-badge rank-performance-hint" style="background:#fff3e0;color:#e65100;" title="Lower Rank = Better Performance">${currentMetaLabel}: ${rankText}</span>
                                <span class="stat-badge">${currentMetaLabel}: ${shareText}</span>
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

        const { cards, droppedCards, hasProfile, snapshotDate } = delta;
        window._metaBinderDroppedCards = droppedCards;
        const totalUnique = cards.length;
        const totalCopies = cards.reduce((s, c) => s + c.maxCount, 0);
        const missingUnique = cards.filter(c => c.missing > 0).length;
        const missingCopies = cards.reduce((s, c) => s + c.missing, 0);
        const ownedComplete = cards.filter(c => c.missing === 0).length;
        const newCount = cards.filter(c => c.isNew).length;
        const droppedCount = droppedCards.length;

        // Determine label for New/Dropped based on profile availability
        const hasSnapshot = hasProfile && (newCount > 0 || droppedCount > 0 || snapshotDate);
        let comparisonHint = '';
        if (hasProfile && snapshotDate) {
            const d = new Date(snapshotDate);
            comparisonHint = ` (vs. ${d.toLocaleDateString('de-DE')})`;
        }
        const newLabel = hasProfile
            ? mbText('mb.newSinceLastGen', 'Neu seit letztem Generate') + comparisonHint
            : mbText('mb.newNeedProfile', 'Neu (Login nötig)');
        const droppedLabel = hasProfile
            ? mbText('mb.droppedSinceLastGen', 'Dropped') + comparisonHint
            : mbText('mb.droppedNeedProfile', 'Dropped (Login nötig)');

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
                <div class="meta-binder-stat"${!hasProfile ? ' title="Login nötig für Vergleich"' : ''}>
                    <span class="meta-binder-stat-value" style="color:#3B4CCA">${hasProfile ? newCount : '–'}</span>
                    <span class="meta-binder-stat-label">${newLabel}</span>
                </div>
                <button class="meta-binder-stat meta-binder-stat-clickable" type="button" onclick="openMetaBinderDroppedModal()" title="${mbText('mb.openDroppedModal', 'Show dropped cards')}"${!hasProfile ? ' disabled' : ''}>
                    <span class="meta-binder-stat-value" style="color:#e67e22">${hasProfile ? droppedCount : '–'}</span>
                    <span class="meta-binder-stat-label">${droppedLabel}</span>
                </button>`;
        }

            renderMetaBinderArchetypeGroups(deltaEl);

        // Filter buttons
        if (filtersEl) {
            filtersEl.classList.remove('display-none');
            filtersEl.innerHTML = `
                <div class="filter-group">
                    <button class="meta-binder-filter-btn active" data-filter="all" onclick="setMetaBinderFilter('all')">${mbText('mb.filterAll', 'Alle')} (${totalUnique})</button>
                    <button class="meta-binder-filter-btn" data-filter="owned" onclick="setMetaBinderFilter('owned')">${mbText('mb.filterOwned', 'Im Besitz')} (${ownedComplete})</button>
                    <button class="meta-binder-filter-btn" data-filter="missing" onclick="setMetaBinderFilter('missing')">${mbText('mb.filterMissing', 'Fehlend')} (${missingUnique})</button>
                    ${hasProfile ? `<button class="meta-binder-filter-btn" data-filter="new" onclick="setMetaBinderFilter('new')">🆕 ${mbText('mb.filterNew', 'Neu')} (${newCount})</button>` : ''}
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
                </div>
                <div class="filter-group">
                    <button id="mbBtnStandardPrint" class="meta-binder-filter-btn active" onclick="setMetaBinderPrintView(false)">Standard Print</button>
                    <button id="mbBtnAllPrints" class="meta-binder-filter-btn" onclick="setMetaBinderPrintView(true)">All Prints</button>
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
        } else if (metaBinderFilter === 'owned') {
            filtered = cards.filter(c => c.missing === 0);
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

        // ── All Prints expansion ──
        if (metaBinderAllPrints) {
            const collectionCounts = window.userCollectionCounts || new Map();
            const expanded = [];
            filtered.forEach(card => {
                const refs = Array.isArray(card.familyRefs) ? card.familyRefs : [];
                if (refs.length <= 1) {
                    expanded.push(card);
                    return;
                }
                refs.forEach(ref => {
                    const parsed = parseIntlPrintRef(ref);
                    if (!parsed.set || !parsed.number) return;
                    const printCardId = buildCardId(card.name, parsed.set, parsed.number);
                    const ownedExact = collectionCounts.get(printCardId) || 0;
                    expanded.push({
                        ...card,
                        set: parsed.set,
                        number: parsed.number,
                        cardId: printCardId,
                        ownedExact,
                        owned: ownedExact,
                        ownedIntlTotal: ownedExact,
                        missing: Math.max(0, card.maxCount - ownedExact),
                        ownershipMode: ownedExact >= card.maxCount ? 'exact' : 'missing',
                        familyRefs: refs,
                        _isPrintExpansion: true
                    });
                });
            });
            filtered = expanded;
        }

        // In All Prints mode: group by card name so all prints appear together
        const sorted = metaBinderAllPrints
            ? sortMetaCardsAllPrints([...filtered])
            : sortMetaCards([...filtered]);

        if (sorted.length === 0) {
            grid.innerHTML = `<p class="color-grey">${mbText('mb.empty', 'No meta card data found. Make sure Current Meta or City League data is loaded.')}</p>`;
            return;
        }

        // Build card HTML for each entry
        const cardHtmlEntries = sorted.map(card => {
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
            const safeCardId = escapeHtml(buildCardId(card.name, card.set, card.number));
            const ownedCount = card.ownedExact || 0;
            const userWantsCard = window.userWishlist && window.userWishlist.has(buildCardId(card.name, card.set, card.number));
            const printCount = Array.isArray(card.familyRefs) ? card.familyRefs.length : 0;
            const safeSet = escapeHtml(String(card.set || ''));
            const safeNumber = escapeHtml(String(card.number || ''));

            return {
                name: card.name,
                html: `
                <div class="meta-binder-card ${statusClass}" data-type="${escapeHtml(typeMeta.type)}" data-set="${safeSet}" data-supertype="${escapeHtml(typeMeta.supertype)}" data-is-ace-spec="${typeMeta.isAceSpec ? 'true' : 'false'}" data-name="${safeName}" data-pokedex="${String(dexNumber)}" data-set-order="${String(setOrder)}" data-number-sort="${String(numberSort)}" data-deck-count="${String(card.decks ? card.decks.length : 0)}" data-card-id="${safeCardId}" title="Wird verwendet in: ${deckList}${ownershipHint}">
                    ${imageUrl
                        ? `<img src="${safeImage}" alt="${safeName}" class="meta-binder-card-img" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                           <div class="meta-binder-card-fallback" style="display:none">${safeName}</div>`
                        : `<div class="meta-binder-card-fallback">${safeName}<br><small>${escapeHtml(card.set)} ${escapeHtml(card.number)}</small></div>`}
                    <div class="pos-abs card-action-row-wide card-database-top-actions">
                        <button type="button" data-card-id="${safeCardId}" onclick="addCollectionFromCardDbButton(this)" class="btn-green card-badge" title="Add to collection (${ownedCount}/4)" aria-label="Add ${safeName} to collection">+</button>
                        <button type="button" data-card-id="${safeCardId}" onclick="removeCollectionFromCardDbButton(this)" class="btn-red card-badge" style="color: ${ownedCount > 0 ? '#fff' : '#999'}; background: ${ownedCount > 0 ? '#dc3545' : '#fff'};" title="Remove from collection (${ownedCount}/4)" aria-label="Remove ${safeName} from collection">-</button>
                        <button type="button" data-card-id="${safeCardId}" data-missing="${String(Math.max(0, (card.maxCount || 0) - (card.ownedExact || 0)))}" onclick="toggleWishlistMetaBinder(this)" class="btn-wishlist card-badge" style="color: #fff; background: ${userWantsCard ? '#E91E63' : '#F48FB1'}; border: 2px solid ${userWantsCard ? '#E91E63' : '#F48FB1'};" title="${userWantsCard ? 'Remove from wishlist' : 'Add missing (' + Math.max(0, (card.maxCount || 0) - (card.ownedExact || 0)) + ') to wishlist'}" aria-label="${userWantsCard ? 'Remove' : 'Add'} ${safeName} wishlist">${userWantsCard ? '&#9829;' : '&#9825;'}</button>
                    </div>
                    <div class="meta-binder-card-info">
                        ${newBadge}
                        <span class="meta-binder-card-need">${card.maxCount}x</span>
                        <div class="deck-indicator-count">${card.decks.length} Decks</div>
                        ${countLabel}
                    </div>
                    ${printCount > 1 ? `<button type="button" class="meta-binder-prints-btn" onclick="openRaritySwitcherFromDB('${safeName.replace(/'/g, "\\'")}','${safeSet}','${safeNumber}')" title="${printCount} Prints verfügbar" aria-label="Show all prints for ${safeName}">🖨 ${printCount} Prints</button>` : ''}
                </div>`
            };
        });

        // In All Prints mode: group consecutive same-name cards into horizontal flex rows
        if (metaBinderAllPrints) {
            const groups = [];
            let currentGroup = null;
            cardHtmlEntries.forEach(entry => {
                if (!currentGroup || currentGroup.name !== entry.name) {
                    currentGroup = { name: entry.name, cards: [] };
                    groups.push(currentGroup);
                }
                currentGroup.cards.push(entry.html);
            });
            grid.innerHTML = '<style>.meta-binder-print-group{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start;margin-bottom:16px;padding:10px;background:rgba(0,0,0,0.03);border-radius:10px;border:1px solid rgba(0,0,0,0.06)}.meta-binder-print-group .meta-binder-card{margin:0}</style>'
                + groups.map(g =>
                    g.cards.length > 1
                        ? `<div class="meta-binder-print-group">${g.cards.join('')}</div>`
                        : g.cards[0]
                ).join('');
        } else {
            grid.innerHTML = cardHtmlEntries.map(e => e.html).join('');
        }

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

        const delta = await computeDelta(binderMap);

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
    // ── Re-render binder when remaining card DB chunks finish loading ──
    let _metaBinderChunkCount = 0;
    let _chunkPollId = null;

    function _startChunkPoll() {
        _metaBinderChunkCount = (window.allCardsDatabase || []).length;
        if (_chunkPollId) clearInterval(_chunkPollId);
        _chunkPollId = setInterval(() => {
            const cur = (window.allCardsDatabase || []).length;
            if (cur > _metaBinderChunkCount) {
                console.log('[MetaBinder] Card DB grew (' + _metaBinderChunkCount + ' → ' + cur + '), re-rendering…');
                _metaBinderChunkCount = cur;
                clearInterval(_chunkPollId);
                _chunkPollId = null;
                buildMetaBinder();
            }
        }, 1500);
        // Stop polling after 30s
        setTimeout(() => { if (_chunkPollId) { clearInterval(_chunkPollId); _chunkPollId = null; } }, 30000);
    }

    // Wrap buildMetaBinder to start chunk polling after each build
    const _origBuildMetaBinder = buildMetaBinder;
    async function buildMetaBinderWithChunkWatch() {
        await _origBuildMetaBinder();
        _startChunkPoll();
    }

    // ── Live-refresh ownership visuals for Meta Binder cards ──
    function refreshMetaBinderOwnership() {
        const grid = document.getElementById('meta-binder-grid');
        if (!grid) return;
        const collectionCounts = window.userCollectionCounts || new Map();
        const cards = grid.querySelectorAll('.meta-binder-card[data-card-id]');
        cards.forEach(el => {
            const cardId = el.getAttribute('data-card-id');
            if (!cardId) return;
            const owned = collectionCounts.get(cardId) || 0;
            // Read maxCount from the "Nx" need badge
            const needEl = el.querySelector('.meta-binder-card-need');
            const maxCount = needEl ? (parseInt(needEl.textContent, 10) || 1) : 1;
            const isComplete = owned >= maxCount;

            // Update CSS classes
            el.classList.toggle('meta-binder-card-owned', isComplete);
            el.classList.toggle('card-owned', isComplete);
            el.classList.toggle('meta-binder-card-missing', !isComplete);
            el.classList.toggle('card-missing', !isComplete);
            el.classList.remove('meta-binder-card-owned-intl');

            // Update count label
            const countOk = el.querySelector('.meta-binder-count-ok');
            const countMissing = el.querySelector('.meta-binder-count-missing');
            const countIntl = el.querySelector('.meta-binder-count-intl');
            const oldLabel = countOk || countMissing || countIntl;
            if (oldLabel) {
                if (isComplete) {
                    oldLabel.className = 'meta-binder-count-ok';
                    oldLabel.textContent = `${owned}/${maxCount} ✓`;
                } else {
                    oldLabel.className = 'meta-binder-count-missing';
                    oldLabel.textContent = `${owned}/${maxCount}`;
                }
            }

            // Update +/- button titles and - button styling
            const plusBtn = el.querySelector('.btn-green[data-card-id]');
            const minusBtn = el.querySelector('.btn-red[data-card-id]');
            if (plusBtn) plusBtn.title = `Add to collection (${owned}/4)`;
            if (minusBtn) {
                minusBtn.title = `Remove from collection (${owned}/4)`;
                minusBtn.style.color = owned > 0 ? '#fff' : '#999';
                minusBtn.style.background = owned > 0 ? '#dc3545' : '#fff';
            }

            // Update wishlist button
            const wishBtn = el.querySelector('.btn-wishlist[data-card-id]');
            if (wishBtn) {
                const onWishlist = window.userWishlist && window.userWishlist.has(cardId);
                wishBtn.style.background = onWishlist ? '#E91E63' : '#F48FB1';
                wishBtn.style.borderColor = onWishlist ? '#E91E63' : '#F48FB1';
                wishBtn.innerHTML = onWishlist ? '&#9829;' : '&#9825;';
                const missingNow = Math.max(0, maxCount - owned);
                wishBtn.setAttribute('data-missing', String(missingNow));
                wishBtn.title = onWishlist
                    ? 'Remove from wishlist'
                    : 'Add missing (' + missingNow + ') to wishlist';
            }
        });
    }

    window.buildMetaBinder = buildMetaBinderWithChunkWatch;
    window.loadSavedMetaBinder = loadSavedMetaBinder;
    window.refreshMetaBinderOwnership = refreshMetaBinderOwnership;
    window.metaBinderAddMissingToWishlist = metaBinderAddMissingToWishlist;
    window.metaBinderSendMissingToProxy = metaBinderSendMissingToProxy;
    window.metaBinderProxyNewCards = metaBinderProxyNewCards;
    window.setMetaBinderFilter = setMetaBinderFilter;
    window.setMetaBinderPrintView = setMetaBinderPrintView;
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
