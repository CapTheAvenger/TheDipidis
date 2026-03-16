# Live Price System - Documentation

## Overview

Das Live Price System ermöglicht es, **aktuelle EUR-Preise direkt beim Laden der Website** von Limitless TCG und Cardmarket abzurufen, ohne vorher alle 20.000 Karten scrapen zu müssen.

## Architektur

```
Browser (index.html)
    ↓ JavaScript fetch()
Proxy Server (localhost:8001)
    ↓ HTTP requests
Limitless TCG / Cardmarket
    ↓ HTML responses
Proxy parst Preise
    ↓ JSON response
Browser zeigt Live-Preis an
```

## Komponenten

### 1. **Proxy Server** (`price_proxy_server.py`)
- Flask-Server auf Port 8001
- Bypassed CORS-Restriktionen
- Endpoints:
  - `GET /fetch-price?url=...&source=limitless` - Einzelner Preis
  - `GET /health` - Health Check

### 2. **JavaScript Functions** (in `index.html`)
- `checkProxyServer()` - Prüft, ob Server läuft
- `fetchLivePrice(card)` - Holt Live-Preis für eine Karte
- `updatePriceButton(button, price)` - Aktualisiert Button mit Live-Preis
- `autoFetchLivePrices(cards)` - Auto-Loading für mehrere Karten

### 3. **Batch File** (`START_LIVE_PRICE_PROXY.bat`)
- Startet den Proxy-Server
- Aktiviert Virtual Environment automatisch

## Installation

### Voraussetzungen
```bash
pip install flask flask-cors beautifulsoup4 requests
```

### Starten
1. **Proxy-Server starten:**
   ```
   START_LIVE_PRICE_PROXY.bat
   ```
   
2. **Website öffnen:**
   - HTTP-Server starten (Python, Live Server, etc.)
   - Browser öffnen: `http://localhost:8000` (oder dein Port)

3. **Live-Preise werden automatisch geladen** ✓

## Nutzung

### Automatisches Laden (Empfohlen)

Die Website lädt Live-Preise automatisch, wenn:
- Der Proxy-Server läuft
- Karten angezeigt werden

```javascript
// Beispiel: Nach dem Rendern von Karten
await autoFetchLivePrices(displayedCards, 'price-btn-prefix');
```

### Manuelles Laden

```javascript
// Einzelne Karte
const card = { set: 'SVI', number: '123', card_url: '/cards/SVI/123' };
const livePrice = await fetchLivePrice(card);

if (livePrice) {
    console.log('Price:', livePrice.price);
    console.log('Cardmarket URL:', livePrice.cardmarket_url);
}
```

### Button-Integration

```javascript
// Button mit ID erstellen
const button = document.getElementById('my-price-btn');

// Live-Preis laden und Button aktualisieren
const livePrice = await fetchLivePrice(card);
if (livePrice) {
    updatePriceButton(button, livePrice);
}
```

## Features

### ✅ **Cache-System**
- Preise werden 5 Minuten gecacht
- Reduziert Server-Last
- Schnellere Ladezeiten

### ✅ **Rate Limiting**
- 0.3s Delay zwischen Requests
- Verhindert IP-Banning
- Schont externe Server

### ✅ **Fallback-Strategie**
1. Limitless TCG (bevorzugt)
2. Cardmarket (fallback)
3. Statische Datenbank (wenn Proxy offline)

### ✅ **Visual Feedback**
- Grüner Button = Live-Preis geladen
- Grauer Button = Kein Preis verfügbar
- Loading-State möglich

## Vorteile vs. Statisches Scraping

| Aspekt | Statisches Scraping | Live Prices |
|--------|-------------------|-------------|
| **Aktualität** | Veraltet nach Stunden/Tagen | Immer aktuell |
| **Setup-Zeit** | Mehrere Stunden für 20k Karten | Sofort einsatzbereit |
| **Storage** | 20k Preise in CSV | Nur Cache (temporär) |
| **Maintenance** | Wöchentliches Re-Scraping | Keine Wartung nötig |
| **Geschwindigkeit** | Sofort aus CSV | 0.5-1s pro Karte |

## Performance

- **Einzelner Preis:** ~500-1000ms
- **Batch (5 Karten):** ~2-3 Sekunden
- **Cache Hit:** <1ms
- **Ohne Proxy:** Fallback zu statischen Daten

## Troubleshooting

### Proxy-Server startet nicht
```bash
# Manuelle Installation
pip install flask flask-cors beautifulsoup4 requests

# Virtual Environment aktivieren
.venv\Scripts\activate

# Server manuell starten
python price_proxy_server.py
```

### Live-Preise werden nicht geladen
1. **Prüfe, ob Proxy läuft:**
   - Browser: `http://localhost:8001/health`
   - Sollte `{"status": "ok"}` anzeigen

2. **Console-Log prüfen:**
   - F12 → Console
   - Schaue nach Fehlermeldungen

3. **CORS-Fehler:**
   - Sollte nicht auftreten (Proxy hat CORS aktiviert)
   - Falls doch: Überprüfe Port (8001)

### Preise werden nicht geparst
- Limitless/Cardmarket haben HTML geändert
- Proxy-Server-Code muss angepasst werden (BeautifulSoup Selectors)

## Erweiterungen

### API-Endpoints hinzufügen
```python
@app.route('/fetch-price-batch', methods=['POST'])
def fetch_price_batch():
    # Batch-Processing (bis 50 Karten)
    ...
```

### Caching verbessern
```python
# Redis statt In-Memory
import redis
cache = redis.Redis(host='localhost', port=6379)
```

### Database-Integration
```python
# Speichere Live-Preise periodisch in CSV
if price_changed:
    update_price_database(card, price)
```

## Security Notes

⚠️ **Wichtig:** Dieser Proxy ist nur für **lokale Entwicklung** gedacht!

- **Nicht** auf öffentlichen Servern deployen
- **Keine** sensiblen Daten übertragen
- **Nur** localhost (127.0.0.1) erlaubt

## Next Steps

1. **Integration in Meta-Analysis:**
   - Live-Preise für Top-Decks
   - Deck-Cost Calculator mit Live-Daten

2. **UI-Verbesserungen:**
   - Loading-Spinner während Fetch
   - "Refresh"-Button für manuelle Updates
   - Preis-Historie anzeigen

3. **Batch-Optimierung:**
   - Mehrere Karten parallel laden
   - Intelligentes Priorisieren (Meta-Karten zuerst)

## Support

Bei Fragen oder Problemen:
- Check `price_proxy_server.py` Logs
- Browser Console (F12)
- Server Terminal Output

---

**Version:** 1.0  
**Last Updated:** March 4, 2026
