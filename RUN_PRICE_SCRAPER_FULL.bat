@echo off
REM ============================================================
REM FULL PRICE UPDATE - First time complete scrape
REM ============================================================
REM This will scrape ALL 19996 cards and takes ~11 hours
REM Only run this once or when you want to refresh all prices
REM ============================================================

echo.
echo ============================================================
echo FULL PRICE SCRAPER - CardMarket EUR prices (ALL CARDS)
echo ============================================================
echo.
echo This will scrape ALL 19996 cards from CardMarket
echo Estimated time: ~11 hours (2 seconds per card)
echo.
echo Press Ctrl+C to cancel, or
pause

REM Copy FULL settings to main settings file
copy /Y card_price_scraper_settings_FULL.json card_price_scraper_settings.json

REM Run the scraper with venv Python (has selenium-stealth installed)
.venv\Scripts\python.exe card_price_scraper.py

echo.
echo ============================================================
echo Completed!
echo ============================================================
pause
