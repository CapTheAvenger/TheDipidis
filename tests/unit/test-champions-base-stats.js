/**
 * Champions Pokédex — species base stats in the overview table.
 *
 * The table's "Ges"/"Tot" column has always been the BASE stat total
 * (Mega Dragoran = 700), while the six stat columns showed the Lv. 50
 * value (sum 875). The visible numbers did not add up to the visible
 * total. The base line fixes that and is what tournament players learn
 * by heart, so these are the properties worth pinning:
 *
 * - every stat cell renders base, lv50 (+ used) and range, in that order
 * - the base line uses its own class/colour so a fast scan cannot
 *   confuse it with the Lv. 50 value
 * - base stats across the six columns sum to the `total` column
 * - the detail overlay's "Base" column shows base, not lv50
 * - the legend describes what is actually rendered (the old intro
 *   claimed "base stat with the Lv. 50 range in brackets" — both wrong)
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'app-side-quest-pokedex.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'css', 'side-quest.css'), 'utf8');
const DEX = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'champions_pokedex.json'), 'utf8'));

// The module is an IIFE that keeps its helpers private — pull the pieces
// under test out of the source, same approach as test-deck-bench.js.
function chunk(re, what) {
    const m = SRC.match(re);
    if (!m) throw new Error('could not extract ' + what);
    return m[0];
}

const SANDBOX = [
    chunk(/    const LABELS = \{[\s\S]*?\n    \};\n/, 'LABELS'),
    chunk(/    function escapeHtml\(s\) \{[\s\S]*?\n    \}\n/, 'escapeHtml'),
    chunk(/    function statCell\(s, used\) \{[\s\S]*?\n    \}\n/, 'statCell'),
    chunk(/    function legendHtml\(\) \{[\s\S]*?\n    \}\n/, 'legendHtml'),
].join('\n');

function build(lang) {
    // eslint-disable-next-line no-new-func
    return new Function(`
        function uiLang() { return ${JSON.stringify(lang)}; }
        ${SANDBOX}
        function t() { return LABELS[uiLang()]; }
        return { statCell, legendHtml, LABELS, t };
    `)();
}

const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const dragonite = DEX.entries.find(e => e.en === 'Mega Dragonite');

describe('stat cell shows the species base stat', () => {
    const { statCell } = build('de');

    it('renders base, then Lv50 (+used), then range', () => {
        const html = statCell(dragonite.hp, 168);
        assert.match(html, /sqp-stat-base">91</, 'base stat missing');
        assert.match(html, /sqp-stat-top"><b>166<\/b>/, 'Lv50 value missing');
        assert.match(html, /sqp-stat-used">\(168\)</, 'used value missing');
        assert.match(html, /<small>166–198<\/small>/, 'range missing');
        assert.ok(html.indexOf('sqp-stat-base') < html.indexOf('sqp-stat-top'),
            'base must come first — it is the line that matches the Ges column');
    });

    it('keeps the three values visually distinct', () => {
        // Same colour for base and Lv50 would defeat the whole point.
        const base = CSS.match(/\.sqp-stat-base \{[\s\S]*?\}/)[0];
        const lv50 = CSS.match(/\.sqp-stat-top b \{[^}]*\}/)[0];
        const used = CSS.match(/\.sqp-stat-used \{[^}]*\}/)[0];
        /* 28.08.2026: die drei Farben sind Token statt Hex, damit sie im
           Dunkelmodus mitdrehen. Die Absicht bleibt: drei verschiedene.
           Beim Umbau war genau das kurz kaputt — Basis und Lv50 landeten
           beide auf --ink-2, weil #b45309 (Bernstein) faelschlich als
           neutraler Grauton behandelt wurde. Dieser Test hat es gefangen. */
        const colour = s => (s.match(/color:\s*(var\(--[a-z0-9-]+\)|#[0-9a-f]{3,6})/i) || [])[1];
        const cols = [colour(base), colour(lv50), colour(used)];
        assert.equal(new Set(cols).size, 3, `colours not distinct: ${cols}`);
        assert.match(base, /font-weight:\s*800/, 'base should carry the most weight');
    });

    it('degrades to an empty cell when the stat is missing', () => {
        assert.equal(statCell(null, 5), '<td class="sqp-stat"></td>');
    });

    it('omits the used bracket when there is no usage data', () => {
        const html = statCell(dragonite.hp, null);
        assert.doesNotMatch(html, /sqp-stat-used/);
        assert.match(html, /sqp-stat-base">91</);
    });
});

describe('the base line agrees with the Ges/Tot column', () => {
    it('base stats sum to `total` for every entry', () => {
        const bad = DEX.entries.filter(e => {
            const sum = STAT_KEYS.reduce((n, k) => n + ((e[k] && e[k].base) || 0), 0);
            return sum !== e.total;
        });
        assert.deepEqual(bad.map(e => e.en), [],
            'entries whose visible base stats do not add up to the total column');
    });

    it('every entry actually carries a base value per stat', () => {
        const missing = DEX.entries.filter(e =>
            STAT_KEYS.some(k => !e[k] || e[k].base == null));
        assert.deepEqual(missing.map(e => e.en), []);
    });
});

describe('detail overlay separates base from Lv50', () => {
    it('has a real base column ahead of the Lv50 column', () => {
        const tbl = SRC.match(/function detailStatsTable\([\s\S]*?\n    \}\n/)[0];
        assert.match(tbl, /sqp-d-st-basebase">\$\{s\.base/, 'base column missing');
        assert.match(tbl, /sqp-d-st-base">\$\{s\.lv50\}/, 'Lv50 column changed unexpectedly');
        assert.ok(tbl.indexOf('colBaseTrue') < tbl.indexOf('colLv50'),
            'header order must match the cell order');
        /* Der Ton ist jetzt ein Token (--tint-warn-ink), damit er im
           Dunkelmodus mitdreht. Die Absicht bleibt: dieselbe Farbe wie
           die Basis-Spalte der Tabelle — deshalb wird gegen jene
           verglichen statt gegen einen festen Hex-Wert. */
        const farbe = sel => {
            const r = CSS.match(new RegExp('\\.' + sel + ' \\{[^}]*\\}'));
            return r ? (r[0].match(/color:\s*(var\(--[a-z0-9-]+\)|#[0-9a-f]{3,6})/i) || [])[1] : null;
        };
        assert.ok(farbe('sqp-d-st-basebase'), '.sqp-d-st-basebase fehlt');
        assert.equal(farbe('sqp-d-st-basebase'), farbe('sqp-key-base'),
            'detail base column must use the same amber as the table');
    });

    it('no longer labels the Lv50 value "Base"', () => {
        assert.doesNotMatch(SRC, /colBase:\s*'Lv50'/,
            'the old mislabelled key is still in place');
        for (const lang of ['de', 'en']) {
            const { t } = build(lang);
            assert.ok(t().colBaseTrue, `colBaseTrue missing for ${lang}`);
            assert.equal(t().colLv50, 'Lv50');
        }
    });
});

describe('legend describes what is rendered', () => {
    for (const lang of ['de', 'en']) {
        it(`is complete and colour-keyed (${lang})`, () => {
            const { legendHtml, t } = build(lang);
            const html = legendHtml();
            for (const cls of ['base', 'lv50', 'used', 'range']) {
                assert.match(html, new RegExp(`sqp-key-${cls}`), `${cls} key missing`);
                assert.match(CSS, new RegExp(`\\.sqp-key-${cls} \\{`),
                    `.sqp-key-${cls} has no CSS — the legend would be colourless`);
            }
            assert.match(html, />91</, 'base example number missing');
            assert.match(html, />166</);
            assert.match(html, />\(168\)</);
            // The old text claimed the brackets held the Lv. 50 range.
            assert.doesNotMatch(t().intro, /in brackets|in Klammern/i);
            // Straight quotes / ampersands in the labels survive escaping
            // as visible &quot; / &amp; — use typographic characters.
            assert.doesNotMatch(html, /&quot;|&amp;|&#39;/,
                'legend renders a raw HTML entity — use typographic quotes and "und"/"and"');
        });
    }

    it('escapes the label text it interpolates', () => {
        const src = chunk(/    function legendHtml\(\) \{[\s\S]*?\n    \}\n/, 'legendHtml');
        assert.doesNotMatch(src, /\$\{(?!escapeHtml|\[)[^}]*l\.legend[^}]*\}/,
            'legend labels must go through escapeHtml');
    });
});
