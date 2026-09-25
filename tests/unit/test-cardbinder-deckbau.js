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
