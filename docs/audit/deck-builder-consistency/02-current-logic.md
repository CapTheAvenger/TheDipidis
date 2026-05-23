# Phase 1 — Current Logic (Ist-Zustand)

**Stand: 2026-05-23, origin/main @ 851b420**

Jede Code-Stelle unten ist **direkt gelesen, nicht rekonstruiert**.

---

## Logik 1: avgCountWhenUsed pro Karte (für Allocation)

**Datei:** `js/app-deck-builder.js:6811-6819`

```js
let avgCountWhenUsed = 0;
if (card.total_count > 0 && card.deck_count > 0) {
    avgCountWhenUsed = card.total_count / card.deck_count;
} else if (card.sum_avg_count > 0 && card.count_entries > 0) {
    avgCountWhenUsed = card.sum_avg_count / card.count_entries;
} else {
    const parsedAvg = parseFloat(String(card.average_count || card.avg_count || '').replace(',', '.'));
    if (Number.isFinite(parsedAvg) && parsedAvg > 0) avgCountWhenUsed = parsedAvg;
}
card.avgCountWhenUsed = avgCountWhenUsed;
```

Erst-Priorität: **`total_count / deck_count`** über die Aggregation aller Quell-Rows.

## Logik 2: Combined-Variants Recommended Count

**Datei:** `js/app-utils.js:766-823`

Aufgerufen pro `baseName`-Gruppe (verschiedene Print-Varianten derselben Karte):

```js
const recommendedCount = Math.min(legalMax, Math.max(1, Math.round(combinedAvgWhenUsed)));
```

`combinedAvgWhenUsed` = `totalCopiesInAllDecks / estimatedUniqueDecks`, wobei `estimatedUniqueDecks = min(safeTotalDecks, maxDeckCount)`.

**Konsequenz:** Bei Karten mit mehreren Prints (z.B. Energy mit BST/PAR/MEG Variante) kann `recommendedCount` **abweichen** von `Math.round(avgCountWhenUsed)` der einzelnen Quellrow.

## Logik 3: Stage-1/2 Allocation (Rundung)

**Datei:** `js/app-deck-builder.js:7479` (Stage 1 Core) und `7553` (Stage 2 Extended)

```js
const exactAvg = card.avgCountWhenUsed || card._recommendedCount || 0;
let addCount = Math.round(exactAvg);
card._lrmRemainder = exactAvg - addCount;   // signed: positiv = rounded down, negativ = rounded up
```

**Reihenfolge der Fallbacks:** `avgCountWhenUsed` → `_recommendedCount` → 0.

In autoCompleteConsistency wird `card._recommendedCount` durch Combined-Variants gesetzt (line 6188). Aber `avgCountWhenUsed` wird **vor** Stage 1 in Schritt 7 (line 6822) gesetzt aus `total_count / deck_count`. Da `avgCountWhenUsed` nicht null/0 ist, **gewinnt es** über `_recommendedCount`.

⚠ Außer in einem Fall: wenn die Karte ein _merged_ entry ist (line 6184-6191), ist `avgCountWhenUsed` von der best-variant geerbt (`...bestVariant`) — aber `combinedAvgWhenUsed` ist NICHT in das Objekt geschrieben worden. Heißt: nach merge ist `card.avgCountWhenUsed` immer noch der best-variant-Wert (z.B. 1.27), nicht die kombinierte Berechnung (z.B. 1.75). **Das ist eine Inkonsistenz** zwischen Merge-Statistik und tatsächlich verwendetem Avg.

## Logik 4: LRM-Forward / Reverse-LRM

**Datei:** `js/app-deck-builder.js:7586-7600`

```js
if (currentTotal < 60) {
    const added = _redistributeByLargestRemainder(consistencyDeck, currentTotal, 60, {...});
} else if (currentTotal > 60) {
    const trimmed = _trimByReverseLrm(consistencyDeck, currentTotal, 60, {...});
}
```

Mutually exclusive — entweder Forward oder Reverse.

**Forward LRM** (`_redistributeByLargestRemainder` line 5064-5111):
- Filtert auf `_lrmRemainder > 0`
- Sortiert DESC nach `_lrmRemainder * tierMultiplier`
- Iteriert: `entry.count += 1` für jedes top-card bis currentTotal == 60
- Tier-Multipliers: CORE=1.15, MID=1.0, TECH=0.85

**Reverse LRM** (`_trimByReverseLrm` line 5130+):
- Sortiert ASC nach `_lrmRemainder * tierMultiplier` (most negative first)
- Iteriert: `entry.count -= 1` für jedes bottom-card bis currentTotal == 60
- CORE-Protection: tier-multiplier von CORE macht negative remainders "noch negativer" → später in sort → wird seltener getrimmt

## Logik 5: Recency-Decay (Time-Weighted Share)

**Datei:** `js/app-deck-builder.js:6234-6362`

Code-Kommentar dokumentiert Decay-Kurve:
- 0-7d: 1.0
- 7-21d: 1.0 → 0.4 (linear)
- 21-42d: 0.4 → 0.1 (linear)
- 42d+: 0.05 residue

Source-Weights:
- Major (`tournament_cards_data_cards.csv`): **1.5×**
- Online (`online_tournament_dated_cards.csv`): **1.0×**

```js
weighted_share[card] = Σ (inclusion × decay × sourceWeight) /
                       Σ (archetype_total × decay × sourceWeight)
```

Resultat (`weightedShareMap`) ersetzt `baselineShare` IM SCORE — aber NICHT im `avgCountWhenUsed` der für Rundung verwendet wird (siehe Kommentar line 6250-6252):

> "The result REPLACES baseline share in the consistency-score formula. Display values in the deck grid still come from baseline (additive Online+Major from PR #49) — only the build-time score uses the time-weighted form."

**Konsequenz für G2 (User-Spec):** Recency beeinflusst nur **welche Karten** ins Deck kommen (über consistencyScore-Gate), nicht **wie viele Kopien** (über avgCountWhenUsed/recommendedCount).

## Logik 6: Latest-Major-Anchor

**Datei:** `js/app-deck-builder.js:6364-6700+`

- Lädt `tournament_cards_data_cards.csv` (latestChunkOnly = aktueller Meta-Chunk)
- Filtert auf archetypeRows = nur Wally's-Archetype
- Findet `latestRaw` = größtes tournament_date in den archetypeRows
- Aggregiert für die latestRaw-Rows: deckCount, totalCount per card → `latestMajorStats`
- Re-Baselining (Major share/avg als Score-Input) NUR wenn `currentMetaFormatFilter === 'all'`

**Hinweis zu G3 (Top-64-Weighting):** Im Latest-Major-Aggregat **kein Filter nach Placement** — alle Decks vom latest Major bekommen gleiches Gewicht. Placement-Daten sind in `tournament_cards_data_cards.csv` **nicht** als Spalte vorhanden (in Phase 2 verifiziere ich das mit echtem CSV-Schema).

---

## Zusammenfassung Soll vs. Ist

| Soll-Spec | Ist-Code | Status |
|---|---|---|
| G1 — Konsistenz + Meta-Pos | Stage-Pipeline + LRM + meta_boost | ✅ vorhanden |
| G2 — Recency, fresh > old | Decay 0-7-21-42d, Major 1.5× / Online 1.0× | ✅ vorhanden — **ABER nur im Score, nicht im Allocation-Avg** |
| G2 — "nach dem letzten Major" | Reine Zeit-Decay, keine Cutoff-Logik | ⚠ teilweise |
| G3 — Top-64 vom letzten Major höher | Kein Placement-Filter | ❌ nicht implementiert |
| G4 — Math.round + LRM → 60 | Math.round in Stage 0/1/2 + LRM forward/reverse | ✅ vorhanden |
| AC5 — Display ≡ Allocation-Avg | combinedAvgWhenUsed wird in Stats berechnet, in `card._recommendedCount` gespeichert, in Allocation aber dominiert `card.avgCountWhenUsed` (bestVariant) — Mismatch möglich | ⚠ potentiell verletzt |
