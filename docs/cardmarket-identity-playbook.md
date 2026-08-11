# Cardmarket-Produktzuordnung: was wir gelernt haben

Weitergabe an `Suuntory-Han/tcg-exclusive-radar` (und jeden, der Cardmarket-Preise
pro Druck anzeigt). Stand: 2026-08-11. Alle Zahlen sind auf echten Daten gemessen,
nicht geschätzt.

## Das Problem in einem Satz

Mehrere Cardmarket-Produkte teilen sich Name **und** `idMetacard` innerhalb einer
Expansion (die vier *Charizard ex* in OBF, die vier *Mega Darkrai ex* in PBL). Der
Katalog-Dump enthält keine Sammlernummer. Wer die Paarung *Kartennummer ↔ idProduct*
über die Preisreihenfolge herstellt, rät — und liegt bei genau den teuren Karten
falsch.

**Belegt:** Am 04.06.2026 hat ein Commit unsere Paarung OBF 223 ↔ 228 vertauscht.
Die Preisbänder in der Historie tauschen exakt an diesem Commit (71–118 € ↔ 25–49 €).
Über den gesamten Bestand waren es **812 vertauschte Karten**, die schlimmsten um
Faktor 10–40 daneben: PFL Mega Charizard X 125/130 (281 € ↔ 982 €), ASC Pikachu ex
276/277 (294 € ↔ 939 €), DRI Ethan's Ho-Oh 231/240 (55 € ↔ 584 €).

**Warum es niemand meldet:** Ein falscher Preis sieht richtig aus. Nur wer die
verlinkte Cardmarket-Seite daneben legt, merkt es.

## Regel 1: Nie über Namen joinen, auch nicht „mit Zusatzbedingung"

Das gilt auch für scheinbar harmlose Varianten:

* Kartennummer-Rang ↔ Preis-Rang: **kaputt** (siehe oben).
* Set-Name → URL-Slug: **kaputt**. Unsere `cm_expansions.csv` führt idExpansion 5241
  als „World Championships 2023 Paradise Resort Full Set", während Cardmarket und
  jeder Katalog sie „SV Black Star Promos" nennen. Ein Namens-Join hat dort still
  *nichts* zugeordnet.
* Die `-V1-`/`-V2-`-Marker im Cardmarket-URL-Slug: **kaputt als Sortierung**.
  Gegenbeispiel 151 Bulbasaur — V-Reihenfolge ≠ idProduct-Reihenfolge.

Join ausschließlich auf `(set, number)` oder `idProduct`.

## Regel 2: Wenn die Kennzahl volatil ist, entscheidet sie falsch

Wir haben zuerst `trend` als Vergleichswert genommen. Ergebnis: N's Darmanitan
SVP 181 galt als „nicht entscheidbar", weil die beiden Kandidaten am Stichtag
14,64 € vs 13,59 € standen — **7,7 % auseinander**. Ursache: ein einziger
101-€-Verkauf hatte einen Trend verzerrt (`avg1 = 101`).

Am selben Tag standen ihre **30-Tage-Mittel** bei 14,77 € vs 27,03 € —
**Faktor 1,83**, glasklar.

→ **`avg30` zuerst**, dann `avg7`, dann `trend`/`avg` als Notnagel für zu neue
Produkte. Besser noch: mehrere Kennzahlen prüfen und nur akzeptieren, wenn keine
zweite Kennzahl ein *anderes* Produkt eindeutig wählt (Widerspruch ⇒ unverifiziert
lassen). Das allein hat bei uns 266 vorher unentscheidbare Karten aufgelöst.

## Regel 3: Identität kommt von außen, nicht aus dem Preis

Der Preis kann eine Zuordnung *stützen*, aber nie *begründen*. Wir nutzen drei
externe Quellen, in dieser Rangfolge:

1. **Manueller Pin** (`data/cardmarket_mapping_manual.csv`) — ein Mensch hat die
   Produktseite geöffnet. Schlägt alles. Widerspricht ein Pin einer automatischen
   Verifikation, wird das *laut geloggt*, nicht stillschweigend aufgelöst.
2. **pokepricelab.com** — siehe unten, die stärkste automatische Quelle.
3. **Limitless-Preis-Fingerprint** — die Limitless-Kartenseite zeigt pro Druck den
   Cardmarket-EUR-Preis; dieser wird gegen die Kandidatenpreise gematcht.
   Strikt: genau *ein* Kandidat innerhalb ±15 %, jeder andere ≥1,4× entfernt,
   sonst „ambiguous". Damit haben wir 5.048 Karten verifiziert.

Cardmarket selbst scheidet als Quelle aus: **403 gegen jede CI-IP**, zweimal
verifiziert, und die `idProduct` steht weder in der URL noch sichtbar auf der Seite.

## Die Fundgrube: pokepricelab.com

Geprüft am 09.08.2026 (Sonde, nur lesend):

* `robots.txt`: **keine einzige Disallow-Regel**, Sitemap deklariert, und
  `User-agent: anthropic-ai → Allow: /`. Content-Signale: `search=yes`,
  `ai-input=yes`, `ai-train=no` (kein KI-Training — nutzen wir auch nicht).
* **Jede Katalogseite enthält die `idProduct`** in einem Cardmarket-Link. Bei
  Geschwister-Produkten zusätzlich im URL-Slug: `…-n-s-darmanitan-181-eu-817772`.
* **Sitemap**: 271 Unter-Sitemaps à ~1.000 URLs, 5 Sprachen (neutral/de/fr/es/it).
  Nur ~5–8 % der URLs tragen das `-eu-<id>`-Suffix — das sind genau die
  Zweit-Produkte, also unser Mehrdeutigkeitsfall.
* **Gegenprobe bestanden**: ihre IDs für OBF 223 → 725303 und 228 → 725308 sind
  exakt unsere korrigierten Werte. Unabhängige Bestätigung von 812 Korrekturen.
* Zusätzlich auf der Seite: verkaufte Basis (letzter Wert, Ø 1/7/30 T),
  Listings (tief/Ø/hoch) und **Population** — also *tatsächliche Verkäufe* statt
  nur Angebotspreise.

### Wie man daraus eine Zuordnung baut, ohne zu crawlen

1. Sitemap lesen (271 Requests, gepaced) — **keine** Kartenseiten.
2. Slug-Baustein → Set-Code **beweisbasiert** ableiten: Jede URL mit `-eu-<id>`
   verrät über die idProduct die idExpansion, und die kennt man aus den eigenen
   bereits sicheren Zuordnungen. Jede solche URL ist eine Stimme. Beansprucht ein
   Baustein zwei Expansions → verwerfen, nicht splitten.
3. Diese Karten-Stimmen zur **Set-Ebene** hochfalten (Bausteine, die ≥2 Karten
   desselben Codes teilen und kein anderer Code) — damit werden auch Karten ohne
   Zweitprodukt erfasst.
4. Erst jetzt die Seiten der **problematischen** Karten abrufen (bei uns ~1.560
   statt 50.000+) und die idProduct auslesen.
5. Ergebnis als *zweite* Quelle verrechnen: Übereinstimmung mit der eigenen
   Verifikation ⇒ verifiziert. Widerspruch ⇒ **beides festhalten und melden**,
   niemals automatisch eine Seite gewinnen lassen.

Fairness: gepaced (~0,6 s), nur die nötigen Seiten, und ihre eigenen berechneten
Statistiken (Population, verkaufte Basis) nicht 1:1 als eigenes Produkt ausspielen.
Zur internen Plausibilisierung sind sie Gold wert.

## Regel 4: Vertrauen ist eine eigene Spalte, nicht Teil des Preises

Wir hatten `price_status` mit Werten wie `ok` / `no_trend` / `trend_below_low`
(„welche Zahl soll ich lesen?"). Die Mapping-Unsicherheit dort mit hineinzupacken
war ein Fehler:

* Zwei Fakten passen nicht in ein Feld. „Welche Zahl" und „richtiges Produkt" sind
  orthogonal.
* Das Flag wurde **innerhalb** des Guide-Zweigs berechnet. An einem Tag mit
  fehlgeschlagenem Preis-Download wären alle Zeilen `stale` geworden — und **jeder
  Unverifiziert-Marker auf der Seite wäre still verschwunden**.

→ Eigene Spalte `mapping_status` (`ok` / `unverified`), **vor** der Verzweigung
berechnet, additiv ans Ende der CSV.

## Regel 5: Lieber „nicht verifiziert" als eine plausible Falschangabe — aber nicht blind

Der Marker gehört **neben** die Zahl, nicht an ihre Stelle. Bei uns war ausgerechnet
die gemeldete Karte unverifiziert *und* korrekt bepreist — Unterdrücken hätte eine
richtige Antwort durch gar keine ersetzt. Von 1.544 unverifizierten Zeilen liegen nur
390 über 5 €; die anderen 1.154 zu leeren kostet mehr Information als es schützt.

Praktisch: `⚠ nicht verifiziert` als Badge mit Erklärtext + Link auf die
Cardmarket-Seite.

**Wichtig fürs Frontend:** Die Erkennung muss **datensatzweit** erfolgen
(`hasMappingStatus = irgendeine Karte hat das Feld`), nicht pro Karte. Sonst
markiert ein alter Service-Worker-Cache ohne das Feld schlagartig *alles* als
unverifiziert.

## Regel 6: Der billigste Preis ist nicht *der* Preis

Unsere Wunschliste zeigte `eur_low` (Cardmarkets billigstes Angebot über **alle**
Zustände, Sprachen, Länder) als Kopfpreis, verlinkte aber die auf DE/EN gefilterte
Seite. Ergebnis: 4,66 € angezeigt, 14,99 € auf der verlinkten Seite. Bei 15.040 von
17.346 Zeilen liegt der Trend ≥ 2× über dem Low — die Summe war systematisch viel zu
niedrig.

→ Kopfpreis = Trend, Low als sekundäre „ab X €"-Zeile. Für Kauf-Alarme („ist es
*jetzt* unter meinem Ziel?") bleibt Low richtig — dann aber überall dieselbe Metrik,
Frontend und Bot byte-identisch.

Nebenbei: „Trend ≥ 2× Low" ist **kein** Fehlersignal. Bei 52 % dieser Zeilen ist Low
exakt 0,02 € (Cardmarkets Mindestpreis für Bulk-Ware). Ein Schwellwert darauf flaggt
87 % des Bestands — reiner Lärm.

## Regel 7: Wächter auf die Fehlerklasse, nicht auf Zeilenzahlen

Eine Vertauschung *innerhalb* eines Sets ändert weder Zeilenzahl noch Set-Coverage.
Unser Guardian sah den 04.06.-Regress strukturell nicht. Was jetzt läuft:

* Baseline-Diff auf die **Anzahl gefüllter Preise** (CRITICAL bei >2 % Rückgang —
  fängt „eine Änderung leert still Preise").
* Verteilung der `match_method`-Werte gegen die Baseline.
* Invariante: **eine idProduct darf nicht zwei Karten gehören**.
* Arbeitsliste: wie viele Zeilen unverifiziert, davon wie viele über 5 €, plus die
  fünf teuersten namentlich — das ist die Reihenfolge zum Abarbeiten.

## Ergänzung zum TCGplayer-Anker

Der Ansatz aus eurem `_variant_reconcile()` (Optimal-Assignment EUR↔USD mit
Konfidenz-Marge) ist eine gute **zweite Achse** — behaltet ihn. Zwei Hinweise aus
unseren Messungen:

* Die EUR/USD-Korrelation ist nicht überall eng genug: DRI 230 steht bei $171,90 vs
  256,06 € (Faktor 1,5). Als alleiniger Entscheider zu locker, als Gegenprobe stark.
* Nehmt auch dort `avg30` statt Tagespreisen, aus demselben Grund wie oben.

Ideal ist die Kombination: pokepricelab liefert die **Identität** (harte Zuordnung),
TCGplayer und Limitless liefern **unabhängige Bestätigung**. Wo zwei Quellen
widersprechen, gewinnt keine — die Karte bleibt markiert, bis ein Mensch draufschaut.

## Checkliste

- [ ] Kein Namens-Join in der Preiskette (`(set, number)` / `idProduct`)
- [ ] `avg30` als primäre Vergleichskennzahl, Konsens über mehrere Kennzahlen
- [ ] Externe Identitätsquelle (pokepricelab-Sitemap + Seiten der Problemkarten)
- [ ] `mapping_status` als eigene Spalte, außerhalb des Preis-Zweigs berechnet
- [ ] Manueller Pin schlägt alles, Widerspruch wird geloggt
- [ ] Marker neben der Zahl, datensatzweite Feature-Erkennung im Frontend
- [ ] Kopfpreis = Trend; Low nur als Zusatz und für Kauf-Alarme
- [ ] Wächter: gefüllte Preise, Methodenverteilung, idProduct-Eindeutigkeit
- [ ] Nichts raten: „nicht entscheidbar" ist ein zulässiges Ergebnis
