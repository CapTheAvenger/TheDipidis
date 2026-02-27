@echo off
echo ========================================
echo Fix City League Archetype Duplicates
echo ========================================
echo.

REM Activate virtual environment if it exists
if exist ".venv\Scripts\activate.bat" (
    echo Activating virtual environment...
    call .venv\Scripts\activate.bat
)

REM Run deduplication script
echo Running deduplication script...
python fix_city_league_duplicates.py

pause
