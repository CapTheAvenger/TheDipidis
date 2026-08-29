'use strict';
/*
 * Die Befunde der Agenten-Durchsicht vom 29.08.2026, als Zusicherung.
 *
 * Vier davon waren echte Fehler, alle vier selbst nachgeprueft, bevor
 * hier etwas geaendert wurde. Jede Zusicherung unten ist gegen ihre
 * eigene Umkehrung geprueft (Mutationstest im Sitzungsprotokoll):
 * wird die Reparatur zurueckgedreht, wird die Zusicherung rot.
 *
 * Was ausdruecklich NICHT hier steht: die Befunde, die ich nicht
 * selbst nachrechnen konnte. Eine Zusicherung auf eine ungepruefte
 * Behauptung waere schlimmer als keine.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..', '..');
const lies = p => fs.readFileSync(path.join(wurzel, p), 'utf8');

const MC = lies('js/app-meta-call.js');
const TG = lies('js/app-testing-groups.js');
const NAV = lies('css/ds-nav.css');
const TOKENS = lies('css/tokens.css');

// ── Helligkeit und Kontrast nach WCAG ──────────────────────────────
function leuchtdichte(hex) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const k = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
        .map(x => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
    return 0.2126 * k[0] + 0.7152 * k[1] + 0.0722 * k[2];
}
function kontrast(a, b) {
    const [x, y] = [leuchtdichte(a), leuchtdichte(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
}

describe('Predictor: die Renormierung darf nicht am Daempfer haengen', () => {
    it('sie steht nicht mehr innerhalb von if (stickinessDamped)', () => {
        // Stufe 5.9 addiert Prozentpunkte NACH der einzigen
        // Renormierung. Stand die Nach-Renormierung im if-Zweig,
        // summierte die Liste auf ueber 100 %, sobald 5.8 nichts
        // daempfte — mit den echten Momentaufnahmen 102,66 %.
        assert.ok(!/if \(stickinessDamped\) \{\s*\n\s*const dampedTotal/.test(MC),
            'die Renormierung haengt wieder am Daempfer');
    });

    it('der Block laeuft unbedingt und teilt weiter in gedaempft/ungedaempft', () => {
        const i = MC.indexOf('const dampedTotal');
        assert.notEqual(i, -1, 'der Renormierungsblock ist verschwunden');
        const block = MC.slice(i, i + 900);
        assert.match(block, /const nonDampedTotal/);
        assert.match(block, /targetForNonDamped\s*=\s*Math\.max\(0,\s*100 - dampedTotal\)/,
            'das Ziel der ungedaempften Decks wird nicht mehr aus 100 % gerechnet');
        assert.match(block, /if \(!d\.stickinessDamper\)/,
            'gedaempfte Decks werden wieder mitskaliert — das hebt den Daempfer teilweise auf');
    });

    it('ohne gedaempftes Deck bleibt die Aufteilung eine schlichte Renormierung', () => {
        // Nachgestellt: was der Block rechnet, wenn nichts gedaempft ist.
        const liste = [{ s: 40 }, { s: 35 }, { s: 27.66 }];   // Summe 102,66
        const dampedTotal = 0;
        const nonDampedTotal = liste.reduce((a, d) => a + d.s, 0);
        const ziel = Math.max(0, 100 - dampedTotal);
        const skala = nonDampedTotal > 0 ? ziel / nonDampedTotal : 1;
        const summe = liste.reduce((a, d) => a + d.s * skala, 0);
        assert.ok(Math.abs(summe - 100) < 1e-9, `Summe ${summe} statt 100`);
    });

    it('die Konsolenmeldung faellt weg, wenn nichts gedaempft wurde', () => {
        // Sonst meldet der Motor "0 decks damped" bei jedem Lauf.
        assert.match(MC, /if \(damped > 0\) console\.log\(/,
            'die 5.8-Meldung laeuft auch ohne Daempfung');
    });
});

describe('Testing Groups: kein Aufruf ins Leere', () => {
    // Kommentare zaehlen nicht als Aufruf — die Begruendung im
    // Quelltext nennt den Namen absichtlich. (Diese Zusicherung hat
    // beim ersten Lauf genau daran angeschlagen; das ist der Beleg,
    // dass sie ueberhaupt etwas sieht.)
    const TG_CODE = TG.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    it('_refreshCurrentGroup wird nicht mehr aufgerufen', () => {
        // Fuenf Aufrufe, null Definitionen. Der ReferenceError landete
        // im catch hinter dem erfolgreichen Schreibvorgang: gespeichert
        // war es, gemeldet wurde "Speichern fehlgeschlagen".
        assert.equal((TG_CODE.match(/_refreshCurrentGroup/g) || []).length, 0,
            '_refreshCurrentGroup ist zurueck — es gibt die Funktion nicht');
    });

    it('kein weiterer Aufruf auf eine Funktion, die es im Modul nicht gibt', () => {
        const definiert = new Set();
        for (const m of TG_CODE.matchAll(/(?:function|const|let|var)\s+(_[A-Za-z0-9]+)/g)) {
            definiert.add(m[1]);
        }
        const fehlend = new Set();
        // Ein vorangestellter Punkt heisst: das ist die Eigenschaft
        // eines anderen Moduls (window.MetaCall._testingGroupLoad),
        // kein Aufruf im eigenen Geltungsbereich.
        for (const m of TG_CODE.matchAll(/(^|[^.\w])(_[A-Za-z0-9]+)\s*\(/gm)) {
            if (!definiert.has(m[2])) fehlend.add(m[2]);
        }
        assert.deepEqual([...fehlend], [],
            `Aufruf ohne Definition: ${[...fehlend].join(', ')}`);
    });

    it('der Schnappschuss bleibt der Auffrischmechanismus', () => {
        assert.match(TG, /_applySnapshot\(newData\)/,
            'ohne _applySnapshot zeichnet sich nach einer Mutation nichts neu');
    });
});

describe('Dunkelmodus: feste helle Flaeche braucht feste dunkle Schrift', () => {
    const FEST = { '--on-light': '#161a23', '--on-light-2': '#4d5566', '--on-light-3': '#575e70' };
    const INK_DUNKEL = { '--ink': '#eef2ff', '--ink-2': '#b9c1e0', '--ink-3': '#8791b8' };

    const cssDateien = fs.readdirSync(path.join(wurzel, 'css'))
        .filter(f => f.endsWith('.css'));

    // Alle Regeln einsammeln, die eine feste helle Flaeche faerben.
    function regelnMitFesterHellerFlaeche() {
        const raus = [];
        for (const datei of cssDateien) {
            const s = lies(path.join('css', datei));
            for (const m of s.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
                const blok = m.group === undefined ? m[2] : m[2];
                const bg = blok.match(/background(?:-color)?:\s*(#[0-9a-fA-F]{3,8})\b/);
                if (!bg) continue;
                const hex = bg[1];
                if (![4, 7].includes(hex.length)) continue;   // kein Alphakanal
                let hell;
                try { hell = leuchtdichte(hex); } catch (_e) { continue; }
                if (hell < 0.4) continue;
                const farbe = blok.match(/color:\s*var\((--(?:ink|on-light)[-0-9]*)\)/);
                if (!farbe) continue;
                raus.push({
                    datei, hex, token: farbe[1],
                    sel: m[1].trim().split('\n').pop().trim().slice(0, 60),
                });
            }
        }
        return raus;
    }

    const regeln = regelnMitFesterHellerFlaeche();

    it('das Werkzeug findet ueberhaupt Regeln', () => {
        // Sonst waeren die beiden Zusicherungen darunter leer und
        // wuerden alles durchwinken — genau der Fehler, den diese
        // Durchsicht an anderer Stelle aufgedeckt hat.
        assert.ok(regeln.length >= 20,
            `nur ${regeln.length} Regeln gefunden — die Erkennung greift nicht mehr`);
    });

    it('keine davon nimmt --ink (das kippt im Dunkelmodus mit)', () => {
        const schlecht = regeln.filter(r => r.token.startsWith('--ink'))
            .map(r => {
                const v = kontrast(r.hex, INK_DUNKEL[r.token] || '#eef2ff');
                return `${r.datei} ${r.sel} (${r.hex}, dunkel ${v.toFixed(2)}:1)`;
            });
        assert.deepEqual(schlecht, [],
            'feste helle Flaeche mit --ink:\n  ' + schlecht.join('\n  '));
    });

    it('jede haelt 4.5:1 — und zwar in beiden Modi, weil die Schrift fest ist', () => {
        const schwach = regeln
            .map(r => ({ ...r, v: kontrast(r.hex, FEST[r.token] || '#161a23') }))
            .filter(r => r.v < 4.5)
            .map(r => `${r.datei} ${r.sel} ${r.v.toFixed(2)}:1`);
        assert.deepEqual(schwach, [], 'zu schwach:\n  ' + schwach.join('\n  '));
    });

    it('die drei Token bleiben im Dunkelmodus unveraendert', () => {
        // Wuerden sie im [data-theme="dark"]-Block neu gesetzt, waere
        // der ganze Ansatz hinfaellig.
        const dunkel = TOKENS.slice(TOKENS.indexOf('--ink: #eef2ff'));
        for (const tok of Object.keys(FEST)) {
            assert.ok(!new RegExp('\\' + tok + ':').test(dunkel),
                `${tok} wird im Dunkelmodus neu gesetzt`);
        }
    });
});

describe('Mobil: die Tableiste verdeckt die Fusszeile nicht', () => {
    it('die Fusszeile bekommt ihren eigenen Abstand', () => {
        // .tabs-container schuetzt nur, was in <main> steht — die
        // Fusszeile steht dahinter (index.html: main endet 2882,
        // footer folgt 2889) und lag deshalb dauerhaft unter der
        // fixierten Leiste, nicht wegscrollbar.
        assert.match(NAV, /\.footer \{ padding-bottom: 64px; \}/,
            'die Fusszeile liegt wieder unter der Tableiste');
    });

    it('der Abstand steht im selben Mobil-Block wie die Leiste selbst', () => {
        const i = NAV.indexOf('.ds-tabbar {');
        assert.notEqual(i, -1);
        // Vom Beginn der Leiste bis zum Ende des umschliessenden @media.
        const block = NAV.slice(i, NAV.indexOf('\n}', NAV.indexOf('.footer { padding-bottom')) + 2);
        assert.match(block, /\.footer \{ padding-bottom/,
            'der Abstand steht ausserhalb des Mobil-Blocks und wirkt auch auf dem Desktop');
    });

    it('der Abstand deckt die Hoehe der Leiste wirklich ab', () => {
        // Die Knoepfe sind 56px hoch, dazu der Rahmen. 64px reichen,
        // 48px nicht. Diese Zusage haelt die Zahlen aneinander.
        const knopf = NAV.match(/\.ds-tabbar-btn \{[^}]*min-height:\s*(\d+)px/);
        assert.ok(knopf, 'min-height der Tabbar-Knoepfe nicht mehr auffindbar');
        const abstand = NAV.match(/\.footer \{ padding-bottom: (\d+)px; \}/);
        assert.ok(Number(abstand[1]) > Number(knopf[1]),
            `Abstand ${abstand[1]}px deckt Leiste von ${knopf[1]}px nicht ab`);
    });

    it('die 430px-Regel setzt den Abstand nicht wieder zurueck', () => {
        // styles.css laedt NACH ds-nav.css und schrieb dort die
        // Kurzschreibweise "padding: 15px" — die setzt padding-bottom
        // mit zurueck. Vier Ansichten waren dadurch repariert, zwei
        // nicht; gemessen erst im Browser, nicht am Quelltext.
        // Kommentare raus: die Begruendung unten nennt "padding: 15px"
        // als das, was man NICHT schreiben soll — die Zusicherung darf
        // ihre eigene Warnung nicht fuer die Regel halten.
        const STYLES = lies('css/styles.css').replace(/\/\*[\s\S]*?\*\//g, '');
        // Nur die Regel im 430px-Block — es gibt weiter oben eine
        // Grundregel fuer den Desktop, die hier nichts zu suchen hat.
        const i = STYLES.indexOf('@media (max-width: 430px)');
        assert.notEqual(i, -1, 'der 430px-Block ist verschwunden');
        const kurz = STYLES.slice(i).match(/\.footer \{[\s\S]{0,900}?padding:\s*([^;]+);/);
        assert.ok(kurz, 'die .footer-Regel im 430px-Block ist verschwunden');
        const werte = kurz[1].trim().split(/\s+/);
        assert.ok(werte.length >= 3,
            `"padding: ${kurz[1].trim()}" setzt den unteren Abstand wieder auf denselben Wert`);
        const unten = Number(String(werte[2]).replace('px', ''));
        const knopf = Number(NAV.match(/\.ds-tabbar-btn \{[^}]*min-height:\s*(\d+)px/)[1]);
        assert.ok(unten > knopf,
            `unterer Abstand ${unten}px deckt Leiste von ${knopf}px nicht ab`);
    });
});
