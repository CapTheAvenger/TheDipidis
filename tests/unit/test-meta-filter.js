/**
 * Datenraum und Format als Filter statt als Reiter.
 *
 * GEMESSEN am 18.08.2026:
 *
 *   Reiter oberster Ebene                                     13
 *   current-meta          11.364 px Desktop / 14.046 px Mobil
 *   city-league              441 px   Saisonpause
 *   city-league-analysis     400 px   leeres Auswahlformular
 *   current-analysis         768 px   leeres Auswahlformular
 *   past-meta                400 px   leeres Auswahlformular
 *
 * Es gibt keine fuenf Meta-Ansichten, sondern eine riesige und vier
 * Dropdowns. js/ds-filter.js setzt dieselbe Zeile ueber alle drei
 * Meta-Ansichten: DATENRAUM links, das jeweils passende Format rechts.
 *
 * Der eigentliche Gewinn ist die Abhaengigkeit: zur Auswahl stehen nur
 * Formate des gewaehlten Datenraums. Damit wird aus der Projektregel
 * "Japan, Global und Past werden nie in einer Zahl gemischt" ein
 * Versprechen im Ausweis eine bauliche Tatsache.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripJs = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/.*$/gm, '$1');
const stripCss = s => s.replace(/\/\*[\s\S]*?\*\//g, '');

const SRC = read('js/ds-filter.js');
const CODE = stripJs(SRC);
const CSS = stripCss(read('css/components.css'));
const HTML = read('index.html');
const SW = read('service-worker.js');
const SEC = stripJs(read('js/ds-sections.js'));

describe('Filter — Aufbau', () => {
    it('das Modul wird geladen und steht im Offline-Vorrat', () => {
        assert.match(HTML, /js\/ds-filter\.js/);
        assert.match(SW, /'\.\/js\/ds-filter\.js'/);
    });

    it('drei Datenraeume, jeder auf genau einen Reiter', () => {
        const block = /var RAEUME = \[([\s\S]*?)\n    \];/.exec(CODE);
        assert.ok(block, 'RAEUME nicht gefunden');
        const keys = [...block[1].matchAll(/key:\s*'([^']+)'/g)].map(m => m[1]);
        const tabs = [...block[1].matchAll(/tab:\s*'([^']+)'/g)].map(m => m[1]);
        assert.deepStrictEqual(keys, ['jp', 'gl', 'past']);
        assert.deepStrictEqual(tabs, ['city-league', 'current-meta', 'past-meta']);
    });

    it('die Zeile sitzt in allen drei Reitern an derselben Stelle', () => {
        // Sonst springt sie beim Wechseln und liest sich nicht mehr
        // als dieselbe Zeile.
        const a = /var ANKER = \{([\s\S]*?)\n    \};/.exec(CODE);
        assert.ok(a);
        for (const t of ['city-league', 'current-meta', 'past-meta']) {
            assert.ok(a[1].includes("'" + t + "'"), t + ' fehlt');
        }
        assert.match(a[1], /header/);
    });
});

describe('Filter — kein zweites Bedienelement', () => {
    it('die Optionen kommen aus dem vorhandenen Select', () => {
        // #cityLeagueFormatSelect und #pastMetaFormatFilter existieren
        // laengst. Eine zweite Quelle waere eine zweite Wahrheit.
        assert.match(CODE, /quelle:\s*'cityLeagueFormatSelect'/);
        assert.match(CODE, /quelle:\s*'pastMetaFormatFilter'/);
        const fn = /function formate\(raum\) \{[\s\S]*?\n    \}/.exec(CODE)[0];
        assert.match(fn, /document\.getElementById\(raum\.quelle\)/);
    });

    it('ein Klick setzt den vorhandenen Select, statt ihn zu ersetzen', () => {
        assert.match(CODE, /f\.sel\.value = /);
        assert.match(CODE, /f\.sel\.dispatchEvent\(new Event\('change'/);
    });

    it('fehlt das Select noch, bleibt die Zeile leer statt zu raten', () => {
        const fn = /function formate\(raum\) \{[\s\S]*?\n    \}/.exec(CODE)[0];
        assert.match(fn, /if \(!sel \|\| !sel\.options \|\| !sel\.options\.length\) return null;/);
    });

    it('Global bekommt ein Schild, keinen Schalter', () => {
        // Dort gilt immer das laufende Fenster. Ein Knopf, der nichts
        // zu waehlen hat, ist eine Luege ueber die Daten.
        const block = /var RAEUME = \[([\s\S]*?)\n    \];/.exec(CODE)[1];
        assert.match(block, /key:\s*'gl',[\s\S]*?quelle:\s*null/);
        assert.match(CODE, /ds-filter-fixed/);
        /* DIE GESTRICHELTE UMRANDUNG IST AM 01.09.2026 GEFALLEN.
           Sie war 32px hoch und stand neben zwei 44px hohen Knopfreihen.
           Gemeldet: "Lieber dieses TEF-bis-PBL-Feld optisch den anderen
           anpassen." Das Schild sieht jetzt aus wie ein gesetzter Knopf.
           Dass es keiner ist, sagt der fehlende Hover und der fehlende
           Zeigefinger — nicht mehr eine zweite Formensprache.
           Geprueft wird deshalb die GLEICHHEIT statt des Unterschieds:
           dieselbe Mindesthoehe und dieselbe Rundung wie .ds-filter-btn. */
        const schild = /\.ds-filter-fixed\s*\{([^}]*)\}/.exec(CSS)[1];
        const knopf  = /\.ds-filter-btn\s*\{([^}]*)\}/.exec(CSS)[1];
        assert.ok(!/border:\s*1px dashed/.test(schild), 'die gestrichelte Kante ist zurueck');
        for (const eig of ['min-height', 'border-radius']) {
            const w = (t) => (new RegExp(eig + ':\\s*([^;]+);').exec(t) || [])[1];
            assert.strictEqual(w(schild), w(knopf),
                `${eig} weicht wieder vom Knopf ab: ${w(schild)} statt ${w(knopf)}`);
        }
    });

    it('das Schild erklaert sich nicht selbst', () => {
        /* Darunter stand ein Satz: erst "hier gibt es nur das laufende
           Format", dann "Global laeuft immer im aktuellen Format."
           Gemeldet: "Okay, den Zusatz kannst du aber rauslassen."
           Eine Anzeige, die "TEF-PBL" sagt, braucht keine
           Bildunterschrift, die "das ist das laufende Format" sagt. */
        assert.ok(!/läuft immer im aktuellen Format/.test(CODE),
            'der Erklaersatz ist zurueck');
        assert.ok(!/ds-filter-note/.test(CODE),
            'die Klasse fuer den Erklaersatz wird wieder benutzt');
        assert.ok(!/\.ds-filter-note\s*\{/.test(CSS),
            'die Regel fuer den Erklaersatz steht noch, ohne dass sie jemand benutzt');
    });

    it('die zweite Spalte heisst bei Japan nicht "Format"', () => {
        // Dort stehen "Aktuelles Meta" und "Vergangenes Meta" — das ist
        // ein Zeitraum.
        const block = /var RAEUME = \[([\s\S]*?)\n    \];/.exec(CODE)[1];
        assert.match(block, /key:\s*'jp',[\s\S]*?zweiteDe:\s*'Zeitraum'/);
    });
});

describe('Filter — ab fuenf Optionen ein Auswahlfeld', () => {
    it('die Schwelle steht im Code', () => {
        // Sechzehn Knoepfe mit "Scarlet & Violet → Phantasmal Flames
        // (SVI-PFL)" waeren eine Wand, keine Auswahl.
        assert.match(CODE, /f\.opts\.length > 4/);
    });

    it('das Auswahlfeld ist beschriftet und fokussierbar', () => {
        assert.match(CODE, /sl\.setAttribute\('aria-label'/);
        assert.match(CSS, /\.ds-filter-select:focus-visible\s*\{[^}]*outline/);
    });
});

describe('Filter — umschliessen statt anfassen', () => {
    it('switchTab wird umschlossen, nicht veraendert', () => {
        assert.match(CODE, /__dsFilterWrapped/);
        assert.match(CODE, /orig\.apply\(this, arguments\)/);
    });

    it('ein Fehler darf die Navigation nie blockieren', () => {
        assert.match(CODE, /try \{ setTimeout\(zeichne, \d+\); \} catch \(e\)/);
    });

    it('languageChanged wird auf document UND window gehoert', () => {
        assert.match(CODE, /document\.addEventListener\('languageChanged', zeichne\)/);
        assert.match(CODE, /window\.addEventListener\('languageChanged', zeichne\)/);
    });
});

describe('Filter — Aussehen aus Tokens', () => {
    it('keine feste Farbe, keine feste Schriftgroesse, kein !important', () => {
        const i = CSS.indexOf('.ds-filter {');
        assert.ok(i > -1);
        const block = CSS.slice(i);
        assert.deepStrictEqual(block.match(/#[0-9a-fA-F]{3,8}\b/g) || [], []);
        assert.deepStrictEqual(block.match(/font-size:\s*\d+px/g) || [], []);
        assert.ok(!/!important/.test(block));
    });

    it('der aktive Datenraum traegt seine Farbe aus den Tokens', () => {
        for (const k of ['jp', 'gl', 'past']) {
            assert.match(CSS, new RegExp('data-space="' + k + '"\\]\\s*\\{[^}]*var\\(--space-' + k + '\\)'));
        }
    });

    it('die Knoepfe sind gross genug zum Antippen', () => {
        const b = /\.ds-filter-btn\s*\{([^}]*)\}/.exec(CSS)[1];
        assert.ok(Number(/min-height:\s*(\d+)px/.exec(b)[1]) >= 32);
    });
});

describe('Regression 18.08. — Sprachwechsel ohne Sektionen', () => {
    it('zeichneReset faellt nicht ueber einen fehlenden Zustand', () => {
        // Wer die Sprache wechselt, ohne current-meta je geoeffnet zu
        // haben, kam mit offen === null an:
        //   TypeError: Cannot read properties of null (reading 'length')
        // Gemessen auf past-meta und city-league. Der Fehler war schon
        // ausgeliefert, als er auffiel.
        const fn = /function zeichneReset\(host\) \{[\s\S]*?\n    \}/.exec(SEC)[0];
        assert.match(fn, /if \(!offen\)/);
    });

    it('neuBeschriften steigt aus, wenn es keine Abschnitte gibt', () => {
        const fn = /function neuBeschriften\(\) \{[\s\S]*?\n    \}/.exec(SEC)[0];
        assert.match(fn, /querySelector\('\.ds-sec'\)/);
    });
});
