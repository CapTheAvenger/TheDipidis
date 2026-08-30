'use strict';
/*
 * Was sechs Prüfrunden am 30.08.2026 gefunden haben — und was davon
 * nach der Gegenprobe übrig blieb.
 *
 * Der teuerste Befund zuerst: **getPredictedField() hat die
 * Kalibrierung des Nutzers nie ausgeliefert.** `_shareList` trägt nur
 * `onlineShare`; `finalShare` entsteht ausschliesslich in buildField(),
 * und dessen Ergebnis wurde nie zurückgeschrieben. Die Prüfung
 * `typeof d.finalShare === 'number'` war toter Code.
 * Gemessen: nach `_onPersonalShare('Dragapult','40')` zeigte die
 * Tabelle 40,00 %, getPredictedField() im selben Moment 10,44 %.
 * Drei Verbraucher hingen daran — Turnierbild, "Matchups gegen Meta
 * Call" (Feldanteil UND die daraus gewichtete Win Rate), Anti-Tech.
 *
 * Und der peinlichste: **das Suchfeld über den Tiers stand im
 * Hellmodus bei 1,07:1.** Es war für einen dunklen Kartenhintergrund
 * gebaut (`color:#f4f7fb`), sitzt aber in `.ds-sec` — und die ist im
 * Hellmodus weiss. Wer einen Decknamen tippte, sah nicht, was er tippte.
 * Im Dunkelmodus war dasselbe Feld einwandfrei; deshalb ist es nie
 * aufgefallen. Nach dem Umbau: 15,67:1 hell, 14,78:1 dunkel.
 *
 * Ein Befund ist in der Gegenprobe GEFALLEN: "Top 8 Archetypes" sei
 * eine unübersetzte Pluralform. Es ist eine Entscheidung des
 * Auftraggebers ("die englischen Wörter, die in der Community benutzt
 * werden, sollten wir schon benutzen") und wird von
 * tests/unit/test-karten-und-kacheln.js bezeugt. Rückgebaut.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..', '..');
const lies = p => fs.readFileSync(path.join(wurzel, p), 'utf8');
const ohneKomm = q => q.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

/* ── Das prognostizierte Feld trägt die Kalibrierung ──────────────── */
describe('getPredictedField liefert das kalibrierte Feld', () => {
    const MC = ohneKomm(lies('js/app-meta-call.js'));
    const fn = MC.match(/function _prognostiziertesFeld\(\) \{[\s\S]*?\n  \}/)[0];

    it('fragt buildField, nicht nur _shareList', () => {
        assert.ok(/buildField\(\)/.test(fn),
            'die Funktion liest wieder nur _shareList — dort steht kein finalShare');
    });

    it('der tote Rückfallzweig ist weg', () => {
        assert.ok(!/typeof d\.finalShare === 'number' \? d\.finalShare : \(d\.onlineShare \|\| 0\)/.test(fn),
            'die Prüfung auf ein Feld, das _shareList nie trägt, ist zurück');
    });

    it('der Sammelposten wird verteilt statt weggeworfen', () => {
        // Sonst schrumpft die Liste von 131 auf die Top 25 und die
        // Feldabdeckung im Matchup-Panel bricht ein.
        assert.ok(/sammelposten/.test(fn));
        assert.ok(/_junk/.test(fn));
    });

    it('eigene Decks des Nutzers gehen nicht verloren', () => {
        assert.ok(/isCustom/.test(fn), 'Custom-Decks stehen nicht in _shareList');
    });
});

/* ── Zwei Rechenwege für eine Zeile ──────────────────────────────── */
describe('Die Spielerzahl einer Gruppe folgt ihrem Anteil', () => {
    const MC = ohneKomm(lies('js/app-meta-call.js'));

    it('totalCount ist keine Summe gerundeter Einzelwerte mehr', () => {
        // Gemessen: "23,41 %" neben "469 Spieler". 2.000 x 23,405725 %
        // sind 468; die 469 war 209+168+92, jede für sich gerundet.
        assert.ok(!/totalCount : groups\[main\]\.reduce\(\(s, d\) => s \+ d\.count, 0\)/.test(MC),
            'die Gruppenzeile summiert wieder gerundete Einzelwerte');
        assert.ok(/totalCount : Math\.round\(\(Number\(_settings\.totalPlayers\) \|\| 0\) \* totalShare \/ 100\)/.test(MC));
    });

    it('rechnerisch: 708 Antritte, drei Varianten', () => {
        const anteile = [10.439746, 8.385439, 4.580540];
        const gesamt = anteile.reduce((a, b) => a + b, 0);
        assert.equal(Math.round(2000 * gesamt / 100), 468);
        assert.equal(anteile.map(a => Math.round(2000 * a / 100)).reduce((a, b) => a + b, 0), 469);
    });
});

/* ── Zahlen in der Sprache der Seite, nicht des Browsers ─────────── */
describe('zahlLokal schreibt in der Sprache der Seite', () => {
    const UTILS = lies('js/app-utils.js');
    const bau = (sprache) => new Function('getLang',
        UTILS.match(/function zahlLokal\(wert, stellen\) \{[\s\S]*?\n\}/)[0] +
        '\nreturn zahlLokal;')(() => sprache);

    it('deutscher Tausenderpunkt', () => {
        assert.equal(bau('de')(2000), '2.000');
        assert.equal(bau('de')(1234567), '1.234.567');
    });

    it('englisches Tausenderkomma', () => {
        assert.equal(bau('en')(2000), '2,000');
    });

    it('unbrauchbare Eingaben kommen unverändert zurück', () => {
        assert.equal(bau('de')(null), '');
        assert.equal(bau('de')('abc'), 'abc');
    });

    it('nirgends mehr toLocaleString ohne Argument auf einer Zahl', () => {
        // Ohne Argument nimmt es die Sprache des BROWSERS. Wer die Seite
        // auf Deutsch liest, aber einen englischen Browser hat, sah
        // "2,000 Spieler" — ein Komma an der Stelle des Tausenderpunkts.
        for (const datei of ['js/app-meta-call.js', 'js/app-meta-cards.js', 'js/app-past-meta.js']) {
            const treffer = ohneKomm(lies(datei)).match(/\.toLocaleString\(\)/g) || [];
            assert.equal(treffer.length, 0, datei + ' hat wieder Aufrufe ohne Sprache');
        }
    });
});

/* ── Prozentzeichen ─────────────────────────────────────────────── */
describe('Das Prozentzeichen steht überall gleich', () => {
    const MC = lies('js/app-meta-call.js');

    it('_mcPz kennt beide Sprachen', () => {
        const f = new Function('getLang',
            MC.match(/function _mcPz\(\) \{[\s\S]*?\n  \}/)[0] + '\nreturn _mcPz;');
        assert.equal(f(() => 'de')(), ' %');
        assert.equal(f(() => 'en')(), '%');
    });

    it('die Empfehlungstabelle baut es nicht mehr selbst zusammen', () => {
        // In einer Zelle standen "18,9%" und "unter 20 %" nebeneinander.
        const roh = ohneKomm(MC);
        assert.ok(!/<td class="mc-rec-day2"><strong>\$\{day2Pct\}%/.test(roh));
        assert.ok(!/<td class="mc-rec-wr">\$\{wrPct\}%/.test(roh));
    });
});

/* ── Das Suchfeld über den Tiers ─────────────────────────────────── */
describe('Das Tier-Suchfeld überlebt den Hellmodus', () => {
    const CSS = lies('css/styles.css');
    const block = CSS.match(/\.tier-search-input \{[\s\S]*?\}/)[0];

    it('keine für Dunkel gebauten Festfarben mehr', () => {
        assert.ok(!/#f4f7fb/.test(block), 'die helle Schriftfarbe ist zurück');
        assert.ok(!/rgba\(255,255,255,0\.06\)/.test(block), 'der dunkle Hintergrund ist zurück');
    });

    it('Farbe und Fläche kommen aus den Tokens', () => {
        assert.match(block, /color: var\(--ink\)/);
        assert.match(block, /background: var\(--surface-2\)/);
    });

    it('Platzhalter und Löschen-Zeichen ebenso', () => {
        assert.match(CSS, /\.tier-search-input::placeholder \{ color: var\(--ink-3\); \}/);
        const clear = CSS.match(/\.tier-search-clear \{[\s\S]*?\}/)[0];
        assert.ok(!/#95a5a6/.test(clear), 'die Festfarbe des Löschen-Zeichens ist zurück');
    });

    it('und es zeigt jetzt, wo der Tastaturfokus steht', () => {
        assert.match(CSS, /\.tier-search-input:focus-visible \{/);
    });
});

/* ── Sprache ─────────────────────────────────────────────────────── */
describe('Sprache', () => {
    const I18N = lies('js/i18n.js');
    const CDB = ohneKomm(lies('js/app-cards-db.js'));
    const PM = ohneKomm(lies('js/app-past-meta.js'));
    const TIER = lies('js/app-tier-meta.js');

    const deutscherBlock = () => {
        const z = I18N.split('\n');
        const t = z.map((l, i) => [l, i]).filter(([l]) => l.includes("'cards.cityLeague'"));
        return z.slice(t[1][1]).join('\n');
    };

    it('der Kartenfilter ist übersetzt', () => {
        assert.ok(!/Tournament Formats:/.test(CDB), 'die feste englische Überschrift ist zurück');
        assert.match(CDB, /t\('cards\.tournamentFormats'\)/);
        for (const k of ['cards.energyGrass', 'cards.energyColorless']) {
            assert.equal((I18N.match(new RegExp("'" + k + "'", 'g')) || []).length, 2, k);
        }
        // Der value bleibt englisch — die Filterlogik läuft darauf.
        assert.match(CDB, /\{ value: 'Grass', label: t\('cards\.energyGrass'\)/);
    });

    it('Vergangenes Meta baut keine englischen Platzhalter mehr', () => {
        assert.ok(!/'-- All Formats --'/.test(PM));
        assert.ok(!/'-- All Tournaments --'/.test(PM));
        assert.ok(!/Loading Past Meta data/.test(PM));
    });

    it('deutsche Sätze tragen Umlaute', () => {
        assert.ok(!/'Alle uebrigen Archetypen'/.test(I18N));
        assert.ok(!/uebrigen \$\{fmtNumDS/.test(TIER));
    });

    it('deutsche Anführungszeichen werden auch geschlossen', () => {
        // Das schliessende Zeichen war ein gerades ASCII-Zoll-Zeichen.
        const schief = deutscherBlock().split('\n')
            .filter(l => l.includes('„') && l.includes('"') && !l.trim().startsWith("'audit."));
        assert.equal(schief.length, 0, 'wieder eine Zeile mit „ und geradem Anführungszeichen');
    });

    it('das Auslassungszeichen ist eines', () => {
        assert.ok(!/ellipsis\.textContent = '\.\.\.'/.test(CDB));
    });
});

/* ── Funktionen ──────────────────────────────────────────────────── */
describe('Funktionen', () => {
    const MC = ohneKomm(lies('js/app-meta-call.js'));
    const FLT = ohneKomm(lies('js/ds-filter.js'));
    const CMA = ohneKomm(lies('js/app-current-meta-analysis.js'));

    it('die Rundenzahl im Spaltenkopf wird mitgezogen', () => {
        // "Ø Begegnungen (8 R.)" blieb stehen, wenn man auf 9 Runden
        // stellte — nur der <tbody> wurde getauscht.
        assert.match(MC, /id="mc-th-enc"/);
        assert.match(MC, /const neuerKopf = tmp\.querySelector\('#mc-th-enc'\)/);
    });

    it('die Formatauswahl schreibt in beide Richtungen', () => {
        assert.match(FLT, /function horcheAufQuellen\(\)/);
        assert.match(FLT, /RAEUME\.map\(function \(r\) \{ return r\.quelle; \}\)/);
        // Auch bei jedem Neuzeichnen, weil die Felder teils erst
        // entstehen, wenn der Reiter das erste Mal geladen hat.
        assert.match(FLT, /function zeichne\(\) \{\s*\n\s*horcheAufQuellen\(\);/);
    });

    it('ein Deck ohne Partien ist kein Konsolenfehler', () => {
        assert.ok(!/console\.error\(`No HTML matchup section \+ CSV fallback failed/.test(CMA),
            'der rote Eintrag pro datenarmem Deck ist zurück und verdeckt die echten Fehler');
    });

    it('jedes Eingabefeld der Turniereinstellungen hat seine Beschriftung', () => {
        for (const id of ['mc-players', 'mc-rounds', 'mc-day2pts', 'mc-turniername', 'mc-topcut']) {
            assert.ok(new RegExp('<label for="' + id + '">').test(MC), 'label for=' + id + ' fehlt');
        }
    });
});

/* ── Daten ───────────────────────────────────────────────────────── */
describe('Datenstand', () => {
    const stand = JSON.parse(lies('data/data_stand.json'));
    const BUILD = lies('scripts/build_data_stand.py');
    const HTML = lies('index.html');

    it('alle vier leeren City-League-Dateien sind als leer gemeldet', () => {
        for (const f of ['city_league_analysis.csv', 'city_league_archetypes.csv',
                         'city_league_archetypes_comparison.csv',
                         'city_league_archetypes_deck_stats.csv']) {
            assert.ok(stand.leer.includes(f), f + ' fehlt in der leer-Liste');
        }
    });

    it('die beiden nachgetragenen Quellen werden geführt', () => {
        for (const f of ['city_league_archetypes_comparison.csv',
                         'city_league_archetypes_deck_stats.csv',
                         'tournament_cards_data_overview.csv']) {
            assert.ok(BUILD.includes('"' + f + '"'), f + ' steht nicht in DATEIEN');
            assert.ok(stand.dateien[f], f + ' hat keinen Stand');
        }
    });

    it('der Frischechip von "Vergangene Turniere" zeigt auf die Datei, die dieser Reiter lädt', () => {
        // Er zeigte auf city_league_analysis_past.csv — ein einzelnes
        // japanisches Turnier, das dieser Reiter gar nicht anfasst.
        assert.ok(!/data-quelle="city_league_analysis_past\.csv"/.test(HTML));
        assert.ok(HTML.includes('data-quelle="tournament_cards_data_overview.csv"'));
        assert.match(lies('js/app-past-meta.js'), /loadCSV\('tournament_cards_data_overview\.csv'\)/);
    });
});
