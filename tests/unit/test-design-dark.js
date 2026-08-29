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

/* Fest verdrahtete DUNKLE Textfarben: das, was im Dunkelmodus auf
 * dunklem Grund verschwindet.
 *
 * Dieser Zaehler fehlte bis zum 29.08.2026, und das war die Luecke, die
 * am meisten gekostet hat. Der Zaehler darunter sieht nur Flaechen. Am
 * 28.08. galt die Startseite deshalb als fertig — 0 helle Flaechen —
 * waehrend im Browser gemessen 1348 Textstellen unter der WCAG-Grenze
 * lagen, die allermeisten dunkelgrau auf dunkelblau bei 1,21:1. Ein
 * halber Zaehler meldet halbe Wahrheiten, und zwar immer die
 * angenehmere.
 *
 * Die beiden gehoeren zusammen: eine Flaeche umzustellen und den Text
 * stehenzulassen ergibt dunkel auf dunkel; nur den Text umzustellen
 * ergibt hell auf hell. Beides ist schon passiert. */
function countHardcodedDarkInk() {
    return fs.readdirSync(path.join(ROOT, 'css'))
        .filter(f => f.endsWith('.css'))
        .reduce((total, f) => {
            const txt = stripComments(fs.readFileSync(path.join(ROOT, 'css', f), 'utf8'));
            // Nur `color:`, nicht `border-color:`/`background-color:`.
            const decls = txt.match(/(?<![-a-zA-Z])color\s*:\s*[^;{}]+[;}]/g) || [];
            return total + decls.filter(d => {
                const val = d.slice(d.indexOf(':') + 1);
                if (val.includes('var(')) return false;
                const hexes = val.match(/#[0-9a-fA-F]{3,6}\b/g);
                return !!hexes && hexes.every(h => (luminance(h) ?? 1) < 0.30);
            }).length;
        }, 0);
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
           dunkel.
           320 -> 316: die drei Tier-Toenungen und der leere
           Movers-Block. Live gemessen waren das die groessten hellen
           Flaechen der ganzen Seite — je 1720 px breit.
           316 -> 295: City League (Kasten, Tabelle, Tier-Kacheln),
           die Anleitungs-Verlaeufe und der Platzhalter hinter den
           Kartenbildern. Verlaeufe hatte dieser Zaehler bis dahin
           mitgezaehlt, die Messung im Browser aber nicht — sie las nur
           backgroundColor. Ein Verlauf von Weiss nach Fastweiss ist
           eine weisse Flaeche. */
        const BASELINE = 295;
        const now = countHardcodedLightSurfaces();
        assert.ok(now <= BASELINE,
            `fest verdrahtete helle Flächen: ${now} (erlaubt: ${BASELINE})`);
    });

    it('der Zähler fest verdrahteter dunkler Textfarben steigt nicht', () => {
        /* Die andere Haelfte, siehe die Notiz an countHardcodedDarkInk.
           Am 29.08.2026 auf den gemessenen Stand gesetzt: 212 (von 215
           vor dem Durchgang desselben Tages). Vorher gab es diesen
           Zaehler gar nicht, deshalb keine Reihe frueherer Werte — die
           faengt hier an. */
        const BASELINE_INK = 212;
        const now = countHardcodedDarkInk();
        assert.ok(now <= BASELINE_INK,
            `fest verdrahtete dunkle Textfarben: ${now} (erlaubt: ${BASELINE_INK})`);
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

describe('die Anleitungs-Mockups sind eine helle Insel', () => {
    /* Die Mockups zeichnen die Oberflaeche nach — sie sind gemalte
       Bildschirmfotos. Ein Bildschirmfoto dreht nicht mit, wenn der
       Leser das Licht ausmacht, sonst zeigt es etwas, das es nie gab.
       Deshalb behalten sie im Dunkelmodus ihre eigene helle Farbwelt,
       statt Regel fuer Regel umgestellt zu werden: 66 Flaechen und 88
       Textfarben, die zusammen schon stimmen.

       Der Fallstrick dabei ist die HALBE Insel. Beim ersten Versuch
       standen nur --surface-* und --ink* drin; --brand-ink behielt
       seinen Dunkelmodus-Wert und malte helles Blau auf den weissen
       Mockup-Grund, 2,61:1. Diese Zusage haelt fest, dass alle Token,
       die drinnen als Textfarbe vorkommen, auch drinnen gesetzt sind. */
    const HOWTO = fs.readFileSync(path.join(ROOT, 'css', 'profile-howto-info.css'), 'utf8');
    const insel = (HOWTO.match(/\[data-theme="dark"\]\s*\.tutorial-mockup\s*\{[^}]*\}/) || [])[0];

    it('die Insel existiert', () => {
        assert.ok(insel, '[data-theme="dark"] .tutorial-mockup fehlt');
        assert.match(insel, /color:\s*var\(--ink\)/,
            'ohne eigene Textfarbe erbt der Kasten die helle des Dunkelmodus');
    });

    it('sie setzt jeden Token neu, den sie drinnen benutzt', () => {
        /* Die Insel faengt bei der ERSTEN `.tutorial-mockup .mockup-*`
           Regel an, nicht bei `.mockup-hub-tiles`. Genau daran ist
           die erste Fassung dieser Zusage gescheitert: sie schnitt zu
           spaet, `.tutorial-mockup .mockup-pill` lag davor, und das
           Entfernen von --brand-ink aus der Insel blieb unbemerkt.
           Gefunden durch Mutationspruefung, nicht durch Nachdenken. */
        const iMock = HOWTO.indexOf('.tutorial-mockup .mockup-header');
        assert.ok(iMock > 0, 'Inselanfang nicht gefunden');
        const drinnen = HOWTO.slice(iMock);
        const benutzt = new Set(
            [...drinnen.matchAll(/(?<![-a-zA-Z])color:\s*var\((--[a-z0-9-]+)\)/g)].map(m => m[1]));
        const gesetzt = new Set(
            [...insel.matchAll(/(--[a-z0-9-]+):/g)].map(m => m[1]));
        const fehlt = [...benutzt].filter(t => !gesetzt.has(t));
        assert.deepEqual(fehlt, [],
            'als Textfarbe benutzt, aber in der Insel nicht neu gesetzt — '
            + 'diese Token behalten drinnen ihren Dunkelmodus-Wert: ' + fehlt.join(', '));
    });

    it('der Bereich ausserhalb der Mockups laeuft dagegen ueber Token', () => {
        // Genau umgekehrt: oberhalb von .mockup-hub-tiles darf keine
        // feste dunkle Textfarbe mehr stehen. 25 waren es am 29.08.,
        // 569 Textstellen unter der Grenze gingen darauf zurueck.
        const draussen = stripComments(HOWTO.slice(0, HOWTO.indexOf('.tutorial-mockup .mockup-header')));
        const fest = (draussen.match(/(?<![-a-zA-Z])color:\s*(#[0-9a-fA-F]{3,6})/g) || [])
            .filter(d => (luminance(d.match(/#[0-9a-fA-F]{3,6}/)[0]) ?? 1) < 0.30);
        assert.deepEqual(fest, [], 'feste dunkle Textfarbe ausserhalb der Insel: ' + fest.join(' | '));
    });
});
