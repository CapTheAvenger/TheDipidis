@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

set "REMOTE=dipidis"
set "BRANCH=main"

echo ==============================================
echo Pokemon TCG Analysis - Safe Push Helper
echo Preferred Remote: %REMOTE%
echo Target Branch: %BRANCH%
echo ==============================================
echo.

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
    echo [ERROR] This folder is not a git repository.
    goto :end
)

git remote get-url %REMOTE% >nul 2>&1
if errorlevel 1 goto :no_preferred_remote
goto :remote_ok

:no_preferred_remote
echo [WARN] Remote '%REMOTE%' not found.
git remote get-url origin >nul 2>&1
if errorlevel 1 (
    echo [ERROR] No usable remote found - neither 'dipidis' nor 'origin'.
    echo [INFO] Configure a remote first, then run this script again.
    goto :end
)
set "REMOTE=origin"
echo [INFO] Fallback remote selected: !REMOTE!

:remote_ok
echo [1/7] Fetching latest remote refs...
git fetch !REMOTE! --prune
if errorlevel 1 (
    echo [WARN] Fetch failed. Continuing, but remote state may be outdated.
)

echo [2/7] Switching to target branch '%BRANCH%'...
git checkout %BRANCH% >nul 2>&1
if errorlevel 1 (
    echo [INFO] Branch '%BRANCH%' does not exist locally. Creating it now...
    git checkout -b %BRANCH%
    if errorlevel 1 (
        echo [ERROR] Could not create/switch to branch %BRANCH%.
        goto :end
    )
)

echo [3/7] Bumping version strings ^(cache busting^)...
powershell -ExecutionPolicy Bypass -File "%~dp0bump-version.ps1"
if errorlevel 1 (
    echo [WARN] bump-version.ps1 failed, continuing with old versions.
)

echo [3a/7] Staging all tracked and new files...
git add -A
if errorlevel 1 (
    echo [ERROR] git add failed.
    goto :end
)

echo.
echo [3b/7] Pruefen auf geloeschte Dateien...
set "DELETED_TMP=%TEMP%\git_deleted_%RANDOM%.txt"
git diff --cached --name-only --diff-filter=D 2>nul > "!DELETED_TMP!"
set "DELETED_COUNT=0"
for /f %%i in ('type "!DELETED_TMP!" 2^>nul ^| find /c /v ""') do set "DELETED_COUNT=%%i"
if !DELETED_COUNT! gtr 0 (
    echo.
    echo [WARNUNG] ================================================================
    echo [WARNUNG] !DELETED_COUNT! Datei^(en^) werden aus Git GELOESCHT:
    echo [WARNUNG] ================================================================
    type "!DELETED_TMP!"
    echo [WARNUNG] ================================================================
    echo.
    echo Moegliche Ursache: OneDrive hat Dateien als "Nur online" markiert ^(lokale
    echo Kopie verschwunden^). Oeffne den OneDrive-Ordner und waehle "Immer auf
    echo diesem Geraet behalten" fuer die betroffenen Dateien, dann erneut versuchen.
    echo.
    choice /M "Loeschungen TROTZDEM committen (J=Ja, N=Abbrechen)"
    if errorlevel 2 (
        echo [INFO] Abgebrochen - Staging wird zurueckgesetzt...
        git reset HEAD >nul 2>&1
        del "!DELETED_TMP!" >nul 2>&1
        goto :end
    )
    echo [INFO] Loeschungen wurden bestaetigt.
)
del "!DELETED_TMP!" >nul 2>&1

echo.
echo [3c/7] Pruefen ob Scraper-Daten aktuell sind...
set "BACKEND_DATA=backend\core\data"
set "MANIFEST=data\cards_manifest.json"
set "PREPARE_SCRIPT=prepare_card_data.py"

REM --- Check 1: Backend scraper data vorhanden? ---
set "CSV_COUNT=0"
if exist "!BACKEND_DATA!" (
    for %%f in ("!BACKEND_DATA!\*.csv") do set /a CSV_COUNT+=1
)
if !CSV_COUNT! equ 0 (
    echo [WARNUNG] Keine CSV-Dateien in !BACKEND_DATA! gefunden.
    echo [INFO]    Scraper wurden evtl. noch nicht ausgefuehrt.
)
if !CSV_COUNT! gtr 0 (
    echo [OK] !CSV_COUNT! CSV-Datei^(en^) in !BACKEND_DATA! gefunden.
)

REM --- Check 2: Backend-Daten neuer als Frontend-Manifest? ---
set "NEED_PREPARE=0"
if exist "!BACKEND_DATA!\all_cards_merged.csv" (
    if exist "!MANIFEST!" (
        REM xcopy /D /L prueft ob Quelle neuer als Ziel
        for /f %%a in ('xcopy /D /L /Y "!BACKEND_DATA!\all_cards_merged.csv" "!MANIFEST!" 2^>nul ^| find /c "all_cards_merged"') do (
            if %%a gtr 0 set "NEED_PREPARE=1"
        )
        if !NEED_PREPARE! equ 1 (
            echo [WARNUNG] Backend-Daten sind NEUER als Frontend-Manifest.
            echo [INFO]    prepare_card_data.py sollte ausgefuehrt werden.
            choice /M "prepare_card_data.py JETZT ausfuehren"
            if not errorlevel 2 (
                echo [INFO] Starte prepare_card_data.py ...
                if exist "venv\Scripts\python.exe" (
                    venv\Scripts\python.exe "!PREPARE_SCRIPT!"
                ) else (
                    python "!PREPARE_SCRIPT!"
                )
                if errorlevel 1 (
                    echo [ERROR] prepare_card_data.py fehlgeschlagen!
                    choice /M "Trotzdem fortfahren"
                    if errorlevel 2 goto :end
                ) else (
                    echo [OK] prepare_card_data.py erfolgreich.
                    echo [INFO] Staging erneut...
                    git add -A
                )
            )
        ) else (
            echo [OK] Frontend-Daten sind aktuell.
        )
    )
)

REM --- Check 3: cards_manifest.json totalCards > 0? ---
set "TOTAL_OK=0"
if exist "!MANIFEST!" (
    for /f "tokens=2 delims=:, " %%v in ('findstr /i "totalCards" "!MANIFEST!"') do (
        if %%v gtr 0 (
            set "TOTAL_OK=1"
            echo [OK] cards_manifest.json: totalCards = %%v
        )
    )
    if !TOTAL_OK! equ 0 (
        echo.
        echo [FEHLER] ================================================================
        echo [FEHLER] cards_manifest.json hat totalCards = 0 oder fehlt!
        echo [FEHLER] Das wuerde ALLE Kartenbilder auf der Website loeschen!
        echo [FEHLER] ================================================================
        echo.
        choice /M "TROTZDEM committen (NICHT empfohlen)"
        if errorlevel 2 (
            echo [INFO] Abgebrochen - Staging wird zurueckgesetzt...
            git reset HEAD >nul 2>&1
            goto :end
        )
    )
) else (
    echo [WARNUNG] !MANIFEST! nicht gefunden - Karten-Check uebersprungen.
)

echo [4/7] Checking staged changes...
git diff --cached --quiet
if errorlevel 1 goto :has_changes
echo [INFO] No staged changes. Nothing to commit.
goto :end

:has_changes
echo.
echo [INFO] Changed files:
git --no-pager diff --cached --name-status
echo.

set "COMMIT_MSG="
set /p COMMIT_MSG=Commit message (Enter for default): 
if "%COMMIT_MSG%"=="" set "COMMIT_MSG=chore: update project data and code"

echo [5/7] Creating commit...
git commit -m "%COMMIT_MSG%"
if errorlevel 1 (
    echo [ERROR] Commit failed.
    goto :end
)

echo [6/7] Pushing safely...
git push -u !REMOTE! %BRANCH%
if not errorlevel 1 goto :push_ok

echo [ERROR] Normal push failed.
echo [INFO] Most common reason: remote has newer commits.
echo.
choice /M "Try force push with --force-with-lease"
if errorlevel 2 goto :end

echo [WARN] Force pushing to !REMOTE!/%BRANCH% ...
git push --force-with-lease !REMOTE! %BRANCH%
if errorlevel 1 (
    echo [ERROR] Force push also failed.
    echo [INFO] Try: git pull --rebase !REMOTE! %BRANCH%
    echo [INFO] Then run this script again.
    goto :end
)
echo [SUCCESS] Force push completed.
goto :end

:push_ok
echo [7/7] Done.
echo [SUCCESS] Changes pushed to !REMOTE!/%BRANCH%.

:end
echo.
pause
endlocal