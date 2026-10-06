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

function umgebung(opts) {
    opts = opts || {};
    const doc = { activeElement: null };
    const mk = (t, id, kl) => { const e = el(t); e.id = id || ''; e.className = kl || ''; e.focus = function () { doc.activeElement = this; }; return e; };
    const drop = mk('div', 'mainMenuDropdown'); const trig = mk('div', 'mainMenuTrigger');
    const eintrag = mk('button', '', 'menu-item'); drop.appendChild(eintrag);
    doc.getElementById = (id) => ({ mainMenuDropdown: drop, mainMenuTrigger: trig }[id] || null);
    const ctx = L.baue('js/inline-init.js', ['function toggleMainMenu()', 'function _menueEsc(e)'], {
        document: doc, setTimeout: opts.setTimeout || ((f) => f()), menueHoeheAnpassen() {}, menueBeobachtungStarten() {},
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
        /* V2-5 (06.10.2026): ohne zweiten Oeffner beginnt der Block an der Bedingung. */
        const i = q.indexOf("if (!menu.contains(e.target) && !trigger.contains(e.target))");
        assert.ok(i > 0, 'Klick-daneben-Bedingung nicht gefunden');
        const block = q.slice(i, i + 400).split('\n').map(z => z.replace(/\/\/.*$/, '')).join('\n');
        assert.match(block, /toggleMainMenu\(\)/);
        assert.ok(!/classList\.remove\('show'\)/.test(block), 'schliesst wieder an toggleMainMenu vorbei');
    });
});

/* Live-Abnahme V2-1 (05.10.2026): solange der CSS-Uebergang `visibility`
   noch laeuft, verpufft focus() still. Der Fokus muss deshalb nach dem
   Uebergang (transitionend) bzw. 300 ms noch einmal versucht werden. */
describe('UI-108: Fokus auch nach dem Einblend-Uebergang', () => {
    function mitUebergang(src) {
        const timer = [];
        const u = umgebung({ setTimeout: (f) => timer.push(f) });
        let sichtbar = false;
        u.eintrag.focus = function () { if (sichtbar) u.doc.activeElement = this; };
        u.trig.focus();
        u.ctx.toggleMainMenu();
        timer.splice(0).forEach(f => f());          // Versuch bei 0 ms: noch unsichtbar
        assert.notEqual(u.doc.activeElement, u.eintrag);
        sichtbar = true;
        u.drop.dispatchEvent({ type: 'transitionend' });
        return u;
    }
    it('nach transitionend steht der Fokus im ersten Eintrag', () => {
        const u = mitUebergang();
        assert.equal(u.doc.activeElement, u.eintrag);
    });
    it('VERFAELSCHUNG: ohne den Nachversuch bleibt er auf dem Pokeball', () => {
        const q = L.lies('js', 'inline-init.js');
        const kaputt = q.replace("drop.addEventListener('transitionend', _fokusRein, { once: true });", '')
            .replace('setTimeout(_fokusRein, 300);', '');
        assert.notEqual(kaputt, q);
        const timer = [];
        const doc = { activeElement: null };
        const drop = el('div'); drop.className = ''; const trig = el('div'); trig.className = '';
        const eintrag = el('button'); eintrag.className = 'menu-item'; drop.appendChild(eintrag);
        let sichtbar = false;
        trig.focus = function () { doc.activeElement = this; };
        eintrag.focus = function () { if (sichtbar) doc.activeElement = this; };
        doc.getElementById = (id) => ({ mainMenuDropdown: drop, mainMenuTrigger: trig }[id] || null);
        const vm = require('node:vm');
        const ctx = vm.createContext({
            document: doc, setTimeout: (f) => timer.push(f), menueHoeheAnpassen() {}, menueBeobachtungStarten() {},
            _sichtBeobachtungStarten() {}, menueBeobachtungBeenden() {},
        });
        vm.runInContext(L.ausschnitt(kaputt, 'function toggleMainMenu()') + ';globalThis.toggleMainMenu=toggleMainMenu;', ctx);
        trig.focus(); ctx.toggleMainMenu(); timer.splice(0).forEach(f => f());
        sichtbar = true; drop.dispatchEvent({ type: 'transitionend' }); timer.splice(0).forEach(f => f());
        assert.notEqual(doc.activeElement, eintrag, 'die Probe unterscheidet nicht');
    });
});
