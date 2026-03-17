const BASE_PATH = './data/';
        
        // ============================================================
        // GLOBAL DECK SORT HELPERS (Official Pokémon TCG Sort Order)
        // ============================================================
        window.getCardSortPriority = function(card) {
            const supertype = card.supertype || '';
            const subtypes = card.subtypes || [];

            if (supertype === 'Pokémon') return 1;

            if (supertype === 'Trainer') {
                if (subtypes.includes('Supporter')) return 2;
                if (subtypes.includes('Item')) return 3;
                if (subtypes.includes('Pokémon Tool') || subtypes.includes('Tool')) return 4;
                if (subtypes.includes('Stadium')) return 5;
                return 6; // Fallback für unbekannte Trainer
            }

            if (supertype === 'Energy') {
                if (subtypes.includes('Special')) return 7;
                if (subtypes.includes('Basic')) return 8;
                return 9; // Fallback für unbekannte Energien
            }

            return 10; // Catch-all
        };

        window.sortDeckCards = function(cardsArray) {
            return cardsArray.sort((a, b) => {
                // 1. Nach offiziellem Kartentyp sortieren
                const priorityA = window.getCardSortPriority(a);
                const priorityB = window.getCardSortPriority(b);

                if (priorityA !== priorityB) {
                    return priorityA - priorityB;
                }

                // 2. Innerhalb des gleichen Typs alphabetisch sortieren
                const nameA = a.name || '';
                const nameB = b.name || '';
                return nameA.localeCompare(nameB);
            });
        };

        // CRITICAL: Initialize deck objects immediately to prevent undefined errors
        window.cityLeagueDeck = window.cityLeagueDeck || {};
        window.cityLeagueDeckOrder = window.cityLeagueDeckOrder || [];
        window.currentMetaDeck = window.currentMetaDeck || {};
        window.currentMetaDeckOrder = window.currentMetaDeckOrder || [];
        window.pastMetaDeck = window.pastMetaDeck || {};
        window.pastMetaDeckOrder = window.pastMetaDeckOrder || [];
        window.currentCityLeagueArchetype = window.currentCityLeagueArchetype || null;
        window.currentCurrentMetaArchetype = window.currentCurrentMetaArchetype || null;
        window.pastMetaCurrentArchetype = window.pastMetaCurrentArchetype || null;
        
        // Tab switching
        function switchTab(tabName) {
            const tabs = document.querySelectorAll('.tab-content');
            tabs.forEach(tab => tab.classList.remove('active'));
            
            const buttons = document.querySelectorAll('.tab-btn');
            buttons.forEach(btn => btn.classList.remove('active'));
            
            const selectedTab = document.getElementById(tabName);
            if (selectedTab) {
                selectedTab.classList.add('active');
                
                // Load data for the tab
                switch(tabName) {
                    case 'city-league':
                        if (!window.cityLeagueLoaded) loadCityLeagueData();
                        break;
                    case 'city-league-analysis':
                        if (!window.cityLeagueAnalysisLoaded) loadCityLeagueAnalysis();
                        break;
                    case 'current-meta':
                        if (!window.currentMetaLoaded) loadCurrentMeta();
                        break;
                    case 'current-analysis':
                        if (!window.currentAnalysisLoaded) loadCurrentAnalysis();
                        break;
                    case 'past-meta':
                        if (!window.pastMetaLoaded) loadPastMeta();
                        break;
                    case 'cards':
                        if (!window.cardsLoaded) loadCards();
                        break;
                }
            }
            
            // Set active button
            const activeBtn = Array.from(buttons).find(btn => 
                btn.getAttribute('onclick')?.includes(tabName)
            );
            if (activeBtn) {
                activeBtn.classList.add('active');
            }
        }
        
        // Navigate to City League Analysis with pre-selected deck
        function navigateToAnalysisWithDeck(archetypeName) {
            console.log('🔍 Navigating to analysis with deck:', archetypeName);
            window.pendingCityLeagueDeckSelection = archetypeName;
            
            // Switch to City League Analysis tab
            switchTab('city-league-analysis');
            
            // Wait for dropdown to be populated with data
            let attempts = 0;
            const maxAttempts = 50; // Max 5 seconds (50 * 100ms)
            
            const checkAndSelect = () => {
                attempts++;
                const select = document.getElementById('cityLeagueDeckSelect');
                
                if (select && select.options.length > 1) { // More than just placeholder
                    // Find matching option (case-insensitive)
                    const options = Array.from(select.options);
                    const matchingOption = options.find(opt => 
                        opt.value.toLowerCase() === archetypeName.toLowerCase()
                    );
                    
                    if (matchingOption) {
                        select.value = matchingOption.value;
                        window.pendingCityLeagueDeckSelection = null;
                        // Trigger change event to load the deck
                        const event = new Event('change', { bubbles: true });
                        select.dispatchEvent(event);
                        console.log('✅ Deck selected:', matchingOption.value);
                    } else {
                        console.warn('⚠️ Deck not found in dropdown:', archetypeName);
                    }
                } else if (attempts < maxAttempts) {
                    // Retry after 100ms
                    setTimeout(checkAndSelect, 100);
                } else {
                    console.error('? Timeout: Dropdown not populated after 5 seconds');
                }
            };
            
            // Start checking after initial delay
            setTimeout(checkAndSelect, 100);
        }
        
        // Navigate to Current Meta Analysis tab and select a deck
        function navigateToCurrentMetaWithDeck(archetypeName) {
            console.log('🔍 Navigating to Current Meta with deck:', archetypeName);
            
            // Switch to Current Meta Analysis tab
            switchTab('current-meta-analysis');
            
            // Wait for dropdown to be populated with data
            let attempts = 0;
            const maxAttempts = 50; // Max 5 seconds (50 * 100ms)
            
            const checkAndSelect = () => {
                attempts++;
                const select = document.getElementById('currentMetaDeckSelect');
                
                if (select && select.options.length > 1) { // More than just placeholder
                    // Find matching option (case-insensitive)
                    const options = Array.from(select.options);
                    const matchingOption = options.find(opt => 
                        opt.value.toLowerCase() === archetypeName.toLowerCase()
                    );
                    
                    if (matchingOption) {
                        select.value = matchingOption.value;
                        // Trigger change event to load the deck
                        const event = new Event('change', { bubbles: true });
                        select.dispatchEvent(event);
                        console.log('✅ Deck selected:', matchingOption.value);
                    } else {
                        console.warn('⚠️ Deck not found in dropdown:', archetypeName);
                    }
                } else if (attempts < maxAttempts) {
                    // Retry after 100ms
                    setTimeout(checkAndSelect, 100);
                } else {
                    console.error('? Timeout: Dropdown not populated after 5 seconds');
                }
            };
            
            // Start checking after initial delay
            setTimeout(checkAndSelect, 100);
        }
        
        // CSV loading and parsing
        function fixCardNameEncoding(name) {
            if (!name) return name;
            return String(name)
                .replace(/PokÃ©/g, 'Poké')
                .replace(/Ã©/g, 'é')
                .replace(/â€™/g, "'")
                .replace(/Â/g, '')
                .trim();
        }

        function healCurrentMetaCardRows(rows) {
            if (!Array.isArray(rows)) return rows;
            rows.forEach(row => {
                if (!row || typeof row !== 'object') return;
                if (row.card_name) row.card_name = fixCardNameEncoding(row.card_name);
                if (row.full_card_name) row.full_card_name = fixCardNameEncoding(row.full_card_name);
                if (row.name) row.name = fixCardNameEncoding(row.name);
                if (row.name_en) row.name_en = fixCardNameEncoding(row.name_en);
            });
            return rows;
        }

        async function loadCSV(filename) {
            try {
                const timestamp = new Date().getTime();
                const response = await fetch(`${BASE_PATH}${filename}?t=${timestamp}`);
                if (response.ok) {
                    const text = await response.text();
                    const parsed = parseCSV(text);
                    const fileLower = String(filename || '').toLowerCase();
                    if (fileLower.includes('current_meta')) {
                        healCurrentMetaCardRows(parsed);
                    }
                    return parsed;
                }
                return null;
            } catch (e) {
                console.error(`Error loading ${filename}:`, e);
                return null;
            }
        }
        
        function parseCSV(text) {
            return parseCSVWithDelimiter(text, ';');
        }

        function parseCSVWithDelimiter(text, delimiter) {
            // Remove BOM if present
            if (text.charCodeAt(0) === 0xFEFF) {
                text = text.slice(1);
            }
            
            const lines = text.trim().split('\n').filter(line => line.trim());
            if (lines.length < 2) return [];
            
            const headers = lines[0].split(delimiter).map(h => h.trim());
            const data = [];
            
            for (let i = 1; i < lines.length; i++) {
                if (!lines[i].trim()) continue;
                const values = lines[i].split(delimiter);
                const row = {};
                headers.forEach((header, index) => {
                    const rawValue = values[index] || '';
                    const trimmedValue = rawValue.trim();

                    if (header === 'card_name' || header === 'full_card_name') {
                        row[header] = (typeof window.fixCardNameEncoding === 'function')
                            ? window.fixCardNameEncoding(rawValue)
                            : trimmedValue;
                        return;
                    }

                    row[header] = trimmedValue;
                });
                if (Object.values(row).some(v => v)) {
                    data.push(row);
                }
            }
            
            return data;
        }
        
        // Load all cards database for deck builder
        let allCardsDatabase = [];
        let cardIndexMap = new Map(); // O(1) name → card lookup (first entry per name)
        let cardIndexBySetNumber = new Map(); // O(1) set+number -> canonical card lookup
        let cardsByNameMap = {};
        let cardsBySetNumberMap = {}; // Index for fast card lookup by set+number
        let setOrderMap = {}; // Loaded from sets.json – higher number = newer set
        let pokedexNumbers = {}; // name (lowercase) → National Pokédex number
        let englishSetCodes = null;
        let rarityPreferences = {};
        let globalRarityPreference = 'min'; // Default: Show lowest rarity from newest set
        let overviewRarityMode = 'min'; // Current rarity mode for overview section (min, max, or all)
        let overviewCardTypeFilter = 'all'; // Current card type filter for overview section (all, Pokemon, Supporter, Item, Tool, Stadium, Energy, Special Energy, Ace Spec)
        let currentMetaOverviewCardTypeFilter = 'all'; // Card type filter for Current Meta overview
        let pastMetaOverviewCardTypeFilter = 'all'; // Card type filter for Past Meta overview
        window.pendingCityLeagueDeckSelection = null; // Preserves cross-tab deck selection during async reloads
        
        // Ace Specs list - loaded from ace_specs.json
        let aceSpecsList = [];
        
        // Central isAceSpec function - checks against ace_specs.json list ONLY
        function isAceSpec(cardNameOrCard) {
            const cardName = (typeof cardNameOrCard === 'string') ? cardNameOrCard : (cardNameOrCard.card_name || cardNameOrCard.full_card_name || cardNameOrCard.name || '');
            const normalized = cardName.toLowerCase().trim();
            return aceSpecsList.includes(normalized);
        }
        async function loadPokedexNumbers() {
            try {
                const ts = new Date().getTime();
                const resp = await fetch(`./data/pokemon_dex_numbers.json?t=${ts}`);
                if (resp.ok) {
                    pokedexNumbers = await resp.json();
                    window.pokedexNumbers = pokedexNumbers;
                    console.log(`✅ Loaded ${Object.keys(pokedexNumbers).length} Pokédex entries`);
                }
            } catch (e) {
                console.warn('Could not load pokemon_dex_numbers.json', e);
            }
        }

        async function loadSetOrderMap() {
            try {
                const resp = await fetch(`./data/sets.json?t=${Date.now()}`);
                if (resp.ok) {
                    const json = await resp.json();
                    if (json && typeof json === 'object') {
                        setOrderMap = json;
                        window.setOrderMap = json;
                    }
                }
            } catch (e) {
                console.warn('[init] Could not load sets.json for set ordering:', e);
            }
        }

        async function loadAllCardsDatabase() {
            try {
                const timestamp = new Date().getTime();
                const response = await fetch(`./data/all_cards_merged.json?t=${timestamp}`);
                if (response.ok) {
                    const jsonData = await response.json();
                    // Extract cards array from JSON structure
                    allCardsDatabase = jsonData.cards || jsonData;
                    window.allCardsDatabase = allCardsDatabase;
                    cardIndexBySetNumber = buildCardIndexBySetNumber(allCardsDatabase);
                    window.cardIndexBySetNumber = cardIndexBySetNumber;
                    cardsByNameMap = buildCardsByNameMap(allCardsDatabase);
                    window.cardsByNameMap = cardsByNameMap;
                    cardsBySetNumberMap = buildCardsBySetNumberMap(allCardsDatabase); // Build index for fast lookup
                    // Build O(1) name index (exact + normalized keys)
                    cardIndexMap = new Map();
                    allCardsDatabase.forEach(c => {
                        const primaryName = String(c.name_en || c.name || '').trim();
                        if (!primaryName) return;

                        const exactKey = fixMojibake(primaryName);
                        const normalizedKey = normalizeCardName(primaryName);

                        if (!cardIndexMap.has(exactKey)) cardIndexMap.set(exactKey, c);
                        if (normalizedKey && !cardIndexMap.has(normalizedKey)) cardIndexMap.set(normalizedKey, c);
                    });
                    window.cardIndexMap = cardIndexMap;
                    console.log(`✅ Loaded ${allCardsDatabase.length} cards from all_cards_merged.json (with prices)`);
                    console.log(`📊 Karten mit mehreren Versionen:`, Object.keys(cardsByNameMap).filter(k => cardsByNameMap[k].length > 1).length);
                    
                    // Count cards with prices
                    const cardsWithPrices = allCardsDatabase.filter(c => c.eur_price).length;
                    console.log(`💰 Karten mit Preisen: ${cardsWithPrices} (${Math.round(100*cardsWithPrices/allCardsDatabase.length)}%)`);
                    
                    // Initialisiere Suche wenn sie existiert
                    const searchInput = document.getElementById('cityLeagueDeckCardSearch');
                    if (searchInput && searchInput.value.trim()) {
                        searchDeckCards('cityLeague');
                    }
                    
                    const currentMetaSearchInput = document.getElementById('currentMetaDeckCardSearch');
                    if (currentMetaSearchInput && currentMetaSearchInput.value.trim()) {
                        searchDeckCards('currentMeta');
                    }
                    
                    const pastMetaSearchInput = document.getElementById('pastMetaDeckCardSearch');
                    if (pastMetaSearchInput && pastMetaSearchInput.value.trim()) {
                        searchDeckCards('pastMeta');
                    }
                } else {
                    console.error('? Failed to load all_cards_merged.json');
                }
            } catch (error) {
                console.error('Error loading all cards database:', error);
            }
        }
        
        async function loadAceSpecsList() {
            try {
                const timestamp = new Date().getTime();
                const response = await fetch(`./data/ace_specs.json?t=${timestamp}`);
                if (response.ok) {
                    const jsonData = await response.json();
                    aceSpecsList = (jsonData.ace_specs || []).map(name => name.toLowerCase().trim());
                    console.log(`? Loaded ${aceSpecsList.length} Ace Spec cards from ace_specs.json`);
                } else {
                    console.error('? Failed to load ace_specs.json');
                }
            } catch (error) {
                console.error('Error loading ace specs list:', error);
            }
        }

        async function loadSetMapping() {
            try {
                const timestamp = new Date().getTime();
                const response = await fetch(`./pokemon_sets_mapping.csv?t=${timestamp}`);
                if (!response.ok) return;
                const text = await response.text();
                const rows = parseCSVWithDelimiter(text, ',');
                englishSetCodes = new Set(rows.map(row => row.set_code).filter(Boolean));
                window.englishSetCodes = englishSetCodes;
            } catch (error) {
                console.error('Error loading pokemon_sets_mapping.csv:', error);
            }
        }

        function buildCardsByNameMap(cards) {
            const map = {};
            cards.forEach(card => {
                const primaryName = String(card.name_en || card.name || '').trim();
                if (!primaryName) return;

                const exactKey = fixMojibake(primaryName);
                const normalizedKey = normalizeCardName(primaryName);

                if (!map[exactKey]) map[exactKey] = [];
                map[exactKey].push(card);

                if (normalizedKey && normalizedKey !== exactKey) {
                    if (!map[normalizedKey]) map[normalizedKey] = [];
                    map[normalizedKey].push(card);
                }
            });
            return map;
        }

        function getCardByNameFromIndex(cardName) {
            const raw = String(cardName || '').trim();
            if (!raw || !(cardIndexMap instanceof Map)) return null;

            const repaired = fixMojibake(raw);
            const normalized = normalizeCardName(raw);

            return cardIndexMap.get(raw)
                || cardIndexMap.get(repaired)
                || cardIndexMap.get(normalized)
                || null;
        }

        function buildCardIndexBySetNumber(cards) {
            const map = new Map();
            cards.forEach(card => {
                if (!card.set || !card.number) return;

                const normalizedSet = String(card.set).toUpperCase().trim();
                const rawNumber = String(card.number).trim();
                if (!normalizedSet || !rawNumber) return;

                map.set(`${normalizedSet}-${rawNumber}`, card);

                const normalizedNumber = rawNumber.replace(/^0+/, '') || '0';
                map.set(`${normalizedSet}-${normalizedNumber}`, card);
                map.set(`${normalizedSet}-${normalizedNumber.padStart(3, '0')}`, card);
            });
            console.log(`📇 Built Map index for ${map.size} set+number combinations`);
            return map;
        }
        
        function buildCardsBySetNumberMap(cards) {
            const map = {};
            cards.forEach(card => {
                if (!card.set || !card.number) return;
                const normalizedSet = String(card.set).toUpperCase().trim();
                const rawNumber = String(card.number).trim();
                const key = `${normalizedSet}-${rawNumber}`;
                map[key] = card;

                const normalizedNumber = rawNumber.replace(/^0+/, '') || '0';
                const normalizedKey = `${normalizedSet}-${normalizedNumber}`;
                map[normalizedKey] = card;

                const paddedKey = `${normalizedSet}-${normalizedNumber.padStart(3, '0')}`;
                map[paddedKey] = card;
            });
            console.log(`? Built index for ${Object.keys(map).length} set+number combinations`);
            return map;
        }

        /**
         * Universal Omni-Search helper.
         * Filters an array of card objects by a search term, checking:
         *   - English name (name_en or name)
         *   - German name (name_de)
         *   - Set + number with space ("SFA 12") or without ("SFA12")
         *   - Pokédex number (exact match for 1-2 digit terms, partial for 3+)
         */
        function filterCardsArray(allCardsArray, searchInputText) {
            const term = (searchInputText || '').toLowerCase().trim();
            if (!term) return allCardsArray;
            return allCardsArray.filter(card => {
                const nameEn = (card.name_en || card.name || '').toLowerCase();
                const nameDe = (card.name_de || '').toLowerCase();
                const setCode = (card.set || '').toLowerCase();
                const cardNumber = (card.number || '').toLowerCase();
                const dexNum = (card.pokedex_number || '').toString();
                const setNumSpace = `${setCode} ${cardNumber}`;
                const setNumCombined = `${setCode}${cardNumber}`;
                return nameEn.includes(term) ||
                       nameDe.includes(term) ||
                       setNumSpace.includes(term) ||
                       setNumCombined.includes(term) ||
                       (dexNum !== '' && dexNum === term) ||
                       (term.length >= 3 && dexNum !== '' && dexNum.includes(term));
            });
        }

        function getCardVersionsByName(cardName) {
            const exact = String(cardName || '').trim();
            const repaired = fixMojibake(exact);
            const normalized = normalizeCardName(exact);

            const merged = [
                ...(cardsByNameMap[exact] || []),
                ...(cardsByNameMap[repaired] || []),
                ...(cardsByNameMap[normalized] || [])
            ];

            const seen = new Set();
            return merged.filter(card => {
                const key = `${card.set || ''}-${card.number || ''}-${card.name_en || card.name || ''}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        }

        function getEnglishCardVersions(cardName) {
            const versions = getCardVersionsByName(cardName);
            if (!englishSetCodes || englishSetCodes.size === 0) {
                return versions.filter(v => v.image_url && v.image_url.trim() !== '');
            }
            return versions.filter(version => 
                englishSetCodes.has(version.set) && 
                version.image_url && 
                version.image_url.trim() !== ''
            );
        }

        function loadRarityPreferences() {
            try {
                const raw = localStorage.getItem('rarityPreferences');
                rarityPreferences = raw ? JSON.parse(raw) : {};
            } catch (error) {
                rarityPreferences = {};
            }
            window.rarityPreferences = rarityPreferences;
            loadGlobalRarityPreference();
        }

        function saveRarityPreferences() {
            localStorage.setItem('rarityPreferences', JSON.stringify(rarityPreferences));
        }

        function loadGlobalRarityPreference() {
            globalRarityPreference = 'min'; // Default: Lowest rarity from newest set
        }

        function getGlobalRarityPreference() {
            return globalRarityPreference || 'min'; // Default to 'min' if not set
        }

        function setRarityPreference(cardName, pref) {
            if (!cardName) return;
            rarityPreferences[cardName] = pref;
            saveRarityPreferences();
        }

        function getRarityPreference(cardName) {
            return rarityPreferences[cardName] || null;
        }

        function clearRarityPreference(cardName) {
            if (!cardName || !rarityPreferences[cardName]) return;
            delete rarityPreferences[cardName];
            saveRarityPreferences();
        }

        // ==================== UNIVERSAL PTCG CARD SORTING ====================
        
        /**
         * Universal Pokémon TCG card sorting function
         * Sorts cards in the official deck construction order:
         * 1. Pokémon (by type, then Pokédex number, then set/number)
         * 2. Supporter
         * 3. Item
         * 4. Pokémon Tool
         * 5. Stadium
         * 6. Special Energy
         * 7. Basic Energy
         * 
         * Within each category:
         * - Pokémon: Sort by pokedex_number (keeps evolution lines together!), then set, then number
         * - Trainer/Energy: Sort by name, then set, then number
         * 
         * @param {Array} cardsArray - Array of card objects to sort
         * @returns {Array} - Sorted array (mutates original)
         */
        function sortCardsPTCG(cardsArray) {
            const categoryOrder = {
                "Pokémon": 1,
                "Supporter": 2,
                "Item": 3,
                "Pokémon Tool": 4,
                "Stadium": 5,
                "Special Energy": 6,
                "Basic Energy": 7
            };

            return cardsArray.sort((a, b) => {
                // 1. Supertype/Category comparison
                // Map card type to our categories
                let catA = 8; 
                let catB = 8;
                
                if (a.type) {
                    const typeA = a.type.toLowerCase();
                    if (typeA.includes("pokémon") || typeA.includes("pokemon")) catA = 1;
                    else if (typeA.includes("supporter")) catA = 2;
                    else if (typeA.includes("item") && !typeA.includes("tool")) catA = 3;
                    else if (typeA.includes("tool")) catA = 4;
                    else if (typeA.includes("stadium")) catA = 5;
                    else if (typeA.includes("special energy")) catA = 6;
                    else if (typeA.includes("basic energy")) catA = 7;
                }
                
                if (b.type) {
                    const typeB = b.type.toLowerCase();
                    if (typeB.includes("pokémon") || typeB.includes("pokemon")) catB = 1;
                    else if (typeB.includes("supporter")) catB = 2;
                    else if (typeB.includes("item") && !typeB.includes("tool")) catB = 3;
                    else if (typeB.includes("tool")) catB = 4;
                    else if (typeB.includes("stadium")) catB = 5;
                    else if (typeB.includes("special energy")) catB = 6;
                    else if (typeB.includes("basic energy")) catB = 7;
                }

                if (catA !== catB) return catA - catB;

                // 2. If both are Pokémon
                if (catA === 1) {
                    // Sort by Pokédex number (keeps evolution lines together!)
                    const dexA = a.pokedex_number ? parseInt(a.pokedex_number) : 9999;
                    const dexB = b.pokedex_number ? parseInt(b.pokedex_number) : 9999;
                    if (dexA !== dexB) return dexA - dexB;
                } else {
                    // For Trainer & Energy: Sort by name
                    const nameA = (a.name_en || a.card_name || a.name || "").toLowerCase();
                    const nameB = (b.name_en || b.card_name || b.name || "").toLowerCase();
                    if (nameA !== nameB) return nameA.localeCompare(nameB);
                }

                // 3. Fallback for all: Set and number
                const setA = (a.set || a.set_code || "").toLowerCase();
                const setB = (b.set || b.set_code || "").toLowerCase();
                if (setA !== setB) return setA.localeCompare(setB);

                const numA = parseInt(String(a.number || a.set_number || "").replace(/\D/g, '')) || 0;
                const numB = parseInt(String(b.number || b.set_number || "").replace(/\D/g, '')) || 0;
                return numA - numB;
            });
        }

        // ==================== LIVE PRICE FETCHING ====================
        
        let proxyServerAvailable = null;  // null = not checked, true/false = checked
        const PROXY_URL = 'http://localhost:8001';
        const livePriceCache = new Map();  // Cache fuer Live-Preise
        
        async function checkProxyServer() {
            if (proxyServerAvailable !== null) {
                return proxyServerAvailable;
            }
            
            try {
                const response = await fetch(`${PROXY_URL}/health`, { timeout: 2000 });
                proxyServerAvailable = response.ok;
                if (proxyServerAvailable) {
                    console.log('? Live price proxy server is running');
                }
            } catch (e) {
                proxyServerAvailable = false;
                console.log('? Live price proxy server not running (prices from database)');
            }
            
            return proxyServerAvailable;
        }
        
        async function fetchLivePrice(card) {
            // Check cache first (5 minute TTL)
            const cacheKey = `${card.set}_${card.number}`;
            const cached = livePriceCache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp < 300000)) {
                return cached.data;
            }
            
            // Check if proxy server is available
            const proxyAvailable = await checkProxyServer();
            if (!proxyAvailable) {
                return null;
            }
            
            try {
                // Try Limitless first (has both Cardmarket URL and price)
                let url = '';
                if (card.card_url) {
                    url = card.card_url.startsWith('/') 
                        ? `https://limitlesstcg.com${card.card_url}`
                        : card.card_url;
                } else if (card.set && card.number) {
                    url = `https://limitlesstcg.com/cards/${card.set}/${card.number}`;
                }
                
                if (url) {
                    const params = new URLSearchParams({ url, source: 'limitless' });
                    const response = await fetch(`${PROXY_URL}/fetch-price?${params}`);
                    
                    if (response.ok) {
                        const data = await response.json();
                        if (data.success && data.price) {
                            // Cache result
                            livePriceCache.set(cacheKey, {
                                data: data,
                                timestamp: Date.now()
                            });
                            return data;
                        }
                    }
                }
                
                // Fallback: Try Cardmarket URL if available
                if (card.cardmarket_url) {
                    const params = new URLSearchParams({ 
                        url: card.cardmarket_url, 
                        source: 'cardmarket' 
                    });
                    const response = await fetch(`${PROXY_URL}/fetch-price?${params}`);
                    
                    if (response.ok) {
                        const data = await response.json();
                        if (data.success && data.price) {
                            livePriceCache.set(cacheKey, {
                                data: data,
                                timestamp: Date.now()
                            });
                            return data;
                        }
                    }
                }
                
                return null;
            } catch (e) {
                console.error('Error fetching live price:', e);
                return null;
            }
        }
        
        function updatePriceButton(buttonElement, livePrice) {
            if (!buttonElement || !livePrice || !livePrice.price) return;
            
            const price = livePrice.price;
            
            // Update button text
            buttonElement.textContent = price;
            
            // Update button style (make it green/highlighted)
            buttonElement.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
            buttonElement.style.cursor = 'pointer';
            buttonElement.title = `Live Price: ${price} (Click to buy on Cardmarket)`;
            
            // Add visual indicator that this is live
            buttonElement.style.boxShadow = '0 0 8px rgba(16, 185, 129, 0.5)';
        }
        
        // Auto-fetch live prices for visible cards (call this when rendering cards)
        async function autoFetchLivePrices(cards, buttonIdPrefix = 'price-btn') {
            const proxyAvailable = await checkProxyServer();
            if (!proxyAvailable) return;
            
            // Fetch prices in batches to avoid overload
            const batchSize = 5;
            for (let i = 0; i < cards.length; i += batchSize) {
                const batch = cards.slice(i, i + batchSize);
                
                await Promise.all(batch.map(async (card, idx) => {
                    const globalIdx = i + idx;
                    const buttonId = `${buttonIdPrefix}-${globalIdx}`;
                    const buttonElement = document.getElementById(buttonId);
                    
                    if (buttonElement) {
                        const livePrice = await fetchLivePrice(card);
                        if (livePrice) {
                            updatePriceButton(buttonElement, livePrice);
                        }
                    }
                }));
                
                // Small delay between batches
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }
        
        // ==================== END LIVE PRICE FETCHING ====================

        // Get international prints for a specific card (set + number)
        function getInternationalPrintsForCard(set, number) {
            if (!cardsBySetNumberMap || Object.keys(cardsBySetNumberMap).length === 0) {
                console.warn('[getInternationalPrintsForCard] Index not loaded yet');
                return [];
            }
            
            // Fast lookup using index instead of array.find()
            const key = `${set}-${number}`;
            const baseCard = cardsBySetNumberMap[key];
            
            if (!baseCard) {
                console.warn(`[getInternationalPrintsForCard] Card not found: ${set} ${number}`);
                return [];
            }
            
            if (!baseCard.international_prints) {
                console.log(`[getInternationalPrintsForCard] No international prints for ${set} ${number}, returning base card only`);
                return [baseCard];
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
            
            console.log(`[getInternationalPrintsForCard] Found ${intPrintCards.length} international prints for ${baseCard.name_en || baseCard.name} (${set} ${number}):`,   
                intPrintCards.map(c => `${c.set} ${c.number} (${c.rarity || 'NO RARITY'}) ${c.image_url ? '?' : '?'}`).join(', ')
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

            return `<span title="${title}" style="display: inline-flex; align-items: center; justify-content: center; margin-left: 4px; width: 12px; height: 12px; border-radius: 50%; background: #fff3cd; color: #8a6d3b; border: 1px solid #f0ad4e; font-size: 9px; line-height: 1; vertical-align: middle; cursor: help;">!</span>`;
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

            console.log(`[normalizeDeckEntries] ${source}: normalized ${originalKeys.length} -> ${normalizedKeys.length} keys`);
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
            if (/^basic\s+\{[grwlpfdm]\}\s+energy(?:\s+.*)?$/i.test(normalized)) return true;

            // Allow common source suffixes, e.g. "Fighting Energy SVE 22"
            return /^(fire|water|grass|lightning|psychic|fighting|darkness|metal|fairy|dragon|colorless)\s+energy(?:\s+.*)?$/i.test(normalized);
        }

        function getPreferredVersionForCard(cardName, originalSet = null, originalNumber = null) {
            const pref = getRarityPreference(cardName);
            const globalPref = getGlobalRarityPreference();
            
            // If originalSet and originalNumber provided, try international prints first
            let versions;
            if (originalSet && originalNumber) {
                versions = getInternationalPrintsForCard(originalSet, originalNumber);
                
                // DEBUG: Log international prints for troubleshooting
                console.log(`[getPreferredVersionForCard] International prints for ${cardName} (${originalSet} ${originalNumber}):`, 
                    versions.map(v => `${v.set}-${v.number} (rarity: "${v.rarity || 'NONE'}")`));
                
                // Intelligent fallback: If no international prints OR if international prints has NO rarity data,
                // fall back to all versions (fixes Judge DRI 222 issue while preserving Promo cards)
                const hasSufficientRarity = versions.length > 0 && 
                    versions.some(v => v.rarity && v.rarity.trim() !== '');
                
                console.log(`[getPreferredVersionForCard] hasSufficientRarity for ${cardName}: ${hasSufficientRarity}`);
                
                if (versions.length === 0 || !hasSufficientRarity) {
                    const fallbackReason = versions.length === 0 ? 'no international prints' : 
                        'international prints has no rarity data';
                    versions = getEnglishCardVersions(cardName);
                    console.log(`[getPreferredVersionForCard] ${fallbackReason} for ${cardName} (${originalSet} ${originalNumber}), using ALL ${versions.length} versions`);
                } else {
                    console.log(`[getPreferredVersionForCard] Using international prints for ${cardName} (${originalSet} ${originalNumber})`);
                    // If the original card is from a non-English set, prefer English versions only
                    // This prevents Japanese cards from being selected as the preferred version
                    if (window.englishSetCodes && window.englishSetCodes.size > 0 && 
                        originalSet && !window.englishSetCodes.has(originalSet)) {
                        const englishVersions = versions.filter(v => window.englishSetCodes.has(v.set));
                        if (englishVersions.length > 0) {
                            versions = englishVersions;
                            console.log(`[getPreferredVersionForCard] Filtered to ${versions.length} English versions for non-English original (${originalSet})`);
                        } else {
                            // No English int prints found, fall back to English by name
                            versions = getEnglishCardVersions(cardName);
                            console.log(`[getPreferredVersionForCard] No English int prints for ${cardName} (${originalSet}), falling back to name lookup: ${versions.length} versions`);
                        }
                    }
                }
            } else {
                versions = getEnglishCardVersions(cardName);
            }
            
            // DEBUG: Log when versions are not found
            if (versions.length === 0) {
                console.log(`[getPreferredVersionForCard] No versions found for: "${cardName}"`);
                console.log(`[getPreferredVersionForCard] cardsByNameMap has:`, Object.keys(cardsByNameMap).filter(k => k.toLowerCase().includes(cardName.toLowerCase().substring(0, 5))).slice(0, 5));
            }
            
            if (versions.length === 0) return null;

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
                        console.log(`⚡ Basic Energy "${cardName}": Using SVE ${correctSVEVersion.number} ⚡`);
                        return correctSVEVersion;
                    }
                }
                
                // Fallback: If specific SVE number not found, use any SVE version
                const sveVersions = versions.filter(v => v.set === 'SVE');
                if (sveVersions.length > 0) {
                    console.log(`⚡ Basic Energy "${cardName}": Using fallback SVE ${sveVersions[0].number}`);
                    return sveVersions[0];
                }
            }

            if (globalPref && (globalPref === 'max' || globalPref === 'min')) {
                // Set order loaded from sets.json at startup (higher = newer)
                const SET_ORDER = window.setOrderMap || {};
                
                const sorted = versions.slice().sort((a, b) => {
                    const priorityA = getRarityPriority(a.rarity, a.set);
                    const priorityB = getRarityPriority(b.rarity, b.set);
                    
                    // Primary sort: by priority (rarity)
                    if (priorityA !== priorityB) {
                        return priorityA - priorityB;
                    }
                    
                    // Secondary sort (same priority): by SET ORDER (newer sets first)
                    const setOrderA = SET_ORDER[a.set] || 0;
                    const setOrderB = SET_ORDER[b.set] || 0;
                    if (setOrderA !== setOrderB) {
                        return setOrderB - setOrderA; // Higher number = newer = preferred
                    }
                    
                    // Tertiary sort (same set): by set number (lower number first)
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
                console.log(`[getPreferredVersionForCard] All versions for "${cardName}":`, 
                    versions.map((v, idx) => `${v.set} ${v.number} (${v.rarity || 'NO RARITY'}, priority: ${getRarityPriority(v.rarity, v.set)}, index: ${idx})`).join(', ')
                );
                console.log(`[getPreferredVersionForCard] Sorted order:`, 
                    sorted.map(v => `${v.set} ${v.number} (priority: ${getRarityPriority(v.rarity, v.set)})`).join(', ')
                );
                console.log(`[getPreferredVersionForCard] ${globalPref} rarity for "${cardName}": ${selected.set} ${selected.number} (${selected.rarity}, priority: ${getRarityPriority(selected.rarity, selected.set)})`);
                return selected;
            }

            // If no global preference (shouldn't happen as default is 'min'), return null
            if (!pref) {
                return null;
            }

            if (pref.mode === 'specific' && pref.set && pref.number) {
                return versions.find(v => v.set === pref.set && v.number === pref.number) || null;
            }

            if (pref.mode === 'max' || pref.mode === 'min') {
                const sorted = versions.slice().sort((a, b) => {
                    const priorityA = getRarityPriority(a.rarity, a.set);
                    const priorityB = getRarityPriority(b.rarity, b.set);
                    return priorityA - priorityB;
                });
                
                // CRITICAL FIX: Filter out NO RARITY cards (priority 999) before selecting
                const validSorted = sorted.filter(v => getRarityPriority(v.rarity, v.set) < 999);
                const finalList = validSorted.length > 0 ? validSorted : sorted;
                return pref.mode === 'max' ? finalList[finalList.length - 1] : finalList[0];
            }

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
            if (r.includes('common')) return 1;
            if (r.includes('uncommon')) return 2;

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
                return `<span class="stat-badge stat-trend-up">⬆️ +${Math.abs(shareChange).toFixed(1)}%</span>`;
            } else {
                return `<span class="stat-badge stat-trend-down">⬇️ -${Math.abs(shareChange).toFixed(1)}%</span>`;
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

            // Compare strictly the last two available weekly points.
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

            const periodArchetypeDecks = new Map();
            rows.forEach(row => {
                const period = String(row.date || row.period || row.tournament_date || '').trim();
                const archetype = String(row.archetype || '').trim().toLowerCase();
                if (!period || !archetype) return;

                if (targetArchNormalized && archetype !== targetArchNormalized) return;

                const decks = parseNum(row.total_decks_in_archetype_in_period || row.total_decks_in_archetype || 0);
                const key = `${period}|||${archetype}`;
                const prev = periodArchetypeDecks.get(key) || 0;
                if (decks > prev) periodArchetypeDecks.set(key, decks);
            });

            const totalDecksByPeriod = new Map();
            periodArchetypeDecks.forEach((decks, key) => {
                const [period] = key.split('|||');
                totalDecksByPeriod.set(period, (totalDecksByPeriod.get(period) || 0) + decks);
            });

            const decksWithCardByPeriod = new Map();
            rows.forEach(row => {
                const rowName = normalizeName(row.card_name || row.full_card_name || '');
                if (!rowName || rowName !== targetName) return;

                const period = String(row.date || row.period || row.tournament_date || '').trim();
                const archetype = String(row.archetype || '').trim().toLowerCase();
                if (!period || !archetype) return;

                if (targetArchNormalized && archetype !== targetArchNormalized) return;

                const decksWithCard = parseNum(row.deck_inclusion_count || row.deck_count || 0);
                decksWithCardByPeriod.set(period, (decksWithCardByPeriod.get(period) || 0) + decksWithCard);
            });

            return Array.from(totalDecksByPeriod.keys())
                .sort((a, b) => {
                    // DD.MM.YYYY needs normalization for chronological sorting.
                    const parseDate = (d) => {
                        const match = String(d).match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
                        if (match) {
                            return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
                        }
                        return String(d);
                    };
                    return parseDate(a).localeCompare(parseDate(b));
                })
                .map(period => {
                    const totalDecks = totalDecksByPeriod.get(period) || 0;
                    const decksWithCard = decksWithCardByPeriod.get(period) || 0;
                    const share = totalDecks > 0 ? (decksWithCard / totalDecks) * 100 : 0;
                    return { period, share };
                })
                .filter(entry => Number.isFinite(entry.share));
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
            
            // Extract base archetype name (first word or first two words)
            const archetypeBase = archetypeName.split(' ').slice(0, 2).join(' ').toLowerCase();
            const archetypeFirstWord = archetypeName.split(' ')[0].toLowerCase();
            
            // Priority 1: Cards that match the archetype name exactly
            const matchingNameCards = pokemonCards.filter(card => {
                const cardName = (card.card_name || '').toLowerCase();
                // Check if card name contains the archetype name or first word
                return cardName.includes(archetypeBase) || cardName.startsWith(archetypeFirstWord);
            });
            
            if (matchingNameCards.length > 0) {
                // Sort by percentage_in_archetype (highest usage = main attacker)
                matchingNameCards.sort((a, b) => {
                    const pctA = parseFloat(a.percentage_in_archetype || 0);
                    const pctB = parseFloat(b.percentage_in_archetype || 0);
                    return pctB - pctA;
                });
                return matchingNameCards[0].image_url || '';
            }
            
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
        
        /**
         * Render Tier List for City League
         * Generates banner-style deck cards grouped by tier
         */
        async function renderCityLeagueTierList(prefetchedAnalysisData = null) {
            const content = document.getElementById('cityLeagueContent');
            if (!content || !cityLeagueData || cityLeagueData.length === 0) return;
            
            // Load card data for images
            const timestamp = new Date().getTime();
            let cardDataByArchetype = {};
            
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
            } catch (e) {
                console.warn('Could not load card data for images:', e);
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

            let html = '<div style="margin-bottom: 30px;">';
            
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
                                <span class="tier-trending-count">${decks.length} Decks</span>
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
                    const archetypeCards = cardDataByArchetype[archetypeName] || [];
                    const imageUrl = getArchetypeImage(archetypeName, archetypeCards);
                    
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
                        rankIcon = "➖";

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
                        shareIcon = "➖";
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
                                🏆 Rank: ${currentRank} ${m3RankDisplay} ${isM4WithComparison ? `<span class="trend-icon ${rankTrendClass}">${rankIcon}</span>` : ''}
                            </span>
                            <span class="stat-badge">
                                📊 Share: ${currentShare}% ${m3ShareDisplay} ${isM4WithComparison ? `<span class="trend-icon ${shareTrendClass}">${shareIcon}</span>` : ''}
                            </span>
                        </div>
                    `;
                    
                    const archetypeEscaped = archetypeName.replace(/'/g, "\\'");
                    
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
         * Render Tier List for Current Meta
         * Similar to City League but uses winrate data
         */
        async function renderCurrentMetaTierList() {
            const container = document.querySelector('#currentMetaContent .container');
            if (!container) return;
            
            // Load CSV data
            const timestamp = new Date().getTime();
            let metaData = [];
            let cardDataByArchetype = {};
            
            try {
                // Load comparison CSV
                const comparisonResponse = await fetch(`${BASE_PATH}limitless_online_decks_comparison.csv?t=${timestamp}`);
                if (comparisonResponse.ok) {
                    const comparisonText = await comparisonResponse.text();
                    metaData = parseCSV(comparisonText);
                }
                
                // Load card data for images
                const cardsResponse = await fetch(`${BASE_PATH}current_meta_card_data.csv?t=${timestamp}`);
                if (cardsResponse.ok) {
                    const cardsText = await cardsResponse.text();
                    const cardsData = parseCSV(cardsText);
                    healCurrentMetaCardRows(cardsData);
                    
                    // Group cards by archetype
                    cardsData.forEach(card => {
                        const arch = card.archetype;
                        if (!cardDataByArchetype[arch]) cardDataByArchetype[arch] = [];
                        cardDataByArchetype[arch].push(card);
                    });
                }
            } catch (e) {
                console.warn('Could not load meta data for tier list:', e);
                return;
            }
            
            if (metaData.length === 0) return;
            
            // Group decks by tier
            const tierGroups = {
                'tier-1': [],
                'tier-2': [],
                'tier-3': [],
                'tier-trending': []
            };
            
            // Normalisiere alle Decks und sortiere nach Share (absteigend)
            const normalizedDecks = metaData.map(deck => ({
                archetype: deck.deck_name || deck.archetype,
                share: parseFloat(deck.new_share || 0),
                new_share: parseFloat(deck.new_share || 0),
                winrate: parseFloat(deck.new_winrate || 0),
                new_winrate: parseFloat(deck.new_winrate || 0),
                count_change: parseInt(deck.count_change || 0),
                new_count: parseInt(deck.new_count || 0)
            }));
            normalizedDecks.sort((a, b) => b.share - a.share);

            // Dynamische Tier-Einteilung: Tier 1 = Top 15 %, Tier 2 = nächste 25 %
            const _nm = normalizedDecks.length;
            const _t1 = Math.min(Math.max(1, Math.ceil(_nm * 0.15)), _nm);
            const _t2 = Math.min(_t1 + Math.max(1, Math.ceil(_nm * 0.25)), _nm);
            const _t3 = Math.min(_t2 + 10, _nm);
            normalizedDecks.forEach((normalizedDeck, idx) => {
                let tier;
                if (idx < _t1) tier = 'tier-1';
                else if (idx < _t2) tier = 'tier-2';
                else if (idx < _t3) tier = 'tier-3';
                else tier = 'tier-trending';
                tierGroups[tier].push(normalizedDeck);
            });
            
            const tierTitles = {
                'tier-1': 'Tier 1 - Meta Dominators',
                'tier-2': 'Tier 2 - Strong Contenders',
                'tier-3': 'Tier 3 - Viable Options',
                'tier-trending': 'Trending Decks'
            };
            
            // Limit trending decks to top 20
            if (tierGroups['tier-trending'].length > 20) {
                tierGroups['tier-trending'] = tierGroups['tier-trending'].slice(0, 20);
            }
            
            let html = '<div style="margin-bottom: 30px;">';
            
            // Render each tier
            ['tier-1', 'tier-2', 'tier-3', 'tier-trending'].forEach(tierKey => {
                const decks = tierGroups[tierKey];
                if (decks.length === 0) return;
                const isTrending = tierKey === 'tier-trending';

                if (isTrending) {
                    html += `
                    <div class="deck-tier-section ${tierKey}">
                        <details>
                            <summary class="tier-trending-summary">
                                <div class="deck-tier-title" style="display:inline;">${tierTitles[tierKey]}</div>
                                <span class="tier-trending-count">${decks.length} Decks</span>
                            </summary>
                            <div class="deck-banner-grid">`;
                } else {
                    html += `
                    <div class="deck-tier-section ${tierKey}">
                        <div class="deck-tier-title">${tierTitles[tierKey]}</div>
                        <div class="deck-banner-grid">`;
                }
                
                decks.forEach(deck => {
                    const archetypeName = deck.archetype;
                    
                    // Fix share calculation with fallback
                    const share = parseFloat(deck.share || deck.new_share || 0);
                    const oldShare = parseFloat(deck.old_share || 0);
                    const winRate = parseFloat(deck.winrate || deck.new_winrate || 0);
                    const powerScore = calculatePowerScore(share, winRate);
                    const newCount = parseInt(deck.new_count || 0);
                    
                    // Get archetype image
                    const archetypeCards = cardDataByArchetype[archetypeName] || [];
                    const imageUrl = getArchetypeImage(archetypeName, archetypeCards);
                    
                    // Trend indicator based on share change
                    const shareChange = share - oldShare;
                    let trendHtml = getDeckTrendBadge(archetypeName, shareChange);
                    
                    // Legacy count change indicator (fallback if no share data)
                    const countChange = parseInt(deck.count_change || 0);
                    if (!trendHtml) {
                        if (countChange > 0) {
                            trendHtml = `<span class="stat-badge stat-trend-up">⬆️ +${countChange}</span>`;
                        } else if (countChange < 0) {
                            trendHtml = `<span class="stat-badge stat-trend-down">⬇️ ${countChange}</span>`;
                        }
                    }
                    
                    const archetypeEscaped = archetypeName.replace(/'/g, "\\'");
                    
                    html += `
                        <div class="deck-banner-card" onclick="navigateToCurrentMetaWithDeck('${archetypeEscaped}')">
                            ${imageUrl ? `<div class="deck-banner-bg" style="background-image: url('${imageUrl}')"></div>` : ''}
                            <div class="deck-banner-content">
                                <div class="deck-banner-name">${archetypeName}</div>
                                <div class="deck-banner-stats">
                                    <span class="stat-badge stat-power">⚡ ${powerScore}</span>
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
            
            // Prepend tier list at the beginning of container
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
                        🔥 Most Used Cards (Format Staples)
                    </h3>
                    <div class="top-cards-scroll">`;
            
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
                        <div class="top-card-rank" style="background: ${rankColor};">#${rank}</div>
                        <img src="${imageUrl}" class="top-card-img" alt="${card.name}" loading="lazy">
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
            const container = document.querySelector('#currentMetaContent .container');
            if (!container) return;
            
            // Load card data
            const timestamp = new Date().getTime();
            let cardData = [];
            
            try {
                const cardsResponse = await fetch(`${BASE_PATH}current_meta_card_data.csv?t=${timestamp}`);
                if (cardsResponse.ok) {
                    const cardsText = await cardsResponse.text();
                    cardData = parseCSV(cardsText);
                    healCurrentMetaCardRows(cardData);
                }
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
                    console.log(`Loaded M3 comparison data: ${Object.keys(window.m3ArchetypeData).length} archetypes`);
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

            console.log(`Switching City League format to: ${format}`);
            
            // Store selection
            window.currentCityLeagueFormat = format;
            localStorage.setItem('cityLeagueFormat', format);
            
            // Show loading indicator
            const content = document.getElementById('cityLeagueContent');
            if (content) {
                content.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;">Lade ' + format + ' Daten...</div>';
            }
            
            // Load M3 comparison data if switching to M4
            if (format === 'M4') {
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
                
                // Dynamic file paths based on current format
                const format = window.currentCityLeagueFormat || 'M4';
                const formatSuffix = format === 'M3' ? '_M3' : '';
                const analysisUrl = `${BASE_PATH}city_league_analysis${formatSuffix}.csv`;
                const archetypesUrl = `${BASE_PATH}city_league_archetypes${formatSuffix}.csv`;
                const comparisonUrl = `${BASE_PATH}city_league_archetypes_comparison${formatSuffix}.csv`;
                const hasComparisonFile = format !== 'M3';

                console.log(`Loading City League data for format: ${format}`);

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

                // NEU: Lade M3-Archetypen im Hintergrund, wenn wir in M4 sind
                if (window.currentCityLeagueFormat === 'M4') {
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

                // Load M3 comparison data if we're in M4 mode
                if (format === 'M4') {
                    await loadM3ComparisonData();
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
                
                renderCityLeagueTable(tournamentCount, dateRange);

                // Keep the analysis dropdown in sync with the freshly loaded format data
                window.cityLeagueAnalysisData = analysisData;
                window.cityLeagueArchetypesData = archetypesData;
                window.cityLeagueComparisonData = cityLeagueData;
                const previousDeckValue = document.getElementById('cityLeagueDeckSelect')?.value || '';
                populateCityLeagueDeckSelect(analysisData, cityLeagueData);

                const deckSelect = document.getElementById('cityLeagueDeckSelect');
                let restoredSelection = '';
                if (deckSelect && previousDeckValue) {
                    const stillExists = Array.from(deckSelect.options).some(option => option.value === previousDeckValue);
                    if (stillExists) {
                        deckSelect.value = previousDeckValue;
                        restoredSelection = previousDeckValue;
                    }
                }
                if (!restoredSelection && deckSelect) {
                    deckSelect.value = '';
                }

                if (!restoredSelection) {
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
        
        // Render City League table with full structure matching original HTML
        function renderCityLeagueTable(tournamentCount = 0, dateRange = '') {
            const content = document.getElementById('cityLeagueContent');
            if (!content || !cityLeagueData || cityLeagueData.length === 0) return;
            
            // Separate data by status and trend
            const newArchetypes = cityLeagueData.filter(d => d.status === 'NEU');
            const disappeared = cityLeagueData.filter(d => d.status === 'VERSCHWUNDEN');
            const increased = cityLeagueData.filter(d => d.status !== 'NEU' && parseInt(d.count_change || 0) > 0)
                .sort((a, b) => parseInt(b.count_change) - parseInt(a.count_change));
            const decreased = cityLeagueData.filter(d => parseInt(d.count_change || 0) < 0)
                .sort((a, b) => parseInt(a.count_change) - parseInt(b.count_change));
            
            // Get max count for threshold filtering
            const maxCountForThreshold = Math.max(...cityLeagueData.map(d => parseInt(d.new_count || 0)));
            const countThreshold = maxCountForThreshold * 0.1;
            
            // Performance improvers/decliners
            const improvers = cityLeagueData
                .filter(d => parseFloat((d.avg_placement_change || '0').replace(',', '.')) < 0 && parseInt(d.new_count || 0) >= countThreshold)
                .sort((a, b) => parseFloat((a.avg_placement_change || '0').replace(',', '.')) - parseFloat((b.avg_placement_change || '0').replace(',', '.')))
                .slice(0, 10);
            
            const decliners = cityLeagueData
                .filter(d => parseFloat((d.avg_placement_change || '0').replace(',', '.')) > 0 && parseInt(d.new_count || 0) >= countThreshold)
                .sort((a, b) => parseFloat((b.avg_placement_change || '0').replace(',', '.')) - parseFloat((a.avg_placement_change || '0').replace(',', '.')))
                .slice(0, 10);
            
            const sorted = [...cityLeagueData].sort((a, b) => parseInt(b.new_count || 0) - parseInt(a.new_count || 0));
            const totalArchetypes = cityLeagueData.length;
            
            // Generate timestamp
            const now = new Date();
            const generatedDate = now.toLocaleString('de-DE', { 
                year: 'numeric', month: '2-digit', day: '2-digit', 
                hour: '2-digit', minute: '2-digit', second: '2-digit' 
            });
            
            // Get top 3 by count and placement
            const topByCount = [...cityLeagueData]
                .sort((a, b) => parseInt(b.new_count || 0) - parseInt(a.new_count || 0))
                .slice(0, 3);
            
            const maxCount = parseInt(topByCount[0]?.new_count || 0);
            const minCountThreshold = maxCount * 0.1;
            const topByPlacement = [...cityLeagueData]
                .filter(d => parseInt(d.new_count || 0) >= minCountThreshold)
                .sort((a, b) => parseFloat((a.new_avg_placement || '0').replace(',', '.')) - parseFloat((b.new_avg_placement || '0').replace(',', '.')))
                .slice(0, 3);
            
            const top10New = [...cityLeagueData]
                .sort((a, b) => parseInt(b.new_count || 0) - parseInt(a.new_count || 0))
                .slice(0, 10)
                .map(d => d.archetype);
            const top10Old = [...cityLeagueData]
                .sort((a, b) => parseInt(b.old_count || 0) - parseInt(a.old_count || 0))
                .slice(0, 10)
                .map(d => d.archetype);
            
            const entries = top10New.filter(arch => !top10Old.includes(arch));
            const exits = top10Old.filter(arch => !top10New.includes(arch));
            
            let html = `
                <div id="cityLeagueTierSections"></div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 30px;">
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px; box-shadow: 0 5px 15px rgba(0,0,0,0.1);">
                        <h3 style="margin: 0 0 10px 0; font-size: 1.1em; opacity: 0.9;">📊 Archetype Overview</h3>
                        <div style="font-size: 2.5em; font-weight: bold; margin: 10px 0;">${totalArchetypes}</div>
                        <div style="font-size: 0.85em; opacity: 0.9; margin-top: 15px; text-align: left;">
                            <strong>Top 3 by Count:</strong><br>
                            ${topByCount.map(d => `${d.archetype}: ${d.new_count}x`).join('<br>')}
                            <br><br>
                            <strong>Top 3 by Avg Placement:</strong><br>
                            ${topByPlacement.map(d => `${d.archetype}: ${d.new_avg_placement}`).join('<br>')}
                        </div>
                    </div>
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px; box-shadow: 0 5px 15px rgba(0,0,0,0.1);">
                        <h3 style="margin: 0 0 10px 0; font-size: 1.1em; opacity: 0.9;">🔝 Top 10 Changes</h3>
                        <div style="font-size: 0.85em; opacity: 0.9; margin-top: 10px; text-align: left;">
                            ${entries.length > 0 ? `<strong style="color: #7fff7f;">➕ Entries:</strong><br>${entries.map(arch => `${arch}`).join('<br>')}<br><br>` : ''}
                            ${exits.length > 0 ? `<strong style="color: #ff6b6b;">➖ Exits:</strong><br>${exits.map(arch => `${arch}`).join('<br>')}<br>` : ''}
                            ${entries.length === 0 && exits.length === 0 ? 'No changes in top 10' : ''}
                        </div>
                    </div>
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px; box-shadow: 0 5px 15px rgba(0,0,0,0.1);">
                        <h3 style="margin: 0 0 10px 0; font-size: 1.1em; opacity: 0.9;">📁 Data Source</h3>
                        <div style="font-size: 0.85em; opacity: 0.9; margin-top: 10px;">
                            <strong>Period:</strong><br>${dateRange || 'N/A'}<br><br>
                            <strong>Tournaments:</strong><br>${tournamentCount || 0}
                        </div>
                    </div>
                </div>`;
            
            // Add conditional tables
            if (decreased.length > 0) {
                html += `
                    <div style="margin-bottom: 40px;">
                        <h2 style="color: #34495e; border-bottom: 3px solid #3498db; padding-bottom: 10px; margin-bottom: 20px;">📉 Popularity Decreases</h2>
                        <table style="width: 100%; border-collapse: collapse; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                            <thead>
                                <tr style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                                    <th style="padding: 12px; text-align: left; font-weight: 600;">Archetype</th>
                                    <th style="padding: 12px; text-align: center; font-weight: 600;">Old Count</th>
                                    <th style="padding: 12px; text-align: center; font-weight: 600;">New Count</th>
                                    <th style="padding: 12px; text-align: center; font-weight: 600;">Change</th>
                                    <th style="padding: 12px; text-align: center; font-weight: 600;">Avg Placement</th>
                                </tr>
                            </thead>
                            <tbody>`;
                decreased.slice(0, 10).forEach(d => {
                    const change = parseInt(d.count_change || 0);
                    const placement_change = parseFloat((d.avg_placement_change || '0').replace(',', '.'));
                    const placement_color = placement_change < 0 ? '#27ae60' : '#e74c3c';
                    const archetypeEscaped = d.archetype.replace(/'/g, "\\'");
                    html += `
                        <tr style="border-bottom: 1px solid #ecf0f1;" onmouseover="this.style.background='#f0f8ff'; this.style.cursor='pointer'" onmouseout="this.style.background=''">
                            <td style="padding: 12px; font-weight: bold;" onclick="navigateToAnalysisWithDeck('${archetypeEscaped}')" title="Go to analysis of ${d.archetype}">${d.archetype}</td>
                            <td style="padding: 12px; text-align: center;">${d.old_count}</td>
                            <td style="padding: 12px; text-align: center;">${d.new_count}</td>
                            <td style="padding: 12px; text-align: center; color: #e74c3c; font-weight: bold;">${change}</td>
                            <td style="padding: 12px; text-align: center;">${d.new_avg_placement} <span style="color: ${placement_color}; font-weight: bold;">(${placement_change > 0 ? '+' : ''}${placement_change.toFixed(2)})</span></td>
                        </tr>`;
                });
                html += `</tbody></table></div>`;
            }
            
            if (improvers.length > 0 || decliners.length > 0) {
                // Container for side-by-side layout (Desktop) / stacked (Mobile)
                html += `<div style="display: flex; gap: 20px; margin-bottom: 40px; flex-wrap: wrap;">`;
            }
            
            if (improvers.length > 0) {
                // Performance Improvers
                html += `
                    <div style="flex: 1; min-width: 300px;">
                        <h2 style="color: #34495e; border-bottom: 3px solid #3498db; padding-bottom: 10px; margin-bottom: 20px;">? Performance Improvers (Better Avg Placement)</h2>
                        <table style="width: 100%; border-collapse: collapse; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                            <thead>
                                <tr style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                                    <th style="padding: 12px; text-align: left; font-weight: 600;">Archetype</th>
                                    <th style="padding: 12px; text-align: center; font-weight: 600;">Count</th>
                                    <th style="padding: 12px; text-align: center; font-weight: 600;">Avg. Placement</th>
                                </tr>
                            </thead>
                            <tbody>`;
                improvers.slice(0, 10).forEach(d => {
                    const improvement = Math.abs(parseFloat((d.avg_placement_change || '0').replace(',', '.')));
                    const countChange = parseInt(d.new_count) - parseInt(d.old_count);
                    const countChangeText = countChange > 0 ? `+${countChange}` : `${countChange}`;
                    const archetypeEscaped = d.archetype.replace(/'/g, "\\'");
                    html += `
                        <tr style="border-bottom: 1px solid #ecf0f1;" onmouseover="this.style.background='#f0f8ff'; this.style.cursor='pointer'" onmouseout="this.style.background=''">
                            <td style="padding: 12px; font-weight: bold;" onclick="navigateToAnalysisWithDeck('${archetypeEscaped}')" title="Go to analysis of ${d.archetype}">${d.archetype}</td>
                            <td style="padding: 12px; text-align: center;">${d.new_count} <span style="color: #555; font-size: 0.9em; font-weight: 600;">(${countChangeText})</span></td>
                            <td style="padding: 12px; text-align: center;">${d.new_avg_placement} <span style="color: #27ae60; font-weight: bold;">(-${improvement.toFixed(2)})</span></td>
                        </tr>`;
                });
                html += `</tbody></table></div>`;
            }
            
            if (decliners.length > 0) {
                // Performance Decliners
                html += `
                    <div style="flex: 1; min-width: 300px;">
                        <h2 style="color: #34495e; border-bottom: 3px solid #3498db; padding-bottom: 10px; margin-bottom: 20px;">📉 Performance Decliners (Worse Avg Placement)</h2>
                        <table style="width: 100%; border-collapse: collapse; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                            <thead>
                                <tr style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                                    <th style="padding: 12px; text-align: left; font-weight: 600;">Archetype</th>
                                    <th style="padding: 12px; text-align: center; font-weight: 600;">Count</th>
                                    <th style="padding: 12px; text-align: center; font-weight: 600;">Avg. Placement</th>
                                </tr>
                            </thead>
                            <tbody>`;
                decliners.slice(0, 10).forEach(d => {
                    const decline = parseFloat((d.avg_placement_change || '0').replace(',', '.'));
                    const countChange = parseInt(d.new_count) - parseInt(d.old_count);
                    const countChangeText = countChange > 0 ? `+${countChange}` : `${countChange}`;
                    const archetypeEscaped = d.archetype.replace(/'/g, "\\'");
                    html += `
                        <tr style="border-bottom: 1px solid #ecf0f1;" onmouseover="this.style.background='#f0f8ff'; this.style.cursor='pointer'" onmouseout="this.style.background=''">
                            <td style="padding: 12px; font-weight: bold;" onclick="navigateToAnalysisWithDeck('${archetypeEscaped}')" title="Go to analysis of ${d.archetype}">${d.archetype}</td>
                            <td style="padding: 12px; text-align: center;">${d.new_count} <span style="color: #555; font-size: 0.9em; font-weight: 600;">(${countChangeText})</span></td>
                            <td style="padding: 12px; text-align: center;">${d.new_avg_placement} <span style="color: #e74c3c; font-weight: bold;">(+${decline.toFixed(2)})</span></td>
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
                <div style="display: flex; gap: 20px; margin-bottom: 40px; flex-wrap: wrap;">
                    <!-- Full Comparison Table (Detailed) -->
                    <div style="flex: 1; min-width: 350px;">
                        <h2 style="color: #34495e; border-bottom: 3px solid #3498db; padding-bottom: 10px; margin-bottom: 20px;">📋 Full Comparison Table (Top 30)</h2>
                        <div style="margin-bottom: 15px;">
                            <input type="text" id="cityLeagueSearchFilter" placeholder="Search e.g.: draga, luca" 
                                style="width: 100%; padding: 12px; font-size: 16px; border: 2px solid #3498db; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);"
                                oninput="filterCityLeagueTable()">
                            <div id="cityLeagueSearchResults" style="margin-top: 8px; font-size: 14px; color: #555; font-weight: 500;"></div>
                        </div>
                        <div id="cityLeagueFullTable"></div>
                    </div>
                    
                    <!-- Grouped by Main Pokemon -->
                    <div style="flex: 1; min-width: 350px;">
                        <h2 style="color: #34495e; border-bottom: 3px solid #3498db; padding-bottom: 10px; margin-bottom: 20px;">📚 Archetype Combined (Top 20)</h2>
                        <div style="margin-bottom: 15px; padding: 12px; background: #ecf0f1; border-radius: 5px; font-size: 0.9em; color: #333; font-weight: 500;">
                            Kumulierte Zahlen aller Varianten eines Haupt-Pokemons (z.B. alle "dragapult *" Decks)
                        </div>
                        <div id="cityLeagueCombinedTable"></div>
                    </div>
                </div>
                
                <div style="background: #ecf0f1; padding: 15px; border-radius: 5px; margin-top: 30px; text-align: center;">
                    <span style="display: inline-block; margin: 0 15px; font-weight: bold;">📅 Generated: ${generatedDate}</span>
                    <span style="display: inline-block; margin: 0 15px; font-weight: bold;">📋 Total Archetypes Tracked: ${totalArchetypes}</span>
                </div>`;
            
            content.innerHTML = html;
            
            // Store sorted data globally for filtering
            window.cityLeagueSortedData = sorted;
            
            // Group data by main Pokemon (first word)
            const groupedData = groupByMainPokemon(cityLeagueData);
            
            // Initial render
            renderFullComparisonTable(sorted.slice(0, 30));
            renderCombinedTable(groupedData.slice(0, 20));
            // Phase 1: render meta share chart
            renderMetaChart('cityLeague', sorted);
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
        function renderCombinedTable(data) {
            const container = document.getElementById('cityLeagueCombinedTable');
            if (!container) return;
            
            const isMobile = window.innerWidth <= 768;
            let tableHTML = '';
            
            if (isMobile) {
                // Mobile: Kompakte Version
                tableHTML = `
                <table style="width: 100%; border-collapse: collapse; box-shadow: 0 2px 10px rgba(0,0,0,0.1); font-size: 0.68em; table-layout: fixed;">
                    <colgroup>
                        <col style="width: 40%;">
                        <col style="width: 15%;">
                        <col style="width: 22.5%;">
                        <col style="width: 22.5%;">
                    </colgroup>
                    <thead>
                        <tr style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                            <th style="padding: 8px 4px; text-align: left; font-weight: 600; font-size: 0.95em;">Pokemon</th>
                            <th style="padding: 8px 4px; text-align: center; font-weight: 600; font-size: 0.95em;">Var.</th>
                            <th style="padding: 8px 4px; text-align: center; font-weight: 600; font-size: 0.95em;">Count</th>
                            <th style="padding: 8px 4px; text-align: center; font-weight: 600; font-size: 0.95em;">Avg.</th>
                        </tr>
                    </thead>
                    <tbody>`;
                
                data.forEach(d => {
                    const changeValue = parseInt(d.count_change || 0);
                    const changeColor = changeValue > 0 ? '#27ae60' : changeValue < 0 ? '#e74c3c' : '#95a5a6';
                    const placementChange = parseFloat(d.avg_placement_change || '0');
                    const placementColor = placementChange < 0 ? '#27ae60' : placementChange > 0 ? '#e74c3c' : '#95a5a6';
                    const displayName = d.main.charAt(0).toUpperCase() + d.main.slice(1);
                    
                    tableHTML += `
                        <tr style="border-bottom: 1px solid #ecf0f1;" title="${d.variants.join(', ')}">
                            <td style="padding: 8px 4px; font-weight: bold; font-size: 0.85em; word-wrap: break-word; overflow-wrap: break-word;">${displayName}</td>
                            <td style="padding: 8px 4px; text-align: center; color: #555; font-size: 0.85em; font-weight: 600;">${d.variant_count}</td>
                            <td style="padding: 8px 4px; text-align: center; font-size: 0.85em;">${d.new_count} <span style="color: ${changeColor}; font-weight: bold; font-size: 0.8em;">(${changeValue > 0 ? '+' : ''}${changeValue})</span></td>
                            <td style="padding: 8px 4px; text-align: center; font-size: 0.85em;">${d.new_avg_placement} <span style="color: ${placementColor}; font-weight: bold; font-size: 0.8em;">(${placementChange > 0 ? '+' : ''}${placementChange.toFixed(2)})</span></td>
                        </tr>`;
                });
                
                tableHTML += `</tbody></table>`;
            } else {
                // Desktop: Full Version
                tableHTML = `
                <table style="width: 100%; border-collapse: collapse; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                    <thead>
                        <tr style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                            <th style="padding: 12px; text-align: left; font-weight: 600;">Main Pokemon</th>
                            <th style="padding: 12px; text-align: center; font-weight: 600;">Variants</th>
                            <th style="padding: 12px; text-align: center; font-weight: 600;">Count</th>
                            <th style="padding: 12px; text-align: center; font-weight: 600;">Avg. Placement</th>
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
                    
                    tableHTML += `
                        <tr style="border-bottom: 1px solid #ecf0f1;" onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background=''" title="${d.variants.join(', ')}">
                            <td style="padding: 12px; font-weight: bold;">${displayName}</td>
                            <td style="padding: 12px; text-align: center; color: #555; font-weight: 600;">${d.variant_count}</td>
                            <td style="padding: 12px; text-align: center;">${d.new_count} <span style="color: ${changeColor}; font-size: 0.9em;">(${changeText})</span></td>
                            <td style="padding: 12px; text-align: center;">${d.new_avg_placement} <span style="color: ${placementColor}; font-weight: bold; font-size: 0.9em;">(${placementText})</span></td>
                        </tr>`;
                });
                
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
                <table style="width: 100%; border-collapse: collapse; box-shadow: 0 2px 10px rgba(0,0,0,0.1); font-size: 0.68em; table-layout: fixed;">
                    <colgroup>
                        <col style="width: 55%;">
                        <col style="width: 22.5%;">
                        <col style="width: 22.5%;">
                    </colgroup>
                    <thead>
                        <tr style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                            <th style="padding: 8px 4px; text-align: left; font-weight: 600; font-size: 0.95em;">Deck</th>
                            <th style="padding: 8px 4px; text-align: center; font-weight: 600; font-size: 0.95em;">Count</th>
                            <th style="padding: 8px 4px; text-align: center; font-weight: 600; font-size: 0.95em;">Avg. Placement</th>
                        </tr>
                    </thead>
                    <tbody>`;
                
                data.forEach(d => {
                    const changeValue = parseInt(d.count_change || 0);
                    const changeColor = changeValue > 0 ? '#27ae60' : changeValue < 0 ? '#e74c3c' : '#95a5a6';
                    const placementChange = parseFloat((d.avg_placement_change || '0').replace(',', '.'));
                    const placementColor = placementChange < 0 ? '#27ae60' : placementChange > 0 ? '#e74c3c' : '#95a5a6';
                    const archetypeEscaped = d.archetype.replace(/'/g, "\\'");
                    
                    tableHTML += `
                        <tr style="border-bottom: 1px solid #ecf0f1;" onmouseover="this.style.background='#f0f8ff'; this.style.cursor='pointer'" onmouseout="this.style.background=''">
                            <td style="padding: 8px 4px; font-weight: bold; font-size: 0.85em; word-wrap: break-word; overflow-wrap: break-word;" onclick="navigateToAnalysisWithDeck('${archetypeEscaped}')" title="Go to analysis of ${d.archetype}">${d.archetype}</td>
                            <td style="padding: 8px 4px; text-align: center; font-size: 0.85em;">${d.new_count} <span style="color: ${changeColor}; font-weight: bold; font-size: 0.8em;">(${changeValue > 0 ? '+' : ''}${changeValue})</span></td>
                            <td style="padding: 8px 4px; text-align: center; font-size: 0.85em;">${d.new_avg_placement} <span style="color: ${placementColor}; font-weight: bold; font-size: 0.8em;">(${placementChange > 0 ? '+' : ''}${placementChange.toFixed(2)})</span></td>
                        </tr>`;
                });
                
                tableHTML += `</tbody></table>`;
            } else {
                // Desktop: Kompakte Version mit Aenderungen in Klammern
                tableHTML = `
                <table style="width: 100%; border-collapse: collapse; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                    <thead>
                        <tr style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                            <th style="padding: 12px; text-align: left; font-weight: 600;">Archetype</th>
                            <th style="padding: 12px; text-align: center; font-weight: 600;">Count</th>
                            <th style="padding: 12px; text-align: center; font-weight: 600;">Avg. Placement</th>
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
                    const archetypeEscaped = d.archetype.replace(/'/g, "\\'");
                    
                    tableHTML += `
                        <tr style="border-bottom: 1px solid #ecf0f1;" onmouseover="this.style.background='#f0f8ff'; this.style.cursor='pointer'" onmouseout="this.style.background=''">
                            <td style="padding: 12px; font-weight: bold;" onclick="navigateToAnalysisWithDeck('${archetypeEscaped}')" title="Go to analysis of ${d.archetype}">${d.archetype}</td>
                            <td style="padding: 12px; text-align: center;">${d.new_count} <span style="color: ${changeColor}; font-size: 0.9em;">(${changeText})</span></td>
                            <td style="padding: 12px; text-align: center;">${d.new_avg_placement} <span style="color: ${placementColor}; font-weight: bold; font-size: 0.9em;">(${placementText})</span></td>
                        </tr>`;
                });
                
                tableHTML += `</tbody></table>`;
            }
            
            container.innerHTML = tableHTML;
        }
        
        // Filter City League Table
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
                resultsDiv.textContent = 'No results found';
                resultsDiv.style.color = '#e74c3c';
            } else {
                resultsDiv.textContent = `${filtered.length} result${filtered.length !== 1 ? 's' : ''} found`;
                resultsDiv.style.color = '#27ae60';
            }
        }
        
        // Load City League Analysis
        async function loadCityLeagueAnalysis() {
            console.log('Loading City League Analysis...');
            
            const format = window.currentCityLeagueFormat || 'M4';
            const formatSuffix = format === 'M3' ? '_M3' : '';
            const timestamp = new Date().getTime();
            const analysisUrl = `${BASE_PATH}city_league_analysis${formatSuffix}.csv`;
            const archetypesUrl = `${BASE_PATH}city_league_archetypes${formatSuffix}.csv`;
            const comparisonUrl = `${BASE_PATH}city_league_archetypes_comparison${formatSuffix}.csv`;
            const hasComparisonFile = format !== 'M3';
            
            console.log(`Loading City League Analysis for format: ${format}`);

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

            const data = analysisText ? parseCSV(analysisText) : null;
            const archetypesData = archetypesText ? parseCSV(archetypesText) : null;
            const comparisonData = comparisonText ? parseCSV(comparisonText) : deriveCityLeagueComparisonData(archetypesData || []);

            console.log('Loaded data:', data ? `${data.length} rows` : 'null');
            console.log('Loaded archetypes data:', archetypesData ? `${archetypesData.length} rows` : 'null');
            console.log('Loaded comparison data:', comparisonData ? `${comparisonData.length} rows` : 'null');

            if (data && data.length > 0 && archetypesData && archetypesData.length > 0) {
                console.log('Processing archetypes...');
                window.cityLeagueAnalysisData = data;
                window.cityLeagueArchetypesData = archetypesData;
                window.cityLeagueComparisonData = comparisonData;
                const previousDeckValue = document.getElementById('cityLeagueDeckSelect')?.value || '';
                populateCityLeagueDeckSelect(data, comparisonData);
                const deckSelect = document.getElementById('cityLeagueDeckSelect');
                if (deckSelect && previousDeckValue) {
                    const stillExists = Array.from(deckSelect.options).some(option => option.value === previousDeckValue);
                    if (stillExists) {
                        deckSelect.value = previousDeckValue;
                    }
                }
                window.cityLeagueAnalysisLoaded = true;
                
                // Load meta card analysis for consistency calculations
                console.log('Loading meta card analysis for consistency...');
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
            const filteredArchetypesData = getFilteredCityLeagueArchetypesData();

            const archetypeCountMap = new Map();
            filteredArchetypesData.forEach(row => {
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
                console.log('Loaded comparison counts for', comparisonMap.size, 'archetypes');
            }
            
            // Extract unique archetypes with their deck counts
            const archetypeMap = new Map();
            const sourceRows = filteredArchetypesData.length > 0 ? filteredArchetypesData : data;
            sourceRows.forEach(row => {
                if (row.archetype && !archetypeMap.has(row.archetype)) {
                    // Prefer live counts from raw archetype rows so dropdown and deck stats stay in sync.
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
            console.log('Found archetypes:', archetypeList.length);
            
            // Sort by deck count descending to get top meta decks
            const sortedByMeta = [...archetypeList].sort((a, b) => b.deckCount - a.deckCount);
            const top10 = sortedByMeta.slice(0, 10);
            const rest = sortedByMeta.slice(10).sort((a, b) => a.name.localeCompare(b.name));
            
            console.log('Top 10 meta decks:', top10.map(d => `${d.name} (${d.deckCount})`));
            
            const select = document.getElementById('cityLeagueDeckSelect');
            if (!select) return;
            
            // Clear and repopulate
            select.innerHTML = '<option value="">-- Select a Deck --</option>';
            
            // Add top 10 meta decks
            if (top10.length > 0) {
                const topGroup = document.createElement('optgroup');
                topGroup.label = '🏆 Top 10 Meta Decks';
                top10.forEach(archetype => {
                    const option = document.createElement('option');
                    option.value = archetype.name;
                    option.textContent = `${archetype.name} (${archetype.deckCount} Decks)`;
                    topGroup.appendChild(option);
                });
                select.appendChild(topGroup);
            }
            
            // Add remaining decks alphabetically
            if (rest.length > 0) {
                const restGroup = document.createElement('optgroup');
                restGroup.label = '🎴 All Other Decks (A-Z)';
                rest.forEach(archetype => {
                    const option = document.createElement('option');
                    option.value = archetype.name;
                    option.textContent = `${archetype.name} (${archetype.deckCount} Decks)`;
                    restGroup.appendChild(option);
                });
                select.appendChild(restGroup);
            }
            
            // Add change event listener
            select.onchange = function() {
                if (this.value) {
                    loadCityLeagueDeckData(this.value);
                    // DON'T auto-display deck - user must click "Generate Deck" button
                    // This prevents unwanted deck building when just browsing decks
                    console.log('[Dropdown] Archetype selected:', this.value, '- waiting for user to generate deck');
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
                    console.log('✅ Applied pending City League deck selection:', matchingOption.value);
                }
            }
            
            // Enable search functionality
            const searchInput = document.getElementById('cityLeagueDeckSearch');
            if (searchInput) {
                searchInput.oninput = function() {
                    const searchTerm = this.value.toLowerCase();
                    // Search through all options in all optgroups
                    Array.from(select.querySelectorAll('option')).forEach(option => {
                        if (option.value) {
                            option.style.display = option.textContent.toLowerCase().includes(searchTerm) ? '' : 'none';
                        }
                    });
                    // Hide optgroups if all options are hidden
                    Array.from(select.querySelectorAll('optgroup')).forEach(group => {
                        const hasVisibleOptions = Array.from(group.querySelectorAll('option')).some(opt => opt.style.display !== 'none');
                        group.style.display = hasVisibleOptions ? '' : 'none';
                    });
                };
            }
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
            const matches = getFilteredCityLeagueArchetypesData().filter(row =>
                row.archetype && row.archetype.toLowerCase() === String(archetype || '').toLowerCase()
            );

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

        function refreshCityLeagueDeckSelect() {
            const select = document.getElementById('cityLeagueDeckSelect');
            const previousValue = select ? select.value : '';

            populateCityLeagueDeckSelect(window.cityLeagueAnalysisData || [], window.cityLeagueComparisonData || []);

            if (!select) return '';

            const stillExists = Array.from(select.options).some(option => option.value === previousValue);
            select.value = stillExists ? previousValue : '';
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
            const dateFrom = document.getElementById('cityLeagueDateFrom').value;
            const dateTo = document.getElementById('cityLeagueDateTo').value;
            
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
            
            const dateFrom = document.getElementById('cityLeagueDateFrom').value;
            const dateTo = document.getElementById('cityLeagueDateTo').value;
            
            if (dateFrom && dateTo) {
                statusEl.textContent = `Filtered: ${formatDate(dateFrom)} to ${formatDate(dateTo)}`;
                statusEl.style.color = 'rgba(255,255,255,1)';
            } else if (dateFrom) {
                statusEl.textContent = `Filtered: From ${formatDate(dateFrom)}`;
                statusEl.style.color = 'rgba(255,255,255,1)';
            } else if (dateTo) {
                statusEl.textContent = `Filtered: Until ${formatDate(dateTo)}`;
                statusEl.style.color = 'rgba(255,255,255,1)';
            } else {
                statusEl.textContent = 'Showing all tournaments';
                statusEl.style.color = 'rgba(255,255,255,0.8)';
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

            const liveStats = getCityLeagueArchetypeStats(archetype);
            if (liveStats.decksCount > 0) return liveStats.decksCount;

            // 1) Prefer comparison dataset (new_count)
            const comparisonRows = window.cityLeagueComparisonData || [];
            const comparisonMatch = comparisonRows.find(row =>
                row.archetype && row.archetype.toLowerCase() === archetype.toLowerCase()
            );
            const comparisonCount = comparisonMatch
                ? parseInt(comparisonMatch.new_count || comparisonMatch.count || comparisonMatch.total_decks_in_archetype || 0, 10)
                : 0;
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
            const analysisMatch = analysisRows.find(row =>
                row.archetype && row.archetype.toLowerCase() === archetype.toLowerCase()
            );
            const analysisCount = analysisMatch ? parseInt(analysisMatch.total_decks_in_archetype || 0, 10) : 0;
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
                
                // Recalculate max_count (most common count)
                let max_count = 0;
                if (stats.counts.length > 0) {
                    const countFrequency = {};
                    stats.counts.forEach(c => {
                        countFrequency[c] = (countFrequency[c] || 0) + 1;
                    });
                    max_count = parseInt(Object.keys(countFrequency).reduce((a, b) => 
                        countFrequency[a] > countFrequency[b] ? a : b
                    ));
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
            
            console.log(`Recalculated stats for ${recalculatedCards.length} unique cards based on ${totalDecks} filtered tournaments`);
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
            
            // Calculate total decks across all tournaments
            // For each unique tournament date, get the total_decks_in_archetype value
            // CRITICAL FIX: Only set if not already present (take first occurrence)
            const tournamentDecksMap = new Map();
            filteredCards.forEach(row => {
                const tournamentKey = getAggregationBucketKey(row);
                const decksInTournament = parseInt(row.total_decks_in_archetype_in_period || row.total_decks_in_archetype || 0, 10) || 0;
                if (!tournamentDecksMap.has(tournamentKey)) {
                    tournamentDecksMap.set(tournamentKey, decksInTournament);
                }
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
            
            console.log('DEBUG: Tournament deck counts:', Array.from(tournamentDecksMap.entries()));
            console.log('DEBUG: Total decks across all tournaments:', totalDecks);
            
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
                        tournamentDeckCountsWithCard: new Map(),
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
                // Track deck count for each tournament where this card appeared
                const decksInTournament = parseInt(row.total_decks_in_archetype_in_period || row.total_decks_in_archetype || 0, 10) || 0;
                cardData.tournamentDeckCountsWithCard.set(tournamentKey, decksInTournament);
            });
            
            // Create aggregated result
            const result = [];
            
            cardMap.forEach((data, cardName) => {
                const row = { ...data.sampleRow };
                
                // Calculate aggregated max_count (most common value)
                let max_count = 0;
                if (data.maxCountValues.length > 0) {
                    const countFreq = {};
                    data.maxCountValues.forEach(val => {
                        countFreq[val] = (countFreq[val] || 0) + 1;
                    });
                    max_count = parseInt(Object.keys(countFreq).reduce((a, b) => 
                        countFreq[a] > countFreq[b] ? a : b
                    ));
                }

                // Recalculate deckCounts per tournament with cap (prevents split-print double counting).
                let deckCounts = 0;
                data.deckCountByTournament.forEach((sumDeckCount, tournamentKey) => {
                    const decksInTournament = data.tournamentDeckCountsWithCard.get(tournamentKey) || 0;
                    const bounded = decksInTournament > 0 ? Math.min(sumDeckCount, decksInTournament) : sumDeckCount;
                    deckCounts += bounded;
                });

                // Single-deck selection: max_count must equal full card copies in that deck (including mixed prints).
                if (totalDecks === 1) {
                    max_count = Math.round(data.totalCount);
                    deckCounts = deckCounts > 0 ? 1 : 0;
                }
                
                // Calculate percentage based on actual deck counts
                // data.deckCounts is the sum of deck_count values (number of decks containing this card)
                // totalDecks is the sum of total_decks_in_archetype values (total number of decks in all tournaments)
                // Cap at 100 to prevent > 100% values from data anomalies
                const percentage = totalDecks > 0 ? Math.min(100, (deckCounts / totalDecks * 100)) : 0;
                
                // Calculate averages.
                // average_count = average copies in decks that actually use the card.
                // average_count_overall = average copies across all decks in the archetype.
                const avgCountWhenUsed = deckCounts > 0 ? (data.totalCount / deckCounts) : 0;
                const avgCountOverall = totalDecks > 0 ? (data.totalCount / totalDecks) : 0;
                
                // Update row and preserve important fields from sampleRow
                row.total_count = data.totalCount;
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
                    console.log(`M3 card aggregated: ${row.card_name}, set_code: ${row.set_code}, url: ${row.image_url}`);
                }
                
                result.push(row);
            });
            
            console.log(`Aggregated ${result.length} unique cards from ${totalDecks} decks across ${tournamentDecksMap.size} tournaments`);
            return result;
        }
        
        function loadCityLeagueDeckData(archetype) {
            console.log('Loading deck data for:', archetype);
            const data = window.cityLeagueAnalysisData;
            if (!data) return;

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
                        console.log('[loadCityLeagueDeckData] Deck already loaded for this archetype');
                    } else {
                        // Different archetype - CLEAR old deck
                        console.log('[loadCityLeagueDeckData] Clearing old deck from different archetype:', parsed.archetype);
                        window.cityLeagueDeck = {};
                        window.cityLeagueDeckOrder = [];
                        saveCityLeagueDeck();
                    }
                } catch (e) {
                    console.error('[loadCityLeagueDeckData] Error reading saved deck:', e);
                }
            }
            
            // Filter cards for this archetype
            let deckCards = data.filter(row => row.archetype === archetype);
            console.log('Found cards (before date filter):', deckCards.length);
            
            // Apply date filter if active
            if (window.cityLeagueDateFilterActive) {
                const dateFrom = window.cityLeagueDateFrom;
                const dateTo = window.cityLeagueDateTo;
                
                console.log('DEBUG: Filtering by date range:', dateFrom, 'to', dateTo);
                
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
                        statusEl.style.color = '#ffb3b3';
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
                
                console.log('DEBUG: Date filter examples:', dateDebugSample);
                console.log(`Date filter applied (${dateFrom} to ${dateTo}):`, deckCards.length, 'cards');
            }
            
            console.log('Found cards (before deduplication):', deckCards.length);
            
            // Always aggregate cards stats (not just when date filter is active)
            // This ensures deck_count is correctly summed across all tournaments
            if (deckCards.length > 0) {
                deckCards = aggregateCardStatsByDate(deckCards);
                console.log('After aggregating by date:', deckCards.length, 'unique cards');
            }
            
            // Dedupliziere: Nur neueste low-rarity Version pro Karte
            deckCards = deduplicateCards(deckCards);
            console.log('Found cards (after deduplication):', deckCards.length);
            
            // Store unfiltered deck cards for filter function
            window.currentCityLeagueDeckCards = deckCards;
            
            // Calculate stats - use max_count which represents typical deck composition
            const totalCardsInDeck = deckCards.reduce((sum, card) => sum + parseInt(card.max_count || 0), 0);
            const uniqueCards = deckCards.length;
            
            // Get current deck count from aggregated data
            // Since we now always aggregate, use total_decks_in_archetype from first card
            let decksCount = getSelectedCityLeagueDeckCount(archetype)
                || archetypeStats.decksCount
                || parseInt(deckCards[0]?.total_decks_in_archetype || 0, 10);
            if (!decksCount || decksCount <= 0) {
                decksCount = getCityLeagueDeckCountFallback(archetype);
            }
            if (!decksCount || decksCount <= 0) {
                decksCount = '-';
            }
            console.log(`Using deck count from aggregated data: ${decksCount} decks`);
            
            // Calculate average placement from archetypes data
            const avgPlacement = archetypeStats.avgPlacement;
            
            // Store total decks count globally for use in card displays
            window.currentCityLeagueTotalDecks = parseInt(decksCount) || 0;
            console.log(`Stored global deck count: ${window.currentCityLeagueTotalDecks}`);
            
            // Update stats
            document.getElementById('cityLeagueStatCards').textContent = `${uniqueCards} / ${totalCardsInDeck}`;
            document.getElementById('cityLeagueStatDecksUsed').textContent = decksCount;
            document.getElementById('cityLeagueStatAvgPlacement').textContent = avgPlacement !== '-' ? avgPlacement : '-';
            document.getElementById('cityLeagueStatsSection').style.display = 'block';
            
            // Reset button text to show list view option
            const gridButtons = document.querySelectorAll('button[onclick="toggleDeckGridView()"]');
            gridButtons.forEach(btn => btn.textContent = '📋 List View');
            
            // Apply current filter (this renders the grid - do not call renderCityLeagueDeckGrid separately)
            applyCityLeagueFilter();
            
            // DON'T auto-display deck here - let the caller decide
            // (only display when user actively selects archetype from dropdown)
        }
        
        function clearCityLeagueDeckView() {
            document.getElementById('cityLeagueStatsSection').style.display = 'none';
            document.getElementById('cityLeagueDeckVisual').style.display = 'none';
            document.getElementById('cityLeagueDeckTableView').style.display = 'none';
            document.getElementById('cityLeagueCardCount').textContent = '0 Cards';
            document.getElementById('cityLeagueCardCountSummary').textContent = '/ 0 Total';
            
            // Reset button text
            const gridButtons = document.querySelectorAll('button[onclick="toggleDeckGridView()"]');
            gridButtons.forEach(btn => btn.textContent = '📋 List View');
        }
        
        // Helper function to get Limitless Japanese fallback URL for M3/M4 cards
        function getM3JapaneseFallbackUrl(setCode, cardNumber) {
            if (!cardNumber) return '';
            // Remove leading zeros: 075 ? 75
            const num = cardNumber.toString().replace(/^0+/, '');
            const normalizedSet = String(setCode || 'M3').toUpperCase();
            return `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/${normalizedSet}/${normalizedSet}_${num}_R_JP_LG.png`;
        }

        function getIndexedCardBySetNumber(setCode, cardNumber) {
            const normalizedSet = String(setCode || '').toUpperCase().trim();
            const rawNumber = String(cardNumber || '').trim();
            if (!normalizedSet || !rawNumber) {
                return null;
            }

            if (cardIndexBySetNumber instanceof Map && cardIndexBySetNumber.size > 0) {
                const exactMatch = cardIndexBySetNumber.get(`${normalizedSet}-${rawNumber}`);
                if (exactMatch) return exactMatch;

                const normalizedNumber = rawNumber.replace(/^0+/, '') || '0';
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

            const normalizedSet = String(setCode || '').toUpperCase().trim();
            const rawNumber = String(cardNumber || '').trim();
            if (!normalizedSet || !rawNumber || !cardsBySetNumberMap) {
                return null;
            }

            const exactKey = `${normalizedSet}-${rawNumber}`;
            if (cardsBySetNumberMap[exactKey]) {
                return cardsBySetNumberMap[exactKey];
            }

            const normalizedNumber = rawNumber.replace(/^0+/, '') || '0';
            const normalizedKey = `${normalizedSet}-${normalizedNumber}`;
            if (cardsBySetNumberMap[normalizedKey]) {
                return cardsBySetNumberMap[normalizedKey];
            }

            const paddedNumber = normalizedNumber.padStart(3, '0');
            const paddedKey = `${normalizedSet}-${paddedNumber}`;
            return cardsBySetNumberMap[paddedKey] || null;
        }

        function getUnifiedCardImage(set, number) {
            const normalizedSet = String(set || '').toUpperCase().trim();
            const rawNumber = String(number || '').trim();
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
            return '<div class="empty-state"><h3>Keine Daten gefunden</h3><p>Für diese Filterkombination liegen aktuell keine Turnierdaten vor.</p></div>';
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
                img.style.opacity = '0.5';
                return;
            }

            let fallbackUrl = explicitFallbackUrl || '';
            const src = img.getAttribute('src') || '';
            const normalizedSet = (setCode || '').toUpperCase();

            // For M3/M4 cards, fallback to Limitless JP when the primary URL fails.
            if (!fallbackUrl) {
                const isM3M4 = (normalizedSet === 'M3' || normalizedSet === 'M4' || /\/(M3|M4)\//i.test(src));
                if (isM3M4) {
                    const fallbackSet = normalizedSet === 'M4' ? 'M4' : 'M3';
                    fallbackUrl = getM3JapaneseFallbackUrl(fallbackSet, cardNumber);
                }
            }

            if (fallbackUrl) {
                console.log(`🖼️ Image Error → Trying fallback: ${fallbackUrl}`);
                img.setAttribute('data-fallback-tried', 'true');
                img.setAttribute('data-image-source', 'fallback-limitless');
                img.src = fallbackUrl;
            } else {
                // No fallback URL available – show placeholder immediately
                img.src = 'data:image/svg+xml,%3Csvg xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22 width%3D%22200%22 height%3D%22280%22%3E%3Crect width%3D%22200%22 height%3D%22280%22 fill%3D%22%23333%22%2F%3E%3Ctext x%3D%2250%25%22 y%3D%2250%25%22 dominant-baseline%3D%22middle%22 text-anchor%3D%22middle%22 fill%3D%22%23999%22 font-size%3D%2218%22%3ENo Image%3C%2Ftext%3E%3C%2Fsvg%3E';
                img.style.opacity = '0.5';
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
                console.log(`🇯🇵 M3 Card → Limitless JP fallback: ${originalUrl} → ${url}`);
                return url;
            }

            const isM4Set = setCode === 'M4' || url.includes('/M4/');
            if (isM4Set) {
                const originalUrl = url;
                url = url.replace('/tpci/', '/tpc/');
                url = url.replace(/_EN_/g, '_JP_');
                url = url.replace(/\/M4_0+(\d+)_/g, '/M4_$1_');
                console.log(`🇯🇵 M4 Card → Limitless JP fallback: ${originalUrl} → ${url}`);
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
                    console.log(`🔄 Japanese → English Proxy: ${originalUrl} → ${url}`);
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
            
            let html = '<div style="display: flex; flex-direction: column; gap: 15px;">';
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
                const rawPercentage = parseFloat(String(card.percentage_in_archetype || card.share_percent || 0).replace(',', '.'));
                const maxCount = parseInt(card.max_count) || card.max_count || '?';
                const cardNameEscaped = cardName.replace(/'/g, "\\'");
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
                const decksWithCard = parseFloat(String(card.deck_count || card.deck_inclusion_count || 0).replace(',', '.')) || 0;
                // Use global total decks count instead of per-date total_decks_in_archetype
                const totalDecksInArchetype = parseFloat(String(window.currentCityLeagueTotalDecks || card.total_decks_in_archetype || 0).replace(',', '.')) || 0;
                const totalCount = parseFloat(String(card.total_count || 0).replace(',', '.')) || 0;
                const avgCountOverallRaw = parseFloat(String(card.average_count_overall || '').replace(',', '.'));
                const avgCountInUsedRaw = parseFloat(String(card.average_count || card.avg_count || '').replace(',', '.'));

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
                    <div class="card-table-row" data-card-name="${cardName.toLowerCase()}" style="display: flex; align-items: center; background: white; border-radius: 8px; padding: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); gap: 20px;">
                        <!-- Card Image -->
                        <div style="flex-shrink: 0; position: relative; width: 120px;">
                            <img src="${imageUrl}" alt="${cardName}" loading="lazy" referrerpolicy="no-referrer" style="width: 100%; border-radius: 6px; cursor: zoom-in; aspect-ratio: 2.5/3.5; object-fit: cover;" onerror="handleCardImageError(this, '${setCode}', '${setNumber}')" onclick="showSingleCard(this.src, '${cardNameEscaped}');">
                            ${deckCount > 0 ? `<div style="position: absolute; top: 5px; left: 5px; background: #28a745; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.85em; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${deckCount}</div>` : ''}
                        </div>
                        
                        <!-- Card Info -->
                        <div style="flex-grow: 1; min-width: 0;">
                            <h3 style="margin: 0 0 8px 0; font-size: 1.2em; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${cardName}</h3>
                            <div style="color: #333; font-size: 0.9em; margin-bottom: 10px; font-weight: 600;">${setCode} ${setNumber}</div>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin-bottom: 10px;">
                                <div>
                                    <span style="color: #555; font-size: 0.85em; font-weight: 600;">Usage Share:</span>
                                    <span style="font-weight: 600; color: #333; margin-left: 5px; font-size: 0.95em;">${percentage}%</span>
                                  </div>
                                <div>
                                    <span style="color: #555; font-size: 0.85em; font-weight: 600;">Ø avg. (used decks):</span>
                                    <span style="font-weight: 600; color: #333; margin-left: 5px; font-size: 0.95em;">${avgCountInUsedDecks}x</span>
                                </div>
                                <div>
                                    <span style="color: #555; font-size: 0.85em; font-weight: 600;">Ø avg. (all decks):</span>
                                    <span style="font-weight: 600; color: #333; margin-left: 5px; font-size: 0.95em;">${avgCountOverall}x</span>
                                </div>
                                <div>
                                    <span style="color: #555; font-size: 0.85em; font-weight: 600;">Deck Count:</span>
                                    <span style="font-weight: 600; color: #333; margin-left: 5px; font-size: 0.95em;">${decksWithCardDisplay}/${totalDecksDisplay} (${percentage}%)</span>
                                </div>
                                <div>
                                    <span style="color: #555; font-size: 0.85em; font-weight: 600;">Max Count:</span>
                                    <span style="font-weight: 600; color: #dc3545; margin-left: 5px; font-size: 0.95em;">${maxCount}</span>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Add Button -->
                        <div style="flex-shrink: 0;">
                            <button class="btn btn-success" style="padding: 10px 20px; font-size: 0.95em; white-space: nowrap;" onclick="addCardToDeck('cityLeague', '${cardNameEscaped}', '${setCode}', '${setNumber}')" title="Add to deck">Add to Deck</button>
                        </div>
                    </div>
                `;
            });
            html += '</div>';
            
            tableContainer.innerHTML = html;
            tableViewContainer.style.display = 'block';
        }
        
        // Get all versions of a card from allCardsDatabase
        function getAllVersionsOfCard(cardName) {
            const allCards = window.allCardsDatabase || [];
            return allCards.filter(c => c.name === cardName);
        }
        
        // Set overview rarity mode and refresh display
        function setOverviewRarityMode(mode) {
            console.log('?? Setting overview rarity mode to:', mode);
            overviewRarityMode = mode;
            
            // Synchronize with global rarity preference so deck builder uses same setting
            // For 'all' mode, keep original cards (no preference), otherwise use min/max
            if (mode === 'all') {
                // For "Alle Prints" mode in deck builder, use original card (no rarity swap)
                globalRarityPreference = null;
            } else {
                globalRarityPreference = mode; // 'min' or 'max'
            }
            console.log('?? Global rarity preference synced to:', globalRarityPreference || 'none (original cards)');
            
            // Update button styles - make sure elements exist first
            const btnMin = document.getElementById('overviewRarityMin');
            const btnMax = document.getElementById('overviewRarityMax');
            const btnAll = document.getElementById('overviewRarityAll');
            
            if (btnMin) btnMin.style.opacity = mode === 'min' ? '1' : '0.6';
            if (btnMax) btnMax.style.opacity = mode === 'max' ? '1' : '0.6';
            if (btnAll) btnAll.style.opacity = mode === 'all' ? '1' : '0.6';
            
            // Re-render the grid with current cards (preserve percentage filter)
            const cards = window.currentCityLeagueDeckCards;
            console.log('?? Cards available for re-render:', cards ? cards.length : 'none');
            if (cards && cards.length > 0) {
                console.log('? Re-rendering grid with mode:', mode);
                applyCityLeagueFilter();  // Use filter function to preserve percentage filter
            } else {
                console.warn('?? No cards available to render - mode saved for when deck is selected');
            }
            
            // Also update the deck display with new rarity preference
            if (window.cityLeagueDeck && Object.keys(window.cityLeagueDeck).length > 0) {
                console.log('?? Re-rendering deck with new rarity preference');
                updateDeckDisplay('cityLeague');
            }
        }
        
        // ============================================================================
        // TREND CALCULATION - Calculate usage trends over time
        // ============================================================================
        // Render function for grid view (compact view)
        function renderCityLeagueDeckGrid(cards) {
            console.log('?? renderCityLeagueDeckGrid called with:', cards.length, 'cards, mode:', overviewRarityMode);
            const visualContainer = document.getElementById('cityLeagueDeckVisual');
            const gridContainer = document.getElementById('cityLeagueDeckGrid');
            if (!gridContainer) return;

            if (!Array.isArray(cards) || cards.length === 0) {
                gridContainer.innerHTML = getEmptyStateHtml();
                if (visualContainer) visualContainer.style.display = 'block';
                return;
            }
            
            // Use the same sorting logic as "Karten Uebersicht (sortiert)"
            const sortedCards = sortCardsByType([...cards]);
            
            // Get current deck to show deck counts
            const currentDeck = window.cityLeagueDeck || {};
            
            // PERFORMANCE: Pre-build price lookup Map for O(1) access
            const allCardsDatabase = window.allCardsDatabase || [];
            const priceMap = new Map();
            allCardsDatabase.forEach(card => {
                if (card.set && card.number) {
                    const key = `${card.set}-${card.number}`;
                    priceMap.set(key, card);
                    // Also store with normalized number (without leading zeros)
                    const normalizedNumber = card.number.replace(/^0+/, '') || '0';
                    const normalizedKey = `${card.set}-${normalizedNumber}`;
                    if (normalizedKey !== key) {
                        priceMap.set(normalizedKey, card);
                    }
                }
            });
            
            let html = '';
            sortedCards.forEach(card => {
                // Get original card's set/number from the City League deck data
                const originalSetCode = card.set_code || '';
                const originalSetNumber = card.set_number || '';
                const rawCardName = card.card_name || '';
                const cardName = getDisplayCardName(rawCardName, originalSetCode, originalSetNumber);
                const cardNameEscaped = cardName.replace(/'/g, "\\'");
                
                // Apply rarity mode to determine which versions to show
                let versionsToRender = [];
                
                if (overviewRarityMode === 'all') {
                    // Show ALL international prints of this specific card
                    let allVersions = getInternationalPrintsForCard(originalSetCode, originalSetNumber);
                    console.log(`?? All mode for ${cardName} (${originalSetCode} ${originalSetNumber}): found ${allVersions.length} int prints`);
                    
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
                        console.log(`?? ${overviewRarityMode} mode for ${cardName}: using PREFERRED version ${preferredVersion.set} ${preferredVersion.number} (${preferredVersion.rarity})`);
                        versionsToRender = [{
                            ...card,
                            set_code: preferredVersion.set,
                            set_number: preferredVersion.number,
                            image_url: preferredVersion.image_url,
                            rarity: preferredVersion.rarity
                        }];
                    } else {
                        // No preferred version found, use original
                        console.log(`?? ${overviewRarityMode} mode for ${cardName}: no preferred version found, using original`);
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
                const rawPercentage = parseFloat(String(card.percentage_in_archetype || card.share_percent || 0).replace(',', '.'));
                
                // HARD CAP: Maximum 4 copies for non-basic-energy cards.
                const isEnergy = isBasicEnergyCardEntry(card);
                const rawMaxCount = parseInt(card.max_count) || card.max_count || 0;
                
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
                const decksWithCard = parseFloat(String(card.deck_count || card.deck_inclusion_count || 0).replace(',', '.')) || 0;  // Number of decks that contain this card
                // Use global total decks count instead of per-date total_decks_in_archetype
                const totalDecksInArchetype = parseFloat(String(window.currentCityLeagueTotalDecks || card.total_decks_in_archetype || 0).replace(',', '.')) || 0;
                
                // Get average count statistics
                const totalCount = parseFloat(String(card.total_count || 0).replace(',', '.')) || 0;
                const avgCountOverallRaw = parseFloat(String(card.average_count_overall || '').replace(',', '.'));
                const avgCountInUsedRaw = parseFloat(String(card.average_count || card.avg_count || '').replace(',', '.'));

                const resolvedPercentage = Number.isFinite(rawPercentage) && rawPercentage > 0
                    ? rawPercentage
                    : (totalDecksInArchetype > 0 && decksWithCard > 0 ? (decksWithCard / totalDecksInArchetype) * 100 : 0);
                const avgCountOverallValue = Number.isFinite(avgCountOverallRaw) && avgCountOverallRaw > 0
                    ? avgCountOverallRaw
                    : (totalDecksInArchetype > 0 ? (totalCount / totalDecksInArchetype) : 0);
                const avgCountInUsedValue = Number.isFinite(avgCountInUsedRaw) && avgCountInUsedRaw > 0
                    ? avgCountInUsedRaw
                    : (decksWithCard > 0 ? (totalCount / decksWithCard) : 0);

                const finalMaxCount = isEnergy ? rawMaxCount : Math.min(4, Math.max(1, rawMaxCount));
                const finalAvgUsed = isEnergy ? avgCountInUsedValue : Math.min(4, avgCountInUsedValue);
                const finalAvgOverall = isEnergy ? avgCountOverallValue : Math.min(4, avgCountOverallValue);
                const maxCount = finalMaxCount;

                const percentage = Math.max(0, resolvedPercentage).toFixed(1).replace('.', ',');
                const avgCountOverall = Math.max(0, finalAvgOverall).toFixed(2).replace('.', ',');  // Average over all decks
                const avgCountInUsedDecks = Math.max(0, finalAvgUsed).toFixed(2).replace('.', ',');  // Average in decks that use this card
                const decksWithCardDisplay = Math.round(Math.max(0, decksWithCard));
                const totalDecksDisplay = Math.round(Math.max(0, totalDecksInArchetype));
                const selectedArchetype = document.getElementById('cityLeagueArchetypeSelect')?.value || window.currentCityLeagueArchetype || 'all';
                const trendHistory = getCityLeagueCardShareHistory(cardName, selectedArchetype);
                const trendIndicator = getTrendIndicator(trendHistory);
                const showTrendOverlay = trendIndicator && !trendIndicator.includes('trend-stable');
                
                // PERFORMANCE: Get price using Map lookup instead of find()
                let eurPrice = '';
                let cardmarketUrl = '';
                let germanCardName = (displayCard.name_de || card.name_de || card.card_name_de || '').toLowerCase();
                if (setCode && setNumber) {
                    // Try exact match first
                    let key = `${setCode}-${setNumber}`;
                    let priceCard = priceMap.get(key);
                    
                    // If no exact match, try with normalized numbers (remove leading zeros)
                    if (!priceCard) {
                        const normalizedNumber = setNumber.replace(/^0+/, '') || '0';
                        const normalizedKey = `${setCode}-${normalizedNumber}`;
                        priceCard = priceMap.get(normalizedKey);
                        if (priceCard) {
                            console.log(`[Price Lookup] Found with normalized number for ${cardName}: ${setCode} ${setNumber} -> ${normalizedNumber}`);
                        }
                    }
                    
                    if (priceCard) {
                        eurPrice = priceCard.eur_price || '';
                        cardmarketUrl = priceCard.cardmarket_url || '';
                        if (priceCard.name_de) {
                            germanCardName = String(priceCard.name_de).toLowerCase();
                        }
                    } else {
                        console.log(`[Price Lookup] ? No price found for ${cardName} (${setCode} ${setNumber})`);
                    }
                }
                const priceDisplay = eurPrice || '0,00€';
                const priceBackground = eurPrice ? 'linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)' : 'linear-gradient(135deg, #777 0%, #999 100%)';
                const cardmarketUrlEscaped = (cardmarketUrl || '').replace(/'/g, "\\'");
                
                // Determine card type category for filtering
                const cardType = card.type || card.card_type || '';
                const cardCategory = getCardTypeCategory(cardType);
                const isAceSpecCard = isAceSpec(cardName);
                const filterCategory = isAceSpecCard ? 'Ace Spec' : cardCategory;
                const germanCardNameEscaped = germanCardName.replace(/"/g, '&quot;');
                
                html += `
                    <div class="card-item" data-card-name="${cardName.toLowerCase()}" data-card-name-de="${germanCardNameEscaped}" data-card-set="${setCode.toLowerCase()}" data-card-number="${setNumber.toLowerCase()}" data-card-type="${filterCategory}" style="position: relative; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.15); cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; background: white;">
                        <div class="card-image-container" style="position: relative; width: 100%;">
                            <img src="${imageUrl}" alt="${cardName}" loading="lazy" referrerpolicy="no-referrer" style="width: 100%; aspect-ratio: 2.5/3.5; object-fit: cover; cursor: zoom-in;" onerror="handleCardImageError(this, '${setCode}', '${setNumber}')" onclick="if (typeof event !== 'undefined' && event) event.stopPropagation(); showSingleCard(this.src, '${cardNameEscaped}');">
                            
                            <!-- Red badge: Max Count (top-right) -->
                            <div style="position: absolute; top: 5px; right: 5px; background: #dc3545; color: white; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.7em; box-shadow: 0 2px 4px rgba(0,0,0,0.3); z-index: 2;">
                                ${finalMaxCount}
                            </div>
                            
                            <!-- Green badge: Deck Count (top-left) - only show if > 0 -->
                            ${deckCount > 0 ? `<div style="position: absolute; top: 5px; left: 5px; background: #28a745; color: white; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.7em; box-shadow: 0 2px 4px rgba(0,0,0,0.3); z-index: 2;">${deckCount}</div>` : ''}
                            ${showTrendOverlay ? `<div class="trend-badge-overlay">${trendIndicator}</div>` : ''}
                            
                            <!-- Card info section - Mobile Overlay -->
                            <div class="card-info-bottom" style="padding: 5px; background: white; font-size: 0.7em; text-align: center; min-height: 48px; display: flex; flex-direction: column; justify-content: space-between;">
                                <div class="card-info-text">
                                    <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; margin-bottom: 1px; color: #333; font-size: 0.58em;">
                                        ${cardName}${cardNameWarning}
                                    </div>
                                    <div style="color: #333; font-size: 0.52em; margin-bottom: 1px; font-weight: 600;">
                                        ${setCode} ${setNumber}
                                    </div>
                                    <div style="color: #333; font-size: 0.55em; margin-bottom: 1px; font-weight: 600;">
                                        ${resolvedPercentage > 0 ? `${percentage}% | Ø ${Math.round(avgCountInUsedValue)}x (${Math.round(avgCountOverallValue)}x)` : ''}
                                    </div>
                                    <div style="font-weight: 600; color: #333; font-size: 0.58em;">
                                        ${decksWithCardDisplay}/${totalDecksDisplay} (${percentage}%)
                                    </div>
                                </div>
                                
                                <!-- Rarity Switcher & Actions (4 buttons: - ? Ø +) -->
                                <div class="card-action-buttons" style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 2px; margin-top: 4px;">
                                    <button onclick="event.stopPropagation(); removeCardFromDeck('cityLeague', '${cardNameEscaped}')" style="background: #dc3545; color: white; border: none; border-radius: 3px; height: 16px; cursor: pointer; font-weight: bold; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; min-height: unset; min-width: unset;" title="Remove from deck">-</button>
                                    <button onclick="event.stopPropagation(); openRaritySwitcher('${cardNameEscaped}', '${cardNameEscaped} (${setCode} ${setNumber})')" style="background: #ffc107; color: #333; border: none; border-radius: 3px; height: 16px; cursor: pointer; font-size: 10px; font-weight: bold; text-align: center; padding: 0; display: flex; align-items: center; justify-content: center; min-height: unset; min-width: unset;" title="Switch rarity/print">★</button>
                                    <button onclick="event.stopPropagation(); openCardmarket('${cardmarketUrlEscaped}', '${cardNameEscaped}')" style="background: ${priceBackground}; color: white; height: 16px; border: none; border-radius: 3px; cursor: ${eurPrice ? 'pointer' : 'not-allowed'}; font-size: 6px; font-weight: bold; padding: 0 1px; display: flex; align-items: center; justify-content: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4); min-height: unset; min-width: unset;" title="${eurPrice ? 'Buy on Cardmarket: ' + eurPrice : 'Price not available'}">${priceDisplay}</button>
                                    <button onclick="event.stopPropagation(); addCardToDeck('cityLeague', '${cardNameEscaped}', '${setCode}', '${setNumber}')" style="background: #28a745; color: white; border: none; border-radius: 3px; height: 16px; cursor: pointer; font-weight: bold; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; min-height: unset; min-width: unset;" title="Add to deck">+</button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                }); // End of versionsToRender.forEach
            }); // End of sortedCards.forEach
            
            gridContainer.innerHTML = html;
            visualContainer.style.display = 'block';
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

                const matchesType = overviewCardTypeFilter === 'all' || cardType === overviewCardTypeFilter;
                
                // Show card only if it matches both filters
                if (matchesSearch && matchesType) {
                    card.style.display = '';
                    visibleCount++;
                } else {
                    card.style.display = 'none';
                }
            });
            
            // Update card count
            const countElement = document.getElementById('cityLeagueCardCount');
            if (countElement) {
                countElement.textContent = `${visibleCount} Karten`;
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
            
            // Reset all button styles
            Object.values(buttons).forEach(btn => {
                if (btn) {
                    btn.style.opacity = '0.6';
                    btn.style.fontWeight = 'normal';
                }
            });
            
            // Highlight active button
            if (buttons[type]) {
                buttons[type].style.opacity = '1';
                buttons[type].style.fontWeight = 'bold';
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
                    btn.style.opacity = '0.6';
                    btn.style.fontWeight = 'normal';
                }
            });
            
            // Highlight active button
            if (buttons[type]) {
                buttons[type].style.opacity = '1';
                buttons[type].style.fontWeight = 'bold';
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
                    btn.style.opacity = '0.6';
                    btn.style.fontWeight = 'normal';
                }
            });
            
            // Highlight active button
            if (buttons[type]) {
                buttons[type].style.opacity = '1';
                buttons[type].style.fontWeight = 'bold';
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
                alert('? Please select a deck first!');
                return;
            }
            
            // Check current view mode (grid is default)
            const isGridViewActive = gridViewContainer.style.display !== 'none';
            
            if (isGridViewActive) {
                // Switch to list/table view
                gridViewContainer.style.display = 'none';
                if (button) button.textContent = '??? Grid View';
            } else {
                // Switch back to grid view
                tableViewContainer.style.display = 'none';
                if (button) button.textContent = '?? List View';
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
                alert('⚠️ No cards to copy!\n\nPlease select an archetype first.');
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
                console.log('[copyDeckOverview] Copying user deck with', Object.keys(deck).length, 'card types');
                
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
                console.log('[copyDeckOverview] Copying archetype cards with max_count, mode:', currentRarityMode);
                
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
                } else if (category === 'Energy' || category === 'Special Energy') {
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
                output += `Pokémon: ${pokemonCount}\n`;
                output += pokemon.join('\n') + '\n\n';
            }
            
            if (trainer.length > 0) {
                output += `Trainer: ${trainerCount}\n`;
                output += trainer.join('\n') + '\n\n';
            }
            
            if (energy.length > 0) {
                output += `Energy: ${energyCount}\n`;
                output += energy.join('\n');
            }
            
            // Copy to clipboard
            navigator.clipboard.writeText(output).then(() => {
                alert('? Deck copied to clipboard!');
            }).catch(err => {
                console.error('Error copying:', err);
                alert('? Error copying to clipboard!');
            });
        }

        // Helper function to safely parse percentage_in_archetype (can be string with comma)
        const parsePct = (val) => parseFloat(String(val || "0").replace(',', '.'));

        function renderCityLeagueAnalysisTable(data) {
            console.log('renderCityLeagueAnalysisTable called with', data ? data.length : 0, 'rows');
            const tableContainer = document.getElementById('cityLeagueAnalysisTable');
            if (!tableContainer) {
                console.error('Table container not found!');
                return;
            }
            if (!data || data.length === 0) {
                console.warn('No data to render');
                tableContainer.innerHTML = '<p style="text-align: center; padding: 20px; color: #444; font-weight: 500;">Please select a deck...</p>';
                return;
            }

            // Group cards into FOUR tiers: Check Ace Spec FIRST, then by usage percentage
            const coreCards = [];
            const aceSpecCards = [];
            const techCards = [];
            const spicyCards = [];
            
            data.forEach(card => {
                // Check if card is Ace Spec (exclusive category)
                const isAceSpec = card.is_ace_spec === 'Yes' || 
                                  (card.type && card.type.toLowerCase().includes('ace spec')) || 
                                  (card.rarity && card.rarity.toLowerCase().includes('ace spec'));
                
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
                
                let html = `<div style="margin-bottom: 30px;">`;
                html += `<h3 style="margin: 20px 0 15px 0; color: #2c3e50; font-size: 1.3em; display: flex; align-items: center; gap: 10px;"><span>${tierEmoji}</span> ${tierTitle}</h3>`;
                html += '<table><thead><tr>';
                html += '<th class="col-image">Image</th>';
                html += '<th>Cards in Deck</th>';
                html += '<th>Card Name</th>';
                html += '<th>Set</th>';
                html += '<th>Number</th>';
                html += '<th>% in Archetype</th>';
                html += '<th>Ø Count (if used)</th>';
                html += '<th>Action</th>';
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
                    html += `<td class="col-image"><div style="position: relative; display: inline-block;">`;
                    html += `<img src="${imageUrl}" alt="${cardName}" loading="lazy" style="width: 60px; border-radius: 4px; cursor: zoom-in;" onerror="handleCardImageError(this, '${setCode}', '${setNumber}')" onclick="showSingleCard(this.src, '${cardName.replace(/'/g, "\\'")}')">`;
                    if (currentDeckCount > 0) {
                        html += `<div style="position: absolute; top: 2px; left: 2px; background: #28a745; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.7em; box-shadow: 0 2px 4px rgba(0,0,0,0.3); z-index: 2;">${currentDeckCount}</div>`;
                    }
                    html += `</div></td>`;
                    html += `<td><strong>${currentDeckCount}/${maxCount}</strong></td>`;
                    html += `<td><strong>${cardName}</strong></td>`;
                    html += `<td>${setCode}</td>`;
                    html += `<td>${setNumber}</td>`;
                    html += `<td><strong style="color: #667eea;">${percentage}%</strong></td>`;
                    html += `<td><strong style="color: #27ae60;">${avgCount}x</strong></td>`;
                    html += `<td><button class="btn btn-primary" onclick="addCardToDeck('cityLeague', '${cardName.replace(/'/g, "\\'")}')">+ Add</button></td>`;
                    html += '</tr>';
                });

                html += '</tbody></table></div>';
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
            console.log('Table rendered with tier grouping:', { core: coreCards.length, aceSpec: aceSpecCards.length, tech: techCards.length, spicy: spicyCards.length });
        }
        
        function applyCityLeagueFilter() {
            const filterSelect = document.getElementById('cityLeagueFilterSelect');
            const archetype = document.getElementById('cityLeagueDeckSelect')?.value;
            
            if (!filterSelect || !archetype || !window.currentCityLeagueDeckCards) return;
            
            const filterValue = filterSelect.value;
            const allCards = window.currentCityLeagueDeckCards;
            let filteredCards = [...allCards];
            
            if (filterValue !== 'all') {
                const threshold = parseInt(filterValue);
                filteredCards = filteredCards.filter(card => parseFloat(card.percentage_in_archetype || 0) >= threshold);
            }
            
            console.log(`Filter applied: ${filterValue}, showing ${filteredCards.length} of ${allCards.length} cards`);
            
            // Calculate total card counts (sum of max_count)
            const filteredTotal = filteredCards.reduce((sum, card) => sum + parseInt(card.max_count || 0), 0);
            const allTotal = allCards.reduce((sum, card) => sum + parseInt(card.max_count || 0), 0);
            
            // Update deck visual - check which view is active
            const tableViewContainer = document.getElementById('cityLeagueDeckTableView');
            const gridViewContainer = document.getElementById('cityLeagueDeckVisual');
            const isTableViewActive = tableViewContainer && tableViewContainer.style.display !== 'none';
            
            if (isTableViewActive) {
                renderCityLeagueDeckTable(filteredCards);
            } else {
                renderCityLeagueDeckGrid(filteredCards);
            }
            
            // Update card counts (unique filtered cards / total cards in deck)
            updateCityLeagueCardCounts(filteredCards.length, filteredTotal, allTotal);
        }
        
        function updateCityLeagueCardCounts(uniqueCount, filteredTotal, allTotal) {
            const countEl = document.getElementById('cityLeagueCardCount');
            const summaryEl = document.getElementById('cityLeagueCardCountSummary');
            
            if (countEl) {
                countEl.textContent = `${uniqueCount} Cards`;
            }
            if (summaryEl) {
                summaryEl.textContent = `/ ${filteredTotal} Total`;
            }
        }
        
        // Add filter change listener
        document.addEventListener('DOMContentLoaded', function() {
            const filterSelect = document.getElementById('cityLeagueFilterSelect');
            if (filterSelect) {
                filterSelect.onchange = applyCityLeagueFilter;
            }
        });

        function filterCityLeagueAnalysisCards() {
            const searchTerm = (document.getElementById('cityLeagueCardSearchInput')?.value || '').toLowerCase();
            const rows = document.querySelectorAll('#cityLeagueAnalysisTable table tbody tr');
            let visibleCount = 0;

            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                const visible = text.includes(searchTerm);
                row.style.display = visible ? '' : 'none';
                if (visible) visibleCount += 1;
            });

            const countEl = document.getElementById('cityLeagueCardCount');
            if (countEl) {
                countEl.textContent = `${visibleCount} Karten`;
            }
        }

        // Toggle functions for card tables
        function toggleCityLeagueCards() {
            const content = document.getElementById('cityLeagueCardsContent');
            const toggle = document.getElementById('cityLeagueCardsToggle');
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
        
        // Toggle function for deck overview (starts expanded)
        function toggleCityLeagueDeckOverview() {
            const content = document.getElementById('cityLeagueDeckOverviewContent');
            const toggle = document.getElementById('cityLeagueDeckOverviewToggle');
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
        
        // City League Deck Builder Functions - Load from localStorage
        function loadCityLeagueDeck() {
            try {
                const saved = localStorage.getItem('cityLeagueDeck');
                if (saved) {
                    const parsed = JSON.parse(saved);
                    window.cityLeagueDeck = parsed.deck || {};
                    window.cityLeagueDeckOrder = parsed.order || [];
                    window.currentCityLeagueArchetype = parsed.archetype || null;
                    console.log('[loadCityLeagueDeck] Loaded deck from localStorage:', Object.keys(window.cityLeagueDeck).length, 'cards');
                    return true;
                }
            } catch (e) {
                console.error('[loadCityLeagueDeck] Error loading deck:', e);
            }
            window.cityLeagueDeck = {};
            window.cityLeagueDeckOrder = [];
            window.currentCityLeagueArchetype = null;
            return false;
        }
        
        function saveCityLeagueDeck() {
            try {
                const deck = window.cityLeagueDeck || {};
                const deckSize = Object.keys(deck).length;
                
                // If deck is empty, remove from localStorage instead of saving empty object
                if (deckSize === 0) {
                    localStorage.removeItem('cityLeagueDeck');
                    console.log('[saveCityLeagueDeck] Deck is empty - removed from localStorage');
                    return;
                }
                
                const data = {
                    deck: deck,
                    order: window.cityLeagueDeckOrder || [],
                    archetype: window.currentCityLeagueArchetype || null,
                    timestamp: new Date().toISOString()
                };
                localStorage.setItem('cityLeagueDeck', JSON.stringify(data));
                console.log('[saveCityLeagueDeck] Saved deck to localStorage:', deckSize, 'cards');
            } catch (e) {
                console.error('[saveCityLeagueDeck] Error saving deck:', e);
            }
        }
        
        // Initialize deck - ALWAYS start fresh on page load
        // Clear any saved deck data to prevent old decks from showing up
        localStorage.removeItem('cityLeagueDeck');
        localStorage.removeItem('currentMetaDeck');
        localStorage.removeItem('pastMetaDeck');
        window.cityLeagueDeck = {};
        window.cityLeagueDeckOrder = [];
        window.currentCityLeagueArchetype = null;
        window.currentMetaDeck = {};
        window.currentMetaDeckOrder = [];
        window.currentCurrentMetaArchetype = null;
        window.pastMetaDeck = {};
        window.pastMetaDeckOrder = [];
        window.pastMetaCurrentArchetype = null;
        console.log('[Init] Starting with empty deck (localStorage cleared on page load)');
        // Check for a shared deck in the URL – runs after clearing so it wins
        setTimeout(function() { if (typeof importDeckFromUrl === 'function') importDeckFromUrl(); }, 100);
        
        // ---------------------------------------------------------------
        // BATCH ADD FUNCTION - For Auto-Generate Performance
        // ---------------------------------------------------------------
        // This version adds cards WITHOUT triggering display updates
        // Use this for bulk operations, then call updateDeckDisplay() once at the end
        
        function addCardToDeckBatch(source, cardName, setCode, setNumber) {
            if (source !== 'cityLeague' && source !== 'currentMeta' && source !== 'pastMeta') return false;
            
            let deck, deckOrderKey;
            if (source === 'cityLeague') {
                deck = window.cityLeagueDeck;
                deckOrderKey = 'cityLeagueDeckOrder';
            } else if (source === 'currentMeta') {
                deck = window.currentMetaDeck;
                deckOrderKey = 'currentMetaDeckOrder';
            } else if (source === 'pastMeta') {
                deck = window.pastMetaDeck;
                deckOrderKey = 'pastMetaDeckOrder';
            }
            
            // Initialize deck order array if not exists
            if (!window[deckOrderKey]) {
                window[deckOrderKey] = [];
            }

            // When auto-generating, save version preference
            if (setCode && setNumber) {
                setRarityPreference(cardName, {
                    mode: 'specific',
                    set: setCode,
                    number: setNumber
                });
            }
            
            let deckKey = getCanonicalDeckKey(cardName, setCode, setNumber);
            
            // Check if there's already an entry for this card
            let existingKey = null;
            if (deck[deckKey]) {
                existingKey = deckKey;
            } else if (deck[cardName]) {
                existingKey = cardName;
            } else {
                for (const key in deck) {
                    if (key === cardName || key.startsWith(cardName + ' (')) {
                        existingKey = key;
                        break;
                    }
                }
            }
            
            // Migrate key if needed
            if (existingKey && existingKey !== deckKey && setCode && setNumber) {
                deck[deckKey] = deck[existingKey];
                delete deck[existingKey];
                if (window[deckOrderKey]) {
                    const oldKeyIndex = window[deckOrderKey].indexOf(existingKey);
                    if (oldKeyIndex !== -1) {
                        window[deckOrderKey][oldKeyIndex] = deckKey;
                    }
                }
            } else if (existingKey) {
                deckKey = existingKey;
            }
            
            if (!deck[deckKey]) {
                deck[deckKey] = 0;
            }
            
            const currentTotal = Object.values(deck).reduce((sum, count) => sum + count, 0);
            if (currentTotal >= 70) {
                return false; // Silent fail for batch operations
            }
            
            // Check card limits
            let cardsKey, cards;
            if (source === 'cityLeague') {
                cardsKey = 'currentCityLeagueDeckCards';
                cards = window[cardsKey] || [];
            } else if (source === 'currentMeta') {
                cardsKey = 'currentCurrentMetaDeckCards';
                cards = window[cardsKey] || [];
            } else if (source === 'pastMeta') {
                cards = pastMetaFilteredCards || [];
            }
            let cardData = cards.find(c => (c.card_name || c.full_card_name) === cardName);
            if (!cardData && setCode && setNumber) {
                cardData = getIndexedCardBySetNumber(setCode, setNumber) || (window.cardsBySetNumberMap || {})[`${setCode}-${setNumber}`] || null;
            }
            const isBaseEnergy = isBasicEnergyCardEntry(cardData || { card_name: cardName, name: cardName });
            const isAceSpecCard = isAceSpec(cardName);
            
            // Check limits (silent fail for batch)
            if (!isBaseEnergy && !isAceSpecCard && deck[deckKey] >= 4) {
                return false;
            }
            if (isAceSpecCard && deck[deckKey] >= 1) {
                return false;
            }
            
            deck[deckKey]++;
            
            // Track insertion order
            if (!window[deckOrderKey].includes(deckKey)) {
                window[deckOrderKey].push(deckKey);
            }
            
            return true; // Success
        }
        
        // ---------------------------------------------------------------
        // SINGLE ADD FUNCTION - For Manual Card Addition
        // ---------------------------------------------------------------
        
        function addCardToDeck(source, cardName, setCode, setNumber) {
            if (source !== 'cityLeague' && source !== 'currentMeta' && source !== 'pastMeta') return;
            
            let deck, deckOrderKey;
            if (source === 'cityLeague') {
                deck = window.cityLeagueDeck;
                deckOrderKey = 'cityLeagueDeckOrder';
            } else if (source === 'currentMeta') {
                deck = window.currentMetaDeck;
                deckOrderKey = 'currentMetaDeckOrder';
            } else if (source === 'pastMeta') {
                deck = window.pastMetaDeck;
                deckOrderKey = 'pastMetaDeckOrder';
            }
            
            // Initialize deck order array if not exists
            if (!window[deckOrderKey]) {
                window[deckOrderKey] = [];
            }

            // CRITICAL FIX: When user manually adds a card with specific version, save it as preference
            // This ensures the exact version shows up in the deck (not auto-swapped to low rarity)
            if (setCode && setNumber) {
                setRarityPreference(cardName, {
                    mode: 'specific',
                    set: setCode,
                    number: setNumber
                });
                console.log(`[addCardToDeck] Saved specific version preference for ${cardName}: ${setCode} ${setNumber}`);
            }
            
            // CRITICAL FIX: Check if card already exists with a different key format
            // If card exists as "CardName" but we're adding "CardName (SET NUM)", update the existing key
            let deckKey = getCanonicalDeckKey(cardName, setCode, setNumber);
            
            // Check if there's already an entry for this card (with or without version info)
            let existingKey = null;
            if (deck[deckKey]) {
                existingKey = deckKey; // Exact match
            } else if (deck[cardName]) {
                existingKey = cardName; // Card exists without version
            } else {
                // Check if any key starts with this card name
                for (const key in deck) {
                    if (key === cardName || key.startsWith(cardName + ' (')) {
                        existingKey = key;
                        break;
                    }
                }
            }
            
            // If we found an existing key and it's different from our new key, migrate it
            if (existingKey && existingKey !== deckKey && setCode && setNumber) {
                console.log(`Migrating deck entry from "${existingKey}" to "${deckKey}"`);
                deck[deckKey] = deck[existingKey];
                delete deck[existingKey];
                
                // Update order array when migrating key
                if (window[deckOrderKey]) {
                    const oldKeyIndex = window[deckOrderKey].indexOf(existingKey);
                    if (oldKeyIndex !== -1) {
                        window[deckOrderKey][oldKeyIndex] = deckKey;
                        console.log(`Updated deck order during migration: ${existingKey} -> ${deckKey} at position ${oldKeyIndex}`);
                    }
                }
            } else if (existingKey) {
                deckKey = existingKey; // Use the existing key
            }
            
            if (!deck[deckKey]) {
                deck[deckKey] = 0;
            }
            
            const currentTotal = Object.values(deck).reduce((sum, count) => sum + count, 0);
            if (currentTotal >= 70) {
                alert('Deck has reached maximum (70 cards)!');
                return;
            }
            
            // Check if card is a base energy or Ace Spec (no 4-copy limit for these)
            let cardsKey, cards;
            if (source === 'cityLeague') {
                cardsKey = 'currentCityLeagueDeckCards';
                cards = window[cardsKey] || [];
            } else if (source === 'currentMeta') {
                cardsKey = 'currentCurrentMetaDeckCards';
                cards = window[cardsKey] || [];
            } else if (source === 'pastMeta') {
                cards = pastMetaFilteredCards || [];
            }
            let cardData = cards.find(c => (c.card_name || c.full_card_name) === cardName);
            if (!cardData && setCode && setNumber) {
                cardData = getIndexedCardBySetNumber(setCode, setNumber) || (window.cardsBySetNumberMap || {})[`${setCode}-${setNumber}`] || null;
            }
            const isBaseEnergy = isBasicEnergyCardEntry(cardData || { card_name: cardName, name: cardName });
            const isAceSpecCard = isAceSpec(cardName);
            
            // Check if card already has 4 copies (only applies to non-energy, non-ace-spec cards)
            if (!isBaseEnergy && !isAceSpecCard && deck[deckKey] >= 4) {
                alert('Maximum 4 copies per card!');
                return;
            }
            
            // Ace Spec cards can only have 1 copy in deck
            if (isAceSpecCard && deck[deckKey] >= 1) {
                alert('Ace Spec cards may only be in deck once!');
                return;
            }
            
            deck[deckKey]++;
            
            // Track insertion order
            if (!window[deckOrderKey].includes(deckKey)) {
                window[deckOrderKey].push(deckKey);
            }
            
            console.log(`Added card to deck: ${deckKey} -> ${deck[deckKey]}`);
            
            // Save to localStorage
            if (source === 'cityLeague') {
                saveCityLeagueDeck();
            } else if (source === 'currentMeta') {
                saveCurrentMetaDeck();
            } else if (source === 'pastMeta') {
                savePastMetaDeck();
            }
            
            updateDeckDisplay(source);
        }
        
        function removeCardFromDeck(source, deckKey) {
            if (source !== 'cityLeague' && source !== 'currentMeta' && source !== 'pastMeta') return;
            
            let deck, deckOrderKey;
            if (source === 'cityLeague') {
                deck = window.cityLeagueDeck;
                deckOrderKey = 'cityLeagueDeckOrder';
            } else if (source === 'currentMeta') {
                deck = window.currentMetaDeck;
                deckOrderKey = 'currentMetaDeckOrder';
            } else if (source === 'pastMeta') {
                deck = window.pastMetaDeck;
                deckOrderKey = 'pastMetaDeckOrder';
            }
            
            // CRITICAL FIX: Find the actual key in deck
            // If deckKey is just "CardName" but deck has "CardName (SET NUM)", find it
            let actualKey = deckKey;
            if (!deck[deckKey] || deck[deckKey] <= 0) {
                // Search for alternative keys (with set info)
                for (const key in deck) {
                    if (key === deckKey || key.startsWith(deckKey + ' (')) {
                        if (deck[key] > 0) {
                            actualKey = key;
                            break;
                        }
                    }
                }
            }
            
            if (deck[actualKey] && deck[actualKey] > 0) {
                deck[actualKey]--;
                if (deck[actualKey] === 0) {
                    delete deck[actualKey];
                    // Remove from order tracking
                    if (window[deckOrderKey]) {
                        const idx = window[deckOrderKey].indexOf(actualKey);
                        if (idx !== -1) {
                            window[deckOrderKey].splice(idx, 1);
                        }
                    }
                }
                
                // Save to localStorage
                if (source === 'cityLeague') {
                    saveCityLeagueDeck();
                } else if (source === 'currentMeta') {
                    saveCurrentMetaDeck();
                } else if (source === 'pastMeta') {
                    savePastMetaDeck();
                }
                
                updateDeckDisplay(source);
            }
        }
        
        function clearDeck(source) {
            if (source !== 'cityLeague' && source !== 'currentMeta' && source !== 'pastMeta') return;
            
            if (confirm('Do you really want to remove all cards from the deck?')) {
                if (source === 'cityLeague') {
                    window.cityLeagueDeck = {};
                    window.cityLeagueDeckOrder = [];
                    window.currentCityLeagueArchetype = null;
                    // CRITICAL: Remove from localStorage completely
                    localStorage.removeItem('cityLeagueDeck');
                    console.log('[clearDeck] City League deck cleared and removed from localStorage');
                } else if (source === 'currentMeta') {
                    window.currentMetaDeck = {};
                    window.currentMetaDeckOrder = [];
                    window.currentCurrentMetaArchetype = null;
                    // CRITICAL: Remove from localStorage completely
                    localStorage.removeItem('currentMetaDeck');
                    console.log('[clearDeck] Current Meta deck cleared and removed from localStorage');
                } else if (source === 'pastMeta') {
                    window.pastMetaDeck = {};
                    window.pastMetaDeckOrder = [];
                    window.pastMetaCurrentArchetype = null;
                    // CRITICAL: Remove from localStorage completely
                    localStorage.removeItem('pastMetaDeck');
                    console.log('[clearDeck] Past Meta deck cleared and removed from localStorage');
                }
                
                // CRITICAL: Clear all rarity preferences when clearing deck
                rarityPreferences = {};
                saveRarityPreferences();
                
                updateDeckDisplay(source);
                
                // Force re-render to remove all badges
                const tabId = source === 'cityLeague' ? 'city-league-tab' : 'current-meta-tab';
                if (document.getElementById(tabId) && document.getElementById(tabId).classList.contains('active')) {
                    // Re-render the current view to update badges
                    if (source === 'cityLeague') {
                        renderCityLeagueDeckGrid(cityLeagueCardsFiltered, cityLeagueOverviewRarityMode);
                    } else {
                        renderCurrentMetaDeckGrid(currentMetaCardsFiltered, currentMetaOverviewRarityMode);
                    }
                }
            }
        }
        
        function updateDeckDisplay(source) {
            if (source !== 'cityLeague' && source !== 'currentMeta' && source !== 'pastMeta') return;

            const normalized = normalizeDeckEntries(source);
            if (normalized) {
                if (source === 'cityLeague') saveCityLeagueDeck();
                else if (source === 'currentMeta') saveCurrentMetaDeck();
                else if (source === 'pastMeta') savePastMetaDeck();
            }
            
            let deck;
            if (source === 'cityLeague') {
                deck = window.cityLeagueDeck;
            } else if (source === 'currentMeta') {
                deck = window.currentMetaDeck;
            } else if (source === 'pastMeta') {
                deck = window.pastMetaDeck;
            }
            const total = Object.values(deck).reduce((sum, count) => sum + count, 0);
            const unique = Object.keys(deck).filter(k => deck[k] > 0).length;
            
            let countElId, uniqueElId;
            if (source === 'cityLeague') {
                countElId = 'cityLeagueDeckCount';
                uniqueElId = 'cityLeagueDeckCountUnique';
            } else if (source === 'currentMeta') {
                countElId = 'currentMetaDeckCount';
                uniqueElId = 'currentMetaDeckCountUnique';
            } else if (source === 'pastMeta') {
                countElId = 'pastMetaDeckCount';
                uniqueElId = 'pastMetaDeckCountUnique';
            }
            
            const countEl = document.getElementById(countElId);
            const uniqueEl = document.getElementById(uniqueElId);
            
            if (countEl) {
                countEl.textContent = total;
                // Highlight in red if over 60 cards
                if (total > 60) {
                    countEl.style.color = '#dc3545';
                    countEl.parentElement.style.color = '#dc3545';
                } else {
                    countEl.style.color = '';
                    countEl.parentElement.style.color = '';
                }
            }
            if (uniqueEl) uniqueEl.textContent = `(${unique} Unique)`;

            // --- Price calculation ---
            let priceElId;
            if (source === 'cityLeague')  priceElId = 'cityLeagueDeckPrice';
            else if (source === 'currentMeta') priceElId = 'currentMetaDeckPrice';
            else if (source === 'pastMeta')    priceElId = 'pastMetaDeckPrice';
            const priceEl = document.getElementById(priceElId);
            if (priceEl) {
                let totalPrice = 0;
                for (const [deckKey, count] of Object.entries(deck)) {
                    if (!count || count <= 0) continue;
                    let cardData = null;
                    const setMatch = deckKey.match(/^(.+?)\s+\(([A-Z0-9-]+)\s+([A-Z0-9-]+)\)$/);
                    if (setMatch) {
                        const key = `${setMatch[2]}-${setMatch[3]}`;
                        if (window.cardsBySetNumberMap) cardData = window.cardsBySetNumberMap[key];
                        if (!cardData)
                            cardData = (window.cardsBySetNumberMap || {})[`${setMatch[2]}-${setMatch[3]}`] || null;
                    } else {
                        cardData = (window.cardIndexMap && window.cardIndexMap.get(deckKey)) || null;
                    }
                    if (cardData && cardData.eur_price && cardData.eur_price !== '' && cardData.eur_price !== 'N/A') {
                        const p = parseFloat(String(cardData.eur_price).replace(',', '.'));
                        if (!isNaN(p)) totalPrice += p * count;
                    }
                }
                priceEl.textContent = totalPrice.toFixed(2) + ' \u20ac';
            }

            // Add visual warning to deck container if over 60 cards
            let deckVisualId;
            if (source === 'cityLeague') {
                deckVisualId = 'cityLeagueMyDeckVisual';
            } else if (source === 'currentMeta') {
                deckVisualId = 'currentMetaMyDeckVisual';
            } else if (source === 'pastMeta') {
                deckVisualId = 'pastMetaMyDeckVisual';
            }
            const deckVisualEl = document.getElementById(deckVisualId);
            if (deckVisualEl) {
                if (total > 60) {
                    deckVisualEl.style.border = '3px solid #dc3545';
                    deckVisualEl.style.background = '#fff5f5';
                } else {
                    deckVisualEl.style.border = '';
                    deckVisualEl.style.background = '#f8f9fa';
                }
            }
            
            // Update the My Deck grid
            renderMyDeckGrid(source);
            
            // CRITICAL: Also refresh the Overview Grid to show updated badges
            // Use the filter functions to preserve active filters (e.g., >90% cards)
            if (source === 'cityLeague') {
                applyCityLeagueFilter();
            } else if (source === 'currentMeta') {
                applyCurrentMetaFilter();
            } else if (source === 'pastMeta') {
                renderPastMetaCards();
            }
            // Update opening hand probability statistics
            updateOpeningHandStats(source);
        }
        
        function renderMyDeckGrid(source) {
            if (source !== 'cityLeague' && source !== 'currentMeta' && source !== 'pastMeta') return;
            
            let deck, deckOrderKey, currentCardsKey, gridContainerId;
            if (source === 'cityLeague') {
                deck = window.cityLeagueDeck;
                deckOrderKey = 'cityLeagueDeckOrder';
                currentCardsKey = 'currentCityLeagueDeckCards';
                gridContainerId = 'cityLeagueMyDeckGrid';
            } else if (source === 'currentMeta') {
                deck = window.currentMetaDeck;
                deckOrderKey = 'currentMetaDeckOrder';
                currentCardsKey = 'currentCurrentMetaDeckCards';
                gridContainerId = 'currentMetaMyDeckGrid';
            } else if (source === 'pastMeta') {
                deck = window.pastMetaDeck;
                deckOrderKey = 'pastMetaDeckOrder';
                currentCardsKey = null; // Past Meta uses different data source
                gridContainerId = 'pastMetaMyDeckGrid';
            }
            
            const allCards = currentCardsKey ? (window[currentCardsKey] || []) : (pastMetaFilteredCards || []);
            const allCardsFromDb = window.allCardsDatabase || [];
            
            // Build card data maps: by name and by name+set+number
            const cardDataByName = {};
            const cardDataByKey = {};
            const cardStatsByNormalizedName = {};
            const cardStatsBySetNumber = {};
            
            // Initialize deck order array if not exists
            if (!window[deckOrderKey]) {
                window[deckOrderKey] = Object.keys(deck).filter(k => deck[k] > 0);
            }
            
            // First, add cards from current deck cards
            allCards.forEach(card => {
                // Handle both 'card_name' (cityLeague/currentMeta) and 'full_card_name' (pastMeta)
                const cardName = card.card_name || card.full_card_name;
                if (cardName) {
                    cardDataByName[cardName] = card;

                    const normalizedName = normalizeCardName(cardName);
                    if (normalizedName) {
                        const prev = cardStatsByNormalizedName[normalizedName];
                        const prevShare = parseFloat(String(prev?.percentage_in_archetype || prev?.share || 0).replace(',', '.')) || 0;
                        const currentShare = parseFloat(String(card.percentage_in_archetype || card.share || 0).replace(',', '.')) || 0;
                        if (!prev || currentShare >= prevShare) {
                            cardStatsByNormalizedName[normalizedName] = card;
                        }
                    }

                    const setCode = String(card.set_code || card.set || '').toUpperCase().trim();
                    const setNumberRaw = String(card.set_number || card.number || '').trim();
                    if (setCode && setNumberRaw) {
                        const normalizedNumber = setNumberRaw.replace(/^0+/, '') || '0';
                        cardStatsBySetNumber[`${setCode}-${setNumberRaw}`] = card;
                        cardStatsBySetNumber[`${setCode}-${normalizedNumber}`] = card;
                        cardStatsBySetNumber[`${setCode}-${normalizedNumber.padStart(3, '0')}`] = card;
                    }
                }
            });
            
            // Then add cards from allCardsDatabase with both keys
            allCardsFromDb.forEach(card => {
                // CRITICAL FIX: Use actual image_url from database, fallback to buildCardImageUrl only if missing or empty
                const imageUrl = getUnifiedCardImage(card.set, card.number) || card.image_url || '';
                const cardData = {
                    card_name: card.name,
                    image_url: imageUrl,
                    percentage_in_archetype: 0,
                    type: card.type || 'Unknown',
                    card_type: card.type || 'Unknown',
                    set_code: card.set,
                    set_number: card.number,
                    rarity: card.rarity
                };
                
                // Key by name only
                if (!cardDataByName[card.name]) {
                    cardDataByName[card.name] = cardData;
                }
                
                // Key by "name (SET NUM)" for exact version match
                const versionKey = `${card.name} (${card.set} ${card.number})`;
                cardDataByKey[versionKey] = cardData;
            });

            // Build stats map before rendering grid cards so overlay has reliable share/avg values.
            const normalizeOverlayName = (name) => normalizeCardName(
                String(name || '')
                    .replace(/\s*\([A-Z0-9]+\s+[A-Z0-9]+\)\s*$/i, '')
                    .replace(/\s+[A-Z0-9]{2,4}\s+[A-Z0-9]+\s*$/i, '')
            ).replace(/[^a-z0-9]/g, '');
            const calculateCardStatsMap = (cardsForStats) => {
                const statsMap = new Map();

                cardsForStats.forEach(row => {
                    const rowName = row.card_name || row.full_card_name || row.name || '';
                    const cardName = rowName;
                    const key = normalizeOverlayName(rowName);
                    if (!key) return;

                    const shareRaw = row.percentage_in_archetype ?? row.share ?? row.share_percent ?? 0;
                    const parsedShare = parseFloat(String(shareRaw).replace(',', '.'));

                    const totalDecksRaw = parseFloat(String(row.total_decks_in_archetype || row.decklist_count || row.total_decks || 0).replace(',', '.'));
                    const totalDecks = Number.isFinite(totalDecksRaw) && totalDecksRaw > 0 ? Math.max(1, Math.floor(totalDecksRaw)) : 1;
                    const totalCountRaw = parseFloat(String(row.total_count || row.card_count || 0).replace(',', '.'));
                    const deckCountRaw = parseFloat(String(row.deck_count || row.deck_inclusion_count || 0).replace(',', '.'));
                    const deckInclusionRaw = parseFloat(String(row.deck_count || row.deck_inclusion_count || 0).replace(',', '.'));
                    const avgRaw = parseFloat(String(row.avg_count || row.average_count || row.average_count_overall || 0).replace(',', '.'));

                    let share = Number.isFinite(parsedShare) ? parsedShare : 0;
                    if (share === 0 && totalDecks > 0 && Number.isFinite(deckCountRaw) && deckCountRaw > 0) {
                        share = (deckCountRaw / totalDecks) * 100;
                    }
                    if (share > 100) {
                        console.warn('Unplausibler Share fuer Karte:', cardName);
                        share = 100;
                    }
                    share = Math.max(0, share);

                    let avgCount = Number.isFinite(avgRaw) && avgRaw > 0 ? avgRaw : 0;
                        if (avgCount === 0 && Number.isFinite(totalCountRaw) && totalCountRaw > 0) {
                            // Prefer when-used average (totalCount / deckInclusion) over overall average
                            if (Number.isFinite(deckInclusionRaw) && deckInclusionRaw > 0) {
                                avgCount = totalCountRaw / deckInclusionRaw;
                            } else if (totalDecks > 0) {
                                avgCount = totalCountRaw / totalDecks;
                            }
                        }

                    const prev = statsMap.get(key) || { share: 0, avgCount: 0 };
                    statsMap.set(key, {
                        share: Math.max(prev.share, share),
                        avgCount: Math.max(prev.avgCount, avgCount)
                    });
                });

                return statsMap;
            };

            const calculatedCardStats = calculateCardStatsMap(allCards);
            
            // Convert deck to array with card data
            const deckCards = [];
            for (const [deckKey, count] of Object.entries(deck)) {
                if (count <= 0) continue;
                
                // Try exact match first (with SET NUM), then fallback to name only
                let cardData = cardDataByKey[deckKey] || cardDataByName[deckKey];
                
                // If still not found, extract card name from "CardName (SET NUM)" format
                if (!cardData) {
                    const baseNameMatch = deckKey.match(/^(.+?)\s*\(/);
                    if (baseNameMatch) {
                        const baseName = baseNameMatch[1];
                        const setMatch = deckKey.match(/\(([A-Z0-9]+)\s+([A-Z0-9]+)\)$/);
                        
                        if (setMatch) {
                            const setCode = setMatch[1];
                            const setNumber = setMatch[2];
                            
                            // Fast lookup using index instead of find()
                            const key = `${setCode}-${setNumber}`;
                            const exactCard = cardsBySetNumberMap ? cardsBySetNumberMap[key] : null;
                            
                            if (exactCard) {
                                const imageUrl = getUnifiedCardImage(exactCard.set, exactCard.number) || exactCard.image_url || '';
                                cardData = {
                                    card_name: exactCard.name,
                                    image_url: imageUrl,
                                    percentage_in_archetype: 0,
                                    type: exactCard.type || 'Unknown',
                                    card_type: exactCard.type || 'Unknown',
                                    set_code: exactCard.set,
                                    set_number: exactCard.number,
                                    rarity: exactCard.rarity
                                };
                            } else {
                                const baseCardData = cardDataByName[baseName];
                                if (baseCardData) {
                                    cardData = {
                                        ...baseCardData,
                                        set_code: setCode,
                                        set_number: setNumber
                                    };
                                }
                            }
                        } else {
                            cardData = cardDataByName[baseName];
                        }
                    }
                }
                
                if (!cardData) continue;

                const baseNameMatch = deckKey.match(/^(.+?)\s*\(/);
                const baseName = baseNameMatch ? baseNameMatch[1] : (cardData.card_name || deckKey);
                const normalizedBaseName = normalizeCardName(baseName);

                const setMatch = deckKey.match(/\(([A-Z0-9]+)\s+([A-Z0-9]+)\)$/);
                const originalSet = setMatch ? setMatch[1] : cardData.set_code;
                const originalNumber = setMatch ? setMatch[2] : cardData.set_number;

                const cardSetForStats = String(cardData.set_code || cardData.set || originalSet || '').toUpperCase().trim();
                const cardNumberForStatsRaw = String(cardData.set_number || cardData.number || originalNumber || '').trim();
                const cardNumberForStatsNormalized = cardNumberForStatsRaw.replace(/^0+/, '') || '0';
                const setNumberKeyExact = cardSetForStats && cardNumberForStatsRaw ? `${cardSetForStats}-${cardNumberForStatsRaw}` : '';
                const setNumberKeyNormalized = cardSetForStats && cardNumberForStatsNormalized ? `${cardSetForStats}-${cardNumberForStatsNormalized}` : '';

                const archetypeData =
                    (setNumberKeyExact && cardStatsBySetNumber[setNumberKeyExact]) ||
                    (setNumberKeyNormalized && cardStatsBySetNumber[setNumberKeyNormalized]) ||
                    cardDataByName[baseName] ||
                    cardStatsByNormalizedName[normalizedBaseName];
                if (archetypeData) {
                    cardData = {
                        ...cardData,
                        percentage_in_archetype: archetypeData.percentage_in_archetype || cardData.percentage_in_archetype,
                        total_count: archetypeData.total_count || archetypeData.card_count || cardData.total_count,
                        card_count: archetypeData.card_count || cardData.card_count,
                        deck_count: archetypeData.deck_count || archetypeData.deck_inclusion_count || cardData.deck_count,
                        deck_inclusion_count: archetypeData.deck_inclusion_count || archetypeData.deck_count || cardData.deck_inclusion_count,
                        total_decks_in_archetype: archetypeData.total_decks_in_archetype || archetypeData.decklist_count || archetypeData.total_decks || cardData.total_decks_in_archetype,
                        average_count: archetypeData.average_count || archetypeData.avg_count || cardData.average_count,
                        avg_count: archetypeData.avg_count || archetypeData.average_count || cardData.avg_count,
                        average_count_overall: archetypeData.average_count_overall || archetypeData.avg_count_overall || archetypeData.card_count || cardData.average_count_overall,
                        card_type: archetypeData.card_type || archetypeData.type || cardData.card_type,
                        type: archetypeData.type || archetypeData.card_type || cardData.type
                    };
                }

                const globalPref = getGlobalRarityPreference();
                const pref = getRarityPreference(baseName);
                
                // Handle image URL based on rarity preference (simplified)
                if (pref && pref.mode === 'specific' && pref.set && pref.number) {
                    const key = `${pref.set}-${pref.number}`;
                    const specificCard = cardsBySetNumberMap ? cardsBySetNumberMap[key] : null;
                    if (specificCard && specificCard.image_url && specificCard.name === baseName) {
                        cardData.image_url = specificCard.image_url;
                        cardData.set_code = specificCard.set;
                        cardData.set_number = specificCard.number;
                        cardData.rarity = specificCard.rarity;
                    }
                }
                else if (globalPref === 'max' || globalPref === 'min') {
                    if (originalSet && originalNumber) {
                        const preferredVersion = getPreferredVersionForCard(baseName, originalSet, originalNumber);
                        if (preferredVersion) {
                            const key = `${preferredVersion.set}-${preferredVersion.number}`;
                            const preferredCard = cardsBySetNumberMap ? cardsBySetNumberMap[key] : null;
                            if (preferredCard && preferredCard.image_url && preferredCard.name === baseName) {
                                cardData.image_url = preferredCard.image_url;
                                cardData.set_code = preferredCard.set;
                                cardData.set_number = preferredCard.number;
                                cardData.rarity = preferredCard.rarity;
                            }
                        }
                    }
                }
                
                // Ensure image_url is never empty before adding to deck
                if (!cardData.image_url || cardData.image_url.trim() === '') {
                    const setCode = originalSet || cardData.set_code;
                    const setNumber = originalNumber || cardData.set_number;
                    if (setCode && setNumber) {
                        cardData.image_url = getUnifiedCardImage(setCode, setNumber);
                    }
                }
                
                deckCards.push({
                    ...cardData, 
                    deck_count_in_selected: count, 
                    deck_key: deckKey,
                    original_set_code: originalSet,
                    original_set_number: originalNumber
                });
            }
            
            const sortedDeckCards = sortCardsByType(deckCards);
            
            // Build grid from deck
            let html = '';
            sortedDeckCards.forEach(card => {
                const deckKeyNameMatch = typeof card.deck_key === 'string' ? card.deck_key.match(/^(.+?)\s*\(/) : null;
                const fallbackDeckName = deckKeyNameMatch ? deckKeyNameMatch[1] : '';
                const safeCardName = (typeof card.card_name === 'string' && card.card_name.trim())
                    ? card.card_name
                    : (fallbackDeckName || 'Unknown Card');
                const setCode = card.set_code || '';
                const setNumber = card.set_number || '';
                
                // Safe image fallback chain for inconsistent M3/M4 card objects
                const cardImg = card.image || card.imageUrl || (card.images && card.images.small) || card.image_url || '';
                const safeImg = typeof cardImg === 'string' ? cardImg.replace('original', 'small') : '';

                let imageUrl = '';
                if (setCode && setNumber && cardsBySetNumberMap) {
                    imageUrl = getUnifiedCardImage(setCode, setNumber);
                    if (!imageUrl && safeImg) {
                        imageUrl = safeImg;
                    }
                } else if (safeImg) {
                    imageUrl = safeImg;
                } else {
                    imageUrl = getUnifiedCardImage(setCode, setNumber);
                }

                if (typeof imageUrl !== 'string' || imageUrl.trim() === '') {
                    imageUrl = buildCardImageUrl(setCode, setNumber, card.rarity || 'C');
                }

                imageUrl = getBestCardImage({
                    ...card,
                    card_name: safeCardName,
                    image_url: imageUrl,
                    set_code: setCode,
                    set_number: setNumber
                });
                
                const percentage = parseFloat(card.percentage_in_archetype || 0).toFixed(1);
                const count = card.deck_count_in_selected || 1;
                const cardNameEscaped = safeCardName.replace(/'/g, "\\'");
                const deckKeyEscaped = (card.deck_key || safeCardName).replace(/'/g, "\\'");
                
                // Fast price lookup using index
                let eurPrice = '';
                let cardmarketUrl = '';
                if (setCode && setNumber && cardsBySetNumberMap) {
                    const key = `${setCode}-${setNumber}`;
                    const priceCard = cardsBySetNumberMap[key];
                    if (priceCard) {
                        eurPrice = priceCard.eur_price || '';
                        cardmarketUrl = priceCard.cardmarket_url || '';
                    }
                }
                const priceDisplay = eurPrice || '0,00€';
                const priceClass = eurPrice ? 'btn-cardmarket' : 'btn-cardmarket no-price';
                const priceBackground = eurPrice ? 'linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)' : 'linear-gradient(135deg, #777 0%, #999 100%)';
                const cardmarketUrlEscaped = (cardmarketUrl || '').replace(/'/g, "\\'");
                
                const baseName = safeCardName;
                const baseCardData =
                    (setCode && setNumber && (cardStatsBySetNumber[`${String(setCode).toUpperCase()}-${String(setNumber).trim()}`] || cardStatsBySetNumber[`${String(setCode).toUpperCase()}-${(String(setNumber).trim().replace(/^0+/, '') || '0')}`])) ||
                    cardDataByName[baseName] ||
                    cardStatsByNormalizedName[normalizeCardName(baseName)] ||
                    card;
                const totalCount = parseFloat(String(baseCardData.total_count || 0).replace(',', '.')) || 0;
                const cardCountOverallRaw = parseFloat(String(baseCardData.card_count || 0).replace(',', '.')) || 0;
                const decksWithCard = parseFloat(String(baseCardData.deck_count || baseCardData.deck_inclusion_count || baseCardData.decks_with_card || 0).replace(',', '.')) || 0;
                const totalDecksInArchetype = parseFloat(String(baseCardData.total_decks_in_archetype || baseCardData.decklist_count || baseCardData.total_decks || 0).replace(',', '.')) || 0;
                const shareFromDataRaw = parseFloat(String(
                    baseCardData.percentage_in_archetype ||
                    baseCardData.share ||
                    baseCardData.share_percent ||
                    baseCardData.meta_share ||
                    baseCardData.metaShare ||
                    percentage ||
                    0
                ).replace(',', '.'));
                const computedShareRaw = totalDecksInArchetype > 0 && decksWithCard > 0 ? (decksWithCard / totalDecksInArchetype) * 100 : 0;
                const fallbackShareValue = Number.isFinite(shareFromDataRaw) && shareFromDataRaw > 0 ? shareFromDataRaw : computedShareRaw;

                const avgWhenUsedRaw = parseFloat(String(baseCardData.average_count || baseCardData.avg_count || baseCardData.avgCountWhenUsed || 0).replace(',', '.'));
                const avgOverallRaw = parseFloat(String(baseCardData.average_count_overall || baseCardData.avg_count_overall || baseCardData.avgCount || baseCardData.card_count || 0).replace(',', '.'));

                // Only derive averages from totals when totals are truly available.
                // Some datasets provide card_count as an average already (not as total_count).
                const computedAvgWhenUsedRaw = (decksWithCard > 0 && totalCount > 0)
                    ? (totalCount / decksWithCard)
                    : (avgOverallRaw > 0 && totalDecksInArchetype > 0 && decksWithCard > 0
                        ? (avgOverallRaw * totalDecksInArchetype) / decksWithCard
                        : 0);
                const computedAvgOverallRaw = (totalDecksInArchetype > 0 && totalCount > 0)
                    ? (totalCount / totalDecksInArchetype)
                    : cardCountOverallRaw;
                const fallbackAvgValue = Number.isFinite(avgWhenUsedRaw) && avgWhenUsedRaw > 0
                    ? avgWhenUsedRaw
                    : (Number.isFinite(computedAvgWhenUsedRaw) && computedAvgWhenUsedRaw > 0
                        ? computedAvgWhenUsedRaw
                        : (Number.isFinite(avgOverallRaw) && avgOverallRaw > 0 ? avgOverallRaw : computedAvgOverallRaw));

                const fallbackShare = Math.max(0, fallbackShareValue).toFixed(1).replace('.', ',');
                const fallbackAvg = Math.max(0, fallbackAvgValue).toFixed(2).replace('.', ',');

                const statsKey = normalizeOverlayName(baseName);
                const statEntry = calculatedCardStats.get(statsKey);
                const isM3Special = ((setCode || '').toUpperCase() === 'M3')
                    || ((card.original_set_code || '').toUpperCase() === 'M3')
                    || (typeof imageUrl === 'string' && /\/M3\//i.test(imageUrl));

                let overlayText = '';
                const resolvedShareValue = statEntry && statEntry.share > 0 ? statEntry.share : fallbackShareValue;
                const resolvedAvgValue = statEntry && statEntry.avgCount > 0 ? statEntry.avgCount : fallbackAvgValue;

                if (resolvedShareValue > 0 || resolvedAvgValue > 0) {
                    const statShare = Math.max(0, resolvedShareValue).toFixed(1).replace('.', ',');
                    const statAvg = Math.max(0, resolvedAvgValue || 0).toFixed(2).replace('.', ',');
                    overlayText = `${statShare}% | Ø ${statAvg}x`;
                } else if (isM3Special) {
                    overlayText = 'M3 Japan Exclusive';
                } else {
                    overlayText = `${fallbackShare}% | Ø ${fallbackAvg}x`;
                }
                
                // Check if user owns this card (specific print)
                const cardId = `${safeCardName}|${setCode}|${setNumber}`;
                const isOwned = window.userCollection && window.userCollection.has(cardId);
                const ownedBadge = isOwned ? '<div style="position: absolute; top: 5px; left: 5px; background: #4CAF50; color: white; width: 25px; height: 25px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.5); z-index: 4;">✓</div>' : '';
                
                html += `
                    <div class="deck-card" style="position: relative;" title="${safeCardName} (${count}x) - ${percentage}%">
                        <img src="${imageUrl}" alt="${safeCardName}" loading="lazy" style="cursor: zoom-in;" onerror="handleCardImageError(this, '${setCode}', '${setNumber}')" onclick="showSingleCard(this.src, '${cardNameEscaped}')">
                        
                        ${ownedBadge}
                        
                        <div class="card-max-count">${count}</div>
                        
                        <div style="position: absolute; bottom: 30px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.75); color: white; padding: 3px 10px; border-radius: 4px; font-size: 11px; font-weight: bold; white-space: nowrap; z-index: 2;">
                            ${overlayText}
                        </div>
                        
                        <div style="position: absolute; bottom: 5px; left: 5px; right: 5px; display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 3px; z-index: 3; align-items: stretch;">
                            <button onclick="removeCardFromDeck('${source}', '${deckKeyEscaped}')" style="background: #dc3545; color: white; border: none; border-radius: 3px; height: 20px; cursor: pointer; font-weight: bold; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 12px;">-</button>
                            <button onclick="openRaritySwitcher('${cardNameEscaped}', '${deckKeyEscaped}')" style="background: #ffc107; color: #333; border: none; border-radius: 3px; height: 20px; cursor: pointer; font-size: 11px; font-weight: bold; text-align: center; padding: 0; display: flex; align-items: center; justify-content: center;">★</button>
                            <button class="${priceClass}" onclick="openCardmarket('${cardmarketUrlEscaped}', '${cardNameEscaped}')" style="background: ${priceBackground}; color: white; height: 20px; border: none; border-radius: 3px; cursor: ${eurPrice ? 'pointer' : 'not-allowed'}; font-size: 8px; font-weight: bold; padding: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);" title="${eurPrice ? 'Auf Cardmarket kaufen: ' + eurPrice : 'Preis nicht verfuegbar'}">${priceDisplay}</button>
                            <button onclick="addCardToDeck('${source}', '${cardNameEscaped}', '${setCode}', '${setNumber}')" style="background: #28a745; color: white; border: none; border-radius: 3px; height: 20px; cursor: pointer; font-weight: bold; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 12px;">+</button>
                        </div>
                    </div>
                `;
            });
            
            const gridContainer = document.getElementById(gridContainerId);
            if (gridContainer) {
                gridContainer.innerHTML = html || '<p style="text-align: center; color: #444; padding: 40px; font-weight: 500;">Create a deck using the buttons above or add cards manually...</p>';
            }
        }
        
        // Filter deck grid based on search input
        function filterDeckGrid(source) {
            if (source !== 'cityLeague' && source !== 'currentMeta' && source !== 'pastMeta') return;
            
            let searchInputId, gridContainerId;
            if (source === 'cityLeague') {
                searchInputId = 'cityLeagueDeckGridSearch';
                gridContainerId = 'cityLeagueMyDeckGrid';
            } else if (source === 'currentMeta') {
                searchInputId = 'currentMetaDeckGridSearch';
                gridContainerId = 'currentMetaMyDeckGrid';
            } else if (source === 'pastMeta') {
                searchInputId = 'pastMetaDeckGridSearch';
                gridContainerId = 'pastMetaMyDeckGrid';
            }
            
            const searchInput = document.getElementById(searchInputId);
            if (!searchInput) return;
            
            const searchTerm = searchInput.value.toLowerCase().trim();
            const gridContainer = document.getElementById(gridContainerId);
            if (!gridContainer) return;
            
            const cards = gridContainer.querySelectorAll('.deck-card');
            cards.forEach(card => {
                const cardTitle = (card.getAttribute('title') || '').toLowerCase();
                if (searchTerm === '' || cardTitle.includes(searchTerm)) {
                    card.style.display = '';
                } else {
                    card.style.display = 'none';
                }
            });
        }
        
        // ========== CARD SORTING & ORGANIZATION FUNCTIONS ==========
        
        function getCardTypeCategory(cardType) {
            /**
             * Determines the category of a card based on the type field
             * type format: "GBasic", "WBasic", "PStage1", "PStage2", "Supporter", "Item", "Tool", "Stadium", "Special Energy", "Energy"
             */
            if (!cardType) return 'Pokemon';
            
            // IMPORTANT FIX: Check for Energy BEFORE element letter check
            // This fixes "Basic Energy" being sorted as Pokemon instead of Energy
            const typeLower = cardType.toLowerCase();
            if (typeLower.includes('energy')) return 'Energy';
            if (cardType === 'Special Energy') return 'Special Energy';
            if (cardType === 'Energy') return 'Energy';
            
            // Check if it's a Pokemon (type starts with element letter)
            if (cardType.charAt(0).match(/[GRWLPFDMNC]/)) {
                return 'Pokemon';
            }
            
            // Check exact matches for trainer types
            if (cardType === 'Supporter') return 'Supporter';
            if (cardType === 'Item') return 'Item';
            if (cardType === 'Tool') return 'Tool';
            if (cardType === 'Stadium') return 'Stadium';
            if (cardType === 'Trainer') return 'Item';
            
            // Fallback to Pokemon
            return 'Pokemon';
        }
        
        function sortCardsByType(cards) {
            /**
             * Sort cards:
             * 1. By Category (Pokemon, Supporter, Item, etc.)
             * 2. By Element (for Pokemon: G, R, W, L, P, F, D, M, N, C)
             * 3. By PERCENTAGE (highest first!)
             * 4. By Evolution Chain (keep together: Basic, Stage1, Stage2)
             * 5. By Set Number
             */
            
            // Pokemon Evolution Chains (from pokemondb.net/evolution)
            const evolutionChains = {
                'Bulbasaur': ['Bulbasaur', 'Ivysaur', 'Venusaur'],
                'Ivysaur': ['Bulbasaur', 'Ivysaur', 'Venusaur'],
                'Venusaur': ['Bulbasaur', 'Ivysaur', 'Venusaur'],
                'Charmander': ['Charmander', 'Charmeleon', 'Charizard'],
                'Charmeleon': ['Charmander', 'Charmeleon', 'Charizard'],
                'Charizard': ['Charmander', 'Charmeleon', 'Charizard'],
                'Squirtle': ['Squirtle', 'Wartortle', 'Blastoise'],
                'Wartortle': ['Squirtle', 'Wartortle', 'Blastoise'],
                'Blastoise': ['Squirtle', 'Wartortle', 'Blastoise'],
                'Pichu': ['Pichu', 'Pikachu', 'Raichu'],
                'Pikachu': ['Pichu', 'Pikachu', 'Raichu'],
                'Raichu': ['Pichu', 'Pikachu', 'Raichu'],
                'Riolu': ['Riolu', 'Lucario', 'Mega Lucario ex'],
                'Lucario': ['Riolu', 'Lucario', 'Mega Lucario ex'],
                'Mega Lucario ex': ['Riolu', 'Lucario', 'Mega Lucario ex'],
                'Eevee': ['Eevee', 'Vaporeon', 'Jolteon', 'Flareon', 'Espeon', 'Umbreon', 'Leafeon', 'Glaceon', 'Sylveon'],
                'Vaporeon': ['Eevee', 'Vaporeon', 'Jolteon', 'Flareon', 'Espeon', 'Umbreon', 'Leafeon', 'Glaceon', 'Sylveon'],
                'Jolteon': ['Eevee', 'Vaporeon', 'Jolteon', 'Flareon', 'Espeon', 'Umbreon', 'Leafeon', 'Glaceon', 'Sylveon'],
                'Flareon': ['Eevee', 'Vaporeon', 'Jolteon', 'Flareon', 'Espeon', 'Umbreon', 'Leafeon', 'Glaceon', 'Sylveon'],
                'Espeon': ['Eevee', 'Vaporeon', 'Jolteon', 'Flareon', 'Espeon', 'Umbreon', 'Leafeon', 'Glaceon', 'Sylveon'],
                'Umbreon': ['Eevee', 'Vaporeon', 'Jolteon', 'Flareon', 'Espeon', 'Umbreon', 'Leafeon', 'Glaceon', 'Sylveon'],
                'Leafeon': ['Eevee', 'Vaporeon', 'Jolteon', 'Flareon', 'Espeon', 'Umbreon', 'Leafeon', 'Glaceon', 'Sylveon'],
                'Glaceon': ['Eevee', 'Vaporeon', 'Jolteon', 'Flareon', 'Espeon', 'Umbreon', 'Leafeon', 'Glaceon', 'Sylveon'],
                'Sylveon': ['Eevee', 'Vaporeon', 'Jolteon', 'Flareon', 'Espeon', 'Umbreon', 'Leafeon', 'Glaceon', 'Sylveon'],
                'Shaymin': ['Shaymin'],
                'Dialga': ['Dialga'],
                'Palkia': ['Palkia'],
                'Kyogre': ['Kyogre'],
                'Groudon': ['Groudon'],
                'Rayquaza': ['Rayquaza'],
                'Jirachi': ['Jirachi'],
                'Deoxys': ['Deoxys'],
                'Budew': ['Budew', 'Roserade'],
                'Roserade': ['Budew', 'Roserade'],
                'Chimecho': ['Chimecho', 'Chimchar', 'Monferno', 'Infernape'],
                'Chimchar': ['Chimecho', 'Chimchar', 'Monferno', 'Infernape'],
                'Monferno': ['Chimecho', 'Chimchar', 'Monferno', 'Infernape'],
                'Infernape': ['Chimecho', 'Chimchar', 'Monferno', 'Infernape'],
                'Piplup': ['Piplup', 'Prinplup', 'Empoleon'],
                'Prinplup': ['Piplup', 'Prinplup', 'Empoleon'],
                'Empoleon': ['Piplup', 'Prinplup', 'Empoleon'],
                'Turtwig': ['Turtwig', 'Grotle', 'Torterra'],
                'Grotle': ['Turtwig', 'Grotle', 'Torterra'],
                'Torterra': ['Turtwig', 'Grotle', 'Torterra'],
                'Makuhita': ['Makuhita', 'Hariyama'],
                'Hariyama': ['Makuhita', 'Hariyama'],
                'Lunatone': ['Lunatone'],
                'Solrock': ['Solrock'],
                'Cornerstone Mask Oger': ['Cornerstone Mask Oger'],
                'Ting-Lu': ['Ting-Lu'],
                'Oricorio': ['Oricorio'],
                'Drilbur': ['Drilbur', 'Excadrill'],
                'Excadrill': ['Drilbur', 'Excadrill'],
                'Hawlucha': ['Rowlet', 'Dartrix', 'Decidueye', 'Hawlucha'],
                'Rowlet': ['Rowlet', 'Dartrix', 'Decidueye', 'Hawlucha'],
                'Dartrix': ['Rowlet', 'Dartrix', 'Decidueye', 'Hawlucha'],
                'Decidueye': ['Rowlet', 'Dartrix', 'Decidueye', 'Hawlucha'],
                'Ethan\'s Sudowoodo': ['Ethan\'s Sudowoodo'],
                'Fezandipiti ex': ['Fezandipiti ex'],
                'Mega Zygarde ex': ['Mega Zygarde ex'],
                'Escadrill': ['Escadrill'],
                'Psyduck': ['Psyduck', 'Golduck'],
                'Golduck': ['Psyduck', 'Golduck'],
                'Flutter Mane': ['Flutter Mane'],
                'Lillie\'s Certainty ex': ['Lillie\'s Certainty ex'],
                'Munkidori': ['Munkidori'],
                'Togepi': ['Togepi', 'Togetic', 'Togekiss'],
                'Togetic': ['Togepi', 'Togetic', 'Togekiss'],
                'Togekiss': ['Togepi', 'Togetic', 'Togekiss']
            };
            
            const elementOrder = {
                'G': 1,  // Grass
                'R': 2,  // Fire
                'W': 3,  // Water
                'L': 4,  // Lightning
                'P': 5,  // Psychic
                'F': 6,  // Fighting
                'D': 7,  // Darkness
                'M': 8,  // Metal
                'N': 9,  // Dragon
                'C': 10  // Colorless
            };
            
            const evolutionOrder = {
                'Basic': 1,
                'Stage1': 2,
                'Stage2': 3
            };
            
            const typeOrder = {
                'Pokemon': 1,
                'Supporter': 2,
                'Item': 3,
                'Tool': 4,
                'Stadium': 5,
                'Special Energy': 6,
                'Energy': 7
            };
            
            return cards.sort((a, b) => {
                const cardTypeA = a.type || a.card_type || '';
                const cardTypeB = b.type || b.card_type || '';
                
                const categoryA = getCardTypeCategory(cardTypeA);
                const categoryB = getCardTypeCategory(cardTypeB);
                
                const orderA = typeOrder[categoryA] || 99;
                const orderB = typeOrder[categoryB] || 99;
                
                // FIRST: Sort by main category (Pokemon, Supporter, etc.)
                if (orderA !== orderB) {
                    return orderA - orderB;
                }
                
                // Parse percentage once for both cards
                const percA = parseFloat((a.percentage_in_archetype || '0').toString().replace(',', '.')) || 0;
                const percB = parseFloat((b.percentage_in_archetype || '0').toString().replace(',', '.')) || 0;
                
                // For Pokemon: sort by element first, then by percentage
                if (categoryA === 'Pokemon' && categoryB === 'Pokemon') {
                    const elementA = cardTypeA.charAt(0);
                    const elementB = cardTypeB.charAt(0);
                    const evolutionA = cardTypeA.substring(1).replace(/\s+/g, '');
                    const evolutionB = cardTypeB.substring(1).replace(/\s+/g, '');
                    
                    const elemOrderA = elementOrder[elementA] || 99;
                    const elemOrderB = elementOrder[elementB] || 99;
                    
                    // Different element: sort by element order
                    if (elemOrderA !== elemOrderB) {
                        return elemOrderA - elemOrderB;
                    }
                    
                    // SAME ELEMENT: Sort by PERCENTAGE (highest first)
                    if (percA !== percB) {
                        return percB - percA;
                    }
                    
                    // Same percentage: sort by ORIGINAL SET CODE + SET NUMBER (keeps same-set cards together)
                    // Use original_set_code/original_set_number for consistent sorting even when Max Rarity is selected
                    const setCodeA = a.original_set_code || a.set_code || '';
                    const setCodeB = b.original_set_code || b.set_code || '';
                    
                    if (setCodeA !== setCodeB) {
                        return setCodeA.localeCompare(setCodeB);
                    }
                    
                    // Same set code: sort by ORIGINAL SET NUMBER (numerically)
                    const setNumA = parseInt(((a.original_set_number || a.set_number) || '0').toString().replace(/[^\d]/g, '')) || 0;
                    const setNumB = parseInt(((b.original_set_number || b.set_number) || '0').toString().replace(/[^\d]/g, '')) || 0;
                    if (setNumA !== setNumB) {
                        return setNumA - setNumB;
                    }
                    
                    // Same set+number: sort by card name (keeps related Pokemon together)
                    const nameA = a.card_name || a.name || '';
                    const nameB = b.card_name || b.name || '';
                    const nameCompare = nameA.localeCompare(nameB);
                    if (nameCompare !== 0) {
                        return nameCompare;
                    }
                    
                    // Same name: sort by evolution stage (Basic ? Stage1 ? Stage2)
                    const evolOrderA = evolutionOrder[evolutionA] || 99;
                    const evolOrderB = evolutionOrder[evolutionB] || 99;
                    
                    return evolOrderA - evolOrderB;
                }
                
                // For non-Pokemon cards: Sort by PERCENTAGE (highest first)
                if (percA !== percB) {
                    return percB - percA;
                }
                
                // Same percentage: sort by set number
                const setNumA = parseInt((a.set_number || '0').toString().replace(/[^\d]/g, '')) || 0;
                const setNumB = parseInt((b.set_number || '0').toString().replace(/[^\d]/g, '')) || 0;
                if (setNumA !== setNumB) {
                    return setNumA - setNumB;
                }
                
                // Finally by name
                const nameA = a.card_name || a.name || '';
                const nameB = b.card_name || b.name || '';
                return nameA.localeCompare(nameB);
            });
        }
        
        function deduplicateCards(cards) {
            /**
             * Fuer jede Karte (gleicher Name) nur die neueste low-rarity Version behalten
             */
            const setOrder = {
                // 2026 Sets (newest first, based on pokemon_sets_mapping.csv)
                'M3': 116, 'ASC': 115, 'PFL': 114, 'MEG': 113, 'MEE': 112, 'MEP': 111,
                'BLK': 110, 'WHT': 109, 'DRI': 108, 'JTG': 107, 'PRE': 106, 'SSP': 105,
                // 2024-2025 Sets
                'SCR': 104, 'SFA': 103, 'TWM': 102, 'TEF': 101, 'PAF': 100, 'PAR': 99,
                'MEW': 98, 'OBF': 97, 'PAL': 96, 'SVI': 95, 'SVE': 94, 'SVP': 93,
                // 2023 Sets
                'CRZ': 92, 'SIR': 91, 'LOR': 90, 'PGO': 89,
                // 2022 Sets
                'ASR': 88, 'BRS': 87, 'FST': 86, 'CEL': 85, 'EVS': 84, 'CRE': 83,
                // 2021 Sets
                'BST': 82, 'TM': 81, 'SHF': 80, 'VIV': 79, 'CPA': 78,
                // 2020 Sets
                'DAA': 77, 'RCL': 76, 'SSH': 75, 'SP': 74, 'CEC': 73
            };
            
            const rarityOrder = {
                'Common': 1,
                'Uncommon': 2,
                'Rare': 3,
                'Holo Rare': 4,
                'Ultra Rare': 5,
                'Secret Rare': 6,
                'Hyper Rare': 7,
                'Special Rare': 8,
                'Illustration Rare': 9,
                'Promo': 10
            };
            
            const cardMap = new Map();
            
            cards.forEach(card => {
                const cardName = normalizeCardAggregationKey(card.card_name);
                if (!cardName) return;
                
                if (!cardMap.has(cardName)) {
                    cardMap.set(cardName, card);
                } else {
                    const existing = cardMap.get(cardName);
                    const existingSetPriority = setOrder[existing.set_code] || 0;
                    const newSetPriority = setOrder[card.set_code] || 0;
                    const existingRarityPriority = rarityOrder[existing.rarity] || 99;
                    const newRarityPriority = rarityOrder[card.rarity] || 99;
                    
                    // Bevorzuge: 1. Low Rarity (Common/Uncommon), 2. Neuestes Set
                    if (newRarityPriority < existingRarityPriority) {
                        // Niedrigere Rarity gewinnt - aber behalte aggregierte Daten
                        // Nur ueberschreiben wenn neue Werte nicht leer sind
                        if (card.image_url) existing.image_url = card.image_url;
                        if (card.set_code) existing.set_code = card.set_code;
                        if (card.rarity) existing.rarity = card.rarity;
                        if (card.set_number) existing.set_number = card.set_number;
                    } else if (newRarityPriority === existingRarityPriority && newSetPriority > existingSetPriority) {
                        // Gleiche Rarity, aber neueres Set - behalte aggregierte Daten
                        // Nur ueberschreiben wenn neue Werte nicht leer sind
                        if (card.image_url) existing.image_url = card.image_url;
                        if (card.set_code) existing.set_code = card.set_code;
                        if (card.rarity) existing.rarity = card.rarity;
                        if (card.set_number) existing.set_number = card.set_number;
                    }
                    // Falls set_code fehlt aber image_url das Set zeigt, extrahiere es
                    if (!existing.set_code && existing.image_url) {
                        if (existing.image_url.includes('/M3/')) {
                            existing.set_code = 'M3';
                            console.log(`Set code M3 extracted from URL for: ${existing.card_name}`);
                        }
                    }
                }
            });
            
            // Debug: Count cards with set_code after deduplication
            const result = Array.from(cardMap.values());
            const m3Cards = result.filter(c => c.set_code === 'M3' || (c.image_url && c.image_url.includes('/M3/')));
            if (m3Cards.length > 0) {
                console.log(`After deduplicateCards: ${m3Cards.length} M3 cards. First 3:`, 
                    m3Cards.slice(0, 3).map(c => ({ name: c.card_name, set_code: c.set_code, url: c.image_url }))
                );
            }
            
            return result;
        }
        
        // ========== DECK OVERVIEW RENDERING FUNCTIONS ==========
        
        function renderOverviewCards(cards) {
            /**
             * Renders deck overview for City League Analysis
             * Shows cards in a responsive grid with:
             * - Card image
             * - Red circle (top-right): max_count
             * - Green circle (top-left): deck_count (how many in selected deck - starts at 0)
             * - Card name
             * - Percentage and average count
             */
            // Karten sind bereits in loadCityLeagueDeckData() dedupliziert
            const sortedCards = sortCardsByType([...cards]);
            
            // Get current deck state
            const deck = window.cityLeagueDeck || {};
            
            // Log for debugging
            console.log('RENDERED OVERVIEW CARDS - Sorted by type:');
            sortedCards.slice(0, 10).forEach((card, idx) => {
                console.log(`${idx + 1}. ${card.card_name} (${card.type || card.card_type || 'UNKNOWN'}) - ${getCardTypeCategory(card.type || card.card_type || '')}`);
            });
            
            const overviewContainer = document.getElementById('cityLeagueDeckOverview');
            if (!overviewContainer) return;
            
            const gridHtml = sortedCards.map(card => {
                const imageUrl = getBestCardImage(card);
                // Konvertiere Komma zu Punkt fuer parseFloat (CSV verwendet Komma als Dezimaltrennzeichen)
                const percentageStr = (card.percentage_in_archetype || '0').toString().replace(',', '.');
                let percentage = parseFloat(percentageStr);
                const maxCount = parseInt(card.max_count) || card.max_count || '-';
                
                // Get actual deck count from window.cityLeagueDeck
                // Try both: card name only AND "CardName (SET NUM)" format
                let deckCount = deck[card.card_name] || 0;
                if (deckCount === 0 && card.set_code && card.set_number) {
                    const versionKey = `${card.card_name} (${card.set_code} ${card.set_number})`;
                    deckCount = deck[versionKey] || 0;
                }
                // Also check all deck keys that start with the card name
                if (deckCount === 0) {
                    for (const key in deck) {
                        if (key.startsWith(card.card_name + ' (')) {
                            deckCount += deck[key];
                        }
                    }
                }
                
                // Prefer "average in decks that use this card" for UI consistency.
                const totalCount = parseFloat(String(card.total_count || 0).replace(',', '.')) || 0;
                const decksWithCard = parseFloat(String(card.deck_count || card.deck_inclusion_count || 0).replace(',', '.')) || 0;
                const avgCountFromRow = parseFloat(String(card.average_count || card.avg_count || '').replace(',', '.'));
                const avgCountValue = Number.isFinite(avgCountFromRow) && avgCountFromRow > 0
                    ? avgCountFromRow
                    : (decksWithCard > 0 ? (totalCount / decksWithCard) : 0);
                const avgCount = Math.max(0, avgCountValue).toFixed(2).replace('.', ',');
                
                // Card image or placeholder
                let imgHtml = '';
                if (imageUrl && imageUrl.trim() !== '') {
                    imgHtml = `<img src="${imageUrl}" alt="${card.card_name}" loading="lazy" referrerpolicy="no-referrer" style="width: 100%; aspect-ratio: 2.5/3.5; object-fit: cover; cursor: zoom-in;" onerror="handleCardImageError(this, '${card.set_code || ''}', '${card.set_number || ''}')" onclick="if (typeof event !== 'undefined' && event) event.stopPropagation(); showSingleCard(this.src, '${card.card_name.replace(/'/g, "\\'")}');">`;
                } else {
                    imgHtml = `<div style="width: 100%; aspect-ratio: 2.5/3.5; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; font-size: 2em;">??</div>`;
                }
                
                return `
                    <div class="card-item" style="position: relative; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.15); cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; background: white;">
                        <div style="position: relative; width: 100%;">
                            ${imgHtml}
                            
                            <!-- Red badge: Max Count (top-right) -->
                            <div style="position: absolute; top: 5px; right: 5px; background: #dc3545; color: white; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.8em; box-shadow: 0 2px 4px rgba(0,0,0,0.3); z-index: 2;">
                                ${maxCount}
                            </div>
                            
                            <!-- Green badge: Deck Count (top-left) - only show if > 0 -->
                            ${deckCount > 0 ? `
                            <div style="position: absolute; top: 5px; left: 5px; background: #28a745; color: white; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.8em; box-shadow: 0 2px 4px rgba(0,0,0,0.3); z-index: 2;">
                                ${deckCount}
                            </div>
                            ` : ''}
                        </div>
                        
                        <!-- Card info section -->
                        <div style="padding: 8px; background: white; font-size: 0.75em; text-align: center; min-height: 60px; display: flex; flex-direction: column; justify-content: space-between;">
                            <div>
                                <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; margin-bottom: 3px; color: #333; font-size: 0.9em;">
                                    ${card.card_name}
                                </div>
                                <div style="color: #333; font-size: 0.75em; margin-bottom: 3px; font-weight: 600;">
                                    ${card.set_code || ''} ${card.set_number || ''}
                                </div>
                                <div style="color: #333; font-size: 0.85em; font-weight: 600;">
                                    ${percentage.toFixed(2).replace('.', ',')}% | Ø ${avgCount}x
                                </div>
                            </div>
                            
                            <!-- Add button -->
                            <button class="btn btn-success" style="padding: 4px 8px; font-size: 0.75em; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; transition: all 0.2s; margin-top: 8px; width: 100%;" onclick="addCardToDeck('cityLeague', '${card.card_name.replace(/'/g, "\\'")}', '${card.set_code || ''}', '${card.set_number || ''}')" title="Add to deck">Add to Deck</button>
                        </div>
                    </div>
                `;
            }).join('');
            
            overviewContainer.innerHTML = gridHtml;
        }
        
        function generateDeckGrid(source) {
            if (source !== 'cityLeague' && source !== 'currentMeta' && source !== 'pastMeta') return;
            
            let deck, currentCardsKey;
            if (source === 'cityLeague') {
                deck = window.cityLeagueDeck;
                currentCardsKey = 'currentCityLeagueDeckCards';
            } else if (source === 'currentMeta') {
                deck = window.currentMetaDeck;
                currentCardsKey = 'currentCurrentMetaDeckCards';
            } else if (source === 'pastMeta') {
                deck = window.pastMetaDeck;
                currentCardsKey = null; // Past Meta uses different data source
            }
            
            if (!deck || Object.keys(deck).length === 0) {
                alert('Your deck is empty!');
                return;
            }
            
            const modal = document.getElementById('imageViewModal');
            const grid = document.getElementById('compactCardGrid');
            const allCards = currentCardsKey ? (window[currentCardsKey] || []) : (pastMetaFilteredCards || []);
            const allCardsDb = window.allCardsDatabase || [];
            
            // PERFORMANCE: Build map for O(1) lookups
            const cardDataMap = new Map();
            allCards.forEach(card => {
                const cardName = card.card_name || card.full_card_name;
                if (cardName) {
                    cardDataMap.set(cardName, card);
                }
            });
            
            // PERFORMANCE: Pre-build allCardsDb Map by name for O(1) lookup
            const allCardsDbMap = new Map();
            allCardsDb.forEach(card => {
                if (card.name) {
                    allCardsDbMap.set(card.name, card);
                }
            });
            
            // Convert deck to array with card data
            const deckCards = [];
            for (const [deckKey, count] of Object.entries(deck)) {
                if (count <= 0) continue;
                
                // Extract card name from deckKey (handle "CardName (SET NUM)" format)
                const baseNameMatch = deckKey.match(/^(.+?)\s*\(/);
                const cardName = baseNameMatch ? baseNameMatch[1] : deckKey;
                
                let cardData = cardDataMap.get(cardName) || cardDataMap.get(deckKey);
                
                // If not found, try allCardsDatabase with O(1) lookup
                if (!cardData) {
                    const setMatch = deckKey.match(/\(([A-Z0-9]+)\s+([A-Z0-9]+)\)$/);
                    if (setMatch) {
                        const exactCard = allCardsDbMap.get(cardName);
                    }
                }
                
                if (!cardData) continue;
                
                deckCards.push({...cardData, deck_count_in_selected: count, card_name: cardName});
            }
            
            // Sort cards using the standard sorting function
            const sortedCards = sortCardsByType(deckCards);
            
            // Check if mobile device
            const isMobile = window.innerWidth <= 768;
            
            // Build grid HTML
            grid.innerHTML = sortedCards.map(card => {
                const imageUrl = getBestCardImage(card);
                const count = card.deck_count_in_selected || 1;
                const cardName = card.card_name || '';
                const cardNameEscaped = (cardName || '').replace(/'/g, "\\'");
                
                if (imageUrl && imageUrl.trim() !== '') {
                    return `
                        <div class="compact-card" title="${cardName} (${count}x)" style="cursor: zoom-in;" onclick="showSingleCard(this.querySelector('img').src, '${cardNameEscaped}')">
                            <img src="${imageUrl}" 
                                 alt="${cardName}" 
                                 loading="lazy"
                                 referrerpolicy="no-referrer"
                                 onerror="handleCardImageError(this, '${card.set_code || ''}', '${card.set_number || ''}')">
                            <div class="compact-badge">${count}</div>
                        </div>
                    `;
                } else {
                    return `
                        <div class="compact-card" style="display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                            <div style="text-align: center;">
                                <div style="font-size: 0.8em; margin-bottom: 5px;">${cardName.substring(0, 15)}</div>
                                <div class="compact-badge" style="position: static;">${count}</div>
                            </div>
                        </div>
                    `;
                }
            }).join('');
            
            // Add mobile-specific class for compact layout
            if (isMobile) {
                grid.classList.add('mobile-compact-grid');
            } else {
                grid.classList.remove('mobile-compact-grid');
            }
            
            modal.classList.add('show');
            
            // Close on ESC key
            const escapeHandler = (e) => {
                if (e.key === 'Escape') {
                    closeImageView();
                    document.removeEventListener('keydown', escapeHandler);
                }
            };
            document.addEventListener('keydown', escapeHandler);
        }
        
        function closeImageView() {
            const modal = document.getElementById('imageViewModal');
            modal.classList.remove('show');
        }
        
        function copyDeck(source) {
            console.log('[copyDeck] Called with source:', source);
            
            if (source === 'cityLeague') {
                copyDeckOverview();
            } else if (source === 'currentMeta') {
                copyCurrentMetaDeckOverview();
            } else if (source === 'pastMeta') {
                copyPastMetaDeckOverview();
            } else {
                console.log('[copyDeck] Unsupported source:', source);
                alert('? This function is not available for this tab!');
            }
        }
        
        function showSingleCard(imageUrl, cardName, cardData = null) {
            const overlay = document.getElementById('fullCardOverlay') || document.getElementById('singleCardModal');
            const img = overlay?.querySelector('img') || document.getElementById('singleCardImage');
            const title = document.getElementById('singleCardTitle');

            if (!overlay || !img) return;

            const parseIdentityFromInput = () => {
                let inferredSet = '';
                let inferredNumber = '';

                const nameMatch = String(cardName || '').match(/\(([A-Z0-9]+)\s+([A-Z0-9]+)\)$/);
                if (nameMatch) {
                    inferredSet = nameMatch[1];
                    inferredNumber = nameMatch[2];
                }

                if (!inferredSet || !inferredNumber) {
                    const proxyMatch = String(imageUrl || '').match(/pokemonproxies\.com\/images\/([a-z0-9]+)\/([^/.]+)\.png/i);
                    if (proxyMatch) {
                        inferredSet = inferredSet || proxyMatch[1].toUpperCase();
                        inferredNumber = inferredNumber || proxyMatch[2];
                    }
                }

                if (!inferredSet || !inferredNumber) {
                    const limitlessMatch = String(imageUrl || '').match(/\/(M[34])\/\1_0*([A-Z0-9]+)_/i);
                    if (limitlessMatch) {
                        inferredSet = inferredSet || limitlessMatch[1].toUpperCase();
                        inferredNumber = inferredNumber || limitlessMatch[2];
                    }
                }

                return { inferredSet, inferredNumber };
            };

            const { inferredSet, inferredNumber } = parseIdentityFromInput();
            const normalizedCardData = (cardData && typeof cardData === 'object')
                ? cardData
                : {
                    card_name: String(cardName || '').replace(/\s*\([A-Z0-9]+\s+[A-Z0-9]+\)$/, ''),
                    image_url: imageUrl,
                    set_code: inferredSet,
                    set_number: inferredNumber
                };

            const resolvedImage = getBestCardImage(normalizedCardData) || imageUrl;

            img.src = resolvedImage;
            img.alt = cardName;
            img.onerror = function() {
                handleCardImageError(img, inferredSet || normalizedCardData.set_code || '', inferredNumber || normalizedCardData.set_number || '');
            };
            if (title) {
                title.textContent = cardName;
            }

            document.body.style.overflow = 'hidden';
            overlay.classList.add('card-modal-overlay');
            overlay.classList.remove('show');
            overlay.classList.remove('active');
            img.classList.remove('active');
            overlay.style.display = 'flex';
            overlay.style.opacity = '';  // let CSS handle opacity via .active class
            setTimeout(() => {
                overlay.classList.add('active');
                overlay.classList.add('show');
                img.classList.add('active');
            }, 10);

            if (window._singleCardOverlayClickHandler) {
                overlay.removeEventListener('click', window._singleCardOverlayClickHandler);
            }
            window._singleCardOverlayClickHandler = function(e) {
                if (e.target === overlay) hideSingleCard();
            };
            overlay.addEventListener('click', window._singleCardOverlayClickHandler);
            img.onclick = function(e) { e.stopPropagation(); };

            // Escape-Taste schließt das Modal
            if (window._singleCardEscHandler) {
                document.removeEventListener('keydown', window._singleCardEscHandler);
            }
            window._singleCardEscHandler = (e) => {
                if (e.key === 'Escape') {
                    hideSingleCard();
                    document.removeEventListener('keydown', window._singleCardEscHandler);
                    window._singleCardEscHandler = null;
                }
            };
            document.addEventListener('keydown', window._singleCardEscHandler);
        }

        function hideSingleCard() {
            const overlay = document.getElementById('fullCardOverlay') || document.getElementById('singleCardModal');
            if (!overlay) return;
            const img = overlay.querySelector('img') || document.getElementById('singleCardImage');
            overlay.classList.remove('active');
            overlay.classList.remove('show');
            if (img) {
                img.classList.remove('active');
            }

            if (window._singleCardOverlayClickHandler) {
                overlay.removeEventListener('click', window._singleCardOverlayClickHandler);
                window._singleCardOverlayClickHandler = null;
            }

            document.body.style.overflow = '';

            if (window._singleCardEscHandler) {
                document.removeEventListener('keydown', window._singleCardEscHandler);
                window._singleCardEscHandler = null;
            }

            setTimeout(() => {
                if (!overlay.classList.contains('active') && !overlay.classList.contains('show')) {
                    overlay.style.display = 'none';
                }
            }, 300);
        }

        // Backward compatibility for existing inline handlers.
        function closeSingleCard() {
            hideSingleCard();
        }

        if (!window.__singleCardEscapeBound) {
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    hideSingleCard();
                }
            });
            window.__singleCardEscapeBound = true;
        }
        
        function autoComplete(source, rarityMode) {
            if (source !== 'cityLeague' && source !== 'currentMeta' && source !== 'pastMeta') return;
            
            // CRITICAL: Clear all specific rarity preferences before generating deck
            // This ensures the selected rarity mode (min/max) is applied correctly
            rarityPreferences = {};
            saveRarityPreferences();
            
            // Set global rarity preference based on button clicked
            if (rarityMode) {
                globalRarityPreference = rarityMode;
            }
            
            let cardsKey, cards;
            if (source === 'cityLeague') {
                cardsKey = 'currentCityLeagueDeckCards';
                cards = window[cardsKey];
            } else if (source === 'currentMeta') {
                cardsKey = 'currentCurrentMetaDeckCards';
                cards = window[cardsKey];
            } else if (source === 'pastMeta') {
                cards = pastMetaCurrentCards; // Use the currently selected deck cards
            }
            
            if (!cards || cards.length === 0) {
                alert('No cards to add!');
                return;
            }
            
            console.log('[autoComplete] Starting autoComplete for', source);
            console.log('[autoComplete] Total available cards:', cards.length);
            
            // ===================================================================
            // CRITICAL FIX: Always clear deck when generating
            // This ensures we build a fresh deck from scratch, not add to existing
            // ===================================================================
            console.log('[autoComplete] ??? Clearing existing deck to build fresh...');
            if (source === 'cityLeague') {
                window.cityLeagueDeck = {};
                window.cityLeagueDeckOrder = [];
                saveCityLeagueDeck();
            } else if (source === 'currentMeta') {
                window.currentMetaDeck = {};
                window.currentMetaDeckOrder = [];
                saveCurrentMetaDeck();
            } else if (source === 'pastMeta') {
                window.pastMetaDeck = {};
                window.pastMetaDeckOrder = [];
                savePastMetaDeck();
            }
            
            // Get current archetype (for saving later)
            let currentArchetype;
            if (source === 'cityLeague') {
                currentArchetype = window.currentCityLeagueArchetype;
            } else if (source === 'currentMeta') {
                currentArchetype = window.currentCurrentMetaArchetype;
            } else if (source === 'pastMeta') {
                currentArchetype = window.pastMetaCurrentArchetype;
            }
            console.log('[autoComplete] Building deck for archetype:', currentArchetype);
            
            // Get deck reference and initialize card counter
            let deck;
            if (source === 'cityLeague') {
                deck = window.cityLeagueDeck;
            } else if (source === 'currentMeta') {
                deck = window.currentMetaDeck;
            } else if (source === 'pastMeta') {
                deck = window.pastMetaDeck;
            }
            let currentTotal = 0; // Start from 0 since we just cleared the deck
            
            // Basis Energien Identifikation - duerfen oefter als 4x sein
            const isBaseEnergy = (card) => {
                const type = (card.type || card.card_type || '').toLowerCase();
                return type === 'energy' && (card.card_name || '').match(/^(Fire|Water|Grass|Lightning|Psychic|Fighting|Darkness|Metal|Fairy|Dragon|Colorless|Neutral)\s+Energy$/i);
            };
            
            // Step 1: Aggregate cards by card_name (sum deck_count across all tournaments)
            const uniqueCards = {};
            for (const card of cards) {
                const cardName = card.card_name;
                
                if (!uniqueCards[cardName]) {
                    // First occurrence - initialize with this card's data
                    uniqueCards[cardName] = {
                        ...card,
                        deck_count: parseInt(card.deck_count || 0),
                        total_count: parseFloat(card.total_count || 0)
                    };
                } else {
                    // Aggregate: sum deck_count and total_count across tournaments
                    uniqueCards[cardName].deck_count += parseInt(card.deck_count || 0);
                    uniqueCards[cardName].total_count += parseFloat(card.total_count || 0);
                }
            }
            
            const resolvedTotalDecks = resolveBuilderTotalDecks(source, currentArchetype, cards, uniqueCards);

            // Recalculate percentage_in_archetype for each card based on aggregated deck_count
            for (const cardName in uniqueCards) {
                const card = uniqueCards[cardName];
                const deckCount = card.deck_count;
                const percentage = Math.min(100, Math.max(0, (deckCount / resolvedTotalDecks) * 100));
                card.total_decks_in_archetype = resolvedTotalDecks;
                card.percentage_in_archetype = percentage.toFixed(2).replace('.', ',');
            }
            
            let deckCards = Object.values(uniqueCards);
            console.log('[autoComplete] After aggregation:', deckCards.length, 'unique cards');
            
            // Debug: Log all card types to understand structure
            const typeSet = new Set();
            deckCards.forEach(card => {
                const type = card.type || card.card_type || '';
                typeSet.add(type);
            });
            console.log('[autoComplete] Card types found:', Array.from(typeSet));
            
            // Step 2: Sort by percentage (descending)
            deckCards.sort((a, b) => {
                const percentageA = parseFloat((a.percentage_in_archetype || '0').toString().replace(',', '.'));
                const percentageB = parseFloat((b.percentage_in_archetype || '0').toString().replace(',', '.'));
                return percentageB - percentageA;
            });
            
            let cardsToAdd = [];
            const addedNames = new Set(Object.keys(deck).filter(name => deck[name] > 0));
            
            // ===================================================================
            // CRITICAL: Step 3 - Add Ace Spec FIRST (highest percentage, max 1x)
            // ===================================================================
            // Find all Ace Spec cards and sort by percentage
            const aceSpecCards = deckCards.filter(card => isAceSpec(card));
            aceSpecCards.sort((a, b) => {
                const percentageA = parseFloat((a.percentage_in_archetype || '0').toString().replace(',', '.'));
                const percentageB = parseFloat((b.percentage_in_archetype || '0').toString().replace(',', '.'));
                return percentageB - percentageA; // Sort descending by percentage
            });
            
            // Add the MOST USED Ace Spec (highest percentage) - exactly 1 copy
            let bestAceSpec = null;
            if (aceSpecCards.length > 0) {
                bestAceSpec = aceSpecCards[0]; // First one = highest percentage
                const acePercentage = parseFloat((bestAceSpec.percentage_in_archetype || '0').toString().replace(',', '.'));
                console.log('[autoComplete] ?? ACE SPEC SELECTED:', bestAceSpec.card_name, `(${acePercentage}%)`);
                
                if (!addedNames.has(bestAceSpec.card_name)) {
                    cardsToAdd.push({ ...bestAceSpec, addCount: 1 });
                    addedNames.add(bestAceSpec.card_name);
                    currentTotal += 1;
                    console.log('[autoComplete] ? Added Ace Spec (1x):', bestAceSpec.card_name);
                } else {
                    console.log('[autoComplete] ?? Ace Spec already in deck:', bestAceSpec.card_name);
                }
            } else {
                console.log('[autoComplete] ?? WARNING: No Ace Spec found in deck list!');
            }
            
            
            // ===================================================================
            // Step 4: Add remaining cards from 100% downwards until deck is full
            // ===================================================================
            console.log('[autoComplete] ?? Building deck from highest percentage (100%) downwards...');
            
            // Cards are already sorted by percentage (descending) from Step 2
            for (const card of deckCards) {
                if (currentTotal >= 60) {
                    console.log('[autoComplete] ? Deck complete (60 cards - tournament legal) - stopping');
                    break;
                }
                
                const cardName = card.card_name;
                
                // Skip if already added
                if (addedNames.has(cardName)) continue;
                
                // Skip Ace Spec cards (the best one was already added in Step 3)
                if (isAceSpec(card)) {
                    console.log('[autoComplete] ?? Skipping Ace Spec (already added):', cardName);
                    continue;
                }
                
                // Get percentage for logging
                const percentage = parseFloat((card.percentage_in_archetype || '0').toString().replace(',', '.'));
                
                // Safe average parsing plus canonical basic-energy detection.
                const rawAvg = parseFloat(String(card.average_count || 0).replace(',', '.'));
                const totalCount = parseFloat(card.total_count) || 0;
                const decksWithCard = parseFloat(card.deck_count || card.deck_inclusion_count) || 0;
                const avgWhenUsed = Number.isFinite(rawAvg) && rawAvg > 0
                    ? rawAvg
                    : (decksWithCard > 0 ? (totalCount / decksWithCard) : 1);

                const canonicalCard = window.cardIndexBySetNumber
                    ? window.cardIndexBySetNumber.get(`${card.set_code}-${card.set_number}`)
                    : null;
                const isBasicEnergy = isBasicEnergyCardEntry(canonicalCard || card);

                let addCount = Math.round(avgWhenUsed);
                if (!isBasicEnergy) {
                    addCount = Math.min(4, Math.max(1, addCount));
                } else {
                    addCount = Math.max(1, addCount);
                }
                
                // Don't exceed deck limit (60 total cards)
                addCount = Math.min(addCount, 60 - currentTotal);
                
                if (addCount > 0) {
                    cardsToAdd.push({ ...card, addCount: addCount });
                    addedNames.add(cardName);
                    currentTotal += addCount;
                    console.log(`[autoComplete] ? ${addCount}x ${cardName} (${percentage.toFixed(1)}%, avg: ${avgWhenUsed.toFixed(1)}x) - Total: ${currentTotal}/60`);
                }
            }
            
            
            console.log('[autoComplete] Total cards to add:', currentTotal, 'in', cardsToAdd.length, 'unique entries');
            
            // Show summary grouped by type
            let summary = `Auto-Complete will add ${currentTotal} cards:\n\n`;
            let pokemon = [], trainer = [], energy = [];
            
            cardsToAdd.forEach(card => {
                const cardType = card.type || card.card_type || '';
                const category = getCardTypeCategory(cardType);
                const line = `${card.addCount}x ${card.card_name}`;
                
                if (category === 'Pokemon') pokemon.push(line);
                else if (category === 'Energy') energy.push(line);
                else trainer.push(line);
            });
            
            if (pokemon.length > 0) summary += `Pokémon:\n${pokemon.join('\n')}\n\n`;
            if (trainer.length > 0) summary += `Trainer:\n${trainer.join('\n')}\n\n`;
            if (energy.length > 0) summary += `Energy:\n${energy.join('\n')}`;
            
            if (confirm(summary + '\n\nContinue?')) {
                // Add all cards to deck using PREFERRED versions (newest low-rarity)
                cardsToAdd.forEach(card => {
                    // CRITICAL: Get preferred version for this card to match Grid View display
                    const originalSetCode = card.set_code || '';
                    const originalSetNumber = card.set_number || '';
                    const preferredVersion = getPreferredVersionForCard(card.card_name, originalSetCode, originalSetNumber);
                    
                    let setCode, setNumber;
                    if (preferredVersion) {
                        setCode = preferredVersion.set;
                        setNumber = preferredVersion.number;
                        console.log(`[autoComplete] Using PREFERRED version for ${card.card_name}: ${setCode} ${setNumber} (${preferredVersion.rarity})`);
                    } else {
                        // Fallback to original if no preferred version found
                        setCode = originalSetCode;
                        setNumber = originalSetNumber;
                        console.log(`[autoComplete] No preferred version for ${card.card_name}, using original: ${setCode} ${setNumber}`);
                    }
                    
                    // ?? PERFORMANCE: Use batch add (no display updates per card)
                    for (let i = 0; i < card.addCount; i++) {
                        addCardToDeckBatch(source, card.card_name, setCode, setNumber);
                    }
                });
                console.log('[autoComplete] Deck completed with rarity mode:', globalRarityPreference);
                
                // Save deck to localStorage
                if (source === 'cityLeague') {
                    saveCityLeagueDeck();
                } else if (source === 'currentMeta') {
                    saveCurrentMetaDeck();
                } else if (source === 'pastMeta') {
                    savePastMetaDeck();
                }
                
                // ?? PERFORMANCE: Update display ONCE at the end (not 60 times!)
                updateDeckDisplay(source);
            }
        }
        
        /**
         * Auto-Complete with Max Consistency Algorithm
         * Based on Justin Basil's Professional Deck Building Guide:
         * - Deck Skeleton: 20 Pokemon, 30 Trainer, 10 Energy (+-3 deviation normal)
         * - Opening Hand Probabilities: 4x = 40%, 3x = 32%, 2x = 22%, 1x = 12%
         * - Consistency Score = (Share %) * (Avg Count) * (Reliability Factor) * (Meta Relevance Factor)
         * - Meta Relevance: Cards with high meta-share are prioritized (tech cards against meta)
         * - Smart Copy Counts based on usage patterns and probability math
         */
        
        // Helper: Get meta share for a card (if meta analysis is loaded)
        function getMetaShareForCard(cardName, source) {
            const metaData = source === 'cityLeague' ? metaCardData.cityLeague : 
                           source === 'currentMeta' ? metaCardData.currentMeta : null;
            
            if (!metaData || metaData.length === 0) return 0;
            
            const metaCard = metaData.find(c => c.card_name === cardName);
            return metaCard ? metaCard.metaShare : 0;
        }

        function resolveBuilderTotalDecks(source, currentArchetype, rawCards, uniqueCards) {
            const explicitTotals = (rawCards || [])
                .map(card => parseInt(card.total_decks_in_archetype || card.total_decks || 0, 10))
                .filter(value => Number.isFinite(value) && value > 0);

            const inferredDeckCount = Object.values(uniqueCards || {}).reduce((maxValue, card) => {
                const deckCount = parseInt(card.deck_count || card.deck_inclusion_count || 0, 10) || 0;
                return Math.max(maxValue, deckCount);
            }, 0);

            const cityLeagueFallback = source === 'cityLeague'
                ? getCityLeagueDeckCountFallback(currentArchetype)
                : 0;

            return Math.max(1, cityLeagueFallback, inferredDeckCount, ...explicitTotals);
        }
        
        function autoCompleteConsistency(source, rarityMode) {
            if (source !== 'cityLeague' && source !== 'currentMeta' && source !== 'pastMeta') return;
            
            // Clear specific rarity preferences before generating
            rarityPreferences = {};
            saveRarityPreferences();
            
            // Set global rarity preference
            if (rarityMode) {
                globalRarityPreference = rarityMode;
            }
            
            let cardsKey, cards;
            if (source === 'cityLeague') {
                cardsKey = 'currentCityLeagueDeckCards';
                cards = window[cardsKey];
            } else if (source === 'currentMeta') {
                cardsKey = 'currentCurrentMetaDeckCards';
                cards = window[cardsKey];
            } else if (source === 'pastMeta') {
                cards = pastMetaCurrentCards;
            }
            
            if (!cards || cards.length === 0) {
                alert('No cards to add!');
                return;
            }
            
            console.log('[autoCompleteConsistency] ?? Starting CONSISTENCY-based deck generation');
            console.log('[autoCompleteConsistency] Total available cards:', cards.length);
            
            // Clear existing deck
            console.log('[autoCompleteConsistency] ??? Clearing existing deck...');
            if (source === 'cityLeague') {
                window.cityLeagueDeck = {};
                window.cityLeagueDeckOrder = [];
                saveCityLeagueDeck();
            } else if (source === 'currentMeta') {
                window.currentMetaDeck = {};
                window.currentMetaDeckOrder = [];
                saveCurrentMetaDeck();
            } else if (source === 'pastMeta') {
                window.pastMetaDeck = {};
                window.pastMetaDeckOrder = [];
                savePastMetaDeck();
            }
            
            // Get current archetype
            let currentArchetype;
            if (source === 'cityLeague') {
                currentArchetype = window.currentCityLeagueArchetype;
            } else if (source === 'currentMeta') {
                currentArchetype = window.currentCurrentMetaArchetype;
            } else if (source === 'pastMeta') {
                currentArchetype = window.pastMetaCurrentArchetype;
            }
            console.log('[autoCompleteConsistency] Building consistency deck for:', currentArchetype);
            
            // Get deck reference
            let deck;
            if (source === 'cityLeague') {
                deck = window.cityLeagueDeck;
            } else if (source === 'currentMeta') {
                deck = window.currentMetaDeck;
            } else if (source === 'pastMeta') {
                deck = window.pastMetaDeck;
            }
            let currentTotal = 0;
            
            // Basic Energy identification
            const isBaseEnergy = (card) => {
                const type = (card.type || card.card_type || '').toLowerCase();
                return type === 'energy' && (card.card_name || '').match(/^(Fire|Water|Grass|Lightning|Psychic|Fighting|Darkness|Metal|Fairy|Dragon|Colorless|Neutral)\s+Energy$/i);
            };
            
            // Step 1: Aggregate cards by card_name
            const uniqueCards = {};
            for (const card of cards) {
                const cardName = fixCardNameEncoding((card.card_name || card.full_card_name || card.name || '').toString().trim());
                if (!cardName) {
                    continue;
                }

                const deckCountValue = parseInt(card.deck_count || card.deck_inclusion_count || 0) || 0;
                const totalCountValue = parseFloat(card.total_count || 0) || 0;

                if (!uniqueCards[cardName]) {
                    uniqueCards[cardName] = {
                        ...card,
                        card_name: cardName,
                        deck_count: deckCountValue,
                        total_count: totalCountValue
                    };
                } else {
                    uniqueCards[cardName].deck_count += deckCountValue;
                    uniqueCards[cardName].total_count += totalCountValue;
                }
            }
            
            const resolvedTotalDecks = resolveBuilderTotalDecks(source, currentArchetype, cards, uniqueCards);

            // Recalculate percentage for aggregated data
            for (const cardName in uniqueCards) {
                const card = uniqueCards[cardName];
                const deckCount = card.deck_count;
                const percentage = Math.min(100, Math.max(0, (deckCount / resolvedTotalDecks) * 100));
                card.total_decks_in_archetype = resolvedTotalDecks;
                card.percentage_in_archetype = percentage.toFixed(2).replace('.', ',');
            }
            
            let deckCards = Object.values(uniqueCards);
            console.log('[autoCompleteConsistency] After aggregation:', deckCards.length, 'unique cards');
            
            // Step 2: Compute per-card statistics
            deckCards.forEach(card => {
                const sharePercent = Math.min(100, Math.max(0, parseFloat((card.percentage_in_archetype || '0').toString().replace(',', '.')) || 0));
                const totalCount = parseFloat(card.total_count) || 1;
                const deckCount = parseInt(card.deck_count) || 1;
                const avgCountWhenUsed = totalCount / deckCount;
                const metaShare = getMetaShareForCard(card.card_name, source);
                card.sharePercent = sharePercent;
                card.avgCountWhenUsed = avgCountWhenUsed;
                card.metaShare = metaShare;
                // Score: archetype share dominates; meta share breaks ties
                card.score = sharePercent + (metaShare * 0.1);
            });

            // Kaskaden-Logik mit Encoding-healed Vergleichen und harter 4x Sanity-Rule.
            const canonicalName = (value) => fixCardNameEncoding((value || '').toString().trim()).toLowerCase();
            const cardsToAddMap = new Map();
            let aceSpecAdded = false;

            const pushCard = (card, desiredCount, logPrefix = '[Consistency]') => {
                if (!card || currentTotal >= 60) return;

                const healedName = fixCardNameEncoding((card.card_name || '').toString().trim());
                if (!healedName) return;

                const key = canonicalName(healedName);
                const basicEnergy = isBaseEnergy(card);
                const perCardCap = basicEnergy ? 60 : 4;
                const existing = cardsToAddMap.get(key);

                if (isAceSpec(card)) {
                    if (aceSpecAdded && !existing) return;
                }

                const existingCount = existing ? existing.addCount : 0;
                const targetCount = Math.max(0, Math.round(desiredCount || 0));
                const remainingForCard = Math.max(0, perCardCap - existingCount);
                const remainingDeckSpace = Math.max(0, 60 - currentTotal);
                const addCount = Math.min(targetCount, remainingForCard, remainingDeckSpace);
                if (addCount <= 0) return;

                if (existing) {
                    existing.addCount += addCount;
                    cardsToAddMap.set(key, existing);
                } else {
                    cardsToAddMap.set(key, {
                        ...card,
                        card_name: healedName,
                        addCount
                    });
                }

                if (isAceSpec(card)) {
                    aceSpecAdded = true;
                }

                currentTotal += addCount;
                console.log(`${logPrefix} + ${addCount}x ${healedName} (Share: ${card.sharePercent.toFixed(1)}%, Avg: ${card.avgCountWhenUsed.toFixed(2)}x) -- Total: ${currentTotal}/60`);
            };

            const shareSorted = deckCards
                .filter(card => card.sharePercent > 0)
                .sort((a, b) => b.sharePercent - a.sharePercent);

            const getRoundedAverageCount = (card, ensureMinimumOne = false) => {
                const averageCount = Number.isFinite(card?.avgCountWhenUsed) ? card.avgCountWhenUsed : 0;
                const roundedCount = Math.round(averageCount);
                return ensureMinimumOne ? Math.max(1, roundedCount) : roundedCount;
            };

            // Stufe 1: >90% Archetype Share
            shareSorted
                .filter(card => card.sharePercent > 90)
                .forEach(card => {
                    const avgCount = getRoundedAverageCount(card, true);
                    pushCard(card, avgCount, '[Consistency][Stage1]');
                });

            // Stufe 2: >70% Archetype Share (nur wenn Deck noch <50)
            if (currentTotal < 50) {
                shareSorted
                    .filter(card => card.sharePercent > 70)
                    .forEach(card => {
                        const avgCount = getRoundedAverageCount(card, true);
                        pushCard(card, avgCount, '[Consistency][Stage2]');
                    });
            }

            // Global Meta Boost (Watchtower-Prinzip)
            if (currentTotal < 60) {
                const globalStatsRaw = Array.isArray(window.metaCardStats)
                    ? window.metaCardStats
                    : (window.metaCardStats && Array.isArray(window.metaCardStats[source])
                        ? window.metaCardStats[source]
                        : (Array.isArray(metaCardData?.[source]) ? metaCardData[source] : []));

                const globalStats = (globalStatsRaw || [])
                    .map(entry => {
                        const name = fixCardNameEncoding((entry.card_name || entry.name || '').toString().trim());
                        const globalShare = parseFloat(String(entry.metaShare || entry.globalShare || entry.share || 0).replace(',', '.')) || 0;
                        return { name, key: canonicalName(name), globalShare };
                    })
                    .filter(entry => entry.key && entry.globalShare > 15)
                    .sort((a, b) => b.globalShare - a.globalShare);

                const archetypeMap = new Map(
                    deckCards
                        .filter(card => card.sharePercent > 0)
                        .map(card => [canonicalName(card.card_name), card])
                );

                globalStats.forEach(globalEntry => {
                    if (currentTotal >= 60) return;
                    const archetypeCard = archetypeMap.get(globalEntry.key);
                    if (!archetypeCard) return;

                    const boostCount = getRoundedAverageCount(archetypeCard, true);
                    console.log(`[Consistency] Meta-Boost: Adding ${archetypeCard.card_name} because it is a global staple.`);
                    pushCard(archetypeCard, boostCount, '[Consistency][MetaBoost]');
                });
            }

            // Fallback: Fill remaining slots with highest-share cards (respecting 4x limit except basic energy).
            if (currentTotal < 60) {
                shareSorted.forEach(card => {
                    if (currentTotal >= 60) return;
                    pushCard(card, 1, '[Consistency][Fallback]');
                });
            }

            // Final fallback for empty-share edge cases: use top basic energy if available.
            if (currentTotal < 60) {
                const topBasicEnergy = deckCards
                    .filter(card => isBaseEnergy(card))
                    .sort((a, b) => b.sharePercent - a.sharePercent)[0];
                if (topBasicEnergy) {
                    pushCard(topBasicEnergy, 60 - currentTotal, '[Consistency][EnergyFill]');
                }
            }

            let cardsToAdd = Array.from(cardsToAddMap.values());

            // Keep output deterministic.
            cardsToAdd.sort((a, b) => {
                if (b.sharePercent !== a.sharePercent) return b.sharePercent - a.sharePercent;
                return a.card_name.localeCompare(b.card_name);
            });

            console.log(`[autoCompleteConsistency] Deck complete: ${currentTotal}/60`);

            // Build confirm summary
            let summary = `MAX CONSISTENCY Deck (${currentTotal} cards):\n`;
            summary += `Algorithm: >90% -> >70% -> Meta-Boost (>15% global)\n\n`;
            cardsToAdd.forEach(c => {
                summary += `${c.addCount}x ${c.card_name} (${c.sharePercent.toFixed(0)}% archetype)\n`;
            });
            summary += `\nContinue?`;

            if (confirm(summary)) {
                cardsToAdd.forEach(card => {
                    const cardName = fixCardNameEncoding((card.card_name || '').toString().trim());
                    if (!cardName) return;
                    const originalSetCode = card.set_code || '';
                    const originalSetNumber = card.set_number || '';
                    const preferredVersion = getPreferredVersionForCard(cardName, originalSetCode, originalSetNumber);
                    let setCode, setNumber;
                    if (preferredVersion) {
                        setCode = preferredVersion.set;
                        setNumber = preferredVersion.number;
                    } else {
                        setCode = originalSetCode;
                        setNumber = originalSetNumber;
                    }
                    for (let i = 0; i < card.addCount; i++) {
                        addCardToDeckBatch(source, cardName, setCode, setNumber);
                    }
                });

                console.log('[autoCompleteConsistency] Consistency deck completed with rarity mode:', globalRarityPreference);

                if (source === 'cityLeague') {
                    saveCityLeagueDeck();
                } else if (source === 'currentMeta') {
                    saveCurrentMetaDeck();
                } else if (source === 'pastMeta') {
                    savePastMetaDeck();
                }

                updateDeckDisplay(source);

                if (currentTotal >= 60) {
                    if (typeof showDeckShareToast === 'function') {
                        showDeckShareToast('✅ Optimale Liste generiert! (Core-Karten + Meta-Techs)');
                    } else {
                        alert('✅ Optimale Liste generiert! (Core-Karten + Meta-Techs)');
                    }
                }
            }
        }
        
        // ---------------------------------------------------------------
        // META CARD ANALYSIS (Cross-Archetype Analysis)
        // ---------------------------------------------------------------
        
        let metaCardData = {
            cityLeague: [],
            currentMeta: []
        };
        
        let metaCardFilter = {
            cityLeague: { shareThreshold: 'all', cardType: 'all', sortBy: 'type', searchTerm: '' },
            currentMeta: { shareThreshold: 'all', cardType: 'all', sortBy: 'type', searchTerm: '' }
        };
        
        async function loadMetaCardAnalysis(source) {
            console.log('[loadMetaCardAnalysis] Loading meta analysis for:', source);
            
            const gridId = source === 'cityLeague' ? 'cityLeagueMetaGrid' : 'currentMetaMetaGrid';
            const grid = document.getElementById(gridId);
            grid.innerHTML = '<p style="text-align: center; padding: 40px; grid-column: 1 / -1;">Loading top 10 archetypes...</p>';
            
            try {
                // ? FIX: Use comparison data for correct Top 10, then analysis data for cards
                const timestamp = new Date().getTime();
                
                // Load comparison data (has correct unique deck counts per archetype)
                const comparisonFile = source === 'cityLeague' ? 'city_league_archetypes_comparison.csv' : 'limitless_online_decks_comparison.csv';
                const archetypeField = source === 'cityLeague' ? 'archetype' : 'deck_name'; // City League uses 'archetype', Current Meta uses 'deck_name'
                
                const comparisonResponse = await fetch(`${BASE_PATH}${comparisonFile}?t=${timestamp}`);
                if (!comparisonResponse.ok) throw new Error('Failed to load comparison data');
                const comparisonText = await comparisonResponse.text();
                const comparisonData = parseCSV(comparisonText);
                
                console.log('[loadMetaCardAnalysis] Loaded', comparisonData.length, 'archetypes from comparison CSV');
                
                // Get Top 10 archetypes by new_count (unique deck count)
                const top10Archetypes = comparisonData
                    .filter(row => row[archetypeField] && row.new_count)
                    .map(row => ({
                        name: row[archetypeField],
                        deckCount: parseInt(row.new_count) || 0
                    }))
                    .sort((a, b) => b.deckCount - a.deckCount)
                    .slice(0, 10);
                
                console.log('[loadMetaCardAnalysis] Top 10 archetypes:', top10Archetypes.map(a => `${a.name} (${a.deckCount} decks)`));
                
                const top10Names = new Set(top10Archetypes.map(a => a.name.toLowerCase()));
                const totalDecksInTop10 = top10Archetypes.reduce((sum, a) => sum + a.deckCount, 0);
                const safeTotalDecksInTop10 = Math.max(1, Math.floor(totalDecksInTop10));
                
                console.log('[loadMetaCardAnalysis] Total unique decks in Top 10:', totalDecksInTop10);
                
                // Load analysis data (has cards per archetype)
                const analysisFile = source === 'cityLeague' ? 'city_league_analysis.csv' : 'current_meta_card_data.csv';
                const analysisResponse = await fetch(`${BASE_PATH}${analysisFile}?t=${timestamp}`);
                if (!analysisResponse.ok) throw new Error('Failed to load analysis data');
                const analysisText = await analysisResponse.text();
                const allAnalysisData = parseCSV(analysisText);
                if (source === 'currentMeta') {
                    healCurrentMetaCardRows(allAnalysisData);
                }
                
                console.log('[loadMetaCardAnalysis] Loaded', allAnalysisData.length, 'card entries from analysis CSV');
                
                // Filter to only Top 10 archetypes
                const top10AnalysisData = allAnalysisData.filter(row => {
                    const arch = (row.archetype || '').toLowerCase();
                    return top10Names.has(arch);
                });
                
                console.log('[loadMetaCardAnalysis] Filtered to', top10AnalysisData.length, 'card entries from Top 10');
                
                // Build map of archetype -> deckCount from comparison data
                const archetypeMap = {};
                top10Archetypes.forEach(arch => {
                    archetypeMap[arch.name.toLowerCase()] = arch.deckCount;
                });
                
                // Aggregate cards: Calculate average percentage per archetype, then multiply by total deck count
                const cardArchetypeMap = {}; // card -> archetype -> {percentages[], dates[]}
                
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
                            percentages: [],
                            copiesWhenUsed: [],
                            deckCount: archetypeDeckCount
                        };
                    }

                    // Prefer exact total_count/deck_count, then per-row average_count fallback.
                    let copiesPerDeckWhenUsed = 0;
                    if (deckCount > 0 && totalCount > 0) {
                        copiesPerDeckWhenUsed = totalCount / deckCount;
                    } else if (avgCountWhenUsed > 0) {
                        copiesPerDeckWhenUsed = avgCountWhenUsed;
                    } else if (avgCountOverall > 0 && archetypeDeckCount > 0 && safePercentage > 0) {
                        const impliedDecksWithCard = (safePercentage / 100) * archetypeDeckCount;
                        copiesPerDeckWhenUsed = impliedDecksWithCard > 0
                            ? (avgCountOverall * archetypeDeckCount) / impliedDecksWithCard
                            : 0;
                    }
                    
                    cardArchetypeMap[cardName].byArchetype[archetypeLower].percentages.push(percentage);
                    cardArchetypeMap[cardName].byArchetype[archetypeLower].copiesWhenUsed.push(
                        Number.isFinite(copiesPerDeckWhenUsed) && copiesPerDeckWhenUsed > 0 ? copiesPerDeckWhenUsed : 0
                    );
                });
                
                console.log('[loadMetaCardAnalysis] Aggregated', Object.keys(cardArchetypeMap).length, 'unique cards');
                
                // Calculate meta-wide stats
                const metaCards = Object.values(cardArchetypeMap).map(cardData => {
                    let totalDecksWithCard = 0;
                    let totalCopies = 0;
                    const archetypes = [];
                    
                    // For each archetype this card appears in
                    Object.values(cardData.byArchetype).forEach(archData => {
                        // Average percentage across all tournament dates
                        const avgPercentageRaw = archData.percentages.reduce((sum, p) => sum + p, 0) / archData.percentages.length;
                        const avgPercentage = Math.min(100, Math.max(0, avgPercentageRaw));
                        
                        // Estimated decks with this card = avgPercentage * total archetype deck count
                        const estimatedDecksRaw = (avgPercentage / 100) * archData.deckCount;
                        const estimatedDecks = Math.min(archData.deckCount, Math.max(0, estimatedDecksRaw));
                        
                        // Average copies in decks that use this card, ignoring invalid per-row zero fallbacks.
                        const validCopies = (archData.copiesWhenUsed || []).filter(v => Number.isFinite(v) && v > 0);
                        const avgCopiesPerDeckWhenUsed = validCopies.length > 0
                            ? validCopies.reduce((sum, v) => sum + v, 0) / validCopies.length
                            : 0;
                        
                        totalDecksWithCard += estimatedDecks;
                        totalCopies += estimatedDecks * avgCopiesPerDeckWhenUsed;
                        
                        archetypes.push({
                            name: archData.name,
                            deckCount: Math.round(estimatedDecks),
                            totalDecks: archData.deckCount,
                            percentage: avgPercentage.toFixed(1)
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
                        avgCount: safeTotalDecksInTop10 > 0 ? totalCopies / safeTotalDecksInTop10 : 0,
                        avgCountWhenUsed: totalDecksWithCard > 0 ? totalCopies / totalDecksWithCard : 0,
                        archetypes: archetypes
                    };
                });

                // Meta Card Analysis should always show the latest low-rarity print.
                // Force 'min' resolution here so it is independent from current UI rarity settings.
                const previousGlobalRarityPreference = globalRarityPreference;
                globalRarityPreference = 'min';
                metaCards.forEach(card => {
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
                
                // Debug: Log a sample card
                const sampleCard = metaCards.find(c => c.card_name.includes('Boss'));
                if (sampleCard) {
                    console.log('[loadMetaCardAnalysis] Sample card:', sampleCard.card_name);
                    console.log('  ? metaShare:', sampleCard.metaShare.toFixed(2) + '%', `(${sampleCard.totalDecksWithCard} decks / ${totalDecksInTop10} total)`);
                    console.log('  ? archetypes:', sampleCard.archetypes.slice(0, 3).map(a => `${a.name} (${a.percentage}%)`));
                }
                
                metaCardData[source] = metaCards;
                console.log('[loadMetaCardAnalysis] Loaded', metaCards.length, 'unique cards from Top 10 archetypes');
                
                renderMetaCards(source);
                
            } catch (error) {
                console.error('[loadMetaCardAnalysis] Error:', error);
                grid.innerHTML = '<p style="text-align: center; color: #dc3545; padding: 40px; grid-column: 1 / -1;">? Error loading meta analysis</p>';
            }
        }
        
        function renderMetaCards(source) {
            const gridId = source === 'cityLeague' ? 'cityLeagueMetaGrid' : 'currentMetaMetaGrid';
            const countId = source === 'cityLeague' ? 'cityLeagueMetaCardCount' : 'currentMetaMetaCardCount';
            const grid = document.getElementById(gridId);
            const countSpan = document.getElementById(countId);
            
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
                    cards = cards.filter(c => getCardTypeCategory(c.type) === 'Energy');
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
            
            console.log(`[renderMetaCards] After filters: ${cards.length} cards remaining (from ${metaCardData[source].length} total)`);
            if (cards.length > 0) {
                console.log(`[renderMetaCards] Top 5 cards by meta share:`, cards.slice(0, 5).map(c => `${c.card_name}: ${c.metaShare.toFixed(1)}%`));
            }
            
            // Sort
            if (filter.sortBy === 'share') {
                cards.sort((a, b) => b.metaShare - a.metaShare);
            } else if (filter.sortBy === 'avgCount') {
                cards.sort((a, b) => b.avgCount - a.avgCount);
            } else if (filter.sortBy === 'type') {
                // Sort by card type category (Pokemon, Supporter, Item, Tool, Stadium, Energy)
                const typeOrder = { 'Pokemon': 0, 'Supporter': 1, 'Item': 2, 'Tool': 3, 'Stadium': 4, 'Special Energy': 5, 'Energy': 6 };
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
                const cardNameEscaped = card.card_name.replace(/'/g, "\\'");
                
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
                            <img src="${imageUrl}" alt="${card.card_name}" loading="lazy" style="width: 100%; aspect-ratio: 2.5/3.5; object-fit: cover; cursor: zoom-in;" onerror="handleCardImageError(this, '${card.set_code || ''}', '${card.set_number || ''}', '${fallbackUrl}')" onclick="if (typeof event !== 'undefined' && event) event.stopPropagation(); showSingleCard(this.src, '${cardNameEscaped}');"
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
                                
                                <!-- Action Buttons: - | ? | + -->
                                <div class="card-action-buttons" style="display: grid; grid-template-columns: 1fr 2fr 1fr; gap: 3px;">
                                    <button onclick="event.stopPropagation(); removeCardFromDeck('${source}', '${cardNameEscaped}')" style="background: #dc3545; color: white; border: none; border-radius: 4px; padding: 6px 8px; cursor: pointer; font-weight: bold; font-size: 14px; transition: all 0.2s;" onmouseover="this.style.background='#c82333'" onmouseout="this.style.background='#dc3545'" title="Remove from deck">-</button>
                                    <button onclick="event.stopPropagation(); openRaritySwitcher('${cardNameEscaped}', '${cardNameEscaped} (${card.set_code} ${card.set_number})')" style="background: #ffc107; color: #333; border: none; border-radius: 4px; padding: 6px 8px; cursor: pointer; font-weight: bold; font-size: 12px; transition: all 0.2s;" onmouseover="this.style.background='#e0a800'" onmouseout="this.style.background='#ffc107'" title="Switch rarity/print">★</button>
                                    <button onclick="event.stopPropagation(); addCardToDeck('${source}', '${cardNameEscaped}', '${card.set_code}', '${card.set_number}')" style="background: #28a745; color: white; border: none; border-radius: 4px; padding: 6px 8px; cursor: pointer; font-weight: bold; font-size: 14px; transition: all 0.2s;" onmouseover="this.style.background='#218838'" onmouseout="this.style.background='#28a745'" title="Add to deck">+</button>
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
            const title = `<div style="font-weight: bold; margin-bottom: 8px; color: #ffd700; border-bottom: 1px solid rgba(255,255,255,0.3); padding-bottom: 6px;">${cardName}</div>`;
            const archetypeItems = archetypes
                .sort((a, b) => parseFloat(b.percentage) - parseFloat(a.percentage))
                .map(a => `
                    <div style="padding: 4px 0; display: flex; justify-content: space-between; gap: 15px;">
                        <span style="color: #ddd;">${a.name}</span>
                        <span style="color: #ffd700; font-weight: bold;">${a.percentage}%</span>
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
            
            console.log(`[searchDeckCards] Search term: "${searchTerm}", found ${uniqueNames.length} unique cards (${matchingCards.length} versions)`);
            
            if (uniqueNames.length === 0) {
                resultsContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #444; font-weight: 500;">No cards found</div>';
                return;
            }
            
            // Build list of card names (limit to 20)
            const limitedNames = uniqueNames.slice(0, 20);
            let html = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 6px;">';
            
            limitedNames.forEach(cardName => {
                const cardNameEscaped = cardName.replace(/'/g, "\\'");
                const versionsCount = matchingCards.filter(c => c.name === cardName).length;
                const deck = source === 'cityLeague' ? (window.cityLeagueDeck || {}) : (window.currentMetaDeck || {});
                const currentCount = deck[cardName] || 0;
                
                // Get first version for thumbnail image
                const firstVersion = matchingCards.find(c => c.name === cardName);
                const imageUrl = firstVersion ? getUnifiedCardImage(firstVersion.set, firstVersion.number) : '';
                
                html += `
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
            
            html += '</div>';
            resultsContainer.innerHTML = html;
        }
        
        function selectCardName(cardName, source = 'cityLeague') {
            window.selectedCardName = cardName;
            searchDeckCards(source); // Refresh to show versions
        }
        
        function showCardVersions(cardName, container, source = 'cityLeague') {
            const allCards = window.allCardsDatabase || [];
            const versions = allCards.filter(c => c.name === cardName);
            
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
            html += `<div style="font-weight: bold; color: #333;">?? ${cardName}</div>`;
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
                const cardNameEscaped = cardName.replace(/'/g, "\\'");
                
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
                console.log(`?? Loaded ${scriptsExecuted} matchup data scripts`);
                
                // Verify that matchup data was loaded
                const matchupVars = Object.keys(window).filter(k => k.startsWith('matchupData_'));
                console.log(`? Available matchup variables: ${matchupVars.length}`);
                
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
                                console.log('? Removed inline grid styles from matchup container');
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
                    
                    console.log('? Current Meta data loaded successfully');
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
            console.log('\u2705 Matchup box tables patched');
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
                    console.log('?? Patching Full Comparison Table...');
                    
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
                    });
                    
                    console.log('? Full Comparison Table patched successfully');
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
                    .map(d => `<span style="color: white; font-weight: 600;">${d.name}</span> (${d.count.toLocaleString()})`)
                    .join('<br>');
                
                const top3ByWinRateHtml = decksByWinRate
                    .map(d => `<span style="color: white; font-weight: 600;">${d.name}</span> (${d.winRate.toFixed(1)}%)`)
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
                        
                        console.log('? Archetype Overview patched:', {
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
                            console.log(`?? Loaded format from settings: ${currentFormat}`);
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
                            console.log(`? Format updated to: ${currentFormat}`);
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
                        
                        console.log('? Meta stats patched:', {
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

        // Render Interactive Matchup Heatmap
        function renderMatchupHeatmap() {
            try {
                console.log('🔥 Rendering Matchup Heatmap...');

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
                    console.log(`🔍 Suche aktiv: Y='${rawSearchY || '-'}' (${yDecks.length}), X='${rawSearchX || '-'}' (${xDecks.length})`);
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
                
                console.log(`🔥 Heatmap-Decks: X-Achse=${xDecks.length}, Y-Achse=${yDecks.length}`);
                
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
                        
                        // Flexibles Auslesen der Winrate
                        const winRateStr = cellData.winRate || cellData.winrate || cellData.win_rate || cellData.wr;
                        let winRate = parseFloat(winRateStr);
                        
                        // Fallback: Winrate selbst berechnen
                        if (isNaN(winRate) && cellData.matches > 0 && cellData.wins !== undefined) {
                            winRate = (parseFloat(cellData.wins) / parseFloat(cellData.matches)) * 100;
                        } else if (isNaN(winRate) && (cellData.wins + cellData.losses) > 0) {
                            winRate = (parseFloat(cellData.wins) / (cellData.wins + cellData.losses)) * 100;
                        }
                        
                        if (isNaN(winRate)) {
                            tableHtml += '<td style="background: rgba(149, 165, 166, 0.15); color: #95a5a6; padding: 10px 6px; text-align: center; font-weight: 600; border: 1px solid #ddd;">-</td>';
                        } else {
                            const totalGames = (cellData.wins || 0) + (cellData.losses || 0);
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
                            
                            const tooltip = `${cellData.wins || 0}W - ${cellData.losses || 0}L (${totalGames} games)`;
                            tableHtml += `<td style="background: ${bgColor}; color: ${textColor}; padding: 10px 6px; text-align: center; font-weight: 600; border: 1px solid #ddd; cursor: help; transition: all 0.2s;" title="${tooltip}" onmouseover="this.style.transform='scale(1.1)'; this.style.zIndex='10'; this.style.boxShadow='0 4px 8px rgba(0,0,0,0.2)'" onmouseout="this.style.transform='scale(1)'; this.style.zIndex='1'; this.style.boxShadow='none'">${winRate.toFixed(1)}%</td>`;
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
                
                console.log('✅ Matchup Heatmap rendered successfully');
                
            } catch (error) {
                console.error('❌ Error rendering Matchup Heatmap:', error);
            }
        }



        
        // Load Current Analysis
        async function loadCurrentAnalysis() {
            console.log('?? Loading Current Meta Analysis Tab...');
            
            // Load Current Meta HTML (for matchup data) if not already loaded
            if (!window.currentMetaLoaded) {
                console.log('?? Loading Current Meta HTML for matchup data...');
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
                console.log('?? No saved Current Meta deck found');
                return;
            }
            
            try {
                const data = JSON.parse(saved);
                console.log('? Loaded Current Meta deck from localStorage:', data);
                
                if (data.deck) {
                    window.currentMetaDeck = data.deck;
                }
                if (data.order) {
                    window.currentMetaDeckOrder = data.order;
                }
                if (data.archetype) {
                    window.currentCurrentMetaArchetype = data.archetype;
                    // Pre-select archetype in dropdown if it exists (but don't display deck yet)
                    console.log('?? Saved archetype found:', data.archetype, '(waiting for user to select archetype)');
                }
                
                // DON'T automatically display deck - wait for archetype selection
                console.log('?? Current Meta Deck loaded but not displayed (waiting for archetype selection)');
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
                    console.log('?? Current Meta deck is empty - removed from localStorage');
                    return;
                }
                
                const data = {
                    deck: deck,
                    order: window.currentMetaDeckOrder || [],
                    archetype: window.currentCurrentMetaArchetype || null,
                    timestamp: new Date().toISOString()
                };
                
                localStorage.setItem('currentMetaDeck', JSON.stringify(data));
                console.log('?? Current Meta deck saved to localStorage:', deckSize, 'cards');
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
                    console.log('?? Loaded Past Meta deck from localStorage:', Object.keys(window.pastMetaDeck).length, 'cards');
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
                    console.log('?? Past Meta deck is empty - removed from localStorage');
                    return;
                }
                
                const data = {
                    deck: deck,
                    order: window.pastMetaDeckOrder || [],
                    archetype: window.pastMetaCurrentArchetype || null,
                    timestamp: new Date().toISOString()
                };
                
                localStorage.setItem('pastMetaDeck', JSON.stringify(data));
                console.log('?? Past Meta deck saved to localStorage:', deckSize, 'cards');
            } catch (e) {
                console.error('? Error saving Past Meta deck:', e);
            }
        }
        
        // ====================================
        // PAST META - Deck Analysis & Builder
        // ====================================
        
        let pastMetaAllData = [];
        let pastMetaDecks = [];
        let pastMetaTournaments = [];
        let pastMetaCurrentDeck = null;
        let pastMetaCurrentCards = [];
        let pastMetaFilteredCards = [];
        let pastMetaRarityMode = 'min'; // 'min', 'max', 'all'
        let pastMetaShowGridView = true; // Default: Grid View

        function sanitizePastMetaArchetypeName(value) {
            const raw = String(value || '').trim();
            if (!raw) return 'Unknown Deck';

            // Remove trailing price artifacts such as "58.60$41.80€" from scraped deck labels.
            return raw
                .replace(/\s*\d+[.,]\d+\$\d+[.,]\d+€\s*$/u, '')
                .replace(/\s*\d+[.,]\d+€\s*$/u, '')
                .trim() || 'Unknown Deck';
        }

        function resetSelectWithPlaceholder(selectEl, placeholderText, placeholderValue) {
            if (!selectEl) return;
            selectEl.innerHTML = '';
            const placeholderOption = document.createElement('option');
            placeholderOption.value = placeholderValue;
            placeholderOption.textContent = placeholderText;
            selectEl.appendChild(placeholderOption);
        }

        function parsePastMetaNumber(value, fallback = 0) {
            if (value === null || value === undefined || value === '') return fallback;
            const raw = String(value).trim();
            if (!raw) return fallback;
            const normalized = raw.includes(',') && !raw.includes('.')
                ? raw.replace(',', '.')
                : raw;
            const parsed = Number.parseFloat(normalized);
            return Number.isFinite(parsed) ? parsed : fallback;
        }

        function normalizeCardAggregationKey(name) {
            return String(name || '')
                .toLowerCase()
                .replace(/[\u2019'`]/g, '')
                .replace(/\s+/g, ' ')
                .trim();
        }

        function parsePastMetaDateMs(dateValue) {
            if (!dateValue) return 0;
            const raw = String(dateValue).trim();
            if (!raw) return 0;

            const direct = new Date(raw);
            if (!Number.isNaN(direct.getTime())) {
                return direct.getTime();
            }

            const cleaned = raw.replace(/(\d+)(st|nd|rd|th)/gi, '$1');
            const fallback = new Date(cleaned);
            if (!Number.isNaN(fallback.getTime())) {
                return fallback.getTime();
            }

            return 0;
        }

        function getPastMetaSortScore(metaName, setOrderMap, latestDateMap) {
            const normalizedMeta = String(metaName || '').trim().toUpperCase();
            if (!normalizedMeta) return 0;

            const parts = normalizedMeta.split('-').map(p => p.trim()).filter(Boolean);
            const firstSet = parts[0] || '';
            const lastSet = parts[parts.length - 1] || '';
            const firstOrder = setOrderMap[firstSet] || 0;
            const lastOrder = setOrderMap[lastSet] || 0;
            const dateMs = latestDateMap.get(String(metaName || '').trim()) || 0;

            // Primary sort by ending-set recency (e.g. SVI-ASC > SVI-PFL), fallback by latest tournament date.
            if (lastOrder > 0 || firstOrder > 0) {
                return (lastOrder * 1000000) + (firstOrder * 1000) + Math.floor(dateMs / 1000000000);
            }

            return dateMs;
        }

        function derivePastMetaLabelFromSetCode(setCode, setOrderMap) {
            const code = String(setCode || '').trim().toUpperCase();
            if (!code) return '';
            if (code.includes('-')) return code;

            // Keep legacy/old-era set codes as-is; derive modern labels as SVI-<SET>.
            const svOrder = setOrderMap.SVI || setOrderMap.SVE || 0;
            const codeOrder = setOrderMap[code] || 0;
            if (svOrder > 0 && codeOrder > 0 && codeOrder >= svOrder) {
                return `SVI-${code}`;
            }

            return code;
        }
        
        async function loadPastMeta() {
            console.log('Loading Past Meta Deck Analysis...');
            
            // Load tournament overview and cards data
            const [tournamentOverview, cardsData] = await Promise.all([
                loadCSV('tournament_cards_data_overview.csv'),
                loadCSV('tournament_cards_data_cards.csv')
            ]);
            
            if (!cardsData || cardsData.length === 0) {
                const errorMsg = 'No past tournament data found';
                alert(errorMsg);
                console.error(errorMsg);
                return;
            }
            
            pastMetaAllData = cardsData;
            
            // Store tournament overview data
            pastMetaTournaments = tournamentOverview || [];

            // Load dynamic set order map for proper meta sorting (newest -> oldest)
            let pastMetaSetOrderMap = {};
            try {
                const ts = Date.now();
                const setOrderResponse = await fetch(`./data/sets.json?t=${ts}`);
                if (setOrderResponse.ok) {
                    const json = await setOrderResponse.json();
                    if (json && typeof json === 'object') {
                        pastMetaSetOrderMap = json;
                    }
                }
            } catch (e) {
                console.warn('[Past Meta] Could not load sets.json for format sorting, using date fallback.', e);
            }
            
            // CSV structure: meta (format), tournament_date, archetype (deck name!), card_name, ...
            // Some exports have empty meta/format columns; infer per DECK (tournament_date + archetype) from newest set_code
            const inferredMetaByDeck = new Map();
            cardsData.forEach(card => {
                const tournamentDate = String(card.tournament_date || '').trim();
                const deckArchetype = String(card.archetype || '').trim();
                const setCode = String(card.set_code || '').trim().toUpperCase();
                if (!tournamentDate || !deckArchetype || !setCode) return;

                const deckKey = `${tournamentDate}|||${deckArchetype}`;
                const nextOrder = pastMetaSetOrderMap[setCode] || 0;
                const current = inferredMetaByDeck.get(deckKey);
                const currentOrder = current ? (pastMetaSetOrderMap[current] || 0) : -1;

                if (nextOrder > currentOrder) {
                    inferredMetaByDeck.set(deckKey, setCode);
                }
            });

            // Group cards by tournament_date + archetype (deck archetype)
            const deckMap = new Map();
            cardsData.forEach(card => {
                const deckArchetype = sanitizePastMetaArchetypeName(card.archetype);
                const tournamentDate = card.tournament_date || 'Unknown Date';
                
                // Infer format per deck from the newest set code in this specific deck
                const deckMetaLookupKey = `${String(tournamentDate).trim()}|||${String(card.archetype || '').trim()}`;
                const inferredMetaSetCode = inferredMetaByDeck.get(deckMetaLookupKey) || '';
                const inferredMeta = derivePastMetaLabelFromSetCode(inferredMetaSetCode, pastMetaSetOrderMap);
                
                const tournament = pastMetaTournaments.find(t => {
                    if (!t || t.tournament_date !== tournamentDate) return false;
                    const cardMeta = String(card.meta || '').trim();
                    const overviewFormat = String(t.format || '').trim();
                    return !cardMeta || !overviewFormat || overviewFormat === cardMeta;
                });
                const resolvedFormat = String(card.meta || '').trim()
                    || String((tournament && tournament.format) || '').trim()
                    || inferredMeta
                    || 'Unknown';
                const deckKey = `${resolvedFormat}|||${tournamentDate}|||${deckArchetype}`;
                
                if (!deckMap.has(deckKey)) {
                    deckMap.set(deckKey, {
                        key: deckKey,
                        tournament_id: tournament ? tournament.tournament_id : tournamentDate,
                        tournament_name: tournament ? tournament.tournament_name : tournamentDate,
                        tournament_date: tournamentDate,
                        deck_name: deckArchetype,
                        archetype: deckArchetype,
                        format: resolvedFormat,
                        decklist_count: parseInt(card.total_decks_in_archetype || 1),
                        cards: []
                    });
                }
                deckMap.get(deckKey).cards.push({
                    ...card,
                    total_count: parsePastMetaNumber(card.total_count, 0),
                    card_count: parsePastMetaNumber(card.average_count_overall, 0),
                    average_count: parsePastMetaNumber(card.average_count, 0),
                    average_count_overall: parsePastMetaNumber(card.average_count_overall, 0),
                    percentage_in_archetype: parsePastMetaNumber(card.percentage_in_archetype, 0),
                    decklist_count: parseInt(card.total_decks_in_archetype || 1, 10) || 1,
                    deck_count: parseInt(card.deck_inclusion_count || card.deck_count || 0, 10) || 0,
                    deck_inclusion_count: parseInt(card.deck_inclusion_count || card.deck_count || 0, 10) || 0
                });
            });
            
            pastMetaDecks = Array.from(deckMap.values());
            
            // Build latest date per meta for robust fallback sorting.
            const metaLatestDateMap = new Map();
            cardsData.forEach(card => {
                const metaName = String(card.meta || '').trim();
                if (!metaName) return;
                const dateMs = parsePastMetaDateMs(card.tournament_date);
                const current = metaLatestDateMap.get(metaName) || 0;
                if (dateMs > current) {
                    metaLatestDateMap.set(metaName, dateMs);
                }
            });

            // Populate Format Filter
            const formats = [...new Set(pastMetaDecks.map(d => String(d.format || '').trim()).filter(f => f && f !== 'Unknown'))]
                .sort((a, b) => {
                    const scoreA = getPastMetaSortScore(a, pastMetaSetOrderMap, metaLatestDateMap);
                    const scoreB = getPastMetaSortScore(b, pastMetaSetOrderMap, metaLatestDateMap);
                    if (scoreA !== scoreB) return scoreB - scoreA;
                    return a.localeCompare(b);
                });

            const formatSelect = document.getElementById('pastMetaFormatFilter');
            resetSelectWithPlaceholder(formatSelect, '-- All Formats --', 'all');
            formats.forEach(format => {
                const option = document.createElement('option');
                option.value = String(format);
                option.textContent = String(format);
                formatSelect.appendChild(option);
            });
            
            // Populate Tournament Filter (will be updated dynamically)
            const tournamentSelect = document.getElementById('pastMetaTournamentFilter');
            
            // Setup event listeners - Format filter triggers tournament list update
            formatSelect.addEventListener('change', () => {
                updatePastMetaTournamentFilter();
                updatePastMetaDeckList();
            });
            tournamentSelect.addEventListener('change', updatePastMetaDeckList);
            document.getElementById('pastMetaDeckSearch').addEventListener('input', updatePastMetaDeckList);
            document.getElementById('pastMetaDeckSelect').addEventListener('change', onPastMetaDeckSelect);
            document.getElementById('pastMetaFilterSelect').addEventListener('change', filterPastMetaCards);
            
            // Initial population
            updatePastMetaTournamentFilter();
            updatePastMetaDeckList();
            
            // Initialize rarity mode button styling
            setPastMetaRarityMode('min');
            
            const tournamentCount = [...new Set(pastMetaDecks.map(d => d.tournament_id))].length;
            console.log(`? Loaded ${pastMetaDecks.length} decks from ${tournamentCount} tournaments`);
            window.pastMetaLoaded = true;
        }
        
        function updatePastMetaTournamentFilter() {
            const formatFilter = document.getElementById('pastMetaFormatFilter').value;
            const tournamentSelect = document.getElementById('pastMetaTournamentFilter');
            const previousSelection = tournamentSelect ? tournamentSelect.value : 'all';
            
            // Filter decks by selected format to get relevant tournaments
            let filteredDecks = pastMetaDecks;
            if (formatFilter !== 'all') {
                filteredDecks = pastMetaDecks.filter(deck => deck.format === formatFilter);
            }
            
            // Get unique tournament IDs from filtered decks
            const tournamentIds = [...new Set(filteredDecks.map(d => d.tournament_id))];
            
            // Get tournament details from pastMetaTournaments
            const tournaments = tournamentIds
                .map(id => pastMetaTournaments.find(t => t.tournament_id === id))
                .filter(t => t) // Remove undefined entries
                .sort((a, b) => {
                    // Sort by date (newest first)
                    const dateA = new Date(a.tournament_date || '1970-01-01');
                    const dateB = new Date(b.tournament_date || '1970-01-01');
                    return dateB - dateA;
                });
            
            // Rebuild tournament filter dropdown
            resetSelectWithPlaceholder(tournamentSelect, '-- All Tournaments --', 'all');
            tournaments.forEach(tournament => {
                // Clean tournament name: remove " - Limitless"
                let cleanName = tournament.tournament_name.replace(/\s*[-|•]\s*Limitless\s*$/i, '');
                const option = document.createElement('option');
                option.value = String(tournament.tournament_id || '');
                option.textContent = cleanName;
                tournamentSelect.appendChild(option);
            });

            if (tournamentSelect) {
                const canRestore = Array.from(tournamentSelect.options).some(opt => opt.value === previousSelection);
                tournamentSelect.value = canRestore ? previousSelection : 'all';
            }
            
            console.log(`[Past Meta] Tournament filter updated: ${tournaments.length} tournaments for format ${formatFilter}`);
        }
        
        function updatePastMetaDeckList() {
            const formatFilter = document.getElementById('pastMetaFormatFilter').value;
            const tournamentFilter = document.getElementById('pastMetaTournamentFilter').value;
            const searchTerm = document.getElementById('pastMetaDeckSearch').value.toLowerCase();
            const deckSelect = document.getElementById('pastMetaDeckSelect');
            const previousSelection = deckSelect ? deckSelect.value : '';
            
            // Filter decks
            let filteredDecks = pastMetaDecks.filter(deck => {
                const matchesFormat = formatFilter === 'all' || deck.format === formatFilter;
                const matchesTournament = tournamentFilter === 'all' || deck.tournament_id === tournamentFilter;
                const matchesSearch = !searchTerm || 
                    (deck.deck_name && deck.deck_name.toLowerCase().includes(searchTerm)) ||
                    (deck.tournament_name && deck.tournament_name.toLowerCase().includes(searchTerm));
                return matchesFormat && matchesTournament && matchesSearch;
            });
            
            // Group by archetype (deck_name) to merge across tournaments
            const archetypeMap = new Map();
            filteredDecks.forEach(deck => {
                const archetype = deck.deck_name || 'Unknown';
                if (!archetypeMap.has(archetype)) {
                    archetypeMap.set(archetype, {
                        archetype: archetype,
                        tournaments: [],
                        totalDecklists: 0
                    });
                }
                const entry = archetypeMap.get(archetype);
                entry.tournaments.push(deck);
                entry.totalDecklists += (deck.decklist_count || 0);
            });
            
            // Convert to array and sort by archetype name
            const archetypes = Array.from(archetypeMap.values());
            archetypes.sort((a, b) => a.archetype.localeCompare(b.archetype));
            
            // Populate deck select dropdown
            resetSelectWithPlaceholder(deckSelect, '-- Select a Deck --', '');
            
            archetypes.forEach(entry => {
                const tournamentCount = entry.tournaments.length;
                const displayName = tournamentCount > 1 
                    ? `${entry.archetype} (${tournamentCount} Tournaments)`
                    : entry.archetype;
                const option = document.createElement('option');
                option.value = entry.archetype;
                option.textContent = displayName;
                deckSelect.appendChild(option);
            });

            if (deckSelect) {
                const canRestore = Array.from(deckSelect.options).some(opt => opt.value === previousSelection);
                if (canRestore) {
                    deckSelect.value = previousSelection;
                } else if (deckSelect.options.length > 1) {
                    deckSelect.value = deckSelect.options[1].value;
                } else {
                    deckSelect.value = '';
                }

                if (deckSelect.value) {
                    onPastMetaDeckSelect();
                } else {
                    pastMetaCurrentDeck = null;
                    pastMetaCurrentCards = [];
                    pastMetaFilteredCards = [];
                    renderPastMetaCards();
                }
            }
            
            console.log(`Filtered to ${archetypes.length} unique archetypes from ${filteredDecks.length} tournament entries`);
        }
        
        function onPastMetaDeckSelect() {
            const selectedArchetype = document.getElementById('pastMetaDeckSelect').value;
            
            if (!selectedArchetype) {
                // Hide stats and cards
                document.getElementById('pastMetaStatsSection').style.display = 'none';
                document.getElementById('pastMetaDeckTableView').style.display = 'none';
                document.getElementById('pastMetaDeckVisual').style.display = 'none';
                pastMetaCurrentDeck = null;
                pastMetaCurrentCards = [];
                return;
            }
            
            const formatFilter = document.getElementById('pastMetaFormatFilter').value;
            const tournamentFilter = document.getElementById('pastMetaTournamentFilter').value;
            
            // Find all decks with matching archetype (respecting current filters)
            const matchingDecks = pastMetaDecks.filter(deck => {
                const matchesArchetype = deck.deck_name === selectedArchetype;
                const matchesFormat = formatFilter === 'all' || deck.format === formatFilter;
                const matchesTournament = tournamentFilter === 'all' || deck.tournament_id === tournamentFilter;
                return matchesArchetype && matchesFormat && matchesTournament;
            });
            
            if (matchingDecks.length === 0) {
                console.error('No matching decks found for archetype:', selectedArchetype);
                return;
            }
            
            // Aggregate cards across all matching decks (same statistical pipeline as City/Global)
            const selectedRows = [];
            let totalDecklists = 0;
            const tournamentNames = [];
            
            matchingDecks.forEach(deck => {
                totalDecklists += (deck.decklist_count || 0);
                
                // Track tournament names for stats display
                const cleanTournamentName = (deck.tournament_name || '').replace(/\s*[-|•]\s*Limitless\s*$/i, '');
                if (!tournamentNames.includes(cleanTournamentName)) {
                    tournamentNames.push(cleanTournamentName);
                }
                
                // Collect rows for unified aggregation
                deck.cards.forEach(card => {
                    selectedRows.push({
                        ...card,
                        tournament_id: deck.tournament_id || '',
                        tournament_date: deck.tournament_date || card.tournament_date || 'Unknown Date',
                        total_decks_in_archetype: deck.decklist_count || card.total_decks_in_archetype || 1,
                        deck_count: card.deck_count || card.deck_inclusion_count || 0,
                        deck_inclusion_count: card.deck_inclusion_count || card.deck_count || 0,
                        total_count: card.total_count || 0,
                        max_count: card.max_count || 0
                    });
                });
            });

            const aggregatedCardsRaw = aggregateCardStatsByDate(selectedRows).map(card => ({
                ...card,
                card_count: parsePastMetaNumber(card.average_count_overall, 0),
                decklist_count: parseInt(card.total_decks_in_archetype || totalDecklists || 1, 10) || 1,
                deck_inclusion_count: parseInt(card.deck_inclusion_count || card.deck_count || 0, 10) || 0,
                deck_count: parseInt(card.deck_count || card.deck_inclusion_count || 0, 10) || 0,
                max_count: parseInt(card.max_count || 0, 10) || 0
            }));
            const aggregatedCards = deduplicateCards(aggregatedCardsRaw);
            
            // Create a virtual deck object for the aggregated data
            pastMetaCurrentDeck = {
                deck_name: selectedArchetype,
                archetype: selectedArchetype,
                format: formatFilter === 'all' ? 'Multi-Format' : formatFilter,
                tournament_name: tournamentNames.join(', '),
                tournament_count: matchingDecks.length,
                decklist_count: totalDecklists,
                cards: aggregatedCards
            };
            
            pastMetaCurrentCards = aggregatedCards;
            
            // Update stats
            document.getElementById('pastMetaStatsSection').style.display = 'block';
            const totalCards = aggregatedCards.reduce((sum, c) => sum + (parseInt(c.max_count || 0, 10) || 0), 0);
            document.getElementById('pastMetaStatCards').textContent = `${aggregatedCards.length} / ${Math.round(totalCards)}`;
            
            // Show tournament info based on count
            if (matchingDecks.length === 1) {
                const cleanName = tournamentNames[0];
                document.getElementById('pastMetaStatTournament').textContent = `${cleanName} (${totalDecklists} decklists)`;
            } else {
                document.getElementById('pastMetaStatTournament').textContent = `${matchingDecks.length} Tournaments (${totalDecklists} total decklists)`;
            }
            
            document.getElementById('pastMetaStatFormat').textContent = pastMetaCurrentDeck.format;
            
            // Save to window for deck builder
            window.pastMetaCurrentArchetype = selectedArchetype;
            
            // Apply filters and render
            filterPastMetaCards();
            
            console.log(`Selected archetype: ${selectedArchetype} (${aggregatedCards.length} unique cards across ${matchingDecks.length} tournaments, ${totalDecklists} total decklists)`);
        }
        
        function filterPastMetaCards() {
            if (!pastMetaCurrentCards || pastMetaCurrentCards.length === 0) {
                pastMetaFilteredCards = [];
                renderPastMetaCards();
                return;
            }
            
            const filterValue = document.getElementById('pastMetaFilterSelect').value;
            const threshold = filterValue === 'all' ? 0 : parseInt(filterValue);
            
            // Since tournament scraper gives average counts, we treat any card as 100% present
            // Filter threshold doesn't really apply here, but we keep it for consistency
            pastMetaFilteredCards = [...pastMetaCurrentCards];
            
            renderPastMetaCards();
        }
        
        function renderPastMetaCards() {
            if (!pastMetaFilteredCards || pastMetaFilteredCards.length === 0) {
                document.getElementById('pastMetaDeckTableView').style.display = 'none';
                document.getElementById('pastMetaDeckVisual').style.display = 'none';
                document.getElementById('pastMetaCardCount').textContent = '0 Cards';
                document.getElementById('pastMetaCardCountSummary').textContent = '/ 0 Total';
                return;
            }
            
            const searchTerm = document.getElementById('pastMetaOverviewSearch').value.toLowerCase();
            
            // Apply search filter
            let cardsToShow = pastMetaFilteredCards.filter(card => {
                if (!searchTerm) return true;
                const cardName = (card.full_card_name || card.card_name || '').toLowerCase();
                return cardName.includes(searchTerm);
            });
            
            // Sort cards (Pokemon, Trainer, Energy)
            const sortedCards = sortCardsByType(cardsToShow);
            
            // Update counts
            const totalCards = sortedCards.reduce((sum, c) => sum + (parseInt(c.max_count || 0, 10) || 0), 0);
            document.getElementById('pastMetaCardCount').textContent = `${sortedCards.length} Cards`;
            document.getElementById('pastMetaCardCountSummary').textContent = `/ ${Math.round(totalCards)} Total`;
            
            // Render based on view mode
            if (pastMetaShowGridView) {
                renderPastMetaGridView(sortedCards);
            } else {
                renderPastMetaTableView(sortedCards);
            }
        }
        
        function renderPastMetaTableView(cards) {
            document.getElementById('pastMetaDeckTableView').style.display = 'block';
            document.getElementById('pastMetaDeckVisual').style.display = 'none';
            
            const tableContainer = document.getElementById('pastMetaDeckTable');
            
            if (cards.length === 0) {
                tableContainer.innerHTML = '<p style="text-align: center; color: #444; padding: 20px; font-weight: 500;">No cards found</p>';
                return;
            }
            
            let html = '<table><thead><tr>';
            html += '<th style="width: 60px;">Count</th>';
            html += '<th>Card Name</th>';
            html += '<th style="width: 100px;">ACE SPEC</th>';
            html += '<th style="width: 120px;">Action</th>';
            html += '</tr></thead><tbody>';
            
            cards.forEach(card => {
                const cardName = card.full_card_name || card.card_name || 'Unknown Card';
                const count = parseInt(card.max_count || 0, 10) || 0;
                const isAceSpecCard = isAceSpec(cardName);
                
                html += '<tr>';
                html += `<td style="text-align: center; font-weight: bold; color: #2c3e50;">${count}</td>`;
                html += `<td>${cardName}</td>`;
                html += `<td style="text-align: center;">${isAceSpecCard ? '<span style="color: #e74c3c; font-weight: bold;">★</span>' : '-'}</td>`;
                html += `<td style="text-align: center;"><button class="btn btn-primary" onclick='addCardToDeck("pastMeta", "${cardName.replace(/'/g, "\\'")}");' style="padding: 6px 12px; font-size: 0.85em;">+ Add</button></td>`;
                html += '</tr>';
            });
            
            html += '</tbody></table>';
            tableContainer.innerHTML = html;
        }
        
        function renderPastMetaGridView(cards) {
            console.log(`[Past Meta] renderPastMetaGridView called with ${cards.length} cards, rarity mode: ${pastMetaRarityMode}`);
            document.getElementById('pastMetaDeckTableView').style.display = 'none';
            document.getElementById('pastMetaDeckVisual').style.display = 'block';
            
            const gridContainer = document.getElementById('pastMetaDeckGrid');
            
            if (cards.length === 0) {
                gridContainer.innerHTML = '<p style="text-align: center; color: #444; padding: 20px; font-weight: 500;">No cards found</p>';
                return;
            }
            
            // Sort cards by type for better organization
            const sortedCards = sortCardsByType([...cards]);
            
            // Get current deck to show deck counts
            const currentDeck = window.pastMetaDeck || {};
            
            let html = '';
            
            sortedCards.forEach(card => {
                const cardFullName = fixMojibake(card.full_card_name || card.card_name || 'Unknown Card');
                const cardNameEscaped = cardFullName.replace(/'/g, "\\'");
                const avgCount = parseFloat(String(card.card_count || card.average_count_overall || 0).replace(',', '.')) || 0; // Average count across all decklists (e.g., 0.98)
                const maxCount = parseInt(card.max_count || 0, 10) || 0;
                const decklistCount = parseFloat(String(card.decklist_count || card.total_decks_in_archetype || 0).replace(',', '.')) || 0; // Total decklists in archetype
                const deckCountByStats = parseFloat(String(card.deck_count || card.deck_inclusion_count || 0).replace(',', '.')) || 0; // Number of decks containing this card
                
                // Prefer explicit CSV fields first; only parse from full_card_name as fallback.
                let cardName = cardFullName;
                let setCodeFromName = String(card.set_code || card.set || '').trim().toUpperCase();
                let setNumberFromName = String(card.set_number || card.number || '').trim();

                if ((!setCodeFromName || !setNumberFromName) && card.card_identifier) {
                    const identifierMatch = String(card.card_identifier).trim().match(/^([A-Z0-9]{2,6})\s+([A-Z0-9-]+)$/i);
                    if (identifierMatch) {
                        if (!setCodeFromName) setCodeFromName = identifierMatch[1].toUpperCase();
                        if (!setNumberFromName) setNumberFromName = identifierMatch[2];
                    }
                }
                
                // Match pattern: "Card Name SET NUMBER" (e.g., "Abra MEG 54", "Dragapult ex TWM 130")
                if (!setCodeFromName || !setNumberFromName) {
                    const cardMatch = cardFullName.match(/^(.+?)\s+([A-Z0-9]{2,4})\s+([A-Z0-9]+)$/);
                    if (cardMatch) {
                        cardName = cardMatch[1].trim();
                        setCodeFromName = cardMatch[2];
                        setNumberFromName = cardMatch[3];
                        console.log(`[Past Meta] Parsed card: "${cardFullName}" -> name: "${cardName}", set: "${setCodeFromName}", number: "${setNumberFromName}"`);
                    }
                }
                const rawCardName = cardName;
                cardName = getDisplayCardName(cardName, setCodeFromName, setNumberFromName);
                
                // Calculate statistics
                const rawPercentage = parseFloat(String(card.percentage_in_archetype || card.share_percent || '').replace(',', '.'));
                const avgInUsingDecksRaw = parseFloat(String(card.average_count || card.avg_count || '').replace(',', '.'));

                const resolvedPercentage = Number.isFinite(rawPercentage) && rawPercentage > 0
                    ? rawPercentage
                    : (decklistCount > 0 ? ((deckCountByStats / decklistCount) * 100) : 0);
                const avgInUsingDecksValue = Number.isFinite(avgInUsingDecksRaw) && avgInUsingDecksRaw > 0
                    ? avgInUsingDecksRaw
                    : (deckCountByStats > 0 ? (avgCount * decklistCount / deckCountByStats) : 0);

                const percentage = Math.max(0, resolvedPercentage).toFixed(1).replace('.', ',');
                const avgInUsingDecks = Math.max(0, avgInUsingDecksValue).toFixed(2).replace('.', ',');
                const avgCountOverallDisplay = Math.max(0, avgCount).toFixed(2).replace('.', ',');
                const deckCountByStatsDisplay = Math.round(Math.max(0, deckCountByStats));
                const decklistCountDisplay = Math.round(Math.max(0, decklistCount));
                
                // O(1) lookup: canonical set+number first, then robust name index
                const cardInDb = (() => {
                    if (setCodeFromName && setNumberFromName) {
                        const bySetNumber = getCanonicalCardRecord(setCodeFromName, setNumberFromName);
                        if (bySetNumber) return bySetNumber;
                    }
                    return getCardByNameFromIndex(cardName);
                })();
                
                if (cardInDb) {
                    console.log(`[Past Meta] ? Found in DB: ${cardName} -> ${cardInDb.set} ${cardInDb.number}, image: ${cardInDb.image_url ? 'YES' : 'NO'}`);
                } else {
                    console.log(`[Past Meta] ? NOT found in DB: ${cardName} (searched: set="${setCodeFromName}", number="${setNumberFromName}")`);
                }
                
                // Apply rarity mode to determine which versions to show
                let versionsToRender = [];
                
                console.log(`[Past Meta] Applying rarity mode "${pastMetaRarityMode}" for card: ${cardName}`);
                
                if (pastMetaRarityMode === 'all' && cardInDb) {
                    // Show ALL international prints
                    let allVersions = getInternationalPrintsForCard(cardInDb.set, cardInDb.number);
                    console.log(`[Past Meta] ALL mode: found ${allVersions ? allVersions.length : 0} versions`);
                    
                    if (allVersions && allVersions.length > 0) {
                        versionsToRender = allVersions.map(v => ({
                            ...card,
                            set_code: v.set,
                            set_number: v.number,
                            image_url: v.image_url,
                            rarity: v.rarity
                        }));
                    } else {
                        // No versions found, use original
                        versionsToRender = [{ ...card, set_code: cardInDb?.set || '', set_number: cardInDb?.number || '', image_url: cardInDb?.image_url || '' }];
                    }
                } else if (cardInDb) {
                    // 'min' or 'max' mode: Get preferred version
                    // CRITICAL FIX: Set global rarity preference to match Past Meta mode
                    const previousGlobalPref = globalRarityPreference;
                    globalRarityPreference = pastMetaRarityMode; // Temporarily set global to match Past Meta
                    
                    const preferredVersion = getPreferredVersionForCard(cardName, cardInDb.set, cardInDb.number);
                    console.log(`[Past Meta] MIN/MAX mode: preferred version:`, preferredVersion);
                    
                    globalRarityPreference = previousGlobalPref; // Restore global preference
                    
                    if (preferredVersion) {
                        versionsToRender = [{
                            ...card,
                            set_code: preferredVersion.set,
                            set_number: preferredVersion.number,
                            image_url: preferredVersion.image_url,
                            rarity: preferredVersion.rarity
                        }];
                    } else {
                        // No preferred version, use original
                        versionsToRender = [{ ...card, set_code: cardInDb.set, set_number: cardInDb.number, image_url: cardInDb.image_url }];
                    }
                } else {
                    // Card not found in database, use placeholder
                    console.log(`[Past Meta] Card not in DB - using placeholder`);
                    versionsToRender = [{ ...card, set_code: '', set_number: '', image_url: '' }];
                }
                
                // Render each version
                versionsToRender.forEach(displayCard => {
                    const setCode = displayCard.set_code || '';
                    const setNumber = displayCard.set_number || '';
                    const cardNameWarning = getNameWarningHtml(rawCardName, cardName, setCode, setNumber);
                    let germanCardName = (displayCard.name_de || (cardInDb && cardInDb.name_de) || card.card_name_de || '').toLowerCase();
                    
                    const imageUrl = getBestCardImage({
                        ...displayCard,
                        set_code: setCode,
                        set_number: setNumber,
                        card_name: cardName
                    }) || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22280%22%3E%3Crect width=%22200%22 height=%22280%22 fill=%22%23333%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23999%22 font-size=%2218%22%3ENo Image%3C/text%3E%3C/svg%3E';
                    
                    // Check if card is in deck builder
                    let deckCount = 0;
                    if (Object.keys(currentDeck).length > 0 && setCode && setNumber) {
                        // Match by set code + set number
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
                    } else if (Object.keys(currentDeck).length > 0 && !setCode && !setNumber) {
                        // Fallback: exact card name match
                        deckCount = currentDeck[cardName] || 0;
                    }
                    
                    // Get price and Cardmarket URL
                    let eurPrice = '';
                    let cardmarketUrl = '';
                    if (setCode && setNumber) {
                        let priceCard = (cardsBySetNumberMap || {})[`${setCode}-${setNumber}`] || null;
                        if (!priceCard) {
                            const normalizedNumber = setNumber.replace(/^0+/, '') || '0';
                            priceCard = (cardsBySetNumberMap || {})[`${setCode}-${normalizedNumber}`] || null;
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
                    const cardmarketUrlEscaped = (cardmarketUrl || '').replace(/'/g, "\\'");
                    
                    // Determine card type for filtering with database-based approach
                    const filterCategory = getCardType(cardName, setCode, setNumber);
                    const germanCardNameEscaped = germanCardName.replace(/"/g, '&quot;');
                    
                    html += `
                        <div class="card-item" data-card-name="${cardName.toLowerCase()}" data-card-name-de="${germanCardNameEscaped}" data-card-set="${setCode.toLowerCase()}" data-card-number="${setNumber.toLowerCase()}" data-card-type="${filterCategory}" style="position: relative; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.15); cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; background: white;">
                            <div class="card-image-container" style="position: relative; width: 100%;">
                                <img src="${imageUrl}" alt="${cardName}" loading="lazy" referrerpolicy="no-referrer" style="width: 100%; aspect-ratio: 2.5/3.5; object-fit: cover; cursor: zoom-in;" onerror="handleCardImageError(this, '${setCode}', '${setNumber}')" onclick="if (typeof event !== 'undefined' && event) event.stopPropagation(); showSingleCard(this.src, '${cardNameEscaped}');">
                                
                                <!-- Red badge: Max Count (top-right) -->
                                <div style="position: absolute; top: 5px; right: 5px; background: #dc3545; color: white; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.7em; box-shadow: 0 2px 4px rgba(0,0,0,0.3); z-index: 2;">
                                    ${maxCount}
                                </div>
                                
                                <!-- Green badge: Deck Count (top-left) - only show if > 0 -->
                                ${deckCount > 0 ? `<div style="position: absolute; top: 5px; left: 5px; background: #28a745; color: white; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.7em; box-shadow: 0 2px 4px rgba(0,0,0,0.3); z-index: 2;">${deckCount}</div>` : ''}
                                
                                <!-- Card info section -->
                                <div class="card-info-bottom" style="padding: 5px; background: white; font-size: 0.7em; text-align: center; min-height: 48px; display: flex; flex-direction: column; justify-content: space-between;">
                                    <div class="card-info-text">
                                        <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; margin-bottom: 1px; color: #333; font-size: 0.58em;">
                                            ${cardName}${cardNameWarning}
                                        </div>
                                        <div style="color: #333; font-size: 0.52em; margin-bottom: 1px; font-weight: 600;">
                                            ${setCode} ${setNumber}
                                        </div>
                                        <div style="color: #333; font-size: 0.55em; margin-bottom: 1px; font-weight: 600;">
                                            ${percentage}% | Ø ${avgInUsingDecks}x (${avgCountOverallDisplay}x)
                                        </div>
                                        <div style="font-weight: 600; color: #333; font-size: 0.58em;">
                                            ${deckCountByStatsDisplay} / ${decklistCountDisplay} Decks
                                        </div>
                                    </div>
                                    
                                    <!-- Action buttons (4 buttons: - ? Ø +) -->
                                    <div class="card-action-buttons" style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 2px; margin-top: 4px;">
                                        <button onclick="event.stopPropagation(); removeCardFromDeck('pastMeta', '${cardNameEscaped}')" style="background: #dc3545; color: white; border: none; border-radius: 3px; height: 16px; cursor: pointer; font-weight: bold; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; min-height: unset; min-width: unset;" title="Remove from deck">-</button>
                                        <button onclick="event.stopPropagation(); openRaritySwitcher('${cardNameEscaped}', '${cardNameEscaped} (${setCode} ${setNumber})')" style="background: #ffc107; color: #333; border: none; border-radius: 3px; height: 16px; cursor: pointer; font-size: 10px; font-weight: bold; text-align: center; padding: 0; display: flex; align-items: center; justify-content: center; min-height: unset; min-width: unset;" title="Switch rarity/print">★</button>
                                        <button onclick="event.stopPropagation(); openCardmarket('${cardmarketUrlEscaped}', '${cardNameEscaped}')" style="background: ${priceBackground}; color: white; height: 16px; border: none; border-radius: 3px; cursor: ${eurPrice ? 'pointer' : 'not-allowed'}; font-size: 6px; font-weight: bold; padding: 0 1px; display: flex; align-items: center; justify-content: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4); min-height: unset; min-width: unset;" title="${eurPrice ? 'Buy on Cardmarket: ' + eurPrice : 'Price not available'}">${priceDisplay}</button>
                                        <button onclick="event.stopPropagation(); addCardToDeck('pastMeta', '${cardNameEscaped}', '${setCode}', '${setNumber}')" style="background: #28a745; color: white; border: none; border-radius: 3px; height: 16px; cursor: pointer; font-weight: bold; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; min-height: unset; min-width: unset;" title="Add to deck">+</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                }); // End of versionsToRender.forEach
            }); // End of cards.forEach
            
            gridContainer.innerHTML = html;
        }
        
        function filterPastMetaOverviewCards() {
            const searchInput = document.getElementById('pastMetaOverviewSearch');
            if (!searchInput) return;
            
            const searchTerm = searchInput.value.toLowerCase().trim();
            const gridContainer = document.getElementById('pastMetaDeckGrid');
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

                const matchesType = currentMetaOverviewCardTypeFilter === 'all' || cardType === currentMetaOverviewCardTypeFilter;
                
                // Show card only if it matches both filters
                if (matchesSearch && matchesType) {
                    card.style.display = '';
                    visibleCount++;
                } else {
                    card.style.display = 'none';
                }
            });
            
            // Update card count
            const countElement = document.getElementById('pastMetaCardCount');
            if (countElement) {
                countElement.textContent = `${visibleCount} Cards`;
            }
        }
        
        function setPastMetaRarityMode(mode) {
            console.log(`[Past Meta] Rarity mode changed to: ${mode}`);
            pastMetaRarityMode = mode;
            
            // Update button styles
            const minBtn = document.getElementById('pastMetaRarityMin');
            const maxBtn = document.getElementById('pastMetaRarityMax');
            const allBtn = document.getElementById('pastMetaRarityAll');
            
            if (minBtn) {
                minBtn.style.opacity = mode === 'min' ? '1' : '0.5';
                minBtn.style.fontWeight = mode === 'min' ? 'bold' : 'normal';
            }
            if (maxBtn) {
                maxBtn.style.opacity = mode === 'max' ? '1' : '0.5';
                maxBtn.style.fontWeight = mode === 'max' ? 'bold' : 'normal';
            }
            if (allBtn) {
                allBtn.style.opacity = mode === 'all' ? '1' : '0.5';
                allBtn.style.fontWeight = mode === 'all' ? 'bold' : 'normal';
            }
            
            // Re-render
            renderPastMetaCards();
        }
        
        function togglePastMetaDeckGridView() {
            const gridViewContainer = document.getElementById('pastMetaDeckVisual');
            const tableViewContainer = document.getElementById('pastMetaDeckTableView');
            const gridButtons = document.querySelectorAll('button[onclick*="togglePastMetaDeckGridView"]');
            const button = gridButtons[0];
            
            if (!gridViewContainer || !tableViewContainer) {
                console.warn('?? Grid or table container not found');
                return;
            }
            
            if (!pastMetaCurrentCards || pastMetaCurrentCards.length === 0) {
                alert('? Please select a deck first!');
                return;
            }
            
            // Toggle between views
            pastMetaShowGridView = !pastMetaShowGridView;
            
            if (pastMetaShowGridView) {
                if (button) button.textContent = '?? List View';
            } else {
                if (button) button.textContent = '??? Grid View';
            }
            
            // Re-render with new view
            renderPastMetaCards();
            
            // Re-apply search filter
            filterPastMetaOverviewCards();
        }
        
        function copyPastMetaDeckOverview() {
            if (!pastMetaFilteredCards || pastMetaFilteredCards.length === 0) {
                alert('No cards available to copy');
                return;
            }
            
            let deckText = '';
            pastMetaFilteredCards.forEach(card => {
                const cardName = card.full_card_name || card.card_name || 'Unknown Card';
                const count = Math.round(parseFloat(card.card_count) || 0);
                deckText += `${count} ${cardName}\n`;
            });
            
            navigator.clipboard.writeText(deckText).then(() => {
                alert('? Deck list copied!');
            }).catch(err => {
                console.error('Failed to copy:', err);
                alert('? Error copying');
            });
        }
        
        function togglePastMetaDeckGridView() {
            pastMetaShowGridView = !pastMetaShowGridView;
            renderPastMetaCards();
        }

        // Generic function to render deck analysis tables
        function renderDeckAnalysisTable(data, container, countElementId, summaryElementId) {
            if (!container || !data || data.length === 0) return;

            const headers = Object.keys(data[0]);
            let html = '<table><thead><tr>';
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
            container.innerHTML = html;

            const countEl = document.getElementById(countElementId);
            const summaryEl = document.getElementById(summaryElementId);
            if (countEl && summaryEl) {
                countEl.textContent = `${data.length} Karten`;
                summaryEl.textContent = `/ ${data.length} Total`;
            }
        }
        
        // Load Cards
        let allCards = [];
        // Card Database Variables
        let allCardsData = [];
        let filteredCardsData = [];
        
        // Toggle card filter visibility
        function toggleCardFilter(filterId) {
            const filterOptions = document.getElementById(filterId);
            const header = filterOptions.previousElementSibling;
            
            if (filterOptions && header) {
                const isCollapsed = filterOptions.classList.contains('collapsed');
                
                if (isCollapsed) {
                    // Expand
                    filterOptions.classList.remove('collapsed');
                    header.classList.remove('collapsed');
                } else {
                    // Collapse
                    filterOptions.classList.add('collapsed');
                    header.classList.add('collapsed');
                }
            }
        }
        
        // Pagination for Cards Tab
        let currentCardsPage = 1;
        const cardsPerPage = 300;
        let showAllCards = false;
        let showOnlyOnePrint = true; // Toggle for deduplication: true = only show 1 print per card (low rarity, newest)
        
        async function loadCards() {
            const content = document.getElementById('cardsContent');
            content.innerHTML = '<div class="loading">Loading card database...</div>';
            
            try {
                // Ensure set mapping is loaded (for English sets)
                if (!window.englishSetCodes || window.englishSetCodes.size === 0) {
                    console.log('[Cards Tab] Loading set mapping for English sets...');
                    await loadSetMapping();
                }
                
                // Use already loaded cards from loadAllCardsDatabase() instead of loading again
                if (!window.allCardsDatabase || window.allCardsDatabase.length === 0) {
                    console.log('[Cards Tab] Waiting for allCardsDatabase to load...');
                    await loadAllCardsDatabase();
                }
                
                // Filter to only English cards
                const englishCards = window.allCardsDatabase.filter(card => 
                    window.englishSetCodes && window.englishSetCodes.has(card.set)
                );
                
                // Store reference to cards
                window.allCardsData = englishCards;
                
                console.log(`[Cards Tab] Filtered to ${window.allCardsData.length} English cards from ${window.allCardsDatabase.length} total`);
                console.log(`[Cards Tab] First card structure:`, window.allCardsData[0]);
                
                // Load playable cards (from City League, Current Meta, Tournament JH)
                await loadPlayableCards();
                
                // Load deck coverage statistics
                await loadDeckCoverageStats();
                
                // Load formats from current meta data
                await loadFormatsForCards();
                
                // Populate filters
                await populateSetFilter(window.allCardsData);
                // populateMetaFormatFilter(); // Disabled - using populateMetaFilter() instead for more complete data
                populateMainPokemonFilter();
                populateArchetypeFilter();
                populateMetaFilter();
                
                // Setup filter event listeners
                setupCardFilters();
                
                // Initial render
                filterAndRenderCards();
                
                window.cardsLoaded = true;
            } catch (error) {
                console.error('[Cards Tab] Error loading card database:', error);
                content.innerHTML = '<div class="error">? Error loading card database</div>';
            }
        }
        
        async function loadPlayableCards() {
            window.playableCardsSet = new Set(); // All playables (City League + Current Meta + Tournament)
            window.cityLeagueCardsSet = new Set(); // Only City League cards
            
            try {
                // Load City League Analysis CSV
                try {
                    const cityLeagueResponse = await fetch(BASE_PATH + 'city_league_analysis.csv');
                    const cityLeagueText = await cityLeagueResponse.text();
                    const cityLeagueCards = parseCSV(cityLeagueText);
                    cityLeagueCards.forEach(card => {
                        if (card.card_name) {
                            const cardNameNorm = normalizeCardName(card.card_name);
                            if (cardNameNorm) {
                                window.playableCardsSet.add(cardNameNorm);
                                window.cityLeagueCardsSet.add(cardNameNorm);
                            }
                        }
                    });
                    console.log(`Loaded ${cityLeagueCards.length} playable cards from City League, unique: ${window.cityLeagueCardsSet.size}`);
                } catch (err) {
                    console.warn('Could not load City League playable cards:', err);
                }
                
                // Load Current Meta Analysis CSV
                try {
                    const currentMetaResponse = await fetch(BASE_PATH + 'current_meta_card_data.csv');
                    const currentMetaText = await currentMetaResponse.text();
                    const currentMetaCards = parseCSV(currentMetaText);
                    healCurrentMetaCardRows(currentMetaCards);
                    currentMetaCards.forEach(card => {
                        if (card.card_name) {
                            const cardNameNorm = normalizeCardName(card.card_name);
                            if (cardNameNorm) window.playableCardsSet.add(cardNameNorm);
                        }
                    });
                    console.log(`Loaded ${currentMetaCards.length} playable cards from Current Meta`);
                } catch (err) {
                    console.warn('Could not load Current Meta playable cards:', err);
                }
                
                // Load Tournament Scraper JH CSV
                try {
                    const tournamentResponse = await fetch(BASE_PATH + 'tournament_cards_data_cards.csv');
                    const tournamentText = await tournamentResponse.text();
                    const tournamentCards = parseCSV(tournamentText);
                    tournamentCards.forEach(card => {
                        if (card.card_name) {
                            const cardNameNorm = normalizeCardName(card.card_name);
                            if (cardNameNorm) window.playableCardsSet.add(cardNameNorm);
                        }
                    });
                    console.log(`Loaded ${tournamentCards.length} playable cards from Tournament JH`);
                } catch (err) {
                    console.warn('Could not load Tournament JH playable cards:', err);
                }
                
                console.log(`Total unique playable cards (All Playables): ${window.playableCardsSet.size}`);
                console.log(`City League only cards: ${window.cityLeagueCardsSet.size}`);
            } catch (error) {
                console.error('Error loading playable cards:', error);
            }
        }
        
        // Set release dates for temporal filtering (format: YYYY-MM-DD)
        const SET_RELEASE_DATES = {
            // 2026 Sets
            'M3': '2026-03-01',
            'ASC': '2026-02-21',
            'PFL': '2026-01-24',  // Pok Pad is in this set
            'MEG': '2025-12-20',
            'MEE': '2025-12-20',
            'MEP': '2025-12-01',
            'BLK': '2025-11-15',
            'WHT': '2025-11-15',
            'DRI': '2025-10-25',
            'JTG': '2025-09-13',
            'PRE': '2025-01-17',
            'SSP': '2024-11-08',
            // 2024 Sets
            'SCR': '2024-09-13',
            'SFA': '2024-08-02',
            'TWM': '2024-05-24',
            'TEF': '2024-03-22',
            'PAF': '2024-01-26',
            // 2023 Sets
            'PAR': '2023-11-03',
            'MEW': '2023-09-22',
            'OBF': '2023-08-11',
            'PAL': '2023-06-09',
            'SVI': '2023-03-31',
            'SVE': '2023-03-31',
            'SVP': '2023-03-01',
            // 2022-2023 Sets
            'CRZ': '2023-01-20',
            'SIR': '2022-11-11',
            'LOR': '2022-09-09',
            'PGO': '2022-07-01',
            'ASR': '2022-05-27',
            'BRS': '2022-02-25',
            // Older sets default to 2020
            'DEFAULT': '2020-01-01'
        };
        window.SET_RELEASE_DATES = SET_RELEASE_DATES;
        
        // For temporal filtering: City League data often has NO tournament_date
        // We'll treat City League as "current meta" (post-release for all cards)
        // and only filter Tournament data by date
        const CITY_LEAGUE_META_NAME = 'City League';
        window.CITY_LEAGUE_META_NAME = CITY_LEAGUE_META_NAME;
        
        async function loadDeckCoverageStats() {
            window.cardDeckCoverageMap = new Map(); // Map<card_name, {archetypesWithCard: Map, archetypes: Set, tournamentDates: Set}>
            window.archetypeDeckCounts = new Map(); // Map<meta|archetype, {totalDecks: number, tournamentDates: Set}>
            let totalDecksCount = 0;
            
            // Initialize new filter maps
            window.mainPokemonCardsMap = new Map(); // Map<mainPokemon, Set<card_name>>
            window.archetypeCardsMap = new Map(); // Map<archetype, Set<card_name>>
            window.metaCardsMap = new Map(); // Map<meta, Set<card_name>>
            window.allMainPokemons = new Set();
            window.allArchetypes = new Set();
            window.allMetas = new Set();
            
            const archetypeKeysSeen = new Set(); // Track which archetypes we've already counted (GLOBAL across sources)
            
            try {
                // Load both City League and Tournament data for comprehensive coverage
                const dataSources = [
                    { file: 'city_league_analysis.csv', name: 'City League' },
                    { file: 'tournament_cards_data_cards.csv', name: 'Tournament' }
                ];
                
                for (const source of dataSources) {
                    try {
                        console.log(`[Deck Coverage] Attempting to load: ${source.file}`);
                        const response = await fetch(BASE_PATH + source.file);
                        if (!response.ok) {
                            console.error(`[Deck Coverage] Failed to fetch ${source.file}: ${response.status}`);
                            continue;
                        }
                        const text = await response.text();
                        const rows = parseCSV(text);
                        
                        console.log(`[Deck Coverage] Parsed ${rows.length} rows from ${source.file}`);
                        if (rows.length > 0) {
                            console.log(`[Deck Coverage] First row structure:`, rows[0]);
                        }
                        
                        let processedRows = 0;
                        
                        rows.forEach(row => {
                            if (!row.card_name || !row.archetype || !row.meta) {
                                if (processedRows === 0) {
                                    console.log(`[Deck Coverage] Skipping row - missing fields:`, { 
                                        has_card_name: !!row.card_name, 
                                        has_archetype: !!row.archetype, 
                                        has_meta: !!row.meta,
                                        meta_value: row.meta
                                    });
                                }
                                return;
                            }
                            processedRows++;
                            
                            const cardName = normalizeCardName(row.card_name);
                            
                            // Skip basic energies from coverage tracking
                            if (isBasicEnergy(row.card_name)) return;
                            
                            const archetypeKey = `${row.meta}|${row.archetype}`;
                            const tournamentDate = row.tournament_date || null; // e.g., "13th February 2026"
                            
                            // Extract the actual counts from CSV
                            // deck_count = how many decks of this archetype play THIS CARD
                            // total_decks_in_archetype = total number of decks in this archetype
                            const deckCountWithThisCard = parseInt(row.deck_count) || 0;
                            const totalDecksInArchetype = parseInt(row.total_decks_in_archetype) || deckCountWithThisCard;
                            
                            // Store total deck count for this archetype (only once per archetype)
                            if (!archetypeKeysSeen.has(archetypeKey)) {
                                archetypeKeysSeen.add(archetypeKey);
                                window.archetypeDeckCounts.set(archetypeKey, {
                                    totalDecks: totalDecksInArchetype,
                                    tournamentDates: new Set()
                                });
                                totalDecksCount += totalDecksInArchetype;
                            }
                            
                            // Track tournament dates for this archetype
                            if (tournamentDate && window.archetypeDeckCounts.has(archetypeKey)) {
                                window.archetypeDeckCounts.get(archetypeKey).tournamentDates.add(tournamentDate);
                            }
                            
                            // Track which archetype-decks this card appears in
                            if (!window.cardDeckCoverageMap.has(cardName)) {
                                window.cardDeckCoverageMap.set(cardName, {
                                    archetypesWithCard: new Map(), // Map<archetypeKey, {deckCount, tournamentDate, maxCount}>
                                    archetypes: new Set(),
                                    tournamentDates: new Set(), // All tournament dates where this card appeared
                                    setCode: row.set_code || null, // Store set code for release date lookup
                                    maxCountOverall: 0 // Track the overall maximum count across all archetypes
                                });
                            }
                            
                            const cardStats = window.cardDeckCoverageMap.get(cardName);
                            // Store set code if not already set (use first occurrence)
                            if (!cardStats.setCode && row.set_code) {
                                cardStats.setCode = row.set_code;
                            }
                            // Track tournament dates
                            if (tournamentDate) {
                                cardStats.tournamentDates.add(tournamentDate);
                            }
                            
                            // Track max_count (how many copies of this card are played in a single deck)
                            const maxCountInDeck = parseInt(row.max_count) || 0;
                            if (maxCountInDeck > cardStats.maxCountOverall) {
                                cardStats.maxCountOverall = maxCountInDeck;
                            }
                            
                            // Store how many decks of this archetype have THIS SPECIFIC CARD
                            // Multiple prints of the same card (e.g. PAL 172 + BRS 132 of Boss's Orders)
                            // are SUM-merged so the coverage reflects ALL decks playing ANY print.
                            // Cap at totalDecksInArchetype to prevent exceeding 100%.
                            const currentEntry = cardStats.archetypesWithCard.get(archetypeKey);
                            const currentCount = currentEntry ? currentEntry.deckCount : 0;
                            const combinedCount = Math.min(totalDecksInArchetype, currentCount + deckCountWithThisCard);
                            cardStats.archetypesWithCard.set(archetypeKey, {
                                deckCount: combinedCount,
                                tournamentDate: tournamentDate || (currentEntry ? currentEntry.tournamentDate : null),
                                maxCount: Math.max(maxCountInDeck, currentEntry ? currentEntry.maxCount : 0),
                                setCode: row.set_code || (currentEntry ? currentEntry.setCode : null)
                            });
                            cardStats.archetypes.add(row.archetype);
                            
                            // NEW: Populate filter maps
                            // Extract main Pokemon (first word of archetype)
                            const mainPokemon = row.archetype.split(' ')[0].trim();
                            if (mainPokemon) {
                                window.allMainPokemons.add(mainPokemon);
                                if (!window.mainPokemonCardsMap.has(mainPokemon)) {
                                    window.mainPokemonCardsMap.set(mainPokemon, new Set());
                                }
                                window.mainPokemonCardsMap.get(mainPokemon).add(cardName);
                            }
                            
                            // Track archetype
                            window.allArchetypes.add(row.archetype);
                            if (!window.archetypeCardsMap.has(row.archetype)) {
                                window.archetypeCardsMap.set(row.archetype, new Set());
                            }
                            window.archetypeCardsMap.get(row.archetype).add(cardName);
                            
                            // Track meta
                            if (processedRows <= 3) {
                                console.log(`[Deck Coverage] Adding meta: "${row.meta}" for card: ${cardName}`);
                            }
                            window.allMetas.add(row.meta);
                            if (!window.metaCardsMap.has(row.meta)) {
                                window.metaCardsMap.set(row.meta, new Set());
                            }
                            window.metaCardsMap.get(row.meta).add(cardName);
                        });
                        
                        console.log(`[Deck Coverage] Processed ${processedRows} rows from ${source.name}`);
                        console.log(`[Deck Coverage] Loaded from ${source.name}`);
                    } catch (err) {
                        console.error(`[Deck Coverage] Error loading ${source.name} deck coverage:`, err);
                    }
                }
                
                // Set total unique decks from all sources combined
                window.totalUniqueDecks = totalDecksCount;
                
                console.log(`[Deck Coverage] Total unique decks: ${window.totalUniqueDecks}`);
                console.log(`[Deck Coverage] Cards with coverage data: ${window.cardDeckCoverageMap.size}`);
                console.log(`[Filter Data] Main Pokemons: ${window.allMainPokemons.size}, Archetypes: ${window.allArchetypes.size}, Metas: ${window.allMetas.size}`);
                
                // Log metas for debugging
                console.log(`[Filter Data] Available Metas:`, Array.from(window.allMetas).sort());
                if (window.metaCardsMap.size > 0) {
                    window.metaCardsMap.forEach((cards, meta) => {
                        console.log(`  Meta "${meta}": ${cards.size} unique cards`);
                    });
                }
                
            } catch (error) {
                console.error('Error loading deck coverage stats:', error);
            }
        }
        
        async function loadFormatsForCards() {
            try {
                const uniqueFormats = new Set();
                
                // 1. Load formats from current meta card data
                try {
                    const response = await fetch(BASE_PATH + 'current_meta_card_data.csv');
                    const csvText = await response.text();
                    
                    // Parse CSV manually (semicolon separated)
                    const lines = csvText.split('\n').filter(line => line.trim());
                    const headers = lines[0].split(';');
                    const metaIndex = headers.indexOf('meta');
                    
                    if (metaIndex !== -1) {
                        // Extract unique meta/format values
                        for (let i = 1; i < lines.length; i++) {
                            const cells = lines[i].split(';');
                            if (cells[metaIndex] && cells[metaIndex].trim()) {
                                uniqueFormats.add(cells[metaIndex].trim());
                            }
                        }
                        console.log(`[Cards Tab] Loaded formats from current meta`);
                    }
                } catch (err) {
                    console.warn('[Cards Tab] Could not load current_meta_card_data.csv:', err);
                }
                
                // 2. Load formats from tournament scraper JH overview
                try {
                    const response = await fetch(BASE_PATH + 'tournament_cards_data_overview.csv');
                    const csvText = await response.text();
                    
                    // Parse CSV (semicolon separated)
                    const lines = csvText.split('\n').filter(line => line.trim());
                    const headers = lines[0].split(';');
                    const formatIndex = headers.indexOf('format');
                    
                    if (formatIndex !== -1) {
                        // Extract unique format values
                        for (let i = 1; i < lines.length; i++) {
                            const cells = lines[i].split(';');
                            if (cells[formatIndex] && cells[formatIndex].trim()) {
                                uniqueFormats.add(cells[formatIndex].trim());
                            }
                        }
                        console.log(`[Cards Tab] Loaded formats from tournament overview`);
                    }
                } catch (err) {
                    console.warn('[Cards Tab] Could not load tournament_cards_data_overview.csv:', err);
                }
                
                // Map Meta Play! and Meta Live to SVI-PFL (don't show them separately)
                const formatMapping = {
                    'Meta Play!': 'SVI-PFL',
                    'Meta Live': 'SVI-PFL'
                };
                
                // Convert mapped formats
                const mappedFormats = new Set();
                uniqueFormats.forEach(format => {
                    const mapped = formatMapping[format] || format;
                    mappedFormats.add(mapped);
                });
                
                // Create formats array sorted (newest to oldest - reverse alphabetical for SVI-XXX format)
                const sortedFormats = Array.from(mappedFormats).sort((a, b) => b.localeCompare(a));
                window.cardFormatsData = {
                    formats: sortedFormats.map(format => ({
                        code: format,
                        name: format,
                        sets: [] // Will be populated if needed
                    }))
                };
                
                // Store mapping globally for filtering (reverse mapping too)
                window.metaFormatMapping = formatMapping;
                
                console.log(`[Cards Tab] Loaded ${sortedFormats.length} total unique formats:`, sortedFormats);
                console.log(`[Cards Tab] Format mappings applied:`, formatMapping);
            } catch (error) {
                console.error('[Cards Tab] Error loading formats:', error);
                window.cardFormatsData = { formats: [] };
                window.metaFormatMapping = {};
            }
        }
        
        function populateMetaFormatFilter() {
            const container = document.getElementById('metaFormatOptions');
            if (!container) return;
            
            // Keep existing base options (Total, all playables, City League)
            // Add formats dynamically
            if (window.cardFormatsData && window.cardFormatsData.formats && window.cardFormatsData.formats.length > 0) {
                window.cardFormatsData.formats.forEach(format => {
                    const label = document.createElement('label');
                    label.style.display = 'block';
                    label.style.padding = '6px';
                    label.style.cursor = 'pointer';
                    label.style.borderRadius = '4px';
                    label.innerHTML = `<input type="checkbox" value="meta:${format.code}" onchange="filterAndRenderCards()"> ${format.name}`;
                    container.appendChild(label);
                });
                console.log(`[Cards Tab] Populated ${window.cardFormatsData.formats.length} formats in filter`);
            } else {
                console.warn('[Cards Tab] No formats available to populate');
            }
        }
        
        async function populateSetFilter(cards) {
            const container = document.getElementById('setFilterOptions');
            if (!container) return;
            
            try {
                // Load pokemon_sets_mapping.csv to get proper set order (newest first)
                const response = await fetch('pokemon_sets_mapping.csv');
                const csvText = await response.text();
                const lines = csvText.split('\n').filter(line => line.trim() && !line.startsWith('set_code'));
                
                // Extract set codes in order (already sorted newest to oldest in CSV)
                const orderedSets = lines.map(line => {
                    const parts = line.split(',');
                    return parts[0]?.trim();
                }).filter(set => set);
                
                // Get unique English sets from cards only
                const availableSets = new Set();
                cards.forEach(c => {
                    if (c && c.set && c.set !== 'set' && window.englishSetCodes && window.englishSetCodes.has(c.set)) {
                        availableSets.add(c.set);
                    }
                });
                
                // Filter ordered sets to only include those that exist in cards (and are English)
                const setsToShow = orderedSets.filter(set => availableSets.has(set));
                
                console.log(`[Cards Tab] Showing ${setsToShow.length} English sets (newest first)`);
                
                container.innerHTML = '';
                setsToShow.forEach(set => {
                    const label = document.createElement('label');
                    label.style.display = 'block';
                    label.style.padding = '6px';
                    label.style.cursor = 'pointer';
                    label.innerHTML = `<input type="checkbox" value="${set}"> ${set}`;
                    container.appendChild(label);
                });
            } catch (error) {
                console.error('[Cards Tab] Error loading set order:', error);
                // Fallback: Get only English sets, alphabetically
                const sets = [...new Set(cards
                    .filter(c => c && c.set && c.set !== 'set' && window.englishSetCodes && window.englishSetCodes.has(c.set))
                    .map(c => c.set)
                )].sort();
                
                container.innerHTML = '';
                sets.forEach(set => {
                    const label = document.createElement('label');
                    label.style.display = 'block';
                    label.style.padding = '6px';
                    label.style.cursor = 'pointer';
                    label.innerHTML = `<input type="checkbox" value="${set}"> ${set}`;
                    container.appendChild(label);
                });
            }
        }
        
        function populateMainPokemonFilter() {
            const container = document.getElementById('mainPokemonList');
            if (!container || !window.allMainPokemons) return;
            
            // Sort alphabetically
            const sortedMainPokemons = Array.from(window.allMainPokemons).sort();
            
            // Store all items for search filtering
            window.mainPokemonFilterItems = [];
            
            container.innerHTML = '';
            sortedMainPokemons.forEach(pokemon => {
                const label = document.createElement('label');
                label.style.display = 'block';
                label.style.padding = '6px';
                label.style.cursor = 'pointer';
                label.style.borderRadius = '4px';
                label.innerHTML = `<input type="checkbox" value="${pokemon}" onchange="filterArchetypesByMainPokemon(); filterAndRenderCards()"> ${pokemon}`;
                container.appendChild(label);
                window.mainPokemonFilterItems.push({ element: label, name: pokemon.toLowerCase() });
            });
            
            console.log(`[Cards Tab] Populated ${sortedMainPokemons.length} main pokemons`);
        }
        
        function populateArchetypeFilter() {
            const container = document.getElementById('archetypeList');
            if (!container || !window.allArchetypes) return;
            
            // Sort alphabetically
            const sortedArchetypes = Array.from(window.allArchetypes).sort();
            
            // Store all items for search filtering
            window.archetypeFilterItems = [];
            window.allArchetypeItems = []; // Store all archetypes for filtering
            
            container.innerHTML = '';
            sortedArchetypes.forEach(archetype => {
                const label = document.createElement('label');
                label.style.display = 'block';
                label.style.padding = '6px';
                label.style.cursor = 'pointer';
                label.style.borderRadius = '4px';
                label.innerHTML = `<input type="checkbox" value="${archetype}" onchange="filterAndRenderCards()"> ${archetype}`;
                container.appendChild(label);
                const item = { element: label, name: archetype.toLowerCase(), archetype: archetype };
                window.archetypeFilterItems.push(item);
                window.allArchetypeItems.push(item);
            });
            
            console.log(`[Cards Tab] Populated ${sortedArchetypes.length} archetypes`);
        }
        
        function filterArchetypesByMainPokemon() {
            if (!window.allArchetypeItems) return;
            
            // Get selected main pokemons
            const selectedMainPokemons = Array.from(document.querySelectorAll('#mainPokemonList input:checked')).map(cb => cb.value.toLowerCase());
            
            // If no main pokemon selected, show all archetypes
            if (selectedMainPokemons.length === 0) {
                window.archetypeFilterItems = window.allArchetypeItems.slice();
                window.allArchetypeItems.forEach(item => {
                    item.element.style.display = 'block';
                });
                // Reset search filter
                filterArchetypeList();
                return;
            }
            
            // Filter archetypes that contain any of the selected main pokemons
            window.allArchetypeItems.forEach(item => {
                const archetypeLower = item.name;
                let matches = false;
                
                for (const mainPokemon of selectedMainPokemons) {
                    if (archetypeLower.includes(mainPokemon)) {
                        matches = true;
                        break;
                    }
                }
                
                if (matches) {
                    item.element.style.display = 'block';
                } else {
                    item.element.style.display = 'none';
                    // Uncheck if hidden
                    const checkbox = item.element.querySelector('input[type="checkbox"]');
                    if (checkbox && checkbox.checked) {
                        checkbox.checked = false;
                    }
                }
            });
            
            // Update archetypeFilterItems to only include visible items for search
            window.archetypeFilterItems = window.allArchetypeItems.filter(item => item.element.style.display !== 'none');
            
            // Apply current search filter
            filterArchetypeList();
            
            console.log(`[Cards Tab] Filtered archetypes by main pokemon: ${selectedMainPokemons.join(', ')} - ${window.archetypeFilterItems.length} visible`);
        }
        
        function populateMetaFilter() {
            const container = document.getElementById('metaFormatOptions');
            if (!container || !window.allMetas) return;
            
            // Sort by meta name (reverse chronological for date-based metas)
            const sortedMetas = Array.from(window.allMetas).sort().reverse();
            
            // Add separator before metas
            const separator = document.createElement('div');
            separator.style.cssText = 'border-top: 2px solid #ddd; margin: 10px 0; padding-top: 10px;';
            separator.innerHTML = '<strong style="display: block; padding: 6px; color: #555;">🗓️ Tournament Formats:</strong>';
            container.appendChild(separator);
            
            sortedMetas.forEach(meta => {
                const label = document.createElement('label');
                label.style.display = 'block';
                label.style.padding = '6px';
                label.style.cursor = 'pointer';
                label.style.borderRadius = '4px';
                label.innerHTML = `<input type="checkbox" value="meta:${meta}" onchange="filterAndRenderCards()"> ${meta}`;
                container.appendChild(label);
            });
            
            console.log(`[Cards Tab] Populated ${sortedMetas.length} metas in Meta/Format filter`);
        }
        
        function filterMainPokemonList() {
            if (!window.mainPokemonFilterItems) return;
            
            const searchInput = document.getElementById('mainPokemonSearch');
            const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
            
            window.mainPokemonFilterItems.forEach(item => {
                if (searchTerm === '' || item.name.includes(searchTerm)) {
                    item.element.style.display = 'block';
                } else {
                    item.element.style.display = 'none';
                }
            });
        }
        
        function filterArchetypeList() {
            // Get all archetype items (respecting main pokemon filter)
            const itemsToFilter = window.archetypeFilterItems || [];
            
            const searchInput = document.getElementById('archetypeSearch');
            const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
            
            // Filter within currently visible items (after main pokemon filter)
            itemsToFilter.forEach(item => {
                if (searchTerm === '' || item.name.includes(searchTerm)) {
                    item.element.style.display = 'block';
                } else {
                    item.element.style.display = 'none';
                }
            });
        }
        
        function setupCardFilters() {
            const searchInput = document.getElementById('cardSearch');
            
            // Search input with autocomplete
            if (searchInput) {
                // Show autocomplete on input
                searchInput.addEventListener('input', (e) => {
                    showCardAutocomplete(e.target.value);
                    filterAndRenderCards();
                });
                
                // Hide autocomplete on blur (with delay to allow clicking)
                searchInput.addEventListener('blur', () => {
                    setTimeout(() => hideCardAutocomplete(), 200);
                });
                
                // Hide autocomplete on ESC
                searchInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        hideCardAutocomplete();
                    }
                });
            }
            
            // All checkboxes in filter options
            const filterContainers = document.querySelectorAll('.cards-filter-options');
            filterContainers.forEach(container => {
                const checkboxes = container.querySelectorAll('input[type="checkbox"]');
                checkboxes.forEach(cb => {
                    cb.addEventListener('change', filterAndRenderCards);
                });
            });
            
            // Coverage radio buttons: clicking an already-selected radio deselects it
            document.querySelectorAll('#deckCoverageFilterOptions input[type="radio"]').forEach(radio => {
                radio.addEventListener('click', function() {
                    if (this.dataset.wasChecked === 'true') {
                        this.checked = false;
                        this.dataset.wasChecked = 'false';
                        filterAndRenderCards();
                    } else {
                        document.querySelectorAll('#deckCoverageFilterOptions input[type="radio"]').forEach(r => r.dataset.wasChecked = 'false');
                        this.dataset.wasChecked = 'true';
                    }
                });
            });
        }
        
        function showCardAutocomplete(searchTerm) {
            const dropdown = document.getElementById('cardSearchAutocomplete');
            if (!dropdown || !window.allCardsData) return;
            
            // Hide if search is too short
            if (!searchTerm || searchTerm.length < 2) {
                hideCardAutocomplete();
                return;
            }
            
            const lowerSearch = searchTerm.toLowerCase();
            
            // Find matching cards (limit to 15 suggestions)
            const matches = [];
            const nameSet = new Set(); // Avoid duplicate names
            
            for (const card of window.allCardsData) {
                if (!card.name || nameSet.has(card.name)) continue;
                
                if (card.name.toLowerCase().includes(lowerSearch)) {
                    matches.push(card);
                    nameSet.add(card.name);
                    
                    if (matches.length >= 15) break;
                }
            }
            
            if (matches.length === 0) {
                hideCardAutocomplete();
                return;
            }
            
            // Build dropdown HTML
            dropdown.innerHTML = matches.map(card => {
                // Count how many versions exist
                const versions = window.allCardsData.filter(c => c.name === card.name).length;
                
                return `
                    <div class="cards-autocomplete-item" onclick="selectCardFromAutocomplete('${card.name.replace(/'/g, "\\'").replace(/"/g, '&quot;')}')">
                        <img src="${card.image_url}" alt="${card.name}" loading="lazy">
                        <div class="cards-autocomplete-item-info">
                            <div class="cards-autocomplete-item-name">${card.name}</div>
                            <div class="cards-autocomplete-item-meta">${card.set} ${card.number} · ${card.type || 'Unknown'}</div>
                        </div>
                        <div class="cards-autocomplete-count">${versions} version${versions > 1 ? 's' : ''}</div>
                    </div>
                `;
            }).join('');
            
            dropdown.style.display = 'block';
        }
        
        function hideCardAutocomplete() {
            const dropdown = document.getElementById('cardSearchAutocomplete');
            if (dropdown) {
                dropdown.style.display = 'none';
            }
        }
        
        function selectCardFromAutocomplete(cardName) {
            const searchInput = document.getElementById('cardSearch');
            if (searchInput) {
                searchInput.value = cardName;
                hideCardAutocomplete();
                filterAndRenderCards();
            }
        }
        
        function resetCardFilters() {
            // Card search
            const searchInput = document.getElementById('cardSearch');
            if (searchInput) searchInput.value = '';
            
            // Main Pokemon search
            const mainPokemonSearch = document.getElementById('mainPokemonSearch');
            if (mainPokemonSearch) {
                mainPokemonSearch.value = '';
                filterMainPokemonList();
            }
            
            // Archetype search
            const archetypeSearch = document.getElementById('archetypeSearch');
            if (archetypeSearch) {
                archetypeSearch.value = '';
                filterArchetypeList();
            }
            
            // Uncheck all checkboxes and coverage radios
            const allCheckboxes = document.querySelectorAll('.cards-filter-options input[type="checkbox"], #mainPokemonList input[type="checkbox"], #archetypeList input[type="checkbox"]');
            allCheckboxes.forEach(cb => cb.checked = false);
            document.querySelectorAll('#deckCoverageFilterOptions input[type="radio"]').forEach(r => r.checked = false);
            
            // Reset archetype filter (show all archetypes again)
            filterArchetypesByMainPokemon();
            
            // Reset pagination and show all mode
            currentCardsPage = 1;
            showAllCards = false;
            
            // Check "Total" by default
            const totalCheckbox = document.querySelector('#metaFormatOptions input[value="total"]');
            if (totalCheckbox) totalCheckbox.checked = true;
            
            filterAndRenderCards();
        }
        
        function filterAndRenderCards() {
            if (!window.allCardsData || window.allCardsData.length === 0) {
                console.warn('[Cards Tab] No cards loaded yet');
                return;
            }
            
            // Reset to page 1 when filters change (unless showing all cards)
            if (!showAllCards) {
                currentCardsPage = 1;
            }
            
            const searchInput = document.getElementById('cardSearch');
            const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
            
            // Get selected values from checkboxes
            const selectedMetas = Array.from(document.querySelectorAll('#metaFormatOptions input:checked')).map(cb => cb.value);
            const selectedSets = Array.from(document.querySelectorAll('#setFilterOptions input:checked')).map(cb => cb.value);
            const selectedRarities = Array.from(document.querySelectorAll('#rarityFilterOptions input:checked')).map(cb => cb.value);
            const selectedCategories = Array.from(document.querySelectorAll('#categoryFilterOptions input:checked')).map(cb => cb.value);
            const selectedDeckCoverages = Array.from(document.querySelectorAll('#deckCoverageFilterOptions input:checked')).map(cb => parseFloat(cb.value));
            const selectedMainPokemons = Array.from(document.querySelectorAll('#mainPokemonList input:checked')).map(cb => cb.value);
            const selectedArchetypes = Array.from(document.querySelectorAll('#archetypeList input:checked')).map(cb => cb.value);
            const selectedMetaFilters = Array.from(document.querySelectorAll('#metaFormatOptions input:checked')).filter(cb => cb.value.startsWith('meta:')).map(cb => cb.value.replace('meta:', ''));
            
            console.log(`[Cards Tab] Filtering - Search: "${searchTerm}", Metas: ${selectedMetas.length}, Sets: ${selectedSets.length}, Rarities: ${selectedRarities.length}, Categories: ${selectedCategories.length}, DeckCov: ${selectedDeckCoverages.length}, MainPkm: ${selectedMainPokemons.length}, Archetypes: ${selectedArchetypes.length}, MetaFilters: ${selectedMetaFilters.length}`);
            console.log(`[Filter Debug] Selected Meta Values:`, selectedMetas);
            console.log(`[Filter Debug] Selected Meta Filters (meta: prefix):`, selectedMetaFilters);
            
            let passedFilters = 0;
            let failedSearch = 0;
            let failedMeta = 0;
            let failedSet = 0;
            let failedRarity = 0;
            let failedCategory = 0;
            let failedDeckCoverage = 0;
            let failedMainPokemon = 0;
            let failedArchetype = 0;
            let failedMetaFilter = 0;
            let failedValidation = 0;
            
            window.filteredCardsData = window.allCardsData.filter(card => {
                // Skip invalid cards
                if (!card || !card.name || card.name === 'name' || !card.image_url) {
                    failedValidation++;
                    return false;
                }
                
                // Search filter - Omni-Search: name (EN/DE), set+number, Pokédex number
                if (searchTerm) {
                    const nameEn = (card.name_en || card.name || '').toLowerCase();
                    const nameDe = (card.name_de || '').toLowerCase();
                    const setCode = (card.set || '').toLowerCase();
                    const cardNum = String(card.number || '').toLowerCase();
                    const dexNum = (card.pokedex_number || '').toString();
                    const setNumSpace = `${setCode} ${cardNum}`;
                    const setNumCombined = `${setCode}${cardNum}`;
                    const matchesSearch = nameEn.includes(searchTerm) ||
                                          nameDe.includes(searchTerm) ||
                                          setNumSpace.includes(searchTerm) ||
                                          setNumCombined.includes(searchTerm) ||
                                          (dexNum !== '' && dexNum === searchTerm) ||
                                          (searchTerm.length >= 3 && dexNum !== '' && dexNum.includes(searchTerm));
                    if (!matchesSearch) {
                        failedSearch++;
                        return false;
                    }
                }
                
                // Meta/Format filter (Total, All Playables, City League)
                // NOTE: Meta-Zeiträume (meta:XXX) are handled later in "Meta Filter" section
                const basicMetaFilters = selectedMetas.filter(m => !m.startsWith('meta:'));
                if (basicMetaFilters.length > 0) {
                    let metaMatch = false;
                    const cardNameNorm = normalizeCardName(card.name);
                    
                    if (basicMetaFilters.includes('total')) {
                        metaMatch = true; // Show all cards
                    } else if (basicMetaFilters.includes('all_playables')) {
                        // All playables: City League + Current Meta + Tournament
                        if (window.playableCardsSet && window.playableCardsSet.has(cardNameNorm)) {
                            metaMatch = true;
                        }
                    } else if (basicMetaFilters.includes('city_league')) {
                        // City League only: Only cards from City League decks
                        if (window.cityLeagueCardsSet && window.cityLeagueCardsSet.has(cardNameNorm)) {
                            metaMatch = true;
                        }
                    }
                    
                    if (!metaMatch) {
                        failedMeta++;
                        return false;
                    }
                }
                
                // Set filter
                if (selectedSets.length > 0 && !selectedSets.includes(card.set)) {
                    failedSet++;
                    return false;
                }
                
                // Rarity filter
                if (selectedRarities.length > 0 && !selectedRarities.includes(card.rarity)) {
                    failedRarity++;
                    return false;
                }
                
                // Category filter
                if (selectedCategories.length > 0) {
                    let categoryMatch = false;
                    const type = card.type || '';
                    
                    for (const category of selectedCategories) {
                        if (category === 'pokemon_all') {
                            const isPokemon = /^[GRWLPFDMNCYDL]/.test(type) && !['Item', 'Supporter', 'Stadium', 'Tool', 'Energy'].some(t => type.includes(t));
                            if (isPokemon) { categoryMatch = true; break; }
                        } else if (category === 'pokemon_grass') {
                            if (type.startsWith('G')) { categoryMatch = true; break; }
                        } else if (category === 'pokemon_fire') {
                            if (type.startsWith('R')) { categoryMatch = true; break; }
                        } else if (category === 'pokemon_water') {
                            if (type.startsWith('W')) { categoryMatch = true; break; }
                        } else if (category === 'pokemon_lightning') {
                            if (type.startsWith('L')) { categoryMatch = true; break; }
                        } else if (category === 'pokemon_psychic') {
                            if (type.startsWith('P')) { categoryMatch = true; break; }
                        } else if (category === 'pokemon_fighting') {
                            if (type.startsWith('F')) { categoryMatch = true; break; }
                        } else if (category === 'pokemon_darkness') {
                            if (type.startsWith('D')) { categoryMatch = true; break; }
                        } else if (category === 'pokemon_metal') {
                            if (type.startsWith('M')) { categoryMatch = true; break; }
                        } else if (category === 'pokemon_dragon') {
                            if (type.startsWith('N')) { categoryMatch = true; break; }
                        } else if (category === 'pokemon_colorless') {
                            if (type.startsWith('C')) { categoryMatch = true; break; }
                        } else if (category === 'pokemon_fairy') {
                            if (type.startsWith('Y')) { categoryMatch = true; break; }
                        } else if (category === 'supporter') {
                            if (type.includes('Supporter')) { categoryMatch = true; break; }
                        } else if (category === 'item') {
                            if (type.includes('Item') && !type.includes('Tool')) { categoryMatch = true; break; }
                        } else if (category === 'tool') {
                            if (type.includes('Tool')) { categoryMatch = true; break; }
                        } else if (category === 'stadium') {
                            if (type.includes('Stadium')) { categoryMatch = true; break; }
                        } else if (category === 'special_energy') {
                            if (type.includes('Special Energy')) { categoryMatch = true; break; }
                        }
                    }
                    
                    if (!categoryMatch) {
                        failedCategory++;
                        return false;
                    }
                }
                
                // Deck Coverage filter
                if (selectedDeckCoverages.length > 0 && window.cardDeckCoverageMap) {
                    // Multi-strategy name lookup: normalizeCardName first, then plain lowercase as fallback
                    let coverageStats = window.cardDeckCoverageMap.get(normalizeCardName(card.name));
                    if (!coverageStats) {
                        coverageStats = window.cardDeckCoverageMap.get(card.name.toLowerCase());
                    }
                    
                    // Calculate DYNAMIC coverage based on active filters
                    // If no coverage entry found, percentage stays 0 and will fail the threshold
                    let percentage = 0;
                    if (coverageStats) {
                        const dynamicCoverage = calculateDynamicCoverage(card.name);
                        percentage = dynamicCoverage ? dynamicCoverage.percentage : 0;
                    }
                    
                    let coverageMatch = false;
                    
                    // Check if card meets any of the selected coverage thresholds
                    for (const threshold of selectedDeckCoverages) {
                        if (threshold === 100) {
                            // Exactly 100%
                            if (percentage >= 99.5) { // Allow small rounding errors
                                coverageMatch = true;
                                break;
                            }
                        } else {
                            // Greater than or equal to threshold
                            if (percentage >= threshold) {
                                coverageMatch = true;
                                break;
                            }
                        }
                    }
                    
                    if (!coverageMatch) {
                        failedDeckCoverage++;
                        return false;
                    }
                }
                
                // NEW: Main Pokemon Filter - Show cards from decks with selected main pokemon
                if (selectedMainPokemons.length > 0) {
                    const cardNameNorm = normalizeCardName(card.name);
                    let mainPokemonMatch = false;
                    
                    for (const mainPokemon of selectedMainPokemons) {
                        if (window.mainPokemonCardsMap && window.mainPokemonCardsMap.has(mainPokemon)) {
                            const cardsForMainPokemon = window.mainPokemonCardsMap.get(mainPokemon);
                            if (cardsForMainPokemon.has(cardNameNorm)) {
                                mainPokemonMatch = true;
                                break;
                            }
                        }
                    }
                    
                    if (!mainPokemonMatch) {
                        failedMainPokemon++;
                        return false;
                    }
                }
                
                // NEW: Archetype Filter - Show cards from selected archetypes
                if (selectedArchetypes.length > 0) {
                    const cardNameNorm = normalizeCardName(card.name);
                    let archetypeMatch = false;
                    
                    for (const archetype of selectedArchetypes) {
                        if (window.archetypeCardsMap && window.archetypeCardsMap.has(archetype)) {
                            const cardsForArchetype = window.archetypeCardsMap.get(archetype);
                            if (cardsForArchetype.has(cardNameNorm)) {
                                archetypeMatch = true;
                                break;
                            }
                        }
                    }
                    
                    if (!archetypeMatch) {
                        failedArchetype++;
                        return false;
                    }
                }
                
                // NEW: Meta Filter - Show cards from selected metas (combined with archetype if both selected)
                if (selectedMetaFilters.length > 0) {
                    const cardNameNorm = normalizeCardName(card.name);
                    let metaFilterMatch = false;
                    
                    // Debug log for first card only
                    if (passedFilters === 0 && failedMetaFilter === 0) {
                        console.log(`[Meta Filter Debug] Checking meta filters:`, selectedMetaFilters);
                        console.log(`[Meta Filter Debug] Available metas in metaCardsMap:`, window.metaCardsMap ? Array.from(window.metaCardsMap.keys()) : 'metaCardsMap not loaded');
                        if (window.metaCardsMap) {
                            selectedMetaFilters.forEach(meta => {
                                if (window.metaCardsMap.has(meta)) {
                                    console.log(`  Meta "${meta}" found with ${window.metaCardsMap.get(meta).size} cards`);
                                } else {
                                    console.log(`  Meta "${meta}" NOT FOUND in metaCardsMap`);
                                }
                            });
                        }
                    }
                    
                    // If archetype is also selected, check intersection
                    if (selectedArchetypes.length > 0) {
                        // Card must be in the intersection of selected meta AND selected archetype
                        for (const meta of selectedMetaFilters) {
                            if (window.metaCardsMap && window.metaCardsMap.has(meta)) {
                                const cardsForMeta = window.metaCardsMap.get(meta);
                                if (cardsForMeta.has(cardNameNorm)) {
                                    // Card is in this meta - but we already checked archetype above
                                    // So if we got here, card is in both archetype AND meta
                                    metaFilterMatch = true;
                                    break;
                                }
                            }
                        }
                    } else {
                        // No archetype selected, just check meta
                        for (const meta of selectedMetaFilters) {
                            if (window.metaCardsMap && window.metaCardsMap.has(meta)) {
                                const cardsForMeta = window.metaCardsMap.get(meta);
                                if (cardsForMeta.has(cardNameNorm)) {
                                    metaFilterMatch = true;
                                    break;
                                }
                            }
                        }
                    }
                    
                    if (!metaFilterMatch) {
                        failedMetaFilter++;
                        return false;
                    }
                }
                
                passedFilters++;
                return true;
            });
            
            console.log(`[Cards Tab] Filter results:`);
            console.log(`  - Passed all filters: ${passedFilters}`);
            console.log(`  - Failed validation: ${failedValidation}`);
            console.log(`  - Failed search: ${failedSearch}`);
            console.log(`  - Failed meta: ${failedMeta}`);
            console.log(`  - Failed set: ${failedSet}`);
            console.log(`  - Failed rarity: ${failedRarity}`);
            console.log(`  - Failed category: ${failedCategory}`);
            console.log(`  - Failed deck coverage: ${failedDeckCoverage}`);
            console.log(`  - Failed main pokemon: ${failedMainPokemon}`);
            console.log(`  - Failed archetype: ${failedArchetype}`);
            console.log(`  - Failed meta filter: ${failedMetaFilter}`);
            console.log(`[Cards Tab] Filtered ${window.filteredCardsData.length} cards from ${window.allCardsData.length} total`);
            
            // Deduplicate cards (same card name, different prints) - prefer print from coverage data
            // Only deduplicate if showOnlyOnePrint is enabled
            if (showOnlyOnePrint) {
                deduplicateCardsForDisplay(window.filteredCardsData);
            }
            
            // Apply sorting based on user selection
            sortCardsDatabase(window.filteredCardsData);
            
            renderCardDatabase(window.filteredCardsData);
        }
        
        function togglePrintView() {
            /**
             * Toggle between showing all prints vs. only one print per card
             */
            showOnlyOnePrint = !showOnlyOnePrint;
            
            // Update button appearance
            const toggleBtn = document.getElementById('printViewToggle');
            if (toggleBtn) {
                if (showOnlyOnePrint) {
                    toggleBtn.textContent = '📦 1 Print per Card (Budget)';
                    toggleBtn.style.background = '#9b59b6';
                    toggleBtn.style.borderColor = '#9b59b6';
                } else {
                    toggleBtn.textContent = '🖼️ All Prints';
                    toggleBtn.style.background = '#3498db';
                    toggleBtn.style.borderColor = '#3498db';
                }
            }
            
            console.log(`[Print View] Toggled to: ${showOnlyOnePrint ? 'Only 1 Print' : 'All Prints'}`);
            
            // Re-render with new setting
            filterAndRenderCards();
        }
        
        function deduplicateCardsForDisplay(cards) {
            /**
             * Remove duplicate cards (same name, different prints)
             * Prefer the print that appears most in the CURRENTLY FILTERED archetypes
             * Otherwise prefer: newest set with lowest rarity
             * Modifies the array in-place
             */
            const cardsByName = new Map();
            
            // Group cards by name
            cards.forEach(card => {
                const cardName = card.name.toLowerCase();
                if (!cardsByName.has(cardName)) {
                    cardsByName.set(cardName, []);
                }
                cardsByName.get(cardName).push(card);
            });
            
            // Get active filters to determine which archetypes are relevant
            const selectedMainPokemons = Array.from(document.querySelectorAll('#mainPokemonList input:checked')).map(cb => cb.value);
            const selectedArchetypes = Array.from(document.querySelectorAll('#archetypeList input:checked')).map(cb => cb.value);
            const selectedMetaFilters = Array.from(document.querySelectorAll('#metaFormatOptions input:checked')).filter(cb => cb.value.startsWith('meta:')).map(cb => cb.value.replace('meta:', ''));
            
            // For each card name, choose the best print
            const selectedCards = [];
            
            cardsByName.forEach((prints, cardName) => {
                if (prints.length === 1) {
                    selectedCards.push(prints[0]);
                    return;
                }
                
                // Multiple prints exist - choose the best one based on FILTERED coverage data
                const coverageData = window.cardDeckCoverageMap ? window.cardDeckCoverageMap.get(cardName) : null;
                
                if (coverageData && (selectedMainPokemons.length > 0 || selectedArchetypes.length > 0 || selectedMetaFilters.length > 0)) {
                    // Calculate which set_code appears most in the FILTERED archetypes
                    const setCodeCounts = new Map();
                    
                    if (cardName === 'hawlucha' || cardName === 'charmander' || cardName === 'charmeleon') {
                        console.log(`[Dedup Debug] ${cardName}: Active filters - MainPokemon: [${selectedMainPokemons.join(', ')}], Archetype: [${selectedArchetypes.join(', ')}], Meta: [${selectedMetaFilters.join(', ')}]`);
                        console.log(`[Dedup Debug] ${cardName}: Has ${coverageData.archetypesWithCard.size} archetypes in coverage data`);
                    }
                    
                    coverageData.archetypesWithCard.forEach((entry, archetypeKey) => {
                        const [meta, archetype] = archetypeKey.split('|');
                        const mainPokemon = archetype.split(' ')[0];
                        
                        // Check if this archetype matches active filters
                        let matchesFilters = true;
                        if (selectedMainPokemons.length > 0 && !selectedMainPokemons.includes(mainPokemon)) {
                            matchesFilters = false;
                        }
                        if (selectedArchetypes.length > 0 && !selectedArchetypes.includes(archetype)) {
                            matchesFilters = false;
                        }
                        if (selectedMetaFilters.length > 0 && !selectedMetaFilters.includes(meta)) {
                            matchesFilters = false;
                        }
                        
                        if (cardName === 'hawlucha' || cardName === 'charmander' || cardName === 'charmeleon') {
                            if (matchesFilters && entry.setCode) {
                                console.log(`[Dedup Debug] ${cardName}: Matched archetype ${archetypeKey} with setCode ${entry.setCode}`);
                            }
                        }
                        
                        if (matchesFilters && entry.setCode) {
                            const count = setCodeCounts.get(entry.setCode) || 0;
                            const deckCount = typeof entry === 'number' ? entry : (entry.deckCount || 0);
                            setCodeCounts.set(entry.setCode, count + deckCount);
                        }
                    });
                    
                    // Find the most common set_code in filtered archetypes
                    if (setCodeCounts.size > 0) {
                        let mostCommonSet = null;
                        let highestCount = 0;
                        setCodeCounts.forEach((count, setCode) => {
                            if (count > highestCount) {
                                highestCount = count;
                                mostCommonSet = setCode;
                            }
                        });
                        
                        // Try to find print matching the most common set
                        if (mostCommonSet) {
                            const matchingPrint = prints.find(p => p.set === mostCommonSet);
                            if (matchingPrint) {
                                if (cardName === 'hawlucha' || cardName === 'charmander' || cardName === 'charmeleon') {
                                    console.log(`[Dedup Debug] ${cardName}: Selected ${mostCommonSet} print (most common in filtered archetypes)`);
                                }
                                selectedCards.push(matchingPrint);
                                return;
                            } else {
                                if (cardName === 'hawlucha' || cardName === 'charmander' || cardName === 'charmeleon') {
                                    console.log(`[Dedup Debug] ${cardName}: Most common set ${mostCommonSet} but no matching print found. Available sets:`, prints.map(p => p.set));
                                }
                            }
                        } else {
                            if (cardName === 'hawlucha' || cardName === 'charmander' || cardName === 'charmeleon') {
                                console.log(`[Dedup Debug] ${cardName}: No most common set found (setCodeCounts empty)`);
                            }
                        }
                    } else {
                        if (cardName === 'hawlucha' || cardName === 'charmander' || cardName === 'charmeleon') {
                            console.log(`[Dedup Debug] ${cardName}: setCodeCounts.size = 0, no archetypes matched filters`);
                        }
                    }
                } else {
                    if (cardName === 'hawlucha' || cardName === 'charmander' || cardName === 'charmeleon') {
                        console.log(`[Dedup Debug] ${cardName}: No coverage data or no filters active (coverage: ${!!coverageData}, filters: ${selectedMainPokemons.length > 0 || selectedArchetypes.length > 0 || selectedMetaFilters.length > 0})`);
                    }
                }
                
                // No coverage data or no matching print - use standard priority
                // Prefer: Common/Uncommon from newest set
                const setOrder = {
                    // 2026 Sets (newest first)
                    'M3': 116, 'ASC': 115, 'PFL': 114, 'MEG': 113, 'MEE': 112, 'MEP': 111,
                    'BLK': 110, 'WHT': 109, 'DRI': 108, 'JTG': 107, 'PRE': 106, 'SSP': 105,
                    // 2024-2025 Sets
                    'SCR': 104, 'SFA': 103, 'TWM': 102, 'TEF': 101, 'PAF': 100, 'PAR': 99,
                    'MEW': 98, 'OBF': 97, 'PAL': 96, 'SVI': 95, 'SVE': 94, 'SVP': 93,
                    // 2023 Sets
                    'CRZ': 92, 'SIR': 91, 'LOR': 90, 'PGO': 89,
                    // 2022 Sets
                    'ASR': 88, 'BRS': 87, 'FST': 86, 'CEL': 85, 'EVS': 84, 'CRE': 83,
                    // 2021 Sets
                    'BST': 82, 'TM': 81, 'SHF': 80, 'VIV': 79, 'CPA': 78,
                    // 2020 Sets
                    'DAA': 77, 'RCL': 76, 'SSH': 75, 'SP': 74, 'CEC': 73
                };
                
                const rarityOrder = {
                    'Common': 1,
                    'Uncommon': 2,
                    'Rare': 3,
                    'Holo Rare': 4,
                    'Ultra Rare': 5,
                    'Secret Rare': 6,
                    'Hyper Rare': 7,
                    'Special Rare': 8,
                    'Illustration Rare': 9,
                    'Promo': 10
                };
                
                // Sort prints by priority
                const sortedPrints = prints.sort((a, b) => {
                    const rarityA = rarityOrder[a.rarity] || 99;
                    const rarityB = rarityOrder[b.rarity] || 99;
                    
                    // First priority: lowest rarity (Common/Uncommon preferred)
                    if (rarityA !== rarityB) {
                        return rarityA - rarityB;
                    }
                    
                    // Second priority: newest set
                    const setA = setOrder[a.set] || 0;
                    const setB = setOrder[b.set] || 0;
                    if (setA !== setB) {
                        return setB - setA; // Higher number = newer
                    }
                    
                    // Third priority: set number (lower first)
                    const numA = parseInt((a.number || '0').toString().replace(/[^\d]/g, '')) || 0;
                    const numB = parseInt((b.number || '0').toString().replace(/[^\d]/g, '')) || 0;
                    return numA - numB;
                });
                
                if (cardName === 'hawlucha' || cardName === 'charmander' || cardName === 'charmeleon') {
                    console.log(`[Dedup Debug] ${cardName}: Using fallback - selected ${sortedPrints[0].set} ${sortedPrints[0].rarity}`);
                }
                selectedCards.push(sortedPrints[0]);
            });
            
            // Replace array content with deduplicated cards
            cards.length = 0;
            cards.push(...selectedCards);
            
            const uniqueCardNames = cardsByName.size;
            const totalPrintsRemoved = uniqueCardNames - selectedCards.length;
            console.log(`[Cards Tab] Deduplicated: ${uniqueCardNames} unique cards (removed ${totalPrintsRemoved} duplicate prints)`);
        }
        
        function sortCardsDatabase(cards) {
            /**
             * Sort cards based on the selected sort order from dropdown
             * Options: "set" (default), "deck" (like deck overview), "coverage"
             */
            const sortOrderSelect = document.getElementById('cardSortOrder');
            const sortOrder = sortOrderSelect ? sortOrderSelect.value : 'set';
            
            console.log(`[Cards Tab] Sorting cards by: ${sortOrder}`);
            
            if (sortOrder === 'set') {
                // Sort by SET CODE (alphabetically), then SET NUMBER (numerically)
                cards.sort((a, b) => {
                    const setCodeA = a.set || '';
                    const setCodeB = b.set || '';
                    
                    // First by set code
                    if (setCodeA !== setCodeB) {
                        return setCodeA.localeCompare(setCodeB);
                    }
                    
                    // Then by set number (extract numeric part)
                    const setNumA = parseInt((a.number || '0').toString().replace(/[^\d]/g, '')) || 0;
                    const setNumB = parseInt((b.number || '0').toString().replace(/[^\d]/g, '')) || 0;
                    if (setNumA !== setNumB) {
                        return setNumA - setNumB;
                    }
                    
                    // Finally by name
                    return (a.name || '').localeCompare(b.name || '');
                });
            } else if (sortOrder === 'deck') {
                // Sort like deck overview: by type/element/evolution
                // Use the existing sortCardsByType logic but adapted for allCardsData structure
                
                const elementOrder = {
                    'G': 1,  // Grass
                    'R': 2,  // Fire
                    'W': 3,  // Water
                    'L': 4,  // Lightning
                    'P': 5,  // Psychic
                    'F': 6,  // Fighting
                    'D': 7,  // Darkness
                    'M': 8,  // Metal
                    'N': 9,  // Dragon
                    'C': 10  // Colorless
                };
                
                const typeOrder = {
                    'Pokemon': 1,
                    'Supporter': 2,
                    'Item': 3,
                    'Tool': 4,
                    'Stadium': 5,
                    'Special Energy': 6,
                    'Energy': 7
                };
                
                cards.sort((a, b) => {
                    const typeA = a.type || '';
                    const typeB = b.type || '';
                    
                    // Determine category
                    const isPokemonA = /^[GRWLPFDMNCYDL]/.test(typeA) && !['Item', 'Supporter', 'Stadium', 'Tool', 'Energy'].some(t => typeA.includes(t));
                    const isPokemonB = /^[GRWLPFDMNCYDL]/.test(typeB) && !['Item', 'Supporter', 'Stadium', 'Tool', 'Energy'].some(t => typeB.includes(t));
                    
                    let categoryA, categoryB;
                    if (isPokemonA) {
                        categoryA = 'Pokemon';
                    } else if (typeA.includes('Supporter')) {
                        categoryA = 'Supporter';
                    } else if (typeA.includes('Tool')) {
                        categoryA = 'Tool';
                    } else if (typeA.includes('Item')) {
                        categoryA = 'Item';
                    } else if (typeA.includes('Stadium')) {
                        categoryA = 'Stadium';
                    } else if (typeA.includes('Special Energy')) {
                        categoryA = 'Special Energy';
                    } else if (typeA.includes('Energy')) {
                        categoryA = 'Energy';
                    } else {
                        categoryA = 'Pokemon'; // Default
                    }
                    
                    if (isPokemonB) {
                        categoryB = 'Pokemon';
                    } else if (typeB.includes('Supporter')) {
                        categoryB = 'Supporter';
                    } else if (typeB.includes('Tool')) {
                        categoryB = 'Tool';
                    } else if (typeB.includes('Item')) {
                        categoryB = 'Item';
                    } else if (typeB.includes('Stadium')) {
                        categoryB = 'Stadium';
                    } else if (typeB.includes('Special Energy')) {
                        categoryB = 'Special Energy';
                    } else if (typeB.includes('Energy')) {
                        categoryB = 'Energy';
                    } else {
                        categoryB = 'Pokemon'; // Default
                    }
                    
                    const orderA = typeOrder[categoryA] || 99;
                    const orderB = typeOrder[categoryB] || 99;
                    
                    // Sort by category first
                    if (orderA !== orderB) {
                        return orderA - orderB;
                    }
                    
                    // For Pokemon: sort by element
                    if (categoryA === 'Pokemon' && categoryB === 'Pokemon') {
                        const elementA = typeA.charAt(0);
                        const elementB = typeB.charAt(0);
                        const elemOrderA = elementOrder[elementA] || 99;
                        const elemOrderB = elementOrder[elementB] || 99;
                        
                        if (elemOrderA !== elemOrderB) {
                            return elemOrderA - elemOrderB;
                        }
                    }
                    
                    // Finally by name
                    return (a.name || '').localeCompare(b.name || '');
                });
            } else if (sortOrder === 'coverage') {
                // Sort by deck coverage (highest first)
                cards.sort((a, b) => {
                    const coverageA = calculateDynamicCoverage(a.name.toLowerCase()).percentage;
                    const coverageB = calculateDynamicCoverage(b.name.toLowerCase()).percentage;
                    
                    // Sort by coverage descending
                    if (coverageB !== coverageA) {
                        return coverageB - coverageA;
                    }
                    
                    // Then by name
                    return (a.name || '').localeCompare(b.name || '');
                });
            } else if (sortOrder === 'pokedex') {
                // Sort by National Pokédex number
                // Non-Pokémon cards (Supporter/Item/Stadium/Tool/Energy) sort to the end
                const NON_POKEMON = new Set(['supporter','item','stadium','tool','special energy','energy']);

                function getBasePokemonName(cardName) {
                    let n = (cardName || '').toLowerCase().trim();
                    // Strip possessive trainer prefix: "erika's ", "team rocket's ", etc.
                    const possMatch = n.match(/^[^']+\'s\s+(.+)$/);
                    if (possMatch) n = possMatch[1];
                    // Strip variant/form prefixes that map to same species
                    n = n.replace(/^(mega|alolan|galarian|hisuian|paldean|primal|shadow|dark|light|ancient|future|origin|blade|shield|hero of many battles )\s+/, '');
                    // Strip common card type suffixes (order matters: longest first)
                    n = n.replace(/\s+(vstar|vmax|vunion|v-union|ex|gx|v\b|lv\.x|legend|sp|lvl\.\s*x|breaking|star|prime|restored|radiant|ancient|future)$/i, '').trim();
                    // Strip leftover trailing suffixes like " ex" again in case of double
                    n = n.replace(/\s+ex$/i, '').trim();
                    return n;
                }

                function getDexNumber(card) {
                    const typeLower = (card.type || '').toLowerCase();
                    // Check if it's a non-Pokémon card type
                    if (NON_POKEMON.has(typeLower) || typeLower.includes('supporter') ||
                        typeLower.includes('item') || typeLower.includes('stadium') ||
                        typeLower.includes('tool') || typeLower.includes('energy')) {
                        return Infinity;
                    }
                    const base = getBasePokemonName(card.name);
                    // Try exact match first
                    if (pokedexNumbers[base] !== undefined) return pokedexNumbers[base];
                    // Try with hyphen instead of space
                    const hyphened = base.replace(/\s+/g, '-');
                    if (pokedexNumbers[hyphened] !== undefined) return pokedexNumbers[hyphened];
                    // Try stripping form suffixes like " (origin)", " (blade)"
                    const stripped = base.replace(/\s*\(.*\)\s*$/, '').trim();
                    if (pokedexNumbers[stripped] !== undefined) return pokedexNumbers[stripped];
                    // Not found — keep Pokémon cards together after known entries
                    return 9000 + (card.name || '').codePointAt(0);
                }

                cards.sort((a, b) => {
                    const dexA = getDexNumber(a);
                    const dexB = getDexNumber(b);
                    if (dexA !== dexB) return dexA - dexB;
                    // Same species: sort by name (handles forms) then by set
                    const nameComp = (a.name || '').localeCompare(b.name || '');
                    if (nameComp !== 0) return nameComp;
                    return (a.set || '').localeCompare(b.set || '');
                });
            }
        }
        
        function renderCardDatabase(cards) {
            const content = document.getElementById('cardsContent');
            const resultsInfo = document.getElementById('cardResultsInfo');
            
            if (cards.length === 0) {
                content.innerHTML = '<div style="text-align: center; padding: 40px; color: #444;"><h2>No Cards Found</h2><p style="font-weight: 500;">Try adjusting your filter settings</p></div>';
                resultsInfo.textContent = '0 cards found';
                return;
            }
            
            // Calculate pagination
            let cardsToShow, totalPages, startIndex, endIndex;
            
            if (showAllCards) {
                cardsToShow = cards;
                totalPages = 1;
                startIndex = 0;
                endIndex = cards.length;
                resultsInfo.textContent = `${cards.length.toLocaleString()} cards found (all shown)`;
            } else {
                totalPages = Math.ceil(cards.length / cardsPerPage);
                startIndex = (currentCardsPage - 1) * cardsPerPage;
                endIndex = Math.min(startIndex + cardsPerPage, cards.length);
                cardsToShow = cards.slice(startIndex, endIndex);
                resultsInfo.textContent = `${cards.length.toLocaleString()} cards found (page ${currentCardsPage} of ${totalPages})`;
            }
            
            // Create pagination controls
            const paginationTop = createPaginationControls(cards.length, totalPages);
            
            // Create card grid
            const grid = document.createElement('div');
            grid.className = 'card-database-grid';
            
            cardsToShow.forEach(card => {
                // Skip cards with missing essential data
                if (!card.name || !card.image_url) {
                    return;
                }
                const cardEl = createCardDatabaseItem(card);
                if (cardEl) {
                    grid.appendChild(cardEl);
                }
            });
            
            // Create pagination controls for bottom
            const paginationBottom = createPaginationControls(cards.length, totalPages);
            
            // Clear and add all elements
            content.innerHTML = '';
            content.appendChild(paginationTop);
            content.appendChild(grid);
            content.appendChild(paginationBottom);
            
            // Scroll to top of cards section
            document.getElementById('cards').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        
        function createPaginationControls(totalCards, totalPages) {
            const container = document.createElement('div');
            container.style.cssText = 'display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 20px; flex-wrap: wrap;';
            
            // Left side: Copy button
            const leftControls = document.createElement('div');
            leftControls.style.cssText = 'display: flex; gap: 10px;';
            
            const copyBtn = document.createElement('button');
            copyBtn.textContent = '📋 Copy Names';
            copyBtn.title = 'Copy all filtered card names to clipboard';
            copyBtn.style.cssText = 'padding: 10px 20px; font-size: 14px; border: 2px solid #27ae60; background: white; color: #27ae60; border-radius: 8px; cursor: pointer; font-weight: 600;';
            copyBtn.onclick = () => {
                const cardNames = window.filteredCardsData.map(c => c.name).join('\n');
                navigator.clipboard.writeText(cardNames).then(() => {
                    copyBtn.textContent = '✅ Copied!';
                    copyBtn.style.background = '#27ae60';
                    copyBtn.style.color = 'white';
                    setTimeout(() => {
                        copyBtn.textContent = '📋 Copy Names';
                        copyBtn.style.background = 'white';
                        copyBtn.style.color = '#27ae60';
                    }, 2000);
                }).catch(err => {
                    console.error('Copy failed:', err);
                    alert('Copy failed');
                });
            };
            leftControls.appendChild(copyBtn);
            
            // Center: Pagination controls
            const centerControls = document.createElement('div');
            centerControls.style.cssText = 'display: flex; gap: 10px; align-items: center;';
            
            // Previous button
            const prevBtn = document.createElement('button');
            prevBtn.textContent = '← Previous';
            prevBtn.style.cssText = 'padding: 10px 20px; font-size: 14px; border: 2px solid #3498db; background: white; color: #3498db; border-radius: 8px; cursor: pointer; font-weight: 600;';
            prevBtn.disabled = currentCardsPage === 1 || showAllCards;
            if (prevBtn.disabled) {
                prevBtn.style.opacity = '0.5';
                prevBtn.style.cursor = 'not-allowed';
            }
            prevBtn.onclick = () => {
                if (currentCardsPage > 1 && !showAllCards) {
                    currentCardsPage--;
                    renderCardDatabase(window.filteredCardsData);
                }
            };
            
            // Page numbers
            const pageInfo = document.createElement('div');
            pageInfo.style.cssText = 'display: flex; gap: 5px; align-items: center;';
            
            // Show first page, current page area, and last page
            const pagesToShow = [];
            
            // Always show first page
            pagesToShow.push(1);
            
            // Show pages around current page
            const range = 2; // Show 2 pages before and after current
            for (let i = Math.max(2, currentCardsPage - range); i <= Math.min(totalPages - 1, currentCardsPage + range); i++) {
                if (!pagesToShow.includes(i)) {
                    pagesToShow.push(i);
                }
            }
            
            // Always show last page
            if (totalPages > 1 && !pagesToShow.includes(totalPages)) {
                pagesToShow.push(totalPages);
            }
            
            // Sort pages
            pagesToShow.sort((a, b) => a - b);
            
            // Create page buttons with ellipsis
            for (let i = 0; i < pagesToShow.length; i++) {
                const page = pagesToShow[i];
                
                // Add ellipsis if there's a gap
                if (i > 0 && page - pagesToShow[i-1] > 1) {
                    const ellipsis = document.createElement('span');
                    ellipsis.textContent = '...';
                    ellipsis.style.cssText = 'padding: 0 5px; color: #555; font-weight: 500;';
                    pageInfo.appendChild(ellipsis);
                }
                
                const pageBtn = document.createElement('button');
                pageBtn.textContent = page;
                pageBtn.style.cssText = 'padding: 8px 12px; font-size: 14px; border: 2px solid #3498db; background: white; color: #3498db; border-radius: 8px; cursor: pointer; min-width: 40px; font-weight: 600;';
                
                if (page === currentCardsPage) {
                    pageBtn.style.background = '#3498db';
                    pageBtn.style.color = 'white';
                }
                
                pageBtn.onclick = () => {
                    currentCardsPage = page;
                    renderCardDatabase(window.filteredCardsData);
                };
                
                pageInfo.appendChild(pageBtn);
            }
            
            // Next button
            const nextBtn = document.createElement('button');
            nextBtn.textContent = 'Next →';
            nextBtn.style.cssText = 'padding: 10px 20px; font-size: 14px; border: 2px solid #3498db; background: white; color: #3498db; border-radius: 8px; cursor: pointer; font-weight: 600;';
            nextBtn.disabled = currentCardsPage === totalPages || showAllCards;
            if (nextBtn.disabled) {
                nextBtn.style.opacity = '0.5';
                nextBtn.style.cursor = 'not-allowed';
            }
            nextBtn.onclick = () => {
                if (currentCardsPage < totalPages && !showAllCards) {
                    currentCardsPage++;
                    renderCardDatabase(window.filteredCardsData);
                }
            };
            
            centerControls.appendChild(prevBtn);
            if (!showAllCards) {
                centerControls.appendChild(pageInfo);
            }
            centerControls.appendChild(nextBtn);
            
            // Right side: Show All / Show Paginated button
            const rightControls = document.createElement('div');
            rightControls.style.cssText = 'display: flex; gap: 10px;';
            
            const toggleShowAllBtn = document.createElement('button');
            toggleShowAllBtn.textContent = showAllCards ? '📄 Paginated' : '📋 Show All';
            toggleShowAllBtn.title = showAllCards ? 'Switch back to paginated view' : 'Show all cards at once';
            toggleShowAllBtn.style.cssText = 'padding: 10px 20px; font-size: 14px; border: 2px solid #9b59b6; background: white; color: #9b59b6; border-radius: 8px; cursor: pointer; font-weight: 600;';
            toggleShowAllBtn.onclick = () => {
                showAllCards = !showAllCards;
                if (!showAllCards) {
                    currentCardsPage = 1; // Reset to first page
                }
                renderCardDatabase(window.filteredCardsData);
            };
            rightControls.appendChild(toggleShowAllBtn);
            
            container.appendChild(leftControls);
            container.appendChild(centerControls);
            container.appendChild(rightControls);
            
            return container;
        }
        
        function createCardDatabaseItem(card) {
            // Validate essential fields
            if (!card.name || !card.image_url) {
                return null;
            }
            
            const item = document.createElement('div');
            item.className = 'card-database-item';
            
            const rarityClass = getRarityClass(card.rarity);
            
            // Escape strings for HTML attributes
            const escapedName = (card.name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const escapedImageUrl = (card.image_url || '').replace(/'/g, "\\'");
            const displayName = card.name || 'Unknown Card';
            const displaySet = card.set || '???';
            const displayNumber = card.number || '?';
            const displayType = card.type || 'Unknown';
            const displayRarity = card.rarity || 'Unknown';
            const displayCardMarketUrl = card.cardmarket_url || '#';
            
            // Create unique card ID: name|set|number (tracks SPECIFIC print, not just card name)
            const cardId = `${card.name}|${displaySet}|${displayNumber}`;
            item.setAttribute('data-card-id', cardId);
            // Escape single quotes for safe use inside onclick='...' JS string literals
            const safeCardId = cardId.replace(/'/g, "\\'");
            
            // Check if user owns THIS SPECIFIC PRINT
            const userOwnsCard = window.userCollection && window.userCollection.has(cardId);
            const userWantsCard = window.userWishlist && window.userWishlist.has(cardId);
            
            // Format price button
            let priceButton = '';
            if (card.eur_price && card.eur_price !== '' && card.eur_price !== '0' && card.eur_price !== 'N/A') {
                const price = parseFloat(card.eur_price.replace(',', '.'));
                if (!isNaN(price)) {
                    priceButton = `<a href="${displayCardMarketUrl}" target="_blank" class="card-database-price-btn" style="display: block; padding: 8px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 6px; text-align: center; font-weight: 700; font-size: 14px; text-decoration: none; cursor: pointer; transition: all 0.2s ease; flex: 1;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(102, 126, 234, 0.4)';" onmouseout="this.style.transform=''; this.style.boxShadow='';" title="View on CardMarket">
                        Ø ${price.toFixed(2).replace('.', ',')} €
                    </a>`;
                }
            }
            
            // Calculate DYNAMIC Deck Coverage based on active filters
            let coverageDisplay = '';
            const coverageStats = calculateDynamicCoverage(card.name);
            
            if (coverageStats && coverageStats.totalDecks > 0) {
                const percentage = coverageStats.percentage || 0;
                const deckCount = coverageStats.deckCount || 0;
                const archetypeCount = coverageStats.archetypeCount || 0;
                
                // Get max count from cardDeckCoverageMap
                const cardNameNorm = normalizeCardName(card.name);
                const cardCoverageData = window.cardDeckCoverageMap ? window.cardDeckCoverageMap.get(cardNameNorm) : null;
                const maxCount = cardCoverageData ? (cardCoverageData.maxCountOverall || 0) : 0;
                
                let coverageColor = '#95a5a6'; // Gray for < 50%
                let coverageIcon = '\u{1F4CA}'; // bar chart
                
                if (percentage >= 99.5) {
                    coverageColor = '#e74c3c'; // Red for 100%
                    coverageIcon = '\uD83D\uDD25'; // fire
                } else if (percentage >= 90) {
                    coverageColor = '#e67e22'; // Orange for >=90%
                    coverageIcon = '\u26A1'; // lightning
                } else if (percentage >= 70) {
                    coverageColor = '#f39c12'; // Yellow for >=70%
                    coverageIcon = '\u2B50'; // star
                } else if (percentage >= 50) {
                    coverageColor = '#3498db'; // Blue for >=50%
                    coverageIcon = '\u{1F4CA}'; // bar chart
                }
                
                // Format the display with max count
                const maxCountText = maxCount > 0 ? ` · Max: ${maxCount}x` : '';
                
                coverageDisplay = `<div class="card-database-coverage" style="margin-top: 8px; padding: 8px; background: ${coverageColor}; color: white; border-radius: 6px; text-align: center; font-weight: 600; font-size: 13px;" title="${deckCount} Decks / ${archetypeCount} Archetypes${maxCount > 0 ? ' · Max: ' + maxCount + 'x copies per deck' : ''}">
                    ${coverageIcon} ${percentage.toFixed(1)}% Coverage${maxCountText}
                </div>`;
            }
            
            item.innerHTML = `
                <div style="position: relative;">
                    <img src="${escapedImageUrl}" alt="${displayName}" loading="lazy" onclick="showImageView('${escapedImageUrl}', '${escapedName}')">
                    ${userOwnsCard ? '<div style="position: absolute; top: 5px; left: 5px; background: #4CAF50; color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">&#10003;</div>' : ''}
                    <div style="position: absolute; top: 5px; right: 5px; display: flex; gap: 5px;">
                        <button onclick="toggleCollection('${safeCardId}')" style="background: ${userOwnsCard ? '#4CAF50' : '#fff'}; color: ${userOwnsCard ? '#fff' : '#000'}; border: 2px solid #4CAF50; width: 35px; height: 35px; border-radius: 50%; cursor: pointer; font-size: 18px; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.3); transition: all 0.2s;" title="${userOwnsCard ? 'Remove from collection' : 'Add to collection'}">
                            ${userOwnsCard ? '&#10003;' : '+'}
                        </button>
                        <button onclick="toggleWishlist('${safeCardId}')" style="background: ${userWantsCard ? '#FF9800' : '#fff'}; color: ${userWantsCard ? '#fff' : '#000'}; border: 2px solid #FF9800; width: 35px; height: 35px; border-radius: 50%; cursor: pointer; font-size: 18px; box-shadow: 0 2px 8px rgba(0,0,0,0.3); transition: all 0.2s;" title="${userWantsCard ? 'Remove from wishlist' : 'Add to wishlist'}">
                            ${userWantsCard ? '&#9829;' : '&#9825;'}
                        </button>
                    </div>
                </div>
                <div class="card-database-info">
                    <div class="card-database-name">${displayName}</div>
                    <div class="card-database-meta">
                        <span class="card-database-set">${displaySet} ${displayNumber}</span>
                        <span class="card-database-type">${displayType}</span>
                    </div>
                    <div class="card-database-button-row" style="display: flex; gap: 8px; margin-top: 8px;">
                        ${priceButton}
                        <div class="card-database-rarity-btn ${rarityClass}" onclick='openRaritySwitcherFromDB("${escapedName}", "${displaySet}", "${displayNumber}")' style="display: block; padding: 8px; color: white; border-radius: 6px; text-align: center; font-weight: 700; font-size: 14px; cursor: pointer; transition: all 0.2s ease; flex: 1;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(0, 0, 0, 0.3)';" onmouseout="this.style.transform=''; this.style.boxShadow='';" title="View all prints for ${displayRarity}">
                            ${displayRarity}
                        </div>
                    </div>
                    ${coverageDisplay}
                </div>
            `;
            
            return item;
        }
        
        function getRarityClass(rarity) {
            if (!rarity) return '';
            const r = rarity.toLowerCase();
            if (r.includes('common')) return 'rarity-common';
            if (r.includes('uncommon')) return 'rarity-uncommon';
            if (r === 'rare') return 'rarity-rare';
            if (r.includes('holo rare')) return 'rarity-holo';
            if (r.includes('double rare')) return 'rarity-double';
            if (r.includes('triple rare')) return 'rarity-triple';
            if (r.includes('ultra rare')) return 'rarity-ultra';
            if (r.includes('secret rare')) return 'rarity-secret';
            if (r.includes('rainbow rare')) return 'rarity-rainbow';
            if (r === 'art rare') return 'rarity-art';
            if (r.includes('special art')) return 'rarity-special-art';
            if (r.includes('character holo')) return 'rarity-char-holo';
            if (r.includes('character super')) return 'rarity-char-super';
            if (r.includes('radiant')) return 'rarity-radiant';
            if (r === 'shiny rare') return 'rarity-shiny';
            if (r.includes('shiny ultra')) return 'rarity-shiny-ultra';
            if (r.includes('promo')) return 'rarity-promo';
            return '';
        }

        function parseTournamentDate(dateStr) {
            /**
             * Parse tournament date string (e.g., "13th February 2026") to Date object
             * Returns null if parsing fails
             */
            if (!dateStr || dateStr.trim() === '') return null;
            
            try {
                // Remove ordinal suffixes (st, nd, rd, th)
                const cleaned = dateStr.replace(/(\d+)(st|nd|rd|th)/, '$1');
                const parsed = new Date(cleaned);
                return isNaN(parsed.getTime()) ? null : parsed;
            } catch (e) {
                return null;
            }
        }
        
        function getCardReleaseDate(cardStats) {
            /**
             * Get the release date of a card based on its set code
             * Returns Date object or null if not determinable
             */
            if (!cardStats || !cardStats.setCode) {
                // If no set code, try to find earliest tournament date
                if (cardStats && cardStats.tournamentDates && cardStats.tournamentDates.size > 0) {
                    const dates = Array.from(cardStats.tournamentDates)
                        .map(d => parseTournamentDate(d))
                        .filter(d => d !== null);
                    if (dates.length > 0) {
                        return new Date(Math.min(...dates));
                    }
                }
                return null;
            }
            
            const setCode = cardStats.setCode;
            const releaseDateStr = window.SET_RELEASE_DATES[setCode] || window.SET_RELEASE_DATES['DEFAULT'];
            return new Date(releaseDateStr);
        }

        function calculateDynamicCoverage(cardName) {
            if (!window.cardDeckCoverageMap || !window.archetypeDeckCounts) {
                return null;
            }
            
            const cardNameLower = normalizeCardName(cardName);
            const cardStats = window.cardDeckCoverageMap.get(cardNameLower);
            
            if (!cardStats) {
                return null;
            }
            
            // Get card release date for temporal filtering
            const cardReleaseDate = getCardReleaseDate(cardStats);
            
            // Get active filters
            const selectedMainPokemons = Array.from(document.querySelectorAll('#mainPokemonList input:checked')).map(cb => cb.value);
            const selectedArchetypes = Array.from(document.querySelectorAll('#archetypeList input:checked')).map(cb => cb.value);
            const selectedMetaFilters = Array.from(document.querySelectorAll('#metaFormatOptions input:checked')).filter(cb => cb.value.startsWith('meta:')).map(cb => cb.value.replace('meta:', ''));
            
            // Get ALL actually existing archetype keys from the data
            const allExistingArchetypeKeys = Array.from(window.archetypeDeckCounts.keys());
            
            let decksFilteredByDate = 0; // Track how many decks were filtered out by date
            
            // If no filters are active, use all decks from the global calculation
            if (selectedMainPokemons.length === 0 && selectedArchetypes.length === 0 && selectedMetaFilters.length === 0) {
                let totalDecksWithCard = 0;
                cardStats.archetypesWithCard.forEach((entry, archetypeKey) => {
                    const deckCount = typeof entry === 'number' ? entry : (entry.deckCount || 0);
                    const tournamentDate = parseTournamentDate(entry.tournamentDate || null);
                    const [meta, archetype] = archetypeKey.split('|');
                    
                    // Temporal filtering: Only filter if we have BOTH a card release date AND a tournament date
                    // City League data often has NO tournament_date, so we treat it as "current meta"
                    if (cardReleaseDate && tournamentDate) {
                        if (tournamentDate < cardReleaseDate) {
                            decksFilteredByDate++;
                            return; // Skip this entry
                        }
                    }
                    // If no tournament date (like City League), we DON'T filter - assume it's current
                    
                    totalDecksWithCard += deckCount;
                });
                
                if (window.totalUniqueDecks) {
                    const percentage = (totalDecksWithCard / window.totalUniqueDecks) * 100;
                    return {
                        percentage: percentage,
                        deckCount: totalDecksWithCard,
                        archetypeCount: cardStats.archetypes.size,
                        totalDecks: window.totalUniqueDecks
                    };
                }
                return null;
            }
            
            // Filter archetype keys based on active filters
            const filteredArchetypeKeys = allExistingArchetypeKeys.filter(archetypeKey => {
                // archetypeKey format: "meta|archetype"
                const [meta, archetype] = archetypeKey.split('|');
                
                // Check meta filter
                if (selectedMetaFilters.length > 0) {
                    if (!selectedMetaFilters.includes(meta)) {
                        return false;
                    }
                }
                
                // Check archetype filter
                if (selectedArchetypes.length > 0) {
                    if (!selectedArchetypes.includes(archetype)) {
                        return false;
                    }
                }
                
                // Check main pokemon filter
                if (selectedMainPokemons.length > 0) {
                    const mainPokemon = archetype.split(' ')[0].trim();
                    if (!selectedMainPokemons.includes(mainPokemon)) {
                        return false;
                    }
                    
                    // IMPORTANT: When filtering by Main Pokemon, only count archetypes
                    // that have AT LEAST ONE card matching the main pokemon name
                    // This filters out incomplete data where the main pokemon cards weren't scraped
                    const hasMainPokemonCard = Array.from(window.cardDeckCoverageMap.keys()).some(cardName => {
                        const cardStats = window.cardDeckCoverageMap.get(cardName);
                        // Check if this card name contains the main pokemon name
                        // AND this archetype has this card
                        return cardName.includes(mainPokemon.toLowerCase()) && 
                               cardStats.archetypesWithCard.has(archetypeKey);
                    });
                    
                    if (!hasMainPokemonCard) {
                        if (cardNameLower === 'hawlucha' && archetypeKey.includes('Dragapult')) {
                            console.log(`[Coverage Debug Hawlucha Filter] Excluding archetype ${archetypeKey} - no card with '${mainPokemon.toLowerCase()}' in name found`);
                        }
                        return false; // Skip archetypes with no main pokemon cards
                    } else {
                        if (cardNameLower === 'hawlucha' && archetypeKey.includes('Dragapult')) {
                            console.log(`[Coverage Debug Hawlucha Filter] Including archetype ${archetypeKey} - has main pokemon card`);
                        }
                    }
                }
                
                return true;
            });
            
            if (filteredArchetypeKeys.length === 0) {
                return null;
            }
            
            if (cardNameLower === 'hawlucha') {
                const dragapultKeys = filteredArchetypeKeys.filter(k => k.includes('Dragapult'));
                console.log(`[Coverage Debug Hawlucha Filter] Filtered Dragapult Archetypes (${dragapultKeys.length}): ${dragapultKeys.slice(0, 5).join(', ')}${dragapultKeys.length > 5 ? ` ... and ${dragapultKeys.length - 5} more` : ''}`);
                
                const hawluchaKeys = Array.from(cardStats.archetypesWithCard.keys());
                const hawluchaDragKeys = hawluchaKeys.filter(k => k.includes('Dragapult'));
                console.log(`[Coverage Debug Hawlucha Filter] Hawlucha's Dragapult Archetypes (${hawluchaDragKeys.length}): ${hawluchaDragKeys.join(', ')}`);
                
                // Check which Hawlucha archetypes are NOT in filtered keys
                const missingKeys = hawluchaKeys.filter(k => !filteredArchetypeKeys.includes(k) && k.includes('Dragapult'));
                if (missingKeys.length > 0) {
                    console.log(`[Coverage Debug Hawlucha Filter] Hawlucha archetypes MISSING from filtered list (${missingKeys.length}): ${missingKeys.join(', ')}`);
                } else {
                    console.log(`[Coverage Debug Hawlucha Filter] All Hawlucha Dragapult archetypes are in filtered list!`);
                }
            }
            
            // Count total decks in filtered archetypes
            let totalFilteredDecks = 0;
            filteredArchetypeKeys.forEach(archetypeKey => {
                const archetypeData = window.archetypeDeckCounts.get(archetypeKey);
                const deckCount = typeof archetypeData === 'number' ? archetypeData : (archetypeData.totalDecks || 0);
                
                // DON'T apply temporal filtering here - we want to count ALL decks in the archetype
                // regardless of when the card was released. Temporal filtering is only for decksWithCard.
                totalFilteredDecks += deckCount;
            });
            
            // Count how many decks have this card
            let decksWithCard = 0;
            const matchingArchetypes = new Set();
            
            if (cardNameLower === 'hawlucha') {
                console.log(`[Coverage Debug Hawlucha Count] Starting deck count. cardStats.archetypesWithCard has ${cardStats.archetypesWithCard.size} entries`);
                const releaseDate = getCardReleaseDate(cardStats);
                console.log(`[Coverage Debug Hawlucha Count] Card release date: ${releaseDate ? releaseDate.toISOString().split('T')[0] : 'NULL'}, setCode: ${cardStats.setCode}`);
            }
            
            let hawluchaDebugInfo = [];
            
            cardStats.archetypesWithCard.forEach((entry, archetypeKey) => {
                const isIncluded = filteredArchetypeKeys.includes(archetypeKey);
                
                if (cardNameLower === 'hawlucha' && archetypeKey.includes('Dragapult')) {
                    const deckCount = typeof entry === 'number' ? entry : (entry.deckCount || 0);
                    hawluchaDebugInfo.push(`${archetypeKey}:included=${isIncluded},deckCount=${deckCount}`);
                }
                
                if (isIncluded) {
                    const deckCount = typeof entry === 'number' ? entry : (entry.deckCount || 0);
                    const tournamentDate = parseTournamentDate(entry.tournamentDate || null);
                    
                    // Get the release date for THIS specific entry's set code, not the global one
                    const entrySetCode = (typeof entry === 'object' && entry.setCode) ? entry.setCode : cardStats.setCode;
                    const entryReleaseDateStr = window.SET_RELEASE_DATES[entrySetCode] || window.SET_RELEASE_DATES['DEFAULT'];
                    const entryReleaseDate = entrySetCode ? new Date(entryReleaseDateStr) : cardReleaseDate;
                    
                    if (cardNameLower === 'hawlucha') {
                        console.log(`[Coverage Debug Hawlucha Count] ? ${archetypeKey}: deckCount=${deckCount}, tournamentDate=${entry.tournamentDate || 'N/A'}, entrySetCode=${entrySetCode}, releaseDate=${entryReleaseDate ? entryReleaseDate.toISOString().split('T')[0] : 'NULL'}`);
                    }
                    
                    // Temporal filtering: Use the entry's specific set code release date
                    // Only filter if we have BOTH a card release date AND a tournament date
                    // City League data often has NO tournament_date, so we treat it as "current meta"
                    if (entryReleaseDate && tournamentDate) {
                        if (tournamentDate < entryReleaseDate) {
                            if (cardNameLower === 'hawlucha') {
                                console.log(`[Coverage Debug Hawlucha Count] ? FILTERED OUT: ${archetypeKey} (tournament ${tournamentDate.toISOString().split('T')[0]} < release ${entryReleaseDate.toISOString().split('T')[0]})`);
                            }
                            return; // Skip this entry
                        }
                    }
                    // If no tournament date, we DON'T filter - assume it's current
                    
                    decksWithCard += deckCount;
                    // Extract archetype from archetypeKey (format: meta|archetype)
                    const archetype = archetypeKey.split('|')[1];
                    if (archetype) {
                        matchingArchetypes.add(archetype);
                    }
                }
            });
            
            if (cardNameLower === 'hawlucha' && hawluchaDebugInfo.length > 0) {
                console.log(`[Coverage Debug Hawlucha Count] Dragapult archetypes checked: ${hawluchaDebugInfo.join(' | ')}`);
            }
            
            const percentage = totalFilteredDecks > 0 ? (decksWithCard / totalFilteredDecks) * 100 : 0;
            
            if (cardNameLower === 'hawlucha') {
                console.log(`[Coverage Debug Hawlucha] Final: ${decksWithCard}/${totalFilteredDecks} = ${percentage.toFixed(1)}%, matching archetypes: ${matchingArchetypes.size}, filtered keys: ${filteredArchetypeKeys.length}`);
            }
            
            // Enhanced debug logging with temporal filtering info
            if (cardNameLower.includes('dragapult') || cardNameLower.includes('poke pad') || cardNameLower.includes('poke pad')) {
                let debugMsg = `[Coverage Debug] ${cardName}: ${decksWithCard}/${totalFilteredDecks} decks = ${percentage.toFixed(1)}% | Archetypes: ${matchingArchetypes.size}/${filteredArchetypeKeys.length}`;
                
                if (cardReleaseDate) {
                    debugMsg += ` | Release: ${cardReleaseDate.toISOString().split('T')[0]}`;
                }
                if (decksFilteredByDate > 0) {
                    debugMsg += ` | Filtered (before release): ${decksFilteredByDate}`;
                }
                
                const samples = Array.from(cardStats.archetypesWithCard.keys()).filter(k => filteredArchetypeKeys.includes(k)).slice(0, 3).map(k => {
                    const entry = cardStats.archetypesWithCard.get(k);
                    const count = typeof entry === 'number' ? entry : (entry.deckCount || 0);
                    const archetypeData = window.archetypeDeckCounts.get(k);
                    const total = typeof archetypeData === 'number' ? archetypeData : (archetypeData.totalDecks || 0);
                    const dateStr = entry.tournamentDate || 'N/A';
                    return `${k}(${count}/${total}, ${dateStr})`;
                }).join(', ');
                
                debugMsg += ` | Samples: ${samples}`;
                
                // Show which archetypes DON'T have this card
                const archetypesWithoutCard = filteredArchetypeKeys.filter(k => !cardStats.archetypesWithCard.has(k));
                if (archetypesWithoutCard.length > 0) {
                    debugMsg += ` | Missing from: ${archetypesWithoutCard.slice(0, 3).join(', ')}`;
                }
                
                console.log(debugMsg);
            }
            
            return {
                percentage: percentage,
                deckCount: decksWithCard,
                archetypeCount: matchingArchetypes.size,
                totalDecks: totalFilteredDecks
            };
        }
        
        function openRaritySwitcherFromDB(cardName, set, number) {
            // Create a deckKey format that openRaritySwitcher expects
            const deckKey = `${cardName} (${set} ${number})`;
            openRaritySwitcher(cardName, deckKey);
        }
        
        function filterCards() {
            // This function is called from the old search box, now handled by filterAndRenderCards
            filterAndRenderCards();
        }
        
        // Rarity Switcher Functions
        let currentRaritySwitcherCard = null;

        function openRaritySwitcher(cardName, deckKey) {
            if (!window.allCardsDatabase) {
                alert('Card database not loaded yet...');
                return;
            }

            // Extract card name from deckKey if needed (handle "CardName (SET NUM)" format)
            const baseNameMatch = deckKey.match(/^(.+?)\s*\(/);
            const actualCardName = baseNameMatch ? baseNameMatch[1] : cardName;
            const normalizedActualCardName = normalizeCardName(actualCardName);

            const cardMatchesActualName = (candidate) => {
                if (!candidate) return false;
                const candidateName = normalizeCardName(candidate.name || '');
                const candidateNameEn = normalizeCardName(candidate.name_en || '');
                return candidateName === normalizedActualCardName || candidateNameEn === normalizedActualCardName;
            };
            
            // Extract set and number from deckKey (e.g., "Boss's Orders (RCL 189)" -> set="RCL", number="189")
            const setNumMatch = deckKey.match(/\(([A-Z0-9]+)\s+(\d+[A-Z]*)\)/);
            let currentSet = '';
            let currentNumber = '';
            if (setNumMatch) {
                currentSet = setNumMatch[1];
                currentNumber = setNumMatch[2];
            }
            
            console.log(`[openRaritySwitcher] cardName: ${cardName}, deckKey: ${deckKey}, actualCardName: ${actualCardName}`);

            currentRaritySwitcherCard = { cardName: actualCardName, deckKey };
            
            // Find current card's data
            let currentCard = null;
            if (currentSet && currentNumber) {
                currentCard = (window.cardsBySetNumberMap || {})[`${currentSet}-${currentNumber}`] || null;
            }
            
            // Fallback: If no SET/NUMBER available, find the card with HIGHEST RARITY and MOST international_prints
            // This ensures we get the complete list AND prefer special versions (e.g., MEP Promos over Common prints)
            if (!currentCard && window.allCardsDatabase) {
                const candidateCards = window.allCardsDatabase.filter(c => 
                    cardMatchesActualName(c) && c.type && c.type.trim() !== '' && c.international_prints
                );
                
                if (candidateCards.length > 0) {
                    // Sort by rarity (descending), then by number of international_prints (descending)
                    candidateCards.sort((a, b) => {
                        // First: Compare rarity (higher rarity = better)
                        const rarityDiff = getRarityRank(b.rarity) - getRarityRank(a.rarity);
                        if (rarityDiff !== 0) {
                            return rarityDiff;
                        }
                        
                        // Second: Compare number of international_prints (more prints = more complete data)
                        const aCount = (a.international_prints || '').split(',').length;
                        const bCount = (b.international_prints || '').split(',').length;
                        return bCount - aCount;
                    });
                    
                    currentCard = candidateCards[0];
                    const intPrintCount = (currentCard.international_prints || '').split(',').length;
                    console.log(`[openRaritySwitcher] Using card with HIGHEST RARITY as reference: ${currentCard.set}-${currentCard.number} (${currentCard.rarity}, ${intPrintCount} prints)`);
                } else {
                    // Fallback to any card with this name (for type detection)
                    let fallbackCard = (window.cardIndexMap && window.cardIndexMap.get(actualCardName)) || null;
                    if (!fallbackCard) {
                        fallbackCard = window.allCardsDatabase.find(c => cardMatchesActualName(c)) || null;
                    }
                    if (fallbackCard) {
                        currentCard = fallbackCard;
                        console.log(`[openRaritySwitcher] Using fallback card for type detection: ${fallbackCard.set}-${fallbackCard.number} (${fallbackCard.type})`);
                    }
                }
            }
            
            // Determine if this is a Pokemon card or Trainer/Energy card
            // Trainer/Energy types: Supporter, Item, Stadium, Tool, Energy, Special Energy, Basic Energy
            const trainerEnergyTypes = ['Supporter', 'Item', 'Stadium', 'Tool', 'Energy', 'Special Energy', 'Basic Energy'];
            const isPokemonCard = currentCard && currentCard.type && !trainerEnergyTypes.includes(currentCard.type);
            
            // Find all versions based on card type
            let versions = [];
            
            if (isPokemonCard) {
                // POKEMON CARDS: Use international_prints from Limitless "Int. Prints" table
                // This is THE definitive source - shows ALL functionally identical cards
                // regardless of artwork, illustrator, or set
                if (currentCard && currentCard.international_prints) {
                    // Parse the comma-separated list of international prints
                    // Format: "ASC-113,MEG-77,MEG-160,MEG-179,MEG-188,MPROMO-12"
                    const intPrintIds = currentCard.international_prints.split(',').map(s => s.trim());
                    const intPrintSet = new Set(intPrintIds);
                    
                    // Find all cards that match any of these set-number combinations
                    versions = window.allCardsDatabase.filter(card => {
                        const cardId = `${card.set}-${card.number}`;
                        return intPrintSet.has(cardId);
                    });

                    // Prefer exact/normalized name matches when available.
                    const nameMatchedVersions = versions.filter(card => cardMatchesActualName(card));
                    if (nameMatchedVersions.length > 0) {
                        versions = nameMatchedVersions;
                    }
                    
                    console.log(`[Pokemon Card] Found ${versions.length} international prints from Limitless data`);
                    console.log(`[Pokemon Card] Int. Print IDs:`, intPrintIds);
                } else {
                    // No international_prints data available - show only current card
                    versions = currentCard ? [currentCard] : [];
                    console.warn(`[Pokemon Card] No international_prints data available, showing only current version`);
                }
            } else {
                // TRAINER/ENERGY CARDS: Use name-based matching
                // All versions with same name are functionally identical (reprints)
                if (window.cardsByNameMap && window.cardsByNameMap[actualCardName]) {
                    versions = window.cardsByNameMap[actualCardName].slice();
                    console.log(`[Trainer/Energy] Found ${versions.length} reprints via name matching`);
                } else if (window.allCardsDatabase) {
                    versions = window.allCardsDatabase.filter(card => cardMatchesActualName(card));
                    console.log(`[Trainer/Energy] Found ${versions.length} reprints via direct search`);
                } else {
                    versions = currentCard ? [currentCard] : [];
                }
            }
            
            // Filter to English sets only if we have the set mapping
            // CRITICAL: Skip this filter for Pokemon cards with international_prints
            // Limitless already validates these sets - we trust their data even if not in formats.json
            if (!isPokemonCard && window.englishSetCodes && window.englishSetCodes.size > 0) {
                const beforeEnglishFilter = versions.length;
                versions = versions.filter(version => window.englishSetCodes.has(version.set));
                console.log(`[openRaritySwitcher] English filter: ${beforeEnglishFilter} ? ${versions.length} versions (Trainer/Energy only)`);
            } else if (isPokemonCard) {
                console.log(`[openRaritySwitcher] Skipping English filter for Pokemon cards (trust international_prints from Limitless)`);
            }
            
            // Filter to only show cards with COMPLETE data
            // Special handling: Pokemon cards found via international_prints are trusted (Limitless data is reliable)
            // For Trainer/Energy (name-based matching), apply lighter filter - we only need rarity + image_url
            const beforeCompleteFilter = versions.length;
            if (!isPokemonCard) {
                // TRAINER/ENERGY: Basic filter - must have rarity and image_url
                // Note: international_prints not required for Trainer/Energy (all same name = functionally identical)
                versions = versions.filter(version => {
                    const hasRarity = version.rarity && version.rarity.trim() !== '';
                    const hasImageUrl = (version.image_url && version.image_url.trim() !== '') || !!getUnifiedCardImage(version.set, version.number);
                    return hasRarity && hasImageUrl;
                });
                if (beforeCompleteFilter > versions.length) {
                    console.log(`[Trainer/Energy Filter] Filtered out ${beforeCompleteFilter - versions.length} incomplete cards`);
                    console.log(`[openRaritySwitcher] After complete data filter: ${versions.length} versions`);
                }
            } else {
                // POKEMON: Trust international_prints data from Limitless - show all versions even if rarity/image missing
                // These are functionally identical cards validated by Limitless TCG database
                console.log(`[Pokemon Filter] Showing all ${versions.length} international prints (trusted Limitless data)`);
            }
            
            if (versions.length === 0) {
                alert(`No complete versions found for "${actualCardName}".\n\nPossible reasons:\n- Card not fully indexed (missing Rarity/Image URL/Int. Prints)\n- All Cards Scraper has not finished yet\n- Only Japanese sets available\n\nSearched name: "${actualCardName}"\n\nTip: Wait for the All Cards Scraper to finish.`);
                console.error(`[openRaritySwitcher] No complete versions found for "${actualCardName}".`);
                return;
            }

            // Build rarity options
            const optionsList = document.getElementById('rarityOptionsList');
            optionsList.innerHTML = '';

            versions.forEach(version => {
                const optionDiv = document.createElement('div');
                optionDiv.className = 'rarity-option-card';
                
                // Check if this is the current version
                const versionKey = `${actualCardName} (${version.set} ${version.number})`;
                if (deckKey === versionKey) {
                    optionDiv.classList.add('selected');
                }
                
                optionDiv.onclick = () => selectRarityVersion(version.set, version.number, deckKey, actualCardName);
                
                let imageHtml = '';
                const imageUrl = getUnifiedCardImage(version.set, version.number) || version.image_url || '';
                imageHtml = `<img src="${imageUrl}" alt="${actualCardName} - ${version.rarity}" loading="lazy">`;
                
                const rarityBadgeColor = getRarityColor(version.rarity);
                
                // Get price and Cardmarket URL
                const eurPrice = version.eur_price || '';
                const cardmarketUrl = version.cardmarket_url || '';
                const priceDisplay = eurPrice || 'Preis N/A';
                const cardmarketBtnClass = eurPrice ? 'btn-cardmarket rarity-option-cardmarket' : 'btn-cardmarket rarity-option-cardmarket no-price';
                
                optionDiv.innerHTML = `
                    ${imageHtml}
                    <div class="rarity-option-info">
                        <div><strong>${version.set} ${version.number}</strong></div>
                        <div style="font-size: 11px; color: #444; font-weight: 500;">Rarity: ${version.rarity || 'N/A'}</div>
                    </div>
                    <div class="rarity-badge" style="background-color: ${rarityBadgeColor};">
                        ${version.rarity || 'Unknown'}
                    </div>
                    ${cardmarketUrl ? `
                        <button class="${cardmarketBtnClass}" 
                                onclick="event.stopPropagation(); window.open('${cardmarketUrl}', '_blank');" 
                                title="Auf Cardmarket kaufen: ${priceDisplay}">
                            ${priceDisplay}
                        </button>
                    ` : ''}
                `;
                
                optionsList.appendChild(optionDiv);
            });

            document.getElementById('raritySwitcherTitle').textContent = `${actualCardName} - Rarity Switcher`;
            const modal = document.getElementById('raritySwitcherModal');
            modal.classList.add('show');
        }

        function selectRarityVersion(setCode, setNumber, oldDeckKey, cardName) {
            if (!window.cityLeagueDeck) return;

            // Extract card name from oldDeckKey if needed
            const match = oldDeckKey.match(/^(.+?)\s*\(/);
            const actualCardName = cardName || (match ? match[1] : oldDeckKey);
            
            // Create new key with new version
            const newKey = `${actualCardName} (${setCode} ${setNumber})`;
            
            // Get current count for this card
            const currentCount = window.cityLeagueDeck[oldDeckKey] || 0;
            
            if (currentCount > 0) {
                // Remove from old key
                delete window.cityLeagueDeck[oldDeckKey];
                
                // Add to new key
                window.cityLeagueDeck[newKey] = currentCount;

                // CRITICAL: Update order array to preserve card position
                if (window.cityLeagueDeckOrder) {
                    const oldKeyIndex = window.cityLeagueDeckOrder.indexOf(oldDeckKey);
                    if (oldKeyIndex !== -1) {
                        // Replace old key with new key at same position
                        window.cityLeagueDeckOrder[oldKeyIndex] = newKey;
                        console.log(`Updated deck order: ${oldDeckKey} -> ${newKey} at position ${oldKeyIndex}`);
                    }
                }

                // Save preference
                setRarityPreference(actualCardName, { mode: 'specific', set: setCode, number: setNumber });
                
                // Refresh the grid display
                renderMyDeckGrid('cityLeague');
            }

            closeRaritySwitcher();
        }

        function closeRaritySwitcher() {
            const modal = document.getElementById('raritySwitcherModal');
            modal.classList.remove('show');
            currentRaritySwitcherCard = null;
        }
        
        // Add ESC key handler for Rarity Switcher
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                const modal = document.getElementById('raritySwitcherModal');
                if (modal && modal.classList.contains('show')) {
                    closeRaritySwitcher();
                }
            }
        });

        function showImageView(imageUrl, cardName) {
            const modal = document.getElementById('fullscreenCardModal');
            const img = document.getElementById('fullscreenCardImage');
            
            if (!modal || !img) {
                console.error('Fullscreen modal elements not found');
                return;
            }
            
            img.src = imageUrl;
            img.alt = cardName;
            modal.classList.add('active');
            
            // Close on ESC key
            const escapeHandler = (e) => {
                if (e.key === 'Escape') {
                    closeFullscreenCard();
                    document.removeEventListener('keydown', escapeHandler);
                }
            };
            document.addEventListener('keydown', escapeHandler);
        }

        function closeFullscreenCard() {
            const modal = document.getElementById('fullscreenCardModal');
            if (modal) {
                modal.classList.remove('active');
            }
        }

        function openCardmarket(cardmarketUrl, cardName) {
            if (!cardmarketUrl || cardmarketUrl.trim() === '') {
                alert(`⚠️ Cardmarket link not available for ${cardName}\n\nPossible reasons:\n- Price Scraper has not been run yet\n- Card has no Cardmarket data\n\nPlease run RUN_PRICE_SCRAPER.bat.`);
                return;
            }
            
            // Open Cardmarket URL in new tab
            window.open(cardmarketUrl, '_blank');
        }

        function getRarityColor(rarity) {
            const colors = {
                'Common': '#A0A0A0',
                'Uncommon': '#6B8E23',
                'Rare': '#DAA520',
                'Holo Rare': '#FFD700',
                'Double Rare': '#FF6B9D',
                'Double Rare Holo': '#FF1493',
                'Secret Rare': '#8B008B',
                'Secret Rare Gold': '#FF8C00'
            };
            return colors[rarity] || '#CCCCCC';
        }

        function getRarityRank(rarity) {
            // Higher number = rarer/more valuable
            const rarityHierarchy = {
                'Common': 1,
                'Uncommon': 2,
                'Rare': 3,
                'Holo Rare': 4,
                'Rare Holo': 4,
                'Radiant Rare': 5,
                'Art Rare': 6,
                'Illustration Rare': 6,
                'Double Rare': 7,
                'Ultra Rare': 8,
                'Shiny Rare': 9,
                'Special Illustration Rare': 10,
                'Hyper Rare': 11,
                'Secret Rare': 12,
                'Secret Rare Gold': 13,
                'Promo': 14  // Promo highest priority for MEP cards
            };
            return rarityHierarchy[rarity] || 0;
        }

        function hideAppLoadingOverlay() {
            const overlay = document.getElementById('loadingOverlay')
                || document.getElementById('loading-overlay')
                || document.getElementById('appLoadingOverlay')
                || document.getElementById('app-loading');
            if (overlay) {
                overlay.remove();
            }

            const spinnerSelectors = [
                '.loading-spinner',
                '.spinner',
                '.spinning',
                '[data-loading-spinner="true"]'
            ];
            document.querySelectorAll(spinnerSelectors.join(',')).forEach(el => {
                el.remove();
            });
        }

        function runAppLoadingWatchdog(delayMs = 25000) {
            window.setTimeout(() => {
                const staleSelectors = [
                    '#loadingOverlay',
                    '#loading-overlay',
                    '#appLoadingOverlay',
                    '#app-loading',
                    '.loading-spinner',
                    '.spinner',
                    '.spinning',
                    '[data-loading-spinner="true"]'
                ];

                const staleNodes = Array.from(document.querySelectorAll(staleSelectors.join(',')));

                // Catch custom loaders that still animate infinitely even without standard class names.
                const infiniteAnimatedNodes = Array.from(document.querySelectorAll('body *')).filter(el => {
                    const style = window.getComputedStyle(el);
                    const iterations = style.animationIterationCount || '';
                    const animationName = (style.animationName || '').toLowerCase();
                    if (!animationName || animationName === 'none') return false;
                    return iterations === 'infinite' && animationName.includes('spin');
                });

                const nodesToRemove = new Set([...staleNodes, ...infiniteAnimatedNodes]);
                if (nodesToRemove.size > 0) {
                    nodesToRemove.forEach(node => node.remove());
                    console.log(`[Init] Loading watchdog removed ${nodesToRemove.size} stale loading node(s).`);
                }
            }, delayMs);
        }

        // Initialize
        document.addEventListener('DOMContentLoaded', async () => {
            try {
                const lastUpdate = localStorage.getItem('lastScraperUpdate') || new Date().toLocaleDateString('de-DE');
                const lastUpdateEl = document.getElementById('last-update');
                if (lastUpdateEl) {
                    lastUpdateEl.textContent = lastUpdate;
                }
                
                // Initialize City League format dropdowns
                const savedFormat = localStorage.getItem('cityLeagueFormat') || 'M4';
                const formatDropdown = document.getElementById('cityLeagueFormatSelect');
                const analysisFormatDropdown = document.getElementById('cityLeagueFormatSelectAnalysis');
                if (formatDropdown) {
                    formatDropdown.value = savedFormat;
                }
                if (analysisFormatDropdown) {
                    analysisFormatDropdown.value = savedFormat;
                }
                window.currentCityLeagueFormat = savedFormat;

                const startupLoads = [
                    { key: 'all_cards', run: () => loadAllCardsDatabase() },
                    { key: 'ace_specs', run: () => loadAceSpecsList() },
                    { key: 'city_leagues', run: () => loadCityLeagueData() },
                    { key: 'pokedex_numbers', run: () => loadPokedexNumbers() },
                    { key: 'set_mapping', run: () => loadSetMapping() },
                    { key: 'rarity_preferences', run: () => loadRarityPreferences() },
                    { key: 'set_order', run: () => loadSetOrderMap() }
                ];

                const settledLoads = await Promise.allSettled(startupLoads.map(load => load.run()));
                settledLoads.forEach((result, index) => {
                    const loadKey = startupLoads[index].key;
                    if (result.status === 'rejected') {
                        console.error(`[Init] ${loadKey} failed:`, result.reason);
                    }
                });

                window.cityLeagueLoaded = settledLoads[2].status === 'fulfilled';

                window.__appResourcesSettled = true;
                document.documentElement.dataset.appReady = 'true';
                window.dispatchEvent(new CustomEvent('app:resources-settled'));
                window.dispatchEvent(new CustomEvent('app:ui-ready'));
                console.log('[Init] All resources settled. UI is ready.');
            } catch (e) {
                console.error('[init] App initialization failed:', e);
            } finally {
                hideAppLoadingOverlay();
                runAppLoadingWatchdog();
            }
        });
        
        // ========================================================================
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
            console.log('Loading Current Meta Analysis...');
            const data = await loadCSV('current_meta_card_data.csv');
            console.log('Loaded data:', data ? `${data.length} rows` : 'null');
            
            // Load deck stats (winrates)
            const deckStats = await loadCSV('limitless_online_decks.csv');
            if (deckStats) {
                window.currentMetaDeckStats = deckStats;
                console.log('Loaded deck stats:', deckStats.length, 'decks');
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
                console.log('Loaded matchup data:', matchupData.length, 'matchups');
            }
            
            if (data && data.length > 0) {
                window.currentMetaAnalysisData = data;
                await populateCurrentMetaDeckSelect(data);
                setCurrentMetaFormatFilter('all'); // Set default filter
                window.currentMetaAnalysisLoaded = true;
                
                // Load meta card analysis for consistency calculations
                console.log('Loading meta card analysis for consistency...');
                loadMetaCardAnalysis('currentMeta');
            } else {
                const content = document.getElementById('currentMetaDeckSelect');
                if (content) {
                    content.innerHTML = '<option value="">Error loading data</option>';
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
                console.log('Loaded comparison data for', comparisonMap.size, 'decks');
            }
            
            // Apply format filter to data BEFORE building archetype list
            let filteredData = data;
            if (currentMetaFormatFilter !== 'all') {
                const filterValue = currentMetaFormatFilter === 'live' ? 'Meta Live' : 'Meta Play!';
                filteredData = data.filter(row => row.meta === filterValue);
                console.log(`Filtered archetypes by ${currentMetaFormatFilter}: ${filteredData.length} cards`);
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
            console.log('Found archetypes:', archetypeList.length);
            
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
                        console.log('[Dropdown] Displaying saved deck for selected archetype');
                    }
                } else {
                    clearCurrentMetaDeckView();
                }
            };
            
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
            console.log('[Current Meta] Format filter set to:', format);
            
            // Update button styles with null-checks
            ['All', 'Live', 'Play'].forEach(f => {
                const btn = document.getElementById(`currentMetaFilter${f}`);
                if (btn) {
                    if (f.toLowerCase() === format) {
                        btn.className = 'btn btn-primary';
                    } else {
                        btn.className = 'btn btn-secondary';
                    }
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
                    console.log('?? Previously selected archetype not available in this filter');
                }
            } else {
                console.warn('?? No deck selected - filter saved for when deck is selected');
            }
        }
        
        // Load deck data with format filtering
        function loadCurrentMetaDeckData(archetype) {
            console.log('Loading Current Meta deck data for:', archetype);
            const data = window.currentMetaAnalysisData;
            if (!data) return;
            
            window.currentCurrentMetaArchetype = archetype;
            
            // Check if we have a saved deck for this archetype
            const savedDeck = localStorage.getItem('currentMetaDeck');
            if (savedDeck) {
                try {
                    const parsed = JSON.parse(savedDeck);
                    if (parsed.archetype === archetype) {
                        console.log('[loadCurrentMetaDeckData] Deck already loaded for this archetype');
                    } else {
                        // Different archetype - CLEAR old deck
                        console.log('[loadCurrentMetaDeckData] Clearing old deck from different archetype:', parsed.archetype);
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
            
            console.log(`Found ${deckCards.length} cards for archetype ${archetype}`);
            
            // Apply format filter
            if (currentMetaFormatFilter !== 'all') {
                const filterValue = currentMetaFormatFilter === 'live' ? 'Meta Live' : 'Meta Play!';
                deckCards = deckCards.filter(row => row.meta === filterValue);
                console.log(`After ${currentMetaFormatFilter} filter: ${deckCards.length} cards`);
            }
            
            if (deckCards.length === 0) {
                alert(`No data found for ${archetype} with filter "${currentMetaFormatFilter}"!`);
                clearCurrentMetaDeckView();
                return;
            }
            
            // Recalculate aggregated values based on filtered data
            // Note: CSV data is already aggregated per meta (Meta Live / Meta Play!)
            // So the filtered data already has correct values for that meta source
            // We just need to ensure the percentage is correct relative to the filtered archetype total
            
            // Calculate total unique decks in archetype from filtered data
            // Use card_identifier (SET NUM) to identify unique card entries
            const uniqueCardVersions = new Set();
            let totalDecksInArchetype = 0;
            
            // Find a card with max total_decks_in_archetype value to use as archetype total
            deckCards.forEach(row => {
                const deckCount = parseInt(row.total_decks_in_archetype || 0);
                if (deckCount > totalDecksInArchetype) {
                    totalDecksInArchetype = deckCount;
                }
            });
            
            console.log(`Total decks in archetype (${archetype}) after filter: ${totalDecksInArchetype}`);
            
            // Deduplicate
            deckCards = deduplicateCards(deckCards);
            console.log('Found cards (after deduplication):', deckCards.length);
            
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
            document.getElementById('currentMetaStatsSection').style.display = 'block';
            
            // Render matchups
            renderCurrentMetaMatchups(archetype);
            
            // Show deck visual
            renderCurrentMetaDeckGrid(deckCards);
            
            // Apply current filter
            applyCurrentMetaFilter();
            
            // DON'T auto-display deck here - let the caller decide
            // (only display when user actively selects archetype from dropdown)
        }
        
        function clearCurrentMetaDeckView() {
            document.getElementById('currentMetaStatsSection').style.display = 'none';
            document.getElementById('currentMetaMatchupsSection').style.display = 'none';
            document.getElementById('currentMetaDeckVisual').style.display = 'none';
            document.getElementById('currentMetaDeckTableView').style.display = 'none';
            document.getElementById('currentMetaCardCount').textContent = '0 Karten';
            document.getElementById('currentMetaCardCountSummary').textContent = '/ 0 Total';
        }
        
        // Render best/worst matchups for Current Meta - extract directly from loaded HTML (1:1 copy)
        function renderCurrentMetaMatchups(archetype) {
            console.log('?? Rendering matchups for:', archetype);
            const deckStats = window.currentMetaDeckStats || [];
            const matchupsSection = document.getElementById('currentMetaMatchupsSection');
            const bestTable = document.getElementById('currentMetaBestMatchups');
            const worstTable = document.getElementById('currentMetaWorstMatchups');
            const titleEl = document.getElementById('currentMetaMatchupsTitle');
            
            // Find the matchup tables directly from the loaded HTML content (1:1 same as Current Meta Tab)
            const currentMetaContent = document.getElementById('currentMetaContent');
            if (!currentMetaContent) {
                console.error('? Current Meta content not loaded');
                matchupsSection.style.display = 'none';
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
                    console.log(`? Found HTML section for: ${archetype}`);
                    break;
                }
            }
            
            if (!matchingSection) {
                console.error(`? No HTML matchup section found for: ${archetype}`);
                matchupsSection.style.display = 'none';
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
                matchupsSection.style.display = 'none';
                return;
            }
            
            const allTablesInGrid = tablesGrid.querySelectorAll('table');
            if (allTablesInGrid.length < 2) {
                console.error(`? Expected 2 tables (best/worst), found: ${allTablesInGrid.length}`);
                matchupsSection.style.display = 'none';
                return;
            }
            
            const bestMatchupsTable = allTablesInGrid[0]; // First table = Best Matchups
            const worstMatchupsTable = allTablesInGrid[1]; // Second table = Worst Matchups
            
            console.log(`? Extracted matchup tables from HTML for: ${archetype}`);
            
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
                bestTable.innerHTML = bestHtml || '<tr><td colspan="3" style="text-align: center; padding: 20px;">Keine Daten verfuegbar</td></tr>';
            } else {
                bestTable.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px;">Keine Daten verfuegbar</td></tr>';
            }
            
            if (worstTbody) {
                // Copy all <tr> rows except the header row
                const worstRows = Array.from(worstMatchupsTable.querySelectorAll('tr')).slice(1); // Skip header
                let worstHtml = '';
                worstRows.forEach(row => {
                    worstHtml += row.outerHTML;
                });
                worstTable.innerHTML = worstHtml || '<tr><td colspan="3" style="text-align: center; padding: 20px;">Keine Daten verfuegbar</td></tr>';
            } else {
                worstTable.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px;">Keine Daten verfuegbar</td></tr>';
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
                dropdown.innerHTML = '<div style="padding: 10px; color: #444; font-weight: 500;">Keine Opponents verfuegbar</div>';
                window.currentMetaDeckMatchups = [];
            }
            
            matchupsSection.style.display = 'block';
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
                    option.style.display = 'block';
                    hasVisibleOptions = true;
                } else {
                    option.style.display = 'none';
                }
            });
            
            dropdown.style.display = hasVisibleOptions ? 'block' : 'none';
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
            dropdown.style.display = 'none';
            
            // Find matchup data
            const deckMatchups = window.currentMetaDeckMatchups || [];
            const matchup = deckMatchups.find(m => m.opponent === opponent);
            
            if (matchup) {
                const winRate = matchup.win_rate || '-';
                const record = matchup.record || '-';
                const totalGames = matchup.total_games || '0';
                
                detailsEl.innerHTML = `
                    <h4 style="margin-top: 0; color: #2c3e50;">?? Matchup: vs ${opponent}</h4>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-top: 10px;">
                        <div>
                            <strong style="color: #333;">Win Rate:</strong><br>
                            <span style="font-size: 1.5em; color: #3498db;">${winRate}</span>
                        </div>
                        <div>
                            <strong style="color: #333;">Record:</strong><br>
                            <span style="font-size: 1.2em; color: #2c3e50;">${record}</span>
                        </div>
                        <div>
                            <strong style="color: #333;">Total Games:</strong><br>
                            <span style="font-size: 1.5em; color: #2c3e50;">${totalGames}</span>
                        </div>
                    </div>
                `;
                detailsEl.style.display = 'block';
            } else {
                detailsEl.innerHTML = '<p style="color: #444; text-align: center; font-weight: 500;">No matchup data found</p>';
                detailsEl.style.display = 'block';
            }
        }
        
        // Close dropdown when clicking outside
        document.addEventListener('click', function(e) {
            const dropdown = document.getElementById('currentMetaOpponentDropdown');
            const input = document.getElementById('currentMetaOpponentSearch');
            if (dropdown && input && !input.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });
        
        function applyCurrentMetaFilter() {
            const filterSelect = document.getElementById('currentMetaFilterSelect');
            const archetype = document.getElementById('currentMetaDeckSelect')?.value;
            
            if (!filterSelect || !archetype || !window.currentCurrentMetaDeckCards) return;
            
            const filterValue = filterSelect.value;
            const allCards = window.currentCurrentMetaDeckCards;
            let filteredCards = [...allCards];
            
            if (filterValue !== 'all') {
                const threshold = parseInt(filterValue);
                filteredCards = filteredCards.filter(card => parseFloat(card.percentage_in_archetype || 0) >= threshold);
            }
            
            console.log(`Filter applied: ${filterValue}, showing ${filteredCards.length} of ${allCards.length} cards`);
            
            const filteredTotal = filteredCards.reduce((sum, card) => sum + parseInt(card.max_count || 0), 0);
            const allTotal = allCards.reduce((sum, card) => sum + parseInt(card.max_count || 0), 0);
            
            const tableViewContainer = document.getElementById('currentMetaDeckTableView');
            const gridViewContainer = document.getElementById('currentMetaDeckVisual');
            const isTableViewActive = tableViewContainer && tableViewContainer.style.display !== 'none';
            
            if (isTableViewActive) {
                renderCurrentMetaDeckTable(filteredCards);
            } else {
                renderCurrentMetaDeckGrid(filteredCards);
            }
            
            updateCurrentMetaCardCounts(filteredCards.length, filteredTotal, allTotal);
        }
        
        function updateCurrentMetaCardCounts(uniqueCount, filteredTotal, allTotal) {
            const countEl = document.getElementById('currentMetaCardCount');
            const summaryEl = document.getElementById('currentMetaCardCountSummary');
            
            if (countEl) countEl.textContent = `${uniqueCount} Karten`;
            if (summaryEl) summaryEl.textContent = `/ ${filteredTotal} Total`;
        }
        
        // Set overview rarity mode
        function setCurrentMetaOverviewRarityMode(mode) {
            console.log('?? Setting Current Meta overview rarity mode to:', mode);
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
            
            if (btnMin) btnMin.style.opacity = mode === 'min' ? '1' : '0.6';
            if (btnMax) btnMax.style.opacity = mode === 'max' ? '1' : '0.6';
            if (btnAll) btnAll.style.opacity = mode === 'all' ? '1' : '0.6';
            
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
            console.log('?? renderCurrentMetaDeckGrid called with:', cards.length, 'cards');
            const visualContainer = document.getElementById('currentMetaDeckVisual');
            const gridContainer = document.getElementById('currentMetaDeckGrid');
            if (!gridContainer) return;

            if (!Array.isArray(cards) || cards.length === 0) {
                gridContainer.innerHTML = getEmptyStateHtml();
                if (visualContainer) visualContainer.style.display = 'block';
                return;
            }
            
            const sortedCards = sortCardsByType([...cards]);
            const currentDeck = window.currentMetaDeck || {};
            
            let html = '';
            sortedCards.forEach(card => {
                const originalSetCode = card.set_code || '';
                const originalSetNumber = card.set_number || '';
                const rawCardName = card.card_name || '';
                const cardName = getDisplayCardName(rawCardName, originalSetCode, originalSetNumber);
                const cardNameEscaped = cardName.replace(/'/g, "\\'");
                
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
                    
                    // ALWAYS get image_url from allCardsDatabase first
                    let imageUrl = '';
                    let germanCardName = (displayCard.name_de || card.name_de || card.card_name_de || '').toLowerCase();
                    if (setCode && setNumber) {
                        const dbCard = getCanonicalCardRecord(setCode, setNumber);
                        imageUrl = getUnifiedCardImage(setCode, setNumber);
                        if (dbCard && dbCard.image_url) {
                            imageUrl = imageUrl || dbCard.image_url;
                        } else if (displayCard.image_url) {
                            imageUrl = imageUrl || displayCard.image_url;
                        }
                        if (dbCard && dbCard.name_de) {
                            germanCardName = String(dbCard.name_de).toLowerCase();
                        }
                    } else if (displayCard.image_url) {
                        imageUrl = displayCard.image_url;
                    }
                    imageUrl = getBestCardImage({
                        ...displayCard,
                        set_code: setCode,
                        set_number: setNumber,
                        card_name: cardName,
                        image_url: imageUrl
                    });
                    const rawPercentage = parseFloat(String(card.percentage_in_archetype || card.share_percent || 0).replace(',', '.'));
                    const maxCount = parseInt(card.max_count) || card.max_count || '?';
                    
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
                    
                    const decksWithCard = parseFloat(String(card.deck_count || card.deck_inclusion_count || 0).replace(',', '.')) || 0;
                    const totalDecksInArchetype = parseFloat(String(card.total_decks_in_archetype || 0).replace(',', '.')) || 0;
                    const totalCount = parseFloat(String(card.total_count || 0).replace(',', '.')) || 0;

                    const avgCountOverallRaw = parseFloat(String(card.average_count_overall || '').replace(',', '.'));
                    const avgCountInUsedRaw = parseFloat(String(card.average_count || card.avg_count || '').replace(',', '.'));

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
                    
                    let eurPrice = '';
                    let cardmarketUrl = '';
                    if (setCode && setNumber) {
                        // O(1) indexed lookup
                        let priceCard = (cardsBySetNumberMap || {})[`${setCode}-${setNumber}`] || null;
                        if (!priceCard) {
                            const normalizedNumber = setNumber.replace(/^0+/, '') || '0';
                            priceCard = (cardsBySetNumberMap || {})[`${setCode}-${normalizedNumber}`] || null;
                        }
                        
                        if (priceCard) {
                            eurPrice = priceCard.eur_price || '';
                            cardmarketUrl = priceCard.cardmarket_url || '';
                        }
                    }
                    const priceDisplay = eurPrice || '0,00€';
                    const priceBackground = eurPrice ? 'linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)' : 'linear-gradient(135deg, #777 0%, #999 100%)';
                    const cardmarketUrlEscaped = (cardmarketUrl || '').replace(/'/g, "\\'");
                    
                    // Determine card type for filtering with database-based approach
                    const filterCategory = getCardType(cardName, setCode, setNumber);
                    const germanCardNameEscaped = germanCardName.replace(/"/g, '&quot;');
                    
                    html += `
                        <div class="card-item" data-card-name="${cardName.toLowerCase()}" data-card-name-de="${germanCardNameEscaped}" data-card-set="${setCode.toLowerCase()}" data-card-number="${setNumber.toLowerCase()}" data-card-type="${filterCategory}" style="position: relative; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.15); cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; background: white;">
                            <div class="card-image-container" style="position: relative; width: 100%;">
                                <img src="${imageUrl}" alt="${cardName}" loading="lazy" referrerpolicy="no-referrer" style="width: 100%; aspect-ratio: 2.5/3.5; object-fit: cover; cursor: zoom-in;" onerror="handleCardImageError(this, '${setCode}', '${setNumber}')" onclick="if (typeof event !== 'undefined' && event) event.stopPropagation(); showSingleCard(this.src, '${cardNameEscaped}');">
                                <div style="position: absolute; top: 5px; right: 5px; background: #dc3545; color: white; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.7em; box-shadow: 0 2px 4px rgba(0,0,0,0.3); z-index: 2;">${maxCount}</div>
                                ${deckCount > 0 ? `<div style="position: absolute; top: 5px; left: 5px; background: #28a745; color: white; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.7em; box-shadow: 0 2px 4px rgba(0,0,0,0.3); z-index: 2;">${deckCount}</div>` : ''}
                                
                                <!-- Card info section - Mobile Overlay -->
                                <div class="card-info-bottom" style="padding: 5px; background: white; font-size: 0.7em; text-align: center; min-height: 48px; display: flex; flex-direction: column; justify-content: space-between;">
                                    <div class="card-info-text">
                                        <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; margin-bottom: 1px; color: #333; font-size: 0.58em;">${cardName}${cardNameWarning}</div>
                                        <div style="color: #333; font-size: 0.52em; margin-bottom: 1px; font-weight: 600;">${setCode} ${setNumber}</div>
                                        <div style="color: #333; font-size: 0.55em; margin-bottom: 1px; font-weight: 600;">${percentage}% | Ø ${avgCountInUsedDecks}x (${avgCountOverall}x)</div>
                                    </div>
                                    <!-- Rarity Switcher & Actions (4 buttons: - ? Ø +) -->
                                    <div class="card-action-buttons" style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 2px; margin-top: 4px;">
                                        <button onclick="event.stopPropagation(); removeCardFromDeck('currentMeta', '${cardNameEscaped}')" style="background: #dc3545; color: white; border: none; border-radius: 3px; height: 16px; cursor: pointer; font-weight: bold; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; min-height: unset; min-width: unset;">-</button>
                                        <button onclick="event.stopPropagation(); openRaritySwitcher('${cardNameEscaped}', '${cardNameEscaped}')" style="background: #ffc107; color: #333; border: none; border-radius: 3px; height: 16px; cursor: pointer; font-size: 10px; font-weight: bold; text-align: center; padding: 0; display: flex; align-items: center; justify-content: center; min-height: unset; min-width: unset;">★</button>
                                        <button onclick="event.stopPropagation(); openCardmarket('${cardmarketUrlEscaped}', '${cardNameEscaped}')" style="background: ${priceBackground}; color: white; height: 16px; border: none; border-radius: 3px; cursor: ${eurPrice ? 'pointer' : 'not-allowed'}; font-size: 6px; font-weight: bold; padding: 0 1px; display: flex; align-items: center; justify-content: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4); min-height: unset; min-width: unset;">${priceDisplay}</button>
                                        <button onclick="event.stopPropagation(); addCardToDeck('currentMeta', '${cardNameEscaped}', '${setCode}', '${setNumber}')" style="background: #28a745; color: white; border: none; border-radius: 3px; height: 16px; cursor: pointer; font-weight: bold; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; min-height: unset; min-width: unset;">+</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                });
            });
            
            gridContainer.innerHTML = html;
            visualContainer.style.display = 'block';
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
            
            cards.forEach(card => {
                // Check if card is Ace Spec (exclusive category)
                const isAceSpec = card.is_ace_spec === 'Yes' || 
                                  (card.type && card.type.toLowerCase().includes('ace spec')) || 
                                  (card.rarity && card.rarity.toLowerCase().includes('ace spec'));
                
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
                    const cardNameEscaped = cardName.replace(/'/g, "\\'");
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
                            <div style="flex-shrink: 0;">
                                <button class="btn btn-success" style="padding: 10px 20px; font-size: 0.95em;" onclick="addCardToDeck('currentMeta', '${cardNameEscaped}', '${setCode}', '${setNumber}')">Add to Deck</button>
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
            tableViewContainer.style.display = 'block';
            console.log('Current Meta table rendered with tier grouping:', { core: coreCards.length, aceSpec: aceSpecCards.length, tech: techCards.length, spicy: spicyCards.length });
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

                const matchesType = pastMetaOverviewCardTypeFilter === 'all' || cardType === pastMetaOverviewCardTypeFilter;
                
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
                alert('? Please select a deck first!');
                return;
            }
            
            const isGridViewActive = gridViewContainer.style.display !== 'none';
            
            if (isGridViewActive) {
                gridViewContainer.style.display = 'none';
                if (button) button.textContent = '??? Grid View';
            } else {
                tableViewContainer.style.display = 'none';
                if (button) button.textContent = '?? List View';
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
                alert('⚠️ No cards to copy!\n\nPlease select an archetype first.');
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
                } else if (category === 'Energy' || category === 'Special Energy') {
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
                alert('? Deck copied to clipboard!');
            }).catch(err => {
                console.error('Error copying:', err);
                alert('? Error copying to clipboard!');
            });
        }
        
        // Add filter change listener
        document.addEventListener('DOMContentLoaded', function() {
            const filterSelect = document.getElementById('currentMetaFilterSelect');
            if (filterSelect) {
                filterSelect.onchange = applyCurrentMetaFilter;
            }
        });

        // ==================== DECK COMPARISON FEATURE ====================

        let currentDeckSource = null;

        async function openDeckCompare(source) {
            currentDeckSource = source;
            
            // Ensure cards database is loaded before allowing comparison
            if (!window.allCardsDatabase || window.allCardsDatabase.length === 0) {
                console.log('[Deck Compare] Loading cards database...');
                document.getElementById('deckCompareModal').style.display = 'flex';
                document.getElementById('deckCompareResult').innerHTML = '<div class="loading">? Loading card database...</div>';
                document.getElementById('deckCompareResult').style.display = 'block';
                
                try {
                    await loadAllCardsDatabase();
                    console.log('[Deck Compare] ? Database loaded successfully');
                    document.getElementById('deckCompareResult').style.display = 'none';
                } catch (error) {
                    console.error('[Deck Compare] Failed to load database:', error);
                    document.getElementById('deckCompareResult').innerHTML = '<div class="error">? Error loading card database</div>';
                    return;
                }
            }
            
            // Load saved decks into dropdown
            const savedDeckSelect = document.getElementById('savedDeckSelect');
            if (savedDeckSelect) {
                savedDeckSelect.innerHTML = '<option value="">-- Select a saved deck --</option>';
                
                if (window.userDecks && window.userDecks.length > 0) {
                    window.userDecks.forEach(deck => {
                        const totalCards = deck.totalCards || Object.values(deck.cards || {}).reduce((sum, count) => sum + count, 0);
                        const option = document.createElement('option');
                        option.value = deck.id;
                        option.textContent = `${deck.name} (${totalCards} cards - ${deck.archetype || 'Custom'})`;
                        savedDeckSelect.appendChild(option);
                    });
                } else {
                    const option = document.createElement('option');
                    option.value = '';
                    option.textContent = '-- No saved decks available --';
                    option.disabled = true;
                    savedDeckSelect.appendChild(option);
                }
            }
            
            document.getElementById('deckCompareModal').style.display = 'flex';
            document.getElementById('oldDeckListInput').value = '';
            document.getElementById('deckCompareResult').style.display = 'none';
        }

        function closeDeckCompare() {
            document.getElementById('deckCompareModal').style.display = 'none';
            currentDeckSource = null;
        }
        
        // Compare with own saved deck
        async function compareWithSavedDeck() {
            const savedDeckSelect = document.getElementById('savedDeckSelect');
            const selectedDeckId = savedDeckSelect.value;
            
            if (!selectedDeckId) {
                alert('⚠️ Please select a saved deck!');
                return;
            }
            
            if (!currentDeckSource) {
                alert('⚠️ Error: No deck source selected!');
                return;
            }
            
            // Check if card database is loaded
            if (!cardsBySetNumberMap || Object.keys(cardsBySetNumberMap).length === 0) {
                console.error('[compareWithSavedDeck] ERROR: cardsBySetNumberMap not loaded!');
                alert('⚠️ Error: Card database not loaded yet. Please wait a moment and try again.');
                return;
            }
            
            // Get selected saved deck
            const savedDeck = window.userDecks.find(d => d.id === selectedDeckId);
            if (!savedDeck) {
                alert('⚠️ Error: Saved deck not found!');
                return;
            }
            
            console.log('[compareWithSavedDeck] Comparing with saved deck:', savedDeck.name);
            
            // Convert saved deck to "old deck" format (same as parseDeckList output)
            // Deck format: "CardName (SET NUMBER)" with exact prints preserved
            const oldDeck = [];
            for (const [deckKey, count] of Object.entries(savedDeck.cards || {})) {
                // Key format: "CardName (SET NUMBER)" or just "CardName"
                const match = deckKey.match(/^(.+?)\s+\(([A-Z0-9]+)\s+(\d+)\)$/);
                if (match) {
                    const cardName = match[1];
                    const setCode = match[2];
                    const setNumber = match[3];
                    oldDeck.push({
                        count: count,
                        name: cardName,
                        set: setCode,
                        number: setNumber,
                        key: `${setCode}-${setNumber}`
                    });
                } else {
                    // No set info available (old format or plain name), just use card name
                    oldDeck.push({
                        count: count,
                        name: deckKey,
                        set: null,
                        number: null,
                        key: deckKey
                    });
                }
            }
            
            console.log('[compareWithSavedDeck] Old deck (saved) parsed:', oldDeck);
            
            // Get current deck and convert to same format
            const deckMap = currentDeckSource === 'cityLeague' ? window.cityLeagueDeck :
                           currentDeckSource === 'currentMeta' ? window.currentMetaDeck :
                           window.pastMetaDeck;
            
            if (!deckMap || Object.keys(deckMap).length === 0) {
                alert('⚠️ Error: Current deck is empty!');
                return;
            }
            
            const currentDeck = [];
            for (const [key, count] of Object.entries(deckMap)) {
                // Key format: "CardName (SET NUMBER)" or just "CardName"
                const match = key.match(/^(.+?)\s+\(([A-Z0-9]+)\s+(\d+)\)$/);
                if (match) {
                    const cardName = match[1];
                    const setCode = match[2];
                    const setNumber = match[3];
                    currentDeck.push({
                        count: count,
                        name: cardName,
                        set: setCode,
                        number: setNumber,
                        key: `${setCode}-${setNumber}`
                    });
                } else {
                    // No set info available, just use card name
                    currentDeck.push({
                        count: count,
                        name: key,
                        set: null,
                        number: null,
                        key: key
                    });
                }
            }
            console.log('[compareWithSavedDeck] Current deck parsed:', currentDeck);
            
            // Perform comparison using the same logic as compareDeckLists
            performDeckComparison(oldDeck, currentDeck, savedDeck.name);
        }
        
        // Common comparison logic (extracted from compareDeckLists)
        function performDeckComparison(oldDeck, currentDeck, oldDeckName = 'Old Deck') {
            // Track which cards in current deck have been matched
            const currentDeckMatched = new Array(currentDeck.length).fill(false);
            
            // Collect ALL cards to display (current deck + removed cards)
            const allDisplayCards = [];
            
            // Process old deck cards to find matches and changes
            for (const oldCard of oldDeck) {
                // Try to find matching card in current deck
                let bestMatch = null;
                let bestMatchIndex = -1;
                
                // First: Try exact match (same set + number)
                for (let i = 0; i < currentDeck.length; i++) {
                    if (currentDeckMatched[i]) continue;
                    const newCard = currentDeck[i];
                    if (oldCard.set === newCard.set && oldCard.number === newCard.number) {
                        bestMatch = newCard;
                        bestMatchIndex = i;
                        break;
                    }
                }
                
                // Second: Try international print match
                if (!bestMatch && oldCard.set && oldCard.number) {
                    for (let i = 0; i < currentDeck.length; i++) {
                        if (currentDeckMatched[i]) continue;
                        const newCard = currentDeck[i];
                        if (newCard.set && newCard.number && 
                            areSameInternationalPrint(oldCard.set, oldCard.number, newCard.set, newCard.number)) {
                            bestMatch = newCard;
                            bestMatchIndex = i;
                            break;
                        }
                    }
                }
                
                if (bestMatch) {
                    // Card found in new deck - mark as matched
                    currentDeckMatched[bestMatchIndex] = true;
                } else {
                    // Card not found in new deck = removed (will be displayed)
                    allDisplayCards.push({
                        name: oldCard.name,
                        set: oldCard.set,
                        number: oldCard.number,
                        oldCount: oldCard.count,
                        newCount: 0,
                        changeType: 'removed'
                    });
                }
            }
            
            // Add ALL current deck cards (matched or new)
            for (let i = 0; i < currentDeck.length; i++) {
                const newCard = currentDeck[i];
                
                // Find if this card existed in old deck
                let oldCard = null;
                for (const old of oldDeck) {
                    if (old.set === newCard.set && old.number === newCard.number) {
                        oldCard = old;
                        break;
                    }
                    // Also check international prints
                    if (!oldCard && old.set && old.number && newCard.set && newCard.number &&
                        areSameInternationalPrint(old.set, old.number, newCard.set, newCard.number)) {
                        oldCard = old;
                        break;
                    }
                }
                
                if (oldCard) {
                    // Card existed in old deck
                    if (oldCard.count !== newCard.count) {
                        // Count changed
                        allDisplayCards.push({
                            name: newCard.name,
                            set: newCard.set,
                            number: newCard.number,
                            oldCount: oldCard.count,
                            newCount: newCard.count,
                            changeType: 'changed'
                        });
                    } else {
                        // No change
                        allDisplayCards.push({
                            name: newCard.name,
                            set: newCard.set,
                            number: newCard.number,
                            oldCount: oldCard.count,
                            newCount: newCard.count,
                            changeType: 'unchanged'
                        });
                    }
                } else if (!currentDeckMatched[i]) {
                    // New card (not matched by old deck)
                    allDisplayCards.push({
                        name: newCard.name,
                        set: newCard.set,
                        number: newCard.number,
                        oldCount: 0,
                        newCount: newCard.count,
                        changeType: 'new'
                    });
                }
            }
            
            // Sort by change type, then by card name
            allDisplayCards.sort((a, b) => {
                const typeOrder = { 'removed': 1, 'new': 2, 'changed': 3, 'unchanged': 4 };
                if (typeOrder[a.changeType] !== typeOrder[b.changeType]) {
                    return typeOrder[a.changeType] - typeOrder[b.changeType];
                }
                return a.name.localeCompare(b.name);
            });
            
            // Display results
            displayComparisonResults(allDisplayCards, oldDeckName);
        }
        
        // Display comparison results
        function displayComparisonResults(allDisplayCards, oldDeckName) {
            const resultDiv = document.getElementById('deckCompareResult');
            resultDiv.style.display = 'block';
            
            // Count statistics
            const removed = allDisplayCards.filter(c => c.changeType === 'removed');
            const added = allDisplayCards.filter(c => c.changeType === 'new');
            const changed = allDisplayCards.filter(c => c.changeType === 'changed');
            const unchanged = allDisplayCards.filter(c => c.changeType === 'unchanged');
            
            let html = `
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px; margin-bottom: 20px; color: white;">
                    <h3 style="margin: 0 0 15px 0; font-size: 1.3em;">?? Comparison Results: ${oldDeckName} vs Current Deck</h3>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px;">
                        <div style="background: rgba(255,255,255,0.2); padding: 10px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 2em; font-weight: bold;">${removed.length}</div>
                            <div style="font-size: 0.9em; opacity: 0.9;">? Removed</div>
                        </div>
                        <div style="background: rgba(255,255,255,0.2); padding: 10px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 2em; font-weight: bold;">${added.length}</div>
                            <div style="font-size: 0.9em; opacity: 0.9;">? Added</div>
                        </div>
                        <div style="background: rgba(255,255,255,0.2); padding: 10px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 2em; font-weight: bold;">${changed.length}</div>
                            <div style="font-size: 0.9em; opacity: 0.9;">?? Changed</div>
                        </div>
                        <div style="background: rgba(255,255,255,0.2); padding: 10px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 2em; font-weight: bold;">${unchanged.length}</div>
                            <div style="font-size: 0.9em; opacity: 0.9;">? Unchanged</div>
                        </div>
                    </div>
                </div>
            `;
            
            // Display cards grouped by change type
            const groups = [
                { type: 'removed', title: '? Removed Cards', color: '#e74c3c', cards: removed },
                { type: 'new', title: '? Added Cards', color: '#27ae60', cards: added },
                { type: 'changed', title: '?? Changed Count', color: '#f39c12', cards: changed },
                { type: 'unchanged', title: '? Unchanged Cards', color: '#95a5a6', cards: unchanged }
            ];
            
            groups.forEach(group => {
                if (group.cards.length > 0) {
                    html += `
                        <div style="margin-bottom: 20px;">
                            <h4 style="background: ${group.color}; color: white; padding: 10px 15px; border-radius: 6px; margin: 0 0 10px 0;">${group.title} (${group.cards.length})</h4>
                            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px;">
                    `;
                    
                    group.cards.forEach(card => {
                        const countDisplay = group.type === 'removed' ? `${card.oldCount} ? 0` :
                                           group.type === 'new' ? `0 ? ${card.newCount}` :
                                           group.type === 'changed' ? `${card.oldCount} ? ${card.newCount}` :
                                           `${card.newCount}`;
                        
                        const cardData = cardsBySetNumberMap[`${card.set}-${card.number}`];
                        const imageUrl = cardData ? cardData.image_url : '';
                        
                        html += `
                            <div style="background: white; border: 2px solid ${group.color}; border-radius: 8px; padding: 10px; text-align: center;">
                                ${imageUrl ? `<img src="${imageUrl}" alt="${card.name}" style="width: 100%; border-radius: 6px; margin-bottom: 8px;">` : ''}
                                <div style="font-weight: 600; font-size: 0.9em; margin-bottom: 4px;">${card.name}</div>
                                <div style="font-size: 0.8em; color: #666; margin-bottom: 4px;">${card.set} ${card.number}</div>
                                <div style="font-size: 1.1em; font-weight: bold; color: ${group.color};">${countDisplay}</div>
                            </div>
                        `;
                    });
                    
                    html += `
                            </div>
                        </div>
                    `;
                }
            });
            
            resultDiv.innerHTML = html;
        }
        
        // Add ESC key handler for Deck Compare
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                const modal = document.getElementById('deckCompareModal');
                if (modal && modal.style.display === 'flex') {
                    closeDeckCompare();
                }
            }
        });

        function parseDeckList(text) {
            const deck = [];
            const lines = text.split('\n');
            
            for (let line of lines) {
                line = line.trim();
                if (!line) continue;
                if (line.includes('Pokémon:') || line.includes('Trainer:') || line.includes('Energy:')) continue;
                
                // Format: "2 Lunatone ASC 105" or "2 Lunatone ASC 105 PH" or "1 Meowth ex M3 61"
                // Extract: count, card name, set code (including Japanese sets like M3, M2a), set number
                const match = line.match(/^(\d+)\s+(.+?)\s+([A-Z][A-Z0-9]*[a-z]*)\s+(\d+)/);
                if (match) {
                    const count = parseInt(match[1]);
                    const cardName = match[2].trim();
                    const setCode = match[3];
                    const setNumber = match[4];
                    
                    deck.push({
                        count: count,
                        name: cardName,
                        set: setCode,
                        number: setNumber,
                        key: `${setCode}-${setNumber}` // Unique identifier
                    });
                }
            }
            
            return deck;
        }
        
        // Check if two cards are the same international print
        function areSameInternationalPrint(set1, number1, set2, number2) {
            if (set1 === set2 && number1 === number2) return true;
            
            // Check if cards database is loaded
            if (!cardsBySetNumberMap || Object.keys(cardsBySetNumberMap).length === 0) {
                console.warn('[areSameInternationalPrint] cardsBySetNumberMap not loaded yet!');
                return false;
            }
            
            // SPECIAL CASE: Basic Energies are always the same card regardless of set
            const card1 = cardsBySetNumberMap[`${set1}-${number1}`];
            const card2 = cardsBySetNumberMap[`${set2}-${number2}`];
            if (card1 && card2 && isBasicEnergy(card1.name) && isBasicEnergy(card2.name)) {
                if (card1.name === card2.name) {
                    console.log(`[areSameInternationalPrint] ? Basic Energy match: ${set1} ${number1} ? ${set2} ${number2} (${card1.name})`);
                    return true;
                }
            }
            
            // Get all international prints for card 1
            const prints1 = getInternationalPrintsForCard(set1, number1);
            
            // Check if card 2 is in the international prints of card 1
            if (prints1 && prints1.length > 0) {
                const match = prints1.some(p => p.set === set2 && p.number === number2);
                if (match) {
                    console.log(`[areSameInternationalPrint] ? Match found: ${set1} ${number1} ? ${set2} ${number2}`);
                    return true;
                }
            }
            
            // Also check in reverse direction (card 2 -> card 1)
            const prints2 = getInternationalPrintsForCard(set2, number2);
            if (prints2 && prints2.length > 0) {
                const match = prints2.some(p => p.set === set1 && p.number === number1);
                if (match) {
                    console.log(`[areSameInternationalPrint] ? Match found (reverse): ${set1} ${number1} ? ${set2} ${number2}`);
                    return true;
                }
            }
            
            console.log(`[areSameInternationalPrint] ? No match: ${set1} ${number1} vs ${set2} ${number2}`);
            return false;
        }

        function compareDeckLists() {
            const oldDeckText = document.getElementById('oldDeckListInput').value.trim();
            
            if (!oldDeckText) {
                alert('⚠️ Please paste an old deck list first!');
                return;
            }
            
            if (!currentDeckSource) {
                alert('⚠️ Error: No deck source selected!');
                return;
            }
            
            // Check if card database is loaded
            if (!cardsBySetNumberMap || Object.keys(cardsBySetNumberMap).length === 0) {
                console.error('[deckCompare] ERROR: cardsBySetNumberMap not loaded!');
                alert('⚠️ Error: Card database not loaded yet. Please wait a moment and try again.');
                return;
            }
            
            console.log(`[deckCompare] cardsBySetNumberMap loaded: ${Object.keys(cardsBySetNumberMap).length} cards`);
            
            // Parse old deck (from text input)
            const oldDeck = parseDeckList(oldDeckText);
            console.log('[deckCompare] Old deck parsed:', oldDeck);
            
            // Get current deck and convert to same format
            const deckMap = currentDeckSource === 'cityLeague' ? window.cityLeagueDeck :
                           currentDeckSource === 'currentMeta' ? window.currentMetaDeck :
                           window.pastMetaDeck;
            
            if (!deckMap || Object.keys(deckMap).length === 0) {
                alert('⚠️ Error: Current deck is empty!');
                return;
            }
            
            const currentDeck = [];
            for (const [key, count] of Object.entries(deckMap)) {
                // Key format: "CardName (SET NUMBER)" or just "CardName"
                const match = key.match(/^(.+?)\s+\(([A-Z0-9]+)\s+(\d+)\)$/);
                if (match) {
                    const cardName = match[1];
                    const setCode = match[2];
                    const setNumber = match[3];
                    currentDeck.push({
                        count: count,
                        name: cardName,
                        set: setCode,
                        number: setNumber,
                        key: `${setCode}-${setNumber}`
                    });
                } else {
                    // No set info available, just use card name
                    currentDeck.push({
                        count: count,
                        name: key,
                        set: null,
                        number: null,
                        key: key
                    });
                }
            }
            console.log('[deckCompare] Current deck parsed:', currentDeck);
            
            // Use common comparison logic
            performDeckComparison(oldDeck, currentDeck, 'Manual Decklist');
        }

        // ================================================================
        // PHASE 3: DECK SHARING VIA URL
        // ================================================================

        /**
         * Share deck via URL
         * Uses Firebase Firestore for short links if available, otherwise Base64
         */
        async function shareDeck(source) {
            let deck, order, archetype;
            if (source === 'cityLeague') {
                deck = window.cityLeagueDeck; order = window.cityLeagueDeckOrder; archetype = window.currentCityLeagueArchetype;
            } else if (source === 'currentMeta') {
                deck = window.currentMetaDeck; order = window.currentMetaDeckOrder; archetype = window.currentCurrentMetaArchetype;
            } else if (source === 'pastMeta') {
                deck = window.pastMetaDeck; order = window.pastMetaDeckOrder; archetype = window.pastMetaCurrentArchetype;
            } else return;
            const total = Object.values(deck || {}).reduce((s, c) => s + c, 0);
            if (total === 0) { showDeckShareToast('⚠️ No cards in deck to share!'); return; }
            
            const payload = { deck, order, archetype, source, timestamp: Date.now() };

            // Try Firebase Firestore for short links (if available)
            if (window.db && typeof window.db.collection === 'function') {
                try {
                    const shareId = generateShortId();
                    await window.db.collection('shared_decks').doc(shareId).set(payload);
                    
                    const url = new URL(window.location.href);
                    url.searchParams.set('sharedDeck', shareId);
                    
                    navigator.clipboard.writeText(url.toString()).then(() => {
                        showDeckShareToast(`🔗 Short link copied! (${total} cards)`);
                    }).catch(() => { prompt('Copy this share link:', url.toString()); });
                    return;
                } catch (err) {
                    console.warn('[shareDeck] Firebase Firestore failed, falling back to Base64:', err);
                }
            }

            // Fallback: Base64 encoding (always works, no DB needed)
            const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
            const url = new URL(window.location.href);
            url.searchParams.set('deck', encoded);
            navigator.clipboard.writeText(url.toString()).then(() => {
                showDeckShareToast(`🔗 Share link copied! (${total} cards)`);
            }).catch(() => { prompt('Copy this share link:', url.toString()); });
        }

        function generateShortId() {
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
            let id = '';
            for (let i = 0; i < 6; i++) {
                id += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return id;
        }

        function showDeckShareToast(msg) {
            let toast = document.getElementById('deckShareToast');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'deckShareToast';
                toast.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:#27ae60;color:white;padding:14px 28px;border-radius:30px;font-weight:bold;font-size:1em;z-index:99999;box-shadow:0 4px 20px rgba(0,0,0,0.25);opacity:0;transition:opacity 0.3s;pointer-events:none;white-space:nowrap;';
                document.body.appendChild(toast);
            }
            toast.textContent = msg;
            toast.style.opacity = '1';
            clearTimeout(toast._timeout);
            toast._timeout = setTimeout(() => { toast.style.opacity = '0'; }, 3000);
        }

        async function importDeckFromUrl() {
            try {
                const params = new URLSearchParams(window.location.search);
                
                // Priority 1: Firebase Firestore short link (?sharedDeck=ID)
                const sharedId = params.get('sharedDeck');
                if (sharedId && window.db && typeof window.db.collection === 'function') {
                    try {
                        const docRef = await window.db.collection('shared_decks').doc(sharedId).get();
                        if (docRef.exists) {
                            const payload = docRef.data();
                            await loadDeckFromPayload(payload);
                            // Remove sharedDeck param from URL
                            const cleanUrl = new URL(window.location.href);
                            cleanUrl.searchParams.delete('sharedDeck');
                            window.history.replaceState({}, '', cleanUrl.toString());
                            return;
                        } else {
                            console.warn('[importDeckFromUrl] Shared deck not found:', sharedId);
                            showDeckShareToast('❌ Shared deck not found!');
                            return;
                        }
                    } catch (err) {
                        console.warn('[importDeckFromUrl] Firestore fetch failed:', err);
                    }
                }

                // Priority 2: Base64 encoded deck (?deck=...)
                const encoded = params.get('deck');
                if (!encoded) return;
                const payload = JSON.parse(decodeURIComponent(escape(atob(encoded))));
                await loadDeckFromPayload(payload);
                // Remove deck param from URL
                const cleanUrl = new URL(window.location.href);
                cleanUrl.searchParams.delete('deck');
                window.history.replaceState({}, '', cleanUrl.toString());
            } catch (e) {
                console.warn('[importDeckFromUrl] Failed:', e);
            }
        }

        async function loadDeckFromPayload(payload) {
            const { deck, order, archetype, source } = payload;
            if (!deck || !source) return;
            
            if (source === 'cityLeague') {
                window.cityLeagueDeck = deck;
                window.cityLeagueDeckOrder = order || Object.keys(deck);
                window.currentCityLeagueArchetype = archetype || null;
            } else if (source === 'currentMeta') {
                window.currentMetaDeck = deck;
                window.currentMetaDeckOrder = order || Object.keys(deck);
                window.currentCurrentMetaArchetype = archetype || null;
            } else if (source === 'pastMeta') {
                window.pastMetaDeck = deck;
                window.pastMetaDeckOrder = order || Object.keys(deck);
                window.pastMetaCurrentArchetype = archetype || null;
            } else return;
            
            // Navigate to the deck builder tab for this source
            const tabMap = { cityLeague: 'city-league-analysis', currentMeta: 'current-analysis', pastMeta: 'past-meta' };
            const targetTab = tabMap[source];
            if (targetTab && typeof switchTab === 'function') switchTab(targetTab);
            
            // Defer display until card database is populated
            window._pendingUrlImport = source;
            const poll = setInterval(() => {
                if (window.allCardsDatabase && window.allCardsDatabase.length > 0) {
                    clearInterval(poll);
                    updateDeckDisplay(window._pendingUrlImport);
                    window._pendingUrlImport = null;
                }
            }, 200);
            setTimeout(() => clearInterval(poll), 30000);
            
            const total = Object.values(deck).reduce((s, c) => s + c, 0);
            showDeckShareToast(`🎴 Deck imported: ${total} cards`);
        }

        // ================================================================
        // PTCGL IMPORT/EXPORT (Pokémon Trading Card Game Live Format)
        // ================================================================

        /**
         * Export deck to PTCGL format (official Pokémon TCG Live text format)
         * Format: "Count CardName SetCode SetNumber" per line
         * Grouped by: Pokémon, Trainer, Energy (separated by blank lines)
         */
        function exportToPTCGL(source) {
            let deck, archetype;
            if (source === 'cityLeague') {
                deck = window.cityLeagueDeck;
                archetype = window.currentCityLeagueArchetype || 'My Deck';
            } else if (source === 'currentMeta') {
                deck = window.currentMetaDeck;
                archetype = window.currentCurrentMetaArchetype || 'My Deck';
            } else if (source === 'pastMeta') {
                deck = window.pastMetaDeck;
                archetype = window.pastMetaCurrentArchetype || 'My Deck';
            } else return;

            const total = Object.values(deck || {}).reduce((s, c) => s + c, 0);
            if (total === 0) {
                showDeckShareToast('⚠️ No cards in deck to export!');
                return;
            }

            // Build card database map
            const allCardsDb = window.allCardsDatabase || [];
            const cardsByName = {};
            allCardsDb.forEach(card => {
                if (!cardsByName[card.name]) cardsByName[card.name] = [];
                cardsByName[card.name].push(card);
            });

            // Group cards by supertype (Pokemon, Trainer, Energy)
            const pokemon = [];
            const trainers = [];
            const energy = [];

            for (const [deckKey, count] of Object.entries(deck)) {
                if (count <= 0) continue;

                // Extract card name and set info
                let cardName = deckKey.replace(/\s*\([^)]+\)$/, '').trim();
                let setCode = '';
                let setNumber = '';

                const setMatch = deckKey.match(/\(([A-Z0-9-]+)\s+([A-Z0-9]+)\)$/);
                if (setMatch) {
                    setCode = setMatch[1];
                    setNumber = setMatch[2];
                }

                // Fallback: look up from database if no set info in deckKey
                if (!setCode && cardsByName[cardName] && cardsByName[cardName].length > 0) {
                    const card = cardsByName[cardName][0];
                    setCode = card.set;
                    setNumber = card.number;
                }

                // Determine supertype
                let supertype = 'Pokemon'; // default
                if (cardsByName[cardName] && cardsByName[cardName].length > 0) {
                    const card = cardsByName[cardName][0];
                    const type = (card.type || '').toLowerCase();
                    if (type.includes('energy')) {
                        supertype = 'Energy';
                    } else if (type.includes('trainer') || type.includes('item') || 
                               type.includes('supporter') || type.includes('stadium') || 
                               type.includes('tool')) {
                        supertype = 'Trainer';
                    }
                }

                const line = `${count} ${cardName} ${setCode} ${setNumber}`.trim();

                if (supertype === 'Pokemon') pokemon.push(line);
                else if (supertype === 'Trainer') trainers.push(line);
                else if (supertype === 'Energy') energy.push(line);
            }

            // Build PTCGL format
            let ptcglText = `Pokémon: ${pokemon.length}\n`;
            ptcglText += pokemon.join('\n');
            ptcglText += '\n\nTrainer: ' + trainers.length + '\n';
            ptcglText += trainers.join('\n');
            ptcglText += '\n\nEnergy: ' + energy.length + '\n';
            ptcglText += energy.join('\n');
            ptcglText += '\n\nTotal Cards: ' + total;

            // Copy to clipboard
            navigator.clipboard.writeText(ptcglText).then(() => {
                showDeckShareToast(`✅ PTCGL export copied! (${total} cards)`);
            }).catch(() => {
                // Fallback: show in prompt
                prompt('Copy this PTCGL deck list:', ptcglText);
            });
        }

        /**
         * Import deck from PTCGL format
         * Expects text format: "Count CardName SetCode SetNumber"
         * Parses and populates the deck builder
         */
        function importFromPTCGL(source) {
            const ptcglText = prompt('Paste your PTCGL deck list:\n\n(Format: "4 Charizard ex PAL 234")');
            if (!ptcglText) return;

            const allCardsDb = window.allCardsDatabase || [];
            const cardsBySetNumber = {};
            allCardsDb.forEach(card => {
                const key = `${card.set}_${card.number}`;
                cardsBySetNumber[key] = card;
            });

            const newDeck = {};
            const lines = ptcglText.split('\n');
            let importCount = 0;
            let errorCount = 0;

            for (const line of lines) {
                const trimmed = line.trim();
                
                // Skip empty lines and section headers
                if (!trimmed || /^(Pokémon|Trainer|Energy|Total Cards):/i.test(trimmed)) continue;

                // Parse format: "Count CardName SetCode SetNumber"
                const match = trimmed.match(/^(\d+)\s+(.+?)\s+([A-Z0-9-]{2,5})\s+([A-Z0-9]+)$/);
                if (!match) {
                    console.warn('[PTCGL Import] Could not parse line:', trimmed);
                    errorCount++;
                    continue;
                }

                const [, countStr, cardName, setCode, setNumber] = match;
                const count = parseInt(countStr);

                // Look up card in database
                const lookupKey = `${setCode}_${setNumber}`;
                const card = cardsBySetNumber[lookupKey];

                if (card) {
                    const deckKey = `${cardName} (${setCode} ${setNumber})`;
                    newDeck[deckKey] = count;
                    importCount++;
                } else {
                    // Fallback: add without validation
                    const deckKey = `${cardName} (${setCode} ${setNumber})`;
                    newDeck[deckKey] = count;
                    importCount++;
                    console.warn('[PTCGL Import] Card not found in database:', lookupKey, '- adding anyway');
                }
            }

            if (importCount === 0) {
                showDeckShareToast('❌ No valid cards found in PTCGL text!');
                return;
            }

            // Set the deck
            if (source === 'cityLeague') {
                window.cityLeagueDeck = newDeck;
                window.cityLeagueDeckOrder = Object.keys(newDeck);
            } else if (source === 'currentMeta') {
                window.currentMetaDeck = newDeck;
                window.currentMetaDeckOrder = Object.keys(newDeck);
            } else if (source === 'pastMeta') {
                window.pastMetaDeck = newDeck;
                window.pastMetaDeckOrder = Object.keys(newDeck);
            }

            updateDeckDisplay(source);
            const totalCards = Object.values(newDeck).reduce((s, c) => s + c, 0);
            showDeckShareToast(`✅ PTCGL import: ${importCount} cards (${totalCards} total)${errorCount > 0 ? ` | ${errorCount} errors` : ''}`);
        }

        // ================================================================
        // PHASE 2: OPENING HAND PROBABILITY (HYPERGEOMETRIC DISTRIBUTION)
        // ================================================================

        function hypergeomComb(n, k) {
            if (k < 0 || k > n) return 0;
            if (k === 0 || k === n) return 1;
            k = Math.min(k, n - k);
            let c = 1;
            for (let i = 0; i < k; i++) c = c * (n - i) / (i + 1);
            return c;
        }

        // P(drawing at least 1 of K target cards in hand of n from deck of N)
        function hypergeomProbAtLeastOne(N, K, n) {
            if (K <= 0 || N <= 0 || n <= 0) return 0;
            if (K >= N) return 1;
            const prob0 = hypergeomComb(N - K, n) / hypergeomComb(N, n);
            return Math.max(0, Math.min(1, 1 - prob0));
        }

        // Alternative implementation: Returns probability in percentage (0-100)
        // Calculates P(drawing at least 1 of targetCount cards in handSize draws from deckSize)
        function probAtLeastOne(deckSize, handSize, targetCount) {
            if (targetCount <= 0 || deckSize <= 0 || handSize <= 0) return 0;
            if (targetCount > deckSize - handSize) return 100; // 100% Chance
            let probZero = 1;
            for (let i = 0; i < handSize; i++) {
                probZero *= (deckSize - targetCount - i) / (deckSize - i);
            }
            return (1 - probZero) * 100;
        }

        function updateOpeningHandStats(source) {
            const elId = source === 'cityLeague' ? 'cityLeagueHandStats'
                : source === 'currentMeta' ? 'currentMetaHandStats' : 'pastMetaHandStats';
            const el = document.getElementById(elId);
            if (!el) return;
            const deck = source === 'cityLeague' ? window.cityLeagueDeck
                : source === 'currentMeta' ? window.currentMetaDeck : window.pastMetaDeck;
            const N = Object.values(deck || {}).reduce((s, c) => s + c, 0);
            if (N === 0) { el.style.display = 'none'; return; }
            // Count Basic Pokémon using the card database
            let basicCount = 0;
            const db = window.allCardsDatabase || [];
            Object.entries(deck).forEach(([key, count]) => {
                if (count <= 0) return;
                let cardType = null;
                const setMatch = key.match(/\(([A-Z0-9-]+)\s+([^\)]+)\)$/);
                if (setMatch && db.length) {
                    const found = db.find(c => c.set === setMatch[1] && c.number === setMatch[2]);
                    if (found) cardType = found.type;
                }
                if (!cardType && db.length) {
                    const name = key.replace(/\s*\(.*\)$/, '').trim();
                    const found = db.find(c => c.name === name);
                    if (found) cardType = found.type;
                }
                if (cardType === 'Basic') basicCount += count;
            });
            const probBasic = hypergeomProbAtLeastOne(N, basicCount, 7);
            const probBrick = 1 - probBasic;
            const basicColor = probBasic >= 0.90 ? '#27ae60' : probBasic >= 0.75 ? '#e67e22' : '#e74c3c';
            const brickColor = probBrick <= 0.10 ? '#27ae60' : probBrick <= 0.25 ? '#e67e22' : '#e74c3c';
            el.innerHTML = `<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-size:0.85em;">
                <span style="font-weight:600;color:#555;">&#127922; Opening Hand (7 cards):</span>
                <span title="P(at least 1 Basic Pokémon in opening 7)" style="background:${basicColor};color:white;padding:3px 12px;border-radius:12px;font-weight:700;cursor:default;">✅ Basic in hand: ${(probBasic*100).toFixed(1)}%</span>
                <span title="P(no Basic Pokémon = forced mulligan)" style="background:${brickColor};color:white;padding:3px 12px;border-radius:12px;font-weight:700;cursor:default;">☠️ Mulligan: ${(probBrick*100).toFixed(1)}%</span>
                <span style="color:#999;">(${basicCount} Basics / ${N} cards)</span>
            </div>`;
            el.style.display = 'block';
        }

        // ================================================================
        // PHASE 1: META SHARE CHART (CHART.JS)
        // ================================================================

        window._metaChartInstances = {};

        function renderMetaChart(sourceKey, sorted) {
            if (typeof Chart === 'undefined') return;
            const containerId = sourceKey + 'MetaChartSection';
            let container = document.getElementById(containerId);
            if (!container) {
                const anchor = document.getElementById(
                    sourceKey === 'cityLeague' ? 'cityLeagueContent' : 'currentMetaContent'
                );
                if (!anchor) return;
                const section = document.createElement('div');
                section.id = containerId;
                section.style.cssText = 'padding:0 30px 20px;background:#fff;';
                section.innerHTML = `
                    <details open style="border:1px solid #e0e0e0;border-radius:10px;overflow:hidden;margin-top:10px;">
                        <summary style="background:linear-gradient(135deg,#667eea,#764ba2);color:white;padding:12px 20px;cursor:pointer;font-weight:700;font-size:1em;list-style:none;display:flex;justify-content:space-between;align-items:center;">
                            📊 Meta Share Chart &ndash; Top Archetypes <span style="font-size:0.8em;opacity:0.8;">▼ toggle</span>
                        </summary>
                        <div style="padding:20px;display:flex;gap:20px;flex-wrap:wrap;justify-content:center;align-items:center;">
                            <div style="position:relative;width:260px;height:260px;flex-shrink:0;"><canvas id="${sourceKey}DonutChart"></canvas></div>
                            <div style="flex:1;min-width:300px;height:260px;"><canvas id="${sourceKey}BarChart"></canvas></div>
                        </div>
                    </details>`;
                anchor.insertAdjacentElement('afterend', section);
                container = section;
            }
            // Destroy old chart instances before re-creating
            if (window._metaChartInstances[sourceKey + 'Donut']) {
                window._metaChartInstances[sourceKey + 'Donut'].destroy();
                window._metaChartInstances[sourceKey + 'Donut'] = null;
            }
            if (window._metaChartInstances[sourceKey + 'Bar']) {
                window._metaChartInstances[sourceKey + 'Bar'].destroy();
                window._metaChartInstances[sourceKey + 'Bar'] = null;
            }
            const top = (sorted || []).slice(0, 12);
            const labels = top.map(d => d.archetype || d.main || 'Unknown');
            const counts = top.map(d => parseInt(d.new_count || d.count || 0));
            const PALETTE = ['#6c5ce7','#0984e3','#00b894','#fdcb6e','#e17055','#d63031','#a29bfe','#55efc4','#ffeaa7','#fab1a0','#81ecec','#fd79a8'];
            const donutCtx = document.getElementById(sourceKey + 'DonutChart');
            if (donutCtx) {
                window._metaChartInstances[sourceKey + 'Donut'] = new Chart(donutCtx, {
                    type: 'doughnut',
                    data: { labels, datasets: [{ data: counts, backgroundColor: PALETTE, borderWidth: 2, borderColor: '#fff' }] },
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        plugins: {
                            legend: { display: false },
                            tooltip: { callbacks: { label: (ctx) => {
                                const total = counts.reduce((a,b) => a+b, 0);
                                const pct = total > 0 ? ((ctx.parsed / total)*100).toFixed(1) : 0;
                                return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
                            }}}
                        }
                    }
                });
            }
            const barCtx = document.getElementById(sourceKey + 'BarChart');
            if (barCtx) {
                window._metaChartInstances[sourceKey + 'Bar'] = new Chart(barCtx, {
                    type: 'bar',
                    data: { labels, datasets: [{ label: 'Deck Count', data: counts, backgroundColor: PALETTE, borderRadius: 4, borderSkipped: false }] },
                    options: {
                        indexAxis: 'y',
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            x: { beginAtZero: true, grid: { color: '#f0f0f0' } },
                            y: { ticks: { font: { size: 11 } } }
                        }
                    }
                });
            }
        }
