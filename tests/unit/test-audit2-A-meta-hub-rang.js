/**
 * Audit 2, Gruppe A — Beschriftungswahrheit im Meta-Hub-Antwortblock.
 *
 * F04: "Meistgespielt · Rang 1" stand am Rang-2-Deck. Der Rang war ein
 * laufender Zähler über die angezeigten Nicht-Best-Kacheln — sobald das
 * erfolgreichste Deck zugleich das anteilsstärkste ist und als Headline aus
 * der Zählung fällt, bekam das zweitgrößte Deck fälschlich "Rang 1".
 * Gemessen 21.08.2026 aus online_tournament_top8_decks.csv: Dragapult
 * (Feldanteil 9,0%) ist Headline UND Feldrang 1, Mega Excadrill (7,84%) ist
 * Feldrang 2, Festival Lead (7,33%) Feldrang 3.
 *
 * F05: Auf der Best-Kachel ("Erfolgreichstes Deck") ist die grosse Zahl der
 * Feldanteil, nicht die Erfolgsgröße. Sie muss ausdrücklich als "Feldanteil"
 * beschriftet sein, sonst liest ein Anfänger die 9,0% als Erfolgsquote.
 *
 * Beide Male wird die echte answerModel/answerHtml aus der Quelle
 * ausgeschnitten und mit Attrappen ausgeführt — kein Regex auf den Quelltext.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'meta-analysis-hub.js'), 'utf8');

// Funktionen wörtlich aus der Quelle schneiden (von Kopf bis zum Kopf der
// nächsten Funktion) und zu einem ausführbaren Modul zusammensetzen.
function cut(from, to) {
    const a = SRC.indexOf(from);
    const b = SRC.indexOf(to);
    assert.ok(a > -1 && b > a, `Schnitt fehlgeschlagen: ${from}`);
    return SRC.slice(a, b);
}

// Mit '\n' verbinden: manche Schnitte enden auf einer //-Kommentarzeile
// ohne Zeilenumbruch, die sonst den nächsten Teil auskommentiert.
const body = [
    cut('function fmtPct(v, digits)', 'function fmtSigned(v, digits)'),
    cut('function fmtSigned(v, digits)', 'function isDe()'),
    cut('function isDe()', '\n    async function loadAnswerRows'),
    cut('function answerModel(rows)', 'function answerSentence(model)'),
    cut('function answerSentence(model)', 'function answerHtml(model)'),
    cut('function answerHtml(model)', '\n    const ANSWER_HOSTS'),
    cut('function escapeHtml(s)', 'function ensureSubNavHost'),
    'return { answerModel: answerModel, answerHtml: answerHtml };',
].join('\n');


/* Das ECHTE Tor aus app-utils.js, nicht eine Attrappe. Es entscheidet,
   ob die Anzeige die gezaehlten oder die gewichteten Spalten nimmt —
   mit einer Attrappe liefe der Test genau am Verzweigungspunkt vorbei.
   Dieselbe Technik wie bei parseLocaleNumber daneben. */
function echtesTor(pLN) {
    const stueck = fs.readFileSync(path.join(ROOT, 'js', 'app-utils.js'), 'utf8').match(/function gezaehlteZeilen\(rows\) \{[\s\S]*?\n\}/)[0];
    return new Function('parseLocaleNumber', stueck + '\nreturn gezaehlteZeilen;')(pLN);
}

function build(lang) {
    const pLN = (v, d) => {
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : (d || 0);
    };
    const stubWindow = {
        CONV_PRIOR: 50,
        parseLocaleNumber: pLN,
        gezaehlteZeilen: echtesTor(pLN),
        // Nachgebautes conv-Objekt: Dragapult klar bester Performer über der
        // Mindeststichprobe, damit es Headline wird.
        computeConversionPerformance: () => ({
            expected: 0.062,
            decks: [
                { name: 'Dragapult', perfPct: 59.2, thin: false, brought: 772, top8: 78 },
                { name: 'Mega Excadrill', perfPct: 10.0, thin: false, brought: 700, top8: 60 },
                { name: 'Festival Lead', perfPct: 5.0, thin: false, brought: 650, top8: 50 },
            ],
        }),
        getLang: () => lang,
    };
    return new Function('window', body)(stubWindow);
}

// Anteilsreihenfolge: Dragapult > Mega Excadrill > Festival Lead.
const ROWS = [
    { deck_name: 'Dragapult', total_brought_weighted: '772', top8_conv_rate: '0.101' },
    { deck_name: 'Mega Excadrill', total_brought_weighted: '700', top8_conv_rate: '0.078' },
    { deck_name: 'Festival Lead', total_brought_weighted: '650', top8_conv_rate: '0.073' },
];

function tiles(html) {
    // Kacheln am ds-stat-Container-Start auftrennen.
    return html.split('<div class="ds-stat').slice(1).map(s => '<div class="ds-stat' + s.split('</div>')[0]) ;
}
function tileMit(html, name) {
    const segs = html.split('<div class="ds-stat').slice(1);
    const hit = segs.find(s => s.includes(name));
    assert.ok(hit, `keine Kachel für ${name}`);
    return hit;
}

describe('F04 — der angezeigte Rang ist die echte Anteils-Position', () => {
    it('das zweitgrößte Deck trägt "Rang 2", nicht "Rang 1"', () => {
        const { answerModel, answerHtml } = build('de');
        const model = answerModel(ROWS);
        assert.ok(model, 'answerModel gab null zurück');
        const html = answerHtml(model);

        // Der Headline-Deck (Dragapult) ist Feldrang 1 und fällt aus der
        // Meistgespielt-Reihe — also darf "Rang 1" NIRGENDS am Deck stehen.
        assert.ok(!/Rang 1\b/.test(html),
            'ein Deck trägt fälschlich "Rang 1", obwohl der Feldrang-1-Deck die Headline ist');

        // Mega Excadrill ist Feldrang 2 und muss genau das anzeigen.
        const exc = tileMit(html, 'Mega Excadrill');
        assert.match(exc, /Rang 2\b/, 'Mega Excadrill (Feldrang 2) trägt nicht "Rang 2"');
        assert.ok(!/Rang 1\b/.test(exc));

        // Festival Lead ist Feldrang 3.
        const fes = tileMit(html, 'Festival Lead');
        assert.match(fes, /Rang 3\b/, 'Festival Lead (Feldrang 3) trägt nicht "Rang 3"');
    });
});

describe('F05 — die Best-Kachel weist ihre grosse Zahl als Meta-Anteil aus', () => {
    it('die Best-Kachel nennt "Meta-Anteil", die anderen "des Metas"', () => {
        const { answerModel, answerHtml } = build('de');
        const model = answerModel(ROWS);
        const html = answerHtml(model);

        const best = tileMit(html, 'Dragapult');
        assert.match(best, /Erfolgreichstes Deck/, 'Dragapult ist nicht die Best-Kachel');
        assert.match(best, /Meta-Anteil/,
            'die grosse Zahl der Best-Kachel ist nicht als "Meta-Anteil" beschriftet');

        // Die Meistgespielt-Kacheln behalten die knappe Beschriftung.
        const exc = tileMit(html, 'Mega Excadrill');
        assert.match(exc, /des Metas/);
    });

    it('englisch: die Best-Kachel nennt "field share"', () => {
        const { answerModel, answerHtml } = build('en');
        const model = answerModel(ROWS);
        const html = answerHtml(model);
        const best = tileMit(html, 'Dragapult');
        assert.match(best, /Most successful deck/);
        assert.match(best, /field share/);
    });
});
