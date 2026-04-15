# bump-version.ps1 — Updates all ?v= cache-busting timestamps in index.html,
# bumps the service worker cache version, updates version.json, and the
# embedded APP_VERSION constant before each deploy.
# Usage: .\bump-version.ps1

$ts = Get-Date -Format 'yyyyMMddHHmm'

# 1) Update all ?v=... in index.html
$html = Get-Content index.html -Raw -Encoding UTF8
$html = [regex]::Replace($html, '\?v=\d+', "?v=$ts")

# 2) Update embedded APP_VERSION in index.html
$html = [regex]::Replace($html, "window\.APP_VERSION\s*=\s*'[^']+'", "window.APP_VERSION = '$ts'")
[System.IO.File]::WriteAllText("$PWD\index.html", $html, [System.Text.UTF8Encoding]::new($false))

# 3) Bump service worker cache version + comment
$sw = Get-Content service-worker.js -Raw -Encoding UTF8
$sw = [regex]::Replace($sw, '// v\d+', "// v$ts")
$sw = [regex]::Replace($sw, "CACHE_NAME = 'tcg-analysis-v\d+'", "CACHE_NAME = 'tcg-analysis-v$ts'")
[System.IO.File]::WriteAllText("$PWD\service-worker.js", $sw, [System.Text.UTF8Encoding]::new($false))

# 4) Write version.json (network-only freshness check)
[System.IO.File]::WriteAllText("$PWD\version.json", "{`"version`":`"$ts`"}", [System.Text.UTF8Encoding]::new($false))

Write-Host "Version bumped: $ts" -ForegroundColor Green
Write-Host "  index.html   ?v=$ts + APP_VERSION" -ForegroundColor Cyan
Write-Host "  service-worker.js  CACHE_NAME = tcg-analysis-v$ts" -ForegroundColor Cyan
Write-Host "  version.json       $ts" -ForegroundColor Cyan
