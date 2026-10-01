/**
 * Meta-Prognose — die DATEI (data/meta_prognose.json), die der Meta Call liest.
 *
 * FE-17 (01.10.2026): der eigene Block „Meta-Prognose" (js/app-meta-prognose.js,
 * css/app-meta-prognose.css) hatte seit FE-16 keinen Wirt mehr und ist entfernt.
 * Geprueft bleiben die Daten und dass der Meta Call sie liest.
 *
 * (Die Geschichte unten gehoert zur frueheren Anzeige.)
 *
 * BEFUND (09.09.2026): data/meta_prognose.json wurde seit dem 08.09.
 * taeglich gebaut, committet und mit jedem Deploy ausgeliefert — 53 KB,
 * 117 Archetypen mit Konfidenzband — und von KEINER Zeile JavaScript
 * geladen. `grep -rn "meta_prognose" js/` ergab 0 Treffer.
 *
 * Geprueft wird an den ECHTEN Daten und ueber die echten Funktionen des
 * Moduls, nicht ueber eine Zeichenkettensuche:
 *
 *   1. Kein Name wird aus der Kennung abgeleitet. Der Bauer schreibt
 *      seit heute archetyp_name mit; wer aus "n-zoroark" raet, trifft
 *      26 von 62 und verschmilzt "N's Zoroark" still mit "Zoroark".
 *   2. Keine Prognose ohne Modell — eine Zeile ohne `prognose` zeigt
 *      einen Strich, nicht den Online-Anteil.
 *   3. Der Balken ist relativ zum groessten Wert der LISTE skaliert,
 *      nicht zur Spaltenbreite: sonst saehe das Feld je nach
 *      Filterstand anders aus, obwohl sich nichts geaendert hat.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const DATEN = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'data', 'meta_prognose.json'), 'utf8'));

describe('die Prognosedaten selbst', () => {
    it('tragen fuer jede Zeile einen Namen', () => {
        const zeilen = DATEN.prognose;
        assert.ok(zeilen.length > 50, `nur ${zeilen.length} Zeilen`);
        const ohne = zeilen.filter(z => !String(z.archetyp_name || '').trim());
        assert.deepEqual(ohne.map(z => z.archetyp_id), [],
            'Zeilen ohne archetyp_name — die Anzeige muesste den Namen raten');
    });

    it('der Name wird nicht aus der Kennung abgeleitet', () => {
        // Der teure Fall: "n-zoroark" und "zoroark" sind zwei Decks.
        const n = DATEN.prognose.find(z => z.archetyp_id === 'n-zoroark');
        if (!n) return;                       // Deck aus dem Meta gefallen
        assert.notEqual(n.archetyp_name, 'Zoroark',
            'N\'s Zoroark wurde mit Zoroark verschmolzen');
        assert.match(n.archetyp_name, /Zoroark/);
    });

    it('fuehren ein Modell mit ausgewiesener Guete', () => {
        const m = DATEN.modell;
        assert.ok(m, 'kein Modell in der Datei');
        for (const feld of ['art', 'anker', 'verdichtung_median',
            'verdichtung_min', 'verdichtung_max', 'r_mittel', 'mae_mittel']) {
            assert.ok(m[feld] !== undefined, `Modell ohne ${feld}`);
        }
        assert.ok(m.anker >= 3, `nur ${m.anker} Anker`);
        assert.ok(m.verdichtung_min <= m.verdichtung_median
               && m.verdichtung_median <= m.verdichtung_max,
            'die Bandbreite umschliesst den Mittelwert nicht');
    });

    it('die Bandbreite umschliesst die Prognose', () => {
        const daneben = DATEN.prognose.filter(z =>
            Number.isFinite(z.prognose)
            && !(z.prognose_von <= z.prognose + 1e-9
              && z.prognose <= z.prognose_bis + 1e-9));
        assert.deepEqual(daneben.map(z => z.archetyp_id), [],
            'Prognose liegt ausserhalb ihrer eigenen Bandbreite');
    });
});

describe('die Einbettung', () => {
    it('der eigene Block ist in der Meta-Call-Tabelle aufgegangen (FE-16)', () => {
        /* Bis 28.09.2026 stand hier ein eigener Wirt vor der Meta-Call-
           Karte — mit einem zweiten Modell neben dem Praediktor (Dragapult
           13,3 % oben, 18,72 % unten). Seit FE-15/FE-16 liest der Meta Call
           dieselbe Datei und zeigt Online, Prognose und Band als Spalten. */
        assert.doesNotMatch(HTML, /id="metaPrognoseHost"/,
            'der zweite Prognoseblock steht wieder ueber dem Meta Call');
        const MC = fs.readFileSync(path.join(ROOT, 'js', 'app-meta-call.js'), 'utf8');
        assert.match(MC, /const PROGNOSE_DATEI = 'data\/meta_prognose\.json'/,
            'der Meta Call liest die Prognosedatei nicht');
        assert.match(MC, /prognose_von/, 'die Bandbreite fehlt in der Tabelle');
    });

    it('Skript und Stylesheet des alten Blocks sind entfernt (FE-17)', () => {
        assert.doesNotMatch(HTML, /app-meta-prognose/, 'index.html laedt den alten Block noch');
        const SW = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
        assert.doesNotMatch(SW, /app-meta-prognose/, 'der Service Worker haelt den alten Block noch vor');
        assert.ok(!fs.existsSync(path.join(ROOT, 'js', 'app-meta-prognose.js')), 'js/app-meta-prognose.js liegt noch da');
        assert.ok(!fs.existsSync(path.join(ROOT, 'css', 'app-meta-prognose.css')), 'css/app-meta-prognose.css liegt noch da');
    });

    it('der Meta Call kennt den Datenstand der Prognosedatei', () => {
        const stand = JSON.parse(fs.readFileSync(
            path.join(ROOT, 'data', 'data_stand.json'), 'utf8'));
        assert.ok(stand.dateien['meta_prognose.json']
               || stand.ohne_stand.includes('meta_prognose.json'),
            'meta_prognose.json steht in keinem Datenstand');
    });

    it('kein Cache-Parameter in einem Template-Literal', () => {
        /* DER TEUERSTE FEHLER DIESER RUNDE (10.09.2026).
           Der Deploy laesst ein sed ueber jede Datei in js/ laufen, das
           den Cache-Parameter durch die Deploy-Version ersetzt — bis
           zum naechsten Anfuehrungszeichen. In einem Template-Literal
           gibt es dort keins, also frisst die Ersetzung den halben Rest
           der Zeile. Die ausgelieferte Datei war 6.161 statt 12.173
           Bytes und warf einen SyntaxError; auf main war alles heil,
           die Tests gruen, der Reiter live leer.

           Geprueft wird die REGEL fuer alle Module, nicht nur fuer
           dieses: ein Template-Literal darf das Muster nicht
           enthalten. */
        const muster = '?' + 'v=';
        const dateien = fs.readdirSync(path.join(ROOT, 'js'))
            .filter(f => f.endsWith('.js'));
        const treffer = [];
        for (const f of dateien) {
            const text = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
            // Nur Zeilen, in denen das Muster INNERHALB eines
            // Backtick-Abschnitts steht.
            text.split('\n').forEach((zeile, i) => {
                const roh = zeile.replace(/\/\/.*$/, '').replace(/\/\*.*$/, '');
                if (roh.indexOf('`') === -1 || roh.indexOf(muster) === -1) return;
                const nachBacktick = roh.slice(roh.indexOf('`'));
                if (nachBacktick.indexOf(muster) !== -1) {
                    treffer.push(`${f}:${i + 1}`);
                }
            });
        }
        assert.deepEqual(treffer, [],
            'Cache-Parameter in einem Template-Literal — das zerlegt der '
            + 'Deploy: ' + treffer.join(', '));
    });
});
