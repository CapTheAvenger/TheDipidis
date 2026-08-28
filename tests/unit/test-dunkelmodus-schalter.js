/**
 * Der Schalter für den Dunkelmodus.
 *
 * Der Betreiber am 27.08.2026: "meine Seite hat glaube aktuell noch
 * keinen Dunkel Modus, aber das kannst du gerne noch einstellen."
 *
 * Die Bedingung stand im Kopf von tests/unit/test-design-dark.js:
 * "Der Schalter kommt, wenn der Zähler unten nahe null ist — nicht
 * vorher. Ein halb dunkles Interface ist schlechter als ein helles."
 * Am 28.08.2026 war er es (0 / 0 / 0 hell auf den drei großen
 * Ansichten), also kam der Schalter.
 *
 * Drei Dinge hält diese Datei fest, weil man sie beim nächsten
 * Anfassen am ehesten wieder verliert:
 *
 *  1. Die Entscheidung fällt VOR der ersten Stilvorlage. Wandert das
 *     Skript weiter nach unten, blitzt die Seite beim Laden weiß auf.
 *  2. Die Wahl des Nutzers schlägt die Einstellung des Betriebssystems
 *     — wer einmal gewählt hat, will nicht beim Sonnenaufgang etwas
 *     anderes sehen.
 *  3. Der Schalter zeigt, was passiert, wenn man ihn drückt: im Hellen
 *     den Mond, im Dunkeln die Sonne.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT   = path.join(__dirname, '..', '..');
const HTML   = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const INIT   = fs.readFileSync(path.join(ROOT, 'js', 'inline-init.js'), 'utf8');
const HEADER = fs.readFileSync(path.join(ROOT, 'css', 'cards-header.css'), 'utf8');
const TOKENS = fs.readFileSync(path.join(ROOT, 'css', 'tokens.css'), 'utf8');
const I18N   = fs.readFileSync(path.join(ROOT, 'js', 'i18n.js'), 'utf8');

describe('Dunkelmodus: die Entscheidung faellt vor der ersten Stilvorlage', () => {
    it('das Kopf-Skript steht vor jedem stylesheet', () => {
        const skript = HTML.indexOf("localStorage.getItem('theme')");
        assert.notEqual(skript, -1, 'das Kopf-Skript ist nicht mehr da');
        const erstesCss = HTML.search(/<link[^>]+rel="stylesheet"/);
        assert.notEqual(erstesCss, -1, 'kein stylesheet in index.html');
        assert.ok(skript < erstesCss,
            'das Theme-Skript steht hinter der ersten Stilvorlage — die Seite blitzt weiss auf');
    });

    it('es setzt data-theme auf das Wurzelelement', () => {
        assert.match(HTML, /document\.documentElement\.dataset\.theme = 'dark'/);
    });

    it('ohne localStorage faellt es nicht um', () => {
        const block = HTML.slice(HTML.indexOf("localStorage.getItem('theme')") - 400,
                                 HTML.indexOf("localStorage.getItem('theme')") + 700);
        assert.match(block, /try \{/);
        assert.match(block, /catch/);
    });
});

describe('Dunkelmodus: Wahl schlaegt Betriebssystem', () => {
    // Die echten Funktionen aus js/inline-init.js, in einer Sandkiste.
    function lade(gespeichert, wurzelTheme) {
        const speicher = { theme: gespeichert };
        const wurzel = { dataset: {} };
        if (wurzelTheme) wurzel.dataset.theme = wurzelTheme;
        const knopf = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
        const sandbox = {
            console, Math, JSON, String, Object, Array, Boolean,
            localStorage: {
                getItem: (k) => (k in speicher ? speicher[k] : null),
                setItem: (k, v) => { speicher[k] = v; },
            },
            document: {
                documentElement: wurzel,
                getElementById: (id) => (id === 'themeToggleBtn' ? knopf : null),
                addEventListener() {},
                querySelector: () => null, querySelectorAll: () => [],
            },
            matchMedia: () => ({ matches: false }),
            setTimeout, clearTimeout,
            addEventListener() {}, removeEventListener() {},
        };
        sandbox.window = sandbox;
        vm.createContext(sandbox);
        vm.runInContext(INIT, sandbox);
        return { sandbox, speicher, wurzel, knopf };
    }

    it('umschalten setzt data-theme und merkt sich die Wahl', () => {
        const u = lade(null, null);
        u.sandbox.toggleTheme();
        assert.equal(u.wurzel.dataset.theme, 'dark');
        assert.equal(u.speicher.theme, 'dark');
        u.sandbox.toggleTheme();
        assert.equal(u.wurzel.dataset.theme, undefined, 'hell laesst kein data-theme stehen');
        assert.equal(u.speicher.theme, 'light');
    });

    it('die gemerkte Wahl ist "light" oder "dark", nichts anderes', () => {
        const u = lade(null, null);
        u.sandbox.applyTheme('dark');   assert.equal(u.speicher.theme, 'dark');
        u.sandbox.applyTheme('light');  assert.equal(u.speicher.theme, 'light');
        u.sandbox.applyTheme('quatsch');assert.equal(u.speicher.theme, 'light',
            'ein unbekannter Wert darf nicht als drittes Theme durchgehen');
    });

    it('der Knopf sagt an, in welchem Zustand er ist', () => {
        const u = lade(null, null);
        u.sandbox.applyTheme('dark');
        assert.equal(u.knopf.attrs['aria-pressed'], 'true');
        u.sandbox.applyTheme('light');
        assert.equal(u.knopf.attrs['aria-pressed'], 'false');
    });

    it('ohne localStorage laeuft das Umschalten trotzdem', () => {
        const u = lade(null, null);
        u.sandbox.localStorage.setItem = () => { throw new Error('privater Modus'); };
        u.sandbox.toggleTheme();
        assert.equal(u.wurzel.dataset.theme, 'dark',
            'ein blockierter Speicher darf das Umschalten nicht verhindern');
    });
});

describe('Dunkelmodus: der Knopf', () => {
    it('er steht im Kopfbereich neben der Sprache', () => {
        const knopf = HTML.indexOf('id="themeToggleBtn"');
        const sprache = HTML.indexOf('id="langToggleBtn"');
        assert.notEqual(knopf, -1, 'der Knopf fehlt in index.html');
        assert.notEqual(sprache, -1);
        assert.ok(Math.abs(knopf - sprache) < 2000, 'der Knopf steht nicht mehr bei der Sprache');
    });

    it('er zeigt genau ein Zeichen — Mond im Hellen, Sonne im Dunkeln', () => {
        assert.match(HEADER, /\.theme-icon-sonne \{ display: none; \}/);
        assert.match(HEADER, /:root\[data-theme="dark"\] \.theme-icon-mond\s+\{ display: none; \}/);
        assert.match(HEADER, /:root\[data-theme="dark"\] \.theme-icon-sonne \{ display: block; \}/);
    });

    it('er hat eine Beschriftung in beiden Sprachen', () => {
        const n = I18N.split("'header.theme':").length - 1;
        assert.equal(n, 2, `header.theme steht ${n}-mal statt zweimal`);
        assert.match(HTML, /data-i18n-title="header\.theme"/);
        assert.match(HTML, /data-i18n-aria="header\.theme"/);
    });
});

describe('Dunkelmodus: die Tokenschicht traegt beide Saetze', () => {
    it('jeder Token aus dem dunklen Satz existiert auch im hellen', () => {
        // Ein Name, den es nur im dunklen Satz gibt, faellt im Hellen
        // auf "unset" zurueck — dort steht dann keine Farbe. Die hellen
        // Werte stehen teils in tokens.css, teils in den alten Dateien
        // (die --bg-*/--text-*-Familie aus der Zeit davor), also wird
        // ueber ALLE Stilvorlagen gesucht.
        const dunkelStart = TOKENS.indexOf(':root[data-theme="dark"]');
        assert.notEqual(dunkelStart, -1, 'der dunkle Tokensatz ist weg');
        const dunkel = TOKENS.slice(dunkelStart, TOKENS.indexOf('\n}', dunkelStart));
        const alleHell = fs.readdirSync(path.join(ROOT, 'css'))
            .filter(f => f.endsWith('.css'))
            .map(f => fs.readFileSync(path.join(ROOT, 'css', f), 'utf8'))
            .join('\n')
            .replace(TOKENS.slice(dunkelStart, TOKENS.indexOf('\n}', dunkelStart)), '');
        const namen = [...dunkel.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map(m => m[1]);
        assert.ok(namen.length > 20, 'der dunkle Satz ist verdaechtig klein');
        const fehlen = namen.filter(n => !new RegExp('^\\s*' + n + '\\s*:', 'm').test(alleHell));
        assert.deepEqual(fehlen, [],
            'diese Namen gibt es nur im Dunkeln — im Hellen faellt genau dort die Farbe aus');
    });

    it('der Umschalter der Kartendatenbank hat beide Saetze', () => {
        ['--umschalter-bg', '--umschalter-linie', '--umschalter-ink'].forEach(n => {
            const treffer = TOKENS.split(n + ':').length - 1;
            assert.equal(treffer, 2, `${n} steht ${treffer}-mal statt zweimal`);
        });
    });
});
