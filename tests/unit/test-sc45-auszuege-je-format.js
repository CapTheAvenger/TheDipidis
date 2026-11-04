/**
 * SC-45 (04.11.2026): js/deck-builder-consistency.js lud den Monolithen
 * data/tournament_decklists_per_player.csv (99,5 MiB) komplett im Browser.
 * Der Monolith liegt nicht mehr im Repo (mit Puebla/Danzig 106,5 MiB,
 * GitHub nimmt 100). Der Bestand liegt als Auszuege je Format und Monat,
 * und das Modul laedt nur die des laufenden Formats
 * (oldest_legal_set-current_set aus data/format_window.json) — alte
 * Formate warf build() schon vorher ueber opts.minDate heraus.
 *
 * AUSGEFUEHRT: das echte Modul in einer Attrappe; gezaehlt wird, welche
 * Dateien Papa.parse anfordert.
 *
 * Verfaelschungsproben (gemessen 04.11.): Filter nach meta entfernt -> 1
 * und 3 rot; Rueckfall "alle" entfernt -> 2 rot.
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WURZEL = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(WURZEL, 'js', 'deck-builder-consistency.js'), 'utf8');

const VERZEICHNIS = {
    quelle: 'tournament_decklists_per_player',
    meta_keys: ['TEF-30C', 'TEF-CRI', 'TEF-PBL'],
    auszuege: [
        { schluessel: 'TEF-PBL_2026-09', meta: 'TEF-PBL', monat: '2026-09', datei: 'tournament_decklists_per_player_TEF-PBL_2026-09.csv' },
        { schluessel: 'TEF-30C_2026-10', meta: 'TEF-30C', monat: '2026-10', datei: 'tournament_decklists_per_player_TEF-30C_2026-10.csv' },
        { schluessel: 'TEF-30C_2026-09', meta: 'TEF-30C', monat: '2026-09', datei: 'tournament_decklists_per_player_TEF-30C_2026-09.csv' },
        { schluessel: 'TEF-CRI_2026-06', meta: 'TEF-CRI', monat: '2026-06', datei: 'tournament_decklists_per_player_TEF-CRI_2026-06.csv' },
        { schluessel: 'TEF-PBL_2026-08', meta: 'TEF-PBL', monat: '2026-08', datei: 'tournament_decklists_per_player_TEF-PBL_2026-08.csv' },
    ],
};

function laden({ fensterDatei, fensterGlobal, verzeichnis = VERZEICHNIS } = {}) {
    const geparst = [];
    const geholt = [];
    const ctx = {
        console: { log() {}, warn() {}, error() {}, info() {} },
        document: { readyState: 'complete', addEventListener() {}, querySelector: () => null },
        setTimeout: () => 0,
        Papa: { parse: (url, o) => { geparst.push(String(url).split('?')[0]); o.complete({ data: [] }); } },
        fetch: async (url) => {
            const u = String(url).split('?')[0];
            geholt.push(u);
            if (u === 'data/tournament_decklists_per_player_verzeichnis.json') {
                return { ok: !!verzeichnis, json: async () => verzeichnis };
            }
            if (u === 'data/format_window.json') {
                return { ok: !!fensterDatei, json: async () => fensterDatei };
            }
            return { ok: false, json: async () => null, text: async () => '' };
        },
    };
    if (fensterGlobal) ctx._formatWindow = fensterGlobal;
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(SRC, ctx, { filename: 'deck-builder-consistency.js' });
    return { ctx, geparst, geholt };
}

const nurBestand = (liste) => liste.filter((u) => u.startsWith('data/tournament_decklists_per_player_')).sort();

describe('SC-45: der Deck-Builder laedt nur die Auszuege des laufenden Formats', () => {
    it('Format TEF-30C aus data/format_window.json: genau die zwei 30C-Auszuege, keinen Monolithen', async () => {
        const s = laden({ fensterDatei: { oldest_legal_set: 'TEF', current_set: '30C' } });
        await s.ctx.MostConsistencyBuilder.loadData();
        assert.deepEqual(nurBestand(s.geparst), [
            'data/tournament_decklists_per_player_TEF-30C_2026-09.csv',
            'data/tournament_decklists_per_player_TEF-30C_2026-10.csv',
        ]);
        assert.ok(!s.geparst.includes('data/tournament_decklists_per_player.csv'), 'der Monolith darf nicht mehr angefordert werden');
        assert.deepEqual([...s.ctx.MostConsistencyBuilder.geladeneAuszuege()], [
            'tournament_decklists_per_player_TEF-30C_2026-09.csv',
            'tournament_decklists_per_player_TEF-30C_2026-10.csv',
        ]);
    });

    it('Format ohne Auszug (Rotation): alle Auszuege, damit das Formattor wie bisher entscheidet', async () => {
        const s = laden({ fensterDatei: { oldest_legal_set: 'TEF', current_set: 'NEU' } });
        await s.ctx.MostConsistencyBuilder.loadData();
        assert.equal(nurBestand(s.geparst).length, 5);
    });

    it('window._formatWindow ist schon da: kein zweiter Abruf von format_window.json', async () => {
        const s = laden({ fensterGlobal: { oldest_legal_set: 'tef', current_set: '30c' } });
        await s.ctx.MostConsistencyBuilder.loadData();
        assert.ok(!s.geholt.includes('data/format_window.json'));
        assert.equal(nurBestand(s.geparst).length, 2, 'Gross-/Kleinschreibung des Fensters darf nicht stoeren');
    });

    it('ohne Verzeichnis wird nichts geladen und nichts geraten', async () => {
        const s = laden({ verzeichnis: null, fensterDatei: { oldest_legal_set: 'TEF', current_set: '30C' } });
        await s.ctx.MostConsistencyBuilder.loadData();
        assert.equal(nurBestand(s.geparst).length, 0);
        assert.equal(s.ctx.MostConsistencyBuilder.geladeneAuszuege().length, 0);
        assert.equal(s.ctx.MostConsistencyBuilder.listsForArchetype('Dragapult').length, 0);
    });

    it('auszuegeWaehlen sortiert nach Schluessel und filtert nach Format', () => {
        const w = laden().ctx.MostConsistencyBuilder.auszuegeWaehlen;
        assert.deepEqual([...w(VERZEICHNIS, 'TEF-PBL').map((a) => a.schluessel)], ['TEF-PBL_2026-08', 'TEF-PBL_2026-09']);
        assert.equal(w(VERZEICHNIS, null).length, 5);
        assert.equal(w({ auszuege: [] }, 'TEF-30C').length, 0);
    });
});

describe('SC-45: das Repo fuehrt den Bestand nur als Auszuege', () => {
    it('kein Monolith in data/, jeder Auszug im Verzeichnis, keiner ueber 100 MiB', () => {
        const data = path.join(WURZEL, 'data');
        assert.ok(!fs.existsSync(path.join(data, 'tournament_decklists_per_player.csv')),
            'data/tournament_decklists_per_player.csv darf nicht mehr im Repo liegen');
        const vz = JSON.parse(fs.readFileSync(path.join(data, 'tournament_decklists_per_player_verzeichnis.json'), 'utf8'));
        const imVz = new Set(vz.auszuege.map((a) => a.datei));
        const aufPlatte = fs.readdirSync(data).filter((n) =>
            n.startsWith('tournament_decklists_per_player_') && n.endsWith('.csv'));
        assert.deepEqual(aufPlatte.sort(), [...imVz].sort());
        for (const n of aufPlatte) {
            assert.ok(fs.statSync(path.join(data, n)).size < 100 * 1024 * 1024, n + ' ist ueber 100 MiB');
        }
    });
});
