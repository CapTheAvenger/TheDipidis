# CardMarket Price Scraper - Anleitung

## 🎯 Zweck

Dieser Scraper lädt automatisch die Preise von CardMarket für ein bestimmtes Set.  
**Nur Mid und High Rarity werden gescraped** (Low Rarity zeigt nur Links).

---

## ⚙️ Setup

### 1. Chrome Browser installieren

Der Scraper braucht Google Chrome.  
Download: https://www.google.com/chrome/

### 2. ChromeDriver installieren

- Download: https://googlechromelabs.github.io/chrome-for-testing/
- Wähle die Version die zu deinem Chrome passt
- Entpacke `chromedriver.exe` nach `C:\Windows\` ODER in den Projekt-Ordner
- Alternative: `pip install webdriver-manager` (automatisch)

### 3. Selenium installieren

```bash
.venv\Scripts\activate
pip install selenium
```

---

## 🚀 Verwendung

### Schritt 1: Config bearbeiten

Öffne `scraper_config.json` und ändere:

```json
{
  "target_set": "ASC",              ← 3-Buchstaben Set-Code
  "target_set_name": "Astral Scarlet",  ← Voller Set-Name
  "rarity_versions_to_scrape": ["2", "3"]  ← Nur Mid (2) und High (3)
}
```

**Wichtige Set-Codes** (aus `all_cards_database.csv`):

- `ASC` = Astral Scarlet
- `MEG` = Mega Evolution
- `PAL` = Paldea
- `SP` = Sword & Shield Promos
- `SVI` = Scarlet & Violet

### Schritt 2: Scraper starten

Doppelklick auf: **`RUN_PRICE_SCRAPER.bat`**

### Schritt 3: Warten

- Der Scraper öffnet Chrome Browser
- Geht jede Karte durch (V2 + V3)
- Extrahiert den Preis
- Speichert in `data/cardmarket_prices.csv`

**Geschwindigkeit:**

- ~3-6 Sekunden pro Karte
- ~200 Karten (ASC) = ca. 30-40 Minuten
- Alle 50 Karten: 2 Minuten Pause

### Schritt 4: Browser neu laden

Nach dem Scraper:

- F5 in `landing.html` drücken
- Preise sollten nun bei Mid/High Rarity erscheinen

---

## 📊 Wie es funktioniert

### Versionen:

- **V1 (Low Rarity)**: Common, Uncommon, Rare, Holo  
  → Zeigt nur "🔍 CardMarket" Link (kein Preis)

- **V2 (Mid Rarity)**: Ultra Rare, Rainbow Rare  
  → Zeigt "💰 €X.XX" wenn gescraped

- **V3 (High Rarity)**: EX, V, VMAX, VSTAR, Special Art  
  → Zeigt "💰 €X.XX" wenn gescraped

### Checkpoint-System:

- Fortschritt wird alle 10 Karten gespeichert
- Bei Abbruch (Ctrl+C): Fortschritt bleibt erhalten
- Beim nächsten Start: Macht dort weiter

### Log-Dateien:

- `price_scraper.log` - Detailliertes Log
- `scraper_checkpoint.json` - Fortschritt-Checkpoint

---

## 🛠 Fehlerbehandlung

### "ChromeDriver not found"

**Lösung:**

```bash
pip install webdriver-manager
```

Oder manuell ChromeDriver installieren (siehe oben).

### "Error extracting price"

**Mögliche Ursachen:**

1. CardMarket hat Layout geändert → CSS Selektoren anpassen
2. Bot-Detection → Delays erhöhen in `scraper_config.json`
3. Karte existiert nicht auf CardMarket

**Lösung:** Delays erhöhen:

```json
"delay_min_seconds": 5,
"delay_max_seconds": 10
```

### "TimeoutException"

Seite lädt zu langsam.  
**Lösung:** Internet-Verbindung prüfen oder Timeout erhöhen (im Code, Zeile ~120).

### Browser wird von CardMarket blockiert

**Lösung:**

1. Selenium mit echtem Chrome-Profil nutzen (manuell einloggen)
2. headless: false → Du siehst was passiert
3. Längere Delays (8-12 Sekunden)

---

## ⚡ Performance-Tipps

### Schneller (riskanter):

```json
"delay_min_seconds": 2,
"delay_max_seconds": 4,
"batch_size": 100
```

### Langsamer (sicherer):

```json
"delay_min_seconds": 5,
"delay_max_seconds": 10,
"batch_size": 30,
"batch_pause_minutes": 5
```

### Headless Mode (im Hintergrund):

```json
"headless": true
```

→ Schneller, aber siehst nicht was passiert

---

## 📅 Wöchentliche Updates

### Windows Task Scheduler:

1. Task Scheduler öffnen
2. "Create Basic Task"
3. Trigger: Weekly (z.B. Sonntag 3:00 Uhr)
4. Action: `RUN_PRICE_SCRAPER.bat`

### Manuell:

Einfach `RUN_PRICE_SCRAPER.bat` einmal pro Woche laufen lassen.

---

## 📁 Dateien Übersicht

| Datei                         | Zweck                             |
| ----------------------------- | --------------------------------- |
| `scraper_config.json`         | Konfiguration (Set, Delays, etc.) |
| `cardmarket_price_scraper.py` | Python Scraper                    |
| `RUN_PRICE_SCRAPER.bat`       | Start-Script                      |
| `data/cardmarket_prices.csv`  | Output mit Preisen                |
| `price_scraper.log`           | Detailliertes Log                 |
| `scraper_checkpoint.json`     | Fortschritt                       |

---

## 🔍 Beispiel-Output

### Vorher (data/cardmarket_prices.csv):

```csv
set,number,name,rarity,version,price_eur,cardmarket_url
ASC,1,Bulbasaur,,2,,"https://www.cardmarket.com/..."
ASC,1,Bulbasaur,,3,,"https://www.cardmarket.com/..."
```

### Nachher:

```csv
set,number,name,rarity,version,price_eur,cardmarket_url
ASC,1,Bulbasaur,,2,0.50,"https://www.cardmarket.com/..."
ASC,1,Bulbasaur,,3,12.99,"https://www.cardmarket.com/..."
```

### Im Browser:

- **Low Rarity**: 🔍 CardMarket (Link)
- **Mid Rarity**: 💰 €0.50 (Preis)
- **High Rarity**: 💰 €12.99 (Preis)

---

## ⚠️ Wichtige Hinweise

1. **CardMarket Terms of Service beachten**  
   Zu viele Requests = automatische Blockierung möglich

2. **Delays nicht zu kurz setzen**  
   Minimum 3 Sekunden zwischen Requests

3. **Checkpoint regelmäßig speichern**  
   Bei Absturz kann fortgesetzt werden

4. **Nur aktuelle Sets scrapen**  
   Nicht alle 23.000 URLs auf einmal! (→ Ban-Risiko)

5. **Preise aktualisieren sich automatisch**  
   Sobald CSV aktualisiert ist, F5 im Browser drücken

---

## 🆘 Support

Bei Problemen:

1. `price_scraper.log` prüfen
2. Chrome + ChromeDriver Version checken
3. Internet-Verbindung stabil?
4. CardMarket erreichbar?

---

**Viel Erfolg beim Scrapen! 🎴💰**
