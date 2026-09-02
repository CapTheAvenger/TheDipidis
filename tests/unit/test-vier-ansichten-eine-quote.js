/**
 * Vier Ansichten, eine Quote — und zwar am ERGEBNIS geprueft.
 *
 * VORGESCHICHTE. Der Betreiber am 02.09.2026, vor einer
 * Startseitenkachel und einer Tabellenzeile mit demselben Deck und zwei
 * Zahlen: "zwei Ansichten, dieselbe Zahl, zwei Regeln". Danach ist das
 * dreimal einzeln repariert worden. Bei der dritten Abnahme fand der
 * Pruefer:
 *
 *   - eine VIERTE Ansicht (die Archetyp-Karte), die noch die alte Zahl
 *     zeigte — ueber die 121 Zeilen der Datei wichen 53 Decks ab,
 *   - ein DRITTES, lockereres Tor in der Meta-Performance-Tabelle: es
 *     prueft nur die Summe, nicht jede Zeile. Eine einzige kaputte
 *     Scraper-Zeile haette die Tabelle als einzige auf gezaehlten
 *     Zahlen stehenlassen, waehrend die drei anderen zurueckfallen,
 *   - und zwei Aenderungen am Produktivcode, die das Feature
 *     VOLLSTAENDIG zurueckdrehen und trotzdem alle Zusicherungen der
 *     damaligen Testdatei gruen lassen.
 *
 * Der letzte Punkt ist der wichtigste. Die alte Datei war ein Regex auf
 * den Quelltext: sie band die FORM des Codes fest, nicht sein ERGEBNIS.
 * Wer die zwei Zeilen aendert, in denen die gezaehlten Spalten gelesen
 * werden, dreht die Anzeige zurueck, ohne dass eine einzige Zusicherung
 * faellt.
 *
 * Diese Datei rechnet deshalb. Sie fuehrt das echte Tor aus
 * (window.gezaehlteZeilen), fuettert es mit echten und mit absichtlich
 * kaputten Zeilen, und vergleicht die Ergebnisse aller vier Ansichten
 * miteinander — nicht ihren Wortlaut.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const UTILS = fs.readFileSync(path.join(ROOT, 'js', 'app-utils.js'), 'utf8');
const MC = fs.readFileSync(path.join(ROOT, 'js', 'app-meta-call.js'), 'utf8');
const CSV_PFAD = path.join(ROOT, 'data', 'online_tournament_top8_decks.csv');

/* ── Das ECHTE Tor, aus der echten Datei ─────────────────────────── */
function ladeUtils() {
    const sandbox = {
        console,
        document: { addEventListener() {}, getElementById: () => null, querySelectorAll: () => [] },
        navigator: { language: 'de' },
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        setTimeout, clearTimeout, setInterval, clearInterval,
        fetch: () => Promise.resolve({ ok: false, text: () => Promise.resolve('') }),
        location: { hash: '', href: '', search: '' },
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(UTILS, sandbox);
    assert.equal(typeof sandbox.gezaehlteZeilen, 'function',
        'window.gezaehlteZeilen fehlt — das gemeinsame Tor ist weg');
    assert.equal(typeof sandbox.computeConversionPerformance, 'function');
    return sandbox;
}
const U = ladeUtils();

/* ── Die echte CSV ───────────────────────────────────────────────── */
function csvZeilen() {
    const txt = fs.readFileSync(CSV_PFAD, 'utf8').replace(/^﻿/, '');
    const z = txt.trim().split(/\r?\n/);
    const kopf = z[0].split(';');
    return z.slice(1).map(l => {
        const t = l.split(';');
        const o = {};
        kopf.forEach((k, i) => { o[k] = t[i]; });
        return o;
    });
}
const ZEILEN = csvZeilen();
const zahl = (v) => Number(String(v == null ? '0' : v).replace(',', '.')) || 0;

/* ── Die Rechenwege der vier Ansichten, jeder aus seiner eigenen
 *    Datei nachgebildet — aber nur so weit, wie er sich vom
 *    gemeinsamen Kern unterscheidet. Wo sie denselben Kern benutzen,
 *    wird genau das hier geprueft: dass sie ihn benutzen. */

// 1 + 2 + 4: Eingangsblock, Meta-Performance und Archetyp-Karte gehen
// alle durch gezaehlteZeilen -> computeConversionPerformance.
function quoteUeberKern(rows, deck) {
    const tor = U.gezaehlteZeilen(rows);
    const conv = U.computeConversionPerformance(tor.zeilen);
    const d = conv.decks.find(x => x.name === deck);
    return d && d.brought > 0 ? (d.top8 / d.brought) * 100 : null;
}

// 3: die Intel-Kachel des Meta Calls. Sie baut ihre eigene Ablage
// (_tournamentStats) und liest sie mit _quoteFuerAnzeige.
function schneideFunktion(quelle, name) {
    let start = quelle.indexOf('function ' + name + '(');
    assert.notEqual(start, -1, `${name} ist nicht mehr auffindbar`);
    let tiefe = 0;
    for (let j = quelle.indexOf('{', start); j < quelle.length; j++) {
        if (quelle[j] === '{') tiefe++;
        else if (quelle[j] === '}') { tiefe--; if (tiefe === 0) return quelle.slice(start, j + 1); }
    }
    assert.fail(`${name} hat keine schliessende Klammer`);
}

/* Die Zeilen, mit denen die Kachel ihre Ablage fuellt, werden aus dem
 * Quelltext GEZOGEN und ausgefuehrt — nicht hier nachgeschrieben.
 * Genau daran hing der Fehler, den die Abnahme gefunden hat: die alte
 * Testdatei stellte broughtRoh/top8Roh selbst und merkte deshalb
 * nicht, wenn der Produktivcode sie aus den falschen Spalten fuellte. */
function kachelAblageBauen(rows) {
    const nackt = MC.replace(/\/\*[\s\S]*?\*\//g, '');
    const i = nackt.indexOf('_tournamentStats[normalize(_kanonName(r.deck_name))] = {');
    assert.notEqual(i, -1, 'die Ablage der Kachel ist nicht mehr auffindbar');
    const j = nackt.indexOf('};', i) + 2;
    const zuweisung = nackt.slice(i, j);
    assert.match(zuweisung, /broughtRoh/, 'broughtRoh wird nicht mehr abgelegt');
    assert.match(zuweisung, /top8Roh/, 'top8Roh wird nicht mehr abgelegt');

    const quelle = `
        const _tournamentStats = {};
        const normalize = (x) => String(x || '').toLowerCase().trim();
        const _kanonName = (x) => x;
        const parseEU = (v) => Number(String(v == null ? '0' : v).replace(',', '.')) || 0;
        const broughtSum = rows.reduce((s, r) => s + parseEU(r.total_brought_weighted || '0'), 0) || 1;
        rows.forEach(r => {
            if (!r.deck_name) return;
            const brought = parseEU(r.total_brought_weighted || '0');
            ${zuweisung}
        });
        return _tournamentStats;`;
    return new Function('rows', quelle)(rows);
}

function quoteFuerAnzeigeMit(gezaehlt) {
    return new Function([
        'let _gezaehlteQuote = ' + JSON.stringify(gezaehlt) + ';',
        schneideFunktion(MC, '_quoteFuerAnzeige'),
        'return _quoteFuerAnzeige;',
    ].join('\n'))();
}

function quoteKachel(rows, deck) {
    const ablage = kachelAblageBauen(rows);
    const q = quoteFuerAnzeigeMit(U.gezaehlteZeilen(rows).hatRoh);
    const stats = ablage[String(deck).toLowerCase().trim()];
    return stats ? q(stats) * 100 : null;
}

/* ── Die Pruefungen ──────────────────────────────────────────────── */

describe('das Tor steht an genau einer Stelle', () => {
    it('alle vier Ansichten rufen window.gezaehlteZeilen', () => {
        const dateien = {
            'meta-analysis-hub.js': 'Eingangsblock',
            'app-tier-meta.js': 'Meta-Performance-Tabelle',
            'app-meta-call.js': 'Intel-Kachel',
            'app-archetype-card.js': 'Archetyp-Karte',
        };
        Object.entries(dateien).forEach(([datei, ansicht]) => {
            const src = fs.readFileSync(path.join(ROOT, 'js', datei), 'utf8')
                .replace(/\/\*[\s\S]*?\*\//g, '');
            assert.match(src, /gezaehlteZeilen\s*\(/,
                `${ansicht} (${datei}) benutzt das gemeinsame Tor nicht mehr`);
        });
    });

    it('keine Ansicht baut sich ein eigenes Tor daneben', () => {
        // Die Kennzeichen des alten, kopierten Tors: eine eigene
        // ganzeZahl-Pruefung neben einem every() ueber total_brought.
        ['meta-analysis-hub.js', 'app-tier-meta.js', 'app-archetype-card.js'].forEach(datei => {
            const src = fs.readFileSync(path.join(ROOT, 'js', datei), 'utf8')
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
            assert.doesNotMatch(src, /every\([^)]*total_brought/,
                `${datei} prueft die Zeilen wieder selbst`);
        });
    });
});

describe('vier Ansichten, ein Ergebnis — an den echten Daten', () => {
    const decks = ZEILEN.map(r => r.deck_name).filter(Boolean);

    it('die Datei hat ueberhaupt Zeilen', () => {
        assert.ok(decks.length > 20, `nur ${decks.length} Decks in der CSV`);
    });

    it('Kern und Kachel sagen fuer JEDES Deck dieselbe Quote', () => {
        const ab = [];
        decks.forEach(d => {
            const a = quoteUeberKern(ZEILEN, d);
            const b = quoteKachel(ZEILEN, d);
            if (a == null || b == null) return;
            if (Math.abs(a - b) > 1e-9) ab.push(`${d}: Kern ${a.toFixed(3)} gegen Kachel ${b.toFixed(3)}`);
        });
        assert.deepEqual(ab, [], 'diese Decks zeigen zwei Zahlen:\n  ' + ab.join('\n  '));
    });

    it('und die Zahl ist die gezaehlte, nicht die gewichtete', () => {
        // Sie muessen sich unterscheiden, sonst prueft der Test nichts.
        const anders = ZEILEN.filter(r => {
            const g = zahl(r.top8_count_weighted) / (zahl(r.total_brought_weighted) || 1);
            const z = zahl(r.top8_count) / (zahl(r.total_brought) || 1);
            return Math.abs(g - z) > 0.0005;
        });
        assert.ok(anders.length > 5,
            `nur ${anders.length} Zeilen unterscheiden sich — der Vergleich haette nichts gezeigt`);

        anders.slice(0, 25).forEach(r => {
            const gezeigt = quoteUeberKern(ZEILEN, r.deck_name);
            if (gezeigt == null) return;
            const soll = (zahl(r.top8_count) / zahl(r.total_brought)) * 100;
            assert.ok(Math.abs(gezeigt - soll) < 1e-9,
                `${r.deck_name}: gezeigt ${gezeigt.toFixed(3)}, gezaehlt ${soll.toFixed(3)}`);
        });
    });
});

describe('eine kaputte Zeile schaltet ALLE vier zurueck', () => {
    const kaputt = [
        ['Antritte auf null', (r) => { r.total_brought = '0'; }],
        ['mehr Cuts als Antritte', (r) => { r.top8_count = String(zahl(r.total_brought) + 1); }],
        ['Kommazahl statt Zaehlung', (r) => { r.total_brought = '640,5'; }],
        ['Text statt Zahl', (r) => { r.total_brought = 'abc'; }],
        ['Spalte fehlt', (r) => { delete r.top8_count; }],
    ];

    kaputt.forEach(([name, brich]) => {
        it(`${name}: das Tor faellt zu`, () => {
            const rows = ZEILEN.map(r => Object.assign({}, r));
            brich(rows[3]);
            assert.equal(U.gezaehlteZeilen(rows).hatRoh, false,
                `eine Zeile mit "${name}" kommt durch das Tor`);
        });

        it(`${name}: dann zeigen Kern und Kachel die GEWICHTETE Quote — und zwar beide`, () => {
            const rows = ZEILEN.map(r => Object.assign({}, r));
            brich(rows[3]);
            // Ein Deck, dessen beide Quoten sich unterscheiden.
            const probe = rows.find((r, i) => i !== 3 && Math.abs(
                zahl(r.top8_count_weighted) / (zahl(r.total_brought_weighted) || 1)
                - zahl(r.top8_count) / (zahl(r.total_brought) || 1)) > 0.0005);
            assert.ok(probe, 'kein Deck mit unterschiedlichen Quoten gefunden');
            const gewichtet = (zahl(probe.top8_count_weighted) / zahl(probe.total_brought_weighted)) * 100;
            const kern = quoteUeberKern(rows, probe.deck_name);
            const kachel = quoteKachel(rows, probe.deck_name);
            assert.ok(Math.abs(kern - gewichtet) < 1e-9,
                `Kern zeigt ${kern.toFixed(3)}, erwartet gewichtet ${gewichtet.toFixed(3)}`);
            assert.ok(Math.abs(kachel - gewichtet) < 1e-9,
                `Kachel zeigt ${kachel.toFixed(3)}, erwartet gewichtet ${gewichtet.toFixed(3)}`);
        });
    });

    it('eine leere Datei faellt ebenfalls zurueck, statt durch null zu teilen', () => {
        const t = U.gezaehlteZeilen([]);
        assert.equal(t.hatRoh, false);
        assert.deepEqual(Array.prototype.slice.call(t.zeilen), []);
        assert.equal(U.gezaehlteZeilen(null).hatRoh, false);
    });
});

describe('die Kachel fuellt ihre Ablage aus den GEZAEHLTEN Spalten', () => {
    /* Genau die Zeile, an der der Fehler hing und die die alte
       Testdatei nicht angesehen hat. */
    it('broughtRoh ist total_brought, nicht total_brought_weighted', () => {
        const probe = ZEILEN.find(r => zahl(r.total_brought) !== zahl(r.total_brought_weighted));
        assert.ok(probe, 'in der Datei unterscheiden sich die Spalten nicht');
        const ablage = kachelAblageBauen(ZEILEN);
        const s = ablage[String(probe.deck_name).toLowerCase().trim()];
        assert.ok(s, `${probe.deck_name} fehlt in der Ablage`);
        assert.equal(s.broughtRoh, zahl(probe.total_brought),
            'broughtRoh kommt aus der gewichteten Spalte');
        assert.notEqual(s.broughtRoh, zahl(probe.total_brought_weighted));
    });

    it('top8Roh ist top8_count, nicht top8_count_weighted', () => {
        const probe = ZEILEN.find(r => zahl(r.top8_count) !== zahl(r.top8_count_weighted));
        assert.ok(probe, 'in der Datei unterscheiden sich die Spalten nicht');
        const ablage = kachelAblageBauen(ZEILEN);
        const s = ablage[String(probe.deck_name).toLowerCase().trim()];
        assert.equal(s.top8Roh, zahl(probe.top8_count),
            'top8Roh kommt aus der gewichteten Spalte');
        assert.notEqual(s.top8Roh, zahl(probe.top8_count_weighted));
    });

    it('und die gewichtete Spalte bleibt fuer den Motor erhalten', () => {
        const ablage = kachelAblageBauen(ZEILEN);
        const s = ablage[String(ZEILEN[0].deck_name).toLowerCase().trim()];
        assert.equal(s.top8Conv, zahl(ZEILEN[0].top8_conv_rate),
            'der Motor liest jetzt etwas anderes als top8_conv_rate');
    });
});
