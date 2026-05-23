# Phase 1.1 — Call Graph: Deck Analysis (Global) → Quick Overview → Generate

**Verifiziert durch direktes Code-Lesen am 2026-05-23**

## Entry-Points

```
index.html:1275  <button onclick="autoCompleteConsistency('currentMeta', 'min')">
  └─ js/app-deck-builder.js:6052  async function autoCompleteConsistency(source, rarityMode, options)
```

Zweiter Entry-Point (Empty-State Generate Button):
```
index.html:1353  <button onclick="autoCompleteConsistency('currentMeta', 'min')">
  └─ (gleicher Call wie oben)
```

## Hauptpipeline (`autoCompleteConsistency`)

```
autoCompleteConsistency('currentMeta', 'min')
│
├─ 1. AGGREGATE BY CARD_NAME  (app-deck-builder.js:6121-6148)
│    └─ Über alle cards-Einträge: deck_count, total_count, sum_avg_count summieren
│
├─ 2. COMBINED VARIANTS MERGE  (app-deck-builder.js:6166-6196)
│    └─ js/app-utils.js:766  calculateCombinedVariantStats(group, resolvedTotalDecks)
│       └─ Returns: { combinedShare, combinedAvgWhenUsed, recommendedCount, baseName, legalMax }
│       └─ recommendedCount = Math.round(combinedAvgWhenUsed)   ← ZEILE 815
│
├─ 3. EXCLUDED-CARDS FILTER  (app-deck-builder.js:6204-6214)
│
├─ 4. META-CARD BOOST LOAD  (app-deck-builder.js:6220-6232)
│    └─ Aus window.metaCardData[source]
│
├─ 5. RECENCY SCORING — TIME-DECAY  (app-deck-builder.js:6234-6362)
│    ├─ Online source:  online_tournament_dated_cards.csv (weight 1.0×)
│    ├─ Major source:   tournament_cards_data_cards.csv   (weight 1.5×)
│    └─ Decay-Kurve (laut Code-Kommentar):
│       │  0-7d   :   1.0× (full)
│       │  7-21d  :   1.0 → 0.4
│       │  21-42d :   0.4 → 0.1
│       │  42d+   :   0.05 residue
│       └─ Resultat: weightedShareMap (REPLACES baseline share in score formula)
│       └─ Guard: MIN_DECKS_FOR_DECAY = 5 (fall-back zu baseline bei < 5 decks)
│
├─ 6. LATEST-MAJOR ANCHOR  (app-deck-builder.js:6364-6700+)
│    └─ Aggregiert per-card stats vom jüngsten Major (tournament_date max)
│    └─ Re-baselining (score=major stats) NUR wenn filter='all'
│    └─ Für Lucario Hariyama jüngster Major wird ermittelt aus latestRows
│
├─ 7. CONSISTENCY SCORE PER CARD  (app-deck-builder.js:6807-6900+)
│    ├─ avgCountWhenUsed = total_count / deck_count            (Zeile 6813)
│    ├─                  ELSE sum_avg_count / count_entries     (Zeile 6815)
│    ├─                  ELSE parseFloat(average_count)         (Zeile 6818)
│    ├─ metaBoost = (metaShare/100) * 0.15                      (Zeile 6827)
│    └─ consistencyScore = (combination from sharePercent + boost + recency)
│
├─ 8. ACE-SPEC-CONDITIONAL AVG OVERRIDE  (app-deck-builder.js:7268-7350)
│    └─ Wenn Ace-Spec gepickt: avgCountWhenUsed per matchender Ace-Spec überschrieben
│
├─ 9. STAGE 0 — PINS + TECH-SLOTS + ACE-SPEC  (app-deck-builder.js:7403-7447)
│    ├─ addCount = Math.round(exactAvg), exactAvg = avgCountWhenUsed || _recommendedCount || 2
│    └─ _lrmRemainder = exactAvg - addCount  (signed)
│
├─ 10. STAGE 1 — CORE (score >= 75)  (app-deck-builder.js:7462-7491)
│     ├─ addCount = Math.round(exactAvg), exactAvg = avgCountWhenUsed || _recommendedCount || 0
│     ├─ _lrmRemainder = exactAvg - addCount  (signed)
│     ├─ addCount = Math.max(1, addCount)   ← Core MUSS >= 1
│     └─ addCount = Math.min(addCount, legalMax) (außer Basic Energy)
│
├─ 11. STAGE 2 — EXTENDED (score >= 40, TECH-tier >= 50)  (app-deck-builder.js:7524-7574)
│     ├─ addCount = Math.round(exactAvg)
│     ├─ _lrmRemainder = exactAvg - addCount  (signed)
│     ├─ addCount < 1: SKIP (außer tech-chosen counter → forced 1)
│     └─ tech-counter cap: addCount = min(addCount, _techCounterMaxCount)
│
├─ 12. LRM-REDISTRIBUTION oder REVERSE-LRM-TRIM  (app-deck-builder.js:7586-7600)
│     ├─ currentTotal < 60: _redistributeByLargestRemainder (bump highest positive remainders)
│     ├─ currentTotal > 60: _trimByReverseLrm                (trim most-negative remainders)
│     └─ Tier-Multiplier: CORE×1.15, TECH×0.85, MID×1.0 (Tie-Breaker)
│
└─ 13. BIDIRECTIONAL LRM SWAP  (app-deck-builder.js:5169+)
      └─ Bei Deck = 60: tausche TECH-Slot gegen CORE-Bump wenn CORE-Remainder deutlich höher
```

## Kritische Rundungs-Stellen (chronologisch im Code)

| Datei | Zeile | Stelle | Operation |
|---|---|---|---|
| `app-utils.js` | 815 | `calculateCombinedVariantStats` → `recommendedCount` | `Math.round(combinedAvgWhenUsed)` |
| `app-deck-builder.js` | 4225 | (alternative Pfad — NICHT in autoComplete) | `Math.round(avgWhenUsed)` |
| `app-deck-builder.js` | 7418 | Stage 0 Pinned | `Math.round(exactAvg)` |
| `app-deck-builder.js` | 7479 | Stage 1 Core | `Math.round(exactAvg)` |
| `app-deck-builder.js` | 7553 | Stage 2 Extended | `Math.round(exactAvg)` |
| `app-deck-builder.js` | 7587 | LRM-Forward-Redistribute | `entry.count += 1` (für positive remainders) |
| `app-deck-builder.js` | 5106 (in _trimByReverseLrm) | LRM-Reverse-Trim | `entry.count -= 1` (für negative remainders) |

## Datenquellen-Pfade

| Datenquelle | Datei | Verwendung |
|---|---|---|
| Live-Aggregat (Quick Overview "cards") | `window.currentCurrentMetaDeckCards` (in-memory) | Pipeline-Input (Schritt 1) |
| Online dated (Recency Online) | `data/online_tournament_dated_cards.csv` | Schritt 5 (Recency-Decay) |
| Major dated (Recency Major) | `data/tournament_cards_data_cards*.csv` | Schritt 5+6 (Recency + Latest-Major-Anchor) |
| Meta boost lookup | `window.metaCardData[source]` (vom Meta-Cards-Loader) | Schritt 4+7 |

## Stellen die das Soll-Spec G2/G3 berühren

**G2 (Recency, fresh > old):** ✓ vorhanden in Schritt 5 (Time-Decay).
- Online weight 1.0, Major weight 1.5 — also Major bekommt schon mehr Gewicht
- Decay-Buckets 0-7-21-42d sind im Code

**G3 (Top-64 vom letzten Major):** ❌ **NICHT vorhanden im Code-Pfad**.
- Latest-Major-Anchor aggregiert ALLE Decks vom jüngsten Major (Schritt 6 line ~6447-6466)
- Keine Filter nach Placement (top-N) im Code

**G4 (Math.round + LRM auf Summe 60):** ✓ vorhanden — siehe Tabelle oben + LRM-Pipeline

**Konkrete Diskrepanz-Kandidaten** (zu verifizieren in Phase 3):
1. Wally's Compassion 1.26 → 2 anzeigt:
   - Wenn nur einzelner Print: `Math.round(1.26)=1` → korrekt
   - Wenn merged variants: `Math.round(combinedAvgWhenUsed)` könnte 2 sein wenn combinedAvg ≥ 1.5
   - Reverse-LRM würde abrunden, nicht aufrunden — also keine Erklärung wenn deck > 60
   - **Hypothese:** Combined-Variants `_recommendedCount` ist 2 (über `_recommendedCount`-Pfad in Stage), aber displayed Ø ist 1.26 (per-row total/deck) → **Display-Logik-Allocation-Mismatch**

2. Basic Fighting Energy 9.80 → 9:
   - `Math.round(9.80) = 10`, `_lrmRemainder = -0.20`
   - Reverse-LRM trimmt cards mit kleinsten Remainders → -0.20 ist klein
   - Tier vermutlich MID (1.0× Multiplier) → effektiver Rem = -0.20
   - Wahrscheinliche Erklärung: deck total nach Stage 0+1+2 war > 60 → Reverse-LRM trimmte 1× Basic Fighting weg → 9 ✓ (Reverse-LRM funktioniert wie designed)

## Was NICHT existiert (Gaps gegenüber Soll-Spec)

- **G3 Top-64-Weighting:** Kein Code-Pfad gefunden
- **Daten-Window-Boundary "letzter Major"** als Cutoff für Recency: aktuell ist Recency rein zeit-basiert (Tage zurück), nicht ereignis-basiert ("nach dem letzten Major")
- **Sichtbarkeit der Allocation-Source in UI:** Zwischen "1.26" und "2" steht nirgends sichtbar dass es Combined-Variants-Pfad ist

## Was ich noch NICHT geprüft habe (verschoben auf Phase 2/3)

- Wie wird `consistencyScore` exakt berechnet (Formel)
- Was sind die _cardFunctionTier-Werte für Wally's Compassion und Basic Energy
- Wie viele Print-Variants hat Wally's Compassion in der aktuellen Lucario-Hariyama-Datenmenge
- Welche Daten landen tatsächlich in `window.currentCurrentMetaDeckCards`
- Wie wird die displayed Ø-Spalte (1.26) im Card-Tile gerendert (Code-Ort, Formel)
