'use strict';
/*
 * UI-113 (05.10.2026): „Neu hier?"-Band + Kopf-„?". Befund Agent 1: die
 * Startseite begann mit Daten, ohne einen Satz, was die Seite ist.
 * Ausgefuehrt: js/neu-hier.js — sichtbar bis weggeklickt, dann gemerkt.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { lies } = require('./lib-dom-sandkasten.js');

const QUELLE = lies('js', 'neu-hier.js');

function lauf(quelle, speicher) {
    const klassen = new Set(['neu-hier-band', 'd-none']);
    const band = { classList: { toggle: (k, an) => { if (an) klassen.add(k); else klassen.delete(k); } } };
    const ctx = vm.createContext({
        document: { readyState: 'complete', getElementById: (id) => (id === 'neuHierBand' ? band : null), addEventListener() {} },
        localStorage: { getItem: (k) => (k in speicher ? speicher[k] : null), setItem: (k, v) => { speicher[k] = String(v); } },
        window: {},
    });
    ctx.window = ctx;
    vm.runInContext(quelle, ctx);
    return { N: ctx.NeuHier, sichtbar: () => !klassen.has('d-none') };
}

describe('UI-113: Neu hier?', () => {
    it('zeigt sich beim ersten Besuch', () => {
        const r = lauf(QUELLE, {});
        assert.ok(r.sichtbar());
    });
    it('weggeklickt bleibt es weg — auch nach Neuladen', () => {
        const speicher = {};
        const r = lauf(QUELLE, speicher);
        r.N.weg();
        assert.ok(!r.sichtbar());
        assert.ok(!lauf(QUELLE, speicher).sichtbar());
    });
    it('VERFAELSCHUNG: ohne Merken kommt es nach Neuladen wieder', () => {
        const kaputt = QUELLE.replace("try { localStorage.setItem(KEY, '1'); }", 'try { }');
        assert.notEqual(kaputt, QUELLE);
        const speicher = {};
        lauf(kaputt, speicher).N.weg();
        assert.ok(lauf(kaputt, speicher).sichtbar());
    });
    it('Band mit Satz und drei Einstiegen, Kopf-„?" zur Anleitung, beide Sprachen', () => {
        const html = lies('index.html');
        assert.match(html, /id="neuHierBand"/);
        const band = html.slice(html.indexOf('id="neuHierBand"'), html.indexOf('</section>', html.indexOf('id="neuHierBand"')));
        assert.equal((band.match(/class="btn btn-(primary|secondary)"/g) || []).length, 3);
        assert.match(html, /id="hilfeKnopf"[^>]*onclick="switchTabAndUpdateMenu\('tutorial'\)"/);
        const i18n = lies('js', 'i18n.js');
        for (const k of ['neu.titel', 'neu.satz', 'neu.deck', 'neu.turnier', 'neu.anleitung', 'neu.weg', 'header.hilfe']) {
            assert.equal((i18n.match(new RegExp("'" + k.replace('.', '\\.') + "':", 'g')) || []).length, 2, k);
        }
    });
});
