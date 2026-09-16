/**
 * DIE SCHNELLLEISTE, DER PASTE UND DAS AUSWAHLFENSTER.
 *
 * ANLASS (Betreiber, 16.09.2026, sieben Punkte in einer Nachricht):
 *  - „bei mein Kader sollten wir die Option geben Pokepaste bzw unseren
 *    Showdown/Limitless export zu nutzen"
 *  - „wenn ich im Team Builder ein Team gebaut habe und dann auf Damage
 *    Calc gehe dann muss zu unserem Rechner weitergeleitet werden"
 *  - „die Attacken bei du triffst sollten der korrekten Reihenfolge
 *    entsprechen und nicht nach schaden sortiert werden"
 *  - „sätze bearbeiten immer ausgeklappt lassen"
 *  - „ob und welcher schirm aktiv ist … genauso ob Rückenwind aktiv ist
 *    … die Statusstufen könnten wir da vll auch direkt zeigen"
 *  - „was soll mir … 16 Würfe … sagen? … den Platz können wir frei machen"
 *  - „beim Gegner … auch das gleiche Modal wie alle 6 schnell auswählen"
 *
 * WAS HIER GEGEN DAS VERHALTEN GEHALTEN WIRD, NICHT GEGEN DEN WORTLAUT:
 * jede Bedienung der Schnellleiste muss den GERECHNETEN Wert ändern.
 * Ein Knopf, der nur anders aussieht, ist der teuerste Fehler dieser
 * Oberfläche — er sieht aus wie eine Antwort.
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
const SQ = fs.readFileSync(path.join(ROOT, 'js', 'app-side-quest.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'css', 'side-quest.css'), 'utf8');

const ohneKommentare = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'`])\/\/.*$/gm, '$1');
const SRC_C = ohneKommentare(SRC);
const CSS_C = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
assert.ok(SRC_C.length > SRC.length * 0.3, 'das Ausschneiden hat zu viel entfernt (js)');
assert.ok(CSS_C.length > CSS.length * 0.3, 'das Ausschneiden hat zu viel entfernt (css)');

const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const DATA = {
    usage: read('champions_usage.json'),
    dex: read('champions_pokedex.json'),
    teams: read('champions_replica_teams.json'),
    res: read('champions_resources.json'),
    chart: read('champions_type_chart.json'),
    names: read('champions_names_de.json'),
    flags: read('champions_move_flags.json'),
};

/** Der ECHTE Paste-Leser aus app-side-quest.js, im selben Kontext. */
function load(lang = 'de') {
    const sandbox = {
        console,
        document: {
            addEventListener() {}, removeEventListener() {},
            getElementById: () => null, createElement: () => ({}),
            querySelector: () => null, querySelectorAll: () => [],
            body: { appendChild() {} },
        },
        localStorage: {
            _d: {},
            getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
            setItem(k, v) { this._d[k] = String(v); },
            removeItem(k) { delete this._d[k]; },
        },
        getLang: () => lang,
        fetch: () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) }),
        BASE_PATH: 'data/',
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(DMG, sandbox);
    vm.runInContext(SQ, sandbox);
    vm.runInContext(SRC, sandbox);
    const api = sandbox._sqMatchupInternals;
    api.setData(DATA);
    return { api, sandbox };
}

function ersterMitSatz(api, ausser) {
    for (const r of api.setData(DATA)) {
        if (ausser && ausser.indexOf(r.name) !== -1) continue;
        if (api.setFor(r.name, 'me')) return r.name;
    }
    throw new Error('kein Pokemon mit Satz');
}

// ══════════════════════════════════════════════════════════════════════

describe('Der Paste — derselbe Leser wie der Teams-Import', () => {
    it('app-side-quest.js bietet den Leser nach aussen an', () => {
        const { sandbox } = load();
        assert.equal(typeof sandbox.sideQuest.parsePokepaste, 'function',
            'parsePokepaste wird nicht angeboten — dann braeuchte der Rechner einen zweiten Leser');
    });

    it('ein echter Showdown-Export landet als Kader, mit SEINEN Werten', () => {
        const { api } = load();
        const name = ersterMitSatz(api);
        const paste = [
            `${name} @ Life Orb`,
            'Ability: Grassy Surge',
            'Level: 50',
            'EVs: 32 HP / 32 Atk',
            'Adamant Nature',
            '- Wood Hammer',
            '- Protect',
        ].join('\n');

        api.kaderState({ mein: [] });
        // Erst ohne Punkte, damit der Unterschied messbar ist.
        api.satzUebernehmen(name, {
            nature: 'Adamant', ability: '', item: '',
            moves: api.setFor(name, 'me').moves,
            spread: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        });
        const ohne = api.statsOf(name, api.setFor(name, 'me')).atk;

        assert.equal(api.ladePaste(paste), true, 'der Paste wurde nicht gelesen');
        const st = api.kaderState();
        assert.equal(st.mein.length, 1, 'der Kader ist leer geblieben');
        assert.equal(st.mein[0].name, name, 'der falsche Name im Kader');
        const satz = api.setFor(name, 'me');
        assert.equal(satz.item, 'Life Orb', 'das Item aus dem Paste kam nicht an');
        assert.deepEqual(JSON.parse(JSON.stringify(satz.moves)), ['Wood Hammer', 'Protect'],
            'die Attacken aus dem Paste kamen nicht an');
        assert.ok(api.statsOf(name, satz).atk > ohne,
            'die Punkte aus dem Paste aendern den Angriffswert nicht');
    });

    it('die Punkte aus dem Paste werden geklammert wie im Builder', () => {
        const { api } = load();
        const name = ersterMitSatz(api);
        api.kaderState({ mein: [] });
        api.ladePaste(`${name} @ Leftovers\nEVs: 252 HP / 252 Atk / 252 Spe\nAdamant Nature\n- Protect`);
        const sp = api.setFor(name, 'me').spread;
        const summe = ['hp', 'atk', 'def', 'spa', 'spd', 'spe']
            .reduce((s, k) => s + (Number(sp[k]) || 0), 0);
        assert.ok(summe <= api.SP_BUDGET,
            `${summe} Punkte aus dem Paste — mehr als die ${api.SP_BUDGET} von Champions`);
    });

    it('Unlesbares wird BENANNT und laesst den Kader in Ruhe', () => {
        const { api } = load();
        const name = ersterMitSatz(api);
        api.kaderState({ mein: [{ name, eigen: true }] });
        api.pasteState({ meldung: null });
        assert.equal(api.ladePaste('völliger unsinn ohne struktur'), false,
            'aus Unsinn wurde ein Team gelesen');
        assert.equal(api.kaderState().mein.length, 1, 'der Kader wurde trotzdem ueberschrieben');
        const m = api.pasteState().meldung;
        assert.ok(m && m.art === 'fehler' && m.text, 'kein Grund am Fehlschlag');
    });

    it('ein Paste mit teils unbekannten Arten bleibt stehen und benennt sie', () => {
        /* Die Gegenseite der Sperre oben: NICHT jeder unbekannte Name
           macht einen Paste ungueltig. Wer ein Team aus einem anderen
           Format hineinwirft, soll die Haelfte rechnen koennen und
           sehen, welche Art Champions nicht fuehrt. */
        const { api } = load();
        const name = ersterMitSatz(api);
        api.kaderState({ mein: [] });
        api.pasteState({ meldung: null });
        const ok = api.ladePaste(
            `${name} @ Leftovers\nAdamant Nature\n- Protect\n\n`
            + 'Gibtsnichtmon @ Leftovers\nAdamant Nature\n- Protect');
        assert.equal(ok, true, 'ein halb bekannter Paste wird ganz verworfen');
        const st = api.kaderState();
        assert.equal(st.mein.length, 2, 'die unbekannte Art wurde still weggelassen');
        const unbekannt = st.mein.find(e => e.name !== name);
        assert.equal(api.kaderRechenbar(unbekannt), false,
            'die unbekannte Art gilt als rechenbar');
        assert.ok(/sq-kader-warn/.test(api.kaderChip(unbekannt, 'me')),
            'die unbekannte Art steht ohne Grund im Kader');
    });

    it('ein leeres Feld sagt „leer" und nicht „unlesbar"', () => {
        const { api } = load();
        api.pasteState({ meldung: null });
        assert.equal(api.ladePaste('   \n  '), false);
        const m = api.pasteState().meldung;
        assert.ok(/leer|empty/i.test(m.text), `die Meldung nennt nicht die Ursache: ${m.text}`);
    });

    it('hoechstens sechs, auch wenn der Paste mehr traegt', () => {
        const { api } = load();
        const namen = [];
        for (let i = 0; i < 7; i++) namen.push(ersterMitSatz(api, namen));
        const paste = namen.map(n => `${n} @ Leftovers\nAdamant Nature\n- Protect`).join('\n\n');
        api.kaderState({ mein: [] });
        api.ladePaste(paste);
        assert.ok(api.kaderState().mein.length <= api.KADER_MAX,
            'mehr als sechs Pokemon im Kader');
    });

    it('das Feld steht nur, wenn es aufgeklappt ist', () => {
        const { api } = load();
        api.pasteState({ offen: false });
        assert.equal(api.pasteHtml(), '', 'das Textfeld steht ungefragt da');
        api.pasteState({ offen: true, text: 'Rillaboom @ Miracle Seed' });
        const html = api.pasteHtml();
        assert.ok(/data-sq-kader-pastefeld/.test(html), 'kein Textfeld');
        assert.ok(/data-sq-kader-pasteladen/.test(html), 'kein Ladeknopf');
        assert.ok(/Rillaboom @ Miracle Seed/.test(html), 'der getippte Text ueberlebt das Zeichnen nicht');
    });
});

// ══════════════════════════════════════════════════════════════════════

describe('Regionalformen aus einem Paste', () => {
    /* LIVE GEFUNDEN (16.09.2026), mit dem echten Team des Betreibers:

           Arcanine-Hisui @ Focus Sash

       kam als „keine Nutzungsdaten" zurueck. Die Nutzungsdatei fuehrt
       die Art als `hisuian-arcanine` — Showdown haengt die Form HINTEN
       an, die Datei setzt sie als Adjektiv DAVOR.

       Aus dem Team-Builder faellt das nicht auf: der uebergibt den Slug
       mit. Ein Paste kann das nie. */
    it('jede Form mit Bindestrich aus der echten Datei wird aufgeloest', () => {
        const { api } = load();
        const slugs = Object.keys(DATA.usage.pokemon).filter(s => s.indexOf('-') !== -1);
        assert.ok(slugs.length > 20,
            `nur ${slugs.length} Slugs mit Bindestrich — die Probe waere fast leer`);

        /* Aus dem Slug den Showdown-Namen ZURUECKBAUEN, statt eine Liste
           in den Testcode zu schreiben: `hisuian-arcanine` -> das
           Adjektiv nach hinten, also „Arcanine-Hisuian". Das ist noch
           nicht ganz Showdowns Schreibweise („Arcanine-Hisui"), und
           genau deshalb taugt es als Probe — es prueft den
           Praefix-Vergleich und nicht eine auswendig gelernte Tabelle. */
        const ADJEKTIVE = ['hisuian', 'alolan', 'galarian', 'paldean'];
        let geprueft = 0;
        slugs.forEach(slug => {
            const teile = slug.split('-');
            const i = teile.findIndex(t => ADJEKTIVE.indexOf(t) !== -1);
            if (i < 0) return;                       // keine umgedrehte Form
            const gedreht = teile.filter((_, k) => k !== i)
                .map(t => t.charAt(0).toUpperCase() + t.slice(1))
                .join('-') + '-' + teile[i].slice(0, 5);
            const erwartet = api.nameAusSlug(slug);
            assert.ok(erwartet, `${slug} hat keinen Namen im Kader`);
            assert.equal(api.loeseNamen({ name: gedreht }), erwartet,
                `„${gedreht}" wird nicht auf ${slug} aufgeloest`);
            geprueft++;
        });
        assert.ok(geprueft >= 10,
            `nur ${geprueft} umgedrehte Formen geprueft — die Probe bestuende fast leer`);
    });

    it('der gemeldete Fall selbst', () => {
        const { api } = load();
        const soll = api.nameAusSlug('hisuian-arcanine');
        if (!soll) return;   // die Art faellt eines Tages aus dem Kader
        assert.equal(api.loeseNamen({ name: 'Arcanine-Hisui' }), soll,
            'der gemeldete Fall aus dem Team des Betreibers geht weiter nicht');
    });

    it('was es nicht gibt, bekommt keinen Slug', () => {
        const { api } = load();
        assert.equal(api.slugAusTeilen('Pikachu-Hoenn'), null,
            'eine erfundene Form bekommt einen Slug zugewiesen');
        assert.equal(api.slugAusTeilen('Erfundenmon'), null,
            'ein erfundener Name bekommt einen Slug zugewiesen');
        // Ein einzelnes Wort geht diesen Weg gar nicht erst — dafuer ist
        // usageSlug zustaendig, und zwei Wege fuer dieselbe Frage waeren
        // der Anfang vom Auseinanderlaufen.
        assert.equal(api.slugAusTeilen('Rillaboom'), null,
            'ein Name aus EINEM Wort geht durch die Teilesuche');
    });

    it('EINDEUTIG ODER GAR NICHT — an GESETZTEN Daten geprueft', () => {
        /* DIE REGEL WAR MIT DEN ECHTEN DATEN NICHT AUSLOESBAR.

           Gemessen am 16.09.2026: ueber die ganze Nutzungsdatei gibt es
           KEINEN mehrdeutigen Fall. Die Verfaelschungsprobe
           (`treffer[0]` statt `treffer.length === 1`) blieb deshalb
           gruen — die Regel stand da, ohne dass irgendetwas sie
           beruehrte.

           Eine Regel, die nur bei Daten greift, die es heute nicht
           gibt, wird an gesetzten Daten geprueft oder gar nicht. Hier
           steht eine Nutzungsdatei mit ZWEI Slugs, auf die derselbe
           Showdown-Name passt. */
        const { api } = load();
        const roster = api.setData({
            usage: { pokemon: {
                'hisuian-arcanine': DATA.usage.pokemon['hisuian-arcanine']
                    || DATA.usage.pokemon[Object.keys(DATA.usage.pokemon)[0]],
                'hisuian-arcanine-alt': DATA.usage.pokemon['hisuian-arcanine']
                    || DATA.usage.pokemon[Object.keys(DATA.usage.pokemon)[0]],
            } },
            dex: DATA.dex, teams: DATA.teams, res: DATA.res,
            chart: DATA.chart, names: DATA.names, flags: DATA.flags,
        });
        assert.ok(Array.isArray(roster), 'die gesetzten Daten wurden nicht angenommen');
        assert.equal(api.slugAusTeilen('Arcanine-Hisui'), null,
            'bei zwei passenden Slugs wird einer davon geraten');
        // Gegenprobe: mit nur EINEM der beiden trifft es wieder.
        api.setData({
            usage: { pokemon: {
                'hisuian-arcanine': DATA.usage.pokemon['hisuian-arcanine']
                    || DATA.usage.pokemon[Object.keys(DATA.usage.pokemon)[0]],
            } },
            dex: DATA.dex, teams: DATA.teams, res: DATA.res,
            chart: DATA.chart, names: DATA.names, flags: DATA.flags,
        });
        assert.equal(api.slugAusTeilen('Arcanine-Hisui'), 'hisuian-arcanine',
            'die Probe selbst taugt nicht — auch mit einem Slug trifft es nicht');
        api.setData(DATA);
    });

    it('ein Paste mit Regionalform rechnet danach wirklich', () => {
        const { api } = load();
        const soll = api.nameAusSlug('hisuian-arcanine');
        if (!soll) return;
        api.kaderState({ mein: [] });
        assert.equal(api.ladePaste(
            'Arcanine-Hisui @ Focus Sash\nAbility: Rock Head\n'
            + 'EVs: 32 Atk / 32 Spe\nJolly Nature\n- Head Smash\n- Flare Blitz'), true,
            'der Paste wurde nicht gelesen');
        const e = api.kaderState().mein[0];
        assert.equal(e.name, soll, 'der Name wurde nicht aufgeloest');
        assert.equal(api.kaderRechenbar(e), true,
            'die Form steht weiter als „keine Nutzungsdaten" im Kader');
        assert.equal(api.setFor(soll, 'me').item, 'Focus Sash',
            'der Satz der Form kam nicht an');
    });
});

// ══════════════════════════════════════════════════════════════════════

describe('Die Attacken stehen in der Reihenfolge des Satzes', () => {
    it('moveTable traegt die Satzstelle mit — und bleibt selbst nach Schaden sortiert', () => {
        const { api } = load();
        const a = ersterMitSatz(api);
        const b = ersterMitSatz(api, [a]);
        const sa = api.setFor(a, 'me'), sb = api.setFor(b, 'opp');
        const rows = api.moveTable(a, sa, b, sb);
        assert.ok(rows.length, 'keine Attacken');
        rows.forEach(r => assert.equal(typeof r.stelle, 'number', `${r.name} ohne Satzstelle`));
        for (let i = 1; i < rows.length; i++) {
            assert.ok(rows[i - 1].range.max >= rows[i].range.max,
                'moveTable ist nicht mehr nach Schaden sortiert — daran haengt bestMove');
        }
        // Die Stelle zeigt wirklich in den Satz.
        rows.forEach(r => assert.equal(sa.moves[r.stelle], r.name,
            `die Satzstelle von ${r.name} zeigt auf ${sa.moves[r.stelle]}`));
    });

    it('die gezeichneten Zeilen folgen dem Satz, nicht dem Schaden', () => {
        const { api } = load();
        const roster = api.setData(DATA);
        // Ein Paar suchen, bei dem sich die beiden Reihenfolgen WIRKLICH
        // unterscheiden — sonst bestuende die Zusicherung leer.
        let fall = null;
        for (const x of roster) {
            const sx = api.setFor(x.name, 'me');
            if (!sx || (sx.moves || []).length < 2) continue;
            for (const y of roster) {
                if (y.name === x.name) continue;
                const sy = api.setFor(y.name, 'opp');
                if (!sy) continue;
                const rows = api.moveTable(x.name, sx, y.name, sy);
                if (rows.length < 2) continue;
                const nachSchaden = rows.map(r => r.name).join('|');
                const nachSatz = rows.slice().sort((p, q) => p.stelle - q.stelle)
                    .map(r => r.name).join('|');
                if (nachSchaden !== nachSatz) { fall = { x: x.name, y: y.name, sx, sy, rows }; break; }
            }
            if (fall) break;
        }
        assert.ok(fall, 'kein Paar gefunden, bei dem sich die Reihenfolgen unterscheiden');

        api.rechState({ me: fall.x, opp: fall.y, move: null, seite: 'me' });
        const html = api.rechZeilen('me', fall.x, fall.sx, fall.y, fall.sy);
        const stellen = fall.rows.slice()
            .map(r => ({ name: r.name, stelle: r.stelle, wo: html.indexOf(`data-sq-rmove="${r.name}"`) }));
        stellen.forEach(s => assert.ok(s.wo !== -1, `${s.name} fehlt in der Ausgabe`));
        const nachAnzeige = stellen.slice().sort((p, q) => p.wo - q.wo).map(s => s.stelle);
        const aufsteigend = nachAnzeige.every((v, i) => i === 0 || v > nachAnzeige[i - 1]);
        assert.ok(aufsteigend,
            `die Zeilen stehen nicht in Satzreihenfolge: ${JSON.stringify(nachAnzeige)}`);
    });

    it('die 16 Wuerfe sind nicht weg, sie stehen am Zeiger', () => {
        const { api } = load();
        const a = ersterMitSatz(api);
        const b = ersterMitSatz(api, [a]);
        const sa = api.setFor(a, 'me'), sb = api.setFor(b, 'opp');
        const rows = api.moveTable(a, sa, b, sb);
        const html = api.rechZeilen('me', a, sa, b, sb);
        const wuerfe = rows[0].range.rolls.join(' ');
        assert.ok(html.indexOf(wuerfe) !== -1,
            'die Wurfverteilung ist beim Aufraeumen des Kopfbands verschwunden');
        assert.ok(/title="[^"]*16/.test(html), 'die Wuerfe stehen nicht in einem title');
    });

    it('das Kopfband traegt den Satz und die Wuerfe NICHT mehr', () => {
        const { api } = load();
        const a = ersterMitSatz(api);
        const b = ersterMitSatz(api, [a]);
        api.rechState({ me: a, opp: b, move: null, seite: 'me' });
        const html = api.rechnerHtml();
        assert.ok(!/sq-rech-wuerfe/.test(html),
            'die Wurfzeile steht weiter im Kopfband — der Platz sollte frei werden');
        const kopf = html.slice(html.indexOf('sq-rech-kopf'), html.indexOf('sq-feld'));
        assert.ok(!/sq-rech-satz/.test(kopf), 'der Ergebnissatz steht weiter im Kopfband');
        // Die Initiativzeile bleibt — sie war ausdruecklich erwuenscht.
        assert.ok(/sq-rech-ini/.test(kopf), 'die Initiativzeile ist mit weggeraeumt worden');
    });

    it('der Vergleich fuehrt den Satz weiterhin — dort ist er die ganze Zeile', () => {
        const { api } = load();
        const a = ersterMitSatz(api);
        const b = ersterMitSatz(api, [a]);
        api.rechState({ me: a, opp: b, move: null, seite: 'me', verlauf: [] });
        api.merkeStand();
        const v = api.rechState().verlauf;
        assert.equal(v.length, 1, 'nichts gemerkt');
        assert.ok(v[0].satz && v[0].satz.length > 10, 'der gemerkte Stand traegt keinen Satz');
    });
});

// ══════════════════════════════════════════════════════════════════════

describe('Rueckenwind', () => {
    it('steht im Satz und startet aus', () => {
        const { api } = load();
        assert.equal(api.topSet(null).rueckenwind, false, 'Rueckenwind ist vorbelegt');
    });

    it('verdoppelt die Initiative — und nur die', () => {
        const { api } = load();
        const name = ersterMitSatz(api);
        const set = api.setFor(name, 'me');
        const stats = api.statsOf(name, set);
        assert.equal(api.initiative(set, stats), stats.spe, 'ohne Rueckenwind stimmt die Zahl nicht');
        set.rueckenwind = true;
        assert.equal(api.initiative(set, stats), stats.spe * 2, 'Rueckenwind verdoppelt nicht');
        assert.equal(api.statsOf(name, set).spe, stats.spe,
            'Rueckenwind hat den WERT des Pokemon veraendert — er aendert nur die Reihenfolge');
        set.rueckenwind = false;
    });

    it('aendert keinen Schaden', () => {
        const { api } = load();
        const a = ersterMitSatz(api);
        const b = ersterMitSatz(api, [a]);
        const sa = api.setFor(a, 'me'), sb = api.setFor(b, 'opp');
        const vorher = api.moveTable(a, sa, b, sb)[0].range.max;
        sa.rueckenwind = true;
        const nachher = api.moveTable(a, sa, b, sb)[0].range.max;
        sa.rueckenwind = false;
        assert.equal(nachher, vorher, 'Rueckenwind hat den Schaden veraendert');
    });

    it('das Kopfband rechnet mit ihm', () => {
        const { api } = load();
        const a = ersterMitSatz(api);
        const b = ersterMitSatz(api, [a]);
        api.rechState({ me: a, opp: b, move: null, seite: 'me' });
        const zahl = (h) => (h.match(/(\d+)/g) || []).join(',');
        const ohne = zahl(api.rechnerHtml().match(/sq-rech-ini[^>]*>([^<]*)</)[1]);
        api.setFor(a, 'me').rueckenwind = true;
        const mit = zahl(api.rechnerHtml().match(/sq-rech-ini[^>]*>([^<]*)</)[1]);
        api.setFor(a, 'me').rueckenwind = false;
        assert.notEqual(mit, ohne,
            'der Rueckenwind-Knopf steht ueber einer Zeile, die er nicht aendert');
    });
});

// ══════════════════════════════════════════════════════════════════════

describe('Die Schnellleiste', () => {
    it('zeichnet Stufen, Status, KP, Schirm, Rueckenwind, Hand und Helfer', () => {
        const { api } = load();
        const name = ersterMitSatz(api);
        const html = api.schnellHtml('me', api.setFor(name, 'me'));
        api.BOOST_KEYS.forEach(k => assert.ok(
            html.indexOf(`data-sq-boostschritt="${k}"`) !== -1, `keine Stufe fuer ${k}`));
        ['status', 'hp', 'schirm'].forEach(f => assert.ok(
            html.indexOf(`data-sq-wahl="${f}"`) !== -1, `keine Wahlreihe fuer ${f}`));
        ['rueckenwind', 'hilfe', 'helfer'].forEach(f => assert.ok(
            html.indexOf(`data-sq-flagbtn="${f}"`) !== -1, `kein Knopf fuer ${f}`));
    });

    it('jeder Knopf traegt seine Seite mit — sonst bearbeitet er die falsche', () => {
        const { api } = load();
        const name = ersterMitSatz(api);
        const html = api.schnellHtml('opp', api.setFor(name, 'opp'));
        assert.ok(!/data-sq-side="me"/.test(html), 'in der Gegnerleiste stehen eigene Knoepfe');
        const n = (html.match(/data-sq-side="opp"/g) || []).length;
        assert.ok(n >= 12, `nur ${n} Knoepfe tragen die Seite — erwartet werden mindestens 12`);
    });

    it('der gesetzte Zustand ist am Knopf zu sehen', () => {
        const { api } = load();
        const name = ersterMitSatz(api);
        const set = api.setFor(name, 'me');
        set.status = 'burn'; set.rueckenwind = true; set.schirm = 'reflect';
        const html = api.schnellHtml('me', set);
        const an = (f, w) => new RegExp(
            `data-sq-wahl="${f}"[^>]*data-sq-wert="${w}"[^>]*aria-pressed="true"`).test(html)
            || new RegExp(`is-an[^>]*data-sq-wahl="${f}"[^>]*data-sq-wert="${w}"`).test(html);
        assert.ok(an('status', 'burn'), 'der gesetzte Status ist nicht hervorgehoben');
        assert.ok(an('schirm', 'reflect'), 'der gesetzte Schirm ist nicht hervorgehoben');
        assert.ok(/data-sq-flagbtn="rueckenwind"[^>]*aria-pressed="true"/.test(html)
            || /is-an[^>]*data-sq-flagbtn="rueckenwind"/.test(html),
            'Rueckenwind ist an, sieht aber nicht so aus');
        set.status = ''; set.rueckenwind = false; set.schirm = '';
    });

    it('die Stufen halten bei ±6 an', () => {
        const { api } = load();
        const name = ersterMitSatz(api);
        const set = api.setFor(name, 'me');
        set.boosts.atk = 6;
        assert.ok(/data-sq-boostschritt="atk"[^>]*data-sq-delta="1"[^>]*disabled/.test(
            api.schnellHtml('me', set).replace(/\s+/g, ' ')),
            'bei +6 laesst sich weiter erhoehen');
        set.boosts.atk = -6;
        assert.ok(/data-sq-boostschritt="atk"[^>]*data-sq-delta="-1"[^>]*disabled/.test(
            api.schnellHtml('me', set).replace(/\s+/g, ' ')),
            'bei -6 laesst sich weiter senken');
        set.boosts.atk = 0;
    });

    it('die Kampflage steht im Rechner NUR oben, nicht doppelt', () => {
        const { api } = load();
        const a = ersterMitSatz(api);
        const b = ersterMitSatz(api, [a]);
        api.rechState({ me: a, opp: b, move: null, seite: 'me' });
        const html = api.rechnerHtml();
        assert.ok(/sq-schnell/.test(html), 'die Schnellleiste fehlt');
        assert.ok(!/sq-lage/.test(html),
            'die alte Kampflage steht zusaetzlich im Satz-Editor — zwei Bedienelemente '
            + 'fuer denselben Wert');
    });

    it('die Matchup-Ansicht behaelt ihre Kampflage', () => {
        const { api } = load();
        const name = ersterMitSatz(api);
        const html = api.setEditor('me', name, api.setFor(name, 'me'), 'Set');
        assert.ok(/sq-lage/.test(html),
            'der Editor hat die Kampflage generell verloren — dort gibt es keine Schnellleiste');
    });

    it('jedes Merkmal der Leiste hat eine CSS-Regel', () => {
        ['.sq-schnell', '.sq-schnell-stufe', '.sq-schnell-w', '.sq-schnell-f',
         '.sq-schnell-w.is-an', '.sq-kader-paste', '.sq-kader-meldung'].forEach(k => {
            assert.ok(CSS_C.indexOf(k) !== -1, `keine Regel fuer ${k}`);
        });
    });
});

// ══════════════════════════════════════════════════════════════════════

describe('Der Satz-Editor steht offen', () => {
    it('es gibt keinen Aufklapper mehr', () => {
        const { api } = load();
        const a = ersterMitSatz(api);
        const b = ersterMitSatz(api, [a]);
        api.rechState({ me: a, opp: b, move: null, seite: 'me' });
        const html = api.rechnerHtml();
        assert.ok(!/<details/.test(html), 'der Satz-Editor ist weiter zugeklappt');
        assert.ok(!/<summary/.test(html), 'es gibt weiter eine Aufklapp-Zeile');
        assert.ok(/sq-rech-editoren/.test(html), 'die Editoren fehlen ganz');
        assert.ok(/data-sq-editor="me"/.test(html) && /data-sq-editor="opp"/.test(html),
            'einer der beiden Editoren fehlt');
    });

    it('die Ueberschrift verspricht nichts, was oben steht', () => {
        const de = load('de').api, en = load('en').api;
        [de, en].forEach(api => {
            const a = ersterMitSatz(api);
            const b = ersterMitSatz(api, [a]);
            api.rechState({ me: a, opp: b, move: null, seite: 'me' });
            const html = api.rechnerHtml();
            const i = html.indexOf('sq-rech-saetze');
            const kopf = html.slice(i, i + 400);
            assert.ok(!/Stufen|Status|stages|status/i.test(kopf),
                'die Ueberschrift nennt weiter Stufen/Status — die stehen jetzt oben');
        });
    });
});

// ══════════════════════════════════════════════════════════════════════

describe('Das Auswahlfenster', () => {
    it('findet ueber englischen Namen, deutschen Namen und Typ', () => {
        const { api } = load();
        const roster = api.setData(DATA);
        const ziel = roster.find(r => api.setFor(r.name, 'opp') && (r.types || []).length);
        api.waehlerState({ seite: 'opp', q: ziel.name.slice(0, 4) });
        assert.ok(api.waehlerKandidaten().some(r => r.name === ziel.name),
            'der englische Name findet nicht');
        const de = api.nurDeutsch(ziel.name, 'pokemon');
        if (de && de !== ziel.name) {
            api.waehlerState({ q: de.slice(0, 4) });
            assert.ok(api.waehlerKandidaten().some(r => r.name === ziel.name),
                'der deutsche Name findet nicht');
        }
        api.waehlerState({ q: '' });
        const alle = api.waehlerKandidaten().length;
        assert.ok(alle > 50, `nur ${alle} Kandidaten ohne Suche — die Probe waere leer`);
    });

    it('zeigt Sprite, Name und die Nutzungszahl', () => {
        const { api } = load();
        api.waehlerState({ seite: 'opp', q: '' });
        api.kaderState({ opp: [] });
        const html = api.waehlerRasterHtml();
        assert.ok(/sq-play-picker-cell/.test(html),
            'das Fenster benutzt nicht die Klassen des Play-Waehlers');
        assert.ok(/sq-play-picker-cell-usage/.test(html), 'keine Nutzungszahl an den Kacheln');
        assert.ok(/data-sq-waehl=/.test(html), 'die Kacheln sind nicht anklickbar');
    });

    it('was drin ist, ist als drin gekennzeichnet', () => {
        const { api } = load();
        const name = ersterMitSatz(api);
        api.waehlerState({ seite: 'opp', q: name });
        api.kaderState({ opp: [{ name, eigen: false }] });
        assert.ok(/is-selected/.test(api.waehlerRasterHtml()),
            'ein Pokemon im Kader wird im Fenster nicht als gewaehlt gezeigt');
    });

    it('ein Klick fuegt hinzu und setzt den Kaempfer, der zweite nimmt heraus', () => {
        const { api } = load();
        const name = ersterMitSatz(api);
        api.kaderState({ opp: [] });
        api.rechState({ opp: null });
        api.waehleImKader('opp', name);
        assert.equal(api.kaderState().opp.length, 1, 'nichts hinzugefuegt');
        assert.equal(api.rechState().opp, name, 'der gewaehlte Gegner kaempft nicht');
        api.waehleImKader('opp', name);
        assert.equal(api.kaderState().opp.length, 0, 'der zweite Klick nimmt nicht heraus');
    });

    it('fuellt auch den EIGENEN Kader — ausdruecklich angefragt', () => {
        const { api } = load();
        const name = ersterMitSatz(api);
        api.kaderState({ mein: [] });
        api.rechState({ me: null });
        api.waehleImKader('me', name);
        assert.equal(api.kaderState().mein.length, 1, 'die eigene Seite nimmt nichts an');
        assert.equal(api.rechState().me, name, 'der eigene Kaempfer wechselt nicht mit');
    });

    it('bei sechs ist Schluss', () => {
        const { api } = load();
        const namen = [];
        for (let i = 0; i < 7; i++) namen.push(ersterMitSatz(api, namen));
        api.kaderState({ opp: [] });
        namen.forEach(n => api.waehleImKader('opp', n));
        assert.equal(api.kaderState().opp.length, api.KADER_MAX,
            'der Kader nimmt mehr als sechs auf');
    });

    it('beide Seiten bieten den Knopf dazu an', () => {
        const { api } = load();
        api.kaderState({ mein: [], opp: [] });
        const html = api.kaderHtml();
        assert.ok(/data-sq-kader-waehler="me"/.test(html), 'kein Waehler auf der eigenen Seite');
        assert.ok(/data-sq-kader-waehler="opp"/.test(html), 'kein Waehler auf der Gegnerseite');
        assert.ok(/data-sq-kader-paste/.test(html), 'kein Paste-Knopf');
    });

    it('das Fenster hat eine eigene CSS-Regel und sperrt den Hintergrund', () => {
        assert.ok(CSS_C.indexOf('#sqRechnerWaehler') !== -1, 'keine Regel fuer das Fenster');
        const i = SRC_C.indexOf('function oeffneWaehler');
        const block = SRC_C.slice(i, i + 2000);
        assert.ok(/HintergrundSperre/.test(block),
            'das Vollbild sperrt die Seite dahinter nicht — sie scrollt mit');
        assert.ok(/Escape/.test(SRC_C.slice(i, i + 3000)), 'Escape schliesst das Fenster nicht');
    });
});

// ══════════════════════════════════════════════════════════════════════

describe('Die Pokémon-Auswahl ist ein Suchfilter', () => {
    /* ANLASS (Betreiber, 16.09.2026): „das Feld sollte ein Suchfilter
       sein, damit ich nach raichu suchen kann und dann werden mir halt
       alle Möglichkeiten die Raichu enthalten angezeigt".

       Vorher stand dort ein <select> mit der Begruendung, jeder Browser
       bringe seine Tippsuche mit. Die springt aber zum ANFANG eines
       Eintrags: wer „raichu" tippt, landet bei „Raichu" und findet
       „Mega Raichu X" nie. */
    it('findet in der MITTE des Namens, nicht nur am Anfang', () => {
        const { api } = load();
        const alle = api.rechListe('me').map(r => r.name);
        /* Ein Wortteil aus den echten Daten, der bei mehreren Eintraegen
           NICHT am Anfang steht — sonst prueft die Zusicherung nur, was
           ein <select> auch koennte. */
        const zaehler = {};
        alle.forEach(n => n.split(/[\s-]+/).forEach(w => {
            const k = w.toLowerCase();
            if (k.length < 5) return;
            (zaehler[k] = zaehler[k] || []).push(n);
        }));
        const kandidat = Object.keys(zaehler).find(k =>
            zaehler[k].length >= 2
            && zaehler[k].some(n => n.toLowerCase().indexOf(k) > 0));
        assert.ok(kandidat,
            'kein Wortteil in den echten Daten, der mitten im Namen steht — '
            + 'die Probe waere leer');

        api.sucheState({ me: kandidat });
        const treffer = api.rechTreffer('me').map(r => r.name);
        zaehler[kandidat].forEach(n => assert.ok(treffer.indexOf(n) !== -1,
            `„${kandidat}" findet ${n} nicht`));
        assert.ok(treffer.some(n => n.toLowerCase().indexOf(kandidat) > 0),
            'gefunden wird weiter nur am Wortanfang — das kann ein Auswahlfeld auch');
        api.sucheState({ me: '' });
    });

    it('der gemeldete Fall: eine Suche nach „raichu"', () => {
        const { api } = load();
        const alle = api.rechListe('me').map(r => r.name);
        const raichus = alle.filter(n => /raichu/i.test(n));
        if (raichus.length < 2) return;   // faellt die Art aus dem Kader
        api.sucheState({ me: 'raichu' });
        const treffer = api.rechTreffer('me').map(r => r.name);
        raichus.forEach(n => assert.ok(treffer.indexOf(n) !== -1,
            `„raichu" findet ${n} nicht`));
        assert.equal(treffer.length, raichus.length,
            'die Suche liefert mehr als die Raichus');
        api.sucheState({ me: '' });
    });

    it('findet auch ueber den deutschen Namen und den Typ', () => {
        const de = load('de').api;
        const eintrag = de.rechListe('me').find(r => r.zeig !== r.name && r.typen.length);
        assert.ok(eintrag, 'kein Eintrag mit eigenem deutschen Namen');
        de.sucheState({ me: eintrag.zeig.slice(1, 5) });   // MITTEN im deutschen Namen
        assert.ok(de.rechTreffer('me').some(r => r.name === eintrag.name),
            'der deutsche Name findet nicht');
        de.sucheState({ me: eintrag.typen[0] });
        const nachTyp = de.rechTreffer('me');
        assert.ok(nachTyp.length > 1, `nur ${nachTyp.length} Treffer fuer einen ganzen Typ`);
        assert.ok(nachTyp.every(r => r.typen.some(t =>
            t.toLowerCase().indexOf(eintrag.typen[0].toLowerCase()) === 0)),
            'die Typsuche liefert Pokemon ohne diesen Typ');
        de.sucheState({ me: '' });
    });

    it('ein leeres Feld zeigt alles', () => {
        const { api } = load();
        api.sucheState({ me: '' });
        assert.equal(api.rechTreffer('me').length, api.rechListe('me').length,
            'ohne Eingabe fehlt etwas');
        assert.ok(api.rechListe('me').length > 100,
            'die Liste ist zu kurz — die Probe waere fast leer');
    });

    it('Unsinn trifft nichts und sagt es', () => {
        const { api } = load();
        api.sucheState({ me: 'xyzxyzxyz' });
        assert.equal(api.rechTreffer('me').length, 0, 'Unsinn trifft etwas');
        const html = api.rechTrefferHtml('me', null);
        assert.ok(/sq-rech-leer/.test(html), 'ohne Treffer steht dort eine leere Liste');
        api.sucheState({ me: '' });
    });

    it('die Liste ist gedeckelt UND sagt, dass mehr da ist', () => {
        const { api } = load();
        api.sucheState({ me: '' });
        const html = api.rechTrefferHtml('me', null);
        const zeilen = (html.match(/data-sq-rechname=/g) || []).length;
        assert.ok(zeilen > 0 && zeilen <= 40,
            `${zeilen} Zeilen gezeichnet — ohne Deckel kostet jeder Tastendruck Zeit`);
        assert.ok(/sq-rech-mehr/.test(html),
            'der Deckel greift still — der Leser haelt die Liste fuer vollstaendig');
    });

    it('das Feld traegt die Seite und ist ein Suchfeld', () => {
        const { api } = load();
        const name = ersterMitSatz(api);
        api.sucheState({ offen: '' });
        const html = api.rechWer('opp', name, api.setFor(name, 'opp'));
        assert.ok(/data-sq-rech="opp"/.test(html), 'die Auswahl fehlt');
        assert.ok(/type="search"/.test(html), 'es ist kein Eingabefeld');
        assert.ok(!/<select[^>]*data-sq-rech/.test(html),
            'es ist weiter ein Auswahlfeld — dann bleibt die Suche am Wortanfang haengen');
        assert.ok(/role="combobox"/.test(html), 'das Feld sagt nicht, was es ist');
        assert.ok(/data-sq-treffer="opp"/.test(html), 'die Trefferliste fehlt');
    });

    it('zugeklappt steht der GEWAEHLTE Name im Feld, nicht der Suchtext', () => {
        const de = load('de').api;
        const name = ersterMitSatz(de);
        de.sucheState({ offen: '', me: 'halb getippt' });
        const html = de.rechWer('me', name, de.setFor(name, 'me'));
        const wert = (html.match(/data-sq-rech="me"[\s\S]*?value="([^"]*)"/) || [])[1];
        assert.equal(wert, de.nurDeutsch(name, 'pokemon') || name,
            'im zugeklappten Feld steht nicht das, was gerechnet wird');
        de.sucheState({ me: '' });
    });

    it('der Suchtext ueberlebt das Zeichnen, solange die Liste offen ist', () => {
        const { api } = load();
        const name = ersterMitSatz(api);
        api.sucheState({ offen: 'me', me: 'raich' });
        const html = api.rechWer('me', name, api.setFor(name, 'me'));
        const wert = (html.match(/data-sq-rech="me"[\s\S]*?value="([^"]*)"/) || [])[1];
        assert.equal(wert, 'raich', 'der getippte Text geht beim Zeichnen verloren');
        assert.ok(/data-sq-treffer="me" role="listbox">/.test(html.replace(/\s+/g, ' '))
            || !/data-sq-treffer="me"[^>]*hidden/.test(html),
            'die Liste ist zu, obwohl gerade gesucht wird');
        api.sucheState({ offen: '', me: '' });
    });

    it('das Suchfeld zeichnet beim Tippen NICHT neu', () => {
        /* Ein renderRechner() bei jedem Tastendruck wirft den Fokus aus
           dem Feld — nach einem Buchstaben tippt man ins Leere.
           Dieselbe Falle wie am 05.09.2026 im Suchfeld der
           Matchup-Liste. */
        const i = SRC_C.indexOf('function wireRechner');
        assert.ok(i !== -1, 'wireRechner nicht gefunden');
        const a = SRC_C.indexOf("feld.addEventListener('input'", i);
        assert.ok(a !== -1, 'das Suchfeld hat keinen input-Zuhoerer');
        const block = SRC_C.slice(a, SRC_C.indexOf('\n', a) + 1);
        assert.ok(!/renderRechner\(\)/.test(block),
            'der input-Zuhoerer zeichnet neu — damit verliert das Feld den Fokus');
        assert.ok(/frisch\(\)/.test(block), 'die Trefferliste wird beim Tippen nicht erneuert');
    });

    it('jedes Merkmal der Trefferliste hat eine CSS-Regel', () => {
        ['.sq-rech-combo', '.sq-rech-treffer', '.sq-rech-treff', '.sq-rech-treff-img',
         '.sq-rech-leer', '.sq-rech-mehr'].forEach(k => {
            assert.ok(CSS_C.indexOf(k) !== -1, `keine Regel fuer ${k}`);
        });
        // Die Liste muss ueber dem Kopfband LIEGEN, nicht darin stehen —
        // sonst springt die halbe Seite bei jedem Tastendruck.
        const i = CSS_C.indexOf('.sq-console .sq-rech-treffer {');
        const block = CSS_C.slice(i, CSS_C.indexOf('}', i));
        assert.ok(/position:\s*absolute/.test(block),
            'die Trefferliste steht im Fluss — die Seite springt beim Tippen');
    });
});

// ══════════════════════════════════════════════════════════════════════

describe('Der Weg aus dem Team-Builder', () => {
    it('oeffneTeamRechner zeigt den RECHNER, nicht die Matchup-Liste', () => {
        const i = SRC_C.indexOf('function oeffneTeamRechner');
        assert.ok(i !== -1, 'oeffneTeamRechner fehlt');
        const block = SRC_C.slice(i, SRC_C.indexOf('\n    }', i));
        assert.ok(/showView\('rechner'\)/.test(block),
            'der Knopf fuehrt weiter in die Matchup-Ansicht');
        assert.ok(!/showView\('matchups'\)/.test(block),
            'der Knopf fuehrt noch immer in die Matchup-Ansicht');
        assert.ok(/uebernimmTeam\(team\)/.test(block), 'das Team wird nicht uebernommen');
        assert.ok(/kaderEroeffnung\(\)/.test(block),
            'ohne die Eroeffnung stuende nach dem Wechsel kein Gegner da');
    });

    it('uebernimmTeam fuellt den Kader der Leiste mit', () => {
        const { api } = load();
        const name = ersterMitSatz(api);
        const roster = api.setData(DATA);
        const slug = roster.find(r => r.name === name).slug;
        api.kaderState({ mein: [] });
        api.uebernimmTeam({ mons: [{
            name, slug, nature: 'Adamant', ability: '', item: 'Life Orb',
            evs: '32 Atk', moves: ['Protect'],
        }] });
        const st = api.kaderState();
        assert.equal(st.mein.length, 1, 'der Kader der Leiste bleibt leer');
        assert.equal(st.mein[0].eigen, true, 'der uebergebene Satz gilt nicht als eigener');
        assert.equal(api.setFor(name, 'me').item, 'Life Orb',
            'der uebergebene Satz landet nicht im gerechneten Satz');
    });
});
