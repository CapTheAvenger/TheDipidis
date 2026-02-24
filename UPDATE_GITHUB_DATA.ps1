# ========================================
# GitHub Landing-Website Daten-Update
# ========================================
# Dieses Script kopiert aktualisierte CSV-Dateien
# ins GitHub-Repository und pusht die Aenderungen

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  HausiTCG Landing - Data Update  " -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Pfade definieren
$sourceDataDir = "$PSScriptRoot\data"
$targetDir = "C:\Users\haush\Desktop\HausiTCG-Landing"
$targetDataDir = "$targetDir\data"

# Pruefen ob Ziel-Ordner existiert
if (-not (Test-Path $targetDir)) {
    Write-Host "FEHLER: GitHub-Landing Ordner nicht gefunden!" -ForegroundColor Red
    Write-Host "Bitte erst PREPARE_GITHUB_LANDING.ps1 ausfuehren!" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Druecke Enter zum Beenden"
    exit
}

# Pruefen ob Git-Repository
$gitDir = "$targetDir\.git"
if (-not (Test-Path $gitDir)) {
    Write-Host "WARNUNG: Kein Git-Repository gefunden!" -ForegroundColor Yellow
    Write-Host "Moechten Sie trotzdem die Dateien aktualisieren? (j/n)" -ForegroundColor Yellow
    $confirm = Read-Host
    if ($confirm -ne "j") {
        exit
    }
}

# CSV-Dateien kopieren
Write-Host "[1/3] Aktualisierte CSV-Dateien kopieren..." -ForegroundColor Yellow
Write-Host ""

$csvFiles = @(
    "all_cards_database.csv",
    "all_cards_merged.csv",
    "cardmarket_prices.csv",
    "city_league_analysis.csv",
    "city_league_archetypes.csv",
    "city_league_archetypes_comparison.csv",
    "city_league_archetypes_deck_stats.csv",
    "current_meta_card_data.csv",
    "japanese_cards_database.csv",
    "limitless_online_decks.csv",
    "limitless_online_decks_comparison.csv",
    "limitless_online_decks_matchups.csv",
    "price_data.csv",
    "tournament_cards_data_cards.csv",
    "tournament_cards_data_overview.csv"
)

$copiedFiles = 0
foreach ($file in $csvFiles) {
    $sourcePath = "$sourceDataDir\$file"
    $targetPath = "$targetDataDir\$file"
    
    if (Test-Path $sourcePath) {
        Copy-Item $sourcePath $targetPath -Force
        
        # Dateigroesse anzeigen
        $fileSize = (Get-Item $sourcePath).Length
        $fileSizeKB = [math]::Round($fileSize / 1KB, 2)
        
        Write-Host "   OK $file ($fileSizeKB KB)" -ForegroundColor Green
        $copiedFiles++
    } else {
        Write-Host "   WARNUNG: $file nicht gefunden!" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "   $copiedFiles von $($csvFiles.Count) Dateien kopiert" -ForegroundColor Cyan
Write-Host ""

# HTML-Dateien kopieren
Write-Host "[1b/3] HTML-Dateien kopieren..." -ForegroundColor Yellow
Write-Host ""

# CRITICAL: Use landing.html as source and copy to BOTH index.html and landing.html
$sourceHtml = "$PSScriptRoot\landing.html"

if (Test-Path $sourceHtml) {
    $fileSize = (Get-Item $sourceHtml).Length
    $fileSizeKB = [math]::Round($fileSize / 1KB, 2)
    
    # Copy to index.html
    Copy-Item $sourceHtml "$targetDir\index.html" -Force
    Write-Host "   OK index.html ($fileSizeKB KB)" -ForegroundColor Green
    
    # Copy to landing.html
    Copy-Item $sourceHtml "$targetDir\landing.html" -Force
    Write-Host "   OK landing.html ($fileSizeKB KB)" -ForegroundColor Green
    
    Write-Host ""
    Write-Host "   2 von 2 HTML-Dateien kopiert" -ForegroundColor Cyan
} else {
    Write-Host "   FEHLER: landing.html nicht gefunden!" -ForegroundColor Red
    Write-Host "   0 von 2 HTML-Dateien kopiert" -ForegroundColor Red
}
Write-Host ""

# JSON-Dateien kopieren
Write-Host "[1c/3] JSON-Dateien kopieren..." -ForegroundColor Yellow
Write-Host ""

$jsonFiles = @(
    "all_cards_merged.json",
    "all_cards_database.json",
    "japanese_cards_database.json",
    "ace_specs.json",
    "ace_specs_fallback.json"
)

$copiedJson = 0
foreach ($file in $jsonFiles) {
    $sourcePath = "$sourceDataDir\$file"
    $targetPath = "$targetDataDir\$file"
    
    if (Test-Path $sourcePath) {
        Copy-Item $sourcePath $targetPath -Force
        
        # Dateigroesse anzeigen
        $fileSize = (Get-Item $sourcePath).Length
        $fileSizeKB = [math]::Round($fileSize / 1KB, 2)
        
        Write-Host "   OK $file ($fileSizeKB KB)" -ForegroundColor Green
        $copiedJson++
    } else {
        Write-Host "   WARNUNG: $file nicht gefunden!" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "   $copiedJson von $($jsonFiles.Count) JSON-Dateien kopiert" -ForegroundColor Cyan
Write-Host ""

# Git Status pruefen
if (Test-Path $gitDir) {
    Write-Host "[2/3] Git Status pruefen..." -ForegroundColor Yellow
    
    # In Ziel-Ordner wechseln
    Push-Location $targetDir
    
    # Git Status
    $gitStatus = git status --porcelain
    
    if ($gitStatus) {
        Write-Host ""
        Write-Host "   Geaenderte Dateien:" -ForegroundColor White
        git status --short | ForEach-Object { Write-Host "   $_" -ForegroundColor Gray }
        Write-Host ""
        
        # Commit und Push
        Write-Host "[3/3] Git Commit und Push..." -ForegroundColor Yellow
        
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
        $commitMessage = "Update: Data and HTML $timestamp"
        
        git add data/*.csv
        git add data/*.json
        git add data/*.html
        git add *.html
        git commit -m $commitMessage
        
        Write-Host ""
        Write-Host "   Aenderungen werden gepusht..." -ForegroundColor Yellow
        $pushResult = git push 2>&1
        
        Write-Host ""
        Write-Host "=====================================" -ForegroundColor Green
        Write-Host "        Update erfolgreich!        " -ForegroundColor Green
        Write-Host "=====================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "GitHub Pages aktualisiert automatisch in ~1-2 Minuten" -ForegroundColor Cyan
        Write-Host ""
        
    } else {
        Write-Host ""
        Write-Host "   INFO: Keine Aenderungen in den CSV-Dateien" -ForegroundColor Cyan
        Write-Host ""
    }
    
    # Zurueck zum urspruenglichen Ordner
    Pop-Location
    
} else {
    Write-Host "[2/3] Git-Repository nicht vorhanden - Uebersprungen" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "=====================================" -ForegroundColor Yellow
    Write-Host "    Dateien kopiert (ohne Git Push)    " -ForegroundColor Yellow
    Write-Host "=====================================" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Bitte manuell committen und pushen:" -ForegroundColor White
    Write-Host "  cd `"$targetDir`"" -ForegroundColor Cyan
    Write-Host "  git add data/*.csv" -ForegroundColor Cyan
    Write-Host "  git add data/*.json" -ForegroundColor Cyan
    Write-Host "  git commit -m `"Update: CSV data`"" -ForegroundColor Cyan
    Write-Host "  git push" -ForegroundColor Cyan
    Write-Host ""
}

Write-Host "Fertig!" -ForegroundColor Green
Write-Host ""

# Kurze Pause, damit User die Meldung lesen kann
Start-Sleep -Seconds 2
