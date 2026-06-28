// ── Side Quest · Champions — Pokédex ───────────────────────────────
// A sortable / filterable table of every Pokémon available in Pokémon
// Champions, built from data/champions_pokedex.json:
//   { entries: [{ en, de, dex, form, t1,t1de, t2,t2de,
//                 hp:{base,min,max}, atk, def, spa, spd, spe,
//                 total, bulkPhys, bulkSpec }] }
//
// Search matches German OR English name and the Pokédex number. Preset
// "Hauptsortierung" buttons cover the six stats, base-stat total and the
// two tank metrics (physical bulk = KP×Verteidigung, special bulk =
// KP×Spezial-Verteidigung). Every numeric column header is click-to-sort.
(function () {
    'use strict';

    const POKEDEX_URL = 'data/champions_pokedex.json';

    let _entries = null;
    let _loading = null;
    let _activated = false;
    let _query = '';
    let _typeFilter = '';            // '' = all, else EN type
    let _formFilter = 'all';         // all | Base | Mega | Regional
    let _sortKey = 'total';          // total|hp|atk|def|spa|spd|spe|bulkPhys|bulkSpec|dex|name
    let _sortDir = -1;               // 1 asc, -1 desc

    const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
    const TYPES_EN = ['Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting',
        'Poison', 'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon',
        'Dark', 'Steel', 'Fairy'];

    function uiLang() {
        return (typeof window.getLang === 'function' && window.getLang() === 'de') ? 'de' : 'en';
    }

    const LABELS = {
        de: {
            tab: 'Pokémon',
            intro: 'Alle in Pokémon Champions verfügbaren Pokémon — sortier- und filterbar. Basiswert mit Lv.-50-Range in Klammern. Such nach deutschem oder englischem Namen oder Pokédex-Nummer.',
            searchPh: '🔎 Suche: „Knakrack", „Garchomp", „445" …',
            allTypes: 'Alle Typen',
            allForms: 'Alle Formen',
            formBase: 'Normal', formMega: 'Mega', formRegional: 'Regionalform',
            sortHead: 'Hauptsortierung:',
            sTotal: 'Basiswertsumme', sHp: 'KP', sAtk: 'Angriff', sDef: 'Verteidigung',
            sSpa: 'Sp.-Angriff', sSpd: 'Sp.-Vert.', sSpe: 'Initiative',
            sBulkP: 'Physischer Tank', sBulkS: 'Spezieller Tank',
            cMon: 'Pokémon', cT1: 'Typ 1', cT2: 'Typ 2', cHp: 'KP', cAtk: 'Ang',
            cDef: 'Vert', cSpa: 'SAng', cSpd: 'SVert', cSpe: 'Init', cTotal: 'Ges',
            tankHint: (kind) => kind === 'phys'
                ? 'Sortiert nach physischer „Tankigkeit" (KP × Verteidigung)'
                : 'Sortiert nach spezieller „Tankigkeit" (KP × Spezial-Verteidigung)',
            count: (n) => `${n} Pokémon`,
            none: 'Nichts gefunden — andere Schreibweise, Nummer oder Filter probieren.',
            loading: 'Lade Pokédex …',
            error: 'Pokédex konnte nicht geladen werden.',
            rangeNote: 'Pro Wert: Lv-50-Basiswert (in Klammern der meistgenutzte Endwert aus Top-Teams) · darunter die Range (Lv. 50, IS fix 31, 0–32 SP, Wesen ±10 %). Tipp auf eine Zeile → absolute Basiswerte + meistgenutzter SP-Spread.',
            metaTitle: 'Meist genutzt:',
            metaStats: 'Endwerte Lv. 50:',
            baseStatsLabel: 'Basiswerte:',
            metaFrom: (n, total) => `(${n} von ${total} Builds)`,
            attribution: 'Daten: Pokémon-Champions-Datensatz (CC BY 4.0) · Deutsche Namen: PokéAPI',
        },
        en: {
            tab: 'Pokémon',
            intro: 'Every Pokémon available in Pokémon Champions — sortable and filterable. Base stat with the Lv. 50 range in brackets. Search by German or English name, or Pokédex number.',
            searchPh: '🔎 Search: "Garchomp", "Knakrack", "445" …',
            allTypes: 'All types',
            allForms: 'All forms',
            formBase: 'Base', formMega: 'Mega', formRegional: 'Regional',
            sortHead: 'Main sort:',
            sTotal: 'Base stat total', sHp: 'HP', sAtk: 'Attack', sDef: 'Defense',
            sSpa: 'Sp. Atk', sSpd: 'Sp. Def', sSpe: 'Speed',
            sBulkP: 'Physical tank', sBulkS: 'Special tank',
            cMon: 'Pokémon', cT1: 'Type 1', cT2: 'Type 2', cHp: 'HP', cAtk: 'Atk',
            cDef: 'Def', cSpa: 'SpA', cSpd: 'SpD', cSpe: 'Spe', cTotal: 'Tot',
            tankHint: (kind) => kind === 'phys'
                ? 'Sorted by physical bulk (HP × Defense)'
                : 'Sorted by special bulk (HP × Sp. Defense)',
            count: (n) => `${n} Pokémon`,
            none: 'Nothing found — try a different spelling, number or filter.',
            loading: 'Loading Pokédex …',
            error: 'Could not load the Pokédex.',
            rangeNote: 'Per stat: Lv. 50 base value (in brackets the most-used final value from top teams) · range below (Lv. 50, IV fixed 31, 0–32 SP, nature ±10%). Tap a row → absolute base stats + most-used SP spread.',
            metaTitle: 'Most used:',
            metaStats: 'Final stats Lv. 50:',
            baseStatsLabel: 'Base stats:',
            metaFrom: (n, total) => `(${n} of ${total} builds)`,
            attribution: 'Data: Pokémon Champions dataset (CC BY 4.0) · German names: PokéAPI',
        },
    };
    function t() { return LABELS[uiLang()]; }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function loadData() {
        if (_entries) return Promise.resolve(_entries);
        if (_loading) return _loading;
        _loading = fetch(`${POKEDEX_URL}?t=${Date.now()}`)
            .then(r => r.ok ? r.json() : null)
            .then(json => {
                _entries = (json && Array.isArray(json.entries)) ? json.entries : [];
                return _entries;
            })
            .catch(() => { _entries = []; return _entries; });
        return _loading;
    }

    // ── Filtering / sorting ────────────────────────────────────────
    function norm(s) { return String(s || '').toLowerCase(); }

    function matches(e, q) {
        if (!q) return true;
        const hay = norm(e.en) + ' ' + norm(e.de) + ' #' + (e.dex != null ? e.dex : '');
        return q.split(/\s+/).every(tok => hay.indexOf(tok) !== -1);
    }

    function sortValue(e) {
        if (_sortKey === 'name') return uiLang() === 'de' ? e.de : e.en;
        if (_sortKey === 'dex') return e.dex || 0;
        if (_sortKey === 'total') return e.total || 0;
        if (_sortKey === 'bulkPhys') return e.bulkPhys || 0;
        if (_sortKey === 'bulkSpec') return e.bulkSpec || 0;
        return (e[_sortKey] && e[_sortKey].base) || 0;     // stat columns
    }

    function currentResults() {
        if (!_entries) return [];
        const q = norm(_query).trim().replace(/^#/, '');
        const lang = uiLang();
        const list = _entries
            .filter(e => !_typeFilter || e.t1 === _typeFilter || e.t2 === _typeFilter)
            .filter(e => _formFilter === 'all' || e.form === _formFilter)
            .filter(e => matches(e, q));
        if (_sortKey === 'name') {
            list.sort((a, b) => sortValue(a).localeCompare(sortValue(b), lang) * _sortDir);
        } else {
            list.sort((a, b) => {
                const d = (sortValue(a) - sortValue(b)) * _sortDir;
                if (d) return d;
                const ka = lang === 'de' ? a.de : a.en;
                const kb = lang === 'de' ? b.de : b.en;
                return ka.localeCompare(kb, lang);
            });
        }
        return list;
    }

    // ── Render ─────────────────────────────────────────────────────
    function typeBadge(en, de) {
        if (!en) return '';
        return `<span class="sqp-type sq-play-type-${escapeHtml(en.toLowerCase())}">${escapeHtml(uiLang() === 'de' ? de : en)}</span>`;
    }

    // Top line: Lv.50 base value (0 SP, neutral) + the actually-used value
    // from real top teams in brackets, e.g. "85 (128)". Bottom: the range.
    function statCell(s, used) {
        if (!s) return '<td class="sqp-stat"></td>';
        const usedHtml = (used != null) ? `<span class="sqp-stat-used">(${used})</span>` : '';
        return `<td class="sqp-stat"><span class="sqp-stat-top"><b>${s.lv50}</b>${usedHtml}</span><small>${s.min}–${s.max}</small></td>`;
    }

    const COLS = [
        { key: 'name', lk: 'cMon', cls: 'sqp-c-mon', num: false },
        { key: null, lk: 'cT1', cls: 'sqp-c-type', num: false },
        { key: null, lk: 'cT2', cls: 'sqp-c-type', num: false },
        { key: 'hp', lk: 'cHp', cls: 'sqp-c-stat', num: true },
        { key: 'atk', lk: 'cAtk', cls: 'sqp-c-stat', num: true },
        { key: 'def', lk: 'cDef', cls: 'sqp-c-stat', num: true },
        { key: 'spa', lk: 'cSpa', cls: 'sqp-c-stat', num: true },
        { key: 'spd', lk: 'cSpd', cls: 'sqp-c-stat', num: true },
        { key: 'spe', lk: 'cSpe', cls: 'sqp-c-stat', num: true },
        { key: 'total', lk: 'cTotal', cls: 'sqp-c-total', num: true },
    ];

    function headRow() {
        const l = t();
        return '<tr>' + COLS.map(c => {
            const label = escapeHtml(l[c.lk]);
            if (!c.key) return `<th class="${c.cls}">${label}</th>`;
            const active = _sortKey === c.key;
            const arrow = active ? (_sortDir === -1 ? ' ▼' : ' ▲') : '';
            return `<th class="${c.cls} sqp-sortable${active ? ' is-sorted' : ''}" data-sqp-sort="${c.key}" role="button" tabindex="0">${label}${arrow}</th>`;
        }).join('') + '</tr>';
    }

    function rowFor(e, idx) {
        const lang = uiLang();
        const primary = lang === 'de' ? e.de : e.en;
        const secondary = lang === 'de' ? e.en : e.de;
        const dex = e.dex != null ? `#${e.dex}` : '';
        const f = (e.meta && e.meta.final) || null;   // used per-stat values
        const caret = '<span class="sqp-caret" aria-hidden="true">▸</span>';
        const mainRow = `
            <tr class="sqp-row has-meta" data-row="${idx}" tabindex="0" role="button">
                <td class="sqp-c-mon">
                    <span class="sqp-mon-name">${caret}${escapeHtml(primary)}</span>
                    <span class="sqp-mon-sub">${escapeHtml(secondary)} · ${escapeHtml(dex)}</span>
                </td>
                <td class="sqp-c-type">${typeBadge(e.t1, e.t1de)}</td>
                <td class="sqp-c-type">${typeBadge(e.t2, e.t2de)}</td>
                ${statCell(e.hp, f && f.hp)}
                ${statCell(e.atk, f && f.atk)}
                ${statCell(e.def, f && f.def)}
                ${statCell(e.spa, f && f.spa)}
                ${statCell(e.spd, f && f.spd)}
                ${statCell(e.spe, f && f.spe)}
                <td class="sqp-c-total"><b>${e.total || ''}</b></td>
            </tr>`;
        // Every row expands to show the absolute base stats (and, when known,
        // the most-used SP spread from real teams).
        return mainRow + `
            <tr class="sqp-detail" data-detail="${idx}" hidden>
                <td class="sqp-detail-cell" colspan="${COLS.length}">${detailHtml(e)}</td>
            </tr>`;
    }

    function tableHtml(results) {
        const l = t();
        if (!results.length) return `<p class="sqp-status">${escapeHtml(l.none)}</p>`;
        return `
            <div class="sqp-table-wrap">
                <table class="sqp-table">
                    <thead>${headRow()}</thead>
                    <tbody>${results.map((e, i) => rowFor(e, i)).join('')}</tbody>
                </table>
            </div>`;
    }

    function presetBtn(key, dir, label, hintKind) {
        const active = _sortKey === key;
        const hint = hintKind ? ` title="${escapeHtml(t().tankHint(hintKind))}"` : '';
        return `<button class="sqp-preset${active ? ' is-active' : ''}" type="button" data-sqp-preset="${key}" data-sqp-dir="${dir}"${hint}>${escapeHtml(label)}</button>`;
    }

    function controlsHtml() {
        const l = t();
        const typeOpts = `<option value="">${escapeHtml(l.allTypes)}</option>` +
            TYPES_EN.map(ty => `<option value="${ty}"${_typeFilter === ty ? ' selected' : ''}>${escapeHtml(uiLang() === 'de' ? deType(ty) : ty)}</option>`).join('');
        const formOpts = [['all', l.allForms], ['Base', l.formBase], ['Mega', l.formMega], ['Regional', l.formRegional]]
            .map(([v, lab]) => `<option value="${v}"${_formFilter === v ? ' selected' : ''}>${escapeHtml(lab)}</option>`).join('');
        return `
            <div class="sqp-presets">
                <span class="sqp-presets-label">${escapeHtml(l.sortHead)}</span>
                ${presetBtn('total', -1, l.sTotal)}
                ${presetBtn('hp', -1, l.sHp)}
                ${presetBtn('atk', -1, l.sAtk)}
                ${presetBtn('def', -1, l.sDef)}
                ${presetBtn('spa', -1, l.sSpa)}
                ${presetBtn('spd', -1, l.sSpd)}
                ${presetBtn('spe', -1, l.sSpe)}
                ${presetBtn('bulkPhys', -1, l.sBulkP, 'phys')}
                ${presetBtn('bulkSpec', -1, l.sBulkS, 'spec')}
            </div>
            <div class="sqp-filters">
                <select class="sqp-select" id="sqpType" aria-label="${escapeHtml(l.allTypes)}">${typeOpts}</select>
                <select class="sqp-select" id="sqpForm" aria-label="${escapeHtml(l.allForms)}">${formOpts}</select>
            </div>`;
    }

    // EN→DE type for the <select> (badges already carry de via data).
    const _DE_TYPE = {
        Normal: 'Normal', Fire: 'Feuer', Water: 'Wasser', Electric: 'Elektro',
        Grass: 'Pflanze', Ice: 'Eis', Fighting: 'Kampf', Poison: 'Gift',
        Ground: 'Boden', Flying: 'Flug', Psychic: 'Psycho', Bug: 'Käfer',
        Rock: 'Gestein', Ghost: 'Geist', Dragon: 'Drache', Dark: 'Unlicht',
        Steel: 'Stahl', Fairy: 'Fee',
    };
    function deType(en) { return _DE_TYPE[en] || en; }

    // Most-common SP/EV spread (from real top teams) — German labels.
    const _STAT_LABEL_DE = { HP: 'KP', Atk: 'Ang', Def: 'Vert', SpA: 'SpAng', SpD: 'SpVert', Spe: 'Init' };
    const _NATURE_DE = {
        Hardy: 'Robust', Lonely: 'Solo', Brave: 'Mutig', Adamant: 'Hart', Naughty: 'Frech',
        Bold: 'Kühn', Docile: 'Sanft', Relaxed: 'Locker', Impish: 'Pfiffig', Lax: 'Lasch',
        Timid: 'Scheu', Hasty: 'Hastig', Serious: 'Ernst', Jolly: 'Froh', Naive: 'Naiv',
        Modest: 'Mäßig', Mild: 'Mild', Quiet: 'Ruhig', Bashful: 'Zaghaft', Rash: 'Hitzig',
        Calm: 'Still', Gentle: 'Zart', Sassy: 'Forsch', Careful: 'Sacht', Quirky: 'Kauzig',
    };
    function evsDisplay(evs) {
        const de = uiLang() === 'de';
        return String(evs || '').split('/').map(part => {
            const m = part.trim().match(/^(\d+)\s+(\S+)$/);
            if (!m) return part.trim();
            const lab = de ? (_STAT_LABEL_DE[m[2]] || m[2]) : m[2];
            return `${m[1]} ${lab}`;
        }).join(' / ');
    }
    // hp/atk/… → [DE label, EN label], in display order.
    const _FINAL_ORDER = [['hp', 'KP', 'HP'], ['atk', 'Ang', 'Atk'], ['def', 'Vert', 'Def'],
        ['spa', 'SpAng', 'SpA'], ['spd', 'SpVert', 'SpD'], ['spe', 'Init', 'Spe']];
    function finalStatsDisplay(final) {
        if (!final) return '';
        const de = uiLang() === 'de';
        return _FINAL_ORDER
            .filter(([k]) => final[k] != null)
            .map(([k, d, e]) => `${de ? d : e} ${final[k]}`)
            .join(' · ');
    }
    function metaLineHtml(e) {
        const m = e.meta;
        if (!m || !m.evs) return '';
        const l = t();
        const nat = m.nature ? (uiLang() === 'de' ? (_NATURE_DE[m.nature] || m.nature) : m.nature) : '';
        const finalLine = m.final
            ? `<div class="sqp-meta-row sqp-meta-final"><span class="sqp-meta-tag">${escapeHtml(l.metaStats)}</span> <b>${escapeHtml(finalStatsDisplay(m.final))}</b></div>`
            : '';
        return `
            <div class="sqp-meta">
                <div class="sqp-meta-row">
                    <span class="sqp-meta-tag">${escapeHtml(l.metaTitle)}</span>
                    <b class="sqp-meta-evs">${escapeHtml(evsDisplay(m.evs))}</b>
                    ${nat ? `· <span class="sqp-meta-nat">${escapeHtml(nat)}</span>` : ''}
                    <span class="sqp-meta-n">${escapeHtml(l.metaFrom(m.n, m.total))}</span>
                </div>
                ${finalLine}
            </div>`;
    }

    // Absolute base stats (the species' intrinsic values, not Lv.50).
    function baseStatsDisplay(e) {
        const de = uiLang() === 'de';
        return _FINAL_ORDER
            .filter(([k]) => e[k] && e[k].base != null)
            .map(([k, d, en]) => `${de ? d : en} ${e[k].base}`)
            .join(' · ');
    }
    // Expanded detail row: absolute base stats (always) + the most-used SP
    // spread from real teams (when known). The per-stat final values now live
    // in the table cells' "(…)" brackets, so they're not repeated here.
    function detailHtml(e) {
        const l = t();
        const baseLine = `<div class="sqp-meta-row sqp-meta-base">
                <span class="sqp-meta-tag">${escapeHtml(l.baseStatsLabel)}</span>
                <b>${escapeHtml(baseStatsDisplay(e))}</b>
            </div>`;
        const m = e.meta;
        const nat = (m && m.nature) ? (uiLang() === 'de' ? (_NATURE_DE[m.nature] || m.nature) : m.nature) : '';
        const metaRow = (m && m.evs)
            ? `<div class="sqp-meta-row">
                <span class="sqp-meta-tag">${escapeHtml(l.metaTitle)}</span>
                <b class="sqp-meta-evs">${escapeHtml(evsDisplay(m.evs))}</b>
                ${nat ? `· <span class="sqp-meta-nat">${escapeHtml(nat)}</span>` : ''}
                <span class="sqp-meta-n">${escapeHtml(l.metaFrom(m.n, m.total))}</span>
               </div>`
            : '';
        return `<div class="sqp-meta">${baseLine}${metaRow}</div>`;
    }

    function render() {
        const host = document.getElementById('sideQuestPokedexHost');
        if (!host) return;
        const l = t();
        if (!_entries) { host.innerHTML = `<p class="sqp-status">${escapeHtml(l.loading)}</p>`; return; }
        if (_entries.length === 0) { host.innerHTML = `<p class="sqp-status">${escapeHtml(l.error)}</p>`; return; }

        const results = currentResults();
        host.innerHTML = `
            <div class="sqp">
                <p class="sqp-intro">${escapeHtml(l.intro)}</p>
                <input id="sqpSearch" class="sqp-search" type="search"
                       placeholder="${escapeHtml(l.searchPh)}" value="${escapeHtml(_query)}"
                       autocomplete="off" spellcheck="false" aria-label="${escapeHtml(l.tab)}">
                ${controlsHtml()}
                <p class="sqp-count">${escapeHtml(l.count(results.length))}</p>
                ${tableHtml(results)}
                <p class="sqp-note">${escapeHtml(l.rangeNote)}</p>
                <p class="sqp-attr">${escapeHtml(l.attribution)}</p>
            </div>`;
        wireEvents(host);
    }

    // Repaint only the count + table so the search box keeps focus.
    function rerenderTableOnly() {
        const host = document.getElementById('sideQuestPokedexHost');
        if (!host) return;
        const l = t();
        const results = currentResults();
        const countEl = host.querySelector('.sqp-count');
        if (countEl) countEl.textContent = l.count(results.length);
        const wrap = host.querySelector('.sqp-table-wrap') || host.querySelector('.sqp-status');
        if (wrap) wrap.outerHTML = tableHtml(results);
        wireSortHeaders(host);
        wireRows(host);
    }

    // Tap a Pokémon row → reveal its most-used SP spread (meta) detail row.
    function wireRows(host) {
        const table = host.querySelector('.sqp-table');
        if (!table || table._sqpRowsWired) return;
        table._sqpRowsWired = true;
        const toggle = (row) => {
            if (!row || !row.classList.contains('has-meta')) return;
            const idx = row.getAttribute('data-row');
            const detail = table.querySelector(`.sqp-detail[data-detail="${idx}"]`);
            if (!detail) return;
            if (detail.hasAttribute('hidden')) { detail.removeAttribute('hidden'); row.classList.add('is-open'); }
            else { detail.setAttribute('hidden', ''); row.classList.remove('is-open'); }
        };
        table.addEventListener('click', (ev) => {
            if (ev.target.closest('.sqp-sortable')) return;   // header sort handles itself
            toggle(ev.target.closest('.sqp-row'));
        });
        table.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
                const row = ev.target.closest('.sqp-row');
                if (row) { ev.preventDefault(); toggle(row); }
            }
        });
    }

    function setSort(key, dir) {
        if (_sortKey === key && dir == null) { _sortDir = -_sortDir; }     // toggle
        else { _sortKey = key; _sortDir = dir != null ? dir : (key === 'name' ? 1 : -1); }
    }

    function wireSortHeaders(host) {
        host.querySelectorAll('.sqp-sortable').forEach(th => {
            if (th._sqpWired) return;
            th._sqpWired = true;
            const go = () => { setSort(th.getAttribute('data-sqp-sort'), null); render(); };
            th.addEventListener('click', go);
            th.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
        });
    }

    function wireEvents(host) {
        const search = host.querySelector('#sqpSearch');
        if (search) search.addEventListener('input', () => { _query = search.value; rerenderTableOnly(); });
        host.querySelectorAll('.sqp-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                const key = btn.getAttribute('data-sqp-preset');
                const dir = parseInt(btn.getAttribute('data-sqp-dir'), 10) || -1;
                setSort(key, dir);
                render();
            });
        });
        const typeSel = host.querySelector('#sqpType');
        if (typeSel) typeSel.addEventListener('change', () => { _typeFilter = typeSel.value; render(); });
        const formSel = host.querySelector('#sqpForm');
        if (formSel) formSel.addEventListener('change', () => { _formFilter = formSel.value; render(); });
        wireSortHeaders(host);
        wireRows(host);
    }

    // Called by the sub-tab controller when the Pokédex view is shown.
    function activate() {
        if (!_activated) {
            _activated = true;
            render();                  // loading state
            loadData().then(render);   // real table
        } else {
            render();
        }
    }

    document.addEventListener('languageChanged', () => {
        const host = document.getElementById('sideQuestPokedexHost');
        if (_activated && host && !host.hidden) render();
    });

    window.sideQuestPokedex = { activate, render, loadData };
})();
