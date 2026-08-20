/**
 * "Gegen welches Feld?" — der EV-Rechner.
 *
 * Die Heatmap sagt, wer wen schlaegt. Die Frage davor, die vor jedem
 * Turnier gestellt wird, ist eine andere: was holt MEIN Deck gegen das
 * Feld, so wie es heute aussieht?
 *
 *     EV = Σ_i  w_i · p_i
 *
 * Diese Zusagen halten die Rechnung fest — und vor allem die drei
 * Stellen, an denen sie ehrlich bleiben muss:
 *
 *   1. Fehlende Paarungen werden nicht mit 50 % aufgefuellt. 84 % aller
 *      Deck-Paare haben nie gegeneinander gespielt; wer sie einsetzt,
 *      zieht jedes Ergebnis zur Mitte und nennt das Praezision.
 *   2. Kein Ergebnis ohne Band. Var(EV) = Σ w_i² · Var_i.
 *   3. Die Beitragsspalte summiert sich exakt auf den Abstand des EV
 *      von 50 % — sonst erklaert sie etwas anderes, als oben steht.
 *
 * Vorbild: Metagross-EV (reillycooper.com/metagross-ev, MIT).
 * Uebernommen ist die Rechnung, nicht die Zahl.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripJs = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/.*$/gm, '$1');
const stripCss = s => s.replace(/\/\*[\s\S]*?\*\//g, '');

/* Das Modul haengt sich an document und window. Beides wird hier so
   knapp wie moeglich nachgebaut — der Rechenkern braucht davon nichts,
   und ein volles DOM wuerde die Zusagen nur verstecken. */
function ladeModul(registry) {
    const win = {};
    new Function('window', read('js/matchup-glaettung.js'))(win);
    const zuhoerer = {};
    const doc = {
        readyState: 'complete',
        addEventListener: (t, f) => { zuhoerer[t] = f; },
        getElementById: () => null,
        createElement: () => ({ innerHTML: '', firstElementChild: null }),
    };
    win.window = win;
    win.document = doc;
    win.MutationObserver = function () { return { observe() {}, disconnect() {} }; };
    win.setTimeout = () => 0;
    win.localStorage = {
        _v: {},
        getItem(k) { return this._v[k] === undefined ? null : this._v[k]; },
        setItem(k, v) { this._v[k] = String(v); },
    };
    win.getLang = () => 'de';
    win._matchupRegistry = registry || {};
    new Function('window', 'document', 'localStorage', 'MutationObserver', 'setTimeout',
        read('js/ds-ev-rechner.js'))(win, doc, win.localStorage, win.MutationObserver, win.setTimeout);
    return win;
}

/* Ein kleines, von Hand nachrechenbares Feld. */
function paarung(w, l) {
    return { wins: w, losses: l, record: w + ' - ' + l + ' - 0', total_games: w + l };
}
const REG = {
    'Mein Deck': {
        'A': paarung(60, 40),      // 100 Partien, geglaettet 58,33 %
        'B': paarung(20, 30),      //  50 Partien, geglaettet 42,86 %
        'C': paarung(2, 1),        //   3 Partien, geglaettet 52,17 %  (duenn)
        'Ohne Anteil': paarung(9, 1),
    },
};
const SHARES = {
    'A': { share: 30, count: 300 },
    'B': { share: 10, count: 100 },
    'C': { share: 10, count: 100 },
    'D': { share: 50, count: 500 },   // nie gespielt -> nicht abgedeckt
};

const ROH  = read('js/ds-ev-rechner.js');
const CODE = stripJs(ROH);
const SEC  = stripJs(read('js/ds-sections.js'));
const COMP = stripCss(read('css/components.css'));
const HTML = read('index.html');
const SW   = read('service-worker.js');
const KARTE = stripJs(read('js/app-archetype-card.js'));

describe('EV-Rechner — die Rechnung', () => {
    const win = ladeModul(REG);
    const R = win.DsEvRechner;

    it('gewichtet jede Paarung mit dem Feldanteil des Gegners', () => {
        const r = R.rechne('Mein Deck', SHARES, 'alle');
        // Gewichte ueber die abgedeckten Gegner: 30/50, 10/50, 10/50
        // EV = 0,6·58,3333 + 0,2·42,8571 + 0,2·52,1739 = 54,0062
        assert.ok(Math.abs(r.ev - 54.0062) < 0.001, 'EV war ' + r.ev);
        assert.equal(r.gegner, 3);
    });

    it('fuellt fehlende Paarungen nicht mit 50 % auf', () => {
        const r = R.rechne('Mein Deck', SHARES, 'alle');
        // Deck D ist die Haelfte des Feldes und fehlt. Waere es mit 50 %
        // eingesetzt, laege der EV bei 52,0 statt 54,0 — und die Zahl
        // behauptete eine Vollstaendigkeit, die es nicht gibt.
        assert.ok(!r.zeilen.some(z => z.gegner === 'D'));
        assert.ok(Math.abs(r.ev - 52) > 1.5);
    });

    it('nennt die Abdeckung des echten Feldes, nicht der eigenen Auswahl', () => {
        const r = R.rechne('Mein Deck', SHARES, 'alle');
        // 30 + 10 + 10 von 100 Anteilspunkten.
        assert.ok(Math.abs(r.abdeckung - 50) < 0.001, 'Abdeckung war ' + r.abdeckung);
        // Auch bei 'gleich' bleibt der Bezug das gemessene Feld.
        const g = R.rechne('Mein Deck', SHARES, 'gleich');
        assert.ok(Math.abs(g.abdeckung - 50) < 0.001);
    });

    it('die Beitragsspalte summiert sich exakt auf den Abstand von 50 %', () => {
        // Sonst erklaert die Tabelle etwas anderes, als die Kachel zeigt.
        for (const feld of ['alle', 'top8', 'gleich']) {
            const r = R.rechne('Mein Deck', SHARES, feld);
            const summe = r.zeilen.reduce((s, z) => s + z.beitrag, 0);
            assert.ok(Math.abs(summe - (r.ev - 50)) < 1e-9,
                feld + ': Summe ' + summe + ' vs. ' + (r.ev - 50));
        }
    });

    it('die Gewichte summieren sich auf eins', () => {
        for (const feld of ['alle', 'top8', 'gleich']) {
            const r = R.rechne('Mein Deck', SHARES, feld);
            const s = r.zeilen.reduce((a, z) => a + z.gewicht, 0);
            assert.ok(Math.abs(s - 1) < 1e-9, feld + ': ' + s);
        }
    });

    it('"jedes Deck gleich oft" nimmt auch Gegner ohne Feldanteil mit', () => {
        const g = R.rechne('Mein Deck', SHARES, 'gleich');
        assert.equal(g.gegner, 4);
        assert.ok(g.zeilen.some(z => z.gegner === 'Ohne Anteil'));
        const a = R.rechne('Mein Deck', SHARES, 'alle');
        assert.ok(!a.zeilen.some(z => z.gegner === 'Ohne Anteil'),
            'im gemessenen Feld hat ein Deck ohne Anteil kein Gewicht');
    });

    it('das Band ist nie negativ, nie ueber 100 und schliesst den EV ein', () => {
        const r = R.rechne('Mein Deck', SHARES, 'alle');
        assert.ok(r.sd > 0);
        assert.ok(r.unten >= 0 && r.oben <= 100);
        assert.ok(r.unten < r.ev && r.ev < r.oben);
    });

    it('duenne Paarungen machen das Band breiter, nicht die Zahl lauter', () => {
        const duenn = { 'X': { 'A': paarung(2, 1) } };
        const dick  = { 'X': { 'A': paarung(200, 100) } };
        const sh = { 'A': { share: 100, count: 1 } };
        const rd = ladeModul(duenn).DsEvRechner.rechne('X', sh, 'alle');
        const rk = ladeModul(dick).DsEvRechner.rechne('X', sh, 'alle');
        assert.ok(rd.sd > rk.sd * 3, 'sd duenn ' + rd.sd + ' vs. dick ' + rk.sd);
        // Und die geglaettete Zahl selbst bleibt bescheiden.
        assert.ok(rd.ev < 55, 'ein 2-1 darf nicht als 67 % durchgehen: ' + rd.ev);
    });

    it('zaehlt die duennen Paarungen, statt sie zu verschweigen', () => {
        const r = R.rechne('Mein Deck', SHARES, 'alle');
        assert.equal(r.duenn, 1, 'C hat 3 Partien');
        assert.equal(r.partien, 153);
    });

    it('findet das Deck auch bei anderer Gross-/Kleinschreibung', () => {
        // Die Tier-Liste kleinschreibt ihre Decknamen.
        assert.ok(R.rechne('mein deck', SHARES, 'alle'));
    });

    it('gibt null zurueck statt NaN, wenn es nichts zu rechnen gibt', () => {
        assert.equal(R.rechne('Gibt es nicht', SHARES, 'alle'), null);
        assert.equal(R.rechne('Mein Deck', {}, 'alle'), null);
    });

    it('benutzt die eine Glaettung, nicht eine zweite Kopie der Formel', () => {
        // Zwei Deklarationen derselben Rechnung laufen auseinander,
        // sobald eine angefasst wird — das ist in diesem Projekt schon
        // fuenfmal passiert.
        assert.match(CODE, /DsGlaettung/);
        assert.doesNotMatch(CODE, /k\s*\/\s*2/, 'die Formel steht nur in matchup-glaettung.js');
        const r = R.rechne('Mein Deck', SHARES, 'alle');
        const G = win.DsGlaettung;
        const a = r.zeilen.find(z => z.gegner === 'A');
        assert.equal(a.quote, G.quote(60, 40));
        assert.equal(a.varianz, G.varianz(60, 40));
    });
});

describe('EV-Rechner — Einbau', () => {
    it('ist ein eigener Abschnitt, aber nicht vor der Eingangsantwort', () => {
        const block = /var SECTIONS = \[([\s\S]*?)\n    \];/.exec(SEC)[1];
        const ids = [...block.matchAll(/id:\s*'([^']+)'/g)].map(m => m[1]);
        assert.ok(ids.includes('ev'), 'Abschnitte: ' + ids.join(', '));
        assert.ok(ids.indexOf('ev') >= 3, 'die ersten drei bleiben die Eingangsantwort');
        assert.match(block, /nimm: \['div\.ds-ev-block'\]/);
    });

    it('faengt zugeklappt an', () => {
        const zeile = /\{ id: 'ev',[\s\S]*?\},/.exec(SEC)[0];
        assert.match(zeile, /auf: false/);
    });

    it('steht im Offline-Vorrat und wird geladen', () => {
        assert.match(SW, /'\.\/js\/ds-ev-rechner\.js'/);
        assert.match(HTML, /js\/ds-ev-rechner\.js/);
    });

    it('wird nach der Karte geladen, von der es die Feldanteile bekommt', () => {
        const iKarte = HTML.indexOf('js/app-archetype-card.js');
        const iEv    = HTML.indexOf('js/ds-ev-rechner.js');
        assert.ok(iKarte > -1 && iEv > iKarte, 'braucht getArchetypeShares()');
        assert.match(KARTE, /window\.getArchetypeShares\s*=/);
    });

    it('liest die Feldanteile nicht selbst aus der CSV', () => {
        // Eine zweite Lesestelle fuer dieselbe Datei ist eine zweite
        // Zahl fuer dieselbe Sache, sobald eine davon angefasst wird.
        assert.doesNotMatch(CODE, /limitless_online_decks\.csv|fetch\(/);
        assert.match(CODE, /getArchetypeShares/);
    });
});

describe('EV-Rechner — gebaut aus den Bausteinen', () => {
    it('bringt keine eigene CSS-Klasse fuers Aussehen mit', () => {
        // Die Abnahmebedingung von css/components.css: ein neuer Screen
        // ohne eine einzige neue Sonderregel. Was fehlte, war die
        // Bedienzeile — die ist jetzt Baustein, nicht Sonderfall.
        for (const k of ['ds-panel', 'ds-label', 'ds-note', 'ds-stat-row',
                         'ds-stat', 'ds-table', 'ds-bar-track', 'ds-controls',
                         'ds-field', 'ds-select', 'ds-number']) {
            assert.ok(CODE.includes(k), 'benutzt ' + k + ' nicht');
        }
        // ds-ev-* nur als Griff fuer den Code, nie mit einer Regel dahinter.
        const griffe = [...new Set((CODE.match(/ds-ev-[a-z]+/g) || []))];
        for (const g of griffe) {
            assert.ok(!COMP.includes('.' + g),
                g + ' hat eine CSS-Regel — dann ist es kein Griff mehr');
        }
    });

    it('die Bedienzeile steht in components.css und ist aus Tokens gebaut', () => {
        for (const k of ['.ds-controls', '.ds-field', '.ds-select', '.ds-number']) {
            assert.ok(COMP.includes(k), k + ' fehlt in components.css');
        }
        const ab = COMP.indexOf('.ds-controls');
        const block = COMP.slice(ab);
        assert.deepEqual(block.match(/#[0-9a-fA-F]{3,8}\b/g) || [], []);
        assert.equal((block.match(/!important/g) || []).length, 0);
    });

    it('nennt den Datenraum und die Herkunft der Methode', () => {
        // Ein Bild ohne Datenraum war der teuerste Befund des Audits.
        assert.match(CODE, /Global\/EN/);
        assert.match(CODE, /Limitless Online/);
        assert.match(ROH, /metagross-ev/i);   /* im Kopfkommentar, mit Lizenz */
        assert.match(ROH, /MIT/);
    });

    it('sagt in der Fussnote, dass fehlende Paarungen weggelassen werden', () => {
        assert.match(CODE, /nicht mit 50 % aufgefüllt|not filled in at 50 %/);
        assert.match(CODE, /Abdeckung|coverage/);
    });

    it('kommt ohne Ausrufezeichen und ohne rohe Farbe aus', () => {
        assert.equal((CODE.match(/!important/g) || []).length, 0);
        assert.deepEqual(CODE.match(/#[0-9a-fA-F]{6}\b/g) || [], []);
    });
});

describe('EV-Rechner — der Block kommt wieder, wenn er weggeraeumt wird', () => {
    it('merkt sich nicht "war schon mal da", sondern sieht in den Baum', () => {
        // app-meta-cards.js ersetzt den Inhalt der Meta-Ansicht
        // gelegentlich vollstaendig ueber innerHTML. Eine Merkvariable
        // "gebaut" haette den Abschnitt danach fuer den Rest der Sitzung
        // leer gelassen — genau die Klasse Fehler, die dieses Projekt
        // schon fuenfmal gekostet hat.
        assert.doesNotMatch(CODE, /_gebaut/);
        assert.match(CODE, /if \(host\.querySelector\('\.' \+ BLOCK\)\) return Promise\.resolve\(false\);/);
        // Und trotzdem nie zweimal gleichzeitig.
        assert.match(CODE, /if \(_baut\) return Promise\.resolve\(false\);/);
    });

    it('prueft nach dem await noch einmal, ob inzwischen jemand gebaut hat', () => {
        const nachAwait = CODE.slice(CODE.indexOf('getArchetypeShares().then'));
        assert.match(nachAwait, /host\.querySelector\('\.' \+ BLOCK\)/);
    });

    it('haengt sich an den Sprachwechsel und laesst keinen zweiten Block stehen', () => {
        assert.match(CODE, /languageChanged/);
        assert.match(CODE, /alt\.remove\(\)/);
    });
});
