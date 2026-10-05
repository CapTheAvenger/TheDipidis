/**
 * UI-103 (M3-02, UI/UX-Ueberpruefung v2, 05.10.2026)
 *
 * BEFUND: Die eigene Deck-/Archetyp-Auswahl (.searchable-select-display)
 * war fokussierbar, aber Enter, Leertaste und Pfeil oeffneten nichts;
 * keine Rolle, kein aria-expanded. Ohne Maus liess sich kein Deck waehlen.
 *
 * ZUSICHERUNG: _initSearchableSelectImpl aus js/app-city-league.js wird in
 * einem kleinen DOM-Ersatz AUSGEFUEHRT und per Tastenereignis bedient:
 * Enter oeffnet, ↓ markiert, Enter waehlt (change auf dem <select>),
 * Esc schliesst und gibt den Fokus zurueck; Rollen stimmen.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const L = require('./lib-dom-sandkasten.js');

function el(tag) {
    const e = {
        tagName: tag.toUpperCase(), children: [], parentElement: null, attrs: {}, dataset: {}, style: {},
        _text: '', className: '', value: '', hoerer: {},
        get textContent() { return this._text || this.children.map(c => c.textContent).join(''); },
        set textContent(v) { this._text = String(v); this.children = []; },
        set innerHTML(v) { this.children = []; this._text = ''; },
        get classList() {
            const self = this;
            const teile = () => self.className.split(/\s+/).filter(Boolean);
            const cl = {
                add: (c) => { if (!teile().includes(c)) self.className = (self.className + ' ' + c).trim(); },
                remove: (c) => { self.className = teile().filter(x => x !== c).join(' '); },
                contains: (c) => teile().includes(c),
                toggle: (c, an) => { (an ? cl.add : cl.remove)(c); },
            };
            return cl;
        },
        setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; },
        removeAttribute(k) { delete this.attrs[k]; },
        appendChild(c) { c.parentElement = this; this.children.push(c); return c; },
        insertBefore(c, ref) { c.parentElement = this; const i = this.children.indexOf(ref); this.children.splice(i < 0 ? this.children.length : i, 0, c); return c; },
        remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(x => x !== this); },
        contains(x) { for (let k = x; k; k = k.parentElement) if (k === this) return true; return false; },
        alle() { const r = []; (function ab(n) { n.children.forEach(c => { r.push(c); ab(c); }); })(this); return r; },
        querySelectorAll(sel) {
            if (sel.startsWith('.')) return this.alle().filter(n => n.classList.contains(sel.slice(1)));
            return this.alle().filter(n => n.tagName === sel.toUpperCase());
        },
        querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
        addEventListener(t, f) { (this.hoerer[t] = this.hoerer[t] || []).push(f); },
        removeEventListener() {},
        dispatchEvent(ev) { (this.hoerer[ev.type] || []).forEach(f => f(ev)); return true; },
        focus() { doc.activeElement = this; },
        getBoundingClientRect() { return { left: 10, bottom: 40, width: 300 }; },
        scrollIntoView() {},
    };
    return e;
}
const doc = { activeElement: null, createElement: el, addEventListener() {} };

function aufbauen() {
    const eltern = el('div');
    const select = el('select'); select.id = 'currentMetaDeckSelect';
    const opts = ['', 'Dragapult', 'Mega Excadrill', 'Basic Box'].map((v, i) => {
        const o = el('option'); o.value = v; o.textContent = i ? v : '-- Archetyp auswählen --'; return o;
    });
    opts.forEach(o => select.appendChild(o));
    Object.defineProperty(select, 'options', { get: () => opts });
    Object.defineProperty(select, 'selectedIndex', { get: () => Math.max(0, opts.findIndex(o => o.value === select.value)) });
    eltern.appendChild(select);
    const geaendert = [];
    select.addEventListener('change', () => geaendert.push(select.value));
    const ctx = L.baue('js/app-city-league.js', ['function _initSearchableSelectImpl(selectEl)'], {
        document: doc, window: { innerWidth: 1200, addEventListener() {}, removeEventListener() {} },
        t: (k) => k, Event: function (type) { this.type = type; },
    });
    ctx._initSearchableSelectImpl(select);
    const display = eltern.querySelector('.searchable-select-display');
    const dropdown = eltern.querySelector('.searchable-select-dropdown');
    const search = eltern.querySelector('.searchable-select-search');
    return { select, display, dropdown, search, geaendert };
}
const taste = (k) => ({ key: k, preventDefault() {} });

describe('UI-103: Deck-Auswahl ist per Tastatur bedienbar', () => {
    it('Rollen und Zustand', () => {
        const u = aufbauen();
        assert.equal(u.display.getAttribute('role'), 'combobox');
        assert.equal(u.display.getAttribute('aria-expanded'), 'false');
        assert.ok(u.display.getAttribute('aria-controls'));
    });
    for (const k of ['Enter', ' ', 'ArrowDown']) {
        it('Taste „' + k + '“ oeffnet die Liste', () => {
            const u = aufbauen();
            assert.equal(typeof u.display.onkeydown, 'function', 'keine Tastenbehandlung am Feld');
            u.display.onkeydown(taste(k));
            assert.ok(u.dropdown.classList.contains('open'));
            assert.equal(u.display.getAttribute('aria-expanded'), 'true');
            assert.equal(doc.activeElement, u.search);
        });
    }
    it('↓ Enter waehlt das Deck unter dem Leer-Eintrag und meldet change', () => {
        const u = aufbauen();
        u.display.onkeydown(taste('Enter'));
        u.search.onkeydown(taste('ArrowDown'));
        u.search.onkeydown(taste('Enter'));
        assert.equal(u.select.value, 'Dragapult');
        assert.deepEqual(u.geaendert, ['Dragapult']);
        assert.ok(!u.dropdown.classList.contains('open'));
        assert.equal(doc.activeElement, u.display);
    });
    it('Suchtext + Enter waehlt den ersten Treffer', () => {
        const u = aufbauen();
        u.display.onkeydown(taste('Enter'));
        u.search.value = 'exca'; u.search.oninput();
        u.search.onkeydown(taste('Enter'));
        assert.equal(u.select.value, 'Mega Excadrill');
    });
    it('Esc schliesst und gibt den Fokus zurueck', () => {
        const u = aufbauen();
        u.display.onkeydown(taste('Enter'));
        u.search.onkeydown(taste('Escape'));
        assert.ok(!u.dropdown.classList.contains('open'));
        assert.equal(u.display.getAttribute('aria-expanded'), 'false');
        assert.equal(doc.activeElement, u.display);
    });
});
