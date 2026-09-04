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

/* ══ Die drei fehlenden Kapitel (03.09.2026) ═══════════════════

   BEFUND: die Anleitung nannte "Champions" null Mal, "Team-Builder"
   null Mal, "Rechner" null Mal — und enthielt insgesamt NULL Bilder.
   Die drei groessten Bereiche, die seit August dazugekommen sind,
   standen nirgends drin, und der Bildmechanismus
   (js/ds-tutorial.js, data-tutorial-img) war gebaut, aber unbenutzt.

   Geprueft wird hier nicht, dass die Woerter irgendwo vorkommen —
   das waere mit einem Satz im Fliesstext erfuellt —, sondern dass
   jedes Kapitel eine eigene Ueberschrift UND ein eigenes Bild hat,
   und dass die Bilddateien wirklich auf der Platte liegen. */

const { describe: beschreibe2, it: es2 } = require('node:test');
const behaupte2 = require('node:assert');
const fs2 = require('node:fs');
const pfad2 = require('node:path');

const WURZEL2 = pfad2.join(__dirname, '..', '..');
const DE2 = fs2.readFileSync(pfad2.join(WURZEL2, 'tutorial', 'tutorial.de.html'), 'utf8');
const EN2 = fs2.readFileSync(pfad2.join(WURZEL2, 'tutorial', 'tutorial.en.html'), 'utf8');

beschreibe2('Die Anleitung deckt Champions, Team-Builder, Rechner und Startseite ab', () => {

    const KAPITEL = [
        ['Champions · Teams',   /Replica-Code/,        /replica code/i],
        ['Champions · Nutzung', /In-Game-Analyse/,     /in-game analysis/i],
        ['Team-Builder',        /Team setzen/,         /Set team/i],
        ['Team-Rechner',        /K\.-o\.-Zahl/,        /hits to KO/i],
        ['Startseite',          /Ansicht zurücksetzen/, /Reset view/i],
    ];

    for (const [name, reDe, reEn] of KAPITEL) {
        es2(`${name}: steht in der deutschen Fassung`, () => {
            behaupte2.ok(reDe.test(DE2),
                `Das Kapitel "${name}" fehlt in tutorial.de.html`);
        });
        es2(`${name}: steht in der englischen Fassung`, () => {
            behaupte2.ok(reEn.test(EN2),
                `Das Kapitel "${name}" fehlt in tutorial.en.html`);
        });
    }

    es2('jede Fassung bindet ihre eigenen Bilder ein', () => {
        // Die deutsche Anleitung mit englischen Screenshots waere
        // schlechter als gar keine: der Leser sucht Knoepfe, die auf
        // dem Bild anders heissen.
        const deBilder = [...DE2.matchAll(/data-tutorial-img="([^"]+)"/g)].map(m => m[1]);
        const enBilder = [...EN2.matchAll(/data-tutorial-img="([^"]+)"/g)].map(m => m[1]);
        behaupte2.ok(deBilder.length >= 5,
            `nur ${deBilder.length} Bilder in der deutschen Anleitung`);
        behaupte2.ok(enBilder.length >= 5,
            `nur ${enBilder.length} Bilder in der englischen Anleitung`);
        for (const b of deBilder) {
            behaupte2.ok(b.startsWith('images/tutorials/de/'),
                `die deutsche Anleitung bindet ein nicht-deutsches Bild ein: ${b}`);
        }
        for (const b of enBilder) {
            behaupte2.ok(!b.startsWith('images/tutorials/de/'),
                `die englische Anleitung bindet ein deutsches Bild ein: ${b}`);
        }
    });

    es2('jedes eingebundene Bild liegt auch auf der Platte', () => {
        // Der Rueckfall von ds-tutorial.js ist ein Farbverlauf mit
        // Beschriftung — sichtbar kaputt genug, dass es niemandem
        // auffaellt, und genau deshalb wird es hier gezaehlt.
        const alle = [...DE2.matchAll(/data-tutorial-img="([^"]+)"/g),
                      ...EN2.matchAll(/data-tutorial-img="([^"]+)"/g)].map(m => m[1]);
        const fehlend = alle.filter(b => !fs2.existsSync(pfad2.join(WURZEL2, b)));
        behaupte2.deepStrictEqual(fehlend, [],
            'diese Bilder sind eingebunden, liegen aber nicht im Repo: ' + fehlend.join(', '));
    });

    es2('die Querformat-Aufnahmen bekommen auch einen Querformat-Rahmen', () => {
        // 1280x720 in einem 9:16-Rahmen schrumpft auf ein Drittel der
        // Hoehe; die Schrift ist dann nicht mehr zu lesen.
        const css = fs2.readFileSync(pfad2.join(WURZEL2, 'css', 'city-league.css'), 'utf8');
        behaupte2.ok(/\.tutorial-screenshot-frame--breit\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*9/.test(css),
            'die Klasse tutorial-screenshot-frame--breit fehlt oder ist nicht 16/9');
        for (const [name, quelle] of [['de', DE2], ['en', EN2]]) {
            const rahmen = [...quelle.matchAll(/tutorial-screenshot-frame([^"]*)"[\s\S]{0,120}?data-tutorial-img/g)];
            behaupte2.ok(rahmen.length >= 5, `${name}: nur ${rahmen.length} Rahmen`);
            for (const r of rahmen) {
                behaupte2.ok(r[1].includes('--breit'),
                    `${name}: ein Bildrahmen ohne --breit — die Querformat-Aufnahme `
                    + 'wird darin unlesbar klein');
            }
        }
    });
});

/* ══════════════════════════════════════════════════════════════════════
 * DIE KURZFASSUNG AM ANFANG (04.09.2026)
 * ══════════════════════════════════════════════════════════════════════
 *
 * Aufgabe #121 nannte zwei Teile: die Langfassung bebildern (erledigt in
 * PR #652) und "eine Kurzfassung als Einstieg". Der zweite Teil hing
 * bisher an Aufgabe #120, weil er "dieselben Kacheln wie Instagram"
 * verwenden sollte. Auf Nachfrage am 04.09.2026: "was halt sinnvoll ist
 * um den Leuten die Seite gut zu erklären und schmackhaft zu machen" —
 * die Bindung an die Kacheln war damit gelöst.
 *
 * Gebaut wurde eine Textkurzfassung ganz oben, aus drei Gründen, die
 * hier als Zusicherungen stehen, damit sie nicht stillschweigend
 * rückgängig gemacht werden:
 *
 *   1. Sie steht VOR der Langfassung. Ein Einstieg hinter 3.200 Zeilen
 *      ist kein Einstieg.
 *   2. Sie trägt KEIN Bild. Bilder machen einen Einstieg länger, nicht
 *      kürzer; die Aufnahmen stehen unten bei ihren Kapiteln.
 *   3. Sie trägt KEINE Datenzahl. Eine Zahl in einem festen
 *      HTML-Fragment veraltet still — und diese Seite hat sich gerade
 *      erst von Zahlen ohne Nenner freigearbeitet.
 */

const behaupte3 = require('node:assert');
const fs3 = require('node:fs');
const pfad3 = require('node:path');

const WURZEL3 = pfad3.join(__dirname, '..', '..');
const DE3 = fs3.readFileSync(pfad3.join(WURZEL3, 'tutorial', 'tutorial.de.html'), 'utf8');
const EN3 = fs3.readFileSync(pfad3.join(WURZEL3, 'tutorial', 'tutorial.en.html'), 'utf8');

/* Der Block: vom Trenner bis zum Ende seines <article>. */
function kurzfassung(quelle, trenner) {
    const i = quelle.indexOf(`<div class="feature-section-divider">${trenner}</div>`);
    if (i < 0) return null;
    const ende = quelle.indexOf('</article>', i);
    return ende < 0 ? null : quelle.slice(i, ende);
}

const FASSUNGEN = [
    ['deutsch',  DE3, 'Worum es hier geht', 'Erste Schritte',
     /Kostenlos, ohne Anmeldung/],
    ['englisch', EN3, 'What this is',       'Get Started',
     /Free, no sign-up needed/],
];

beschreibe2('Die Anleitung hat eine Kurzfassung als Einstieg', () => {

    for (const [name, quelle, trenner, langTrenner, kern] of FASSUNGEN) {

        es2(`${name}: die Kurzfassung steht da`, () => {
            const block = kurzfassung(quelle, trenner);
            behaupte2.ok(block,
                `der Abschnitt "${trenner}" fehlt — die Anleitung beginnt `
                + 'wieder mit der Langfassung');
            behaupte2.match(block, kern,
                'die Kurzfassung sagt nicht mehr, dass die Seite kostenlos '
                + 'und ohne Anmeldung nutzbar ist — das ist der Satz, der '
                + 'jemanden zum Weiterlesen bringt');
        });

        es2(`${name}: sie steht VOR der Langfassung`, () => {
            const kurz = quelle.indexOf(`>${trenner}</div>`);
            const lang = quelle.indexOf(`>${langTrenner}</div>`);
            behaupte2.ok(kurz > 0 && lang > 0, 'einer der beiden Trenner fehlt');
            behaupte2.ok(kurz < lang,
                `die Kurzfassung steht hinter "${langTrenner}". Ein Einstieg `
                + 'hinter dreitausend Zeilen ist kein Einstieg');
        });

        es2(`${name}: sie trägt kein Bild`, () => {
            const block = kurzfassung(quelle, trenner);
            behaupte2.ok(!/data-tutorial-img|<img/.test(block),
                'in der Kurzfassung steht ein Bild. Bilder machen einen '
                + 'Einstieg länger, nicht kürzer — die Aufnahmen gehören '
                + 'zu den Kapiteln unten');
        });

        es2(`${name}: sie trägt keine Datenzahl, die veralten kann`, () => {
            const block = kurzfassung(quelle, trenner);
            const text = block.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ');
            const zahlen = text.match(/\d[\d.,]*\s*%|\d{1,3}[.,]\d{3}\b|\b\d{4,}\b/g) || [];
            behaupte2.deepStrictEqual(zahlen, [],
                `in der Kurzfassung stehen Zahlen: ${zahlen.join(', ')}. Ein `
                + 'fester Wert in einem statischen Fragment veraltet still — '
                + 'und diese Seite hat sich gerade erst von Zahlen ohne '
                + 'Nenner freigearbeitet');
        });

        es2(`${name}: sie nennt, woher die Zahlen kommen`, () => {
            const block = kurzfassung(quelle, trenner);
            for (const quellName of ['Limitless', 'City League', 'Cardmarket']) {
                behaupte2.ok(block.includes(quellName),
                    `die Kurzfassung nennt ${quellName} nicht mehr. Wer neu `
                    + 'hier ist, will zuerst wissen, woher die Zahlen kommen');
            }
        });
    }

    es2('sie kollidiert nicht mit den "ersten 60 Sekunden" weiter unten', () => {
        /* Beide Abschnitte hießen im ersten Entwurf fast gleich. Der eine
           sagt, worum es geht; der andere gibt drei Schritte zum
           Mitmachen. Zwei Namen, die sich nur in einem Wort
           unterscheiden, sind einer zu viel. */
        // Den TRENNER prüfen, nicht den Namen irgendwo im Text: der
        // Kommentar der Kurzfassung nennt ihn selbst, und damit wäre die
        // Zusicherung auch dann grün, wenn der Abschnitt weg ist.
        behaupte2.ok(DE3.includes('<div class="feature-section-divider">Die ersten 60 Sekunden</div>'),
            'der Schnellstart-Abschnitt ist verschwunden');
        behaupte2.ok(!DE3.includes('>In 60 Sekunden<'),
            'die Kurzfassung heißt wieder fast wie der Schnellstart darunter');
        behaupte2.ok(EN3.includes('<div class="feature-section-divider">First 60 seconds</div>'),
            'the quick-start section is gone');
        behaupte2.ok(!EN3.includes('>In 60 seconds<'),
            'the short version is named almost like the quick start below it again');
    });
});
