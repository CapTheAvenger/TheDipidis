/**
 * Custom Binder: gespeicherte Ordner, Abgleich, Sortierung.
 *
 * Diese Tests sichern die Entscheidungen ab, die beim Review gefallen sind,
 * und zwei Fehler, die vorher niemand gefangen haette:
 *
 *  1. compareMetaBinderEntries las metaBinderAllPrints — die Umschaltung des
 *     META Binders. Der Custom Binder ruft dieselbe Funktion, also hat ein
 *     Klick auf "Alle Drucke" im einen Tab die Sortierung des anderen
 *     umgestellt. Gemessen: 108 von 121 Positionen aendern sich.
 *  2. Der Vergleichspunkt fuer "was ist neu" lag in EINEM globalen
 *     localStorage-Schluessel fuer ALLE Ordner. Mit zwei gespeicherten Ordnern
 *     ueberschreiben sie sich gegenseitig, und ein Wechsel meldet den halben
 *     anderen Ordner als neu.
 *
 * Und eine Regel, die dieses Projekt teuer gelernt hat: ein Schnappschuss mit
 * 533 Karten wiegt 157 KB. Er darf nicht auf das Wurzeldokument users/{uid},
 * wo bereits Sammlung, Wunschliste und Tauschliste unter EINEM 1-MiB-Limit
 * liegen. Der Schreibfehler faellt dort still aus.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const CB = fs.readFileSync(path.join(ROOT, 'js', 'custom-binder.js'), 'utf8');
const MB = fs.readFileSync(path.join(ROOT, 'js', 'meta-binder.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const I18N = fs.readFileSync(path.join(ROOT, 'js', 'i18n.js'), 'utf8');
const CSS = fs.readdirSync(path.join(ROOT, 'css'))
    .filter(f => f.endsWith('.css'))
    .map(f => fs.readFileSync(path.join(ROOT, 'css', f), 'utf8'))
    .join('\n');

const ohneKommentar = s => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, '$1');

describe('Custom Binder: die Obergrenze von 30 Archetypen ist weg', () => {
    it('kein Code prueft mehr auf 30 ausgewaehlte Archetypen', () => {
        const code = ohneKommentar(CB);
        assert.ok(!/cbSelectedArchetypes\.length\s*>=\s*30/.test(code),
            'es gibt noch eine Obergrenze von 30');
    });

    it('der Hinweistext verspricht keine 20 mehr', () => {
        assert.ok(!/Pick 1-20 archetypes/.test(HTML),
            'index.html nennt noch "Pick 1-20 archetypes"');
    });
});

describe('Custom Binder: die Sortierung eines Tabs faerbt nicht auf den anderen ab', () => {
    it('compareMetaBinderEntries nimmt den Ansichtsmodus als Argument', () => {
        assert.match(MB, /function compareMetaBinderEntries\(a, b, alleDrucke\)/,
            'compareMetaBinderEntries hat keinen Parameter fuer den Ansichtsmodus');
    });

    it('der Vergleicher liest die Modulvariable nicht mehr direkt', () => {
        const start = MB.indexOf('function compareMetaBinderEntries');
        const body = MB.slice(start, MB.indexOf('\n    function ', start + 10));
        assert.ok(!/if \(!metaBinderAllPrints\)/.test(body),
            'der Vergleicher liest weiterhin metaBinderAllPrints');
    });

    it('beide Aufrufer reichen ihren EIGENEN Zustand durch', () => {
        assert.match(CB, /sortMetaCards\([^)]*,\s*cbAllPrints\)/,
            'der Custom Binder uebergibt seinen Zustand nicht');
        assert.match(MB, /sortMetaCards\(\[\.\.\.filtered\], metaBinderAllPrints\)/,
            'der Meta Binder uebergibt seinen Zustand nicht');
    });
});

describe('Custom Binder: gespeicherte Ordner liegen in der Untersammlung', () => {
    it('der Pfad ist users/{uid}/customBinders, nicht das Wurzeldokument', () => {
        const code = ohneKommentar(CB);
        assert.match(code, /collection\('users'\)\.doc\(u\.uid\)\.collection\('customBinders'\)/,
            'die Ordner liegen nicht in einer eigenen Untersammlung');
    });

    it('es wird nie ein Ordner auf das Wurzeldokument geschrieben', () => {
        const code = ohneKommentar(CB);
        // .doc(uid).set / .update ohne nachfolgendes .collection(...) waere
        // ein Schreibzugriff auf das geteilte Wurzeldokument.
        const treffer = code.match(/\.collection\('users'\)\.doc\([^)]*\)\.(set|update)\(/g) || [];
        assert.deepEqual(treffer, [],
            'es wird direkt auf users/{uid} geschrieben: ' + treffer.join(', '));
    });

    it('grosse Schnappschuesse werden vor dem Limit gekuerzt und gemeldet', () => {
        const code = ohneKommentar(CB);
        assert.match(code, /> 700000/, 'keine Groessenschranke vor dem 1-MiB-Limit');
        assert.match(code, /cb\.binderTooBig/, 'die Kuerzung wird nicht gemeldet');
    });

    it('ein fehlgeschlagener Schreibvorgang faellt nicht still aus', () => {
        const start = CB.indexOf('function cbSchreibeBinder');
        const body = CB.slice(start, start + 2000);
        assert.match(body, /\.catch\(/, 'kein Fehlerpfad');
        assert.match(body, /cb\.binderSaveFailed/, 'der Fehler wird dem Nutzer nicht gezeigt');
    });
});

describe('Custom Binder: jeder Ordner hat seinen eigenen Vergleichspunkt', () => {
    it('cbComputeDelta nimmt den Schnappschuss des geladenen Ordners', () => {
        const start = CB.indexOf('async function cbComputeDelta');
        const body = CB.slice(start, start + 2200);
        assert.match(body, /cbAktuellerBinder\(\)/,
            'der geladene Ordner wird nicht beruecksichtigt');
        assert.match(body, /geladen\.snapshot/,
            'der Schnappschuss des Ordners wird nicht als Vergleichspunkt genutzt');
    });

    it('bei abweichender Schwelle wird nicht verglichen', () => {
        const start = CB.indexOf('async function cbComputeDelta');
        const body = CB.slice(start, start + 2200);
        assert.match(body, /gleicheSchwelle/,
            'ein Ordner mit anderer Schwelle wuerde faelschlich verglichen');
    });
});

describe('Custom Binder: der Abgleich trennt drei Stapel', () => {
    it('raus, rein-hast-du und rein-fehlt-dir sind getrennt', () => {
        const start = CB.indexOf('_cbAbgleich = {');
        assert.ok(start > 0, 'der Abgleich baut kein Ergebnisobjekt');
        const literal = CB.slice(start, CB.indexOf('};', start));
        for (const feld of ['raus', 'reinHabe', 'reinFehlt']) {
            assert.match(literal, new RegExp('\\b' + feld + '\\b'), `Stapel ${feld} fehlt`);
        }
        // Und sie muessen sich unterscheiden, sonst ist die Trennung Fassade.
        assert.ok(/reinHabe[\s\S]{0,80}missing === 0/.test(literal), 'reinHabe filtert nicht auf besessen');
        assert.ok(/reinFehlt[\s\S]{0,80}missing > 0/.test(literal), 'reinFehlt filtert nicht auf fehlend');
    });

    it('rein wird nach Besitz getrennt, nicht nach irgendetwas anderem', () => {
        const start = CB.indexOf('async function cbAktualisiereBinder');
        const body = CB.slice(start, start + 2000);
        assert.match(body, /reinHabe:\s*reinAlle\.filter\(c => c\.missing === 0\)/);
        assert.match(body, /reinFehlt:\s*reinAlle\.filter\(c => c\.missing > 0\)/);
    });

    it('ohne Schnappschuss wird nichts als neu gemeldet', () => {
        const start = CB.indexOf('async function cbAktualisiereBinder');
        const body = CB.slice(start, start + 2000);
        assert.match(body, /hatSchnappschuss/,
            'ein nie abgeglichener Ordner wuerde alle Karten als neu melden');
    });

    it('der Fortschritt wird gespeichert, nicht nur im Speicher gehalten', () => {
        const start = CB.indexOf('function cbHakeAb');
        const body = CB.slice(start, start + 600);
        assert.match(body, /cbSchreibeBinder\(b\)/,
            'ein Haken ueberlebt das Weglegen des Telefons nicht');
    });

    it('erst "Fertig" setzt den neuen Vergleichspunkt, nicht schon das Ansehen', () => {
        const ansehen = CB.slice(CB.indexOf('async function cbAktualisiereBinder'),
            CB.indexOf('function cbErledigtSet'));
        assert.ok(!/\.snapshot = cbBaueSchnappschuss/.test(ansehen),
            'schon das Ansehen des Abgleichs zerstoert den Vergleichspunkt');
        const fertig = CB.slice(CB.indexOf('function cbAbgleichFertig'), CB.indexOf('function cbAbgleichKachel'));
        assert.match(fertig, /snapshot = cbBaueSchnappschuss/,
            '"Fertig" schreibt den neuen Stand nicht fest');
    });
});

describe('Custom Binder: Farbe ist nie der einzige Bedeutungstraeger', () => {
    it('der Abgleich nutzt die Datenskala Blau/Rot, nicht Gruen/Rot', () => {
        const start = CB.indexOf('function cbRenderAbgleich');
        const body = CB.slice(start, start + 3000);
        assert.match(body, /--dv-neg/, 'Raus nutzt nicht --dv-neg');
        assert.match(body, /--dv-pos/, 'Rein nutzt nicht --dv-pos');
        assert.ok(!/#1e8449|#27ae60/.test(body),
            'im Abgleich steht ein gruener Festwert — tokens.css verbietet Gruen gegen Rot');
    });

    it('jeder Abschnitt traegt Zeichen UND Wort', () => {
        assert.match(I18N, /'cb\.diffOut':\s*'\\u2796[^']*'/, 'Raus ohne Minuszeichen');
        assert.match(I18N, /'cb\.diffInOwned':\s*'\\u2795[^']*'/, 'Rein ohne Pluszeichen');
    });
});

describe('Custom Binder: Archetypen ohne Kartendaten werden gemeldet', () => {
    it('jeder Eintrag bekommt eine Datenlage', () => {
        assert.match(CB, /function markiereKartendaten/, 'die Datenlage wird nicht ermittelt');
        const start = CB.indexOf('function markiereKartendaten');
        const body = CB.slice(start, start + 1600);
        for (const zustand of ["'exakt'", "'ersatz'", "'keine'"]) {
            assert.ok(body.includes(zustand), `Zustand ${zustand} fehlt`);
        }
    });

    it('ein Ersatztreffer nennt das Deck, dessen Karten gezeigt werden', () => {
        assert.match(CB, /a\.ersatzFuer/,
            'der Nutzer erfaehrt nicht, von welchem Deck die Karten stammen');
        assert.match(CB, /cb\.substituteHint/, 'kein Hinweistext');
    });
});

describe('Custom Binder: Zahlen und Sortierung', () => {
    it('die Seitenzahl wird aus verschiedenen Karten gerechnet, nicht aus Kopien', () => {
        assert.match(CB, /Math\.ceil\(totalUnique \/ 9\)/,
            'die Seitenzahl fehlt oder rechnet mit Kopien statt Faechern');
    });

    it('alle sechs Sortierungen sind erreichbar', () => {
        const start = CB.indexOf('function cbSetSort');
        const body = CB.slice(start, start + 400);
        for (const k of ['binder', 'set', 'typ', 'decks', 'fehlend', 'name']) {
            assert.ok(body.includes(`'${k}'`), `Sortierung ${k} fehlt`);
        }
    });

    it('die Filter stapeln sich, statt einander zu ersetzen', () => {
        const start = CB.indexOf('function cbComputeFilteredCards');
        const body = CB.slice(start, CB.indexOf('function cbRenderGrid'));
        assert.match(body, /minDecks/, 'Deckanzahl-Filter fehlt');
        assert.match(body, /minFehlt/, 'Fehlmengen-Filter fehlt');
        assert.match(body, /suche/, 'Namenssuche fehlt');
        // Sie muessen im selben filter()-Durchlauf liegen wie Typ und Set.
        assert.ok(body.indexOf('minDecks > 0') > body.indexOf('return filtered.filter'),
            'die neuen Filter laufen nicht zusammen mit den bestehenden');
    });
});

describe('Custom Binder: die Verdrahtung haelt', () => {
    it('index.html hat alle neuen Anker', () => {
        for (const id of ['cbBinderBar', 'cbAbgleich', 'cbSaveBinderBtn', 'cbSaveBinderNewBtn', 'cbRefreshBinderBtn']) {
            assert.ok(HTML.includes(`id="${id}"`), `${id} fehlt in index.html`);
        }
    });

    it('jede aus onclick gerufene Funktion ist auch exportiert', () => {
        const gerufen = new Set();
        for (const m of (CB + HTML).matchAll(/onclick="(cb[A-Za-zÄÖÜäöü]+)\(/g)) gerufen.add(m[1]);
        const fehlend = [...gerufen].filter(f => !new RegExp('window\\.' + f + '\\s*=').test(CB));
        assert.deepEqual(fehlend, [], 'nicht exportiert: ' + fehlend.join(', '));
    });

    it('jede neue CSS-Klasse aus dem Abgleich existiert auch', () => {
        const genutzt = new Set();
        for (const m of CB.matchAll(/class="(cb-(?:ab|binder|filter|dd)-[^"{}\s]+)/g)) genutzt.add(m[1]);
        assert.ok(genutzt.size >= 5, 'zu wenige Klassen gefunden — der Scanner greift nicht');
        const fehlend = [...genutzt].filter(k => !new RegExp('\\.' + k + '(?![\\w-])').test(CSS));
        assert.deepEqual(fehlend, [], 'ohne Stil: ' + fehlend.join(', '));
    });

    it('jeder neue Textschluessel steht auf Deutsch UND Englisch', () => {
        const keys = ['cb.saveBinder', 'cb.refresh', 'cb.diffOut', 'cb.diffInOwned',
            'cb.diffInMissing', 'cb.diffDone', 'cb.diffSummary', 'cb.pages',
            'cb.sortLabel', 'cb.noCardData', 'cb.binderMeta', 'cb.deleteConfirm',
            'cb.noBaseline', 'cb.filterName', 'cb.emptyHint'];
        const fehlend = keys.filter(k => (I18N.match(new RegExp("'" + k.replace('.', '\\.') + "':", 'g')) || []).length < 2);
        assert.deepEqual(fehlend, [], 'nur einsprachig: ' + fehlend.join(', '));
    });
});
