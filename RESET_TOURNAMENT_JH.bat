@echo off
echo =========================================
echo  RESET TOURNAMENT DATA (JH)
echo =========================================
echo.
echo This will DELETE the Tournament analysis data.
echo All scraped tournament and card data will be removed.
echo.
echo Files to delete:
echo - data\tournament_cards_data_overview.csv
echo - data\tournament_cards_data_cards.csv
echo - data\tournament_jh_scraped.json (tracking file)
echo.
pause

if exist "data\tournament_cards_data_overview.csv" (
    del "data\tournament_cards_data_overview.csv"
    echo ✓ Deleted tournament_cards_data_overview.csv
) else (
    echo ! tournament_cards_data_overview.csv not found
)

if exist "data\tournament_cards_data_cards.csv" (
    del "data\tournament_cards_data_cards.csv"
    echo ✓ Deleted tournament_cards_data_cards.csv
) else (
    echo ! tournament_cards_data_cards.csv not found
)

if exist "data\tournament_jh_scraped.json" (
    del "data\tournament_jh_scraped.json"
    echo ✓ Deleted tournament_jh_scraped.json (tracking file)
) else (
    echo ! tournament_jh_scraped.json not found
)

echo.
echo Reset complete!
echo Run RUN_TOURNAMENT_SCRAPER_JH.bat to rebuild the data.
echo.
pause
