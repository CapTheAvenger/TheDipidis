/**
 * "Feld-Abdeckung: 100 %" — eine Zahl, die nur wegen ihrer Deckelung
 * dastand.
 *
 * In renderMatchupsVsMetaCall() (Reiter Aktuelles Meta, Tafel "Matchups
 * vs Meta Call") stand im Nenner der Anteil der Top 12 des
 * vorhergesagten Feldes, im Zaehler aber der Anteil ALLER gepaarten
 * Gegner — auch derer auf Rang 13 und tiefer. Der Quotient lief
 * regelmaessig ueber 1 und wurde mit Math.min(100, …) gedeckelt. Auf dem
 * Schirm stand dann "Feld-Abdeckung: 100 %" neben einer Gegnerzahl, ohne
 * dass irgendwo ein Nenner sichtbar war — es las sich wie "das ganze
 * Feld ist erfasst".
 *
 * Geprueft wird das Verhalten, nicht der Quelltext: die Funktion wird
 * herausgeschnitten, mit einem gebauten Feld ausgefuehrt und die
 * gerenderte Zeile gelesen.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function schneideFunktion(quelle, name) {
    const treffer = new RegExp(`function\\s+${name}\\s*\\(`).exec(quelle);
    assert.ok(treffer, `Funktion nicht gefunden: ${name}`);
    const auf = quelle.indexOf('{', treffer.index);
    let tiefe = 0;
    for (let i = auf; i < quelle.length; i++) {
        if (quelle[i] === '{') tiefe++;
        else if (quelle[i] === '}') {
            tiefe--;
            if (tiefe === 0) return quelle.slice(treffer.index, i + 1);
        }
    }
    throw new Error(`Klammer nicht geschlossen: ${name}`);
}

/**
 * @param feld  [{name, finalShare}] — das vorhergesagte Feld, absteigend
 * @param wrs   {gegnername: winrate} — was die Matchup-CSV hergibt
 */
function rendere(feld, wrs, eigen = 'Testdeck') {
    const quelle = lies('js/app-current-meta-analysis.js');
    const koerper = schneideFunktion(quelle, 'renderMatchupsVsMetaCall');

    const knoten = () => ({
        innerHTML: '', classList: { add() {}, remove() {}, contains: () => false }
    });
    const section = knoten(), summary = knoten(), body = knoten();
    const elemente = {
        currentMetaVsMetaCallSection: section,
        currentMetaVsMetaCallSummary: summary,
        currentMetaVsMetaCallBody: body
    };

    const sandbox = {
        window: {
            MetaCall: { getPredictedField: () => feld },
            currentMetaMatchupData: Object.keys(wrs).map(o => ({
                deck_name: eigen, opponent: o, win_rate: String(wrs[o]).replace('.', ',')
            }))
        },
        document: { getElementById: (id) => elemente[id] || null },
        console: { log() {}, warn() {}, error() {}, info() {} }
    };

    const vorspann = `
        const devLog = () => {};
        const stripExSuffix = (s) => String(s || '').replace(/\\s+ex$/i, '');
        const parseLocaleNumber = (v, d) => {
            const n = parseFloat(String(v == null ? '' : v).replace(',', '.'));
            return Number.isFinite(n) ? n : d;
        };
        const wrColorClass = () => 'x';
        const getLang = () => 'de';
        const escapeHtml = (s) => String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        const t = (k) => ({
            'matchup.fieldCoverage':    'Feld-Abdeckung:',
            'matchup.fieldCoverageOf':  'der Top {n}',
            'matchup.fieldCoverageTip': 'Anteil der Top {n}',
            'matchup.opponents':        'Gegner mit Daten',
            'matchup.weightedWrLabel':  'WR',
            'heatmap.noData':           'keine Daten'
        }[k] || k);
    `;

    // eslint-disable-next-line no-new-func
    new Function('window', 'document', 'console',
        vorspann + koerper + `\nrenderMatchupsVsMetaCall(${JSON.stringify(eigen)});`
    )(sandbox.window, sandbox.document, sandbox.console);

    return summary.innerHTML;
}

/** "Feld-Abdeckung: 83 % der Top 12 (10/12) · 15 Gegner mit Daten" */
function leseAbdeckung(html) {
    const m = /Feld-Abdeckung:\s*(\d+)%\s*der Top (\d+)\s*\((\d+)\/(\d+)\)\s*·\s*(\d+)/.exec(html);
    assert.ok(m, `Abdeckungszeile nicht lesbar:\n${html}`);
    return {
        prozent: Number(m[1]), topN: Number(m[2]),
        getroffen: Number(m[3]), gesamt: Number(m[4]), gegner: Number(m[5])
    };
}

/** 12 Referenzdecks plus `extra` weitere dahinter. */
function bauFeld(anzahlTop, extra) {
    const feld = [];
    for (let i = 1; i <= anzahlTop; i++) feld.push({ name: `Top${i}`, finalShare: 5 });
    for (let i = 1; i <= extra; i++) feld.push({ name: `Rand${i}`, finalShare: 4 });
    return feld;
}

describe('Feld-Abdeckung nennt einen Nenner und rechnet gegen ihn', () => {

    it('100 % heisst: alle Top-12-Decks abgedeckt', () => {
        const feld = bauFeld(12, 0);
        const wrs = {};
        feld.forEach(d => { wrs[d.name] = 50; });
        const a = leseAbdeckung(rendere(feld, wrs));
        assert.equal(a.prozent, 100);
        assert.equal(a.getroffen, 12);
        assert.equal(a.gesamt, 12);
    });

    it('Decks unterhalb der Referenz heben die Prozentzahl NICHT an', () => {
        // Sechs der zwoelf Referenzdecks haben Daten (30 von 60 Anteil
        // = 50 %), dazu zehn Randdecks mit zusammen 40 Anteil. Die alte
        // Rechnung kam auf (30+40)/60 = 117 % und zeigte gedeckelt 100 %.
        const feld = bauFeld(12, 10);
        const wrs = {};
        feld.slice(0, 6).forEach(d => { wrs[d.name] = 50; });
        feld.slice(12).forEach(d => { wrs[d.name] = 50; });
        const a = leseAbdeckung(rendere(feld, wrs));
        assert.equal(a.prozent, 50, 'Randdecks duerfen nicht in den Zaehler');
        assert.equal(a.getroffen, 6);
        assert.equal(a.gesamt, 12);
        assert.equal(a.gegner, 16, 'die Gegnerzahl zaehlt weiterhin alle mit Daten');
    });

    it('kann nie ueber 100 % laufen — und braucht dafuer keine Deckelung', () => {
        const quelle = lies('js/app-current-meta-analysis.js');
        const koerper = schneideFunktion(quelle, 'renderMatchupsVsMetaCall');
        assert.doesNotMatch(koerper, /Math\.min\(100,\s*\(matched/,
            'die alte Deckelung steht noch da');
        // Und der Beweis am Verhalten: viel Rand, wenig Referenz.
        const feld = bauFeld(12, 30);
        const wrs = {};
        feld.slice(0, 3).forEach(d => { wrs[d.name] = 50; });
        feld.slice(12).forEach(d => { wrs[d.name] = 50; });
        const a = leseAbdeckung(rendere(feld, wrs));
        assert.equal(a.prozent, 25);
    });

    it('sagt beim Ueberfahren, was Zaehler und Nenner sind', () => {
        const feld = bauFeld(12, 2);
        const wrs = {};
        feld.slice(0, 12).forEach(d => { wrs[d.name] = 50; });
        const html = rendere(feld, wrs);
        assert.match(html, /title="[^"]*Anteil der Top 12/,
            'ohne Tooltip bleibt der Nenner eine Behauptung');
    });
});
