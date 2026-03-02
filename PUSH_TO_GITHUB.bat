@echo off
chcp 65001 >nul
REM ========================================
REM GitHub Push - Optimiert mit Error-Handling
REM ========================================
REM Pusht alle wichtigen Daten zu beiden GitHub Repositories

echo =====================================
echo   HausiTCG - GitHub Push (Optimized)
echo =====================================
echo.

echo [1/5] Git Status pruefen...
git status
if %ERRORLEVEL% NEQ 0 (
    echo FEHLER: Git-Repository nicht gefunden oder beschaedigt!
    pause
    exit /b 1
)
echo.

echo [2/5] Alle wichtigen Dateien zum Commit hinzufuegen...
echo.

REM Effiziente Pattern-basierte Adds
git add *.py *.bat *.md *.json *.csv *.html _config.yml .nojekyll
git add data/*.csv data/*.json data/*.html 2>nul
git add .github/workflows/*.yml 2>nul

REM Optional: Scraper Logs (falls vorhanden)
git add scraper_log.txt 2>nul

echo Dateien hinzugefuegt!
echo.

echo [3/5] Aenderungen pruefen...
git diff --cached --stat
echo.

echo [4/5] Commit erstellen...
set /p commit_msg="Commit Message (oder Enter fuer Timestamp): "

if "%commit_msg%"=="" (
    set commit_msg=Update: %date% %time%
)

git commit -m "%commit_msg%"
if %ERRORLEVEL% NEQ 0 (
    echo WARNUNG: Kein Commit erstellt - moeglicherweise keine Aenderungen.
    choice /C YN /M "Trotzdem fortfahren"
    if errorlevel 2 exit /b 0
)
echo.

echo [5/5] Push zu beiden Repositories...
echo.

echo Pushe zu HausiTCG (origin)...
git push origin main
if %ERRORLEVEL% NEQ 0 (
    echo FEHLER: Push zu origin fehlgeschlagen!
    pause
    exit /b 1
)
echo ✓ Origin erfolgreich gepusht
echo.

echo Pushe zu TheDipidis (dipidis - LIVE SITE)...
git push dipidis main
if %ERRORLEVEL% NEQ 0 (
    echo FEHLER: Push zu dipidis fehlgeschlagen!
    pause
    exit /b 1
)
echo ✓ Dipidis erfolgreich gepusht
echo.

echo =====================================
echo   ✓ Push erfolgreich abgeschlossen!
echo =====================================
echo.
echo Repository 1: https://github.com/CapTheAvenger/HausiTCG.git
echo Repository 2: https://github.com/CapTheAvenger/TheDipidis.git (LIVE)
echo Live-Seite:   https://captheavenger.github.io/TheDipidis/
echo.

pause
