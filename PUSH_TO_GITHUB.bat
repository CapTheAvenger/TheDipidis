@echo off
setlocal EnableExtensions

cd /d "%~dp0"

set "REMOTE=dipidis"
set "BRANCH=main"

echo ==============================================
echo Pokemon TCG Analysis - Full Repo Push
echo Remote: %REMOTE%
echo Branch: %BRANCH%
echo ==============================================
echo.

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
    echo [ERROR] This folder is not a git repository.
    goto :end
)

echo [1/5] Staging all changes...
git add -A
if errorlevel 1 (
    echo [ERROR] git add failed.
    goto :end
)

echo [2/5] Checking staged changes...
git diff --cached --quiet
if not errorlevel 1 goto has_changes
echo [INFO] No changes to commit.
goto :end

:has_changes
echo [3/5] Creating commit...
git commit -m "Reset repo: adopt new local structure and remove GitHub Actions"
if errorlevel 1 (
    echo [ERROR] Commit failed.
    goto :end
)

echo [4/5] Ensuring branch name...
git branch -M %BRANCH%
if errorlevel 1 (
    echo [ERROR] Could not switch/rename branch to %BRANCH%.
    goto :end
)

echo [5/5] Force pushing to GitHub...
git push %REMOTE% %BRANCH% --force
if errorlevel 1 (
    echo [ERROR] Push failed. Check remote name, credentials, or network.
    goto :end
)

echo.
echo [SUCCESS] Repository fully pushed to %REMOTE%/%BRANCH%.

:end
echo.
pause
endlocal