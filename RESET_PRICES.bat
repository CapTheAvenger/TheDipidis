@echo off
echo ============================================================
echo RESET PRICE DATA
echo ============================================================
echo.
echo This will DELETE price_data.csv
echo Next price scraper run will fetch ALL prices fresh.
echo.
pause

if exist "data\price_data.csv" (
    del "data\price_data.csv"
    echo.
    echo Price data deleted successfully!
) else (
    echo.
    echo No price data found to delete.
)

echo.
pause
