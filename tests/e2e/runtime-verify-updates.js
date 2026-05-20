const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const { chromium } = require('playwright');

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
		// eslint-disable-next-line no-await-in-loop
		if (await isServerUp()) return server;
	}

	try {
		server.kill();
	} catch (_) {
		// ignore cleanup failure
	}
	throw new Error('Local server did not start on 127.0.0.1:8000');
}

async function runRuntimeVerification() {
	// Default to whatever browser Playwright installed (chromium on Ubuntu CI,
	// where the workflow runs `npx playwright install --with-deps chromium`).
	// We previously hard-coded { channel: 'msedge' } which works on Win/Mac
	// maintainer machines but fails on CI with "Executable doesn't exist at
	// .../microsoft-edge" — that was the visual-nonmeta failure on the Wave-0
	// deploy. Local devs that prefer Edge can set PW_CHANNEL=msedge.
	const launchOpts = { headless: true };
	if (process.env.PW_CHANNEL) {
		launchOpts.channel = process.env.PW_CHANNEL;
	}
	const browser = await chromium.launch(launchOpts);
	const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

	const checks = [];
	try {
		await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
		checks.push({ name: 'Runtime verification execution', ok: true });

		await page.waitForFunction(
			() => typeof window.switchTab === 'function' && !!document.querySelector('#main-content'),
			null,
			{ timeout: 30000 }
		);
		checks.push({ name: 'Core app bootstrap', ok: true });
	} catch (err) {
		checks.push({
			name: 'Runtime verification execution',
			ok: false,
			error: err && err.message ? err.message : String(err)
		});
	} finally {
		await browser.close();
	}

	return checks;
}

function printSummary(checks) {
	let passed = 0;
	let failed = 0;
	const lines = [];

	checks.forEach((check) => {
		if (check.ok) {
			passed += 1;
			const ln = `[PASS] ${check.name}`;
			console.log(ln);
			lines.push(ln);
		} else {
			failed += 1;
			const ln = `[FAIL] ${check.name} :: ${check.error}`;
			console.log(ln);
			lines.push(ln);
		}
	});

	const footer = [
		'',
		'===== SUMMARY =====',
		`Total checks: ${checks.length}`,
		`Passed: ${passed}`,
		`Failed: ${failed}`,
	];
	footer.forEach((ln) => console.log(ln));

	// Persist the report files that the CI artifact-upload step expects.
	// Without these the upload-artifact step emits a warning every run.
	try {
		fs.writeFileSync('visual-nonmeta-summary.txt', lines.concat(footer).join('\n') + '\n');
		fs.writeFileSync('visual-nonmeta-report.json', JSON.stringify({
			generatedAt: new Date().toISOString(),
			total: checks.length,
			passed,
			failed,
			checks,
		}, null, 2) + '\n');
	} catch (err) {
		console.warn('[WARN] Could not write report files:', err && err.message ? err.message : err);
	}

	return failed === 0 ? 0 : 1;
}

(async () => {
	let serverProcess = null;
	try {
		serverProcess = await startServerIfNeeded();
		const checks = await runRuntimeVerification();
		process.exitCode = printSummary(checks);
	} catch (err) {
		console.log(`[FAIL] Runtime verification execution :: ${err && err.message ? err.message : err}`);
		console.log('\n===== SUMMARY =====');
		console.log('Total checks: 1');
		console.log('Passed: 0');
		console.log('Failed: 1');
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
