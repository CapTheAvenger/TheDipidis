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
                    result: String(game?.result || '').trim()
                }))
                : (Array.isArray(draft?.bo3Games)
                    ? draft.bo3Games.slice(0, 3).map(game => ({
                        turnOrder: String(game?.turnOrder || '').trim(),
                        result: String(game?.result || '').trim()
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
            statusBadge: document.getElementById('battleJournalStatusBadge'),
            pendingCount: document.getElementById('battleJournalPendingCount'),
            pendingList: document.getElementById('battleJournalPendingList'),
            fabBadge: document.getElementById('battleJournalFabBadge'),
            profilePending: document.getElementById('battleJournalProfilePending'),
            profileState: document.getElementById('battleJournalProfileState'),
            saveFx: document.getElementById('battleJournalSaveFx'),
            themeToggle: document.getElementById('battleJournalThemeToggle')
        };
    }

    function getBattleJournalActiveTab() {
        return document.querySelector('.tab-content.active')?.id || null;
    }

    function getBattleJournalCurrentOwnDeck() {
        const activeTab = getBattleJournalActiveTab();
        if (activeTab === 'city-league' || activeTab === 'city-league-analysis') return String(window.currentCityLeagueArchetype || '').trim();
        if (activeTab === 'current-meta' || activeTab === 'current-analysis') return String(window.currentCurrentMetaArchetype || '').trim();
        if (activeTab === 'past-meta') return String(window.pastMetaCurrentArchetype || '').trim();
        return String(window.currentCurrentMetaArchetype || window.currentCityLeagueArchetype || window.pastMetaCurrentArchetype || '').trim();
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
        return uniqueSorted([
            ...getValuesFromSelect('currentMetaDeckSelect'),
            ...getValuesFromSelect('cityLeagueDeckSelect'),
            ...getValuesFromSelect('pastMetaDeckSelect')
        ]).slice(0, 64);
    }

    function renderDeckChoices() {
        const els = battleJournalElements();
        const draft = getBattleJournalDraft();
        const allOwnDeckChoices = uniqueSorted([
            getBattleJournalCurrentOwnDeck(),
            ...getBattleJournalSavedDeckNames(),
            ...getValuesFromSelect('currentMetaDeckSelect'),
            ...getValuesFromSelect('cityLeagueDeckSelect')
        ]);

        if (els.ownDeckList) {
            els.ownDeckList.innerHTML = allOwnDeckChoices
                .slice(0, 120)
                .map(name => `<option value="${escapeHtml(name)}"></option>`)
                .join('');
        }

        const allOpponentChoices = uniqueSorted([
            ...getTopOpponentChoices(),
            ...getExtendedOpponentChoices()
        ]);

        if (els.opponentList) {
            els.opponentList.innerHTML = allOpponentChoices
                .slice(0, 160)
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

        let html = `<span class="battle-journal-label">${escapeHtml(headerLabel)}</span>`;
        for (let i = 1; i <= count; i++) {
            html += `
                <div class="battle-journal-bo3-row">
                    <span class="battle-journal-bo3-game">Game ${i}</span>
                    <select id="battleJournalGame${i}Turn" class="battle-journal-input">
                        <option value="">${escapeHtml(goingLabel)}</option>
                        <option value="first">${escapeHtml(firstLabel)}</option>
                        <option value="second">${escapeHtml(secondLabel)}</option>
                    </select>
                    <select id="battleJournalGame${i}Result" class="battle-journal-input">
                        <option value="">${escapeHtml(resultLabel)}</option>
                        <option value="win">${escapeHtml(winLabel)}</option>
                        <option value="loss">${escapeHtml(lossLabel)}</option>
                        <option value="tie">${escapeHtml(tieLabel)}</option>
                    </select>
                </div>`;
        }
        els.gameDetails.innerHTML = html;

        // Bind change events for draft persistence
        els.gameDetails.querySelectorAll('select').forEach(sel => {
            sel.addEventListener('change', () => persistBattleJournalDraftFromForm());
        });
    }

    function getGameDetails() {
        const count = getGameCount();
        const games = [];
        for (let i = 1; i <= count; i++) {
            const turnEl = document.getElementById(`battleJournalGame${i}Turn`);
            const resultEl = document.getElementById(`battleJournalGame${i}Result`);
            games.push({
                turnOrder: String(turnEl?.value || '').trim(),
                result: String(resultEl?.value || '').trim()
            });
        }
        return games;
    }

    function applyGameDetails(details) {
        const count = getGameCount();
        const games = Array.isArray(details) ? details : [];
        for (let i = 1; i <= count; i++) {
            const turnEl = document.getElementById(`battleJournalGame${i}Turn`);
            const resultEl = document.getElementById(`battleJournalGame${i}Result`);
            if (turnEl) turnEl.value = String(games[i - 1]?.turnOrder || '').trim();
            if (resultEl) resultEl.value = String(games[i - 1]?.result || '').trim();
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
        document.querySelectorAll('.battle-journal-choice').forEach(button => button.classList.remove('is-selected'));
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
        return {
            id: `bj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            tournamentName: values.tournamentName || '',
            ownDeck: values.ownDeck,
            opponentArchetype: values.opponentArchetype,
            bestOf: values.bestOf || 'bo1',
            turnOrder: derived.turnOrder,
            result: derived.result,
            bo3Games: games,
            createdAtMs: Date.now(),
            sourceTab: activeTab,
            sourceArchetype,
            userId: window.auth?.currentUser?.uid || null,
            schemaVersion: 3
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
                ? battleJournalText('bj.themeLight', '☀️ Light')
                : battleJournalText('bj.themeDark', '🌙 Dark');
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
            ownDeck: entry.ownDeck,
            opponentArchetype: entry.opponentArchetype,
            bestOf: entry.bestOf || 'bo1',
            turnOrder: entry.turnOrder,
            result: entry.result,
            bo3Games: Array.isArray(entry.bo3Games) ? entry.bo3Games : [],
            sourceTab: entry.sourceTab || null,
            sourceArchetype: entry.sourceArchetype || null,
            createdAtMs: entry.createdAtMs,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            syncedAt: firebase.firestore.FieldValue.serverTimestamp(),
            schemaVersion: entry.schemaVersion || 3
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
        outbox.push(buildBattleJournalEntry(values));
        saveBattleJournalOutbox(outbox);
        localStorage.removeItem(BATTLE_JOURNAL_DRAFT_KEY);
        resetBattleJournalForm();
        playSaveFeedback();

        if (navigator.onLine && window.auth?.currentUser) {
            showToast(battleJournalText('bj.savedAndSyncing', 'Entry saved. Sync starting...'), 'success');
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
        applyBattleJournalDraft();
        renderBattleJournalSummary();
        updateThemeVisual();
        els.overlay.classList.add('is-open');
        els.overlay.setAttribute('aria-hidden', 'false');
        document.body.classList.add('battle-journal-open');
    }

    function closeBattleJournalSheet() {
        const els = battleJournalElements();
        if (!els.overlay) return;
        persistBattleJournalDraftFromForm();
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

    window.openBattleJournalSheet = openBattleJournalSheet;
    window.closeBattleJournalSheet = closeBattleJournalSheet;
    window.submitBattleJournalEntry = submitBattleJournalEntry;
    window.setBattleJournalChoice = setBattleJournalChoice;
    window.clearBattleJournalDraft = clearBattleJournalDraft;
    window.flushBattleJournalOutbox = flushBattleJournalOutbox;
    window.renderBattleJournalSummary = renderBattleJournalSummary;
    window.toggleBattleJournalTheme = toggleBattleJournalTheme;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBattleJournal, { once: true });
    } else {
        initBattleJournal();
    }
})();