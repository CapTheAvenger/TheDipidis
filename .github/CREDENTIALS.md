# 🔐 GitHub Secrets - Konfiguration

Falls die Scraper API-Tokens oder Credentials benötigen, müssen diese in **GitHub Secrets** (nicht im Code) gespeichert werden.

## ⚠️ NICHT hochladen:
- ❌ `github_token.txt` (private Token!)
- ❌ Passwörter, API-Keys, Secrets
- ❌ Private Konfigurationen

## ✅ GitHub Secrets einrichten:

1. Gehe zu: https://github.com/captheavenger/HausiTCG/settings/secrets/actions
2. Klick "New repository secret"
3. Füge folgende Secrets hinzu (falls benötigt):

| Secret Name | Wert | Quelle |
|------------|------|--------|
| `GITHUB_TOKEN` | Bereits auto-verfügbar | GitHub (auto) |
| `CUSTOM_API_TOKEN` | Token aus pokemon-tcg.io | Falls nötig |

## 📝 Secrets in GitHub Actions verwenden:

Beispiel in `.github/workflows/daily-scrape.yml`:

```yaml
- name: Run Scraper
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: python unified_card_scraper.py
```

## ✅ Status:
- ✓ `.gitignore` verhindert Upload von `github_token.txt`
- ✓ Alle Settings sind öffentlich (keine Secrets enthalten)
- ✓ Scraper laufen ohne API-Keys (nutzen Browser-Automation)
