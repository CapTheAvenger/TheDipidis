@echo off
chcp 65001 >nul
echo ============================================================
echo JAPANESE CARDS SCRAPER - Japanese card database
echo ============================================================
echo.
.venv\Scripts\python.exe japanese_cards_scraper.py
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
