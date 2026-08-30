/**
 * Champions Matchups + Rechner.
 *
 * Das Modul rechnet nicht selbst — es füttert window.ChampionsDamage.
 * Geprüft wird deshalb genau das, was hier schiefgehen kann:
 *
 *  - Matchup-Tabelle und Rechner müssen für dasselbe Paar dieselbe Zahl
 *    zeigen. Sie tun das nur, solange beide durch moveTable() gehen.
 *  - Ein Set ohne Basiswerte oder ohne Nutzungsdaten darf nicht mit
 *    Platzhaltern erscheinen, sondern gar nicht.
 *  - 66 Statuswertpunkte, höchstens 32 pro Wert — beides aus den echten
 *    Spreads der Datei abgelesen. Ein Regler, der 40 zulässt, zeigt
 *    Werte, die es im Spiel nicht gibt.
 *  - „OHKO" nur, wenn auch der niedrigste Wurf tötet.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'app-side-quest-matchups.js'), 'utf8');
const DMG = fs.readFileSync(path.join(ROOT, 'js', 'champions-damage.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'css', 'side-quest.css'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const RESOURCES = fs.readFileSync(path.join(ROOT, 'js', 'app-side-quest-resources.js'), 'utf8');

const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const DATA = {
    usage: read('champions_usage.json'),
    dex: read('champions_pokedex.json'),
    teams: read('champions_replica_teams.json'),
    res: read('champions_resources.json'),
    chart: read('champions_type_chart.json'),
    names: read('champions_names_de.json'),
};

function load(lang = 'de') {
    const sandbox = {
        console,
        document: { addEventListener() {}, getElementById: () => null, createElement: () => ({}) },
        getLang: () => lang,
        fetch: () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) }),
        BASE_PATH: 'data/',
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(DMG, sandbox);      // das Modul rechnet über ChampionsDamage
    vm.runInContext(SRC, sandbox);
    const api = sandbox._sqMatchupInternals;
    api.setData(DATA);
    return api;
}

describe('der Kader', () => {
    const api = load();
    const roster = api.setData(DATA);

    it('enthält nur Pokémon mit Basiswerten UND Nutzungsdaten', () => {
        assert.ok(roster.length > 200, `nur ${roster.length} Einträge`);
        roster.forEach(r => {
            assert.ok(r.slug, `${r.name} ohne Nutzungs-Slug`);
            assert.ok(r.types.length >= 1, `${r.name} ohne Typ`);
        });
    });

    it('lässt die 12 Nutzungsdatensätze ohne Pokédex-Eintrag weg', () => {
        const names = new Set(DATA.dex.entries.map(e => e.en));
        const orphans = Object.values(DATA.usage.pokemon).filter(p => !names.has(p.name));
        assert.ok(orphans.length > 0, 'Testannahme veraltet: keine Waisen mehr');
        const inRoster = roster.map(r => r.name);
        orphans.forEach(o => assert.equal(inRoster.indexOf(o.name), -1,
            `${o.name} hat keine Basiswerte und darf nicht im Kader stehen`));
    });

    it('sortiert nach Team-Auftritten, nicht alphabetisch', () => {
        const counts = roster.map(r => r.count);
        for (let i = 1; i < counts.length; i++) {
            assert.ok(counts[i] <= counts[i - 1], `Reihenfolge bricht bei ${roster[i].name}`);
        }
        assert.ok(roster[0].count > 0, 'der erste Eintrag hat keine Auftritte');
    });

    it('führt Basculegion genau einmal', () => {
        const hits = roster.filter(r => r.name.indexOf('Basculegion') === 0);
        assert.equal(hits.length, 1, hits.map(h => h.name).join(', '));
        assert.ok(hits[0].slug.startsWith('basculegion'));
    });
});

describe('das vorbelegte Set kommt aus den Nutzungsdaten', () => {
    const api = load();

    it('nimmt jeweils den häufigsten Eintrag', () => {
        const block = DATA.usage.pokemon['kingambit'].doubles;
        const set = api.topSet(block);
        assert.equal(set.nature, block.nature[0].name);
        assert.equal(set.ability, block.ability[0].name);
        assert.equal(set.item, block.held_item[0].name);
        assert.equal(set.moves.join('|'), block.move.slice(0, 4).map(m => m.name).join('|'));
        assert.equal(set.spread.hp, block.stat_points[0].points.hp);
    });

    it('nie mehr als vier Attacken', () => {
        Object.values(DATA.usage.pokemon).forEach(rec => {
            ['doubles', 'singles'].forEach(f => {
                if (!rec[f]) return;
                assert.ok(api.topSet(rec[f]).moves.length <= 4, rec.name);
            });
        });
    });

    it('erfindet nichts, wenn ein Block fehlt', () => {
        const set = api.topSet({});
        assert.equal(set.ability, '');
        assert.equal(set.item, '');
        assert.equal(set.moves.length, 0);
        assert.equal(api.spreadTotal(set.spread), 0);
    });
});

describe('die Statuswertpunkte bleiben im Rahmen des Spiels', () => {
    const api = load();

    it('der Rechner deckelt auch einen Spread, den die Datei nicht kennt', () => {
        // Hier stand bis zum 25.08.2026 eine Prüfung ÜBER DIE DATEI:
        // "kein echter Spread der Datei sprengt 66 / 32". Sie war
        // inhaltlich richtig und am falschen Ort. An dem Tag lieferte die
        // Quelle für Araquanid "2 HP / 173 Atk / 2 Def" — 173 Punkte, wo
        // 32 erlaubt sind — und weil diese Datei im Deploy-Gate hängt,
        // stand die ganze Auslieferung. Die Regel prüft jetzt
        // scripts/data_guardian.py (WARN) und, davor,
        // scripts/scrape_champions_usage.py (der Stand wird gar nicht
        // erst committet).
        //
        // Was hier bleibt, ist die Frage an den CODE: hält der Rechner
        // einen solchen Wert aus, wenn er trotzdem ankommt?
        const gedeckelt = api.clampSpread({ hp: 2, atk: 173, def: 2 }, 'atk', 173);
        assert.ok(gedeckelt.atk <= api.SP_MAX,
            `173 Punkte kommen ungedeckelt durch: ${JSON.stringify(gedeckelt)}`);
        assert.ok(api.spreadTotal(gedeckelt) <= api.SP_BUDGET,
            `der Spread sprengt das Budget: ${JSON.stringify(gedeckelt)}`);
    });

    it('deckelt einen einzelnen Wert bei 32', () => {
        const s = api.clampSpread({ hp: 0 }, 'hp', 99);
        assert.equal(s.hp, api.SP_MAX);
    });

    it('deckelt bei dem, was das Budget noch hergibt', () => {
        const base = { hp: 32, atk: 32, def: 0, spa: 0, spd: 0, spe: 0 };
        const s = api.clampSpread(base, 'spe', 32);
        assert.equal(s.spe, 2, 'nach 64 Punkten bleiben genau 2 übrig');
        assert.equal(api.spreadTotal(s), api.SP_BUDGET);
    });

    it('zieht dabei nirgendwo anders ab', () => {
        const base = { hp: 32, atk: 32, def: 0, spa: 0, spd: 0, spe: 0 };
        const s = api.clampSpread(base, 'spe', 32);
        assert.equal(s.hp, 32);
        assert.equal(s.atk, 32);
    });

    it('nimmt keine negativen Werte an', () => {
        assert.equal(api.clampSpread({ hp: 10 }, 'hp', -5).hp, 0);
    });
});

describe('Matchup-Zeile und Rechner können nicht auseinanderlaufen', () => {
    const api = load();

    it('die beste Attacke der Zeile ist die erste Zeile im Rechner', () => {
        api.state({ format: 'doubles', me: 'Kingambit' });
        const m = api.matchup('Sneasler');
        assert.ok(m, 'kein Matchup für Kingambit gegen Sneasler');
        const table = api.moveTable('Kingambit', m.meSet, 'Sneasler', m.oppSet);
        assert.ok(table.length > 0);
        assert.equal(m.deal.name, table[0].name);
        assert.equal(m.deal.range.min, table[0].range.min);
        assert.equal(m.deal.range.max, table[0].range.max);
    });

    it('die Gegenrichtung ist wirklich die Gegenrichtung', () => {
        api.state({ format: 'doubles', me: 'Kingambit' });
        const m = api.matchup('Sneasler');
        const back = api.moveTable('Sneasler', m.oppSet, 'Kingambit', m.meSet);
        assert.equal(m.take.name, back[0].name);
        assert.equal(m.take.range.max, back[0].range.max);
    });

    it('die Tabelle ist nach Schaden sortiert, nicht nach Nutzung', () => {
        api.state({ format: 'doubles', me: 'Kingambit' });
        const m = api.matchup('Sneasler');
        const table = api.moveTable('Kingambit', m.meSet, 'Sneasler', m.oppSet);
        for (let i = 1; i < table.length; i++) {
            assert.ok(table[i].range.max <= table[i - 1].range.max,
                `${table[i].name} steht über ${table[i - 1].name}`);
        }
    });

    it('Statusattacken tauchen gar nicht auf statt mit 0', () => {
        api.state({ format: 'doubles', me: 'Kingambit' });
        const set = { nature: 'Adamant', ability: '', item: '', moves: ['Protect', 'Iron Head'],
                      spread: { hp: 32, atk: 32, def: 0, spa: 0, spd: 1, spe: 1 } };
        const table = api.moveTable('Kingambit', set, 'Sneasler', api.matchup('Sneasler').oppSet);
        assert.equal(table.length, 1);
        assert.equal(table[0].name, 'Iron Head');
    });

    it('das gepinnte Paar aus dem Schadensmodell kommt hier genauso heraus', () => {
        api.state({ format: 'doubles', me: 'Kingambit' });
        const set = { nature: 'Adamant', ability: '', item: '', moves: ['Iron Head'],
                      spread: { hp: 32, atk: 32, def: 0, spa: 0, spd: 1, spe: 1 } };
        const opp = { nature: 'Jolly', ability: '', item: '', moves: [],
                      spread: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 } };
        const row = api.moveTable('Kingambit', set, 'Sneasler', opp)[0];
        assert.equal(row.range.min, 117);
        assert.equal(row.range.max, 138);
        assert.equal(row.range.ko.hits, 2);
        assert.equal(api.statsOf('Sneasler', opp).hp, 157);
    });

    it('ein Item, das nicht in der Formel steht, ändert nichts', () => {
        const plain = { nature: 'Adamant', ability: '', item: '', moves: ['Iron Head'],
                        spread: { hp: 32, atk: 32, def: 0, spa: 0, spd: 1, spe: 1 } };
        const sash = Object.assign({}, plain, { item: 'Focus Sash' });
        const orb = Object.assign({}, plain, { item: 'Life Orb' });
        const opp = { nature: 'Jolly', ability: '', item: '', moves: [], spread: {} };
        const a = api.moveTable('Kingambit', plain, 'Sneasler', opp)[0].range.max;
        const b = api.moveTable('Kingambit', sash, 'Sneasler', opp)[0].range.max;
        const c = api.moveTable('Kingambit', orb, 'Sneasler', opp)[0].range.max;
        assert.equal(a, b, 'Fokusgurt darf den Schaden nicht verändern');
        assert.ok(c > a, 'Leben-Orb muss ihn erhöhen');
    });
});

describe('die Aussagen über K.O. und Effektivität', () => {
    const api = load();

    it('OHKO nur ohne Wurf-Vorbehalt', () => {
        assert.equal(api.koLabel({ hits: 1, chance: 1 }), 'OHKO');
        assert.equal(api.koLabel({ hits: 1, chance: 0.75 }), 'OHKO 75 %');
        assert.equal(api.koLabel({ hits: 2, chance: 1 }), '2HKO');
        assert.equal(api.koLabel(null), '');
    });

    it('kein „5+" mehr — die Trefferzahl wird genannt', () => {
        // "5+HKO 0 %" war keine Beschriftung, sondern der Abdruck eines
        // Rechenfehlers: koChance() hoerte bei vier Treffern auf und gab
        // danach pauschal { hits: 5, chance: 0 } zurueck. Gemessen ueber
        // 21.336 Kombinationen sagten 332 Zeilen "0 %", obwohl schon der
        // NIEDRIGSTE Wurf fuenfmal toetet.
        assert.equal(api.koLabel({ hits: 5, chance: 1 }), '5HKO');
        assert.equal(api.koLabel({ hits: 7, chance: 0.5 }), '7HKO 50 %');
        assert.ok(!/5\+/.test(api.koLabel({ hits: 5, chance: 1 })));
    });

    it('und wo es keinen K.O. gibt, steht kein „0 %"', () => {
        // Eine 0 sieht aus wie eine gerechnete Wahrscheinlichkeit.
        assert.equal(api.koLabel({ hits: null, chance: 0 }), 'kein K.O.');
    });

    it('neutral wird nicht beschriftet, alles andere schon', () => {
        assert.equal(api.effLabel(1), '');
        assert.equal(api.effLabel(2), '2×');
        assert.equal(api.effLabel(4), '4×');
        assert.equal(api.effLabel(0.5), '½×');
        assert.equal(api.effLabel(0.25), '¼×');
        assert.equal(api.effLabel(0), 'immun');
    });

    it('eine Immunität liefert eine Zeile ohne K.O.-Behauptung', () => {
        api.state({ format: 'doubles', me: 'Kingambit' });
        // Brick Break, nicht Low Kick: Low Kick steht mit power 0 in der
        // Datei (gewichtsabhängig) und fällt deshalb ganz heraus.
        const me = { nature: 'Adamant', ability: '', item: '', moves: ['Brick Break'], spread: {} };
        // Kampf gegen Geist: 0×.
        const opp = { nature: 'Hardy', ability: '', item: '', moves: [], spread: {} };
        const row = api.moveTable('Kingambit', me, 'Gengar', opp)[0];
        assert.ok(row, 'Gengar fehlt im Pokédex — Testannahme prüfen');
        assert.equal(row.range.effectiveness, 0);
        assert.equal(row.range.max, 0);
        assert.equal(row.range.ko, null);
    });
});

describe('die Oberfläche sagt, was sie nicht rechnet', () => {
    it('Fähigkeiten, Wetter und Volltreffer stehen in der Fußnote', () => {
        assert.match(SRC, /noteOut:[^\n]*Fähigkeiten/);
        assert.match(SRC, /noteOut:[^\n]*Wetter/);
        assert.match(SRC, /noteOut:[^\n]*Volltreffer/);
        assert.match(SRC, /noteOut:[^\n]*abilities/);
    });

    it('das Gegner-Set ist als „meistgenutzt" ausgewiesen', () => {
        assert.match(SRC, /noteSet:[^\n]*meistgenutzte/);
    });

    it('rechnet ausschließlich über ChampionsDamage', () => {
        // Kein zweiter Schadenspfad: weder eine eigene Formel noch ein
        // eigener Wurfbereich. Die Tabelle und der Rechner erben beide
        // dieselbe Funktion.
        assert.doesNotMatch(SRC, /0\.85/, 'eigener Wurfbereich im Modul');
        assert.doesNotMatch(SRC, /Math\.floor\(\(2 \* LEVEL\)/, 'eigene Schadensformel im Modul');
        assert.match(SRC, /window\.ChampionsDamage\.damageRange/);
    });
});

describe('Verdrahtung und Darstellung', () => {
    it('Subtab, Host und Skript sind in index.html eingehängt', () => {
        assert.match(HTML, /data-sq-view="matchups"/);
        assert.match(HTML, /id="sideQuestMatchupsHost"/);
        assert.match(HTML, /js\/app-side-quest-matchups\.js\?v=/);
    });

    it('das Skript lädt nach dem Schadensmodell', () => {
        assert.ok(HTML.indexOf('js/champions-damage.js') < HTML.indexOf('js/app-side-quest-matchups.js'));
    });

    it('der Subtab-Umschalter kennt die Ansicht', () => {
        assert.match(RESOURCES, /matchups: 'sideQuestMatchupsHost'/);
        assert.match(RESOURCES, /view === 'matchups' && window\.sideQuestMatchups/);
    });

    it('die Konsolen-Ansicht blendet das Seitenbanner aus wie der Usage-Tab', () => {
        assert.match(RESOURCES, /banner\.hidden = \(view === 'usage' \|\| view === 'matchups'\)/);
    });

    it('alles bleibt auf .sq-console beschränkt', () => {
        const block = CSS.slice(CSS.indexOf('Champions Matchups + Rechner'));
        const selectors = block.match(/^\.sq-[\w-]+/gm) || [];
        assert.deepEqual(selectors.filter(s => s !== '.sq-console'), [],
            'ein Selektor greift außerhalb von .sq-console');
    });

    it('die Reiterleiste bricht um, statt die Seite breiter zu machen', () => {
        // Mit dem siebten Reiter war die Leiste 626px breit und machte
        // main.tabs-container auf 390px waagerecht scrollbar — die ganze
        // Seite ließ sich verschieben, ohne dass ein Regler sichtbar war.
        //
        // 30.08.2026: der Reiter "Kampfdaten" ist raus — er öffnete
        // dasselbe Modal wie "Pokémon", zeigte also zweimal dieselben
        // Daten. Damit sind es sechs. Der Umbruch bleibt trotzdem
        // Pflicht: sechs Reiter passen auf 390px ebenfalls nicht in
        // eine Zeile, und der nächste Reiter kommt bestimmt.
        const tabs = (HTML.match(/data-sq-view="/g) || []).length;
        assert.ok(tabs >= 6, `nur ${tabs} Reiter — Testannahme prüfen`);
        assert.match(CSS, /\.side-quest-subtabs \{[^}]*flex-wrap: wrap/);
        assert.match(CSS, /\.side-quest-subtabs \{[^}]*max-width: 100%/);
    });

    it('die Zeile bleibt tippbar (44px) und klappt auf dem Handy um', () => {
        assert.match(CSS, /\.sq-console \.sq-mu-row \{[^}]*min-height: 44px/);
        assert.match(CSS, /@media \(max-width: 760px\)[\s\S]*\.sq-mu-cell \{ grid-column: 1 \/ -1/);
    });

    it('die Spalten sind mobilsicher (minmax(0,…), kein festes min-width)', () => {
        const block = CSS.slice(CSS.indexOf('Champions Matchups + Rechner'));
        assert.match(block, /grid-template-columns: minmax\(0, 1\.25fr\) 96px/);
        // Eine feste Mindestbreite in dreistelliger Höhe ist genau das,
        // was die Archetyp-Karte auf dem Handy gesprengt hat.
        assert.doesNotMatch(block, /min-width: [3-9]\d{2}px|min-width: \d{4,}px/);
    });

    it('die Spaltenüberschrift steckt in der Zelle, damit sie mobil nicht fehlt', () => {
        assert.match(SRC, /data-lbl=/);
        assert.match(CSS, /\.sq-mu-cell::before \{[\s\S]*content: attr\(data-lbl\)/);
    });

    it('setzt keine rohen HTML-Entities in den Labels', () => {
        // esc() darf &quot; erzeugen — ein Label, das es enthält, würde
        // dem Nutzer den Entity-Text anzeigen.
        const labels = SRC.slice(SRC.indexOf('const LABELS'), SRC.indexOf('function L()'));
        assert.doesNotMatch(labels, /&quot;|&nbsp;|&amp;/);
    });

    it('lässt keine geschützten Leerzeichen im Quelltext stehen', () => {
        assert.doesNotMatch(SRC, / /, 'NBSP im Quelltext');
    });
});

describe('beide Sprachen', () => {
    it('jedes Label existiert in de und en', () => {
        const de = load('de'), en = load('en');
        assert.ok(de && en);
        const keys = (lang) => {
            const m = SRC.match(new RegExp(`\\n        ${lang}: \\{([\\s\\S]*?)\\n        \\},`));
            // Zeichenketten vorher entfernen — „Nicht gerechnet: …" sähe
            // sonst aus wie ein Label namens „gerechnet".
            const body = m[1].replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/`(?:[^`\\]|\\.)*`/g, '``');
            return (body.match(/(?:^|[\s,{])([a-zA-Z]+):/gm) || [])
                .map(s => s.replace(/[^a-zA-Z]/g, ''));
        };
        const dk = keys('de'), ek = keys('en');
        assert.ok(dk.length > 50, `nur ${dk.length} Labels`);
        assert.deepEqual(dk.filter(k => ek.indexOf(k) === -1), []);
        assert.deepEqual(ek.filter(k => dk.indexOf(k) === -1), []);
    });

    it('deutsche Attackennamen kommen aus champions_names_de.json', () => {
        assert.equal(DATA.names.moves['Iron Head'], 'Eisenschädel');
        assert.match(SRC, /localName\(best\.name, 'moves'\)/);
    });
});
