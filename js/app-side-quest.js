// Side Quest — Pokémon Champions Replica Codes
// Renders the top-N current Champions doubles teams from
// data/champions_replica_teams.json. Each team card surfaces the
// in-game replica code (one-tap copy), the 6-mon team sheet
// (mon + item + ability + 4 moves), and a short strategy.
//
// Data source is currently a hand-curated JSON; the future
// backend/scrapers/champions_replica_scraper.py will refresh it on
// the weekly run from op.gg and victoryroad.pro.

(function () {
    'use strict';

    const DATA_URL = 'data/champions_replica_teams.json';
    const STRATEGY_URL = 'data/champions_team_strategies.json';
    const HOST_ID  = 'sideQuestTeamsHost';
    const STATUS_ID = 'sideQuestStatus';

    let _data = null;
    let _loaded = false;
    let _strategies = null;        // { replicaCode: {de:{…}, en:{…}, …} }
    let _strategiesLoaded = false;

    async function loadData() {
        if (_loaded && _data) return _data;
        try {
            const resp = await fetch(`${DATA_URL}?t=${Date.now()}`);
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            _data = await resp.json();
            _loaded = true;
        } catch (err) {
            console.warn('[SideQuest] failed to load', DATA_URL, err);
            _data = { _meta: {}, teams: [] };
        }
        return _data;
    }

    // Strategy guides are generated CI-side by
    // scripts/generate_team_strategies.py (Claude API) and cached in
    // STRATEGY_URL keyed by replica code. The file may simply not
    // exist yet (404) — every card then renders without an info
    // button, nothing breaks.
    async function loadStrategies() {
        if (_strategiesLoaded) return _strategies || {};
        try {
            const resp = await fetch(`${STRATEGY_URL}?t=${Date.now()}`);
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const json = await resp.json();
            _strategies = (json && json.strategies) || {};
        } catch (err) {
            _strategies = {};
        }
        _strategiesLoaded = true;
        return _strategies;
    }

    // UI labels for the strategy modal. The strategy CONTENT comes
    // pre-translated (de+en) from the generator; only the chrome
    // around it needs local strings. window.getLang() is the global
    // i18n switch ('en' | 'de', default 'en').
    function uiLang() {
        return (typeof window.getLang === 'function' && window.getLang() === 'de') ? 'de' : 'en';
    }

    const LABELS = {
        de: {
            infoBtn: 'So spielst du das Team',
            infoAria: 'Strategie-Erklärung anzeigen für',
            roles: 'Die Pokémon und ihre Rollen',
            gamePlan: 'So läuft ein typisches Spiel',
            tips: 'Tipps für den Einstieg',
            aiNote: 'KI-generierte Erklärung (Claude) · Stand',
            close: 'Schließen',
        },
        en: {
            infoBtn: 'How to play this team',
            infoAria: 'Show strategy explanation for',
            roles: 'The Pokémon and their roles',
            gamePlan: 'How a typical game goes',
            tips: 'Beginner tips',
            aiNote: 'AI-generated guide (Claude) · as of',
            close: 'Close',
        },
    };

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function renderHeader(meta) {
        const subtitle = meta.subtitle || '';
        const updated  = meta.last_updated || '';
        return `
            <div class="side-quest-intro">
                <p class="side-quest-subtitle">${escapeHtml(subtitle)}</p>
                ${updated ? `<p class="side-quest-updated">Last updated: ${escapeHtml(updated)}</p>` : ''}
            </div>
        `;
    }

    // Showdown-format names from pokepaste already follow the
    // form-suffix convention Limitless R2 sprites use (lowercase +
    // hyphen-separated): "Charizard-Mega-Y" → charizard-mega-y,
    // "Floette-Mega" → floette-mega, "Incineroar" → incineroar. Forms
    // Limitless doesn't host (e.g. "Sinistcha-Masterpiece" → not in
    // their gen9 set yet) hide via <img onerror>.
    function pokemonSlug(name) {
        return String(name || '').toLowerCase().trim();
    }

    function pokemonIcon(name) {
        const slug = pokemonSlug(name);
        if (!slug) return '';
        if (window.ArchetypeIcons && typeof window.ArchetypeIcons.slugIconHtml === 'function') {
            return window.ArchetypeIcons.slugIconHtml(slug, { size: 'md', alt: name });
        }
        // Fallback when ArchetypeIcons hasn't loaded — render the img
        // directly with the same R2 prefix the helper uses.
        const url = 'https://r2.limitlesstcg.net/pokemon/gen9/' + slug + '.png';
        return `<img class="tcg-pokemon-icon tcg-pokemon-icon--md" src="${url}" alt="${escapeHtml(name)}" loading="lazy" onerror="this.style.display='none'">`;
    }

    function renderPokemon(p) {
        const moves = (p.moves || []).slice(0, 4);
        const movesHtml = moves.map(m =>
            `<li class="side-quest-move">${escapeHtml(m)}</li>`
        ).join('');
        const tera = p.tera_type ? `<span class="side-quest-tera">Tera: ${escapeHtml(p.tera_type)}</span>` : '';
        const icon = pokemonIcon(p.name);
        // EVs / Nature are only populated for refreshes after the
        // 2026-06-09 scraper update — older snapshots have empty
        // strings and the rows simply hide.
        const evs = p.evs ? `<div class="side-quest-evs"><span class="side-quest-evs-label">EVs:</span> ${escapeHtml(p.evs)}</div>` : '';
        const nature = p.nature ? `<div class="side-quest-nature">${escapeHtml(p.nature)} Nature</div>` : '';
        return `
            <div class="side-quest-mon">
                <div class="side-quest-mon-head">
                    <span class="side-quest-mon-title">
                        ${icon}
                        <span class="side-quest-mon-name">${escapeHtml(p.name || '—')}</span>
                    </span>
                    ${tera}
                </div>
                <div class="side-quest-mon-meta">
                    ${p.ability ? `<span class="side-quest-ability">${escapeHtml(p.ability)}</span>` : ''}
                    ${p.item ? `<span class="side-quest-item">@ ${escapeHtml(p.item)}</span>` : ''}
                </div>
                ${evs}
                ${nature}
                <ul class="side-quest-moves">${movesHtml}</ul>
            </div>
        `;
    }

    function renderTeam(team) {
        const monsHtml = (team.pokemon || []).map(renderPokemon).join('');
        const stratHtml = (team.strategy || [])
            .map(line => `<li>${escapeHtml(line)}</li>`)
            .join('');
        const code = team.replica_code || '';
        const trainer = team.trainer ? ` · ${escapeHtml(team.trainer)}` : '';
        const tourney = team.tournament ? `<span class="side-quest-team-tourney">${escapeHtml(team.tournament)}${trainer}</span>` : '';
        const labels = LABELS[uiLang()];
        const hasGuide = !!(_strategies && _strategies[code] &&
                            _strategies[code][uiLang()]);
        const infoBtn = hasGuide ? `
                    <button class="side-quest-info-btn"
                            type="button"
                            data-strategy-code="${escapeHtml(code)}"
                            aria-label="${escapeHtml(labels.infoAria)} ${escapeHtml(team.team_name || code)}">
                        <span class="side-quest-info-icon" aria-hidden="true">ℹ</span>
                        <span class="side-quest-info-label">${escapeHtml(labels.infoBtn)}</span>
                    </button>` : '';
        return `
            <article class="side-quest-team" data-replica-code="${escapeHtml(code)}">
                <header class="side-quest-team-head">
                    <div class="side-quest-team-meta">
                        <span class="side-quest-rank">#${escapeHtml(String(team.rank || '—'))}</span>
                        <h3 class="side-quest-team-name">${escapeHtml(team.team_name || 'Untitled team')}</h3>
                        ${tourney}
                    </div>
                    <button class="side-quest-copy-btn"
                            type="button"
                            data-code="${escapeHtml(code)}"
                            aria-label="Copy replica code ${escapeHtml(code)}">
                        <span class="side-quest-copy-label">Replica</span>
                        <span class="side-quest-copy-code">${escapeHtml(code) || '—'}</span>
                        <span class="side-quest-copy-icon" aria-hidden="true">📋</span>
                    </button>
                </header>
                <div class="side-quest-team-grid">${monsHtml}</div>
                ${infoBtn}
                ${stratHtml ? `
                    <details class="side-quest-strategy">
                        <summary>Strategy notes</summary>
                        <ul>${stratHtml}</ul>
                    </details>
                ` : ''}
            </article>
        `;
    }

    // ── Strategy modal ────────────────────────────────────────────
    // One overlay element, rebuilt per open. Content comes from the
    // CI-generated cache (already bilingual), chrome strings from
    // LABELS. Closes on ×, backdrop click and Escape.

    function closeStrategyModal() {
        const overlay = document.getElementById('sideQuestStrategyModal');
        if (overlay) overlay.remove();
        document.removeEventListener('keydown', onModalKeydown);
    }

    function onModalKeydown(e) {
        if (e.key === 'Escape') closeStrategyModal();
    }

    function openStrategyModal(team, entry) {
        closeStrategyModal();
        const lang = uiLang();
        const labels = LABELS[lang];
        const guide = entry[lang] || entry.en || entry.de;
        if (!guide) return;

        const rolesHtml = (guide.roles || []).map(r => `
            <li class="side-quest-modal-role">
                <span class="side-quest-modal-role-mon">${pokemonIcon(r.name)}<strong>${escapeHtml(r.name)}</strong></span>
                <span class="side-quest-modal-role-text">${escapeHtml(r.role)}</span>
            </li>
        `).join('');
        const planHtml = (guide.game_plan || []).map(s =>
            `<li>${escapeHtml(s)}</li>`
        ).join('');
        const tipsHtml = (guide.tips || []).map(t =>
            `<li>${escapeHtml(t)}</li>`
        ).join('');
        const generatedDate = (entry.generated_at || '').slice(0, 10);

        const overlay = document.createElement('div');
        overlay.id = 'sideQuestStrategyModal';
        overlay.className = 'side-quest-modal-overlay';
        overlay.innerHTML = `
            <div class="side-quest-modal" role="dialog" aria-modal="true"
                 aria-label="${escapeHtml(team.team_name || '')}">
                <header class="side-quest-modal-head">
                    <div>
                        <h3 class="side-quest-modal-title">${escapeHtml(team.team_name || '')}</h3>
                        ${team.tournament ? `<p class="side-quest-modal-sub">${escapeHtml(team.tournament)}${team.trainer ? ' · ' + escapeHtml(team.trainer) : ''}</p>` : ''}
                    </div>
                    <button class="side-quest-modal-close" type="button"
                            aria-label="${escapeHtml(labels.close)}">×</button>
                </header>
                <div class="side-quest-modal-body">
                    <p class="side-quest-modal-overview">${escapeHtml(guide.overview || '')}</p>
                    ${rolesHtml ? `
                        <h4>${escapeHtml(labels.roles)}</h4>
                        <ul class="side-quest-modal-roles">${rolesHtml}</ul>` : ''}
                    ${planHtml ? `
                        <h4>${escapeHtml(labels.gamePlan)}</h4>
                        <ol class="side-quest-modal-plan">${planHtml}</ol>` : ''}
                    ${tipsHtml ? `
                        <h4>${escapeHtml(labels.tips)}</h4>
                        <ul class="side-quest-modal-tips">${tipsHtml}</ul>` : ''}
                    <p class="side-quest-modal-ai-note">${escapeHtml(labels.aiNote)}${generatedDate ? ' ' + escapeHtml(generatedDate) : ''}</p>
                </div>
            </div>
        `;
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeStrategyModal();
        });
        overlay.querySelector('.side-quest-modal-close')
            .addEventListener('click', closeStrategyModal);
        document.addEventListener('keydown', onModalKeydown);
        document.body.appendChild(overlay);
        overlay.querySelector('.side-quest-modal-close').focus();
    }

    async function copyCode(btn) {
        const code = btn.getAttribute('data-code') || '';
        if (!code) return;
        try {
            await navigator.clipboard.writeText(code);
            btn.classList.add('is-copied');
            const label = btn.querySelector('.side-quest-copy-label');
            const prev  = label ? label.textContent : '';
            if (label) label.textContent = 'Copied!';
            setTimeout(() => {
                btn.classList.remove('is-copied');
                if (label) label.textContent = prev || 'Replica';
            }, 1600);
        } catch (err) {
            // Fallback: select the text so user can copy manually
            const range = document.createRange();
            range.selectNodeContents(btn);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            console.warn('[SideQuest] clipboard write failed', err);
        }
    }

    async function render() {
        const host = document.getElementById(HOST_ID);
        if (!host) return;
        const status = document.getElementById(STATUS_ID);
        if (status) status.textContent = 'Loading…';
        const [data] = await Promise.all([loadData(), loadStrategies()]);
        const meta  = data._meta || {};
        const teams = Array.isArray(data.teams) ? data.teams : [];
        if (status) status.textContent = '';

        if (teams.length === 0) {
            host.innerHTML = `
                <div class="side-quest-empty">
                    <p>No teams loaded.</p>
                    <p>Run <code>backend/scrapers/champions_replica_scraper.py</code> or populate <code>data/champions_replica_teams.json</code>.</p>
                </div>
            `;
            return;
        }

        const headerHtml = renderHeader(meta);
        const teamsHtml = teams
            .sort((a, b) => (a.rank || 999) - (b.rank || 999))
            .map(renderTeam)
            .join('');

        host.innerHTML = `
            ${headerHtml}
            <div class="side-quest-teams">${teamsHtml}</div>
        `;

        host.querySelectorAll('.side-quest-copy-btn').forEach(btn => {
            btn.addEventListener('click', () => copyCode(btn));
        });

        host.querySelectorAll('.side-quest-info-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const code = btn.getAttribute('data-strategy-code') || '';
                const entry = _strategies && _strategies[code];
                const team = teams.find(t => (t.replica_code || '') === code);
                if (entry && team) openStrategyModal(team, entry);
            });
        });
    }

    // Expose for the tab-switch hook
    window.sideQuest = {
        render,
        loadData,
    };

    // Auto-render when the side-quest tab becomes active. The site uses
    // a simple "switchTab" function that toggles .active on the tab-
    // content; we just listen for the most common trigger paths.
    document.addEventListener('DOMContentLoaded', () => {
        const hook = () => {
            const tab = document.getElementById('side-quest');
            if (tab && tab.classList.contains('active')) {
                render();
            }
        };
        // Run once on load in case the tab is already active
        hook();
        // And re-run on any tab switch
        document.addEventListener('click', (e) => {
            const t = e.target.closest('[data-tab-id="side-quest"], [onclick*="side-quest"]');
            if (t) setTimeout(hook, 50);
        });
        // Language toggle: info-button labels + a potentially open
        // strategy modal are language-dependent — re-render the tab
        // (cheap, data is cached) and drop the modal.
        document.addEventListener('languageChanged', () => {
            closeStrategyModal();
            hook();
        });
    });
})();
