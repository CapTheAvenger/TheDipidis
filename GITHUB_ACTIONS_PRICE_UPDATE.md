# Automatische Preis-Updates (GitHub Actions)

## Übersicht

Die Preise werden **jeden Montag um 6:00 Uhr UTC** automatisch von Limitless TCG/Cardmarket gescraped und in die Online-Version hochgeladen.

## ✅ Vorteile

- ✅ Automatische Updates jede Woche
- ✅ Komplett kostenlos (GitHub Actions)
- ✅ Kein manuelles Scraping mehr nötig
- ✅ Online-Website immer aktuell (maximal 7 Tage alte Preise)
- ✅ Funktioniert auch, wenn dein PC aus ist

---

## 🚀 Setup (Einmalig)

### 1. GitHub Actions aktivieren

Falls noch nicht aktiviert:
1. Gehe zu deinem GitHub-Repo
2. Klicke auf **"Settings"**
3. Wähle **"Actions"** → **"General"**
4. Aktiviere **"Allow all actions and reusable workflows"**
5. Speichern

### 2. Workflow-Datei committen

Die Datei `.github/workflows/weekly-price-update.yml` muss im Repo sein:
```bash
git add .github/workflows/weekly-price-update.yml
git commit -m "Add weekly price update workflow"
git push
```

### 3. Erstes Mal manuell starten (Optional)

1. Gehe zu **"Actions"** in GitHub
2. Wähle **"Weekly Price Update"**
3. Klicke **"Run workflow"** → **"Run workflow"**
4. Warte 5-10 Minuten

✅ **Fertig!** Ab jetzt laufen Updates automatisch jeden Montag.

---

## 📅 Zeitplan

- **Wann:** Jeden Montag um 6:00 Uhr UTC
  - **Deutschland (Winter/MEZ):** 7:00 Uhr
  - **Deutschland (Sommer/MESZ):** 8:00 Uhr
- **Dauer:** Ca. 10-20 Minuten (je nach Anzahl der Karten)

---

## 🔧 Anpassungen

### Zeitpunkt ändern

Datei: `.github/workflows/weekly-price-update.yml`

```yaml
schedule:
  # Format: 'Minute Stunde Tag Monat Wochentag'
  - cron: '0 6 * * 1'  # Montag 6:00 UTC
```

**Beispiele:**
- `0 6 * * 1` = Montag 6:00 UTC
- `0 18 * * 5` = Freitag 18:00 UTC
- `0 9 * * 1,3,5` = Montag/Mittwoch/Freitag 9:00 UTC

### Häufigkeit ändern

```yaml
# Einmal täglich (0:00 UTC)
- cron: '0 0 * * *'

# Zweimal pro Woche (Montag + Donnerstag)
- cron: '0 6 * * 1,4'

# Jeden Tag außer Wochenende
- cron: '0 6 * * 1-5'
```

---

## 🛠️ Troubleshooting

### Workflow läuft nicht

**Problem:** Workflow wird nicht ausgeführt

**Lösungen:**
1. Prüfe, ob GitHub Actions aktiviert ist (Settings → Actions)
2. Checke, ob die Datei richtig committed wurde (`git push`)
3. Schaue in **Actions** Tab, ob Fehler gemeldet werden

### Preise werden nicht aktualisiert

**Problem:** Workflow läuft, aber Preise ändern sich nicht

**Mögliche Ursachen:**
1. **`skip_cards_with_prices: true`** → Auf `false` setzen
2. **Selenium-Fehler** → Logs in GitHub Actions prüfen
3. **Rate Limiting** → Zu viele Requests, Delay erhöhen

**Logs prüfen:**
1. GitHub → Actions → "Weekly Price Update"
2. Klicke auf den letzten Run
3. Schaue "Run Price Scraper" Logs

### YAML-Fehler

**Problem:** GitHub meldet YAML-Syntax-Fehler

**Lösung:**
- Prüfe Einrückung (nur Spaces, keine Tabs)
- Validiere auf: https://www.yamllint.com/
- Vergleiche mit `daily-scraper.yml`

---

## 📊 Monitoring

### Status prüfen

1. Gehe zu GitHub → **Actions**
2. Siehst du einen **grünen Haken** = Erfolgreich ✅
3. **Rotes X** = Fehler ❌

### Letzte Aktualisierung sehen

```bash
git log --oneline data/price_data.csv
```

Oder auf GitHub: `data/price_data.csv` → **"History"**

### E-Mail-Benachrichtigungen

GitHub sendet E-Mails bei fehlgeschlagenen Workflows.

**Deaktivieren:**
1. GitHub-Profil → Settings
2. Notifications → Actions
3. **"Send notifications for failed workflows"** → Aus

---

## 🔒 Sicherheit & Limits

### GitHub Actions Free Tier

- **2000 Minuten/Monat** kostenlos
- Dieser Workflow: ~10-20 Min/Woche = **40-80 Min/Monat**
- **Keine Kosten bei normalem Gebrauch**

### Rate Limiting

Der Scraper hat eingebaute Delays:
- `delay_seconds: 0.5` in `card_price_scraper_settings.json`
- Bei zu vielen Requests: IP wird geblockt (temporär)

**Lösung:** Delay auf `1.0` oder `2.0` erhöhen

---

## 🔄 Workflow-Details

### Was passiert:

1. **Checkout:** Repo wird ausgecheckt
2. **Python Setup:** Python 3.11 wird installiert
3. **Dependencies:** BeautifulSoup, Selenium, etc.
4. **Chrome Install:** Chromium + ChromeDriver für Selenium
5. **Price Scraper:** `card_price_scraper.py` wird ausgeführt
6. **Commit:** Neue Preise werden committed
7. **Deploy:** Push zu `main` + `gh-pages` Branch

### Wenn keine Änderungen:

- Kein Commit
- Kein Deploy
- Spart GitHub Actions Minuten

---

## 🎯 Erweiterte Features

### Mehrere Dateien updaten

```yaml
- name: Commit and Push Price Updates
  run: |
    git add data/price_data.csv
    git add data/all_cards_database.csv  # Weitere Dateien
    git commit -m "🏷️ Weekly update"
```

### Slack/Discord Benachrichtigung

```yaml
- name: Notify Discord
  if: steps.check_changes.outputs.changes == 'true'
  run: |
    curl -X POST "${{ secrets.DISCORD_WEBHOOK }}" \
      -H "Content-Type: application/json" \
      -d '{"content":"✅ Preise aktualisiert!"}'
```

### Cache für Dependencies

```yaml
- name: Cache pip
  uses: actions/cache@v3
  with:
    path: ~/.cache/pip
    key: ${{ runner.os }}-pip-${{ hashFiles('**/requirements.txt') }}
```

---

## 📝 Zusammenfassung

| Aspekt | Details |
|--------|---------|
| **Frequenz** | Jeden Montag 6:00 UTC |
| **Dauer** | 10-20 Minuten |
| **Kosten** | Kostenlos (GitHub Actions) |
| **Aktualität** | Maximal 7 Tage alt |
| **Wartung** | Keine (komplett automatisch) |

---

## 🆘 Support

Bei Problemen:
1. **GitHub Actions Logs** prüfen
2. **Lokaler Test:** `python card_price_scraper.py`
3. Settings-Datei: `card_price_scraper_settings.json`

---

**Version:** 1.0  
**Last Updated:** March 4, 2026
