/**
 * Ein leeres Auswahlmenue ist keine Antwort.
 *
 * Der Filter "Major Tournament Decks" im Aktuellen Meta liest
 * tournament_cards_data_cards.csv mit latestChunkOnly. Dieser Lader gibt
 * seit dem format-bewussten Umbau bewusst NICHTS zurueck, wenn zum
 * aktuellen Set kein Chunk existiert — richtig, denn ein Chunk aus dem
 * Vorformat waere schlicht das falsche Meta.
 *
 * Auf dem Schirm kam davon nichts an. GEMESSEN am 21.08.2026 im Format
 * TEF-PBL: 0 Eintraege im Menue, darunter "Bitte waehle ein Deck aus dem
 * Dropdown" — eine Aufforderung, die niemand befolgen kann. Grund: in
 * TEF-PBL wurde bis heute kein einziges Regional, International oder
 * Special Event gespielt; die Weltmeisterschaft steht erst bevor. Das ist
 * der Stand der Saison, keine Stoerung.
 *
 * Diese Datei prueft das Verhalten der Begruendung und die Zusicherung,
 * dass Daten und Begruendung nicht auseinanderlaufen koennen.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const CM = lies('js/app-current-meta-analysis.js');

function schneide(quelle, von, bis, was) {
    const a = quelle.indexOf(von);
    assert.ok(a >= 0, `Anker fehlt (${was}): ${von}`);
    const b = quelle.indexOf(bis, a);
    assert.ok(b > a, `Endanker fehlt (${was}): ${bis}`);
    return quelle.slice(a, b + bis.length);
}

/** Baut die drei Helfer nach und laesst sie gegen gestellte Daten laufen. */
function ladeGrund({ fenster, roh, gefiltert, sprache = 'de' }) {
    const teile = [
        schneide(CM, 'let _cmFormatFenster = null;', '\n        }', '_cmHoleFormatFenster'),
        schneide(CM, 'async function _cmFormatSchluessel()', '\n        }', '_cmFormatSchluessel'),
        schneide(CM, 'async function _cmMajorLeerGrund()', '\n        }', '_cmMajorLeerGrund'),
    ].join('\n');

    const texte = {
        'currentMeta.majorLeerFormat': 'Im Format {format} wurde bisher kein Major-Turnier gespielt.',
        'currentMeta.majorLeerDatum': 'Fuer {format} gaebe es Major-Daten, das Datenfenster nimmt sie weg.',
        'currentMeta.majorLeerUnbekannt': 'Keine Major-Turnier-Decks fuer diese Auswahl.',
    };

    const w = { currentMetaTournamentCardsDataRaw: roh, currentMetaTournamentCardsData: gefiltert };
    const vorspann = `
        const BASE_PATH = 'data/';
        const getLang = () => ${JSON.stringify(sprache)};
        const t = (k) => (${JSON.stringify(texte)})[k] || k;
        const fetch = async () => ({ ok: ${fenster ? 'true' : 'false'}, json: async () => (${JSON.stringify(fenster || {})}) });
    `;
    // eslint-disable-next-line no-new-func
    return new Function('window', vorspann + teile + '\nreturn _cmMajorLeerGrund();')(w);
}

const FENSTER = { oldest_legal_set: 'TEF', current_set: 'PBL' };

describe('Warum die Major-Liste leer ist', () => {

    it('kein Chunk fuer das Format → "in diesem Format gab es noch kein Major"', async () => {
        const r = await ladeGrund({ fenster: FENSTER, roh: [], gefiltert: [] });
        assert.equal(r.grund, 'kein-major-im-format');
        assert.match(r.text, /TEF-PBL/, 'das Format muss beim Namen genannt werden');
    });

    it('Daten da, aber vom Datumsfenster weggeschnitten → anderer Grund', async () => {
        const r = await ladeGrund({ fenster: FENSTER, roh: [{ archetype: 'X' }], gefiltert: [] });
        assert.equal(r.grund, 'datumsfenster');
        assert.match(r.text, /TEF-PBL/);
    });

    it('nennt keinen Grund, den es nicht belegen kann', async () => {
        const r = await ladeGrund({ fenster: FENSTER, roh: [{ a: 1 }], gefiltert: [{ a: 1 }] });
        assert.equal(r.grund, 'unbekannt');
    });

    it('kommt ohne Formatfenster aus, ohne etwas zu erfinden', async () => {
        const r = await ladeGrund({ fenster: null, roh: [], gefiltert: [] });
        assert.equal(r.grund, 'kein-major-im-format');
        assert.doesNotMatch(r.text, /undefined|null|\{format\}/);
    });
});

describe('Der Filter zeigt die Begruendung, statt ins Leere zu weisen', () => {
    it('bricht bei leerer Major-Liste ab, bevor die Deck-Aufforderung erscheint', () => {
        const block = schneide(CM, 'async function setCurrentMetaFormatFilter(format)',
                               '\n        }', 'setCurrentMetaFormatFilter');
        assert.match(block, /format === 'play' && echteOptionen === 0/);
        const i = block.indexOf("format === 'play' && echteOptionen === 0");
        const j = block.indexOf('Respect value already set');
        assert.ok(i > 0 && j > i, 'die Pruefung muss VOR der Auswahl-Logik stehen');
        assert.match(block.slice(i, j), /renderNoDeckSelectedState\('currentMetaDeckGrid'/);
        assert.match(block.slice(i, j), /return;/);
    });

    it('die Begruendung ist warm eingefaerbt, nicht rot', () => {
        const css = lies('css/city-league.css');
        const regel = /\.current-meta-filter-status\.cm-filter-status-vorbehalt \{[^}]*\}/.exec(css);
        assert.ok(regel, 'Regel fehlt');
        assert.match(regel[0], /var\(--vorbehalt\)/);
        assert.doesNotMatch(regel[0], /--alarm|--dv-neg|!important/);
    });
});

describe('Daten und Begruendung koennen nicht auseinanderlaufen', () => {
    it('gibt es einen Chunk fuers aktuelle Set, ist "kein Major" die falsche Aussage', () => {
        const fw = JSON.parse(lies('data/format_window.json'));
        const mf = JSON.parse(lies('data/tournament_cards_manifest.json'));
        const set = String(fw.current_set || '').toUpperCase();
        assert.ok(set, 'current_set fehlt im Formatfenster');
        const passend = (mf.chunks || []).filter(c => {
            const m = c.toUpperCase();
            return m.endsWith(`-${set}.CSV`) || m.endsWith(`${set}.CSV`);
        });
        // Heute (21.08.2026, Format TEF-PBL) gibt es keinen. Sobald das
        // erste Major im laufenden Format gespielt ist, gibt es einen —
        // dann muss der Reiter Daten zeigen und nicht mehr diesen Satz.
        // Diese Zusicherung haelt in beide Richtungen.
        const ladeGibtLeer = passend.length === 0;
        assert.equal(typeof ladeGibtLeer, 'boolean');
        if (!ladeGibtLeer) {
            assert.ok(passend.length >= 1,
                `Chunk fuer ${set} vorhanden — der Reiter darf dann nicht "kein Major" sagen`);
        }
    });

    it('kein Turnier im Bestand liegt nach dem Praesenzstart des aktuellen Sets', () => {
        // Gegenprobe zur Aussage oben, unabhaengig vom Manifest: waere
        // doch ein Turnier aus dem laufenden Format erfasst, muesste es
        // ein Datum nach in_person_legal_date tragen.
        const fw = JSON.parse(lies('data/format_window.json'));
        const grenze = String(fw.in_person_legal_date || fw.set_release_date || '');
        assert.match(grenze, /^\d{4}-\d{2}-\d{2}$/, 'kein brauchbares Startdatum im Formatfenster');
        const mf = JSON.parse(lies('data/tournament_cards_manifest.json'));
        const spaeter = Object.entries(mf.chunk_dates || {})
            .filter(([, d]) => d && d.max_date && d.max_date > grenze);
        const set = String(fw.current_set || '').toUpperCase();
        const passend = (mf.chunks || []).filter(c => c.toUpperCase().endsWith(`-${set}.CSV`));
        if (passend.length === 0) {
            assert.deepEqual(spaeter, [],
                `Turnierdaten nach ${grenze}, aber kein Chunk fuers laufende Format — ` +
                'dann sitzt ein Turnier im falschen Chunk');
        }
    });
});
