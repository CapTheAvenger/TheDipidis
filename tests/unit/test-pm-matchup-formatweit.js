/**
 * F14 — die Matchup-Matrix im Reiter "Vergangenes Meta" bleibt formatweit,
 * auch wenn ein einzelnes Turnier gewaehlt ist.
 *
 * GEMESSEN am 21.08.2026 an data/labs_tournament_matchups_*.csv: keine
 * einzige Zeile beschreibt ein einzelnes Turnier. Jede Zeile traegt in
 * tournaments_used die vollstaendige Turnierliste ihres Formats — im
 * Chunk TEF-CRI stehen auf allen 5.819 Zeilen '69,70', in TEF-POR sind
 * es sieben Kennungen. Der Turnierfilter trifft also, sobald das
 * gewaehlte Turnier IN dieser Liste vorkommt, und zeigt danach den
 * Schnitt ueber alle.
 *
 * Die Zahlen je Turnier gibt es nicht. Was fehlte, war der Satz darueber:
 * "Spezial Turin, Dragapult vs Gardevoir 54,2 %" las sich als Ergebnis
 * dieses einen Turniers. Diese Datei haelt beides fest — den Datenbefund
 * und den Vorbehalt, der jetzt darueber steht.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* Naives split(',') taugt hier nicht: tournaments_used steht als "69,70"
   in Anfuehrungszeichen und zerfaellt sonst in zwei Felder — der Test
   haette genau den Befund verfehlt, den er festhalten soll. */
function felder(zeile) {
    const raus = [];
    let feld = '', inAnf = false;
    for (let i = 0; i < zeile.length; i++) {
        const c = zeile[i];
        if (inAnf) {
            if (c === '"') {
                if (zeile[i + 1] === '"') { feld += '"'; i++; }
                else inAnf = false;
            } else feld += c;
        } else if (c === '"') inAnf = true;
        else if (c === ',') { raus.push(feld); feld = ''; }
        else feld += c;
    }
    raus.push(feld);
    return raus;
}

function csv(pfad) {
    const zeilen = lies(pfad).replace(/^﻿/, '').split(/\r?\n/).filter(z => z.trim());
    const kopf = felder(zeilen[0]);
    return zeilen.slice(1).map(z => {
        const teile = felder(z);
        const o = {};
        kopf.forEach((k, i) => { o[k] = teile[i]; });
        return o;
    });
}

describe('Die Labs-Matchups kennen keine einzelnen Turniere', () => {
    it('jede Zeile eines Format-Chunks nennt dieselbe volle Turnierliste', () => {
        const datei = 'data/labs_tournament_matchups_TEF-CRI.csv';
        const zeilen = csv(datei);
        assert.ok(zeilen.length > 100, `zu wenig Zeilen: ${zeilen.length}`);
        const listen = new Set(zeilen.map(z => (z.tournaments_used || '').trim()));
        assert.equal(listen.size, 1, `mehrere Listen gefunden: ${[...listen].slice(0, 5)}`);
        const einzige = [...listen][0];
        assert.ok(einzige.includes(','),
            'wenn Labs eines Tages je Turnier liefert, darf der Vorbehalt weg — dann faellt dieser Test');
    });
});

describe('Der Vorbehalt steht ueber der Tabelle', () => {
    const PM = lies('js/app-past-meta.js');
    const I18N = lies('js/i18n.js');

    it('wird nur bei Einzelauswahl UND mehreren Turnieren gesetzt', () => {
        assert.match(PM, /const _muFormatweit = !!tournamentFilter && _muTurniere\.size > 1;/);
    });

    it('zaehlt die Turniere aus den tatsaechlich getroffenen Zeilen', () => {
        // Den Zaehlblock ausschneiden und laufen lassen: er soll die
        // Kennungen entdoppeln und Leerteile verwerfen.
        const a = PM.indexOf('const _muTurniere = new Set();');
        assert.ok(a >= 0, 'Zaehlblock nicht gefunden');
        const b = PM.indexOf('const _muFormatweit', a);
        const block = PM.slice(a, b);
        // eslint-disable-next-line no-new-func
        const zaehle = new Function('myRows', block + '\nreturn _muTurniere;');
        assert.equal(zaehle([{ tournaments_used: '69,70' }, { tournaments_used: '70, 69' }]).size, 2);
        assert.equal(zaehle([{ tournaments_used: '69' }, { tournaments_used: '69' }]).size, 1);
        assert.equal(zaehle([{ tournaments_used: '' }, { tournaments_used: ' , ' }]).size, 0);
    });

    it('nennt die Zahl der Turniere, ueber die gerechnet wurde', () => {
        assert.match(PM, /t\('pm\.matchupFormatWide'\)[\s\S]{0,120}replace\('\{n\}', String\(_muTurniere\.size\)\)/);
        for (const text of [/'pm\.matchupFormatWide':\s*'Not for the selected tournament[^']*\{n\}[^']*'/,
                            /'pm\.matchupFormatWide':\s*'Nicht für das gewählte Turnier[^']*\{n\}[^']*'/]) {
            assert.match(I18N, text);
        }
    });

    it('steht vor der Tabelle, nicht darunter', () => {
        const i = PM.indexOf('${_muVorbehalt}');
        const j = PM.indexOf('past-meta-matchup-table-wrap');
        assert.ok(i > 0 && j > i, 'Vorbehalt steht nicht vor der Tabelle');
    });

    it('traegt die Vorbehalts-Farbe, nicht die Alarmfarbe', () => {
        const css = lies('css/city-league.css');
        const regel = /\.past-meta-mu-vorbehalt \{[^}]*\}/.exec(css);
        assert.ok(regel, 'Regel .past-meta-mu-vorbehalt fehlt');
        assert.match(regel[0], /var\(--vorbehalt\)/);
        assert.doesNotMatch(regel[0], /--alarm|--dv-neg/);
        assert.doesNotMatch(regel[0], /!important/);
    });
});
