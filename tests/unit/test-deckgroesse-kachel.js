/**
 * "Karten im Deck" — die Zahl hinter dem Schraegstrich.
 *
 * Befund aus der Pruefrunde: Current Meta und City League summierten
 * `max_count` und beschrifteten das Ergebnis als "Gesamt". max_count ist
 * die groesste je gesehene Kopienzahl EINER Karte ueber alle Listen des
 * Archetyps; aufaddiert ueber alle Karten ergibt das eine Deckgroesse,
 * die es nicht gibt. Gemessen an data/current_meta_card_data.csv:
 * Mega Excadrill 101, N's Zoroark 106, Dhelmise 117, Toucannon 183 —
 * bei 60 erlaubten Karten. Past Meta rechnete bereits richtig.
 *
 * Diese Datei prueft das Verhalten der gemeinsamen Rechnung
 * mittlereDeckGroesse() und haelt zusaetzlich an den echten Daten fest,
 * dass die Summe der ungerundeten Mittelwerte je Archetyp 60 ergibt —
 * sonst waere die neue Zahl nur anders falsch.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function schnitt(quelle, von, bis, was) {
    const a = quelle.indexOf(von);
    assert.ok(a >= 0, `Anker fehlt (${was}): ${von}`);
    const b = quelle.indexOf(bis, a);
    assert.ok(b > a, `Endanker fehlt (${was}): ${bis}`);
    return quelle.slice(a, b + bis.length);
}

// app-utils.js laeuft beim Laden gegen localStorage. Fuer diesen Test
// zaehlt nur die Rechnung, also wird genau ihr Block herausgeschnitten
// und einzeln ausgewertet — samt parseLocaleNumber, das sie benutzt.
function ladeUtils() {
    const quelle = lies('js/app-utils.js');
    const teile = [
        schnitt(quelle, 'function parseLocaleNumber(', '\nwindow.parseLocaleNumber', 'parseLocaleNumber'),
        schnitt(quelle, 'function mittlereDeckGroesse(', '\nwindow.mittlereDeckGroesse', 'mittlereDeckGroesse')
    ].join('\n');
    const w = {};
    // eslint-disable-next-line no-new-func
    new Function('window', teile + '\nwindow.mittlereDeckGroesse = mittlereDeckGroesse;'
        + '\nwindow.deckGroessenText = deckGroessenText;')(w);
    assert.equal(typeof w.mittlereDeckGroesse, 'function', 'mittlereDeckGroesse fehlt');
    assert.equal(typeof w.deckGroessenText, 'function', 'deckGroessenText fehlt');
    return w;
}

function csvZeilen(pfad) {
    const roh = lies(pfad).replace(/^﻿/, '');
    const zeilen = roh.split(/\r?\n/).filter(z => z.trim().length > 0);
    const kopf = zeilen[0].split(';');
    return zeilen.slice(1).map(z => {
        const teile = z.split(';');
        const o = {};
        kopf.forEach((k, i) => { o[k] = teile[i]; });
        return o;
    });
}

describe('Deckgroessen-Kachel: verschiedene / Ø-Liste', () => {

    it('summiert Mittelwerte, nicht max_count', () => {
        const { mittlereDeckGroesse } = ladeUtils();
        // Zwei Karten, 20 Listen. max_count sagt 4+4=8, im Schnitt
        // liegen aber 2,0 und 1,5 Kopien pro Liste.
        const karten = [
            { max_count: 4, average_count_overall: '2,00', total_decks_in_archetype: 20 },
            { max_count: 4, average_count_overall: '1,50', total_decks_in_archetype: 20 }
        ];
        const r = mittlereDeckGroesse(karten);
        assert.equal(r.basis, 'mittelwert');
        assert.ok(Math.abs(r.groesse - 3.5) < 1e-9, `erwartet 3,5 — bekommen ${r.groesse}`);
        assert.notEqual(Math.round(r.groesse), 8, 'max_count-Summe darf nicht mehr herauskommen');
    });

    it('nimmt bei genau einer Liste max_count, weil es dort die echte Kopienzahl ist', () => {
        const { mittlereDeckGroesse } = ladeUtils();
        const karten = [
            { max_count: 4, average_count_overall: '4,00', total_decks_in_archetype: 1 },
            { max_count: 2, average_count_overall: '2,00', total_decks_in_archetype: 1 }
        ];
        const r = mittlereDeckGroesse(karten, 1);
        assert.equal(r.basis, 'einzelliste');
        assert.equal(r.groesse, 6);
    });

    it('meldet "unbekannt" statt einer 0, wenn keine Zeile einen Mittelwert traegt', () => {
        const { mittlereDeckGroesse, deckGroessenText } = ladeUtils();
        const karten = [
            { max_count: 4, total_decks_in_archetype: 20 },
            { max_count: 3, total_decks_in_archetype: 20 }
        ];
        const r = mittlereDeckGroesse(karten);
        assert.equal(r.basis, 'unbekannt');
        assert.equal(r.groesse, 0);
        assert.equal(deckGroessenText(karten).rechts, '–',
            'ohne Datengrundlage darf keine Zahl dastehen');
    });

    it('leere Auswahl ergibt "leer", nicht "unbekannt"', () => {
        const { mittlereDeckGroesse } = ladeUtils();
        assert.equal(mittlereDeckGroesse([]).basis, 'leer');
        assert.equal(mittlereDeckGroesse(null).basis, 'leer');
    });

    it('versteht deutsche Dezimalkommas', () => {
        const { mittlereDeckGroesse } = ladeUtils();
        const mitKomma = mittlereDeckGroesse([
            { average_count_overall: '1,25', total_decks_in_archetype: 9 }]);
        const mitPunkt = mittlereDeckGroesse([
            { average_count_overall: '1.25', total_decks_in_archetype: 9 }]);
        assert.ok(Math.abs(mitKomma.groesse - 1.25) < 1e-9, `Komma: ${mitKomma.groesse}`);
        assert.ok(Math.abs(mitPunkt.groesse - 1.25) < 1e-9, `Punkt: ${mitPunkt.groesse}`);
    });

    it('liefert fuer jeden echten Archetyp eine legale Deckgroesse (60 ± 1)', () => {
        const { mittlereDeckGroesse } = ladeUtils();
        const zeilen = csvZeilen('data/current_meta_card_data.csv')
            .filter(z => (z.meta || '').trim() === 'Meta Live');
        assert.ok(zeilen.length > 500, `zu wenig Zeilen geladen: ${zeilen.length}`);

        const nachArchetyp = new Map();
        zeilen.forEach(z => {
            const a = (z.archetype || '').trim();
            if (!a) return;
            if (!nachArchetyp.has(a)) nachArchetyp.set(a, []);
            nachArchetyp.get(a).push(z);
        });
        assert.ok(nachArchetyp.size >= 10, `zu wenig Archetypen: ${nachArchetyp.size}`);

        const daneben = [];
        const altDaneben = [];
        nachArchetyp.forEach((karten, archetyp) => {
            const neu = mittlereDeckGroesse(karten).groesse;
            if (Math.abs(neu - 60) > 1) daneben.push(`${archetyp}: ${neu.toFixed(2)}`);
            const alt = karten.reduce((s, k) => s + (parseInt(k.max_count || 0, 10) || 0), 0);
            if (Math.abs(alt - 60) > 1) altDaneben.push(`${archetyp}: ${alt}`);
        });
        assert.deepEqual(daneben, [], 'Archetypen mit unmoeglicher Deckgroesse');
        // Gegenprobe: die alte Rechnung war fuer praktisch jeden
        // Archetyp daneben. Faellt diese Zusicherung, misst der Test
        // nicht mehr das, wofuer er geschrieben wurde.
        assert.ok(altDaneben.length > nachArchetyp.size / 2,
            `alte max_count-Rechnung war unerwartet nah an 60 (${altDaneben.length}/${nachArchetyp.size})`);
    });
});

describe('Die Kacheln nutzen die gemeinsame Rechnung', () => {
    const quellen = [
        ['js/app-current-meta-analysis.js', 'currentMetaStatCards'],
        ['js/app-city-league.js', 'cityLeagueStatCards']
    ];

    quellen.forEach(([datei, kachel]) => {
        it(`${datei} summiert kein max_count mehr fuer ${kachel}`, () => {
            const q = lies(datei);
            assert.ok(q.includes('mittlereDeckGroesse('),
                `${datei} ruft mittlereDeckGroesse() nicht auf`);
            const treffer = q.match(/sum \+ parseInt\(card\.max_count[^)]*\)[^)]*\), 0\)/g) || [];
            assert.deepEqual(treffer, [],
                `${datei} summiert weiterhin max_count: ${treffer.join(' | ')}`);
        });
    });

    it('die Fusion zweier Archetypen rechnet average_count_overall mit', () => {
        const q = lies('js/app-current-meta-analysis.js');
        const a = q.indexOf('function _fuseArchetypeRows');
        assert.ok(a >= 0, 'Fusion nicht gefunden');
        const block = q.slice(a, q.indexOf('// Populate deck select dropdown', a));
        assert.ok(block.includes('average_count_overall:'),
            'ohne dieses Feld erbt die fusionierte Zeile den Mittelwert nur eines Archetyps');
    });

    it('die Beschriftung nennt die Ø-Liste, nicht "Gesamt"', () => {
        const q = lies('js/i18n.js');
        assert.ok(q.includes("'stats.cardsInDeck':        'Karten im Deck (verschiedene / Ø-Liste)'"),
            'deutsche Beschriftung nicht angepasst');
        assert.ok(!/stats\.cardsInDeck':\s*'Karten im Deck \(Unique \/ Gesamt\)/.test(q),
            '"Gesamt" steht noch da');
        const html = lies('index.html');
        const alteFallbacks = (html.match(/Cards in Deck \(Unique \/ Total\)/g) || []);
        assert.deepEqual(alteFallbacks, [],
            'index.html traegt noch den alten Fallback-Text');
    });
});
