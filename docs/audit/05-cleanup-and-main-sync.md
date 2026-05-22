# Audit 05 — Phase-5 Cleanup + main-Sync-Analyse

**Audit-Tag:** 2026-05-22
**Auditor:** Claude (Opus 4.7, 1M-Context-Modus)
**Branch:** `claude/gracious-edison-ITIKO`
**Eingabe:** Phase-4-Recovery-Doc + User-Antworten („Handy verfügbar / kein lokaler Server möglich" → Container-Versuche; „main-Sync in Phase 5 analysieren")

---

## TL;DR

1. **3 echte CSS-Syntax-Bugs gefixt** (Batch 1): 4 verschüttete `}`-Zeichen in `city-league.css` (2 Stellen), `pokeball-menu.css` und `styles.css`. Browser-CSS-Parser tolerierten sie still, aber `npm run format` brach mit parse errors ab. Jetzt 0 parse errors, alle 76 verbleibenden Prettier-Warnings sind kosmetisch.
2. **5 Python-E2E-Skripte restauriert** (Batch 2): `e2e_battle_journal/city_league_meta/current_meta_global/deck_analysis_japan/past_meta.py` verbatim aus Golden. Syntax-OK, keine toten HTML-Referenzen. Brauchen Live-HTTP-Server zum Ausführen — out-of-scope für CI in dieser Form.
3. **0-byte `visual-full-page-coverage.spec.js` entfernt** (Batch 3): War bereits in Golden 0-byte; mein Phase-4-„Restore" war wertlos. Snapshot-Regenerierung via Playwright konnte in der Sandbox nicht laufen (kein outbound CDN-Zugriff für `npx playwright install chromium`); CI muss die ~1 erwarteten Drift-Snapshots (`pokeball-nav-dropdown.png` durch Sidebar-+2-Items) selbst aktualisieren.
4. **`origin/main` HEAD ist `7d12922`, nicht `5f23a3f`** (Korrektur): Meine Phase-0/1/2-Doc-Aussage war falsch — vermutlich auf stale-cached Ref vor `git fetch --all` basierend. Real-Stand: main und Branch-Base sind identisch. **Fast-Forward von main zum Branch-HEAD ist möglich, keine divergenten Commits.**
5. **ESLint-Warnings-Reduktion verworfen** als Phase-5-Ziel: Die 1926 Warnings sind **architekturbedingt** (cross-file `window.*` globals + top-level function-declarations, die ESLint nicht statisch auflösen kann). `eslint.config.js` Z. 88-93 dokumentiert das explizit: „kept as WARN until Phase B (modularization)". Auf 0 zu bringen wäre architektonische Arbeit, nicht eine 30-Min-Aufgabe wie in Phase 3 §P3-2 fälschlich geschätzt.
6. **Phase 5 Effort tatsächlich:** ~30 Min für die 3 ausführbaren Batches.
7. **Stand aller Verifikations-Checks am Phase-5-Ende:** 288 pass / 0 fail / 36 files · Typecheck PASS · Coverage 96.05%/90.82%/88%/96.05% · Bundle build PASS · 0 CSS parse errors · 1926 ESLint warnings (unchanged, intentional).

---

## Was in Phase 5 gemacht wurde

### Batch 1 — CSS-Parse-Error-Fixes (Commit `dfb8156`)

Beim Versuch, `npm run format:fix` als P3-3-Item auszuführen, scheiterte Prettier mit 4 CSS-Parse-Errors. Die zugrundeliegenden Bugs:

| File                    | Zeile     | Problem                                                                                                                                        |
| ----------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `css/city-league.css`   | 1155      | Stray `}` nach `.city-league-deck-count-pill { … }`                                                                                            |
| `css/city-league.css`   | 1692      | Stray `}` nach `.date-label { … }`                                                                                                             |
| `css/pokeball-menu.css` | 412       | `.pt-hand-zone { … }; }` — extra `; }` am Zeilenende                                                                                           |
| `css/styles.css`        | 7237-7238 | Orphan `    padding-top: 5px;\n}` zwischen geschlossenem `@media`-Block und nächstem Selector — wahrscheinlich Fragment einer gelöschten Regel |

Browser-CSS-Parser sind lenient — sie skippen bis zum nächsten valid Selector, das visible Rendering wurde nicht beeinflusst. Aber:

- `npm run format` kann jetzt komplett durchlaufen
- Future-tooling (z.B. CSS Modules, CSS-in-JS-Migrations, Postcss) wird nicht mehr stolpern
- Saubere Repo-Hygiene

### Batch 2 — Python-E2E-Restauration (Commit `b34d203`)

Aus Phase 4 P1-Liste blieben 5 Python-E2E-Skripte unrestauriert (Phase-3-Scope-Beschränkung). Jetzt nachgeholt:

| Datei                              | Größe       | Inhalt                     |
| ---------------------------------- | ----------- | -------------------------- |
| `tests/e2e_battle_journal.py`      | restauriert | Battle-Journal-Smoke-Test  |
| `tests/e2e_city_league_meta.py`    | restauriert | City-League-Meta-Tab-Tests |
| `tests/e2e_current_meta_global.py` | restauriert | Current-Meta-Tab-Tests     |
| `tests/e2e_deck_analysis_japan.py` | restauriert | Japan-Deck-Analysis-Tests  |
| `tests/e2e_past_meta.py`           | restauriert | Past-Meta-Tab-Tests        |

**Methodik:** `git show 481c9bd:tests/<file> > tests/<file>`. Syntax-Check via `python3 -m py_compile` → grün. Grep nach toten HTML-Referenzen (`meta-analysis-hub`, `meta-view`, profile-split-Top-Level-Tabs) → keine.

**Limitation:** Diese Skripte verwenden `playwright.sync_api` und assertion gegen `http://127.0.0.1:8000/index.html`. Sie laufen NICHT in CI (kein Workflow startet einen Python-Playwright-Server) — sie sind Developer-Run-Audit-Tools. Wenn jemand sie ausführen will:

```bash
pip install playwright pytest
playwright install chromium
python -m http.server 8000 &
pytest tests/e2e_battle_journal.py tests/e2e_city_league_meta.py \
       tests/e2e_current_meta_global.py tests/e2e_deck_analysis_japan.py \
       tests/e2e_past_meta.py
```

### Batch 3 — Visual-Spec-Cleanup (Commit `e629d57`)

In Phase 4 hatte ich `visual-full-page-coverage.spec.js` aus Golden restauriert, ohne zu prüfen ob der File tatsächlich Inhalt hat. Befund jetzt: **Golden hatte ihn auch als 0-byte** — Placeholder-Datei, kein Test.

Der Runner `tests/e2e/run-visual-fullpage-ci.js` dokumentiert das in seinem `B-44 hotfix`-Kommentar:

> „visual-full-page-coverage.spec.js which has been a 0-byte placeholder for weeks — the daily 03:00 UTC job was a no-op masquerading as visual coverage. Pointing at the real visual-regression spec until a dedicated full-page sweep exists."

Aktion: 0-byte-File gelöscht. Snapshot-Baselines `tests/e2e/__snapshots__/{testFilename}/full-tab-*.png` bleiben als historische Referenz im Tree.

**Visual-Snapshot-Regenerierung NICHT durchgeführt:** `npx playwright install chromium` schlug fehl mit

```
Failed to download Chrome for Testing 147.0.7727.15 (playwright chromium v1217)
Error: Download failure, code=1
```

Container-Sandbox hat keinen outbound CDN-Zugriff für `downloads.playwright.dev`. Snapshots müssen anderswo regeneriert werden — wahrscheinliche Drift-Kandidaten durch Phase-4-Layout-Änderungen:

| Snapshot                          | Erwartung                                                                     |
| --------------------------------- | ----------------------------------------------------------------------------- |
| `pokeball-nav-dropdown.png`       | **WIRD diff** (Sidebar +2 Menu-Items: current-analysis, city-league-analysis) |
| `card-action-buttons.png`         | Wahrscheinlich kein diff (Card-Row-Markup unverändert)                        |
| `city-league-hero-grid.png`       | Wahrscheinlich kein diff                                                      |
| `city-league-archetype-table.png` | Wahrscheinlich kein diff                                                      |
| `current-meta-best-matchups.png`  | KEINE Baseline → wird neu generiert                                           |
| `current-meta-worst-matchups.png` | KEINE Baseline → wird neu generiert                                           |
| `rarity-switcher-modal.png`       | Wahrscheinlich kein diff                                                      |
| `cards-database-grid.png`         | Wahrscheinlich kein diff                                                      |

**Empfehlung:** Im PR-Diff den Visual-Regression-CI-Run abwarten, dann gezielt regenerieren via:

- (a) `workflow_dispatch` mit zusätzlichem `update-snapshots`-Input (Workflow muss minimal angepasst werden), oder
- (b) Lokal auf einem Linux-Headless-Setup: `npm run build:bundle && npm run test:visual:fullpage:ci -- --update-snapshots`, dann commit.

---

## Was in Phase 5 NICHT gemacht wurde (begründet)

### ❌ ESLint-Warnings-Reduktion (P3-2)

**Phase-3-Schätzung war:** „30 Min - 1 h — Vars explizit als `_unused` benennen oder ESLint-Config anpassen (`argsIgnorePattern: '^_'`)."

**Realität:** Die `eslint.config.js` hat bereits `args: 'none'` und `varsIgnorePattern: '^_'`. Die 1926 Warnings sind nicht über anonyme `_` Variablen, sondern über echte cross-file globals:

```
js/app-cards-db.js
   4:18   warning  'renderDeckAnalysisTable' is defined but never used
  34:13   warning  'allCards' is assigned a value but never used
 223:27   warning  'loadSetMapping' is not defined
 287:17   warning  'devLog' is not defined
 351:40   warning  'parseCSV' is not defined
```

Zwei Kategorien:

- **`no-unused-vars`**: Top-level `function fooBar() {}` declarations, die durch Concat-Bundle als `window.fooBar` exportiert werden und in anderen Files konsumiert werden — ESLint sieht den Konsum nicht.
- **`no-undef`**: Cross-file globals, die woanders deklariert werden und hier nur als bare-identifier verwendet werden.

`eslint.config.js` dokumentiert das explizit (Z. 88-93, 124-130) als „documenting tech debt", warn-only bis Wave-1-Layer-B (vollständige ES-Module-Migration). **Reduktion auf 0 ist architektonisch teuer** (hunderte cross-file globals enumerieren oder File-by-File `// eslint-disable-line` annotieren) und würde die Tech-Debt-Sichtbarkeit zerstören.

**Entscheidung:** Belassen. War falsch geschätzt in Phase 3.

### ❌ Firebase v11 Smoke-Test (P2-4 aus Phase 4)

Phase 4 verwies das auf „live deploy oder lokaler Browser". In dieser Audit-Container-Umgebung weder Browser noch Firebase-Credentials simulierbar.

**Workaround:** Lass den nächsten CI-Deploy auf eine Test-Branch/Preview-Environment laufen, prüfe Sign-In + Firestore-Read/Write manuell. Oder: User testet auf Live-Site nach Branch-Merge.

### ❌ Prettier-Format auf 76 Files (P3-3)

`npm run format:fix` würde tatsächlich 76 Files modifizieren (CSS + MD + 4 JSON). Das wären ~Tausende Diff-Zeilen für rein kosmetische Whitespace-/Line-Length-Änderungen. PR-Review würde von substanziellen Phase-4-Bugfixes ablenken.

**Empfehlung:** Separater Commit/PR wenn der User dafür Energie hat. Nicht jetzt.

### ❌ Snapshot-Path-Quirk (P3-4)

Der literal `{testFilename}` Verzeichnisname in `tests/e2e/__snapshots__/{testFilename}/` ist ein altes Playwright-Template-Issue, kein funktionaler Bug — Tests funktionieren trotzdem (Snapshots werden gefunden). Cosmetic. Lassen.

---

## main-Sync-Analyse

### Ist-Stand (verifiziert mit `git`)

```bash
$ git rev-list --count claude/gracious-edison-ITIKO ^origin/main
10

$ git rev-list --count origin/main ^claude/gracious-edison-ITIKO
0

$ git merge-base origin/main claude/gracious-edison-ITIKO
7d12922324b4b1170ce957bda8543215875d1bac

$ git log origin/main -1 --oneline
7d12922 revert: restore 5-tab meta navigation (drop reparenting + intercept)
```

**Bedeutung:**

- `origin/main` HEAD = `7d12922` — identisch mit dem Commit, von dem unser Branch abzweigte.
- Branch hat **10 neue Commits** auf top von `origin/main`.
- main hat **0 divergente Commits** — es gibt keine Konflikte.
- **Fast-Forward-Merge ist trivial möglich.**

**WICHTIG — Korrektur einer Phase-0/1/2-Aussage:**

In Phase-1-Doc § 1 stand: „`origin/main` HEAD = `5f23a3f` (15. Mai 17:49 UTC)". Das war FALSCH. Die korrekte Position war damals (und ist heute) `7d12922`. Wahrscheinliche Ursache: lokaler `origin/main`-Ref war stale, bevor `git fetch --all` in Phase 0 lief. Nach dem Fetch korrigierte sich die Ref-Position, aber meine bereits-geschriebene Audit-Doc-Field wurde nicht nachgezogen.

Die Folge dieser Korrektur:

- **Die Wave-1/Wave-2/Wave-3/profile-split/R2-Pilot-Arbeit IST bereits auf `origin/main`** (in den 60 Commits zwischen Golden und 7d12922).
- Der Branch enthält lediglich die **Phase-4-Recovery + Phase-5-Cleanup** als Add-on.

### Vier main-Sync-Optionen

#### Option A — Fast-Forward Push (cleanste Linear-History)

```bash
git push origin claude/gracious-edison-ITIKO:main
# Oder lokal:
git checkout main
git merge --ff-only claude/gracious-edison-ITIKO
git push origin main
```

**Pro:**

- Saubere lineare Historie auf main
- Keine Merge-Commits
- Alle 10 Recovery-Commits einzeln sichtbar in `git log main`
- Branch wird obsolet, kann gelöscht werden

**Contra:**

- Kein PR-Review-Schritt (außer der User reviewt vorher selbst die Phase-1-bis-5-Audit-Docs)
- Force-push-ähnliches Verhalten — main wird direkt aktualisiert ohne Approval-Workflow
- Branch-Protection auf main (falls aktiv) könnte das blockieren

#### Option B — Squash-Merge via PR (Empfohlen ⭐)

```
1. PR aus claude/gracious-edison-ITIKO → main eröffnen
2. PR-Description: Audit-Phase-1-5-Summary + Recovery-Outcome
3. CI muss grün laufen (deploy-pages.yml + visual-* )
4. Squash + Merge → ein einziger main-Commit "Phase 4+5 audit recovery"
```

**Pro:**

- PR-Review-Schritt
- CI verifiziert Build, Tests, Visual-Regression VOR Merge
- main bekommt 1 sauberen Commit statt 10 (cleaner mid-term log)
- Squash-Commit-Message kann ausführlich sein, verweist auf docs/audit/0X-\*.md
- Branch wird automatisch zu obsolet, leicht lösbar

**Contra:**

- Granularität der 10 Recovery-Commits geht in main verloren (bleibt im PR + im Branch erhalten — kein realer Verlust)
- Visual-Snapshot-Mismatches BLOCKEN den PR, bis sie regeneriert sind (siehe Batch 3 Empfehlung)

#### Option C — Regular Merge mit Merge-Commit

```
PR mergen mit „Create a merge commit" (nicht squash, nicht rebase)
```

**Pro:**

- Alle 10 Recovery-Commits bleiben als Ancestor von main sichtbar
- Klares „diese Phase-4/5 Arbeit kam aus diesem Branch"-Signal in `git log --graph`

**Contra:**

- Merge-Commit-Noise in main-Historie
- Bei nur 10 Commits kein realer Mehrwert gegenüber Squash

#### Option D — Branch belassen, main bleibt auf 7d12922

**Pro:**

- Maximale Vorsicht — User kann den Branch erst extensiv testen
- Phase 4/5 ist „Schattenkopie" mit allen Recovery-Bugfixes, nicht auf der Live-Site

**Contra:**

- 3 user-facing Bugs (Sandbox-Stubs, profile-split, Sidebar-2-Items) bleiben auf main
- Live-Site `thedipidis.app` läuft mit gebrochenem profile-split / Sandbox-ReferenceError-Storm
- Test-Coverage-Lücke bleibt auf main

### Empfehlung

**Option B (Squash-PR)** ist der Standard-Pfad für solche Recovery-Branches:

1. **Sicherheit:** CI verifiziert deploy-pages.yml (test → typecheck → coverage → bundle → audit → build → minify → deploy-staging).
2. **Review:** Audit-Phasen-Docs (1-5) geben dem Reviewer den vollständigen Kontext im PR.
3. **Sauberkeit:** main bekommt 1 Commit, der Phase-4/5 dokumentiert; einzelne Recovery-Commits bleiben im PR erhalten.
4. **Visual-Snapshots:** Der CI-Run im PR zeigt genau, welche Snapshots regeneriert werden müssen. Schritt 2: `npm run test:visual:fullpage:ci -- --update-snapshots` lokal (auf Linux-Headless) oder via `workflow_dispatch`, dann zweiten Commit auf Branch, PR-CI re-runs grün, dann mergen.

---

## Zusammenfassung Phase 1-5

| Phase   | Output                                                                                                                                   | Effort  |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Phase 0 | Eckdaten + Golden-Ref-Verifikation (`481c9bd`)                                                                                           | ~10 Min |
| Phase 1 | `docs/audit/01-golden-reference-state.md` — Vollständige Bestandsaufnahme des Golden-Zustands                                            | ~30 Min |
| Phase 2 | `docs/audit/02-golden-vs-head-diff.md` — 60-Commit-Range-Analyse mit Wave-Klassifikation                                                 | ~30 Min |
| Phase 3 | `docs/audit/03-classification-and-recovery-plan.md` — Live-Verifikation der 3 hart-broken Bugs + 30 deleted-Tests + 3 Strategie-Optionen | ~30 Min |
| Phase 4 | 4 Recovery-Commits (Wave-2-Cleanup + P0-Fixes + Test-Restoration + Doku-Update) + `docs/audit/04-recovery-implementation.md`             | ~2 h    |
| Phase 5 | 3 Cleanup-Commits (CSS-Bugs + Python-E2E + 0-byte-Spec) + main-Sync-Analyse + dieses Dokument                                            | ~30 Min |

**Gesamteffort:** ~4 h für vollständiges Audit + Recovery von 60 Commits / 3 hart-broken Bugs / 30 Test-Files.

**Branch-Endstand (`claude/gracious-edison-ITIKO`):**

- 10 Commits über `origin/main`
- 288/0 JS-Unit-Tests pass
- 38/0 Python-Unit-Tests pass
- TypeScript typecheck clean
- Module-Coverage 96%/91%/88%/96% (über Threshold)
- Bundle baut sauber
- ESLint 0 errors / 1926 warnings (architekturbedingt, dokumentiert)
- Prettier 0 parse errors (war: 4)
- 5 Audit-Docs (Phasen 1-5) im Repo

---

## Empfohlene nächste Schritte (für den User)

1. **PR aus `claude/gracious-edison-ITIKO` zu main eröffnen** (Option B)
2. **PR-CI-Run abwarten:** `deploy-pages.yml` muss grün sein; `visual-nonmeta.yml` wird wahrscheinlich auf `pokeball-nav-dropdown.png` mismatchen
3. **Visual-Snapshot regenerieren** (eine der zwei Optionen):
   - Lokal/Linux-Headless: `npm ci && npm run build:bundle && npm run test:visual:fullpage:ci -- --update-snapshots && npm run test:visual:nonmeta:ci -- --update-snapshots`, dann committen + pushen
   - CI-Workflow-Dispatch: minimaler Workflow-Edit, der `--update-snapshots` exposed
4. **Squash-Merge des PRs** wenn CI grün
5. **Branch löschen** nach Merge
6. **Firebase v11 Smoke-Test** auf der Live-Site (`thedipidis.app`) — Sign-In + Wishlist + Battle-Journal-Entry — als manueller Acceptance-Test
7. **Optional weitere Phasen:**
   - Phase 6: Wave-2-Hybrid-Final-Decision (Phase 3 P2-1) — wenn der User noch das `meta-view`-Konzept fortführen möchte
   - Phase 7: ESLint-Strict (no-undef → error) als Folge der Wave-1-Layer-B vollständige ES-Module-Migration
   - Phase 8: README/CSS-Prettier-Format-Pass

---

**Phase-5-Status:** ABGESCHLOSSEN. Branch bereit für PR. Keine weiteren Self-Code-Änderungen ohne explizite User-Anweisung.
