# Block 3 — teilbare Bilder, Deckansicht, Platzierung

Sechs Commits auf `main` (Stand `b64d40e2`, 18.08.2026 08:10 UTC).
Nichts davon ist gepusht.

## Anwenden

```bash
bash merge-block3.sh /pfad/zu/TheDipidis
```

Legt `block3-share` an, wendet die sechs Patches der Reihe nach an,
fährt beide Testläufe und prüft den `!important`-Zähler. Pusht nichts.
Bei einem Konflikt bricht es ab — **nicht** mit `-3`, `--skip` oder
einem Squash weitermachen, sondern nachfragen: die Reihenfolge der
Commits trägt die Begründung.

Alternativ:

```bash
git fetch /pfad/zu/block3.bundle share-block3:block3-share
```

## Die sechs Commits

| # | Commit | Kern |
|---|--------|------|
| 1 | `tokens: die drei Datenraum-Farben gab es nie` | `--space-jp/-gl/-past` wurden benutzt, waren aber nie definiert |
| 2 | `share: zwei Bilder, mit denen man angeben kann` | Deck-Analyse 1200 × 675, Turnierergebnis 1080 × 1080 |
| 3 | `decklist: das Anteilsband immer, und die Ampel raus` | Kartengitter nach poke_hive-Vorbild, Ampelfarben raus |
| 4 | `city league: jeder Sprachwechsel warf einen Fehler` | `TypeError` bei jedem Sprachwechsel während der Saisonpause |
| 5 | `journal: eine Platzierung, sonst ist das Bild nur eine Bilanz` | Platzierungsfeld je Turnier |
| 6 | `redesign: erledigt und offen trennen` | Ordnerstruktur im Repo |

### 1 · Die drei Datenraum-Farben

`css/ds-nav.css` benutzt `--space-jp`, `--space-gl` und `--space-past`
seit dem 17.08. Definiert war keine der drei. Eine undefinierte
Variable wirft nichts — die Deklaration fällt still aus:
`border-left-color` auf `currentColor`, `color` auf `inherit`.

Sichtbar als zwei Fehler, die man einzeln nicht erkennt: der Ausweis
über Japan und der über Past trugen denselben grauen Streifen, und der
Champions-Knopf verlor im aktiven Zustand seine zweite Signalfarbe.
Beides sah nach Absicht aus.

Bernstein für Japan: die Farbe ist redundant codiert (daneben stehen
immer Flagge und Wort), darf also warm sein, ohne in die divergierende
Skala zu greifen. Bernstein gegen Blau bleibt auf der Blau-Gelb-Achse
und ist auch bei Rot-Grün-Schwäche eindeutig.

Dazu `formatFor()` / `stampFor()` als Helfer, weil `DsNav.getFacts()`
dieselben Werte für den Fuß der Bildkarte braucht.

### 2 · Die zwei Bilder

Neu: `js/ds-share.js`, `css/ds-share.css`, `tests/unit/test-ds-share.js`.

**Deck-Analyse 1200 × 675** — Knopf „▧ Bild" im Kopf der
Archetyp-Karte. Nach poke_hives Vorlage, mit drei Korrekturen:

* Die Skala ist blau↔rot statt grün↔rot. `css/tokens.css` hat das
  längst entschieden und nennt poke_hive dort ausdrücklich als Vorbild
  mit genau dieser Schwäche.
* Jede Matchup-Zeile trägt Partienzahl und Bilanz. Von Trainer Hill:
  68 % über 9 Partien und 68 % über 238 sind nicht dasselbe Argument.
* Beste **und** schlechteste Matchups mit benannter Auslassung. Nur die
  Oberseite einer sortierten Liste zu zeigen ist Werbung.

Im Fuß steht der Datenraum — das Bild verlässt die Seite.

**Turnierergebnis 1080 × 1080** — Knopf „◧ 1:1" im Turnierkopf des
Battle Journals, neben `Share` und `Share+`. Platzierung, Bilanz, Deck,
Runde für Runde mit Zugreihenfolge. Kein Platz für ein Foto der Person.

Beide malen auf `<canvas>`: keine neue Abhängigkeit, und ein Bild, das
exakt 1080 × 1080 misst, ist auf Instagram vorhersagbar. Externe Bilder
laufen über denselben weserv-Proxy mit 10-s-Grenze wie
`_buildDeckCanvas()`; fehlt ein Sprite, steht dort das Kürzel in einer
getönten Zelle — nie ein kaputtes Bildsymbol.

Die Palette in `ds-share.js` ist eine Kopie der Dunkelmodus-Werte aus
`tokens.css` (ein Canvas kann keine CSS-Variablen auflösen).
`test-ds-share.js` vergleicht sie Zeile für Zeile.

`app-archetype-card.js` gibt seine Zahlen jetzt ohne HTML heraus:
`window.getArchetypeFacts(name)`, `window.getArchetypeMatchups(name)`.
Sonst müsste `ds-share.js` beide CSVs ein zweites Mal lesen und die
Glättung nachbauen — zwei Quellen für dieselbe Zahl.

### 3 · Die Deckansicht

Der Renderer bleibt, wie er ist — 300 Zeilen mit Preisen, Pins,
Sammlungsabgleich und Druckvarianten. Vier Korrekturen:

1. Das Anteilsband läuft **immer**, nicht nur im Skelettmodus. In der
   Standardansicht war es abgeschaltet — und es ist die einzige
   Angabe, die ein Kartengitter lesbar macht.
2. Seine Farbe kommt aus Tokens statt aus einer Ampel im
   `style`-Attribut jeder Karte (`#27ae60` / `#f39c12` / `#7f8c8d`).
   Gold = Kernkarte, Marke = Option, Grau = situativ. Prozent im `title`.
3. Die beiden Plaketten waren ein grüner und ein roter Kreis, gleich
   groß, gleich rund — bei der häufigsten Farbsehschwäche also gar
   nicht unterscheidbar, obwohl sie völlig Verschiedenes bedeuten.
   Jetzt: Sechseck für „so viele spielt das Feld", eckige Marke für
   „so viele hast du im Deck".
4. Emoji-Ampel 🟢🟡⚪ in den Abschnittsüberschriften raus, beide
   Sprachen in `i18n.js`.

Nebenbei drei `!important` weniger.

### 4 · Der Sprachwechsel-Fehler

`populateCityLeagueDeckSelect(data, comparisonData)` wird vom
`languageChanged`-Handler ohne Argumente gerufen. Solange die City
League Daten hat, fängt `window.cityLeagueArchetypesData` das ab.
Während der Saisonpause ist die Liste leer, `sourceRows` wurde
`undefined`, und jeder Sprachwechsel warf

```
TypeError: Cannot read properties of undefined (reading 'forEach')
```

Der Handler bricht dort ab — alles darunter bleibt in der alten
Sprache stehen. Die City League ist seit dem 31.07. leer, das trifft
also gerade jeden. Gefunden beim Verifizieren, nicht gesucht.

### 5 · Die Platzierung

Feld im „Turnier bearbeiten"-Dialog. Freitext mit Vorschlägen
(1. / 2. / 3. / Top 4 / Top 8 / Top 16 / Top 32 / Day 2), 16 Zeichen —
kein Zahlenfeld, weil „9/128" und „Day 2" auch Platzierungen sind.

Drei Feinheiten: geschrieben wird auf alle drei Speicher (Outbox,
Firestore-Batch, Cache); anders als das Deckfeld wird sie **immer**
geschrieben, auch leer, sonst bekäme man sie nie wieder weg; gelesen
wird sie aus der ganzen Gruppe, nicht aus dem ersten Eintrag.

Im Turnierkopf erscheint sie als goldumrandete Marke neben der Bilanz.
Nur wenn sie eingetragen wurde — geraten wird sie nicht.

Der neue Test „jeder Textschlüssel steht in beiden Sprachen" hat dabei
eine Schlüsselkollision gefunden: `cl.usageShare` gab es schon
(„Nutzungsanteil:"), und ein zweiter Eintrag desselben Namens hätte den
ersten still überschrieben. Der neue heißt `cl.usageBarTitle`.

### 6 · Die Ordnerstruktur

`redesign/` lag flach im Wurzelverzeichnis: neun Patches, die längst
auf `main` sind, daneben Bundle, Merge-Skript und zwei Prototypen —
nichts davon sagt, was noch zu tun ist.

```
redesign/
├── README.md                    Wegweiser und Stand
├── erledigt/etappe-0-2/         die neun gemergten Commits (PR #452)
├── prototypen/                  die beiden Klickmuster
└── offen/block3/                was noch nicht auf main ist
```

`redesign/UMBAU-HANDBUCH.md` fällt weg — dieselbe Datei liegt seit
Commit 9 der Etappe als `docs/UMBAU-HANDBUCH.md` im Repo, und die ist
die, die Claude Code findet.

Auf der Seite ändert das nichts: `thedipidis.app/redesign/` gibt 404.

## Geprüft

* Frischer Klon auf `b64d40e2`, `merge-block3.sh` durchgelaufen.
* JS **1054 passed, 0 failed** (43 davon neu).
* Python **373 passed, 5 skipped**.
* `!important` **3402 → 3399**.
* Playwright 1440 × 900 und 390 × 844: Deck-Analyse (Global) mit
  Dragapult — 37 Karten, 37 Anteilsbänder, Füllfarbe `rgb(255,203,5)`
  = `--gold`, Plakette 28 × 32 bzw. 22 × 22 mit Sechseck-Clip, keine
  Inline-Farbe. Journal: Turnier mit drei Partien angelegt, „Top 8"
  gespeichert, Feld auf allen drei Einträgen, Marke im Kopf mit
  `rgb(255,203,5)`, Bildkarte zeigt die Platzierung.
* Keine Konsolenfehler mehr (siehe Commit 4).

## Nicht enthalten

* Block 4: Designsystem über die 16 Ansichten, Tutorial-Auslagerung,
  Kartenlegende, mobile Heatmap, Meta-Call-Entkopplung, die
  Zusammenlegungen. Steht in `docs/UMBAU-HANDBUCH.md`.
* `pytest` verändert weiterhin `data/card_text_resolution.csv`.
