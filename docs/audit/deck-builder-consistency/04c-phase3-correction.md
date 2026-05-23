# Phase 3.6 — Korrektur nach User-Challenge (2026-05-23)

**Status:** Phase-3.5-Amendment war teil-falsch. User hat aus Limitless die per-Tournament-Daten der MAJOR-Tournaments für Lucario Hariyama gezogen und gezeigt, dass dort NIRGENDS Wally's avg 1.92 ergibt:

```
Utrecht 12 Listen — Wally avg 1.00 — Max Belt avg 0.58
Campinas 11 Listen — Wally avg 1.27 — Max Belt avg 0.45
LA 3 Listen — Wally avg 1.00 — Max Belt avg 0.33
Prag 8 Listen — Wally avg 0.88 — Max Belt avg 0.63
```

Manuelles Re-Run der ACE-conditional-Logik gegen `tournament_cards_data_cards*.csv` ergibt 1.17 (NICHT 1.92). User hatte recht zu zweifeln.

---

## Echte Auflösung

`_aceSpecConditionalAvgs` liest **`online_tournament_dated_cards.csv`** als Quelle (line 7295: `_aceSpecConditionalAvgs(onlineRowsRaw, ...)`). NICHT die Major-Tournament-Daten.

`onlineRowsRaw` wird in Schritt 5 (Recency-Scoring) gefüllt (line 6280): `onlineRowsRaw = await loadOnlineTournamentDatedRows();`

Re-Run gegen die echte Quelle:

```python
# data/online_tournament_dated_cards.csv
# 18 Lucario Hariyama Buckets total
# 4 davon haben Maximum Belt als Card:

   date         age    weight    Wally avg
   2026-04-04   49d    0.050     1.50
   2026-04-08   45d    0.050     1.00
   2026-04-21   32d    0.243     2.00
   2026-05-07   16d    0.614     2.00

# Σ avg × weight = 3.521
# Σ weight     = 3.000
# cond_avg     = 1.9216  ← EXAKT was Browser-Instrumentation zeigte
```

`Math.round(1.9216) = 2` ✓
`_lrmRemainder = 1.9216 - 2 = -0.0784` ✓ (matched Browser-Daten zu 4 Dezimalstellen)

## Warum sieht der User die 1.92 nicht in seinen Major-Screenshots?

Weil die Major-Daten und die Online-Dated-Daten **zwei verschiedene Quellen** sind:
- **Major** = `tournament_cards_data_cards*.csv` = scraped von `limitlesstcg.com/tournaments/N/cards` (4 Lucario-Buckets: Utrecht, Campinas, LA, Prague)
- **Online Dated** = `online_tournament_dated_cards.csv` = scraped von `play.limitlesstcg.com/tournaments/...` (18 Lucario-Buckets aus diversen Online-Events)

ACE-conditional wirkt auf **Online-Dated**, NICHT auf Major. Das ist hardcoded im Code.

## Korrigierte Diskrepanz E (jetzt noch schwerer)

| | Wert | Quelle |
|---|---|---|
| UI zeigt | **Ø 1.26** | `mergeOnlineMajorAdditive` = Σ Online + Σ Major (combined, ohne Recency) |
| Algorithmus rundet | **Ø 1.92** | `_aceSpecConditionalAvgs` = Online-Dated, gefiltert auf Max-Belt-Buckets, recency-weighted |
| User-Erwartung | Ø sollte = Allocation-Source sein | (= Spec AC5) |

**Diskrepanz E ist jetzt:** 
- Die zwei Werte stammen nicht nur aus unterschiedlichen Aggregationen sondern aus **unterschiedlichen Datenquellen**.
- Online-Dated hat 18 Buckets für Lucario, davon 4 mit Max Belt. Per-bucket-avg ist 1.50/1.00/2.00/2.00 — die 2 recenten sind 2.0, gewinnen den Recency-Pull, → 1.92.
- Major-Daten (4 Buckets, Utrecht/Camp/LA/Prag) zeigen Wally avg im Bereich 1.0-1.27 — die User-Intuition kommt daher.

**Beides ist "richtig" je nach Frage:**
- "Wie viele Wally's im Schnitt in Major-Listen?" → 1.0-1.27 (User-Frage)
- "Wie viele Wally's im Schnitt in Online-Listen die DENSELBEN Ace-Spec spielen, gewichtet nach Recency?" → 1.92 (Algorithmus-Frage)

Der Algorithmus hat technisch eine BESSERE Frage (= "what works with the chosen Ace-Spec"), aber das ist für den User unsichtbar.

## Was wirklich passiert (chronologisch, mit Werten)

1. `mergeOnlineMajorAdditive` (filter='all') schreibt für Wally:
   - `deck_count = 47, total_count = 59, average_count = "1,26"` ← UI nimmt diesen Wert
2. `autoCompleteConsistency` aggregiert nach card_name (1 row → no-op)
3. `card.avgCountWhenUsed = total_count / deck_count = 59/47 = 1.2553` (line 6822)
4. Latest-Major-Anchor populiert `latestMajorStats` für jeden card (line 6464-6473)
5. MajorAvgBlend prüft Wally: blended ≈ 1.24 vs onlineAvg 1.26, |delta| < 0.15 → **SKIP**
6. **ACE-SPEC-Conditional Override**:
   - aceSpecSlotCard = Maximum Belt (gepickt vor diesem Schritt, hier nicht behandelt)
   - `_aceSpecConditionalAvgs(onlineRowsRaw, archetype, "maximum belt", ...)` läuft
   - Findet 18 Buckets für Lucario, 4 mit Max Belt
   - Wally avg recency-weighted = **1.9216**
   - guards: bucketCount 4 ≥ 3 ✓, presence 4 ≥ 3 ✓, |1.9216 - 1.2553| = 0.66 ≥ 0.15 ✓ → **OVERRIDE FIRED**
   - `card.avgCountWhenUsed = 1.9216` (line 7344)
7. Stage 1 (score ≥ 75 — Wally has score ~87): `Math.round(1.9216) = 2`
   - `card._lrmRemainder = 1.9216 - 2 = -0.0784`
   - `addCount = Math.max(1, 2) = 2`
   - `pushCard(card, 2, '[Consistency][Stage1-Core]')`
8. After all stages: deck sum landet bei ~60 (no LRM needed)
9. Bidi-swap fired (0 deltas)
10. Final: Wally's at count=2

Browser-Instrumentation hat 7+ als Snapshot-Time gezeigt — daher avg=1.9216, count=2 in der Anzeige.

## Aktualisierte Diskrepanz-Liste (final)

| ID | Was | Status |
|---|---|---|
| ~~A~~ | Wally's 1.26 → 2 | ✅ aufgelöst durch ACE-conditional (Online-Dated, NICHT Major) |
| ~~B~~ | Riolu/Gravity nicht getrimmt | ✅ aufgelöst — Reverse-LRM lief nicht (deck war bei 60 direkt aus Stage-Allocation) |
| C | G2 Recency wirkt nicht auf default-avg (nur in ACE-cond + MajorAvgBlend wenn fired) | offen |
| D | G3 Top-64 braucht Scraper-Extension | offen |
| **E** | **Display Ø ≠ Allocation-Source** | offen, **noch schwerer** (verschiedene Quellen, nicht nur verschiedene Aggregationen) |

## Was am Plan in `05-fix-plan.md` korrekt bleibt

- **Fix E (Display = Allocation Source)** — gleiche Lösung, jetzt mit MEHR Evidenz wichtig: die Quell-Diskrepanz ist groß (Major-aggregate vs Online-conditional)
- **Fix C (Recency-decay auf default-avg)** — gleicher Mechanismus
- **Fix D (Top-64)** — separate Effort

## Was am Plan KORRIGIERT werden muss

In der Beschreibung von Diskrepanz E im 05-fix-plan.md sollte erwähnt werden:
- Quelle der Display-Avg = `mergeOnlineMajorAdditive` (combined, Major+Online)
- Quelle der Allocation-Avg = `_aceSpecConditionalAvgs` (Online-Dated subset, Max-Belt-conditional, recency-weighted)
- **Nicht nur Aggregation sondern Quell-Diskrepanz**

Vorschlag E1 (UI zeigt beide Werte) ist nach wie vor der richtige Fix. Aber das Tooltip/Badge-Text sollte konkreter sein: 
```
Ø 1.26 ← Combined avg (alle Listen)
Algorithm uses 1.92 ← Online subset mit Max Belt, recency-weighted
```

## Mea-culpa

In Phase 3.5 habe ich behauptet das wäre die ACE-conditional vom Major-Tournament-Data. Das war eine Annahme die ich gegen den Code hätte verifizieren müssen. Du hast zu Recht gefragt "wo sollen die 2 herkommen?" — ich hätte ohne deine Korrektur eine falsche Fix-Story gebaut.
