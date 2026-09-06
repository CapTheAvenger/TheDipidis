/**
 * NACH DEM BAU MUSS DER VERGLEICH DASTEHEN
 *
 * BEFUND (06.09.2026, live auf thedipidis.app nachgemessen). Nach
 * einem Consistency Generate stand im Block "Dein Build vs Vanilla"
 * weiterhin "Kein Deck geladen" — obwohl `_userDeckCardNames()` 21
 * Namen fand und `window.currentMetaDeck` gefüllt war. Ein Aufruf von
 * Hand (`window.refreshUserVsVanillaPanel()`) malte den Block sofort
 * richtig: 46,5 % / 48,0 % / +1,5 pts.
 *
 * Die Ursache war kein Wettlauf, sondern ein `return`. Der Y.2-Pfad
 * (MostConsistencyBuilder) kehrt in `autoCompleteConsistency` zurück,
 * BEVOR der Abschlussblock der Legacy-Stufen läuft — und genau dieser
 * Block schreibt den Vanilla-Schnappschuss und stößt den Vergleich an.
 * Messbar daran, dass `window.lastVanillaDeck` nach einem geglückten
 * Bau `undefined` war. Folge im zweiten Block: der Karten-Diff sagte
 * dauerhaft "erst Consistency Generate laufen lassen" — direkt NACH
 * dem Generate.
 *
 * Was hier bewacht wird, und zwar RECHNEND statt suchend:
 *
 *  1. Der Y.2-Schnappschuss erzeugt dieselbe Grundlinie wie der
 *     Legacy-Block. Beide Fassungen stehen im Quelltext doppelt (mit
 *     Begründung); diese Zusicherung ist der Grund, warum das
 *     vertretbar ist — sie zieht BEIDE heraus und lässt sie über
 *     denselben Eingaben laufen.
 *  2. Ein Tech-Bau überschreibt den Vanilla-Eimer nicht.
 *  3. Der Vergleichsblock wird angestoßen.
 *  4. Der Generationszähler im Vergleichsblock verhindert, dass ein
 *     älterer, langsamerer Lauf über einen jüngeren schreibt.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { describe, it } = require('node:test');

const WURZEL = path.join(__dirname, '..', '..');
const lies = (...p) => fs.readFileSync(path.join(WURZEL, ...p), 'utf8');
const BAUER   = lies('js', 'app-deck-builder.js');
const ANALYSE = lies('js', 'app-current-meta-analysis.js');

/* Zieht den Rumpf einer Funktion aus dem Quelltext, an der Klammer
   gezählt statt an der Einrückung geraten. */
function rumpf(quelle, kopf) {
    const start = quelle.indexOf(kopf);
    assert.ok(start >= 0, `Funktion nicht gefunden: ${kopf}`);
    let i = quelle.indexOf('{', start), tiefe = 0;
    assert.ok(i >= 0, `keine öffnende Klammer nach ${kopf}`);
    for (let j = i; j < quelle.length; j++) {
        const c = quelle[j];
        if (c === '{') tiefe++;
        else if (c === '}') {
            tiefe--;
            if (tiefe === 0) return quelle.slice(i + 1, j);
        }
    }
    throw new Error(`unbalancierte Klammern in ${kopf}`);
}

/* Baut den Y.2-Schnappschuss aus dem echten Quelltext als aufrufbare
   Funktion. Alles, was er von außen braucht, wird hereingereicht. */
function ladeSchnappschuss(welt) {
    const koerper = rumpf(BAUER, 'function _schnappBauSchnappschuss(source, antiTechTarget)');
    const f = new Function('source', 'antiTechTarget', 'window', 'getTechSlotNames', koerper);
    return (source, ziel) => f(source, ziel, welt, welt.getTechSlotNames);
}

/* Dieselbe Rechnung aus dem Legacy-Block — nur der Teil, der die
   Grundlinie bildet. Er steht dort inmitten von Ortsvariablen, also
   wird er hier ueber seinen Wortlaut gegriffen und nachgebildet;
   stimmt der Wortlaut nicht mehr, faellt die Zusicherung auf. */
function legacyGrundlinie(deck) {
    const stueck = BAUER.slice(
        BAUER.indexOf('const baseline = {};'),
        BAUER.indexOf('baseline.__archetype'));
    assert.ok(stueck.includes('Object.entries(generatedDeck)'),
        'der Legacy-Schnappschuss sieht anders aus als erwartet');
    const f = new Function('generatedDeck', stueck + ' return baseline;');
    return f(deck);
}

const DECK = {
    'Excadrill (PBL 12)': 3,
    'Drilbur (PBL 11)': 3,
    'Hero’s Cape (TEF 152)': 1,
    'Iono (PAL 185)': 4,
    'Basic Metal Energy': 8
};

function welt() {
    return {
        currentMetaDeck: { ...DECK },
        cityLeagueDeck: null,
        pastMetaDeck: null,
        lastConsistencyBuild: {
            currentMeta: {
                archetype: 'Mega Excadrill',
                cards: [
                    { card_name: 'Excadrill', consistency_score: 90 },
                    { card_name: 'Drilbur', consistency_score: 88 },
                    { card_name: 'Hero’s Cape', consistency_score: 85 },
                    { card_name: 'Iono', consistency_score: 70 }
                ]
            }
        },
        getTechSlotNames: () => [],
        refreshUserVsVanillaPanel: null,
        refreshTechVsNormalPanel: null
    };
}

describe('Y.2-Bau schreibt Schnappschuss und stößt den Vergleich an', () => {

    it('erzeugt dieselbe Grundlinie wie der Legacy-Block', () => {
        const w = welt();
        ladeSchnappschuss(w)('currentMeta', null);
        const meins = w.lastVanillaDeck.currentMeta;
        const legacy = legacyGrundlinie({ ...DECK });

        /* Die Kartenzeilen müssen deckungsgleich sein — die
           `__`-Felder setzt der Legacy-Block danach. */
        const nurKarten = (o) => Object.fromEntries(
            Object.entries(o).filter(([k]) => !k.startsWith('__')));
        assert.deepStrictEqual(nurKarten(meins), nurKarten(legacy),
            'Y.2 und Legacy erzeugen unterschiedliche Grundlinien');

        /* Und die Zusammenführung auf den Namen muss wirklich
           passieren — das ist der Punkt der ganzen Übung. */
        assert.strictEqual(meins['Excadrill'], 3, 'die Set-Klammer wurde nicht abgeschnitten');
        assert.strictEqual(meins['Basic Metal Energy'], 8,
            'ein Name ohne Set-Klammer ging verloren');
        assert.ok(!('Excadrill (PBL 12)' in meins), 'der rohe Schlüssel steht noch drin');
    });

    it('rechnet die Gesamtpunktzahl aus dem Bericht, nicht aus der Luft', () => {
        const w = welt();
        ladeSchnappschuss(w)('currentMeta', null);
        // 3×90 + 3×88 + 1×85 + 4×70 = 270 + 264 + 85 + 280 = 899
        // Basic Metal Energy steht nicht im Bericht → 0 Punkte.
        assert.strictEqual(w.lastVanillaDeck.currentMeta.__totalConsistencyScore, 899,
            'die Punktzahl stimmt nicht mit dem Bericht überein');
        assert.strictEqual(w.lastVanillaDeck.currentMeta.__archetype, 'Mega Excadrill',
            'der Archetyp kommt nicht aus dem Bericht');
    });

    it('erfindet keine Null, wenn der Bericht fehlt', () => {
        /* Eine Null im Vergleichsblock ist eine Aussage ("dieses Deck
           hat null Punkte"), kein fehlender Wert. */
        const w = welt();
        w.lastConsistencyBuild = {};
        ladeSchnappschuss(w)('currentMeta', null);
        assert.ok(!('__totalConsistencyScore' in w.lastVanillaDeck.currentMeta),
            'ohne Bericht wird eine erfundene Punktzahl geschrieben');
    });

    it('ein Tech-Bau überschreibt den Vanilla-Eimer nicht', () => {
        /* Der Vanilla-Eimer IST die Grundlinie, gegen die verglichen
           wird. Ihn mit einem Tech-Bau zu überschreiben löscht genau
           das, was der Nutzer sehen will. */
        for (const [ziel, slots] of [['Toucannon', []], [null, ['Iron Crown ex']]]) {
            const w = welt();
            w.getTechSlotNames = () => slots;
            ladeSchnappschuss(w)('currentMeta', ziel);
            assert.ok(!w.lastVanillaDeck,
                `Tech-Bau (Ziel ${ziel}, Slots ${slots.length}) hat den Vanilla-Eimer beschrieben`);
            assert.ok(w.lastTechDeck && w.lastTechDeck.currentMeta,
                'der Tech-Eimer blieb leer');
            assert.strictEqual(w.lastTechDeck.currentMeta.__wasTechBuild, true,
                'der Bau ist nicht als Tech-Bau markiert');
        }

        const w = welt();
        ladeSchnappschuss(w)('currentMeta', null);
        assert.ok(w.lastVanillaDeck && w.lastVanillaDeck.currentMeta,
            'ein Bau ohne Tech-Ziel landete nicht im Vanilla-Eimer');
        assert.ok(!w.lastTechDeck, 'ein Vanilla-Bau hat den Tech-Eimer beschrieben');
    });

    it('stößt den Vergleichsblock an — genau darum ging es', () => {
        const w = welt();
        let uvv = 0, tvn = 0;
        w.refreshUserVsVanillaPanel = () => { uvv++; };
        w.refreshTechVsNormalPanel  = () => { tvn++; };
        ladeSchnappschuss(w)('currentMeta', null);
        assert.strictEqual(uvv, 1, 'der Vergleichsblock wurde nicht angestoßen');
        assert.strictEqual(tvn, 1, 'der Tech-vs-Normal-Block wurde nicht angestoßen');

        /* Und ein Ausfall dort darf den Bau nicht mitreißen. */
        const w2 = welt();
        w2.refreshUserVsVanillaPanel = () => { throw new Error('kaputt'); };
        assert.doesNotThrow(() => ladeSchnappschuss(w2)('currentMeta', null),
            'ein Fehler im Panel reißt den Schnappschuss mit');
        assert.ok(w2.lastVanillaDeck.currentMeta, 'der Schnappschuss ging dabei verloren');
    });

    it('nur currentMeta stößt den Vergleichsblock an', () => {
        /* Den Block gibt es nur auf dem Reiter "Aktuelles Meta". */
        const w = welt();
        w.pastMetaDeck = { ...DECK };
        let uvv = 0;
        w.refreshUserVsVanillaPanel = () => { uvv++; };
        ladeSchnappschuss(w)('pastMeta', null);
        assert.strictEqual(uvv, 0, 'ein Bau auf pastMeta stößt den currentMeta-Block an');
        assert.ok(w.lastVanillaDeck.pastMeta, 'der Schnappschuss für pastMeta fehlt');
    });

    it('das return im Y.2-Pfad ruft den Schnappschuss auf', () => {
        /* Ohne diesen Aufruf ist die ganze Funktion darüber tot. */
        const stelle = BAUER.slice(
            BAUER.indexOf('Phase Y.2 (MostConsistencyBuilder) used'),
            BAUER.indexOf('Phase Y.2 declined'));
        assert.match(stelle, /_schnappBauSchnappschuss\(source, _antiTechTarget\)/,
            'der Y.2-Pfad kehrt weiterhin zurück, ohne den Schnappschuss zu schreiben');
        /* Am `return;` gemessen, nicht am Wort "return" — der
           Kommentar darüber erklärt genau dieses `return` und enthält
           es deshalb als Wort. */
        assert.ok(stelle.indexOf('_schnappBauSchnappschuss') < stelle.indexOf('return;'),
            'der Schnappschuss steht hinter dem return und läuft nie');
    });
});

describe('Der Vergleichsblock lässt sich nicht überholen', () => {

    it('ein älterer, langsamerer Lauf schreibt nicht über einen jüngeren', async () => {
        /* Der Block wartet zweimal (Bedrohungsdatei, Motorläufe) und
           wird bei jeder Deckmutation angestoßen. Ohne Zähler gilt
           "wer zuletzt fertig wird, schreibt" — und das kann ein Lauf
           sein, der sein Deck vor drei Sekunden eingefroren hat.

           Nachgestellt wird der Zähler aus dem Quelltext, damit die
           Zusicherung die echte Fassung prüft und nicht meine
           Beschreibung davon. */
        assert.match(ANALYSE, /let _uvvLauf = 0;/, 'der Generationszähler fehlt');
        assert.match(ANALYSE, /const meinLauf = \+\+_uvvLauf;/,
            'kein Lauf zieht eine Nummer');
        assert.match(ANALYSE, /const ueberholt = \(\) => meinLauf !== _uvvLauf;/,
            'die Überholprüfung fehlt');

        /* Beide Wartestellen müssen geprüft werden — eine ungeprüfte
           reicht, damit ein alter Lauf durchkommt. */
        const nachThreats = ANALYSE.slice(ANALYSE.indexOf('const intel = await _loadActiveThreats();'));
        assert.match(nachThreats.slice(0, 200), /if \(ueberholt\(\)\) return;/,
            'nach dem Laden der Bedrohungsdatei wird nicht geprüft');
        const nachMotor = ANALYSE.slice(ANALYSE.indexOf('const capabilityData = await _computeCapabilityBonuses(paired);'));
        assert.match(nachMotor.slice(0, 200), /if \(ueberholt\(\)\) return;/,
            'nach den Motorläufen wird nicht geprüft');

        /* Und jetzt die Ordnungseigenschaft selbst durchspielen: zwei
           Läufe, der ältere wird ABSICHTLICH später fertig. */
        let zaehler = 0;
        const gemalt = [];
        const lauf = async (name, wartezeit) => {
            const meinLauf = ++zaehler;
            const ueberholt = () => meinLauf !== zaehler;
            await new Promise(r => setTimeout(r, wartezeit));
            if (ueberholt()) return;
            gemalt.push(name);
        };
        await Promise.all([lauf('alt', 40), lauf('neu', 5)]);
        assert.deepStrictEqual(gemalt, ['neu'],
            `gemalt wurde ${JSON.stringify(gemalt)} — der alte Lauf kam durch`);
    });
});
