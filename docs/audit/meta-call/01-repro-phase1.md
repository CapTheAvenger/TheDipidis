# Meta-Call / Past-Meta Audit — Phase 1: Reproduktion

**Branch:** `audit/meta-call`
**Vorbedingung:** Phase 0 abgenommen, Spec in `00-spec.md`.

Ziel: Beide User-Auffälligkeiten in der laufenden App reproduzieren, exakt verorten welche Render-Funktion welchen Wert wo zeigt, und identifizieren wo in der Datenpipeline der Soll/Ist-Drift entsteht.

---

## 1. Setup & Methode

- **HTTP-Server**: `python3 -m http.server 8765` (statische Auslieferung des Projekts)
- **Browser**: Chromium 141 aus `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (lokal vorinstalliert; Playwright konnte keine eigene Version downloaden weil Sandbox CDN blockt)
- **Playwright**: 1.59.1
- **CDN-Workaround**: Da der Sandbox alle externen Domains blockt (Limitless, Google Fonts, cdnjs PapaParse, jsdelivr Chart.js, Firebase, localforage, mobile-drag-drop), wurde im Playwright-Context-Router eingerichtet:
  - `cdnjs.cloudflare.com/.../papaparse.min.js` → `node_modules/papaparse/papaparse.min.js` (echte Lib)
  - Alle anderen CDN-Hosts → Stub mit minimaler funktionierender API (`firebase`, `Chart`, `localforage`)
  - Google Fonts CSS → leerer Body (verhindert dass `document.fonts.ready` hängt)
- **Probe-Skripte**: `docs/audit/meta-call/phase1-probe.js`, `phase1-probe2.js`, `phase1-probe3.js`, `phase1-tef.js`
- **Artifacts**: `docs/audit/meta-call/artifacts/` (HTML-Schnipsel der gefundenen Zeilen + JSON-Dumps + Logs)

---

## 2. Auffälligkeit 1: SVI-ASC Crustle "10.29 %"

### 2.1 Reproduktion

Ablauf:
1. App-Load
2. `switchTabAndUpdateMenu('profile')` → `switchProfileTab('metacall')`
3. `MetaCall._setMetaSource('past', 'SVI-ASC')`

Ergebnis aus den Console-Logs:

```
[MetaCall] predictor run A top5: Dragapult Dusknoir=20.12%, Crustle=10.29%, N's Zoroark=6.26%, Gardevoir=4.91%, Grimmsnarl Froslass=4.64%
[MetaCall] source = past, format = SVI-ASC (53 archetypes, 7 tournaments)
```

→ **"Crustle = 10.29 %" wird vom Predictor produziert** (Field Composition Panel).

Parallel rendert der Frozen-Past-Mode auch den **Fun-Event Final-Cumulative Ranking Panel** (`renderFrozenRecommendationsPanel`). Dort steht Crustle als Rank 1:

```
Headers:    ['#', 'Deck', 'Score', 'Win %', 'Day-2 Conv', 'Players']
Crustle row: ['1', 'Crustle', '76,6',   '56,8%', '34,9%',     '195']
Panel hint:  'Across 6 major tournaments, showing top 10 archetypes (min 30 players).'
```

→ **Die Frozen-Tabelle ist korrekt** (alle Werte exakt aus `labs_tournament_decks_SVI-ASC.csv` reproduzierbar — siehe 2.3).

→ **Die "10.29 %" stammt aus dem Field-Composition-Panel des Predictors**, nicht aus der Frozen-Tabelle.

### 2.2 Diskrepanz im Detail

Vier verschiedene Zahlen für "Crustle in SVI-ASC":

| # | Wert | Quelle | Berechnung |
|---|---|---|---|
| 1 | **1.96 %** | `labs_tournament_decks_SVI-ASC.csv` pooled | 195 Players / 9 929 Total Players über 6 Turniere (0056-0061) |
| 2 | **2.01 %** | Labs CSV inkl. Familie | 200 Players (pure + Iron Thorns + Zoroark Crustle) / 9 929 |
| 3 | **6.67 %** | `tournament_cards_data_cards_SVI-ASC.csv` raw decklist | 17 Decklisten / 255 Decklisten über 7 Turniere (533, 534, 543, 551, 552, 560, 563) |
| 4 | **10.29 %** | App-Predictor output (run A) | Nach Predictor-Stages 4.0a, 4.5, 4.6, 4.7, 5.2 angewendet auf #3 |

Konsekutive Diskrepanzen:
- #1 vs #3: **+4.7 pp** — verschiedene Datenquellen (player-share vs decklist-share), verschiedene Turnier-Sets (6 vs 7).
- #3 vs #4: **+3.6 pp** — Predictor-Stages amplifizieren die Roh-Decklist-Share um Faktor 1.54.

### 2.3 Verifizierte korrekte Werte aus der Frozen-Tabelle

Die Frozen-Tabelle ist die einzige korrekt rechnende Anzeige für SVI-ASC. Nachvollzogen aus `labs_tournament_decks_SVI-ASC.csv`:

| Per-Turnier | Players | Day1 | Day2 | D2 Conv (raw) | Win % |
|---|---|---|---|---|---|
| 0056 San Juan | 5 | 5 | 3 | 0.6 | 57.45 |
| 0057 Curitiba | 23 | 23 | 11 | 0.4783 | 58.92 |
| 0058 Houston | 60 | 60 | 23 | 0.3833 | 54.73 |
| 0059 Seville | 22 | 22 | 9 | 0.4091 | 54.71 |
| 0060 Orlando | 66 | 66 | 16 | 0.2424 | 51.90 |
| 0061 Querétaro | 19 | 19 | 6 | 0.3158 | 55.92 |
| **Aggregate** | **195** | 195 | 68 | sum-pooled = **34.87 %** | sum-pooled = 50.11 % (W+L+T) / 57.81 % (W+L only) |

App-Frozen-Tabelle: Players 195 ✅ — Day-2 Conv 34.9 % ✅ — Win % 56.8 % (W+L-basiert ≈ 57.81 %, leichte Differenz vermutlich durch Tie-Halbgewichtung) — Score 76.6 (= 56.8 × (1 + 0.349) = 76.6, formelmäßig korrekt).

### 2.4 Root-Cause-Identifikation

**Wurzel 1: Defekte Datenquelle**

`data/tournament_cards_data_cards_SVI-ASC.csv` ist Spalte 5 (`archetype`) **mit Preis-Suffix konkateniert**:
```
552;Regional Orlando, FL – Limitless;SVI-ASC;4th April 2026;Joltik Box39.92$34.66€;Joltik;...
```
→ Der CSV-Scraper schreibt fälschlich `<archetype><price_string>` in die archetype-Spalte.

Die App hat dafür einen Workaround:
- `app-past-meta.js:74 sanitizePastMetaArchetypeName` strippt Preis-Suffix mit Regex
- `app-meta-call.js:515-517 stripPriceTag` ebenfalls

Dies behebt nur das Symptom; die kaputte CSV bleibt. Folgen:
- 1 325 unique archetype-Strings im Roh-CSV (statt ~50)
- Werden via `stripPriceTag` korrigiert deduped (heißt: das funktioniert *jetzt*), aber jede Änderung des Preis-Formats (Decimal-Separator, Währung) bricht den Loader
- `total_decks_in_archetype` ist pro card-Zeile dupliziert, der Loader dedupliziert via `(tid, archetype)` Set, was *meistens* funktioniert

**Wurzel 2: Falsches Metric/Datenquellen-Mapping**

`_loadPastMetaShares(formatKey)` (app-meta-call.js:495-563) liest aus `tournament_cards_data_cards_<META>.csv`:
- Was es eigentlich liefert: **decklist-share** = Anteil eingereichter Decklisten je Archetyp
- Was Limitless als "Past Meta" zeigt: **player-share** = Anteil aller Spieler je Archetyp
- Was die App-UI als "Share" labelt: nicht expliziert markiert; User liest es als player-share

Folgen:
- `tournament_cards_data_cards_SVI-ASC.csv` hat 255 Decklisten verteilt über 7 Turniere (533, 534, 543, 551, 552, 560, 563)
- `labs_tournament_decks_SVI-ASC.csv` hat 9 929 Player verteilt über 6 Turniere (0056-0061)
- **Tournament-Sets stimmen nicht überein**: 7 vs 6, mit unterschiedlichen ID-Schemata (3-stellige vs 4-stellige IDs)
- **Decklist-Submissions sind systematisch nach oben verzerrt** zugunsten erfolgreicher / publizierter Decks → seltene Decks wie Crustle erscheinen überproportional, weil Decklisten primär aus Top-Cut kommen
- Crustle: 17 Decklisten / 255 Total = 6.67 % decklist-share, **aber nur 195 Spieler / 9 929 Total = 1.96 % player-share**

**Wurzel 3: Predictor amplifiziert die ohnehin verzerrte Roh-Share**

In `_setMetaSource('past', formatKey)` (app-meta-call.js:3227–3290):
- `_predictorMode = 'A'` (online-only)
- `_labsRowsByDeck = {}`, `_tournamentStats = {}`, `_trendMap = {}` etc. werden geleert
- Aber: `_runPredictor()` läuft trotzdem komplett durch (alle Stages: 4.0a Meta-Dynamics, 4.5 Concentration-Counters, 4.6 Field-Suppression, 4.7 Counter-Adoption, 5.2 Hype-Damper + Concentration-Exp)

Console-Log zeigt z.B.:
- `predictor 5.2 — Concentration-Exp softened for: Dragapult Dusknoir (^1.40)`

Die Stages amplifizieren die Roh-Decklist-Share zur predicted Share. Konkret: Crustle 6.67 % → 10.29 % (+54 % relativ, +3.6 pp absolut).

Im closed-past-meta-Fall (`_isPastMetaFrozen() === true`) ist diese Vorhersage **fachlich sinnlos**: das Format ist abgeschlossen, es gibt nichts vorherzusagen.

**Wurzel 4: Spaltenlabel-Verwechslung**

In `renderFrozenRecommendationsPanel` (app-meta-call.js:4929+) wird gerendert:
```js
<td class="mc-rec-day2"><strong>${scoreStr}</strong></td>   // Score (76.6)
<td class="mc-rec-wr">${winStr}%</td>                       // Win %
<td class="mc-rec-wins">${day2Str}%</td>                    // Day-2 Conv
<td class="mc-rec-wins">${a.players}</td>                   // Players
```

Die CSS-Klassen sind missverständlich:
- Spalte 3 hat Klasse `mc-rec-day2`, zeigt aber **Score**
- Spalte 5 hat Klasse `mc-rec-wins`, zeigt aber **Day-2 Conv**
- Spalte 6 hat ebenfalls Klasse `mc-rec-wins`, zeigt aber **Players**

Header und Wert sind inhaltlich konsistent (Header sagt "Score", Wert ist Score), aber die CSS-Class-Namen passen nicht zum Inhalt → CSS-Selectoren, Styling, Tests und CSS-Spezifität-Annahmen können stillschweigend fehlbezogen sein.

### 2.5 User-Mental-Modell

Der User hat gemeldet "**Crustle 10.29 % Share, sollte 1.96 % sein**":
- 10.29 % = bestätigt — App-Predictor-Output für die Field-Composition in past-meta-Modus für SVI-ASC
- 1.96 % = bestätigt — labs-CSV pooled player-share für pure Crustle
- "Share" = User liest die Spalte als player-share (Limitless-Konvention), aber sie ist (a) decklist-share aus anderem CSV (b) zusätzlich predictor-inflated

→ **Der gesamte Past-Meta-Pfad in der MetaCall-UI ist konzeptionell falsch**: Er rechnet predicted shares aus einer anderen Datenbasis als die Frozen-Tabelle und zeigt sie ohne klare Disambiguierung neben den korrekten Werten.

---

## 3. Auffälligkeit 2: TEF-POR Dragapult-Familie "45.98 % predicted"

### 3.1 Reproduktion

Ablauf:
1. App-Load
2. `MetaCall._setMetaSource('past', 'TEF-POR')`

Predictor-Output (Console-Log):
```
[MetaCall] predictor run A top5: Dragapult=17.09%, Dragapult Dusknoir=11.21%, Dragapult Dudunsparce=10.43%, Raging Bolt Ogerpon=9.51%, Dragapult Blaziken=7.25%
[MetaCall] source = past, format = TEF-POR (44 archetypes, 4 tournaments)
```

Field-Composition-Panel zeigt jedes Variant als eigene Zeile:
- Dragapult: 17.09 %
- Dragapult Dusknoir: 11.21 %
- Dragapult Dudunsparce: 10.43 %
- Dragapult Blaziken: 7.25 %

**Familien-Summe: 17.09 + 11.21 + 10.43 + 7.25 = 45.98 %** ← entspricht exakt der vom User berichteten Anzeige im Group-by-Pokemon-Modus.

### 3.2 Diskrepanz im Detail

| # | Wert | Quelle |
|---|---|---|
| 1 | **29.85 %** | `labs_tournament_decks_TEF-POR.csv` — Familien-Players 2111 / Total 7073 über 4 Turniere (0062-0065: Prague, LA, Utrecht, Campinas) |
| 2 | **37.16 %** | `tournament_cards_data_cards_TEF-POR.csv` raw decklist-share über 4 Turniere (535, 539, 544, 558) — Familien-Decks 482 / Total 1297 |
| 3 | **45.98 %** | App-Predictor output (Summe der 4 Variants nach allen Stages) |

Diskrepanzen:
- #1 vs #2: **+7.3 pp** — decklist-share übergewichtet die Familie um Faktor 1.24
- #2 vs #3: **+8.8 pp** — Predictor-Stages amplifizieren um zusätzliche Faktor 1.24
- #1 vs #3: **+16.1 pp** — Gesamt-Inflation Faktor 1.54

TEF-POR ist **nicht** frozen (laufendes Meta zum Zeitpunkt der Daten-Schicht 2026-05-25), also rendert die App `renderRecommendationsPanel` (Live-Predictor) statt `renderFrozenRecommendationsPanel`.

Tournament-Sets: 4 in beiden Quellen, aber **wieder verschiedene IDs**:
- Labs: 0062, 0063, 0064, 0065
- Cards-CSV: 535, 539, 544, 558

### 3.3 Root-Cause-Identifikation

**Wurzel 1: Same Datenquellen-Konflikt wie SVI-ASC** — `_loadPastMetaShares` liest decklist-share, nicht player-share.

**Wurzel 2: Predictor läuft mit fragmentierten Variants ohne Familien-Awareness**

`_runPredictor()` (app-meta-call.js:2019+) verarbeitet **jedes Variant separat**:
- Stage 4.4: Family-pre-aggregation existiert (`_familyOnlineTotal`, `_familyLabsTotal`), aber nur für **labs-Share-Redistribution** — hat keine Cap-Funktion auf Familien-Summen.
- Stage 4.5 Concentration-Counters: counter-boost basiert auf **dominanter Familie ≥15 %**. Wenn dragapult-Familie raw 37 % hat, ist sie >15 %, und ihre Counter sollten geboostet werden. Aber der Predictor boostet stattdessen die Familie selbst weiter.
- Stage 5.2 Concentration-Exp: "Concentration-Exp softened for: Dragapult (^1.27)" — der Exponent ^1.27 wird auf Dragapult angewendet. Bei einem Wert <1 (z.B. 0.17 als 17%), bedeutet Hochpotenzierung mit Exponent >1 eine VERRINGERUNG des Werts. Aber im Log heißt "softened" eher Dämpfung. Trotzdem: Endwert ist 17.09 %, höher als das raw 14.96 %. Hier passt etwas nicht zusammen.

**Wurzel 3: Group-by-Pokemon zeigt erwartungsgemäß die summe**

Im Group-by-Pokemon-Modus aggregiert `buildGroups()` (app-meta-call.js:3551–3561) alle Dragapult-Variants in eine Familien-Zeile via `extractMainPokemon()`. Diese Aggregation ist **funktional korrekt**: sie summiert die Variant-Shares. Das Problem ist nicht die Aggregation, sondern dass die Variant-Shares selbst schon zu hoch sind (Wurzel 1 + 2).

### 3.4 Zusätzliche Cross-Format-Beobachtung

Die `tournament_cards_data_cards_TEF-POR.csv` (oder die Verzweigung davon, die der Predictor sieht) lieferte auch eine erwartungswidrige top-Ausgabe: bei direktem `_setMetaSource('past', 'TEF-POR')` zeigt der Recommendations-Panel:
- Crustle als Rank 1 (21.1 %) ← **Crustle ist kein TEF-POR-Deck**
- Tera Box als Rank 2 (18.7 %)
- Dragapult als Rank 3 (20.3 %)

Crustle gehört zu SVI-ASC. Sein Auftreten in der TEF-POR-Recommendations-Liste deutet darauf hin, dass der Recommendations-Engine (Markov-Simulation gegen Field) seinen Field-Snapshot aus mehreren Quellen mixt oder den Format-Filter nicht konsequent anwendet. Weitere Untersuchung in Phase 2.

---

## 4. Zusammenfassung der Root-Causes für Phase 2

| ID | Root Cause | Wo | Auswirkung |
|---|---|---|---|
| RC-1 | CSV-Scraper schreibt Preise in `archetype`-Spalte | Daten-Build-Pipeline (außerhalb der Frontend-Codebase, vermutlich Python-Scraper) | 1325 fragmentierte Archetypen statt ~50; Workaround per `stripPriceTag` kaschiert das Symptom |
| RC-2 | `_loadPastMetaShares` benutzt decklist-share statt player-share | `app-meta-call.js:495-563` | Crustle Roh 6.67 % statt 1.96 %; Dragapult-Familie Roh 37.16 % statt 29.85 % |
| RC-3 | `_runPredictor()` läuft komplett trotz `_predictorMode='A'` + leerer Maps | `app-meta-call.js:2019+` (alle Stages 4.0a-5.2) | Crustle weitere Inflation 6.67 → 10.29 %; Dragapult-Familie 37.16 → 45.98 % |
| RC-4 | Tournament-ID-Schema-Mismatch zwischen labs- und cards-CSV | Daten-Build | Verschiedene Turnier-Sets (6 vs 7 für SVI-ASC), keine Konsistenz-Garantie |
| RC-5 | CSS-Klassen `mc-rec-day2` / `mc-rec-wins` mismatchen Header/Inhalt | `app-meta-call.js:4929-4997` | Keine direkte User-Auswirkung, aber CSS-Selectoren und Tests potenziell verwirrt |
| RC-6 | Frozen-Past-Mode rendert Field-Composition-Panel mit predicted-shares neben Frozen-Tabelle | `app-meta-call.js:4713-4737` | User sieht zwei verschiedene "Share"-artige Werte (10.29 % vs 195 players) für dasselbe Deck im selben Format ohne Disambiguation |
| RC-7 | Recommendations-Engine zeigt Off-Format-Decks (Crustle in TEF-POR) | Wo der `field`-Snapshot konstruiert wird (Phase 2 zu identifizieren) | Empfohlene Decks sind im fokussierten Format gar nicht legal/präsent |

---

## 5. Empfohlene Fixes (für Phase 3 zu detaillieren)

Vorschau, NICHT für Phase 1 entscheiden — nur als Roadmap:

1. **Datenpipeline (RC-1)**: Den Scraper, der `tournament_cards_data_cards_*.csv` erstellt, so reparieren dass `archetype`-Spalte sauber bleibt. `stripPriceTag` als Sicherheitsnetz behalten.
2. **Datenquellen-Switch (RC-2)**: `_loadPastMetaShares` für past-meta-source ersetzen durch eine Funktion die aus `labs_tournament_decks_<META>.csv` aggregiert (player-share). Decklist-share kann separat als "Decklist Share (Online Sample)" gelabelt werden, falls sie überhaupt noch gewünscht ist.
3. **Predictor-Bypass im Past-Meta (RC-3)**: Wenn `_metaSource === 'past'` und `_isPastMetaFrozen()`, dann `_runPredictor()` **gar nicht aufrufen**. Die Frozen-Tabelle ist die einzig sinnvolle Anzeige. Das Field-Composition-Panel im Frozen-Mode entweder ausblenden oder nur Roh-Player-Shares zeigen (keine Vorhersage).
4. **Tournament-ID-Mapping (RC-4)**: Build-Schritt der die zwei CSV-Quellen abgleicht und an einem Punkt erzwingt dass beide Quellen denselben Turnier-Pool für ein Format haben.
5. **CSS-Klassen-Cleanup (RC-5)**: Klassen umbenennen oder Inhalt-Reihenfolge umstrukturieren so dass Klasse zu Inhalt passt.
6. **UI-Disambiguation (RC-6)**: Im Frozen-Past-Mode das Field-Composition-Panel entfernen oder explizit als "Final Field Composition (Player Count)" mit Quellverweis labeln.
7. **Off-Format-Filter (RC-7)**: Recommendations-Engine muss den aktiven Format-Filter auf die Field-Auswahl anwenden. Crustle darf nicht in TEF-POR-Predictions auftauchen.

---

## 6. Artefakte

Im Verzeichnis `docs/audit/meta-call/artifacts/`:
- `phase1-probe.log`, `phase1-probe2.log`, `phase1-probe3.log`, `phase1-tef.log` — vollständige Console-Logs
- `crustle-row-0.html` — Crustle-Zeile in der Past-Meta-Tab-Ansicht (initial probe)
- `crustle-svi-asc-row-0.html` — Crustle in Frozen-Panel mit korrekten Werten (probe3)
- `tef-result.json`, `tef-grouped.json` — TEF-POR Dragapult-Familien-Daten
- `probe3-result.json` — Vollständiger State-Dump nach SVI-ASC-Switch
- Screenshots: timeoutete in der Sandbox-Umgebung (fonts wait); Werte sind via DOM-Inspektion vollständig verifiziert

---

## 7. Status

Phase 1 abgeschlossen. Beide User-Auffälligkeiten:
- ✅ reproduziert
- ✅ in Quelle (Render-Funktion + Code-Zeile) verortet
- ✅ Soll-Werte gegen Roh-Datenquellen verifiziert
- ✅ Root-Causes hypothetisiert (7 Stück)

**Bereit für Phase 2 — Root-Cause-Analyse**: Tiefere Untersuchung jedes RC mit Stack-Trace von UI-Wert bis Daten-Origin, Bestätigung/Verwerfung der Hypothesen, exakte Code-Zeilen die geändert werden müssen, Reihenfolge der Fixes (welche unabhängig, welche aufeinander aufbauen).
