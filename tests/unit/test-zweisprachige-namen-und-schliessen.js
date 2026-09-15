/**
 * Zwei Befunde vom 15.09.2026, beide vom Betreiber gemeldet, beide im
 * Team-Builder aufgefallen:
 *
 *   "Im Team builder nach dem ich mein Team gesetzt habe komme ich
 *    danach nicht ueber das x zurueck und in der deutschen Version
 *    bitte immer englischen und deutschen Namen anzeigen — weil die
 *    Faehigkeit emergency exit heisst auf Deutsch sicher anders."
 *
 * 1. DAS X WAR WEGGEROLLT, NICHT KAPUTT.
 *    Der Set-Editor ist 990 px hoch. Gerollt hat bisher das ganze
 *    Fenster (.sqb-modal), also Kopf und Fuss mit. Gemessen lokal an
 *    127.0.0.1:8000, bis ans Ende gerollt:
 *
 *      390x844  Ueberhang 166 px  Oberkante des X  -142 px
 *      412x732            278 px                   -254 px
 *      390x664            346 px                   -322 px
 *      360x640            370 px                   -346 px
 *
 *    An der Stelle, wo getippt wurde, lag ein Auswahlfeld.
 *
 * 2. "EMERGENCY EXIT" WAR ZWEIERLEI.
 *    Dass der Name englisch dastand, hatte zwei Ursachen: es gab
 *    keinen deutschen (19 von 202 benutzten Faehigkeiten, 2 von 423
 *    Attacken), UND selbst wo einer vorlag, stand nur er da. Wer ein
 *    Set nachbaut, gibt es in ein englisches Spiel ein — der englische
 *    Name ist nicht Beiwerk.
 *
 * WAS HIER GELESEN WIRD
 * CSS und JS als Text, plus die Datentabellen als JSON. Beides ist an
 * dieser Stelle wirklich Text bzw. Datei (CLAUDE.md, "Eine Zusicherung,
 * die Text liest"). Kommentare werden vorher entfernt — sonst faellt
 * die Verfaelschungsprobe blind aus, weil die Erklaerung ueber der
 * Regel dieselben Woerter enthaelt wie die Regel (CLAUDE.md, "Dein
 * eigener Kommentar macht die Verfaelschungsprobe blind").
 */

const assert = require('node:assert');
const { describe, it } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const json = (p) => JSON.parse(lies(p));

const ohneKommentare = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/** Der Block einer CSS-Regel, ohne Kommentare. */
function regel(css, selektor) {
    const rein = ohneKommentare(css);
    const i = rein.indexOf(selektor + ' {');
    assert.notEqual(i, -1, `Regel "${selektor}" steht nicht (mehr) in der Datei`);
    const auf = rein.indexOf('{', i);
    const zu = rein.indexOf('}', auf);
    assert.ok(zu > auf, `Regel "${selektor}" ist nicht geschlossen`);
    return rein.slice(auf + 1, zu);
}

describe('Der Set-Editor laesst sich schliessen, egal wie weit man gerollt hat', () => {

    const CSS = lies('css/side-quest.css');

    it('der Kasten ist auf die sichtbare Fensterhoehe gedeckelt', () => {
        const box = regel(CSS, '.sqb-modal-box');
        assert.match(box, /max-height:\s*calc\(100dvh/,
            'Ohne Deckel waechst der Kasten ueber das Fenster hinaus und nimmt '
            + 'Kopf und Fuss mit nach oben. dvh, nicht vh: die Adressleiste des '
            + 'Telefons zaehlt mit.');
        assert.match(box, /max-height:\s*calc\(100vh/,
            'Der vh-Rueckfall davor gehoert dazu — ein Browser ohne dvh bekaeme '
            + 'sonst gar keinen Deckel.');
    });

    it('der Kasten ist eine Saeule aus Kopf, Inhalt und Fuss', () => {
        const box = regel(CSS, '.sqb-modal-box');
        assert.match(box, /display:\s*flex/, 'ohne Flex hat "flex: 0 0 auto" unten keine Wirkung');
        assert.match(box, /flex-direction:\s*column/);
    });

    it('nur der Inhalt rollt — Kopf und Fuss stehen', () => {
        const koerper = regel(CSS, '.sqb-modal-body');
        assert.match(koerper, /overflow-y:\s*auto/,
            'Rollt der Inhalt nicht selbst, rollt wieder das ganze Fenster.');
        assert.match(koerper, /min-height:\s*0/,
            'Ohne min-height: 0 weigert sich ein Flex-Kind, kleiner als sein '
            + 'Inhalt zu werden — der Kasten waere trotz max-height wieder zu hoch.');
        for (const teil of ['.sqb-modal-head', '.sqb-modal-foot']) {
            assert.match(regel(CSS, teil), /flex:\s*0\s+0\s+auto/,
                `${teil} muss seine Hoehe behalten, sonst quetscht der Inhalt es weg.`);
        }
    });

    it('der Rand oben und unten passt zum Deckel', () => {
        const fenster = regel(CSS, '.sqb-modal');
        assert.match(fenster, /padding:\s*max\(1rem,\s*env\(safe-area-inset-top\)\)/,
            'Der Deckel rechnet mit genau diesem Rand. Stehen die beiden Werte '
            + 'auseinander, steht der Kasten wieder ueber.');
        // Der Handy-Zweig darf den senkrechten Rand nicht neu setzen: er
        // steht nicht im max-height des Kastens.
        const handy = ohneKommentare(CSS).match(/@media \(max-width: 560px\) \{[\s\S]*?\n\}/);
        assert.ok(handy, 'Der Handy-Zweig fuer den Builder steht nicht mehr da');
        assert.doesNotMatch(handy[0], /\.sqb-modal \{[^}]*padding:\s*\d/,
            'Ein eigener padding-Wert im Handy-Zweig widerspricht dem max-height '
            + 'des Kastens — genau so ist das X abgehauen.');
    });

    it('das X haengt am Kopf, nicht am rollenden Inhalt', () => {
        const js = ohneKommentare(lies('js/app-side-quest-builder.js'));
        const kopf = js.match(/<div class="sqb-modal-head">[\s\S]*?<\/div>/);
        assert.ok(kopf, 'Der Kopf des Set-Editors steht nicht mehr im Bauplan');
        assert.match(kopf[0], /class="sqb-modal-x"/,
            'Wandert das X aus dem Kopf in den Koerper, rollt es wieder weg.');
    });
});

describe('Die deutsche Oberflaeche zeigt beide Namen', () => {

    const NAMEN = ohneKommentare(lies('js/champions-namen.js'));

    it('champions-namen.js setzt englisch und deutsch zusammen', () => {
        assert.match(NAMEN, /function beide\(/,
            'Die Zusammensetzung gehoert an EINE Stelle — sonst fuehren die '
            + 'Flaechen wieder verschiedene Formen.');
        assert.match(NAMEN, /window\.ChampionsNamen\s*=\s*\{[^}]*\bbeide\b/,
            'beide() muss ausgeliefert werden, sonst kann keine Flaeche sie rufen.');
    });

    it('anzeige() laeuft ueber dieselbe Zusammensetzung', () => {
        const fn = NAMEN.match(/function anzeige\([\s\S]*?\n    \}/);
        assert.ok(fn, 'anzeige() steht nicht mehr in der Datei');
        assert.match(fn[0], /return beide\(en, de\(en, art\)\)/,
            'Baut anzeige() den Namen selbst zusammen, gibt es wieder zwei Formen.');
    });

    it('das Trennzeichen ist NICHT der Mittelpunkt', () => {
        // Die Attackenliste im Builder verbindet mit ' · '. Traegt jeder
        // Name denselben Mittelpunkt, hat eine vierstellige Liste acht
        // gleich getrennte Glieder und niemand sieht mehr, was zusammengehoert.
        const t = NAMEN.match(/const TRENNER = '([^']*)'/);
        assert.ok(t, 'TRENNER steht nicht mehr in der Datei');
        assert.ok(!t[1].includes('\u00b7'),
            `TRENNER ist ${JSON.stringify(t[1])} — der Mittelpunkt ist schon das `
            + 'Trennzeichen der Attackenliste (join(\' \u00b7 \')).');
        const builder = ohneKommentare(lies('js/app-side-quest-builder.js'));
        assert.match(builder, /join\(' \u00b7 '\)/,
            'Die Annahme oben haengt daran, dass die Attackenliste weiterhin mit '
            + 'dem Mittelpunkt verbindet. Aendert sich das, gehoert diese '
            + 'Zusicherung mit geaendert.');
    });

    it('beide() gibt im Deutschen englisch UND deutsch zurueck', () => {
        const fenster = { getLang: () => 'de' };
        const sandbox = { window: fenster };
        sandbox.window.getLang = () => 'de';
        const vm = require('node:vm');
        vm.createContext(sandbox);
        vm.runInContext(lies('js/champions-namen.js'), sandbox);
        const CN = sandbox.window.ChampionsNamen;

        assert.equal(CN.beide('Emergency Exit', 'R\u00fcckzug'),
            'Emergency Exit \u2013 R\u00fcckzug');
        // Gleicher Name in beiden Sprachen: einmal reicht.
        assert.equal(CN.beide('Libero', 'Libero'), 'Libero');
        // Kein deutscher Name: englisch, nie ein leerer Platzhalter.
        assert.equal(CN.beide('Punk Rock', null), 'Punk Rock');
        assert.equal(CN.beide('', 'egal'), '');

        sandbox.window.getLang = () => 'en';
        assert.equal(CN.beide('Emergency Exit', 'R\u00fcckzug'), 'Emergency Exit',
            'Die englische Seite bleibt einsprachig — sonst steht dort Deutsch.');
        // Ein Gegenstand ohne Namen bleibt einsprachig, auch auf Deutsch:
        // der Platzhalter ist kein Name, also gibt es nichts zu uebersetzen.
        sandbox.window.getLang = () => 'de';
        assert.equal(CN.anzeige('Unknown Item 542', 'items'),
            'Von der Quelle nicht benannt (Nr. 542)');
    });

    it('Matchups und Pokédex setzen nicht selbst zusammen', () => {
        for (const datei of ['js/app-side-quest-matchups.js', 'js/app-side-quest-pokedex.js']) {
            const s = ohneKommentare(lies(datei));
            assert.match(s, /window\.ChampionsNamen\.beide\(/,
                `${datei} baut den zweisprachigen Namen selbst statt ueber `
                + 'champions-namen.js — das waeren zwei Wahrheiten.');
        }
    });

    it('der Gegenstands-Reiter setzt bewusst NICHT zusammen', () => {
        // Er zeigt beide Namen schon in zwei Zeilen (.sqi-name/.sqi-en) und
        // sortiert nach dem deutschen. Ein zusammengesetzter Wert wuerde den
        // englischen doppeln und die Liste nach der englischen Haelfte sortieren.
        const s = ohneKommentare(lies('js/app-side-quest-items.js'));
        const fn = s.match(/function deName\(en\)[\s\S]*?\n    \}/);
        assert.ok(fn, 'deName() steht nicht mehr im Gegenstands-Reiter');
        assert.doesNotMatch(fn[0], /\.beide\(/);
        assert.match(s, /class="sqi-en"/,
            'Faellt die zweite Zeile weg, zeigt der Reiter nur noch einen Namen '
            + '— dann gehoert deName() doch ueber beide().');
    });

    it('die Nutzungsansicht schlaegt jede Art in ihrem eigenen Topf nach', () => {
        // Bis zum 15.09.2026 stand hier fest 'items', und dieselbe
        // Zeilenfunktion malte Attacken, Gegenstaende UND Faehigkeiten.
        // Eine Attacke in der Gegenstandstabelle zu suchen findet nie etwas.
        const s = ohneKommentare(lies('js/app-side-quest-usage.js'));
        for (const [feld, art] of [['block.move', 'moves'],
                                   ['block.held_item', 'items'],
                                   ['block.ability', 'abilities']]) {
            const zeile = s.match(new RegExp('barPanel\\([^,]+,\\s*' + feld.replace('.', '\\.') + ',\\s*(\\w+)'));
            assert.ok(zeile, `Der Kasten fuer ${feld} steht nicht mehr da`);
            const name = zeile[1];
            const def = s.match(new RegExp('const ' + name + " = zeile\\('([a-z]+)'\\)"));
            assert.ok(def, `${name} wird nicht mehr ueber zeile(<art>) gebaut`);
            assert.equal(def[1], art,
                `${feld} wird als "${def[1]}" nachgeschlagen, nicht als "${art}".`);
        }
        assert.match(s, /zeigName\(n\.name, 'nature'\)/,
            'Wesen wurden frueher gar nicht nachgeschlagen und blieben englisch.');
    });
});

describe('Die Namen, die die Oberflaeche zeigen muss, liegen deutsch vor', () => {

    it('kein benutzter Faehigkeits- oder Attackenname ohne Deutsch', () => {
        const usage = json('data/champions_usage.json');
        const namen = json('data/champions_names_de.json');
        const benutzt = {};
        Object.values(usage.pokemon || {}).forEach(rec => {
            Object.values(rec || {}).forEach(blk => {
                if (!blk || typeof blk !== 'object') return;
                Object.entries(blk).forEach(([feld, arr]) => {
                    if (!Array.isArray(arr)) return;
                    arr.forEach(e => {
                        const n = e && typeof e === 'object' ? String(e.name || '').trim() : '';
                        if (n) (benutzt[feld] = benutzt[feld] || new Set()).add(n);
                    });
                });
            });
        });
        for (const [feld, topf] of [['ability', 'abilities'], ['move', 'moves']]) {
            const tabelle = namen[topf] || {};
            const fehlt = [...(benutzt[feld] || [])].filter(n => !String(tabelle[n] || '').trim());
            assert.deepEqual(fehlt, [],
                `${fehlt.length} von ${(benutzt[feld] || new Set()).size} benutzten `
                + `Eintraegen in "${topf}" haben keinen deutschen Namen. Auf der `
                + 'deutschen Seite stehen sie englisch da — genau der Befund vom '
                + '15.09.2026 ("emergency exit heisst auf Deutsch sicher anders"). '
                + 'Nachtragen in data/champions_ability_overrides.json bzw. '
                + 'data/champions_namen_entschieden.json, MIT Quelle; nicht raten.');
        }
    });

    it('Emergency Exit heisst Rueckzug — der gemeldete Fall selbst', () => {
        const namen = json('data/champions_names_de.json');
        assert.equal(namen.abilities['Emergency Exit'], 'R\u00fcckzug');
        const ov = json('data/champions_ability_overrides.json').abilities['Emergency Exit'];
        assert.ok(ov, 'Der Name steht nur in der ERZEUGTEN Tabelle. Der naechste '
            + 'Bau von scripts/build_champions_pokedex.py wirft ihn wieder raus.');
        assert.equal(ov.de, 'R\u00fcckzug');
        assert.match(ov._source, /ability_names\.csv/,
            'Jeder nachgetragene Name traegt seine Quelle. Ohne Quelle ist er geraten.');
        assert.match(ov._source, /pokewiki\.de/,
            'Zwei unabhaengige Quellen — die Entscheidungsdatei verlangt es so, '
            + 'nachdem drei Agentenlaeufe vier Namen falsch gemeldet hatten.');
    });

    it('jeder nachgetragene Name traegt eine Quelle', () => {
        const ov = json('data/champions_ability_overrides.json').abilities;
        const ohne = Object.entries(ov)
            .filter(([, v]) => !String((v && v._source) || (v && v.quelle) || '').trim())
            .map(([k]) => k);
        // Die drei Champions-eigenen Faehigkeiten haben keine oeffentliche
        // Quelle; sie stehen in der Datei mit einer Notiz statt _source.
        assert.ok(ohne.length <= 3,
            `Ohne Quellenangabe: ${ohne.join(', ')}`);
        const ent = json('data/champions_namen_entschieden.json').namen;
        Object.entries(ent.moves || {}).forEach(([en, v]) => {
            assert.ok(String((v && v.quelle) || '').trim(),
                `Attacke "${en}" steht in der Entscheidungsdatei ohne Quelle.`);
        });
    });
});

describe('Der Luecken-Waechter sieht fehlende deutsche Namen', () => {

    it('die Pruefung steht im Melder und in der Klassenliste', () => {
        const s = lies('scripts/datenluecken.py');
        // Kommentare in Python: alles ab '#' bis Zeilenende.
        const rein = s.split('\n').map(z => z.replace(/(^|[^"'])#.*$/, '$1')).join('\n');
        assert.match(rein, /def benutzte_namen_ohne_deutsch\(\)/,
            'Ohne diese Pruefung faellt die naechste fehlende Uebersetzung '
            + 'wieder erst dem Betreiber auf.');
        assert.match(rein, /PRUEFUNGEN = \[[\s\S]*?benutzte_namen_ohne_deutsch/,
            'Eine Pruefung, die nicht in PRUEFUNGEN steht, laeuft nie.');
        assert.match(rein, /"deutscher-name": \{/,
            'Ohne Klassenname zeigt der Admin-Bereich den rohen Schluessel an.');
    });
});
