@echo off
cd /d "%~dp0"
python "..\source\upload_to_gist.py" "city_league_archetypes_comparison.html"
pause
