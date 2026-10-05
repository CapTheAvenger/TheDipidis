/**
 * Die nachgeladene Anleitung.
 *
 * Sie stand bis zum 18.08.2026 inline in index.html — 543.271 Zeichen,
 * beide Sprachfassungen gleichzeitig, 64,8 % des Dokuments. Jeder
 * Besucher lud sie, der Parser baute sie, das Layout vermass sie, und
 * eine der beiden war per `display:none !important` ohnehin unsichtbar.
 *
 * Diese Tests halten die vier Stellen fest, an denen so eine Auslagerung
 * still kaputtgeht:
 *
 *   1. Der Deploy baut _site aus einer Positivliste. Fehlt `tutorial/`
 *      darin, liegt die Datei im Repo und nicht auf der Seite — der Tab
 *      zeigt dann seinen Fehlerzustand, und zwar nur in Produktion.
 *   2. Die Bildsonde lief einmalig beim Seitenstart. Zu dem Zeitpunkt
 *      gibt es keinen einzigen Slot mehr.
 *   3. Der Sprachwechsel verschickt sein Ereignis auf `document` und
 *      ohne `bubbles` — ein Listener auf `window` loest nie aus.
 *   4. Ein fehlgeschlagener Abruf darf nicht in einem leeren Kasten
 *      enden.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const R = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const HTML = R('index.html');
const LOADER = R('js/ds-tutorial.js');
const INIT = R('js/app-init.js');
const NAV = R('js/ds-nav.js');
const I18N = R('js/i18n.js');
const DEPLOY = R('.github/workflows/deploy-pages.yml');
const STYLES = R('css/styles.css');

describe('Anleitung: ausgelagert', () => {
    it('index.html traegt die Anleitung nicht mehr', () => {
        // Der Hero-Titel stand im inline-Tutorial und steht jetzt nur
        // noch im Fragment.
        assert.ok(!HTML.includes('tutorial-hero-eyebrow'),
            'Der Tutorial-Hero ist wieder in index.html gelandet.');
        assert.ok(!HTML.includes('<div class="lang-en">'),
            'Die Marketing-Sprachbloecke sind wieder in index.html.');
    });

    it('index.html ist unter 400.000 Zeichen', () => {
        // Vor der Auslagerung: 838.814. Die Schwelle ist grosszuegig
        // gesetzt und soll nur den Rueckfall fangen, nicht das Wachstum
        // regulieren.
        assert.ok(HTML.length < 400000,
            `index.html hat ${HTML.length.toLocaleString('de-DE')} Zeichen. `
            + 'Vor der Auslagerung waren es 838.814 — wenn die Zahl wieder dort steht, '
            + 'ist die Anleitung zurueck im Dokument.');
    });

    it('beide Fragmente liegen da und tragen ihren Hero', () => {
        for (const lg of ['de', 'en']) {
            const p = path.join(ROOT, 'tutorial', `tutorial.${lg}.html`);
            assert.ok(fs.existsSync(p), `tutorial/tutorial.${lg}.html fehlt`);
            const txt = fs.readFileSync(p, 'utf8');
            assert.match(txt, /tutorial-hero-eyebrow/,
                `tutorial.${lg}.html hat keinen Hero — vermutlich beim Schneiden verloren`);
            // UI-78 (03.10.2026): die Anleitung ist jetzt „Erste Schritte +
            // Glossar" — kurz, aber nicht leer.
            assert.ok(txt.length > 5000,
                `tutorial.${lg}.html ist nur ${txt.length} Zeichen gross`);
            // Kommentare zaehlen nicht mit: der Kopf der Datei erklaert
            // gerade, dass sie KEIN <html>/<head>/<body> hat.
            const code = txt.replace(/<!--[\s\S]*?-->/g, '');
            assert.ok(!/<html[\s>]|<head[\s>]|<body[\s>]/i.test(code),
                `tutorial.${lg}.html ist ein ganzes Dokument geworden — erwartet wird ein Fragment`);
        }
    });

    it('die Huelle steht in index.html', () => {
        assert.match(HTML, /id="tutorialHost"/);
        assert.match(HTML, /<script src="js\/ds-tutorial\.js/);
        assert.match(HTML, /<noscript>/,
            'Ohne JavaScript gibt es keinen Weg zur Anleitung.');
    });
});

describe('Anleitung: der Deploy nimmt sie mit', () => {
    it('deploy-pages.yml kopiert tutorial/ nach _site', () => {
        // _site wird aus einer Positivliste gebaut. redesign/ steht nicht
        // darin und gibt deshalb 404 — dasselbe waere hier passiert.
        assert.match(DEPLOY, /cp -r tutorial _site\/tutorial/,
            'Ohne diese Zeile liegt die Anleitung im Repo und nicht auf der Seite. '
            + 'Auffallen wuerde es erst in Produktion.');
    });
});

describe('Anleitung: der Loader', () => {
    it('haengt am Tabwechsel, nicht an einem Knopf', () => {
        // Der Tab geht ueber vier Wege auf: Pokéball, Hilfe-Knopf,
        // Hauptnavigation und der Tiefenlink #tutorial / #anleitung.
        assert.match(LOADER, /__dsTutWrapped/);
        assert.match(LOADER, /tabName === 'tutorial'/);
    });

    it('hoert auf document UND window', () => {
        // js/i18n.js verschickt auf document und ohne bubbles.
        assert.match(LOADER, /document\.addEventListener\('languageChanged'/);
        assert.match(I18N, /document\.dispatchEvent\(new CustomEvent\('languageChanged'/,
            'Der Versandort hat sich geaendert — dann muss der Listener nachziehen.');
    });

    it('faengt den ueberholten Abruf ab', () => {
        // Zwei Sprachwechsel kurz hintereinander: die aeltere Antwort
        // darf die neuere nicht ueberschreiben.
        assert.match(LOADER, /if \(lang\(\) !== lg\) return false;/);
    });

    it('hat einen benannten Fehlerzustand mit Wiederholen', () => {
        assert.match(LOADER, /ds-tutorial-error/);
        assert.match(LOADER, /ds-tutorial-retry/);
        assert.match(LOADER, /data-state|dataset\.state/);
    });

    it('stempelt die Fragment-URL, damit der Cache nicht kleben bleibt', () => {
        assert.match(LOADER, /tutorial\.' \+ lg \+ '\.html\?v=/,
            'Ohne ?v= serviert der Service Worker nach einer Textaenderung die alte Fassung.');
    });
});

describe('Anleitung: was drumherum mitziehen musste', () => {
    it('die Bildsonde ist aus app-init.js heraus', () => {
        assert.ok(!INIT.includes('.tutorial-screenshot-frame[data-tutorial-img]'),
            'Die Sonde laeuft wieder beim Seitenstart — dort gibt es keine Slots mehr.');
        assert.match(INIT, /hydrateTutorialImages/);
        assert.match(LOADER, /window\.hydrateTutorialImages = hydrateImages/);
    });

    it('die Navigation hoert jetzt auf document', () => {
        // Sie stand auf window und hat deshalb nie ausgeloest: die Leiste
        // blieb nach dem Sprachwechsel auf der alten Sprache stehen.
        assert.match(NAV, /document\.addEventListener\('languageChanged'/,
            'js/ds-nav.js hoert wieder nur auf window — dort kommt das Ereignis nie an.');
    });

    it('die drei !important fuer die Sprachbloecke sind weg', () => {
        assert.ok(!/\.lang-en \{ display: none !important/.test(STYLES));
        assert.ok(!/\.lang-de \{ display: none !important/.test(STYLES));
    });
});

describe('Sprache: die Seite startet deutsch', () => {
    it('ohne gespeicherte Wahl entscheidet die Browsersprache, sonst Deutsch', () => {
        assert.ok(!/const I18N_DEFAULT_LANG = 'en'/.test(I18N),
            "I18N_DEFAULT_LANG steht wieder hart auf 'en' — auf einer deutschsprachigen Seite.");
        assert.match(I18N, /function i18nPreferredLang\(\)/);
        assert.match(I18N, /return 'de';/);
    });

    it('der Rueckfall fuer fehlende Schluessel bleibt getrennt davon', () => {
        assert.match(I18N, /const I18N_FALLBACK_LANG = 'en'/);
        assert.match(I18N, /const fallback = translations\[I18N_FALLBACK_LANG\]/);
    });

    it('der Umschalter beschriftet sein Ziel, nicht seinen Zustand', () => {
        assert.match(I18N, /const target = currentLang === 'de' \? 'en' : 'de'/);
        assert.match(I18N, /toggle\.textContent = target\.toUpperCase\(\)/);
        assert.match(I18N, /'header\.switchLanguageTitle':'Switch to German'/);
        assert.match(I18N, /'header\.switchLanguageTitle':'Auf Englisch umschalten'/);
    });

    it('der Untertitel behauptet keine Version mehr', () => {
        // Untertitel sagte "v46 (Mai 2026)", der Hero zwei Zeilen weiter
        // "v47 · Juni 2026" — im selben Bildausschnitt.
        assert.ok(!/v46/.test(I18N), 'Die v46-Angabe ist zurueck.');
        assert.ok(!/v46/.test(HTML), 'Die v46-Angabe ist zurueck in index.html.');
    });
});

/* ══ Erste Schritte + Glossar (UI-78, 03.10.2026) ══════════════════

   Entscheidung Hausi 03.10.2026: die lange Anleitung (325.716 Zeichen,
   Kopf „v48 · August 2026", 31-mal „Cooking", ohne Archetyp-Box,
   Masterclass, Posts) faellt weg. An ihre Stelle tritt eine Seite
   „Erste Schritte" und ein Glossar aller Begriffe aus der
   Tiefenanalyse (N-04), erreichbar per antippbarem ⓘ (data-glossar).

   Die Zusicherungen der alten Kurzfassung (04.09.2026) gelten weiter
   fuer den Einstieg: kein Bild, keine veraltende Datenzahl, die Quellen
   werden genannt. Die Kapitel-Zusicherungen (Champions, Team-Builder,
   Rechner, Bilder) entfallen mit der Langfassung. */

const behaupte2 = require('node:assert/strict');
const vm2 = require('node:vm');

const DE2 = R('tutorial/tutorial.de.html');
const EN2 = R('tutorial/tutorial.en.html');

/* Die Begriffe aus der Begriffstabelle der Tiefenanalyse (N-04) plus
   die Bereiche, die in der alten Anleitung fehlten. */
const BEGRIFFE = ['meta', 'archetyp', 'variante', 'format', 'rotation', 'standard',
    'online-major', 'anteil', 'win-rate', 'matchup', 'top-8', 'day2', 'tier', 'bilanz',
    'turniertypen', 'city-league', 'ace-spec', 'tech', 'proxy', 'ptcgl', 'irl', 'set-code',
    'journal', 'meta-call', 'archetyp-box', 'masterclass', 'champions',
    // UI-115 (05.10.2026): Glossar ergaenzt
    'consistency', 'binder', 'spielbox', 'regulation-mark', 'side-quest'];

const ids = (q) => [...q.matchAll(/\bid="(glossar-[a-z0-9-]+)"/g)].map(m => m[1]);
const einstieg = (q) => q.slice(q.indexOf('<section class="tutorial-hero">'), q.indexOf('id="glossar"'));

describe('Anleitung: Erste Schritte + Glossar', () => {
    for (const [name, q, kopf] of [['deutsch', DE2, 'Erste Schritte'], ['englisch', EN2, 'Getting started']]) {
        it(`${name}: beginnt mit „${kopf}" und ist kurz`, () => {
            behaupte2.match(q, new RegExp(`tutorial-hero-eyebrow">${kopf}<`));
            behaupte2.ok(q.length < 40000, `${q.length} Zeichen — die Kurzfassung waechst wieder zur Langfassung`);
        });
        it(`${name}: der Einstieg traegt kein Bild und keine veraltende Datenzahl`, () => {
            const block = einstieg(q);
            behaupte2.ok(block.length > 500, 'Einstieg nicht gefunden');
            behaupte2.ok(!/data-tutorial-img|<img/.test(block), 'Bild im Einstieg');
            const text = block.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ');
            const zahlen = text.match(/\d[\d.,]*\s*%|\d{1,3}[.,]\d{3}\b|\b\d{4,}\b/g) || [];
            behaupte2.deepEqual(zahlen, [], 'feste Zahlen im Einstieg veralten still');
        });
        it(`${name}: der Einstieg nennt, woher die Zahlen kommen`, () => {
            const block = einstieg(q);
            for (const quelle of ['Limitless', 'City League', 'Cardmarket']) {
                behaupte2.ok(block.includes(quelle), `${quelle} fehlt im Einstieg`);
            }
        });
        it(`${name}: jeder Begriff hat einen Glossareintrag mit Erklaerung`, () => {
            const da = ids(q);
            const fehlt = BEGRIFFE.filter(b => !da.includes('glossar-' + b));
            behaupte2.deepEqual(fehlt, [], 'ohne Eintrag: ' + fehlt.join(', '));
            for (const b of BEGRIFFE) {
                const m = q.match(new RegExp(`id="glossar-${b}">[^<]+</dt>\\s*<dd>([\\s\\S]*?)</dd>`));
                behaupte2.ok(m && m[1].replace(/<[^>]+>/g, '').trim().length > 30, `glossar-${b}: keine Erklaerung`);
            }
        });
        it(`${name}: jeder Verweis data-glossar zeigt auf einen Eintrag`, () => {
            const da = new Set(ids(q));
            const ziele = [...q.matchAll(/data-glossar="([a-z0-9-]+)"/g)].map(m => m[1]);
            behaupte2.ok(ziele.length >= 5, 'kaum Verweise');
            for (const z of ziele) behaupte2.ok(da.has('glossar-' + z), `Verweis ins Leere: ${z}`);
        });
    }

    it('beide Sprachen fuehren dieselben Eintraege', () => {
        behaupte2.deepEqual(ids(DE2).sort(), ids(EN2).sort());
    });

    it('die ⓘ-Knoepfe der Seite zeigen auf vorhandene Eintraege', () => {
        const da = new Set(ids(DE2));
        const knoepfe = [...HTML.matchAll(/class="glossar-i" data-glossar="([a-z0-9-]+)"/g)].map(m => m[1]);
        behaupte2.ok(knoepfe.length >= 4, `nur ${knoepfe.length} ⓘ-Knoepfe`);
        for (const k of knoepfe) behaupte2.ok(da.has('glossar-' + k), `ⓘ ins Leere: ${k}`);
    });

    it('die deutsche Fassung sagt nie „Feld", „Cooking" oder eine alte Version', () => {
        const text = DE2.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ');
        behaupte2.doesNotMatch(text, /\bFeld/);
        behaupte2.doesNotMatch(text, /Cooking/);
        behaupte2.doesNotMatch(text, /\bv\d{2}\b/i);
    });
});

/* AUSGEFUEHRT: glossarOeffnen laedt die Anleitung, sucht den Eintrag
   und scrollt hin — ohne den Hash zu setzen (die Adresszeile steuert
   die Reiter). Die Funktion laeuft im echten Loader mit einer kleinen
   Attrappe von document. */
describe('Anleitung: glossarOeffnen springt zum Eintrag', () => {
    function sandkasten() {
        const gescrollt = [];
        const host = { dataset: { state: 'idle' }, _html: '', querySelectorAll: () => [], set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; } };
        const elemente = {};
        const document = {
            readyState: 'complete',
            addEventListener() {},
            getElementById(id) {
                if (id === 'tutorialHost') return host;
                if (!host._html.includes(`id="${id}"`)) return null;
                return elemente[id] || (elemente[id] = { id, classList: { add() {}, remove() {} }, scrollIntoView() { gescrollt.push(id); } });
            },
            querySelector() { return null; },
            querySelectorAll() { return []; },
        };
        const reiter = [];
        const ctx = {
            document, console, setTimeout: () => 0,
            fetch: async () => ({ ok: true, text: async () => DE2 }),
            location: { hash: '#current-meta' },
        };
        ctx.window = ctx;
        ctx.getLang = () => 'de';
        ctx.switchTabAndUpdateMenu = (t) => reiter.push(t);
        ctx.addEventListener = () => {};
        vm2.createContext(ctx);
        vm2.runInContext(LOADER, ctx, { filename: 'ds-tutorial.js' });
        return { ctx, gescrollt, reiter };
    }

    it('oeffnet die Anleitung und scrollt zum Begriff', async () => {
        const s = sandkasten();
        const r = await s.ctx.glossarOeffnen('win-rate');
        behaupte2.equal(r, 'glossar-win-rate');
        behaupte2.deepEqual(s.reiter, ['tutorial']);
        behaupte2.deepEqual(s.gescrollt, ['glossar-win-rate']);
        behaupte2.equal(s.ctx.location.hash, '#current-meta', 'der Hash darf sich nicht aendern');
    });

    it('unbekannter Begriff: springt an den Anfang des Glossars statt ins Leere', async () => {
        const s = sandkasten();
        behaupte2.equal(await s.ctx.glossarOeffnen('gibtsnicht'), 'glossar');
    });
});
