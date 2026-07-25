/**
 * Guard against re-introducing the duplicate city_league_analysis*.csv fetch.
 *
 * The City League tab fetched that file TWICE per load, in parallel:
 *   1. app-city-league.js started a background fetch into
 *      window._cityLeagueAnalysisPromise for the FCP-friendly staged load;
 *   2. renderCityLeagueTierList (app-tier-meta.js) fetched it again, because
 *      its prefetchedAnalysisData argument is null at its only call site.
 *
 * In the current format that wastes ~70 KB. In Past Meta the file is 41.4 MB,
 * so the tab pulled 82.8 MB down the wire to show 41.4 MB of data — and the
 * service worker serves /data/ with cache: 'no-store' on purpose (after a
 * stale-data incident), so nothing upstream deduplicated it.
 *
 * Both paths now go through one format-keyed loader. These are source-level
 * assertions because the fetch sites sit inside large IIFEs that cannot be
 * imported in isolation; they fail loudly if either half is reverted.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const R = (f) => fs.readFileSync(path.join(__dirname, '..', '..', 'js', f), 'utf8');
const CITY_LEAGUE = R('app-city-league.js');
const TIER_META = R('app-tier-meta.js');
const META_CARDS = R('app-meta-cards.js');

describe('city_league_analysis CSV is fetched once per format', () => {
    it('the fallback fetch in loadCityLeagueAnalysis stays guarded', () => {
        // That one is legitimate — it only runs when the background load
        // produced nothing — but it must stay behind the reuse check.
        assert.ok(CITY_LEAGUE.includes('if (window._cityLeagueAnalysisPromise)'),
            'the background-load reuse check is gone');
        assert.ok(CITY_LEAGUE.includes('// Nur fetchen wenn Background-Load noch nicht fertig'),
            'the fallback fetch is no longer marked as conditional');
    });

    it('app-meta-cards.js routes through the shared loader', () => {
        assert.ok(META_CARDS.includes("window.getCityLeagueAnalysisData(isPastCl ? 'past' : 'current')"),
            'the Deck Analysis tab fetches the analysis CSV independently again');
        assert.ok(META_CARDS.includes("window.getCityLeagueAnalysisData('past')"),
            'the past-shape guard downloads the file again instead of reusing it');
    });

    it('app-tier-meta.js does not fetch the file itself on the shared path', () => {
        assert.ok(TIER_META.includes('window.getCityLeagueAnalysisData(format)'),
            'the tier list no longer routes through the shared loader');
        // The direct fetch survives only as an unreachable fallback, guarded by
        // a typeof check on the shared loader.
        const idx = TIER_META.indexOf('getCityLeagueAnalysisData');
        const fetchIdx = TIER_META.indexOf('city_league_analysis${formatSuffix}');
        assert.ok(fetchIdx === -1 || fetchIdx > idx,
            'the direct fetch must come after (and be guarded by) the shared loader');
        assert.ok(TIER_META.includes("typeof window.getCityLeagueAnalysisData === 'function'"),
            'the direct fetch is no longer guarded by a shared-loader check');
    });

    it('the shared loader is keyed by format', () => {
        // 'current' and 'past' are different files; one unkeyed promise would
        // hand the wrong rotation's rows to whichever view asked second.
        assert.ok(CITY_LEAGUE.includes('_clAnalysisCache'),
            'the format-keyed cache is gone');
        assert.ok(/_clAnalysisCache\.get\(key\)/.test(CITY_LEAGUE),
            'the loader no longer looks up by format key');
        assert.ok(/_clAnalysisCache\.set\(key,/.test(CITY_LEAGUE),
            'the loader no longer stores by format key');
    });

    it('the cache expires, so a long-lived tab can still refresh', () => {
        // Deduplicating four fetches must not become "never refresh": a PWA
        // left open across a scraper run would otherwise be stuck on stale
        // rows until reload.
        assert.ok(/CL_ANALYSIS_TTL_MS/.test(CITY_LEAGUE),
            'the analysis cache has no expiry');
        assert.ok(/Date\.now\(\) - hit\.ts\) < CL_ANALYSIS_TTL_MS/.test(CITY_LEAGUE),
            'the cache lookup no longer checks the age of the entry');
        assert.ok(CITY_LEAGUE.includes('window.invalidateCityLeagueAnalysisCache'),
            'there is no explicit way to force a refresh');
    });

    it('a failed load is not cached, so the next view retries', () => {
        assert.ok(/_clAnalysisCache\.delete\(key\)/.test(CITY_LEAGUE),
            'a rejected fetch would be memoised and the tab could never recover');
    });

    it('the loader is exported for other modules', () => {
        assert.ok(CITY_LEAGUE.includes('window.getCityLeagueAnalysisData = getCityLeagueAnalysisData'),
            'app-tier-meta.js reaches the loader through window');
    });
});
