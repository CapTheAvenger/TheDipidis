/**
 * BELEGT, UNBELEGT, KEINE DATEN — DIE EINORDNUNG STEHT AN DER EMPFEHLUNG
 *
 * ENTSCHEIDUNG DES BETREIBERS (07.09.2026), woertlich:
 *
 *     "Empfehlungen auf das begrenzen, was belegt ist, Rest offen als
 *      'keine Daten' anschreiben."
 *
 * GEMESSENE LAGE, die dahinter steht: es gibt KEINE eigene
 * Cut-Rechnung. Die Kartenwirkungen kommen aus
 * data/card_capability_interactions.json — Version 0.1 vom 15.05.2026,
 * fuenf Paarungen. Alles darueber hinaus ist Kartentext-Heuristik
 * (data/active_threats.json bzw. die Mustererkennung der
 * CardCapabilityEngine). Bis heute sah in der Oberflaeche beides gleich
 * aus.
 *
 * Es wird nichts geloescht und nichts erfunden. Jede Empfehlung bleibt
 * stehen und bekommt ihre Einordnung sichtbar daneben:
 *
 *   belegt      — Paarung aus card_capability_interactions.json, mit
 *                 Quelle, Version, Datum der Datenbasis und der Zahl
 *                 der Partien, auf denen das Matchup beruht.
 *   unbelegt    — "aus dem Kartentext abgeleitet, nicht an Partien
 *                 gemessen".
 *   keine Daten — Gegner/Zieldeck, zu dem keine der Quellen etwas
 *                 hergibt. Steht als Zeile da, nicht als stille
 *                 Leerstelle.
 *
 * KEINE DATEI AUS data/ WIRD HIER GELESEN. Alle Eingaben sind
 * synthetisch: der Wortlaut der Kennzeichnung und die Zuordnung
 * Quelle -> Grad sind Entscheidungen dieses Projekts und aendern sich
 * nicht mit dem naechsten Scraperlauf. Wuerde hier das echte
 * Datum 15.05.2026 festgenagelt, waere die Zusicherung beim naechsten
 * Bau der Regelbasis falsch — und zwar zu Recht, denn dann soll die
 * Oberflaeche das NEUE Datum zeigen.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { describe, it } = require('node:test');
const { ZAHL_KOMMA_SRC, zahlKommaEinsetzen } = require('./lib-zahlkomma-sandkasten.js');
/* zahlKomma() aus js/app-utils.js — im Browser laedt index.html sie vor
   jedem Aufrufer, der Sandkasten muss sie deshalb ebenfalls kennen. */
const zahlKomma = new Function(ZAHL_KOMMA_SRC + '\nreturn zahlKomma;')();

const WURZEL = path.join(__dirname, '..', '..');
const lies = (...p) => fs.readFileSync(path.join(WURZEL, ...p), 'utf8');
const ANTI  = lies('js', 'app-anti-tech.js');
const BAUER = lies('js', 'app-deck-builder.js');

/* Zieht eine benannte Funktion samt Namen aus dem Quelltext, an der
   Klammer gezaehlt. */
function funktion(quelle, kopf) {
    const a = quelle.indexOf(kopf);
    assert.ok(a >= 0, `nicht gefunden: ${kopf}`);
    let tiefe = 0;
    for (let j = quelle.indexOf('{', a); j < quelle.length; j++) {
        if (quelle[j] === '{') tiefe++;
        else if (quelle[j] === '}') { tiefe--; if (tiefe === 0) return quelle.slice(a, j + 1); }
    }
    throw new Error(`unbalancierte Klammern in ${kopf}`);
}

// ─────────────────────────────────────────────────────────────────────
// 1. Der sichtbare Satz im Build-vs-Assistenten (js/app-anti-tech.js)
// ─────────────────────────────────────────────────────────────────────

/* Baut die Beleg-Helfer aus app-anti-tech.js als aufrufbares Buendel.
   `t` fehlt absichtlich — dann greifen die deutschen Rueckfaelle, und
   genau die stehen heute in der Oberflaeche. */
function belegHelfer(stand, matchupZeilen, archetyp, quelle, welt0) {
    const code = [
        "const BELEG_QUELLE = 'data/card_capability_interactions.json';",
        `let _regelstand = ${JSON.stringify(stand)};`,
        `const _source = ${JSON.stringify(quelle || 'currentMeta')};`,
        funktion(ANTI, '    function _t(key, fallback) {'),
        funktion(ANTI, '    function _tf(key, fallback) {'),
        funktion(ANTI, '    function _stripEx(name) {'),
        funktion(ANTI, '    function _getCurrentArchetype() {'),
        funktion(ANTI, '    function _belegDatum(iso) {'),
        funktion(ANTI, '    function _partienByOpponentForUser() {'),
        funktion(ANTI, '    function _belegPartien(entry) {'),
        funktion(ANTI, '    function _belegSatz(entry) {'),
        'return { _belegSatz, _belegPartien, _belegDatum, _partienByOpponentForUser };'
    ].join('\n');
    const welt = welt0 || {
        currentMetaMatchupData: matchupZeilen,
        currentMetaArchetype: archetyp
    };
    return new Function('window', 'getLang', 't', code)(welt, () => 'de', undefined);
}

const STAND = { version: '0.1', datum: '2026-05-15', paarungen: 5 };
/* REIHENFOLGE IST ABSICHT (07.09.2026, nach einem ueberlebenden
   Mutanten): die Zeile des FREMDEN Decks steht ZUERST. Vorher stand
   Mega Excadrill oben, und dann ging die Zusicherung "Partien eines
   fremden Decks zaehlen nicht mit" auch dann durch, wenn man den
   Deckfilter aus `_partienByOpponentForUser` ersatzlos strich — die
   erste passende Zeile war zufaellig die richtige. Jetzt liefert ein
   fehlender Filter 280 statt 358 und die Zusicherung wird rot. */
const MATCHUPS = [
    { deck_name: 'Dragapult',      opponent: 'Toucannon',   win_rate: '68,73', total_games: '280' },
    { deck_name: 'Mega Excadrill', opponent: 'Toucannon',   win_rate: '38,03', total_games: '358' },
    { deck_name: 'Mega Excadrill', opponent: 'Slowking',    win_rate: '37,25', total_games: '821' }
];

describe('Build-vs: jede Zeile sagt, worauf sie beruht', () => {

    it('belegt nennt Quelle, Version, Datum der Datenbasis und die Partien', () => {
        const h = belegHelfer(STAND, MATCHUPS, 'Mega Excadrill');
        const satz = h._belegSatz({
            name: 'Crustle', beleg: 'paarung', targets: new Set(['Toucannon'])
        });
        assert.ok(satz.startsWith('belegt'), `faengt mit der Einordnung an: ${satz}`);
        assert.ok(satz.includes('card_capability_interactions.json'),
            `nennt die Quelle: ${satz}`);
        assert.ok(satz.includes('v0.1'), `nennt die Version: ${satz}`);
        assert.ok(satz.includes('15.05.2026'),
            `nennt das Alter der Datenbasis in deutscher Schreibweise: ${satz}`);
        assert.ok(satz.includes('358 Partien'),
            `nennt die Zahl der Partien hinter dem Matchup: ${satz}`);
    });

    it('unbelegt sagt wortwoertlich, dass nichts gemessen wurde', () => {
        const h = belegHelfer(STAND, MATCHUPS, 'Mega Excadrill');
        const satz = h._belegSatz({
            name: 'Kieran', beleg: 'heuristik', targets: new Set(['Toucannon'])
        });
        assert.ok(satz.startsWith('unbelegt'), `faengt mit der Einordnung an: ${satz}`);
        assert.ok(satz.includes('aus dem Kartentext abgeleitet, nicht an Partien gemessen'),
            `der vom Betreiber verlangte Wortlaut steht da: ${satz}`);
        assert.ok(!satz.includes('card_capability_interactions.json'),
            'eine unbelegte Zeile darf sich nicht auf die Regelbasis berufen');
    });

    it('ein Eintrag ohne Kennzeichnung gilt als unbelegt, nicht als belegt', () => {
        // Die vorsichtige Richtung: wer keine Herkunft mitbringt, wird
        // nicht zum Beleg erklaert.
        const h = belegHelfer(STAND, MATCHUPS, 'Mega Excadrill');
        const satz = h._belegSatz({ name: 'X', targets: new Set(['Toucannon']) });
        assert.ok(satz.startsWith('unbelegt'), satz);
    });

    it('fehlt das Datum, steht "Datum unbekannt" statt eines erfundenen', () => {
        const h = belegHelfer({ version: null, datum: null, paarungen: 0 }, MATCHUPS, 'Mega Excadrill');
        const satz = h._belegSatz({ beleg: 'paarung', targets: new Set(['Toucannon']) });
        assert.ok(satz.includes('Datum unbekannt'), satz);
        assert.ok(!/\d{2}\.\d{2}\.\d{4}/.test(satz), `kein erfundenes Datum: ${satz}`);
    });

    it('die Partienzahl wird genommen, nicht addiert', () => {
        // Zwei Gegner sind zwei Stichproben. 358 + 821 waere eine Zahl,
        // die es nirgends gibt.
        const h = belegHelfer(STAND, MATCHUPS, 'Mega Excadrill');
        const n = h._belegPartien({ targets: new Set(['Toucannon', 'Slowking']) });
        assert.strictEqual(n, 821, 'die groesste Stichprobe, nicht die Summe');
    });

    it('Partien eines FREMDEN Decks zaehlen nicht mit', () => {
        const h = belegHelfer(STAND, MATCHUPS, 'Mega Excadrill');
        // Dragapult-vs-Toucannon steht mit 280 in der Datei; fuer den
        // Nutzer mit Mega Excadrill gilt aber 358.
        assert.strictEqual(h._belegPartien({ targets: new Set(['Toucannon']) }), 358);
    });

    /* BEFUND DER ABNAHME (07.09.2026): die Partienzahl wurde an
       `window.currentMetaArchetype` festgemacht, obwohl Build-vs auch
       aus City League und Past Meta erreichbar ist. Wer von dort kam,
       bekam die Stichprobe eines FREMDEN Decks an seine Empfehlung
       geschrieben. Genau die gemessene Lage steht hier als Fall. */
    it('aus der City League zaehlt das City-League-Deck, nicht currentMeta', () => {
        const welt = {
            currentMetaMatchupData: MATCHUPS,
            currentMetaArchetype: 'Dragapult',
            currentCityLeagueArchetype: 'Mega Excadrill'
        };
        const h = belegHelfer(STAND, null, null, 'cityLeague', welt);
        assert.strictEqual(h._belegPartien({ targets: new Set(['Toucannon']) }), 358,
            'die 280 gehoeren Dragapult und haben in einer City-League-Empfehlung '
            + 'nichts zu suchen');
    });

    it('aus Past Meta zaehlt das Past-Meta-Deck', () => {
        const welt = {
            currentMetaMatchupData: MATCHUPS,
            currentMetaArchetype: 'Mega Excadrill',
            pastMetaCurrentArchetype: 'Dragapult'
        };
        const h = belegHelfer(STAND, null, null, 'pastMeta', welt);
        assert.strictEqual(h._belegPartien({ targets: new Set(['Toucannon']) }), 280);
    });

    it('ist die Quelle unbekannt, wird keine Partienzahl behauptet', () => {
        const welt = { currentMetaMatchupData: MATCHUPS, currentMetaArchetype: 'Mega Excadrill' };
        const h = belegHelfer(STAND, null, null, 'unbekannt', welt);
        assert.strictEqual(h._belegPartien({ targets: new Set(['Toucannon']) }), 0,
            'lieber "nicht bekannt" als die Zahl irgendeines Decks');
    });

    it('ohne Partienzahl wird das gesagt und keine Null behauptet', () => {
        const h = belegHelfer(STAND, MATCHUPS, 'Mega Excadrill');
        const satz = h._belegSatz({ beleg: 'paarung', targets: new Set(['Unbekanntes Deck']) });
        assert.ok(satz.includes('nicht bekannt'), satz);
        assert.ok(!satz.includes('0 Partien'), `keine Null als Angabe: ${satz}`);
    });

});

describe('Build-vs: Herkunft wird beim Einsammeln festgehalten', () => {

    /* Der Verschmelzungsschritt aus _computeSuggestedCards, im Original
       ausgefuehrt: eine Karte, die in BEIDEN Quellen steht, ist belegt. */
    function verschmelze(vorhanden, ausRegelbasis) {
        const a = ANTI.indexOf('for (const cap of capabilitySuggestions) {');
        assert.ok(a >= 0, 'Verschmelzungsschleife nicht gefunden');
        let tiefe = 0, ende = -1;
        for (let j = ANTI.indexOf('{', a); j < ANTI.length; j++) {
            if (ANTI[j] === '{') tiefe++;
            else if (ANTI[j] === '}') { tiefe--; if (tiefe === 0) { ende = j; break; } }
        }
        const byCard = new Map(vorhanden.map(e => [e.name.toLowerCase(), e]));
        new Function('capabilitySuggestions', 'byCard', ANTI.slice(a, ende + 1))(
            ausRegelbasis, byCard);
        return byCard;
    }

    it('eine Karte aus beiden Quellen gilt als belegt', () => {
        const heuristik = {
            name: 'Iron Crown ex', beleg: 'heuristik', cardId: '',
            threatCategories: new Set(['hand_disruption']), targets: new Set(['Toucannon']),
            paarungen: new Set()
        };
        const regel = {
            name: 'Iron Crown ex', beleg: 'paarung', cardId: 'PBL|42',
            threatCategories: new Set(['card-text: ko prevention']),
            targets: new Set(['Slowking']),
            paarungen: new Set(['attack.ignores_effects→ability.ko_prevention'])
        };
        const raus = verschmelze([heuristik], [regel]).get('iron crown ex');
        assert.strictEqual(raus.beleg, 'paarung',
            'die belegte Herkunft gewinnt — sie ist da, unabhaengig davon, '
            + 'dass die Heuristik dieselbe Karte auch gefunden hat');
        assert.ok(raus.paarungen.has('attack.ignores_effects→ability.ko_prevention'),
            'die benannte Paarung bleibt nachschlagbar');
        assert.ok(raus.targets.has('Toucannon') && raus.targets.has('Slowking'),
            'keine Zielangabe geht verloren');
        assert.strictEqual(raus.cardId, 'PBL|42', 'fehlende Angaben werden ergaenzt');
    });

    it('eine Karte nur aus der Regelbasis behaelt ihre Kennzeichnung', () => {
        const regel = {
            name: 'Crustle', beleg: 'paarung', cardId: 'PBL|9',
            threatCategories: new Set(), targets: new Set(['Toucannon']),
            paarungen: new Set(['a→b'])
        };
        assert.strictEqual(verschmelze([], [regel]).get('crustle').beleg, 'paarung');
    });

});

describe('Build-vs: der Stand der Regelbasis wird gelesen, nicht geraten', () => {

    function ladeStandHelfer(antwort) {
        const code = [
            "const BELEG_QUELLE = 'data/card_capability_interactions.json';",
            'let _regelstand = null;',
            funktion(ANTI, '    function _ensureRegelstand() {'),
            'return _ensureRegelstand;'
        ].join('\n');
        const gerufen = [];
        const fetchStub = (pfad) => {
            gerufen.push(pfad);
            return Promise.resolve({ ok: antwort !== null, json: () => Promise.resolve(antwort) });
        };
        return { f: new Function('fetch', code)(fetchStub), gerufen };
    }

    it('uebernimmt Version, Datum und Zahl der Paarungen aus der Datei', async () => {
        const { f, gerufen } = ladeStandHelfer({
            version: '0.1', generated_at: '2026-05-15',
            interactions: [1, 2, 3, 4, 5]
        });
        const st = await f();
        assert.deepStrictEqual(st, { version: '0.1', datum: '2026-05-15', paarungen: 5 });
        assert.deepStrictEqual(gerufen, ['data/card_capability_interactions.json'],
            'genau diese Datei ist die Quelle, die die Oberflaeche nennt');
    });

    it('erfindet nichts, wenn die Datei nicht gelesen werden kann', async () => {
        const { f } = ladeStandHelfer(null);
        assert.deepStrictEqual(await f(), { version: null, datum: null, paarungen: 0 });
    });

});

// ─────────────────────────────────────────────────────────────────────
// 2. Die Liste selbst: Kopf, Zeilen, "keine Daten"
// ─────────────────────────────────────────────────────────────────────

describe('Build-vs: Kopf und "keine Daten" stehen in der Liste', () => {

    function male(vorschlaege, ziele) {
        const geschrieben = {};
        const element = (id) => ({
            id,
            set innerHTML(v) { geschrieben[id] = v; },
            get innerHTML() { return geschrieben[id] || ''; },
            set textContent(v) { geschrieben[id] = v; },
            querySelectorAll: () => []
        });
        const knoten = {
            antiTechCardList: element('antiTechCardList'),
            antiTechStep2Targets: element('antiTechStep2Targets')
        };
        const code = [
            "const BELEG_QUELLE = 'data/card_capability_interactions.json';",
            `let _regelstand = ${JSON.stringify(STAND)};`,
            'const _suggestedCards = suggestedCards;',
            /* Modulzustand seit 12.09.2026: Bedrohungskategorien ohne
               bekannten Konter. Hier leer — diese Suite prueft die
               "keine Daten"-Zeile. */
            'const _ohneAntwort = new Map();',
            "const _source = 'currentMeta';",
            funktion(ANTI, '    function _t(key, fallback) {'),
            funktion(ANTI, '    function _tf(key, fallback) {'),
            funktion(ANTI, '    function _stripEx(name) {'),
            funktion(ANTI, '    function _getCurrentArchetype() {'),
            funktion(ANTI, '    function _esc(s) {'),
            funktion(ANTI, '    function _belegDatum(iso) {'),
            funktion(ANTI, '    function _partienByOpponentForUser() {'),
            funktion(ANTI, '    function _belegPartien(entry) {'),
            funktion(ANTI, '    function _belegSatz(entry) {'),
            funktion(ANTI, '    function _cardImageUrl(cardId) {'),
            funktion(ANTI, '    function _renderTechSuggestions() {'),
            'return _renderTechSuggestions();'
        ].join('\n');
        const welt = { currentMetaMatchupData: MATCHUPS, currentMetaArchetype: 'Mega Excadrill' };
        new Function('suggestedCards', '_targets', '_targetDisplay', '_selectedCards',
            'document', 'window', 'getLang', 't', code)(
            vorschlaege,
            new Set(ziele.map(z => z.toLowerCase())),
            new Map(ziele.map(z => [z.toLowerCase(), z])),
            new Set(),
            { getElementById: (id) => knoten[id] || null },
            welt, () => 'de', undefined);
        return geschrieben.antiTechCardList || '';
    }

    const EINE = [{
        name: 'Kieran', beleg: 'heuristik', cardId: '',
        threatCategories: new Set(['hand_disruption']),
        targets: new Set(['Toucannon'])
    }];

    it('ueber der Liste stehen Quelle, Version und Alter der Datenbasis', () => {
        const html = male(EINE, ['Toucannon']);
        assert.ok(html.includes('card_capability_interactions.json'), html.slice(0, 300));
        assert.ok(html.includes('v0.1'), 'Version steht da');
        assert.ok(html.includes('15.05.2026'), 'das Alter der Datenbasis steht da');
        assert.ok(html.includes('5 Paarungen'), 'die Abdeckung steht daneben');
    });

    it('jede Zeile traegt ihre Einordnung sichtbar, nicht im Tooltip', () => {
        const html = male(EINE, ['Toucannon']);
        assert.ok(html.includes('anti-tech-card-beleg'), 'eigenes Element je Zeile');
        assert.ok(html.includes('aus dem Kartentext abgeleitet, nicht an Partien gemessen'),
            'der Wortlaut steht im Text der Zeile');
        const vorTitle = html.split('title=')[0];
        assert.ok(vorTitle.includes('nicht an Partien gemessen'),
            'die Einordnung darf nicht in einem title-Attribut verschwinden');
    });

    it('ein Ziel ohne jede Datengrundlage wird beim Namen genannt', () => {
        const html = male(EINE, ['Toucannon', 'Slowking', 'Dragapult']);
        assert.ok(html.includes('keine Daten'), 'die zwei Woerter stehen da');
        assert.ok(html.includes('Slowking') && html.includes('Dragapult'),
            'und zwar mit den Namen der Ziele, zu denen nichts vorliegt');
    });

    it('ist zu jedem Ziel etwas da, steht keine Luecke herum', () => {
        const html = male(EINE, ['Toucannon']);
        assert.ok(!html.includes('keine Daten'),
            'ein Hinweis ohne Anlass ist genauso schlecht wie eine stille Leerstelle');
    });

    /* MASKIERUNG — nachgezogen am 07.09.2026, weil `_esc` ohne
       HTML-Maskierung einen Mutationslauf ueberlebte. In Kopf- und
       "keine Daten"-Zeile stehen ARCHETYPNAMEN AUS DATEN
       (data/limitless_online_decks.csv, ueber die Meta-Call-Auswahl).
       Ein Name mit spitzen Klammern wuerde dort sonst als Markup in
       die Seite geschrieben. */
    it('ein Zielname mit HTML wird in der "keine Daten"-Zeile maskiert', () => {
        const html = male(EINE, ['Toucannon', '<img src=x onerror=alert(1)>']);
        assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'),
            `der Name steht maskiert da: ${html.slice(-500)}`);
        assert.ok(!html.includes('<img src=x'),
            'ein Archetypname darf niemals als Markup in die Seite geraten');
    });

    it('auch der Kopf ueber der Liste wird maskiert', () => {
        /* Der Kopf setzt den Dateinamen und das Datum zusammen — beides
           kommt aus der gelesenen Regelbasis. Geprueft wird an einer
           Version mit spitzen Klammern, weil die Version aus der Datei
           kommt und niemand ihr etwas versprochen hat. */
        const gemerkt = STAND.version;
        try {
            STAND.version = '<b>0.1</b>';
            const html = male(EINE, ['Toucannon']);
            assert.ok(html.includes('&lt;b&gt;0.1&lt;/b&gt;'), html.slice(0, 400));
            assert.ok(!html.includes('<b>0.1</b>'),
                'ein Wert aus der Datei darf nicht als Markup landen');
        } finally {
            STAND.version = gemerkt;
        }
    });

    it('auch bei GAR keinem Vorschlag steht der Stand und die Luecke da', () => {
        const html = male([], ['Toucannon', 'Slowking']);
        assert.ok(html.includes('15.05.2026'), 'der Stand steht auch ueber einer leeren Liste');
        assert.ok(html.includes('keine Daten'), 'und die Ziele werden benannt');
        assert.ok(html.includes('Toucannon') && html.includes('Slowking'));
    });

});

// ─────────────────────────────────────────────────────────────────────
// 3. Der Ideen-Block im Warum-Dialog (js/app-deck-builder.js)
// ─────────────────────────────────────────────────────────────────────

describe('Warum-Dialog: die Ideen-Zeile nennt ihre Regelbasis', () => {

    function ideenBuendel() {
        const code = [
            funktion(BAUER, '        function _ideenDatum(iso) {'),
            funktion(BAUER, '        function _ideenText(key, de) {'),
            funktion(BAUER, '        function _ideenBelegSatz(v, stand) {'),
            funktion(BAUER, '        function _ideenBelegKlasse(v) {'),
            'return { _ideenBelegSatz, _ideenBelegKlasse };'
        ].join('\n');
        return new Function('getLang', 't', code)(() => 'de', undefined);
    }

    function ideenHelfer() {
        return ideenBuendel()._ideenBelegSatz;
    }

    it('nennt Quelle, Version, Datum und die Partien des Matchups', () => {
        const satz = ideenHelfer()(
            { karte: 'Crustle', beleg: 'paarung',
              quelleDatei: 'data/card_capability_interactions.json', partien: 358 },
            { version: '0.1', datum: '2026-05-15', interaktionen: 5 });
        assert.ok(satz.startsWith('belegt'), satz);
        assert.ok(satz.includes('card_capability_interactions.json'), satz);
        assert.ok(satz.includes('v0.1'), satz);
        assert.ok(satz.includes('15.05.2026'), satz);
        assert.ok(satz.includes('358 Partien'), satz);
    });

    it('sagt es, wenn die Partienzahl fehlt, statt eine Null zu behaupten', () => {
        const satz = ideenHelfer()({ karte: 'Crustle', beleg: 'paarung' },
            { version: '0.1', datum: '2026-05-15' });
        assert.ok(satz.includes('nicht bekannt'), satz);
        assert.ok(!satz.includes('0 Partien'), satz);
    });

    it('ohne bekanntes Datum steht ein Fragezeichen, kein erfundenes Datum', () => {
        const satz = ideenHelfer()({ karte: 'Crustle', beleg: 'paarung', partien: 12 }, {});
        assert.ok(!/\d{2}\.\d{2}\.\d{4}/.test(satz), `kein erfundenes Datum: ${satz}`);
    });

    /* BEFUND DER ABNAHME (07.09.2026): die Funktion las `v.beleg`
       nirgends. Eine heuristische Zeile MIT Partienzahl kam als
       "belegt" heraus — die schlimmste Verwechslung von allen, weil
       eine echte Zahl daneben stand und den Satz beglaubigte. */
    it('eine heuristische Zeile wird NICHT zum Beleg, auch nicht mit Partienzahl', () => {
        const satz = ideenHelfer()({ karte: 'X', beleg: 'heuristik', partien: 358 },
            { version: '0.1', datum: '2026-05-15' });
        assert.ok(satz.startsWith('unbelegt'), satz);
        assert.ok(satz.includes('aus dem Kartentext abgeleitet, nicht an Partien gemessen'), satz);
        assert.ok(!satz.includes('358'),
            'die Partienzahl gehoert zum Matchup und beglaubigt keine Vermutung');
        assert.ok(!satz.includes('card_capability_interactions.json'),
            'eine unbelegte Zeile beruft sich nicht auf die Regelbasis');
    });

    it('ganz ohne Herkunftsangabe gilt die Zeile als unbelegt', () => {
        const satz = ideenHelfer()({ karte: 'X', partien: 358 },
            { version: '0.1', datum: '2026-05-15' });
        assert.ok(satz.startsWith('unbelegt'), satz);
    });

    it('eine vom Nutzer eingetragene Zeile sagt genau das', () => {
        const satz = ideenHelfer()({ karte: 'X', beleg: 'nutzer' },
            { version: '0.1', datum: '2026-05-15' });
        assert.ok(satz.startsWith('vom Nutzer eingetragen'), satz);
        assert.ok(satz.includes('nicht an Partien gemessen'), satz);
    });

    it('die CSS-Klasse wird gerechnet, nicht behauptet', () => {
        const k = ideenBuendel()._ideenBelegKlasse;
        assert.strictEqual(k({ beleg: 'paarung' }),   'build-info-beleg-ja');
        assert.strictEqual(k({ beleg: 'heuristik' }), 'build-info-beleg-nein');
        assert.strictEqual(k({ beleg: 'nutzer' }),    'build-info-beleg-nutzer');
        assert.strictEqual(k({}),                     'build-info-beleg-nein');
    });

    /* Die Zeile im Ideen-Block traegt die gerechnete Klasse — vorher
       stand dort fest 'build-info-beleg-ja' im Quelltext. */
    it('der Ideen-Block verdrahtet die Klasse nicht mehr fest', () => {
        assert.ok(!/build-info-beleg build-info-beleg-ja'/.test(BAUER),
            'eine fest verdrahtete "-ja"-Klasse faerbt auch Unbelegtes gruen');
        assert.ok(BAUER.includes("+ _ideenBelegKlasse(gr.karten[0])"),
            'die Klasse kommt aus der Rechnung');
    });

});

describe('Warum-Dialog: die Luecke wird geschrieben, nicht verschwiegen', () => {

    /* `_maleLuecke` ist eine Ortsfunktion in `_maleTechIdeen`. Sie wird
       ueber ihren Wortlaut gegriffen und mit allem versorgt, was sie
       von aussen anfasst — so laeuft die ECHTE Fassung, nicht eine
       nachgebaute. */
    function maleLuecke(ohne, stand) {
        const kopf = 'const _maleLuecke = () => {';
        const a = BAUER.indexOf(kopf);
        assert.ok(a >= 0, '_maleLuecke nicht gefunden');
        let tiefe = 0, ende = -1;
        for (let j = BAUER.indexOf('{', a); j < BAUER.length; j++) {
            if (BAUER[j] === '{') tiefe++;
            else if (BAUER[j] === '}') { tiefe--; if (tiefe === 0) { ende = j; break; } }
        }
        const code = [
            funktion(BAUER, '        function _ideenDatum(iso) {'),
            funktion(BAUER, '        function _ideenText(key, de) {'),
            BAUER.slice(a, ende + 1) + ';',
            '_maleLuecke();'
        ].join('\n');
        const geschrieben = [];
        const dok = {
            createElement: () => ({ className: '', textContent: '' })
        };
        const wrap = { appendChild: (el) => geschrieben.push(el) };
        // i18n-Wortlaute wie in js/i18n.js (deutsch), damit der Test
        // den ausgelieferten Satz sieht und nicht einen Platzhalter.
        const woerter = {
            'buildInfo.techIdeenOhne': 'Nichts gefunden gegen: {liste}. Die Regelbasis kennt {n} Paarungen vom {datum} — diese Matchups sind nicht abgedeckt.',
            'buildInfo.techIdeenOhneEintrag': '{name} ({wr}, {n} Partien)'
        };
        new Function('_ohne', 'stand', 'wrap', 'document', 't', 'getLang', 'zahlKomma', code)(
            ohne, stand, wrap, dok, (k) => woerter[k] || k, () => 'de', zahlKomma);
        return geschrieben.map(e => e.textContent);
    }

    const OHNE = [
        { name: 'Alakazam Dudunsparce', quote: 24.97, partien: 743, beleg: 'keine' },
        { name: 'Slowking', quote: 37.25, partien: 821, beleg: 'keine' }
    ];

    it('nennt die Luecke mit den zwei Woertern des Betreibers', () => {
        const zeilen = maleLuecke(OHNE, { version: '0.1', datum: '2026-05-15', interaktionen: 5 });
        assert.strictEqual(zeilen.length, 1);
        assert.ok(zeilen[0].startsWith('keine Daten'), zeilen[0]);
        assert.ok(zeilen[0].includes('Alakazam Dudunsparce'), zeilen[0]);
        assert.ok(zeilen[0].includes('15.05.2026'),
            'das Alter der Datenbasis steht auch an der Luecke');
    });

    it('behauptet nichts, wenn die Regelbasis nicht gelesen werden konnte', () => {
        /* Die Schranke stammt vom 06.09.2026 und bleibt: der Satz nennt
           Zahl und Datum der Paarungen. Ohne gelesene Regelbasis waeren
           beide erfunden — und eine erfundene Angabe ist schlimmer als
           keine. Mitgeprueft, damit die Kennzeichnung von heute die
           Entscheidung von gestern nicht heimlich aushebelt. */
        assert.deepStrictEqual(
            maleLuecke(OHNE, { version: null, datum: null, interaktionen: 0 }), []);
    });

    it('ohne Luecke wird nichts geschrieben', () => {
        assert.deepStrictEqual(
            maleLuecke([], { version: '0.1', datum: '2026-05-15', interaktionen: 5 }), []);
    });

});

// ─────────────────────────────────────────────────────────────────────
// 4. js/tech-ideen.js — der ganze Baustein, mit erfundenen Eingaben
// ─────────────────────────────────────────────────────────────────────

describe('Tech-Ideen: Herkunft und Luecke kommen aus dem Baustein selbst', () => {

    const KARTEN_CSV = [
        'card_name;set_code;set_number;archetype',
        'Pikachu ex;PBL;25;Toucannon',
        'Toucannon;PBL;18;Toucannon',
        'Crustle;PBL;9;Crustle',
        'Excadrill;PBL;12;Mega Excadrill'
    ].join('\n');

    const MATCHUP_CSV = [
        'deck_name;opponent;win_rate;record;total_games',
        // schlecht UND genug Partien: taucht als Gegner auf
        'Mega Excadrill;Toucannon;38,03;120 - 200 - 3;358',
        // schlecht, genug Partien, aber die Regelbasis kennt nichts dazu
        'Mega Excadrill;Crustle;25,60;90 - 260 - 0;743',
        // gut genug -> faellt gar nicht erst auf
        'Mega Excadrill;Excadrill;55,00;60 - 49 - 0;109'
    ].join('\n');

    const REGELN = {
        version: '0.1',
        generated_at: '2026-05-15',
        interactions: [{
            attacker: 'attack.ignores_effects',
            defender: 'ability.ko_prevention',
            result: 'attacker_wins',
            confidence: 'high',
            matchup_value: 8,
            narrative_de: 'Crustle ignoriert Pikachu exs KO-Schutz.'
        }]
    };

    function ladeBaustein() {
        const quelle = lies('js', 'tech-ideen.js');
        const effekte = {
            size: 4,
            bySetNumber: new Map([
                ['PBL|25', { name: 'Pikachu ex', card_type: 'Basic', energy_type: 'Lightning' }],
                ['PBL|9',  { name: 'Crustle', card_type: 'Evolves from Dwebble', energy_type: 'Grass' }]
            ]),
            byName: new Map()
        };
        const welt = {
            normalizeArchetypeForMatch: (n) => String(n).toLowerCase().trim(),
            CardCapabilityEngine: {
                load: () => Promise.resolve(null),
                // Pikachu ex traegt den Verteidiger-Tag; alles andere nicht.
                extractTags: (rec) => (rec && rec.name === 'Pikachu ex')
                    ? [{ tag: 'ability.ko_prevention', confidence: 'high' }] : [],
                detectMatchups: ({ archetypeCardMap }) => {
                    const raus = new Map();
                    for (const gegner of archetypeCardMap.keys()) {
                        raus.set(gegner, gegner === 'Toucannon' ? [{
                            result: 'attacker_wins',
                            attackerCard: 'Crustle', attackerKey: 'PBL|9',
                            attackerSource: { type: 'attack', name: 'Rock Wrecker' },
                            defenderCard: 'Pikachu ex',
                            defenderSource: { type: 'ability', name: 'Resolute Heart' },
                            confidence: 'high', matchupValue: 8,
                            interactionTag: 'attack.ignores_effects→ability.ko_prevention',
                            narrative: 'Crustle ignoriert Pikachu exs KO-Schutz.'
                        }] : []);
                    }
                    return Promise.resolve(raus);
                }
            },
            _loadCardEffectsIndex: () => Promise.resolve(effekte)
        };
        const fetchStub = (pfad) => {
            if (pfad.startsWith('data/current_meta_card_data.csv')) {
                return Promise.resolve({ ok: true, text: () => Promise.resolve(KARTEN_CSV) });
            }
            if (pfad.startsWith('data/limitless_online_decks_matchups.csv')) {
                return Promise.resolve({ ok: true, text: () => Promise.resolve(MATCHUP_CSV) });
            }
            if (pfad.startsWith('data/card_capability_interactions.json')) {
                return Promise.resolve({ ok: true, json: () => Promise.resolve(REGELN) });
            }
            return Promise.resolve({ ok: false, status: 404 });
        };
        const kontext = vm.createContext({
            window: welt, fetch: fetchStub, console,
            Promise, Map, Set, Array, Object, String, Number, parseFloat, isFinite, JSON
        });
        vm.runInContext(quelle, kontext);
        return kontext.window.TechIdeen;
    }

    it('jeder Vorschlag traegt Herkunft, Quelldatei und die Partien des Matchups', async () => {
        const erg = await ladeBaustein().ideen({ archetyp: 'Mega Excadrill', lang: 'de' });
        assert.strictEqual(erg.gegner.length, 1, 'genau ein Gegner mit Ansatzpunkt');
        const v = erg.gegner[0].vorschlaege[0];
        assert.strictEqual(v.karte, 'Crustle');
        assert.strictEqual(v.beleg, 'paarung',
            'die Wirkung steht als Paarung in der Regelbasis');
        assert.strictEqual(v.quelleDatei, 'data/card_capability_interactions.json');
        assert.strictEqual(v.paarung, 'attack.ignores_effects→ability.ko_prevention',
            'die Paarung wird beim Namen genannt und bleibt nachschlagbar');
        assert.strictEqual(v.partien, 358,
            'die Stichprobe des Matchups reist mit — sonst kann die '
            + 'Oberflaeche sie nicht hinschreiben');
    });

    it('der Stand der Regelbasis kommt mit, auch ohne vorherigen datenstand()', async () => {
        // BEFUND 07.09.2026: `ideen()` gab einen leeren Stand heraus,
        // solange niemand vorher datenstand() gerufen hatte — also
        // Empfehlungen ohne das Datum ihrer Datenbasis.
        const erg = await ladeBaustein().ideen({ archetyp: 'Mega Excadrill', lang: 'de' });
        assert.strictEqual(erg.stand.datum, '2026-05-15');
        assert.strictEqual(erg.stand.version, '0.1');
        assert.strictEqual(erg.stand.interaktionen, 1);
    });

    it('ein Matchup ohne Regel wird als "keine Daten" mitgeliefert', async () => {
        const erg = await ladeBaustein().ideen({ archetyp: 'Mega Excadrill', lang: 'de' });
        const ohne = erg.ohneIdee.map(o => o.name);
        assert.ok(ohne.includes('Crustle'),
            'das schlechteste Matchup faellt sonst still aus der Liste');
        assert.strictEqual(erg.ohneIdee.find(o => o.name === 'Crustle').beleg, 'keine');
        assert.ok(!ohne.includes('Excadrill'),
            'ein gutes Matchup ist keine Luecke');
    });

    it('die Luecke steht auch dann da, wenn Ideen gefunden wurden', async () => {
        const erg = await ladeBaustein().ideen({ archetyp: 'Mega Excadrill', lang: 'de' });
        assert.ok(erg.gegner.length > 0 && erg.ohneIdee.length > 0,
            'ein gefundener Vorschlag darf die Luecke nicht verdecken');
    });

});

// ─────────────────────────────────────────────────────────────────────
// BEDROHUNG OHNE BEKANNTE ANTWORT — die Kategorie faellt nicht heraus
//
// BEFUND 12.09.2026 an den echten Daten: data/active_threats.json
// fuehrt VIER Bedrohungskategorien in `threats`, aber nur DREI in
// `counters`. `ability_lock` hat 11,1 % gewichteten Metaanteil und
// keinen einzigen Konter. Die Schleife in `_computeSuggestedCards`
// holte sich eine leere Konterliste und lief weiter — die Kategorie
// verschwand lautlos, und die Oberflaeche sah aus, als gaebe es die
// Bedrohung nicht.
//
// Hier laeuft die ECHTE Funktion (aus dem Quelltext geschnitten, im
// Sandkasten ausgefuehrt) gegen eine synthetische Bedrohungsdatei
// derselben Form. Keine Datei aus data/ wird gelesen: die Zahl der
// unbeantworteten Kategorien aendert sich mit jedem Scraperlauf, das
// VERHALTEN nicht.
// ─────────────────────────────────────────────────────────────────────
describe('Build-vs: eine Bedrohung ohne Konter wird benannt, nicht verschluckt', () => {

    const INTEL = {
        threats: {
            hand_disruption: {
                weighted_meta_share: 0.26,
                cards: [{ card_id: 'X|1', card_name: 'Iono',
                          archetypes: [{ archetype: 'Dragapult', share_in_archetype: 0.9 }] }]
            },
            ability_lock: {
                weighted_meta_share: 0.1109,
                cards: [{ card_id: 'DRI|180', card_name: "Team Rocket's Watchtower",
                          archetypes: [{ archetype: 'Dragapult', share_in_archetype: 0.3 }] }]
            }
        },
        counters: {
            hand_disruption: [{ card_id: 'Y|2', card_name: 'Kieran', counter_score: 3 }]
            // ability_lock fehlt — genau wie in der echten Datei
        }
    };

    /* Laesst _computeSuggestedCards und danach _renderTechSuggestions
       im Sandkasten laufen. Beide kommen aus dem Quelltext, nur die
       Zulieferer (Datei laden, Aggression lesen, Kartentext-Pfad) sind
       Attrappen. */
    async function lauf(intel, ziele, pool) {
        const geschrieben = {};
        const element = (id) => ({
            id,
            set innerHTML(v) { geschrieben[id] = v; },
            get innerHTML() { return geschrieben[id] || ''; },
            set textContent(v) { geschrieben[id] = v; },
            querySelectorAll: () => []
        });
        const knoten = {
            antiTechCardList: element('antiTechCardList'),
            antiTechStep2Targets: element('antiTechStep2Targets')
        };
        const code = [
            "const BELEG_QUELLE = 'data/card_capability_interactions.json';",
            `let _regelstand = ${JSON.stringify(STAND)};`,
            "const _source = 'currentMeta';",
            'let _suggestedCards = [];',
            'let _ohneAntwort = new Map();',
            'const _devLog = () => {};',
            'const _ensureRegelstand = async () => {};',
            'const _ensureActiveThreats = async () => intel;',
            "const _readAggression = () => 'standard';",
            'const _computeCapabilityTechSuggestions = async () => [];',
            'const _archetypeCardsFromMap = () => pool;',
            funktion(ANTI, '    function _t(key, fallback) {'),
            funktion(ANTI, '    function _tf(key, fallback) {'),
            funktion(ANTI, '    function _stripEx(name) {'),
            funktion(ANTI, '    function _getCurrentArchetype() {'),
            funktion(ANTI, '    function _esc(s) {'),
            funktion(ANTI, '    function _belegDatum(iso) {'),
            funktion(ANTI, '    function _partienByOpponentForUser() {'),
            funktion(ANTI, '    function _belegPartien(entry) {'),
            funktion(ANTI, '    function _belegSatz(entry) {'),
            funktion(ANTI, '    function _cardImageUrl(cardId) {'),
            funktion(ANTI, '    async function _computeSuggestedCards() {'),
            funktion(ANTI, '    function _renderTechSuggestions() {'),
            'return (async () => {',
            '    _suggestedCards = await _computeSuggestedCards();',
            '    _renderTechSuggestions();',
            '    return { html: lies(), karten: _suggestedCards.map(c => c.name) };',
            '})();'
        ].join('\n');
        const welt = { currentMetaMatchupData: MATCHUPS, currentMetaArchetype: 'Mega Excadrill' };
        return new Function('intel', 'pool', '_targets', '_targetDisplay', '_selectedCards',
            'document', 'window', 'getLang', 't', 'lies', code)(
            intel, pool,
            new Set(ziele.map(z => z.toLowerCase())),
            new Map(ziele.map(z => [z.toLowerCase(), z])),
            new Set(),
            { getElementById: (id) => knoten[id] || null },
            welt, () => 'de', undefined,
            () => geschrieben.antiTechCardList || '');
    }

    const POOL = [{ key: 'Y|2', name: 'Kieran' }];

    it('die Kategorie ohne Konter steht mit Namen unter der Liste', async () => {
        const { html } = await lauf(INTEL, ['Dragapult'], POOL);
        assert.ok(html.includes('keine bekannte Antwort'),
            `der Satz fehlt: ${html.slice(-600)}`);
        assert.ok(html.includes('ability_lock'),
            'und zwar mit dem Namen der Kategorie');
        assert.ok(html.includes('Dragapult'),
            'und mit dem Ziel, das diese Bedrohung spielt');
    });

    it('die beantwortete Kategorie kommt weiter als Karte durch', async () => {
        const { karten } = await lauf(INTEL, ['Dragapult'], POOL);
        assert.deepStrictEqual(karten, ['Kieran'],
            'der Hinweis darf den normalen Weg nicht abschneiden');
    });

    it('sind alle Kategorien beantwortet, steht kein Hinweis herum', async () => {
        const voll = JSON.parse(JSON.stringify(INTEL));
        voll.counters.ability_lock = [{ card_id: 'Y|2', card_name: 'Kieran', counter_score: 2 }];
        const { html } = await lauf(voll, ['Dragapult'], POOL);
        assert.ok(!html.includes('keine bekannte Antwort'),
            'ein Hinweis ohne Anlass ist genauso schlecht wie eine stille Leerstelle');
    });

    it('ein unbeantwortetes Ziel wird NICHT als "keine Daten" abgetan', async () => {
        /* Ziel spielt NUR ability_lock: ueber das Deck ist etwas
           bekannt — nur die Antwort nicht. Die beiden Saetze duerfen
           sich nicht widersprechen. */
        const nur = JSON.parse(JSON.stringify(INTEL));
        delete nur.threats.hand_disruption;
        const { html } = await lauf(nur, ['Dragapult'], POOL);
        assert.ok(html.includes('keine bekannte Antwort'), 'der richtige Satz steht da');
        assert.ok(!html.includes('keine Daten'),
            'zu diesem Ziel LIEGT etwas vor — es fehlt nur der Konter');
        /* Hier steht KEINE Kartenzeile in der Liste — taucht der Name
           trotzdem auf, dann aus dem Hinweis selbst. Ohne diese
           Zusicherung ueberlebt ein Mutant, der die Ziele aus dem
           Hinweis streicht (gemessen 12.09.2026). */
        assert.ok(html.includes('Dragapult'),
            'der Hinweis muss sagen, WELCHES Ziel die unbeantwortete Bedrohung spielt');
        assert.ok(html.includes('ability_lock'), 'und welche Bedrohung es ist');
    });

    it('ein Kategoriename aus der Datei wird maskiert', async () => {
        /* Die Kategorienamen kommen aus data/active_threats.json.
           Niemand hat ihnen versprochen, dass sie harmlos sind. */
        const boese = JSON.parse(JSON.stringify(INTEL));
        boese.threats['<img src=x onerror=alert(1)>'] = boese.threats.ability_lock;
        delete boese.threats.ability_lock;
        const { html } = await lauf(boese, ['Dragapult'], POOL);
        assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'), html.slice(-500));
        assert.ok(!html.includes('<img src=x'),
            'ein Wert aus der Datei darf nicht als Markup landen');
    });

});
