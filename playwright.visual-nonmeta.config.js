const baseConfig = require('./playwright.config');

/** @type {import('@playwright/test').PlaywrightTestConfig} */
module.exports = {
    ...baseConfig,
    use: {
        ...baseConfig.use,
    },
    workers: 1,
    grep: /Card Action Buttons|Navigation|City League Tab|Rarity Switcher Modal|Cards Database Tab/,
    reporter: [['json', { outputFile: 'visual-nonmeta-report.json' }]],
    webServer: {
        command: 'python -m http.server 8000',
        url: 'http://127.0.0.1:8000/index.html',
        reuseExistingServer: true,
        timeout: 120_000,
    },
};
