// Side Quest · Team Builder (doubles)
// ============================================================================
// Co-occurrence team builder over the in-game DOUBLES teammate data
// (data/champions_usage.json — the same source as the Kampfdaten "Team-
// Mitglieder" list). Pick a Pokémon → the builder shows the Pokémon it's played
// alongside. Pick another → the pool narrows to Pokémon that are teammates of
// BOTH, and so on up to 6. Doubles only.
//
// The usage data keys Pokémon by SLUG ("hisuian-zoroark") but stores the base
// `name` ("Zoroark"); the teammate lists carry the proper FORM names ("Hisuian
// Zoroark"). So we work in slug space and take display names from the teammate
// lists, which is the only place the form names appear.
(function () {
    'use strict';

    const USAGE_URL = 'data/champions_usage.json';
    const DE_NAMES_URL = 'data/pokemon_names_de.json';
    const HOST_ID = 'sideQuestBuilderHost';
    const MAX = 6;
    const EMPTY_CAP = 40;   // "most-played" mons shown before any pick

    let _loaded = false;
    let _bySlug = {};       // slug → { slug, display, baseEn, mates: [slug] }
    let _mons = [];         // all mon objects
    let _degree = {};       // slug → # of teammate lists it appears on (popularity)
    let _deNames = {}, _deLoaded = false;

    let _team = [];         // selected slugs
    let _query = '';

    function uiLang() { return (typeof window.getLang === 'function' && window.getLang() === 'de') ? 'de' : 'en'; }
    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function norm(s) { return String(s || '').trim().toLowerCase(); }
    function slugify(s) { return norm(s).replace(/\s+/g, '-'); }
    function titleFromSlug(slug) {
        return String(slug || '').split('-').map(w => w ? w.charAt(0).toUpperCase() + w.slice(1) : w).join(' ');
    }

    const LABELS = {
        de: {
            intro: 'Bau dir ein Doppelkampf-Team: Wähl ein Pokémon — der Builder zeigt dir, mit welchen Pokémon es zusammen gespielt wird (In-Game-Analyse). Jede weitere Wahl grenzt ein: es bleiben nur Pokémon, die mit allen Gewählten zusammen gespielt werden.',
            searchPh: '🔎 Pokémon hinzufügen (Deutsch oder Englisch) …',
            picked: (n) => `${n} / ${MAX} gewählt`,
            suggestTitle: 'Passt dazu',
            suggestHintFirst: 'Meistgespielte Pokémon — tippen zum Starten, oder oben suchen.',
            suggestHint: 'Sortiert nach Überschneidung — % = mit wie vielen deiner Gewählten das Pokémon zusammen gespielt wird (100 % = mit allen). Tippen zum Hinzufügen.',
            none: 'Keine weitere Kombination gefunden — nimm ein Pokémon raus.',
            empty: 'Wähl ein Pokémon, um zu starten.',
            clear: 'Zurücksetzen',
            remove: 'Entfernen',
            attribution: 'Basis: In-Game-Doppelkampf-Analyse (championsbattledata.com).',
        },
        en: {
            intro: 'Build a doubles team: pick a Pokémon — the builder shows who it is played alongside (in-game analysis). Each further pick narrows the pool to Pokémon played with ALL of your picks.',
            searchPh: '🔎 Add a Pokémon (German or English) …',
            picked: (n) => `${n} / ${MAX} selected`,
            suggestTitle: 'Plays with',
            suggestHintFirst: 'Most-played Pokémon — tap to start, or search above.',
            suggestHint: 'Sorted by overlap — % is how many of your picks it is played alongside (100% = all). Tap to add.',
            none: 'No further combination found — remove a Pokémon.',
            empty: 'Pick a Pokémon to start.',
            clear: 'Reset',
            remove: 'Remove',
            attribution: 'Based on in-game doubles analysis (championsbattledata.com).',
        },
    };
    function t() { return LABELS[uiLang()]; }

    async function load() {
        if (_loaded) return;
        try {
            const r = await fetch(`${USAGE_URL}?t=${Date.now()}`);
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const j = await r.json();
            const pk = (j && j.pokemon) || {};

            // Proper form display names live only in the teammate lists.
            const displayBySlug = {};
            Object.keys(pk).forEach(slug => {
                ((pk[slug].doubles || {}).teammate || []).forEach(x => {
                    if (x && x.name) { const s = slugify(x.name); if (!displayBySlug[s]) displayBySlug[s] = x.name; }
                });
            });

            _bySlug = {}; _mons = []; _degree = {};
            Object.keys(pk).forEach(slug => {
                const e = pk[slug] || {};
                const mates = ((e.doubles || {}).teammate || []).map(x => slugify(x && x.name)).filter(Boolean);
                const mon = {
                    slug,
                    display: displayBySlug[slug] || titleFromSlug(slug) || e.name || slug,
                    baseEn: e.name || '',
                    mates,
                };
                _bySlug[slug] = mon;
                _mons.push(mon);
            });
            _mons.forEach(m => {
                const seen = new Set();
                m.mates.forEach(s => { if (seen.has(s)) return; seen.add(s); _degree[s] = (_degree[s] || 0) + 1; });
            });
            _mons.sort((a, b) => a.display.localeCompare(b.display));
        } catch (err) {
            console.warn('[SideQuest/builder] failed to load usage', err);
            _bySlug = {}; _mons = []; _degree = {};
        }
        _loaded = true;
    }
    async function loadDe() {
        if (_deLoaded) return;
        try {
            const r = await fetch(`${DE_NAMES_URL}?t=${Date.now()}`);
            if (r.ok) { const j = await r.json(); if (j && typeof j === 'object') _deNames = j; }
        } catch (err) { /* stays English-only */ }
        _deLoaded = true;
    }

    // ── Co-occurrence core ──────────────────────────────────────────────────
    // Rank every candidate by OVERLAP: the share of the selected Pokémon whose
    // teammate list contains it. 100 % = played alongside all of them; then 75 %
    // (3 of 4), 50 %, … so the pool never dead-ends when no single Pokémon has
    // been played with the whole selection. Ties break on the summed list
    // position (fits higher up). With nothing picked, rank by overall popularity.
    function candidates() {
        const sel = new Set(_team);
        if (_team.length === 0) {
            return _mons
                .filter(m => !sel.has(m.slug))
                .map(m => ({ slug: m.slug, count: 0, overlap: 1, score: -(_degree[m.slug] || 0) }))
                .sort((a, b) => a.score - b.score || dispSlug(a.slug).localeCompare(dispSlug(b.slug)));
        }
        const agg = new Map();   // slug → { count, posSum }
        _team.forEach(s => {
            const mates = (_bySlug[s] && _bySlug[s].mates) || [];
            mates.forEach((ts, i) => {
                if (sel.has(ts)) return;
                const e = agg.get(ts) || { count: 0, posSum: 0 };
                e.count++; e.posSum += i; agg.set(ts, e);
            });
        });
        const n = _team.length;
        return [...agg.entries()]
            .map(([slug, e]) => ({ slug, count: e.count, overlap: e.count / n, score: e.posSum }))
            .sort((a, b) => b.count - a.count || a.score - b.score || dispSlug(a.slug).localeCompare(dispSlug(b.slug)));
    }

    // ── Names / sprites ─────────────────────────────────────────────────────
    function dispSlug(slug) { const m = _bySlug[slug]; return (m && m.display) || titleFromSlug(slug); }
    function displayName(slug) {
        const m = _bySlug[slug];
        if (uiLang() === 'de' && m && m.baseEn) {
            const de = _deNames[m.baseEn];
            // Pure base form → localise; form (Hisuian/Mega/…) → keep the English
            // form name (German form names aren't in the base-name map).
            if (de && norm(m.display) === norm(m.baseEn)) return de;
        }
        return dispSlug(slug);
    }
    function searchHay(slug) {
        const m = _bySlug[slug];
        return norm(dispSlug(slug)) + ' ' + norm((m && _deNames[m.baseEn]) || '');
    }
    // The usage slug ("alolan-ninetales", "basculegion-male",
    // "maushold-family-of-four") is NOT the Limitless sprite slug. Derive the
    // sprite slug from the display NAME the way the app's icon helper does:
    // a regional/mega prefix combines with the species ("Alolan Ninetales" →
    // ninetales-alola, "Hisuian Zoroark" → zoroark-hisui); otherwise use the base
    // species word and drop trailing form words ("Basculegion Male" →
    // basculegion, "Maushold Family of Four" → maushold).
    const _FORM_SUFFIX = {
        alolan: 'alola', alola: 'alola', galarian: 'galar', galar: 'galar',
        hisuian: 'hisui', hisui: 'hisui', paldean: 'paldea', paldea: 'paldea',
        mega: 'mega', bloodmoon: 'bloodmoon',
    };
    function spriteSlug(name) {
        const words = norm(name).split(/[\s-]+/).filter(Boolean);
        if (!words.length) return '';
        if (_FORM_SUFFIX[words[0]] && words[1]) return words[1] + '-' + _FORM_SUFFIX[words[0]];
        return words[0];
    }
    function icon(slug) {
        const name = dispSlug(slug);
        const sprite = spriteSlug(name);
        if (window.ArchetypeIcons && typeof window.ArchetypeIcons.slugIconHtml === 'function') {
            return window.ArchetypeIcons.slugIconHtml(sprite, { size: 'md', alt: name });
        }
        const url = 'https://r2.limitlesstcg.net/pokemon/gen9/' + sprite + '.png';
        return `<img class="tcg-pokemon-icon tcg-pokemon-icon--md" src="${url}" alt="${escapeHtml(name)}" loading="lazy" onerror="this.style.display='none'">`;
    }

    // ── Mutations ───────────────────────────────────────────────────────────
    function addMon(slug) {
        if (_team.length >= MAX || _team.indexOf(slug) !== -1) return;
        _team.push(slug); _query = '';
        render();
    }
    function removeMon(slug) { _team = _team.filter(s => s !== slug); render(); }
    function clearAll() { _team = []; _query = ''; render(); }

    // ── Render ──────────────────────────────────────────────────────────────
    function suggestionsHtml(l) {
        const q = norm(_query);
        let cand = candidates().filter(c => !q || searchHay(c.slug).indexOf(q) !== -1);
        if (_team.length === 0 && !q) cand = cand.slice(0, EMPTY_CAP);
        if (!cand.length) return `<p class="sqb-none">${escapeHtml(_team.length ? l.none : l.empty)}</p>`;
        // Overlap % is only meaningful with ≥ 2 picks (with 1 pick everything is
        // 100 % — the mon's own teammate list).
        const showPct = _team.length >= 2;
        return cand.map(c => {
            const pct = showPct
                ? `<span class="sqb-sugg-count">${Math.round(c.overlap * 100)}%</span>` : '';
            const partial = showPct && c.overlap < 1 ? ' is-partial' : '';
            return `<button type="button" class="sqb-sugg${partial}" data-add="${escapeHtml(c.slug)}">
                ${icon(c.slug)}
                <span class="sqb-sugg-name">${escapeHtml(displayName(c.slug))}</span>
                ${pct}
            </button>`;
        }).join('');
    }

    function render() {
        const host = document.getElementById(HOST_ID);
        if (!host) return;
        const l = t();

        const chips = _team.length
            ? _team.map(slug =>
                `<button type="button" class="sqb-chip" data-remove="${escapeHtml(slug)}" title="${escapeHtml(l.remove)}">
                    ${icon(slug)}<span class="sqb-chip-name">${escapeHtml(displayName(slug))}</span><span class="sqb-chip-x">×</span>
                </button>`).join('')
            : `<span class="sqb-empty">${escapeHtml(l.empty)}</span>`;

        host.innerHTML = `
            <div class="sqb">
                <p class="sqb-intro">${escapeHtml(l.intro)}</p>
                <div class="sqb-team-bar">
                    <div class="sqb-chips">${chips}</div>
                    <div class="sqb-team-bar-meta">
                        <span class="sqb-count">${escapeHtml(l.picked(_team.length))}</span>
                        ${_team.length ? `<button type="button" class="sqb-clear">${escapeHtml(l.clear)}</button>` : ''}
                    </div>
                </div>
                <div class="sqb-searchwrap">
                    <input type="search" class="sqb-search" placeholder="${escapeHtml(l.searchPh)}"
                           value="${escapeHtml(_query)}" autocomplete="off" spellcheck="false"
                           aria-label="${escapeHtml(l.searchPh)}">
                </div>
                <h4 class="sqb-sec">${escapeHtml(l.suggestTitle)}</h4>
                <p class="sqb-hint">${escapeHtml(_team.length ? l.suggestHint : l.suggestHintFirst)}</p>
                <div class="sqb-suggs">${suggestionsHtml(l)}</div>
                <p class="sqb-attr">${escapeHtml(l.attribution)}</p>
            </div>`;
        wire(host);
    }

    function wire(host) {
        const search = host.querySelector('.sqb-search');
        if (search) {
            search.addEventListener('input', () => {
                _query = search.value;
                const box = host.querySelector('.sqb-suggs');
                if (box) { box.innerHTML = suggestionsHtml(t()); wireSuggs(box); }
            });
        }
        wireSuggs(host);
        host.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => removeMon(b.getAttribute('data-remove'))));
        const clr = host.querySelector('.sqb-clear'); if (clr) clr.addEventListener('click', clearAll);
    }
    function wireSuggs(scope) {
        scope.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => addMon(b.getAttribute('data-add'))));
    }

    let _activated = false;
    async function activate() {
        const host = document.getElementById(HOST_ID);
        if (host && !_loaded) host.innerHTML = '<p class="sqb-loading">…</p>';
        await Promise.all([load(), loadDe()]);
        _activated = true;
        render();
    }

    document.addEventListener('languageChanged', () => {
        const host = document.getElementById(HOST_ID);
        if (_activated && host && !host.hidden) render();
    });

    window.sideQuestBuilder = { activate };
})();
