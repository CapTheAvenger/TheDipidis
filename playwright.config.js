const fs = require('fs');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const EDGE_PATH = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const launchOptions = {};
const use = {
	headless: true,
	viewport: { width: 1280, height: 800 }
};

if (fs.existsSync(CHROME_PATH)) {
	launchOptions.executablePath = CHROME_PATH;
} else if (fs.existsSync(EDGE_PATH)) {
	use.channel = 'msedge';
}

if (Object.keys(launchOptions).length) {
	use.launchOptions = launchOptions;
}

module.exports = {
	testDir: 'tests/e2e',
	timeout: 60_000,
	expect: {
		timeout: 15_000,
		toHaveScreenshot: {
			threshold: 0.2,
			maxDiffPixelRatio: 0.02
		}
	},
	use,
	snapshotPathTemplate: '{testDir}/{testFileDir}/__snapshots__/{testFilename}/{arg}{ext}'
};
