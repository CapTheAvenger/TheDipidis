/**
 * UI-39 (28.09.2026): die kleine Zeile im aktiven Format-Chip der Anleitung
 * („aktuell"/„current") stand mit Deckkraft 0,7 weiss auf Blau — 4,23:1
 * statt 4,5:1, gemessen mit scripts/messe_schrift_kontrast.py bei 390 px,
 * hell und dunkel. Das ist eine Regel, also wird die Regel geprueft —
 * mit herausgeschnittenen Kommentaren.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const roh = fs.readFileSync(path.join(__dirname, '..', '..', 'css', 'profile-howto-info.css'), 'utf8');
const css = roh.replace(/\/\*[\s\S]*?\*\//g, '');

test('das Ausschneiden der Kommentare laesst die Regeln stehen', () => {
    assert.ok(css.length > roh.length * 0.3);
});

test('im aktiven Format-Chip steht die kleine Zeile in voller Deckkraft', () => {
    const regeln = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter((m) => /\.mockup-format-chip\.is-active\s+small\s*$/.test(m[1].trim()));
    assert.ok(regeln.length, 'die Regel fuer die kleine Zeile im aktiven Chip fehlt');
    const letzte = regeln[regeln.length - 1][2];
    const m = /opacity:\s*([\d.]+)/.exec(letzte);
    assert.ok(m && parseFloat(m[1]) >= 1,
        'die kleine Zeile im aktiven Chip ist wieder durchscheinend — weiss auf Blau faellt dann unter 4,5:1');
});
