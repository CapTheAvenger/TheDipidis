@echo off
chcp 65001 >nul
cls
echo ============================================================
echo              UNIFIED SCRAPER TCG - Quick Start
echo ============================================================
echo.
echo Startet ALLE 9 Scraper gleichzeitig parallel:
echo   1. Ace Spec Scraper (aktualisiert bekannte Ace Specs)
echo   2. All Cards Database Scraper (laut Settings-Datei)
echo   3. Japanese Cards Database Scraper (4 neueste Sets)
echo   4. Card Price Scraper (CardMarket Preise)
echo   5. City League Archetype Scraper
echo   6. Limitless Online Scraper
echo   7. Tournament Scraper JH
echo   8. City League Analysis Scraper
echo   9. Current Meta Analysis Scraper
echo.
echo WICHTIG: Alle Scraper laufen parallel (maximale Geschwindigkeit)
echo          Database-Scraper starten zuerst, andere nutzen dann die DBs
echo.
echo ============================================================
pause

echo.
echo ============================================================
echo Starte ALLE 9 Scraper parallel...
echo ============================================================
echo.

REM Start all scrapers as Python scripts in background
start "Ace-Spec" /MIN .venv\Scripts\python.exe ace_spec_scraper.py
start "All-Cards" /MIN .venv\Scripts\python.exe all_cards_scraper.py
start "Japanese-Cards" /MIN .venv\Scripts\python.exe japanese_cards_scraper.py
start "Card-Prices" /MIN .venv\Scripts\python.exe card_price_scraper.py
start "City-Archetype" /MIN .venv\Scripts\python.exe city_league_archetype_scraper.py
start "Limitless-Online" /MIN .venv\Scripts\python.exe limitless_online_scraper.py
start "Tournament-JH" /MIN .venv\Scripts\python.exe tournament_scraper_JH.py
start "City-Analysis" /MIN .venv\Scripts\python.exe city_league_analysis_scraper.py
start "Current-Meta" /MIN .venv\Scripts\python.exe current_meta_analysis_scraper.py

echo.
echo ✓ Alle 9 Scraper gestartet!
echo.
echo Monitoring: Alle Fenster im Hintergrund (/MIN)
echo Jedes Scraper-Fenster zeigt individuellen Fortschritt
echo.
echo WICHTIG: Warte bis alle Fenster geschlossen sind
echo          (kann 10-60 Minuten dauern je nach Tracking-Status)
echo.
echo ============================================================
echo.
echo HINWEIS: Alle Scraper laufen jetzt parallel im Hintergrund
echo.
echo Fertige Scraper: Fenster schließen automatisch oder warten auf ENTER
echo Ergebnisse: Im "data" Ordner (CSVs werden während Scraping geschrieben)
echo.
echo ============================================================
pause
