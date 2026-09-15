/**
 * Zwei Befunde des Betreibers vom 15.09.2026:
 *
 *   "wieso wird Tandrak bei Pokemon nicht angezeigt? weil ohne Tandrak
 *    kein Mega Tandrak"
 *
 *   "und auch als Filter alle nicht shiny markierten Pokemon anzeigen
 *    damit ich weiß was ich noch besorgen muss"
 *
 * 1. OHNE GRUNDFORM KEINE MEGA-FORM.
 *    Der Pokedex fuehrte ACHT Mega-Formen ohne ihre Grundform: Sceptile,
 *    Scolipede, Eelektross, Pyroar, Malamar, Barbaracle, Dragalge
 *    (Tandrak) und Falinks. Ursache ist die Quelle: pokebase.app fuehrt
 *    die Mega-Seiten, die Grundform-Seiten aber nicht.
 *
 *    Geraten wird dabei nichts. Zwei unabhaengige Belege:
 *      · die Spielmechanik — eine Mega-Form entsteht AUS ihrer Grundform;
 *      · champions_usage.json — championsbattledata.com fuehrt fuer alle
 *        acht echte Nutzungszeilen aus dem Ranglistenbetrieb.
 *    Die Basiswerte kommen aus derselben Smogon-Datei wie bei jedem
 *    anderen Schluessel; wer dort fehlt, kommt nicht herein.
 *
 * 2. DER FILTER BEANTWORTET JETZT BEIDE HAELFTEN DERSELBEN FRAGE.
 *    "was habe ich" UND "was fehlt mir noch". Zwei Knoepfe, weil jeder
 *    seine eigene Zahl traegt — und genau die Zahl ist die Auskunft.
 *
 * Kommentare werden vor jeder Textsuche entfernt (CLAUDE.md, "Dein
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

const POKEDEX_JS = ohneKommentare(lies('js/app-side-quest-pokedex.js'));
const SCRAPER = lies('scripts/scrape_champions_roster.py')
    .split('\n').map(z => z.replace(/(^|[^"'])#.*$/, '$1')).join('\n');

/** "Mega Dragalge" -> "Dragalge"; "Mega Raichu Y" -> "Raichu". */
function grundformAus(en) {
    const m = /^Mega (.+?)(?: [XYZ])?$/.exec(String(en || ''));
    return m ? m[1] : null;
}

describe('Ohne Grundform keine Mega-Form', () => {

    it('jede Mega-Form im Pokedex hat ihre Grundform', () => {
        const dex = json('data/champions_pokedex.json');
        const namen = new Set(dex.entries.map(e => e.en));
        const verwaist = dex.entries
            .map(e => e.en)
            .filter(en => {
                const g = grundformAus(en);
                return g && !namen.has(g);
            });
        assert.deepEqual(verwaist, [],
            'Diese Mega-Formen stehen ohne ihre Grundform im Pokedex. Wer '
            + 'Mega-Tandrak spielt, hat Tandrak — die Liste behauptet sonst, '
            + 'es gaebe die Grundform im Spiel nicht.');
    });

    it('Tandrak selbst — der gemeldete Fall', () => {
        const dex = json('data/champions_pokedex.json');
        const basis = dex.entries.find(e => e.en === 'Dragalge');
        const mega = dex.entries.find(e => e.en === 'Mega Dragalge');
        assert.ok(mega, 'Mega Dragalge steht nicht mehr im Pokedex');
        assert.ok(basis, 'Dragalge fehlt — genau der gemeldete Fall');
        assert.equal(basis.de, 'Tandrak');
        assert.ok(basis.hp && basis.hp.base > 0,
            'Die Grundform steht ohne Basiswerte da — dann ist die Zeile leer '
            + 'und behauptet trotzdem etwas.');
    });

    it('die ergaenzten Grundformen sind BELEGT, nicht abgeleitet', () => {
        // Die Ableitung "Mega impliziert Grundform" reicht als Begruendung,
        // aber nicht als Beleg dafuer, dass die Art im Format WIRKLICH
        // gespielt wird. Den liefert eine unabhaengige Quelle.
        const extra = json('data/champions_roster_extra.json');
        const ausMega = extra._meta.aus_mega || [];
        assert.ok(ausMega.length > 0,
            'kein einziger Eintrag aus einer Mega-Form abgeleitet — dann '
            + 'greift die Regel nicht mehr');
        const usage = json('data/champions_usage.json').pokemon;
        const ohneBeleg = ausMega.filter(n => !usage[n.toLowerCase()]);
        assert.deepEqual(ohneBeleg, [],
            'Fuer diese ergaenzten Grundformen fuehrt champions_usage.json '
            + 'KEINE Nutzungszeile. Dann steht die Ableitung allein da, und '
            + 'das ist in diesem Projekt zu wenig.');
        assert.equal(extra._meta.aus_mega_count, ausMega.length,
            'die Bilanz in _meta passt nicht zur Liste');
    });

    it('jede ergaenzte Grundform hat Smogon-Werte', () => {
        const extra = json('data/champions_roster_extra.json');
        const smogon = json('data/pokemon_battle_data.json');
        /* Drei Ableitungen, eine Bedingung: ohne Basiswerte kommt
           nichts herein. Am 15.09.2026 sind aus_teams und
           geschlechtsformen dazugekommen — sie stehen hier mit drin,
           damit die Regel nicht fuer die eine Quelle gilt und fuer die
           anderen beiden nicht. */
        const ableitungen = []
            .concat(extra._meta.aus_mega || [])
            .concat(extra._meta.aus_teams || [])
            .concat(extra._meta.geschlechtsformen || []);
        assert.ok(ableitungen.length >= 8,
            `nur ${ableitungen.length} abgeleitete Schluessel — Datenlage pruefen`);
        const ohne = ableitungen.filter(n => !(smogon[n] && smogon[n].baseStats));
        assert.deepEqual(ohne, [],
            'Ohne Basiswerte waere der Eintrag eine leere Zeile. Wer dort '
            + 'fehlt, kommt NICHT herein.');
        // Und jeder abgeleitete Schluessel steht auch wirklich in der Liste.
        const fehlt = ableitungen.filter(n => extra.smogonKeys.indexOf(n) === -1);
        assert.deepEqual(fehlt, [],
            'im _meta genannt, aber nicht in smogonKeys — dann behauptet die '
            + 'Datei eine Ableitung, die sie nicht ausliefert');
    });

    it('eine Geschlechtsform kommt nur mit eigener Nutzungszeile herein', () => {
        /* Bestellt am 15.09.2026: "bei Salmagnis müssen wir einen
           unterschied zwischen männlich und weiblich machen. Generell da
           wo männlich und weiblich unterschiedliche Statuswerte und
           entsprechend unterschiedliche Nutzung haben."

           Der belegbare Teil davon ist die NUTZUNG: fuehrt
           championsbattledata.com eine eigene Zeile, wird die Form
           getrennt gespielt. Ohne diese Bedingung kaeme Oinkologne-F
           herein — Smogon kennt es, das Spiel offenbar nicht. */
        const extra = json('data/champions_roster_extra.json');
        const usage = json('data/champions_usage.json');
        const zeilen = Object.keys(usage.pokemon || {});
        const formen = extra._meta.geschlechtsformen || [];
        assert.ok(formen.length >= 1, 'keine Geschlechtsform abgeleitet');
        formen.forEach(n => {
            assert.ok(zeilen.indexOf(n.toLowerCase()) !== -1,
                `${n} hat keine eigene Nutzungszeile`);
        });
        assert.ok(extra.smogonKeys.indexOf('Oinkologne-F') === -1,
            'Oinkologne-F hat keine Nutzungszeile und darf nicht im Kader stehen');
        assert.match(SCRAPER, /if form\.lower\(\) not in zeilen:/,
            'die Bedingung fehlt im Scraper — dann kommt sie beim naechsten Lauf weg');
    });

    it('die Regel steht im SCRAPER, nicht nur in der erzeugten Datei', () => {
        // data/champions_roster_extra.json wird von
        // champions-replica-scrape.yml TAEGLICH neu geschrieben. Wer die
        // Schluessel nur dort eintraegt, verliert sie beim naechsten Lauf —
        // mit rotem Test und angehaltenem Deploy. Das steht so auch im
        // Kopf von scripts/scrape_champions_roster.py.
        assert.match(SCRAPER, /aus_mega = \[\]/,
            'Die Ableitung fehlt im Scraper.');
        assert.match(SCRAPER, /grundform = k\.split\("-Mega"\)\[0\]/);
        /* Die Reihenfolge der Summanden ist gleichgueltig, die
           ANWESENHEIT nicht: fiele `aus_mega` aus der Liste, waere die
           Ableitung darueber folgenlos. Seit dem 15.09.2026 stehen zwei
           weitere Quellen daneben (aus Teams, Geschlechtsformen); eine
           auf die Schreibweise gepinnte Zusicherung haette das
           verboten, ohne eine Eigenschaft zu pruefen. */
        /* Am Aufbau der Liste verankert, nicht an der ersten `for`-Zeile
           der Datei: die traf beim ersten Anlauf die Mega-Schleife
           darueber und meldete prompt "base fehlt". */
        const liste = /seen, keys = set\(\), \[\][\s\S]{0,80}?for k in ([^:]+):/.exec(SCRAPER);
        assert.ok(liste, 'die Schluesselliste wird nicht mehr zusammengesetzt');
        ['base', 'aus_mega', 'megas', 'formen'].forEach(teil => {
            assert.ok(liste[1].indexOf(teil) !== -1,
                `${teil} landet nicht in der Schluesselliste.`);
        });
        assert.match(SCRAPER, /if grundform in smogon and "baseStats" in smogon\[grundform\]/,
            'Ohne diese Bedingung kaeme eine Grundform ohne Werte herein.');
        assert.match(SCRAPER, /ohne_werte/,
            'Eine Mega-Form ohne Grundform UND ohne Werte muss gemeldet '
            + 'werden, nicht still uebergangen.');
    });

    it('die Regel haengt an ihrer Bedingung, nicht an acht Namen', () => {
        // CLAUDE.md, "Eine Regel gehoert an ihre Bedingung": der Kader der
        // Quelle dreht sich woechentlich. Eine Handliste waere in einer
        // Woche falsch — in beide Richtungen.
        for (const name of ['Dragalge', 'Sceptile', 'Malamar', 'Falinks',
                            'Barbaracle', 'Pyroar', 'Scolipede', 'Eelektross']) {
            assert.ok(!SCRAPER.includes(`"${name}"`),
                `${name} steht als Name im Scraper. Die Ableitung soll aus den `
                + 'Mega-Schluesseln kommen, nicht aus einer Liste.');
        }
    });
});

describe('Der Shiny-Filter beantwortet beide Haelften der Frage', () => {

    it('er hat drei Zustaende, nicht zwei', () => {
        assert.match(POKEDEX_JS, /let _shinyFilter = 'alle';/,
            'Der Filter ist wieder ein Ja/Nein — dann fehlt "was fehlt mir noch".');
        assert.ok(!/_nurShiny/.test(POKEDEX_JS),
            'Der alte Zweizustands-Schalter steht noch da; zwei Wahrheiten '
            + 'ueber denselben Filter.');
    });

    it('"noch offen" ist die GEGENMENGE, nicht eine eigene Liste', () => {
        assert.match(POKEDEX_JS, /_shinyFilter === 'meine' \? CS\.hat\(e\) : !CS\.hat\(e\)/,
            'Ohne die Verneinung zeigt der zweite Filter irgendetwas, nur '
            + 'nicht das Fehlende.');
        assert.match(POKEDEX_JS, /if \(_shinyFilter === 'alle'\) return true;/,
            'Ohne diesen Ausstieg filtert der Pokedex immer.');
        assert.match(POKEDEX_JS, /if \(!CS\) return true;/,
            'Ohne das Shiny-Modul muss die Liste VOLL bleiben, nicht leer.');
    });

    it('beide Knoepfe tragen ihre eigene Zahl', () => {
        assert.match(POKEDEX_JS, /data-sqp-shiny="meine"/);
        assert.match(POKEDEX_JS, /data-sqp-shiny="offen"/);
        assert.match(POKEDEX_JS, /const offenN = /,
            'Ohne eigene Zahl ist der zweite Knopf nur ein Schalter — die '
            + 'Zahl IST die Auskunft ("31 habe ich, 275 fehlen").');
        // Gezaehlt, nicht gerechnet: "alle minus markierte" waere falsch,
        // sobald eine Marke fuer einen Eintrag existiert, den der Pokedex
        // gerade nicht fuehrt.
        assert.match(POKEDEX_JS, /_entries\.filter\(e => !window\.ChampionsShiny\.hat\(e\)\)\.length/,
            'Die offene Zahl wird gerechnet statt gezaehlt.');
        assert.doesNotMatch(POKEDEX_JS, /offenN = [^\n]*anzahl\(\)/,
            'offenN darf nicht aus der Markenzahl abgeleitet werden.');
    });

    it('derselbe Knopf nochmal schaltet zurueck auf alle', () => {
        assert.match(POKEDEX_JS, /_shinyFilter = \(_shinyFilter === wunsch\) \? 'alle' : wunsch;/,
            'Sonst kommt man aus dem Filter nur ueber den anderen wieder heraus.');
    });

    it('eine gesetzte Marke zieht BEIDE Zahlen nach', () => {
        // Gemessen am 15.09.2026: host.querySelector('.sqp-shinyfilter b')
        // traf ab dem zweiten Knopf nur noch den ersten. "noch offen" stand
        // auf 306, waehrend drei Marken gesetzt waren.
        assert.match(POKEDEX_JS, /\[data-sqp-shiny="meine"\] b/);
        assert.match(POKEDEX_JS, /\[data-sqp-shiny="offen"\] b/,
            'Die zweite Zahl wird beim Setzen einer Marke nicht nachgezogen — '
            + 'eine Zahl, die dem Bestand hinterherlaeuft, ist schlechter als '
            + 'keine.');
    });

    it('beide Beschriftungen stehen in beiden Sprachen', () => {
        for (const schluessel of ['nochOffen', 'nochOffenHint']) {
            const n = POKEDEX_JS.split(schluessel + ':').length - 1;
            assert.equal(n, 2, `${schluessel} steht ${n}-mal statt zweimal (DE und EN)`);
        }
    });

    it('die beiden aktiven Zustaende sehen verschieden aus', () => {
        const css = ohneKommentare(lies('css/side-quest.css'));
        const gold = css.match(/\.sqp-shinyfilter\.is-active \{[^}]*\}/);
        const blau = css.match(/\.sqp-shinyfilter--offen\.is-active \{[^}]*\}/);
        assert.ok(gold, '.sqp-shinyfilter.is-active steht nicht mehr im CSS');
        assert.ok(blau, '.sqp-shinyfilter--offen.is-active fehlt');
        const farbe = (b) => (b[0].match(/background:\s*([^;]+);/) || [])[1];
        assert.ok(farbe(gold) && farbe(blau), 'einer der beiden hat keine Fuellung');
        assert.notEqual(farbe(gold).trim(), farbe(blau).trim(),
            'Zwei Filter, die sich gegenseitig ausschliessen, duerfen im '
            + 'aktiven Zustand nicht gleich aussehen — sonst muss man die '
            + 'Beschriftung lesen, um zu wissen, welcher greift.');
    });
});
