/**
 * Unit test for _formatShortDate in app-meta-call.js. It renders an ISO date
 * as "<day>.<month>." for the Meta Call major-tournament stack. A destructuring
 * bug ([, m, d] bound year+month) rendered "2026-06-12" as "6.2026." instead of
 * "12.6.".
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

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app-meta-call.js'), 'utf8');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(extractTopLevel(src, '_formatShortDate') + '\nthis.f = _formatShortDate;', ctx);
const f = ctx.f;

describe('_formatShortDate', () => {
    it('renders NAIC date day.month', () => {
        assert.equal(f('2026-06-12'), '12.6.');
    });
    it('renders Turin date day.month', () => {
        assert.equal(f('2026-06-06'), '6.6.');
    });
    it('strips leading zeros on both parts', () => {
        assert.equal(f('2026-01-09'), '9.1.');
    });
    it('returns empty for missing or malformed input', () => {
        assert.equal(f(''), '');
        assert.equal(f(null), '');
        assert.equal(f('06/12/2026'), '');
    });
});
