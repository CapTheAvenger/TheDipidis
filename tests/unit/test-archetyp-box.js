/**
 * FE-13 Archetyp-Box (Rutsch 15, 28.09.2026).
 *
 * Die Logik in js/archetyp-box.js wird AUSGEFUEHRT, nicht gelesen. Die
 * Zusagen, auf die es Hausi ankommt:
 *
 *  1. Aktualisieren bringt neue Karten als "fehlt" mit Marke "neu" — und
 *     laesst den Status bekannter Karten stehen.
 *  2. Nichts verschwindet still: eine Karte, die in den Daten fehlt, bleibt
 *     und wird benannt; von Hand hinzugefuegte Karten sind ausgenommen.
 *  3. Karten werden NIE ueber den Namen verbunden — nur (Set, Nummer) und
 *     die internationalen Drucke derselben Karte.
 *  4. Die Box zeigt: oben fehlend, dann Original, dann Proxy; die Druck-
 *     funktion bekommt genau die Proxy-Karten mit ihrer Anzahl.
 *  5. Die Anzahl auf dem Kaertchen ist dieselbe wie in der Kartenuebersicht
 *     (beide Regeln werden ausgefuehrt und verglichen).
 *  6. Gespeichert wird im Konto unter users/{uid}/archetypBoxen, und die
 *     bestehende Firestore-Regel deckt das ab.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const R = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const QUELLE = R('js/archetyp-box.js');

const ohneKommentare = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

function logik(quelle) {
    const ctx = { module: { exports: {} }, console };
    vm.runInNewContext(quelle || QUELLE, ctx);
    return ctx.module.exports;
}

// Werte aus dem vm-Kontext haben fremde Prototypen — ueber JSON vergleichen.
const gleich = (a, b, m) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b, m);

const L = logik();
const HEUTE = '2026-09-28';

function karte(id, extra) {
    const [set, number] = id.split('-');
    return Object.assign({ id, name: 'Karte ' + id, set, number, bild: '', typ: 'Item', anzahl: 2, maxAnzahl: 4, anteil: 50, refs: [] }, extra || {});
}

describe('FE-13: eine neue Box', () => {
    it('legt jede Karte einmal als "fehlt" an, ohne Neu-Marke', () => {
        const box = L.neueBox({ name: 'Dragapult', archetyp: 'Dragapult', schwelle: '50', datenStand: '2026-09-19' },
            [karte('TWM-130'), karte('TWM-129'), karte('TWM-130')], HEUTE);
        assert.equal(box.karten.length, 2);
        assert.ok(box.karten.every(k => k.status === 'fehlt' && k.neu === null && k.inDaten === true));
        assert.equal(box.schwelle, '50');
        assert.equal(box.datenStand, '2026-09-19');
    });
});

describe('FE-13: Aktualisieren', () => {
    const alt = (() => {
        let b = L.neueBox({ name: 'X', archetyp: 'X', schwelle: 'all', datenStand: '2026-09-19' },
            [karte('TWM-130'), karte('PAL-185', { typ: 'Supporter' }), karte('SVI-1')], '2026-09-20');
        b = L.statusSetzen(b, 'TWM-130', 'original');
        b = L.statusSetzen(b, 'PAL-185', 'proxy');
        b = L.manuellHinzufuegen(b, karte('MEW-151'), '2026-09-20').box;
        return b;
    })();

    const frisch = [
        karte('TWM-130', { anteil: 80, maxAnzahl: 3 }),
        // anderer Druck derselben Karte (Iono PAL 185 -> PAF 80): kein neuer Eintrag
        karte('PAF-80', { typ: 'Supporter', refs: ['PAL-185', 'SVP-124'] }),
        karte('30C-12', { anteil: 12 })            // neu im Format
    ];
    const erg = L.abgleichen(alt, frisch, { datenStand: '2026-09-26' }, HEUTE);

    it('neue Karte kommt als "fehlt" und "neu" dazu', () => {
        gleich(erg.neu.map(k => k.id), ['30C-12']);
        const k = erg.box.karten.find(x => x.id === '30C-12');
        assert.equal(k.status, 'fehlt');
        assert.equal(k.neu, HEUTE);
    });

    it('bekannte Karten behalten ihren Status, ihre Zahlen werden nachgezogen', () => {
        const d = erg.box.karten.find(x => x.id === 'TWM-130');
        assert.equal(d.status, 'original');
        assert.equal(d.anteil, 80);
        assert.equal(d.gefordert, 3, '"gefordert" kommt aus den Daten und wird nachgezogen');
        assert.equal(L.drin(d), 4, 'was in der Box liegt, fasst das Aktualisieren nicht an');
        const iono = erg.box.karten.find(x => x.id === 'PAL-185');
        assert.equal(iono.status, 'proxy', 'der andere Druck hat die Karte als neu angelegt');
        assert.ok(iono.refs.includes('PAF-80'));
    });

    it('fehlende Karten bleiben und werden benannt, von Hand hinzugefuegte nicht', () => {
        const svi = erg.box.karten.find(x => x.id === 'SVI-1');
        assert.ok(svi, 'eine Karte ist still verschwunden');
        assert.equal(svi.inDaten, false);
        gleich(erg.nichtMehr.map(k => k.id), ['SVI-1']);
        const mew = erg.box.karten.find(x => x.id === 'MEW-151');
        assert.ok(mew && mew.manuell && mew.inDaten !== false);
        assert.equal(erg.box.datenStand, '2026-09-26');
    });

    it('die alte Box bleibt unberuehrt', () => {
        assert.equal(alt.karten.length, 4);
        assert.ok(!alt.karten.some(k => k.id === '30C-12'));
    });

    it('eine selbst gesetzte Menge ueberschreibt das Aktualisieren nicht', () => {
        const b = L.drinSetzen(alt, 'TWM-130', 1);
        const e = L.abgleichen(b, frisch, {}, HEUTE);
        assert.equal(L.drin(e.box.karten.find(x => x.id === 'TWM-130')), 1);
    });

    it('ein zweiter Lauf mit denselben Daten bringt nichts Neues', () => {
        const e2 = L.abgleichen(erg.box, frisch, { datenStand: '2026-09-26' }, HEUTE);
        assert.equal(e2.neu.length, 0);
        assert.equal(e2.nichtMehr.length, 0, 'eine schon benannte Karte wird nicht jedes Mal neu gemeldet');
        assert.equal(e2.box.karten.length, erg.box.karten.length);
    });
});

describe('FE-13: nie ueber den Namen', () => {
    it('gleicher Name, anderer Druck ohne Druckbezug = zwei Karten', () => {
        const box = L.neueBox({ name: 'X', archetyp: 'X' },
            [karte('M5-37', { name: 'Dhelmise' }), karte('MEG-18', { name: 'Dhelmise' })], HEUTE);
        assert.equal(box.karten.length, 2);
    });

    it('der Abgleich kennt keinen Namensvergleich', () => {
        const code = ohneKommentare(QUELLE.slice(QUELLE.indexOf('function gleicheKarte'), QUELLE.indexOf('function anzahlBegrenzen')));
        assert.ok(!/\.name\b/.test(code), 'gleicheKarte liest den Namen');
    });
});

describe('FE-13: Ansicht und Druck', () => {
    let b = L.neueBox({ name: 'X', archetyp: 'X' }, [
        karte('SVE-1', { typ: 'Energy', anteil: 100 }),
        karte('TWM-130', { typ: 'Pokemon', anteil: 90 }),
        karte('PAL-185', { typ: 'Supporter', anteil: 95, maxAnzahl: 2 }),
        karte('TWM-129', { typ: 'Pokemon', anteil: 99, maxAnzahl: 4 }),
    ], HEUTE);
    b = L.statusSetzen(b, 'PAL-185', 'proxy');
    b = L.statusSetzen(b, 'TWM-129', 'proxy');
    b = L.statusSetzen(b, 'SVE-1', 'original');

    it('drei Rubriken, Pokemon zuerst, innerhalb nach Anteil', () => {
        const r = L.rubriken(b);
        gleich(r.fehlt.map(k => k.id), ['TWM-130']);
        gleich(r.original.map(k => k.id), ['SVE-1']);
        gleich(r.proxy.map(k => k.id), ['TWM-129', 'PAL-185']);
    });

    it('mit Platznummer gilt die Reihenfolge der Kartenuebersicht, und Aktualisieren zieht sie nach', () => {
        let x = L.neueBox({ name: 'X', archetyp: 'X' }, [
            karte('TWM-130', { typ: 'Pokemon', anteil: 100, reihe: 2 }),
            karte('TWM-128', { typ: 'Pokemon', anteil: 100, reihe: 0 }),
            karte('TWM-129', { typ: 'Pokemon', anteil: 100, reihe: 1 })], HEUTE);
        gleich(L.rubriken(x).fehlt.map(k => k.id), ['TWM-128', 'TWM-129', 'TWM-130']);
        x = L.abgleichen(x, [karte('TWM-130', { reihe: 0 }), karte('TWM-128', { reihe: 1 }), karte('TWM-129', { reihe: 2 })], {}, HEUTE).box;
        gleich(L.rubriken(x).fehlt.map(k => k.id), ['TWM-130', 'TWM-128', 'TWM-129']);
    });

    it('die Druckfunktion bekommt genau die Proxy-Karten mit Anzahl', () => {
        gleich(L.proxyListe(b).map(p => [p.set + ' ' + p.number, p.anzahl]),
            [['TWM 129', 4], ['PAL 185', 2]]);
        const z = L.zaehlen(b);
        assert.equal(z.kopien.proxy, 6, 'Proxy ohne Menge legt die geforderte Menge hinein');
        gleich([z.fehlt, z.original, z.proxy], [1, 1, 2]);
    });

    it('Einsortieren nimmt die Neu-Marke weg', () => {
        const e = L.abgleichen(b, [karte('30C-1')], {}, HEUTE).box;
        const s = L.statusSetzen(e, '30C-1', 'original');
        assert.equal(s.karten.find(k => k.id === '30C-1').neu, null);
    });

    it('eine Karte, die schon drin ist, wird von Hand nicht doppelt angelegt', () => {
        const e = L.manuellHinzufuegen(b, karte('PAF-80', { refs: ['PAL-185'] }), HEUTE);
        assert.equal(e.hinzugefuegt, false);
    });

    it('Menge zwischen 0 und 99, auch ueber "gefordert" hinaus', () => {
        const k = (x) => x.karten.find(q => q.id === 'SVE-1');
        assert.equal(L.drin(k(L.drinSetzen(b, 'SVE-1', 7))), 7);
        assert.equal(L.drin(k(L.drinSetzen(b, 'SVE-1', 500))), 99);
        const leer = L.drinSetzen(b, 'SVE-1', 0);
        assert.equal(L.drin(k(leer)), 0);
        assert.equal(k(leer).status, 'fehlt', 'nichts drin heisst fehlt');
    });
});

describe('FE-13 Nachtrag (28.09.2026): gefordert, drin, Drucke', () => {
    const basis = L.neueBox({ name: 'X', archetyp: 'X' }, [
        karte('MEG-54', { name: 'Abra', typ: 'Pokemon', maxAnzahl: 4, refs: ['SVI-1', 'PAF-7'] })], HEUTE);
    const k = (x) => x.karten.find(q => q.id === 'MEG-54');

    it('neu angelegt: gefordert aus max_count, nichts drin', () => {
        assert.equal(k(basis).gefordert, 4);
        assert.equal(L.drin(k(basis)), 0);
        assert.equal(k(basis).status, 'fehlt');
    });

    it('+ auf einer fehlenden Karte legt sie als Original hinein', () => {
        const x = L.drinSetzen(basis, 'MEG-54', 1);
        assert.equal(L.drin(k(x)), 1);
        assert.equal(k(x).status, 'original');
    });

    it('Proxy bleibt Proxy, wenn die Menge sich aendert', () => {
        let x = L.statusSetzen(basis, 'MEG-54', 'proxy');
        x = L.drinSetzen(x, 'MEG-54', 2);
        assert.equal(k(x).status, 'proxy');
        assert.equal(L.drin(k(x)), 2);
    });

    it('Tippen auf "gefordert" fuellt auf, nimmt aber nie etwas weg', () => {
        let x = L.drinSetzen(basis, 'MEG-54', 1);
        x = L.auffuellen(x, 'MEG-54');
        assert.equal(L.drin(k(x)), 4);
        x = L.drinSetzen(x, 'MEG-54', 6);
        x = L.auffuellen(x, 'MEG-54');
        assert.equal(L.drin(k(x)), 6);
    });

    it('Aufteilung nach Druck: Summe ist die Menge, Minus nimmt erst vom angezeigten Druck', () => {
        let x = L.druckeSetzen(basis, 'MEG-54', [
            { id: 'MEG-54', set: 'MEG', number: '54', n: 2 },
            { id: 'SVI-1', set: 'SVI', number: '1', n: 2 },
            { id: 'PAF-7', set: 'PAF', number: '7', n: 0 }]);
        assert.equal(L.drin(k(x)), 4);
        gleich(k(x).drucke.map(d => [d.id, d.n]), [['MEG-54', 2], ['SVI-1', 2]]);
        assert.equal(k(x).status, 'original');
        x = L.drinSetzen(x, 'MEG-54', 1);
        gleich(k(x).drucke.map(d => [d.id, d.n]), [['SVI-1', 1]]);
        // Der angezeigte Druck gibt zuerst ab, auch wenn ein anderer mehr hat.
        let y = L.druckeSetzen(basis, 'MEG-54', [
            { id: 'MEG-54', set: 'MEG', number: '54', n: 1 }, { id: 'SVI-1', set: 'SVI', number: '1', n: 3 }]);
        y = L.drinSetzen(y, 'MEG-54', 3);
        gleich(k(y).drucke.map(d => [d.id, d.n]), [['SVI-1', 3]]);
    });

    it('Proxy-Druck bekommt jeden Druck mit seiner Menge', () => {
        let x = L.druckeSetzen(basis, 'MEG-54', [
            { id: 'MEG-54', set: 'MEG', number: '54', n: 1 }, { id: 'SVI-1', set: 'SVI', number: '1', n: 3 }]);
        x = L.statusSetzen(x, 'MEG-54', 'proxy');
        gleich(L.proxyListe(x).map(p => [p.set + ' ' + p.number, p.anzahl]), [['MEG 54', 1], ['SVI 1', 3]]);
    });

    it('"Fehlt" leert die Box fuer diese Karte', () => {
        let x = L.drinSetzen(basis, 'MEG-54', 3);
        x = L.statusSetzen(x, 'MEG-54', 'fehlt');
        assert.equal(L.drin(k(x)), 0);
    });

    it('Boxen aus #859 (nur anzahl + Status) werden ohne Verlust gelesen', () => {
        const alt = { id: 'TWM-130', set: 'TWM', number: '130', status: 'proxy', anzahl: 3, maxAnzahl: 4, anzahlEigen: true };
        const n = L.normiert(alt);
        assert.equal(L.drin(n), 3);
        assert.equal(n.gefordert, 4);
        const leer = L.normiert({ id: 'A-1', set: 'A', number: '1', status: 'fehlt', anzahl: 2, maxAnzahl: 2 });
        assert.equal(L.drin(leer), 0);
    });
});

describe('FE-13: neue Turnierdaten erkennen', () => {
    it('juengstes Datum aus einem Manifest in der Form von tournament_cards_manifest.json', () => {
        // Form wie in der ausgelieferten Datei (chunk_dates je Datei mit
        // min_date/max_date); bewusst ohne Datenzugriff, die Werte der
        // Woche spielen fuer die Regel keine Rolle.
        const m = { chunk_dates: {
            'tournament_cards_data_cards_TEF-POR.csv': { min_date: '2026-04-25', max_date: '2026-05-30' },
            'tournament_cards_data_cards_TEF-PBL.csv': { min_date: '2026-08-28', max_date: '2026-09-19' },
            'tournament_cards_data_cards_SVI-ASC.csv': { min_date: '2026-03-07', max_date: '2026-04-04' } } };
        assert.equal(L.neuestesDatumImManifest(m), '2026-09-19');
        assert.equal(L.neuestesDatumImManifest({}), null);
    });
    it('juenger als die Box = Hinweis, gleich alt = kein Hinweis', () => {
        assert.equal(L.neueDatenDa({ datenStand: '2026-09-19' }, '2026-09-26'), true);
        assert.equal(L.neueDatenDa({ datenStand: '2026-09-26' }, '2026-09-26'), false);
        assert.equal(L.neueDatenDa({ datenStand: '2026-09-19' }, null), false);
    });
});

describe('FE-13: Anzahl wie auf dem Kaertchen der Kartenuebersicht', () => {
    // Die echte Regel aus app-past-meta.js ausschneiden und ausfuehren.
    const PAST = R('js/app-past-meta.js');
    const stueck = (re) => { const m = re.exec(PAST); assert.ok(m, 'nicht gefunden: ' + re); return m[0]; };
    const quelle = stueck(/function getPastMetaRepresentativeCardCopies\(card\) \{[\s\S]*?\n        \}/)
        + '\n' + stueck(/function getPastMetaDisplayCount\(card\) \{[\s\S]*?\n        \}/);
    const baue = (total) => new Function('parsePastMetaNumber', 'pastMetaCurrentScope',
        quelle + '\nreturn { rep: getPastMetaRepresentativeCardCopies, anz: getPastMetaDisplayCount };')(
        (v, f) => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : f; },
        { totalDecklists: total });

    it('gleiche Zahl fuer typische Karten', () => {
        const faelle = [
            { card_count: 3.6, max_count: 4 }, { card_count: 0.01, max_count: 1 },
            { card_count: 0, max_count: 2 }, { card_count: 1.49, max_count: 3 }, { card_count: 2.5, max_count: 4 }];
        [1, 323].forEach(total => {
            const u = baue(total);
            faelle.forEach(c => assert.equal(L.anzahlWieUebersicht(c, total, u.rep(c)), u.anz(c),
                JSON.stringify(c) + ' bei ' + total + ' Listen'));
        });
    });
});

describe('FE-13: verdrahtet', () => {
    const HTML = R('index.html');
    const SW = R('service-worker.js');
    const FC = ohneKommentare(R('js/firebase-collection.js'));

    it('Skript und Stil sind eingebunden und im Service Worker', () => {
        assert.match(HTML, /<script src="js\/archetyp-box\.js\?v=\d+" defer><\/script>/);
        assert.match(HTML, /href="css\/archetyp-box\.css\?v=\d+"/);
        assert.ok(SW.includes("'./js/archetyp-box.js'") && SW.includes("'./css/archetyp-box.css'"));
        assert.ok(HTML.indexOf('js/app-past-meta.js') < HTML.indexOf('js/archetyp-box.js'),
            'archetyp-box.js muss nach app-past-meta.js laden');
    });

    it('Profil-Untertab und Knopf in Rotationen existieren', () => {
        assert.match(HTML, /onclick="switchProfileTab\('archetypbox'\)"/);
        assert.match(HTML, /id="profile-archetypbox"/);
        assert.match(HTML, /id="pastMetaArchetypBoxBtn"[^>]*onclick="ArchetypBox\.ausUebersicht\(\)"/);
        assert.ok(/tabName === 'archetypbox'[\s\S]{0,80}ArchetypBox\.profilOeffnen\(\)/.test(FC),
            'switchProfileTab oeffnet die Boxen nicht');
    });

    it('der Knopf in Rotationen wird nach jedem Filterlauf nachgezogen', () => {
        const P = ohneKommentare(R('js/app-past-meta.js'));
        const f = P.slice(P.indexOf('function filterPastMetaCards'), P.indexOf('function renderPastMetaCards'));
        assert.equal((f.match(/ArchetypBox\.uebersichtGezeichnet\(\)/g) || []).length, 2,
            'beide Wege durch filterPastMetaCards muessen den Knopf nachziehen');
    });

    it('gespeichert unter users/{uid}/archetypBoxen, von der bestehenden Regel gedeckt', () => {
        const code = ohneKommentare(QUELLE);
        assert.ok(ohneKommentare(QUELLE).length > QUELLE.length * 0.3);
        assert.match(code, /const SAMMLUNG = 'archetypBoxen'/);
        assert.match(code, /collection\('users'\)\.doc\(u\.uid\)\.collection\(SAMMLUNG\)/);
        const regeln = R('firestore.rules');
        assert.match(regeln, /match \/users\/\{uid\}\/\{document=\*\*\} \{\s*allow read, write: if request\.auth != null && request\.auth\.uid == uid;/);
    });
});

describe('FE-13: jeder Text in beiden Sprachen', () => {
    const i18n = R('js/i18n.js');
    const ctx = { window: {}, document: { documentElement: {}, addEventListener() {}, querySelectorAll: () => [] },
        localStorage: { getItem: () => 'de', setItem() {} }, navigator: { language: 'de' } };
    vm.runInNewContext(i18n + '\n;this.__tr = translations;', ctx);
    const code = ohneKommentare(QUELLE);
    const schluessel = new Set([...code.matchAll(/tx\('(abx\.[A-Za-z.]+)'/g)].map(m => m[1]).filter(k => !k.endsWith('.')));
    ['fehlt', 'original', 'proxy'].forEach(s => schluessel.add('abx.status.' + s));
    L.ELEMENTE.forEach(e => schluessel.add('abx.el.' + e));
    schluessel.add('abx.untertitel'); schluessel.add('profile.archetypBox');

    it('es gibt ueberhaupt Schluessel', () => assert.ok(schluessel.size > 40, 'nur ' + schluessel.size));
    for (const sprache of ['de', 'en']) {
        it('alle Schluessel in ' + sprache, () => {
            const fehlt = [...schluessel].filter(k => typeof ctx.__tr[sprache][k] !== 'string');
            gleich(fehlt, []);
        });
    }
    it('Platzhalter stimmen zwischen DE und EN ueberein', () => {
        const p = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
        const falsch = [...schluessel].filter(k => p(ctx.__tr.de[k]) !== p(ctx.__tr.en[k]));
        gleich(falsch, []);
    });
});

describe('FE-13: lesbar im dunklen Modus (live gefunden 28.09.2026)', () => {
    // Live im dunklen Modus war der aktive Knopf "Fehlt" ein heller Kasten
    // ohne lesbare Schrift: var(--ink-2) wird dort hell, und --on-dark ist
    // nicht weiss. Die --solid-*-Toene tragen weisse Schrift in beiden Modi.
    const CSS = ohneKommentare(R('css/archetyp-box.css'));
    const regel = (sel) => {
        const i = CSS.indexOf(sel + ' {');
        assert.ok(i >= 0, sel + ' fehlt');
        return CSS.slice(i, CSS.indexOf('}', i));
    };
    for (const s of ['fehlt', 'original', 'proxy']) {
        it('aktiver Knopf ' + s + ': solid-Ton mit weisser Schrift', () => {
            const r = regel('.abx-seg-' + s + '.is-active');
            assert.match(r, /background:\s*var\(--solid-(neutral|ok|info)\)/);
            assert.match(r, /color:\s*#fff/);
        });
    }
    it('Anzahl-Plakette haengt nicht an Tokens, die im dunklen Modus kippen', () => {
        const r = regel('.abx-anzahl');
        assert.ok(!/var\(--ink\)|var\(--on-dark\)/.test(r), r);
    });
});


describe('FE-13 Nachtrag: Handy-Regel fuer Knoepfe greift nicht auf die Plaketten', () => {
    // 390 px, 28.09.2026: die allgemeine Regel (button min 44x44, padding
    // 10px 15px) machte die runden Plaketten zu Ovalen und schob den
    // vierten Knopf aus der Kachel. Gemessen in scripts/messe_archetyp_box.py.
    const CSS = ohneKommentare(R('css/archetyp-box.css'));
    it('Plaketten behalten 28 px, Knoepfe duerfen schmal werden', () => {
        assert.match(CSS, /\.abx-karte \.abx-soll,\s*\.abx-karte \.abx-herz \{[^}]*height: 28px !important/);
        assert.match(CSS, /\.abx-karte \.abx-mini,\s*\.abx-karte \.abx-seg \{[^}]*min-width: 0 !important/);
    });
});

describe('FE-13 Nachtrag (28.09.2026 abends): entfernte Karten kommen nur auf Nachfrage zurueck', () => {
    const start = L.neueBox({ name: 'X', archetyp: 'X' }, [
        karte('TWM-130', { anteil: 90 }), karte('SVI-1', { anteil: 4 })], HEUTE);
    const ohne = L.entfernen(start, 'SVI-1', '2026-09-28');

    it('entfernen merkt sich die Karte samt Anteil', () => {
        assert.ok(!ohne.karten.some(k => k.id === 'SVI-1'));
        gleich(ohne.entfernt.map(e => [e.id, e.anteil]), [['SVI-1', 4]]);
    });

    it('gleich oft gespielt: bleibt draussen, kein Angebot', () => {
        const e = L.abgleichen(ohne, [karte('TWM-130', { anteil: 90 }), karte('SVI-1', { anteil: 4 })], {}, HEUTE);
        assert.ok(!e.box.karten.some(k => k.id === 'SVI-1'));
        assert.equal(e.box.wieder.length, 0);
        assert.equal(e.neu.length, 0);
    });

    it('oefter gespielt: wird angeboten, aber NICHT still hineingelegt', () => {
        const e = L.abgleichen(ohne, [karte('TWM-130', { anteil: 90 }), karte('SVI-1', { anteil: 12 })], {}, HEUTE);
        assert.ok(!e.box.karten.some(k => k.id === 'SVI-1'));
        gleich(e.box.wieder.map(w => [w.id, w.anteil, w.anteilVorher]), [['SVI-1', 12, 4]]);
        gleich(e.wieder.map(w => w.id), ['SVI-1']);
    });

    it('ein anderer Druck derselben Karte zaehlt als dieselbe Karte', () => {
        const e = L.abgleichen(ohne, [karte('PAF-9', { anteil: 12, refs: ['SVI-1'] })], {}, HEUTE);
        gleich(e.box.wieder.map(w => w.id), ['PAF-9']);
    });

    it('Aufnehmen legt sie als "fehlt" + "Neu" zurueck und vergisst die Entfernung', () => {
        const e = L.abgleichen(ohne, [karte('SVI-1', { anteil: 12 })], {}, HEUTE).box;
        const x = L.wiederAufnehmen(e, 'SVI-1', HEUTE);
        const k = x.karten.find(q => q.id === 'SVI-1');
        assert.equal(k.status, 'fehlt');
        assert.equal(k.neu, HEUTE);
        assert.equal(x.wieder.length, 0);
        assert.equal(x.entfernt.length, 0);
    });

    it('Draussen lassen: erst wieder angeboten, wenn der Anteil weiter steigt', () => {
        const e = L.abgleichen(ohne, [karte('SVI-1', { anteil: 12 })], {}, HEUTE).box;
        const x = L.draussenLassen(e, 'SVI-1');
        assert.equal(x.wieder.length, 0);
        assert.equal(x.entfernt[0].anteil, 12);
        assert.equal(L.abgleichen(x, [karte('SVI-1', { anteil: 12 })], {}, HEUTE).box.wieder.length, 0);
        assert.equal(L.abgleichen(x, [karte('SVI-1', { anteil: 15 })], {}, HEUTE).box.wieder.length, 1);
    });

    it('von Hand wieder hinzugefuegt: die Entfernung ist vergessen', () => {
        const x = L.manuellHinzufuegen(ohne, karte('SVI-1'), HEUTE).box;
        assert.equal(x.entfernt.length, 0);
    });
});

describe('FE-13 Nachtrag: Filter und Sortierung', () => {
    const kk = [
        { k: { id: 'A-1', name: 'Pikachu', typ: 'Pokemon', anteil: 95 }, element: 'Lightning', box: { name: 'B1' } },
        { k: { id: 'A-2', name: 'Venusaur', typ: 'Pokemon', anteil: 40 }, element: 'Grass', box: { name: 'B1' } },
        { k: { id: 'A-3', name: 'Iono', typ: 'Supporter', anteil: 100 }, element: '', box: { name: 'B2' } },
        { k: { id: 'A-4', name: 'Tech', typ: 'Item', anteil: 3 }, element: '', box: { name: 'B2' } },
        { k: { id: 'A-5', name: 'Hand', typ: 'Item', anteil: null, manuell: true }, element: '', box: { name: 'B2' } },
        { k: { id: 'A-6', name: 'Charmander', typ: 'Pokemon', anteil: 70 }, element: 'Fire', box: { name: 'B2' } },
    ];
    const ids = (f) => kk.filter(e => L.filterPasst(e.k, f, e.element)).map(e => e.k.id);

    it('Anteil ab 70 % / unter 10 % / alle', () => {
        gleich(ids({ anteil: '70' }), ['A-1', 'A-3', 'A-6']);
        gleich(ids({ anteil: 'u10' }), ['A-4']);
        assert.equal(ids({ anteil: 'alle' }).length, 6);
    });

    it('Kartenart und Pokemon-Typ', () => {
        gleich(ids({ art: 'Supporter' }), ['A-3']);
        gleich(ids({ art: 'Pokemon', element: 'Grass' }), ['A-2']);
        gleich(ids({ art: 'Item', element: 'Grass' }), ['A-4', 'A-5'], 'der Typ gilt nur fuer Pokemon');
    });

    it('nach Kartenart und Typ: Pflanze vor Feuer vor Elektro, dann Supporter, dann Items', () => {
        gleich(L.sortieren(kk, 'art', false).map(e => e.k.id), ['A-2', 'A-6', 'A-1', 'A-3', 'A-5', 'A-4']);
    });

    it('ueber alle Boxen nach Anteil: hoechster zuerst', () => {
        gleich(L.sortieren(kk, 'anteil', false).map(e => e.k.id).slice(0, 3), ['A-3', 'A-1', 'A-6']);
    });
});


describe('FE-13 Nachtrag: "gefordert" bleibt am iPhone rund', () => {
    // css/tippziele.css gibt bei (pointer: coarse) jedem Knopf min-height
    // 44 px — mit einer Spezifitaet (sieben :not), gegen die keine
    // Klassenregel ankommt. Der dafuer vorgesehene Ausweg ist data-klein.
    // Gemessen (Playwright, has_touch, 390 px): ohne 44 px, mit 28 px.
    it('der Knopf "gefordert" traegt data-klein', () => {
        const code = ohneKommentare(QUELLE);
        assert.match(code, /<button type="button" data-klein class="abx-soll/);
        assert.match(R('css/tippziele.css'), /button:not\(\.card-badge\):not\(\[data-klein\]\)/,
            'der Ausweg data-klein steht nicht mehr in css/tippziele.css');
    });
});


describe('FE-13 Nachtrag: Hauptfilter Format (aktuelles Meta, Standard, Expanded, Rotation)', () => {
    // Anteile je Format kommen aus den Rotationen-Daten (deck.format), die
    // Legalitaet aus data/format_window.json + data/sets.json. Hier mit
    // festen Beispielzahlen, damit der Test nicht an Wochendaten haengt.
    const kontext = {
        aktuell: 'TEF-PBL', vorher: 'TEF-CRI',
        legal: (k) => (k.legal === undefined ? null : k.legal),
        legalVorRotation: (k) => (k.vorher === undefined ? null : k.vorher)
    };
    const k = (id, formate, legal, vorher) => ({ id, formate, legal, vorher });
    const karten = [
        k('A-1', { 'TEF-PBL': 80, 'TEF-CRI': 75 }, true, true),   // bleibt
        k('A-2', { 'TEF-CRI': 40, 'TEF-PBL': 5 }, true, true),    // raus
        k('A-3', { 'TEF-PBL': 30 }, true, true),                 // neu
        k('A-4', { 'SVI-ASC': 90 }, false, true),                 // rotiert
        k('A-5', {}, false, false),                               // nur Expanded, schon laenger
        k('A-6', { 'TEF-PBL': 12, 'TEF-CRI': 10 }, null, null)    // Legalitaet unbekannt
    ];
    const wahl = (w) => karten.filter(x => L.formatPasst(x, w, kontext)).map(x => x.id);

    it('aktuelles Meta: im neuesten Format gespielt', () => {
        gleich(wahl('aktuell'), ['A-1', 'A-2', 'A-3', 'A-6']);
    });
    it('aus dem Meta gefallen und neu im Meta, an der Schwelle 10 %', () => {
        assert.equal(L.META_SCHWELLE, 10);
        gleich(wahl('raus'), ['A-2']);
        gleich(wahl('neu'), ['A-3']);
    });
    it('Standard, nur Expanded, bei der Rotation raus — unbekannt passt zu keinem', () => {
        gleich(wahl('standard'), ['A-1', 'A-2', 'A-3']);
        gleich(wahl('expanded'), ['A-4', 'A-5']);
        gleich(wahl('rotiert'), ['A-4']);
        gleich(wahl('alle'), ['A-1', 'A-2', 'A-3', 'A-4', 'A-5', 'A-6']);
    });

    it('aktuell und vorher nach dem juengsten Turnierdatum, nicht nach der Reihenfolge im Manifest', () => {
        const m = {
            meta_keys: ['SVI-ASC', 'TEF-CRI', 'TEF-PBL', 'TEF-POR'],
            chunks: ['a.csv', 'b.csv', 'c.csv', 'd.csv'],
            chunk_dates: { 'a.csv': { max_date: '2026-04-04' }, 'b.csv': { max_date: '2026-06-12' },
                'c.csv': { max_date: '2026-09-19' }, 'd.csv': { max_date: '2026-05-30' } }
        };
        gleich(L.formateNachDatum(m).map(x => x.key), ['TEF-PBL', 'TEF-CRI', 'TEF-POR', 'SVI-ASC']);
    });

    it('Block vor der Rotation: juengster Blockanfang, der aelter ist als das aelteste legale Set', () => {
        const order = { BST: 120, BRS: 125, SVI: 134, TEF: 140 };
        assert.equal(L.blockVorRotation(['BRS-TEF', 'BST-PAR', 'SVI-ASC', 'TEF-PBL'], 'TEF', order), 'SVI');
        assert.equal(L.blockVorRotation(['BRS-TEF', 'BST-PAR', 'SVI-ASC', 'TEF-PBL'], 'SVI', order), 'BRS');
        assert.equal(L.blockVorRotation(['TEF-PBL'], 'TEF', order), null);
    });

    it('legal ueber irgendeinen Druck (Set der Kennung), ohne Setliste unbekannt', () => {
        const sets = new Set(['PBL', 'MEG']);
        assert.equal(L.druckIn(['SVI-196', 'MEG-131'], sets), true);
        assert.equal(L.druckIn(['SVI-196', 'PAL-172'], sets), false);
        assert.equal(L.druckIn(['PBL-1'], null), null);
    });

    it('Anteile je Format ueber (Set, Nummer) und die Drucke — nie ueber den Namen', () => {
        const frische = [{ id: 'PBL-12', name: 'Ultra Ball', refs: ['SVI-196'] }, { id: 'PBL-99', name: 'Ultra Ball', refs: [] }];
        const jeFormat = {
            'TEF-PBL': [{ ids: ['SVI-196', 'X-1'], anteil: 80 }, { ids: ['PBL-12'], anteil: 60 }],
            'TEF-CRI': [{ ids: ['Y-1'], anteil: 99, name: 'Ultra Ball' }]
        };
        const aus = L.formateZuordnen(frische, jeFormat);
        gleich(aus[0].formate, { 'TEF-PBL': 80 }, 'hoechster Anteil ueber die Drucke');
        gleich(aus[1].formate, {}, 'gleicher Name, anderer Druck: kein Anteil');
    });

    it('Aktualisieren uebernimmt die Anteile je Format und leert sie fuer Karten, die nicht mehr vorkommen', () => {
        const box = L.neueBox({ name: 'X', archetyp: 'X' }, [karte('A-1'), karte('A-2')], HEUTE);
        assert.equal(box.mitFormaten, false);
        const erg = L.abgleichen(box, [karte('A-1', { formate: { 'TEF-PBL': 55 } })], {}, HEUTE);
        const k1 = erg.box.karten.find(x => x.id === 'A-1');
        const k2 = erg.box.karten.find(x => x.id === 'A-2');
        gleich(k1.formate, { 'TEF-PBL': 55 });
        gleich(k2.formate, {});
        assert.equal(erg.box.mitFormaten, true);
    });

    it('Verfaelschungsproben: jede Regel beisst', () => {
        const probe = (alt, neu) => {
            assert.ok(QUELLE.includes(alt), 'Probe passt nicht mehr: ' + alt);
            return logik(QUELLE.replace(alt, neu));
        };
        const M1 = probe("&& anteilIn(k, c.vorher) >= META_SCHWELLE && anteilIn(k, c.aktuell) < META_SCHWELLE;",
            "&& anteilIn(k, c.vorher) >= META_SCHWELLE;");
        assert.ok(karten.filter(x => M1.formatPasst(x, 'raus', kontext)).length > 1, 'raus ohne "jetzt darunter" faellt nicht auf');
        const M2 = probe("return legal === false && vorher === true;", "return legal === false;");
        assert.ok(karten.filter(x => M2.formatPasst(x, 'rotiert', kontext)).length > 1, 'rotiert ohne "vorher legal" faellt nicht auf');
        const M3 = probe("if (wahl === 'standard') return legal === true;", "if (wahl === 'standard') return legal !== false;");
        assert.ok(M3.formatPasst(karten[5], 'standard', kontext), 'unbekannte Legalitaet als Standard faellt nicht auf');
        const M4 = probe(".sort(function (a, b) { return a.bis < b.bis ? 1 : (a.bis > b.bis ? -1 : 0); });", ";");
        assert.equal(L.formateNachDatum({ meta_keys: ['B', 'A'], chunks: ['b', 'a'],
            chunk_dates: { a: { max_date: '2026-09-01' }, b: { max_date: '2026-01-01' } } })[0].key, 'A');
        assert.equal(M4.formateNachDatum({ meta_keys: ['B', 'A'], chunks: ['b', 'a'],
            chunk_dates: { a: { max_date: '2026-09-01' }, b: { max_date: '2026-01-01' } } })[0].key, 'B', 'Sortierung faellt nicht auf');
        const M5 = probe("if (!best || v > o[best]) best = start;", "if (!best) best = start;");
        assert.notEqual(M5.blockVorRotation(['BST-PAR', 'SVI-ASC'], 'TEF', { BST: 120, SVI: 134, TEF: 140 }), 'SVI');
        const M6 = probe("if (mitFormaten) k.formate = {};", "");
        const b0 = M6.neueBox({ name: 'X' }, [karte('A-2', { formate: { 'TEF-CRI': 40 } })], HEUTE);
        const e6 = M6.abgleichen(b0, [karte('A-1', { formate: { 'TEF-PBL': 5 } })], {}, HEUTE);
        assert.notDeepEqual(JSON.parse(JSON.stringify(e6.box.karten.find(x => x.id === 'A-2').formate)), {});
    });

    it('Filterzeile, Anwendung und Proxydruck sind verdrahtet; Texte in beiden Sprachen', () => {
        const code = ohneKommentare(QUELLE);
        assert.ok(code.length > QUELLE.length * 0.3, 'das Ausschneiden hat zu viel entfernt');
        assert.match(code, /filterPasst\(e\.k, ansicht, e\.element\) && formatPasst\(e\.k, ansicht\.format, kontext, e\.box\)/);
        assert.match(code, /filterPasst\(k, ansicht, elementVon\(k\)\) && formatPasst\(k, ansicht\.format, kontext, b\)/);
        assert.match(code, /formateZuordnen\(eintraegeAus\(karten, summe\.totalDecklists\), jeFormatAus\(auswahl\.matchingDecks\)\)/);
        assert.match(code, /formateZuordnen\(eintraegeAus\(gefilterteKarten\(z\.karten, schwelle\)/);
        // Ohne gewaehlte Box: ein Knopf gleicht alle Boxen ab (sonst bleiben die Meta-Filter bei alten Boxen leer).
        assert.match(code, /onclick="ArchetypBox\.aktualisieren\(null\)"/);
        assert.match(code, /const liste = id \? boxen\.filter\(function \(b\) \{ return b\.id === id; \}\) : boxen\.slice\(\);/);
        const i18n = R('js/i18n.js');
        ['abx.fFormat', 'abx.fmt.aktuell', 'abx.fmt.standard', 'abx.fmt.expanded', 'abx.fmt.raus', 'abx.fmt.neu', 'abx.fmt.rotiert',
            'abx.fmtAktuell', 'abx.fmtRaus', 'abx.fmtNeu', 'abx.fmtStandard', 'abx.fmtExpanded', 'abx.fmtRotiert',
            'abx.fmtFensterOhne', 'abx.fmtAlteBox', 'abx.fmtKeineDaten', 'abx.fmtLegalUnbekannt',
            'abx.alleAktualisieren', 'abx.alleAktualisiert', 'abx.ladeBox'].forEach(key => {
            const n = i18n.split("'" + key + "':").length - 1;
            assert.equal(n, 2, key + ' steht nicht in beiden Sprachen');
        });
    });
});


describe('FE-13 Nachtrag: Groesse der Box auf dem Chip (Karten und Stueck)', () => {
    // Hausi, 28.09.2026: „wie viele verschiedene Karten und wie viele in Summe,
    // damit ich weiss, wie gross die Box sein muss“.
    const box = {
        karten: [
            { id: 'A-1', set: 'A', number: '1', gefordert: 4, status: 'fehlt', drucke: [] },
            { id: 'A-2', set: 'A', number: '2', gefordert: 2, status: 'original', drucke: [{ id: 'A-2', set: 'A', number: '2', n: 1 }] },
            { id: 'A-3', set: 'A', number: '3', gefordert: 1, status: 'proxy', drucke: [{ id: 'A-3', set: 'A', number: '3', n: 3 }] },
            { id: 'A-4', set: 'A', number: '4', gefordert: null, manuell: true, status: 'fehlt', drucke: [] }
        ]
    };
    it('verschiedene Karten, Stueck (Hoechstes aus gefordert und drin), fehlende Karten, offene Stueck', () => {
        gleich(L.umfang(box), { karten: 4, stueck: 4 + 2 + 3 + 1, fehlen: 2, offen: 4 + 1 + 0 + 1 });
    });
    it('Verfaelschungsproben', () => {
        const probe = (alt, neu) => { assert.ok(QUELLE.includes(alt), alt); return logik(QUELLE.replace(alt, neu)); };
        assert.notEqual(probe('u.stueck += Math.max(soll, menge);', 'u.stueck += soll;').umfang(box).stueck, 10,
            'mehr drin als gefordert faellt nicht auf');
        assert.notEqual(probe('u.offen += Math.max(0, soll - menge);', 'u.offen += soll - menge;').umfang(box).offen, 6,
            'negatives Offen faellt nicht auf');
        assert.notEqual(probe("const soll = gefordertVon(k) > 0 ? gefordertVon(k) : 1;", "const soll = gefordertVon(k) || 0;").umfang(box).stueck, 10,
            'von Hand ohne Vorgabe zaehlt nicht mit');
    });
    it('der Chip zeigt beides, in beiden Sprachen', () => {
        const code = ohneKommentare(QUELLE);
        assert.match(code, /tx\('abx\.chipUmfang', \{ karten: u\.karten, stueck: u\.stueck \}/);
        assert.match(code, /tx\('abx\.chipFehlen', \{ n: u\.fehlen, offen: u\.offen \}/);
        const i18n = R('js/i18n.js');
        ['abx.chipUmfang', 'abx.chipFehlen'].forEach(k => assert.equal(i18n.split("'" + k + "':").length - 1, 2, k));
    });
});


describe('FE-13 Nachtrag: Sammelboxen ohne „Alle“ im Namen', () => {
    // Hausi, 28.09.2026: „Alakazam-Decks“ sagt schon, dass es mehrere Decks sind.
    it('Sammelauswahl heisst "{name}-Decks", eine einzelne Variante behaelt ihren Decknamen', () => {
        assert.equal(L.anzeigeName({ archetyp: '__familie__|Alakazam', name: 'Alle Alakazam-Decks' }), 'Alakazam-Decks');
        assert.equal(L.anzeigeName({ archetyp: '__familie__|Alakazam', name: 'All Alakazam decks' }, '{name} decks'), 'Alakazam decks');
        assert.equal(L.anzeigeName({ archetyp: 'Alakazam Dudunsparce', name: 'Alakazam Dudunsparce' }), 'Alakazam Dudunsparce');
    });
    it('Verfaelschungsprobe und Verdrahtung', () => {
        const alt = "if (a.indexOf(FAMILIE) === 0 && a.length > FAMILIE.length) {";
        assert.ok(QUELLE.includes(alt));
        const M = logik(QUELLE.replace(alt, 'if (false) {'));
        assert.notEqual(M.anzeigeName({ archetyp: '__familie__|Alakazam', name: 'Alle Alakazam-Decks' }), 'Alakazam-Decks');
        const code = ohneKommentare(QUELLE);
        assert.match(code, /chip\(r\.box\.id, nameVon\(r\.box\), umfang\(r\.box\)/);
        assert.match(code, /esc\(nameVon\(eine\)\) \+ '<\/h3>'/);
        assert.doesNotMatch(code, /esc\((b|eine|e\.box)\.name\)/, 'ein Boxname wird noch roh gezeigt');
        const i18n = R('js/i18n.js');
        assert.equal(i18n.split("'abx.familieName':").length - 1, 2);
    });
});


describe('FE-13 Nachtrag: „aus dem Meta gefallen“ nur, wenn der Archetyp im neuen Meta gespielt wurde', () => {
    // Hausi, 29.09.2026: ohne Deck im neuen Meta bleibt der Datenstand stehen,
    // es faellt nichts heraus. Spielt ein neues Deck die alten Karten nicht mehr,
    // fallen sie heraus.
    const kontext = { aktuell: 'TEF-30C', vorher: 'TEF-PBL' };
    const alt = { id: 'A-1', formate: { 'TEF-PBL': 100 } };
    const bleibt = { id: 'A-2', formate: { 'TEF-PBL': 100, 'TEF-30C': 90 } };
    const ohneDeck = { karten: [alt, { id: 'A-3', formate: { 'TEF-PBL': 60 } }] };
    const mitDeck = { karten: [alt, bleibt] };
    it('ohne Deck im neuen Meta faellt nichts heraus, mit Deck schon', () => {
        assert.equal(L.imFormatGespielt(ohneDeck, 'TEF-30C'), false);
        assert.equal(L.imFormatGespielt(mitDeck, 'TEF-30C'), true);
        assert.equal(L.formatPasst(alt, 'raus', kontext, ohneDeck), false);
        assert.equal(L.formatPasst(alt, 'raus', kontext, mitDeck), true);
        assert.equal(L.formatPasst(bleibt, 'raus', kontext, mitDeck), false);
    });
    it('Verfaelschungsprobe und Verdrahtung', () => {
        const stelle = "if (wahl === 'raus') return (!box || imFormatGespielt(box, c.aktuell))";
        assert.ok(QUELLE.includes(stelle));
        const M = logik(QUELLE.replace(stelle, "if (wahl === 'raus') return (true)"));
        assert.equal(M.formatPasst(alt, 'raus', kontext, ohneDeck), true, 'die Probe beisst nicht');
        const code = ohneKommentare(QUELLE);
        assert.match(code, /formatPasst\(e\.k, ansicht\.format, kontext, e\.box\)/);
        assert.match(code, /formatPasst\(k, ansicht\.format, kontext, b\)/);
        assert.equal(R('js/i18n.js').split("'abx.fmtRausOhne':").length - 1, 2);
    });
});

describe('Alle Boxen „Zusammen“ (30.09.2026): Summe je Karte, Verteilung, Reingelegt, Sammlung', () => {
    // Zahlen aus Hausis Screenshot vom 30.09.2026: Budew ASC 16 in sechs Boxen, Soll 2+1+1+1+2+1 = 8.
    const budew = (soll, extra) => Object.assign({ id: 'ASC-16', name: 'Budew', set: 'ASC', number: '16', gefordert: soll, status: 'fehlt', drucke: [], anteil: 5 }, extra || {});
    const box = (id, karten) => ({ id, name: id, karten });
    const boxen = [box('Alakazam', [budew(2)]), box('Archaludon', [budew(1)]), box('Beedrill', [budew(1)]),
        box('Ceruledge', [budew(1)]), box('Charizard', [budew(2)]), box('Conkeldurr', [budew(1, { status: 'original', drucke: [{ id: 'ASC-16', set: 'ASC', number: '16', n: 1 }] })])];
    const eintraege = (bs) => bs.flatMap(b => b.karten.map(k => ({ box: b, k })));

    it('eine Gruppe je (Set, Nummer): Soll summiert, drin und offen je Box', () => {
        const g = L.zusammenfassen(eintraege(boxen));
        assert.equal(g.length, 1);
        assert.equal(g[0].soll, 8);
        assert.equal(g[0].drin, 1);
        assert.equal(g[0].offen, 7);
        assert.equal(g[0].teile.length, 6);
        gleich(g[0].teile.map(t => [t.box.id, t.soll, t.drin, t.offen]),
            [['Alakazam', 2, 0, 2], ['Archaludon', 1, 0, 1], ['Beedrill', 1, 0, 1], ['Ceruledge', 1, 0, 1], ['Charizard', 2, 0, 2], ['Conkeldurr', 1, 1, 0]]);
    });
    it('gleicher Name, anderer Druck bleibt getrennt — nie ueber den Namen verbunden', () => {
        const anders = box('X', [{ id: 'PRE-1', name: 'Budew', set: 'PRE', number: '1', gefordert: 3, status: 'fehlt', drucke: [] }]);
        const g = L.zusammenfassen(eintraege(boxen.concat([anders])));
        assert.equal(g.length, 2);
        gleich(g.map(x => [x.id, x.soll]), [['ASC-16', 8], ['PRE-1', 3]]);
    });
    it('Reingelegt: Box bekommt ihr Soll, "fehlt" wird Original; Proxy bleibt Proxy; von Hand ohne Soll: 1', () => {
        const b = L.reinlegen(box('A', [budew(2)]), 'ASC-16');
        assert.equal(L.drin(b.karten[0]), 2);
        assert.equal(b.karten[0].status, 'original');
        const p = L.reinlegen(box('P', [budew(3, { status: 'proxy', drucke: [{ id: 'ASC-16', set: 'ASC', number: '16', n: 1 }] })]), 'ASC-16');
        assert.equal(L.drin(p.karten[0]), 3);
        assert.equal(p.karten[0].status, 'proxy');
        const h = L.reinlegen(box('H', [budew(null, { manuell: true, gefordert: null, maxAnzahl: null })]), 'ASC-16');
        assert.equal(L.drin(h.karten[0]), 1);
    });
    it('Sammlung: nur Originale, hoechstens 4, nie nach unten', () => {
        const drinAlle = boxen.map(b => L.reinlegen(b, 'ASC-16'));
        const teile = L.zusammenfassen(eintraege(drinAlle))[0].teile;
        gleich(L.sammlungsBedarf(teile, () => 1).map(x => [x.schluessel, x.inBoxen, x.besitz, x.ziel]), [['Budew|ASC|16', 8, 1, 4]]);
        assert.equal(L.sammlungsBedarf(teile, () => 4).length, 0, 'schon 4 in der Sammlung: nichts vorschlagen');
        assert.equal(L.sammlungsBedarf(teile, () => 9).length, 0, 'mehr in der Sammlung: nie senken');
        const nurProxy = [box('P', [budew(2, { status: 'proxy', drucke: [{ id: 'ASC-16', set: 'ASC', number: '16', n: 2 }] })])];
        assert.equal(L.sammlungsBedarf(L.zusammenfassen(eintraege(nurProxy))[0].teile, () => 0).length, 0, 'Proxys zaehlen nicht als Besitz');
        const zwei = [box('Z', [budew(2, { status: 'original', drucke: [{ id: 'ASC-16', set: 'ASC', number: '16', n: 2 }] })])];
        gleich(L.sammlungsBedarf(L.zusammenfassen(eintraege(zwei))[0].teile, () => 0).map(x => x.ziel), [2]);
    });
    it('Verfaelschungsproben und Verdrahtung', () => {
        const s1 = 'const id = kartenId(k.set, k.number) || k.id;';
        assert.ok(QUELLE.includes(s1));
        const M1 = logik(QUELLE.replace(s1, 'const id = k.name;'));
        const anders = box('X', [{ id: 'PRE-1', name: 'Budew', set: 'PRE', number: '1', gefordert: 3, status: 'fehlt', drucke: [] }]);
        assert.equal(M1.zusammenfassen(eintraege(boxen.concat([anders]))).length, 1, 'Probe Name statt Druck beisst nicht');
        const s2 = "if (!k || k.status !== 'original') return;";
        assert.ok(QUELLE.includes(s2));
        const M2 = logik(QUELLE.replace(s2, 'if (!k) return;'));
        const nurProxy = [box('P', [budew(2, { status: 'proxy', drucke: [{ id: 'ASC-16', set: 'ASC', number: '16', n: 2 }] })])];
        assert.equal(M2.sammlungsBedarf(M2.zusammenfassen(eintraege(nurProxy))[0].teile, () => 0).length, 1, 'Probe Proxy als Besitz beisst nicht');
        const s3 = 'const ziel = Math.min(4, x.inBoxen);';
        assert.ok(QUELLE.includes(s3));
        const M3 = logik(QUELLE.replace(s3, 'const ziel = x.inBoxen;'));
        const drinAlle = boxen.map(b => M3.reinlegen(b, 'ASC-16'));
        assert.equal(M3.sammlungsBedarf(M3.zusammenfassen(eintraege(drinAlle))[0].teile, () => 1)[0].ziel, 8, 'Probe ohne Playset-Grenze beisst nicht');
        const code = ohneKommentare(QUELLE);
        assert.match(code, /const zusammen = mitBoxName && ansicht\.gruppe === 'zusammen';/);
        assert.match(code, /filterLeiste\(kontext, ohneFormate, gewaehlt, mitBoxName\)/);
        assert.match(code, /addToCollection\(x\.schluessel\)/);
        for (const k of ['abx.gruppeZusammen', 'abx.verteilungZeile', 'abx.sammlungSetzen', 'abx.alleReingelegt']) {
            assert.equal(R('js/i18n.js').split("'" + k + "':").length - 1, 2, k + ' in beiden Sprachen');
        }
    });
});

describe('UI-51/UI-52/DA-18 (30.09.2026): Stufe der Box, Reihenfolge der Chips, Promos nur mit Beleg', () => {
    // Legalitaet wie im Kontext: Druck in einem Set des Fensters.
    const fenster = new Set(['TEF', 'PBL', '30C', 'SVP', 'SVE']);
    const kontext = {
        aktuell: 'TEF-30C', legalBekannt: true,
        legal: (k) => L.druckLegal([k.id].concat(k.refs || []), fenster, L.anteilIn(k, 'TEF-30C') > 0)
    };
    const box = (id, archetyp, karten) => ({ id, archetyp, name: archetyp, karten });
    const P = 'Pokemon';
    const gespielt = box('g', 'Dragapult Dusknoir', [{ id: 'TWM-130', typ: P, anteil: 100, formate: { 'TEF-30C': 100 } }]);
    // Trainer wie Arven OBF 186 (rotiert) machen eine Box nicht grau — live gemessen 30.09.2026.
    const legal = box('l', 'Ceruledge', [{ id: 'PBL-12', typ: P, anteil: 90, formate: { 'TEF-PBL': 90 } },
        { id: 'OBF-186', typ: 'Supporter', anteil: 95, formate: { 'SVI-PFL': 95 } }]);
    const raus = box('r', 'Lost Box', [{ id: 'LOR-81', typ: P, anteil: 80, formate: { 'SVI-PFL': 80 } }, { id: 'PBL-3', typ: P, anteil: 60 }]);
    // Reiner Promo ohne Set-Druck, im Format nicht gespielt: keine Aussage.
    const unbekannt = box('u', 'Roxanne Box', [{ id: 'SVP-290', typ: P, anteil: 70, formate: { 'BRS-PRE': 70 } }]);

    it('gespielt / legal / raus / unbekannt', () => {
        assert.equal(L.boxStufe(gespielt, kontext), 'gespielt');
        assert.equal(L.boxStufe(legal, kontext), 'legal');
        assert.equal(L.boxStufe(raus, kontext), 'raus');
        assert.equal(L.boxStufe(unbekannt, kontext), null, 'SVP allein ohne Beleg ist keine Aussage');
        assert.equal(L.boxStufe(gespielt, {}), null, 'ohne Formatdaten keine Farbe');
    });

    it('DA-18: ein Promo zaehlt nur mit Beleg, ein echtes Set immer', () => {
        // Nachdruck einer rotierten Set-Karte als Promo: nicht legal (Hausi, 30.09.2026).
        assert.equal(L.druckLegal(['PAF-80', 'SVP-124'], fenster, false), false);
        assert.equal(L.druckLegal(['OBF-125', 'MEW-6', 'SVP-56'], fenster, false), false);
        assert.equal(L.druckLegal(['SVI-81', 'SVP-28'], fenster, false), false);
        assert.equal(L.druckLegal(['SVP-290'], fenster, false), null);
        assert.equal(L.druckLegal(['SVP-149'], fenster, true), true);
        assert.equal(L.druckLegal(['PBL-12', 'SVP-1'], fenster, false), true);
        assert.equal(L.druckLegal(['LOR-81'], fenster, true), false);
        assert.equal(L.druckLegal(['PBL-12'], null, true), null);
    });

    it('Chips: nach Stufe, Varianten unter ihrer Familienbox', () => {
        const fam = box('f', '__familie__|Dragapult', [{ id: 'TWM-130', typ: P, anteil: 100, formate: { 'TEF-30C': 100 } }]);
        const reihe = L.chipReihe([raus, unbekannt, legal, gespielt, fam], kontext,
            (a) => (a === 'Dragapult Dusknoir' ? 'Dragapult' : undefined));
        gleich(reihe.map((r) => [r.box.id, r.stufe, r.rang]), [
            ['f', 'gespielt', 'kopf'], ['g', 'gespielt', 'mitglied'],
            ['l', 'legal', 'kopf'], ['r', 'raus', 'kopf'], ['u', null, 'kopf']]);
        // Ohne Familienkenntnis steht jede Box fuer sich.
        assert.ok(L.chipReihe([gespielt, fam], kontext, () => undefined).every((r) => r.rang === 'kopf'));
    });

    it('die Hauptkarte entscheidet, nicht ihre Mitspieler (live gemessen 30.09.2026)', () => {
        const fenster2 = new Set(['TEF', 'SSP', 'PBL', '30C', 'SVP', 'SVE']);
        const k2 = { aktuell: 'TEF-30C', legalBekannt: true,
            legal: (k) => L.druckLegal([k.id].concat(k.refs || []), fenster2, L.anteilIn(k, 'TEF-30C') > 0) };
        const archaludon = box('a', '__familie__|Archaludon', [
            { id: 'SSP-130', name: 'Archaludon ex', typ: P, anteil: 100, formate: { 'TEF-PBL': 100 } },
            { id: 'ASR-46', name: 'Radiant Greninja', typ: P, anteil: 79, formate: { 'SVI-PFL': 79 } },
            { id: 'PAR-56', name: 'Iron Bundle', typ: P, anteil: 66, formate: { 'SVI-PFL': 66 } }]);
        const gardevoir = box('v', '__familie__|Gardevoir', [
            { id: 'PAF-29', name: 'Gardevoir ex', typ: P, anteil: 100, formate: { 'SVI-PFL': 100 } },
            { id: '30C-9', name: 'Gardevoir', typ: P, anteil: 3 }]);
        const palkia = box('p', 'Palkia Noctowl', [{ id: 'ASR-39', name: 'Origin Forme Palkia V', typ: P, anteil: 100 }]);
        gleich(L.hauptkartenDerBox(archaludon).map((k) => k.id), ['SSP-130']);
        assert.equal(L.boxStufe(archaludon, k2), 'legal');
        assert.equal(L.boxStufe(gardevoir, k2), 'raus', 'ein seltener legaler Namensvetter rettet die Box nicht');
        gleich(L.hauptkartenDerBox(palkia).map((k) => k.id), ['ASR-39']);
        const s6 = 'const haupt = hauptkartenDerBox(box);';
        assert.ok(QUELLE.includes(s6));
        assert.equal(logik(QUELLE.replace(s6, 'const haupt = [];')).boxStufe(archaludon, k2), 'raus', 'Probe Hauptkarte beisst nicht');
    });

    it('Verfaelschungsproben und Verdrahtung', () => {
        const s1 = "if (PAUSCHAL_LEGAL[set]) { pauschal = true; return false; }";
        assert.ok(QUELLE.includes(s1));
        const M1 = logik(QUELLE.replace(s1, ''));
        assert.equal(M1.druckLegal(['PAF-80', 'SVP-124'], fenster, false), true, 'Probe Promo pauschal beisst nicht');
        const s7 = 'return setDruck ? false : null;';
        assert.ok(QUELLE.includes(s7));
        assert.equal(logik(QUELLE.replace(s7, 'return null;')).druckLegal(['SVI-81', 'SVP-28'], fenster, false), null,
            'Probe Promo-Nachdruck beisst nicht');
        const s2 = "if (imFormatGespielt(box, c.aktuell)) return 'gespielt';";
        assert.ok(QUELLE.includes(s2));
        assert.notEqual(logik(QUELLE.replace(s2, '')).boxStufe(gespielt, kontext), 'gespielt', 'Probe gespielt beisst nicht');
        const s3 = "if (l === false) return 'raus';";
        assert.ok(QUELLE.includes(s3));
        assert.notEqual(logik(QUELLE.replace(s3, '')).boxStufe(raus, kontext), 'raus', 'Probe raus beisst nicht');
        const s5 = "return !k.manuell && k.typ === 'Pokemon' && Number(k.anteil) >= KERN_SCHWELLE;";
        assert.ok(QUELLE.includes(s5));
        assert.equal(logik(QUELLE.replace(s5, 'return !k.manuell && Number(k.anteil) >= KERN_SCHWELLE;')).boxStufe(legal, kontext),
            'raus', 'Probe Trainer als Kern beisst nicht');
        const s4 = ".sort(function (x, y) { return rang(x.b) - rang(y.b) || x.i - y.i; })";
        assert.ok(QUELLE.includes(s4));
        const M4 = logik(QUELLE.replace(s4, ''));
        assert.equal(M4.chipReihe([raus, gespielt], kontext, null)[0].box.id, 'r', 'Probe Sortierung beisst nicht');
        const code = ohneKommentare(QUELLE);
        assert.match(code, /const reihe = chipReihe\(boxen, kontext, familieVonArchetyp\)/);
        assert.match(code, /druckLegal\(ids\(k\), jetzt, anteilIn\(k, reihe\[0\] && reihe\[0\]\.key\) > 0\)/);
        const i18n = R('js/i18n.js');
        for (const k of ['abx.stufe.gespielt', 'abx.stufe.legal', 'abx.stufe.raus']) {
            assert.equal(i18n.split("'" + k + "':").length - 1, 2, k + ' in beiden Sprachen');
        }
    });
});
