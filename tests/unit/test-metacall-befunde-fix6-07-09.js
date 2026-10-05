/**
 * Die fuenf Befunde der unabhaengigen Abnahme des Meta Calls
 * (07.09.2026) und die drei Zusicherungsluecken, die der
 * Mutationslauf derselben Abnahme gefunden hat.
 *
 * Der Rahmen: der Betreiber spielt am 26.09.2026 in Frankfurt,
 * TEF-PBL, rund 2.700 Spieler, Mega Excadrill, Ziel Day 2. Die
 * Reparatur des Meta Calls war abgenommen, die 16,2 % waren aus den
 * Rohdaten unabhaengig nachgerechnet. Was danach uebrig blieb, war
 * nicht falsche Arithmetik, sondern eine Anzeige, die mehr behauptet
 * als sie leistet:
 *
 *   B1  Die Stichprobe nannte `data/online_fenster.json` als Quelle.
 *       Diese Datei gibt es nicht — gelesen wird
 *       data/limitless_online_fenster_meta.json. Eine Quellenangabe,
 *       die ins Leere zeigt, ist nicht nachpruefbar.
 *   B2  Die Day-2-Chance haengt nicht von der Spielerzahl ab (1, 2,
 *       100, 2.700 und 9.999 Spieler ergeben dieselbe Zahl). Die
 *       Unterzeile stellte die Spielerzahl trotzdem neben Runden und
 *       Punkteziel, als waere sie eine dritte Eingabe.
 *   B3  Die acht Runden sind bei Major-Typen eine Eingabe, keine
 *       Ableitung — `_suggestSwissRounds` laeuft dort nicht. Nirgends
 *       stand das.
 *   B4  Die Mischung der Paarungsquellen (Papier gegen Online) und der
 *       Piloten-Daempfer aus Predictor 5.3 standen nur im Quelltext
 *       bzw. in der Konsole.
 *   B5  Die Zusicherung "alle drei Zahlenfelder melden das Verlassen"
 *       prueft Textvorkommen; der bei Major-Typen gerenderte
 *       mc-rounds-<select> trug kein solches onchange.
 *
 * Und die drei ueberlebenden Mutationen:
 *
 *   M-05  `val > max` -> `val >= max` ueberlebte: es fehlten die
 *         Randwerte 9.999 Spieler, 2 Spieler und genau rounds*3 Punkte.
 *   M-11  MATCHUP_BLEND_WEIGHT_DAY2 0,45 -> 0,55 ueberlebte: die
 *         Gewichtung, aus der die 16,2 % ueberhaupt entstehen, war von
 *         keiner Zusicherung gedeckt. tests/unit/test-meta-call-matchup-blend.js
 *         SPIEGELT die Konstanten, statt sie zu lesen — der Spiegel
 *         bleibt gruen, wenn das Original sich bewegt.
 *   M-15  Die begruendete Trennung "beim Tippen nur die Obergrenze"
 *         war an `_klemmeEinstellung` geprueft, nicht am Aufruf in
 *         `_onSetting`.
 *
 * Geprueft wird, wo immer moeglich, VERHALTEN: die betroffenen Bloecke
 * werden aus der Quelle geschnitten und mit Attrappen ausgefuehrt.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'app-meta-call.js'), 'utf8');

/* Schneidet von `von` bis AUSSCHLIESSLICH `bis`. */
function schnittOhne(von, bis, ab) {
    const a = SRC.indexOf(von, ab || 0);
    assert.ok(a > -1, `Schnittanfang nicht gefunden: ${von}`);
    const b = SRC.indexOf(bis, a + von.length);
    assert.ok(b > a, `Schnittende nicht gefunden: ${bis}`);
    return SRC.slice(a, b);
}

/* Schneidet von `von` bis EINSCHLIESSLICH `bis`. */
function schnitt(von, bis, ab) {
    const a = SRC.indexOf(von, ab || 0);
    assert.ok(a > -1, `Schnittanfang nicht gefunden: ${von}`);
    const b = SRC.indexOf(bis, a + von.length);
    assert.ok(b > a, `Schnittende nicht gefunden: ${bis}`);
    return SRC.slice(a, b + bis.length);
}

/* Blockkommentare weg — ein Pfad in einem Kommentar ist kein
   Oberflaechentext. Der Befund B1 wird im Modul erklaert und nennt
   dabei den alten, falschen Namen. */
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

/* Schneidet eine ganze Funktion ueber Klammernzaehlung. */
function funktion(kopf) {
    const a = SRC.indexOf(kopf);
    assert.ok(a > -1, `Funktion nicht gefunden: ${kopf}`);
    let i = SRC.indexOf('{', a), tiefe = 0, ende = -1;
    for (; i < SRC.length; i++) {
        if (SRC[i] === '{') tiefe++;
        else if (SRC[i] === '}') { tiefe--; if (tiefe === 0) { ende = i; break; } }
    }
    assert.ok(ende > a, `Funktionsende nicht gefunden: ${kopf}`);
    return SRC.slice(a, ende + 1);
}

/* Liest eine Zahlenkonstante AUS DER QUELLE. Genau darin liegt der
   Unterschied zu einem gespiegelten Wert: wer die Konstante im Modul
   aendert, aendert damit auch das, was hier geprueft wird — und faellt
   an der Zusicherung auf, die den erwarteten Wert festhaelt. */
function quellKonstante(name) {
    const m = SRC.match(new RegExp('const\\s+' + name + '\\s*=\\s*([0-9]*\\.?[0-9]+)\\s*;'));
    assert.ok(m, `Konstante nicht gefunden: ${name}`);
    return parseFloat(m[1]);
}

const zahlLokal = (n) => new Intl.NumberFormat('de-DE').format(n);
const esc = (s) => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* Die Oberflaechentexte des Moduls in der Sprache, in der sie im
   Browser stehen. Nur die Schluessel, die die geprueften Bloecke
   wirklich benutzen. */
const DE = {
    'mc.ptsAbbr': 'Pkt.', 'mc.roundsAbbr': 'Runden', 'mc.labelPlayers': 'Spieler',
};
const EN = {
    'mc.ptsAbbr': 'Pts.', 'mc.roundsAbbr': 'rounds', 'mc.labelPlayers': 'Players',
};
const tDe = (k) => (k in DE ? DE[k] : k);
const tEn = (k) => (k in EN ? EN[k] : k);
const _mcNum = (n, dp) => Number(n).toFixed(dp).replace('.', ',');
const _mcNumEn = (n, dp) => Number(n).toFixed(dp);
const _mcPzDe = () => ' %';
const _mcPzEn = () => '%';

// ───────────────────────────────────────────────────────────────────
// B1 — die Quellenangabe zeigt auf eine Datei, die es gibt
// ───────────────────────────────────────────────────────────────────
describe('B1 — jeder im Modul genannte Datenpfad existiert wirklich', () => {
    /* Kommentare sind kein Oberflaechentext: der Befund selbst wird im
       Modul erklaert und nennt dabei den falschen alten Namen. Was
       geprueft wird, sind die Pfade in ausgefuehrtem Code — also alles
       ausserhalb der Kommentare. */
    function pfadeOhneKommentare() {
        const ohne = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
        return [...new Set(ohne.match(/data\/[A-Za-z0-9_\-.\/]+\.(?:json|csv|md)\b/g) || [])].sort();
    }

    it('es gibt ueberhaupt Pfade zu pruefen — sonst prueft die Zusicherung nichts', () => {
        assert.ok(pfadeOhneKommentare().length >= 15,
            'der Pfadfund ist zusammengebrochen; die Zusicherung waere leer und damit wertlos');
    });

    it('jeder genannte Pfad liegt im Arbeitsbaum', () => {
        const fehlend = pfadeOhneKommentare().filter(p => !fs.existsSync(path.join(ROOT, p)));
        assert.deepEqual(fehlend, [],
            'ein Dateiname im Code zeigt ins Leere — genau der Befund B1 (data/online_fenster.json)');
    });

    it('die Umfangsdatei steht in EINER Konstante, die auch der Ladepfad benutzt', () => {
        const m = SRC.match(/const FENSTER_META_DATEI = '([^']+)';/);
        assert.ok(m, 'ohne gemeinsame Konstante koennen Ladepfad und Quellenangabe wieder auseinanderlaufen');
        assert.equal(m[1], 'data/limitless_online_fenster_meta.json');
        assert.ok(SRC.includes("fetch(FENSTER_META_DATEI + '?t=' + Date.now())"),
            'der Ladeschritt holt wieder einen eigenen, fest geschriebenen Pfad');
        assert.ok(fs.existsSync(path.join(ROOT, m[1])));
    });

    it('der Tooltip der Stichprobe nennt genau diese Konstante, keinen abgeschriebenen Namen', () => {
        const block = ohneKommentare(schnitt('const stichprobe = (() => {', '})();'));
        assert.ok(block.includes('Direkt aus ${FENSTER_META_DATEI}'),
            'im Tooltip steht wieder ein Dateiname als Text — dann kann er verrotten, ohne dass es auffaellt');
        assert.ok(!/data\/online_fenster\.json/.test(block),
            'der alte, nicht existierende Name ist zurueck');
    });

    it('die Stichprobe zeigt den geladenen Umfang mitsamt der richtigen Quelle', () => {
        const quelle = schnitt('const stichprobe = (() => {', '})();');
        const fn = new Function('_metaSource', '_fensterMeta', 'zahlLokal', 'FENSTER_META_DATEI',
            quelle + '\nreturn stichprobe;')(
            'current',
            { decks_im_fenster: 10330, fenster_tage: 15, fenster_von: '2026-08-22', fenster_bis: '2026-09-06' },
            zahlLokal, 'data/limitless_online_fenster_meta.json');
        assert.match(fn, /10\.330 Decks/);
        assert.match(fn, /data\/limitless_online_fenster_meta\.json/);
    });
});

// ───────────────────────────────────────────────────────────────────
// B2 — die Spielerzahl steht nicht mehr als Rechengroesse da
// ───────────────────────────────────────────────────────────────────
describe('B2 — die Day-2-Chance haengt nachweislich nicht an der Spielerzahl', () => {
    function baueCalcDay2(settings) {
        const quelle = funktion('function calcDay2(field, deckOverride) {');
        const normalize = (n) => (n || '').toLowerCase().replace(/[\s\-']/g, '');
        const paarung = () => ({ pWin: 0.52, pTie: 0.02, pLoss: 0.46 });
        const umstellen = (m, q) => {
            const pTie = Math.max(0, Math.min(0.5, q));
            const rest = 1 - pTie;
            const sn = (m.pWin || 0) + (m.pLoss || 0);
            if (!(sn > 0)) return { pWin: rest / 2, pTie, pLoss: rest / 2 };
            const pWin = (m.pWin / sn) * rest;
            return { pWin, pTie, pLoss: Math.max(0, rest - pWin) };
        };
        return new Function('_settings', 'normalize', 'getMatchup', 'getBaseMatchup',
            '_unentschiedenQuote', '_mitPraesenzUnentschieden',
            quelle + '\nreturn calcDay2;')(
            settings, normalize, paarung, paarung,
            () => ({ quote: 0.1095, partien: 6121, meta: 'TEF-PBL', gemessen: true }),
            umstellen);
    }

    const FELD = [
        { name: 'Dragapult', finalShare: 20 },
        { name: 'Mega Excadrill', finalShare: 15 },
        { name: 'Crustle', finalShare: 65 },
    ];

    it('1, 2, 100, 2.700 und 9.999 Spieler ergeben exakt dieselbe Chance', () => {
        const werte = [1, 2, 100, 2700, 9999].map(n =>
            baueCalcDay2({ rounds: 8, day2Points: 16, totalPlayers: n, myDeck: 'Mega Excadrill' })(FELD).day2Prob);
        werte.forEach((w, i) => assert.equal(w, werte[0],
            `die Spielerzahl ${[1, 2, 100, 2700, 9999][i]} veraendert das Ergebnis — dann gehoert sie in die Unterzeile`));
    });

    it('Runden und Punkteziel veraendern die Chance sehr wohl — die Gegenprobe', () => {
        const basis = baueCalcDay2({ rounds: 8, day2Points: 16, totalPlayers: 2700, myDeck: 'Mega Excadrill' })(FELD).day2Prob;
        const mehrRunden = baueCalcDay2({ rounds: 9, day2Points: 16, totalPlayers: 2700, myDeck: 'Mega Excadrill' })(FELD).day2Prob;
        const hoeheresZiel = baueCalcDay2({ rounds: 8, day2Points: 19, totalPlayers: 2700, myDeck: 'Mega Excadrill' })(FELD).day2Prob;
        assert.notEqual(basis, mehrRunden);
        assert.notEqual(basis, hoeheresZiel);
        assert.ok(hoeheresZiel < basis, 'ein hoeheres Punkteziel muss die Chance senken');
    });

    it('calcDay2 liest `totalPlayers` gar nicht erst', () => {
        const quelle = funktion('function calcDay2(field, deckOverride) {');
        assert.ok(!quelle.includes('totalPlayers'),
            'sobald calcDay2 die Spielerzahl liest, ist die Trennung in der Anzeige eine Luege');
    });
});

describe('B2 — die Unterzeile trennt Rechengroessen von Turnierrahmen', () => {
    function baueZeilen(settings, deutsch) {
        const quelle = funktion('function _day2RechnungsZeile() {')
            + '\n' + funktion('function _day2RahmenZeile() {');
        return new Function('_settings', 't', 'zahlLokal', '_mcIstDeutsch',
            quelle + '\nreturn { rechnung: _day2RechnungsZeile, rahmen: _day2RahmenZeile };')(
            settings, deutsch ? tDe : tEn, zahlLokal, () => deutsch);
    }

    const FRANKFURT = { day2Points: 16, rounds: 8, totalPlayers: 2700 };

    it('die Rechenzeile nennt nur, was in die Kette geht', () => {
        const z = baueZeilen(FRANKFURT, true).rechnung();
        assert.equal(z, '16 Pkt. in 8 Runden');
        assert.ok(!/2\.700|Spieler/.test(z),
            'die Spielerzahl steht wieder neben den Rechengroessen — genau der Befund B2');
    });

    it('die Rahmenzeile weist die Spielerzahl ausdruecklich als NICHT eingehend aus', () => {
        const z = baueZeilen(FRANKFURT, true).rahmen();
        assert.match(z, /2\.700 Spieler/);
        assert.match(z, /geht nicht in diese Chance ein/);
        assert.match(z, /Runden, Punkteziel, Meta-Anteilen und Paarungen/);
    });

    it('auch bei einem einzigen Spieler liest sich die Karte richtig', () => {
        const z = baueZeilen({ day2Points: 16, rounds: 8, totalPlayers: 1 }, true);
        assert.equal(z.rechnung(), '16 Pkt. in 8 Runden');
        assert.match(z.rahmen(), /^Turnierrahmen: 1 Spieler — geht nicht/);
    });

    it('englisch sagt dasselbe', () => {
        const z = baueZeilen(FRANKFURT, false);
        assert.equal(z.rechnung(), '16 Pts. in 8 rounds');
        assert.match(z.rahmen(), /not an input to this chance/);
    });

    it('beide Zeilen stehen wirklich in der Ergebniskachel', () => {
        /* UI-62 (02.10.2026): die Karte ist weg; beide Zeilen stehen im
           aufklappbaren „Rechenweg" der Ergebnis-Uebersicht. */
        assert.ok(SRC.includes('<p class="mc-day2-sub">${_day2RechnungsZeile()}</p>'));
        assert.ok(SRC.includes('<p class="mc-day2-sub mc-day2-rahmen">${_day2RahmenZeile()}</p>'),
            'die Rahmenzeile wird berechnet, aber nicht gezeigt — dann bleibt die Spielerzahl unerklaert');
    });

    it('der alte Schluessel mc.day2Sub wird nicht mehr benutzt', () => {
        assert.ok(!SRC.includes("t('mc.day2Sub')"),
            "mc.day2Sub setzt die Spielerzahl per {n} wieder in die Rechenzeile");
    });
});

describe('B2/B4 — die Sprachweiche selbst fragt die Oberflaeche, statt sie zu behaupten', () => {
    /* Die neuen Saetze stehen deutsch mit englischem Rueckfall im Modul,
       weil js/i18n.js in diesem Durchgang einem anderen Agenten gehoert.
       Damit haengt der englische Zweig an genau einer Funktion — wird
       die zu einer Konstante, verschwindet er lautlos. */
    function baue(lang) {
        const quelle = funktion('function _mcIstDeutsch() {');
        return new Function('getLang', quelle + '\nreturn _mcIstDeutsch;')(lang ? () => lang : undefined);
    }

    it('deutsche Oberflaeche -> deutsch', () => {
        assert.equal(baue('de')(), true);
    });

    it('englische Oberflaeche -> englischer Rueckfall', () => {
        assert.equal(baue('en')(), false,
            'die Weiche antwortet unabhaengig von der Sprache — der englische Zweig ist tot');
    });

    it('ohne getLang faellt sie nicht um', () => {
        assert.equal(baue(null)(), false);
    });
});

// ───────────────────────────────────────────────────────────────────
// B3 — die Rundenzahl sagt, woher sie kommt
// ───────────────────────────────────────────────────────────────────
describe('B3 — bei Major-Typen steht angeschrieben, dass die Runden eine Eingabe sind', () => {
    function baueHinweis(settings, deutsch) {
        const quelle = funktion('function _rundenHerkunftHinweis(type) {');
        return new Function('MAJOR_TYPES', 'MAJOR_DAY2_POINTS', '_settings', '_mcIstDeutsch', 'esc',
            quelle + '\nreturn _rundenHerkunftHinweis;')(
            ['worlds', 'regional', 'international'], { 8: 16, 9: 19 },
            settings, () => deutsch, esc);
    }

    it('Regional mit 8 Runden: der Satz steht da und nennt die Folge von 9 Runden', () => {
        const html = baueHinweis({ rounds: 8 }, true)('regional');
        assert.match(html, /Runden sind hier eine Eingabe, keine Ableitung aus der Spielerzahl/);
        assert.match(html, /9 statt 8 Runden setzt das Punkteziel auf 19/);
    });

    it('bei 9 Runden dreht sich der Satz um — die Zahlen sind gelesen, nicht getippt', () => {
        const html = baueHinweis({ rounds: 9 }, true)('regional');
        assert.match(html, /8 statt 9 Runden setzt das Punkteziel auf 16/);
    });

    it('Worlds und International bekommen ihn ebenfalls', () => {
        assert.match(baueHinweis({ rounds: 8 }, true)('worlds'), /keine Ableitung/);
        assert.match(baueHinweis({ rounds: 8 }, true)('international'), /keine Ableitung/);
    });

    it('Challenge und Cup bekommen ihn NICHT — dort leitet die Seite wirklich ab', () => {
        assert.equal(baueHinweis({ rounds: 5 }, true)('challenge'), '');
        assert.equal(baueHinweis({ rounds: 5 }, true)('cup'), '');
    });

    it('das Punkteziel im Satz kommt aus MAJOR_DAY2_POINTS, nicht aus dem Text', () => {
        const quelle = funktion('function _rundenHerkunftHinweis(type) {');
        assert.ok(quelle.includes('MAJOR_DAY2_POINTS[ander]'));
        // Eine geaenderte Tabelle muss den Satz mitziehen.
        const fn = new Function('MAJOR_TYPES', 'MAJOR_DAY2_POINTS', '_settings', '_mcIstDeutsch', 'esc',
            quelle + '\nreturn _rundenHerkunftHinweis;')(
            ['regional'], { 8: 16, 9: 21 }, { rounds: 8 }, () => true, esc);
        assert.match(fn('regional'), /Punkteziel auf 21/);
    });

    it('es wird KEINE Rundenregel erfunden — Majors ziehen die Runden weiterhin nicht nach', () => {
        /* DIE BEGRUENDUNG HAT SICH AM 08.09.2026 GEAENDERT, DIE ZUSAGE
           NICHT.

           Bis dahin stand hier: die Rundenzahl grosser Turniere stehe
           in keiner Datei des Arbeitsbaums, also duerfe man sie nicht
           behaupten. Inzwischen liegt die Quelle vor — das Play!
           Pokémon Turnierregel-Handbuch (Stand 01.09.2026), abgelegt in
           docs/turnierregeln-handbuch.md. Sie sagt fuer Regionals und
           Internationals: Phase 1 sind ACHT Runden, durchgehend von 129
           bis 4096 Spielern je Altersklasse.

           Damit waere eine Ableitung aus der Spielerzahl nicht mehr
           unbelegt — sie waere ueber die gesamte Spanne bloss dieselbe
           Zahl. Und der Betreiber hat ausdruecklich angeordnet:
           „Standard ist immer 8", aenderbar von Hand. Die Zusage bleibt
           also, mit besserem Grund.

           Der Aufruf traegt seit dem 08.09.2026 den Turniertyp als
           zweiten Parameter, weil das Handbuch fuer Liga-Herausforderung
           (Variante 2) und Liga-Cup (Variante 3) zwei verschiedene
           Leitern fuehrt. */
        const zweig = schnittOhne('if (!MAJOR_TYPES.includes(_settings.tournamentType)) {',
            "if (key === 'topCutSize'");
        assert.match(zweig, /_settings\.rounds = _suggestSwissRounds\(val[^)]*\);/,
            'die Ableitung fuer Challenge/Cup ist weg');
        const kopf = SRC.slice(SRC.indexOf('function _onSetting(key, val) {'),
            SRC.indexOf('if (!MAJOR_TYPES.includes(_settings.tournamentType)) {'));
        assert.ok(!kopf.includes('_suggestSwissRounds'),
            'die Runden werden jetzt auch fuer Majors abgeleitet — dafuer gibt es im Repo keine Quelle');
    });

    it('der Satz haengt auch wirklich am Rundenfeld', () => {
        assert.ok(SRC.includes('${_rundenHerkunftHinweis(type)}'),
            'die Funktion waere geprueft, aber niemand riefe sie auf');
    });
});

// ───────────────────────────────────────────────────────────────────
// B4 / M-11 — die Gewichtung der Paarungsquellen steht auf dem Schirm
// ───────────────────────────────────────────────────────────────────
describe('B4 — der Banner nennt das Mischungsverhaeltnis, nicht nur die Quellen', () => {
    const W2 = quellKonstante('MATCHUP_BLEND_WEIGHT_DAY2');
    const W1 = quellKonstante('MATCHUP_BLEND_WEIGHT_DAY1');
    const WO = quellKonstante('MATCHUP_BLEND_WEIGHT_ONLINE');

    function baueChip({ deck = 'Mega Excadrill', adjust = {}, deutsch = true } = {}) {
        const quelle = schnitt('const gewichtung = (() => {', '})();');
        const normalize = (n) => (n || '').toLowerCase().replace(/[\s\-']/g, '');
        return new Function('_mcNum', '_mcPz', '_mcIstDeutsch', 'MATCHUP_BLEND_WEIGHT_DAY2',
            'MATCHUP_BLEND_WEIGHT_DAY1', 'MATCHUP_BLEND_WEIGHT_ONLINE', '_settings',
            '_deckWRAdjustment', 'normalize', 'esc',
            quelle + '\nreturn gewichtung;')(
            deutsch ? _mcNum : _mcNumEn, deutsch ? _mcPzDe : _mcPzEn, () => deutsch,
            W2, W1, WO, { myDeck: deck }, adjust, normalize, esc);
    }

    it('das Verhaeltnis Papier zu Online steht als Zahl da', () => {
        const html = baueChip();
        assert.match(html, /80 % Papier/);
        assert.match(html, /45 % Day 2/);
        assert.match(html, /35 % Day 1/);
        assert.match(html, /20 % Online/);
    });

    it('die Prozente sind gelesen, nicht abgeschrieben — 0,45/0,35/0,20 stehen in der Quelle', () => {
        /* Der Kern von M-11: tests/unit/test-meta-call-matchup-blend.js
           spiegelt diese Werte in eigenen Konstanten und bleibt gruen,
           wenn das Modul sich bewegt. Hier wird die Quelle gelesen und
           der erwartete Wert festgehalten. */
        assert.equal(W2, 0.45, 'Day-2-Gewicht geaendert — die 16,2 % aus Frankfurt haengen daran');
        assert.equal(W1, 0.35);
        assert.equal(WO, 0.20);
        assert.ok(Math.abs((W2 + W1 + WO) - 1) < 1e-12, 'die drei Gewichte muessen sich auf 1 summieren');
        assert.ok(Math.abs((W2 + W1) - 0.80) < 1e-12, 'Papier ist die 80-%-Mehrheit');
        const fallback = SRC.match(/const MATCHUP_BLEND_WEIGHT_OVERALL_FALLBACK\s*=\s*([^;]+);/);
        assert.ok(fallback, 'der Rueckfall fehlt');
        assert.equal(fallback[1].trim(), 'MATCHUP_BLEND_WEIGHT_DAY1 + MATCHUP_BLEND_WEIGHT_DAY2',
            'der Rueckfall traegt wieder eine eigene Zahl statt der Summe');
    });

    it('die Verschiebung aus Predictor 5.3 steht mit Vorzeichen daneben', () => {
        const html = baueChip({ adjust: { megaexcadrill: 6.8234 } });
        assert.match(html, /Predictor 5\.3 für Mega Excadrill: \+6,82 pp/);
    });

    it('eine negative Verschiebung wird als solche gezeigt', () => {
        const html = baueChip({ adjust: { megaexcadrill: -4.1 } });
        assert.match(html, /Predictor 5\.3 für Mega Excadrill: −4,10 pp/);
    });

    it('ohne Verschiebung fuer das Deck steht dort nichts — keine erfundene Null', () => {
        const html = baueChip({ adjust: { dragapult: 3.2 } });
        assert.ok(!/Predictor 5\.3/.test(html));
    });

    it('ohne gewaehltes Deck bleibt der Zusatz ebenfalls weg', () => {
        assert.ok(!/Predictor 5\.3/.test(baueChip({ deck: '', adjust: { megaexcadrill: 6.8 } })));
    });

    it('der Titel sagt, dass die Gewichte Nennwerte sind und neu verteilt werden', () => {
        const html = baueChip();
        assert.match(html, /title="[^"]*hochgerechnet/);
    });

    it('englisch sagt dasselbe', () => {
        const html = baueChip({ deutsch: false, adjust: { megaexcadrill: 6.8234 } });
        assert.match(html, /80% paper/);
        assert.match(html, /Predictor 5\.3 for Mega Excadrill: \+6\.82 pp/);
    });

    it('der Chip haengt in BEIDEN Bannerzweigen', () => {
        const treffer = SRC.match(/\$\{stichprobe\}\$\{gewichtung\}/g) || [];
        assert.equal(treffer.length, 2,
            'ein Bannerzweig zeigt die Gewichtung nicht — Modus A ist ausgerechnet der duennere');
    });
});

describe('M-11 — die gemischte Paarung wird mit den Quellgewichten nachgerechnet', () => {
    const W2 = quellKonstante('MATCHUP_BLEND_WEIGHT_DAY2');
    const W1 = quellKonstante('MATCHUP_BLEND_WEIGHT_DAY1');
    const WO = quellKonstante('MATCHUP_BLEND_WEIGHT_ONLINE');

    /* Fuehrt den echten Mischblock aus getBaseMatchup aus — mit den
       Gewichten, die in der Quelle stehen. Ein geaendertes Gewicht
       aendert damit das Ergebnis, und die festgehaltene Zahl faellt. */
    function mische({ day2, day1, overall, online }) {
        let block = schnittOhne('const sources = [];',
            '    // If sources.length === 0 → no labs data for this pair → leave');
        if (typeof global.__mcSrcMutation === 'function') {
            const vorher = block;
            block = global.__mcSrcMutation(block);
            assert.notEqual(block, vorher, 'die Mutation hat nichts geaendert');
        }
        const clip = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
        const fn = new Function('_lookupPair', 'day2Map', 'day1Map', 'overallMap',
            'MATCHUP_BLEND_WEIGHT_DAY2', 'MATCHUP_BLEND_WEIGHT_DAY1', 'MATCHUP_BLEND_WEIGHT_ONLINE',
            'MATCHUP_BLEND_WEIGHT_OVERALL_FALLBACK', 'MAJOR_MATCHUP_MIN_GAMES',
            'MAJOR_MATCHUP_MIN_GAMES_DAY1', 'MAJOR_MATCHUP_MIN_GAMES_DAY2',
            'MAJOR_MATCHUP_TIE_RATE', '_clip', 'a', 'b', 'base',
            block + '\nreturn base;');
        return fn((map) => map, day2 || null, day1 || null, overall || null,
            W2, W1, WO, W1 + W2, 10, 5, 5, 0.02, clip, 'x', 'y',
            { pWin: online, pTie: 0.02, pLoss: 1 - online - 0.02, partien: 100 });
    }

    /* DA-48 (05.10.2026, Hausi: „Rechnung angleichen"): gemischt werden
       QUOTEN S/(S+N) — Online geht als pWin/(pWin+pLoss) ein (0,50/0,98),
       das Ergebnis wird danach mit dem Unentschieden-Anteil (0,02) zu
       pWin. Vorher stand Online als pWin (mit U) in derselben Summe. */
    const QON = 0.50 / 0.98, REST = 0.98;
    it('Day 2 60 %, Day 1 40 %, Online 50 % — 0,45/0,35/0,20 auf Quoten', () => {
        const r = mische({ day2: { winPct: 60, games: 9 }, day1: { winPct: 40, games: 30 }, online: 0.50 });
        const soll = (0.45 * 0.60 + 0.35 * 0.40 + 0.20 * QON) * REST;
        assert.ok(Math.abs(r.pWin - soll) < 1e-12,
            `erwartet ${soll} — gerechnet ${r.pWin}.`);
    });

    it('ohne echte Day-1-Karte und ohne Overall traegt Day 2 die vollen 80 %', () => {
        const r = mische({ day2: { winPct: 60, games: 9 }, day1: { winPct: 40, games: 4 }, online: 0.50 });
        assert.ok(Math.abs(r.pWin - (0.80 * 0.60 + 0.20 * QON) * REST) < 1e-12);
        assert.deepEqual(r._majorSources.map(s => s.kind), ['day2', 'online']);
    });

    it('DA-48: liegt Overall vor, faellt es NICHT mehr hinter Day 2 weg', () => {
        // Excadrill–Dragapult: 21 Day-2-Matches verdraengten 222 Major-Matches.
        const r = mische({ day2: { winPct: 48.6, games: 21 }, overall: { winPct: 47.2, games: 222 }, online: 0.546 });
        assert.deepEqual(r._majorSources.map(s => s.kind), ['overall', 'online']);
        assert.equal(r._majorSources[0].games, 222);
    });

    it('VERFAELSCHUNG: mit dem alten „Overall nur ohne Day 2" faellt es auf', () => {
        const kaputt = s => s.replace("if (!sources.some(x => x.kind === 'day1')) {", 'if (sources.length === 0) {');
        const alt = global.__mcSrcMutation = kaputt;
        try {
            const r = mische({ day2: { winPct: 48.6, games: 21 }, overall: { winPct: 47.2, games: 222 }, online: 0.546 });
            assert.notDeepEqual(r._majorSources.map(s => s.kind), ['overall', 'online']);
        } finally { global.__mcSrcMutation = null; void alt; }
    });

    it('ohne Tagesaufteilung traegt Overall die vollen 80 %', () => {
        const r = mische({ overall: { winPct: 60, games: 40 }, online: 0.50 });
        assert.ok(Math.abs(r.pWin - (0.80 * 0.60 + 0.20 * QON) * REST) < 1e-12);
        assert.deepEqual(r._majorSources.map(s => s.kind), ['overall', 'online']);
        assert.ok(Math.abs(r._majorSources[0].weight - 0.80) < 1e-12);
    });

    it('die normierten Gewichte, die der Block ausweist, summieren sich auf 1', () => {
        const r = mische({ day2: { winPct: 60, games: 9 }, day1: { winPct: 40, games: 30 }, online: 0.50 });
        const summe = r._majorSources.reduce((s, x) => s + x.weight, 0);
        assert.ok(Math.abs(summe - 1) < 1e-12);
        assert.deepEqual(r._majorSources.map(s => s.weight), [0.45, 0.35, 0.20]);
    });

    it('der Nenner der gemischten Quote zaehlt die Major-Partien mit', () => {
        const r = mische({ day2: { winPct: 60, games: 9 }, day1: { winPct: 40, games: 30 }, online: 0.50 });
        assert.equal(r.partien, 139, '100 Online-Partien + 9 + 30');
    });
});

// ───────────────────────────────────────────────────────────────────
// B5 / M-05 / M-15 — die Klemmung und ihre Verdrahtung
// ───────────────────────────────────────────────────────────────────
describe('B5 — auch der <select> der Runden meldet das Verlassen', () => {
    it('alle Rundenfelder, die gerendert werden, gehen an _onSettingCommit', () => {
        /* Die alte Zusicherung suchte nur EIN Textvorkommen je
           Schluessel und war damit schon erfuellt, wenn der
           <input>-Zweig verdrahtet war. Der bei Regional, Worlds und
           International wirklich gezeigte <select> trug nichts. */
        const feld = schnittOhne('<label for="mc-rounds">', '${_rundenHerkunftHinweis(type)}');
        const commits = (feld.match(/MetaCall\._onSettingCommit\('rounds', this\)/g) || []).length;
        assert.equal(commits, 2,
            'ein Rundenfeld (select oder input) meldet das Verlassen nicht mehr an _onSettingCommit');
        assert.ok(/<select id="mc-rounds" onchange="MetaCall\._onSettingCommit\('rounds', this\)"/.test(feld),
            'der Major-<select> haengt wieder an _onSetting statt an _onSettingCommit');
    });

    it('_onSettingCommit kommt auch mit einem <select> zurecht', () => {
        const quelle = funktion('function _onSettingCommit(key, el) {')
            + '\n' + funktion('function _klemmeEinstellung(key, val, nurMax) {')
            + '\n' + schnittOhne('const SETTING_GRENZEN = {', '};') + '};';
        const gesetzt = [];
        const settings = { rounds: 8 };
        const fn = new Function('zahlLokal', '_settings', '_zeigeKlemmHinweis', '_onSetting',
            quelle + '\nreturn _onSettingCommit;')(
            zahlLokal, settings, () => {}, (k, v) => gesetzt.push([k, v]));
        fn('rounds', { value: '9' });
        assert.deepEqual(gesetzt, [['rounds', 9]]);
    });

    it('ein leerer <select>-Wert faellt auf den stehenden Wert zurueck, statt NaN zu setzen', () => {
        const quelle = funktion('function _onSettingCommit(key, el) {')
            + '\n' + funktion('function _klemmeEinstellung(key, val, nurMax) {')
            + '\n' + schnittOhne('const SETTING_GRENZEN = {', '};') + '};';
        const gesetzt = [];
        const el = { value: '' };
        const fn = new Function('zahlLokal', '_settings', '_zeigeKlemmHinweis', '_onSetting',
            quelle + '\nreturn _onSettingCommit;')(
            zahlLokal, { rounds: 8 }, () => {}, (k, v) => gesetzt.push([k, v]));
        fn('rounds', el);
        assert.deepEqual(gesetzt, []);
        assert.equal(el.value, '8');
    });
});

describe('M-05 — die Randwerte selbst gelten noch als gueltig', () => {
    function baueKlemme(settings) {
        const quelle = schnittOhne('const SETTING_GRENZEN = {', '};') + '};'
            + '\n' + funktion('function _klemmeEinstellung(key, val, nurMax) {');
        return new Function('zahlLokal', '_settings',
            quelle + '\nreturn _klemmeEinstellung;')(zahlLokal, settings);
    }

    it('genau 9.999 Spieler sind erlaubt — nicht "geklemmt"', () => {
        const k = baueKlemme({ rounds: 8 })('totalPlayers', 9999, false);
        assert.equal(k.wert, 9999);
        assert.equal(k.geklemmt, false, 'aus "> max" ist ">= max" geworden: der Hoechstwert selbst gilt als Verstoss');
        assert.equal(k.grund, '');
    });

    it('genau 2 Spieler sind erlaubt — auch beim Verlassen des Feldes', () => {
        const k = baueKlemme({ rounds: 8 })('totalPlayers', 2, false);
        assert.equal(k.wert, 2);
        assert.equal(k.geklemmt, false, 'aus "< min" ist "<= min" geworden: der Mindestwert selbst gilt als Verstoss');
    });

    it('genau rounds*3 Punkte sind erreichbar — 24 bei 8 Runden', () => {
        const k = baueKlemme({ rounds: 8 })('day2Points', 24, false);
        assert.equal(k.wert, 24);
        assert.equal(k.geklemmt, false, '8 Siege sind 24 Punkte; wer sie als unerreichbar meldet, rechnet falsch');
        assert.equal(baueKlemme({ rounds: 9 })('day2Points', 27, false).geklemmt, false);
    });

    it('genau 15 Runden und genau 1 Runde bleiben stehen', () => {
        assert.equal(baueKlemme({ rounds: 8 })('rounds', 15, false).geklemmt, false);
        assert.equal(baueKlemme({ rounds: 8 })('rounds', 1, false).geklemmt, false);
    });

    it('genau 45 Punkte bleiben stehen, wenn die Runden sie hergeben', () => {
        assert.equal(baueKlemme({ rounds: 15 })('day2Points', 45, false).geklemmt, false);
    });

    it('einen Schritt darueber greift die Klemmung weiterhin', () => {
        assert.equal(baueKlemme({ rounds: 8 })('totalPlayers', 10000, false).wert, 9999);
        assert.equal(baueKlemme({ rounds: 8 })('totalPlayers', 1, false).wert, 2);
        assert.equal(baueKlemme({ rounds: 8 })('day2Points', 25, false).wert, 24);
        assert.equal(baueKlemme({ rounds: 8 })('rounds', 16, false).wert, 15);
    });
});

describe('M-15 — die beiden Zeitpunkte klemmen wirklich verschieden', () => {
    function baue() {
        const quelle = schnittOhne('const SETTING_GRENZEN = {', '};') + '};'
            + '\n' + funktion('function _klemmeEinstellung(key, val, nurMax) {');
        const settings = { rounds: 8, totalPlayers: 2000, day2Points: 16 };
        const klemme = new Function('zahlLokal', '_settings',
            quelle + '\nreturn _klemmeEinstellung;')(zahlLokal, settings);

        // _onSetting bis einschliesslich der Zuweisung — danach folgen
        // Nachzieh-Kaskaden, die hier nichts zur Sache tun.
        const kopf = schnittOhne('function _onSetting(key, val) {', '_settings[key] = val;')
            .replace('function _onSetting(key, val) {', '');
        const hinweise = [];
        const onSetting = new Function('_klemmeEinstellung', 'SETTING_GRENZEN', 'document',
            '_zeigeKlemmHinweis', '_settings', 'key', 'val',
            kopf + '\n_settings[key] = val;\nreturn _settings[key];');

        // _onSettingCommit vollstaendig, mit _onSetting als Attrappe.
        const commitQuelle = funktion('function _onSettingCommit(key, el) {');
        const commitZiel = [];
        const commit = new Function('_klemmeEinstellung', '_zeigeKlemmHinweis', '_settings', '_onSetting',
            commitQuelle + '\nreturn _onSettingCommit;')(
            klemme, (t) => hinweise.push(t), settings, (k, v) => commitZiel.push([k, v]));

        return {
            settings, hinweise, commitZiel, klemme, commit,
            tippe: (key, val) => onSetting(klemme, { totalPlayers: { feld: 'mc-players' }, rounds: { feld: 'mc-rounds' }, day2Points: { feld: 'mc-day2pts' } },
                { getElementById: () => ({ value: '' }) }, (t) => hinweise.push(t), settings, key, val),
        };
    }

    it('beim TIPPEN bleibt die Untergrenze in Ruhe — "2700" laeuft durch die 2', () => {
        const h = baue();
        assert.equal(h.tippe('totalPlayers', 2), 2);
        assert.equal(h.tippe('totalPlayers', 27), 27,
            'wer beim Tippen die Untergrenze zieht, schreibt dem Nutzer die Zahl unter den Fingern um');
        assert.equal(h.tippe('totalPlayers', 2700), 2700);
        assert.deepEqual(h.hinweise, [], 'beim Tippen darf dabei kein Hinweis erscheinen');
    });

    it('beim TIPPEN greift die Obergrenze trotzdem', () => {
        const h = baue();
        assert.equal(h.tippe('totalPlayers', 10000), 9999);
        assert.ok(h.hinweise.some(x => /9\.999/.test(x)));
    });

    it('beim VERLASSEN greift auch die Untergrenze — sonst bliebe 1 Spieler stehen', () => {
        const h = baue();
        h.commit('totalPlayers', { value: '1' });
        assert.deepEqual(h.commitZiel, [['totalPlayers', 2]],
            'der Aufruf in _onSettingCommit uebergibt nicht mehr `false` — die Untergrenze greift nie');
        assert.ok(h.hinweise.some(x => /Mindestwert/.test(x)));
    });

    it('der DOM-Wert wird beim Verlassen auf das Geklemmte zurueckgeschrieben', () => {
        const h = baue();
        const el = { value: '1' };
        h.commit('totalPlayers', el);
        assert.equal(el.value, '2', 'sonst zeigt das Feld 1 und die Seite rechnet mit 2');
    });

    it('die Trennung steht auch im Aufruf, nicht nur in der Signatur', () => {
        const onSetting = schnittOhne('function _onSetting(key, val) {', '_settings[key] = val;');
        assert.ok(onSetting.includes('_klemmeEinstellung(key, val, true)'),
            'der Tippfall klemmt jetzt beide Grenzen');
        const commit = funktion('function _onSettingCommit(key, el) {');
        assert.ok(commit.includes('_klemmeEinstellung(key, roh, false)'),
            'der Verlassen-Fall klemmt jetzt nur die Obergrenze');
    });
});
