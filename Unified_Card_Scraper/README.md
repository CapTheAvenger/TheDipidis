# Unified Card Scraper - Test & Anleitung

## 🎯 Was macht der Scraper?

Der `unified_card_scraper.py` sammelt Pokemon-Kartendaten aus 3 Quellen:

1. **Tournament Scraper** (labs.limitlesstcg.com)
   - ✅ Liefert **vollständige Kartenlisten** mit Set/Nummer
   - Dies ist die HAUPTQUELLE für Kartendaten

2. **City League Scraper** 
   - ℹ️ Liefert nur **Archetype-Namen** (keine Karten)
   - Nutze für Archetype-Tracking

3. **Limitless Online Scraper**
   - ℹ️ Liefert nur **Deck-Statistiken** (keine Karten)
   - Nutze für Matchup-Daten

## 📋 Anforderungen

### Dateien im `source` Ordner:
- ✅ `unified_card_scraper.py` (Haupt-Scraper)
- ✅ `unified_card_settings.json` (Konfiguration)
- ✅ `all_cards_database.csv` (Karten-Datenbank für Set/Nummer Lookup)
- ✅ `city_league_archetype_scraper.py`
- ✅ `limitless_online_scraper.py`
- ✅ `card_type_lookup.py`

## ⚙️ Konfiguration (unified_card_settings.json)

```json
{
    "sources": {
        "city_league": {
            "enabled": true,
            "start_date": "24.01.2026",
            "end_date": "25.01.2026",
            "region": "jp"
        },
        "limitless_online": {
            "enabled": true,
            "game": "POKEMON",
            "format": "STANDARD",
            "rotation": "2025",
            "set": "Meg",
            "top_decks": 20
        },
        "tournaments": {
            "enabled": true,
            "max_tournaments": 5,          # ⚠️ Für Test nur 5!
            "max_decks_per_tournament": 10  # ⚠️ Für Test nur 10!
        }
    },
    "delay_between_requests": 1.5,
    "output_file": "unified_card_data.csv"
}
```

## 🚀 Scraper ausführen

```powershell
cd "C:\Users\haush\OneDrive\Desktop\Hausi Scrapen\source"
python unified_card_scraper.py
```

## 📊 Erwartete Ausgabe

Der Scraper erstellt: `unified_card_data.csv`

### CSV-Spalten:
- `archetype` - Deck-Name (z.B. "Charizard ex Pidgeot ex")
- `card_name` - Kartenname
- `card_identifier` - Name + Set + Nummer
- `total_count` - Gesamtanzahl der Karte in allen Decks
- `max_count` - Maximale Anzahl in einem Deck
- `deck_count` - In wie vielen Decks die Karte vorkommt
- `total_decks_in_archetype` - Gesamtzahl der Decks dieses Archetyps
- `percentage_in_archetype` - % der Decks mit dieser Karte
- `set_code` - Set-Code (z.B. "MEG")
- `set_number` - Karten-Nummer (z.B. "006")
- `rarity` - Seltenheit (Common, Rare, etc.)

## 🌐 Website nutzen

Nach dem Scraping:

```powershell
Start-Process "deck_viewer.html"
```

Die Website lädt automatisch:
- `unified_card_data.csv` (Kartendaten)
- `../Limitless_Online_Scraper/limitless_online_decks_comparison.csv` (Matchup-Daten)

## ✨ Features der Website

1. **Deck auswählen** - Dropdown mit allen Archetypes
2. **Filter** - Zeige Karten in >70%, >50% oder alle
3. **Statistiken** - Ranking, Win Rate, Matchups
4. **Deck Builder** - Baue deine 60-Karten-Liste
5. **Export** - Kopiere für Pokemon Live

## 🐛 Troubleshooting

### "City League scraping disabled"
- ℹ️ Normal wenn Module nicht verfügbar
- Tournament Scraper liefert die Kartendaten

### "all_cards_database.csv not found"
- Kopiere `all_cards_database.csv` in den `source` Ordner

### Website zeigt keine Karten
- Prüfe ob `unified_card_data.csv` im `source` Ordner ist
- Öffne Browser-Konsole (F12) für Fehler

## 📝 Wichtige Hinweise

- **Set/Nummer für ALLE Karten**: Pokemon, Trainer UND Energy bekommen Set/Nummer
- **Low Rarity bevorzugt**: Common > Uncommon > Double Rare > Rare
- **Neueste Sets bevorzugt**: MEG > ASC > SP > SCR...
- **Prozentsatz**: Bezieht sich nur auf Decks MIT Kartenlisten (Tournament-Daten)

## 🎮 Test-Lauf

Für einen schnellen Test:

1. Setze in `unified_card_settings.json`:
   - `max_tournaments`: 2
   - `max_decks_per_tournament`: 5

2. Führe Scraper aus:
   ```powershell
   python unified_card_scraper.py
   ```

3. Prüfe Ausgabe:
   - Sollte ~10 Decks scrapen
   - CSV sollte erstellt werden
   - Website sollte Daten anzeigen

Viel Erfolg! 🚀
