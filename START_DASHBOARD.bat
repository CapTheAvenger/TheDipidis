@echo off
chcp 65001 >nul
echo ============================================================
echo Starte Pokemon TCG Scraping Dashboard...
echo ============================================================
echo.

.venv\Scripts\python.exe start_scraper_dashboard.py

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo FEHLER: Dashboard ist abgestuerzt! Error Code: %ERRORLEVEL%
    pause
)
