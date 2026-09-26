/* ══════════════════════════════════════════════════════════════════════
 * DIE ÜBERGABE AN DIE POST-SEITE
 * ══════════════════════════════════════════════════════════════════════
 *
 * BESTELLT (Betreiber, 25.09.2026, in drei Nachrichten):
 *
 *   „ich hätte in My Decks gerne direkt eine Posts Option, damit ich es
 *    bei Instagram posten kann in meinem festgelegten Design oder
 *    zumindest auf der Posts Seite, dass ich das Deck dort aufrufen kann"
 *   „und gleiches gilt für den Battle Journal"
 *   „diese ganzen Meta Share Daten für ein Turnier will ich gerne als
 *    Post haben, sowohl einzeln als auch als Karussell … 1x Standard
 *    Meta Call und meine gespeicherte Prognose. Dann wähle ich noch mein
 *    Deck aus, was ich spielen will"
 *
 * posts/index.html ist eine eigenständige Seite ohne Anmeldung. Deck,
 * Turnier und Meta Call liegen im Konto — die Seite käme nie daran. Der
 * lokale Speicher ist der kürzeste ehrliche Weg zwischen beiden.
 *
 * Geprüft wird, was schiefgehen kann, ohne dass es auffällt:
 *   1. eine Übergabe aus einer anderen Fassung wird NICHT gedeutet;
 *   2. ohne Speicher (privates Fenster) gibt es keine halbe Übergabe;
 *   3. die Zahlen auf dem Bild sind die der Übergabe — keine gerechnet,
 *      keine geraten, keine aus dem vorigen Stand stehen geblieben;
 *   4. die beiden Stände (Modell / eigene Schätzung) bleiben getrennt;
 *   5. eine Scheibe ohne Daten wird NICHT angeboten.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const MUSTER = require('../post-uebergabe-muster.js');

const WURZEL = path.join(__dirname, '..', '..');
const D = (p) => path.join(WURZEL, p);

/* Ein Fenster wie das der Post-Seite: Speicher, fetch aus dem
 * Dateisystem, sonst nichts. */
function fenster(art) {
    const ctx = { console };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    ctx.fetch = function (u) {
        const p = D(String(u).replace(/^\.\.\//, ''));
        const da = fs.existsSync(p);
        return Promise.resolve({
            ok: da, status: da ? 200 : 404,
            text: () => Promise.resolve(fs.readFileSync(p, 'utf8')),
            json: () => Promise.resolve(JSON.parse(fs.readFileSync(p, 'utf8')))
        });
    };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(D('js/matchup-glaettung.js'), 'utf8'), ctx,
                    { filename: 'matchup-glaettung.js' });
    if (art !== 'ohne-uebergabe') MUSTER.uebergabeEinrichten(ctx, art);
    else {
        const inhalt = {};
        ctx.localStorage = {
            getItem: (k) => (k in inhalt ? inhalt[k] : null),
            setItem: (k, v) => { inhalt[k] = String(v); },
            removeItem: (k) => { delete inhalt[k]; }
        };
        vm.runInContext(fs.readFileSync(D('js/ds-post-uebergabe.js'), 'utf8'), ctx,
                        { filename: 'ds-post-uebergabe.js' });
    }
    vm.runInContext(fs.readFileSync(D('js/ds-post-quellen.js'), 'utf8'), ctx,
                    { filename: 'ds-post-quellen.js' });
    return ctx;
}

/* ── 1 · Das Modul ────────────────────────────────────────────────── */

test('was gelegt wurde, kommt unveraendert zurueck', () => {
    const w = fenster('deck').window;
    const p = w.DsPostUebergabe.holen();
    assert.equal(p.art, 'deck');
    assert.equal(p.v, w.DsPostUebergabe.FASSUNG);
    assert.equal(p.daten.karten['Metang (TEF 114)'], 4);
    assert.equal(p.daten.gesamt, 60);
    assert.ok(p.stand, 'ohne Zeitstempel ist nicht zu sehen, wie alt die Uebergabe ist');
});

test('eine Uebergabe aus einer anderen Fassung wird nicht gedeutet', () => {
    /* Ein halb verstandenes Paket malt ein halb richtiges Bild. */
    const w = fenster('deck').window;
    const roh = JSON.parse(w.localStorage.getItem(w.DsPostUebergabe.SCHLUESSEL));
    roh.v = 99;
    w.localStorage.setItem(w.DsPostUebergabe.SCHLUESSEL, JSON.stringify(roh));
    assert.equal(w.DsPostUebergabe.holen(), null);
});

test('eine unbekannte Art wird nicht gelegt und nicht gelesen', () => {
    const w = fenster('deck').window;
    assert.equal(w.DsPostUebergabe.legen('rezept', 'x', {}).ok, false);
    const roh = JSON.parse(w.localStorage.getItem(w.DsPostUebergabe.SCHLUESSEL));
    roh.art = 'rezept';
    w.localStorage.setItem(w.DsPostUebergabe.SCHLUESSEL, JSON.stringify(roh));
    assert.equal(w.DsPostUebergabe.holen(), null);
});

test('ohne Speicher gibt es keine halbe Uebergabe', () => {
    /* Privates Fenster: schon der Zugriff wirft. Dann muss der Aufrufer
     * es erfahren — ein stilles false waere ein Knopf, der nichts tut. */
    const w = fenster('deck').window;
    w.localStorage = { getItem() { throw new Error('nope'); },
                       setItem() { throw new Error('nope'); },
                       removeItem() { throw new Error('nope'); } };
    const erg = w.DsPostUebergabe.legen('deck', 'x', { karten: {} });
    assert.equal(erg.ok, false);
    assert.equal(erg.grund, 'kein-speicher');
    assert.equal(w.DsPostUebergabe.holen(), null);
});

test('was zu gross ist, wird abgelehnt statt den Speicher zu fuellen', () => {
    const w = fenster('deck').window;
    const riesig = {};
    for (let i = 0; i < 20000; i++) riesig['Karte ' + i + ' (SET ' + i + ')'] = 1;
    const erg = w.DsPostUebergabe.legen('deck', 'zu gross', { karten: riesig });
    assert.equal(erg.ok, false);
    assert.equal(erg.grund, 'zu-gross');
    /* Und die vorherige Uebergabe steht noch. */
    assert.equal(w.DsPostUebergabe.holen().daten.gesamt, 60);
});

test('ausDeck nimmt nur, was das Bild braucht', () => {
    const w = fenster('deck').window;
    const d = w.DsPostUebergabe.ausDeck({
        id: 'abc123', name: 'Mein Deck', archetype: 'Mega Excadrill',
        userId: 'u-1', createdAt: 'gestern',
        cards: { 'Metang (TEF 114)': 4, 'Beldum (TEF 113)': 0 }
    });
    assert.deepEqual(Object.keys(d).sort(),
        ['archetyp', 'bilder', 'gesamt', 'karten', 'titel']);
    assert.equal(d.karten['Beldum (TEF 113)'], undefined, 'eine 0 gehoert nicht ins Deck');
    assert.equal(d.gesamt, 4);
    const roh = JSON.stringify(d);
    assert.ok(roh.indexOf('u-1') < 0 && roh.indexOf('abc123') < 0,
        'eine Kennung aus dem Konto ist mitgegangen');
});

/* ── 2 · Die Quelle auf der Post-Seite ────────────────────────────── */

test('ohne Uebergabe sagt die Quelle, was zu tun ist', async () => {
    const Q = fenster('ohne-uebergabe').window.DsPostQuellen;
    await assert.rejects(() => Q.lade('uebergabe'), (e) => {
        assert.match(e.message, /My decks|Battle Journal/);
        return true;
    });
});

test('ein Deck wird zum Kartengitter, mit Stueckzahl und Druck', async () => {
    const Q = fenster('deck').window.DsPostQuellen;
    const erg = await Q.lade('uebergabe');
    assert.ok(erg.kartenGitter && erg.kartenGitter.length === 22,
        'nicht alle 22 verschiedenen Karten im Gitter');
    const summe = erg.kartenGitter.reduce((s, k) => s + k.anzahl, 0);
    assert.equal(summe, 60, 'das Gitter traegt nicht 60 Karten');
    const energie = erg.kartenGitter[0];
    assert.equal(energie.anzahl, 16, 'die haeufigste Karte steht nicht oben');
    assert.equal(energie.set, 'SVE');
    assert.equal(energie.nummer, '16');
    assert.ok(erg.vorlagen.indexOf('deckliste') >= 0);
    assert.match(erg.fuss, /22 different · 60 cards/);
});

test('ein Turnier bringt seine Runden und seine eingefrorene Liste mit', async () => {
    const Q = fenster('turnier').window.DsPostQuellen;
    const erg = await Q.lade('uebergabe');
    assert.match(erg.zeilen, /^R1 · Alakazam Dudunsparce \| W WW$/m);
    assert.equal(erg.ohneRang, true, 'Runden bekommen keine Rangziffern');
    assert.match(erg.fuss, /1-0-0/);
    assert.ok(erg.kartenGitter.length === 22, 'die eingefrorene Liste fehlt');
});

/* ── 3 · Der Meta Call ────────────────────────────────────────────── */

const MC = {
    titel: 'Regional Frankfurt September 2026', art: 'Regional/SPE',
    format: 'Current Meta (30C)', spieler: 3200, runden: 8, day2Punkte: 16,
    meinDeck: 'Mega Excadrill', eigeneSchaetzungen: true,
    staende: {
        eigen: {
            feld: [{ name: 'Dragapult', anteil: 18.0, schnitt: 1.44 },
                   { name: 'Mega Excadrill', anteil: 4.0, schnitt: 0.32 },
                   { name: 'Crustle', anteil: 4.0, schnitt: 0.32 }],
            decks: {
                'Mega Excadrill': {
                    ergebnis: { day2: 17.8, wins: 3.6, ties: 1.1, losses: 3.4, quote: 44.5 },
                    quoten: { 'Dragapult': 58, 'Crustle': 66, 'Mega Excadrill': 50 }
                },
                'Crustle': {
                    ergebnis: { day2: 22.5, wins: 3.8, ties: 1.0, losses: 3.2, quote: 47.3 },
                    quoten: { 'Dragapult': 44, 'Mega Excadrill': 34 }
                }
            },
            empfehlungen: [{ name: 'Crustle', day2: 22.5, quote: 47.3 }]
        },
        standard: {
            feld: [{ name: 'Dragapult', anteil: 18.8, schnitt: 1.50 },
                   { name: 'Mega Excadrill', anteil: 3.97, schnitt: 0.32 }],
            decks: {
                'Mega Excadrill': {
                    ergebnis: { day2: 17.1, wins: 3.5, ties: 1.1, losses: 3.4, quote: 44.0 },
                    quoten: { 'Dragapult': 58 }
                }
            },
            empfehlungen: [{ name: 'Crustle', day2: 22.5, quote: 47.3 }]
        }
    }
};

function mcFenster() {
    const ctx = fenster('ohne-uebergabe');
    ctx.window.DsPostUebergabe.legen('metacall', MC.titel, MC);
    return ctx.window.DsPostQuellen;
}

test('die beiden Staende bleiben getrennt', async () => {
    const Q = mcFenster();
    const eigen = await Q.lade('uebergabe');
    const modell = await Q.lade('uebergabe-standard');
    assert.match(eigen.zeilen, /Dragapult \| 18\.0 %/);
    assert.match(modell.zeilen, /Dragapult \| 18\.8 %/);
    assert.match(eigen.listeKopf, /my call/);
    assert.match(modell.listeKopf, /predicted/);
});

test('jede Scheibe traegt denselben Nenner in der Fusszeile', async () => {
    const Q = mcFenster();
    const erg = await Q.lade('uebergabe');
    ['feld', 'meindeck', 'begegnungen', 'matchups', 'empfehlungen'].forEach((id) => {
        const s = erg.proFilter(id);
        assert.equal(s.fuss, '3,200 players · 8 rounds · Day 2: 16 pts',
            `Scheibe ${id} traegt einen anderen Nenner`);
    });
});

test('die Zahlen sind die der Uebergabe — keine gerechnete, keine geratene', async () => {
    const Q = mcFenster();
    const erg = await Q.lade('uebergabe');
    const meins = erg.proFilter('meindeck', 'Mega Excadrill');
    assert.equal(meins.zahl, '17.8 %');
    assert.equal(meins.zahlLabel, 'Day 2 chance');
    assert.match(meins.zahlNenner, /Mega Excadrill · 8 rounds · 16 pts · 44\.5 % win rate/);
    assert.match(meins.zeilen, /Ø wins \| 3\.60/);
    assert.match(meins.zeilen, /Ø ties \| 1\.10/);
    assert.match(meins.zeilen, /Ø losses \| 3\.40/);
    /* Die Tagesquote darf NICHT in derselben Liste stehen: die Balken
     * haengen an der Zahl, und 44,5 % neben 3,60 Partien behauptete
     * einen Vergleich, den es nicht gibt. */
    assert.ok(meins.zeilen.indexOf('44.5') < 0,
        'die Quote steht wieder in der Partienliste');
});

test('das gewaehlte Deck entscheidet ueber Ergebnis und Paarungen', async () => {
    const Q = mcFenster();
    const erg = await Q.lade('uebergabe');
    const meins = erg.proFilter('meindeck', 'Crustle');
    assert.equal(meins.zahl, '22.5 %');
    assert.equal(meins.titel, 'Crustle');
    const mu = erg.proFilter('matchups', 'Crustle');
    assert.match(mu.zeilen, /Dragapult \| 44 %/);
    assert.match(mu.zeilen, /Mega Excadrill \| 34 %/);
});

test('der Spiegel steht nicht in der Paarungsliste', async () => {
    const Q = mcFenster();
    const erg = await Q.lade('uebergabe');
    const mu = erg.proFilter('matchups', 'Mega Excadrill');
    assert.ok(mu.zeilen.indexOf('Mega Excadrill') < 0,
        'das eigene Deck steht mit 50 % in seiner eigenen Paarungsliste');
    assert.match(mu.zeilen, /Dragapult \| 58 %/);
    assert.equal(mu.ohneRang, true,
        'die Liste ist nach Feldanteil sortiert — eine Rangziffer behauptete eine Reihenfolge nach Quote');
});

test('eine Scheibe ohne Daten wird nicht angeboten', async () => {
    const ctx = fenster('ohne-uebergabe');
    const ohneDeck = JSON.parse(JSON.stringify(MC));
    ohneDeck.meinDeck = '';
    ohneDeck.staende.eigen.decks = {};
    ohneDeck.staende.standard.decks = {};
    ctx.window.DsPostUebergabe.legen('metacall', MC.titel, ohneDeck);
    const erg = await ctx.window.DsPostQuellen.lade('uebergabe');
    const ids = erg.filter.map((f) => f.id);
    assert.deepEqual(ids, ['feld', 'begegnungen', 'empfehlungen'],
        'eine Scheibe ohne Deck wird angeboten und bricht beim Klick');
    assert.deepEqual(erg.karussell, ids, 'das Karussell zeigt auf Scheiben, die es nicht gibt');
});

test('das Karussell bleibt an jeder Scheibe haengen', async () => {
    /* Die Seite arbeitet nach dem ersten Filterwechsel auf dem NEUEN
     * Ergebnis. Ohne die Reihe daran waere der Knopf nach einem Klick
     * verschwunden (gemessen 25.09.2026). */
    const Q = mcFenster();
    const erg = await Q.lade('uebergabe');
    assert.deepEqual(erg.karussell,
        ['feld', 'meindeck', 'begegnungen', 'matchups', 'empfehlungen']);
    assert.deepEqual(erg.proFilter('matchups').karussell, erg.karussell);
    assert.deepEqual(erg.proFilter('matchups').filter, erg.filter);
});

test('die Deckliste der Quelle ist die der Uebergabe', async () => {
    const Q = mcFenster();
    const erg = await Q.lade('uebergabe');
    assert.deepEqual(erg.decks, ['Mega Excadrill', 'Crustle']);
    assert.equal(erg.gewaehltesDeck, 'Mega Excadrill',
        'die Vorgabe ist nicht das Deck, das im Meta Call gewaehlt war');
});

/* ── 4 · Die Kachel des Deck-Posts ────────────────────────────────── */
/*
 * Der Deck-Post (js/ds-share.js, shareDeckPost) malt mit DERSELBEN
 * Kachel wie der Staples-Post. Unterschiedlich ist nur, was in der
 * Muenze und in der Zeile darunter steht: Stueckzahl und Druck statt
 * Rang und Anteil.
 *
 * Geprueft wird das AUSGEFUEHRT, an einem Zeichenkontext, der mitschreibt
 * — nicht am Quelltext. Und in beide Richtungen: ohne die neuen Felder
 * muss die Kachel Zeichen fuer Zeichen dieselbe bleiben, sonst waere der
 * seit dem 22.09.2026 laufende Staples-Post mit umgebaut worden.
 */
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

function kachelTexte(karte) {
    const quelle = fs.readFileSync(D('js/ds-share.js'), 'utf8');
    const texte = [];
    const ctx2d = {
        save() {}, restore() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
        clip() {}, fillRect() {}, drawImage() {},
        createLinearGradient: () => ({ addColorStop() {} }),
        measureText: (t) => ({ width: String(t).length * 6 }),
        fillText: (t) => texte.push(String(t)),
        set fillStyle(v) {}, get fillStyle() { return ''; },
        set strokeStyle(v) {}, get strokeStyle() { return ''; },
        set font(v) {}, get font() { return ''; },
        set lineWidth(v) {}, get lineWidth() { return 0; },
        set textAlign(v) {}, get textAlign() { return ''; },
        set textBaseline(v) {}, get textBaseline() { return ''; }
    };
    const ktx = {
        assert,
        MC_FARBEN: { creme: '#fff', holz: '#e3b276', matt: '#a38fa8' },
        fSans: () => '12px sans', fMono: () => '12px mono',
        rr: () => {}, clip: (c, t) => String(t),
        num: (v, d) => Number(v).toFixed(d).replace('.', ',')
    };
    vm.createContext(ktx);
    vm.runInContext(schneideFunktion(quelle, 'malStapleKachel'), ktx);
    vm.runInContext('malStapleKachel', ktx)(ctx2d, karte, 0, 0, 140, 195);
    return texte;
}

test('die Deckkachel traegt Stueckzahl und Druck', () => {
    const t = kachelTexte({ name: 'Metang', marke: 4, wert: 'TEF 114', bild: {} });
    assert.ok(t.indexOf('Metang') >= 0, 'der Kartenname fehlt');
    assert.ok(t.indexOf('TEF 114') >= 0, 'der Druck fehlt');
    assert.ok(t.indexOf('4') >= 0, 'die Stueckzahl steht nicht in der Muenze');
    assert.ok(!t.some((x) => /%/.test(x)), 'auf der Deckkachel steht ein Prozentwert');
});

test('ohne die neuen Felder bleibt die Staples-Kachel, wie sie war', () => {
    const t = kachelTexte({ name: 'Night Stretcher', rang: 3, share: 68.4, bild: {} });
    assert.ok(t.indexOf('Night Stretcher') >= 0);
    assert.ok(t.indexOf('68,4 %') >= 0, 'der Anteil fehlt — der Staples-Post waere mit umgebaut');
    assert.ok(t.indexOf('3') >= 0, 'der Rang fehlt');
});

test('eine Stueckzahl 0 wird gezeigt, nicht verschluckt', () => {
    /* `marke: 0` ist eine Zahl, kein fehlender Wert — ein
     * Kurzschluss-ODER haette hier den Rang gezeigt. */
    const t = kachelTexte({ name: 'Switch', marke: 0, wert: 'SVI 194', rang: 7, bild: {} });
    assert.ok(t.indexOf('0') >= 0 && t.indexOf('7') < 0,
        'statt der 0 steht der Rang in der Muenze');
});

/* ══ DER BESTAND (26.09.2026) ═══════════════════════════════════════
 *
 * Neben dem EINEN uebergebenen Stueck liegt seit dem 26.09.2026 je Art
 * eine Liste — die Kaskade der Post-Seite laesst daraus waehlen. Diese
 * Zusicherungen halten die beiden Riegel fest, die dabei zaehlen: der
 * Deckel und die Fassungspruefung. Beide waren beim Bau der Kaskade
 * unbelegt (Verfaelschungsprobe: „Bestand wird nicht gekuerzt" und
 * „Bestand ohne Fassungspruefung" blieben gruen).
 */
function speicherFenster() {
    const inhalt = {};
    const ctx = { console };
    ctx.window = ctx;
    ctx.localStorage = {
        getItem: (k) => (k in inhalt ? inhalt[k] : null),
        setItem: (k, v) => { inhalt[k] = String(v); },
        removeItem: (k) => { delete inhalt[k]; }
    };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(D('js/ds-post-uebergabe.js'), 'utf8'), ctx,
                    { filename: 'ds-post-uebergabe.js' });
    return { U: ctx.window.DsPostUebergabe, inhalt: inhalt };
}

test('der Bestand traegt alle Stuecke einer Art', () => {
    const { U } = speicherFenster();
    const erg = U.bestandLegen('deck', [
        { titel: 'A', daten: { karten: { 'X (SVI 1)': 1 } } },
        { titel: 'B', daten: { karten: { 'Y (SVI 2)': 2 } } }
    ]);
    assert.ok(erg.ok, `der Bestand liess sich nicht legen: ${erg.grund}`);
    assert.equal(erg.gekuerzt, 0, 'ein Bestand aus zwei Decks wurde gekuerzt');
    const b = U.bestand();
    assert.deepEqual(b.deck.liste.map((e) => e.titel), ['A', 'B']);
    /* Die drei Arten liegen unter EIGENEN Schluesseln: ein Meta Call ist
     * hundertmal so gross wie ein Deck, und sprengt er den Platz, sollen
     * die Decks trotzdem dastehen. */
    assert.equal(b.turnier.liste.length, 0, 'die Arten teilen sich einen Schluessel');
});

test('was nicht mehr passt, wird gekuerzt und gezaehlt', () => {
    const { U } = speicherFenster();
    /* Ein Eintrag von rund 120 KB — sechs passen in die 700 KB, mehr
     * nicht. Gekuerzt wird VON HINTEN: der Aufrufer uebergibt das
     * angeklickte Stueck als erstes. */
    const gross = (n) => {
        const karten = {};
        for (let i = 0; i < 2600; i++) karten[`Karte ${n}-${i} (SVI ${i})`] = 1;
        return { titel: 'D' + n, daten: { karten } };
    };
    const rein = [];
    for (let n = 0; n < 12; n++) rein.push(gross(n));
    const erg = U.bestandLegen('deck', rein);
    assert.ok(erg.ok, `der Bestand liess sich nicht legen: ${erg.grund}`);
    assert.ok(erg.gekuerzt > 0,
        'zwoelf Eintraege von je 120 KB passen angeblich in 700 KB — dann ist ' +
        'der Deckel wirkungslos und der lokale Speicher laeuft voll');
    assert.equal(erg.anzahl + erg.gekuerzt, 12,
        `${erg.anzahl} behalten + ${erg.gekuerzt} gekuerzt sind nicht 12`);
    assert.ok(erg.groesse <= U.BESTAND_HOECHSTENS,
        `${erg.groesse} Zeichen liegen ueber dem Deckel ${U.BESTAND_HOECHSTENS}`);
    const b = U.bestand();
    assert.equal(b.deck.liste.length, erg.anzahl);
    assert.equal(b.deck.gekuerzt, erg.gekuerzt,
        'die Zahl der weggelassenen Eintraege kommt nicht beim Leser an — ' +
        'die Auswahl behauptet dann, vollstaendig zu sein');
    assert.equal(b.deck.liste[0].titel, 'D0', 'gekuerzt wurde von vorne');
});

test('ein Bestand aus einer fremden Fassung wird nicht gedeutet', () => {
    /* Dieselbe Strenge wie bei `holen`. Ein halb verstandener Bestand
     * ergibt eine Auswahlliste mit Loechern, und die faellt erst beim
     * Klick auf. */
    const { U, inhalt } = speicherFenster();
    inhalt[U.BESTAND + 'deck'] = JSON.stringify({
        v: U.FASSUNG + 1, stand: '', gekuerzt: 0,
        liste: [{ titel: 'Aus der Zukunft', daten: { karten: { 'X (SVI 1)': 1 } } }]
    });
    assert.equal(U.bestand().deck.liste.length, 0,
        'ein Bestand mit fremder Fassungsnummer wird trotzdem gelesen');
    /* Und Unsinn im Speicher auch nicht. */
    inhalt[U.BESTAND + 'turnier'] = '{kein json';
    assert.equal(U.bestand().turnier.liste.length, 0);
});

test('die Auswahl sagt, wenn Stuecke weggelassen wurden', () => {
    /* Sonst sucht der Betreiber drueben ein Deck, das es „nicht gibt". */
    const quelle = fs.readFileSync(D('js/ds-post-quellen.js'), 'utf8');
    assert.match(quelle, /function mitGekuerzt/,
        'die Quellen nennen die weggelassenen Stuecke nicht');
    ['meineDecks', 'journalTurniere', 'metaEigene'].forEach((f) => {
        const i = quelle.indexOf('function ' + f);
        assert.ok(i > 0, `${f} gibt es nicht mehr`);
        const block = quelle.slice(i, i + 700);
        assert.match(block, /mitGekuerzt/,
            `${f} verschweigt, dass der Bestand gekuerzt wurde`);
    });
});
