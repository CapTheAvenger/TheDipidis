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
if errorlevel 1 (
    echo [WARN] Remote '%REMOTE%' not found.
    git remote get-url origin >nul 2>&1
    if not errorlevel 1 (
        set "REMOTE=origin"
        echo [INFO] Fallback remote selected: !REMOTE!
    ) else (
        echo [ERROR] No usable remote found (neither 'dipidis' nor 'origin').
        echo [INFO] Configure a remote first, then run this script again.
        goto :end
    )
)

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

echo [3/7] Staging all tracked and new files...
git add -A
if errorlevel 1 (
    echo [ERROR] git add failed.
    goto :end
)

echo [4/7] Checking staged changes...
git diff --cached --quiet
if not errorlevel 1 goto has_changes
echo [INFO] No staged changes. Nothing to commit.
goto :end

:has_changes
echo.
echo [INFO] Changed files (staged):
git diff --cached --name-status
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

echo [6/7] Pushing safely (no force)...
git push -u !REMOTE! %BRANCH%
if errorlevel 1 (
    echo [ERROR] Normal push failed.
    echo [INFO] Most common reason: remote has newer commits.
    echo [INFO] Run: git pull --rebase !REMOTE! %BRANCH%
    echo [INFO] Then run this script again.
    goto :end
)

echo [7/7] Done.
echo [SUCCESS] Changes pushed to !REMOTE!/%BRANCH%.

echo.
choice /M "Force push anyway (DANGEROUS)"
if errorlevel 2 goto :end

echo [WARN] Force pushing to !REMOTE!/%BRANCH% ...
git push --force-with-lease !REMOTE! %BRANCH%
if errorlevel 1 (
    echo [ERROR] Force push failed.
    goto :end
)
echo [SUCCESS] Force push completed with --force-with-lease.

:end
echo.
pause
endlocal