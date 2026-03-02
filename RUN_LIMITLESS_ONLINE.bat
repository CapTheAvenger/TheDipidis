@echo off
echo ============================================================
echo LIMITLESS ONLINE SCRAPER - Online tournament decks
echo ============================================================
echo.
.venv\Scripts\python.exe limitless_online_scraper.py
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
