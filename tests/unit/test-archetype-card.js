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
        api.setData({ Dhelmise: { share: 4.45, winRate: 48.2, count: 900 } },
                    { expected: 0.0632, decks: [] });
        const html = api.tilesHtml('Dhelmise');
        assert.match(html, /4,5 %/);
        assert.match(html, /48,2 %/);
        assert.match(html, /−1,80/, 'distance from 50 % should carry its sign');
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

    it('renders Σ / W / L and marks the thin row', () => {
        const html = api.matchupTableHtml('Dragapult');
        assert.match(html, /<th>W<\/th><th>L<\/th>/);
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
        const block = CSS.slice(CSS.indexOf('.arc-mu-up-1'), CSS.indexOf('.arc-mu-n,'));
        assert.match(block, /37, 99, 235|#1d4ed8/);
        assert.match(block, /220, 38, 38|#b91c1c/);
        assert.doesNotMatch(block, /#16a34a|#27ae60|green/i);
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

    it('every tone the code can emit has a background defined', () => {
        // The fill is quantised precisely so this list is finite and each
        // entry's contrast against white text is known.
        for (const tone of ['neutral', 'tie', 'up', 'up-strong', 'down', 'down-strong']) {
            assert.match(CSS, new RegExp(`\\.arc-tone--${tone}\\s*\\{[^}]*background`),
                `no background for tone ${tone}`);
        }
        assert.match(CSS, /\.arc-tile \{[^}]*color: #ffffff/);
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
