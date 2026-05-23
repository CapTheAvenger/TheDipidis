# Phase 3 — Data Validation mit echten Stichproben

**Stand: 2026-05-23, origin/main @ 851b420**
**Beispiel: Lucario Hariyama, Deck Analysis (Global), Filter='all'**

Alle Zahlen aus echten CSV-Reads (`current_meta_card_data.csv` + `tournament_cards_data_cards_TEF-POR.csv`) am 2026-05-23.

---

## 3.1 Quelldaten-Stichprobe — ALLE 23 sichtbaren Karten

Aus dem User-Screenshot durch Matching gegen die echten Daten:

| # | Card | type | Tier (per `_functionTier`) | Combined dc | Combined tc | avg (=tc/dc) | %share | _lrmRem |
|---|---|---|---|---|---|---|---|---|
| 1 | Meowth ex | Basic | attacker → MID | 46 | 46 | 1.00 | 85.2% | 0 |
| 2 | Hariyama | Stage 1 | attacker → MID | 54 | 108 | 2.00 | 100.0% | 0 |
| 3 | Makuhita | Basic | attacker → MID | 54 | 108 | 2.00 | 100.0% | 0 |
| 4 | Lunatone | Basic | pokemon-engine → CORE | 54 | 109 | 2.02 | 100.0% | +0.02 |
| 5 | Solrock | Basic | pokemon-engine → CORE | 54 | 153 | 2.83 | 100.0% | -0.17 |
| 6 | Mega Lucario ex | Stage 1 | attacker → MID | 54 | 163 | 3.02 | 100.0% | +0.02 |
| 7 | Riolu | Basic | attacker → MID | 54 | 189 | 3.50 | 100.0% | -0.50 |
| 8 | Lillie's Determination | Supporter | core-draw → ?? | 54 | 215 | 3.98 | 100.0% | -0.02 |
| 9 | Boss's Orders | Supporter | gust → MID | 54 | 107 | 1.98 | 100.0% | -0.02 |
| 10 | Judge | Supporter | disruption → TECH | 52 | 111 | 2.13 | 96.3% | +0.13 |
| 11 | **Wally's Compassion** | Supporter | **healing → TECH** | 47 | 59 | 1.26 | 87.0% | +0.26 |
| 12 | Team Rocket's Petrel | Supporter | unknown → MID | 27 | 27 | 1.00 | 50.0% | 0 |
| 13 | Fighting Gong | Item | search-pokemon → ?? | 54 | 216 | 4.00 | 100.0% | 0 |
| 14 | Premium Power Pro | Item | damage-buff → TECH | 54 | 216 | 4.00 | 100.0% | 0 |
| 15 | Ultra Ball | Item | search-pokemon → ?? | 54 | 204 | 3.78 | 100.0% | -0.22 |
| 16 | Poké Pad | Item | unknown → MID | 54 | 184 | 3.41 | 100.0% | +0.41 |
| 17 | Switch | Item | pivot → MID | 37 | 53 | 1.43 | 68.5% | +0.43 |
| 18 | **Night Stretcher** | Item | energy-recovery → MID | 28 | 44 | 1.57 | 51.9% | -0.43 |
| 19 | Air Balloon | Tool | pivot → MID | 54 | 99 | 1.83 | 100.0% | -0.17 |
| 20 | Maximum Belt | Tool | damage-buff → TECH | 23 | 23 | 1.00 | 42.6% | 0 |
| 21 | Gravity Mountain | Stadium | stadium → MID | 54 | 83 | 1.54 | 100.0% | -0.46 |
| 22 | **Rocky Fighting Energy** | Special Energy | energy → MID | 33 | 64 | 1.94 | 61.1% | -0.06 |
| 23 | **Fighting Energy** | Basic Energy | energy → MID | 54 | 529 | 9.80 | 100.0% | -0.20 |

⚠ **Tier-Spalte ist HEURISTISCH** — exakt aus dem `_classifyCardFunction`-Regex hergeleitet, aber nicht zur Laufzeit verifiziert (ohne Browser-Instrumentation). `search-pokemon` und `core-draw` haben keinen Eintrag im `_CARD_FUNCTION_TIERS`-Map (= fallback 'MID').

## 3.2 Manuelle Pipeline-Simulation

### Schritt A — Math.round für jede Karte

```
Σ Math.round(avg) = 1+2+2+2+3+3+4+4+2+2+1+1+4+4+4+3+1+2+2+1+2+2+10 = 62
```

### Schritt B — Stage-Allocation simuliert (alle Cards mit score ≥ 40 angenommen, score = sharePercent für die Top-22)

Stage 0 wird übersprungen (kein Pinning, keine Tech-Slots laut User).

Stage 1+2 weisen Math.round zu:
- 22 Cards mit %share ≥ 40 → Score ≥ 40 → in Stage 1 oder 2 aufgenommen
- Maximum Belt (42.6%) — knapp über Score-Gate → Stage 2 mit addCount=1 (Math.round(1.00)=1)
- Black Belt's Training (35.2%) — UNTER 40 → SKIPPED (TECH-tier-gate ist 50, score 35 → out)
- Carmine (22.2%) — UNTER 40 → SKIPPED

Resultat nach Stages: ~22 cards, **Σ count = 62**.

### Schritt C — Reverse-LRM (currentTotal = 62 > 60, trim 2 slots)

Sort ASC by `_lrmRemainder * tierMultiplier`:

| Card | rem | tier | mult | effective |
|---|---|---|---|---|
| **Riolu** | -0.50 | MID | 1.0 | -0.50 |
| **Gravity Mountain** | -0.46 | MID | 1.0 | -0.46 |
| **Night Stretcher** | -0.43 | MID | 1.0 | -0.43 |
| Ultra Ball | -0.22 | MID | 1.0 | -0.22 |
| **Fighting Energy** | -0.20 | MID | 1.0 | -0.20 |
| Solrock | -0.17 | CORE | 1.15 | -0.196 |
| Air Balloon | -0.17 | MID | 1.0 | -0.17 |
| **Rocky Fighting** | -0.06 | MID | 1.0 | -0.06 |
| Lillie's Determination | -0.02 | ?? | 1.0 | -0.02 |
| Boss's Orders | -0.02 | MID | 1.0 | -0.02 |

**Erwartete Trims (2 most-negative):** Riolu (-0.50) und Gravity Mountain (-0.46).

**TATSÄCHLICHE Trims** (vom UI rückgerechnet):
- Night Stretcher: Math.round=2 → UI=1 (trim ✓)
- Fighting Energy: Math.round=10 → UI=9 (trim ✓)
- Rocky Fighting Energy: Math.round=2 → UI=1 (trim ✓)

⚠ **DISKREPANZ #1:** Riolu und Gravity Mountain wurden NICHT getrimmt obwohl sie die negativsten Remainders haben. Die 3 trims gingen an cards mit kleineren-Magnitude-negative-Remainders. Heuristisch deutet das auf zusätzliche Schutz-Logik die ich im Code nicht gefunden habe (z.B. "trim Energy/non-pokemon first" oder eine andere Tier-Klassifizierung als die Heuristik annimmt).

### Schritt D — Bidirektionaler Swap (TECH → CORE)

Wenn nach Reverse-LRM TECH-cards mit count >= 1 existieren UND CORE-cards mit positive remainder:
- Demote 1 TECH, bump 1 CORE.

CORE-bump-Kandidaten (Tier CORE und rem > 0):
- Solrock: rem=-0.17 (NEGATIV, nicht eligible)
- Lunatone: +0.02
- Falls Lillie's CORE: -0.02 (NEGATIV)

→ Nur Lunatone als CORE-Bump-Kandidat mit positiver rem. Aber Lunatone wurde NICHT gebumpt (User sieht 2, Math.round 2 = unverändert).

⚠ **DISKREPANZ #2:** Wally's Compassion wurde nach unserer Klassifikation als **TECH (healing)** klassifiziert. TECH-cards sind keine CORE-Bump-Kandidaten in `_bidirectionalLrmSwap`. Trotzdem wurde Wally's von 1 auf 2 gebumpt. **Unerklärt.**

## 3.3 Vergleich UI vs. Math.round vs. Pipeline-Erwartung

| Card | avg | Math.round | UI | Δ vs Math.round | Soll laut Pipeline? |
|---|---|---|---|---|---|
| Wally's Compassion | 1.26 | 1 | **2** | **+1** | ❓ unerklärt |
| Night Stretcher | 1.57 | 2 | 1 | -1 | trimmed (reverse-LRM kandidat) ✓ |
| Rocky Fighting Energy | 1.94 | 2 | 1 | -1 | trimmed ✓ |
| Fighting Energy | 9.80 | 10 | 9 | -1 | trimmed ✓ |
| Riolu | 3.50 | 4 | 4 | 0 | ❓ sollte am ersten trimmed (rem -0.50) |
| Gravity Mountain | 1.54 | 2 | 2 | 0 | ❓ sollte am zweiten trimmed (rem -0.46) |

Alle anderen 17 Cards: UI = Math.round (unverändert).

## 3.4 Diskrepanz-Inventar

### Diskrepanz A: Wally's Compassion 1 → 2 unerklärter Bump
- **Was:** Avg 1.26, Math.round = 1, _lrmRemainder = +0.26, klassifiziert als TECH (healing per `_classifyCardFunction`). Pipeline-Math sagt 1. UI zeigt 2.
- **Wo:** unbekannt — hat kein Pfad in Stages 0/1/2 + Reverse-LRM + `_bidirectionalLrmSwap` der das mathematisch ergibt.
- **Hypothesen die ich AUSGESCHLOSSEN habe:**
  - Combined Variants merge (1 print bei Wally's MEG 132 → kein Merge)
  - Stage 0 default 2 (nicht im _pinnedSet ohne explizites Pinning)
  - Forward-LRM (mutually exclusive mit Reverse-LRM, sum=62 → Reverse-LRM)
  - Tech-counter auto-add (Wally's nicht in `active_threats.counters`)
- **Verbleibende Hypothesen:**
  - `_classifyCardFunction` matched für Wally's NICHT auf "healing" zur Laufzeit (z.B. weil `effects` Object leer ist und der `effects.rules.join`-Branch nicht greift). Dann wäre `_cardFunction = 'unknown'` → Tier = 'MID', NICHT TECH. CORE-Bump-Logik gilt trotzdem nicht (Wally wäre MID, nicht CORE) — also löst das das Mystery nicht.
  - Es gibt einen ZUSÄTZLICHEN Pipeline-Pfad nach `_bidirectionalLrmSwap` und vor Render, den ich nicht gelesen habe.
  - Der Stage 1 Math.round-Block enthält `addCount = Math.max(1, addCount)` (Zeile 7481) — das könnte 0 → 1 boosten, aber Wally's ist schon bei 1. Nicht erklärt.
- **Nächster Schritt (Phase 4 oder vorher):** Browser-Instrumentation. Im DevTools-Console:
  ```js
  await autoCompleteConsistency('currentMeta', 'min');
  console.log(window.consistencyDeck.find(e => e.card.card_name === "Wally's Compassion"));
  console.log(window.__lastBuildPinDiagnostics);
  ```
  Würde zeigen: was war das `_cardFunctionTier`, wurde Wally's gepinnt, welcher Stage-Log entstand.

### Diskrepanz B: Reverse-LRM trimt Energy/Item statt CORE-rem-negativ Pokémon-Line-Piecen
- **Was:** Riolu (-0.50) und Gravity Mountain (-0.46) sind die mathematisch obersten Trim-Kandidaten, wurden aber NICHT getrimmt. Stattdessen trimmt das System Energy (-0.20) und Special Energy (-0.06).
- **Wo:** `js/app-deck-builder.js:5130-5163` (`_trimByReverseLrm`). Aktuelles Sortier-Kriterium ist `_effectiveRemainder = _lrmRemainder * tierMultiplier(CORE=1.15, TECH=0.85)`. Riolu (= attacker → MID multiplier 1.0) sollte zuerst getrimmt werden.
- **Verbleibende Hypothesen:**
  - Riolu kommt im Code möglicherweise als 'pokemon-engine' raus (statt 'attacker') wegen Ability — dann CORE, dann Multiplier 1.15 → effektiv -0.575 → sollte NOCH früher getrimmt werden (selbst mit Schutz-Bug). Verschärft.
  - Es gibt eine ZUSÄTZLICHE Filter-Bedingung im trim-Pfad (Pokémon-Schutz?) die ich übersehen habe.
- **Nächster Schritt:** Code-Stelle `_trimByReverseLrm` Zeile-für-Zeile nochmal lesen, speziell den `.filter(...)`-Pipeline und schauen ob es einen impliziten Pokémon-Filter gibt.

### Diskrepanz C (Soll-Spec-Gap, kein Code-Bug): Recency-Decay wirkt NICHT auf Card-Anzahlen
- **Was:** G2 Soll = "frische Daten weighten höher". Code hat Recency-Decay-Logik (Phase 1 Logik 5), aber Code-Kommentar Zeile 6250-6252 dokumentiert explizit: "weighted_share REPLACES baseline share in score formula, NOT in display values / avgCountWhenUsed". Heißt: Recency entscheidet nur "ist die Karte gut genug für Stage X" (Score-Gate), aber die ANZAHL der Kopien (Math.round(avgCountWhenUsed)) ignoriert Recency.
- **Auswirkung:** Ein Card mit avg 1.3 in einem 6-Monate-alten Turnier wird genauso gerundet wie avg 1.3 vom letzten Major.
- **Soll laut Spec:** Frische Daten sollen die ANZAHL beeinflussen, nicht nur die Selektion.
- **Fix-Richtung (Phase 4):** Recency-decay auf avgCountWhenUsed anwenden (analog zu wie es für sharePercent funktioniert).

### Diskrepanz D (Daten-Gap): G3 Top-64 Placement nicht implementierbar
- **Was:** Soll = "Top-64 vom letzten Major höher gewichten". Daten-Vertrag (Phase 2.4): `tournament_cards_data_cards*.csv` hat KEINE placement-Spalte.
- **Voraussetzung für Fix:** JH-Scraper-Erweiterung um placement/rank pro Decklist mitzuschreiben.

## 3.5 Bestätigte Logik (kein Bug)

- Online+Major additive merge (`mergeOnlineMajorAdditive`) berechnet display-werte korrekt — 1:1 mit Screenshot reproduziert.
- avgCountWhenUsed = total_count / deck_count ist die Allocation-Source und matched das Display.
- 17 von 23 Cards zeigen exakt Math.round(avg) — Standard-Allocation funktioniert.

---

## Output Phase 3

**Bestätigte Findings für Phase 4 Fix-Plan:**

1. **Diskrepanz A:** Wally's Compassion bump 1 → 2 (CODE-PFAD-MYSTERY — braucht Browser-Instrumentation um den Pfad zu finden)
2. **Diskrepanz B:** Reverse-LRM trim-Auswahl matched nicht mathematisches Optimum (Riolu/Gravity sollten zuerst getrimmt werden, nicht Energy/Rocky/Night)
3. **Diskrepanz C:** Recency-Decay wirkt nicht auf Karten-Anzahl, nur auf Stage-Gate — G2-Spec teilweise verletzt
4. **Diskrepanz D:** G3 Top-64-Weighting braucht Scraper-Erweiterung

**Risikoklassen (Vorab-Einschätzung, finalisiere in Phase 4):**
- A: 🟡 MEDIUM — bug ist subtil, braucht Code-Trace bevor Fix klar ist
- B: 🟡 MEDIUM — Sort-Logik anpassen, aber Tier-Klassifikation evtl. korrigieren
- C: 🟢 LOW — saubere Erweiterung der bestehenden weightedShare-Map auf avgCountWhenUsed
- D: 🔴 HIGH — Scraper-Änderung + Re-Scrape + Datenstruktur-Erweiterung
