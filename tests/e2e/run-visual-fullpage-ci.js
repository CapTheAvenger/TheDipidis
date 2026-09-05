/*
 * BEFUND 05.09.2026: dieser Aufrufer meldete jede Nacht gruen, ohne
 * einen einzigen Test zu fahren.
 *
 * tests/e2e/visual-full-page-coverage.spec.js ist seit dem 22.05.2026
 * 0 Byte gross. Playwright bricht auf einer Datei ohne Test normalerweise
 * ab — `--pass-with-no-tests` unten hat genau das unterdrueckt. Der
 * naechtliche Lauf "Visual Fullpage Coverage" (03:00 UTC) startete also
 * dreieinhalb Monate lang, installierte Node und Chromium, lief durch
 * und setzte einen gruenen Haken unter eine Pruefung, die es nicht gab.
 *
 * Das ist dieselbe Form von Fehler wie ein `exit 0` ohne Buchfuehrung:
 * nicht falsch gerechnet, sondern gar nicht gerechnet — und niemand
 * konnte es sehen. Der Aufrufer sagt jetzt vorher nach, ob es ueberhaupt
 * etwas zu tun gibt, und weigert sich, sonst gruen zu melden.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const BASE_URL = 'http://127.0.0.1:8000/index.html';
const SPEC = path.join(__dirname, 'visual-full-page-coverage.spec.js');

function isServerUp() {
	return new Promise((resolve) => {
		const req = http.get(BASE_URL, { timeout: 2000 }, (res) => {
			res.resume();
			resolve(res.statusCode >= 200 && res.statusCode < 500);
		});
		req.on('error', () => resolve(false));
		req.on('timeout', () => {
			req.destroy();
			resolve(false);
		});
	});
}

function wait(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startServerIfNeeded() {
	const up = await isServerUp();
	if (up) return null;

	const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
	const server = spawn(pythonCmd, ['-m', 'http.server', '8000'], {
		stdio: 'ignore',
		detached: false
	});

	for (let i = 0; i < 20; i += 1) {
		await wait(500);
		if (await isServerUp()) {
			return server;
		}
	}

	try {
		server.kill();
	} catch (_) {
		// ignore cleanup failure
	}
	throw new Error('Local server did not start on 127.0.0.1:8000');
}

function runPlaywright() {
	return new Promise((resolve, reject) => {
		const playwrightCli = require.resolve('@playwright/test/cli');
		const args = [
			'test',
			'tests/e2e/visual-full-page-coverage.spec.js',
			'--config=playwright.config.js',
			// KEIN --pass-with-no-tests. Eine Suite, die nichts findet,
			// hat nichts geprueft — und das soll sie auch sagen duerfen.
			'--reporter=line'
		];

		const child = spawn(process.execPath, [playwrightCli, ...args], { stdio: 'inherit' });
		child.on('error', reject);
		child.on('close', (code) => resolve(code || 0));
	});
}

/** Gibt es ueberhaupt einen Test in der Datei? */
function specIstLeer() {
	let inhalt = '';
	try {
		inhalt = fs.readFileSync(SPEC, 'utf-8');
	} catch (err) {
		return 'die Datei gibt es nicht: ' + SPEC;
	}
	if (inhalt.trim() === '') return 'die Datei ist leer (0 Byte)';
	if (!/\btest\s*\(|\btest\.describe\s*\(/.test(inhalt)) {
		return 'die Datei enthaelt keinen einzigen test(...)-Aufruf';
	}
	return null;
}

(async () => {
	const leer = specIstLeer();
	if (leer) {
		console.error(
			'[FAIL] Ganzseiten-Suite: ' + leer + '.\n'
			+ '       Dieser Lauf hat nichts geprueft und meldet deshalb auch\n'
			+ '       nichts Gruenes. Bis zum 05.09.2026 tat er beides —\n'
			+ '       dreieinhalb Monate lang, mit --pass-with-no-tests.\n'
			+ '       Entweder die Suite bekommt Inhalt, oder der naechtliche\n'
			+ '       Lauf gehoert abgeschaltet. Was dazu bekannt ist, steht in\n'
			+ '       docs/geparkte-features.md.');
		process.exitCode = 1;
		return;
	}
	let serverProcess = null;
	try {
		serverProcess = await startServerIfNeeded();
		const code = await runPlaywright();
		process.exitCode = code;
	} catch (err) {
		console.error('[FAIL] Visual fullpage CI run ::', err && err.message ? err.message : err);
		process.exitCode = 1;
	} finally {
		if (serverProcess) {
			try {
				serverProcess.kill();
			} catch (_) {
				// ignore cleanup failure
			}
		}
	}
})();