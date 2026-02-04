# Prozentangaben Erklärung

## Warum sind manche Prozente nicht 100%?

Die `percentage_in_archetype` Spalte zeigt an, in **wie viel Prozent der Decks** eines Archetypes eine bestimmte Karte vorkommt.

### Beispiel: Alakazam Dudunsparce

```
Karte: Abra MEG 54
Archetype: Alakazam Dudunsparce
- deck_count: 14 (in 14 Decks vorhanden)
- total_decks_in_archetype: 19 (insgesamt 19 Decks des Typs)
- percentage_in_archetype: 73,7% (14/19 = 73,7%)
```

Das bedeutet: **Nicht alle Alakazam Dudunsparce Decks verwenden Abra!**

## Warum ist das so?

Es gibt mehrere mögliche Gründe:

### 1. **Verschiedene Deck-Varianten**
- Manche Spieler bauen ihr Deck unterschiedlich
- Es gibt Varianten mit oder ohne bestimmte Karten
- Beispiel: Alakazam Dudunsparce könnte mit Pidgeot oder ohne gespielt werden

### 2. **Unvollständige Decklisten**
- Bei Turnieren werden manchmal nicht alle Karten erfasst
- Labs.limitlesstcg.com hat nicht immer vollständige Decklisten
- Manche Spieler geben nur Teile ihres Decks an

### 3. **Unterschiedliche Archetypes**
- "Alakazam Dudunsparce" und "Alakazam Meg" sind zwei verschiedene Archetypes
- Jeder Archetype wird separat berechnet
- Die gleiche Karte kann in verschiedenen Archetypes unterschiedliche Prozente haben

## Wann sind Prozente 100%?

Prozente sind 100% wenn:
- **Alle Decks** eines Archetypes die Karte verwenden
- Der Archetype nur aus wenigen (1-5) Decks besteht
- Die Karte **essentiell** für das Deck ist

### Beispiel: Alakazam Meg
```
Karte: Alakazam MEG 56
Archetype: Alakazam Meg
- deck_count: 1
- total_decks_in_archetype: 1
- percentage_in_archetype: 100,0% (1/1)
```

Hier gibt es nur 1 Deck dieses Types, daher haben ALLE Karten 100%.

## Interpretation

### Core-Karten (>70%)
Karten mit >70% sind **meistens** im Deck enthalten und gelten als Standard.

### Flex-Karten (30-70%)
Karten mit 30-70% sind **optional** und hängen von der Variante ab.

### Tech-Karten (<30%)
Karten mit <30% sind **selten** und werden nur in speziellen Varianten gespielt.

## Was ist mit leeren Kartennamen?

Wenn `card_name` leer ist, aber `card_identifier` existiert (z.B. "SSH 10"):
- Das ist ein Bug beim Scrapen
- Der Name wurde nicht korrekt aus dem HTML extrahiert
- Die neueste Version versucht den Namen aus der Datenbank zu holen
- Wenn das nicht klappt, wird die Karte übersprungen

**FIX:** Die neueste Version (nach Build vom 03.02.2026) behebt dieses Problem automatisch indem Namen via Set+Number aus der Datenbank geholt werden.
