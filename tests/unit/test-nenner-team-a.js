/**
 * JEDE QUOTE TRÄGT IHREN NENNER — auch auf den Kacheln der Startseite.
 *
 * BEFUND (Team A, 06.09.2026). Beim Durchgang durch alle fünfzehn Ansichten
 * habe ich die sichtbaren Prozentzahlen maschinell danach abgesucht, ob ihr
 * Umfeld eine Bezugsmenge nennt. Zwei Stellen fielen durch, beide prominent:
 *
 *  1. Die fünf Kacheln unter "Die meistgespielten Decks" zeigten
 *     "WR 52,4 %" — ohne jede Angabe, worauf die Zahl beruht. Der Tooltip
 *     sagte "Gewichtete durchschnittliche Win Rate", also WAS gerechnet
 *     wurde, aber nicht WORÜBER. Das ist das Erste, was ein Besucher der
 *     Seite sieht.
 *
 *  2. Die Majors-Zeile im Meta Call las sich "D2-Conv. 40,0 % · D2-WR
 *     41,7 %". Nachgemessen an labs_tournament_decks.csv war das bei
 *     Crustle die Bilanz EINES Turniers: 8 von 20 Spielern bei Worlds SF,
 *     95-%-Intervall rund 19 bis 64 %. "40,0 %" allein liest sich wie eine
 *     Eigenschaft; "40,0 % aus 1 Major" liest sich als Beobachtung.
 *
 * Die Hausregel steht seit Monaten in der Heatmap, in den Tier-Kacheln und
 * in den Matchup-Zeilen. An diesen beiden Stellen fehlte sie — und keine
 * Zusicherung hat es gemerkt, weil keine die gerenderte Zahl ansieht.
 *
 * Diese Zusicherungen GREIFEN die Rechenstellen aus dem Quelltext und lassen
 * sie laufen, statt nach Stichworten zu suchen.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { describe, it } = require('node:test');

const WURZEL = path.join(__dirname, '..', '..');
const lies = (...p) => fs.readFileSync(path.join(WURZEL, ...p), 'utf8');
const TIER = lies('js', 'app-tier-meta.js');
const MC   = lies('js', 'app-meta-call.js');
const I18N = lies('js', 'i18n.js');
const CSS  = lies('css', 'styles.css');

describe('Die Kacheln der Startseite nennen ihren Nenner', () => {

    it('die Antrittszahl wird aus derselben Menge gebildet wie die Win Rate', () => {
        /* Der Nenner muss die Menge sein, über die gewichtet wurde — sonst
           steht neben der Zahl eine andere Zahl, und das ist schlimmer als
           gar keine. Gewichtet wird mit `deckCount`, aufsummiert in
           `totalCount`; also ist `totalCount` der Nenner. */
        assert.match(TIER, /group\.weightedWinrateSum \+= winrate \* Math\.max\(1, deckCount\)/,
            'die Win Rate wird nicht mehr mit der Antrittszahl gewichtet');
        assert.match(TIER, /group\.totalCount \+= deckCount/,
            'totalCount summiert nicht mehr dieselbe Menge');
        assert.match(TIER, /weightedWinrate: item\.totalCount > 0 \? \(item\.weightedWinrateSum \/ item\.totalCount\)/,
            'die Win Rate teilt nicht mehr durch totalCount');
        assert.match(TIER, /const antritte = Number\(item\.totalCount\) \|\| 0;/,
            'der angezeigte Nenner kommt nicht aus totalCount');
    });

    it('die Nennerzeile entsteht wirklich — und bleibt bei 0 weg', () => {
        /* Ausgeführt, nicht gegrept: der Ausschnitt aus dem Quelltext wird
           mit echten Werten durchgerechnet. */
        const anfang = TIER.indexOf('const antritte = Number(item.totalCount) || 0;');
        const ende   = TIER.indexOf('heroHtml +=', anfang);
        assert.ok(anfang >= 0 && ende > anfang, 'die Stelle wurde nicht gefunden');
        const stueck = TIER.slice(anfang, ende);

        const bauen = new Function('item', 'fmtHalb', 'getLang',
            stueck + ' return { nText, wrTitel };');
        const fmtHalb = (n) => Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');

        const de = () => 'de';
        const viele = bauen({ totalCount: 2948 }, fmtHalb, de);
        assert.strictEqual(viele.nText, '· 2948', `bekommen: ${viele.nText}`);
        assert.match(viele.wrTitel, /über 2948 Antritte/,
            `der Tooltip nennt die Menge nicht: ${viele.wrTitel}`);

        /* Halbe Antritte sind in dieser Datei echt — der Kommentar bei
           fmtHalb erklärt, was das Runden hier schon einmal angerichtet
           hat (Terapagos Noctowl las sich als "2 / 1 / 33,3 %"). */
        const halb = bauen({ totalCount: 35.5 }, fmtHalb, de);
        assert.strictEqual(halb.nText, '· 35,5',
            `halbe Antritte werden gerundet: ${halb.nText}`);

        /* Ohne Antritte lieber gar nichts als eine behauptete Null. */
        for (const leer of [{ totalCount: 0 }, { totalCount: null }, {}]) {
            const r = bauen(leer, fmtHalb, de);
            assert.strictEqual(r.nText, '',
                `bei ${JSON.stringify(leer)} entsteht "${r.nText}" statt nichts`);
            assert.ok(!/\d/.test(r.wrTitel),
                `der Tooltip behauptet eine Menge, die es nicht gibt: ${r.wrTitel}`);
        }

        /* Und auf Englisch ebenso. */
        const en = bauen({ totalCount: 774 }, fmtHalb, () => 'en');
        assert.match(en.wrTitel, /across 774 entries/,
            `der englische Tooltip nennt die Menge nicht: ${en.wrTitel}`);
    });

    it('die Zahl steht in der Kachel und hat eine Gestalt', () => {
        assert.match(TIER, /WR \$\{fmtPct\(parseFloat\(winrateText\)\)\} <span class="stat-badge-nenner">\$\{nText\}<\/span>/,
            'der Nenner wird nicht neben der Win Rate ausgegeben');
        assert.match(CSS, /\.stat-badge \.stat-badge-nenner\s*\{[\s\S]{0,400}opacity/,
            'die Gestalt des Nenners fehlt im Stylesheet');

        /* EIGENE KLASSE MIT ABSICHT. `.stat-badge-suffix` ist verbrannt:
           er trug einmal die Variantenzahl ein zweites Mal, und der
           Betreiber hat das am 01.09.2026 abgeräumt ("einmal das in Groß
           reicht auf jeden Fall aus"). test-design-depth.js bewacht das
           bis heute mit einem `doesNotMatch` auf den Klassennamen. Hätte
           der Nenner dieselbe Klasse benutzt, wäre entweder meine
           Änderung rot geworden oder die alte Anordnung stillschweigend
           aufgeweicht. */
        assert.ok(!/stat-badge-suffix/.test(TIER),
            'die abgeräumte Klasse ist auf der Kachel zurück');
    });
});

describe('Die Majors-Zeile im Meta Call nennt ihren Nenner', () => {

    it('gezählt werden Turniere, nicht Recency-Gewichte', () => {
        /* `q.n` ist die Summe der Gewichte und im laufenden Fenster
           konstant 0,5 je Turnier — zwei Majors ergäben n = 1,0. Genau
           diese Verwechslung hat an anderer Stelle schon einmal 24 Decks
           falsch gewichtet; der Kommentar dort beschreibt es. */
        const anfang = MC.indexOf('const _majors = (() => {');
        const ende   = MC.indexOf('})();', anfang);
        assert.ok(anfang >= 0 && ende > anfang, 'die Stelle wurde nicht gefunden');
        const stueck = MC.slice(anfang, ende + 5);

        const bauen = new Function('name', '_labsDay2ConvByDeck', 'normalize', 't',
            stueck + ' return _majors;');
        const norm = (x) => String(x).toLowerCase();
        const wort = {
            'mc.histAusMajor':  'aus 1 Major',
            'mc.histAusMajors': 'aus {n} Majors',
        };
        const t = (k) => (k in wort ? wort[k] : k);

        const einer = bauen('Crustle', { crustle: { n: 0.5, samples: [{ date: '2026-08-28', conv: 0.4 }] } }, norm, t);
        assert.strictEqual(einer, ' aus 1 Major',
            `bei einem Turnier steht "${einer}" — die Einzahl fehlt oder der Text stimmt nicht`);

        const drei = bauen('Dragapult', { dragapult: { n: 1.5, samples: [{}, {}, {}] } }, norm, t);
        assert.strictEqual(drei, ' aus 3 Majors',
            `bei drei Turnieren steht "${drei}"`);

        /* Ohne Beobachtungen bleibt der Zusatz weg statt "aus 0 Majors". */
        for (const leer of [undefined, { n: 0 }, { n: 1, samples: [] }, { n: 1, samples: null }]) {
            const r = bauen('X', leer === undefined ? {} : { x: leer }, norm, t);
            assert.strictEqual(r, '',
                `bei ${JSON.stringify(leer)} entsteht "${r}" statt nichts`);
        }

        /* Und die Zahl darf NICHT aus q.n kommen — das würde bei zwei
           Majors "aus 1 Major" schreiben. */
        const falle = bauen('Y', { y: { n: 1.0, samples: [{}, {}] } }, norm, t);
        assert.strictEqual(falle, ' aus 2 Majors',
            'die Zahl kommt aus dem Gewicht statt aus der Zahl der Turniere');
    });

    it('der Nenner steht an beiden Ausgabestellen', () => {
        /* Die Quote erscheint zweimal: in der immer sichtbaren Zeile unter
           dem Decknamen und im aufgeklappten Feld. Eine ohne Nenner wäre
           genauso irreführend wie beide. */
        assert.match(MC, /t\('mc\.histD2Conv'\)\} \$\{\(r\.empConv \* 100\)\.toFixed\(1\)\.replace\('\.', ','\)\} %\$\{_majors\}/,
            'die immer sichtbare Zeile nennt die Zahl der Majors nicht');
        assert.match(MC, /mc-rec-d2wr-value">\$\{pct\.toFixed\(1\)\.replace\('\.', ','\)\} %\$\{esc\(_majors\)\}/,
            'das aufgeklappte Feld nennt die Zahl der Majors nicht');
    });

    it('_majors steht vor seiner Verwendung', () => {
        /* Beim Bauen stand es zuerst DAHINTER — mit `const` ist das ein
           Laufzeitfehler, der die ganze Empfehlungsliste leer gelassen
           hätte. Aufgefallen ist es nur beim Nachsehen der Reihenfolge. */
        const deklaration = MC.indexOf('const _majors = (() => {');
        const nutzung     = MC.indexOf('const d2ConvHtml =');
        assert.ok(deklaration >= 0 && nutzung >= 0, 'eine der beiden Stellen fehlt');
        assert.ok(deklaration < nutzung,
            'const _majors steht hinter seiner ersten Verwendung — das wirft zur Laufzeit');
    });

    it('beide Wortschätze führen Einzahl und Mehrzahl', () => {
        for (const key of ['mc.histAusMajor', 'mc.histAusMajors']) {
            const n = (I18N.match(new RegExp("'" + key.replace(/\./g, '\\.') + "'", 'g')) || []).length;
            assert.strictEqual(n, 2, `${key} fehlt in einer der beiden Sprachen`);
        }
        assert.match(I18N, /'mc\.histAusMajors':\s*'aus \{n\} Majors'/,
            'die deutsche Mehrzahl fehlt oder hat keinen Platzhalter');
        assert.match(I18N, /'mc\.histAusMajors':\s*'from \{n\} majors'/,
            'die englische Mehrzahl fehlt oder hat keinen Platzhalter');
    });
});
