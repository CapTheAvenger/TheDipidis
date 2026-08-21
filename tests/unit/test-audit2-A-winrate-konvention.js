/**
 * Audit 2, Gruppe A — F24: Zwei Record-Blöcke zeigten (Siege+0,5·U)/Partien
 * ohne Konventionshinweis — die hauseigen (js/win-rate-konvention.js) als
 * "erfunden" markierte Formel. Der Rest der Seite benennt seine Quote über
 * window.WinRateKonvention.
 *
 * Fix: die ANGEZEIGTE Quote nennt jetzt Matchpunkte (wie die Performance-
 * Sektion und wie die Platzierung entschieden wird) und trägt den Hinweis
 * als title. Die erfundene Formel bleibt nur noch interner Sortier-Tiebreak.
 *
 * Beide Rechen-/Renderblöcke werden wörtlich aus der Quelle geschnitten und
 * mit der ECHTEN WinRateKonvention (aus js/win-rate-konvention.js geladen)
 * ausgeführt. Das Schneiden geschieht IM Test, damit ein fehlender Schnitt
 * (z. B. nach Entfernen der Behebung) den Test rot macht statt ihn stumm
 * zu überspringen.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// Echte WinRateKonvention laden (deutschsprachig).
function ladeKonvention() {
    const src = read('js/win-rate-konvention.js');
    const win = { getLang: () => 'de' };
    return new Function('window', src + '\nreturn window.WinRateKonvention;')(win);
}
const WK = ladeKonvention();

// 6-2-1 in Matchpunkten: (3*6 + 1) / (3*9) = 19/27 = 70,37 % -> "70,4%".
// Kanonisch gegen die Konvention nachgerechnet, nicht abgeschrieben.
const ERWARTET = WK.KONVENTIONEN.matchpunkte.rechne(6, 2, 1);
assert.ok(Math.abs(ERWARTET - (19 / 27) * 100) < 1e-9);
const ERWARTET_STR = ERWARTET.toFixed(1).replace('.', ',') + '%'; // "70,4%"

function schneide(src, von, bis) {
    const a = src.indexOf(von);
    const b = a > -1 ? src.indexOf(bis, a) : -1;
    assert.ok(a > -1 && b > a,
        `Konventions-Behebung fehlt (Schnitt "${von}" nicht gefunden)`);
    return src.slice(a, b + bis.length);
}

describe('F24 (Past Meta) — MostSuccessfulList nennt die Konvention', () => {
    it('die angezeigte Quote ist Matchpunkte und trägt einen Konventionshinweis', () => {
        const src = read('js/app-past-meta.js');
        const wpBlock = schneide(src,
            'const _WK = window.WinRateKonvention;',
            "const wpHinweis = _WK ? _WK.hinweis('matchpunkte') : '';");
        const span = schneide(src,
            '`<span class="past-meta-best-record"${wpHinweis',
            '</span>`');
        const body = wpBlock + '\nconst recordBlock = ' + span + ';\n'
            + 'return { wpStr: wpStr, wpHinweis: wpHinweis, recordBlock: recordBlock };';
        const fn = new Function('window', 'best', '_esc', '_pmListWinRate', body);
        const r = fn({ WinRateKonvention: WK }, { wins: 6, losses: 2, ties: 1 },
            (s) => String(s), () => 0);

        assert.equal(r.wpStr, ERWARTET_STR, 'die Quote ist nicht die Matchpunkte-Quote');
        assert.match(r.wpHinweis, /Matchpunkte/, 'kein Konventionshinweis');
        assert.match(r.recordBlock, /title="/, 'der Hinweis hängt nicht als title an der Zahl');
        assert.match(r.recordBlock, /Matchpunkte/);
        assert.match(r.recordBlock, /6-2-1 · 70,4%/);
    });
});

describe('F24 (Quickref) — Record-Block nennt die Konvention', () => {
    it('die angezeigte Quote ist Matchpunkte und trägt einen Konventionshinweis', () => {
        const src = read('js/current-meta-quickref.js');
        const wpBlock = schneide(src,
            'const _qWK = window.WinRateKonvention;',
            "const _qWpHinweis = _qWK ? _qWK.hinweis('matchpunkte') : '';");
        const span = schneide(src,
            '`<span class="past-meta-best-record"${_qWpHinweis',
            '</span>`');
        const body = wpBlock + '\nconst recordBlock = ' + span + ';\n'
            + 'return { wpStr: _qWpStr, wpHinweis: _qWpHinweis, recordBlock: recordBlock };';
        const fn = new Function('window', 'ref', '_escHtml', '_winRate', body);
        const r = fn({ WinRateKonvention: WK }, { wins: 6, losses: 2, ties: 1 },
            (s) => String(s), () => 0);

        assert.equal(r.wpStr, ERWARTET_STR, 'die Quote ist nicht die Matchpunkte-Quote');
        assert.match(r.wpHinweis, /Matchpunkte/, 'kein Konventionshinweis');
        assert.match(r.recordBlock, /title="/, 'der Hinweis hängt nicht als title an der Zahl');
        assert.match(r.recordBlock, /6-2-1 · 70,4%/);
    });
});
