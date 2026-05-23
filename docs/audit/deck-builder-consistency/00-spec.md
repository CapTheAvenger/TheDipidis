# Feature: Deck Analysis (Global) → Quick Overview → Generate

**Spec-Version:** 0.1 (DRAFT — user-confirmation pending)
**Datum:** 2026-05-23
**Audit-Branch:** `audit/deck-builder-consistency`

---

## Kontext

User-gemeldete Beobachtung (Screenshot):
- Wally's Compassion: inclusion 87.0%, Ø 1.26 → angezeigte Anzahl **2** (user: erwartet 1)
- Rocky Fighting Energy: 61.1%, Ø 1.94 → **1** (user: 1 könnte richtig sein)
- Basic Fighting Energy: 100%, Ø 9.80 → **9** (user: erwartet 10)

User-Aussage zum Scope (wörtlich):

> "Ziel von dem Deck Builder ist es eine Liste zu generieren die voll auf consistency für das eigene Deck im Aufbau ist aber auch gut aufgestellt gegen das aktuelle Meta ist. Dafür zählen die frischen Daten major Turnieren + alles was zeitlich nach dem letzten Major Online gespielt mehr in die Berechnung ein als alte Daten oder auch Majors vor 4 Wochen. [...] Wenn möglich sollten vom letzten Major sogar Karten aus den Listen aus den Top 64 höher bewertet werden, da ja hier ein massiver Erfolg zu verzeichnen ist."

---

## Soll-Verhalten (vom User bestätigt am 2026-05-23)

### G1 — Generelles Ziel
Die generierte 60-Karten-Liste soll zwei Kriterien gleichzeitig optimieren:
1. **Konsistenz** des gewählten Archetypen (saubere Engine, hohe Inklusionsraten der Kern-Cards)
2. **Meta-Positionierung** gegen das aktuell gespielte Meta (Tech-Slots / Counter-Picks, die in frischen erfolgreichen Listen vorkommen)

### G2 — Daten-Gewichtungs-Prinzip (Recency + Source)
Frische Daten bekommen ein **höheres Gewicht** als ältere Daten:
- **Höchstes Gewicht:** Letzte Major-Turniere (innerhalb der letzten ~4 Wochen)
- **Hohes Gewicht:** Online-Play **nach** dem letzten Major (zeigt wie das Meta sich nach dem letzten großen Event entwickelt hat)
- **Mittleres Gewicht:** Online-Play vor dem letzten Major
- **Niedrigeres Gewicht:** Majors älter als ~4 Wochen
- **Niedrigstes Gewicht:** Sehr alte Daten (anderes Set / anderes Meta-Window)

### G3 — Stretch: Placement-basierte Gewichtung
Beim **letzten Major** sollen Karten, die in **Top-64**-Listen vorkommen, höher gewichtet werden als Karten aus Position 65+.
("Wenn möglich" — Voraussetzung: Placement-Daten sind im Datenmaterial vorhanden. Wird in Phase 2 verifiziert.)

### G4 — Rundungs-Regel (abgeleitet aus G1/G2)
- Die finale Anzahl pro Karte ergibt sich aus dem **gewichteten Durchschnitt** der "average count when used"-Werte aus den Quell-CSVs.
- Die Karten-Anzahlen müssen sich zu **exakt 60** summieren.
- Math.round als Basis, dann LRM-Anpassung (Largest-Remainder) damit Summe = 60.
- Die Anomalien aus dem Screenshot (1.26→2 und 9.80→9) deuten darauf hin, dass entweder:
  - (a) Die angezeigte Ø-Spalte NICHT der Wert ist, der zur Rundung verwendet wird (es gibt einen separat berechneten gewichteten Wert), ODER
  - (b) Die Gewichtung fehlt komplett und LRM tauscht "willkürlich" Karten gegeneinander um Summe = 60 zu erreichen.
- **Entscheidung erst nach Phase 1+2** wenn klar ist welcher Wert wo herkommt.

### G5 — Was NICHT geändert wird (out of scope dieses Audits)
- Green-Checkmark UI-Redesign (Frage 4) → separate Task
- Karten-Image-Loading
- Pricing-Display
- Andere Tabs außer "Deck Analysis (Global) → Quick Overview → Generate"

---

## Acceptance Criteria (vorläufig — zu schärfen nach Phase 2)

**AC1:** Eine generierte Liste summiert sich auf **exakt 60 Karten**.

**AC2:** Bei zwei Karten mit gleichem Inclusion% und ähnlichem Ø-Wert, aber unterschiedlicher Datenfrische, gewinnt die fresh-getaggte Karte (höhere Anzahl im Output).

**AC3:** Wenn man die Daten-Quellen nach Datum filtert (nur "alt" vs nur "frisch"), unterscheidet sich der generierte Output **sichtbar** — das beweist dass die Gewichtung tatsächlich greift.

**AC4:** Karten aus dem letzten Major (mit Top-64 Placement, falls verfügbar) erscheinen **mindestens** mit ihrer Math.round-Standard-Anzahl im Output (= nicht durch LRM weggekürzt zugunsten alter Daten).

**AC5:** Die angezeigte "Ø"-Spalte und der "Inclusion%"-Wert im UI **müssen** mit dem in der Berechnung verwendeten Wert übereinstimmen (= keine "stille" Diskrepanz zwischen Anzeige und Logik).

---

## Offene Fragen (BLOCKIEREN Phase 1)

### Q1 — Existieren Date-/Placement-Felder in den Quell-CSVs?
Muss ich in Phase 2 verifizieren. Mögliche Datenquellen:
- `tournament_cards_data_cards_*.csv` — hat `tournament_date`, evtl. Placement
- `online_tournament_dated_cards.csv` — hat per Name "dated", also Datum
- `current_meta_card_data.csv`, `limitless_online_decks.csv` — unklar

Falls Placement nicht in den Daten ist → G3 (Top-64-Stretch) entfällt, G2 bleibt.

### Q2 — Welche Karte/welcher Archetype im Screenshot?
Du hast einen Archetypen aus Deck Analysis Global → Quick Overview → Generate gezeigt. Damit ich **denselben** Output reproduzieren kann (für Validierung in Phase 3), brauche ich:

- Welches **Archetype** war ausgewählt? (Dropdown-Wert)
- Welcher **Tournament Format Filter** war aktiv? (All / Limitless / Major Tournament)
- Welches **Data window from**-Datum, falls gesetzt?
- Welches **Card Share Filter**? (Sieht im Screenshot nach "All Cards" aus)

### Q3 — "Letzter Major" — wie definieren?
"Major" = Regional/International/Worlds (laut `tournament_JH.tournament_types` Setting). "Letzter Major" = das jüngste in der Liste? Oder = das jüngste mit Format-Code passend zum aktuellen Set?

### Q4 — Gewicht-Verhältnisse
Du hast die Buckets qualitativ benannt (höchstes / hohes / mittleres / niedrigeres / niedrigstes). Soll ich konkrete Multiplikatoren vorschlagen (z.B. 1.0 / 0.8 / 0.6 / 0.4 / 0.2)? Oder hast du eine bestimmte Verteilung im Kopf?

Es gibt schon einen ähnlichen Mechanismus im Code (`online_tournament_scraper.py`-Settings haben `recent_days_high_weight: 7`, `recent_weight: 1.0`, `older_weight: 0.5` — also 2:1 Gewichtung). Wenn du keine Präferenz hast, schlage ich vor sich an dieses Pattern anzulehnen.

### Q5 — Confirmation auf den Spec
Bevor ich in Phase 1 (Code-Pfad-Analyse) gehe: ist G1-G5 + AC1-AC5 oben so wie du es willst? Wenn ja, antworte mit "Spec OK → GO Phase 1". Wenn nicht, sag was anzupassen ist.
