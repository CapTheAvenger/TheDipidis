@echo off
echo ========================================
echo Regenerate City League Comparison
echo ========================================
echo.

REM Activate virtual environment if it exists
if exist ".venv\Scripts\activate.bat" (
    echo Activating virtual environment...
    call .venv\Scripts\activate.bat
)

REM Run comparison regeneration script
echo Regenerating comparison CSV from cleaned data...
python regenerate_city_league_comparison.py

pause
