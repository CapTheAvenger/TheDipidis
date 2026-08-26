/**
 * Team-Builder: der Schreibpfad.
 *
 * Bis zum 26.08.2026 endete der Builder bei der Auswahl. Die Frage des
 * Nutzers — "wie kann ich ein Team im Team Builder jetzt anpassen und live
 * setzen? irgendwie wurde nichts umgesetzt" — war schlicht richtig:
 * js/app-side-quest-builder.js exportierte genau `activate`, das gewaehlte
 * Team lebte in einer Modulvariablen und verliess das Modul nie. Kein
 * Speichern, kein Export, keine Uebergabe an die Speed-Leiter.
 *
 * Diese Zusicherungen halten die Kette fest, an der es haengt:
 *   Slug → Vorgabebau → Team-Objekt → Speicher → Export.
 * Jedes Glied hat schon einmal jemanden gekostet, deshalb steht jedes
 * einzeln hier.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const lies = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const BUILDER = lies('js/app-side-quest-builder.js');
const SQ = lies('js/app-side-quest.js');

// Ein Beispielstand, bewusst von Hand: der Test darf nicht davon abhaengen,
// was die Quelle heute liefert. Genau daran ist der Deploy am 26.08. zweimal
// haengengeblieben.
const RAW = {
    garchomp: {
        doubles: {
            move: [{ name: 'Dragon Claw', pct: 88.3 }, { name: 'Earthquake', pct: 84.2 },
                   { name: 'Rock Slide', pct: 80.4 }, { name: 'Protect', pct: 79.1 },
                   { name: 'Poison Jab', pct: 10.8 }],
            held_item: [{ name: 'Life Orb', pct: 69.1 }, { name: 'Sitrus Berry', pct: 9.3 }],
            ability: [{ name: 'Rough Skin', pct: 98.2 }, { name: 'Sand Veil', pct: 1.8 }],
            nature: [{ name: 'Jolly', pct: 71.2 }, { name: 'Adamant', pct: 26.4 }],
            stat_points: [{ evs: '2 HP / 32 Atk / 32 Spe', pct: 45.7,
                            points: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 } }],
            teammate: [{ name: 'Kingambit', pct: null }],
        },
    },
    // Ein Pokémon ohne jede Nutzungszeile — der Vorgabebau muss leer bleiben
    // und darf nichts erfinden.
    kartana: { doubles: {} },
};
const DEX = {
    Garchomp: { baseStats: { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 } },
    Kartana:  { baseStats: { hp: 59, atk: 181, def: 131, spa: 59, spd: 31, spe: 109 } },
};

// Objekte aus der VM-Sandbox tragen deren Prototypen; assert/strict
// vergleicht die mit. Ueber JSON zurueckholen, dann vergleicht der Test den
// INHALT, was hier gemeint ist.
const rein = v => JSON.parse(JSON.stringify(v));

function ladeBuilder() {
    const sandbox = {
        window: {}, document: { addEventListener() {}, getElementById: () => null },
        console, fetch: () => Promise.reject(new Error('kein Netz im Test')),
        setTimeout, Date,
    };
    sandbox.window.document = sandbox.document;
    vm.createContext(sandbox);
    vm.runInContext(lies('js/champions-set.js'), sandbox);
    vm.runInContext(lies('js/champions-names.js'), sandbox);
    vm.runInContext(BUILDER, sandbox);
    return sandbox.window;
}

describe('Team-Builder: aus Slugs werden Baeue', () => {
    it('der Vorgabebau nimmt jeweils die Spitze der Nutzungsliste', () => {
        const w = ladeBuilder();
        w._sqBuilderInternals.setState(['garchomp'], RAW, DEX, {});
        const set = w._sqBuilderInternals.standardSet('garchomp');
        assert.equal(set.ability, 'Rough Skin');
        assert.equal(set.item, 'Life Orb');
        assert.equal(set.nature, 'Jolly');
        assert.deepEqual(rein(set.moves), ['Dragon Claw', 'Earthquake', 'Rock Slide', 'Protect']);
        assert.deepEqual(rein(set.sp), { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 });
    });

    it('ohne Nutzungsdaten bleibt der Bau leer statt geraten', () => {
        // Hausregel aus CLAUDE.md: melden, nicht erfinden. Ein ausgedachtes
        // Item sieht richtig aus und ist falsch.
        const w = ladeBuilder();
        w._sqBuilderInternals.setState(['kartana'], RAW, DEX, {});
        const set = w._sqBuilderInternals.standardSet('kartana');
        assert.equal(set.ability, '');
        assert.equal(set.item, '');
        assert.equal(set.nature, '');
        assert.deepEqual(rein(set.moves), []);
        assert.deepEqual(rein(set.sp), { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
    });

    it('der Bau traegt den Showdown-Namen, nicht den Anzeigenamen', () => {
        // Das war der ganze Zweck von js/champions-names.js: die Bruecke
        // greift BEIM SCHREIBEN. Ohne sie faellt das Pokémon spaeter still
        // aus der Speed-Leiter (app-side-quest-play.js: `continue`).
        const w = ladeBuilder();
        const raw = Object.assign({}, RAW, { 'hisuian-zoroark': { doubles: {} } });
        const dex = Object.assign({}, DEX, { 'Zoroark-Hisui': { baseStats: {} } });
        w._sqBuilderInternals.setState(['hisuian-zoroark'], raw, dex, {});
        const set = w._sqBuilderInternals.standardSet('hisuian-zoroark');
        assert.equal(set.showdown, 'Zoroark-Hisui');
        assert.equal(set.sicher, true);
    });

    it('ein Name, der nicht aufloest, wird markiert statt verschwiegen', () => {
        const w = ladeBuilder();
        w._sqBuilderInternals.setState(['gibtsnicht'], { gibtsnicht: { doubles: {} } }, DEX, {});
        const set = w._sqBuilderInternals.standardSet('gibtsnicht');
        assert.equal(set.sicher, false, 'ein unaufgeloester Name muss sich zu erkennen geben');
    });
});

describe('Team-Builder: das Team-Objekt', () => {
    it('hat die Form, die der Teams-Reiter liest', () => {
        const w = ladeBuilder();
        w._sqBuilderInternals.setState(['garchomp'], RAW, DEX, {});
        const { mons } = w._sqBuilderInternals.alsTeamObjekt();
        assert.equal(mons.length, 1);
        const m = mons[0];
        // Dieselben Schluessel wie makeImportedTeam() in app-side-quest.js.
        ['name', 'item', 'ability', 'nature', 'tera_type', 'evs', 'moves']
            .forEach(k => assert.ok(k in m, `Feld ${k} fehlt`));
        assert.equal(m.name, 'Garchomp');
        assert.equal(m.evs, '2 HP / 32 Atk / 32 Spe');
    });

    it('speichert die ROHEN Champions-Punkte, nicht die Showdown-EVs', () => {
        // Die Umrechnung gehoert an den Ausgang, nicht in den Speicher:
        // sonst weiss spaeter niemand mehr, welche Einheit dasteht.
        const w = ladeBuilder();
        w._sqBuilderInternals.setState(['garchomp'], RAW, DEX, {});
        const { mons } = w._sqBuilderInternals.alsTeamObjekt();
        assert.ok(!/252/.test(mons[0].evs), 'im Speicher stehen Showdown-EVs: ' + mons[0].evs);
    });
});

describe('Team-Builder: die beiden Ausgaenge', () => {
    it('Limitless bekommt die rohen Punkte', () => {
        const w = ladeBuilder();
        w._sqBuilderInternals.setState(['garchomp'], RAW, DEX, {});
        const text = w._sqBuilderInternals.pasteText(false);
        assert.match(text, /^Garchomp @ Life Orb$/m);
        assert.match(text, /^Ability: Rough Skin$/m);
        assert.match(text, /^Level: 50$/m);
        assert.match(text, /^EVs: 2 HP \/ 32 Atk \/ 32 Spe$/m);
        assert.match(text, /^Jolly Nature$/m);
        assert.match(text, /^- Dragon Claw$/m);
    });

    it('Showdown bekommt dieselbe Verteilung mal acht', () => {
        const w = ladeBuilder();
        w._sqBuilderInternals.setState(['garchomp'], RAW, DEX, {});
        const text = w._sqBuilderInternals.pasteText(true);
        assert.match(text, /^EVs: 16 HP \/ 252 Atk \/ 252 Spe$/m,
            'die Umrechnung fehlt — Showdown spielt sonst mit einem Achtel der Werte');
    });
});

describe('Team-Builder: die Verdrahtung', () => {
    it('es gibt einen Knopf "Team setzen" und er ruft setzeTeam', () => {
        assert.match(BUILDER, /class="sqb-setzen"/);
        assert.match(BUILDER, /\.sqb-setzen'\);\s*if \(setzen\) setzen\.addEventListener\('click', setzeTeam\)/);
    });

    it('Speichern, Aktiv-Setzen und beide Exporte sind verdrahtet', () => {
        ['.sqb-do-save', '.sqb-do-active', '.sqb-exp'].forEach(sel => {
            assert.ok(BUILDER.includes(sel), `${sel} fehlt`);
        });
        assert.match(BUILDER, /data-mode="limitless"/);
        assert.match(BUILDER, /data-mode="showdown"/);
    });

    it('der Editor bietet Wesen, Item, Faehigkeit, vier Attacken und sechs Regler', () => {
        assert.match(BUILDER, /class="sqb-ability"/);
        assert.match(BUILDER, /class="sqb-item"/);
        assert.match(BUILDER, /class="sqb-nature"/);
        assert.match(BUILDER, /\[0, 1, 2, 3\]\.map/, 'es sind nicht vier Attackenfelder');
        assert.match(BUILDER, /CSx\.KEYS\.map/, 'die Regler kommen nicht aus den sechs Statuswerten');
        assert.match(BUILDER, /type="range"[^>]*max="\$\{CSx\.SP_MAX\}"/);
    });

    it('das Budget wird beim Schieben geklemmt, nicht nur angezeigt', () => {
        // Ohne clampSpread beim input-Ereignis zeigt der Regler 32 und der
        // Bau traegt 12 — die Anzeige luege.
        assert.match(BUILDER, /st\.sp = CSx\.clampSpread\(roh\)/);
    });
});

describe('Der Weg in den Speicher', () => {
    it('saveImported meldet Fehlschlaege, statt sie zu schlucken', () => {
        // Vorher: `try { … } catch (_) {}`. Safari im privaten Fenster wirft
        // hier immer; das Team stand da und war nach dem Neuladen weg.
        const start = SQ.indexOf('function saveImported(');
        assert.ok(start > -1);
        const block = SQ.slice(start, start + 500);
        assert.match(block, /return true;/);
        assert.match(block, /return false;/);
        assert.doesNotMatch(block, /catch \(_\) \{\}/, 'der leere catch ist zurueck');
    });

    it('der Builder hat einen Eingang: addImportedTeam', () => {
        assert.match(SQ, /window\.sideQuest = \{[\s\S]{0,400}addImportedTeam/);
        assert.match(BUILDER, /api\.addImportedTeam\(mons, name\)/);
        // und er wertet die Antwort aus, statt Erfolg anzunehmen
        assert.match(BUILDER, /if \(res && res\.ok\)/);
        assert.match(BUILDER, /melde\(l\.speichernFehler, 'error'\)/);
    });

    it('genau ein Team kann aktiv sein', () => {
        // Ein eigener Schluessel mit EINEM Code darin — per Konstruktion
        // kann es nie zwei aktive Teams geben.
        assert.match(SQ, /ACTIVE_KEY = 'dipidis\.sideQuest\.activeTeam\.v1'/);
        assert.match(SQ, /function setActiveTeam\(code\)/);
        assert.match(SQ, /localStorage\.setItem\(ACTIVE_KEY, String\(code\)\)/);
        assert.match(SQ, /window\.sideQuest = \{[\s\S]{0,400}setActiveTeam/);
    });

    it('ein Replica-Team laesst sich als eigenes uebernehmen — mit eigenem Code', () => {
        assert.match(SQ, /function copyAsOwn\(team\)/);
        const start = SQ.indexOf('function copyAsOwn(');
        const block = SQ.slice(start, start + 900);
        assert.match(block, /addImportedTeam\(mons/,
            'die Kopie geht nicht durch addImportedTeam — dann behaelt sie den fremden Code');
        assert.match(SQ, /data-copyown-code=/);
    });

    it('"Meine Teams" steht immer da, auch leer', () => {
        // Vorher verschwand der Block ohne eigene Teams — und damit der
        // einzige Hinweis darauf, dass es eigene Teams gibt.
        const start = SQ.indexOf('const myTeamsHtml');
        const block = SQ.slice(start, start + 900);
        assert.doesNotMatch(block.split('\n')[0], /importedShown\.length \?/,
            'der Block haengt wieder an der Anzahl');
        assert.match(block, /myTeamsEmpty/);
    });
});
