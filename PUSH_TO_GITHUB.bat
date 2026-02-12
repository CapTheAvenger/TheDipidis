@echo off
REM ============================================================
REM PUSH_TO_GITHUB.bat
REM Einfaches Skript um alle Änderungen zu GitHub zu pushen
REM ============================================================

setlocal enabledelayedexpansion

REM Farben für Output
set "GREEN=[92m"
set "YELLOW=[93m"
set "RED=[91m"
set "RESET=[0m"

echo.
echo %YELLOW%╔════════════════════════════════════════════════════════════╗%RESET%
echo %YELLOW%║   GitHub Push Script - Unified Scraper TCG                  ║%RESET%
echo %YELLOW%╚════════════════════════════════════════════════════════════╝%RESET%
echo.

REM Check if git is available
git --version > nul 2>&1
if errorlevel 1 (
    echo %RED%❌ Git ist nicht installiert oder nicht im PATH%RESET%
    pause
    exit /b 1
)

REM Check if we're in a git repository
git rev-parse --git-dir > nul 2>&1
if errorlevel 1 (
    echo %RED%❌ Dies ist kein Git-Repository%RESET%
    pause
    exit /b 1
)

REM Show current status
echo %YELLOW%📊 Aktueller Git Status:%RESET%
git status --short
echo.

REM Ask for commit message
set "commit_msg="
echo %YELLOW%💬 Commit-Nachricht eingeben:%RESET%
set /p commit_msg=">> "

if "!commit_msg!"=="" (
    echo %RED%❌ Fehler: Commit-Nachricht darf nicht leer sein!%RESET%
    pause
    exit /b 1
)

REM Add all changes
echo.
echo %YELLOW%📝 Füge alle Dateien hinzu...%RESET%
git add -A
if errorlevel 1 (
    echo %RED%❌ Fehler beim Hinzufügen von Dateiеn%RESET%
    pause
    exit /b 1
)

REM Commit changes
echo %YELLOW%📦 Erstelle Commit...%RESET%
git commit -m "!commit_msg!"
if errorlevel 1 (
    echo %RED%❌ Fehler beim Erstellen des Commits%RESET%
    pause
    exit /b 1
)

REM Push to GitHub
echo %YELLOW%🚀 Pushe zu GitHub...%RESET%
git push
if errorlevel 1 (
    echo %RED%❌ Fehler beim Push zu GitHub%RESET%
    pause
    exit /b 1
)

echo.
echo %GREEN%✅ Erfolgreich zu GitHub gepusht!%RESET%
echo.
echo %YELLOW%📱 Die Website ist jetzt verfügbar unter:%RESET%
echo    https://captheavenger.github.io/HausiTCG/
echo.
pause
