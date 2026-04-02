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
            ownDeck: String(draft?.ownDeck || '').trim(),
            opponentArchetype: String(draft?.opponentArchetype || '').trim(),
            bestOf: String(draft?.bestOf || '').trim(),
            turnOrder: String(draft?.turnOrder || '').trim(),
            result: String(draft?.result || '').trim(),
            bo3Games: Array.isArray(draft?.bo3Games)
                ? draft.bo3Games.slice(0, 3).map(game => ({
                    turnOrder: String(game?.turnOrder || '').trim(),
                    result: String(game?.result || '').trim()
                }))
                : []
        };

        const hasBo3Details = safeDraft.bo3Games.some(game => game.turnOrder || game.result);
        if (!safeDraft.ownDeck && !safeDraft.opponentArchetype && !safeDraft.bestOf && !safeDraft.turnOrder && !safeDraft.result && !hasBo3Details) {
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
            ownDeckValue: document.getElementById('battleJournalOwnDeckValue'),
            ownDeckList: document.getElementById('battleJournalOwnDeckList'),
            opponentValue: document.getElementById('battleJournalOpponentValue'),
            opponentList: document.getElementById('battleJournalOpponentList'),
            bestOfInput: document.getElementById('battleJournalBestOf'),
            turnOrderInput: document.getElementById('battleJournalTurnOrder'),
            resultInput: document.getElementById('battleJournalResult'),
            bo3Details: document.getElementById('battleJournalBo3Details'),
            bo3Game1Turn: document.getElementById('battleJournalBo3Game1Turn'),
            bo3Game1Result: document.getElementById('battleJournalBo3Game1Result'),
            bo3Game2Turn: document.getElementById('battleJournalBo3Game2Turn'),
            bo3Game2Result: document.getElementById('battleJournalBo3Game2Result'),
            bo3Game3Turn: document.getElementById('battleJournalBo3Game3Turn'),
            bo3Game3Result: document.getElementById('battleJournalBo3Game3Result'),
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
        return Array.from(select.querySelectorAll('option')).map(option => String(option.value || '').trim()).filter(Boolean);
    }

    function getBattleJournalSavedDeckNames() {
        return Array.isArray(window.userDecks)
            ? window.userDecks.map(deck => String(deck?.name || '').trim()).filter(Boolean)
            : [];
    }

    function uniqueSorted(values) {
        return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
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
            .filter(item => !!item.value)
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

        const ownValue = String(els.ownDeckValue?.value || draft.ownDeck || getBattleJournalCurrentOwnDeck() || allOwnDeckChoices[0] || '');
        if (els.ownDeckValue && !els.ownDeckValue.value && ownValue) els.ownDeckValue.value = ownValue;

        const opponentValue = String(els.opponentValue?.value || draft.opponentArchetype || allOpponentChoices[0] || '');
        if (els.opponentValue && !els.opponentValue.value && opponentValue) els.opponentValue.value = opponentValue;
    }

    function getBo3GameDetails() {
        const els = battleJournalElements();
        return [
            { turnOrder: String(els.bo3Game1Turn?.value || '').trim(), result: String(els.bo3Game1Result?.value || '').trim() },
            { turnOrder: String(els.bo3Game2Turn?.value || '').trim(), result: String(els.bo3Game2Result?.value || '').trim() },
            { turnOrder: String(els.bo3Game3Turn?.value || '').trim(), result: String(els.bo3Game3Result?.value || '').trim() }
        ];
    }

    function applyBo3GameDetails(details) {
        const els = battleJournalElements();
        const games = Array.isArray(details) ? details : [];
        const safeGet = (idx, key) => String(games[idx]?.[key] || '').trim();

        if (els.bo3Game1Turn) els.bo3Game1Turn.value = safeGet(0, 'turnOrder');
        if (els.bo3Game1Result) els.bo3Game1Result.value = safeGet(0, 'result');
        if (els.bo3Game2Turn) els.bo3Game2Turn.value = safeGet(1, 'turnOrder');
        if (els.bo3Game2Result) els.bo3Game2Result.value = safeGet(1, 'result');
        if (els.bo3Game3Turn) els.bo3Game3Turn.value = safeGet(2, 'turnOrder');
        if (els.bo3Game3Result) els.bo3Game3Result.value = safeGet(2, 'result');
    }

    function toggleBo3Details() {
        const els = battleJournalElements();
        if (!els.bo3Details || !els.bestOfInput) return;
        const show = String(els.bestOfInput.value || '') === 'bo3';
        els.bo3Details.classList.toggle('d-none', !show);
    }

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
                const title = `${entry.ownDeck || 'Deck'} vs ${entry.opponentArchetype || 'Opponent'}`;
                const bo3Text = entry.bestOf === 'bo3' && Array.isArray(entry.bo3Games) && entry.bo3Games.length === 3
                    ? ` · G1:${entry.bo3Games[0].turnOrder || '-'}-${entry.bo3Games[0].result || '-'} G2:${entry.bo3Games[1].turnOrder || '-'}-${entry.bo3Games[1].result || '-'} G3:${entry.bo3Games[2].turnOrder || '-'}-${entry.bo3Games[2].result || '-'}`
                    : '';
                return `
                    <div class="battle-journal-pending-item">
                        <div class="battle-journal-pending-main">
                            <div class="battle-journal-pending-title">${escapeHtml(title)}</div>
                            <div class="battle-journal-pending-meta">${escapeHtml(bestOfText)} · ${escapeHtml(turnText)}${escapeHtml(bo3Text)} · ${new Date(entry.createdAtMs || Date.now()).toLocaleString(getLang() === 'de' ? 'de-DE' : 'en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                        </div>
                        <span class="battle-journal-result-pill ${resultClass}">${escapeHtml(resultText)}</span>
                    </div>
                `;
            })
            .join('');
    }

    function setBattleJournalChoice(field, value) {
        const els = battleJournalElements();
        const normalized = String(value || '').trim();

        if (field === 'turnOrder' && els.turnOrderInput) {
            els.turnOrderInput.value = normalized;
            document.querySelectorAll('.battle-journal-choice[data-field="turnOrder"]').forEach(button => {
                button.classList.toggle('is-selected', button.dataset.value === normalized);
            });
        } else if (field === 'result' && els.resultInput) {
            els.resultInput.value = normalized;
            document.querySelectorAll('.battle-journal-choice[data-field="result"]').forEach(button => {
                button.classList.toggle('is-selected', button.dataset.value === normalized);
            });
        } else if (field === 'bestOf' && els.bestOfInput) {
            els.bestOfInput.value = normalized;
            document.querySelectorAll('.battle-journal-choice[data-field="bestOf"]').forEach(button => {
                button.classList.toggle('is-selected', button.dataset.value === normalized);
            });
            toggleBo3Details();
        } else if (field === 'ownDeck' && els.ownDeckValue) {
            els.ownDeckValue.value = normalized;
        } else if (field === 'opponentArchetype' && els.opponentValue) {
            els.opponentValue.value = normalized;
        }

        persistBattleJournalDraftFromForm();
    }

    function getBattleJournalFormValues() {
        const els = battleJournalElements();
        return {
            ownDeck: String(els.ownDeckValue?.value || '').trim(),
            opponentArchetype: String(els.opponentValue?.value || '').trim(),
            bestOf: String(els.bestOfInput?.value || '').trim(),
            turnOrder: String(els.turnOrderInput?.value || '').trim(),
            result: String(els.resultInput?.value || '').trim(),
            bo3Games: getBo3GameDetails()
        };
    }

    function persistBattleJournalDraftFromForm() {
        saveBattleJournalDraft(getBattleJournalFormValues());
    }

    function applyBattleJournalDraft() {
        const els = battleJournalElements();
        const draft = getBattleJournalDraft();
        const fallbackDeck = getBattleJournalCurrentOwnDeck();
        if (els.ownDeckValue) els.ownDeckValue.value = draft.ownDeck || fallbackDeck || '';
        if (els.opponentValue) els.opponentValue.value = draft.opponentArchetype || '';
        if (els.bestOfInput) els.bestOfInput.value = draft.bestOf || '';
        if (els.turnOrderInput) els.turnOrderInput.value = draft.turnOrder || '';
        if (els.resultInput) els.resultInput.value = draft.result || '';
        applyBo3GameDetails(draft.bo3Games || []);

        renderDeckChoices();
        setBattleJournalChoice('bestOf', draft.bestOf || '');
        setBattleJournalChoice('turnOrder', draft.turnOrder || '');
        setBattleJournalChoice('result', draft.result || '');
    }

    function resetBattleJournalForm() {
        const els = battleJournalElements();
        if (els.form) els.form.reset();
        if (els.ownDeckValue) els.ownDeckValue.value = getBattleJournalCurrentOwnDeck() || '';
        if (els.opponentValue) els.opponentValue.value = '';
        if (els.bestOfInput) els.bestOfInput.value = '';
        if (els.turnOrderInput) els.turnOrderInput.value = '';
        if (els.resultInput) els.resultInput.value = '';
        applyBo3GameDetails([]);
        document.querySelectorAll('.battle-journal-choice').forEach(button => button.classList.remove('is-selected'));
        toggleBo3Details();
        renderDeckChoices();
        saveBattleJournalDraft({ ownDeck: getBattleJournalCurrentOwnDeck() || '' });
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
        if (!values.turnOrder) {
            showToast(battleJournalText('bj.validationTurnOrder', 'Please choose whether you went first or second.'), 'warning');
            return false;
        }
        if (!values.result) {
            showToast(battleJournalText('bj.validationResult', 'Please choose the match result.'), 'warning');
            return false;
        }
        if (values.bestOf === 'bo3') {
            const hasInvalidBo3Game = (values.bo3Games || []).some(game => !game.turnOrder || !game.result);
            if (hasInvalidBo3Game) {
                showToast('Please fill Going and Result for all 3 BO3 games.', 'warning');
                return false;
            }
        }
        return true;
    }

    function buildBattleJournalEntry(values) {
        const activeTab = getBattleJournalActiveTab();
        const sourceArchetype = getBattleJournalCurrentOwnDeck();
        return {
            id: `bj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            ownDeck: values.ownDeck,
            opponentArchetype: values.opponentArchetype,
            bestOf: values.bestOf || 'bo1',
            turnOrder: values.turnOrder,
            result: values.result,
            bo3Games: values.bestOf === 'bo3' ? (values.bo3Games || []) : [],
            createdAtMs: Date.now(),
            sourceTab: activeTab,
            sourceArchetype,
            userId: window.auth?.currentUser?.uid || null,
            schemaVersion: 2
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
            schemaVersion: entry.schemaVersion || 2
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

        if (els.ownDeckValue) {
            els.ownDeckValue.addEventListener('input', () => persistBattleJournalDraftFromForm());
        }
        if (els.opponentValue) {
            els.opponentValue.addEventListener('input', () => persistBattleJournalDraftFromForm());
        }
        [els.bo3Game1Turn, els.bo3Game1Result, els.bo3Game2Turn, els.bo3Game2Result, els.bo3Game3Turn, els.bo3Game3Result]
            .filter(Boolean)
            .forEach(el => el.addEventListener('change', () => persistBattleJournalDraftFromForm()));

        toggleBo3Details();

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