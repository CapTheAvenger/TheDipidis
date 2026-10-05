'use strict';
/**
 * FE-15 / FE-16 (28.09.2026) — EINE Feldprognose, EINE Tabelle.
 *
 * Befund (claude/metacall-analyse-2026-09-28.md): auf dem Reiter Meta
 * Call standen zwei Modelle nebeneinander (Dragapult 13,3 % im Block
 * oben aus data/meta_prognose.json, 18,72 % in der Feldtabelle aus dem
 * Praediktor), und die Day-2-Chance je Deck stand erst ganz unten.
 *
 * Geprueft wird VERHALTEN: die Funktionen werden aus der Quelle
 * geschnitten und ausgefuehrt (lib-dom-sandkasten.baue), keine
 * Quelltextsuche. Kein Dateizugriff — die Eingaben stehen hier.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { baue } = require('./lib-dom-sandkasten.js');

const MC = 'js/app-meta-call.js';
/** Gleichheit auf sechs Stellen — Summen aus Gleitkommazahlen. */
const gleich = (a, b, text) => assert.equal(Math.round(a * 1e6), Math.round(b * 1e6), text);
const normalize = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/* Eine Prognosedatei im Format von scripts/build_meta_prognose.py. */
function datei(fenster) {
    return {
        _meta: { fenster: fenster || 'TEF-30C', vorlauf_tage: 14, online_listen: 1000,
                 online_von: '2026-09-13', online_bis: '2026-09-27' },
        modell: { anker: 7, mae_mittel: 0.48 },
        prognose: [
            { archetyp_name: 'Alpha', online_anteil: 30, online_listen: 300, prognose: 40, prognose_von: 38, prognose_bis: 42 },
            { archetyp_name: 'Beta',  online_anteil: 30, online_listen: 300, prognose: 30, prognose_von: 29, prognose_bis: 31 },
            { archetyp_name: 'Gamma', online_anteil: 25, online_listen: 250, prognose: 20, prognose_von: 19, prognose_bis: 21 },
        ],
    };
}

function liste() {
    return [
        { name: 'Alpha', predictedShare: 50, onlineShare: 50, ladderShare: 31 },
        { name: 'Beta',  predictedShare: 20, onlineShare: 20, ladderShare: 29 },
        { name: 'Gamma', predictedShare: 20, onlineShare: 20, ladderShare: 24 },
        { name: 'Delta', predictedShare:  6, onlineShare:  6, ladderShare:  3 },  // ohne Zeile
        { name: 'Eps',   predictedShare:  4, onlineShare:  4, ladderShare:  0 },  // ohne Zeile, online 0
    ];
}

function prognoseUmfeld(o) {
    const ctx = baue(MC, [
        'function _prognoseDateiLesen(j)',
        'function _prognoseDateiAnwenden()',
    ], {
        normalize,
        _metaSource: o.quelle || 'current',
        _formatWindow: { current_set: o.set || '30C' },
        _shareList: o.liste || liste(),
        _prognoseDatei: null,
        _prognoseAktiv: false,
        _prognoseRest: 0,
        PROGNOSE_DATEI: 'prognose.json',
        console: { info() {} },
    });
    ctx._prognoseDatei = ctx._prognoseDateiLesen(o.datei || datei());
    ctx._prognoseDateiAnwenden();
    return ctx;
}

describe('FE-15 — die Feldanteile kommen aus der Prognosedatei', () => {
    it('Decks mit Zeile tragen die Prognose der Datei, der Praediktorwert bleibt nachlesbar', () => {
        const c = prognoseUmfeld({});
        const a = c._shareList.find(d => d.name === 'Alpha');
        assert.equal(c._prognoseAktiv, true);
        assert.equal(a.predictedShare, 40);
        assert.equal(a.onlineShare, 40, 'buildField liest onlineShare — es muss die Prognose tragen');
        assert.equal(a.predictorShare, 50);
        assert.equal(a.prognoseZeile.prognose_bis, 42);
    });

    it('Decks ohne Zeile behalten ihren gemessenen Anteil, der Rest geht an „Sonstige"', () => {
        const c = prognoseUmfeld({});
        const d = c._shareList.find(x => x.name === 'Delta');
        const e = c._shareList.find(x => x.name === 'Eps');
        assert.equal(d.predictedShare, 3, 'ein Deck ohne Zeile bekommt mehr als seinen Online-Anteil');
        assert.equal(e.predictedShare, 0);
        const summe = c._shareList.reduce((s, x) => s + x.onlineShare, 0) + c._prognoseRest;
        gleich(summe, 100, 'Feld plus Rest ergeben ' + summe + ' statt 100');
        gleich(c._prognoseRest, 7, 'Rest ' + c._prognoseRest + ' statt 7');
    });

    it('reicht der Rest nicht, werden die Decks ohne Zeile auf ihn gekuerzt', () => {
        const l = liste();
        l.find(x => x.name === 'Delta').ladderShare = 15;
        l.find(x => x.name === 'Eps').ladderShare = 5;
        const c = prognoseUmfeld({ liste: l });
        const ohne = c._shareList.filter(x => x.name === 'Delta' || x.name === 'Eps')
            .reduce((s, x) => s + x.predictedShare, 0);
        gleich(ohne, 10, 'Decks ohne Zeile tragen ' + ohne + ' statt der freien 10');
        assert.equal(c._prognoseRest, 0);
    });

    it('eine Datei fuer ein anderes Format wird nicht angewandt', () => {
        const c = prognoseUmfeld({ datei: datei('TEF-PBL') });
        assert.equal(c._prognoseAktiv, false);
        assert.equal(c._shareList.find(d => d.name === 'Alpha').predictedShare, 50);
    });

    it('im vergangenen Meta bleibt der Praediktor zustaendig', () => {
        const c = prognoseUmfeld({ quelle: 'past' });
        assert.equal(c._prognoseAktiv, false);
        assert.equal(c._shareList.find(d => d.name === 'Alpha').predictedShare, 50);
    });
});

describe('FE-15 — „Sonstige" traegt den Eimer der Datei, das Feld summiert auf 100', () => {
    function feld(prognoseAktiv, rest) {
        const shareList = [
            { name: 'A', onlineShare: 40, ladderShare: 30 },
            { name: 'B', onlineShare: 30, ladderShare: 30 },
            { name: 'C', onlineShare: 20, ladderShare: 25 },
            { name: 'D', onlineShare:  3, ladderShare:  3 },
        ];
        const ctx = baue(MC, [
            'function _feldSortiert()',
            'function _feldTeilung(sortiert)',
            'function buildField()',
        ], {
            window: {}, normalize, TOP_N: 2,
            _shareList: shareList, _personalShares: {}, _customDecks: [],
            _feldAuswahl: null, _feldBilanz: null,
            _prognoseAktiv: prognoseAktiv, _prognoseRest: rest,
            _settings: { totalPlayers: 1000, junkPct: 0, rounds: 8 },
        });
        return ctx.buildField();
    }

    it('mit Prognosedatei stehen A und B auf ihrer Dateizahl, der Eimer liegt in „Sonstige"', () => {
        const f = feld(true, 7);
        const an = (n) => f.find(d => d.name === n).finalShare;
        gleich(an('A'), 40, 'A ' + an('A'));
        gleich(an('_junk'), 30, 'Sonstige ' + an('_junk') + ' statt 20 + 3 + 7');
        const summe = f.reduce((s, d) => s + d.finalShare, 0);
        gleich(summe, 100, 'Feld summiert auf ' + summe);
    });
});

describe('FE-16 — die Meta-Call-Tabelle rechnet jede Zeile', () => {
    function tabelle(opt) {
        const o = opt || {};
        const aufrufe = [];
        const field = [
            { name: 'Alpha', onlineShare: 40, finalShare: 40, count: 400 },
            { name: 'Beta',  onlineShare: 30, finalShare: 30, count: 300 },
            { name: '_junk', onlineShare: 30, finalShare: 30, count: 300 },
        ];
        const day2 = { Alpha: 0.15, Beta: 0.25, Gamma: 0.31 };
        const ctx = baue(MC, [
            'function _mctWrKopf(L)',
            'function _mctQuotenName(id)',
            'function _mctOnline(name)',
            'function _paarungTeile(m)',   // DA-48: Aufschluesselung im Tooltip
            'function _mctZeileRechne(name, field, istMein)',
            'function _wrHandWert(deckName)',
            'function _mctZelleWr(z, L, deckName)',
            'function _mctZelleDay2(z)',
            'function _mctZelleBilanz(z, L)',
            'function _mctPrognoseZelle(prog, online)',
            'function _mctSternKnopf(name, L)',
            'function _mctZeileFeld(deck, field, L)',
            'function _mctZeileAussen(d, field, L)',
            'function _mctSortWert(eintrag, spalte)',
            'function _mctTbody(field, L)',
        ], {
            window: {}, normalize,
            _winRateOverrides: {}, WR_EINGABE_MAX: 96.04,
            _findByNormalized: (o, n) => { for (const k of Object.keys(o)) if (normalize(k) === normalize(n)) return o[k]; return undefined; },
            _settings: { rounds: 8, day2Points: 16, myDeck: o.mein || '' },
            _mctSortierung: o.sort || { spalte: 'prognose', ab: true },
            _feldAlle: !!o.alle, _feldSuche: '',
            _shareList: [
                { name: 'Alpha', ladderShare: 35, prognoseZeile: { online_anteil: 33, online_listen: 330, prognose_von: 38, prognose_bis: 42 } },
                { name: 'Beta',  ladderShare: 30, prognoseZeile: null },
                { name: 'Gamma', ladderShare: 1,  prognoseZeile: null, onlineShare: 1 },
            ],
            _feldSortiert: () => [{ name: 'Alpha', onlineShare: 40 }, { name: 'Beta', onlineShare: 30 }, { name: 'Gamma', onlineShare: 1 }],
            calcDay2: (f, name) => {
                aufrufe.push(name === undefined ? '(mein Deck)' : name);
                const p = day2[name === undefined ? o.mein : name];
                return { day2Prob: p, expWin: 8 * p, expTie: 1, expLoss: 8 - 8 * p - 1 };
            },
            getMatchup: () => ({ pWin: 0.4, pTie: 0.1, pLoss: 0.5, partien: 50 }),
            _anzeigeQuote: (m) => m.pWin / (m.pWin + m.pLoss) * 100,
            _renderDeckBadge: () => '',
            _isDetailExpanded: () => false,
            _avgEncTier: () => 'low',
            _mcIconHtml: () => '',
            _mcPct: (n, dp) => Number(n).toFixed(dp) + ' %',
            _mcNum: (n, dp) => Number(n).toFixed(dp),
            zahlLokal: (n) => String(n),
            esc: (s) => String(s),
            escJs: (s) => String(s),
            t: (k) => k,
        });
        const L = (d) => d;
        return { html: ctx._mctTbody(field, L), aufrufe };
    }
    const zeilen = (html) => html.split('<tr class="mc-mct-zeile').slice(1);

    it('jede Feldzeile traegt ihre eigene Day-2-Chance', () => {
        const { html } = tabelle();
        const z = zeilen(html);
        assert.equal(z.length, 3, 'Alpha, Beta und Sonstige erwartet');
        assert.match(z[0], /Alpha[\s\S]*15\.0 %/, 'Alpha zeigt nicht ihre Day-2-Chance');
        assert.match(z[1], /Beta[\s\S]*25\.0 %/, 'Beta zeigt nicht ihre Day-2-Chance');
    });

    it('die Sortierung nach Day-2 dreht die Reihenfolge, „Sonstige" bleibt unten', () => {
        const { html } = tabelle({ sort: { spalte: 'day2', ab: true } });
        const z = zeilen(html);
        assert.ok(z[0].includes('Beta') && z[1].includes('Alpha'), 'nicht nach Day-2 sortiert');
        assert.match(z[2], /mc-row-junk/, '„Sonstige" steht nicht am Ende');
    });

    it('das eigene Deck rechnet mit SEINER Kette, die anderen mit der Basis', () => {
        /* calcDay2(field) ohne zweites Argument nimmt die Paarungen mit
           eigenen Quoten und Journal — dieselbe Zahl wie die Ergebniskachel. */
        const { aufrufe } = tabelle({ mein: 'Beta' });
        assert.ok(aufrufe.includes('(mein Deck)'), 'das eigene Deck laeuft ueber die Basispaarungen');
        assert.ok(!aufrufe.includes('Beta'), 'das eigene Deck wird zusaetzlich mit der Basis gerechnet');
        assert.ok(aufrufe.includes('Alpha'));
    });

    it('mit gewaehltem Deck zeigt jede Zeile die Win-Rate dagegen, der Spiegel heisst Spiegel', () => {
        const { html } = tabelle({ mein: 'Beta' });
        const z = zeilen(html);
        const alpha = z.find(x => x.includes('Alpha'));
        const beta = z.find(x => x.includes('>Beta<'));
        /* seit FE-23 (01.10.2026) ein Eingabefeld mit derselben Zahl */
        /* DA-47 (05.10.2026): die Zelle zeigt S/(S+N) = 0,4/0,9 = 44,4 %,
           nicht mehr pWin 40 %. */
        assert.match(alpha, /class="[^"]*mc-mct-wr is-schlecht[^"]*"[^>]*value="44\.4"/, 'Alpha zeigt nicht S/(S+N) 44,4 %');
        assert.match(beta, /Spiegel/);
    });

    it('Decks ausserhalb des Feldes erscheinen erst auf Wunsch — und rechnen dann mit', () => {
        const zu = tabelle();
        assert.ok(!zu.html.includes('>Gamma<'), 'Gamma steht ungefragt in der Tabelle');
        const auf = tabelle({ alle: true });
        assert.ok(auf.html.includes('>Gamma<'), 'Gamma fehlt nach dem Aufklappen');
        assert.ok(auf.aufrufe.includes('Gamma'), 'Gamma bekommt keine Day-2-Chance');
    });
});
