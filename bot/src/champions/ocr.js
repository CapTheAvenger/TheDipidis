/**
 * Best-effort OCR: pull a 10-character team / replica code out of a
 * screenshot (e.g. the in-game "Team ID: XEX629QEEY" banner).
 *
 * The in-game code sits in a small top banner, while the Pokémon names
 * below it are large and clear — so a naive full-image pass tends to
 * grab a 10-letter name ("TYPHLOSION") instead. Defences:
 *   1. OCR the top strip (upscaled) in several preprocessings — plain
 *      high-contrast, binarised, and inverted-binarised — because the
 *      banner is light text on a glossy coloured background and the best
 *      polarity/threshold varies with the photo.
 *   2. Read each strip in single-LINE page-segmentation mode (PSM 7),
 *      which is far more reliable for one short code than the default
 *      auto-layout mode.
 *   3. CONSENSUS VOTE across all variants: a single bad read (e.g. a 9
 *      misread as 0) gets outvoted by the variants that got it right.
 *   4. Only accept a real code: the token right after "ID", or a MIXED
 *      alphanumeric run (codes have letters AND digits — rejects names).
 *
 * tesseract.js is pure-WASM (no system binary), lazily downloads its eng
 * model on first use, and we terminate the worker after each call to
 * keep the Render Free dyno's memory in check. Everything is wrapped so
 * a failure degrades to "couldn't read it" rather than crashing.
 */

import sharp from 'sharp';

// In-game keyboard only offers A–Z and 0–9 (symbols + space greyed out);
// codes are uppercase, exactly 10 chars. Restricting OCR to that alphabet
// stops tesseract resolving an ambiguous glyph to an impossible char.
// ":" + space are kept only to delimit the "Team ID:" label (pickCode
// strips them). Confusable letters (I/O/Z) are handled in canonicalize.
const WHITELIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789: ';
const TOP_FRACTION = 0.30;          // the "Team ID" banner lives up top
const BANNER_WIDTH = 2400;          // upscale small banner text for OCR

async function _safe(fn) {
    try { return await fn(); } catch (_) { return null; }
}

async function bannerCrop(buf) {
    const meta = await sharp(buf).metadata();
    const h = meta.height || 0;
    if (!h || !meta.width) return null;
    const cropH = Math.max(1, Math.round(h * TOP_FRACTION));
    return { width: meta.width, height: cropH };
}

// Variant A — full image, light sharpening. PSM 6 (uniform block).
function vFull(buf) {
    return sharp(buf).grayscale().resize({ width: 2000, withoutEnlargement: false })
        .normalize().sharpen().toFormat('png').toBuffer();
}
// Variant B — banner strip, strong local contrast (grey). PSM 7 (one line).
async function vBanner(buf) {
    const c = await bannerCrop(buf); if (!c) return null;
    return sharp(buf).extract({ left: 0, top: 0, width: c.width, height: c.height })
        .grayscale().resize({ width: BANNER_WIDTH, withoutEnlargement: false })
        .normalize().median(1).linear(1.4, -35).sharpen().toFormat('png').toBuffer();
}
// Variant C — banner strip, binarised (dark text on white).
async function vBannerBin(buf) {
    const c = await bannerCrop(buf); if (!c) return null;
    return sharp(buf).extract({ left: 0, top: 0, width: c.width, height: c.height })
        .grayscale().resize({ width: BANNER_WIDTH, withoutEnlargement: false })
        .normalize().threshold(150).toFormat('png').toBuffer();
}
// Variant D — banner strip, inverted then binarised (for light-on-dark).
async function vBannerInv(buf) {
    const c = await bannerCrop(buf); if (!c) return null;
    return sharp(buf).extract({ left: 0, top: 0, width: c.width, height: c.height })
        .grayscale().negate().resize({ width: BANNER_WIDTH, withoutEnlargement: false })
        .normalize().threshold(150).toFormat('png').toBuffer();
}

function isCode(tok) {
    return /[A-Z]/.test(tok) && /[0-9]/.test(tok);   // letters AND digits
}

// The in-game Team-ID keyboard greys out the letters I, O and Z (so a
// code can never be confused with the digits 1, 0, 2). A code therefore
// CANNOT contain I/O/Z — so any such glyph the OCR produced is really the
// look-alike digit. (Caveat: a real 9 misread as O would become 0 here;
// the consensus vote across variants is what guards against that.)
function canonicalizeCode(tok) {
    return tok.replace(/I/g, '1').replace(/O/g, '0').replace(/Z/g, '2');
}

// Prefer the token immediately after "ID"; else a mixed alphanumeric run.
function pickCode(rawText) {
    const text = String(rawText || '').toUpperCase();
    const near = text.match(/I[D0][:\s.\-]*([A-Z0-9]{10})/);
    if (near && /[A-Z0-9]{10}/.test(near[1])) return canonicalizeCode(near[1]);
    const all = text.match(/[A-Z0-9]{10}/g) || [];
    const mixed = all.filter(isCode);          // reject pure-letter names first
    return mixed[0] ? canonicalizeCode(mixed[0]) : null;
}

// Most-frequent candidate wins; ties fall back to the first (highest-
// priority variant) seen.
function vote(candidates) {
    if (!candidates.length) return null;
    const counts = new Map();
    for (const c of candidates) counts.set(c, (counts.get(c) || 0) + 1);
    let best = candidates[0], bestN = 0;
    for (const [k, n] of counts) { if (n > bestN) { bestN = n; best = k; } }
    return best;
}

export async function extractCodeFromImage(buf) {
    let worker;
    try {
        // Order matters: banner/single-line variants first (most reliable
        // for a short code), full image last. vote() ties to the first.
        const builds = [
            { buf: await _safe(() => vBanner(buf)),    psm: '7' },
            { buf: await _safe(() => vBannerBin(buf)), psm: '7' },
            { buf: await _safe(() => vBannerInv(buf)), psm: '7' },
            { buf: await _safe(() => vFull(buf)),      psm: '6' },
        ].filter(v => v.buf);
        if (!builds.length) return { code: null, raw: '', error: true };

        const { createWorker } = await import('tesseract.js');
        worker = await createWorker('eng');

        const candidates = [];
        let joined = '';
        for (const v of builds) {
            await worker.setParameters({
                tessedit_char_whitelist: WHITELIST,
                tessedit_pageseg_mode: v.psm,     // 7 = single line, 6 = block
            });
            const { data } = await worker.recognize(v.buf);
            const t = (data?.text || '').trim();
            joined += '\n' + t;
            const hit = pickCode(t);
            if (hit) candidates.push(hit);
        }
        return { code: vote(candidates), raw: joined.trim() };
    } catch (err) {
        console.warn('[champions/ocr] failed:', err?.message || err);
        return { code: null, raw: '', error: true };
    } finally {
        if (worker) { try { await worker.terminate(); } catch (_) {} }
    }
}
