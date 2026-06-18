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
            playBtn: 'Play',
            playAria: 'Live-Hilfe (Speed-Werte + Schwächen + Gegner-Erfassung) öffnen für',
            infoBtn: 'So spielst du das Team',
            infoAria: 'Strategie-Erklärung anzeigen für',
            claudeBtn: 'So spielst du das Team (via Claude)',
            claudeAria: 'Strategie-Prompt kopieren und Claude öffnen für',
            claudeCopied: 'Kopiert! Bei Claude einfügen ✓',
            claudeToastOk: 'Prompt kopiert — füge ihn im Claude-Tab mit Strg/⌘+V ein und sende ab.',
            claudeToastManual: 'Automatisches Kopieren ging nicht — bitte den Prompt im Tab manuell kopieren.',
            roles: 'Die Pokémon und ihre Rollen',
            gamePlan: 'So läuft ein typisches Spiel',
            tips: 'Tipps für den Einstieg',
            aiNote: 'KI-generierte Erklärung (Claude) · Stand',
            close: 'Schließen',
            markWant: 'Will ich probieren',
            markLiked: 'Fand ich gut',
            markDisliked: 'Nicht nochmal',
            markHint: 'Markieren: ⭐ probieren · 👍 gut · 👎 nicht nochmal',
            filterTitle: 'Teams mit …',
            filterPh: 'Pokémon eingeben (bis zu 6) …',
            filterHint: 'Zeigt nur Teams, die ALLE gewählten Pokémon enthalten.',
            filterClear: 'Zurücksetzen',
            filterCount: (n, total) => `${n} von ${total} Teams`,
            filterNone: 'Kein Team enthält alle gewählten Pokémon.',
            filterRemove: 'Entfernen',
            regCurrent: 'aktuelles Meta',
            filterAdd: 'Pokémon auswählen',
            filterMax: 'Maximum erreicht (6)',
            filterPickProgress: (n) => `${n} / 6 gewählt`,
            pickerClose: 'Schließen',
            pickerEmpty: 'Kein Treffer — Schreibweise prüfen.',
        },
        en: {
            playBtn: 'Play',
            playAria: 'Open live helper (speed values + weaknesses + opponent capture) for',
            infoBtn: 'How to play this team',
            infoAria: 'Show strategy explanation for',
            claudeBtn: 'How to play this team (via Claude)',
            claudeAria: 'Copy strategy prompt and open Claude for',
            claudeCopied: 'Copied! Paste into Claude ✓',
            claudeToastOk: 'Prompt copied — paste it into the Claude tab with Ctrl/⌘+V and send.',
            claudeToastManual: 'Auto-copy failed — please copy the prompt manually in the tab.',
            roles: 'The Pokémon and their roles',
            gamePlan: 'How a typical game goes',
            tips: 'Beginner tips',
            aiNote: 'AI-generated guide (Claude) · as of',
            close: 'Close',
            markWant: 'Want to try',
            markLiked: 'Liked it',
            markDisliked: 'Not again',
            markHint: 'Mark teams: ⭐ try · 👍 liked · 👎 not again',
            filterTitle: 'Teams with …',
            filterPh: 'Type a Pokémon (up to 6) …',
            filterHint: 'Shows only teams that contain ALL selected Pokémon.',
            filterClear: 'Reset',
            filterCount: (n, total) => `${n} of ${total} teams`,
            filterNone: 'No team contains all selected Pokémon.',
            filterRemove: 'Remove',
            regCurrent: 'current meta',
            filterAdd: 'Choose a Pokémon',
            filterMax: 'Maximum reached (6)',
            filterPickProgress: (n) => `${n} / 6 selected`,
            pickerClose: 'Close',
            pickerEmpty: 'No match — check the spelling.',
        },
    };

    // ── Team marks (will-ich-spielen / fand-ich-gut / nicht-nochmal) ──
    // Stored locally, keyed by a CONTENT hash of the team — not by the
    // trainer name, rank or replica code. That's deliberate: the same
    // 6-mon composition often re-enters the top 20 under a different
    // pilot ("Person X plays Person Y's team and does well"). The user
    // wants their verdict to stick to the TEAM, so a team they already
    // tried and disliked stays marked even when the name on the card
    // changes. EVs / nature / tera are excluded from the hash so a copy
    // with a tweaked spread still matches the original.
    const MARKS_KEY = 'dipidis.sideQuest.teamMarks.v1';
    const MARK_STATES = ['want', 'liked', 'disliked'];
    let _marks = null;

    function teamIdentityHash(team) {
        const mons = (team.pokemon || []).map(p => {
            const moves = (p.moves || [])
                .map(m => String(m).toLowerCase().trim())
                .filter(Boolean)
                .sort();
            return [
                String(p.name || '').toLowerCase().trim(),
                String(p.item || '').toLowerCase().trim(),
                String(p.ability || '').toLowerCase().trim(),
                moves.join(','),
            ].join('|');
        }).sort();
        const canonical = mons.join(';');
        // FNV-1a 32-bit → base36. Collision risk across ~20-80 teams is
        // negligible; we only need a stable short key, not crypto.
        let h = 0x811c9dc5;
        for (let i = 0; i < canonical.length; i++) {
            h ^= canonical.charCodeAt(i);
            h = (h * 0x01000193) >>> 0;
        }
        return 't_' + h.toString(36);
    }

    function loadMarks() {
        if (_marks) return _marks;
        try {
            const raw = localStorage.getItem(MARKS_KEY);
            const parsed = raw ? JSON.parse(raw) : {};
            _marks = (parsed && typeof parsed === 'object') ? parsed : {};
        } catch (e) {
            _marks = {};
        }
        return _marks;
    }

    function saveMarks() {
        try {
            localStorage.setItem(MARKS_KEY, JSON.stringify(_marks || {}));
        } catch (e) {
            console.warn('[SideQuest] failed to persist team marks', e);
        }
    }

    function getMark(hash) {
        return loadMarks()[hash] || null;
    }

    // Toggle semantics: clicking the active state clears it; clicking a
    // different state replaces it.
    function setMark(hash, status) {
        const m = loadMarks();
        if (!status || m[hash] === status || MARK_STATES.indexOf(status) === -1) {
            delete m[hash];
        } else {
            m[hash] = status;
        }
        saveMarks();
    }

    function renderMarkButtons(hash, status) {
        const labels = LABELS[uiLang()];
        const btn = (mark, icon, label) => `
            <button class="side-quest-mark-btn side-quest-mark-${mark}${status === mark ? ' is-active' : ''}"
                    type="button"
                    data-mark="${mark}"
                    data-team-hash="${escapeHtml(hash)}"
                    title="${escapeHtml(label)}"
                    aria-pressed="${status === mark ? 'true' : 'false'}"
                    aria-label="${escapeHtml(label)}">
                <span class="side-quest-mark-icon" aria-hidden="true">${icon}</span>
            </button>`;
        return `
            <div class="side-quest-marks" role="group" aria-label="${escapeHtml(labels.markHint)}">
                ${btn('want', '⭐', labels.markWant)}
                ${btn('liked', '👍', labels.markLiked)}
                ${btn('disliked', '👎', labels.markDisliked)}
            </div>`;
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
        const labels   = LABELS[uiLang()];
        return `
            <div class="side-quest-intro">
                <p class="side-quest-subtitle">${escapeHtml(subtitle)}</p>
                ${updated ? `<p class="side-quest-updated">Last updated: ${escapeHtml(updated)}</p>` : ''}
                <p class="side-quest-mark-hint">${escapeHtml(labels.markHint)}</p>
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
        const hash = teamIdentityHash(team);
        const status = getMark(hash);
        const stateClass = status ? ` side-quest-mark-state-${status}` : '';
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
        // Claude-Button: shown when there's no cached guide. Copies a
        // ready-made prompt and opens Claude so the user gets the
        // explanation from their own Claude — no API cost to the site.
        const claudeBtn = hasGuide ? '' : `
                    <button class="side-quest-claude-btn"
                            type="button"
                            data-team-code="${escapeHtml(code)}"
                            aria-label="${escapeHtml(labels.claudeAria)} ${escapeHtml(team.team_name || code)}">
                        <span class="side-quest-claude-icon" aria-hidden="true">✨</span>
                        <span class="side-quest-claude-label">${escapeHtml(labels.claudeBtn)}</span>
                    </button>`;
        // Play-Button: opens the live-helper overlay (Speed-Werte +
        // Schwächen + Gegner-Erfassung). Visible on every card — the
        // helper does its own data-availability check, so the button
        // always works even if a species isn't in the stats DB yet.
        const playBtn = `
                    <button class="side-quest-play-btn"
                            type="button"
                            data-team-code="${escapeHtml(code)}"
                            aria-label="${escapeHtml(labels.playAria)} ${escapeHtml(team.team_name || code)}">
                        <span class="side-quest-play-icon" aria-hidden="true">▶</span>
                        <span class="side-quest-play-label">${escapeHtml(labels.playBtn)}</span>
                    </button>`;
        return `
            <article class="side-quest-team${stateClass}" data-replica-code="${escapeHtml(code)}" data-team-hash="${escapeHtml(hash)}">
                <header class="side-quest-team-head">
                    <div class="side-quest-team-meta">
                        <span class="side-quest-rank">#${escapeHtml(String(team.rank || '—'))}</span>
                        <span class="side-quest-reg-badge${regOf(team) === CURRENT_REG ? ' is-current' : ''}" title="Regulation ${escapeHtml(regOf(team))}">${escapeHtml(regOf(team))}</span>
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
                <div class="side-quest-team-footer">
                    ${playBtn}
                    ${infoBtn}
                    ${claudeBtn}
                    ${renderMarkButtons(hash, status)}
                </div>
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

    // ── "How to play this team — via Claude" ──────────────────────
    // Zero-API-cost alternative to the CI-generated guides: build a
    // ready-to-send prompt from the team composition, copy it to the
    // clipboard and open Claude in a new tab. The end user pastes it
    // and gets the explanation from their own Claude — the site pays
    // nothing. Used for teams that don't have a cached guide.
    function buildClaudePrompt(team) {
        const de = uiLang() === 'de';
        const langName = de ? 'Deutsch' : 'English';
        const lines = [];
        let anyMega = false;
        (team.pokemon || []).forEach(p => {
            const parts = [`- ${p.name || '—'}`];
            if (p.item) parts.push(`@ ${p.item}`);
            const meta = [];
            if (p.ability) meta.push((de ? 'Fähigkeit: ' : 'Ability: ') + p.ability);
            // This format has no Tera — instead a held Mega Stone (item
            // ending in "-ite", optionally " X"/" Y") lets the mon Mega
            // Evolve, which changes its stats. Flag it so Claude accounts
            // for it. Eviolite is the one "-ite" item that isn't a stone.
            const isMegaStone = p.item &&
                /ite( ?[XY])?$/i.test(p.item.trim()) &&
                !/^eviolite$/i.test(p.item.trim());
            if (isMegaStone) {
                anyMega = true;
                meta.push(de ? 'Mega-Entwicklung (Item ist Mega-Stein)'
                             : 'Mega Evolves (item is a Mega Stone)');
            }
            if (p.nature) meta.push((de ? 'Wesen: ' : 'Nature: ') + p.nature);
            if (p.evs) meta.push('EVs: ' + p.evs);
            let line = parts.join(' ');
            if (meta.length) line += ' | ' + meta.join(' | ');
            const moves = (p.moves || []).slice(0, 4).filter(Boolean);
            if (moves.length) line += '\n    ' + (de ? 'Attacken: ' : 'Moves: ') + moves.join(', ');
            lines.push(line);
        });
        const header = team.team_name || team.replica_code || 'Team';
        const ctx = [team.tournament, team.trainer].filter(Boolean).join(' · ');
        const megaNoteDe = `Hinweis zum Format: Es gibt KEINE Tera-Mechanik. Stattdessen entwickeln sich Pokémon mit einem Mega-Stein (als Item) Mega — dabei ändern sich ihre Werte, auch die Initiative/Geschwindigkeit. Berücksichtige, welche Pokémon Mega gehen und wie das den Spielplan verändert.`;
        const megaNoteEn = `Format note: there is NO Tera mechanic. Instead, Pokémon holding a Mega Stone (as their item) Mega Evolve, which changes their stats — including Speed. Account for which Pokémon Mega Evolve and how that shifts the game plan.`;

        if (de) {
            return [
                `Du bist ein erfahrener Pokémon-VGC-Coach (Format: Pokémon Champions, Doppelkämpfe, 4 von 6 mitnehmen).`,
                `Erkläre einsteigerfreundlich auf ${langName}, wie man das folgende Team spielt. Sei konkret und praktisch.`,
                ``,
                `Team: ${header}${ctx ? ' (' + ctx + ')' : ''}`,
                ``,
                lines.join('\n'),
                ``,
                ...(anyMega ? [megaNoteDe, ``] : []),
                `Bitte gehe auf Folgendes ein:`,
                `1. Kurzer Überblick (2–3 Sätze): Was ist der Spielplan des Teams?`,
                `2. Die Rolle jedes Pokémon (je ein kurzer Absatz).`,
                `3. So läuft ein typisches Spiel ab — Schritt für Schritt.`,
                `4. 3–5 Einsteiger-Tipps (typische Fehler, was beschützen, welcher Lead).`,
                ``,
                `Antworte auf ${langName}.`,
            ].join('\n');
        }
        return [
            `You are an experienced Pokémon VGC coach (format: Pokémon Champions, doubles, bring 4 of 6).`,
            `Explain in beginner-friendly ${langName} how to play the following team. Be concrete and practical.`,
            ``,
            `Team: ${header}${ctx ? ' (' + ctx + ')' : ''}`,
            ``,
            lines.join('\n'),
            ``,
            ...(anyMega ? [megaNoteEn, ``] : []),
            `Please cover:`,
            `1. A short 2–3 sentence overview of the team's game plan.`,
            `2. Each Pokémon's role (one short paragraph each).`,
            `3. How a typical game goes — step by step.`,
            `4. 3–5 beginner tips (common mistakes, what to protect, lead choices).`,
            ``,
            `Answer in ${langName}.`,
        ].join('\n');
    }

    // Synchronous clipboard write (kept inside the click gesture so the
    // subsequent window.open isn't treated as a pop-up). Falls back to
    // the async Clipboard API as a best-effort enhancement.
    function copyTextSync(text) {
        let ok = false;
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.top = '-1000px';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            ok = document.execCommand('copy');
            document.body.removeChild(ta);
        } catch (_) { ok = false; }
        if (!ok && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {}).catch(() => {});
            ok = true;
        }
        return ok;
    }

    function openClaudeForTeam(team, btn) {
        const labels = LABELS[uiLang()];
        const prompt = buildClaudePrompt(team);
        const copied = copyTextSync(prompt);
        // Open Claude synchronously after the copy so the gesture stays
        // valid and the pop-up blocker doesn't intervene.
        window.open('https://claude.ai/new', '_blank', 'noopener');
        if (btn) {
            const label = btn.querySelector('.side-quest-claude-label');
            const prev = label ? label.textContent : '';
            btn.classList.add('is-copied');
            if (label) label.textContent = labels.claudeCopied;
            setTimeout(() => {
                btn.classList.remove('is-copied');
                if (label) label.textContent = prev || labels.claudeBtn;
            }, 2200);
        }
        if (typeof window.showToast === 'function') {
            window.showToast(copied ? labels.claudeToastOk : labels.claudeToastManual,
                             copied ? 'success' : 'warning');
        }
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

    // ── Champions regulation / meta timeline ───────────────────────
    // Teams are grouped into blocks by regulation, current meta first,
    // and each card carries a meta badge. A team's regulation is taken
    // from team.regulation when the scraper provides it, else derived
    // from its share date. Newest-first. (Champions: M-A from launch
    // 2026-04-08, M-B from 2026-06-16.)
    const REG_TIMELINE = [
        { id: 'M-B', start: Date.parse('2026-06-16') },
        { id: 'M-A', start: Date.parse('2026-04-08') },
    ];
    const CURRENT_REG = 'M-B';

    function regOf(team) {
        if (team && team.regulation) return team.regulation;
        const t = Date.parse(team && team.date_shared);
        if (!isNaN(t)) {
            for (const r of REG_TIMELINE) if (t >= r.start) return r.id;
        }
        return REG_TIMELINE[REG_TIMELINE.length - 1].id;
    }
    function regOrder() {
        return [CURRENT_REG].concat(REG_TIMELINE.map(r => r.id).filter(id => id !== CURRENT_REG));
    }
    function regBlockLabel(id) {
        const labels = LABELS[uiLang()];
        return id === CURRENT_REG ? `Regulation ${id} · ${labels.regCurrent}` : `Regulation ${id}`;
    }

    // ── "Teams with …" species filter ──────────────────────────────
    // User picks up to 6 Pokémon; only teams that contain ALL of them
    // stay visible (AND logic). State is module-level so it survives the
    // re-renders triggered by mark clicks etc.
    const MAX_FILTER = 6;
    let _speciesFilter = [];
    let _allSpecies = [];           // species present across teams (for the picker)
    let _speciesCounts = new Map(); // species → number of teams running it

    function normSpecies(s) { return String(s || '').trim().toLowerCase(); }

    function allSpeciesFrom(teams) {
        const seen = new Map();  // norm → display name
        teams.forEach(t => (t.pokemon || []).forEach(p => {
            const nm = (p.name || '').trim();
            if (nm) seen.set(normSpecies(nm), nm);
        }));
        return [...seen.values()].sort((a, b) => a.localeCompare(b));
    }

    function teamHasSpecies(team, sp) {
        const n = normSpecies(sp);
        return (team.pokemon || []).some(p => normSpecies(p.name) === n);
    }

    function addSpecies(sp) {
        if (!sp || _speciesFilter.length >= MAX_FILTER) return;
        if (_speciesFilter.some(x => normSpecies(x) === normSpecies(sp))) return;
        _speciesFilter.push(sp);
    }
    function removeSpecies(sp) {
        _speciesFilter = _speciesFilter.filter(x => normSpecies(x) !== normSpecies(sp));
    }

    function renderSpeciesFilter(allSpecies, shown, total) {
        const labels = LABELS[uiLang()];
        const atMax = _speciesFilter.length >= MAX_FILTER;
        const active = _speciesFilter.length > 0;
        const chips = _speciesFilter.map(sp => `
            <span class="side-quest-filter-chip">
                ${pokemonIcon(sp)}
                <span class="side-quest-filter-chip-name">${escapeHtml(sp)}</span>
                <button class="side-quest-filter-remove" type="button"
                        data-filter-remove="${escapeHtml(sp)}"
                        aria-label="${escapeHtml(labels.filterRemove)} ${escapeHtml(sp)}">×</button>
            </span>`).join('');
        return `
            <div class="side-quest-filter">
                <div class="side-quest-filter-head">
                    <span class="side-quest-filter-title">${escapeHtml(labels.filterTitle)}</span>
                    ${active ? `<span class="side-quest-filter-count">${escapeHtml(labels.filterCount(shown, total))}</span>` : ''}
                    ${active ? `<button class="side-quest-filter-clear" type="button" data-filter-clear>${escapeHtml(labels.filterClear)}</button>` : ''}
                </div>
                ${chips ? `<div class="side-quest-filter-chips">${chips}</div>` : ''}
                <button class="side-quest-filter-trigger" type="button" id="sideQuestFilterOpen" ${atMax ? 'disabled' : ''}>
                    <span class="side-quest-filter-trigger-icon" aria-hidden="true">＋</span>
                    <span>${escapeHtml(atMax ? labels.filterMax : labels.filterAdd)}</span>
                </button>
                <p class="side-quest-filter-hint">${escapeHtml(labels.filterHint)}</p>
            </div>`;
    }

    // ── Species picker (Quick-Pick-style grid overlay) ─────────────
    // Same design as the Play opponent picker (sq-play-picker-* classes):
    // a full-screen overlay with a search box + a tappable grid of the
    // species present in the teams, each showing how many teams run it.
    // Multi-select up to 6; auto-closes when full.
    let _pickerKey = null;

    function speciesCountsFrom(teams, allSpecies) {
        const m = new Map();
        allSpecies.forEach(sp => m.set(sp, teams.filter(t => teamHasSpecies(t, sp)).length));
        return m;
    }

    function speciesCellHtml(sp) {
        const n = _speciesCounts.get(sp) || 0;
        const selected = _speciesFilter.some(x => normSpecies(x) === normSpecies(sp));
        const badge = n > 0 ? `<span class="sq-play-picker-cell-usage">${n}</span>` : '';
        return `<button type="button" class="sq-play-picker-cell${n > 0 ? ' sq-play-picker-cell-played' : ''}${selected ? ' is-selected' : ''}"
                        data-pick-species="${escapeHtml(sp)}" aria-pressed="${selected ? 'true' : 'false'}"
                        title="${escapeHtml(sp)}">
                    ${pokemonIcon(sp)}
                    <span class="sq-play-picker-cell-name">${escapeHtml(sp)}</span>
                    ${badge}
                </button>`;
    }

    function closeSpeciesPicker() {
        const el = document.getElementById('sideQuestSpeciesPicker');
        if (el) el.remove();
        if (_pickerKey) { document.removeEventListener('keydown', _pickerKey); _pickerKey = null; }
    }

    function openSpeciesPicker() {
        closeSpeciesPicker();
        const labels = LABELS[uiLang()];
        const overlay = document.createElement('div');
        overlay.id = 'sideQuestSpeciesPicker';
        overlay.className = 'sq-play-picker-overlay';
        overlay.innerHTML = `
            <div class="sq-play-picker-panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(labels.filterTitle)}">
                <header class="sq-play-picker-head">
                    <span class="sq-play-picker-progress" id="sqSpeciesProgress">${escapeHtml(labels.filterPickProgress(_speciesFilter.length))}</span>
                    <input type="search" class="sq-play-picker-search" id="sqSpeciesSearch"
                           placeholder="${escapeHtml(labels.filterPh)}" autocomplete="off" inputmode="search">
                    <button type="button" class="sq-play-picker-close" aria-label="${escapeHtml(labels.pickerClose)}">×</button>
                </header>
                <div class="sq-play-picker-grid" id="sqSpeciesGrid"></div>
            </div>`;
        document.body.appendChild(overlay);

        const grid = overlay.querySelector('#sqSpeciesGrid');
        const search = overlay.querySelector('#sqSpeciesSearch');
        const progress = overlay.querySelector('#sqSpeciesProgress');

        const updateGrid = () => {
            const f = normSpecies(search ? search.value : '');
            const list = (f ? _allSpecies.filter(s => normSpecies(s).indexOf(f) !== -1) : _allSpecies.slice())
                // Most-used first (by # of teams running it), then alphabetical.
                .sort((a, b) => (_speciesCounts.get(b) || 0) - (_speciesCounts.get(a) || 0)
                                || a.localeCompare(b));
            grid.innerHTML = list.length
                ? list.map(speciesCellHtml).join('')
                : `<p class="sq-play-picker-empty">${escapeHtml(labels.pickerEmpty)}</p>`;
        };
        const refresh = () => {
            if (progress) progress.textContent = labels.filterPickProgress(_speciesFilter.length);
            updateGrid();
            render();  // live-update the teams behind the overlay
        };

        updateGrid();
        if (search) search.addEventListener('input', updateGrid);
        overlay.querySelector('.sq-play-picker-close').addEventListener('click', closeSpeciesPicker);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) { closeSpeciesPicker(); return; }
            const cell = e.target.closest('.sq-play-picker-cell');
            if (!cell) return;
            const sp = cell.getAttribute('data-pick-species');
            if (!sp) return;
            if (_speciesFilter.some(x => normSpecies(x) === normSpecies(sp))) {
                removeSpecies(sp);
                refresh();
            } else {
                addSpecies(sp);
                if (_speciesFilter.length >= MAX_FILTER) { closeSpeciesPicker(); render(); }
                else refresh();
            }
        });
        _pickerKey = (e) => { if (e.key === 'Escape') closeSpeciesPicker(); };
        document.addEventListener('keydown', _pickerKey);
        setTimeout(() => search && search.focus(), 30);
    }

    function wireSpeciesFilter(host) {
        const trigger = host.querySelector('#sideQuestFilterOpen');
        if (trigger) trigger.addEventListener('click', openSpeciesPicker);
        host.querySelectorAll('[data-filter-remove]').forEach(btn => {
            btn.addEventListener('click', () => {
                removeSpecies(btn.getAttribute('data-filter-remove'));
                render();
            });
        });
        const clearBtn = host.querySelector('[data-filter-clear]');
        if (clearBtn) clearBtn.addEventListener('click', () => { _speciesFilter = []; render(); });
    }

    async function render() {
        const host = document.getElementById(HOST_ID);
        if (!host) return;
        const status = document.getElementById(STATUS_ID);
        // Only show the loading hint on the first build — re-renders
        // after a mark click run off the cached data and shouldn't
        // flash "Loading…".
        if (status && !_loaded) status.textContent = 'Loading…';
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

        // "Teams with …" species filter (AND across all picked Pokémon).
        _allSpecies = allSpeciesFrom(teams);
        _speciesCounts = speciesCountsFrom(teams, _allSpecies);
        const filtered = _speciesFilter.length
            ? teams.filter(t => _speciesFilter.every(sp => teamHasSpecies(t, sp)))
            : teams;
        const filterHtml = renderSpeciesFilter(_allSpecies, filtered.length, teams.length);
        const labels = LABELS[uiLang()];

        // Within a block: "not again" teams sink to the bottom (still
        // visible so the verdict can be revisited); else rank order.
        const sortTeams = (arr) => arr.slice().sort((a, b) => {
            const da = getMark(teamIdentityHash(a)) === 'disliked' ? 1 : 0;
            const db = getMark(teamIdentityHash(b)) === 'disliked' ? 1 : 0;
            if (da !== db) return da - db;
            return (a.rank || 999) - (b.rank || 999);
        });

        // Group into regulation blocks, current meta first.
        const byReg = new Map();
        filtered.forEach(t => {
            const r = regOf(t);
            if (!byReg.has(r)) byReg.set(r, []);
            byReg.get(r).push(t);
        });
        const order = regOrder().filter(id => byReg.has(id));
        byReg.forEach((_, id) => { if (order.indexOf(id) === -1) order.push(id); });
        const blocksHtml = order.map(id => `
            <section class="side-quest-reg-block">
                <h3 class="side-quest-reg-head${id === CURRENT_REG ? ' is-current' : ''}">
                    ${escapeHtml(regBlockLabel(id))}
                    <span class="side-quest-reg-count">${byReg.get(id).length}</span>
                </h3>
                <div class="side-quest-teams">${sortTeams(byReg.get(id)).map(renderTeam).join('')}</div>
            </section>`).join('');

        const teamsBody = filtered.length
            ? blocksHtml
            : `<p class="side-quest-filter-none">${escapeHtml(labels.filterNone)}</p>`;

        host.innerHTML = `
            ${headerHtml}
            ${filterHtml}
            ${teamsBody}
        `;

        wireSpeciesFilter(host);

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

        host.querySelectorAll('.side-quest-claude-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const code = btn.getAttribute('data-team-code') || '';
                const team = teams.find(t => (t.replica_code || '') === code);
                if (team) openClaudeForTeam(team, btn);
            });
        });

        host.querySelectorAll('.side-quest-play-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const code = btn.getAttribute('data-team-code') || '';
                const team = teams.find(t => (t.replica_code || '') === code);
                if (team && window.sideQuestPlay && typeof window.sideQuestPlay.openPlayModal === 'function') {
                    window.sideQuestPlay.openPlayModal(team);
                }
            });
        });

        host.querySelectorAll('.side-quest-mark-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const hash = btn.getAttribute('data-team-hash') || '';
                const mark = btn.getAttribute('data-mark') || '';
                if (!hash) return;
                setMark(hash, mark);
                render();  // cheap: data is cached, just re-sorts + repaints
            });
        });
    }

    // Expose for the tab-switch hook
    window.sideQuest = {
        render,
        loadData,
        teamIdentityHash,
        getMark,
        setMark,
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
