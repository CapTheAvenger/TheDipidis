/**
 * Eine Regel dafuer, welcher Turnier-Chunk der aktuelle ist.
 *
 * Es gab zwei. In js/app-core.js eine formatbewusste Auswahl (nimm den
 * Chunk, dessen Metaschluessel auf current_set endet; passt keiner,
 * nimm gar keinen). In js/app-cards-db.js dagegen
 * `manifest.chunks[manifest.chunks.length - 1]` — der letzte Eintrag
 * der Liste. Dass das oft dasselbe Ergebnis hatte, war Zufall der
 * Sortierung: zwischen "TEF-CRI" und "TEF-POR" ist der letzte Name mal
 * der richtige und mal nicht, und mit jeder Rotation aendert sich die
 * Antwort ohne Zutun.
 *
 * GEMESSEN am 21.08.2026: current_set ist PBL, es gibt keinen
 * PBL-Chunk. Die richtige Antwort ist eine leere Menge — im aktuellen
 * Format wurde noch kein Major gespielt. Die Kartendatenbank nahm
 * stattdessen den alphabetisch letzten Chunk und behandelte dessen
 * Karten als "spielbar im aktuellen Format".
 *
 * Diese Datei prueft die gemeinsame Funktion selbst und dass beide
 * Aufrufstellen sie benutzen.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const CORE = lies('js/app-core.js');
const CARDSDB = lies('js/app-cards-db.js');

function extrahiere(quelle, von, bis, was) {
    const a = quelle.indexOf(von);
    assert.ok(a >= 0, `Anker fehlt (${was}): ${von}`);
    const b = quelle.indexOf(bis, a);
    assert.ok(b > a, `Endanker fehlt (${was}): ${bis}`);
    return quelle.slice(a, b + bis.length);
}

const QUELLTEXT = extrahiere(
    CORE,
    'function waehleAktuellenChunk(manifest, currentSet) {',
    '\n        }',
    'waehleAktuellenChunk');

const waehle = new Function(`${QUELLTEXT}; return waehleAktuellenChunk;`)();

const MANIFEST = {
    chunks: [
        'tournament_cards_data_cards_BRS-PRE.csv',
        'tournament_cards_data_cards_SVI-JTG.csv',
        'tournament_cards_data_cards_TEF-CRI.csv',
        'tournament_cards_data_cards_TEF-POR.csv',
    ],
    chunk_dates: {
        'tournament_cards_data_cards_TEF-CRI.csv': { max_date: '2026-06-10' },
        'tournament_cards_data_cards_TEF-POR.csv': { max_date: '2026-05-16' },
    },
};

describe('waehleAktuellenChunk', () => {
    it('waehlt den Chunk des aktuellen Sets', () => {
        assert.deepEqual(waehle(MANIFEST, 'CRI'),
            ['tournament_cards_data_cards_TEF-CRI.csv']);
    });

    it('gibt LEER zurueck, wenn kein Chunk zum Format passt', () => {
        // Genau der Stand vom 21.08.2026: PBL ist aktuell, kein Major
        // gespielt. Leer ist die Antwort, nicht der Fehler.
        assert.deepEqual(waehle(MANIFEST, 'PBL'), []);
    });

    it('nimmt nicht den alphabetisch letzten Chunk', () => {
        // Der alte Weg haette hier TEF-POR geliefert — das rotierte
        // Format mit dem juengeren Namen und dem aelteren Datum.
        const gewaehlt = waehle(MANIFEST, 'CRI');
        const alphabetischLetzter = MANIFEST.chunks[MANIFEST.chunks.length - 1];
        assert.notEqual(gewaehlt[0], alphabetischLetzter);
    });

    it('nimmt bei mehreren Treffern den mit dem juengsten Datum', () => {
        const m = {
            chunks: ['a_TEF-CRI.csv', 'b_POR-CRI.csv'],
            chunk_dates: {
                'a_TEF-CRI.csv': { max_date: '2026-06-10' },
                'b_POR-CRI.csv': { max_date: '2026-06-20' },
            },
        };
        assert.deepEqual(waehle(m, 'CRI'), ['b_POR-CRI.csv']);
    });

    it('kommt ohne Datumsangaben aus', () => {
        const m = { chunks: ['x_TEF-CRI.csv'] };
        assert.deepEqual(waehle(m, 'CRI'), ['x_TEF-CRI.csv']);
    });

    it('gibt LEER zurueck, wenn kein Format bekannt ist', () => {
        assert.deepEqual(waehle(MANIFEST, ''), []);
        assert.deepEqual(waehle(MANIFEST, null), []);
    });

    it('kommt mit leerem Manifest klar', () => {
        assert.deepEqual(waehle({ chunks: [] }, 'CRI'), []);
        assert.deepEqual(waehle(null, 'CRI'), []);
    });
});

describe('Beide Aufrufstellen benutzen dieselbe Regel', () => {
    it('app-core exportiert die Funktion', () => {
        assert.match(CORE, /window\.waehleAktuellenChunk\s*=\s*waehleAktuellenChunk/);
    });

    it('app-cards-db waehlt nicht mehr den letzten Chunk der Liste', () => {
        // Kommentarzeilen abziehen: der Verweis auf den alten Weg steht
        // dort ausdruecklich als Begruendung und ist kein Rueckfall.
        const ohneKommentare = CARDSDB
            .split('\n')
            .filter(z => !z.trim().startsWith('//'))
            .join('\n');
        assert.ok(!/chunks\[[^\]]*\.length - 1\]/.test(ohneKommentare),
            'app-cards-db greift wieder auf den alphabetisch letzten Chunk zu');
    });

    it('app-cards-db ruft die gemeinsame Funktion auf', () => {
        assert.match(CARDSDB, /window\.waehleAktuellenChunk/);
    });

    it('app-cards-db liest das Formatfenster', () => {
        assert.match(CARDSDB, /format_window\.json/);
    });
});

describe('Ohne Formatfenster wird nichts geladen', () => {
    it('app-core faellt nicht mehr auf das juengste Datum zurueck', () => {
        const block = extrahiere(
            CORE,
            'async function _loadTournamentCardsChunked(options) {',
            '// Load chunks in parallel',
            'Chunk-Lader');
        assert.ok(!/Loading latest chunk by date/.test(block),
            'der Datums-Rueckfall ist wieder da — er laedt bei einem Ausfall '
            + 'von format_window.json das falsche Format');
        assert.match(block, /_turnierChunkFormatUnbekannt/);
    });

    it('der Rueckfall der Metaansicht laedt nur den aktuellen Chunk', () => {
        const CM = lies('js/app-core.js');
        const stelle = CM.indexOf("const fallback = await loadCSV('tournament_cards_data_cards.csv'");
        assert.ok(stelle > 0, 'Rueckfall-Aufruf nicht gefunden');
        const ausschnitt = CM.slice(stelle, stelle + 200);
        assert.match(ausschnitt, /latestChunkOnly:\s*true/,
            'ohne latestChunkOnly laedt der Notfall alle Chunks und '
            + 'etikettiert sie als aktuelles Meta');
    });
});
