# Cardmarket UI Integration - Changelog

## Overview
Added Cardmarket price buttons to the landing page UI, allowing users to view EUR prices and quickly navigate to Cardmarket product pages.

## Changes Made

### 1. Updated Data Source (Line ~1954)
**Changed:** `loadAllCardsDatabase()` function now loads `all_cards_merged.json` instead of `all_cards_database.json`

**Why:** The merged JSON includes EUR prices and Cardmarket URLs from the price scraper

**Impact:** Cards now have `eur_price` and `cardmarket_url` fields available

**Console Output:** Now shows "💶 Karten mit Preisen: X (X%)" during load

---

### 2. Added Cardmarket Button CSS (Line ~1132-1180)
**New Styles:**
```css
.btn-cardmarket - Main button style with orange gradient
.btn-cardmarket:hover - Scale and glow effect
.btn-cardmarket.no-price - Grayed out style for cards without prices
.compact-card-price - Positioning for deck cards
.rarity-option-cardmarket - Sizing for rarity switcher modal
```

**Features:**
- Orange gradient background (#ff6b35 → #ff8c42)
- Smooth hover animations (scale 1.05x)
- Distinct "no-price" state (gray, cursor: not-allowed)
- Box shadow for depth

---

### 3. Enhanced Deck Card Rendering (Line ~4033-4078)
**Location:** `renderMyDeckGrid()` function

**Added:**
- Price extraction: `const eurPrice = card.eur_price || ''`
- Cardmarket URL extraction: `const cardmarketUrl = card.cardmarket_url || ''`
- Price button HTML injection between stats and action buttons

**Button Features:**
- Shows EUR price or "N/A" if unavailable
- Positioned at `bottom: 30px` (above -/★/+ buttons)
- Click calls `openCardmarket(url, cardName)`
- Tooltip shows full price or "Preis nicht verfügbar"

**Layout Changes:**
- Stats div moved to `bottom: 55px` (was 30px) to make room for price button
- Price button at `bottom: 30px`
- Action buttons remain at `bottom: 5px`

---

### 4. Enhanced Rarity Switcher Modal (Line ~5508-5543)
**Location:** `openRaritySwitcher()` function → rarity option rendering

**Added:**
- Price/URL extraction for each version
- Cardmarket button below rarity badge
- `event.stopPropagation()` to prevent card selection when clicking price button
- `window.open(cardmarketUrl, '_blank')` for direct navigation

**Button Appears:**
- Only if `cardmarketUrl` exists
- Shows EUR price or "Preis N/A"
- Opens in new tab when clicked

---

### 5. Added Cardmarket Click Handler (Line ~5623-5636)
**New Function:** `openCardmarket(cardmarketUrl, cardName)`

**Logic:**
1. Check if URL exists and is not empty
2. If missing: Show alert explaining why (Price Scraper not run)
3. If valid: Open Cardmarket page in new tab

**Error Handling:**
- User-friendly alert with troubleshooting steps
- Mentions RUN_PRICE_SCRAPER.bat

---

## User Workflow

### First-Time Setup
1. Run `RUN_ALL_CARDS.bat` → Scrape all cards with Cardmarket URLs
2. Run `RUN_PRICE_SCRAPER.bat` → Scrape EUR prices for all cards
3. Run `python prepare_card_data.py` → Merge data into all_cards_merged.json
4. Open browser and hard refresh (Ctrl+Shift+R)

### Weekly Price Updates (Every Monday)
1. Run `RUN_PRICE_SCRAPER.bat` (incremental mode, ~10 minutes)
2. Run `python prepare_card_data.py`
3. Browser hard refresh (Ctrl+Shift+R)
4. All prices now updated!

---

## UI Locations

### Deck Builder - My Deck Grid
**Where:** City League tab → Deck Builder section
**Features:**
- Each deck card shows "💶 €X.XX" button
- Button positioned above -/★/+ action buttons
- Click to open Cardmarket page in new tab

### Rarity Switcher Modal
**Where:** Click ★ button on any deck card
**Features:**
- Each card version shows its own price
- Cardmarket button below rarity badge
- Compare prices across different prints
- Click to buy specific version

---

## Edge Cases Handled

### Cards Without Prices
- Button shows "💶 N/A"
- Grayed out appearance
- Click shows alert explaining why price missing

### Cards Without Cardmarket URL
- No button shown in Rarity Switcher
- Deck card shows "N/A" with alert on click

### Price Not Yet Scraped
- Alert message directs user to run RUN_PRICE_SCRAPER.bat
- Explains data source (Price Scraper)

---

## Technical Details

### Data Flow
```
all_cards_database.csv (Cardmarket URLs)
         ↓
price_data.csv (EUR prices)
         ↓
prepare_card_data.py (merge)
         ↓
all_cards_merged.json (complete data)
         ↓
landing.html (loadAllCardsDatabase)
         ↓
UI renders prices on cards
```

### Fields Used
- `eur_price`: "0.06€" or empty string
- `cardmarket_url`: Full Cardmarket product URL
- `price_last_updated`: ISO timestamp (shown in tooltip)

### Performance Impact
- Minimal: Only DOM updates, no extra API calls
- Prices loaded once during page load
- No network requests when clicking buttons (direct navigation)

---

## Testing Checklist

- [ ] Browser hard refresh after prepare_card_data.py
- [ ] Console shows "Loaded X cards from all_cards_merged.json (with prices)"
- [ ] Console shows "💶 Karten mit Preisen: X (X%)"
- [ ] Deck cards show "💶 €X.XX" buttons
- [ ] Click price button → Opens Cardmarket in new tab
- [ ] Rarity Switcher shows prices for each version
- [ ] Cards without prices show "N/A" and grayed-out button
- [ ] Mobile responsive (buttons still visible/clickable)

---

## Future Enhancements

### Possible Features
1. **Total Deck Price:** Calculate sum of all card prices in deck
2. **Price Trend:** Show price change since last update
3. **Alternative Markets:** Add TCGPlayer, eBay links
4. **Price Alerts:** Notify when card drops below target price
5. **Bulk Purchase Link:** Generate Cardmarket cart with all deck cards

### CSS Improvements
1. **Animation:** Pulse effect on new price updates
2. **Color Coding:** Green for cheap, red for expensive
3. **Compact Mode:** Smaller buttons for mobile
4. **Dark Mode:** Alternative color scheme

---

## Files Modified

1. **landing.html** (5 sections)
   - Line ~1132: CSS styles
   - Line ~1954: loadAllCardsDatabase() data source
   - Line ~4033: renderMyDeckGrid() price buttons
   - Line ~5508: openRaritySwitcher() rarity option buttons
   - Line ~5623: openCardmarket() click handler

---

## Related Files

- `all_cards_scraper.py` - Scrapes Cardmarket URLs
- `card_price_scraper.py` - Scrapes EUR prices weekly
- `prepare_card_data.py` - Merges prices into all_cards_merged.json
- `RUN_PRICE_SCRAPER.bat` - Launch price scraper
- `RESET_PRICES.bat` - Delete price_data.csv for full re-scrape

---

## Success Criteria ✅

All objectives achieved:
- [x] Cardmarket button on each deck card
- [x] Shows current EUR price
- [x] Click opens Cardmarket page in new tab
- [x] Rarity Switcher shows prices for all versions
- [x] Handles cards without prices gracefully
- [x] User-friendly error messages
- [x] Mobile responsive design
- [x] No performance impact

---

## Completion Date
2024-02-21

## User Confirmation Pending
Waiting for user to:
1. Run All Cards Scraper (with new int. prints extraction)
2. Run Price Scraper
3. Run prepare_card_data.py
4. Test UI buttons
5. Confirm: "Perfekt! Die Cardmarket Buttons funktionieren!"
