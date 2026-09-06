/**
 * DREI STELLEN, AN DENEN DIE SEITE DEN LESER IN DIE IRRE FÜHRTE.
 *
 * Alle drei aus dem Durchgang von Agententeam B (06.09.2026), das die
 * Seite als SPIELER benutzt hat: Mega Excadrill, Tag 2 erreichen,
 * Turnier in drei Wochen.
 *
 * 1. TECH-IDEEN. Der Baustein zeigte genau einen Gegner — Toucannon,
 *    2,55 % des Online-Feldes, bei Worlds zwei Spieler. Nicht gezeigt:
 *
 *        Alakazam Dudunsparce   25,6 %   743 Partien   5,79 % des Feldes
 *        Slowking               37,3 %   811 Partien   5,53 %
 *        Dragapult Blaziken     38,7 %   833 Partien   5,76 %
 *
 *    Zusammen 17,1 % des Feldes, zwei von drei Partien verloren. Alle
 *    drei erfüllen beide Schwellen des Moduls. Der ehrliche Satz dafür
 *    existierte — er wurde nur gezeigt, wenn das Ergebnis GANZ leer war.
 *    Toucannon hat ihn unterdrückt: die Warnung verschwand genau dann,
 *    wenn sie gebraucht wurde.
 *
 * 2. ANTI-TECH. Für Alakazam Dudunsparce — mit 7,8 % das relevanteste
 *    Ziel im Feld — riet der deutsche Text, "ein meta-relevanteres
 *    Target" zu wählen. Der wahre Grund: data/active_threats.json führt
 *    diesen Archetyp nicht. Der englische Rückfall im Quelltext nannte
 *    die Datei, die ausgelieferten Fassungen nicht.
 *
 * 3. "TYPISCHER BUILD" AUS EINER LISTE. Unter der Überschrift stand
 *    "1 Decks" — fester Plural, und eine einzelne Liste als Aggregat
 *    ausgegeben.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { describe, it } = require('node:test');

const WURZEL = path.join(__dirname, '..', '..');
const lies = (...p) => fs.readFileSync(path.join(WURZEL, ...p), 'utf8');
const IDEEN = lies('js', 'tech-ideen.js');
const BAU   = lies('js', 'app-deck-builder.js');
const ANTI  = lies('js', 'app-anti-tech.js');
const QREF  = lies('js', 'current-meta-quickref.js');
const I18N  = lies('js', 'i18n.js');
const CSS   = lies('css', 'ui-components.css');

describe('Tech-Ideen: was NICHT gefunden wurde, wird benannt', () => {

    it('das Modul liefert die Lücke mit', () => {
        assert.match(IDEEN, /ohneIdee: alleSchlechten/,
            'ideen() gibt die Gegner ohne Vorschlag nicht zurück');
        assert.match(IDEEN, /var alleSchlechten = _schlechteGegner\(daten, archetyp\);/,
            'die ungekappte Liste der schlechten Matchups wird nicht gemerkt');
    });

    it('jeder frühe Ausstieg liefert das Feld ebenfalls', () => {
        /* Sonst ist `ohneIdee` mal ein Array und mal undefined, und die
           Anzeige muss raten. */
        const rueckgaben = IDEEN.match(/\{ stand: STAND, gegner: \[\][^}]*\}/g) || [];
        assert.ok(rueckgaben.length >= 3, `nur ${rueckgaben.length} leere Rückgaben gefunden`);
        for (const r of rueckgaben) {
            assert.ok(/ohneIdee: \[\]/.test(r), `Rückgabe ohne ohneIdee: ${r}`);
        }
    });

    it('die Lücke wird auch dann gezeigt, wenn Ideen gefunden wurden', () => {
        /* DER KERN DES BEFUNDS. Vorher hing der Satz am komplett leeren
           Ergebnis. */
        assert.match(BAU, /const _maleLuecke = \(\) => \{/, '_maleLuecke fehlt');
        const nachSchleife = BAU.indexOf('_maleLuecke();');
        const leerZweig    = BAU.indexOf("t('buildInfo.techIdeenLeer')");
        assert.ok(nachSchleife > leerZweig,
            'der Aufruf steht nicht hinter dem Zweig für gefundene Ideen — '
            + 'dann greift er wieder nur beim leeren Ergebnis');
    });

    it('die Lücke nennt Deck, Quote und Partienzahl', () => {
        assert.match(I18N, /'buildInfo\.techIdeenOhneEintrag':\s*'\{name\} \(\{wr\}, \{n\} games\)'/,
            'der englische Eintrag nennt nicht alle drei Angaben');
        assert.match(I18N, /'buildInfo\.techIdeenOhneEintrag':\s*'\{name\} \(\{wr\}, \{n\} Partien\)'/,
            'der deutsche Eintrag nennt nicht alle drei Angaben');
        for (const k of ['buildInfo.techIdeenOhne', 'buildInfo.techIdeenOhneEintrag']) {
            const n = (I18N.match(new RegExp("'" + k.replace(/\./g, '\\.') + "'", 'g')) || []).length;
            assert.strictEqual(n, 2, `${k} steht ${n}-mal statt zweimal`);
        }
    });

    it('die Lücke nennt auch den Stand der Regelbasis', () => {
        /* "Nichts gefunden" und "nichts gesucht" sind zwei Aussagen.
           Fünf Paarungen aus dem Mai sind der Unterschied. */
        assert.match(BAU, /\.replace\('\{n\}', stand\.interaktionen\)[\s\S]{0,120}techIdeenOhne|techIdeenOhne[\s\S]{0,200}\.replace\('\{n\}', stand\.interaktionen\)/,
            'der Satz nennt die Zahl der Paarungen nicht');
        assert.match(BAU, /if \(!_ohne\.length \|\| !stand \|\| !stand\.interaktionen\) return;/,
            'ohne bekannten Datenstand darf die Lücke nicht behauptet werden');
    });

    it('die Lücke setzt sich sichtbar von den Vorschlägen ab', () => {
        assert.match(BAU, /build-info-tech-luecke/, 'die Klasse wird nicht vergeben');
        assert.match(CSS, /\.build-info-tech-luecke \{/, 'die Klasse hat keine Gestalt');
    });

    it('höchstens fünf Gegner werden aufgezählt', () => {
        /* Eine Liste aus zwanzig Namen liest niemand. */
        assert.match(BAU, /_ohne\.slice\(0, 5\)/, 'die Aufzählung ist nicht gekappt');
    });
});

describe('Anti-Tech: der Text nennt die Ursache statt den Leser zu tadeln', () => {

    it('der Rat, ein "relevanteres Target" zu wählen, ist weg', () => {
        /* Geprüft werden die ausgelieferten ZEICHENKETTEN, nicht die
           Kommentare — der Befund gehört wörtlich in den Quelltext,
           damit niemand den Satz versehentlich wiederherstellt. */
        const werte = [...I18N.matchAll(/'antiTech\.cardsEmpty':\s*'([^']*)'/g)].map(m => m[1]);
        assert.strictEqual(werte.length, 2,
            `antiTech.cardsEmpty steht ${werte.length}-mal statt zweimal`);
        for (const w of werte) {
            assert.ok(!/relevanteres Target/i.test(w) && !/meta-relevant target/i.test(w),
                `der Text schiebt die Lücke weiter dem Leser zu: ${w}`);
        }
        assert.ok(!/more meta-relevant target/i.test(ANTI),
            'der Rückfall im Quelltext trägt den alten Satz noch');
    });

    it('beide Fassungen nennen die Datei', () => {
        const treffer = (I18N.match(/active_threats\.json/g) || []).length;
        assert.ok(treffer >= 2,
            `active_threats.json wird nur ${treffer}-mal genannt — erwartet in beiden Sprachen`);
        assert.match(ANTI, /active_threats\.json does not list them/,
            'der Rückfall nennt die Ursache nicht');
    });
});

describe('"Typischer Build" behauptet kein Aggregat bei einer Liste', () => {

    it('der feste Plural ist weg', () => {
        assert.ok(!/\$\{ref\.total_decks_in_archetype \|\| 0\} Decks/.test(QREF),
            '"1 Decks" steht noch da — und "0 Decks" wäre ein typischer Build aus nichts');
    });

    it('bei genau einer Liste wird das gesagt', () => {
        assert.match(QREF, /_n === 1/, 'der Einzelfall wird nicht unterschieden');
        assert.match(I18N, /'cm\.quickRefEineListe':\s*'eine einzelne Liste — kein Aggregat'/,
            'der deutsche Satz fehlt');
        assert.match(I18N, /'cm\.quickRefEineListe':\s*'a single list — not an aggregate'/,
            'der englische Satz fehlt');
    });

    it('eine fehlende Angabe wird nicht zu einer Null', () => {
        assert.match(QREF, /const _n = Number\.isFinite\(_nRoh\) && _nRoh > 0 \? _nRoh : null;/,
            'eine fehlende Listenzahl fällt wieder auf 0 zurück');
        assert.match(I18N, /'cm\.quickRefListenUnbekannt'/, 'der Text für den unbekannten Fall fehlt');
    });

    it('die Zeile wird wirklich gebaut — mit echten Werten geprüft', () => {
        const anfang = QREF.indexOf('const _nRoh = Number(ref.total_decks_in_archetype);');
        assert.ok(anfang >= 0, 'die Stelle wurde nicht gefunden');
        const ende = QREF.indexOf('return `', anfang);
        const stueck = QREF.slice(anfang, ende);
        const bauen = new Function('ref', '_tt', stueck + ' return _decksLbl;');
        const _tt = (k, f) => ({
            'cm.quickRefListen': 'Listen',
            'cm.quickRefEineListe': 'eine einzelne Liste — kein Aggregat',
            'cm.quickRefListenUnbekannt': 'Listenzahl unbekannt',
        }[k] || f);
        assert.strictEqual(bauen({ total_decks_in_archetype: 1 }, _tt),
            'eine einzelne Liste — kein Aggregat');
        assert.strictEqual(bauen({ total_decks_in_archetype: 28 }, _tt), '28 Listen');
        assert.strictEqual(bauen({ total_decks_in_archetype: 0 }, _tt), 'Listenzahl unbekannt');
        assert.strictEqual(bauen({}, _tt), 'Listenzahl unbekannt');
    });
});
