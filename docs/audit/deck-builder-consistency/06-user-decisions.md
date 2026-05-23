# Phase 4.5 — User-Entscheidungen (2026-05-23)

Korrigierter Plan bestätigt. User-Antworten auf Phase-4-Fragen:

## Q-E1: Display-Variante
**Hybrid aus E1 + E2:**
- Card-Tile zeigt **primär den tatsächlich für Math.round verwendeten Wert** (= `card.avgCountWhenUsed`, also den ACE-conditional / Major-blended / weighted-avg je nachdem welcher gewonnen hat)
- Click/Hover auf die Karte zeigt den **Original-Combined-Wert** als zusätzliche Info
- Reasoning: Standard-Ansicht clean halten, Detail-Info on-demand

## Q-C1: Recency-decay auf alle Karten
**Cascade-Modell mit Source-Weighting:**
- Major-Daten > Online-Daten (struktureller Gewichtsfaktor) ← Major ist immer besser, weil dort nur ernsthafte Spieler antreten
- Innerhalb Online: Tournament-Player-Count gewichtet mit ein ← Online mit 500 Spielern ist signal-reicher als Online mit 30 Spielern
- Innerhalb beider: Recency-Decay (frische Daten > alte Daten)

## Q-D1: Top-64-Weighting
**Defer-but-soon:** Nach E+C separater Audit. Es ist ein wichtiger Punkt für die Kartenbewertung, aber zuerst die Basis-Pipeline sauber.

## Q-N1: Snapshot-Test-Tool
**Ja** — fixiert den aktuellen Lucario-Hariyama-Output als Regression-Baseline.

---

# Neue Diskrepanz F: Online-Tournament-Player-Count nicht im Weight-System

## Was
User-Aussage: "Auf Major spielen schon nur ernsthafte Leute, von Online könnten wir nur Daten mehr Gewicht geben die bei Turnieren mit mehr als 200 oder 300 Leuten Top performt haben."

Aktuell:
- `online_tournament_scraper.py` settings: `min_players: 100, max_tournaments: 200`
- → JEDES Online-Turnier mit ≥100 Spielern landet im Datensatz, gleich gewichtet
- Ein 100-Spieler-Turnier zählt genauso wie ein 500-Spieler-Turnier

User möchte: Online-Turniere mit hoher Spielerzahl höher gewichten (= signal-reicher) ODER kleine Turniere ausschließen.

## Wo
- `config/scraper_settings.json` → `online_tournament_scraper`
- `backend/scrapers/online_tournament_scraper.py` — `min_players` Filter
- `data/online_tournament_dated_cards.csv` — die Quelle für ACE-conditional + Recency
- Frontend Aggregator `js/app-deck-builder.js:5824` (`_aggregateWeightedSource`) — verwendet keine Player-Count-Info

## Soll-Verhalten
Beim Aggregieren von Online-Tournament-Daten soll jedes Turnier ein zusätzliches Gewicht bekommen abhängig von seiner Spielerzahl. Mögliche Modelle:
- **Stufen:** <200 Players: weight 0.3, 200-400: weight 0.6, 400+: weight 1.0
- **Linear:** weight = min(1.0, players/300) (alles ab 300 voll, drunter linear)
- **Hard cutoff:** <250 Players excluded ganz

## Fix-Vorschlag F
Schritt 1: Check ob `tournament_cards_data` Player-Count-Info hat (sollte aus dem Scraper kommen)
Schritt 2: Falls ja → in `_aggregateWeightedSource` als Multiplikator einbauen
Schritt 3: Falls nein → Scraper-Erweiterung (analog zu D Top-64)

## Risiko F
🟡 MEDIUM — hängt davon ab ob Player-Count schon in den Daten ist (no scraper change) oder nicht (scraper change). Phase 5 verifiziert das.

---

# Aktualisierte Diskrepanz-Liste

| ID | Was | Risiko | Phase |
|---|---|---|---|
| **E** | Display Ø ≠ Allocation-Source | 🟢 LOW | PR 1 |
| **C** | Recency wirkt nicht auf default-avg | 🟡 MEDIUM | PR 2 |
| **F** | Online-Player-Count nicht im Weight | 🟡 MEDIUM | PR 3 (oder kombiniert mit C) |
| D | G3 Top-64 (Placement) | 🔴 HIGH | später, separater Audit |

# Phase 5 Plan (Tests vor Fix)

**5.1 Snapshot-Fixture-Tool**
- Script `tools/audit-snapshot-lucario.js` (Node.js)
- Lädt CSVs, repliziert die Pipeline-Logik, schreibt Fixture `docs/audit/deck-builder-consistency/fixtures/lucario-baseline.json`
- Inhalt: alle 22 Karten mit `card.avgCountWhenUsed`, `card._lrmRemainder`, `Math.round`-Ergebnis, final count

**5.2 Unit-Tests**
Für jeden geplanten Fix einen Test der VOR dem Fix rot ist:
- Test E1: `card.avgCountWhenUsed === effectiveDisplayAvg` für alle Karten nach Build (sollte schon stimmen — der Fix ist UI-only, nicht Backend)
- Test C1: synthetic data (2 cards, gleiche combined-avg, andere temporale Verteilung) → weighted-avg unterscheidet sich
- Test F1: synthetic data (2 tournaments, gleicher card-count, andere Player-Counts) → tournament-weight unterscheidet sich

**5.3 Regression-Tests**
- Lucario-Baseline aus 5.1 als golden master
- Nach jedem Fix: re-run, assert specific counts wo Spec sagt "muss sich ändern", assert "muss gleich bleiben" für nicht-betroffene Karten

GO für Phase 5.
