'use strict';
/*
 * Zweite Prüfrunde, 30.08.2026 — die Ecken, in die die erste nicht kam.
 *
 * **92 aria-label standen auf Englisch.** Der Mechanismus dafür
 * (`data-i18n-aria`) gab es seit jeher; die Elemente haben ihn nur nie
 * benutzt. Screenreader lasen die Seite auf Englisch vor, während das
 * `title`-Attribut am selben Knopf korrekt übersetzt wurde.
 *
 * **39 Meldungen fielen fest verdrahtet auf Englisch heraus** — Toasts,
 * Leerzustände, die Titel der Kartenknöpfe. Live nachgestellt: „Deck
 * kopieren" ohne Auswahl zeigte „No cards available to copy".
 *
 * **Der Deckpreis stand mit Punkt da** — „1.69 €" statt „1,69 €",
 * während jede andere Zahl der Seite ein Komma trägt.
 *
 * **Fünf Legenden-Kreise trugen weisse Buchstaben** bei 2,15 bis
 * 3,76:1. Der Buchstabe IST die Zuordnung zur Legende, also tragend.
 *
 * **Vier Tippziele mit 3 px Abstand waren 18 px gross.** Der Grund für
 * die Verkleinerung war Platzmangel — den gibt es hier nicht: das
 * Kartenbild ist bei 390 px Bildschirmbreite 173,5 px breit.
 *
 * Nach dieser Runde: **12 Ansichten × hell und dunkel = 1 Verstoss**,
 * und der sitzt in einem gesperrten Bedienelement (WCAG 1.4.3 nimmt
 * die ausdrücklich aus).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..', '..');
const lies = p => fs.readFileSync(path.join(wurzel, p), 'utf8');
const ohneKomm = q => q.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

/* ── Bildschirmlesegeräte hören Deutsch ──────────────────────────── */
describe('aria-label ist übersetzbar', () => {
    const HTML = lies('index.html');

    it('jedes aria-label in index.html trägt einen Schlüssel', () => {
        const tags = HTML.match(/<[a-zA-Z][^>]*aria-label="[^"]*"[^>]*>/g) || [];
        const ohne = tags.filter(t => !t.includes('data-i18n-aria'));
        assert.ok(tags.length > 100, 'die Auszeichnung wurde umgebaut — Test anpassen');
        assert.equal(ohne.length, 0,
            ohne.length + ' aria-label ohne Schlüssel, z.B. '
            + (ohne[0] || '').match(/aria-label="([^"]*)"/)?.[1]);
    });

    it('jeder aria-Schlüssel steht in beiden Sprachen', () => {
        const I18N = lies('js/i18n.js');
        const benutzt = [...new Set((HTML.match(/data-i18n-aria="([^"]+)"/g) || [])
            .map(s => s.match(/"([^"]+)"/)[1]))];
        assert.ok(benutzt.length > 60);
        const fehlend = benutzt.filter(k => {
            const n = (I18N.match(new RegExp("'" + k.replace('.', '\\.') + "'\\s*:", 'g')) || []).length;
            return n !== 2;
        });
        assert.deepEqual(fehlend, [], 'Schlüssel fehlen in einer Sprache');
    });
});

/* ── Meldungen ───────────────────────────────────────────────────── */
describe('Meldungen kommen aus i18n', () => {
    const DATEIEN = ['js/app-cards-db.js', 'js/app-current-meta-analysis.js',
                     'js/app-features.js', 'js/app-past-meta.js',
                     'js/firebase-collection.js', 'js/app-meta-cards.js',
                     'js/app-deck-builder.js', 'js/custom-binder.js'];

    it('kein showToast mehr mit einem englischen Satz', () => {
        for (const d of DATEIEN) {
            const s = ohneKomm(lies(d));
            const treffer = s.match(/show(?:Toast|Notification)\((['`])[A-Z][^'`]{6,}?\1/g) || [];
            // Deutsche Meldungen sind kein Befund — gesucht sind ENGLISCHE.
            const deutsch = treffer.filter(t => /[äöüßÄÖÜ]|Fehler|fehlgeschlagen|Lade|ungültig/.test(t));
            assert.deepEqual(treffer.filter(t => !deutsch.includes(t)), [], d);
        }
    });

    it('keine festen englischen Knopf-Titel mehr', () => {
        const verboten = ['title="Add to deck"', 'title="Remove from deck"',
                          'title="Switch rarity/print"', 'title="Open on Limitless"',
                          'title="Add to proxy"', 'title="Add to proxy queue"',
                          'title="Add to Deck"', "'Buy on Cardmarket: '"];
        for (const d of DATEIEN) {
            const s = lies(d);
            for (const v of verboten) assert.ok(!s.includes(v), d + ' — ' + v);
        }
    });

    it('die Leerzustände sind übersetzt', () => {
        const FC = lies('js/firebase-collection.js');
        for (const v of ['Your Collection is empty!', 'Your Wishlist is empty!',
                         'Your Trade List is empty!', 'No saved Decks yet!']) {
            assert.ok(!FC.includes(v), v + ' steht wieder fest im Code');
        }
        assert.match(FC, /t\('leer\.collectionTitle'\)/);
    });

    it('jeder neue Schlüssel steht in beiden Sprachen', () => {
        const I18N = lies('js/i18n.js');
        for (const raum of ['toast', 'leer', 'akt']) {
            const alle = [...new Set((I18N.match(new RegExp("'" + raum + "\\.[a-zA-Z]+'", 'g')) || []))];
            assert.ok(alle.length > 3, raum + ' hat kaum Schlüssel — Test anpassen');
            for (const k of alle) {
                const n = (I18N.match(new RegExp(k.replace('.', '\\.') + '\\s*:', 'g')) || []).length;
                assert.equal(n, 2, k + ' steht ' + n + '-mal statt zweimal');
            }
        }
    });
});

/* ── Zahlen ──────────────────────────────────────────────────────── */
describe('Preise tragen ein Komma', () => {
    it('der Deckpreis geht durch zahlLokal', () => {
        const DB = ohneKomm(lies('js/app-deck-builder.js'));
        assert.ok(!/totalPrice\.toFixed\(2\)\) \+ ' \\u20ac'/.test(DB),
            'der Deckpreis steht wieder mit Punkt da');
        assert.match(DB, /zahlLokal\(isNaN\(totalPrice\) \? 0 : totalPrice, 2\)/);
    });

    it('der Sammlungswert ebenso', () => {
        const FC = lies('js/firebase-collection.js');
        assert.ok(!/stats\.totalValue\.toFixed\(2\)\}€/.test(FC));
        assert.match(FC, /zahlLokal\(stats\.totalValue, 2\)/);
    });
});

/* ── Farbe ───────────────────────────────────────────────────────── */
describe('Kontrast', () => {
    const kontrast = (a, b) => {
        const l = h => {
            const c = [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16) / 255)
                .map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
            return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
        };
        const [x, y] = [l(a), l(b)];
        return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };

    it('die Legendenkreise tragen weisse Buchstaben', () => {
        const CSS = lies('css/styles.css');
        const farben = ['red', 'green', 'pink', 'amber', 'action'].map(n => {
            const m = CSS.match(new RegExp('\\.meta-hub-legend-key-' + n + '\\s*\\{ background: (#[0-9a-f]{6}); \\}'));
            assert.ok(m, n + ' nicht gefunden');
            return [n, m[1]];
        });
        for (const [n, c] of farben) {
            assert.ok(kontrast('#ffffff', c) >= 4.5,
                n + ' trägt nur ' + kontrast('#ffffff', c).toFixed(2) + ':1');
        }
    });

    it('die Ergebniskarten des Rechners sind nicht mehr weggeblendet', () => {
        const UI = lies('css/ui-components.css');
        assert.ok(!/\.calc-result-label \{[^}]*opacity/.test(UI));
        assert.ok(!/\.calc-result-note \{[^}]*opacity/.test(UI));
    });

    it('die City-League-Kacheln ebenso', () => {
        const UI = lies('css/ui-components.css');
        const titel = UI.match(/\.city-league-info-card-title \{[\s\S]*?\}/)[0];
        const det = UI.match(/\.city-league-info-card-details \{[\s\S]*?\}/)[0];
        assert.ok(!/opacity/.test(titel), 'die Deckkraft ist zurück');
        assert.ok(!/opacity/.test(det));
    });

    it('die Gruppenfarben der Profilleiste drehen mit dem Modus', () => {
        const AUTH = lies('css/auth-styles.css');
        assert.ok(!/data-group="misc"\]\s*\.profile-tab-group-label \{ color: #7f8c8d/.test(AUTH));
        assert.match(AUTH, /data-group="decks"\]\s*\.profile-tab-group-label \{ color: var\(--profil-decks-ink\)/);
        const TOK = lies('css/tokens.css');
        assert.equal((TOK.match(/--profil-misc-ink:/g) || []).length, 2, 'nur in einem Modus gesetzt');
        assert.equal((TOK.match(/--meta-anteil-ink:/g) || []).length, 2);
    });
});

/* ── Tippziele ───────────────────────────────────────────────────── */
describe('Tippziele in der Kartendatenbank', () => {
    const CSS = lies('css/cards-tabs.css');

    it('die Eckknöpfe messen mindestens 24 px', () => {
        const bloecke = CSS.match(/\.card-badge \{[\s\S]*?\}/g) || [];
        assert.ok(bloecke.length >= 2);
        for (const b of bloecke) {
            const m = b.match(/width: (\d+)px/);
            if (!m) continue;
            assert.ok(Number(m[1]) >= 24, 'ein Knopf ist wieder ' + m[1] + ' px');
        }
    });

    it('die Knopfzeile unter dem Bild ebenso', () => {
        // 17 px und 16 px standen in zwei Medienabfragen.
        const zeilen = CSS.split('\n');
        for (let i = 0; i < zeilen.length; i++) {
            const m = zeilen[i].match(/min-height: (\d+)px !important;/);
            if (!m) continue;
            const kopf = zeilen.slice(Math.max(0, i - 6), i).join(' ');
            // -coverage ist ein Textstreifen, kein Bedienelement.
            if (!/-btn|-placeholder/.test(kopf) || /-coverage/.test(kopf)) continue;
            assert.ok(Number(m[1]) >= 24, 'Knopfzeile wieder ' + m[1] + ' px (Zeile ' + (i + 1) + ')');
        }
    });
});
