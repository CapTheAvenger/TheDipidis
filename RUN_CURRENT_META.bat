@echo off
echo ============================================================
echo CURRENT META ANALYSIS - Meta deck analysis
echo ============================================================
echo.
.venv\Scripts\python.exe current_meta_analysis_scraper.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo FEHLER: Scraper fehlgeschlagen! Error Code: %ERRORLEVEL%
    pause
    exit /b %ERRORLEVEL%
)
echo.
echo ============================================================
echo Completed successfully!
echo ============================================================
pause
