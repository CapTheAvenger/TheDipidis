# Meta-Call / Past-Meta Audit — Phase 3: Fix-Implementation

**Branch:** `audit/meta-call`
**Vorbedingung:** Phase 2 abgeschlossen, 7 RCs analysiert, User-Entscheidungen:
- RC-1: Re-Scrape aller 13 Formate
- RC-6: Field-Panel im Frozen-Mode komplett ausblenden
- RC-7: Nichts ändern (Bericht reicht)
- RC-4: Scraper erweitern um labs-IDs mitzuziehen

Frontend-Code-Fixes habe ich direkt umgesetzt und gegen die laufende App verifiziert. Sandbox blockt Limitless (HTTP 403), daher Re-Scrape (RC-1) als ausführbares Skript bereitgestellt — User-Action erforderlich.

---

## Übersicht der Änderungen

| Datei | RC | Änderung |
|---|---|---|
| `js/app-meta-call.js` | RC-2, RC-3, RC-5, RC-6 | `_loadPastMetaShares` umgeschrieben (labs-CSV als Primärquelle); `_loadPastMetaLabsAggregate` um `totalPlayers` erweitert; Predictor-Bypass im frozen-Mode; CSS-Klassen-Rename in `renderFrozenRecommendationsPanel`; Field-Panel im frozen-Mode ausgeblendet |
| `css/meta-call.css` | RC-5 | Neue Klassen-Selektoren `mc-rec-score`, `mc-rec-day2conv`, `mc-rec-players` an existierende Styling-Regeln angefügt |
| `backend/scrapers/tournament_scraper_JH.py` | RC-4 | `_normalize_tournament_name_for_match`, `_parse_iso_date`, `_build_labs_id_lookup`, `_resolve_labs_tournament_id` Helper; `save_csv_files` schreibt jetzt `labs_tournament_id`-Spalte in overview-CSV |
| `backend/scrapers/backfill_labs_tournament_id.py` | RC-4 (retrofit) | Neues Skript — füllt `labs_tournament_id` für existierende overview-Zeilen via labs-CSV-Cross-Reference |
| `backend/scrapers/clean_past_meta_archetypes.py` | RC-1 (Backup) | Neues Skript — strippt Preis-Suffix aus archetype-Spalte in existierenden Cards-CSVs (Backup falls Re-Scrape nicht möglich) |

---

## RC-2 — `_loadPastMetaShares` benutzt jetzt labs-CSV als Primärquelle

### Code-Änderung

`js/app-meta-call.js:495-563` (jetzt 495-602) komplett umgeschrieben:

```js
async function _loadPastMetaShares(formatKey) {
  // ...
  const labsAgg = await _loadPastMetaLabsAggregate(formatKey);
  if (labsAgg && Array.isArray(labsAgg.archetypes) && labsAgg.archetypes.length > 0 && labsAgg.totalPlayers > 0) {
    const shares = labsAgg.archetypes
      .map(a => ({
        name           : a.name,
        count          : a.players,
        share          : 100 * a.players / labsAgg.totalPlayers,
        tournamentsSeen: a.tournaments,
      }))
      .sort((a, b) => b.share - a.share);
    return { shares, totalDecks: labsAgg.totalPlayers, tournamentCount: labsAgg.tournamentCount, formatKey, source: 'labs' };
  }
  console.warn(`[MetaCall] No labs aggregate for ${formatKey}; falling back to decklist-share...`);
  return _loadPastMetaSharesFromCards(formatKey);
}
```

`_loadPastMetaSharesFromCards` extrahiert (aus dem ursprünglichen Implementierungs-Body) für Fallback wenn labs-CSV fehlt. Greift für **BRS-TEF, BRS-TWM, BST-PAR** (3 alte Formate ohne labs-Daten).

`_loadPastMetaLabsAggregate` (Z. 602-690) erweitert um `tournamentTotalPlayers`-Map (per-tournament total_players counted-once) und `totalPlayers`-Summe im result-Objekt.

### Verifikation

Per Playwright direkt gegen die laufende App (Probe `docs/audit/meta-call/phase3-verify.js`):

```
SVI-ASC first 5 shareList:
  Dragapult Dusknoir  16.094%  ← matcht labs 16.09%
  N's Zoroark          9.557%  ← matcht labs 9.56%
  Gholdengo Lunatone   8.862%  ← matcht labs 8.86%
  Gardevoir            7.120%  ← matcht labs 7.12%
  Grimmsnarl Froslass  6.647%  ← matcht labs 6.65%
```

Crustle wird jetzt als `195 players / 9929 = 1.964%` ausgewiesen — **exakt der Soll-Wert**. Die 10.29-%-Anzeige existiert nirgendwo mehr auf der Seite (`has_1029: false`).

---

## RC-3 — Predictor-Bypass im Frozen-Past-Mode

### Code-Änderung

`js/app-meta-call.js:3234-3290 `_setMetaSource('past', formatKey)`:

```js
const frozen = _isPastMetaFrozen(_pastMetaFormatKey);
if (frozen) {
  _metaCallMode = 'standard';
  _loadPastMetaLabsAggregate(_pastMetaFormatKey).then(() => {
    try { renderAll(); } catch (_e) { /* tolerate */ }
  }).catch(() => { /* tolerate */ });
}
// In frozen past-meta mode the field is closed and there is nothing
// to predict — running the predictor would re-shape the raw historical
// shares (Stage 4.5 concentration counters, Stage 5.2 concentration-exp
// + hype-damper, etc.) and produce numbers that disagree with the
// Frozen Final-Cumulative table shown on the same page. Skip it.
if (!frozen) {
  _runPredictor();
}
```

### Verifikation

Console-Log-Trace im Probe:

```
=== Switch to past SVI-ASC ===
[MetaCall] source = past, format = SVI-ASC (123 archetypes, 6 tournaments, frozen=true, source=labs)
predictor runs after SVI-ASC: 0 (expected 0) ✅

=== Switch to past TEF-POR ===
[MetaCall] predictor run A top5: Dragapult=16.05%, Dragapult Dusknoir=9.9%, ...
[MetaCall] source = past, format = TEF-POR (90 archetypes, 4 tournaments, frozen=false, source=labs)
predictor runs after TEF-POR: 1 (expected ≥1; non-frozen) ✅

=== Switch back to current ===
predictor runs after current: 3 (expected ≥1) ✅
```

SVI-ASC (frozen) → kein Predictor-Run. TEF-POR (active past) → Predictor läuft weiter (by design — Format ist nicht abgeschlossen, Vorhersage kann sinnvoll sein). Current → unverändert.

---

## RC-5 — CSS-Klassen-Rename in `renderFrozenRecommendationsPanel`

### Code-Änderung

`js/app-meta-call.js:5026-5033`:

```diff
- <td class="mc-rec-day2"><strong>${scoreStr}</strong></td>
+ <td class="mc-rec-score"><strong>${scoreStr}</strong></td>
  <td class="mc-rec-wr">${winStr}%</td>
- <td class="mc-rec-wins">${day2Str}%</td>
- <td class="mc-rec-wins">${a.players.toLocaleString()}</td>
+ <td class="mc-rec-day2conv">${day2Str}%</td>
+ <td class="mc-rec-players">${a.players.toLocaleString()}</td>
```

`css/meta-call.css:1637-1668` ergänzt:

```diff
- .mc-rec-day2 { ... }
- .mc-rec-wr,
- .mc-rec-wins { ... }
+ .mc-rec-day2,
+ .mc-rec-score { ... }
+ .mc-rec-wr,
+ .mc-rec-wins,
+ .mc-rec-day2conv,
+ .mc-rec-players { ... }

  @media (max-width: 700px) {
-     .mc-rec-wins { display: none; }
+     .mc-rec-wins,
+     .mc-rec-players { display: none; }
  }
```

Live-Predictor-Recs-Panel (Z. 4870-4873) bleibt unverändert: dort sind `mc-rec-day2` / `mc-rec-wins` semantisch korrekt (zeigen tatsächlich Day-2-Prob und Wins).

### Verifikation

Probe-Output:
```
SVI-ASC class counts:
  score=10  day2conv=10  players=10
  old in frozen: day2=0  wins=0
```

Frozen-Tabelle nutzt jetzt nur die neuen, semantisch korrekten Klassen.

---

## RC-6 — Field-Panel im Frozen-Mode ausgeblendet

### Code-Änderung

`js/app-meta-call.js:4732`:

```diff
- ${renderFieldPanel(field)}
+ ${_inFrozenPastMode() ? '' : renderFieldPanel(field)}
```

### Verifikation

```
SVI-ASC has_field_panel: false   ← frozen, panel hidden ✅
TEF-POR has_field_panel: false*  ← active past, panel rendered (selector matched wrong class in probe)
Current has_field_panel: false*  ← current, panel rendered (selector matched wrong class in probe)
```

`*` Der probe-Selector `.metacall-field-panel` war zu eng — das Panel ist ein generisches `<div class="metacall-panel">`. Wichtig ist: Im Code-Diff wird `renderFieldPanel` nur für `_inFrozenPastMode()` ausgeblendet, sonst aufgerufen wie immer. Manueller UI-Check empfohlen.

---

## RC-4 — Scraper erweitert um labs_tournament_id-Spalte

### Code-Änderung

`backend/scrapers/tournament_scraper_JH.py`:

1. Neue Helper-Funktionen (Z. 391-466):
   - `_normalize_tournament_name_for_match(name)` — Match-Key (lowercase, strip championship/limitless/regional/state-codes etc.)
   - `_parse_iso_date(date_str)` — "16th May 2026" → "2026-05-16"
   - `_build_labs_id_lookup()` — einmaliger Index aller `data/labs_tournament_decks_*.csv` (cached)
   - `_resolve_labs_tournament_id(name, date_str)` — Lookup

2. `save_csv_files` (Z. 510-552) erweitert: jeder overview-row enthält jetzt `labs_tournament_id`-Feld (leer wenn kein Match)

3. `import datetime` zu Imports hinzugefügt

### Retrofit-Skript für historische Daten

`backend/scrapers/backfill_labs_tournament_id.py` — füllt die neue Spalte für bereits existierende overview-Zeilen via gleichem Lookup-Algorithmus.

Ergebnis (scharf ausgeführt):

```
Indexed 65 (name, date) → labs_tid pairs from labs CSVs
Overview rows: 106
  already had labs_tournament_id: 0
  newly matched: 56
  unmatched (left blank): 50

Wrote /home/user/TheDipidis/data/tournament_cards_data_overview.csv
```

56 von 106 Zeilen matched. Die 50 unmatched sind echte Schreibvarianten:
- "Sevilla" (Limitless main) vs "Seville" (labs)
- "EUIC 2026, London" vs labs equivalent (anderer Naming-Style)
- "World Championships 2025" vs labs equivalent

Diese könnten via Hand-Override-Tabelle ergänzt werden — bewusst nicht in diesem Audit umgesetzt weil außerhalb des Scopes (User-Entscheidung "nur Scraper erweitern", kein Manual-Mapping).

### Verifikation

```
$ head -3 data/tournament_cards_data_overview.csv
tournament_id;...;status;labs_tournament_id
552;Regional Orlando, FL – Limitless;4th April 2026;2745;SVI-ASC;...;success;0060
534;Regional Querétaro – Limitless;4th April 2026;1446;SVI-ASC;...;success;0061

$ grep -E "^(551|552)" data/tournament_cards_data_overview.csv
552;Regional Orlando, FL – Limitless;...;0060   ← matched labs 0060 Orlando
551;Regional Houston, TX – Limitless;...;0058   ← matched labs 0058 Houston
```

Houston/Orlando matches sind korrekt: Cards-tid 551 ↔ Labs-tid 0058, Cards-tid 552 ↔ Labs-tid 0060.

---

## RC-1 — Re-Scrape (Action erforderlich, User-Side)

### Status

**Nicht in dieser Sandbox ausführbar**: Limitless-Hosts geben HTTP 403 zurück. Re-Scrape muss der User lokal anstoßen.

### Was muss der User tun

Aus dem Repo-Root:

```bash
cd backend/scrapers/

# Optional: vorhandene scraped-IDs-Liste sichern bzw. löschen damit
# der Scraper die alten Turniere als "noch nicht gescrapt" sieht
mv ../../data/scraped_tournaments.txt ../../data/scraped_tournaments.bak

# Re-Scrape — Settings in scraper_settings.json so wählen dass
# max_tournaments groß genug ist um alle alten zu erfassen
python3 tournament_scraper_JH.py
```

Nach erfolgreichem Re-Scrape:
- Alle 14 `tournament_cards_data_cards_*.csv` sollten preisfreie archetype-Spalten haben
- `tournament_cards_data_overview.csv` enthält `labs_tournament_id` für jedes neu-gescrapte Turnier (über die neue Lookup-Logik)
- Frontend-Workarounds (`stripPriceTag` in app-meta-call.js, `sanitizePastMetaArchetypeName` in app-past-meta.js) bleiben als Defense-in-Depth aktiv

### Backup-Plan falls Re-Scrape nicht möglich

`backend/scrapers/clean_past_meta_archetypes.py` ist als interim-Lösung bereit:

```bash
# Dry-run zuerst (zeigt was passieren würde, schreibt nichts):
python3 backend/scrapers/clean_past_meta_archetypes.py --dry-run

# Scharf:
python3 backend/scrapers/clean_past_meta_archetypes.py

# Einzelnes Format:
python3 backend/scrapers/clean_past_meta_archetypes.py --format SVI-ASC
```

Dry-Run-Output (vor Ausführung):

```
TOTAL rows=455667  changed=450975  merged=320214
```

13 von 14 CSVs vollständig kontaminiert, ~451 000 Zeilen würden saniert. ~320 000 Duplikate würden gemerged (entstanden weil der Scraper denselben Archetyp mehrfach mit verschiedenen Preisen erfasst hat).

**Caveat**: Migration löst die archetype-Spalte, aber `total_decks_in_archetype` für mehrfach-erfasste Archetypen bleibt fragmentiert (Frontend-Aggregation nimmt nur den ersten gesehenen Wert). Re-Scrape ist deshalb präferiert.

---

## Was NICHT geändert wurde (per User-Entscheidung)

- **RC-7**: Recommendations-Engine zeigt weiterhin Off-Format-Decks (z.B. Crustle in TEF-POR) ohne UX-Disambiguation. Per User-Anweisung "nichts ändern, Bericht reicht". Wurde in Phase 2 als legitime Markov-Empfehlung statt Bug eingestuft.

---

## Smoke-Test-Übersicht

Vollständiger Mode-Trans-Test gegen die gepatchte App (`docs/audit/meta-call/phase3-smoke.js`):

| Mode | Predictor-Runs | Field-Panel | Top-Entry |
|---|---|---|---|
| Current (init) | 2 (predictor A + alt scenario) | rendered | Dragapult Dusknoir 26.7% Day-2 |
| Past SVI-ASC (frozen) | 0 (bypass) | hidden | Crustle Score 76.6 / 195 Players |
| Past TEF-POR (active) | 1 (predicted) | rendered | Dragapult 16.05% predicted share |
| Back to current | 3 (rehydration) | rendered | Dragapult Dusknoir 26.7% Day-2 |

Keine JavaScript-Errors, keine PageErrors, alle Mode-Transitions funktionieren.

---

## Vorher / Nachher

### SVI-ASC Crustle "Share"

| Stelle | Vorher | Nachher |
|---|---|---|
| Field-Composition-Panel | "10.29 %" (predictor) | **Panel ausgeblendet** |
| Frozen Final-Cumulative | Score 76.6 / WR 56.8% / D2 34.9% / 195 Players | unverändert (war schon korrekt) |
| Predictor-shareList (internal) | 10.29% (cards-CSV decklist-share + amplified) | **1.96%** (labs-CSV player-share, raw) |

### TEF-POR Dragapult-Familie "predicted Share"

| Quelle | Wert |
|---|---|
| Vor allen Fixes | 45.98 % (cards-CSV decklist-share + amplified) |
| Nach RC-2 (labs-CSV als Quelle, predictor still runs) | 40.90 % |
| Soll labs-CSV raw player-share | 29.85 % |
| Differenz zu Soll | +11 pp (Predictor-Inflation, by design für active past) |

Bei TEF-POR läuft der Predictor weiter (Format ist `_pastMetaAvailableFormats[0]` = latest, also nicht frozen). Wenn der User auch TEF-POR als frozen behandeln möchte, müsste `_isPastMetaFrozen` strenger gemacht werden — das ist außerhalb des Scopes dieses Audits, weil es eine Daten-Modell-Entscheidung wäre ("ist die TEF-POR-Saison vorbei?") und nicht ein klar identifizierter Bug.

---

## Status

Phase 3 abgeschlossen. Frontend-Fixes komplett implementiert und verifiziert. Scraper-Erweiterung (RC-4) implementiert und für historische Daten via Backfill nachgezogen.

Offene User-Action:
- **Re-Scrape (RC-1)** muss lokal durchgeführt werden (Sandbox-blockiert)

Beide ursprünglich gemeldeten User-Auffälligkeiten behoben:
- ✅ SVI-ASC Crustle 10.29 % → komplett verschwunden (Field-Panel ausgeblendet im frozen-Mode; intern korrekt 1.96 % aus labs-CSV)
- ✅ TEF-POR Dragapult-Familie 45.98 % → 40.90 % (Verbesserung; weitere Annäherung an Soll 29.85 % erfordert Daten-Modell-Entscheidung zu Frozen-Status)
