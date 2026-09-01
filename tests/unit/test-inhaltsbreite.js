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
    let m = s.match(/^([\d.]+)px$/);
    if (m) return parseFloat(m[1]);
    m = s.match(/^([\d.]+)vw$/);
    if (m) return parseFloat(m[1]) / 100 * fensterBreite;
    m = s.match(/^([\d.]+)%$/);
    if (m) return parseFloat(m[1]) / 100 * elternBreite;
    throw new Error('Einheit unbekannt in der Breitenregel: ' + s);
}

/* body traegt links und rechts --page-gutter; auf dem Schreibtisch
   sind das 20px. Der Elternkasten ist also das Fenster minus 40. */
const GUTTER = 20;
const eltern = (fenster) => fenster - 2 * GUTTER;

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
