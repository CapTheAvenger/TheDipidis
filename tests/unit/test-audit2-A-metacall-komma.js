/**
 * Audit 2, Gruppe A — F11: Der Meta-Call rendert Anteile und Begegnungen mit
 * rohem toFixed ("10.00%", "∅ 0.80") — Punkt-Dezimalen in der deutschen UI,
 * direkt neben Komma-Werten wie "7,1" im selben Reiter. Gemessen 21.08.2026.
 *
 * Fix: locale-fähige Formatierung (_mcNum / _mcPct) — Komma für de, Punkt für
 * en. Getestet wird a) das Verhalten der Helfer und b) dass die betroffenen
 * Render-Ausdrücke sie auch benutzen: die Ausdrücke werden wörtlich aus der
 * Quelle geschnitten und mit den echten Helfern ausgeführt; bei Rückfall auf
 * rohes toFixed käme in de ein Punkt heraus und der Test wird rot.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'app-meta-call.js'), 'utf8');

function cut(from, to, startAt) {
    const a = SRC.indexOf(from, startAt || 0);
    const b = a > -1 ? SRC.indexOf(to, a + from.length) : -1;
    assert.ok(a > -1 && b > a, `Schnitt "${from}" nicht gefunden`);
    return SRC.slice(a, b + to.length);
}

// Die echten Formatier-Helfer aus der Quelle laden.
function ladeHelfer(lang) {
    const mcNum = cut('function _mcNum(n, dp) {', '}');
    const mcPct = cut('function _mcPct(n, dp) {', '}');
    const body = mcNum + '\n' + mcPct + '\nreturn { _mcNum: _mcNum, _mcPct: _mcPct };';
    return new Function('getLang', body)(() => lang);
}

describe('F11 — _mcNum / _mcPct formatieren nach Sprache', () => {
    it('deutsch: Komma', () => {
        const { _mcNum, _mcPct } = ladeHelfer('de');
        assert.equal(_mcNum(10, 2), '10,00');
        assert.equal(_mcNum(0.8, 2), '0,80');
        assert.match(_mcPct(10, 2), /^10,00/);
        assert.ok(_mcPct(10, 2).includes('%'));
    });
    it('englisch: Punkt', () => {
        const { _mcNum, _mcPct } = ladeHelfer('en');
        assert.equal(_mcNum(10, 2), '10.00');
        assert.equal(_mcPct(10, 2), '10.00%');
    });
});

describe('F11 — die Render-Ausdrücke benutzen die locale-fähige Formatierung', () => {
    it('Online-Share-Zelle liefert in de Komma, in en Punkt', () => {
        const line = cut("const onlineDisplay = isCustom ? '—' :", ';');
        function run(lang) {
            const { _mcPct } = ladeHelfer(lang);
            const fn = new Function('_mcPct', 'isCustom', 'deck',
                line + '\nreturn onlineDisplay;');
            return fn(_mcPct, false, { onlineShare: 10 });
        }
        assert.match(run('de'), /10,00/, 'de-Share zeigt keinen Komma-Dezimaltrenner');
        assert.ok(!run('de').includes('10.00'), 'de-Share zeigt noch Punkt');
        assert.match(run('en'), /10\.00/, 'en-Share zeigt keinen Punkt');
    });

    it('Begegnungs-Label (∅ λ) liefert in de Komma', () => {
        const span = cut('<span class="mc-encounters-label">', '</span>');
        function run(lang) {
            const { _mcNum } = ladeHelfer(lang);
            const fn = new Function('_mcNum', 'lambda',
                'return `' + span + '`;');
            return fn(_mcNum, 0.8);
        }
        assert.match(run('de'), /∅ 0,80/, 'de-Begegnungen zeigen keinen Komma-Dezimaltrenner');
        assert.ok(!run('de').includes('0.80'));
        assert.match(run('en'), /∅ 0\.80/);
    });
});
