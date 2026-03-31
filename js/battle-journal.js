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
            result: String(draft?.result || '').trim()
        };

        if (!safeDraft.ownDeck && !safeDraft.opponentArchetype && !safeDraft.bestOf && !safeDraft.turnOrder && !safeDraft.result) {
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
            ownDeckSearch: document.getElementById('battleJournalOwnDeckSearch'),
            opponentValue: document.getElementById('battleJournalOpponentValue'),
            opponentSearch: document.getElementById('battleJournalOpponentSearch'),
            ownDeckChoices: document.getElementById('battleJournalOwnDeckChoices'),
            opponentChoices: document.getElementById('battleJournalOpponentChoices'),
            opponentExtended: document.getElementById('battleJournalOpponentExtended'),
            bestOfInput: document.getElementById('battleJournalBestOf'),
            turnOrderInput: document.getElementById('battleJournalTurnOrder'),
            resultInput: document.getElementById('battleJournalResult'),
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
        const top = new Set(getTopOpponentChoices().map(name => name.toLowerCase()));
        return uniqueSorted([
            ...getValuesFromSelect('currentMetaDeckSelect'),
            ...getValuesFromSelect('cityLeagueDeckSelect'),
            ...getValuesFromSelect('pastMetaDeckSelect')
        ]).filter(name => !top.has(name.toLowerCase())).slice(0, 32);
    }

    function renderTapGrid(container, field, choices, selectedValue) {
        if (!container) return;
        container.innerHTML = choices
            .map(value => {
                const safeValue = escapeHtml(value);
                const isSelected = String(selectedValue || '') === value;
                return `<button type="button" class="battle-journal-tap-card ${isSelected ? 'is-selected' : ''}" data-field="${escapeHtml(field)}" data-value="${safeValue}">${safeValue}</button>`;
            })
            .join('');

        container.querySelectorAll('.battle-journal-tap-card').forEach(button => {
            button.addEventListener('click', () => {
                setBattleJournalChoice(field, String(button.dataset.value || ''));
            });
        });
    }

    function filterChoicesBySearch(choices, searchTerm) {
        if (!searchTerm) return choices;
        const lower = searchTerm.toLowerCase();
        return choices.filter(name => name.toLowerCase().includes(lower));
    }

    function getAllOpponentChoices() {
        return uniqueSorted([
            ...getTopOpponentChoices(),
            ...getExtendedOpponentChoices()
        ]);
    }

    function renderOpponentChoices(selectedValue) {
        const els = battleJournalElements();
        const searchTerm = String(els.opponentSearch?.value || '').trim();
        const top = getTopOpponentChoices();
        const selected = String(selectedValue || '');

        if (searchTerm) {
            const allChoices = getAllOpponentChoices();
            const filtered = filterChoicesBySearch(allChoices, searchTerm);
            renderTapGrid(els.opponentChoices, 'opponentArchetype', filtered, selected);
            if (els.opponentExtended) {
                els.opponentExtended.classList.add('d-none');
                els.opponentExtended.innerHTML = '';
            }
            return;
        }

        const showExtended = selected && !top.includes(selected);
        const topChoices = [...top, battleJournalText('bj.otherDeck', 'Other...')];
        renderTapGrid(els.opponentChoices, 'opponentArchetype', topChoices, showExtended ? battleJournalText('bj.otherDeck', 'Other...') : selected);

        if (!els.opponentExtended) return;
        if (showExtended) {
            els.opponentExtended.classList.remove('d-none');
            renderTapGrid(els.opponentExtended, 'opponentArchetype', getExtendedOpponentChoices(), selected);
        } else {
            els.opponentExtended.classList.add('d-none');
            els.opponentExtended.innerHTML = '';
        }
    }

    function renderDeckChoices() {
        const els = battleJournalElements();
        const draft = getBattleJournalDraft();
        const searchTerm = String(els.ownDeckSearch?.value || '').trim();
        const allOwnDeckChoices = uniqueSorted([
            getBattleJournalCurrentOwnDeck(),
            ...getBattleJournalSavedDeckNames(),
            ...getValuesFromSelect('currentMetaDeckSelect'),
            ...getValuesFromSelect('cityLeagueDeckSelect')
        ]);
        const ownDeckChoices = searchTerm
            ? filterChoicesBySearch(allOwnDeckChoices, searchTerm)
            : allOwnDeckChoices.slice(0, 12);

        const ownValue = String(els.ownDeckValue?.value || draft.ownDeck || getBattleJournalCurrentOwnDeck() || ownDeckChoices[0] || '');
        if (els.ownDeckValue && !els.ownDeckValue.value && ownValue) els.ownDeckValue.value = ownValue;
        renderTapGrid(els.ownDeckChoices, 'ownDeck', ownDeckChoices, ownValue);

        const opponentValue = String(els.opponentValue?.value || draft.opponentArchetype || '');
        renderOpponentChoices(opponentValue);
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
            els.pendingList.innerHTML = `<div class="battle-journal-empty-state">${escapeHtml(battleJournalText('bj.emptyState', 'No pending entries.'))}</div>`;
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
                return `
                    <div class="battle-journal-pending-item">
                        <div class="battle-journal-pending-main">
                            <div class="battle-journal-pending-title">${escapeHtml(title)}</div>
                            <div class="battle-journal-pending-meta">${escapeHtml(bestOfText)} · ${escapeHtml(turnText)} · ${new Date(entry.createdAtMs || Date.now()).toLocaleString(getLang() === 'de' ? 'de-DE' : 'en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
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
        } else if (field === 'ownDeck' && els.ownDeckValue) {
            els.ownDeckValue.value = normalized;
            if (els.ownDeckSearch) els.ownDeckSearch.value = '';
            renderDeckChoices();
        } else if (field === 'opponentArchetype' && els.opponentValue) {
            const otherLabel = battleJournalText('bj.otherDeck', 'Other...');
            if (normalized === otherLabel) {
                renderOpponentChoices(String(els.opponentValue.value || ''));
            } else {
                els.opponentValue.value = normalized;
                renderOpponentChoices(normalized);
            }
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
            result: String(els.resultInput?.value || '').trim()
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
        if (els.ownDeckSearch) els.ownDeckSearch.value = '';
        if (els.opponentSearch) els.opponentSearch.value = '';

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
        if (els.ownDeckSearch) els.ownDeckSearch.value = '';
        if (els.opponentSearch) els.opponentSearch.value = '';
        document.querySelectorAll('.battle-journal-choice').forEach(button => button.classList.remove('is-selected'));
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

        if (els.ownDeckSearch) {
            els.ownDeckSearch.addEventListener('input', debounce(() => renderDeckChoices(), 250));
        }
        if (els.opponentSearch) {
            els.opponentSearch.addEventListener('input', debounce(() => {
                const opponentValue = String(els.opponentValue?.value || '');
                renderOpponentChoices(opponentValue);
            }, 250));
        }

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