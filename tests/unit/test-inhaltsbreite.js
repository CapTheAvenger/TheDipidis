/**
 * Die Inhaltsbreite darf keinen Deckel in Pixeln haben.
 *
 * VORGESCHICHTE
 *
 * Der Deckel wurde dreimal gesetzt und zweimal zu klein: 1400px (bei
 * 1366px gemessenen Schirmen zu gross, bei 1920px zu klein), dann
 * 1440px, dann clamp(...,2040px). Am 01.09.2026 stand er auf einem
 * 3440px-Ultrawide erneut im Weg — 887px leerer Rand je Seite.
 *
 * Ein Deckel in Pixeln kann das grundsaetzlich nicht loesen, weil er
 * die naechstgroessere Bildschirmdiagonale nicht kennt. Dieser Test
 * prueft deshalb nicht die Schreibweise der Regel, sondern ihr
 * Verhalten: er rechnet die CSS-Funktion fuer echte Fensterbreiten aus
 * und verlangt, dass die Inhaltsbreite mit dem Fenster mitwaechst.
 *
 * Er faellt, sobald jemand wieder eine feste Obergrenze einbaut —
 * egal, ob als max-width, clamp() oder min() mit Pixelwert.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const CSS = fs.readFileSync(
    path.join(__dirname, '..', '..', 'css', 'styles.css'), 'utf8');

/* Die width-Deklaration des Seiten-Containers aus der Datei holen.
   Absichtlich ueber den Selektor und nicht ueber eine Zeilennummer:
   verschiebt jemand den Block, soll der Test ihn weiter finden. */
function containerWidthAusdruck(css) {
    const i = css.indexOf('\n        .container {');
    assert.ok(i > -1, '.container-Regel nicht gefunden');
    const block = css.slice(i, css.indexOf('}', i));
    const m = block.match(/\bwidth:\s*([^;]+);/);
    assert.ok(m, 'keine width-Deklaration im .container-Block');
    return m[1].replace(/\s+/g, ' ').trim();
}

/* body traegt links und rechts --page-gutter; auf dem Schreibtisch
   sind das 20px. Der Elternkasten ist also das Fenster minus 40. */
const GUTTER = 20;
const eltern = (fenster) => fenster - 2 * GUTTER;

/* Ein winziger Rechner fuer die drei CSS-Funktionen, die hier
   vorkommen. Er kennt px, vw und % — mehr braucht die Regel nicht,
   und mehr zu kennen wuerde nur verdecken, wenn jemand eine vierte
   Einheit einfuehrt: dann faellt der Test mit "Einheit unbekannt". */
function rechne(ausdruck, fensterBreite, elternBreite) {
    const s = ausdruck.trim();
    const fn = s.match(/^(min|max|clamp)\((.*)\)$/);
    if (fn) {
        const teile = [];
        let tiefe = 0, akt = '';
        for (const c of fn[2]) {
            if (c === '(') tiefe++;
            if (c === ')') tiefe--;
            if (c === ',' && tiefe === 0) { teile.push(akt); akt = ''; continue; }
            akt += c;
        }
        teile.push(akt);
        const w = teile.map(t => rechne(t, fensterBreite, elternBreite));
        if (fn[1] === 'min') return Math.min(...w);
        if (fn[1] === 'max') return Math.max(...w);
        return Math.min(Math.max(w[0], w[1]), w[2]);   /* clamp(min, val, max) */
    }
    /* var(--page-gutter) und einfache Rechnung. Kam am 02.09.2026 dazu,
       als .meta-hub-container mit in die Pruefung genommen wurde: dort
       steht `100% - 2 * var(--page-gutter)`. Bewusst eng gehalten — der
       Rechner soll bei einer fuenften Einheit weiter abbrechen, statt zu
       raten. */
    const VARS = { '--page-gutter': GUTTER };
    let m = s.match(/^var\((--[\w-]+)\)$/);
    if (m) {
        assert.ok(m[1] in VARS, 'unbekannte CSS-Variable: ' + m[1]);
        return VARS[m[1]];
    }
    // Subtraktion auf oberster Ebene, links nach rechts.
    let tiefe2 = 0;
    for (let i = s.length - 1; i > 0; i--) {
        const c = s[i];
        if (c === ')') tiefe2++;
        if (c === '(') tiefe2--;
        if (c === '-' && tiefe2 === 0 && /[\s)%\w]/.test(s[i - 1] || '')) {
            return rechne(s.slice(0, i), fensterBreite, elternBreite)
                 - rechne(s.slice(i + 1), fensterBreite, elternBreite);
        }
    }
    m = s.match(/^([\d.]+)\s*\*\s*(.+)$/);
    if (m) return parseFloat(m[1]) * rechne(m[2], fensterBreite, elternBreite);

    m = s.match(/^([\d.]+)px$/);
    if (m) return parseFloat(m[1]);
    m = s.match(/^([\d.]+)vw$/);
    if (m) return parseFloat(m[1]) / 100 * fensterBreite;
    m = s.match(/^([\d.]+)%$/);
    if (m) return parseFloat(m[1]) / 100 * elternBreite;
    throw new Error('Einheit unbekannt in der Breitenregel: ' + s);
}


test('der Rechner selbst stimmt (sonst prueft er nichts)', () => {
    assert.strictEqual(rechne('min(100%, 800px)', 1000, 960), 800);
    assert.strictEqual(rechne('max(1440px, 92vw)', 1000, 960), 1440);
    assert.strictEqual(rechne('clamp(100px, 50vw, 300px)', 1000, 960), 300);
    assert.throws(() => rechne('4em', 1000, 960), /Einheit unbekannt/);
});

test('Inhaltsbreite waechst mit dem Fenster und hat keinen Pixel-Deckel', () => {
    const a = containerWidthAusdruck(CSS);

    /* Auf Laptop und Tablet aendert sich nichts: 100 % greift zuerst. */
    assert.strictEqual(Math.round(rechne(a, 1366, eltern(1366))), 1326);
    assert.strictEqual(Math.round(rechne(a, 1024, eltern(1024))), 984);

    /* Ab dem Schreibtisch waechst sie mit. */
    const b1920 = rechne(a, 1920, eltern(1920));
    const b2560 = rechne(a, 2560, eltern(2560));
    const b3440 = rechne(a, 3440, eltern(3440));
    assert.ok(b1920 > 1700 && b1920 < 1800, 'auf 1920px erwartet ~1766, ist ' + b1920);
    assert.ok(b2560 > b1920, 'von 1920 auf 2560 muss die Breite zunehmen');
    assert.ok(b3440 > b2560, 'von 2560 auf 3440 muss die Breite zunehmen');

    /* Der eigentliche Punkt: kein fester Deckel, in keiner Schreibweise.
       Auf dem gemeldeten 3440er duerfen hoechstens 8 % Rand bleiben. */
    assert.ok(b3440 >= 0.9 * 3440,
        'auf 3440px bleiben ' + Math.round(3440 - b3440) + 'px Rand — ein Deckel ist zurueck');
    const b5000 = rechne(a, 5000, eltern(5000));
    assert.ok(b5000 >= 0.9 * 5000,
        'auf 5000px bleiben ' + Math.round(5000 - b5000) + 'px Rand — ein Deckel ist zurueck');
});

test('Fliesstext bekommt den Deckel, den der Container nicht mehr hat', () => {
    /* Ohne diese Regel waere die vorige Aenderung ein Rueckschritt:
       eine Textzeile ueber 3000px liest niemand. Geprueft wird, dass
       die Klassen, die auf der Startseite echten Fliesstext tragen,
       in einer Regel mit ch-Deckel stehen. */
    const i = CSS.indexOf('.side-quest-intro,');
    assert.ok(i > -1, 'Fliesstext-Regel nicht gefunden');
    const block = CSS.slice(i, CSS.indexOf('}', i));
    for (const kl of ['.ds-note', '.heatmap-desc', '.qu-p']) {
        assert.ok(block.includes(kl + ',') || block.includes(kl + ' '),
            kl + ' fehlt in der Fliesstext-Regel');
    }
    assert.match(block, /max-width:\s*\d+ch/, 'kein ch-Deckel fuer Fliesstext');
});

test('kein zweiter Pixel-Deckel in Meta Call oder City League', () => {
    const mc = fs.readFileSync(
        path.join(__dirname, '..', '..', 'css', 'meta-call.css'), 'utf8');
    const i = mc.indexOf('.metacall-wrap {');
    assert.ok(i > -1);
    const block = mc.slice(i, mc.indexOf('}', i));
    assert.ok(!/max-width:\s*\d+px/.test(block),
        '.metacall-wrap hat wieder einen Pixel-Deckel');

    const j = CSS.indexOf('.city-league-container {');
    assert.ok(j > -1);
    const clBlock = CSS.slice(j, CSS.indexOf('}', j));
    assert.ok(!/\bwidth:\s*min\([^)]*\d+px/.test(clBlock),
        '.city-league-container hat wieder einen Pixel-Deckel');
});

/* ─────────────────────────────────────────────────────────────────
   NACHTRAG 02.09.2026 — der Deckel sass nicht nur an EINER Stelle.

   `.container` war seit dem 01.09. befreit, und der Test hier bewachte
   genau ihn. Bei der Durchsicht fielen sechs WEITERE Ansichts-Container
   auf, die weiter auf festen Pixelwerten standen und auf 2560/3440 px
   nicht mitwuchsen — der Test deckte sie schlicht nicht ab.

   Drei tragen Gitter und Tabellen und wachsen jetzt mit. Zwei bleiben
   mit Absicht schmal, und das steht hier fest, damit niemand sie aus
   Versehen "mitrepariert". Eine war tote Regel ohne einen einzigen
   Benutzer und ist entfernt. */

const TG  = fs.readFileSync(
    path.join(__dirname, '..', '..', 'css', 'testing-groups.css'), 'utf8');
const CL  = fs.readFileSync(
    path.join(__dirname, '..', '..', 'css', 'city-league.css'), 'utf8');

function widthAusRegel(cssRoh, selektor) {
    /* Kommentare zuerst weg: `.proxy-container {` steht in
       css/city-league.css:495 zuerst INNERHALB eines Kommentars, der auf
       eine andere Datei verweist. Ohne diesen Schritt las der Test die
       Begruendung statt der Regel — derselbe Fehler, der am selben Tag
       schon test-blueten-kopf.js auf den Kopf gestellt hatte. */
    const css = cssRoh.replace(/\/\*[\s\S]*?\*\//g, ' ');
    const i = css.indexOf(selektor + ' {');
    assert.ok(i > -1, selektor + ' nicht gefunden');
    const block = css.slice(i, css.indexOf('}', i));
    const m = block.match(/\bwidth:\s*([^;]+);/);
    assert.ok(m, 'keine width-Deklaration in ' + selektor);
    return m[1].replace(/\s+/g, ' ').trim();
}

test('die Ansichten mit Gittern und Tabellen wachsen ebenfalls mit', () => {
    const faelle = [
        ['.meta-hub-container', CSS, 'Kategorie-Kacheln der Meta-Startseite'],
        ['.tg-wrap',            TG,  'Gruppentabellen der Testing Groups'],
        ['.proxy-container',    CL,  'Kartengitter des Proxy-Druckers'],
    ];
    for (const [sel, css, was] of faelle) {
        const a = widthAusRegel(css, sel);
        const b2560 = rechne(a, 2560, eltern(2560));
        const b3440 = rechne(a, 3440, eltern(3440));
        assert.ok(b3440 > b2560,
            `${sel} (${was}) waechst von 2560 auf 3440 nicht mit — ein `
            + `Pixel-Deckel ist zurueck: ${a}`);
        assert.ok(b3440 >= 0.88 * 3440,
            `${sel} laesst auf 3440px ${Math.round(3440 - b3440)}px Rand — `
            + `zu viel fuer eine Ansicht, die Daten traegt (${a})`);
    }
});

test('die Ansichten mit Text und Bedienelementen bleiben schmal', () => {
    /* Kein Versehen, sondern der Gegenpol: eine Anleitung auf 3440px ist
       unlesbar, und zwei zusammengehoerende Schalter liegen dort einen
       halben Meter auseinander. Wer diese beiden "mitrepariert", macht
       es schlechter — deshalb steht es hier. */
    assert.match(CL, /\.tutorial-main-container \{[^}]*max-width:\s*\d+px/,
        'die Anleitung hat ihren Deckel verloren — Fliesstext ueber 2000px '
        + 'liest niemand');
    assert.match(CSS, /\.filter-section-main > div:nth-child\(2\) \{[^}]*max-width:\s*\d+px/,
        'die Filterzeile hat ihren Deckel verloren — dort stehen Suchfeld '
        + 'und Schalter, keine Daten');
});

test('die tote 1400er-Regel ist weg und kommt nicht zurueck', () => {
    /* `.analysis-container` hatte keinen einzigen Benutzer in index.html,
       js/ oder den Vorlagen, sah aber wie ein echter Deckel aus und stand
       bei jeder Suche nach "warum waechst das nicht mit" im Weg. Die
       Ansicht heisst .meta-card-analysis-container. */
    const ohneKomm = CSS.replace(/\/\*[\s\S]*?\*\//g, ' ');
    assert.ok(!/(^|[},\s])\.analysis-container\s*\{/.test(ohneKomm),
        '.analysis-container ist zurueck — eine Regel ohne Benutzer, die '
        + 'wie ein Deckel aussieht');
});
