@echo off
chcp 65001 >nul
echo ============================================================
echo GitHub Repository Updater - Pokemon Deck Viewer
echo ============================================================
echo.

REM ============================================================
REM KONFIGURATION - HIER DEINEN GITHUB REPO PFAD EINTRAGEN!
REM ============================================================
set "REPO_PATH=C:\Users\haush\HausiTCG"
REM Beispiel: set "REPO_PATH=C:\Users\haush\GitHub\pokemon-deck-viewer"

REM ============================================================
REM QUELL-PFADE (automatisch ermittelt)
REM ============================================================
set "BASE_PATH=%~dp0.."
set "UNIFIED_CSV=%~dp0unified_card_data.csv"
set "CITY_CSV=%BASE_PATH%\City_League_Archetype_Scraper\city_league_archetypes_comparison.csv"
set "LIMITLESS_CSV=%BASE_PATH%\Limitless_Online_Scraper\limitless_online_decks_comparison.csv"
set "HTML_FILE=%~dp0deck_viewer.html"

REM ============================================================
REM PRÜFUNGEN
REM ============================================================

REM Prüfe, ob Repo-Pfad konfiguriert wurde
if "%REPO_PATH%"=="C:\DEIN\PFAD\ZU\GITHUB\pokemon-deck-viewer" (
    echo ❌ FEHLER: REPO_PATH ist noch nicht konfiguriert!
    echo.
    echo Bitte öffne UPDATE_GITHUB.bat in einem Texteditor und ändere:
    echo    set "REPO_PATH=C:\DEIN\PFAD\ZU\GITHUB\pokemon-deck-viewer"
    echo.
    echo Zu deinem tatsächlichen GitHub Repository Pfad.
    echo.
    pause
    exit /b 1
)

REM Prüfe, ob Repo-Ordner existiert
if not exist "%REPO_PATH%" (
    echo ❌ FEHLER: GitHub Repository nicht gefunden!
    echo    Pfad: %REPO_PATH%
    echo.
    echo Lösung:
    echo 1. Clone dein Repository: git clone https://github.com/DEIN-USERNAME/REPO-NAME.git
    echo 2. Passe REPO_PATH in dieser Datei an
    echo.
    pause
    exit /b 1
)

REM Prüfe, ob Git installiert ist
git --version >nul 2>&1
if errorlevel 1 (
    echo ❌ FEHLER: Git ist nicht installiert!
    echo.
    echo Installiere Git von: https://git-scm.com/download/win
    echo.
    pause
    exit /b 1
)

echo ✓ Git gefunden
echo ✓ Repository gefunden: %REPO_PATH%
echo.

REM ============================================================
REM DATEIEN KOPIEREN
REM ============================================================
echo [1/4] Kopiere Dateien...
echo.

REM Unified Card Data (Pflicht)
if exist "%UNIFIED_CSV%" (
    copy /Y "%UNIFIED_CSV%" "%REPO_PATH%\unified_card_data.csv" >nul
    echo   ✓ unified_card_data.csv
) else (
    echo   ⚠️  unified_card_data.csv nicht gefunden - übersprungen
)

REM City League Data (Optional)
if exist "%CITY_CSV%" (
    copy /Y "%CITY_CSV%" "%REPO_PATH%\city_league_archetypes_comparison.csv" >nul
    echo   ✓ city_league_archetypes_comparison.csv
) else (
    echo   ⚠️  city_league_archetypes_comparison.csv nicht gefunden - übersprungen
)

REM Limitless Online Data (Optional)
if exist "%LIMITLESS_CSV%" (
    copy /Y "%LIMITLESS_CSV%" "%REPO_PATH%\limitless_online_decks_comparison.csv" >nul
    echo   ✓ limitless_online_decks_comparison.csv
) else (
    echo   ⚠️  limitless_online_decks_comparison.csv nicht gefunden - übersprungen
)

REM HTML File (Optional - nur wenn du die Website auch aktualisieren willst)
if exist "%HTML_FILE%" (
    copy /Y "%HTML_FILE%" "%REPO_PATH%\deck_viewer.html" >nul
    echo   ✓ deck_viewer.html
) else (
    echo   ⚠️  deck_viewer.html nicht gefunden - übersprungen
)

echo.

REM ============================================================
REM GIT COMMIT & PUSH
REM ============================================================
echo [2/4] Wechsle ins Repository...
cd /d "%REPO_PATH%"
if errorlevel 1 (
    echo ❌ Fehler beim Wechseln ins Repository
    pause
    exit /b 1
)
echo   ✓ Im Repository: %CD%
echo.

echo [3/4] Git Status prüfen...
git status --short
echo.

echo [4/4] Änderungen hochladen...
echo.

REM Füge alle CSV-Dateien hinzu
git add *.csv deck_viewer.html 2>nul

REM Prüfe ob es Änderungen gibt
git diff --staged --quiet
if %errorlevel%==0 (
    echo ℹ️  Keine Änderungen gefunden - nichts zu committen
    echo.
    pause
    exit /b 0
)

REM Commit mit Timestamp
for /f "tokens=1-3 delims=/. " %%a in ('date /t') do set "DATE=%%c-%%b-%%a"
for /f "tokens=1-2 delims=:. " %%a in ('time /t') do set "TIME=%%a:%%b"

git commit -m "Update data - %DATE% %TIME%"
if errorlevel 1 (
    echo ❌ Fehler beim Commit
    pause
    exit /b 1
)

echo   ✓ Commit erfolgreich
echo.

echo Pushe zu GitHub...
git push
if errorlevel 1 (
    echo ❌ Fehler beim Push
    echo.
    echo Mögliche Lösungen:
    echo - Führe 'git pull' aus, falls Remote-Änderungen vorhanden sind
    echo - Prüfe deine GitHub-Zugangsdaten
    echo.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo ✅ ERFOLGREICH AKTUALISIERT!
echo ============================================================
echo.
echo Deine Website wird in 1-2 Minuten aktualisiert:
echo https://DEIN-USERNAME.github.io/pokemon-deck-viewer/deck_viewer.html
echo.
echo Tipp: Browser-Cache leeren mit Strg+F5 für sofortige Aktualisierung
echo.
pause
