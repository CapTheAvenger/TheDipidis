/**
 * Puppeteer config — single source of truth for the Chromium cache
 * location.
 *
 * Render Free has no persistent disk, so every deploy re-downloads
 * Chromium. The default cache dir is `~/.cache/puppeteer`
 * (= /opt/render/.cache/puppeteer on Render) but the home-cache
 * doesn't reliably survive the build → runtime transition on
 * Render's containers — the install lands there but the launcher
 * can't find it again at start time.
 *
 * Pinning the dir to `<bot/>/.cache/puppeteer` puts the install
 * inside the repo's build output, which Render mounts intact as the
 * service's working directory (`rootDir: bot`). Install and launch
 * both resolve __dirname to the same place → no path mismatch.
 *
 * This file uses .cjs explicitly because package.json declares
 * "type": "module" and we want CommonJS semantics so Puppeteer's
 * sync loader can require() it.
 */

const { join } = require('path');

module.exports = {
    cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
