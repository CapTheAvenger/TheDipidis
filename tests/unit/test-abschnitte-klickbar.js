/**
 * Koepfe, die aussehen wie Knoepfe und keine mehr sind.
 *
 * Gemeldet: "Auf- und Absteiger, Ueberblick, Vollstaendige Tabelle — wenn
 * ich das aufklappen will, passiert nix."
 *
 * Es waren zwei Fehler uebereinander, und der erste hat den zweiten
 * versteckt.
 *
 * ── 1. Der Handler war weg ────────────────────────────────────────────
 *
 * js/ds-sections.js haengte an JEDEN Abschnittskopf einen eigenen
 * click-Handler, und zwar nur in dem Moment, in dem es den Abschnitt
 * anlegt. Zwei fremde Zeilen machen das zunichte:
 *
 *     js/app-tier-meta.js:1041   content.innerHTML = html + content.innerHTML
 *     js/app-meta-cards.js:1406  currentMetaContent.innerHTML = container.innerHTML
 *
 * Die erste ist die heimtueckische. Sie liest den vorhandenen Inhalt als
 * Text zurueck und setzt ihn neu: das Markup der Abschnitte ueberlebt
 * Zeichen fuer Zeichen, jeder daran haengende Handler nicht. Beim naechsten
 * Durchlauf findet sektionieren() die Abschnitte vor, haelt sie fuer fertig
 * und haengt keinen neuen Handler an.
 *
 * Das ist bitter, weil dieselbe Datei ein paar Zeilen tiefer ausdruecklich
 * "VERSCHIEBEN, nicht neu erzeugen" macht, um genau diese Handler zu
 * schuetzen — und sie dann an anderer Stelle doch verliert.
 *
 * GEMESSEN am 19.08.2026, lokal bei 1440 px, Klick auf "Auf- und Absteiger":
 *   aria-expanded bleibt false, ds_sections_v1 bleibt leer.
 * Bei 390 px ging es, weil dort eine andere Renderwelle zuletzt lief.
 * Der Nutzer sitzt am Laptop — er hat genau die kaputte Haelfte gesehen.
 *
 * Behoben mit EINER Weiche am Host. Der Host selbst wird nie ersetzt, nur
 * sein Inhalt; ein Handler an ihm ueberlebt jedes innerHTML darunter.
 *
 * ── 2. Und selbst dann sah man fast nichts ────────────────────────────
 *
 * GEMESSEN auf der Live-Seite, Fenster 1175 px, Kopf 44 px ueber der
 * unteren Bildkante — die Lage, in der man zwangslaeufig steht, wenn man
 * die letzten drei Abschnitte aufklappen will:
 *
 *     neuer Inhalt   692 px      davon sichtbar  44 px = 6 %
 *     Seite gescrollt  0 px
 *
 * Sechs Prozent am unteren Rand sieht aus wie nichts.
 *
 * Nach beiden Reparaturen, lokal nachgemessen:
 *
 *     Desktop 1440   Kopf 810 -> 17 px,  Inhalt 678 px, sichtbar 100 %
 *     Mobil    390   Kopf 754 -> 17 px,  Inhalt 1120 px, sichtbar  70 %
 *
 * (70 % ist auf 844 px Bildhoehe das Maximum — der Inhalt ist hoeher als
 * das Fenster.)
 *
 * Alle neun Abschnitte auf beiden Breiten auf und wieder zu, ohne
 * Seitenfehler.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripJs = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/.*$/gm, '$1');

const SRC = stripJs(read('js/ds-sections.js'));
const TIER = stripJs(read('js/app-tier-meta.js'));
const CARDS = stripJs(read('js/app-meta-cards.js'));

describe('Abschnitte — der Klick kommt an', () => {
    it('kein Handler haengt mehr an einem einzelnen Kopf', () => {
        // Ein Handler am Kopf ueberlebt das naechste fremde innerHTML nicht.
        assert.ok(!/hd\.addEventListener\(\s*['"]click/.test(SRC),
            'ds-sections.js haengt wieder einen Handler direkt an den Kopf');
    });

    it('stattdessen eine Weiche am Host', () => {
        assert.match(SRC, /host\.addEventListener\(\s*['"]click/,
            'die delegierte Weiche fehlt');
        assert.match(SRC, /closest\(['"]\.ds-sec-hd['"]\)/,
            'die Weiche erkennt den Kopf nicht');
    });

    it('die Weiche wird genau einmal angehaengt', () => {
        // sektionieren() laeuft mehrfach; ohne Kennzeichen saemmelten sich
        // die Handler und ein Klick zaehlte doppelt.
        assert.match(SRC, /__dsSecWeiche/,
            'ohne Kennzeichen kommt bei jedem Durchlauf ein Handler dazu');
        const i = SRC.indexOf('__dsSecWeiche');
        const j = SRC.indexOf("host.addEventListener('click'");
        assert.ok(i > -1 && j > i, 'das Kennzeichen muss VOR dem Anhaengen geprueft werden');
    });

    it('der Zuruecksetzen-Knopf laeuft ueber dieselbe Weiche', () => {
        // Er sitzt im selben Host und haette dasselbe Problem.
        assert.match(SRC, /closest\(['"]\.ds-sec-reset-btn['"]\)/,
            'der Reset-Knopf verliert seinen Handler beim naechsten innerHTML');
    });

    it('die zwei Zeilen, die das ausgeloest haben, gibt es noch', () => {
        // Wenn eine davon verschwindet, ist der Kommentar oben falsch.
        // Wenn beide verschwinden, darf die Weiche trotzdem bleiben.
        const a = /\.innerHTML\s*=\s*html\s*\+\s*content\.innerHTML/.test(TIER);
        const b = /currentMetaContent\.innerHTML\s*=\s*container\.innerHTML/.test(CARDS);
        assert.ok(a || b,
            'beide Ausloeser sind weg — dann bitte den Kommentar in ds-sections.js nachziehen');
    });
});

describe('Abschnitte — man sieht, dass etwas passiert ist', () => {
    it('nach dem Aufklappen wird der Abschnitt ins Bild geholt', () => {
        assert.match(SRC, /function insBild/, 'insBild fehlt');
        assert.match(SRC, /if \(!jetzt\) insBild\(sec\)/,
            'insBild wird nicht beim Aufklappen gerufen');
    });

    it('aber nur beim Aufklappen, nicht beim Zuklappen', () => {
        assert.ok(!/if \(jetzt\) insBild/.test(SRC),
            'beim Zuklappen zu springen waere gegen die Erwartung');
    });

    it('und nur, wenn es noetig ist', () => {
        const fn = SRC.slice(SRC.indexOf('function insBild'));
        const koerper = fn.slice(0, fn.indexOf('\n    }'));
        assert.match(koerper, /r\.bottom <= sicht/,
            'passt der Abschnitt schon ins Bild, darf die Seite nicht springen');
    });

    it('das Springen respektiert prefers-reduced-motion', () => {
        assert.match(SRC, /prefers-reduced-motion/,
            'wer Bewegung abgestellt hat, bekommt sie hier trotzdem');
    });

    it('die Messung passiert erst im naechsten Frame', () => {
        // Direkt nach dem Umschalten steht die neue Hoehe noch nicht fest.
        const fn = SRC.slice(SRC.indexOf('function insBild'));
        assert.match(fn.slice(0, 900), /requestAnimationFrame/);
    });
});
