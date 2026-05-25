# Meta-Call / Past-Meta Tiefen-Audit — Soll-Spezifikation (Phase 0)

**Branch:** `audit/meta-call`
**Base:** `5b4507e` (origin/main, weekly run 2026-05-25 17:16 UTC)
**Initiator:** hausitheavenger@gmail.com
**Auslöser:** Zwei konkrete Datenanomalien in der App, von denen aus auf systematische Fehler in der gesamten Meta-Call / Past-Meta Datenkette geschlossen werden soll.
**Pass-Kriterium für das Audit insgesamt:** 100 % verlässliche Daten in jedem User-sichtbaren Wert dieser Features. Jeder Wert muss aus der CSV-/JSON-Datenbasis exakt nachvollziehbar sein und in der UI korrekt zugeordnet sein.

---

## 1. Scope des Audits

Alle UI-Stellen, an denen die folgenden Werte angezeigt werden, sowie die gesamte Pipeline dahinter:

### 1.1 Past-Meta-Ansicht (geschlossenes Format, z.B. SVI-ASC)
Bei einem Format dessen `format_window.in_person_legal_date` in der Vergangenheit liegt, rendert die App eine **Frozen-Past-Meta-Ansicht** (`renderFrozenRecommendationsPanel`, app-meta-call.js:4929–4997). Sichtbare Werte:
- Rang
- Deck-Name
- Score (definiert als `winPct * (1 + day2Conv)`, app-meta-call.js:666)
- Win-%
- Day-2 Conversion %
- Player Count
- (Vermutlich) ein als "Share"-artige Größe interpretierbarer Wert — **die exakte Spalte ist in Phase 1 zu identifizieren**, weil der User-Bericht "10.29 % Share" lautet und in der derzeitigen Render-Funktion keine reine Share-Spalte deklariert ist. Möglichkeiten:
  - Eine separate Share-Spalte existiert (Doku unvollständig)
  - "Score" wird als "Share" fehlinterpretiert
  - Es handelt sich um die "Player-Count-anteilige Share" `sum(player_count) / sum(total_players)`, gerendert in einer anderen Funktion
  - Ein Bug schreibt einen falschen Wert in eine als Share gelabelte Zelle

### 1.2 Past-Meta-Drill-Down pro Archetyp
`renderPastMetaPerformance()` in app-past-meta.js (commit 9829cff). Spalten: Tournaments / Players / Record / Win % / Day-2 Conversion. Matchup-Matrix per Archetyp via `_renderPastMetaMatchupMatrix()`.

### 1.3 Meta-Call-Predictor für laufendes Format (z.B. TEF-POR)
`_runPredictor()` in app-meta-call.js (~Z. 2019+) und Tabellenrendering im Group-by-Pokemon-Modus via `buildGroups()` (app-meta-call.js:3551–3561) + `_renderGroupedDeckRow()` (4299–4373). Sichtbare Werte pro Familie:
- Online %
- My Estimate
- Final % (predicted)
- Counter-Score
- Familien-Zuordnung (welche Varianten gehören zur Familie)

### 1.4 Komplette Datenpipeline beider Ansichten
- `_loadPastMetaShares()` (app-meta-call.js:495–563) — predicted shares aus `tournament_cards_data_cards_<META>.csv`
- `_loadPastMetaLabsAggregate()` (app-meta-call.js:602–675) — frozen aggregates aus `labs_tournament_decks_<META>.csv`
- `extractMainPokemon()` (1417–1446) — Familien-Schlüssel-Extraktion
- `_familyDisplayName()` (1412–1415) — Anzeige-Name pro Familie
- Predictor-Stages: `_computeMetaDynamics`, `_computeConcentrationCounters`, `_computeFieldSuppression`, `_computeCounterAdoptionBoost`, `_computeOnlinePresenceFloor`

---

## 2. Verankerte Soll-Werte (Ground Truth)

### 2.1 SVI-ASC — Crustle Share

**Ground Truth aus `data/labs_tournament_decks_SVI-ASC.csv`** (alle 6 Turniere 0056–0061, Datenstand `scraped_at 2026-05-25 12:38:08`):

| Tournament-ID | Name | Datum | Crustle Players | Total Players |
|---|---|---|---|---|
| 0056 | Special Event San Juan | 2026-03-07 | 5 | 345 |
| 0057 | Regional Championship Curitiba | 2026-03-14 | 23 | 1447 |
| 0058 | Regional Championship Houston | 2026-03-21 | 60 | 2633 |
| 0059 | Special Event Seville | 2026-03-28 | 22 | 1336 |
| 0060 | Regional Championship Orlando | 2026-04-04 | 66 | 2734 |
| 0061 | Regional Championship Querétaro | 2026-04-04 | 19 | 1434 |
| **Summe** | | | **195** | **9929** |

**Soll-Aggregate (Pure "Crustle", deck_name == "Crustle"):**
- Pooled Share `sum(players) / sum(total_players)` = 195 / 9929 = **1.964 %** ← entspricht User-Beobachtung "1.96 %"
- Avg of per-tournament share = (1.59 + 2.28 + 1.65 + 2.41 + 1.32 + 1.45) / 6 = **1.783 %**

**Soll-Aggregate (Crustle-Familie via `extractMainPokemon`, inkl. "Iron Thorns Crustle" 4 Players + "Zoroark Crustle" 1 Player):**
- Pooled Share = 200 / 9929 = **2.014 %**

**Limitless-Web-Vergleich:** Nicht direkt möglich (Sandbox blockiert `labs.limitlesstcg.com`). Die im User genannte URL `https://labs.limitlesstcg.com/decks?tournaments=61,60,59,58,57,56` aggregiert genau dieselben Turniere wie unsere CSV. Da die "1.964 %" exakt auf die User-Beobachtung "1.96 %" trifft, ist anzunehmen dass Limitless dieselbe `pooled-players/pooled-total`-Formel verwendet. In Phase 1 wird diese Annahme entweder durch zusätzliche Decks aus der gleichen Quelle (z.B. Top-3 Picks) verifiziert oder per Build-Pipeline / GitHub-Action (die Limitless tatsächlich erreichen kann) explizit gegengeprüft.

**App-Anzeige (laut User):** 10.29 %

**Soll = 1.964 % (pure) bzw. 2.014 % (Familie).**
**Ist = 10.29 %.**
**Diskrepanz = +8.3 bis +8.5 Prozentpunkte (Faktor ~5).**

Keine plausible Kombination der vorliegenden Spalten (player_count, total_players, day1_*, day2_*, win_pct, top-conv-rates) ergibt rechnerisch 10.29 %. Die Diskrepanz ist nicht durch eine Definitionsfrage erklärbar; es liegt ein **echter Berechnungs- oder Datenzuordnungs-Bug** vor.

### 2.2 TEF-POR — Dragapult-Familie predicted

**Ground Truth aus `data/labs_tournament_decks_TEF-POR.csv`** (alle 4 Turniere 0062–0065, jüngstes Scrape):

| Tournament-ID | Name | Datum | Family-Players | Total Players |
|---|---|---|---|---|
| 0062 | Regional Championship Prague | 2026-04-25 | 418 (Dragapult 188 + Blaziken 143 + Dusknoir 71 + Dudunsparce 15 + Froslass 1) | 1367 |
| 0063 | Regional Championship Los Angeles | 2026-05-09 | 589 (190+138+161+99+1) | 1844 |
| 0064 | Regional Championship Utrecht | 2026-05-16 | 538 (180+93+134+130+1) | 2140 |
| 0065 | Regional Championship Campinas | 2026-05-16 | 566 (180+79+149+154+4) | 1722 |
| **Summe** | | | **2111** | **7073** |

**Soll-Aggregate (Familie via `extractMainPokemon == "Dragapult"`):**
- Historische pooled family share = 2111 / 7073 = **29.85 %**

**App-Anzeige (laut User):** **45.98 %** predicted (Group-by-Pokemon-Modus, Familien-Summe)

**Soll-Bereich (in Phase 1 zu präzisieren):** 29.85 % ist die rohe historische Familien-Share. Der Predictor darf basierend auf Online-Trend, Concentration-Counter-Mechanik etc. abweichen, aber:
- Die Familien-Share aller Decks zusammen darf nie über 100 % gehen (Sanity-Cap).
- Eine Familien-Share von 45.98 % würde bedeuten, dass praktisch jeder zweite Spieler ein Dragapult-Deck spielt — das ist gegenüber 29.85 % Historie und gegenüber dem üblichen Predictor-Boost-Faktor (Größenordnung ±10–20 % relativ, nicht +54 % relativ) unplausibel.
- Genauer Soll-Korridor wird in Phase 1 aus Predictor-Logik (4.0a–4.7) und Online-Share-Snapshot abgeleitet.

**Diskrepanz = +16 Prozentpunkte gegenüber Historie (Faktor 1.54).**

Hypothesen für die Ursache (in Phase 1 zu prüfen):
1. **Familien-Doppelzählung**: `buildGroups()` summiert dieselbe Variante in mehrere Familien (z.B. "Dragapult Dudunsparce" zählt in Dragapult- UND Dudunsparce-Familie).
2. **`extractMainPokemon` ordnet zu viele Decks der Dragapult-Familie zu** (z.B. trainer-Pokemon-Decks wie "N's Dragapult" oder Edge-Cases bei compound-species).
3. **Predictor-Stage überschießt**: Eine der Stages (`_computeMetaDynamics`, `_computeConcentrationCounters`, `_computeFieldSuppression`) wirkt auf Familien-Summe statt auf Variante.
4. **Online-Share-Datenquelle korrupt** für TEF-POR oder falsch normalisiert (z.B. wenn Online-Share dieselbe Variante in mehrere deck_names splittet und Predictor das beim Summieren nicht dedupliziert).
5. **Floor-Mechanik (`_computeOnlinePresenceFloor`) wirkt pro Variante mit ≥0.5 %**, was bei vielen Varianten zu künstlicher Familien-Aufblähung führt.

---

## 3. Erweiterter Verifikationskatalog (alle weiteren zu prüfenden Werte)

Über die zwei expliziten Auffälligkeiten hinaus müssen **alle** folgenden User-sichtbaren Werte gegen die CSV-/JSON-Ground-Truth verifiziert werden:

### 3.1 Past-Meta-Frozen-View (für alle geschlossenen Formate: SVI-ASC, SVI-BLK, SVI-DRI, SVI-JTG, SVI-MEG, SVI-PFL, BRS-PRE, BRS-SCR, BRS-SFA, BRS-SSP)
Pro Format:
- [ ] Vollständigkeit: Alle Decks aus CSV werden gelistet (kein Filter verliert Daten ungewollt)
- [ ] Player-Count pro Deck = exakt sum(player_count) über alle Turniere des Formats
- [ ] Win % pro Deck = sum(wins) / (sum(wins)+sum(losses)+sum(ties)) — oder dokumentierte Formel
- [ ] Day-2 Conversion % pro Deck = sum(day2_players) / sum(day1_players) — oder dokumentierte Formel
- [ ] Score = winPct * (1 + day2Conv) ist rechnerisch nachvollziehbar
- [ ] Ranking-Reihenfolge entspricht Score-Sortierung absteigend
- [ ] Min-30-Players-Filter (Z. 4952) ist konsistent angewendet
- [ ] Falls Share-Spalte existiert: korrekte Formel und korrekter Wert
- [ ] Tournament-Anzahl korrekt (z.B. 6 für SVI-ASC)

### 3.2 Past-Meta-Drill-Down (`renderPastMetaPerformance` + Matchup-Matrix)
Pro Format × pro Archetyp:
- [ ] Tournaments-Spalte = Anzahl distinct tournament_ids in denen der Archetyp erscheint
- [ ] Players-Spalte = sum(player_count)
- [ ] Record W-L-T = sum pro Spalte
- [ ] Win-% und Day-2 Conversion konsistent mit Frozen-View
- [ ] Matchup-Matrix-Zellen = exakt aus `labs_tournament_matchups_<META>.csv`, korrekt nach Archetyp gefiltert
- [ ] Matchup-Symmetrie: A vs. B + B vs. A = 100 % (oder Ties-bereinigt)

### 3.3 Meta-Call-Predictor (laufendes Format)
- [ ] Online-Share-Eingabe (`ladderShare`) wird aus richtiger Quelle geladen und richtig normalisiert
- [ ] Snapshot-at-Major-Werte stimmen mit `online_share_history/` überein
- [ ] Trend-Map `share_change` ist auf konsistenten Zeitraum berechnet
- [ ] Jede Predictor-Stage (4.0a, 4.5, 4.6, 4.7, 2.3) lässt sich für mindestens 3 Test-Decks von Hand nachrechnen
- [ ] Final % summiert über alle Decks zu ≤100 % (oder ist explizit normalisiert)
- [ ] Counter-Score basiert auf korrekten Matchup-Daten

### 3.4 Familien-Aggregation
- [ ] `extractMainPokemon` ordnet jedes Deck korrekt zu (für alle aktuell vorhandenen Deck-Namen in allen CSVs)
- [ ] `buildGroups` dedupliziert Varianten korrekt (keine Doppelzählung)
- [ ] Im Group-by-Modus = sum(Family) ≤ 100 %
- [ ] Family-Display-Name korrekt
- [ ] Click-to-Expand zeigt die richtigen Varianten

### 3.5 UI-Konsistenz
- [ ] Format-Selector schaltet alle abhängigen Tabellen / Charts gleichzeitig um
- [ ] Cache-Invalidierung beim Format-Wechsel funktioniert (kein "stale" Wert von vorherigem Format)
- [ ] Loading-States werden korrekt entfernt
- [ ] Bei fehlenden Daten: Empty-State statt falscher 0 / NaN / undefined
- [ ] i18n: alle Spaltentitel + Tooltips übersetzt
- [ ] Mobile-Layout zeigt dieselben Werte wie Desktop

### 3.6 Datenpipeline-Integrität
- [ ] CSV-Header in allen `labs_tournament_decks_*.csv` identisch
- [ ] Keine duplizierten (tournament_id, deck_name)-Paare
- [ ] `total_players` pro Turnier konsistent über alle deck_name-Zeilen desselben Turniers
- [ ] `format_window.json` Setze stimmen mit existierenden CSV-Dateien überein
- [ ] `labs_tournaments.json` Tournament-IDs decken alle in den CSVs vorkommenden tournament_ids ab
- [ ] Keine Werte mit ungewollten NaN, undefined, null in den CSVs

---

## 4. Methodik der nachfolgenden Phasen

### Phase 1 — Reproduktion
Für jede Auffälligkeit aus Abschnitt 2: App lokal starten, exakte UI-Stelle identifizieren, Screenshot, Browser-Devtools-Inspektion welche Quelldatei den Wert geliefert hat, Hypothesen-Liste validieren oder verwerfen. Liefert: `01-repro-svi-asc-crustle.md`, `01-repro-tef-por-dragapult.md`.

### Phase 2 — Root-Cause-Analyse
Stack-Trace vom UI-Wert bis zur Datenquelle. Identifizierung der genauen Code-Zeile(n), die den falschen Wert produzieren. Liefert: `02-rca-<auffälligkeit>.md` mit "Fixed by: <konkret>".

### Phase 3 — Fix-Plan
Konkreter Patch-Vorschlag pro RCA. Liefert: `03-fix-plan.md`.

### Phase 4 — Fix-Implementierung
Code-Änderungen. Pro Fix ein eigener Commit. Nach jedem Commit Punkt 5 wiederholen.

### Phase 5 — Full-Sweep-Verifikation
Verifikationskatalog (Abschnitt 3) als Skript ausführen, jeden Häkchen-Punkt PASS/FAIL bewerten. Liefert: `05-verification-report.md`. Pass-Kriterium ist 100 % PASS.

### Phase 6 — Regressionstests
Tests die in Zukunft jede gefundene Diskrepanz fangen. Liefert: Test-Files unter `tests/audit/meta-call/`.

### Phase 7 — Abschlussbericht
Zusammenfassung: Was war kaputt, was wurde gefixt, was wurde getestet. Liefert: `07-final-report.md`.

---

## 5. Offene Punkte für Phase 1 (zu klären sobald App läuft)

1. **Welche UI-Stelle genau zeigt "10.29 % Share" für Crustle?** Render-Funktion + Spaltenname + Source-Property im JS-Objekt.
2. **Welche UI-Stelle genau zeigt "45.98 % predicted" für Dragapult-Familie?** Group-by-Pokemon-Tabelle + welche Spalte (Final %, Online %, My Estimate, andere).
3. **Predictor-Standard-Modus oder Counter-Meta-Modus aktiv beim 45.98 %?** Falls Counter-Meta-Mode, ist die Zahl evtl. die Suppressions-Zielgröße statt der Original-Vorhersage.
4. **Wie genau berechnet Limitless die Share auf der referenzierten Past-Meta-Seite?** (Da Sandbox die Domain blockiert, muss dies via Build-Pipeline oder anderem authentifizierten Tool nachgeladen werden — alternativ als Annahme dokumentiert und akzeptiert wenn unsere Pooled-Formel mit User-Beobachtung übereinstimmt.)

---

## 6. Acceptance-Kriterium für Spec-Abnahme (dieser Phase 0)

Diese Spec wird abgenommen wenn der User bestätigt:
1. Scope ist vollständig (keine zusätzliche User-sichtbare Meta-Call/Past-Meta-Stelle fehlt).
2. Soll-Werte 1.964 % (SVI-ASC Crustle pure) und 29.85 % (TEF-POR Dragapult-Familie historisch) sind als Ground-Truth-Anker akzeptiert.
3. Verifikationskatalog (Abschnitt 3) ist die richtige Vollständigkeits-Latte (insbesondere "100 % PASS = Done").
4. Die in Abschnitt 5 offenen Punkte dürfen in Phase 1 geklärt werden, ohne dass die Spec erweitert werden muss.
