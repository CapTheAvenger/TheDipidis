@echo off
echo ============================================================
echo CARD PRICE SCRAPER - Update EUR prices from Limitless
echo ============================================================
echo.
echo This scraper updates ONLY the EUR prices for existing cards.
echo It reads from all_cards_database.csv and updates price_data.csv
echo.
echo Run this weekly (e.g., every Monday) to keep prices up-to-date.
echo.
.venv\Scripts\python.exe card_price_scraper.py
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
