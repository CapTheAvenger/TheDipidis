@echo off
echo.
echo ========================================
echo TOURNAMENT SCRAPER JH
echo ========================================
echo.
.venv\Scripts\python.exe tournament_scraper_JH.py
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
