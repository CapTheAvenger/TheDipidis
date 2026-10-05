/**
 * UI-105 (G3-01, UI/UX-Ueberpruefung v2, 05.10.2026)
 *
 * BEFUND: Im hellen Modus lag das Glossar der Anleitung auf einem festen
 * dunklen Verlauf (.tutorial-chapter-wrap), die Erklaerungen aber in heller-
 * Modus-Schrift — 56 Texte bei 1,02-1,41:1 (Agent 4, gemessen).
 *
 * ZUSICHERUNG: Fuer den hellen Modus setzt css/profile-howto-info.css
 * Flaeche und Schrift des Rahmens aus Tokens, und der Kontrast der beiden
 * Token-Paare (--ink und --ink-2 auf --surface-2, Werte aus css/tokens.css
 * gelesen) liegt bei mindestens 4,5:1 — gerechnet, nicht behauptet.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const L = require('./lib-dom-sandkasten.js');

const css = L.lies('css', 'profile-howto-info.css').replace(/\/\*[\s\S]*?\*\//g, ' ');
const tokens = L.lies('css', 'tokens.css');
const hell = tokens.slice(0, tokens.indexOf('[data-theme="dark"]') > 0 ? tokens.indexOf('[data-theme="dark"]') : tokens.length);
const wert = (n) => { const m = hell.match(new RegExp('--' + n + ':\\s*(#[0-9a-fA-F]{6})')); assert.ok(m, n); return m[1]; };
const lum = (h) => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const kontrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe('UI-105: Glossar im hellen Modus lesbar', () => {
    it('heller Rahmen nimmt Token-Flaeche und Token-Schrift', () => {
        assert.match(css, /html:not\(\[data-theme="dark"\]\) \.tutorial-chapter-wrap \{[^}]*background:\s*var\(--surface-2\)[^}]*color:\s*var\(--ink\)/);
        assert.match(css, /\.tutorial-chapter-wrap dd[^{]*\{[^}]*color:\s*var\(--ink-2\)/);
    });
    it('Token-Paare halten 4,5:1', () => {
        assert.ok(kontrast(wert('ink'), wert('surface-2')) >= 4.5);
        assert.ok(kontrast(wert('ink-2'), wert('surface-2')) >= 4.5, 'ink-2 auf surface-2 ' + kontrast(wert('ink-2'), wert('surface-2')).toFixed(2));
    });
});
