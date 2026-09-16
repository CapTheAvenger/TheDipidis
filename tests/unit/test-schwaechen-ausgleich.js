/**
 * „GLEICHT SCHWAECHEN AUS" — der zweite Vorschlagsblock im Team-Builder.
 *
 * ANLASS (Betreiber, 16.09.2026): „bei passt dazu haben wir weiterhin nur
 * die Pokemon die damit gespielt werden, sollte nicht noch dazu kommen
 * vorschlag nach Pokemon die die Schwächen ausgleichen".
 *
 * WAS HIER WIRKLICH SCHIEFGEHEN KANN — und deshalb geprueft wird:
 *
 *  - EINE BEHAUPTUNG OHNE DECKUNG. Der Block sagt „schlaegt 6 von 8".
 *    Steht in `gegen` auch nur ein Gegner, den der Vorschlag NICHT
 *    schlaegt, ist die Zahl falsch und der Nutzer baut danach. Geprueft
 *    wird deshalb jede einzelne Zusage gegen dieselbe Rechnung — in
 *    BEIDE Richtungen, damit auch nichts fehlt.
 *  - EIN WIDERSPRUCH IN SICH. „A schlaegt B" und „B schlaegt A" duerfen
 *    nie gleichzeitig gelten.
 *  - EINE STILLE LUECKE. 17 der 264 Arten der Nutzungsanalyse stehen
 *    nicht im Pokedex und koennen deshalb weder Bedrohung noch
 *    Ausgleicher sein. Wird das nicht BENANNT, sieht die Liste
 *    vollstaendig aus und ist es nicht.
 *  - EIN UNBRAUCHBARES RANGLISTENKRITERIUM. Nach „schlaegt wie viele
 *    meiner Pokemon" allein stand Hydrapple (2 Teamlisten) vor
 *    Incineroar (154). Richtig gezaehlt, als Empfehlung wertlos.
 *
 * ECHTE DATEN, KEINE ERFUNDENEN. Kein jsdom.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const DMG = fs.readFileSync(path.join(ROOT, 'js', 'champions-damage.js'), 'utf8');
const SW = fs.readFileSync(path.join(ROOT, 'js', 'champions-schwaechen.js'), 'utf8');
const BUILDER = fs.readFileSync(path.join(ROOT, 'js', 'app-side-quest-builder.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'css', 'side-quest.css'), 'utf8');
const INDEX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const stripJs = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/.*$/gm, '$1');
const stripCss = s => s.replace(/\/\*[\s\S]*?\*\//g, '');
const BUILDER_C = stripJs(BUILDER);
const CSS_C = stripCss(CSS);

const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const USAGE = read('champions_usage.json');
const DEX = read('champions_pokedex.json');
const RES = read('champions_resources.json');
const FLAGS = read('champions_move_flags.json');
const CHART = read('champions_type_chart.json');

function laden() {
    const sandbox = { console, window: null };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(DMG, sandbox);
    vm.runInContext(SW, sandbox);
    const CD = sandbox.ChampionsDamage;
    const SWx = sandbox.ChampionsSchwaechen;
    const moves = {};
    (RES.entries || []).forEach(e => {
        if (e.cat !== 'move') return;
        const m = (FLAGS.attacken || {})[e.en] || {};
        moves[e.en] = Object.assign({}, e, {
            flags: m.flags || [], recoil: !!m.recoil, zusatzeffekt: !!m.zusatzeffekt,
        });
    });
    const chart = CD.makeChart(CHART);
    const kader = SWx.baueKader(USAGE.pokemon, DEX.entries, moves, chart);
    return { SW: SWx, kader, chart };
}

function builderApi() {
    const sandbox = {
        console,
        document: { addEventListener() {}, getElementById: () => null, querySelector: () => null },
        getLang: () => 'de',
        fetch: () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) }),
        setTimeout: (fn) => fn,
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(BUILDER, sandbox);
    return sandbox._sqBuilderInternals;
}

describe('Der Kader — was drin ist und was fehlt', () => {
    it('baut sich aus den echten Daten und nennt die Luecke beim Namen', () => {
        const { kader } = laden();
        assert.ok(kader.liste.length > 200,
            `nur ${kader.liste.length} Arten im Kader — da ist etwas nicht angekommen`);
        assert.ok(Array.isArray(kader.ohneDex), 'ohneDex muss eine Liste sein');
        // Die Summe muss aufgehen: was drin ist plus was fehlt = alles.
        assert.equal(kader.liste.length + kader.ohneDex.length,
            Object.keys(USAGE.pokemon).length,
            'Kader + Luecke ergeben nicht die Zahl der Arten in der Nutzungsdatei');
    });

    it('jede Art in ohneDex fehlt wirklich im Pokedex — die Gegenprobe zur Liste', () => {
        const { kader } = laden();
        const namenImDex = new Set((DEX.entries || []).map(e => e.en));
        kader.ohneDex.forEach(slug => {
            const u = USAGE.pokemon[slug] || {};
            const hatBlock = !!u.doubles;
            assert.ok(!hatBlock || !namenImDex.has(u.name),
                `${slug} (${u.name}) steht im Pokedex und gehoert nicht in die Luecke`);
        });
    });

    it('jeder Eintrag traegt Werte, Typen und hoechstens vier Attacken', () => {
        const { kader } = laden();
        kader.liste.forEach(b => {
            assert.ok(b.stats && b.stats.hp > 0, `${b.slug} ohne KP`);
            assert.ok(b.types.length >= 1 && b.types.length <= 2,
                `${b.slug} hat ${b.types.length} Typen`);
            assert.ok(b.moves.length <= 4, `${b.slug} hat ${b.moves.length} Attacken`);
        });
    });
});

describe('„A schlaegt B" ist eine Aussage, die sich pruefen laesst', () => {
    it('schlaegt ist niemals in beide Richtungen wahr', () => {
        const { SW, kader, chart } = laden();
        const slugs = Object.keys(kader.bySlug).slice(0, 40);
        const merk = new Map();
        let paare = 0;
        for (let i = 0; i < slugs.length; i++) {
            for (let j = i + 1; j < slugs.length; j++) {
                const a = kader.bySlug[slugs[i]], b = kader.bySlug[slugs[j]];
                const ab = SW.schlaegt(a, b, chart, merk);
                const ba = SW.schlaegt(b, a, chart, merk);
                assert.ok(!(ab && ba), `${a.slug} und ${b.slug} schlagen sich gegenseitig`);
                paare++;
            }
        }
        assert.ok(paare > 500, `nur ${paare} Paare geprueft — zu wenig fuer eine Aussage`);
    });

    it('wer gar nicht trifft, schlaegt nicht', () => {
        const { SW, kader, chart } = laden();
        const merk = new Map();
        const ohne = kader.liste.find(b => b.moves.length === 0);
        if (!ohne) return;   // alle haben Attacken — dann ist nichts zu zeigen
        const irgendwer = kader.liste.find(b => b.slug !== ohne.slug);
        assert.equal(SW.schlaegt(ohne, irgendwer, chart, merk), false,
            'ein Pokemon ohne Angriffsattacke kann niemanden schlagen');
    });
});

describe('Die Auswertung haelt, was die Zahl behauptet', () => {
    it('leere Auswahl ergibt leeres Ergebnis — nicht die halbe Rangliste', () => {
        const { SW, kader } = laden();
        const e = SW.analyse(kader, []);
        assert.equal(e.drohungen.length, 0);
        assert.equal(e.ausgleicher.length, 0);
    });

    it('jede Zusage „schlaegt X" haelt der Nachrechnung stand', () => {
        const { SW, kader, chart } = laden();
        const team = ['rillaboom'];
        assert.ok(kader.bySlug[team[0]], 'Testpokemon fehlt in den Daten');
        const e = SW.analyse(kader, team);
        assert.ok(e.drohungen.length > 0,
            'Rillaboom allein verliert gegen niemanden — unglaubwuerdig');
        assert.ok(e.ausgleicher.length > 0, 'niemand gleicht etwas aus — unglaubwuerdig');
        const merk = new Map();
        e.ausgleicher.forEach(a => {
            assert.equal(a.n, a.gegen.length, `${a.slug}: n und gegen passen nicht zusammen`);
            // Beide Richtungen: nichts Falsches drin, nichts Richtiges fehlt.
            e.drohungen.forEach(d => {
                const schlaegt = SW.schlaegt(kader.bySlug[a.slug], kader.bySlug[d.slug], chart, merk);
                assert.equal(schlaegt, a.gegen.indexOf(d.slug) !== -1,
                    `${a.slug} gegen ${d.slug}: Liste und Rechnung widersprechen sich`);
            });
        });
    });

    it('jede Bedrohung schlaegt wirklich ein Pokemon der Auswahl', () => {
        const { SW, kader, chart } = laden();
        const e = SW.analyse(kader, ['rillaboom', 'incineroar']);
        const merk = new Map();
        e.drohungen.forEach(d => {
            assert.equal(d.wen, d.opfer.length, `${d.slug}: wen und opfer passen nicht zusammen`);
            d.opfer.forEach(o => {
                assert.ok(SW.schlaegt(kader.bySlug[d.slug], kader.bySlug[o], chart, merk),
                    `${d.slug} gilt als Bedrohung fuer ${o}, schlaegt ihn aber nicht`);
            });
        });
    });

    it('die Auswahl selbst taucht weder als Bedrohung noch als Ausgleicher auf', () => {
        const { SW, kader } = laden();
        const team = ['rillaboom', 'incineroar', 'garchomp'];
        const e = SW.analyse(kader, team);
        team.forEach(s => {
            assert.ok(!e.drohungen.some(d => d.slug === s), `${s} bedroht sich selbst`);
            assert.ok(!e.ausgleicher.some(a => a.slug === s), `${s} gleicht sich selbst aus`);
        });
    });

    it('die Zahl der Bedrohungen bleibt unter der Kappe', () => {
        const { SW, kader } = laden();
        const e = SW.analyse(kader, ['rillaboom']);
        assert.ok(e.drohungen.length <= SW.KAPPE_DROHUNG,
            `${e.drohungen.length} Bedrohungen, erlaubt sind ${SW.KAPPE_DROHUNG}`);
        const klein = SW.analyse(kader, ['rillaboom'], { kappe: 3 });
        assert.ok(klein.drohungen.length <= 3, 'die Kappe aus opts wird nicht beachtet');
    });

    it('die Bedrohungen sind nach Gewicht sortiert, nicht nach blosser Zahl', () => {
        const { SW, kader } = laden();
        const e = SW.analyse(kader, ['rillaboom', 'incineroar', 'garchomp',
            'amoonguss', 'landorus-therian']);
        assert.ok(e.drohungen.length >= 2, 'zu wenige Bedrohungen fuer eine Sortierprobe');
        for (let i = 1; i < e.drohungen.length; i++) {
            assert.ok(e.drohungen[i - 1].gewicht >= e.drohungen[i].gewicht,
                `Platz ${i} (${e.drohungen[i].slug}, Gewicht ${e.drohungen[i].gewicht}) steht `
                + `vor einem schwereren (${e.drohungen[i - 1].slug}, `
                + `${e.drohungen[i - 1].gewicht})`);
        }
        // Und das Gewicht ist wirklich das Produkt, nicht die blosse Zahl.
        e.drohungen.forEach(d => assert.equal(d.gewicht, d.wen * d.verbreitung,
            `${d.slug}: Gewicht ist nicht wen × verbreitung`));
    });

    it('die Ausgleicher sind nach Deckung sortiert', () => {
        const { SW, kader } = laden();
        const e = SW.analyse(kader, ['rillaboom']);
        for (let i = 1; i < e.ausgleicher.length; i++) {
            assert.ok(e.ausgleicher[i - 1].n >= e.ausgleicher[i].n,
                'die Ausgleicher stehen nicht nach Deckung sortiert');
        }
    });
});

describe('Der Block im Builder', () => {
    it('steht IM RENDERER unter „Passt dazu", nicht darueber', () => {
        /* Verglichen wird innerhalb von render(), nicht ueber die ganze
           Datei: die Funktionen stehen in anderer Reihenfolge als ihre
           Aufrufe, und die Reihenfolge, die der Nutzer sieht, ist die
           der Aufrufe. */
        const start = BUILDER_C.indexOf('function render()');
        const ende = BUILDER_C.indexOf('function wire(host)');
        assert.ok(start !== -1 && ende > start, 'render() nicht gefunden');
        const rumpf = BUILDER_C.slice(start, ende);
        const iSugg = rumpf.indexOf('suggestionsHtml(l)');
        const iGleich = rumpf.indexOf('gleichHtml(l)');
        assert.ok(iSugg !== -1, '„Passt dazu" wird im Renderer nicht gezeichnet');
        assert.ok(iGleich !== -1, '„Gleicht Schwaechen aus" wird im Renderer nicht gezeichnet');
        assert.ok(iSugg < iGleich,
            '„Gleicht Schwaechen aus" wird vor „Passt dazu" gezeichnet');
    });

    it('rechnet NACH dem Zeichnen, nicht darin', () => {
        // 536-622 ms je Auswertung (gemessen 16.09.2026). Im Renderpfad
        // waere das eine halbe Sekunde Stillstand bei jedem Tastendruck.
        const rumpf = BUILDER_C.slice(BUILDER_C.indexOf('function gleichRechnen'),
            BUILDER_C.indexOf('function gleichInnenHtml'));
        assert.ok(/setTimeout\(/.test(rumpf),
            'gleichRechnen rechnet synchron — das blockiert das Zeichnen');
        assert.ok(/gleichRechnen\(host\);/.test(BUILDER_C),
            'render() stoesst die Rechnung nicht an');
    });

    it('zeigt ohne Ergebnis einen Zwischenstand und behauptet nichts', () => {
        const api = builderApi();
        api.setState(['rillaboom'], USAGE.pokemon, {}, {});
        api.setGleich({ liste: [], bySlug: {}, ohneDex: [] }, null);
        const l = { gleichAus: 'AUS', gleichRechnet: 'RECHNE', gleichKeine: 'KEINE',
            gleichNiemand: 'NIEMAND', gleichVerliert: 'VERLIERT',
            gleichWen: (n, v) => `${n}/${v}`, gleichLuecke: (a, b) => `${a}/${b}` };
        assert.ok(api.gleichInnenHtml(l).indexOf('RECHNE') !== -1,
            'ohne Ergebnis muss „rechne …" stehen, nicht eine leere Liste');
    });

    it('„laedt noch" und „geht nicht" sind zwei verschiedene Auskuenfte', () => {
        /* Waeren sie eine, stuende waehrend des Ladens „Rechner nicht
           geladen" — eine Behauptung ueber die Datenlage, die eine
           halbe Sekunde spaeter falsch ist. */
        const l = { gleichAus: 'AUS', gleichRechnet: 'RECHNE' };
        const laedt = builderApi();
        laedt.setState(['rillaboom'], USAGE.pokemon, {}, {});
        laedt.setGleich(null, null, false);
        assert.ok(laedt.gleichInnenHtml(l).indexOf('RECHNE') !== -1,
            'waehrend des Ladens muss „rechne …" stehen');
        const aus = builderApi();
        aus.setState(['rillaboom'], USAGE.pokemon, {}, {});
        aus.setGleich(null, null, true);
        assert.ok(aus.gleichInnenHtml(l).indexOf('AUS') !== -1,
            'nach einem gescheiterten Ladeversuch muss der Block das sagen');
    });

    it('benennt die Luecke und macht den Vorschlag anklickbar', () => {
        const api = builderApi();
        api.setState(['rillaboom'], USAGE.pokemon, {}, {});
        api.setGleich(
            { liste: [{ slug: 'x' }], bySlug: {}, ohneDex: ['a', 'b'] },
            { key: 'rillaboom',
              drohungen: [{ slug: 'incineroar', name: 'Incineroar' }],
              ausgleicher: [{ slug: 'garchomp', name: 'Garchomp', n: 1, von: 1,
                  gegen: ['incineroar'] }] });
        const l = { gleichAus: 'AUS', gleichRechnet: 'RECHNE', gleichKeine: 'KEINE',
            gleichNiemand: 'NIEMAND', gleichVerliert: 'VERLIERT',
            gleichWen: (n, v) => `${n}/${v}`, gleichLuecke: (a, b) => `LUECKE ${a} von ${b}` };
        const html = api.gleichInnenHtml(l);
        assert.ok(html.indexOf('LUECKE 2 von 3') !== -1,
            'die Luecke wird nicht benannt — die Liste sieht dann vollstaendig aus');
        assert.ok(html.indexOf('VERLIERT') !== -1, 'die Bedrohungszeile fehlt');
        assert.ok(html.indexOf('data-add="garchomp"') !== -1,
            'der Vorschlag ist nicht anklickbar');
    });

    it('die Rechnung wird als Rechnung ausgewiesen, nicht als Messung', () => {
        const de = BUILDER.match(/gleichHint:[\s\S]*?',\n/);
        assert.ok(de, 'kein Hinweistext gefunden');
        const txt = de[0];
        assert.ok(/Schadensmodell/.test(txt),
            'der Hinweis nennt das Modell nicht — dann liest sich die Zahl wie ein Spielergebnis');
        assert.ok(/Siegquoten/.test(txt),
            'der Hinweis sagt nicht, dass es keine Siegquoten gibt');
    });

    it('das Stylesheet fuehrt die neuen Regeln und keine festen Farben', () => {
        ['.sqb-sec--gleich', '.sqb-gleich', '.sqb-sugg--gleich', '.sqb-gleich-luecke']
            .forEach(sel => assert.ok(CSS_C.indexOf(sel) !== -1, `${sel} fehlt`));
        const block = CSS_C.slice(CSS_C.indexOf('.sqb-sec--gleich'),
            CSS_C.indexOf('.sqb-gleich-luecke'));
        assert.ok(!/#[0-9a-fA-F]{6}/.test(block),
            'fester Farbwert im Schwaechen-Block — side-quest.css hat keinen eigenen '
            + 'Dunkelmodus, der Umschwung haengt allein an den Marken in tokens.css');
        assert.ok(CSS_C.length > CSS.length * 0.3, 'das Ausschneiden hat zu viel entfernt');
    });

    it('die Rechendatei ist in index.html eingebunden', () => {
        assert.ok(/js\/champions-schwaechen\.js\?v=/.test(INDEX),
            'js/champions-schwaechen.js fehlt in index.html — der Block bliebe leer');
    });
});
