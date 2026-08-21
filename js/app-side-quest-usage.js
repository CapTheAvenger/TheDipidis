// app-side-quest-usage.js — the Champions usage breakdown.
//
// data/champions_usage.json has held the six blocks Silph Scope builds its
// usage page from — move, held_item, ability, nature, stat_points,
// teammate — for 353 Pokémon in three formats, and until now nothing
// rendered them. Two modules read the file (the builder for its teammate
// graph, the Pokédex for final stats); the breakdown itself was the
// largest unused dataset in the repo.
//
// Three columns: type filter, ranking, the six panels. Everything is
// scoped under .sq-console, NOT #side-quest — the four existing subtabs
// still assume a light background, and darkening their container before
// they are converted would break them. The scope moves up once they are.
(function () {
    'use strict';

    const USAGE_URL = 'champions_usage.json';
    const DEX_URL = 'champions_pokedex.json';
    const TEAMS_URL = 'champions_replica_teams.json';

    // How many rows a panel shows before the tail is summarised. The rest
    // is not hidden — the count goes in the section label, the way the
    // reference does it.
    const TOP_N = 8;

    let _usage = null;        // slug -> record
    let _teams = null;        // ranking [{ name, count, slug, t1, t2 }]
    let _typeOf = null;       // display name -> [type1, type2]
    let _loading = null;
    let _format = 'doubles';
    let _type = '';
    let _selected = null;
    let _activated = false;

    function uiLang() {
        return (typeof window.getLang === 'function' && window.getLang() === 'de') ? 'de' : 'en';
    }
    function de() { return uiLang() === 'de'; }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function pct(n) {
        if (n == null) return '';
        const s = Number(n).toFixed(1);
        return (de() ? s.replace('.', ',') : s) + ' %';
    }

    // Both languages in one block, like the sibling Pokédex module —
    // easier to keep in step than ternaries scattered through the render
    // functions.
    const LABELS = {
        de: {
            brand: 'Nutzung', pokemonCount: 'Pokémon', doubles: 'Doppel', singles: 'Einzel',
            type: 'Typ', all: 'Alle', appearances: 'Team-Auftritte',
            moves: 'Attacken', item: 'Item', ability: 'Fähigkeit', nature: 'Wesen',
            spread: 'Statuswertpunkte', mates: 'Teampartner',
            noShare: 'ohne Anteilswerte', more: (n) => `+${n} weitere`,
            loading: 'Lade Nutzungsdaten …',
            noType: 'Kein Pokémon mit diesem Typ.',
            noUsage: 'Für dieses Pokémon liegen in diesem Format keine Nutzungsdaten vor.',
            // champions_usage.json trägt kein Datumsfeld — 'Current' würde
            // Frische suggerieren, die nicht belegbar ist. Deshalb explizit
            // Quelle + 'Stand unbekannt' (Audit 2, F03).
            sourceNote: 'Quelle: championsbattledata.com · Stand unbekannt',
            evs: ['KP', 'ANG', 'VER', 'SPA', 'SPV', 'INI'],
        },
        en: {
            brand: 'Usage', pokemonCount: 'Pokémon', doubles: 'Doubles', singles: 'Singles',
            type: 'Type', all: 'All', appearances: 'Team appearances',
            moves: 'Moves', item: 'Held item', ability: 'Ability', nature: 'Nature',
            spread: 'Stat points', mates: 'Teammates',
            noShare: 'no share values', more: (n) => `+${n} more`,
            loading: 'Loading usage data …',
            noType: 'No Pokémon of that type.',
            noUsage: 'No usage data for this Pokémon in this format.',
            sourceNote: 'Source: championsbattledata.com · date unknown',
            evs: ['HP', 'ATK', 'DEF', 'SPA', 'SPD', 'SPE'],
        },
    };
    function L() { return LABELS[uiLang()]; }

    const TYPES_EN = ['Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting',
        'Poison', 'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon',
        'Dark', 'Steel', 'Fairy'];

    // ── data ────────────────────────────────────────────────────────

    function jget(url) {
        const base = (typeof BASE_PATH === 'string') ? BASE_PATH : 'data/';
        return fetch(`${base}${url}?t=${Date.now()}`)
            .then(r => r.ok ? r.json() : null).catch(() => null);
    }

    function load() {
        if (_usage && _teams) return Promise.resolve(true);
        if (_loading) return _loading;
        _loading = Promise.all([jget(USAGE_URL), jget(DEX_URL), jget(TEAMS_URL)])
            .then(([usage, dex, teams]) => {
                _usage = (usage && usage.pokemon) || {};
                _typeOf = {};
                ((dex && dex.entries) || []).forEach(e => {
                    _typeOf[e.en] = [e.t1, e.t2].filter(Boolean);
                });
                _teams = rankTeams(teams);
                return true;
            });
        return _loading;
    }

    // Ranked by how often a Pokémon appears across the replica teams —
    // the only "how popular is this" signal in the Champions data, since
    // the usage file itself carries no overall share.
    //
    // Counted here rather than taken on trust: a review put Kingambit at
    // 72 appearances, but over the 99 teams in the file it is 37, behind
    // Basculegion at 38. The list says what the data says.
    function rankTeams(teams) {
        const list = (teams && teams.teams) || [];
        const counts = new Map();
        list.forEach(t => {
            (t.pokemon || []).forEach(p => {
                const name = (p && p.name) ? String(p.name).trim() : '';
                if (!name) return;
                counts.set(name, (counts.get(name) || 0) + 1);
            });
        });
        const max = Math.max(1, ...counts.values());
        return [...counts.entries()]
            .map(([name, count]) => ({
                name, count, share: count / max,
                types: _typeOf[name] || [],
                slug: usageSlug(name),
            }))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    }

    // The usage file keys by slug, and two of its records — basculegion-male
    // and basculegion-female — share one display name. Prefer whichever
    // exists; showing the name twice in a ranking would imply two Pokémon.
    function usageSlug(name) {
        const base = String(name || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
        if (_usage && _usage[base]) return base;
        if (!_usage) return base;
        const hit = Object.keys(_usage).find(k => k === base || k.startsWith(base + '-'));
        return hit || base;
    }

    function record(entry) {
        if (!entry) return null;
        const rec = _usage[entry.slug];
        return rec ? (rec[_format] || null) : null;
    }

    // ── components (ported from the prototype) ──────────────────────

    function sectionLabel(text, note) {
        return `<h4 class="sq-lbl">${esc(text)}${note ? `<em>${esc(note)}</em>` : ''}</h4>`;
    }

    // The tail note names what a top-N list leaves out. Cutting silently
    // would make eight rows look like the whole truth.
    function tailNote(list, shown) {
        const hidden = (list || []).length - shown;
        if (hidden <= 0) return '';
        return L().more(hidden);
    }

    function barRow(label, value, sub) {
        const w = Math.max(1.5, Math.min(100, Number(value) || 0));
        return `<div class="sq-item">
                <span class="t">${label}${sub ? `<small>${esc(sub)}</small>` : ''}</span>
                <span class="sq-track"><i style="width:${w}%"></i></span>
                <span class="v">${esc(pct(value))}</span>
            </div>`;
    }

    function barPanel(title, list, labelFn) {
        const rows = (list || []).slice(0, TOP_N);
        if (!rows.length) return '';
        return `<div class="sq-panel">
                ${sectionLabel(title, tailNote(list, rows.length))}
                ${rows.map(labelFn).join('')}
            </div>`;
    }

    const EV_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

    function spreadPanel(list) {
        const rows = (list || []).slice(0, 6);
        if (!rows.length) return '';
        const body = rows.map(s => {
            const p = s.points || {};
            const cells = EV_KEYS.map((k, i) => {
                const v = Number(p[k]) || 0;
                return `<span class="sq-ev${v ? '' : ' z'}"><b>${v}</b><span>${esc(L().evs[i])}</span></span>`;
            }).join('');
            const w = Math.max(1.5, Math.min(100, Number(s.pct) || 0));
            return `<div class="sq-spread">
                    <span class="sq-evs">${cells}</span>
                    <span class="sq-track"><i style="width:${w}%"></i></span>
                    <span class="v">${esc(pct(s.pct))}</span>
                </div>`;
        }).join('');
        return `<div class="sq-panel">
                ${sectionLabel(L().spread, tailNote(list, rows.length))}
                ${body}
            </div>`;
    }

    // teammate carries pct: null throughout the file. Rendering empty
    // bars would state a proportion we do not have — chips say "these
    // appear together" and claim nothing more.
    function sprite(name) {
        return (window.championsSprite && typeof window.championsSprite.img === 'function')
            ? window.championsSprite.img(name, 'sq-mate-img') : '';
    }

    function matesPanel(list) {
        const rows = (list || []).slice(0, 10);
        if (!rows.length) return '';
        // Sprite plus rank, the way the reference shows teammates: you
        // recognise the partner by its picture, and the rank says how far
        // down the list it sits. Still no bar — see below.
        const chips = rows.map((m, i) => `<span class="sq-mate" title="${esc(m.name)}">
                <span class="sq-mate-rk">${i + 1}</span>
                ${sprite(m.name)}
                <span class="sq-mate-nm">${esc(m.name)}</span>
            </span>`).join('');
        const hasPct = rows.some(m => m.pct != null);
        return `<div class="sq-panel">
                ${sectionLabel(L().mates, hasPct ? tailNote(list, rows.length) : L().noShare)}
                <div class="sq-mates">${chips}</div>
            </div>`;
    }

    // ── views ───────────────────────────────────────────────────────

    function filterHtml() {
        const counts = {};
        _teams.forEach(e => e.types.forEach(ty => { counts[ty] = (counts[ty] || 0) + 1; }));
        const btn = (val, label, n) =>
            `<button type="button" data-sq-type="${esc(val)}" class="${_type === val ? 'on' : ''}">${
                esc(label)}${n != null ? ` <span class="cnt">${n}</span>` : ''}</button>`;
        return `<div class="sq-panel sq-filt">
                ${sectionLabel(L().type)}
                <div class="sq-types">
                    ${btn('', L().all, _teams.length)}
                    ${TYPES_EN.filter(ty => counts[ty]).map(ty => btn(ty, ty, counts[ty])).join('')}
                </div>
            </div>`;
    }

    function visible() {
        return _type ? _teams.filter(e => e.types.indexOf(_type) !== -1) : _teams;
    }

    function listHtml() {
        const rows = visible();
        const label = L().appearances;
        if (!rows.length) {
            return `<div class="sq-panel">${sectionLabel(label)}
                    <p class="sq-empty">${esc(L().noType)}</p>
                </div>`;
        }
        const body = rows.map((e, i) => `
            <div class="sq-row${_selected === e.name ? ' sel' : ''}" data-sq-mon="${esc(e.name)}"
                 role="button" tabindex="0">
                <span class="rk">${i + 1}</span>
                <span class="nm">${esc(e.name)}<span class="sub"> ${e.count}</span></span>
                <span class="bar"><i style="width:${Math.round(e.share * 100)}%"></i></span>
            </div>`).join('');
        return `<div class="sq-panel">
                ${sectionLabel(label, `${rows.length}`)}
                <div class="sq-list">${body}</div>
            </div>`;
    }

    function detailHtml() {
        const entry = _teams.find(e => e.name === _selected) || visible()[0];
        if (!entry) return '';
        const block = record(entry);
        const rank = _teams.indexOf(entry) + 1;
        const head = `<div class="sq-head">
                <span class="rank">#${rank}</span>
                <h2>${esc(entry.name)}</h2>
                <span class="de">${entry.count} ${esc(L().appearances)}</span>
            </div>`;
        if (!block) {
            return `<div class="sq-panel">${head}
                    <p class="sq-empty">${esc(L().noUsage)}</p>
                </div>`;
        }
        const moveRow = (m) => barRow(esc(m.name), m.pct);
        const natRow = (n) => barRow(esc(n.name), n.pct,
            (n.up && n.down) ? `${n.up}↑ ${n.down}↓` : '');
        return `${head}
            <div class="sq-cols">
                <div class="sq-stack">
                    ${barPanel(L().moves, block.move, moveRow)}
                    ${barPanel(L().item, block.held_item, moveRow)}
                </div>
                <div class="sq-stack">
                    ${barPanel(L().ability, block.ability, moveRow)}
                    ${barPanel(L().nature, block.nature, natRow)}
                    ${spreadPanel(block.stat_points)}
                    ${matesPanel(block.teammate)}
                </div>
            </div>`;
    }

    function render() {
        const host = document.getElementById('sideQuestUsageHost');
        if (!host) return;
        if (!_teams) {
            host.innerHTML = `<div class="sq-console"><div class="sq-grid"><div class="sq-panel">${
                esc(L().loading)}</div></div></div>`;
            return;
        }
        const seg = (val, label) =>
            `<button type="button" data-sq-format="${val}" class="${_format === val ? 'on' : ''}">${esc(label)}</button>`;
        host.innerHTML = `
            <div class="sq-console">
                <div class="sq-top">
                    <span class="sq-brand">Champions <span>${esc(L().brand)}</span></span>
                    <span class="sq-meta">${_teams.length} ${esc(L().pokemonCount)}</span>
                    <span class="sq-meta sq-source" title="${esc(L().sourceNote)}">${esc(L().sourceNote)}</span>
                    <span class="sq-spacer"></span>
                    <span class="sq-seg">
                        ${seg('doubles', L().doubles)}
                        ${seg('singles', L().singles)}
                    </span>
                </div>
                <div class="sq-grid">
                    <div>${filterHtml()}</div>
                    <div>${listHtml()}</div>
                    <div>${detailHtml()}</div>
                </div>
            </div>`;
        wire(host);
    }

    function wire(host) {
        host.querySelectorAll('[data-sq-type]').forEach(b => {
            b.addEventListener('click', () => {
                _type = b.getAttribute('data-sq-type') || '';
                const first = visible()[0];
                if (!visible().some(e => e.name === _selected)) _selected = first ? first.name : null;
                render();
            });
        });
        host.querySelectorAll('[data-sq-format]').forEach(b => {
            b.addEventListener('click', () => { _format = b.getAttribute('data-sq-format'); render(); });
        });
        host.querySelectorAll('[data-sq-mon]').forEach(r => {
            const pick = () => { _selected = r.getAttribute('data-sq-mon'); render(); };
            r.addEventListener('click', pick);
            r.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); }
            });
        });
    }

    function activate() {
        if (_activated) { render(); return; }
        _activated = true;
        render();
        load().then(() => {
            if (!_selected && _teams.length) _selected = _teams[0].name;
            render();
        });
    }

    // Dynamically rendered markup does not redraw itself on a language
    // switch — this view has to ask for it.
    document.addEventListener('languageChanged', () => {
        const host = document.getElementById('sideQuestUsageHost');
        if (host && !host.hidden && _activated) render();
    });

    window.sideQuestUsage = { activate };
    window._sqUsageInternals = {
        rankTeams, usageSlug, tailNote, barRow, spreadPanel, matesPanel,
        setState: (u, t, ty) => { _usage = u; _teams = t; _typeOf = ty || {}; },
    };
})();
