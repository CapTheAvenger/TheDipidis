# Aktive Utility-Skripte

Stand: 2026-03-31

Dieses Verzeichnis enthaelt manuelle Hilfsskripte, die aktuell nicht
ueber GitHub Actions/Cronjobs automatisch laufen, aber weiterhin als
Wartungs-Utilities nuetzlich sein koennen.

Verbleibende Skripte:
- extract_assets.py
  - Extrahiert bzw. organisiert statische Assets fuer die Nutzung im Projekt.
- generate_pokedex_numbers.py
  - Generiert/aktualisiert Pokedex-Nummern fuer Karten- oder Pokemon-Mappings.
- set_list_scraper.py
  - Erzeugt oder aktualisiert Set-Listen als Datenbasis fuer weitere Prozesse.
- sort_all_cards_merged.py
  - Sortiert die zusammengefuehrten Karten-Daten in all_cards_merged-Dateien.
- sort_cards_database.py
  - Sortiert/normalisiert Kartenbank-Daten fuer konsistente Weiterverarbeitung.

Nutzungshinweise:
- Vor dem Ausfuehren immer Input/Output-Pfade im Skript pruefen.
- Utility-Skripte sind als manuelle Tools gedacht, nicht als dauerhafte Pipeline.
- Wenn ein Skript regelmaessig benoetigt wird, nach backend/ ueberfuehren
  und in Workflow-Dokumentation/GitHub Actions aufnehmen.

Aufraeum-Policy:
- Niemals sofort endgueltig loeschen.
- Zuerst nach _archive/ (oder archive/) verschieben und lokal testen.
- Erst nach bestaetigter Nichtnutzung und erfolgreichem Testlauf endgueltig entfernen.
