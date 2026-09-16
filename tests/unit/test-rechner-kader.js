/**
 * DIE KADERLEISTE IM RECHNER.
 *
 * ANLASS (Betreiber, 16.09.2026): „können wir hier noch irgendwie mein
 * Team 1:1 wie ich es spiele reinladen und beim Gegner per pick 6
 * schnell auswahl die 6 möglichen Pokemon mit dem Set wie es am meisten
 * gespielt wird und dann kann ich über das Pokemon Sprite Icon dann
 * schnell die Daten wählen welche Pokemon gegeneinander kämpfen".
 *
 * WAS HIER WIRKLICH SCHIEFGEHEN KANN — und was diese Zusicherungen
 * deshalb gegen das VERHALTEN halten, nicht gegen den Wortlaut:
 *
 *  1. „1:1 wie ich es spiele" ist eine Behauptung ueber ZAHLEN. Wird der
 *     Satz des Teams nicht dorthin geschrieben, wo der Rechner ihn
 *     liest, rechnet der Reiter weiter mit dem Durchschnittssatz — und
 *     sieht dabei genauso aus. Geprueft wird deshalb, dass sich die
 *     gerechneten WERTE aendern, nicht dass eine Funktion aufgerufen
 *     wurde.
 *  2. „mit dem Set wie es am meisten gespielt wird" ist eine Behauptung
 *     ueber die REIHENFOLGE der Nutzungsdaten. Geprueft wird gegen
 *     champions_usage.json, nicht gegen eine Liste im Testcode.
 *  3. Ein Kader-Eintrag ohne Nutzungsdaten darf nicht still
 *     verschwinden — sonst sieht der Betreiber fuenf statt sechs
 *     Pokemon und erfaehrt nie, welches fehlt.
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
const SQ_C = ohneKommentare(SQ);
const CSS_C = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

/* GEGENPROBE ZUM AUSSCHNEIDEN SELBST (CLAUDE.md, 13./14.09.2026):
   ohne sie wirft das Ausschneiden im Zweifel alles weg und jede
   Textzusicherung darunter prueft gar nichts mehr. */
assert.ok(SRC_C.length > SRC.length * 0.3, 'das Ausschneiden hat zu viel entfernt (matchups)');
assert.ok(SQ_C.length > SQ.length * 0.3, 'das Ausschneiden hat zu viel entfernt (side-quest)');
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
    return { api, sandbox };
}

/** Ein Name aus den echten Daten, zu dem es einen Satz gibt. */
function ersterMitSatz(api, ausser) {
    const roster = api.setData(DATA);
    for (const r of roster) {
        if (ausser && ausser.indexOf(r.name) !== -1) continue;
        if (api.setFor(r.name, 'me')) return r.name;
    }
    throw new Error('kein Pokemon mit Satz in den echten Daten');
}

// ══════════════════════════════════════════════════════════════════════

describe('Pick 6: die sechs meistgespielten — aus den Daten, nicht aus einer Liste', () => {
    it('metaTop(6) liefert genau die sechs obersten der Nutzungsanalyse', () => {
        const { api } = load();
        const roster = api.setData(DATA);
        const erwartet = roster.filter(r => api.setFor(r.name, 'opp')).slice(0, 6).map(r => r.name);
        const gemessen = api.metaTop(6);
        assert.equal(gemessen.length, 6, 'Pick 6 liefert keine sechs');
        assert.equal(JSON.stringify(gemessen), JSON.stringify(erwartet),
            'die Reihenfolge folgt nicht der Nutzung');
    });

    it('die Reihenfolge ist wirklich absteigend nach Nutzung', () => {
        const { api } = load();
        const roster = api.setData(DATA);
        const zahl = {};
        roster.forEach(r => { zahl[r.name] = r.count; });
        const top = api.metaTop(6);
        for (let i = 1; i < top.length; i++) {
            assert.ok(zahl[top[i - 1]] >= zahl[top[i]],
                `${top[i]} wird oefter gespielt als ${top[i - 1]}, steht aber dahinter`);
        }
        assert.ok(zahl[top[0]] > 0, 'das oberste Pokemon hat keine gemessene Nutzung');
    });

    it('jedes der sechs bringt einen rechenbaren Satz mit', () => {
        const { api } = load();
        api.metaTop(6).forEach(n => {
            const s = api.setFor(n, 'opp');
            assert.ok(s, `${n} hat keinen Satz — Pick 6 duerfte es nicht vorschlagen`);
            assert.ok(s.moves && s.moves.length, `${n} hat keine Attacken im Satz`);
        });
    });

    it('kaderPick6() setzt den Kader UND den ersten Kaempfer', () => {
        const { api } = load();
        api.rechState({ me: null, opp: null });
        api.kaderState({ opp: [] });
        api.kaderPick6();
        const st = api.kaderState();
        assert.equal(st.opp.length, 6, 'der Gegnerkader ist nicht voll');
        assert.equal(api.rechState().opp, st.opp[0].name,
            'nach Pick 6 kaempft nicht das erste Pokemon des Kaders');
    });

    it('eroeffnet NICHT mit dem Spiegelmatch', () => {
        /* Im Entwurf gemessen: „Gortrom U-Turn gegen Gortrom". Das
           eigene Team beginnt mit dem meistgespielten Pokemon, die Top 6
           auch — und das erste Bild war eine Rechnung gegen sich
           selbst. */
        const { api } = load();
        const oben = api.metaTop(6)[0];
        api.rechState({ me: oben, opp: null });
        api.kaderState({ opp: [] });
        api.kaderPick6();
        assert.notEqual(api.rechState().opp, oben,
            'der Reiter oeffnet mit einer Rechnung gegen sich selbst');
        assert.equal(api.rechState().opp, api.metaTop(6)[1],
            'statt des Spiegels muss das naechste Pokemon des Kaders antreten');
    });

    it('bleibt beim Spiegel, wenn es nur EINEN Gegner gibt', () => {
        /* Die Rueckfallseite von „nicht das Spiegelmatch": gibt das Meta
           nur ein einziges Pokemon her, ist der Spiegel die einzige
           Rechnung — und nichts zu zeigen waere schlechter.

           Geprueft wird das mit einer auf EINEN Eintrag gekuerzten
           Nutzungsdatei, nicht mit einem gesetzten Zustand: sonst
           behauptete die Zusicherung nur ihren eigenen Aufbau. */
        const { api } = load();
        const name = ersterMitSatz(api);
        const roster = api.setData(DATA);
        const slug = roster.find(r => r.name === name).slug;
        const schmal = Object.assign({}, DATA, {
            usage: Object.assign({}, DATA.usage,
                { pokemon: { [slug]: DATA.usage.pokemon[slug] } }),
        });
        api.setData(schmal);
        // ueber JSON: das Feld entsteht im vm-Kontext (siehe oben).
        assert.equal(JSON.stringify(api.metaTop(6)), JSON.stringify([name]),
            'die gekuerzte Probe stimmt nicht');

        api.rechState({ me: name, opp: null });
        api.kaderState({ opp: [] });
        api.kaderPick6();
        assert.equal(api.rechState().opp, name,
            'bei nur einem moeglichen Gegner bleibt der Reiter leer, statt den '
            + 'Spiegel zu zeigen');
        api.setData(DATA);
    });
});

// ══════════════════════════════════════════════════════════════════════

describe('„1:1 wie ich es spiele": der eigene Satz landet dort, wo gerechnet wird', () => {
    it('satzUebernehmen schreibt unter DEN Schluessel, den setFor liest', () => {
        const { api } = load();
        const name = ersterMitSatz(api);
        const vorher = api.setFor(name, 'me');
        const vorherWesen = vorher.nature;

        const eigen = {
            nature: vorherWesen === 'Adamant' ? 'Modest' : 'Adamant',
            ability: vorher.ability,
            item: 'Life Orb',
            moves: vorher.moves.slice(0, 1),
            spread: { hp: 0, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 },
        };
        assert.equal(api.satzUebernehmen(name, eigen), true, 'die Uebernahme meldet Fehlschlag');

        const nachher = api.setFor(name, 'me');
        assert.equal(nachher.nature, eigen.nature, 'das Wesen kam nicht an');
        assert.equal(nachher.item, 'Life Orb', 'das Item kam nicht an');
        assert.deepEqual(nachher.moves, eigen.moves, 'die Attacken kamen nicht an');
        assert.equal(nachher.spread.atk, 32, 'die Punkte kamen nicht an');
    });

    it('die WERTE aendern sich dadurch wirklich — nicht nur das Formular', () => {
        const { api } = load();
        const name = ersterMitSatz(api);
        const grundMoves = api.setFor(name, 'me').moves;

        /* Zwei Uebernahmen, die sich in GENAU einem Punkt unterscheiden.
           Gegen den Ausgangssatz zu messen waere blind: der
           meistgespielte Satz kann zufaellig schon 32 Angriffspunkte
           tragen, und dann bliebe die Zusicherung gruen, auch wenn
           nichts uebernommen wurde. (Genau so ist sie beim Schreiben
           zuerst durchgefallen.) */
        const satz = (atk) => ({
            nature: 'Adamant', ability: '', item: '',
            moves: grundMoves, spread: { hp: 0, atk, def: 0, spa: 0, spd: 0, spe: 0 },
        });
        api.satzUebernehmen(name, satz(0));
        const ohne = api.statsOf(name, api.setFor(name, 'me')).atk;
        api.satzUebernehmen(name, satz(32));
        const mit = api.statsOf(name, api.setFor(name, 'me')).atk;
        assert.ok(mit > ohne,
            `der Angriffswert reagiert nicht auf die uebernommenen Punkte (${ohne} -> ${mit})`);

        // Verfaelschungsprobe von Hand: derselbe Aufruf mit NULL darf nichts tun.
        const stand = api.setFor(name, 'me').spread.atk;
        assert.equal(api.satzUebernehmen(name, null), false, 'ein leerer Satz wird uebernommen');
        assert.equal(api.setFor(name, 'me').spread.atk, stand,
            'ein leerer Satz hat den Stand veraendert');
    });

    it('die KAMPFLAGE bleibt neutral — ein Team sagt nichts ueber den Kampfstand', () => {
        const { api } = load();
        const name = ersterMitSatz(api);
        api.satzUebernehmen(name, {
            nature: 'Adamant', ability: '', item: '',
            moves: api.setFor(name, 'me').moves,
            spread: { hp: 0, atk: 32, def: 0, spa: 0, spd: 0, spe: 0 },
        });
        const s = api.setFor(name, 'me');
        /* ueber JSON, nicht mit deepEqual: das Objekt entsteht IM
           vm-Kontext und traegt dessen Object.prototype. deepStrictEqual
           vergleicht den Prototyp mit und meldet einen Unterschied, wo
           inhaltlich keiner ist — beim Schreiben dieser Datei einmal
           passiert. */
        assert.equal(JSON.stringify(s.boosts), JSON.stringify({ atk: 0, def: 0, spa: 0, spd: 0 }),
            'Stufen nicht neutral');
        assert.equal(s.status, '', 'Status nicht neutral');
        assert.equal(s.hp, '1', 'KP nicht voll');
        assert.equal(s.schirm, '', 'ein Schirm steht ungefragt');
        assert.equal(s.hilfe, false, 'Hilfreiche Hand steht ungefragt');
        assert.equal(s.helfer, false, 'Helfer steht ungefragt');
    });

    it('ein Team ohne Bau (keine Attacken, kein Wesen) ueberschreibt nichts', () => {
        const { api } = load();
        const name = ersterMitSatz(api);
        const vorher = JSON.stringify(api.setFor(name, 'me'));
        api.kaderState({ mein: [] });
        api.ladeKaderTeam('gibtsnicht');
        assert.equal(JSON.stringify(api.setFor(name, 'me')), vorher,
            'ein unbekanntes Team hat einen Satz veraendert');
    });
});

// ══════════════════════════════════════════════════════════════════════

describe('Wer gerechnet werden kann — und wer sichtbar NICHT', () => {
    it('kaderRechenbar verlangt Pokedex-Werte und einen Satz', () => {
        const { api } = load();
        const gut = ersterMitSatz(api);
        assert.equal(api.kaderRechenbar({ name: gut }), true, `${gut} gilt als nicht rechenbar`);
        assert.equal(api.kaderRechenbar({ name: 'Gibt-Es-Nicht-Mon' }), false,
            'ein Name ohne Pokedex-Eintrag gilt als rechenbar');
        assert.equal(api.kaderRechenbar(null), false, 'null gilt als rechenbar');
        assert.equal(api.kaderRechenbar({}), false, 'ein Eintrag ohne Namen gilt als rechenbar');
    });

    it('ein Eintrag ohne Daten bleibt STEHEN und nennt den Grund', () => {
        const { api } = load();
        const html = api.kaderChip({ name: 'Gibt-Es-Nicht-Mon' }, 'me');
        assert.ok(/Gibt-Es-Nicht-Mon/.test(html), 'der Eintrag verschwindet still aus dem Kader');
        assert.ok(/is-tot/.test(html), 'der Eintrag ist nicht als unrechenbar gekennzeichnet');
        assert.ok(/disabled/.test(html), 'der Eintrag laesst sich trotzdem anklicken');
        assert.ok(/sq-kader-warn/.test(html), 'kein Grund am Eintrag');
    });

    it('ein rechenbarer Eintrag ist anklickbar und traegt seine Seite', () => {
        const { api } = load();
        const gut = ersterMitSatz(api);
        const html = api.kaderChip({ name: gut }, 'opp');
        assert.ok(/data-sq-kader="opp"/.test(html), 'die Seite fehlt am Knopf');
        assert.ok(new RegExp(`data-sq-kader-name="[^"]*${gut.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
            .test(html), 'der Name fehlt am Knopf');
        assert.ok(!/disabled/.test(html), 'ein rechenbarer Eintrag ist gesperrt');
    });

    it('der gewaehlte Kaempfer ist am Kader zu sehen', () => {
        const { api } = load();
        const a = ersterMitSatz(api);
        const b = ersterMitSatz(api, [a]);
        api.rechState({ me: a });
        assert.ok(/is-an/.test(api.kaderChip({ name: a }, 'me')),
            'der gewaehlte Kaempfer ist nicht hervorgehoben');
        assert.ok(!/is-an/.test(api.kaderChip({ name: b }, 'me')),
            'ein NICHT gewaehlter Kaempfer ist hervorgehoben');
    });

    it('ein uebernommener eigener Satz wird angeschrieben', () => {
        const { api } = load();
        const gut = ersterMitSatz(api);
        assert.ok(/sq-kader-marke/.test(api.kaderChip({ name: gut, eigen: true }, 'me')),
            'ein eigener Satz wird nicht als solcher gekennzeichnet');
        assert.ok(!/sq-kader-marke/.test(api.kaderChip({ name: gut, eigen: false }, 'me')),
            'der Meta-Satz wird als eigener ausgegeben');
    });
});

// ══════════════════════════════════════════════════════════════════════

describe('Die Leiste selbst', () => {
    it('zeichnet beide Seiten mit Ueberschrift und Zaehler', () => {
        const { api } = load();
        api.kaderState({ mein: [], opp: [] });
        api.kaderPick6();
        const html = api.kaderHtml();
        assert.ok(/sq-kader-seite is-me/.test(html), 'die eigene Seite fehlt');
        assert.ok(/sq-kader-seite is-opp/.test(html), 'die Gegnerseite fehlt');
        assert.ok(/Mein Kader/.test(html), 'die eigene Ueberschrift fehlt');
        assert.ok(/6\/6/.test(html), 'der Zaehler steht nicht auf 6/6');
    });

    it('bietet Pick 6 und die Gegnersuche an', () => {
        const { api } = load();
        api.kaderState({ mein: [], opp: [] });
        const html = api.kaderHtml();
        assert.ok(/data-sq-kader-pick6/.test(html), 'der Pick-6-Knopf fehlt');
        assert.ok(/data-sq-kader-suche/.test(html), 'das Suchfeld fehlt');
    });

    it('ein voller Gegnerkader sperrt das Suchfeld statt still zu verschlucken', () => {
        const { api } = load();
        api.kaderState({ mein: [], opp: [] });
        api.kaderPick6();
        assert.ok(/data-sq-kader-suche[^>]*disabled|disabled[^>]*data-sq-kader-suche/
            .test(api.kaderHtml().replace(/\s+/g, ' ')),
            'bei sechs Gegnern bleibt das Suchfeld offen und tut nichts');
    });

    it('sagt bei leerem Kader, was zu tun ist — statt nur leer zu sein', () => {
        const { api } = load();
        api.kaderState({ mein: [], opp: [] });
        const html = api.kaderHtml();
        assert.ok(/Noch kein Team geladen/.test(html), 'kein Hinweis auf der eigenen Seite');
        assert.ok(/Noch kein Gegner/.test(html), 'kein Hinweis auf der Gegnerseite');
    });

    it('die Leiste steht auch dann, wenn nichts gerechnet werden kann', () => {
        const { api } = load();
        api.rechState({ me: null, opp: null });
        api.kaderState({ mein: [], opp: [] });
        api.kaderPick6();
        const html = api.rechnerHtml();
        assert.ok(/sq-kader/.test(html),
            'ohne rechenbares Paar verschwindet die Leiste — also genau das Werkzeug, '
            + 'mit dem man den Zustand aufloesen koennte');
    });

    it('die Leiste steht VOR dem Kopfband', () => {
        const { api } = load();
        const a = ersterMitSatz(api);
        const b = ersterMitSatz(api, [a]);
        api.rechState({ me: a, opp: b, move: null, seite: 'me' });
        api.kaderState({ mein: [{ name: a }], opp: [{ name: b }] });
        const html = api.rechnerHtml();
        /* ERST DASEIN, DANN REIHENFOLGE. Ohne die erste Zusicherung
           gibt indexOf fuer einen FEHLENDEN Kader -1 zurueck, und
           -1 < alles — die Probe „kaderHtml() ganz weglassen" blieb
           damit gruen. */
        assert.ok(html.indexOf('sq-kader') !== -1, 'die Kaderleiste fehlt ganz');
        assert.ok(html.indexOf('sq-rech-kopf') !== -1, 'das Kopfband fehlt ganz');
        assert.ok(html.indexOf('sq-kader') < html.indexOf('sq-rech-kopf'),
            'der Kader steht hinter dem Kopfband');
    });
});

// ══════════════════════════════════════════════════════════════════════

describe('Verdrahtung und Oberflaeche', () => {
    it('renderRechner haengt die Kader-Zuhoerer an', () => {
        /* IM RENDERER SUCHEN, NICHT IN DER GANZEN DATEI.
           `/wireKader\(host\)/` ueber den ganzen Quelltext trifft auch
           die DEFINITION `function wireKader(host) {`. Die Probe „Aufruf
           auskommentieren" blieb damit gruen — dieselbe Blindheit wie am
           13./14.09.2026, nur ohne Kommentar. */
        const i = SRC_C.indexOf('function renderRechner');
        assert.ok(i !== -1, 'renderRechner nicht gefunden');
        const block = SRC_C.slice(i, SRC_C.indexOf('\n    function ', i + 10));
        assert.ok(/\bwireKader\(host\);/.test(block),
            'wireKader wird im Renderer nie aufgerufen — dann tut kein Sprite-Klick etwas');
        // Und die Definition steht trotzdem da, sonst waere der Aufruf ein Absturz.
        assert.ok(/function wireKader\(/.test(SRC_C), 'wireKader ist gar nicht definiert');
    });

    it('der Sprite-Klick setzt die Paarung und wirft die alte Attacke weg', () => {
        /* GENAU DEN EINEN ZUHOERER SCHNEIDEN. Ueber das ganze wireKader
           gemessen blieb die Probe „_rMove = null entfernen" gruen: die
           Zeile steht auch im Zuhoerer der Gegnersuche. Eine Zusicherung
           ueber einen zu weiten Ausschnitt prueft, dass IRGENDWO etwas
           steht — nicht, dass es an der richtigen Stelle steht. */
        const wk = SRC_C.indexOf('function wireKader');
        assert.ok(wk !== -1, 'wireKader nicht gefunden');
        const a = SRC_C.indexOf("querySelectorAll('[data-sq-kader]')", wk);
        assert.ok(a !== -1, 'der Zuhoerer fuer den Sprite-Klick fehlt');
        const b = SRC_C.indexOf('querySelectorAll(', a + 10);
        assert.ok(b > a, 'das Ende des Zuhoerers ist nicht auffindbar');
        const block = SRC_C.slice(a, b);
        assert.ok(/_rOpp = name/.test(block) && /_rMe = name/.test(block),
            'der Klick setzt die Paarung nicht');
        assert.ok(/_rMove = null/.test(block),
            'die Attacke des alten Paares bleibt im Kopfband stehen');
        assert.ok(/renderRechner\(\)/.test(block),
            'der Klick zeichnet nicht neu — er taete dann sichtbar nichts');
    });

    it('jedes Kader-Merkmal hat eine CSS-Regel', () => {
        ['.sq-kader-bank', '.sq-kader-sprite', '.sq-kader-img', '.sq-kader-weg',
         '.sq-kader-chip.is-an', '.sq-kader-chip.is-tot', '.sq-kader-warn'].forEach(k => {
            assert.ok(CSS_C.indexOf(k) !== -1, `keine Regel fuer ${k}`);
        });
    });

    it('der Wegnehmen-Knopf ist rund UND quadratisch (Regel vom 13.09.2026)', () => {
        const i = CSS_C.indexOf('.sq-console .sq-kader-weg {');
        assert.ok(i !== -1, 'keine Regel fuer den Wegnehmen-Knopf');
        const block = CSS_C.slice(i, CSS_C.indexOf('}', i));
        assert.ok(/border-radius:\s*50%/.test(block), 'der Knopf ist nicht rund');
        assert.ok(/aspect-ratio:\s*1\s*\/\s*1/.test(block),
            'ohne aspect-ratio wird der runde Knopf bei anderer Breite zum Oval');
    });

    it('beide Sprachen fuehren jedes neue Label', () => {
        /* NUR im Label-Block suchen. Ein Muster ueber die ganze Datei
           faengt auch `kaderState:` aus dem Test-Ausgang mit und
           verlangt es auf Englisch — beim Schreiben passiert. */
        const anfang = SRC.indexOf('const LABELS = {');
        assert.ok(anfang !== -1, 'kein LABELS-Block gefunden');
        const ende = SRC.indexOf('\n    function ', anfang);
        assert.ok(ende > anfang, 'das Ende des LABELS-Blocks ist nicht auffindbar');
        const block = SRC.slice(anfang, ende);

        const schluessel = (block.match(/\bkader[A-Z][A-Za-z0-9]*(?=:)/g) || [])
            .filter((v, i, a) => a.indexOf(v) === i);
        assert.ok(schluessel.length >= 10,
            `nur ${schluessel.length} Kader-Labels gefunden — das Muster stimmt nicht mehr`);
        schluessel.forEach(k => {
            const treffer = (block.match(new RegExp('\\b' + k + ':', 'g')) || []).length;
            assert.equal(treffer, 2, `${k} steht ${treffer}-mal statt in beiden Sprachen je einmal`);
        });

        // Und die Labels muessen sich auch WIRKLICH unterscheiden — eine
        // englische Zeile, die den deutschen Text traegt, ist keine
        // Uebersetzung.
        const deHtml = load('de').api.kaderHtml();
        const enHtml = load('en').api.kaderHtml();
        assert.ok(/Mein Kader/.test(deHtml), 'die deutsche Ueberschrift fehlt');
        assert.ok(/My squad/.test(enHtml), 'die englische Ueberschrift fehlt');
        assert.ok(!/Mein Kader/.test(enHtml), 'die englische Leiste traegt deutschen Text');
    });
});

// ══════════════════════════════════════════════════════════════════════

describe('Die eigenen Teams werden GELESEN, nicht veraendert', () => {
    it('app-side-quest.js bietet getOwnTeams und getActiveTeam nach aussen an', () => {
        assert.ok(/getOwnTeams,/.test(SQ_C), 'getOwnTeams wird nicht angeboten');
        assert.ok(/getActiveTeam,/.test(SQ_C), 'getActiveTeam wird nicht angeboten');
    });

    it('getOwnTeams gibt eine KOPIE — sonst greift ein Aufrufer in den Speicher', () => {
        const i = SQ_C.indexOf('function getOwnTeams');
        assert.ok(i !== -1, 'getOwnTeams fehlt');
        const block = SQ_C.slice(i, i + 400);
        assert.ok(/JSON\.parse\(JSON\.stringify/.test(block),
            'getOwnTeams reicht die gespeicherten Objekte durch — ein Aufrufer koennte '
            + 'die Teams des Betreibers veraendern');
    });

    it('die Kaderleiste liest den Speicher ausfallsicher', () => {
        const { api, sandbox } = load();
        delete sandbox.sideQuest;               // kein Reiter geladen
        assert.doesNotThrow(() => api.kaderHtml(), 'ohne window.sideQuest stuerzt die Leiste ab');
        sandbox.sideQuest = { getOwnTeams: () => { throw new Error('kaputt'); } };
        assert.doesNotThrow(() => api.kaderHtml(), 'ein Fehler im Speicher reisst die Leiste mit');
    });

    it('ein gespeichertes Team landet im Kader — mit seinem Satz', () => {
        const { api, sandbox } = load();
        const name = ersterMitSatz(api);
        const roster = api.setData(DATA);
        const slug = roster.find(r => r.name === name).slug;
        sandbox.sideQuest = {
            getActiveCode: () => 'imp-test',
            getOwnTeams: () => ([{
                replica_code: 'imp-test',
                team_name: 'Testkader',
                pokemon: [{
                    name, slug, nature: 'Adamant', ability: '', item: 'Life Orb',
                    evs: '32 Atk / 32 Spe', moves: api.setFor(name, 'me').moves.slice(0, 2),
                }],
            }]),
        };
        api.kaderState({ mein: [], team: '' });
        assert.equal(api.ladeKaderTeam('imp-test'), true, 'das Team wurde nicht geladen');
        const st = api.kaderState();
        assert.equal(st.mein.length, 1, 'der Kader ist leer');
        assert.equal(st.mein[0].name, name, 'der falsche Name im Kader');
        assert.equal(st.mein[0].eigen, true, 'der eigene Satz wurde nicht uebernommen');
        assert.equal(api.setFor(name, 'me').item, 'Life Orb',
            'das Item aus dem Team steht nicht im gerechneten Satz');
        assert.equal(api.rechState().me, name, 'der geladene Kader kaempft nicht');
    });

    it('die Punkte werden geklammert wie im Builder (32 je Wert, Summe 66)', () => {
        const { api, sandbox } = load();
        const name = ersterMitSatz(api);
        const roster = api.setData(DATA);
        const slug = roster.find(r => r.name === name).slug;
        sandbox.sideQuest = {
            getActiveCode: () => '',
            getOwnTeams: () => ([{
                replica_code: 'imp-zuviel', team_name: 'Zuviel',
                pokemon: [{
                    name, slug, nature: 'Adamant', ability: '', item: '',
                    evs: '252 HP / 252 Atk / 252 Spe',
                    moves: api.setFor(name, 'me').moves.slice(0, 1),
                }],
            }]),
        };
        api.kaderState({ mein: [] });
        api.ladeKaderTeam('imp-zuviel');
        const sp = api.setFor(name, 'me').spread;
        const summe = ['hp', 'atk', 'def', 'spa', 'spd', 'spe']
            .reduce((s, k) => s + (Number(sp[k]) || 0), 0);
        assert.ok(summe <= api.SP_BUDGET,
            `${summe} Punkte im Kader — mehr als die ${api.SP_BUDGET}, die es in Champions gibt`);
        Object.keys(sp).forEach(k => {
            assert.ok(sp[k] <= api.SP_MAX, `${k} steht auf ${sp[k]}, erlaubt sind ${api.SP_MAX}`);
        });
    });
});
