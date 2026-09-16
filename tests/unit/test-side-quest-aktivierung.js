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
        // Bis zum 30.08.2026 stand hier `start + 4000` — eine gezaehlte
        // Laenge statt einer Grenze. Ein neuer `case` davor (quellen)
        // hat side-quest aus dem Fenster geschoben, und die Zusage fiel
        // durch, obwohl der Fall unveraendert dastand. Jetzt endet der
        // Ausschnitt dort, wo der switch endet.
        const ende = CORE.indexOf('// Notify the Meta & Deck Analysis Hub', start);
        assert.ok(ende > start, 'das Ende des switch-Blocks ist nicht mehr auffindbar');
        const block = CORE.slice(start, ende);
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
        /* OHNE KOMMENTARE UND OHNE ENGE OBERGRENZE (16.09.2026).

           Das Muster suchte in den ersten 300 Zeichen hinter
           `window.sideQuest = {`. Am 16.09.2026 kam ein Eintrag mit
           erklaerendem Kommentar dazu, der Block wurde laenger als 300
           Zeichen, und die Zusicherung meldete „window.sideQuest wird
           gar nicht gesetzt" — eine Aussage, die schlicht falsch war.

           Eine Obergrenze, die an der LAENGE eines Blocks haengt,
           beschreibt nicht die Bedingung, die gemeint ist („steht
           `render` im Ausgang?"). Kommentare heraus, Grenze auf die
           erste schliessende Klammer der Ebene. */
        const ohneKommentare = SQ
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(^|[^:"'`])\/\/.*$/gm, '$1');
        assert.ok(ohneKommentare.length > SQ.length * 0.3,
            'das Ausschneiden der Kommentare hat zu viel entfernt');
        const i = ohneKommentare.indexOf('window.sideQuest = {');
        assert.ok(i !== -1, 'window.sideQuest wird gar nicht gesetzt');
        const block = ohneKommentare.slice(i, ohneKommentare.indexOf('};', i));
        assert.match(block, /(^|[\s,{])render\s*[,}]/,
            'window.sideQuest.render fehlt — die beiden Aufrufer oben liefen ins Leere');
        // Gegenprobe: der Ausschnitt endet wirklich am Ausgang und laeuft
        // nicht ueber den Rest der Datei weiter.
        assert.ok(block.length < 2000, `der Ausschnitt ist ${block.length} Zeichen lang`);
    });
});
