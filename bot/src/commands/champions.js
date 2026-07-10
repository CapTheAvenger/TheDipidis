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
import { parseTeamScreens } from '../champions/team-screen.js';

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
            const raw = await fetchPasteRaw(id);
            const mons = parseShowdownTeam(raw);
            if (!mons.length) {
                await ctx.reply(`⚠️ pokepast.es/${id}: konnte keine Pokémon lesen.`).catch(() => {});
                continue;
            }
            await replyHTML(ctx,
                `🛠 <b>Champions-Bauplan</b> — <code>pokepast.es/${esc(id)}</code>\n\n${formatTeam(mons, maps)}`);

            // Showdown / Limitless export — the raw pokepaste already IS the
            // exact text both the Showdown teambuilder ("Import/Export") and a
            // Limitless tournament ("Submit teamlist") accept, so we just hand
            // it back as a tap-to-copy code block.
            const showdown = (raw || '').trim();
            if (showdown) {
                await ctx.reply('📋 <b>Showdown / Limitless Export</b> — antippen zum Kopieren, dann bei Showdown oder im Limitless-Turnier („Submit teamlist") einfügen:',
                    { parse_mode: 'HTML' });
                await ctx.reply(`<code>${esc(showdown)}</code>`, {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([Markup.button.url('⚔️ Showdown Teambuilder', 'https://play.pokemonshowdown.com/teambuilder')]),
                });
            }

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

// Build an importable Limitless / Showdown paste from parsed screen data, in the
// exact Pokémon Champions format the site export uses (and Limitless accepts):
//   <Species> @ <Item> / Ability: … / Level: 50 / EVs: <0–32 spread> / <Nature> Nature / - moves
// EVs are the game's native 0–32 SP spread (sum 66), and nature is solved exactly
// from the base + final stats (see team-screen.solveSpread) — both verified, not
// guessed. If a slot's spread couldn't be locked, the EV/Nature lines are simply
// omitted for that mon (still a legal import) and it's listed under warnings.
const EV_ORDER = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const EV_LABEL = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };

function evLine(evs) {
    if (!evs) return null;
    const parts = EV_ORDER.filter(k => evs[k]).map(k => `${evs[k]} ${EV_LABEL[k]}`);
    return parts.length ? `EVs: ${parts.join(' / ')}` : null;
}

function toShowdownPaste(mons) {
    return mons.filter(m => m.species).map((m) => {
        const lines = [m.item ? `${m.species} @ ${m.item}` : m.species];
        if (m.ability) lines.push(`Ability: ${m.ability}`);
        lines.push('Level: 50');
        const ev = evLine(m.evs);
        if (ev) lines.push(ev);
        if (m.nature) lines.push(`${m.nature} Nature`);
        for (const mv of (m.moves || [])) lines.push(`- ${mv}`);
        return lines.join('\n');
    }).join('\n\n');
}

async function emitScreenshotTeam(ctx, mons, warnings, maps) {
    await replyHTML(ctx,
        `🛠 <b>Champions-Bauplan</b> — aus deinem „Share This Battle Team?"-Screenshot\n\n${formatTeam(mons, maps)}`);

    const paste = toShowdownPaste(mons);
    if (paste) {
        await ctx.reply('📋 <b>Limitless / Showdown Export</b> — antippen zum Kopieren, dann im Limitless-Turnier („Submit teamlist") oder bei Showdown einfügen.\n<i>Mit Level 50, EVs (0–32-Spread) & Wesen — exakt aus den Statuswerten berechnet.</i>',
            { parse_mode: 'HTML' });
        await ctx.reply(`<code>${esc(paste)}</code>`, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([Markup.button.url('⚔️ Showdown Teambuilder', 'https://play.pokemonshowdown.com/teambuilder')]),
        });
    }

    if (warnings && warnings.length) {
        await ctx.reply(`⚠️ <b>Bitte prüfen</b>\n${warnings.map(w => `• ${esc(w)}`).join('\n')}`,
            { parse_mode: 'HTML' });
    }

    const prompt = buildClaudePrompt(mons, maps);
    await ctx.reply('💬 <b>Prompt für Claude</b> — antippen zum Kopieren, dann bei Claude einfügen:',
        { parse_mode: 'HTML' });
    await ctx.reply(`<code>${esc(prompt)}</code>`, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([Markup.button.url('🤖 In Claude öffnen', CLAUDE_URL)]),
    });
}

async function downloadPhoto(ctx, fileId) {
    const link = await ctx.telegram.getFileLink(fileId);
    const resp = await fetch(link.href);
    return Buffer.from(await resp.arrayBuffer());
}

// Handle 1–2 screenshots: a lone image may be a Team-ID banner (try the code
// path first) OR a team screen; a 2-image album is the "Moves & More" + "Stats"
// pair, parsed together.
async function processTeamPhotos(ctx, fileIds, { allowCode }) {
    let note;
    try {
        note = await ctx.reply('🔍 Lese das Team aus dem Bild …');
        const buffers = [];
        for (const id of fileIds.slice(0, 2)) buffers.push(await downloadPhoto(ctx, id));

        if (allowCode && buffers.length === 1) {
            const { code } = await extractCodeFromImage(buffers[0]);
            if (code) {
                await ctx.reply(
                    '✅ Erkannter Code — zum Kopieren antippen 👇\n<i>(Codes enthalten nie I, O oder Z — die werden als 1/0/2 gelesen. Sonst ähnliche Zeichen wie A↔4, B↔8 oder S↔5 kurz prüfen — am besten Foto gerade & ohne Spiegelung.)</i>',
                    { parse_mode: 'HTML' });
                await ctx.reply(`<code>${esc(code)}</code>`, { parse_mode: 'HTML' });
                return;
            }
        }

        const { mons, warnings } = await parseTeamScreens(buffers);
        if (mons.length) {
            const maps = await getMaps();
            await emitScreenshotTeam(ctx, mons, warnings, maps);
            return;
        }

        await ctx.reply('❌ Konnte weder einen Team-Code noch ein Team aus dem Bild lesen.\n\nSchick den „Moves & More"- und/oder „Stats"-Screenshot vom „Share This Battle Team?"-Bildschirm (gern beide zusammen als Album) — oder ein scharfes Foto der „Team ID".');
    } catch (err) {
        console.warn('[champions/photo] failed:', err?.message || err);
        await ctx.reply('⚠️ Bild konnte nicht verarbeitet werden — bitte nochmal.').catch(() => {});
    } finally {
        if (note) ctx.telegram.deleteMessage(ctx.chat.id, note.message_id).catch(() => {});
    }
}

// Telegram delivers an album as separate photo updates sharing a
// media_group_id. Buffer them and flush ~1.8 s after the last arrives so we
// parse both screens in one shot.
const pendingGroups = new Map();

function handlePhoto(ctx) {
    const photos = ctx.message?.photo || [];
    const file = photos[photos.length - 1];   // highest resolution
    if (!file) return;

    const gid = ctx.message.media_group_id;
    if (!gid) return processTeamPhotos(ctx, [file.file_id], { allowCode: true });

    let g = pendingGroups.get(gid);
    if (!g) { g = { fileIds: [], ctx }; pendingGroups.set(gid, g); }
    g.fileIds.push(file.file_id);
    g.ctx = ctx;
    if (g.timer) clearTimeout(g.timer);
    g.timer = setTimeout(() => {
        pendingGroups.delete(gid);
        processTeamPhotos(g.ctx, g.fileIds, { allowCode: false }).catch(() => {});
    }, 1800);
}

export function registerChampions(bot) {
    bot.command(['team', 'champions', 'bauplan', 'limitless', 'limitlesschampions'], async (ctx) => {
        const ids = extractPasteIds(ctx.message?.text || '');
        if (ids.length) return handlePastes(ctx, ids);
        return ctx.reply(
            '📸 <b>Champions-Team aus Screenshots</b>\nSchick die Screenshots vom „Share This Battle Team?"-Bildschirm — am besten <b>„Moves & More" UND „Stats" zusammen als Album</b>. Ich lese Spezies, Item, Fähigkeit, Attacken, Wesen und den EV-Spread aus und baue dir den <b>Limitless-/Showdown-Export</b> (mit Level 50) + den DE/EN-Bauplan.\n\n📋 Oder schick pokepast.es-Links — dann baue ich den Export aus dem Paste.\n\n(Ein Foto mit der „Team ID" lese ich weiterhin als Code aus.)',
            { parse_mode: 'HTML' });
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
