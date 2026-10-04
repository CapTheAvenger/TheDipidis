/**
 * getPreferredVersionForCard() aus js/app-utils.js (Zeile 832).
 *
 * WARUM ES DIESE DATEI GIBT
 * -------------------------
 * Sie war 0 Byte gross und wurde als bestandener Test mitgezaehlt.
 *
 * WAS DIE FUNKTION TUT
 * --------------------
 * Sie entscheidet, WELCHER DRUCK einer Karte angezeigt und als Proxy
 * gedruckt wird. Eingabe ist ein Kartenname und optional der Druck, aus
 * dem die Turnierliste stammt; heraus kommt genau ein Datensatz oder
 * null. Vier Dinge daran sind eigene Fachlogik:
 *
 *   1. DIE SICHERHEITSREGEL: ein Pokemon wird NIE ueber den Namen gegen
 *      einen gleichnamigen Druck aus einem fremden Set getauscht.
 *      Dhelmise aus M5 hat eine andere Attacke als Dhelmise aus MEG.
 *      Trainer und Energien sind funktionsgleiche Nachdrucke und
 *      duerfen ueber den Namen zusammengelegt werden.
 *   2. DIE SORTIERUNG in vier Stufen: Seltenheit, Set-Reihenfolge,
 *      Regelmarke, Kartennummer.
 *   3. DER 999-FILTER: Drucke ohne Seltenheitsangabe werden vor der
 *      Auswahl verworfen — sie haben oft kaputte Bildadressen — es sei
 *      denn, es bliebe nichts uebrig.
 *   4. DER ZWISCHENSPEICHER, dessen Schluessel Name, Set, Nummer,
 *      globale Vorliebe UND die kartenweise Vorliebe enthaelt.
 *
 * AUSGEFUEHRT, NICHT GEGRIFFEN. Die Funktion wird mit ihrer echten
 * Nachbarschaft (getRarityPriority, normalizeCardName, isBasicEnergy,
 * normalizeSetCode/-CardNumber) aus js/ herausgeschnitten. NUR die
 * beiden Vorratsquellen — getInternationalPrintsForCard und
 * getEnglishCardVersions — sind gesetzt: sie sind die EINGABE dieser
 * Entscheidung, nicht ihr Gegenstand.
 *
 * KEINE LIVEDATEN, KEIN jsdom.
 */

const { describe, it, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WURZEL = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const UTILS = lies('js/app-utils.js');
const CORE = lies('js/app-core.js');
const CITY = lies('js/app-city-league.js');

function funktion(name, quelle) {
    const re = new RegExp(`(^|\\n)\\s*function\\s+${name}\\s*\\(`);
    const m = re.exec(quelle);
    if (!m) throw new Error('Funktion nicht gefunden: ' + name);
    const start = quelle.indexOf('function', m.index);
    let tiefe = 0;
    for (let i = quelle.indexOf('{', start); i < quelle.length; i++) {
        if (quelle[i] === '{') tiefe++;
        else if (quelle[i] === '}') {
            tiefe--;
            if (tiefe === 0) return quelle.slice(start, i + 1);
        }
    }
    throw new Error(name + ': die Klammern gehen nicht auf');
}

const ALIAS = UTILS.match(/const LEGACY_CARD_NAME_ALIASES = (Object\.freeze\(\{[\s\S]*?\}\));/);
if (!ALIAS) throw new Error('LEGACY_CARD_NAME_ALIASES nicht gefunden');

const KETTE = [
    'const LEGACY_CARD_NAME_ALIASES = ' + ALIAS[1] + ';',
    funktion('fixMojibake', UTILS),
    funktion('getLegacyCardNameAlias', UTILS),
    funktion('normalizeCardName', UTILS),
    funktion('isBasicEnergy', UTILS),
    funktion('normalizeSetCode', CITY),
    funktion('normalizeCardNumber', CITY),
    funktion('getGlobalRarityPreference', CORE),
    funktion('getRarityPreference', CORE),
    funktion('getRarityPriority', UTILS),
    funktion('getPreferredVersionForCard', UTILS),
    'const preferredVersionCache = new Map();',
    'function debugVersionSelectionLog() {}',
].join('\n\n');

/**
 * Eine frische Auswahl mit gesetzter Umgebung. `intl` und `eng` sind
 * die beiden Vorratsquellen; alles andere ist echter Code aus js/.
 */
function baueAuswahl(cfg = {}) {
    const fenster = {
        setOrderMap: cfg.setOrderMap || {},
        englishSetCodes: cfg.englishSetCodes || new Set(),
    };
    // eslint-disable-next-line no-new-func
    return new Function(
        'window', 'globalRarityPreference', 'rarityPreferences',
        'getInternationalPrintsForCard', 'getEnglishCardVersions', 'cardsByNameMap',
        KETTE + '\nreturn { waehle: getPreferredVersionForCard, speicher: preferredVersionCache };'
    )(
        fenster,
        Object.prototype.hasOwnProperty.call(cfg, 'global') ? cfg.global : 'min',
        cfg.prefs || {},
        cfg.intl || (() => []),
        cfg.eng || (() => []),
        {}
    );
}

/** Ein Druck, so wie ihn die Kartendatenbank liefert. */
const druck = (set, nummer, seltenheit, art = 'Pokémon') =>
    ({ set, number: nummer, rarity: seltenheit, type: art, image_url: 'bild' });

describe('getPreferredVersionForCard — nichts da, nichts zurueck', () => {
    it('ein leerer Vorrat ergibt null, keinen Wurf', () => {
        const a = baueAuswahl({ eng: () => [] });
        assert.equal(a.waehle('Karte gibt es nicht'), null);
    });

    it('ein leerer oder fehlender Name ergibt null', () => {
        const a = baueAuswahl({ eng: () => [] });
        for (const leer of ['', null, undefined]) {
            assert.equal(a.waehle(leer), null, `${JSON.stringify(leer)} → nicht null`);
        }
    });

    it('ein Pokemon ohne aufloesbaren Druck bleibt ungetauscht (null)', () => {
        // Die Sicherheitsregel im Quelltext: kein Namensraten fuer
        // Pokemon. Es GIBT hier einen gleichnamigen englischen Druck,
        // und er wird bewusst nicht genommen.
        const a = baueAuswahl({ intl: () => [], eng: () => [druck('MEG', '18', 'Common')] });
        assert.equal(a.waehle('Dhelmise', 'M5', '37'), null);
    });
});

describe('getPreferredVersionForCard — min und max', () => {
    const vorrat = () => [
        druck('TEF', '12', 'Common'),
        druck('PAL', '73', 'Double Rare'),
        druck('SSP', '181', 'Special Illustration Rare'),
    ];

    it('min nimmt die niedrigste Seltenheit', () => {
        const a = baueAuswahl({ global: 'min', eng: vorrat });
        assert.equal(a.waehle('Pikachu').set, 'TEF');
    });

    it('max nimmt die hoechste Seltenheit', () => {
        const a = baueAuswahl({ global: 'max', eng: vorrat });
        assert.equal(a.waehle('Pikachu').set, 'SSP');
    });

    it('min und max liefern bei drei Stufen nicht dasselbe', () => {
        const min = baueAuswahl({ global: 'min', eng: vorrat }).waehle('Pikachu');
        const max = baueAuswahl({ global: 'max', eng: vorrat }).waehle('Pikachu');
        assert.notEqual(min.set, max.set,
            'Vorpruefung: der Vorrat muss die beiden Modi ueberhaupt trennen');
    });
});

describe('getPreferredVersionForCard — die vier Sortierstufen', () => {
    it('Stufe 2: bei gleicher Seltenheit gewinnt das NEUERE Set', () => {
        const a = baueAuswahl({
            setOrderMap: { TEF: 10, SSP: 20 },
            eng: () => [druck('TEF', '12', 'Common'), druck('SSP', '8', 'Common')],
        });
        assert.equal(a.waehle('Pikachu').set, 'SSP',
            'SSP hat die hoehere Set-Nummer und muss vorne stehen');
    });

    it('Common und Uncommon sind EINE niedrige Stufe: das neuere Uncommon schlaegt das aeltere Common', () => {
        // Befund 04.10.2026: Energy Retrieval ergab SVI 171 (Common, Regulation G,
        // nicht mehr Standard) statt WHT 82 (Uncommon, neuer).
        const a = baueAuswahl({
            setOrderMap: { SVI: 134, WHT: 149 },
            eng: () => [druck('SVI', '171', 'Common'), druck('WHT', '82', 'Uncommon')],
        });
        assert.equal(a.waehle('Energy Retrieval').set, 'WHT');
    });

    it('die niedrige Stufe schlaegt trotzdem jede hoehere Seltenheit', () => {
        const a = baueAuswahl({
            setOrderMap: { SVI: 134, WHT: 149, CRI: 157 },
            eng: () => [druck('SVI', '171', 'Common'), druck('CRI', '108', 'Rare'), druck('WHT', '82', 'Uncommon')],
        });
        assert.equal(a.waehle('Energy Retrieval').set, 'WHT');
    });

    it('Stufe 3: ohne Set-Reihenfolge entscheidet die Regelmarke', () => {
        // BLK gehoert keiner Marke an (Wert 0), TEF traegt G (Wert 5).
        // Der Kommentar im Quelltext nennt genau dieses Paar.
        const a = baueAuswahl({
            eng: () => [druck('BLK', '45', 'Common'), druck('TEF', '85', 'Common')],
        });
        assert.equal(a.waehle('Pikachu').set, 'TEF');
    });

    it('Stufe 4: im selben Set gewinnt die kleinere Kartennummer', () => {
        const a = baueAuswahl({
            eng: () => [druck('TEF', '85', 'Common'), druck('TEF', '12', 'Common')],
        });
        assert.equal(a.waehle('Pikachu').number, '12');
    });

    it('die Seltenheit schlaegt die Set-Reihenfolge, nicht umgekehrt', () => {
        // Waeren die Stufen vertauscht, kaeme im min-Modus die SAR aus
        // dem neueren Set heraus.
        const a = baueAuswahl({
            setOrderMap: { TEF: 10, SSP: 20 },
            eng: () => [druck('TEF', '12', 'Common'), druck('SSP', '181', 'Special Illustration Rare')],
        });
        assert.equal(a.waehle('Pikachu').rarity, 'Common');
    });
});

describe('getPreferredVersionForCard — der 999-Filter', () => {
    it('ein Druck ohne Seltenheit wird uebergangen', () => {
        // Ohne den Filter waere er im min-Modus der erste (999 ist zwar
        // gross, aber der Filter laeuft nach der Sortierung — der
        // Quelltext nennt das CRITICAL FIX). Geprueft wird das Ergebnis.
        const a = baueAuswahl({
            eng: () => [druck('MEG', '9', ''), druck('TEF', '12', 'Common')],
        });
        const gewaehlt = a.waehle('Pikachu');
        assert.equal(gewaehlt.set, 'TEF');
        assert.notEqual(gewaehlt.rarity, '');
    });

    it('bleibt nach dem Filter nichts uebrig, wird doch gewaehlt', () => {
        // Lieber ein Druck mit fehlender Angabe als gar keine Karte.
        const a = baueAuswahl({
            eng: () => [druck('MEG', '9', ''), druck('SVI', '5', '')],
        });
        const gewaehlt = a.waehle('Pikachu');
        assert.notEqual(gewaehlt, null);
        assert.equal(gewaehlt.rarity, '');
    });

    it('auch im max-Modus wird der Druck ohne Seltenheit nicht gewaehlt', () => {
        const a = baueAuswahl({
            global: 'max',
            eng: () => [druck('MEG', '9', ''), druck('TEF', '12', 'Common')],
        });
        assert.equal(a.waehle('Pikachu').set, 'TEF');
    });
});

describe('getPreferredVersionForCard — die Sicherheitsregel fuer Pokemon', () => {
    it('ein Pokemon behaelt seinen strengen Druckvorrat', () => {
        // Der internationale Vorrat hat keine Seltenheitsangabe. Fuer
        // einen Trainer wuerde jetzt der Namensvorrat gezogen; fuer ein
        // Pokemon bleibt es bei M5 37.
        const a = baueAuswahl({
            intl: () => [druck('M5', '37', '', 'Pokémon')],
            eng: () => [druck('MEG', '18', 'Common')],
        });
        const gewaehlt = a.waehle('Dhelmise', 'M5', '37');
        assert.equal(gewaehlt.set, 'M5');
        assert.equal(gewaehlt.number, '37');
    });

    it('ein Trainer darf ueber den Namen zusammengelegt werden', () => {
        const a = baueAuswahl({
            intl: () => [],
            eng: () => [druck('SVI', '196', 'Common', 'Trainer')],
        });
        const gewaehlt = a.waehle('Ultra Ball', 'XY', '161');
        assert.equal(gewaehlt.set, 'SVI');
    });

    it('bei einem Trainer kommen die englischen Nachdrucke dazu', () => {
        // Aus dem internationalen Vorrat (nur SVI 196, ein Double Rare)
        // und dem Namensvorrat wird ein gemeinsamer Topf. Der Nachdruck
        // BRS 186 ist eine Common und muss im min-Modus gewinnen — er
        // kann das nur, wenn er ueberhaupt im Topf gelandet ist.
        const a = baueAuswahl({
            setOrderMap: { SVI: 10, BRS: 5 },
            intl: () => [druck('SVI', '196', 'Double Rare', 'Item')],
            eng: () => [druck('SVI', '196', 'Double Rare', 'Item'), druck('BRS', '186', 'Common', 'Item')],
        });
        const gewaehlt = a.waehle('Ultra Ball', 'SVI', '196');
        assert.equal(gewaehlt.set, 'BRS', 'der englische Nachdruck muss im Topf sein');
        assert.equal(gewaehlt.number, '186');
    });

    it('bei einem Pokemon aus einem NORMALEN Set kommt nichts dazu', () => {
        // Gegenprobe zum Trainer-Fall darueber, mit derselben Anordnung:
        // der Namensvorrat haelt eine NIEDRIGERE Seltenheit bereit. Waere
        // er im Topf, gewaenne BLK 45; die Sicherheitsregel haelt ihn
        // draussen, und es bleibt beim strengen Druck TEF 85.
        const a = baueAuswahl({
            intl: () => [druck('TEF', '85', 'Double Rare', 'Pokémon')],
            eng: () => [druck('TEF', '85', 'Double Rare'), druck('BLK', '45', 'Common')],
        });
        const gewaehlt = a.waehle('Drilbur', 'TEF', '85');
        assert.equal(gewaehlt.set, 'TEF',
            'BLK darf nicht in den Topf — es waere ein anderes Drilbur');
        assert.equal(gewaehlt.number, '85');
    });

    it('bei einem Pokemon aus einem PROMO-Set kommen Nachdrucke dazu', () => {
        // Ausnahme mit Begruendung im Quelltext: alle Drucke desselben
        // Promos sind identisch.
        const a = baueAuswahl({
            intl: () => [druck('SVP', '50', 'Promo', 'Pokémon')],
            eng: () => [druck('SVP', '50', 'Promo'), druck('TEF', '12', 'Common')],
        });
        assert.equal(a.waehle('Pikachu', 'SVP', '50').set, 'TEF',
            'Common (1) schlaegt Promo (8) im min-Modus');
    });

    it('ohne englischen Druck bleibt das nicht-englische Pokemon stehen', () => {
        const a = baueAuswahl({
            englishSetCodes: new Set(['TEF', 'SVI']),
            intl: () => [druck('M5', '37', 'Common', 'Pokémon')],
            eng: () => [druck('TEF', '99', 'Common')],
        });
        const gewaehlt = a.waehle('Dhelmise', 'M5', '37');
        assert.equal(gewaehlt.set, 'M5',
            'kein Tausch auf ein gleichnamiges englisches Pokemon');
    });

    it('ein nicht-englischer Trainer darf auf den englischen Druck', () => {
        const a = baueAuswahl({
            englishSetCodes: new Set(['TEF', 'SVI']),
            intl: () => [druck('M5', '37', 'Common', 'Trainer'), druck('TEF', '85', 'Common', 'Trainer')],
            eng: () => [],
        });
        assert.equal(a.waehle('Ultra Ball', 'M5', '37').set, 'TEF');
    });
});

describe('getPreferredVersionForCard — Basis-Energien', () => {
    it('im min-Modus wird die SVE-Nummer der Energie erzwungen', () => {
        const a = baueAuswahl({
            eng: () => [
                druck('SVI', '300', 'Common', 'Basic Energy'),
                druck('SVE', '22', 'Common', 'Basic Energy'),
            ],
        });
        const gewaehlt = a.waehle('Fighting Energy');
        assert.equal(gewaehlt.set, 'SVE');
        assert.equal(gewaehlt.number, '22', 'Fighting Energy ist SVE 22');
    });

    it('jede der acht Grundenergien trifft ihre eigene SVE-Nummer', () => {
        const nummern = {
            'Grass Energy': '17', 'Fire Energy': '18', 'Water Energy': '19',
            'Lightning Energy': '20', 'Psychic Energy': '21', 'Fighting Energy': '22',
            'Darkness Energy': '23', 'Metal Energy': '24',
        };
        for (const [name, nr] of Object.entries(nummern)) {
            const a = baueAuswahl({
                eng: () => Object.values(nummern).map(n => druck('SVE', n, 'Common', 'Basic Energy')),
            });
            assert.equal(a.waehle(name).number, nr, `${name} → SVE ${nr} erwartet`);
        }
    });

    it('im max-Modus gilt die SVE-Regel NICHT', () => {
        const a = baueAuswahl({
            global: 'max',
            eng: () => [
                druck('SVE', '22', 'Common', 'Basic Energy'),
                druck('SVI', '300', 'Ultra Rare', 'Basic Energy'),
            ],
        });
        assert.equal(a.waehle('Fighting Energy').set, 'SVI');
    });
});

describe('getPreferredVersionForCard — der Zwischenspeicher', () => {
    it('derselbe Aufruf fragt den Vorrat nur einmal', () => {
        let aufrufe = 0;
        const a = baueAuswahl({
            eng: () => { aufrufe++; return [druck('TEF', '12', 'Common')]; },
        });
        const erst = a.waehle('Pikachu');
        const zweit = a.waehle('Pikachu');
        assert.equal(aufrufe, 1, 'der zweite Aufruf muss aus dem Speicher kommen');
        assert.equal(erst, zweit, 'und dasselbe Objekt liefern');
        assert.equal(a.speicher.size, 1);
    });

    it('auch ein null-Ergebnis wird gemerkt', () => {
        let aufrufe = 0;
        const a = baueAuswahl({ eng: () => { aufrufe++; return []; } });
        assert.equal(a.waehle('Nix'), null);
        assert.equal(a.waehle('Nix'), null);
        assert.equal(aufrufe, 1);
        assert.equal(a.speicher.size, 1);
    });

    it('verschiedene Drucke derselben Karte bekommen eigene Eintraege', () => {
        const a = baueAuswahl({
            intl: (s, n) => [druck(s, n, 'Common', 'Trainer')],
            eng: () => [],
        });
        a.waehle('Ultra Ball', 'SVI', '196');
        a.waehle('Ultra Ball', 'BRS', '186');
        assert.equal(a.speicher.size, 2,
            'Set und Nummer gehoeren in den Schluessel, sonst liefert der Speicher '
            + 'den Druck der zuerst gefragten Zeile');
    });
});

/* BEFUND vom 07.09.2026 — BEHOBEN am 07.09.2026.
 *
 * DIE KARTENWEISE VORLIEBE WIRKTE NICHT.
 *
 * js/app-cards-db.js:4722, :4828, :4923 und js/app-deck-builder.js:600,
 * :811 rufen setRarityPreference(name, {mode:'specific', set, number}),
 * wenn der Nutzer im Seltenheitswaehler einen bestimmten Druck
 * auswaehlt. Gelesen wird das ausschliesslich in
 * getPreferredVersionForCard (js/app-utils.js).
 *
 * Dort stand der Zweig, der die Vorliebe auswertet, HINTER dem globalen,
 * und globalPref kommt aus getGlobalRarityPreference() (js/app-core.js),
 * das `globalRarityPreference || 'min'` liefert — nie etwas anderes als
 * 'min'/'max'. Der globale Zweig kehrte also immer vorher zurueck.
 *
 *   Eingabe (gemessen):  "Pikachu", Vorrat [TEF 12 Common, SSP 181 SAR],
 *                        prefs {Pikachu:{mode:'specific',set:'SSP',number:'181'}},
 *                        globalRarityPreference = null
 *   vorher:              TEF 12
 *   jetzt:               SSP 181
 *
 * BEHEBUNG: js/app-utils.js wertet die kartenweise 'specific'-Vorliebe
 * jetzt direkt nach der Vorratsbeschaffung aus, VOR der Basis-Energie-
 * Sonderregel und vor der globalen Vorliebe. Karten ohne eigene
 * Einstellung (pref === null) laufen unveraendert weiter. Ist der
 * gewaehlte Druck nicht im Vorrat, faellt es auf die globale Vorliebe
 * zurueck statt null zu liefern.
 *
 * Der Zwischenspeicher traegt die Vorliebe bereits im Schluessel
 * (prefSignature) — jetzt, wo sie wirkt, ist das keine Zierde mehr.
 * Geprueft in tests/unit/test-f1-rarity-preference-cache.js. */
test('die kartenweise Vorliebe "specific" gewinnt gegen die globale', () => {
    const a = baueAuswahl({
        global: null,
        prefs: { Pikachu: { mode: 'specific', set: 'SSP', number: '181' } },
        eng: () => [druck('TEF', '12', 'Common'), druck('SSP', '181', 'Special Illustration Rare')],
    });
    const gewaehlt = a.waehle('Pikachu');
    assert.equal(gewaehlt.set, 'SSP');
    assert.equal(gewaehlt.number, '181');
});
