# Abschluss: CL Yokohama Metashare & Mega-Excadrill-Matchup — 26.09.2026

**Kein Website-Thema.** Dieser Chat hat nichts an thedipidis.app gebaut, geändert
oder ausgeliefert — reine Recherche für Hausis persönliche Turniervorbereitung
(Frankfurt-Regional, Mega Excadrill). Kein Zweig, kein PR, keine Backlog-Zeile
aus diesem Grund nötig.

## Was geliefert wurde

- **Top-32-Metashare Champions League 2027 Yokohama** (20.–22.09.2026,
  Master League), aus JP-Quellen zusammengetragen, weil Limitless für dieses
  Turnier noch keine Daten führt (Statistik-Seite leer, geprüft). Quelle:
  pokekameshi.com (spiegelt pokecabook-Ergebnisse; pokecabook selbst blockt
  automatisierten Zugriff komplett). **23 von 32 Plätzen öffentlich bestätigt**,
  Rest fehlt, weil einzelne Spieler ihre Liste nicht gepostet haben.
- Sieger: **クリープ** mit Mega Excadrill ex — einziges Mega-Excadrill-Deck im
  gesamten bestätigten Feld. Deckcode `8JcGcx-DwNzPz-K888Y8`.
- **Matchup-Einordnung Mega Excadrill gegen das JP-Feld**, gebaut aus
  thedipidis.app-eigenen Daten (Ladder-Matchups `limitless_online_decks_matchups.csv`
  plus der aufbereiteten Mega-Stalobor-Masterclass von Tim Danklin): Dragapult
  (Hauptmasse des Feldes) ist das beste MU (51,9 %), Alakazam/Dudunsparce das
  schlechteste (25,0 %), Slowking und Dragapult/Blaziken ebenfalls ungünstig.
  Mehrere JP-Archetypen (Rayquaza, Kangaskhan-Barrett, Kamitsuorochi, Raging
  Bolt, Ohrongue, Fushigibana/Meganium) haben **keine** oder nur eine
  qualitative Entsprechung in unseren Daten — als solches benannt, nicht
  geschätzt.

## Was zugesagt und nicht geliefert wurde

**Kartengenauer Abgleich JP → international** für zwei Decklisten
(Siegerdeck `8JcGcx-DwNzPz-K888Y8` und einen zweiten, von Hausi verlinkten Code
`pMU2Rp-HjDGiV-yy3pM2`, dessen Bezug ungeklärt blieb — evtl. ein anderes
Deck, nicht das Siegerdeck).

**Grund, gemessen:** `pokemon-card.com/deck/result.html` und `/confirm.html`
liefern serverseitig nur ein leeres Grundgerüst; die Kartenliste wird
client-seitig per JavaScript nachgeladen (Ladespinner im Rohcode sichtbar,
kein Listeninhalt). Web-Fetch führt kein JavaScript aus — das gilt für beide
URL-Varianten gleichermaßen, ist also keine Frage der richtigen Adresse.
`pokecabook.com` blockt zusätzlich jeden automatisierten Zugriff (Bot-Erkennung,
mehrfach geprüft). Bilder (das serverseitig gerenderte PNG je Deck) kann das
Fetch-Werkzeug nicht auswerten.

**Nächster Schritt, an Hausi:** Screenshot der Listenansicht (oder das PNG
unter `.../deckView.php/deckID/<code>.png`) hochladen, dann Kartenabgleich
gegen internationale Drucke im nächsten Chat.

## Werkzeuge

Keine gebaut.
