'use strict';
/*
 * Eine halbdurchsichtige Toenung ist KEINE feste Flaeche.
 *
 * BEFUND (03.09.2026, live auf thedipidis.app gemessen)
 * -----------------------------------------------------
 * 40 CSS-Regeln bauten einen Chip so:
 *
 *     background: rgba(255, 193, 7, 0.18);
 *     color:      #8a5a00;
 *
 * Auf hellem Grund ergibt das einen hellen Chip, auf dem die dunkle
 * Tinte richtig sitzt. Auf dunklem Grund ergibt dieselbe Toenung einen
 * DUNKLEN Chip — und die dunkle Tinte verschwindet darin. Gemessen auf
 * der Seite: .stat-badge.stat-labs bei 1,96:1 (zehn Stueck sichtbar),
 * .mc-predictor-banner-trend bei 1,91:1.
 *
 * Das ist dieselbe Wurzel wie die schon festgehaltenen Muster
 * (Formularelemente erben keine Farbe; eine feste Flaeche braucht eine
 * feste Tinte) — nur eine Stufe subtiler: die Flaeche SIEHT im
 * Quelltext fest aus, ist es aber nicht. Sie erbt den Modus von dem,
 * was hinter ihr liegt.
 *
 * Warum das so lange unentdeckt blieb: die Dunkelmodus-Pruefungen
 * lasen background-COLOR. Ein Verlauf steht in background-IMAGE und
 * lief an jeder Messung vorbei — genauso wie eine Toenung, die erst
 * mit ihrem Untergrund zusammen eine Farbe ergibt.
 *
 * Die Zusicherung rechnet, statt eine Liste zu pflegen: fuer jede
 * Regel mit getoenter Flaeche und fester Tinte wird der Chip ueber
 * BEIDEN Grundflaechen zusammengesetzt. Wer nur hell besteht, faellt
 * durch. Damit faengt der Test auch kuenftige Regeln, die es noch
 * nicht gibt.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const cssVerzeichnis = path.join(__dirname, '..', '..', 'css');

// Die beiden Grundflaechen, auf denen ein Chip landen kann:
// --surface-1 hell bzw. dunkel (css/tokens.css).
const GRUND_HELL = [255, 255, 255];
const GRUND_DUNKEL = [17, 23, 48];
const SCHWELLE = 4.5;

function hexZuRgb(hex) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}
function leuchtdichte(rgb) {
    const k = rgb.map(v => v / 255)
        .map(x => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
    return 0.2126 * k[0] + 0.7152 * k[1] + 0.0722 * k[2];
}
function kontrast(a, b) {
    const [x, y] = [leuchtdichte(a), leuchtdichte(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
}
// Toenung ueber Grund legen (source-over).
function ueber(vorne, alpha, hinten) {
    return vorne.map((v, i) => v * alpha + hinten[i] * (1 - alpha));
}

/** Alle Regeln sammeln, die eine getoente Flaeche mit einer festen
 *  Tinte kombinieren. Media-Bloecke bleiben aussen vor: dort steht
 *  haeufig eine bewusste Modus-Ausnahme. */
function getoenteRegeln() {
    const treffer = [];
    for (const datei of fs.readdirSync(cssVerzeichnis).filter(f => f.endsWith('.css'))) {
        const roh = fs.readFileSync(path.join(cssVerzeichnis, datei), 'utf8');
        const quelle = roh.replace(/\/\*[\s\S]*?\*\//g, '');
        const block = /([^{}]+)\{([^{}]*)\}/g;
        let m;
        while ((m = block.exec(quelle)) !== null) {
            const selektor = m[1].trim();
            const koerper = m[2];
            if (selektor.includes('@')) continue;
            const flaeche = /background(?:-color)?\s*:\s*[^;]*?rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\.?\d*\.?\d+)\s*\)/.exec(koerper);
            const tinte = /(?:^|[^-\w])color\s*:\s*(#[0-9a-fA-F]{3,6})\s*(?:!important)?\s*;/.exec(koerper);
            if (!flaeche || !tinte) continue;
            const alpha = parseFloat(flaeche[4]);
            // Ab 0.5 deckt die Toenung den Untergrund weitgehend ab —
            // dann ist es tatsaechlich eine feste Flaeche.
            if (alpha >= 0.5) continue;
            treffer.push({
                datei,
                selektor: selektor.replace(/\s+/g, ' ').slice(0, 70),
                toenung: [+flaeche[1], +flaeche[2], +flaeche[3]],
                alpha,
                tinte: tinte[1],
            });
        }
    }
    return treffer;
}

describe('Getoente Chips muessen in beiden Modi lesbar sein', () => {
    it('keine Regel besteht nur im Hellmodus', () => {
        const nurHell = [];
        for (const r of getoenteRegeln()) {
            const ink = hexZuRgb(r.tinte);
            const hell = kontrast(ink, ueber(r.toenung, r.alpha, GRUND_HELL));
            const dunkel = kontrast(ink, ueber(r.toenung, r.alpha, GRUND_DUNKEL));
            // Nur was hell funktioniert und dunkel nicht, ist der
            // Befund. Eine Regel, die in BEIDEN Modi schwach ist, hat
            // ein anderes Problem und gehoert nicht hierher.
            if (hell >= SCHWELLE && dunkel < SCHWELLE) {
                nurHell.push(`${r.datei} ${r.selektor} (${r.tinte}: hell ${hell.toFixed(2)}:1, dunkel ${dunkel.toFixed(2)}:1)`);
            }
        }
        assert.deepStrictEqual(nurHell, [],
            'Diese Regeln setzen eine feste Tinte auf eine getoente Flaeche und ' +
            'sind nur im Hellmodus lesbar. Abhilfe: --tint-ok-ink / --tint-warn-ink / ' +
            '--tint-bad-ink / --tint-info-ink statt der festen Farbe — die drehen mit ' +
            'und halten die Bedeutung.\n  ' + nurHell.join('\n  '));
    });

    it('die Pruefung findet ueberhaupt getoente Regeln', () => {
        // Sonst gruent der Test aus Versehen: ein kaputter Ausdruck
        // liefert null Treffer und damit null Beanstandungen.
        // Stand 03.09.2026: 36 Regeln. Die Schwelle liegt darunter,
        // damit eine begruendete Aufraeumung nicht rot wird — aber
        // hoch genug, dass ein kaputter Ausdruck (0 Treffer) auffaellt.
        assert.ok(getoenteRegeln().length >= 30,
            'die Regelsuche greift nicht mehr — der Test oben waere wertlos');
    });
});

describe('Die tint-Tokens existieren in beiden Modi', () => {
    it('jedes --tint-*-ink ist hell UND dunkel gesetzt', () => {
        const tokens = fs.readFileSync(path.join(cssVerzeichnis, 'tokens.css'), 'utf8');
        for (const name of ['--tint-ok-ink', '--tint-warn-ink', '--tint-bad-ink', '--tint-info-ink']) {
            const wie_oft = (tokens.match(new RegExp(name + '\\s*:', 'g')) || []).length;
            assert.ok(wie_oft >= 2,
                `${name} ist nur ${wie_oft}x gesetzt — ein Token, das nur einen ` +
                'Modus kennt, dreht nicht mit und macht die Reparatur oben wirkungslos');
        }
    });
});


/*
 * Drei Einzelbefunde derselben Sitzung, live im angemeldeten Profil
 * gemessen. Sie stehen hier, weil sie dieselbe Wurzel haben: ein fest
 * verdrahteter Hellmodus-Wert auf einer Flaeche, die dreht.
 *
 * Warum sie so lange durchkamen: das Profil ist der einzige Reiter,
 * der ANGEMELDET anders aussieht. Unangemeldet zaehlt er 11 Elemente,
 * angemeldet 103 — jede Pruefung ohne Anmeldung lief an ihm vorbei.
 */
describe('Profil und Leerzustand: feste Hellmodus-Werte', () => {
    const auth = fs.readFileSync(path.join(cssVerzeichnis, 'auth-styles.css'), 'utf8');
    const uic = fs.readFileSync(path.join(cssVerzeichnis, 'ui-components.css'), 'utf8');

    it('.profile-tab-btn traegt keine feste Tinte mehr', () => {
        // Live gemessen: 13 Reiterbeschriftungen bei 3,08:1 (#666 auf
        // #111730). --ink-2 liefert 7,48:1 hell und 9,90:1 dunkel.
        const block = /\.profile-tab-btn\s*\{[^}]*\}/.exec(auth);
        assert.ok(block, '.profile-tab-btn nicht gefunden');
        assert.ok(!/color:\s*#[0-9a-fA-F]{3,6}\s*;/.test(block[0]),
            '.profile-tab-btn hat wieder eine feste Tinte — im Dunkelmodus ' +
            'sind das 13 unlesbare Reiter');
    });

    it('die Leerzustand-Tafel dreht mit', () => {
        // Der Verlauf war fest hell (#f8faff -> #eef2ff) und damit im
        // Dunkelmodus eine helle Tafel mitten auf dunklem Grund; die
        // Beschreibung (--ink-3) lag darauf bei 2,87:1.
        const block = /\.empty-state-box\s*\{[^}]*\}/.exec(uic);
        assert.ok(block, '.empty-state-box nicht gefunden');
        const verlauf = /background:\s*linear-gradient\(([^)]*(?:\([^)]*\)[^)]*)*)\)/.exec(block[0]);
        assert.ok(verlauf, 'kein Verlauf in .empty-state-box');
        assert.ok(!/#[0-9a-fA-F]{3,6}/.test(verlauf[1]),
            'der Verlauf enthaelt wieder feste Farben statt Tokens');
    });

    it('die Ueberschrift des Leerzustands dreht mit der Tafel', () => {
        const block = /\.empty-state-title\s*\{[^}]*\}/.exec(uic);
        assert.ok(block, '.empty-state-title nicht gefunden');
        assert.ok(!/color:\s*#[0-9a-fA-F]{3,6}/.test(block[0]),
            'feste Tinte auf einer drehenden Tafel — genau der Fehler, den ' +
            'der feste Verlauf vorher verdeckt hat');
    });

    it('die Leerzustand-Tafel wird im Kartenraster nicht gequetscht', () => {
        // Live gemessen: in .collection-grid sass die Tafel in EINER
        // Rasterzelle — 153 px breit, 505 px hoch.
        const block = /\.empty-state-box\s*\{[^}]*\}/.exec(uic);
        assert.match(block[0], /grid-column:\s*1\s*\/\s*-1/,
            'ohne grid-column quetscht ein umgebendes Raster die Tafel in eine Spalte');
    });
});
