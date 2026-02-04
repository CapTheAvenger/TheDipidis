@echo off
echo ============================================================
echo Reset Statistics - Limitless Online Scraper
echo ============================================================
echo.
echo Diese Datei loescht alle bisherigen Statistiken.
echo Der naechste Scraper-Lauf wird als neuer Ausgangspunkt gesetzt.
echo.
echo Folgende Dateien werden geloescht:
echo   - limitless_online_decks.csv (alte Daten)
echo   - limitless_online_decks_comparison.csv
echo   - limitless_online_decks_comparison.html
echo.
pause
echo.
echo Loesche Statistik-Dateien...

del /Q "limitless_online_decks.csv" 2>nul
del /Q "limitless_online_decks_comparison.csv" 2>nul
del /Q "limitless_online_decks_comparison.html" 2>nul

echo.
echo ============================================================
echo Statistiken wurden zurueckgesetzt!
echo ============================================================
echo.
echo Der naechste Scraper-Lauf wird als neuer Ausgangspunkt
echo fuer die Vergleiche verwendet.
echo.
pause
