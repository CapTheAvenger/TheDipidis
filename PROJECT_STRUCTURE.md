# Pokemon TCG Analysis - Projektstruktur

Stand: Maerz 2026

Dieses Dokument beschreibt die aktuelle Struktur des Repositories.

## 1) Root-Dateien

### Kern-Scraper und Datenaufbereitung
- all_cards_scraper.py
- japanese_cards_scraper.py
- city_league_archetype_scraper.py
- city_league_analysis_scraper.py
- current_meta_analysis_scraper.py
- limitless_online_scraper.py
- tournament_scraper_JH.py
- card_price_scraper.py
- pokemonproxies_scraper.py
- prepare_card_data.py
- update_sets.py
- card_scraper_shared.py

### Dashboard / Services
- start_scraper_dashboard.py
- START_DASHBOARD.bat
- price_proxy_server.py

### Konfiguration
- all_cards_scraper_settings.json
- japanese_cards_scraper_settings.json
- city_league_archetype_settings.json
- city_league_analysis_settings.json
- current_meta_analysis_settings.json
- limitless_online_settings.json
- card_price_scraper_settings.json
- tournament_JH_settings.json

### Projekt- und Betriebsdokumentation
- README.md
- PROJECT_STRUCTURE.md
- DATA_DIRECTORY_STRUCTURE.md
- CARD_DATA_SYSTEM.md
- LIVE_PRICE_SYSTEM.md
- PRICE_SCRAPER_README.md
- ALL_CARDS_SCRAPER_README.md
- JAPANESE_CARDS_SCRAPER_README.md
- FIREBASE_SETUP_GUIDE.md
- GITHUB_ACTIONS_SCHEDULE.md

### Git / Deployment
- PUSH_TO_GITHUB.bat
- .gitignore
- _config.yml

## 2) Verzeichnisse

### data/
Persistente CSV/JSON-Ausgaben der Scraper und vorbereitete Frontend-Daten.

### js/
Frontend-Logik (Dashboard, Auth, Collection, Playtester, Draw Simulator, Firebase).

### css/
Styles fuer Dashboard und Auth-Bereiche.

### images/
Statische Bilder und visuelle Assets.

### tests/
Testskripte fuer Scraper- und Price-Funktionen.

### utils/
Hilfsmodule fuer Parsing, Mapping, Normalisierung und Wiederverwendung.

### .github/
GitHub-Workflows und Repository-Automation.

### .vscode/
Workspace-spezifische Editor-Konfiguration.

## 3) Empfohlener Workflow

1. Gewuenschten Scraper mit Python ausfuehren (oder Dashboard starten).
2. Bei Bedarf prepare_card_data.py ausfuehren.
3. Frontend lokal ueber index.html oder einen lokalen HTTP-Server pruefen.
4. Aenderungen ueber PUSH_TO_GITHUB.bat committen und pushen.

## 4) Hinweis zur Pflege

Wenn Dateien/Ordner im Root oder in den Kernverzeichnissen hinzukommen/entfernt werden,
soll dieses Dokument direkt mit aktualisiert werden.
