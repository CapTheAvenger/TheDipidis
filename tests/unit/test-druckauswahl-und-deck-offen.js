/* test-druckauswahl-und-deck-offen.js — zwei Befunde aus „Meine Decks".
 *
 * (1) „bei den Metal Energien sind SVE 24 nicht zur Auswahl dabei"
 *     (Betreiber, 25.09.2026, Bildschirmfoto). Der Druckschalter bot
 *     SFA 99, CRZ 159, EVS 237, SUM 163, EVO 98, GEN 82, XY 139,
 *     BLW 112, CL 87, CL 95 — keine einzige SVE-Energie, also gerade
 *     nicht den Druck, den heute jedes Deck spielt.
 *
 *     URSACHE: der Filter verlangte neben einem Bild auch eine RARITY.
 *     Die Kartendatenbank fuehrt fuer 167 englische Trainer- und
 *     Energiekarten keine — darunter ALLE 24 SVE-Basis-Energien. Eine
 *     leere Anzeigespalte hat einen echten Druck aus der Auswahl
 *     geworfen.
 *
 * (2) „wenn ich in my decks eine Karte den Rarity Switcher nutze,
 *     klappt sich das Deck wieder ein … ich will, dass ich mein Deck
 *     bearbeiten kann und es aufgeklappt bleibt."
 *
 *     URSACHE: selectRarityVersion rief updateDecksUI() ohne den
 *     Schritt, den Plus und Minus laengst machen. Die Regel „jedes
 *     Neuzeichnen beginnt zugeklappt" (2026-05-05) bleibt — sie gilt
 *     jetzt nur nicht mehr fuer das Deck, das gerade bearbeitet wird.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WURZEL = path.join(__dirname, '..', '..');
const DB = fs.readFileSync(path.join(WURZEL, 'js', 'app-cards-db.js'), 'utf8');
const SAMMLUNG = fs.readFileSync(path.join(WURZEL, 'js', 'firebase-collection.js'), 'utf8');

const ohneKommentare = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

test('das Kommentar-Ausschneiden entfernt nicht zu viel', () => {
    [DB, SAMMLUNG].forEach((t) => assert.ok(ohneKommentare(t).length > t.length * 0.3,
        'zu viel weggeschnitten'));
});

function schneideFunktion(quelle, name) {
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

/* ── 1 · Welcher Druck steht zur Auswahl ─────────────────────────── */

function ladeWaehlbar(bildAusRegister) {
    const ktx = {
        assert, window: {},
        getUnifiedCardImage: bildAusRegister || (() => '')
    };
    vm.createContext(ktx);
    vm.runInContext(schneideFunktion(DB, 'druckIstWaehlbar'), ktx);
    return vm.runInContext('druckIstWaehlbar', ktx);
}

const druck = (o) => Object.assign({
    set: 'SVE', number: '24', name_en: 'Metal Energy', type: 'Basic Energy',
    rarity: '', image_url: 'https://cdn.invalid/SVE_024_R_EN_LG.png'
}, o);

test('SVE 24 steht zur Auswahl, obwohl die Rarity leer ist', () => {
    const waehlbar = ladeWaehlbar();
    assert.strictEqual(waehlbar(druck({})), true,
        'der Druck faellt wieder aus der Auswahl — genau der Befund');
});

test('auch ganz ohne Rarity-Feld', () => {
    const waehlbar = ladeWaehlbar();
    const d = druck({});
    delete d.rarity;
    assert.strictEqual(waehlbar(d), true);
});

test('ohne Bild bleibt der Druck draussen — eine leere Kachel ist keine Wahl', () => {
    const waehlbar = ladeWaehlbar();
    assert.strictEqual(waehlbar(druck({ image_url: '', rarity: 'Common' })), false);
    assert.strictEqual(waehlbar(druck({ image_url: '   ', rarity: 'Common' })), false);
    assert.strictEqual(waehlbar(null), false);
});

test('ein Bild aus dem Kartenregister genuegt auch', () => {
    const waehlbar = ladeWaehlbar((set, nummer) =>
        (set === 'SVE' && nummer === '24') ? 'https://cdn.invalid/aus-dem-register.png' : '');
    assert.strictEqual(waehlbar(druck({ image_url: '' })), true);
    assert.strictEqual(waehlbar(druck({ set: 'XXX', number: '1', image_url: '' })), false);
});

test('der Filter im Druckschalter benutzt genau diese Regel', () => {
    const nackt = ohneKommentare(DB);
    assert.ok(/versions = versions\.filter\(druckIstWaehlbar\);/.test(nackt),
        'der Druckschalter filtert wieder mit einer eigenen Bedingung');
    assert.ok(!/const hasRarity = version\.rarity/.test(nackt),
        'die Rarity-Bedingung ist zurueck — dann fehlt SVE 24 wieder');
});

test('und die Karten, um die es geht, sind wirklich in der Datenbank', () => {
    /* Gegen Drift: faende die Datenbank eines Tages doch eine Rarity
     * fuer SVE, bliebe dieser Test gruen — er behauptet nur, dass die
     * Drucke da sind und ein Bild haben. Verschwinden sie, ist das ein
     * Datenbefund und kein Filterproblem. */
    const dateien = fs.readdirSync(path.join(WURZEL, 'data'))
        .filter((n) => /^cards_chunk_.*\.json$/.test(n));
    if (!dateien.length) return;   // ohne Daten keine Aussage
    let sve = [];
    dateien.forEach((n) => {
        const karten = JSON.parse(fs.readFileSync(path.join(WURZEL, 'data', n), 'utf8'));
        sve = sve.concat(karten.filter((c) => String(c.set || '').toUpperCase() === 'SVE'
            && String(c.name_en || '') === 'Metal Energy'));
    });
    assert.ok(sve.length >= 1, 'keine SVE-Metall-Energie in der Kartendatenbank');
    const waehlbar = ladeWaehlbar();
    sve.forEach((c) => assert.strictEqual(waehlbar(c), true,
        `${c.set} ${c.number} ist nicht waehlbar (rarity="${c.rarity}", bild="${c.image_url}")`));
    const nummern = sve.map((c) => String(c.number)).sort();
    assert.ok(nummern.includes('24'), `SVE 24 fehlt in der Datenbank (da: ${nummern})`);
});

/* ── 2 · Das bearbeitete Deck bleibt offen ───────────────────────── */

function ladeAufklappen(elemente) {
    const ktx = {
        assert,
        window: {},
        document: { getElementById: (id) => elemente[id] || null }
    };
    vm.createContext(ktx);
    vm.runInContext(schneideFunktion(SAMMLUNG, 'deckAufklappen'), ktx);
    return vm.runInContext('deckAufklappen', ktx);
}

test('deckAufklappen oeffnet ein zugeklapptes Deck und dreht den Pfeil', () => {
    const elemente = {
        'saved-deck-2': { style: { display: 'none' } },
        'saved-deck-2-arrow': { style: { transform: 'rotate(0deg)' } }
    };
    const auf = ladeAufklappen(elemente);
    assert.strictEqual(auf('saved-deck-2'), true);
    assert.strictEqual(elemente['saved-deck-2'].style.display, 'block');
    assert.strictEqual(elemente['saved-deck-2-arrow'].style.transform, 'rotate(180deg)');
});

test('ein bereits offenes Deck bleibt offen — kein Umschalter', () => {
    /* Der Unterschied zu toggleDeckCollapse: zweimal aufklappen darf
     * nicht zuklappen. Genau daran waere die Reparatur gescheitert,
     * haette sie den Umschalter benutzt. */
    const elemente = {
        'saved-deck-0': { style: { display: 'block' } },
        'saved-deck-0-arrow': { style: { transform: 'rotate(180deg)' } }
    };
    const auf = ladeAufklappen(elemente);
    /* Nach JEDEM Aufruf geprueft — zweimal umschalten steht sonst
     * wieder auf „block" und die Probe merkt nichts. */
    auf('saved-deck-0');
    assert.strictEqual(elemente['saved-deck-0'].style.display, 'block',
        'der erste Aufruf hat das offene Deck zugeklappt');
    auf('saved-deck-0');
    assert.strictEqual(elemente['saved-deck-0'].style.display, 'block',
        'der zweite Aufruf hat das offene Deck zugeklappt');
    assert.strictEqual(elemente['saved-deck-0-arrow'].style.transform, 'rotate(180deg)');
});

test('ein Deck, das es nicht gibt, ist kein Absturz', () => {
    const auf = ladeAufklappen({});
    assert.strictEqual(auf('saved-deck-9'), false);
});

test('updateDecksUI haelt genau das bearbeitete Deck offen', () => {
    const nackt = ohneKommentare(SAMMLUNG);
    assert.ok(/function updateDecksUI\(offenHalten\)/.test(nackt),
        'updateDecksUI nimmt die Deck-Kennung nicht mehr entgegen');
    assert.ok(/if \(i >= 0\) deckAufklappen\(`saved-deck-\$\{i\}`\)/.test(nackt),
        'das bearbeitete Deck wird nach dem Neuzeichnen nicht wieder geoeffnet');
    /* Ueber die Kennung, nicht ueber die laufende Nummer: die
     * Reihenfolge der Liste kann sich beim Neuzeichnen aendern. */
    assert.ok(/findIndex\(\s*d => d && String\(d\.id\) === String\(offenHalten\)\)/.test(nackt),
        'das Deck wird ueber seine Listenposition gesucht statt ueber seine Kennung');
});

test('der Druckwechsel gibt die Kennung des Decks weiter', () => {
    const nackt = ohneKommentare(DB);
    assert.ok(/updateDecksUI\(profileDeckId\)/.test(nackt),
        'selectRarityVersion zeichnet die Liste weiterhin ohne Merker neu — '
        + 'das Deck klappt dann wieder zu');
});

test('es gibt nur EINEN Weg, ein Deck wieder aufzuklappen', () => {
    /* Vier Abschriften desselben Dreizeilers waren der Grund, warum die
     * fuenfte Stelle ihn vergessen konnte. */
    const nackt = ohneKommentare(SAMMLUNG);
    const alteForm = (nackt.match(/toggleDeckCollapse\(`saved-deck-\$\{deckIndex\}`\)/g) || []).length;
    assert.strictEqual(alteForm, 0,
        'eine Stelle klappt wieder mit dem Umschalter auf — der klappt ein offenes Deck ZU');
});
