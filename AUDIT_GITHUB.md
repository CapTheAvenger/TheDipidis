# AUDIT_GITHUB.md

Repository-Audit · CapTheAvenger/TheDipidis · Read-only Senior-DevOps-Review

**Audit-Basis:** `main` @ `9a6e4e27` (2026-06-12), aufgenommen lokal nach
`git pull origin main`. Werkzeuge: `npm audit` 6.0.2, GitHub Actions
REST-API, lokales `git`/`grep`/`find`. Keine Code-Änderungen, keine
Commits, keine Branches angelegt.

---

## Executive Summary

24 Befunde über drei Phasen — Repository-Hygiene, Build/CI/CD,
Dependencies/Security. Drei Befunde sind **HIGH**: eine fehlende LICENSE
für ein öffentliches Repo, ein toter Playtester-Loader, der bei jedem
Klick auf den (in der Sidebar bereits entfernten) Sandbox-Pfad mit 404
crasht, und ein Drift zwischen `firestore.rules` im Repo, dem Markdown-
Spickzettel `FIRESTORE_RULES.md` und dem Code, der Collections beschreibt
die das Repo-Rule-Set nicht abdeckt. (Ein vierter HIGH-Befund am
`per-decklist-scrape.yml`-Trigger hat sich beim Re-Verify als False
Positive herausgestellt — die Cron-Struktur ist korrekt, der Workflow
ist nur 3 Tage alt und hatte seinen ersten Slot noch nicht.) Sechs
MEDIUM-Befunde betreffen vor allem stale Doku (README/PROJECT_STRUCTURE/
MULTIPLAYER zeigen auf entfernte Module), fehlende Lockfiles in
`bot/` + `prerender/` sowie das Fehlen jedes Lint/Typecheck-Gates. Keine
hartkodierten Secrets im tracked Code, `npm audit` ist sauber, Firestore-
Regeln (so wie sie lokal liegen) sind restriktiv. Repository-Sicherheits-
posture ist solide, die offenen HIGH-Punkte sind alle in wenigen Stunden
adressierbar.

---

## Findings-Tabelle

| ID  | Severity | Bereich | Befund | Beleg | Empfehlung |
| --- | -------- | ------- | ------ | ----- | ---------- |
| F-01 | HIGH | Code-Hygiene | `DEFERRED_PLAYTESTER_SCRIPTS` lädt vier JS-Module die im Repo nicht existieren (`playtester.js`, `playtester-mobile.js`, `playtester-patch.js`, `firebase-multiplayer.js`). `index.html:520` dokumentiert „Replaces the retired in-app sandbox", aber Loader + Tab-Map-Eintrag stehen weiter. | `js/app-core.js:407-411,481-505,509`; `js/app-core.js:169-172` (Tab-Map `'sandbox'`); `ls js/playtester*` → not found | Loader + Wrapper-Bindings + Tab-Map-Eintrag entfernen; `notify.playtesterLoading`/`notify.playtesterError` i18n-Keys mit räumen. |
| F-02 | LOW | Code-Hygiene | `tmp_404_probe.py` + `tmp_past_meta_probe.py` im Repo-Root — Wegwerf-Probes seit 3 Wochen tracked. | `ls tmp_*.py`; `git log -1 --format="%H %ad" -- tmp_404_probe.py` → `ac6d36c` 2026-05-23 | `git rm` beide Dateien. |
| F-03 | LOW | Repository-Hygiene | `old Data for Claude/old_playtester.js` (159 KB) + `old_playtester-mobile.js` (29 KB) sind tracked, obwohl Pfad-Konvention nur „temporären Kontext für Claude" sagt. | `git ls-files "old Data for Claude/"` → 2 Files | `git rm --cached`, danach `.gitignore` greift. |
| F-04 | MEDIUM | Dead Code | `frontend/components/{header,sidebar,TabContent_*.html}` + `frontend/css/dashboard-theme.css` sind tracked, aber von `index.html` nirgends inkludiert (`grep frontend/ index.html` → 0). Sieht aus wie ein Dashboard-Prototyp der nie verdrahtet wurde. | `git log -1 --format="%H %ad" -- frontend/` → 2026-05-23; `grep -rn "frontend/" index.html .github scripts` → leer | Entscheidung erzwingen: entweder verdrahten (Tab/Route) oder `git rm -r frontend/`. |
| F-05 | MEDIUM | Doku-Drift | Mehrere READMEs zeigen auf entfernte Module / falsche Pfade. **README.md:3,46-47,54,197,216,370** zählt Playtester-/Sandbox-/Multiplayer-Features auf, die in keiner JS-Datei mehr existieren. **PROJECT_STRUCTURE.md:3** hat Stand „März 2026", listet 13 Scraper-Skripte im Root — tatsächlich liegen sie unter `backend/scrapers/` (20+ Dateien). **MULTIPLAYER_INTEGRATION_GUIDE.md:4** referenziert `js/firebase-multiplayer.js`. | siehe Belege | README.md → komplette Tab-Liste an `js/`-Wahrheit angleichen; PROJECT_STRUCTURE.md neu generieren oder löschen; MULTIPLAYER_INTEGRATION_GUIDE.md löschen (Feature retired). |
| F-06 | HIGH | Compliance | `LICENSE` fehlt vollständig; auch im README keine Lizenzaussage. Bei einem Public-Repo bedeutet das GitHub-Default „all rights reserved" — Forks, Dependabot-Resolution und externe Verwendungen sind rechtlich unklar. Zusätzlich fehlen `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`. | `ls LICENSE* CONTRIBUTING* SECURITY* CODE_OF_CONDUCT*` → not found; `grep -i license README.md` → keine Aussage | Mindestens `LICENSE` ergänzen (z. B. MIT oder eigene proprietary); `SECURITY.md` mit Disclosure-Kontakt; `CONTRIBUTING.md` ist optional, sinnvoll falls externe PRs erwünscht. |
| F-07 | LOW | Branch-Hygiene | 44 remote Branches sind in `main` gemerged, aber nicht gelöscht; 29 davon sind älter als 30 Tage. Älteste: `origin/feat/meta-call-predictor-v2` (2026-04-27). | `git branch -r --merged origin/main \| grep -v main \| wc -l` → 44; `git for-each-ref refs/remotes/origin/ ... \| awk '$1 < "2026-05-13"' \| wc -l` → 29 | `git push origin --delete <branch>` für die merged-Liste; das war bei jeder bisherigen PR-Merge offenbar deaktiviert (Repo-Setting). |
| F-08 | LOW | .gitignore-Drift | `.gitignore:117-118` ignoriert `_archive/`, aber 39 Files unter `_archive/` sind weiter tracked (`.gitignore` greift nur ab dem nächsten `git add`). Gleicher Effekt wie F-03. | `git ls-files _archive/ \| wc -l` → 39 | Einmaliges `git rm --cached -r _archive/`. |
| F-09 | n/a | — | (reserviert / nicht vergeben) | — | — |
| F-10 | n/a | Audit-Spec | Audit-Anweisung erwartet esbuild- + tsconfig-Setup. Projekt nutzt weder esbuild noch TypeScript noch ES-Module — 51 plain `<script src=>`-Tags in `index.html`. `npx tsc --noEmit` ist nicht ausführbar. | `find . -name "tsconfig*" -o -name "esbuild*"` → 0; `grep -cE "<script src=" index.html` → 51; `grep -E "type=\"module\"" index.html` → 0 | Kein Fix nötig — Audit-Spec-Annahme, nicht Realität. Für künftige Audits Phase-2-Spec an reale Toolchain anpassen. |
| F-11 | MEDIUM | CI-Qualität | Pre-Deploy-Gate prüft nur Syntax (`terser --no-module -o /dev/null` über `js/*.js`) und Unit-/Pytest-Suite. **Kein Linter, kein Typecheck, keine Style-Konsistenz.** Bei ~17.5k LOC JS in 44 Modulen läuft alles ohne Static Analysis. | `deploy-pages.yml:100-106`; `ls node_modules/.bin/` → nur `playwright`, kein `eslint`/`tsc`; `package.json:devDependencies` → kein Linter | Minimal: `eslint` als devDep + `eslint --max-warnings 0 js/*.js` ins Pre-Deploy-Gate. Schon ohne Regeln fängt das No-Unused-Vars + No-Undef ab. |
| F-12 | ~~HIGH~~ **False Positive** | Workflow-Bug | **Korrektur (2026-06-12):** Beim Re-Verifizieren ist `schedule:` in `per-decklist-scrape.yml:45-48` strukturell korrekt als Top-Level-Key unter `on:`. Mein Phase-2-Grep hatte fälschlich die Kommentar-Zeile 10 (`#   2. schedule cron …`) als „Cron-Sub-Item unter `workflow_dispatch:`" eingeordnet. Workflow wurde am 2026-06-09 15:24 UTC angelegt — nach dem 12:00-UTC-Slot des Dienstags. Erster Schedule-Lauf ist erst 2026-06-16. Keine Aktion nötig. | `per-decklist-scrape.yml:18-48`; Workflow `created_at: 2026-06-09T10:24:53-05:00` (= 15:24 UTC) | Keine. |
| F-13 | MEDIUM | CI-Frequenz | `bot-keepalive.yml` Doku im Header sagt „every 10 minutes" (mehrfach betont), Cron ist `*/5 * * * *` = alle 5 Minuten. Doppelte Frequenz gegen Plan = doppelter Free-Tier-Verbrauch (~288 Runs/Tag statt 144). | `bot-keepalive.yml:13` Kommentar vs. `:41` `cron: '*/5 * * * *'` | Entscheiden: Cron auf `*/10` ziehen ODER Kommentar auf „every 5 min" ändern. |
| F-14 | LOW | Action-Pins | Inkonsistente Action-Versionen: `actions/checkout@v6` + `setup-python@v6` in fünf Workflows (`weekly-full-update`, `daily-price-refresh`, `champions-replica`, `per-decklist`, `player-continuity`), `@v4` + `setup-python@v5` in vier (`deploy-pages`, `tutorial-screenshots`, `visual-fullpage`, `visual-nonmeta`). | `grep -lE "actions/checkout@v6" .github/workflows/*.yml`; dito @v4 | Einmaliges Sweep: alle auf `@v6` ziehen oder bei `@v4` halten. |
| F-15 | LOW | Workflow-Stabilität | `tutorial-screenshots.yml` hatte 40 % Fail-Rate in den letzten 5 Runs (2 Fails 2026-06-02 vor erstem Success). | API: `total_count: 5`, davon failure am 18:53Z + 20:04Z, success ab 20:16Z | Workflow ist manuell-only, geringes Risiko; Log der Fails bei Bedarf via `mcp__github__get_job_logs`. |
| F-16 | MEDIUM | Test-Lücke | Cross-Surface-Konsistenz-Tests (`tests/python/test_cross_surface_consistency.py`) laufen NUR im Deploy-Pfad (gegen `_site/data/`). Ein PR der `bot-deck-index.json`-Generator-Logik bricht, bleibt grün bis Merge — Deploy-Fail kommt erst auf `main`. | `deploy-pages.yml:271-289`; `visual-nonmeta.yml` enthält Test nicht | Test-Suite in den PR-Gate (`visual-nonmeta.yml` oder neuer Workflow) ziehen — laufen gegen pre-built Artefakt oder Mock-Manifest. |
| F-17 | LOW | Deploy-Robustheit | Service-Worker-Cache-Name wird per `sed -E` Regex über minified JS gefahren. Bei Terser-Quoting-Änderung könnte das Pattern stillschweigend nicht mehr matchen → Cache-Bust tot → User bleiben auf altem SW. | `deploy-pages.yml:189-194` | Cache-Name aus `version.json` zur Build-Zeit interpolieren statt nachträglich zu sed-en. |
| F-18 | LOW | Deploy-Latenz | `deploy-pages.yml` hat `cancel-in-progress: false`. Bei zwei aufeinanderfolgenden Pushes wartet der zweite Deploy auf den ersten. Bei einem Hotfix-Push nach normalem Push kann der Hotfix bis zu 10 min später live sein. | `deploy-pages.yml:13-15` | Auf `true` ziehen — Pages-Deploys sind idempotent, Verlust-Kosten bei Abbruch sind null. |
| F-19 | MEDIUM | Reproduzierbarkeit | `bot/package-lock.json` und `prerender/package-lock.json` sind nicht committed. `npm audit` läuft erst nach `npm i --package-lock-only` (ENOLOCK ohne). CI ruft `npm install` (nicht `npm ci`) → bei jedem Lauf andere Tree-Hash-Auflösung. | `git ls-files bot/package-lock.json prerender/package-lock.json` → leer; `npm audit` in `bot/` → ENOLOCK | Lockfile lokal generieren, committen; CI-Befehle in `deploy-pages.yml:251` (`prerender npm install`) auf `npm ci` umstellen. Render-Build-Step in `bot/render.yaml:46` analog. |
| F-20 | LOW | Dependency-Schuld | Bot-`express` ist 1 Major hinter Latest (4.22.2 → 5.2.1), prerender-`puppeteer` 2 Major hinter (23.11.1 → 25.1.0). Aktuell 0 Vulns, aber Upgrade-Schuld wächst. | `npm outdated` in `bot/` + `prerender/` | Geplantes Upgrade-Window; express 5 hat Breaking Changes, prerender-Puppeteer-25 ebenfalls (Chrome-API). |
| F-21 | MEDIUM | Python-Drift | `daily-price-refresh.yml:73` installiert `firebase-admin` per `pip install`, ohne Version-Pin und ohne Eintrag in `requirements.txt`. Bei jedem CI-Run wird die aktuelle PyPI-Version gezogen — Breaking-Change im SDK kippt den Workflow ohne Code-Änderung. | `daily-price-refresh.yml:73`; `grep firebase-admin requirements.txt` → leer | `firebase-admin>=X,<Y` in `requirements.txt` aufnehmen oder eigenes `requirements-ci.txt` mit Pin. |
| F-22 | LOW | Python-Pins | `requirements.txt` nutzt Range-Pins (`>=X,<Y`) statt Equal-Pins. CI kann zwischen zwei Runs eine Minor-Version-Diff bekommen. | `cat requirements.txt` | Akzeptabel für Scraper; bei Reproduzierbarkeitsbedarf zu `pip-tools` / `pip-compile` mit `requirements.lock` greifen. |
| F-23 | LOW | Workflow-Wartung | Pip-Installs in `deploy-pages.yml` sind über vier Stellen verstreut (`:64,177,288` + Requirements). | `grep "pip install" .github/workflows/*.yml` | Konsolidieren oder als `requirements-ci.txt` zentralisieren. |
| F-24 | HIGH | Firestore-Drift | **Drei Wahrheitsquellen, drei verschiedene Inhalte:** (a) `firestore.rules` (65 LOC, 2026-05-27): nur `/users/{userId}` + Subcollections `decks`/`favorites`, plus `/profiles`, `/collections`, `/wishlists`. (b) `FIRESTORE_RULES.md` (161 LOC, 2026-05-23): `/users/{uid}/{document=**}` Wildcard, `/publicProfiles/{uid}`, `/testingGroupInvites/{groupId}`, `/testingGroups/{groupId}` + Subcollections `activity` + `joinRequests`. (c) Code: `js/app-testing-groups.js:79,97` schreibt auf `publicProfiles` und `testingGroups`; `js/battle-journal.js` schreibt auf `/users/{uid}/battleJournal/…`. Welche Regeln Production hat, ist nicht prüfbar (kein Firebase-CLI in dieser Sandbox). | Belege siehe Phase-3-Report 3.3 | **Variante A** (Live-Regeln = `.md`-Inhalt manuell gepastet): `.md` und `.rules` aufeinander angleichen, `firestore.rules` als Single Source of Truth definieren, `.md` löschen oder in Doku-Header verlinken. **Variante B** (Live-Regeln = `.rules`-Inhalt): Testing-Groups + Battle-Journal sind in Production stillschweigend blockiert; vor Fix mit `firebase deploy --only firestore:rules` die `.md`-Version live nehmen. Erster Schritt für beide Varianten: in Firebase Console die deployten Regeln abrufen und mit den beiden Repo-Versionen vergleichen. |

---

## Priorisierte Fix-Liste

### Quick Wins (≤ 30 Min, niedriges Risiko)

1. **F-02** `git rm tmp_404_probe.py tmp_past_meta_probe.py` — sofortig.
2. **F-13** Einzeiler: Kommentar an Cron angleichen (Cron `*/5` ist absichtlich tighter als das alte `*/10`, siehe Begründung im File; nur die Header-Kommentare „every 10 min" sind stale).
3. ~~**F-12**~~ False Positive — keine Aktion (siehe Tabelle).
4. **F-08** `git rm --cached -r _archive/`. Einmaliger Commit; künftige Files greifen über `.gitignore`.
5. **F-18** `cancel-in-progress: true` in `deploy-pages.yml`.
6. **F-03** `git rm --cached -r "old Data for Claude"`.
7. **F-07** Branch-Sweep: `git branch -r --merged origin/main | grep -v "main$" | sed "s|origin/||" | xargs -I{} git push origin --delete {}`. Repo-Setting „auto-delete head branches" aktivieren damit's nicht wiederkommt.

### Eine Sitzung Arbeit (1–3 h)

8. **F-01** Toten Playtester-Loader + Wrapper + Tab-Map-Eintrag entfernen. Beim Aufräumen: zugehörige i18n-Keys (`notify.playtesterLoading`, `notify.playtesterError`) und CSS für `.sandbox-tab` mit räumen.
9. **F-06** `LICENSE` (z. B. MIT) und kurzes `SECURITY.md` mit Disclosure-Kontakt anlegen.
10. **F-05** README.md auf realen Stand bringen (Tab-Liste + Modul-Layout). `PROJECT_STRUCTURE.md` regenerieren oder löschen. `MULTIPLAYER_INTEGRATION_GUIDE.md` löschen (Feature retired).
11. **F-19** Lockfiles für `bot/` + `prerender/` lokal generieren, committen; CI-Steps auf `npm ci` umstellen.
12. **F-21** `firebase-admin>=X,<Y` in `requirements.txt` aufnehmen; `daily-price-refresh.yml:73` entfernen.
13. **F-14** Alle Workflows auf einheitliche Action-Pins ziehen.
14. **F-04** Entscheidung erzwingen: `frontend/` löschen oder verdrahten.

### Konzeptarbeit / mehrere Sitzungen

15. **F-24** Firestore-Regeln-Reconciliation. Erst: Live-Regeln aus Firebase Console exportieren und mit beiden Repo-Quellen diff'en. Danach Single Source of Truth festlegen, `.md` zur Doku abstrakt halten oder als generierter Mirror der `.rules` betreiben.
16. **F-11** Lint-Gate einführen: `eslint` als devDep + Step in `deploy-pages.yml`. Realistische erste Stufe: nur „errors", keine Style-Regeln, `--max-warnings 0`.
17. **F-16** Cross-Surface-Tests in den PR-Gate ziehen. Optionen: in `visual-nonmeta.yml` integrieren oder eigener `data-consistency.yml` der gegen `data/` (Pre-Build) statt `_site/data/` (Post-Build) prüft.

### Niedrige Priorität / Backlog

18. **F-15** Bei nächstem Tutorial-Screenshot-Run die letzten Failure-Logs ziehen, ggf. Retry-on-Failure einbauen.
19. **F-17** Service-Worker-Cache-Name aus `version.json` interpolieren statt per `sed`.
20. **F-20** Dependency-Major-Upgrade (express 5, puppeteer 25) — eigenes Test-Fenster, da Breaking Changes.
21. **F-22** Falls Reproduzierbarkeit kritisch wird: `pip-compile` einführen.
22. **F-23** Pip-Installs in `deploy-pages.yml` konsolidieren.
23. **F-10** (Audit-Spec only — kein Repo-Fix).

---

## Positive Befunde (explizit hervorgehoben)

- **0 hartkodierte Secrets** in tracked Code. Alle Konsumenten lesen via
  `process.env.*` / `os.environ.*`. Firebase / Google-Client-ID / Sentry-DSN
  werden korrekt zur Build-Zeit aus CI-Secrets substituiert.
- **0 Vulnerabilities** in `npm audit` für Root, Bot und Prerender
  (Bot/Prerender nach Lockfile-Generierung).
- **Firestore-Regeln** (so wie sie lokal liegen) sind restriktiv: kein
  anonymer Read/Write, `isOwner`-Gate auf jeder Operation, Größenlimits
  als DoS-Schutz. Drift-Risiko (F-24) ist organisatorisch, nicht
  inhaltlich.
- **Deploy-Pipeline** hat sauberen Test-Gate vor Build (JS Unit + Pytest)
  + Cross-Surface-Konsistenz-Tests nach Build. Failure blockiert
  Deployment.
- **Render-Konfig** (`bot/render.yaml`) markiert alle sensiblen ENV-Vars
  als `sync: false` (nicht in Git).
- **Cache-Bust** ist vollumfänglich verdrahtet: `?v=…`, `APP_VERSION`,
  Service-Worker-Cache-Name, `version.json` werden alle aus
  `${TIMESTAMP}-${HASH}` gesetzt — Stale-Client-Risiko gering.

---

*Erstellt: 2026-06-12 · Audit-Methode: read-only, jeder Befund mit Pfad + Zeile oder Command-Output belegt. Keine Code-Änderungen vorgenommen.*
