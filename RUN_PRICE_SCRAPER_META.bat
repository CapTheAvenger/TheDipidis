@echo off
REM ============================================================
REM META PRICE UPDATE - Only current meta cards
REM ============================================================
REM Updates only cards from TWM (Twilight Masquerade) onwards
REM Much faster, use this for weekly updates
REM ============================================================

echo.
echo ============================================================
echo META PRICE SCRAPER - CardMarket EUR prices (META CARDS)
echo ============================================================
echo.
echo This will update cards from TWM onwards (meta-relevant sets)
echo Sets: TWM, SFA, SCR, SSP, PRE, JTG, DRI, WHT, BLK, 
echo       MEE, MEG, PFL, ASC + Promos (SVP, MEP, SP)
echo.
echo Estimated time: ~1-2 hours (depending on how many cards)
echo.
echo Press Ctrl+C to cancel, or
pause

REM Copy META settings to main settings file
copy /Y card_price_scraper_settings_META.json card_price_scraper_settings.json

REM Run the scraper with venv Python (has selenium-stealth installed)
.venv\Scripts\python.exe card_price_scraper.py

echo.
echo ============================================================
echo Completed!
echo ============================================================
pause
