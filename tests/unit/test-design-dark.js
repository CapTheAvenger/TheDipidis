/**
 * Designsystem, Phase 3 — Dunkelmodus als zweiter Tokensatz.
 *
 * Der Dunkelmodus ist genau ein Block in tokens.css: dieselben Namen,
 * andere Werte. Kein zweites Stylesheet, keine Regel doppelt. Dafür
 * stand die Tokenschicht in Phase 0 am Anfang — mit 752 fest
 * verdrahteten Farben wäre er nicht machbar gewesen.
 *
 * Seit dem 28.08.2026 gibt es den Schalter. Er stand unter der
 * Bedingung "wenn der Zähler nahe null ist" — im Browser gemessen
 * (data-theme="dark" gesetzt, Chromium, 1500px):
 *
 *     Current Meta        0 von   198 sichtbaren Flächen bleiben hell
 *     Deck-Analyse        0 von    24
 *     Meta Call           0 von   196
 *     Kartendatenbank    60 von   299  (die farbigen Seltenheits-Chips,
 *                                       gewollt — sie sind im Hellen
 *                                       dieselben)
 *     Proxy               2 von    35  (die weißen Zähler auf dem roten
 *                                       Banner, ebenfalls gewollt)
 *
 * Vorher, am 27.08.2026: 10 / 1 / 21 / 62 / 6.
 *
 * Zweite Messung, dieselbe Runde: Text unter 3:1 Kontrast. Von 205
 * Stellen blieben 106 — 91 davon sind dieselben farbigen Chips, die
 * auch im Hellen so aussehen. Die restlichen 15 liegen fast alle über
 * 2,3:1 und stehen in docs/.
 *
 * Der Zähler unten funktioniert wie der !important-Zähler: er darf nie
 * steigen. Jede Datei, die angefasst wird, verlässt die Runde mit
 * weniger fest verdrahteten hellen Flächen.
 *
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const TOKENS = fs.readFileSync(path.join(ROOT, 'css', 'tokens.css'), 'utf8');
const COMP = fs.readFileSync(path.join(ROOT, 'css', 'components.css'), 'utf8');
const STYLES = fs.readFileSync(path.join(ROOT, 'css', 'styles.css'), 'utf8');

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

function luminance(hex) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (h.length !== 6) return null;
    const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

// Fest verdrahtete helle Flächen: das, was im Dunkelmodus weiß
// stehenbleibt. var(--…) zählt nicht mit — das ist ja der Weg raus.
function countHardcodedLightSurfaces() {
    return fs.readdirSync(path.join(ROOT, 'css'))
        .filter(f => f.endsWith('.css'))
        .reduce((total, f) => {
            const txt = stripComments(fs.readFileSync(path.join(ROOT, 'css', f), 'utf8'));
            const decls = txt.match(/background(?:-color)?\s*:\s*[^;{}]+[;}]/g) || [];
            return total + decls.filter(d => {
                const val = d.slice(d.indexOf(':') + 1);
                if (val.includes('var(')) return false;
                if (/\bwhite\b/.test(val)) return true;
                const hexes = val.match(/#[0-9a-fA-F]{3,6}\b/g);
                return !!hexes && hexes.every(h => (luminance(h) || 0) > 0.85);
            }).length;
        }, 0);
}

describe('der zweite Tokensatz', () => {
    const darkBlock = stripComments(TOKENS)
        .slice(stripComments(TOKENS).indexOf(':root[data-theme="dark"]'));

    it('existiert und hängt an data-theme', () => {
        assert.match(TOKENS, /:root\[data-theme="dark"\]\s*\{/);
    });

    it('definiert jede Fläche und jede Textfarbe neu', () => {
        ['--surface-0', '--surface-1', '--surface-2', '--line', '--line-strong',
         '--ink', '--ink-2', '--ink-3', '--dv-pos', '--dv-neg', '--dv-zero',
         '--bar-track', '--bar-fill', '--e-1', '--e-2']
            .forEach(v => assert.ok(darkBlock.includes(`${v}:`), `${v} fehlt im dunklen Satz`));
    });

    it('dreht Flächen und Text wirklich um', () => {
        const light = stripComments(TOKENS).slice(0, stripComments(TOKENS).indexOf(':root[data-theme="dark"]'));
        const read = (block, name) => {
            const m = block.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,6})`));
            return m ? luminance(m[1]) : null;
        };
        assert.ok(read(light, '--surface-1') > 0.8, 'die helle Fläche ist nicht hell');
        assert.ok(read(darkBlock, '--surface-1') < 0.2, 'die dunkle Fläche ist nicht dunkel');
        assert.ok(read(light, '--ink') < 0.2);
        assert.ok(read(darkBlock, '--ink') > 0.8);
    });

    it('bleibt bei blau↔rot, auch dunkel', () => {
        const m = darkBlock.match(/--dv-pos:\s*#([0-9a-fA-F]{6})/);
        const [r, g, b] = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
        assert.ok(b > g && b > r, `--dv-pos #${m[1]} ist im Dunkelmodus kein Blau`);
    });

    it('kommt ohne eine einzige zusätzliche Regel aus', () => {
        // Der ganze Dunkelmodus ist ein :root-Block. Alles, was
        // Selektoren dupliziert, wäre der Anfang des zweiten
        // Stylesheets, das hier vermieden werden soll.
        const rules = darkBlock.match(/^\s*[.#\[a-zA-Z][^\n{]*\{/gm) || [];
        assert.deepEqual(rules.filter(r => !r.includes(':root')), []);
    });

    it('components.css braucht dafür keine Zeile Änderung', () => {
        assert.doesNotMatch(stripComments(COMP), /data-theme/);
    });
});

describe('wie weit die Seite dafür ist', () => {
    it('der Zähler fest verdrahteter heller Flächen steigt nicht', () => {
        // 610 vor Phase 3, 603 danach, 465 nach dem Durchgang vom
        // 27.08.2026 (Bauteil-Stylesheets auf Tokens, dazu dunkle Werte
        // für die alten --bg-*/--text-*- und die --ui-*-Familie). Jede
        // Fläche, die hier verschwindet, ist eine, die im Dunkelmodus
        // nicht weiß stehenbleibt.
        // 448 nach dem 28.08.2026: das Fenster-Grundgeruest
        // (.ui-modal-panel, .rarity-switcher-modal-content), die
        // Umschalter-Gruppe (vier Ansichten) und die Staples-Kachel.
        /* 28.08.2026, zweiter Durchgang: die Grundlinie stand auf 446,
           gezaehlt wurden aber nur 445 — sie war eine Flaeche zu locker
           und haette einen Rueckfall nicht gemerkt. Jetzt auf den
           wirklich gezaehlten Stand gesetzt.
           445 -> 417: meta-call.css hatte 28 getoente Flaechen als harte
           Hex-Werte, obwohl die Datei seit dem 11.06. einen eigenen
           Dunkelsatz hat. Sie haengen jetzt an fuenf Toenungs-Token mit
           Bedeutung (info/ok/warn/bad/personal), damit Gelb im Dunkeln
           Gelb bleibt und nicht Grau wird.
           417 -> 320: firebase-collection.js (Sammlung, Wunschliste,
           Tauschliste) von Inline-Farben auf Token, side-quest.css und
           profile-howto-info.css auf Flaechen-Token. Dabei mussten 43
           feste dunkle Textfarben mitgezogen werden — eine Flaeche
           umzustellen und den Text stehenzulassen ergibt dunkel auf
           dunkel. */
        const BASELINE = 320;
        const now = countHardcodedLightSurfaces();
        assert.ok(now <= BASELINE,
            `fest verdrahtete helle Flächen: ${now} (erlaubt: ${BASELINE})`);
    });

    it('die sichtbarste Chrome ist umgestellt', () => {
        // Diese sieben tragen den größten Teil der Fläche auf den beiden
        // Ansichten, die Phase 1 und 2 umgebaut haben.
        [/\.tabs-container \{[^}]*background: var\(--surface-1\)/,
         /\.tier-section \{[^}]*background: var\(--surface-2\)/,
         /\.tier-hero-section \{[^}]*background: var\(--surface-1\)/,
         /\.meta-hub-tile \{[^}]*background: var\(--surface-1\)/,
         /\.meta-hub-subnav \{[^}]*background: var\(--surface-1\)/]
            .forEach(re => assert.match(STYLES, re, `nicht umgestellt: ${re}`));
        const cl = fs.readFileSync(path.join(ROOT, 'css', 'city-league.css'), 'utf8');
        assert.match(cl, /\.current-meta-content \{[^}]*background: var\(--surface-1\)/);
    });

    it('der Movers-Block holt Fläche und Kante aus der Komponente', () => {
        assert.doesNotMatch(stripComments(STYLES), /\.tier-movers-block \{\s*background: #f9fafb/);
        const tier = fs.readFileSync(path.join(ROOT, 'js', 'app-tier-meta.js'), 'utf8');
        assert.match(tier, /class="ds-panel tier-movers-block/);
    });

    it('es gibt noch keinen Schalter — und das ist Absicht', () => {
        // Ein halb dunkles Interface ist schlechter als ein helles.
        // Wenn hier jemand einen Schalter einbaut, muss er vorher den
        // Zähler oben gedrückt haben, sonst bricht dieser Test.
        const js = fs.readdirSync(path.join(ROOT, 'js'))
            .filter(f => f.endsWith('.js'))
            .map(f => fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'))
            .join('\n');
        const setsTheme = /setAttribute\(\s*['"]data-theme['"]/.test(js);
        if (setsTheme) {
            assert.ok(countHardcodedLightSurfaces() < 60,
                'ein Umschalter braucht erst den Zähler unter 60 — sonst wird die Seite ein Flickenteppich');
        }
    });
});
