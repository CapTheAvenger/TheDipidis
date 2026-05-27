# Cluster C — Legacy-Cleanup (F-010, F-011, F-012, F-022, F-024, F-026)

**Findings:** 6 (zur Erinnerung: F-010 Playtester, F-011 games-Collection, F-012 nicht-CI-Scraper, F-022 price_proxy_server, F-024 audit_single_tab.js, F-026 generated_tooltips.json)
**Risiko:** 🟡 Medium (keine User-sichtbaren Daten-Bugs, aber Code-Last + Verwirrung)
**Aufwand-Schätzung:** 1-2 Stunden für aggressive Variante, 30 min für konservative

---

## TL;DR

Cluster C ist überwiegend **Aufräumen**. Drei Befunde sind eindeutig (delete-it), einer braucht eine User-Entscheidung (wie aggressiv beim Playtester aufräumen?).

| ID | Status | Vorschlag |
|---|---|---|
| F-010 Playtester | **bewusste Hide-Strategie**, aktuell hidden via `playtester-hidden.css` | **Entscheidung nötig** (siehe C1) |
| F-011 `games`-Coll | Folgt aus C1 | wird in C2 mitbehandelt |
| F-012 nicht-CI-Scraper | 2 davon Legacy (`card_price_scraper`, `run_pipeline`), 5 sind Wartungs-Tools | C3: 2 löschen, 5 behalten |
| F-022 price_proxy_server | nicht mehr genutzt (User-Aussage) | C4: löschen + Tests anpassen |
| F-024 audit_single_tab.js | 0 Bytes, nirgendwo geladen | C5: löschen |
| F-026 generated_tooltips.json | Workflow läuft Sonntags, produziert `{}` | C6: Workflow + Datei entfernen |

---

## C1 — Playtester (F-010 + Vorbedingung für F-011)

### Aktueller Stand

- **`css/playtester-hidden.css`** versteckt **alle UI-Entry-Points** via CSS-Selektoren (Side-Menu-Item, Top-Nav-Tab, "Playtest"-Buttons in Deck-Builder, Sandbox-Tab-Inhalt, Help-FAQ-Einträge, das ganze Playtester-Modal)
- **JS-Files NICHT geladen:** `playtester.js` (5.580 LOC), `playtester-mobile.js` (702), `playtester-patch.js` (349), `firebase-multiplayer.js` (1.179) = **7.810 LOC unreachable code**
- **Comment in `playtester-hidden.css:7-9`:** *"The local sandbox stays in code so we can re-enable it if the external service degrades."*

### User-Aussage aus Phase 2

> *"meinen Playtester nutze ich komplett gar nicht mehr, ich verlinke nur auf TCG Showdown, also alles was zu meinem Playtester da ist kannst du einfrieren"*

"Einfrieren" ist mehrdeutig — kann zwei Dinge bedeuten:

### Optionen

| Variante | Was gelöscht | Was bleibt | Risiko |
|---|---|---|---|
| **C1a — konservativ** (= Code-Comment-Intention) | nichts | alles | 0 — bisheriger Stand |
| **C1b — semi-aggressiv** | UI-Entry-Points (Side-Menu, Top-Nav, alle "Playtest"-Buttons, Sandbox-Tab-Container im HTML), `playtester-hidden.css` selbst | JS-Files bleiben (re-enable möglich), aber keine UI-Reachability mehr | sehr niedrig |
| **C1c — aggressiv** | komplett: JS-Files + CSS + HTML-Markup + i18n-Keys + howto-Texte zum Playtester | – | mittel (kann nicht mehr "im Notfall" wieder eingeschaltet werden) |

**Meine Empfehlung: C1b.**

Begründung:
- Der CSS-Hack ist Defense-in-Depth, weniger sauber als HTML-Entfernung
- 7.810 LOC Dead-Code zu behalten ist Wartungslast
- Falls TCG Showdown einmal nicht mehr existiert: TCG-Showdown ist nicht der einzige externe Playtester; in 2-3 Jahren würde der Code sowieso so veraltet sein dass ein Re-Enable mehr Aufwand wäre als von Null
- C1b mittelt zwischen den Extremen: keine UI-Reachability mehr, aber JS-Code bleibt (rollbar zurück)

### Konkrete Änderungen für C1b

1. **`index.html`** — Entfernen:
   - Side-Menu-Eintrag `menu-btn-sandbox` (Zeile 462-467)
   - Top-Nav-Button (Zeile 544)
   - Sandbox-Tab-Container (Zeile 1865-1912, ca. 50 Zeilen)
   - "Playtest"-Buttons in Deck-Listing (Zeile 704, 1297, 1644)
   - `<link rel="stylesheet" href="css/playtester-hidden.css...">` (Zeile 106)
2. **`css/playtester-hidden.css`** — komplett löschen
3. **JS-Files behalten** (Rollback-fähig). Sie sind `index.html` nicht geladen → keine Page-Load-Kosten.
4. **i18n-Keys** für Playtester (`sandbox.heading`, `sandbox.subtitle` etc.) — können **vorerst bleiben** (kein Code referenziert sie, keine Datenmenge)

Test-Strategie:
- Lokales Browser-Test: `Playtester`-Tab existiert nicht mehr in Top-Nav
- "Playtest"-Buttons in My Decks / City League / Past Meta sind weg
- TCG-Showdown-Link bleibt (das ist `js/tcg-showdown-link.js`, **separate** Datei, bleibt)

Rollback: `git revert` reicht.

---

## C2 — Firestore `games`-Collection (F-011)

### Aktueller Stand

10+ Schreib-Operationen in `firebase-multiplayer.js`. Wenn die JS-Datei nicht geladen ist (was sie nicht ist), werden **null Operationen** auf die Collection durchgeführt — aber sie ist in den Firestore-Rules vermutlich noch erlaubt.

### Konkrete Änderungen für C2

1. **`firestore.rules`** prüfen — falls Regel für `games`-Collection existiert: entfernen
2. **Firestore-Console:** Collection `games` kann gelöscht werden (User-Aktion, keine Code-Änderung)

Test-Strategie:
- `grep "games" firestore.rules` → falls Match: anpassen
- Nach Deploy: Firestore-Console zeigt collection nicht mehr in Rules

Rollback: Rule-Snippet wieder einfügen.

---

## C3 — Nicht-CI-Scraper aufräumen (F-012)

### Detailbewertung der 7 Skripte

| Datei | Status | Aktion |
|---|---|---|
| `all_cards_scraper.py` | jetzt im CI (Cluster A) | bleibt ✓ |
| `japanese_cards_scraper.py` | manuell aktiv (JP-only) | bleibt ✓ |
| **`card_price_scraper.py`** | **Legacy** — durch `cardmarket_price_merger.py` ersetzt | **LÖSCHEN** |
| **`run_pipeline.py`** | **Legacy-Orchestrator** — durch den CI-Workflow ersetzt | **LÖSCHEN** |
| `card_actions_builder.py` | manuell für DB-Erweiterung | bleibt ✓ |
| `archetype_mapping_audit.py` | Audit-Tool für Maintainer | bleibt ✓ |
| `backfill_labs_tournament_id.py` | Wartungs-Skript (rare use) | bleibt ✓ |
| `clean_past_meta_archetypes.py` | Wartungs-Skript | bleibt ✓ |

### Konkrete Änderungen für C3

- `backend/scrapers/card_price_scraper.py` löschen
- `backend/scrapers/run_pipeline.py` löschen
- Settings-Datei für card_price_scraper falls vorhanden: `data/card_price_scraper_settings.json` o.ä. — check & löschen
- README / PROJECT_STRUCTURE.md: Erwähnungen anpassen

Test-Strategie:
- `grep -rn "card_price_scraper\|run_pipeline" --include="*.py" --include="*.yml"` → 0 Treffer nach Cleanup

Rollback: `git revert`

---

## C4 — `price_proxy_server.py` (F-022)

### Aktueller Stand

User-Aussage: *"das nutzen wir nicht mehr, ich habe versucht über einen Proxy Server Cardmarket zu scraper hat aber leider gar nicht geklappt"*

Referenzen:
- `README.md:25` erwähnt im Backend-Tree
- `PROJECT_STRUCTURE.md:26` erwähnt es
- `tests/python/test_price_proxy_and_price_scraper.py` testet es

### Konkrete Änderungen für C4

1. **`backend/services/price_proxy_server.py`** löschen
2. **`tests/python/test_price_proxy_and_price_scraper.py`** anpassen oder löschen
   - Vorsicht: prüfen ob die Test-Datei auch `price_scraper`-Tests enthält (vermutlich ja, namensbasiert) — die müssen bleiben oder umbenannt
3. **`README.md:25`** Zeile entfernen
4. **`PROJECT_STRUCTURE.md:26`** Zeile entfernen
5. **`backend/services/`** Ordner: leer? Dann auch löschen, oder behalten für zukünftige Services

Test-Strategie:
- `grep -rn "price_proxy" --include="*.py" --include="*.md" --include="*.js"` → 0 Treffer nach Cleanup
- `pytest tests/python/` läuft noch grün

Rollback: `git revert`

---

## C5 — `audit_single_tab.js` (F-024)

### Aktueller Stand

- 0 Bytes leer
- Im Repo-Root (nicht in `js/`)
- Wird in `index.html` NICHT geladen
- Wird von keinem Code referenziert
- Wird nur in den Audit-Docs erwähnt (selbst-referentiell)

### Konkrete Änderungen für C5

- `audit_single_tab.js` löschen

Test-Strategie:
- `ls audit_single_tab.js` → not found

Rollback: trivial

---

## C6 — `generate-tooltips.yml` + `generated_tooltips.json` (F-026)

### Aktueller Stand

- **Workflow:** `.github/workflows/generate-tooltips.yml` läuft Sonntags 6 UTC
- **Nutzt:** `OPENAI_API_KEY` aus secrets, ruft `backend/scrapers/generate_tooltips.py`
- **Output:** `data/generated_tooltips.json` = `{}` (2 Bytes)
- User-Aussage: *"ich glaube das haben wir nicht mehr"*

### Konkrete Änderungen für C6

1. **`.github/workflows/generate-tooltips.yml`** löschen
2. **`backend/scrapers/generate_tooltips.py`** löschen
3. **`data/generated_tooltips.json`** löschen
4. Falls JS-Code irgendwo `generated_tooltips.json` fetched → fetch-Call entfernen
5. Firestore-Secret `OPENAI_API_KEY` kann manuell aus den Repo-Secrets entfernt werden (User-Aktion, nicht im Code)

Test-Strategie:
- `grep -rn "generated_tooltips" /home/user/TheDipidis/js/ /home/user/TheDipidis/index.html` → 0 Treffer
- Nächster Sonntag: Workflow läuft nicht mehr

Rollback: `git revert`

---

## Reihenfolge der Commits

Sechs atomare Commits in dieser Reihenfolge (nicht-blocking voneinander, aber so geordnet dass die Diffs kleinst-möglich pro Commit bleiben):

1. **C5** — `audit_single_tab.js` löschen (1 File)
2. **C6** — `generate-tooltips.yml` + `generate_tooltips.py` + `generated_tooltips.json` löschen (3 Files)
3. **C4** — `price_proxy_server.py` + Test + README-Refs (4-5 Files)
4. **C3** — `card_price_scraper.py` + `run_pipeline.py` (+ Settings) (2-3 Files)
5. **C1 (Variante C1b)** — HTML + CSS Playtester-Cleanup (2 Files)
6. **C2** — Firestore Rules anpassen (1 File)

---

## Entscheidungen die ich vom User brauche

### Entscheidung 1: Playtester-Variante (C1)

- **C1a:** nichts ändern (alles bleibt wie es ist, hidden via CSS)
- **C1b:** UI-Entry-Points + CSS-Hack-File raus, JS-Code bleibt für Rollback
- **C1c:** Komplett raus inkl. 7.810 LOC JS

→ Meine Empfehlung: **C1b**.

### Entscheidung 2: Volle Cluster-C-Abarbeitung oder Teilmenge?

- **Alle 6 Findings (C1-C6)** in einer Session
- Oder nur ein Subset — z.B. C4-C6 (die trivialen "tot"-Files), und Playtester separat später

---

**STOP nach Phase 7.** Warte auf Entscheidung 1 + 2, dann starte ich Phase 8 (echte Commits).
