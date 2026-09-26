/**
 * Warum es diese Datei gibt.
 *
 * URSACHE (26.09.2026, live gemessen): das Battle Journal hatte DREI
 * Farbwelten, die sich kreuzten.
 *
 *   1. Die Seite schaltet ihren Dunkelmodus ueber <html data-theme>.
 *   2. Das Blatt (die Eingabe-Schublade) schaltet mit dem Knopf
 *      „Dark/Light" eine ZWEITE Helligkeit, die davon nichts weiss.
 *   3. Das Bearbeiten-Fenster malte ueber `--card-bg`, `--text-color`
 *      und `--input-bg` — drei Namen, die in KEINER Datei des Projekts
 *      definiert sind. Jedes var() fiel also auf seinen hellen
 *      Ersatzwert zurueck.
 *
 * In allen drei Faellen kam die Tinte aus der echten Tokenschicht und
 * drehte mit dem Modus, der Grund nicht. Gemessen im Dunkelmodus:
 * die eingetippte Notiz 1,03:1, „Going First"/„Going Second" und W/L/T
 * 1,21:1, „Your Deck" 1,78:1 — und im hellen Blatt auf dunkler Seite
 * „Tournament Name" 1,10:1. 25 von 35 Textstellen des Fensters lagen
 * unter 4,5:1.
 *
 * Die Reparatur war nicht eine Liste von Ausnahmen, sondern: das Blatt
 * bekommt die Tokenschicht selbst (tokens.css, styles.css, ux-step1.css
 * fuehren `.battle-journal-sheet` als zweiten Selektor), und jede
 * Flaeche im Journal kommt aus demselben Paar wie die Schrift darauf.
 *
 * Diese Datei haelt die drei Bedingungen fest, unter denen der Fehler
 * nicht zurueckkommen kann.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const CSS_ORDNER = path.join(ROOT, 'css');
const CSS_DATEIEN = fs.readdirSync(CSS_ORDNER)
    .filter((n) => n.endsWith('.css'))
    .map((n) => ['css/' + n, fs.readFileSync(path.join(CSS_ORDNER, n), 'utf8')]);

const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

// Alles, was im Journal oder in der Matchup-Analyse faerbt.
const JOURNAL = /battle-journal|\bbj-|\bma-/;

// ── WCAG ───────────────────────────────────────────────────────────
function leuchte(h) {
    const s = h.replace('#', '');
    const t = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
    const k = [0, 2, 4].map((i) => {
        const v = parseInt(t.slice(i, i + 2), 16) / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * k[0] + 0.7152 * k[1] + 0.0722 * k[2];
}
function verhaeltnis(a, b) {
    const la = leuchte(a); const lb = leuchte(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// ── Regeln aus den CSS-Dateien lesen ───────────────────────────────
function regeln() {
    const raus = [];
    for (const [datei, roh] of CSS_DATEIEN) {
        const s = ohneKommentare(roh);
        const re = /([^{}]+)\{([^{}]*)\}/g;
        let m;
        while ((m = re.exec(s)) !== null) {
            const sel = m[1].trim().replace(/\s+/g, ' ');
            if (!sel || sel.startsWith('@')) continue;
            const eig = {};
            for (const teil of m[2].split(';')) {
                const i = teil.indexOf(':');
                if (i < 0) continue;
                eig[teil.slice(0, i).trim()] = teil.slice(i + 1).trim();
            }
            raus.push({ datei, sel, eig });
        }
    }
    return raus;
}
const ALLE = regeln();

// Die Werte EINES Token-Blocks, aus der Datei gelesen — nicht
// abgeschrieben. Aendert jemand einen Token, rechnet die Zusage neu.
function block(pruefung) {
    const werte = {};
    for (const r of ALLE) {
        if (!pruefung(r.sel)) continue;
        for (const [k, v] of Object.entries(r.eig)) {
            if (k.startsWith('--')) werte[k] = v;
        }
    }
    return werte;
}
function aufloesen(werte, name, tiefe = 0) {
    const v = werte[name];
    if (v === undefined || tiefe > 8) return null;
    const m = /^var\(\s*(--[\w-]+)/.exec(v);
    if (m) return aufloesen(werte, m[1], tiefe + 1);
    return /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : null;
}

// Alle Tokens, die die Regeln des Journals anfassen — samt der Kette
// dahinter (--text-dark -> --ink).
function tokensDesJournals() {
    const direkt = new Set();
    for (const r of ALLE) {
        if (!JOURNAL.test(r.sel)) continue;
        for (const v of Object.values(r.eig)) {
            for (const m of String(v).matchAll(/var\(\s*(--[\w-]+)/g)) direkt.add(m[1]);
        }
    }
    const alleWerte = block(() => true);
    const offen = [...direkt];
    const fertig = new Set(direkt);
    while (offen.length) {
        const name = offen.pop();
        const wert = alleWerte[name];
        if (!wert) continue;
        for (const m of String(wert).matchAll(/var\(\s*(--[\w-]+)/g)) {
            if (!fertig.has(m[1])) { fertig.add(m[1]); offen.push(m[1]); }
        }
    }
    return fertig;
}

const HELL = block((s) => /(^|,)\s*:root\s*(,|$)/.test(s));
const DUNKEL = Object.assign({}, HELL,
    block((s) => s.includes(':root[data-theme="dark"]')));

describe('Battle Journal: die Flaeche und die Schrift darauf kommen aus derselben Welt', () => {

    it('das Blatt fuehrt die Tokenschicht selbst', () => {
        // Nicht die FORM des Selektors ist die Zusage, sondern die
        // Wirkung: jeder Token, den der Dunkelblock umdefiniert und den
        // das Journal benutzt, muss fuer ein HELLES Blatt wieder auf
        // seinen hellen Wert gesetzt werden. Sonst faerbt ein helles
        // Blatt auf dunkler Seite mit den dunklen Werten — genau der
        // Befund „Tournament Name, 1,10:1".
        // Bloecke, die auf dem Wurzelelement selbst dunkle Werte setzen —
        // nicht die, die nur Nachfahren davon faerben.
        const istDunkleWurzel = (sel) => sel.split(',')
            .map((s) => s.trim())
            .some((s) => s === ':root[data-theme="dark"]');
        const dunkelBloecke = ALLE.filter((r) => istDunkleWurzel(r.sel)
            && Object.keys(r.eig).some((k) => k.startsWith('--')));
        assert.ok(dunkelBloecke.length >= 1, 'kein dunkler Token-Block gefunden');

        const grund = dunkelBloecke.find((r) => r.eig['--surface-1'] !== undefined);
        assert.ok(grund, 'kein Block setzt --surface-1 fuer den Dunkelmodus');
        assert.ok(grund.sel.includes('.battle-journal-sheet.is-dark'),
            'der dunkle Grundblock fuehrt das dunkle Blatt nicht mit — dann '
            + 'faerbt es mit den hellen Werten der Seite.');

        const gedreht = [...new Set(dunkelBloecke.flatMap(
            (r) => Object.keys(r.eig).filter((k) => k.startsWith('--'))))];
        const imBlatt = block((s) => /\.battle-journal-sheet:not\(\.is-dark\)/.test(s));
        const benutzt = tokensDesJournals();
        const fehlend = gedreht
            .filter((t) => benutzt.has(t))
            .filter((t) => imBlatt[t] === undefined);
        assert.deepEqual(fehlend, [],
            'Diese Tokens dreht der Dunkelmodus um, das Journal benutzt sie, '
            + 'aber ein helles Blatt bekommt sie nicht zurueck. Ein helles '
            + 'Blatt auf dunkler Seite faerbt damit dunkel auf hell.');
    });

    it('kein var() im Journal zeigt auf einen Namen, den es nicht gibt', () => {
        // `--card-bg`, `--text-color`, `--input-bg`: nie definiert, also
        // immer der helle Ersatzwert. Das war die Ursache des Bildes.
        const definiert = new Set();
        for (const [, roh] of CSS_DATEIEN) {
            for (const m of ohneKommentare(roh).matchAll(/(--[\w-]+)\s*:/g)) definiert.add(m[1]);
        }
        // Manche Tokens setzt erst das Skript — `--close-tooltip` traegt
        // die uebersetzte Beschriftung und steht deshalb in js/i18n.js,
        // nicht in einer .css. Das ist definiert, nur woanders.
        const JS_ORDNER = path.join(ROOT, 'js');
        for (const name of fs.readdirSync(JS_ORDNER).filter((n) => n.endsWith('.js'))) {
            const roh = fs.readFileSync(path.join(JS_ORDNER, name), 'utf8');
            for (const m of roh.matchAll(/setProperty\(\s*['\`"](--[\w-]+)/g)) definiert.add(m[1]);
        }
        const fehlend = [];
        for (const r of ALLE) {
            if (!JOURNAL.test(r.sel)) continue;
            for (const v of Object.values(r.eig)) {
                for (const m of String(v).matchAll(/var\(\s*(--[\w-]+)/g)) {
                    if (!definiert.has(m[1])) fehlend.push(`${r.datei} ${r.sel} -> ${m[1]}`);
                }
            }
        }
        assert.deepEqual(fehlend, [],
            'Diese Regeln des Journals zeigen auf Tokens, die nirgends '
            + 'definiert sind. Jedes var() faellt damit still auf seinen '
            + 'Ersatzwert zurueck — im Dunkelmodus heisst das heller Grund '
            + 'unter heller Schrift.');
    });

    it('keine feste Flaeche unter einer Schrift aus der Tokenschicht', () => {
        // Die Mischung ist der Fehler: ein Wert dreht mit dem Modus, der
        // andere nicht. Ein Wert KANN nicht in beiden Modi richtig sein.
        const LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(/;
        const mischungen = [];
        for (const r of ALLE) {
            if (!JOURNAL.test(r.sel)) continue;
            const grund = r.eig.background || r.eig['background-color'];
            const tinte = r.eig.color;
            if (!grund || !tinte) continue;
            if (LITERAL.test(grund) && tinte.includes('var(')) {
                mischungen.push(`${r.datei} ${r.sel}: ${grund} / ${tinte}`);
            }
        }
        assert.deepEqual(mischungen, [],
            'Feste Flaeche, Schrift aus einem Token: im anderen Modus dreht '
            + 'nur die Schrift. Entweder beides fest (dann muss die Regel in '
            + 'BEIDEN Modi gelten) oder beides aus demselben Tokenpaar.');
    });

    it('die Tokenpaare, auf denen das Journal steht, halten 4,5:1', () => {
        // Kein festgenagelter Messwert: die Werte kommen aus tokens.css.
        // Wer einen Token verschiebt, faellt hier auf.
        const PAARE = [
            ['--ink', '--surface-1'], ['--ink', '--surface-2'],
            ['--ink-2', '--surface-1'], ['--ink-2', '--surface-2'],
            ['--ink-3', '--surface-1'], ['--ink-3', '--surface-2'],
            ['--tint-ok-ink', '--tint-ok'], ['--tint-bad-ink', '--tint-bad'],
            ['--tint-warn-ink', '--tint-warn'], ['--tint-info-ink', '--tint-info'],
        ];
        const schwach = [];
        for (const [welt, werte] of [['hell', HELL], ['dunkel', DUNKEL]]) {
            for (const [tinte, grund] of PAARE) {
                const a = aufloesen(werte, tinte);
                const b = aufloesen(werte, grund);
                assert.ok(a && b, `${welt}: ${tinte} oder ${grund} loest nicht auf`);
                const v = verhaeltnis(a, b);
                if (v < 4.5) schwach.push(`${welt}: ${tinte} (${a}) auf ${grund} (${b}) = ${v.toFixed(2)}:1`);
            }
        }
        assert.deepEqual(schwach, [],
            'Das Journal faerbt ueber genau diese Paare. Faellt eines unter '
            + '4,5:1, wird eine Stelle der Oberflaeche unlesbar.');
    });

    it('die Stellen aus dem Bild nehmen Flaeche und Schrift aus Tokens', () => {
        const wichtig = [
            '.battle-journal-choice',
            '.battle-journal-choice.is-selected',
            '.battle-journal-choice-win.is-selected',
            '.battle-journal-choice-loss.is-selected',
            '.battle-journal-choice-tie.is-selected',
            '.bj-edit-modal',
            '.bj-game-notes-input',
            '.bj-edit-input',
        ];
        for (const sel of wichtig) {
            const r = ALLE.find((x) => x.sel === sel);
            assert.ok(r, `Regel ${sel} nicht gefunden — wurde sie umbenannt?`);
            const grund = r.eig.background || r.eig['background-color'];
            if (grund) {
                assert.ok(grund.includes('var(--'),
                    `${sel}: die Flaeche ist fest (${grund}). Im Dunkelmodus `
                    + 'stand hier helle Schrift auf weissem Grund.');
            }
            if (r.eig.color) {
                assert.ok(r.eig.color.includes('var(--'),
                    `${sel}: die Schrift ist fest (${r.eig.color}).`);
            }
        }
    });

    it('die Beschriftung des Schliessknopfes bringt ihren Grund mit', () => {
        // Der Knopf ist derselbe, der Grund wechselt: dunkler Kopf des
        // Bearbeiten-Fensters, helles oder dunkles Blatt, Kartenbild im
        // Vollbild. Weiss mit Schatten hielt 18,9:1 auf dem einen und
        // 1,74:1 auf dem anderen. Eine Farbe kann das nicht leisten —
        // die Kapsel schon, weil sie ihren eigenen Grund mitbringt.
        const roh = fs.readFileSync(path.join(ROOT, 'css/close-buttons.css'), 'utf8');
        const block = /\.help-modal-close::after\s*\{([^}]*)\}/.exec(ohneKommentare(roh));
        assert.ok(block, 'die Regel fuer die Beschriftung wurde umbenannt');
        const grund = /background:\s*rgba\(([^)]+)\)/.exec(block[1]);
        assert.ok(grund, 'die Beschriftung hat keinen eigenen Grund mehr — dann '
            + 'haengt ihre Lesbarkeit wieder davon ab, was zufaellig dahinterliegt.');
        const [r, g, b, a] = grund[1].split(/[,\s]+/).map(Number);
        const tinte = /color:\s*(#[0-9a-fA-F]{3,6})/.exec(block[1]);
        assert.ok(tinte, 'die Beschriftung setzt keine feste Schriftfarbe mehr');

        const mischen = (unten) => {
            const u = [0, 2, 4].map((i) => parseInt(unten.replace('#', '').slice(i, i + 2), 16));
            const k = [r, g, b].map((v, i) => Math.round(v * a + u[i] * (1 - a)));
            return '#' + k.map((v) => v.toString(16).padStart(2, '0')).join('');
        };
        for (const [welt, werte] of [['hell', HELL], ['dunkel', DUNKEL]]) {
            const flaeche = aufloesen(werte, '--surface-1');
            const v = verhaeltnis(tinte[1], mischen(flaeche));
            assert.ok(v >= 4.5,
                `${welt}: die Beschriftung des Schliessknopfes haelt auf `
                + `${flaeche} nur ${v.toFixed(2)}:1.`);
        }
    });

    it('`color: inherit` steht in keinem Eingabefeld des Journals', () => {
        // Im Bearbeiten-Fenster erbte das Notizfeld die Tinte der SEITE
        // und stand auf einem festen hellen Grund: 1,03:1.
        const erbt = ALLE.filter((r) => JOURNAL.test(r.sel)
            && /input|textarea|notes|feld/i.test(r.sel)
            && r.eig.color === 'inherit');
        assert.deepEqual(erbt.map((r) => `${r.datei} ${r.sel}`), [],
            'Ein Feld, das seine Schriftfarbe erbt, aber seinen Grund selbst '
            + 'setzt, kann nicht in beiden Modi stimmen.');
    });
});
