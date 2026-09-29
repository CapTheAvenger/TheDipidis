/**
 * B8 / F11.21 — der Doppel/Einzel-Umschalter im Reiter "Nutzung".
 *
 * GEMESSEN am 07.09.2026: ein Klick auf "Einzel" aenderte die Rangliste
 * nicht. Nachverfolgt:
 *
 *   * rankTeams() baut _teams aus data/champions_replica_teams.json und
 *     kennt kein Format;
 *   * _format wirkt nur in record(), also auf die Nutzungsdaten rechts;
 *   * die Datei fuehrt 110 Teams, ALLE mit format "VGC Champions", und
 *     ihr _meta.title lautet "Pokémon Champions — Current Top Doubles
 *     Teams". Eine Einzel-Rangliste gibt sie nicht her.
 *
 * Die Rangliste formatunabhaengig zu zaehlen ist also richtig. Falsch
 * war, dass der Umschalter aussah, als filtere er sie — ein Klick ohne
 * sichtbare Wirkung und ohne ein Wort dazu ist ein stiller Ausfall.
 *
 * Geprueft wird deshalb beides: dass die Liste sich (weiterhin) nicht
 * aendert UND dass die Oberflaeche sagt, warum.
 *
 * KEIN jsdom, KEINE LIVEDATEN — die Teams unten stehen in dieser Datei.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WURZEL = path.join(__dirname, '..', '..', '..');
const SRC = fs.readFileSync(path.join(WURZEL, 'js', 'app-side-quest-usage.js'), 'utf8');

const TEAMS = {
    _meta: { title: 'Current Top Doubles Teams' },
    teams: [
        { format: 'VGC Champions', pokemon: [{ name: 'Dragonite' }, { name: 'Sneasler' }] },
        { format: 'VGC Champions', pokemon: [{ name: 'Dragonite' }, { name: 'Basculegion' }] },
        { format: 'VGC Champions', pokemon: [{ name: 'Basculegion' }, { name: 'Sneasler' }] },
        { format: 'VGC Champions', pokemon: [{ name: 'Dragonite' }] }
    ]
};
const DEX = { entries: [
    { en: 'Dragonite', t1: 'Dragon', t2: 'Flying' },
    { en: 'Sneasler', t1: 'Fighting', t2: 'Poison' },
    { en: 'Basculegion', t1: 'Water', t2: 'Ghost' }
] };
const NUTZUNG = {
    _meta: { scraped_at: '2026-09-07T05:10:52+00:00' },
    pokemon: {
        dragonite: {
            doubles: { move: [{ name: 'Dragon Pulse', pct: 90 }], held_item: [], ability: [],
                       nature: [], stat_points: [], teammate: [] },
            singles: { move: [{ name: 'Extreme Speed', pct: 70 }], held_item: [], ability: [],
                       nature: [], stat_points: [], teammate: [] }
        }
    }
};

/** Das Modul in der Ersatzumgebung starten und den Reiter zeichnen. */
function zeichnen(sprache) {
    const wirt = {
        id: 'sideQuestUsageHost',
        innerHTML: '',
        hidden: false,
        _hoerer: {},
        querySelectorAll: () => []
    };
    const dok = {
        readyState: 'complete',
        getElementById: (id) => (id === 'sideQuestUsageHost' ? wirt : null),
        addEventListener() {}
    };
    const dateien = {
        'champions_usage.json': NUTZUNG,
        'champions_pokedex.json': DEX,
        'champions_replica_teams.json': TEAMS
    };
    const sb = {
        console: { warn() {} },
        Math, Date, Number, String, Array, Object, JSON, Boolean, Error,
        parseInt, parseFloat, isNaN, Promise, RegExp, setTimeout,
        document: dok,
        BASE_PATH: 'data/',
        getLang: () => (sprache || 'de'),
        fetch: (pfad) => {
            const name = String(pfad).split('/').pop().split('?')[0];
            const j = dateien[name];
            return Promise.resolve({ ok: !!j, json: () => Promise.resolve(j) });
        }
    };
    sb.window = sb;
    vm.createContext(sb);
    vm.runInContext(SRC, sb, { filename: 'app-side-quest-usage.js' });
    sb.window.sideQuestUsage.activate();
    return { wirt, sb };
}

async function fertig(sprache) {
    const u = zeichnen(sprache);
    // load() haengt an zwei Promise-Ebenen; zwei Ticks reichen.
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));
    return u;
}

/** Die Namen der Rangliste in der gezeichneten Reihenfolge. */
function rangliste(html) {
    return [...html.matchAll(/data-sq-mon="([^"]+)"/g)].map(m => m[1]);
}

describe('B8/F11.21 — der Umschalter sagt, worauf er wirkt', () => {
    it('die Rangliste ist dieselbe in Doppel und Einzel — das ist der Befund', async () => {
        const u = await fertig();
        const doppelt = rangliste(u.wirt.innerHTML);
        assert.ok(doppelt.length >= 3, 'die Liste wurde gar nicht gezeichnet');

        // Umschalten wie ein Klick es tut.
        u.sb.window._sqUsageInternals.setFormat
            ? u.sb.window._sqUsageInternals.setFormat('singles')
            : null;
        assert.ok(typeof u.sb.window._sqUsageInternals.setFormat === 'function',
            'ohne einen Weg, das Format von aussen zu setzen, laesst sich der Umschalter '
            + 'nicht ausfuehren — dann prueft dieser Test nur noch Text');
        const einzeln = rangliste(u.wirt.innerHTML);
        assert.deepEqual(einzeln, doppelt,
            'die Daten geben keine Formattrennung her; aendert sich die Liste doch, '
            + 'ist eine Rangfolge entstanden, die in champions_replica_teams.json nicht steht');
    });

    it('und die Ansicht sagt genau das, statt es den Leser raten zu lassen', async () => {
        const u = await fertig();
        const html = u.wirt.innerHTML;
        assert.match(html, /Rangliste bleibt gleich/,
            'ein Umschalter ohne sichtbare Wirkung und ohne ein Wort dazu ist ein stiller '
            + 'Ausfall. Gezeichnet: ' + html.slice(0, 400));
        assert.match(html, /Doppelkampf-Teams/,
            'es muss dastehen, WORAUS die Rangliste kommt');
        assert.match(html, /Nutzungsdaten/,
            'und WORAUF der Umschalter dann wirkt');
    });

    it('die Herkunft der Rangliste steht SICHTBAR im Kopf, nicht nur im title', async () => {
        /* Der Satz in `formatWirkung` steht im title des Umschalters —
         * erreichbar nur mit der Maus. Die Herkunftsangabe selbst
         * ("Rangliste aus Doppelkampf-Teams") steht als eigener Text im
         * Kopf neben der Anzahl. Ohne diese Zusicherung liesse sie sich
         * entfernen, ohne dass ein Test rot wird: die uebrigen Proben
         * greifen auch auf dem title-Satz, in dem dieselben Woerter
         * vorkommen. */
        const u = await fertig();
        const kopf = u.wirt.innerHTML.match(/<span class="sq-meta">([^<]*)<\/span>/);
        assert.ok(kopf, 'der Kopf der Liste hat keine sq-meta-Zeile mehr');
        assert.match(kopf[1], /Rangliste aus Doppelkampf-Teams/,
            'die Zeile sagt nicht, WORAUS die Rangfolge stammt: ' + JSON.stringify(kopf[1]));
        assert.match(kopf[1], /^\d+ Pokémon · /,
            'die Anzahl und die Herkunft gehoeren in dieselbe Zeile: ' + JSON.stringify(kopf[1]));
    });

    it('und auf Englisch dieselbe Herkunftsangabe auf Englisch', async () => {
        const u = await fertig('en');
        const kopf = u.wirt.innerHTML.match(/<span class="sq-meta">([^<]*)<\/span>/);
        assert.ok(kopf, 'der Kopf der Liste hat keine sq-meta-Zeile mehr');
        assert.match(kopf[1], /ranking from doubles teams/, JSON.stringify(kopf[1]));
        assert.ok(!/Rangliste/.test(kopf[1]), 'deutscher Satz im englischen Modus');
    });

    it('der Hinweis steht auch am Kopf der Liste, nicht nur im Titel', async () => {
        const u = await fertig();
        assert.match(u.wirt.innerHTML, /class="sq-note"/,
            'ein title-Attribut allein erreicht niemanden, der nicht mit der Maus '
            + 'darueber faehrt');
    });

    it('auf Englisch ebenso', async () => {
        const u = await fertig('en');
        const html = u.wirt.innerHTML;
        assert.match(html, /ranking\s+stays the same/);
        assert.match(html, /doubles teams/);
        assert.ok(!/Rangliste bleibt gleich/.test(html), 'deutscher Satz im englischen Modus');
    });

    it('die Nutzungsdaten rechts folgen dem Umschalter wirklich', async () => {
        // Die Gegenprobe: der Umschalter ist nicht wirkungslos, er wirkt
        // nur woanders. Ohne diese Zusicherung koennte man ihn ausbauen,
        // und der neue Hinweis waere trotzdem gruen.
        const u = await fertig();
        assert.match(u.wirt.innerHTML, /Dragon Pulse/, 'Doppelkampf-Attacke fehlt');
        u.sb.window._sqUsageInternals.setFormat('singles');
        assert.match(u.wirt.innerHTML, /Extreme Speed/,
            'im Einzelkampf muessen die Einzelkampf-Daten stehen');
        assert.ok(!/Dragon Pulse/.test(u.wirt.innerHTML),
            'die Doppelkampf-Daten stehen noch da');
    });
});
