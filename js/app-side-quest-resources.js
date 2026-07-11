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
    let _champOnly = true;     // show only entries available in Champions

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
            verifiedHint:'Deutsche Beschreibung handgeprüft',
            noEffect:    'Keine Beschreibung hinterlegt.',
            none:        'Nichts gefunden — andere Schreibweise oder Stichwort probieren.',
            champOnly:    'Nur in Champions',
            champNote:    'Zeigt nur Items/Fähigkeiten/Attacken, die in Pokémon Champions verfügbar sind.',
            loading:     'Lade Referenzdaten …',
            error:       'Referenzdaten konnten nicht geladen werden.',
            count:       (n) => `${n} Einträge`,
            statPower:   'Stärke',
            statAcc:     'Genauigkeit',
            statPP:      'AP',
            statPrio:    'Prio',
            dmgPhysical: 'Physisch',
            dmgSpecial:  'Speziell',
            dmgStatus:   'Status',
            attribution: 'Daten: Pokémon-Champions-Datensatz (CC BY 4.0) · Deutsche Texte: PokéAPI',
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
            verifiedHint:'German description hand-checked',
            noEffect:    'No description available yet.',
            none:        'Nothing found — try a different spelling or keyword.',
            champOnly:    'Champions only',
            champNote:    'Shows only items/abilities/moves available in Pokémon Champions.',
            loading:     'Loading reference data …',
            error:       'Could not load reference data.',
            count:       (n) => `${n} entries`,
            statPower:   'Power',
            statAcc:     'Accuracy',
            statPP:      'PP',
            statPrio:    'Prio',
            dmgPhysical: 'Physical',
            dmgSpecial:  'Special',
            dmgStatus:   'Status',
            attribution: 'Data: Pokémon Champions dataset (CC BY 4.0) · German text: PokéAPI',
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

    // Extra searchable aliases keyed by normalized EN name — common old / colloquial
    // German names people still search by. "Finte" was the German name of the
    // long-removed move Faint Attack; users often expect it to find Feint
    // (now officially "Offenlegung"), so map it here.
    const SEARCH_ALIASES = {
        feint: 'finte',
    };

    function matches(e, q) {
        if (!q) return true;
        // Search both languages' names AND effects so "tailwind" finds it
        // from a German UI and "rückenwind" finds it from an English one.
        const hay = norm(e.en) + ' ' + norm(e.de) + ' ' +
                    norm(e.en_effect) + ' ' + norm(e.de_effect) + ' ' + norm(e.type) +
                    ' ' + (SEARCH_ALIASES[norm(e.en)] || '');
        return q.split(/\s+/).every(tok => hay.indexOf(tok) !== -1);
    }

    function currentResults() {
        if (!_entries) return [];
        const q = norm(_query).trim();
        const lang = uiLang();
        return _entries
            .filter(e => !_champOnly || e.champ !== false)   // Champions-availability gate
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
        (_entries || [])
            .filter(e => !_champOnly || e.champ !== false)
            .forEach(e => { c.all++; c[e.cat]++; if (e.field) c.field++; });
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

    // Champions-verified move stats line (power / accuracy / PP / damage
    // class). Status moves have no power → "—"; never-miss moves have no
    // accuracy → "—". Only rendered for moves that carry any of these.
    function moveStatsHtml(e, l) {
        if (e.cat !== 'move') return '';
        const hasPrio = e.priority != null && Number(e.priority) !== 0;
        const has = e.power != null || e.accuracy != null || e.pp != null || e.damage_class || hasPrio;
        if (!has) return '';
        const dash = '—';
        const dmg = e.damage_class === 'Physical' ? l.dmgPhysical
                  : e.damage_class === 'Special'  ? l.dmgSpecial
                  : e.damage_class === 'Status'   ? l.dmgStatus : '';
        // power 0 = status move → show "—" rather than "0"; missing accuracy
        // = never-miss / status → "—".
        const hasPower = e.power != null && Number(e.power) > 0;
        const parts = [
            `<span class="sq-res-stat"><span class="sq-res-stat-k">${escapeHtml(l.statPower)}</span> <b>${hasPower ? escapeHtml(String(e.power)) : dash}</b></span>`,
            `<span class="sq-res-stat"><span class="sq-res-stat-k">${escapeHtml(l.statAcc)}</span> <b>${e.accuracy != null ? escapeHtml(String(e.accuracy)) : dash}</b></span>`,
        ];
        if (e.pp != null) parts.push(`<span class="sq-res-stat"><span class="sq-res-stat-k">${escapeHtml(l.statPP)}</span> <b>${escapeHtml(String(e.pp))}</b></span>`);
        // Only shown when non-zero — a positive/negative priority is the meaningful
        // case (Fake Out +3, Feint +2, Trick Room −7); priority 0 is the default.
        if (hasPrio) {
            const p = Number(e.priority);
            const sign = p > 0 ? `+${p}` : String(p).replace('-', '−');
            parts.push(`<span class="sq-res-stat sq-res-stat-prio"><span class="sq-res-stat-k">${escapeHtml(l.statPrio)}</span> <b>${escapeHtml(sign)}</b></span>`);
        }
        if (dmg) parts.push(`<span class="sq-res-stat sq-res-stat-dmg">${escapeHtml(dmg)}</span>`);
        return `<div class="sq-res-movestats">${parts.join('')}</div>`;
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
                ${moveStatsHtml(e, l)}
                <div class="sq-res-effect" hidden>${effHtml}</div>
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

    function renderChampToggle() {
        const l = t();
        return `
            <div class="sq-res-champ-row">
                <button class="sq-res-champ${_champOnly ? ' is-on' : ''}" type="button"
                        data-sq-res-champ role="switch" aria-checked="${_champOnly ? 'true' : 'false'}">
                    <span class="sq-res-champ-dot" aria-hidden="true"></span>${escapeHtml(l.champOnly)}
                </button>
                <span class="sq-res-champ-note">${escapeHtml(l.champNote)}</span>
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
                ${renderChampToggle()}
                ${renderChips()}
                <p class="sq-res-count">${escapeHtml(l.count(results.length))}</p>
                ${listHtml}
                <p class="sq-res-attr">${escapeHtml(l.attribution)}</p>
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
        const champBtn = host.querySelector('[data-sq-res-champ]');
        if (champBtn) champBtn.addEventListener('click', () => { _champOnly = !_champOnly; render(); });
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

    // ── Sub-tab toggle (Teams ↔ Pokémon ↔ Nachschlagen) ────────────
    // Generic over the three view hosts; the Pokédex view delegates to
    // its own module (window.sideQuestPokedex).
    const VIEW_HOSTS = {
        teams: 'sideQuestTeamsHost',
        pokedex: 'sideQuestPokedexHost',
        battle: 'sideQuestBattleHost',
        resources: 'sideQuestResourcesHost',
    };
    function showView(view) {
        if (!VIEW_HOSTS[view]) view = 'teams';
        const status = document.getElementById('sideQuestStatus');
        Object.keys(VIEW_HOSTS).forEach(v => {
            const el = document.getElementById(VIEW_HOSTS[v]);
            if (el) el.hidden = (v !== view);
        });
        if (status) status.hidden = (view !== 'teams');   // team load status is teams-only
        document.querySelectorAll('.side-quest-subtab').forEach(b => {
            b.classList.toggle('is-active', b.getAttribute('data-sq-view') === view);
            b.setAttribute('aria-selected', b.getAttribute('data-sq-view') === view ? 'true' : 'false');
        });
        if (view === 'resources') {
            if (!_activated) {
                _activated = true;
                render();                 // paints the loading state
                loadData().then(render);  // then the real list
            } else {
                render();
            }
        } else if (view === 'pokedex' && window.sideQuestPokedex) {
            window.sideQuestPokedex.activate();
        } else if (view === 'battle' && window.sideQuestPokedex && window.sideQuestPokedex.activateBattle) {
            window.sideQuestPokedex.activateBattle();
        }
    }

    function setSubtabLabels() {
        const l = t();
        const pokedexLabel = uiLang() === 'de' ? 'Pokémon' : 'Pokémon';
        const battleLabel = uiLang() === 'de' ? 'Kampfdaten' : 'Battle data';
        document.querySelectorAll('.side-quest-subtab').forEach(b => {
            const v = b.getAttribute('data-sq-view');
            b.textContent = v === 'resources' ? l.tabResources
                          : v === 'pokedex' ? pokedexLabel
                          : v === 'battle' ? battleLabel
                          : l.tabTeams;
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
