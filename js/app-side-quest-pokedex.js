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
    const USAGE_URL = 'data/champions_usage.json';
    const NAMES_DE_URL = 'data/champions_names_de.json';

    let _entries = null;
    let _loading = null;
    let _usage = null;               // { slug: rec } — full per-Pokémon usage
    let _usageSeason = null;
    let _usageLoading = null;
    let _namesDe = null;             // { moves, items, abilities, pokemon } EN→DE
    let _namesDeLoading = null;
    let _detailEntry = null;         // entry currently shown in the overlay
    let _detailFormat = 'doubles';   // 'doubles' | 'singles'
    let _tableFormat = 'doubles';    // which format the table's "used" cells show
    let _lastResults = [];           // current filtered/sorted result set
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
            rangeNote: 'Pro Wert: Lv-50-Basiswert (in Klammern der meistgenutzte Endwert) · darunter die Range (Lv. 50, IS fix 31, 0–32 SP, Wesen ±10 %). Tipp auf ein Pokémon → alle In-Game-Infos (Wesen, SP, Attacken, Item, Team) für Doppel & Einzel.',
            metaTitle: 'Meist genutzt:',
            metaStats: 'Endwerte Lv. 50:',
            baseStatsLabel: 'Basiswerte:',
            metaFrom: (n, total) => `(${n} von ${total} Builds)`,
            metaIngame: 'In-Game-Nutzung · Doppelkämpfe',
            attribution: 'Daten: Pokémon-Champions-Datensatz (CC BY 4.0) · Nutzungsdaten: championsbattledata.com (In-Game-Analyse) · Deutsche Namen: PokéAPI',
            // Detail overlay
            detailHint: 'Tipp auf ein Pokémon → alle In-Game-Infos',
            battleIntro: 'Such ein Pokémon und tipp drauf — dann siehst du direkt alle Kampfdaten (Wesen, SP, Attacken, Item, Fähigkeit, Team) für Doppel & Einzel.',
            battleSearchPh: '🔎 Pokémon suchen …',
            detailSearchPh: '🔎 Anderes Pokémon …',
            fmtDoubles: 'Doppelkämpfe',
            fmtSingles: 'Einzelkämpfe',
            secStats: 'Statuswerte (Lv. 50)',
            secNature: 'Wesen',
            secSpread: 'Statuswertpunkte (SP)',
            secMoves: 'Attacken',
            secItem: 'Item',
            secAbility: 'Fähigkeit',
            secTeam: 'Team-Mitglieder',
            secFinal: 'Endwerte (meistgenutzter Build)',
            noUsage: 'Für dieses Pokémon gibt es noch keine In-Game-Nutzungsdaten.',
            closeLabel: 'Schließen',
            megaAbility: 'Mega-Fähigkeit',
            usageSeasonLbl: (s) => `Saison: ${s}`,
            colBase: 'Lv50', colUsed: 'Genutzt', colRange: 'Range',
            tblFormatLabel: 'Genutzte Werte:',
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
            rangeNote: 'Per stat: Lv. 50 base value (in brackets the most-used final value) · range below (Lv. 50, IV fixed 31, 0–32 SP, nature ±10%). Tap a Pokémon → full in-game info (nature, SP, moves, item, team) for Doubles & Singles.',
            metaTitle: 'Most used:',
            metaStats: 'Final stats Lv. 50:',
            baseStatsLabel: 'Base stats:',
            metaFrom: (n, total) => `(${n} of ${total} builds)`,
            metaIngame: 'In-game usage · Doubles',
            attribution: 'Data: Pokémon Champions dataset (CC BY 4.0) · Usage: championsbattledata.com (in-game analysis) · German names: PokéAPI',
            // Detail overlay
            detailHint: 'Tap a Pokémon → full in-game info',
            battleIntro: 'Search a Pokémon and tap it — you get all its battle data (nature, SP, moves, item, ability, team) for Doubles & Singles, straight away.',
            battleSearchPh: '🔎 Search a Pokémon …',
            detailSearchPh: '🔎 Another Pokémon …',
            fmtDoubles: 'Doubles',
            fmtSingles: 'Singles',
            secStats: 'Stats (Lv. 50)',
            secNature: 'Nature',
            secSpread: 'Stat points (SP)',
            secMoves: 'Moves',
            secItem: 'Item',
            secAbility: 'Ability',
            secTeam: 'Teammates',
            secFinal: 'Final stats (most-used build)',
            noUsage: 'No in-game usage data for this Pokémon yet.',
            closeLabel: 'Close',
            megaAbility: 'Mega ability',
            usageSeasonLbl: (s) => `Season: ${s}`,
            colBase: 'Lv50', colUsed: 'Used', colRange: 'Range',
            tblFormatLabel: 'Used values:',
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

    // The full in-game usage record per Pokémon (nature / SP spread / item /
    // move / ability / teammate, per format). Loaded lazily the first time a
    // detail view is opened. Fail-soft: an empty map just means the detail
    // view falls back to base stats only.
    function loadUsage() {
        if (_usage) return Promise.resolve(_usage);
        if (_usageLoading) return _usageLoading;
        _usageLoading = fetch(`${USAGE_URL}?t=${Date.now()}`)
            .then(r => r.ok ? r.json() : null)
            .then(json => {
                _usage = (json && json.pokemon) ? json.pokemon : {};
                _usageSeason = json && json._meta ? json._meta.season : null;
                return _usage;
            })
            .catch(() => { _usage = {}; return _usage; });
        return _usageLoading;
    }

    // EN→DE name maps for moves/items/abilities/Pokémon (German UI only).
    function loadNamesDe() {
        if (_namesDe) return Promise.resolve(_namesDe);
        if (uiLang() !== 'de') return Promise.resolve(null);
        if (_namesDeLoading) return _namesDeLoading;
        _namesDeLoading = fetch(`${NAMES_DE_URL}?t=${Date.now()}`)
            .then(r => r.ok ? r.json() : null)
            .then(j => { _namesDe = j || {}; return _namesDe; })
            .catch(() => { _namesDe = {}; return _namesDe; });
        return _namesDeLoading;
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

    // Per-format "used" final stats for the table brackets. Doubles reuses
    // the value precomputed by the build (no usage fetch needed); Singles is
    // computed live from the loaded usage record. Cached per entry+format.
    function usedFinalFor(e, fmt) {
        if (fmt === 'doubles' && e.meta && e.meta.format === 'doubles' && e.meta.final) {
            return e.meta.final;
        }
        if (!e._finalCache) e._finalCache = {};
        if (fmt in e._finalCache) return e._finalCache[fmt];
        let final = null;
        const rec = usageRecFor(e);
        const block = rec && rec[fmt];
        if (block) {
            const nat = (block.nature || [])[0];
            const sp = (block.stat_points || [])[0];
            if (nat && sp) final = computeFinal(e, nat.name, sp.points);
        }
        e._finalCache[fmt] = final;
        return final;
    }

    function rowFor(e, idx) {
        const lang = uiLang();
        const primary = lang === 'de' ? e.de : e.en;
        const secondary = lang === 'de' ? e.en : e.de;
        const dex = e.dex != null ? `#${e.dex}` : '';
        const f = usedFinalFor(e, _tableFormat);   // used per-stat values
        const caret = '<span class="sqp-caret" aria-hidden="true">▸</span>';
        // Tapping the row opens the full in-game detail overlay.
        return `
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
    }

    function tableHtml(results) {
        const l = t();
        _lastResults = results;   // so a tapped row maps back to its entry
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
                <span class="sqp-fmt-toggle" role="group" aria-label="${escapeHtml(l.tblFormatLabel)}">
                    <span class="sqp-fmt-lbl">${escapeHtml(l.tblFormatLabel)}</span>
                    <button type="button" class="sqp-fmt-btn${_tableFormat === 'doubles' ? ' is-active' : ''}" data-tfmt="doubles">${escapeHtml(l.fmtDoubles)}</button>
                    <button type="button" class="sqp-fmt-btn${_tableFormat === 'singles' ? ' is-active' : ''}" data-tfmt="singles">${escapeHtml(l.fmtSingles)}</button>
                </span>
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
    // Nature → [raised stat, lowered stat]. Makes the ±10 % visible so the
    // bracketed value is self-explanatory (e.g. Timid boosts Speed by 10 %,
    // which is why a 32-SP Timid Pelipper has 128 Speed, not 85+32=117).
    const _NATURE_FX = {
        Lonely: ['atk', 'def'], Brave: ['atk', 'spe'], Adamant: ['atk', 'spa'], Naughty: ['atk', 'spd'],
        Bold: ['def', 'atk'], Relaxed: ['def', 'spe'], Impish: ['def', 'spa'], Lax: ['def', 'spd'],
        Timid: ['spe', 'atk'], Hasty: ['spe', 'def'], Jolly: ['spe', 'spa'], Naive: ['spe', 'spd'],
        Modest: ['spa', 'atk'], Mild: ['spa', 'def'], Quiet: ['spa', 'spe'], Rash: ['spa', 'spd'],
        Calm: ['spd', 'atk'], Gentle: ['spd', 'def'], Sassy: ['spd', 'spe'], Careful: ['spd', 'spa'],
    };
    function _statLabel(k) {
        const row = _FINAL_ORDER.find(r => r[0] === k);
        return row ? (uiLang() === 'de' ? row[1] : row[2]) : k;
    }
    function natureWithFx(nature) {
        const name = uiLang() === 'de' ? (_NATURE_DE[nature] || nature) : nature;
        const fx = _NATURE_FX[nature];
        return fx ? `${name} (${_statLabel(fx[0])}↑ ${_statLabel(fx[1])}↓)` : name;
    }
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
    // Localized percentage (German uses a comma): 53.9 → "53,9 %".
    function fmtPct(p) {
        if (p == null) return '';
        const s = uiLang() === 'de' ? String(p).replace('.', ',') : String(p);
        return `${s} %`;
    }
    // Provenance suffix: in-game ladder usage vs. the legacy top-team sample.
    function metaProvenance(m) {
        const l = t();
        if (m.source === 'ingame') {
            return `<span class="sqp-meta-src">${escapeHtml(l.metaIngame)}</span>`;
        }
        if (m.n != null && m.total != null) {
            return `<span class="sqp-meta-n">${escapeHtml(l.metaFrom(m.n, m.total))}</span>`;
        }
        return '';
    }
    // Shared "Meist genutzt" inner row: SP spread (+%) · nature (+%) · source.
    // `withFx` adds the nature's ↑/↓ effect (used in the expanded detail).
    function metaUsageInner(m, withFx) {
        const l = t();
        const nat = m.nature
            ? (withFx ? natureWithFx(m.nature)
                      : (uiLang() === 'de' ? (_NATURE_DE[m.nature] || m.nature) : m.nature))
            : '';
        const evsPct = m.evsPct != null ? ` <span class="sqp-meta-pct">(${escapeHtml(fmtPct(m.evsPct))})</span>` : '';
        const natPct = m.naturePct != null ? ` <span class="sqp-meta-pct">(${escapeHtml(fmtPct(m.naturePct))})</span>` : '';
        return `<span class="sqp-meta-tag">${escapeHtml(l.metaTitle)}</span>
            <b class="sqp-meta-evs">${escapeHtml(evsDisplay(m.evs))}</b>${evsPct}
            ${nat ? `· <span class="sqp-meta-nat">${escapeHtml(nat)}${natPct}</span>` : ''}
            ${metaProvenance(m)}`;
    }
    function metaLineHtml(e) {
        const m = e.meta;
        if (!m || !m.evs) return '';
        const l = t();
        const finalLine = m.final
            ? `<div class="sqp-meta-row sqp-meta-final"><span class="sqp-meta-tag">${escapeHtml(l.metaStats)}</span> <b>${escapeHtml(finalStatsDisplay(m.final))}</b></div>`
            : '';
        return `
            <div class="sqp-meta">
                <div class="sqp-meta-row">${metaUsageInner(m, false)}</div>
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
        const metaRow = (m && m.evs)
            ? `<div class="sqp-meta-row">${metaUsageInner(m, true)}</div>`
            : '';
        return `<div class="sqp-meta">${baseLine}${metaRow}</div>`;
    }

    // ── Detail overlay (full in-game analysis for one Pokémon) ─────────
    // Champions Lv.50 stat formula (IV fixed 31): HP = base+SP+75,
    // Stat = floor((base+SP+20) × nature-alignment). Mirrors the Python
    // build so the toggled format's "used" values are computed live.
    function computeFinal(e, natureName, points) {
        const fx = _NATURE_FX[natureName] || [];
        const up = fx[0], down = fx[1];
        const out = {};
        STAT_KEYS.forEach(k => {
            const base = (e[k] && e[k].base) || 0;
            const sp = (points && points[k]) || 0;
            if (k === 'hp') out.hp = base + sp + 75;
            else {
                const align = k === up ? 1.1 : k === down ? 0.9 : 1.0;
                out[k] = Math.floor((base + sp + 20) * align);
            }
        });
        return out;
    }

    function usageRecFor(e) {
        const slug = e && e.meta && e.meta.slug;
        return (slug && _usage && _usage[slug]) || null;
    }

    // A horizontal percentage bar + label, used for every usage list row.
    // `nameHtml` is trusted, pre-escaped markup (build it with nmHtml/escapeHtml).
    // `approx` marks the derived #1-item % (the source omits it; we compute it
    // as 100 − Σ of the other items). It renders identically to every other
    // row — same blue/bold, no "≈" — and keeps only an invisible hover tooltip
    // noting it's computed, so the table stays visually consistent.
    function usageRow(nameHtml, pct, extra, approx) {
        const width = pct != null ? Math.max(2, Math.min(100, pct)) : 0;
        const pctTxt = pct != null ? escapeHtml(fmtPct(pct)) : '';
        const title = approx ? ` title="${escapeHtml(l_approxItem())}"` : '';
        return `<div class="sqp-d-row"${title}>
                <div class="sqp-d-bar" style="width:${width}%"></div>
                <span class="sqp-d-name">${nameHtml}${extra ? ` <span class="sqp-d-extra">${escapeHtml(extra)}</span>` : ''}</span>
                <span class="sqp-d-pct">${pctTxt}</span>
            </div>`;
    }
    // The source data is English-only. In the German UI, show the German name
    // beside the English one (so players on either language can follow).
    // kind ∈ 'moves' | 'items' | 'abilities' | 'pokemon' | 'nature'.
    function deName(en, kind) {
        if (!en) return null;
        if (kind === 'nature') return _NATURE_DE[en] || null;
        const map = _namesDe && _namesDe[kind];
        if (!map) return null;
        if (map[en]) return map[en];
        if (kind === 'pokemon') {                 // form fallbacks: "Basculegion Male"
            const base = en.replace(/\s+(Male|Female)$/i, '').replace(/\s*\(.*\)\s*$/, '').trim();
            if (map[base]) return map[base];
        }
        return null;
    }
    function nmHtml(en, kind) {
        const de = uiLang() === 'de' ? deName(en, kind) : null;
        return de && de !== en
            ? `${escapeHtml(en)}<span class="sqp-d-de">${escapeHtml(de)}</span>`
            : escapeHtml(en);
    }
    // What an ability does, in the current UI language.
    function abilityFxText(en) {
        const m = _namesDe && _namesDe.abilityFx && _namesDe.abilityFx[en];
        if (!m) return '';
        return (uiLang() === 'de' ? m.de : m.en) || m.de || m.en || '';
    }
    // Ability row: bilingual name + % on top, effect description below.
    function abilityRow(a) {
        const width = a.pct != null ? Math.max(2, Math.min(100, a.pct)) : 0;
        const pctTxt = a.pct != null ? escapeHtml(fmtPct(a.pct)) : '';
        const fx = abilityFxText(a.name);
        return `<div class="sqp-d-row sqp-d-ability">
                <div class="sqp-d-bar" style="width:${width}%"></div>
                <div class="sqp-d-ab-top">
                    <span class="sqp-d-name">${nmHtml(a.name, 'abilities')}</span>
                    <span class="sqp-d-pct">${pctTxt}</span>
                </div>
                ${fx ? `<div class="sqp-d-ab-fx">${escapeHtml(fx)}</div>` : ''}
            </div>`;
    }
    function l_approxItem() {
        return uiLang() === 'de'
            ? 'Geschätzt: die Quelle liefert den Wert des meistgenutzten Items nicht — berechnet aus 100 % minus der übrigen Items.'
            : 'Estimated: the source omits the top item\'s share — computed as 100% minus the other items.';
    }

    function usageSection(title, rows) {
        if (!rows) return '';
        return `<div class="sqp-d-sec">
                <h4 class="sqp-d-sec-title">${escapeHtml(title)}</h4>
                ${rows}
            </div>`;
    }

    // Stats table for the detail view: Lv50 base · used (top build of the
    // selected format) · range.
    function detailStatsTable(e, block) {
        const l = t();
        let final = null;
        if (block) {
            const nat = (block.nature || [])[0];
            const sp = (block.stat_points || [])[0];
            if (nat && sp) final = computeFinal(e, nat.name, sp.points);
        }
        const rows = _FINAL_ORDER.map(([k, d, en]) => {
            const s = e[k]; if (!s) return '';
            const lab = uiLang() === 'de' ? d : en;
            const used = final && final[k] != null ? final[k] : '';
            return `<tr>
                    <td class="sqp-d-st-lab">${escapeHtml(lab)}</td>
                    <td class="sqp-d-st-base">${s.lv50}</td>
                    <td class="sqp-d-st-used">${used !== '' ? escapeHtml(String(used)) : '—'}</td>
                    <td class="sqp-d-st-range">${s.min}–${s.max}</td>
                </tr>`;
        }).join('');
        return `<table class="sqp-d-stats">
                <thead><tr>
                    <th></th><th>${escapeHtml(l.colBase)}</th>
                    <th>${escapeHtml(l.colUsed)}</th><th>${escapeHtml(l.colRange)}</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
    }

    function detailUsageBlock(e, block) {
        const l = t();
        if (!block) return `<p class="sqp-d-none">${escapeHtml(l.noUsage)}</p>`;

        const natRows = (block.nature || []).map(n => {
            const fx = _NATURE_FX[n.name];
            const ex = fx ? `${_statLabel(fx[0])}↑ ${_statLabel(fx[1])}↓` : '';
            return usageRow(nmHtml(n.name, 'nature'), n.pct, ex);
        }).join('');

        const spreadRows = (block.stat_points || [])
            .map(s => usageRow(escapeHtml(evsDisplay(s.evs) || '—'), s.pct)).join('');

        const moveRows = (block.move || []).map(m => usageRow(nmHtml(m.name, 'moves'), m.pct)).join('');
        const itemRows = (block.held_item || []).map(i => usageRow(nmHtml(i.name, 'items'), i.pct, null, i.derived)).join('');
        const abilRows = (block.ability || []).map(a => abilityRow(a)).join('');
        // Teammates have no percentage in-game — just a ranked list. Render
        // them as a clean numbered list (no empty %-column / bar).
        const teamRows = (block.teammate || []).map((tm, i) => `
            <div class="sqp-d-team">
                <span class="sqp-d-team-rank">${i + 1}</span>
                <span class="sqp-d-name">${nmHtml(tm.name, 'pokemon')}</span>
            </div>`).join('');

        return `
            <div class="sqp-d-grid">
                ${usageSection(l.secNature, natRows)}
                ${usageSection(l.secSpread, spreadRows)}
                ${usageSection(l.secMoves, moveRows)}
                ${usageSection(l.secItem, itemRows)}
                ${usageSection(l.secAbility, abilRows)}
                ${usageSection(l.secTeam, teamRows)}
            </div>`;
    }

    // For Mega forms: the fixed ability they get after evolving (the usage
    // section shows the PRE-mega base ability, so this is shown by the name).
    function megaAbilityBadge(en) {
        const l = t();
        const fx = abilityFxText(en);
        const title = fx ? ` title="${escapeHtml(fx)}"` : '';
        return `<span class="sqp-d-megaab"${title}>
                <span class="sqp-d-megaab-lbl">${escapeHtml(l.megaAbility)}</span>
                <span class="sqp-d-megaab-name">${nmHtml(en, 'abilities')}</span>
            </span>`;
    }

    function detailOverlayHtml(e) {
        const l = t();
        const lang = uiLang();
        const primary = lang === 'de' ? e.de : e.en;
        const secondary = lang === 'de' ? e.en : e.de;
        const dex = e.dex != null ? `#${e.dex}` : '';
        const megaAb = e.megaAbility ? megaAbilityBadge(e.megaAbility) : '';
        const rec = usageRecFor(e);
        // Pick a format that exists for this Pokémon.
        let fmt = _detailFormat;
        if (rec && !rec[fmt]) fmt = rec.doubles ? 'doubles' : (rec.singles ? 'singles' : fmt);
        const block = rec ? rec[fmt] : null;

        const fmtBtn = (key, label) => {
            const has = rec && rec[key];
            const active = fmt === key;
            return `<button type="button" class="sqp-d-fmt${active ? ' is-active' : ''}"
                        data-fmt="${key}"${has ? '' : ' disabled'}>${escapeHtml(label)}</button>`;
        };

        const season = _usageSeason ? `<span class="sqp-d-season">${escapeHtml(l.usageSeasonLbl(_usageSeason))}</span>` : '';

        return `
            <div class="sqp-d-card" role="dialog" aria-modal="true" aria-label="${escapeHtml(primary)}">
                <button type="button" class="sqp-d-close" aria-label="${escapeHtml(l.closeLabel)}">×</button>
                <div class="sqp-d-head">
                    <div class="sqp-d-title">
                        <span class="sqp-d-name-main">${escapeHtml(primary)}</span>
                        <span class="sqp-d-name-sub">${escapeHtml(secondary)} · ${escapeHtml(dex)}</span>
                    </div>
                    <div class="sqp-d-types">${typeBadge(e.t1, e.t1de)} ${e.t2 ? typeBadge(e.t2, e.t2de) : ''}</div>
                </div>
                ${megaAb}
                <div class="sqp-d-searchwrap">
                    <input type="search" class="sqp-d-search" placeholder="${escapeHtml(l.detailSearchPh)}"
                           autocomplete="off" spellcheck="false" aria-label="${escapeHtml(l.detailSearchPh)}">
                    <div class="sqp-d-results" hidden></div>
                </div>
                <div class="sqp-d-fmts">
                    ${fmtBtn('doubles', l.fmtDoubles)}
                    ${fmtBtn('singles', l.fmtSingles)}
                    ${season}
                </div>
                <div class="sqp-d-sec">
                    <h4 class="sqp-d-sec-title">${escapeHtml(l.secStats)}</h4>
                    ${detailStatsTable(e, block)}
                </div>
                ${detailUsageBlock(e, block)}
                <p class="sqp-attr">${escapeHtml(l.attribution)}</p>
            </div>`;
    }

    function ensureOverlayEl() {
        let ov = document.getElementById('sqpDetailOverlay');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'sqpDetailOverlay';
            ov.className = 'sqp-d-overlay';
            ov.hidden = true;
            document.body.appendChild(ov);
            ov.addEventListener('click', (ev) => {
                if (ev.target === ov || ev.target.closest('.sqp-d-close')) closeDetail();
            });
            document.addEventListener('keydown', (ev) => {
                if (ev.key === 'Escape' && !ov.hidden) closeDetail();
            });
        }
        return ov;
    }

    function renderDetailOverlay() {
        if (!_detailEntry) return;
        const ov = ensureOverlayEl();
        ov.innerHTML = detailOverlayHtml(_detailEntry);
        ov.hidden = false;
        document.body.classList.add('sqp-d-open');
        wireDetailEvents(ov);
    }

    function wireDetailEvents(ov) {
        ov.querySelectorAll('.sqp-d-fmt').forEach(btn => {
            if (btn.disabled) return;
            btn.addEventListener('click', () => {
                _detailFormat = btn.getAttribute('data-fmt');
                renderDetailOverlay();
            });
        });
        const search = ov.querySelector('.sqp-d-search');
        const results = ov.querySelector('.sqp-d-results');
        if (search && results) {
            search.addEventListener('input', () => {
                const q = norm(search.value).trim();
                if (!q) { results.hidden = true; results.innerHTML = ''; return; }
                const hits = (_entries || []).filter(en => matches(en, q)).slice(0, 12);
                results.innerHTML = hits.map((en, i) => {
                    const nm = uiLang() === 'de' ? en.de : en.en;
                    const sub = uiLang() === 'de' ? en.en : en.de;
                    return `<button type="button" class="sqp-d-hit" data-hit="${_entries.indexOf(en)}">
                            <b>${escapeHtml(nm)}</b> <span>${escapeHtml(sub)}</span>
                        </button>`;
                }).join('') || `<div class="sqp-d-nohit">—</div>`;
                results.hidden = false;
                results.querySelectorAll('.sqp-d-hit').forEach(b => {
                    b.addEventListener('click', () => {
                        const idx = parseInt(b.getAttribute('data-hit'), 10);
                        const en = _entries[idx];
                        if (en) { _detailEntry = en; renderDetailOverlay(); }
                    });
                });
            });
        }
    }

    function openDetail(e) {
        if (!e) return;
        _detailEntry = e;
        _detailFormat = 'doubles';
        Promise.all([loadUsage(), loadNamesDe()]).then(renderDetailOverlay);
    }

    function closeDetail() {
        const ov = document.getElementById('sqpDetailOverlay');
        if (ov) ov.hidden = true;
        document.body.classList.remove('sqp-d-open');
        _detailEntry = null;
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

    // Tap a Pokémon row → open the full in-game detail overlay.
    function wireRows(host) {
        const table = host.querySelector('.sqp-table');
        if (!table || table._sqpRowsWired) return;
        table._sqpRowsWired = true;
        const open = (row) => {
            if (!row) return;
            const idx = parseInt(row.getAttribute('data-row'), 10);
            const e = _lastResults[idx];
            if (e) openDetail(e);
        };
        table.addEventListener('click', (ev) => {
            if (ev.target.closest('.sqp-sortable')) return;   // header sort handles itself
            open(ev.target.closest('.sqp-row'));
        });
        table.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
                const row = ev.target.closest('.sqp-row');
                if (row) { ev.preventDefault(); open(row); }
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
        host.querySelectorAll('.sqp-fmt-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const fmt = btn.getAttribute('data-tfmt');
                if (fmt === _tableFormat) return;
                _tableFormat = fmt;
                // Singles needs the usage record loaded to recompute the
                // "used" values; Doubles uses the build's precomputed values.
                if (fmt === 'singles' && !_usage) loadUsage().then(render);
                else render();
            });
        });
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

    // ── "Kampfdaten" view: a direct search → detail overlay, so you can jump
    // straight to a Pokémon's battle data without scrolling the table. ──
    let _battleQuery = '';
    function battleListHtml() {
        const l = t();
        const lang = uiLang();
        const q = norm(_battleQuery).trim();
        const list = _entries
            .filter(e => matches(e, q))
            .sort((a, b) => (lang === 'de' ? a.de : a.en).localeCompare(lang === 'de' ? b.de : b.en));
        const rows = list.map(e => {
            const primary = lang === 'de' ? e.de : e.en;
            const secondary = lang === 'de' ? e.en : e.de;
            const dex = e.dex != null ? `#${e.dex}` : '';
            const idx = _entries.indexOf(e);
            return `<button type="button" class="sqp-bf-item" data-bidx="${idx}">
                    <span class="sqp-bf-name">${escapeHtml(primary)}<span class="sqp-bf-sub">${escapeHtml(secondary)} · ${escapeHtml(dex)}</span></span>
                    <span class="sqp-bf-types">${typeBadge(e.t1, e.t1de)} ${e.t2 ? typeBadge(e.t2, e.t2de) : ''}</span>
                </button>`;
        }).join('');
        return { count: list.length, rows: rows || `<p class="sqp-status">${escapeHtml(l.none)}</p>` };
    }
    function wireBattleRows(host) {
        host.querySelectorAll('.sqp-bf-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const e = _entries[parseInt(btn.getAttribute('data-bidx'), 10)];
                if (e) openDetail(e);
            });
        });
    }
    // Update only the count + list on input, so the search box keeps focus.
    function updateBattleList(host) {
        const { count, rows } = battleListHtml();
        const cEl = host.querySelector('.sqp-count');
        if (cEl) cEl.textContent = t().count(count);
        const lEl = host.querySelector('.sqp-bf-list');
        if (lEl) { lEl.innerHTML = rows; wireBattleRows(host); }
    }
    function renderBattle() {
        const host = document.getElementById('sideQuestBattleHost');
        if (!host) return;
        const l = t();
        if (!_entries) { host.innerHTML = `<p class="sqp-status">${escapeHtml(l.loading)}</p>`; return; }
        if (_entries.length === 0) { host.innerHTML = `<p class="sqp-status">${escapeHtml(l.error)}</p>`; return; }
        const { count, rows } = battleListHtml();
        host.innerHTML = `
            <div class="sqp sqp-battle">
                <p class="sqp-intro">${escapeHtml(l.battleIntro)}</p>
                <input id="sqbSearch" class="sqp-search" type="search"
                       placeholder="${escapeHtml(l.battleSearchPh)}" value="${escapeHtml(_battleQuery)}"
                       autocomplete="off" spellcheck="false" aria-label="${escapeHtml(l.battleSearchPh)}">
                <p class="sqp-count">${escapeHtml(l.count(count))}</p>
                <div class="sqp-bf-list">${rows}</div>
            </div>`;
        const search = host.querySelector('#sqbSearch');
        if (search) search.addEventListener('input', () => { _battleQuery = search.value; updateBattleList(host); });
        wireBattleRows(host);
    }
    function activateBattle() {
        if (!_entries) { renderBattle(); loadData().then(renderBattle); }
        else renderBattle();
    }

    document.addEventListener('languageChanged', () => {
        const host = document.getElementById('sideQuestPokedexHost');
        if (_activated && host && !host.hidden) render();
        const bhost = document.getElementById('sideQuestBattleHost');
        if (bhost && !bhost.hidden) renderBattle();
    });

    window.sideQuestPokedex = { activate, render, loadData, activateBattle, renderBattle };
})();
