# Cluster E — Format-Inkonsistenz (F-018, F-019, F-021)

**Findings:** 3 — F-018 Cardmarket-Doppel-Files, F-019 EU/US-Number-Format, F-021 ~15 % alte Preise
**Risiko:** alle 🟡 medium
**Aufwand-Schätzung:** 30 min — alle 3 sind eng verkoppelt

---

## TL;DR — Investigation hat Cluster E vereinfacht

Während der Detail-Investigation klar geworden: **F-019 und F-021 sind dasselbe Problem**, nur in zwei Spalten betrachtet. Beide stammen aus dem **gerade in Cluster C gelöschten** `card_price_scraper.py`.

### Beweise

**Alte Preise (F-021) Daten-Stichprobe:**
```
3.008 Zeilen mit last_updated = 2026-04-01
   11 Zeilen mit last_updated = 2026-04-02
    2 Zeilen mit last_updated = 2026-03-16
    1 Zeile  mit last_updated = 2026-03-28
————————————————————————————————————————
3.022 Zeilen total (= 15 % der DB) sind PRE-MAY
```

**Number-Format (F-019) im selben Sample:**
```
Aktuelle Cardmarket-Preise (2026-05-26):     "0,19€"  ← EU-Komma
Alte Limitless-Preise (2026-04-01):           6.15€    ← US-Punkt, keine Quotes
```

→ **Die alten Preise haben US-Format und neuere Cardmarket-Preise haben EU-Format.** F-019 (Format-Inkonsistenz) und F-021 (alte Preise) sind nicht zwei Findings — es ist EINS, mit zwei sichtbaren Symptomen.

**Wer schrieb die alten Preise?** Der `card_price_scraper.py` — der wurde in **Cluster C Commit `816c77b`** gelöscht. Dieser Scraper:
- Lief gegen `limitlesstcg.com` direkt (nicht Cardmarket JSONs)
- Schrieb Preise im US-Format mit `€`-Suffix
- War "FALLBACK" für Karten ohne Cardmarket-ID-Mapping (siehe der _comment in `card_price_scraper_settings.json` vor dem Delete)

**Konsequenz:** Diese 3.022 Karten werden **nie wieder aktualisiert** weil:
1. Der Scraper, der sie gefüttert hat, ist weg
2. Diese Karten haben kein Cardmarket-Mapping → `cardmarket_price_merger.py` überspringt sie
3. Sie bleiben für immer auf 2026-04-01-Werten im US-Format

### F-018 — Cardmarket-Doppel-Files

| Datei | Größe | Last-Mod | Status |
|---|---|---|---|
| `data/price_guide.json` | 14.3 MB | 2026-05-15 | **Legacy** |
| `data/price_guide_6.json` | 14.6 MB | 2026-05-26 | aktiv |
| `data/products_nonsingles.json` | 0.9 MB | 2026-05-15 | **Legacy** |
| `data/products_nonsingles_6.json` | 0.9 MB | 2026-05-25 | aktiv |
| `data/products_singles.json` | 12.4 MB | 2026-05-15 | **Legacy** |
| `data/products_singles_6.json` | 12.8 MB | 2026-05-25 | aktiv |

**`grep` für Reader der legacy `*.json`-Files:**
```
0 Treffer
```

→ Nichts liest die Legacy-Files mehr. **28 MB Disk-/Repo-Bloat löschbar.**

---

## Fix-Plan

### E18 — Cardmarket-Legacy-Files löschen (F-018)

**Aufwand:** 1 commit, 5 min.

```bash
git rm data/price_guide.json
git rm data/products_singles.json
git rm data/products_nonsingles.json
```

**Side-Effect:** Repo schrumpft ~28 MB. Kein Code-Pfad betroffen.

**Test:** `grep -rn "products_singles.json\|products_nonsingles.json\|price_guide.json" /home/user/TheDipidis/ --include='*.py' --include='*.js'` → kein Match.

**Rollback:** `git revert` reanimiert die Stand-2026-05-15-Versionen — aber die werden nicht gebraucht.

### E19+E21 — Alte Preise + Number-Format (F-019 + F-021 zusammen)

Drei Optionen, je nach gewünschtem User-Verhalten:

| Variante | Was | Pro | Contra |
|---|---|---|---|
| **E21a — Alte Preise löschen** | 3.022 Zeilen mit `last_updated < 2026-05` aus `price_data.csv` raus | clean state, einheitliches Format, einheitliche Quelle | User sieht für diese Karten "kein Preis" (vermutlich seltene/Legacy-Karten — Card-DB-Anzeige wird leer für diese 15 %) |
| **E21b — Alte Preise normalisieren** | Format auf EU-Komma vereinheitlichen (`6.15€` → `6,15€`), `last_updated` behalten | Konsistentes Format, Preise bleiben sichtbar | Daten sind trotzdem alt (3+ Monate) und werden nie aktualisiert |
| E21c — Status quo + Comment | Maintainer-Comment dokumentieren | minimaler Aufwand | Format-Inkonsistenz bleibt |

**Meine Empfehlung: E21b** (Normalisierung) — User-Erlebnis bleibt erhalten (Preise sichtbar), Format wird konsistent. Optional plus eine "veraltet"-Markierung im UI wenn `last_updated < today - 60 Tage` (das wäre eigene Mini-Session).

### Konkrete Änderung E21b — Format-Migration der alten Preise

Einmaliges Python-Script das `price_data.csv` durchläuft, alle Zeilen mit US-Format `X.XX€` zu EU-Format `X,XX€` umwandelt:

```python
import csv, re

US_PRICE = re.compile(r'^(\d+)\.(\d+)€$')
INPUT  = 'data/price_data.csv'
OUTPUT = 'data/price_data.csv.new'

def to_eu(value):
    if not value: return value
    m = US_PRICE.match(value.strip())
    if not m: return value
    # 6.15€ → 6,15€  (and wrap in quotes to match the CSV's current style)
    return f'"{m.group(1)},{m.group(2)}€"'

with open(INPUT, encoding='utf-8-sig') as f_in, open(OUTPUT, 'w', encoding='utf-8-sig', newline='') as f_out:
    reader = csv.DictReader(f_in)
    writer = csv.DictWriter(f_out, fieldnames=reader.fieldnames, quoting=csv.QUOTE_MINIMAL)
    writer.writeheader()
    changed = 0
    for row in reader:
        for col in ('eur_price', 'eur_low'):
            if row.get(col):
                new = to_eu(row[col])
                if new != row[col]:
                    row[col] = new
                    changed += 1
        writer.writerow(row)
    print(f'Normalised {changed} cells')

# atomic-replace
import os
os.replace(OUTPUT, INPUT)
```

→ Einmal lokal ausführen, dann `price_data.csv` ist konsistent. Commit der Daten-Datei.

**Test:** 
- Stichprobe nach Migration: kein `\d+\.\d+€` mehr in `price_data.csv`, nur `\d+,\d+€`
- Card-DB-Tab zeigt Preise weiterhin (Format wird vom Reader geparst — siehe `js/app-price.js`)

**Side-Effect:** keine — nur Display-String-Form-Wechsel.

**Rollback:** `git revert` — die alten US-formatierten Zeilen kommen zurück.

---

## Reihenfolge der Commits

1. **E18** — Cardmarket-Legacy löschen (3 Files, 28 MB) — schnellster Win
2. **E21b** — Format-Normalisierung der 3.022 alten Zeilen — kleiner Daten-Commit
3. (optional) **Maintainer-Note in `cardmarket_price_merger.py`** dass es nur Cardmarket-Mapped-Karten updated — alle anderen bleiben am letzten geschriebenen Wert (User-bewusster Trade-off jetzt dass `card_price_scraper.py` weg ist)

---

## Entscheidung die ich vom User brauche

### Entscheidung 1: E21-Variante

- **E21a** löschen — saubere DB, aber User sieht für ~15 % der Karten keinen Preis
- **E21b normalisieren** — Preise bleiben, Format konsistent (meine Empfehlung)
- **E21c Status quo** — nur Comment, sonst nichts

### Entscheidung 2: F-018 — wirklich Cardmarket-Legacy löschen?

Sehr sicher (0 Reader). Aber bestätige als sanity-check: war eine dieser Files vielleicht mal ein manueller Snapshot den du behalten wolltest?

---

**STOP nach Phase 7.** Sag mir die zwei Entscheidungen + GO FIX.
