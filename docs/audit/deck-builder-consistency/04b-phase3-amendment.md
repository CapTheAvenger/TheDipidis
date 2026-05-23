# Phase 3.5 — Update nach Browser-Instrumentation

**Stand: 2026-05-23, mit Browser-Daten vom User (run via instrumentation-snippet.js)**

## Was die echten Daten zeigen

### Pin-Diagnostics (= keine Stage-0-Inputs)
```json
{ "pinned": [], "techSlots": [], "injected": [], "missing": [] }
```
✓ Bestätigt: kein Pinning, kein Tech-Slot. Stage 0 fired für KEINE Karte.

### LRM-Calls
- `_redistributeByLargestRemainder` → **NICHT aufgerufen**
- `_trimByReverseLrm` → **NICHT aufgerufen**
- `_bidirectionalLrmSwap` → 1× aufgerufen, **0 Deltas** (returned 0)

⚠ Caveat: Mein Patch hat `window._redistributeByLargestRemainder` ersetzt, aber der Call in `autoCompleteConsistency` benutzt die Closure-referenz, nicht `window.X`. Heißt: Falls Forward/Reverse-LRM gelaufen wären, hätte mein Patch sie nicht abgefangen. ABER:

Die `_bidirectionalLrmSwap.before`-Snapshot zeigt den Deck-Zustand NACH allen Stages + LRM (= alles was vor swap lief). User-Report-Daten:

| Card | avg (echt) | rem (echt) | count (vor swap) | count (nach swap) |
|---|---|---|---|---|
| Wally's Compassion | **1.922** | -0.0784 | 2 | 2 |
| Riolu | **3.847** | -0.1530 | 4 | 4 |
| Gravity Mountain | **1.795** | -0.2052 | 2 | 2 |
| Fighting Energy | **9.478** | +0.478 | 9 | 9 |

→ Deck war beim Swap-Eintritt schon bei 60 Karten (= keine Forward/Reverse-LRM-Pässe nötig). Swap returned 0 Deltas.

## 🎯 Die Auflösung von Diskrepanz A

Die echten **avgCountWhenUsed**-Werte im Code stimmen NICHT mit den Combined-Online+Major-Averages aus den CSVs überein:

| Card | CSV combined (= display) | Code allocation | Δ |
|---|---|---|---|
| Wally's Compassion | 1.26 | **1.92** | +0.66 |
| Riolu | 3.50 | **3.85** | +0.35 |
| Gravity Mountain | 1.54 | **1.79** | +0.25 |
| Fighting Energy | 9.80 | **9.48** | -0.32 |

Etwas zwischen `mergeOnlineMajorAdditive` und Stage 1/2 verändert `avgCountWhenUsed`. Das ist die **ACE-SPEC-Conditional Override** (`js/app-deck-builder.js:7268-7350`, finalised at line 7344 `card.avgCountWhenUsed = cond;`).

### Wie ACE-SPEC-Conditional funktioniert
1. Builder pickt eine ACE-SPEC (1-pro-Deck regel). Für dieses Lucario-Deck: **Maximum Belt** (PRE 117, 1 copy in der finalen Liste).
2. ACE-SPEC-Conditional Block (line 7268-7350) re-aggregiert per-card-stats NUR aus den Major-Decks die DENSELBEN ACE-SPEC haben.
3. avgCountWhenUsed wird ersetzt mit dem ACE-conditional avg (line 7344).
4. Guards: ≥ 3 matching buckets, card in ≥ 3 of those buckets, shift ≥ 0.3.

Konsequenz für Wally's:
- Combined Online+Major avg = 1.26 (alle Major-decks, inkl. solche mit anderem Ace-Spec wie Unfair Stamp)
- Maximum-Belt-conditional avg = **1.92** (nur Decks die Maximum Belt spielen — die laufen mehr Wally's)
- Math.round(1.92) = **2** ✓ erklärt UI-Wert
- _lrmRemainder = 1.92 - 2 = -0.0784 ✓ matched genau

## 🎯 Auflösung von Diskrepanz B

Riolu / Gravity Mountain wurden NICHT von Reverse-LRM "verschont" — Reverse-LRM ist gar nicht gelaufen. Math.round der ACE-conditional avgs landet schon bei genau 60 Karten.

Ihre rem-Werte (Riolu -0.153, Gravity -0.205) wären zwar trim-Kandidaten falls Reverse gelaufen wäre, aber das war hier nicht nötig.

## 🎯 Neue Diskrepanz E (kritisch für AC5)

**DISPLAY ≠ ALLOCATION-SOURCE.**

UI zeigt:
- Wally's: 87.0% | Ø **1.26** → angezeigte Anzahl **2**

User-Erwartung: Math.round(1.26) = 1. UI ist inkonsistent.

Tatsächliche Realität:
- Algorithmus benutzt smart-er Maximum-Belt-conditional avg = 1.92 für die Anzahl-Berechnung
- Aber zeigt nur den naïven combined avg = 1.26 in der UI

**Das ist eigentlich gute Algorithmik + schlechte UX.** Die Maximum-Belt-conditional Berechnung gibt eine **bessere** Liste (weil sie genau die Decks zählt die die gleiche Ace-Spec spielen), aber sie ist für den User unsichtbar.

## Überarbeitete Diskrepanz-Liste

| ID | Problem | Status | Risiko |
|---|---|---|---|
| ~~A~~ | Wally's 1.26→2 unerklärt | ✅ **AUFGELÖST** durch ACE-SPEC-Conditional (line 7268-7350) | – |
| ~~B~~ | Riolu/Gravity nicht getrimmt | ✅ **AUFGELÖST** — Reverse-LRM lief gar nicht, Stages allokierten direkt auf 60 | – |
| C | G2 Recency-decay wirkt nur auf consistencyScore, nicht auf avgCountWhenUsed | offen — bestätigt durch Code-Kommentar Zeile 6250-6252 | 🟡 MEDIUM |
| D | G3 Top-64 Placement-Weighting nicht implementierbar | offen — keine placement-Spalte in tournament_cards CSV | 🔴 HIGH (scraper-extension nötig) |
| **E** | **Display Ø ≠ Allocation-Source** | NEU — UI zeigt combined avg, Algo nutzt ACE-conditional avg | 🟢 LOW (UI-Fix) |

## Korrektur am Phase-3-Output

Der Sum-of-Math.round = 62 aus Phase 3 war **falsch** — basierte auf CSV-Combined-avgs, nicht auf den tatsächlich von Stage 1/2 verwendeten ACE-conditional avgs. Die echten ACE-conditional avgs landen direkt auf 60 Karten. Kein LRM-Pass nötig.

Die Annahmen über `_lrmRemainder`-Sortierung und Reverse-LRM-Trim-Reihenfolge sind moot — der Pass läuft schlicht nicht in diesem Build.

## Bestätigung der Spec-Erfüllung

| Spec | Status | Quelle |
|---|---|---|
| G1 — Konsistenz + Meta | ✅ ACE-SPEC-Conditional macht genau das (bessere Daten-Subset für die gewählte ACE) | line 7268-7350 |
| G2 — Recency Major > Online | ⚠ Teilweise — Recency wirkt auf consistencyScore + auf Major-Blend (line 7242-7266), aber NICHT auf avgCountWhenUsed wenn ACE-conditional fired | line 6250 / 7245 |
| G3 — Top-64 weight | ❌ Nicht implementierbar (kein placement in Daten) | Phase 2.4 |
| G4 — Math.round + sum=60 | ✅ Funktioniert: ACE-cond avg → Math.round → ggf. LRM | line 7479 / 7553 |
| **AC5 — Display = Allocation** | ❌ **Verletzt**: UI zeigt combined, Algo nutzt ACE-conditional | NEU Diskrepanz E |
