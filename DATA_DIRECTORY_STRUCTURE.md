# Data Directory - Aktuelle Struktur

Stand: Maerz 2026

## Ziel

Alle von den Scrapern erzeugten Daten liegen zentral im Ordner data/.
Es gibt in diesem Repository keine aktive dist/-basierte EXE-Datenstruktur.

## Grundprinzip

- Scraper schreiben ihre Ausgaben nach data/
- Frontend-Komponenten lesen Daten aus data/
- Es gibt nur einen produktiven Datenpfad im Repository

## Typische Inhalte in data/

- Karten-Datenbanken
	- all_cards_database.csv
	- all_cards_database.json
	- japanese_cards_database.csv
	- japanese_cards_database.json

- Aggregierte/aufbereitete Datensaetze
	- all_cards_merged.csv
	- all_cards_merged.json
	- price_data.csv

- Metadaten und Mapping-Dateien
	- sets.json
	- ace_specs.json
	- ace_specs_fallback.json
	- pokemon_dex_numbers.json

- Weitere Analyse-Outputs je nach ausgefuehrtem Scraper
	- city_league_*.csv
	- current_meta_*.csv
	- tournament_*.csv

## Betriebshinweise

1. Scraper aus dem Projekt-Root starten.
2. Nach strukturellen Updates optional prepare_card_data.py laufen lassen.
3. Fuer Frontend-Tests den lokalen HTTP-Server auf data/ oder Root verwenden.

## Git-Hinweise

- Welche Daten versioniert werden, wird ueber .gitignore gesteuert.
- Wenn neue Data-Artefakte relevant sind, muessen sie entweder:
	- nicht ignoriert sein, oder
	- gezielt per Ausnahme in .gitignore erlaubt werden.

## Pflege

Wenn neue dauerhafte Dateien in data/ hinzukommen oder entfallen,
dieses Dokument und ggf. .gitignore direkt mit aktualisieren.
