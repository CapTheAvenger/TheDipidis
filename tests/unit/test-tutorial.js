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
            assert.ok(txt.length > 100000,
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
