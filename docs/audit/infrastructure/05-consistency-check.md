# Phase 5 — Konsistenz-Check

**Datum:** 2026-05-26
**Branch:** `main` @ `aede307`
**Methode:** Code-Diff von duplizierten Helper-Funktionen, Datenpunkt-Stichproben an mehreren UI-Stellen, Format-/Schema-Vergleich zwischen Files.

---

## 5.1 Helper-Funktionen — Drift-Check

### `normalize(name)` — duplizierte Definition

**Status: ✅ identisch** — bewusste Mirror-Duplikation

- `js/app-meta-call.js:421` und `js/archetype-icons.js:32`
- Beide implementieren denselben Regex: `/[\s\-'‘’‛`´ʼ]/g`
- Comment in `archetype-icons.js:33` sagt explizit *"Mirror of js/app-meta-call.js normalize()"*
- → **kein aktueller Drift**, aber strukturell schwach (zwei Wahrheiten ohne automatischen Sync)

### `parseCSV(text, sep)` — duplizierte Definition

**Status: ⚠️ unterschiedlich implementiert!**

**`app-core.js:1644`** — nutzt **PapaParse** (externe Library):
```javascript
function parseCSV(text, delimiter) {
    const raw = String(text || '');
    if (!raw.trim()) return [];
    const inferredDelimiter = delimiter || ((firstLine.match(/;/g) || []).length >= ...);
    const results = Papa.parse(raw, {
        header: true,
        delimiter: inferredDelimiter,
        skipEmptyLines: true,
        dynamicTyping: false
    });
    ...
}
```
- Auto-detect delimiter (`;` vs `,`)
- Robust gegen Quoted-Fields, embedded newlines, BOM

**`app-meta-call.js:373`** — eigene **naive** Implementation:
```javascript
function parseCSV(text, sep) {
    const lines   = text.replace(/\r/g, '').split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(sep).map(h => h.trim().replace(/^﻿/, ''));
    return lines.slice(1).filter(l => l.trim()).map(l => {
      const vals = l.split(sep);
      ...
    });
}
```
- **Keine Quoted-Field-Unterstützung** — würde `"foo, bar"` bei `,`-Separator falsch splitten
- Caller muss `sep` explizit übergeben

**Praktische Auswirkung — KEIN aktueller Konflikt:**
- `parseCSV` in `app-core.js` wird **nur 1× referenziert** (die Definition selbst); offenbar export-ready aber ungenutzt
- `parseCSV` in `app-meta-call.js` wird **8× genutzt** und ist die de-facto-Implementation
- Beide Files lesen **disjunkte CSV-Sets**:
  - `app-core.js` → `current_meta_card_data.csv`, `tournament_cards_data_cards.csv` (über `loadCSV`-Helper)
  - `app-meta-call.js` → `labs_tournament_*.csv`, `limitless_online_*.csv`, etc.

→ **🟡 Finding 5-A:** Code-Duplikation ohne aktuellen Bug, aber Drift-Risiko. Wenn ein zukünftiges CSV in beiden Modulen gelesen wird, könnte das Verhalten subtle anders sein (naive split vs PapaParse-Quoting). Sollte konsolidiert werden, z.B. in `app-utils.js`.

### `parseEU(str)` — nur in `app-meta-call.js`

**Status: ✅ keine Duplikation (false alarm aus Phase 3)**

- `js/app-meta-call.js:367` ist die einzige Definition (`parseFloat((str || '0').replace(',', '.'))`)
- `app-core.js` hat kein eigenes `parseEU` — vermutlich nutzt es eine andere Konvention oder den Helper aus `app-utils.js` (nicht überprüft im Detail)

→ Korrektur zu PreF 3-E: nur `parseCSV` ist wirklich doppelt — `parseEU` nicht.

---

## 5.2 Datenpunkt-Konsistenz — Mega Greninja

**Source of Truth:** `data/limitless_online_decks_comparison.csv:Mega Greninja`
```
new_share=8,12  new_count=239  old_share=8,23  rank=2  win_rate=41,69%
```

### Cross-Check über alle Files die Mega Greninja erwähnen

| Datei | Wert | Format | ✅/❌ |
|---|---|---|---|
| `limitless_online_decks_comparison.csv` | `new_share = 8,12` | EU-Komma | ✅ Source |
| `limitless_online_decks.csv` | `share = 8.12%` + `share_numeric = 8,12` | **gemischt** US-Punkt + EU-Komma | ⚠️ (siehe 5-B) |
| `online_share_history/2026-05-26.csv` | `share = 8,12` | EU-Komma | ✅ |
| `online_tournament_top8_decks.csv` | (anderes Schema — keine `share`-Spalte direkt) | – | n/a |
| `current_meta_card_data.csv` | 66 Karten-Zeilen für Mega Greninja (kein deck-share) | – | n/a (Card-Aggregat) |
| `labs_tournament_decks.csv` | **0 Zeilen** — Mega Greninja nicht in TEF-POR Majors | – | ✅ erwartet (CRI-only Deck) |
| `labs_tournament_matchups.csv` | **66 Zeilen** für Mega Greninja als Opponent in *anderer* Decks Matchup-Listen | – | ✅ |

**Befund: ✅ Konsistenz** — alle Files die den Share angeben sagen `8.12`. Keine Drift in Werten.

→ **🟡 Finding 5-B:** `limitless_online_decks.csv` hat **zwei Spalten** für denselben Wert: `share` (mit US-Punkt: `8.12%`) UND `share_numeric` (mit EU-Komma: `8,12`). Mehrfach-Wahrheit für denselben Wert. Konsumenten müssen sich entscheiden, welche Spalte sie nutzen — falls einer den display-Wert (mit `%`-Suffix) parsed statt der numeric-Spalte, kommt es zu Parse-Fails.

### Archetype-Name-Konsistenz: kein Typo

```
$ awk ... | grep -ohE "Mega.*Greninja" | sort -u
"Mega Greninja"
```

→ ✅ Überall identische Schreibweise, kein Drift.

---

## 5.3 Set-Metadata — **🔴 Konsistenz-Konflikt**

Drei Quellen behaupten unabhängig voneinander, was das "aktuelle Set" ist:

| Quelle | Antwort | Last-Modified |
|---|---|---|
| `data/format_window.json` | **CRI** (Chaos Rising, 2026-05-22) | 2026-05-25 |
| `data/sets.json` | **POR** (Perfect Order, neuestes Set in Liste, order=151) | **2026-05-15** ⚠️ |
| `data/sets_metadata.json` | **POR** (release_date 2026-03-27, höchstes order) | **2026-05-15** ⚠️ |
| `/pokemon_sets_mapping.csv` (root) | **POR** (oberstes in der Liste) | **2026-05-15** ⚠️ |
| `data/products_singles_6.json` | Hat 14 CRI-bezogene Live-Code-Card Einträge (digital, nicht physisch) | 2026-05-25 |
| `data/products_singles.json` (legacy) | Vor CRI-Release erstellt | 2026-04-29 |

### Root-Cause

`backend/core/update_sets.py` schreibt laut Header **alle drei** Files: `sets.json`, `sets_metadata.json`, `format_window.json` (Zeile 10-12). Aber der Scraper-Run am 2026-05-25 hat **nur `format_window.json`** geupdated. `sets.json` / `sets_metadata.json` sind seit 2026-05-15 unverändert.

Hypothesen:
1. `update_sets.py` hat einen Code-Pfad-Bug, der den Set-Discovery nur partiell macht
2. Die Limitless-Set-Listing-Seite (`limitlesstcg.com/cards`) hat CRI noch nicht — `_pick_current_set()` findet es im Cards-Index, schreibt es in `format_window.json`, aber die Sets-Liste in `sets.json` wird über einen anderen Code-Pfad gefüllt der CRI noch nicht sieht

### User-sichtbare Auswirkung

- **Card DB Tab** filtert über Sets → CRI fehlt im Filter-Dropdown (`pokemon_sets_mapping.csv`-Reader in `app-cards-db.js:996`)
- **Deck Builder** sortiert Karten nach Set-Order (`pokemon_sets_mapping.csv` Reader) → CRI-Karten würden falsch sortiert wenn sie existierten (aber sie existieren nicht in der DB → andere 🔴-Kette)
- **Predictor (Meta Call)** liest `format_window.json` → kennt CRI korrekt, filtert TEF-POR Major-Daten raus

→ **🔴 Finding 5-C:** Drei Quellen für "current set", drei verschiedene Antworten. Konkrete Konsequenz: User kann CRI-Karten nicht in Card DB filtern.

---

## 5.4 Architektur-Fund — **🟡 HTML-als-Daten-Source**

**`js/app-meta-cards.js:1230` — `loadCurrentMeta()`:**
```javascript
const response = await fetch(BASE_PATH + 'limitless_online_decks_comparison.html?t=' + Date.now());
const html = await response.text();
const parser = new DOMParser();
const doc = parser.parseFromString(html, 'text/html');
// FIRST: Execute ALL scripts from loaded HTML (matchup data + utility functions)
const scripts = doc.querySelectorAll('script');
scripts.forEach(script => {
    const scriptElement = document.createElement('script');
    scriptElement.textContent = script.textContent;
    document.head.appendChild(scriptElement);
    ...
});
```

### Was passiert
1. Lädt **829 KB HTML-Datei** (designed für menschliche Ansicht)
2. Parst sie als DOM
3. Findet alle `<script>`-Blöcke
4. **Führt sie als JavaScript aus** (per `document.head.appendChild`)
5. Liest danach die durch die Scripts gesetzten Globals (z.B. `window.matchupData_*`)

### Konsequenzen

| Aspekt | Befund |
|---|---|
| **Performance** | 829 KB statt 7 KB CSV — ca. 100× mehr Data-Traffic für dieselbe Info |
| **Sicherheit** | eval-style Code-Ausführung aus einer Datei. Im eigenen Repo OK, aber muss-trusted source. Wenn jemand den Scraper kompromittiert, kann er JS in der App ausführen |
| **Doppelte Wahrheit** | `_comparison.csv` UND `_comparison.html` enthalten beide die Decks-Tabelle. Wenn Scraper die HTML-Generierung anders updatet als die CSV → Drift |
| **Wartbarkeit** | Wer den Scraper anpasst, muss sowohl HTML als auch CSV im Sync halten. Implicit-Coupling. |

→ **🟡 Finding 5-D:** Architekturelle Schwachstelle. Pragmatisch löst es vermutlich ein Real-Problem (Matchup-Daten als JS-Objekte statt CSV) — aber sauberer wäre ein separates `matchup_data.json` File.

---

## 5.5 Format-Inkonsistenz — Komma vs Punkt vs Suffix

Stichprobe der **Number-Formate** in unterschiedlichen Files:

| Datei | Beispiel-Wert | Format |
|---|---|---|
| `limitless_online_decks_comparison.csv` | `8,12` | EU-Komma, kein Suffix |
| `limitless_online_decks.csv` | `8.12%` (`share`) und `8,12` (`share_numeric`) | gemischt: US + EU im selben File |
| `online_share_history/*.csv` | `8,12` | EU-Komma |
| `labs_tournament_decks.csv` | `16.67` (verifiziert in Audit-Session) | US-Punkt, kein `%` |
| `labs_tournament_matchups.csv` | `46.15` | US-Punkt |
| `price_data.csv` | `0,19€` | EU-Komma + Euro-Suffix |
| `cardmarket_id_mapping.csv` | `284182` (integer) | n/a |

### Konsequenzen für Reader

- `parseEU(str)` in `app-meta-call.js` ersetzt nur Komma durch Punkt — funktioniert für EU-Format
- `parseFloat(str)` direct funktioniert für US-Format
- Wenn ein Reader **die falsche Erwartung** hat (`parseFloat("8,12")` → `8` statt `8.12`), entstehen Werte-Drift

→ **🟡 Finding 5-E:** CSV-Number-Format ist nicht über das Repo standardisiert. Pro Datei ist es konsistent, aber Reader müssen wissen welches Format zu erwarten ist. Risiko bei zukünftigen Reader-Erweiterungen.

---

## 5.6 CSV-Delimiter-Inkonsistenz

Aus Phase 4 schon bekannt, hier mit Stichproben:

| Datei | Delimiter | Reader-Erwartung |
|---|---|---|
| `limitless_online_decks_*.csv` | `;` | `parseCSV(text, ';')` |
| `online_tournament_dated_cards.csv` | `;` | `parseCSV(text, ';')` |
| `online_tournament_top8_decks.csv` | `;` | `parseCSV(text, ';')` |
| `current_meta_card_data.csv` | `;` | via `loadCSV` mit auto-detect |
| `city_league_*.csv` | `;` | `parseCSV(text, ';')` |
| `labs_tournament_decks.csv` | `,` | `parseCSVQuoted(text, ',')` |
| `labs_tournament_matchups.csv` | `,` | `parseCSVQuoted(text, ',')` |
| `cardmarket_id_mapping.csv` | `,` | von `app-price.js` ❓ |
| `price_data.csv` | `,` | via `loadCSV` mit auto-detect |
| `pokemon_sets_mapping.csv` | `,` | `parts = line.split(',')` (manual in `app-cards-db.js:1005`) |

→ **🟢 Finding 5-F:** Delimiter-Konvention ist `;` für die meisten Files, `,` für die labs-Files + price/mapping. Code-Comment in `labs_tournament_scraper.py` bestätigt das ist absichtlich (matchup-CSV von limitless ist Komma). Reader sind aktuell alle aware welches File welchen Delimiter hat — kein aktuelles Drift, aber Falle für zukünftige Reader.

---

## 5.7 Cache-Drift — die Service-Worker-Pre-Cache-Falle

Aus Phase 3 schon bekannt (🟡 PreF 3-C). Hier zur Vollständigkeit:

`js/pokemon-loading-screen.js:18` lädt beim Boot 9 Files vor:
```
data/city_league_analysis.csv          (304 B, Header only)
data/city_league_archetypes.csv        (73 B, Header only) ⚠️
data/city_league_archetypes_past.csv
data/city_league_archetypes_comparison.csv (183 B, Header only) ⚠️
data/city_league_images.json
data/pokemon_dex_numbers.json
data/sets.json
data/ace_specs.json
pokemon_sets_mapping.csv  (✅ jetzt geklärt, existiert im Root)
```

**Pre-Cache-Effekt:**
1. Boot-Screen lädt die 73-B-CSV
2. Service-Worker cached sie
3. Wenn Scraper später die CSV mit Daten überschreibt UND User noch im Service-Worker-Stale-Mode ist → User sieht weiterhin leere Daten

**Aktuelle Mitigation:** Service-Worker ist `network-first` für Daten-Files (siehe `service-worker.js` Header) — Browser holt sich die Frische Version, fällt nur bei Netzwerk-Fehler auf Cache zurück. → Pragmatisch OK, aber Defensive in Depth nicht 100%.

→ **🟡 Finding 5-G:** Pre-Cache lädt leere CSVs (von P-1-A) und bekommt die mit. Falls einmal die Daten-CSVs voller werden, aber User offline ist, sieht er weiter leeren Stand. Akzeptabel solange wir nicht offline-first planen.

---

## 5.8 Geteilte Funktionen Risiko-Matrix

| Geteilte Komponente | Modul A | Modul B | Risiko |
|---|---|---|---|
| `normalize()` | app-meta-call.js | archetype-icons.js | identisch ✅ — bewusste Mirror |
| `parseCSV()` | app-core.js (PapaParse) | app-meta-call.js (naive) | unterschiedlich, aber disjunkte Files ⚠️ |
| Set-Definition | format_window.json | sets.json + sets_metadata.json + pokemon_sets_mapping.csv | **DRIFT 🔴** |
| `_matchupMap` (Online) | global window var | gesetzt von `loadCurrentMeta` aus HTML | indirektes State-Sharing ⚠️ |
| `_majorMatchupMap` (Labs) | global window var | gesetzt von app-meta-call.js | per-meta-keyed, OK ✅ |

---

## 5.9 Erfolgreiche Konsistenz-Checks (was OK ist)

Damit nicht alles negativ klingt — folgende kritische Konsistenz-Punkte sind ✅:

| Check | Befund |
|---|---|
| Mega Greninja Share über 4 Daten-Files | ✅ alle sagen `8.12` |
| Archetype-Name "Mega Greninja" Schreibweise | ✅ konsistent |
| `normalize()` Doppel-Definition | ✅ identisch |
| Predictor `_majorMatchupMap` per-meta-Keying | ✅ funktioniert (nach Audit-Session-Fixes) |
| Meta-Call vs Past-Meta-Modul: Archaludon Duduns WR | ✅ jetzt beide 46.15% (nach Fix `c3bbd38`) |
| Service-Worker `network-first` für Daten | ✅ aktiv |
| Delimiter-Conventions | ✅ pro Datei konsistent |
| `format_window.json` als Truth für Predictor | ✅ wird konsequent gelesen |

---

## 5.10 Konsolidierte Phase-5-Findings

| ID | Titel | Risiko | Belege |
|---|---|---|---|
| **🔴 5-C** | Set-Metadata-Drift: 3 Files, 3 verschiedene "current sets" | high | `format_window.json` vs `sets.json` vs `pokemon_sets_mapping.csv` |
| 🟡 5-A | `parseCSV` doppelt definiert (PapaParse vs naive) | medium | `app-core.js:1644` + `app-meta-call.js:373` |
| 🟡 5-B | `limitless_online_decks.csv` hat doppelte Share-Spalte | low/med | gemischtes Format US/EU im selben File |
| 🟡 5-D | HTML-Datei als Daten-Source (eval-style) | medium | `app-meta-cards.js:1230` |
| 🟡 5-E | Number-Format nicht standardisiert (EU vs US) | medium | mehrere Files |
| 🟡 5-G | Pre-Cache lädt leere CSVs | medium | `pokemon-loading-screen.js:18` |
| 🟢 5-F | CSV-Delimiter inkonsistent (aber pro Datei OK) | low | mehrere |

---

## 5.11 Gesamt-Findings-Update nach Phase 5

**Vorher:** 5 🔴, 13 🟡, 11 🟢
**Nach Phase 5:** **6 🔴, 17 🟡, 11 🟢** (insgesamt 34 Findings)

Plus die Korrektur: PreF 3-E (parseEU doppelt definiert) ist falsch — nur parseCSV ist doppelt. → 16 🟡 statt 17.

---

## 5.12 Was ich in Phase 5 NICHT prüfen konnte

❌ **Live-UI-Konsistenz-Test:** Ich konnte nicht aktiv Browser-Klicks machen um zu verifizieren, dass z.B. das Card DB Tab "kein CRI im Set-Filter" tatsächlich zeigt. Statische Code-Analyse legt es nahe.

❌ **`window.matchupData_*`-Drift:** Wenn die HTML-Datei matchup-Daten injiziert und die CSV-Datei dieselben Daten in anderer Form hat, könnten beide divergieren. Habe nicht die HTML-Script-Blöcke und die CSV-Matchup-Spalten direkt verglichen.

❌ **Firestore-State-Drift:** `users`-Collection wird von 4 Files geschrieben (`firebase-collection.js`, `firebase-globals.js`, `battle-journal.js`, `meta-binder.js`). Wenn diese den gleichen User-Datensatz mit unterschiedlicher Logik schreiben, kann State-Drift entstehen. Habe nicht im Detail angeschaut.

❌ **`app-utils.js`** (63 KB) — ich habe `parseCSV`/`parseEU`-Definitionen nur in `app-core.js` + `app-meta-call.js` gesucht. `app-utils.js` könnte zusätzliche kanonische Helpers haben (z.B. `normalizeCardName` Zeile 533 — nicht gleich `normalize()`!). Eine Konsolidierung dort wäre der natürliche Ort.

---

**STOP nach Phase 5.** Phase 6 (Health-Report + priorisierte Findings) ist das nächste, finale Audit-Doc.
