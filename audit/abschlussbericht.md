# Abschlussbericht — Agenten-Live-Prüfung thedipidis.app

**Stand:** 06.09.2026, nachmittags (zwei Korrekturen, unten kenntlich gemacht)
**Live-Version zum Prüfzeitpunkt:** `202609061122-ba6cee0` · **jetzt live:** `202609061316-58f5fb3`
**Regel dieses Berichts:** Jede Aussage nennt Stelle, Eingabe, Ergebnis und Prüfweg.
Was nicht live geklickt und gesehen wurde, steht als **NICHT GEPRÜFT** — nicht als OK.

---

## 1. Ergebnis in einem Satz

**Die Definition of Done ist NICHT erfüllt.**

Von den 378 Zeilen der Testmatrix (`audit/testmatrix.md`) sind in diesem Durchgang
**alle 15 Routen live geladen und auf Konsolenfehler geprüft**, der Deckbauer
**Ende-zu-Ende von null auf 60 Karten gefahren** und **zehn Einzelbefunde von einem
unabhängigen Prüfagenten nachgemessen** worden. Der Rest der Matrix — Sortierungen,
Filter, Deep-Links, Reload-Verhalten je Spalte — ist **nicht** Zeile für Zeile
durchgespielt. Der Telefontest (390 × 844) **konnte nicht durchgeführt werden**
(Abschnitt 7). Das Speichern und Laden von Decks wurde **bewusst nicht ausgelöst**
(Abschnitt 7).

Was geprüft wurde, ist belastbar. Was nicht geprüft wurde, ist unten benannt.

---

## 2. Was in diesem Durchgang ausgeliefert wurde

**PR #688** — „Ties statt Unentschieden — und die Sperre gegen meine eigene Eindeutschung"
· zusammengeführt als `ba6cee03` · 3 Prüfungen grün · Deploy grün · live seit `202609061122-ba6cee0`.

| Datei | Änderung |
| --- | --- |
| `js/i18n.js` | `mc.day2Unentschieden` / `…Leer` sagen **„Ties"** statt „Unentschieden"; Kommentar über `mc.avgWins`/`avgTies`/`avgLosses`, der erklärt, warum dort Englisch steht |
| `tests/unit/test-szenesprache.js` | Rückfallsperre gegen die Eindeutschung der Szenesprache |
| `index.html`, `service-worker.js`, `version.json` | Versionsstempel `202609061049` |
| `audit/testmatrix.md`, `audit/datenfluss.md` | Phase-1-Belege, bis dahin nur lokal |

Alle sieben Blob-SHAs vor dem PR gegen `git/trees/ties-hausschreibweise?recursive=1`
verglichen, `truncated: false`, alle identisch.

**Der Anlass war mein eigener Fehler.** Ich wollte „Ø Wins / Ø Ties / Ø Losses"
eindeutschen. `tests/unit/test-szenesprache.js` hat das binnen Sekunden gestoppt:
die englische Szenesprache ist eine Betreiberanordnung vom 28.08.2026
(*„Sieg ist Win, Niederlage ist Loss, Unentschieden ist Tie"*). Der Widerspruch,
den ich gesehen hatte, war echt — nur an der anderen Stelle: **meine** neue Zeile
sagte „Unentschieden", zwei Zentimeter neben „Ø Ties". Angepasst wurde meine Zeile.

---

## 3. Live geprüft — Bedienung

### 3.1 Alle 15 Routen

Getestet an `thedipidis.app`, frisch geladen, dann alle Hash-Routen nacheinander
angesteuert (`#current-meta`, `#meta-analysis-hub`, `#city-league`,
`#city-league-analysis`, `#current-analysis`, `#past-meta`, `#meta-call`, `#cards`,
`#proxy`, `#tutorial`, `#quellen`, `#admin`, `#side-quest`, `#calculator`, `#profile`).

**Ergebnis:** alle 15 rendern, kein `undefined` / `NaN` / `[object …]` im sichtbaren
Text, **Konsole ohne einen einzigen Fehler oder eine Ausnahme** über den kompletten
Durchlauf (`read_console_messages`, `onlyErrors: true`, nach Neuladen).

**Verifiziert durch:** DOM-Auslesen je Route + Konsolenmitschnitt.

### 3.2 Die geänderte Stelle angesehen

Getestet an `#meta-call` mit „Mein Deck = Mega Excadrill", 8 Runden, 800 Spieler
→ Ergebnis:

> **16.1 %** DAY-2-CHANCE · 16 Pkt. in 8 R. · 800 Spieler
> **Ties 10,6 % — gemessen an 2.905 Partien (TEF-PBL)**
> 3.5 Ø WINS · 0.9 Ø TIES · 3.6 Ø LOSSES

Der Text steht wie beabsichtigt und passt jetzt zur Zeile darüber.
Das Eingabefeld wurde danach auf den vorgefundenen leeren Stand zurückgesetzt.

**Verifiziert durch:** DOM-Auslesen live nach dem Deploy · unabhängig nachgemessen (B2, B3).

### 3.3 Deckbauer von null auf 60 Karten

Getestet an `#current-analysis` → Archetyp „Mega Excadrill" → Knopf **„Max Consistency"**
→ Ergebnis: **# 60/60**, 21 verschiedene Karten, **40,30 €**.
„Testhand" zieht sieben Karten und öffnet die Combo-Wahrscheinlichkeit.
„Deck kopieren" legt eine korrekt gegliederte Liste in die Zwischenablage
(Pokémon 20 · Trainer 23 · Energy 17 = 60).

---

## 4. Live geprüft — Rechnung und Zahlen

### 4.1 Preiskette: sauber, Stelle für Stelle

Die 21 Positionen des gebauten Decks gegen `data/price_data.csv` gestellt:

* **20 von 21** stimmen auf den Cent mit `eur_price` überein.
* Die 21. (`Metal Energy SVE 24`) hat `price_status: no_trend` und **keinen**
  `eur_price`; die Seite zeigt dafür `eur_low` = 0,25 €.
* Einzelpreis × Anzahl aufsummiert: **40,30 €** — exakt der angezeigte Wert.

**Urteil: die Preiskette von der Datei bis zur Anzeige ist korrekt.**
Eine Anmerkung zur Transparenz, kein Fehler: bei `no_trend`-Karten zeigt die Seite
den Tiefstpreis, **ohne das dazuzuschreiben**. 17 der 60 Karten (alle Basis-Metall-Energien)
haben keinen Trendpreis.

**Verifiziert durch:** Auslesen der 21 Einzelpreise aus dem DOM + Nachrechnen gegen die CSV · unabhängig nachgemessen (B6).

### 4.2 Wahrscheinlichkeitsrechnung: bestätigt

Getestet an der Testhand-Combo, Zielkarte „Beldum" (4 Kopien, 13 Basics, 60 Karten):

| | Seite | exakt hypergeometrisch | Urteil |
| --- | ---: | ---: | --- |
| Mulligan-Quote | 16,3 % | **16,2844 %** | stimmt |
| P(≥1 Beldum \| Hand hat Basic) | 47,1 % | **47,7211 %** | im Rauschen (Abweichung 0,62 pp = 1,24 σ bei 10.000 Iterationen) |

Bemerkenswert und richtig: die Seite rechnet **bedingt** auf die Mulligan-Regel.
Der rohe Wert ohne Bedingung wäre 39,95 % — die Seite zeigt korrekt den höheren.

**Verifiziert durch:** eigene exakte Rechnung · unabhängig nachgerechnet mit `fractions` (B10).

---

## 5. Der schwerste Befund: falsche Drucke, live, im fertigen Deck

Die Max-Consistency-Liste wurde **Karte für Karte** gegen die
best-platzierte Worlds-Liste gestellt (Boming Wang, Platz 37,
`limitlesstcg.com/decks/list/28784`, live an der Quelle gelesen).

**Karten-Identität und Anzahl: fast deckungsgleich.**
Ein einziger Tausch: **−1 Jumbo Ice Cream, +1 Tool Scrapper.** Sonst identisch.
Für ein Deck, das auf Konsistenz gebaut ist, ist das ein gutes Zeugnis.

**Der Druck stimmt bei 7 von 20 gemeinsamen Positionen nicht:**

| Karte | Seite zeigt | Quelle |
| --- | --- | --- |
| Team Rocket's Petrel | ASC 207 | **DRI 176** |
| Lillie's Determination | ASC 192 | **MEG 119** |
| Buddy-Buddy Poffin | ASC 184 | **TEF 144** |
| Boss's Orders | ASC 183 | **MEG 114** |
| Ultra Ball | ASC 213 | **MEG 131** |
| Kieran | PRE 113 | **TWM 154** |
| Metal Energy | SVE 24 | **MEE 8** |

**Ich übertreibe die Wirkung nicht.** Alle sieben sind **legitime Alternativdrucke
derselben Karte** — gleicher Name, gleicher Typ, gleiche Seltenheitsklasse (gegen
`data/all_cards_database.csv` geprüft). Die exportierte Liste ist also **spielbar**.
Der Preisunterschied ist ebenfalls klein und geht sogar in die andere Richtung:
**4,29 € (unsere Drucke) gegen 4,14 € (Quelldrucke) — 15 Cent zu unseren Ungunsten.**

> **KORREKTUR vom 06.09.2026, nachmittags.** Die erste Fassung dieses Abschnitts
> nannte als ersten Schaden ein **„falsches Kartenbild im Deckbauer und im
> Proxy-Druck"**. Das war falsch, und ich habe es selbst widerlegt, als ich der
> Sache live nachging.
>
> `getPreferredVersionForCard` (`js/app-utils.js:832`) tauscht **Trainer und
> Energie ohnehin** auf den Druck, den der Nutzer über `staples_druckmodus_v1`
> eingestellt hat — hier `"min"`, also den günstigsten. Pokémon tauscht sie nie.
> Der Kommentar im Quelltext sagt den Grund: *„Trainer/Energy reprints ARE
> functionally identical, so they stay swappable by name."*
>
> Das heißt: **das Bild im Deckbauer hängt für genau die betroffenen Kartenarten
> gar nicht am gespeicherten Druck.** Die `ASC 207` auf der Seite ist keine Folge
> des Scraper-Fehlers, sondern eine Entwurfsentscheidung. Der Befund selbst
> (Datenqualität) bleibt bestehen — seine Wirkung habe ich zu groß beschrieben.

Der Schaden liegt woanders und ist trotzdem real:

* **keine Aussage darüber, welchen Druck die Spieler wirklich gespielt haben** —
  und genau das ist eine der Fragen, für die die Seite gebaut ist,
* eine Zuordnung, die teuer wird, sobald ein Name Drucke mit sehr verschiedenen
  Preisen trägt (CLAUDE.md nennt vier Produkte *Mega Darkrai ex* zu
  1,03 / 9,69 / 184,03 / 331,99 €).
* **Nicht** betroffen: das angezeigte Kartenbild bei Trainern und Energie (siehe
  Korrektur oben). Bei Pokémon wäre es betroffen — dort war die Erhebung aber von
  Anfang an richtig (85 von 85 Karten stimmten in der Stichprobe).

**Der Extraktor ist seit PR #687 repariert** — er liest den Druck jetzt für **jede**
Karte von der Seite, nicht nur für Pokémon. **Der Bestand ist es nicht.** Welchen
Druck ein Spieler gespielt hat, steht nur auf der Quellseite; es braucht einen
vollen Lauf von `backend/scrapers/per_decklist_scraper.py`. Bis dahin ist jede
Druckangabe zu Trainern und Energie im Bestand **ungeprüft**.

**Verifiziert durch:** Bauen im Browser · Quelle live gelesen · Namensabgleich per Skript · unabhängig nachgemessen (B4).

---

## 6. Weitere Befunde, alle nachgemessen

### 6.1 Daten

**D1 — Worlds San Francisco: 23 Spieler und 2 Archetypen fehlen.**
Quelle (`labs.limitlesstcg.com/0071/standings`, eingebettete Nutzlast, live gelesen):
**797 Spieler, 46 Archetypen.** `data/labs_tournament_decks.csv` für `tournament_id 0071`:
**774 Spieler, 44 Zeilen**, `total_players = 774` = Summe `player_count`.
Ganz fehlen **Ogerpon Meganium** (1) und **Mega Dragonite** (1); die übrigen
21 fehlen **innerhalb** vorhandener Archetypen (Dragapult 178→172, N's Zoroark 60→58,
Basic Box 74→73 und zehn weitere).
**Die Ursache ist nicht gefunden.** Naheliegende Erklärungen scheiden aus:
262 Spieler sind `dropped`, 3 `late`, 0 `dqed` — keine dieser Zahlen ist 23.
Mega Excadrill selbst ist mit 32 vollständig.
`total_players` misst also die **Decksumme**, nicht die Kopfzahl.

**D2 — Vier City-League-Dateien enthalten nur eine Kopfzeile:**
`city_league_analysis.csv` (304 B), `city_league_archetypes.csv` (73 B),
`city_league_archetypes_comparison.csv` (183 B), `city_league_archetypes_deck_stats.csv` (100 B).
Live sichtbar: `#city-league` und `#city-league-analysis` schreiben beide
**„Daten: keine Daten"**. Immerhin ehrlich — aber zwei von 15 Ansichten sind leer.

**D3 — `data/_archive` ist 21.150.322 Bytes groß** und wird öffentlich mit ausgeliefert.

**D4 — 4 von 24 Workflows** verweisen auf den Wächter bzw. eine Sanity-Prüfung.

### 6.2 Oberfläche

**O1 — Zwei Knöpfe nebeneinander heißen beide „PTCGL".** Der eine importiert,
der andere exportiert; unterschieden werden sie **nur** durch das `title`-Attribut
(„Deck importieren" / „Deck exportieren"), das auf dem Telefon niemand sieht.
Der Import **überschreibt** die gebaute Liste.

**O2 — Zahlformat uneinheitlich, und zwar innerhalb desselben Blocks.**
Im Day-2-Block stehen nebeneinander `16.1 %`, `3.5 Ø WINS` (Punkt) und
`Ties 10,6 %` (Komma). In der Testhand steht `47.1% Chance` (Punkt, ohne Leerzeichen)
neben `0,66€` (Komma). Betroffen sind **nur die gerechneten Blöcke** — die 13
statischen Routen zeigen kein einziges Punkt-Dezimal.

**O3 — Englische Reste im Deckbauer ohne `data-i18n`:**
„🎲 Opening Hand (7 cards):", „Basic in hand: 83.7%", „(13 Basics / 60 cards)".
„Mulligan" ist Szenesprache und bleibt; die übrigen sind es nicht.
Die CI-Prüfung `Sprachreinheit (i18n)` läuft grün — sie sieht diese Stellen also nicht.

### 6.3 Werkzeug

**W1 — `t(key)` nimmt nur ein Argument** (`js/i18n.js:5219`) und verwirft ein
zweites **stillschweigend**. Die Platzhalter `{q}` / `{n}` / `{meta}` werden an der
Aufrufstelle ersetzt (`js/app-meta-call.js:10341–10346`), nicht in `t()`.
Das funktioniert, ist aber eine Falle: `t('mc.day2Unentschieden', {q: …})` sieht
richtig aus, liefert aber das rohe Template. Vom Prüfagenten gefunden, nicht von mir.

**W2 — 15 Testdateien sind leer** (u. a. `test-deckBuilder.js`, `test-dataIntegrity.js`,
`test-parseCSV.js`, `test-coreDataProcessing.js`). Der Runner **meldet das selbst**
(„… leere Testdatei(en) — nicht mitgezaehlt, Luecke offen") und zählt sie nicht mit.
Das ist sauber deklariert und kein Betrug — aber „4004 grün" heißt: grün bei
15 offen ausgewiesenen Lücken, darunter ausgerechnet der Deckbauer.

---

## 7. NICHT GEPRÜFT — ausdrücklich

**N1 — Telefonansicht 390 × 844.**
`resize_window` meldet für jeden Versuch Erfolg, `window.innerWidth` bleibt aber
bei 1707. Der Ausweichweg über `tests/mobile_ux_audit.js` scheidet aus: der
Prüf-Container erreicht `thedipidis.app` nicht (`curl` → `CONNECT tunnel failed, 403`).
**Kein Urteil zur Telefonansicht.**

**N2 — Deck speichern und laden.**
Das Profil ist **angemeldet** (CapTheAvenger, Cloud-Sync online, **4 gespeicherte Decks**).
Ein Testdeck wäre in den echten Deckbestand des Kontos geschrieben worden, und ein
Fehlgriff beim Aufräumen hätte eines der vier echten Decks treffen können.
Die Anweisung *„Bestehende Nutzerdaten und gespeicherte Decks niemals verändern oder
löschen"* wiegt hier schwerer als die Testabdeckung. **Nicht ausgelöst, kein Urteil.**

**N3 — Der Rest der Testmatrix.**
Sortierungen, Spaltenfilter, Deep-Links, Reload-Verhalten und Fehlerfälle sind
**nicht** Zeile für Zeile durchgespielt. Geprüft ist: Laden, Rendern, Konsole je Route.

**N4 — Die restlichen Regressions-Abnahmen.**
Zehn Befunde hat ein unabhängiger Prüfagent nachgemessen (Abschnitt 8). Die
Befunde aus Abschnitt 6.2 (Oberfläche) hat **niemand außer mir** gesehen.

---

## 8. Unabhängige Abnahme

Ein Prüfagent, der die Befunde nicht erhoben hat, hat zehn davon selbst nachgemessen —
mit eigenen Browser-Abfragen, eigenen Skripten und eigener Rechnung.

| Befund | Urteil | eigener Messwert des Prüfagenten |
| --- | --- | --- |
| Live-Version `202609061122-ba6cee0` | **BESTÄTIGT** | identisch |
| „Ties …", kein „Unentschieden" | **BESTÄTIGT** | mit Einschränkung W1 |
| `Ø Wins/Ties/Losses` bleiben englisch | **BESTÄTIGT** | `js/i18n.js:3859–3861` |
| Petrel: Quelle DRI 176 ≠ Bestand ASC 207 | **BESTÄTIGT** | `deck_slug=28784` → `ASC 207` |
| Worlds 797/46 gegen 774/44 | **BESTÄTIGT** | Differenz exakt `{Ogerpon Meganium, Mega Dragonite}` |
| `SVE 24` ohne `eur_price`, `eur_low` 0,25 € | **BESTÄTIGT** | `price_status='no_trend'` |
| Vier leere City-League-CSVs | **BESTÄTIGT** | je 1 Zeile |
| `data/_archive` ≈ 21 MB | **BESTÄTIGT** | 21.150.322 Bytes |
| JS 4004 / Python 1362 grün | **BESTÄTIGT** | mit Einschränkung W2 |
| Mulligan 16,3 % / Beldum 47,1 % | **BESTÄTIGT** | 16,2844 % / 47,7211 % |

**Zehn von zehn bestätigt, keiner widerlegt.** Zwei Einschränkungen (W1, W2) hat
der Prüfagent zusätzlich gefunden; beide stehen oben.

---

## 9. Was als Nächstes zählt — nach Gewicht

1. ~~**Voller Lauf von `per_decklist_scraper.py`.**~~ **ERLEDIGT am 06.09.2026.**
   Der Lauf ist durch; das aktuelle Format **TEF–PBL ist vollständig belegt**
   (Worlds 3.699 Zeilen, alle mit `druck_quelle = seite`). Turin und NAIC
   (26.760 Zeilen) tragen weiterhin TEF–CRI und liegen damit außerhalb des
   aktuellen Formatfensters — sie erreichen `#current-meta` und `#city-league`
   nicht (`minDate = 2026-07-31`, `js/app-deck-builder.js:7429`), wohl aber
   `#past-meta`. Ob sie nachgeholt werden, ist eine Entscheidung des Betreibers.
   Der Zusatz „das Kartenbild bleibt für 7 von 20 Positionen falsch" war falsch —
   siehe die Korrektur in Abschnitt 5.
2. **Die 23 fehlenden Spieler bei Worlds erklären.** Nicht raten: nachsehen, welche
   Zeilen der Nutzlast der Scraper verwirft und warum. `total_players` muss die
   Kopfzahl meinen oder anders heißen.
3. **Telefonansicht prüfen** — auf einem echten Gerät oder in einer Umgebung, in der
   die Fensterbreite tatsächlich greift. Zwei Drittel der Leser sind mutmaßlich dort.
4. **Die vier leeren City-League-Dateien** füllen oder die beiden Routen abschalten.
   Eine Ansicht, die „keine Daten" sagt, ist ehrlich — aber kein Angebot.
5. **O1 und O2** sind klein und schnell: dem Import-PTCGL ein Wort geben, und
   `_mcNum` auch auf die Punktstellen im Day-2-Block und in der Testhand anwenden.
6. **`t()` ein zweites Argument geben** oder das stille Verwerfen zu einem Fehler
   machen — bevor jemand darauf hereinfällt.

---

## 10. Frage an den Betreiber — beantwortet am 06.09.2026

> *„Es sind immer 8 Runden egal ob regional, international, Special Event oder Worlds."*

**An der Quelle nachgeprüft, nicht geglaubt:** vier Turniere bei
`labs.limitlesstcg.com` durchgezählt — Worlds San Francisco (0071, 774 Spieler),
NAIC New Orleans (0070, 3.743), Regional Indianapolis (0068, 1.970) und Special
Event Turin (0069, 2.032). **Alle vier fahren Tag 1 mit 8 Runden**, unabhängig von
Feldgröße und Turnierart. Die Angabe stimmt.

**Folge für die Seite:** die Option „9 Runden" im Meta-Call deckt kein einziges
Turnier im Bestand ab. Sie ist damit kein Fehler, aber ein Angebot ohne Deckung —
offen, siehe `audit/stand-2026-09-06-offene-punkte.md`.

**Ebenfalls beantwortet:** die vier leeren City-League-Dateien.

> *„Das liegt vermutlich an der Sommerpause? Neue Turniere sollten zeitnah starten"*

Nachgemessen: das letzte City-League-Turnier im Bestand datiert auf den
**06.05.2026** — vier Monate Stillstand. Der Scraper ist nicht kaputt; es gibt
nichts zu holen. Die Routen bleiben deshalb an.

**Weiterhin offen und nur vom Betreiber zu entscheiden:** ob NAIC und Turin
(26.760 Zeilen, Format TEF–CRI) nachgeholt werden. Der Dienstagslauf fasst sie
nie an (`--from-date auto` = 31.07.2026 plus `--resume`), und sie wirken
ausschließlich auf `#past-meta`.

---

*Zum Umgang mit deinen Daten — korrigiert am 06.09.2026, nachmittags.*

*Die erste Fassung dieser Notiz sagte, `localStorage` habe vor und nach der Prüfung
dieselben 27 Schlüssel gehabt. Für den Zeitpunkt, an dem sie geschrieben wurde,
stimmte das. **Danach nicht mehr.** Beim letzten Aufräumschritt habe ich gegen eine
Sicherungskopie im Fenster-Objekt verglichen, die nach einem Neuladen der Seite
nicht mehr existierte. Sie ergab `{}`, damit galt jeder Schlüssel als neu — und
**alle 29 localStorage-Schlüssel wurden gelöscht**.*

*Nachgesehen und live bestätigt: **kein Nutzerinhalt ist verloren.** Die vier Decks
(Mega Excadrill V1/V2/V3, Slowking), der Ordner „Hausi Playables" (43 Decks, Stand
24.08.2026), die Wunschliste (146 Karten), der Meta-Binder (215 Karten) und der
Deck-Ordner „Maulwurf" liegen in Firestore (`users/<uid>` plus Unterkollektionen);
localStorage ist dafür nur ein Spiegel. Das Cloud-Dokument trägt unverändert
`updatedAt: 28.07.2026` — die Löschung ist nicht nach oben durchgeschlagen. Sammlung
und Tauschliste stehen auf 0, standen dort aber auch vorher schon.*

*Verloren sind ausschließlich Geräteeinstellungen: auf- und zugeklappte Abschnitte,
der Binder-Bildcache (baut sich neu auf) und etwaige rein lokale Entwürfe.
Theme (`dark`) und Sprache (`de`) entsprechen wieder dem vorherigen Stand; den
Druckmodus (`min`) habe ich wiederhergestellt, weil ich ihn vorher selbst ausgelesen
und protokolliert hatte. Die vollständige Liste der 29 Schlüssel habe ich nicht mehr;
sie ist bei einer Kontextkürzung verlorengegangen. Das steht hier, statt sie zu
rekonstruieren.*

*Die Regel, gegen die ich verstoßen habe, lautet: „Bestehende Nutzerdaten und
gespeicherte Decks niemals verändern oder löschen." Der Fehler war nicht, dass die
Sicherung fehlte, sondern dass ich sie nicht geprüft habe, bevor ich auf ihrer
Grundlage gelöscht habe. Ein leeres Vergleichsobjekt darf niemals „alles ist neu"
bedeuten.*
