/**
 * Der waagerechte Seitenrand kommt aus EINER Zahl.
 *
 * BEFUND (22.08.2026, an der laufenden Anwendung gemessen): über den
 * Rand der ganzen Seite entschied ein Zufall aus Dateireihenfolge und
 * !important. Um `body` bewarben sich acht Regeln aus zwei Dateien und
 * sechs Breakpoints, um `.tab-content` ebenfalls acht.
 *
 * Gewonnen hat auf dem Telefon:
 *     @media (max-width: 430px) body { padding: 3px !important }
 * und für .tab-content die 768er-Regel mit !important — weshalb die
 * eigens für 390 px geschriebene Regel (10 px) nie gefeuert hat. Zwei
 * Regeln waren tot, ohne dass es jemand sehen konnte.
 *
 * Nutzbare Inhaltsbreite vorher/nachher, gemessen:
 *     390 px:    358 → 388 px
 *     1440 px:  1366 → 1438 px   (Kartengitter 9 → 10 Kacheln je Reihe)
 *
 * Und es wurde nichts enger: die beiden Überläufe, die es bei 320 px
 * schon vorher gab, sind kleiner geworden (Meta Call +53 → +38 px,
 * City League +23 → +8 px), der bei 360 px ist ganz verschwunden.
 * Waagerechter Seitenlauf: nirgends, von 320 bis 1920 px.
 *
 * Dieser Test hält die eine Quelle fest. Er prüft NICHT den Wert —
 * der darf sich ändern, das ist ja der Sinn eines Tokens.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const CSS_DIR = path.join(ROOT, 'css');
const DATEIEN = fs.readdirSync(CSS_DIR).filter(f => f.endsWith('.css')).sort();

const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

function lies(datei) {
    return ohneKommentare(fs.readFileSync(path.join(CSS_DIR, datei), 'utf8'));
}

/** Alle Regelblöcke, deren Selektorliste genau dieses Ziel enthält. */
function bloeckeFuer(text, ziel) {
    const treffer = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        const selektoren = m[1].split(',').map(s => s.trim()).filter(Boolean);
        // Nur der nackte Selektor zählt: `.tab-content h2` ist eine
        // andere Regel und darf eigenes Padding haben.
        if (selektoren.some(s => s === ziel || s.endsWith(' ' + ziel))) {
            treffer.push({ selektor: m[1].trim(), koerper: m[2] });
        }
    }
    return treffer;
}

/** Der waagerechte Anteil einer padding-Deklaration, oder null. */
function waagerecht(koerper) {
    const raus = [];
    const re = /(^|;)\s*padding(-left|-right|-inline[a-z-]*)?\s*:\s*([^;]+)/gi;
    let m;
    while ((m = re.exec(koerper)) !== null) {
        const eigenschaft = 'padding' + (m[2] || '');
        const wert = m[3].trim();
        if (eigenschaft === 'padding') {
            const teile = wert.replace(/!important/, '').trim().split(/\s+/);
            // 1 Wert = alle Seiten, 2 = senkrecht/waagerecht,
            // 3 = oben/waagerecht/unten, 4 = oben/rechts/unten/links
            const w = teile.length === 1 ? teile[0]
                    : teile.length === 2 ? teile[1]
                    : teile.length === 3 ? teile[1]
                    : teile[1] + ' ' + teile[3];
            raus.push({ eigenschaft, wert: w, roh: wert });
        } else {
            raus.push({ eigenschaft, wert: wert.replace(/!important/, '').trim(), roh: wert });
        }
    }
    return raus;
}

// Zwei Token sind erlaubt, und der Unterschied ist der Punkt:
//
//   --page-gutter   Rand der SEITE. Steht auf 0, damit Flaechen und
//                   Trennlinien bis an die Bildschirmkante laufen.
//   --mobil-einzug  Abstand des TEXTES zur Kante auf dem Telefon.
//
// Vier Anlaeufe sind daran gescheitert, dass beides in einer Zahl steckte:
// setzt man sie auf 0, klebt der Text an der Kante; setzt man sie auf 12,
// verlieren die Flaechen ihre volle Breite. Getrennt geht beides.
//
// Was weiterhin verboten bleibt, ist eine feste Zahl: dann entscheidet
// wieder die Dateireihenfolge, und genau das war der Ausgangszustand.
const ERLAUBT = /^(0|0px|var\(--page-gutter\)|var\(--page-gutter\) var\(--page-gutter\)|var\(--mobil-einzug\))$/;

describe('der Seitenrand hat eine Quelle', () => {
    it('--page-gutter steht in tokens.css', () => {
        const tokens = lies('tokens.css');
        assert.match(tokens, /--page-gutter\s*:\s*\d/,
            '--page-gutter fehlt — dann entscheidet wieder die Dateireihenfolge');
    });

    for (const ziel of ['body', '.tab-content']) {
        it(`${ziel} setzt waagerechtes Padding nur über den Token`, () => {
            const verstoesse = [];
            for (const datei of DATEIEN) {
                for (const block of bloeckeFuer(lies(datei), ziel)) {
                    for (const d of waagerecht(block.koerper)) {
                        if (!ERLAUBT.test(d.wert)) {
                            verstoesse.push(`${datei}  ${block.selektor}  ${d.eigenschaft}: ${d.roh}`);
                        }
                    }
                }
            }
            assert.deepEqual(verstoesse, [],
                `waagerechtes Padding an ${ziel} ausserhalb des Tokens:\n  `
                + verstoesse.join('\n  '));
        });
    }

    it('keine dieser Regeln braucht !important', () => {
        const mit = [];
        for (const datei of DATEIEN) {
            for (const ziel of ['body', '.tab-content']) {
                for (const block of bloeckeFuer(lies(datei), ziel)) {
                    for (const d of waagerecht(block.koerper)) {
                        if (/!important/.test(d.roh)) mit.push(`${datei}  ${block.selektor}`);
                    }
                }
            }
        }
        assert.deepEqual(mit, [],
            '!important am Seitenrand heisst: es gibt wieder mehr als eine '
            + 'Quelle, und die Reihenfolge entscheidet.\n  ' + mit.join('\n  '));
    });

    it('der Token wird auch wirklich benutzt', () => {
        // Gegenprobe: ein Token, den niemand liest, ist Dekoration.
        let n = 0;
        for (const datei of DATEIEN) {
            n += (lies(datei).match(/var\(--page-gutter\)/g) || []).length;
        }
        assert.ok(n >= 8,
            `nur ${n} Verwendungen von --page-gutter — vorher gab es acht `
            + `body- und acht .tab-content-Regeln, die alle darauf zeigen sollten`);
    });
});
