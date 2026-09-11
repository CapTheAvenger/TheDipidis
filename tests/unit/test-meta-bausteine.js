/**
 * Die Meta-Ansicht als Bausteine.
 *
 * GEMESSEN am 18.08.2026, vor js/ds-sections.js:
 *
 *   current-meta            11.364 px Desktop / 14.046 px Mobil
 *                           = 12,6 / 16,6 Bildschirmhoehen am Stueck
 *   Matchup-Heatmap         y = 6.562 px   (7,3 Bildschirme tief)
 *   Most Used Cards         y = 7.417 px   (8,2 Bildschirme tief)
 *   Vollstaendige Tabelle   2.479 px = 22 % der Seite
 *
 * Danach, im Browser nachgemessen:
 *
 *   Desktop  2.545 px    Heatmap y = 754    Karten y = 1.683
 *   Mobil    3.476 px    Heatmap y = 1.313  Karten y = 2.360
 *
 * Der Unterschied zum Vanilla-Modus der Deck-Analyse ist der ganze
 * Punkt: der nimmt 45 von 46 Bausteinen aus der Seite (4.039 gegen
 * 7.691 px). Hier bleibt jeder Abschnitt mit seiner Ueberschrift
 * stehen — zugeklappt ist nicht weg.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripJs = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/.*$/gm, '$1');
const stripCss = s => s.replace(/\/\*[\s\S]*?\*\//g, '');

const SRC = read('js/ds-sections.js');
const CODE = stripJs(SRC);
const CSS = stripCss(read('css/components.css'));
const HTML = read('index.html');
const SW = read('service-worker.js');

describe('Bausteine — Aufbau', () => {
    it('das Modul wird geladen und steht nach ds-nav.js', () => {
        const iNav = HTML.indexOf('js/ds-nav.js');
        const iSec = HTML.indexOf('js/ds-sections.js');
        assert.ok(iSec > -1, 'ds-sections.js ist nicht eingebunden');
        assert.ok(iNav > -1 && iSec > iNav, 'muss nach ds-nav.js kommen');
    });

    it('es steht im Offline-Vorrat', () => {
        assert.match(SW, /'\.\/js\/ds-sections\.js'/);
    });

    it('fuenf Abschnitte, jeder in beiden Sprachen benannt', () => {
        const block = /var SECTIONS = \[([\s\S]*?)\n    \];/.exec(CODE);
        assert.ok(block, 'SECTIONS nicht gefunden');
        const ids = [...block[1].matchAll(/id:\s*'([^']+)'/g)].map(m => m[1]);
        // Waren neun, am 19.08.2026 in zwei Schritten auf sechs:
        //   "Gespielt gegen erfolgreich" + "Top 8 gegen Erwartung"
        //       -> eine sortierbare Rangliste "Meta-Performance"
        //   "Ueberblick" + "Vollstaendige Tabelle"
        //       -> aufgeloest. Die eine Angabe aus dem Ueberblick, die sonst
        //          nirgends stand (Turniere/Spieler/Partien), steht jetzt in
        //          der Kachel "Gemeldete Listen"; die vollstaendige Tabelle ist
        //          in der Rangliste aufgegangen, samt Ausklappen fuer den Rest.
        // Und am 20.08.2026 einer dazu: 'ev', der Rechner "Gegen welches
        // Feld?". Er kam bewusst NICHT nach vorn — die ersten drei sind
        // die Eingangsantwort und bleiben zu dritt.
        // Und am 01.09.2026 einer weniger: 'movers' ("Auf- und
        // Absteiger") ist entfernt. Gemeldet: "ich glaube, das ist
        // mittlerweile auch eine Sache, die wir wegnehmen koennen."
        // Und am 11.09.2026 noch einer weniger: 'ev' ist entfallen.
        // Die Rechnung war zuvor in den Meta Call gezogen, hier stand
        // nur noch ein Verweis. Gemeldet: "Der your Deck vs the Meta
        // Bereich ergibt auf der aktuellen Meta Seite so ja gar kein
        // Sinn mehr." Der Weg dorthin fuehrt jetzt ueber den Knopf
        // "Gegen das Meta" an jeder Deck-Karte der Tier-Liste.
        assert.strictEqual(ids.length, 5, 'gefunden: ' + ids.join(', '));
        assert.strictEqual(new Set(ids).size, 5, 'doppelte id');
        assert.ok(!ids.includes('ev'),
            'der leere Verweis-Abschnitt ist zurueck: ' + ids.join(', '));
        const de = (block[1].match(/de:\s*\[/g) || []).length;
        const en = (block[1].match(/en:\s*\[/g) || []).length;
        assert.strictEqual(de, 5);
        assert.strictEqual(en, 5);
    });

    it('offen ist, was man zuerst liest — und die Karten am Ende', () => {
        // Bis zum 11.09.2026: die ersten drei offen, der Rest zu. Die
        // dritte Stelle hatten die Karten; sie stehen jetzt hinten
        // (siehe unten). Offen bleiben sie trotzdem: unter ihnen kommt
        // nichts mehr, also schiebt ihre Hoehe niemanden weg, und die
        // Filterzeile ist ohne zweiten Klick zu sehen — genau darum
        // hatte der Betreiber am selben Abend gebeten.
        const block = /var SECTIONS = \[([\s\S]*?)\n    \];/.exec(CODE)[1];
        const ids = [...block.matchAll(/id:\s*'([^']+)'/g)].map(m => m[1]);
        const flags = [...block.matchAll(/auf:\s*(true|false)/g)].map(m => m[1] === 'true');
        assert.strictEqual(flags.length, ids.length, 'jeder Abschnitt braucht auf:');
        const auf = {};
        ids.forEach((id, i) => { auf[id] = flags[i]; });
        assert.deepStrictEqual(auf,
            { top: true, heatmap: true, tiers: false, rang: false, cards: true });
    });

    it('die Antwort steht vorn: Decks, Matchups — die Karten ganz hinten', () => {
        const block = /var SECTIONS = \[([\s\S]*?)\n    \];/.exec(CODE)[1];
        const ids = [...block.matchAll(/id:\s*'([^']+)'/g)].map(m => m[1]);
        assert.deepStrictEqual(ids.slice(0, 2), ['top', 'heatmap'],
            'die Heatmap stand vorher 7,3 Bildschirme tief');
        // BESTELLT am 11.09.2026: „Most played cards als letzten Punkt
        // auf die Seite setzen, weil das ist ja mehr eine Side Info zum
        // Meta als wirklich relevant." Vorher standen die Karten an
        // dritter Stelle, also mitten zwischen Heatmap und Tier-Liste.
        assert.strictEqual(ids[ids.length - 1], 'cards',
            'die Karten sind Nebeninformation und gehoeren ans Ende');
        // 'full' gibt es nicht mehr — die vollstaendige Tabelle ist in die
        // Rangliste aufgegangen. Seit dem 01.09.2026 auch 'movers' nicht
        // mehr.
        assert.ok(!ids.includes('full') && !ids.includes('overview')
                  && !ids.includes('movers'),
            'aufgeloeste Abschnitte sind zurueck: ' + ids.join(', '));
    });
});

describe('Bausteine — verschieben, nicht neu erzeugen', () => {
    it('die Bloecke werden umgehaengt, nicht ueber innerHTML neu gesetzt', () => {
        // Der ganze Ansatz haengt daran: appendChild bewegt den Knoten
        // und laesst jeden Ereignis-Handler dran. Im Browser geprueft am
        // 18.08.2026 am Suchfeld der Tier-Ansicht, das nach dem Umzug
        // weiterfilterte (29 -> 1 Karten). Das Suchfeld ist seit dem
        // 01.09.2026 entfernt; die Zusicherung gilt unveraendert fuer
        // die Sortierung der Rangliste und die Heatmap-Tooltips.
        assert.match(CODE, /body2\.appendChild\(t\)/);
        // innerHTML darf nur auf Knoten stehen, die dieses Modul selbst
        // erzeugt hat — nie auf einem Block, der schon Handler traegt.
        //   b      der Kopf-Knopf, in kopf() erzeugt
        //   platz   das leere <span class="ds-sec-info"> daneben, in
        //           kopf() erzeugt — dort und nur dort steht seit dem
        //           10.09.2026 der Info-Knopf. Nachgezeichnet wird die
        //           Knopfzeile, NIE der Abschnitt: die Bloecke darin
        //           sind verschoben und traegen fremde Handler.
        //   row     die Rueckweg-Zeile, in zeichneReset() erzeugt
        const ziele = [...CODE.matchAll(/(\w+)\.innerHTML\s*=/g)].map(m => m[1]);
        assert.deepStrictEqual([...new Set(ziele)].sort(), ['b', 'platz', 'row'],
            'innerHTML auf fremdem Inhalt: ' + ziele.join(', '));
    });

    it('ein Knoten, der sein Ziel enthaelt, wird nie eingehaengt', () => {
        // Sonst: HierarchyRequestError, und der Rest der Runde bricht ab.
        assert.match(CODE, /t\.contains\(body2\)/);
    });

    it('der Tier-Finder haelt auch unterhalb eines Abschnitts an', () => {
        // Beim zweiten Durchlauf lief er sonst bis zum Abschnitt selbst
        // hinauf und sollte in seinen eigenen Koerper gehaengt werden.
        const fn = /function findeTiers\(host\) \{[\s\S]*?\n    \}/.exec(CODE)[0];
        assert.match(fn, /classList\.contains\('ds-sec-body'\)/);
    });

    it('Abschnitte werden nie als Inhalt eingesammelt', () => {
        // Sonst haengt sich ein Abschnitt in seinen eigenen Koerper.
        const fn = /function kandidaten\(host\) \{[\s\S]*?\n    \}/.exec(CODE)[0];
        assert.match(fn, /classList\.contains\('ds-sec'\)/);
    });
});

describe('Bausteine — wiederholbar', () => {
    it('kein einmaliges Fertig-Kennzeichen', () => {
        // Der erste Versuch hatte eines. Gemessen: auf dem Schreibtisch
        // waren nach der ersten Renderwelle vier von neun Abschnitten
        // gebaut, sieben Bloecke blieben fuer immer draussen.
        assert.ok(!/data-ds-sectioned/.test(CODE));
    });

    it('sektionieren meldet, ob es etwas geaendert hat', () => {
        const fn = /function sektionieren\(\) \{[\s\S]*?\n    \}/.exec(CODE)[0];
        assert.match(fn, /var geaendert = false;/);
        assert.match(fn, /return geaendert;/);
    });

    it('der Beobachter kann sich deshalb nicht selbst aufschaukeln', () => {
        assert.match(CODE, /MutationObserver/);
        assert.match(CODE, /setTimeout\(sektionieren, \d+\)/);
    });

    it('er beobachtet auch die Abschnitte, nicht nur den Host', () => {
        // Spaeter gerenderte Bloecke landen nicht am Host, sondern in
        // dem Abschnitt, neben dessen Inhalt sie eingefuegt werden.
        // Live beobachtet: .top-cards-container strandete im
        // "Ueberblick", und der Abschnitt "Karten" fehlte stillschweigend.
        assert.match(CODE, /childList: true, subtree: true/);
    });

    it('gestrandete Bloecke werden zurueckgeholt', () => {
        const fn = /function kandidaten\(host\) \{[\s\S]*?\n    \}/.exec(CODE);
        assert.ok(fn, 'kandidaten() fehlt');
        assert.match(fn[0], /:scope > \.ds-sec > \.ds-sec-body/);
    });

    it('die Reihenfolge wird nur hergestellt, wenn sie abweicht', () => {
        const fn = /function sektionieren\(\) \{[\s\S]*?\n    \}/.exec(CODE)[0];
        assert.match(fn, /soll\.join\(\) !== ist\.join\(\)/);
    });
});

describe('Bausteine — zugeklappt ist nicht weg', () => {
    it('ein zugeklappter Abschnitt behaelt seine Ueberschrift', () => {
        // Nur der Koerper verschwindet, nie der Kopf.
        assert.match(CSS, /\.ds-sec-body\s*\{[^}]*display:\s*none/);
        assert.match(CSS, /\.ds-sec\.is-open\s*>\s*\.ds-sec-body\s*\{[^}]*display:\s*block/);
        const hd = /\.ds-sec-hd\s*\{([^}]*)\}/.exec(CSS)[1];
        assert.ok(!/display:\s*none/.test(hd));
    });

    it('kein Abschnitt wird je aus dem Dokument entfernt', () => {
        assert.ok(!/\.remove\(\)/.test(CODE.replace(/if \(alt\) alt\.remove\(\);/g, '')),
            'nur die Rueckweg-Zeile darf sich entfernen');
    });

    it('der Klappzustand wird gemerkt', () => {
        assert.match(CODE, /localStorage\.setItem\(STORE/);
        assert.match(CODE, /localStorage\.getItem\(STORE\)/);
    });

    it('der Kopf sagt Screenreadern, ob er offen ist', () => {
        assert.match(CODE, /setAttribute\('aria-expanded'/);
    });
});

describe('Bausteine — Aussehen aus Tokens', () => {
    it('keine feste Farbe und keine feste Schriftgroesse', () => {
        const block = CSS.slice(CSS.indexOf('.ds-sec {'));
        assert.deepStrictEqual(block.match(/#[0-9a-fA-F]{3,8}\b/g) || [], []);
        assert.deepStrictEqual(block.match(/font-size:\s*\d+px/g) || [], []);
    });

    it('kein !important', () => {
        const block = CSS.slice(CSS.indexOf('.ds-sec {'));
        assert.ok(!/!important/.test(block), 'der Umbau selbst waere sonst der naechste Befund');
    });

    it('Kopf und Rueckweg haben einen sichtbaren Fokusrahmen', () => {
        assert.match(CSS, /\.ds-sec-hd:focus-visible\s*\{[^}]*outline/);
        assert.match(CSS, /\.ds-sec-reset-btn:focus-visible\s*\{[^}]*outline/);
    });
});

describe('Bausteine — der Rueckweg', () => {
    it('erscheint nur bei Abweichung vom Startzustand', () => {
        const fn = /function zeichneReset\(host\) \{[\s\S]*?\n    \}/.exec(CODE)[0];
        assert.match(fn, /if \(gleich\) \{ if \(alt\) alt\.remove\(\); return; \}/);
    });

    it('nennt, wie viele Abschnitte offen sind', () => {
        const fn = /function zeichneReset\(host\) \{[\s\S]*?\n    \}/.exec(CODE)[0];
        assert.match(fn, /SECTIONS\.length/);
    });
});

describe('Bausteine — Sprache', () => {
    it('hoert auf document UND window', () => {
        // i18n verschickt auf document und ohne bubbles. Auf window
        // allein kaeme das Ereignis nie an — der Fehler aus Block 4.
        assert.match(CODE, /document\.addEventListener\('languageChanged'/);
        assert.match(CODE, /window\.addEventListener\('languageChanged'/);
    });
});

describe('Bausteine — was sonst zerbrochen waere', () => {
    it('die eine Regel, die auf der direkten Kindbeziehung stand, ist geloest', () => {
        const mm = stripCss(read('css/current-meta-matchups.css'));
        assert.ok(!/#currentMetaContent\s*>\s*\.section/.test(mm),
            'nach dem Sektionieren ist .section ein Enkel, kein Kind');
        assert.match(mm, /#currentMetaContent \.section > div > div\[style\*="background: #f8f9fa"\]/);
    });
});
