# 🤖 GitHub Actions - Automatisches Scraper-Update

## ✅ Setup abgeschlossen!

Die Scraper laufen jetzt **automatisch jeden Tag um 0:00 Uhr UTC** (1:00 Uhr MEZ / 2:00 Uhr MESZ).

---

## 📋 Was passiert automatisch?

1. **City League Scraper** läuft
2. **Limitless Online Scraper** läuft
3. **Current Meta Analysis Scraper** läuft (Meta Live + Play!)
4. Alle Änderungen in `data/` werden automatisch committed
5. Änderungen werden zu GitHub gepusht
6. Website wird automatisch auf GitHub Pages aktualisiert

---

## 🎮 Manuell starten

Du kannst die Scraper auch manuell starten:

1. Gehe zu: https://github.com/CapTheAvenger/HausiTCG/actions
2. Klick auf "Daily TCG Scraper" (links)
3. Klick auf "Run workflow" (rechts)
4. Klick auf grünen "Run workflow" Button

---

## 📊 Logs anschauen

So siehst du, was beim letzten Run passiert ist:

1. Gehe zu: https://github.com/CapTheAvenger/HausiTCG/actions
2. Klick auf den neuesten Workflow-Run
3. Klick auf "scrape-and-deploy" Job
4. Alle Logs sind hier sichtbar

---

## ⚙️ Anpassungen

### Zeitplan ändern

Bearbeite `.github/workflows/daily-scraper.yml` und ändere die Zeile:

```yaml
- cron: '0 0 * * *'  # Täglich um 0:00 Uhr UTC
```

**Beispiele:**
- `'0 0 * * *'` = Täglich um 0:00 Uhr
- `'0 2 * * *'` = Täglich um 2:00 Uhr
- `'0 0 * * 1'` = Jeden Montag um 0:00 Uhr
- `'0 */6 * * *'` = Alle 6 Stunden

### Python-Dependencies ändern

In `.github/workflows/daily-scraper.yml` unter "Install Dependencies":

```yaml
pip install requests beautifulsoup4 lxml playwright
```

---

## 🚨 Fehlerbehandlung

- **Einzelner Scraper schlägt fehl**: Der Workflow läuft trotzdem weiter
- **Keine Änderungen**: Kein Commit, kein Push
- **Push schlägt fehl**: Du bekommst eine E-Mail von GitHub

---

## 📧 Benachrichtigungen

GitHub sendet automatisch E-Mails bei:
- ❌ Workflow-Fehlern
- ✅ Erfolgreichen Runs (optional einstellbar)

Einstellungen: https://github.com/CapTheAvenger/HausiTCG/settings

---

## 🎯 Vorteile

✅ Läuft auch wenn dein PC aus ist  
✅ Kostenlos für öffentliche Repos  
✅ Automatische E-Mails bei Fehlern  
✅ Logs auf GitHub einsehbar  
✅ Kann manuell gestartet werden  
✅ Zeitplan flexibel anpassbar  

---

## 🛑 Deaktivieren

1. Gehe zu: https://github.com/CapTheAvenger/HausiTCG/actions
2. Klick auf "Daily TCG Scraper"
3. Klick auf "•••" (drei Punkte oben rechts)
4. "Disable workflow"

Oder lösche die Datei: `.github/workflows/daily-scraper.yml`

---

## 📝 Nächster Schritt

**Push diese Datei zu GitHub:**

```bash
git add .github/
git commit -m "🤖 Add GitHub Actions for automated scraping"
git push origin main
```

**Fertig!** Der erste automatische Run startet morgen um 0:00 Uhr.
