'use strict';
/*
 * Der Parameterkatalog sagt dasselbe wie der Motor.
 *
 * ANLASS (02.09.2026)
 * -------------------
 * `docs/predictor_hypothesis_catalog.json` führte `PHASE_B_BLEND_MAJOR`
 * als „current: 0.7" mit dem Bereich [0.5, 0.85]. Im Motor steht seit
 * längerem 0.20 — ein Wert, den der angegebene Bereich nicht einmal
 * enthält. Wer den Katalog liest, um den Motor zu verstehen, bekommt
 * eine Zahl, die dreieinhalbmal so groß ist wie die wirkliche.
 *
 * Zwei weitere Einträge, PREDICTOR_5_5_DECLINE_THRESHOLD und
 * PREDICTOR_5_5_DECLINE_DAMPER, standen mit „current: 0.85" da, als
 * wären sie in Betrieb — im Motor gibt es sie gar nicht mehr.
 *
 * Papier, das dem Code widerspricht, ist schlimmer als kein Papier: es
 * wird geglaubt. Dieser Test hält beide Seiten zusammen.
 *
 * Er prüft NICHT jede Zahl im Katalog — nur die, die im Motor eine
 * gleichnamige Konstante haben. Der Katalog darf Hypothesen und
 * verworfene Alternativen führen; er darf nur nicht behaupten, ein Wert
 * sei in Betrieb, wenn er es nicht ist.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WURZEL = path.join(__dirname, '..', '..');
const KATALOG = JSON.parse(
    fs.readFileSync(path.join(WURZEL, 'docs', 'predictor_hypothesis_catalog.json'), 'utf8'));
const MOTOR = fs.readFileSync(path.join(WURZEL, 'js', 'app-meta-call.js'), 'utf8');

/** Alle Parameter mit GROSSSCHREIBUNG — das sind die, die im Motor
 *  Konstanten sein sollen. Kleingeschriebene (`phase_b_min_majors`,
 *  `_alternative_floor_source`) sind Notizen und bleiben aussen vor. */
function konstantenParameter() {
    const raus = [];
    for (const [gruppe, g] of Object.entries(KATALOG.groups || {})) {
        for (const par of (g.parameters || [])) {
            const name = par.name || '';
            if (!/^[A-Z][A-Z0-9_]+$/.test(name)) continue;
            if (typeof par.current !== 'number') continue;
            raus.push({ gruppe, name, katalog: par.current, bereich: par.range });
        }
    }
    return raus;
}

function ausMotor(name) {
    const m = new RegExp('\\bconst\\s+' + name + '\\s*=\\s*([\\d.]+)\\s*;').exec(MOTOR);
    return m ? Number(m[1]) : null;
}

describe('Der Parameterkatalog widerspricht dem Motor nicht', () => {

    it('es gibt ueberhaupt Parameter zu pruefen', () => {
        const n = konstantenParameter().length;
        assert.ok(n >= 10,
            `nur ${n} grossgeschriebene Parameter im Katalog gefunden — `
            + 'entweder ist die Datei leer oder das Format hat sich geaendert');
    });

    it('jeder benannte Parameter existiert im Motor', () => {
        const fehlend = konstantenParameter()
            .filter((p) => ausMotor(p.name) === null)
            .map((p) => `${p.name} (Gruppe ${p.gruppe}, Katalog sagt ${p.katalog})`);
        assert.deepStrictEqual(fehlend, [],
            'Der Katalog fuehrt Parameter als in Betrieb, die es im Motor nicht '
            + 'gibt:\n  ' + fehlend.join('\n  ')
            + '\nEntweder wurde die Stufe entfernt und der Katalog nicht '
            + 'nachgezogen, oder die Konstante wurde umbenannt.');
    });

    it('jeder Wert stimmt mit dem Motor ueberein', () => {
        const abweichungen = [];
        for (const p of konstantenParameter()) {
            const code = ausMotor(p.name);
            if (code === null) continue;
            if (Math.abs(code - p.katalog) > 1e-9) {
                abweichungen.push(`${p.name}: Katalog ${p.katalog}, Motor ${code}`);
            }
        }
        assert.deepStrictEqual(abweichungen, [],
            'Katalog und Motor sagen Verschiedenes:\n  '
            + abweichungen.join('\n  ')
            + '\nPapier, das dem Code widerspricht, ist schlimmer als kein '
            + 'Papier — es wird geglaubt.');
    });

    it('der angegebene Bereich enthaelt den wirklichen Wert', () => {
        /* Genau hier fiel es auf: PHASE_B_BLEND_MAJOR stand mit Bereich
           [0.5, 0.85] da, waehrend der Motor auf 0.20 lief. Ein Bereich,
           der den eigenen Istwert ausschliesst, ist nicht bloss veraltet —
           er sagt "so weit darfst du nicht runter", waehrend der Code
           laengst darunter steht. */
        const raus = [];
        for (const p of konstantenParameter()) {
            const code = ausMotor(p.name);
            if (code === null || !Array.isArray(p.bereich) || p.bereich.length !== 2) continue;
            const [lo, hi] = p.bereich;
            if (code < lo - 1e-9 || code > hi + 1e-9) {
                raus.push(`${p.name}: Motor ${code} liegt ausserhalb [${lo}, ${hi}]`);
            }
        }
        assert.deepStrictEqual(raus, [], raus.join('\n  '));
    });
});
