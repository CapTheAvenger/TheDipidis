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

describe('Karte in Karte: die innere gibt ihr Polster ab', () => {
    // Zweite Runde. Nach dem Token-Fix blieb ein Rest, und er kam nicht mehr
    // vom Seitenrand, sondern von Verschachtelung. Gemessen auf 390 px:
    //   section.ds-sec     1 px Rahmen
    //   div.ds-sec-body   12 px Polster
    //   div.tier-section   1 px Rahmen + 18 px Polster   <- zweiter Rahmen
    //   div.arc-card       1 px Rahmen
    // Inhalt begann bei 33 px, die Deck-Kachel war 324 statt 362 px breit.
    const mobil = () => {
        const css = lies('mobile-responsive.css');
        const i = css.indexOf('Karte in Karte');
        assert.ok(i > 0, 'der Block fuer verschachtelte Karten fehlt');
        const m = css.indexOf('@media', i);
        assert.ok(m > 0, 'kein @media nach dem Kommentar');
        return css.slice(m, css.indexOf('\n}', css.indexOf('}', m)) + 2);
    };

    it('die Regel greift nur auf kleinen Bildschirmen', () => {
        const css = lies('mobile-responsive.css');
        const i = css.indexOf('Karte in Karte');
        const bis = css.slice(i, i + 2000);
        assert.match(bis, /@media \(max-width:\s*768px\)/,
            'ohne Breitengrenze wuerde auch der grosse Bildschirm sein Polster verlieren — '
            + 'dort ist Platz genug und die Verschachtelung stoert nicht');
    });

    it('sie nimmt nur waagerecht Polster weg, nicht senkrecht', () => {
        const b = mobil();
        assert.match(b, /padding-left:\s*0/, 'kein padding-left');
        assert.match(b, /padding-right:\s*0/, 'kein padding-right');
        assert.ok(!/padding-top:\s*0/.test(b) && !/padding:\s*0(?![^;]*px)/.test(b),
            'die Regel nimmt auch senkrecht Abstand weg — der wird gebraucht');
    });

    it('sie greift nur auf VERSCHACHTELTE Flaechen, nicht auf alle', () => {
        const b = mobil();
        // Jeder Selektor muss einen Vorfahren nennen. Ein nacktes
        // ".tier-section" wuerde auch die freistehende Flaeche treffen.
        const sel = b.slice(b.indexOf('{', b.indexOf('@media')) + 1, b.indexOf('{', b.indexOf('px)')+8));
        const zeilen = sel.split(',').map(x => x.trim()).filter(Boolean);
        assert.ok(zeilen.length >= 2, 'zu wenige Selektoren gefunden — der Scanner greift nicht');
        for (const z of zeilen) {
            assert.ok(z.split(/\s+/).length >= 2,
                `"${z}" nennt keinen Vorfahren — die Regel traefe auch freistehende Flaechen`);
        }
    });

    it('der farbige Tier-Rahmen bleibt erhalten', () => {
        const b = mobil();
        assert.ok(!/border(-left|-right)?-width:\s*0/.test(b),
            'die Regel entfernt den Rahmen — er unterscheidet aber Tier 1 von Tier 2 '
            + 'und traegt damit Bedeutung, nicht nur Zierde');
    });
});
