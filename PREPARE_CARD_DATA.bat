@echo off
echo ============================================================
echo PREPARE CARD DATA - Merge cards + prices for landing.html
echo ============================================================
echo.
echo This merges all_cards_database.csv + price_data.csv
echo Creates all_cards_merged.json for landing.html
echo.
echo Run this AFTER:
echo   1. RUN_ALL_CARDS.bat (or incremental update)
echo   2. RUN_PRICE_SCRAPER.bat
echo.
.venv\Scripts\python.exe prepare_card_data.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo FEHLER: Script fehlgeschlagen! Error Code: %ERRORLEVEL%
    pause
    exit /b %ERRORLEVEL%
)
echo.
echo ============================================================
echo Completed successfully!
echo ============================================================
pause
