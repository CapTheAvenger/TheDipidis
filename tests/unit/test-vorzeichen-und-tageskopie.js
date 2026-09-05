/**
 * Zwei Zahlen, die nicht sagen konnten, was sie sagen sollten.
 *
 * Beide Befunde stammen aus dem Feature-Review vom 05.09.2026
 * (claude/feature-review-tech-karten-2026-09-05.md im Projekt) und beide
 * haben dieselbe Form: eine Anzeige, die einen Fall behauptet, den sie
 * konstruktionsbedingt nie erreichen kann.
 *
 * ── 1. Das Delta konnte nicht negativ werden ──────────────────────
 *
 * In js/app-current-meta-analysis.js hiess es
 *
 *     const wins = matchups.filter(m => m.result === 'attacker_wins');
 *     if (wins.length === 0) continue;
 *
 * und beim Anwenden
 *
 *     if (!d || d.winsBonus <= 0) return;
 *
 * Zusammen mit dem stets nicht-negativen Kategorienbonus
 * (`Math.min(CAP, matchedCats * 3)`) war das angezeigte Delta damit
 * MATHEMATISCH nie negativ. Die Zweige fuer den fallenden Pfeil (`↓`)
 * und die rote Pille (`wr-neg`) waren toter Code.
 *
 * data/card_capability_interactions.json enthaelt eine Zeile mit
 * `result: 'defender_wins'` und `matchup_value: -3` — der Gegner
 * schaltet unseren Bench-Plan ab. Sie ist nie angekommen. Wer zehn
 * Tech-Karten anheftete, sah eine gruene Pille, auch fuer ein Deck,
 * das gerade seine Suchkarten verloren hatte.
 *
 * ── 2. "Day 1" war eine Kopie von "Overall" ───────────────────────
 *
 * In data/labs_tournament_matchups_TEF-PBL.csv sind alle 769 Paare
 * unter day_filter='day1' byteweise identisch mit denen unter
 * 'overall'; in TEF-CRI ebenso (2.528 von 2.528). Dass 'day1' dort
 * nicht echt sein KANN, zeigt eine Ungleichung: in 238 von 238
 * Paaren, die in allen drei Filtern stehen, gilt
 * day1 + day2 > overall — eine echte Tag-1-Teilmenge kann zusammen
 * mit Tag 2 nicht mehr Spiele haben als das Ganze.
 *
 * Ursache steht im Scraper: das Abfrage-Flag `&d1` wurde geraten
 * ("inferred from the symmetric pattern ... Confirm the d1 pattern
 * when we first see a populated day1 scrape"). `&d2` wurde am
 * 25.05.2026 bestaetigt und wirkt.
 *
 * Die Folge war nicht kosmetisch: die Mischung in app-meta-call.js
 * gewichtet Day-2 mit 0,45 und Day-1 mit 0,35, Overall ist nur
 * Rueckfall. Ist "Day 1" in Wahrheit Overall — und Overall enthaelt
 * die Tag-2-Spiele —, dann zaehlen die Tag-2-Ergebnisse zweimal.
 * Auf jedem Deck, live.
 */

const assert = require('node:assert');
const { describe, it } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const WURZEL = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf-8');

const CMA  = lies('js/app-current-meta-analysis.js');
const CALL = lies('js/app-meta-call.js');
const I18N = lies('js/i18n.js');

function schneide(src, von, bis) {
    const a = src.indexOf(von);
    assert.ok(a > -1, `Schnittanfang nicht gefunden: ${von}`);
    const b = src.indexOf(bis, a);
    assert.ok(b > a, `Schnittende nicht gefunden: ${bis}`);
    return src.slice(a, b + bis.length);
}

describe('Das Delta kann fallen', () => {
    it('die Gegenrichtung wird nicht mehr vor der Rechnung weggeworfen', () => {
        assert.match(CMA, /const verluste = matchups\.filter\(m => m\.result === 'defender_wins'\)/,
            'defender_wins wird nicht mehr gesammelt — dann kann die Zahl '
            + 'wieder nur steigen');
        assert.match(CMA, /if \(wins\.length === 0 && verluste\.length === 0\) continue;/,
            'ein Gegner, gegen den NUR die Gegenrichtung feuert, wird wieder '
            + 'uebersprungen — genau der Fall, den es zu zeigen gilt');
        assert.match(CMA, /for \(const m of wins\.concat\(verluste\)\)/,
            'die Summe laeuft nicht ueber beide Richtungen');
    });

    it('der Deckel gilt in beide Richtungen', () => {
        assert.match(CMA,
            /Math\.max\(-_CAPABILITY_BONUS_CAP,\s*\n?\s*Math\.min\(totalBonus, _CAPABILITY_BONUS_CAP\)\)/,
            'der Deckel klemmt nur nach oben — dann ist ein Minus unbegrenzt, '
            + 'waehrend ein Plus bei 15 endet, und die beiden Richtungen sind '
            + 'nicht mehr vergleichbar');
    });

    it('ein negativer Bonus wird nicht mehr beim Anwenden verworfen', () => {
        assert.doesNotMatch(CMA, /if \(!d \|\| d\.winsBonus <= 0\) return;/,
            'die zweite Haelfte des Fehlers steht wieder da: selbst ein '
            + 'gerechnetes Minus kaeme nicht an');
        assert.match(CMA, /if \(!d \|\| !d\.winsBonus\) return;/,
            'nur die echte Null darf durchfallen — sie aendert ohnehin nichts');
    });

    it('die Rechnung liefert für die bekannte Minus-Zeile wirklich ein Minus', () => {
        /* Kein Mustervergleich, sondern die echte Schleife: der Block wird
           aus der Datei geschnitten und mit einer erfundenen Erkennung
           gefuettert, die genau die Interaktion aus
           data/card_capability_interactions.json nachstellt
           (attack.bench_damage vs. ability.bench_protection, -3). */
        const block = schneide(CMA,
            'const out = new Map();\n            for (const [oppName, matchups] of detected.entries())',
            'winsBonusRaw: totalBonus,\n                });\n            }');
        const fn = new Function('detected', '_CAPABILITY_BONUS_CAP',
            block + '\n return out;');
        const detected = new Map([
            ['Shaymin-Deck', [
                { result: 'defender_wins', interactionTag: 'bench', matchupValue: -3 },
            ]],
            ['Crustle', [
                { result: 'attacker_wins', interactionTag: 'ex', matchupValue: 10 },
                { result: 'defender_wins', interactionTag: 'bench', matchupValue: -3 },
            ]],
            ['Neutral-Deck', [
                { result: 'neutral', interactionTag: 'weak', matchupValue: 2 },
            ]],
        ]);
        const out = fn(detected, 15);

        assert.ok(out.has('Shaymin-Deck'),
            'ein Gegner mit ausschliesslich Gegenrichtung faellt wieder heraus');
        assert.strictEqual(out.get('Shaymin-Deck').winsBonus, -3,
            'die Minus-Zeile kommt nicht als Minus an');
        assert.strictEqual(out.get('Crustle').winsBonus, 7,
            'die Richtungen verrechnen sich nicht gegeneinander (10 - 3 = 7)');
        assert.ok(!out.has('Neutral-Deck'),
            'ein mehrdeutiger Ausgang wird gewertet — "neutral" ist keine Aussage');
    });

    it('der Hinweis nennt den Preis, den die Zahl nicht kennt', () => {
        /* Der wichtigste Satz an dieser Stelle. Ohne ihn liest sich
           "+6,2 pts" wie ein Nettogewinn — und genau daran zerlegt jemand
           seine konsistente Liste. */
        for (const schluessel of ['matchup.userVsVanillaBreakdownKeinPreis',
                                  'matchup.userVsVanillaBreakdownGegen']) {
            const muster = new RegExp(
                "'" + schluessel.replace(/\./g, '\\.') + "':", 'g');
            const treffer = [...I18N.matchAll(muster)];
            assert.strictEqual(treffer.length, 2,
                `${schluessel} steht ${treffer.length}x in i18n.js, erwartet 2 `
                + '(deutsch und englisch)');
        }
        assert.match(CMA, /userVsVanillaBreakdownKeinPreis/,
            'der Hinweis wird nirgends gerendert — dann ist er nur ein '
            + 'Textbaustein, den niemand sieht');
        const de = I18N.match(/'matchup\.userVsVanillaBreakdownKeinPreis':\s*'([^']*)'/g) || [];
        assert.ok(de.some((z) => /Konsistenzpreis|consistency cost/i.test(z)),
            'der Hinweis sagt nicht, WAS fehlt');
    });
});

describe('Eine Day-1-Karte, die nur Overall ist, wird verworfen', () => {
    it('die Prüfung steht im Quelltext und vergleicht die Bilanz, nicht die Quote', () => {
        assert.match(CALL, /const _day1IstKopie = \(d1Map, ovMap\) =>/,
            'die Prüfung auf die Kopie fehlt');
        assert.match(CALL, /a\.games === b\.games[\s\S]{0,200}a\.siege === b\.siege/,
            'verglichen wird nicht die Bilanz — die geglaettete Quote koennte '
            + 'zwei verschiedene Bilanzen auf denselben Wert ziehen');
        assert.match(CALL, /for \(const m of _kopieVonOverall\) delete _majorMatchupMapDay1\[m\]/,
            'die Kopie wird erkannt, aber nicht verworfen');
    });

    it('die Prüfung erkennt eine Kopie und lässt echte Day-1-Daten stehen', () => {
        const block = schneide(CALL,
            'const _day1IstKopie = (d1Map, ovMap) =>',
            'return betroffen;\n          };');
        // Nur den Funktionsausdruck, ohne die Zuweisung davor.
        const ausdruck = block
            .slice(block.indexOf('=') + 1)
            .trim()
            .replace(/;\s*$/, '');
        const fn = new Function('return (' + ausdruck + ');')();

        const paar = (g, s, n, u) => ({ games: g, siege: s, niederlagen: n, unentschieden: u });
        const overall = { 'TEF-PBL': { exca: { alakazam: paar(24, 3, 20, 1), dragapult: paar(56, 22, 26, 8) } } };

        // Fall 1: day1 ist Paar fuer Paar dieselbe Bilanz -> Kopie.
        const kopie = { 'TEF-PBL': { exca: { alakazam: paar(24, 3, 20, 1), dragapult: paar(56, 22, 26, 8) } } };
        assert.deepStrictEqual(fn(kopie, overall), ['TEF-PBL'],
            'die Kopie wird nicht erkannt — dann zaehlen die Tag-2-Spiele doppelt');

        // Fall 2: echte Teilmenge -> bleibt stehen.
        const echt = { 'TEF-PBL': { exca: { alakazam: paar(20, 2, 17, 1), dragapult: paar(52, 21, 23, 8) } } };
        assert.deepStrictEqual(fn(echt, overall), [],
            'echte Day-1-Daten werden verworfen — dann geht Signal verloren');

        // Fall 3: nur ein Paar weicht ab -> KEINE Kopie. Die Prüfung muss
        // streng sein, sonst wirft sie bei einer einzigen Uebereinstimmung
        // eine ganze Karte weg.
        const fast = { 'TEF-PBL': { exca: { alakazam: paar(24, 3, 20, 1), dragapult: paar(52, 21, 23, 8) } } };
        assert.deepStrictEqual(fn(fast, overall), [],
            'schon eine abweichende Paarung muss die Karte retten');

        // Fall 4: leere Karte ist keine Kopie, sondern einfach leer.
        assert.deepStrictEqual(fn({ 'TEF-PBL': {} }, overall), []);
    });

    it('der Grund steht als Kommentar dabei, nicht nur als Code', () => {
        /* Diese Prüfung dreht sich von selbst um, sobald das Flag &d1
           bestaetigt und der Scraper repariert ist. Damit dann jemand
           versteht, warum sie ueberhaupt da war, muss der Befund im
           Quelltext stehen. */
        const block = schneide(CALL, 'DIE DAY-1-KARTE IST MANCHMAL NUR EINE KOPIE', 'const _kopieVonOverall');
        assert.match(block, /769/, 'die gemessene Zahl fehlt');
        assert.match(block, /day1 \+ day2 > overall/,
            'die Ungleichung fehlt, die den Beweis traegt');
        assert.match(block, /&d1/, 'das geratene Flag wird nicht benannt');
        assert.match(block, /0,45|0\.45/, 'das Gewicht fehlt, an dem der Schaden haengt');
    });
});
