'use strict';
/*
 * Die Inventur der 23 Predictor-Stufen — was noch trägt, was nur so aussieht.
 *
 * ANLASS (01.09.2026)
 * -------------------
 * Der Hype-Damper hatte gezeigt, wie eine Stufe jahrelang aussehen kann, als
 * arbeite sie: sie loggte, sie hatte Konstanten, sie hatte einen Kommentar mit
 * Begründung — und sie hatte nie ausgelöst. Danach wurden alle 23 Stufen
 * ausgezählt. Zwei weitere derselben Sorte kamen dabei heraus, dazu drei
 * Prüfspuren, die etwas anderes meldeten als die Wirklichkeit.
 *
 * 1  PREDICTOR 4.0a / 4.5 — METyA-DYNAMIK ERREICHT DIE PROGNOSE NICHT
 *
 *    `metaDynBoostPp` steht ausschließlich in den vier Summanden des
 *    Modus-B-RÜCKFALLZWEIGS. Seit dem 28.08. überspringt
 *    `predicted = _kernWert` diesen Zweig für jedes Deck, das der
 *    Prognosekern kennt — und Phase α verwirft genau die Decks, die er
 *    nicht kennt. Beide Mengen werden in derselben Schleife befüllt.
 *
 *    Gemessen am 01.09.: 134 Ladder-Decks, 44 nach Phase α, davon 44 mit
 *    Kernwert. Gelieferter Beitrag: 0,00 pp. In Modus A kommt der Term in
 *    keinem Zweig vor. Die Konsole meldete trotzdem "Surge decks" mit
 *    Prozentzahlen.
 *
 * 2  PREDICTOR 6.1 — LIVE-SHARE-BODEN IST STRUKTURELL TOT
 *
 *    Das Tor verlangt `currentTotal < lmShare × 0,50` — die Prognose einer
 *    Familie muss unter die Hälfte ihres letzten Major-Anteils gefallen
 *    sein. Seit dem 28.08. IST `predicted` aber der Prognosekern, dessen
 *    Anker genau diese Major-Anteile sind. Die Bedingung vergleicht die
 *    Größe mit sich selbst.
 *
 *    Über 122 Familien-Epochen ausgezählt: null Auslösungen. Minimum des
 *    Verhältnisses 0,60, Median 0,97.
 *
 * 3  DREI PRÜFSPUREN, DIE LOGEN
 *
 *    a) Die Konzentrations-Telemetrie meldete JEDES Deck als "gesoftet".
 *       Der Exponent steht seit dem 23.08. konstant auf 1,00 — und 1,00
 *       ist kleiner als die Schwelle 1,49.
 *    b) Predictor 5.4 (Wachstums-Schub) lief ohne jede Meldung, als
 *       Einziger der wirksamen Stufen. Am 01.09. hob er 12 von 43 Decks
 *       an, bis +3,33 pp. Beim Auszählen stand er deshalb fälschlich auf
 *       der Liste der stummen.
 *    c) `_day2Q.n === 2` ist exakte Gleichheit auf einer Gleitkommasumme.
 *       Über 379 Deck-Epochen nie getroffen — der mittlere Vertrauensgrad
 *       0,80 war unerreichbar.
 *
 * Was hier NICHT geprüft wird, weil es bewusst nicht geändert wurde: der
 * Einheitenfehler an `n` (vier gesperrte Tore) und die Doppelung
 * 5.3 → 5.7. Beides ist im Code mit der Messung dokumentiert und wartet
 * auf das zweite TEF-PBL-Major. Siehe dort.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..', '..');
const quelle = fs.readFileSync(path.join(wurzel, 'js', 'app-meta-call.js'), 'utf8');
const ohneKomm = quelle
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

describe('Stillgelegte Stufen — abgeschaltet, aber nicht gelöscht', () => {

    for (const [name, schalter] of [
        ['Meta-Dynamik (4.0a / 4.5)',     'META_DYN_AKTIV'],
        ['Live-Share-Boden (6.1)',        'LIVE_SHARE_FLOOR_AKTIV'],
        ['Hype-Damper (5.2)',             'HYPE_DAMPER_AKTIV'],
        // Zweite Runde, 03.09.2026 — jede einzeln durchgemessen, indem
        // der Motor je Stufe zweimal ueber denselben Datenstand lief
        // (Modus B, 43 Decks) und predictedShare je Deck verglichen wurde.
        ['Counter-Adoption-Boost (4.7b)', 'ADOPTION_BOOST_AKTIV'],
        ['Qualitaetsboden (5.2a)',        'QUALITY_FLOOR_AKTIV'],
        ['Tier-1-Konvergenz (6.0)',       'TIER1_AKTIV'],
    ]) {
        it(`${name} ist abgeschaltet`, () => {
            const re = new RegExp(schalter + '\\s*=\\s*false');
            assert.ok(re.test(ohneKomm),
                `${name} läuft wieder — nachgemessen liefert die Stufe nichts`);
        });

        it(`${name}: der Schalter wird auch abgefragt`, () => {
            // Ein Schalter, den niemand liest, ist Dekoration.
            const stellen = ohneKomm.split(schalter).length - 1;
            assert.ok(stellen >= 2,
                `${schalter} steht nur ${stellen}× im Code — gesetzt, aber nicht abgefragt`);
        });
    }

    it('die Begründungen bleiben im Code stehen', () => {
        // Wer den toten Code löscht, löscht die Messung mit, die belegt,
        // warum er tot ist — und baut ihn beim nächsten Mal neu.
        for (const beleg of ['0,00 pp', '122 Familien-Epochen', 'deckunabhaengig konstant']) {
            assert.ok(quelle.includes(beleg),
                `der Beleg "${beleg}" ist aus dem Code verschwunden`);
        }
    });

    it('die Messungen der zweiten Runde stehen bei ihrer Stufe', () => {
        // Eine Stilllegung ohne Zahl daneben ist eine Meinung. Jede der
        // drei am 03.09.2026 abgeschalteten Stufen muss ihre eigene
        // Messung im Kommentar tragen — und zwar IN IHREM Block, nicht
        // irgendwo in der Datei.
        const belege = [
            ['const ADOPTION_BOOST_AKTIV', '0,000 pp'],
            ['const QUALITY_FLOOR_AKTIV',  '0,9118'],
            ['const TIER1_AKTIV',          '333'],
        ];
        for (const [marke, zahl] of belege) {
            const i = quelle.indexOf(marke);
            assert.ok(i > 0, `${marke} ist verschwunden`);
            // Der Kommentarblock steht VOR der Konstante.
            const block = quelle.slice(Math.max(0, i - 2600), i);
            assert.ok(block.includes(zahl),
                `bei ${marke} fehlt die gemessene Zahl "${zahl}" — ohne sie `
                + 'ist die Stilllegung nicht nachprüfbar');
            assert.ok(/STILLGELEGT 03\.09\.2026/.test(block),
                `bei ${marke} fehlt der datierte Stilllegungsvermerk`);
        }
    });

    it('auch die zweite Runde hat nur stillgelegt, nicht gelöscht', () => {
        for (const marke of ['_computeCounterAdoptionBoost', 'QUALITY_FLOOR_RATIO_MIN',
                             'TIER1_MIN_DAY1_PILOTS', 'famConvProjection']) {
            assert.ok(quelle.includes(marke), `${marke} wurde gelöscht statt stillgelegt`);
        }
    });

    it('der Tier-1-Schalter räumt seine Marken am Deck auf', () => {
        // Ein Schalter, der `_tier1Eligible` aus einem früheren Lauf am
        // Deck stehen lässt, schaltet nichts ab: der Familienboden weiter
        // unten sucht genau nach dieser Marke.
        const i = ohneKomm.indexOf('if (!TIER1_AKTIV)');
        assert.ok(i > 0, 'das TIER1_AKTIV-Tor ist verschwunden');
        const block = ohneKomm.slice(i, i + 400);
        for (const feld of ['_tier1Eligible', '_tier1Diag', '_tier1ConvProjection']) {
            assert.ok(block.includes(feld),
                `der abgeschaltete Zweig setzt ${feld} nicht zurück`);
        }
    });
});

describe('Die Wache auf den Prognosekern', () => {

    // BEFUND (03.09.2026): in Modus B gilt `predicted = _kernWert`, und
    // der Kern kennt 43 von 43 Decks. Fünf nummerierte Stufen (3.0, 4.2,
    // 4.4, 4.4b, 5.0) leben ausschließlich im Rückfallzweig darunter und
    // erreichen deshalb nichts — gemessen 0,000 pp. Im künstlich
    // erzwungenen Rückfall verschieben sie sehr wohl etwas (3.0 bis
    // 1,074 pp, 4.4b bis 1,453 pp).
    //
    // Sinkt die Abdeckung, wachen fünf lange ungeprüfte Stufen
    // gleichzeitig auf. Ohne Meldung merkt das niemand.

    it('die Abdeckung wird gezählt', () => {
        assert.ok(/_kernAbdeckung\s*=\s*\{/.test(ohneKomm),
            'der Zähler für die Kernabdeckung fehlt');
        assert.ok(/_kernAbdeckung\.getroffen\+\+/.test(ohneKomm),
            'der Treffer-Zweig zählt nicht mit');
        assert.ok(/_kernAbdeckung\.rueckfall\.push/.test(ohneKomm),
            'der Rückfall-Zweig merkt sich die Decks nicht');
    });

    it('der Zähler wird je Lauf zurückgesetzt', () => {
        // Sonst summiert sich die Abdeckung über mehrere
        // Neuberechnungen und die Quote bleibt bei 100 %, auch wenn
        // gerade ein Deck durchfällt.
        assert.ok(/_kernAbdeckung\.getroffen\s*=\s*0/.test(ohneKomm),
            'der Trefferzähler wird nie zurückgesetzt');
        assert.ok(/_kernAbdeckung\.rueckfall\.length\s*=\s*0/.test(ohneKomm),
            'die Rückfall-Liste wird nie geleert');
    });

    it('die Wache wird auch aufgerufen', () => {
        const stellen = ohneKomm.split('_meldeKernAbdeckung').length - 1;
        assert.ok(stellen >= 2,
            `_meldeKernAbdeckung steht nur ${stellen}× im Code — `
            + 'geschrieben, aber nicht aufgerufen');
    });

    it('die Meldung nennt die fünf Stufen, die dann aufwachen', () => {
        const i = quelle.indexOf('function _meldeKernAbdeckung');
        assert.ok(i > 0, 'die Wache ist verschwunden');
        const block = quelle.slice(i, i + 1400);
        for (const stufe of ['3.0', '4.2', '4.4', '4.4b', '5.0']) {
            assert.ok(block.includes(stufe),
                `die Meldung nennt Stufe ${stufe} nicht — dann weiß der `
                + 'Leser nicht, was gerade wieder mitrechnet');
        }
    });

    it('die Wache schweigt bei voller Abdeckung', () => {
        // Eine Meldung, die jeden Lauf erscheint, liest bald niemand mehr.
        const i = ohneKomm.indexOf('function _meldeKernAbdeckung');
        const block = ohneKomm.slice(i, i + 900);
        assert.ok(/rueckfall\.length\s*===\s*0\)\s*return/.test(block),
            'die Wache meldet sich auch dann, wenn der Kern jedes Deck kennt');
    });
});

describe('Prüfspuren melden, was wirklich passiert', () => {

    it('die Konzentrations-Telemetrie schließt den neutralen Exponenten aus', () => {
        // 1,00 ist die Eins. Ein Deck mit Exponent 1,00 ist nicht
        // "gesoftet", es ist unangetastet.
        const i = ohneKomm.indexOf('const softExp =');
        assert.ok(i > 0, 'die Telemetrie ist verschwunden');
        const zeile = ohneKomm.slice(i, i + 260);
        assert.ok(/concentrationExp\s*!==\s*1\.00/.test(zeile),
            'die Telemetrie meldet wieder jedes Deck als gesoftet — '
            + 'der Exponent steht konstant auf 1,00 und 1,00 < 1,49');
    });

    it('der Wachstums-Schub meldet sich', () => {
        assert.ok(/predictor 5\.4 — Wachstums-Schub/.test(quelle),
            'Predictor 5.4 läuft wieder stumm — er hebt Decks um bis zu '
            + '3 pp an, ohne dass es irgendwo auftaucht');
        const i = ohneKomm.indexOf('day2GrowthBoostPP > 0');
        assert.ok(i > 0, 'die Meldung hängt nicht an der Marke, die die Stufe setzt');
    });

    it('kein Vertrauensgrad hängt an exakter Gleitkomma-Gleichheit', () => {
        assert.ok(!/_day2Q\.n\s*===\s*2/.test(ohneKomm),
            '`_day2Q.n === 2` ist zurück — n ist eine Gewichtssumme, die '
            + 'diesen Wert über 379 Deck-Epochen nie exakt getroffen hat');
        assert.ok(/_day2Q\.n\s*>=\s*1\.75/.test(ohneKomm),
            'der mittlere Vertrauensgrad ist wieder unerreichbar');
    });
});

describe('Was gemeldet und bewusst nicht repariert wurde', () => {

    it('der Einheitenfehler an n steht dokumentiert im Code', () => {
        // Vier Tore hängen daran (5.1, 5.3, 5.2-Qualitätsboden,
        // Präsenzboden-Online-Zweig). Sie zu öffnen ist eine
        // Verhaltensänderung an vier Stellen gleichzeitig und braucht
        // eine Messung je Tor — nicht ein Suchen-und-Ersetzen.
        assert.ok(/GEMELDET, NICHT REPARIERT/.test(quelle),
            'die Meldung zum Einheitenfehler ist verschwunden');
        assert.ok(/REZENZ-GEWICHTSSUMME/.test(quelle),
            'die Erklärung, was `n` wirklich ist, fehlt');
    });

    it('die Doppelung 5.3 → 5.7 steht dokumentiert im Code', () => {
        const i = quelle.indexOf('Predictor 5.7 — Anti-Leader Tech-Boost');
        assert.ok(i > 0, 'Predictor 5.7 ist verschwunden');
        const block = quelle.slice(i, i + 2200);
        assert.ok(/getBaseMatchup/.test(block) && /5\.3/.test(block),
            'der Hinweis fehlt, dass 5.7 eine von 5.3 verschobene Zahl liest');
        assert.ok(/47,3|47\.3/.test(block),
            'die gemessene reale Schwelle steht nicht mehr dabei');
    });

    it('die Stufen sind nicht heimlich gelöscht worden', () => {
        // Stilllegen heißt: der Code bleibt, mit Schalter und Begründung.
        // Wer stattdessen löscht, nimmt dem nächsten Durchgang die
        // Möglichkeit, die Entscheidung zu prüfen.
        for (const marke of ['LIVE_SHARE_FLOOR_SHRINKAGE', 'HYPE_DAMPER_RATIO_MIN',
                             '_metaDynamicsByDeck']) {
            assert.ok(quelle.includes(marke), `${marke} wurde gelöscht statt stillgelegt`);
        }
    });
});
