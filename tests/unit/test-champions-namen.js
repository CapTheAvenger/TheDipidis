'use strict';
/*
 * DEUTSCHE BESCHRIFTUNGEN, ENGLISCHE WERTE
 * ========================================
 *
 * BEFUND (03.09.2026, beim Bebildern der Anleitung). Im Team-Builder
 * stand auf der DEUTSCHEN Seite:
 *
 *     Pelipper
 *     Focus Sash
 *     Fähigkeit         Drizzle
 *     Wesen             Modest
 *     Statuswertpunkte  2 HP / 32 SpA / 32 Spe
 *     Attacken          Hurricane · Tailwind · Weather Ball · Wide Guard
 *
 * Vier deutsche Beschriftungen, vier englische Werte. Nicht weil die
 * Namen fehlten — data/champions_names_de.json fuehrt alle vier
 * Kategorien —, sondern weil die beiden Renderer nur die ART aufloesten
 * (pokemon_names_de.json) und den Rest durchreichten.
 *
 * Aufgefallen ist es erst auf einem Screenshot. Kein Test war rot, kein
 * Sprachreinheitslauf hat angeschlagen: die Werte sind DATEN, keine
 * i18n-Schluessel, und Daten schaut die Sprachpruefung nicht an.
 *
 * DIE GRENZE, DIE HIER GEZOGEN WIRD
 * ---------------------------------
 * Uebersetzt wird, was ein MENSCH liest. Nicht uebersetzt wird, was eine
 * MASCHINE liest: der Showdown-/Limitless-Export und der Wert eines
 * <option>-Elements. Ein Export mit "Fokusgurt" statt "Focus Sash" wird
 * vom Teambuilder abgelehnt — derselbe Fehler wie beim Kopf einer
 * kopierten Deckliste (test-decklisten-kopf.js).
 *
 * Diese Datei prueft beide Haelften: dass uebersetzt wird, UND dass der
 * Export unangetastet bleibt.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const wurzel = path.join(__dirname, '..', '..');
const lies = (...t) => fs.readFileSync(path.join(wurzel, ...t), 'utf8');

const NAMEN   = lies('js', 'champions-namen.js');
const QUEST   = lies('js', 'app-side-quest.js');
const BUILDER = lies('js', 'app-side-quest-builder.js');
const HTML    = lies('index.html');
const SW      = lies('service-worker.js');

function ohneKommentare(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, '');
}

// ── Das Modul selbst, ausgefuehrt ────────────────────────────────────

function ladeModul({ lang = 'de', tabelle = null } = {}) {
    const ctx = {
        window: { getLang: () => lang },
        fetch: async () => ({ ok: true, json: async () => tabelle }),
        console,
    };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(NAMEN, ctx);
    return ctx.window.ChampionsNamen;
}

const TABELLE = {
    items: { 'Focus Sash': 'Fokusgurt', 'Charizardite Y': 'Gluraknit Y' },
    moves: { 'Weather Ball': 'Meteorologe', 'Wide Guard': 'Rundumschutz' },
    abilities: { Drizzle: 'Niesel' },
};

describe('ChampionsNamen — das gemeinsame Namensmodul', () => {

    it('gibt den deutschen Namen, wenn die Oberflaeche deutsch ist', async () => {
        const M = ladeModul({ lang: 'de', tabelle: TABELLE });
        await M.laden();
        assert.strictEqual(M.anzeige('Focus Sash', 'items'), 'Fokusgurt');
        assert.strictEqual(M.anzeige('Drizzle', 'abilities'), 'Niesel');
        assert.strictEqual(M.anzeige('Weather Ball', 'moves'), 'Meteorologe');
        assert.strictEqual(M.anzeige('Modest', 'nature'), 'Mäßig');
    });

    it('laesst Englisch stehen, wenn die Oberflaeche englisch ist', async () => {
        const M = ladeModul({ lang: 'en', tabelle: TABELLE });
        await M.laden();
        assert.strictEqual(M.anzeige('Focus Sash', 'items'), 'Focus Sash');
        assert.strictEqual(M.anzeige('Modest', 'nature'), 'Modest');
    });

    it('faellt auf Englisch zurueck statt auf einen leeren Platzhalter', async () => {
        // Ein fehlender Name ist aergerlich, ein leeres Feld ist ein Bug.
        const M = ladeModul({ lang: 'de', tabelle: { items: {}, moves: {}, abilities: {} } });
        await M.laden();
        assert.strictEqual(M.anzeige('Focus Sash', 'items'), 'Focus Sash');
        assert.strictEqual(M.anzeige('', 'items'), '');
    });

    it('ueberlebt eine kaputte Datei', async () => {
        const ctx = {
            window: { getLang: () => 'de' },
            fetch: async () => { throw new Error('offline'); },
            console,
        };
        ctx.globalThis = ctx;
        vm.createContext(ctx);
        vm.runInContext(NAMEN, ctx);
        const M = ctx.window.ChampionsNamen;
        await M.laden();
        assert.strictEqual(M.anzeige('Focus Sash', 'items'), 'Focus Sash',
            'ohne Tabelle muss Englisch stehen bleiben, nicht ein Fehler fliegen');
    });

    it('laedt die Datei nur einmal', async () => {
        let rufe = 0;
        const ctx = {
            window: { getLang: () => 'de' },
            fetch: async () => { rufe++; return { ok: true, json: async () => TABELLE }; },
            console,
        };
        ctx.globalThis = ctx;
        vm.createContext(ctx);
        vm.runInContext(NAMEN, ctx);
        const M = ctx.window.ChampionsNamen;
        await M.laden(); await M.laden(); await M.laden();
        assert.strictEqual(rufe, 1, `${rufe} Ladungen statt einer`);
    });

    it('fuehrt alle 25 Wesen', () => {
        const M = ladeModul();
        assert.strictEqual(Object.keys(M.WESEN_DE).length, 25,
            'es gibt genau 25 Wesen; fehlt eines, steht dort auf Deutsch Englisch');
    });
});

// ── Die beiden Renderer benutzen es auch ─────────────────────────────

describe('Die Champions-Ansichten uebersetzen ihre Werte', () => {

    for (const [datei, src] of [['app-side-quest.js', QUEST],
                                ['app-side-quest-builder.js', BUILDER]]) {
        it(`${datei} holt sich die Namenstabelle`, () => {
            const q = ohneKommentare(src);
            assert.ok(/ChampionsNamen\s*&&\s*window\.ChampionsNamen\.laden/.test(q)
                      || /ChampionsNamen\.laden/.test(q),
                `${datei} laedt die Namenstabelle nicht — dann zeichnet es einmal `
                + 'englisch und der Nutzer sieht genau das');
            assert.ok(/function nm\(/.test(q),
                `${datei} hat keinen Aufloeser nm() mehr`);
        });
    }

    it('die Teamkarte uebersetzt Gegenstand, Faehigkeit und Attacken', () => {
        const q = ohneKommentare(QUEST);
        const i = q.indexOf('function renderPokemon');
        assert.ok(i > 0, 'renderPokemon ist verschwunden');
        const block = q.slice(i, i + 2000);
        for (const [feld, art] of [['p.item', 'items'], ['p.ability', 'abilities']]) {
            assert.ok(new RegExp(`nm\\(${feld.replace('.', '\\.')}, '${art}'\\)`).test(block),
                `renderPokemon reicht ${feld} wieder unuebersetzt durch`);
        }
        assert.ok(/nm\(m, 'moves'\)/.test(block),
            'renderPokemon reicht die Attacken wieder unuebersetzt durch');
    });

    it('die Teamkarte schreibt nicht mehr "Modest Nature" auf eine deutsche Seite', () => {
        const q = ohneKommentare(QUEST);
        const i = q.indexOf('const nature = p.nature');
        assert.ok(i > 0, 'die Wesenszeile ist verschwunden');
        const block = q.slice(i, i + 420);
        assert.ok(/Wesen:/.test(block),
            'auf Deutsch muss dort "Wesen: Mäßig" stehen, nicht "Modest Nature" — '
            + 'zweimal Englisch in einer Zeile');
        assert.ok(/nm\(p\.nature, 'nature'\)/.test(block),
            'der Wesenswert wird nicht aufgeloest');
    });

    it('der Builder uebersetzt Karte UND Auswahllisten', () => {
        const q = ohneKommentare(BUILDER);
        for (const art of ['items', 'abilities', 'moves', 'nature']) {
            assert.ok(new RegExp(`'${art}'`).test(q),
                `der Builder reicht die Art ${art} nirgends an nm()/spOptionen() weiter`);
        }
        assert.ok(/function spOptionen\(liste, aktuell, l, art\)/.test(q),
            'spOptionen kennt die Art nicht mehr — dann kann es nicht uebersetzen');
    });
});

// ── Die andere Haelfte: was eine Maschine liest, bleibt englisch ─────

describe('Der Export bleibt englisch', () => {

    it('die Showdown-Zeilen nehmen den Rohwert, nicht die Anzeige', () => {
        // Ein Export mit "Fokusgurt" wird vom Showdown-Teambuilder
        // abgelehnt. Die Zeilen muessen st.item / st.ability / st.nature
        // direkt lesen.
        const q = ohneKommentare(BUILDER);
        const i = q.indexOf('Ability: ');
        assert.ok(i > 0, 'der Showdown-Export ist verschwunden');
        const block = q.slice(Math.max(0, i - 500), i + 700);
        assert.ok(/`\$\{st\.showdown\} @ \$\{st\.item\}`/.test(block)
                  || /@ \$\{st\.item\}/.test(block),
            'die Item-Zeile des Exports geht nicht mehr ueber den Rohwert');
        assert.ok(/Ability: \$\{st\.ability\}/.test(block),
            'die Ability-Zeile des Exports geht nicht mehr ueber den Rohwert');
        assert.ok(/\$\{st\.nature\} Nature/.test(block),
            'die Nature-Zeile des Exports geht nicht mehr ueber den Rohwert');
        assert.ok(!/nm\(/.test(block),
            'im Export steht ein nm()-Aufruf — der Export wird von einer '
            + 'Maschine gelesen und muss englisch bleiben');
    });

    it('der Wert eines option-Elements bleibt englisch', () => {
        // Der value steckt im Zustand und wandert von dort in den
        // Export. Uebersetzt werden darf nur die Beschriftung.
        const q = ohneKommentare(BUILDER);
        const i = q.indexOf('function spOptionen');
        const block = q.slice(i, i + 1200);
        assert.ok(/value="\$\{escapeHtml\(n\)\}"/.test(block),
            'der option-Wert wird nicht mehr aus dem Rohnamen gebildet');
        assert.ok(/>\$\{escapeHtml\(nm\(n, art\) \+ pct\)\}</.test(block),
            'die option-Beschriftung wird nicht uebersetzt');
    });
});

// ── Verdrahtung ─────────────────────────────────────────────────────

describe('Das Modul ist verdrahtet', () => {

    it('index.html laedt es vor app-side-quest.js', () => {
        const iNamen = HTML.indexOf('js/champions-namen.js');
        const iQuest = HTML.indexOf('js/app-side-quest.js');
        assert.ok(iNamen > 0, 'js/champions-namen.js steht nicht in index.html');
        assert.ok(iNamen < iQuest,
            'champions-namen.js muss VOR app-side-quest.js stehen');
    });

    it('der Offline-Vorrat kennt es', () => {
        assert.ok(SW.includes('./js/champions-namen.js'),
            'ohne Eintrag im service-worker fehlt die Datei offline, und die '
            + 'Namen fallen dort wortlos auf Englisch zurueck');
    });

    it('die uebrigen Module holen sich die Wesenstabelle von hier', () => {
        // Vorher fuehrten drei Module ihre eigene Kopie — und die des
        // Team-Builders fehlte ganz, weshalb dort "Modest" stand.
        for (const datei of ['app-side-quest-matchups.js', 'app-side-quest-pokedex.js']) {
            const q = ohneKommentare(lies('js', datei));
            assert.ok(/window\.ChampionsNamen\s*&&\s*window\.ChampionsNamen\.WESEN_DE/.test(q),
                `${datei} holt die Wesenstabelle nicht mehr aus champions-namen.js`);
        }
    });

    it('es gibt genau EINE Wesenstabelle', () => {
        // Drei Module laden champions_names_de.json einzeln; die
        // Wesenstabelle stand nur in einem davon. Eine zweite
        // handgeschriebene Kopie ist genau der Fehler, den dieses
        // Projekt schon dreimal bezahlt hat.
        const kandidaten = fs.readdirSync(path.join(wurzel, 'js'))
            .filter(f => f.endsWith('.js'));
        const mitTabelle = kandidaten.filter(f => {
            const q = ohneKommentare(lies('js', f));
            return /Hardy:\s*'Robust'/.test(q);
        });
        assert.deepStrictEqual(mitTabelle, ['champions-namen.js'],
            'die Wesenstabelle steht in einer weiteren Datei — sie gehoert '
            + 'genau einmal nach js/champions-namen.js. Gefunden in: '
            + mitTabelle.join(', '));
    });
});
