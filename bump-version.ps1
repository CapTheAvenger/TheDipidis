# bump-version.ps1 — Updates all ?v= cache-busting timestamps in index.html
# and bumps the service worker cache version before each deploy.
# Usage: .\bump-version.ps1

$ts = Get-Date -Format 'yyyyMMddHHmm'

# Update all ?v=... in index.html
$html = Get-Content index.html -Raw -Encoding UTF8
$html = [regex]::Replace($html, '\?v=\d+', "?v=$ts")
[System.IO.File]::WriteAllText("$PWD\index.html", $html, [System.Text.UTF8Encoding]::new($false))

# Bump service worker cache version
$sw = Get-Content service-worker.js -Raw -Encoding UTF8
$sw = [regex]::Replace($sw, "CACHE_NAME = 'tcg-analysis-v\d+'", "CACHE_NAME = 'tcg-analysis-v$ts'")
[System.IO.File]::WriteAllText("$PWD\service-worker.js", $sw, [System.Text.UTF8Encoding]::new($false))

Write-Host "Cache busted: ?v=$ts / tcg-analysis-v$ts" -ForegroundColor Green
