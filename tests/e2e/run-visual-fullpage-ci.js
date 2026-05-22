const { spawn } = require('child_process');
const http = require('http');

const BASE_URL = 'http://127.0.0.1:8000/index.html';

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
			'--pass-with-no-tests',
			'--reporter=line'
		];

		const child = spawn(process.execPath, [playwrightCli, ...args], { stdio: 'inherit' });
		child.on('error', reject);
		child.on('close', (code) => resolve(code || 0));
	});
}

(async () => {
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