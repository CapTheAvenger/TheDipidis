@echo off
echo ============================================================
echo PERFORMANCE OPTIMIZATION - Extract Assets
echo ============================================================
echo.
echo This script extracts CSS and JavaScript from index.html
echo into separate files for better performance.
echo.
echo Expected benefits:
echo   - 60-80%% faster page load
echo   - Browser caching enabled
echo   - Better code organization
echo.
echo ============================================================
echo.

.venv\Scripts\python.exe extract_assets.py

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo FEHLER: Extraktion fehlgeschlagen! Error Code: %ERRORLEVEL%
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ============================================================
echo Optimization complete!
echo ============================================================
echo.
echo Next: Test index_optimized.html in your browser
echo.
pause
