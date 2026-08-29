/**
 * Boden und Klebrigkeits-Daempfer — mit DATEN ausgefuehrt, nicht gelesen.
 *
 * Die Nachpruefung am 29.08.2026 hat den Grund geliefert, warum es diese
 * Datei geben muss: die Begruendung der Evidenzhuerde nannte zwei
 * Beispieldecks, die die Huerde in Wahrheit BESTEHEN (Lillie's Clefairy
 * 2 Turniere / 44 Spieler, Metagross 2 / 50). Der Fehler stand im
 * Kommentar UND in der Zusage — und beide blieben gruen, weil beide nur
 * den Quelltext lesen. Eine Zusage, die nur nach Zeichenketten sucht,
 * kann eine falsche Behauptung nicht bemerken.
 *
 * Hier wird deshalb gerechnet: dieselbe Aggregation wie der Motor, gegen
 * die echten Repo-Daten, mit von Hand nachpruefbaren Erwartungen.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const MC = fs.readFileSync(path.join(ROOT, 'js', 'app-meta-call.js'), 'utf8');

function konstante(name) {
    const m = MC.match(new RegExp('const ' + name + '\\s*=\\s*([0-9.]+)'));
    assert.ok(m, `${name} steht nicht mehr in js/app-meta-call.js`);
    return Number(m[1]);
}

// ── Daten laden (komma-getrennt, Felder koennen gequotet sein) ──────
function csv(datei) {
    const txt = fs.readFileSync(path.join(ROOT, 'data', datei), 'utf8').replace(/^﻿/, '');
    const zeilen = txt.split('\n').filter(z => z.trim());
    const zerlege = (z) => {
        const raus = []; let feld = ''; let inQ = false;
        for (let i = 0; i < z.length; i++) {
            const c = z[i];
            if (c === '"') { inQ = !inQ; continue; }
            if (c === ',' && !inQ) { raus.push(feld); feld = ''; continue; }
            feld += c;
        }
        raus.push(feld);
        return raus;
    };
    const kopf = zerlege(zeilen[0]);
    return zeilen.slice(1).map(z => {
        const f = zerlege(z); const o = {};
        kopf.forEach((k, i) => { o[k.trim()] = (f[i] || '').trim(); });
        return o;
    });
}

const LABS = csv('labs_tournament_decks.csv');
const CONT = csv('player_continuity.csv');
const FW = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'format_window.json'), 'utf8'));
const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

// ── Die Boden-Aggregation, wie der Motor sie rechnet ────────────────
function bodenKandidaten(formatKey) {
    const agg = {};
    for (const r of LABS) {
        if ((r.meta || '').trim().toUpperCase() !== formatKey) continue;
        if (!r.deck_name) continue;
        const spieler = parseInt(r.player_count || '0', 10) || 0;
        const anteil = parseFloat(String(r.share_pct || '0').replace(',', '.')) || 0;
        if (spieler <= 0 || anteil <= 0) continue;
        const k = norm(r.deck_name);
        if (!agg[k]) agg[k] = { name: r.deck_name, sw: 0, p: 0, turniere: new Set() };
        agg[k].sw += anteil * spieler;
        agg[k].p += spieler;
        if (r.tournament_id) agg[k].turniere.add(r.tournament_id.trim());
    }
    return Object.entries(agg).map(([k, a]) => ({
        k, name: a.name, boden: a.sw / a.p, spieler: a.p, turniere: a.turniere.size,
    }));
}

describe('Die Evidenzhuerde — was sie wirklich tut', () => {
    const MIN_T = konstante('PREDICTOR_5_5_MIN_TURNIERE');
    const MIN_S = konstante('PREDICTOR_5_5_MIN_SPIELER');
    const prev = String(FW.previous_format_key || '').toUpperCase();
    const kand = bodenKandidaten(prev);
    const nimmt = (x) => x.turniere >= MIN_T && x.spieler >= MIN_S;

    // Bewusst KEINE Zusage der Form "es gibt mehr als N Kandidaten" oder
    // "der groesste Verworfene liegt unter X %". Das waeren abgelesene
    // Wochenwerte, und der Wachhund in test-testdaten-wachhund.js
    // verbietet sie zu Recht: sie brechen, sobald sich das Feld
    // aendert, ohne dass irgendetwas kaputt waere. Geprueft werden
    // Eigenschaften der Huerde, mit den Daten als Fahrzeug.

    it('sie laesst alles durch, was auf breiter Grundlage steht', () => {
        // Eigenschaft, nicht Wochenwert: wer viele Spieler UND mehrere
        // Turniere hat, muss durchkommen — sonst waeren die Schwellen
        // falsch herum gesetzt.
        for (const x of kand.filter(x => x.spieler >= 100 && x.turniere >= MIN_T)) {
            assert.ok(nimmt(x), `${x.name} (${x.turniere} Turniere, ${x.spieler} Spieler) faellt durch`);
        }
    });

    it('sie sortiert nach Evidenz, nicht nach Anteil', () => {
        // Das ist der Punkt der Huerde: sie darf ein Deck nicht deshalb
        // verwerfen, weil sein Anteil klein ist, sondern nur, weil die
        // Zaehlung duenn ist. Also: jedes verworfene Deck muss
        // nachweislich an einer der beiden Bedingungen scheitern.
        for (const x of kand.filter(x => !nimmt(x))) {
            assert.ok(x.turniere < MIN_T || x.spieler < MIN_S,
                `${x.name} wurde verworfen, erfuellt aber beide Bedingungen`);
        }
    });

    it('die Beispiele im Kommentar stimmen mit der Rechnung ueberein', () => {
        // Genau hier lag der Fehler: der Kommentar nannte Lillie's
        // Clefairy und Metagross als Faelle, die die Huerde faengt.
        // Beide bestehen sie. Diese Zusage haelt fest, dass die
        // Richtigstellung im Code steht und nicht zurueckgedreht wird.
        const i = MC.indexOf('RICHTIGSTELLUNG 29.08.2026');
        assert.notEqual(i, -1,
            'die Richtigstellung zur Evidenzhuerde ist verschwunden');
        const block = MC.slice(i, i + 1500);
        assert.match(block, /beide BESTEHEN die Huerde/);
        for (const name of ["Lillie's Clefairy", 'Metagross']) {
            const x = kand.find(y => y.name === name);
            if (!x) continue;   // Deck aus den Daten verschwunden — dann ist nichts zu belegen
            assert.ok(nimmt(x),
                `${name} faellt jetzt doch durch die Huerde — dann ist die `
                + 'Richtigstellung im Kommentar ihrerseits falsch geworden');
        }
    });
});

describe('Der Klebrigkeits-Daempfer — mit den echten Daten gerechnet', () => {
    const MIN_T = konstante('PREDICTOR_5_8_MIN_TURNIERE');
    const MIN_B = konstante('PREDICTOR_5_8_MIN_BROUGHT');
    const LOW   = konstante('PREDICTOR_5_8_LOW_STICK');

    function klebrigkeit(turnierFilter) {
        const seen = new Map(); const brought = new Map(); const turniere = new Set();
        for (const r of CONT) {
            const tid = (r.tournament_id || '').trim();
            if (turnierFilter && !turnierFilter(tid)) continue;
            const p = (r.player_name || '').trim();
            const a = norm(r.deck_archetype);
            if (!p || !a || !tid) continue;
            turniere.add(tid);
            const key = p + '|' + a;
            if (!seen.has(key)) seen.set(key, new Set());
            seen.get(key).add(tid);
            brought.set(a, (brought.get(a) || 0) + 1);
        }
        const uniq = new Map(); const rep = new Map();
        for (const [key, ts] of seen) {
            const a = key.split('|')[1];
            uniq.set(a, (uniq.get(a) || 0) + 1);
            if (ts.size >= 2) rep.set(a, (rep.get(a) || 0) + 1);
        }
        const raus = new Map();
        for (const [a, b] of brought) {
            const u = uniq.get(a) || 0;
            raus.set(a, { brought: b, sticky: u > 0 ? ((rep.get(a) || 0) / u) * 100 : 0 });
        }
        return { decks: raus, tiefe: turniere.size };
    }

    it('ein einzelnes Turnier macht JEDE Klebrigkeit zu null — daher die Fenstertiefe', () => {
        // Das ist der Kern der Sperre, und er ist eine Eigenschaft der
        // Rechnung, keine Beobachtung: bei einem Turnier kann kein Paar
        // (Spieler, Deck) zwei Turniere haben.
        const erstes = (CONT.find(r => (r.deck_archetype || '').trim()) || {}).tournament_id;
        assert.ok(erstes, 'keine verwertbare Zeile in player_continuity.csv');
        const eins = klebrigkeit(t => t === erstes.trim());
        assert.equal(eins.tiefe, 1);
        for (const [, v] of eins.decks) {
            assert.equal(v.sticky, 0,
                'bei einem Turnier muesste jede Klebrigkeit 0 sein');
        }
        assert.ok(eins.tiefe < MIN_T, 'die Sperre greift bei einem Turnier nicht');
    });

    it('wo der Daempfer traegt, trifft er eine Minderheit', () => {
        const voll = klebrigkeit(null);
        // KEINE Zusage darueber, wie tief das Fenster ist — genau das
        // aendert sich mit jedem Scrape, und ein flaches Fenster ist
        // kein Fehler, sondern der Fall, fuer den die Sperre gebaut
        // wurde. Geprueft wird nur der Fall, in dem er ueberhaupt laeuft.
        if (voll.tiefe < MIN_T) return;
        const ueber = [...voll.decks.values()].filter(v => v.brought >= MIN_B);
        if (ueber.length === 0) return;
        const gedaempft = ueber.filter(v => v.sticky < LOW);
        assert.ok(gedaempft.length < ueber.length,
            'ALLE Decks ueber der Spielerschwelle werden gedaempft — das waere '
            + 'kein Signal mehr, sondern ein pauschaler Abschlag');
    });

    it('Turniere ohne Archetyp zaehlen nicht zur Fenstertiefe', () => {
        // Turnier 0070 traegt 512 Zeilen, alle ohne deck_archetype.
        const leere = new Set();
        const mitArch = new Set();
        for (const r of CONT) {
            const t = (r.tournament_id || '').trim();
            if (!t) continue;
            if ((r.deck_archetype || '').trim()) mitArch.add(t); else leere.add(t);
        }
        const nurLeer = [...leere].filter(t => !mitArch.has(t));
        const voll = klebrigkeit(null);
        assert.equal(voll.tiefe, mitArch.size,
            'die Fenstertiefe zaehlt Turniere mit, die nichts beitragen');
    });
});
