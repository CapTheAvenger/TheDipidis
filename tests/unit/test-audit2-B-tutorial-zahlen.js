/**
 * Audit 2, Gruppe B — F16: Im Tutorial-Mockup stimmten Beispielzahlen nicht zu
 * ihren Records und eine Staple-Tagline nannte den falschen Namen.
 *   42–38–0 -> 42/80 = 52,5 % (im HTML stand 52,8)
 *   29–21–0 -> 29/50 = 58,0 % (im HTML stand 58,1)
 *   Tagline "… bei 97,1 %" gehoert zur 97,1-%-Mockup-Zeile = Iono (nicht Lillie's)
 *
 * Test (kein reiner Regex-Vergleich): die Record-Zahlen werden aus dem HTML
 * gelesen, die Winrate NACHGERECHNET und mit dem angezeigten Wert verglichen;
 * die Tagline wird gegen die tatsaechliche 97,1-%-Staple-Zeile geprueft.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'tutorial', 'tutorial.de.html'), 'utf8');

// Winrate aus Record nachrechnen, deutsch mit 1 Nachkommastelle formatiert.
function wrAusRecord(w, l) {
  const wr = (w / (w + l)) * 100;
  return wr.toFixed(1).replace('.', ',');
}

// Alle Beispiel-Matchup-Zeilen (WR + Record) aus dem HTML ziehen.
function matchupZeilen() {
  const re = /mockup-matchup-wr[^>]*>([\d.,]+)\s*%<\/span>\s*<span class="mockup-matchup-record">(\d+)[–-](\d+)[–-](\d+)</g;
  const out = [];
  let m;
  while ((m = re.exec(HTML))) {
    out.push({ angezeigt: m[1], w: Number(m[2]), l: Number(m[3]) });
  }
  return out;
}

describe('F16 — Tutorial-Beispielzahlen stimmen zu ihren Records', () => {
  it('jede Beispielzeile: angezeigte WR == nachgerechnete WR', () => {
    const zeilen = matchupZeilen();
    assert.ok(zeilen.length >= 2, 'erwartete >=2 Beispielzeilen, fand ' + zeilen.length);
    for (const z of zeilen) {
      const soll = wrAusRecord(z.w, z.l);
      assert.equal(z.angezeigt, soll,
        `Record ${z.w}-${z.l} ergibt ${soll} %, HTML zeigt ${z.angezeigt} %`);
    }
  });

  it('42–38–0 ist explizit als 52,5 % (nicht 52,8) gerendert', () => {
    const z = matchupZeilen().find(x => x.w === 42 && x.l === 38);
    assert.ok(z, '42–38–0-Zeile fehlt');
    assert.equal(z.angezeigt, '52,5');
  });

  it('29–21–0 ist explizit als 58,0 % (nicht 58,1) gerendert', () => {
    const z = matchupZeilen().find(x => x.w === 29 && x.l === 21);
    assert.ok(z, '29–21–0-Zeile fehlt');
    assert.equal(z.angezeigt, '58,0');
  });

  it('Staple-Tagline nennt den Namen der 97,1-%-Mockup-Zeile (Iono, nicht Lillie’s)', () => {
    // Name aus der Staple-Mockup-Zeile mit 97,1 % lesen.
    // Auf DIESELBE Zeile beschraenken: zwischen Name und pct darf kein
    // weiterer mockup-staple-name stehen (sonst spannt es ueber Zeilen).
    const zeile = HTML.match(/<span class="mockup-staple-name">([^<]+)<\/span>(?:(?!mockup-staple-name)[\s\S])*?<span class="mockup-staple-pct">97,1\s*%<\/span>/);
    assert.ok(zeile, '97,1-%-Staple-Zeile nicht gefunden');
    const name = zeile[1].trim(); // 'Iono'
    // Die Tagline "… bei 97,1 %" muss denselben Namen nennen.
    const tagline = HTML.match(/(\S+(?:'s|’s)?)\s+bei\s+97,1\s*%/);
    assert.ok(tagline, 'Tagline mit 97,1 % nicht gefunden');
    assert.ok(tagline[1].includes(name),
      `Tagline nennt "${tagline[1]}", die 97,1-%-Zeile ist aber "${name}"`);
    assert.ok(!/Lillie/.test(tagline[0]), 'Tagline nennt faelschlich noch Lillie’s');
  });
});
