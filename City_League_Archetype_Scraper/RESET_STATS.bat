@echo off
echo ============================================================
echo Reset Statistics - City League Archetype Scraper
echo ============================================================
echo.
echo Diese Datei loescht alle bisherigen Statistiken.
echo Der naechste Scraper-Lauf wird als neuer Ausgangspunkt gesetzt.
echo.
echo Folgende Dateien werden geloescht:
echo   - city_league_archetypes_deck_stats.csv
echo   - city_league_archetypes_comparison.csv
echo   - city_league_archetypes_comparison.html
echo.
pause
echo.
echo Loesche Statistik-Dateien...

del /Q "city_league_archetypes_deck_stats.csv" 2>nul
del /Q "city_league_archetypes_comparison.csv" 2>nul
del /Q "city_league_archetypes_comparison.html" 2>nul

echo.
echo ============================================================
echo Statistiken wurden zurueckgesetzt!
echo ============================================================
echo.
echo Der naechste Scraper-Lauf wird als neuer Ausgangspunkt
echo fuer die Vergleiche verwendet.
echo.
pause
