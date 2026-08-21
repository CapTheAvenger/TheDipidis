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
const { execFileSync } = require('child_process');

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
// 1. Die Daten selbst
// ───────────────────────────────────────────────────────────────────
describe('Champions-Nutzungsdaten: keine unmoeglichen Anteile mehr', () => {
    it('keine Anteilsliste summiert sich über 105 %', () => {
        const schlimm = [];
        for (const [name, fmt, b] of bloecke()) {
            for (const kat of SUMMEN_KATEGORIEN) {
                const s = (b[kat] || []).reduce((a, x) => a + (x.pct || 0), 0);
                if (s > GRENZE) schlimm.push(`${name}/${fmt}/${kat} = ${s.toFixed(1)} %`);
            }
        }
        assert.deepEqual(schlimm, [],
            'ein Pokémon trägt ein Item und hat ein Wesen — diese Anteile können '
            + 'nicht beide stimmen');
    });

    it('keine Liste führt dieselbe Zeile zweimal', () => {
        const doppelt = [];
        for (const [name, fmt, b] of bloecke()) {
            for (const kat of ['held_item', 'nature', 'ability', 'move', 'teammate']) {
                const n = (b[kat] || []).map(x => (x.name || '').trim());
                if (n.length !== new Set(n).size) doppelt.push(`${name}/${fmt}/${kat}`);
            }
        }
        assert.deepEqual(doppelt, []);
    });

    it('die konstante 53,9 an Position 6 ist weg', () => {
        // Das war die Signatur: derselbe Wert, dieselbe Position, fünf
        // verschiedene Items.
        const treffer = [];
        for (const [name, fmt, b] of bloecke()) {
            (b.held_item || []).forEach((x, i) => {
                if (x.pct === 53.9) treffer.push(`${name}/${fmt}/${i + 1}: ${x.name}`);
            });
        }
        assert.deepEqual(treffer, []);
    });

    it('der entfernte Wert ist markiert, nicht ersetzt', () => {
        const markiert = [];
        for (const [name, fmt, b] of bloecke()) {
            for (const kat of SUMMEN_KATEGORIEN) {
                (b[kat] || []).forEach(x => {
                    if (x.unplausibel) {
                        markiert.push([name, fmt, kat, x]);
                        assert.equal(x.pct, null,
                            `${name}/${kat}: markiert, trägt aber weiter eine Zahl`);
                        assert.match(x.unplausibel, /\d/,
                            'die Markierung nennt den ursprünglichen Wert nicht');
                    }
                });
            }
        }
        assert.equal(markiert.length, 8, `erwartet werden 8 genullte Werte, gefunden ${markiert.length}`);
    });

    it('und der betroffene Block trägt eine Warnung', () => {
        let mitWarnung = 0;
        for (const [, , b] of bloecke()) if (b._warnungen && b._warnungen.length) mitWarnung++;
        assert.equal(mitWarnung, 8);
    });

    it('sonst ist nichts angefasst worden', () => {
        // Die Attackenlisten summieren sich nie auf 100 % und wurden
        // deshalb auch nicht geprüft — sie müssen unberührt sein.
        let attacken = 0, mitPct = 0;
        for (const [, , b] of bloecke()) {
            (b.move || []).forEach(x => { attacken++; if (x.pct != null) mitPct++; });
        }
        assert.ok(attacken > 2000, `nur ${attacken} Attackenzeilen — die Datei ist geschrumpft`);
        assert.ok(mitPct / attacken > 0.98, 'Attacken haben Prozentwerte verloren');
    });

    it('die Oberfläche kommt mit einem unbekannten Anteil zurecht', () => {
        // pct == null wird seit jeher als "keine Zahl" gerendert — das ist
        // die Voraussetzung dafür, dass Nullen statt Raten überhaupt geht.
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

    it('sie schlägt nur an, wenn der Scraper NICHT markiert hat', () => {
        // Sonst wäre sie dauerhaft rot für Fälle, die bereits behandelt
        // sind — und eine dauerhaft rote Prüfung liest niemand mehr.
        assert.ok(/summe > GRENZE and not block\.get\("_warnungen"\)/.test(G));
    });

    it('INFO-Befunde werden jetzt auch ausgegeben', () => {
        // Sie wurden gesammelt und nie gedruckt. Zwei Prüfungen melden auf
        // dieser Stufe; beide waren stumm.
        assert.ok(/info = \[f for lvl, f in findings if lvl == "INFO"\]/.test(G));
        assert.ok(/print\(f"::notice::\{f\}"\)/.test(G));
        assert.ok(/INFO: \{len\(info\)\}/.test(G));
    });

    it('und der Lauf ist auf dem aktuellen Datenstand sauber', () => {
        const aus = execFileSync('python3', [path.join(ROOT, 'scripts/data_guardian.py')],
            { cwd: ROOT, encoding: 'utf8' });
        assert.ok(!/champions usage list\(s\) sum to more than/.test(aus),
            'der Guardian findet unmarkierte Champions-Listen:\n' + aus);
        assert.ok(!/carry the same row twice/.test(aus),
            'der Guardian findet noch doppelte Zeilen:\n' + aus);
        assert.match(aus, /champions usage block\(s\) carry a plausibility warning/,
            'die INFO-Meldung über die markierten Blöcke fehlt');
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
