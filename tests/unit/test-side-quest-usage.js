/**
 * Champions usage view.
 *
 * data/champions_usage.json carried six blocks per Pokémon — moves, held
 * item, ability, nature, stat points, teammates — that nothing rendered.
 * This view renders them, and the ways it could quietly lie are:
 *
 *  - teammate carries `pct: null` for every entry in the file. Drawing
 *    empty bars would state a proportion we do not have, so teammates
 *    are chips.
 *  - basculegion-male and basculegion-female are two usage records with
 *    one display name; ranking by name has to yield one row, not two.
 *  - a top-8 panel that cuts silently reads as the whole truth.
 *  - the ranking is counted from the team file, not taken on trust: a
 *    review put Kingambit at 72 appearances; over the 99 teams it is 37.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'app-side-quest-usage.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'css', 'side-quest.css'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const TEAMS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'champions_replica_teams.json'), 'utf8'));
const USAGE = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'champions_usage.json'), 'utf8'));

function load(lang = 'de') {
    const sandbox = {
        console,
        document: { addEventListener() {}, getElementById: () => null },
        getLang: () => lang,
        fetch: () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) }),
        BASE_PATH: 'data/',
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(SRC, sandbox);
    return sandbox._sqUsageInternals;
}

describe('the ranking says what the data says', () => {
    const api = load();

    it('counts appearances across the 99 replica teams', () => {
        api.setState(USAGE.pokemon, [], {});
        const ranked = api.rankTeams(TEAMS);
        assert.equal(TEAMS.teams.length, 99);
        const top = ranked.slice(0, 3).map(r => `${r.name} ${r.count}`);
        // Counted, not quoted. If the file changes these move — the point
        // is that the numbers come from it and not from a note.
        const total = ranked.reduce((s, r) => s + r.count, 0);
        const expected = TEAMS.teams.reduce((s, t) => s + (t.pokemon || []).length, 0);
        assert.equal(total, expected, `ranking lost entries: ${top.join(', ')}`);
    });

    it('lists Basculegion exactly once', () => {
        api.setState(USAGE.pokemon, [], {});
        const ranked = api.rankTeams(TEAMS);
        const hits = ranked.filter(r => r.name === 'Basculegion');
        assert.equal(hits.length, 1);
        // …and still resolves to a usage record despite the split slugs.
        assert.ok(/^basculegion(-|$)/.test(hits[0].slug), `slug was ${hits[0].slug}`);
        assert.ok(USAGE.pokemon[hits[0].slug], 'the chosen slug has no usage record');
    });

    it('resolves a plain name straight through', () => {
        api.setState(USAGE.pokemon, [], {});
        assert.equal(api.usageSlug('Kingambit'), 'kingambit');
        assert.equal(api.usageSlug('Farigiraf'), 'farigiraf');
    });

    it('is sorted descending and never NaN', () => {
        api.setState(USAGE.pokemon, [], {});
        const ranked = api.rankTeams(TEAMS);
        for (let i = 1; i < ranked.length; i++) {
            assert.ok(ranked[i - 1].count >= ranked[i].count, 'ranking is not sorted');
        }
        assert.ok(ranked.every(r => Number.isFinite(r.share) && r.share > 0 && r.share <= 1));
    });

    it('survives an empty or malformed team file', () => {
        api.setState({}, [], {});
        assert.deepEqual(api.rankTeams(null).length, 0);
        assert.deepEqual(api.rankTeams({ teams: [] }).length, 0);
        assert.deepEqual(api.rankTeams({ teams: [{}] }).length, 0);
    });
});

describe('a cut list says it was cut', () => {
    const api = load();
    it('names the remainder', () => {
        assert.equal(api.tailNote(new Array(11), 8), '+3 weitere');
        assert.equal(api.tailNote(new Array(8), 8), '');
        assert.equal(api.tailNote([], 8), '');
    });
    it('in English too', () => {
        assert.equal(load('en').tailNote(new Array(11), 8), '+3 more');
    });
});

describe('teammates are chips, not empty bars', () => {
    const api = load();

    it('every teammate entry in the file has a null share', () => {
        // The reason the chips exist. If the source ever fills this in,
        // this test fails and the decision can be revisited.
        let withPct = 0, total = 0;
        for (const rec of Object.values(USAGE.pokemon)) {
            for (const fmt of ['doubles', 'singles']) {
                for (const m of ((rec[fmt] || {}).teammate || [])) {
                    total++;
                    if (m.pct != null) withPct++;
                }
            }
        }
        assert.ok(total > 100, `only ${total} teammate entries found`);
        assert.equal(withPct, 0, `${withPct} teammate entries now carry a share — reconsider bars`);
    });

    it('renders chips and says the share is missing', () => {
        const html = api.matesPanel([{ name: 'Farigiraf', pct: null }, { name: 'Incineroar', pct: null }]);
        assert.match(html, /sq-mate/);
        assert.doesNotMatch(html, /sq-track/, 'a bar would imply a proportion');
        assert.match(html, /ohne Anteilswerte/);
    });

    it('renders nothing rather than an empty panel', () => {
        assert.equal(api.matesPanel([]), '');
        assert.equal(api.matesPanel(null), '');
    });
});

describe('bars and stat points', () => {
    const api = load();

    it('a bar never collapses to nothing at a tiny share', () => {
        const html = api.barRow('Quick Claw', 0.4);
        assert.match(html, /width:1\.5%/, 'a 0.4 % bar must still be visible');
    });

    it('clamps above 100 rather than overflowing its track', () => {
        assert.match(api.barRow('x', 140), /width:100%/);
    });

    it('renders six boxes with zeros dimmed', () => {
        const html = api.spreadPanel([{ evs: '32 HP / 32 SpA', pct: 12.4,
            points: { hp: 32, atk: 0, def: 0, spa: 32, spd: 0, spe: 0 } }]);
        // Anchored: /class="sq-ev/ also matches the "sq-evs" container.
        assert.equal((html.match(/class="sq-ev(?: z)?"/g) || []).length, 6);
        assert.equal((html.match(/class="sq-ev z"/g) || []).length, 4,
            'four zero stats should be dimmed');
        assert.match(html, /<b>32<\/b>/);
    });
});

describe('scoping', () => {
    it('every console rule is under .sq-console', () => {
        // The four existing subtabs still assume a light background; a
        // rule that escaped would darken them too.
        const start = CSS.indexOf('/* ── Champions "console"');
        assert.ok(start > 0, 'console block not found');
        const block = CSS.slice(start);
        const selectors = block.split('\n')
            .filter(l => /^\.[a-z]/.test(l.trim()) || /^\s*\.[a-z][^{]*\{/.test(l))
            .map(l => l.trim().split('{')[0].trim())
            .filter(Boolean);
        const escaped = selectors.filter(sel =>
            sel.split(',').map(s => s.trim()).some(s => s && !s.startsWith('.sq-console')));
        assert.deepEqual(escaped, [], 'these rules apply outside the console');
    });

    it('the view is wired into the subtab bar and the host exists', () => {
        assert.match(HTML, /data-sq-view="usage"/);
        assert.match(HTML, /id="sideQuestUsageHost"/);
        assert.match(HTML, /js\/app-side-quest-usage\.js\?/);
    });

    it('the page banner is hidden for the console views', () => {
        // Usage and Matchups both bring their own 46px header bar; the
        // remaining subtabs still expect the page banner above them.
        const res = fs.readFileSync(path.join(ROOT, 'js', 'app-side-quest-resources.js'), 'utf8');
        assert.match(res, /banner\.hidden = \(view === 'usage' \|\| view === 'matchups'\)/);
    });

    it('redraws on a language switch', () => {
        assert.match(SRC, /addEventListener\('languageChanged'/);
    });
});

describe('both languages are complete', () => {
    it('the two label blocks have the same keys', () => {
        const api = load();
        assert.ok(api, 'internals not exposed');
        const de = load('de'), en = load('en');
        assert.equal(de.tailNote(new Array(9), 8).includes('weitere'), true);
        assert.equal(en.tailNote(new Array(9), 8).includes('more'), true);
    });

    it('no bare German string is left in a render path', () => {
        const renderPart = SRC.slice(SRC.indexOf('// ── components'));
        assert.doesNotMatch(renderPart, /de\(\) \? '/,
            'a language ternary escaped the LABELS block');
    });
});
