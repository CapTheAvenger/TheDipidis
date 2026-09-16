/**
 * DER SCHADENSRECHNER ALS FEATURE — die Kampflage.
 *
 * ANLASS (Betreiber, 16.09.2026): „alter, der Damage Culc ist ja immer
 * noch nicht fertig und als Feature verfuegbar. was machst du hier die
 * ganze Zeit".
 *
 * Zu Recht. Der Rechenkern konnte seit dem Umbau Wetter, Gelaende,
 * Schirme, Statusstufen, Verbrennung und Volltreffer — die Oberflaeche
 * hatte fuer NICHTS davon ein Feld. Gerechnet wurde also immer die
 * nackte Grundlage, und an den Rest kam niemand heran. Ein Rechner, der
 * nur einen einzigen Zustand rechnen kann, ist kein Rechner.
 *
 * Diese Datei prueft deshalb nicht, dass die Felder DA sind, sondern
 * dass ein gesetztes Feld die ZAHL veraendert — und zwar in die
 * richtige Richtung. Ein Regler, der nichts bewirkt, ist schlimmer als
 * kein Regler: er behauptet eine Rechnung.
 *
 * KEINE LIVEDATEN, KEIN jsdom.
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

const stripJs = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/.*$/gm, '$1');
const stripCss = s => s.replace(/\/\*[\s\S]*?\*\//g, '');
const SRC_C = stripJs(SRC);
const CSS_C = stripCss(CSS);

const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const DATA = {
    usage: read('champions_usage.json'),
    dex: read('champions_pokedex.json'),
    teams: read('champions_replica_teams.json'),
    res: read('champions_resources.json'),
    chart: read('champions_type_chart.json'),
    names: read('champions_names_de.json'),
    flags: read('champions_move_flags.json'),
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
    vm.runInContext(DMG, sandbox);
    vm.runInContext(SRC, sandbox);
    const api = sandbox._sqMatchupInternals;
    api.setData(DATA);
    return api;
}

function rechne(api, p) {
    return api.rangeFor(p.a, p.sa, api.statsOf(p.a, p.sa),
        p.d, p.sd, api.statsOf(p.d, p.sd), p.mv);
}

/** Ein Paar aus den echten Daten, bei dem eine Attacke wirklich Schaden macht. */
function paar(api) {
    const roster = api.setData(DATA);
    const namen = roster.map(r => r.name);
    for (let i = 0; i < namen.length; i++) {
        const sa = api.teamSet('me', namen[i]);
        if (!sa) continue;
        const mv = (sa.moves || []).find(Boolean);
        if (!mv) continue;
        for (let j = 0; j < namen.length; j++) {
            if (i === j) continue;
            const sd = api.teamSet('opp', namen[j]);
            if (!sd) continue;
            const cand = { a: namen[i], d: namen[j], sa, sd, mv };
            const r = rechne(api, cand);
            if (r && r.max > 0 && r.effectiveness > 0) return cand;
        }
    }
    throw new Error('kein rechenbares Paar in den echten Daten gefunden');
}

/** Ein Paar mit einer Attacke bestimmter Art (Typ oder Schadensklasse). */
function paarMit(api, pruef) {
    const roster = api.setData(DATA);
    const namen = roster.map(r => r.name);
    for (const a of namen) {
        const sa = api.teamSet('me', a);
        if (!sa) continue;
        const mv = (sa.moves || []).find(pruef);
        if (!mv) continue;
        for (const d of namen) {
            if (d === a) continue;
            const sd = api.teamSet('opp', d);
            if (!sd) continue;
            const cand = { a, d, sa, sd, mv };
            const r = rechne(api, cand);
            if (r && r.max > 0 && r.effectiveness > 0) return cand;
        }
    }
    return null;
}

const TYP = {}, KLASSE = {};
(DATA.res.entries || []).forEach(e => {
    if (e.cat !== 'move') return;
    TYP[e.en] = e.type; KLASSE[e.en] = e.damage_class;
});

describe('Die Kampflage steht dem Nutzer zur Verfuegung', () => {
    it('ein frisches Set startet neutral — volle KP, keine Stufen, kein Status, kein Schirm', () => {
        const api = load();
        const roster = api.setData(DATA);
        const set = api.teamSet('me', roster[0].name);
        assert.ok(set, 'kein Set fuer den ersten Kadereintrag');
        assert.equal(JSON.stringify(set.boosts), JSON.stringify({ atk: 0, def: 0, spa: 0, spd: 0 }),
            'die Stufen muessen bei null starten');
        assert.equal(set.status, '', 'kein Status zu Beginn');
        assert.equal(String(set.hp), '1', 'volle KP zu Beginn');
        assert.equal(set.schirm, '', 'kein Schirm zu Beginn');
    });

    it('die Feldleiste zeichnet Wetter, Gelaende und Volltreffer', () => {
        const api = load();
        const html = api.feldHtml();
        ['data-sq-feld="wetter"', 'data-sq-feld="gelaende"', 'data-sq-feld="crit"']
            .forEach(m => assert.ok(html.indexOf(m) !== -1, `${m} fehlt in der Feldleiste`));
        // Und die Werte, die der Rechenkern wirklich versteht.
        ['value="Sun"', 'value="Rain"', 'value="Grassy"', 'value="Electric"', 'value="Psychic"']
            .forEach(m => assert.ok(html.indexOf(m) !== -1, `${m} fehlt`));
    });

    it('die Lage einer Seite zeichnet vier Stufen, Status, KP und Schirm', () => {
        const api = load();
        const roster = api.setData(DATA);
        const html = api.lageHtml('me', api.teamSet('me', roster[0].name));
        assert.equal(api.BOOST_KEYS.join(','), 'atk,def,spa,spd',
            'Initiative gehoert nicht in die Schadensregler');
        api.BOOST_KEYS.forEach(k =>
            assert.ok(html.indexOf(`data-sq-key="${k}"`) !== -1, `Regler ${k} fehlt`));
        ['data-sq-field="status"', 'data-sq-field="hp"', 'data-sq-field="schirm"']
            .forEach(m => assert.ok(html.indexOf(m) !== -1, `${m} fehlt`));
        // Die Werte muessen die sein, die rangeFor auswertet.
        ['value="burn"', 'value="reflect"', 'value="light"', 'value="aurora"']
            .forEach(m => assert.ok(html.indexOf(m) !== -1, `${m} fehlt`));
    });

    it('der Set-Editor zeichnet die Lage wirklich mit', () => {
        /* Nicht im Quelltext gesucht, sondern gezeichnet: lageHtml()
           allein aufzurufen beweist nur, dass es die Funktion gibt —
           nicht, dass der Nutzer die Regler je zu sehen bekommt. */
        const api = load();
        const roster = api.setData(DATA);
        const name = roster[0].name;
        const html = api.setEditor('me', name, api.teamSet('me', name), 'Set');
        ['data-sq-field="boost"', 'data-sq-field="status"', 'data-sq-field="hp"',
         'data-sq-field="schirm"'].forEach(m =>
            assert.ok(html.indexOf(m) !== -1,
                `${m} fehlt im Set-Editor — die Lage waere dann unerreichbar`));
    });

    it('die Feldleiste haengt am Team-Rechner UND am Einzelrechner', () => {
        /* AUSGEFUEHRT, nicht im Quelltext gesucht: der Team-Rechner
           rechnet mit derselben Lage wie der Einzelrechner. Haette er
           keine Leiste, muesste man sie unten setzen und oben blind
           wirken lassen — die Matrix saehe dann ohne Anlass anders aus. */
        const api = load();
        const roster = api.setData(DATA);
        api.teamState({ mine: [{ name: roster[0].name }], opp: [{ name: roster[1].name }], an: true });
        const html = api.teamCalcHtml();
        ['data-sq-feld="wetter"', 'data-sq-feld="gelaende"', 'data-sq-feld="crit"'].forEach(m =>
            assert.ok(html.indexOf(m) !== -1,
                `${m} fehlt im Team-Rechner — dort rechnet die Matrix mit derselben Lage`));
    });
});

describe('Ein gesetztes Feld veraendert die Zahl', () => {
    it('Sonne hebt Feuer, Regen senkt es — und der Grundwert kommt zurueck', () => {
        /* Ein ECHTER Feuerangriff aus dem Kader, nicht irgendeine Attacke:
           beim Wetter haengt die Richtung am Typ, und ein Paar ohne
           Feuerattacke haette „Sonne aendert nichts" als Erfolg gewertet. */
        const api = load();
        const p = paarMit(api, mn => TYP[mn] === 'Fire');
        assert.ok(p, 'kein Feuerangriff im Kader gefunden — dann prueft dieser Fall nichts');
        const grund = rechne(api, p);
        api.feldState({ wetter: 'Sun' });
        const sonne = rechne(api, p);
        api.feldState({ wetter: 'Rain' });
        const regen = rechne(api, p);
        api.feldState({ wetter: '' });
        const zurueck = rechne(api, p);
        assert.ok(sonne.max > grund.max,
            `Sonne (${sonne.max}) muss Feuer ueber den Grundwert ${grund.max} heben`);
        assert.ok(regen.max < grund.max,
            `Regen (${regen.max}) muss Feuer unter den Grundwert ${grund.max} senken`);
        assert.equal(zurueck.max, grund.max,
            'das Zuruecksetzen des Wetters muss den Grundwert wiederherstellen');
    });

    it('ein Volltreffer schlaegt haerter zu als ein normaler Treffer', () => {
        const api = load();
        const p = paar(api);
        const grund = rechne(api, p);
        api.feldState({ crit: true });
        const crit = rechne(api, p);
        api.feldState({ crit: false });
        assert.ok(crit.max > grund.max,
            `Volltreffer ${crit.max} muss ueber dem normalen Treffer ${grund.max} liegen`);
        // Verfaelschungsprobe: derselbe Aufruf OHNE die Fahne darf nicht steigen.
        assert.equal(rechne(api, p).max, grund.max,
            'ohne die Fahne muss wieder der Grundwert herauskommen');
    });

    it('+2 Angriffsstufen erhoehen den Schaden, -2 senken ihn', () => {
        const api = load();
        const p = paar(api);
        const grund = rechne(api, p);
        p.sa.boosts = { atk: 2, def: 0, spa: 2, spd: 0 };
        const hoch = rechne(api, p);
        p.sa.boosts = { atk: -2, def: 0, spa: -2, spd: 0 };
        const runter = rechne(api, p);
        p.sa.boosts = { atk: 0, def: 0, spa: 0, spd: 0 };
        assert.ok(hoch.max > grund.max, `+2 (${hoch.max}) muss ueber ${grund.max} liegen`);
        assert.ok(runter.max < grund.max, `-2 (${runter.max}) muss unter ${grund.max} liegen`);
        assert.equal(rechne(api, p).max, grund.max, 'zurueck auf null ergibt den Grundwert');
    });

    it('ein Schirm auf der VERTEIDIGENDEN Seite senkt den Schaden — auf der eigenen nicht', () => {
        const api = load();
        const p = paar(api);
        const grund = rechne(api, p);
        p.sd.schirm = 'reflect';
        const mitReflektor = rechne(api, p);
        p.sd.schirm = 'light';
        const mitLicht = rechne(api, p);
        p.sd.schirm = '';
        p.sa.schirm = 'reflect';
        const mitAtt = rechne(api, p);
        p.sa.schirm = '';
        /* Reflektor wirkt nur gegen physische Attacken, Lichtschild nur
           gegen spezielle — welcher von beiden greift, haengt an der
           Attacke des Paares. Mindestens einer MUSS greifen. */
        assert.ok(mitReflektor.max < grund.max || mitLicht.max < grund.max,
            'weder Reflektor noch Lichtschild auf der Verteidigerseite senken die Zahl');
        assert.equal(mitAtt.max, grund.max,
            'ein Schirm auf der ANGREIFERSEITE darf den eigenen Schaden nicht aendern');
    });

    it('Verbrennung halbiert physischen Schaden — speziellen nicht', () => {
        /* Die Attacke muss PHYSISCH sein, sonst waere „Verbrennung aendert
           nichts" ein bestandener Fall. Die Gegenprobe faehrt denselben
           Weg mit einer speziellen Attacke: dort darf sich nichts aendern. */
        const api = load();
        const phys = paarMit(api, mn => KLASSE[mn] === 'Physical');
        assert.ok(phys, 'keine physische Attacke im Kader gefunden');
        const gPhys = rechne(api, phys);
        phys.sa.status = 'burn';
        const bPhys = rechne(api, phys);
        phys.sa.status = '';
        assert.ok(bPhys.max < gPhys.max,
            `Verbrennung muss physischen Schaden senken (${bPhys.max} statt ${gPhys.max})`);
        assert.equal(rechne(api, phys).max, gPhys.max, 'ohne Status wieder der Grundwert');

        const spez = paarMit(api, mn => KLASSE[mn] === 'Special');
        assert.ok(spez, 'keine spezielle Attacke im Kader gefunden');
        const gSpez = rechne(api, spez);
        spez.sa.status = 'burn';
        const bSpez = rechne(api, spez);
        spez.sa.status = '';
        assert.equal(bSpez.max, gSpez.max,
            'Verbrennung darf speziellen Schaden nicht anfassen');
    });

    it('die Rechnung sagt, WOMIT sie gerechnet hat', () => {
        const api = load();
        const p = paar(api);
        const r = rechne(api, p);
        assert.ok(Array.isArray(r.angewendet), 'angewendet muss eine Liste sein');
        assert.ok(Array.isArray(r.unbelegt), 'unbelegt muss eine Liste sein');
    });
});

describe('Der Satz „Nicht gerechnet" ist eine Tatsachenbehauptung', () => {
    /* Regel aus CLAUDE.md (13.09.2026): ein Oberflaechentext, der eine
       Tatsache ueber die Datenlage behauptet, braucht eine Zusicherung,
       die ihn GEGEN DIE WIRKLICHKEIT haelt — nicht gegen sich selbst.
       Bis zum 16.09.2026 stand unter dem Rechner „Nicht gerechnet:
       Faehigkeiten, Wetter, Felder, Statusveraenderungen, Volltreffer",
       waehrend der Kern all das laengst konnte. Alle Suiten waren gruen:
       geprueft war, DASS der Satz vorkommt — nicht, OB er stimmt.

       Der Bezug zur Wirklichkeit ist hier nicht behauptet, sondern
       gemessen: die Proben oben weisen fuer Wetter, Volltreffer, Stufen,
       Schirm und Status nach, dass sie die Zahl veraendern. Was dort
       wirkt, darf hier nicht als „nicht gerechnet" stehen. */
    const WIRKSAM = {
        de: ['Wetter', 'Volltreffer', 'Statusstufen', 'Schirm', 'Fähigkeiten', 'Gelände'],
        en: ['weather', 'critical', 'stat stages', 'screens', 'abilities', 'terrain'],
    };

    ['de', 'en'].forEach(lang => {
        it(`was nachweislich wirkt, steht nicht im „nicht gerechnet" (${lang})`, () => {
            const api = load(lang);
            const html = api.noteHtml();
            const i = html.indexOf(lang === 'de' ? 'Nicht gerechnet' : 'Not calculated');
            assert.ok(i !== -1, 'der Satz „nicht gerechnet" fehlt ganz');
            const schwanz = html.slice(i);
            WIRKSAM[lang].forEach(w => assert.ok(schwanz.toLowerCase().indexOf(w.toLowerCase()) === -1,
                `„${w}" steht unter „nicht gerechnet", obwohl die Probe oben nachweist, `
                + 'dass es die Zahl veraendert'));
        });
    });

    it('der Satz nennt trotzdem etwas — sonst besteht die Regel darueber leer', () => {
        /* Gemessen wird NUR der Abschnitt zwischen „Nicht gerechnet" und
           dem naechsten Satz. Ohne diese Eingrenzung wuerde der Nachsatz
           ueber das Gegner-Set die Laenge tragen, und ein leergeraeumtes
           „Nicht gerechnet:" bliebe gruen — genau die Blindheit, gegen
           die diese ganze Gruppe steht. */
        const api = load();
        const html = api.noteHtml();
        const i = html.indexOf('Nicht gerechnet');
        const j = html.indexOf('Das Gegner-Set', i);
        assert.ok(i !== -1 && j > i, 'die beiden Saetze stehen nicht in dieser Reihenfolge');
        const abschnitt = html.slice(i + 'Nicht gerechnet:'.length, j).trim();
        assert.ok(abschnitt.length > 15,
            `nach „Nicht gerechnet" steht nur „${abschnitt}" — dann prueft die Regel `
            + 'darueber nichts');
    });
});

describe('Die Oberflaeche zeigt, was gerechnet wurde', () => {
    it('unter der Tabelle steht die Zusammenfassung', () => {
        assert.ok(SRC_C.indexOf('sq-calc-fuss') !== -1,
            'die Fusszeile der Schadenstabelle fehlt');
        assert.ok(SRC_C.indexOf("sammle('angewendet')") !== -1
            && SRC_C.indexOf("sammle('unbelegt')") !== -1,
            'die Fusszeile sammelt weder angewendet noch unbelegt');
    });

    it('die neuen Regeln stehen im Stylesheet', () => {
        ['.sq-feld', '.sq-lage', '.sq-boost', '.sq-calc-fuss']
            .forEach(sel => assert.ok(CSS_C.indexOf(sel) !== -1, `${sel} fehlt in side-quest.css`));
        // Gegenprobe zum Ausschneiden: es darf nicht alles weggefallen sein.
        assert.ok(CSS_C.length > CSS.length * 0.3, 'das Ausschneiden hat zu viel entfernt');
    });
});
