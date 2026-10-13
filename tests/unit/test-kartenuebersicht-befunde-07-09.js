/**
 * Vier Befunde der Kartenuebersicht, AUSGEFUEHRT statt gegriffen.
 *
 * Alle vier wurden am 07.09.2026 live gemessen und im Quelltext
 * nachverfolgt; hier steht je Befund eine Zusicherung, die ohne die
 * Korrektur rot wird.
 *
 *   B2 / F6.10   Die Filterliste "Haupt-Pokémon" bestand aus
 *                Namensfragmenten ("Mega", "N's", "Raging"), und
 *                "Excadrill" war darueber nicht findbar.
 *                Gemessen an den echten Dateien: 43 Eintraege, davon
 *                zwoelf Fragmente.
 *
 *   B3 / F6.18b  Die Abdeckungsplakette zeigte "125,0 % Coverage",
 *                in der Spitze 225,0 %. Gemessen: 501 von 4.115
 *                Archetyp-Eintraegen hatten einen Zaehler ueber ihrem
 *                Nenner; mit gesetztem Archetyp-Filter waren 6 von 66
 *                Archetypen ueber 100 %.
 *
 *   B1 / F6.16b  "Alle Drucke" und "Standard-Druck" lieferten bei
 *                aktiver Suche dieselben Treffer, ohne dass es jemand
 *                sagte.
 *
 *   B4 / F6.5    "Nur City League" lieferte 0 Karten ohne Erklaerung.
 *
 * KEIN jsdom: der Testschritt in deploy-pages.yml installiert nur
 * papaparse. Der Ersatz unten kann genau das, was die gepruefte
 * Funktion anfasst, und nichts weiter — dieselbe Bauart wie
 * tests/unit/test-pocket-verhalten.js.
 *
 * KEINE LIVEDATEN: jede Zeile, die hier eingelesen wird, steht in
 * dieser Datei. Der Wachhund (test-testdaten-wachhund.js) sieht diese
 * Datei deshalb bewusst nicht.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WURZEL = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(WURZEL, 'js', 'app-cards-db.js'), 'utf8');

/** Eine Funktion mitsamt ihrem Rumpf aus dem Quelltext schneiden. */
function funktion(name, asyncFn) {
    const kopf = (asyncFn ? 'async function ' : 'function ') + name + '(';
    const start = SRC.indexOf(kopf);
    assert.ok(start >= 0, name + '() gibt es nicht mehr');
    // Erst ueber die Parameterliste hinweg — `options = {}` traegt selbst
    // geschweifte Klammern, und wer bei der ersten zu zaehlen anfaengt,
    // schneidet die Signatur ab.
    let runde = 0;
    let j = SRC.indexOf('(', start);
    for (; j < SRC.length; j++) {
        if (SRC[j] === '(') runde++;
        else if (SRC[j] === ')') { runde--; if (runde === 0) break; }
    }
    let tiefe = 0;
    for (j = SRC.indexOf('{', j); j < SRC.length; j++) {
        if (SRC[j] === '{') tiefe++;
        else if (SRC[j] === '}') { tiefe--; if (tiefe === 0) return SRC.slice(start, j + 1); }
    }
    assert.fail(name + '(): Klammern gehen nicht auf');
}

/** Eine einzelne Zeile mit dieser Zeichenkette aus dem Quelltext holen. */
function zeileMit(text) {
    const zeilen = SRC.split('\n').filter(z => z.includes(text) && !z.trim().startsWith('*'));
    assert.equal(zeilen.length, 1, 'genau eine Zeile mit ' + JSON.stringify(text) + ' erwartet, '
        + zeilen.length + ' gefunden');
    return zeilen[0];
}

// ── Die kleinste Umgebung, die traegt ────────────────────────────────

/**
 * @param {object} wahl  gewaehlte Filter: {haupt, archetypen, metas}
 * @param {object} quellen  Dateiname -> Zeilen
 */
function umgebung(quellen, wahl) {
    const gewaehlt = wahl || {};
    const dok = {
        getElementById: () => null,
        querySelectorAll: (sel) => {
            const bau = (v) => (v || []).map(x => ({ value: x }));
            if (sel.indexOf('#mainPokemonList') === 0) return bau(gewaehlt.haupt);
            if (sel.indexOf('#archetypeList') === 0) return bau(gewaehlt.archetypen);
            if (sel.indexOf('#metaFormatOptions') === 0) return bau(gewaehlt.metas);
            return [];
        }
    };
    const sb = {
        console: { warn() {}, error() {} },
        Math, Date, Number, String, Array, Map, Set, JSON, Boolean, Object, Error,
        parseInt, parseFloat, isNaN, Promise, RegExp, setTimeout,
        document: dok,
        devLog: () => {},
        // Die Trennung Besitzer/Art ist eine fremde Funktion (app-core.js) und
        // hier absichtlich winzig nachgebaut: geprueft wird, was
        // app-cards-db.js DAMIT macht.
        stripTrainerOwnerPrefix: (n) => {
            const m = String(n || '').trim().match(/^(.+?['’]s)\s+(.+)$/);
            return m ? { owner: m[1], base: m[2] } : { owner: '', base: String(n || '').trim() };
        },
        normalizeCardName: (n) => String(n || '').toLowerCase().trim(),
        isBasicEnergy: () => false,
        sanitizeTournamentArchetypeName: (a) => String(a || '').trim(),
        normalizeTournamentFormatLabel: (meta, setCode) => String(meta || setCode || '').trim(),
        parseTournamentDate: () => null,
        getCardReleaseDate: () => null,
        SET_RELEASE_DATES: { DEFAULT: '2000-01-01' },
    };
    sb.window = sb;
    sb.stripTrainerOwnerPrefix = sb.stripTrainerOwnerPrefix;
    sb._fetchAndParseCsvCached = (datei) => Promise.resolve(quellen[datei] || []);
    return sb;
}

const HAUPT_KONST = (() => {
    const a = SRC.indexOf('const HAUPT_FORMWORTE');
    assert.ok(a >= 0, 'HAUPT_FORMWORTE gibt es nicht mehr');
    return SRC.slice(a, SRC.indexOf('\n', a));
})();

async function laden(quellen, wahl) {
    const sb = umgebung(quellen, wahl);
    const quelltext = [
        HAUPT_KONST,
        funktion('hauptPokemonAusArchetyp'),
        'window.hauptPokemonAusArchetyp = hauptPokemonAusArchetyp;',
        funktion('loadDeckCoverageStats', true),
        funktion('calculateDynamicCoverage'),
        'window.loadDeckCoverageStats = loadDeckCoverageStats;',
        'window.calculateDynamicCoverage = calculateDynamicCoverage;',
        'window.hauptPokemonAusArchetyp = hauptPokemonAusArchetyp;'
    ].join('\n\n');
    const namen = Object.keys(sb);
    // eslint-disable-next-line no-new-func
    const bau = new Function(...namen, quelltext + '\nreturn window;');
    const w = bau(...namen.map(k => sb[k]));
    await w.loadDeckCoverageStats();
    return { w, sb };
}

/** Eine Zeile, wie die drei CSV-Quellen sie liefern. */
function zeile(meta, archetyp, karte, set, deckMitKarte, decksImArchetyp) {
    return {
        meta: meta,
        archetype: archetyp,
        card_name: karte,
        set_code: set,
        set_number: '1',
        deck_inclusion_count: String(deckMitKarte),
        total_decks_in_archetype: String(decksImArchetyp),
        max_count: '4'
    };
}

/* ══ B2 — die Filterliste "Haupt-Pokémon" ══════════════════════════ */

describe('B2/F6.10 — die Filterliste nennt Pokémon, keine Worthaelften', () => {
    /* Genau die vier Bauarten, die live danebengriffen, plus eine, die
     * schon vorher stimmte. Die Kartennamen sind der einzige Beleg
     * dafuer, wo bei "Raging Bolt Ogerpon" die Art aufhoert — sie
     * stehen deshalb mit in den Zeilen. */
    const QUELLEN = {
        'current_meta_card_data.csv': [
            zeile('TEF-PBL', 'Mega Excadrill', 'Excadrill ex', 'MEG', 8, 10),
            zeile('TEF-PBL', "N's Zoroark", 'Zoroark ex', 'ASC', 9, 12),
            zeile('TEF-PBL', 'Raging Bolt Ogerpon', 'Raging Bolt ex', 'TEF', 7, 7),
            zeile('TEF-PBL', 'Grimmsnarl Froslass', 'Boss’s Orders', 'PAL', 5, 6),
            zeile('TEF-PBL', 'Dragapult', 'Dreepy', 'TWM', 20, 20),
        ]
    };

    it('"Excadrill" ist findbar, "Mega" steht nicht mehr in der Liste', async () => {
        const { w } = await laden(QUELLEN);
        const liste = Array.from(w.allMainPokemons).sort();
        assert.ok(liste.includes('Excadrill'),
            'Der Archetyp heisst "Mega Excadrill"; wer nach Excadrill filtern will, '
            + 'findet ihn nicht. Liste: ' + JSON.stringify(liste));
        assert.ok(!liste.includes('Mega'),
            '"Mega" ist kein Pokémon, sondern ein Formwort. Liste: ' + JSON.stringify(liste));
    });

    it('der Besitzer eines Decks ist nicht sein Haupt-Pokémon', async () => {
        const { w } = await laden(QUELLEN);
        const liste = Array.from(w.allMainPokemons);
        assert.ok(liste.includes('Zoroark'), 'aus "N’s Zoroark" muss Zoroark werden');
        assert.ok(!liste.some(x => /['’]s$/.test(x)),
            'ein Besitzer-Praefix ("N’s") ist in der Liste gelandet: ' + JSON.stringify(liste));
    });

    it('eine zweiteilige Art bleibt ganz, wenn ein Kartenname sie belegt', async () => {
        const { w } = await laden(QUELLEN);
        const liste = Array.from(w.allMainPokemons);
        assert.ok(liste.includes('Raging Bolt'),
            '"Raging" allein ist kein Pokémon; die Karte "raging bolt ex" belegt den ganzen Namen. '
            + 'Liste: ' + JSON.stringify(liste));
        assert.ok(!liste.includes('Raging'), 'die Worthaelfte steht noch in der Liste');
    });

    it('ohne belegenden Kartennamen bleibt es beim ersten Wort, nicht beim ganzen Archetyp', async () => {
        // "Grimmsnarl Froslass" hat in diesen Daten keine eigene
        // Pokémon-Karte. Der Archetypname als Ganzes waere kein
        // Haupt-Pokémon mehr, sondern nur der Archetyp noch einmal.
        const { w } = await laden(QUELLEN);
        const liste = Array.from(w.allMainPokemons);
        assert.ok(liste.includes('Grimmsnarl'), 'Liste: ' + JSON.stringify(liste));
        assert.ok(!liste.includes('Grimmsnarl Froslass'),
            'der Archetypname steht doppelt in beiden Listen');
    });

    it('die Karten des Archetyps haengen am neuen Schluessel, nicht am alten', async () => {
        const { w } = await laden(QUELLEN);
        const karten = w.mainPokemonCardsMap.get('Excadrill');
        assert.ok(karten && karten.has('excadrill ex'),
            'ohne Zuordnung findet der Filter zwar den Namen, aber keine Karte');
        assert.ok(!w.mainPokemonCardsMap.has('Mega'), 'der alte Fragment-Schluessel lebt noch');
    });

    it('der Filter der Abdeckung benutzt dieselbe Regel wie die Liste', async () => {
        // Waere hier wieder archetype.split(' ')[0] eingesetzt, faende
        // "Excadrill" keinen einzigen Archetypen und die Abdeckung
        // waere null.
        const { w } = await laden(QUELLEN, { haupt: ['Excadrill'] });
        const r = w.calculateDynamicCoverage('Excadrill ex');
        assert.ok(r, 'kein Ergebnis: der Haupt-Pokémon-Filter trifft keinen Archetypen mehr');
        assert.equal(r.deckCount, 8);
        assert.equal(r.totalDecks, 10);
    });
});

/* ══ B3 — die Abdeckung ueber 100 % ════════════════════════════════ */

describe('B3/F6.18b — eine Abdeckung ueber 100 % gibt es nicht', () => {
    /* Der live gemessene Fall, auf das Noetigste eingedampft: DERSELBE
     * Archetyp wird von ZWEI Erhebungen mit VERSCHIEDENEN Deckzahlen
     * gemeldet (22 und 46), und dieselbe Karte kommt in zwei Drucken vor.
     * Live ergab das TEF-POR|Dragapult mit Nenner 22 und Zaehler 46 —
     * 209,1 %.
     *
     * Die ausfuehrliche Pruefung des Erhebungsmodells steht in
     * tests/unit/test-abdeckung-erhebungen-07-09.js; hier bleibt die
     * Eigenschaft stehen, um die es diesem Befund ging. */
    const ZWEI_QUELLEN = {
        'tournament_cards_data_cards.csv': [
            zeile('TEF-POR', 'Dragapult', 'Meowth ex', 'POR', 20, 22),
            zeile('TEF-POR', 'Dragapult', 'Dreepy', 'TWM', 20, 22),
        ],
        'current_meta_card_data.csv': [
            zeile('TEF-POR', 'Dragapult', 'Dreepy', 'ASC', 46, 46),
        ]
    };

    it('der Share bleibt bei hoechstens 100 %', async () => {
        const { w } = await laden(ZWEI_QUELLEN, { archetypen: ['Dragapult'] });
        const r = w.calculateDynamicCoverage('Dreepy');
        assert.ok(r, 'kein Ergebnis');
        assert.ok(r.percentage <= 100,
            `${r.deckCount} von ${r.totalDecks} Decks = ${r.percentage.toFixed(1)} % — `
            + 'mehr Decks mit der Karte als Decks im Archetyp gibt es nicht');
    });

    it('Zaehler und Nenner stammen aus DERSELBEN Erhebung', async () => {
        const { w } = await laden(ZWEI_QUELLEN, { archetypen: ['Dragapult'] });
        const r = w.calculateDynamicCoverage('Dreepy');
        assert.ok(r.deckCount <= r.totalDecks,
            `Zaehler ${r.deckCount} > Nenner ${r.totalDecks}`);
        assert.ok([[20, 22], [46, 46]].some(([z, n]) => z === r.deckCount && n === r.totalDecks),
            'gezeigt: ' + r.deckCount + '/' + r.totalDecks + ' — dieser Bruch steht in keiner '
            + 'Quelle. Genau so entstand 209,1 %: Zaehler aus der einen, Nenner aus der '
            + 'anderen Erhebung.');
        assert.equal(r.erhebung, 'Current Meta / TEF-POR',
            'gezeigt wird die groesste Erhebung; gewaehlt wurde: ' + r.erhebung);
    });

    it('die andere Erhebung wird beim Namen genannt, nicht verschwiegen', async () => {
        const { w } = await laden(ZWEI_QUELLEN, { archetypen: ['Dragapult'] });
        const r = w.calculateDynamicCoverage('Dreepy');
        const andere = r.weitereErhebungen.find(x => x.name === 'Tournament / TEF-POR');
        assert.ok(andere, 'die abweichende Erhebung fehlt: ' + JSON.stringify(r.weitereErhebungen));
        assert.equal(andere.deckCount, 20);
        assert.equal(andere.totalDecks, 22);
    });

    it('bei einer einzigen, in sich stimmigen Quelle gibt es keine Marke', async () => {
        const { w } = await laden({
            'current_meta_card_data.csv': [
                zeile('TEF-PBL', 'Dragapult', 'Dreepy', 'TWM', 18, 20),
            ]
        }, { archetypen: ['Dragapult'] });
        const r = w.calculateDynamicCoverage('Dreepy');
        assert.equal(r.gedeckelt, false,
            'eine Marke auf jeder Karte unterscheidet nichts mehr');
        assert.deepEqual(r.weitereErhebungen, []);
        assert.equal(r.deckCount, 18);
        assert.equal(r.totalDecks, 20);
        assert.ok(Math.abs(r.percentage - 90) < 1e-9, 'Share: ' + r.percentage);
    });

    it('auch ohne gesetzten Filter bleibt der Share bei hoechstens 100 %', async () => {
        const { w } = await laden(ZWEI_QUELLEN);
        const r = w.calculateDynamicCoverage('Dreepy');
        assert.ok(r.percentage <= 100, 'ungefiltert: ' + r.percentage + ' %');
    });

    it('mehrere Prints derselben Karte zaehlen weiter zusammen', async () => {
        // Die Zusammenlegung ueber Drucke ist gewollt (Kommentar
        // "SUM-merged"): wer die Karte in irgendeinem Druck spielt,
        // zaehlt. Innerhalb EINER Erhebung, und nur ueber den Nenner
        // dieser Erhebung darf sie nicht hinausschiessen.
        const { w } = await laden({
            'current_meta_card_data.csv': [
                zeile('TEF-PBL', 'Dragapult', 'Boss’s Orders', 'PAL', 6, 20),
                zeile('TEF-PBL', 'Dragapult', 'Boss’s Orders', 'BRS', 5, 20),
            ]
        }, { archetypen: ['Dragapult'] });
        const r = w.calculateDynamicCoverage('Boss’s Orders');
        assert.equal(r.deckCount, 11, 'die beiden Prints muessen zusammengezaehlt werden');
        assert.equal(r.totalDecks, 20);
        assert.equal(r.gedeckelt, false);
    });
});

/* ══ B1 und B4 — zwei Zustaende, die nichts ueber sich sagten ═══════ */

describe('B1/F6.16b — "Standard-Print" sagt, wenn es gerade nicht zusammenlegt', () => {
    /* Die Regel selbst, ausgefuehrt: die eine Zeile, die den Hinweis
     * setzt, mit allen vier Kombinationen. */
    function regel(standardDruck, suche) {
        const w = {};
        // eslint-disable-next-line no-new-func
        new Function('window', 'showOnlyOnePrint', 'searchTerm',
            zeileMit('window._cdbDruckHinweis = Boolean('))(w, standardDruck, suche);
        return w._cdbDruckHinweis;
    }

    it('nur bei Standard-Print UND aktiver Suche', () => {
        assert.equal(regel(true, 'charizard'), true,
            'genau hier wird die Zusammenlegung uebersprungen — und genau hier sagte es '
            + 'bisher niemand');
        assert.equal(regel(true, ''), false, 'ohne Suche legt Standard-Print wirklich zusammen');
        assert.equal(regel(false, 'charizard'), false, '"Alle Prints" verspricht nichts anderes');
        assert.equal(regel(false, ''), false);
    });

    it('die Ergebniszeile traegt den Grund, in beiden Sprachen', () => {
        const de = zeichne([{ set: 'ASC', number: '1', name: 'A' }], { druckHinweis: true, sprache: 'de' });
        assert.match(de.ergebnisZeile, /alle Prints/,
            'die Zeile sagt nicht, warum "Standard-Print" nichts zusammenlegt: '
            + JSON.stringify(de.ergebnisZeile));
        const en = zeichne([{ set: 'ASC', number: '1', name: 'A' }], { druckHinweis: true, sprache: 'en' });
        assert.match(en.ergebnisZeile, /every print/);
        assert.ok(!/alle Prints/.test(en.ergebnisZeile), 'deutscher Satz im englischen Modus');
    });

    it('ohne Suche steht der Satz nicht da', () => {
        const r = zeichne([{ set: 'ASC', number: '1', name: 'A' }], { druckHinweis: false, sprache: 'de' });
        assert.ok(!/alle Prints/.test(r.ergebnisZeile), 'ein Hinweis ohne Anlass: ' + r.ergebnisZeile);
    });

    it('und er steht auch dann da, wenn NULL Karten uebrig bleiben', () => {
        /* BEFUND 07.09.2026: der Leerzustand stieg mit `return` aus, bevor
         * der Satz angehaengt wurde. Eine Suche mit "Standard-Druck" und
         * null Treffern nannte den Grund also genau dort nicht, wo er am
         * meisten fehlt — der Knopf blieb hervorgehoben, das Ergebnis leer,
         * und niemand sagte, dass beide Ansichten gerade dasselbe tun. */
        const de = zeichne([], { druckHinweis: true, sprache: 'de' });
        assert.match(de.ergebnisZeile, /alle Prints/,
            'der leere Treffer nennt den Grund nicht: ' + JSON.stringify(de.ergebnisZeile));
        const en = zeichne([], { druckHinweis: true, sprache: 'en' });
        assert.match(en.ergebnisZeile, /every print/, en.ergebnisZeile);
    });

    it('ein leeres Ergebnis ohne Druckhinweis bleibt bei der reinen Zahl', () => {
        const r = zeichne([], { druckHinweis: false, sprache: 'de' });
        assert.ok(!/alle Prints/.test(r.ergebnisZeile),
            'ein Hinweis ohne Anlass: ' + r.ergebnisZeile);
    });
});

describe('B4/F6.5 — "Nur City League" nennt den Grund fuer 0 Karten', () => {
    function grund(metas, clGroesse) {
        const w = { cityLeagueCardsSet: { size: clGroesse } };
        const rumpf = SRC.slice(SRC.indexOf('const _clLeer = !window.cityLeagueCardsSet'),
                                SRC.indexOf(": '';", SRC.indexOf('const _clLeer =')) + 5);
        // eslint-disable-next-line no-new-func
        new Function('window', 'selectedMetas', rumpf)(w, metas);
        return w._cdbLeerGrund;
    }

    it('die leere Quelldatei wird als Grund vermerkt', () => {
        assert.equal(grund(['city_league'], 0), 'city-league-saisonpause',
            'ohne Grund bleibt es bei "Filtereinstellungen anpassen" — ein Rat, der hier '
            + 'nichts ausrichtet, weil kein Filter fehlende Daten herbeischafft');
    });

    it('sobald die Saison laeuft, gibt es keinen Grund mehr zu nennen', () => {
        assert.equal(grund(['city_league'], 1200), '');
    });

    it('andere Filter erben den Grund nicht', () => {
        assert.equal(grund(['total'], 0), '');
        assert.equal(grund(['all_playables'], 0), '');
    });

    it('der Leerzustand traegt den vorhandenen Wortlaut der Seite, in beiden Sprachen', () => {
        const de = zeichne([], { leerGrund: 'city-league-saisonpause', sprache: 'de' });
        assert.match(de.inhalt, /Saisonpause in Japan/,
            'derselbe Zustand heisst in js/app-city-league.js schon so — ein Zustand, '
            + 'zwei Ansichten, ein Satz');
        assert.match(de.inhalt, /Set-Rotationen/);
        assert.ok(!/adjusting your filter settings/.test(de.inhalt),
            'der nutzlose Rat steht noch da');

        const en = zeichne([], { leerGrund: 'city-league-saisonpause', sprache: 'en' });
        assert.match(en.inhalt, /Off-season in Japan/);
        assert.ok(!/Saisonpause/.test(en.inhalt), 'deutscher Satz im englischen Modus');
    });

    it('ein leeres Ergebnis ohne bekannten Grund bleibt beim allgemeinen Text', () => {
        // Ohne i18n-Tabelle im Ersatz greift der eingebaute Ersatztext der
        // Funktion — genau der, der vorher AUCH bei City League stand.
        const r = zeichne([], { leerGrund: '', sprache: 'de' });
        assert.match(r.inhalt, /adjusting your filter settings/,
            'wenn der Grund unbekannt ist, darf keiner behauptet werden');
        assert.ok(!/Saisonpause/.test(r.inhalt));
    });
});

/** Die echte renderCardDatabase() gegen einen DOM-Ersatz laufen lassen. */
function zeichne(karten, wahl) {
    const o = wahl || {};
    const knoten = {
        cardsContent: { innerHTML: '', appendChild() {} },
        cardResultsInfo: { textContent: '' },
        cards: { scrollIntoView() {} }
    };
    const w = {
        _cdbLeerGrund: o.leerGrund || '',
        _cdbDruckHinweis: Boolean(o.druckHinweis),
        prizePackImagesIndex: null,
        userCollectionCounts: null,
        allCardsData: []
    };
    const sb = {
        window: w,
        document: {
            getElementById: (id) => knoten[id] || null,
            createElement: () => ({ className: '', appendChild() {} })
        },
        console: { warn() {} },
        getLang: () => (o.sprache || 'de'),
        // Kein t(): der Ersatztext der Funktion selbst soll geprueft werden.
        t: undefined,
        escapeHtml: (s) => String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
        destroyCardsVirtualGrid: () => {},
        createPaginationControls: () => ({}),
        mountVirtualCardsGrid: () => {},
        createCardDatabaseItem: () => ({}),
        _updateCardButtonStates: () => {},
        showAllCards: true,
        cardsPerPage: 63,
        currentCardsPage: 1,
        Math, Number, String, Array, Object, JSON, Boolean
    };
    const namen = Object.keys(sb);
    // eslint-disable-next-line no-new-func
    const bau = new Function(...namen, funktion('renderCardDatabase') + '\nreturn renderCardDatabase;');
    bau(...namen.map(k => sb[k]))(karten, { scrollToTop: false });
    return { inhalt: knoten.cardsContent.innerHTML, ergebnisZeile: knoten.cardResultsInfo.textContent };
}

/* ══ B24 — eine Zuweisung an einen Namen, den es nicht gibt ════════ */

describe('B24 — der Meta-Filter kommt ohne unerklaertes Global aus', () => {
    /** Den Meta-Filter-Block aus filterAndRenderCards() ausfuehren. */
    function metaFilter(gewaehlt, karte, nurStandardDruck) {
        const a = SRC.indexOf('// Meta/Format filter (Total, All Playables, City League)');
        assert.ok(a >= 0, 'den Meta-Filter-Block gibt es nicht mehr');
        const b = SRC.indexOf('// Set filter', a);
        assert.ok(b > a, 'das Ende des Blocks ist nicht mehr zu finden');
        const rumpf = SRC.slice(a, b);
        const sb = {
            window: {
                playableCardsSet: new Set(['pikachu']),
                playablePrintIds: new Set(['ASC-1']),
                cityLeagueCardsSet: new Set(['pikachu']),
                cityLeaguePrintIds: new Set(['ASC-1'])
            },
            selectedMetas: gewaehlt,
            card: karte,
            showOnlyOnePrint: Boolean(nurStandardDruck),
            normalizeCardName: (n) => String(n || '').toLowerCase().trim(),
            failedMeta: 0,
            String, Set, Boolean
        };
        const namen = Object.keys(sb);
        /* 'use strict' ist hier der Punkt: eine Zuweisung an einen nirgends
         * deklarierten Namen ist dann ein ReferenceError und kein stilles
         * globales Feld. Genau so wurde `_cityLeagueGewaehlt` gefunden. */
        // eslint-disable-next-line no-new-func
        const bau = new Function(...namen, "'use strict';\n" + rumpf + '\nreturn true;');
        return bau(...namen.map(k => sb[k]));
    }

    it('der Block laeuft unter "use strict" durch', () => {
        assert.equal(metaFilter(['city_league'], { name: 'Pikachu', set: 'ASC', number: '1' }, true), true,
            'eine Zuweisung an einen nicht deklarierten Namen faellt hier als '
            + 'ReferenceError um — und in einer Datei mit "use strict" haette sie '
            + 'den ganzen Filter mitgerissen');
    });

    it('und filtert dabei weiter richtig', () => {
        // Die Gegenprobe: der Block wurde nicht einfach leer gemacht.
        assert.equal(metaFilter(['city_league'], { name: 'Zapdos', set: 'ASC', number: '9' }, true), false,
            'eine Karte ausserhalb der City-League-Menge muss durchfallen');
        assert.equal(metaFilter(['total'], { name: 'Zapdos', set: 'ASC', number: '9' }, true), true,
            '"Total" zeigt alles');
        assert.equal(metaFilter([], { name: 'Zapdos', set: 'ASC', number: '9' }, true), true,
            'ohne gewaehlten Meta-Filter filtert der Block nichts');
    });
});
