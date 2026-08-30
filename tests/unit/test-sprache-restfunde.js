/**
 * Die fuenf Reste aus der Nachpruefung vom 29.08.2026.
 *
 * Sie stammen aus tests/e2e_i18n_language_purity.py, der an diesem Tag
 * zum ersten Mal ueberhaupt lauffaehig gemacht wurde. Von seinen 48
 * Meldungen waren 14 Fehler des Tests selbst (er vergleicht
 * textContent mit Rohtext, der HTML enthaelt); drei waren echt. Dazu
 * kamen zwei Funde aus dem Quelltext.
 *
 * Alle fuenf haben eine gemeinsame Form: die Sprachtabelle war
 * vollstaendig und richtig, aber der Weg auf den Bildschirm fuehrte an
 * ihr vorbei. Deshalb pruefen die Zusagen hier den WEG, nicht die
 * Tabelle.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const HTML = lies('index.html');
const I18N = lies('js/i18n.js');
const CURRENT = lies('js/app-current-meta.js');
const COLLECTION = lies('js/firebase-collection.js');
const TG = lies('js/app-testing-groups.js');

describe('Ein Knopf ohne eigenen Textknoten wird nie uebersetzt', () => {
    it('der Schluessel sitzt auf der Beschriftung, nicht auf dem Knopf', () => {
        // updateTranslationsInDOM ersetzt den ERSTEN eigenen Textknoten.
        // Der Knopf bestand nur aus zwei <span>-Kindern, hatte also
        // keinen — der Zweig "If no text nodes exist, don't insert one"
        // liess ihn stehen. Gemessen im deutschen Modus: "ⓘWhy?".
        assert.ok(!/data-i18n="btn\.buildInfo"[^>]*><span class="build-info-icon"/.test(HTML),
            'der Schluessel sitzt wieder auf dem Knopf statt auf der Beschriftung');
        const n = (HTML.match(/<span class="build-info-label" data-i18n="btn\.buildInfo">/g) || []).length;
        assert.equal(n, 3, `die Beschriftung traegt den Schluessel ${n}x statt 3x`);
    });

    it('der Titel bleibt am Knopf — er gehoert dorthin', () => {
        const n = (HTML.match(/data-i18n-title="btn\.buildInfoTitle"/g) || []).length;
        assert.equal(n, 3, 'der Titel ist vom Knopf verschwunden');
    });
});

describe('Text mit einem Kindelement mittendrin braucht data-i18n-html', () => {
    it('die Tech-Lab-Notiz traegt es', () => {
        // Sie hat ein <code>-Kind mit Text DAVOR und DANACH. Ohne
        // data-i18n-html ersetzt der Renderer nur den ersten Textknoten
        // und laesst den zweiten stehen: gemessen stand im deutschen
        // Modus ein englischer Satzrest hinter dem deutschen Text.
        const i = HTML.indexOf('data-i18n="techLab.dataNote"');
        assert.notEqual(i, -1, 'die Tech-Lab-Notiz ist verschwunden');
        const tag = HTML.slice(HTML.lastIndexOf('<', i), HTML.indexOf('>', i) + 1);
        assert.match(tag, /data-i18n-html/,
            'ohne data-i18n-html bleibt der Text hinter dem <code> in der alten Sprache');
    });

    it('der Wert enthaelt wirklich ein Kindelement — sonst waere das Attribut falsch', () => {
        const m = I18N.match(/'techLab\.dataNote':\s*'((?:\\.|[^'\\])*)'/);
        assert.ok(m, 'techLab.dataNote steht nicht mehr in der Tabelle');
        assert.match(m[1], /<code>/,
            'kein Kindelement mehr im Text — dann gehoert data-i18n-html weg');
    });
});

describe('Die Heatmap zeichnet beim Sprachwechsel neu', () => {
    it('geprueft wird der Heatmap-Behaelter, nicht ein fremdes Modal', () => {
        // Hier stand matchupAnalysisModal — das Modal des Battle
        // Journals, das ein inline display:none traegt. Die Bedingung
        // war damit IMMER falsch: Achsen, Titel und Knoepfe blieben in
        // der alten Sprache stehen.
        // Kommentare duerfen den alten Namen nennen — sie erklaeren ja
        // genau ihn. Geprueft wird der Code. Deshalb wird ZUERST
        // weggeschnitten und ERST DANN das Fenster gelegt: die frueher
        // umgekehrte Reihenfolge mass 1200 Rohzeichen ab, und als der
        // Zuhoerer am 30.08.2026 einen laengeren Kommentar bekam, lagen
        // die Codezeilen ausserhalb des Fensters — die Zusage wurde rot,
        // ohne dass sich am Verhalten etwas geaendert haette.
        const ohneKommentar = (q) => q.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
        const CURRENT_CODE = ohneKommentar(CURRENT);
        const i = CURRENT_CODE.indexOf("document.addEventListener('languageChanged'");
        assert.notEqual(i, -1, 'der Zuhoerer ist verschwunden');
        const block = CURRENT_CODE.slice(i, i + 1200);
        assert.match(block, /matchupHeatmapContainer/,
            'der Zuhoerer prueft nicht den Behaelter der Heatmap');
        assert.ok(!block.includes('matchupAnalysisModal'),
            'die Bedingung prueft wieder das Modal des Battle Journals');
        assert.match(block, /renderMatchupHeatmap\(\)/);
    });
});

describe('Ein dynamisch gebauter Schluessel braucht seinen Vorgabewert', () => {
    it('tg.action.update existiert in beiden Sprachen', () => {
        // js/app-testing-groups.js baut 'tg.action.' + (a.action || 'update').
        // Fehlt der Eintrag, gibt t() den Schluessel selbst zurueck —
        // und der steht dann als "tg.action.update" auf dem Bildschirm.
        assert.match(TG, /t\('tg\.action\.' \+ \(a\.action \|\| 'update'\)\)/,
            'der Aufbau des Schluessels hat sich geaendert; diese Zusage muss mit');
        const n = (I18N.match(/'tg\.action\.update':/g) || []).length;
        assert.equal(n, 2, `tg.action.update steht ${n}x statt 2x (en + de)`);
    });

    it('jede geloggte Aktion hat ihren Eintrag in beiden Sprachen', () => {
        // FRUEHERE FASSUNG WAR WERTLOS. Sie suchte nach dem fertigen
        // String 'tg.action.xxx' im Quelltext — den gibt es dort nie,
        // weil der Schluessel aus 'tg.action.' + a.action gebaut wird.
        // Die Menge blieb leer, die Schleife lief nullmal, die Zusage
        // bestand ohne zu pruefen. Dahinter lagen drei echt fehlende
        // Schluessel, die als Rohtext auf dem Bildschirm standen.
        // Jetzt wird der zweite Parameter von _logActivity gelesen —
        // das ist die Stelle, an der der Name wirklich entsteht.
        const aktionen = new Set(['update']);   // der Vorgabewert
        for (const m of TG.matchAll(/_logActivity\([^,]+,\s*'([a-z_]+)'/g)) {
            aktionen.add(m[1]);
        }
        assert.ok(aktionen.size >= 10,
            `nur ${aktionen.size} Aktionen gefunden — die Erkennung greift nicht mehr`);
        const fehlen = [];
        for (const a of aktionen) {
            const n = (I18N.match(new RegExp("'tg\\.action\\." + a + "':", 'g')) || []).length;
            if (n !== 2) fehlen.push(`${a} (${n}x statt 2x)`);
        }
        assert.deepEqual(fehlen, [],
            `ohne Eintrag steht der rohe Schluessel auf dem Bildschirm: ${fehlen.join(', ')}`);
    });
});

describe('Der Sprachwechsel wirft keinen aktiven Filter weg', () => {
    it('neu gezeichnet wird ueber filterWishlist/filterTradelist', () => {
        // updateWishlistUI(searchFilter, setFilter) ohne Argumente
        // zeichnet ungefiltert — waehrend das Suchfeld den Filter
        // weiter anzeigt. Liste und Eingabe passten nicht mehr zusammen.
        const i = COLLECTION.indexOf("document.addEventListener('languageChanged'");
        assert.notEqual(i, -1);
        const block = COLLECTION.slice(i, i + 1600);
        assert.match(block, /filterWishlist\(\)/,
            'die Wunschliste wird wieder ohne ihren Filter gezeichnet');
        assert.match(block, /filterTradelist\(\)/,
            'die Trade List wird wieder ohne ihren Filter gezeichnet');
    });
});
