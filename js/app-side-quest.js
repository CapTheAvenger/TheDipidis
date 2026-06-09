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
    const HOST_ID  = 'sideQuestTeamsHost';
    const STATUS_ID = 'sideQuestStatus';

    let _data = null;
    let _loaded = false;

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

    function renderPokemon(p) {
        const moves = (p.moves || []).slice(0, 4);
        const movesHtml = moves.map(m =>
            `<li class="side-quest-move">${escapeHtml(m)}</li>`
        ).join('');
        const tera = p.tera_type ? `<span class="side-quest-tera">Tera: ${escapeHtml(p.tera_type)}</span>` : '';
        return `
            <div class="side-quest-mon">
                <div class="side-quest-mon-head">
                    <span class="side-quest-mon-name">${escapeHtml(p.name || '—')}</span>
                    ${tera}
                </div>
                <div class="side-quest-mon-meta">
                    ${p.ability ? `<span class="side-quest-ability">${escapeHtml(p.ability)}</span>` : ''}
                    ${p.item ? `<span class="side-quest-item">@ ${escapeHtml(p.item)}</span>` : ''}
                </div>
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
                ${stratHtml ? `
                    <details class="side-quest-strategy">
                        <summary>Strategy notes</summary>
                        <ul>${stratHtml}</ul>
                    </details>
                ` : ''}
            </article>
        `;
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
        const data = await loadData();
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
    });
})();
