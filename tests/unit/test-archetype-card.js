/**
 * The archetype card — one deck, three headline numbers, all matchups.
 *
 * The properties that matter here are the ones that make a wrong number
 * look right:
 *
 *  - the conversion figure must be the SAME as the Global-EN panel's.
 *    Two implementations of one metric is how a page ends up showing a
 *    deck at +81 % in one place and +74 % in another, so the function
 *    lives in app-utils.js and both surfaces call it. Asserted below
 *    against one fixture through both paths.
 *  - a deck missing from the top-cut file must read "not enough data",
 *    never 0 %. A silent zero says "never converts", which is the
 *    opposite of "we have no data".
 *  - matchups under 20 games must be marked. 8 wins in 12 games is
 *    66 % and means almost nothing.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const CARD_SRC = fs.readFileSync(path.join(ROOT, 'js', 'app-archetype-card.js'), 'utf8');
const UTILS = fs.readFileSync(path.join(ROOT, 'js', 'app-utils.js'), 'utf8');
const TIER = fs.readFileSync(path.join(ROOT, 'js', 'app-tier-meta.js'), 'utf8');
const I18N = fs.readFileSync(path.join(ROOT, 'js', 'i18n.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'css', 'styles.css'), 'utf8');
const TOKENS = fs.readFileSync(path.join(ROOT, 'css', 'tokens.css'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function utilsChunk(re, what) {
    const m = UTILS.match(re);
    if (!m) throw new Error('could not extract ' + what);
    return m[0];
}

const CONV_SRC =
    utilsChunk(/function parseLocaleNumber\(input, fallback = 0\) \{[\s\S]*?\n\}/, 'parseLocaleNumber') + '\n' +
    utilsChunk(/const CONV_PRIOR = 50;[\s\S]*?\nfunction computeConversionPerformance\(rows\) \{[\s\S]*?\n\}\n/, 'compute');

// Minimal DOM stand-ins: the module only needs addEventListener at load.
function loadCard(lang = 'de') {
    const listeners = {};
    const sandbox = {
        console,
        document: {
            addEventListener: (k, fn) => { listeners[k] = fn; },
            getElementById: () => null,
            createElement: () => ({ classList: { add() {}, remove() {} }, addEventListener() {} }),
            body: { classList: { add() {}, remove() {} }, appendChild() {} },
        },
        getLang: () => lang,
        t: (k) => k,                     // unresolved -> inline fallback
        fetch: () => Promise.resolve({ ok: false, text: () => Promise.resolve('') }),
        BASE_PATH: 'data/',
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(CONV_SRC, sandbox);
    vm.runInContext(CARD_SRC, sandbox);
    return { api: sandbox._archetypeCardInternals, win: sandbox, listeners };
}

const t8row = (name, brought, top8) => ({
    deck_name: name,
    total_brought_weighted: String(brought),
    top8_count_weighted: String(top8),
});

describe('the card and the panel cannot disagree', () => {
    it('both read the same shared function', () => {
        // If either surface grows its own copy, this is where it shows.
        assert.match(UTILS, /window\.computeConversionPerformance = computeConversionPerformance/);
        assert.doesNotMatch(TIER, /function computeConversionPerformance/,
            'app-tier-meta.js has its own implementation again');
        assert.doesNotMatch(CARD_SRC, /function computeConversionPerformance/,
            'the card has its own implementation');
        assert.match(CARD_SRC, /window\.computeConversionPerformance/);
    });

    it('produce the same number for one fixture', () => {
        const { api, win } = loadCard();
        const rows = [t8row('field', 100000, 6320), t8row('Dragapult', 472.5, 56.5)];
        const conv = win.computeConversionPerformance(rows);
        const fromMetric = conv.decks.find(d => d.name === 'Dragapult').perfPct;

        api.setData({ Dragapult: { share: 6, winRate: 54, count: 400 } }, conv);
        const html = api.tilesHtml('Dragapult');
        const shown = html.match(/arc-tile--conv[\s\S]*?arc-tile-value">(?:<span[^>]*>[^<]*<\/span>)?([^<]+)</)[1];
        const expected = `+${fromMetric.toFixed(1).replace('.', ',')} %`;
        assert.equal(shown.trim(), expected);
    });

    it('names the population the Top-8 quota is taken from', () => {
        // Der Betreiber hat gefragt, was "79/755" neben "2.158 Listen"
        // bedeutet. Die Antwort ist: eine andere Grundgesamtheit — nur
        // Turniere mit gewertetem Top-8-Schnitt. Die Kachel muss das
        // selbst sagen, sonst sieht es aus wie ein Widerspruch.
        const { api, win } = loadCard();
        const conv = win.computeConversionPerformance(
            [t8row('field', 100000, 6320), t8row('Dragapult', 472.5, 56.5)]);
        api.setData({ Dragapult: { share: 6, winRate: 54, count: 2158, partien: 8000 } }, conv);
        const kachel = api.tilesHtml('Dragapult').match(/arc-tile--conv[\s\S]*$/)[0];
        /* NACHTRAG (Schlussabnahme 30.08.2026): hier stand
           "57 von 473". Die Datei fuehrt 56,5 von 472,5 — Antritte sind
           turniergewichtet, halbe Werte sind normal. Gerundet gedruckt
           ergibt 57/473 = 12,05 %, danebengeschrieben stand aber die
           Quote aus den ungerundeten Werten: 11,96 %. Der Satz war aus
           seinen eigenen Zahlen nicht nachrechenbar, und dieser Test
           hat genau das festgehalten.
           Die Startseite zeigte fuer denselben Wert schon
           "71,5 von 708" — zwei Ansichten, zwei Schreibweisen. */
        assert.match(kachel, /56,5 von 472,5 Antritten mit Top-8-Schnitt/,
            'Zaehler und Nenner der Cut-Quote stehen nicht in der Kachel');
        assert.match(kachel, /11,96 % Cut-Quote/,
            'die Cut-Quote selbst fehlt — dann bleibt "+x %" unerklaert');
        // Und die Probe: die Quote folgt aus den beiden Zahlen davor.
        assert.equal((56.5 / 472.5 * 100).toFixed(2), '11.96');
    });
});

describe('missing conversion data is said out loud', () => {
    const { api } = loadCard();

    it('shows "zu wenig Daten" instead of 0 %', () => {
        api.setData({ Dhelmise: { share: 4.45, winRate: 48.2, count: 900 } },
                    { expected: 0.0632, decks: [] });
        const html = api.tilesHtml('Dhelmise');
        assert.match(html, /zu wenig Daten/);
        assert.doesNotMatch(html.match(/arc-tile--conv[\s\S]*$/)[0], /0,0 %|>0 %/);
    });

    it('explains the apparent contradiction in a tooltip', () => {
        // Basic Box sits 3rd on the win-rate card AND has no conversion
        // data — different files, but it reads like a conflict.
        api.setData({ 'Basic Box': { share: 1.33, winRate: 53.78, count: 260 } },
                    { expected: 0.0632, decks: [] });
        const html = api.tilesHtml('Basic Box');
        assert.match(html, /title="[^"]*Top-Cut-Datei[^"]*"/);
        assert.match(html, /andere[nr]? Quelle/);
    });

    it('still shows share and win rate for such a deck', () => {
        api.setData({ Dhelmise: { share: 4.45, winRate: 48.2, count: 900, partien: 3120 } },
                    { expected: 0.0632, decks: [] });
        const html = api.tilesHtml('Dhelmise');
        assert.match(html, /4,5 %/);
        assert.match(html, /48,2 %/);
        // Frueher stand hier der Abstand zu 50 % ("−1,80"). Der Betreiber hat
        // ihn zu Recht als doppelt gemoppelt gemeldet: wer 48,2 % liest, weiss
        // selbst, dass das unter 50 liegt. Die Zeile sagt jetzt, worauf die
        // Quote beruht — das ist die Angabe, die man NICHT im Kopf hat.
        assert.match(html, /3\.120/, 'die Partienzahl traegt die Aussagekraft');
        assert.ok(!/gegenüber 50/.test(html), 'der Abstand zu 50 % ist wieder da');
        assert.match(html, /▼/, 'a below-50 win rate should carry a down arrow');
    });
});

describe('matchups', () => {
    const { api, win } = loadCard();
    win._matchupRegistry = {
        Dragapult: {
            'Mega Excadrill': { opponent_deck: 'Mega Excadrill', win_rate_numeric: 61.81,
                                record: '267 - 165 - 6', total_games: 438 },
            Slowking: { opponent_deck: 'Slowking', win_rate_numeric: 66.7,
                        record: '8 - 4 - 0', total_games: 12 },
            Toucannon: { opponent_deck: 'Toucannon', win_rate_numeric: 42.5,
                         record: '51 - 69 - 0', total_games: 120 },
        },
    };

    it('sorts by win rate, descending', () => {
        const rows = api.matchupsFor('Dragapult');
        // Joined rather than deepEqual: the array is created inside the vm
        // context, so its prototype is a different realm's Array and
        // deepStrictEqual rejects it on identity alone.
        assert.equal(rows.map(r => r.opponent).join(' | '),
            'Slowking | Mega Excadrill | Toucannon');
    });

    it('splits wins and losses out of the record string', () => {
        const m = api.matchupsFor('Dragapult').find(r => r.opponent === 'Mega Excadrill');
        assert.equal(m.wins, 267);
        assert.equal(m.losses, 165);
        assert.equal(m.games, 438);
    });

    it('marks anything under 20 games as thin', () => {
        const rows = api.matchupsFor('Dragapult');
        assert.equal(rows.find(r => r.opponent === 'Slowking').thin, true);
        assert.equal(rows.find(r => r.opponent === 'Toucannon').thin, false);
        assert.equal(api.THIN_GAMES, 20);
    });

    it('names the columns and marks the thin row', () => {
        // Die Spalte hiess Σ. Gemeldet am 19.08.2026: "n ist gleich sagt nichts
        // aus … es muss fuer jeden von der Strasse klar sein." Dasselbe gilt
        // fuer ein Summenzeichen ueber einer Zahlenspalte. W und L bleiben —
        // die sagt die Szene wirklich so.
        const html = api.matchupTableHtml('Dragapult');
        assert.match(html, />Matches</, 'die Matchspalte heisst nicht mehr Σ');
        assert.ok(!/<th[^>]*>Σ<\/th>/.test(html), 'Σ ist zurueck');
        assert.match(html, /title="[^"]*gewonnene Matches[^"]*">W</);
        assert.match(html, /title="[^"]*verlorene Matches[^"]*">L</);
        assert.match(html, /arc-mu-n-low/, 'the thin sample size should be marked');
        assert.match(html, />438</);
        assert.match(html, />267</);
        assert.match(html, />165</);
    });

    it('shades in four quantised steps, never an interpolated ramp', () => {
        // A ramp always produces some middle shade the number vanishes
        // into; four steps keep every contrast known up front.
        assert.equal(api.shadeFor(0, false), '');
        assert.equal(api.shadeFor(5, false), 'arc-mu-up-1');
        assert.equal(api.shadeFor(10, false), 'arc-mu-up-2');
        assert.equal(api.shadeFor(20, false), 'arc-mu-up-3');
        assert.equal(api.shadeFor(-20, false), 'arc-mu-down-3');
        // A thin sample never gets a loud colour.
        assert.equal(api.shadeFor(20, true), 'arc-mu-up-1');
    });

    it('uses blue and red, never green', () => {
        const html = api.matchupTableHtml('Dragapult');
        assert.match(html, /arc-mu-up-/, 'above 50 % should be blue');
        assert.match(html, /arc-mu-down-/, 'below 50 % should be red');
        const block = CSS.slice(CSS.indexOf('.arc-mu-up-1'), CSS.indexOf('.arc-mu-opp'));
        assert.match(block, /106, 168, 255/, 'the positive tint is --dv-pos');
        assert.match(block, /255, 143, 122/, 'the negative tint is --dv-neg');
        assert.doesNotMatch(block, /#16a34a|#27ae60|green/i);
    });

    it('draws a diverging bar from the middle of the cell', () => {
        // Die Richtung muss ohne jede Farbwahrnehmung lesbar sein. Die
        // Toenung sagt dasselbe noch einmal — aber nur noch einmal.
        assert.equal(api.barFor(0).cls, '');
        assert.equal(api.barFor(0).pct, 0);
        assert.equal(api.barFor(12.5).cls, 'arc-mu-wr-up');
        assert.equal(api.barFor(12.5).pct, 25);
        assert.equal(api.barFor(-12.5).cls, 'arc-mu-wr-down');
        // Ueber der Skalengrenze laeuft der Balken nicht aus der Zelle.
        assert.equal(api.barFor(80).pct, 50);
        assert.equal(api.barFor(-80).pct, 50);

        const html = api.matchupTableHtml('Dragapult');
        assert.match(html, /--arc-bar:[0-9.]+%/, 'the width reaches the cell');
        // Ein Dezimalpunkt, kein Komma: das ist CSS, keine Anzeige.
        assert.doesNotMatch(html, /--arc-bar:[0-9]+,/);
        assert.match(CSS, /\.arc-mu-wr-up::after\s*\{[^}]*left: 50%/);
        assert.match(CSS, /\.arc-mu-wr-down::after\s*\{[^}]*right: 50%/);
    });

    it('says so when a deck has no matchup data at all', () => {
        assert.match(api.matchupTableHtml('Unknown Deck'), /keine Matchup-Daten/);
    });

    it('survives a malformed record without inventing numbers', () => {
        win._matchupRegistry.Broken = {
            X: { opponent_deck: 'X', win_rate_numeric: 50, record: '', total_games: 30 },
        };
        const m = api.matchupsFor('Broken')[0];
        assert.equal(m.wins, null);
        assert.equal(m.losses, null);
        assert.match(api.matchupTableHtml('Broken'), /–/);
    });
});

describe('wiring', () => {
    it('the tier card opens the archetype card', () => {
        assert.match(TIER, /onclick="openArchetypeCard\('\$\{archetypeEscaped\}'\)"/);
    });

    it('the old navigation is still reachable from inside the card', () => {
        // Replacing the click would otherwise have removed the path to
        // the full matchup analysis.
        assert.match(CARD_SRC, /navigateToCurrentMetaWithDeck\(deck\)/);
        assert.match(CARD_SRC, /arc-goto/);
    });

    it('is loaded after the things it needs', () => {
        const at = (f) => HTML.indexOf(`js/${f}?`);
        for (const dep of ['app-utils.js', 'archetype-icons.js']) {
            assert.ok(at(dep) >= 0 && at(dep) < at('app-archetype-card.js'),
                `${dep} must load before the archetype card`);
        }
    });

    it('redraws itself on a language switch', () => {
        assert.match(CARD_SRC, /addEventListener\('languageChanged'/);
    });

    it('escapes deck names into the markup', () => {
        const { api } = loadCard();
        api.setData({ "N's Zoroark": { share: 5, winRate: 51, count: 100 } }, null);
        const html = api.cardHtml("N's Zoroark");
        assert.match(html, /N&#39;s Zoroark/);
        assert.doesNotMatch(html, /aria-label="N's/);
    });
});

describe('strings and styling', () => {
    const { api } = loadCard();

    it('every arc.* key exists in both languages', () => {
        const keys = [...new Set((CARD_SRC.match(/'(arc\.[A-Za-z]+)'/g) || [])
            .map(s => s.slice(1, -1)))];
        assert.ok(keys.length > 10, `only ${keys.length} keys found`);
        for (const k of keys) {
            const n = (I18N.match(new RegExp(`'${k.replace('.', '\\.')}'`, 'g')) || []).length;
            assert.equal(n, 2, `${k} appears ${n}× in i18n.js, expected 2 (en + de)`);
        }
    });

    it('every tone the code can emit has an accent edge defined', () => {
        // Seit dem 20.08.2026 faerbt der Ton die 3 px hohe Oberkante,
        // nicht mehr die Flaeche — so macht es die Bildkarte, und so
        // steht die Zahl immer auf demselben Grund.
        for (const tone of ['neutral', 'tie', 'up', 'up-strong', 'down', 'down-strong']) {
            assert.match(CSS, new RegExp(`\\.arc-tone--${tone}[^{]*\\{[^}]*border-top-color`),
                `no accent edge for tone ${tone}`);
        }
        assert.match(CSS, /\.arc-tile \{[^}]*border-top: 3px solid/);
        assert.match(CSS, /\.arc-tile \{[^}]*background: var\(--arc-s1\)/);
        assert.match(CSS, /\.arc-tile \{[^}]*color: var\(--arc-ink\)/);
    });

    it('the card carries the image palette itself, not the page theme', () => {
        // Die Karte ist eine dunkle Insel auf heller Seite — genau wie
        // das Bild, das die Seite verlaesst. Wuerde sie var(--surface-1)
        // benutzen, verloere sie ihre Farbe, sobald die Seite selbst
        // dunkel schaltet.
        const dark = TOKENS.slice(TOKENS.indexOf(':root[data-theme="dark"]'));
        const card = CSS.slice(CSS.indexOf('.arc-card {'), CSS.indexOf('.arc-card--inline'));
        const paare = [
            ['--arc-s1', '--surface-1'], ['--arc-s2', '--surface-2'],
            ['--arc-bg1', '--surface-0'], ['--arc-line', '--line'],
            ['--arc-line-strong', '--line-strong'],
            ['--arc-ink', '--ink'], ['--arc-ink2', '--ink-2'], ['--arc-ink3', '--ink-3'],
            ['--arc-pos', '--dv-pos'], ['--arc-neg', '--dv-neg'], ['--arc-zero', '--dv-zero'],
            ['--arc-brand', '--brand'], ['--arc-brand-ink', '--brand-ink'],
            ['--arc-gold', '--gold'],
        ];
        for (const [hier, dort] of paare) {
            const a = new RegExp(`${hier}:\\s*(#[0-9a-f]{6})`, 'i').exec(card);
            const b = new RegExp(`${dort}:\\s*(#[0-9a-f]{6})`, 'i').exec(dark);
            assert.ok(a, `${hier} fehlt in .arc-card`);
            assert.ok(b, `${dort} fehlt im Dunkelmodus-Block von tokens.css`);
            assert.equal(a[1].toLowerCase(), b[1].toLowerCase(),
                `${hier} ist von ${dort} abgewichen`);
        }
    });

    it('the tone thresholds match what the CSS defines', () => {
        assert.equal(api.toneFor(0), 'tie');
        assert.equal(api.toneFor(5), 'up');
        assert.equal(api.toneFor(20), 'up-strong');
        assert.equal(api.toneFor(-5), 'down');
        assert.equal(api.toneFor(-20), 'down-strong');
        assert.equal(api.toneFor(null), 'tie');
    });

    it('the disclosure control is a real tap target and does not navigate', () => {
        assert.match(CSS, /\.arc-mu-summary \{[^}]*min-height: 44px/);
        assert.match(CARD_SRC, /arc-mu-summary'\)\) \{ e\.stopPropagation\(\)/);
    });
});

describe('Archetyp-Karte — die Zahl passt in ihre Kachel', () => {
    // Gemessen am 20.08.2026 auf 390, 320 und 1440 px, nachdem der
    // 12-px-Boden aus mobile-responsive.css die Zahl nicht mehr
    // stillschweigend klein hielt: "▲ +59,2 %" stiess um 4 px an und
    // das Prozentzeichen wurde von .arc-card { overflow: hidden }
    // abgeschnitten — auf dem Schreibtisch genauso wie auf dem Telefon.
    it('der Pfeil traegt kein Leerzeichen mehr mit sich', () => {
        // Es steckte im span mit 0,6em und kostete bei 24 px rund 14 px.
        assert.match(CARD_SRC, /v > 0 \? '▲' : '▼'/);
        assert.doesNotMatch(CARD_SRC, /'▲ '/);
        assert.match(CSS, /\.arc-tile-arrow \{[^}]*margin-right: 3px/);
    });

    it('und die Zahl wird auf schmalen Schirmen kleiner statt beschnitten', () => {
        const block = CSS.slice(CSS.indexOf('@media (max-width: 620px)',
            CSS.indexOf('.arc-tile-label')));
        assert.match(block, /\.arc-tile-value \{ font-size: clamp\(/);
        assert.match(CSS, /@media \(max-width: 360px\)[^}]*\{[^}]*\.arc-tile \{ padding/);
    });
});
