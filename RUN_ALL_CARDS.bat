@echo off
chcp 65001 >nul
echo ============================================================
echo ALL CARDS SCRAPER - Complete card database from Limitless
echo ============================================================
echo.
.venv\Scripts\python.exe all_cards_scraper.py
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
