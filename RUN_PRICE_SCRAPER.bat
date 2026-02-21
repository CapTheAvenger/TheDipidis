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
python card_price_scraper.py
pause
