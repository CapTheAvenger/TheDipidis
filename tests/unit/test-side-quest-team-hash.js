/**
 * Unit tests for the Side Quest team-mark identity hash.
 *
 * The user's hard requirement: a team they marked ("will ich
 * probieren" / "fand ich gut" / "nicht nochmal") must stay marked even
 * when the SAME 6-mon composition re-enters the top 20 under a
 * different pilot — "Person X plays Person Y's team and does well, so
 * Y's team drops out and X's identical copy takes its place". The mark
 * therefore has to key off the team CONTENT, not the trainer, rank, or
 * replica code (which differs per in-game share even for identical
 * teams).
 *
 * These tests mirror teamIdentityHash() from js/app-side-quest.js. Keep
 * the mirror in lockstep with the production function — if a maintainer
 * changes the hashing there, the "stability" assertions below are the
 * tripwire.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// ── Mirror of js/app-side-quest.js teamIdentityHash() ───────────────
function teamIdentityHash(team) {
    const mons = (team.pokemon || []).map(p => {
        const moves = (p.moves || [])
            .map(m => String(m).toLowerCase().trim())
            .filter(Boolean)
            .sort();
        return [
            String(p.name || '').toLowerCase().trim(),
            String(p.item || '').toLowerCase().trim(),
            String(p.ability || '').toLowerCase().trim(),
            moves.join(','),
        ].join('|');
    }).sort();
    const canonical = mons.join(';');
    let h = 0x811c9dc5;
    for (let i = 0; i < canonical.length; i++) {
        h ^= canonical.charCodeAt(i);
        h = (h * 0x01000193) >>> 0;
    }
    return 't_' + h.toString(36);
}

// A representative 2-mon team. Real teams have 6 but the hash logic is
// per-mon-then-sorted, so 2 exercises every code path.
function baseTeam(overrides = {}) {
    return Object.assign({
        rank: 1,
        trainer: 'Hiroshi Onishi',
        team_name: "cona's PJCS 2026 Champion Team",
        replica_code: '42TTHSSH9V',
        pokemon: [
            {
                name: 'Charizard', item: 'Charizardite Y', ability: 'Blaze',
                tera_type: 'Fire', evs: '16 HP / 25 Def / 12 SpA / 13 Spe',
                nature: 'Modest',
                moves: ['Heat Wave', 'Weather Ball', 'Solar Beam', 'Protect'],
            },
            {
                name: 'Kingambit', item: 'Occa Berry', ability: 'Defiant',
                tera_type: 'Flying', evs: '32 HP / 32 Atk / 1 SpD / 1 Spe',
                nature: 'Adamant',
                moves: ['Kowtow Cleave', 'Iron Head', 'Sucker Punch', 'Protect'],
            },
        ],
    }, overrides);
}

describe('Side Quest — teamIdentityHash stability (marks survive metadata churn)', () => {

    it('is stable for the same team', () => {
        assert.equal(teamIdentityHash(baseTeam()), teamIdentityHash(baseTeam()));
    });

    it('ignores trainer name change (the core requirement)', () => {
        const a = baseTeam({ trainer: 'Hiroshi Onishi' });
        const b = baseTeam({ trainer: 'Some Copycat' });
        assert.equal(teamIdentityHash(a), teamIdentityHash(b),
            'a copied team under a different pilot must hash the same');
    });

    it('ignores rank, team_name and replica_code', () => {
        const a = baseTeam({ rank: 1, team_name: 'Original', replica_code: 'AAA111' });
        const b = baseTeam({ rank: 14, team_name: 'Renamed', replica_code: 'ZZZ999' });
        assert.equal(teamIdentityHash(a), teamIdentityHash(b));
    });

    it('ignores EV / nature / tera tweaks (a lightly-tuned copy still matches)', () => {
        const b = baseTeam();
        b.pokemon[0].evs = '4 HP / 252 SpA / 252 Spe';
        b.pokemon[0].nature = 'Timid';
        b.pokemon[0].tera_type = 'Grass';
        assert.equal(teamIdentityHash(baseTeam()), teamIdentityHash(b),
            'spread/tera changes should not count as a different team');
    });

    it('is independent of move order within a mon', () => {
        const b = baseTeam();
        b.pokemon[0].moves = ['Protect', 'Solar Beam', 'Heat Wave', 'Weather Ball'];
        assert.equal(teamIdentityHash(baseTeam()), teamIdentityHash(b));
    });

    it('is independent of Pokémon order within the team', () => {
        const b = baseTeam();
        b.pokemon = [baseTeam().pokemon[1], baseTeam().pokemon[0]];
        assert.equal(teamIdentityHash(baseTeam()), teamIdentityHash(b));
    });

    it('is case- and whitespace-insensitive', () => {
        const b = baseTeam();
        b.pokemon[0].name = '  charizard ';
        b.pokemon[0].item = 'charizardite y';
        b.pokemon[0].moves = ['  heat wave', 'WEATHER BALL', 'solar beam', 'protect'];
        assert.equal(teamIdentityHash(baseTeam()), teamIdentityHash(b));
    });
});

describe('Side Quest — teamIdentityHash discrimination (genuinely different teams differ)', () => {

    it('changes when a move changes', () => {
        const b = baseTeam();
        b.pokemon[0].moves = ['Heat Wave', 'Weather Ball', 'Overheat', 'Protect'];
        assert.notEqual(teamIdentityHash(baseTeam()), teamIdentityHash(b));
    });

    it('changes when an item changes', () => {
        const b = baseTeam();
        b.pokemon[1].item = 'Assault Vest';
        assert.notEqual(teamIdentityHash(baseTeam()), teamIdentityHash(b));
    });

    it('changes when an ability changes', () => {
        const b = baseTeam();
        b.pokemon[1].ability = 'Supreme Overlord';
        assert.notEqual(teamIdentityHash(baseTeam()), teamIdentityHash(b));
    });

    it('changes when a species changes', () => {
        const b = baseTeam();
        b.pokemon[0].name = 'Charizard-Mega-X';
        assert.notEqual(teamIdentityHash(baseTeam()), teamIdentityHash(b));
    });

    it('produces the t_ prefix and a non-empty key', () => {
        const h = teamIdentityHash(baseTeam());
        assert.match(h, /^t_[0-9a-z]+$/);
    });

    it('handles an empty team without throwing', () => {
        assert.equal(teamIdentityHash({ pokemon: [] }), teamIdentityHash({ pokemon: [] }));
        assert.equal(teamIdentityHash({}), teamIdentityHash({ pokemon: [] }));
    });
});
