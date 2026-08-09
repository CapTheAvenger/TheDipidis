/**
 * Honest price display: wishlist headline + mapping-trust marker.
 *
 * Reported: N's Darmanitan SVP 181 shown at 4,66 € on a ~16 € card. The
 * mapping was RIGHT (816614: trend 16,70 / avg30 15,24 vs the live page's
 * 16,11 / 15,68; the sibling sits at 34,37 / 28,71). The 4,66 € was
 * eur_low — Cardmarket's cheapest offer across ALL conditions, languages
 * and countries — while the link next to it opens the DE/EN-filtered page
 * starting at 14,99 €. Verified: eur_low was used as the headline in
 * exactly one place (the wishlist) and trend >= 2x low holds on 15.040 of
 * 17.346 priced rows, so the wishlist total was systematically far low.
 *
 * Second half: mapping_status now reaches the frontend so unverified
 * product mappings are visible. The marker sits NEXT TO the number — the
 * reported card is itself unverified, and suppressing would replace its
 * correct price with nothing; only 390 of 1.544 unverified rows are even
 * above 5 €.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const FC = fs.readFileSync(path.join(ROOT, 'js', 'firebase-collection.js'), 'utf8');
const CORE = fs.readFileSync(path.join(ROOT, 'js', 'app-core.js'), 'utf8');

function loadBadge() {
    const m = FC.match(/function priceTrustBadge\(card, cmUrl\) \{[\s\S]*?\n\}\n/);
    if (!m) throw new Error('priceTrustBadge not found');
    const ns = {};
    new Function('window', 'escapeHtml', 'exports',
        m[0] + 'exports.fn = priceTrustBadge;')(
        globalThisStub(), (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'), ns);
    return ns.fn;
}
let _flag = true;
function globalThisStub() { return { get cardDBHasMappingStatus() { return _flag; } }; }

describe('wishlist headline price', () => {
    it('uses the trend, not the floor — the reported bug', () => {
        assert.ok(/const trendRaw = card\.eur_price \|\| card\.eur_low;/.test(FC));
        assert.ok(/const price = trendRaw \? parseLocaleNumber\(trendRaw, 0\) : 0;/.test(FC),
            'headline must read the trend; eur_low is the all-conditions floor');
        assert.ok(!/const wishlistPriceRaw = card\.eur_low \|\| card\.eur_price;\s*\n\s*const price = wishlistPriceRaw/.test(FC),
            'the old low-as-headline binding is back');
    });

    it('the wishlist total follows the same number as the headline', () => {
        const m = FC.match(/if \(!isNaN\(price\) && price > 0\) totalValue \+= price \* wantedCount;/);
        assert.ok(m, 'total must accumulate the same `price` the tile shows');
    });

    it('eur_low still drives the budget pill and stays byte-identical with the bot', () => {
        assert.ok(/const wishlistPriceRaw = lowRaw;/.test(FC),
            'the pill answers "can I buy at my target NOW" — that is the floor');
        assert.ok(/buildWishlistTargetPill\(wishlistPriceRaw, maxPrice\)/.test(FC));
        const bot = fs.readFileSync(path.join(ROOT, 'scripts', 'send_price_alerts.py'), 'utf8');
        assert.ok(/eur_low/.test(bot), 'the Telegram alert must keep the same metric as the pill');
    });

    it('the floor is still visible, as a secondary line', () => {
        assert.ok(/const lowDisplay = \(!isNaN\(lowPrice\) && lowPrice > 0 && lowPrice < price\)/.test(FC));
        assert.ok(/ab \$\{lowPrice\.toFixed\(2\)/.test(FC));
    });
});

describe('price trust marker', () => {
    it('marks an unverified mapping', () => {
        _flag = true;
        const badge = loadBadge();
        const out = badge({ mapping_status: 'unverified' }, 'https://cm/x');
        assert.match(out, /nicht verifiziert/);
        assert.match(out, /href="https:\/\/cm\/x"/);
    });

    it('stays silent for verified rows', () => {
        _flag = true;
        const badge = loadBadge();
        assert.equal(badge({ mapping_status: 'ok' }, 'https://cm/x'), '');
    });

    it('never fires on a dataset that predates the field (stale SW chunk, Prize Pack prints)', () => {
        _flag = false;
        const badge = loadBadge();
        assert.equal(badge({ mapping_status: 'unverified' }, ''), '',
            'missing field must not read as unverified — that would flag the whole DB');
        _flag = true;
        const badge2 = loadBadge();
        assert.equal(badge2({}, ''), '', 'a card without the field is not "unverified"');
        assert.equal(badge2(null, ''), '');
    });

    it('is a badge NEXT TO the price, never a replacement', () => {
        // The reported card is itself unverified with a correct price;
        // suppression would hand back "no answer" instead of a right one.
        assert.ok(/\$\{priceDisplay\}<\/a>\$\{priceTrustBadge\(card, cmUrl\)\}/.test(FC)
               || /\$\{priceDisplay\}<\/div>\`\}\$\{priceTrustBadge\(card, cmUrl\)\}/.test(FC),
            'badge must be appended to the rendered price, not swapped in for it');
        const m = FC.match(/function priceTrustBadge\(card, cmUrl\) \{[\s\S]*?\n\}\n/)[0];
        assert.ok(!/priceDisplay|N\/A/.test(m), 'the badge must not decide the number');
    });

    it('is feature-detected once per dataset, not per card', () => {
        assert.ok(/window\.cardDBHasMappingStatus = allCardsDatabase\.some\(/.test(CORE));
        assert.ok(/c\.mapping_status !== undefined && c\.mapping_status !== ''/.test(CORE));
    });
});
