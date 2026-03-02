@echo off
echo ============================================================
echo CITY LEAGUE ARCHETYPE SCRAPER - Deck archetypes
echo ============================================================
echo.
.venv\Scripts\python.exe city_league_archetype_scraper.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo FEHLER: Scraper fehlgeschlagen! Error Code: %ERRORLEVEL%
    pause
    exit /b %ERRORLEVEL%
)
echo.
echo ============================================================
echo Completed successfully!
echo ============================================================
pause
