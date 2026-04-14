// app-price.js — extracted from app.js
// Part of Hausi's Pokemon TCG Analysis

        // ==================== LIVE PRICE FETCHING ====================
        
        let proxyServerAvailable = null;  // null = not checked, true/false = checked
        const PROXY_URL = (typeof PRICE_PROXY_URL !== 'undefined' && PRICE_PROXY_URL) || 'http://localhost:8001';
        const livePriceCache = new Map();  // Cache fuer Live-Preise
        
        async function checkProxyServer() {
            if (proxyServerAvailable !== null) {
                return proxyServerAvailable;
            }
            
            try {
                const response = await fetch(`${PROXY_URL}/health`, { timeout: 2000 });
                proxyServerAvailable = response.ok;
                if (proxyServerAvailable) {
                    devLog('[OK] Live price proxy server is running');
                }
            } catch (e) {
                proxyServerAvailable = false;
                devLog('[INFO] Live price proxy server not running (prices from database)');
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
            // Add modular class for live price state
            buttonElement.classList.add('price-btn-live');
            buttonElement.title = `Live Price: ${price} (Click to buy on Cardmarket)`;
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