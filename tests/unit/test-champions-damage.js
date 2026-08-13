/**
 * Champions damage model.
 *
 * This is the layer everything above it inherits: a matchup table and a
 * calculator that disagree, or agree on a wrong number, are worse than
 * neither. So the model is pinned against a set Silph Scope published,
 * before any UI was written:
 *
 *   Kingambit, Adamant, 32 HP / 32 Atk / 1 SpD / 1 Spe
 *     -> 207 / 205 / 140 / 72 / 106 / 71   (all six exact)
 *   Iron Head into Sneasler (2 HP / 32 Atk / 32 Spe)
 *     -> 117–138 damage, 75–88 % of 157 HP, 2HKO
 *
 * If the stat model drifts, these break first.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'champions-damage.js'), 'utf8');
const DEX = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'champions_pokedex.json'), 'utf8'));
const RES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'champions_resources.json'), 'utf8'));
const CHART = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'champions_type_chart.json'), 'utf8'));

const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(SRC, sandbox);
const D = sandbox.ChampionsDamage;
const eff = D.makeChart(CHART);

const mon = (name) => DEX.entries.find(e => e.en === name);
const move = (name) => RES.entries.find(e => e.cat === 'move' && e.en === name);

describe('the published Kingambit set reproduces exactly', () => {
    const k = mon('Kingambit');
    const stats = D.buildStats(k, { hp: 32, atk: 32, def: 0, spa: 0, spd: 1, spe: 1 }, 'Adamant');
    const want = { hp: 207, atk: 205, def: 140, spa: 72, spd: 106, spe: 71 };
    for (const key of Object.keys(want)) {
        it(`${key} = ${want[key]}`, () => assert.equal(stats[key], want[key]));
    }
});

describe('Iron Head into Sneasler', () => {
    const atkStats = D.buildStats(mon('Kingambit'),
        { hp: 32, atk: 32, spd: 1, spe: 1 }, 'Adamant');
    const defMon = mon('Sneasler');
    const defStats = D.buildStats(defMon, { hp: 2, atk: 32, spe: 32 }, 'Jolly');
    const ih = move('Iron Head');
    const range = D.damageRange({
        move: ih,
        attackerStats: atkStats, defenderStats: defStats,
        attackerTypes: ['Dark', 'Steel'],
        effectiveness: eff(ih.type, [defMon.t1, defMon.t2]),
    });

    it('deals 117–138', () => {
        assert.equal(range.min, 117);
        assert.equal(range.max, 138);
    });

    it('reads as 75–88 % of 157 HP', () => {
        assert.equal(defStats.hp, 157);
        assert.equal(Math.round(range.minPct), 75);
        assert.equal(Math.round(range.maxPct), 88);
    });

    it('is a 2HKO, on every roll', () => {
        assert.equal(range.ko.hits, 2);
        assert.equal(range.ko.chance, 1);
    });

    it('gets STAB — Kingambit is Steel', () => {
        assert.equal(range.stab, 1.5);
    });
});

describe('the KO statement never overstates', () => {
    it('calls it OHKO only when the lowest roll kills', () => {
        // Field-wise, not deepEqual: the object is built inside the vm
        // context, so its prototype belongs to another realm.
        const ko = D.koChance(new Array(16).fill(100), 100);
        assert.equal(ko.hits, 1);
        assert.equal(ko.chance, 1);
    });

    it('reports a share when only some rolls reach it', () => {
        // 12 of 16 rolls kill — that is not "OHKO", it is 75 %.
        const rolls = [...new Array(4).fill(99), ...new Array(12).fill(101)];
        const ko = D.koChance(rolls, 100);
        assert.equal(ko.hits, 1);
        assert.equal(ko.chance, 0.75);
        assert.notEqual(ko.chance, 1, 'a partial OHKO must not read as certain');
    });

    it('falls through to 2HKO when no single roll kills', () => {
        const ko = D.koChance(new Array(16).fill(60), 100);
        assert.equal(ko.hits, 2);
        assert.equal(ko.chance, 1);
    });

    it('a real pairing where only the top rolls kill', () => {
        // Constructed so the boundary sits inside the roll spread.
        const rolls = D.ROLLS.map(r => Math.floor(120 * r));   // 102 … 120
        const ko = D.koChance(rolls, 115);
        assert.equal(ko.hits, 1);
        assert.ok(ko.chance > 0 && ko.chance < 1, `chance was ${ko.chance}`);
    });
});

describe('the type chart', () => {
    it('has all 18 attacking types', () => {
        assert.equal(Object.keys(CHART.chart).length, 18);
    });

    it('gets the immunities right', () => {
        assert.equal(eff('Ground', ['Flying']), 0);
        assert.equal(eff('Ghost', ['Normal']), 0);
        assert.equal(eff('Poison', ['Steel']), 0);
        assert.equal(eff('Psychic', ['Dark']), 0);
        assert.equal(eff('Dragon', ['Fairy']), 0);
        assert.equal(eff('Normal', ['Ghost']), 0);
        assert.equal(eff('Electric', ['Ground']), 0);
    });

    it('multiplies across both defender types', () => {
        assert.equal(eff('Fighting', ['Dark', 'Steel']), 4);      // Kingambit
        assert.equal(eff('Fire', ['Grass', 'Steel']), 4);
        assert.equal(eff('Water', ['Fire', 'Ground']), 4);
        assert.equal(eff('Grass', ['Water', 'Flying']), 1);       // 2 x 0.5
    });

    it('treats an unlisted pairing as neutral', () => {
        assert.equal(eff('Normal', ['Water']), 1);
        assert.equal(eff('Steel', ['Dark']), 1);
        assert.equal(eff(null, ['Water']), 1);
        assert.equal(eff('Nonsense', ['Water']), 1);
    });

    it('is symmetric with the Pokédex weakness display for one case', () => {
        // Sneasler is Fighting/Poison; Psychic hits it 4x.
        const s = mon('Sneasler');
        assert.equal(eff('Psychic', [s.t1, s.t2]), 4);
    });
});

describe('immunity and non-damaging moves', () => {
    const stats = { hp: 150, atk: 200, def: 100, spa: 100, spd: 100, spe: 100 };

    it('an immune matchup deals zero and claims no KO', () => {
        const r = D.damageRange({
            move: move('Iron Head'), attackerStats: stats, defenderStats: stats,
            attackerTypes: ['Steel'], effectiveness: 0,
        });
        assert.equal(r.max, 0);
        assert.equal(r.ko, null);
        assert.equal(r.immune, true);
    });

    it('a status move has no range at all', () => {
        const protect = move('Protect');
        assert.ok(protect, 'Protect missing from the reference');
        assert.equal(D.damageRange({
            move: protect, attackerStats: stats, defenderStats: stats, attackerTypes: [],
        }), null);
    });

    it('a move without power yields null rather than zero damage', () => {
        assert.equal(D.damageRange({
            move: { type: 'Normal', damage_class: 'Physical' },
            attackerStats: stats, defenderStats: stats, attackerTypes: [],
        }), null);
    });

    it('never returns a damage below 1 on a hit', () => {
        const r = D.damageRange({
            move: { type: 'Normal', power: 10, damage_class: 'Physical' },
            attackerStats: { ...stats, atk: 1 }, defenderStats: { ...stats, def: 999 },
            attackerTypes: [], effectiveness: 0.25,
        });
        assert.ok(r.min >= 1, `min was ${r.min}`);
    });
});

describe('modifiers are opt-in and explicit', () => {
    const base = {
        move: move('Iron Head'),
        attackerStats: { atk: 205, spa: 72, hp: 207, def: 140, spd: 106, spe: 71 },
        defenderStats: { hp: 157, def: 80, spd: 100 },
        attackerTypes: ['Dark', 'Steel'], effectiveness: 1,
    };

    it('a spread move in doubles loses a quarter', () => {
        const single = D.damageRange(base);
        const spread = D.damageRange({ ...base, spread: true });
        assert.ok(spread.max < single.max);
        assert.equal(spread.max, Math.floor(single.max * 0.75 / 1) || spread.max);
    });

    it('Life Orb raises it, Expert Belt only when super effective', () => {
        const plain = D.damageRange(base).max;
        assert.ok(D.damageRange({ ...base, item: 'Life Orb' }).max > plain);
        assert.equal(D.damageRange({ ...base, item: 'Expert Belt' }).max, plain,
            'Expert Belt must do nothing at neutral effectiveness');
        const superEff = { ...base, effectiveness: 2 };
        assert.ok(D.damageRange({ ...superEff, item: 'Expert Belt' }).max
            > D.damageRange(superEff).max);
    });

    it('an unknown item changes nothing rather than guessing', () => {
        assert.equal(D.damageRange({ ...base, item: 'Sitrus Berry' }).max,
                     D.damageRange(base).max);
    });
});

describe('stat helpers', () => {
    it('nature moves the right stat by ±10 %', () => {
        assert.equal(D.natureMult('Adamant', 'atk'), 1.1);
        assert.equal(D.natureMult('Adamant', 'spa'), 0.9);
        assert.equal(D.natureMult('Adamant', 'def'), 1);
        assert.equal(D.natureMult('Hardy', 'atk'), 1, 'a neutral nature must not shift anything');
        assert.equal(D.natureMult(undefined, 'atk'), 1);
    });

    it('HP never takes a nature', () => {
        const a = D.buildStats(mon('Kingambit'), { hp: 32 }, 'Adamant');
        const b = D.buildStats(mon('Kingambit'), { hp: 32 }, 'Bold');
        assert.equal(a.hp, b.hp);
    });

    it('a speed tie is not "faster"', () => {
        assert.equal(D.speedComparison(100, 100).faster, false);
        assert.equal(D.speedComparison(100, 100).tie, true);
        assert.equal(D.speedComparison(101, 100).faster, true);
    });

    it('accepts a flat base map as well as Pokédex entries', () => {
        const flat = D.buildStats({ hp: 100, atk: 135, def: 120, spa: 60, spd: 85, spe: 50 },
            { hp: 32, atk: 32, spd: 1, spe: 1 }, 'Adamant');
        assert.equal(flat.atk, 205);
        assert.equal(flat.hp, 207);
    });
});

describe('the move data this rests on', () => {
    it('the reference carries power for a useful number of moves', () => {
        const moves = RES.entries.filter(e => e.cat === 'move');
        const withPower = moves.filter(m => Number(m.power) > 0);
        assert.ok(moves.length > 400, `only ${moves.length} moves`);
        assert.ok(withPower.length > 200, `only ${withPower.length} moves carry power`);
    });

    it('moves without accuracy are left blank, not assumed to be 100', () => {
        // 131 moves have no accuracy in the file. Filling that in would
        // be inventing data; the UI shows "—".
        const missing = RES.entries.filter(e => e.cat === 'move' && e.accuracy == null);
        assert.ok(missing.length > 0);
        assert.doesNotMatch(SRC, /accuracy[^\n]*(\|\|\s*100|\?\?\s*100)/,
            'accuracy must not default to 100 in the model');
    });
});
