// ============================================================
// Testing Groups — collaborative meta editing
// ============================================================
// Owner creates a group, invites testers by email. Members share an
// editable matchup table + deck-share estimates. Changes are logged.
// Data can be loaded into the user's local MetaCall for personal use.
//
// Firestore schema:
//   /testingGroups/{groupId}
//     { name, description, ownerUid, createdAt, updatedAt,
//       memberUids: [uid, ...],  ← enables "array-contains" query
//       members: { [uid]: { role, displayName, email, joinedAt } },
//       data: { decks, quantity, matchups } }
//   /testingGroups/{groupId}/activity/{autoId}
//     { uid, displayName, timestamp, action, field, oldValue, newValue }
//   /publicProfiles/{uid}
//     { email, displayName }       ← lookup table for "invite by email"
//
// See FIRESTORE_RULES.md for the matching security rules.
// ============================================================

window.TestingGroups = (function () {
  'use strict';

  // ── State ────────────────────────────────────────────────
  let _myGroups         = [];     // {id, name, role, ownerUid}
  let _currentGroupId   = null;   // id of the opened group
  let _currentGroup     = null;   // full group doc
  let _currentRole      = null;   // 'owner' | 'editor' | 'viewer' | null
  let _pollTimer        = null;   // refresh-every-30s handle
  let _bootstrapData    = null;   // lazy-loaded testing_group_bootstrap.json
  let _saveTimers       = {};     // per-field debounce timers

  const POLL_INTERVAL_MS = 30000;
  const SAVE_DEBOUNCE_MS = 600;

  // ── Firestore helpers ────────────────────────────────────

  function _db() {
    if (!window.db || typeof window.db.collection !== 'function') {
      console.warn('[TestingGroups] Firestore not available');
      return null;
    }
    return window.db;
  }

  function _currentUser() {
    return window.auth && window.auth.currentUser;
  }

  function _fsNow() {
    return firebase.firestore.FieldValue.serverTimestamp();
  }

  // Make sure the logged-in user has a publicProfiles/{uid} entry so
  // other users can find them by email when adding to a group.
  async function _ensurePublicProfile() {
    const u = _currentUser();
    const db = _db();
    if (!u || !db) return;
    const ref = db.collection('publicProfiles').doc(u.uid);
    try {
      const snap = await ref.get();
      const data = {
        email       : (u.email || '').toLowerCase(),
        displayName : u.displayName || u.email || 'Anonymous',
        updatedAt   : _fsNow(),
      };
      if (!snap.exists) data.createdAt = _fsNow();
      await ref.set(data, { merge: true });
    } catch (err) {
      console.warn('[TestingGroups] ensurePublicProfile failed', err);
    }
  }

  async function _lookupUidByEmail(email) {
    const db = _db();
    if (!db || !email) return null;
    const q = await db.collection('publicProfiles')
      .where('email', '==', email.toLowerCase().trim())
      .limit(1).get();
    if (q.empty) return null;
    const doc = q.docs[0];
    return { uid: doc.id, ...doc.data() };
  }

  async function _loadBootstrap() {
    if (_bootstrapData) return _bootstrapData;
    try {
      const resp = await fetch('data/testing_group_bootstrap.json?t=' + Date.now());
      if (!resp.ok) throw new Error('bootstrap fetch failed');
      _bootstrapData = await resp.json();
    } catch (err) {
      console.warn('[TestingGroups] bootstrap load failed, using empty', err);
      _bootstrapData = { decks: [], quantity: {}, matchups: {} };
    }
    return _bootstrapData;
  }

  // ── CRUD ─────────────────────────────────────────────────

  async function createGroup(name, description) {
    await _ensurePublicProfile();
    const u = _currentUser();
    const db = _db();
    if (!u || !db) { alert(t('tg.errNotLoggedIn')); return null; }
    if (!name || !name.trim()) { alert(t('tg.errNameRequired')); return null; }

    const boot = await _loadBootstrap();
    const doc = {
      name: name.trim(),
      description: (description || '').trim(),
      ownerUid: u.uid,
      createdAt: _fsNow(),
      updatedAt: _fsNow(),
      memberUids: [u.uid],
      members: {
        [u.uid]: {
          role: 'owner',
          displayName: u.displayName || u.email || 'Owner',
          email: (u.email || '').toLowerCase(),
          joinedAt: Date.now(),
        },
      },
      data: {
        decks:   [...(boot.decks || [])],
        quantity:{...(boot.quantity || {})},
        matchups:JSON.parse(JSON.stringify(boot.matchups || {})),
      },
    };

    try {
      const ref = await db.collection('testingGroups').add(doc);
      await _logActivity(ref.id, 'group_created', null, null, name.trim());
      await loadMyGroups();
      return ref.id;
    } catch (err) {
      console.error('[TestingGroups] createGroup failed', err);
      alert(t('tg.errCreate') + '\n' + (err.message || err));
      return null;
    }
  }

  async function deleteGroup(groupId) {
    const db = _db();
    if (!db || !groupId) return;
    if (!confirm(t('tg.confirmDelete'))) return;
    try {
      await db.collection('testingGroups').doc(groupId).delete();
      if (_currentGroupId === groupId) {
        _currentGroupId = null;
        _currentGroup   = null;
        _currentRole    = null;
      }
      await loadMyGroups();
      renderAll();
    } catch (err) {
      console.error('[TestingGroups] deleteGroup failed', err);
      alert(t('tg.errDelete') + '\n' + (err.message || err));
    }
  }

  async function loadMyGroups() {
    const u = _currentUser();
    const db = _db();
    if (!u || !db) { _myGroups = []; return _myGroups; }
    try {
      const snap = await db.collection('testingGroups')
        .where('memberUids', 'array-contains', u.uid)
        .get();
      _myGroups = snap.docs.map(d => {
        const data = d.data() || {};
        const mem  = (data.members && data.members[u.uid]) || {};
        return {
          id: d.id,
          name: data.name || '(unnamed)',
          description: data.description || '',
          ownerUid: data.ownerUid,
          role: mem.role || 'viewer',
          memberCount: (data.memberUids || []).length,
          updatedAt: data.updatedAt,
        };
      });
      // Owner groups first, then by name
      _myGroups.sort((a, b) => {
        if ((a.role === 'owner') !== (b.role === 'owner')) return a.role === 'owner' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      return _myGroups;
    } catch (err) {
      console.error('[TestingGroups] loadMyGroups failed', err);
      _myGroups = [];
      return _myGroups;
    }
  }

  async function openGroup(groupId) {
    const u = _currentUser();
    const db = _db();
    if (!u || !db || !groupId) return;
    try {
      const snap = await db.collection('testingGroups').doc(groupId).get();
      if (!snap.exists) { alert(t('tg.errNotFound')); return; }
      const data = snap.data() || {};
      if (!(data.memberUids || []).includes(u.uid)) {
        alert(t('tg.errNotMember'));
        return;
      }
      _currentGroupId = groupId;
      _currentGroup   = { id: snap.id, ...data };
      _currentRole    = (data.members && data.members[u.uid] && data.members[u.uid].role) || 'viewer';
      _startPolling();
      renderAll();
    } catch (err) {
      console.error('[TestingGroups] openGroup failed', err);
      alert(t('tg.errOpen') + '\n' + (err.message || err));
    }
  }

  function closeGroup() {
    _stopPolling();
    _currentGroupId = null;
    _currentGroup   = null;
    _currentRole    = null;
    renderAll();
  }

  async function _refreshCurrentGroup() {
    if (!_currentGroupId) return;
    const db = _db();
    if (!db) return;
    try {
      const snap = await db.collection('testingGroups').doc(_currentGroupId).get();
      if (!snap.exists) return;
      _currentGroup = { id: snap.id, ...snap.data() };
      _renderGroupDetail();
    } catch (err) {
      console.warn('[TestingGroups] refresh failed', err);
    }
  }

  function _startPolling() {
    _stopPolling();
    _pollTimer = setInterval(_refreshCurrentGroup, POLL_INTERVAL_MS);
  }
  function _stopPolling() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  }

  // ── Edits ────────────────────────────────────────────────

  function _canEdit() {
    return _currentRole === 'owner' || _currentRole === 'editor';
  }

  async function _logActivity(groupId, action, field, oldValue, newValue) {
    const u = _currentUser();
    const db = _db();
    if (!u || !db || !groupId) return;
    try {
      await db.collection('testingGroups').doc(groupId)
        .collection('activity').add({
          uid: u.uid,
          displayName: u.displayName || u.email || 'Unknown',
          timestamp: _fsNow(),
          action, field,
          oldValue: (oldValue === undefined) ? null : oldValue,
          newValue: (newValue === undefined) ? null : newValue,
        });
    } catch (err) {
      console.warn('[TestingGroups] logActivity failed', err);
    }
  }

  // Queue a debounced save for a single matchup cell.
  function onMatchupEdit(deck, opp, rawValue) {
    if (!_canEdit() || !_currentGroupId || !_currentGroup) return;
    const val = _parsePct(rawValue);
    if (val === null) return;

    const prev = ((_currentGroup.data || {}).matchups || {})[deck] || {};
    const oldValue = prev[opp];
    if (oldValue === val) return;

    // Optimistic local update
    if (!_currentGroup.data) _currentGroup.data = {};
    if (!_currentGroup.data.matchups) _currentGroup.data.matchups = {};
    if (!_currentGroup.data.matchups[deck]) _currentGroup.data.matchups[deck] = {};
    _currentGroup.data.matchups[deck][opp] = val;
    _updateWinrateRow(); // re-calc aggregate winrates row

    const key = `matchup:${deck}:${opp}`;
    clearTimeout(_saveTimers[key]);
    _saveTimers[key] = setTimeout(() => _commitMatchup(deck, opp, oldValue, val), SAVE_DEBOUNCE_MS);
  }

  async function _commitMatchup(deck, opp, oldValue, newValue) {
    const db = _db();
    if (!db || !_currentGroupId) return;
    try {
      const path = `data.matchups.${_fsKey(deck)}.${_fsKey(opp)}`;
      await db.collection('testingGroups').doc(_currentGroupId).update({
        [path]: newValue,
        updatedAt: _fsNow(),
      });
      await _logActivity(_currentGroupId, 'matchup_update', `${deck} → ${opp}`, oldValue, newValue);
    } catch (err) {
      console.error('[TestingGroups] matchup save failed', err);
      alert(t('tg.errSave'));
    }
  }

  function onQuantityEdit(deck, rawValue) {
    if (!_canEdit() || !_currentGroupId || !_currentGroup) return;
    const val = _parsePct(rawValue);
    if (val === null) return;
    const prev = ((_currentGroup.data || {}).quantity || {})[deck];
    if (prev === val) return;
    if (!_currentGroup.data) _currentGroup.data = {};
    if (!_currentGroup.data.quantity) _currentGroup.data.quantity = {};
    _currentGroup.data.quantity[deck] = val;

    const key = `quantity:${deck}`;
    clearTimeout(_saveTimers[key]);
    _saveTimers[key] = setTimeout(() => _commitQuantity(deck, prev, val), SAVE_DEBOUNCE_MS);
  }

  async function _commitQuantity(deck, oldValue, newValue) {
    const db = _db();
    if (!db || !_currentGroupId) return;
    try {
      const path = `data.quantity.${_fsKey(deck)}`;
      await db.collection('testingGroups').doc(_currentGroupId).update({
        [path]: newValue,
        updatedAt: _fsNow(),
      });
      await _logActivity(_currentGroupId, 'quantity_update', deck, oldValue, newValue);
    } catch (err) {
      console.error('[TestingGroups] quantity save failed', err);
      alert(t('tg.errSave'));
    }
  }

  function _parsePct(v) {
    const n = parseFloat(String(v).replace(',', '.'));
    if (isNaN(n) || n < 0 || n > 100) return null;
    return Math.round(n * 100) / 100;
  }

  // Firestore field paths use . as separator, so escape dots in deck names.
  // Also quote names with spaces/special chars.
  function _fsKey(name) {
    return String(name).replace(/\./g, '_');
  }

  // ── Deck list management (owner-only for MVP) ────────────

  async function addDeck(deckName) {
    if (_currentRole !== 'owner') { alert(t('tg.errOwnerOnly')); return; }
    if (!deckName || !deckName.trim()) return;
    const name = deckName.trim();
    const db = _db();
    if (!db || !_currentGroupId) return;
    const g = _currentGroup;
    if (!g || !g.data) return;
    if ((g.data.decks || []).includes(name)) { alert(t('tg.errDeckExists')); return; }
    try {
      const newDecks = [...(g.data.decks || []), name];
      const newMatchups = { ...(g.data.matchups || {}) };
      newMatchups[name] = {};
      newDecks.forEach(d => { newMatchups[name][d] = 50; });
      Object.keys(newMatchups).forEach(d => {
        if (!newMatchups[d]) newMatchups[d] = {};
        newMatchups[d][name] = 50;
      });
      const newQuantity = { ...(g.data.quantity || {}), [name]: 0 };
      await db.collection('testingGroups').doc(_currentGroupId).update({
        'data.decks':    newDecks,
        'data.matchups': newMatchups,
        'data.quantity': newQuantity,
        updatedAt: _fsNow(),
      });
      await _logActivity(_currentGroupId, 'deck_added', name, null, name);
      await _refreshCurrentGroup();
    } catch (err) {
      console.error('[TestingGroups] addDeck failed', err);
      alert(t('tg.errSave'));
    }
  }

  async function removeDeck(deckName) {
    if (_currentRole !== 'owner') { alert(t('tg.errOwnerOnly')); return; }
    if (!confirm(t('tg.confirmRemoveDeck').replace('{name}', deckName))) return;
    const db = _db();
    if (!db || !_currentGroupId) return;
    const g = _currentGroup;
    if (!g || !g.data) return;
    try {
      const newDecks = (g.data.decks || []).filter(d => d !== deckName);
      const newMatchups = {};
      Object.keys(g.data.matchups || {}).forEach(d => {
        if (d === deckName) return;
        newMatchups[d] = {};
        Object.keys(g.data.matchups[d] || {}).forEach(o => {
          if (o !== deckName) newMatchups[d][o] = g.data.matchups[d][o];
        });
      });
      const newQuantity = { ...(g.data.quantity || {}) };
      delete newQuantity[deckName];
      await db.collection('testingGroups').doc(_currentGroupId).update({
        'data.decks':    newDecks,
        'data.matchups': newMatchups,
        'data.quantity': newQuantity,
        updatedAt: _fsNow(),
      });
      await _logActivity(_currentGroupId, 'deck_removed', deckName, deckName, null);
      await _refreshCurrentGroup();
    } catch (err) {
      console.error('[TestingGroups] removeDeck failed', err);
      alert(t('tg.errSave'));
    }
  }

  // ── Members ──────────────────────────────────────────────

  async function addMemberByEmail(email, role) {
    if (_currentRole !== 'owner') { alert(t('tg.errOwnerOnly')); return; }
    const clean = (email || '').trim().toLowerCase();
    if (!clean) return;
    role = (role === 'viewer' || role === 'editor') ? role : 'editor';
    const profile = await _lookupUidByEmail(clean);
    if (!profile) { alert(t('tg.errNoSuchUser').replace('{email}', clean)); return; }
    const db = _db();
    if (!db || !_currentGroupId) return;
    const g = _currentGroup;
    if ((g.memberUids || []).includes(profile.uid)) { alert(t('tg.errAlreadyMember')); return; }
    try {
      const newMembers = { ...(g.members || {}) };
      newMembers[profile.uid] = {
        role,
        displayName: profile.displayName || clean,
        email: clean,
        joinedAt: Date.now(),
      };
      await db.collection('testingGroups').doc(_currentGroupId).update({
        memberUids: [...(g.memberUids || []), profile.uid],
        members: newMembers,
        updatedAt: _fsNow(),
      });
      await _logActivity(_currentGroupId, 'member_added', clean, null, role);
      await _refreshCurrentGroup();
    } catch (err) {
      console.error('[TestingGroups] addMember failed', err);
      alert(t('tg.errSave'));
    }
  }

  async function changeMemberRole(uid, newRole) {
    if (_currentRole !== 'owner') return;
    if (!['editor', 'viewer'].includes(newRole)) return;
    const db = _db();
    if (!db || !_currentGroupId) return;
    try {
      const path = `members.${uid}.role`;
      await db.collection('testingGroups').doc(_currentGroupId).update({
        [path]: newRole,
        updatedAt: _fsNow(),
      });
      await _logActivity(_currentGroupId, 'role_changed', uid, null, newRole);
      await _refreshCurrentGroup();
    } catch (err) {
      console.error('[TestingGroups] changeRole failed', err);
      alert(t('tg.errSave'));
    }
  }

  async function removeMember(uid) {
    if (_currentRole !== 'owner') return;
    const g = _currentGroup;
    if (!g) return;
    if (uid === g.ownerUid) { alert(t('tg.errCantRemoveOwner')); return; }
    if (!confirm(t('tg.confirmRemoveMember'))) return;
    const db = _db();
    if (!db || !_currentGroupId) return;
    try {
      const newMembers = { ...(g.members || {}) };
      delete newMembers[uid];
      const newUids = (g.memberUids || []).filter(x => x !== uid);
      await db.collection('testingGroups').doc(_currentGroupId).update({
        members: newMembers,
        memberUids: newUids,
        updatedAt: _fsNow(),
      });
      await _logActivity(_currentGroupId, 'member_removed', uid, null, null);
      await _refreshCurrentGroup();
    } catch (err) {
      console.error('[TestingGroups] removeMember failed', err);
      alert(t('tg.errSave'));
    }
  }

  async function leaveGroup() {
    const u = _currentUser();
    const g = _currentGroup;
    if (!u || !g) return;
    if (u.uid === g.ownerUid) {
      alert(t('tg.errOwnerCantLeave'));
      return;
    }
    if (!confirm(t('tg.confirmLeave'))) return;
    const db = _db();
    if (!db || !_currentGroupId) return;
    try {
      const newMembers = { ...(g.members || {}) };
      delete newMembers[u.uid];
      const newUids = (g.memberUids || []).filter(x => x !== u.uid);
      await db.collection('testingGroups').doc(_currentGroupId).update({
        members: newMembers,
        memberUids: newUids,
        updatedAt: _fsNow(),
      });
      closeGroup();
      await loadMyGroups();
      renderAll();
    } catch (err) {
      console.error('[TestingGroups] leaveGroup failed', err);
      alert(t('tg.errSave'));
    }
  }

  // ── Export ───────────────────────────────────────────────

  function exportJson() {
    const g = _currentGroup;
    if (!g) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      name: g.name,
      description: g.description,
      data: g.data || {},
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `testing-group-${(g.name || 'export').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ── Load into MetaCall ───────────────────────────────────
  // Pushes this group's matchup + quantity data into the user's MetaCall
  // as custom decks + WR overrides. Owner decks outside top-12 become
  // custom decks; matchup WRs become per-opponent overrides for the
  // currently-selected deck in MetaCall.

  function loadIntoMetaCall() {
    const g = _currentGroup;
    if (!g || !g.data) return;
    if (typeof window.MetaCall === 'undefined') {
      alert(t('tg.errMetaCallMissing'));
      return;
    }
    if (!window.MetaCall._testingGroupLoad) {
      // Fallback: just copy to clipboard as JSON for now
      exportJson();
      alert(t('tg.metaCallNotReady'));
      return;
    }
    window.MetaCall._testingGroupLoad(g.data);
    alert(t('tg.loadedIntoMetaCall'));
  }

  // ── Rendering ────────────────────────────────────────────

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function _jsEsc(s) {
    return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  function renderAll() {
    const container = document.getElementById('profile-testinggroups');
    if (!container) return;
    if (!_currentUser()) {
      container.innerHTML = `<div class="tg-empty">${_esc(t('tg.signInRequired'))}</div>`;
      return;
    }
    if (!_currentGroupId) {
      _renderGroupList();
    } else {
      _renderGroupDetail();
    }
  }

  function _renderGroupList() {
    const container = document.getElementById('profile-testinggroups');
    if (!container) return;
    const list = _myGroups.map(g => `
      <div class="tg-list-item">
        <div class="tg-list-main">
          <div class="tg-list-name">${_esc(g.name)}</div>
          <div class="tg-list-meta">
            <span class="tg-role tg-role-${g.role}">${_esc(t('tg.role.' + g.role))}</span>
            · ${g.memberCount} ${_esc(t('tg.members'))}
            ${g.description ? '· ' + _esc(g.description) : ''}
          </div>
        </div>
        <button class="tg-btn tg-btn-primary" onclick="TestingGroups.openGroup('${_jsEsc(g.id)}')">
          ${_esc(t('tg.open'))}
        </button>
      </div>`).join('');

    const empty = _myGroups.length === 0
      ? `<p class="tg-empty">${_esc(t('tg.listEmpty'))}</p>` : '';

    container.innerHTML = `
<div class="tg-wrap">
  <div class="tg-header">
    <h2>${_esc(t('tg.title'))}</h2>
    <p class="color-grey">${_esc(t('tg.subtitle'))}</p>
  </div>
  <div class="tg-create-row">
    <input type="text" id="tg-new-name" class="tg-input" placeholder="${_esc(t('tg.newNamePh'))}" maxlength="60">
    <button class="tg-btn tg-btn-primary" onclick="TestingGroups._uiCreate()">+ ${_esc(t('tg.createBtn'))}</button>
  </div>
  <h3>${_esc(t('tg.myGroups'))}</h3>
  <div class="tg-list">${list}</div>
  ${empty}
</div>`;
  }

  function _uiCreate() {
    const inp = document.getElementById('tg-new-name');
    const name = inp ? inp.value : '';
    createGroup(name, '').then(id => {
      if (id) openGroup(id);
    });
  }

  function _renderGroupDetail() {
    const container = document.getElementById('profile-testinggroups');
    const g = _currentGroup;
    if (!container || !g) return;

    const decks   = (g.data && g.data.decks)   || [];
    const qty     = (g.data && g.data.quantity)|| {};
    const matrix  = (g.data && g.data.matchups)|| {};
    const readonly = !_canEdit();

    // Header row: deck names
    const headerCells = decks.map(d =>
      `<th class="tg-col-head" title="${_esc(d)}"><span>${_esc(d)}</span></th>`).join('');

    // Matchup rows
    const matrixRows = decks.map(rowDeck => {
      const cells = decks.map(colDeck => {
        const val = (matrix[rowDeck] || {})[colDeck];
        const valDisp = (val == null) ? '' : val;
        const wrClass = (val == null) ? '' : (val >= 55 ? 'tg-cell-good' : val <= 45 ? 'tg-cell-bad' : 'tg-cell-mid');
        const isDiag  = rowDeck === colDeck;
        if (readonly || isDiag) {
          return `<td class="tg-cell ${wrClass} ${isDiag ? 'tg-cell-diag' : ''}">${valDisp === '' ? '—' : valDisp}</td>`;
        }
        return `<td class="tg-cell ${wrClass}">
          <input type="number" min="0" max="100" step="1" value="${valDisp}"
            onchange="TestingGroups.onMatchupEdit('${_jsEsc(rowDeck)}', '${_jsEsc(colDeck)}', this.value)"
            class="tg-cell-input">
        </td>`;
      }).join('');
      const removeBtn = (_currentRole === 'owner')
        ? `<button class="tg-deck-remove" title="${_esc(t('tg.removeDeck'))}" onclick="TestingGroups.removeDeck('${_jsEsc(rowDeck)}')">×</button>`
        : '';
      return `<tr>
        <th class="tg-row-head"><span>${_esc(rowDeck)}</span>${removeBtn}</th>
        ${cells}
      </tr>`;
    }).join('');

    // Quantity row
    const quantityCells = decks.map(d => {
      const v = qty[d] == null ? '' : qty[d];
      return readonly
        ? `<td class="tg-cell tg-cell-qty">${v === '' ? '—' : v + '%'}</td>`
        : `<td class="tg-cell tg-cell-qty">
             <input type="number" min="0" max="100" step="0.5" value="${v}"
               onchange="TestingGroups.onQuantityEdit('${_jsEsc(d)}', this.value)"
               class="tg-cell-input">
           </td>`;
    }).join('');

    // Winrates aggregate row (computed from matchup + quantity)
    const winrateCells = decks.map(d => {
      const wr = _computeAggregateWR(d, decks, qty, matrix);
      const wrCls = wr == null ? '' : (wr >= 55 ? 'tg-cell-good' : wr <= 45 ? 'tg-cell-bad' : 'tg-cell-mid');
      return `<td class="tg-cell tg-cell-wr ${wrCls}">${wr == null ? '—' : wr.toFixed(1) + '%'}</td>`;
    }).join('');

    const addDeckControl = (_currentRole === 'owner')
      ? `<div class="tg-add-deck-row">
           <input type="text" id="tg-new-deck" class="tg-input" placeholder="${_esc(t('tg.newDeckPh'))}" maxlength="40">
           <button class="tg-btn" onclick="TestingGroups._uiAddDeck()">+ ${_esc(t('tg.addDeck'))}</button>
         </div>` : '';

    const membersHtml = _renderMembersSection();
    const activityHtml = `<div id="tg-activity-section"><h3>${_esc(t('tg.activity'))}</h3><div id="tg-activity-log" class="tg-activity-log"><em>${_esc(t('tg.activityLoading'))}</em></div></div>`;

    container.innerHTML = `
<div class="tg-wrap">
  <div class="tg-detail-header">
    <button class="tg-btn tg-btn-back" onclick="TestingGroups.closeGroup()">← ${_esc(t('tg.back'))}</button>
    <h2 class="tg-detail-title">${_esc(g.name)}</h2>
    <span class="tg-role tg-role-${_currentRole}">${_esc(t('tg.role.' + _currentRole))}</span>
    <div class="tg-detail-actions">
      <button class="tg-btn" onclick="TestingGroups.exportJson()">💾 ${_esc(t('tg.exportJson'))}</button>
      <button class="tg-btn tg-btn-primary" onclick="TestingGroups.loadIntoMetaCall()">→ ${_esc(t('tg.loadIntoMetaCall'))}</button>
      ${_currentRole === 'owner'
        ? `<button class="tg-btn tg-btn-danger" onclick="TestingGroups.deleteGroup('${_jsEsc(g.id)}')">${_esc(t('tg.delete'))}</button>`
        : `<button class="tg-btn tg-btn-danger" onclick="TestingGroups.leaveGroup()">${_esc(t('tg.leave'))}</button>`}
    </div>
  </div>

  ${addDeckControl}

  <div class="tg-table-wrap">
    <table class="tg-matchup-table">
      <thead>
        <tr><th class="tg-corner">${_esc(t('tg.matchupTable'))}</th>${headerCells}</tr>
      </thead>
      <tbody>
        ${matrixRows}
      </tbody>
      <tfoot>
        <tr><th class="tg-row-head">${_esc(t('tg.quantity'))}</th>${quantityCells}</tr>
        <tr><th class="tg-row-head">${_esc(t('tg.winrates'))}</th>${winrateCells}</tr>
      </tfoot>
    </table>
  </div>

  ${membersHtml}
  ${activityHtml}
</div>`;

    _loadActivityLog();
  }

  function _renderMembersSection() {
    const g = _currentGroup;
    if (!g) return '';
    const members = g.members || {};
    const rows = (g.memberUids || []).map(uid => {
      const m = members[uid] || {};
      const isOwner = uid === g.ownerUid;
      const canEditRole = (_currentRole === 'owner') && !isOwner;
      const canRemove   = (_currentRole === 'owner') && !isOwner;
      const roleCell = canEditRole
        ? `<select onchange="TestingGroups.changeMemberRole('${_jsEsc(uid)}', this.value)" class="tg-role-select">
             <option value="editor" ${m.role === 'editor' ? 'selected' : ''}>${_esc(t('tg.role.editor'))}</option>
             <option value="viewer" ${m.role === 'viewer' ? 'selected' : ''}>${_esc(t('tg.role.viewer'))}</option>
           </select>`
        : `<span class="tg-role tg-role-${m.role}">${_esc(t('tg.role.' + (m.role || 'viewer')))}</span>`;
      const removeBtn = canRemove
        ? `<button class="tg-btn tg-btn-danger tg-btn-sm" onclick="TestingGroups.removeMember('${_jsEsc(uid)}')">${_esc(t('tg.remove'))}</button>`
        : '';
      return `<tr>
        <td>${_esc(m.displayName || '—')}</td>
        <td class="tg-email">${_esc(m.email || '')}</td>
        <td>${roleCell}</td>
        <td>${removeBtn}</td>
      </tr>`;
    }).join('');

    const addForm = (_currentRole === 'owner')
      ? `<div class="tg-add-member-row">
           <input type="email" id="tg-new-member-email" class="tg-input" placeholder="${_esc(t('tg.addMemberEmailPh'))}">
           <select id="tg-new-member-role" class="tg-input tg-input-narrow">
             <option value="editor">${_esc(t('tg.role.editor'))}</option>
             <option value="viewer">${_esc(t('tg.role.viewer'))}</option>
           </select>
           <button class="tg-btn tg-btn-primary" onclick="TestingGroups._uiAddMember()">+ ${_esc(t('tg.addMember'))}</button>
         </div>
         <p class="tg-hint">${_esc(t('tg.addMemberHint'))}</p>`
      : '';

    return `
<div class="tg-members-section">
  <h3>${_esc(t('tg.members'))}</h3>
  ${addForm}
  <table class="tg-members-table">
    <thead><tr>
      <th>${_esc(t('tg.name'))}</th>
      <th>${_esc(t('tg.email'))}</th>
      <th>${_esc(t('tg.role.label'))}</th>
      <th></th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
  }

  function _uiAddDeck() {
    const inp = document.getElementById('tg-new-deck');
    if (!inp) return;
    addDeck(inp.value);
    inp.value = '';
  }

  function _uiAddMember() {
    const emailInp = document.getElementById('tg-new-member-email');
    const roleSel  = document.getElementById('tg-new-member-role');
    if (!emailInp) return;
    addMemberByEmail(emailInp.value, roleSel ? roleSel.value : 'editor');
    emailInp.value = '';
  }

  async function _loadActivityLog() {
    const el = document.getElementById('tg-activity-log');
    const db = _db();
    if (!el || !db || !_currentGroupId) return;
    try {
      const snap = await db.collection('testingGroups').doc(_currentGroupId)
        .collection('activity')
        .orderBy('timestamp', 'desc')
        .limit(50).get();
      if (snap.empty) { el.innerHTML = `<em>${_esc(t('tg.activityEmpty'))}</em>`; return; }
      const rows = snap.docs.map(d => {
        const a = d.data() || {};
        const when = a.timestamp && a.timestamp.toDate ? a.timestamp.toDate() : new Date();
        const whenStr = when.toLocaleString();
        const actionLabel = t('tg.action.' + (a.action || 'update')) || a.action;
        const fieldStr = a.field ? `<strong>${_esc(a.field)}</strong>` : '';
        const change = (a.oldValue != null && a.newValue != null)
          ? `${_esc(a.oldValue)} → ${_esc(a.newValue)}`
          : (a.newValue != null ? _esc(a.newValue) : '');
        return `<div class="tg-activity-row">
          <span class="tg-activity-user">${_esc(a.displayName || '—')}</span>
          <span class="tg-activity-action">${_esc(actionLabel)}</span>
          ${fieldStr}
          <span class="tg-activity-change">${change}</span>
          <span class="tg-activity-time">${_esc(whenStr)}</span>
        </div>`;
      }).join('');
      el.innerHTML = rows;
    } catch (err) {
      console.warn('[TestingGroups] activity load failed', err);
      el.innerHTML = `<em>${_esc(t('tg.activityError'))}</em>`;
    }
  }

  function _computeAggregateWR(deck, decks, qty, matrix) {
    const row = matrix[deck];
    if (!row) return null;
    let totalW = 0, totalQ = 0;
    decks.forEach(opp => {
      if (opp === deck) return;
      const q = Number(qty[opp]);
      const w = Number(row[opp]);
      if (!isNaN(q) && q > 0 && !isNaN(w)) {
        totalW += (w / 100) * q;
        totalQ += q;
      }
    });
    if (totalQ <= 0) return null;
    return (totalW / totalQ) * 100;
  }

  function _updateWinrateRow() {
    // Recompute the winrates row in place after a single-cell edit,
    // without re-rendering the whole table (which would steal focus).
    const g = _currentGroup;
    if (!g || !g.data) return;
    const decks  = g.data.decks || [];
    const qty    = g.data.quantity || {};
    const matrix = g.data.matchups || {};
    const wrRow  = document.querySelector('.tg-matchup-table tfoot tr:last-child');
    if (!wrRow) return;
    const cells = wrRow.querySelectorAll('.tg-cell');
    if (cells.length !== decks.length) return;
    decks.forEach((d, i) => {
      const wr = _computeAggregateWR(d, decks, qty, matrix);
      cells[i].textContent = wr == null ? '—' : wr.toFixed(1) + '%';
      cells[i].className = 'tg-cell tg-cell-wr ' +
        (wr == null ? '' : wr >= 55 ? 'tg-cell-good' : wr <= 45 ? 'tg-cell-bad' : 'tg-cell-mid');
    });
  }

  // ── i18n helper ──────────────────────────────────────────
  function t(key) {
    if (typeof window.t === 'function') return window.t(key);
    return key;
  }

  // ── Init (called when Profile → Testing Groups tab opens) ─
  async function init() {
    await _ensurePublicProfile();
    await loadMyGroups();
    renderAll();
  }

  return {
    init,
    loadMyGroups,
    openGroup,
    closeGroup,
    createGroup,
    deleteGroup,
    onMatchupEdit,
    onQuantityEdit,
    addDeck,
    removeDeck,
    addMemberByEmail,
    changeMemberRole,
    removeMember,
    leaveGroup,
    exportJson,
    loadIntoMetaCall,
    // UI glue
    _uiCreate,
    _uiAddDeck,
    _uiAddMember,
  };
})();
