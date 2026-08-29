'use strict';
/*
 * Sechs Rechenfehler im Prognosemotor, gefunden von der
 * Agenten-Durchsicht am 29.08.2026, jeder vor der Reparatur selbst
 * im Quelltext nachgeprueft.
 *
 * Alle sechs haben dieselbe Bauart: sie sind unsichtbar. Keiner wirft
 * einen Fehler, keiner faerbt einen Test rot, keiner zeigt dem Nutzer
 * etwas Auffaelliges. Sie verschieben nur Zahlen — und eine Prognose
 * hat keine sichtbare richtige Antwort, an der die Verschiebung
 * auffiele. Deshalb stehen sie hier namentlich.
 *
 * WICHTIG zur Aussagekraft: keine dieser Zusicherungen fuehrt
 * app-meta-call.js aus (es ist eine Browser-IIFE mit fetch und DOM,
 * es gibt keinen Harness). Sie sichern die GESTALT des Quelltextes.
 * Das ist weniger, als es klingt — aber es ist genau das, was diese
 * sechs Fehler zurueckgebracht haette, denn jeder war eine einzelne
 * falsche Zeile. Die numerischen Nachstellungen unten rechnen die
 * betroffenen Formeln nach, nicht den Motor.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const MC = fs.readFileSync(
    path.join(__dirname, '..', '..', 'js', 'app-meta-call.js'), 'utf8');

describe('S4 — fieldSuppressionPp summierte sich ueber Laeufe', () => {
    it('wird vor dem Modus-Tor zurueckgesetzt', () => {
        const i = MC.indexOf('function _computeFieldSuppression()');
        assert.notEqual(i, -1);
        const kopf = MC.slice(i, i + 1400);
        const iReset = kopf.indexOf('d.fieldSuppressionPp = 0');
        const iTor = kopf.indexOf("_metaCallMode !== 'counter'");
        assert.notEqual(iReset, -1, 'kein Zuruecksetzen mehr vorhanden');
        assert.notEqual(iTor, -1);
        assert.ok(iReset < iTor,
            'das Zuruecksetzen steht HINTER dem Modus-Tor — im Standardmodus ' +
            'bricht die Funktion vorher ab und der alte Wert bleibt stehen');
    });

    it('der Boden steigt weiterhin bei gesetzter Unterdrueckung aus', () => {
        // Die Wache selbst ist richtig — nur der Wert war schmutzig.
        assert.match(MC, /\(d\.fieldSuppressionPp \|\| 0\) > 0/,
            'die Wache im Online-Boden ist verschwunden');
    });

    it('nachgerechnet: ohne Zuruecksetzen waechst der Wert je Lauf', () => {
        let feld = 0;
        const einLauf = () => { feld = (feld || 0) + 1.5; };   // alte Bauart
        einLauf(); einLauf(); einLauf();
        assert.equal(feld, 4.5, 'so summierte es sich auf');
        let feld2 = 0;
        const neuerLauf = () => { feld2 = 0; feld2 = (feld2 || 0) + 1.5; };
        neuerLauf(); neuerLauf(); neuerLauf();
        assert.equal(feld2, 1.5, 'mit Zuruecksetzen bleibt es beim Wert eines Laufs');
    });
});

describe('S6 — 4.7 las seine eigene Vorprognose', () => {
    it('liest ladderShare, nicht onlineShare', () => {
        const i = MC.indexOf('const currentOnlineShare =');
        assert.notEqual(i, -1);
        const zeile = MC.slice(i, MC.indexOf('\n', i));
        assert.match(zeile, /d\.ladderShare/,
            'liest wieder d.onlineShare — das wird am Ende des Laufs mit der ' +
            'Prognose ueberschrieben, beim zweiten Lauf prueft 4.7 gegen sich selbst');
        assert.ok(!/d\.onlineShare/.test(zeile));
    });

    it('die Prognose schreibt nicht in ladderShare zurueck', () => {
        // Erster Versuch dieser Zusage verbot JEDE Zuweisung — und
        // schlug sofort an: der Datumsfilter (Z. ~11770/11784) rechnet
        // ladderShare aus den datierten Buendeln neu und stellt ihn
        // beim Loeschen des Filters wieder her. Das ist gewollt und
        // macht den Ersatz sogar besser, weil 4.7 damit den Filter
        // mitbekommt.
        //
        // Das echte Risiko ist ein anderes: schriebe irgendwo die
        // PROGNOSE nach ladderShare zurueck, waere der Ersatz genauso
        // kaputt wie d.onlineShare vorher.
        const schlecht = (MC.match(/\.ladderShare\s*=\s*[^;\n]*/g) || [])
            .filter(z => /predictedShare|onlineShare/.test(z));
        assert.deepEqual(schlecht, [],
            'die Prognose fliesst nach ladderShare zurueck: ' + schlecht.join(' | '));
    });

    it('die erlaubten Zuweisungen sind genau die des Datumsfilters', () => {
        const alle = (MC.match(/d\.ladderShare\s*=\s*[^;\n]*/g) || []);
        assert.equal(alle.length, 2,
            `${alle.length} Zuweisungen statt 2 — es ist eine dazugekommen, ` +
            `die diese Zusage nicht kennt: ${alle.join(' | ')}`);
        assert.ok(alle.some(z => /totalBuckets/.test(z)), 'Neuberechnung fehlt');
        assert.ok(alle.some(z => /orig/.test(z)), 'Wiederherstellung fehlt');
    });
});

describe('S7 — d.broughtShare gab es nie', () => {
    it('der Deckel liest aus _tournamentStats', () => {
        const i = MC.indexOf('const presenceCap = Math.max(ladderShare, broughtShare)');
        assert.notEqual(i, -1, 'der Praesenz-Deckel ist verschwunden');
        const umfeld = MC.slice(i - 700, i);
        assert.match(umfeld, /_tournamentStats\s*&&\s*_tournamentStats\[k\]/,
            'broughtShare kommt nicht aus _tournamentStats');
        assert.ok(!/const broughtShare = d\.broughtShare/.test(umfeld),
            'liest wieder d.broughtShare — dieses Feld existiert am Deck-Objekt nicht');
    });

    it('die Deck-Objekte fuehren das Feld tatsaechlich nicht', () => {
        // _shareList.map baut name/onlineShare/ladderShare/trend/onlineWinPct.
        const i = MC.indexOf('_shareList = shareRows');
        assert.notEqual(i, -1);
        const bau = MC.slice(i, i + 900);
        assert.ok(!/broughtShare\s*:/.test(bau),
            'jetzt gibt es broughtShare doch am Deck — dann waere der Umweg unnoetig');
    });
});

describe('S8 — 5.9 kappte vor dem WR-Faktor', () => {
    it('beide Zweige kappen zuletzt', () => {
        for (const konst of ['PREDICTOR_5_9_NEW_BOOST_PP_MAX',
                             'PREDICTOR_5_9_RISING_BOOST_PP_MAX']) {
            const i = MC.indexOf('Math.min(' + konst);
            assert.notEqual(i, -1, konst + ' nicht gefunden');
            const ausdruck = MC.slice(i, MC.indexOf(';', i));
            assert.match(ausdruck, /wrFactor\)/,
                konst + ': wrFactor steht wieder ausserhalb der Kappung — ' +
                'die Konstante heisst PP_MAX, war aber keine Obergrenze');
            assert.ok(!/\)\s*\*\s*wrFactor\s*$/.test(ausdruck.trim()),
                konst + ': multipliziert nach der Kappung');
        }
    });

    it('nachgerechnet: aussen kappen hebt die Grenze um den Faktor', () => {
        const MAX = 2.0, basis = 20, faktor = 0.30, wr = 1.5;
        const alt = Math.min(MAX, basis * faktor) * wr;      // 2.0 * 1.5
        const neu = Math.min(MAX, basis * faktor * wr);      // min(2.0, 9.0)
        assert.equal(alt, 3.0, 'die alte Bauart erlaubte 3.0 pp statt 2.0');
        assert.equal(neu, 2.0, 'die neue haelt die benannte Obergrenze');
    });
});

describe('S9 — Division durch Null wurde NaN', () => {
    it('6.1 hat eine Wache auf currentTotal', () => {
        const i = MC.indexOf('const scale = entry.floorTotal / entry.slot.currentTotal');
        assert.notEqual(i, -1, 'der Live-Boden ist verschwunden');
        const davor = MC.slice(Math.max(0, i - 2500), i);
        assert.match(davor, /if \(!\(slot\.currentTotal > 0\)\) return;/,
            'ohne Wache wird scale zu Infinity und before * scale zu NaN');
    });

    it('6.0 hat dieselbe Wache', () => {
        const i = MC.indexOf('const memberScale  = target / currentTotal');
        assert.notEqual(i, -1, 'der Tier-1-Boden ist verschwunden');
        const davor = MC.slice(Math.max(0, i - 900), i);
        assert.match(davor, /if \(!\(currentTotal > 0\)\) return;/,
            'dieselbe Luecke wie in 6.1, nur eine Stufe hoeher');
    });

    it('nachgerechnet: 0 mal Unendlich ergibt NaN, nicht 0', () => {
        const vorher = 0, skala = 5 / 0;
        assert.equal(skala, Infinity);
        assert.ok(Number.isNaN(vorher * skala),
            'genau dieser Wert landete auf d.predictedShare und d.onlineShare');
    });
});
