/**
 * Eine Regel, ein Ort.
 *
 * Am 28. und 29.08.2026 sind an sieben Stellen Selektoren aufgetaucht,
 * die MEHRFACH in derselben Datei stehen und dieselbe Eigenschaft
 * unterschiedlich setzen:
 *
 *   .color-grey            fuenfmal, vier Werte (#ccc, #666, #666, #555, #555)
 *   .color-grey-light      viermal
 *   .bg-grey-light         dreimal (#f8f9fa, #eee, #ecf0f1)
 *   .color-dark            zweimal (#333, #2c3e50)
 *   .de-tab-block          zweimal
 *   .de-overview-highlight zweimal
 *   .rarity-badge          zweimal, ueber ZWEI Dateien verteilt
 *
 * Im Stylesheet gewinnt still die letzte. Alles davor ist toter Text —
 * und er ist schlimmer als kein Text, weil er beim Lesen genau die
 * falsche Fassung zeigt: man aendert #f8f9fa, laedt neu, und nichts
 * passiert. Bei .rarity-badge hat das den schlechtesten Kontrastwert
 * der ganzen Anwendung erzeugt (weiss auf Gold, 1,73:1), weil die eine
 * Datei die Flaeche setzte und die andere nur die Schrift ueberschrieb.
 *
 * Diese Zusage haelt den Bestand fest. Sie fordert bewusst keine Null:
 * es stehen 39 solcher Faelle im Baum, viele davon spaetere
 * Verfeinerungen, die absichtlich weiter unten stehen. Ein Test, der
 * heute Null fordert, wird morgen geloescht. Ein Test, der die Zahl
 * deckelt, verhindert den naechsten Fall.
 *
 * NICHT gezaehlt wird:
 *  - alles in @media-Bloecken. Dort ist eine zweite Fassung derselben
 *    Regel die Bauweise, nicht der Fehler. (Der erste Entwurf hat sie
 *    mitgezaehlt und 227 statt 39 gemeldet.)
 *  - Unterschiede, die nur aus `!important` bestehen. `10px` und
 *    `10px !important` sind derselbe Wert.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const kern = (v) => v.replace(/\s*!important\s*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/* Nur Regeln auf oberster Ebene. Verschachtelte Bloecke (@media,
   @supports) werden im Ganzen uebersprungen. */
function regelnObersteEbene(txt) {
    const raus = [];
    let i = 0, selStart = 0;
    while (i < txt.length) {
        const c = txt[i];
        if (c === '{') {
            const sel = txt.slice(selStart, i).trim();
            let d = 1, j = i + 1;
            while (j < txt.length && d > 0) {
                if (txt[j] === '{') d++;
                else if (txt[j] === '}') d--;
                j++;
            }
            if (!sel.startsWith('@')) {
                raus.push({ sel: sel.replace(/\s+/g, ' '), koerper: txt.slice(i + 1, j - 1) });
            }
            i = j; selStart = i; continue;
        }
        if (c === '}') selStart = i + 1;
        i++;
    }
    return raus;
}

function konflikte() {
    const treffer = [];
    for (const f of fs.readdirSync(path.join(ROOT, 'css')).filter(x => x.endsWith('.css'))) {
        const txt = stripComments(fs.readFileSync(path.join(ROOT, 'css', f), 'utf8'));
        const gesehen = new Map();
        for (const r of regelnObersteEbene(txt)) {
            if (!r.sel || r.koerper.includes('{')) continue;   // verschachtelt: raus
            const eigen = new Map();
            for (const d of r.koerper.split(';')) {
                const k = d.split(':')[0].trim().toLowerCase();
                if (k) eigen.set(k, kern(d.split(':').slice(1).join(':')));
            }
            if (!gesehen.has(r.sel)) gesehen.set(r.sel, []);
            gesehen.get(r.sel).push(eigen);
        }
        for (const [sel, vork] of gesehen) {
            if (vork.length < 2) continue;
            const strittig = new Set();
            for (let i = 0; i < vork.length; i++) {
                for (let j = i + 1; j < vork.length; j++) {
                    for (const [p, v] of vork[i]) {
                        if (vork[j].has(p) && vork[j].get(p) !== v) strittig.add(p);
                    }
                }
            }
            if (strittig.size) treffer.push(`${f}  ${sel}  (${[...strittig].join(', ')})`);
        }
    }
    return treffer;
}

describe('ein Selektor steht nicht zweimal mit verschiedenen Werten da', () => {
    it('die Zahl solcher Faelle steigt nicht', () => {
        const GRUNDLINIE = 39;
        const jetzt = konflikte();
        assert.ok(jetzt.length <= GRUNDLINIE,
            `${jetzt.length} Selektoren stehen mehrfach mit verschiedenen Werten `
            + `(erlaubt: ${GRUNDLINIE}). Neu dazugekommen ist einer davon:\n`
            + jetzt.slice(0, 8).join('\n'));
    });

    it('die sieben aufgeraeumten Faelle bleiben aufgeraeumt', () => {
        /* Namentlich, damit ein Rueckfall genau hier auffaellt und nicht
           nur die Gesamtzahl um eins schiebt. */
        const jetzt = konflikte().join('\n');
        for (const sel of ['.color-grey ', '.color-grey-light ', '.bg-grey-light ',
                           '.color-dark ', '.de-tab-block ', '.de-overview-highlight ']) {
            assert.ok(!jetzt.includes(sel + ' '),
                `${sel.trim()} steht wieder mehrfach mit verschiedenen Werten da`);
        }
    });

    it('.rarity-badge setzt Flaeche und Schrift nicht in zwei Dateien getrennt', () => {
        /* Der Sonderfall: hier lagen die beiden Haelften in styles.css
           und ui-components.css. Gold als Flaeche, weiss als Schrift,
           1,73:1 — und beim Lesen einer der beiden Dateien sah alles
           richtig aus. */
        const ui = stripComments(fs.readFileSync(path.join(ROOT, 'css', 'ui-components.css'), 'utf8'));
        const st = stripComments(fs.readFileSync(path.join(ROOT, 'css', 'styles.css'), 'utf8'));
        const uiRegel = (ui.match(/\.rarity-badge\s*\{[^}]*\}/) || [''])[0];
        const stRegel = (st.match(/\.rarity-badge\s*\{[^}]*\}/) || [''])[0];
        if (/background/.test(stRegel) && /(?<![-a-z])color\s*:/.test(uiRegel)) {
            assert.match(uiRegel, /color:\s*var\(--on-light\)/,
                'ui-components.css setzt die Schrift, styles.css die Flaeche — '
                + 'dann muss die Schrift zur Flaeche passen und darf nicht mitdrehen');
        }
    });
});
