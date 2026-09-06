/**
 * Die vier Befunde der Live-Pruefung vom 06.09.2026.
 *
 * Alle vier waren im Browser sichtbar und in keinem Test. Sie haben
 * eines gemeinsam: gruene Suiten haben sie nicht gefunden, weil keine
 * Zusicherung an der Stelle stand, an der ein Mensch hinsieht.
 *
 *   1. Zahlformat  — "16.1 %" ueber "Ties 10,6 %" in derselben Kachel,
 *                    "47.1% Chance" neben "0,66€" in derselben Ansicht.
 *   2. PTCGL       — zwei Knoepfe nebeneinander, beide beschriftet
 *                    "PTCGL". Der eine importiert und ueberschreibt die
 *                    gebaute Liste, der andere exportiert. Unterschieden
 *                    nur ueber ein title-Attribut, das auf dem Telefon
 *                    niemand sieht.
 *   3. Starthand   — der ganze Streifen englisch in der deutschen
 *                    Oberflaeche, ohne data-i18n. Die CI-Pruefung
 *                    "Sprachreinheit" sieht nur data-i18n-Stellen und
 *                    lief deshalb gruen.
 *   4. t()         — nahm nur ein Argument und verwarf ein zweites
 *                    stillschweigend. Ein Pruefagent hat es gefunden,
 *                    nicht ein Nutzer und nicht der Test, der genau so
 *                    aufgerufen hat.
 *
 * Diese Datei prueft, wo es geht, VERHALTEN: t() wird ausgefuehrt, das
 * Zahlformat an echten Werten gemessen. Wo nur Markup existiert (die
 * Knoepfe), prueft sie das Markup — dort IST das Markup das Verhalten.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const I18N  = lies('js/i18n.js');
const MC    = lies('js/app-meta-call.js');
const DRAW  = lies('js/draw-simulator.js');
const FEAT  = lies('js/app-features.js');
const HTML  = lies('index.html');

// ───────────────────────────────────────────────────────────────────
// 1. t() fuellt Platzhalter — und verwirft ein zweites Argument nicht
// ───────────────────────────────────────────────────────────────────
describe('t(): ein zweites Argument darf nicht stillschweigend verfallen', () => {
    /* t() aus der Datei schneiden und mit einer Attrappen-Tabelle
       ausfuehren. Kein Quelltext-Vergleich: die Frage ist, was
       herauskommt, nicht wie es dasteht. */
    function baueT() {
        const a = I18N.indexOf('function t(key, vars) {');
        assert.ok(a >= 0, 't(key, vars) nicht gefunden — nimmt t() wieder nur ein Argument?');
        // bis zur schliessenden Klammer der Funktion
        let tiefe = 0, i = I18N.indexOf('{', a), ende = -1;
        for (; i < I18N.length; i++) {
            if (I18N[i] === '{') tiefe++;
            else if (I18N[i] === '}') { tiefe--; if (tiefe === 0) { ende = i; break; } }
        }
        assert.ok(ende > a, 'Funktionsende nicht gefunden');
        const quelle = I18N.slice(a, ende + 1);
        const fabrik = new Function('translations', 'currentLang', 'I18N_FALLBACK_LANG',
            quelle + '; return t;');
        return fabrik(
            { de: { 'x.mit': 'Ties {q} — gemessen an {n} Partien ({meta})',
                    'x.ohne': 'Ganz ohne Platzhalter' },
              en: { 'x.nurEn': 'English only {q}' } },
            'de', 'en');
    }

    it('ersetzt alle Platzhalter, wenn vars uebergeben wird', () => {
        const t = baueT();
        assert.equal(
            t('x.mit', { q: '10,6 %', n: '2.905', meta: 'TEF-PBL' }),
            'Ties 10,6 % — gemessen an 2.905 Partien (TEF-PBL)');
    });

    it('laesst das Template unangetastet, wenn vars fehlt — wie vorher', () => {
        const t = baueT();
        assert.equal(t('x.mit'), 'Ties {q} — gemessen an {n} Partien ({meta})');
        assert.equal(t('x.ohne'), 'Ganz ohne Platzhalter');
    });

    it('laesst einen unbekannten Platzhalter STEHEN statt undefined zu schreiben', () => {
        const t = baueT();
        // {meta} fehlt in vars. Eine sichtbare Luecke ist besser als ein
        // erfundener Wert — dieselbe Regel wie in der Datenpipeline.
        const s = t('x.mit', { q: '1 %', n: '2' });
        assert.ok(s.includes('{meta}'), `Platzhalter verschluckt: ${s}`);
        assert.ok(!/undefined/.test(s), `undefined in der Ausgabe: ${s}`);
    });

    it('faellt weiter auf Englisch zurueck und zeigt sonst den Schluessel', () => {
        const t = baueT();
        assert.equal(t('x.nurEn', { q: '5 %' }), 'English only 5 %');
        assert.equal(t('gibt.es.nicht'), 'gibt.es.nicht');
    });
});

// ───────────────────────────────────────────────────────────────────
// 2. Zahlformat: keine rohen toFixed mehr im Day-2-Block
// ───────────────────────────────────────────────────────────────────
describe('Day-2-Block: eine Kachel, ein Zahlformat', () => {
    /* Der Block wird als Zeichenkette gebaut; ihn auszufuehren hiesse,
       den halben Meta Call nachzubauen. Geprueft wird deshalb die
       Bauanweisung — und zwar auf die konkreten Variablen, die live
       falsch herauskamen, nicht auf "irgendwo kein toFixed". */
    const stellen = [
        ['Day-2-Prozentwert',        '_mcNum(day2Prob * 100, 1)'],
        ['Schwellenanteil',          '_mcNum(_settings.day2Points / maxPts * 100, 1)'],
        ['Ø Wins',                   '_mcNum(expWin, 1)'],
        ['Ø Ties',                   '_mcNum(expTie, 1)'],
        ['Ø Losses',                 '_mcNum(expLoss, 1)'],
    ];
    for (const [was, ausdruck] of stellen) {
        it(`${was} laeuft ueber _mcNum`, () => {
            assert.ok(MC.includes(ausdruck),
                `${was}: erwartet "${ausdruck}" in js/app-meta-call.js`);
        });
    }

    /* Genau die Zeilen, die live falsch herauskamen — nicht "irgendwo
       kein toFixed". Eine zu breite Sperre schlaegt bei jedem fremden
       Aufrufer an und wird dann entschaerft statt beachtet. */
    const rueckfaelle = [
        'const pct    = (day2Prob * 100).toFixed(1);',
        'const thresholdPct = (_settings.day2Points / maxPts * 100).toFixed(1);',
        '${expWin.toFixed(1)}',
        '${expTie.toFixed(1)}',
        '${expLoss.toFixed(1)}',
    ];
    for (const alt of rueckfaelle) {
        it(`Rueckfallsperre: "${alt}" kommt nicht zurueck`, () => {
            assert.ok(!MC.includes(alt),
                `Rohes toFixed wieder im Day-2-Block: ${alt}. ` +
                'Am 06.09.2026 stand dadurch "16.1 %" ueber "Ties 10,6 %".');
        });
    }

    it('die Farbschwelle im Teilen-Bild rechnet aus der Zahl, nicht aus dem Text', () => {
        /* Beim Umstellen des Zahlformats stand hier parseFloat(pct) —
           und parseFloat('16,1') ist 16. Die Schwelle waere lautlos
           verrutscht. Beim Einbau selbst passiert, hier festgehalten. */
        assert.ok(MC.includes('const pctNum = day2Prob * 100;'),
            'pctNum soll aus der Zahl kommen');
        assert.ok(!MC.includes('parseFloat(pct)'),
            'parseFloat auf einen formatierten Text: bei deutschem Komma ' +
            'schneidet das die Nachkommastelle ab.');
        assert.equal(parseFloat('16,1'), 16,
            'Grundlage des Befunds — falls sich das je aendert, ist die Sperre entbehrlich');
    });

    it('_mcNum setzt im Deutschen das Komma', () => {
        const a = MC.indexOf('function _mcNum(');
        assert.ok(a >= 0, '_mcNum nicht gefunden');
        const quelle = MC.slice(a, MC.indexOf('\n  }', a) + 4);
        const mk = new Function('getLang', quelle + '; return _mcNum;');
        assert.equal(mk(() => 'de')(16.05, 1), '16,1');
        assert.equal(mk(() => 'en')(16.05, 1), '16.1');
    });
});

// ───────────────────────────────────────────────────────────────────
// 3. Kombo-Ergebnis: formatPercent statt String-Verkettung
// ───────────────────────────────────────────────────────────────────
describe('Kombo-Wahrscheinlichkeit: die Zahl traegt das Format der Seite', () => {
    it('das Ergebnis laeuft ueber formatPercent', () => {
        assert.ok(DRAW.includes('window.formatPercent(wert, 1)'),
            'js/draw-simulator.js soll das Kombo-Ergebnis ueber formatPercent schreiben');
    });
    it('Rueckfallsperre: die alte Verkettung kommt nicht zurueck', () => {
        assert.ok(!DRAW.includes('`${chance}% ${de ?'),
            'Am 06.09.2026 stand dadurch "47.1% Chance" neben "0,66€".');
    });
    it('auch die Mulligan-Quote im Zusatz laeuft ueber formatPercent', () => {
        assert.ok(!/\(erg\.mulliganRate \|\| 0\)\.toFixed\(0\)/.test(DRAW),
            'mulliganRate schreibt wieder rohes toFixed');
        assert.ok(DRAW.includes("window.formatPercent(erg.mulliganRate || 0, 0)"),
            'mulliganRate soll ueber formatPercent laufen');
    });
    it('formatPercent haengt im Deutschen ein geschuetztes Leerzeichen an', () => {
        const U = lies('js/app-utils.js');
        const a = U.indexOf('function formatPercent(');
        const quelle = U.slice(a, U.indexOf('\n}', a) + 2);
        const mk = new Function('getLang', quelle + '; return formatPercent;');
        assert.equal(mk(() => 'de')(47.1, 1), '47,1 %');
        assert.equal(mk(() => 'en')(47.1, 1), '47.1%');
        // Kein Wert, keine erfundene Null.
        assert.equal(mk(() => 'de')(null, 1), '');
    });
});

// ───────────────────────────────────────────────────────────────────
// 4. Starthand-Streifen: uebersetzt, aber "Mulligan" bleibt englisch
// ───────────────────────────────────────────────────────────────────
describe('Starthand-Streifen: deutsch, mit einer Ausnahme', () => {
    const schluessel = ['draw.openingHand', 'draw.basicInHand', 'draw.basicInHandTitle',
                        'draw.mulliganLabel', 'draw.mulliganTitle', 'draw.basicsOfCards'];
    for (const k of schluessel) {
        it(`${k} steht in beiden Sprachen`, () => {
            const treffer = I18N.split('\n').filter(z => z.includes(`'${k}':`));
            assert.equal(treffer.length, 2,
                `${k}: erwartet je einen Eintrag in en und de, gefunden ${treffer.length}`);
        });
    }

    it('der Streifen wird nicht mehr fest verdrahtet gebaut', () => {
        for (const rest of ['Opening Hand (7 cards)', 'Basic in hand: $', 'Basics / ${N} cards']) {
            assert.ok(!FEAT.includes(rest),
                `Englischer Rest wieder fest verdrahtet in js/app-features.js: ${rest}`);
        }
    });

    it('"Mulligan" bleibt englisch — Szenesprache, angeordnet am 28.08.2026', () => {
        const zeilen = I18N.split('\n').filter(z => z.includes("'draw.mulliganLabel':"));
        assert.equal(zeilen.length, 2);
        for (const z of zeilen) {
            assert.ok(/Mulligan/.test(z),
                `draw.mulliganLabel eingedeutscht: ${z.trim()} — "Unentschieden ist Tie, ` +
                'Mulligan ist Mulligan". Die Szenesprache bleibt englisch.');
        }
    });

    it('die Prozentwerte im Streifen laufen ueber formatPercent', () => {
        assert.ok(FEAT.includes('window.formatPercent(v * 100, 1)'),
            'Der Starthand-Streifen soll formatPercent benutzen');
        assert.ok(!FEAT.includes('${(probBasic*100).toFixed(1)}%'),
            'Rohes toFixed wieder im Starthand-Streifen');
    });
});

// ───────────────────────────────────────────────────────────────────
// 5. PTCGL: zwei Knoepfe, zwei Beschriftungen
// ───────────────────────────────────────────────────────────────────
describe('PTCGL: Import und Export sind ohne Tooltip zu unterscheiden', () => {
    /* Ein title-Attribut ist auf dem Telefon unsichtbar. Wenn der eine
       Knopf die gebaute Liste UEBERSCHREIBT, darf er nicht genauso
       heissen wie der daneben. */
    const knopfZeilen = HTML.split('\n')
        .filter(z => /onclick="(importFromPTCGL|exportToPTCGL)\(/.test(z));

    it('es gibt drei Paare (cityLeague, currentMeta, pastMeta)', () => {
        assert.equal(knopfZeilen.length, 6,
            `erwartet 6 PTCGL-Knoepfe, gefunden ${knopfZeilen.length}`);
    });

    it('jeder Knopf traegt ein data-i18n auf der Beschriftung', () => {
        for (const z of knopfZeilen) {
            assert.ok(/data-i18n="btn\.(import|export)PTCGL"/.test(z),
                `Knopf ohne data-i18n — bleibt bei Sprachwechsel stehen:\n  ${z.trim()}`);
        }
    });

    it('kein Knopf im Deckbauer heisst nur noch "PTCGL"', () => {
        // Das City-League-Paar traegt data-i18n und wird beim Laden
        // ersetzt; die beiden Deckbauer-Paare standen als nackter Text
        // im Markup und blieben es auch.
        for (const bereich of ['currentMeta', 'pastMeta']) {
            const paar = knopfZeilen.filter(z => z.includes(`('${bereich}')`));
            assert.equal(paar.length, 2, `${bereich}: erwartet 2 Knoepfe`);
            for (const z of paar) {
                const beschriftung = (z.match(/>([^<]*)<\/button>/) || [])[1] || '';
                assert.notEqual(beschriftung.trim(), 'PTCGL',
                    `${bereich}: Knopf heisst wieder nur "PTCGL" — ` +
                    'importieren und exportieren waren am 06.09.2026 nicht zu unterscheiden.');
            }
        }
    });

    it('die beiden Beschriftungen unterscheiden sich je Bereich', () => {
        for (const bereich of ['cityLeague', 'currentMeta', 'pastMeta']) {
            const paar = knopfZeilen.filter(z => z.includes(`('${bereich}')`));
            const keys = paar.map(z => (z.match(/data-i18n="([^"]+)"/) || [])[1]);
            assert.equal(new Set(keys).size, 2,
                `${bereich}: beide Knoepfe zeigen auf denselben Text (${keys.join(', ')})`);
        }
    });

    it('btn.importPTCGL und btn.exportPTCGL sind verschiedene Texte', () => {
        for (const sprache of ['en', 'de']) void sprache;
        const imp = I18N.split('\n').filter(z => z.includes("'btn.importPTCGL':"));
        const exp = I18N.split('\n').filter(z => z.includes("'btn.exportPTCGL':"));
        assert.equal(imp.length, 2);
        assert.equal(exp.length, 2);
        for (let i = 0; i < 2; i++) {
            assert.notEqual(imp[i].split(':').slice(1).join(':').trim(),
                            exp[i].split(':').slice(1).join(':').trim(),
                            'Import und Export tragen denselben Text');
        }
    });
});
