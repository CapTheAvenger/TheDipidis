/**
 * PREDICTOR 5.3 ZOG ZWEI ZAHLEN VONEINANDER AB, DIE NICHT DIESELBE
 * GROESSE WAREN — ZUM ZWEITEN MAL.
 *
 * VORGESCHICHTE. Am 05.09.2026 wurde hier ein erster stiller
 * Groessenwechsel behoben: die Stelle zog die Matchpunktquote des
 * letzten Majors von einer Siegquote ab. Seitdem stand auf beiden
 * Seiten S/(S+N+U) — dieselbe FORMEL.
 *
 * BEFUND (07.09.2026). Dieselbe Formel ist noch keine Vergleichbarkeit.
 * S/(S+N+U) faellt, je oefter im Feld unentschieden gespielt wird, und
 * die beiden Felder unterscheiden sich darin um den Faktor neun
 * (online 1,29 %, Worlds San Francisco 11,05 % — beide Zahlen belegt in
 * tests/unit/test-praesenz-unentschieden-belegt.js). Nachgemessen ueber
 * die Decks, die beim letzten Major die 20-Spieler-Schwelle nehmen:
 *
 *     in S/(S+N+U):  Mittel −5,86 pp, 10 von 11 Decks negativ
 *     in S/(S+N)  :  Mittel −1,17 pp,  8 von 11 negativ
 *
 * Das einheitliche Vorzeichen war die Unentschieden-Quote, nicht der
 * Pilot. Fuer Mega Excadrill: −4,60 pp gegen −1,24 pp.
 *
 * WAS DIESE DATEI PRUEFT. Die echten Funktionen aus js/app-meta-call.js
 * werden aus der Quelle geschnitten und AUSGEFUEHRT — auf den echten
 * CSV-Zeilen und auf gesetzten Bilanzen. Keine Zusicherung behauptet
 * einen Wochenwert: geprueft werden Eigenschaften der Rechnung
 * (Konvention beider Seiten, Verhalten bei fehlender Bilanz,
 * Invarianz des Schubs unter der Praesenzumstellung) und Vergleiche
 * ZWEIER RECHENWEGE auf denselben Daten. Welche Decks diese Woche wo
 * stehen, ist ihnen egal.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WURZEL = path.join(__dirname, '..', '..');
const lies = (...p) => fs.readFileSync(path.join(WURZEL, ...p), 'utf8');
const MC = lies('js', 'app-meta-call.js');

/* Eine benannte Funktion woertlich aus der Quelle schneiden. Der Schnitt
   geschieht IM Test: verschwindet die Funktion, faellt der Test, statt
   still zu ueberspringen. */
function schneide(name) {
    const anfang = MC.indexOf('function ' + name + '(');
    assert.ok(anfang >= 0, `${name} steht nicht mehr in js/app-meta-call.js`);
    let tiefe = 0;
    for (let j = MC.indexOf('{', anfang); j < MC.length; j++) {
        if (MC[j] === '{') tiefe++;
        else if (MC[j] === '}') { tiefe--; if (tiefe === 0) return MC.slice(anfang, j + 1); }
    }
    throw new Error('kein Funktionsende: ' + name);
}

/* Der 5.3-Anwendungsteil aus getBaseMatchup — von der Kommentarmarke bis
   zum return. Er steht nicht in einer eigenen Funktion, also wird er
   hier in eine gewickelt. */
function schneideAnwendung() {
    const marke = '    const adjA = _deckWRAdjustment[a] || 0;';
    const anfang = MC.indexOf(marke);
    assert.ok(anfang >= 0, 'der Anwendungsteil von Predictor 5.3 ist verschwunden');
    const ende = MC.indexOf('return { pWin, pTie, pLoss, partien: base.partien || 0, schub };' /* DA-48: + schub */, anfang);
    assert.ok(ende > anfang, 'der Anwendungsteil hat kein return mehr');
    const stueck = MC.slice(anfang, MC.indexOf('\n', ende));
    return 'function anwenden(a, b, base, _deckWRAdjustment) {\n' + stueck + '\n}';
}

function ladeWerkzeug() {
    const win = { getLang: () => 'de' };
    new Function('window', lies('js', 'win-rate-konvention.js'))(win);
    new Function('window', lies('js', 'matchup-glaettung.js'))(win);
    const teile = ['_clip', '_labsGanz', '_labsDeckWr', '_labsDeckWrOhneU',
        '_labsDeckPartien', '_p53Delta', '_mitPraesenzUnentschieden']
        .map(schneide).join('\n');
    const F = new Function('window', teile + '\n' + schneideAnwendung()
        + '\nreturn { _clip, _labsGanz, _labsDeckWr, _labsDeckWrOhneU, _labsDeckPartien,'
        + ' _p53Delta, _mitPraesenzUnentschieden, anwenden };')(win);
    F.window = win;
    F.W = win.WinRateKonvention;
    return F;
}
const F = ladeWerkzeug();

// ── Daten ────────────────────────────────────────────────────────────
function csv(datei, trenner) {
    const text = lies(...datei.split('/')).replace(/\r/g, '').replace(/^﻿/, '');
    const teile = (z) => {
        const out = []; let cur = ''; let q = false;
        for (let i = 0; i < z.length; i++) {
            const c = z[i];
            if (c === '"') { q = !q; continue; }
            if (c === trenner && !q) { out.push(cur); cur = ''; continue; }
            cur += c;
        }
        out.push(cur); return out;
    };
    const raw = text.split('\n').filter((z) => z.trim() !== '');
    const kopf = teile(raw[0]).map((h) => h.trim().replace(/^﻿/, ''));
    return raw.slice(1).map((z) => {
        const v = teile(z); const o = {};
        kopf.forEach((h, i) => { o[h] = (v[i] || '').trim(); });
        return o;
    });
}
const norm = (n) => (n || '').toLowerCase().replace(/[\s\-'‘’‛`´ʼ]/g, '');
const eu = (v) => {
    const s = String(v == null ? '' : v).trim().replace('%', '').replace(',', '.');
    return s === '' ? 0 : (parseFloat(s) || 0);
};

const LABS = csv('data/labs_tournament_decks.csv', ',');
const LETZTES = LABS.reduce((a, r) => {
    const t = (r.tournament_id || '').trim();
    return (t && (!a || t > a)) ? t : a;
}, null);
const LM = {};
for (const r of LABS) {
    if ((r.tournament_id || '').trim() !== LETZTES) continue;
    LM[norm(r.deck_name)] = {
        name: r.deck_name,
        winPct: F._labsDeckWr(r, ''),
        winPctOhneU: F._labsDeckWrOhneU(r, ''),
        day1Players: parseInt(r.day1_players || '0', 10) || 0,
        roh: r,
    };
}
const ONLINE_BILANZ = {};
for (const r of csv('data/limitless_online_decks.csv', ';')) {
    const s = parseInt(r.wins, 10), n = parseInt(r.losses, 10), u = parseInt(r.ties, 10);
    if (!Number.isFinite(s) || !Number.isFinite(n)) continue;
    ONLINE_BILANZ[norm(r.deck_name)] = { s, n, u: Number.isFinite(u) ? u : 0 };
}
const SHARE = csv('data/limitless_online_decks_comparison.csv', ';')
    .filter((r) => r.deck_name && (r.new_share || r.old_share))
    .map((r) => ({
        name: r.deck_name,
        onlineShare: eu(r.new_share || r.old_share),
        onlineWinPct: eu(r.new_winrate || r.old_winrate),
    }))
    .filter((d) => d.onlineShare > 0)
    .sort((a, b) => b.onlineShare - a.onlineShare);

function uOnline(k) {
    const b = ONLINE_BILANZ[k];
    if (b && (b.s + b.n + b.u) > 0) {
        return { anteil: b.u / (b.s + b.n + b.u), quelle: 'decks', partien: b.s + b.n + b.u };
    }
    return null;
}

const MINDEST_D1 = 20;
const KANDIDATEN = SHARE
    .map((d) => ({ d, k: norm(d.name), lm: LM[norm(d.name)] }))
    .filter((x) => x.lm && x.lm.day1Players >= MINDEST_D1 && x.d.onlineWinPct > 0 && uOnline(x.k));

// ── Zusicherungen ────────────────────────────────────────────────────

describe('Predictor 5.3 rechnet beide Seiten in derselben Konvention', () => {

    it('die Kandidatenliste ist ueberhaupt gefuellt', () => {
        // Ohne diese Vorpruefung koennte alles Weitere leer bestehen.
        const MINDEST_KANDIDATEN = 3;
        assert.ok(KANDIDATEN.length >= MINDEST_KANDIDATEN,
            `nur ${KANDIDATEN.length} Decks beim letzten Major (${LETZTES}) ueber `
            + `${MINDEST_D1} Day-1-Spielern — dann prueft dieser Test nichts`);
    });

    it('_labsDeckWrOhneU rechnet S/(S+N), _labsDeckWr rechnet S/(S+N+U)', () => {
        for (const r of LABS.slice(0, 400)) {
            const s = F._labsGanz(r.wins), n = F._labsGanz(r.losses), u = F._labsGanz(r.ties);
            if (s == null || n == null || s + n <= 0) continue;
            assert.ok(Math.abs(F._labsDeckWrOhneU(r, '')
                - F.W.KONVENTIONEN.ohneUnentschieden.rechne(s, n)) < 1e-9);
            assert.ok(Math.abs(F._labsDeckWr(r, '')
                - F.W.KONVENTIONEN.mitUnentschieden.rechne(s, n, u || 0)) < 1e-9);
        }
    });

    it('_p53Delta liefert die Differenz ZWEIER S/(S+N)-Quoten', () => {
        for (const x of KANDIDATEN) {
            const u = uOnline(x.k);
            const res = F._p53Delta(x.lm, x.d.onlineWinPct, u);
            assert.ok(res, `${x.d.name}: kein Ergebnis`);
            // Beide Seiten einzeln nachgerechnet — aus der Bilanz, nicht
            // aus dem Rueckgabewert.
            const b = ONLINE_BILANZ[x.k];
            const onlineOhne = F.W.KONVENTIONEN.ohneUnentschieden.rechne(b.s, b.n);
            const papierOhne = F.W.KONVENTIONEN.ohneUnentschieden.rechne(
                F._labsGanz(x.lm.roh.wins), F._labsGanz(x.lm.roh.losses));
            assert.ok(Math.abs(res.papier - papierOhne) < 1e-9, x.d.name + ' Papierseite');
            /* Die Online-Seite wird aus der fertigen Quote
               zurueckgerechnet (die Vergleichsdatei fuehrt keine Bilanz),
               deshalb bleibt die Rundung der Quelle als Rest. */
            const RUNDUNG_PP = 0.02;
            assert.ok(Math.abs(res.online - onlineOhne) <= RUNDUNG_PP,
                `${x.d.name}: ${res.online} gegen ${onlineOhne}`);
            const GRENZE = 12;
            const erwartet = Math.max(-GRENZE, Math.min(GRENZE, res.papier - res.online));
            assert.ok(Math.abs(res.delta - erwartet) < 1e-9, x.d.name + ' Delta');
        }
    });

    it('die Subtraktion laeuft wirklich ueber WinRateKonvention.differenz()', () => {
        /* Sonst waere die Zusage "beide Seiten dieselbe Konvention" nur
           ein Kommentar. Hier wird das Modul durch eine Attrappe
           ersetzt, die mitschreibt, mit welchen Konventionen gerufen
           wird — und die alles andere unveraendert durchreicht. */
        const echt = F.window.WinRateKonvention;
        const gesehen = [];
        F.window.WinRateKonvention = {
            hol: echt.hol,
            KONVENTIONEN: echt.KONVENTIONEN,
            nachOhneUnentschieden: echt.nachOhneUnentschieden,
            differenz: (a, b) => { gesehen.push([a.konvention, b.konvention]); return echt.differenz(a, b); },
        };
        try {
            const x = KANDIDATEN[0];
            const res = F._p53Delta(x.lm, x.d.onlineWinPct, uOnline(x.k));
            assert.ok(res, 'kein Ergebnis');
            assert.deepStrictEqual(gesehen, [['ohneUnentschieden', 'ohneUnentschieden']],
                'die Differenz geht nicht (oder nicht in dieser Konvention) durch das Modul');
        } finally {
            F.window.WinRateKonvention = echt;
        }
    });

    it('eine Konventionsverwechslung wird geworfen, nicht gerechnet', () => {
        const echt = F.window.WinRateKonvention;
        F.window.WinRateKonvention = Object.assign({}, echt, {
            // Ein "Fehler" wie er zweimal passiert ist: eine Seite bleibt
            // in ihrer Ausgangskonvention stehen.
            nachOhneUnentschieden: (p) => p,
            differenz: (a, b) => echt.differenz(a, { wert: b.wert, konvention: 'mitUnentschieden' }),
        });
        try {
            const x = KANDIDATEN[0];
            assert.throws(() => F._p53Delta(x.lm, x.d.onlineWinPct, uOnline(x.k)),
                /keine Zahl, sondern ein Fehler/);
        } finally {
            F.window.WinRateKonvention = echt;
        }
    });

    it('ohne Bilanz wird nicht geschoben, sondern nichts geliefert', () => {
        const x = KANDIDATEN[0];
        assert.strictEqual(F._p53Delta(x.lm, x.d.onlineWinPct, null), null,
            'ohne Online-Unentschieden-Anteil kam ein Schub heraus');
        assert.strictEqual(F._p53Delta({ winPctOhneU: null, day1Players: 99 },
            x.d.onlineWinPct, uOnline(x.k)), null, 'ohne Papierbilanz kam ein Schub heraus');
        assert.strictEqual(F._p53Delta(x.lm, 0, uOnline(x.k)), null,
            'ohne Online-Quote kam ein Schub heraus');
        assert.strictEqual(F._p53Delta(x.lm, x.d.onlineWinPct, { anteil: 1, quelle: 'kaputt' }), null,
            'ein Unentschieden-Anteil von 100 % ging durch');
    });

    it('an gesetzten Bilanzen: der Unentschieden-Anteil kuerzt sich heraus', () => {
        /* Zwei Felder, dieselbe Spielstaerke auf beiden Seiten (2:1 auf
           Papier, 2:1 online) — nur unterschiedlich viele Unentschieden.
           In S/(S+N) muss die Differenz exakt null sein. Genau das
           konnte die alte Rechnung nicht. */
        const papier = { s: 200, n: 100, u: 60 };     // 16,7 % Unentschieden
        const online = { s: 2000, n: 1000, u: 30 };   //  1,0 % Unentschieden
        const lm = {
            winPctOhneU: F.W.KONVENTIONEN.ohneUnentschieden.rechne(papier.s, papier.n),
            day1Players: 99,
        };
        const onlineMit = F.W.KONVENTIONEN.mitUnentschieden.rechne(online.s, online.n, online.u);
        const uAnt = { anteil: online.u / (online.s + online.n + online.u), quelle: 'gesetzt' };
        const res = F._p53Delta(lm, onlineMit, uAnt);
        assert.ok(Math.abs(res.delta) < 1e-9,
            `gleiche Spielstaerke, aber Schub ${res.delta} pp`);
        // Und die alte Rechnung haette hier kraeftig danebengelegen.
        const altDelta = F.W.KONVENTIONEN.mitUnentschieden.rechne(papier.s, papier.n, papier.u)
            - onlineMit;
        const ALT_MINDESTFEHLER_PP = 5;
        assert.ok(Math.abs(altDelta) >= ALT_MINDESTFEHLER_PP,
            `die alte Rechnung ergibt nur ${altDelta.toFixed(2)} pp — dann zeigt `
            + 'dieses Beispiel den Fehler nicht mehr');
    });
});

describe('Der Schub wird in derselben Konvention angewandt, in der er gemessen ist', () => {

    const BASIS = { pWin: 0.49, pTie: 0.02, pLoss: 0.49, partien: 300 };

    it('die S/(S+N)-Quote der Paarung verschiebt sich um genau (adjA − adjB) pp', () => {
        for (const [a, b] of [[3, 0], [0, 4], [2.5, -1.5], [-6, -2]]) {
            const raus = F.anwenden('x', 'y', BASIS, { x: a, y: b });
            const vorher = BASIS.pWin / (BASIS.pWin + BASIS.pLoss) * 100;
            const nachher = raus.pWin / (raus.pWin + raus.pLoss) * 100;
            assert.ok(Math.abs((nachher - vorher) - (a - b)) < 1e-9,
                `${a} / ${b}: ${vorher} -> ${nachher}`);
            assert.ok(Math.abs(raus.pWin + raus.pTie + raus.pLoss - 1) < 1e-9, 'Summe != 1');
            assert.strictEqual(raus.pTie, BASIS.pTie, 'die Unentschieden wurden angefasst');
        }
    });

    it('die Praesenzumstellung laesst den Schub unveraendert — das konnte pWin nicht', () => {
        /* DAS IST DER GRUND FUER DIE RICHTUNG DER UMRECHNUNG. calcDay2
           stellt jede Paarung nach getBaseMatchup auf die gemessene
           Praesenz-Unentschieden-Quote um, und diese Umstellung haelt
           S/(S+N) fest. Ein Schub in dieser Konvention kommt deshalb
           unveraendert in der Kette an; ein Schub auf pWin wird
           mitskaliert. */
        const SCHUB = 4;
        const PRAESENZ = 0.1105;
        const ohne = F._mitPraesenzUnentschieden(BASIS, PRAESENZ);
        const mit = F._mitPraesenzUnentschieden(F.anwenden('x', 'y', BASIS, { x: SCHUB }), PRAESENZ);
        const q = (m) => m.pWin / (m.pWin + m.pLoss) * 100;
        assert.ok(Math.abs((q(mit) - q(ohne)) - SCHUB) < 1e-9,
            `nach der Umstellung sind es ${(q(mit) - q(ohne)).toFixed(4)} statt ${SCHUB} pp`);

        /* Gegenprobe in der Groesse, die die alte Anwendung meinte: sie
           addierte den Schub auf pWin und wollte, dass pWin um genau so
           viel steigt. Nach der Praesenzumstellung ist davon nur noch
           (1 − u_Praesenz)/(1 − u_Online) uebrig — bei 11,05 % gegen
           2 % rund ein Zehntel weniger, als gemessen wurde. */
        const altPWin = Math.max(0.05, Math.min(0.95, BASIS.pWin + SCHUB / 100));
        const alt = F._mitPraesenzUnentschieden(
            { pWin: altPWin, pTie: BASIS.pTie, pLoss: Math.max(0, 1 - altPWin - BASIS.pTie) },
            PRAESENZ);
        const angekommen = (alt.pWin - ohne.pWin) * 100;
        const VERFEHLUNG_MIN_PP = 0.2;
        assert.ok(Math.abs(angekommen - SCHUB) >= VERFEHLUNG_MIN_PP,
            `von ${SCHUB} pp kommen ${angekommen.toFixed(4)} pp an — die alte `
            + 'Anwendung trifft den Schub jetzt auch, dann zeigt diese Gegenprobe '
            + 'den Unterschied nicht mehr');
        const erwartetSkaliert = SCHUB * (1 - PRAESENZ) / (1 - BASIS.pTie);
        assert.ok(Math.abs(angekommen - erwartetSkaliert) < 1e-9,
            'die Skalierung folgt nicht (1 − u_Praesenz)/(1 − u_Online)');
    });

    it('auf einen Platzhalter ohne Messung wird nichts geschoben', () => {
        const platz = { pWin: 0.49, pTie: 0.02, pLoss: 0.49, ohneMessung: true };
        assert.strictEqual(F.anwenden('x', 'y', platz, { x: 5 }), platz);
    });

    it('die Quote bleibt zwischen 5 % und 95 %', () => {
        for (const schub of [-99, 99]) {
            const raus = F.anwenden('x', 'y', BASIS, { x: schub });
            const q = raus.pWin / (raus.pWin + raus.pLoss);
            assert.ok(q >= 0.05 - 1e-9 && q <= 0.95 + 1e-9, `Quote ${q}`);
        }
    });
});

describe('Was sich am Feld aendert — beide Rechenwege auf denselben Daten', () => {

    /* Der Vergleich laeuft ueber die Decks, die die 20-Spieler-Schwelle
       beim letzten Major nehmen. Die Aussage ist keine Wochenzahl,
       sondern eine Eigenschaft der beiden Rechenwege: solange auf Papier
       oefter unentschieden gespielt wird als online, zieht die alte
       Rechnung ALLE Decks in dieselbe Richtung, die neue nicht. */
    function beide() {
        return KANDIDATEN.map((x) => {
            const alt = x.lm.winPct - x.d.onlineWinPct;
            const neu = F._p53Delta(x.lm, x.d.onlineWinPct, uOnline(x.k)).delta;
            return { name: x.d.name, alt, neu };
        });
    }

    it('die alte Rechnung hatte fast durchweg dasselbe Vorzeichen, die neue nicht', () => {
        const werte = beide();
        const negAlt = werte.filter((w) => w.alt < 0).length;
        const negNeu = werte.filter((w) => w.neu < 0).length;
        assert.ok(negAlt > negNeu,
            `alt ${negAlt}/${werte.length} negativ, neu ${negNeu}/${werte.length} — `
            + 'der einseitige Zug ist nicht mehr zu sehen');
        const mittel = (f) => werte.reduce((s, w) => s + f(w), 0) / werte.length;
        assert.ok(Math.abs(mittel((w) => w.alt)) > Math.abs(mittel((w) => w.neu)),
            `Mittel alt ${mittel((w) => w.alt).toFixed(2)} pp, `
            + `neu ${mittel((w) => w.neu).toFixed(2)} pp`);
    });

    it('der Unterschied je Deck ist ungefaehr der Unentschieden-Effekt', () => {
        /* alt − neu muss (bis auf die Klemme bei ±12) dem entsprechen,
           was die beiden Unentschieden-Anteile ausmachen. Das ist eine
           GLEICHUNG, keine Behauptung ueber die Woche. */
        const GRENZE = 12;
        const TOLERANZ_PP = 0.05;
        let geprueft = 0;
        for (const x of KANDIDATEN) {
            const b = ONLINE_BILANZ[x.k];
            const s = F._labsGanz(x.lm.roh.wins), n = F._labsGanz(x.lm.roh.losses),
                  u = F._labsGanz(x.lm.roh.ties) || 0;
            const uPapier = u / (s + n + u);
            const uOnl = b.u / (b.s + b.n + b.u);
            const papierOhne = F.W.KONVENTIONEN.ohneUnentschieden.rechne(s, n);
            const onlineOhne = F.W.nachOhneUnentschieden(x.d.onlineWinPct, uOnl);
            const rohNeu = papierOhne - onlineOhne;
            if (Math.abs(rohNeu) >= GRENZE) continue;   // geklemmt, dann gilt die Gleichung nicht
            const alt = x.lm.winPct - x.d.onlineWinPct;
            const erwartet = F.W.nachMitUnentschieden(papierOhne, uPapier)
                - F.W.nachMitUnentschieden(onlineOhne, uOnl);
            assert.ok(Math.abs(alt - erwartet) <= TOLERANZ_PP,
                `${x.d.name}: alt ${alt.toFixed(4)}, aus den Anteilen ${erwartet.toFixed(4)}`);
            geprueft++;
        }
        const MINDEST = 3;
        assert.ok(geprueft >= MINDEST, `nur ${geprueft} ungeklemmte Decks geprueft`);
    });
});

describe('Das Frankfurt-Szenario, durchgerechnet (8 Runden, 16 Punkte)', () => {

    /* WAS HIER NACHGEBAUT IST UND WAS NICHT. Die Kette ist dieselbe wie
       in calcDay2 (Punkte 3/1/0, Praesenzumstellung je Paarung). Die
       Paarungen kommen aus der ONLINE-Matrix, so wie sie der Lader in
       js/app-meta-call.js baut, samt der echten Glaettung aus
       js/matchup-glaettung.js. NICHT nachgebaut ist die 3:1-Mischung mit
       den Major-Paarungen und der Prognosekern: das Feld sind hier die
       25 anteilsstaerksten Decks der Online-Vergleichsdatei plus
       "Sonstige", auf 100 % normiert. Die absoluten Zahlen sind deshalb
       eine Rekonstruktion und nicht das, was die Seite anzeigt — der
       VERGLEICH der beiden Rechenwege laeuft aber auf exakt demselben
       Feld und denselben Paarungen und ist damit belastbar. */

    const TOP_N = 25;
    const RUNDEN = 8;
    const ZIEL = 16;

    const M = {};
    for (const r of csv('data/limitless_online_decks_matchups.csv', ';')) {
        if (!r.deck_name || !r.opponent) continue;
        const dk = norm(r.deck_name), ok = norm(r.opponent);
        if (!M[dk]) M[dk] = {};
        const p = String(r.record).split(/\s*-\s*/).map((x) => parseInt(x.trim(), 10) || 0);
        const s = p[0], n = p[1], u = p[2], tot = s + n + u;
        const quote = F.window.DsGlaettung.quote(s, n);
        const pTie = tot > 0 ? u / tot : 0.02;
        const rest = Math.max(0, 1 - pTie);
        const pWin = (quote / 100) * rest;
        M[dk][ok] = { pWin, pTie, pLoss: Math.max(0, rest - pWin), partien: tot };
    }

    const top = SHARE.slice(0, TOP_N);
    const summeTop = top.reduce((s, d) => s + d.onlineShare, 0);
    const junkShare = SHARE.slice(TOP_N).reduce((s, d) => s + d.onlineShare, 0);
    const gesamt = summeTop + junkShare;
    const FELD = top.map((d) => ({ name: d.name, finalShare: d.onlineShare / gesamt * 100 }));
    FELD.push({ name: '_junk', finalShare: junkShare / gesamt * 100 });
    const rest = SHARE.slice(TOP_N).filter((d) => d.onlineShare > 0 && d.onlineWinPct > 0);
    const gew = rest.reduce((s, d) => s + d.onlineShare, 0);
    const JUNK_WR = Math.min(70, Math.max(30,
        100 - rest.reduce((s, d) => s + d.onlineShare * d.onlineWinPct, 0) / gew));

    // Die gemessene Praesenz-Unentschieden-Quote, aus derselben Datei
    // und mit derselben Auswahl wie aggUnentschieden.
    let ps = 0, pn = 0, pu = 0;
    for (const r of csv('data/labs_tournament_matchups_TEF-PBL.csv', ',')) {
        if ((r.day_filter || '') !== 'overall') continue;
        if (r.vs_wins === '' || r.vs_losses === '') continue;
        ps += +r.vs_wins; pn += +r.vs_losses; pu += (r.vs_ties === '' ? 0 : +r.vs_ties);
    }
    const U_PRAESENZ = pu / (ps + pn + pu);

    const adjAlt = {}, adjNeu = {};
    for (const x of KANDIDATEN) {
        const alt = F._clip(x.lm.winPct - x.d.onlineWinPct, -12, 12);
        if (Math.abs(alt) >= 1) adjAlt[x.k] = alt;
        const neu = F._p53Delta(x.lm, x.d.onlineWinPct, uOnline(x.k)).delta;
        if (Math.abs(neu) >= 1) adjNeu[x.k] = neu;
    }

    function paarung(my, gegner, adj, modus) {
        const basis = (M[my] && M[my][gegner])
            ? M[my][gegner]
            : { pWin: 0.49, pTie: 0.02, pLoss: 0.49, ohneMessung: true };
        if (basis.ohneMessung) return basis;
        if (modus === 'neu') return F.anwenden(my, gegner, basis, adj);
        // Der Weg von vor dem 07.09.2026: Schub direkt auf pWin.
        const A = adj[my] || 0, B = adj[gegner] || 0;
        if (A === 0 && B === 0) return basis;
        const pWin = F._clip(basis.pWin + (A - B) / 100, 0.05, 0.95);
        return { pWin, pTie: basis.pTie, pLoss: Math.max(0, 1 - pWin - basis.pTie) };
    }

    function day2(deckName, adj, modus, spieler) {
        // `spieler` wird absichtlich entgegengenommen und nirgends
        // benutzt — genau das ist unten die Zusicherung.
        void spieler;
        const my = norm(deckName);
        const max = RUNDEN * 3;
        const karten = FELD.map((deck) => {
            if (deck.name === '_junk') {
                const wr = JUNK_WR / 100;
                return F._mitPraesenzUnentschieden(
                    { pWin: wr, pTie: 0.02, pLoss: Math.max(0, 1 - wr - 0.02) }, U_PRAESENZ);
            }
            if (norm(deck.name) === my) {
                return F._mitPraesenzUnentschieden({ pWin: 0.45, pTie: 0.10, pLoss: 0.45 }, U_PRAESENZ);
            }
            return F._mitPraesenzUnentschieden(paarung(my, norm(deck.name), adj, modus), U_PRAESENZ);
        });
        let dp = new Float64Array(max + 1);
        dp[0] = 1;
        for (let r = 0; r < RUNDEN; r++) {
            const nd = new Float64Array(max + 1);
            for (let p = 0; p <= r * 3; p++) {
                if (dp[p] < 1e-14) continue;
                const w = dp[p];
                FELD.forEach((deck, i) => {
                    const sh = deck.finalShare / 100;
                    if (sh <= 1e-9) return;
                    const m = karten[i];
                    if (p + 3 <= max) nd[p + 3] += w * sh * m.pWin;
                    if (p + 1 <= max) nd[p + 1] += w * sh * m.pTie;
                    nd[p] += w * sh * m.pLoss;
                });
            }
            dp = nd;
        }
        let s = 0;
        for (let i = ZIEL; i <= max; i++) s += dp[i];
        return s * 100;
    }

    it('das Feld und die Quote stehen ueberhaupt', () => {
        const MINDEST_FELD = 10;
        assert.ok(FELD.length > MINDEST_FELD, 'das Feld ist leer');
        assert.ok(U_PRAESENZ > 0, 'keine Praesenz-Unentschieden-Quote messbar');
        assert.ok(Object.keys(adjAlt).length > 0 && Object.keys(adjNeu).length > 0,
            'keiner der beiden Rechenwege liefert ueberhaupt einen Schub');
    });

    it('die Spielerzahl geht in die Day-2-Chance nicht ein', () => {
        /* 2.700 Spieler in Frankfurt gegen die Voreinstellung 2.000:
           `_settings.totalPlayers` steht in calcDay2 nirgends, es
           rechnet nur Anteile in Kopfzahlen um. Wer die Zahl aendert
           und eine andere Chance erwartet, irrt — und das steht hier,
           damit es nicht wieder gefragt wird. */
        assert.strictEqual(day2('Mega Excadrill', adjNeu, 'neu', 2700),
                           day2('Mega Excadrill', adjNeu, 'neu', 2000));
        assert.ok(!/totalPlayers/.test(schneide('calcDay2')),
            'calcDay2 liest jetzt doch die Spielerzahl — dann gilt dieser Satz nicht mehr');
    });

    it('die Umstellung aendert die Day-2-Chance messbar', () => {
        const zeilen = FELD.filter((d) => d.name !== '_junk').map((d) => {
            const alt = day2(d.name, adjAlt, 'alt', 2700);
            const neu = day2(d.name, adjNeu, 'neu', 2700);
            return { name: d.name, alt, neu, diff: neu - alt };
        });
        const groesste = zeilen.reduce((a, b) => Math.abs(b.diff) > Math.abs(a.diff) ? b : a);
        const meins = zeilen.find((z) => norm(z.name) === norm('Mega Excadrill'));
        assert.ok(meins, 'Mega Excadrill steht nicht im Feld');

        // Ergebnis der Messung, damit sie im Testlauf sichtbar ist.
        console.log(`    Frankfurt-Rekonstruktion (${RUNDEN} Runden, ${ZIEL} Punkte, `
            + `Praesenz-U ${(U_PRAESENZ * 100).toFixed(2)} %):`);
        console.log(`      Mega Excadrill  vorher ${meins.alt.toFixed(3)} %  `
            + `nachher ${meins.neu.toFixed(3)} %  (${meins.diff >= 0 ? '+' : ''}${meins.diff.toFixed(3)} pp)`);
        console.log(`      groesste Aenderung im Feld: ${groesste.name} `
            + `${groesste.alt.toFixed(3)} % -> ${groesste.neu.toFixed(3)} % `
            + `(${groesste.diff >= 0 ? '+' : ''}${groesste.diff.toFixed(3)} pp)`);

        /* Die Zusicherung ist keine Wochenzahl: sie sagt, dass die
           Umstellung ueberhaupt etwas bewegt. Waere sie kosmetisch,
           haette sie nicht gemacht werden duerfen — und dann soll
           dieser Test fallen. Die Schranke ist eine Zehntel-Chance auf
           Day 2; darunter waere die Aenderung nicht darstellbar. */
        const MINDEST_WIRKUNG_PP = 0.1;
        assert.ok(Math.abs(groesste.diff) >= MINDEST_WIRKUNG_PP,
            'kein Deck aendert seine Day-2-Chance um mehr als '
            + `${MINDEST_WIRKUNG_PP} pp — die Umstellung waere folgenlos`);

        /* Und die zweite Eigenschaft, die man kennen muss: fuer ein Deck,
           das SELBST beim letzten Major stand, hebt sich der grosse Teil
           der Korrektur gegen die Korrektur seiner Gegner auf — der
           Unentschieden-Effekt ist ein gemeinsamer Term. Sichtbar wird
           die Aenderung vor allem bei Decks, deren GEGNER korrigiert
           werden. Deshalb ist die Aenderung fuer Mega Excadrill klein
           und die groesste im Feld ein Vielfaches davon. */
        assert.ok(Math.abs(meins.diff) < Math.abs(groesste.diff),
            'Mega Excadrill ist selbst der groesste Ausschlag — dann trifft die '
            + 'Erklaerung oben nicht mehr zu, nachmessen');
    });
});
