/**
 * Festlegung A (Hausi, 06.10.2026): „Kein nach links und rechts scrollen …
 * Nirgendwo, niemals." Gemessen 06.10. bei 390 px: Profil-Untertabs (UI-110,
 * nowrap + overflow-x), Heatmap 364→1.671, 23 Matchup-Tabellen 359→404,
 * Meta-Rangliste 518→621, Japan-Siegertabelle 329→367.
 *
 * js/kein-querscroll.js wird AUSGEFUEHRT — mit einem kleinen Schein-DOM:
 * eine Tabelle, die breiter ist als ihr Bildlaufbereich, muss bei 390 px
 * ausgeblendet und als Kartenliste gezeigt werden, bei 1.200 px nicht.
 * Die CSS-Zusage (keine Wischzeile fuer die Profil-Untertabs) wird gelesen,
 * Kommentare vorher heraus.
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const lies = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
const ohneCss = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '');
const QUELLE = lies('js/kein-querscroll.js');

/* ---- Schein-DOM: nur, was das Modul anfasst ---- */
class El {
  constructor(tag) {
    this.tagName = tag.toUpperCase(); this.children = []; this.parentElement = null; this.parentNode = null;
    this.attrs = {}; this.className = ''; this.hidden = false; this._text = ''; this._html = '';
    this.colSpan = 1; this.breite = 0; this.clientWidth = 0; this.ox = 'visible'; this.listener = {};
    const st = {}; this.style = { _p: st, setProperty: (k, v) => { st[k] = v; }, removeProperty: (k) => { delete st[k]; },
      get display() { return st.display || ''; } };
  }
  get isConnected() { let a = this; while (a.parentElement) a = a.parentElement; return a === dok.body; }
  appendChild(c) { c.parentElement = c.parentNode = this; this.children.push(c); return c; }
  insertAdjacentElement(pos, c) { const p = this.parentElement; const i = p.children.indexOf(this);
    p.children.splice(i + 1, 0, c); c.parentElement = c.parentNode = p; return c; }
  replaceWith(c) { const p = this.parentElement; const i = p.children.indexOf(this); p.children[i] = c; c.parentElement = c.parentNode = p; this.parentElement = null; }
  remove() { const p = this.parentElement; if (p) { p.children.splice(p.children.indexOf(this), 1); this.parentElement = null; } }
  setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  hasAttribute(k) { return k in this.attrs; } removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(t, f) { (this.listener[t] = this.listener[t] || []).push(f); }
  get textContent() { return this._text || this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this._text = String(v); this.children = []; }
  get innerHTML() { return this._html || this.textContent; } set innerHTML(v) { this._html = String(v); this._text = String(v).replace(/<[^>]*>/g, ''); }
  get offsetWidth() { return this.style.display === 'none' ? 0 : this.breite; } get offsetHeight() { return this.offsetWidth ? 20 : 0; }
  getClientRects() { return this.offsetWidth ? [1] : []; }
  getBoundingClientRect() { return { width: this.offsetWidth }; }
  cloneNode() { const c = new El(this.tagName); c._text = this.textContent; return c; }
  querySelectorAll() { return []; } closest() { return null; } click() { this.geklickt = (this.geklickt || 0) + 1; }
  get rows() { return this.alleZeilen || []; } get cells() { return this.children; }
}
let dok;
function tabelle(kopf, zeilen, breite) {
  const t = new El('table'); t.breite = breite;
  const th = new El('thead'); const kr = new El('tr'); kopf.forEach((x) => { const c = new El('th'); c._text = x; kr.appendChild(c); });
  th.appendChild(kr); th.alleZeilen = [kr]; t.appendChild(th); t.tHead = th;
  const tb = new El('tbody'); const trs = zeilen.map((z) => { const tr = new El('tr'); z.forEach((x) => { const c = new El('td'); c._text = x; tr.appendChild(c); }); tb.appendChild(tr); return tr; });
  tb.alleZeilen = trs; t.appendChild(tb); t.tBodies = [tb]; t.alleZeilen = [kr].concat(trs);
  return t;
}
function welt(fensterBreite, tabBreite, quelle) {
  dok = { body: new El('body'), documentElement: new El('html') };
  dok.documentElement.clientWidth = fensterBreite; dok.documentElement.lang = 'de';
  const huelle = new El('div'); huelle.ox = 'auto'; huelle.clientWidth = Math.min(fensterBreite, 360); huelle.breite = 360;
  dok.body.appendChild(huelle);
  const t = tabelle(['#', 'Deck', 'Anteil', 'WR'], [['1', 'Dragapult', '12 %', '52 %'], ['2', 'Gholdengo', '9 %', '-']], tabBreite);
  huelle.appendChild(t);
  dok.querySelectorAll = (sel) => (sel.startsWith('table') && !t.hasAttribute('data-qs-ersetzt') && t.isConnected ? [t] : []);
  dok.createElement = (tag) => new El(tag); dok.createTextNode = (s) => { const e = new El('#text'); e._text = s; return e; };
  dok.addEventListener = () => {};
  const win = { innerWidth: fensterBreite, addEventListener() {}, getComputedStyle: (el) => ({ overflowX: el.ox || 'visible', display: el.style.display || 'block', visibility: 'visible' }) };
  vm.runInNewContext(quelle, { window: win, document: dok, Map, setTimeout: () => 0, MutationObserver: undefined });
  return { win, t, huelle };
}

describe('Festlegung A: keine seitlich wischbare Tabelle am Handy', () => {
  it('390 px: zu breite Tabelle wird Kartenliste, je Zeile eine Karte', () => {
    const { t, huelle } = welt(390, 621, QUELLE);
    assert.equal(t.style.display, 'none');
    const liste = huelle.children[1];
    assert.ok(liste && liste.className === 'qs-karten', 'Kartenliste steht direkt hinter der Tabelle');
    const karten = liste.children.filter((k) => /qs-karte\b/.test(k.className));
    assert.equal(karten.length, 2);
    assert.equal(karten[0].children[0].textContent, '1 · Dragapult');
    const dl = karten[0].children[1].children.map((c) => c.textContent);
    assert.deepEqual(dl, ['Anteil', '12 %', 'WR', '52 %']);
    /* „-" (keine Daten) belegt keine Zeile */
    assert.deepEqual(karten[1].children[1].children.map((c) => c.textContent), ['Anteil', '9 %']);
  });
  it('390 px: passende Tabelle bleibt Tabelle', () => {
    const { t, huelle } = welt(390, 340, QUELLE);
    assert.equal(t.style.display, '');
    assert.equal(huelle.children.length, 1);
  });
  it('1.200 px: nichts wird umgebaut (nur Handy)', () => {
    const { t, huelle } = welt(1200, 1671, QUELLE);
    assert.equal(t.style.display, '');
    assert.equal(huelle.children.length, 1);
  });
  it('reine Hilfen: Spaltentitel mit colspan, Titel = Rang + Name', () => {
    const w = welt(1200, 0, QUELLE).win.DsKeinQuerscroll;
    assert.deepEqual(Array.from(w.qsSpaltenTitel([{ text: ' A ' }, { text: 'B', colspan: 2 }])), ['A', 'B', 'B']);
    assert.deepEqual(Array.from(w.qsTitelZellen(['3', 'Raging Bolt', '7 %'])), [0, 1]);
    assert.deepEqual(Array.from(w.qsTitelZellen(['3', '120', 'Raging Bolt'])), [0, 2]);
    assert.deepEqual(Array.from(w.qsTitelZellen(['12.09.2026', 'Open'])), [1]);
    assert.deepEqual(Array.from(w.qsTitelZellen(['Dragapult', '52 %'])), [0]);
    assert.deepEqual(Array.from(w.qsTitelZellen(['1', '2'])), [0]);
  });
  it('Verdrahtung: Modul geladen und im Offline-Cache', () => {
    assert.match(lies('index.html'), /<script src="js\/kein-querscroll\.js\?v=\d+" defer><\/script>/);
    assert.match(lies('service-worker.js'), /'\.\/js\/kein-querscroll\.js'/);
  });
  it('Profil-Untertabs: keine Wischzeile (UI-110 nowrap/overflow-x ist weg)', () => {
    for (const datei of fs.readdirSync(path.join(__dirname, '..', '..', 'css'))) {
      if (!datei.endsWith('.css')) continue;
      const css = ohneCss(lies('css/' + datei));
      const re = /([^{}]*)\{([^{}]*)\}/g; let m;
      while ((m = re.exec(css))) {
        if (!/#profile-tab-nav|profile-tab-group-buttons/.test(m[1])) continue;
        assert.doesNotMatch(m[2], /overflow-x\s*:\s*(auto|scroll)|flex-wrap\s*:\s*nowrap/, datei + ': ' + m[1].trim());
        assert.doesNotMatch(m[2], /display\s*:\s*contents/, datei + ': Gruppen bleiben Block — ' + m[1].trim());
      }
    }
  });
  it('Verfaelschungsprobe: ohne Ersetzen bleibt die breite Tabelle stehen', () => {
    const kaputt = QUELLE.replace('if (ragtHinaus(t)) ersetze(t);', 'if (false) ersetze(t);');
    assert.notEqual(kaputt, QUELLE);
    const { t } = welt(390, 621, kaputt);
    assert.throws(() => assert.equal(t.style.display, 'none'));
  });
  it('Verfaelschungsprobe: Grenze weg → auch der PC wuerde umgebaut', () => {
    const kaputt = QUELLE.replace('var schmal = window.innerWidth <= GRENZE;', 'var schmal = true;');
    assert.notEqual(kaputt, QUELLE);
    const { t } = welt(1200, 1671, kaputt);
    assert.throws(() => assert.equal(t.style.display, ''));
  });
});
