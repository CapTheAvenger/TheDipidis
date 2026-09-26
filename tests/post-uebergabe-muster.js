/* Das Muster für die Quelle „From the app" — an EINER Stelle.
 *
 * REZEPTE['uebergabe'] (25.09.2026) liest kein data/-File, sondern den
 * lokalen Speicher: ein Deck aus „Meine Decks" oder ein Turnier aus dem
 * Battle Journal, das die App dort abgelegt hat
 * (js/ds-post-uebergabe.js). Zwei Testdateien laden alle Quellen und
 * halten sie gegen dieselben Klippen — Zahl in der Fußzeile, Breite der
 * Wertspalte, Hashtags, keine Rangziffern bei gleichen Werten. Beide
 * brauchen deshalb dieselbe Übergabe, und eine zweite Abschrift wäre
 * die Stelle, an der die eine Datei später etwas anderes prüft als die
 * andere.
 *
 * Das Deck ist ein ECHTES: die Liste vom Turnierposter des Betreibers
 * (25.09.2026, „Mega Excadrill - Frankfurt Sep 26") — 22 verschiedene
 * Karten, 60 Stück. Ein selbst zurechtgelegtes hätte wieder nur die
 * eigene Annahme belegt (Pocket-Abnahme 04.09.2026).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WURZEL = path.join(__dirname, '..');

const BEISPIEL_DECK = {
    'Beldum (TEF 113)': 4, 'Metang (TEF 114)': 4, 'Drilbur (PBL 46)': 3,
    'Rayquaza ex (TEF 110)': 2, "Team Rocket's Ho-Oh ex (DRI 26)": 2,
    'Piplup (PBL 32)': 2, 'Empoleon ex (PBL 35)': 1, 'Ogerpon ex (TWM 25)': 1,
    'Mega Excadrill ex (PBL 65)': 1, 'Metagross (PBL 103)': 1,
    "Brock's Scouting (JTG 143)": 4, "Team Rocket's Petrel (DRI 95)": 4,
    "Boss's Orders (PAL 172)": 1, 'Kieran (TWM 154)': 1,
    'Buddy-Buddy Poffin (TEF 144)': 4, 'Pokegear 3.0 (SSH 174)': 3,
    'Jumbo Ice Cream (SSP 166)': 2, 'Energy Recycler (BST 124)': 1,
    'Rare Candy (SVI 191)': 1, 'Switch (SVI 194)': 1,
    "Hero's Cape (TEF 152)": 1, 'Basic Metal Energy (SVE 16)': 16
};

const BEISPIEL_TURNIER = {
    titel: 'Frankfurt Sep 2026',
    format: 'TEF-30C',
    art: 'Regional/SPE',
    datum: '25.9.2026',
    platz: null,
    bilanz: { w: 1, l: 0, t: 0 },
    quote: 100,
    deck: 'Mega Excadrill',
    karten: BEISPIEL_DECK,
    bilder: {},
    runden: [{ n: 1, result: 'win', opponent: 'Alakazam Dudunsparce',
               turnOrder: '', bestOf: 'bo3', games: 'WW' }]
};

/* Ein Meta Call, wie ihn js/app-meta-call.js übergibt — mit BEIDEN
 * Ständen (Modellprognose und eigene Schätzung) und zwei wählbaren
 * Decks. Er ist die Vorgabe für die beiden Testdateien, die ALLE Quellen
 * durchgehen: nur mit ihm liefern beide Meta-Call-Quellen etwas, und nur
 * dann laufen die Hausregeln (Nenner in der Fußzeile, Breite der
 * Wertspalte) auch über diese Bilder.
 *
 * Die Zahlen sind die des Betreibers vom 25.09.2026 (Regional Frankfurt,
 * Mega Excadrill), abgelesen an seinen Bildschirmfotos. */
const BEISPIEL_METACALL = {
    titel: 'Regional Frankfurt September 2026',
    art: 'Regional/SPE',
    format: 'Current Meta (30C)',
    spieler: 3200, runden: 8, day2Punkte: 16,
    meinDeck: 'Mega Excadrill',
    eigeneSchaetzungen: true,
    szenario: 'Regional Frankfurt September 2026',
    staende: {
        eigen: {
            feld: [
                { name: 'Dragapult', anteil: 18.0, schnitt: 1.44 },
                { name: "N's Zoroark", anteil: 8.6, schnitt: 0.69 },
                { name: 'Basic Box', anteil: 8.2, schnitt: 0.66 },
                { name: 'Dragapult Blaziken', anteil: 7.0, schnitt: 0.56 },
                { name: 'Slowking', anteil: 6.2, schnitt: 0.50 },
                { name: 'Crustle', anteil: 4.0, schnitt: 0.32 },
                { name: 'Mega Excadrill', anteil: 4.0, schnitt: 0.32 },
                { name: 'Dhelmise', anteil: 3.2, schnitt: 0.26 }
            ],
            decks: {
                'Mega Excadrill': {
                    ergebnis: { day2: 17.8, wins: 3.6, ties: 1.1, losses: 3.4, quote: 44.5 },
                    quoten: { 'Dragapult': 58, "N's Zoroark": 50, 'Basic Box': 45,
                              'Dragapult Blaziken': 37, 'Slowking': 39, 'Crustle': 66,
                              'Dhelmise': 48 }
                },
                'Crustle': {
                    ergebnis: { day2: 22.5, wins: 3.8, ties: 1.0, losses: 3.2, quote: 47.3 },
                    quoten: { 'Dragapult': 44, "N's Zoroark": 52, 'Mega Excadrill': 34 }
                }
            },
            empfehlungen: [
                { name: 'Crustle', day2: 22.5, quote: 47.3 },
                { name: 'Kangaskhan Bouffalant', day2: 22.1, quote: 47.0 },
                { name: 'Basic Box', day2: 22.0, quote: 46.9 }
            ]
        },
        standard: {
            feld: [
                { name: 'Dragapult', anteil: 18.8, schnitt: 1.50 },
                { name: "N's Zoroark", anteil: 8.64, schnitt: 0.69 },
                { name: 'Basic Box', anteil: 8.16, schnitt: 0.65 },
                { name: 'Slowking', anteil: 6.25, schnitt: 0.50 },
                { name: 'Crustle', anteil: 5.89, schnitt: 0.47 },
                { name: 'Mega Excadrill', anteil: 3.97, schnitt: 0.32 }
            ],
            decks: {
                'Mega Excadrill': {
                    ergebnis: { day2: 17.1, wins: 3.5, ties: 1.1, losses: 3.4, quote: 44.0 },
                    quoten: { 'Dragapult': 58, "N's Zoroark": 50, 'Basic Box': 45,
                              'Slowking': 39, 'Crustle': 66 }
                }
            },
            empfehlungen: [
                { name: 'Crustle', day2: 22.5, quote: 47.3 },
                { name: 'Basic Box', day2: 22.0, quote: 46.9 }
            ]
        }
    }
};

/* Legt einen Speicher in den Kontext und die Übergabe hinein. Muss VOR
 * js/ds-post-quellen.js laufen — die Quelle liest beim Laden nichts,
 * beim `lade()` aber sofort. Ohne Angabe: der Meta Call, weil nur er
 * BEIDE Quellen bedient. */
function uebergabeEinrichten(ctx, art) {
    const inhalt = {};
    ctx.localStorage = {
        getItem: (k) => (k in inhalt ? inhalt[k] : null),
        setItem: (k, v) => { inhalt[k] = String(v); },
        removeItem: (k) => { delete inhalt[k]; }
    };
    vm.runInContext(
        fs.readFileSync(path.join(WURZEL, 'js', 'ds-post-uebergabe.js'), 'utf8'),
        ctx, { filename: 'ds-post-uebergabe.js' });
    if (art === 'turnier') {
        ctx.window.DsPostUebergabe.legen('turnier', BEISPIEL_TURNIER.titel, BEISPIEL_TURNIER);
    } else if (art === 'deck') {
        ctx.window.DsPostUebergabe.legen('deck', 'Mega Excadrill - Frankfurt Sep 26', {
            titel: 'Mega Excadrill - Frankfurt Sep 26',
            archetyp: 'Mega Excadrill',
            karten: BEISPIEL_DECK,
            bilder: {},
            gesamt: Object.keys(BEISPIEL_DECK)
                .reduce((s, k) => s + BEISPIEL_DECK[k], 0)
        });
    } else {
        ctx.window.DsPostUebergabe.legen('metacall', BEISPIEL_METACALL.titel, BEISPIEL_METACALL);
    }
    return ctx;
}

/* ── DER BESTAND (26.09.2026) ─────────────────────────────────────────
 *
 * Die Kaskade auf der Post-Seite laesst nicht mehr „das zuletzt
 * uebergebene Stueck" waehlen, sondern ALLE. Dafuer braucht der Test
 * mehr als eines je Art — mit einem einzigen Deck waere die Zusicherung
 * „alle Decks stehen zur Wahl" von der Zusicherung „eines steht zur
 * Wahl" nicht zu unterscheiden.
 *
 * Das zweite Deck ist eine ECHTE zweite Liste: dieselben Karten, aber
 * eine andere Verteilung waere ein Zwilling gewesen. Hier ist es ein
 * anderer Archetyp mit anderer Kartenzahl. */
const ZWEITES_DECK = {
    'Dreepy (TWM 128)': 4, 'Drakloak (TWM 129)': 4, 'Dragapult ex (TWM 130)': 3,
    'Duskull (SFA 40)': 2, 'Dusclops (SFA 41)': 2, 'Dusknoir (SFA 42)': 2,
    'Fezandipiti ex (SFA 38)': 1, 'Munkidori (TWM 95)': 1,
    'Iono (PAL 185)': 3, "Boss's Orders (PAL 172)": 2, 'Arven (SVI 186)': 2,
    'Buddy-Buddy Poffin (TEF 144)': 4, 'Nest Ball (SVI 181)': 3,
    'Ultra Ball (SVI 196)': 3, 'Rare Candy (SVI 191)': 3,
    'Counter Catcher (PAR 160)': 2, 'Super Rod (PAL 188)': 1,
    'Technical Machine: Devolution (PAR 177)': 1, 'Artazon (PAL 171)': 2,
    'Basic Psychic Energy (SVE 13)': 5, 'Basic Fire Energy (SVE 10)': 5,
    'Jet Energy (PAL 190)': 1
};

/* Ein zweites Turnier — anderes Ergebnis, anderes Deck, mehr Runden. */
const ZWEITES_TURNIER = {
    titel: 'League Cup Mainz Sep 2026',
    format: 'TEF-PBL',
    art: 'League Cup',
    datum: '14.9.2026',
    platz: 3,
    bilanz: { w: 4, l: 1, t: 1 },
    quote: 75,
    deck: 'Dragapult Dusknoir',
    karten: ZWEITES_DECK,
    bilder: {},
    runden: [
        { n: 1, result: 'win', opponent: 'Slowking', games: 'WW' },
        { n: 2, result: 'loss', opponent: 'Crustle', games: 'LL' },
        { n: 3, result: 'tie', opponent: 'Basic Box', games: 'WL' }
    ]
};

/* Ein zweiter Meta Call: derselbe Bau, andere Zahlen — und OHNE eigene
 * Schaetzungen, damit die Zusicherung „ohne eigene Schaetzungen wird es
 * gesagt" etwas zu pruefen hat. */
const ZWEITER_METACALL = JSON.parse(JSON.stringify(BEISPIEL_METACALL));
ZWEITER_METACALL.titel = 'League Cup Mainz September 2026';
ZWEITER_METACALL.szenario = 'League Cup Mainz September 2026';
ZWEITER_METACALL.spieler = 64;
ZWEITER_METACALL.runden = 5;
ZWEITER_METACALL.eigeneSchaetzungen = false;
ZWEITER_METACALL.meinDeck = 'Crustle';

/* Legt zusaetzlich zum EINEN Stueck den vollen Bestand hin — so, wie es
 * die drei Aufrufer in der App seit dem 26.09.2026 tun. */
function bestandEinrichten(ctx) {
    const U = ctx.window.DsPostUebergabe;
    U.bestandLegen('deck', [
        { titel: 'Mega Excadrill - Frankfurt Sep 26', daten: {
            titel: 'Mega Excadrill - Frankfurt Sep 26', archetyp: 'Mega Excadrill',
            karten: BEISPIEL_DECK, bilder: {},
            gesamt: Object.keys(BEISPIEL_DECK).reduce((s, k) => s + BEISPIEL_DECK[k], 0) } },
        { titel: 'Dragapult Dusknoir - Standard', daten: {
            titel: 'Dragapult Dusknoir - Standard', archetyp: 'Dragapult Dusknoir',
            karten: ZWEITES_DECK, bilder: {},
            gesamt: Object.keys(ZWEITES_DECK).reduce((s, k) => s + ZWEITES_DECK[k], 0) } }
    ]);
    U.bestandLegen('turnier', [
        { titel: BEISPIEL_TURNIER.titel, daten: BEISPIEL_TURNIER },
        { titel: ZWEITES_TURNIER.titel, daten: ZWEITES_TURNIER }
    ]);
    U.bestandLegen('metacall', [
        { titel: BEISPIEL_METACALL.titel, daten: BEISPIEL_METACALL },
        { titel: ZWEITER_METACALL.titel, daten: ZWEITER_METACALL }
    ]);
    return ctx;
}

module.exports = {
    BEISPIEL_DECK, BEISPIEL_TURNIER, BEISPIEL_METACALL,
    ZWEITES_DECK, ZWEITES_TURNIER, ZWEITER_METACALL,
    uebergabeEinrichten, bestandEinrichten
};
