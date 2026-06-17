// ── Side Quest · Champions — Resources / Nachschlagen ──────────────
// A searchable reference of the items, abilities and moves that show
// up in the Pokémon Champions doubles meta. Built on the verified
// reference files that the (now-disabled) strategy generator used as
// fact blocks:
//   data/champions_items_reference.json      { items:      {EN: {de_name, effect}} }
//   data/champions_abilities_reference.json   { abilities:  {EN: {de_name, effect}} }
//   data/champions_moves_reference.json       { moves:      {EN: {de_name, type, effect}} }
//
// Beginner-first: type a German name, English name or keyword and get
// the verified mechanic explanation. A "Feldeffekte" filter collects
// the weather / terrain / room / screen setters + extenders that drive
// so much of VGC doubles.
(function () {
    'use strict';

    const RESOURCES_URL = 'data/champions_resources.json';

    let _entries = null;       // [{cat, en, de, type, en_effect, de_effect, field, verified}]
    let _loading = null;
    let _activated = false;    // lazy: only fetch on first Resources view
    let _query = '';
    let _filter = 'all';       // all | item | ability | move | field

    function uiLang() {
        return (typeof window.getLang === 'function' && window.getLang() === 'de') ? 'de' : 'en';
    }

    const LABELS = {
        de: {
            tabTeams:    'Teams',
            tabResources:'Nachschlagen',
            heading:     'Nachschlagewerk',
            intro:       'Items, Fähigkeiten und Attacken aus dem Champions-Doppelkampf-Meta — auf Deutsch, Englisch oder per Stichwort suchen.',
            searchPh:    '🔎 Suche: „Rückenwind", „Tailwind", „Sonne", „Wahlschal" …',
            fAll:        'Alle',
            fItem:       'Items',
            fAbility:    'Fähigkeiten',
            fMove:       'Attacken',
            fField:      'Feldeffekte',
            catItem:     'Item',
            catAbility:  'Fähigkeit',
            catMove:     'Attacke',
            fieldTag:    'Feld',
            verifiedHint:'Für Champions geprüft',
            srcVerified: '✓ Champions-geprüft',
            srcMainline: 'Standard-Mechanik · offizieller Spieltext (PokéAPI)',
            noEffect:    'Keine Beschreibung hinterlegt.',
            none:        'Nichts gefunden — andere Schreibweise oder Stichwort probieren.',
            loading:     'Lade Referenzdaten …',
            error:       'Referenzdaten konnten nicht geladen werden.',
            count:       (n) => `${n} Einträge`,
        },
        en: {
            tabTeams:    'Teams',
            tabResources:'Look up',
            heading:     'Reference',
            intro:       'Items, abilities and moves from the Champions doubles meta — search in German, English or by keyword.',
            searchPh:    '🔎 Search: "Tailwind", "Rückenwind", "sun", "Choice Scarf" …',
            fAll:        'All',
            fItem:       'Items',
            fAbility:    'Abilities',
            fMove:       'Moves',
            fField:      'Field effects',
            catItem:     'Item',
            catAbility:  'Ability',
            catMove:     'Move',
            fieldTag:    'Field',
            verifiedHint:'Checked for Champions',
            srcVerified: '✓ Champions-checked',
            srcMainline: 'Mainline mechanic · official in-game text (PokéAPI)',
            noEffect:    'No description available yet.',
            none:        'Nothing found — try a different spelling or keyword.',
            loading:     'Loading reference data …',
            error:       'Could not load reference data.',
            count:       (n) => `${n} entries`,
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
        _loading = fetch(`${RESOURCES_URL}?t=${Date.now()}`)
            .then(r => r.ok ? r.json() : null)
            .then(json => {
                _entries = (json && Array.isArray(json.entries)) ? json.entries : [];
                return _entries;
            })
            .catch(() => { _entries = []; return _entries; });
        return _loading;
    }

    // Effect text in the UI language, falling back to the other language
    // (PokéAPI sometimes only has one). '' when neither exists.
    function effectFor(e) {
        const lang = uiLang();
        const primary = lang === 'de' ? e.de_effect : e.en_effect;
        const other   = lang === 'de' ? e.en_effect : e.de_effect;
        return (primary && primary.trim()) ? primary : (other || '');
    }

    // ── Filtering / search ─────────────────────────────────────────
    function norm(s) { return String(s || '').toLowerCase(); }

    function matches(e, q) {
        if (!q) return true;
        // Search both languages' names AND effects so "tailwind" finds it
        // from a German UI and "rückenwind" finds it from an English one.
        const hay = norm(e.en) + ' ' + norm(e.de) + ' ' +
                    norm(e.en_effect) + ' ' + norm(e.de_effect) + ' ' + norm(e.type);
        return q.split(/\s+/).every(tok => hay.indexOf(tok) !== -1);
    }

    function currentResults() {
        if (!_entries) return [];
        const q = norm(_query).trim();
        const lang = uiLang();
        return _entries
            .filter(e => _filter === 'all' ? true : (_filter === 'field' ? e.field : e.cat === _filter))
            .filter(e => matches(e, q))
            .sort((a, b) => {
                const ka = lang === 'de' ? a.de : a.en;
                const kb = lang === 'de' ? b.de : b.en;
                return ka.localeCompare(kb, lang);
            });
    }

    function counts() {
        const c = { all: 0, item: 0, ability: 0, move: 0, field: 0 };
        (_entries || []).forEach(e => { c.all++; c[e.cat]++; if (e.field) c.field++; });
        return c;
    }

    // ── Render ─────────────────────────────────────────────────────
    function typeBadge(type) {
        if (!type) return '';
        return `<span class="sq-res-type sq-play-type-${escapeHtml(type.toLowerCase())}">${escapeHtml(type)}</span>`;
    }

    function catLabel(cat) {
        const l = t();
        return cat === 'item' ? l.catItem : cat === 'ability' ? l.catAbility : l.catMove;
    }

    function renderEntry(e) {
        const lang = uiLang();
        const l = t();
        const primary   = lang === 'de' ? e.de : e.en;
        const secondary = lang === 'de' ? e.en : e.de;
        const fieldTag = e.field ? `<span class="sq-res-fieldtag">${escapeHtml(l.fieldTag)}</span>` : '';
        const verTag = e.verified
            ? `<span class="sq-res-verified" title="${escapeHtml(l.verifiedHint)}">✓</span>`
            : '';
        const eff = effectFor(e);
        const effHtml = eff
            ? escapeHtml(eff)
            : `<span class="sq-res-noeff">${escapeHtml(l.noEffect)}</span>`;
        const srcHtml = `<span class="sq-res-source">${escapeHtml(e.verified ? l.srcVerified : l.srcMainline)}</span>`;
        return `
            <li class="sq-res-entry sq-res-cat-${e.cat}${e.verified ? ' is-verified' : ''}">
                <button class="sq-res-head" type="button" aria-expanded="false">
                    <span class="sq-res-names">
                        <span class="sq-res-name">${verTag}${escapeHtml(primary)}</span>
                        <span class="sq-res-name-alt">${escapeHtml(secondary)}</span>
                    </span>
                    <span class="sq-res-badges">
                        ${typeBadge(e.type)}
                        ${fieldTag}
                        <span class="sq-res-cat">${escapeHtml(catLabel(e.cat))}</span>
                        <span class="sq-res-chevron" aria-hidden="true">▾</span>
                    </span>
                </button>
                <div class="sq-res-effect" hidden>${effHtml}${srcHtml}</div>
            </li>`;
    }

    function renderChips() {
        const l = t();
        const c = counts();
        const chip = (id, label) =>
            `<button class="sq-res-chip${_filter === id ? ' is-active' : ''}" type="button" data-sq-res-filter="${id}">${escapeHtml(label)} <span class="sq-res-chip-n">${c[id] || 0}</span></button>`;
        return `
            <div class="sq-res-chips" role="tablist">
                ${chip('all', l.fAll)}
                ${chip('item', l.fItem)}
                ${chip('ability', l.fAbility)}
                ${chip('move', l.fMove)}
                ${chip('field', l.fField)}
            </div>`;
    }

    function render() {
        const host = document.getElementById('sideQuestResourcesHost');
        if (!host) return;
        const l = t();

        if (!_entries) {
            host.innerHTML = `<p class="sq-res-status">${escapeHtml(l.loading)}</p>`;
            return;
        }
        if (_entries.length === 0) {
            host.innerHTML = `<p class="sq-res-status">${escapeHtml(l.error)}</p>`;
            return;
        }

        const results = currentResults();
        const listHtml = results.length
            ? `<ul class="sq-res-list">${results.map(renderEntry).join('')}</ul>`
            : `<p class="sq-res-status">${escapeHtml(l.none)}</p>`;

        host.innerHTML = `
            <div class="sq-res">
                <p class="sq-res-intro">${escapeHtml(l.intro)}</p>
                <input id="sqResSearch" class="sq-res-search" type="search"
                       placeholder="${escapeHtml(l.searchPh)}"
                       value="${escapeHtml(_query)}"
                       autocomplete="off" spellcheck="false"
                       aria-label="${escapeHtml(l.heading)}">
                ${renderChips()}
                <p class="sq-res-count">${escapeHtml(l.count(results.length))}</p>
                ${listHtml}
            </div>`;

        wireEvents(host);
    }

    function wireEvents(host) {
        const search = host.querySelector('#sqResSearch');
        if (search) {
            search.addEventListener('input', () => {
                _query = search.value;
                rerenderResultsOnly();   // keeps input focus (input isn't repainted)
            });
        }
        host.querySelectorAll('.sq-res-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                _filter = btn.getAttribute('data-sq-res-filter') || 'all';
                render();
            });
        });
        wireEntryButtons(host);
    }

    function toggleEffect(btn) {
        const entry = btn.closest('.sq-res-entry');
        const eff = entry && entry.querySelector('.sq-res-effect');
        if (!eff) return;
        const open = eff.hasAttribute('hidden');
        if (open) { eff.removeAttribute('hidden'); btn.setAttribute('aria-expanded', 'true'); entry.classList.add('is-open'); }
        else      { eff.setAttribute('hidden', '');  btn.setAttribute('aria-expanded', 'false'); entry.classList.remove('is-open'); }
    }

    function wireEntryButtons(host) {
        host.querySelectorAll('.sq-res-head').forEach(btn => {
            if (btn._sqWired) return;
            btn._sqWired = true;
            btn.addEventListener('click', () => toggleEffect(btn));
        });
    }

    // Live-search repaint: only the count + list change, so we avoid a
    // full re-render that would drop input focus mid-typing.
    function rerenderResultsOnly() {
        const host = document.getElementById('sideQuestResourcesHost');
        if (!host) return;
        const l = t();
        const results = currentResults();
        const countEl = host.querySelector('.sq-res-count');
        if (countEl) countEl.textContent = l.count(results.length);
        const listHtml = results.length
            ? `<ul class="sq-res-list">${results.map(renderEntry).join('')}</ul>`
            : `<p class="sq-res-status sq-res-status--empty">${escapeHtml(l.none)}</p>`;
        const container = host.querySelector('.sq-res');
        const existing = container && (container.querySelector('.sq-res-list') || container.querySelector('.sq-res-status--empty'));
        if (existing) existing.outerHTML = listHtml;
        else if (container) container.insertAdjacentHTML('beforeend', listHtml);
        wireEntryButtons(host);
    }

    // ── Sub-tab toggle (Teams ↔ Nachschlagen) ──────────────────────
    function showView(view) {
        const teamsHost = document.getElementById('sideQuestTeamsHost');
        const resHost   = document.getElementById('sideQuestResourcesHost');
        const status    = document.getElementById('sideQuestStatus');
        const isRes = view === 'resources';
        if (teamsHost) teamsHost.hidden = isRes;
        if (resHost)   resHost.hidden = !isRes;
        if (status)    status.hidden = isRes;   // team load status is teams-only
        document.querySelectorAll('.side-quest-subtab').forEach(b => {
            b.classList.toggle('is-active', b.getAttribute('data-sq-view') === view);
            b.setAttribute('aria-selected', b.getAttribute('data-sq-view') === view ? 'true' : 'false');
        });
        if (isRes) {
            if (!_activated) {
                _activated = true;
                render();                 // paints the loading state
                loadData().then(render);  // then the real list
            } else {
                render();
            }
        }
    }

    function setSubtabLabels() {
        const l = t();
        document.querySelectorAll('.side-quest-subtab').forEach(b => {
            const v = b.getAttribute('data-sq-view');
            b.textContent = v === 'resources' ? l.tabResources : l.tabTeams;
        });
    }

    function initSubtabs() {
        const bar = document.querySelector('.side-quest-subtabs');
        if (!bar || bar._sqWired) return;
        bar._sqWired = true;
        setSubtabLabels();
        bar.querySelectorAll('.side-quest-subtab').forEach(btn => {
            btn.addEventListener('click', () => showView(btn.getAttribute('data-sq-view') || 'teams'));
        });
    }

    document.addEventListener('DOMContentLoaded', initSubtabs);
    // The side-quest tab can be activated after DOMContentLoaded too.
    document.addEventListener('click', (e) => {
        if (e.target.closest('[data-tab-id="side-quest"], [onclick*="side-quest"]')) {
            setTimeout(initSubtabs, 0);
        }
    });
    document.addEventListener('languageChanged', () => {
        setSubtabLabels();
        const resHost = document.getElementById('sideQuestResourcesHost');
        if (_activated && resHost && !resHost.hidden) render();
    });

    window.sideQuestResources = { showView, render, loadData };
})();
