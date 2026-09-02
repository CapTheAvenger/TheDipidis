/**
 * Der Seltenheits-Schalter ohne Deck.
 *
 * Gemeldet am 28.08.2026 mit Bildschirmfoto: aus den Format-Staples
 * heraus zeigte das Fenster "Deck Qty"-Felder, einen Knopf "Apply
 * Quantities" und danach die Meldung "Diese Karte wurde im aktuellen
 * Deck nicht gefunden". An dieser Stelle gibt es kein Deck — das Fenster
 * bot eine Rechnung an, die ins Leere greift.
 *
 * Diese Datei liest die Quelle und haelt drei Zusagen fest:
 *
 *  1. Es gibt genau eine Bedingung fuer den Anzeige-Modus, und Knopf,
 *     Mengenfeld und Fussleiste haengen alle daran. Zwei getrennte
 *     Bedingungen waeren die schlimmste Mischung: keine Mengenfelder,
 *     kein "Apply", aber ein lebendiges "Alle tauschen", das trotzdem
 *     ein Deck umschreibt.
 *  2. Der Mengenblock wird im Anzeige-Modus gar nicht erst ausgegeben.
 *     Ein hidden-Attribut haette hier nicht gereicht: die Autorenregel
 *     .rarity-option-qty-wrap { display:flex } schlaegt die
 *     Browserregel fuer [hidden].
 *  3. Die Anzeige-Wahl schreibt NICHT in setRarityPreference. Der
 *     Speicher haengt am blossen Kartennamen und wird von Deckansicht,
 *     Auto-Bauen und Binder gelesen — ein Gold-Artwork "nur fuers Bild"
 *     staende sonst anschliessend in jedem eigenen Deck.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const DB = fs.readFileSync(path.join(ROOT, 'js', 'app-cards-db.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'css', 'styles.css'), 'utf8');

describe('der Anzeige-Modus des Seltenheits-Schalters', () => {
    it('kennt genau eine Bedingung dafuer', () => {
        const treffer = DB.match(/const nurAnzeige = [^;]+;/g) || [];
        assert.equal(treffer.length, 1, 'die Bedingung steht nicht genau einmal');
        assert.match(treffer[0], /anzeigeZiel === 'staples'/);
        assert.match(treffer[0], /!activeDeckContext/,
            'ohne aufgeloestes Deck muss der Modus auch ohne Absender greifen');
    });

    it('haengt Knopf, Mengenfeld und Fussleiste an dieselbe Bedingung', () => {
        // Drei Verwendungen: der Mengenblock, der Knopf je Druck, die
        // Fussleiste. Sonst entsteht die gefaehrliche Mischung.
        const n = (DB.match(/\$\{nurAnzeige \?/g) || []).length
                + (DB.match(/= nurAnzeige \?/g) || []).length;
        assert.equal(n, 3, `nurAnzeige wird ${n}-mal ausgewertet, erwartet 3`);
        assert.ok(!/anzeigeZiel \?/.test(DB),
            'es gibt noch eine zweite, abweichende Bedingung auf anzeigeZiel');
    });

    it('gibt den Mengenblock im Anzeige-Modus nicht aus, statt ihn zu verstecken', () => {
        assert.match(DB, /\$\{nurAnzeige \? '' : `\s*<div class="rarity-option-qty-wrap">/,
            'der Mengenblock wird nicht weggelassen');
        assert.ok(!/rarity-option-qty-wrap"\$\{[^}]*hidden/.test(DB),
            'der Mengenblock wird per hidden versteckt — das greift hier nicht');
        // Die Autorenregel, die ein hidden-Attribut ueberstimmen wuerde.
        assert.match(CSS, /\.rarity-option-qty-wrap\s*\{[^}]*display:\s*flex/);
    });

    it('reicht den Absender aus den Staples durch', () => {
        assert.match(DB, /function openRaritySwitcherFromDB\(cardName, set, number, anzeigeZiel\)/);
        assert.match(DB, /openRaritySwitcher\(cardName, deckKey, '', anzeigeZiel \|\| ''\)/);
    });
});

describe('die Anzeige-Wahl fasst kein Deck an', () => {
    const a = DB.indexOf('function waehleAnzeigeDruck(');
    const quelle = DB.slice(a, DB.indexOf('\n        }', a));

    it('schreibt nicht in die geteilte Seltenheits-Vorliebe', () => {
        assert.ok(a > -1, 'waehleAnzeigeDruck fehlt');
        assert.ok(!/setRarityPreference/.test(quelle),
            'die Anzeige-Wahl schreibt in den geteilten Speicher');
        assert.ok(!/updateDeckDisplay|saveDeck|DeckOrder/.test(quelle),
            'die Anzeige-Wahl fasst ein Deck an');
    });

    it('schluesselt den gewaehlten Druck ueber Set und Nummer, nicht ueber den Namen', () => {
        // Vier Produkte heissen "Mega Darkrai ex" und kosten 1,03 bis
        // 331,99 Euro. Ein Speicher am Namen wuerfe sie zusammen.
        assert.match(quelle, /\$\{String\(altSet \|\| ''\)\.toUpperCase\(\)\}\|\$\{String\(altNummer \|\| ''\)\.toUpperCase\(\)\}/);
    });

    it('die Artwork-Wahl ueberlebt das Neuladen NICHT', () => {
        /* ANLASS (02.09.2026): "den print beim neu laden bitte immer wieder
           auf den aktuellsten low rarity print setzen."

           Vorher lag die Wahl in localStorage. Wer einmal aus Neugier das
           Gold-Artwork angesehen hatte, bekam es Monate spaeter noch — auf
           den Kacheln und im erzeugten Bild, das fuer andere gedacht ist.

           Der Speicher muss fluechtig sein. sessionStorage genuegt NICHT:
           das ueberlebt F5 im selben Tab. */
        assert.match(DB, /let _anzeigeDrucke = \{\};/,
            'der fluechtige Speicher fuer die Artwork-Wahl fehlt');
        const i = DB.indexOf('function waehleAnzeigeDruck');
        assert.ok(i > 0, 'waehleAnzeigeDruck fehlt');
        // Bis zum ENDE der Funktion, nicht bis zum ersten
        // closeRaritySwitcher() — das steht schon in der Waechterzeile.
        const rumpf = DB.slice(i, DB.indexOf('\n        }', i));
        assert.ok(!/localStorage\.setItem/.test(rumpf) && !/sessionStorage/.test(rumpf),
            'die Artwork-Wahl wird wieder dauerhaft gespeichert — dann steht '
            + 'nach dem Neuladen erneut das Gold-Artwork da statt des '
            + 'guenstigsten aktuellen Drucks');
        assert.match(rumpf, /_anzeigeDrucke\[schluessel\] =/,
            'die Wahl landet nicht mehr im fluechtigen Speicher — dann wirkt '
            + 'der Stern gar nicht mehr');

        // Und gelesen wird auch nichts Dauerhaftes mehr.
        const j = DB.indexOf('function ladeAnzeigeDrucke');
        assert.ok(j > 0, 'ladeAnzeigeDrucke fehlt');
        const leseRumpf = DB.slice(j, DB.indexOf('function anzeigeDruckFuer', j));
        assert.ok(!/localStorage\.getItem/.test(leseRumpf) && !/sessionStorage/.test(leseRumpf),
            'beim Lesen wird wieder ein dauerhafter Speicher befragt');

        // Der Altbestand wird einmal aufgeraeumt.
        assert.match(DB, /localStorage\.removeItem\(ANZEIGE_DRUCK_KEY\)/,
            'die alte gespeicherte Wahl wird nicht aufgeraeumt — Bestandsnutzer '
            + 'tragen sie sonst weiter mit sich herum');
    });

    it('der Hinweistext sagt, dass die Wahl nur bis zum Neuladen haelt', () => {
        const i18n = fs.readFileSync(path.join(ROOT, 'js', 'i18n.js'), 'utf8');
        const treffer = [...i18n.matchAll(/'staples\.printHint':\s*'([^']*)'/g)].map(m => m[1]);
        assert.strictEqual(treffer.length, 2,
            `staples.printHint steht ${treffer.length}× in i18n.js, erwartet 2`);
        assert.ok(treffer.some(t => /Neuladen/.test(t)),
            'der deutsche Hinweis sagt nicht, dass die Wahl nach dem Neuladen weg ist');
        assert.ok(treffer.some(t => /reload/i.test(t)),
            'der englische Hinweis sagt nicht, dass die Wahl nach dem Neuladen weg ist');
    });
});
