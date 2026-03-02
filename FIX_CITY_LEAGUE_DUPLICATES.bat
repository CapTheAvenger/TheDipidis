@echo off
echo ========================================
echo Fix City League Archetype Duplicates
echo ========================================
echo.

REM Run deduplication script
echo Running deduplication script...
.venv\Scripts\python.exe fix_city_league_duplicates.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo FEHLER: Script fehlgeschlagen! Error Code: %ERRORLEVEL%
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo Deduplication completed successfully!
pause
