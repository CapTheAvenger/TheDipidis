/**
 * Die Brücke zwischen den drei Champions-Namensräumen.
 *
 * BEFUND (25.08.2026, Feature-Review Team-Builder): der Team-Builder arbeitet
 * mit Nutzungs-Slugs und zeigt Teamkameraden-Namen ("Basculegion Male",
 * "Alolan Ninetales"). Alles, was ein gespeichertes Team weiterverarbeitet,
 * erwartet Showdown-Namen ("Basculegion", "Ninetales-Alola"). Gemessen:
 *
 *     von 353 Anzeigenamen finden 152 keinen Eintrag in
 *     data/pokemon_battle_data.json
 *
 * Heute schadet das nicht — den Builder konsumiert nichts. In dem Moment, in
 * dem er ein Team speichert, bricht es an vier Stellen gleichzeitig, und zwar
 * STILL: js/app-side-quest-play.js überspringt in der Speed-Ladder ein
 * Pokémon ohne Spezies-Treffer mit `continue`. Ein Sechser-Team zeigt dann
 * vier Zeilen, und nichts wird rot.
 *
 * Dieser Test ist die Bedingung, unter der der Builder überhaupt speichern
 * darf: JEDER der 353 Slugs muss auf einen echten Eintrag zeigen — und zwar
 * auf den RICHTIGEN. Beides wird geprüft, denn "löst auf" und "löst korrekt
 * auf" sind zwei verschiedene Zusagen: die Regeln allein hätten
 * basculegion-female auf die Werte des Männchens geschickt (Ang 112 statt 92).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const lies = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

const DEX = JSON.parse(lies('data/pokemon_battle_data.json'));
const USAGE = JSON.parse(lies('data/champions_usage.json')).pokemon;
const SLUGS = Object.keys(USAGE);

// Das Modul in einer eigenen Sandbox laden — es hängt sich an `window`.
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(lies('js/champions-names.js'), sandbox);
const CN = sandbox.window.ChampionsNames;

describe('Champions-Namen: jeder Slug findet seine Spezies', () => {
    it('das Modul hängt sich an window.ChampionsNames', () => {
        assert.ok(CN && typeof CN.zuShowdown === 'function');
    });

    it('alle 353 Nutzungs-Slugs lösen auf — kein einziger fällt durch', () => {
        const fehlend = SLUGS.filter(s => !CN.zuShowdown(s, DEX));
        assert.deepEqual(fehlend, [],
            `diese Slugs finden keine Spezies und würden beim Speichern still `
            + `aus der Speed-Ladder fallen: ${fehlend.slice(0, 12).join(', ')}`);
    });

    it('die Auflösung zeigt auf einen Eintrag MIT Basiswerten', () => {
        // Ein Treffer ohne baseStats hilft nicht: app-side-quest-play.js prüft
        // `!spec || !spec.baseStats` und überspringt beides gleich.
        const ohne = SLUGS.filter(s => {
            const e = DEX[CN.zuShowdown(s, DEX)];
            return !e || !e.baseStats;
        });
        assert.deepEqual(ohne, []);
    });

    it('es sind wirklich 353 — der Test darf nicht auf eine leere Liste laufen', () => {
        assert.ok(SLUGS.length > 300, `nur ${SLUGS.length} Slugs geladen`);
    });
});

describe('Champions-Namen: die Fälle, in denen die Regel danebengriffe', () => {
    // Jeder dieser Slugs hätte ohne Ausnahmeeintrag ein ANDERES Pokémon
    // getroffen oder gar keins. Deshalb stehen sie hier einzeln.
    const ERWARTET = {
        'kommo-o':                 'Kommo-o',
        'mr-rime':                 'Mr. Rime',
        'basculegion-female':      'Basculegion-F',
        'basculegion-male':        'Basculegion',
        'meowstic-female':         'Meowstic-F',
        'morpeko-hangry-mode':     'Morpeko-Hangry',
        'maushold-family-of-four': 'Maushold-Four',
    };

    Object.entries(ERWARTET).forEach(([slug, ziel]) => {
        it(`${slug} → ${ziel}`, () => {
            assert.equal(CN.zuShowdown(slug, DEX), ziel);
        });
    });

    it('die weibliche Basculegion trägt NICHT die Werte des Männchens', () => {
        // Der teuerste Einzelfall: Angriff 92 gegen 112. Wer hier danebengreift,
        // rechnet den halben Schaden falsch.
        const w = DEX[CN.zuShowdown('basculegion-female', DEX)].baseStats;
        const m = DEX[CN.zuShowdown('basculegion-male', DEX)].baseStats;
        assert.notEqual(w.atk, m.atk, 'beide Formen zeigen auf denselben Eintrag');
        assert.equal(w.atk, 92);
        assert.equal(m.atk, 112);
    });
});

describe('Champions-Namen: die Regeln selbst', () => {
    it('Mega wird zum Suffix, X und Y bleiben hinten', () => {
        assert.equal(CN.zuShowdown('mega-garchomp', DEX), 'Garchomp-Mega');
        assert.equal(CN.zuShowdown('mega-charizard-x', DEX), 'Charizard-Mega-X');
        assert.equal(CN.zuShowdown('mega-charizard-y', DEX), 'Charizard-Mega-Y');
    });

    it('das Regionalpräfix wandert nach hinten', () => {
        assert.equal(CN.zuShowdown('hisuian-zoroark', DEX), 'Zoroark-Hisui');
        assert.equal(CN.zuShowdown('alolan-ninetales', DEX), 'Ninetales-Alola');
        assert.equal(CN.zuShowdown('galarian-slowking', DEX), 'Slowking-Galar');
        assert.equal(CN.zuShowdown('paldean-tauros-aqua-breed', DEX), 'Tauros-Paldea-Aqua');
    });

    it('Zierformen fallen auf die Art zurück — sie haben dieselben Werte', () => {
        assert.equal(CN.zuShowdown('alcremie-lemon-cream', DEX), 'Alcremie');
        assert.equal(CN.zuShowdown('furfrou-kabuki-trim', DEX), 'Furfrou');
        assert.equal(CN.zuShowdown('florges-blue-flower', DEX), 'Florges');
    });

    it('echte Kampfformen fallen NICHT zurück', () => {
        // Der Unterschied zur Zeile darüber ist der ganze Punkt: Aegislash
        // Klingenform hat 140 Angriff statt 50.
        assert.equal(CN.zuShowdown('aegislash-blade-forme', DEX), 'Aegislash-Blade');
        assert.equal(CN.zuShowdown('palafin-hero-form', DEX), 'Palafin-Hero');
        assert.equal(CN.zuShowdown('rotom-wash', DEX), 'Rotom-Wash');
        assert.equal(CN.zuShowdown('lycanroc-midnight-form', DEX), 'Lycanroc-Midnight');
        assert.equal(DEX['Aegislash-Blade'].baseStats.atk, 140);
        assert.equal(DEX['Aegislash'].baseStats.atk, 50);
    });

    it('ohne Treffer wird null geliefert, nicht geraten', () => {
        // Raten ist hier der schlimmere Fehler: ein falscher Name sieht in der
        // Ladder aus wie eine Zahl und ist eine.
        assert.equal(CN.zuShowdown('gibtesnicht-ueberhaupt-nicht', DEX), null);
        assert.equal(CN.zuShowdown('', DEX), null);
        assert.equal(CN.zuShowdown(null, DEX), null);
    });

    it('jede Ausnahme zeigt auf einen Eintrag, den es gibt', () => {
        Object.entries(CN.AUSNAHMEN).forEach(([slug, ziel]) => {
            assert.ok(DEX[ziel], `Ausnahme ${slug} → ${ziel} existiert nicht in der Spezies-Tabelle`);
        });
    });
});
