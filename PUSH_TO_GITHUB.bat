@echo off
REM ========================================
REM GitHub Push - Alle wichtigen Dateien
REM ========================================
REM Pusht alle wichtigen Daten zu GitHub
REM Repository: https://github.com/CapTheAvenger/HausiTCG.git

echo =====================================
echo   HausiTCG - GitHub Push
echo =====================================
echo.

echo [1/4] Git Status pruefen...
git status
echo.

echo [2/4] Alle wichtigen Dateien zum Commit hinzufuegen...
echo.

REM Python Scripts
git add *.py

REM HTML und Config Files
git add index.html
git add *.json
git add *.csv

REM BAT Scripts
git add *.bat

REM Markdown Documentation
git add *.md

REM Data Ordner - nur wichtige Dateien
git add data/all_cards_database.csv
git add data/all_cards_database.json
git add data/all_cards_merged.csv
git add data/all_cards_merged.json
git add data/japanese_cards_database.json
git add data/city_league_analysis.csv
git add data/city_league_analysis_scraped.json
git add data/city_league_archetypes.csv
git add data/city_league_archetypes_comparison.csv
git add data/city_league_archetypes_comparison.html
git add data/city_league_archetypes_comparison_local.html
git add data/city_league_archetypes_deck_stats.csv
git add data/current_meta_card_data.csv
git add data/current_meta_scraped_tournaments.json
git add data/limitless_online_decks.csv
git add data/limitless_online_decks.html
git add data/limitless_online_decks_comparison.csv
git add data/limitless_online_decks_comparison.html
git add data/limitless_online_decks_comparison_local.html
git add data/limitless_online_decks_matchups.csv
git add data/limitless_meta_stats.json
git add data/pokemon_sets_list.csv
git add data/all_cards_scraped_pages.json

REM Tournament Data (wenn vorhanden)
if exist data\tournament_cards_data_cards.csv git add data/tournament_cards_data_cards.csv
if exist data\tournament_cards_data_overview.csv git add data/tournament_cards_data_overview.csv
if exist data\tournament_jh_scraped.json git add data/tournament_jh_scraped.json

REM Scraper Logs
if exist scraper_log.txt git add scraper_log.txt

echo Dateien hinzugefuegt!
echo.

echo [3/4] Commit erstellen...
set /p commit_msg="Commit Message (oder Enter fuer Standard-Message): "

if "%commit_msg%"=="" (
    set commit_msg=Update: Data and code changes %date% %time%
)

git commit -m "%commit_msg%"
echo.

echo [4/4] Push zu GitHub...
echo.
echo Pushe zu HausiTCG (origin)...
git push origin main
echo.
echo Pushe zu TheDipidis (dipidis - LIVE SITE)...
git push dipidis main
echo.

echo =====================================
echo   Push erfolgreich!
echo =====================================
echo.
echo Repository 1: https://github.com/CapTheAvenger/HausiTCG.git
echo Repository 2: https://github.com/CapTheAvenger/TheDipidis.git (LIVE)
echo Live-Seite:   https://captheavenger.github.io/TheDipidis/
echo.

pause
