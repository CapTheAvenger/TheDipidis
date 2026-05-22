# Archived Utility Scripts

Stand: 2026-03-31

Dieses Verzeichnis enthaelt historische Einmal-Fix- und Regenerationsskripte,
die aktuell von keinem GitHub-Workflow, Cronjob oder anderen Python-Skript
automatisch aufgerufen werden.

Archivierte Skripte:
- find_qs.py
- fix_all_cards_database.py
- fix_city_league_duplicates.py
- fix_missing_urls.py
- fix_switch_ace_spec.py
- patch_consistency.py
- recreate_csv.py
- regenerate_city_league_aggregation.py
- regenerate_city_league_comparison.py
- regenerate_city_league_stats.py

Hinweis:
- Bei Wiederverwendung zuerst Pfade und erwartete Input-Dateien pruefen.
- Fuer produktive oder wiederkehrende Jobs bitte in backend/ oder utils/
  ueberfuehren und in die Dokumentation/Automation aufnehmen.

Wichtiger Tipp beim Loeschen:
- Nicht sofort hart loeschen (z. B. Shift+Delete), sondern zuerst nur archivieren.
- Danach Tests ausfuehren oder Seite lokal starten und auf Fehler pruefen.
- False-Positives sind moeglich, wenn Dateipfade dynamisch zusammengesetzt werden.