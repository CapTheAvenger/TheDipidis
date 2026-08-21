/**
 * Audit 3 — Weg 2, Etappe 1: Ausstieg aus dem 12-px-Boden fuers Handy.
 *
 * Ausgangslage (gemessen 21.08.2026 bei 390 px im Aktuellen Meta):
 * 354 von 395 sichtbaren Textknoten lagen auf exakt 12 px — 89,6 %. Die
 * Rangordnung, die das Designsystem am Schreibtisch herstellt, gab es auf dem
 * Telefon nicht.
 *
 * Weg 3 (font-size: max(12px, 1em)) waere ein No-op gewesen, weil der Body
 * selbst 12 px traegt und 1em damit ueberall 12 px ergibt. Gewaehlt wurde
 * deshalb Weg 2: die Skala aus tokens.css uebernehmen, Ansicht fuer Ansicht.
 * Der Ausstieg haengt an der Klasse .fs-scale, damit das Uebernehmen einer
 * Ansicht eine Wortaenderung im HTML ist und keine weitere Zeile in der
 * Ausnahmeliste — die Liste war der Fehler, nicht ihre Laenge.
 *
 * Was der Boden verdeckt hat, zeigte sich erst beim Abschalten: 181 Knoten
 * fielen unter 11 px, davon 90 auf 6,6 px. Ursache ist multiplizierendes em
 * (.top-card-stats 0.65em, Kinder noch einmal 0.82/0.78/0.72em) — der Boden
 * hob jedes Element EINZELN auf 12 px, weshalb die Verschachtelung nie
 * auffiel. Diese Komponenten haben jetzt absolute Tokenwerte.
 *
 * Der Test prueft die Regeln, nicht Screenshots: dass der Ausstieg existiert,
 * dass die uebernommene Ansicht ihn traegt, dass die Tokenwerte gesetzt sind
 * und dass dabei kein neues !important entstanden ist.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const R = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const MOBILE = R('css/mobile-responsive.css');
const TOKENS = R('css/tokens.css');
const INDEX = R('index.html');

describe('Audit 3 — Etappe 1 des 12-px-Ausstiegs', () => {

  it('der Boden hat einen Ausstieg, und zwar an JEDEM seiner Selektoren', () => {
    // Sonst greift er bei einer der 32 Zeilen doch noch und die Ansicht
    // bekommt ein zufaelliges Gemisch aus Boden und Skala.
    const zeilen = MOBILE.split('\n')
      .filter(l => l.includes('.tab-content') && l.includes(':not(.ds-panel *)'));
    assert.ok(zeilen.length >= 32,
      `nur ${zeilen.length} Selektoren der Sammelregel gefunden`);
    for (const l of zeilen) {
      assert.ok(l.includes(':not(.fs-scale *)'),
        'Selektor ohne Ausstieg: ' + l.trim().slice(0, 90));
    }
  });

  it('das Aktuelle Meta ist die uebernommene Ansicht', () => {
    assert.match(INDEX, /id="current-meta"[^>]*class="[^"]*\bfs-scale\b/,
      '#current-meta traegt die Klasse nicht — dann aendert der Ausstieg nichts');
  });

  it('die Skala, aus der die Groessen kommen, gibt es wirklich', () => {
    for (const t of ['--fs-xs', '--fs-sm', '--fs-md', '--fs-lg', '--fs-xl', '--fs-hero']) {
      assert.ok(TOKENS.includes(t + ':'), 'Token fehlt in tokens.css: ' + t);
    }
  });

  it('die em-Ketten der uebernommenen Ansicht sind auf Tokens umgestellt', () => {
    // Genau die Komponenten, die ohne Boden auf 5,6 bis 6,6 px fielen.
    const block = MOBILE.slice(MOBILE.indexOf('#current-meta.fs-scale'));
    for (const k of ['.top-card-stats', '.top-card-share', '.top-card-decks',
                     '.top-card-rank', '.top-card-name', '.heatmap-td-n']) {
      assert.ok(block.includes('#current-meta.fs-scale ' + k),
        'ohne Tokenwert faellt diese Klasse unter 11 px: ' + k);
    }
    assert.match(block, /font-size:\s*var\(--fs-(xs|sm)\)/,
      'die Groessen muessen aus der Skala kommen, nicht als neue Sonderwerte');
  });

  it('der Ausstieg kommt ohne neues !important aus', () => {
    // Der Boden greift in der Ansicht nicht mehr, also genuegt Spezifitaet.
    // #current-meta.fs-scale (1,2,0) schlaegt #currentMetaContent (1,1,0).
    const block = MOBILE.slice(MOBILE.indexOf('#current-meta.fs-scale'),
                               MOBILE.indexOf('Formularfelder'));
    assert.ok(!/!important/.test(block),
      'der neue Block enthaelt !important — der Zaehler darf nicht steigen');
  });
});
