/**
 * Japan-Vorlagen fuer TCG Showdown — scripts/showdown_vorlagen_jp.js
 * Bestellung Hausi 05.11.2026: Tier 1–3 des Japan-Metas, je Deck eine Vorlage.
 * Geprueft wird VERHALTEN (Funktionen werden ausgefuehrt).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const J = require(path.join(ROOT, 'scripts', 'showdown_vorlagen_jp.js'));
const H = J.schreibwegHelfer();

const liste = (tid, archetyp, karten, decks = '1') => karten.map(([anzahl, name, set, nummer]) => ({
    tournament_id: tid, archetype: archetyp, total_decks_in_archetype: decks,
    total_count: String(anzahl), card_name: name, set_code: set, set_number: nummer, type: '',
}));
const SECHZIG = [[4, 'Dreepy', 'TWM', '128'], [3, 'Dragapult ex', 'TWM', '130'], [53, 'Psychic Energy', 'SVE', '5']];
const platz = (tid, archetyp, p, datum) => ({ tournament_id: tid, archetype: archetyp, placement: String(p), date: datum, player: `S${tid}` });

describe('Japan-Vorlagen: Tier wie die Seite „City League“', () => {
    it('Rang 1–3 Tier 1, 4–10 Tier 2, 11–20 Tier 3, ab 21 nichts', () => {
        const zeilen = Array.from({ length: 25 }, (_, i) => ({ archetype: `Deck ${i}`, new_count: String(100 - i) }));
        const t = J.tierEinteilung(zeilen, H);
        assert.ok(t.length === 20, `20 Decks erwartet, ${t.length}`);
        assert.deepEqual([t[0].tier, t[2].tier, t[3].tier, t[9].tier, t[10].tier, t[19].tier], [1, 1, 2, 2, 3, 3]);
    });
    it('Schreibwege werden zusammengelegt, bevor gezaehlt wird', () => {
        const t = J.tierEinteilung([
            { archetype: 'Ogerpon Raging-Bolt', new_count: '78' }, { archetype: 'Raging-Bolt Ogerpon', new_count: '31' },
            { archetype: 'Dragapult', new_count: '100' },
        ], H);
        assert.equal(t[0].archetyp, 'Ogerpon Raging-Bolt');
        assert.ok(t[0].listen === 78 + 31, 'Summe der beiden Schreibwege');
    });
});

describe('Japan-Vorlagen: die Liste', () => {
    it('bester Platz gewinnt, bei Gleichstand das juengste Turnier', () => {
        const analyse = [...liste('1', 'Dragapult', SECHZIG), ...liste('2', 'Dragapult', SECHZIG), ...liste('3', 'Dragapult', SECHZIG)];
        const arch = [platz('1', 'Dragapult', 4, '20 Oct 26'), platz('2', 'Dragapult', 1, '10 Oct 26'), platz('3', 'Dragapult', 1, '18 Oct 26')];
        const b = J.besteListen(analyse, arch, H).get('dragapult');
        assert.equal(b.turnier, '3');
        assert.equal(b.datum, '2026-10-18');
    });
    it('nur Einzellisten mit 60 Karten', () => {
        const analyse = [...liste('1', 'Dragapult', SECHZIG, '2'), ...liste('2', 'Dragapult', SECHZIG.slice(0, 2))];
        const arch = [platz('1', 'Dragapult', 1, '20 Oct 26'), platz('2', 'Dragapult', 1, '20 Oct 26')];
        assert.equal(J.besteListen(analyse, arch, H).get('dragapult'), undefined);
    });
    it('„Mega“ fehlt in der Platzierungsdatei: Rueckfall nur bei genau einem Treffer im Turnier', () => {
        const analyse = liste('7', 'Mega Lucario Hariyama', SECHZIG);
        const eins = J.besteListen(analyse, [platz('7', 'Lucario Hariyama', 2, '10 Oct 26')], H);
        assert.ok(eins.get('hariyama lucario mega').platz === 2, 'Platz aus der Platzierungsdatei');
        const zwei = J.besteListen(analyse, [platz('7', 'Lucario Hariyama', 2, '10 Oct 26'), platz('7', 'Mega Lucario Mega Hariyama', 3, '10 Oct 26')], H);
        assert.equal(zwei.get('hariyama lucario mega'), undefined, 'zwei Kandidaten: nicht raten');
    });
    it('Datum „02 Nov 26“ wird 2026-11-02', () => {
        assert.equal(J.isoDatum('02 Nov 26'), '2026-11-02');
        assert.equal(J.isoDatum('kaputt'), '');
    });
});

describe('Japan-Vorlagen: Datei im Bestand und Wochenlauf', () => {
    it('jede Vorlage im Bestand hat 60 Karten und einen Platz', () => {
        // Regel, kein Wochenwert: die Datei wird im Wochenlauf neu erzeugt.
        const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'showdown_vorlagen_jp.json'), 'utf8'));
        for (const v of d.vorlagen) assert.ok(v.platz >= 1 && [1, 2, 3].includes(v.tier), v.archetyp);
        for (const v of d.vorlagen) assert.ok(v.karten.reduce((s, k) => s + k.anzahl, 0) === 60, `${v.archetyp}: eine Vorlage ist ein Deck mit 60 Karten`);
        assert.equal(d.vorlagen.length + d._meta.ohne_liste.length <= 20, true);
    });
    it('der Wochenlauf erzeugt Vorlagen und JP-Karten nach den Meta-Vorlagen', () => {
        const yml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'weekly-full-update.yml'), 'utf8');
        const a = yml.indexOf('node scripts/showdown_vorlagen.js');
        const b = yml.indexOf('node scripts/showdown_vorlagen_jp.js');
        const c = yml.indexOf('python3 scripts/showdown_jp_karten.py');
        assert.ok(a > 0 && b > a && c > b, 'Reihenfolge: Meta-Vorlagen, Japan-Vorlagen, JP-Karten');
    });
});

describe('Japan-Vorlagen: Legendary-Stadien als Paar (UI-161, 06.11.2026)', () => {
    it('4x M6 75 ohne Partner wird 2x M6 75 + 2x M6 76, Summe bleibt 60', () => {
        const k = J.legendaryTeilen([
            { anzahl: 4, name: 'Legendary Lava Cave', set: 'M6', nummer: '75' },
            { anzahl: 56, name: 'Fire Energy', set: 'MEE', nummer: '2' },
        ], H);
        const lava = k.filter((c) => c.name === 'Legendary Lava Cave').map((c) => `${c.anzahl}x ${c.nummer}`);
        assert.deepEqual(lava, ['2x 75', '2x 76']);
        assert.ok(k.reduce((s, c) => s + c.anzahl, 0) === 60);
    });
    it('ungerade Menge: aufrunden auf ein Paar, eine Basis-Energie weniger', () => {
        const k = J.legendaryTeilen([
            { anzahl: 3, name: 'Legendary Lava Cave', set: 'M6', nummer: '76' },
            { anzahl: 57, name: 'Fire Energy', set: 'MEE', nummer: '2' },
        ], H);
        assert.ok(k.reduce((s, c) => s + c.anzahl, 0) === 60);
        assert.ok(k.find((c) => c.nummer === '75').anzahl === 2 && k.find((c) => c.nummer === '76').anzahl === 2);
    });
    it('steht die Partnerhaelfte schon da, bleibt alles; andere Karten werden nicht angefasst', () => {
        const ein = [{ anzahl: 2, name: 'Legendary Lava Cave', set: 'M6', nummer: '75' }, { anzahl: 2, name: 'Legendary Lava Cave', set: 'M6', nummer: '76' }, { anzahl: 4, name: 'Rare Candy', set: 'MEG', nummer: '125' }];
        assert.deepEqual(J.legendaryTeilen(ein, H), ein);
    });
    it('die ausgelieferte Datei fuehrt keine Haelfte mehr als 2x', () => {
        const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'showdown_vorlagen_jp.json'), 'utf8'));
        const zuViel = d.vorlagen.flatMap((v) => v.karten.filter((c) => H.istLegendaryStadion(c.set, c.nummer) && c.anzahl > 2).map((c) => `${v.archetyp}: ${c.anzahl}x ${c.set} ${c.nummer}`));
        assert.deepEqual(zuViel, []);
    });
});
