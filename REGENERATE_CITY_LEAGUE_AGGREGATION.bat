@echo off
REM =======================================================================
REM REGENERATE CITY LEAGUE CSV - Fix Deck Count Aggregation
REM =======================================================================
REM Problem: Multiple tournaments on same date show wrong deck totals
REM Solution: Re-aggregate existing CSV data (no re-scraping needed!)
REM =======================================================================

echo.
echo ========================================================
echo   FIX CITY LEAGUE DECK COUNTS
echo ========================================================
echo.
echo This will re-aggregate the city_league_analysis.csv file
echo to fix deck count issues when multiple tournaments happen  
echo on the same date.
echo.
echo NO RE-SCRAPING NEEDED - just fixes existing data!
echo Execution time: ~5 seconds
echo.
pause

REM Activate virtual environment
call .venv\Scripts\activate.bat

REM Run reaggregation script
python regenerate_city_league_aggregation.py

pause
