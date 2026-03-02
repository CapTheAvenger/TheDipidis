@echo off
echo ========================================
echo Regenerate City League Statistics
echo ========================================
echo.

REM Run statistics regeneration script
echo Regenerating statistics from cleaned data...
.venv\Scripts\python.exe regenerate_city_league_stats.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo FEHLER: Script fehlgeschlagen! Error Code: %ERRORLEVEL%
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo Statistics regenerated successfully!
pause
