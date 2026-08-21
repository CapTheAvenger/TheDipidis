/**
 * Audit 2, Gruppe B — F08: Der "{n} cards found"-Zaehler in renderCardDatabase
 * zaehlte das um synthetische Prize-Pack-Kacheln augmentierte Array (live 4.403),
 * "Copy Names" kopiert aber nur window.filteredCardsData = die echten Karten
 * (4.287). 4287 + 116 (ppsMatches) = 4403. Zaehler und Copy meinten verschiedene
 * Mengen. Fix: der Zaehler stuetzt sich auf die echten Karten (ohne __prizePack).
 *
 * Test: die ECHTE Zaehl-/Augmentierungs-Region wird aus renderCardDatabase
 * geschnitten und mit Stubs ausgefuehrt; die vom Zaehler ausgegebene Zahl {n}
 * wird gegen die Zahl der von "Copy Names" kopierten Namen (echte Karten)
 * verglichen. Zaehlt der Code wieder das augmentierte Array, weicht {n} ab -> rot.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'app-cards-db.js'), 'utf8');

function cutRegion() {
  const from = 'const realCardsCount = cards.filter';
  const to = '// Create pagination controls';
  const a = SRC.indexOf(from);
  const b = SRC.indexOf(to, a);
  assert.ok(a > -1 && b > a, 'Zaehl-/Augment-Region nicht gefunden');
  return SRC.slice(a, b);
}

// Baut ein Feld echter Karten; einige davon haben eine Prize-Pack-Entsprechung.
function baueSzenario(nReal, nMitPrizePack) {
  const cards = [];
  const ppsIdx = {};
  for (let i = 0; i < nReal; i++) {
    const set = 'ASC';
    const number = String(100 + i);
    cards.push({ set, number, name: 'Karte ' + i });
    if (i < nMitPrizePack) {
      const key = `${set.toUpperCase()}-${number.replace(/^0+/, '') || '0'}`;
      ppsIdx[key] = { series: '9', en: 'stamped_en.png', de: 'stamped_de.png', price: 1.03 };
    }
  }
  return { cards, ppsIdx };
}

// Fuehrt die echte Region aus und gibt die gerenderte Zaehl-Zahl {n} zurueck.
function messeZaehler(cards, ppsIdx) {
  const region = cutRegion();
  let capturedN = null;
  const resultsInfo = {};
  Object.defineProperty(resultsInfo, 'textContent', {
    set(v) {
      // "{n} cards found (all shown)" -> Zahl herausziehen
      const m = String(v).match(/^([\d.,]+)/);
      if (m) capturedN = Number(m[1].replace(/[.,]/g, ''));
    },
  });
  const scope = {
    cards,
    window: { prizePackImagesIndex: ppsIdx },
    console: { warn() {} },
    _cdbT: (_key, fallback) => fallback,
    _cdbLocale: 'en-US',
    resultsInfo,
    showAllCards: true,
    cardsPerPage: 100,
    currentCardsPage: 1,
  };
  const names = Object.keys(scope);
  // eslint-disable-next-line no-new-func
  const fn = new Function(...names, region + '\nreturn cards;');
  const augmented = fn(...names.map(k => scope[k]));
  return { capturedN, augmentedLen: augmented.length };
}

describe('F08 — Zaehler == Anzahl der von Copy Names kopierten Namen', () => {
  it('bei Prize-Pack-Augmentierung zaehlt der Zaehler die echten Karten, nicht die Kacheln', () => {
    const nReal = 50;
    const nPP = 12;
    const { cards, ppsIdx } = baueSzenario(nReal, nPP);
    // Copy Names kopiert window.filteredCardsData (die echten Karten):
    const kopierteNamen = cards.map(c => c.name).length;
    const { capturedN, augmentedLen } = messeZaehler(cards, ppsIdx);

    // Beweis, dass die Augmentierung wirklich Kacheln hinzugefuegt hat:
    assert.equal(augmentedLen, nReal + nPP, 'Augmentierung hat nicht gegriffen');
    // Der Zaehler muss die echten Karten meinen, nicht das augmentierte Array:
    assert.equal(capturedN, kopierteNamen, `Zaehler (${capturedN}) != kopierte Namen (${kopierteNamen})`);
    assert.notEqual(capturedN, augmentedLen, 'Zaehler zaehlt faelschlich die augmentierten Kacheln mit');
  });

  it('ohne Prize-Pack-Index bleibt der Zaehler = echte Karten', () => {
    const { cards } = baueSzenario(20, 0);
    const { capturedN } = messeZaehler(cards, null);
    assert.equal(capturedN, 20);
  });
});
