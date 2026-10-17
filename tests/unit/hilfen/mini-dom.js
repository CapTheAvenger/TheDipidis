/* mini-dom.js — ein kleiner DOM-Ersatz fuer Zusicherungen, die Code
 * AUSFUEHREN muessen, der echte DOM-Methoden nutzt (querySelectorAll mit
 * einfachen Selektoren, cloneNode, outerHTML, insertAdjacentHTML …).
 *
 * Kein jsdom im Repo (und der Deploy-Test installiert nur papaparse).
 * Angelegt am 17.10.2026 fuer tests/unit/test-masterclass-live.js.
 *
 * Kann: Elemente, Text, Attribute, Selektoren aus Typ, .klasse, #id,
 * [attr], [attr="wert"] und dem Nachfahren-Leerzeichen, Kommalisten.
 * Kann NICHT: Pseudoklassen, >, +, ~ — wer sie braucht, merkt es am
 * Fehler ("Selektor nicht unterstuetzt"), nicht an einem falschen Treffer.
 */
'use strict';

const LEER = new Set(['img', 'br', 'input', 'meta', 'link', 'hr', 'source', 'wbr']);

function entitaeten(s) {
    return String(s).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (g, e) => {
        const k = e.toLowerCase();
        if (k[0] === '#') return String.fromCodePoint(k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
        return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[k];
    });
}
function maske(s, attr) {
    let t = String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    if (attr) t = t.replace(/"/g, '&quot;');
    return t;
}

class Knoten {
    constructor(typ) { this.nodeType = typ; this.parentNode = null; this.childNodes = []; }
    get nextSibling() {
        if (!this.parentNode) return null;
        const g = this.parentNode.childNodes;
        return g[g.indexOf(this) + 1] || null;
    }
    get textContent() { return this.childNodes.map((k) => k.textContent).join(''); }
    set textContent(v) { this.childNodes.forEach((k) => { k.parentNode = null; }); this.childNodes = []; this.appendChild(new Text(String(v))); }
    appendChild(k) { if (k.parentNode) k.parentNode.removeChild(k); k.parentNode = this; this.childNodes.push(k); return k; }
    removeChild(k) { const i = this.childNodes.indexOf(k); if (i >= 0) this.childNodes.splice(i, 1); k.parentNode = null; return k; }
    insertBefore(k, ref) {
        if (!ref) return this.appendChild(k);
        if (k.parentNode) k.parentNode.removeChild(k);
        k.parentNode = this;
        this.childNodes.splice(this.childNodes.indexOf(ref), 0, k);
        return k;
    }
}

class Text extends Knoten {
    constructor(t) { super(3); this.nodeValue = t; this.nodeName = '#text'; }
    get textContent() { return this.nodeValue; }
    set textContent(v) { this.nodeValue = String(v); }
    get outerHTML() { return maske(this.nodeValue); }
    cloneNode() { return new Text(this.nodeValue); }
}

class Element extends Knoten {
    constructor(tag) { super(1); this.tagName = tag.toUpperCase(); this.nodeName = this.tagName; this.attr = new Map(); this.hidden = false; }
    get children() { return this.childNodes.filter((k) => k.nodeType === 1); }
    getAttribute(n) { return this.attr.has(n) ? this.attr.get(n) : null; }
    setAttribute(n, v) { this.attr.set(n, String(v)); if (n === 'hidden') this.hidden = true; }
    hasAttribute(n) { return this.attr.has(n); }
    removeAttribute(n) { this.attr.delete(n); }
    get className() { return this.getAttribute('class') || ''; }
    set className(v) { this.setAttribute('class', v); }
    get id() { return this.getAttribute('id') || ''; }
    get outerHTML() {
        const t = this.tagName.toLowerCase();
        let a = '';
        this.attr.forEach((v, k) => { a += v === '' && k === 'hidden' ? ' hidden' : ` ${k}="${maske(v, true)}"`; });
        if (this.hidden && !this.attr.has('hidden')) a += ' hidden';
        if (LEER.has(t)) return `<${t}${a}>`;
        return `<${t}${a}>${this.innerHTML}</${t}>`;
    }
    get innerHTML() { return this.childNodes.map((k) => k.outerHTML).join(''); }
    set innerHTML(html) {
        this.childNodes.forEach((k) => { k.parentNode = null; });
        this.childNodes = [];
        parse(String(html)).forEach((k) => this.appendChild(k));
    }
    insertAdjacentHTML(wo, html) {
        const neu = parse(String(html));
        if (wo === 'beforeend') neu.forEach((k) => this.appendChild(k));
        else if (wo === 'afterbegin') { const erst = this.childNodes[0] || null; neu.forEach((k) => this.insertBefore(k, erst)); }
        else if (wo === 'afterend') { const n = this.nextSibling; neu.forEach((k) => this.parentNode.insertBefore(k, n)); }
        else if (wo === 'beforebegin') neu.forEach((k) => this.parentNode.insertBefore(k, this));
        else throw new Error('insertAdjacentHTML: ' + wo);
    }
    cloneNode(tief) {
        const e = new Element(this.tagName);
        this.attr.forEach((v, k) => e.attr.set(k, v));
        e.hidden = this.hidden;
        if (tief) this.childNodes.forEach((k) => e.appendChild(k.cloneNode(true)));
        return e;
    }
    querySelectorAll(sel) {
        const teile = String(sel).split(',').map((s) => s.trim().split(/\s+/).map(einfach));
        const aus = [];
        (function gehe(k) {
            k.children.forEach((c) => {
                if (teile.some((kette) => passtKette(c, kette))) aus.push(c);
                gehe(c);
            });
        })(this);
        return aus;
    }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    closest(sel) {
        const kette = String(sel).trim().split(/\s+/).map(einfach);
        let k = this;
        while (k && k.nodeType === 1) { if (passtKette(k, kette)) return k; k = k.parentNode; }
        return null;
    }
    addEventListener() { }
}

function einfach(s) {
    const m = /^([a-z0-9]*)((?:[.#][\w-]+|\[[^\]]+\])*)$/i.exec(s);
    if (!m) throw new Error('Selektor nicht unterstuetzt: ' + s);
    const teil = { tag: m[1] ? m[1].toUpperCase() : null, klassen: [], id: null, attrs: [] };
    (m[2].match(/[.#][\w-]+|\[[^\]]+\]/g) || []).forEach((x) => {
        if (x[0] === '.') teil.klassen.push(x.slice(1));
        else if (x[0] === '#') teil.id = x.slice(1);
        else {
            const a = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(x);
            if (!a) throw new Error('Selektor nicht unterstuetzt: ' + x);
            teil.attrs.push([a[1], a[2]]);
        }
    });
    return teil;
}
function passt(e, t) {
    if (t.tag && e.tagName !== t.tag) return false;
    if (t.id && e.id !== t.id) return false;
    const kl = e.className.split(/\s+/);
    if (!t.klassen.every((k) => kl.includes(k))) return false;
    return t.attrs.every(([n, v]) => e.hasAttribute(n) && (v === undefined || e.getAttribute(n) === v));
}
function passtKette(e, kette) {
    if (!passt(e, kette[kette.length - 1])) return false;
    let i = kette.length - 2, k = e.parentNode;
    while (i >= 0 && k && k.nodeType === 1) { if (passt(k, kette[i])) i--; k = k.parentNode; }
    return i < 0;
}

function parse(html) {
    const wurzel = new Element('div');
    let akt = wurzel;
    const re = /<!--[\s\S]*?-->|<\/([a-z0-9]+)\s*>|<([a-z0-9]+)((?:\s+[^\s=>]+(?:="[^"]*"|='[^']*'|=[^\s>]+)?)*)\s*\/?>|([^<]+)/gi;
    let m;
    while ((m = re.exec(html))) {
        if (m[0].startsWith('<!--')) continue;
        if (m[1]) {
            let k = akt;
            while (k && k !== wurzel && k.tagName !== m[1].toUpperCase()) k = k.parentNode;
            if (k && k !== wurzel) akt = k.parentNode;
        } else if (m[2]) {
            const e = new Element(m[2]);
            const ar = /([^\s=>]+)(?:="([^"]*)"|='([^']*)'|=([^\s>]+))?/g;
            let a;
            while ((a = ar.exec(m[3] || ''))) {
                const v = a[2] !== undefined ? a[2] : a[3] !== undefined ? a[3] : a[4] !== undefined ? a[4] : '';
                e.setAttribute(a[1], entitaeten(v));
            }
            akt.appendChild(e);
            if (!LEER.has(m[2].toLowerCase()) && !/\/>$/.test(m[0])) akt = e;
        } else if (m[4]) {
            akt.appendChild(new Text(entitaeten(m[4])));
        }
    }
    const k = wurzel.childNodes.slice();
    k.forEach((x) => wurzel.removeChild(x));
    return k;
}

function dokument() {
    return {
        createElement: (t) => new Element(t),
        createTextNode: (t) => new Text(t)
    };
}

module.exports = { Element, Text, parse, dokument, entitaeten };
