# ✅ DEPLOYMENT CHECKLISTE

## 1️⃣ Git Repository Setup

- [ ] GitHub Desktop oder Git Bash installiert
- [ ] Repository geklont oder hochgeladen: https://github.com/captheavenger/HausiTCG
- [ ] `.git` Ordner existiert lokal
- [ ] Remote URL gesetzt: `origin → captheavenger/HausiTCG`

## 2️⃣ Dateien korrekt strukturiert

- [ ] `.gitignore` vorhanden und korrekt
- [ ] `.github/workflows/daily-scrape.yml` vorhanden
- [ ] `.github/workflows/deploy-pages.yml` vorhanden
- [ ] Alle Settings-Dateien vorhanden:
  - [ ] `City_League_Archetype_Scraper/city_league_archetype_settings.json`
  - [ ] `Limitless_Online_Scraper/limitless_online_settings.json`
  - [ ] `Unified_Card_Scraper/unified_card_settings.json`
- [ ] Python-Dateien in Scrapern:
  - [ ] `City_League_Scraper/city_league_scraper.py`
  - [ ] `Limitless_Scraper/limitless_scraper.py`
  - [ ] `Limitless_Online_Scraper/limitless_online_scraper.py`
  - [ ] `Unified_Card_Scraper/unified_card_scraper.py`

## 3️⃣ EXE-Dateien (optional für GitHub)

- [ ] Entscheiden: EXEs hochladen oder nur Python-Dateien?
  - Option A: Nur Python (empfohlen) → Aktualisiere `.gitignore`
  - Option B: EXEs hochladen → Nutze GitHub Releases (nicht Git LFS)

## 4️⃣ GitHub Pages Konfiguration

- [ ] Gehe zu: https://github.com/captheavenger/HausiTCG/settings/pages
- [ ] "Source" = "GitHub Actions"
- [ ] Deploy Branch = `main`
- [ ] Custom Domain = nicht nötig (standard: captheavenger.github.io/HausiTCG)

## 5️⃣ GitHub Actions aktivieren

- [ ] Gehe zu: https://github.com/captheavenger/HausiTCG/actions
- [ ] Überprüfe dass Workflows existieren:
  - [ ] `Daily Card Scraping (6:00 UTC)`
  - [ ] `Deploy GitHub Pages`
- [ ] Teste manuellen Trigger: Click "Run workflow"

## 6️⃣ Secrets (falls nötig)

- [ ] Überprüfe ob API-Tokens nötig sind
- [ ] Falls ja: Settings → Secrets → Actions
- [ ] Füge `GITHUB_TOKEN` oder andere Secrets hinzu

## 7️⃣ Lokaler Test BEFORE Push

```bash
# Teste die Scraper lokal vor GitHub
cd "C:\Users\haush\OneDrive\Desktop\Hausi Scrapen\Unified_Card_Scraper"
python unified_card_scraper.py

# Überprüfe ob Output-CSVs generiert werden
dir /B *.csv
```

## 8️⃣ Initial Push zu GitHub

```bash
git add .
git commit -m "🚀 Initial commit: Complete scraper setup with GitHub Actions"
git branch -M main
git push -u origin main
```

## 9️⃣ Verifizierung auf GitHub

- [ ] Gehe zu: https://github.com/captheavenger/HausiTCG
- [ ] Überprüfe dass alle Dateien vorhanden sind
- [ ] Klick "Actions" tab
- [ ] Führe "Daily Card Scraping" manuell aus: "Run workflow"
- [ ] Warte auf Completion (grüner Haken)
- [ ] Überprüfe dass CSVs aktualisiert wurden

## 🔟 GitHub Pages Test

- [ ] Warte 1-2 Minuten nach erfolgreichem Push
- [ ] Öffne: https://captheavenger.github.io/HausiTCG/deck_viewer.html
- [ ] Teste dass Deck Viewer funktioniert
- [ ] Überprüfe dass Bilder laden (Limitless CDN URLs)

## 📅 Automatische Schedule aktivieren

- [ ] GitHub Actions sollte täglich um 6:00 UTC laufen
- [ ] Falls nicht: Gehe zu `.github/workflows/daily-scrape.yml` und überprüfe Cron:
  ```yaml
  schedule:
    - cron: '0 6 * * *'  # 6:00 UTC täglich
  ```

## ✅ FERTIG!

Wenn alle Punkte abgehakt sind:
- Scraper laufen täglich automatisch um 6:00 UTC
- Daten werden automatisch zu GitHub gepusht
- GitHub Pages wird automatisch aktualisiert
- Deck Viewer ist live unter captheavenger.github.io/HausiTCG

---

## 🐛 Fehlerbehandlung:

**Falls Workflow fehlschlägt:**
1. Gehe zu: https://github.com/captheavenger/HausiTCG/actions
2. Klick auf fehlgeschlagenen Workflow
3. Schau dir den Log an (meist unten)
4. Häufige Fehler:
   - ❌ Python/Dependencies nicht installiert → Behebe in Workflow
   - ❌ Module nicht gefunden → Überprüfe Pfade
   - ❌ Git-Authentifizierung fehlgeschlagen → Überprüfe Token

**Falls Bilder nicht laden:**
1. Überprüfe dass URLs aus unified_card_data.csv Limitless CDN Format haben
2. Format sollte sein: `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/{SET}/{SET}_{NUM}_{RARITY}_EN_LG.png`
3. Wenn nicht: Führe `update_images.py` lokal aus und pushe updated CSV
