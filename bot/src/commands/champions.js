/**
 * Champions team builder.
 *
 *   • Send one or more pokepast.es links → the bot replies with a
 *     bilingual (DE/EN) "build sheet" per team: species, item, ability,
 *     nature, SP spread and moves — every name in German AND English,
 *     because pokepaste is English-only but the game may be German.
 *   • Send a screenshot containing a "Team ID" / replica code → the bot
 *     OCRs it and replies with the extracted 10-char code.
 *
 * The actual in-game build + code generation stays manual (Champions is
 * a closed game with no API); this just removes the tab-hopping.
 */

import { Markup } from 'telegraf';

import { parseShowdownTeam } from '../champions/parse.js';
import {
    getMaps, speciesBi, itemBi, abilityBi, moveBi, natureBi, typeBi, statsLine,
} from '../champions/i18n.js';
import { extractCodeFromImage } from '../champions/ocr.js';

const CLAUDE_URL = 'https://claude.ai/new';

const NUMS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'];
const MAX_PASTES = 10;
const TG_LIMIT = 3900;

function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function pair(b) { return b ? `${esc(b.de)} / ${esc(b.en)}` : ''; }

function formatTeam(mons, maps) {
    const out = [];
    mons.forEach((m, i) => {
        out.push(`${NUMS[i] || '•'} <b>${pair(speciesBi(maps, m.species))}</b>`);
        const it = itemBi(maps, m.item);
        if (it && it.en) {
            out.push(`   📿 Item: ${pair(it)}${it.group ? ` · <i>${esc(it.group)}</i>` : ''}`);
        }
        const ab = abilityBi(maps, m.ability);
        if (ab && ab.en) out.push(`   ✨ Fähigkeit / Ability: ${pair(ab)}`);
        const na = natureBi(m.nature);
        if (na && na.en) out.push(`   🧬 Wesen / Nature: ${pair(na)}`);
        const te = typeBi(m.tera);
        if (te && te.en) out.push(`   🔮 Tera: ${pair(te)}`);
        const sp = statsLine(m.evs);
        if (sp) out.push(`   📊 SP: ${esc(sp)}`);
        if (m.moves.length) {
            out.push('   ⚔ Attacken / Moves:');
            m.moves.forEach(mv => out.push(`      • ${pair(moveBi(maps, mv))}`));
        }
        out.push('');
    });
    return out.join('\n').trim();
}

// "DE (EN)" for the Claude prompt — German first (the answer should be
// German) with the English name so Claude maps the right card.
function biText(b) { return b ? `${b.de} (${b.en})` : ''; }

function buildClaudePrompt(mons, maps) {
    const lines = mons.map((m) => {
        const parts = [`- ${biText(speciesBi(maps, m.species))}`];
        const it = itemBi(maps, m.item);
        if (it && it.en) parts.push(`@ ${biText(it)}`);
        const meta = [];
        const ab = abilityBi(maps, m.ability);
        if (ab && ab.en) meta.push(`Fähigkeit: ${biText(ab)}`);
        const na = natureBi(m.nature);
        if (na && na.en) meta.push(`Wesen: ${biText(na)}`);
        const sp = statsLine(m.evs);
        if (sp) meta.push(`SP: ${sp}`);
        let line = parts.join(' ');
        if (meta.length) line += ' | ' + meta.join(' | ');
        const moves = m.moves.map(mv => biText(moveBi(maps, mv))).filter(Boolean);
        if (moves.length) line += '\n    Attacken: ' + moves.join(', ');
        return line;
    });
    return [
        'Du bist ein erfahrener Pokémon-VGC-Coach für das Format Pokémon Champions (Doppelkämpfe). Antworte einsteigerfreundlich auf Deutsch.',
        '',
        'WICHTIG – als Allererstes: Erkläre mir kurz, was die ITEMS machen, die meine Pokémon tragen (ein Satz pro Item).',
        '',
        'Mein Team (6 Pokémon):',
        lines.join('\n'),
        '',
        'STRIKTE FORMAT-REGELN (bitte unbedingt beachten, sonst ist die Erklärung falsch):',
        '- Pro Kampf werden aus den 6 Pokémon nur 4 ausgewählt (im Team-Preview) und nur diese 4 kämpfen. Erkläre also NICHT so, als wären alle 6 gleichzeitig im Kampf. Sprich über sinnvolle 4er-Auswahlen / Lead-Paare gegen typische Gegner.',
        '- Es gibt KEIN Tera. Stattdessen kann sich pro Kampf nur EIN einziges Pokémon Mega-entwickeln (über seinen Mega-Stein als Item) — auch wenn mehrere Pokémon einen Mega-Stein tragen. Man bringt also evtl. mehrere Mega-Kandidaten mit, aber im Match megat sich nur eines. Sag klar, welches Mega man wann wählen sollte. Beim Mega ändern sich die Werte inkl. Initiative.',
        '',
        'GENAUIGKEIT (extrem wichtig — sonst ist die Anleitung unbrauchbar):',
        '- Verwende AUSSCHLIESSLICH die oben gelisteten Daten. Jedes Pokémon hat GENAU die 4 oben gelisteten Attacken. Schreibe einem Pokémon NIEMALS eine Attacke zu, die nicht in SEINER eigenen Liste steht (z. B. niemals eine Attacke von Pokémon A bei Pokémon B nennen).',
        '- Erfinde nichts und benenne nichts um: nutze die exakt angegebenen Namen für Pokémon, Items, Fähigkeiten und Attacken.',
        '- Wenn du dir bei etwas nicht sicher bist, sag es offen, statt zu raten. Prüfe vor dem Absenden, dass jede von dir genannte Attacke wirklich beim richtigen Pokémon steht.',
        '',
        'Erkläre danach:',
        '1. Kurzer Überblick (2–3 Sätze): Was ist der Spielplan des Teams?',
        '2. Die Rolle jedes Pokémon (je ein kurzer Absatz).',
        '3. Welche 4 Pokémon man typischerweise mitnimmt (gern 2–3 Beispiel-Auswahlen je nach Gegner) und welche 2 eher auf der Bank bleiben.',
        '4. So läuft ein typisches Spiel ab — Schritt für Schritt.',
        '5. 3–5 Einsteiger-Tipps (typische Fehler, was beschützen, welcher Lead, welches Mega).',
    ].join('\n');
}

// Split into ≤TG_LIMIT chunks on blank-line (per-mon) boundaries.
function chunk(text) {
    const blocks = text.split('\n\n');
    const chunks = [];
    let cur = '';
    for (const b of blocks) {
        if (cur && (cur.length + b.length + 2) > TG_LIMIT) { chunks.push(cur); cur = ''; }
        cur = cur ? `${cur}\n\n${b}` : b;
    }
    if (cur) chunks.push(cur);
    return chunks;
}

async function replyHTML(ctx, text) {
    for (const c of chunk(text)) {
        await ctx.reply(c, { parse_mode: 'HTML', disable_web_page_preview: true });
    }
}

function extractPasteIds(text) {
    const ids = [];
    const re = /pokepast\.es\/([a-z0-9]+)/gi;
    let m;
    while ((m = re.exec(text || ''))) ids.push(m[1]);
    return [...new Set(ids)];
}

async function fetchPasteRaw(id) {
    const r = await fetch(`https://pokepast.es/${id}/raw`, {
        headers: { 'User-Agent': 'thedipidis-bot/champions' },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
}

async function handlePastes(ctx, ids) {
    const maps = await getMaps();
    const take = ids.slice(0, MAX_PASTES);
    for (const id of take) {
        try {
            const mons = parseShowdownTeam(await fetchPasteRaw(id));
            if (!mons.length) {
                await ctx.reply(`⚠️ pokepast.es/${id}: konnte keine Pokémon lesen.`).catch(() => {});
                continue;
            }
            await replyHTML(ctx,
                `🛠 <b>Champions-Bauplan</b> — <code>pokepast.es/${esc(id)}</code>\n\n${formatTeam(mons, maps)}`);

            // Claude prompt (items-first) + open-in-Claude button.
            const prompt = buildClaudePrompt(mons, maps);
            await ctx.reply('💬 <b>Prompt für Claude</b> — antippen zum Kopieren, dann bei Claude einfügen:',
                { parse_mode: 'HTML' });
            await ctx.reply(`<code>${esc(prompt)}</code>`, {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([Markup.button.url('🤖 In Claude öffnen', CLAUDE_URL)]),
            });
        } catch (err) {
            await ctx.reply(`⚠️ pokepast.es/${id}: ${err.message}`).catch(() => {});
        }
    }
    if (ids.length > take.length) {
        await ctx.reply(`… ${ids.length - take.length} weitere Links übersprungen (max ${MAX_PASTES} pro Nachricht).`).catch(() => {});
    }
}

async function handlePhoto(ctx) {
    const photos = ctx.message?.photo || [];
    const file = photos[photos.length - 1];
    if (!file) return;
    let note;
    try {
        note = await ctx.reply('🔍 Lese den Code aus dem Bild …');
        const link = await ctx.telegram.getFileLink(file.file_id);
        const resp = await fetch(link.href);
        const buf = Buffer.from(await resp.arrayBuffer());
        const { code } = await extractCodeFromImage(buf);
        if (code) {
            await ctx.reply(
                '✅ Erkannter Code — zum Kopieren antippen 👇\n<i>(falls falsch erkannt: O↔0, I↔1 prüfen)</i>',
                { parse_mode: 'HTML' });
            // The code on its own line, as its own message: tapping the
            // monospace text copies it, and a long-press copies exactly
            // the code (no surrounding text).
            await ctx.reply(`<code>${esc(code)}</code>`, { parse_mode: 'HTML' });
        } else {
            await ctx.reply('❌ Konnte keinen 10-stelligen Code erkennen. Schick das Bild näher/schärfer an der „Team ID" — oder tippe den Code ab.');
        }
    } catch (err) {
        console.warn('[champions/photo] failed:', err?.message || err);
        await ctx.reply('⚠️ Bild konnte nicht verarbeitet werden — bitte nochmal.').catch(() => {});
    } finally {
        if (note) ctx.telegram.deleteMessage(ctx.chat.id, note.message_id).catch(() => {});
    }
}

export function registerChampions(bot) {
    bot.command(['team', 'champions', 'bauplan'], async (ctx) => {
        const ids = extractPasteIds(ctx.message?.text || '');
        if (ids.length) return handlePastes(ctx, ids);
        return ctx.reply(
            'Schick mir einen oder mehrere pokepast.es-Links 📋 — ich baue dir den Champions-Bauplan auf Deutsch UND Englisch (Spezies, Item, Fähigkeit, Wesen, SP, Attacken).\n\nOder schick ein Foto mit der „Team ID", dann lese ich den Code aus.');
    });

    // Plain messages containing pokepaste links (no slash command).
    bot.hears(/pokepast\.es\/[a-z0-9]+/i, async (ctx, next) => {
        if ((ctx.message?.text || '').startsWith('/')) return next();
        const ids = extractPasteIds(ctx.message?.text || '');
        if (ids.length) return handlePastes(ctx, ids);
        return next();
    });

    bot.on('photo', handlePhoto);
}
