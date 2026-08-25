/**
 * Kein Scraper-Lauf kontrolliert sein eigenes Ergebnis —
 * Gruppe 3 der Pruefrunde vom 20.08.2026.
 *
 * Halbe Ergebnisse landen unbemerkt in data/ und damit im Browser. Zwei
 * Faelle sind hier behoben, und beide sind Zahlen, die nicht sein koennen:
 *
 *   * Acht Item-Listen summieren sich auf bis zu 139,1 %. Ein Pokemon
 *     traegt genau EIN Item. In jeder dieser Listen steht an Position 6
 *     exakt 53,9 % — bei fuenf verschiedenen Items. Ein konstanter Wert
 *     an fester Position ueber neun unabhaengige Pokemon ist keine
 *     Nutzungszahl.
 *   * Sechs Wesens-Listen fuehren dieselbe Zeile zweimal.
 *
 * Der richtige Wert steht nur an der Quelle, und die ist aus dem Repo
 * heraus nicht nachpruefbar. Er wird deshalb NICHT geraten: der
 * unmoegliche Wert wird auf unbekannt gesetzt und die Liste markiert.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const USAGE = JSON.parse(lies('data/champions_usage.json'));

const SUMMEN_KATEGORIEN = ['held_item', 'nature', 'ability'];
const GRENZE = 105;

function* bloecke() {
    for (const [name, e] of Object.entries(USAGE.pokemon || {})) {
        for (const fmt of ['doubles', 'singles']) {
            if (e[fmt] && typeof e[fmt] === 'object') yield [name, fmt, e[fmt]];
        }
    }
}

// ───────────────────────────────────────────────────────────────────
// 1. Die Daten selbst — steht seit dem 25.08.2026 NICHT mehr hier
// ───────────────────────────────────────────────────────────────────
//
// Bis dahin prüfte dieser Block die ausgelieferte champions_usage.json
// auf unmögliche Zahlen: Anteilslisten über 105 %, doppelte Zeilen,
// genullte Ausreißer. Inhaltlich war das richtig. Der Ort war es nicht.
//
// Am 25.08.2026 lieferte die Quelle zum ersten Mal seit 39 Tagen wieder
// Daten, und die trugen 16 Listen über 105 %, zwei doppelte
// Attackenzeilen und einen Spread mit 173 Angriffspunkten. Weil diese
// Datei im Deploy-Gate hängt, standen daraufhin DREI Deploys
// hintereinander — auch für alles, was mit Champions nichts zu tun hat.
// Dasselbe Muster hatte am Morgen desselben Tages schon einmal die ganze
// Auslieferung angehalten (Champions-Teamzahl, PR #509).
//
// Ein Datenthema an einer Fremdquelle gehört gemeldet, nicht in eine
// Sperre. Die Prüfung liegt jetzt an zwei Stellen, und beide sind
// besser als diese hier:
//
//   * scripts/scrape_champions_usage.py → unmoegliche_bloecke()
//     verweigert einen solchen Stand, BEVOR er committet wird.
//   * scripts/data_guardian.py → check_champions_usage()
//     meldet täglich, was trotzdem in data/ liegt — als WARN.
//
// Beide sind in tests/python/ abgesichert. Was hier bleibt, sind
// Prüfungen am CODE (Abschnitt 2 und 3) — die gehören ins Gate, weil
// sie nicht von Tagesdaten abhängen.

// ───────────────────────────────────────────────────────────────────
// 1a. Der Renderer muss mit einem genullten Anteil umgehen können
// ───────────────────────────────────────────────────────────────────
describe('Ein unbekannter Anteil bricht die Oberfläche nicht', () => {
    it('pct == null wird als "keine Zahl" gerendert, nicht als leer', () => {
        // Das ist die Voraussetzung dafür, dass Nullen statt Raten
        // überhaupt geht — eine Prüfung am Code, nicht an den Daten.
        const PD = lies('js/app-side-quest-pokedex.js');
        assert.ok(/a\.pct != null \? escapeHtml\(fmtPct\(a\.pct\)\) : ''/.test(PD)
            || /s\.pct != null \? escapeHtml\(fmtPct\(s\.pct\)\) : ''/.test(PD),
            'der Renderer setzt einen fehlenden Anteil nicht mehr auf leer');
    });
});

// ───────────────────────────────────────────────────────────────────
// 2. Die Selbstkontrolle im Scraper
// ───────────────────────────────────────────────────────────────────
describe('Der Scraper prüft sein eigenes Ergebnis', () => {
    const SRC = lies('scripts/scrape_champions_usage.py');

    it('pruefe_plausibel wird beim Bauen jedes Blocks aufgerufen', () => {
        assert.ok(/def pruefe_plausibel\(block\):/.test(SRC));
        assert.ok(/\n    pruefe_plausibel\(out\)\n/.test(SRC),
            'die Prüfung ist definiert, aber nicht verdrahtet');
    });

    it('sie erkennt den Ausreißer an der gebrochenen Sortierung, nicht an der Summe', () => {
        // Der Unterschied ist nicht kosmetisch. Bei Passimian (128,2 %)
        // rettet AUCH das Entfernen des führenden Choice Scarf (23,3 %)
        // die Summe — und ein führender Anteil von 23 % ist normal. Nur
        // die Sortierung zeigt eindeutig auf die 53,9 an Position 6.
        assert.ok(/ausserDerReihe/.test(SRC),
            'die Erkennung läuft wieder allein über die Summe');
        assert.ok(/Passimian|Choice Scarf/.test(SRC),
            'die Begründung für die Sortier-Erkennung fehlt im Code');
    });

    it('sie rät keinen Ersatzwert', () => {
        const a = SRC.indexOf('def pruefe_plausibel(block):');
        const b = SRC.indexOf('\ndef ', a + 10);
        const fn = SRC.slice(a, b > a ? b : undefined);
        assert.ok(/schuld\["pct"\] = None/.test(fn),
            'der unmögliche Wert wird nicht auf unbekannt gesetzt');
        assert.ok(!/= *100\.0 *- *summe/.test(fn),
            'hier wird wieder ein Ersatzwert gerechnet');
    });

    it('und sie meldet jeden Eingriff im Lauf-Bericht', () => {
        assert.ok(/print\("      ! " \+ " \| "\.join\(meldungen\)\)/.test(SRC),
            'ein stiller Eingriff ist genauso schlimm wie ein stiller Fehler');
    });

    it('Attacken und Teamkameraden werden nicht auf 100 % geprüft', () => {
        // Ein Pokémon hat vier Attacken — diese Anteile summieren sich auf
        // rund 400 %. Eine Prüfung darauf wäre dauerhaft rot.
        assert.ok(/SUMMEN_KATEGORIEN = \("held_item", "nature", "ability"\)/.test(SRC));
    });
});

// ───────────────────────────────────────────────────────────────────
// 3. Das Netz darunter
// ───────────────────────────────────────────────────────────────────
describe('data_guardian fängt ab, was der Scraper nicht kennt', () => {
    const G = lies('scripts/data_guardian.py');

    it('die Champions-Prüfung ist verdrahtet', () => {
        assert.ok(/def check_champions_usage\(findings\):/.test(G));
        assert.ok(/\n    check_champions_usage\(findings\)\n/.test(G),
            'definiert, aber nie aufgerufen');
    });

    it('CRITICAL nur, wenn der Scraper NICHT markiert hat', () => {
        // Die Unterscheidung trägt die Stufe. OHNE Markierung hat die
        // Erkennung des Scrapers die Form nicht erkannt — die Quelle hat
        // sich verändert, das ist kritisch. MIT Markierung wusste er
        // Bescheid; ist die Liste dann immer noch zu hoch, war es nicht
        // ein Ausreißer, sondern die ganze Liste. Gemeldet, kein Notfall.
        assert.ok(/\(unmarkiert if not block\.get\("_warnungen"\)/.test(G),
            'die Trennung zwischen markiert und unmarkiert ist weg');
        assert.ok(/else trotz_marke\)/.test(G),
            'der Fall "markiert und trotzdem zu hoch" fällt wieder unter den Tisch');
    });

    it('INFO-Befunde werden jetzt auch ausgegeben', () => {
        // Sie wurden gesammelt und nie gedruckt. Zwei Prüfungen melden auf
        // dieser Stufe; beide waren stumm.
        assert.ok(/info = \[f for lvl, f in findings if lvl == "INFO"\]/.test(G));
        assert.ok(/print\(f"::notice::\{f\}"\)/.test(G));
        assert.ok(/INFO: \{len\(info\)\}/.test(G));
    });

    it('er kennt die drei Regeln, die aus dem Spiel kommen', () => {
        // Bis zum 25.08.2026 stand hier stattdessen ein Lauf des
        // Guardians mit der Forderung, er möge auf dem AKTUELLEN
        // Datenstand schweigen. Das war wieder eine Datenprüfung im
        // Deploy-Gate: an dem Tag fand der Guardian zu Recht etwas, und
        // die Auslieferung stand. Geprüft wird jetzt, dass die Regeln im
        // Guardian VERDRAHTET sind — ob sie heute anschlagen, ist eine
        // Frage an die Daten und gehört in seinen täglichen Bericht.
        assert.ok(/sum to more than/.test(G),
            'die Summenregel fehlt im Guardian');
        assert.ok(/carry the same row twice/.test(G),
            'die Regel gegen doppelte Zeilen fehlt im Guardian');
        assert.ok(/SP_BUDGET, SP_MAX = 66, 32/.test(G),
            'die Spread-Regel (66 Punkte / 32 je Wert) fehlt im Guardian');
        assert.ok(/still above/.test(G),
            'eine trotz Markierung zu hohe Liste wird nicht gemeldet');
    });

    it('und die Spread-Regel trägt dieselben Zahlen wie der Rechner', () => {
        // Laufen sie auseinander, meldet der Guardian Spreads, die die
        // Oberfläche klaglos anzeigt — oder schweigt zu solchen, die sie
        // abschneidet.
        const M = lies('js/app-side-quest-matchups.js');
        assert.match(M, /const SP_MAX = 32;/);
        assert.match(M, /const SP_BUDGET = 66;/);
        assert.match(lies('scripts/scrape_champions_usage.py'), /SP_BUDGET = 66/);
        assert.match(lies('scripts/scrape_champions_usage.py'), /SP_MAX = 32/);
    });
});

// ───────────────────────────────────────────────────────────────────
// 4. Die Vergangenheit pausiert nicht
// ───────────────────────────────────────────────────────────────────
describe('Saisonpause und fehlender Schnappschuss sind zwei Zustände', () => {
    const CL = lies('js/app-city-league.js');
    const NAV = lies('js/ds-nav.js');

    it('der Ausweis bekommt nicht mehr unbedingt "pause"', () => {
        assert.ok(!/setSpaceFacts\(\{ pause: true \}, 'jp'\)/.test(CL),
            'pause:true wird wieder für beide Fenster gesetzt');
        assert.ok(/istVergangenheit\s*\n?\s*\? \{ pause: false, luecke: true \}/.test(CL),
            'die Vergangenheit bekommt keinen eigenen Zustand');
    });

    it('und ds-nav kennt den zweiten Zustand in beiden Sprachen', () => {
        assert.match(NAV, /luecke: 'Schnappschuss fehlt — nicht erhoben'/);
        assert.match(NAV, /luecke: 'Snapshot missing — never collected'/);
        assert.ok(/else if \(facts\.luecke\)/.test(NAV),
            'der Zustand ist definiert, wird aber nie gerendert');
    });

    it('der Text sagt es auch', () => {
        assert.ok(/Die Vergangenheit pausiert nicht/.test(CL));
        assert.ok(/The past does not pause/.test(CL));
    });
});
