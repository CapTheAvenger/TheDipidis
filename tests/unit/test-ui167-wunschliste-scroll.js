/**
 * UI-167 (Hausi 25.11.2026, iPhone): „+“ in der Wunschliste baut das Raster neu,
 * die Seite sprang und man musste zur Karte zurueckscrollen.
 * Gehalten wird das VERHALTEN von wunschAnkerMerken/wunschAnkerHalten (vm) und
 * dass updateWishlistUI den Neuaufbau damit einrahmt.
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const FC = fs.readFileSync(path.join(ROOT, 'js', 'firebase-collection.js'), 'utf8');
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const FCK = ohneKommentare(FC);
assert.ok(FCK.length > FC.length * 0.3, 'das Ausschneiden hat zu viel entfernt');

function schneide(quelle, name) {
    const m = new RegExp(`function\\s+${name}\\s*\\(`).exec(quelle);
    assert.ok(m, `Funktion nicht gefunden: ${name}`);
    let tiefe = 0;
    for (let i = quelle.indexOf('{', m.index); i < quelle.length; i++) {
        if (quelle[i] === '{') tiefe++;
        else if (quelle[i] === '}' && --tiefe === 0) return quelle.slice(m.index, i + 1);
    }
    throw new Error('Klammer offen: ' + name);
}

/* Gebautes Raster: Kacheln mit Position im Fenster. */
function kachel(id, top) { return { dataset: { wunschId: id }, getBoundingClientRect: () => ({ top, bottom: top + 400 }) }; }
function raster(kacheln) { return { children: kacheln, addEventListener() {} }; }

function lauf() {
    const gescrollt = [];
    const ctx = { window: { scrollBy: (o) => gescrollt.push(o.top) } };
    vm.createContext(ctx);
    vm.runInContext(['wunschKacheln', 'wunschAnkerMerken', 'wunschAnkerHalten'].map(n => schneide(FCK, n)).join('\n')
        + '\nthis.merken = wunschAnkerMerken; this.halten = wunschAnkerHalten;', ctx);
    return { ctx, gescrollt };
}

describe('Wunschliste: die angetippte Karte bleibt stehen', () => {
    it('rueckt die zuletzt angetippte Kachel an ihre alte Stelle', () => {
        const { ctx, gescrollt } = lauf();
        const g = raster([kachel('A', -500), kachel('B', 300)]);
        g._wunschZuletzt = 'B';
        const anker = ctx.merken(g);
        assert.deepStrictEqual({ ...anker }, { id: 'B', top: 300 });
        g.children = [kachel('A', -1100), kachel('B', -300)];   // nach dem Neuaufbau 600 px hoeher
        ctx.halten(g, anker);
        assert.deepStrictEqual(gescrollt, [-600]);
    });
    it('ohne Antippen gilt die erste sichtbare Kachel', () => {
        const { ctx } = lauf();
        const g = raster([kachel('A', -500), kachel('B', 120)]);
        assert.strictEqual(ctx.merken(g).id, 'B');
    });
    it('scrollt nicht, wenn nichts verrutscht ist', () => {
        const { ctx, gescrollt } = lauf();
        const g = raster([kachel('B', 300)]);
        const anker = ctx.merken(g);
        ctx.halten(g, anker);
        assert.deepStrictEqual(gescrollt, []);
    });
    it('updateWishlistUI rahmt den Neuaufbau ein und das Bild reserviert seine Hoehe', () => {
        const f = schneide(FCK, 'updateWishlistUI');
        assert.match(f, /const anker = wunschAnkerMerken\(wishlistGrid\);\s*wishlistGrid\.innerHTML = wishlistHtml\.join\(''\);\s*wunschAnkerHalten\(wishlistGrid, anker\);/);
        assert.match(f, /data-wunsch-id="\$\{escapeHtml\(cardId\)\}"/);
        assert.match(f, /<img src="\$\{safeImageAttr\}"[^>]*aspect-ratio: 2\.5 \/ 3\.5/);
    });
});

/* UI-168 (Hausi 25.11.2026): Schnellfilter „Nur Meta-Karten“ (Majors-Daten). */
describe('Wunschliste: Nur Meta-Karten', () => {
    function istMeta(daten) {
        const ctx = { window: { majorKartenmengen: daten } };
        vm.createContext(ctx);
        vm.runInContext(schneide(FCK, 'wunschIstMeta') + '\nthis.f = wunschIstMeta;', ctx);
        return ctx.f;
    }
    it('Meta ist, was in den Major-Daten steht — Print fuer Print', () => {
        const f = istMeta({ karten: { 'DLR-94': { decks: 23, meist: 2, max: 2 } } });
        assert.strictEqual(f('dlr', '94'), true);
        assert.strictEqual(f('DLR', '36'), false);
    });
    it('ohne geladene Daten wird nichts weggefiltert', () => {
        assert.strictEqual(istMeta(undefined)('DLR', '36'), true);
    });
    it('der Filter greift in updateWishlistUI und zaehlt als Filter', () => {
        const f = schneide(FCK, 'updateWishlistUI');
        assert.match(f, /if \(window\.wunschNurMeta && !wunschIstMeta\(cardSet, cardNumber\)\) return;/);
        assert.match(f, /const isFiltered = searchFilter \|\| setFilter \|\| window\.wunschNurMeta;/);
        const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
        assert.match(html, /id="wishlist-meta-filter" onclick="wunschMetaFilterUmschalten\(\)"[^>]*aria-pressed="false"/);
    });
});
