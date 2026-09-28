/**
 * FE-11 (28.09.2026): eigener Pocket-Scan-Code aus einer Deckliste.
 *
 * js/pocket-deckcode.js wird AUSGEFUEHRT, gegen die echte Kartentabelle
 * (data/pocket_karten_ids.json) und die echten Game8-Codes
 * (data/pocket_tierlist.json): aus der Kartenliste eines Decks gebaut,
 * muss derselbe Inhalt herauskommen, den Game8s Muster traegt.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const R = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');

const sb = {};
vm.createContext(sb);
vm.runInContext(R('js/pocket-deckcode.js'), sb);
const P = sb.PocketDeckcode;
const TAB = JSON.parse(R('data/pocket_karten_ids.json'));
const DECKS = JSON.parse(R('data/pocket_tierlist.json')).decks;
const crypto = require('crypto');
const kennung = (code) => crypto.createHash('sha1').update(code, 'ascii').digest('hex').slice(0, 12);
// Die Decks, deren Code beim Bau der Tabelle aus ihrer Liste herauskam.
// Nicht die Namen: die Tier-Liste ändert sich jede Woche, der Inhalt eines
// Codes nicht (siehe scripts/build_pocket_karten_ids.py, code_kennung).
const PASSTE = new Set(TAB._meta.gegenprobe.gleich_codes);
const sortiert = (a) => Array.from(a).sort((x, y) => x - y).join(',');

function alsText(d, energie) {
    return [...d.pokemon, ...d.trainer]
        .map((c) => `${c.anzahl} ${c.name} ${c.set} ${Number(c.nummer)}`).join('\n') +
        '\nEnergy: ' + energie.map((e) => P.ENERGIE_NAME[e]).join(', ');
}

test('jedes Game8-Deck, das beim Bau passte, ergibt aus seiner Liste denselben Code-Inhalt', () => {
    assert.ok(PASSTE.size, 'die Tabelle nennt kein passendes Deck');
    let geprueft = 0;
    for (const d of DECKS) {
        if (!PASSTE.has(kennung(d.code))) continue;
        const orig = P.lese(d.code);
        const erg = P.baue(P.leseListe(alsText(d, Array.from(orig.energie))), TAB);
        assert.ok(erg.code, `${d.name}: kein Code — ${JSON.stringify(erg.fehler)}`);
        const neu = P.lese(erg.code);
        assert.equal(sortiert(neu.trainer), sortiert(orig.trainer), d.name + ' Trainer');
        assert.equal(sortiert(neu.pokemon), sortiert(orig.pokemon), d.name + ' Pokémon');
        assert.equal(Array.from(neu.energie).join(), Array.from(orig.energie).join(), d.name + ' Energie');
        assert.equal(neu.laenge, orig.laenge, d.name + ' Länge');
        assert.equal(neu.rest, 0);
        geprueft++;
    }
    assert.equal(geprueft, DECKS.filter((d) => PASSTE.has(kennung(d.code))).length);
});

test('die Zuordnung trennt Trainer und Pokémon über die Kennung, nicht über den Namen', () => {
    const erg = P.baue(P.leseListe('2 Poké Ball P-A 5\n2 Frigibax B2a 34\nEnergy: Water'), TAB);
    assert.ok(!erg.code, '4 Karten sind kein Deck');
    assert.equal(erg.trainer[0].name, 'Poké Ball');
    assert.equal(erg.pokemon[0].name, 'Frigibax');
});

function deck20(extra) {
    // 10 verschiedene Karten je 2 — ein gültiges Deck aus der Tabelle.
    return ['2 Frigibax B2a 34', '2 Baxcalibur B2a 36', '1 Chien-Pao ex B2a 37', '2 Suicune ex A4a 20',
        '2 Giant Cape A2 147', '1 Pokemon Center Lady A2b 70', '2 Rare Candy A3 144',
        '1 Inflatable Boat A4a 67', '1 Copycat B1 225', '1 Soothing Shore B4 154',
        "1 Team Rocket's Boss B4a 71", '2 Poke Ball P-A 5', '2 Professor\'s Research P-A 7']
        .concat(extra || []).join('\n');
}

test('ein gültiges Deck ergibt einen Code, den lese() wieder zerlegt', () => {
    const erg = P.baue(P.leseListe(deck20() + '\nEnergy: Water'), TAB);
    assert.deepEqual(Array.from(erg.fehler), []);
    const z = P.lese(erg.code);
    const soll = deck20().split('\n').reduce((a, z) => a + Number(z.split(' ')[0]), 0);
    assert.equal(z.trainer.length + z.pokemon.length, soll);
    assert.deepEqual(Array.from(z.energie), [3]);
    // Genau Game8s Muster für dieses Deck (Chien-Pao ex and Baxcalibur).
    const orig = P.lese(DECKS.find((d) => d.name === 'Chien-Pao ex and Baxcalibur').code);
    assert.equal(sortiert(z.pokemon), sortiert(orig.pokemon));
    assert.equal(sortiert(z.trainer), sortiert(orig.trainer));
});

const arten = (erg) => Array.from(erg.fehler).map((f) => f.art);

test('abgewiesen: 21 Karten, drei gleichen Namens, unbekanntes Set, unbekannte Nummer', () => {
    assert.ok(arten(P.baue(P.leseListe(deck20('1 Copycat B1 225') + '\nEnergy: Water'), TAB)).includes('deckgroesse'));
    const dreimal = deck20().replace('2 Frigibax B2a 34', '1 Frigibax B2a 34') + '\n1 Rare Candy A3 144\nEnergy: Water';
    const drei = P.baue(P.leseListe(dreimal), TAB);
    assert.ok(arten(drei).includes('zu_viele'), 'drei Rare Candy gingen durch');
    assert.equal(Array.from(drei.fehler).find((f) => f.art === 'zu_viele').text, 'Rare Candy');
    // Zwei verschiedene Drucke desselben Namens zählen zusammen.
    const drucke = P.baue(P.leseListe('2 Charmeleon B1a 12\n1 Charmeleon B2b 8\nEnergy: Fire'), TAB);
    assert.ok(arten(drucke).includes('zu_viele'), 'zwei Drucke umgingen die Zwei-Karten-Regel');
    assert.ok(arten(P.baue(P.leseListe('2 Irgendwas Z9 1\nEnergy: Fire'), TAB)).includes('set_unbekannt'));
    assert.ok(arten(P.baue(P.leseListe('2 Irgendwas A1 999\nEnergy: Fire'), TAB)).includes('karte_unbekannt'));
});

test('abgewiesen: Drache und Farblos als Energie, fehlende und zu viele Energien', () => {
    const drache = P.baue(P.leseListe(deck20() + '\nEnergy: Dragon'), TAB);
    assert.ok(!drache.code && arten(drache).includes('energie_verboten'));
    assert.ok(arten(P.baue(P.leseListe(deck20()), TAB)).includes('energie_fehlt'));
    assert.ok(arten(P.baue(P.leseListe(deck20() + '\nEnergy: Fire, Water, Grass, Metal'), TAB)).includes('energie_zu_viele'));
    // Deutsch geht auch, mehrere mit Komma.
    const de = P.baue(P.leseListe(deck20() + '\nEnergie: Wasser, Kampf'), TAB);
    assert.deepEqual(Array.from(P.lese(de.code).energie), [3, 6]);
});

test('ein abweichender Name wird gemeldet, nicht stillschweigend übernommen', () => {
    const erg = P.baue(P.leseListe(deck20().replace('2 Frigibax B2a 34', '2 Glaziola B2a 34') + '\nEnergy: Water'), TAB);
    assert.ok(erg.code, 'der Code entsteht über Set und Nummer');
    assert.deepEqual(Array.from(erg.hinweise).map((h) => h.erwartet), ['Frigibax']);
});

test('nicht erkannte Zeilen werden gemeldet, Überschriften übergangen', () => {
    const l = P.leseListe('Pokémon: 8\nTrainer (12)\n2 Riolu B3 79\nirgendwas\nPROMO-A');
    assert.equal(l.karten.length, 1);
    assert.deepEqual(Array.from(l.fehler).map((f) => f.art), ['nicht_erkannt', 'nicht_erkannt']);
    const alias = P.baue(P.leseListe('2 Poke Ball PROMO-A 5\nEnergy: Water'), TAB);
    assert.equal(alias.trainer[0].set, 'P-A');
});

test('die Seite lädt den Baustein vor dem Pocket-Reiter, der Service Worker hält ihn vor', () => {
    const html = R('index.html').replace(/<!--[\s\S]*?-->/g, '');
    const a = html.indexOf('js/pocket-deckcode.js');
    const b = html.indexOf('js/ds-pocket.js');
    assert.notEqual(a, -1, 'pocket-deckcode.js fehlt');
    assert.ok(a < b, 'pocket-deckcode.js steht nach ds-pocket.js');
    assert.ok(R('service-worker.js').includes("'./js/pocket-deckcode.js'"));
});

test('der Reiter zeigt Fehler an der Liste und öffnet bei Erfolg das Vollbild mit Muster', async () => {
    // ds-pocket.js wird mit einer kleinen Attrappe des DOM ausgeführt.
    const knoten = {};
    const el = (id) => knoten[id] || (knoten[id] = { id, innerHTML: '', hidden: true, value: '', dataset: {},
        addEventListener() {}, querySelector() { return null; }, focus() {} });
    const ctx = {
        console, Promise, JSON, Number, String, Array, Object, Math, Date, RegExp, Error,
        document: { readyState: 'complete', getElementById: el, addEventListener() {} },
        history: { pushState() {}, back() {} }, navigator: {},
        fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve(TAB) }),
        getLang: () => 'de'
    };
    ctx.window = ctx;
    ctx.addEventListener = () => {};
    vm.createContext(ctx);
    vm.runInContext(R('js/qr-svg.js'), ctx);
    vm.runInContext(R('js/pocket-deckcode.js'), ctx);
    vm.runInContext(R('js/ds-pocket.js'), ctx);

    el('pkEigenListe').value = '2 Frigibax B2a 34\nEnergy: Water';
    await ctx.dsPocket.eigenErzeugen();
    assert.match(el('pkEigenMeldung').innerHTML, /genau 20 Karten/);
    assert.equal(el('pocketOverlay').hidden, true, 'bei Fehler darf kein Vollbild aufgehen');

    el('pkEigenListe').value = deck20() + '\nEnergy: Water';
    await ctx.dsPocket.eigenErzeugen();
    assert.equal(el('pocketOverlay').hidden, false, 'das Vollbild ging nicht auf');
    assert.match(el('pocketOverlay').innerHTML, /<svg/);
    assert.match(el('pocketOverlay').innerHTML, /Eigenes Deck/);
    assert.match(el('pocketOverlay').innerHTML, /Energie: Wasser/);
});
