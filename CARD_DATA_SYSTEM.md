# Card Data System - Complete Documentation

## Overview

The new Card Data System replaces the old single `dist/all_cards_database.csv` with a modern, dual-database architecture:

- **English Cards** (`data/all_cards_database.csv`) - All international English sets
- **Japanese Cards** (`data/japanese_cards_database.csv`) - Latest 4 Japanese sets
- **CardDataManager** - Unified Python interface for all scrapers and tools
- **landing.html** - Web UI that dynamically loads and uses card data

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    UPDATE PIPELINE                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  all_cards_scraper.py      ──────→  all_cards_database.csv │
│  (English: all sets)                 (1000+ cards)         │
│                                                             │
│  japanese_cards_scraper.py ──────→  japanese_cards_       │
│  (Japanese: 4 latest)                database.csv          │
│                                      (300-500 cards)       │
│                                                             │
│                      ↓                                      │
│            ┌─────────────────────┐                         │
│            │  CardDataManager    │                         │
│            │  (Merge + Dedup)    │                         │
│            └─────────────────────┘                         │
│                      ↓                                      │
│         ┌───────────────────────────┐                      │
│         │  all_cards_merged.csv     │                      │
│         │  all_cards_merged.json    │                      │
│         └───────────────────────────┘                      │
│                      ↓                                      │
│         ┌─────────────────────────────┐                    │
│         │  landing.html               │                    │
│         │  city_league_scraper.py     │                    │
│         │  Other tools                │                    │
│         └─────────────────────────────┘                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## File Structure

```
data/
├── all_cards_database.csv          # English: from all_cards_scraper.py
├── all_cards_database.json         # English: JSON version
├── japanese_cards_database.csv     # Japanese: from japanese_cards_scraper.py
├── japanese_cards_database.json    # Japanese: JSON version
├── all_cards_merged.csv            # Merged deduped combined
└── all_cards_merged.json           # Merged: for landing.html

Root/
├── card_data_manager.py            # Python module (import this)
├── update_cards.py                 # Master scraper control
├── prepare_card_data.py            # Merge & prepare JSON
├── master_update.py                # Full orchestration
├── UPDATE_CARDS.bat                # Windows: Interactive menu
├── UPDATE_CARDS.ps1                # PowerShell: Interactive menu
└── MIGRATION_GUIDE.py              # How to update existing scrapers
```

## Usage

### 1️⃣ Initial Setup (First Time)

```bash
# Option A: Full interactive pipeline
python master_update.py

# Option B: Just scrapers
python update_cards.py --type english --mode full
python update_cards.py --type japanese

# Option C: Windows GUI
UPDATE_CARDS.bat
```

### 2️⃣ Regular Updates

```bash
# English: Auto-detect (incremental if exists, full otherwise)
python update_cards.py --type english

# Japanese: Always full overwrite (4 latest sets)
python update_cards.py --type japanese

# Full pipeline with stats
python master_update.py --no-interactive
```

### 3️⃣ Python Code: Using CardDataManager

```python
from card_data_manager import CardDataManager

# Initialize (automatically loads both databases)
manager = CardDataManager()

# Get stats
stats = manager.get_stats()
print(f"Total cards: {stats['total_cards']}")

# Simple search
cards = manager.search_cards('Boss')

# Advanced search
supporters = manager.search_cards_advanced(
    name='Arven',
    set_code='DRI',
    card_type='Supporter'
)

# Direct lookup by set + number
card = manager.get_card('SP', '251')

# Get all cards
all_cards = manager.get_all_cards()

# Export for inspection
manager.export_merged_csv('data/debug.csv')
```

### 4️⃣ Web: Using in landing.html

The `landing.html` file should load card data like this:

```javascript
// Load merged card database
fetch('data/all_cards_merged.json')
    .then(r => r.json())
    .then(data => {
        window.allCardsDatabase = data.cards;
        console.log(`Loaded ${data.total_cards} cards`);
    });
```

## Migration: Updating Existing Scrapers

### Before (Old way - direct CSV):

```python
import csv

def load_cards():
    cards = []
    with open('dist/all_cards_database.csv', 'r') as f:
        reader = csv.DictReader(f)
        cards = list(reader)
    return cards

card_name = 'Boss\'s Orders'
found = next((c for c in cards if c['name'] == card_name), None)
```

### After (New way - CardDataManager):

```python
from card_data_manager import CardDataManager

def load_cards():
    manager = CardDataManager()
    return manager.get_all_cards()

results = manager.search_cards('Boss\'s Orders')
found = results[0] if results else None
```

### Benefits:

✅ Single source of truth  
✅ Automatic deduplication  
✅ English prioritized, Japanese fallback  
✅ O(1) card lookup by set+number  
✅ Better error handling  
✅ Future-proof for new data sources  

## Database Specifications

### CSV Columns (Standard)

| Column | Type | Example | Notes |
|--------|------|---------|-------|
| `name` | str | "Boss's Orders" | Card name |
| `set` | str | "SP" | Set code (short) |
| `number` | str | "251" | Card number in set |
| `type` | str | "Supporter" | Card type |
| `rarity` | str | "Double Rare" | Rarity designation |
| `image_url` | str | "https://..." | Full image URL (CDN) |

### CSV Column Alignment

✅ **All CSVs use the SAME columns** - No more confusion between `card_name`, `name`, `card_id`, etc.

| Old (❌ Wrong) | New (✅ Correct) |
|---|---|
| `card_name` | `name` |
| `card_id` | `set` + `number` |
| No image URL | `image_url` |

## Scraper Update Schedule

### English Cards

| Setup | Command | Frequency | Time |
|-------|---------|-----------|------|
| First run | `--mode full` | Once | 3-4 hours |
| New set | `--mode incremental` | Monthly | 5-10 min |
| Force refresh | `--mode full` | Rarely | 3-4 hours |

### Japanese Cards

| Setup | Command | Frequency | Time |
|-------|---------|-----------|------|
| Initial | `update_cards.py --type japanese` | Once | 30-45 min |
| Rotation | `update_cards.py --type japanese` | Every 3-4mo | 30-45 min |

Note: Japanese scraper always does *full overwrite* (not incremental) since only 4 latest sets are kept.

## Troubleshooting

### Problem: CardDataManager shows 0 cards

**Solution:** Databases haven't been created yet.
```bash
# Generate them:
python update_cards.py --type english --mode full
python update_cards.py --type japanese
```

### Problem: Japanese cards not appearing

**Solution:** Japanese database doesn't exist or scraper failed.
```bash
# Check if exists:
ls -la data/japanese_cards_database.csv

# If missing, run:
python update_cards.py --type japanese
```

### Problem: Old `dist/` directory still referenced

**Solution:** Update the import/path to use `data/` instead.

Find all uses:
```bash
grep -r "dist/" .
```

Replace with `data/`.

### Problem: Image URLs not loading

**Solution:** Check if the CDN is reachable and image_url column is populated.
```python
from card_data_manager import CardDataManager
manager = CardDataManager()
stats = manager.get_stats()
print(f"With images: {stats['cards_with_image_url']}/{stats['total_cards']}")
```

## Advanced: Custom Queries

### Get all Charizard cards

```python
manager = CardDataManager()
charizards = manager.search_cards('Charizard')
```

### Get all cards from a specific set

```python
set_code = 'DRI'
set_cards = manager.search_cards_advanced(set_code=set_code)
```

### Get all Rare cards from English only (excluding Japanese)

```python
all_cards = manager.get_all_cards()
rare_english = [
    c for c in all_cards 
    if 'Rare' in c.get('rarity', '') 
    and not c.get('_source') == 'japanese'
]
```

### Find cards available only in Japanese

```python
all_cards = manager.get_all_cards()
jp_only = [c for c in all_cards if c.get('_japanese_only')]
```

### Export for offline use

```python
manager = CardDataManager()
manager.export_merged_csv('cards_backup.csv')

# Also available as JSON:
import json
with open('data/all_cards_merged.json', 'r') as f:
    data = json.load(f)
```

## Performance Notes

- **First load:** ~500ms (CSV parsing + indexing)
- **Lookups:** O(1) after indexing
- **Search:** O(n) for substring searches (acceptable with ~1300 cards)
- **Memory:** ~2-3 MB for indexed data

For 10,000+ cards, consider:
- Elasticsearch
- SQLite database
- In-process indexing with caching

## Next Steps

1. ✅ Core infrastructure ready
2. ⏳ Wait for `all_cards_scraper.py` to complete (currently running)
3. 📦 Run `master_update.py` to merge and prepare data
4. 🔄 Update scrapers to use `CardDataManager`
5. 🌐 Update `landing.html` to use merged JSON
6. 📊 Monitor City League data with new infrastructure

## Support

For issues or questions:
1. Check `MIGRATION_GUIDE.py` for specific patterns
2. Run `python card_data_manager.py` for diagnostics
3. Review `master_update.py` for orchestration examples
