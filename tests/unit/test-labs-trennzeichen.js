'use strict';
/*
 * Die Labs-Auszuege trennen an Komma. Die eigenen Exporte an Semikolon.
 *
 * BEFUND (01.09.2026)
 * -------------------
 * Nachdem das Labs-Verzeichnis endlich ueber die Ordnergrenze kam (PR #601),
 * lud die Tier-Liste `labs_tournament_decks_TEF-PBL.csv` — und die Tier-Liste
 * aenderte sich trotzdem nicht. Zweiter Riegel direkt hinter dem ersten:
 *
 *   fetchAndParseCSV(url, delimiter = ';')      app-core.js:2550
 *   fetchAndParseCSV(labsUrl)                   app-tier-meta.js  ← ohne Komma
 *   _pmParseCSVQuoted(text, ',')                app-past-meta.js:1523  ← mit
 *
 * Live nachgemessen an der ausgelieferten Datei:
 *
 *   mit ';' geparst   44 Zeilen ·  1 Feld · deck_name undefined
 *   mit ',' geparst   44 Zeilen · 36 Felder · deck_name = "Dragapult"
 *
 * `aggregateLabsRowsByDeck` ueberspringt jede Zeile ohne `deck_name`. Das
 * Ergebnis war ein leeres Objekt — kein Fehler, keine Konsolenzeile,
 * `computeTierScore` bekam nie einen Treffer und fiel still auf Anteil +
 * Winrate zurueck. Genau die Sorte Stille, die den Hype-Damper und die zwei
 * toten Predictor-Stufen so lange getragen hat.
 *
 * Wirkung an TEF-PBL (Worlds San Francisco, 44 Decks, 33 ueber der
 * 15-Partien-Schwelle), unten nachgerechnet:
 *
 *   Tier 1   Grimmsnarl Froslass raus · Dragapult Dusknoir rein
 *   Tier 2   vier von neun Plaetzen anders
 *
 * Diese Tests lesen die echten Dateien und die echte Quelle. Kein Nachbau —
 * ein nachgebauter Parser haette den Fehler nie gehabt.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..', '..');
const quelle = fs.readFileSync(path.join(wurzel, 'js', 'app-tier-meta.js'), 'utf8');
const ohneKomm = quelle
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

const LABS = path.join(wurzel, 'data', 'labs_tournament_decks_TEF-PBL.csv');

describe('Labs-Auszuege werden mit dem richtigen Trennzeichen geladen', () => {

    it('die Datei trennt tatsaechlich an Komma', () => {
        // Die Zusage stuende sonst auf einer Annahme statt auf der Datei.
        const kopf = fs.readFileSync(LABS, 'utf8').split('\n')[0];
        assert.ok(kopf.split(',').length > 20,
            'die Kopfzeile hat unter Komma kaum Felder — trennt die Quelle jetzt anders?');
        assert.strictEqual(kopf.split(';').length, 1,
            'die Kopfzeile enthaelt Semikolon — dann ist dieser Test hinfaellig '
            + 'und die Ladestelle muss neu bewertet werden');
    });

    it('die Tier-Liste gibt das Komma an ihrer Ladestelle mit', () => {
        const i = ohneKomm.indexOf('labs_tournament_decks_${metaKey}.csv');
        assert.ok(i > 0, 'die Ladestelle der Tier-Liste ist verschwunden');
        const rumpf = ohneKomm.slice(i, i + 400);
        assert.ok(/fetchAndParseCSV\([^)]*,\s*','\s*\)/.test(rumpf),
            'fetchAndParseCSV wird ohne Trennzeichen gerufen — die Vorgabe ist '
            + "';', und damit wird die Datei zu 44 Zeilen mit einem Feld. "
            + 'labsByName bleibt leer, die Labs-Daten wirken nicht, und es '
            + 'meldet sich nichts.');
    });

    it('keine Labs-Ladestelle verlaesst sich auf die Vorgabe', () => {
        // Die Vorgabe ist fuer die EIGENEN Exporte richtig. Fuer jede Datei
        // aus der Labs-Quelle ist sie falsch — also muss jede solche Stelle
        // es ausdruecklich sagen, damit die naechste nicht wieder still
        // danebenliegt.
        const dateien = fs.readdirSync(path.join(wurzel, 'js'))
            .filter(n => n.endsWith('.js'));
        const sünder = [];
        for (const name of dateien) {
            const txt = fs.readFileSync(path.join(wurzel, 'js', name), 'utf8')
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/^[ \t]*\/\/.*$/gm, '');
            const re = /fetchAndParseCSV\(([^;]{0,200}?)\)/g;
            let m;
            while ((m = re.exec(txt)) !== null) {
                const args = m[1];
                if (!/labs_tournament/.test(args)) continue;
                if (!/,\s*['"],['"]\s*$/.test(args.trim()) && !/,\s*['"],['"]/.test(args)) {
                    sünder.push(name + ': ' + args.replace(/\s+/g, ' ').slice(0, 90));
                }
            }
        }
        assert.deepStrictEqual(sünder, [],
            'diese Labs-Ladestellen nehmen die Semikolon-Vorgabe: '
            + sünder.join(' | '));
    });
});

describe('Die Labs-Daten aendern die Tier-Einteilung wirklich', () => {

    // Die Bewertungsfunktionen werden aus der QUELLE gezogen, nicht
    // nachgebaut. Ein Nachbau wuerde nur beweisen, dass der Nachbau stimmt —
    // und genau daran ist der Motor am 01.09. schon einmal vorbeigelaufen
    // (12 Testdateien, vier Stufen ohne Absicherung).
    function ausQuelle(name) {
        const i = quelle.indexOf('function ' + name + '(');
        assert.ok(i > 0, name + ' nicht in der Quelle gefunden');
        let tiefe = 0, start = quelle.indexOf('{', i), j = start;
        for (; j < quelle.length; j++) {
            if (quelle[j] === '{') tiefe++;
            else if (quelle[j] === '}') { tiefe--; if (tiefe === 0) break; }
        }
        // eslint-disable-next-line no-new-func
        return new Function('return (' + quelle.slice(i, j + 1) + ')')();
    }
    const computeTierScore = ausQuelle('computeTierScore');
    const aggregateLabsRowsByDeck = ausQuelle('aggregateLabsRowsByDeck');

    function csv(pfad, sep) {
        const zeilen = fs.readFileSync(pfad, 'utf8').replace(/^﻿/, '').trim().split('\n');
        const kopf = zeilen[0].split(sep).map(s => s.trim());
        return zeilen.slice(1).map(z => {
            const feld = []; let cur = '', q = false;
            for (const ch of z) {
                if (ch === '"') { q = !q; continue; }
                if (ch === sep && !q) { feld.push(cur); cur = ''; continue; }
                cur += ch;
            }
            feld.push(cur);
            const o = {}; kopf.forEach((k, i) => { o[k] = (feld[i] || '').trim(); });
            return o;
        });
    }
    const zahl = (s) => parseFloat(String(s || '').replace(',', '.')) || 0;

    const decks = csv(path.join(wurzel, 'data', 'limitless_online_decks_comparison.csv'), ';')
        .map(d => ({
            archetype: d.deck_name,
            share: zahl(d.new_share),
            winrate: zahl(d.new_winrate),
            new_count: parseInt(d.new_count || 0, 10) || 0,
        }));

    function tierEins(labs) {
        const a = decks.map(d => ({ ...d, s: computeTierScore(d, labs) }))
            .sort((x, y) => y.s.score - x.s.score);
        const maxC = a.reduce((m, d) => Math.max(m, d.new_count), 0);
        const raus = [];
        for (const d of a) {
            if (raus.length >= 6) break;
            if (d.new_count < maxC * 0.10) continue;
            const lw = (d.s.labsHit && labs && labs[d.archetype]) ? labs[d.archetype].winPct : 0;
            if (d.share >= 4.0 && Math.max(d.s.adjWR, lw) >= 49.0) raus.push(d.archetype);
        }
        return raus;
    }

    it('mit Komma geparst gibt es Treffer, mit Semikolon keinen einzigen', () => {
        const mitKomma = aggregateLabsRowsByDeck(csv(LABS, ','));
        const mitSemikolon = aggregateLabsRowsByDeck(csv(LABS, ';'));
        const treffer = (L) => decks.filter(d => computeTierScore(d, L).labsHit).length;
        assert.ok(treffer(mitKomma) >= 10,
            'unter 10 Decks mit Labs-Treffer — dann traegt das Signal nicht, '
            + 'obwohl der Kommentar es "the strongest signal" nennt');
        assert.strictEqual(treffer(mitSemikolon), 0,
            'das falsche Trennzeichen liefert Treffer? Dann prueft dieser Test '
            + 'nicht das, was er zu pruefen glaubt');
    });

    it('Tier 1 sieht mit den Labs-Daten anders aus als ohne', () => {
        // Das ist die Zusage, um die es geht. Alles davor ist Verkabelung.
        const ohne = tierEins(null);
        const mit = tierEins(aggregateLabsRowsByDeck(csv(LABS, ',')));
        assert.notDeepStrictEqual(mit, ohne,
            'die Labs-Daten bewegen Tier 1 nicht — entweder greift das Gewicht '
            + 'nicht mehr, oder die Namen treffen sich nicht mehr. '
            + 'ohne: ' + ohne.join(', ') + ' | mit: ' + mit.join(', '));
        const rein = mit.filter(x => !ohne.includes(x));
        assert.ok(rein.length >= 1,
            'kein Deck kommt durch die Labs-Daten neu in Tier 1');
    });
});
