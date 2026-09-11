'use strict';
/**
 * KEIN HAUSNAME AUF EINER WIN-RATE — WEDER IM QUELLTEXT NOCH AUS
 * js/i18n.js.
 *
 * BEFUND W2 (08.09.2026). Angeordnet ist: Win-Raten tragen die
 * Bezeichnung der Quelle, keine eigenen Begriffe. „Win %" ist dabei in
 * js/win-rate-konvention.js fuer die Konvention MATCHPUNKTE
 * ((3S+U)/(3n)) reserviert — so nennt Limitless diese Spalte. Die
 * beiden anderen Konventionen heissen anders, und eine S/(S+N)-Zahl
 * „Win %" zu nennen waere derselbe Fehler in die andere Richtung.
 *
 * Live gemessen an thedipidis.app (Version 202609080008-33eb397) stand
 * im Reiter „Turnier / Meta Call" trotzdem „WR 42 % · 1.220", „Ø Win
 * Rate", „WR (gemischt)" neben „Manuelle WR" und „D2-WR". Die
 * bestehende Pruefung tests/unit/test-r5-win-prozent-namen.js sieht
 * das NICHT: sie durchsucht nur Zeichenketten IM QUELLTEXT, und diese
 * Namen stehen in js/i18n.js.
 *
 * DIESE DATEI SCHLIESST BEIDE LUECKEN
 *
 *   1. QUELLTEXT: jede Zeichenkette ausserhalb von Kommentaren in den
 *      fuenf zugewiesenen Dateien wird nach hauseigenen Namen
 *      abgesucht.
 *   2. KUERZEL: jede Zeichenkette, in der eine Zahl mit „WR"
 *      beschriftet wird, muss im selben Element einen Hinweis tragen
 *      (title oder data-hinweis). Ohne Hinweis ist „WR" ein Hausname —
 *      es sagt nicht, welche der drei Formeln gemeint ist.
 *   3. UEBERSETZUNG: jeder i18n-Schluessel, den eine der fuenf Dateien
 *      benutzt und dessen deutscher oder englischer Wortlaut einen
 *      Hausnamen enthaelt, muss unten im REGISTER stehen — mit der
 *      Konvention, die an dieser Stelle wirklich gerechnet wird, und
 *      mit dem Heilmittel, das die Anzeigestelle anwendet. Das
 *      Heilmittel wird nachgesehen, nicht geglaubt.
 *
 * Jede Ausnahme steht in der POSITIVLISTE bzw. im REGISTER mit
 * Begruendung. Eine tote Zeile in beiden laesst diesen Test ebenfalls
 * fallen — eine Positivliste, die auf nichts mehr zeigt, ist eine
 * stillschweigende Erlaubnis fuer den naechsten Fund.
 *
 * Kein jsdom, kein Zugriff auf data/.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WURZEL = path.join(__dirname, '..', '..');
const lies = (rel) => fs.readFileSync(path.join(WURZEL, rel), 'utf8');

/** Die fuenf Dateien dieses Arbeitspakets. */
const DATEIEN = [
    'js/app-meta-call.js',
    'js/app-past-meta.js',
    'js/app-city-league.js',
    'js/app-deck-builder.js',
    'js/ds-pocket.js',
];

/* ══ DER LESER ════════════════════════════════════════════════════
 *
 * Uebernommen aus tests/unit/test-r5-win-prozent-namen.js (Moduskeller
 * fuer verschachtelte Vorlagen, Regex-Literale werden uebersprungen)
 * mit EINER Aenderung: eine Einsetzung `${…}` hinterlaesst hier das
 * Zeichen „…" statt zu verschwinden. Ohne diese Spur ist `WR ${z} %`
 * von einem Klassennamen nicht mehr zu unterscheiden, und genau daran
 * haengt Pruefung 2.
 */
function literale(quelltext) {
    const res = [];
    const keller = [{ art: 'code', tiefe: 0 }];
    let i = 0, zeile = 1, vorher = '';
    const n = quelltext.length;
    const regexDarfFolgen = () => !/[A-Za-z0-9_$)\].]/.test(vorher);
    while (i < n) {
        const oben = keller[keller.length - 1];
        const c = quelltext[i], d = quelltext[i + 1];
        if (oben.art === 'tmpl') {
            if (c === '\\') { oben.buf += c + (d || ''); i += 2; continue; }
            if (c === '`') {
                res.push({ zeile: oben.start, text: oben.buf });
                keller.pop(); vorher = '`'; i++; continue;
            }
            if (c === '$' && d === '{') {
                oben.buf += '…';
                keller.push({ art: 'code', tiefe: 0 }); i += 2; continue;
            }
            if (c === '\n') zeile++;
            oben.buf += c; i++; continue;
        }
        if (c === '/' && d === '/') { while (i < n && quelltext[i] !== '\n') i++; continue; }
        if (c === '/' && d === '*') {
            i += 2;
            while (i < n && !(quelltext[i] === '*' && quelltext[i + 1] === '/')) {
                if (quelltext[i] === '\n') zeile++;
                i++;
            }
            i += 2; continue;
        }
        if (c === '/' && regexDarfFolgen()) {
            let j = i + 1, klasse = false, zu = false;
            while (j < n) {
                const z = quelltext[j];
                if (z === '\\') { j += 2; continue; }
                if (z === '\n') break;
                if (z === '[') klasse = true;
                else if (z === ']') klasse = false;
                else if (z === '/' && !klasse) { zu = true; break; }
                j++;
            }
            if (zu) { i = j + 1; vorher = '/'; continue; }
        }
        if (c === '"' || c === "'") {
            const start = zeile;
            let buf = ''; i++;
            while (i < n) {
                const z = quelltext[i];
                if (z === '\\') { buf += z + (quelltext[i + 1] || ''); i += 2; continue; }
                if (z === c) { i++; break; }
                if (z === '\n') { zeile++; break; }
                buf += z; i++;
            }
            res.push({ zeile: start, text: buf });
            vorher = c; continue;
        }
        if (c === '`') { keller.push({ art: 'tmpl', start: zeile, buf: '' }); i++; continue; }
        if (c === '{') oben.tiefe++;
        else if (c === '}') {
            if (oben.tiefe > 0) oben.tiefe--;
            else if (keller.length > 1) { keller.pop(); i++; continue; }
        }
        if (c === '\n') zeile++;
        if (!/\s/.test(c)) vorher = c;
        i++;
    }
    return res;
}

/** Kommentare durch Leerzeichen ersetzen, Laengen und Zeilen bleiben. */
function ohneKommentare(q) {
    let raus = '';
    let i = 0;
    const n = q.length;
    let vorher = '';
    const regexDarfFolgen = () => !/[A-Za-z0-9_$)\].]/.test(vorher);
    while (i < n) {
        const c = q[i], d = q[i + 1];
        if (c === '/' && d === '/') {
            while (i < n && q[i] !== '\n') { raus += ' '; i++; }
            continue;
        }
        if (c === '/' && d === '*') {
            while (i < n && !(q[i] === '*' && q[i + 1] === '/')) {
                raus += (q[i] === '\n') ? '\n' : ' '; i++;
            }
            raus += '  '; i += 2; continue;
        }
        if (c === '/' && regexDarfFolgen()) {
            let j = i + 1, klasse = false, zu = false;
            while (j < n) {
                const z = q[j];
                if (z === '\\') { j += 2; continue; }
                if (z === '\n') break;
                if (z === '[') klasse = true;
                else if (z === ']') klasse = false;
                else if (z === '/' && !klasse) { zu = true; break; }
                j++;
            }
            if (zu) { raus += q.slice(i, j + 1); i = j + 1; vorher = '/'; continue; }
        }
        raus += c;
        if (!/\s/.test(c)) vorher = c;
        i++;
    }
    return raus;
}

/* ══ 1. HAUSEIGENE NAMEN IM QUELLTEXT ═════════════════════════════ */

/* Denselben Satz Begriffe fuehrt tests/unit/test-r5-win-prozent-namen.js.
   Ergaenzt um „Matchup-Win" — der Name aus mc.intelTgWr, der dort noch
   nicht vorkam. „WR" steht bewusst NICHT darin: das Kuerzel ist
   zulaessig, solange sein Hinweis danebenhaengt, und dafuer gibt es
   Pruefung 2. */
const VERBOTEN = /Win\s?%|Win\s?Rate|Win-Rate|Winrate|Siegrate|Siegquote|Siegesquote|Gewinnrate|Erfolgsquote|Siege je Match|Wins per game|Win share|Matchup-Win/i;

/** i18n-Schluessel wie 'mc.frozenColWinPct' sind kein angezeigter Text. */
const IST_SCHLUESSEL = /^[a-z][A-Za-z0-9]*\.[A-Za-z0-9_.]+$/;

const POSITIVLISTE = [
    /* AUSGETRAGEN AM 08.09.2026. Hier stand eine Ausnahme fuer
       „… % Win Rate /" — den console.log des Predictors 6.2 in
       js/app-meta-call.js. Die Zeile holt ihren Namen jetzt zur
       Laufzeit aus WinRateKonvention.kurz('mitUnentschieden') und
       faellt auf die Formel S / (S + N + U) zurueck; der Hausname ist
       weg, die Ausnahme deckte nichts mehr ab. Eine Ausnahme, die auf
       nichts zeigt, ist eine stillschweigende Erlaubnis fuer den
       naechsten Fund — deshalb geloescht statt stehengelassen. */
    {
        datei: 'js/app-meta-call.js',
        beginnt: 'Siegquote ohne Unentschieden',
        grund: 'Rueckfall neben WinRateKonvention.kurz("ohneUnentschieden") im '
             + 'Predictor-5.3-Hinweis: greift nur, wenn das Modul gar nicht geladen '
             + 'ist, und nennt dann genau den Namen, den das Modul vergeben haette.',
    },
    {
        datei: 'js/app-meta-call.js',
        beginnt: 'Win share excluding ties',
        grund: 'derselbe Rueckfall, englisch.',
    },
    {
        datei: 'js/app-past-meta.js',
        beginnt: 'Win %',
        grund: 'Rueckfall fuer t("pm.matchupColWinPct"). Die Spalte liest vs_win_pct '
             + 'aus data/labs_tournament_matchups_<Format>.csv; ueber alle 1.866 Zeilen '
             + 'der Datei TEF-PBL trifft dort (3S+U)/(3n) auf 0,005 Punkte genau und '
             + 'keine der beiden anderen Konventionen (nachgerechnet in '
             + 'tests/unit/test-w2-quellen-konventionen.js). „Win %" ist genau der Name, '
             + 'den js/win-rate-konvention.js dafuer vergibt.',
    },
    {
        datei: 'js/app-past-meta.js',
        beginnt: 'Cumulative Win %',
        grund: 'Rueckfall fuer t("pm.perfStatWinPct"). Diese Kachel ruft '
             + 'WK.KONVENTIONEN.matchpunkte.rechne() auf — sie rechnet also wirklich '
             + 'Matchpunkte, und „Win %" ist deren reservierter Name.',
    },

{
        datei: 'js/app-meta-call.js',
        beginnt: 'das ist NICHT die Größe',
        grund: 'Abgrenzungssatz unter der Erwartungstabelle „Dein Deck gegen das '
             + 'Meta". Er vergibt keinen Hausnamen, sondern nimmt einen weg: die '
             + 'Quote darueber rechnet S/(S+N) (WinRateKonvention ohneUnentschieden), '
             + 'und der Satz grenzt sie ausdruecklich gegen die Matchpunkte ab, die '
             + 'Limitless „Win %" nennt. Stand bis zum 11.09.2026 in '
             + 'js/ds-ev-rechner.js, das mit dem Umzug der Rechnung in den Meta Call '
             + 'entfallen ist. tests/unit/test-w3-ev-und-abschnitt.js laesst genau '
             + 'EINE solche Fundstelle zu.',
    },
];

function erlaubt(datei, text) {
    return POSITIVLISTE.some(e => e.datei === datei && text.startsWith(e.beginnt));
}

function funde() {
    const raus = [];
    for (const datei of DATEIEN) {
        for (const l of literale(lies(datei))) {
            const text = l.text.trim();
            if (!VERBOTEN.test(text)) continue;
            if (IST_SCHLUESSEL.test(text)) continue;
            raus.push({ datei, zeile: l.zeile, text });
        }
    }
    return raus;
}

describe('W2 — kein hauseigener Name fuer eine Win-Rate im Quelltext', () => {

    it('der Leser sieht ueberhaupt etwas (sonst besteht der Suchlauf leer)', () => {
        const alle = literale(lies('js/app-meta-call.js'));
        assert.notEqual(alle.length, 0, 'der Leser liefert nichts');
        assert.equal(alle.length > 500, true,
            `nur ${alle.length} Zeichenketten gefunden — der Leser ist kaputt`);
        assert.equal(alle.some(l => l.text.includes('mc.frozenColWinPct')), true,
            'eine bekannte Zeichenkette fehlt — der Leser ueberspringt zu viel');
        assert.equal(alle.some(l => l.text.includes('…')), true,
            'keine Einsetzung markiert — dann laeuft Pruefung 2 leer');
    });

    it('jede Fundstelle steht in der Positivliste oder ist ein Fehler', () => {
        const offen = funde()
            .filter(f => !erlaubt(f.datei, f.text))
            .map(f => `${f.datei}:${f.zeile}  ${f.text.slice(0, 160).replace(/\n/g, ' ')}`);
        assert.deepEqual(offen, [],
            'Diese angezeigten Texte vergeben einen eigenen Namen fuer eine Win-Rate:\n  '
            + offen.join('\n  ')
            + '\n\nDen Namen vergibt js/win-rate-konvention.js. Entweder ueber '
            + 'WinRateKonvention.kurz(<konvention>) holen (im Meta Call: _wrVollname) — '
            + 'oder, wenn die Fundstelle legitim anders heisst, oben in die '
            + 'POSITIVLISTE eintragen und in einem Satz begruenden.');
    });

    it('die Positivliste zeigt auf nichts Totes', () => {
        const alle = funde();
        const tot = POSITIVLISTE
            .filter(e => !alle.some(f => f.datei === e.datei && f.text.startsWith(e.beginnt)))
            .map(e => `${e.datei}  „${e.beginnt}"`);
        assert.deepEqual(tot, [],
            'Diese Positivlisten-Zeilen decken nichts mehr ab:\n  ' + tot.join('\n  ')
            + '\n\nEine Ausnahme, die auf nichts zeigt, ist eine stillschweigende '
            + 'Erlaubnis fuer den naechsten Fund. Loeschen.');
    });
});

/* ══ 2. „WR" OHNE HINWEIS IST EIN HAUSNAME ════════════════════════ */

/* Eine Zahl, die mit „WR" beschriftet ist: das Kuerzel, dann Abstand,
   dann eine Ziffer oder eine Einsetzung („…"). Klassennamen wie
   `mc-enc-wr` fallen heraus, weil vor dem Kuerzel ein Bindestrich
   steht; `case 'wr':` faellt heraus, weil nichts folgt. */
const KUERZEL = /(^|[>\s(·])WR[\s ]*(…|\d)/;
const HINWEIS = /title="|data-hinweis="/;

const KUERZEL_POSITIVLISTE = [
    {
        datei: 'js/app-meta-call.js',
        beginnt: ' (WR …',
        grund: 'Rueckfallzweig von _wrChip fuer den Fall, dass '
             + 'js/win-rate-konvention.js gar nicht geladen ist. Er ist als Zusage in '
             + 'tests/unit/test-abnahme-2026-09-05.js festgeschrieben (der Nenner muss '
             + 'auch dann dranstehen) und kommt in der ausgelieferten Seite nicht vor: '
             + 'index.html laedt js/win-rate-konvention.js vor js/app-meta-call.js. '
             + 'Dass der GENUTZTE Zweig Name und Formel fuehrt, prueft '
             + 'tests/unit/test-w2-konventionen-am-ort.js am gerenderten Chip.',
    },
    {
        datei: 'js/app-meta-call.js',
        beginnt: '…: +… pp (WR …',
        grund: 'console.log der Predictor-Diagnose (Leader-Dominanz). Werkzeugausgabe '
             + 'fuer den Betreuer, keine Oberflaeche.',
    },
    {
        datei: 'js/app-meta-call.js',
        beginnt: '…: best WR …',
        grund: 'console.log derselben Diagnose (Predictor 4.5, „warum feuert er nicht"). '
             + 'Keine Oberflaeche.',
    },
];

function kuerzelFunde() {
    const raus = [];
    for (const datei of DATEIEN) {
        for (const l of literale(lies(datei))) {
            if (!KUERZEL.test(l.text)) continue;
            raus.push({ datei, zeile: l.zeile, text: l.text.trim(), hinweis: HINWEIS.test(l.text) });
        }
    }
    return raus;
}

describe('W2 — das Kuerzel „WR" traegt seinen Hinweis', () => {

    it('der Suchlauf findet ueberhaupt Kuerzel (sonst besteht er leer)', () => {
        assert.notEqual(kuerzelFunde().length, 0,
            'keine einzige mit „WR" beschriftete Zahl gefunden — dann prueft dieser '
            + 'Abschnitt nichts mehr');
    });

    it('jede mit „WR" beschriftete Zahl hat title oder data-hinweis', () => {
        const offen = kuerzelFunde()
            .filter(f => !f.hinweis)
            .filter(f => !KUERZEL_POSITIVLISTE.some(
                e => e.datei === f.datei && f.text.startsWith(e.beginnt.trim())))
            .map(f => `${f.datei}:${f.zeile}  ${f.text.slice(0, 160).replace(/\n/g, ' ')}`);
        assert.deepEqual(offen, [],
            'Hier steht „WR" an einer Zahl, ohne dass irgendwo danebensteht, welche '
            + 'der drei Formeln gemeint ist:\n  ' + offen.join('\n  ')
            + '\n\nEntweder _wrKonventionsTitel(<konvention>) als title/data-hinweis '
            + 'anhaengen — oder den vollen Namen aus WinRateKonvention.kurz() '
            + 'hinschreiben.');
    });

    it('die Kuerzel-Positivliste zeigt auf nichts Totes', () => {
        const alle = kuerzelFunde();
        const tot = KUERZEL_POSITIVLISTE
            .filter(e => !alle.some(f => f.datei === e.datei
                && f.text.startsWith(e.beginnt.trim()) && !f.hinweis))
            .map(e => `${e.datei}  „${e.beginnt}"`);
        assert.deepEqual(tot, [],
            'Diese Zeilen decken nichts mehr ab (die Stelle ist weg oder hat '
            + 'inzwischen einen Hinweis):\n  ' + tot.join('\n  '));
    });
});

/* ══ 3. DIE NAMEN AUS js/i18n.js ══════════════════════════════════ */

/**
 * Jeder Schluessel, den eine der fuenf Dateien benutzt und dessen
 * Wortlaut in js/i18n.js einen Hausnamen traegt.
 *
 *   konvention  Was an der Anzeigestelle WIRKLICH gerechnet wird —
 *               nachgewiesen im Kommentar an Ort und Stelle und, wo
 *               ausfuehrbar, in tests/unit/test-w2-konventionen-am-ort.js.
 *               null heisst: die Stelle beschriftet keine einzelne
 *               Zahl (z. B. eine Schaltflaeche).
 *   marken      Was an der Fundstelle stehen muss, damit der Hausname
 *               dort nicht ankommt. Mindestens eine davon muss im
 *               Umkreis von `fenster` Zeichen um JEDE Fundstelle
 *               stehen.
 *   ohneMarke   Wie viele Fundstellen legitim ohne Heilmittel sind.
 *               Muss exakt stimmen — eine zusaetzliche faellt auf.
 */
const FENSTER = 600;

const REGISTER = [
    { datei: 'js/app-meta-call.js', schluessel: 'mc.adjustWinRates',
      konvention: null, marken: ['_wrEineKonvention'], ohneMarke: 2,
      grund: 'Die Schaltflaeche beschriftet keine Zahl, sondern oeffnet einen Kasten. '
           + 'Dessen beide Spalten meinen seit dem 11.09.2026 DIESELBE Konvention '
           + '(getMatchup setzt die getippte Zahl als S/(S+N) ein); der Satz darueber '
           + 'kommt aus _wrEineKonvention und nennt sie. Bis dahin waren es zwei, und '
           + 'die Marke hiess _wrZweiKonventionen. ZWEI Fundstellen ohne Heilmittel: '
           + '(1) _toggleOverrides dreht nur den Pfeil in der bereits gesetzten '
           + 'Beschriftung um und ist in tests/unit/test-r5-win-prozent-namen.js '
           + 'daraufhin festgeschrieben; (2) _mcKnopfQuoten liest denselben Schluessel, '
           + 'um den Knopf in den Ablauftexten beim Namen zu nennen, ohne ihn '
           + 'abzuschreiben — es entsteht dadurch keine zweite beschriftete Zahl, '
           + 'sondern nur ein Verweis auf eine bereits vorhandene Schaltflaeche. '
           + 'js/i18n.js gehoert in diesem Durchgang einem anderen Arbeitspaket.' },

    { datei: 'js/app-meta-call.js', schluessel: 'mc.colWrBlended',
      konvention: 'ohneUnentschieden', marken: ['_titelGemischt', '_wrEineKonvention'],
      grund: 'Die Spalte zeigt _anzeigeQuote(m) = pWin/(pWin+pLoss) = S/(S+N). Das '
           + 'Kuerzel bleibt (schmale Spalte), Name und Formel haengen als title.' },

    { datei: 'js/app-meta-call.js', schluessel: 'mc.colManualWr',
      konvention: 'ohneUnentschieden', marken: ['_titelManuell', '_wrEineKonvention'],
      grund: 'Seit dem 11.09.2026 setzt getMatchup die eingetippte Zahl als S/(S+N) ein '
           + '— dieselbe Groesse, die die Spalte links zeigt. Vorher landete sie direkt '
           + 'als pWin, also als Anteil an ALLEN Partien: wer 55 tippte, weil links 55 % '
           + 'stand, bekam 56 % zurueck. Beide Spalten tragen denselben Hinweis, und '
           + 'darueber steht der Satz, dass es EINE Konvention ist.' },

    { datei: 'js/app-meta-call.js', schluessel: 'mc.overrideHint',
      konvention: 'ohneUnentschieden', marken: ['_titelManuell'],
      grund: 'Der Satz ueber der Tabelle spricht von der manuellen Spalte und traegt '
           + 'deren Hinweis — seit dem 11.09.2026 dieselbe Konvention wie die Spalte '
           + 'daneben.' },

    { datei: 'js/app-meta-call.js', schluessel: 'mc.wrNennerTitel',
      konvention: 'ohneUnentschieden', marken: ['_wrVollname'],
      grund: 'Der Nennersatz haengt an der Begegnungsliste, die _anzeigeQuote zeigt. '
           + 'Er ist selbst ein Hinweistext und hat keinen zweiten Ort fuer einen '
           + 'Namen — also wird der Hausname ersetzt.' },

    { datei: 'js/app-meta-call.js', schluessel: 'mc.reasonWr',
      konvention: 'mitUnentschieden', marken: ['_wrKurzform'],
      grund: '_topMatchupsVsField legt wr = m.pWin ab, den Anteil an allen Partien. '
           + 'Dasselbe Kuerzel steht ein Panel weiter auf S/(S+N) — deshalb der '
           + 'title an genau dieser Zeile.' },

    { datei: 'js/app-meta-call.js', schluessel: 'mc.d2WrLabel',
      konvention: 'mitUnentschieden', marken: ['_wrKurzform'],
      grund: 'r.d2WrPct kommt aus _labsDeckWr(r, "day2_") = S/(S+N+U).' },

    { datei: 'js/app-meta-call.js', schluessel: 'mc.d2WrTooltip',
      konvention: 'mitUnentschieden', marken: ['_wrVollname'],
      grund: 'Derselbe Wert; der Tooltip ist selbst der Hinweis und traegt deshalb '
           + 'den vollen Namen.' },

    { datei: 'js/app-meta-call.js', schluessel: 'mc.histD2Wr',
      konvention: 'mitUnentschieden', marken: ['_titelVerlauf'],
      grund: 'Die Verlaufszeile zeigt dieselbe Zahl wie mc.d2WrLabel. Das Kuerzel '
           + '„D2-WR" bleibt, der Hinweis haengt an der Zeile.' },

    { datei: 'js/app-meta-call.js', schluessel: 'mc.recAvgWr',
      konvention: 'mitUnentschieden', marken: ['_wrKurzform'],
      grund: 'avgWR = expWin/Runden = Summe(Anteil · pWin), also der Anteil gewonnener '
           + 'Partien an allen gespielten. Drei Fundstellen: Spaltenkopf, Kopf der '
           + 'Empfehlungsspalte auf dem Bild, und die Legende im Bildfuss — auf dem '
           + 'Bild gibt es keinen title, deshalb dort die Legende.' },

    { datei: 'js/app-meta-call.js', schluessel: 'mc.day1WinRate',
      konvention: 'mitUnentschieden', marken: ['_wrKurzform'],
      grund: 'Dieselbe Groesse auf dem Day-2-Bild. Unter der Kachel steht dort eine '
           + 'Matchup-Spalte mit S/(S+N) — die Legende im Fuss nennt beide.' },

    { datei: 'js/app-meta-call.js', schluessel: 'mc.tipReasonWr',
      konvention: 'mitUnentschieden', marken: ['_wrVollname'],
      grund: 'r.value ist lm.winPct = _labsDeckWr(r, "") = S/(S+N+U). Der Satz ist '
           + 'selbst der Hinweis, also der volle Name.' },

    { datei: 'js/app-meta-call.js', schluessel: 'mc.intelTgWr',
      konvention: 'mitUnentschieden', marken: ['_wrKurzform'],
      grund: 'Die Kachel zeigt den handgesetzten Wert, den getMatchup als pWin '
           + 'einsetzt. Die Kachel traegt den Hinweis ueber _intelStatTile.' },

    { datei: 'js/app-meta-call.js', schluessel: 'mc.frozenColWinPct',
      konvention: 'mitUnentschieden', marken: ['_frozenWrBegriff'],
      grund: 'Eingefrorenes Meta: die Spalte rechnet agg.wins / games. Behandelt seit '
           + 'dem 07.09.2026 durch _frozenWrBegriff (Befund B1).' },
    { datei: 'js/app-meta-call.js', schluessel: 'mc.frozenColScoreHint',
      konvention: 'mitUnentschieden', marken: ['_frozenWrBegriff'], grund: 'dito.' },
    { datei: 'js/app-meta-call.js', schluessel: 'mc.frozenBannerHint',
      konvention: 'mitUnentschieden', marken: ['_frozenWrBegriff'], grund: 'dito.' },
    { datei: 'js/app-meta-call.js', schluessel: 'mc.frozenRecHint',
      konvention: 'mitUnentschieden', marken: ['_frozenWrBegriff'], grund: 'dito.' },

    { datei: 'js/app-past-meta.js', schluessel: 'pm.matchupColWinPct',
      konvention: 'matchpunkte', marken: ["hinweis('matchpunkte')"], fenster: 3000,
      grund: 'Die Spalte liest vs_win_pct; nachgerechnet in '
           + 'tests/unit/test-w2-quellen-konventionen.js ist das (3S+U)/(3n). „Win %" '
           + 'ist genau der Name, den js/win-rate-konvention.js dafuer vergibt — hier '
           + 'ist der Wortlaut also RICHTIG und bleibt. Das Fenster ist weit, weil '
           + 'Kopf und Hinweis in dieser Funktion 25 Zeilen auseinanderliegen.' },

    { datei: 'js/app-past-meta.js', schluessel: 'pm.perfStatWinPct',
      konvention: 'matchpunkte', marken: ['matchpunkte'],
      grund: 'Die Kachel ruft WK.KONVENTIONEN.matchpunkte.rechne() auf. Auch hier ist '
           + '„Win %" der richtige Name; die Kachel nennt zusaetzlich, dass der Reiter '
           + '„Deck-Analyse" aus derselben Datei S/(S+N+U) rechnet.' },

    { datei: 'js/app-deck-builder.js', schluessel: 'buildInfo.techIdeenOhneEintrag',
      konvention: 'ohneUnentschieden', marken: ['_konvName'],
      grund: 'Nur der Platzhalter {wr} traegt den Hausnamen. Der Wert ist g.quote aus '
           + 'js/tech-ideen.js, also die Spalte win_rate von '
           + 'data/limitless_online_decks_matchups.csv = S/(S+N). Der Name steht '
           + 'einmal am Ende der Aufzaehlung, die Formel als title am Absatz.' },
];

/* IN EINER UEBERSETZUNG IST „WR" SEHR WOHL EIN FUND.
   Im Quelltext steckt das Kuerzel in Dutzenden Klassennamen
   (mc-enc-wr, mc-rec-reason-wr) — dort wird es deshalb nur ueber
   Pruefung 2 verfolgt, die nach einer BESCHRIFTETEN ZAHL sucht. Eine
   Zeile in js/i18n.js ist dagegen ausschliesslich angezeigter Text:
   steht dort „WR", ist es eine Beschriftung und braucht eine
   Konvention. Der Platzhalter {wr} zaehlt mit — er wird durch eine
   Quote ersetzt. */
const VERBOTEN_I18N = new RegExp(VERBOTEN.source + '|\\bWR\\b', 'i');

/** Wortlaute aus js/i18n.js, beide Sprachen. */
function wortlaute() {
    const i18n = lies('js/i18n.js');
    const raus = {};
    const re = /'([a-z][A-Za-z0-9]*\.[A-Za-z0-9_.]+)':\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g;
    let m;
    while ((m = re.exec(i18n))) {
        (raus[m[1]] = raus[m[1]] || []).push(m[2].slice(1, -1));
    }
    return raus;
}

/** Schluessel mit Hausnamen, die eine der fuenf Dateien wirklich benutzt. */
function betroffeneSchluessel() {
    const w = wortlaute();
    const raus = [];
    for (const datei of DATEIEN) {
        const code = ohneKommentare(lies(datei));
        const gesehen = new Set();
        for (const m of code.matchAll(/t\('([^']+)'\)/g)) {
            if (gesehen.has(m[1])) continue;
            gesehen.add(m[1]);
            const werte = w[m[1]] || [];
            if (werte.some(v => VERBOTEN_I18N.test(v))) raus.push({ datei, schluessel: m[1] });
        }
    }
    return raus;
}

/** Alle Fundstellen eines Schluessels in einer Datei, Kommentare weg. */
function stellen(datei, schluessel) {
    const code = ohneKommentare(lies(datei));
    const marke = `t('${schluessel}')`;
    const raus = [];
    let ab = 0;
    for (;;) {
        const i = code.indexOf(marke, ab);
        if (i < 0) break;
        raus.push({ index: i, zeile: code.slice(0, i).split('\n').length });
        ab = i + 1;
    }
    return { code, raus };
}

describe('W2 — die Namen aus js/i18n.js kommen nicht ungeprueft an', () => {

    it('der Abgleich sieht ueberhaupt Schluessel (sonst besteht er leer)', () => {
        assert.notEqual(betroffeneSchluessel().length, 0,
            'kein einziger i18n-Schluessel mit Hausnamen gefunden — entweder ist '
            + 'js/i18n.js sauber geworden (dann kann dieser Abschnitt weg) oder der '
            + 'Leser findet nichts mehr');
    });

    it('jeder betroffene Schluessel steht im Register', () => {
        const offen = betroffeneSchluessel()
            .filter(s => !REGISTER.some(e => e.datei === s.datei && e.schluessel === s.schluessel))
            .map(s => `${s.datei}  ${s.schluessel}`);
        assert.deepEqual(offen, [],
            'Diese Schluessel tragen in js/i18n.js einen hauseigenen Namen fuer eine '
            + 'Win-Rate und werden von einer der fuenf Dateien angezeigt, ohne dass '
            + 'irgendwo steht, welche Konvention dort gerechnet wird:\n  '
            + offen.join('\n  ')
            + '\n\nOben eintragen: welche Konvention, welches Heilmittel, warum.');
    });

    it('das Register zeigt auf nichts Totes', () => {
        const alle = betroffeneSchluessel();
        const tot = REGISTER
            .filter(e => !alle.some(s => s.datei === e.datei && s.schluessel === e.schluessel))
            .map(e => `${e.datei}  ${e.schluessel}`);
        assert.deepEqual(tot, [],
            'Diese Register-Zeilen decken nichts mehr ab — der Schluessel wird dort '
            + 'nicht mehr benutzt, oder sein Wortlaut traegt keinen Hausnamen mehr:\n  '
            + tot.join('\n  ') + '\n\nLoeschen; eine tote Ausnahme ist eine '
            + 'stillschweigende Erlaubnis.');
    });

    it('an jeder Fundstelle steht wirklich das Heilmittel, das das Register nennt', () => {
        const offen = [];
        for (const e of REGISTER) {
            const { code, raus } = stellen(e.datei, e.schluessel);
            assert.notEqual(raus.length, 0,
                `${e.datei}: t('${e.schluessel}') kommt gar nicht mehr vor — `
                + 'dann ist die Register-Zeile tot');
            const fenster = e.fenster || FENSTER;
            let ohne = 0;
            for (const s of raus) {
                const umfeld = code.slice(Math.max(0, s.index - fenster), s.index + fenster);
                if (!e.marken.some(m => umfeld.includes(m))) {
                    ohne += 1;
                    if (ohne > (e.ohneMarke || 0)) {
                        offen.push(`${e.datei}:${s.zeile}  t('${e.schluessel}') — keine `
                            + `der Marken [${e.marken.join(', ')}] im Umkreis`);
                    }
                }
            }
            const erwartet = e.ohneMarke || 0;
            if (ohne !== erwartet) {
                offen.push(`${e.datei}  ${e.schluessel}: ${ohne} Fundstelle(n) ohne `
                    + `Heilmittel, das Register sagt ${erwartet}`);
            }
        }
        assert.deepEqual(offen, [],
            'Das Register behauptet ein Heilmittel, das an der Fundstelle nicht '
            + 'steht:\n  ' + offen.join('\n  '));
    });

    it('jede genannte Konvention gibt es wirklich, und „Win %" bleibt reserviert', () => {
        const src = lies('js/win-rate-konvention.js');
        const win = { getLang: () => 'de' };
        const WK = new Function('window', src + '\nreturn window.WinRateKonvention;')(win);
        for (const e of REGISTER) {
            if (e.konvention == null) continue;
            assert.ok(WK.hol(e.konvention),
                `${e.schluessel}: die Konvention „${e.konvention}" gibt es nicht`);
        }
        // Kein Register-Eintrag darf eine Nicht-Matchpunkte-Zahl „Win %" nennen.
        assert.equal(WK.kurz('matchpunkte'), 'Win %');
        for (const id of ['mitUnentschieden', 'ohneUnentschieden']) {
            assert.notEqual(WK.kurz(id), 'Win %',
                `${id} traegt den fuer Matchpunkte reservierten Namen`);
        }
    });
});

/* ══ 4. STELLEN, DIE SICH NICHT BILLIG RENDERN LASSEN ═════════════
 *
 * Fuenf Fundstellen haengen an Renderfunktionen von mehreren hundert
 * Zeilen (renderRecommendationsPanel, exportDay2ShareImage,
 * renderMatchupMatrix …). Sie im Test auszufuehren hiesse, ihr halbes
 * Umfeld nachzubauen — und ein Nachbau prueft am Ende sich selbst.
 *
 * WAS HIER GEPRUEFT WIRD, IST DESHALB DIE FORM DER STELLE, und das
 * steht so hier, statt es als Ausfuehrung auszugeben. Die Mutationsprobe
 * vom 08.09.2026 hat gezeigt, dass es noetig ist: fuenf zurueckgedrehte
 * Aenderungen liefen ohne diesen Abschnitt gruen durch.
 *
 * Jede Zeile ist ein Vertrag mit genau einer Stelle. Faellt sie, ist
 * entweder die Stelle umgebaut (dann gehoert der Vertrag nachgezogen)
 * oder der Hinweis ist weg (dann ist es ein Fehler).
 */
const VERTRAEGE = [
    { datei: 'js/app-meta-call.js',
      was: 'die Verlaufszeile („D2-WR") haengt ihren Hinweis an',
      muster: /class="mc-rec-history-line" title="\$\{esc\(_titelVerlauf\)\}" data-hinweis="\$\{esc\(_titelVerlauf\)\}"/ },
    { datei: 'js/app-meta-call.js',
      was: 'und dieser Hinweis kommt aus dem Konventionsmodul',
      muster: /const _titelVerlauf = r\.d2WrPct != null\s*\n\s*\? t\('mc\.d2ConvTooltip'\) \+ '  ' \+ _wrKonventionsTitel\('mitUnentschieden'\)/ },

    { datei: 'js/app-meta-call.js',
      was: 'der Satz ueber dem Override-Kasten traegt den Hinweis der manuellen Spalte',
      muster: /title="\$\{esc\(_titelManuell\)\}" data-hinweis="\$\{esc\(_titelManuell\)\}">\$\{t\('mc\.overrideHint'\)\}/ },

    { datei: 'js/app-meta-call.js',
      was: 'genau EIN geteiltes Bild kommt ohne Konventionslegende aus (das Feldbild '
         + 'zeigt Anteile und Listenzahlen, keine Quote)',
      zaehle: '_paintFooter(ctx, W, H);', anzahl: 1 },
    { datei: 'js/app-meta-call.js',
      was: 'die beiden Bilder MIT Quote tragen eine Legende',
      zaehle: '_paintFooter(ctx, W, H, _wrLegende([', anzahl: 2 },
    { datei: 'js/app-meta-call.js',
      was: 'die Legende des Feld+Empfehlungs-Bildes nennt fuer „Ø WR" die Konvention, '
         + 'die dort gerechnet wird (avgWR = expWin/Runden = Summe(Anteil · pWin))',
      muster: /\{ was: _wrKurzform\(t\('mc\.recAvgWr'\)\), konvention: 'mitUnentschieden' \}/ },
    { datei: 'js/app-meta-call.js',
      was: 'und die des Day-2-Bildes fuer die grosse Kachel dieselbe',
      muster: /\{ was: _wrKurzform\(t\('mc\.day1WinRate'\)\), konvention: 'mitUnentschieden' \}/ },
    { datei: 'js/app-meta-call.js',
      was: 'die Legende des Day-2-Bildes nennt BEIDE Konventionen, die darauf stehen',
      muster: /_wrLegende\(\[\s*\n\s*\{[^}]*konvention: 'mitUnentschieden' \},\s*\n\s*\{[^}]*konvention: 'ohneUnentschieden' \},\s*\n\s*\]\)/ },

    { datei: 'js/app-past-meta.js',
      was: 'der Spaltenkopf „Win %" der Matchup-Tabelle traegt seinen Hinweis',
      muster: /<th title="\$\{wrTitel\.replace\(\/"\/g, '&quot;'\)\}">\$\{headerWr\}<\/th>/ },
    { datei: 'js/app-past-meta.js',
      was: 'und dieser Hinweis ist der der Konvention MATCHPUNKTE — der einzigen, '
         + 'die „Win %" heissen darf',
      muster: /const wrTitel = wkMatch \? wkMatch\.hinweis\('matchpunkte'\) : ''/ },

    { datei: 'js/app-deck-builder.js',
      was: 'der Lueckensatz der Tech-Ideen nennt die Konvention seiner Quoten',
      muster: /\+ \(_konvName \? ' — ' \+ _konvName \+ '\.' : ''\);/ },
    { datei: 'js/app-deck-builder.js',
      was: 'und holt sie aus dem Modul, statt sie hinzuschreiben',
      muster: /const _konvName = _wkLuecke \? _wkLuecke\.kurz\('ohneUnentschieden'\) : '';/ },
    { datei: 'js/app-deck-builder.js',
      was: 'die Formel haengt als Hinweis am Absatz',
      muster: /if \(_konvHinweis\) p\.title = _konvHinweis;/ },
];

describe('W2 — die Stellen, die sich nicht billig rendern lassen', () => {

    it('jede haelt ihren Vertrag', () => {
        const offen = [];
        for (const v of VERTRAEGE) {
            const code = ohneKommentare(lies(v.datei));
            if (v.muster) {
                if (!v.muster.test(code)) offen.push(`${v.datei}: ${v.was}`);
                continue;
            }
            const n = code.split(v.zaehle).length - 1;
            if (n !== v.anzahl) {
                offen.push(`${v.datei}: ${v.was} — ${n}-mal statt ${v.anzahl}-mal`);
            }
        }
        assert.deepEqual(offen, [],
            'Diese Stellen haben ihren Konventionshinweis verloren oder wurden '
            + 'umgebaut:\n  ' + offen.join('\n  ')
            + '\n\nWurde die Stelle umgebaut, gehoert der Vertrag oben nachgezogen — '
            + 'und zwar erst, nachdem nachgesehen wurde, dass der Hinweis noch da ist.');
    });
});
