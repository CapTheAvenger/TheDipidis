/**
 * Die Brücke zwischen den drei Champions-Namensräumen.
 *
 * BEFUND (25.08.2026, Feature-Review Team-Builder): der Team-Builder arbeitet
 * mit Nutzungs-Slugs und zeigt Teamkameraden-Namen ("Basculegion Male",
 * "Alolan Ninetales"). Alles, was ein gespeichertes Team weiterverarbeitet,
 * erwartet Showdown-Namen ("Basculegion", "Ninetales-Alola"). Gemessen:
 *
 *     von 353 Anzeigenamen (Stand 25.08.2026) fanden 152 keinen Eintrag in
 *     data/pokemon_battle_data.json
 *
 * Heute schadet das nicht — den Builder konsumiert nichts. In dem Moment, in
 * dem er ein Team speichert, bricht es an vier Stellen gleichzeitig, und zwar
 * STILL: js/app-side-quest-play.js überspringt in der Speed-Ladder ein
 * Pokémon ohne Spezies-Treffer mit `continue`. Ein Sechser-Team zeigt dann
 * vier Zeilen, und nichts wird rot.
 *
 * Die Bedingung, unter der der Builder speichern darf, lautet: JEDER Slug
 * des ausgelieferten Standes muss auf einen echten Eintrag zeigen — und zwar
 * auf den RICHTIGEN. "Löst auf" und "löst korrekt auf" sind zwei verschiedene
 * Zusagen: die Regeln allein hätten basculegion-female auf die Werte des
 * Männchens geschickt (Ang 112 statt 92).
 *
 * Geprüft wird das in ZWEI Häusern, seit dem 26.08.2026 bewusst getrennt:
 *
 *   • hier, im Deploy-Gate: die REGEL, an festen Beispielen, die unabhängig
 *     vom Tagesstand gelten müssen — Mega, Regionalform, Ausnahmeliste, die
 *     Umkehrschreibweise, und dass Unbekanntes null liefert statt zu raten.
 *   • im Data Guardian (scripts/data_guardian.py check_champions_namen):
 *     die DATEN — löst jeder Slug der heutigen Datei auf? Der Guardian führt
 *     dafür dieses Modul selbst aus, damit es nur eine Wahrheit gibt.
 *
 * Warum getrennt: die Datenzusicherung stand bis zum 26.08. hier und hing an
 * "353". An diesem Tag lieferte die Quelle 238 (rund 115 Zierformen
 * zurückgezogen), der Test fiel, und die Auslieferung stand — obwohl an der
 * Auflösung nichts kaputt war. Dieselbe Lehre wie in PR #516, einen Tag alt.
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

    // ── Was hier NICHT mehr steht, und warum ────────────────────────────
    // Bis zum 26.08.2026 stand hier "alle 353 Nutzungs-Slugs lösen auf"
    // samt `SLUGS.length > 300`. Beides hing an den Daten DIESES Tages.
    // Am 26.08. um 14:12 UTC schrieb der Scraper einen frischen Stand mit
    // 238 Einträgen (die Quelle hat ~115 Zierformen zurückgezogen) — und
    // die Auslieferung stand still, obwohl an der Auflösung nichts kaputt
    // war. Genau der Fehler, den PR #516 einen Tag vorher für die
    // Plausibilitätsprüfungen behoben hatte; ich habe ihn in #517 gleich
    // wieder eingebaut.
    //
    // Die Prüfung ist gut und hat auch etwas gefunden ('fan-rotom' war neu
    // und löste nicht auf). Sie gehört nur nicht ins Gate: sie prüft
    // DATEN, nicht CODE. Sie läuft jetzt im Data Guardian
    // (scripts/data_guardian.py check_champions_namen) — der meldet,
    // statt zu sperren. Hier bleibt, was den Code prüft: feste Beispiele,
    // die unabhängig vom Tagesstand gelten müssen.

    it('die Regel greift auf festen Beispielen — unabhängig vom Tagesstand', () => {
        const FAELLE = {
            'garchomp':                 'Garchomp',
            'hisuian-zoroark':          'Zoroark-Hisui',
            'alolan-ninetales':         'Ninetales-Alola',
            'mega-charizard-x':         'Charizard-Mega-X',
            'mega-garchomp':            'Garchomp-Mega',
            'paldean-tauros-aqua-breed':'Tauros-Paldea-Aqua',
            'rotom-wash':               'Rotom-Wash',
            // Die Quelle führt seit dem 26.08.2026 beide Richtungen im
            // selben Stand: 'rotom-fan' UND 'fan-rotom'.
            'fan-rotom':                'Rotom-Fan',
        };
        Object.keys(FAELLE).forEach(slug => {
            assert.equal(CN.zuShowdown(slug, DEX), FAELLE[slug], `${slug} löst falsch auf`);
        });
    });

    it('jeder Treffer zeigt auf einen Eintrag MIT Basiswerten', () => {
        // Ein Treffer ohne baseStats hilft nicht: app-side-quest-play.js prüft
        // `!spec || !spec.baseStats` und überspringt beides gleich. Diese
        // Zusicherung darf bleiben — sie prüft die Spezies-Tabelle, die im
        // Repo liegt, nicht den täglich wechselnden Scrape.
        const ohne = Object.keys(DEX).filter(k => !DEX[k] || !DEX[k].baseStats);
        assert.deepEqual(ohne, []);
    });

    it('was nicht auflöst, gibt null zurück statt zu raten', () => {
        // Der Vertrag der Funktion (Kommentar in js/champions-names.js):
        // der Aufrufer darf NICHT raten, also muss null kommen.
        assert.equal(CN.zuShowdown('gibtesnicht-ganzsicher', DEX), null);
        assert.equal(CN.zuShowdown('', DEX), null);
    });

    it('die Datei ist überhaupt lesbar — sonst prüft alles oben ins Leere', () => {
        assert.ok(SLUGS.length > 0, 'champions_usage.json enthält keine Pokémon');
        assert.ok(Object.keys(DEX).length > 500, 'die Spezies-Tabelle ist zu klein');
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
