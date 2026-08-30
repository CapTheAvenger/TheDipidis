/**
 * Der Reiter "Teams" unter Side Quest blieb leer — gemessen live am
 * 26.08.2026 auf thedipidis.app: data/champions_replica_teams.json war
 * mit 81 Teams geladen, window.sideQuest.render() zeichnete auf Zuruf
 * sofort vier Kindknoten, und trotzdem stand im DOM ein leerer
 * <div id="sideQuestTeamsHost"> mit 0 Kindern.
 *
 * Ursache, in einem Satz: der Teams-Renderer war der einzige, den
 * niemand aufrief.
 *
 *   1. js/app-core.js switchTab() hat für jeden datengetriebenen Tab
 *      einen Fall im switch — city-league, current-meta, cards, proxy,
 *      meta-call. Für 'side-quest' gab es keinen.
 *   2. js/app-side-quest.js hängt sein render() stattdessen an
 *      DOMContentLoaded und an einen Klick auf ein Element mit
 *      data-tab-id="side-quest". Der Deep-Link #side-quest aktiviert den
 *      Tab aber programmatisch (inline-init.js applyHash läuft auf
 *      'app:ui-ready', also NACH DOMContentLoaded) — kein Klick, kein
 *      render.
 *   3. js/app-side-quest-resources.js showView() aktiviert jede
 *      Unteransicht (usage, matchups, pokedex, battle, builder,
 *      resources) — nur 'teams' hatte keinen Zweig. Wer von "Nutzung"
 *      zurückwechselte, sah denselben leeren Kasten.
 *
 * Diese Tests halten alle drei Stellen fest.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const CORE = fs.readFileSync(path.join(ROOT, 'js', 'app-core.js'), 'utf8');
const RES  = fs.readFileSync(path.join(ROOT, 'js', 'app-side-quest-resources.js'), 'utf8');
const SQ   = fs.readFileSync(path.join(ROOT, 'js', 'app-side-quest.js'), 'utf8');

describe('Side Quest: der Teams-Reiter wird tatsächlich gezeichnet', () => {

    it('switchTab kennt side-quest und ruft den Renderer', () => {
        // Der switch-Block in switchTab(), nicht irgendein 'side-quest'
        // weiter unten in der Datei.
        const start = CORE.indexOf('function switchTab(tabName)');
        assert.ok(start > -1, 'switchTab nicht gefunden');
        const block = CORE.slice(start, start + 4000);
        assert.match(block, /case 'side-quest':/,
            'switchTab hat keinen Fall für side-quest — der Deep-Link #side-quest zeichnet dann nichts');
        const fall = block.slice(block.indexOf("case 'side-quest':"));
        assert.match(fall.slice(0, 1200), /window\.sideQuest[\s\S]{0,600}\.render\(\)/,
            'der Fall existiert, ruft aber nicht window.sideQuest.render()');
    });

    it('showView aktiviert die Teams-Ansicht wie jede andere', () => {
        const start = RES.indexOf('function showView(view)');
        assert.ok(start > -1);
        const block = RES.slice(start, start + 3000);
        assert.match(block, /view === 'teams'/,
            "showView hat keinen Zweig für 'teams' — der Rückweg aus einer anderen Unteransicht bleibt leer");
        const zweig = block.slice(block.indexOf("view === 'teams'"));
        assert.match(zweig.slice(0, 600), /window\.sideQuest[\s\S]{0,300}\.render\(\)/);
    });

    it('jede Unteransicht mit eigenem Modul wird auch aktiviert', () => {
        // Der eigentliche Fehler war nicht "teams vergessen", sondern
        // "eine Liste ohne Gegenprobe". Diese Zusicherung zieht die
        // Gegenprobe ein: wer eine Ansicht hinzufügt, muss sie
        // aktivieren.
        const start = RES.indexOf('function showView(view)');
        // Nur die Aktivierungskette pruefen. Weiter oben in showView
        // steht eine Bannerzeile mit view === 'usage' || view ===
        // 'matchups' — die wuerde zwei Ansichten faelschlich als
        // "aktiviert" durchgehen lassen.
        const kette = RES.indexOf("if (view === 'teams')", start);
        assert.ok(kette > -1, 'die Aktivierungskette beginnt nicht mit teams');
        const block = RES.slice(kette, kette + 2500);
        const hostsStart = RES.indexOf('const VIEW_HOSTS');
        const hosts = RES.slice(hostsStart, RES.indexOf('}', hostsStart));
        const ansichten = [...hosts.matchAll(/^\s*(\w+):/gm)].map(m => m[1]);
        // Sechs seit dem 30.08.2026: "Kampfdaten" ist entfernt, weil es
        // dasselbe Detail-Modal öffnete wie "Pokémon". Diese Schranke ist
        // nur die Gegenprobe zur Erkennung — fällt sie auf 0 oder 1,
        // greift die Schleife darunter ins Leere und winkt alles durch.
        assert.ok(ansichten.length >= 6, `nur ${ansichten.length} Ansichten erkannt`);
        for (const v of ansichten) {
            assert.match(block, new RegExp(`view === '${v}'`),
                `Ansicht '${v}' wird in showView nie aktiviert — sie bliebe leer`);
        }
    });

    it('der Renderer ist öffentlich, sonst kann ihn niemand aufrufen', () => {
        const exp = SQ.match(/window\.sideQuest\s*=\s*\{([\s\S]{0,300}?)\}/);
        assert.ok(exp, 'window.sideQuest wird gar nicht gesetzt');
        assert.match(exp[1], /(^|[\s,{])render\s*[,}]/,
            'window.sideQuest.render fehlt — die beiden Aufrufer oben liefen ins Leere');
    });
});
