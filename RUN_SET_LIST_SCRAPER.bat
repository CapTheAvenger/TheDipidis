@echo off
echo ========================================
echo Pokemon TCG Set List Scraper
echo ========================================
echo.
echo This will scrape the latest set list from Limitless TCG
echo and update the Set Order mapping.
echo.
pause

.venv\Scripts\python.exe set_list_scraper.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo FEHLER: Scraper fehlgeschlagen! Error Code: %ERRORLEVEL%
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ========================================
echo Scraping Complete!
echo ========================================
echo.
echo Check:
echo   - data\pokemon_sets_list.csv for the raw data
echo   - data\pokemon_sets_order.js for the SET_ORDER mapping
echo.
echo Copy the SET_ORDER object into landing.html to update the app.
echo.
pause
