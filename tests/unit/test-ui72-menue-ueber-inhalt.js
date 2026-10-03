/**
 * UI-72 (03.10.2026): Das Pokeball-Menue lag auf der Startseite UNTER dem
 * Seiteninhalt. `.cards-header > *` hat z-index 1, `.cards-header` selbst
 * bildet keinen eigenen Stapel — damit konkurrierte das aufgeklappte Menue
 * mit jedem positionierten Element der Seite. Gemessen (Tiefenanalyse
 * 03.10., `202610031822-6419a97`): 8 bis 15 von 17 Menuepunkten verdeckt
 * (`heatmap-th-row` sticky z 2, `tier-hero-content`, `ds-tabbar-btn`),
 * ein echter Klick auf „Meta Call" oeffnete eine Archetyp-Analyse.
 *
 * Diese Datei rechnet die wirksame Stapelhoehe der Menuezeile aus dem CSS
 * aus (Spezifitaet: die spezifischere Regel gewinnt, Tokens aufgeloest) und
 * verlangt: hoeher als jedes klebende Element und als die Handy-Reiterleiste,
 * aber unter dem Modal-Hintergrund.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const CSS_DIR = path.join(ROOT, 'css');
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const DATEIEN = fs.readdirSync(CSS_DIR).filter((f) => f.endsWith('.css'))
    .map((f) => ({ f, css: ohneKommentare(fs.readFileSync(path.join(CSS_DIR, f), 'utf8')) }));

const TOKENS = {};
for (const { css } of DATEIEN) {
    for (const m of css.matchAll(/(--z-[a-z-]+)\s*:\s*(\d+)\s*;/g)) TOKENS[m[1]] = Number(m[2]);
}

function wert(roh) {
    let s = String(roh).replace('!important', '').trim();
    s = s.replace(/var\((--z-[a-z-]+)\)/g, (_, t) => {
        assert.ok(t in TOKENS, `Token ${t} ist nirgends definiert`);
        return String(TOKENS[t]);
    });
    const calc = s.match(/^calc\((.+)\)$/);
    if (calc) s = calc[1];
    assert.match(s, /^[\d\s+\-*]+$/, `z-index nicht auswertbar: ${roh}`);
    // eslint-disable-next-line no-new-func
    return Function(`return (${s});`)();
}

/** Alle Regeln (Selektor, Rumpf) — Medienabfragen werden flach mitgelesen. */
function regeln(css) {
    const out = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(css))) out.push({ sel: m[1].trim(), body: m[2] });
    return out;
}

const ALLE = DATEIEN.flatMap(({ f, css }) => regeln(css).map((r) => ({ ...r, f })));

function menueZeileZ() {
    // Nur Regeln, die die Menuezeile im Kopf treffen. Die spezifischste
    // (letzte bei Gleichstand) gewinnt — wie im Browser.
    const spez = (sel) => (sel.match(/[.#][\w-]+/g) || []).length;
    const treffer = ALLE.filter((r) => /z-index/.test(r.body)).flatMap((r) =>
        r.sel.split(',').map((s) => s.trim())
            .filter((s) => s === '.cards-header > *' || /^\.cards-header\s*>\s*\.header-flex-row$/.test(s)
                || s === '.header-flex-row' || s === '.cards-header .header-flex-row')
            .map((s) => ({ s, spez: spez(s), z: r.body.match(/z-index\s*:\s*([^;]+)/)[1] })));
    assert.ok(treffer.length > 0, 'keine z-index-Regel fuer die Menuezeile gefunden');
    treffer.sort((a, b) => a.spez - b.spez);
    return wert(treffer[treffer.length - 1].z);
}

describe('UI-72: das Hauptmenue liegt ueber dem Seiteninhalt', () => {
    const z = menueZeileZ();

    it('hoeher als jedes klebende Element der Seite (Playtester-Overlay ausgenommen)', () => {
        const kleben = ALLE.filter((r) => /position\s*:\s*sticky/.test(r.body) && /z-index/.test(r.body)
            && !/^\.pt-/.test(r.sel));
        assert.ok(kleben.length >= 10, `zu wenige klebende Regeln gefunden (${kleben.length}) — Leser kaputt?`);
        for (const r of kleben) {
            const zr = wert(r.body.match(/z-index\s*:\s*([^;]+)/)[1]);
            assert.ok(z > zr, `${r.f}: „${r.sel}" (z ${zr}) liegt ueber der Menuezeile (z ${z})`);
        }
    });

    it('hoeher als die Handy-Reiterleiste', () => {
        const leiste = ALLE.find((r) => r.sel === '.ds-tabbar' && /z-index/.test(r.body));
        assert.ok(leiste, 'Regel .ds-tabbar mit z-index fehlt');
        assert.ok(z > wert(leiste.body.match(/z-index\s*:\s*([^;]+)/)[1]));
    });

    it('unter dem Modal-Hintergrund, damit Dialoge darueber bleiben', () => {
        assert.ok(z < TOKENS['--z-modal-backdrop'], `Menuezeile z ${z} >= Modal ${TOKENS['--z-modal-backdrop']}`);
    });
});
