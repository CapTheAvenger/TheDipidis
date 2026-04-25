(function() {
    const BATTLE_JOURNAL_OUTBOX_KEY = 'battleJournalOutboxV1';
    const BATTLE_JOURNAL_DRAFT_KEY = 'battleJournalDraftV1';
    const BATTLE_JOURNAL_THEME_KEY = 'battleJournalThemeV1';
    const BATTLE_JOURNAL_MAX_PREVIEW = 5;

    let battleJournalSyncPromise = null;
    let battleJournalLastStatus = 'ready';
    let battleJournalTheme = localStorage.getItem(BATTLE_JOURNAL_THEME_KEY) || 'dark';

    function battleJournalText(key, fallback) {
        if (typeof t === 'function') {
            const translated = t(key);
            if (translated && translated !== key) return translated;
        }
        return fallback;
    }

    function battleJournalSafeJsonParse(raw, fallback) {
        try {
            return JSON.parse(raw);
        } catch (_) {
            return fallback;
        }
    }

    function getBattleJournalOutbox() {
        const raw = localStorage.getItem(BATTLE_JOURNAL_OUTBOX_KEY);
        const parsed = battleJournalSafeJsonParse(raw, []);
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    }

    function saveBattleJournalOutbox(entries) {
        if (!Array.isArray(entries) || entries.length === 0) {
            localStorage.removeItem(BATTLE_JOURNAL_OUTBOX_KEY);
            return;
        }
        localStorage.setItem(BATTLE_JOURNAL_OUTBOX_KEY, JSON.stringify(entries));
    }

    function getBattleJournalDraft() {
        const raw = localStorage.getItem(BATTLE_JOURNAL_DRAFT_KEY);
        const parsed = battleJournalSafeJsonParse(raw, null);
        return parsed && typeof parsed === 'object' ? parsed : {};
    }

    function saveBattleJournalDraft(draft) {
        const safeDraft = {
            tournamentName: String(draft?.tournamentName || '').trim(),
            ownDeck: String(draft?.ownDeck || '').trim(),
            opponentArchetype: String(draft?.opponentArchetype || '').trim(),
            bestOf: String(draft?.bestOf || '').trim(),
            turnOrder: String(draft?.turnOrder || '').trim(),
            result: String(draft?.result || '').trim(),
            games: Array.isArray(draft?.games)
                ? draft.games.slice(0, 3).map(game => ({
                    turnOrder: String(game?.turnOrder || '').trim(),
                    result: String(game?.result || '').trim(),
                    brick: !!game?.brick,
                    notes: String(game?.notes || '').slice(0, 200)
                }))
                : (Array.isArray(draft?.bo3Games)
                    ? draft.bo3Games.slice(0, 3).map(game => ({
                        turnOrder: String(game?.turnOrder || '').trim(),
                        result: String(game?.result || '').trim(),
                        brick: !!game?.brick,
                        notes: String(game?.notes || '').slice(0, 200)
                    }))
                    : [])
        };

        const hasGameDetails = safeDraft.games.some(game => game.turnOrder || game.result);
        if (!safeDraft.tournamentName && !safeDraft.ownDeck && !safeDraft.opponentArchetype && !safeDraft.bestOf && !safeDraft.turnOrder && !safeDraft.result && !hasGameDetails) {
            localStorage.removeItem(BATTLE_JOURNAL_DRAFT_KEY);
            return;
        }
        localStorage.setItem(BATTLE_JOURNAL_DRAFT_KEY, JSON.stringify(safeDraft));
    }

    function battleJournalElements() {
        return {
            overlay: document.getElementById('battleJournalOverlay'),
            sheet: document.getElementById('battleJournalSheet'),
            form: document.getElementById('battleJournalForm'),
            tournamentName: document.getElementById('battleJournalTournamentName'),
            ownDeckValue: document.getElementById('battleJournalOwnDeckValue'),
            ownDeckList: document.getElementById('battleJournalOwnDeckList'),
            opponentValue: document.getElementById('battleJournalOpponentValue'),
            opponentList: document.getElementById('battleJournalOpponentList'),
            bestOfInput: document.getElementById('battleJournalBestOf'),
            turnOrderInput: document.getElementById('battleJournalTurnOrder'),
            resultInput: document.getElementById('battleJournalResult'),
            gameDetails: document.getElementById('battleJournalGameDetails'),
            lastTournamentRow: document.getElementById('battleJournalLastTournamentRow'),
            lastTournamentLabel: document.getElementById('battleJournalLastTournamentLabel'),
            statusBadge: document.getElementById('battleJournalStatusBadge'),
            pendingCount: document.getElementById('battleJournalPendingCount'),
            pendingList: document.getElementById('battleJournalPendingList'),
            fabBadge: document.getElementById('battleJournalFabBadge'),
            profilePending: document.getElementById('battleJournalProfilePending'),
            profileState: document.getElementById('battleJournalProfileState'),
            saveFx: document.getElementById('battleJournalSaveFx'),
            themeToggle: document.getElementById('battleJournalThemeToggle'),
            metaInput: document.getElementById('battleJournalMeta'),
            typeInput: document.getElementById('battleJournalType'),
            brickInput: document.getElementById('battleJournalBrick'),
            notesInput: document.getElementById('battleJournalNotes')
        };
    }

    function getBattleJournalActiveTab() {
        return document.querySelector('.tab-content.active')?.id || null;
    }

    function getBattleJournalCurrentOwnDeck() {
        const activeTab = getBattleJournalActiveTab();
        if (activeTab === 'city-league' || activeTab === 'city-league-analysis') return String(window.currentCityLeagueArchetype || '').trim();
        if (activeTab === 'current-meta' || activeTab === 'current-analysis') return String(window.currentMetaArchetype || '').trim();
        if (activeTab === 'past-meta') return String(window.pastMetaCurrentArchetype || '').trim();
        return String(window.currentMetaArchetype || window.currentCityLeagueArchetype || window.pastMetaCurrentArchetype || '').trim();
    }

    function getValuesFromSelect(selectId) {
        const select = document.getElementById(selectId);
        if (!select) return [];
        return Array.from(select.querySelectorAll('option'))
            .map(option => String(option.value || '').trim())
            .filter(v => v && !v.startsWith('GROUP:'));
    }

    function getBattleJournalSavedDeckNames() {
        return Array.isArray(window.userDecks)
            ? window.userDecks.map(deck => String(deck?.name || '').trim()).filter(Boolean)
            : [];
    }

    function uniqueSorted(values) {
        return Array.from(new Set(values.filter(v => v && !v.startsWith('GROUP:')))).sort((left, right) => left.localeCompare(right));
    }

    function getTopOpponentChoices() {
        const select = document.getElementById('currentMetaDeckSelect');
        if (!select) return uniqueSorted(getValuesFromSelect('currentMetaDeckSelect')).slice(0, 8);

        const parsed = Array.from(select.querySelectorAll('option'))
            .map(option => {
                const value = String(option.value || '').trim();
                const label = String(option.textContent || '').trim();
                const countMatch = label.match(/\((\d+)\s*Decks?/i);
                return { value, count: countMatch ? parseInt(countMatch[1], 10) : 0 };
            })
            .filter(item => !!item.value && !item.value.startsWith('GROUP:'))
            .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

        return parsed.slice(0, 8).map(item => item.value);
    }

    function getExtendedOpponentChoices() {
        // Pulled from international Current Meta + Past Meta dropdowns.
        // City League is intentionally excluded — those archetype names
        // are German/regional and the user plays the international scene,
        // so the names from there don't match what they need to log.
        return uniqueSorted([
            ...getValuesFromSelect('currentMetaDeckSelect'),
            ...getValuesFromSelect('pastMetaDeckSelect')
        ]);
    }

    // Cached choice lists for the custom autocomplete dropdowns. The
    // native <datalist> popup is broken/inline on Android (Samsung
    // Internet, some Chromium variants) and was rendering suggestions
    // as plain text on top of the form labels. We render our own
    // floating popover instead — see bjShowAutocomplete below.
    let _bjOwnDeckChoices  = [];
    let _bjOpponentChoices = [];

    function renderDeckChoices() {
        const els = battleJournalElements();
        const draft = getBattleJournalDraft();
        // Same rationale as getExtendedOpponentChoices: international
        // Current Meta + Past Meta names only, plus the user's own
        // saved decks. City League is dropped to avoid German/local
        // names polluting the suggestion list.
        const allOwnDeckChoices = uniqueSorted([
            getBattleJournalCurrentOwnDeck(),
            ...getBattleJournalSavedDeckNames(),
            ...getValuesFromSelect('currentMetaDeckSelect'),
            ...getValuesFromSelect('pastMetaDeckSelect')
        ]);
        _bjOwnDeckChoices = allOwnDeckChoices;

        if (els.ownDeckList) {
            els.ownDeckList.innerHTML = allOwnDeckChoices
                .map(name => `<option value="${escapeHtml(name)}"></option>`)
                .join('');
        }

        const allOpponentChoices = uniqueSorted([
            ...getTopOpponentChoices(),
            ...getExtendedOpponentChoices()
        ]);
        _bjOpponentChoices = allOpponentChoices;

        if (els.opponentList) {
            els.opponentList.innerHTML = allOpponentChoices
                .map(name => `<option value="${escapeHtml(name)}"></option>`)
                .join('');
        }

        // Only restore draft values — never auto-fill so users can type freely
        if (els.ownDeckValue && !els.ownDeckValue.value && draft.ownDeck) {
            els.ownDeckValue.value = draft.ownDeck;
        }
        if (els.opponentValue && !els.opponentValue.value && draft.opponentArchetype) {
            els.opponentValue.value = draft.opponentArchetype;
        }
    }

    // Custom autocomplete (replaces native datalist for Android compat).
    // Returns the input + dropdown elements + the choice array for the
    // requested field.
    function _bjAutocompleteEls(field) {
        const isOwn = field === 'ownDeck';
        return {
            input: document.getElementById(isOwn ? 'battleJournalOwnDeckValue' : 'battleJournalOpponentValue'),
            dropdown: document.getElementById(isOwn ? 'battleJournalOwnDeckAutocomplete' : 'battleJournalOpponentAutocomplete'),
            choices: isOwn ? _bjOwnDeckChoices : _bjOpponentChoices
        };
    }

    function bjShowAutocomplete(field) {
        const { input, dropdown, choices } = _bjAutocompleteEls(field);
        if (!input || !dropdown) return;
        if (!Array.isArray(choices) || choices.length === 0) {
            dropdown.classList.add('d-none');
            return;
        }
        const term = String(input.value || '').trim().toLowerCase();
        let matches = choices;
        if (term) {
            matches = choices.filter(name => name && name.toLowerCase().includes(term));
        }
        matches = matches.slice(0, 12);
        if (matches.length === 0) {
            dropdown.classList.add('d-none');
            return;
        }
        dropdown.innerHTML = matches.map(name =>
            `<div class="bj-autocomplete-item" role="option"
                  onmousedown="event.preventDefault(); bjSelectAutocomplete('${field}', '${escapeJsSingleQuoted(name)}')"
                  ontouchstart="event.preventDefault(); bjSelectAutocomplete('${field}', '${escapeJsSingleQuoted(name)}')"
            >${escapeHtml(name)}</div>`
        ).join('');
        dropdown.classList.remove('d-none');
    }

    function bjHideAutocomplete(field) {
        const { dropdown } = _bjAutocompleteEls(field);
        if (dropdown) dropdown.classList.add('d-none');
    }

    function bjSelectAutocomplete(field, name) {
        const { input } = _bjAutocompleteEls(field);
        if (input) {
            input.value = name;
            // Fire input event so the draft persistence + any other
            // listeners pick up the value just like a typed entry.
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.blur();
        }
        bjHideAutocomplete(field);
    }

    // ── Last tournament quick-select ─────────────────────────

    function getLastTournament() {
        // Check outbox (pending local entries) first, then synced history cache
        const outbox = getBattleJournalOutbox();
        for (let i = outbox.length - 1; i >= 0; i--) {
            if (outbox[i]?.tournamentName) {
                return { tournamentName: outbox[i].tournamentName, ownDeck: outbox[i].ownDeck || '', meta: outbox[i].meta || '', tournamentType: outbox[i].tournamentType || '' };
            }
        }
        // Also check Firestore-synced entries (journalHistoryCache is sorted newest first)
        if (Array.isArray(journalHistoryCache)) {
            for (const entry of journalHistoryCache) {
                if (entry?.tournamentName) {
                    return { tournamentName: entry.tournamentName, ownDeck: entry.ownDeck || '', meta: entry.meta || '', tournamentType: entry.tournamentType || '' };
                }
            }
        }
        return null;
    }

    function renderLastTournamentButton() {
        const els = battleJournalElements();
        if (!els.lastTournamentRow || !els.lastTournamentLabel) return;
        const last = getLastTournament();
        if (!last) {
            els.lastTournamentRow.classList.add('d-none');
            return;
        }
        const deckSuffix = last.ownDeck ? ` (${last.ownDeck})` : '';
        els.lastTournamentLabel.textContent = last.tournamentName + deckSuffix;
        els.lastTournamentRow.dataset.lastMeta = last.meta;
        els.lastTournamentRow.dataset.lastType = last.tournamentType;
        els.lastTournamentRow.classList.remove('d-none');
    }

    function applyLastTournament() {
        const els = battleJournalElements();
        const last = getLastTournament();
        if (!last) return;
        if (els.tournamentName) els.tournamentName.value = last.tournamentName;
        if (els.ownDeckValue) els.ownDeckValue.value = last.ownDeck;
        // Also restore meta and type
        const row = document.getElementById('battleJournalLastTournamentRow');
        const lastMeta = row?.dataset.lastMeta || '';
        const lastType = row?.dataset.lastType || '';
        if (lastMeta) {
            const metaSel = document.getElementById('battleJournalMeta');
            if (metaSel) metaSel.value = lastMeta;
        }
        if (lastType) selectJournalType(lastType);
    }

    function continueJournalTournament(name, meta, type) {
        openBattleJournalSheet();
        // Pre-fill tournament fields after sheet opens
        const nameEl = document.getElementById('battleJournalTournamentName');
        if (nameEl) nameEl.value = name || '';
        const metaSel = document.getElementById('battleJournalMeta');
        if (metaSel && meta) metaSel.value = meta;
        if (type) selectJournalType(type);
    }

    // ── Dynamic game rows ────────────────────────────────────

    function getGameCount() {
        const els = battleJournalElements();
        const bestOf = String(els.bestOfInput?.value || '').trim();
        if (bestOf === 'bo3') return 3;
        if (bestOf === 'bo1') return 1;
        return 0;
    }

    function renderGameRows() {
        const els = battleJournalElements();
        if (!els.gameDetails) return;
        const count = getGameCount();

        if (count === 0) {
            els.gameDetails.classList.add('d-none');
            els.gameDetails.innerHTML = '<span class="battle-journal-label" data-i18n="bj.gameDetails">Game Details</span>';
            return;
        }

        els.gameDetails.classList.remove('d-none');

        const firstLabel = battleJournalText('bj.first', 'First');
        const secondLabel = battleJournalText('bj.second', 'Second');
        const winLabel = battleJournalText('bj.win', 'Win');
        const lossLabel = battleJournalText('bj.loss', 'Loss');
        const tieLabel = battleJournalText('bj.tie', 'Tie');
        const goingLabel = battleJournalText('bj.turnOrder', 'Going');
        const resultLabel = battleJournalText('bj.result', 'Result');
        const headerLabel = battleJournalText('bj.gameDetails', 'Game Details');
        const brickTitle = battleJournalText('bj.brickToggleTitle', 'Brick (Pech-Spiel)');
        const notesPlaceholder = battleJournalText('bj.gameNotesPlaceholder', 'Notiz zu diesem Game...');

        // BO3 (count > 1): brick + notes belong on individual games. BO1 has
        // a single game so the match-level brick/notes inputs already cover
        // that case — adding them per-game would just duplicate.
        const showPerGameExtras = count > 1;

        let html = `<span class="battle-journal-label">${escapeHtml(headerLabel)}</span>`;
        for (let i = 1; i <= count; i++) {
            const extrasHtml = showPerGameExtras ? `
                    <div class="battle-journal-game-extras">
                        <input type="hidden" id="battleJournalGame${i}Brick" value="">
                        <button type="button" class="bj-game-brick-btn" id="battleJournalGame${i}BrickBtn" data-game="${i}" onclick="setGameChoice(${i},'brick','1')" title="${escapeHtml(brickTitle)}" aria-label="${escapeHtml(brickTitle)}">🧱</button>
                        <input type="text" id="battleJournalGame${i}Notes" class="bj-game-notes-input" maxlength="200" placeholder="${escapeHtml(notesPlaceholder)}" oninput="onGameNotesInput(${i})">
                    </div>` : '';
            html += `
                <div class="battle-journal-game-row">
                    <span class="battle-journal-bo3-game">Game ${i}</span>
                    <input type="hidden" id="battleJournalGame${i}Turn" value="">
                    <input type="hidden" id="battleJournalGame${i}Result" value="">
                    <div class="battle-journal-game-btns">
                        <div class="battle-journal-choice-group">
                            <button type="button" class="battle-journal-choice" data-field="game${i}Turn" data-value="first" onclick="setGameChoice(${i},'turn','first')">${escapeHtml(firstLabel)}</button>
                            <button type="button" class="battle-journal-choice" data-field="game${i}Turn" data-value="second" onclick="setGameChoice(${i},'turn','second')">${escapeHtml(secondLabel)}</button>
                        </div>
                        <div class="battle-journal-choice-group battle-journal-choice-group-result">
                            <button type="button" class="battle-journal-choice battle-journal-choice-win" data-field="game${i}Result" data-value="win" onclick="setGameChoice(${i},'result','win')">W</button>
                            <button type="button" class="battle-journal-choice battle-journal-choice-loss" data-field="game${i}Result" data-value="loss" onclick="setGameChoice(${i},'result','loss')">L</button>
                            <button type="button" class="battle-journal-choice battle-journal-choice-tie" data-field="game${i}Result" data-value="tie" onclick="setGameChoice(${i},'result','tie')">T</button>
                        </div>
                    </div>${extrasHtml}
                </div>`;
        }
        els.gameDetails.innerHTML = html;
    }

    function getGameDetails() {
        const count = getGameCount();
        const games = [];
        for (let i = 1; i <= count; i++) {
            const turnEl = document.getElementById(`battleJournalGame${i}Turn`);
            const resultEl = document.getElementById(`battleJournalGame${i}Result`);
            const brickEl = document.getElementById(`battleJournalGame${i}Brick`);
            const notesEl = document.getElementById(`battleJournalGame${i}Notes`);
            const game = {
                turnOrder: String(turnEl?.value || '').trim(),
                result: String(resultEl?.value || '').trim()
            };
            // Per-game brick/notes only exist for BO3 (count > 1). Omit the
            // fields entirely for BO1 so the saved object stays as before.
            if (brickEl) game.brick = brickEl.value === '1';
            if (notesEl) game.notes = String(notesEl.value || '').trim();
            games.push(game);
        }
        return games;
    }

    function applyGameDetails(details) {
        const count = getGameCount();
        const games = Array.isArray(details) ? details : [];
        for (let i = 1; i <= count; i++) {
            const g = games[i - 1] || {};
            const turnVal = String(g.turnOrder || '').trim();
            const resultVal = String(g.result || '').trim();
            const turnEl = document.getElementById(`battleJournalGame${i}Turn`);
            const resultEl = document.getElementById(`battleJournalGame${i}Result`);
            if (turnEl) turnEl.value = turnVal;
            if (resultEl) resultEl.value = resultVal;
            // Highlight the correct buttons
            document.querySelectorAll(`[data-field="game${i}Turn"]`).forEach(btn => {
                btn.classList.toggle('is-selected', btn.dataset.value === turnVal);
            });
            document.querySelectorAll(`[data-field="game${i}Result"]`).forEach(btn => {
                btn.classList.toggle('is-selected', btn.dataset.value === resultVal);
            });
            // Per-game brick + notes — only present in DOM for BO3.
            const brickEl = document.getElementById(`battleJournalGame${i}Brick`);
            const brickBtn = document.getElementById(`battleJournalGame${i}BrickBtn`);
            const notesEl = document.getElementById(`battleJournalGame${i}Notes`);
            if (brickEl) {
                const isBrick = !!g.brick;
                brickEl.value = isBrick ? '1' : '';
                if (brickBtn) brickBtn.classList.toggle('is-active', isBrick);
            }
            if (notesEl) notesEl.value = String(g.notes || '');
        }
    }

    function deriveOverallResult(games) {
        if (!games || games.length === 0) return { turnOrder: '', result: '' };
        // Only consider games that have a result filled in
        const filled = games.filter(g => g.result);
        if (filled.length === 0) return { turnOrder: games[0]?.turnOrder || '', result: '' };
        if (filled.length === 1) return { turnOrder: games[0]?.turnOrder || '', result: filled[0].result };
        // BO3: 2 wins/losses = decisive, otherwise derive from what's filled
        let wins = 0, losses = 0;
        filled.forEach(g => {
            if (g.result === 'win') wins++;
            else if (g.result === 'loss') losses++;
        });
        let result = 'tie';
        if (wins >= 2) result = 'win';
        else if (losses >= 2) result = 'loss';
        else if (filled.length === 2 && wins === 1 && losses === 1) result = 'tie';
        else if (wins > losses) result = 'win';
        else if (losses > wins) result = 'loss';
        return { turnOrder: games[0]?.turnOrder || '', result };
    }

    // ── Status & summary ─────────────────────────────────────

    function setBattleJournalStatus(status) {
        battleJournalLastStatus = status;
        renderBattleJournalSummary();
    }

    function getBattleJournalStatusLabel(status) {
        const labels = {
            ready: battleJournalText('bj.statusReady', 'Ready'),
            offline: battleJournalText('bj.statusOffline', 'Offline'),
            syncing: battleJournalText('bj.statusSyncing', 'Syncing...'),
            synced: battleJournalText('bj.statusSynced', 'Synced'),
            waitingLogin: battleJournalText('bj.statusWaitingLogin', 'Waiting for Sign-In'),
            error: battleJournalText('bj.statusError', 'Sync Error')
        };
        return labels[status] || labels.ready;
    }

    function renderBattleJournalSummary() {
        const els = battleJournalElements();
        const pendingEntries = getBattleJournalOutbox();
        const pendingCount = pendingEntries.length;
        const online = navigator.onLine;
        const hasUser = !!(window.auth && window.auth.currentUser);
        const effectiveStatus = !online ? 'offline' : (!hasUser && pendingCount > 0 ? 'waitingLogin' : battleJournalLastStatus);

        if (els.statusBadge) {
            els.statusBadge.textContent = getBattleJournalStatusLabel(effectiveStatus);
            els.statusBadge.classList.remove('is-offline', 'is-syncing', 'is-success');
            if (effectiveStatus === 'offline' || effectiveStatus === 'waitingLogin' || effectiveStatus === 'error') {
                els.statusBadge.classList.add('is-offline');
            } else if (effectiveStatus === 'syncing') {
                els.statusBadge.classList.add('is-syncing');
            } else if (effectiveStatus === 'synced') {
                els.statusBadge.classList.add('is-success');
            }
        }

        const pendingLabel = battleJournalText('bj.pendingCount', '{count} pending').replace('{count}', String(pendingCount));
        if (els.pendingCount) els.pendingCount.textContent = pendingLabel;
        if (els.profilePending) els.profilePending.textContent = String(pendingCount);
        if (els.profileState) els.profileState.textContent = getBattleJournalStatusLabel(effectiveStatus);

        if (els.fabBadge) {
            els.fabBadge.textContent = String(pendingCount);
            els.fabBadge.classList.toggle('display-none', pendingCount === 0);
        }

        if (!els.pendingList) return;
        if (pendingCount === 0) {
            els.pendingList.innerHTML = getEmptyStateBoxHtml({
                title: escapeHtml(battleJournalText('bj.emptyState', 'No pending entries.')),
                description: escapeHtml(battleJournalText('bj.emptyStateDesc', 'Record your first match by tapping the button below!')),
                icon: 'professor'
            });
            return;
        }

        els.pendingList.innerHTML = pendingEntries
            .slice(-BATTLE_JOURNAL_MAX_PREVIEW)
            .reverse()
            .map(entry => {
                const resultClass = entry.result === 'win' ? 'is-win' : (entry.result === 'loss' ? 'is-loss' : 'is-tie');
                const resultText = entry.result === 'win'
                    ? battleJournalText('bj.win', 'Win')
                    : entry.result === 'loss'
                        ? battleJournalText('bj.loss', 'Loss')
                        : battleJournalText('bj.tie', 'Tie');
                const turnText = entry.turnOrder === 'first' ? battleJournalText('bj.firstShort', '1st') : battleJournalText('bj.secondShort', '2nd');
                const bestOfText = entry.bestOf === 'bo3' ? 'BO3' : 'BO1';
                const tournamentPart = entry.tournamentName ? `${escapeHtml(entry.tournamentName)} · ` : '';
                const title = `${entry.ownDeck || 'Deck'} vs ${entry.opponentArchetype || 'Opponent'}`;
                const bo3Text = entry.bestOf === 'bo3' && Array.isArray(entry.bo3Games) && entry.bo3Games.length === 3
                    ? ` · G1:${entry.bo3Games[0].turnOrder || '-'}-${entry.bo3Games[0].result || '-'} G2:${entry.bo3Games[1].turnOrder || '-'}-${entry.bo3Games[1].result || '-'} G3:${entry.bo3Games[2].turnOrder || '-'}-${entry.bo3Games[2].result || '-'}`
                    : '';
                return `
                    <div class="battle-journal-pending-item">
                        <div class="battle-journal-pending-main">
                            <div class="battle-journal-pending-title">${tournamentPart}${escapeHtml(title)}</div>
                            <div class="battle-journal-pending-meta">${escapeHtml(bestOfText)} · ${escapeHtml(turnText)}${escapeHtml(bo3Text)} · ${new Date(entry.createdAtMs || Date.now()).toLocaleString(getLang() === 'de' ? 'de-DE' : 'en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                        </div>
                        <span class="battle-journal-result-pill ${resultClass}">${escapeHtml(resultText)}</span>
                    </div>
                `;
            })
            .join('');
    }

    // ── Game choice toggle (Turn / Result per game row) ─────
    function setGameChoice(gameNum, type, value) {
        // Per-game brick toggle (BO3 only). The brick has no multi-value
        // semantics — it's simply on/off — so we ignore the passed value
        // and just flip the hidden flag.
        if (type === 'brick') {
            const hiddenEl = document.getElementById(`battleJournalGame${gameNum}Brick`);
            const btn = document.getElementById(`battleJournalGame${gameNum}BrickBtn`);
            if (!hiddenEl) return;
            const newVal = hiddenEl.value === '1' ? '' : '1';
            hiddenEl.value = newVal;
            if (btn) btn.classList.toggle('is-active', newVal === '1');
            persistBattleJournalDraftFromForm();
            return;
        }
        const fieldSuffix = type === 'turn' ? 'Turn' : 'Result';
        const hiddenEl = document.getElementById(`battleJournalGame${gameNum}${fieldSuffix}`);
        if (!hiddenEl) return;
        // Toggle: clicking the already-selected value deselects it
        const newVal = hiddenEl.value === value ? '' : value;
        hiddenEl.value = newVal;
        document.querySelectorAll(`[data-field="game${gameNum}${fieldSuffix}"]`).forEach(btn => {
            btn.classList.toggle('is-selected', btn.dataset.value === newVal);
        });
        persistBattleJournalDraftFromForm();
    }

    function onGameNotesInput(_gameNum) {
        // Per-game notes need draft persistence so a half-typed note
        // survives a tab switch / reload, just like all other inputs.
        persistBattleJournalDraftFromForm();
    }

    // ── Choice buttons & form ────────────────────────────────

    function setBattleJournalChoice(field, value) {
        const els = battleJournalElements();
        const normalized = String(value || '').trim();

        if (field === 'bestOf' && els.bestOfInput) {
            els.bestOfInput.value = normalized;
            document.querySelectorAll('.battle-journal-choice[data-field="bestOf"]').forEach(button => {
                button.classList.toggle('is-selected', button.dataset.value === normalized);
            });
            renderGameRows();
            // Restore draft game details after rendering rows
            const draft = getBattleJournalDraft();
            applyGameDetails(draft.games || draft.bo3Games || []);
        } else if (field === 'ownDeck' && els.ownDeckValue) {
            els.ownDeckValue.value = normalized;
        } else if (field === 'opponentArchetype' && els.opponentValue) {
            els.opponentValue.value = normalized;
        }

        persistBattleJournalDraftFromForm();
    }

    function getBattleJournalFormValues() {
        const els = battleJournalElements();
        const games = getGameDetails();
        const derived = deriveOverallResult(games);
        return {
            tournamentName: String(els.tournamentName?.value || '').trim(),
            ownDeck: String(els.ownDeckValue?.value || '').trim(),
            opponentArchetype: String(els.opponentValue?.value || '').trim(),
            bestOf: String(els.bestOfInput?.value || '').trim(),
            meta: String(els.metaInput?.value || '').trim(),
            tournamentType: String(els.typeInput?.value || '').trim(),
            brick: els.brickInput?.checked || false,
            notes: String(els.notesInput?.value || '').trim(),
            turnOrder: derived.turnOrder,
            result: derived.result,
            games: games
        };
    }

    function persistBattleJournalDraftFromForm() {
        saveBattleJournalDraft(getBattleJournalFormValues());
    }

    function applyBattleJournalDraft() {
        const els = battleJournalElements();
        const draft = getBattleJournalDraft();
        if (els.tournamentName) els.tournamentName.value = draft.tournamentName || '';
        if (els.ownDeckValue) els.ownDeckValue.value = draft.ownDeck || '';
        if (els.opponentValue) els.opponentValue.value = draft.opponentArchetype || '';
        if (els.bestOfInput) els.bestOfInput.value = draft.bestOf || '';
        if (els.metaInput) els.metaInput.value = draft.meta || '';
        if (els.typeInput) els.typeInput.value = draft.tournamentType || '';
        if (els.brickInput) els.brickInput.checked = draft.brick || false;
        if (els.notesInput) els.notesInput.value = draft.notes || '';
        document.querySelectorAll('.bj-type-chip').forEach(c => c.classList.toggle('is-selected', c.dataset.value === (draft.tournamentType || '')));

        renderDeckChoices();
        setBattleJournalChoice('bestOf', draft.bestOf || '');
        // Game details are applied inside setBattleJournalChoice after renderGameRows
    }

    function resetBattleJournalForm() {
        const els = battleJournalElements();
        if (els.form) els.form.reset();
        if (els.tournamentName) els.tournamentName.value = '';
        if (els.ownDeckValue) els.ownDeckValue.value = '';
        if (els.opponentValue) els.opponentValue.value = '';
        if (els.bestOfInput) els.bestOfInput.value = '';
        if (els.turnOrderInput) els.turnOrderInput.value = '';
        if (els.resultInput) els.resultInput.value = '';
        if (els.metaInput) els.metaInput.value = '';
        if (els.typeInput) els.typeInput.value = '';
        document.querySelectorAll('.battle-journal-choice').forEach(button => button.classList.remove('is-selected'));
        document.querySelectorAll('.bj-type-chip').forEach(c => c.classList.remove('is-selected'));
        const brickEl = document.getElementById('battleJournalBrick');
        if (brickEl) brickEl.checked = false;
        const notesEl = document.getElementById('battleJournalNotes');
        if (notesEl) notesEl.value = '';
        renderGameRows();
        renderDeckChoices();
        localStorage.removeItem(BATTLE_JOURNAL_DRAFT_KEY);
    }

    function clearBattleJournalDraft() {
        localStorage.removeItem(BATTLE_JOURNAL_DRAFT_KEY);
        resetBattleJournalForm();
    }

    function validateBattleJournalEntry(values) {
        if (!values.ownDeck) {
            showToast(battleJournalText('bj.validationOwnDeck', 'Please select your deck.'), 'warning');
            return false;
        }
        if (!values.opponentArchetype) {
            showToast(battleJournalText('bj.validationOpponent', 'Please select the opponent archetype.'), 'warning');
            return false;
        }
        if (!values.bestOf) {
            showToast(battleJournalText('bj.validationBestOf', 'Please choose BO1 or BO3.'), 'warning');
            return false;
        }
        const gameCount = values.bestOf === 'bo3' ? 3 : 1;
        const games = values.games || [];
        // Require at least 1 game with both turnOrder and result filled
        const filledGames = games.filter(g => g && g.turnOrder && g.result);
        if (filledGames.length === 0) {
            showToast(battleJournalText('bj.validationGames', 'Please fill Going and Result for at least one game.'), 'warning');
            return false;
        }
        return true;
    }

    function buildBattleJournalEntry(values) {
        const activeTab = getBattleJournalActiveTab();
        const sourceArchetype = getBattleJournalCurrentOwnDeck();
        const games = values.games || [];
        const derived = deriveOverallResult(games);
        const isBo3 = (values.bestOf || 'bo1') === 'bo3';
        // For BO3 the brick + notes live per-game (inside bo3Games[i]).
        // The match-level brick/notes still get stored — for BO3 they roll
        // up to "any game flagged as brick" and "concatenated notes" so
        // legacy code paths (history badges, summaries) keep working.
        const matchBrick = isBo3
            ? games.some(g => g && g.brick)
            : !!values.brick;
        const matchNotes = isBo3
            ? games.map((g, i) => g && g.notes ? `G${i + 1}: ${g.notes}` : '').filter(Boolean).join(' | ')
            : (values.notes || '');
        return {
            id: `bj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            tournamentName: values.tournamentName || '',
            meta: values.meta || '',
            tournamentType: values.tournamentType || '',
            ownDeck: values.ownDeck,
            opponentArchetype: values.opponentArchetype,
            bestOf: values.bestOf || 'bo1',
            turnOrder: derived.turnOrder,
            result: derived.result,
            bo3Games: games,
            brick: matchBrick,
            notes: matchNotes,
            createdAtMs: Date.now(),
            sourceTab: activeTab,
            sourceArchetype,
            userId: window.auth?.currentUser?.uid || null,
            schemaVersion: 5
        };
    }

    function playSaveFeedback() {
        const els = battleJournalElements();
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            navigator.vibrate(20);
        }
        if (!els.saveFx) return;
        els.saveFx.classList.add('is-show');
        setTimeout(() => els.saveFx.classList.remove('is-show'), 850);
    }

    function updateThemeVisual() {
        const els = battleJournalElements();
        if (!els.sheet || !els.overlay) return;
        const isDark = battleJournalTheme === 'dark';
        els.sheet.classList.toggle('is-dark', isDark);
        els.overlay.classList.toggle('is-dark', isDark);
        if (els.themeToggle) {
            els.themeToggle.textContent = isDark
                ? battleJournalText('bj.themeLight', 'Light')
                : battleJournalText('bj.themeDark', 'Dark');
        }
    }

    function toggleBattleJournalTheme() {
        battleJournalTheme = battleJournalTheme === 'dark' ? 'light' : 'dark';
        localStorage.setItem(BATTLE_JOURNAL_THEME_KEY, battleJournalTheme);
        updateThemeVisual();
    }

    async function syncBattleJournalEntry(entry, user) {
        const payload = {
            tournamentName: entry.tournamentName || '',
            meta: entry.meta || '',
            tournamentType: entry.tournamentType || '',
            ownDeck: entry.ownDeck,
            opponentArchetype: entry.opponentArchetype,
            bestOf: entry.bestOf || 'bo1',
            turnOrder: entry.turnOrder,
            result: entry.result,
            bo3Games: Array.isArray(entry.bo3Games) ? entry.bo3Games : [],
            brick: entry.brick || false,
            notes: entry.notes || '',
            sourceTab: entry.sourceTab || null,
            sourceArchetype: entry.sourceArchetype || null,
            createdAtMs: entry.createdAtMs,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            syncedAt: firebase.firestore.FieldValue.serverTimestamp(),
            schemaVersion: entry.schemaVersion || 4
        };

        await window.db
            .collection('users')
            .doc(user.uid)
            .collection('battleJournal')
            .doc(entry.id)
            .set(payload, { merge: true });
    }

    async function flushBattleJournalOutbox(showSuccessToast = true) {
        if (battleJournalSyncPromise) return battleJournalSyncPromise;

        battleJournalSyncPromise = (async () => {
            const pendingEntries = getBattleJournalOutbox();
            if (pendingEntries.length === 0) {
                setBattleJournalStatus('ready');
                return { synced: 0, remaining: 0 };
            }

            if (!navigator.onLine) {
                setBattleJournalStatus('offline');
                return { synced: 0, remaining: pendingEntries.length };
            }

            const user = window.auth?.currentUser || null;
            if (!user || !window.db || typeof window.db.collection !== 'function') {
                setBattleJournalStatus('waitingLogin');
                return { synced: 0, remaining: pendingEntries.length };
            }

            setBattleJournalStatus('syncing');
            let synced = 0;
            const remaining = [];

            for (const entry of pendingEntries) {
                try {
                    await syncBattleJournalEntry(entry, user);
                    synced += 1;
                } catch (error) {
                    console.error('[Battle Journal] Sync failed for entry', entry.id, error);
                    remaining.push(entry);
                }
            }

            saveBattleJournalOutbox(remaining);
            if (remaining.length === 0) {
                setBattleJournalStatus(synced > 0 ? 'synced' : 'ready');
            } else {
                setBattleJournalStatus('error');
            }

            if (synced > 0 && showSuccessToast) {
                showToast(battleJournalText('bj.syncSuccess', '{count} entries synced.').replace('{count}', String(synced)), 'success');
            }

            return { synced, remaining: remaining.length };
        })().finally(() => {
            battleJournalSyncPromise = null;
            renderBattleJournalSummary();
        });

        renderBattleJournalSummary();
        return battleJournalSyncPromise;
    }

    async function submitBattleJournalEntry(event) {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        const values = getBattleJournalFormValues();
        if (!validateBattleJournalEntry(values)) return;

        const outbox = getBattleJournalOutbox();
        const newEntry = buildBattleJournalEntry(values);
        outbox.push(newEntry);
        saveBattleJournalOutbox(outbox);
        localStorage.removeItem(BATTLE_JOURNAL_DRAFT_KEY);
        resetBattleJournalForm();
        playSaveFeedback();

        // Copy WhatsApp-friendly result string to clipboard
        const clipText = formatEntryForClipboard(newEntry);
        copyTextToClipboard(clipText);

        if (navigator.onLine && window.auth?.currentUser) {
            showToast(battleJournalText('bj.savedAndCopied', 'Entry saved & copied to clipboard!'), 'success');
            await flushBattleJournalOutbox(false);
        } else if (!navigator.onLine) {
            setBattleJournalStatus('offline');
            showToast(battleJournalText('bj.savedOffline', 'Saved offline. It will sync automatically later.'), 'success', 4500);
        } else {
            setBattleJournalStatus('waitingLogin');
            showToast(battleJournalText('bj.savedWaitingLogin', 'Saved locally. Sign in once to sync it.'), 'info', 4500);
        }

        renderBattleJournalSummary();
        closeBattleJournalSheet();
    }

    function openBattleJournalSheet() {
        const els = battleJournalElements();
        if (!els.overlay) return;
        // Always start with a blank form
        resetBattleJournalForm();
        // Load history (incl. Firestore) so getLastTournament works after sync
        loadJournalHistory().then(() => renderLastTournamentButton()).catch(() => {});
        renderLastTournamentButton();
        renderBattleJournalSummary();
        updateThemeVisual();
        els.overlay.classList.add('is-open');
        els.overlay.setAttribute('aria-hidden', 'false');
        document.body.classList.add('battle-journal-open');
    }

    function closeBattleJournalSheet() {
        const els = battleJournalElements();
        if (!els.overlay) return;
        // Don't persist draft — journal opens blank every time
        localStorage.removeItem(BATTLE_JOURNAL_DRAFT_KEY);
        els.overlay.classList.remove('is-open');
        els.overlay.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('battle-journal-open');
    }

    function handleBattleJournalVisibilitySync() {
        if (document.visibilityState === 'visible') flushBattleJournalOutbox(false);
    }

    function initBattleJournal() {
        if (window.__battleJournalInitialized) return;
        window.__battleJournalInitialized = true;

        const els = battleJournalElements();
        if (!els.overlay || !els.form) return;

        applyBattleJournalDraft();
        renderBattleJournalSummary();
        updateThemeVisual();

        if (els.tournamentName) {
            els.tournamentName.addEventListener('input', () => persistBattleJournalDraftFromForm());
        }
        if (els.ownDeckValue) {
            els.ownDeckValue.addEventListener('input', () => persistBattleJournalDraftFromForm());
        }
        if (els.opponentValue) {
            els.opponentValue.addEventListener('input', () => persistBattleJournalDraftFromForm());
        }
        if (els.brickInput) {
            els.brickInput.addEventListener('change', () => persistBattleJournalDraftFromForm());
        }
        if (els.notesInput) {
            els.notesInput.addEventListener('input', () => persistBattleJournalDraftFromForm());
        }

        renderGameRows();

        els.overlay.addEventListener('click', event => {
            if (event.target === els.overlay) closeBattleJournalSheet();
        });

        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && els.overlay.classList.contains('is-open')) closeBattleJournalSheet();
        });

        document.addEventListener('languageChanged', () => {
            renderBattleJournalSummary();
            updateThemeVisual();
            renderDeckChoices();
        });

        window.addEventListener('online', () => {
            setBattleJournalStatus('ready');
            flushBattleJournalOutbox(true);
        });

        window.addEventListener('offline', () => {
            setBattleJournalStatus('offline');
        });

        document.addEventListener('visibilitychange', handleBattleJournalVisibilitySync);
        flushBattleJournalOutbox(false);
    }

    // ── Journal History (Profile Tab) ───────────────────────

    let journalHistoryCache = [];

    // ── Clipboard format helper ──────────────────────────────

    function formatEntryForClipboard(entry) {
        // Build WhatsApp-friendly format: "WLW Dragapult Dusknoir" / "W Charizard ex"
        let resultStr = '';
        if (entry.bestOf === 'bo3' && Array.isArray(entry.bo3Games)) {
            const filled = entry.bo3Games.filter(g => g && g.result);
            resultStr = filled.map(g => {
                if (g.result === 'win') return 'W';
                if (g.result === 'loss') return 'L';
                if (g.result === 'tie') return 'T';
                return '?';
            }).join('');
        } else {
            if (entry.result === 'win') resultStr = 'W';
            else if (entry.result === 'loss') resultStr = 'L';
            else if (entry.result === 'tie') resultStr = 'T';
            else resultStr = '?';
        }
        const opponent = entry.opponentArchetype || 'Unknown';
        return `${resultStr} ${opponent}`;
    }

    function copyTextToClipboard(text) {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
        } else {
            fallbackCopy(text);
        }
    }

    function fallbackCopy(text) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;left:-9999px';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (_) { /* ignore */ }
        document.body.removeChild(ta);
    }

    // ── Read-time migration for old tournament type values ───
    function _migrateTypeValues(entries) {
        const map = {
            'City League':      'Cup',
            'Special Event':    'Regional/SPE/IC',
            'League Cup':       'Cup',
            'League Challenge': 'Challenge',
            'Casual':           'Testing',
            'Regional':         'Regional/SPE/IC'
        };
        return entries.map(e => {
            if (e.tournamentType && map[e.tournamentType]) {
                return { ...e, tournamentType: map[e.tournamentType] };
            }
            return e;
        });
    }

    async function loadJournalHistory() {
        const entries = [];

        // 1) Pending entries from localStorage outbox (not yet synced)
        const outbox = getBattleJournalOutbox();
        outbox.forEach(e => entries.push({ ...e, _pending: true }));

        // 2) Synced entries from Firestore
        const user = window.auth?.currentUser;
        if (user && window.db && typeof window.db.collection === 'function') {
            try {
                const snap = await window.db
                    .collection('users').doc(user.uid)
                    .collection('battleJournal')
                    .orderBy('createdAtMs', 'desc')
                    .limit(200)
                    .get();
                const pendingIds = new Set(outbox.map(e => e.id));
                snap.forEach(doc => {
                    const data = doc.data();
                    if (!pendingIds.has(doc.id)) {
                        entries.push({ id: doc.id, ...data, _pending: false });
                    }
                });
            } catch (err) {
                console.error('[Battle Journal] Failed to load history from Firestore', err);
            }
        }

        // Sort newest first
        entries.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
        journalHistoryCache = _migrateTypeValues(entries);
        return journalHistoryCache;
    }

    function renderJournalHistory() {
        const listEl = document.getElementById('journalHistoryList');
        const statsEl = document.getElementById('journalHistoryStats');
        if (!listEl) return;

        const filterTournament = document.getElementById('journalFilterTournament')?.value || '';
        const filterResult = document.getElementById('journalFilterResult')?.value || '';
        const filterMeta = document.getElementById('journalFilterMeta')?.value || '';
        const filterType = document.getElementById('journalFilterType')?.value || '';

        // Filter
        let filtered = journalHistoryCache;
        if (filterTournament) filtered = filtered.filter(e => e.tournamentName === filterTournament);
        if (filterResult) filtered = filtered.filter(e => e.result === filterResult);
        if (filterMeta) filtered = filtered.filter(e => (e.meta || '') === filterMeta);
        if (filterType) filtered = filtered.filter(e => (e.tournamentType || '') === filterType);

        // Stats
        const totalW = filtered.filter(e => e.result === 'win').length;
        const totalL = filtered.filter(e => e.result === 'loss').length;
        const totalT = filtered.filter(e => e.result === 'tie').length;
        const total = filtered.length;
        const winRate = total > 0 ? Math.round((totalW / total) * 100) : 0;

        if (statsEl) {
            statsEl.innerHTML = `
                <div class="bj-history-stat"><strong>${total}</strong><span>${battleJournalText('bj.histMatches', 'Matches')}</span></div>
                <div class="bj-history-stat is-win"><strong>${totalW}</strong><span>${battleJournalText('bj.win', 'Win')}</span></div>
                <div class="bj-history-stat is-loss"><strong>${totalL}</strong><span>${battleJournalText('bj.loss', 'Loss')}</span></div>
                <div class="bj-history-stat is-tie"><strong>${totalT}</strong><span>${battleJournalText('bj.tie', 'Tie')}</span></div>
                <div class="bj-history-stat"><strong>${winRate}%</strong><span>${battleJournalText('bj.histWinRate', 'Win Rate')}</span></div>
            `;
        }

        if (filtered.length === 0) {
            listEl.innerHTML = getEmptyStateBoxHtml({
                title: escapeHtml(battleJournalText('bj.histEmpty', 'No journal entries yet.')),
                description: escapeHtml(battleJournalText('bj.histEmptyDesc', 'Log your first match to start tracking your results!')),
                icon: 'professor'
            });
            return;
        }

        // Group by meta → tournament
        const metaGroups = {};
        filtered.forEach(entry => {
            const metaKey = entry.meta || '';
            const tournKey = entry.tournamentName || '';
            if (!metaGroups[metaKey]) metaGroups[metaKey] = {};
            if (!metaGroups[metaKey][tournKey]) metaGroups[metaKey][tournKey] = [];
            metaGroups[metaKey][tournKey].push(entry);
        });

        const locale = getLang() === 'de' ? 'de-DE' : 'en-GB';
        let html = '';

        const metaKeys = Object.keys(metaGroups).sort((a, b) => {
            if (!a && b) return 1;
            if (a && !b) return -1;
            return a.localeCompare(b);
        });

        metaKeys.forEach(metaKey => {
            const metaLabel = metaKey || battleJournalText('bj.noMeta', 'No Meta');
            const tournaments = metaGroups[metaKey];
            const tournNames = Object.keys(tournaments).sort((a, b) => {
                const aNewest = Math.max(...tournaments[a].map(e => e.createdAtMs || 0));
                const bNewest = Math.max(...tournaments[b].map(e => e.createdAtMs || 0));
                return bNewest - aNewest;
            });

            const metaEntries = Object.values(tournaments).flat();
            const mW = metaEntries.filter(e => e.result === 'win').length;
            const mL = metaEntries.filter(e => e.result === 'loss').length;
            const mT = metaEntries.filter(e => e.result === 'tie').length;

            html += `<div class="bj-meta-folder">
                <div class="bj-meta-folder-header" onclick="this.parentElement.classList.toggle('is-collapsed')">
                    <span class="bj-meta-folder-icon"></span>
                    <span class="bj-meta-folder-label">${escapeHtml(metaLabel)}</span>
                    <span class="bj-meta-folder-stats">${mW}W ${mL}L ${mT}T</span>
                    <span class="bj-meta-folder-chevron">▾</span>
                </div>
                <div class="bj-meta-folder-content">`;

            tournNames.forEach(tournKey => {
                const entries = tournaments[tournKey];
                const tournLabel = tournKey || battleJournalText('bj.noTournament', 'No Tournament');
                const tW = entries.filter(e => e.result === 'win').length;
                const tL = entries.filter(e => e.result === 'loss').length;
                const tT = entries.filter(e => e.result === 'tie').length;
                const tTotal = entries.length;
                const tWinRate = tTotal > 0 ? Math.round((tW / tTotal) * 100) : 0;
                const safeTournKey = escapeHtml(tournKey).replace(/'/g, "\\'");
                const groupType = (entries[0]?.tournamentType || '').replace(/'/g, "\\'");
                const safeMetaKey = escapeHtml(metaKey).replace(/'/g, "\\'");
                const safeGroupType = escapeHtml(groupType);

                html += `<div class="bj-tournament-block" data-meta="${escapeHtml(metaKey)}" data-tournament-type="${safeGroupType}">
                    <div class="bj-tournament-header">
                        <div class="bj-tournament-info">
                            <strong class="bj-tournament-name">${escapeHtml(tournLabel)}</strong>
                            <span class="bj-tournament-record">${tW}-${tL}-${tT} (${tWinRate}%)</span>
                        </div>
                        <button type="button" class="bj-tournament-add-btn" onclick="continueJournalTournament('${safeTournKey}','${safeMetaKey}','${safeGroupType}')" title="${escapeHtml(battleJournalText('bj.addMatch', 'Add match'))}">+ Match</button>
                        <button type="button" class="bj-tournament-edit-btn" onclick="openEditTournamentModal('${safeTournKey}')" title="${escapeHtml(battleJournalText('bj.editTournament', 'Edit tournament'))}">Edit</button>
                        <button type="button" class="bj-tournament-share-btn" onclick="shareTournamentSummary('${safeTournKey}', false)" title="${escapeHtml(battleJournalText('bj.shareTournament', 'Share as image'))}">Share</button>
                        <button type="button" class="bj-tournament-share-btn bj-tournament-share-details-btn" onclick="shareTournamentSummary('${safeTournKey}', true)" title="${escapeHtml(battleJournalText('bj.shareTournamentDetails', 'Share with brick + notes'))}">Share+</button>
                    </div>`;

                entries.forEach(entry => {
                    html += _buildHistoryItemHtml(entry, locale);
                });

                html += `</div>`;
            });

            html += `</div></div>`;
        });

        listEl.innerHTML = html;
    }

    function _buildHistoryItemHtml(entry, locale) {
        const resultClass = entry.result === 'win' ? 'is-win' : (entry.result === 'loss' ? 'is-loss' : 'is-tie');
        const resultEmoji = entry.result === 'win' ? 'W' : (entry.result === 'loss' ? 'L' : 'T');
        const resultText = entry.result === 'win' ? battleJournalText('bj.win', 'Win')
            : entry.result === 'loss' ? battleJournalText('bj.loss', 'Loss')
            : battleJournalText('bj.tie', 'Tie');
        const turnText = entry.turnOrder === 'first' ? battleJournalText('bj.firstShort', '1st') : (entry.turnOrder === 'second' ? battleJournalText('bj.secondShort', '2nd') : '');
        const bestOfText = entry.bestOf === 'bo3' ? 'BO3' : 'BO1';
        const dateStr = new Date(entry.createdAtMs || Date.now()).toLocaleString(locale, { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
        const pendingBadge = entry._pending ? `<span class="bj-history-pending">${escapeHtml(battleJournalText('bj.histPending', 'pending'))}</span>` : '';

        let bo3Line = '';
        let bo3Detail = '';
        if (entry.bestOf === 'bo3' && Array.isArray(entry.bo3Games)) {
            const gameTexts = entry.bo3Games
                .filter(g => g && (g.turnOrder || g.result))
                .map((g, i) => {
                    const gTurn = g.turnOrder === 'first' ? '1st' : (g.turnOrder === 'second' ? '2nd' : '-');
                    const gRes = g.result || '-';
                    const brickMark = g.brick ? ' 🧱' : '';
                    return `G${i + 1}: ${gTurn}/${gRes}${brickMark}`;
                });
            if (gameTexts.length > 0) bo3Line = `<div class="bj-history-games">${escapeHtml(gameTexts.join(' · '))}</div>`;
            // Per-game notes get their own indented lines so longer text
            // doesn't get crammed into the compact summary line.
            const noteLines = entry.bo3Games
                .map((g, i) => g && g.notes ? `G${i + 1}: ${g.notes}` : '')
                .filter(Boolean);
            if (noteLines.length > 0) {
                bo3Detail = noteLines
                    .map(line => `<div class="bj-history-notes bj-history-game-note">${escapeHtml(line)}</div>`)
                    .join('');
            }
        }

        const brickBadge = entry.brick ? `<span class="bj-brick-badge">🧱 Brick</span>` : '';
        // Suppress the rolled-up match-level notes for BO3 entries that
        // already render per-game notes — would just duplicate.
        const hasPerGameNotes = entry.bestOf === 'bo3'
            && Array.isArray(entry.bo3Games)
            && entry.bo3Games.some(g => g && g.notes);
        const notesLine = (entry.notes && !hasPerGameNotes)
            ? `<div class="bj-history-notes">${escapeHtml(entry.notes)}</div>`
            : '';
        const clipText = formatEntryForClipboard(entry);
        return `
            <div class="bj-history-item ${resultClass}${entry.brick ? ' is-brick' : ''}">
                <div class="bj-history-item-main">
                    <div class="bj-history-matchup">
                        <strong>${escapeHtml(entry.ownDeck || 'Deck')}</strong>
                        <span class="bj-history-vs">vs</span>
                        <strong>${escapeHtml(entry.opponentArchetype || 'Opponent')}</strong>
                        ${brickBadge}
                    </div>
                    <div class="bj-history-meta">${escapeHtml(bestOfText)}${turnText ? ' · ' + escapeHtml(turnText) : ''} · ${escapeHtml(dateStr)} ${pendingBadge}</div>
                    ${bo3Line}
                    ${bo3Detail}
                    ${notesLine}
                    <div class="bj-history-clip">${escapeHtml(clipText)}</div>
                </div>
                <div class="bj-history-actions">
                    <button type="button" class="bj-history-brick-btn${entry.brick ? ' is-active' : ''}" onclick="toggleBrickEntry('${escapeHtml(entry.id)}')" title="${entry.brick ? 'Brick entfernen' : 'Als Brick markieren'}">🧱</button>
                    <button type="button" class="bj-history-edit-btn" onclick="openEditEntryModal('${escapeHtml(entry.id)}')" title="${escapeHtml(battleJournalText('bj.editEntry', 'Edit'))}">Edit</button>
                    <button type="button" class="bj-history-delete-btn" onclick="deleteJournalEntry('${escapeHtml(entry.id)}')" title="${escapeHtml(battleJournalText('bj.deleteEntry', 'Delete'))}">Del</button>
                    <button type="button" class="bj-history-copy-btn" onclick="copyJournalEntry('${escapeHtml(entry.id)}')" title="${escapeHtml(battleJournalText('bj.copyEntry', 'Copy'))}">Copy</button>
                    <span class="battle-journal-result-pill ${resultClass}">${resultEmoji} ${escapeHtml(resultText)}</span>
                </div>
            </div>
        `;
    }

    function selectJournalType(value) {
        const input = document.getElementById('battleJournalType');
        if (input) input.value = value;
        document.querySelectorAll('.bj-type-chip').forEach(c => {
            c.classList.toggle('is-selected', c.dataset.value === value);
        });
    }

    // Pulls the per-entry detail strings (brick flags + notes) for the
    // "Share with details" image. Falls back to legacy match-level fields
    // when the entry predates per-game data.
    function _entryDetailLines(entry) {
        const lines = [];
        const isBo3 = entry.bestOf === 'bo3' && Array.isArray(entry.bo3Games);
        if (isBo3) {
            entry.bo3Games.forEach((g, i) => {
                if (!g) return;
                const tag = `G${i + 1}`;
                const turn = g.turnOrder === 'first' ? '1st' : (g.turnOrder === 'second' ? '2nd' : '\u2013');
                const res  = g.result === 'win' ? 'W' : (g.result === 'loss' ? 'L' : (g.result === 'tie' ? 'T' : '\u2013'));
                const head = `${tag}: ${turn}/${res}${g.brick ? ' \ud83e\uddf1' : ''}`;
                lines.push(g.notes ? `${head} \u2014 ${g.notes}` : head);
            });
            const hasGameNotes = entry.bo3Games.some(g => g && g.notes);
            if (!hasGameNotes && entry.notes) lines.push(entry.notes);
        } else {
            if (entry.brick) lines.push('\ud83e\uddf1 Brick');
            if (entry.notes) lines.push(entry.notes);
        }
        return lines;
    }

    function _wrapCanvasText(ctx, text, maxWidth) {
        const words = String(text || '').split(/\s+/);
        const lines = [];
        let current = '';
        words.forEach(word => {
            const probe = current ? current + ' ' + word : word;
            if (ctx.measureText(probe).width <= maxWidth) {
                current = probe;
            } else {
                if (current) lines.push(current);
                current = word;
            }
        });
        if (current) lines.push(current);
        return lines;
    }

    async function shareTournamentSummary(tournamentName, withDetails) {
        const entries = journalHistoryCache.filter(e => e.tournamentName === tournamentName);
        if (entries.length === 0) return;

        const wins = entries.filter(e => e.result === 'win').length;
        const losses = entries.filter(e => e.result === 'loss').length;
        const ties = entries.filter(e => e.result === 'tie').length;
        const total = entries.length;
        const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

        const W = 600;
        const HEADER_H = 96;
        const FOOTER_H = 24;
        const BASE_ROW_H = 44;
        const DETAIL_LINE_H = 18;
        const DETAIL_FONT = '12px system-ui, sans-serif';
        const ROW_FONT    = '14px system-ui, sans-serif';

        // Pre-measure detail lines so the canvas is exactly tall enough
        // for the chosen mode \u2014 no overflow, no excess whitespace.
        const measureCanvas = document.createElement('canvas');
        const measureCtx = measureCanvas.getContext('2d');
        const rowSizes = entries.map(entry => {
            if (!withDetails) return { detailLines: [], h: BASE_ROW_H };
            measureCtx.font = DETAIL_FONT;
            const detailLines = _entryDetailLines(entry).flatMap(line =>
                _wrapCanvasText(measureCtx, line, W - 64)
            );
            const extra = detailLines.length ? detailLines.length * DETAIL_LINE_H + 4 : 0;
            return { detailLines, h: BASE_ROW_H + extra };
        });
        const totalRowH = rowSizes.reduce((sum, r) => sum + r.h, 0);
        const H = HEADER_H + totalRowH + FOOTER_H;

        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');

        // Background
        ctx.fillStyle = '#1a1f2e';
        ctx.fillRect(0, 0, W, H);

        // Pok\u00e9ball gradient header
        const grad = ctx.createLinearGradient(0, 0, W, 0);
        grad.addColorStop(0, '#e74c3c');
        grad.addColorStop(1, '#c0392b');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, 56);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 20px system-ui, sans-serif';
        ctx.fillText(tournamentName || 'Tournament', 16, 36);

        // Record line
        ctx.fillStyle = '#a0aec0';
        ctx.font = '14px system-ui, sans-serif';
        ctx.fillText(`${wins}W-${losses}L-${ties}T  \u00b7  ${winRate}% Win Rate`, 16, 78);

        // Match rows
        let y = HEADER_H + 4;
        entries.forEach((entry, idx) => {
            const size = rowSizes[idx];
            const resultEmoji = entry.result === 'win' ? '\u2705' : (entry.result === 'loss' ? '\u274c' : '\ud83d\udfe1');
            ctx.fillStyle = entry.result === 'win' ? 'rgba(39,174,96,0.15)' : (entry.result === 'loss' ? 'rgba(231,76,60,0.12)' : 'rgba(243,156,18,0.12)');
            ctx.fillRect(12, y - 16, W - 24, size.h - 8);
            ctx.fillStyle = '#e2e8f0';
            ctx.font = ROW_FONT;
            const brickMark = entry.brick ? '  \ud83e\uddf1' : '';
            ctx.fillText(`${resultEmoji}  ${entry.ownDeck || 'Deck'} vs ${entry.opponentArchetype || 'Opponent'}${brickMark}`, 20, y + 4);

            if (withDetails && size.detailLines.length) {
                ctx.fillStyle = '#cbd5e0';
                ctx.font = DETAIL_FONT;
                let dy = y + 24;
                size.detailLines.forEach(line => {
                    ctx.fillText(line, 32, dy);
                    dy += DETAIL_LINE_H;
                });
            }
            y += size.h;
        });

        // Watermark
        ctx.fillStyle = '#4a5568';
        ctx.font = '11px system-ui, sans-serif';
        const footerText = withDetails
            ? 'Pok\u00e9mon TCG Analysis \u00b7 Battle Journal \u00b7 Details'
            : 'Pok\u00e9mon TCG Analysis \u00b7 Battle Journal';
        ctx.fillText(footerText, 16, H - 8);

        const filenameSuffix = withDetails ? '-summary-details.png' : '-summary.png';
        canvas.toBlob(async function(blob) {
            if (!blob) return;
            if (navigator.share && navigator.canShare) {
                try {
                    const file = new File([blob], (tournamentName || 'tournament') + filenameSuffix, { type: 'image/png' });
                    if (navigator.canShare({ files: [file] })) {
                        await navigator.share({ files: [file], title: tournamentName });
                        return;
                    }
                } catch (_) { /* fallback */ }
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = (tournamentName || 'tournament') + filenameSuffix;
            a.click();
            URL.revokeObjectURL(url);
            showToast(battleJournalText('bj.imageSaved', 'Image saved!'), 'success');
        }, 'image/png');
    }

    function toggleMatchupStats() {
        openMatchupAnalysisModal();
    }

    /* ── Matchup Analysis Modal ─────────────────────────── */

    function openMatchupAnalysisModal() {
        const modal = document.getElementById('matchupAnalysisModal');
        if (!modal) return;
        populateMatchupFilters();
        renderMatchupAnalysis();
        modal.style.display = 'flex';
    }

    function closeMatchupAnalysisModal() {
        const modal = document.getElementById('matchupAnalysisModal');
        if (modal) modal.style.display = 'none';
    }

    function populateMatchupFilters() {
        const entries = journalHistoryCache;
        const deckSel = document.getElementById('maFilterDeck');
        const metaSel = document.getElementById('maFilterMeta');
        const typeSel = document.getElementById('maFilterType');
        const tournSel = document.getElementById('maFilterTournament');

        if (deckSel) {
            const decks = [...new Set(entries.map(e => e.ownDeck).filter(Boolean))].sort();
            const cur = deckSel.value;
            deckSel.innerHTML = `<option value="">${escapeHtml(battleJournalText('bj.allMyDecks', 'All My Decks'))}</option>`;
            decks.forEach(d => { deckSel.innerHTML += `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`; });
            if (cur && decks.includes(cur)) deckSel.value = cur;
        }
        if (metaSel) {
            const metas = [...new Set(entries.map(e => e.meta).filter(Boolean))].sort();
            const cur = metaSel.value;
            metaSel.innerHTML = `<option value="">${escapeHtml(battleJournalText('bj.allMetas', 'All Formats'))}</option>`;
            metas.forEach(m => { metaSel.innerHTML += `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`; });
            if (cur && metas.includes(cur)) metaSel.value = cur;
        }
        if (typeSel) {
            // Type filter is now chip-based, no select to populate
        }
        if (tournSel) {
            const tourns = [...new Set(entries.map(e => e.tournamentName).filter(Boolean))].sort();
            const cur = tournSel.value;
            tournSel.innerHTML = `<option value="">${escapeHtml(battleJournalText('bj.allTourneys', 'All Tournaments'))}</option>`;
            tourns.forEach(t => { tournSel.innerHTML += `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`; });
            if (cur && tourns.includes(cur)) tournSel.value = cur;
        }
    }

    function toggleMATypeChip(btn) {
        const val = btn.dataset.value;
        const container = document.getElementById('maFilterTypeChips');
        if (!container) return;
        if (val === '') {
            // "Alle" clicked — reset all
            container.querySelectorAll('.ma-chip').forEach(c => c.classList.remove('ma-chip--active'));
            btn.classList.add('ma-chip--active');
        } else {
            // Toggle individual chip
            btn.classList.toggle('ma-chip--active');
            // Remove "Alle" active state
            const alleBtn = container.querySelector('.ma-chip[data-value=""]');
            if (alleBtn) alleBtn.classList.remove('ma-chip--active');
            // If nothing active, re-activate "Alle"
            const anyActive = container.querySelectorAll('.ma-chip--active');
            if (anyActive.length === 0 && alleBtn) alleBtn.classList.add('ma-chip--active');
        }
        renderMatchupAnalysis();
    }

    function renderMatchupAnalysis() {
        const fDeck  = document.getElementById('maFilterDeck')?.value || '';
        const fMeta  = document.getElementById('maFilterMeta')?.value || '';
        const activeChips = document.querySelectorAll('#maFilterTypeChips .ma-chip--active');
        const fTypes = [...activeChips].map(c => c.dataset.value).filter(Boolean);
        const fTourn = document.getElementById('maFilterTournament')?.value || '';
        const fBrick = document.getElementById('maFilterBrick')?.value || 'all';

        let entries = journalHistoryCache;
        if (fDeck)  entries = entries.filter(e => e.ownDeck === fDeck);
        if (fMeta)  entries = entries.filter(e => (e.meta || '') === fMeta);
        if (fTypes.length) entries = entries.filter(e => fTypes.includes(e.tournamentType || ''));
        if (fTourn) entries = entries.filter(e => e.tournamentName === fTourn);
        if (fBrick === 'exclude') entries = entries.filter(e => !e.brick);
        if (fBrick === 'only')    entries = entries.filter(e => !!e.brick);

        // Subtitle
        const sub = document.getElementById('maSubtitle');
        if (sub) sub.textContent = entries.length + ' ' + battleJournalText('ma.matches', 'Matches') + (fDeck ? ' ' + battleJournalText('ma.mit', 'with') + ' ' + fDeck : '');

        // Summary stats
        _renderMASummary(entries);
        // 2D Heatmap
        _renderMAHeatmap(entries);
        // Ranking
        _renderMARankings(entries);
        // Bar list
        _renderMABarList(entries);
    }

    function _renderMASummary(entries) {
        const el = document.getElementById('maSummaryStats');
        if (!el) return;
        const w = entries.filter(e => e.result === 'win').length;
        const l = entries.filter(e => e.result === 'loss').length;
        const t = entries.filter(e => e.result === 'tie').length;
        const tot = entries.length;
        const wr = tot > 0 ? Math.round((w / tot) * 100) : 0;
        const uniqueDecks = new Set(entries.map(e => e.ownDeck).filter(Boolean)).size;
        const uniqueOpps = new Set(entries.map(e => e.opponentArchetype).filter(Boolean)).size;
        el.innerHTML = `
            <div class="ma-stat"><strong>${tot}</strong><span>${escapeHtml(battleJournalText('ma.matches', 'Matches'))}</span></div>
            <div class="ma-stat is-win"><strong>${w}</strong><span>${escapeHtml(battleJournalText('ma.wins', 'Wins'))}</span></div>
            <div class="ma-stat is-loss"><strong>${l}</strong><span>${escapeHtml(battleJournalText('ma.losses', 'Losses'))}</span></div>
            <div class="ma-stat is-tie"><strong>${t}</strong><span>${escapeHtml(battleJournalText('ma.ties', 'Ties'))}</span></div>
            <div class="ma-stat"><strong>${wr}%</strong><span>${escapeHtml(battleJournalText('ma.winRate', 'Win Rate'))}</span></div>
            <div class="ma-stat"><strong>${uniqueDecks}</strong><span>${escapeHtml(battleJournalText('ma.decks', 'Decks'))}</span></div>
            <div class="ma-stat"><strong>${uniqueOpps}</strong><span>${escapeHtml(battleJournalText('ma.opponents', 'Opponents'))}</span></div>
        `;
    }

    function _renderMAHeatmap(entries) {
        const wrap = document.getElementById('maHeatmapWrap');
        if (!wrap) return;

        if (entries.length === 0) {
            wrap.innerHTML = `<p class="color-grey fs-13">${escapeHtml(battleJournalText('ma.noData', 'No matchup data.'))}</p>`;
            return;
        }

        // Build 2D data: myDeck × opponent
        const grid = {};
        const myDecks = new Set();
        const oppDecks = new Set();
        entries.forEach(e => {
            const my = e.ownDeck || 'Unknown';
            const opp = e.opponentArchetype || 'Unknown';
            myDecks.add(my);
            oppDecks.add(opp);
            const key = my + '|||' + opp;
            if (!grid[key]) grid[key] = { w: 0, l: 0, t: 0, total: 0 };
            grid[key].total++;
            if (e.result === 'win') grid[key].w++;
            else if (e.result === 'loss') grid[key].l++;
            else grid[key].t++;
        });

        const myArr = [...myDecks].sort();
        const oppArr = [...oppDecks].sort((x, y) => {
            const tx = [...myDecks].reduce((s, d) => s + (grid[d + '|||' + x]?.total || 0), 0);
            const ty = [...myDecks].reduce((s, d) => s + (grid[d + '|||' + y]?.total || 0), 0);
            return ty - tx;
        });

        // When one axis has ≤1 entry, a 2D heatmap adds no information — use a compact list instead.
        // This is the common case (tracking 1 personal deck vs many opponents).
        if (myArr.length < 2 || oppArr.length < 2) {
            wrap.innerHTML = _renderMatchupList(myArr, oppArr, grid);
            return;
        }

        const COL_W = 100; // px — explicit column width beats any table-layout heuristic
        // Pokémon icons: stacked above column label, inline next to row label.
        const _iconStacked = (n) => (window.ArchetypeIcons ? window.ArchetypeIcons.getIconHtml(n, { size: 'sm' }) : '');
        const _iconInline  = (n) => (window.ArchetypeIcons ? window.ArchetypeIcons.getIconHtml(n, { size: 'sm', layout: 'inline' }) : '');
        let html = `<div class="ma-heatmap-scroll"><table class="ma-heatmap-table" style="width:max-content"><thead><tr><th class="ma-heatmap-corner" style="min-width:110px"></th>`;
        oppArr.forEach(opp => {
            const ic = _iconStacked(opp);
            const label = ic
                ? `<span style="display:flex;flex-direction:column;align-items:center;gap:2px;">${ic}<span class="col-label">${escapeHtml(opp)}</span></span>`
                : `<span class="col-label">${escapeHtml(opp)}</span>`;
            html += `<th class="ma-heatmap-col-header" style="min-width:${COL_W}px;width:${COL_W}px" title="${escapeHtml(opp)}">${label}</th>`;
        });
        html += '</tr></thead><tbody>';

        myArr.forEach(my => {
            const ic = _iconInline(my);
            const rowLabel = ic
                ? `<span style="display:inline-flex;align-items:center;gap:6px;">${ic}<span>${escapeHtml(my).replace(/ /g, '<br>')}</span></span>`
                : escapeHtml(my).replace(/ /g, '<br>');
            html += `<tr><td class="ma-heatmap-row-header" style="min-width:110px" title="${escapeHtml(my)}">${rowLabel}</td>`;
            oppArr.forEach(opp => {
                const key = my + '|||' + opp;
                const cell = grid[key];
                if (!cell || cell.total === 0) {
                    html += `<td class="ma-heatmap-cell ma-heatmap-empty" style="min-width:${COL_W}px">–</td>`;
                } else {
                    const wr = Math.round((cell.w / cell.total) * 100);
                    const cls = wr >= 60 ? 'ma-heatmap-good' : (wr >= 40 ? 'ma-heatmap-mid' : 'ma-heatmap-bad');
                    html += `<td class="ma-heatmap-cell ${cls}" style="min-width:${COL_W}px" title="${escapeHtml(my)} vs ${escapeHtml(opp)}: ${cell.w}-${cell.l}-${cell.t} (${wr}%)">${wr}<span class="ma-heatmap-pct">%</span><div class="ma-heatmap-sub">${cell.w}-${cell.l}-${cell.t}</div></td>`;
                }
            });
            html += '</tr>';
        });

        html += '</tbody></table></div>';
        wrap.innerHTML = html;
    }

    // Compact list view — used when a 2D heatmap adds no info (1 axis has ≤1 entry).
    // Sorted by game count desc so the most-played matchups are at the top.
    function _renderMatchupList(myArr, oppArr, grid) {
        // Figure out which axis varies — the single item on the other axis is the "context"
        const isMultiOpp = oppArr.length >= myArr.length;
        const varAxis   = isMultiOpp ? oppArr : myArr;
        const fixedItem = isMultiOpp ? myArr[0] : oppArr[0];

        const pairs = varAxis.map(name => {
            const key = isMultiOpp ? (fixedItem + '|||' + name) : (name + '|||' + fixedItem);
            return { name, cell: grid[key] || { w: 0, l: 0, t: 0, total: 0 } };
        }).filter(p => p.cell.total > 0)
          .sort((a, b) => b.cell.total - a.cell.total);

        if (pairs.length === 0) {
            return `<p class="color-grey fs-13">${escapeHtml(battleJournalText('ma.noData', 'No matchup data.'))}</p>`;
        }

        // Header: which deck is being analyzed
        const contextLabel = fixedItem
            ? `<div class="ma-matchup-list-context">${escapeHtml(battleJournalText('ma.forDeck', 'For'))} <strong>${escapeHtml(fixedItem)}</strong></div>`
            : '';

        const rowsHtml = pairs.map(({ name, cell }) => {
            const wr  = Math.round((cell.w / cell.total) * 100);
            const cls = wr >= 60 ? 'ma-wr-good' : (wr >= 40 ? 'ma-wr-mid' : 'ma-wr-bad');
            const record = `${cell.w}W-${cell.l}L${cell.t > 0 ? '-' + cell.t + 'T' : ''}`;
            const ic = window.ArchetypeIcons
                ? window.ArchetypeIcons.getIconHtml(name, { size: 'sm', layout: 'inline' })
                : '';
            return `
                <div class="ma-matchup-row">
                    <div class="ma-matchup-name" title="${escapeHtml(name)}">${ic}${escapeHtml(name)}</div>
                    <div class="ma-matchup-record">${record}<span class="ma-matchup-total">${cell.total}</span></div>
                    <div class="ma-matchup-wr ${cls}">${wr}%</div>
                </div>`;
        }).join('');

        return `${contextLabel}<div class="ma-matchup-list">${rowsHtml}</div>`;
    }

    function _renderMARankings(entries) {
        const bestEl = document.getElementById('maRankBest');
        const worstEl = document.getElementById('maRankWorst');
        if (!bestEl || !worstEl) return;

        if (entries.length === 0) {
            bestEl.innerHTML = worstEl.innerHTML = `<p class="color-grey fs-13">${escapeHtml(battleJournalText('ma.noRankData', 'No data.'))}</p>`;
            return;
        }

        // Aggregate by opponent
        const opp = {};
        entries.forEach(e => {
            const o = e.opponentArchetype || 'Unknown';
            if (!opp[o]) opp[o] = { w: 0, l: 0, t: 0, total: 0 };
            opp[o].total++;
            if (e.result === 'win') opp[o].w++;
            else if (e.result === 'loss') opp[o].l++;
            else opp[o].t++;
        });

        const sorted = Object.entries(opp)
            .filter(([, s]) => s.total >= 2)
            .map(([name, s]) => ({ name, ...s, wr: Math.round((s.w / s.total) * 100) }))
            .sort((a, b) => b.wr - a.wr || b.total - a.total);

        const best = sorted.slice(0, 5);
        const worst = [...sorted].sort((a, b) => a.wr - b.wr || b.total - a.total).slice(0, 5);

        bestEl.innerHTML = best.length > 0 ? best.map(m => _rankItemHtml(m, 'best')).join('') : `<p class="color-grey fs-13">${escapeHtml(battleJournalText('ma.minTwoMatches', 'Min. 2 matches against the same opponent needed.'))}</p>`;
        worstEl.innerHTML = worst.length > 0 ? worst.map(m => _rankItemHtml(m, 'worst')).join('') : `<p class="color-grey fs-13">${escapeHtml(battleJournalText('ma.minTwoMatches', 'Min. 2 matches against the same opponent needed.'))}</p>`;
    }

    function _rankItemHtml(m, type) {
        const cls = type === 'best' ? 'ma-rank-good' : 'ma-rank-bad';
        const ic = window.ArchetypeIcons
            ? window.ArchetypeIcons.getIconHtml(m.name, { size: 'sm', layout: 'inline' })
            : '';
        return `<div class="ma-rank-item ${cls}">
            <span class="ma-rank-name">${ic}${escapeHtml(m.name)}</span>
            <span class="ma-rank-wr">${m.wr}%</span>
            <span class="ma-rank-record">${m.w}-${m.l}-${m.t}</span>
        </div>`;
    }

    function _renderMABarList(entries) {
        const container = document.getElementById('maBarList');
        if (!container) return;

        if (entries.length === 0) {
            container.innerHTML = `<p class="color-grey fs-13">${escapeHtml(battleJournalText('ma.noData', 'No matchup data.'))}</p>`;
            return;
        }

        const matchups = {};
        entries.forEach(entry => {
            const opp = entry.opponentArchetype || 'Unknown';
            if (!matchups[opp]) matchups[opp] = { wins: 0, losses: 0, ties: 0, total: 0, bricks: 0 };
            matchups[opp].total++;
            if (entry.brick) matchups[opp].bricks++;
            if (entry.result === 'win') matchups[opp].wins++;
            else if (entry.result === 'loss') matchups[opp].losses++;
            else matchups[opp].ties++;
        });

        // Sort by total games descending (most played first)
        const sorted = Object.entries(matchups).sort((a, b) => b[1].total - a[1].total);
        let html = '<div class="bj-matchup-grid">';
        sorted.forEach(function([opp, stats]) {
            const winRate = stats.total > 0 ? Math.round((stats.wins / stats.total) * 100) : 0;
            const barColor = winRate >= 60 ? '#1f8b4d' : (winRate >= 40 ? '#e67e22' : '#c0392b');
            const brickTag = stats.bricks > 0
                ? `<span class="bj-brick-count" title="${stats.bricks} Brick(s)">🧱 ${stats.bricks}</span>`
                : '';
            html += `
                <div class="bj-matchup-row">
                    <div class="bj-matchup-name">${escapeHtml(opp)}</div>
                    <div class="bj-matchup-bar-wrap">
                        <div class="bj-matchup-bar" style="width:${winRate}%;background:${barColor}"></div>
                    </div>
                    <div class="bj-matchup-stats">${stats.wins}-${stats.losses}-${stats.ties} <span class="bj-matchup-rate">${winRate}%</span>${brickTag}</div>
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
    }

    function _truncate(str, max) {
        return str.length > max ? str.slice(0, max - 1) + '\u2026' : str;
    }

    function populateJournalTournamentFilter() {
        const select = document.getElementById('journalFilterTournament');
        if (!select) return;
        const tournaments = [...new Set(journalHistoryCache.map(e => e.tournamentName).filter(Boolean))].sort();
        const current = select.value;
        select.innerHTML = `<option value="">${escapeHtml(battleJournalText('bj.allTournaments', 'All Tournaments'))}</option>`;
        tournaments.forEach(name => {
            select.innerHTML += `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`;
        });
        if (current && tournaments.includes(current)) select.value = current;
    }

    function populateJournalFilters() {
        populateJournalTournamentFilter();

        const metaSelect = document.getElementById('journalFilterMeta');
        if (metaSelect) {
            const metas = [...new Set(journalHistoryCache.map(e => e.meta).filter(Boolean))].sort();
            const current = metaSelect.value;
            metaSelect.innerHTML = `<option value="">${escapeHtml(battleJournalText('bj.allMetas', 'All Formats'))}</option>`;
            metas.forEach(m => {
                metaSelect.innerHTML += `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`;
            });
            if (current && metas.includes(current)) metaSelect.value = current;
        }

        const typeSelect = document.getElementById('journalFilterType');
        if (typeSelect) {
            const types = [...new Set(journalHistoryCache.map(e => e.tournamentType).filter(Boolean))].sort();
            const current = typeSelect.value;
            typeSelect.innerHTML = `<option value="">${escapeHtml(battleJournalText('bj.allTypes', 'All Types'))}</option>`;
            types.forEach(tp => {
                typeSelect.innerHTML += `<option value="${escapeHtml(tp)}">${escapeHtml(tp)}</option>`;
            });
            if (current && types.includes(current)) typeSelect.value = current;
        }
    }

    async function openJournalHistoryTab() {
        await loadJournalHistory();
        populateJournalFilters();
        renderJournalHistory();
    }

    function copyJournalEntry(entryId) {
        const entry = journalHistoryCache.find(e => e.id === entryId);
        if (!entry) return;
        const text = formatEntryForClipboard(entry);
        copyTextToClipboard(text);
        showToast(battleJournalText('bj.copiedClipboard', 'Copied to clipboard!'), 'success');
    }

    function copyAllJournalEntries() {
        const tournamentFilter = document.getElementById('journalFilterTournament')?.value || '';
        const resultFilter = document.getElementById('journalFilterResult')?.value || '';
        let entries = journalHistoryCache;
        if (tournamentFilter) entries = entries.filter(e => e.tournamentName === tournamentFilter);
        if (resultFilter) entries = entries.filter(e => e.result === resultFilter);
        if (entries.length === 0) {
            showToast(battleJournalText('bj.histEmpty', 'No journal entries yet.'), 'info');
            return;
        }
        const lines = entries.map(e => formatEntryForClipboard(e));
        copyTextToClipboard(lines.join('\n'));
        showToast(battleJournalText('bj.copiedAllClipboard', '{count} entries copied!').replace('{count}', String(lines.length)), 'success');
    }

    async function clearAllJournalEntries() {
        const confirmMsg = battleJournalText('bj.clearConfirm', 'Delete ALL journal entries (local + synced)? This cannot be undone.');
        if (!confirm(confirmMsg)) return;

        // 1) Clear local outbox
        saveBattleJournalOutbox([]);

        // 2) Delete all synced entries from Firestore
        const user = window.auth?.currentUser;
        if (user && window.db && typeof window.db.collection === 'function') {
            try {
                const snap = await window.db
                    .collection('users').doc(user.uid)
                    .collection('battleJournal')
                    .get();
                const batch = window.db.batch();
                snap.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
            } catch (err) {
                console.error('[Battle Journal] Failed to delete Firestore entries', err);
                showToast(battleJournalText('bj.clearError', 'Error clearing synced entries.'), 'error');
            }
        }

        // 3) Refresh view
        journalHistoryCache = [];
        renderJournalHistory();
        renderBattleJournalSummary();
        showToast(battleJournalText('bj.clearSuccess', 'All journal entries deleted.'), 'success');
    }

    // ── Edit Tournament / Entry ──────────────────────────────

    let _editTournamentOrigName = '';

    function openEditTournamentModal(tournamentName) {
        _editTournamentOrigName = tournamentName;
        const entries = journalHistoryCache.filter(e => e.tournamentName === tournamentName);
        if (entries.length === 0) return;

        const firstEntry = entries[0];
        const modal = document.getElementById('bjEditTournamentModal');
        if (!modal) return;

        document.getElementById('bjEditTournName').value = tournamentName || '';
        document.getElementById('bjEditTournMeta').value = firstEntry.meta || '';
        document.getElementById('bjEditTournType').value = firstEntry.tournamentType || '';
        document.querySelectorAll('#bjEditTournTypeGroup .bj-type-chip').forEach(c => {
            c.classList.toggle('is-selected', c.dataset.value === (firstEntry.tournamentType || ''));
        });

        // Populate deck datalist from main form's datalist
        const srcList = document.getElementById('battleJournalOwnDeckList');
        const destList = document.getElementById('bjEditTournDeckList');
        if (srcList && destList) destList.innerHTML = srcList.innerHTML;

        // Pre-fill deck from the first entry of this tournament
        const deckInput = document.getElementById('bjEditTournDeck');
        if (deckInput) deckInput.value = firstEntry.ownDeck || '';

        modal.style.display = 'flex';
    }

    function closeEditTournamentModal() {
        const modal = document.getElementById('bjEditTournamentModal');
        if (modal) modal.style.display = 'none';
    }

    function selectEditTournType(value) {
        const input = document.getElementById('bjEditTournType');
        if (input) input.value = value;
        document.querySelectorAll('#bjEditTournTypeGroup .bj-type-chip').forEach(c => {
            c.classList.toggle('is-selected', c.dataset.value === value);
        });
    }

    async function saveEditTournament() {
        const newName = String(document.getElementById('bjEditTournName')?.value || '').trim();
        const newMeta = String(document.getElementById('bjEditTournMeta')?.value || '').trim();
        const newType = String(document.getElementById('bjEditTournType')?.value || '').trim();
        const newDeck = String(document.getElementById('bjEditTournDeck')?.value || '').trim();

        if (!newName) {
            showToast(battleJournalText('bj.editNameRequired', 'Tournament name is required.'), 'warning');
            return;
        }

        // Update local outbox entries
        const outbox = getBattleJournalOutbox();
        let outboxChanged = false;
        outbox.forEach(e => {
            if (e.tournamentName === _editTournamentOrigName) {
                e.tournamentName = newName;
                e.meta = newMeta;
                e.tournamentType = newType;
                if (newDeck) e.ownDeck = newDeck;
                outboxChanged = true;
            }
        });
        if (outboxChanged) saveBattleJournalOutbox(outbox);

        // Update Firestore entries
        const user = window.auth?.currentUser;
        if (user && window.db && typeof window.db.collection === 'function') {
            try {
                const snap = await window.db
                    .collection('users').doc(user.uid)
                    .collection('battleJournal')
                    .where('tournamentName', '==', _editTournamentOrigName)
                    .get();
                if (!snap.empty) {
                    const batch = window.db.batch();
                    snap.forEach(doc => {
                        batch.update(doc.ref, {
                            tournamentName: newName,
                            meta: newMeta,
                            tournamentType: newType,
                            ...(newDeck ? { ownDeck: newDeck } : {}),
                            syncedAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    });
                    await batch.commit();
                }
            } catch (err) {
                console.error('[Battle Journal] Failed to update tournament in Firestore', err);
                showToast(battleJournalText('bj.editError', 'Error saving changes.'), 'error');
            }
        }

        // Update local cache
        journalHistoryCache.forEach(e => {
            if (e.tournamentName === _editTournamentOrigName) {
                e.tournamentName = newName;
                e.meta = newMeta;
                e.tournamentType = newType;
                if (newDeck) e.ownDeck = newDeck;
            }
        });

        closeEditTournamentModal();
        populateJournalFilters();
        renderJournalHistory();
        showToast(battleJournalText('bj.editSaved', 'Tournament updated!'), 'success');
    }

    let _editEntryId = '';

    function openEditEntryModal(entryId) {
        _editEntryId = entryId;
        const entry = journalHistoryCache.find(e => e.id === entryId);
        if (!entry) return;

        const modal = document.getElementById('bjEditEntryModal');
        if (!modal) return;

        document.getElementById('bjEditEntryOwnDeck').value = entry.ownDeck || '';
        document.getElementById('bjEditEntryOpponent').value = entry.opponentArchetype || '';
        document.getElementById('bjEditEntryResult').value = entry.result || '';
        document.getElementById('bjEditEntryTurnOrder').value = entry.turnOrder || '';
        const brickEl = document.getElementById('bjEditEntryBrick');
        if (brickEl) brickEl.checked = entry.brick || false;
        const notesEl = document.getElementById('bjEditEntryNotes');
        if (notesEl) notesEl.value = entry.notes || '';

        // Copy deck suggestions from main form datalist
        const srcList = document.getElementById('battleJournalOwnDeckList');
        const destList = document.getElementById('bjEditEntryOwnDeckList');
        if (srcList && destList) destList.innerHTML = srcList.innerHTML;

        // BO3 entries get the per-game editor; BO1 keeps the overall form.
        const overallEl = document.getElementById('bjEditEntryOverallFields');
        const gamesEl   = document.getElementById('bjEditEntryGamesContainer');
        if (entry.bestOf === 'bo3') {
            if (overallEl) overallEl.style.display = 'none';
            if (gamesEl)   gamesEl.style.display = '';
            // Legacy BO3 entries (schemaVersion < 5) only have match-level
            // brick + notes — no per-game data. Pre-fill game 1 with that
            // info so the user can see and edit it without losing context.
            const seedGames = (entry.bo3Games || []).map(g => ({ ...(g || {}) }));
            const hasPerGameData = seedGames.some(g => g && (g.brick || (g.notes && String(g.notes).trim())));
            if (!hasPerGameData && (entry.brick || (entry.notes && String(entry.notes).trim()))) {
                if (!seedGames[0]) seedGames[0] = {};
                if (entry.brick && seedGames[0].brick === undefined) seedGames[0].brick = true;
                if (entry.notes && !seedGames[0].notes) seedGames[0].notes = entry.notes;
            }
            _renderEditBo3Games(seedGames);
        } else {
            if (overallEl) overallEl.style.display = '';
            if (gamesEl) {
                gamesEl.style.display = 'none';
                gamesEl.innerHTML = '';
            }
        }

        modal.style.display = 'flex';
    }

    // Builds the per-game editor (turn / result / brick / notes for each
    // of the 3 BO3 games) inside the edit modal. Pre-fills from the saved
    // entry so legacy entries that only have {turnOrder, result} still
    // render — the brick + notes inputs just start empty.
    function _renderEditBo3Games(savedGames) {
        const wrap = document.getElementById('bjEditEntryGamesContainer');
        if (!wrap) return;
        const games = Array.isArray(savedGames) ? savedGames : [];
        const firstLabel  = battleJournalText('bj.first', 'First');
        const secondLabel = battleJournalText('bj.second', 'Second');
        const brickTitle  = battleJournalText('bj.brickToggleTitle', 'Brick (Pech-Spiel)');
        const notesPh     = battleJournalText('bj.gameNotesPlaceholder', 'Notiz zu diesem Game...');

        let html = '';
        for (let i = 1; i <= 3; i++) {
            const g = games[i - 1] || {};
            const turn = String(g.turnOrder || '');
            const res  = String(g.result || '');
            const brick = !!g.brick;
            const notes = String(g.notes || '');
            const sel = (a, b) => a === b ? ' is-selected' : '';
            html += `
                <div class="battle-journal-game-row bj-edit-game-row">
                    <span class="battle-journal-bo3-game">Game ${i}</span>
                    <input type="hidden" id="bjEditGame${i}Turn"   value="${escapeHtml(turn)}">
                    <input type="hidden" id="bjEditGame${i}Result" value="${escapeHtml(res)}">
                    <input type="hidden" id="bjEditGame${i}Brick"  value="${brick ? '1' : ''}">
                    <div class="battle-journal-game-btns">
                        <div class="battle-journal-choice-group">
                            <button type="button" class="battle-journal-choice${sel(turn,'first')}"  data-edit-game="${i}" data-edit-field="Turn"   data-edit-value="first"  onclick="setEditGameChoice(${i},'turn','first')">${escapeHtml(firstLabel)}</button>
                            <button type="button" class="battle-journal-choice${sel(turn,'second')}" data-edit-game="${i}" data-edit-field="Turn"   data-edit-value="second" onclick="setEditGameChoice(${i},'turn','second')">${escapeHtml(secondLabel)}</button>
                        </div>
                        <div class="battle-journal-choice-group battle-journal-choice-group-result">
                            <button type="button" class="battle-journal-choice battle-journal-choice-win${sel(res,'win')}"   data-edit-game="${i}" data-edit-field="Result" data-edit-value="win"  onclick="setEditGameChoice(${i},'result','win')">W</button>
                            <button type="button" class="battle-journal-choice battle-journal-choice-loss${sel(res,'loss')}" data-edit-game="${i}" data-edit-field="Result" data-edit-value="loss" onclick="setEditGameChoice(${i},'result','loss')">L</button>
                            <button type="button" class="battle-journal-choice battle-journal-choice-tie${sel(res,'tie')}"   data-edit-game="${i}" data-edit-field="Result" data-edit-value="tie"  onclick="setEditGameChoice(${i},'result','tie')">T</button>
                        </div>
                    </div>
                    <div class="battle-journal-game-extras">
                        <button type="button" class="bj-game-brick-btn${brick ? ' is-active' : ''}" id="bjEditGame${i}BrickBtn" onclick="setEditGameChoice(${i},'brick','1')" title="${escapeHtml(brickTitle)}" aria-label="${escapeHtml(brickTitle)}">🧱</button>
                        <input type="text" id="bjEditGame${i}Notes" class="bj-game-notes-input" maxlength="200" placeholder="${escapeHtml(notesPh)}" value="${escapeHtml(notes)}">
                    </div>
                </div>`;
        }
        wrap.innerHTML = html;
    }

    function setEditGameChoice(gameNum, type, _value) {
        if (type === 'brick') {
            const hidden = document.getElementById(`bjEditGame${gameNum}Brick`);
            const btn = document.getElementById(`bjEditGame${gameNum}BrickBtn`);
            if (!hidden) return;
            const newVal = hidden.value === '1' ? '' : '1';
            hidden.value = newVal;
            if (btn) btn.classList.toggle('is-active', newVal === '1');
            return;
        }
        const fieldSuffix = type === 'turn' ? 'Turn' : 'Result';
        const hidden = document.getElementById(`bjEditGame${gameNum}${fieldSuffix}`);
        if (!hidden) return;
        const newVal = hidden.value === _value ? '' : _value;
        hidden.value = newVal;
        document.querySelectorAll(`[data-edit-game="${gameNum}"][data-edit-field="${fieldSuffix}"]`).forEach(btn => {
            btn.classList.toggle('is-selected', btn.dataset.editValue === newVal);
        });
    }

    function _readEditBo3Games() {
        const games = [];
        for (let i = 1; i <= 3; i++) {
            const turn = String(document.getElementById(`bjEditGame${i}Turn`)?.value || '').trim();
            const res  = String(document.getElementById(`bjEditGame${i}Result`)?.value || '').trim();
            const brick = (document.getElementById(`bjEditGame${i}Brick`)?.value || '') === '1';
            const notes = String(document.getElementById(`bjEditGame${i}Notes`)?.value || '').trim();
            games.push({ turnOrder: turn, result: res, brick, notes });
        }
        return games;
    }

    function closeEditEntryModal() {
        const modal = document.getElementById('bjEditEntryModal');
        if (modal) modal.style.display = 'none';
    }

    async function saveEditEntry() {
        const cached = journalHistoryCache.find(e => e.id === _editEntryId);
        const isBo3  = cached && cached.bestOf === 'bo3';

        const newOwnDeck  = String(document.getElementById('bjEditEntryOwnDeck')?.value || '').trim();
        const newOpponent = String(document.getElementById('bjEditEntryOpponent')?.value || '').trim();

        if (!newOwnDeck || !newOpponent) {
            showToast(battleJournalText('bj.editDeckRequired', 'Deck and opponent are required.'), 'warning');
            return;
        }

        let updatePayload;
        if (isBo3) {
            const games = _readEditBo3Games();
            const derived = deriveOverallResult(games);
            const matchBrick = games.some(g => g && g.brick);
            const matchNotes = games
                .map((g, i) => g && g.notes ? `G${i + 1}: ${g.notes}` : '')
                .filter(Boolean)
                .join(' | ');
            updatePayload = {
                ownDeck: newOwnDeck,
                opponentArchetype: newOpponent,
                bo3Games: games,
                result: derived.result,
                turnOrder: derived.turnOrder,
                brick: matchBrick,
                notes: matchNotes,
                schemaVersion: 5
            };
        } else {
            updatePayload = {
                ownDeck: newOwnDeck,
                opponentArchetype: newOpponent,
                result: String(document.getElementById('bjEditEntryResult')?.value || '').trim(),
                turnOrder: String(document.getElementById('bjEditEntryTurnOrder')?.value || '').trim(),
                brick: document.getElementById('bjEditEntryBrick')?.checked || false,
                notes: String(document.getElementById('bjEditEntryNotes')?.value || '').trim()
            };
        }

        // Update local outbox
        const outbox = getBattleJournalOutbox();
        let outboxChanged = false;
        outbox.forEach(e => {
            if (e.id === _editEntryId) {
                Object.assign(e, updatePayload);
                outboxChanged = true;
            }
        });
        if (outboxChanged) saveBattleJournalOutbox(outbox);

        // Update Firestore
        const user = window.auth?.currentUser;
        if (user && window.db && typeof window.db.collection === 'function') {
            try {
                const docRef = window.db
                    .collection('users').doc(user.uid)
                    .collection('battleJournal').doc(_editEntryId);
                const doc = await docRef.get();
                if (doc.exists) {
                    await docRef.update({
                        ...updatePayload,
                        syncedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
            } catch (err) {
                console.error('[Battle Journal] Failed to update entry in Firestore', err);
                showToast(battleJournalText('bj.editError', 'Error saving changes.'), 'error');
            }
        }

        // Update local cache
        if (cached) Object.assign(cached, updatePayload);

        closeEditEntryModal();
        renderJournalHistory();
        showToast(battleJournalText('bj.editEntrySaved', 'Match updated!'), 'success');
    }

    async function toggleBrickEntry(entryId) {
        const cached = journalHistoryCache.find(e => e.id === entryId);
        if (!cached) return;
        const newBrick = !cached.brick;

        // Update outbox if pending
        const outbox = getBattleJournalOutbox();
        let outboxChanged = false;
        outbox.forEach(e => { if (e.id === entryId) { e.brick = newBrick; outboxChanged = true; } });
        if (outboxChanged) saveBattleJournalOutbox(outbox);

        // Update Firestore if synced
        const user = window.auth?.currentUser;
        if (!outboxChanged && user && window.db && typeof window.db.collection === 'function') {
            try {
                const docRef = window.db.collection('users').doc(user.uid).collection('battleJournal').doc(entryId);
                await docRef.update({ brick: newBrick, syncedAt: firebase.firestore.FieldValue.serverTimestamp() });
            } catch (err) {
                console.error('[Battle Journal] toggleBrickEntry Firestore error', err);
            }
        }

        // Update cache
        cached.brick = newBrick;
        renderJournalHistory();
        showToast(newBrick ? '🧱 Brick markiert' : 'Brick entfernt', 'success');
    }

    async function deleteJournalEntry(entryId) {
        if (!confirm(battleJournalText('bj.deleteEntryConfirm', 'Delete this match entry?'))) return;

        // Remove from outbox
        const outbox = getBattleJournalOutbox().filter(e => e.id !== entryId);
        saveBattleJournalOutbox(outbox);

        // Remove from Firestore
        const user = window.auth?.currentUser;
        if (user && window.db && typeof window.db.collection === 'function') {
            try {
                await window.db
                    .collection('users').doc(user.uid)
                    .collection('battleJournal').doc(entryId)
                    .delete();
            } catch (err) {
                console.error('[Battle Journal] Failed to delete entry from Firestore', err);
            }
        }

        journalHistoryCache = journalHistoryCache.filter(e => e.id !== entryId);
        populateJournalFilters();
        renderJournalHistory();
        renderBattleJournalSummary();
        showToast(battleJournalText('bj.entryDeleted', 'Entry deleted.'), 'success');
    }

    window.openBattleJournalSheet = openBattleJournalSheet;
    window.closeBattleJournalSheet = closeBattleJournalSheet;
    window.submitBattleJournalEntry = submitBattleJournalEntry;
    window.setBattleJournalChoice = setBattleJournalChoice;
    window.setGameChoice = setGameChoice;
    window.onGameNotesInput = onGameNotesInput;
    window.setEditGameChoice = setEditGameChoice;
    window.bjShowAutocomplete = bjShowAutocomplete;
    window.bjHideAutocomplete = bjHideAutocomplete;
    window.bjSelectAutocomplete = bjSelectAutocomplete;
    window.clearBattleJournalDraft = clearBattleJournalDraft;
    window.flushBattleJournalOutbox = flushBattleJournalOutbox;
    window.renderBattleJournalSummary = renderBattleJournalSummary;
    window.toggleBattleJournalTheme = toggleBattleJournalTheme;
    window.applyLastTournament = applyLastTournament;
    window.renderJournalHistory = renderJournalHistory;
    window.openJournalHistoryTab = openJournalHistoryTab;
    window._bjSetCache = function(entries) { journalHistoryCache = _migrateTypeValues(entries); };
    window._bjGetCache = function() { return journalHistoryCache; };
    window.copyJournalEntry = copyJournalEntry;
    window.copyAllJournalEntries = copyAllJournalEntries;
    window.clearAllJournalEntries = clearAllJournalEntries;
    window.selectJournalType = selectJournalType;
    window.shareTournamentSummary = shareTournamentSummary;
    window.toggleMatchupStats = toggleMatchupStats;
    window.openMatchupAnalysisModal = openMatchupAnalysisModal;
    window.closeMatchupAnalysisModal = closeMatchupAnalysisModal;
    window.renderMatchupAnalysis = renderMatchupAnalysis;
    window.toggleMATypeChip = toggleMATypeChip;
    window.openEditTournamentModal = openEditTournamentModal;
    window.closeEditTournamentModal = closeEditTournamentModal;
    window.selectEditTournType = selectEditTournType;
    window.saveEditTournament = saveEditTournament;
    window.openEditEntryModal = openEditEntryModal;
    window.closeEditEntryModal = closeEditEntryModal;
    window.saveEditEntry = saveEditEntry;
    window.toggleBrickEntry = toggleBrickEntry;
    window.deleteJournalEntry = deleteJournalEntry;
    window.continueJournalTournament = continueJournalTournament;

    /**
     * Returns per-opponent win rates from journal entries for a given own-deck name.
     * Used by Meta Call to pre-populate win-rate overrides.
     * @param {string} ownDeck - Deck name to filter by (case-insensitive, partial match allowed)
     * @param {number} [minGames=3] - Minimum games required to include an opponent
     * @returns {{ [opponentArchetype: string]: { wins, losses, ties, total, winRate } }}
     */
    function getBattleJournalWinRates(ownDeck, minGames, options) {
        minGames = minGames || 1;
        const excludeBricks = (options && options.excludeBricks) || false;
        // Strict-but-apostrophe-robust match: the journal entry's ownDeck
        // must equal the selected deck after normalizing out whitespace,
        // hyphens and every common apostrophe variant. Prior loose
        // startsWith match leaked data between similar names; a pure
        // lowercase+trim match missed legitimate hits when the journal
        // had "N's Zoroark" (U+0027) but the UI selected "N's Zoroark"
        // (U+2019) from the online share list.
        function _normDeck(s) {
            return String(s || '').toLowerCase()
                .replace(/[\s\-\u0027\u2018\u2019\u201B\u0060\u00B4\u02BC]/g, '');
        }
        const normOwn = _normDeck(ownDeck);
        if (!normOwn) return {};
        const all = Array.isArray(journalHistoryCache) ? journalHistoryCache : [];
        const matchups = {};
        all.forEach(function(e) {
            if (!e || !e.opponentArchetype) return;
            if (excludeBricks && e.brick) return;
            if (_normDeck(e.ownDeck) !== normOwn) return;
            const opp = e.opponentArchetype;
            if (!matchups[opp]) matchups[opp] = { wins: 0, losses: 0, ties: 0, total: 0 };
            matchups[opp].total++;
            if (e.result === 'win')       matchups[opp].wins++;
            else if (e.result === 'loss') matchups[opp].losses++;
            else                          matchups[opp].ties++;
        });
        const result = {};
        Object.keys(matchups).forEach(function(opp) {
            var m = matchups[opp];
            if (m.total >= minGames) {
                result[opp] = {
                    wins: m.wins, losses: m.losses, ties: m.ties, total: m.total,
                    winRate: Math.round((m.wins / m.total) * 100),
                };
            }
        });
        return result;
    }
    window.getBattleJournalWinRates = getBattleJournalWinRates;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBattleJournal, { once: true });
    } else {
        initBattleJournal();
    }
})();