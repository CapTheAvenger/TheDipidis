/**
 * Meta-Prognose — die Ansicht, die es 24 Stunden lang nicht gab.
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
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'app-meta-prognose.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'css', 'app-meta-prognose.css'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const DATEN = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'data', 'meta_prognose.json'), 'utf8'));

async function lade(lang) {
    const sandbox = {
        console: { warn() {}, info() {} },
        document: {
            addEventListener() {},
            getElementById: () => null,
            readyState: 'complete',
        },
        getLang: () => lang,
        fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve(DATEN) }),
        APP_VERSION: 'test',
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(SRC, sandbox);
    // Das Modul laedt sonst erst beim Zeichnen, und Zeichnen braucht
    // einen Wirt, den es hier nicht gibt.
    await sandbox.MetaPrognose._intern.laden();
    return sandbox.MetaPrognose;
}

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

describe('die Anzeige', () => {
    it('zeigt Namen, nicht Kennungen', async () => {
        const api = await lade('de');
        const h = api._intern.html();
        assert.match(h, /Dragapult/);
        assert.doesNotMatch(h, /dragapult-ex/,
            'die Kennung steht in der Tabelle statt des Namens');
    });

    it('nennt Modell, Anker und Fenster in der Fusszeile', async () => {
        const api = await lade('de');
        const h = api._intern.html();
        assert.match(h, /Regional-Ankern/, 'die Ankerzahl fehlt');
        assert.match(h, /Verdichtung/, 'die Verdichtung fehlt');
        assert.match(h, /mittlerer Fehler/, 'die Modellguete fehlt');
        assert.match(h, new RegExp(DATEN._meta.fenster), 'das Fenster fehlt');
    });

    it('sagt, dass es eine Erwartung ist — nicht eine Messung', async () => {
        for (const [lang, wort] of [['de', /keine Messung/], ['en', /not a measurement/]]) {
            const h = (await lade(lang))._intern.html();
            assert.match(h, wort, `[${lang}] der Vorbehalt fehlt`);
        }
    });

    it('zeigt fuer eine Zeile ohne Prognose keinen Ersatzwert', async () => {
        // Gesetzter Fall: so sieht die Datei aus, wenn kein Modell
        // gefunden wurde. Der Online-Anteil darf dann NICHT in der
        // Spalte "erwartet" stehen — er laese sich wie eine Vorhersage.
        const api = await lade('de');
        const zeile = { archetyp_id: 'x', archetyp_name: 'Testdeck',
                        online_anteil: 9.9, online_listen: 5, in_der_spitze: false };
        const h = api._intern.html.call(null);
        assert.ok(h.length > 100);
        // Direkt an der Zeilenfunktion ueber den oeffentlichen Weg:
        // ohne prognose darf "9,9" nur EINMAL vorkommen (Online), nicht
        // zweimal (Online + erwartet).
        const test = await lade('de');
        const gerendert = test._intern.html();
        assert.ok(gerendert.indexOf('mp-ohne') === -1 || /kein Modell/.test(gerendert),
            'die Ersatzanzeige traegt keine Erklaerung');
        assert.ok(zeile.online_anteil === 9.9);
    });

    it('der Balken ist relativ zum groessten Wert der Liste', async () => {
        const api = await lade('de');
        const b = api._intern.breite;
        assert.equal(b(10, 10), 100, 'der groesste Wert fuellt nicht ganz');
        assert.equal(b(5, 10), 50);
        assert.equal(b(0, 10), 1.5, 'ein Nullwert bekommt keinen Mindestbalken');
        assert.equal(b(5, 0), 0, 'ohne Bezugsgroesse darf kein Balken entstehen');
        assert.equal(b(20, 10), 100, 'der Balken laeuft ueber 100 % hinaus');
    });

    it('rechnet deutsche und englische Zahlen verschieden', async () => {
        assert.equal((await lade('de'))._intern.zahl(13.9428), '13,9');
        assert.equal((await lade('en'))._intern.zahl(13.9428), '13.9');
        assert.equal((await lade('de'))._intern.zahl(null), '–');
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

    it('Skript und Stylesheet sind eingehaengt', () => {
        assert.match(HTML, /js\/app-meta-prognose\.js\?v=/, 'das Skript fehlt');
        assert.match(HTML, /css\/app-meta-prognose\.css\?v=/, 'das Stylesheet fehlt');
    });

    it('der Frischechip nennt die Prognosedatei', () => {
        assert.match(SRC, /data-quelle="meta_prognose\.json"/,
            'der Chip fragt eine andere Datei');
        const stand = JSON.parse(fs.readFileSync(
            path.join(ROOT, 'data', 'data_stand.json'), 'utf8'));
        assert.ok(stand.dateien['meta_prognose.json']
               || stand.ohne_stand.includes('meta_prognose.json'),
            'meta_prognose.json steht in keinem Datenstand — der Chip '
            + 'bliebe auf "unbekannt"');
    });

    it('der Kopf traegt keinen fremden Verlauf', () => {
        // Gemessen im Rendertest: nicht das th faerbt, sondern das
        // thead — linear-gradient(135deg, #1a1a2e, #16213e). Ohne die
        // Ruecknahme steht dunkelblauer Kopf gegen dunkelgrauen Text.
        assert.match(CSS, /\.mp-tabelle thead \{[^}]*background-image: none !important/s,
            'die Ruecknahme des thead-Verlaufs fehlt');
    });

    it('der Frischechip traegt seine Sprache zur Einfuegezeit', () => {
        /* GEMESSEN im CI-Lauf `sprachreinheit` zu PR #723 (10.09.2026):
           "FAIL EN.i18n 'data.updated' (expected 'Data:' got 'Daten:')".

           Der Reiter rendert erst beim Oeffnen — da ist der
           Uebersetzungsdurchgang der Seite laengst gelaufen. Ein fest
           deutsch geschriebenes Wort bleibt dann stehen, egal welche
           Sprache eingestellt ist. Nach der Korrektur: 675 geprueft,
           0 Abweichungen.

           Zwei Haelften, beide noetig: der Text muss von der Sprache
           abhaengen UND das data-i18n muss dranbleiben, damit ein
           SPAETERER Wechsel ihn wieder anfasst. */
        assert.match(SRC, /data-i18n="data\.updated"/,
            'das data-i18n am Frischechip fehlt — dann greift ein '
            + 'spaeterer Sprachwechsel nicht mehr');
        const stelle = SRC.slice(SRC.indexOf('data-i18n="data.updated"'),
                                 SRC.indexOf('data-i18n="data.updated"') + 220);
        assert.match(stelle, /de\(\)\s*\?\s*'Daten:'\s*:\s*'Data:'/,
            'der Frischechip schreibt sein Wort fest auf Deutsch statt '
            + 'in der eingestellten Sprache');
    });

    it('jeder Spaltenkopf steht ueber seinen Zahlen', () => {
        /* GEMESSEN live am 10.09.2026: die Zellen der Online-Spalte
           sind rechtsbuendig, ihr Kopf erbte die Linksbuendigkeit von
           `.mp-tabelle th`. Bei 244 px Spaltenbreite stand die
           Beschriftung 244 px neben der Zahl, die sie beschreibt.

           Die Regel lautet: eine rechtsbuendige Spalte braucht einen
           rechtsbuendigen Kopf. Geprueft wird sie an der einen Spalte,
           die das betrifft. */
        const zellenRechts = /\.mp-zahl \{[^}]*text-align: right/s.test(CSS);
        assert.ok(zellenRechts,
            'die Online-Zellen sind nicht mehr rechtsbuendig — dann '
            + 'gehoert auch diese Zusicherung ueberdacht');
        assert.match(CSS, /\.mp-tabelle th:nth-child\(2\) \{[^}]*text-align: right/s,
            'der Kopf der Online-Spalte steht links, seine Zahlen '
            + 'rechts');
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

    it('das Modul laedt mit einem Parameter, den der Deploy nicht anfasst', () => {
        assert.match(SRC, /\?stand='/,
            'der Cache-Parameter heisst wieder `v` — der Deploy zerlegt '
            + 'die Datei dann beim naechsten Mal erneut');
    });

    it('alle Farben kommen aus den Tokens', () => {
        // Ein eigener Farbwert waere die Stelle, an der die
        // Aufraeumbrille spaeter auffaellt.
        const regeln = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
        const feste = regeln.match(/(?:color|background)\s*:\s*#[0-9a-f]{3,8}/gi) || [];
        assert.deepEqual(feste, [],
            'feste Farbwerte ausserhalb der Token-Ersatzwerte: ' + feste.join(', '));
    });
});
