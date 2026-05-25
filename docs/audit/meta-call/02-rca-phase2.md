# Meta-Call / Past-Meta Audit — Phase 2: Root-Cause-Analyse

**Branch:** `audit/meta-call`
**Vorbedingung:** Phase 1 abgeschlossen, 7 Root-Causes hypothetisiert.

User-Entscheidungen aus Phase-1-Review:
1. Phase-2-Tiefe: **alle 7 RCs systematisch nacheinander**
2. Frozen-UI-Strategie: **erst in Phase 3 entscheiden**
3. Scraper-Bug (RC-1): **auch in diesem Audit fixen**

Pro RC: Stack-Trace vom UI-Wert zur Daten-Origin, exakte Code-Stellen, Abhängigkeiten zu anderen RCs, Fix-Skizze.

---

## RC-1 — CSV-Scraper schreibt Preis-Suffix in `archetype`-Spalte

### Stack-Trace

1. **Symptom in CSV**: `data/tournament_cards_data_cards_<META>.csv`, Spalte 5 `archetype`, Beispielzeile:
   ```
   552;Regional Orlando, FL – Limitless;SVI-ASC;4th April 2026;Joltik Box39.92$34.66€;Joltik;SCR 50;...
   ```
   Erwartung: `archetype` enthält nur `"Joltik Box"`, der Preis-String `"39.92$34.66€"` gehört nicht hierher.

2. **Quelle des Müll-Strings**: `backend/scrapers/tournament_scraper_JH.py:415`
   ```python
   title_elem = soup.select_one(".decklist-title")
   raw_deck_name = title_elem.get_text(strip=True) if title_elem else "Unknown Deck"
   deck_name = _clean_deck_name(raw_deck_name)
   ```
   Limitless rendert in `.decklist-title` sowohl den Archetyp-Namen als auch die Preis-Chips (USD/EUR). `get_text(strip=True)` konkateniert beide → `"Joltik Box39.92$34.66€"`.

3. **Fix bereits im Code**: `_clean_deck_name` (Z. 394-406):
   ```python
   _DECK_NAME_PRICE_RE = re.compile(r'\s*\d+(?:[.,]\d+)?\s*\$\s*\d+(?:[.,]\d+)?\s*[€$]\s*$')
   def _clean_deck_name(name):
       cleaned = _DECK_NAME_PRICE_RE.sub('', name).strip()
       return cleaned or name
   ```
   Stripped Preis-Suffix vom Ende. Funktioniert, ist seit Commit `ac6d36c` (2026-05-23) im Repo.

4. **Datenstatus pro CSV**:

   ```
   tournament_cards_data_cards_BRS-PRE.csv  30298 / 30298 contaminated
   tournament_cards_data_cards_BRS-SCR.csv  22011 / 22011 contaminated
   tournament_cards_data_cards_BRS-SFA.csv   6354 /  6354 contaminated
   tournament_cards_data_cards_BRS-SSP.csv  45018 / 45018 contaminated
   tournament_cards_data_cards_BRS-TEF.csv  36571 / 36571 contaminated
   tournament_cards_data_cards_BRS-TWM.csv   7545 /  7545 contaminated
   tournament_cards_data_cards_BST-PAR.csv  41843 / 41843 contaminated
   tournament_cards_data_cards_SVI-ASC.csv  42004 / 42004 contaminated
   tournament_cards_data_cards_SVI-BLK.csv  33189 / 33189 contaminated
   tournament_cards_data_cards_SVI-DRI.csv   9287 /  9287 contaminated
   tournament_cards_data_cards_SVI-JTG.csv  48041 / 48041 contaminated
   tournament_cards_data_cards_SVI-MEG.csv  54835 / 54835 contaminated
   tournament_cards_data_cards_SVI-PFL.csv  73979 / 73979 contaminated
   tournament_cards_data_cards_TEF-POR.csv      0 /  4692 contaminated  ← clean
   ```
   Nur die nach `ac6d36c` neu gescrapte Datei (TEF-POR) ist sauber. Die 13 anderen Formate sind 100 % kontaminiert (~450 000 Zeilen).

5. **Frontend-Workaround**: Sowohl `app-past-meta.js:74 sanitizePastMetaArchetypeName` als auch `app-meta-call.js:515-517 stripPriceTag` strippen das Suffix beim Lesen. Funktional korrekt; Nachteile:
   - Erhöht CSV-Lesekosten (Regex pro Zeile, ×450 000)
   - Verdeckt das Datenproblem in der Quell-CSV — neue Devs sehen die kaputten Daten und denken es sei Absicht
   - Wenn das Preis-Format sich ändert (z.B. CHF, GBP, andere Dezimal-Notation), brechen beide Regex-Versionen ohne Tests die fangen

### Was ist tatsächlich kaputt?
- ✅ Scraper-Code in `tournament_scraper_JH.py` ist sauber
- ✅ TEF-POR-CSV (post-fix gescrapt) ist sauber
- ❌ 13 ältere format-CSVs sind verseucht (Historical data)

### Abhängigkeiten zu anderen RCs
- **Vorbedingung für RC-4**: Wenn die archetype-Spalte sauber ist, lässt sich aggregieren ohne `stripPriceTag`. Erleichtert spätere Cross-Source-Joins (cards vs labs).
- **Keine harte Vorbedingung für RC-2** — RC-2 will sowieso komplett auf labs-CSV umsteigen.

### Fix-Skizze (Details in Phase 3)
**Option A: Re-Scrape** — `tournament_scraper_JH.py` für alle 13 alten Formate neu laufen lassen. Aufwand: Limitless-Requests, dauert vermutlich Stunden, riskiert Rate-Limits. Vorteil: erzeugt frische data und garantiert die anderen Spalten sind auch konsistent.

**Option B: Data-Migration** — Einmal-Skript das alle 13 CSVs liest, `_clean_deck_name`-Regex auf Spalte 5 anwendet, identische Zeilen nach Stripping zusammenfasst (zwei Zeilen mit identischen anderen Spalten und ehemals "Joltik Box39.92$34.66€" und "Joltik Box45.10$30.22€" werden zu zwei Zeilen "Joltik Box" — falls sie identische tid/card haben werden sie deduped, sonst getrennt erhalten). Vorteil: schnell, kein Netzwerk. Nachteil: behebt nur Spalte 5, nicht andere mögliche Konsequenzen.

**Option C: Beibehalt + Workaround dokumentieren** — Die Frontend-Stripping-Logik als permanente Lösung akzeptieren, README ergänzen. Aufwand: minimal. Nachteil: Daten bleiben kaputt.

User-Entscheidung steht aus für Phase 3. Vorschlag: **Option B** (data migration script) ist robust und kostengünstig.

---

## RC-2 — `_loadPastMetaShares` nutzt decklist-share statt player-share

### Stack-Trace

1. **UI-Wert**: Field-Composition-Panel im Meta-Call-Tab bei past-meta-Source. Dragapult-Variant-Share, Crustle-Share etc.
2. **Render**: `renderFieldPanel(field)` (app-meta-call.js:~4570+) konsumiert `field = MetaCall.getPredictedField()` welche aus `_shareList` und Predictor-Output zusammenbaut.
3. **`_shareList`-Initialisierung im past-Modus** (`_setMetaSource('past', formatKey)`, Z. 3242-3250):
   ```js
   const aggregate = await _loadPastMetaShares(_pastMetaFormatKey);
   ...
   _shareList = _pastMetaToShareList(aggregate);
   ```
4. **`_loadPastMetaShares(formatKey)`** (app-meta-call.js:495-563):
   ```js
   const resp = await fetch(`data/tournament_cards_data_cards_${formatKey}.csv?t=` + Date.now());
   ...
   const cnt = parseInt(r.total_decks_in_archetype || '0', 10);
   ...
   shares.push({
     name,
     count,
     share: 100 * count / totalDecks,
     tournamentsSeen: archTournaments.get(name).size,
   });
   ```
5. **Datenbasis**: `tournament_cards_data_cards_<META>.csv` — eine Zeile pro Karte pro Decktyp pro Turnier. `total_decks_in_archetype` ist die Anzahl der **eingereichten Decklisten** für diesen Archetyp in diesem Turnier. Das schließt nur Spieler ein, die ihre Liste publiziert haben (i.d.R. Top-Cut bzw. freiwillig).

### Vergleich der Datenquellen

| Quelle | Was es enthält | Wie es entsteht |
|---|---|---|
| `tournament_cards_data_cards_<META>.csv` | Decklist-share (Top-Cut + Submissions) | Scraper besucht `limitlesstcg.com/tournaments/{id}/cards`, extrahiert publizierte Listen |
| `labs_tournament_decks_<META>.csv` | Player-share (vollständiges Feld) | Scraper besucht `labs.limitlesstcg.com/{id}/decks`, extrahiert Day-1 + Day-2 player counts |

**Konkretes Beispiel SVI-ASC**:
- Cards-CSV: 255 Decklisten verteilt auf 7 Turniere
- Labs-CSV: **9 929 Spieler** verteilt auf 6 Turniere

Decklist-share überrepräsentiert systematisch erfolgreiche Decks (sie kommen in Top-Cut), unterrepräsentiert "Field"-Decks die früh ausscheiden und keine Liste posten. Crustle: 17 Listen (Top-Cut-Erscheinungen) entsprechen 6.67 % decklist-share, aber nur 195 Spieler entsprechen 1.96 % player-share.

### Was ist tatsächlich kaputt?
- Die Funktion liefert **decklist-share als "Share"**. Die UI labelt den Wert als "Online %" / "Final %" / "Share" — keine Kennzeichnung dass es sich um decklist-share handelt.
- Limitless's eigene Past-Meta-Anzeige (`labs.limitlesstcg.com`) zeigt **player-share** — User erwartet diese Konvention.

### Code-Stellen die geändert werden müssen

1. **`app-meta-call.js:495-563 `_loadPastMetaShares`**: Datenquelle wechseln. Statt cards-CSV soll labs-CSV gelesen werden. Aggregate-Logik anders:
   ```js
   // NEU: fetch data/labs_tournament_decks_${formatKey}.csv
   // Schema: tournament_id,..,total_players,..,deck_name,..,player_count,share_pct,...
   // Aggregation: für jeden archetype = sum(player_count) / sum(unique tournaments' total_players)
   ```
2. **`app-meta-call.js:680-690 `_pastMetaToShareList`**: bleibt unverändert — empfängt `aggregate.shares` und produziert Predictor-Format.

3. **Fallback**: wenn labs-CSV fehlt (z.B. sehr alte Formate), könnte cards-CSV als Reserve dienen — aber mit klarer UI-Kennzeichnung "(based on decklist submissions)".

### Abhängigkeiten
- **Voraussetzung für RC-4**: wenn alle past-meta-Quellen aus labs-CSV gelesen werden, sind die tournament_ids konsistent (alle nutzen das labs-Schema). RC-4 löst sich teilweise auf.
- **Voraussetzung für RC-6**: wenn die predicted-Share derselben Datenquelle wie die Frozen-Tabelle entstammt, sind beide Panels koherent.
- **Unabhängig von RC-1**: RC-2 wechselt komplett weg von der kontaminierten CSV. RC-1 ist trotzdem fix-würdig wegen Past-Meta-Tab (`app-past-meta.js`), die diese CSV weiter benutzt.

---

## RC-3 — `_runPredictor()` läuft auch im past-meta-frozen-Modus

### Stack-Trace

1. **`_setMetaSource('past', formatKey)`** (app-meta-call.js:3234-3274):
   ```js
   _shareList = _pastMetaToShareList(aggregate);
   _trendMap = {};
   _tournamentStats = {};
   _labsRowsByDeck = {};
   _labsConvByDeck = {};
   _labsQualityByDeck = {};
   _labsDay2ConvByDeck = {};
   _predictorMode = 'A';
   if (_isPastMetaFrozen(_pastMetaFormatKey)) {
     _metaCallMode = 'standard';
     _loadPastMetaLabsAggregate(_pastMetaFormatKey).then(() => renderAll());
   }
   _runPredictor();   // ← LÄUFT IMMER, auch wenn frozen
   ```

2. **`_runPredictor()`** (app-meta-call.js:2019+): Verarbeitet `_shareList` durch alle Stages:
   - Stage 4.0a `_computeMetaDynamics()` (Z. 2024) — könnte trotz leerer Maps Side-Effects haben
   - Stage 4.5 `_computeConcentrationCounters()` (Z. 2030) — benutzt `_shareList`
   - Stage 4.4 family pre-aggregation (Z. 2036-2047) — bleibt aktiv
   - Stage 5.2 Concentration-Exp + Hype-Damper (Z. 2230+) — bleibt aktiv
   - Stage Trend / momentum (Z. 2091-2096) — `baselineSharePct === 0` weil `_trendMap` leer; Funktion gibt `currentSharePct` unverändert zurück (no-op)
   - Stage Top-8 conversion (Z. 2057-2063) — `convStats` leer; `meanConv = 0.08` Default; pro-Deck `top8Boost = broughtPct * convFactor`; aber `_tournamentStats[k]` ist `null` → `broughtPct = 0` → `top8Boost = 0` (no-op)

3. **Console-Log-Evidenz aus Phase 1**:
   ```
   [MetaCall] predictor 5.2 — Concentration-Exp softened for: Dragapult Dusknoir (^1.40)
   ```
   → Stage 5.2 hat in past-meta-Modus tatsächlich gefeuert.

4. **Quantitatives Resultat**:
   - SVI-ASC Crustle: Raw 6.67 % → predicted 10.29 % (+3.6 pp, ×1.54)
   - TEF-POR Dragapult-Familie: Raw 37.16 % → predicted 45.98 % (+8.8 pp, ×1.24)

### Was passiert in Stage 4.0a/4.5/5.2 trotz leerer Maps?

`_computeMetaDynamics()` (Z. 2024) — muss inspiziert werden:
- Wenn die Funktion auf `_lastMajorByDeck` oder `_lastMajorWindow` zugreift und die in past-meta-Modus auch geleert werden, wäre sie no-op.
- Aber `_setMetaSource('past')` setzt diese **nicht** explizit zurück. Stand vom letzten `current`-Modus könnte hängenbleiben.

`_computeConcentrationCounters()` (Z. 2030) — benutzt `_shareList`:
- `_shareList[i].onlineShare` ist die past-meta-Share (also der Crustle 6.67 %, Dragapult 14.96 % etc.)
- Berechnet Familien-Dominanz und sucht Counter
- Counter werden mit +Boost versehen — z.B. ein Deck das gut gegen Dragapult ist bekommt Share-Boost

`_computeConcentrationExpAndHypeDamper()` (Stage 5.2) — direkt verantwortlich für die Log-Ausgabe:
- "Concentration-Exp softened for: Dragapult Dusknoir (^1.40)" — bedeutet die Share wird mit Exponent 1.40 transformiert (`pow(share, 1.40)`)
- Für `share < 1` (also Anteile in [0,1]): `pow(0.0832, 1.40) ≈ 0.0297` → von 8.32 % auf 2.97 % gedämpft → das stimmt mit "softened" überein
- Aber dann normalisiert der Predictor auf 100 % gesamt → die anderen Decks bekommen ihren Anteil aufgestockt, weil Dragapult-Familie abgesenkt wurde
- Resultat: Crustle (ohne Softening) wird relativ stärker → 6.67 % → 10.29 %

→ **Mathematik passt zusammen**: Familien-Damping bei Dragapult führt zu Anstieg bei nicht-gedämpften Decks wie Crustle.

### Was ist tatsächlich kaputt?

Im **frozen past-meta context** ist die Vorhersage konzeptionell sinnlos: das Format ist abgeschlossen, der Field ist bekannt, es gibt nichts zu predicten. Stattdessen sollte die echte historische Share angezeigt werden.

Im **live past-meta context** (TEF-POR derzeit aktiv) ist die Vorhersage theoretisch sinnvoll, aber das Quellmaterial (decklist-share, RC-2) ist falsch. Nach RC-2-Fix wäre die Predictor-Berechnung auf der richtigen Basis — dann ist zu evaluieren ob sie überhaupt gut funktioniert.

### Code-Stellen die geändert werden müssen

1. **`app-meta-call.js:3272 `_runPredictor()`-Aufruf in past-Modus**: bedingt machen:
   ```js
   if (_metaSource === 'past' && _isPastMetaFrozen(_pastMetaFormatKey)) {
     // No predictor — show raw historical shares unchanged
     // _shareList already populated with onlineShare = raw share
   } else {
     _runPredictor();
   }
   ```

2. **`renderFieldPanel`** muss damit umgehen können dass `field` keine predicted shares enthält, sondern raw shares (oder das Panel im frozen-Mode anders gerendert wird → siehe RC-6).

### Abhängigkeiten
- **Wartet auf RC-2**: erst wenn die raw shares korrekt aus labs-CSV kommen, ist der Bypass-Pfad nützlich.
- **Hängt zusammen mit RC-6**: UI-Frage was im Frozen-Mode angezeigt wird.

---

## RC-4 — Tournament-ID-Schema-Mismatch zwischen labs und cards

### Stack-Trace

1. **labs-CSV** (`labs_tournament_decks_<META>.csv`) — Scraper-Quelle: `labs.limitlesstcg.com/{id}/standings` (siehe `labs_tournament_scraper.py:649`):
   ```python
   m = re.match(r'^/(\d+)/standings', href)
   tournament_id = m.group(1)
   ```
   IDs: 4-stellig zero-padded, z.B. `0056`-`0065`.

2. **cards-CSV** (`tournament_cards_data_cards_<META>.csv`) — Scraper-Quelle: `limitlesstcg.com/tournaments/{id}/cards` (siehe `tournament_scraper_JH.py`):
   IDs: 3-stellig, z.B. `533`, `534`, `543`.

3. **Konsequenz**: Für SVI-ASC:
   - Labs hat: `0056, 0057, 0058, 0059, 0060, 0061` (6 events)
   - Cards hat: `533, 534, 543, 551, 552, 560, 563` (7 events)
   - Cards hat ein extra-Event (`563`) das Labs nicht hat — vermutlich ein kleines Side-Event oder ein Event das Labs (noch) nicht gescrapt hat
   - Labs hat keinen direkten Counterpart zu Cards-ID 543 etc. — vermutlich werden die zwei Systeme zu verschiedenen Zeitpunkten gescrapt

4. **Beispiel-Matching**: Labs `0058 Regional Championship Houston` ↔ Cards `551 Regional Houston, TX – Limitless`. Match ist via name + date möglich, aber **keine ID-Brücke** im Codebase vorhanden.

### Was ist tatsächlich kaputt?

- Wenn RC-2-Fix umgesetzt wird (Wechsel auf labs-CSV), verschwindet das Mismatch weil die App nur eine Quelle nutzt.
- Aber: **Past-Meta-Tab** (`app-past-meta.js`) nutzt cards-CSV für Card-Deck-Listen. Es will Tournament-Performance aus labs-CSV anzeigen. Hier wäre eine Mapping-Tabelle notwendig.

### Code-Stellen die geändert werden müssen

Wenn nach RC-2 die Cards-CSV nicht mehr für Field-Shares benutzt wird, aber für Karten-Details:

1. **Mapping-Tabelle aufbauen** als Build-Schritt: Cross-reference cards-tid und labs-tid by tournament name + date.
2. **`tournament_scraper_JH.py`** könnte erweitert werden um die labs-ID mitzunehmen (durch Cross-Reference auf labs-Index).
3. **Alternativ**: Beide Scraper konsolidieren und nur einen einzigen `tournament_id`-Schlüssel verwenden (großer Refactor).

### Abhängigkeiten
- **Wird durch RC-2 abgemildert**: wenn Field-Share aus labs kommt, ist die ID-Diskrepanz für die MetaCall-Funktion irrelevant.
- **Bleibt relevant für Past-Meta-Tab** wenn man dort Tournament-Performance + Card-Details verknüpft anzeigen will.

---

## RC-5 — CSS-Klassen mismatchen Header/Inhalt in renderFrozenRecommendationsPanel

### Stack-Trace

`app-meta-call.js:4963-4970`:
```js
return `<tr class="mc-rec-row">
  <td class="mc-rec-rank">${i + 1}</td>
  <td class="mc-rec-name">...</td>
  <td class="mc-rec-day2"><strong>${scoreStr}</strong></td>    // Header: "Score"
  <td class="mc-rec-wr">${winStr}%</td>                         // Header: "Win %"
  <td class="mc-rec-wins">${day2Str}%</td>                      // Header: "Day-2 Conv"
  <td class="mc-rec-wins">${a.players.toLocaleString()}</td>    // Header: "Players"
</tr>`;
```

Zur Erinnerung: `renderRecommendationsPanel` (Z. 4801+, die Live-Predictor-Variante) benutzt **dieselben CSS-Klassen, aber mit anderen Werten**:
- `mc-rec-day2` ← Day-2-Wahrscheinlichkeit (korrekt benannt)
- `mc-rec-wins` ← `∅ ${r.expWin}` (korrekt benannt)

Im Frozen-Panel wurden die Klassen vom Live-Panel kopiert ohne den Spalten-Inhalt anzupassen. Effekte:

1. **Spalte 3 hat Klasse `mc-rec-day2`, zeigt aber Score** — Test-Suite die per `[class*='day2']` selektiert würde den Score-Wert zurückbekommen statt Day-2.
2. **Spalte 5 hat Klasse `mc-rec-wins`, zeigt aber Day-2 Conv** — Test der "wins"-Klasse erwartet Wins-Spalte, bekommt Day-2 Conv.
3. **Spalte 6 teilt Klasse `mc-rec-wins` mit Spalte 5** — zwei verschiedene Werte unter derselben Klasse. CSS-Selectoren die `mc-rec-wins` styling bekommen sowohl Day-2 % als auch Player-Count.

### Was ist tatsächlich kaputt?
- Keine User-Sichtbare Auswirkung im Standard-Rendering.
- Brittle: zukünftige Tests, Styling-Anpassungen, Accessibility-Improvements (z.B. `aria-label` per Klasse) sind irreführend.
- Code-Review wird verwirrt: "Was ist `mc-rec-day2`?" beantwortet sich erst durch genaue Inhalt-Inspektion.

### Code-Stellen die geändert werden müssen

`app-meta-call.js:4963-4970` — Klassen umbenennen:
```js
<td class="mc-rec-score"><strong>${scoreStr}</strong></td>
<td class="mc-rec-wr">${winStr}%</td>
<td class="mc-rec-day2conv">${day2Str}%</td>
<td class="mc-rec-players">${a.players.toLocaleString()}</td>
```

`css/meta-call.css` — falls existierende Rules an die alten Klassen-Namen gebunden sind, anpassen. Keine bekannten Selektoren in der Test-Suite gefunden, aber `code-search` notwendig.

### Abhängigkeiten
- Keine. Reiner CSS-Cleanup; kann isoliert gefixt werden.

---

## RC-6 — Frozen-Panel + Predicted-Field-Panel beide sichtbar ohne Disambiguation

### Stack-Trace

`app-meta-call.js:4713-4737 renderAll`:
```js
${renderFieldPanel(field)}                                                 // Always rendered
${_inFrozenPastMode() ? '' : renderCustomDecksPanel()}
${_inFrozenPastMode() ? '' : renderMyDeckPanel()}
${_inFrozenPastMode() ? '' : renderResultsPanel(field)}
${_inFrozenPastMode() ? renderFrozenRecommendationsPanel() : renderRecommendationsPanel(field)}
```

→ Im frozen-Modus:
- `renderFieldPanel(field)` rendert die Field-Composition mit den Predictor-Output-Shares
- Darunter rendert `renderFrozenRecommendationsPanel` die "Fun-Event Final-Cumulative Ranking" mit korrekten Labs-CSV-Werten

Der User sieht **beide Werte parallel** für dasselbe Deck:
- Field-Panel: Crustle "10.29 %" (Predicted Share)
- Frozen-Panel: Crustle "Score 76.6 / Win 56.8% / Day-2 34.9% / 195 Players"

Keine UI-Erklärung dass die zwei Werte aus verschiedenen Quellen sind.

### Was ist tatsächlich kaputt?

UX-Problem: zwei "Share"-artige Zahlen für dasselbe Deck im selben Format, ohne Erklärung. User schließt entweder:
- "Eine davon ist falsch" → Bug-Report (genau das was passiert ist)
- "Beide sind richtig aber bedeuten etwas anderes" → muss anhand des Codes nachvollzogen werden, ist nicht aus UI ersichtlich

### Code-Stellen die geändert werden müssen

Phase-3-Entscheidung. Mögliche Wege:
1. **Field-Panel im Frozen-Mode ausblenden** — `${_inFrozenPastMode() ? '' : renderFieldPanel(field)}`. Konsequenz: keine Field-Composition-Visualisierung mehr für frozen Metas, nur die Final-Cumulative-Tabelle.
2. **Field-Panel im Frozen-Mode aus labs-CSV speisen** — also raw player-share statt predicted. Erfordert dass `_shareList.onlineShare` im frozen-Mode aus labs kommt (Resultat von RC-2 + RC-3).
3. **Field-Panel klar relabel** — "Predicted Field Composition (decklist-based)" vs Frozen-Panel "Historical Final Standings". Schwächste Lösung weil sie das Verwirrungs-Problem in die Texte verlagert.

### Abhängigkeiten
- Hängt direkt zusammen mit RC-2 + RC-3. Wenn diese gefixt sind (Field-Panel speist aus labs-CSV ohne Predictor), wird das Disambiguations-Problem klein.

---

## RC-7 — Off-Format-Decks im Recommendations-Output (downgradet)

### Stack-Trace

Phase-1-Probe für TEF-POR zeigte:
```
1 Crustle 21,1% 52,5% ∅ 4.2
2 Tera Box 18,7% 51,1% ∅ 4.1
3 Dragapult 20,3% 50,8% ∅ 4.1
```

Erst-Verdacht: Crustle ist kein TEF-POR-Deck. Verifikation:

```
labs_tournament_decks_TEF-POR.csv: Crustle entries:
  0062 Prague   43 players
  0063 LA       15 players
  0064 Utrecht  30 players
  0065 Campinas 21 players
  Total: 109 players  (+ 1 Zoroark Crustle)
  Share: 109 / 7073 = 1.54%
```

**Crustle existiert in TEF-POR mit ~1.54 % Player-Share.** Es ist also tatsächlich ein gespieltes Deck.

Die "21.1 %" in der Recommendations-Liste ist die **Markov-simulierte Day-2-Wahrscheinlichkeit** wenn man Crustle gegen das predicted TEF-POR Field spielt — nicht die Field-Share. Aus dem mitgeschnittenen Tooltip:
> "Top matchups vs. predicted field: vs. Dragapult 69 % WR (opponent ≈ 17.1 % of field), vs. Dragapult Dusknoir 57 % WR (11.2 % of field), vs. Dragapult Blaziken 76 % WR (7.3 % of field). Expected wins 4.2 / 8 rounds → 21.1 % chance to clear"

→ Crustle hat starke Matchup-Werte gegen die Dragapult-Familie und schlägt sie deswegen als Empfehlung vor.

### Was ist tatsächlich kaputt?

- **Nicht das was ich in Phase 1 vermutete**. Crustle ist legitim in TEF-POR.
- Die UX bleibt aber problematisch: ein **niedrig-Player-Share-Deck wird als Top-Recommendation gelistet**, ohne dass die Rangfolge-Logik (Markov-Day-2-Prob) sichtbar getrennt von der Field-Share-Logik kommuniziert wird.
- Wenn der User die Top-Rec für "die beliebteste Wahl" hält, ist er irregeführt. Die Tabelle benutzt aber **explizit Day-2-Spalte** (nicht Share), die Tooltip-Reasoning ist gut.

### Code-Stellen die geändert werden müssen

Kein direkter Bug-Fix in Phase 3 nötig. Eventuell:
- Hinweis-Text "(based on simulated matchups; not popularity)" unter dem Tabellen-Header
- Filter-Option "min field share ≥ X %" um Niedrig-Share-Decks aus den Recs zu drücken
- Zweite Spalte "Field share" zur Tabelle hinzufügen so User Share + Day-2-Prob nebeneinander sieht

→ **RC-7 downgegradet**: Kein Bug, UX-Improvement-Kandidat.

### Abhängigkeiten
- Keine harten. Eigene UX-Diskussion.

---

## Konsolidierte Fix-Reihenfolge (Empfehlung für Phase 3)

```
Phase 3.1 — Datenkorrektur (RC-1)
  ├─ Migration-Skript: alle 13 alten Cards-CSVs cleanen (sanitize archetype, dedupe)
  └─ ggf. re-scrape Option als Backup-Plan dokumentieren

Phase 3.2 — Datenquellen-Switch (RC-2)
  ├─ _loadPastMetaShares umschreiben auf labs-CSV
  ├─ Fallback-Pfad wenn labs-CSV fehlt
  └─ Test: SVI-ASC Crustle muss 1.96 % anzeigen (oder ~1.96-2.01 % je nach Familie-Aggregation)

Phase 3.3 — Predictor-Bypass im Frozen (RC-3)
  ├─ _setMetaSource('past'): if frozen, skip _runPredictor
  └─ _shareList.onlineShare bleibt = raw player-share

Phase 3.4 — UI-Disambiguation (RC-6)
  └─ Phase-3-Entscheidung User: Field-Panel im Frozen ausblenden ODER relabel

Phase 3.5 — CSS-Cleanup (RC-5)
  └─ Klassen umbenennen mc-rec-day2 → mc-rec-score, mc-rec-wins → mc-rec-day2conv/-players

Phase 3.6 — Tournament-ID-Mapping (RC-4)
  ├─ Optional, hängt davon ab ob Past-Meta-Tab weiter cards-CSV nutzt
  └─ Build-Schritt: cross-reference table cards-tid ↔ labs-tid

Phase 3.7 — UX-Kommunikation Recommendations (RC-7)
  └─ Optional, Empfehlung: zusätzliche "Field Share"-Spalte in Recs-Tabelle
```

Wichtige Abhängigkeiten:
- **3.2 → 3.3**: Bypass macht erst Sinn wenn die Quelle stimmt
- **3.2 + 3.3 → 3.4**: UI-Entscheidung profitiert vom korrekten Daten-Modell
- **3.1 unabhängig** (kann parallel)
- **3.5 unabhängig** (kann parallel)

---

## Verifikations-Test-Pfad für jeden RC-Fix

Nach jedem RC-Fix in Phase 3 muss reproduzierbar verifiziert werden:

| RC | Test |
|---|---|
| 1 | `awk -F';' 'NR>1 && ($5 ~ /[$€]/)' data/tournament_cards_data_cards_*.csv` → 0 Zeilen |
| 2 | `MetaCall._setMetaSource('past','SVI-ASC')` → Field-Panel zeigt Crustle ≈ 1.96 % |
| 3 | Console-Log: bei frozen past-Mode keine "predictor 5.2 — Concentration-Exp"-Zeilen |
| 4 | Build-Skript erzeugt Mapping-CSV mit ≥95 % paired tournaments |
| 5 | `document.querySelectorAll('.mc-rec-score')` enthält Score-Werte, `.mc-rec-day2conv` enthält Day-2-Werte |
| 6 | Phase-3-spezifisch — abhängig von gewählter UI-Strategie |
| 7 | Phase-3-spezifisch — wenn UX-Verbesserung umgesetzt, Field-Share neben Day-2-Prob sichtbar |

---

## Status

Phase 2 abgeschlossen.

- ✅ Alle 7 RCs in der Reihenfolge des Daten-Flows untersucht
- ✅ Code-Zeilen pro RC identifiziert
- ✅ Abhängigkeiten zwischen RCs kartiert
- ✅ Datenpfad RC-1 → RC-2 → RC-3 → RC-6 als kritischer Pfad bestätigt
- ✅ RC-7 von "Bug" auf "UX-Kandidat" downgraded (Crustle ist legitim in TEF-POR)
- ✅ Fix-Reihenfolge mit Abhängigkeiten skizziert

**Bereit für Phase 3 — Fix-Plan** mit konkretem Code, Skripten und User-Entscheidungen zu Open Questions (insbesondere RC-6 Frozen-UI-Strategie, RC-1 Re-Scrape-vs-Migration, RC-7 UX-Verbesserung).
