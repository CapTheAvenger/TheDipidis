/**
 * DA-37 (03.10.2026, Tiefenanalyse D-11): 3.026 Karten zeigen einen Preis
 * „ohne Zuordnung", der vom 01./02.04.2026 stammt — ohne Datum. Die
 * Plakette nennt jetzt das Datum, wenn der Preis aelter als 30 Tage ist.
 * Die Funktion wird aus js/firebase-collection.js geschnitten und
 * AUSGEFUEHRT (Kommentare entfernt).
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Q = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'firebase-collection.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function laden(jetzt) {
  const a = Q.indexOf('const PRICE_TRUST_CASES');
  const b = Q.indexOf('if (typeof window !== \'undefined\') window.priceTrustBadge', a);
  assert.ok(a > -1 && b > a);
  const T = { 'preis.ohneZuordnung': 'ohne Zuordnung', 'preis.ohneZuordnungTitel': 'x', 'preis.vom': 'Preis vom {datum}',
    'preis.unverifiziert': 'ungeprueft', 'preis.unverifiziertTitel': 'y', 'preis.nummerDoppelt': 'doppelt', 'preis.nummerDoppeltTitel': 'z' };
  const RealDate = Date;
  class FestesDatum extends RealDate { constructor(...a) { super(...(a.length ? a : [jetzt])); } }
  // eslint-disable-next-line no-new-func
  return Function('window', 't', 'escapeHtml', 'Date',
    Q.slice(a, b) + '\nreturn { priceTrustBadge };')(
    { cardDBHasMappingStatus: true }, (k) => T[k] || k, (s) => String(s), FestesDatum);
}

describe('DA-37: alter Preis nennt sein Datum', () => {
  const { priceTrustBadge } = laden('2026-10-03T12:00:00Z');
  const datum = (stand) => (priceTrustBadge({ mapping_status: 'unmapped', price_last_updated: stand }).match(/Preis vom ([0-9.]+)/) || [])[1] || '';
  it('Preis vom 01.04.2026 ohne Zuordnung: Datum steht in der Plakette', () => {
    const h = priceTrustBadge({ mapping_status: 'unmapped', price_last_updated: '2026-04-01T06:00:00' });
    assert.match(h, /ohne Zuordnung · Preis vom 01\.04\.2026/);
  });
  it('frischer Preis: kein Datum', () => {
    assert.equal(datum('2026-10-02'), '');
    const h = priceTrustBadge({ mapping_status: 'unverified', price_last_updated: '2026-10-03' });
    assert.doesNotMatch(h, /Preis vom/);
  });
  it('ohne Datum oder Unsinn: kein Datum', () => {
    assert.equal(datum(''), '');
    assert.equal(datum('gestern'), '');
  });
});
