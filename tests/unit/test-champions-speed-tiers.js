/**
 * Speed tiers in the Champions detail overlay.
 *
 * The feature answers "do I outspeed a scarfed X" without mental
 * arithmetic. What it must NEVER do is state a number it cannot back:
 *
 *  - Choice Scarf ×1.5 and Tailwind ×2 are quantified in the repo's
 *    Champions references, so they are rendered.
 *  - The two COMBINED are not. floor(floor(s×1.5)×2) and floor(s×3)
 *    disagree for every odd Speed (140 of the 281 values 20..300), and
 *    nothing establishes which one Champions uses — so no combined tier.
 *  - A "+1 stage" has no stage→multiplier table anywhere in the repo,
 *    so ×1.5 for Dragon Dance would be a mainline guess. Not offered.
 *  - The multiplier applies to the PLAYED build's Speed. Five Pokémon
 *    have no doubles usage record; those get no line at all rather than
 *    a tier derived from a 0-SP neutral spread nobody runs.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'app-side-quest-pokedex.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'css', 'side-quest.css'), 'utf8');
const DEX = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'champions_pokedex.json'), 'utf8'));
const USAGE = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'champions_usage.json'), 'utf8'));
const ITEMS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'champions_items_reference.json'), 'utf8'));
const MOVES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'champions_moves_reference.json'), 'utf8'));

function chunk(re, what) {
    const m = SRC.match(re);
    if (!m) throw new Error('could not extract ' + what);
    return m[0];
}

function build(lang) {
    const src = [
        chunk(/    const STAT_KEYS = \[[^\]]*\];/, 'STAT_KEYS'),
        chunk(/    const LABELS = \{[\s\S]*?\n    \};\n/, 'LABELS'),
        chunk(/    const _NATURE_FX = \{[\s\S]*?\n    \};\n/, '_NATURE_FX'),
        chunk(/    function escapeHtml\(s\) \{[\s\S]*?\n    \}\n/, 'escapeHtml'),
        chunk(/    function computeFinal\(e, natureName, points\) \{[\s\S]*?\n    \}\n/, 'computeFinal'),
        chunk(/    function topBuildFinal\(e, block\) \{[\s\S]*?\n    \}\n/, 'topBuildFinal'),
        chunk(/    function speedTierRow\(e, final\) \{[\s\S]*?\n    \}\n/, 'speedTierRow'),
    ].join('\n');
    // eslint-disable-next-line no-new-func
    return new Function(`
        function uiLang() { return ${JSON.stringify(lang)}; }
        ${src}
        function t() { return LABELS[uiLang()]; }
        return { speedTierRow, topBuildFinal, computeFinal, t };
    `)();
}

const nums = html => (html.match(/<b>(\d+)<\/b>/g) || []).map(s => +s.replace(/\D/g, ''));

describe('the modifiers rendered are the ones the repo quantifies', () => {
    it('Choice Scarf is documented as ×1,5', () => {
        const txt = JSON.stringify(ITEMS).replace(/\s+/g, ' ');
        assert.match(txt, /Choice Scarf/);
        assert.match(txt, /Initiative ×1,5|Initiative x1,5/,
            'the Scarf multiplier is no longer stated — re-verify before trusting the tier');
    });

    it('Tailwind is documented as doubling Speed', () => {
        const txt = JSON.stringify(MOVES).replace(/\s+/g, ' ');
        assert.match(txt, /Tailwind/);
        assert.match(txt, /Verdoppelt die Initiative/);
    });

    it('no stage→multiplier table exists, so no "+1" is offered', () => {
        for (const lang of ['de', 'en']) {
            const { t } = build(lang);
            const labels = [t().stPlain, t().stScarf, t().stTailwind].join(' ');
            assert.doesNotMatch(labels, /\+1|Dragon Dance|Drachentanz/);
        }
    });
});

describe('speedTierRow', () => {
    const { speedTierRow } = build('de');

    it('floors each multiplier against the played Speed', () => {
        const html = speedTierRow({}, { spe: 151 });
        assert.deepEqual(nums(html), [151, 226, 302]);   // floor(151*1.5)=226
    });

    it('renders nothing without a played build', () => {
        assert.equal(speedTierRow({}, null), '');
        assert.equal(speedTierRow({}, {}), '');
        assert.equal(speedTierRow({}, { spe: 0 }), '');
    });

    it('never renders a combined Scarf+Tailwind tier', () => {
        const html = speedTierRow({}, { spe: 151 });
        for (const bad of [452, 453]) {
            assert.ok(!nums(html).includes(bad),
                `combined tier ${bad} rendered — its rounding is unproven`);
        }
        assert.equal(nums(html).length, 3, 'exactly plain / scarf / tailwind');
    });

    it('says why the combination is missing', () => {
        for (const lang of ['de', 'en']) {
            const { speedTierRow: row, t } = build(lang);
            assert.ok(row({}, { spe: 100 }).includes(t().stNote.slice(0, 20)));
            assert.match(t().stNote, /nicht belegt|not established/);
        }
    });

    it('escapes its labels', () => {
        const src = chunk(/    function speedTierRow\(e, final\) \{[\s\S]*?\n    \}\n/, 'speedTierRow');
        assert.doesNotMatch(src, /\$\{l\.st[A-Za-z]*\}/, 'label interpolated unescaped');
    });
});

describe('the played build is read without disturbing the cache', () => {
    const { topBuildFinal } = build('de');

    it('returns a fresh object, never a reference into the entry', () => {
        // usedFinalFor() hands out e.meta.final by reference AND caches it;
        // deriving tiers from an aliased object would poison both.
        const e = JSON.parse(JSON.stringify(DEX.entries.find(x => x.en === 'Dragapult')));
        e.meta = { format: 'doubles', final: { spe: 999 } };
        const out = topBuildFinal(e, { nature: [{ name: 'Timid' }],
                                       stat_points: [{ points: { spe: 100 } }] });
        assert.notEqual(out, e.meta.final);
        out.spe = -1;
        assert.equal(e.meta.final.spe, 999, 'entry was mutated');
    });

    it('is null when the format has no usage block', () => {
        assert.equal(topBuildFinal({}, null), null);
        assert.equal(topBuildFinal({}, { nature: [], stat_points: [] }), null);
    });
});

describe('against the real data', () => {
    const { topBuildFinal, speedTierRow } = build('de');

    it('the Pokémon without a doubles record get no tier line', () => {
        const missing = DEX.entries.filter(e => {
            const rec = e.meta && e.meta.slug ? USAGE.pokemon[e.meta.slug] : null;
            return !(rec && rec.doubles);
        });
        assert.ok(missing.length > 0, 'fixture changed — no entry lacks doubles data');
        for (const e of missing) {
            const rec = e.meta && e.meta.slug ? USAGE.pokemon[e.meta.slug] : null;
            const final = topBuildFinal(e, rec && rec.doubles);
            assert.equal(speedTierRow(e, final), '',
                `${e.en} would render a tier without a played build`);
        }
    });

    it('produces a sane tier for a real fast Pokémon', () => {
        const e = DEX.entries.find(x => x.en === 'Dragapult');
        const rec = USAGE.pokemon[e.meta.slug];
        const final = topBuildFinal(e, rec.doubles);
        const [plain, scarf, tail] = nums(speedTierRow(e, final));
        assert.ok(plain >= e.spe.min && plain <= e.spe.max,
            `played Speed ${plain} outside the Lv50 range ${e.spe.min}–${e.spe.max}`);
        assert.equal(scarf, Math.floor(plain * 1.5));
        assert.equal(tail, plain * 2);
    });
});

describe('styling', () => {
    it('the tier numbers reuse the existing "played value" blue', () => {
        /* 28.08.2026: #1d6fd0 wurde zu var(--brand-ink) — dieselbe Farbe,
           aber sie dreht jetzt im Dunkelmodus mit (#8b98ff). Der Test
           prueft weiter dieselbe Absicht: die Stufenzahlen benutzen
           denselben Ton wie der "gespielte Wert", nicht einen eigenen. */
        const stufe = (CSS.match(/\.sqp-st-item b \{[^}]*\}/) || [])[0];
        const gespielt = (CSS.match(/\.sqp-stat-used \{[^}]*\}/) || [])[0];
        assert.ok(stufe, '.sqp-st-item b fehlt');
        assert.ok(gespielt, '.sqp-stat-used fehlt');
        const farbe = s => (s.match(/color:\s*(var\(--[a-z0-9-]+\)|#[0-9a-f]{3,6})/i) || [])[1];
        assert.equal(farbe(stufe), farbe(gespielt),
            `Stufenzahl ${farbe(stufe)} weicht vom gespielten Wert ${farbe(gespielt)} ab`);
        assert.match(CSS, /\.sqp-st \{/);
    });
});
