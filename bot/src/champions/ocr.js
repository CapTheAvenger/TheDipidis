/**
 * Best-effort OCR: pull a 10-character team / replica code out of a
 * screenshot (e.g. the in-game "Team ID: XEX629QEEY" banner, or a
 * Victory-Road-style code image).
 *
 * The in-game code sits in a small top banner, while the Pokémon names
 * below it are large and clear — so a naive full-image pass tends to
 * grab a 10-letter name ("TYPHLOSION") instead. Two defences:
 *   1. OCR the top strip (upscaled + sharpened) as well as the full
 *      image, so the small banner text actually gets read.
 *   2. Only accept a real code: the token right after "ID", or failing
 *      that a MIXED alphanumeric run (codes have letters AND digits —
 *      this rejects pure-letter Pokémon/ability names).
 *
 * tesseract.js is pure-WASM (no system binary), lazily downloads its eng
 * model on first use, and we terminate the worker after each call to
 * keep the Render Free dyno's memory in check. Everything is wrapped so
 * a failure degrades to "couldn't read it" rather than crashing.
 */

import sharp from 'sharp';

async function fullVariant(buf) {
    return sharp(buf)
        .grayscale()
        .resize({ width: 1800, withoutEnlargement: false })
        .normalize()
        .sharpen()
        .toFormat('png')
        .toBuffer();
}

// Top ~28 % of the image — where the "Team ID" banner lives — cropped
// and blown up so the small code text becomes legible.
async function topBannerVariant(buf) {
    const img = sharp(buf);
    const meta = await img.metadata();
    const h = meta.height || 0;
    if (!h) return null;
    const cropH = Math.max(1, Math.round(h * 0.28));
    return sharp(buf)
        .extract({ left: 0, top: 0, width: meta.width, height: cropH })
        .grayscale()
        .resize({ width: 1700, withoutEnlargement: false })
        .normalize()
        .linear(1.25, -12)
        .sharpen()
        .toFormat('png')
        .toBuffer();
}

function isCode(tok) {
    return /[A-Z]/.test(tok) && /[0-9]/.test(tok);   // letters AND digits
}

// Prefer the token immediately after "ID"; else a mixed alphanumeric run.
function pickCode(rawText) {
    const text = String(rawText || '').toUpperCase();
    const near = text.match(/I[D0][:\s.\-]*([A-Z0-9]{10})/);
    if (near && /[A-Z0-9]{10}/.test(near[1])) return near[1];
    const all = text.match(/[A-Z0-9]{10}/g) || [];
    const mixed = all.filter(isCode);
    return mixed[0] || null;          // never return a pure-letter token
}

export async function extractCodeFromImage(buf) {
    let worker;
    try {
        const variants = [await topBannerVariant(buf), await fullVariant(buf)].filter(Boolean);
        const { createWorker } = await import('tesseract.js');
        worker = await createWorker('eng');
        await worker.setParameters({
            tessedit_char_whitelist:
                'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 :.-IDTeam',
        });
        let joined = '';
        for (const v of variants) {
            const { data } = await worker.recognize(v);
            const t = (data?.text || '').trim();
            joined += '\n' + t;
            const hit = pickCode(t);
            if (hit) return { code: hit, raw: joined.trim() };
        }
        return { code: pickCode(joined), raw: joined.trim() };
    } catch (err) {
        console.warn('[champions/ocr] failed:', err?.message || err);
        return { code: null, raw: '', error: true };
    } finally {
        if (worker) { try { await worker.terminate(); } catch (_) {} }
    }
}
