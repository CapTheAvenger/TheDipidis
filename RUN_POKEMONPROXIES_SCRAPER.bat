@echo off
echo ========================================
echo PokemonProxies M3 Scraper
echo ========================================
echo.

REM Activate virtual environment
call .venv\Scripts\activate.bat

REM Run scraper
python pokemonproxies_scraper.py

echo.
echo ========================================
echo Press any key to exit...
pause
