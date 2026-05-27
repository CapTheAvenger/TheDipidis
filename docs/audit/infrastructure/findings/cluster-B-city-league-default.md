# Cluster B — City-League-Default-Zustand (F-007, F-008, F-009)

**Findings:** 3 — F-007 leere CSV ohne UX-Hinweis, F-008 hartcodierter Default, F-009 Pre-Cache leerer Files
**Risiko:** 🟡 Medium
**Aufwand-Schätzung:** 30 min – 2 h je nach gewählter Variante

---

## TL;DR

Cluster B ist ein **UX-Cluster** rund um den City-League-Tab im Default-Zustand. Drei Findings, alle vom selben Grundproblem: bei einer frischen JP-Set-Rotation (M5 ist seit 22.05.2026 live) sind die "current"-CSVs noch leer, das UI zeigt aber stumm leere Tabellen.

| Finding | Was passiert | User-Erlebnis |
|---|---|---|
| F-007 | `city_league_archetypes.csv` 73 B leer → UI zeigt leere Tabelle | "Page ist kaputt!" — sieht aus wie ein Bug |
| F-008 | Default-Format-Identifier ist hartcodiert `'M4'` (aktuell `'current'`, künftig `'M5'`...) | unsichtbar — funktioniert noch, aber semantisch unklar |
| F-009 | Pre-Loader lädt leere CSVs in den Cache | unsichtbar dank Service-Worker network-first, aber Cache-Drift-Risiko |

---

## F-007 — Leere CSV ohne UX-Hinweis

### Aktueller Stand

Belege:
- `city_league_archetypes.csv` (73 Bytes, Header only)
- `city_league_archetypes_comparison.csv` (183 Bytes, Header only)
- `city_league_analysis.csv` (304 Bytes, fast leer)
- `city_league_archetypes_past.csv` (951 KB, voll mit M4-Historie)

Der Loader in `js/app-city-league.js:240-280` fetched die Files und parst sie. Bei leeren Files → leeres Array. **Kein User-Hinweis** — die Tabelle bleibt einfach leer.

### Root-Cause

JP-Set-Rotation am 22.05.2026: M4 → M5. Bei der Rotation hat `update_sets.apply_format_window_to_scraper_settings` (Zeile 581+) den M4-Stand nach `_past.csv` umgezogen und die `current.csv` mit dem M5-Start-Datum neu initialisiert. Seit 4 Tagen sind aber kaum M5-Tournaments live → leere CSV ist **erwartet** für noch 1-2 Wochen.

### Fix-Optionen

| Variante | Was | Pro | Contra |
|---|---|---|---|
| **B7a — UX-Banner** | Wenn current-CSV ≤ N Bytes oder < N Decks, banner "Noch keine Daten für [SET]. Wechsel zu 'Past Meta' für [PREV_SET]-Daten" | klar, User behält Kontrolle | minimaler UX-Eingriff |
| B7b — Auto-Fallback mit Pill | Bei leerem current, automatisch past laden + Pill "Showing past meta — no current data yet" | User sieht sofort Daten | versteckt den State, Format-Selector ist verwirrend |
| B7c — Default zu Past wenn current leer | Bei leerer current-CSV, selektor-Default auf `M3` (past) setzen | maximalt einfach | User-Setting wird stillschweigend overridden |

**Empfehlung: B7a.** Klare Kommunikation, einfache Implementierung.

### Konkrete Änderung B7a

In `js/app-city-league.js` nach dem fetch (`loadCityLeagueData` Funktion etwa Zeile 290+):

```javascript
// After loading archetypesText:
if (!isPast) {
  const archetypeLines = (archetypesText || '').trim().split(/\r?\n/);
  const dataRowCount = Math.max(0, archetypeLines.length - 1); // minus header
  if (dataRowCount === 0) {
    // Render an empty-state banner instead of an empty table
    container.innerHTML = `
      <div class="cl-empty-state-banner">
        <h3>${t('cl.emptyState.title')}</h3>
        <p>${t('cl.emptyState.body')
              .replace('{set}', _formatWindow?.current_set_jp || 'aktuelles Format')
              .replace('{date}', _formatWindow?.jp_release_date || '')}</p>
        <button onclick="switchCityLeagueFormat('M3')" class="cl-empty-state-cta">
          ${t('cl.emptyState.ctaPast')}
        </button>
      </div>`;
    return;
  }
}
```

Plus i18n-Keys (EN + DE):
- `cl.emptyState.title` = "Noch keine City-League-Daten für {set}" / "No City League data yet for {set}"
- `cl.emptyState.body` = "{set} wurde am {date} released. Sobald genug Tournaments vorliegen, füllt sich diese Tabelle automatisch." / "{set} was released on {date}. As soon as enough tournaments are played, this table fills automatically."
- `cl.emptyState.ctaPast` = "Past Meta anzeigen" / "Show Past Meta"

Plus minimal CSS für `.cl-empty-state-banner` in `meta-call.css` o.ä.

**Test-Strategie:** lokal `city_league_archetypes.csv` auf Header-only kürzen, Reload, Banner soll erscheinen mit korrektem Set-Namen.

**Side-Effects:** keine — das Banner ersetzt nur den leeren Zustand.

**Rollback:** `git revert`.

---

## F-008 — Hartcodierter Default `'M4'`

### Aktueller Stand

Belege:
- `js/app-city-league.js:103`: `window.currentCityLeagueFormat = localStorage.getItem('cityLeagueFormat') || 'M4';`
- `js/app-tier-meta.js:396`: `formatSuffix = currentCityLeagueFormat === 'M3' ? '_M3' : '';`
- `js/app-tier-meta.js:427/575`: `isM4Format = currentCityLeagueFormat === 'M4'`
- `index.html:565`: `<option value="M4">Current Meta</option>`

### Was `'M4'` und `'M3'` semantisch bedeuten

Aus dem Code-Comment (`js/app-city-league.js:240`):
> *"'M3' is the legacy internal id for 'Past Meta' — the frozen snapshot at the last JP-set rotation."*

Also:
- `'M4'` = "current" (auch wenn das wirklich aktuelle Set inzwischen M5 ist)
- `'M3'` = "past"

Die Identifier sind **nicht** Set-Codes, sondern semantische Labels die zufällig wie Set-Codes aussehen. Das ist verwirrend.

### Risikoeinschätzung

- **Aktuell kein User-Bug.** UI zeigt "Current Meta" / "Past Meta" als Labels, die Werte `'M4'`/`'M3'` sind Implementation-Detail.
- **Wartungsproblem:** wenn jemand denkt, die Werte sollen Set-Codes sein und auf `'M5'` ändert, brechen alle `=== 'M4'`-Checks.

### Fix-Optionen

| Variante | Was | Aufwand | Risiko |
|---|---|---|---|
| B8a — Comment-Header ergänzen | Klarer Comment in jedem File: `// 'M4' = current meta, 'M3' = past meta (legacy identifier)` | 5 min | 0 |
| **B8b — Semantisches Refactor** | Werte `'M4'` → `'current'`, `'M3'` → `'past'` global ändern + localStorage-Migration | 1-2 h | niedrig (lokaler Lese-Fehler nach erstem Load, dann ok) |
| B8c — Dynamische Auflösung | `'M4'` → `format_window.current_set_jp` bei jedem Read | mittel | mittel — viele Stellen, alle müssen synchron sein |

**Empfehlung: B8b** — saubere Lösung mit minimalem Wartungsrisiko. localStorage-Migration ist ein 5-Zeilen-Snippet.

### Konkrete Änderung B8b

1. **`js/app-city-league.js:103`** — Default + Migration:
```javascript
let stored = localStorage.getItem('cityLeagueFormat');
// Migration: legacy values 'M4' (current) and 'M3' (past) → new 'current'/'past'
if (stored === 'M4') stored = 'current';
else if (stored === 'M3') stored = 'past';
window.currentCityLeagueFormat = stored || 'current';
if (stored !== localStorage.getItem('cityLeagueFormat')) {
  localStorage.setItem('cityLeagueFormat', window.currentCityLeagueFormat);
}
```

2. **Alle `=== 'M4'`** → `=== 'current'`
3. **Alle `=== 'M3'`** → `=== 'past'`
4. **`<option value="M4">`** → `<option value="current">`, gleich für M3
5. **`switchCityLeagueFormat(value)`** akzeptiert beide Werte für eine Übergangszeit:
```javascript
function switchCityLeagueFormat(format) {
  if (format === 'M4') format = 'current';
  else if (format === 'M3') format = 'past';
  // ... rest
}
```

**Test-Strategie:** 
- Lokal: localStorage clear, Page laden, `currentCityLeagueFormat` ist `'current'`
- User mit alter `localStorage='M4'`: Page laden, automatisch migriert zu `'current'`
- Dropdown switchen, prüfen dass past/current korrekt laden

**Side-Effects:** Migration läuft einmal beim ersten Load. Danach state ist clean.

**Rollback:** `git revert`. localStorage bleibt auf `'current'` — neue App-Version würde das wieder als legacy lesen und re-migrieren (zurück zu `'M4'` wenn `git revert`).

---

## F-009 — Pre-Cache leerer CSVs

### Aktueller Stand

`js/pokemon-loading-screen.js:18` lädt 9 Files beim Boot:
- `city_league_analysis.csv` (304 B leer)
- `city_league_archetypes.csv` (73 B leer)
- `city_league_archetypes_past.csv` (951 KB ✓ voll)
- `city_league_archetypes_comparison.csv` (183 B leer)
- `city_league_images.json` (38 KB ✓)
- `pokemon_dex_numbers.json` (15 KB ✓)
- `sets.json` (2 KB ✓)
- `pokemon_sets_mapping.csv` (2.8 KB ✓)
- `ace_specs.json` (1.3 KB ✓)

### Auswirkung

- Boot-Splash zeigt "9/9 Files geladen" — fühlt sich erfolgreich an, obwohl 3 Files leer sind
- Cache-Drift: wenn der Scraper später die CSV mit Daten füllt und der User offline ist (Service Worker im Cache-Fallback), würde der User weiterhin die leere Version sehen

**Service-Worker mitigiert das:** Aus `service-worker.js`:
> *"Data files → Network-first (fresh scraper output; fall back to cache offline)"*

→ Normaler Browser-Load: SW fetcht immer frisch, Cache ist nur Fallback. Risiko ist gering.

### Fix-Optionen

| Variante | Was | Pro | Contra |
|---|---|---|---|
| B9a — Skip leerer Files | Pre-Loader skippt Files die < threshold Bytes sind | direkt + transparent | naive Schwelle (Header-Größe variiert) |
| B9b — Smart-Detection | Pre-Loader parsed minimal: `if (rowCount === 0) skip` | robust | mehr Code, mehr Boot-Zeit |
| B9c — Nichts tun | Status quo lassen — SW network-first mitigiert | 0 Aufwand | Cache-Drift bei offline möglich |

**Empfehlung: B9a** — pragmatisch.

### Konkrete Änderung B9a

In `js/pokemon-loading-screen.js` nach dem fetch:
```javascript
fetch(url).then(r => r.ok ? r.text() : null).then(text => {
  if (!text || text.trim().length < 300) {
    // Empty-or-header-only file — don't pre-cache the dead snapshot
    return null;
  }
  // ... cache it ...
});
```

300 Bytes ist eine sichere Schwelle (`city_league_archetypes_comparison.csv` mit Header-only ist 183 B). Pro File anpassbar wenn nötig.

**Test-Strategie:**
- Boot-Splash zeigt jetzt korrekt "6/9" oder ähnlich wenn 3 Files leer sind
- Wenn Files später voll werden → SW fetcht fresh → kein Cache-Drift

**Side-Effects:** Keine. Reine Boot-Side.

**Rollback:** trivial.

---

## Reihenfolge der Commits

Drei atomare Commits in dieser Reihenfolge:

1. **B7a — UX-Banner für leeren City-League-State** (größter User-Wert)
2. **B9a — Pre-Loader skipt leere Files** (defense-in-depth)
3. **B8b — Semantisches Refactor `M4/M3` → `current/past`** (Code-Hygiene)

---

## Entscheidung die ich vom User brauche

### Entscheidung 1: F-008 (semantisches Refactor)

Brauchst du das jetzt oder ist es Code-Hygiene-Backlog?

- **B8b sofort:** klean, aber mehrere Files anfassen
- **B8a "nur Comment":** 5 min, behält ein verständliches Wartungsrisiko
- **Backlog:** Schiebe auf später, nur F-007 + F-009 jetzt

### Entscheidung 2: F-009 (Pre-Cache)

Soll ich's machen oder ist es zu defensive?

- **B9a:** macht den Boot-Splash transparenter, aber kein User-sichtbarer Bug
- **Skip:** SW mitigiert eh

---

**STOP nach Phase 7.** Warte auf Entscheidungen, dann starte ich Phase 8.
