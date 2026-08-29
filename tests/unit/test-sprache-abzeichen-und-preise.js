/**
 * Zwei Stellen, an denen die Anzeige der Sprachtabelle davonlief.
 *
 * Am 29.08.2026 im Browser gemessen (englischer Modus, 20 Ansichten
 * plus je 25 angeklickte Bedienelemente): die Sprachtabelle ist
 * vollstaendig — 1897 Schluessel je Sprache, keiner fehlt — und
 * trotzdem standen zwoelf deutsche Texte auf dem Bildschirm. Keiner
 * von ihnen trug einen data-i18n-Schluessel. Es war also nie die
 * Tabelle, sondern immer der Weg dorthin.
 *
 * Nebenbefund: die Messung selbst war zweimal falsch, bevor sie stimmte
 * — einmal, weil sie den falschen Speicherschluessel setzte, einmal,
 * weil sie beim Durchklicken den Sprachumschalter mit erwischte und ab
 * da alles auf Deutsch mass (873 vermeintliche Funde). Deshalb steht
 * hier die Eigenschaft, nicht die Zahl.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const COLLECTION = fs.readFileSync(path.join(ROOT, 'js', 'firebase-collection.js'), 'utf8');
const INIT = fs.readFileSync(path.join(ROOT, 'js', 'inline-init.js'), 'utf8');
const I18N = fs.readFileSync(path.join(ROOT, 'js', 'i18n.js'), 'utf8');
const TUT_EN = fs.readFileSync(path.join(ROOT, 'tutorial', 'tutorial.en.html'), 'utf8');

describe('Das Abschnitts-Abzeichen gehoert dem Router, nicht der Tabelle', () => {
    it('es traegt keinen data-i18n-Schluessel mehr', () => {
        const m = HTML.match(/<span id="current-tab-title"[^>]*>/);
        assert.ok(m, '#current-tab-title ist verschwunden');
        assert.ok(!/data-i18n/.test(m[0]),
            'Der Schluessel stand fest auf tab.cityLeague. Jeder blanke Aufruf von '
            + 'updateTranslationsInDOM() — js/app-cards-db.js macht zwei — haette das '
            + 'Abzeichen mit "City League Meta" ueberschrieben, egal welche Ansicht offen ist.');
    });

    it('dafuer haelt der Sprachwechsel es nach', () => {
        // Wenn die Tabelle es nicht mehr setzt, MUSS es jemand anders tun.
        const i = INIT.indexOf("document.addEventListener('languageChanged'");
        assert.notEqual(i, -1, 'niemand zieht das Abzeichen beim Sprachwechsel nach');
        const block = INIT.slice(i, i + 900);
        assert.match(block, /current-tab-title/);
        assert.match(block, /menu-item-label|innerText/);
    });
});

describe('Preis-Pillen und Vertrauens-Abzeichen kommen aus der Tabelle', () => {
    it('kein fester deutscher Text mehr in den beiden Pillen', () => {
        const zielPille = COLLECTION.match(/function buildWishlistTargetPill[\s\S]*?\n\}/);
        const checkPille = COLLECTION.match(/function buildTradelistUnderpricedPill[\s\S]*?\n\}/);
        assert.ok(zielPille && checkPille, 'eine der Pillen ist verschwunden');
        // Kommentare duerfen den alten Wortlaut zitieren — sie erklaeren,
        // WARUM dort "Preis Check" steht und nicht "+N % ueber Markt".
        // Geprueft wird der Code, nicht die Begruendung.
        const ohneKommentar = (q) => q.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
        for (const [name, roh] of [['Ziel', zielPille[0]], ['Check', checkPille[0]]]) {
            const quelle = ohneKommentar(roh);
            assert.ok(!/Unter deinem Ziel|Preis Check|Wunsch-Maximum|Tipp den Preis-Input/.test(quelle),
                `${name}-Pille traegt wieder festes Deutsch`);
            assert.match(quelle, /t\('preis\./, `${name}-Pille liest nicht aus der Tabelle`);
        }
    });

    it('die drei Vertrauensfaelle tragen Schluessel, keine Saetze', () => {
        const m = COLLECTION.match(/const PRICE_TRUST_CASES = \{[\s\S]*?\n\};/);
        assert.ok(m, 'PRICE_TRUST_CASES ist verschwunden');
        for (const fall of ['unverified', 'unmapped', 'collision']) {
            assert.ok(m[0].includes(fall + ':'), 'Fall fehlt: ' + fall);
        }
        assert.ok(!/[äöüÄÖÜß]/.test(m[0]),
            'in den Faellen steht wieder deutscher Text statt eines Schluessels');
        assert.match(m[0], /label: 'preis\./);
        assert.match(m[0], /title: 'preis\./);
    });

    it('jeder benutzte Schluessel steht in BEIDEN Sprachen', () => {
        const benutzt = new Set();
        for (const m of COLLECTION.matchAll(/'(preis\.[a-zA-Z]+)'/g)) benutzt.add(m[1]);
        assert.ok(benutzt.size >= 10, `nur ${benutzt.size} Preis-Schluessel benutzt`);
        for (const k of benutzt) {
            const n = (I18N.match(new RegExp("'" + k.replace('.', '\\.') + "':", 'g')) || []).length;
            assert.equal(n, 2, `${k} steht ${n}x in js/i18n.js, noetig sind 2 (en + de)`);
        }
    });

    it('die englischen Fassungen sind wirklich englisch', () => {
        const alle = [...I18N.matchAll(/^ {4}'(preis\.[a-zA-Z]+)':\s*'((?:\\.|[^'\\])*)'/gm)];
        assert.ok(alle.length >= 20, `nur ${alle.length} Preis-Zeilen gefunden`);
        const en = alle.slice(0, Math.floor(alle.length / 2));
        // Umlaute allein reichen nicht: "nicht verifiziert" hat keinen und
        // ist trotzdem deutsch. Mutationsgeprueft — die erste Fassung
        // dieser Zusage blieb genau daran gruen.
        const DEUTSCH = /[äöüÄÖÜß]|\b(?:nicht|kein|keine|einer|einem|derselben|zugeordnet|Zuordnung|Karte|Karten|Preis|Nummer|doppelt|vergeben|deinem|dieser|diese|gehoert|gehört|pruefen|prüfen|stammt|wurde|niemals|beliebig|Bestand)\b/;
        for (const [, k, v] of en) {
            assert.ok(!DEUTSCH.test(v), `${k}: deutsche Fassung steht im englischen Block — ${v.slice(0, 70)}`);
        }
        const de = alle.slice(Math.floor(alle.length / 2));
        assert.equal(en.length, de.length, 'die beiden Bloecke fuehren unterschiedlich viele Preis-Schluessel');
        for (let i = 0; i < en.length; i++) {
            assert.equal(en[i][1], de[i][1], `Reihenfolge weicht ab: ${en[i][1]} vs ${de[i][1]}`);
            assert.notEqual(en[i][2], de[i][2],
                `${en[i][1]}: beide Sprachen tragen denselben Text — eine der beiden ist nicht uebersetzt`);
        }
    });
});

describe('Das englische Tutorial', () => {
    it('zeigt die Pille der Webseite auf Englisch', () => {
        assert.ok(!/mockup-wt-card-trigger">🎯 Unter deinem Ziel/.test(TUT_EN),
            'die Pille ist die Anzeige DER WEBSEITE und muss mit der Sprache wandern');
        assert.match(TUT_EN, /mockup-wt-card-trigger">🎯 Below your target/);
    });

    it('sagt dazu, dass der Bot Deutsch schreibt — statt seine Texte zu erfinden', () => {
        // Die Telegram-Blasen geben wieder, was der Bot WIRKLICH schickt
        // (bot/src/commands/start.js schreibt Deutsch). Sie zu uebersetzen
        // waere eine Luege ueber das, was beim Nutzer ankommt.
        assert.match(TUT_EN, /bot itself writes in German/i,
            'ohne diesen Hinweis liest sich der deutsche Bot-Text wie ein Uebersetzungsfehler');
    });
});
