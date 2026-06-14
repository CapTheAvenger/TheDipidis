// Side Quest — "Play this team" panel.
//
// User-flagged 2026-06-14: during the 90-second team-selection phase
// of a Pokémon Champions match you only get a few seconds to decide
// which 4 of your 6 to bring. The decisive info is:
//   (a) Who's faster than what?         — Speed stats per pokémon
//   (b) Which type matchups hurt me?    — defensive type chart
//   (c) What's the opponent running?    — quick tap-from-grid picker
//                                         (typing names is too slow)
//
// This module renders a full-screen overlay opened from the Play
// button on every Side-Quest team card. Two columns: your team
// (left, EVs/nature pre-filled) and opponent (right, six empty
// slots until tapped via the sprite picker).
//
// Camera-based sprite recognition was discussed but deferred: a
// 1000-class CV model in-browser would need either TF.js + 150 MB
// or a curated pHash DB, neither solid against game-screen glare.
// The fast-filter sprite picker covers ~95 % of the use case.

(function () {
    'use strict';

    const DATA_URL = 'data/pokemon_battle_data.json';
    let _pokedex = null;
    let _pokedexLoading = null;

    // Lazy-load — 150 KB is meaningful on mobile data. Only paid when
    // the user actually opens the Play panel for the first time.
    function loadPokedex() {
        if (_pokedex) return Promise.resolve(_pokedex);
        if (_pokedexLoading) return _pokedexLoading;
        _pokedexLoading = fetch(`${DATA_URL}?t=${Date.now()}`)
            .then(r => r.ok ? r.json() : {})
            .then(json => { _pokedex = json || {}; return _pokedex; })
            .catch(() => { _pokedex = {}; return _pokedex; });
        return _pokedexLoading;
    }

    function uiLang() {
        return (typeof window.getLang === 'function' && window.getLang() === 'de') ? 'de' : 'en';
    }

    const LABELS = {
        de: {
            playBtn:        'Play',
            playAria:       'Live-Hilfe für Team',
            close:          'Schließen',
            yourTeam:       'Dein Team',
            opponentTeam:   'Gegnerisches Team',
            opponentHint:   'Tippe ein Sprite, um den Gegner zu erfassen — die Namen sind im Spiel ausgeblendet, deshalb hier per Bild auswählen.',
            speed:          'Speed',
            base:           'Basis',
            max:            'Max',
            actual:         'Aktuell',
            tailwind:       'Rückenwind',
            weaknesses:     'Schwach gegen',
            noWeak:         'Keine Schwächen.',
            tap:            'Tippen',
            empty:          'leer',
            searchPh:       '🔎 Pokémon suchen — z. B. „garcho"…',
            pickerClose:    'Auswahl schließen',
            clearOpp:       'Slot leeren',
            unknownSpecies: 'Spezies nicht in Stats-DB',
        },
        en: {
            playBtn:        'Play',
            playAria:       'Live helper for team',
            close:          'Close',
            yourTeam:       'Your team',
            opponentTeam:   'Opponent team',
            opponentHint:   'Tap a sprite to capture the opponent — names are hidden in-game, picking by image is the fastest path.',
            speed:          'Speed',
            base:           'Base',
            max:            'Max',
            actual:         'Actual',
            tailwind:       'Tailwind',
            weaknesses:     'Weak to',
            noWeak:         'No weaknesses.',
            tap:            'Tap',
            empty:          'empty',
            searchPh:       '🔎 Search pokémon — e.g. "garcho"…',
            pickerClose:    'Close picker',
            clearOpp:       'Clear slot',
            unknownSpecies: 'Species not in stats DB',
        },
    };

    function t() { return LABELS[uiLang()]; }

    // ── Type effectiveness (defensive) ──────────────────────────────
    // Map from attacking_type → defending_type → multiplier.
    // Standard Gen 6+ chart (Fairy added). The Play panel only
    // surfaces weaknesses (×2, ×4); resistances/immunities are a
    // separate code-path the user explicitly said they don't need
    // ("gegen was ich stark bin ist nur halb wichtig").
    const TYPE_CHART = {
        Normal:   { Rock: 0.5, Ghost: 0,   Steel: 0.5 },
        Fire:     { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 2, Bug: 2, Rock: 0.5, Dragon: 0.5, Steel: 2 },
        Water:    { Fire: 2, Water: 0.5, Grass: 0.5, Ground: 2, Rock: 2, Dragon: 0.5 },
        Electric: { Water: 2, Electric: 0.5, Grass: 0.5, Ground: 0, Flying: 2, Dragon: 0.5 },
        Grass:    { Fire: 0.5, Water: 2, Grass: 0.5, Poison: 0.5, Ground: 2, Flying: 0.5, Bug: 0.5, Rock: 2, Dragon: 0.5, Steel: 0.5 },
        Ice:      { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 0.5, Ground: 2, Flying: 2, Dragon: 2, Steel: 0.5 },
        Fighting: { Normal: 2, Ice: 2, Poison: 0.5, Flying: 0.5, Psychic: 0.5, Bug: 0.5, Rock: 2, Ghost: 0, Dark: 2, Steel: 2, Fairy: 0.5 },
        Poison:   { Grass: 2, Poison: 0.5, Ground: 0.5, Rock: 0.5, Ghost: 0.5, Steel: 0, Fairy: 2 },
        Ground:   { Fire: 2, Electric: 2, Grass: 0.5, Poison: 2, Flying: 0, Bug: 0.5, Rock: 2, Steel: 2 },
        Flying:   { Electric: 0.5, Grass: 2, Fighting: 2, Bug: 2, Rock: 0.5, Steel: 0.5 },
        Psychic:  { Fighting: 2, Poison: 2, Psychic: 0.5, Dark: 0, Steel: 0.5 },
        Bug:      { Fire: 0.5, Grass: 2, Fighting: 0.5, Poison: 0.5, Flying: 0.5, Psychic: 2, Ghost: 0.5, Dark: 2, Steel: 0.5, Fairy: 0.5 },
        Rock:     { Fire: 2, Ice: 2, Fighting: 0.5, Ground: 0.5, Flying: 2, Bug: 2, Steel: 0.5 },
        Ghost:    { Normal: 0, Psychic: 2, Ghost: 2, Dark: 2 },
        Dragon:   { Dragon: 2, Steel: 0.5, Fairy: 0 },
        Dark:     { Fighting: 0.5, Psychic: 2, Ghost: 2, Dark: 0.5, Fairy: 0.5 },
        Steel:    { Fire: 0.5, Water: 0.5, Electric: 0.5, Ice: 2, Rock: 2, Steel: 0.5, Fairy: 2 },
        Fairy:    { Fighting: 2, Poison: 0.5, Bug: 0.5, Dragon: 2, Dark: 2, Steel: 0.5 },
    };

    const ALL_TYPES = Object.keys(TYPE_CHART);

    // Given a defender's type list, return a list of attacker types
    // that hit it for super-effective damage, with multiplier.
    // Pure function — exposed for unit tests.
    function defensiveWeaknesses(defenderTypes) {
        if (!defenderTypes || defenderTypes.length === 0) return [];
        const results = [];
        for (const atk of ALL_TYPES) {
            let mult = 1;
            for (const def of defenderTypes) {
                const row = TYPE_CHART[atk];
                if (!row) continue;
                const v = row[def];
                if (v !== undefined) mult *= v;
            }
            if (mult > 1) results.push({ type: atk, mult });
        }
        // Order: 4× first (rare, deadly), then 2×, both alphabetical.
        results.sort((a, b) => (b.mult - a.mult) || a.type.localeCompare(b.type));
        return results;
    }

    // ── Speed-stat math (mainline Gen 9 formula at Level 50) ────────
    // Pokémon Champions uses a 32-EV-per-stat cap. Mapping that to
    // mainline's 252-EV cap (so the formula stays grounded in the
    // well-known L50 numbers like Garchomp = 169) means scaling
    // user-supplied EVs by 8 internally (32 × 8 = 256, capped at 252).
    // If a future Champions-specific Speed formula comes to light,
    // swap CHAMPIONS_EV_SCALE here.
    const LEVEL = 50;
    const MAX_IV = 31;
    const MAX_EV_MAINLINE = 252;
    const CHAMPIONS_EV_SCALE = 8;

    function speedStat(base, mainlineEV, natureMod) {
        const ev = Math.min(MAX_EV_MAINLINE, Math.max(0, mainlineEV));
        const inner = Math.floor(((2 * base + MAX_IV + Math.floor(ev / 4)) * LEVEL) / 100 + 5);
        return Math.floor(inner * natureMod);
    }

    function baseSpeedAt50(base) { return speedStat(base, 0, 1.0); }
    function maxSpeedAt50(base)  { return speedStat(base, MAX_EV_MAINLINE, 1.1); }
    function actualSpeedAt50(base, championsEV, natureMod) {
        return speedStat(base, championsEV * CHAMPIONS_EV_SCALE, natureMod);
    }

    // +Speed: Hasty, Jolly, Naive, Timid → 1.1
    // -Speed: Brave, Quiet, Relaxed, Sassy → 0.9
    // Neutral: everything else → 1.0
    const NATURE_SPEED = {
        Hasty: 1.1, Jolly: 1.1, Naive: 1.1, Timid: 1.1,
        Brave: 0.9, Quiet: 0.9, Relaxed: 0.9, Sassy: 0.9,
    };
    function natureSpeedMod(name) {
        return NATURE_SPEED[String(name || '').trim()] || 1.0;
    }

    // Parse "8 HP / 1 Def / 25 SpA / 32 Spe" → { hp:8, def:1, spa:25, spe:32 }.
    // Unknown / blank fields default to 0.
    function parseEVs(str) {
        const out = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
        if (!str) return out;
        const key = { HP:'hp', Atk:'atk', Def:'def', SpA:'spa', SpD:'spd', Spe:'spe' };
        String(str).split('/').forEach(seg => {
            const m = String(seg).trim().match(/^(\d+)\s+(HP|Atk|Def|SpA|SpD|Spe)$/i);
            if (!m) return;
            const k = key[m[2].replace(/^./, c => c.toUpperCase()).replace(/^Sp([adAD])$/, (_, x) => 'Sp' + x.toUpperCase())]
                   || key[m[2]];
            if (k) out[k] = parseInt(m[1], 10);
        });
        return out;
    }

    // Showdown-format name lookup, with a few well-known aliases
    // because pokepaste names don't always match Pokedex.ts exactly.
    // Returns the {types, baseStats} entry or null.
    function lookupSpecies(name) {
        if (!_pokedex || !name) return null;
        if (_pokedex[name]) return _pokedex[name];
        // Common adjustments: "Charizard-Mega-Y" vs "Charizard-Mega Y", etc.
        const variants = [
            name.replace(/-Mega-Y$/, '-Mega-Y'),
            name.replace(/-/g, ''),
            name.replace(/-/g, ' '),
            name.split('-')[0],
        ];
        for (const v of variants) {
            if (_pokedex[v]) return _pokedex[v];
        }
        return null;
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function pokemonIconHtml(name, size) {
        const slug = String(name || '').toLowerCase();
        if (window.ArchetypeIcons && typeof window.ArchetypeIcons.slugIconHtml === 'function') {
            return window.ArchetypeIcons.slugIconHtml(slug, { size: size || 'md', alt: name });
        }
        const url = 'https://r2.limitlesstcg.net/pokemon/gen9/' + slug + '.png';
        return `<img class="tcg-pokemon-icon tcg-pokemon-icon--${size || 'md'}" src="${url}" alt="${escapeHtml(name)}" loading="lazy" onerror="this.style.display='none'">`;
    }

    // ── Render: one of your-team rows ──────────────────────────────
    function renderYourMon(p) {
        const labels = t();
        const species = lookupSpecies(p.name);
        const types = species ? species.types : [];
        const baseSpe = species ? species.baseStats.spe : null;
        const evs = parseEVs(p.evs);
        const natMod = natureSpeedMod(p.nature);

        let speedHtml = '';
        if (baseSpe != null) {
            const base   = baseSpeedAt50(baseSpe);
            const max    = maxSpeedAt50(baseSpe);
            const actual = actualSpeedAt50(baseSpe, evs.spe, natMod);
            const tail   = actual * 2;
            speedHtml = `
                <div class="sq-play-speed">
                    <span class="sq-play-speed-actual" title="${escapeHtml(labels.actual)} @ L50, ${p.nature || 'Hardy'}, ${evs.spe} EVs">${actual}</span>
                    <span class="sq-play-speed-tail" title="${escapeHtml(labels.tailwind)}">(${tail})</span>
                    <span class="sq-play-speed-range" title="${escapeHtml(labels.base)} ${base} · ${escapeHtml(labels.max)} ${max}">${base}–${max}</span>
                </div>`;
        } else {
            speedHtml = `<div class="sq-play-speed sq-play-speed-missing" title="${escapeHtml(labels.unknownSpecies)}">?</div>`;
        }

        const weakHtml = renderWeaknessChips(types);

        return `
            <article class="sq-play-mon">
                <header class="sq-play-mon-head">
                    ${pokemonIconHtml(p.name, 'md')}
                    <div class="sq-play-mon-titleblock">
                        <span class="sq-play-mon-name">${escapeHtml(p.name)}</span>
                        ${renderTypeBadges(types)}
                    </div>
                </header>
                <div class="sq-play-mon-row">
                    <span class="sq-play-row-label">${escapeHtml(labels.speed)}</span>
                    ${speedHtml}
                </div>
                <div class="sq-play-mon-row sq-play-mon-row-weak">
                    <span class="sq-play-row-label">${escapeHtml(labels.weaknesses)}</span>
                    ${weakHtml}
                </div>
            </article>`;
    }

    function renderTypeBadges(types) {
        if (!types || !types.length) return '';
        return `<span class="sq-play-types">` +
            types.map(ty => `<span class="sq-play-type sq-play-type-${ty.toLowerCase()}">${escapeHtml(ty)}</span>`).join('') +
            `</span>`;
    }

    function renderWeaknessChips(types) {
        const labels = t();
        if (!types || types.length === 0) return `<span class="sq-play-noweak">—</span>`;
        const weaknesses = defensiveWeaknesses(types);
        if (weaknesses.length === 0) {
            return `<span class="sq-play-noweak">${escapeHtml(labels.noWeak)}</span>`;
        }
        return `<span class="sq-play-weaks">` +
            weaknesses.map(w =>
                `<span class="sq-play-weak sq-play-type-${w.type.toLowerCase()}${w.mult >= 4 ? ' sq-play-weak-4x' : ''}">${escapeHtml(w.type)}<small>×${w.mult}</small></span>`
            ).join('') + `</span>`;
    }

    // ── Render: opponent slot (empty placeholder until tapped) ──────
    function renderOpponentSlot(idx, mon) {
        const labels = t();
        if (!mon) {
            return `
                <button class="sq-play-opp-slot sq-play-opp-empty"
                        data-opp-idx="${idx}" type="button"
                        aria-label="${escapeHtml(labels.tap)} — slot ${idx + 1}">
                    <span class="sq-play-opp-empty-icon">＋</span>
                    <span class="sq-play-opp-empty-label">${escapeHtml(labels.empty)}</span>
                </button>`;
        }
        const species = lookupSpecies(mon.name);
        const types = species ? species.types : [];
        const baseSpe = species ? species.baseStats.spe : null;
        const speedRange = baseSpe != null
            ? `${baseSpeedAt50(baseSpe)}–${maxSpeedAt50(baseSpe)}`
            : '?';
        return `
            <article class="sq-play-opp-slot sq-play-opp-filled" data-opp-idx="${idx}">
                <button class="sq-play-opp-clear" type="button"
                        data-opp-clear="${idx}"
                        aria-label="${escapeHtml(labels.clearOpp)}">×</button>
                ${pokemonIconHtml(mon.name, 'md')}
                <span class="sq-play-opp-name">${escapeHtml(mon.name)}</span>
                ${renderTypeBadges(types)}
                <span class="sq-play-opp-speed" title="${escapeHtml(t().speed)} ${escapeHtml(t().base)}–${escapeHtml(t().max)}">${speedRange}</span>
            </article>`;
    }

    // ── Sprite picker (sub-modal triggered from empty opponent slot) ──
    // Full pokedex grid with a fast filter. autofocus the input so
    // the first keystroke immediately narrows the list.
    function openSpritePicker(onPick) {
        closeSpritePicker();
        const labels = t();
        const overlay = document.createElement('div');
        overlay.id = 'sq-play-picker';
        overlay.className = 'sq-play-picker-overlay';
        const all = Object.keys(_pokedex || {}).sort();
        overlay.innerHTML = `
            <div class="sq-play-picker-panel" role="dialog" aria-modal="true">
                <header class="sq-play-picker-head">
                    <input type="search" class="sq-play-picker-search"
                           placeholder="${escapeHtml(labels.searchPh)}"
                           autocomplete="off" inputmode="search" autofocus>
                    <button type="button" class="sq-play-picker-close"
                            aria-label="${escapeHtml(labels.pickerClose)}">×</button>
                </header>
                <div class="sq-play-picker-grid" id="sq-play-picker-grid">
                    ${all.slice(0, 200).map(n => spriteCellHtml(n)).join('')}
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const grid = overlay.querySelector('#sq-play-picker-grid');
        const input = overlay.querySelector('.sq-play-picker-search');

        const updateGrid = (filter) => {
            const f = String(filter || '').toLowerCase().trim();
            const matches = f
                ? all.filter(n => n.toLowerCase().includes(f)).slice(0, 200)
                : all.slice(0, 200);
            grid.innerHTML = matches.map(n => spriteCellHtml(n)).join('');
        };
        input.addEventListener('input', () => updateGrid(input.value));

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeSpritePicker();
            const cell = e.target.closest('.sq-play-picker-cell');
            if (cell) {
                const name = cell.getAttribute('data-name');
                if (name) onPick({ name });
                closeSpritePicker();
            }
        });
        overlay.querySelector('.sq-play-picker-close')
            .addEventListener('click', closeSpritePicker);
        _pickerKeyHandler = (e) => { if (e.key === 'Escape') closeSpritePicker(); };
        document.addEventListener('keydown', _pickerKeyHandler);

        // Autofocus loses on iOS when an overlay opens; nudge it.
        setTimeout(() => input.focus(), 30);
    }

    let _pickerKeyHandler = null;

    function closeSpritePicker() {
        const el = document.getElementById('sq-play-picker');
        if (el) el.remove();
        if (_pickerKeyHandler) {
            document.removeEventListener('keydown', _pickerKeyHandler);
            _pickerKeyHandler = null;
        }
    }

    function spriteCellHtml(name) {
        return `<button type="button" class="sq-play-picker-cell"
                        data-name="${escapeHtml(name)}"
                        title="${escapeHtml(name)}">
                    ${pokemonIconHtml(name, 'sm')}
                    <span class="sq-play-picker-cell-name">${escapeHtml(name)}</span>
                </button>`;
    }

    // ── Play modal (top-level) ───────────────────────────────────────
    let _playOverlay = null;
    let _opponent = [null, null, null, null, null, null];
    let _playKeyHandler = null;
    let _playTeam = null;

    async function openPlayModal(team) {
        closePlayModal();
        _playTeam = team;
        _opponent = [null, null, null, null, null, null];
        await loadPokedex();

        const labels = t();
        const overlay = document.createElement('div');
        overlay.id = 'sq-play-overlay';
        overlay.className = 'sq-play-overlay';
        overlay.innerHTML = `
            <div class="sq-play-panel" role="dialog" aria-modal="true"
                 aria-label="${escapeHtml(labels.playAria)}">
                <header class="sq-play-head">
                    <h3 class="sq-play-title">${escapeHtml(team.team_name || labels.playAria)}</h3>
                    <button type="button" class="sq-play-close"
                            aria-label="${escapeHtml(labels.close)}">×</button>
                </header>
                <div class="sq-play-body">
                    <section class="sq-play-col sq-play-col-yours">
                        <h4 class="sq-play-col-title">${escapeHtml(labels.yourTeam)}</h4>
                        <div class="sq-play-mons">
                            ${(team.pokemon || []).map(renderYourMon).join('')}
                        </div>
                    </section>
                    <section class="sq-play-col sq-play-col-opp">
                        <h4 class="sq-play-col-title">${escapeHtml(labels.opponentTeam)}</h4>
                        <p class="sq-play-col-hint">${escapeHtml(labels.opponentHint)}</p>
                        <div class="sq-play-opps" id="sq-play-opps">
                            ${_opponent.map((m, i) => renderOpponentSlot(i, m)).join('')}
                        </div>
                    </section>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        _playOverlay = overlay;

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closePlayModal();
            const empty = e.target.closest('.sq-play-opp-empty');
            if (empty) {
                const idx = parseInt(empty.getAttribute('data-opp-idx'), 10);
                if (Number.isInteger(idx)) {
                    openSpritePicker((mon) => {
                        _opponent[idx] = mon;
                        rerenderOpponents();
                    });
                }
                return;
            }
            const clear = e.target.closest('[data-opp-clear]');
            if (clear) {
                const idx = parseInt(clear.getAttribute('data-opp-clear'), 10);
                if (Number.isInteger(idx)) {
                    _opponent[idx] = null;
                    rerenderOpponents();
                }
            }
        });
        overlay.querySelector('.sq-play-close')
            .addEventListener('click', closePlayModal);

        _playKeyHandler = (e) => { if (e.key === 'Escape') closePlayModal(); };
        document.addEventListener('keydown', _playKeyHandler);
        overlay.querySelector('.sq-play-close').focus();
    }

    function rerenderOpponents() {
        if (!_playOverlay) return;
        const host = _playOverlay.querySelector('#sq-play-opps');
        if (host) host.innerHTML = _opponent.map((m, i) => renderOpponentSlot(i, m)).join('');
    }

    function closePlayModal() {
        if (_playOverlay) { _playOverlay.remove(); _playOverlay = null; }
        if (_playKeyHandler) {
            document.removeEventListener('keydown', _playKeyHandler);
            _playKeyHandler = null;
        }
        closeSpritePicker();
    }

    // Public surface for sideQuest.js + unit tests
    window.sideQuestPlay = {
        openPlayModal,
        closePlayModal,
        // Pure helpers exposed for tests / future reuse
        defensiveWeaknesses,
        speedStat,
        baseSpeedAt50,
        maxSpeedAt50,
        actualSpeedAt50,
        natureSpeedMod,
        parseEVs,
        labels: () => t(),
    };
})();
