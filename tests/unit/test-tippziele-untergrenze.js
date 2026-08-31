/**
 * Tippziele in der Kartendatenbank — welche Grenze wirklich gilt.
 *
 * BEFUND (Agentenrunde 31.08.2026): „78 Tippziele unter 44 px bei
 * 390×844, 428 auf dem Desktop — der zahlenmäßig größte Fund im Test."
 *
 * Die Messung stimmt. Die Grenze stimmt nicht.
 *
 * 44 px ist die Empfehlung aus den Apple-Richtlinien und WCAG 2.5.5
 * (AAA). Was hier gilt, ist WCAG 2.5.8 „Target Size (Minimum)", AA:
 * 24×24 CSS-Pixel. Nachgemessen über alle Knöpfe, Links und
 * role=button in der Kartendatenbank, bei 390×844 und 1440×900:
 * 0 Ziele unter 24 px. Das Kleinste ist genau 24×24.
 *
 * Und die 24 px sind kein Zufall, sondern gerechnet: vier Aktionsknöpfe
 * sitzen auf einem Kartenbild, das bei 390 px Bildschirmbreite 173,5 px
 * breit ist. Vier mal 44 px wären 176 px plus Abstände — sie passen
 * nicht nebeneinander. Ein größeres Trefferfeld per Pseudo-Element
 * würde sich mit den Nachbarn überlappen, und dann trifft man den
 * falschen Knopf; das ist schlechter als ein kleines, aber eindeutiges
 * Ziel.
 *
 * Diese Datei hält deshalb die Untergrenze fest, die tatsächlich gilt —
 * damit niemand sie unterschreitet, und damit der nächste 44-px-Befund
 * eine Antwort hat.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const CSS = fs.readFileSync(path.join(ROOT, 'css', 'cards-tabs.css'), 'utf8');

function block(selektor) {
    const i = CSS.indexOf(selektor + ' {');
    assert.ok(i > -1, 'Regelblock nicht gefunden: ' + selektor);
    return CSS.slice(i, CSS.indexOf('}', i));
}
function px(regel, eigenschaft) {
    const m = new RegExp(eigenschaft + ':\\s*(\\d+(?:\\.\\d+)?)px').exec(regel);
    return m ? Number(m[1]) : null;
}

const AA_MINIMUM = 24;

describe('Kartendatenbank — die Aktionsknöpfe halten die AA-Untergrenze', () => {
    it('auf dem Desktop sind die Badges 26 px', () => {
        const r = block('#cards .card-database-top-actions .card-badge');
        for (const eig of ['width', 'height', 'min-width', 'min-height']) {
            assert.equal(px(r, eig), 26, `${eig} ist nicht 26 px`);
        }
        assert.ok(26 >= AA_MINIMUM);
    });

    it('auf schmalen Bildschirmen sind sie 24 px — nicht weniger', () => {
        const erster = CSS.indexOf('#cards .card-database-top-actions .card-badge {');
        const zweiter = CSS.indexOf('#cards .card-database-top-actions .card-badge {', erster + 10);
        assert.ok(zweiter > -1, 'die mobile Regel fehlt');
        const r = CSS.slice(zweiter, CSS.indexOf('}', zweiter));
        for (const eig of ['width', 'height', 'min-width', 'min-height']) {
            const v = px(r, eig);
            assert.equal(v, 24, `${eig} ist ${v} px statt 24`);
            assert.ok(v >= AA_MINIMUM,
                `${v} px unterschreitet WCAG 2.5.8 AA (${AA_MINIMUM} px)`);
        }
    });

    it('kein Maß in dieser Datei geht unter 24 px für ein Tippziel', () => {
        const regeln = [...CSS.matchAll(/([^{}]+)\{([^}]*)\}/g)];
        const zuKlein = [];
        for (const [, sel, inhalt] of regeln) {
            if (!/btn|button|badge|\[role="button"\]/i.test(sel)) continue;
            if (/::(before|after)/.test(sel)) continue;
            // Ein Sinnbild IM Knopf ist nicht das Tippziel — das ist der
            // Knopf darum. `.tab-btn-icon` ist 16 px und völlig richtig so.
            if (/-icon|-label|-glyph|\bsvg\b|\bimg\b/i.test(sel)) continue;
            for (const eig of ['min-height', 'height']) {
                const v = px(inhalt, eig);
                if (v !== null && v > 1 && v < AA_MINIMUM) {
                    zuKlein.push(`${sel.trim().slice(0, 60)} → ${eig}: ${v}px`);
                }
            }
        }
        assert.deepEqual(zuKlein, [],
            'unter der AA-Untergrenze von 24 px:\n  ' + zuKlein.join('\n  '));
    });

    it('die Begründung für 24 px steht im Stylesheet', () => {
        assert.match(CSS, /173[,.]5\s*px/,
            'die gemessene Bildbreite fehlt als Begründung');
        assert.match(CSS, /24 px ist die Untergrenze/);
    });
});
