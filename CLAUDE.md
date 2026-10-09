# TheDipidis — working rules

## Default process for every feature

**Run `/feature-review` before building any user-facing feature or change**, and
`/data-review` before trusting any data-pipeline change. This is the default, not
the exception — the extra round trip is cheaper than shipping the wrong thing and
rebuilding it, which is exactly what happened with the Prize Pack print.

Skip it only for genuinely trivial edits (a typo, a colour value), and say so.


German-language Pokémon TCG SPA (vanilla JS, GitHub Pages, deploys from `main`)
plus a Telegram bot on Render. These are the rules this project learned the hard
way; each one exists because breaking it cost real time.

## Shipping frontend changes

1. **Any change to `js/`, `css/` or `index.html` needs `./bump-version.sh`.**
   All 74 assets are cache-busted via `?v=<timestamp>`; without a bump the
   service worker keeps serving the old file and the change is invisible. "The
   user can't see my fix" has almost always been a missing bump.
2. **Ship one commit, then wait.** Pages deploys are serialised — rapid
   consecutive pushes cancel each other's deploys and the site can sit on an
   older build for 15+ minutes.
3. **A change is not "live" until `thedipidis.app/version.json` shows the new
   timestamp.** Verify that before telling the user it's done. Code merged to
   `main` ≠ deployed.
4. Tell the user to hard-refresh (`Strg`+`Umschalt`+`R`) for JS/CSS changes;
   pure data files (`data/*.json`) are fetched fresh and need no bump.
   **Exception — `data/archetype_icons.json` DOES need a bump.**
   `js/archetype-icons.js` fetches it at `?v=<the script's own version
   token>` (deliberately, so the JSON stays tied to the deploy that
   shipped the script). Without a bump the URL is unchanged and a
   returning visitor keeps the cached old JSON — the data edit ships to
   `main`, passes CI, and reaches nobody. Found 31.08.2026 while fixing
   ten broken icon slugs; grep for `CACHE_TOKEN` before assuming any
   other data file is bump-free.
5. **If `git push` is blocked, ship onto a branch and merge — never a series
   of commits straight to `main`.** Some sessions cannot push (the git proxy
   answers 403 for this repo) and have to use the GitHub web upload UI, which
   commits **one directory at a time**. Code and its tests live in different
   directories, so every intermediate commit is an inconsistent tree: CI goes
   red, the deploy job is skipped, and the owner gets a failure mail per
   commit. Measured 20.08.2026: six red runs for two green deploys, all
   self-inflicted (`test-design-tokens.js` failing on the commit that carried
   the CSS but not yet the updated test).
   The fix costs nothing: on the first upload pick *"Create a new branch for
   this commit and start a pull request"*, then upload the remaining
   directories to `.../upload/<branch>/<dir>`, then merge. `main` sees one
   commit and one CI run.
   **Kein PAT.** Frueher stand hier, ein Token mit Schreibrecht sei die
   saubere Alternative. Das ist falsch und wurde am 21.08.2026 gemessen:
   der Proxy blockt **repo-basiert**, nicht credential-basiert — ein
   Token aendert nichts. Siehe „Der Schreibweg — und die Sackgassen".

## Meldungstexte sind verdrahtet — ueber Sprachgrenzen hinweg

Mehrere Tests pruefen den **Wortlaut** von Meldungen in
`scripts/data_guardian.py`, und einige davon sind **JS-Tests**
(`tests/unit/test-scraper-selbstkontrolle.js` liest die Python-Datei als
Text). Wer eine Waechtermeldung umformuliert, muss deshalb **beide** Suiten
fahren — `python3 -m pytest tests/python -q` UND
`bash scripts/run-js-unit-tests.sh`.

Gekostet hat mich das am 03.09.2026 einen roten Deploy: PR #634 aenderte nur
Python, die Python-Suite war gruen (1070), und der `test`-Job im
Deploy-Workflow fiel auf einer JS-Zusicherung um. `build` und `deploy` werden
dann uebersprungen — die Seite haengt auf dem alten Stand, ohne dass etwas
"kaputt" aussieht.

## Auch DOKUMENTE sind verdrahtet, nicht nur Meldungstexte

Am 03.09.2026 habe ich einen roten Deploy ausgeloest, indem ich
`docs/geparkte-features.md` NACH dem letzten Suitenlauf ergaenzt und dann
ausgeliefert habe. `tests/unit/test-aufraeumen-startseite.js` liest diese
Datei und verlangt von JEDEM `###`-Eintrag zwei Dinge: einen Abschnitt
"Warum weg" und einen Satz dazu, was an einer Rueckkehr anders sein
muesste. Meine neuen Abschnitte hatten beides nicht.

Folge: `test` rot, `build` und `deploy` uebersprungen, `main` haengt
16 Minuten auf dem alten Stand — und es sieht nichts kaputt aus. Behoben
hat es zufaellig der naechste PR, nicht ich.

**Die Regel ist nicht "Markdown ist harmlos", sondern: was ein Test
liest, ist Code.** Vor dem Ausliefern gilt deshalb dieselbe Reihenfolge
wie bei Quelltext — erst aendern, DANN die Suiten fahren, dann hochladen.
Ein Suitenlauf, der vor der letzten Aenderung liegt, zaehlt nicht.

Bekannte Dateien dieser Art, Stand 03.09.2026:

| Datei | wird gelesen von |
| --- | --- |
| `docs/geparkte-features.md` | `tests/unit/test-aufraeumen-startseite.js` |
| `scripts/data_guardian.py` | `tests/unit/test-scraper-selbstkontrolle.js` |
| `scripts/datenluecken.py` | `tests/python/test_deutsche_namen_sichtbar.py` |
| `js/app-meta-call.js` (Kommentare!) | `tests/unit/test-stufen-inventur.js` |
| `data/champions_namen_entschieden.json` (`_meta`-Bilanz) | zwei Python-Suiten |
| `tutorial/tutorial.*.html` | `test-tutorial.js` und vier weitere |
| `images/tutorials/**` | `test-tutorial.js` (Datei muss existieren) |

Die Liste ist nicht vollstaendig — `docs/geparkte-features.md` allein wird
von ueber zehn Testdateien gelesen. `grep -rl "<dateiname>" tests/` vor
dem Aendern kostet zwei Sekunden.

## Ein Arbeitsablauf, der Dateien holt, gehoert auf den ZWEIG

Am 12.09.2026 stand die Deploy-Kette von `main` fuenf Stunden, weil der
naechtliche `Champions Usage Refresh` fuenf Arten ergaenzt hatte und elf
Zusicherungen jede Abweichung verboten — auch Zuwachs. Drei davon
brauchten Bilddateien, die **nur CI holen kann** (die Sandkiste kommt an
pokewiki.de nicht heran, der Proxy antwortet 403 auf CONNECT).

Der Reflex ist, den PR zu mergen und den Spiegellauf danach auf `main` zu
starten. Das haelt die Kette weiter rot, bis der Lauf durch ist.

**Richtig ist: den Arbeitsablauf per `workflow_dispatch` auf dem ZWEIG
starten.** Er schiebt seinen Commit dorthin, der PR wird gruen, und `main`
sieht nur den fertigen Zustand. `champions-sprites.yml` kann das — im
Dialog „Run workflow" den Zweig waehlen (das versteckte Feld `branch` im
Formular traegt ihn).

Ebenso beim Lockern eines Waechters: die Frage ist nie „jede Abweichung
verbieten", sondern **welche Richtung ein Fehler ist**. Bei den
Kaderlisten heisst das „neu ist erlaubt, verloren nicht" — ein Verlust
bleibt rot, Zuwachs nicht.

## WER NACH MAIN SCHREIBT, PRUEFT VORHER — UND DER KERN HAENGT NICHT AN DEN NEBENBEREICHEN

Wochenlauf #168 (29.09.2026) blieb am Tor haengen: 13 Zusicherungen rot,
kein einziger Datenfehler der Quelle. Die Ursachen, alle behoben:

| rot | Ursache |
| --- | --- |
| Tag-2-Grundgesamtheit (0073/0074) | der Wochenlauf vom 26.09. holte die Standings zweier Regionals WAEHREND sie liefen; `--resume` hielt die Momentaufnahme fuer fertig. Jetzt: ohne Top-Cut kein fertiges Turnier |
| Top-Cut-Quote 0.0 ohne Platzierungen | der Rueckweg nach `data/` lief HINTER den Nachbearbeitungen und kopierte sie zu. Jetzt: erst alles zurueck, dann nachbearbeiten |
| Masterclass (7x) | erstes Major im neuen Format; der Erzeuger verlangte genau ein Format. Jetzt: die Majors-Spalte nimmt das juengste und benennt sich um |
| Cardbinder | Basis-Energie aus einem Druck ohne Kartentyp |
| Bild-Deckel 679 > 663 | Bild ueber den NAMEN fuer einen unbekannten Druck |

Drei Regeln sind daraus geworden:

1. **Jeder Ablauf, der nach `main` schreibt — geplant oder von Hand —,
   faehrt vorher `bash scripts/tor_vor_dem_push.sh kern`**
   (Champions/Pocket: `alle`). Ist etwas rot, wird nicht gepusht. Vorher
   schrieben zehn Ablaeufe ungeprueft — und ein roter Tagesstand hielt den
   Deploy UND das Tor des naechsten Wochenlaufs an. Seit 30.09.2026 gilt
   das auch fuer die sieben Handlaeufe. `tests/python/test_nebenbereiche_getrennt.py`
   haelt jeden neuen Schreiber fest.
   **Rote Datei zurueckrollen (07.10.2026, `scripts/tor_rollback.py`):**
   ist das Tor rot, sucht es die geaenderten Dateien unter `data/`, die die
   roten Zusicherungen brechen (alle zurueck → gruen? dann Datei fuer Datei
   die unschuldigen wieder frisch), laesst nur diese auf dem Stand von
   gestern und prueft ALLE Suiten noch einmal. Gruen: der Rest wird gepusht,
   die Zusammenfassung und `::warning::` nennen die Dateien. Nicht heilbar
   (Code-Fehler, Absturz beim Einsammeln, auch mit allen Dateien rot):
   zu wie bisher. `TOR_OHNE_ROLLBACK=1` schaltet ab. Grund: fuenf von sieben
   roten Planlaeufen seit 25.09. waren eine datenabhaengige Zusicherung.
   Die rollende Datei ist einen Lauf veraltet — die Ursache trotzdem
   beheben, sonst bleibt sie es. Gehalten von
   `tests/python/test_tor_rollt_rote_datei_zurueck.py`.
   **Zusammengehoerige Dateien (SC-29, 09.10.2026):** die erste Feldprobe
   rollte `champions_usage.json` zurueck und liess den daraus gebauten
   Pokedex frisch — der zweite Durchlauf fiel an „Anteil 58.1 statt 74.4"
   und „datenluecken.json ist veraltet" um, das Tor blieb zu (Usage #114,
   Replica #150). Zwei Sicherungen, aus zwei Chats am selben Vormittag:
   `FAMILIEN` (alle `data/champions_*` + `opgg_champions_moves.json` rollen
   nur gemeinsam, PR #955) und das Orakel aus Konsistenztests (jede
   Testdatei, die ZWEI der geaenderten Dateien nennt; was schon mit allem
   auf alt rot ist, ist Altbefund; PR #956) — die Familie faengt Tests, die
   ihre Dateien nicht beim Namen nennen, das Orakel faengt Kopplungen
   ausserhalb der Familie. `data/datenluecken.json` wird nach jedem
   Umschalten neu erzeugt; die Zusammenfassung nennt, was im ERSTEN
   Durchlauf rot war. Jeder Tor-Schritt heisst `id: tor`, schreibt
   `rollback=` nach GITHUB_OUTPUT und sichert `$RUNNER_TEMP/tor` (erstlauf/,
   rollback/neu/) als Artefakt `tor-<run_id>`, sobald das Tor rot war oder
   etwas zurueckgerollt hat. Jeder Job jeder Ablaufdatei traegt
   `timeout-minutes` (SC-28: `sprachreinheit` und `visual-nonmeta` hingen
   1,5 h ohne Grenze). Gehalten von `test_tor_rollt_rote_datei_zurueck.py`
   (8x sc29) und `test_nebenbereiche_getrennt.py` (Zeitgrenze, Sicherung).
   **Victory-Road-Scraper (07.10.2026):** eine umgebaute oder leere Quelle
   macht den Wochenlauf NICHT mehr rot, wenn ein Bestand da ist: der
   Scraper behaelt ihn, schreibt `_meta.quellenhinweis` mit Datum (der
   Stempel `erzeugt_am` bleibt, die Frischepruefung sieht die Alterung)
   und meldet `::warning::`. Rot bleibt nur ein Lauf ohne Bestand. Ladder-
   Saisons („Season M-6") sind keine Turniere. Gehalten von
   `tests/nebenbereiche/python/test_victory_road_verlaesslich.py`.
2. **Champions-, Pocket- und Side-Quest-Tests liegen unter
   `tests/nebenbereiche/{unit,python}`** (Entscheidung Hausi, 29.09.2026)
   und laufen in `nebenbereiche-tests.yml`, nicht im Tor und nicht im
   Deploy-Test. Lokal: `bash scripts/run-js-unit-tests.sh
   tests/nebenbereiche/unit` und `python3 -m pytest
   tests/nebenbereiche/python`. Eine neue Testdatei fuer diese Bereiche
   gehoert dorthin — `tests/unit` und `tests/python` sind der TCG-Kern.
3. **Gepusht wird ueber `bash scripts/push_nach_rebase.sh <kern|alle>`,
   nie ueber eine eigene Schleife** (30.09.2026). Pocket #11 war gruen,
   meldete `pushed=true` und stiess einen Deploy an — die Daten kamen nie
   auf main: `git pull --rebase ... && break` liess einen Konflikt auf
   `data_stand.json` stehen, und `git push origin HEAD:main` schob danach
   den Stand von origin/main. Neun weitere Ablaeufe verloren im Konflikt
   gegen main (`-X ours` heisst beim Rebase „main gewinnt"). Das Skript:
   `-X theirs`, Datenstand neu gebaut, leerer Push = `pushed=false`, Tor
   nach dem Rebase. Ausgefuehrt geprueft in `tests/python/test_push_nach_rebase.py`,
   das auch jede neue eigene Schleife abweist. Ausnahmen: der Wochenlauf
   (eigene, gepruefte Schleife) und `scripts/daten_pushen.sh` (drei Ablaeufe).

Und: der Wochenlauf laeuft Dienstag und Freitag um 06:00 UTC — Freitag
frueh laufen in Australien und Asien Majors. Ein Scraper, der Turniere
holt, muss ein LAUFENDES Turnier erkennen koennen.

## EIN NEUES SET BRAUCHT KEINEN HANDGRIFF (29.09.2026, SC-7)

Beim Wechsel auf 30C (16.09.2026) stand die Deploy-Kette drei Tage, bis
Rueckfalltabellen, Set-Kuerzel und ein Waechterschluessel von Hand
nachgezogen waren (Commit 6ffcd00) — und drei Wochen spaeter haette die
Gnadenfrist der Bestandsbelege noch einmal Handarbeit verlangt.
Entscheidung Hausi: auf Dauer nichts mehr manuell.

Was bei einem Set wechselt, kommt jetzt aus den DATEN:

| Stelle | liest jetzt |
| --- | --- |
| Rueckfall in `update_sets.py` | Grundstock + `format_window.json`/`sets.json` (`rueckfall_*`) |
| `stripExSuffix`, `normalizeArchetypeForMatch` | feste Liste + `window._formatWindow` |
| `CONSUMERS` in `data_guardian.py` | Schluessel aus `format_window.json` |
| `formatfenster()` im Limitless-Scraper | + `previous_format_key` und `online_api_cards_*`-Dateinamen |
| Bestandsbelege nach einer Rotation | der ausgelieferte Stand (`git show HEAD:`), nicht eine Handzahl |

**Die Probe:** `scripts/simuliere_setwechsel.py <kopie>` stellt in einem
Wegwerf-Baum den Stand her, den der erste Wochenlauf nach einem neuen
Set schreibt — mit dem echten Code aus `update_sets.py`. Der Ablauf
`setwechsel-probe.yml` faehrt die Kern-Suiten dagegen (Tag danach, 30
Tage spaeter per `faketime`, nur-JP), sonntags und bei jedem PR. **Rot
heisst: das naechste Set haelt den Wochenlauf an.** Wer eine Liste von
Set-Kuerzeln, einen Formatschluessel oder eine datierte Zahl in Code
oder Tests schreibt, faehrt vorher diese Probe.

## POCKET KOMMT AUS LIMITLESS, TAEGLICH (29.09.2026)

Game8 weist den GitHub-Laeufer ab (HTTP 202, Cloudflare), also war die
Pocket-Tier-Liste eine woechentliche Handernte. Entscheidung Hausi: Quelle
wechseln. Seitdem:

* `scripts/scrape_pocket_limitless.py` holt die Standings der
  Pocket-Standardturniere (Limitless-API, `format: null`, ab 16 Spielern,
  14 Tage) und schreibt `data/pocket_tierlist.json`. Jedes fertige Turnier
  wird genau einmal geholt (`data/pocket_limitless_turniere.json`); ein
  Turnier ohne Platz 1 laeuft noch und kommt am naechsten Tag.
* Anteil und Siegquote (WR*, `S / (S + N + U)`) sind GEZAEHLT. Die Stufe
  ist UNSERE Regel darueber (`STUFENREGEL`, steht in `_meta.stufenregel`,
  die Oberflaeche baut ihren Satz daraus).
* Der Scan-Code ist aus der gespielten Liste mit der besten Bilanz gebaut,
  mit ihrer Energie (`decklist.energy`). Kennt die Kennungstabelle eine
  Karte nicht, steht das Deck OHNE Code und mit Grund da.
* `pocket-tierlist.yml` laeuft taeglich: Kennungstabelle und Set-Namen
  (beide aus flibustier/pokemon-tcg-pocket-database), Tier-Liste, Tor
  `alle`, Push. Die Laufkontrolle in `data-guardian.yml` beobachtet ihn.
* Die echten Game8-Codes vom 28.09.2026 liegen eingefroren in
  `tests/fixtures/pocket_game8_decks.json` — der Vorrat ECHTER, gescannter
  Codes fuer die Pruefung von `js/qr-svg.js` und des Kodierers.

## Eine Zusicherung, die Text liest, prueft die Schreibweise — nicht das Verhalten

Am 12.09.2026 habe ich eine frisch geschriebene Zusicherung verfaelscht,
um sie zu pruefen: aus `if (erg.gitter && erg.gitter.length)` wurde
`if (false && erg.gitter.length)`. **Sie blieb gruen** — das gesuchte
Muster kam im verfaelschten Text weiter vor.

Wo das VERHALTEN zaehlt, muss die Funktion ausgefuehrt werden. Dafuer muss
sie eine eigene Funktion sein, die eine Pruefung aus der Datei schneiden
und in einem `vm`-Kontext aufrufen kann (Muster:
`schneideFunktion` in `tests/unit/test-feld-abdeckung.js`). Eine
Textzusicherung ist richtig fuer Dinge, die WIRKLICH Text sind — eine
Meldung, ein CSS-Regelname, ein vorhandener Aufruf.

**Und jede neue Zusicherung bekommt eine Verfaelschungsprobe**, bevor sie
als Sicherung zaehlt. Kostet eine Minute; ohne sie weiss niemand, ob sie
ueberhaupt beisst.

## EINE KARENZ GEHOERT AN EINEN BELEG, NICHT AN DIE ZEIT

Am 12.09.2026 wurde richtig entschieden: „neu ist erlaubt, verloren
nicht". Umgesetzt wurde es mit einer Kruecke — eine Mega-Form galt als
neu, **solange die Nutzungsdatei ihre Grundform nicht kennt**.

Die Kruecke lief am 13.09.2026 um 04:07 UTC ab. Der naechtliche Lauf
schrieb `baxcalibur`, `golisopod` und `salamence` in die Nutzungsdaten;
die drei Mega-Formen galten damit nicht mehr als neu, und vier
Zusicherungen meldeten **„Faehigkeit verloren" fuer Werte, die es nie
gegeben hat**. Die Kette stand sechs Stunden, ohne dass etwas kaputt war.

Eine Faehigkeit entsteht nicht mit der Zeit, sondern mit einem Beleg.

**Die Regel:** wo eine Luecke geduldet wird, wird sie BENANNT und
DATIERT — in den Daten, nicht im Testcode —, und die Liste wird in
BEIDE Richtungen geprueft. Waechst sie, hat niemand nachgeschlagen.
Schrumpft sie, gehoert der Wert in die Daten und die Zeile weg.

Beispiele im Bestand, Stand 13.09.2026:

| Ort | was er benennt |
| --- | --- |
| `data/champions_mega_faehigkeiten.json` → `_meta.ohne_beleg` | Mega-Formen, fuer die keine Quelle einen Wert fuehrt |
| `scripts/build_champions_sprites.py` → `AUSGESCHIEDEN` | Sprite-Schluessel von Formen, die der Kader nicht mehr fuehrt |
| `data/datenluecken.json` | alles Uebrige, sichtbar im Admin-Bereich (`#admin`) |

Und die Gegenprobe gehoert dazu: ein Name in `AUSGESCHIEDEN` darf nicht
im Pokedex stehen, eine Form in `ohne_beleg` nicht schon einen Wert
haben. Ohne die zweite Richtung ist so eine Liste ein Friedhof.

**Ein Verlust wird nie stillschweigend geloescht.** Wer eine verwaiste
Zeile wegwirft, vernichtet die nachgeschlagene Quelle — und beim
naechsten Auftauchen schlaegt sie jemand erneut nach.

## EIN SATZ, DER EINE TATSACHE BEHAUPTET, IST CODE

Am 13.09.2026 stand nach einem gruenen Deploy im Pokedex-Modal:

> „Vorschlag liegt vor, Bestätigung steht aus — bis dahin steht hier
> nichts. Geraten wird nicht."

Der Satz war am 31.08.2026 wahr. Zum Fundzeitpunkt lag fuer die drei
offenen Mega-Formen **gar kein Vorschlag** vor. Alle Suiten waren gruen:
geprueft war, DASS der Schluessel `megaAbilityUnknown` in beiden Sprachen
vorkommt — nicht, OB er stimmt.

Gefunden hat ihn nicht ein Test, sondern das Hinsehen nach dem Deploy.

**Die Regel:** ein Oberflaechentext, der eine Tatsache ueber die Datenlage
behauptet, braucht eine Zusicherung, die ihn GEGEN DIE DATEN haelt — nicht
gegen sich selbst. Die Form ist nie „dieser Satz ist verboten", sondern
„dieser Satz darf X nur behaupten, wenn die Daten X hergeben"
(siehe `tests/unit/test-mega-nutzungsdaten.js`, „der Platzhalter behauptet
keinen Vorschlag, den es nicht gibt").

Dieselbe Regel wie „eine Aussage ueber die Umgebung ist eine Messung oder
sie ist nichts" — nur fuer das, was der Nutzer liest.

## DEIN EIGENER KOMMENTAR MACHT DIE VERFAELSCHUNGSPROBE BLIND

Am 13. und 14.09.2026 **dreimal derselbe Fehler**, jedes Mal in einer
frisch geschriebenen Zusicherung:

| Probe | blieb gruen, weil |
| --- | --- |
| `Unknown Item`-Muster aus der Flaeche entfernt | mein Kommentar darueber erklaerte das Muster und nannte es woertlich |
| `scrollbar-width: thin` aus der Regel entfernt | mein Kommentar im selben Block zitierte die alte Fassung |
| `border-radius: 50%` entfernt | mein Kommentar erklaerte, warum der Knopf rund bleiben muss |

Das Muster ist heimtueckisch, weil es sich mit Sorgfalt VERSCHLIMMERT:
je ausfuehrlicher der Kommentar den Fall erklaert, desto sicherer
enthaelt er die gesuchte Zeichenkette — und desto blinder wird die
Probe.

**Die Regel:** eine Zusicherung, die Quelltext nach einer Zeichenkette
durchsucht, schneidet vorher die Kommentare heraus.

```js
const ohneKommentare = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
```

Und dazu die **Gegenprobe zum Ausschneiden selbst** — sonst wirft es im
Zweifel alles weg und die Zusicherung prueft gar nichts mehr:

```js
assert.ok(ohneKommentare(text).length > text.length * 0.3,
    'das Ausschneiden hat zu viel entfernt');
```

Muster im Bestand: `tests/unit/test-gegenstand-ohne-namen.js` und
`tests/unit/test-hilfe-knopf-und-heatmap.js`.

## EINE REGEL GEHOERT AN IHRE BEDINGUNG, NICHT AN EIN BAND ODER EINEN TAKT

Vier Faelle in drei Tagen, alle mit demselben Bauplan — und alle vier
haben `main` angehalten oder etwas falsch aussehen lassen:

| Regel hing an | sie meinte | was passierte |
| --- | --- | --- |
| „Nutzungsdatei kennt die Grundform nicht" | „es gibt keinen Beleg" | Karenz lief ueber Nacht ab, vier Zusicherungen meldeten Verlust fuer nie dagewesene Werte (12./13.09.) |
| `@media (max-width: 768px)` | „die Tabelle passt nicht" | zwischen 769 px und 1600 px kein Scroll-Hinweis, 42 % der Heatmap unsichtbar (13.09.) |
| `min-height` ohne `min-width` | „der Knopf ist quadratisch" | zwischen 481 und 768 px ein Oval mit `border-radius: 50%` (13.09.) |
| Wochenlauf | „die Daten haben sich geaendert" | `datenluecken.json` lief taeglich der Wirklichkeit hinterher (14.09.) |

**Die Frage vor jeder neuen Grenze:** *Was ist die Bedingung, die ich
eigentlich meine — und kann ich sie direkt hinschreiben?*

`aspect-ratio: 1/1` statt zweier Breakpoints. Eine benannte,
datierte Liste statt einer Zeitkruecke. Der Scroll-Hinweis in der
Grundregel, weil die Tabelle bei KEINER Breite passt. Der Erzeuger im
selben Ablauf wie die Daten.

Wenn eine Bedingung sich nicht direkt hinschreiben laesst, gehoert die
Grenze mit einer Messung begruendet — nicht mit „das ist Handy".

## Ressourcen: was ein Durchgang kosten darf

Gemessen am 12.09.2026 in einer einzigen Sitzung, weil der Betreiber
zu Recht gefragt hat, wo sein Wochenlimit hingeht:

| Posten | Kosten | vermeidbar |
| --- | --- | --- |
| Pruefagenten (3 Stueck) | **793.000 Token** | fast vollstaendig |
| Ausliefern ueber den Browser | 44 Aufrufe je grossem PR | vollstaendig, siehe unten |
| Screenshots | ~2.000 Token je Bild | etwa die Haelfte |
| Testlaeufe (8.319 Zusicherungen) | ~90 Token | **nichts — hier NICHT sparen** |

Die Pruefungen sind das Billigste am ganzen Ablauf. Teuer sind
Agentenrunden und der Browser.

### Die vier Regeln

1. **Kein Pruefagent im Bauauftrag.** Agenten sind fuer Fragen quer
   ueber das Projekt ("was ist offen", "wo widerspricht sich Doku und
   Code") — nicht fuer "stimmt dieses Feature". Im Wochenaudit EINER,
   nicht drei.
2. **Layout erst als Entwurf, dann erst im Zweig.** Zwei bis drei
   eigenstaendige Test-HTML mit ECHTEN Zahlen, Screenshot bei 1280
   und 390, dem Betreiber vorlegen. Er entscheidet, dann wird
   eingebaut — im selben Auftrag, ohne neuen Anlauf.
3. **Suiten immer, Screenshots selten.** Die drei Suiten vor jedem
   Ausliefern; sie kosten fast nichts und fangen echte Fehler.
   Screenshots nur, wenn es ums AUSSEHEN geht. Fuer Zahlen und
   Zustaende im Browser messen und eine Zeile zurueckgeben lassen,
   nicht ein Bild.
4. **Ein Auftrag, ein PR, ein Bericht.** Funde unterwegs kommen unter
   "Nebenbefunde" ans Ende der Antwort — nicht umsetzen. Der Betreiber
   entscheidet, ob sie in diesen oder den naechsten Auftrag gehoeren.
   Am 12.09. ist ein Auftrag ohne diese Regel auf sieben PRs
   angewachsen.

### ARBEITSORT UND SCHREIBWEG SEIT 01.10.2026: DER LOKALE KLON (Aufraeumprojekt)

Gemessen am 30.09./01.10.2026, nicht angenommen. Der Klon liegt auf dem Rechner
des Betreibers unter `C:\TheDipidis\repo` (aus der Sitzung: `$HOME/mnt/TheDipidis/repo`).
Er ersetzt fuer neue Rutsche den Patch-Weg und den Browser-Upload; beides
bleibt darunter stehen und ist jetzt NOTLOESUNG.

- **Was in der Sitzung geht:** `git fetch`, Commit, alle Suiten (Python 3.12 —
  die Suiten brauchen die CI-Version, 3.10 scheitert an f-Strings), Browser
  fuer Quellen. **Was nicht geht:** `git push` aus der Sitzung (kein Login:
  „could not read Username"), limitlesstcg.com ueber `device_bash` (403 am
  Proxy; im eingebauten Browser der Desktop-App erreichbar).
- **Push macht der Betreiber** — im Ordner `C:\TheDipidis\repo`
  `git push -u origin <zweig>` (gemessen 01.10.2026: klappt, auch mit
  Aenderungen unter `.github/workflows/`). Claude liefert dafuer jedes Mal den
  fertigen Befehl bzw. einen Claude-Code-Prompt, damit nichts von Hand
  getippt wird.
- **Zu Sitzungsbeginn** `git fetch` und `git pull --ff-only` auf `main`, dazu
  ein Blick auf geaenderte Datendateien (Scraper schreiben weiter auf GitHub).
- **Vor jedem Push** `git fetch` und Abgleich mit `origin/main`: nur Daten
  geaendert → rebase und Suiten neu; Ueberschneidung → anhalten und melden.
- **Freigaberegel „bereit zum Push":** alle Suiten komplett gruen (JS-Kern,
  JS-Neben, Py-Kern, Py-Neben), `./bump-version.sh` gelaufen, lokal angesehen,
  Abgleich mit `main`. Danach pusht der Betreiber, Claude eroeffnet den PR,
  wartet auf die CI, mergt (`merge_pull_request`, `squash`) und prueft
  `version.json` live. Rueckfrage vor dem Merge nur bei Aenderungen an
  Nutzerdaten.
- **Python-Kern in der Geraete-VM:** passt nicht in ein 180-s-Fenster → in zwei
  Haelften laufen lassen (`ls tests/python/test_*.py`, Zeilen 1–90 und Rest).

### Der Schreibweg — und die Sackgassen

**Ausliefern geht NUR ueber die GitHub-Weboberflaeche in Chrome.** Das
ist seit dem 21.08.2026 mehrfach geprueft und steht in mindestens drei
Projektdokumenten. Es ist keine offene Frage.

```
git push                    -> 403
mcp__Github__create_branch  -> 403 Resource not accessible by integration
mcp__Github__push_files     -> 403
mcp__Github__merge_pull_request -> 403
```

**Die Ursache ist die Freigabeliste DIESER SITZUNG**, nicht eine
Einstellung des Betreibers. Die Fehlermeldung sagt es woertlich:
*„not in this session's authorized repository set"*. **In Cowork laesst
sich das nicht einstellen.**

Am 13.09.2026 hat der Betreiber einen Screenshot seiner
GitHub-App-Einstellungen geschickt: die App „Claude" hat
*Read and **write** access to actions, checks, **code**, discussions,
issues, **pull requests**, repository hooks, and **workflows**«* und
Zugriff auf *All repositories*. **Die Rechte sind erteilt. Trotzdem 403.**

#### Diese vier Wege sind geprueft und tot — nicht erneut vorschlagen

| Weg | warum er nicht geht |
| --- | --- |
| Berechtigungen der GitHub-App aendern | schon auf *read and write*, Screenshot 13.09.2026 |
| Eigene Zugangsdaten in der Push-URL | der Proxy blockt **repo-basiert**, nicht credential-basiert |
| Token anlegen und ueber Chrome injizieren | vom Sicherheits-Klassifikator geblockt — und der Assistent legt ohnehin **nie** Tokens an |
| `device_bash` auf dem Rechner des Betreibers | kein Netzzugang von dort, also kein git-Remote |

**Der Einzeiler, der diese Regel traegt:** die Fehlermeldung 403 beweist
*dass* Schreiben nicht geht — sie beweist **nicht warum**. Wer aus ihr
eine Ursache ableitet, ohne sie zu messen, produziert genau die
Diskussion, die dieses Projekt am 13.09.2026 zum zehnten Mal gefuehrt
hat.

#### NACHGEMESSEN 25.09.2026: DIE MCP-WEGE GEHEN WIEDER

Der Absatz darueber stammt vom 21.08.2026 und war an diesem Tag richtig.
Am 25.09.2026 nachgemessen, in dieser Reihenfolge und mit diesem
Ergebnis:

| Weg | gemessen 21.08.2026 | gemessen 25.09.2026 |
| --- | --- | --- |
| `git push` | 403 | **403** (unveraendert) |
| `curl api.github.com` | 403 | **403** (unveraendert) |
| `git fetch` | — | **geht** |
| `mcp__Github__create_branch` | 403 | **geht** |
| `mcp__Github__push_files` | 403 | **geht** |
| `mcp__Github__create_pull_request` | 403 | **geht** |
| `mcp__Github__merge_pull_request` | 403 | **geht** |

Die Fehlermeldung von `curl` nennt inzwischen auch den Grund und den
Ausweg: *„GitHub access to this repository is not enabled for this
session. Use add_repo to request access."* Ein `add_repo`-Werkzeug stand
in dieser Sitzung nicht in der Werkzeugliste — deshalb bleibt es bei dem,
was gemessen geht.

**NACHGEMESSEN 09.10.2026 (SC-29/WZ-39): `add_repo` gibt es in der
Cloud-Sitzung, und es traegt.** `mcp__claude-code-remote__add_repo`
(owner `CapTheAvenger`, repo `TheDipidis`, access `push`) haengt das Repo an
die Sitzung; danach: `gh api repos/CapTheAvenger/TheDipidis/actions/runs`,
`.../runs/<id>/jobs`, `check-runs/<job>/annotations` → **200, 15.000
Aufrufe/h** (vorher 403), `git clone --depth 1` → geht (145 MB, ~3 min),
`git push --dry-run origin <zweig>` → **geht**. Grenzen: das Job-Protokoll
(`.../jobs/<id>/logs`) leitet auf `*.blob.core.windows.net` um, das der
Proxy blockt (auch aus der Geraete-VM) — die Zusammenfassung eines Laufs
liest Chrome auf `github.com/.../actions/runs/<id>` (mit `<details>`
aufgeklappt); die unauthentifizierte API aus Chrome/Geraete-VM hat 60
Aufrufe/h je IP und ist nach einer Inventur erschoepft. Ob der Push
Ablaufdateien schreiben darf, zeigt der erste echte Push (NICHT GEPRUEFT).

**Was daraus folgt — die Reihenfolge, nicht die Religion:**

1. `mcp__Github__create_branch` gegen einen Wegwerf-Namen. Ein Aufruf.
2. Geht das, dann Zweig + PR + Merge ueber MCP. `push_files` traegt den
   Inhalt aber **im Aufruf selbst** — bei grossen Dateien
   (`index.html` 363 KB, `js/app-city-league.js` 327 KB) kostet das ein
   Vielfaches einer Browser-Runde. Faustregel, gemessen: **bis ~30 KB
   je Datei `push_files`, darueber der Browser.**
3. Geht `create_branch` nicht, **ohne weitere Diskussion** ueber die
   Weboberflaeche ausliefern. Kein dritter Weg, keine Tokens.

Der Browser-Weg ist damit nicht abgeschafft, sondern der **zuverlaessige
Weg fuer grosse Dateien**. Am 25.09.2026 sind so 17 Dateien in acht
Runden gelandet, alle byte-gleich nachgeprueft
(`git hash-object` gegen `git rev-parse <zweig>:<datei>`).

Billiger wird der Weg nur ueber **weniger PRs**, nicht ueber ein anderes
Werkzeug: die Kosten haengen an der Zahl der beruehrten Verzeichnisse
je PR.

#### DER PATCH-WEG (seit 27.09.2026; seit 01.10.2026 NOTLOESUNG — Standard ist der Klon, s. o.)

`push_files` traegt den ganzen Dateiinhalt im Aufruf — bei `index.html`
(363 KB) nicht machbar. Der Patch-Weg schickt stattdessen nur den DIFF:

1. Lokal committen. Je Commit einzeln
   `git -c core.attributesFile=<datei> format-patch -1 -U1 --binary --stdout <commit>`
   (die Datei enthaelt `masterclass/*.html -diff`: eine Aenderung in der
   506-KB-Zeile reist dann als Binaerdelta von 60 Bytes statt 1 MB).
   Mehrere Patches mit `cat` aneinanderhaengen — ein Nachtrag laesst die
   schon gelieferten Teile byte-gleich.
2. `python3 scripts/patch_weg.py verpacken x.patch ordner --teil 24000`
   zerlegt in Teile mit `|` am Zeilenende (schuetzt Leerzeichen am
   Zeilenende) und maskiert ein woertliches Schraegstrich-u.
3. `mcp__Github__create_branch` → `patch/<name>`, dann JEDEN Teil einzeln
   mit `push_files` nach `.patch-einspielen/teil-NN.txt` und **nach jedem
   Teil** `git fetch` + `sha256sum` gegen `FERTIG.json`. Gemessen: ein
   Teil, der auf eine Leerzeile endet, kam einmal eine Zeile kurz an.
   `FERTIG.json` kommt zuletzt.
4. `.github/workflows/patch-einspielen.yml` setzt zusammen, prueft jede
   Pruefsumme, entfernt die Anlieferung und macht `git am` auf DEMSELBEN
   Zweig. Danach den Baum des Zweigs (`git rev-parse <zweig>^{tree}`)
   gegen den lokalen Baum halten, erst dann PR, CI, Merge.

**Der Einspiel-Commit stoesst die PR-Pruefungen nicht an (gemessen
30.09.2026, PR #874).** `patch-einspielen.yml` committet mit dem
`GITHUB_TOKEN`; der dadurch ausgeloeste Deploy-Lauf wartete auf eine
Freigabe, lief ab und stand rot in der Liste (#3208), die uebrigen
Pruefungen liefen gar nicht. Deshalb den PR ERST anlegen, wenn der Zweig
fertig eingespielt ist — oder, wenn er schon offen ist, ueber MCP
schliessen und wieder oeffnen (`update_pull_request` state closed, dann
open). Das startet alle Pruefungen auf dem neuen Kopf.

**Grenzen, gemessen 27.09.2026:** MCP schreibt keine Datei unter
`.github/workflows/` (403 „Resource not accessible by integration"), und
`GITHUB_TOKEN` darf Ablaeufe auch nicht aendern. Ablaufaenderungen gehoeren
deshalb nie in den Patch. `merge_pull_request` braucht die volle
40-stellige SHA in `expectedHeadSha`.

**Push und Merge im Alltag, gemessen 30.09./01.10.2026 (WZ-25):**

- Die Geraete-VM hat keinen git-Login (`git push` → „could not read
  Username"). Claude committet im Klon, der Betreiber pusht den Zweig aus
  PowerShell (`cd C:\TheDipidis\repo`, `git push -u origin <zweig>`). Erst
  wenn der Zweig auf origin steht, wird der PR eroeffnet.
- Commits in der VM brauchen Namen und Adresse am Aufruf:
  `git -c user.name=... -c user.email=... commit`.
- Die Pruefungen eines PR brauchen rund 21 Minuten: nicht pollen, den Turn
  beenden und beim naechsten Anstoss nachsehen. Gemerged wird mit Squash und
  der vollen 40-stelligen SHA in `expectedHeadSha`.
- Fertig ist es erst, wenn `thedipidis.app/version.json` den neuen Stempel
  (`JJJJMMTTHHMM-<sha>`) zeigt — Deploy-Lauf gruen heisst noch nicht live.
- Gestapelte Zweige (D auf C): nach dem Merge des unteren Zweigs den oberen
  auf `main` neu aufsetzen und die Version noch einmal anheben.

**Ablaufaenderungen — zwei Wege, in dieser Reihenfolge (28.09.2026):**

1. **Chrome auf dem Rechner des Betreibers**, wenn er an ist. ERST
   `list_connected_browsers` aufrufen — ohne diesen Aufruf gibt es keine
   Aussage „Chrome ist nicht verbunden" (am 27.09. stand genau das im
   Bericht, ohne dass ein Chrome-Werkzeug je aufgerufen worden war; Chrome
   war die ganze Zeit verbunden). Dann im GitHub-Web-Editor des Betreibers
   die Aenderung auf einem Zweig vorbereiten. Der Web-Editor mit seiner
   Anmeldung schreibt Ablaufdateien (gemessen 27.09.: so sind
   `patch-einspielen.yml` und die WZ-8-Zeile entstanden). Den Klick auf
   „Commit changes" gibt der Betreiber im Chat frei — Warten auf ein „ja"
   statt auf einen Handgriff.
2. Sonst ein vorausgefuellter **Bearbeiten-Link** auf GitHub.com, den der
   Betreiber am Handy abschickt.

**Live-Abnahme:** die Sandkiste erreicht `thedipidis.app` nicht (403 am
Proxy). Gemessen geht Chrome auf dem Rechner des Betreibers (Claude in
Chrome), solange er verbunden ist — Zahlen per `javascript_tool` als Zeile
zurueckgeben. Dort liess sich die Fensterbreite nicht auf Handygroesse
stellen, ein iframe sperrt die Seite; Handybreiten deshalb lokal auf
demselben Baum messen (`python3 -m http.server` + Playwright).

#### Zwei Fallen im Upload-Formular (gemessen 13.09.2026)

**Die versteckten Felder NIE setzen.** Beide Versuche haben je einen
Anlauf gekostet und nichts committet:

| Feld | was es wirklich ist | Folge beim Ueberschreiben |
| --- | --- | --- |
| `input[name="quick_pull"]` | die **Basis** (`main`), nicht der neue Zweig | Vergleichsseite gegen einen Zweig, den es nicht gibt — kein Commit |
| `input[name="target_branch"]` | vorgegebener Zweigname, **signiert** | **Server Error** — kein Commit |

Den vorgegebenen Namen `CapTheAvenger-patch-NNNNNN` stehen lassen. Zu
setzen sind nur `input[name="message"]`, `textarea[name="description"]`
und der Knopf `input[name="commit-choice"][value="quick-pull"]`.

**Der Merge-Knopf braucht einen echten Klick.** Ein `dispatchEvent` auf
„Merge pull request" oeffnet den Bestaetigungsdialog nicht; er kommt erst
ueber `computer left_click` auf die Koordinate. Danach „Confirm merge",
ebenfalls per echtem Klick.

## EINE AUSSAGE UEBER DIE UMGEBUNG IST EINE MESSUNG ODER SIE IST NICHTS

Am 13.09.2026 habe ich dem Betreiber empfohlen, eine
GitHub-Berechtigung umzustellen. Getestet hatte ich, **dass** Schreiben
403 gibt. Die **Ursache** hatte ich mir dazugedacht — und sie war
falsch, was ein Screenshot in zehn Sekunden zeigte.

Das ist dieselbe Regel, die fuer Daten laengst gilt („Report, don't
silently repair", „NICHT GEPRUEFT statt OK") — sie galt nur nie fuer
Aussagen ueber die eigene Umgebung.

**Vor jeder Aussage darueber, was geht oder nicht geht, und warum:**

1. `project_search` im Projekt. 179 Dokumente, drei Wochen Vorarbeit.
   Das kostet einen Aufruf und ist fast immer schon beantwortet.
2. Messung und Schlussfolgerung trennen. „403" ist eine Messung.
   „Das liegt an X" ist eine Behauptung und braucht einen eigenen Beleg.
3. Ohne Beleg: **NICHT GEPRUEFT** hinschreiben, nicht die
   wahrscheinlichste Ursache als Tatsache verkaufen.

## Data rules

* **Never join card data by name.** Names are not unique within a set. PBL has
  four products called *Mega Darkrai ex* priced 1,03 € / 9,69 € / 184,03 € /
  331,99 €. Join on `(set, number)` or `cardmarket_product_id`.
* **Report, don't silently repair.** This data drives prices and card identity.
  A reported hole is recoverable; a guessed correction looks right and is wrong.
  See `scripts/data_guardian.py`.
* **Absolute quality thresholds produce noise here.** "<90 % mapped" flags 62 of
  153 sets, nearly all legitimately unmappable (old promos, JP-only sets). Detect
  *change* against a baseline instead.
* `data/_consumers.md` is a real published interface — other projects read those
  files from `main`. Adding a column is safe; renaming/removing one breaks them.
* Verify claims against the source before changing data. Never invent card data.

## External sources & rate limits

* **Cardmarket S3 images** — hotlink-protected: need a browser User-Agent *and*
  `Referer: https://www.cardmarket.com/`, `GET` (not `HEAD`), and they return a
  bogus `Content-Type` — trust the JPEG magic bytes.
* **play.pokemon.com CloudFront** — freely embeddable, but AWS throttles bulk
  scraping from datacenter/CI IPs (403, then hanging connections). Pace requests,
  back off on 403 instead of treating it as "missing", and **never re-fetch data
  you already have** — that's why the Prize Pack build only fetches *new* series.
* The sandbox cannot reach cardmarket.com, play.pokemon.com or thedipidis.app.
  To check anything live, run it in CI (workflow_dispatch) and read the job log.

## Verification

* **Nach jedem Deploy die geänderte Stelle im Browser ANSEHEN.** Grüne Tests
  heißen nicht, dass es gut aussieht. Angeordnet am 02.09.2026: *"kannst du
  bitte künftig alles was du änderst danach Live testen ob das wirklich Sinn
  ergibt was du da gemacht hast."* Anlass war eine Heatmap-Zelle, die
  `M 49,4 % · 52` schrieb — alle Tests grün, für einen Leser unlesbar. Der
  Fehler war nicht der Code, sondern dass ihn niemand angeschaut hat.
* **Bei Layout-Entscheidungen mehrere Entwürfe rendern und vergleichen, bevor
  einer in den Zweig kommt.** Ein Mock mit echten Zahlen, Playwright-Screenshot,
  hinsehen. Kostet Minuten und hat am 02.09. fünf Entwürfe gegeneinander
  gestellt; gewonnen hat der, den der Betreiber selbst skizziert hatte — nicht
  der, den ich für den elegantesten hielt.
* Prefer driving the real thing over asserting it works. There is Playwright
  tooling: `tests/e2e-playtester-smoke.js`, `tests/mobile_ux_audit.js`, and the
  `visual-*.yml` workflows.
* When a CI check contradicts your expectation, find out *why* before concluding
  — a "0 rows" result was once CDN throttling, not a code bug.

## LIVE-PRUEFEN MIT AGENTEN — DREI FALLEN (05.10.2026, UI/UX-Ueberpruefung v2)

* **Das Battle Journal liegt in `users/{uid}/battleJournal`**, nicht in `journal`.
  Eine Zaehlung von `journal` liefert 0 und laesst einen Pruefer glauben, das
  Journal sei leer — am 04.10. lagen dort 17 echte Matches. Zaehlwerkzeug:
  `scripts/messe_inventur.js` → `__inventur.nutzerdaten()`.
* **390 px ohne Mobilgeraet:** `iframe src="/#…"` geht nicht (die CSP erlaubt
  keinen Rahmen der eigenen Herkunft, `eval` ist verboten). Weg: leeren iframe
  390×844 anlegen, `index.html` per `fetch('/')` holen und mit
  `document.open/write/close` hineinschreiben, Messcode als `<script>` einsetzen.
  Werkzeug und Schritte: `scripts/messe_390.js` (Dateikopf). iPhone-Safari ist
  damit NICHT geprueft — nur die Breite.
* **Native Dialoge frieren Agenten-Tabs ein.** `confirm()`/`prompt()` halten im
  Hintergrund-Tab die Seite an. Seit UI-104 laufen Rueckfragen ueber
  `zeigeBestaetigung` (App-Dialog), Eingaben ueber `showInputModal`;
  `tests/unit/test-ui104-app-rueckfrage.js` verbietet neue native Aufrufe.

## FESTLEGUNGEN — VOR JEDEM BAU LESEN (seit 05.10.2026)

Hausis Festlegungen stehen im Projektwissen in `claude/festlegungen.md`:
**A) was weg ist und nie wiederkommen darf**, **B) was so bleiben muss**.
Jede Sitzung, jeder Rutsch und jeder Agentenauftrag liest sie vor dem Bau.
Ein Vorschlag, der A widerspricht, wird nicht gebaut und nicht erneut
vorgeschlagen; B wird nur auf ausdrueckliche neue Bestellung geaendert (dann
die Datei im selben Zug anpassen). Neue sichtbare Elemente (Knoepfe, Baender,
Kopf-Elemente) werden Hausi VOR dem Bau gezeigt. Anlass: 05.10.2026 —
„Neu hier?“-Band und Kopf-„?“ aus einer Agentenempfehlung gebaut und sofort
wieder entfernt; „Top-Archetypen nach Share“ tauchte auf der Meta-Seite wieder
auf. Maschinelle Sicherung: `tests/unit/test-festlegungen-weg.js`.
