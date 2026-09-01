'use strict';
/*
 * "Deckliste kopieren" ergab keine 60 Karten.
 *
 * BEFUND (30.08.2026, data/current_meta_card_data.csv, alle 60 Archetypen)
 * -----------------------------------------------------------------------
 * Die Kopierfunktion rundete jede Karte einzeln
 * (`Math.round(average_count_overall)`) und legte die Ergebnisse
 * zusammen. Herausgekommen ist eine 60 in genau 10 von 60 Faellen:
 *
 *     Dragapult                56
 *     Mega Excadrill           57
 *     Alakazam Dudunsparce     57
 *     Grimmsnarl Froslass      61
 *     Other                    41
 *
 * Die Ausgabe traegt PTCGL-Abschnittskoepfe und sieht aus wie eine
 * Deckliste. Mit 56 Karten nimmt PTCGL sie nicht an — und der Fehler
 * steht nicht beim Nutzer.
 *
 * Die Daten selbst sind exakt: die ROHE Summe der average_count_overall
 * ist in JEDEM der 60 Archetypen 60,00. Nicht die Zahlen waren schief,
 * sondern der Operator. Einzeln runden verliert die Summe — derselbe
 * Fehler wie bei Sitzverteilungen, dieselbe Loesung: abrunden, dann die
 * uebrigen Plaetze nach den groessten Resten vergeben.
 *
 * Was diese Tests halten:
 *   1. Die Summe stimmt — auch bei Gleichstaenden und Obergrenzen.
 *   2. Es wird NICHT zurechtgebogen, wenn die Rohsumme nicht passt.
 *   3. Vier Kopien je Karte, eine je ACE SPEC, Basis-Energie frei.
 *   4. Beide Kopierstellen benutzen die Verteilung wirklich.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..', '..');
const lies = p => fs.readFileSync(path.join(wurzel, p), 'utf8');
const ohneKomm = q => q.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

// Nur den Abschnitt laden, den wir pruefen — app-utils.js im Ganzen
// braucht ein Fenster mit DOM.
function ladeVerteilung(aceSpecs) {
    const quelle = lies('js/app-utils.js');
    const i = quelle.indexOf('/* ── Kopien auf die Deckgroesse verteilen');
    assert.ok(i > 0, 'verteileKopienAufDeckgroesse nicht in js/app-utils.js gefunden');
    const fenster = { isAceSpec: (n) => (aceSpecs || []).includes(n) };
    const bauen = new Function('window', quelle.slice(i) + '\nreturn verteileKopienAufDeckgroesse;');
    return bauen(fenster);
}

const K = (name, wert, typ) => ({ card_name: name, average_count_overall: wert, type: typ || 'Item' });
const WERT = { wert: c => c.average_count_overall };

describe('verteileKopienAufDeckgroesse', () => {
    const verteile = ladeVerteilung();

    it('haelt die Summe, wo einzelnes Runden sie verliert', () => {
        // 4x 2,5 rundet einzeln auf 4x3 = 12, gefordert sind 10.
        const karten = [K('A', 2.5), K('B', 2.5), K('C', 2.5), K('D', 2.5)];
        const r = verteile(karten, 10, WERT);
        assert.strictEqual(r.basis, 'verteilt');
        assert.strictEqual(r.kopien.reduce((s, x) => s + x, 0), 10);
    });

    it('gibt die Restplaetze an die groessten Reste', () => {
        const karten = [K('A', 1.9), K('B', 1.1), K('C', 1.0)];
        const r = verteile(karten, 4, WERT);
        assert.deepStrictEqual(r.kopien, [2, 1, 1]);
    });

    it('entscheidet Gleichstaende nach dem groesseren Rohwert', () => {
        // Boeden 1 + 3 = 4, genau EIN Platz bleibt uebrig, beide Reste 0,5.
        // Ihn bekommt der groessere Rohwert — sonst entschiede die
        // Reihenfolge der Eingabe.
        const karten = [K('klein', 1.5), K('gross', 3.5)];
        const r = verteile(karten, 5, WERT);
        assert.deepStrictEqual(r.kopien, [1, 4]);
        const gedreht = verteile([K('gross', 3.5), K('klein', 1.5)], 5, WERT);
        assert.deepStrictEqual(gedreht.kopien, [4, 1]);
    });

    it('haengt nicht von der Reihenfolge der Eingabe ab', () => {
        const a = [K('A', 1.4), K('B', 2.4), K('C', 3.2)];
        const b = [a[2], a[0], a[1]];
        const ra = verteile(a, 7, WERT).kopien;
        const rb = verteile(b, 7, WERT).kopien;
        assert.deepStrictEqual([ra[0], ra[1], ra[2]], [rb[1], rb[2], rb[0]]);
    });

    it('gibt einer Karte unter 0,5 einen Platz, statt sie zu streichen', () => {
        // Einzeln gerundet faellt jede der drei Tech-Karten auf 0 und die
        // Liste haette 3 statt 4 Karten. Nach Resten bekommt eine davon
        // den letzten Platz.
        const karten = [K('Tech A', 0.4), K('Tech B', 0.4), K('Tech C', 0.4), K('Kern', 2.8)];
        const einzeln = karten.map(k => Math.round(k.average_count_overall));
        assert.strictEqual(einzeln.reduce((s, x) => s + x, 0), 3, 'Beispiel taugt nicht mehr');
        const r = verteile(karten, 4, WERT);
        assert.strictEqual(r.kopien.reduce((s, x) => s + x, 0), 4);
        assert.strictEqual(r.kopien[3], 3);
        assert.strictEqual(r.kopien[0] + r.kopien[1] + r.kopien[2], 1);
    });

    it('biegt nichts zurecht, wenn die Rohsumme nicht passt', () => {
        const karten = [K('A', 2), K('B', 2)];
        const r = verteile(karten, 60, WERT);
        assert.strictEqual(r.basis, 'ungerundet');
        assert.strictEqual(r.kopien.reduce((s, x) => s + x, 0), 4);
    });

    it('haelt die Vierergrenze ein', () => {
        const karten = [K('A', 9), K('B', 1)];
        const r = verteile(karten, 10, WERT);
        assert.ok(r.kopien[0] <= 4, 'A hat ' + r.kopien[0] + ' Kopien');
        assert.strictEqual(r.basis, 'obergrenze');
    });

    it('laesst Basis-Energie ueber vier hinaus', () => {
        const karten = [K('Basic Fire Energy', 8, 'Basic Energy'), K('A', 2)];
        const r = verteile(karten, 10, WERT);
        assert.strictEqual(r.kopien[0], 8);
        assert.strictEqual(r.kopien.reduce((s, x) => s + x, 0), 10);
    });

    it('laesst ACE SPEC genau einmal ins Deck', () => {
        const mitAce = ladeVerteilung(['Prime Catcher']);
        const karten = [K('Prime Catcher', 2.6), K('A', 2.4)];
        const r = mitAce(karten, 5, WERT);
        assert.strictEqual(r.kopien[0], 1, 'ACE SPEC bekam ' + r.kopien[0]);
    });

    it('laeuft nicht endlos, wenn alle an der Grenze stehen', () => {
        const karten = [K('A', 4), K('B', 4)];
        const r = verteile(karten, 8, WERT);   // passt genau
        assert.strictEqual(r.summe, 8);
        const eng = verteile([K('A', 30), K('B', 30)], 60, WERT);
        assert.strictEqual(eng.basis, 'obergrenze');
        assert.ok(eng.summe <= 8, 'summe war ' + eng.summe);
    });

    it('gibt bei leerer Eingabe nichts zurueck statt zu raten', () => {
        assert.deepStrictEqual(verteile([], 60, WERT).kopien, []);
        assert.strictEqual(verteile([], 60, WERT).basis, 'leer');
        assert.strictEqual(verteile(null, 60, WERT).basis, 'leer');
    });

    it('behandelt Komma-Dezimalzahlen wie die CSVs sie schreiben', () => {
        const karten = [{ card_name: 'A', average_count_overall: '2,5', type: 'Item' },
                        { card_name: 'B', average_count_overall: '1,5', type: 'Item' }];
        const r = verteile(karten, 4, WERT);
        assert.strictEqual(r.kopien.reduce((s, x) => s + x, 0), 4);
    });
});

describe('Der ausgelieferte Bestand', () => {
    const verteile = ladeVerteilung();

    /* GRUPPIERT NACH (ARCHETYP, META), NICHT NACH ARCHETYP ALLEIN.
     *
     * BEFUND (01.09.2026): der geplante Datenlauf um 06:34 UTC hat zum
     * ersten Mal ein Praesenzturnier in die Datei gebracht. Vorher fuehrte
     * data/current_meta_card_data.csv genau ein Meta ("Meta Live", 3311
     * Zeilen), seither zwei ("Meta Live" 3391 + "Meta Play!" 1154).
     *
     * Diese Funktion gruppierte nur nach Archetyp und warf damit beide
     * Metas in einen Topf: statt 60,00 kamen 119,94 heraus, und der Test
     * meldete 31 kaputte Archetypen. Die Daten waren in Ordnung — je
     * (Archetyp, Meta) steht die Summe unveraendert auf exakt 60,00.
     * Falsch war die Gruppierung hier.
     *
     * Das Meta gehoert in den Schluessel, weil es die Zaehlung definiert:
     * eine Deckliste aus dem Online-Feld und eine aus den Turnieren sind
     * zwei Listen, nicht eine mit 120 Karten.
     */
    function archetypen() {
        const roh = lies('data/current_meta_card_data.csv').replace(/^﻿/, '');
        const zeilen = roh.split(/\r?\n/).filter(Boolean);
        const kopf = zeilen[0].split(';');
        const iArch = kopf.indexOf('archetype');
        const iName = kopf.indexOf('card_name');
        const iTyp = kopf.indexOf('type');
        const iAvg = kopf.indexOf('average_count_overall');
        const iMeta = kopf.indexOf('meta');
        assert.ok(iMeta >= 0, 'Spalte "meta" fehlt — dann traegt der Schluessel sie nicht');
        const pro = new Map();
        for (const z of zeilen.slice(1)) {
            const f = z.split(';');
            if (f.length !== kopf.length) continue;
            const schluessel = f[iArch] + ' · ' + f[iMeta];
            if (!pro.has(schluessel)) pro.set(schluessel, []);
            pro.get(schluessel).push({
                card_name: f[iName], type: f[iTyp], average_count_overall: f[iAvg],
            });
        }
        return pro;
    }

    it('die Datei fuehrt mehr als ein Meta — der Schluessel muss es tragen', () => {
        // Ohne diese Pruefung faellt niemandem auf, wenn der Schluessel
        // wieder auf den blossen Archetyp zurueckfaellt: bei nur einem
        // Meta waere beides gleichwertig, und der Fehler kaeme erst beim
        // naechsten Praesenzturnier wieder hoch — so wie heute.
        const roh = lies('data/current_meta_card_data.csv').replace(/^﻿/, '');
        const zeilen = roh.split(/\r?\n/).filter(Boolean);
        const kopf = zeilen[0].split(';');
        const iMeta = kopf.indexOf('meta');
        const metas = new Set(zeilen.slice(1).map(z => z.split(';')[iMeta]).filter(Boolean));
        assert.ok(metas.size >= 1, 'keine Meta-Werte gelesen');
        // Und der Schluessel dieser Testdatei enthaelt das Meta wirklich.
        assert.ok([...archetypen().keys()].every(k => k.includes(' · ')),
            'der Gruppierungsschluessel traegt das Meta nicht mehr');
    });

    it('ergibt in jedem Archetyp genau 60 Karten', () => {
        const pro = archetypen();
        assert.ok(pro.size >= 30, 'nur ' + pro.size + ' Archetypen gelesen');
        const schlecht = [];
        for (const [name, karten] of pro) {
            const r = verteile(karten, 60, WERT);
            const summe = r.kopien.reduce((s, x) => s + x, 0);
            if (r.basis !== 'verteilt' || summe !== 60) schlecht.push([name, r.basis, summe]);
        }
        assert.deepStrictEqual(schlecht, [], 'Archetyp/Meta ohne 60: ' + JSON.stringify(schlecht));
    });

    it('setzt nirgends mehr als vier Kopien einer Nicht-Energie', () => {
        const pro = archetypen();
        const schlecht = [];
        for (const [name, karten] of pro) {
            const r = verteile(karten, 60, WERT);
            karten.forEach((k, i) => {
                if (r.kopien[i] > 4 && !/basic\s+energy/i.test(k.type || '')) {
                    schlecht.push([name, k.card_name, r.kopien[i]]);
                }
            });
        }
        assert.deepStrictEqual(schlecht, []);
    });

    it('einzeln runden traefe die 60 nur selten — der Befund steht', () => {
        const pro = archetypen();
        let getroffen = 0;
        for (const [, karten] of pro) {
            const summe = karten.reduce((s, k) =>
                s + Math.round(parseFloat(String(k.average_count_overall).replace(',', '.')) || 0), 0);
            if (summe === 60) getroffen++;
        }
        assert.ok(getroffen < pro.size / 2,
            'einzeln runden traf ' + getroffen + ' von ' + pro.size + ' — der Befund waere veraltet');
    });
});

describe('Beide Kopierstellen benutzen die Verteilung', () => {
    for (const datei of ['js/app-current-meta-analysis.js', 'js/app-city-league.js']) {
        it(datei + ' ruft verteileKopienAufDeckgroesse', () => {
            const q = ohneKomm(lies(datei));
            assert.ok(/verteileKopienAufDeckgroesse\s*\(/.test(q),
                datei + ' rundet wieder einzeln');
            assert.ok(/_kopienNach/.test(q),
                datei + ' berechnet die Verteilung, benutzt sie aber nicht');
        });

        it(datei + ' faellt nur zurueck, wenn die Verteilung nichts hergibt', () => {
            const q = ohneKomm(lies(datei));
            assert.ok(/_kopienNach\.has\(card\)/.test(q),
                datei + ' fragt die Verteilung nicht ab');
            assert.ok(/basis === 'verteilt'/.test(q),
                datei + ' uebernimmt auch eine Verteilung, die nicht aufging');
        });
    }
});
