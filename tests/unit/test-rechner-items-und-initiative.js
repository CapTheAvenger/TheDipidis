/**
 * DREI PUNKTE AUS DEM DURCHGANG VOM 16.09.2026 — je gegen das
 * VERHALTEN geprueft, nicht gegen den Wortlaut.
 *
 * 1. GEGENSTANDS-BILDER
 *    „koennen wir bei den items auch noch den Champions sprite anzeigen.
 *     WEil mir sagt nicht automatisch jeder Name was aber die Optik
 *     schon"
 *    Was hier schiefgehen kann: ein Dateiname im Manifest, zu dem es
 *    keine Datei gibt (kaputtes Bild in der Liste), oder ein
 *    Ersatzbild fuer einen Gegenstand, den PokeAPI gar nicht kennt —
 *    ein Bild, das etwas anderes behauptet, als es zeigt.
 *
 * 2. INITIATIVE UNTER DEM SPRITE
 *    „Vll zeigen wir einfach den Initiative Wert unter dem Pokemon Bild
 *     bei mein Kader und beim Gegner"
 *    Was hier schiefgehen kann: eine Zahl, die NICHT die ist, mit der
 *    gerechnet wird. Geprueft wird deshalb gegen initiative() selbst,
 *    und die Rueckenwind-Probe zeigt, dass die Zahl mitgeht.
 *
 * 3. DEUTSCH UND ENGLISCH BEI FORMEN
 *    „bitte wie immer deutschen und englischen Namen suchen lassen,
 *     weil so ist doof" — im Suchfeld stand „Mega Golisopod" ohne
 *    deutschen Namen.
 *    Was hier schiefgehen kann: ein Name, den wir uns ausdenken.
 *    Geprueft wird gegen data/champions_pokedex.json, nicht gegen eine
 *    Liste im Testcode — und ohne einen Namen fest einzutippen.
 *
 * KEINE LIVEDATEN, KEIN jsdom.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'app-side-quest-matchups.js'), 'utf8');
const DMG = fs.readFileSync(path.join(ROOT, 'js', 'champions-damage.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'css', 'side-quest.css'), 'utf8');

const ohneKommentare = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'`])\/\/.*$/gm, '$1');
const SRC_C = ohneKommentare(SRC);
const CSS_C = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
/* Gegenprobe zum Ausschneiden selbst (CLAUDE.md, 13./14.09.2026). */
assert.ok(SRC_C.length > SRC.length * 0.3, 'das Ausschneiden hat zu viel entfernt (js)');
assert.ok(CSS_C.length > CSS.length * 0.3, 'das Ausschneiden hat zu viel entfernt (css)');

const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const ITEMBILD = read('champions_item_sprites.json');
const DATA = {
    usage: read('champions_usage.json'),
    dex: read('champions_pokedex.json'),
    teams: read('champions_replica_teams.json'),
    res: read('champions_resources.json'),
    chart: read('champions_type_chart.json'),
    names: read('champions_names_de.json'),
    flags: read('champions_move_flags.json'),
    itembild: ITEMBILD,
};

function load(lang = 'de', daten = DATA) {
    const sandbox = {
        console,
        document: { addEventListener() {}, getElementById: () => null, createElement: () => ({}) },
        getLang: () => lang,
        fetch: () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) }),
        BASE_PATH: 'data/',
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(DMG, sandbox);
    vm.runInContext(SRC, sandbox);
    const api = sandbox._sqMatchupInternals;
    api.setData(daten);
    return { api, sandbox };
}

/** Der Gegenstandsblock eines Pokemon aus den echten Nutzungsdaten. */
function ersterMitItems(api) {
    for (const r of api.setData(DATA)) {
        const satz = api.setFor(r.name, 'me');
        const block = DATA.usage.pokemon[r.slug] && DATA.usage.pokemon[r.slug].doubles;
        if (satz && block && (block.held_item || []).length >= 3) {
            return { name: r.name, satz, block };
        }
    }
    throw new Error('kein Pokemon mit mindestens drei Gegenstaenden in den echten Daten');
}

// ══════════════════════════════════════════════════════════════════════

describe('Die Gegenstands-Auswahl zeigt Bilder', () => {
    it('das Feld ist kein <select> mehr, sondern eine eigene Liste', () => {
        /* NUR im Set-Editor suchen. Ein Muster ueber die ganze Datei
           faengt jedes andere Auswahlfeld mit. */
        const a = SRC_C.indexOf('function setEditor(');
        assert.ok(a !== -1, 'setEditor nicht gefunden');
        const b = SRC_C.indexOf('\n    function ', a + 10);
        const block = SRC_C.slice(a, b);
        assert.ok(block.indexOf('itemWahl(side, set, block)') !== -1,
            'der Set-Editor ruft die Bildliste nicht auf');
        assert.ok(!/data-sq-field="item"/.test(block),
            'das alte Auswahlfeld fuer Gegenstaende steht noch im Set-Editor');
    });

    it('jede Zeile mit Bild nennt eine Datei, die es WIRKLICH gibt', () => {
        const { api } = load();
        const { name, satz, block } = ersterMitItems(api);
        api.itemState('me');
        const html = api.itemWahl('me', satz, block);
        const dateien = [...html.matchAll(/images\/champions-items\/([^"]+)/g)].map(m => m[1]);
        assert.ok(dateien.length > 0, `${name} zeigt gar kein Gegenstandsbild`);
        dateien.forEach(d => {
            assert.ok(fs.existsSync(path.join(ROOT, 'images', 'champions-items', d)),
                `die Liste verweist auf images/champions-items/${d} — die Datei fehlt`);
        });
    });

    it('wo es kein Bild gibt, steht KEIN Ersatzbild', () => {
        /* Der Fall wird aus den echten Daten geholt, nicht eingetippt:
           gesucht ist ein Gegenstand, den das Manifest nicht fuehrt
           (fast durchweg Champions-eigene Mega-Steine). */
        const { api } = load();
        const ohne = Object.keys(DATA.usage.pokemon)
            .flatMap(k => ((DATA.usage.pokemon[k].doubles || {}).held_item || []))
            .map(i => i.name)
            .find(n => !ITEMBILD.sprites[n]);
        assert.ok(ohne, 'kein Gegenstand ohne Bild in den Daten — die Probe greift nicht');
        const html = api.itemBildHtml(ohne);
        assert.ok(/sq-item-leerbild/.test(html),
            `${ohne} bekommt kein leeres Feld, sondern etwas anderes`);
        assert.ok(!/<img/.test(html), `${ohne} bekommt ein fremdes Bild untergeschoben`);
    });

    it('die Liste bietet „kein Item" und jeden Gegenstand als Knopf an', () => {
        const { api } = load();
        const { satz, block } = ersterMitItems(api);
        api.itemState('me');
        const html = api.itemWahl('me', satz, block);
        const knoepfe = (html.match(/data-sq-itemwahl="me"/g) || []).length;
        assert.equal(knoepfe, block.held_item.length + 1,
            'die Liste zeigt nicht jeden Gegenstand plus die Leerzeile');
        assert.ok(/data-sq-itemname=""/.test(html), 'die Zeile „kein Item" fehlt');
    });

    it('zugeklappt steht keine Liste im HTML — sonst waere der Knopf sinnlos', () => {
        const { api } = load();
        const { satz, block } = ersterMitItems(api);
        api.itemState('');
        const zu = api.itemWahl('me', satz, block);
        api.itemState('me');
        const auf = api.itemWahl('me', satz, block);
        assert.ok(!/data-sq-itemwahl/.test(zu), 'die Liste steht auch zugeklappt im HTML');
        assert.ok(/data-sq-itemwahl/.test(auf), 'die Liste fehlt auch aufgeklappt');
        assert.ok(auf.length > zu.length, 'Auf- und Zuklappen aendern nichts');
    });

    it('beide Namen stehen an der Zeile, nicht nur der englische', () => {
        const { api } = load('de');
        const { block, satz } = ersterMitItems(api);
        api.itemState('me');
        const html = api.itemWahl('me', satz, block);
        /* Einen Gegenstand aus DIESER Liste nehmen, zu dem die
           Namenstabelle einen abweichenden deutschen Namen fuehrt —
           gesucht zur Laufzeit, nicht eingetippt. */
        const mitDe = block.held_item
            .map(i => i.name)
            .find(n => DATA.names.items[n] && DATA.names.items[n] !== n);
        assert.ok(mitDe, 'kein Gegenstand mit deutschem Namen in dieser Liste');
        assert.ok(html.indexOf(DATA.names.items[mitDe]) !== -1,
            `der deutsche Name von ${mitDe} fehlt in der Liste`);
        assert.ok(html.indexOf(mitDe) !== -1,
            `der englische Name ${mitDe} fehlt in der Liste`);
    });

    it('die Bildspalte hat eine Breite — auch ohne Bild', () => {
        /* Ohne feste Breite am Leerfeld stuenden die Namen der Liste auf
           zwei verschiedenen Kanten. */
        const regel = CSS_C.match(/\.sq-item-leerbild\s*\{[^}]*\}/);
        assert.ok(regel, 'keine Regel fuer das leere Bildfeld');
        assert.ok(/width:\s*26px/.test(regel[0]), 'das leere Bildfeld hat keine Breite');
    });
});

// ══════════════════════════════════════════════════════════════════════

describe('Die Initiative steht unter jedem Sprite', () => {
    it('die Zahl am Sprite ist DIE Zahl, mit der gerechnet wird', () => {
        const { api } = load();
        const roster = api.setData(DATA);
        let geprueft = 0;
        roster.filter(r => api.setFor(r.name, 'me')).slice(0, 12).forEach(r => {
            const satz = api.setFor(r.name, 'me');
            const erwartet = api.initiative(satz, api.statsOf(r.name, satz));
            const html = api.kaderChip({ name: r.name }, 'me');
            const m = html.match(/sq-kader-ini[^>]*>([^<]*)</);
            assert.ok(m, `${r.name} zeigt keine Initiative`);
            assert.ok(m[1].indexOf(String(erwartet)) !== -1,
                `${r.name}: am Sprite steht „${m[1].trim()}", gerechnet wird mit ${erwartet}`);
            geprueft += 1;
        });
        assert.ok(geprueft >= 10, `nur ${geprueft} Sprites geprueft — die Probe greift nicht`);
    });

    it('Rueckenwind verdoppelt auch die Zahl am Sprite', () => {
        const { api } = load();
        const name = api.setData(DATA).find(r => api.setFor(r.name, 'me')).name;
        const satz = api.setFor(name, 'me');
        const ohne = api.kaderIni({ name }, 'me');
        satz.rueckenwind = true;
        const mit = api.kaderIni({ name }, 'me');
        satz.rueckenwind = false;
        assert.equal(mit, ohne * 2,
            'die Zahl am Sprite geht bei Rueckenwind nicht mit — sie stammt also '
            + 'nicht aus derselben Rechnung wie die Zeile im Kopfband');
    });

    it('ohne Satz steht KEINE Zahl da — eine 0 waere eine Behauptung', () => {
        const { api } = load();
        assert.equal(api.kaderIni({ name: 'Gibt-Es-Nicht-Mon' }, 'me'), null,
            'ein Eintrag ohne Daten bekommt trotzdem eine Initiative');
        assert.ok(!/sq-kader-ini/.test(api.kaderChip({ name: 'Gibt-Es-Nicht-Mon' }, 'me')),
            'am Eintrag ohne Daten steht eine Initiative');
    });

    it('beide Seiten zeigen sie, nicht nur die eigene', () => {
        const { api } = load();
        const name = api.setData(DATA).find(r => api.setFor(r.name, 'opp')).name;
        assert.ok(/sq-kader-ini/.test(api.kaderChip({ name }, 'opp')),
            'auf der Gegnerseite fehlt die Initiative');
    });
});

// ══════════════════════════════════════════════════════════════════════

describe('Deutsch UND Englisch — auch bei Mega- und Regionalformen', () => {
    it('der Pokedex liefert den deutschen Namen, wo die Namenstabelle schweigt', () => {
        const { api } = load('de');
        /* Zur Laufzeit gesucht: eine Form, die im Pokedex einen eigenen
           deutschen Namen hat und in champions_names_de.json fehlt.
           Genau die stand vorher englisch da. */
        const fall = DATA.dex.entries.find(e =>
            e.de && e.de !== e.en && !DATA.names.pokemon[e.en]);
        assert.ok(fall, 'keine solche Form in den Daten — die Probe greift nicht');
        assert.equal(api.nurDeutsch(fall.en, 'pokemon'), fall.de,
            `${fall.en} bekommt nicht den deutschen Namen aus dem Pokedex`);
    });

    it('die Trefferliste traegt beide Namen', () => {
        const { api } = load('de');
        const liste = api.rechListe('me');
        const fall = liste.find(r => {
            const e = DATA.dex.entries.find(x => x.en === r.name);
            return e && e.de && e.de !== e.en && !DATA.names.pokemon[e.en];
        });
        assert.ok(fall, 'keine solche Form im Kader — die Probe greift nicht');
        const html = api.rechTrefferHtml('me', null);
        assert.ok(html.indexOf(fall.zeig) !== -1, `der deutsche Name ${fall.zeig} fehlt`);
        assert.ok(html.indexOf(fall.name) !== -1, `der englische Name ${fall.name} fehlt`);
        assert.notEqual(fall.zeig, fall.name, 'die Probe vergleicht denselben Namen mit sich');
    });

    it('kein erfundener Name: ohne Pokedex-Eintrag bleibt es beim englischen', () => {
        const { api } = load('de');
        assert.equal(api.artDeutsch('Gibt-Es-Nicht-Mon'), '',
            'fuer einen unbekannten Namen wird ein deutscher erfunden');
    });

    it('auf Englisch bleibt alles englisch', () => {
        const { api } = load('en');
        const fall = DATA.dex.entries.find(e => e.de && e.de !== e.en);
        assert.equal(api.nurDeutsch(fall.en, 'pokemon'), '',
            'die englische Seite zeigt deutsche Namen');
    });
});

// ══════════════════════════════════════════════════════════════════════

describe('Ohne Gegner sagt der Rechner, was fehlt — und nicht etwas Falsches', () => {
    it('„noch keiner gewaehlt" statt „keine Nutzungsdaten"', () => {
        const { api } = load('de');
        api.kaderState({ mein: [], opp: [] });
        const name = api.setData(DATA).find(r => api.setFor(r.name, 'me')).name;
        api.rechState({ me: name, opp: null });
        /* Der Satz der LEEREN FLAECHE, nicht der Hinweis in der
           Kaderleiste: beide fangen mit „Noch kein Gegner" an, und ein
           Muster darauf wuerde auch dann gruen bleiben, wenn die
           Flaeche weiter „keine Nutzungsdaten" behauptet. */
        const html = api.rechnerHtml();
        assert.ok(/dann steht hier die Rechnung/.test(html),
            'die leere Flaeche sagt nicht, dass noch kein Gegner gewaehlt ist');
        assert.ok(!/kein Set vor/.test(html),
            'der Rechner behauptet einen fehlenden Satz, obwohl nur niemand gewaehlt ist');
    });

    it('mit Gegner OHNE Daten steht weiter der Datensatz da', () => {
        /* Die Gegenrichtung: der alte Satz darf nicht verschwinden, wo
           er stimmt. */
        const { api } = load('de');
        api.kaderState({ mein: [], opp: [] });
        const name = api.setData(DATA).find(r => api.setFor(r.name, 'me')).name;
        api.rechState({ me: name, opp: 'Gibt-Es-Nicht-Mon' });
        const html = api.rechnerHtml();
        assert.ok(!/dann steht hier die Rechnung/.test(html),
            'ein gewaehlter Gegner ohne Daten wird als „nicht gewaehlt" gemeldet');
        assert.ok(/kein Set vor/.test(html),
            'der Grund (kein Satz fuer dieses Pokemon) steht nicht mehr da');
    });
});
