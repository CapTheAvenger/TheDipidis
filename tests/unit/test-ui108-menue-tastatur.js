/**
 * UI-108 (M3-04, UI/UX-Ueberpruefung v2, 05.10.2026)
 *
 * BEFUND: Esc schloss das Hauptmenue nicht, der Fokus ging nicht hinein,
 * und nach Klick daneben blieb aria-expanded="true" stehen.
 *
 * ZUSICHERUNG: toggleMainMenu und _menueEsc aus js/inline-init.js werden
 * AUSGEFUEHRT: Oeffnen setzt aria-expanded und fokussiert den ersten
 * Eintrag, Esc schliesst und gibt den Fokus an den Pokeball zurueck;
 * der Klick-daneben-Schliesser laeuft ueber toggleMainMenu.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
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
                toggle: (c, an) => { if (an === undefined) an = !cl.contains(c); (an ? cl.add : cl.remove)(c); return an; },
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

function umgebung() {
    const doc = { activeElement: null };
    const mk = (t, id, kl) => { const e = el(t); e.id = id || ''; e.className = kl || ''; e.focus = function () { doc.activeElement = this; }; return e; };
    const drop = mk('div', 'mainMenuDropdown'); const trig = mk('div', 'mainMenuTrigger');
    const eintrag = mk('button', '', 'menu-item'); drop.appendChild(eintrag);
    doc.getElementById = (id) => ({ mainMenuDropdown: drop, mainMenuTrigger: trig }[id] || null);
    const ctx = L.baue('js/inline-init.js', ['function toggleMainMenu()', 'function _menueEsc(e)'], {
        document: doc, setTimeout: (f) => f(), menueHoeheAnpassen() {}, menueBeobachtungStarten() {},
        _sichtBeobachtungStarten() {}, menueBeobachtungBeenden() {},
    });
    return { ctx, doc, drop, trig, eintrag };
}

describe('UI-108: Hauptmenue per Tastatur', () => {
    it('Oeffnen: aria-expanded true, Fokus im ersten Eintrag', () => {
        const u = umgebung(); u.trig.focus();
        u.ctx.toggleMainMenu();
        assert.ok(u.drop.classList.contains('show'));
        assert.equal(u.trig.getAttribute('aria-expanded'), 'true');
        assert.equal(u.doc.activeElement, u.eintrag);
    });
    it('Esc schliesst, aria-expanded false, Fokus zurueck', () => {
        const u = umgebung(); u.trig.focus();
        u.ctx.toggleMainMenu();
        u.ctx._menueEsc({ key: 'Escape', preventDefault() {} });
        assert.ok(!u.drop.classList.contains('show'));
        assert.equal(u.trig.getAttribute('aria-expanded'), 'false');
        assert.equal(u.doc.activeElement, u.trig);
    });
    it('Klick daneben schliesst ueber toggleMainMenu', () => {
        const q = L.lies('js', 'inline-init.js').replace(/\/\*[\s\S]*?\*\//g, ' ');
        const i = q.indexOf("closest('.menu-label-btn')");
        const block = q.slice(i, i + 400).split('\n').map(z => z.replace(/\/\/.*$/, '')).join('\n');
        assert.match(block, /toggleMainMenu\(\)/);
        assert.ok(!/classList\.remove\('show'\)/.test(block), 'schliesst wieder an toggleMainMenu vorbei');
    });
});
