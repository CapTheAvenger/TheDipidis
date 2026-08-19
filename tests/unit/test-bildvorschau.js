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

    it('NIRGENDS im Projekt steht noch der alte Selektor', () => {
        // Diese Zusage ist aus Schaden entstanden. Beim Umbenennen war in
        // js/ und css/ gesucht worden — nicht in prerender/. Dort treibt
        // prerender-meta-call.js die Seite mit Playwright und wartete auf
        // '#mc-share-preview-modal .mc-share-preview-img'. Den Selektor gab
        // es nicht mehr. Der Deploy ist zweimal gescheitert, jedes Mal nach
        // 30 Sekunden Timeout, und die Seite blieb auf dem alten Stand.
        const wurzel = path.join(__dirname, '..', '..');
        const ueberspringen = new Set(['node_modules', '.git', 'test-results', 'dist', '_site']);
        const treffer = [];
        (function lauf(ordner, tiefe) {
            if (tiefe > 4) return;
            for (const e of fs.readdirSync(ordner, { withFileTypes: true })) {
                if (ueberspringen.has(e.name)) continue;
                const voll = path.join(ordner, e.name);
                if (e.isDirectory()) { lauf(voll, tiefe + 1); continue; }
                if (!/\.(js|mjs|cjs|css|html|py|yml|yaml|sh)$/.test(e.name)) continue;
                const rel = path.relative(wurzel, voll);
                if (rel === path.join('tests', 'unit', 'test-bildvorschau.js')) continue;
                if (fs.readFileSync(voll, 'utf8').includes('mc-share-preview')) treffer.push(rel);
            }
        }(wurzel, 0));
        assert.deepEqual(treffer, [],
            'alter Selektor noch in: ' + treffer.join(', '));
    });

    it('der Vorab-Renderer greift auf die neuen Kennungen zu', () => {
        const pre = read('prerender/prerender-meta-call.js');
        assert.match(pre, /#dsBildvorschau \.ds-bildvorschau-img/,
            'prerender-meta-call.js findet das Bild nicht — der Deploy scheitert daran');
        assert.match(pre, /getElementById\('dsBildvorschau'\)/);
    });

    it('und die drei Aufrufer warten nicht auf das Fenster', () => {
        // zeige() erfuellt sich erst beim Schliessen. Wuerde ein Aufrufer
        // darauf warten, bliebe der Vorab-Renderer stehen, bis jemand das
        // Fenster zuklickt — im CI also fuer immer.
        assert.ok(!/await _showSharePreview\(/.test(MC),
            'ein Aufrufer wartet auf das Schliessen des Fensters');
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

    it('der zweite Knopf kopiert, statt ein Menue zu oeffnen', () => {
        // Gemeldet: "cool waer, wenn ich auf Teilen druecke, dass dann nicht
        // 'n extra Menue aufgeht, sondern dass es automatisch in die
        // Zwischenablage kopiert wird … beim Speichern wird's ja schon in die
        // Fotomediathek gespeichert." Also ein Knopf in die Zwischenablage,
        // einer auf die Platte, und kein dritter Weg dazwischen.
        assert.match(SRC, /ds-bildvorschau-btn-kopieren/);
        assert.match(SRC, /navigator\.clipboard\.write/);
        assert.match(SRC, /new window\.ClipboardItem\(\{ 'image\/png': blob \}\)/);
        assert.ok(!/navigator\.share\(/.test(SRC),
            'das System-Teilen-Menue ist zurueck');
    });

    it('und speichert, wo Kopieren nicht geht — mit Ansage', () => {
        // ClipboardItem gibt es nicht ueberall und nur im sicheren Kontext.
        assert.match(SRC, /kannKopieren = !!\(navigator\.clipboard/);
        assert.match(SRC, /\.catch\(function \(\) \{[\s\S]{0,240}speichern\(blob, dateiname\)/);
        assert.match(SRC, /function melde\(/, 'ohne Rueckmeldung merkt niemand, dass kopiert wurde');
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
