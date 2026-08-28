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

    it('haelt einen vollen Speicher aus', () => {
        assert.match(quelle, /try \{[\s\S]*localStorage\.setItem[\s\S]*\} catch/);
    });
});
