/**
 * Die sechs Aktionsknoepfe auf einer Karte im Deck-Gitter.
 *
 * Gemessen am 18.08.2026 in der Deck-Analyse (Global), ein Archetyp,
 * ein Bildschirm: 37 Karten, 296 Knoepfe, jeder 43,7 x 19 px mit
 * 9-px-Schrift. Auf 390 px: 24 x 22 px, ebenfalls 9 px.
 *
 * Die Groesse dieser sechs Knoepfe wurde an 31 Stellen gesetzt, verteilt
 * ueber drei Stylesheets und einen Inline-Block in index.html, in
 * Medienabfragen bei 768 / 600 / 480 / 430 / 420 / 412 / 390 / 360 px.
 * Gewonnen hat am Ende eine Regel, die nie fuer sie geschrieben wurde:
 *
 *     .card-item [class*="action"] button { min-height: 22px !important }
 *
 * Der Inline-Block in index.html hatte 2026-06-10 schon einmal genau
 * dieses Problem loesen wollen — 34 !important, Kommentar "the buttons
 * now hit the 'I can actually tap and read this' bar" — und verloren,
 * weil `.card-item [class*=...] button` spezifischer ist als
 * `body .city-league-card-action-btn`.
 *
 * Diese Tests halten fest, dass es wieder EINE Stelle ist.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const R = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const UI = R('css/ui-components.css');
const MOB = R('css/mobile-responsive.css');
const STYLES = R('css/styles.css');
const HTML = R('index.html');

const BTN = /city-league-card-(action-btn|market-btn|remove-btn|add-btn|rarity-btn|limitless-btn|proxy-btn)/;
const SIZE = /(^|[\s;{])(height|min-height|max-height|font-size)\s*:/;

// Jede Regel eines Stylesheets als { selektor, koerper, quelle }.
// Kommentare fliegen vorher raus: diese Datei erklaert den Berg
// ausfuehrlich und nennt dabei jede Klasse beim Namen — ein Parser, der
// das mitliest, findet Regeln, die es nicht gibt.
function rules(css, name) {
    const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const out = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(clean)) !== null) {
        out.push({ sel: m[1].trim(), body: m[2], src: name });
    }
    return out;
}
const ALL = [...rules(UI, 'ui-components.css'),
             ...rules(MOB, 'mobile-responsive.css'),
             ...rules(STYLES, 'styles.css')];

describe('Kartenknoepfe: eine Stelle, nicht einunddreissig', () => {
    it('nur zwei Regeln bemessen die Knoepfe', () => {
        const sizing = ALL.filter(r => BTN.test(r.sel) && SIZE.test(r.body));
        const list = sizing.map(r => `${r.src}: ${r.sel.split('\n')[0].slice(0, 60)}`);
        // Fuenf: die Basisregel, die Schriftgroesse fuer L und P, der
        // Preis (der eine eigene Flaeche hat), und zwei Anhebungen auf
        // Mobil. Vor dem 18.08.2026 waren es 31. Die Schranke fangt den
        // Rueckfall, nicht die naechste berechtigte Regel.
        assert.ok(sizing.length <= 6,
            'Die Groesse dieser Knoepfe wird an ' + sizing.length + ' Stellen gesetzt. '
            + 'Vor der Aufraeumung waren es 31, verteilt ueber drei Stylesheets und einen '
            + 'Inline-Block:\n  ' + list.join('\n  '));
    });

    it('keine Regel schrumpft sie unter 24 px oder unter 11 px', () => {
        const bad = [];
        for (const r of ALL) {
            if (!BTN.test(r.sel)) continue;
            for (const m of r.body.matchAll(/(min-height|height|font-size)\s*:\s*(\d+)px/g)) {
                const v = Number(m[2]);
                const floor = m[1] === 'font-size' ? 11 : 24;
                if (v < floor) bad.push(`${r.src}: ${r.sel.split('\n')[0].slice(0, 50)} -> ${m[0]}`);
            }
        }
        assert.deepEqual(bad, [],
            'Diese Regeln machen die Knoepfe wieder kleiner als lesbar bzw. treffbar:\n  '
            + bad.join('\n  '));
    });

    it('index.html traegt keinen Inline-Block fuer die Knoepfe mehr', () => {
        const head = HTML.slice(0, HTML.indexOf('</head>'))
            .replace(/\/\*[\s\S]*?\*\//g, '')      // CSS-Kommentare im <style>
            .replace(/<!--[\s\S]*?-->/g, '');       // HTML-Kommentare
        assert.ok(!BTN.test(head),
            'Im <head> von index.html steht wieder eine Regel fuer die Kartenknoepfe. '
            + 'Ein Inline-Block ist die Stelle, an der niemand sucht — und er hat beim '
            + 'letzten Mal verloren.');
    });

    it('die Wildcard-Regel faengt die Kartenknoepfe nicht mehr', () => {
        const mobCode = MOB.replace(/\/\*[\s\S]*?\*\//g, '');
        assert.ok(!/\[class\*="action"\]\s+button/.test(mobCode),
            '`[class*="action"] button` faengt jeden Knopf, dessen Klasse irgendwo '
            + '"action" enthaelt — auch die sechs Kartenknoepfe, fuer die die Regel '
            + 'nie gedacht war.');
    });
});

describe('Kartenknoepfe: die Farbregel', () => {
    it('das Paar Hinzufuegen / Entfernen ist nicht rot-gruen', () => {
        const add = ALL.find(r => /^\.city-league-card-add-btn\s*$/.test(r.sel));
        const rem = ALL.find(r => /^\.city-league-card-remove-btn\s*$/.test(r.sel));
        assert.ok(add, '.city-league-card-add-btn fehlt');
        assert.ok(!/#22c55e|#16a34a|green/i.test(add.body),
            'Hinzufuegen ist wieder gruen. Sein Gegenstueck ist Entfernen — das Paar '
            + 'liegt damit auf der Achse, auf der jeder Zwoelfte nichts unterscheidet.');
        if (rem) {
            assert.ok(!/background:\s*#ef4444|background:\s*red/i.test(rem.body),
                'Entfernen ist wieder rot.');
        }
    });

    it('genau zwei Akzente je Karte', () => {
        // Alles andere ist ein Chip aus --surface-2. Ein dritter Akzent
        // waere der Anfang zurueck zum Regenbogen.
        const accented = ALL.filter(r =>
            BTN.test(r.sel) &&
            /background:\s*var\(--(brand|ink|gold|alarm)\)/.test(r.body) &&
            !/:hover/.test(r.sel));
        const names = accented.map(r => r.sel.split('\n')[0].slice(0, 50));
        assert.ok(accented.length <= 2,
            'Mehr als zwei farbige Knoepfe je Karte: ' + names.join(' | '));
    });

    it('kein roher Hex-Verlauf mehr auf den Knoepfen', () => {
        const grad = ALL.filter(r => BTN.test(r.sel) && /linear-gradient\([^)]*#/.test(r.body));
        assert.deepEqual(grad.map(r => r.sel.split('\n')[0].slice(0, 50)), []);
    });
});

describe('Kartenknoepfe: tote Selektoren', () => {
    it('kein :last-child mehr fuer die Preiszeile', () => {
        // Es gibt drei Aktionszeilen. Die letzte ist die Cooking-Mode-Reihe
        // mit Pin und Exclude — ausgeblendet, aber im DOM. Die Preiszeile
        // ist die vorletzte, also hat :last-child sie nie getroffen.
        assert.ok(!/action-row:last-child\s+\.city-league-card-(market|limitless|proxy)-btn/.test(UI),
            'Die :last-child-Regeln sind zurueck. Sie treffen die Cooking-Mode-Reihe, '
            + 'nicht die Zeile mit L / P / Preis.');
    });

    it('die drei Deck-Analysen teilen sich einen Regelblock', () => {
        // Vorher: dreimal exakt dieselben 40 Zeilen, byte-gleich bis auf
        // das Praefix.
        assert.match(UI, /#city-league-analysis \.city-league-card-info-bottom,\n#current-analysis \.city-league-card-info-bottom,\n#past-meta \.city-league-card-info-bottom \{/,
            'Die gemeinsame Selektorliste fehlt — dann stehen die drei Ansichten wieder '
            + 'je fuer sich, und wer eine Zahl aendert, aendert sie an einer Stelle.');
        // Die drei Bloecke ausserhalb der Medienabfragen sind zu einem
        // geworden; in den Medienabfragen leben noch Reste, die Block 8
        // mit der echten Zusammenlegung aufloest.
        assert.match(UI, /#city-league-analysis \.city-league-card-action-buttons,\n#current-analysis \.city-league-card-action-buttons,\n#past-meta \.city-league-card-action-buttons \{/,
            'Auch die Aktionsleiste braucht die gemeinsame Liste.');
    });
});
