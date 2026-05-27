# Cluster D — Architektur-Findings

**Findings:** 9 — F-006, F-014, F-015, F-016, F-017, F-023, F-032, F-033, F-034
**Risiko-Verteilung:** 1× 🔴, 5× 🟡, 3× 🟢
**Aufwand-Schätzung:** Ein Tag falls alles am Stück. Sinnvoll in 3 Sub-Sessions zu splitten.

---

## Update aus der Investigation

Drei Findings sind nach Detail-Check **false-positive aus Phase 3** und können direkt geschlossen werden:

| Finding | Status nach Investigation |
|---|---|
| F-032 Settings-Tab unklarer Init | ✅ **false positive** — Tab hat reinen inline-HTML-Inhalt (Display-Name + Buttons + Auth-Felder). Kein init() nötig, weil keine dynamische Daten-Last. |
| F-033 `profileCompareDecklists` nicht eindeutig lokalisiert | ✅ **false positive** — Definition in `app-features.js:644`, Window-Binding L770. Phase-3-grep hatte nicht weit genug gesucht. |
| F-034 `normalize()` doppelt definiert | ✅ **bewusste Mirror** — beide Files haben identischen Body + expliziten "Mirror of …"-Comment. Phase 5 hat bestätigt: kein aktueller Drift. |

→ Bleiben **6 Findings** für tatsächliche Fixes.

---

## Übersicht der verbleibenden Findings

| ID | Titel | Risiko | Aufwand | Empfohlene Reihenfolge |
|---|---|---|---|---|
| F-014 | `format_filter` Defaults hartcodiert (PFL/POR) in mehreren Scrapern | 🟡 | 20 min | **1** (quick win) |
| F-023 | `pokemon_sets_mapping.csv` liegt im Repo-Root statt `data/` | 🟢 | 30 min | **2** (quick win) |
| F-016 | `limitless_online_decks.csv` hat doppelte Share-Spalte (US + EU) | 🟡 | 1 h | **3** |
| F-015 | `parseCSV` doppelt definiert (PapaParse vs naive split) | 🟡 | 1-2 h | **4** |
| F-017 | SW `SHELL_ASSETS` muss manuell gepflegt werden | 🟢 | 2-3 h (Build-Step) | **5** (eigene Session) |
| F-006 | `loadCurrentMeta()` lädt HTML als Datenquelle (eval-style) | 🔴 | 1-2 Tage | **6** (eigene Session) |

---

## F-014 — `format_filter` Defaults zeigen auf veraltete Sets

### Aktueller Stand

`config/scraper_settings.json` hat den **richtigen** Wert:
- `current_meta_analysis.sources.limitless_online.format_filter = "CRI"` ✓

ABER die Scraper-Files haben **veraltete Defaults**, die greifen wenn die Config fehlt oder schlecht parsed wird:

| Datei | Zeile | Default-Wert |
|---|---|---|
| `current_meta_analysis_scraper.py` | 161 | `"PFL"` (vor 2 Sets) |
| `current_meta_analysis_scraper.py` | 291 | `"PFL"` |
| `online_tournament_scraper.py` | 84 | `"PFL"` |
| `online_tournament_scraper.py` | 183 | `"PFL"` |
| `online_tournament_scraper.py` | 397 | `"PFL"` |
| `online_tournament_scraper.py` | 422 | `"PFL"` |
| `config/scraper_settings.json` | 128 | `"POR"` (vor 1 Set — für online_tournament_scraper) |

→ Plus `online_tournament_scraper`-Config selbst zeigt auf POR (vor 1 Rotation). Bug.

### Fix-Optionen

| Variante | Was | Pro | Contra |
|---|---|---|---|
| **D14a — Defaults aktualisieren auf 'CRI'** | hartcodierte Default-Strings überall auf CRI | sofort wirksam, minimaler Code-Change | jede Set-Rotation muss wieder gebumped werden |
| D14b — Defaults aus `format_window.current_set` lesen | sustainable | erfordert Lese-Pfad im Scraper für format_window.json | mehr Code-Komplexität |
| **D14c — D14a + D14b** | Quick + sustainable | beides | Aufwand: ca 30 min total |

**Empfehlung: D14c** — minimaler Code-Change im Scraper, plus Config-Werte richten.

### Konkrete Änderungen

1. **`config/scraper_settings.json:128`** `"format_filter": "POR"` → `"CRI"` (online_tournament_scraper-Block)
2. **`current_meta_analysis_scraper.py`** + **`online_tournament_scraper.py`**: Funktion ergänzen:
   ```python
   def _read_current_set_fallback(default='CRI'):
       """Read format_window.current_set if present, else fallback."""
       fw_path = os.path.join(_get_data_dir(), 'format_window.json')
       if os.path.isfile(fw_path):
           try:
               with open(fw_path) as f:
                   fw = json.load(f)
               return str(fw.get('current_set') or default).strip().upper()
           except (OSError, json.JSONDecodeError):
               pass
       return default
   ```
   Plus alle `"PFL"`-Defaults durch Aufruf ersetzen.

### Test
- Trash `config/scraper_settings.json` temporär, Scraper läuft mit "CRI"
- Mit Config — overrides win, kein Verhalten-Change

---

## F-023 — `pokemon_sets_mapping.csv` im Repo-Root

### Aktueller Stand

```
/pokemon_sets_mapping.csv           ← Datei hier
/data/*.csv                          ← alle anderen Daten-Files hier
```

4 Reader greifen mit relativen Pfaden zu:
- `js/app-cards-db.js:998` — `fetch('pokemon_sets_mapping.csv')`
- `js/app-core.js:2405` — `fetch(\`./pokemon_sets_mapping.csv?t=…\`)`
- `js/pokemon-loading-screen.js:24` — `url: 'pokemon_sets_mapping.csv'`
- `js/csv-cache-interceptor.js:26` — Cache-Key

### Fix

1. Move `pokemon_sets_mapping.csv` → `data/pokemon_sets_mapping.csv`
2. Update 4 Reader auf neuen Pfad
3. Commit

### Test
- 4 Stellen mit dem neuen Pfad gleich + page-load testet alles

---

## F-016 — Doppelte Share-Spalte in `limitless_online_decks.csv`

### Aktueller Stand

`limitless_online_scraper.py:165-168`:
```python
"share": share,              # raw text: "8.12%" (US-format mit Suffix)
"share_numeric": share_numeric,  # float: 8.12 (parseable)
```

CSV-Output enthält:
```
share=8.12%, share_numeric=8,12
```

→ Zwei Spalten, eine US-Style-display + eine EU-numeric. Konsumenten müssen wissen welche sie nutzen.

### Welche Reader nutzen welche Spalte?

Aus den 5 Online-Readern (Phase 3): die meisten lesen `new_share` aus `_comparison.csv`, NICHT direkt aus `_decks.csv`. Direkter Reader von `_decks.csv` ist:
- `js/app-current-meta-analysis.js:443` — `loadCSV('limitless_online_decks.csv')` — was es danach macht: in Phase 4 untersucht.

### Fix-Optionen

| Variante | Was | Pro | Contra |
|---|---|---|---|
| **D16a — `share` als float schreiben** | Komma-Format, kein `%`-Suffix | konsistent mit anderen CSVs | Reader die `share` als "8.12%" erwarten brechen |
| D16b — `share` weglassen, nur `share_numeric` behalten | minimal | Spalten-Schema-Bruch für externe Konsumenten |
| D16c — beides behalten, Comment in Header | Stable | Doppel-Speicher-Pfad bleibt |

**Empfehlung: D16c** — sicherheitsfirst. Status-quo annotieren statt riskante Schema-Änderung.

### Konkrete Änderung D16c

In `limitless_online_scraper.py` (vor dem Write-Loop):
```python
# CSV-Spalten-Konvention:
#   - 'share'         : display value, e.g. '8.12%' — US-format, mit Suffix
#   - 'share_numeric' : numeric value, e.g. 8.12   — float, kein Suffix
# Reader-side: bevorzugt 'share_numeric' für Berechnungen,
# 'share' nur für UI-Display ohne Parsing.
```

Plus: stell sicher dass alle JS-Reader `share_numeric` nutzen (Comment im Reader-Code).

→ **Nicht-blocker** — defensive Klarstellung statt struktureller Fix.

---

## F-015 — `parseCSV` doppelt definiert

### Aktueller Stand

- `app-core.js:1644` — PapaParse-basiert, auto-detect-delimiter, robust
- `app-meta-call.js:373` — eigene naive split-Implementation
- Aktuell **disjunkte Reader** — kein konkreter Bug, aber Drift-Risiko

### Fix

1. **Canonical parseCSV in `app-utils.js`** (PapaParse-Variante)
2. **`app-meta-call.js:373` löschen** und `parseCSV`-Aufrufe so lassen — wenn `app-utils.js` vor `app-meta-call.js` lädt, ist die Funktion da
3. **`app-core.js`'s Kopie kann bleiben oder weg** — aktuell IIFE-encapsulated, gar nicht global exposed → kann weg
4. Verify: `parseCSV` global im window-namespace nach app-utils-Load

### Test
- Lokal: `npm test` (falls existiert)
- Browser: alle CSV-Loaders durchlaufen prüfen (kann mit Network-Tab + Console gemacht werden)

### Risiko

`app-meta-call.js`'s naive split funktioniert für Komma- + Semicolon-CSVs ohne Quoted-Fields. **Labs matchups CSV** hat KEINE Quoted-Fields (eigentliches CSV ist `,`-delimited aber keine Quotes drin). Migration zu PapaParse sollte transparent sein.

ABER: `parseCSVQuoted` in `app-meta-call.js:390` ist eine separate Funktion die für die labs-CSV explizit Quoted-Fields handhabt. Die bleibt.

---

## F-017 — SW SHELL_ASSETS manuell pflegen

### Aktueller Stand

`service-worker.js` hat 24 hartcodierte JS-Files in `SHELL_ASSETS`. Wenn ein neuer JS-File hinzugefügt wird, muss SHELL_ASSETS manuell aktualisiert werden, sonst Offline-Cache zeigt keine Inhalte.

### Fix-Optionen

| Variante | Was | Aufwand |
|---|---|---|
| **D17a — Status quo + Comment** | Comment dass List manuell gepflegt werden muss | 5 min |
| D17b — Build-Step (Pre-Deploy script) | Vor jedem Deploy: scan index.html → generate SHELL_ASSETS | 2-3 h |
| D17c — Service Worker auto-scans index.html | runtime-Lookup statt hardcoded | komplex (SW kann nicht ohne fetch DOM lesen) |

**Empfehlung: D17a — status quo dokumentieren** für jetzt. Build-Step kann separat als Nice-to-have kommen.

### Konkrete Änderung D17a

In `service-worker.js` über `SHELL_ASSETS = [...]` einen Comment hinzufügen:
```javascript
// MAINTAINER NOTE: When adding a new <script src="js/..."> entry to
// index.html, also add it here so the SW caches it for offline use.
// Missing entries silently fail with a network-error on offline boot.
// (Tracking ticket: a build-step that auto-generates this from
//  index.html would remove the manual sync, but the list is short and
//  changes < 1×/quarter so it's not worth the build infra yet.)
```

---

## F-006 — `loadCurrentMeta()` lädt HTML als Datenquelle 🔴

### Aktueller Stand (siehe Phase 5 Detail-Audit)

`js/app-meta-cards.js:1230`:
```javascript
const response = await fetch(BASE_PATH + 'limitless_online_decks_comparison.html?t=' + Date.now());
// ... DOMParser parses 829 KB HTML
scripts.forEach(script => {
    const scriptElement = document.createElement('script');
    scriptElement.textContent = script.textContent;
    document.head.appendChild(scriptElement);  // EVAL
});
```

Was die HTML enthält:
1. **Matchup-Tabellen** (für Display gerendert)
2. **`window.matchupData_*`-Globals** in `<script>`-Blöcken

Was die App davon braucht:
- Nur die **Matchup-Daten** als JS-Objekte

### Fix-Optionen

| Variante | Was | Aufwand |
|---|---|---|
| **D6a — Scraper schreibt `matchup_data.json` separat** | JSON-File mit den Matchup-Daten direkt. Frontend lädt JSON statt HTML. HTML bleibt nur als User-Report. | 1-2 Tage (Scraper + Frontend) |
| D6b — Scraper schreibt JSON, HTML wird automatisch generiert daraus | Single Source of Truth | komplexer, riskanter |
| D6c — Status quo + Sicherheits-Comment | nur Doku, kein Fix | 5 min |

**Empfehlung: D6a** — sauberer Refactor. Aber: **eigene Session**, weil es nicht in 30 min geht.

### Konkrete Änderungen D6a

1. **`limitless_online_scraper.py`** — neue Output-File `limitless_online_matchups.json`:
   ```json
   {
     "createdAt": "2026-05-26T...",
     "matchups": {
       "Dragapult": {"Mega Greninja": 69.6, ...},
       "Mega Greninja": {"Dragapult": 30.4, ...},
       ...
     }
   }
   ```
2. **HTML-Generation** kann bleiben (für menschliche Reports)
3. **`app-meta-cards.js:1230`** — refactor `loadCurrentMeta` zu:
   ```javascript
   const response = await fetch(BASE_PATH + 'limitless_online_matchups.json?t=' + Date.now());
   const data = await response.json();
   // Set up the matchupData_* globals from the JSON
   window.matchupData = data.matchups;
   ```
4. Andere `matchupData_*`-Konsumenten anpassen

**Test:**
- Vor Refactor: Snapshot von `window.matchupData_*` nach `loadCurrentMeta()` machen
- Nach Refactor: gleicher Snapshot

**Side-Effects:**
- HTML-File bleibt — Backwards-compat für andere Nutzer
- Performance ↑↑: 829 KB HTML → ~50 KB JSON

→ Lasse ich für eine eigene Session — der größte Fix in diesem Cluster.

---

## Reihenfolge der Commits

### Heute machbar (4 Quick Wins + 1 Konsolidierung)

1. **F-014** Defaults aktualisieren — quickest
2. **F-023** File-move `pokemon_sets_mapping.csv` nach `data/`
3. **F-016** Doc-Comment für share/share_numeric
4. **F-017** SW SHELL_ASSETS Maintainer-Comment
5. **F-032 + F-033 + F-034** als false-positive im Audit schließen (im Commit-Message dokumentieren)

### Eigene Session (groß)

6. **F-015** `parseCSV` konsolidieren — moderate, kann allein
7. **F-006** HTML-als-Datenquelle ersetzen — groß, kann allein

---

## Empfehlung

**Heute fixen:** F-014, F-023, F-016 (Comment), F-017 (Comment), Investigation-False-Positives doc'en (F-032/33/34).

**Separate Sessions später:** F-015, F-006.

Alternative: nur F-014 + F-023 jetzt (echte Bugs/Cleanup), Rest auf Backlog.

---

**STOP nach Phase 7.** Sag mir welche Findings ich heute fixen soll. Falls F-006 oder F-015 dabei sein soll → eigene Mini-Session, weil größerer Aufwand.

---

## Execution-Log

Phase 8 (Fixes) für Cluster D — alle 6 Findings + 3 false-positive-Closes.

| Commit | Finding | Status |
|---|---|---|
| `0e6f08a` | F-014 — `format_filter` Default-Strings via `format_window.json` statt hartcodiert `PFL`/`POR` | ✅ |
| `d7a6f6f` | F-023 — `pokemon_sets_mapping.csv` aus Repo-Root nach `data/` verschoben, 3 Reader updated | ✅ |
| `2e5924d` | F-016 + F-017 — Maintainer-Comments für `share`/`share_numeric` Konvention + SW SHELL_ASSETS sync. Plus Stale-Comment-Fix in `firebase-collection.js:4629`. | ✅ |
| `751d2d8` | F-015 — Dead-code `parseCSV` aus `app-core.js` entfernt, `app-meta-call.js`'s eigene Variante mit Scope-Comment. Drift-Risiko geschlossen ohne globalen Refactor. | ✅ |
| `3a40e7f` | **F-006 🔴** — `loadCurrentMeta()` ersetzt: kein eval-style script-execution mehr. Matchup-Daten aus `limitless_online_decks_matchups.csv` (CSV) statt aus den `<script>`-Blöcken in der 829 KB HTML. HTML-Load bleibt für innerHTML (Stats/Climbers/Tables), nur script-eval-Pfad weg. | ✅ |
| (kein Code) | F-032, F-033, F-034 — false positives aus Phase 3 (siehe Investigation oben), keine Code-Aktion | ✅ closed |

### Was nicht im Scope dieses Clusters war (bleibt offen)

- **`firebase-multiplayer.js`** — wurde in Cluster C entfernt (`da96bcb`)
- **`config/scraper_settings.json` `proxy`-Block** mit Credentials — separater Sicherheits-Sweep, im Audit-Backlog vermerkt
- **F-006 zukünftige Iteration** — wenn das visible UI weg von der statischen HTML migriert (template-rendered Stats/Climbers/Tables im Client), kann auch der HTML-Load entfallen. Heute bleibt das HTML als render-pre-rendered Hilfsfile.
