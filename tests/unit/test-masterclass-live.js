/* test-masterclass-live.js — Live-Daten der Masterclasses (17.10.2026).
 *
 * ANLASS (Hausi, 17.10.2026): die Mega-Stalobor-Masterclass zieht ins Konto
 * um (das Repo ist oeffentlich), die Zahlen sollen aber weiter jede Woche
 * frisch sein — „wenn ich die Master Class öffne, dass die ganz kurz lädt
 * und sich dann die aktuellen Daten einzieht“.
 *
 * Geprueft wird am VERHALTEN: js/ds-masterclass.js laeuft komplett in einer
 * vm; ein kleiner DOM-Ersatz (hilfen/mini-dom.js) traegt ein kuenstliches
 * Stueck mit derselben Auszeichnung wie das echte. Das echte Stueck liegt
 * nicht im Repo — seinen Inhalt prueft scripts/pruefe_masterclass_konto.sh
 * vor dem Hochladen.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const dom = require('./hilfen/mini-dom.js');

const WURZEL = path.join(__dirname, '..', '..');
const JS = fs.readFileSync(path.join(WURZEL, 'js', 'ds-masterclass.js'), 'utf8');
const FAELLE = JSON.parse(fs.readFileSync(path.join(WURZEL, 'tests', 'fixtures', 'masterclass_unterschied.json'), 'utf8')).faelle;

function umgebung(opt) {
    opt = opt || {};
    const abrufe = [];
    const docPfade = [];
    const docs = opt.docs || [];
    const db = {
        collection: (a) => ({ doc: (uid) => ({ collection: (b) => ({
            get: () => Promise.resolve({ forEach: (fn) => docs.forEach((d) => fn({ id: d.id, data: () => d.data })) }),
            doc: (id) => ({ get: () => {
                docPfade.push([a, uid, b, id].join('/'));
                const d = docs.filter((x) => x.id === id)[0];
                return Promise.resolve({ exists: !!d, data: () => (d ? d.data : undefined) });
            } })
        }) }) })
    };
    const doc = dom.dokument();
    const host = new dom.Element('div');
    host.id = 'masterclassHost';
    host.setAttribute('id', 'masterclassHost');
    host.dataset = {};
    doc.addEventListener = () => {};
    doc.getElementById = (id) => (id === 'masterclassHost' ? host : host.querySelector('#' + id));
    const anmeldung = [];
    const window = {
        auth: { currentUser: opt.user === undefined ? { uid: 'U1' } : opt.user, onAuthStateChanged: (fn) => { anmeldung.push(fn); } },
        db,
        addEventListener: () => {},
        getLang: () => 'de',
        /* wie js/app-utils.js (zahlKomma), das auf der Seite vorher laedt */
        zahlKomma: (w, st) => w.toFixed(st == null ? 1 : st).replace('.', ',')
    };
    const fetch = (url, o) => {
        abrufe.push({ url, o });
        if (opt.liveFehler) return Promise.reject(new Error('offline'));
        if (/masterclass_live/.test(url)) {
            return Promise.resolve({ ok: !!opt.live, json: () => Promise.resolve(opt.live) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    };
    const ktx = { window, document: doc, fetch, console: { warn: () => {}, log: () => {} }, Promise, Set, Date, NodeFilter: { SHOW_TEXT: 4 } };
    vm.createContext(ktx);
    vm.runInContext(JS, ktx);
    return { mc: window.DsMasterclass, abrufe, docPfade, host, window, anmeldung };
}

/* ── Ein kuenstliches Stueck mit derselben Auszeichnung wie das echte ── */

const N = 21;
function zelle(sp, kopf, praefix, wert) {
    return `<span data-live-spalte="${sp}" class="mcl-wrz" title="${praefix}: alt"><em>${kopf}</em><b>${wert}</b><i>(9)</i></span>`;
}
function stueck() {
    let mu = '';
    for (let i = 0; i < N; i++) {
        mu += `<details class="mcl-mu" data-live-slug="deck-${i}" data-s="gut"><summary><span class="mcl-mu-txt">` +
            `<span class="mcl-nm">Deutsch${i}<em>Deck ${i}</em></span><span class="mcl-sub">1,00 % Meta-Anteil · 10:0${i % 10}</span></span>` +
            '<span class="mcl-wr"><span class="mcl-wr3">' +
            zelle('jetzt', 'TEF–30C', 'Online-Meta TEF–30C (laufendes Format)', '1 %') +
            zelle('davor', 'TEF–PBL', 'Online-Meta TEF–PBL (Format davor)', '2 %') +
            zelle('majors', 'Majors (TEF–30C)', 'Letzte Präsenzturniere (A und B), Format TEF–30C', '3 %') +
            '<span class="mcl-wrz mcl-wrz-tim" title="Tims Einschätzung"><em>Tim</em><b>gut</b></span>' +
            `</span></span></summary><div class="mcl-mu-body">Plan ${i}</div></details>`;
    }
    const kachel = (en, de, n, warum) => `<button type="button" class="mcl-kk" data-mcl-karte="${en.toLowerCase()}" data-de="${de}" data-en="${en}" data-druck="TEF-1" data-druck-hoch="TEF-2" data-n="${n}"${warum ? ` data-warum="${warum}"` : ''} aria-label="${de}, ${n} mal"><img src="x.png" alt=""><span class="mcl-anz">${n}</span></button>`;
    const block = (nr, name, kacheln) => `<div class="mcl-liste" data-mcl-listenblock="${nr}" hidden data-mcl-listenname="${name}"><p class="mcl-listmeta">alt</p><div class="mcl-gitter">${kacheln}</div><p class="mcl-quelle">x</p></div>`;
    return '<div class="mcl-live-stand" data-live-stand="17.10.2026" hidden></div>' +
        '<div class="mcl-kopf"><h4>Probe</h4></div>' +
        '<p class="mcl-lead"><b data-live="kopf-jetzt">TEF–30C</b> ist das laufende Online-Format, <b data-live="kopf-davor">TEF–PBL</b> das Online-Format davor, ' +
        '<b data-live="kopf-majors">Majors (TEF–30C)</b> <span data-live="majors-satz">sind alt.</span></p>' +
        `<div class="mcl-mu-liste">${mu}</div>` +
        '<p class="mcl-quelle"><span data-live="kopf-jetzt">TEF–30C</span> (online): <code data-live="datei-online-jetzt">quelle/a.csv</code>, Stand <span data-live="stand-online-jetzt">2026-10-01</span></p>' +
        '<div class="mcl-listwahl"><div class="mcl-listgruppe"><span class="mcl-listgruppe-titel">Tim</span><div class="mcl-listwahl-reihe"><button type="button" class="mcl-chip" data-mcl-liste="0">Aktuell</button></div></div>' +
        '<div class="mcl-listgruppe"><span class="mcl-listgruppe-titel">Online · letzte 7 Tage</span><div class="mcl-listwahl-reihe">' +
        '<button type="button" class="mcl-chip" data-mcl-liste="20">Alt A</button><button type="button" class="mcl-chip" data-mcl-liste="21">Alt B</button></div></div></div>' +
        block(0, 'Aktuell', kachel('Beldum', 'Tanhel', 4, 'TIMS GRUND') + kachel('Metang', 'Metang', 4, '') + kachel('Metal Energy', 'Metall-Energie', 17, '')) +
        block(20, 'Alt A', kachel('Beldum', 'Tanhel', 3, 'TIMS GRUND')) +
        block(21, 'Alt B', kachel('Beldum', 'Tanhel', 2, 'TIMS GRUND')) +
        '<div class="mcl-doku">AUSARBEITUNG</div>';
}

function wurzelMit(html) {
    const w = new dom.Element('div');
    w.innerHTML = html;
    return w;
}

function liveDaten() {
    const zellen = {};
    for (let i = 0; i < N - 1; i++) {
        zellen['deck-' + i] = {
            jetzt: ['mcl-wrz', `${50 + i},0 % Win % nach Matchpunkten, aus 100 Partien, Bilanz 1–2–3 (S–N–U)`, `${50 + i},0 %`, '<i>(100)</i>'],
            davor: ['mcl-wrz mcl-wrz-duenn', 'Bilanz 1–1–0 (S–N–U) aus 2 Partien.', '1–1–0', '<i>(2)</i>']
        };
    }
    const anteile = {};
    for (let i = 0; i < N - 1; i++) anteile['deck ' + i] = (i + 1) + ',00';
    return {
        matchups: {
            koepfe: { jetzt: 'TEF–ZZN', davor: 'TEF–30C', majors: 'Majors (TEF–ZZN)' },
            majors_praefix: 'Letzte Präsenzturniere (Neustadt), Format TEF–ZZN: ',
            werte: { 'kopf-jetzt': 'TEF–ZZN', 'kopf-davor': 'TEF–30C', 'kopf-majors': 'Majors (TEF–ZZN)',
                'majors-satz': 'sind die letzten Präsenzturniere (Neustadt), schon im laufenden Format.',
                'datei-online-jetzt': 'quelle/online_api_matchups_TEF-ZZN.csv', 'stand-online-jetzt': '2026-10-17' },
            zellen,
            leer: ['mcl-wrz mcl-wrz-leer', 'keine Partien in den Daten', '—', ''],
            anteile
        },
        online_listen: {
            gruppe: 'Online · letzte 7 Tage', max_plaetze: 5,
            leer_hinweis: '<span class="mcl-listgruppe-leer">Keine Online-Liste</span>',
            listen: [{
                name: 'Neu · 1. von 200', fakten: '1. Platz von 200 (7–0–0), „Probe-Cup“, 16.10.2026.',
                karten: [
                    { name: 'Beldum', schluessel: 'beldum', n: 4, ace: false, neu: { karte: 'beldum', de: 'Tanhel', en: 'Beldum', druck: 'CRI-59', hoch: 'CRI-59', bild: 'b.png', ace: false } },
                    { name: 'Basic Metal Energy', schluessel: 'metal energy', n: 16, ace: false, neu: null },
                    { name: 'Prime Catcher', schluessel: 'prime catcher', n: 1, ace: true, neu: { karte: 'prime-catcher', de: 'Erstklassiger Fänger', en: 'Prime Catcher', druck: 'PRE-119', hoch: 'PRE-119', bild: 'p.png', ace: true } }
                ]
            }]
        }
    };
}

test('die Werte landen in jeder markierten Stelle, und nur dort', () => {
    const { mc } = umgebung();
    const w = wurzelMit(stueck());
    assert.strictEqual(mc._liveEinsetzen(w, liveDaten()), true);
    assert.deepStrictEqual(w.querySelectorAll('[data-live="kopf-jetzt"]').map((e) => e.textContent), ['TEF–ZZN', 'TEF–ZZN']);
    assert.strictEqual(w.querySelector('[data-live="majors-satz"]').textContent,
        'sind die letzten Präsenzturniere (Neustadt), schon im laufenden Format.');
    assert.strictEqual(w.querySelector('[data-live="stand-online-jetzt"]').textContent, '2026-10-17');
    assert.ok(w.innerHTML.includes('AUSARBEITUNG') && w.innerHTML.includes('Plan 7'), 'Ausarbeitung angefasst');
});

test('jede Zelle bekommt Wert, Nenner, Sprechblase und den neuen Spaltennamen', () => {
    const { mc } = umgebung();
    const w = wurzelMit(stueck());
    mc._liveEinsetzen(w, liveDaten());
    const d = w.querySelector('details[data-live-slug="deck-3"]');
    const j = d.querySelector('[data-live-spalte="jetzt"]');
    assert.strictEqual(j.querySelector('em').textContent, 'TEF–ZZN');
    assert.strictEqual(j.querySelector('b').textContent, '53,0 %');
    assert.strictEqual(j.querySelector('i').textContent, '(100)');
    assert.strictEqual(j.getAttribute('title'),
        'Online-Meta TEF–ZZN (laufendes Format): 53,0 % Win % nach Matchpunkten, aus 100 Partien, Bilanz 1–2–3 (S–N–U)');
    /* Setwechsel: die alte Jetzt-Spalte wird zur Davor-Spalte — benannt
     * EINMAL, nicht zweimal weitergerueckt. */
    const v = d.querySelector('[data-live-spalte="davor"]');
    assert.strictEqual(v.querySelector('em').textContent, 'TEF–30C');
    assert.ok(v.getAttribute('title').startsWith('Online-Meta TEF–30C (Format davor): Bilanz 1–1–0'), v.getAttribute('title'));
    assert.strictEqual(v.className, 'mcl-wrz mcl-wrz-duenn');
    /* Majors ohne Eintrag fuer diesen Gegner: leere Zelle, kein Wert erfunden. */
    const m = d.querySelector('[data-live-spalte="majors"]');
    assert.strictEqual(m.querySelector('b').textContent, '—');
    assert.strictEqual(m.querySelector('i'), null, 'die leere Zelle traegt noch einen Nenner');
    assert.strictEqual(m.getAttribute('title'), 'Letzte Präsenzturniere (Neustadt), Format TEF–ZZN: keine Partien in den Daten');
    assert.strictEqual(m.querySelector('em').textContent, 'Majors (TEF–ZZN)');
    /* Tims Spalte ist eine Einschaetzung, keine gerechnete Zahl. */
    const tim = d.querySelector('.mcl-wrz-tim');
    assert.strictEqual(tim.querySelector('b').textContent, 'gut');
    /* Ein Gegner ganz ohne Daten: alle drei Spalten leer. */
    const ohne = w.querySelector('details[data-live-slug="deck-20"] [data-live-spalte="jetzt"]');
    assert.strictEqual(ohne.querySelector('b').textContent, '—');
});

test('Meta-Anteil und Reihenfolge folgen den Daten', () => {
    const { mc } = umgebung();
    const w = wurzelMit(stueck());
    mc._liveEinsetzen(w, liveDaten());
    const reihe = w.querySelectorAll('details.mcl-mu').map((d) => d.getAttribute('data-live-slug'));
    assert.strictEqual(reihe[0], 'deck-19', 'der groesste Anteil steht nicht oben');
    assert.strictEqual(reihe[N - 1], 'deck-20', 'ein Deck ohne Anteil steht nicht am Ende');
    const sub = w.querySelector('details[data-live-slug="deck-19"] .mcl-sub').textContent;
    assert.strictEqual(sub, '20,00 % Meta-Anteil · 10:09', 'der Anteil wurde nicht ersetzt oder die Spielzeit angefasst');
    assert.strictEqual(w.querySelector('details[data-live-slug="deck-20"] .mcl-sub').textContent.slice(0, 4), '1,00');
});

test('die Online-Gruppe bekommt die Listen der Woche — mit Tims Kacheln, wo es sie gibt', () => {
    const { mc } = umgebung();
    const w = wurzelMit(stueck());
    mc._liveEinsetzen(w, liveDaten());
    const chips = w.querySelectorAll('.mcl-listgruppe')[1].querySelectorAll('[data-mcl-liste]');
    assert.deepStrictEqual(chips.map((c) => c.getAttribute('data-mcl-liste')), ['20']);
    assert.strictEqual(chips[0].textContent, 'Neu · 1. von 200');
    assert.strictEqual(w.querySelector('.mcl-liste[data-mcl-listenblock="21"]'), null, 'die Liste der Vorwoche blieb stehen');
    const b = w.querySelector('.mcl-liste[data-mcl-listenblock="20"]');
    const k = b.querySelectorAll('button.mcl-kk');
    assert.strictEqual(k.length, 3);
    assert.strictEqual(k[0].getAttribute('data-warum'), 'TIMS GRUND', 'Tims Begruendung ging verloren');
    assert.strictEqual(k[0].getAttribute('data-n'), '4');
    assert.strictEqual(k[0].querySelector('.mcl-anz').textContent, '4');
    assert.strictEqual(k[1].getAttribute('data-de'), 'Metall-Energie', '„Basic Metal Energy“ fand Tims Kachel nicht');
    assert.strictEqual(k[2].getAttribute('data-ace'), '1');
    assert.strictEqual(k[2].getAttribute('data-druck'), 'PRE-119');
    const meta = b.querySelector('.mcl-listmeta').textContent;
    assert.ok(meta.startsWith('1. Platz von 200 (7–0–0), „Probe-Cup“, 16.10.2026.'), meta);
    assert.ok(meta.includes('dazu 1× Erstklassiger Fänger') && meta.includes('kein Metang') &&
        meta.includes('16 statt 17 Metall-Energie'), meta);
    assert.ok(b.querySelector('.mcl-quelle').textContent.startsWith('21 Karten · 3 verschiedene'));
    assert.strictEqual(w.querySelector('.mcl-liste[data-mcl-listenblock="0"]').querySelectorAll('button.mcl-kk').length, 3, 'Tims Liste angefasst');
});

test('eine Karte ohne Kachel laesst die Gruppe stehen, zu viele Listen auch', () => {
    const { mc } = umgebung();
    const vorher = wurzelMit(stueck()).innerHTML;
    const d = liveDaten();
    d.online_listen.listen[0].karten.push({ name: 'Gibt Es Nicht', schluessel: 'gibt es nicht', n: 1, ace: false, neu: null });
    let w = wurzelMit(stueck());
    assert.strictEqual(mc._liveListen(w, d.online_listen), false);
    assert.strictEqual(w.innerHTML, vorher);
    const viele = liveDaten();
    viele.online_listen.listen = Array(6).fill(viele.online_listen.listen[0]);
    w = wurzelMit(stueck());
    assert.strictEqual(mc._liveListen(w, viele.online_listen), false);
    assert.strictEqual(w.innerHTML, vorher);
});

test('keine Liste in der Woche: der Hinweis statt alter Listen', () => {
    const { mc } = umgebung();
    const d = liveDaten();
    d.online_listen.listen = [];
    const w = wurzelMit(stueck());
    assert.strictEqual(mc._liveListen(w, d.online_listen), true);
    assert.ok(w.querySelectorAll('.mcl-listgruppe')[1].querySelector('.mcl-listgruppe-leer'));
    assert.strictEqual(w.querySelector('.mcl-liste[data-mcl-listenblock="20"]'), null);
});

test('ohne Live-Daten bleibt der Stand vom Umzugstag — und das steht dabei', () => {
    const { mc } = umgebung();
    const w = wurzelMit(stueck());
    const vorher = w.querySelector('[data-live-spalte="jetzt"]').outerHTML;
    assert.strictEqual(mc._liveEinsetzen(w, null), false);
    assert.strictEqual(w.querySelector('[data-live-spalte="jetzt"]').outerHTML, vorher);
    const h = w.querySelector('.mcl-live-hinweis');
    assert.ok(h && h.textContent.includes('17.10.2026'), 'kein Hinweis auf den Stand');
});

test('der Unterschied zu Tims Liste ist derselbe Satz wie im Python-Erzeuger', () => {
    const { mc } = umgebung();
    FAELLE.forEach((f) => assert.strictEqual(mc._listenUnterschied(f.zaehlung, f.tims), f.erwartet));
    assert.strictEqual(mc._kartenSchluessel('Basic Metal Energy'), mc._kartenSchluessel('Metal Energy'));
    assert.strictEqual(mc._kartenSchluessel('Boss&#x27;s Orders'), "boss's orders");
});

test('die Live-Datei wird frisch geholt, nicht aus dem Zwischenspeicher', async () => {
    const { mc, abrufe } = umgebung({ live: { matchups: {} } });
    const d = await mc._holeLive('mega-stalobor');
    assert.strictEqual(JSON.stringify(d), '{"matchups":{}}');
    assert.ok(/^data\/masterclass_live\/mega-stalobor\.json\?t=\d+$/.test(abrufe[0].url), abrufe[0].url);
    assert.strictEqual(abrufe[0].o.cache, 'no-store');
    const kaputt = umgebung({ liveFehler: true });
    assert.strictEqual(await kaputt.mc._holeLive('x'), null);
});

/* ── Mega-Stalobor kommt aus dem Konto ── */

test('Stalobor erscheint nur mit Dokument im Konto — und nie doppelt', async () => {
    let u = umgebung({ docs: [] });
    u.mc._zeichneRegal();
    await new Promise((r) => setTimeout(r, 0));
    assert.strictEqual(u.host.querySelectorAll('[data-mcl-guide="mega-stalobor"]').length, 0,
        'ohne Dokument steht eine Stalobor-Kachel im Regal');
    u = umgebung({ user: null, docs: [{ id: 'mega-stalobor', data: { html: '<p>X</p>' } }] });
    u.mc._zeichneRegal();
    await new Promise((r) => setTimeout(r, 0));
    assert.strictEqual(u.host.querySelectorAll('.mcl-kachel').length, 0, 'ohne Anmeldung eine Kachel');
    u = umgebung({ docs: [{ id: 'mega-stalobor', data: { html: '<p>X</p>' } }, { id: 'mega-tohaido', data: { titel: 'T', html: '<p>T</p>' } }] });
    u.mc._zeichneRegal();
    await new Promise((r) => setTimeout(r, 0));
    const ids = u.host.querySelectorAll('.mcl-kachel').map((k) => k.getAttribute('data-mcl-guide'));
    assert.deepStrictEqual(ids, ['mega-stalobor', 'privat-mega-tohaido'], ids.join(','));
    assert.ok(!u.host.innerHTML.includes('privat-mega-stalobor'), 'Stalobor zusaetzlich als Rahmen-Kachel');
});

test('der Text kommt aus users/<uid>/masterclasses/mega-stalobor', async () => {
    const u = umgebung({ docs: [{ id: 'mega-stalobor', data: { html: '<p>AUS DEM KONTO</p>' } }] });
    const g = u.mc.guides().filter((x) => x.id === 'mega-stalobor')[0];
    assert.strictEqual(g.quelle, 'konto');
    assert.strictEqual(g.datei, undefined, 'der Guide zeigt noch auf eine Datei');
    assert.strictEqual(await u.mc._hole(g), '<p>AUS DEM KONTO</p>');
    assert.deepStrictEqual(u.docPfade, ['users/U1/masterclasses/mega-stalobor']);
    const leer = umgebung({ docs: [] });
    await assert.rejects(leer.mc._hole(g));
});

/* ── Rahmen-Masterclasses (Tohaido, Hide 'n Sneak) ── */

test('im Rahmen setzt das eingefuegte Skript die Werte — nur von der Elternseite', () => {
    const { mc } = umgebung();
    const html = mc._mitAnkern('<html><body><span data-live="kopf-jetzt">alt</span></body></html>');
    const skripte = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    const live = skripte.filter((s) => s.includes('mcl-live'))[0];
    assert.ok(live, 'kein Live-Skript im Rahmen');
    const el = new dom.Element('span');
    el.setAttribute('data-live', 'kopf-jetzt');
    el.textContent = 'alt';
    let handler = null;
    const eltern = {};
    const k = { window: { parent: eltern, addEventListener: (t, fn) => { if (t === 'message') handler = fn; } },
        document: { querySelectorAll: () => [el] }, Object, Array };
    vm.createContext(k);
    vm.runInContext(live, k);
    handler({ source: {}, data: { typ: 'mcl-live', werte: { 'kopf-jetzt': 'FREMD' } } });
    assert.strictEqual(el.textContent, 'alt', 'eine fremde Quelle darf nichts setzen');
    handler({ source: eltern, data: { typ: 'mcl-live', werte: { 'kopf-jetzt': 'TEF–ZZN', 'x': 1 } } });
    assert.strictEqual(el.textContent, 'TEF–ZZN');
});

test('zeigePrivat schickt die Live-Werte in den Rahmen, sobald er geladen ist', async () => {
    const { mc, abrufe } = umgebung({ live: { werte: { a: 'b' } } });
    const g = mc._privatAusDoc('hide-n-sneak', { titel: 'H', html: '<html><body>X</body></html>' });
    const gesendet = [];
    let laden = null;
    const rahmen = { addEventListener: (t, fn) => { if (t === 'load') laden = fn; }, contentWindow: { postMessage: (d, z) => gesendet.push([d, z]) } };
    const buehne = { innerHTML: '', querySelector: (s) => (s === '.mcl-privat-rahmen' ? rahmen : { addEventListener() {} }), scrollIntoView() {} };
    mc._zeigePrivat(buehne, g);
    await new Promise((r) => setTimeout(r, 0));
    assert.ok(/masterclass_live\/hide-n-sneak\.json/.test(abrufe[0].url), 'falsche Live-Datei: ' + abrufe[0].url);
    assert.strictEqual(gesendet.length, 0, 'vor dem Laden gesendet');
    laden();
    assert.strictEqual(JSON.stringify(gesendet.map((x) => x[0])), JSON.stringify([{ typ: 'mcl-live', werte: { a: 'b' }, block: '', mu: null }]));
});

test('nach dem Abmelden oder Kontowechsel liegt nichts aus dem Konto mehr im Speicher', async () => {
    const u = umgebung({ docs: [{ id: 'mega-stalobor', data: { html: '<p>ALT</p>' } }, { id: 'mega-tohaido', data: { titel: 'T', html: '<p>T</p>' } }] });
    await u.mc._holePrivat();
    assert.ok(Object.keys(u.mc._privat).length === 1, 'Vorbedingung: Rahmen-Stueck gemerkt');
    const g = u.mc.guides().filter((x) => x.id === 'mega-stalobor')[0];
    assert.strictEqual(await u.mc._hole(g), '<p>ALT</p>');
    assert.strictEqual(u.docPfade.length, 0, 'Vorbedingung: Text kam aus dem Speicher');
    assert.ok(u.anmeldung.length >= 1, 'kein Zuhoerer fuer Anmeldewechsel');
    u.window.auth.currentUser = null;
    u.anmeldung.forEach((fn) => fn(null));
    assert.strictEqual(Object.keys(u.mc._privat).length, 0, 'Rahmen-Stuecke blieben nach dem Abmelden gemerkt');
    await assert.rejects(u.mc._hole(g), 'nach dem Abmelden oeffnete der gemerkte Text');
    u.window.auth.currentUser = { uid: 'U2' };
    u.anmeldung.forEach((fn) => fn({ uid: 'U2' }));
    await u.mc._hole(g);
    assert.deepStrictEqual(u.docPfade, ['users/U2/masterclasses/mega-stalobor'], 'das neue Konto las nicht selbst');
});

/* ── Aktuelle Daten: Online neben vor Ort (17.10.2026) ──
 * Hausi: „In-Personendaten und Online-Daten gehen immer so ein bisschen
 * auseinander … man kann es ja beides aufzeigen.“ Geprueft am Verhalten,
 * mit der echten Live-Datei aus data/. */
/* Eingefrorene Probe (Hide 'n Sneak, 17.10.2026) — keine Daten dieser Woche im Test. */
const AKT = JSON.parse(fs.readFileSync(path.join(WURZEL, 'tests', 'fixtures', 'masterclass_aktuell_probe.json'), 'utf8'));

test('Matchpunkte, unter 20 Matches die Bilanz', () => {
    const { mc } = umgebung();
    assert.strictEqual(mc._aktQuote([10, 5, 5]).txt, '58,3 %');
    assert.strictEqual(mc._aktQuote([10, 5, 4]).txt, '10–5–4');
    assert.strictEqual(mc._aktQuote([10, 5, 4]).duenn, true);
    assert.strictEqual(mc._aktQuote([0, 0, 0]).txt, '—');
});

test('der Block zeigt Online und vor Ort nebeneinander, mit der Einschaetzung des Autors', () => {
    const { mc } = umgebung();
    const html = mc._aktuellBlockHtml(AKT, (s) => (s === 'dragapult-ex' ? 'AUTORWERT' : ''));
    assert.ok(html.includes('Online · ' + AKT.online.format), 'keine Online-Karte');
    assert.ok(html.includes('Vor Ort · Regionals ' + AKT.vor_ort.format), 'keine Vor-Ort-Karte');
    assert.ok(html.includes('AUTORWERT'), 'die Einschaetzung des Autors fehlt');
    const g = AKT.gegner[0];
    assert.ok(html.includes(mc._aktQuote(g.online).txt) && html.includes(mc._aktQuote(g.vor_ort).txt), 'Zahlen des ersten Gegners fehlen');
    assert.ok(html.includes('Alle ' + AKT.gegner.length + ' Gegner'));
    const ohne = mc._aktuellBlockHtml(AKT, () => '');
    assert.ok(!ohne.includes('>Autor<'), 'Autor-Spalte ohne einen einzigen Wert');
});

test('„weicht ab“ nur, wo Online und vor Ort 10 Punkte auseinander liegen', () => {
    const { mc } = umgebung();
    const a = JSON.parse(JSON.stringify(AKT));
    a.gegner = [
        { slug: 'x', name: 'X', anteil: '1,00', online: [30, 10, 0], vor_ort: [10, 30, 0] },
        { slug: 'y', name: 'Y', anteil: '1,00', online: [20, 20, 0], vor_ort: [21, 19, 0] },
        { slug: 'z', name: 'Z', anteil: '1,00', online: [30, 0, 0], vor_ort: [1, 5, 0] }
    ];
    const z = mc._aktuellMuZeilen(a);
    assert.ok(z.x.html.includes('weicht ab'));
    assert.ok(!z.y.html.includes('weicht ab'));
    assert.ok(!z.z.html.includes('weicht ab'), 'eine duenne Stichprobe darf keine Abweichung behaupten');
});

test('Namen aus den Daten werden maskiert', () => {
    const { mc } = umgebung();
    const a = JSON.parse(JSON.stringify(AKT));
    a.gegner[0].name = '<img src=x onerror=alert(1)>';
    assert.ok(!mc._aktuellBlockHtml(a).includes('<img src=x'));
});

test('auf der Seite landet der Block oben in den Matchups — einmal, auch beim zweiten Einsetzen', () => {
    const { mc } = umgebung();
    const w = wurzelMit('<div data-mcl-abschnitt="spick">S</div><div data-mcl-abschnitt="matchups"><p>M</p>' +
        '<details class="mcl-mu" data-live-slug="dragapult-ex"><summary><span class="mcl-wrz mcl-wrz-tim"><em>Tim</em><b>gut</b></span></summary></details></div>');
    assert.strictEqual(mc._liveEinsetzen(w, { aktuell: AKT }), true);
    mc._aktuellEinsetzen(w, AKT);
    assert.strictEqual(w.querySelectorAll('[data-mcl-akt-huelle]').length, 1, 'Block doppelt');
    const mu = w.querySelector('[data-mcl-abschnitt="matchups"]');
    assert.ok(mu.querySelector('[data-mcl-akt]'), 'Block nicht in den Matchups');
    assert.ok(mu.innerHTML.indexOf('mcl-akt') < mu.innerHTML.indexOf('<p>M</p>'), 'Block nicht oben');
    assert.ok(mu.innerHTML.includes('>gut<'), 'Tims Einschaetzung fehlt in der Tabelle');
});

test('zeigePrivat schickt Block und Matchup-Zeilen in den Rahmen', async () => {
    const { mc } = umgebung({ live: { aktuell: AKT } });
    const g = mc._privatAusDoc('hide-n-sneak', { titel: 'H', html: '<html><body>X</body></html>' });
    const gesendet = [];
    let laden = null;
    const rahmen = { addEventListener: (t, fn) => { if (t === 'load') laden = fn; }, contentWindow: { postMessage: (d) => gesendet.push(d) } };
    const buehne = { innerHTML: '', querySelector: (s) => (s === '.mcl-privat-rahmen' ? rahmen : { addEventListener() {} }), scrollIntoView() {} };
    mc._zeigePrivat(buehne, g);
    await new Promise((r) => setTimeout(r, 0));
    laden();
    assert.strictEqual(gesendet.length, 1);
    assert.ok(gesendet[0].block.includes('data-autor-fuer="dragapult-ex"'), 'Autor-Spalte nicht als Platzhalter');
    assert.ok(gesendet[0].mu['dragapult-ex'].html.includes('Vor Ort'));
});

test('im Rahmen setzt das Skript Block, Autor-Spalte und Matchup-Zeilen', () => {
    const { mc } = umgebung();
    const html = mc._mitAnkern('<html><body></body></html>');
    const live = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).filter((s) => s.includes('mcl-live'))[0];
    const body = new dom.Element('body');
    body.innerHTML = '<h2 id="matchups">M</h2><details class="mu" data-live-slug="dragapult-ex dragapult-blaziken" data-autor="AUTOR-A">' +
        '<summary><h4>K</h4><span class="res" data-live-ersetzt="1">alt</span></summary></details>' +
        '<details class="mu" data-live-slug="n-zoroark"><summary><h4>Z</h4></summary></details>';
    const d = {
        body,
        querySelectorAll: (s) => body.querySelectorAll(s),
        querySelector: (s) => body.querySelector(s),
        getElementById: (id) => body.querySelector('#' + id),
        createElement: (t) => new dom.Element(t)
    };
    body.insertBefore = body.insertBefore || function (neu, vor) {
        const i = this.childNodes.indexOf(vor); if (neu.parentNode) neu.parentNode.removeChild(neu);
        neu.parentNode = this; this.childNodes.splice(i < 0 ? 0 : i, 0, neu); return neu;
    };
    let handler = null;
    const eltern = {};
    const k = { window: { parent: eltern, addEventListener: (t, fn) => { if (t === 'message') handler = fn; } }, document: d, Object, Array, String };
    vm.createContext(k);
    vm.runInContext(live, k);
    const a = JSON.parse(JSON.stringify(AKT));
    handler({ source: eltern, data: { typ: 'mcl-live', werte: {}, block: mc._aktuellBlockHtml(a, 'rahmen'), mu: mc._aktuellMuZeilen(a) } });
    const t = body.innerHTML;
    assert.ok(t.indexOf('data-mcl-akt') >= 0 && t.indexOf('data-mcl-akt') < t.indexOf('id="matchups"'), 'Block nicht vor den Matchups');
    assert.ok(body.querySelector('[data-autor-fuer="dragapult-ex"]').textContent === 'AUTOR-A', 'Autor-Spalte nicht gefuellt');
    const zeilen = body.querySelectorAll('details.mu')[0].querySelectorAll('.mcl-akt-mu');
    assert.strictEqual(zeilen.length, 2, 'je Variante eine Zeile erwartet');
    assert.ok(body.querySelector('[data-live-ersetzt]').hidden, 'die alte Datenzeile bleibt sichtbar');
    handler({ source: eltern, data: { typ: 'mcl-live', werte: {}, block: mc._aktuellBlockHtml(a, 'rahmen'), mu: mc._aktuellMuZeilen(a) } });
    assert.strictEqual(body.querySelectorAll('[data-mcl-akt-huelle]').length, 1, 'Block nach zweiter Nachricht doppelt');
    assert.strictEqual(body.querySelectorAll('details.mu')[0].querySelectorAll('.mcl-akt-mu').length, 2, 'Zeilen doppelt');
});

/* ── Regal: Variante A und Profi-Wissen vorn (Hausi 17.10.2026) ── */

test('Profi-Wissen steht vorn, vor Stalobor und den Deck-Masterclasses', async () => {
    const u = umgebung({ docs: [
        { id: 'allgemein-profi-wissen', data: { titel: 'Profi-Wissen', html: '<p>P</p>' } },
        { id: 'hide-n-sneak', data: { titel: 'H', html: '<p>H</p>' } },
        { id: 'mega-stalobor', data: { html: '<p>X</p>' } },
        { id: 'mega-tohaido', data: { titel: 'T', html: '<p>T</p>' } }] });
    u.mc._zeichneRegal();
    await new Promise((r) => setTimeout(r, 0));
    const ids = u.host.querySelectorAll('.mcl-kachel').map((k) => k.getAttribute('data-mcl-guide'));
    assert.deepStrictEqual(ids, ['privat-allgemein-profi-wissen', 'mega-stalobor', 'privat-hide-n-sneak', 'privat-mega-tohaido'], ids.join(','));
});

test('das Kachelbild schlaegt die allgemeine Bildregel (Name wieder sichtbar)', () => {
    const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
    const roh = fs.readFileSync(path.join(WURZEL, 'css', 'masterclass.css'), 'utf8');
    const css = ohneKommentare(roh);
    assert.ok(css.length > roh.length * 0.3);
    assert.ok(/\.mcl-kachel \.mcl-kachel-bild\s*\{[^}]*width:\s*100%/.test(css), 'Kachelbild ohne eigene, staerkere Regel');
    assert.ok(/\.mcl-kachel-kopf\s*\{[^}]*flex-direction:\s*column/.test(css), 'Name steht nicht unter dem Bild');
    assert.ok(!/\.mcl-kachel-bild\s*\{\s*width:\s*(54|64)px/.test(css), 'die alte 64/54-px-Regel ist zurueck');
});
