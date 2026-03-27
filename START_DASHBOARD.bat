@echo off
chcp 65001 >nul
set "PROJECT_ROOT=%~dp0"
cd /d "%PROJECT_ROOT%"
echo ============================================================
echo Starte Pokemon TCG Scraping Dashboard...
echo ============================================================
echo.

"%PROJECT_ROOT%.venv\Scripts\python.exe" "%PROJECT_ROOT%backend\start_scraper_dashboard.py"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo FEHLER: Dashboard ist abgestuerzt! Error Code: %ERRORLEVEL%
    pause
)
