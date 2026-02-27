# Pokemon TCG Set List Scraper

## Overview

This scraper automatically extracts the complete Pokemon TCG set list from Limitless TCG and generates the SET_ORDER mapping used in landing.html.

## Why This Exists

The card version selection logic in landing.html relies on `SET_ORDER` to prioritize newer sets over older ones. When new sets are released, we need to update this mapping to ensure the newest card prints are displayed.

Instead of manually maintaining a list of 130+ sets, this scraper automates the process.

## Files

- **set_list_scraper.py** - Main scraper script
- **RUN_SET_LIST_SCRAPER.bat** - Windows batch file to run the scraper
- **data/pokemon_sets_list.csv** - Output CSV with set data
- **data/pokemon_sets_order.js** - Generated SET_ORDER JavaScript object

## Usage

### Quick Start

1. Run the scraper:
   ```
   RUN_SET_LIST_SCRAPER.bat
   ```

2. Check the output files:
   - `data/pokemon_sets_list.csv` - Raw set data
   - `data/pokemon_sets_order.js` - JavaScript mapping

3. Copy the `SET_ORDER` object from `pokemon_sets_order.js` into `landing.html`

### Manual Execution

```bash
python set_list_scraper.py
```

## When to Run

Run this scraper whenever:
- A new Pokemon TCG set is released
- You notice incorrect card versions being displayed
- Limitless TCG updates their set list

## How It Works

1. **Scrapes Limitless TCG** - Loads https://limitlesstcg.com/cards using Selenium
2. **Extracts Set Data** - Parses the set table for:
   - Set code (e.g., "ASC", "PRE", "DRI")
   - Set name (e.g., "Ascended Heroes", "Prismatic Evolutions")
   - Release date
   - Card count
3. **Assigns Order** - Newest sets get highest numbers (ASC = 130, Base Set = 1)
4. **Generates Files**:
   - CSV for data storage/backup
   - JavaScript object ready to paste into landing.html

## Output Format

### CSV (pokemon_sets_list.csv)
```csv
set_code,set_name,release_date,card_count,order
ASC,Ascended Heroes,Jan 2026,150,130
PFL,Perfect Fusion,Dec 2025,145,129
...
```

### JavaScript (pokemon_sets_order.js)
```javascript
const SET_ORDER = {
    // Mega
    'ASC': 130,  // Ascended Heroes
    'PFL': 129,  // Perfect Fusion
    
    // Scarlet & Violet
    'BLK': 127,  // Black Star
    ...
};
```

## Integration with landing.html

The SET_ORDER mapping is used in the card version selection logic:

```javascript
// In selectBestCardVersion()
const setOrder = SET_ORDER[card.set] || 0;

// Higher SET_ORDER = newer set = preferred
versions.sort((a, b) => {
    // Same rarity? Prefer newer set
    if (rarityA === rarityB) {
        const orderA = SET_ORDER[a.set] || 0;
        const orderB = SET_ORDER[b.set] || 0;
        if (orderA !== orderB) return orderB - orderA; // Descending
    }
});
```

## Error Handling

The scraper includes fallback logic for:
- Dynamic content loading (waits for table to load)
- Multiple ways to extract set codes
- Graceful failure with error messages

If scraping fails:
1. Check if Limitless TCG changed their HTML structure
2. Update CSS selectors in the scraper
3. Or manually update SET_ORDER in landing.html

## Dependencies

- Python 3.x
- Selenium WebDriver
- Chrome browser (for headless scraping)

Same dependencies as the other scrapers in this project.

## Notes

- The scraper runs in headless mode (no visible browser)
- Takes ~10-20 seconds depending on internet speed
- Output files are overwritten on each run
- Set order numbers start from 1 (oldest) and increment for each newer set
