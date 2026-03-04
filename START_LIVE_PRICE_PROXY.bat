@echo off
echo ============================================================
echo LIVE PRICE PROXY SERVER
echo ============================================================
echo.
echo Starting Flask proxy server for live price fetching...
echo.
echo Server will run on: http://localhost:8001
echo.
echo This allows the website to fetch live prices from:
echo   - Limitless TCG
echo   - Cardmarket
echo.
echo Keep this window open while using the website.
echo Press Ctrl+C to stop the server.
echo.
echo ============================================================
echo.

.venv\Scripts\python.exe price_proxy_server.py

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo FEHLER: Server konnte nicht gestartet werden! Error Code: %ERRORLEVEL%
    echo.
    echo Mogliche Grunde:
    echo   - Python Virtual Environment nicht aktiviert
    echo   - Fehlende Dependencies (flask, flask-cors, beautifulsoup4)
    echo.
    echo Installation: pip install flask flask-cors beautifulsoup4 requests
    echo.
    pause
    exit /b %ERRORLEVEL%
)

pause
