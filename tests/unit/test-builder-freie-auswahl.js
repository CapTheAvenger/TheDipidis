/**
 * Team-Builder: das Suchfeld findet jedes Pokémon, nicht nur die Vorschläge.
 *
 * GEMELDET am 25.08.2026: „Ich tippe Ra für Raichu und bekomme nur Knakrack
 * und Staraptor." Ursache ist keine Suchschwäche, sondern die Datenform:
 *
 *     jede Partner-Liste in champions_usage.json hat GENAU 8 Einträge
 *
 * Das Suchfeld filterte bis dahin nur innerhalb dieser Vorschläge. Gemessen
 * über alle 353 Pokémon: **211 sind ab der ersten Wahl unerreichbar** — bei
 * einer Auswahl stehen höchstens 8 Partner zur Verfügung, bei dreien
 * höchstens 24, meist deutlich weniger nach Abzug der Überschneidungen.
 *
 * Was hier NICHT geprüft wird, ist Absicht: der zweite Block trägt kein
 * Urteil wie „wird nicht zusammen gespielt". Alle 2824 Partner-Einträge
 * haben `pct: null` und die Liste ist auf acht gedeckelt — eine Aussage über
 * Häufigkeit wäre mehr, als die Daten hergeben. Der Hinweis nennt den
 * Mechanismus (acht Plätze), nicht ein Urteil.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const lies = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const SRC = lies('js/app-side-quest-builder.js');
const USAGE = JSON.parse(lies('data/champions_usage.json')).pokemon;

/** Kommentare raus, bevor eine Zusicherung nach Code sucht — sonst stolpert
 *  der Test über die Erklärung des alten Verhaltens. */
const ohneKommentar = src => String(src)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, '$1');
const CODE = ohneKommentar(SRC);

describe('Der Befund, der die Änderung trägt', () => {
    it('jede Partner-Liste hat genau acht Plätze', () => {
        const laengen = new Set();
        Object.values(USAGE).forEach(rec => {
            ['doubles', 'singles'].forEach(f => {
                const b = rec[f];
                if (b && Array.isArray(b.teammate) && b.teammate.length) laengen.add(b.teammate.length);
            });
        });
        assert.deepEqual([...laengen], [8],
            `Partner-Listen haben Längen ${[...laengen].join('/')} — die Begründung `
            + `der freien Auswahl beruht auf der Acht`);
    });

    it('ohne freie Auswahl wären die meisten Pokémon unerreichbar', () => {
        // Nach EINER Wahl sieht der Nutzer höchstens die acht Partner dieses
        // einen Pokémon. Der Rest ist ohne freie Suche nicht erreichbar.
        const slugs = Object.keys(USAGE);
        const ersteWahl = 'hisuian-arcanine';   // der Fall aus dem Screenshot
        const mates = new Set(((USAGE[ersteWahl] || {}).doubles || {}).teammate
            ? USAGE[ersteWahl].doubles.teammate.map(t => String(t.name || '').toLowerCase().replace(/\s+/g, '-'))
            : []);
        const unerreichbar = slugs.filter(s => s !== ersteWahl && !mates.has(s));
        // KEINE feste Zahl mehr. Hier stand `> 300`, gemessen an den 353
        // Eintraegen vom 25.08.2026. Am 26.08. lieferte die Quelle 238 —
        // und dieser Test hielt die Auslieferung an, obwohl die Aussage
        // ("die Partner-Liste zeigt nur einen Bruchteil") unveraendert
        // stimmte. Der Anteil traegt die Begruendung, nicht die Stueckzahl:
        // acht Plaetze von N sind immer ein Bruchteil.
        assert.ok(slugs.length > 20, `nur ${slugs.length} Slugs geladen — Datei leer?`);
        const anteil = unerreichbar.length / slugs.length;
        assert.ok(anteil > 0.8,
            `nur ${(anteil * 100).toFixed(0)} % unerreichbar (${unerreichbar.length} von `
            + `${slugs.length}) — die Annahme der freien Auswahl stimmt nicht mehr`);
        // Auch der Beispielname stand hier fest: 'raichu', der Fall aus dem
        // Screenshot vom 25.08.2026. Am 26.08. ist Raichu selbst in die
        // Partner-Liste von Hisui-Arkani gerueckt — der gemeldete Fall hat
        // sich durch das Meta erledigt, die Begruendung nicht. Statt eines
        // Namens jetzt die Aussage dahinter: es gibt IMMER Pokémon, die man
        // nur ueber die freie Suche erreicht, und zwar viele.
        assert.ok(unerreichbar.length >= 50,
            `nur ${unerreichbar.length} Pokémon ausserhalb der Partner-Liste`);
        assert.ok(mates.size <= 8,
            `die Partner-Liste hat ${mates.size} Eintraege — mehr als acht Plaetze`);
    });
});

describe('Team-Builder: die freie Suche', () => {
    it('es gibt einen zweiten Block für Treffer ohne Überschneidung', () => {
        assert.match(CODE, /function freieTreffer\(q\)/,
            'die freie Suche fehlt — das Feld filtert wieder nur die Vorschläge');
        assert.match(CODE, /freieTreffer\(q\)/,
            'definiert, aber nie aufgerufen');
    });

    it('sie sucht über ALLE Pokémon, nicht über die Vorschläge', () => {
        const m = CODE.match(/function freieTreffer\(q\)[\s\S]*?\n    \}/);
        assert.ok(m, 'freieTreffer ist nicht lesbar');
        assert.match(m[0], /_mons\s*\n?\s*\.filter/,
            'die freie Suche läuft nicht über _mons — dann ist sie keine');
    });

    it('sie zeigt nichts doppelt und nichts bereits Gewähltes', () => {
        const m = CODE.match(/function freieTreffer\(q\)[\s\S]*?\n    \}/);
        assert.match(m[0], /inVorschlag/,
            'ein Treffer kann in beiden Blöcken stehen');
        assert.match(m[0], /sel\.has\(m\.slug\)/,
            'bereits gewählte Pokémon tauchen wieder als Vorschlag auf');
    });

    it('bei leerem Feld bleibt alles wie vorher', () => {
        const m = CODE.match(/function freieTreffer\(q\)[\s\S]*?\n    \}/);
        assert.match(m[0], /if \(!q\) return \[\];/,
            'ohne Suchbegriff würde der zweite Block alle 353 Pokémon zeigen');
    });

    it('bei vollem Team wird nichts mehr angeboten', () => {
        assert.match(CODE, /_team\.length < MAX \? freieTreffer\(q\) : \[\]/,
            'bei 6 von 6 werden weiter Vorschläge angeboten, die nichts tun');
    });

    it('der zweite Block trägt KEINEN Prozentwert', () => {
        // 0 % wäre eine Aussage über Häufigkeit, die die Daten nicht tragen.
        assert.match(CODE, /frei\.map\(c => suggBtn\(c, false\)\)/,
            'die freien Treffer bekommen einen Prozentwert angehängt');
    });
});

describe('Team-Builder: die Texte behaupten nicht mehr, als die Daten hergeben', () => {
    it('der Hinweis nennt die acht Plätze, nicht ein Urteil', () => {
        assert.match(SRC, /nur Platz für acht/,
            'der Grund für den zweiten Block steht nicht in der Oberfläche');
        assert.ok(!/wird nicht zusammen gespielt|nicht in den Team-Listen/.test(SRC),
            'der Text behauptet wieder eine Häufigkeit, die die Partner-Listen '
            + 'nicht messen (alle Einträge tragen pct: null)');
    });

    it('das alte 100-Prozent-Versprechen ist weg', () => {
        // "100 % = mit allen" las sich wie eine erreichbare Marke. Bei acht
        // Plätzen je Liste ist sie mit mehreren Wahlen praktisch unerreichbar.
        assert.ok(!/100 % = mit allen/.test(SRC));
        assert.match(SRC, /auf wie vielen Partner-Listen/);
    });

    it('beide Sprachen tragen die neuen Texte', () => {
        ['freeTitle', 'freeHint', 'freeNone'].forEach(k => {
            const treffer = SRC.split('\n').filter(z => z.indexOf(k + ':') !== -1);
            assert.equal(treffer.length, 2, `${k} fehlt in einer der beiden Sprachen`);
        });
    });
});
