/**
 * Wishlist bot-message import
 * ===========================
 *
 * Imports the card lists the Telegram bot posts into the Oneslist
 * (wishlist). The bot's output is meant to be read by humans, so it is
 * pasted, not uploaded — there is no file to pick.
 *
 * The shape it emits:
 *
 *     🏆 Set PBL — gespielt in Top-10-Decks (alle 18), nach Nummer:
 *     1. PBL 5 · Poltchageist · Common — normal 0,03 € · RH 0,02 €
 *          in 1 Deck
 *     2. PBL 12 · Rellor · Common — normal 0,04 € · RH 0,03 €
 *          in 3 Decks
 *
 * Only the numbered lines matter. Everything else (header, "in N Decks",
 * separators, totals) is ignored on purpose so the user can paste the
 * whole message including the emoji header without cleaning it up first.
 *
 * Cards are matched on (set, number) — never on name. Names are not
 * unique within a set (PBL alone has four products called "Mega Darkrai
 * ex"), so a name join would silently attach the wrong price and the
 * wrong card. The parsed name is used only to show the user what was
 * matched, and to warn when it disagrees with the database.
 */
(function () {
  'use strict';

  const de = () => (typeof getLang === 'function' ? getLang() === 'de' : true);
  const t = (deStr, enStr) => (de() ? deStr : enStr);

  // ── Parsing ────────────────────────────────────────────────────────────────

  // "1. PBL 5 · Poltchageist · Common — normal 0,03 € · RH 0,02 €"
  //  ^idx  ^set ^num ^name        ^rarity
  //
  // Tolerances that matter in practice:
  //  · the separator is a middot, but Telegram clients paste it as "·",
  //    "•" or a plain "-" depending on the platform
  //  · the dash before the prices is an em dash, en dash or hyphen
  //  · card numbers can be alphanumeric (SVP promos: "SVP 052", "TG12")
  //  · the trailing price block is optional — older bot builds omit it
  const LINE_RE = new RegExp(
    '^\\s*\\d+\\s*[.)]\\s*' +                 // "1." / "1)"
    '([A-Za-z0-9]{2,6})\\s+' +                // set code
    '([0-9]{1,4}[A-Za-z]?|[A-Za-z]{1,3}[0-9]{1,3})' +  // number (12 / 052 / TG12)
    '\\s*[·•\\-–—|]\\s*' +                    // separator
    '(.+?)' +                                 // card name
    '(?:\\s*[·•|]\\s*(.+?))?' +               // rarity (optional)
    // Optional price tail. Matched either by the "normal"/"RH" labels the
    // bot uses today, or by any dash-introduced remainder that carries a
    // currency symbol — so a future bot build that drops the labels still
    // gets its prices stripped out of the rarity instead of into it.
    '\\s*(?:[-–—]\\s*(?:(?:normal|RH)\\b.*|[^·•|]*[€$£].*))?$'
  );

  // "🏆 Set PBL — gespielt in Top-10-Decks (alle 18), nach Nummer:"
  const HEADER_RE = /\bSet\s+([A-Za-z0-9]{2,6})\b/;

  // "     in 3 Decks" / "in 1 Deck" — deck coverage, NOT a copy count.
  const DECKS_RE = /^\s*in\s+(\d+)\s+Deck/i;

  function normSet(v) {
    return String(v || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function normNumber(v) {
    const raw = String(v || '').trim().replace(/[^0-9A-Za-z]/g, '');
    if (!raw) return '';
    if (/^\d+$/.test(raw)) return raw.replace(/^0+/, '') || '0';
    return raw.toUpperCase();
  }

  /**
   * Parse a pasted bot message.
   * Returns { entries, skipped } where every entry is
   * { set, number, name, rarity, decks, line }.
   */
  function parseBotMessage(text) {
    const entries = [];
    const skipped = [];
    const seen = new Set();
    let headerSet = '';

    const lines = String(text || '').split(/\r?\n/);
    lines.forEach(rawLine => {
      const line = rawLine.replace(/ /g, ' ').trimEnd();
      if (!line.trim()) return;

      const head = HEADER_RE.exec(line);
      if (head && !LINE_RE.test(line)) {
        headerSet = normSet(head[1]);
        return;
      }

      // A deck-count line belongs to the entry above it. It says in how
      // many of the top-10 decks the card appeared — it is NOT how many
      // copies the user wants, so it never becomes a quantity.
      const decks = DECKS_RE.exec(line);
      if (decks && entries.length) {
        entries[entries.length - 1].decks = parseInt(decks[1], 10) || 0;
        return;
      }

      const m = LINE_RE.exec(line);
      if (!m) {
        // Only report lines that look like they were meant to be cards;
        // headers, blank lines and totals are not user-visible failures.
        if (/^\s*\d+\s*[.)]/.test(line)) skipped.push(line.trim());
        return;
      }

      const set = normSet(m[1]) || headerSet;
      const number = normNumber(m[2]);
      if (!set || !number) {
        skipped.push(line.trim());
        return;
      }
      const key = `${set}-${number}`;
      if (seen.has(key)) return;   // the bot repeats a card across sections
      seen.add(key);

      entries.push({
        set,
        number,
        name: (m[3] || '').trim(),
        rarity: (m[4] || '').trim(),
        decks: 0,
        line: line.trim()
      });
    });

    return { entries, skipped };
  }

  // ── Matching ───────────────────────────────────────────────────────────────

  function lookupCard(set, number) {
    const idx = window.cardIndexBySetNumber;
    if (idx instanceof Map) {
      const plain = /^\d+$/.test(number) ? (number.replace(/^0+/, '') || '0') : number;
      const hit = idx.get(`${set}-${number}`)
               || idx.get(`${set}-${plain}`)
               || idx.get(`${set}-${plain.padStart(3, '0')}`);
      if (hit) return hit;
    }
    if (typeof _lookupCardBySetNumber === 'function') {
      return _lookupCardBySetNumber(set, number) || null;
    }
    return null;
  }

  function resolveEntries(entries) {
    const matched = [], unmatched = [];
    entries.forEach(e => {
      const card = lookupCard(e.set, e.number);
      if (!card) { unmatched.push(e); return; }
      // Name mismatch is worth surfacing: it means the bot and our card DB
      // disagree about what (set, number) is, which is a data problem, not
      // a reason to drop the card. Report it, do not silently "correct" it.
      const dbName = String(card.name || card.name_en || '').toLowerCase();
      const botName = e.name.toLowerCase();
      const nameDiffers = !!(dbName && botName) &&
        !dbName.includes(botName) && !botName.includes(dbName);
      matched.push({
        entry: e,
        card,
        nameDiffers,
        cardId: `${card.name}|${card.set}|${card.number}`
      });
    });
    return { matched, unmatched };
  }

  // ── UI ─────────────────────────────────────────────────────────────────────

  function openPasteModal() {
    const user = (typeof auth !== 'undefined' && auth) ? auth.currentUser : null;
    if (!user) {
      showNotification(t('Bitte zuerst einloggen', 'Please log in first'), 'error');
      return;
    }
    closeModal('wishlistBotImportModal');

    const modal = document.createElement('div');
    modal.id = 'wishlistBotImportModal';
    modal.className = 'wl-bot-import-overlay';
    modal.innerHTML = `
      <div class="wl-bot-import-panel" role="dialog" aria-modal="true"
           aria-labelledby="wlBotImportTitle">
        <button type="button" class="btn-escape-rope wl-bot-import-close"
                onclick="wishlistBotImportClose()"
                aria-label="${t('Schließen', 'Close')}" title="${t('Schließen', 'Close')}">&times;</button>
        <h2 id="wlBotImportTitle" class="wl-bot-import-title">
          ${t('Bot-Nachricht importieren', 'Import bot message')}
        </h2>
        <p class="wl-bot-import-hint">
          ${t('Nachricht aus dem Bot-Chat kopieren und hier einfügen — die komplette Nachricht inklusive Überschrift ist in Ordnung.',
               'Copy the message from the bot chat and paste it here — the whole message including the header is fine.')}
        </p>
        <textarea id="wlBotImportText" class="wl-bot-import-textarea" rows="9" spellcheck="false"
          aria-label="${t('Bot-Nachricht', 'Bot message')}"
          placeholder="🏆 Set PBL — gespielt in Top-10-Decks (alle 18), nach Nummer:&#10;1. PBL 5 · Poltchageist · Common — normal 0,03 € · RH 0,02 €&#10;     in 1 Deck"></textarea>
        <div id="wlBotImportError" class="wl-bot-import-error" role="alert" hidden></div>
        <div class="wl-bot-import-actions">
          <button type="button" class="wl-bot-import-btn wl-bot-import-btn--primary"
                  onclick="wishlistBotImportPreview()">
            ${t('Weiter zur Vorschau', 'Continue to preview')}
          </button>
          <button type="button" class="wl-bot-import-btn"
                  onclick="wishlistBotImportClose()">
            ${t('Abbrechen', 'Cancel')}
          </button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const ta = document.getElementById('wlBotImportText');
    if (ta) ta.focus();
  }

  function showPreview() {
    const ta = document.getElementById('wlBotImportText');
    // Default 1, not 4. A wishlist entry means "I still need this card", and
    // a tester read a 4x default as the app deciding for them that they
    // wanted a playset of everything. It is also the only provably
    // non-destructive value: the merge below keeps the higher of the two
    // counts, so importing at 1 can never overwrite a number the user set.
    const qty = 1;
    const { entries, skipped } = parseBotMessage(ta ? ta.value : '');

    if (!entries.length) {
      // A bare "not recognised" toast is a dead end — a tester said they
      // would close the dialog rather than guess what the parser wanted.
      // Show what a valid line looks like, in place, and keep the pasted
      // text so nothing has to be copied again.
      const box = document.getElementById('wlBotImportError');
      if (box) {
        box.innerHTML = `
          <strong>${t('Keine Karten erkannt.', 'No cards recognised.')}</strong>
          ${t('Erwartet wird eine Zeile wie diese:', 'A line is expected to look like this:')}
          <code>1. PBL 5 · Poltchageist · Common — normal 0,03 €</code>
          ${t('Set-Kürzel und Kartennummer müssen dabei sein. Kopiere die Nachricht am besten direkt aus dem Bot-Chat, nicht als Weiterleitung.',
              'The set code and card number must be present. Copy the message straight from the bot chat rather than as a forward.')}`;
        box.hidden = false;
      } else {
        showNotification(
          t('Keine Karten in der Nachricht erkannt', 'No cards recognised in the message'),
          'error');
      }
      return;
    }

    const { matched, unmatched } = resolveEntries(entries);
    const conflicts = matched.filter(m => m.nameDiffers);

    closeModal('wishlistBotImportModal');
    const modal = document.createElement('div');
    modal.id = 'wishlistBotPreviewModal';
    modal.className = 'wl-bot-import-overlay';


    const unmatchedBlock = unmatched.length ? `
      <details class="wl-bot-import-details">
        <summary>${unmatched.length} ${t('nicht gefunden (anzeigen)', 'not found (show)')}</summary>
        <ul>${unmatched.map(u =>
          `<li>${escapeHtml(u.set)} ${escapeHtml(u.number)} — ${escapeHtml(u.name)}</li>`).join('')}</ul>
      </details>` : '';

    const skippedBlock = skipped.length ? `
      <details class="wl-bot-import-details">
        <summary>${skipped.length} ${t('Zeile(n) nicht lesbar (anzeigen)', 'unreadable line(s) (show)')}</summary>
        <ul>${skipped.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul>
      </details>` : '';

    modal.innerHTML = `
      <div class="wl-bot-import-panel" role="dialog" aria-modal="true"
           aria-labelledby="wlBotPreviewTitle">
        <button type="button" class="btn-escape-rope wl-bot-import-close"
                onclick="wishlistBotImportClose()"
                aria-label="${t('Schließen', 'Close')}" title="${t('Schließen', 'Close')}">&times;</button>
        <h2 id="wlBotPreviewTitle" class="wl-bot-import-title">
          ${t('Import-Vorschau', 'Import preview')}
        </h2>
        <div class="wl-bot-import-stats">
          <div class="wl-bot-import-stat is-ok">
            <strong>${matched.length}</strong>
            <span>${t('Karten erkannt', 'cards recognised')}</span>
          </div>
          <div class="wl-bot-import-stat is-ok">
            <strong id="wlBotPreviewCopies">0</strong>
            <span>${t('Exemplare kommen dazu', 'copies will be added')}</span>
          </div>
          ${unmatched.length ? `<div class="wl-bot-import-stat is-warn">
            <strong>${unmatched.length}</strong>
            <span>${t('nicht gefunden', 'not found')}</span>
          </div>` : ''}
          ${conflicts.length ? `<div class="wl-bot-import-stat is-warn">
            <strong>${conflicts.length}</strong>
            <span>${t('Name weicht ab', 'name differs')}</span>
          </div>` : ''}
          <!-- Raising a count the user set by hand is the one destructive
               thing this import can do. It must be visible BEFORE the write,
               not only in the toast afterwards. Hidden at 1x, where the
               merge is provably non-destructive. -->
          <div class="wl-bot-import-stat is-warn" id="wlBotPreviewRaise" hidden>
            <strong>0</strong>
            <span>${t('Mengen werden erhöht', 'quantities raised')}</span>
          </div>
        </div>
        ${matched.length ? `
        <label class="wl-bot-import-qty">
          <span>${t('Wie viele Exemplare pro Karte?', 'How many copies per card?')}</span>
          <select id="wlBotPreviewQty" onchange="wishlistBotImportRefresh()"
                  aria-label="${t('Exemplare pro Karte', 'Copies per card')}">
            <option value="1">1×</option>
            <option value="2">2×</option>
            <option value="3">3×</option>
            <option value="4">4× ${t('(Playset)', '(playset)')}</option>
          </select>
        </label>
        <div class="wl-bot-import-tablewrap">
          <table class="wl-bot-import-table">
            <thead><tr>
              <th>${t('Karte', 'Card')}</th><th>Set</th>
              <th>${t('Nr.', 'No.')}</th>
              <th title="${escapeHtmlAttr(t('In wie vielen der Top-Decks die Karte gespielt wurde', 'In how many of the top decks the card was played'))}">${t('in Top-Decks', 'in top decks')}</th>
              <th>${t('kommt auf die Liste', 'will be added')}</th>
            </tr></thead>
            <tbody id="wlBotPreviewRows"></tbody>
          </table>
        </div>` : ''}
        ${unmatchedBlock}
        ${skippedBlock}
        <div class="wl-bot-import-actions">
          <button type="button" class="wl-bot-import-btn wl-bot-import-btn--primary"
                  onclick="wishlistBotImportExecute()"
                  ${matched.length ? '' : 'disabled'}>
            ${t('Zur Wunschliste hinzufügen', 'Add to wishlist')}
          </button>
          <button type="button" class="wl-bot-import-btn"
                  onclick="wishlistBotImportClose()">
            ${t('Abbrechen', 'Cancel')}
          </button>
        </div>
      </div>`;
    modal._matched = matched;
    document.body.appendChild(modal);
    const sel = document.getElementById('wlBotPreviewQty');
    if (sel) sel.value = String(qty);
    refreshPreview();
  }

  function currentPreviewQty() {
    const sel = document.getElementById('wlBotPreviewQty');
    return Math.max(1, Math.min(4, parseInt(sel && sel.value, 10) || 1));
  }

  // Recompute the preview against the chosen quantity. Everything shown here
  // is what will actually be written: the merge below keeps the HIGHER of the
  // existing and the imported count, so a card already on the list at 3 does
  // not gain 2 more when importing at 2 -- it stays at 3, and the totals must
  // say so rather than promising copies that never arrive.
  function refreshPreview() {
    const modal = document.getElementById('wishlistBotPreviewModal');
    if (!modal || !modal._matched) return;
    const want = currentPreviewQty();
    const counts = window.userWishlistCounts instanceof Map ? window.userWishlistCounts : new Map();
    const onList = window.userWishlist instanceof Set ? window.userWishlist : new Set();

    let added = 0, raised = 0;
    const rows = modal._matched.map((m, i) => {
      const prev = counts.get(m.cardId) || 0;
      const next = Math.max(prev, want);
      added += next - prev;
      if (onList.has(m.cardId) && next > prev) raised++;
      const change = prev
        ? (next > prev ? `${prev}× → ${next}×` : t(`schon ${prev}×`, `already ${prev}×`))
        : `${next}×`;
      return `
      <tr class="${i % 2 ? 'is-odd' : ''}">
        <td>${escapeHtml(m.card.name || '')}${m.nameDiffers
            ? ` <span class="wl-bot-import-warn" title="${escapeHtmlAttr(t('Bot nennt: ', 'Bot says: ') + m.entry.name)}">⚠</span>`
            : ''}</td>
        <td class="ta-c">${escapeHtml(m.card.set || '')}</td>
        <td class="ta-c">${escapeHtml(m.card.number || '')}</td>
        <!-- Written out, not "3×": a tester read a bare × in this column as
             the number of copies about to be added. -->
        <td class="ta-c">${m.entry.decks ? m.entry.decks : '–'}</td>
        <td class="ta-c">${change}</td>
      </tr>`;
    }).join('');

    const body = document.getElementById('wlBotPreviewRows');
    if (body) body.innerHTML = rows;
    const copiesEl = document.getElementById('wlBotPreviewCopies');
    if (copiesEl) copiesEl.textContent = String(added);
    const raiseEl = document.getElementById('wlBotPreviewRaise');
    if (raiseEl) {
      raiseEl.hidden = raised === 0;
      const strong = raiseEl.querySelector('strong');
      if (strong) strong.textContent = String(raised);
    }
  }

  // ── Write ──────────────────────────────────────────────────────────────────

  // Mirrors countFieldRef in firebase-collection.js: Firestore parses a dotted
  // STRING key as a field path, so a cardId holding '[' or ']' throws and the
  // card can never be written. A FieldPath with explicit segments is literal.
  function fieldPath(...segments) {
    const FP = (typeof firebase !== 'undefined') && firebase.firestore && firebase.firestore.FieldPath;
    return FP ? new FP(...segments) : segments.join('.');
  }


  async function execute() {
    const modal = document.getElementById('wishlistBotPreviewModal');
    if (!modal || !modal._matched) return;
    const matched = modal._matched;
    const user = (typeof auth !== 'undefined' && auth) ? auth.currentUser : null;
    if (!user) {
      showNotification(t('Bitte zuerst einloggen', 'Please log in first'), 'error');
      return;
    }
    // The merge below reads the current counts to keep the HIGHER of the two.
    // If the user's data has not come back from Firestore yet, those maps are
    // empty and "higher" would silently mean "lower" -- an import could then
    // reduce a quantity the user set by hand. Wait rather than guess.
    if (window.userDataLoaded !== true) {
      showNotification(t('Deine Wunschliste wird noch geladen — bitte kurz warten.',
                         'Your wishlist is still loading — please wait a moment.'), 'info');
      return;
    }

    const want = currentPreviewQty();

    // Additive by construction, not just by intention: this list comes from
    // someone else's bot and must never be able to remove anything.
    //
    // arrayUnion + one field path per imported card, rather than rewriting the
    // whole wishlist array and the whole counts map. Rewriting them would make
    // the write only as complete as the in-memory state -- exactly the failure
    // that made the dex import's "replace" mode leave phantom cards behind --
    // and any entry the client had not loaded would be deleted server-side.
    // These two operations cannot touch a card that is not in `matched`.
    const nextList = new Set(window.userWishlist || []);
    const nextCounts = new Map(window.userWishlistCounts || []);
    let added = 0, raised = 0;
    const ids = [];
    const countArgs = [];

    matched.forEach(({ cardId }) => {
      const prev = nextCounts.get(cardId) || 0;
      const next = Math.max(prev, want);
      if (!nextList.has(cardId)) added++;
      else if (next > prev) raised++;
      nextList.add(cardId);
      nextCounts.set(cardId, next);
      ids.push(cardId);
      // FieldPath, not a dotted string: a cardId containing '[' or ']' is
      // parsed as a field path and rejected outright.
      countArgs.push(fieldPath('wishlistCounts', cardId), next);
    });

    if (!ids.length) return;

    try {
      await db.collection('users').doc(user.uid).update(
        'wishlist', firebase.firestore.FieldValue.arrayUnion(...ids),
        ...countArgs
      );
    } catch (err) {
      console.error('[wishlist-bot-import] write failed:', err);
      showNotification(t('Import fehlgeschlagen: ', 'Import failed: ') + err.message, 'error');
      return;
    }

    window.userWishlist = nextList;
    window.userWishlistCounts = nextCounts;
    closeModal('wishlistBotPreviewModal');
    if (typeof updateCollectionUI === 'function') updateCollectionUI();
    if (typeof filterWishlist === 'function') filterWishlist();

    showNotification(
      t(`${added} neue Karte(n) zur Wunschliste hinzugefügt${raised ? `, ${raised} Menge(n) erhöht` : ''}`,
        `${added} new card(s) added to the wishlist${raised ? `, ${raised} quantity/quantities raised` : ''}`),
      'success');
  }

  function closeModal(id) {
    if (id) {
      const el = document.getElementById(id);
      if (el) el.remove();
      return;
    }
    ['wishlistBotImportModal', 'wishlistBotPreviewModal'].forEach(k => closeModal(k));
  }

  // Every other dialog in this app can be dismissed with Escape or by tapping
  // the backdrop; a modal that can only be closed by finding the right button
  // reads as stuck. Registered once, on the document, so it survives both
  // dialogs being created and destroyed.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (document.getElementById('wishlistBotImportModal') ||
        document.getElementById('wishlistBotPreviewModal')) {
      e.preventDefault();
      closeModal();
    }
  });
  document.addEventListener('click', (e) => {
    // Backdrop only — a click that started inside the panel must not close it.
    if (e.target && e.target.classList &&
        e.target.classList.contains('wl-bot-import-overlay')) {
      closeModal();
    }
  });

  // Escape helpers exist globally in this app, but this file loads
  // independently — fall back so a load-order change can never inject markup.
  const escapeHtml = (s) => (typeof window.escapeHtml === 'function'
    ? window.escapeHtml(s)
    : String(s == null ? '' : s).replace(/[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const escapeHtmlAttr = (s) => (typeof window.escapeHtmlAttr === 'function'
    ? window.escapeHtmlAttr(s) : escapeHtml(s));

  window.wishlistBotImportOpen = openPasteModal;
  window.wishlistBotImportPreview = showPreview;
  window.wishlistBotImportExecute = execute;
  window.wishlistBotImportClose = () => closeModal();
  window.wishlistBotImportRefresh = refreshPreview;
  // Exported for tests.
  window.__wishlistBotParse = parseBotMessage;
})();
