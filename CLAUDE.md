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

#### Was bleibt

Ein `create_branch` gegen einen Wegwerf-Namen am Anfang einer Sitzung
kostet einen Aufruf und sagt, ob sich etwas geaendert hat. Geht es
nicht — und das ist der Normalfall —, dann **ohne weitere Diskussion**
ueber die Weboberflaeche ausliefern. Kein dritter Weg, keine Tokens.

Billiger wird der Weg nur ueber **weniger PRs**, nicht ueber ein anderes
Werkzeug: die Kosten haengen an der Zahl der beruehrten Verzeichnisse
je PR.

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
