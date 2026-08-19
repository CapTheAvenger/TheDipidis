/**
 * Erst das Bild sehen, dann entscheiden.
 *
 * Der Knopf "Bild" an der Archetyp-Karte schob die fertige PNG-Datei bis
 * zum 19.08.2026 direkt in den Download-Ordner. Man bekam also ein Bild,
 * das man erst nach dem Speichern zu Gesicht bekam. Gemeldet:
 *
 *   "wenn man da auf Bild generieren drueckt, dann bekommt man 'n schoenes
 *    Bild. Warum zeigen wir das nicht direkt in der Seite an? … dann waer's
 *    vielleicht cool, wenn sich 'n Modal direkt mit dem Bild oeffnet."
 *
 * Das Fenster dafuer gab es laengst — im Meta Call, mit genau diesem
 * Gedanken als Kommentar daneben ("erst das Bild selbst sehen, dann
 * teilen"). Es war nur nie woanders angekommen. Dasselbe Muster wie schon
 * bei den zwei tierTitles-Tabellen und der Glaettung, die eine Etage
 * hoeher laengst lief: das Richtige existiert, eine Ansicht hat es, die
 * andere nicht.
 *
 * Darum ist es herausgeloest statt nachgebaut: js/ds-bildvorschau.js,
 * benutzt von ds-share.js (Tier-Liste) und app-meta-call.js. Markup und
 * CSS sind unveraendert die des Meta-Call-Fensters, nur neutral benannt
 * und nach css/components.css gezogen — dort gilt die Token-Regel, also
 * sind die rohen Hexe dieses Blocks dabei gleich mit verschwunden.
 *
 * Im Browser nachgemessen, Desktop 1440 und Mobil 390:
 *   Fenster oeffnet, Bild 688x387 bzw. 358x201 (16:9), role="dialog",
 *   Fokus auf dem Schliessen-Knopf, Escape schliesst, keine Seitenfehler.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripJs = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/.*$/gm, '$1');
const stripCss = s => s.replace(/\/\*[\s\S]*?\*\//g, '');

const SRC = stripJs(read('js/ds-bildvorschau.js'));
const SHARE = stripJs(read('js/ds-share.js'));
const MC = stripJs(read('js/app-meta-call.js'));
const COMP = stripCss(read('css/components.css'));
const MCCSS = stripCss(read('css/meta-call.css'));
const HTML = read('index.html');
const SW = read('service-worker.js');

describe('Bildvorschau — es gibt sie genau einmal', () => {
    it('das Fenster wird nicht mehr im Meta Call gebaut', () => {
        assert.ok(!/mc-share-preview/.test(MC),
            'app-meta-call.js baut das Fenster wieder selbst');
        assert.ok(!/mc-share-preview/.test(MCCSS),
            'die alten Regeln stehen wieder in meta-call.css');
    });

    it('beide Aufrufer benutzen dasselbe Modul', () => {
        assert.match(SHARE, /window\.DsBildvorschau/, 'ds-share.js zeigt kein Bild');
        assert.match(MC, /window\.DsBildvorschau/, 'app-meta-call.js benutzt das Modul nicht');
    });

    it('und beide kommen ohne es zurecht, falls es fehlt', () => {
        // Ein Knopf, der nichts tut, ist schlechter als ein Download ohne
        // Vorschau.
        for (const [name, src] of [['ds-share', SHARE], ['meta-call', MC]]) {
            assert.match(src, /typeof window\.DsBildvorschau\.zeige === 'function'/,
                name + ' prueft das Modul nicht, bevor es darauf zugreift');
        }
    });
});

describe('Bildvorschau — das Fenster selbst', () => {
    it('ist ein Dialog und sagt, was es zeigt', () => {
        assert.match(SRC, /role="dialog"/);
        assert.match(SRC, /aria-modal="true"/);
        assert.match(SRC, /aria-label="/);
    });

    it('laesst sich mit Escape, Kreuz, Knopf und Hintergrund schliessen', () => {
        assert.match(SRC, /ev\.key === 'Escape'/);
        assert.match(SRC, /ds-bildvorschau-close'\)\.addEventListener\('click', zu\)/);
        assert.match(SRC, /ds-bildvorschau-btn-secondary'\)\.addEventListener\('click', zu\)/);
        assert.match(SRC, /ds-bildvorschau-backdrop'\)\.addEventListener\('click', zu\)/);
    });

    it('gibt den Fokus zurueck, wo er herkam', () => {
        // Ohne das steht der Fokus nach dem Schliessen am Seitenanfang und
        // man scrollt sich wieder nach unten.
        assert.match(SRC, /var vorher = document\.activeElement/);
        assert.match(SRC, /vorher\.focus/);
    });

    it('raeumt seinen Tastatur-Handler wieder ab', () => {
        // Sonst sammelt sich bei jedem Oeffnen einer mehr an.
        assert.match(SRC, /removeEventListener\('keydown', taste, true\)/);
    });

    it('zeigt den Teilen-Knopf nur, wenn es ihn gibt', () => {
        assert.match(SRC, /kannTeilen = !!\(navigator\.share\)/);
        assert.match(SRC, /kannTeilen \?/);
    });

    it('faengt ein abgebrochenes Teilen ab und speichert stattdessen', () => {
        assert.match(SRC, /\.catch\(function \(\) \{[\s\S]{0,200}speichern\(blob, dateiname\)/);
    });

    it('maskiert alles, was in das Markup geht', () => {
        // Deckname und Dateiname landen in innerHTML.
        assert.match(SRC, /function esc\(/);
        const treffer = SRC.match(/esc\(/g) || [];
        assert.ok(treffer.length >= 5, 'zu wenig maskiert: ' + treffer.length);
    });
});

describe('Bildvorschau — eingebunden und gestaltet', () => {
    it('wird geladen und offline mitgenommen', () => {
        assert.match(HTML, /js\/ds-bildvorschau\.js/);
        assert.match(SW, /ds-bildvorschau\.js/);
    });

    it('das CSS liegt bei den Komponenten', () => {
        assert.match(COMP, /\.ds-bildvorschau-modal\s*\{/);
        assert.match(COMP, /\.ds-bildvorschau-img\s*\{/);
    });

    it('und haelt sich an die Token-Regel dieser Datei', () => {
        const a = COMP.indexOf('.ds-bildvorschau-modal');
        const block = COMP.slice(a);
        assert.deepEqual(block.match(/#[0-9a-fA-F]{3,8}\b/g) || [], [],
            'rohe Hex-Farbe in components.css');
        assert.deepEqual(block.match(/font-size:\s*[\d.]+(?:rem|px)/g) || [], [],
            'feste Schriftgroesse statt Token');
    });

    it('auf dem Telefon nimmt es den ganzen Bildschirm', () => {
        assert.match(COMP, /@media \(max-width: 600px\)[\s\S]{0,200}\.ds-bildvorschau-modal \{ padding: 0; \}/);
    });
});
