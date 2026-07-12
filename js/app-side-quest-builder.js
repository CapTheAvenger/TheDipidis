// Side Quest · Team Builder
// ============================================================================
// Co-occurrence team builder over the real top-team list
// (data/champions_replica_teams.json). Pick a Pokémon → the builder shows only
// the Pokémon that appear alongside it on real teams, ranked by how often. Pick
// another → the pool narrows to Pokémon that play with BOTH, and so on up to 6.
// The matching real teams (with tap-to-copy replica codes) are shown below.
(function () {
    'use strict';

    const DATA_URL = 'data/champions_replica_teams.json';
    const DE_NAMES_URL = 'data/pokemon_names_de.json';
    const HOST_ID = 'sideQuestBuilderHost';
    const MAX = 6;
    const PREVIEW_TEAMS = 12;

    let _teams = null, _loaded = false;
    let _deNames = {}, _deLoaded = false;
    let _team = [];          // selected species (display names as they appear in the data)
    let _query = '';

    function uiLang() { return (typeof window.getLang === 'function' && window.getLang() === 'de') ? 'de' : 'en'; }
    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function norm(s) { return String(s || '').trim().toLowerCase(); }

    const LABELS = {
        de: {
            intro: 'Bau dir ein Team aus echten Top-Teams: Wähl ein Pokémon — der Builder zeigt dir dann nur noch Pokémon, die damit zusammen gespielt werden. Jede weitere Wahl grenzt weiter ein.',
            searchPh: '🔎 Pokémon hinzufügen (Deutsch oder Englisch) …',
            picked: (n) => `${n} / ${MAX} gewählt`,
            matching: (n) => `${n} passende Teams`,
            suggestTitle: 'Passt dazu',
            suggestHint: 'Sortiert nach Häufigkeit in den passenden Teams — Zahl = in wie vielen. Tippen zum Hinzufügen.',
            teamsTitle: 'Passende Teams',
            none: 'Keine weitere Kombination gefunden — nimm ein Pokémon raus.',
            empty: 'Wähl oben ein Pokémon, um zu starten.',
            clear: 'Zurücksetzen',
            copied: 'Kopiert ✓',
            remove: 'Entfernen',
            attribution: 'Basis: echte Top-Doppelkampf-Teams (op.gg / victoryroad).',
        },
        en: {
            intro: 'Build a team from real top teams: pick a Pokémon — the builder then shows only Pokémon it is played alongside. Each further pick narrows the pool.',
            searchPh: '🔎 Add a Pokémon (German or English) …',
            picked: (n) => `${n} / ${MAX} selected`,
            matching: (n) => `${n} matching teams`,
            suggestTitle: 'Plays with',
            suggestHint: 'Ranked by how often they share a team — the number is the team count. Tap to add.',
            teamsTitle: 'Matching teams',
            none: 'No further combination found — remove a Pokémon.',
            empty: 'Pick a Pokémon above to start.',
            clear: 'Reset',
            copied: 'Copied ✓',
            remove: 'Remove',
            attribution: 'Based on real top doubles teams (op.gg / victoryroad).',
        },
    };
    function t() { return LABELS[uiLang()]; }

    async function load() {
        if (_loaded) return;
        try {
            const r = await fetch(`${DATA_URL}?t=${Date.now()}`);
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const j = await r.json();
            _teams = (j && j.teams) || [];
        } catch (err) {
            console.warn('[SideQuest/builder] failed to load teams', err);
            _teams = [];
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
    function teamNames(team) { return (team.pokemon || []).map(p => (p && p.name) || '').filter(Boolean); }

    function matchingTeams() {
        if (!_teams) return [];
        const sel = _team.map(norm);
        return _teams.filter(tm => {
            const ns = teamNames(tm).map(norm);
            return sel.every(s => ns.indexOf(s) !== -1);
        });
    }

    // Species that appear on the matching teams (excluding the ones already
    // picked), each with the number of matching teams it appears on.
    function candidates() {
        const mt = matchingTeams();
        const selN = new Set(_team.map(norm));
        const c = new Map();     // norm → { name, count }
        mt.forEach(tm => {
            const seen = new Set();
            teamNames(tm).forEach(n => {
                const k = norm(n);
                if (selN.has(k) || seen.has(k)) return;
                seen.add(k);
                const e = c.get(k) || { name: n, count: 0 };
                e.count++; c.set(k, e);
            });
        });
        return [...c.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    }

    // ── Names / sprites ─────────────────────────────────────────────────────
    function deName(sp) { return _deNames[sp] || _deNames[String(sp || '').trim()] || ''; }
    function displayName(sp) { const de = deName(sp); return (uiLang() === 'de' && de) ? de : sp; }
    function searchHay(sp) { return norm(sp) + ' ' + norm(deName(sp)); }
    function icon(name) {
        const slug = norm(name).replace(/\s+/g, '-');
        if (window.ArchetypeIcons && typeof window.ArchetypeIcons.slugIconHtml === 'function') {
            return window.ArchetypeIcons.slugIconHtml(slug, { size: 'md', alt: name });
        }
        const url = 'https://r2.limitlesstcg.net/pokemon/gen9/' + slug + '.png';
        return `<img class="tcg-pokemon-icon tcg-pokemon-icon--md" src="${url}" alt="${escapeHtml(name)}" loading="lazy" onerror="this.style.display='none'">`;
    }

    // ── Mutations ───────────────────────────────────────────────────────────
    function addMon(sp) {
        if (_team.length >= MAX || _team.some(x => norm(x) === norm(sp))) return;
        _team.push(sp); _query = '';
        render();
    }
    function removeMon(sp) { _team = _team.filter(x => norm(x) !== norm(sp)); render(); }
    function clearAll() { _team = []; _query = ''; render(); }

    async function copyCode(btn) {
        const code = btn.getAttribute('data-code');
        if (!code) return;
        try { await navigator.clipboard.writeText(code); } catch (_) { /* ignore */ }
        const old = btn.textContent;
        btn.textContent = t().copied;
        btn.classList.add('is-copied');
        setTimeout(() => { btn.textContent = old; btn.classList.remove('is-copied'); }, 1400);
    }

    // ── Render ──────────────────────────────────────────────────────────────
    function suggestionsHtml(l) {
        const q = norm(_query);
        const cand = candidates().filter(c => !q || searchHay(c.name).indexOf(q) !== -1);
        if (!cand.length) return `<p class="sqb-none">${escapeHtml(_team.length ? l.none : l.empty)}</p>`;
        return cand.map(c =>
            `<button type="button" class="sqb-sugg" data-add="${escapeHtml(c.name)}">
                ${icon(c.name)}
                <span class="sqb-sugg-name">${escapeHtml(displayName(c.name))}</span>
                <span class="sqb-sugg-count">${c.count}</span>
            </button>`).join('');
    }

    function render() {
        const host = document.getElementById(HOST_ID);
        if (!host) return;
        const l = t();
        const mt = matchingTeams();

        const chips = _team.length
            ? _team.map(sp =>
                `<button type="button" class="sqb-chip" data-remove="${escapeHtml(sp)}" title="${escapeHtml(l.remove)}">
                    ${icon(sp)}<span class="sqb-chip-name">${escapeHtml(displayName(sp))}</span><span class="sqb-chip-x">×</span>
                </button>`).join('')
            : `<span class="sqb-empty">${escapeHtml(l.empty)}</span>`;

        const teamsHtml = mt.slice(0, PREVIEW_TEAMS).map(tm => {
            const sprites = teamNames(tm).map(n =>
                `<span class="sqb-team-mon" title="${escapeHtml(displayName(n))}">${icon(n)}</span>`).join('');
            const code = tm.replica_code || '';
            const name = tm.team_name || tm.trainer || '';
            return `<div class="sqb-team">
                <div class="sqb-team-mons">${sprites}</div>
                <div class="sqb-team-meta">
                    <span class="sqb-team-name">${escapeHtml(name)}</span>
                    ${code ? `<button type="button" class="sqb-code" data-code="${escapeHtml(code)}">${escapeHtml(code)}</button>` : ''}
                </div>
            </div>`;
        }).join('');

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
                <h4 class="sqb-sec">${escapeHtml(l.suggestTitle)} <span class="sqb-matching">· ${escapeHtml(l.matching(mt.length))}</span></h4>
                <p class="sqb-hint">${escapeHtml(l.suggestHint)}</p>
                <div class="sqb-suggs">${suggestionsHtml(l)}</div>
                ${mt.length ? `<h4 class="sqb-sec">${escapeHtml(l.teamsTitle)}</h4><div class="sqb-teams">${teamsHtml}</div>` : ''}
                <p class="sqb-attr">${escapeHtml(l.attribution)}</p>
            </div>`;
        wire(host);
    }

    function wire(host) {
        const search = host.querySelector('.sqb-search');
        if (search) {
            search.addEventListener('input', () => {
                _query = search.value;
                // Update only the suggestions list so the input keeps focus/caret.
                const box = host.querySelector('.sqb-suggs');
                if (box) { box.innerHTML = suggestionsHtml(t()); wireSuggs(box); }
            });
        }
        wireSuggs(host);
        host.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => removeMon(b.getAttribute('data-remove'))));
        const clr = host.querySelector('.sqb-clear'); if (clr) clr.addEventListener('click', clearAll);
        host.querySelectorAll('.sqb-code').forEach(b => b.addEventListener('click', () => copyCode(b)));
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
