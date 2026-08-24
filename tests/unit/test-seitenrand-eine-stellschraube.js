/**
 * Der Seitenrand hat EINE Stellschraube: --page-gutter.
 *
 * Vorgeschichte: der Betreiber wollte die volle Bildschirmbreite nutzen.
 * PR #489 setzte dafuer --page-gutter auf 0 — aber nur die Seitenhuelle lief
 * ueber das Token. Mehrere Flaechen trugen ihren eigenen, fest verdrahteten
 * Innenabstand, und der kam OBENDRAUF:
 *
 *   .current-meta-content   24 px je Seite   (Meta-Tab)
 *   .cl-content-panel       12 px je Seite   (City League)
 *   .meta-hub-container     12 px je Seite   + 32 px in der Breitenformel
 *
 * Auf 390 px kam die Matchup-Heatmap dadurch auf 314 statt 362 px, waehrend
 * die Empfehlungskarte daneben — die ausserhalb dieser Flaechen sitzt —
 * die vollen 388 px nutzte. Genau dieser Unterschied ist aufgefallen.
 *
 * Der Unterschied, auf den es ankommt:
 *   KARTE   sichtbare Flaeche (Grund, Rahmen, Radius, Schatten) -> Innenabstand
 *           gehoert hin, er haelt Text vom eigenen Rand weg. Bleibt.
 *   FLAECHE randlos, ohne Radius, ohne Schatten -> ihr Innenabstand IST der
 *           Seitenrand und gehoert ans Token.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const CSS = path.join(__dirname, '..', '..', 'css');
const lies = f => fs.readFileSync(path.join(CSS, f), 'utf8');
/** Ohne Kommentare — sonst loest die eigene Erklaerung im Quelltext den Test aus. */
const liesOhneKommentar = f => lies(f).replace(/\/\*[\s\S]*?\*\//g, '');

/** Den Regelkoerper eines Selektors holen (erste Fundstelle). */
function regel(quelltext, selektor) {
    const i = quelltext.indexOf(selektor + ' {');
    if (i < 0) return null;
    const j = quelltext.indexOf('}', i);
    return quelltext.slice(i, j);
}

const FLAECHEN = [
    { datei: 'city-league.css',  sel: '.current-meta-content', was: 'die Seitenflaeche des Meta-Tabs' },
    { datei: 'ui-components.css', sel: '.cl-content-panel',    was: 'die Seitenflaeche der City League' },
    { datei: 'styles.css',        sel: '.meta-hub-container',  was: 'der Rahmen des Meta-Hubs' }
];

describe('Seitenrand: die randlosen Flaechen laufen ueber das Token', () => {
    for (const f of FLAECHEN) {
        it(`${f.sel} — ${f.was}`, () => {
            const r = regel(lies(f.datei), f.sel);
            assert.ok(r, `${f.sel} nicht in ${f.datei} gefunden`);
            const pad = r.match(/padding:\s*([^;]+);/);
            assert.ok(pad, `${f.sel} hat keine padding-Regel mehr`);
            assert.match(pad[1], /--page-gutter/,
                `${f.sel} verdrahtet den waagerechten Abstand fest ("${pad[1].trim()}") — `
                + 'er kommt damit ZUSAETZLICH zum Seitenrand und laesst sich nicht '
                + 'an einer Stelle regeln');
        });
    }

    it('der Meta-Hub hat den Rand nicht zusaetzlich in der Breitenformel', () => {
        const r = regel(lies('styles.css'), '.meta-hub-container');
        const w = r.match(/width:\s*([^;]+);/);
        assert.ok(w, 'keine width-Regel');
        assert.ok(!/100%\s*-\s*\d+px/.test(w[1]),
            `die Breite zieht eine feste Zahl ab ("${w[1].trim()}") — das ist ein `
            + 'zweiter, versteckter Seitenrand neben dem Innenabstand');
    });
});

describe('Seitenrand: Karten behalten ihren Innenabstand', () => {
    // Gegenprobe. Waeren diese auch auf 0 gesetzt, klebte der Text am
    // Kartenrahmen — das waere kein Gewinn, sondern ein Fehler.
    const KARTEN = [
        { datei: 'components.css', sel: '.ds-sec-body' },
        { datei: 'components.css', sel: '.ds-panel' }
    ];
    for (const k of KARTEN) {
        it(`${k.sel} behaelt einen eigenen Abstand`, () => {
            const r = regel(lies(k.datei), k.sel);
            if (!r) return;   // Selektor umbenannt — dann greift ein anderer Test
            const pad = r.match(/padding:\s*([^;]+);/);
            if (!pad) return;
            assert.ok(!/var\(--page-gutter\)/.test(pad[1]),
                `${k.sel} ist eine Karte mit sichtbarem Rahmen — ihr Innenabstand `
                + 'gehoert NICHT ans Seitenrand-Token, sonst klebt der Text am Rahmen');
        });
    }
});

describe('Seitenrand: das Token selbst', () => {
    it('--page-gutter ist genau einmal definiert', () => {
        const tok = liesOhneKommentar('tokens.css');
        const n = (tok.match(/--page-gutter\s*:/g) || []).length;
        assert.equal(n, 1, `--page-gutter ist ${n}-mal definiert — es soll EINE Stellschraube sein`);
    });

    it('niemand ueberschreibt es woanders', () => {
        for (const f of fs.readdirSync(CSS).filter(x => x.endsWith('.css') && x !== 'tokens.css')) {
            const treffer = (liesOhneKommentar(f).match(/--page-gutter\s*:/g) || []).length;
            assert.equal(treffer, 0, `${f} setzt --page-gutter neu — das hebelt die eine Stellschraube aus`);
        }
    });
});

describe('Auf dem Telefon ist alles randlos', () => {
    // Drei Anlaeufe sind am Polster gescheitert, weil das Problem kein
    // Polsterproblem war. Die oberen Bereiche eines Tabs stehen frei auf der
    // Seite, die unteren stecken in Abschnittskarten — der Inhalt begann oben
    // bei 13 px und unten bei 30. Am Bildschirmfoto gemessen streute der
    // Einzug ueber 12, 13, 22, 25, 26 und 27 CSS-Pixel. Solange die einen
    // Bereiche eine Karte haben und die anderen nicht, bekommt das kein
    // Nachjustieren einzelner Klassen gerade.
    //
    // Entscheidung des Betreibers: auf dem Telefon keine Abschnittskarten.
    // Nach dem Umbau liegen 72 Prozent aller Zeilen bei genau 12 px.
    const block = () => {
        const css = lies('mobile-responsive.css');
        const i = css.indexOf('Auf dem Telefon ist alles randlos');
        assert.ok(i > 0, 'der Randlos-Block fehlt');
        const m = css.indexOf('@media', i);
        return css.slice(m, css.indexOf('\n}\n', m) + 3);
    };

    it('nur auf kleinen Bildschirmen', () => {
        assert.match(block(), /@media \(max-width:\s*768px\)/,
            'ohne Breitengrenze verloere auch der grosse Bildschirm seine Karten — '
            + 'dort ordnen sie die Seite und sollen bleiben');
    });

    it('die Abschnittsflaechen verlieren wirklich ihren Rahmen', () => {
        const b = block();
        for (const kl of ['.ds-sec', '.ds-panel', '.ds-filter', '.de-karte']) {
            assert.ok(b.includes(kl), `${kl} wird nicht entrahmt`);
        }
        // Und zwar in DER Regel, die die Flaechen nennt — nicht irgendwo
        // sonst im Block. Sonst genuegt ein box-shadow im Verschachtelungs-
        // teil, um den Test zufriedenzustellen.
        const ersteRegel = b.slice(b.indexOf('.ds-sec,'), b.indexOf('}', b.indexOf('.ds-sec,')));
        assert.match(ersteRegel, /border-radius:\s*0/, 'die Ecken bleiben rund');
        assert.match(ersteRegel, /box-shadow:\s*none/, 'der Schatten bleibt');
    });

    it('der Einzug wird genau einmal gesetzt', () => {
        const b = block();
        assert.match(b, /var\(--mobil-einzug\)/,
            'der Einzug haengt nicht am Token');
        // Und er darf NICHT zusaetzlich auf verschachtelten Flaechen stehen.
        const teile = b.split('padding-left: 0');
        assert.ok(teile.length >= 2,
            'es gibt keinen Block, der den Einzug bei verschachtelten Flaechen '
            + 'wieder auf null setzt — dann addiert er sich erneut');
    });

    it('das Token ist genau einmal definiert', () => {
        const tok = liesOhneKommentar('tokens.css');
        const n = (tok.match(/--mobil-einzug\s*:/g) || []).length;
        assert.equal(n, 1, `--mobil-einzug ist ${n}-mal definiert`);
    });

    it('sie deckt ALLE Flaechen ab, nicht nur einen Einzelfall', () => {
        // Der Fehler aus PR #498: nur .tier-section behandelt, danach war die
        // Seite ungleicher als vorher.
        const b = block();
        const noetig = ['.ds-panel', '.heatmap-container', '.top-cards-container',
                        '.tier-section', '.ds-sec-body'];
        const fehlend = noetig.filter(k => !b.includes(k));
        assert.deepEqual(fehlend, [],
            'nicht abgedeckt: ' + fehlend.join(', ')
            + ' — eine Teilmenge zu behandeln macht die Seite UNGLEICHER');
    });

    it('Kacheln behalten ihr Polster', () => {
        // Gegenprobe. Ohne ihr eigenes Polster klebte der Text an der
        // Kachelkante — das waere kein Gewinn, sondern der naechste Fehler.
        const b = block();
        for (const bauteil of ['.arc-tile', '.ds-stat', '.stat-badge', 'button']) {
            assert.ok(!b.includes(bauteil),
                `${bauteil} steht im Randlos-Block — Bauteile sind keine Flaechen`);
        }
    });
});
