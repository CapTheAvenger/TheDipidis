# 📊 Datenquellen für die Website

Die Website kombiniert automatisch Daten aus verschiedenen Quellen:

## 🎴 Kartenlisten (unified_card_data.csv)

**Quelle:** Unified Card Scraper
- Sammelt Karten von City League, Limitless Online & Tournaments
- Zeigt: Kartenname, Set, Nummer, Prozentsatz im Archetyp

## 📈 Statistiken & Matchups

### Für **internationale Decks**:
**Quelle:** `Limitless_Online_Scraper/limitless_online_decks_comparison.csv`
- Zeigt: Ranking, Win Rate, Matches
- Top/Worst Matchups vs Top 20
- Balance: Wins/Losses vs Top 20

### Für **japanische Decks** (City League):
**Quelle:** `City_League_Archetype_Scraper/city_league_archetypes_deck_stats.csv`
- Zeigt: Auftritte, Ø Platzierung, Beste Platzierung
- Turniere in denen das Deck auftrat
- Keine Matchup-Daten (City League trackt nur Platzierungen)

## 🧠 Intelligente Auswahl

Die Website wählt automatisch die beste Datenquelle:

1. **City League Daten** werden bevorzugt für:
   - Decks mit japanischen Namen
   - Mega-Pokemon Decks
   - Archetypes die in JP-Turnieren häufig sind

2. **Limitless Online Daten** werden genutzt für:
   - Internationale Meta-Decks
   - Decks ohne City League Daten
   - Wenn Matchup-Informationen benötigt werden

## 📁 Benötigte Ordnerstruktur

```
Hausi Scrapen/
├── Unified_Card_Scraper/
│   ├── unified_card_scraper.exe
│   ├── deck_viewer.html          ← Website
│   └── unified_card_data.csv     ← Kartendaten (wird erstellt)
│
├── Limitless_Online_Scraper/
│   └── limitless_online_decks_comparison.csv  ← Internationale Stats
│
└── City_League_Archetype_Scraper/
    └── city_league_archetypes_deck_stats.csv  ← Japanische Stats
```

## 💡 Tipps

- **Fehlende Daten?** → Führe die jeweiligen Scraper aus
- **Keine Stats angezeigt?** → Deck-Name muss exakt übereinstimmen
- **Japanisches Deck ohne Stats?** → City League Archetype Scraper ausführen
- **Internationales Deck ohne Stats?** → Limitless Online Scraper ausführen

Die Website funktioniert auch wenn nur eine Datenquelle verfügbar ist! 🚀
