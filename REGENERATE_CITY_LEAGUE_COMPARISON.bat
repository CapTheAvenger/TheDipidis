@echo off
echo ========================================
echo Regenerate City League Comparison
echo ========================================
echo.

REM Run comparison regeneration script
echo Regenerating comparison CSV from cleaned data...
.venv\Scripts\python.exe regenerate_city_league_comparison.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo FEHLER: Script fehlgeschlagen! Error Code: %ERRORLEVEL%
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo Comparison regenerated successfully!
pause
