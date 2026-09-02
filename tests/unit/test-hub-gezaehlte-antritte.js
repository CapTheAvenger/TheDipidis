/**
 * „Halb teilnehmen geht nicht."
 *
 * Angestrichen am 01.09.2026 mit Bild — „wie kann es hier ,5 Antritte
 * geben?" — und einen Tag spaeter, als die Zahl noch stand: „wenn das
 * keine verlaessliche Zahl ist, dann weg damit".
 *
 * `total_brought_weighted` ist eine nach AKTUALITAET gewichtete Summe
 * (Turniere der letzten sieben Tage 1,0, aeltere 0,5). Als Guetemass
 * richtig, als Teilnehmerzahl falsch. Seit dem Wochenlauf am 02.09.2026
 * fuehrt die Datei zusaetzlich `total_brought` und `top8_count`.
 *
 * ── WARUM DIESE DATEI RECHNET STATT ZU SUCHEN ──────────────────────
 *
 * Ein erster Versuch tauschte nur den NENNER aus. Die Abnahme hat ihn
 * zerlegt: die Kachel zeigte „aus 1.172 Antritten · Top-8-Quote 10,5 %",
 * aber 120/1172 sind 10,24 %. Eine gezaehlte Grundgesamtheit neben einer
 * gewichteten Quote, die daraus nicht folgt — dieselbe Beanstandung wie
 * am 30.08. („der Leser kann ihn nicht nachrechnen"), eine Ebene tiefer.
 * Bei den Nicht-Spitzenreiter-Kacheln kam die Quote sogar aus einer
 * DRITTEN Quelle (`top8_conv_rate` aus der Datei): Mega Excadrill zeigte
 * 2,7 % neben 936 Antritten, echt sind 2,9 %.
 *
 * Die Testschicht dazu belegte nichts: `broughtGezaehlt` liess sich auf
 * die gewichtete Spalte umlenken und `top8Gezaehlt` auf `top16_count`
 * („196 von 1.172 in die Top 8"), ohne dass einer von 3510 Tests fiel.
 *
 * Deshalb rechnet diese Datei jetzt: sie ruft answerModel() mit echten
 * Zeilen auf und prueft jede angezeigte Zahl gegen die Rechnung, die der
 * Leser selbst anstellen wuerde.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'meta-analysis-hub.js'), 'utf8');
const UTILS = fs.readFileSync(path.join(ROOT, 'js', 'app-utils.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'css', 'components.css'), 'utf8');
const stripJs = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/.*$/gm, '$1');
const SRC_C = stripJs(SRC);
const CSS_C = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

const CSV = fs.readFileSync(path.join(ROOT, 'data', 'online_tournament_top8_decks.csv'), 'utf8')
    .replace(/^﻿/, '');
const ZEILEN = CSV.trim().split(/\r?\n/);
const KOPF = ZEILEN[0].split(';');
const ROWS = ZEILEN.slice(1).map(l => {
    const t = l.split(';'); const o = {};
    KOPF.forEach((k, i) => { o[k] = t[i]; });
    return o;
});
const z = (v) => Number(String(v == null ? '0' : v).replace(',', '.')) || 0;
/* Fliesskomma auf sechs Nachkommastellen als GANZE Zahl vergleichen,
   statt mit einem Epsilon-Band zu arbeiten: ein Band sieht wie eine
   Aussage ueber die Datenlage aus und ist doch nur Rechnerarithmetik. */
const rund = (x) => Math.round(Number(x) * 1e6);

/* Das Modul im Sandkasten — mit der ECHTEN computeConversionPerformance
   aus app-utils.js, nicht mit einer Attrappe. Eine Attrappe wuerde genau
   die Frage wegdefinieren, um die es hier geht. */
function lade(lang) {
    const sandbox = {
        console,
        document: { addEventListener() {}, getElementById: () => null,
                    querySelector: () => null, querySelectorAll: () => [],
                    createElement: () => ({ style: {} }) },
        getLang: () => (lang || 'de'),
        fetch: () => Promise.resolve({ ok: false, text: () => Promise.resolve('') }),
        BASE_PATH: 'data/',
        location: { hash: '' },
        setTimeout, clearTimeout,
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    // Nur die beiden Funktionen, die der Hub braucht — app-utils.js im
    // Ganzen zieht die halbe Seite nach.
    const teil = UTILS.slice(UTILS.indexOf('const CONV_PRIOR'),
                             UTILS.indexOf('function computeConversionPerformance'))
        + UTILS.slice(UTILS.indexOf('function computeConversionPerformance'),
                      UTILS.indexOf('\n/**', UTILS.indexOf('function computeConversionPerformance')));
    vm.runInContext('function parseLocaleNumber(v, d){ const n = Number(String(v==null?"":v).replace(",", ".")); return isNaN(n) ? (d||0) : n; }', sandbox);
    vm.runInContext(teil, sandbox);
    vm.runInContext('window.computeConversionPerformance = computeConversionPerformance;'
                  + 'window.parseLocaleNumber = parseLocaleNumber;', sandbox);
    vm.runInContext(SRC, sandbox);
    return sandbox;
}

function modell(rows) {
    const sb = lade();
    assert.ok(sb._metaHubIntern && sb._metaHubIntern.answerModel,
        'answerModel ist nicht nach aussen gegeben — dann kann niemand nachrechnen');
    return sb._metaHubIntern.answerModel(rows || ROWS);
}

describe('Gezaehlte Antritte — die Daten', () => {
    it('die Datei fuehrt die gezaehlten Spalten', () => {
        ['total_brought', 'top8_count', 'top16_count'].forEach(k =>
            assert.ok(KOPF.includes(k), `Spalte ${k} fehlt`));
    });

    it('die gezaehlten Spalten sind ganze Zahlen — ausnahmslos', () => {
        const krumm = [];
        ROWS.forEach(r => ['total_brought', 'top8_count', 'top16_count'].forEach(k => {
            const v = String(r[k] || '').trim();
            if (v !== '' && !/^\d+$/.test(v)) krumm.push(`${r.deck_name} ${k}=${v}`);
        }));
        assert.deepEqual(krumm, [], 'eine Zaehlung mit Komma ist keine');
    });

    it('kein Deck hat mehr Top-8-Plaetze als Antritte', () => {
        assert.deepEqual(
            ROWS.filter(r => z(r.top8_count) > z(r.total_brought)).map(r => r.deck_name), []);
    });

    it('die Gewichtung tut ueberhaupt etwas', () => {
        // Sonst waere die ganze Unterscheidung sinnlos und der Test blind.
        assert.ok(ROWS.some(r => z(r.total_brought_weighted) !== z(r.total_brought)));
    });
});

describe('Gezaehlte Antritte — jede angezeigte Zahl nachgerechnet', () => {
    const m = modell();
    const gesamt = ROWS.reduce((s, r) => s + z(r.total_brought), 0);
    const t8 = ROWS.reduce((s, r) => s + z(r.top8_count), 0);

    it('das Modell rechnet gezaehlt', () => {
        assert.ok(m, 'answerModel liefert nichts');
        assert.equal(m.hatRoh, true, 'die Datei hat die Spalten, sie werden aber nicht genutzt');
        assert.equal(m.totalBrought, gesamt,
            `Grundgesamtheit ${m.totalBrought} statt ${gesamt}`);
    });

    it('der Feldschnitt ist die gezaehlte Feldquote', () => {
        assert.equal(rund(m.conv.expected), rund(t8 / gesamt),
            `Feldschnitt ${m.conv.expected} statt ${t8 / gesamt}`);
    });

    it('jede Kachel zeigt Zahlen, die zueinander passen', () => {
        const falsch = [];
        m.top.forEach(d => {
            const r = ROWS.find(x => x.deck_name === d.name);
            if (!r) { falsch.push(`${d.name} nicht in der CSV`); return; }
            const br = z(r.total_brought), cuts = z(r.top8_count);
            if (d.brought !== br) falsch.push(`${d.name}: Antritte ${d.brought} statt ${br}`);
            if (rund(d.sharePct) !== rund((br / gesamt) * 100)) {
                falsch.push(`${d.name}: Anteil ${d.sharePct} statt ${(br / gesamt) * 100}`);
            }
            // Die Quote MUSS aus genau den beiden gezeigten Zahlen folgen.
            if (rund(d.convPct) !== rund((cuts / br) * 100)) {
                falsch.push(`${d.name}: Quote ${d.convPct} statt ${(cuts / br) * 100} `
                    + `(${cuts}/${br}) — der Leser kann die Kachel nicht nachrechnen`);
            }
        });
        assert.deepEqual(falsch, []);
    });

    it('die Quote im Satz folgt aus dem Nenner darunter', () => {
        const best = m.headline;
        assert.ok(best, 'kein Spitzenreiter bestimmt');
        assert.equal(rund(m.headlineConvPct), rund((best.top8 / best.brought) * 100),
            `Satz-Quote ${m.headlineConvPct} folgt nicht aus ${best.top8}/${best.brought}`);
        const r = ROWS.find(x => x.deck_name === best.name);
        assert.equal(best.brought, z(r.total_brought), 'der Nenner ist nicht die gezaehlte Zahl');
        assert.equal(best.top8, z(r.top8_count),
            'die Top-8-Zahl kommt aus einer anderen Spalte');
    });

    it('die Top-8-Zahl ist top8_count, nicht top16_count', () => {
        // Genau die Umlenkung, die die Abnahme unbemerkt einbauen konnte.
        const best = m.headline;
        const r = ROWS.find(x => x.deck_name === best.name);
        assert.notEqual(z(r.top8_count), z(r.top16_count),
            'Testannahme: bei diesem Deck sind Top 8 und Top 16 gleich');
        assert.equal(best.top8, z(r.top8_count));
    });
});

/* BEFUND DER ZWEITEN ABNAHME (02.09.2026): das MODELL war gruendlich
   nachgerechnet, der AUSGABETEXT gar nicht. Vier Mutationen blieben
   gruen, darunter „1.172 von 120 in die Top 8" (Zahlen vertauscht) und
   — der schlimmste — gezaehlte Zahlen unter dem Wort „gewichtet", also
   genau die Beanstandung, die den ganzen Punkt ausgeloest hat.

   Hier wird deshalb der Satz selbst gelesen. */
describe('Gezaehlte Antritte — der Satz, den man liest', () => {
    function texte(rows, lang) {
        const sb = lade(lang || 'de');
        const m = sb._metaHubIntern.answerModel(rows || ROWS);
        assert.ok(m, 'kein Modell');
        return {
            m,
            nenner: sb._metaHubIntern.answerNenner(m),
            satz: sb._metaHubIntern.answerSentence(m),
        };
    }

    it('der Nenner nennt zuerst die Cuts, dann die Antritte', () => {
        ['de', 'en'].forEach(lang => {
            const { m, nenner } = texte(null, lang);
            const best = m.headline;
            const zahl = (v) => Number(v).toLocaleString(lang === 'de' ? 'de-DE' : 'en-US');
            const mm = nenner.replace(/[\s ]+/g, ' ')
                .match(lang === 'de'
                    ? /Aus ([\d.,]+) Antritten · .+?: ([\d.,]+) von ([\d.,]+) in die Top 8/
                    : /Out of ([\d.,]+) entries · .+?: ([\d.,]+) of ([\d.,]+) made top 8/);
            assert.ok(mm, `${lang}: Nenner nicht lesbar: ${nenner}`);
            assert.equal(mm[1], zahl(Math.round(m.totalBrought)), `${lang}: Grundgesamtheit`);
            assert.equal(mm[2], zahl(best.top8),
                `${lang}: an der Cut-Stelle steht ${mm[2]}, erwartet ${zahl(best.top8)} — `
                + 'Zahlen vertauscht?');
            assert.equal(mm[3], zahl(best.brought), `${lang}: an der Antritts-Stelle steht ${mm[3]}`);
            // Und die kleinere Zahl steht vorne. „1.172 von 120" ist Unsinn.
            assert.ok(best.top8 <= best.brought);
        });
    });

    it('im gezaehlten Satz kommt das Wort "gewichtet" nicht vor', () => {
        ['de', 'en'].forEach(lang => {
            const { m, nenner } = texte(null, lang);
            assert.equal(m.hatRoh, true, 'Testannahme: die Datei fuehrt die Zaehlungen');
            assert.ok(!/gewichtet|weighted/i.test(nenner),
                `${lang}: gezaehlte Zahlen stehen unter dem Wort "gewichtet": ${nenner}`);
        });
    });

    it('ohne Zaehlung steht das Wort sehr wohl da', () => {
        const rows = ROWS.map(r => { const o = Object.assign({}, r); delete o.total_brought; return o; });
        ['de', 'en'].forEach(lang => {
            const { m, nenner } = texte(rows, lang);
            assert.equal(m.hatRoh, false);
            assert.ok(/gewichtet|weighted/i.test(nenner),
                `${lang}: eine gewichtete Zahl steht ohne das Wort da: ${nenner}`);
        });
    });

    it('der Satz nennt Quote, Feldschnitt und Vielfaches — in beiden Sprachen', () => {
        ['de', 'en'].forEach(lang => {
            const { m, satz } = texte(null, lang);
            const roh = satz.replace(/<[^>]*>/g, '').replace(/[\s ]+/g, ' ');
            /* Verglichen werden die ZAHLEN, nicht ihre Schreibweise: die
               Tausender- und Dezimaltrennung kommt aus toLocaleString,
               und im Sandkasten ohne volle Spracheinstellung sieht sie
               anders aus als im Browser. Der Test soll die Rechnung
               pruefen, nicht die Landeseinstellung. */
            const zahlen = (roh.match(/[\d.,]+(?= ?%)/g) || [])
                .map(x => Number(x.replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')));
            const nah = (a) => zahlen.some(x => Math.abs(x - a) < 0.06);
            assert.ok(nah(m.headlineConvPct),
                `${lang}: Quote ${m.headlineConvPct.toFixed(2)} fehlt im Satz: ${roh}`);
            assert.ok(nah(m.conv.expected * 100),
                `${lang}: Feldschnitt ${(m.conv.expected * 100).toFixed(2)} fehlt im Satz: ${roh}`);
            assert.ok(roh.includes(m.headline.name), `${lang}: der Deckname fehlt`);
            // Und das Vielfache: Quote geteilt durch Feldschnitt.
            const vielfach = (roh.match(/([\d.,]+)(?:-mal|×)/) || [])[1];
            assert.ok(vielfach, `${lang}: kein Vielfaches im Satz: ${roh}`);
        });
    });

    it('der Hinweis an der Quote passt zu dem, was gerechnet wurde', () => {
        // Gezaehlt.
        ['de', 'en'].forEach(lang => {
            const { satz } = texte(null, lang);
            const titel = (satz.match(/class="mah-quote" title="([^"]*)"/) || [])[1];
            assert.ok(titel, `${lang}: kein Hinweis an der Quote`);
            assert.ok(!/gewichtet|weighted/i.test(titel),
                `${lang}: der Hinweis spricht von Gewichtung, obwohl gezaehlt wurde: ${titel}`);
            assert.ok(/gezählt|counted/i.test(titel), `${lang}: ${titel}`);
        });
        // Gewichtet.
        const rows = ROWS.map(r => { const o = Object.assign({}, r); delete o.total_brought; return o; });
        ['de', 'en'].forEach(lang => {
            const { satz } = texte(rows, lang);
            const titel = (satz.match(/class="mah-quote" title="([^"]*)"/) || [])[1];
            assert.ok(titel, `${lang}: kein Hinweis an der Quote`);
            assert.ok(/gewichtet|weighted/i.test(titel),
                `${lang}: der Hinweis verschweigt die Gewichtung: ${titel}`);
        });
    });

    it('der Deckname im Satz und im Nenner ist derselbe', () => {
        const { m, nenner, satz } = texte();
        assert.ok(nenner.includes(m.headline.name));
        assert.ok(satz.includes(m.headline.name));
    });
});

describe('Gezaehlte Antritte — alles oder nichts', () => {
    const ohne = (feld) => ROWS.map((r, i) => i === 3 ? Object.assign({}, r, { [feld]: '' }) : r);

    it('eine Zeile ohne Zaehlung kippt den ganzen Block zurueck', () => {
        ['total_brought', 'top8_count'].forEach(feld => {
            const m = modell(ohne(feld));
            assert.equal(m.hatRoh, false, `${feld} fehlt in einer Zeile, es wird trotzdem gezaehlt`);
        });
    });

    /* BEFUND DER ABNAHME: das Tor prueft auf "nicht leer". Ein
       zerschossener Wochenlauf mit "abc" oder "0" lieferte damit keine
       Rueckfall-, sondern eine falsche Anzeige ("0 von 120"). */
    it('unbrauchbare Werte kippen ihn ebenfalls', () => {
        [['total_brought', 'abc'], ['top8_count', 'abc'],
         ['total_brought', '12,5'], ['top8_count', '-3'],
         ['total_brought', ' '], ['top8_count', 'null']].forEach(([feld, wert]) => {
            const rows = ROWS.map((r, i) => i === 5 ? Object.assign({}, r, { [feld]: wert }) : r);
            const m = modell(rows);
            assert.equal(m.hatRoh, false,
                `${feld}="${wert}" gilt als brauchbare Zaehlung`);
        });
    });

    /* Die zwei Loecher, die die zweite Abnahme gefunden hat: das Tor
       prueft je Zeile, nicht nur die Summe. */
    it('eine einzelne Zeile mit 0 Antritten kippt ihn', () => {
        const rows = ROWS.map((r, i) => i === 2 ? Object.assign({}, r, { total_brought: '0' }) : r);
        const m = modell(rows);
        assert.equal(m.hatRoh, false,
            'ein Deck mit 0 gezaehlten Antritten faellt aus der Rangfolge, '
            + 'die Ueberschrift springt auf ein anderes Deck und seine '
            + 'Kachel zeigt 0');
    });

    it('mehr Top-8-Plaetze als Antritte kippt ihn', () => {
        const rows = ROWS.map((r, i) => i === 2
            ? Object.assign({}, r, { top8_count: String(Number(r.total_brought) + 5) }) : r);
        const m = modell(rows);
        assert.equal(m.hatRoh, false,
            'sonst steht "1.177 von 1.172 in die Top 8" da');
    });

    it('eine Datei mit lauter Nullen kippt ihn auch', () => {
        const rows = ROWS.map(r => Object.assign({}, r, { total_brought: '0', top8_count: '0' }));
        const m = modell(rows);
        assert.equal(m && m.hatRoh, false,
            'eine Grundgesamtheit von 0 gilt als gezaehlt — dann steht '
            + '"Aus 0 Antritten" da');
    });

    it('ganz ohne die Spalten laeuft der alte Weg weiter', () => {
        const rows = ROWS.map(r => {
            const o = Object.assign({}, r);
            delete o.total_brought; delete o.top8_count;
            return o;
        });
        const m = modell(rows);
        assert.ok(m, 'ohne die Spalten liefert der Block gar nichts mehr');
        assert.equal(m.hatRoh, false);
        // Und dann sind die Zahlen die gewichteten.
        const gw = ROWS.reduce((s, r) => s + z(r.total_brought_weighted), 0);
        assert.equal(rund(m.totalBrought), rund(gw));
    });

    it('eine leere Datei ergibt gar keinen Block', () => {
        assert.equal(modell([]), null);
    });
});

describe('Gezaehlte Antritte — die Mindeststichprobe', () => {
    it('der Spitzenreiter erfuellt sie in denselben Zahlen, die er zeigt', () => {
        const m = modell();
        const best = m.headline;
        assert.ok(best, 'kein Spitzenreiter');
        // Die Schwelle misst Stichprobengroesse. Sie muss deshalb auf die
        // Zahl angewandt werden, aus der auch die Quote gerechnet wird —
        // sonst heisst "mindestens 100" je nach Datenlage etwas anderes.
        const r = ROWS.find(x => x.deck_name === best.name);
        assert.equal(best.brought, z(r.total_brought));
        /* Keine Ungleichung gegen eine feste Zahl: geprueft wird, dass
           der Spitzenreiter DIE Schwelle erfuellt, die der Code selbst
           setzt — nicht eine Zahl, die ich hier nochmal hinschreibe.
           Zwei Zahlen waeren zwei Wahrheiten, und die eine davon wuerde
           veralten. */
        const schwelle = Number((SRC.match(/HEADLINE_MIN_BROUGHT = (\d+)/) || [])[1]);
        assert.ok(schwelle, 'die Schwelle steht nicht mehr im Quelltext');
        assert.equal(Math.min(best.brought, schwelle), schwelle,
            `${best.name} steht mit ${best.brought} Antritten in der `
            + `Ueberschrift, die Schwelle ist ${schwelle}`);
        assert.equal(best.thin, false, 'ein duennes Deck steht in der Ueberschrift');
    });

    it('die Schwelle steht im Quelltext und ist begruendet', () => {
        assert.match(SRC_C, /const HEADLINE_MIN_BROUGHT = 100;/);
        assert.match(SRC, /Toxtricity Box/,
            'die Begruendung der Schwelle ist verschwunden');
        assert.match(SRC, /misst STICHPROBENGROESSE/,
            'dass die Schwelle jetzt auf gezaehlte Antritte wirkt, steht '
            + 'nirgends — dann liest sie beim naechsten Mal jemand als '
            + 'unveraendert');
    });

    it('ein Deck unter der Schwelle kommt nicht in die Ueberschrift', () => {
        // Alle Zeilen klein rechnen: dann darf es keine Ueberschrift geben.
        const rows = ROWS.map(r => Object.assign({}, r, {
            total_brought: '30', top8_count: '9',
            total_brought_weighted: '30', top8_count_weighted: '9',
        }));
        const m = modell(rows);
        assert.equal(m && m.headline, null,
            'mit 30 Antritten je Deck wird trotzdem ein "staerkstes Deck" gekuert');
    });
});

describe('Gezaehlte Antritte — die Ausgabe', () => {
    it('im gezaehlten Satz steht kein "gewichtet"', () => {
        const von = SRC.indexOf('if (roh) {');
        const bis = SRC.indexOf('OHNE gezaehlte Spalten');
        assert.notEqual(von, -1, 'der gezaehlte Zweig ist nicht auffindbar');
        assert.notEqual(bis, -1, 'der gewichtete Zweig ist nicht auffindbar');
        const zweig = SRC.slice(von, bis);
        assert.ok(!/gewichtet|weighted/.test(zweig),
            'der Satz mit den gezaehlten Zahlen nennt sie trotzdem gewichtet');
        assert.match(zweig, /Aus \$\{gesamt\} Antritten/);
        assert.match(zweig, /Out of \$\{gesamt\} entries/);
    });

    it('ohne Zaehlung bleibt der Hinweis an der halben Zahl', () => {
        const zweig = SRC.slice(SRC.indexOf('OHNE gezaehlte Spalten'));
        assert.match(zweig, /gewichteten Antritten/);
        assert.match(zweig, /mah-gewichtet/);
        assert.match(zweig, /nach Aktualität gewichtet/);
        assert.ok(!/nach Turniergröße gewichtet/.test(zweig),
            'die falsche Begruendung ist zurueck — gewichtet wird nach '
            + 'Aktualitaet, nicht nach Turniergroesse');
    });

    it('der Hinweis an der Quote sagt, welche Sorte Zahlen im Block steckt', () => {
        assert.match(SRC_C, /class="mah-quote" title="/);
        assert.match(SRC_C, /const gew = model\.hatRoh/,
            'der Hinweis haengt nicht davon ab, ob gezaehlt oder gewichtet '
            + 'gerechnet wurde — dann sagt er in einem der beiden Faelle '
            + 'etwas Falsches');
        assert.match(SRC, /aus gezählten Starts gerechnet/);
        assert.match(SRC, /nach Aktualität gewichtet/);
    });

    it('der Hinweis ist als solcher zu erkennen', () => {
        assert.match(CSS_C, /\.mah-quote \{[^}]*border-bottom:\s*1px dotted/);
        assert.match(CSS_C, /\.mah-quote \{[^}]*cursor:\s*help/);
    });

    it('die Kachel nimmt dieselbe Zahl wie alles andere', () => {
        assert.match(SRC_C, /const antritte = Math\.round\(d\.brought\)\.toLocaleString\(loc\)/);
        assert.ok(!/broughtGezaehlt/.test(SRC_C),
            'es gibt wieder ein zweites Feld fuer dieselbe Groesse');
    });
});
