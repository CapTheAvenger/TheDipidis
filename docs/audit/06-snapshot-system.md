# Audit 06 — Visual-Snapshot-System Findings

**Audit-Tag:** 2026-05-22 (post PR #168 merge)
**Auditor:** Claude (Opus 4.7, 1M-Context-Modus)
**Branch:** `claude/post-merge-cleanup` (off `origin/main` @ `4fbfbb9`)
**Anlass:** Phase-5 prognostizierte, dass PR #168 die `visual-nonmeta.yml` CI auf `pokeball-nav-dropdown.png` zum Failen bringt (Sidebar gewann +2 Menu-Items). Die CI auf PR #168 ging aber **grün** durch — Anlass für eine Tiefenuntersuchung des Snapshot-Systems.

---

## TL;DR

Drei strukturelle Befunde rund um die Visual-Regression-Suite:

1. **`{testFilename}`-Placeholder in `snapshotPathTemplate` ist ein Typo** — Playwright erkennt nur `{testFileName}` (camelCase mit großem `N`). Beide `playwright.config.js`-Configs nutzen `{testFilename}` (lowercase `n`). Unbekannte Placeholder lässt Playwright **literal** stehen. Effekt: alle Specs landen im selben literalen `{testFilename}/`-Verzeichnis statt in spec-spezifischen Subdirs. **Korrigiert** in `9e91001`'s Predecessor.

2. **`RUN_PIXEL_SNAPSHOTS = process.platform === 'win32'`** in `tests/e2e/visual-regression.spec.js:19` — **gating clause für alle 8 Pixel-Comparison-Tests**. Auf CI (Ubuntu/Linux) und macOS skipped die Suite jeden einzelnen Vergleichstest via `test.skip(!RUN_PIXEL_SNAPSHOTS, …)`. Visual-Regression-Coverage existiert nur auf der lokalen Windows-Maschine des Maintainers. **Das ist der eigentliche Grund, warum PR #168 visual-nonmeta grün durchlief — die Snapshots wurden gar nicht verglichen, sondern alle Tests skipped.**

3. **11 Orphan-Baselines** (`full-tab-*.png`) lagen im Snapshot-Dir vom inzwischen gelöschten 0-byte `visual-full-page-coverage.spec.js`. Keine aktive Spec referenziert sie. **Gelöscht** im selben Predecessor-Commit.

---

## 1. Der `{testFilename}` Placeholder-Typo

### Was Playwright erkennt

Aus `node_modules/playwright/lib/worker/testInfo.js` (Playwright 1.59.x, manuell verifiziert):

```js
template
  .replace(/\{(.)?testDir\}/g, …)
  .replace(/\{(.)?snapshotDir\}/g, …)
  .replace(/\{(.)?snapshotSuffix\}/g, …)
  .replace(/\{(.)?testFileDir\}/g, …)
  .replace(/\{(.)?platform\}/g, …)
  .replace(/\{(.)?projectName\}/g, …)
  .replace(/\{(.)?testName\}/g, …)
  .replace(/\{(.)?testFileName\}/g, …)      // ← der EINE richtige Placeholder
  .replace(/\{(.)?testFilePath\}/g, …)
  .replace(/\{(.)?arg\}/g, …)
  .replace(/\{(.)?ext\}/g, …);
```

**Es gibt KEINEN `{testFilename}` (lowercase `n`)** in der Replace-Kette. Was im Template als unbekannter Placeholder ankommt, wird nicht ersetzt — er bleibt als literale 14-Zeichen-Sequenz `{testFilename}` im resolved Path.

### Was im Config stand

```js
// playwright.config.js (alt)
snapshotPathTemplate: '{testDir}/{testFileDir}/__snapshots__/{testFilename}/{arg}{ext}'
//                                                            ^^^^^^^^^^^^^^ typo
```

Für eine Spec an `tests/e2e/visual-regression.spec.js` mit `toHaveScreenshot('foo.png')` ergab das den resolved Path:

```
tests/e2e + ''(testFileDir empty) + /__snapshots__/ + {testFilename} + /foo.png
= tests/e2e/__snapshots__/{testFilename}/foo.png
```

Funktional war das in Ordnung — Playwright suchte und schrieb an dieselbe literale Adresse. Aber:

- **Keine spec-Isolation:** Zwei Specs, die `toHaveScreenshot('foo.png')` machen, würden in derselben Datei kollidieren.
- **Confusing fürs Auge:** Niemand der `tests/e2e/__snapshots__/{testFilename}/` sieht denkt sich „das ist Absicht".

### Fix

```diff
- snapshotPathTemplate: '{testDir}/{testFileDir}/__snapshots__/{testFilename}/{arg}{ext}'
+ snapshotPathTemplate: '{testDir}/{testFileDir}/__snapshots__/{testFileName}/{arg}{ext}'
```

Angewandt in beiden Configs:
- `playwright.config.js:33`
- `playwright.visual-nonmeta.config.js:34`

Resolved Path jetzt: `tests/e2e/__snapshots__/visual-regression.spec.js/foo.png`. Echte spec-Isolation.

### Begleitende Aktion: Baselines umgezogen

Die 6 lebenden Baselines wurden aus dem alten Literal-Dir in den neuen spec-Dir bewegt:
```
tests/e2e/__snapshots__/{testFilename}/        ← weg (deleted)
  → tests/e2e/__snapshots__/visual-regression.spec.js/
```

Files: `card-action-buttons.png`, `cards-database-grid.png`, `city-league-archetype-table.png`, `city-league-hero-grid.png`, `pokeball-nav-dropdown.png`, `rarity-switcher-modal.png`.

---

## 2. Visual-Regression läuft NUR auf Windows

### Das Problem

`tests/e2e/visual-regression.spec.js:19`:
```js
const RUN_PIXEL_SNAPSHOTS = process.platform === 'win32';
```

Jede einzelne der 8 `toHaveScreenshot()`-Assertionen ist mit `test.skip(!RUN_PIXEL_SNAPSHOTS, …)` gegated. Aufrufstellen (Zeilen aus `visual-regression.spec.js`):

| Zeile | Skip-Reason-Text |
|---|---|
| 107 | "Card action button checks run on Windows only" |
| 121 | "Button-width measurements depend on platform font rendering — Windows only" |
| 159 | "Pixel baselines are maintained on Windows only" |
| 180 | "Pixel baselines are maintained on Windows only" |
| 220 | "Pixel baselines are maintained on Windows only" |
| 250 | "Pixel baselines are maintained on Windows only" |
| 343 | "Pixel baselines are maintained on Windows only" |
| 378 | "Pixel baselines are maintained on Windows only" |

### Konsequenzen

| Wo | Was passiert |
|---|---|
| Maintainer lokal (Windows) | Pixel-Tests laufen, baselines werden verglichen, echte Regression-Detection |
| Maintainer lokal (Linux/macOS) | Alle Pixel-Tests skipped, kein Mehrwert |
| **CI (Ubuntu)** | **Alle Pixel-Tests skipped — visual-regression catched 0 Regressions** |
| PR #168 visual-nonmeta-CI | Skipped alles, ging grün durch, deshalb kein Mismatch trotz Sidebar-Layout-Wandel |

Die Begründung steht in den Skip-Strings: Font-Rendering und Anti-Aliasing unterscheiden sich zwischen Windows / Linux / macOS so signifikant, dass dieselbe HTML/CSS auf jeder Plattform unterschiedliche Pixel produziert. Eine Baseline aus Windows funktioniert auf Linux nicht — und umgekehrt.

### Was die Suite EFFEKTIV testet auf CI

Nichts. Die `visual-nonmeta.yml` / `visual-fullpage.yml`-Workflows starten den Server, starten Playwright, Playwright skipped alle Pixel-Tests, der Run endet erfolgreich. Pure no-op aus Regression-Detection-Sicht.

### Empfehlungen (für eine zukünftige Phase)

Wenn echte Visual-Regression auf CI gewünscht ist, gibt es drei Pfade:

1. **Docker-basierte deterministische Render-Umgebung:** Container mit pinned-version Chromium + pinned Fonts + headless-deterministic-rendering-flags. Aufwand: 1-2 Tage Setup, danach reproducible.

2. **Akzeptieren von Fuzzy-Matching:** `maxDiffPixelRatio` von aktuell 0.05 auf 0.10-0.15 hochsetzen, dann baselines auf Linux-headless regenerieren und auf CI vergleichen. Riskiert "subtle bug slipped through" aber besser als die Nullmessung jetzt.

3. **Per-Platform-Baselines:** Multiple baseline-sets, ein Set pro `process.platform`. Playwright unterstützt das via `{platform}`-Placeholder im snapshotPathTemplate. Sehr viel mehr Baseline-Maintenance.

**Keine dieser Optionen wurde in der jetzigen Phase angefasst** — das ist ein separater Werkstattauftrag.

### Symptom für den Maintainer

`pokeball-nav-dropdown.png` ist nach den Phase-4-Batch-2-Sidebar-Änderungen (+2 Menu-Items) **stale**. Beim nächsten Local-Run der Suite auf Windows wird die Spec failen mit pixel-diff. Eine einmalige Regen auf Windows ist nötig:

```bash
npm run test:visual:fullpage:ci -- --update-snapshots
# oder direkt:
npx playwright test tests/e2e/visual-regression.spec.js --update-snapshots
```

Die regenerierten PNGs landen jetzt korrekt unter `tests/e2e/__snapshots__/visual-regression.spec.js/` (dank Fix aus §1) und können committed werden.

---

## 3. Orphan-Baselines aufgeräumt

Im alten `{testFilename}/`-Dir lagen 11 `full-tab-*.png` Files:

```
full-tab-calculator.png       (134 KB)
full-tab-cards.png            (148 KB)
full-tab-city-league-analysis.png (~131 KB)
full-tab-city-league.png      (~131 KB)
full-tab-current-analysis.png (~131 KB)
full-tab-current-meta.png     (134 KB)
full-tab-past-meta.png        (134 KB)
full-tab-profile.png          (135 KB)
full-tab-proxy.png            (~131 KB)
full-tab-sandbox.png          (~131 KB)
full-tab-tutorial.png         (~131 KB)
```

Origin: eine ältere, nicht-leere Version von `tests/e2e/visual-full-page-coverage.spec.js`. Diese Spec wurde irgendwann auf 0-byte placeholder reduziert ("B-44 hotfix" in `tests/e2e/run-visual-fullpage-ci.js:51-55` dokumentiert das) und in Phase-5-Batch-3 (`e629d57`) komplett aus dem Repo entfernt.

Die zugehörigen Baselines wurden vergessen aufzuräumen — bis jetzt. Im selben Snapshot-Cleanup-Commit gelöscht (~1.5 MB Repo-Reduktion).

---

## 4. Aktiver Snapshot-Bestand nach Cleanup

| Datei | Spec-Owner | Baseline vorhanden |
|---|---|---|
| `card-action-buttons.png` | visual-regression.spec.js | ✓ (Windows-baseline) |
| `cards-database-grid.png` | visual-regression.spec.js | ✓ |
| `city-league-archetype-table.png` | visual-regression.spec.js | ✓ |
| `city-league-hero-grid.png` | visual-regression.spec.js | ✓ |
| `current-meta-best-matchups.png` | visual-regression.spec.js | ✗ (würde auto-create bei `--update-snapshots`) |
| `current-meta-worst-matchups.png` | visual-regression.spec.js | ✗ (würde auto-create bei `--update-snapshots`) |
| `pokeball-nav-dropdown.png` | visual-regression.spec.js | ✓ (aber stale wegen Sidebar-Update) |
| `rarity-switcher-modal.png` | visual-regression.spec.js | ✓ |

Alle 8 Baselines unter dem neuen Path `tests/e2e/__snapshots__/visual-regression.spec.js/`. 6 vorhanden, 2 missing (würden beim nächsten `--update-snapshots`-Run angelegt).

---

## 5. Was offen bleibt

- **Visual-Coverage auf CI aktivieren** — siehe §2 Empfehlungen. Bewusst nicht jetzt angefasst.
- **Stale `pokeball-nav-dropdown.png` regenerieren** — einmalige Maintainer-Aktion auf Windows.
- **2 missing baselines erstellen** (`current-meta-best/worst-matchups.png`) — ebenfalls Maintainer-Aktion mit `--update-snapshots`.

---

**Status:** Snapshot-System hat jetzt korrekten Path-Template + saubere Baseline-Sammlung. Die CI bleibt aber „Visual-Regression-blind" auf Linux, bis eine Cross-Platform-Strategie entschieden wird.
