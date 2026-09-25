/* test-cardbinder-deckbau.js — was der Cardbinder am Deck darf.
 *
 * ANLASS (Betreiber, 25.09.2026): „So das ich direkt auf der gespielten
 * Karte mit + dann die Karte ins Deck packen kann … und von Da aus das
 * Deck natürlich in meine Decks Speichern können".
 *
 * Es gibt EIN Deck: das des Deckbauers im Profil
 * (js/app-profile-deck-builder.js). Der Cardbinder legt dort hinein und
 * liest von dort. Drei Dinge werden hier geprueft:
 *
 *   1. DER GEFAEHRLICHE FALL ZUERST. `addCard()` legte bei noch nicht
 *      geladenem Deck ein LEERES an und schrieb es in den Speicher.
 *      `_deck` ist aber nur nach `activate()` gefuellt — und der
 *      Cardbinder legt Karten hinein, ohne dass der Profil-Reiter je
 *      offen war. Das hat das gespeicherte Deck des Nutzers
 *      stillschweigend geleert. Die Auflage des Betreibers dazu ist
 *      ausdruecklich: „Bestehende Nutzerdaten und gespeicherte Decks
 *      niemals verändern oder löschen."
 *   2. Mehrere Kopien in EINEM Zug, mit der Obergrenze aus den
 *      Spielregeln (4, ausser Basis-Energie).
 *   3. Der Weg ins Konto: die Schluesselform von „Meine Decks" und ein
 *      NEUES Deck, kein ueberschriebenes.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WURZEL = path.join(__dirname, '..', '..');
const QUELLE = fs.readFileSync(
    path.join(WURZEL, 'js', 'app-profile-deck-builder.js'), 'utf-8');

const STORAGE_KEY = 'dipidis.profileDeckBuilder.v1';

/* Ein Speicher, den der Test lesen und beschreiben kann. */
function speicherErsatz(anfang) {
    const inhalt = Object.assign({}, anfang || {});
    return {
        inhalt,
        getItem: (k) => (k in inhalt ? inhalt[k] : null),
        setItem: (k, v) => { inhalt[k] = String(v); },
        removeItem: (k) => { delete inhalt[k]; },
    };
}

/* Laedt das Modul frisch, mit eigenem Speicher und eigenem DOM-Ersatz.
 * Die Stuetzen bleiben NACH dem Laden stehen: renderDeckPanel() und
 * renderMulligan() greifen bei jeder Aenderung auf document zu. */
function ladeModul(anfangsSpeicher) {
    const vorher = {
        window: global.window, document: global.document,
        localStorage: global.localStorage, fetch: global.fetch,
    };
    const speicher = speicherErsatz(anfangsSpeicher);
    const ereignisse = [];
    global.window = {};
    global.document = {
        addEventListener: () => {},
        getElementById: () => null,
        querySelectorAll: () => [],
        dispatchEvent: (e) => { ereignisse.push(e); return true; },
    };
    global.CustomEvent = function (typ, opt) {
        this.type = typ;
        this.detail = (opt || {}).detail;
    };
    global.localStorage = speicher;
    global.fetch = async () => ({ ok: false });
    let api;
    try {
        vm.runInThisContext(QUELLE);
        api = global.window.ProfileDeckBuilder;
    } finally {
        global.window = vorher.window;
        global.fetch = vorher.fetch;
        /* document und localStorage bleiben — siehe oben. */
    }
    return { api, speicher, ereignisse, aufraeumen: () => {
        global.document = vorher.document;
        global.localStorage = vorher.localStorage;
    } };
}

const karte = (o) => Object.assign({
    set: 'PBL', number: '46', name_en: 'Drilbur', name_de: 'Rotomurf',
    type: 'Basic', image_url: '', is_japanese: false,
}, o);

const gespeichert = (cards) => JSON.stringify({ name: 'Meins', cards, lastModified: null });

describe('der Cardbinder darf das gespeicherte Deck nicht verlieren', () => {
    it('addCopies liest das gespeicherte Deck, statt ein leeres anzulegen', () => {
        /* Genau der Weg aus der Masterclass: der Profil-Reiter war nie
         * offen, also ist _deck null — im Speicher liegt aber ein Deck
         * mit 59 Karten. */
        const vorhanden = [
            { set: 'TEF', number: '113', name_en: 'Beldum', type: 'Basic', count: 4 },
            { set: 'TEF', number: '114', name_en: 'Metang', type: 'Stage 1', count: 4 },
        ];
        const { api, speicher, aufraeumen } = ladeModul({
            [STORAGE_KEY]: gespeichert(vorhanden),
        });
        try {
            assert.equal(api.getDeck(), null, 'das Deck war beim Laden schon gefuellt');
            api.addCopies(karte({}), 2);
            const jetzt = JSON.parse(speicher.getItem(STORAGE_KEY));
            const namen = jetzt.cards.map((c) => c.name_en).sort();
            assert.deepEqual(namen, ['Beldum', 'Drilbur', 'Metang'],
                'die vorhandenen Karten sind verschwunden — genau der Datenverlust');
            assert.equal(jetzt.cards.find((c) => c.name_en === 'Beldum').count, 4);
            assert.equal(jetzt.name, 'Meins', 'der Deckname wurde ueberschrieben');
        } finally { aufraeumen(); }
    });

    it('countOf liest aus dem Speicher, ohne den Profil-Reiter zu oeffnen', () => {
        const { api, aufraeumen } = ladeModul({
            [STORAGE_KEY]: gespeichert([
                { set: 'PBL', number: '46', name_en: 'Drilbur', type: 'Basic', count: 3 },
            ]),
        });
        try {
            assert.equal(api.countOf(karte({})), 3);
            assert.equal(api.countOf(karte({ number: '47' })), 0,
                'eine Karte, die nicht drin ist, darf nicht gezaehlt werden');
        } finally { aufraeumen(); }
    });

    it('ein kaputter Speicher fuehrt nicht zum Absturz', () => {
        const { api, aufraeumen } = ladeModul({ [STORAGE_KEY]: '{kein json' });
        try {
            assert.equal(api.countOf(karte({})), 0);
            const erg = api.addCopies(karte({}), 1);
            assert.equal(erg.hinzugefuegt, 1);
        } finally { aufraeumen(); }
    });
});

describe('addCopies legt mehrere Kopien in einem Zug hinein', () => {
    it('vier Kopien auf einmal, und die fuenfte nicht', () => {
        const { api, aufraeumen } = ladeModul({});
        try {
            assert.equal(api.addCopies(karte({}), 3).hinzugefuegt, 3);
            assert.equal(api.countOf(karte({})), 3);
            /* Noch zwei gewuenscht, nur eine erlaubt. */
            const erg = api.addCopies(karte({}), 2);
            assert.equal(erg.hinzugefuegt, 1);
            assert.equal(erg.grenze, true, 'die Grenze wurde nicht gemeldet');
            assert.equal(api.countOf(karte({})), 4);
            assert.equal(api.addCopies(karte({}), 1).hinzugefuegt, 0);
        } finally { aufraeumen(); }
    });

    it('Basis-Energie kennt keine Obergrenze', () => {
        const { api, aufraeumen } = ladeModul({});
        const energie = karte({
            set: 'SVI', number: '134', name_en: 'Metal Energy', type: 'Basic Energy',
        });
        try {
            assert.equal(api.addCopies(energie, 9).hinzugefuegt, 9);
            assert.equal(api.countOf(energie), 9);
        } finally { aufraeumen(); }
    });

    it('null oder negative Kopien aendern nichts', () => {
        const { api, aufraeumen } = ladeModul({});
        try {
            assert.equal(api.addCopies(karte({}), 0).hinzugefuegt, 0);
            assert.equal(api.addCopies(karte({}), -3).hinzugefuegt, 0);
            assert.equal(api.countOf(karte({})), 0);
        } finally { aufraeumen(); }
    });

    it('jede Aenderung meldet sich, damit fremde Zaehler nachziehen', () => {
        const { api, ereignisse, aufraeumen } = ladeModul({});
        try {
            api.addCopies(karte({}), 2);
            const meldung = ereignisse.find((e) => e.type === 'profileDeckChanged');
            assert.ok(meldung, 'keine Meldung — der Cardbinder zeigte danach alte Zahlen');
            assert.equal(meldung.detail.total, 2);
        } finally { aufraeumen(); }
    });
});

describe('der Weg in „Meine Decks"', () => {
    it('die Schluesselform ist die des Bestands: Name (SET NUMMER)', () => {
        const { api, aufraeumen } = ladeModul({});
        try {
            /* Dieselbe Form baut js/app-cards-db.js:3996, und
             * js/firebase-collection.js nimmt sie beim Lesen wieder
             * auseinander. */
            assert.equal(api.meineDecksSchluessel(karte({})), 'Drilbur (PBL 46)');
            assert.equal(
                api.meineDecksSchluessel({ name_en: "Hero's Cape", set: 'tef', number: '152' }),
                "Hero's Cape (TEF 152)",
                'das Set gehoert in Grossbuchstaben');
        } finally { aufraeumen(); }
    });

    it('gespeichert wird ein NEUES Deck — bestehende bleiben unberuehrt', () => {
        const { api, aufraeumen } = ladeModul({});
        const gerufen = [];
        global.window = global.window || {};
        global.window.saveDeck = (d) => gerufen.push(d);
        try {
            api.addCopies(karte({}), 4);
            api.addCopies(karte({ set: 'SVI', number: '134', name_en: 'Metal Energy', type: 'Basic Energy' }), 8);
            const erg = api.saveToAccount('Mega-Stalobor-ex');
            assert.equal(erg.ok, true);
            assert.equal(gerufen.length, 1);
            const d = gerufen[0];
            assert.equal(d.name, 'Mega-Stalobor-ex');
            assert.equal(d.id, undefined,
                'mit einer id wuerde saveDeck ein BESTEHENDES Deck ueberschreiben');
            assert.deepEqual(d.cards, { 'Drilbur (PBL 46)': 4, 'Metal Energy (SVI 134)': 8 });
            assert.equal(d.totalCards, 12);
        } finally {
            delete global.window.saveDeck;
            aufraeumen();
        }
    });

    it('ein leeres Deck wird nicht gespeichert', () => {
        const { api, aufraeumen } = ladeModul({});
        const gerufen = [];
        global.window = global.window || {};
        global.window.saveDeck = (d) => gerufen.push(d);
        try {
            const erg = api.saveToAccount('leer');
            assert.equal(erg.ok, false);
            assert.equal(erg.grund, 'leer');
            assert.equal(gerufen.length, 0);
        } finally {
            delete global.window.saveDeck;
            aufraeumen();
        }
    });

    it('ohne Anmeldung wird das gesagt und nichts geschrieben', () => {
        const { api, aufraeumen } = ladeModul({});
        try {
            api.addCopies(karte({}), 1);
            /* window.saveDeck kommt aus js/firebase-collection.js und
             * ist ohne Anmeldung nicht da. */
            if (global.window) delete global.window.saveDeck;
            const erg = api.saveToAccount('x');
            assert.equal(erg.ok, false);
            assert.equal(erg.grund, 'kein-konto');
        } finally { aufraeumen(); }
    });
});

/* ────────────────────────────────────────────────────────────────────
 * DER GETAUSCHTE DRUCK BLEIBT IN SEINER GRUPPE
 *
 * BEFUND (Betreiber, 25.09.2026, Bildschirmfoto): „ich verstehe nicht
 * warum die Karte eine Zeile nach unten rutscht wenn ich die Raritaet
 * wechsle." Nach dem Tausch stand Metang (SVP 90) unter „Ohne Angabe",
 * ohne Preis und ohne Zahlen — neben Genesect-ex (BLK 161) und
 * Mega-Stalobor-ex (PBL 103).
 *
 * URSACHE: die Mappe fuehrt nur Drucke, die in den ausgewerteten Listen
 * WIRKLICH gespielt wurden. Gruppe, Art und ACE SPEC wurden allein am
 * Druck nachgesehen; ein frisch getauschter Druck steht dort nicht, und
 * die Gruppe fiel auf ''. Sie gehoert aber der KARTE, nicht dem Druck.
 *
 * Geprueft wird das VERHALTEN von binderDeckHtml, ausgefuehrt in einem
 * vm-Kontext — nicht der Quelltext. Und die Trennung mit: Preis und
 * Nutzungszahlen duerfen NICHT vom Nachbardruck geliehen werden.
 */
const fs2 = require('node:fs');
const path2 = require('node:path');
const vm2 = require('node:vm');
const JS_MCL = fs2.readFileSync(
    path2.join(__dirname, '..', '..', 'js', 'ds-masterclass.js'), 'utf8');

function schneide(quelle, name) {
    const treffer = new RegExp(`function\\s+${name}\\s*\\(`).exec(quelle);
    assert.ok(treffer, `Funktion nicht gefunden: ${name}`);
    const auf = quelle.indexOf('{', treffer.index);
    let tiefe = 0;
    for (let i = auf; i < quelle.length; i++) {
        if (quelle[i] === '{') tiefe++;
        else if (quelle[i] === '}') { tiefe--; if (tiefe === 0) return quelle.slice(treffer.index, i + 1); }
    }
    throw new Error(`Klammer nicht geschlossen: ${name}`);
}

/* Der Deckbereich mit einer Mappe und einem Deck, beides frei gesetzt. */
function ladeDeckbereich(mappenKarten, deckKarten) {
    const namen = ['binderDeckHtml', 'binderDeckKachelHtml', 'binderDeckWissen',
        'binderMappeIndex', 'binderMappeNamen', 'binderKartenSchluessel',
        'binderDruck', 'binderZahl', 'binderDeckKarten', 'deckBauer'];
    const quelle = namen.map((n) => schneide(JS_MCL, n)).join('\n');
    const ktx = {
        assert,
        esc: (s) => String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;'),
        T: (k) => k,
        bildAdresse: (d) => 'https://bild.invalid/' + d + '.png',
        BINDER_GRUPPEN: ['pokemon', 'supporter', 'item', 'tool', 'stadium',
            'special-energy', 'basic-energy'],
        BINDER_GRUPPE_TXT: {
            'pokemon': 'binderGrpPokemon', 'supporter': 'binderGrpSupporter',
            'item': 'binderGrpItem', 'tool': 'binderGrpTool',
            'stadium': 'binderGrpStadium', 'special-energy': 'binderGrpSpecialEnergy',
            'basic-energy': 'binderGrpBasicEnergy'
        },
        binderDaten: { 'mega-stalobor': { karten: mappenKarten } },
        /* Der Deckbauer des Profils, so weit binderDeckKarten ihn braucht. */
        window: {
            ProfileDeckBuilder: {
                /* deckBauer() verlangt addCopies — sonst gilt der
                 * Deckbauer als nicht da und das Deck ist leer. */
                addCopies: () => ({ hinzugefuegt: 0 }),
                getDeck: () => ({ cards: deckKarten }),
                countOf: () => 0
            }
        }
    };
    vm2.createContext(ktx);
    vm2.runInContext(quelle, ktx);
    return vm2.runInContext('({' + namen.join(',') + '})', ktx);
}

const mappe = (o) => Object.assign({
    name: 'Metang', name_de: 'Metang', set: 'TEF', nummer: '114',
    typ: 'Stage 1', gruppe: 'pokemon', ace: null,
    bild: 'https://bild.invalid/TEF-114.png',
    preis: { eur: 1.03 },
    gesamt: { listen_mit_karte: 100, listen_gesamt: 200, anteil: 50, schnitt: 2.5, hoechstzahl: 3 }
}, o);

const gruppeVon = (html, name) => {
    /* Die Kachel steht unter der letzten Gruppenueberschrift vor ihr. */
    const stelle = html.indexOf('>' + name + '<');
    assert.ok(stelle > 0, `Kachel nicht im Deckbereich: ${name}`);
    const vorher = html.slice(0, stelle);
    const letzte = vorher.lastIndexOf('<h5 class="mcl-bd-grp">');
    assert.ok(letzte >= 0, 'keine Gruppenueberschrift vor der Kachel');
    return /<h5 class="mcl-bd-grp">([^<]+)/.exec(vorher.slice(letzte))[1].trim();
};

describe('ein getauschter Druck verliert seine Gruppe nicht', () => {
    const basis = [
        mappe({}),
        mappe({ name: 'Beldum', name_de: 'Tanhel', nummer: '113', typ: 'Basic' }),
        mappe({ name: 'Buddy-Buddy Poffin', name_de: 'Dicke-Freunde-Knursp',
                set: 'TEF', nummer: '144', typ: 'Item', gruppe: 'item' })
    ];

    it('SVP 90 steht bei den Pokemon, nicht unter „Ohne Angabe"', () => {
        const { binderDeckHtml } = ladeDeckbereich(basis, [
            /* genau der Zustand nach binderDruckTauschen: TEF 114 -> SVP 90 */
            { set: 'SVP', number: '90', name_en: 'Metang', name_de: 'Metang',
              type: 'Stage 1', count: 4 },
            { set: 'TEF', number: '113', name_en: 'Beldum', name_de: 'Tanhel',
              type: 'Basic', count: 4 }
        ]);
        const html = binderDeckHtml({ id: 'mega-stalobor', titel: 'Mega-Stalobor-ex' });
        assert.equal(gruppeVon(html, 'Metang'), 'binderGrpPokemon',
            'die Karte ist aus ihrer Gruppe gefallen — genau der Befund');
        assert.ok(!/binderGrpOhne/.test(html),
            'es gibt eine Gruppe „Ohne Angabe", obwohl jede Karte eine Karte der Mappe ist');
    });

    it('Preis und Nutzungszahlen werden NICHT vom Nachbardruck geliehen', () => {
        const { binderDeckHtml } = ladeDeckbereich(basis, [
            { set: 'SVP', number: '90', name_en: 'Metang', name_de: 'Metang',
              type: 'Stage 1', count: 4 }
        ]);
        const html = binderDeckHtml({ id: 'mega-stalobor', titel: 'x' });
        const kachel = html.slice(html.indexOf('data-mcl-bddeckkarte="SVP-90"'));
        const ende = kachel.indexOf('</div></div></div></div>');
        const stueck = kachel.slice(0, ende);
        assert.ok(/>–</.test(stueck),
            'der Preis des TEF-Drucks steht am SVP-Druck — das waere geraten');
        assert.ok(!/1,03/.test(stueck), 'der Preis wurde geliehen');
        assert.ok(!/city-league-card-stats-mobile/.test(stueck),
            'ein Anteil, den dieser Druck nie hatte');
        assert.ok(!/city-league-card-avg-mobile/.test(stueck),
            'ein Schnitt, den dieser Druck nie hatte');
    });

    it('der Druck der Mappe behaelt Preis und Zahlen', () => {
        const { binderDeckHtml } = ladeDeckbereich(basis, [
            { set: 'TEF', number: '114', name_en: 'Metang', type: 'Stage 1', count: 2 }
        ]);
        const html = binderDeckHtml({ id: 'mega-stalobor', titel: 'x' });
        assert.ok(/1,03€/.test(html), 'der Preis fehlt');
        assert.ok(/50,0/.test(html), 'der Anteil fehlt');
        assert.ok(/2,50x/.test(html), 'der Schnitt fehlt');
    });

    it('ACE SPEC gilt der Karte, also auch dem getauschten Druck', () => {
        const mitAce = basis.concat([mappe({
            name: 'Prime Catcher', name_de: 'Erstklassiger Fänger', set: 'TEF',
            nummer: '157', typ: 'Item', gruppe: 'item', ace: 'ACE SPEC'
        })]);
        const { binderDeckHtml } = ladeDeckbereich(mitAce, [
            { set: 'SVP', number: '999', name_en: 'Prime Catcher',
              name_de: 'Erstklassiger Fänger', type: 'Item', count: 2 }
        ]);
        const html = binderDeckHtml({ id: 'mega-stalobor', titel: 'x' });
        assert.ok(/mcl-bd-dace/.test(html), 'die ACE SPEC wurde nicht erkannt');
        assert.ok(/binderWarnAce/.test(html),
            'zwei ACE SPEC im Deck, und keine Warnung');
    });

    it('„Basis-Pokemon fehlt" richtet sich nach der Karte, nicht nach dem Druck', () => {
        const { binderDeckHtml } = ladeDeckbereich(basis, [
            { set: 'SVP', number: '17', name_en: 'Beldum', name_de: 'Tanhel',
              /* der Deckbauer traegt die Art mit; hier absichtlich LEER,
               * damit allein die Mappe die Frage beantworten muss */
              type: '', count: 4 }
        ]);
        const html = binderDeckHtml({ id: 'mega-stalobor', titel: 'x' });
        assert.ok(!/binderWarnBasis/.test(html),
            'Tanhel ist ein Basis-Pokemon — die Warnung ist falsch');
    });

    it('eine Karte, die die Mappe gar nicht kennt, steht weiter unter „Ohne Angabe"', () => {
        /* Die Rueckfallebene darf nicht raten: was in keiner Fassung in
         * der Mappe steht, bekommt keine Gruppe angedichtet. */
        const { binderDeckHtml } = ladeDeckbereich(basis, [
            { set: 'BLK', number: '161', name_en: 'Genesect ex',
              name_de: 'Genesect-ex', type: 'Basic', count: 1 }
        ]);
        const html = binderDeckHtml({ id: 'mega-stalobor', titel: 'x' });
        assert.equal(gruppeVon(html, 'Genesect-ex'), 'binderGrpOhne');
    });

    it('Basis-Energie: „Metal Energy" und „Basic Metal Energy" sind dieselbe Karte', () => {
        const mitEnergie = basis.concat([mappe({
            name: 'Basic Metal Energy', name_de: 'Basis-Metall-Energie',
            set: 'SVE', nummer: '16', typ: 'Basic Energy', gruppe: 'basic-energy'
        })]);
        const { binderDeckHtml } = ladeDeckbereich(mitEnergie, [
            { set: 'SVI', number: '134', name_en: 'Metal Energy',
              name_de: 'Metall-Energie', type: 'Basic Energy', count: 8 }
        ]);
        const html = binderDeckHtml({ id: 'mega-stalobor', titel: 'x' });
        assert.equal(gruppeVon(html, 'Metall-Energie'), 'binderGrpBasicEnergy');
    });

    /* Die beiden Sprachen einzeln — sonst traegt die eine die andere und
     * eine kaputte Normierung bleibt unbemerkt (gemessen in der
     * Verfaelschungsprobe: der deutsche Weg hat den englischen gedeckt). */
    it('allein ueber den englischen Namen: „Metal Energy" findet „Basic Metal Energy"', () => {
        const { binderDeckHtml } = ladeDeckbereich(basis.concat([mappe({
            name: 'Basic Metal Energy', name_de: 'Basis-Metall-Energie',
            set: 'SVE', nummer: '16', typ: 'Basic Energy', gruppe: 'basic-energy'
        })]), [
            /* ohne name_de: nur der englische Name kann greifen */
            { set: 'SVI', number: '134', name_en: 'Metal Energy',
              type: 'Basic Energy', count: 8 }
        ]);
        const html = binderDeckHtml({ id: 'mega-stalobor', titel: 'x' });
        assert.equal(gruppeVon(html, 'Metal Energy'), 'binderGrpBasicEnergy');
    });

    it('allein ueber den deutschen Namen: „Metall-Energie" findet „Basis-Metall-Energie"', () => {
        const { binderDeckHtml } = ladeDeckbereich(basis.concat([mappe({
            name: 'Basic Metal Energy', name_de: 'Basis-Metall-Energie',
            set: 'SVE', nummer: '16', typ: 'Basic Energy', gruppe: 'basic-energy'
        })]), [
            /* ohne name_en: nur der deutsche Name kann greifen */
            { set: 'SVI', number: '134', name_de: 'Metall-Energie',
              type: 'Basic Energy', count: 8 }
        ]);
        const html = binderDeckHtml({ id: 'mega-stalobor', titel: 'x' });
        assert.equal(gruppeVon(html, 'Metall-Energie'), 'binderGrpBasicEnergy');
    });
});

/* Das Plus muss auch an einem getauschten Druck arbeiten.
 *
 * NEBENBEFUND derselben Ursache (25.09.2026): binderPlus() sah den Druck
 * nur in der Mappe nach und kehrte ohne sie wortlos um. Nach einem
 * Artwork-Tausch tat das „+" auf der Kachel damit NICHTS — kein Fehler,
 * keine Meldung, keine Karte. */
describe('das Plus auf der Deckkachel', () => {
    function ladePlus(mappenKarten, deckKarten) {
        const namen = ['binderPlus', 'binderWissenZuDruck', 'binderDeckWissen',
            'binderMappeIndex', 'binderMappeNamen', 'binderKartenSchluessel',
            'binderDruck', 'binderDeckKarten', 'binderDeckKarte', 'deckBauer'];
        const quelle = namen.map((n) => schneide(JS_MCL, n)).join('\n');
        const gelegt = [];
        const ktx = {
            assert, T: (k) => k,
            binderDaten: { g1: { karten: mappenKarten } },
            binderStand: {},
            binderStandNeu: () => ({ meta: 'gesamt', sort: 'standard', nurTim: false }),
            binderMenge: () => 3,
            binderMeldung: () => {},
            binderZaehlerNachziehen: () => {},
            window: {
                ProfileDeckBuilder: {
                    addCopies: (karte, n) => { gelegt.push({ karte, n }); return { hinzugefuegt: n }; },
                    getDeck: () => ({ cards: deckKarten }),
                    countOf: () => 0
                }
            }
        };
        vm2.createContext(ktx);
        vm2.runInContext(quelle, ktx);
        const api = vm2.runInContext('({' + namen.join(',') + '})', ktx);
        return { api, gelegt };
    }

    const m = [mappe({})];

    it('ein Druck aus der Mappe: die Menge kommt aus der Regel des Hauses', () => {
        const { api, gelegt } = ladePlus(m, []);
        api.binderPlus({}, { id: 'g1' }, 'TEF-114');
        assert.equal(gelegt.length, 1);
        assert.equal(gelegt[0].n, 3, 'binderMenge wurde nicht gefragt');
        assert.equal(gelegt[0].karte.set, 'TEF');
    });

    it('ein getauschter Druck: EINE Kopie, aus der Deckkarte gebaut', () => {
        const { api, gelegt } = ladePlus(m, [
            { set: 'SVP', number: '90', name_en: 'Metang', name_de: 'Metang',
              type: 'Stage 1', count: 4 }
        ]);
        api.binderPlus({}, { id: 'g1' }, 'SVP-90');
        assert.equal(gelegt.length, 1, 'das Plus hat nichts getan — genau der Nebenbefund');
        assert.equal(gelegt[0].karte.set, 'SVP');
        assert.equal(gelegt[0].karte.number, '90');
        assert.equal(gelegt[0].n, 1);
    });

    it('ein Druck, den weder Mappe noch Deck kennen, legt nichts hinein', () => {
        const { api, gelegt } = ladePlus(m, []);
        api.binderPlus({}, { id: 'g1' }, 'XXX-1');
        assert.equal(gelegt.length, 0);
    });
});
