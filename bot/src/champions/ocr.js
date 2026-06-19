/**
 * Best-effort OCR: pull a 10-character team / replica code out of a
 * screenshot (e.g. the in-game "Team ID: XEX629QEEY" banner, or a
 * Victory-Road-style code image).
 *
 * tesseract.js is pure-WASM (no system binary) and lazily downloads its
 * eng model on first use. We preprocess with sharp (grayscale + upscale
 * + contrast) to help it read stylised banners, restrict the worker to
 * the code alphabet, and terminate the worker after each call to keep
 * the Render Free dyno's memory in check. Everything is wrapped so a
 * failure degrades to "couldn't read it" rather than crashing the bot.
 */

import sharp from 'sharp';

async function preprocess(buf) {
    return sharp(buf)
        .grayscale()
        .resize({ width: 1400, withoutEnlargement: false })
        .normalize()
        .linear(1.2, -10)
        .toFormat('png')
        .toBuffer();
}

// Pick the most code-like 10-char token. A real code mixes letters and
// digits, so prefer those; bias toward a token that follows "ID".
function pickCode(rawText) {
    const text = String(rawText || '').toUpperCase();
    const near = text.match(/ID[:\s.\-]*([A-Z0-9]{10})\b/);
    if (near) return near[1];
    const all = text.match(/[A-Z0-9]{10}/g) || [];
    const mixed = all.filter(t => /[A-Z]/.test(t) && /[0-9]/.test(t));
    return mixed[0] || all[0] || null;
}

export async function extractCodeFromImage(buf) {
    let worker;
    try {
        const pre = await preprocess(buf);
        const { createWorker } = await import('tesseract.js');
        worker = await createWorker('eng');
        await worker.setParameters({
            tessedit_char_whitelist:
                'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 :.-IDTeam',
        });
        const { data } = await worker.recognize(pre);
        return { code: pickCode(data?.text), raw: (data?.text || '').trim() };
    } catch (err) {
        console.warn('[champions/ocr] failed:', err?.message || err);
        return { code: null, raw: '', error: true };
    } finally {
        if (worker) { try { await worker.terminate(); } catch (_) {} }
    }
}
