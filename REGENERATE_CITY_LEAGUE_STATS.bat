@echo off
echo ========================================
echo Regenerate City League Statistics
echo ========================================
echo.

REM Activate virtual environment if it exists
if exist ".venv\Scripts\activate.bat" (
    echo Activating virtual environment...
    call .venv\Scripts\activate.bat
)

REM Run statistics regeneration script
echo Regenerating statistics from cleaned data...
python regenerate_city_league_stats.py

pause
