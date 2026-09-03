/**
 * Die Aufraeumbrille auf den uebrigen zwoelf Reitern.
 *
 * Startseite und Meta-Ansicht sind in den Runden davor durchgegangen
 * worden. Am 02.09.2026 haben zwei Pruefagenten dieselbe Brille auf die
 * restlichen Reiter gesetzt und 34 Befunde gemeldet. Diese Datei haelt
 * die fest, die sich am Quelltext pruefen lassen — die Messungen selbst
 * stehen in den Notizen an den jeweiligen Stellen.
 *
 * Zwei Muster ziehen sich durch, und beide sind hier als Regel
 * festgehalten, nicht nur als Einzelfall:
 *
 *   MUSTER A — Formularelemente erben `color` NICHT. Ein <div> mit
 *   drehender Flaeche ist im Dunkelmodus fertig; ein <input>, <select>
 *   oder <textarea> nimmt die Vorgabe des Browsers, und die ist
 *   Schwarz. Gemessen: vier Stellen zwischen 1,10:1 und 1,19:1.
 *
 *   MUSTER B — eine Kurzform-Eigenschaft im Mobilblock loescht eine
 *   gezielte Angabe aus einer anderen Datei. `padding: 9px` nahm der
 *   Lupe ihren Platz, `min-height: 38px !important` machte aus einem
 *   Boden einen Deckel.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const ohneKomm = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const I18N = lies('js/i18n.js');
const HTML = lies('index.html');

/* ── Muster A ─────────────────────────────────────────────────────── */

describe('Formularelemente bekommen mit der Flaeche auch eine Textfarbe', () => {
    /* Der Zaehler laeuft ueber ALLE Stilvorlagen, nicht nur ueber die
       vier gefundenen Stellen. Eine Regel, die nur die bekannten Faelle
       kennt, faengt den fuenften nicht. */
    const FORM = /(^|[\s,>+~])(input|select|textarea)\b|\[type=/i;

    /* Ein Selektor gilt als versorgt, wenn IRGENDEINE Regel im
       Projekt ihm eine Textfarbe gibt — auch eine andere als die mit
       der Flaeche. `input:focus` erbt sie vom Grundzustand, und ein
       Zaehler, der nur die einzelne Regel ansieht, meldet das als
       Fehler. Deshalb wird der Selektor ohne Pseudoklassen verglichen. */
    const nackt = (sel) => sel.split(',').map(t => t.trim().replace(/::?[a-z-]+(\([^)]*\))?/g, '').trim())
        .filter(Boolean).sort().join(',');

    function verdaechtige() {
        const mitFarbe = new Set();
        const kandidaten = [];
        fs.readdirSync(path.join(ROOT, 'css')).filter(f => f.endsWith('.css')).forEach(f => {
            const txt = ohneKomm(lies(path.join('css', f)));
            [...txt.matchAll(/([^{}]+)\{([^{}]*)\}/g)].forEach(m => {
                const sel = m[1].trim().replace(/\s+/g, ' ');
                const body = m[2];
                if (/^@/.test(sel) || !sel) return;
                if (/(?<![-a-zA-Z])color\s*:/.test(body)) {
                    nackt(sel).split(',').forEach(t => mitFarbe.add(t));
                }
                if (!FORM.test(sel)) return;
                const bg = body.match(/background(?:-color)?\s*:\s*([^;]+)/);
                if (!bg) return;
                // Nur drehende Flaechen: eine feste helle Flaeche ist ein
                // anderer Fehler, den der Dunkelmodus-Zaehler faengt.
                if (!/var\(--(surface|bg-|line|tint|mc-|sq-|arc-|ink)/.test(bg[1])) return;
                if (/(?<![-a-zA-Z])color\s*:/.test(body)) return;
                kandidaten.push({ f, sel });
            });
        });
        return kandidaten
            .filter(k => !nackt(k.sel).split(',').every(t => mitFarbe.has(t)))
            .map(k => `${k.f}: ${k.sel}`);
    }

    it('die drei gefundenen Stellen tragen jetzt eine', () => {
        const ui = ohneKomm(lies('css/ui-components.css'));
        const calc = ui.slice(ui.indexOf('.calc-input {'));
        assert.match(calc.slice(0, calc.indexOf('}')), /color:\s*var\(--ink\)/,
            '.calc-input ohne Textfarbe — im Dunkelmodus Schwarz auf Dunkelblau (gemessen 1,10:1)');

        const cf = ohneKomm(lies('css/cards-filter-section.css'));
        const sel = cf.slice(cf.indexOf('.cards-filter-sort select {'));
        assert.match(sel.slice(0, sel.indexOf('}')), /color:\s*var\(--ink\)/,
            'das Sortier-Auswahlfeld ohne Textfarbe (gemessen 1,19:1)');

        const cl = ohneKomm(lies('css/city-league.css'));
        const dat = cl.slice(cl.indexOf('.current-meta-date-input {'));
        assert.match(dat.slice(0, dat.indexOf('}')), /color:\s*var\(--ink\)/,
            'das Datumsfeld traegt wieder eine feste Schriftfarbe (gemessen 1,12:1)');
    });

    it('und es kommt keine vierte dazu', () => {
        /* Diese Zahl darf nicht steigen. Sie steht auf 0, weil die drei
           gefundenen Stellen die einzigen waren — wer eine neue baut,
           soll es hier merken und nicht erst im Dunkelmodus. */
        assert.deepEqual(verdaechtige(), [],
            'Formularelemente mit drehender Flaeche und ohne Textfarbe:\n  '
            + verdaechtige().join('\n  '));
    });
});

/* ── Muster B ─────────────────────────────────────────────────────── */

describe('ein Boden hebt, er senkt nicht', () => {
    const MOB = lies('css/mobile-responsive.css');

    it('das Decklistenfeld behaelt seine Hoehe auf dem Telefon', () => {
        /* Gemessen bei 390 px: das Feld war 60 px hoch, der
           vierzeilige Platzhalter brauchte 115 — 55 px, also gut die
           Haelfte, waren abgeschnitten, darunter das Beispielformat. */
        assert.match(MOB, /textarea:not\(\.proxy-decklist-input\)/,
            'der 38-px-Boden fasst das Decklistenfeld wieder mit');
        const block = MOB.slice(MOB.indexOf('.proxy-decklist-input {', MOB.indexOf('TOUCH TARGETS')));
        assert.match(block.slice(0, block.indexOf('}')), /min-height:\s*140px/,
            'die eigene Hoehe des Decklistenfelds steht nicht mehr im Mobilblock');
    });

    it('die Lupe behaelt ihren Platz', () => {
        const CF = ohneKomm(lies('css/cards-filter-section.css'));
        const block = CF.slice(CF.indexOf('#cards .cards-filter-search-input {'));
        const regel = block.slice(0, block.indexOf('}'));
        assert.doesNotMatch(regel, /padding:\s*9px\s*!important/,
            'die Kurzform ist zurueck — sie loescht die 38 px fuer das Suchsymbol');
        assert.match(regel, /padding:\s*9px 9px 9px 38px/,
            'der linke Einzug fuer die Lupe fehlt');
    });

    it('das Seitenblaettern erreicht die Trefferflaeche', () => {
        /* Gemessen bei 390 px: Seitenzahlen 30 x 30 px, "Alle anzeigen"
           72 x 30. Fuer 238 Seiten ist das der Hauptweg durch die
           Datenbank; die Filter derselben Seite sind bewusst auf 44 px
           gesetzt, die Paginierung war vergessen. */
        /* Nicht nur der Selektor, sondern die Regel mit ihrem Wert:
           ein umbenannter Selektor haette sonst gruen gemeldet. */
        const i = MOB.indexOf('#cards .pagination-controls button');
        assert.notEqual(i, -1, 'die Paginierung steht nicht in der 44-px-Gruppe');
        const regel = MOB.slice(i, MOB.indexOf('}', i));
        assert.match(regel, /min-height:\s*44px/,
            'die Paginierungsregel setzt keine 44 px mehr');
        assert.match(regel, /#proxy button/,
            'die Proxy-Knoepfe sind aus derselben Gruppe gefallen');
    });
});

/* ── Zahlen, die zueinander passen ────────────────────────────────── */

describe('eine Zahl und ihr Nenner meinen dieselbe Menge', () => {
    it('die Kartendatenbank nennt die Kacheln, wenn sie mehr sind als die Karten', () => {
        /* "14.990 Karten gefunden (Seite 1 von 241)" — 14.990/63 sind
           238 Seiten. Der Zaehler zaehlt echte Karten (damit er zu
           "Namen kopieren" passt), die Seiten zaehlten die gestempelten
           Prize-Pack-Kacheln mit. */
        const CDB = ohneKomm(lies('js/app-cards-db.js'));
        assert.match(CDB, /const kachelZahl = cards\.length;/);
        assert.match(CDB, /const zusatz = kachelZahl - realCardsCount;/);
        assert.match(CDB, /zusatz > 0/,
            'der Zusatz steht auch dann da, wenn es keine gestempelten Drucke gibt');
        /* BEFUND DER ABNAHME (03.09.2026): bis hierher pruefte die
           Datei nur die Zutaten. `+ kachelSatz` aus beiden Zweigen zu
           entfernen liess alle 21 Zusicherungen gruen — der Satz waere
           berechnet und weggeworfen worden, genau der Fehler, den
           app-calculator.js in seiner eigenen Notiz anprangert.
           Zwoelf Zeilen weiter unten steht die Regel richtig
           (_matrixRestZeile: "Die Funktion UND ihr Aufruf"). */
        assert.equal((CDB.match(/\+ kachelSatz;/g) || []).length, 2,
            'der Satz wird nicht mehr an beide Zweige angehaengt — dann ist die '
            + 'Kachelzahl berechnet und weggeworfen');
        /* Und die Rechnung selbst, am Ergebnis. */
        const bau = new Function('_cdbT', '_cdbLocale', 'cards', 'realCardsCount', `
            ${CDB.slice(CDB.indexOf('const kachelZahl = cards.length;'),
                        CDB.indexOf(': \'\';', CDB.indexOf('const kachelSatz')) + 6)}
            return kachelSatz;`);
        const T = (k, f) => f;
        assert.match(bau(T, 'de-DE', { length: 15130 }, 14990),
            /15\.?130.*140/, 'der Satz nennt Kachelzahl und Zusatz nicht mehr');
        assert.equal(bau(T, 'de-DE', { length: 14990 }, 14990), '',
            'ohne gestempelte Drucke darf kein Zusatz stehen');
        ['cdb.kachelZusatz'].forEach(k => {
            const n = (I18N.match(new RegExp("'" + k + "'", 'g')) || []).length;
            assert.equal(n, 2, `${k} fehlt in einer der beiden Sprachen`);
        });
    });

    it('die Matchup-Matrix sagt, was sie nicht enthaelt', () => {
        /* Record 218-159-70 = 447 Matches, Spalte "Matches" summierte
           421. Die 26 fehlten unerklaert. */
        const PM = ohneKomm(lies('js/app-past-meta.js'));
        assert.match(PM, /_pmMatchesGesamt = games;/,
            'die Matchsumme der Bilanz wird nicht mehr gemerkt');
        /* Die Funktion UND ihr Aufruf. Nur die Definition zu pruefen
           haette ein entferntes ${_matrixRestZeile(opps)} gruen
           gemeldet — genau die Mutation, die das Feature abschaltet. */
        assert.match(PM, /const _matrixRestZeile = function/,
            'die Restzeilen-Funktion ist weg');
        assert.match(PM, /\$\{_matrixRestZeile\(opps\)\}/,
            'die Restzeile wird nicht mehr ausgegeben');
        /* Und die Rechnung selbst. */
        const f = new Function('_pmMatchesGesamt', 'getLang', 'return ' +
            PM.slice(PM.indexOf('const _matrixRestZeile = function'),
                     PM.indexOf('};', PM.indexOf('const _matrixRestZeile = function')) + 1)
              .replace(/^const _matrixRestZeile =\s*/, ''));
        const de = () => 'de';
        assert.equal(f(447, de)([{ games: 400 }, { games: 21 }]).includes('26'), true,
            '447 minus 421 muessen 26 sein');
        assert.equal(f(421, de)([{ games: 400 }, { games: 21 }]), '',
            'ohne Luecke darf keine Zeile stehen');
        assert.equal(f(0, de)([{ games: 400 }]), '',
            'ohne Bilanz darf keine Zeile stehen');
    });

    it('die Kachel "Verwendete Decks" nennt den Nenner der Prozente', () => {
        /* "6" ueber Kartenzeilen, die alle "5/5 (100,0 %)" sagen. */
        const CL = ohneKomm(lies('js/app-city-league.js'));
        assert.match(CL, /cityLeagueStatDecksNote/,
            'der Hinweis unter der Kachel fehlt');
        assert.match(CL, /nenner !== anzeige/,
            'der Hinweis erscheint nicht mehr genau dann, wenn die Zahlen auseinandergehen');
        assert.match(HTML, /id="cityLeagueStatDecksNote"/);
    });

    it('die rote Marke rechnet auf beiden Reitern gleich', () => {
        /* Dieselbe CSS-Klasse trug zwei Rechnungen: hier das Maximum
           einer einzelnen Liste, dort den repraesentativen Schnitt. Die
           Marken summierten sich auf 74 Kopien fuer ein 60-Karten-Deck. */
        const CL = ohneKomm(lies('js/app-city-league.js'));
        assert.match(CL, /_markeZahl\(avgCountOverallValue, avgCountInUsedValue, finalMaxCount, decksWithCard, totalDecksInArchetype\)/,
            'die Marke zeigt wieder unmittelbar das Maximum');
        assert.match(CL, /function _markeZahl/);
        // Und die Regel selbst: Boden bei 1, Maximum nur bei einer Liste.
        const f = new Function('return ' + CL.slice(CL.indexOf('function _markeZahl'),
            CL.indexOf('function _markeHinweis')).trim() + '; ')();
        //          (Ø gesamt, Ø enthalten, max, in Listen, Listen)
        assert.equal(f(1.2, 1.2, 2, 5, 5), 1, 'Ø 1,20 bei fuenf Listen muss 1 zeigen, nicht 2');
        assert.equal(f(2.8, 2.8, 4, 5, 5), 3, 'Ø 2,80 muss 3 zeigen, nicht 4');
        assert.equal(f(1.2, 3.0, 3, 2, 5), 3,
            'in zwei von fuenf Listen, dort immer dreimal: die Marke muss 3 zeigen');
        assert.equal(f(0.2, 1.0, 1, 1, 5), 1, 'unter einer halben Kopie bleibt der Boden 1');
        assert.equal(f(2.5, 2.5, 4, 1, 1), 4, 'bei EINER Liste ist das Maximum die Liste');
        assert.equal(f(0, 0, 3, 2, 9), 3, 'ohne Schnitt bleibt das Maximum');
        assert.ok(f(9, 9, 3, 5, 5) <= 3, 'die Marke uebersteigt nie das Maximum');
    });

    it('der Hinweis an der Marke nennt beide Schnitte und das Maximum', () => {
        /* Ohne Zusicherung liess sich _markeHinweis auf '' setzen: die
           Marke haette dann nur noch die gerundete Zahl gezeigt, ohne
           das Korrektiv, auf das ihre Notiz sich beruft. */
        const CL = ohneKomm(lies('js/app-city-league.js'));
        const f = new Function('getLang', 'window', 'return ' +
            CL.slice(CL.indexOf('function _markeHinweis')).trim() + ';')(() => 'de', {});
        const txt = f(1.2, 3.0, 3, 2, 5);
        assert.match(txt, /2 von 5/, 'der Hinweis nennt nicht, in wie vielen Listen die Karte steht');
        assert.match(txt, /3,00/, 'der Schnitt der enthaltenden Listen fehlt');
        assert.match(txt, /1,20/, 'der Gesamtschnitt fehlt');
        assert.match(txt, /höchstens 3/, 'das Maximum fehlt');
        /* Der Nachbar in app-meta-cards.js escaped seinen Titel; diese
           beiden Stellen sind bewusst als Paar gebaut und sollen
           dieselbe Regel haben. */
        assert.match(CL, /title="\$\{escapeHtml\(_markeHinweis\(/,
            'der Hinweis geht ungeprueft in ein title-Attribut');
    });

    it('die Marke zeigt nie eine Zahl, die in keiner Liste vorkommt', () => {
        /* BEFUND DER ABNAHME (03.09.2026): der erste Entwurf nahm den
           Schnitt ueber ALLE Listen. Acht Karten bekamen dadurch eine
           Zahl, die in keiner einzigen Liste steht — Cyrano steht in
           zwei von fuenf Listen, dort immer dreimal, die Marke sagte
           "1". Gerechnet wird gegen die echte Datei; behauptet wird
           keine Wochenzahl, sondern eine EIGENSCHAFT: wo jede
           enthaltende Liste dieselbe Kopienzahl hat, muss die Marke
           genau diese zeigen. */
        const CL = ohneKomm(lies('js/app-city-league.js'));
        const f = new Function('return ' + CL.slice(CL.indexOf('function _markeZahl'),
            CL.indexOf('function _markeHinweis')).trim() + ';')();
        const csv = lies('data/city_league_analysis_past.csv').replace(/^\uFEFF/, '');
        const zeilen = csv.trim().split(/\r?\n/);
        const kopf = zeilen[0].split(';');
        const z = (v) => Number(String(v == null ? '0' : v).replace(',', '.')) || 0;
        const proArch = {};
        const daten = zeilen.slice(1).map(l => {
            const t = l.split(';'); const o = {}; kopf.forEach((k, i) => { o[k] = t[i]; }); return o;
        });
        daten.forEach(r => {
            proArch[r.archetype] = Math.max(proArch[r.archetype] || 0, z(r.total_decks_in_archetype));
        });
        assert.ok(daten.length > 50, `nur ${daten.length} Zeilen — der Vergleich zeigt nichts`);
        const unmoeglich = [];
        daten.forEach(r => {
            const max = z(r.max_count), e = z(r.average_count), g = z(r.average_count_overall);
            const neu = f(g, e, max, z(r.deck_inclusion_count), proArch[r.archetype]);
            // Jede enthaltende Liste hat dieselbe Zahl -> die Marke muss sie zeigen.
            if (Math.abs(e - max) < 0.005 && max > 0 && neu !== max) {
                unmoeglich.push(`${r.archetype} / ${r.card_name}: in jeder Liste ${max}, gezeigt ${neu}`);
            }
        });
        assert.deepEqual(unmoeglich, [],
            'diese Marken zeigen eine Zahl, die in keiner Liste vorkommt:\n  '
            + unmoeglich.join('\n  '));
    });

    it('die Meta-Karten-Zeile schreibt Komma und nie "Ø 0x"', () => {
        /* Ohne Zusicherung liess sich die Zeile auf toFixed(1) und
           Math.round zurueckdrehen — "Secret Box: 30.0% | Ø 0x" waere
           zurueck. */
        const MC = ohneKomm(lies('js/app-meta-cards.js'));
        assert.match(MC, /_kommaZahl\(card\.metaShare, 1\)/,
            'der Anteil geht nicht mehr durch die Komma-Funktion');
        assert.match(MC, /_kopienBoden\(card\.avgCount\)/,
            'der Kopienboden ist weg — dann steht wieder "Ø 0x"');
        assert.doesNotMatch(MC, /card\.metaShare\.toFixed\(1\)/);
        assert.doesNotMatch(MC, /Math\.round\(card\.avgCount\)/);
        const boden = new Function('return ' + MC.slice(MC.indexOf('function _kopienBoden'),
            MC.indexOf('function _anteilHinweis')).trim() + ';')();
        assert.equal(boden(1.2), 1);
        assert.equal(boden(2.8), 3);
        assert.ok(boden(0.3) > 0, 'Ø 0,30 darf nicht als 0 dastehen');
        assert.ok(boden(0.004) > 0, 'auch sehr kleine Schnitte duerfen nicht auf 0 fallen');
        assert.equal(boden(0), 0, 'ohne Vorkommen bleibt 0 richtig');
    });

    it('die Bildkarte sagt EINMAL, dass Praesenzdaten fehlen — nicht viermal', () => {
        /* Gemessen am erzeugten Bild (03.09.2026): die drei Kennzahlen
           trugen je eine Major-Zeile, und ohne Praesenzdaten stand
           dreimal "Major: keine Daten" plus "Day 2 (Major): keine
           Daten" untereinander. Vier Zeilen, die dasselbe sagen, auf
           einem Bild, das durch Discord wandert.
           Dieselbe Regel wie bei den leeren Spalten: fehlt die Groesse
           UEBERALL, sagt ein Satz warum; fehlt sie nur an einer Stelle,
           bleibt der Hinweis dort. */
        const SH = ohneKomm(lies('js/ds-share.js'));
        assert.match(SH, /var majorGarNicht = !hatMajorShare && !hatMajorWr && !hatMajorDay2;/,
            'der gemeinsame Schalter fehlt');
        assert.equal((SH.match(/majorGarNicht \? ''/g) || []).length, 3,
            'nicht alle drei Major-Zeilen haengen am Schalter');
        assert.match(SH, /Präsenzturniere: für dieses Deck liegen in diesem Format keine vor/,
            'der EINE Satz im Fuss fehlt');
        /* Und die Gegenrichtung: liegt IRGENDWO etwas vor, bleibt der
           Hinweis an der Stelle stehen, an der er etwas sagt. */
        assert.match(SH, /: L\('Major: keine Daten', 'major: no data'\)/,
            'der Einzelhinweis ist ganz entfallen — dann schweigt die Karte auch dort, '
            + 'wo der Nachbar Zahlen hat');
    });

    it('der Rechner zeigt die Nenner, aus denen seine Prozente folgen', () => {
        const CALC = ohneKomm(lies('js/app-calculator.js'));
        ['calc-fuss-draw', 'calc-fuss-prize', 'calc-fuss-topdeck'].forEach(id => {
            assert.match(CALC, new RegExp(id.replace(/-/g, '\\-')), `${id} wird nicht gefuellt`);
            assert.match(HTML, new RegExp('id="' + id + '"'), `${id} fehlt im HTML`);
        });
        /* Und die veralteten Startwerte, die eine verworfene Formel
           zeigten (2.13 % ist 1/47), sind weg. */
        assert.doesNotMatch(HTML, /id="res-topdeck">2\.13%/);
        assert.doesNotMatch(HTML, /id="res-prize">9\.83%/);
        /* BEFUND DER ABNAHME (03.09.2026): `opacity: .85` auf der
           Fussnote nahm genau das zurueck, wofuer --solid-ok und
           --solid-bad gewaehlt sind (weiss darauf 5,03:1 / 4,99:1) —
           gemessen 4,11 / 4,34 / 3,96. */
        const UI = ohneKomm(lies('css/ui-components.css'));
        const fuss = UI.slice(UI.indexOf('.calc-result-fuss'));
        assert.doesNotMatch(fuss.slice(0, fuss.indexOf('}')), /opacity/,
            'die Fussnote ist wieder gedaempft und faellt damit unter die Kontrastgrenze');
    });
});

/* ── Eine Sprache, ein Wort ───────────────────────────────────────── */

describe('dieselbe Funktion heisst auf beiden Reitern gleich', () => {
    function deutsch(key) {
        // Der deutsche Block ist der zweite — beide Schluessel holen und
        // den letzten nehmen.
        const alle = [...I18N.matchAll(new RegExp("'" + key + "':\\s*'((?:[^'\\\\]|\\\\.)*)'", 'g'))];
        return alle.length ? alle[alle.length - 1][1] : null;
    }

    [
        ['filter.allPrints', 'cl.rarityAll', 'Alle Drucke / Alle Prints'],
        ['filter.typeSpecEnergy', 'cl.typeSpecEnergy', 'Spez. Energie / Spezial-Energie'],
    ].forEach(([a, b, was]) => {
        it(`${was}`, () => {
            const va = deutsch(a), vb = deutsch(b);
            assert.ok(va && vb, `${a} oder ${b} fehlt im deutschen Block`);
            assert.equal(va, vb,
                `derselbe Knopf heisst "${va}" und "${vb}" — ein Werkzeug, zwei Reiter, zwei Woerter`);
        });
    });

    it('der Deckbau heisst auf beiden Reitern Deckbau', () => {
        assert.equal(deutsch('cl.deckBuilder'), 'Deckbau',
            '"Deck Builder" mitten in deutscher Oberflaeche, waehrend der Nachbarreiter '
            + '"Deckbau" kann');
        assert.equal(deutsch('section.deckBuilder'), 'Deckbau');
    });

    it('die Kartenzaehler tragen KEIN data-i18n — und werden trotzdem uebersetzt', () => {
        /* Zwei Fehler, einer nach dem anderen:
           1. Ohne data-i18n stand auf der deutschen Seite "0 Cards/ 0
              Total", bis die erste Zeichnung sie ueberschrieb.
           2. MIT data-i18n war es schlimmer: updateTranslationsInDOM
              setzt fuer jedes [data-i18n] ohne Kindelemente innerHTML —
              also wurde die GEZEICHNETE Zahl bei jedem Sprachwechsel
              auf "0 cards" zurueckgesetzt. Gemessen: "33 Karten" wurde
              zu "0 cards". (Abnahme 03.09.2026.)
           Richtig ist, die Zahl zu behalten und nur das Wort zu
           tauschen — dafuer gibt es den languageChanged-Horcher. */
        assert.doesNotMatch(HTML, /id="pastMetaCardCount"[^>]*data-i18n/,
            'data-i18n loescht beim Sprachwechsel die gezeichnete Zahl');
        assert.doesNotMatch(HTML, /id="cityLeagueCardCount"[^>]*data-i18n/);
        assert.doesNotMatch(HTML, /id="cityLeagueDeckPrice"[^>]*data-i18n/,
            'auch der Deckpreis wird zur Laufzeit beschrieben');
        const PM = ohneKomm(lies('js/app-past-meta.js'));
        assert.match(PM, /\['pastMetaCardCount', 'cl\.cards'\]/,
            'der Sprachwechsel zieht die Kartenzaehler nicht mehr nach');
        assert.match(PM, /cityLeagueDeckPrice/,
            'der Sprachwechsel zieht das Trennzeichen des Preises nicht mehr nach');
    });

    it('"Prize Pack Serie" steht nicht mehr fest verdrahtet da', () => {
        const CDB = ohneKomm(lies('js/app-cards-db.js'));
        assert.doesNotMatch(CDB, /Prize Pack Serie \$\{/,
            'die halb deutsche, halb englische Zeichenkette ist zurueck');
        assert.equal((I18N.match(/'cards\.prizePackSeries'/g) || []).length, 2);
    });
});

/* ── Quellen & Methodik ───────────────────────────────────────────── */

describe('die Methodikseite sagt in beiden Sprachen dasselbe', () => {
    /* Die Texte stehen als zusammengesetzte Zeichenketten im
       Quelltext ('... ' + '...'). Fuer die Pruefung werden die Nahtstellen
       geschlossen, damit ein Satz als Satz gelesen wird. */
    const Q = ohneKomm(lies('js/app-quellen.js')).replace(/'\s*\+\s*\n\s*'/g, '');

    it('die Win Rate wird nicht mehr mit halben Unentschieden erklaert', () => {
        /* js/win-rate-konvention.js fuehrt genau diese Variante als die
           ERFUNDENE vierte und schreibt: "Sie ist hier bewusst NICHT
           aufgefuehrt". Die englische Methodikseite fuehrte sie als die
           Definition des Hauses, waehrend die deutsche daneben das
           Gegenteil sagte und es vorrechnete. */
        assert.doesNotMatch(Q, /ties counted as half/i,
            'die verworfene Konvention steht wieder als Definition auf der Methodikseite');
        assert.match(Q, /Ties count in the denominator, not as half a win/);
        assert.match(Q, /13,206 matches/, 'das Rechenbeispiel fehlt in der englischen Fassung');
    });

    it('kein Satz verspricht etwas, das der Leerzustand darunter zuruecknimmt', () => {
        /* "Beide Nenner stehen hier." stand ueber "Der Umfang steht erst
           zur Verfuegung, wenn die Meta-Ansicht geladen wurde." */
        assert.doesNotMatch(Q, /Beide Nenner stehen hier/);
        assert.doesNotMatch(Q, /Both denominators are stated here/);
    });
});

/* ── Leere Spalten, tote Knoepfe, tote Filter ─────────────────────── */

describe('was nichts zu sagen hat, steht nicht da', () => {
    it('der Datumsfilter weicht einem Schild, wenn es nur einen Tag gibt', () => {
        const CL = ohneKomm(lies('js/app-city-league.js'));
        assert.match(CL, /const einTag = minISO === maxISO;/);
        assert.match(CL, /clDatumEinTag/);
        const CSS = lies('css/city-league.css');
        assert.match(CSS, /\.date-range-container\.is-ein-tag \{ display: none; \}/);
    });

    it('der Ladeknopf heisst nach dem Laden anders', () => {
        const MC = ohneKomm(lies('js/app-meta-cards.js'));
        assert.match(MC, /btn\.reloadMetaAnalysis/);
        assert.match(HTML, /id="cityLeagueMetaReloadBtn"/);
        assert.equal((I18N.match(/'btn\.reloadMetaAnalysis'/g) || []).length, 2);
    });

    it('das Original-Auswahlfeld steht nicht neben seiner eigenen Kopie', () => {
        const F = ohneKomm(lies('js/ds-filter.js'));
        /* Die RICHTUNG, nicht nur der Klassenname: ein umgedrehtes
           Argument versteckt das Feld auf allen Reitern ausser dem
           aktiven — und laesst die Doppelbedienung genau dort stehen,
           wo sie stoert. Ein Zeichen, und die alte Testfassung blieb
           gruen. */
        assert.match(F, /var zeigen = \(r\.key !== raum\.key\);/);
        /* BEIDE Aufrufe — fuer das Feld und fuer sein Etikett. Nur den
           ersten zu pruefen liess eine umgedrehte Bedingung durch, weil
           der zweite die Regex noch erfuellte. */
        assert.equal((F.match(/classList\.toggle\('ds-filter-verdeckt', !zeigen\)/g) || []).length, 2,
            'die Verdeckung ist umgedreht — dann steht das Doppelfeld auf dem '
            + 'aktiven Reiter, und das Etikett am falschen Ort');
        assert.doesNotMatch(F, /classList\.toggle\('ds-filter-verdeckt', zeigen\)/);
        /* Und das Feld darf keinen Fokus fangen. */
        assert.match(F, /setAttribute\('tabindex', '-1'\)/,
            'das verdeckte <select> bleibt im Tabulator-Lauf — Pfeiltasten wechseln '
            + 'dort das Format, ohne dass ein Fokusring zu sehen ist');
        assert.match(F, /label\[for="' \+ r\.quelle \+ '"\]/,
            'das Etikett bleibt stehen, wenn sein Feld verschwindet');
        /* Und die Huelle: das Feld selbst zu verdecken haelt nicht,
           weil ueber `select` und `.control-input` mehrere
           Breitenregeln mit !important aus verschiedenen Dateien
           liegen. Gemessen: das absolut positionierte Feld war 390 px
           breit und past-meta scrollte seitlich (scrollWidth 417).
           Ein <span> trifft keine dieser Regeln. */
        assert.match(F, /ds-filter-huelle/,
            'ohne Huelle ziehen die Mobil-Breitenregeln das verdeckte Feld wieder auf');

        const COMP = lies('css/components.css');
        /* Der erste Treffer ist inzwischen die Huellen-Regel; gemeint
           ist die grosse Verdeckungsregel darunter. */
        const block = COMP.slice(COMP.indexOf('.ds-filter-verdeckt,'));
        const regel = block.slice(0, block.indexOf('}'));
        assert.doesNotMatch(regel, /display:\s*none/,
            'display:none nimmt das Feld auch dem Screenreader');
        /* BEFUND DER ABNAHME (03.09.2026): ohne !important verlor
           `width: 1px` gegen `.control-input { width: 100% }` aus
           styles.css — gleiche Spezifitaet, styles.css laedt spaeter.
           Das "versteckte" Feld war ein absoluter Kasten in voller
           Seitenbreite und liess past-meta seitlich scrollen. */
        assert.match(regel, /clip-path:\s*inset\(50%\)/);
        assert.match(regel, /width:\s*1px/);
        assert.match(regel, /max-width:\s*1px/,
            'ohne max-width zieht width:100% aus styles.css den Kasten wieder auf');
        /* Gewonnen wird ueber Spezifitaet, nicht ueber !important —
           components.css ist die Bauteilschicht und kommt ohne aus
           (test-design-components.js haelt das fest). Zwei Klassen
           schlagen eine. */
        const selektoren = block.slice(0, block.indexOf('{'));
        assert.match(selektoren, /\.ds-filter-verdeckt\.control-input/,
            'ohne die zweite Klasse gewinnt .control-input { width: 100% } aus styles.css');
        assert.doesNotMatch(regel, /!important/,
            'components.css kommt ohne !important aus');
    });

    it('die Formatwahl meldet auch eine Zuweisung aus dem Programm', () => {
        const PM = ohneKomm(lies('js/app-past-meta.js'));
        assert.match(PM, /formatSelect\.dispatchEvent\(new Event\('change'/,
            'die Kopie erfaehrt nichts von der Zuweisung — dann stehen wieder zwei '
            + 'verschiedene Formatangaben nebeneinander');
    });
});
