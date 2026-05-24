# W3 Refactor — Implementation Plan

## Phase 0 — Scraper Extension (vorausgesetzt von allem)

### 0.1  `current_meta_analysis_scraper.py` — Standings-Page Player-Count
Beim Iterieren der standings page `labs.limitlesstcg.com/{tid}/standings` (line 504+):

```python
# Count all rows BEFORE any decklist-link filter
player_rows = tsoup.select(f'tr:has(a[href^="/{tid}/player/"])')
total_players = len(player_rows)
```

Thread `total_players` durch:
- `_fetch_meta_live_decks()` → returns dict mit `total_players` pro deck
- `build_dated_rows_from_meta_live()` → buckets[(tid, arch)] speichert `total_players`
- `aggregate_tournament_archetype(... total_players, ...)` → in jeder Output-Row

### 0.2  `backend/core/limitless_dated.py` — Schema-Erweiterung
```python
DATED_CSV_FIELDNAMES = [
    ..., "total_decks_in_archetype", "percentage_in_archetype",
    "total_players",  # NEW
    ..., "is_ace_spec",
]
```
`aggregate_tournament_archetype` Signatur erweitern um `total_players=0` (default 0 für rückwärts-kompatible Calls).

### 0.3  Backfill-Script (Einmalig)
`backend/scrapers/backfill_online_total_players.py`:
- Liest existierendes `online_tournament_dated_cards.csv`
- Holt für jeden distinct `tournament_id` die standings-page
- Zählt Player-Rows
- Schreibt die CSV neu mit `total_players` befüllt
- ~300 HTTP-Requests, ein Lauf

Alternative: einfach den normalen Scraper neu durchlaufen lassen, der überschreibt ja eh. Aber Backfill ist sicherer (kein Datenverlust falls Scraper mid-run abbricht).

### 0.4  Frontend-Filter
`js/app-deck-builder.js`:
```js
const MIN_ONLINE_PLAYERS = 250;
const onlineRowsFiltered = onlineRowsRaw.filter(r => {
    const tp = parseInt(r.total_players || 0, 10);
    return tp >= MIN_ONLINE_PLAYERS;
});
```
Wird vor allen `_aggregateWeightedSource`/`_aceSpecConditionalAvgsMulti` Calls angewendet.

Auch in `js/app-current-meta-analysis.js` und `js/app-meta-call.js` — überall wo `online_tournament_dated_cards.csv` gelesen wird.

---

## Phase 1 — Source-Quality (W1-Teil von W3)

`js/app-deck-builder.js`:
```js
const SOURCE_WEIGHT_MAJOR = 3.0;   // war 1.5
const SOURCE_WEIGHT_ONLINE = 1.0;  // bleibt
```

Major behält den existierenden `_aceSpecMajorWeight` Recency-Cascade (1.0 bei ≤14d, lineare Decay bis 28d, 0 ab 28d).

Day-2-Conversion-Rate als zusätzlicher Recency-Multiplikator (NEW):
- Aus `labs_tournament_decks.csv`: `day1_to_day2_conv` für jeden Tournament-Slug
- Höhere Conversion → höhere Gewichtung
- LA Lucario hat 5.0% conv (3/60) → Faktor ~0.5
- Utrecht Lucario hat 15.8% conv (12/76) → Faktor ~1.0

---

## Phase 2 — Skeleton-Lock (NEU vor Stage 0)

Nach dem multi-source ACE-conditional aggregate, vor Stage 0 Pinning:

```js
function _detectStructuralSkeleton(deckCards, sources, archetypeKey, aceSpecLower, todayMs) {
    // For each card: compute weighted inclusion rate across all Major Day-2 buckets
    // (Major is the only quality-sufficient source for skeleton detection)
    const majorBuckets = aceFilteredMajorBuckets(sources, archetypeKey, aceSpecLower, todayMs);
    const skeletons = new Set();
    for (const card of deckCards) {
        const cn = card.card_name.toLowerCase().trim();
        let presence = 0, avgSum = 0, totalWeight = 0;
        for (const b of majorBuckets) {
            if (b.cards.has(cn)) {
                presence += b.weight;
                avgSum += b.cards.get(cn) * b.weight;
            }
            totalWeight += b.weight;
        }
        if (totalWeight === 0) continue;
        const inclusionRate = presence / totalWeight;
        const avgWhenUsed = avgSum / presence;
        // Skeleton if ≥90% inclusion AND avg ≥ 3.5
        if (inclusionRate >= 0.90 && avgWhenUsed >= 3.5) {
            card._isSkeletonLocked = true;
            card._skeletonCount = 4;  // Always 4 for skeletons
            skeletons.add(cn);
        }
    }
    return skeletons;
}
```

Skeleton-Karten:
- Bekommen `_isSkeletonLocked = true` Flag
- Werden in Stage 0 als 4-of platziert (vor allen anderen Stages)
- Sind immun gegen Demote in Floor/Bidi (analog zu `_isPinned`)

Floor/Bidi/Ceiling Demote-Filter erweitern:
```js
.filter(e => !e.card._isSkeletonLocked && !e.card._isAceSpec && !e.card._isPinned)
```

---

## Phase 3 — Energy-Budget (NEU, ersetzt per-Energy-Rounding)

```js
function _allocateEnergyBudget(deckCards, conditionalAvgs) {
    const energyCards = deckCards.filter(isBasicOrSpecialEnergy);
    let totalAvg = 0;
    const energyData = [];
    for (const card of energyCards) {
        const stat = conditionalAvgs.get(card.card_name.toLowerCase());
        if (stat && stat.presence >= 3) {
            energyData.push({ card, avg: stat.avg });
            totalAvg += stat.avg;
        }
    }
    // Round the TOTAL, not per-card
    const totalBudget = Math.max(7, Math.min(11, Math.round(totalAvg)));
    
    // Sub-allocate proportionally: each card gets floor(avg) baseline,
    // remaining slots go by largest-remainder-method on fractional parts
    let baseline = 0;
    energyData.forEach(e => {
        e.count = Math.floor(e.avg);
        e.frac = e.avg - e.count;
        baseline += e.count;
    });
    let remaining = totalBudget - baseline;
    energyData.sort((a, b) => b.frac - a.frac);
    for (let i = 0; i < remaining && i < energyData.length; i++) {
        energyData[i].count += 1;
    }
    return energyData;  // [{card, count}, ...]
}
```

Für Lucario+MaxBelt: Fighting 9.53 + Rocky 1.95 = 11.48 → round 11 → budget 11.
- Floor: Fighting 9, Rocky 1, baseline 10
- Fractional: Rocky 0.95, Fighting 0.53
- Remaining = 1, geht an Rocky (höhere frac)
- Resultat: **Fighting 9 + Rocky 2 = 11 ✓**

---

## Phase 4 — Stadium-Budget (NEU)

Analog zu Energy-Budget, aber für Stadiums:
```js
const stadiumCards = deckCards.filter(c => /stadium/i.test(c.type || ''));
const budget = Math.max(0, Math.min(3, Math.round(sumAvgs)));
// Same fractional sub-allocation
```

Lucario: Gravity Mountain 1.61 → round 2. Falls noch ein Stadium dazukäme (z.B. Team Rocket's Watchtower 1.0), würde Sum=2.61 → round 3, aber capped auf typically 2 (corridor).

---

## Phase 5 — Pokemon-Line-Lock (NEU)

Evolutionslinien aus Major Day-2 als FESTE Verhältnisse:
- Wenn Stage-1 + Basic vorhanden: Verhältnis 4-3 oder 3-3 oder 2-2 aus Day-2 übernehmen
- Wenn Stage-2-Line: Verhältnis 4-3-3 oder 3-2-2 etc.

Implementierung via `_evolutionLineMap` (existiert vermutlich schon irgendwo):
```js
const lineGroups = groupByEvolutionLine(deckCards);
for (const line of lineGroups) {
    const counts = line.map(card => {
        const stat = conditionalAvgs.get(card.card_name.toLowerCase());
        return Math.round(stat?.avg || 0);
    });
    // Counts ARE the line's structural shape — lock them.
}
```

---

## Phase 6 — Tech-Trainer-LRM (existierende Logik, eingeschränkt)

Nur noch auf Karten ohne Lock-Flag:
- Non-Skeleton
- Non-Energy
- Non-Stadium
- Non-Pokemon
- Non-Ace-Spec
- Non-Pinned

= klassische Tech-Trainer wie Switch, Carmine, Boss's Orders, Wally's Compassion, Air Balloon, Judge, etc.

Stage 1 (≥75) + Stage 2 (≥40/50) + LRM Forward + LRM Reverse + Bidi-Swap operieren wie heute — aber nur auf diesem **eingeschränkten Pool** und mit den **noch freien Slots** (`60 − skeleton − energy − stadium − pokemon`).

---

## Implementierungs-Reihenfolge

```
1. PR — Phase 0 (Scraper + Backfill + Frontend-Filter)
        ↓ Test: 300 Online-Turniere haben jetzt total_players, alle <250 werden gefiltert
2. PR — Phase 1 (SOURCE_WEIGHT_MAJOR = 3.0, day1_to_day2_conv Recency-Mult)
        ↓ Test: Wally avg fällt auf ~1.1, Math.round = 1 ohne Ace-Cond-Override
3. PR — Phase 2 (Skeleton-Lock)
        ↓ Test: Premium Power Pro, Fighting Gong, Lillie's, Ultra Ball locked als 4-of
4. PR — Phase 3 (Energy-Budget)
        ↓ Test: Lucario+MaxBelt liefert 9 Fighting + 2 Rocky = 11
5. PR — Phase 4 (Stadium-Budget)
        ↓ Test: Gravity Mountain bleibt 2 (oder 1 wenn Daten das sagen)
6. PR — Phase 5 (Pokemon-Line-Lock)
        ↓ Test: Riolu 4 / Mega Lucario 3 / Solrock 2-3 stabil
7. PR — Phase 6 (Tech-Trainer-LRM eingeschränkt)
        ↓ Test: Volle Build-Comparison Lucario+MaxBelt vs deine Day-2-Listen
```

Jeder PR ist eigenständig deploybar und testbar. Wenn unterwegs etwas bricht, kann jede Phase isoliert zurückgerollt werden.

---

## Risiken + Mitigationen

| Risiko | Wahrscheinlichkeit | Mitigation |
|---|---|---|
| Backfill-Scrape bricht ab/timeouts | Mittel | Resume-Logik via scraped-IDs set; retry mit exponential backoff |
| Schema-Änderung bricht parseren in anderen Files | Niedrig | `loadCSV` nutzt named columns; neue Spalte ist additive |
| `MIN_ONLINE_PLAYERS=250` schneidet zu viel weg | Hoch | Erstmal monitoring: ein Lauf mit `=250`, einer mit `=100`. Wenn 250 zu wenig Daten lässt, anpassen. |
| Skeleton-Lock blockiert valide Strategien | Niedrig (90%+inclusion ist sehr streng) | Override via User-Pin-System (existiert) |
| Energy-Budget liefert falsche Verteilung wenn 3+ Energy-Typen | Niedrig (Lucario hat nur 2) | Logik LRM-style robust für N-Typen |
| Pokemon-Line-Lock bricht bei Toolbox-Builds (Genesect Splash o.ä.) | Mittel | Lock nur wenn presence ≥3 Day-2-Buckets, sonst fallback zu LRM |

---

## Open Question für vor Phase 0

**Backfill-Strategie für Online-Daten:**
- Option A: Backfill-Script (300 HTTP-Calls, ein Lauf, einmaliger Aufwand)
- Option B: Nichts machen, der nächste reguläre Scraper-Lauf füllt `total_players` für NEUE Daten, alte Daten haben das Feld leer/0 (= durch Filter automatisch raus)

Option B ist einfacher, aber bedeutet kurzfristig dass die meisten Online-Daten leer-gefiltert werden. Option A ist sauberer.
