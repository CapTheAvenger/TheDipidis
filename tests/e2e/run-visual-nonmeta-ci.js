const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..', '..');
const reportFile = path.join(rootDir, 'visual-nonmeta-report.json');
const summaryFile = path.join(rootDir, 'visual-nonmeta-summary.txt');

function writeSummary(lines) {
    fs.mkdirSync(path.dirname(summaryFile), { recursive: true });
    fs.writeFileSync(summaryFile, `${lines.join('\n')}\n`, 'utf8');
}

function summarizeReport() {
    if (!fs.existsSync(reportFile)) {
        writeSummary([
            'Visual Non-Meta Summary',
            `Generated: ${new Date().toISOString()}`,
            'Result: report file missing',
        ]);
        return;
    }

    let report;
    try {
        report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
    } catch {
        writeSummary([
            'Visual Non-Meta Summary',
            `Generated: ${new Date().toISOString()}`,
            'Result: invalid JSON report',
        ]);
        return;
    }

    const stats = report?.stats || {};
    const errors = Array.isArray(report?.errors) ? report.errors : [];
    const firstError = errors[0]?.message || 'none';

    writeSummary([
        'Visual Non-Meta Summary',
        `Generated: ${new Date().toISOString()}`,
        `Expected: ${stats.expected ?? 0}`,
        `Unexpected: ${stats.unexpected ?? 0}`,
        `Flaky: ${stats.flaky ?? 0}`,
        `Skipped: ${stats.skipped ?? 0}`,
        `DurationMs: ${Math.round(stats.duration ?? 0)}`,
        `Errors: ${errors.length}`,
        `FirstError: ${firstError}`,
    ]);
}

function run() {
    const playwrightCli = require.resolve('@playwright/test/cli');
    const child = spawn(process.execPath, [playwrightCli, 'test', '-c', 'playwright.visual-nonmeta.config.js'], {
        cwd: rootDir,
        stdio: 'inherit',
        shell: false,
    });

    child.on('close', (code) => {
        summarizeReport();
        process.exit(code ?? 1);
    });
}

run();
