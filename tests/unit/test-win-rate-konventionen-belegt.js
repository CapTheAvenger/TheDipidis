/**
 * DREI FORMELN, EIN NAME — UND EIN BELEG JE FORMEL.
 *
 * BEFUND (07.09.2026). "Win %" bezeichnet in den Datenquellen dieser
 * Seite drei verschiedene Rechnungen, und der Code hat sie an mehreren
 * Stellen miteinander verglichen, als waeren sie dieselbe Groesse.
 * js/win-rate-konvention.js fuehrt die drei seit dem 20.08.2026 — aber
 * die Belege dafuer standen als Prosa im Dateikopf, und Prosa veraltet
 * still: dort stand "4.667 Zeilen von data/labs_tournament_decks.csv"
 * (heute 4.713) und "0 von 1.546 Zeilen" der Matchup-Datei (heute
 * 1.716).
 *
 * Diese Datei macht aus dem Kopftext eine ausgefuehrte Zusicherung. Die
 * Zahlen stehen maschinenlesbar in KONVENTIONEN[id].beleg; hier werden
 * sie gegen die echten Dateien NACHGERECHNET. Laufen Kommentar und
 * Datei auseinander, wird dieser Test rot — statt dass die Datei still
 * weiterwaechst und der Satz daneben still falsch wird.
 *
 * WAS HIER NICHT GEPRUEFT WIRD: welche Decks diese Woche in den Dateien
 * stehen und welche Quoten sie haben. Jede Zusicherung ist eine
 * GLEICHUNG zwischen der Spalte der Datei und der Formel des Moduls —
 * die Werte selbst sind ihr egal. Die Zeilenzahlen bewegen sich mit dem
 * Wochenlauf und tragen deshalb ein Band mit Begruendung, siehe
 * ZEILEN_BAND.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WURZEL = path.join(__dirname, '..', '..');
const lies = (...p) => fs.readFileSync(path.join(WURZEL, ...p), 'utf8');

/** Die echte Konvention laden — kein Nachbau. */
function ladeModul(sprache) {
    const win = { getLang: () => sprache || 'de' };
    return new Function('window',
        lies('js', 'win-rate-konvention.js') + '\nreturn window.WinRateKonvention;')(win);
}
const W = ladeModul('de');

/* Ein CSV-Leser, der beide Trennzeichen und beide Zahlformate dieses
   Projekts vertraegt. Anfuehrungszeichen kommen in der Labs-Datei vor
   (Spalte `pokemon`: "dragapult, dusknoir"). */
function zeilen(datei, trenner) {
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

const zahl = (v) => {
    const s = String(v == null ? '' : v).trim().replace('%', '').replace(',', '.');
    return s === '' ? NaN : parseFloat(s);
};

/** Bilanz einer Zeile — entweder aus drei Spalten oder aus "W - L - T". */
function bilanz(r, wie) {
    if (wie === 'record') {
        const m = String(r.record || '').match(/(\d+)\s*-\s*(\d+)\s*-\s*(\d+)/);
        return m ? { s: +m[1], n: +m[2], u: +m[3] } : null;
    }
    const s = zahl(r[wie[0]]), n = zahl(r[wie[1]]), u = zahl(r[wie[2]]);
    if (!isFinite(s) || !isFinite(n)) return null;
    return { s, n, u: isFinite(u) ? u : 0 };
}

/* Wie weit eine Quelldatei UNTER ihren eingetragenen Beleg fallen darf,
   bevor der Beleg nachgezogen werden muss.

   UMGESCHRIEBEN 22.09.2026. Bis heute war das ein BAND: ein Abstand von
   mehr als 25 % nach oben ODER unten war rot. Die obere Haelfte war ein
   Fehler. `labs_tournament_decks.csv` waechst um rund 90 Zeilen je
   Wochenlauf (gemessen 16.–22.09.2026); von 4.803 Zeilen bis zur Grenze
   5.891 sind das etwa zwoelf Laeufe, also sechs Wochen — dann haette
   diese Zusicherung die Deploy-Kette angehalten, weil die Quelle
   gewachsen ist. Das ist kein Befund, das ist der Normalfall.

   Zuwachs entwertet einen Beleg nicht. Er entwertet ihn nach UNTEN:
   laeuft eine Datei leer, rechnet der Test unten an nichts mehr nach
   und bestuende still. Genau davor schuetzt die Untergrenze. */
const ZEILEN_BAND = 0.25;
/* Wie viele Zeilen die Formel verfehlen darf, gemessen als Anteil.
   1 % laesst die eine bekannte Ausnahme (Wailord) durch und faellt,
   sobald eine Quelle ihre Konvention wechselt — dann verfehlt sie
   naemlich fast jede Zeile, nicht ein Prozent davon. */
const TREFFER_BAND = 0.01;
/* Fuer die Gegenprobe ("die anderen beiden Formeln treffen diese Spalte
   NICHT") gilt ein weiterer Wert. Auf kleinen Bilanzen fallen zwei
   Konventionen rechnerisch zusammen: bei 1-0-1 sind Matchpunkte und
   S/(S+N+U) beide 66,67 %. Gemessen am 07.09.2026 sind das 3,5 % der
   Labs-Zeilen und 2,0 % der Online-Matchupzeilen mit Unentschieden.
   Die Aussage der Probe ist nicht "nie", sondern "nicht in der Masse":
   wechselte eine Quelle ihre Konvention, saehe man hier keine 10 %,
   sondern ueber 90 %. */
const KOINZIDENZ_BAND = 0.10;

describe('Datei → Formel → nachgerechnet', () => {

    for (const id of ['matchpunkte', 'mitUnentschieden', 'ohneUnentschieden']) {
        const k = W.KONVENTIONEN[id];

        it(`${id}: die Konvention nennt ihre Quelle und ihren Beleg`, () => {
            assert.ok(k.quelle && k.quelle.startsWith('data/'),
                `${id} sagt nicht, aus welcher Datei sie kommt`);
            assert.ok(k.beleg && k.beleg.datei && k.beleg.spalte,
                `${id} traegt keinen nachrechenbaren Beleg`);
            assert.ok(fs.existsSync(path.join(WURZEL, ...k.beleg.datei.split('/'))),
                `die Belegdatei von ${id} gibt es nicht: ${k.beleg.datei}`);
        });

        it(`${id}: die Spalte ${k.beleg.spalte} folgt der Formel ${k.formel}`, () => {
            const b = k.beleg;
            const rows = zeilen(b.datei, b.trenner);

            // (a) Die Datei ist nicht unter den Stand gefallen, an dem
            //     gemessen wurde. Nach oben darf sie wachsen.
            const untergrenze = b.zeilen * (1 - ZEILEN_BAND);
            assert.ok(rows.length >= untergrenze,
                `${b.datei} hat nur noch ${rows.length} Zeilen, der Beleg nennt `
                + `${b.zeilen} (Untergrenze ${Math.round(untergrenze)}). Eine `
                + 'geschrumpfte Quelle macht die Nachrechnung unten wertlos: '
                + 'nachmessen, nicht die Zahl senken.');

            // (b) Die Formel trifft die Spalte — Zeile fuer Zeile.
            let geprueft = 0, treffer = 0, groesste = 0, wo = '';
            const daneben = [];
            for (const r of rows) {
                const bz = bilanz(r, b.bilanz);
                const soll = zahl(r[b.spalte]);
                if (!bz || !isFinite(soll) || (bz.s + bz.n + bz.u) <= 0) continue;
                geprueft++;
                const ist = k.rechne(bz.s, bz.n, bz.u);
                const d = Math.abs(ist - soll);
                if (d <= b.toleranz) treffer++;
                else {
                    daneben.push((r.deck_name || r.my_deck_name || '?')
                        + ` ${bz.s}-${bz.n}-${bz.u} Datei ${soll} Formel ${ist.toFixed(4)}`);
                }
                if (d > groesste) { groesste = d; wo = r.deck_name || r.my_deck_name || '?'; }
            }
            assert.strictEqual(geprueft, rows.length,
                `${rows.length - geprueft} Zeilen von ${b.datei} liessen sich nicht `
                + 'nachrechnen — die Bilanzspalten fehlen oder sind kaputt');
            const fehlanteil = (geprueft - treffer) / geprueft;
            assert.ok(fehlanteil <= TREFFER_BAND,
                `${b.datei}: nur ${treffer} von ${geprueft} Zeilen folgen ${k.formel}. `
                + `Groesste Abweichung ${groesste.toFixed(4)} bei ${wo}.\n`
                + daneben.slice(0, 8).join('\n'));

            // (c) Es treffen nicht weniger Zeilen als beim Messen. Dass es
            //     mehr werden, ist der erwuenschte Fall.
            const trefferGrenze = b.treffer * (1 - ZEILEN_BAND);
            assert.ok(treffer >= trefferGrenze,
                `${b.datei}: nur noch ${treffer} Zeilen treffen ${k.formel}, der `
                + `Beleg nennt ${b.treffer} (Untergrenze ${Math.round(trefferGrenze)})`);

            /* (d) Die belegten Ausnahmen.

               UMGESCHRIEBEN 22.09.2026. Vorher verlangte diese Stelle
               GLEICHHEIT: die Liste der Zeilen, die keiner Konvention
               folgen, musste Zeichen fuer Zeichen `['Wailord']` sein.
               Ein einziges neues Deck mit einem Zahlendreher in der
               Quelle haette die Deploy-Kette angehalten — bei 139
               Zeilen eine Ausnahme mehr, also 1,4 % statt 0,7 %.

               Die Masse deckt bereits (b) ab: mehr als ein Prozent
               Fehlschlaege heisst, die Quelle hat ihre Konvention
               gewechselt. Hier bleibt die andere Richtung — der
               eingetragene Beleg darf nicht STILL VERALTEN. Steht
               Wailord noch in der Datei und folgt es plötzlich doch
               einer Konvention, ist die Notiz darueber falsch und
               gehoert weg. */
            if (b.ausnahmen) {
                const namen = daneben.map((z) => z.split(' ')[0]);
                const inDerDatei = new Set(rows.map(
                    (r) => String(r.deck_name || r.my_deck_name || '?').split(' ')[0]));
                /* NACHGEZOGEN 22.09.2026, zweiter Durchgang: hier stand
                   eine Gleichheit. Eine veraltete Notiz deckt nichts zu
                   (die Ausnahmen werden aus den Daten gerechnet, nicht
                   durch die Liste gefiltert) — sie anzuhalten waere die
                   falsche Schwere. Gemeldet wird sie trotzdem. */
                const nichtMehrAuffaellig = b.ausnahmen.filter(
                    (a) => inDerDatei.has(a) && !namen.includes(a));
                if (nichtMehrAuffaellig.length) {
                    console.warn(`[${id}] die Ausnahme `
                        + nichtMehrAuffaellig.join(', ')
                        + ' in js/win-rate-konvention.js ist veraltet: die Zeile '
                        + 'folgt der Konvention inzwischen.');
                }
            }
        });

        it(`${id}: die beiden ANDEREN Formeln treffen dieselbe Spalte nicht`, () => {
            /* Ohne diese Probe koennte der Test oben leer bestehen: waeren
               alle drei Formeln auf diesen Daten gleich, saehe man den
               Unterschied nirgends — und genau darum geht es hier. */
            const b = k.beleg;
            const rows = zeilen(b.datei, b.trenner);
            for (const anderer of ['matchpunkte', 'mitUnentschieden', 'ohneUnentschieden']) {
                if (anderer === id) continue;
                let geprueft = 0, treffer = 0;
                for (const r of rows) {
                    const bz = bilanz(r, b.bilanz);
                    const soll = zahl(r[b.spalte]);
                    if (!bz || !isFinite(soll) || (bz.s + bz.n + bz.u) <= 0) continue;
                    if (bz.u === 0) continue;   // ohne Unentschieden sind zwei der drei gleich
                    geprueft++;
                    if (Math.abs(W.KONVENTIONEN[anderer].rechne(bz.s, bz.n, bz.u) - soll) <= b.toleranz) {
                        treffer++;
                    }
                }
                assert.ok(geprueft > 0,
                    `${b.datei} hat keine Zeile mit Unentschieden — dann prueft der `
                    + 'Vergleich der drei Konventionen nichts');
                const anteil = treffer / geprueft;
                assert.ok(anteil <= KOINZIDENZ_BAND,
                    `${anderer} trifft ${treffer} von ${geprueft} Zeilen in ${b.datei} — `
                    + `die Spalte ${b.spalte} ist dann nicht eindeutig ${id}`);
            }
        });
    }
});

describe('Dieselbe Formel ist noch keine Vergleichbarkeit', () => {

    it('S/(S+N+U) haengt am Unentschieden-Anteil, S/(S+N) nicht', () => {
        // Dieselbe Spielstaerke (2 Siege je Niederlage), zwei Felder.
        const wenigU = W.KONVENTIONEN.mitUnentschieden.rechne(200, 100, 3);
        const vielU  = W.KONVENTIONEN.mitUnentschieden.rechne(200, 100, 33);
        assert.notStrictEqual(wenigU.toFixed(2), vielU.toFixed(2));
        const oWenig = W.KONVENTIONEN.ohneUnentschieden.rechne(200, 100);
        const oViel  = W.KONVENTIONEN.ohneUnentschieden.rechne(200, 100);
        assert.strictEqual(oWenig, oViel);
        assert.ok(Math.abs(oWenig - 200 / 3) < 1e-9);
    });

    it('nachOhneUnentschieden() rechnet die Umkehrung exakt', () => {
        for (const [s, n, u] of [[112, 122, 20], [6732, 6978, 117], [1, 1, 0], [50, 50, 50]]) {
            const mit = W.KONVENTIONEN.mitUnentschieden.rechne(s, n, u);
            const ohne = W.KONVENTIONEN.ohneUnentschieden.rechne(s, n);
            const anteil = u / (s + n + u);
            assert.ok(Math.abs(W.nachOhneUnentschieden(mit, anteil) - ohne) < 1e-9,
                `${s}-${n}-${u}`);
            assert.ok(Math.abs(W.nachMitUnentschieden(ohne, anteil) - mit) < 1e-9,
                `${s}-${n}-${u} zurueck`);
        }
    });

    it('differenz() verweigert die Subtraktion ueber Konventionsgrenzen', () => {
        const paare = [
            ['matchpunkte', 'mitUnentschieden'],
            ['mitUnentschieden', 'ohneUnentschieden'],
            ['ohneUnentschieden', 'matchpunkte'],
        ];
        for (const [a, b] of paare) {
            assert.throws(
                () => W.differenz({ wert: 50, konvention: a }, { wert: 40, konvention: b }),
                /keine Zahl, sondern ein Fehler/,
                `${a} minus ${b} ging durch`);
        }
        assert.throws(() => W.differenz({ wert: 1, konvention: 'ausgedacht' },
            { wert: 1, konvention: 'ausgedacht' }), /unbekannte Konvention/);
        assert.strictEqual(
            W.differenz({ wert: 50, konvention: 'ohneUnentschieden' },
                        { wert: 40, konvention: 'ohneUnentschieden' }), 10);
    });

    it('an den echten Zahlen: 112-122-20 gegen 48,69 % online', () => {
        /* Mega Excadrill bei den Worlds in San Francisco gegen seinen
           kumulativen Online-Stand. Die Bilanz steht in
           data/labs_tournament_decks.csv (tournament_id 0071), die
           48,69 % in data/limitless_online_decks.csv — beide werden hier
           aus den Dateien gelesen, nicht abgeschrieben. */
        const labs = zeilen('data/labs_tournament_decks.csv', ',')
            .filter((r) => r.tournament_id === '0071' && /xcadrill/.test(r.deck_name || ''));
        assert.strictEqual(labs.length, 1, 'Mega Excadrill steht nicht genau einmal bei 0071');
        const L = bilanz(labs[0], ['wins', 'losses', 'ties']);
        const online = zeilen('data/limitless_online_decks.csv', ';')
            .filter((r) => /xcadrill/.test(r.deck_name || ''));
        assert.strictEqual(online.length, 1);
        const O = bilanz(online[0], ['wins', 'losses', 'ties']);

        const labsMit = W.KONVENTIONEN.mitUnentschieden.rechne(L.s, L.n, L.u);
        const onlMit  = W.KONVENTIONEN.mitUnentschieden.rechne(O.s, O.n, O.u);
        const labsOhne = W.KONVENTIONEN.ohneUnentschieden.rechne(L.s, L.n);
        const onlOhne  = W.KONVENTIONEN.ohneUnentschieden.rechne(O.s, O.n);

        const dMit  = labsMit - onlMit;
        const dOhne = W.differenz({ wert: labsOhne, konvention: 'ohneUnentschieden' },
                                  { wert: onlOhne,  konvention: 'ohneUnentschieden' });

        /* DIE AUSSAGE: die Differenz in S/(S+N+U) ist deutlich groesser
           als die in S/(S+N), und der Unterschied zwischen den beiden
           Differenzen ist genau der Unentschieden-Effekt. Beides sind
           Eigenschaften der Rechnung — welche Bilanz die Dateien diese
           Woche fuehren, ist der Zusicherung egal, solange das
           Papierfeld oefter unentschieden spielt als das Online-Feld. */
        const uPapier = L.u / (L.s + L.n + L.u);
        const uOnline = O.u / (O.s + O.n + O.u);
        assert.ok(uPapier > uOnline,
            'das Papierfeld spielt nicht mehr haeufiger unentschieden — dann '
            + 'prueft dieser Vergleich nichts mehr');
        assert.ok(Math.abs(dMit) > Math.abs(dOhne),
            `Differenz mit U ${dMit.toFixed(2)} pp, ohne U ${dOhne.toFixed(2)} pp`);

        // Und die Umrechnung ist verlustfrei: mit U ist ohne U mal (1-u).
        assert.ok(Math.abs(W.nachMitUnentschieden(labsOhne, uPapier) - labsMit) < 1e-9);
        assert.ok(Math.abs(W.nachMitUnentschieden(onlOhne, uOnline) - onlMit) < 1e-9);
    });
});

describe('Die Anzeige nennt, nach welcher Formel gerechnet ist', () => {

    const MC = lies('js', 'app-meta-call.js');

    function schneideFunktion(name) {
        const anfang = MC.indexOf('function ' + name + '(');
        assert.ok(anfang >= 0, `${name} steht nicht mehr in js/app-meta-call.js`);
        let tiefe = 0;
        for (let j = MC.indexOf('{', anfang); j < MC.length; j++) {
            if (MC[j] === '{') tiefe++;
            else if (MC[j] === '}') { tiefe--; if (tiefe === 0) return MC.slice(anfang, j + 1); }
        }
        throw new Error('kein Ende: ' + name);
    }

    /* Die Chips werden mit dem ECHTEN Konventionsmodul gerendert. */
    function baueChip(sprache) {
        const win = { getLang: () => sprache, zahlLokal: (n) => String(n) };
        new Function('window', lies('js', 'win-rate-konvention.js'))(win);
        return new Function('window', 'esc',
            schneideFunktion('_wrKonventionsTitel') + '\n'
            + schneideFunktion('_wrChip') + '\nreturn _wrChip;')(win, (x) => String(x));
    }

    it('der WR-Chip traegt Kurzname UND Formel seiner Konvention', () => {
        const chip = baueChip('de');
        const papier = chip(44.1, 254);                       // Vorgabe: mitUnentschieden
        const paar   = chip(47.9, 234, 'ohneUnentschieden');
        assert.match(papier, /title="/, 'der Papier-Chip traegt keinen Hinweis');
        assert.match(papier, /S \/ \(S \+ N \+ U\)/, 'der Papier-Chip nennt seine Formel nicht');
        assert.match(paar, /S \/ \(S \+ N\)/, 'der Paar-Chip nennt seine Formel nicht');
        // Und die Zahl selbst steht unveraendert da.
        assert.match(papier, /WR 44 % · 254/);
        assert.match(paar, /WR 48 % · 234/);
        // Die beiden Hinweise sind verschieden — sonst waere nichts gewonnen.
        assert.notStrictEqual(papier.match(/title="([^"]*)"/)[1],
                              paar.match(/title="([^"]*)"/)[1]);
    });

    it('die Begegnungsliste nennt ihre Konvention — und es ist die andere', () => {
        /* Auf derselben Seite stehen zwei Zahlen mit dem Etikett "WR":
           der Chip am Deck (Papier, S/(S+N+U)) und die Zeile in der
           Begegnungsliste (S/(S+N)). Genau dieses Nebeneinander war der
           Anlass. */
        const zeile = MC.match(/class="mc-enc-wr \$\{wrCls\}" title="\$\{esc\(([^]*?)\)\}"/);
        assert.ok(zeile, 'die Begegnungszeile hat ihren title verloren');
        assert.match(zeile[1], /_wrKonventionsTitel\('ohneUnentschieden'\)/,
            'die Begegnungsliste sagt nicht mehr, nach welcher Formel sie rechnet');
    });

    it('der Predictor-5.3-Hinweis nennt die Konvention beider Seiten', () => {
        const anfang = MC.indexOf("const konv = (typeof window !== 'undefined' && window.WinRateKonvention)");
        assert.ok(anfang >= 0, 'der Konventionshinweis im Banner ist verschwunden');
        const ende = MC.indexOf("in the same convention.';", anfang);
        assert.ok(ende > anfang, 'der Banner-Hinweis hat kein Ende mehr');
        const stueck = MC.slice(anfang, ende + 25);
        for (const [sprache, muster] of [['de', /Siegquote ohne Unentschieden/],
                                         ['en', /win share excluding ties/]]) {
            const win = { getLang: () => sprache };
            new Function('window', lies('js', 'win-rate-konvention.js'))(win);
            const titel = new Function('window', '_mcIstDeutsch',
                stueck + '\nreturn titel;')(win, () => sprache === 'de');
            assert.match(titel, /S \/ \(S \+ N\)/, sprache + ': keine Formel im Hinweis');
            assert.match(titel, muster, sprache + ': die Konvention wird nicht benannt');
            assert.doesNotMatch(titel, /Win %/,
                sprache + ': der Hinweis nennt die Groesse wieder "Win %" — das ist '
                + 'der Name EINER der drei Konventionen und nicht die, die hier gilt');
        }
    });

    it('alle drei Konventionen werden gebraucht — und keine heisst wie eine andere', () => {
        /* Gebraucht: jede der drei wird von mindestens einer
           Anzeigedatei angefordert. Sonst waere sie totes Inventar. */
        const dateien = fs.readdirSync(path.join(WURZEL, 'js'))
            .filter((f) => f.endsWith('.js'))
            .map((f) => lies('js', f))
            .join('\n');
        for (const id of ['matchpunkte', 'mitUnentschieden', 'ohneUnentschieden']) {
            const treffer = (dateien.match(new RegExp("'" + id + "'", 'g')) || []).length;
            assert.ok(treffer > 0, `die Konvention ${id} wird nirgends angefordert`);
        }
        for (const sprache of ['de', 'en']) {
            const M = ladeModul(sprache);
            const namen = ['matchpunkte', 'mitUnentschieden', 'ohneUnentschieden']
                .map((id) => M.kurz(id));
            assert.strictEqual(new Set(namen).size, 3,
                `${sprache}: zwei Konventionen tragen denselben Kurznamen: ${namen.join(' | ')}`);
            // "Win %" gehoert genau einer — der Anordnung vom 05.09.2026 nach
            // der mit (3S+U)/3n. Die anderen beiden duerfen es nicht tragen.
            assert.strictEqual(M.kurz('matchpunkte'), 'Win %');
            assert.ok(!/Win %/.test(M.kurz('mitUnentschieden')), sprache);
            assert.ok(!/Win %/.test(M.kurz('ohneUnentschieden')), sprache);
            // Und die beiden nennen ihren Unterschied im Namen.
            assert.match(M.kurz('ohneUnentschieden'), /ohne Unentschieden|excluding ties/);
            assert.match(M.kurz('mitUnentschieden'), /inkl\. Unentschieden|incl\. ties/);
        }
    });
});
