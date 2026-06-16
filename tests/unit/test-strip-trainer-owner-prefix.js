/**
 * Unit tests for stripTrainerOwnerPrefix in app-core.js — the single
 * source of truth for splitting a possessive trainer-owner prefix off a
 * card/archetype name. Replaces three individually-incomplete copies
 * (custom-binder's 3-owner list, app-cards-db's straight-quote regex,
 * app-deck-builder's single-word regex).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function extractTopLevel(src, fnName) {
    const re = new RegExp(`function\\s+${fnName}\\s*\\(`);
    const m = re.exec(src);
    if (!m) throw new Error(`Function not found: ${fnName}`);
    const start = m.index;
    const openIdx = src.indexOf('{', start);
    let depth = 0, end = -1;
    for (let i = openIdx; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') depth--;
        if (depth === 0) { end = i + 1; break; }
    }
    return src.slice(start, end);
}

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app-core.js'), 'utf8');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(
    extractTopLevel(src, 'stripTrainerOwnerPrefix')
    + '\nthis.strip = stripTrainerOwnerPrefix;',
    ctx,
);
const strip = ctx.strip;

// The function runs in a vm realm, so its returned object has a different
// Object.prototype than this module's literals — deepStrictEqual would fail
// on the prototype check. Compare the two fields directly instead.
function check(input, owner, base) {
    const r = strip(input);
    assert.equal(r.owner, owner);
    assert.equal(r.base, base);
}

describe('stripTrainerOwnerPrefix', () => {
    it('splits a single-word owner', () => {
        check("Hop's Trevenant", "Hop's", 'Trevenant');
    });
    it("splits N's (the short owner the old custom-binder list knew)", () => {
        check("N's Zoroark ex", "N's", 'Zoroark ex');
    });
    it("splits a multi-word owner (Team Rocket's) the old regexes missed", () => {
        check("Team Rocket's Mewtwo ex", "Team Rocket's", 'Mewtwo ex');
    });
    it('handles the curly apostrophe (U+2019)', () => {
        check('Cynthia’s Garchomp', 'Cynthia’s', 'Garchomp');
    });
    it('takes only the FIRST possessive as the owner', () => {
        check("Erika's Garchomp's Tool", "Erika's", "Garchomp's Tool");
    });
    it('returns an empty owner for a plain card name', () => {
        check('Charizard ex', '', 'Charizard ex');
    });
    it('handles null and empty input', () => {
        check(null, '', '');
        check('', '', '');
    });
});
