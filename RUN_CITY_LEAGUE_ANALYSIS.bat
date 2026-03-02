@echo off
echo.
echo ========================================
echo CITY LEAGUE ANALYSIS SCRAPER
echo ========================================
echo.
.venv\Scripts\python.exe city_league_analysis_scraper.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo FEHLER: Scraper fehlgeschlagen! Error Code: %ERRORLEVEL%
    pause
    exit /b %ERRORLEVEL%
)
echo.
echo ========================================
echo Scraper finished successfully!
echo ========================================
echo.
pause
