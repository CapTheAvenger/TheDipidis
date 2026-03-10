# GitHub Actions - Automated Scraping Schedule

## 📅 Übersicht

GitHub Actions führt automatisch alle Scraper aus, um die Website stets aktuell zu halten.

## ⏰ Zeitplan (Alle um 2 Uhr MEZ / 3 Uhr MESZ)

### 🔄 **Wöchentlich: Tournament Data Scrape**
**Datei:** `.github/workflows/weekly-scrape.yml`  
**Schedule:** Jeden **Dienstag um 01:00 UTC** (= 02:00 MEZ / 03:00 MESZ)  
**Dauer:** ~30-120 Minuten

**Was wird gescrapt:**
1. ✅ **City League Analysis Scraper** - Japanische City League Daten
2. ✅ **City League Archetype Scraper** - Deck Archetypes & Statistiken
3. ✅ **Current Meta Scraper** - Aktuelle Meta-Game Daten
4. ✅ **Limitless Online Scraper** - Online Tournament Daten
5. ✅ **Tournament JH Scraper** - Major Tournament Cards (z.B. Regionals, SPE)
6. ✅ **Set List Scraper** - SET_ORDER Mapping für neue Sets
7. ✅ **prepare_card_data.py** - Aggregiert alle Daten für Website

**Ergebnis:** Alle CSV/JSON Dateien im `data/` Ordner werden aktualisiert und committed.

---

### 💰 **Wöchentlich: Price Update**
**Datei:** `.github/workflows/price-update.yml`  
**Schedule:** Jeden **Montag um 01:00 UTC** (= 02:00 MEZ / 03:00 MESZ)  
**Dauer:** ~20-60 Minuten

**Was wird gescrapt:**
1. ✅ **Card Price Scraper** - Cardmarket Preise für alle Karten
2. ✅ **prepare_card_data.py** - Integriert Preise in Website-Daten

**Benötigt:** Chrome + ChromeDriver (wird automatisch installiert)

---

### 🗓️ **Monatlich: Card Database Update**
**Datei:** `.github/workflows/monthly-cards-update.yml`  
**Schedule:** Jeden **1. des Monats um 01:00 UTC** (= 02:00 MEZ / 03:00 MESZ)  
**Dauer:** ~60-180 Minuten

**Was wird gescrapt:**
1. ✅ **Japanese Cards Scraper** - Neueste 4 japanische Sets (für City League)
2. ✅ **All Cards Scraper** - Komplette Card Database von Limitless TCG
3. ✅ **prepare_card_data.py** - Aktualisiert Card Database

**Benötigt:** Chrome + ChromeDriver (wird automatisch installiert)

---

## 🎯 Warum 2 Uhr MEZ / 3 Uhr MESZ?

✅ **Nächtliche Ausführung** - Läuft, während du schläfst  
✅ **Morgendliche Daten** - Frische Daten sind bereits fertig, wenn du aufwachst  
✅ **Geringer Server-Traffic** - Weniger Last auf Limitless TCG Server nachts  
✅ **Stabile Netzwerkverbindung** - GitHub Actions haben nachts bessere Performance

---

## 📊 Vollständige Scraper-Liste

| Scraper | GitHub Actions | Häufigkeit | Benötigt Chrome |
|---------|----------------|------------|-----------------|
| City League Analysis | ✅ Wöchentlich (Di) | Jede Woche | ❌ |
| City League Archetype | ✅ Wöchentlich (Di) | Jede Woche | ❌ |
| Current Meta Analysis | ✅ Wöchentlich (Di) | Jede Woche | ❌ |
| Limitless Online | ✅ Wöchentlich (Di) | Jede Woche | ❌ |
| Tournament JH | ✅ Wöchentlich (Di) | Jede Woche | ❌ |
| Set List Scraper | ✅ Wöchentlich (Di) | Jede Woche | ❌ |
| Card Price Scraper | ✅ Wöchentlich (Mo) | Jede Woche | ✅ |
| Japanese Cards | ✅ Monatlich (1.) | Jeden Monat | ✅ |
| All Cards Database | ✅ Monatlich (1.) | Jeden Monat | ✅ |
| PokemonProxies | ❌ Manuell | Bei Bedarf | ✅ |

---

## 🚀 Manuelles Ausführen

Alle Workflows können auch **manuell** über GitHub ausgeführt werden:

1. Gehe zu: **Actions** Tab auf GitHub
2. Wähle den gewünschten Workflow (z.B. "Weekly Tournament Data Scrape")
3. Klicke auf **"Run workflow"**
4. Bestätige mit **"Run workflow"**

---

## 🛠️ Technische Details

### Dependencies
- **Python 3.11**
- **pip packages** aus `requirements.txt`
- **Chrome + ChromeDriver** (nur für Price/Card Database Updates)

### Timeout
- Weekly Scrape: **180 Minuten** (3 Stunden)
- Price Update: **Standard** (~60 Min)
- Card Database: **240 Minuten** (4 Stunden)

### Error Handling
- Alle Steps haben `continue-on-error: true`
- Bei Fehlern werden Logs als Artifacts hochgeladen (7 Tage Retention)

### Git Commit
- **Automatisch** nach erfolgreichem Scraping
- Commit Message: `🤖 Automated [weekly/price/monthly] update - DD.MM.YYYY`
- Nur wenn Änderungen vorhanden (`git diff --staged --quiet`)

---

## 📝 Logs & Debugging

Bei Fehlern:
1. Gehe zu **Actions** Tab
2. Klicke auf den fehlgeschlagenen Workflow-Run
3. **Download "Logs"** Artifact (enthält Debug-HTML und Log-Dateien)

---

## ✅ Status

**Letzte Aktualisierung:** 09.03.2026

**Setup Status:**
- ✅ Wöchentliche Tournament Scrapes (Dienstag 2 Uhr MEZ)
- ✅ Wöchentliche Price Updates (Montag 2 Uhr MEZ)
- ✅ Monatliche Card Database Updates (1. des Monats 2 Uhr MEZ)
- ✅ Tournament JH Scraper hinzugefügt
- ✅ Set List Scraper hinzugefügt
- ✅ Japanese Cards Scraper hinzugefügt
- ✅ All Cards Scraper hinzugefügt

**Alle wichtigen Daten werden automatisch aktualisiert! 🎉**
