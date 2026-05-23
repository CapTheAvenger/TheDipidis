# Phase 4 — Fix-Plan

**Stand: 2026-05-23 nach Browser-Instrumentation (04b)**
**Drei verbliebene Diskrepanzen:** C (Recency-Gap), D (Top-64-Daten-Gap), E (Display-Allocation-Mismatch)

---

## Risikoklassen-Übersicht

| ID | Beschreibung | Risiko | Effort | Empfehlung |
|---|---|---|---|---|
| **E** | Display Ø ≠ Allocation-Source | 🟢 LOW | Klein | **Zuerst fixen** — Quick-Win, macht restliche Bugs sichtbar |
| **C** | Recency wirkt nicht auf default-avgCountWhenUsed | 🟡 MEDIUM | Mittel | Danach — baut auf bestehendem `_aggregateWeightedSource` auf |
| **D** | G3 Top-64 Placement-Weighting | 🔴 HIGH | Groß | Separater Track (Scraper + Re-Scrape + Aggregator) |

---

## Diskrepanz E — Display ≡ Allocation-Source

### Was
- UI-Card-Tile zeigt `Ø 1.26x` (combined Online+Major avg)
- Algorithmus benutzt `1.92` (Maximum-Belt-conditional avg) für `Math.round` → 2 copies
- Result: User sieht "1.26 → 2" und denkt das ist falsch, obwohl der Algorithmus eine BESSERE Zahl gewählt hat
- Verletzt AC5 aus `00-spec.md`

### Wo im Code
- **Display-Wert berechnet:** `js/app-current-meta-analysis.js:332` in `mergeOnlineMajorAdditive`:
  ```js
  average_count: combined_dc > 0 ? (combined_tc / combined_dc).toFixed(2).replace('.', ',') : '0',
  ```
- **Allocation-Wert (kann abweichen):** `js/app-deck-builder.js:7344` ACE-SPEC-Conditional:
  ```js
  card.avgCountWhenUsed = cond;
  ```
- **Display-Render (was die UI tatsächlich rendert):** noch zu finden in Phase 5 — vermutlich in `app-current-meta-analysis.js` Card-Tile-Renderer

### Soll-Verhalten
Der angezeigte Ø-Wert soll **identisch** mit dem für `Math.round` verwendeten avgCountWhenUsed sein. Bei ACE-SPEC-Conditional-Override soll das ACE-conditional avg sichtbar sein.

### Fix-Vorschlag E
**Variante E1 (empfohlen):** UI rendert `card._effectiveAvgForAllocation` (NEU) statt `average_count` aus CSV. `_effectiveAvgForAllocation` wird in `autoCompleteConsistency` gesetzt sobald `avgCountWhenUsed` final ist (nach ACE-conditional, Major-blend, Recency etc).

Konzeptioneller Diff:
```js
// In autoCompleteConsistency, NACH allen avgCountWhenUsed-Mutationen
// (Ende Schritt 7 / vor Stage 1):
deckCards.forEach(card => {
    card._effectiveAvg = card.avgCountWhenUsed;
    card._displayedShare = card.percentage_in_archetype;  // unchanged
    // Optionale Badge-Info für UI:
    if (card._aceSpecConditionalAvg != null && Math.abs(card._aceSpecConditionalAvg - card._aceSpecConditionalBaseAvg) >= 0.15) {
        card._avgOverrideReason = `ACE-SPEC (${aceSpecSlotCard.card_name})`;
    } else if (card._majorBlendedAvg != null) {
        card._avgOverrideReason = `Major-blend`;
    }
});
```

UI-Renderer (Card-Tile, noch zu finden): Wenn `card._avgOverrideReason` existiert, zeige:
```
Ø 1.26 → 1.92 (Max Belt)
```
Sonst nur:
```
Ø 1.26
```

**Variante E2 (minimal):** Tooltip hinzufügen mit Hover-Text "Algorithm uses 1.92 for this card based on Maximum Belt subset". Visible Ø bleibt 1.26.

### Test-Strategie E
- Unit-Test: `_effectiveAvgForAllocation` matched `card.avgCountWhenUsed` immer nach autoComplete-Ende
- Manual-Test: Lucario Hariyama → Wally's tile zeigt "Ø 1.26 → 1.92"
- Regression-Test: Cards ohne ACE-conditional / Major-blend zeigen unverändert "Ø X.XX"

### Rollback E
Pure UI/render-Änderung. Bei Bedarf: HTML-Block aus Card-Tile entfernen, alles andere bleibt.

### Side-Effects E
Card-Tile-Renderer und CSS könnten Layout-Anpassung brauchen (zwei Werte statt einem).

---

## Diskrepanz C — Recency in default-avgCountWhenUsed

### Was
G2 sagt "frische Daten weighten höher". Code hat das in ZWEI Pfaden:
1. **`consistencyScore`** (line 6234-6362) — recency-weighted, voll funktional
2. **ACE-SPEC-Conditional** (line 5976-6048 `_aceSpecConditionalAvgs`) — auch recency-weighted (line 6032-6035)

ABER:
- Default-Pfad (= ACE-conditional fired NICHT, oder MajorAvgBlend skipped wegen shift < 0.15) → avgCountWhenUsed = un-weighted combined avg aus mergeOnlineMajorAdditive
- Heißt: Karten die durch die Guards fallen, kriegen KEINE recency-Behandlung beim Anzahl-Berechnen

Echte Beobachtung (Lucario): Wally's, Riolu, Gravity, Fighting Energy bekommen ACE-conditional → recency ist drin. Aber bei einem Archetypen ohne Ace-Spec oder bei einem Card ohne genug Major-Präsenz wären sie vom default-Pfad → keine Recency-Behandlung.

### Wo im Code
- Default-Setup: `js/app-deck-builder.js:6811-6822` (avgCountWhenUsed = total_count / deck_count)
- ACE-conditional Override: `js/app-deck-builder.js:7344`
- MajorAvgBlend: `js/app-deck-builder.js:7259`
- Code-Kommentar dokumentiert die Limitation: line 6250-6252

### Soll-Verhalten
Recency-decay soll auf avgCountWhenUsed wirken **für jede Karte**, nicht nur bedingt.

### Fix-Vorschlag C
**Erweitere `_aggregateWeightedSource` (line 5824)** um neben dem `weightedShare` auch einen `weightedAvg` zu berechnen (analog zu wie ACE-Conditional es macht — Σ avg*weight / Σ weight).

Dann in der avgCountWhenUsed-Berechnung (line 6811-6822) den `weightedAvg` als bevorzugte Quelle nehmen wenn verfügbar:

```js
// Konzeptueller Diff in autoCompleteConsistency
deckCards.forEach(card => {
    const sharePercent = ...;
    
    // 2c.1 NEU: Recency-weighted avg (wenn weightedShareMap-Pfad
    // genug Daten hatte — gleiche Guard wie weightedShareMap).
    const weightedAvg = weightedAvgMap.get(nameLower);  // NEU: aus erweitertem _aggregateWeightedSource
    
    let avgCountWhenUsed;
    if (Number.isFinite(weightedAvg) && weightedAvg > 0) {
        avgCountWhenUsed = weightedAvg;  // recency-weighted
    } else if (card.total_count > 0 && card.deck_count > 0) {
        avgCountWhenUsed = card.total_count / card.deck_count;  // legacy fallback
    } // ... etc
    
    card.avgCountWhenUsed = avgCountWhenUsed;
    card._baselineAvg = card.total_count / card.deck_count;  // für UI-Tooltip falls nötig
});
```

Reihenfolge nach Fix:
1. weighted-avg (NEU, recency-decayed across Online + Major)
2. ACE-SPEC-Conditional Override (kann weighted-avg übersteuern wenn Guards greifen)
3. MajorAvgBlend (sekundärer Override)

Mit Fix C funktioniert G2 für ALLE Karten, nicht nur Edge-Cases.

### Test-Strategie C
- Unit-Test: 2 fiktive Sources mit gleichem combined-avg aber unterschiedlicher Verteilung über Zeit → weightedAvg unterscheidet sich
- Integration-Test: Lucario Hariyama mit `weightedAvgMap` → erwarte abweichend vom default combined avg
- Regression-Test: ACE-conditional Override muss noch funktionieren (wird AUF dem weighted-avg basiert, nicht auf combined)

### Rollback C
Feature-Flag in scraper_settings oder als Konstante in der Datei. Bei Bedarf: weightedAvgMap-Map leer setzen → Code fällt zurück auf legacy.

### Side-Effects C
- Stage-Allocation sieht etwas andere avgs → andere Card-Counts möglich
- Wirkt sich auf JEDEN generierten Deck aus, nicht nur Lucario
- Vor Live-Schaltung: A/B-Vergleich gegen 5-10 verschiedene Archetypes erforderlich

### Open Question für E
Soll der Fix-Effekt **alle Karten** treffen, oder nur Karten ohne ACE-conditional/Major-blend-Override (= Default-Pfad)?

Empfehlung: ALLE — sorgt für konsistente Behandlung. ACE-conditional baut dann auf weighted-avg auf (Recency-Cascade).

---

## Diskrepanz D — G3 Top-64 Placement-Weighting

### Was
Spec G3: "Wenn möglich sollten vom letzten Major sogar Karten aus den Listen aus den Top 64 höher bewertet werden, da ja hier ein massiver Erfolg zu verzeichnen ist."

Aktuell: `tournament_cards_data_cards*.csv` hat **keine `placement`-Spalte**. Latest-Major-Anchor aggregiert ALLE Decks vom jüngsten Major mit gleichem Gewicht.

### Wo
- **Daten-Schema:** `data/tournament_cards_data_cards_*.csv` Spalten sind ohne placement (Phase 2.4 dokumentiert)
- **Scraper-Output:** `backend/scrapers/tournament_scraper_JH.py` — schreibt die Felder, kein placement
- **Frontend-Aggregator:** `js/app-deck-builder.js:6364-6483` (Latest-Major-Anchor) — sammelt alle Decks gleich

### Fix-Plan D (3 Optionen)

#### D-Option-A: Full Implementation (HIGH effort)

1. **Scraper-Erweiterung** (`backend/scrapers/tournament_scraper_JH.py`):
   - Pro Deck-Decklist: `placement` Feld aus Limitless-Page parsen (Standings-Tabelle)
   - CSV-Schema erweitern um `placement` Spalte
   - Logik: Top-256 hat Placement 1-256, niedrigere Decks haben höhere Zahlen

2. **Re-Scrape** aller bisherigen Major-Tournaments:
   - `tournament_jh_scraped.json` zurücksetzen (oder partial-incremental nur für die Top-X)
   - Workflow ausführen → CSV neu generiert mit placement
   - Achtung: Limitless cappt Listing bei 500 (Phase Past-Audit) — pagination nötig

3. **Frontend-Aggregator-Update** (`js/app-deck-builder.js:6364+`):
   - Latest-Major-Anchor: Pro Card-Aggregation `decks[i].weight = top64_weight(placement)`
   - Top-64-Weight-Funktion z.B.:
     ```js
     function _placementWeight(placement) {
         if (placement <= 8) return 2.0;      // Top 8: 2x
         if (placement <= 16) return 1.5;     // Top 16: 1.5x
         if (placement <= 64) return 1.2;     // Top 64: 1.2x
         return 1.0;                          // Rest: baseline
     }
     ```
   - Anwenden auf `cardAgg.set(cn, { deckCount += dc * weight, totalCount += tc * weight })`

#### D-Option-B: Light Alternative (MEDIUM effort)
- Nutze `data/labs_tournament_decks.csv` als deck-LEVEL info (HAT player_count + day1/day2)
- Auf Archetype-Level: gewichte Major-Anchor mit "wie populär war dieser Archetype unter den Top-Day2" — nicht per Card, aber per Archetype
- Card-Level placement bleibt unmöglich ohne D-Option-A

#### D-Option-C: Defer (LOW effort)
- G3 ist explizit "Wenn möglich" — nicht muss
- Bei aktuellen Daten nicht machbar
- In `00-spec.md` als WONTFIX markieren bis Scraper-Erweiterung implementiert

### Empfehlung D
Erst **Option C** im Spec dokumentieren. **Option A** als separater Audit (`audit/deck-builder-top64-weighting`) wenn Diskrepanzen C+E live sind und Erfahrungen mit "viel besseren Listen" zeigen ob Top-64 noch das fehlt.

Rechtfertigung: Diskrepanzen C+E haben höheren ROI mit weniger Risiko. Top-64 ist die letzte 5-10% Verbesserung. Erst die Basis sauber kriegen.

### Test-Strategie D (Option-A)
- Scraper-Unit-Test mit Limitless-Mock-Page → placement korrekt extrahiert
- Re-Scrape gegen 1 Tournament → CSV hat placement-Spalte
- Frontend mit synthetischen Daten: gewichtetes Aggregate matched gewünschten Bias

### Rollback D (Option-A)
- Scraper: behält Code-Path mit Placement-OFF Flag → fallback auf alte CSV-Spalten
- Frontend: `_placementWeight = () => 1.0` als Override → effektiv aus

### Side-Effects D (Option-A)
- Schwer: erfordert Re-Scrape oder Datenbank-Migration
- Erfasst nur ZUKÜNFTIGE Turniere ohne explizites Backfill
- Verändert Konsistenz-Algorithmus für JEDEN Build → A/B-Test nötig

---

## Empfohlener Fix-Reihenfolge

```
Phase 5 (Tests vor Fix):
  - Snapshot-Tests des Lucario-Hariyama-Builds (current state)
  - Edge-Case-Tests für _aggregateWeightedSource

Phase 6 (Fixes nacheinander):
  ┌─ PR 1: Fix E (Display = Allocation Source)            🟢 LOW
  │    ├─ Add card._effectiveAvg + _avgOverrideReason fields
  │    └─ Update card-tile renderer
  │
  ├─ PR 2: Fix C (Recency in default avgCountWhenUsed)    🟡 MEDIUM
  │    ├─ Extend _aggregateWeightedSource with weightedAvg
  │    ├─ Use weightedAvg as primary avgCountWhenUsed source
  │    └─ Add card._baselineAvg for explanation
  │
  └─ PR 3 (separate audit, optional): Fix D Top-64        🔴 HIGH
       ├─ Scraper extension (placement column)
       ├─ Re-scrape
       └─ Aggregator update
```

## Offene Fragen (vor Phase 5 / GO FIX)

1. **Q-E1:** Variante E1 (zwei Werte sichtbar) vs E2 (Tooltip) — welche bevorzugst du?
2. **Q-C1:** Recency-decay auf ALLE Karten anwenden (Empfehlung) oder nur auf Karten ohne ACE-conditional/Major-blend?
3. **Q-D1:** Möchtest du Option A (Scraper-Extension) jetzt angreifen, oder erstmal C+E machen und dann reevaluieren?
4. **Q-N1:** Soll ich vor Phase 5 ein **kleines Daten-Snapshot-Tool** schreiben das den aktuellen "Lucario Hariyama Generate Output" als Fixture speichert? Wäre die Regression-Baseline für PRs 1+2.

---

**STOP nach Phase 4. Warte auf:**
- Beantwortung der 4 Open Questions
- Dein "GO FIX" zum Starten von Phase 5 (Tests) + 6 (Implementation)
