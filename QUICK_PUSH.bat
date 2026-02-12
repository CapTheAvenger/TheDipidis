@echo off
REM ============================================================
REM QUICK_PUSH.bat
REM Schneller Push zu GitHub (ohne lange Erklärungen)
REM ============================================================

setlocal enabledelayedexpansion

echo.
echo 🚀 Quick Push zu GitHub...
echo.

REM Check if git is available
git --version > nul 2>&1
if errorlevel 1 (
    echo ❌ Git nicht gefunden
    pause
    exit /b 1
)

REM Get current time for default message
for /f "tokens=2-4 delims=/ " %%a in ('date /t') do (set mydate=%%c-%%a-%%b)
for /f "tokens=1-2 delims=/:" %%a in ('time /t') do (set mytime=%%a%%b)

REM Ask for commit message
set "commit_msg="
echo 💬 Kurje Nachricht eingeben (oder ENTER für: Update %mydate% %mytime%):
set /p commit_msg=">> "

if "!commit_msg!"=="" (
    set commit_msg=Update %mydate% %mytime%
)

echo.
echo 📝 git add -A
git add -A

echo 📦 git commit -m "!commit_msg!"
git commit -m "!commit_msg!"

if errorlevel 1 (
    echo.
    echo ❌ Nichts zum Pushen (keine Änderungen)
    pause
    exit /b 0
)

echo 🚀 git push
git push

echo.
echo ✅ Erfolgreich gepusht!
echo.
echo 📱 Online verfügbar: https://captheavenger.github.io/HausiTCG/
echo.
timeout /t 3
