/**
 * Every file in js/ must parse.
 *
 * The unit tests here work by extracting functions out of the sources
 * with regexes and evaluating those fragments, which is what lets them
 * test browser code without a DOM — but it also means a file can be
 * syntactically broken while its tests stay green. That happened: a
 * botched edit left a duplicated function tail in app-utils.js, all 28
 * conversion tests passed, and the file would have thrown on load and
 * taken every later script with it.
 *
 * A parse check costs milliseconds and closes that gap.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const JS_DIR = path.join(ROOT, 'js');

function jsFiles(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        // vendor/ is third-party and minified; not ours to police.
        if (entry.isDirectory()) {
            if (entry.name !== 'vendor' && entry.name !== 'node_modules') {
                out.push(...jsFiles(full));
            }
        } else if (entry.name.endsWith('.js')) {
            out.push(full);
        }
    }
    return out;
}

describe('js/ parses', () => {
    const files = jsFiles(JS_DIR);

    it('finds the sources at all', () => {
        assert.ok(files.length > 10, `only ${files.length} files found in js/`);
    });

    for (const file of files) {
        const rel = path.relative(ROOT, file);
        it(rel, () => {
            const src = fs.readFileSync(file, 'utf8');
            // new vm.Script parses without running — exactly the check the
            // browser does before executing a <script>.
            assert.doesNotThrow(() => new vm.Script(src, { filename: rel }));
        });
    }
});
