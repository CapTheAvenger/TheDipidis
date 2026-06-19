/**
 * Showdown / pokepaste team parser.
 *
 * Champions pokepastes follow the standard Showdown export format, with
 * one quirk: the `EVs:` line holds Champions SP (stat-point) values
 * (0–~32 range), not the mainline 0–252 EVs. We surface them verbatim
 * as SP — the in-game builder asks for exactly these.
 */

const STAT_KEYS = { HP: 'hp', Atk: 'atk', Def: 'def', SpA: 'spa', SpD: 'spd', Spe: 'spe' };

function parseStatLine(rest) {
    const out = {};
    for (const seg of rest.split('/')) {
        const m = seg.trim().match(/^(\d+)\s+(HP|Atk|Def|SpA|SpD|Spe)$/i);
        if (m) {
            const key = Object.keys(STAT_KEYS).find(k => k.toLowerCase() === m[2].toLowerCase());
            out[STAT_KEYS[key]] = parseInt(m[1], 10);
        }
    }
    return out;
}

function parseHeader(line) {
    // "Nickname (Species) (M) @ Item" → species + item
    let item = '';
    const at = line.split(/\s+@\s+/);
    let lhs = at[0].trim();
    if (at[1]) item = at[1].trim();
    lhs = lhs.replace(/\s*\((?:M|F|N)\)\s*$/i, '').trim();   // strip gender
    const par = lhs.match(/^(.*?)\s+\(([^)]+)\)\s*$/);        // Nickname (Species)
    const species = (par ? par[2] : lhs).trim();
    return { species, item };
}

export function parseShowdownTeam(text) {
    if (!text) return [];
    const blocks = String(text).replace(/\r/g, '').split(/\n\s*\n/);
    const mons = [];
    for (const block of blocks) {
        const lines = block.split('\n').map(l => l.trimEnd()).filter(l => l.trim() !== '');
        if (!lines.length) continue;
        const head = parseHeader(lines[0]);
        if (!head.species) continue;
        const mon = {
            species: head.species,
            item: head.item,
            ability: '',
            nature: '',
            level: '',
            tera: '',
            evs: null,
            ivs: null,
            moves: [],
        };
        for (let i = 1; i < lines.length; i++) {
            const l = lines[i].trim();
            if (l.startsWith('- ')) { mon.moves.push(l.slice(2).trim()); continue; }
            const abil = l.match(/^Ability:\s*(.+)$/i);
            if (abil) { mon.ability = abil[1].trim(); continue; }
            const lvl = l.match(/^Level:\s*(\d+)/i);
            if (lvl) { mon.level = lvl[1]; continue; }
            const tera = l.match(/^Tera Type:\s*(.+)$/i);
            if (tera) { mon.tera = tera[1].trim(); continue; }
            const evs = l.match(/^EVs:\s*(.+)$/i);
            if (evs) { mon.evs = parseStatLine(evs[1]); continue; }
            const ivs = l.match(/^IVs:\s*(.+)$/i);
            if (ivs) { mon.ivs = parseStatLine(ivs[1]); continue; }
            const nat = l.match(/^(\w+)\s+Nature$/i);
            if (nat) { mon.nature = nat[1].trim(); continue; }
        }
        mons.push(mon);
        if (mons.length >= 6) break;
    }
    return mons;
}
