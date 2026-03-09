const BASE_PATH = './data/';
        
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
            console.log('🎯 Navigating to analysis with deck:', archetypeName);
            
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
                    console.error('❌ Timeout: Dropdown not populated after 5 seconds');
                }
            };
            
            // Start checking after initial delay
            setTimeout(checkAndSelect, 100);
        }
        
        // CSV loading and parsing
        async function loadCSV(filename) {
            try {
                const timestamp = new Date().getTime();
                const response = await fetch(`${BASE_PATH}${filename}?t=${timestamp}`);
                if (response.ok) {
                    const text = await response.text();
                    return parseCSV(text);
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
                    row[header] = (values[index] || '').trim();
                });
                if (Object.values(row).some(v => v)) {
                    data.push(row);
                }
            }
            
            return data;
        }
        
        // Load all cards database for deck builder
        let allCardsDatabase = [];
        let cardsByNameMap = {};
        let cardsBySetNumberMap = {}; // Index for fast card lookup by set+number
        let englishSetCodes = null;
        let rarityPreferences = {};
        let globalRarityPreference = 'min'; // Default: Show lowest rarity from newest set
        let overviewRarityMode = 'min'; // Current rarity mode for overview section (min, max, or all)
        let overviewCardTypeFilter = 'all'; // Current card type filter for overview section (all, Pokemon, Supporter, Item, Tool, Stadium, Energy, Special Energy, Ace Spec)
        let currentMetaOverviewCardTypeFilter = 'all'; // Card type filter for Current Meta overview
        let pastMetaOverviewCardTypeFilter = 'all'; // Card type filter for Past Meta overview
        
        // Ace Specs list - loaded from ace_specs.json
        let aceSpecsList = [];
        
        // Central isAceSpec function - checks against ace_specs.json list ONLY
        function isAceSpec(cardNameOrCard) {
            const cardName = (typeof cardNameOrCard === 'string') ? cardNameOrCard : (cardNameOrCard.card_name || cardNameOrCard.full_card_name || cardNameOrCard.name || '');
            const normalized = cardName.toLowerCase().trim();
            return aceSpecsList.includes(normalized);
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
                    cardsByNameMap = buildCardsByNameMap(allCardsDatabase);
                    window.cardsByNameMap = cardsByNameMap;
                    cardsBySetNumberMap = buildCardsBySetNumberMap(allCardsDatabase); // Build index for fast lookup
                    console.log(`✅ Loaded ${allCardsDatabase.length} cards from all_cards_merged.json (with prices)`);
                    console.log(`📊 Karten mit mehreren Versionen:`, Object.keys(cardsByNameMap).filter(k => cardsByNameMap[k].length > 1).length);
                    
                    // Count cards with prices
                    const cardsWithPrices = allCardsDatabase.filter(c => c.eur_price).length;
                    console.log(`💶 Karten mit Preisen: ${cardsWithPrices} (${Math.round(100*cardsWithPrices/allCardsDatabase.length)}%)`);
                    
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
                    console.error('❌ Failed to load all_cards_merged.json');
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
                    console.log(`✅ Loaded ${aceSpecsList.length} Ace Spec cards from ace_specs.json`);
                } else {
                    console.error('❌ Failed to load ace_specs.json');
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
                if (!card.name) return;
                if (!map[card.name]) {
                    map[card.name] = [];
                }
                map[card.name].push(card);
            });
            return map;
        }
        
        function buildCardsBySetNumberMap(cards) {
            const map = {};
            cards.forEach(card => {
                if (!card.set || !card.number) return;
                const key = `${card.set}-${card.number}`;
                map[key] = card;
            });
            console.log(`✅ Built index for ${Object.keys(map).length} set+number combinations`);
            return map;
        }

        function getCardVersionsByName(cardName) {
            return (cardsByNameMap[cardName] || []).slice();
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

        // ==================== LIVE PRICE FETCHING ====================
        
        let proxyServerAvailable = null;  // null = not checked, true/false = checked
        const PROXY_URL = 'http://localhost:8001';
        const livePriceCache = new Map();  // Cache für Live-Preise
        
        async function checkProxyServer() {
            if (proxyServerAvailable !== null) {
                return proxyServerAvailable;
            }
            
            try {
                const response = await fetch(`${PROXY_URL}/health`, { timeout: 2000 });
                proxyServerAvailable = response.ok;
                if (proxyServerAvailable) {
                    console.log('✓ Live price proxy server is running');
                }
            } catch (e) {
                proxyServerAvailable = false;
                console.log('ℹ Live price proxy server not running (prices from database)');
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
            
            // Fast lookup for all international prints using index
            const intPrintCards = printRefs.map(ref => {
                const key = `${ref.set}-${ref.number}`;
                return cardsBySetNumberMap[key];
            }).filter(c => c); // Remove nulls only (keep cards even without images for matching purposes)
            
            console.log(`[getInternationalPrintsForCard] Found ${intPrintCards.length} international prints for ${baseCard.name} (${set} ${number}):`, 
                intPrintCards.map(c => `${c.set} ${c.number} (${c.rarity || 'NO RARITY'}) ${c.image_url ? '✓' : '✗'}`).join(', ')
            );
            
            return intPrintCards;
        }

        // Check if card is a basic energy (Fire, Water, Grass, etc.)
        function isBasicEnergy(cardName) {
            const basicEnergyNames = [
                'Fire Energy', 'Water Energy', 'Grass Energy', 'Lightning Energy',
                'Psychic Energy', 'Fighting Energy', 'Darkness Energy', 'Metal Energy',
                'Fairy Energy', 'Dragon Energy'
            ];
            return basicEnergyNames.includes(cardName);
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
                        console.log(`🎴 Basic Energy "${cardName}": Using SVE ${correctSVEVersion.number} ✅`);
                        return correctSVEVersion;
                    }
                }
                
                // Fallback: If specific SVE number not found, use any SVE version
                const sveVersions = versions.filter(v => v.set === 'SVE');
                if (sveVersions.length > 0) {
                    console.log(`🎴 Basic Energy "${cardName}": Using fallback SVE ${sveVersions[0].number}`);
                    return sveVersions[0];
                }
            }

            if (globalPref && (globalPref === 'max' || globalPref === 'min')) {
                // Set order (higher = newer) - based on pokemon_sets_mapping.csv
                // Last updated: 2026-02-27
                const SET_ORDER = {
                    // 2026 Sets (newest first)
                    'M3': 116, 'ASC': 115, 'PFL': 114, 'MEG': 113, 'MEE': 112, 'MEP': 111,
                    'BLK': 110, 'WHT': 109, 'DRI': 108, 'JTG': 107, 'PRE': 106, 'SSP': 105,
                    // Scarlet & Violet (2023-2025)
                    'SCR': 104, 'SFA': 103, 'TWM': 102, 'TEF': 101, 'PAF': 100, 'PAR': 99,
                    'MEW': 98, 'OBF': 97, 'PAL': 96,
                    'SVI': 112, 'SVE': 112, 'SVP': 112,
                    // Sword & Shield (2020-2023)
                    'CRZ': 111, 'SIT': 110, 'LOR': 109, 'PGO': 108, 'ASR': 107,
                    'BRS': 106, 'FST': 105, 'CEL': 104, 'EVS': 103, 'CRE': 102,
                    'BST': 101, 'SHF': 100, 'VIV': 99, 'CPA': 98, 'DAA': 97,
                    'RCL': 96, 'SSH': 95, 'SP': 95,
                    // Sun & Moon (2017-2019)
                    'CEC': 94, 'HIF': 93, 'UNM': 92, 'UNB': 91, 'DET': 90,
                    'TEU': 89, 'LOT': 88, 'DRM': 87, 'CES': 86, 'FLI': 85,
                    'UPR': 84, 'CIN': 83, 'SLG': 82, 'BUS': 81, 'GRI': 80,
                    'SUM': 79, 'SMP': 79,
                    // XY (2014-2016)
                    'EVO': 78, 'STS': 77, 'FCO': 76, 'GEN': 75, 'BKP': 74,
                    'BKT': 73, 'AOR': 72, 'ROS': 71, 'DCR': 70, 'PRC': 69,
                    'PHF': 68, 'FFI': 67, 'FLF': 66, 'XY': 65, 'KSS': 64, 'XYP': 65,
                    // Black & White (2011-2013)
                    'LTR': 63, 'PLB': 62, 'PLF': 61, 'PLS': 60, 'BCR': 59,
                    'DRV': 58, 'DRX': 57, 'DEX': 56, 'NXD': 55, 'NVI': 54,
                    'EPO': 53, 'BLW': 52, 'BWP': 52,
                    // HeartGold & SoulSilver (2010-2011)
                    'CL': 51, 'TM': 50, 'UD': 49, 'UL': 48, 'HS': 47, 'HSP': 47,
                    // Diamond & Pearl / Platinum (2007-2009)
                    'RM': 46, 'AR': 45, 'SV': 44, 'RR': 43, 'P9': 42, 'PL': 41,
                    'SF': 40, 'P8': 39, 'LA': 38, 'MD': 37, 'P7': 36, 'GE': 35,
                    'SW': 34, 'P6': 33, 'MT': 32, 'DP': 31, 'DPP': 31,
                    // EX (2003-2007)
                    'P5': 30, 'PK': 29, 'DF': 28, 'CG': 27, 'P4': 26, 'HP': 25,
                    'P3': 24, 'LM': 23, 'DS': 22, 'UF': 21, 'P2': 20, 'EM': 19,
                    'DX': 18, 'TRR': 17, 'P1': 16, 'RG': 15, 'HL': 14, 'MA': 13,
                    'DR': 12, 'SS': 11, 'RS': 10, 'NP': 10,
                    // WotC Era (1999-2003)
                    'E3': 9, 'E2': 8, 'BG': 7, 'E1': 6, 'LC': 5, 'N4': 4,
                    'N3': 3, 'SI': 2, 'N2': 1, 'N1': 1, 'G2': 1, 'G1': 1,
                    'TR': 1, 'BS2': 1, 'FO': 1, 'JU': 1, 'BS': 1, 'WP': 1
                };
                
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
                'Rainbow Rare': 'RR',
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
        
        // Load City League data from CSV (with cache-busting)
        let cityLeagueData = [];
        async function loadCityLeagueData() {
            const content = document.getElementById('cityLeagueContent');
            try {
                const timestamp = new Date().getTime();
                const response = await fetch(`${BASE_PATH}city_league_archetypes_comparison.csv?t=${timestamp}`);
                if (response.ok) {
                    const text = await response.text();
                    cityLeagueData = parseCSV(text);
                    
                    // Load tournament count and date range from main archetype CSV
                    let tournamentCount = 0;
                    let dateRange = '';
                    try {
                        const tournamentsResponse = await fetch(`${BASE_PATH}city_league_archetypes.csv?t=${timestamp}`);
                        if (tournamentsResponse.ok) {
                            const tournamentsText = await tournamentsResponse.text();
                            const tournamentsData = parseCSV(tournamentsText);
                            const uniqueTournaments = new Set(tournamentsData.map(d => d.tournament_id));
                            tournamentCount = uniqueTournaments.size;
                            
                            // Extract date range with proper date parsing
                            if (tournamentsData.length > 0) {
                                const dates = tournamentsData.map(d => d.date).filter(d => d);
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
                        }
                    } catch (e) {
                        console.warn('Could not load tournament data:', e);
                    }
                    
                    renderCityLeagueTable(tournamentCount, dateRange);
                    window.cityLeagueLoaded = true;
                } else {
                    content.innerHTML = '<div class="error">Error loading City League Meta data</div>';
                }
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
                        <h3 style="margin: 0 0 10px 0; font-size: 1.1em; opacity: 0.9;">🔄 Top 10 Changes</h3>
                        <div style="font-size: 0.85em; opacity: 0.9; margin-top: 10px; text-align: left;">
                            ${entries.length > 0 ? `<strong style="color: #7fff7f;">⬆ Entries:</strong><br>${entries.map(arch => `${arch}`).join('<br>')}<br><br>` : ''}
                            ${exits.length > 0 ? `<strong style="color: #ff6b6b;">⬇ Exits:</strong><br>${exits.map(arch => `${arch}`).join('<br>')}<br>` : ''}
                            ${entries.length === 0 && exits.length === 0 ? 'No changes in top 10' : ''}
                        </div>
                    </div>
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px; box-shadow: 0 5px 15px rgba(0,0,0,0.1);">
                        <h3 style="margin: 0 0 10px 0; font-size: 1.1em; opacity: 0.9;">📍 Datenquelle</h3>
                        <div style="font-size: 0.85em; opacity: 0.9; margin-top: 10px;">
                            <strong>Zeitraum:</strong><br>${dateRange || 'N/A'}<br><br>
                            <strong>Turniere:</strong><br>${tournamentCount || 0}
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
                            <td style="padding: 12px; font-weight: bold;" onclick="navigateToAnalysisWithDeck('${archetypeEscaped}')" title="Zur Analyse von ${d.archetype}">${d.archetype}</td>
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
                        <h2 style="color: #34495e; border-bottom: 3px solid #3498db; padding-bottom: 10px; margin-bottom: 20px;">⭐ Performance Improvers (Better Avg Placement)</h2>
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
                            <td style="padding: 12px; font-weight: bold;" onclick="navigateToAnalysisWithDeck('${archetypeEscaped}')" title="Zur Analyse von ${d.archetype}">${d.archetype}</td>
                            <td style="padding: 12px; text-align: center;">${d.new_count} <span style="color: #7f8c8d; font-size: 0.9em;">(${countChangeText})</span></td>
                            <td style="padding: 12px; text-align: center;">${d.new_avg_placement} <span style="color: #27ae60; font-weight: bold;">(−${improvement.toFixed(2)})</span></td>
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
                            <td style="padding: 12px; font-weight: bold;" onclick="navigateToAnalysisWithDeck('${archetypeEscaped}')" title="Zur Analyse von ${d.archetype}">${d.archetype}</td>
                            <td style="padding: 12px; text-align: center;">${d.new_count} <span style="color: #7f8c8d; font-size: 0.9em;">(${countChangeText})</span></td>
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
                            <input type="text" id="cityLeagueSearchFilter" placeholder="Suche z.B.: draga, luca" 
                                style="width: 100%; padding: 12px; font-size: 16px; border: 2px solid #3498db; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);"
                                oninput="filterCityLeagueTable()">
                            <div id="cityLeagueSearchResults" style="margin-top: 8px; font-size: 14px; color: #7f8c8d;"></div>
                        </div>
                        <div id="cityLeagueFullTable"></div>
                    </div>
                    
                    <!-- Grouped by Main Pokemon -->
                    <div style="flex: 1; min-width: 350px;">
                        <h2 style="color: #34495e; border-bottom: 3px solid #3498db; padding-bottom: 10px; margin-bottom: 20px;">🎯 Archetype Combined (Top 20)</h2>
                        <div style="margin-bottom: 15px; padding: 12px; background: #ecf0f1; border-radius: 5px; font-size: 0.9em; color: #7f8c8d;">
                            Kumulierte Zahlen aller Varianten eines Haupt-Pokemons (z.B. alle "dragapult *" Decks)
                        </div>
                        <div id="cityLeagueCombinedTable"></div>
                    </div>
                </div>
                
                <div style="background: #ecf0f1; padding: 15px; border-radius: 5px; margin-top: 30px; text-align: center;">
                    <span style="display: inline-block; margin: 0 15px; font-weight: bold;">📅 Generated: ${generatedDate}</span>
                    <span style="display: inline-block; margin: 0 15px; font-weight: bold;">📊 Total Archetypes Tracked: ${totalArchetypes}</span>
                </div>`;
            
            content.innerHTML = html;
            
            // Store sorted data globally for filtering
            window.cityLeagueSortedData = sorted;
            
            // Group data by main Pokemon (first word)
            const groupedData = groupByMainPokemon(cityLeagueData);
            
            // Initial render
            renderFullComparisonTable(sorted.slice(0, 30));
            renderCombinedTable(groupedData.slice(0, 20));
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
                            <td style="padding: 8px 4px; text-align: center; color: #7f8c8d; font-size: 0.85em;">${d.variant_count}</td>
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
                            <td style="padding: 12px; text-align: center; color: #7f8c8d;">${d.variant_count}</td>
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
                            <td style="padding: 8px 4px; font-weight: bold; font-size: 0.85em; word-wrap: break-word; overflow-wrap: break-word;" onclick="navigateToAnalysisWithDeck('${archetypeEscaped}')" title="Zur Analyse von ${d.archetype}">${d.archetype}</td>
                            <td style="padding: 8px 4px; text-align: center; font-size: 0.85em;">${d.new_count} <span style="color: ${changeColor}; font-weight: bold; font-size: 0.8em;">(${changeValue > 0 ? '+' : ''}${changeValue})</span></td>
                            <td style="padding: 8px 4px; text-align: center; font-size: 0.85em;">${d.new_avg_placement} <span style="color: ${placementColor}; font-weight: bold; font-size: 0.8em;">(${placementChange > 0 ? '+' : ''}${placementChange.toFixed(2)})</span></td>
                        </tr>`;
                });
                
                tableHTML += `</tbody></table>`;
            } else {
                // Desktop: Kompakte Version mit Änderungen in Klammern
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
                            <td style="padding: 12px; font-weight: bold;" onclick="navigateToAnalysisWithDeck('${archetypeEscaped}')" title="Zur Analyse von ${d.archetype}">${d.archetype}</td>
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
                resultsDiv.textContent = 'Keine Ergebnisse gefunden';
                resultsDiv.style.color = '#e74c3c';
            } else {
                resultsDiv.textContent = `${filtered.length} result${filtered.length !== 1 ? 's' : ''} found`;
                resultsDiv.style.color = '#27ae60';
            }
        }
        
        // Load City League Analysis
        async function loadCityLeagueAnalysis() {
            console.log('Loading City League Analysis...');
            const data = await loadCSV('city_league_analysis.csv');
            console.log('Loaded data:', data ? `${data.length} rows` : 'null');
            
            // Also load archetypes data for placement statistics
            const archetypesData = await loadCSV('city_league_archetypes.csv');
            console.log('Loaded archetypes data:', archetypesData ? `${archetypesData.length} rows` : 'null');
            
            // Load comparison data for current deck counts (new_count)
            const comparisonData = await loadCSV('city_league_archetypes_comparison.csv');
            console.log('Loaded comparison data:', comparisonData ? `${comparisonData.length} rows` : 'null');

            if (data && data.length > 0) {
                console.log('Processing archetypes...');
                window.cityLeagueAnalysisData = data;
                window.cityLeagueArchetypesData = archetypesData;
                window.cityLeagueComparisonData = comparisonData;
                populateCityLeagueDeckSelect(data, comparisonData);
                window.cityLeagueAnalysisLoaded = true;
            } else {
                const tableContainer = document.getElementById('cityLeagueAnalysisTable');
                if (tableContainer) {
                    const errorMsg = data === null ? 'Error loading City League Analysis data' : 'No data found';
                    console.error(errorMsg);
                    tableContainer.innerHTML = `<div class="error">${errorMsg}</div>`;
                }
            }
        }
        
        function populateCityLeagueDeckSelect(data, comparisonData) {
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
            data.forEach(row => {
                if (row.archetype && !archetypeMap.has(row.archetype)) {
                    // Use new_count from comparison data if available, otherwise fall back to total_decks_in_archetype
                    const deckCount = comparisonMap.get(row.archetype.toLowerCase()) || parseInt(row.total_decks_in_archetype || 0);
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
            select.innerHTML = '<option value="">-- Bitte Deck auswählen --</option>';
            
            // Add top 10 meta decks
            if (top10.length > 0) {
                const topGroup = document.createElement('optgroup');
                topGroup.label = '🔥 Top 10 Meta Decks';
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
                restGroup.label = '📋 Weitere Decks (A-Z)';
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
        function resetCityLeagueDateFilter() {
            const dateFromEl = document.getElementById('cityLeagueDateFrom');
            const dateToEl = document.getElementById('cityLeagueDateTo');
            
            if (dateFromEl) dateFromEl.value = '';
            if (dateToEl) dateToEl.value = '';
            
            window.cityLeagueDateFilterActive = false;
            updateCityLeagueDateFilterStatus();
            
            // Reload current deck if one is selected
            const cityLeagueDeckSelect = document.getElementById('cityLeagueDeckSelect');
            const selectedArchetype = cityLeagueDeckSelect ? cityLeagueDeckSelect.value : null;
            if (selectedArchetype) {
                loadCityLeagueDeckData(selectedArchetype);
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
            
            // Reload current deck if one is selected
            const selectedArchetype = document.getElementById('cityLeagueDeckSelect')?.value;
            if (selectedArchetype) {
                loadCityLeagueDeckData(selectedArchetype);
            }
        }
        
        function updateCityLeagueDateFilterStatus() {
            const statusEl = document.getElementById('cityLeagueDateFilterStatus');
            if (!statusEl) return;
            
            const dateFrom = document.getElementById('cityLeagueDateFrom').value;
            const dateTo = document.getElementById('cityLeagueDateTo').value;
            
            if (dateFrom && dateTo) {
                statusEl.textContent = `Gefiltert: ${formatDate(dateFrom)} bis ${formatDate(dateTo)}`;
                statusEl.style.color = 'rgba(255,255,255,1)';
            } else if (dateFrom) {
                statusEl.textContent = `Gefiltert: Ab ${formatDate(dateFrom)}`;
                statusEl.style.color = 'rgba(255,255,255,1)';
            } else if (dateTo) {
                statusEl.textContent = `Gefiltert: Bis ${formatDate(dateTo)}`;
                statusEl.style.color = 'rgba(255,255,255,1)';
            } else {
                statusEl.textContent = 'Alle Turniere werden angezeigt';
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
        
        // Parse Japanese date format (e.g., "01 Feb 26") to YYYY-MM-DD
        function parseJapaneseDate(dateStr) {
            if (!dateStr || dateStr.trim() === '') return '';
            
            const parts = dateStr.trim().split(/[.\s]+/);
            if (parts.length < 3) return '';
            
            const day = parts[0].padStart(2, '0');
            const monthStr = parts[1];
            const year = parts[2].length === 2 ? '20' + parts[2] : parts[2];
            
            const monthMap = {
                'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
                'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12',
                'Januar': '01', 'Februar': '02', 'März': '03', 'April': '04', 'Mai': '05', 'Juni': '06',
                'Juli': '07', 'August': '08', 'September': '09', 'Oktober': '10', 'November': '11', 'Dezember': '12'
            };
            
            const month = monthMap[monthStr] || '01';
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
            
            // Calculate total decks across all tournaments
            // For each unique tournament date, get the total_decks_in_archetype value
            // CRITICAL FIX: Only set if not already present (take first occurrence)
            const tournamentDecksMap = new Map();
            filteredCards.forEach(row => {
                if (row.tournament_date) {
                    const date = row.tournament_date;
                    const decksInTournament = parseInt(row.total_decks_in_archetype || 0);
                    // Only add if date not yet tracked (avoid overwriting with same value multiple times)
                    if (!tournamentDecksMap.has(date)) {
                        tournamentDecksMap.set(date, decksInTournament);
                    }
                }
            });
            
            // Sum up decks across all tournaments
            let totalDecks = 0;
            tournamentDecksMap.forEach(decks => {
                totalDecks += decks;
            });
            
            console.log('DEBUG: Tournament deck counts:', Array.from(tournamentDecksMap.entries()));
            console.log('DEBUG: Total decks across all tournaments:', totalDecks);
            
            filteredCards.forEach(row => {
      const cardName = row.card_name;
                
                if (!cardMap.has(cardName)) {
                    cardMap.set(cardName, {
                        sampleRow: row,
                        totalCount: 0,
                        maxCountValues: [],
                        deckCounts: 0,
                        tournamentsWithCard: new Set(),
                        tournamentDeckCountsWithCard: new Map()
                    });
                } else {
                    const cardData = cardMap.get(cardName);
                    // Update sample row if current row has more complete data
                    if (!cardData.sampleRow.image_url && row.image_url) {
                        cardData.sampleRow = row;
                    } else if (!cardData.sampleRow.set_code && row.set_code) {
                        cardData.sampleRow = row;
                    }
                }
                
                const cardData = cardMap.get(cardName);
                
                // Aggregate counts
                cardData.totalCount += parseInt(row.total_count || 0);
                const maxCount = parseInt(row.max_count || 0);
                if (maxCount > 0) {
                    cardData.maxCountValues.push(maxCount);
                }
                cardData.deckCounts += parseInt(row.deck_count || 0);
                
                if (row.tournament_date) {
                    cardData.tournamentsWithCard.add(row.tournament_date);
                    // Track deck count for each tournament where this card appeared
                    const decksInTournament = parseInt(row.total_decks_in_archetype || 0);
                    cardData.tournamentDeckCountsWithCard.set(row.tournament_date, decksInTournament);
                }
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
                
                // Calculate percentage based on actual deck counts
                // data.deckCounts is the sum of deck_count values (number of decks containing this card)
                // totalDecks is the sum of total_decks_in_archetype values (total number of decks in all tournaments)
                const percentage = totalDecks > 0 ? (data.deckCounts / totalDecks * 100) : 0;
                
                // Calculate average count
                const tournamentsWithCard = data.tournamentsWithCard.size;
                const avgCount = tournamentsWithCard > 0 ? (data.totalCount / tournamentsWithCard) : 0;
                
                // Update row and preserve important fields from sampleRow
                row.total_count = data.totalCount;
                row.max_count = max_count;
                row.deck_count = data.deckCounts;
                row.deck_count_in_selected = data.deckCounts; // Number of decks containing this card
                row.total_decks_in_archetype = totalDecks;
                row.percentage_in_archetype = percentage.toFixed(1);
                row.avg_count = avgCount.toFixed(2);
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
                deckCards = deckCards.filter(row => {
                    const tournamentDate = parseJapaneseDate(row.tournament_date);
                    
                    // Collect first 5 examples for debugging
                    if (dateDebugSample.length < 5) {
                        dateDebugSample.push({
                            raw: row.tournament_date,
                            parsed: tournamentDate,
                            passes: tournamentDate && tournamentDate >= dateFrom && tournamentDate <= dateTo
                        });
                    }
                    
                   if (!tournamentDate) return false; // Exclude cards without valid date when filter is active
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
            let decksCount = deckCards[0]?.total_decks_in_archetype || '-';
            console.log(`Using deck count from aggregated data: ${decksCount} decks`);
            
            // Calculate average placement from archetypes data
            const archetypesData = window.cityLeagueArchetypesData || [];
            const archetypeMatches = archetypesData.filter(row => 
                row.archetype && row.archetype.toLowerCase() === archetype.toLowerCase()
            );
            const avgPlacement = archetypeMatches.length > 0
                ? (archetypeMatches.reduce((sum, row) => sum + parseInt(row.placement || 0), 0) / archetypeMatches.length).toFixed(2)
                : '-';
            
            // Store total decks count globally for use in card displays
            window.currentCityLeagueTotalDecks = parseInt(decksCount) || 0;
            console.log(`Stored global deck count: ${window.currentCityLeagueTotalDecks}`);
            
            // Update stats
            document.getElementById('cityLeagueStatCards').textContent = `${uniqueCards} / ${totalCardsInDeck}`;
            document.getElementById('cityLeagueStatDecksUsed').textContent = decksCount;
            document.getElementById('cityLeagueStatAvgPlacement').textContent = avgPlacement !== '-' ? avgPlacement : '-';
            document.getElementById('cityLeagueStatsSection').style.display = 'block';
            
            // Show deck visual (default: grid view)
            renderCityLeagueDeckGrid(deckCards);
            
            // Reset button text to show list view option
            const gridButtons = document.querySelectorAll('button[onclick="toggleDeckGridView()"]');
            gridButtons.forEach(btn => btn.textContent = '📋 List View');
            
            // Apply current filter (this will update counts and re-filter if needed)
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
        
        // Helper function to fix Japanese card image URLs
        function fixJapaneseCardImageUrl(url, setCode, cardName = '') {
            if (!url) return url;
            
            // M3 set cards: Use pokemonproxies.com (English translation), fallback to Limitless Japanese
            const isM3Set = setCode === 'M3' || url.includes('/M3/');
            
            if (isM3Set && cardName) {
                // Extract card number from URL (e.g., M3_046 or M3_46)
                const numberMatch = url.match(/M3_0*(\d+)_/);
                if (numberMatch) {
                    const cardNumber = numberMatch[1].padStart(3, '0'); // 46 → 046
                    
                    // Normalize card name for pokemonproxies.com URL
                    // "Mega Zygarde ex" → "Mega_Zygarde_ex"
                    // "N's Zorua" → "Ns_Zorua"
                    const normalizedName = cardName
                        .replace(/'/g, '')           // Remove apostrophes
                        .replace(/\./g, '')          // Remove periods
                        .replace(/[éè]/g, 'e')       // Normalize accents
                        .replace(/[àâ]/g, 'a')
                        .replace(/\s+/g, '_')        // Spaces → underscores
                        .replace(/__+/g, '_');       // Remove double underscores
                    
                    // Try pokemonproxies.com (English translation)
                    const proxyUrl = `https://pokemonproxies.com/images/cards/sets/Munikis_Zero/3a-${cardNumber}-${normalizedName}.png`;
                    console.log(`🎴 M3 Card → pokemonproxies.com: ${cardName} → ${proxyUrl}`);
                    return proxyUrl;
                }
            }
            
            // Fallback: Use Limitless Japanese version for M3
            if (isM3Set && url.includes('_EN_')) {
                const originalUrl = url;
                
                // Replace tpci with tpc
                url = url.replace('/tpci/', '/tpc/');
                
                // Replace EN with JP
                url = url.replace(/_EN_/g, '_JP_');
                
                // Remove leading zeros from card number (M3_046 → M3_46)
                url = url.replace(/\/M3_0+(\d+)_/g, '/M3_$1_');
                
                console.log(`🎴 M3 Card → Limitless JP fallback: ${originalUrl} → ${url}`);
            }
            
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
                const allVersions = allCards.filter(c => c.name === cardName && c.set && c.number);
                
                if (overviewRarityMode !== 'all' && allVersions.length > 0) {
                    // Set order (higher = newer, based on pokemon_sets_mapping.csv)
                    const SET_ORDER = {
                        'M3': 116, 'ASC': 115, 'PFL': 114, 'MEG': 113, 'MEE': 112, 'MEP': 111,
                        'BLK': 110, 'WHT': 109, 'DRI': 108, 'JTG': 107, 'PRE': 106, 'SSP': 105,
                        'MEG': 105, 'MEP': 104, 'SP': 103, 'SVE': 102,
                        'SCR': 101, 'TWM': 100, 'TEF': 99, 'PAR': 98, 'PAF': 97, 'PAL': 96, 'OBF': 95,
                        'MEW': 94, 'SVI': 93, 'CRZ': 92, 'SIT': 91, 'LOR': 90, 'PGO': 89,
                        'BLK': 99, 'WHT': 98, 'SSP': 94,
                        'ASR': 88, 'BRS': 87, 'FST': 86, 'CEL': 85, 'EVS': 84, 'CRE': 83,
                        'BST': 82, 'SHF': 81, 'VIV': 80, 'CPA': 79, 'DAA': 78,
                        'RCL': 77, 'SSH': 76, 'CEC': 75
                    };
                    
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
                
                const imageUrl = fixJapaneseCardImageUrl(displayCard.image_url || '', displayCard.set_code, cardName);
                const percentage = parseFloat(card.percentage_in_archetype || 0).toFixed(1);
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
                const decksWithCard = parseInt(card.deck_count || 0);
                // Use global total decks count instead of per-date total_decks_in_archetype
                const totalDecksInArchetype = window.currentCityLeagueTotalDecks || parseInt(card.total_decks_in_archetype || 1);
                const totalCount = parseInt(card.total_count || 0);
                const avgCountOverall = totalDecksInArchetype > 0 ? (totalCount / totalDecksInArchetype).toFixed(2) : '0.00';
                const avgCountInUsedDecks = decksWithCard > 0 ? (totalCount / decksWithCard).toFixed(2) : '0.00';
                
                html += `
                    <div class="card-table-row" data-card-name="${cardName.toLowerCase()}" style="display: flex; align-items: center; background: white; border-radius: 8px; padding: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); gap: 20px;">
                        <!-- Card Image -->
                        <div style="flex-shrink: 0; position: relative; width: 120px;">
                            <img src="${imageUrl}" alt="${cardName}" loading="lazy" referrerpolicy="no-referrer" style="width: 100%; border-radius: 6px; cursor: zoom-in; aspect-ratio: 2.5/3.5; object-fit: cover;" onerror="this.style.opacity='0.3'" onclick="showSingleCard('${imageUrl}', '${cardNameEscaped}');">
                            ${deckCount > 0 ? `<div style="position: absolute; top: 5px; left: 5px; background: #28a745; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.85em; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${deckCount}</div>` : ''}
                        </div>
                        
                        <!-- Card Info -->
                        <div style="flex-grow: 1; min-width: 0;">
                            <h3 style="margin: 0 0 8px 0; font-size: 1.2em; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${cardName}</h3>
                            <div style="color: #666; font-size: 0.9em; margin-bottom: 10px;">${setCode} ${setNumber}</div>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin-bottom: 10px;">
                                <div>
                                    <span style="color: #999; font-size: 0.85em;">Nutzungs Share:</span>
                                    <span style="font-weight: 600; color: #333; margin-left: 5px; font-size: 0.95em;">${percentage}%</span>
                                </div>
                                <div>
                                    <span style="color: #999; font-size: 0.85em;">Ø in genutzten Decks:</span>
                                    <span style="font-weight: 600; color: #333; margin-left: 5px; font-size: 0.95em;">${avgCountInUsedDecks}x</span>
                                </div>
                                <div>
                                    <span style="color: #999; font-size: 0.85em;">Ø durch alle Decks:</span>
                                    <span style="font-weight: 600; color: #333; margin-left: 5px; font-size: 0.95em;">${avgCountOverall}x</span>
                                </div>
                                <div>
                                    <span style="color: #999; font-size: 0.85em;">Deck Count:</span>
                                    <span style="font-weight: 600; color: #333; margin-left: 5px; font-size: 0.95em;">${decksWithCard} / ${totalDecksInArchetype} Decks</span>
                                </div>
                                <div>
                                    <span style="color: #999; font-size: 0.85em;">Max Count:</span>
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
            console.log('🔄 Setting overview rarity mode to:', mode);
            overviewRarityMode = mode;
            
            // Synchronize with global rarity preference so deck builder uses same setting
            // For 'all' mode, keep original cards (no preference), otherwise use min/max
            if (mode === 'all') {
                // For "Alle Prints" mode in deck builder, use original card (no rarity swap)
                globalRarityPreference = null;
            } else {
                globalRarityPreference = mode; // 'min' or 'max'
            }
            console.log('🎯 Global rarity preference synced to:', globalRarityPreference || 'none (original cards)');
            
            // Update button styles - make sure elements exist first
            const btnMin = document.getElementById('overviewRarityMin');
            const btnMax = document.getElementById('overviewRarityMax');
            const btnAll = document.getElementById('overviewRarityAll');
            
            if (btnMin) btnMin.style.opacity = mode === 'min' ? '1' : '0.6';
            if (btnMax) btnMax.style.opacity = mode === 'max' ? '1' : '0.6';
            if (btnAll) btnAll.style.opacity = mode === 'all' ? '1' : '0.6';
            
            // Re-render the grid with current cards (preserve percentage filter)
            const cards = window.currentCityLeagueDeckCards;
            console.log('📊 Cards available for re-render:', cards ? cards.length : 'none');
            if (cards && cards.length > 0) {
                console.log('✅ Re-rendering grid with mode:', mode);
                applyCityLeagueFilter();  // Use filter function to preserve percentage filter
            } else {
                console.warn('⚠️ No cards available to render - mode saved for when deck is selected');
            }
            
            // Also update the deck display with new rarity preference
            if (window.cityLeagueDeck && Object.keys(window.cityLeagueDeck).length > 0) {
                console.log('🔄 Re-rendering deck with new rarity preference');
                updateDeckDisplay('cityLeague');
            }
        }
        
        // ============================================================================
        // TREND CALCULATION - Calculate usage trends over time
        // ============================================================================
        // Render function for grid view (compact view)
        function renderCityLeagueDeckGrid(cards) {
            console.log('🎨 renderCityLeagueDeckGrid called with:', cards.length, 'cards, mode:', overviewRarityMode);
            const visualContainer = document.getElementById('cityLeagueDeckVisual');
            const gridContainer = document.getElementById('cityLeagueDeckGrid');
            if (!gridContainer) return;
            
            // Use the same sorting logic as "Karten Übersicht (sortiert)"
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
                const cardName = card.card_name;
                const cardNameEscaped = cardName.replace(/'/g, "\\'");
                
                // Get original card's set/number from the City League deck data
                const originalSetCode = card.set_code || '';
                const originalSetNumber = card.set_number || '';
                
                // Apply rarity mode to determine which versions to show
                let versionsToRender = [];
                
                if (overviewRarityMode === 'all') {
                    // Show ALL international prints of this specific card
                    let allVersions = getInternationalPrintsForCard(originalSetCode, originalSetNumber);
                    console.log(`📦 All mode for ${cardName} (${originalSetCode} ${originalSetNumber}): found ${allVersions.length} int prints`);
                    
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
                        console.log(`🎯 ${overviewRarityMode} mode for ${cardName}: using PREFERRED version ${preferredVersion.set} ${preferredVersion.number} (${preferredVersion.rarity})`);
                        versionsToRender = [{
                            ...card,
                            set_code: preferredVersion.set,
                            set_number: preferredVersion.number,
                            image_url: preferredVersion.image_url,
                            rarity: preferredVersion.rarity
                        }];
                    } else {
                        // No preferred version found, use original
                        console.log(`⚠️ ${overviewRarityMode} mode for ${cardName}: no preferred version found, using original`);
                        versionsToRender = [card];
                    }
                }
                
                // Render each version
                versionsToRender.forEach(displayCard => {
                    const setCode = displayCard.set_code || '';
                    const setNumber = displayCard.set_number || '';
                
                const imageUrl = fixJapaneseCardImageUrl(displayCard.image_url || '', setCode, cardName);
                const percentage = parseFloat(card.percentage_in_archetype || 0).toFixed(1);
                const maxCount = parseInt(card.max_count) || card.max_count || '?';
                
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
                const decksWithCard = parseInt(card.deck_count || 0);  // Number of decks that contain this card
                // Use global total decks count instead of per-date total_decks_in_archetype
                const totalDecksInArchetype = window.currentCityLeagueTotalDecks || parseInt(card.total_decks_in_archetype || 1);
                
                // Get average count statistics
                const totalCount = parseInt(card.total_count || 0);
                const avgCountOverall = totalDecksInArchetype > 0 ? (totalCount / totalDecksInArchetype).toFixed(2) : '0.00';  // Average over all decks
                const avgCountInUsedDecks = decksWithCard > 0 ? (totalCount / decksWithCard).toFixed(2) : '0.00';  // Average in decks that use this card
                
                // PERFORMANCE: Get price using Map lookup instead of find()
                let eurPrice = '';
                let cardmarketUrl = '';
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
                    } else {
                        console.log(`[Price Lookup] ❌ No price found for ${cardName} (${setCode} ${setNumber})`);
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
                
                html += `
                    <div class="card-item" data-card-name="${cardName.toLowerCase()}" data-card-type="${filterCategory}" style="position: relative; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.15); cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; background: white;">
                        <div class="card-image-container" style="position: relative; width: 100%;">
                            <img src="${imageUrl}" alt="${cardName}" loading="lazy" referrerpolicy="no-referrer" style="width: 100%; aspect-ratio: 2.5/3.5; object-fit: cover; cursor: zoom-in;" onerror="this.style.opacity='0.3'" onclick="event.stopPropagation(); showSingleCard('${imageUrl}', '${cardNameEscaped}');">
                            
                            <!-- Red badge: Max Count (top-right) -->
                            <div style="position: absolute; top: 5px; right: 5px; background: #dc3545; color: white; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.7em; box-shadow: 0 2px 4px rgba(0,0,0,0.3); z-index: 2;">
                                ${maxCount}
                            </div>
                            
                            <!-- Green badge: Deck Count (top-left) - only show if > 0 -->
                            ${deckCount > 0 ? `<div style="position: absolute; top: 5px; left: 5px; background: #28a745; color: white; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.7em; box-shadow: 0 2px 4px rgba(0,0,0,0.3); z-index: 2;">${deckCount}</div>` : ''}
                            
                            <!-- Card info section - Mobile Overlay -->
                            <div class="card-info-bottom" style="padding: 5px; background: white; font-size: 0.7em; text-align: center; min-height: 48px; display: flex; flex-direction: column; justify-content: space-between;">
                                <div class="card-info-text">
                                    <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; margin-bottom: 1px; color: #333; font-size: 0.58em;">
                                        ${cardName}
                                    </div>
                                    <div style="color: #999; font-size: 0.52em; margin-bottom: 1px;">
                                        ${setCode} ${setNumber}
                                    </div>
                                    <div style="color: #666; font-size: 0.55em; margin-bottom: 1px;">
                                        ${percentage}% | Ø ${avgCountInUsedDecks}x (${avgCountOverall}x)
                                    </div>
                                    <div style="font-weight: 600; color: #333; font-size: 0.58em;">
                                        ${decksWithCard} / ${totalDecksInArchetype} Decks
                                    </div>
                                </div>
                                
                                <!-- Rarity Switcher & Actions (4 buttons: - ★ € +) -->
                                <div class="card-action-buttons" style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 2px; margin-top: 4px;">
                                    <button onclick="event.stopPropagation(); removeCardFromDeck('cityLeague', '${cardNameEscaped}')" style="background: #dc3545; color: white; border: none; border-radius: 3px; height: 16px; cursor: pointer; font-weight: bold; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; min-height: unset; min-width: unset;" title="Remove from deck">−</button>
                                    <button onclick="event.stopPropagation(); openRaritySwitcher('${cardNameEscaped}', '${cardNameEscaped}')" style="background: #ffc107; color: #333; border: none; border-radius: 3px; height: 16px; cursor: pointer; font-size: 10px; font-weight: bold; text-align: center; padding: 0; display: flex; align-items: center; justify-content: center; min-height: unset; min-width: unset;" title="Switch rarity/print">★</button>
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
                const cardType = card.getAttribute('data-card-type') || '';
                
                // Check search term filter
                const matchesSearch = searchTerm === '' || cardName.includes(searchTerm);
                
                // Check card type filter
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
                console.warn('⚠️ Grid or table container not found');
                return;
            }
            
            const cards = window.currentCityLeagueDeckCards;
            if (!cards || cards.length === 0) {
                alert('❌ Please select a deck first!');
                return;
            }
            
            // Check current view mode (grid is default)
            const isGridViewActive = gridViewContainer.style.display !== 'none';
            
            if (isGridViewActive) {
                // Switch to list/table view
                gridViewContainer.style.display = 'none';
                if (button) button.textContent = '🖼️ Grid View';
            } else {
                // Switch back to grid view
                tableViewContainer.style.display = 'none';
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
                alert('❌ Keine Karten zum Kopieren!\n\nBitte wähle zuerst einen Archetyp aus.');
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
                alert('✅ Deck copied to clipboard!');
            }).catch(err => {
                console.error('Error copying:', err);
                alert('❌ Error copying to clipboard!');
            });
        }

        function renderCityLeagueAnalysisTable(data) {
            console.log('renderCityLeagueAnalysisTable called with', data ? data.length : 0, 'rows');
            const tableContainer = document.getElementById('cityLeagueAnalysisTable');
            if (!tableContainer) {
                console.error('Table container not found!');
                return;
            }
            if (!data || data.length === 0) {
                console.warn('No data to render');
                tableContainer.innerHTML = '<p style="text-align: center; padding: 20px; color: #666;">Bitte wähle ein Deck aus...</p>';
                return;
            }

            // Use the same sorting logic as "Karten Übersicht (sortiert)"
            const sortedData = sortCardsByType([...data]);
            
            let html = '<table><thead><tr>';
            html += '<th class="col-image">Bild</th>';
            html += '<th>Cards in Deck</th>';
            html += '<th>Card Name</th>';
            html += '<th>Set</th>';
            html += '<th>Nummer</th>';
            html += '<th>% in Archetype</th>';
            html += '<th>Deck Count</th>';
            html += '<th>Aktion</th>';
            html += '</tr></thead><tbody>';

            sortedData.forEach(row => {
                const imageUrl = row.image_url || '';
                const cardName = row.card_name || '';
                const setCode = row.set_code || '';
                const setNumber = row.set_number || '';
                const maxCount = parseInt(row.max_count) || row.max_count || '?';
                const percentage = parseFloat(row.percentage_in_archetype || 0).toFixed(1);
                const deckCount = row.deck_count || '?';
                const totalDecks = row.total_decks_in_archetype || '?';
                
                // Get current deck count from window.cityLeagueDeck
                const deck = window.cityLeagueDeck || {};
                const currentDeckCount = deck[cardName] || 0;
                
                html += '<tr>';
                // Image with green badge if card is in deck
                html += `<td class="col-image"><div style="position: relative; display: inline-block;">`;
                html += `<img src="${imageUrl}" alt="${cardName}" loading="lazy" style="width: 60px; border-radius: 4px; cursor: zoom-in;" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2284%22%3E%3Crect width=%2260%22 height=%2284%22 fill=%22%23333%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23999%22 font-size=%2210%22%3ENo Image%3C/text%3E%3C/svg%3E'" onclick="showSingleCard('${imageUrl}', '${cardName.replace(/'/g, "\\'")}')">`;
                if (currentDeckCount > 0) {
                    html += `<div style="position: absolute; top: 2px; left: 2px; background: #28a745; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.7em; box-shadow: 0 2px 4px rgba(0,0,0,0.3); z-index: 2;">${currentDeckCount}</div>`;
                }
                html += `</div></td>`;
                html += `<td><strong>${currentDeckCount}/${maxCount}</strong></td>`;
                html += `<td><strong>${cardName}</strong></td>`;
                html += `<td>${setCode}</td>`;
                html += `<td>${setNumber}</td>`;
                html += `<td><strong>${percentage}%</strong></td>`;
                html += `<td>${deckCount} / ${totalDecks}</td>`;
                html += `<td><button class="btn btn-primary" onclick="addCardToDeck('cityLeague', '${cardName.replace(/'/g, "\\'")}')">+ Add</button></td>`;
                html += '</tr>';
            });

            html += '</tbody></table>';
            tableContainer.innerHTML = html;
            console.log('Table rendered successfully');
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
            let deckKey = (setCode && setNumber) ? `${cardName} (${setCode} ${setNumber})` : cardName;
            
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
            const allCardsDb = window.allCardsDatabase || [];
            let cardData = cards.find(c => (c.card_name || c.full_card_name) === cardName);
            if (!cardData && setCode && setNumber) {
                cardData = allCardsDb.find(c => c.name === cardName && c.set === setCode && c.number === setNumber);
            }
            const isBaseEnergy = cardData && (cardData.type || cardData.card_type || '').toLowerCase() === 'energy' && 
                                (cardName || '').match(/^(Fire|Water|Grass|Lightning|Psychic|Fighting|Darkness|Metal|Fairy|Dragon|Colorless|Neutral)\s+Energy$/i);
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
                }
            });
            
            // Then add cards from allCardsDatabase with both keys
            allCardsFromDb.forEach(card => {
                // CRITICAL FIX: Use actual image_url from database, fallback to buildCardImageUrl only if missing or empty
                const hasValidImageUrl = card.image_url && card.image_url.trim() !== '';
                const imageUrl = hasValidImageUrl ? card.image_url : buildCardImageUrl(card.set, card.number, card.rarity);
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
                                const hasValidImageUrl = exactCard.image_url && exactCard.image_url.trim() !== '';
                                const imageUrl = hasValidImageUrl ? exactCard.image_url : buildCardImageUrl(exactCard.set, exactCard.number, exactCard.rarity);
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
                const archetypeData = cardDataByName[baseName];
                if (archetypeData) {
                    cardData = {
                        ...cardData,
                        percentage_in_archetype: archetypeData.percentage_in_archetype || cardData.percentage_in_archetype,
                        card_type: archetypeData.card_type || archetypeData.type || cardData.card_type,
                        type: archetypeData.type || archetypeData.card_type || cardData.type
                    };
                }

                const globalPref = getGlobalRarityPreference();
                const pref = getRarityPreference(baseName);
                
                const setMatch = deckKey.match(/\(([A-Z0-9]+)\s+([A-Z0-9]+)\)$/);
                const originalSet = setMatch ? setMatch[1] : cardData.set_code;
                const originalNumber = setMatch ? setMatch[2] : cardData.set_number;
                
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
                        cardData.image_url = buildCardImageUrl(setCode, setNumber, cardData.rarity || 'C');
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
                const setCode = card.set_code || '';
                const setNumber = card.set_number || '';
                
                // FAST lookup using index - no fallbacks needed if database is complete
                let imageUrl = '';
                if (setCode && setNumber && cardsBySetNumberMap) {
                    const key = `${setCode}-${setNumber}`;
                    const dbCard = cardsBySetNumberMap[key];
                    if (dbCard && dbCard.image_url) {
                        imageUrl = dbCard.image_url;
                    } else {
                        imageUrl = buildCardImageUrl(setCode, setNumber, card.rarity || 'C');
                    }
                } else if (card.image_url) {
                    imageUrl = card.image_url;
                } else {
                    imageUrl = buildCardImageUrl(setCode, setNumber, card.rarity || 'C');
                }
                imageUrl = fixJapaneseCardImageUrl(imageUrl, setCode, card.card_name);
                
                const percentage = parseFloat(card.percentage_in_archetype || 0).toFixed(1);
                const count = card.deck_count_in_selected || 1;
                const cardNameEscaped = card.card_name.replace(/'/g, "\\'");
                const deckKeyEscaped = (card.deck_key || card.card_name).replace(/'/g, "\\'");
                
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
                
                const baseName = card.card_name;
                const baseCardData = cardDataByName[baseName] || card;
                const totalCount = parseInt(baseCardData.total_count || 0);
                const totalDecksInArchetype = parseInt(baseCardData.total_decks_in_archetype || 1);
                const avgCount = totalDecksInArchetype > 0 ? (totalCount / totalDecksInArchetype).toFixed(2) : '0.00';
                
                html += `
                    <div class="deck-card" style="position: relative;" title="${card.card_name} (${count}x) - ${percentage}%">
                        <img src="${imageUrl}" alt="${card.card_name}" loading="lazy" style="cursor: zoom-in;" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22245%22 height=%22342%22%3E%3Crect fill=%22%23667eea%22 width=%22245%22 height=%22342%22/%3E%3Ctext fill=%22white%22 x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 font-size=%2220%22%3EKeine Bild%3C/text%3E%3C/svg%3E'" onclick="showSingleCard('${imageUrl}', '${cardNameEscaped}')">
                        
                        <div class="card-max-count">${count}</div>
                        
                        <div style="position: absolute; bottom: 30px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.75); color: white; padding: 3px 10px; border-radius: 4px; font-size: 11px; font-weight: bold; white-space: nowrap; z-index: 2;">
                            ${percentage}% | Ø ${avgCount}x
                        </div>
                        
                        <div style="position: absolute; bottom: 5px; left: 5px; right: 5px; display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 3px; z-index: 3; align-items: stretch;">
                            <button onclick="removeCardFromDeck('${source}', '${deckKeyEscaped}')" style="background: #dc3545; color: white; border: none; border-radius: 3px; height: 20px; cursor: pointer; font-weight: bold; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 12px;">−</button>
                            <button onclick="openRaritySwitcher('${cardNameEscaped}', '${deckKeyEscaped}')" style="background: #ffc107; color: #333; border: none; border-radius: 3px; height: 20px; cursor: pointer; font-size: 11px; font-weight: bold; text-align: center; padding: 0; display: flex; align-items: center; justify-content: center;">★</button>
                            <button class="${priceClass}" onclick="openCardmarket('${cardmarketUrlEscaped}', '${cardNameEscaped}')" style="background: ${priceBackground}; color: white; height: 20px; border: none; border-radius: 3px; cursor: ${eurPrice ? 'pointer' : 'not-allowed'}; font-size: 8px; font-weight: bold; padding: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);" title="${eurPrice ? 'Auf Cardmarket kaufen: ' + eurPrice : 'Preis nicht verfügbar'}">${priceDisplay}</button>
                            <button onclick="addCardToDeck('${source}', '${cardNameEscaped}', '${setCode}', '${setNumber}')" style="background: #28a745; color: white; border: none; border-radius: 3px; height: 20px; cursor: pointer; font-weight: bold; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 12px;">+</button>
                        </div>
                    </div>
                `;
            });
            
            const gridContainer = document.getElementById(gridContainerId);
            if (gridContainer) {
                gridContainer.innerHTML = html || '<p style="text-align: center; color: #666; padding: 40px;">Create a deck using the buttons above or add cards manually...</p>';
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
            
            // Check if it's a Pokemon (type starts with element letter)
            if (cardType.charAt(0).match(/[GRWLPFDMNC]/)) {
                return 'Pokemon';
            }
            
            // Check exact matches for trainer types
            if (cardType === 'Supporter') return 'Supporter';
            if (cardType === 'Item') return 'Item';
            if (cardType === 'Tool') return 'Tool';
            if (cardType === 'Stadium') return 'Stadium';
            if (cardType === 'Special Energy') return 'Special Energy';
            if (cardType === 'Energy') return 'Energy';
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
                    
                    // Same name: sort by evolution stage (Basic → Stage1 → Stage2)
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
             * Für jede Karte (gleicher Name) nur die neueste low-rarity Version behalten
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
                const cardName = card.card_name;
                
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
                        // Nur überschreiben wenn neue Werte nicht leer sind
                        if (card.image_url) existing.image_url = card.image_url;
                        if (card.set_code) existing.set_code = card.set_code;
                        if (card.rarity) existing.rarity = card.rarity;
                        if (card.set_number) existing.set_number = card.set_number;
                    } else if (newRarityPriority === existingRarityPriority && newSetPriority > existingSetPriority) {
                        // Gleiche Rarity, aber neueres Set - behalte aggregierte Daten
                        // Nur überschreiben wenn neue Werte nicht leer sind
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
                const imageUrl = fixJapaneseCardImageUrl(card.image_url || '', card.set_code, card.card_name);
                // Konvertiere Komma zu Punkt für parseFloat (CSV verwendet Komma als Dezimaltrennzeichen)
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
                
                // Calculate average count over all decks (total_count / total_decks_in_archetype)
                const totalCount = parseInt(card.total_count || 0);
                const totalDecksInArchetype = parseInt(card.total_decks_in_archetype || 1);
                const avgCount = totalDecksInArchetype > 0 ? (totalCount / totalDecksInArchetype).toFixed(2) : '0';
                
                // Card image or placeholder
                let imgHtml = '';
                if (imageUrl && imageUrl.trim() !== '') {
                    imgHtml = `<img src="${imageUrl}" alt="${card.card_name}" loading="lazy" referrerpolicy="no-referrer" style="width: 100%; aspect-ratio: 2.5/3.5; object-fit: cover; cursor: zoom-in;" onerror="this.style.opacity='0.3'" onclick="event.stopPropagation(); showSingleCard('${imageUrl}', '${card.card_name.replace(/'/g, "\\'")}');">`;
                } else {
                    imgHtml = `<div style="width: 100%; aspect-ratio: 2.5/3.5; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; font-size: 2em;">🃏</div>`;
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
                                <div style="color: #999; font-size: 0.75em; margin-bottom: 3px;">
                                    ${card.set_code || ''} ${card.set_number || ''}
                                </div>
                                <div style="color: #666; font-size: 0.85em;">
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
                const imageUrl = fixJapaneseCardImageUrl(card.image_url || '', card.set_code, card.card_name);
                const count = card.deck_count_in_selected || 1;
                const cardName = card.card_name || '';
                const cardNameEscaped = (cardName || '').replace(/'/g, "\\'");
                
                if (imageUrl && imageUrl.trim() !== '') {
                    return `
                        <div class="compact-card" title="${cardName} (${count}x)" style="cursor: zoom-in;" onclick="showSingleCard('${imageUrl}', '${cardNameEscaped}')">
                            <img src="${imageUrl}" 
                                 alt="${cardName}" 
                                 loading="lazy"
                                 referrerpolicy="no-referrer"
                                 onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22245%22 height=%22342%22%3E%3Crect width=%22245%22 height=%22342%22 fill=%22%23333%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23999%22 font-size=%2218%22%3ENo Image%3C/text%3E%3C/svg%3E'">
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
                alert('❌ This function is not available for this tab!');
            }
        }
        
        function showSingleCard(imageUrl, cardName) {
            const modal = document.getElementById('singleCardModal');
            const img = document.getElementById('singleCardImage');
            const title = document.getElementById('singleCardTitle');
            
            img.src = imageUrl;
            img.alt = cardName;
            if (title) {
                title.textContent = cardName;
            }
            
            modal.classList.add('show');
            
            // Close on ESC key
            const escapeHandler = (e) => {
                if (e.key === 'Escape') {
                    closeSingleCard();
                    document.removeEventListener('keydown', escapeHandler);
                }
            };
            document.addEventListener('keydown', escapeHandler);
        }
        
        function closeSingleCard() {
            const modal = document.getElementById('singleCardModal');
            modal.classList.remove('show');
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
            console.log('[autoComplete] 🗑️ Clearing existing deck to build fresh...');
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
            
            // Basis Energien Identifikation - dürfen öfter als 4x sein
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
            
            // Recalculate percentage_in_archetype for each card based on aggregated deck_count
            // total_decks_in_archetype should be the same for all cards in same archetype
            for (const cardName in uniqueCards) {
                const card = uniqueCards[cardName];
                const totalDecks = parseFloat(card.total_decks_in_archetype || 1);
                const deckCount = card.deck_count;
                // Recalculate percentage using aggregated deck_count
                card.percentage_in_archetype = ((deckCount / totalDecks) * 100).toFixed(2).replace('.', ',');
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
                console.log('[autoComplete] 🌟 ACE SPEC SELECTED:', bestAceSpec.card_name, `(${acePercentage}%)`);
                
                if (!addedNames.has(bestAceSpec.card_name)) {
                    cardsToAdd.push({ ...bestAceSpec, addCount: 1 });
                    addedNames.add(bestAceSpec.card_name);
                    currentTotal += 1;
                    console.log('[autoComplete] ✅ Added Ace Spec (1x):', bestAceSpec.card_name);
                } else {
                    console.log('[autoComplete] ⚠️ Ace Spec already in deck:', bestAceSpec.card_name);
                }
            } else {
                console.log('[autoComplete] ⚠️ WARNING: No Ace Spec found in deck list!');
            }
            
            
            // ===================================================================
            // Step 4: Add remaining cards from 100% downwards until deck is full
            // ===================================================================
            console.log('[autoComplete] 📊 Building deck from highest percentage (100%) downwards...');
            
            // Cards are already sorted by percentage (descending) from Step 2
            for (const card of deckCards) {
                if (currentTotal >= 60) {
                    console.log('[autoComplete] ✅ Deck complete (60 cards - tournament legal) - stopping');
                    break;
                }
                
                const cardName = card.card_name;
                
                // Skip if already added
                if (addedNames.has(cardName)) continue;
                
                // Skip Ace Spec cards (the best one was already added in Step 3)
                if (isAceSpec(card)) {
                    console.log('[autoComplete] ⏭️ Skipping Ace Spec (already added):', cardName);
                    continue;
                }
                
                // Get percentage for logging
                const percentage = parseFloat((card.percentage_in_archetype || '0').toString().replace(',', '.'));
                
                // Calculate AVERAGE count for this card: total_count / total_decks_in_archetype
                const totalCount = parseFloat(card.total_count) || 1;
                const totalDecksInArchetype = parseFloat(card.total_decks_in_archetype) || 1;
                let addCount = Math.round(totalCount / totalDecksInArchetype);
                
                // For base energies, no limit. For other cards, max 4
                if (!isBaseEnergy(card)) {
                    addCount = Math.max(1, Math.min(addCount, 4));
                } else {
                    addCount = Math.max(1, addCount);
                }
                
                // Don't exceed deck limit (60 total cards)
                addCount = Math.min(addCount, 60 - currentTotal);
                
                if (addCount > 0) {
                    cardsToAdd.push({ ...card, addCount: addCount });
                    addedNames.add(cardName);
                    currentTotal += addCount;
                    console.log(`[autoComplete] ➕ ${addCount}x ${cardName} (${percentage.toFixed(1)}%, avg: ${(totalCount/totalDecksInArchetype).toFixed(1)}x) - Total: ${currentTotal}/60`);
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
                    
                    for (let i = 0; i < card.addCount; i++) {
                        addCardToDeck(source, card.card_name, setCode, setNumber);
                    }
                });
                console.log('[autoComplete] Deck completed with rarity mode:', globalRarityPreference);
                
                // Show the deck grid with images
                renderMyDeckGrid(source);
                
                // CRITICAL: Also refresh the Overview Grid to show updated badges
                // Use the filter functions to preserve active filters (e.g., >90% cards)
                if (source === 'cityLeague') {
                    applyCityLeagueFilter();
                } else if (source === 'currentMeta') {
                    applyCurrentMetaFilter();
                }
                console.log('[autoComplete] Overview Grid refreshed to show updated deck badges (with active filters preserved)');
                
                // Save deck to localStorage
                if (source === 'cityLeague') {
                    saveCityLeagueDeck();
                } else if (source === 'currentMeta') {
                    saveCurrentMetaDeck();
                }
            }
        }
        
        /**
         * Auto-Complete with Max Consistency Algorithm
         * Based on Justin Basil's Professional Deck Building Guide:
         * - Deck Skeleton: 20 Pokémon, 30 Trainer, 10 Energy (±3 deviation normal)
         * - Opening Hand Probabilities: 4x = 40%, 3x = 32%, 2x = 22%, 1x = 12%
         * - Consistency Score = (Share %) × (Avg Count) × (Reliability Factor)
         * - Smart Copy Counts based on usage patterns and probability math
         */
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
            
            console.log('[autoCompleteConsistency] 🎯 Starting CONSISTENCY-based deck generation');
            console.log('[autoCompleteConsistency] Total available cards:', cards.length);
            
            // Clear existing deck
            console.log('[autoCompleteConsistency] 🗑️ Clearing existing deck...');
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
                const cardName = card.card_name;
                
                if (!uniqueCards[cardName]) {
                    uniqueCards[cardName] = {
                        ...card,
                        deck_count: parseInt(card.deck_count || 0),
                        total_count: parseFloat(card.total_count || 0)
                    };
                } else {
                    uniqueCards[cardName].deck_count += parseInt(card.deck_count || 0);
                    uniqueCards[cardName].total_count += parseFloat(card.total_count || 0);
                }
            }
            
            // Recalculate percentage for aggregated data
            for (const cardName in uniqueCards) {
                const card = uniqueCards[cardName];
                const totalDecks = parseFloat(card.total_decks_in_archetype || 1);
                const deckCount = card.deck_count;
                card.percentage_in_archetype = ((deckCount / totalDecks) * 100).toFixed(2).replace('.', ',');
            }
            
            let deckCards = Object.values(uniqueCards);
            console.log('[autoCompleteConsistency] After aggregation:', deckCards.length, 'unique cards');
            
            // Step 2: Calculate CONSISTENCY SCORE for each card
            // Formula: (Share % / 100) × Avg Count × Reliability Factor × 100
            deckCards.forEach(card => {
                const sharePercent = parseFloat((card.percentage_in_archetype || '0').toString().replace(',', '.'));
                const totalCount = parseFloat(card.total_count) || 1;
                const totalDecks = parseFloat(card.total_decks_in_archetype) || 1;
                const deckCount = parseInt(card.deck_count) || 1;
                
                // TWO IMPORTANT METRICS:
                // 1. avgCount = Average across ALL decks (including those without the card)
                // 2. avgCountWhenUsed = Average only in decks that USE the card
                const avgCount = totalCount / totalDecks;
                const avgCountWhenUsed = totalCount / deckCount;
                
                // RELIABILITY FACTOR (based on Justin Basil standards):
                // - High share (≥90%) + consistent count (≥1.5) = 1.5x multiplier
                // - Good share (≥70%) = 1.2x multiplier
                // - Medium share (≥50%) = 1.0x multiplier
                // - Low share (<50%) = 0.8x multiplier
                let reliabilityFactor;
                if (sharePercent >= 90 && avgCount >= 1.5) {
                    reliabilityFactor = 1.5;
                } else if (sharePercent >= 70) {
                    reliabilityFactor = 1.2;
                } else if (sharePercent >= 50) {
                    reliabilityFactor = 1.0;
                } else {
                    reliabilityFactor = 0.8;
                }
                
                card.avgCount = avgCount;
                card.avgCountWhenUsed = avgCountWhenUsed;
                card.sharePercent = sharePercent;
                card.consistencyScore = (sharePercent / 100) * avgCount * reliabilityFactor * 100;
                
                // DETERMINE OPTIMAL COPY COUNT (based on professional standards)
                // Reference: Justin Basil Guide + Opening Hand Probability Math
                // 4 copies = ~40% opening hand (Core staples: Prof Research, Ultra Ball)
                // 3 copies = ~32% opening hand (Important consistency)
                // 2 copies = ~22% opening hand (Solid includes)
                // 1 copy = ~12% opening hand (Tech choices)
                
                let optimalCount;
                
                // Base Energy - special handling (can exceed 4)
                if (isBaseEnergy(card)) {
                    // BUGFIX: Only include Basic Energy that actually appears in this archetype
                    // Don't add random energy types that aren't used (e.g. Psychic in Fighting deck)
                    if (sharePercent > 0 && avgCount >= 0.5) {
                        optimalCount = Math.max(1, Math.round(avgCount));
                    } else {
                        optimalCount = 0; // Skip energy types not used in this archetype
                    }
                }
                // ═══════════════════════════════════════════════
                // IMPROVED CONSISTENCY THRESHOLDS V3
                // ═══════════════════════════════════════════════
                
                // POLARIZATION DETECTION FIRST: Skip specialized cards
                // Use avgCountWhenUsed to detect "all or nothing" cards
                // Example: Carmine (55.6% @ 2.78x when used) = Low share + High per-deck = Specialized
                else if (sharePercent < 70 && avgCountWhenUsed >= 2.5) {
                    optimalCount = 0;  // Skip polarized cards - not universal to archetype
                    console.log(`[autoCompleteConsistency] ⚠️ POLARIZED: ${card.card_name} (${sharePercent.toFixed(1)}% share, ${avgCountWhenUsed.toFixed(2)}x when used) - Specialized card, skipping`);
                }
                // 4-of Territory: Ultra-reliable staples
                // Example: Riolu (100% @ 3.25x), Evolution lines, core consistency
                else if (avgCount >= 3.0 && sharePercent >= 90) {
                    optimalCount = 4;  // Ultra-reliable: Nearly universal + high count
                }
                else if (avgCount >= 3.5 && sharePercent >= 80) {
                    optimalCount = 4;  // Core staples: Very high count + good share
                }
                // 3-of Territory: Very strong consistency
                // Example: Judge (96.6% @ 2.40x) should be 3x, not 2x!
                else if (avgCount >= 2.2 && sharePercent >= 90) {
                    optimalCount = 3;  // Very high share + solid count
                }
                else if (avgCount >= 2.5 && sharePercent >= 70) {
                    optimalCount = 3;  // Good reliability standard
                }
                // 2-of Territory: Solid includes
                else if (avgCount >= 1.8) {
                    optimalCount = 2;
                } else if (avgCount >= 1.3 && sharePercent >= 85) {
                    optimalCount = 2;  // High reliability case
                }
                // 1-of Territory: Tech choices
                // Example: Wally's Compassion (64.1% @ 1.61x) - Recovery/Utility cards
                else if (avgCount >= 1.0 && sharePercent >= 50) {
                    optimalCount = 1;
                }
                // HIGH-SHARE TECH CARDS: Include cards with >70% share even if low avgCount
                // Example: Gravity Mountain (75.8% @ 0.85x) - Meta-relevant tech
                else if (sharePercent >= 70 && avgCount >= 0.7) {
                    optimalCount = 1;  // High-share tech: Important for meta
                    console.log(`[autoCompleteConsistency] 🎯 HIGH-SHARE TECH: ${card.card_name} (${sharePercent.toFixed(1)}% share, ${avgCount.toFixed(2)}x avg) - Meta-relevant inclusion`);
                }
                // Skip: Too unreliable
                else {
                    optimalCount = 0;
                }

                
                card.optimalCount = optimalCount;
            });
            
            // Step 3: Sort by CONSISTENCY SCORE (highest probability of success)
            deckCards.sort((a, b) => b.consistencyScore - a.consistencyScore);
            
            console.log('[autoCompleteConsistency] 🎲 Top 10 consistency scores:');
            deckCards.slice(0, 10).forEach((card, i) => {
                console.log(`  ${i+1}. ${card.card_name}: Score ${card.consistencyScore.toFixed(1)} (${card.sharePercent.toFixed(1)}% @ ${card.avgCount.toFixed(1)}x avg) → ${card.optimalCount}x optimal`);
            });
            
            let cardsToAdd = [];
            const addedNames = new Set(Object.keys(deck).filter(name => deck[name] > 0));
            
            // Step 4: Add Ace Spec first (max 1x - TCG rule)
            const aceSpecCards = deckCards.filter(card => isAceSpec(card));
            aceSpecCards.sort((a, b) => b.consistencyScore - a.consistencyScore);
            
            let bestAceSpec = null;
            if (aceSpecCards.length > 0) {
                bestAceSpec = aceSpecCards[0];
                console.log('[autoCompleteConsistency] 🌟 ACE SPEC:', bestAceSpec.card_name, 
                    `(Score: ${bestAceSpec.consistencyScore.toFixed(1)}, ${bestAceSpec.sharePercent.toFixed(1)}% @ ${bestAceSpec.avgCount.toFixed(1)}x)`);
                
                if (!addedNames.has(bestAceSpec.card_name)) {
                    cardsToAdd.push({ ...bestAceSpec, addCount: 1 });
                    addedNames.add(bestAceSpec.card_name);
                    currentTotal += 1;
                }
            }
            
            // Step 5: Build deck from highest consistency score downwards
            console.log('[autoCompleteConsistency] 📊 Building optimal consistency deck...');
            
            for (const card of deckCards) {
                if (currentTotal >= 60) break;
                
                const cardName = card.card_name;
                
                // Skip if already added
                if (addedNames.has(cardName)) continue;
                
                // Skip Ace Spec cards (already handled)
                if (isAceSpec(card)) continue;
                
                // Use optimal count determined by consistency algorithm
                let addCount = card.optimalCount;
                
                // Don't exceed deck limit
                addCount = Math.min(addCount, 60 - currentTotal);
                
                if (addCount > 0) {
                    cardsToAdd.push({ ...card, addCount: addCount });
                    addedNames.add(cardName);
                    currentTotal += addCount;
                    
                    // Opening hand probability for this count
                    const openingHandProb = addCount === 4 ? '~40%' : 
                                           addCount === 3 ? '~32%' : 
                                           addCount === 2 ? '~22%' : '~12%';
                    
                    console.log(`[autoCompleteConsistency] ➕ ${addCount}x ${cardName} (Score: ${card.consistencyScore.toFixed(1)}, ${card.sharePercent.toFixed(1)}% @ ${card.avgCount.toFixed(1)}x, Opening Hand: ${openingHandProb}) - Total: ${currentTotal}/60`);
                }
            }
            
            console.log('[autoCompleteConsistency] ✅ Consistency-optimized deck complete:', currentTotal, 'cards');
            
            // Show summary grouped by type
            let summary = `🎯 MAX CONSISTENCY Deck (${currentTotal} cards):\n`;
            summary += `Based on Professional Deck Building Guide\n\n`;
            
            let pokemon = [], trainer = [], energy = [];
            
            cardsToAdd.forEach(card => {
                const cardType = card.type || card.card_type || '';
                const category = getCardTypeCategory(cardType);
                const openingHandProb = card.addCount === 4 ? '~40%' : 
                                       card.addCount === 3 ? '~32%' : 
                                       card.addCount === 2 ? '~22%' : '~12%';
                const line = `${card.addCount}x ${card.card_name} (${card.sharePercent.toFixed(0)}% decks, ${openingHandProb} in opening hand)`;
                
                if (category === 'Pokemon') pokemon.push(line);
                else if (category === 'Energy') energy.push(line);
                else trainer.push(line);
            });
            
            if (pokemon.length > 0) summary += `Pokémon (${pokemon.reduce((sum, p) => sum + parseInt(p.split('x')[0]), 0)}):\n${pokemon.join('\n')}\n\n`;
            if (trainer.length > 0) summary += `Trainer (${trainer.reduce((sum, t) => sum + parseInt(t.split('x')[0]), 0)}):\n${trainer.join('\n')}\n\n`;
            if (energy.length > 0) summary += `Energy (${energy.reduce((sum, e) => sum + parseInt(e.split('x')[0]), 0)}):\n${energy.join('\n')}\n\n`;
            
            summary += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            summary += `Consistency Formula: (Share % × Avg Count × Reliability)\n`;
            summary += `Copy Counts: 4x = Core (40% opening), 3x = Reliable (32%), 2x = Solid (22%), 1x = Tech (12%)\n\n`;
            summary += `Continue?`;
            
            if (confirm(summary)) {
                // Add all cards to deck
                cardsToAdd.forEach(card => {
                    const originalSetCode = card.set_code || '';
                    const originalSetNumber = card.set_number || '';
                    const preferredVersion = getPreferredVersionForCard(card.card_name, originalSetCode, originalSetNumber);
                    
                    let setCode, setNumber;
                    if (preferredVersion) {
                        setCode = preferredVersion.set;
                        setNumber = preferredVersion.number;
                    } else {
                        setCode = originalSetCode;
                        setNumber = originalSetNumber;
                    }
                    
                    for (let i = 0; i < card.addCount; i++) {
                        addCardToDeck(source, card.card_name, setCode, setNumber);
                    }
                });
                
                console.log('[autoCompleteConsistency] ✅ Consistency deck completed with rarity mode:', globalRarityPreference);
                
                // Show the deck grid
                renderMyDeckGrid(source);
                
                // Refresh overview grid
                if (source === 'cityLeague') {
                    applyCityLeagueFilter();
                } else if (source === 'currentMeta') {
                    applyCurrentMetaFilter();
                }
                
                // Save deck
                if (source === 'cityLeague') {
                    saveCityLeagueDeck();
                } else if (source === 'currentMeta') {
                    saveCurrentMetaDeck();
                } else if (source === 'pastMeta') {
                    savePastMetaDeck();
                }
            }
        }
        
        // ═══════════════════════════════════════════════════════════════
        // META CARD ANALYSIS (Cross-Archetype Analysis)
        // ═══════════════════════════════════════════════════════════════
        
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
                // Load card analysis data (already aggregated per archetype)
                const timestamp = new Date().getTime();
                const csvFile = source === 'cityLeague' ? 'city_league_analysis.csv' : 'current_meta_card_data.csv';
                const response = await fetch(`${BASE_PATH}${csvFile}?t=${timestamp}`);
                
                if (!response.ok) throw new Error('Failed to load card analysis data');
                
                const text = await response.text();
                const allData = parseCSV(text);
                
                console.log('[loadMetaCardAnalysis] Loaded', allData.length, 'card entries from CSV');
                
                // Group by archetype and aggregate cards (handling duplicate total_decks_in_archetype)
                const archetypeData = {};
                allData.forEach(row => {
                    const arch = row.archetype || 'Unknown';
                    if (!archetypeData[arch]) {
                        archetypeData[arch] = {
                            name: arch,
                            totalDecks: parseInt(row.total_decks_in_archetype) || 0,  // Set once, not summed
                            cards: {}  // cardName -> { deckCount, totalCount, ... }
                        };
                    }
                    
                    // total_decks_in_archetype is already the total for the archetype across all tournaments
                    // No need to sum it - it's the same value for all tournament_dates
                    
                    // Aggregate cards by card_name (across all tournament dates)
                    const cardName = row.card_name;
                    if (!cardName) return;
                    
                    if (!archetypeData[arch].cards[cardName]) {
                        archetypeData[arch].cards[cardName] = {
                            card_name: cardName,
                            set_code: row.set_code,
                            set_number: row.set_number,
                            type: row.type || row.card_type,
                            rarity: row.rarity,
                            image_url: row.image_url,
                            deckCount: parseInt(row.deck_count) || 0,      // Set once (max)
                            totalCount: parseInt(row.total_count) || 0      // Set once (max)
                        };
                    } else {
                        // Take maximum values (since total_decks_in_archetype is constant, these should be too)
                        archetypeData[arch].cards[cardName].deckCount = Math.max(
                            archetypeData[arch].cards[cardName].deckCount,
                            parseInt(row.deck_count) || 0
                        );
                        archetypeData[arch].cards[cardName].totalCount = Math.max(
                            archetypeData[arch].cards[cardName].totalCount,
                            parseInt(row.total_count) || 0
                        );
                    }
                });
                
                // Get Top 10 archetypes by total deck count (across all dates)
                const archetypeList = Object.values(archetypeData)
                    .sort((a, b) => b.totalDecks - a.totalDecks)
                    .slice(0, 10);
                
                console.log('[loadMetaCardAnalysis] Top 10 archetypes:', archetypeList.map(a => `${a.name} (${a.totalDecks} decks)`));
                
                // Aggregate all cards from Top 10 archetypes
                const cardMap = {};
                let totalDecksInTop10 = 0;
                
                archetypeList.forEach(archetype => {
                    totalDecksInTop10 += archetype.totalDecks;
                    
                    // Iterate over cards in this archetype
                    Object.values(archetype.cards).forEach(card => {
                        const cardName = card.card_name;
                        
                        if (!cardMap[cardName]) {
                            cardMap[cardName] = {
                                card_name: cardName,
                                set_code: card.set_code,
                                set_number: card.set_number,
                                type: card.type,
                                rarity: card.rarity,
                                image_url: card.image_url,
                                totalDecksWithCard: 0,
                                totalCopies: 0
                            };
                        }
                        
                        // Aggregate across top 10 archetypes
                        cardMap[cardName].totalDecksWithCard += card.deckCount;
                        cardMap[cardName].totalCopies += card.totalCount;
                    });
                });
                
                console.log('[loadMetaCardAnalysis] Total decks in Top 10:', totalDecksInTop10);
                
                // Calculate meta-wide share% and avg count
                const metaCards = Object.values(cardMap).map(card => ({
                    ...card,
                    metaShare: totalDecksInTop10 > 0 ? (card.totalDecksWithCard / totalDecksInTop10) * 100 : 0,
                    avgCount: totalDecksInTop10 > 0 ? card.totalCopies / totalDecksInTop10 : 0,
                    avgCountWhenUsed: card.totalDecksWithCard > 0 ? card.totalCopies / card.totalDecksWithCard : 0
                }));
                
                metaCardData[source] = metaCards;
                console.log('[loadMetaCardAnalysis] Loaded', metaCards.length, 'unique cards from Top 10 archetypes');
                
                renderMetaCards(source);
                
            } catch (error) {
                console.error('[loadMetaCardAnalysis] Error:', error);
                grid.innerHTML = '<p style="text-align: center; color: #dc3545; padding: 40px; grid-column: 1 / -1;">❌ Error loading meta analysis</p>';
            }
        }
        
        function renderMetaCards(source) {
            const gridId = source === 'cityLeague' ? 'cityLeagueMetaGrid' : 'currentMetaMetaGrid';
            const countId = source === 'cityLeague' ? 'cityLeagueMetaCardCount' : 'currentMetaMetaCardCount';
            const grid = document.getElementById(gridId);
            const countSpan = document.getElementById(countId);
            
            if (!metaCardData[source] || metaCardData[source].length === 0) {
                grid.innerHTML = '<p style="text-align: center; color: #666; padding: 40px; grid-column: 1 / -1;">No cards loaded. Click "Load Meta Analysis" button.</p>';
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
            
            // Apply search filter
            if (filter.searchTerm) {
                const term = filter.searchTerm.toLowerCase();
                cards = cards.filter(c => c.card_name.toLowerCase().includes(term));
            }
            
            // Apply minimum 30% share filter (always active for meta analysis)
            cards = cards.filter(c => c.metaShare >= 30);
            
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
                grid.innerHTML = '<p style="text-align: center; color: #999; padding: 40px; grid-column: 1 / -1;">No cards match current filters</p>';
                return;
            }
            
            // Render cards (similar to card overview grid)
            grid.innerHTML = cards.map(card => {
                const imageUrl = card.image_url || `https://via.placeholder.com/245x342?text=${encodeURIComponent(card.card_name)}`;
                
                return `
                    <div class="card-item" style="position: relative; cursor: pointer; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'" onclick="addCardToDeck('${source}', '${card.card_name.replace(/'/g, "\\'")}', '${card.set_code}', '${card.set_number}')">
                        <img src="${imageUrl}" alt="${card.card_name}" style="width: 100%; height: auto; display: block;" onerror="this.src='https://via.placeholder.com/245x342?text=${encodeURIComponent(card.card_name)}'">
                        <div style="position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(to top, rgba(0,0,0,0.9), transparent); color: white; padding: 8px 6px; font-size: 0.75em; line-height: 1.3;">
                            <div style="font-weight: bold;">${card.card_name}</div>
                            <div style="color: #ffd700;">${card.metaShare.toFixed(1)}% | Ø ${card.avgCount.toFixed(2)}x</div>
                            <div style="color: #aaa; font-size: 0.9em;">(${card.avgCountWhenUsed.toFixed(2)}x when used)</div>
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
                resultsContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">Loading card database...</div>';
                return;
            }
            
            // If a card name is selected, show all versions
            if (window.selectedCardName) {
                showCardVersions(window.selectedCardName, resultsContainer, source);
                return;
            }
            
            // STAGE 1: Show unique card names
            const matchingCards = allAvailableCards.filter(card => 
                card.name && card.name.toLowerCase().includes(searchTerm)
            );
            
            // Get unique card names
            const uniqueNames = [...new Set(matchingCards.map(c => c.name))].sort();
            
            console.log(`[searchDeckCards] Search term: "${searchTerm}", found ${uniqueNames.length} unique cards (${matchingCards.length} versions)`);
            
            if (uniqueNames.length === 0) {
                resultsContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">No cards found</div>';
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
                const imageUrl = firstVersion ? buildCardImageUrl(firstVersion.set, firstVersion.number, firstVersion.rarity) : '';
                
                html += `
                    <div onclick="selectCardName('${cardNameEscaped}', '${source}')" style="background: white; padding: 8px; border-radius: 4px; cursor: pointer; transition: all 0.2s; border-left: 2px solid #667eea; display: flex; gap: 8px; align-items: center;" onmouseover="this.style.background='#f9f9f9'; this.style.transform='translateX(3px)';" onmouseout="this.style.background='white'; this.style.transform='translateX(0)';">
                        <div style="width: 40px; height: 50px; background: #f5f5f5; border-radius: 3px; overflow: hidden; flex-shrink: 0;">
                            <img src="${imageUrl}" alt="${cardName}" style="width: 100%; height: 100%; object-fit: contain; cursor: zoom-in;" onerror="this.style.display='none';" loading="lazy">
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-weight: 600; color: #333; font-size: 0.9em; line-height: 1.2; white-space: normal; word-break: break-word;">${cardName}</div>
                            <div style="font-size: 0.75em; color: #999;">${versionsCount} Version${versionsCount > 1 ? 'en' : ''}</div>
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
            html += `<div style="font-weight: bold; color: #333;">🎴 ${cardName}</div>`;
            html += `<button onclick="window.selectedCardName=null; searchDeckCards('${source}');" style="background: #6c757d; color: white; border: none; padding: 5px 15px; border-radius: 5px; cursor: pointer; font-size: 0.85em;">← Zurück</button>`;
            html += '</div>';
            html += `<div style="font-size: 0.85em; color: #666; margin-top: 8px;">${versions.length} Versionen | ${totalCount}x im Deck</div>`;
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
                let imageUrl = hasValidImageUrl ? card.image_url : buildCardImageUrl(setCode, setNumber, rarityFull);
                imageUrl = fixJapaneseCardImageUrl(imageUrl, setCode, cardName);
                const cardNameEscaped = cardName.replace(/'/g, "\\'");
                
                html += `
                    <div style="position: relative; text-align: center; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 6px rgba(0,0,0,0.15); transition: transform 0.2s, box-shadow 0.2s;" onmouseover="this.style.transform='scale(1.03)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.25)';" onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 2px 6px rgba(0,0,0,0.15)';">
                        <div style="position: relative; cursor: zoom-in; background: #f5f5f5;" onclick="showSingleCard('${imageUrl}', '${cardNameEscaped} (${setCode} ${setNumber})')">
                            <img src="${imageUrl}" alt="${cardName}" style="width: 100%; height: 160px; object-fit: contain;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" loading="lazy">
                            <div style="display: none; width: 100%; height: 160px; align-items: center; justify-content: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; flex-direction: column; padding: 8px;">
                                <div style="font-size: 2em; margin-bottom: 5px;">🃏</div>
                                <div style="font-size: 0.7em; text-align: center;">${setCode}<br>${setNumber}</div>
                            </div>
                        </div>
                        ${versionCount > 0 ? `<div style="position: absolute; top: 4px; left: 4px; background: #28a745; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 0.75em; font-weight: bold; z-index: 5; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${versionCount}</div>` : ''}
                        <button onclick="addCardToDeck('${source}', '${cardNameEscaped}', '${setCode}', '${setNumber}')" style="position: absolute; top: 4px; right: 4px; background: #28a745; color: white; border: none; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: bold; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.3); z-index: 10; transition: all 0.2s;" onmouseover="this.style.transform='scale(1.1)'; this.style.background='#218838';" onmouseout="this.style.transform='scale(1)'; this.style.background='#28a745';" title="Zum Deck hinzufügen">+</button>
                        <div style="padding: 8px; background: white; border-top: 1px solid #f0f0f0;">
                            <div style="font-size: 0.7em; color: #666; font-weight: 600;">${setCode} ${setNumber}</div>
                        </div>
                    </div>
                `;
            });
            
            container.innerHTML = html;
        }
        
        function buildCardImageUrl(setCode, setNumber, rarity) {
            // Build Limitless CDN URL with fallback patterns
            // Pattern: https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/{SET}/{SET}_{NUMBER}_R_EN_LG.png
            
            if (!setCode || !setNumber) {
                return 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22245%22 height=%22342%22%3E%3Crect fill=%22%23667eea%22 width=%22245%22 height=%22342%22/%3E%3Ctext fill=%22white%22 x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 font-size=%2220%22%3EKeine Daten%3C/text%3E%3C/svg%3E';
            }
            
            // Determine rarity code
            let rarityCode = 'R'; // Default to Rare
            if (rarity) {
                const r = rarity.toLowerCase();
                if (r.includes('uncommon')) rarityCode = 'U';
                else if (r.includes('common') && !r.includes('uncommon')) rarityCode = 'C';
                else if (r.includes('holo')) rarityCode = 'R';
            }
            
            // Pad numeric card numbers to 3 digits (86 -> 086, TG24 stays TG24)
            let paddedNumber = setNumber;
            if (/^\d+$/.test(setNumber)) {
                paddedNumber = setNumber.padStart(3, '0');
            }
            
            // Build URL: MEG_086_R_EN_LG.png
            return `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/${setCode}/${setCode}_${paddedNumber}_${rarityCode}_EN_LG.png`;
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
                            console.warn('⚠️ Error executing matchup script:', scriptError);
                        }
                    }
                });
                console.log(`📊 Loaded ${scriptsExecuted} matchup data scripts`);
                
                // Verify that matchup data was loaded
                const matchupVars = Object.keys(window).filter(k => k.startsWith('matchupData_'));
                console.log(`✅ Available matchup variables: ${matchupVars.length}`);
                
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
                                console.log('✅ Removed inline grid styles from matchup container');
                            }
                        }
                    });
                    
                    // Now patch ONLY the Full Comparison Table with our improved version
                    patchLimitlessComparisonTable();
                    
                    // Patch the Archetype Overview stat card with current CSV data
                    await patchArchetypeOverview();
                    
                    // Patch the Meta stat card with tournament stats
                    await patchMetaStats();
                    
                    console.log('✅ Current Meta data loaded successfully');
                } else {
                    currentMetaContent.innerHTML = '<div style="color: #e74c3c; padding: 20px;">Error loading comparison data</div>';
                }
                
                window.currentMetaLoaded = true;
            } catch (error) {
                console.error('Error loading Current Meta:', error);
                currentMetaContent.innerHTML = `
                    <div style="color: #e74c3c; padding: 20px;">
                        <strong>Fehler:</strong> Could not load comparison HTML.
                        <br><small>${error.message}</small>
                    </div>
                `;
            }
        }
        
        // Patch the Full Comparison Table to use condensed rank format
        function patchLimitlessComparisonTable() {
            // Find all tables in the current meta content
            const tables = document.querySelectorAll('#currentMetaContent table');
            
            // The Full Comparison Table is typically the last table
            tables.forEach(table => {
                const thead = table.querySelector('thead tr');
                if (!thead) return;
                
                const headers = Array.from(thead.querySelectorAll('th')).map(th => th.textContent.trim());
                
                // Check if this is the Full Comparison Table (has Old Rank, New Rank, Rank Δ columns)
                if (headers.includes('Old Rank') && headers.includes('New Rank') && headers.includes('Rank Δ')) {
                    console.log('📋 Patching Full Comparison Table...');
                    
                    // Find column indices
                    const oldRankIdx = headers.indexOf('Old Rank');
                    const newRankIdx = headers.indexOf('New Rank');
                    const rankDeltaIdx = headers.indexOf('Rank Δ');
                    
                    // Remove Old Rank and Rank Δ headers, keep only New Rank and rename it to "Rank"
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
                            const match = deltaHtml.match(/▲\s*(\d+)/);
                            if (match) changeText = ` <span style="color: #27ae60; font-size: 0.9em;">(▲${match[1]})</span>`;
                        } else if (deltaHtml.includes('rank-down')) {
                            const match = deltaHtml.match(/▼\s*(\d+)/);
                            if (match) changeText = ` <span style="color: #e74c3c; font-size: 0.9em;">(▼${match[1]})</span>`;
                        } else {
                            changeText = ' <span style="color: #95a5a6; font-size: 0.9em;">(-)</span>';
                        }
                        
                        // Update new rank cell to include change
                        newRankCell.innerHTML = newRankCell.textContent + changeText;
                        
                        // Remove old rank and delta cells
                        oldRankCell.remove();
                        rankDeltaCell.remove();
                    });
                    
                    console.log('✅ Full Comparison Table patched successfully');
                }
            });
        }

        // Patch Archetype Overview stat card with live CSV data
        async function patchArchetypeOverview() {
            try {
                // Load CSV data
                const csvData = await loadCSV('limitless_online_decks_comparison.csv');
                if (!csvData || csvData.length === 0) {
                    console.warn('⚠️ No CSV data available for stat patching');
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
                
                // Calculate Top 3 by Win Rate (≥10% of #1 deck count)
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
                    .map(d => `<span style="color: #3498db;">${d.name}</span> (${d.count.toLocaleString()})`)
                    .join('<br>');
                
                const top3ByWinRateHtml = decksByWinRate
                    .map(d => `<span style="color: #27ae60;">${d.name}</span> (${d.winRate.toFixed(1)}%)`)
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
                        
                        console.log('✅ Archetype Overview patched:', {
                            totalArchetypes,
                            groupedArchetypes,
                            top3Count: decksByCount.map(d => d.name),
                            top3WR: decksByWinRate.map(d => d.name)
                        });
                    }
                });
            } catch (error) {
                console.error('❌ Error patching Archetype Overview:', error);
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
                            console.log(`📋 Loaded format from settings: ${currentFormat}`);
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
                            console.log(`✅ Format updated to: ${currentFormat}`);
                        }
                        
                        // Add tournament stats below the current format
                        const existingP = card.querySelector('p');
                        if (existingP && existingP.textContent.includes('Current Format')) {
                            // Add new stats
                            const statsHtml = `
                                <p style="font-size: 0.85em; color: #7f8c8d; margin: 15px 0 5px 0; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px;">
                                    <strong style="color: #3498db;">📊 Online Meta:</strong><br>
                                    <span style="font-size: 0.95em;">${metaStats.tournaments.toLocaleString()} tournaments · ${metaStats.players.toLocaleString()} players · ${metaStats.matches.toLocaleString()} matches</span>
                                </p>
                                <p style="font-size: 0.85em; color: #7f8c8d; margin: 5px 0 0 0;">
                                    <strong style="color: #27ae60;">🏆 Major Tournaments:</strong><br>
                                    <span style="font-size: 0.95em;">${majorTournaments} tournaments · ${totalPlayers.toLocaleString()} players</span>
                                </p>
                            `;
                            existingP.insertAdjacentHTML('afterend', statsHtml);
                        }
                        
                        console.log('✅ Meta stats patched:', {
                            onlineStats: metaStats,
                            majorTournaments,
                            totalPlayers,
                            format: currentFormat
                        });
                    }
                });
            } catch (error) {
                console.error('❌ Error patching Meta stats:', error);
            }
        }



        
        // Load Current Analysis
        async function loadCurrentAnalysis() {
            console.log('🔄 Loading Current Meta Analysis Tab...');
            
            // Load Current Meta HTML (for matchup data) if not already loaded
            if (!window.currentMetaLoaded) {
                console.log('📥 Loading Current Meta HTML for matchup data...');
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
                console.log('📂 No saved Current Meta deck found');
                return;
            }
            
            try {
                const data = JSON.parse(saved);
                console.log('✅ Loaded Current Meta deck from localStorage:', data);
                
                if (data.deck) {
                    window.currentMetaDeck = data.deck;
                }
                if (data.order) {
                    window.currentMetaDeckOrder = data.order;
                }
                if (data.archetype) {
                    window.currentCurrentMetaArchetype = data.archetype;
                    // Pre-select archetype in dropdown if it exists (but don't display deck yet)
                    console.log('📂 Saved archetype found:', data.archetype, '(waiting for user to select archetype)');
                }
                
                // DON'T automatically display deck - wait for archetype selection
                console.log('📊 Current Meta Deck loaded but not displayed (waiting for archetype selection)');
            } catch (e) {
                console.error('❌ Error loading Current Meta deck:', e);
            }
        }
        
        function saveCurrentMetaDeck() {
            try {
                const deck = window.currentMetaDeck || {};
                const deckSize = Object.keys(deck).length;
                
                // If deck is empty, remove from localStorage instead of saving empty object
                if (deckSize === 0) {
                    localStorage.removeItem('currentMetaDeck');
                    console.log('💾 Current Meta deck is empty - removed from localStorage');
                    return;
                }
                
                const data = {
                    deck: deck,
                    order: window.currentMetaDeckOrder || [],
                    archetype: window.currentCurrentMetaArchetype || null,
                    timestamp: new Date().toISOString()
                };
                
                localStorage.setItem('currentMetaDeck', JSON.stringify(data));
                console.log('💾 Current Meta deck saved to localStorage:', deckSize, 'cards');
            } catch (e) {
                console.error('❌ Error saving Current Meta deck:', e);
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
                    console.log('💾 Loaded Past Meta deck from localStorage:', Object.keys(window.pastMetaDeck).length, 'cards');
                    return true;
                }
            } catch (e) {
                console.error('❌ Error loading Past Meta deck:', e);
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
                    console.log('💾 Past Meta deck is empty - removed from localStorage');
                    return;
                }
                
                const data = {
                    deck: deck,
                    order: window.pastMetaDeckOrder || [],
                    archetype: window.pastMetaCurrentArchetype || null,
                    timestamp: new Date().toISOString()
                };
                
                localStorage.setItem('pastMetaDeck', JSON.stringify(data));
                console.log('💾 Past Meta deck saved to localStorage:', deckSize, 'cards');
            } catch (e) {
                console.error('❌ Error saving Past Meta deck:', e);
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
            
            // CSV structure: meta (format), tournament_date, archetype (deck name!), card_name, ...
            // Group cards by tournament_date + archetype (deck archetype)
            const deckMap = new Map();
            cardsData.forEach(card => {
                const deckArchetype = card.archetype || 'Unknown Deck';
                const tournamentDate = card.tournament_date || 'Unknown Date';
                const deckKey = `${card.meta}|||${tournamentDate}|||${deckArchetype}`;
                
                if (!deckMap.has(deckKey)) {
                    // Find matching tournament from overview
                    const tournament = pastMetaTournaments.find(t => 
                        t.tournament_date === tournamentDate && t.format === card.meta
                    );
                    
                    deckMap.set(deckKey, {
                        key: deckKey,
                        tournament_id: tournament ? tournament.tournament_id : tournamentDate,
                        tournament_name: tournament ? tournament.tournament_name : tournamentDate,
                        tournament_date: tournamentDate,
                        deck_name: deckArchetype,
                        archetype: deckArchetype,
                        format: card.meta || 'Unknown',
                        decklist_count: parseInt(card.total_decks_in_archetype || 1),
                        cards: []
                    });
                }
                deckMap.get(deckKey).cards.push({
                    ...card,
                    card_count: parseFloat(card.total_count || 0),
                    decklist_count: parseInt(card.total_decks_in_archetype || 1),
                    deck_count: parseInt(card.deck_count || 0)
                });
            });
            
            pastMetaDecks = Array.from(deckMap.values());
            
            // Populate Format Filter
            const formats = [...new Set(cardsData.map(c => c.meta).filter(f => f))].sort().reverse();
            const formatSelect = document.getElementById('pastMetaFormatFilter');
            formatSelect.innerHTML = '<option value="all">-- Alle Formate --</option>';
            formats.forEach(format => {
                formatSelect.innerHTML += `<option value="${format}">${format}</option>`;
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
            console.log(`✅ Loaded ${pastMetaDecks.length} decks from ${tournamentCount} tournaments`);
            window.pastMetaLoaded = true;
        }
        
        function updatePastMetaTournamentFilter() {
            const formatFilter = document.getElementById('pastMetaFormatFilter').value;
            const tournamentSelect = document.getElementById('pastMetaTournamentFilter');
            
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
            tournamentSelect.innerHTML = '<option value="all">-- Alle Turniere --</option>';
            tournaments.forEach(tournament => {
                // Clean tournament name: remove " – Limitless" / " - Limitless"
                let cleanName = tournament.tournament_name.replace(/\s*[–-]\s*Limitless\s*$/i, '');
                tournamentSelect.innerHTML += `<option value="${tournament.tournament_id}">${cleanName}</option>`;
            });
            
            console.log(`[Past Meta] Tournament filter updated: ${tournaments.length} tournaments for format ${formatFilter}`);
        }
        
        function updatePastMetaDeckList() {
            const formatFilter = document.getElementById('pastMetaFormatFilter').value;
            const tournamentFilter = document.getElementById('pastMetaTournamentFilter').value;
            const searchTerm = document.getElementById('pastMetaDeckSearch').value.toLowerCase();
            
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
            const deckSelect = document.getElementById('pastMetaDeckSelect');
            deckSelect.innerHTML = '<option value="">-- Bitte Deck auswählen --</option>';
            
            archetypes.forEach(entry => {
                const tournamentCount = entry.tournaments.length;
                const displayName = tournamentCount > 1 
                    ? `${entry.archetype} (${tournamentCount} Turniere)`
                    : entry.archetype;
                deckSelect.innerHTML += `<option value="${entry.archetype}">${displayName}</option>`;
            });
            
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
            
            // Aggregate cards across all matching decks
            const cardMap = new Map();
            let totalDecklists = 0;
            const tournamentNames = [];
            
            matchingDecks.forEach(deck => {
                totalDecklists += (deck.decklist_count || 0);
                
                // Track tournament names for stats display
                const cleanTournamentName = (deck.tournament_name || '').replace(/\s*[–-]\s*Limitless\s*$/i, '');
                if (!tournamentNames.includes(cleanTournamentName)) {
                    tournamentNames.push(cleanTournamentName);
                }
                
                // Aggregate cards
                deck.cards.forEach(card => {
                    const cardKey = `${card.card_name}|${card.card_identifier}`;
                    if (!cardMap.has(cardKey)) {
                        cardMap.set(cardKey, {
                            ...card,
                            card_count: 0,
                            deck_count: 0,
                            total_decks_in_archetype: 0
                        });
                    }
                    const aggregatedCard = cardMap.get(cardKey);
                    aggregatedCard.card_count += parseFloat(card.card_count || card.total_count || 0);
                    aggregatedCard.deck_count += parseInt(card.deck_count || 0);
                    aggregatedCard.total_decks_in_archetype = totalDecklists;
                });
            });
            
            const aggregatedCards = Array.from(cardMap.values());
            
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
            const totalCards = aggregatedCards.reduce((sum, c) => sum + (parseFloat(c.card_count) || 0), 0);
            document.getElementById('pastMetaStatCards').textContent = `${aggregatedCards.length} / ${Math.round(totalCards)}`;
            
            // Show tournament info based on count
            if (matchingDecks.length === 1) {
                const cleanName = tournamentNames[0];
                document.getElementById('pastMetaStatTournament').textContent = `${cleanName} (${totalDecklists} decklists)`;
            } else {
                document.getElementById('pastMetaStatTournament').textContent = `${matchingDecks.length} Turniere (${totalDecklists} total decklists)`;
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
            const totalCards = sortedCards.reduce((sum, c) => sum + (parseFloat(c.card_count) || 0), 0);
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
                tableContainer.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">No cards found</p>';
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
                const count = Math.round(parseFloat(card.card_count) || 0);
                const isAceSpecCard = isAceSpec(cardName);
                
                html += '<tr>';
                html += `<td style="text-align: center; font-weight: bold; color: #2c3e50;">${count}</td>`;
                html += `<td>${cardName}</td>`;
                html += `<td style="text-align: center;">${isAceSpecCard ? '<span style="color: #e74c3c; font-weight: bold;">✓</span>' : '-'}</td>`;
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
                gridContainer.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">No cards found</p>';
                return;
            }
            
            // Sort cards by type for better organization
            const sortedCards = sortCardsByType([...cards]);
            
            // Get current deck to show deck counts
            const currentDeck = window.pastMetaDeck || {};
            
            let html = '';
            
            sortedCards.forEach(card => {
                const cardFullName = card.full_card_name || card.card_name || 'Unknown Card';
                const cardNameEscaped = cardFullName.replace(/'/g, "\\'");
                const avgCount = parseFloat(card.card_count) || 0; // Average count across all decklists (e.g., 0.98)
                const decklistCount = parseInt(card.decklist_count) || 1; // Total decklists in archetype
                const deckCount = parseInt(card.deck_count) || 0; // Number of decks containing this card
                
                // Parse card name and set/number from full_card_name (e.g., "Abra MEG 54" -> name: "Abra", set: "MEG", number: "54")
                let cardName = cardFullName;
                let setCodeFromName = '';
                let setNumberFromName = '';
                
                // Match pattern: "Card Name SET NUMBER" (e.g., "Abra MEG 54", "Dragapult ex TWM 130")
                const cardMatch = cardFullName.match(/^(.+?)\s+([A-Z0-9]{2,4})\s+([A-Z0-9]+)$/);
                if (cardMatch) {
                    cardName = cardMatch[1].trim();
                    setCodeFromName = cardMatch[2];
                    setNumberFromName = cardMatch[3];
                    console.log(`[Past Meta] Parsed card: "${cardFullName}" -> name: "${cardName}", set: "${setCodeFromName}", number: "${setNumberFromName}"`);
                }
                
                // Calculate statistics
                const percentage = decklistCount > 0 ? ((deckCount / decklistCount) * 100).toFixed(1) : '0.0';
                const avgInUsingDecks = deckCount > 0 ? (avgCount * decklistCount / deckCount).toFixed(2) : '0.00';
                
                // Match card from all_cards_database to get image/price
                // CRITICAL FIX: Use allCardsDatabase (not allCardsData)
                const cardInDb = window.allCardsDatabase ? window.allCardsDatabase.find(c => {
                    // Try exact set + number match first
                    if (setCodeFromName && setNumberFromName) {
                        return c.set === setCodeFromName && c.number === setNumberFromName;
                    }
                    // Fallback to name match
                    return c.name && cardName.toLowerCase() === c.name.toLowerCase();
                }) : null;
                
                if (cardInDb) {
                    console.log(`[Past Meta] ✅ Found in DB: ${cardName} -> ${cardInDb.set} ${cardInDb.number}, image: ${cardInDb.image_url ? 'YES' : 'NO'}`);
                } else {
                    console.log(`[Past Meta] ❌ NOT found in DB: ${cardName} (searched: set="${setCodeFromName}", number="${setNumberFromName}")`);
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
                    
                    const imageUrl = fixJapaneseCardImageUrl(displayCard.image_url || '', setCode, cardName) || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22280%22%3E%3Crect width=%22200%22 height=%22280%22 fill=%22%23333%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23999%22 font-size=%2218%22%3ENo Image%3C/text%3E%3C/svg%3E';
                    
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
                    if (setCode && setNumber && allCardsDatabase) {
                        let priceCard = allCardsDatabase.find(c => 
                            c.set === setCode && c.number === setNumber
                        );
                        
                        if (!priceCard) {
                            const normalizedNumber = setNumber.replace(/^0+/, '') || '0';
                            priceCard = allCardsDatabase.find(c => 
                                c.set === setCode && (c.number === normalizedNumber || c.number === setNumber)
                            );
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
                    
                    html += `
                        <div class="card-item" data-card-name="${cardName.toLowerCase()}" data-card-type="${filterCategory}" style="position: relative; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.15); cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; background: white;">
                            <div class="card-image-container" style="position: relative; width: 100%;">
                                <img src="${imageUrl}" alt="${cardName}" loading="lazy" referrerpolicy="no-referrer" style="width: 100%; aspect-ratio: 2.5/3.5; object-fit: cover; cursor: zoom-in;" onerror="this.style.opacity='0.3'" onclick="event.stopPropagation(); showSingleCard('${imageUrl}', '${cardNameEscaped}');">
                                
                                <!-- Red badge: Average Count (top-right) -->
                                <div style="position: absolute; top: 5px; right: 5px; background: #dc3545; color: white; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.7em; box-shadow: 0 2px 4px rgba(0,0,0,0.3); z-index: 2;">
                                    ${Math.round(avgCount)}
                                </div>
                                
                                <!-- Green badge: Deck Count (top-left) - only show if > 0 -->
                                ${deckCount > 0 ? `<div style="position: absolute; top: 5px; left: 5px; background: #28a745; color: white; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.7em; box-shadow: 0 2px 4px rgba(0,0,0,0.3); z-index: 2;">${deckCount}</div>` : ''}
                                
                                <!-- Card info section -->
                                <div class="card-info-bottom" style="padding: 5px; background: white; font-size: 0.7em; text-align: center; min-height: 48px; display: flex; flex-direction: column; justify-content: space-between;">
                                    <div class="card-info-text">
                                        <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; margin-bottom: 1px; color: #333; font-size: 0.58em;">
                                            ${cardName}
                                        </div>
                                        <div style="color: #999; font-size: 0.52em; margin-bottom: 1px;">
                                            ${setCode} ${setNumber}
                                        </div>
                                        <div style="color: #666; font-size: 0.55em; margin-bottom: 1px;">
                                            ${percentage}% | Ø ${avgInUsingDecks}x (${avgCount.toFixed(2)}x)
                                        </div>
                                        <div style="font-weight: 600; color: #333; font-size: 0.58em;">
                                            ${deckCount} / ${decklistCount} Decks
                                        </div>
                                    </div>
                                    
                                    <!-- Action buttons (4 buttons: - ★ € +) -->
                                    <div class="card-action-buttons" style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 2px; margin-top: 4px;">
                                        <button onclick="event.stopPropagation(); removeCardFromDeck('pastMeta', '${cardNameEscaped}')" style="background: #dc3545; color: white; border: none; border-radius: 3px; height: 16px; cursor: pointer; font-weight: bold; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; min-height: unset; min-width: unset;" title="Remove from deck">−</button>
                                        <button onclick="event.stopPropagation(); openRaritySwitcher('${cardNameEscaped}', '${cardNameEscaped}')" style="background: #ffc107; color: #333; border: none; border-radius: 3px; height: 16px; cursor: pointer; font-size: 10px; font-weight: bold; text-align: center; padding: 0; display: flex; align-items: center; justify-content: center; min-height: unset; min-width: unset;" title="Switch rarity/print">★</button>
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
                const cardType = card.getAttribute('data-card-type') || '';
                
                // Check search term filter
                const matchesSearch = searchTerm === '' || cardName.includes(searchTerm);
                
                // Check card type filter
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
                console.warn('⚠️ Grid or table container not found');
                return;
            }
            
            if (!pastMetaCurrentCards || pastMetaCurrentCards.length === 0) {
                alert('❌ Please select a deck first!');
                return;
            }
            
            // Toggle between views
            pastMetaShowGridView = !pastMetaShowGridView;
            
            if (pastMetaShowGridView) {
                if (button) button.textContent = '📋 List View';
            } else {
                if (button) button.textContent = '🖼️ Grid View';
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
                alert('✅ Deck list copied!');
            }).catch(err => {
                console.error('Failed to copy:', err);
                alert('❌ Error copying');
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
            content.innerHTML = '<div class="loading">Lädt Kartendatenbank...</div>';
            
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
                content.innerHTML = '<div class="error">❌ Error loading card database</div>';
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
                            const cardNameLower = card.card_name.toLowerCase();
                            window.playableCardsSet.add(cardNameLower);
                            window.cityLeagueCardsSet.add(cardNameLower); // Add to City League specific set
                        }
                    });
                    console.log(`Loaded ${cityLeagueCards.length} playable cards from City League, unique: ${window.cityLeagueCardsSet.size}`);
                } catch (err) {
                    console.warn('Could not load City League playable cards:', err);
                }
                
                // Load Current Meta Analysis CSV
                try {
                    const currentMetaResponse = await fetch(BASE_PATH + 'current_meta_analysis.csv');
                    const currentMetaText = await currentMetaResponse.text();
                    const currentMetaCards = parseCSV(currentMetaText);
                    currentMetaCards.forEach(card => {
                        if (card.card_name) {
                            window.playableCardsSet.add(card.card_name.toLowerCase());
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
                            window.playableCardsSet.add(card.card_name.toLowerCase());
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
            'PFL': '2026-01-24',  // Poké Pad is in this set
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
                            
                            const cardName = row.card_name.toLowerCase();
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
                            // Multiple prints of the same card might appear, use the MAXIMUM value
                            // (because different prints of the same card are in the same decks)
                            const currentEntry = cardStats.archetypesWithCard.get(archetypeKey);
                            const currentCount = currentEntry ? currentEntry.deckCount : 0;
                            if (deckCountWithThisCard > currentCount) {
                                cardStats.archetypesWithCard.set(archetypeKey, {
                                    deckCount: deckCountWithThisCard,
                                    tournamentDate: tournamentDate,
                                    maxCount: maxCountInDeck,
                                    setCode: row.set_code || null
                                });
                            }
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
            separator.innerHTML = '<strong style="display: block; padding: 6px; color: #555;">📅 Meta-Zeiträume:</strong>';
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
                            <div class="cards-autocomplete-item-meta">${card.set} ${card.number} • ${card.type || 'Unknown'}</div>
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
            
            // Uncheck all checkboxes
            const allCheckboxes = document.querySelectorAll('.cards-filter-options input[type="checkbox"], #mainPokemonList input[type="checkbox"], #archetypeList input[type="checkbox"]');
            allCheckboxes.forEach(cb => cb.checked = false);
            
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
                
                // Search filter
                if (searchTerm && !card.name.toLowerCase().includes(searchTerm)) {
                    failedSearch++;
                    return false;
                }
                
                // Meta/Format filter (Total, All Playables, City League)
                // NOTE: Meta-Zeiträume (meta:XXX) are handled later in "Meta Filter" section
                const basicMetaFilters = selectedMetas.filter(m => !m.startsWith('meta:'));
                if (basicMetaFilters.length > 0) {
                    let metaMatch = false;
                    const cardNameLower = card.name.toLowerCase();
                    
                    if (basicMetaFilters.includes('total')) {
                        metaMatch = true; // Show all cards
                    } else if (basicMetaFilters.includes('all_playables')) {
                        // All playables: City League + Current Meta + Tournament
                        if (window.playableCardsSet && window.playableCardsSet.has(cardNameLower)) {
                            metaMatch = true;
                        }
                    } else if (basicMetaFilters.includes('city_league')) {
                        // City League only: Only cards from City League decks
                        if (window.cityLeagueCardsSet && window.cityLeagueCardsSet.has(cardNameLower)) {
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
                    const cardNameLower = card.name.toLowerCase();
                    const coverageStats = window.cardDeckCoverageMap.get(cardNameLower);
                    
                    if (!coverageStats) {
                        // Card has no deck coverage data
                        failedDeckCoverage++;
                        return false;
                    }
                    
                    // Calculate DYNAMIC coverage based on active filters
                    const dynamicCoverage = calculateDynamicCoverage(card.name);
                    const percentage = dynamicCoverage ? dynamicCoverage.percentage : 0;
                    
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
                    const cardNameLower = card.name.toLowerCase();
                    let mainPokemonMatch = false;
                    
                    for (const mainPokemon of selectedMainPokemons) {
                        if (window.mainPokemonCardsMap && window.mainPokemonCardsMap.has(mainPokemon)) {
                            const cardsForMainPokemon = window.mainPokemonCardsMap.get(mainPokemon);
                            if (cardsForMainPokemon.has(cardNameLower)) {
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
                    const cardNameLower = card.name.toLowerCase();
                    let archetypeMatch = false;
                    
                    for (const archetype of selectedArchetypes) {
                        if (window.archetypeCardsMap && window.archetypeCardsMap.has(archetype)) {
                            const cardsForArchetype = window.archetypeCardsMap.get(archetype);
                            if (cardsForArchetype.has(cardNameLower)) {
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
                    const cardNameLower = card.name.toLowerCase();
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
                                if (cardsForMeta.has(cardNameLower)) {
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
                                if (cardsForMeta.has(cardNameLower)) {
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
                    toggleBtn.textContent = '📦 Nur 1 Print (Low Rarity)';
                    toggleBtn.style.background = '#9b59b6';
                    toggleBtn.style.borderColor = '#9b59b6';
                } else {
                    toggleBtn.textContent = '📚 Alle Prints';
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
            }
        }
        
        function renderCardDatabase(cards) {
            const content = document.getElementById('cardsContent');
            const resultsInfo = document.getElementById('cardResultsInfo');
            
            if (cards.length === 0) {
                content.innerHTML = '<div style="text-align: center; padding: 40px; color: #7f8c8d;"><h2>🔍 Keine Karten gefunden</h2><p>Versuche andere Filter-Einstellungen</p></div>';
                resultsInfo.textContent = '0 Karten gefunden';
                return;
            }
            
            // Calculate pagination
            let cardsToShow, totalPages, startIndex, endIndex;
            
            if (showAllCards) {
                cardsToShow = cards;
                totalPages = 1;
                startIndex = 0;
                endIndex = cards.length;
                resultsInfo.textContent = `${cards.length.toLocaleString()} Karten gefunden (Alle angezeigt)`;
            } else {
                totalPages = Math.ceil(cards.length / cardsPerPage);
                startIndex = (currentCardsPage - 1) * cardsPerPage;
                endIndex = Math.min(startIndex + cardsPerPage, cards.length);
                cardsToShow = cards.slice(startIndex, endIndex);
                resultsInfo.textContent = `${cards.length.toLocaleString()} Karten gefunden (Seite ${currentCardsPage} von ${totalPages})`;
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
            copyBtn.textContent = '📋 Kopieren';
            copyBtn.title = 'Alle gefilterten Kartennamen in Zwischenablage kopieren';
            copyBtn.style.cssText = 'padding: 10px 20px; font-size: 14px; border: 2px solid #27ae60; background: white; color: #27ae60; border-radius: 8px; cursor: pointer; font-weight: 600;';
            copyBtn.onclick = () => {
                const cardNames = window.filteredCardsData.map(c => c.name).join('\n');
                navigator.clipboard.writeText(cardNames).then(() => {
                    copyBtn.textContent = '✅ Copied!';
                    copyBtn.style.background = '#27ae60';
                    copyBtn.style.color = 'white';
                    setTimeout(() => {
                        copyBtn.textContent = '📋 Kopieren';
                        copyBtn.style.background = 'white';
                        copyBtn.style.color = '#27ae60';
                    }, 2000);
                }).catch(err => {
                    console.error('Copy failed:', err);
                    alert('Kopieren fehlgeschlagen');
                });
            };
            leftControls.appendChild(copyBtn);
            
            // Center: Pagination controls
            const centerControls = document.createElement('div');
            centerControls.style.cssText = 'display: flex; gap: 10px; align-items: center;';
            
            // Previous button
            const prevBtn = document.createElement('button');
            prevBtn.textContent = '◄ Zurück';
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
                    ellipsis.style.cssText = 'padding: 0 5px; color: #7f8c8d;';
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
            nextBtn.textContent = 'Weiter ►';
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
            toggleShowAllBtn.textContent = showAllCards ? '📄 Seitenweise' : '📑 Alle anzeigen';
            toggleShowAllBtn.title = showAllCards ? 'Zurück zur Seitenansicht' : 'Alle Karten auf einmal anzeigen';
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
            
            // Format price button
            let priceButton = '';
            if (card.eur_price && card.eur_price !== '' && card.eur_price !== '0' && card.eur_price !== 'N/A') {
                const price = parseFloat(card.eur_price.replace(',', '.'));
                if (!isNaN(price)) {
                    priceButton = `<a href="${displayCardMarketUrl}" target="_blank" class="card-database-price-btn" style="display: block; padding: 8px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 6px; text-align: center; font-weight: 700; font-size: 14px; text-decoration: none; cursor: pointer; transition: all 0.2s ease; flex: 1;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(102, 126, 234, 0.4)';" onmouseout="this.style.transform=''; this.style.boxShadow='';" title="View on CardMarket">
                        💰 ${price.toFixed(2).replace('.', ',')} €
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
                const cardNameLower = card.name.toLowerCase();
                const cardCoverageData = window.cardDeckCoverageMap ? window.cardDeckCoverageMap.get(cardNameLower) : null;
                const maxCount = cardCoverageData ? (cardCoverageData.maxCountOverall || 0) : 0;
                
                let coverageColor = '#95a5a6'; // Gray for < 50%
                let coverageIcon = '📊';
                
                if (percentage >= 99.5) {
                    coverageColor = '#e74c3c'; // Red for 100%
                    coverageIcon = '💯';
                } else if (percentage >= 90) {
                    coverageColor = '#e67e22'; // Orange for ≥90%
                    coverageIcon = '🔥';
                } else if (percentage >= 70) {
                    coverageColor = '#f39c12'; // Yellow for ≥70%
                    coverageIcon = '⭐';
                } else if (percentage >= 50) {
                    coverageColor = '#3498db'; // Blue for ≥50%
                    coverageIcon = '📈';
                }
                
                // Format the display with max count
                const maxCountText = maxCount > 0 ? ` • Max: ${maxCount}x` : '';
                
                coverageDisplay = `<div class="card-database-coverage" style="margin-top: 8px; padding: 8px; background: ${coverageColor}; color: white; border-radius: 6px; text-align: center; font-weight: 600; font-size: 13px;" title="${deckCount} Decks / ${archetypeCount} Archetypes${maxCount > 0 ? ' • Max: ' + maxCount + 'x copies per deck' : ''}">
                    ${coverageIcon} ${percentage.toFixed(1)}% Coverage${maxCountText}
                </div>`;
            }
            
            item.innerHTML = `
                <img src="${escapedImageUrl}" alt="${displayName}" loading="lazy" onclick="showImageView('${escapedImageUrl}', '${escapedName}')">
                <div class="card-database-info">
                    <div class="card-database-name">${displayName}</div>
                    <div class="card-database-meta">
                        <span class="card-database-set">${displaySet} ${displayNumber}</span>
                        <span class="card-database-type">${displayType}</span>
                    </div>
                    <div class="card-database-button-row" style="display: flex; gap: 8px; margin-top: 8px;">
                        ${priceButton}
                        <div class="card-database-rarity-btn ${rarityClass}" onclick='openRaritySwitcherFromDB("${escapedName}", "${displaySet}", "${displayNumber}")' style="display: block; padding: 8px; color: white; border-radius: 6px; text-align: center; font-weight: 700; font-size: 14px; cursor: pointer; transition: all 0.2s ease; flex: 1;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(0, 0, 0, 0.3)';" onmouseout="this.style.transform=''; this.style.boxShadow='';" title="View all prints for ${displayRarity}">
                            ${displayRarity} 🔄
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
            
            const cardNameLower = cardName.toLowerCase();
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
                        console.log(`[Coverage Debug Hawlucha Count] → ${archetypeKey}: deckCount=${deckCount}, tournamentDate=${entry.tournamentDate || 'N/A'}, entrySetCode=${entrySetCode}, releaseDate=${entryReleaseDate ? entryReleaseDate.toISOString().split('T')[0] : 'NULL'}`);
                    }
                    
                    // Temporal filtering: Use the entry's specific set code release date
                    // Only filter if we have BOTH a card release date AND a tournament date
                    // City League data often has NO tournament_date, so we treat it as "current meta"
                    if (entryReleaseDate && tournamentDate) {
                        if (tournamentDate < entryReleaseDate) {
                            if (cardNameLower === 'hawlucha') {
                                console.log(`[Coverage Debug Hawlucha Count] ✗ FILTERED OUT: ${archetypeKey} (tournament ${tournamentDate.toISOString().split('T')[0]} < release ${entryReleaseDate.toISOString().split('T')[0]})`);
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
            if (cardNameLower.includes('dragapult') || cardNameLower.includes('poké pad') || cardNameLower.includes('poke pad')) {
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
                currentCard = window.allCardsDatabase.find(c => 
                    c.name === actualCardName && c.set === currentSet && c.number === currentNumber
                );
            }
            
            // Fallback: If no SET/NUMBER available, find the card with HIGHEST RARITY and MOST international_prints
            // This ensures we get the complete list AND prefer special versions (e.g., MEP Promos over Common prints)
            if (!currentCard && window.allCardsDatabase) {
                const candidateCards = window.allCardsDatabase.filter(c => 
                    c.name === actualCardName && c.type && c.type.trim() !== '' && c.international_prints
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
                    const fallbackCard = window.allCardsDatabase.find(c => 
                        c.name === actualCardName && c.type && c.type.trim() !== ''
                    );
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
                        return intPrintSet.has(cardId) && card.name === actualCardName;
                    });
                    
                    console.log(`[Pokemon Card] Found ${versions.length} international prints from Limitless data`);
                    console.log(`[Pokemon Card] Int. Print IDs:`, intPrintIds);
                } else {
                    // No international_prints data available - show only current card
                    versions = currentCard ? [currentCard] : [];
                    console.warn(`[Pokemon Card] No international_prints data available, showing only current version`);
                    if (versions.length === 1 && currentCard) {
                        alert(`⚠️ International Print Daten für diese Karte noch nicht verfügbar.\n\nBitte All Cards Scraper neu laufen lassen mit international_prints Support.`);
                    }
                }
            } else {
                // TRAINER/ENERGY CARDS: Use name-based matching
                // All versions with same name are functionally identical (reprints)
                if (window.cardsByNameMap && window.cardsByNameMap[actualCardName]) {
                    versions = window.cardsByNameMap[actualCardName].slice();
                    console.log(`[Trainer/Energy] Found ${versions.length} reprints via name matching`);
                } else if (window.allCardsDatabase) {
                    versions = window.allCardsDatabase.filter(card => card.name === actualCardName);
                    console.log(`[Trainer/Energy] Found ${versions.length} reprints via direct search`);
                } else {
                    versions = currentCard ? [currentCard] : [];
                }
            }
            
            // Filter to English sets only if we have the set mapping
            if (window.englishSetCodes && window.englishSetCodes.size > 0) {
                versions = versions.filter(version => window.englishSetCodes.has(version.set));
                console.log(`[openRaritySwitcher] After English filter: ${versions.length} versions`);
            }
            
            // Filter to only show cards with COMPLETE data
            // Special handling: Pokemon cards found via international_prints are trusted (Limitless data is reliable)
            // For Trainer/Energy (name-based matching), apply strict filter to avoid showing incomplete reprints
            const beforeCompleteFilter = versions.length;
            if (!isPokemonCard) {
                // TRAINER/ENERGY: Strict filter - must have rarity, image_url, and international_prints
                versions = versions.filter(version => {
                    const hasRarity = version.rarity && version.rarity.trim() !== '';
                    const hasImageUrl = version.image_url && version.image_url.trim() !== '';
                    const hasIntPrints = version.international_prints && version.international_prints.trim() !== '';
                    return hasRarity && hasImageUrl && hasIntPrints;
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
                alert(`Keine vollständigen Versionen für "${actualCardName}" gefunden.\n\nMögliche Gründe:\n- Karte nicht vollständig in Datenbank (fehlt Rarity/Image URL/Int. Prints)\n- All Cards Scraper muss noch Daten ergänzen\n- Nur japanische Sets verfügbar\n\nGesuchter Name: "${actualCardName}"\n\nTipp: Warte bis All Cards Scraper fertig ist.`);
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
                const imageUrl = version.image_url || buildCardImageUrl(version.set, version.number, version.rarity);
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
                        <div style="font-size: 11px; color: #999;">Rarity: ${version.rarity || 'N/A'}</div>
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
                alert(`❌ Cardmarket Link nicht verfügbar für ${cardName}\n\nMögliche Gründe:\n- Price Scraper noch nicht gelaufen\n- Karte hat keine Cardmarket Daten\n\nBitte RUN_PRICE_SCRAPER.bat ausführen.`);
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

        // Initialize
        document.addEventListener('DOMContentLoaded', () => {
            const lastUpdate = localStorage.getItem('lastScraperUpdate') || new Date().toLocaleDateString('de-DE');
            document.getElementById('last-update').textContent = lastUpdate;
            
            // Load all cards database for deck builder
            loadAllCardsDatabase();
            loadAceSpecsList();
            loadSetMapping();
            loadRarityPreferences();
            
            // Load first tab automatically
            loadCityLeagueData();
            window.cityLeagueLoaded = true;
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
            
            select.innerHTML = '<option value="">-- Bitte Deck auswählen --</option>';
            
            if (top10.length > 0) {
                const optgroup = document.createElement('optgroup');
                optgroup.label = '🔥 Top 10 Meta Decks';
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
                optgroup.label = '📋 Alle Decks';
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
                    'all': 'Alle Turniere',
                    'live': 'Nur Limitless Decks',
                    'play': 'Nur Major Tournament Decks'
                };
                statusEl.textContent = `Filter aktiv: ${labels[format]}`;
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
                    console.log('⚠️ Previously selected archetype not available in this filter');
                }
            } else {
                console.warn('⚠️ No deck selected - filter saved for when deck is selected');
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
                alert(`Keine Daten für ${archetype} mit Filter "${currentMetaFormatFilter}" gefunden!`);
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
            console.log('🔍 Rendering matchups for:', archetype);
            const deckStats = window.currentMetaDeckStats || [];
            const matchupsSection = document.getElementById('currentMetaMatchupsSection');
            const bestTable = document.getElementById('currentMetaBestMatchups');
            const worstTable = document.getElementById('currentMetaWorstMatchups');
            const titleEl = document.getElementById('currentMetaMatchupsTitle');
            
            // Find the matchup tables directly from the loaded HTML content (1:1 same as Current Meta Tab)
            const currentMetaContent = document.getElementById('currentMetaContent');
            if (!currentMetaContent) {
                console.error('❌ Current Meta content not loaded');
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
                    console.log(`✅ Found HTML section for: ${archetype}`);
                    break;
                }
            }
            
            if (!matchingSection) {
                console.error(`❌ No HTML matchup section found for: ${archetype}`);
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
                console.error(`❌ No matchup tables found in section for: ${archetype}`);
                matchupsSection.style.display = 'none';
                return;
            }
            
            const allTablesInGrid = tablesGrid.querySelectorAll('table');
            if (allTablesInGrid.length < 2) {
                console.error(`❌ Expected 2 tables (best/worst), found: ${allTablesInGrid.length}`);
                matchupsSection.style.display = 'none';
                return;
            }
            
            const bestMatchupsTable = allTablesInGrid[0]; // First table = Best Matchups
            const worstMatchupsTable = allTablesInGrid[1]; // Second table = Worst Matchups
            
            console.log(`✅ Extracted matchup tables from HTML for: ${archetype}`);
            
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
                bestTable.innerHTML = bestHtml || '<tr><td colspan="3" style="text-align: center; padding: 20px;">Keine Daten verfügbar</td></tr>';
            } else {
                bestTable.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px;">Keine Daten verfügbar</td></tr>';
            }
            
            if (worstTbody) {
                // Copy all <tr> rows except the header row
                const worstRows = Array.from(worstMatchupsTable.querySelectorAll('tr')).slice(1); // Skip header
                let worstHtml = '';
                worstRows.forEach(row => {
                    worstHtml += row.outerHTML;
                });
                worstTable.innerHTML = worstHtml || '<tr><td colspan="3" style="text-align: center; padding: 20px;">Keine Daten verfügbar</td></tr>';
            } else {
                worstTable.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px;">Keine Daten verfügbar</td></tr>';
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
                dropdown.innerHTML = '<div style="padding: 10px; color: #999;">Keine Opponents verfügbar</div>';
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
                    <h4 style="margin-top: 0; color: #2c3e50;">📊 Matchup: vs ${opponent}</h4>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-top: 10px;">
                        <div>
                            <strong style="color: #666;">Win Rate:</strong><br>
                            <span style="font-size: 1.5em; color: #3498db;">${winRate}</span>
                        </div>
                        <div>
                            <strong style="color: #666;">Record:</strong><br>
                            <span style="font-size: 1.2em; color: #2c3e50;">${record}</span>
                        </div>
                        <div>
                            <strong style="color: #666;">Total Games:</strong><br>
                            <span style="font-size: 1.5em; color: #2c3e50;">${totalGames}</span>
                        </div>
                    </div>
                `;
                detailsEl.style.display = 'block';
            } else {
                detailsEl.innerHTML = '<p style="color: #999; text-align: center;">Keine Matchup-Daten gefunden</p>';
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
            console.log('🔄 Setting Current Meta overview rarity mode to:', mode);
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
                console.warn('⚠️ No cards available to render - mode saved for when deck is selected');
            }
            
            if (window.currentMetaDeck && Object.keys(window.currentMetaDeck).length > 0) {
                updateDeckDisplay('currentMeta');
            }
        }
        
        // Global helper function to determine card type for filtering and sorting
        function getCardType(name, set, number) {
            // Try to get card from database first
            if (set && number && cardsBySetNumberMap) {
                const key = `${set}-${number}`;
                const dbCard = cardsBySetNumberMap[key];
                
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
                    
                    // Pokémon types (any type starting with element: G Basic, R Stage 1, W Stage 2, etc.)
                    return 'Pokémon';
                }
            }
            
            // FALLBACK: If card not in database, use name-based detection
            console.warn(`[getCardType] Card not found in database: ${name} (${set} ${number}), using fallback detection`);
            
            // 1. Check if it's energy
            if (isBasicEnergy(name)) return 'Energy';
            if (name.includes('Energy')) return 'Energy';
            
            // 2. Check for Ace Spec (special items - highest priority)
            if (isAceSpec(name)) return 'Ace Spec';
            
            // 3. Check for Tools (Pokémon Tools attached to Pokémon)
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
            
            // 7. Check for Pokémon with ex/GX/V suffix
            if (/\s(ex|GX|V|VMAX|VSTAR|BREAK)$/i.test(name)) {
                return 'Pokémon';
            }
            
            // 8. Default: assume Pokémon
            return 'Pokémon';
        }
        
        // Render grid view
        function renderCurrentMetaDeckGrid(cards) {
            console.log('🎨 renderCurrentMetaDeckGrid called with:', cards.length, 'cards');
            const visualContainer = document.getElementById('currentMetaDeckVisual');
            const gridContainer = document.getElementById('currentMetaDeckGrid');
            if (!gridContainer) return;
            
            const sortedCards = sortCardsByType([...cards]);
            const currentDeck = window.currentMetaDeck || {};
            
            let html = '';
            sortedCards.forEach(card => {
                const cardName = card.card_name;
                const cardNameEscaped = cardName.replace(/'/g, "\\'");
                const originalSetCode = card.set_code || '';
                const originalSetNumber = card.set_number || '';
                
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
                    
                    // ALWAYS get image_url from allCardsDatabase first
                    let imageUrl = '';
                    if (setCode && setNumber && allCardsDatabase) {
                        const dbCard = allCardsDatabase.find(c => c.set === setCode && c.number === setNumber);
                        if (dbCard && dbCard.image_url) {
                            imageUrl = dbCard.image_url;
                        } else if (displayCard.image_url) {
                            imageUrl = displayCard.image_url;
                        } else {
                            // Last resort: build URL
                            imageUrl = buildCardImageUrl(setCode, setNumber, displayCard.rarity || 'C');
                        }
                    } else if (displayCard.image_url) {
                        imageUrl = displayCard.image_url;
                    }
                    imageUrl = fixJapaneseCardImageUrl(imageUrl, setCode, cardName);
                    const percentage = parseFloat(card.percentage_in_archetype || 0).toFixed(1);
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
                    
                    const decksWithCard = parseInt(card.deck_count || 0);
                    const totalDecksInArchetype = parseInt(card.total_decks_in_archetype || 1);
                    const totalCount = parseInt(card.total_count || 0);
                    const avgCountOverall = totalDecksInArchetype > 0 ? (totalCount / totalDecksInArchetype).toFixed(2) : '0.00';
                    const avgCountInUsedDecks = decksWithCard > 0 ? (totalCount / decksWithCard).toFixed(2) : '0.00';
                    
                    let eurPrice = '';
                    let cardmarketUrl = '';
                    if (setCode && setNumber && allCardsDatabase) {
                        // Try exact match first
                        let priceCard = allCardsDatabase.find(c => c.set === setCode && c.number === setNumber);
                        
                        // If no exact match, try with normalized numbers (remove leading zeros)
                        if (!priceCard) {
                            const normalizedNumber = setNumber.replace(/^0+/, '') || '0';
                            priceCard = allCardsDatabase.find(c => 
                                c.set === setCode && (c.number === normalizedNumber || c.number === setNumber)
                            );
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
                    
                    html += `
                        <div class="card-item" data-card-name="${cardName.toLowerCase()}" data-card-type="${filterCategory}" style="position: relative; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.15); cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; background: white;">
                            <div class="card-image-container" style="position: relative; width: 100%;">
                                <img src="${imageUrl}" alt="${cardName}" loading="lazy" referrerpolicy="no-referrer" style="width: 100%; aspect-ratio: 2.5/3.5; object-fit: cover; cursor: zoom-in;" onerror="this.style.opacity='0.3'" onclick="event.stopPropagation(); showSingleCard('${imageUrl}', '${cardNameEscaped}');">
                                <div style="position: absolute; top: 5px; right: 5px; background: #dc3545; color: white; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.7em; box-shadow: 0 2px 4px rgba(0,0,0,0.3); z-index: 2;">${maxCount}</div>
                                ${deckCount > 0 ? `<div style="position: absolute; top: 5px; left: 5px; background: #28a745; color: white; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.7em; box-shadow: 0 2px 4px rgba(0,0,0,0.3); z-index: 2;">${deckCount}</div>` : ''}
                                
                                <!-- Card info section - Mobile Overlay -->
                                <div class="card-info-bottom" style="padding: 5px; background: white; font-size: 0.7em; text-align: center; min-height: 48px; display: flex; flex-direction: column; justify-content: space-between;">
                                    <div class="card-info-text">
                                        <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; margin-bottom: 1px; color: #333; font-size: 0.58em;">${cardName}</div>
                                        <div style="color: #999; font-size: 0.52em; margin-bottom: 1px;">${setCode} ${setNumber}</div>
                                        <div style="color: #666; font-size: 0.55em; margin-bottom: 1px;">${percentage}% | Ø ${avgCountInUsedDecks}x (${avgCountOverall}x)</div>
                                    </div>
                                    <!-- Rarity Switcher & Actions (4 buttons: - ★ € +) -->
                                    <div class="card-action-buttons" style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 2px; margin-top: 4px;">
                                        <button onclick="event.stopPropagation(); removeCardFromDeck('currentMeta', '${cardNameEscaped}')" style="background: #dc3545; color: white; border: none; border-radius: 3px; height: 16px; cursor: pointer; font-weight: bold; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; min-height: unset; min-width: unset;">−</button>
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
            
            const sortedCards = sortCardsByType([...cards]);
            const currentDeck = window.currentMetaDeck || {};
            
            let html = '<div style="display: flex; flex-direction: column; gap: 15px;">';
            sortedCards.forEach(card => {
                const cardName = card.card_name;
                let displayCard = card;
                const allCards = window.allCardsDatabase || [];
                const allVersions = allCards.filter(c => c.name === cardName && c.set && c.number);
                
                if (currentMetaRarityMode !== 'all' && allVersions.length > 0) {
                    const SET_ORDER = {
                        'M3': 116, 'ASC': 115, 'PFL': 114, 'MEG': 113, 'MEE': 112, 'MEP': 111,
                        'BLK': 110, 'WHT': 109, 'DRI': 108, 'JTG': 107, 'PRE': 106, 'SSP': 105,
                        'MEG': 105, 'MEP': 104, 'SP': 103, 'SVE': 102,
                        'SCR': 101, 'TWM': 100, 'TEF': 99, 'PAR': 98, 'PAF': 97, 'PAL': 96, 'OBF': 95,
                        'MEW': 94, 'SVI': 93, 'CRZ': 92, 'SIT': 91, 'LOR': 90, 'PGO': 89
                    };
                    
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
                
                const imageUrl = fixJapaneseCardImageUrl(displayCard.image_url || '', displayCard.set_code, cardName);
                const percentage = parseFloat(card.percentage_in_archetype || 0).toFixed(1);
                const maxCount = parseInt(card.max_count) || card.max_count || '?';
                const cardNameEscaped = cardName.replace(/'/g, "\\'");
                const setCode = displayCard.set_code || '';
                const setNumber = displayCard.set_number || '';
                
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
                
                const decksWithCard = parseInt(card.deck_count || 0);
                const totalDecksInArchetype = parseInt(card.total_decks_in_archetype || 1);
                const totalCount = parseInt(card.total_count || 0);
                const avgCountOverall = totalDecksInArchetype > 0 ? (totalCount / totalDecksInArchetype).toFixed(2) : '0.00';
                const avgCountInUsedDecks = decksWithCard > 0 ? (totalCount / decksWithCard).toFixed(2) : '0.00';
                
                html += `
                    <div class="card-table-row" data-card-name="${cardName.toLowerCase()}" style="display: flex; align-items: center; background: white; border-radius: 8px; padding: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); gap: 20px;">
                        <div style="flex-shrink: 0; position: relative; width: 120px;">
                            <img src="${imageUrl}" alt="${cardName}" loading="lazy" referrerpolicy="no-referrer" style="width: 100%; border-radius: 6px; cursor: zoom-in; aspect-ratio: 2.5/3.5; object-fit: cover;" onerror="this.style.opacity='0.3'" onclick="showSingleCard('${imageUrl}', '${cardNameEscaped}');">
                            ${deckCount > 0 ? `<div style="position: absolute; top: 5px; left: 5px; background: #28a745; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.85em; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${deckCount}</div>` : ''}
                        </div>
                        <div style="flex-grow: 1; min-width: 0;">
                            <h3 style="margin: 0 0 8px 0; font-size: 1.2em; color: #333;">${cardName}</h3>
                            <div style="color: #666; font-size: 0.9em; margin-bottom: 10px;">${setCode} ${setNumber}</div>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin-bottom: 10px;">
                                <div><span style="color: #999; font-size: 0.85em;">Nutzungs Share:</span> <span style="font-weight: 600; color: #333; margin-left: 5px;">${percentage}%</span></div>
                                <div><span style="color: #999; font-size: 0.85em;">Ø in genutzten Decks:</span> <span style="font-weight: 600; color: #333; margin-left: 5px;">${avgCountInUsedDecks}x</span></div>
                                <div><span style="color: #999; font-size: 0.85em;">Ø durch alle Decks:</span> <span style="font-weight: 600; color: #333; margin-left: 5px;">${avgCountOverall}x</span></div>
                                <div><span style="color: #999; font-size: 0.85em;">Deck Count:</span> <span style="font-weight: 600; color: #333; margin-left: 5px;">${decksWithCard} / ${totalDecksInArchetype} Decks</span></div>
                                <div><span style="color: #999; font-size: 0.85em;">Max Count:</span> <span style="font-weight: 600; color: #dc3545; margin-left: 5px;">${maxCount}</span></div>
                            </div>
                        </div>
                        <div style="flex-shrink: 0;">
                            <button class="btn btn-success" style="padding: 10px 20px; font-size: 0.95em;" onclick="addCardToDeck('currentMeta', '${cardNameEscaped}', '${setCode}', '${setNumber}')">Add to Deck</button>
                        </div>
                    </div>
                `;
            });
            html += '</div>';
            
            tableContainer.innerHTML = html;
            tableViewContainer.style.display = 'block';
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
                const cardType = card.getAttribute('data-card-type') || '';
                
                // Check search term filter
                const matchesSearch = searchTerm === '' || cardName.includes(searchTerm);
                
                // Check card type filter
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
                console.warn('⚠️ Grid or table container not found');
                return;
            }
            
            const cards = window.currentCurrentMetaDeckCards;
            if (!cards || cards.length === 0) {
                alert('❌ Please select a deck first!');
                return;
            }
            
            const isGridViewActive = gridViewContainer.style.display !== 'none';
            
            if (isGridViewActive) {
                gridViewContainer.style.display = 'none';
                if (button) button.textContent = '🖼️ Grid View';
            } else {
                tableViewContainer.style.display = 'none';
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
                alert('❌ Keine Karten zum Kopieren!\n\nBitte wähle zuerst einen Archetyp aus.');
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
                alert('✅ Deck copied to clipboard!');
            }).catch(err => {
                console.error('Error copying:', err);
                alert('❌ Error copying to clipboard!');
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
                document.getElementById('deckCompareResult').innerHTML = '<div class="loading">⏳ Loading card database...</div>';
                document.getElementById('deckCompareResult').style.display = 'block';
                
                try {
                    await loadAllCardsDatabase();
                    console.log('[Deck Compare] ✅ Database loaded successfully');
                    document.getElementById('deckCompareResult').style.display = 'none';
                } catch (error) {
                    console.error('[Deck Compare] Failed to load database:', error);
                    document.getElementById('deckCompareResult').innerHTML = '<div class="error">❌ Error loading card database</div>';
                    return;
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
                    console.log(`[areSameInternationalPrint] ✓ Basic Energy match: ${set1} ${number1} ↔ ${set2} ${number2} (${card1.name})`);
                    return true;
                }
            }
            
            // Get all international prints for card 1
            const prints1 = getInternationalPrintsForCard(set1, number1);
            
            // Check if card 2 is in the international prints of card 1
            if (prints1 && prints1.length > 0) {
                const match = prints1.some(p => p.set === set2 && p.number === number2);
                if (match) {
                    console.log(`[areSameInternationalPrint] ✓ Match found: ${set1} ${number1} ↔ ${set2} ${number2}`);
                    return true;
                }
            }
            
            // Also check in reverse direction (card 2 -> card 1)
            const prints2 = getInternationalPrintsForCard(set2, number2);
            if (prints2 && prints2.length > 0) {
                const match = prints2.some(p => p.set === set1 && p.number === number1);
                if (match) {
                    console.log(`[areSameInternationalPrint] ✓ Match found (reverse): ${set1} ${number1} ↔ ${set2} ${number2}`);
                    return true;
                }
            }
            
            console.log(`[areSameInternationalPrint] ✗ No match: ${set1} ${number1} vs ${set2} ${number2}`);
            return false;
        }

        function compareDeckLists() {
            const oldDeckText = document.getElementById('oldDeckListInput').value.trim();
            
            if (!oldDeckText) {
                alert('⚠️ Bitte füge eine alte Deckliste ein!');
                return;
            }
            
            if (!currentDeckSource) {
                alert('⚠️ Fehler: Keine Deck-Quelle ausgewählt!');
                return;
            }
            
            // Check if card database is loaded
            if (!cardsBySetNumberMap || Object.keys(cardsBySetNumberMap).length === 0) {
                console.error('[deckCompare] ERROR: cardsBySetNumberMap not loaded!');
                alert('⚠️ Fehler: Kartendatenbank noch nicht geladen! Bitte warte einen Moment und versuche es erneut.');
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
                alert('⚠️ Fehler: Aktuelles Deck ist leer!');
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
                    if (old.set && old.number && newCard.set && newCard.number &&
                        areSameInternationalPrint(old.set, old.number, newCard.set, newCard.number)) {
                        oldCard = old;
                        break;
                    }
                }
                
                const oldCount = oldCard ? oldCard.count : 0;
                let changeType;
                if (oldCount === 0) changeType = 'added';
                else if (oldCount === newCard.count) changeType = 'unchanged';
                else if (newCard.count > oldCount) changeType = 'increased';
                else changeType = 'decreased';
                
                allDisplayCards.push({
                    name: newCard.name,
                    set: newCard.set,
                    number: newCard.number,
                    oldCount: oldCount,
                    newCount: newCard.count,
                    changeType: changeType
                });
            }
            
            console.log('[deckCompare] All display cards:', allDisplayCards);
            
            // Get card images from database
            const allCardsDb = window.allCardsDatabase || [];
            
            function getCardImage(set, number, name) {
                if (!set || !number) return null;
                
                // Try exact match first
                let card = allCardsDb.find(c => c.set === set && c.number === number);
                if (card && card.image_url && card.image_url.trim() !== '') {
                    return card.image_url;
                }
                
                // If no image, try international prints
                const intPrints = getInternationalPrintsForCard(set, number);
                if (intPrints && intPrints.length > 0) {
                    for (const print of intPrints) {
                        if (print.image_url && print.image_url.trim() !== '') {
                            console.log(`[deckCompare] Using international print image for ${name}: ${print.set} ${print.number} instead of ${set} ${number}`);
                            return print.image_url;
                        }
                    }
                }
                
                return null;
            }
            
            // Note: getCardType() is now defined globally above renderCurrentMetaDeckGrid()
            
            // Sort cards by type
            const typeOrder = {'Pokémon': 0, 'Supporter': 1, 'Ace Spec': 2, 'Item': 3, 'Tool': 4, 'Stadium': 5, 'Energy': 6};
            allDisplayCards.sort((a, b) => {
                const typeA = getCardType(a.name, a.set, a.number);
                const typeB = getCardType(b.name, b.set, b.number);
                const orderDiff = typeOrder[typeA] - typeOrder[typeB];
                if (orderDiff !== 0) return orderDiff;
                // Within same type, sort by name
                return a.name.localeCompare(b.name);
            });
            
            // Generate result HTML with all cards in one view
            let html = '<div style="margin-top: 20px;">';
            
            if (allDisplayCards.length === 0) {
                html += '<p style="text-align: center; color: #999; font-size: 1.2em;">✅ Die Decks sind identisch!</p>';
            } else {
                // Summary
                const totalRemoved = allDisplayCards.filter(c => c.changeType === 'removed' || c.changeType === 'decreased')
                    .reduce((sum, c) => sum + (c.changeType === 'removed' ? c.oldCount : c.oldCount - c.newCount), 0);
                const totalAdded = allDisplayCards.filter(c => c.changeType === 'added' || c.changeType === 'increased')
                    .reduce((sum, c) => sum + (c.changeType === 'added' ? c.newCount : c.newCount - c.oldCount), 0);
                
                html += `<div style="display: flex; justify-content: space-around; margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                            <div style="text-align: center;">
                                <div style="font-size: 2em; font-weight: bold; color: #dc3545;">−${totalRemoved}</div>
                                <div style="color: #666;">Cards out</div>
                            </div>
                            <div style="text-align: center;">
                                <div style="font-size: 2em; font-weight: bold; color: #28a745;">+${totalAdded}</div>
                                <div style="color: #666;">Cards in</div>
                            </div>
                         </div>`;
                
                // Group cards by type for display
                const cardsByType = {};
                allDisplayCards.forEach(card => {
                    const type = getCardType(card.name, card.set, card.number);
                    if (!cardsByType[type]) cardsByType[type] = [];
                    cardsByType[type].push(card);
                });
                
                // Display each type group
                const typeIcons = {'Pokémon': '🎴', 'Supporter': '👤', 'Ace Spec': '⭐', 'Item': '⚙️', 'Tool': '🔧', 'Stadium': '🏟️', 'Energy': '⚡'};
                const orderedTypes = ['Pokémon', 'Supporter', 'Ace Spec', 'Item', 'Tool', 'Stadium', 'Energy'];
                
                orderedTypes.forEach(type => {
                    if (!cardsByType[type] || cardsByType[type].length === 0) return;
                    
                    html += `<h3 style="margin: 20px 0 15px 0; color: #333;">${typeIcons[type]} ${type} (${cardsByType[type].length} Karten)</h3>`;
                    html += '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px;">';
                    
                    cardsByType[type].forEach(card => {
                        const imageUrl = getCardImage(card.set, card.number, card.name);
                        
                        // Determine badge style and text based on change type
                        let badgeHTML = '';
                        if (card.changeType !== 'unchanged') {
                            let badgeStyle, badgeText;
                            if (card.changeType === 'added') {
                                badgeStyle = 'background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%); color: #000;';
                                badgeText = `new → ${card.newCount}`;
                            } else if (card.changeType === 'removed') {
                                badgeStyle = 'background: #dc3545; color: white;';
                                badgeText = `${card.oldCount} → out`;
                            } else if (card.changeType === 'increased') {
                                badgeStyle = 'background: #28a745; color: white;';
                                badgeText = `${card.oldCount} → ${card.newCount}`;
                            } else { // decreased
                                badgeStyle = 'background: #dc3545; color: white;';
                                badgeText = `${card.oldCount} → ${card.newCount}`;
                            }
                            
                            badgeHTML = `<div style="position: absolute; top: 5px; left: 5px; ${badgeStyle} border-radius: 12px; padding: 4px 8px; font-weight: bold; font-size: 0.85em; box-shadow: 0 2px 4px rgba(0,0,0,0.3); white-space: nowrap;">
                                            ${badgeText}
                                         </div>`;
                        } else {
                            // Unchanged cards - show count in neutral badge
                            badgeHTML = `<div style="position: absolute; top: 5px; left: 5px; background: #6c757d; color: white; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1em; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
                                            ${card.newCount}
                                         </div>`;
                        }
                        
                        html += `<div style="position: relative; border: 2px solid #ddd; border-radius: 8px; overflow: hidden; background: white;">`;
                        
                        if (imageUrl) {
                            html += `<img src="${imageUrl}" alt="${card.name}" style="width: 100%; aspect-ratio: 2.5/3.5; object-fit: cover;" onerror="this.style.display='none'">`;
                        } else {
                            html += `<div style="width: 100%; aspect-ratio: 2.5/3.5; display: flex; align-items: center; justify-content: center; background: #f0f0f0; color: #999;">No Image</div>`;
                        }
                        
                        html += badgeHTML;
                        
                        html += `<div style="padding: 5px; font-size: 0.75em; text-align: center; background: white;">
                                    <div style="font-weight: 600; margin-bottom: 2px;">${card.name}</div>
                                    <div style="color: #999; font-size: 0.9em;">${card.set} ${card.number}</div>
                                 </div>`;
                        
                        html += `</div>`;
                    });
                    
                    html += '</div>'; // Close grid
                });
            }
            
            html += '</div>';
            
            const resultDiv = document.getElementById('deckCompareResult');
            resultDiv.innerHTML = html;
            resultDiv.style.display = 'block';
        }