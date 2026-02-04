# Settings Erklärung - unified_card_settings.json

## Übersicht

Die Settings-Datei steuert, welche Datenquellen verwendet werden und wie viele Daten gesammelt werden.

## Struktur

```json
{
    "sources": {
        "city_league": { ... },
        "limitless_online": { ... },
        "tournaments": { ... }
    },
    "delay_between_requests": 1.0,
    "output_file": "unified_card_data.csv"
}
```

---

## 1. City League (Japan-Turniere)

```json
"city_league": {
    "enabled": true,                      // true = aktiviert, false = deaktiviert
    "start_date": "24.01.2026",           // Startdatum (TT.MM.JJJJ)
    "end_date": "01.02.2026",             // Enddatum (TT.MM.JJJJ)
    "max_decklists_per_league": 16        // Max Decklisten pro Turnier (0 = alle)
}
```

**Quelle:** limitlesstcg.com/tournaments/?region=jp

**Datentyp:** Vollständige Kartenlisten aus japanischen City League Turnieren

**Deaktivieren:** Setze `"enabled": false`

**Hinweis:** Region ist immer Japan (jp) - andere Regionen nicht unterstützt

---

## 2. Limitless Online (Metagame-Decks)

```json
"limitless_online": {
    "enabled": true,              // true = aktiviert, false = deaktiviert
    "game": "POKEMON",            // Spiel (POKEMON)
    "format": "STANDARD",         // Format (STANDARD, EXPANDED)
    "rotation": "2025",           // Rotation (2025, 2024, etc.)
    "set": "PFL",                 // Aktuellstes Set (PFL = Prismatic Evolutions)
    "top_decks": 20,              // Anzahl Top-Decks
    "max_lists_per_deck": 5       // Anzahl Decklisten pro Archetype
}
```

**Quelle:** play.limitlesstcg.com/decks

**Datentyp:** Vollständige Kartenlisten von Top-Online-Decks

**Deaktivieren:** Setze `"enabled": false`

**Tipp:** `"top_decks": 10` und `"max_lists_per_deck": 3` für schnellere Tests

---

## 3. Tournaments (Internationale Turniere)

```json
"tournaments": {
    "enabled": true,                    // true = aktiviert, false = deaktiviert
    "max_tournaments": 3,               // Anzahl Turniere
    "max_decks_per_tournament": 256,    // Anzahl Decks pro Turnier (max 256)
    "format_filter": [                  // Erlaubte Formate
        "Standard",
        "Standard (JP)"
    ]
}
```

**Quelle:** labs.limitlesstcg.com

**Datentyp:** Vollständige Kartenlisten von Regional Championships und größeren Events

**Deaktivieren:** Setze `"enabled": false`

**Tipp:** `"max_decks_per_tournament": 64` für schnellere Tests

---

## 4. Allgemeine Einstellungen

```json
"delay_between_requests": 1.0,        // Wartezeit zwischen Anfragen (Sekunden)
"output_file": "unified_card_data.csv" // Name der Ausgabedatei
```

---

## Beispiel-Konfigurationen

### Nur City League (Japan)
```json
{
    "sources": {
        "city_league": {
            "enabled": true,
            "start_date": "01.02.2026",
            "end_date": "03.02.2026",
            "region": "jp",
            "max_leagues": 10
        },
        "limitless_online": {
            "enabled": false
        },
        "tournaments": {
            "enabled": false
        }
    }
}
```

### Nur Limitless Online
```json
{
    "sources": {
        "city_league": {
            "enabled": false
        },
        "limitless_online": {
            "enabled": true,
            "top_decks": 15,
            "max_lists_per_deck": 5
        },
        "tournaments": {
            "enabled": false
        }
    }
}
```

### Nur Internationale Turniere
```json
{
    "sources": {
        "city_league": {
            "enabled": false
        },
        "limitless_online": {
            "enabled": false
        },
        "tournaments": {
            "enabled": true,
            "max_tournaments": 5,
            "max_decks_per_tournament": 128
        }
    }
}
```

### Alle Quellen (Volle Daten)
```json
{
    "sources": {
        "city_league": {
            "enabled": true,
            "max_leagues": 20
        },
        "limitless_online": {
            "enabled": true,
            "top_decks": 30,
            "max_lists_per_deck": 10
        },
        "tournaments": {
            "enabled": true,
            "max_tournaments": 10,
            "max_decks_per_tournament": 256
        }
    }
}
```

---

## Tipps

1. **Schneller Test:** Aktiviere nur 1 Quelle mit kleinen Zahlen
2. **Volle Daten:** Aktiviere alle 3 Quellen mit großen Zahlen
3. **Balance:** `delay_between_requests` auf 0.5-1.0 setzen um Server nicht zu überlasten
4. **Japan-Meta:** Nur City League und Tournaments mit `"format_filter": ["Standard (JP)"]`
5. **International-Meta:** Limitless Online + Tournaments mit `"format_filter": ["Standard"]`
