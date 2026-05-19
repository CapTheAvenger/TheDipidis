#!/usr/bin/env node
/**
 * Per-file unit-test runner.
 *
 * Why: node --test tests/unit/ runs every file in a single test context,
 * which lets the first file's top-level VM sandbox pollute the next file's
 * globals. The CI workflow (.github/workflows/deploy-pages.yml) already
 * loops file-by-file for that reason — this script mirrors it so
 * `npm test` behaves identically locally.
 */
const { spawnSync } = require('node:child_process');
const { readdirSync } = require('node:fs');
const { join } = require('node:path');

const TEST_DIR = join(__dirname, '..', 'tests', 'unit');
const files = readdirSync(TEST_DIR)
    .filter((f) => f.startsWith('test-') && f.endsWith('.js'))
    .map((f) => join(TEST_DIR, f));

let totalPass = 0;
let totalFail = 0;
const failures = [];

for (const f of files) {
    const r = spawnSync('node', ['--test', f], { encoding: 'utf8' });
    const out = r.stdout + r.stderr;
    const passMatch = out.match(/# pass (\d+)/);
    const failMatch = out.match(/# fail (\d+)/);
    const pass = passMatch ? Number(passMatch[1]) : 0;
    const fail = failMatch ? Number(failMatch[1]) : 0;
    totalPass += pass;
    totalFail += fail;
    if (fail > 0) {
        failures.push({ file: f, fail, output: out });
        console.error(`FAIL  ${f.replace(TEST_DIR, '').replace(/^\//, '')}  (${fail} test${fail === 1 ? '' : 's'})`);
    } else {
        console.log(`pass  ${f.replace(TEST_DIR, '').replace(/^\//, '')}  (${pass})`);
    }
}

console.log('────────────────────────────────────────────');
console.log(`Total: ${totalPass} passed, ${totalFail} failed across ${files.length} files`);

if (totalFail > 0) {
    console.error('\nFailing test output:\n');
    for (const f of failures) {
        console.error(`──── ${f.file} ────`);
        console.error(f.output);
    }
    process.exit(1);
}
