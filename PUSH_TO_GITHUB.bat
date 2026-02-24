@echo off
REM ========================================
REM GitHub Push - Alle wichtigen Dateien
REM ========================================
REM Pusht alle wichtigen Daten zu GitHub
REM Repository: https://github.com/CapTheAvenger/HausiTCG-Landing

echo =====================================
echo   HausiTCG - GitHub Push
echo =====================================
echo.

REM PowerShell-Script ausfuehren
powershell -ExecutionPolicy Bypass -File "%~dp0UPDATE_GITHUB_DATA.ps1"

echo.
echo Fertig!
pause
