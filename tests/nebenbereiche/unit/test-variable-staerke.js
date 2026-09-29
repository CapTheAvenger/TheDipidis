/**
 * Attacken mit situationsabhaengiger Staerke.
 *
 * BEFUND (09.09.2026, bei der Abnahme des Attacken-Nachtrags): Annihilapes
 * meistgenutzte Attacke ist Zornesfaust — 97,3 % der Saetze im Einzelkampf.
 * In den Daten steht Staerke 50; wirklich sind es 50 + 50 fuer jeden
 * einsteckenden Treffer, bis 350. Der Rechner zeigte die 50 ohne jeden
 * Vorbehalt, und der Schadensbalken daneben ebenso.
 *
 * Die Zahl selbst ist richtig und bleibt: die Grundstaerke ist die einzige,
 * die in den Daten steht. Eine Hochrechnung waere geraten — wie oft ein
 * Annihilape getroffen wurde, weiss niemand. Was fehlte, war der Hinweis,
 * dass es eine UNTERGRENZE ist.
 *
 * Erkannt wird am englischen Effekttext, weil der formelhaft ist ("Power is
 * equal to 50+(X*50)", "Power doubles if …"). Der deutsche ist es nicht —
 * dieselbe Begruendung, aus der test-stufen-im-text.js die Stufenzahl aus
 * dem englischen Text liest.
 *
 * Geprueft wird hier die REGEL an den echten Daten, nicht eine Wochenzahl:
 * dass die bekannten variablen Attacken erkannt werden, dass die bekannten
 * festen es nicht werden, und dass die Markierung in der gerenderten Zeile
 * wirklich ankommt.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'app-side-quest-matchups.js'), 'utf8');
const DMG = fs.readFileSync(path.join(ROOT, 'js', 'champions-damage.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'css', 'side-quest.css'), 'utf8');

const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const DATA = {
    usage: read('champions_usage.json'),
    dex: read('champions_pokedex.json'),
    teams: read('champions_replica_teams.json'),
    res: read('champions_resources.json'),
    chart: read('champions_type_chart.json'),
    names: read('champions_names_de.json'),
};

function load(lang = 'de') {
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
    api.setData(DATA);
    return api;
}

const moves = DATA.res.entries.filter(e => e.cat === 'move');
const byEn = new Map(moves.map(m => [m.en, m]));

describe('variable Staerke wird erkannt', () => {
    const api = load();

    it('die bekannten Faelle sind markiert', () => {
        // Handverlesen aus den Daten: jede dieser Attacken sagt in ihrem
        // englischen Text ausdruecklich, dass die Staerke sich aendert.
        for (const en of ['Rage Fist', 'Stored Power', 'Power Trip', 'Facade',
            'Weather Ball', 'Water Spout', 'Eruption', 'Acrobatics', 'Hex',
            'Venoshock', 'Barb Barrage', 'Avalanche', 'Payback',
            'Last Respects', 'Stomping Tantrum']) {
            const m = byEn.get(en);
            assert.ok(m, `${en} fehlt in den Attackendaten`);
            assert.equal(api.staerkeVariabel(m), true,
                `${en} muesste als variabel erkannt werden: ${m.en_effect}`);
        }
    });

    it('feste Attacken sind es nicht', () => {
        for (const en of ['Thunderbolt', 'Close Combat', 'Earthquake',
            'Rock Slide', 'Iron Head', 'Flamethrower', 'Surf', 'Knock Off',
            'Sucker Punch', 'Make It Rain']) {
            const m = byEn.get(en);
            assert.ok(m, `${en} fehlt`);
            assert.equal(api.staerkeVariabel(m), false,
                `${en} ist faelschlich als variabel markiert`);
        }
    });

    it('leere und fehlende Eintraege werfen nicht', () => {
        assert.equal(api.staerkeVariabel(null), false);
        assert.equal(api.staerkeVariabel(undefined), false);
        assert.equal(api.staerkeVariabel({}), false);
        assert.equal(api.staerkeVariabel({ en_effect: '' }), false);
    });

    it('die Regel trifft eine Minderheit, nicht alles und nicht nichts', () => {
        // Ohne diese Schranke koennte die Regel zu "immer wahr" oder
        // "immer falsch" verkommen, und beide Zusicherungen oben blieben
        // trotzdem gruen, wenn jemand die Listen mitzieht.
        const mitStaerke = moves.filter(m => m.power);
        const variabel = mitStaerke.filter(m => api.staerkeVariabel(m));
        assert.ok(mitStaerke.length > 200, `nur ${mitStaerke.length} Schadensattacken`);
        assert.ok(variabel.length >= 10,
            `nur ${variabel.length} variable Attacken — die Regel greift zu selten`);
        assert.ok(variabel.length <= mitStaerke.length / 4,
            `${variabel.length} von ${mitStaerke.length} als variabel markiert — `
            + 'die Regel greift zu breit');
    });

    it('keine Statusattacke wird markiert', () => {
        // Eine Statusattacke richtet keinen typabhaengigen Schaden an;
        // eine Staerke-Markierung an ihr waere sinnlos.
        //
        // Nicht ueber `!m.power` pruefen — das faengt auch Heat Crash und
        // Electro Ball, deren Staerke sich vollstaendig aus Gewicht bzw.
        // Initiative ergibt und in den Daten deshalb mit 0 steht. Die
        // sind Schadensattacken, nur ohne Grundwert; sie erscheinen aus
        // demselben Grund gar nicht erst im Rechner.
        const status = moves.filter(
            m => String(m.damage_class || '') === 'Status' && api.staerkeVariabel(m));
        assert.deepEqual(status.map(m => m.en), [],
            'Statusattacken als variabel markiert');
    });
});

describe('die Markierung kommt in der Zeile an', () => {
    it('der Hinweis steht als eigener Vorbehalt im Stylesheet', () => {
        assert.match(CSS, /\.sq-console \.sq-calc-variabel\s*\{/,
            'sq-calc-variabel hat keine eigene Regel');
        const regel = CSS.slice(CSS.indexOf('.sq-console .sq-calc-variabel'));
        assert.match(regel.slice(0, 160), /--vorbehalt/,
            'der Hinweis nutzt nicht die Vorbehalts-Farbe wie die '
            + 'Nachbarhinweise (Flaeche, Ziel unbekannt)');
    });

    it('der Renderer haengt den Hinweis an die Staerke, nicht irgendwohin', () => {
        // Quelltextpruefung, weil dmgTable() nicht exportiert ist: der
        // Aufruf muss unmittelbar hinter der Staerke stehen.
        const i = SRC.indexOf('esc(r.move.power)');
        assert.ok(i > 0, 'die Staerke wird nicht mehr so gerendert');
        const danach = SRC.slice(i, i + 220);
        assert.match(danach, /staerkeVariabel\(r\.move\)/,
            'die Markierung haengt nicht an der Staerke');
        assert.match(danach, /sq-calc-variabel/);
        assert.match(danach, /grundstaerkeTitel/,
            'ohne Titel erklaert der Hinweis nichts');
    });

    it('beide Sprachen fuehren Beschriftung und Erklaerung', () => {
        for (const lang of ['de', 'en']) {
            const api = load(lang);
            assert.ok(api, lang);
        }
        assert.match(SRC, /grundstaerke: 'Grundstärke'/);
        assert.match(SRC, /grundstaerke: 'base power'/);
        // Die Erklaerung muss die Untergrenze benennen, sonst liest sich
        // der Hinweis wie eine Fussnote ohne Aussage.
        const de = SRC.slice(SRC.indexOf("grundstaerkeTitel:"), SRC.indexOf("grundstaerkeTitel:") + 500);
        assert.match(de, /kleinstmöglichen|Untergrenze|darüber/,
            'die deutsche Erklaerung sagt nicht, dass die Zahl eine Untergrenze ist');
    });
});
