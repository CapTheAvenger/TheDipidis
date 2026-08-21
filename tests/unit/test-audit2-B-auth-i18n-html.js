/**
 * Audit 2, Gruppe B — F12: Die Auth-Umschalt-Buttons (hasAccount / noAccount)
 * trugen HTML-Markup in ihrer Uebersetzung (<strong>Anmelden</strong>), hatten
 * aber KEIN data-i18n-html und daneben ein statisches englisches Kind
 * (<strong>Sign In</strong>). Der Renderer waehlte deshalb den Textknoten-Zweig
 * von updateTranslationsInDOM: er schrieb die Uebersetzung als textContent in den
 * ersten Textknoten (spitze Klammern LITERAL sichtbar) und liess das englische
 * Kind stehen. Gemessen (Live-DOM, 21.08.2026):
 *   de -> 'Bereits ein Konto? <strong>Anmelden</strong> Sign In'
 *
 * Fix: data-i18n-html an beide Buttons (innerHTML-Zweig) + de-noAccount auf die
 * gleiche <strong>-Auszeichnung wie en vereinheitlicht.
 *
 * Dieser Test fuehrt die ECHTE Renderschleife (aus updateTranslationsInDOM,
 * i18n.js) mit einem DOM-Stub aus und baut die Button-Elemente aus dem ECHTEN
 * index.html-Markup. Faellt data-i18n-html im HTML weg, greift wieder der
 * Textknoten-Zweig -> literales '<strong>' + 'Sign In' -> rot.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const I18N = fs.readFileSync(path.join(ROOT, 'js', 'i18n.js'), 'utf8');

// --- Echte Uebersetzungswerte aus i18n.js ziehen (de-Tabelle bevorzugt) -----
function transVal(key, langHint) {
  // Beide Vorkommen (en/de) finden; das zweite ist die de-Tabelle.
  const re = new RegExp("'" + key.replace('.', '\\.') + "':\\s*(['\"])([\\s\\S]*?)\\1", 'g');
  const hits = [];
  let m;
  while ((m = re.exec(I18N))) hits.push(m[2]);
  assert.ok(hits.length >= 2, 'erwartete en+de fuer ' + key + ', fand ' + hits.length);
  return langHint === 'de' ? hits[hits.length - 1] : hits[0];
}

// --- Minimaler DOM-Stub -----------------------------------------------------
const NODE = { TEXT_NODE: 3, ELEMENT_NODE: 1 };

// Zerlegt einfaches HTML (Text + einstufige <strong>...) in childNodes.
function parseNodes(html) {
  const nodes = [];
  const re = /<(\w+)[^>]*>([\s\S]*?)<\/\1>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[1]) {
      nodes.push({ nodeType: NODE.ELEMENT_NODE, tagName: m[1].toUpperCase(), textContent: m[2] });
    } else if (m[3]) {
      nodes.push({ nodeType: NODE.TEXT_NODE, textContent: m[3] });
    }
  }
  return nodes;
}

// Sichtbarer Text = was ein Nutzer liest (Tags eines echten <strong> sind
// NICHT sichtbar; literaler Text mit spitzen Klammern schon).
function visible(el) {
  return el._nodes.map(n => n.textContent).join('');
}

function makeButton(attrs, innerHtml) {
  const el = {
    _attrs: attrs,
    _nodes: parseNodes(innerHtml),
    getAttribute: (k) => (k in attrs ? attrs[k] : null),
    hasAttribute: (k) => k in attrs,
    setAttribute: (k, v) => { attrs[k] = v; },
    querySelector: () => null,
    set innerHTML(v) { el._nodes = parseNodes(v); el._raw = v; },
    get innerHTML() { return el._raw; },
    get children() { return el._nodes.filter(n => n.nodeType === NODE.ELEMENT_NODE); },
    get childNodes() { return el._nodes; },
  };
  return el;
}

// Button-Markup aus index.html holen: <button ... data-i18n="KEY" ...>INHALT</button>
function buttonFromHtml(key) {
  const re = new RegExp('<button([^>]*data-i18n="' + key.replace('.', '\\.') + '"[^>]*)>([\\s\\S]*?)</button>');
  const m = HTML.match(re);
  assert.ok(m, 'Button fuer ' + key + ' nicht in index.html gefunden');
  const attrStr = m[1];
  const inner = m[2].trim();
  const attrs = {};
  // data-i18n="..."
  const kv = /([\w-]+)="([^"]*)"/g;
  let a;
  while ((a = kv.exec(attrStr))) attrs[a[1]] = a[2];
  // boolesche Attribute (z.B. data-i18n-html)
  const bare = /(?:^|\s)(data-i18n-html)(?=\s|$)/g;
  let b;
  while ((b = bare.exec(attrStr))) attrs[b[1]] = '';
  return makeButton(attrs, inner);
}

// Die ECHTE data-i18n-Renderschleife aus updateTranslationsInDOM schneiden.
function cutRenderLoop() {
  const from = "document.querySelectorAll('[data-i18n]').forEach(el => {";
  const to = "document.querySelectorAll('[data-i18n-placeholder]')";
  const a = I18N.indexOf(from);
  const b = I18N.indexOf(to, a);
  assert.ok(a > -1 && b > a, 'Renderschleife nicht gefunden');
  return I18N.slice(a, b);
}

function render(buttons, lang) {
  const loop = cutRenderLoop();
  const document = { querySelectorAll: () => buttons };
  const t = (key) => transVal(key, lang);
  // eslint-disable-next-line no-new-func
  const fn = new Function('document', 't', 'Node', loop + '\n');
  fn(document, t, NODE);
}

describe('F12 — Auth-Buttons rendern kein literales Markup und keinen EN-Rest', () => {
  it('de hasAccount: "Bereits ein Konto? Anmelden", ohne "Sign In" und ohne literale <strong>', () => {
    const btn = buttonFromHtml('auth.hasAccount');
    render([btn], 'de');
    const txt = visible(btn);
    assert.ok(!txt.includes('<strong>'), 'literales <strong> sichtbar: ' + JSON.stringify(txt));
    assert.ok(!/Sign In/i.test(txt), 'englischer Rest "Sign In" geblieben: ' + JSON.stringify(txt));
    assert.match(txt, /Bereits ein Konto\?/);
    assert.match(txt, /Anmelden/);
  });

  it('de noAccount: "Noch kein Konto? Registrieren", ohne "Sign Up" und ohne literale <strong>', () => {
    const btn = buttonFromHtml('auth.noAccount');
    render([btn], 'de');
    const txt = visible(btn);
    assert.ok(!txt.includes('<strong>'), 'literales <strong> sichtbar: ' + JSON.stringify(txt));
    assert.ok(!/Sign Up/i.test(txt), 'englischer Rest "Sign Up" geblieben: ' + JSON.stringify(txt));
    assert.match(txt, /Registrieren/);
  });

  it('en hasAccount: "Sign In" nur EINMAL (kein doppeltes Kind)', () => {
    const btn = buttonFromHtml('auth.hasAccount');
    render([btn], 'en');
    const txt = visible(btn);
    assert.ok(!txt.includes('<strong>'), 'literales <strong> sichtbar: ' + JSON.stringify(txt));
    const treffer = (txt.match(/Sign In/gi) || []).length;
    assert.equal(treffer, 1, '"Sign In" ' + treffer + '-mal statt einmal: ' + JSON.stringify(txt));
  });

  it('de- und en-Uebersetzung tragen dieselbe <strong>-Auszeichnung', () => {
    for (const key of ['auth.hasAccount', 'auth.noAccount']) {
      assert.match(transVal(key, 'de'), /<strong>[^<]+<\/strong>/, key + ' de ohne <strong>');
      assert.match(transVal(key, 'en'), /<strong>[^<]+<\/strong>/, key + ' en ohne <strong>');
    }
  });
});
