/**
 * Rutsch 7 (27.09.2026) — Major-Daten und Bilder.
 *
 *   DA-13  Solange es im laufenden Format kein Major gibt, zeigen die
 *          Kacheln das letzte Major-Format („Major · TEF-PBL") statt leerer
 *          Felder. Quelle des alten Formats: data/format_window.json →
 *          previous_format_key.
 *   —      Beim Bauen gefunden: der Major-Anteil war die SUMME der
 *          Turnieranteile (Dragapult 17,89 + 22,33 = 40,2 %), gezaehlt sind
 *          736 von 3.916 Antritten = 18,8 %.
 *   FE-6   Meta-Performance: Major-Anteil und Major-Quote als eigene
 *          Spalten — nur aus dem Auszug des LAUFENDEN Formats.
 *   FE-5   Bild der Deck-Analyse in drei Fassungen: Online / Major /
 *          Kombiniert, umschaltbar in der Bildvorschau.
 *   FE-4   Heatmap: kein CSV-Knopf mehr (ein 20×20-Bild waere am Telefon
 *          unter 11 px).
 *   DA-14  Rogue-Kachel ohne Kartendaten bekommt das Pokémon-Bild statt
 *          einer grauen Flaeche.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { lies, ausschnitt } = require('./lib-dom-sandkasten.js');

const KARTE = lies('js', 'app-archetype-card.js');
const TIER = lies('js', 'app-tier-meta.js');
const META = lies('js', 'app-current-meta.js');
const SHARE = lies('js', 'ds-share.js');
const VORSCHAU = lies('js', 'ds-bildvorschau.js');

function lauf(code, umfeld) {
    const ctx = Object.assign({ console }, umfeld || {});
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    return ctx;
}

describe('DA-13 — welcher Major-Auszug geladen wird', () => {
    const ctx = lauf(ausschnitt(KARTE, 'function majorAuszugWaehlen(')
        + '\nglobalThis.waehle = majorAuszugWaehlen;');

    it('gibt es das laufende Format, dann das laufende', () => {
        assert.equal(ctx.waehle('TEF-30C', 'TEF-PBL', ['TEF-PBL', 'TEF-30C']), 'TEF-30C');
    });
    it('gibt es das laufende nicht, dann das letzte Major-Format', () => {
        assert.equal(ctx.waehle('TEF-30C', 'TEF-PBL', ['TEF-CRI', 'TEF-PBL']), 'TEF-PBL');
    });
    it('steht auch das alte nicht im Verzeichnis, wird nichts behauptet', () => {
        assert.equal(ctx.waehle('TEF-30C', 'TEF-PBL', ['TEF-CRI']), '');
        assert.equal(ctx.waehle('TEF-30C', '', ['TEF-PBL']), '');
        assert.equal(ctx.waehle('TEF-30C', 'TEF-PBL', null), '');
    });
    it('die Kacheln schreiben das Format an, sobald es ein anderes ist', () => {
        const c = lauf(ausschnitt(KARTE, 'function majorFormatFremd(') + '\nglobalThis.f = majorFormatFremd;',
            { _majorZeitraum: { key: 'TEF-PBL' }, window: { getCurrentMetaFormat: () => 'TEF-30C' } });
        // _majorZeitraum steht im Kontext als globale Variable.
        assert.equal(c.f(), 'TEF-PBL');
    });
});

describe('Der Major-Anteil ist ein Bruch ueber alle Turniere', () => {
    function lade(csv) {
        const code = [
            "const MAJOR_VERZ_URL = 'labs_tournament_decks_verzeichnis.json';",
            'let _majorZeitraum = null;',
            ausschnitt(KARTE, 'function num('),
            ausschnitt(KARTE, 'function teile('),
            ausschnitt(KARTE, 'function parseCsv('),
            ausschnitt(KARTE, 'function majorAuszugWaehlen('),
            ausschnitt(KARTE, 'function _majorLaden('),
            'globalThis.lade = _majorLaden;',
        ].join('\n');
        const antwort = (url) => url.indexOf('verzeichnis') >= 0
            ? { ok: true, json: () => Promise.resolve({ meta_keys: ['TEF-PBL'] }) }
            : { ok: true, text: () => Promise.resolve(csv) };
        const ctx = lauf(code, {
            fetch: (url) => Promise.resolve(antwort(url)),
            window: { _formatWindow: { oldest_legal_set: 'TEF', current_set: '30C', previous_format_key: 'TEF-PBL' },
                      parseLocaleNumber: (v, d) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : d; } },
        });
        return ctx.lade('data/', '');
    }

    it('zwei Turniere: Antritte durch Feld, nicht Anteil plus Anteil', async () => {
        const csv = [
            'tournament_id,tournament_name,tournament_date,total_players,deck_name,player_count,share_pct,wins,losses,ties,day1_players,day2_players',
            '0071,Worlds,2026-08-28,797,Dragapult,178,22.33,553,601,162,178,22',
            '0060,Regional,2026-07-04,3119,Dragapult,558,17.89,100,100,10,558,5',
        ].join('\n');
        const r = await lade(csv);
        const erwartet = (178 + 558) / (797 + 3119) * 100;
        assert.ok(Math.abs(r.Dragapult.share - erwartet) < 1e-9,
            'Anteil ' + r.Dragapult.share + ' statt ' + erwartet);
        assert.ok(r.Dragapult.share < 20, 'wieder die Summe der Turnieranteile (40,2 %)');
    });

    it('ohne total_players wird das Feld aus Antritten und Anteil zurueckgerechnet', async () => {
        const csv = [
            'tournament_id,tournament_name,tournament_date,deck_name,player_count,share_pct,wins,losses,ties,day1_players,day2_players',
            '0071,Worlds,2026-08-28,Dragapult,178,22.33,553,601,162,178,22',
            '0072,Regional,2026-07-04,Dragapult,50,10.00,100,100,10,50,5',
        ].join('\n');
        const r = await lade(csv);
        const erwartet = 228 / (178 / 0.2233 + 50 / 0.10) * 100;
        assert.ok(Math.abs(r.Dragapult.share - erwartet) < 1e-6, String(r.Dragapult.share));
    });
});

describe('FE-6 — Major-Spalten in der Meta-Performance', () => {
    const start = TIER.indexOf('const _majorSumme = labsByName');
    const ende = TIER.indexOf('const reihen = [...alleNamen]', start);
    const block = TIER.slice(start, ende);
    const majorVon = (labsByName) => new Function('labsByName', 'kanon',
        block + '\nreturn majorVon;')(labsByName, (n) => n);

    it('der Block ist gefunden', () => {
        assert.ok(start > 0 && ende > start && block.length < 3000, 'Block nicht gefunden');
    });
    it('Anteil = Antritte / Antritte aller Decks, Quote = Win % des Auszugs', () => {
        const f = majorVon({ A: { players: 30, games: 100, winPct: 55 }, B: { players: 90, games: 200, winPct: 48 } });
        assert.deepEqual(f('A'), { anteil: 25, wr: 55 });
        assert.equal(f('C'), null);
    });
    it('ohne Auszug des laufenden Formats bleibt jede Zelle leer', () => {
        assert.equal(majorVon(null)('A'), null);
        assert.equal(majorVon({})('A'), null);
    });
    it('die Spalten verschwinden, solange keine Zeile einen Wert traegt', () => {
        assert.match(TIER, /c\.k !== 'majorAnteil' && c\.k !== 'majorWr'\)\s*\|\| hatWert\(c\.k\)/);
    });
});

describe('FE-5 — drei Fassungen des Bildes', () => {
    it('shareDeckCard baut Online, Major und Kombiniert', () => {
        const fn = ausschnitt(SHARE, 'function shareDeckCard(');
        for (const id of ["id: 'online'", "id: 'major'", "id: 'kombiniert'"]) {
            assert.ok(fn.includes(id), 'Fassung fehlt: ' + id);
        }
        assert.match(fn, /wechsle: function \(id\)/);
    });
    it('die Zeichenroutine kennt alle drei und nimmt fuer Major die Major-Paarungen', () => {
        const fn = ausschnitt(SHARE, 'function deckCardCanvas(');
        assert.match(fn, /var muQuelle = variante === 'major' \? \(spec\.majorMatchups \|\| \[\]\) : \(spec\.matchups \|\| \[\]\);/);
        assert.match(fn, /variante === 'kombiniert'/);
        assert.match(fn, /art\.mIcons2/, 'die kombinierte Fassung zeichnet keine zwei Bilder je Gegner');
    });
    it('der Sammler liefert die Major-Paarungen und ihr Format mit', () => {
        const fn = ausschnitt(SHARE, 'function collectDeckSpec(');
        assert.match(fn, /majorMatchups: majorMus/);
        assert.match(fn, /majorMuFormat: f\.majorMuFormat/);
    });
    it('die Bildvorschau zeigt einen Umschalter, wenn Fassungen angeboten werden', () => {
        const fn = ausschnitt(VORSCHAU, 'function zeige(');
        assert.match(fn, /ds-bildvorschau-varianten/);
        assert.match(fn, /o\.wechsle\(id\)/);
    });
});

describe('FE-4 — die Heatmap hat keinen CSV-Knopf mehr', () => {
    // Seit UI-41 (28.09.2026) gibt es seitenweit keinen CSV-Export mehr;
    // die Zusicherung dafuer steht in test-ui41-kein-csv.js.
    it('die Heatmap wird weiter als Tabelle gezeichnet', () => {
        assert.match(META, /<table class="heatmap-table"/);
    });
});

describe('DA-14 — ohne Kartendaten das Pokémon-Bild statt grau', () => {
    const fn = ausschnitt(TIER, 'function getArchetypeImage(');
    const bild = (urls) => new Function('window', fn + '\nreturn getArchetypeImage;')(
        { ArchetypeIcons: { getIconUrls: () => urls } });

    it('ohne Karten, mit Sprite: das Sprite', () => {
        assert.equal(bild(['https://r2.example/okidogi.png', 'x'])('Okidogi Barbaracle', []),
            'https://r2.example/okidogi.png');
    });
    it('ohne Karten und ohne Sprite: die graue Flaeche', () => {
        assert.match(bild([])('Unbekannt', []), /^data:image\/svg\+xml/);
    });
});
