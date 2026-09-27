/**
 * Rutsch 6 (27.09.2026) — UI-18 „Matches" statt „Partien"/„Games",
 * UI-9/10/11 Lesbarkeit.
 *
 * UI-18, Entscheidung Hausi: die Meta-Ansichten und die erzeugten Bilder
 * sagen „Matches". Das Battle Journal (bj.*), der Playtester (pt.*, mp.*)
 * und das Glossar (Bo1/Bo3) behalten „Game" — dort ist ein Game eine
 * Einzelpartie innerhalb eines Matches.
 *
 * Gemessen wurde am gezeichneten Schirm mit scripts/messe_begriffe.py
 * (0 Treffer in sechs Meta-Ansichten, beide Sprachen); diese Datei haelt
 * die Quelle der Texte fest, damit es so bleibt.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { lies } = require('./lib-dom-sandkasten.js');

const I18N = lies('js', 'i18n.js');
const META_PRAEFIXE = ['arc', 'mc', 'buildInfo', 'heatmap', 'techLab', 'antiTech', 'matchup', 'pm'];

function eintraege() {
    const raus = [];
    const zeile = /^\s*'([^']+)':\s*'((?:[^'\\]|\\.)*)',?\s*$/gm;
    let m;
    while ((m = zeile.exec(I18N))) raus.push({ schluessel: m[1], wert: m[2] });
    return raus;
}

describe('UI-18 — die Meta-Texte sagen „Matches"', () => {
    const alle = eintraege();
    const meta = alle.filter(e => META_PRAEFIXE.includes(e.schluessel.split('.')[0]));

    it('die Tabelle ist gelesen (sonst prueft der Rest nichts)', () => {
        assert.ok(meta.length > 500, 'nur ' + meta.length + ' Meta-Eintraege gefunden');
    });

    it('kein Meta-Eintrag sagt „Partie" oder „Partien"', () => {
        const funde = meta.filter(e => /Partie/.test(e.wert)).map(e => e.schluessel + ': ' + e.wert.slice(0, 60));
        assert.deepEqual(funde, []);
    });

    it('kein Meta-Eintrag sagt „game" oder „games"', () => {
        const funde = meta.filter(e => /\b[Gg]ames?\b/.test(e.wert)).map(e => e.schluessel + ': ' + e.wert.slice(0, 60));
        assert.deepEqual(funde, []);
    });

    it('das Glossar erklaert Bo1/Bo3 weiter mit „Game" — dort ist es richtig', () => {
        assert.match(I18N, /'glossary\.bo3':\s*'Best of 3 — wer zuerst zwei Games gewinnt'/);
    });

    it('das erzeugte Bild der Deck-Analyse beschriftet die Spalte mit „Matches"', () => {
        const SHARE = lies('js', 'ds-share.js');
        assert.match(SHARE, /L\('Matches', 'Matches'\)/);
        assert.doesNotMatch(SHARE, /L\('Partien', 'games'\)/);
    });
});

const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

describe('UI-11 — Aktuelles Meta bei 390 px nicht unter 11 px', () => {
    const STYLES = ohneKommentare(lies('css', 'styles.css'));
    const MENU = ohneKommentare(lies('css', 'pokeball-menu.css'));
    const UIK = ohneKommentare(lies('css', 'ui-components.css'));

    it('die Heatmap-Zellen stehen auf --fs-xs', () => {
        for (const k of ['heatmap-zelle-quelle', 'heatmap-zelle-kennzahl', 'heatmap-zelle-n']) {
            assert.match(STYLES, new RegExp('\\.' + k + '\\s*\\{\\s*font-size:\\s*var\\(--fs-xs\\)'), k);
        }
    });

    it('die Umschalter haben 11 px als Boden', () => {
        assert.match(MENU, /\.btn-toggle-item\s*\{[^}]*font-size:\s*max\(var\(--fs-xs\), 0\.83em\)/);
    });

    it('die Zeilenkoepfe der Heatmap fallen am Telefon nicht unter --fs-xs', () => {
        const ab430 = UIK.slice(UIK.indexOf('@media (max-width: 430px) {'));
        assert.match(ab430.slice(0, 400), /\.heatmap-th-y\s*\{[^}]*font-size:\s*var\(--fs-xs\) !important/);
    });
});

describe('UI-9 / UI-10 — die Anleitung', () => {
    const HOWTO = lies('css', 'profile-howto-info.css');
    const HOWTO_OHNE = ohneKommentare(HOWTO);

    it('keine Schrift unter 0,6875 rem (11 px) in den Mockups', () => {
        assert.deepEqual(HOWTO_OHNE.match(/font-size:\s*0\.6[0-8]rem/g) || [], []);
        for (const f of ['tutorial.de.html', 'tutorial.en.html']) {
            const html = lies('tutorial', f);
            assert.deepEqual(html.match(/font-size:\s*0\.6[0-8]rem/g) || [], [], f);
        }
    });

    it('das helle Mockup setzt im Dunkelmodus auch --brand zurueck', () => {
        const insel = HOWTO_OHNE.slice(HOWTO_OHNE.indexOf('[data-theme="dark"] .tutorial-mockup {'));
        assert.match(insel.slice(0, insel.indexOf('}')), /--brand:\s*#3B4CCA;/);
    });

    it('weisse Schrift steht auf Verlaeufen, die dunkel genug enden', () => {
        // Vorher endeten sie in #fb923c / #4ade80 / #ef4444 / #22c55e —
        // weiss darauf 2,0–3,8:1 (gemessen 27.09.2026).
        assert.match(HOWTO_OHNE, /\.mockup-bs-rank\.is-t2 \{ background: linear-gradient\(135deg, #a55300, #c2410c\); \}/);
        assert.match(HOWTO_OHNE, /\.mockup-bs-rank\.is-t3 \{ background: linear-gradient\(135deg, #2d7530, #15803d\); \}/);
        assert.match(HOWTO_OHNE, /\.mockup-bs-rank\.is-t1 \{ background: linear-gradient\(135deg, #b91c1c, #dc2626\); \}/);
        assert.match(HOWTO_OHNE, /is-best  \.mockup-matchup-head \{ background: linear-gradient\(90deg, var\(--solid-ok\), #15803d\); \}/);
    });
});
