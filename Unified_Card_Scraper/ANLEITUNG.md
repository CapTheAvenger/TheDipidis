# 🎴 Unified Card Scraper - Komplett-Paket

## 📦 Inhalt des Ordners

### Ausführbare Dateien:
- **unified_card_scraper.exe** - Hauptprogramm zum Scrapen
- **START_SCRAPER.bat** - Starte den Scraper (Doppelklick)
- **OPEN_WEBSITE.bat** - Öffne die Website (Doppelklick)

### Konfiguration:
- **unified_card_settings.json** - Scraper-Einstellungen
- **all_cards_database.csv** - Karten-Datenbank (Set/Nummer)

### Website:
- **deck_viewer.html** - Deck Viewer & Builder Website

### Dokumentation:
- **README.md** - Diese Datei

## 🚀 Schnellstart

### 1️⃣ Scraper ausführen
- Doppelklick auf **START_SCRAPER.bat**
- Warte bis der Scraper fertig ist
- Output: `unified_card_data.csv`

### 2️⃣ Website öffnen
- Doppelklick auf **OPEN_WEBSITE.bat**
- Wähle ein Deck aus dem Dropdown
- Filtere Karten und baue deine Liste

## ⚙️ Einstellungen anpassen

Öffne `unified_card_settings.json` mit einem Text-Editor:

```json
{
    "sources": {
        "city_league": {
            "enabled": true,              // ✅ AKTIVIERT
            "start_date": "24.01.2026",
            "end_date": "25.01.2026",
            "region": "jp",
            "max_leagues": 5              // Anzahl Leagues
        },
        "limitless_online": {
            "enabled": true,              // ✅ AKTIVIERT
            "top_decks": 10,              // Top N Decks
            "max_lists_per_deck": 5       // Listen pro Deck
        },
        "tournaments": {
            "enabled": true,              // ✅ AKTIVIERT
            "max_tournaments": 3,         // Anzahl Turniere
            "max_decks_per_tournament": 10 // Decks pro Turnier
        }
    },
    "delay_between_requests": 1.0
}
```

### Empfohlene Einstellungen:

**Schneller Test (5-10 Minuten):**
- City League: `max_leagues: 2`
- Limitless: `top_decks: 5`, `max_lists_per_deck: 3`
- Tournaments: `max_tournaments: 2`, `max_decks_per_tournament: 10`

**Normale Nutzung (20-40 Minuten):**
- City League: `max_leagues: 5`
- Limitless: `top_decks: 10`, `max_lists_per_deck: 5`
- Tournaments: `max_tournaments: 5`, `max_decks_per_tournament: 30`

**Vollständige Daten (1-2 Stunden):**
- City League: `max_leagues: 10`
- Limitless: `top_decks: 20`, `max_lists_per_deck: 10`
- Tournaments: `max_tournaments: 20`, `max_decks_per_tournament: 128`

## 📊 Was macht der Scraper?

**ALLE 3 QUELLEN liefern VOLLSTÄNDIGE KARTENLISTEN! 🎉**

1. **City League Scraper** (limitlesstcg.com/tournaments/?region=jp)
   - ✅ **KOMPLETTE Kartenlisten** mit Set/Nummer
   - Pokemon, Trainer UND Energy Karten
   - Japanische City League Turniere

2. **Limitless Online Scraper** (play.limitlesstcg.com/decks)
   - ✅ **KOMPLETTE Kartenlisten** mit Set/Nummer  
   - Pokemon, Trainer UND Energy Karten
   - Online Meta-Decks

3. **Tournament Scraper** (labs.limitlesstcg.com)
   - ✅ **KOMPLETTE Kartenlisten** mit Set/Nummer
   - Pokemon, Trainer UND Energy Karten
   - Internationale Turniere

**Alle 3 Quellen werden kombiniert für maximale Datenmenge!**

## 🌐 Website Features

### Deck Viewer:
- 📊 **Statistiken**: Ranking, Win Rate, Matches
- ✅❌ **Matchups**: Top 5 beste/schlechteste Matchups
- 🔍 **Filter**: Zeige Karten in >70%, >50% oder alle
- 🎯 **Prozentsatz**: Wie oft eine Karte im Archetype vorkommt

### Deck Builder:
- ➕➖ Karten hinzufügen/entfernen
- ⚡ **Auto-Complete**: Automatisch 60 Karten
- 📋 **Export**: Kopiere für Pokemon Live
- 🎮 Interaktive Kartenliste

## 📁 Output-Datei

**unified_card_data.csv** enthält:
- `archetype` - Deck-Name
- `card_name` - Kartenname
- `max_count` - Anzahl im Deck
- `percentage_in_archetype` - % der Decks mit dieser Karte
- `set_code` - Set (z.B. "MEG")
- `set_number` - Nummer (z.B. "006")
- `rarity` - Seltenheit

## 🎯 Wichtige Hinweise

### Set/Nummer für ALLE Karten:
- ✅ Pokemon-Karten
- ✅ Trainer-Karten
- ✅ Energy-Karten

### Low Rarity bevorzugt:
1. Common (beste Wahl)
2. Uncommon
3. Double Rare
4. Rare
5. Art Rare (niedrige Priorität)
6. Ultra Rare (niedrige Priorität)
7. Secret Rare (niedrigste Priorität)

### Neueste Sets bevorzugt:
MEG → ASC → SP → SCR → SSH → MEW → BLK → ...

## 🐛 Problemlösung

### "all_cards_database.csv not found"
→ Stelle sicher, dass die Datei im gleichen Ordner wie die .exe liegt

### Website zeigt keine Daten
→ Führe zuerst den Scraper aus (START_SCRAPER.bat)
→ Prüfe ob `unified_card_data.csv` erstellt wurde

### Scraper ist langsam
→ Reduziere `max_tournaments` in den Settings
→ Reduziere `max_decks_per_tournament`

### Website zeigt keine Matchup-Daten
→ Stelle sicher, dass die folgenden Dateien vorhanden sind:
- `../Limitless_Online_Scraper/limitless_online_decks_comparison.csv` (für internationale Decks)
- `../City_League_Archetype_Scraper/city_league_archetypes_deck_stats.csv` (für japanische Decks)

Die Website priorisiert automatisch City League Daten für japanische Archetypes!

## 📞 Support

Bei Problemen:
1. Prüfe die `unified_card_settings.json`
2. Schaue in die Konsolen-Ausgabe beim Scrapen
3. Öffne Browser-Konsole (F12) für Website-Fehler

## 🎮 Viel Erfolg beim Deck-Building!

Erstellt mit ❤️ für die Pokemon TCG Community
