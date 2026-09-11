'use strict';
/**
 * EIN NAME FUER EINE FORMEL — NACHGEPRUEFT, NICHT BEHAUPTET.
 *
 * BEFUND B1 der Nachpruefung vom 07.09.2026. Am 05.09.2026 hat der
 * Betreiber "Win %" der Konvention (3S+U)/(3·Matches) zugewiesen — der
 * Bezeichnung, unter der Limitless dieselbe Spalte fuehrt. Der
 * Spaltenkopf im eingefrorenen Meta wurde damals umgestellt, die
 * SAETZE DANEBEN nicht:
 *
 *   js/app-meta-call.js:11435  mc.frozenBannerHint
 *       "... sortiert nach Win % × Day-2-Conversion"
 *   js/app-meta-call.js:11592  mc.frozenRecHint
 *       "... sortiert nach Final-Cumulative-Score (Win % × (1 + ...))"
 *
 * Beide beschreiben die Spalte, die `agg.wins / games` rechnet, also
 * S/(S+N+U) — NICHT die Konvention, die "Win %" heisst. Derselbe Name
 * stand damit auf zwei verschiedenen Formeln.
 *
 * WAS DIESE DATEI PRUEFT
 *
 *   1. AUSGEFUEHRT: die vier Texte der eingefrorenen Ansicht laufen
 *      durch _frozenWrBegriff und tragen danach den Namen, den
 *      js/win-rate-konvention.js fuer die gerechnete Konvention
 *      vergibt — und zwar den, den das MODUL sagt, nicht einen
 *      abgeschriebenen.
 *   2. AUSGEFUEHRT: der Predictor-5.3-Tooltip holt seinen
 *      Konventionsnamen ebenfalls aus dem Modul.
 *   3. AUSGEFUEHRT: die Schaltflaeche des Override-Kastens behaelt beim
 *      Auf- und Zuklappen die Beschriftung aus der Uebersetzung.
 *   4. GEGRIFFEN, aber vollstaendig: ein Suchlauf ueber die vier
 *      zugewiesenen Dateien, der JEDE Zeichenkette ausserhalb von
 *      Kommentaren nach hauseigenen Win-Raten-Begriffen absucht. Jede
 *      Fundstelle, die legitim anders heisst, steht unten in der
 *      POSITIVLISTE mit Begruendung — eine neue faellt durch.
 *
 * Kein jsdom, kein Zugriff auf data/: jede Zusicherung prueft eine
 * Eigenschaft des Codes, keinen Wochenwert.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { ausschnitt, baue } = require('./lib-dom-sandkasten.js');
const { ZAHL_KOMMA_SRC } = require('./lib-zahlkomma-sandkasten.js');
/* zahlKomma() aus js/app-utils.js — im Browser laedt index.html sie vor
   jedem Aufrufer, der Sandkasten muss sie deshalb ebenfalls kennen. */
const zahlKomma = new Function(ZAHL_KOMMA_SRC + '\nreturn zahlKomma;')();

const WURZEL = path.join(__dirname, '..', '..');
const lies = (rel) => fs.readFileSync(path.join(WURZEL, rel), 'utf8');

const MC   = 'js/app-meta-call.js';
const KONV = 'js/win-rate-konvention.js';

/** Das echte Konventionsmodul in einem Kontext, kein Nachbau. */
function konventionen(sprache) {
    const sb = { console, getLang: () => (sprache || 'de') };
    sb.window = sb;
    sb.globalThis = sb;
    vm.createContext(sb);
    vm.runInContext(lies(KONV), sb, { filename: KONV });
    assert.ok(sb.WinRateKonvention, KONV + ' gibt nichts nach aussen');
    return sb;
}

/* ══ 1. DIE VIER TEXTE DER EINGEFRORENEN ANSICHT ══════════════════ */

/**
 * renderFrozenBanner + renderFrozenRecommendationsPanel mit dem ECHTEN
 * Konventionsmodul und selbst gesetzten Uebersetzungen.
 */
function frozenUmgebung(sprache, texte) {
    const k = konventionen(sprache);
    const ctx = baue(MC, [
        'function _frozenWrBegriff(text)',
        'function _frozenWrHinweis()',
        'function renderFrozenBanner()',
        'function renderFrozenRecommendationsPanel()',
    ], {
        window: { WinRateKonvention: k.WinRateKonvention, ArchetypeIcons: undefined,
                  expandPastMetaCode: undefined, zahlLokal: (n) => String(n) },
        getLang: () => (sprache || 'de'),
        t: (key) => (key in texte ? texte[key] : key),
        esc: (s) => String(s),
        zahlLokal: (n) => String(n),
        _pastMetaFormatKey: 'TEF-CRI',
        _pastMetaLabsCache: new Map(),
        zahlKomma,
        _frozenD2Hinweis: () => 'D2',
        _mcPz: () => ' %',
    });
    ctx.window.zahlLokal = (n) => String(n);
    return { ctx, K: k.WinRateKonvention };
}

describe('B1 — die Saetze neben der Spalte tragen denselben Namen wie die Spalte', () => {

    it('das Modul haelt „Win %" fuer die Matchpunkte-Konvention reserviert', () => {
        const de = konventionen('de').WinRateKonvention;
        assert.equal(de.kurz('matchpunkte'), 'Win %',
            'der reservierte Name ist nicht mehr Win % — dann muss dieser Test '
            + 'und jeder Text, der ihn meidet, nachgezogen werden');
        assert.notEqual(de.kurz('mitUnentschieden'), 'Win %',
            'zwei Konventionen tragen denselben Namen — genau der Fehler, gegen '
            + 'den js/win-rate-konvention.js geschrieben wurde');
    });

    it('das Banner nennt nicht mehr „Win %", sondern die gerechnete Konvention', () => {
        const { ctx, K } = frozenUmgebung('de', {
            'mc.frozenBannerTitle': 'Fun-Event-Modus',
            'mc.frozenBannerHint': 'Du siehst die finale Brought-Share-Tabelle + die '
                + 'historische Top-10 sortiert nach Win % × Day-2-Conversion.',
        });
        const html = ctx.renderFrozenBanner();
        assert.ok(!/Win\s?%/.test(html),
            'im Banner steht weiterhin „Win %" ueber einer Spalte, die S/(S+N+U) '
            + 'rechnet:\n' + html);
        assert.ok(html.includes(K.kurz('mitUnentschieden')),
            'der Name der gerechneten Konvention steht nicht im Banner:\n' + html);
    });

    it('auch in englischer Oberflaeche, und mit dem englischen Kurznamen', () => {
        const { ctx, K } = frozenUmgebung('en', {
            'mc.frozenBannerTitle': 'Fun event mode',
            'mc.frozenBannerHint': 'you are seeing final brought-share + the historical '
                + 'Top-10 ranked by win % × Day-2 conversion.',
        });
        const html = ctx.renderFrozenBanner();
        assert.ok(!/win\s?%/i.test(html), 'englischer Text nennt weiter win %:\n' + html);
        assert.equal(K.kurz('mitUnentschieden'), 'Win share incl. ties');
        assert.ok(html.includes('Win share incl. ties'),
            'der englische Kurzname fehlt:\n' + html);
    });

    it('Hinweis, Spaltenkopf und Score-Tooltip der Tabelle ebenso', () => {
        const { ctx, K } = frozenUmgebung('de', {
            'mc.frozenRecPanelTitle': 'Top-Decks',
            'mc.frozenRecBadge': 'Fun',
            'mc.frozenRecHint': 'Top-Decks dieses geschlossenen Metas, sortiert nach '
                + 'Final-Cumulative-Score (Win % × (1 + Day-2-Conversion)).',
            'mc.frozenRecTournHint': '{n} Major-Turniere, Top {archetypes}',
            'mc.frozenColScore': 'Score',
            'mc.frozenColScoreHint': 'Score = Siege je Match × (1 + Day-2-Conversion).',
            'mc.frozenColWinPct': 'Siege je Match',
            'mc.frozenColDay2Conv': 'Day 2',
            'mc.frozenColPlayers': 'Spieler',
            'mc.recDeck': 'Deck',
        });
        ctx._pastMetaLabsCache.set('TEF-CRI', {
            tournamentCount: 4,
            archetypes: [{ name: 'Dragapult', winPct: 48.6, day2Conv: 0.31,
                           players: 300, score: 63.7 }],
        });
        const html = ctx.renderFrozenRecommendationsPanel();
        const name = K.kurz('mitUnentschieden');
        assert.ok(!/Win\s?%/i.test(html), 'die Tabelle nennt weiter Win %:\n' + html);
        assert.ok(!/Siege\s+je\s+Match/i.test(html),
            'der zurueckgezogene Hausbegriff „Siege je Match" steht noch da:\n' + html);
        // Dreimal: Hinweis ueber der Tabelle, Score-Tooltip, Spaltenkopf.
        const treffer = html.split(name).length - 1;
        assert.equal(treffer, 3,
            `der Konventionsname steht ${treffer}-mal statt dreimal (Hinweis, `
            + `Score-Tooltip, Spaltenkopf):\n` + html);
    });

    it('ohne das Modul wird nichts erfunden — der Text bleibt, wie er kam', () => {
        const ctx = baue(MC, ['function _frozenWrBegriff(text)'], { window: {} });
        assert.equal(ctx._frozenWrBegriff('sortiert nach Win %'), 'sortiert nach Win %');
        assert.equal(ctx._frozenWrBegriff(null), '');
    });
});

/* ══ 2. DER PREDICTOR-5.3-TOOLTIP ═════════════════════════════════ */

describe('B1 — der Konventionsname im Predictor-5.3-Tooltip kommt aus dem Modul', () => {

    it('deutscher Tooltip nennt Formel UND Kurznamen aus js/win-rate-konvention.js', () => {
        const quelle = lies(MC);
        const stelle = quelle.indexOf("const konvNameRoh =");
        assert.ok(stelle > 0, 'der Name wird nicht mehr aus dem Modul geholt');
        const block = quelle.slice(stelle, stelle + 400);
        assert.ok(block.includes("WinRateKonvention.kurz('ohneUnentschieden')"),
            'der Kurzname kommt nicht aus kurz(ohneUnentschieden):\n' + block);
        // Und er wird auch wirklich in beide Saetze eingesetzt.
        assert.ok(quelle.includes("' + konv + ' (' + konvName + ')"),
            'der deutsche Satz setzt den Modulnamen nicht ein');
        assert.ok(quelle.includes("' + konv + ' convention (' + konvName + ')"),
            'der englische Satz setzt den Modulnamen nicht ein');
        assert.ok(!quelle.includes("(Siegquote ohne Unentschieden). Nur diese"),
            'der abgeschriebene Name steht noch im deutschen Satz');
        assert.ok(!quelle.includes("(win share excluding ties). Only that"),
            'der abgeschriebene Name steht noch im englischen Satz');
    });
});

/* ══ 3. DIE SCHALTFLAECHE DES OVERRIDE-KASTENS ════════════════════ */

describe('B1 — der Umschalter behaelt die uebersetzte Beschriftung', () => {

    function schalter(sprache, label) {
        const knopf = { id: 'mc-override-btn', textContent: label };
        const panel = {
            classList: {
                _offen: false,
                toggle() { this._offen = !this._offen; return this._offen; },
            },
            innerHTML: '',
        };
        const ctx = baue(MC, ['function _toggleOverrides()'], {
            document: { getElementById: (id) => (id === 'mc-override-panel' ? panel : knopf) },
            t: () => label,
            _settings: { myDeck: '' },
            renderOverrideTable: () => '',
        });
        return { ctx, knopf };
    }

    it('deutsch: nur der Pfeil dreht sich', () => {
        const { ctx, knopf } = schalter('de', 'Win Rates anpassen ▼');
        ctx._toggleOverrides();
        assert.equal(knopf.textContent, 'Win Rates anpassen ▲');
        ctx._toggleOverrides();
        assert.equal(knopf.textContent, 'Win Rates anpassen ▼');
    });

    it('englisch: es bleibt englisch', () => {
        const { ctx, knopf } = schalter('en', 'Adjust Win Rates ▼');
        ctx._toggleOverrides();
        assert.equal(knopf.textContent, 'Adjust Win Rates ▲',
            'der Umschalter schrieb eine fest verdrahtete deutsche Beschriftung');
    });
});

/* ══ 4. DER SUCHLAUF ══════════════════════════════════════════════ */

const DATEIEN = [
    'js/app-meta-call.js',
    'js/app-deck-builder.js',
    'js/deck-builder-consistency.js',
    'js/app-past-meta.js',
];

/**
 * Alle Zeichenketten-Literale einer Datei AUSSERHALB von Kommentaren.
 *
 * Zwei Fallen, die eine naive Fassung reissen — beide stecken in
 * js/app-meta-call.js und beide wurden beim Bau dieses Tests
 * aufgedeckt:
 *
 *   1. VERSCHACHTELTE Vorlagen. In Zeile 11324 steht
 *      `${isMine ? `<span …>` : ''}` — ein Backtick INNERHALB von ${}.
 *      Wer ihn fuer das Ende der aeusseren Vorlage haelt, laeuft ab
 *      dort um eine Zeichenkette versetzt und liest danach Kommentare
 *      als Text. Deshalb ein Moduskeller statt eines Schalters.
 *   2. Regex-Literale. Ein /['"]/ verschluckt sonst den halben Rest
 *      der Datei.
 *
 * Was in ${} steht, ist CODE und kein angezeigter Text — Bezeichner
 * wie `_winRateOverrides` oder der Schluessel 'mc.adjustWinRates'
 * duerfen den Suchlauf nicht ausloesen. Genau das faellt mit dem
 * Moduskeller von selbst heraus.
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
                keller.push({ art: 'code', tiefe: 0 }); i += 2; continue;
            }
            if (c === '\n') zeile++;
            oben.buf += c; i++; continue;
        }
        // ── Codemodus ──
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

/* Hauseigene Namen fuer eine Win-Rate. Sie duerfen in ANGEZEIGTEM Text
   nicht vorkommen: den Namen vergibt js/win-rate-konvention.js, und nur
   dort. Die Abkuerzung "WR" steht bewusst NICHT darin — sie ist im Haus
   kein Konventionsname, sondern ein Kuerzel, das seine Konvention als
   title mitfuehrt (_wrChip, _wrKonventionsTitel), und sie steckt in
   Dutzenden CSS-Klassennamen. */
const VERBOTEN = /Win\s?%|Win\s?Rate|Win-Rate|Winrate|Siegrate|Siegquote|Siegesquote|Gewinnrate|Erfolgsquote|Siege je Match|Wins per game|Win share/i;

/** i18n-Schluessel wie 'mc.frozenColWinPct' sind kein angezeigter Text. */
const IST_SCHLUESSEL = /^[a-z][A-Za-z0-9]*\.[A-Za-z0-9_.]+$/;

/**
 * Fundstellen, die legitim anders heissen. Schluessel ist der WORTLAUT
 * (Anfang) der Zeichenkette, nicht die Zeilennummer — die verschiebt
 * sich bei jeder Aenderung, der Wortlaut nicht.
 */
const POSITIVLISTE = [
    /* AUSGETRAGEN AM 08.09.2026 — siehe die gleichlautende Notiz in
       tests/unit/test-w2-hausnamen.js: der console.log des Predictors
       6.2 in js/app-meta-call.js traegt keinen Hausnamen mehr, sondern
       holt den Namen zur Laufzeit aus dem Konventionsmodul. Die
       Ausnahme deckte nichts mehr ab. */
    {
        datei: 'js/app-meta-call.js',
        beginnt: 'Siegquote ohne Unentschieden',
        grund: 'Rueckfall neben WinRateKonvention.kurz(ohneUnentschieden): greift '
             + 'nur, wenn das Modul gar nicht geladen ist, und nennt dann genau '
             + 'den Namen, den das Modul vergeben haette.',
    },
    {
        datei: 'js/app-meta-call.js',
        beginnt: 'Win share excluding ties',
        grund: 'derselbe Rueckfall, englisch.',
    },
    {
        datei: 'js/app-past-meta.js',
        beginnt: 'Win %',
        grund: 'Rueckfall fuer t(pm.matchupColWinPct). Die Spalte ist an '
             + 'data/labs_tournament_matchups.csv als Matchpunkte nachgewiesen '
             + '(siehe die Notiz darueber), und ihr Tooltip kommt aus '
             + 'WinRateKonvention.hinweis(matchpunkte) — "Win %" ist genau der '
             + 'Name, den das Modul dafuer vergibt.',
    },
    {
        datei: 'js/app-past-meta.js',
        beginnt: 'Cumulative Win %',
        grund: 'Rueckfall fuer t(pm.perfStatWinPct). Diese Kachel rechnet '
             + 'wirklich Matchpunkte (WK.KONVENTIONEN.matchpunkte.rechne), und '
             + '"Win %" ist genau deren reservierter Name.',
    },

{
        datei: 'js/app-meta-call.js',
        beginnt: 'das ist NICHT die Größe',
        grund: 'Abgrenzungssatz unter der Erwartungstabelle „Dein Deck gegen das '
             + 'Meta". Er vergibt keinen Namen, sondern nimmt einen weg: die Quote '
             + 'darueber rechnet S/(S+N), und der Satz sagt ausdruecklich, dass das '
             + 'NICHT die Matchpunkte sind, die Limitless „Win %" nennt. Stand bis '
             + 'zum 11.09.2026 in js/ds-ev-rechner.js (entfallen). '
             + 'tests/unit/test-w3-ev-und-abschnitt.js laesst genau EINE solche '
             + 'Fundstelle zu — eine zweite waere keine Abgrenzung mehr.',
    },
];

function erlaubt(datei, text) {
    return POSITIVLISTE.some(e => e.datei === datei && text.startsWith(e.beginnt));
}

describe('B1 — kein hauseigener Name fuer eine Win-Rate im angezeigten Text', () => {

    it('der Suchlauf sieht ueberhaupt etwas (sonst besteht er leer)', () => {
        const alle = literale(lies(MC));
        assert.ok(alle.length > 500,
            `nur ${alle.length} Zeichenketten in ${MC} gefunden — der Leser ist `
            + 'kaputt, und dann faellt dieser Suchlauf still aus');
        assert.ok(alle.some(l => l.text.includes('mc.frozenColWinPct')),
            'eine bekannte Zeichenkette fehlt — der Leser ueberspringt zu viel');
    });

    it('jede Fundstelle steht in der Positivliste oder ist ein Fehler', () => {
        const funde = [];
        for (const datei of DATEIEN) {
            for (const l of literale(lies(datei))) {
                const text = l.text.trim();
                if (!VERBOTEN.test(text)) continue;
                if (IST_SCHLUESSEL.test(text)) continue;
                if (erlaubt(datei, text)) continue;
                funde.push(`${datei}:${l.zeile}  ${text.slice(0, 160).replace(/\n/g, ' ')}`);
            }
        }
        assert.deepEqual(funde, [],
            'Diese angezeigten Texte vergeben einen eigenen Namen fuer eine '
            + 'Win-Rate:\n  ' + funde.join('\n  ')
            + '\n\nDen Namen vergibt js/win-rate-konvention.js. Entweder ueber '
            + 'WinRateKonvention.kurz(<konvention>) holen — oder, wenn die '
            + 'Fundstelle legitim anders heisst, oben in die POSITIVLISTE '
            + 'eintragen und in einem Satz begruenden.');
    });

    it('die Positivliste zeigt auf nichts Totes', () => {
        const tot = POSITIVLISTE.filter(e => {
            const treffer = literale(lies(e.datei))
                .some(l => l.text.trim().startsWith(e.beginnt));
            return !treffer;
        }).map(e => e.datei + ' :: ' + e.beginnt);
        assert.deepEqual(tot, [],
            'Diese Eintraege der Positivliste gibt es im Quelltext nicht mehr — '
            + 'austragen, sonst deckt die Liste irgendwann etwas ab, das niemand '
            + 'mehr geprueft hat.');
    });
});
