// app-core.js — extracted from app.js
// Part of Hausi's Pokemon TCG Analysis

const BASE_PATH = './data/';

        // ============================================================
        // DEV LOGGER — set DEV_MODE = true locally for verbose logs
        // ============================================================
        const DEV_MODE = false;
        const devLog = (...args) => DEV_MODE && console.log(...args);
        const devWarn = (...args) => DEV_MODE && console.warn(...args);

        // ============================================================
        // TRAINER OWNER-PREFIX HELPER (single source of truth)
        // ============================================================
        // Split a possessive trainer-owner prefix off a card/archetype name:
        // returns { owner, base }. Recognizes ANY leading "X's " generically
        // (N's, Rocket's, Team Rocket's, Hop's, Cynthia's, Ethan's, Erika's, …),
        // so there is no owner list to keep in sync, and handles both the
        // straight (') and curly (’) apostrophe. Callers that want the base
        // species read .base; custom-binder groups by .owner. Replaces three
        // ad-hoc, individually-incomplete copies (custom-binder's hardcoded
        // 3-owner list, app-cards-db's straight-quote-only regex, and
        // app-deck-builder's single-word regex).
        function stripTrainerOwnerPrefix(name) {
            const raw = String(name == null ? '' : name).trim();
            const m = raw.match(/^(.+?['’]s)\s+(.+)$/);
            if (m) return { owner: m[1], base: m[2] };
            return { owner: '', base: raw };
        }
        if (typeof window !== 'undefined') {
            window.stripTrainerOwnerPrefix = stripTrainerOwnerPrefix;
        }

        // ============================================================
        // TOAST NOTIFICATION SYSTEM
        // ============================================================

        /**
         * Show a custom modal dialog that replaces native prompt().
         * @param {Object} opts
         * @param {string} opts.title - Modal title
         * @param {string} [opts.message] - Description text (supports line breaks via \n)
         * @param {string} [opts.defaultValue] - Pre-filled value
         * @param {string} [opts.placeholder] - Placeholder text
         * @param {boolean} [opts.textarea] - Use textarea instead of input
         * @param {boolean} [opts.readonly] - Make value readonly (for copy dialogs)
         * @param {string} [opts.inputType] - Input type (text, email, number)
         * @returns {Promise<string|null>} Resolves with input value or null if cancelled
         */
        function showInputModal(opts = {}) {
            return new Promise(resolve => {
                const overlay = document.createElement('div');
                overlay.className = 'modal-overlay';
                
                const modal = document.createElement('div');
                modal.className = 'modal-dialog';
                
                const title = document.createElement('h3');
                // Use .modal-dialog h3 for styling
                title.textContent = opts.title || 'Input';
                modal.appendChild(title);

                if (opts.message) {
                    const msg = document.createElement('p');
                    // Use .modal-dialog p for styling
                    msg.textContent = opts.message;
                    modal.appendChild(msg);
                }

                let input;
                if (opts.textarea) {
                    input = document.createElement('textarea');
                    // Use .modal-dialog textarea for styling
                } else {
                    input = document.createElement('input');
                    input.type = opts.inputType || 'text';
                    // Use .modal-dialog input for styling
                }
                if (opts.defaultValue != null) input.value = opts.defaultValue;
                if (opts.placeholder) input.placeholder = opts.placeholder;
                if (opts.readonly) {
                    input.readOnly = true;
                    input.classList.add('cursor-text');
                }
                modal.appendChild(input);

                const btnRow = document.createElement('div');
                btnRow.className = 'modal-btn-row';

                const cancelBtn = document.createElement('button');
                cancelBtn.textContent = t('modal.cancel');
                cancelBtn.className = 'modal-btn-cancel';

                const okBtn = document.createElement('button');
                okBtn.textContent = opts.readonly ? t('btn.close') : t('modal.ok');
                okBtn.className = 'modal-btn-ok';

                if (opts.readonly) {
                    const copyBtn = document.createElement('button');
                    copyBtn.textContent = t('modal.copy');
                    copyBtn.className = 'modal-btn-copy';
                    copyBtn.onclick = () => { input.select(); navigator.clipboard.writeText(input.value).then(() => { copyBtn.textContent = t('modal.copied'); setTimeout(() => { copyBtn.textContent = t('modal.copy'); }, 1500); }); };
                    btnRow.appendChild(copyBtn);
                }

                function close(val) { overlay.remove(); resolve(val); }
                cancelBtn.onclick = () => close(null);
                okBtn.onclick = () => close(opts.readonly ? null : input.value);
                overlay.onclick = e => { if (e.target === overlay) close(null); };
                input.addEventListener('keydown', e => { if (e.key === 'Enter' && !opts.textarea) { e.preventDefault(); close(opts.readonly ? null : input.value); } if (e.key === 'Escape') close(null); });
                document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { document.removeEventListener('keydown', esc); close(null); } });

                if (!opts.readonly) btnRow.appendChild(cancelBtn);
                btnRow.appendChild(okBtn);
                modal.appendChild(btnRow);
                overlay.appendChild(modal);
                document.body.appendChild(overlay);
                
                // Focus trap: keep Tab within modal
                modal.addEventListener('keydown', e => {
                    if (e.key !== 'Tab') return;
                    const focusable = modal.querySelectorAll('input, textarea, button, [tabindex]:not([tabindex="-1"])');
                    if (focusable.length === 0) return;
                    const first = focusable[0], last = focusable[focusable.length - 1];
                    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus({ preventScroll: true }); }
                    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus({ preventScroll: true }); }
                });
                
                setTimeout(() => { input.focus({ preventScroll: true }); if (opts.readonly) input.select(); }, 50);
            });
        }

        function showToast(message, type = 'info', duration = 3000) {
            const container = document.getElementById('toast-container');
            if (!container) return;
            const icons = { success: '\u2705', warning: '\u26a0\ufe0f', error: '\u274c', info: '\u2139\ufe0f' };
            const toast = document.createElement('div');
            toast.className = 'toast toast-' + type;
            const iconSpan = document.createElement('span');
            iconSpan.className = 'toast-icon';
            iconSpan.textContent = icons[type] || icons.info;
            const msgSpan = document.createElement('span');
            msgSpan.className = 'toast-message';
            msgSpan.textContent = message;
            const closeBtn = document.createElement('button');
            closeBtn.className = 'toast-close';
            closeBtn.textContent = '\u00d7';
            closeBtn.onclick = () => { toast.classList.add('toast-dismissing'); setTimeout(() => toast.remove(), 300); };
            toast.appendChild(iconSpan);
            toast.appendChild(msgSpan);
            toast.appendChild(closeBtn);
            container.appendChild(toast);
            if (duration > 0) {
                setTimeout(() => { if (toast.parentElement) { toast.classList.add('toast-dismissing'); setTimeout(() => toast.remove(), 300); } }, duration);
            }
        }

        // ============================================================
        // CONTEXT HELP SYSTEM
        // ============================================================
        const TAB_HELP_CONTENT = {
            'city-league': {
                title: '\ud83c\uddef\ud83c\uddf5 City League Development',
                html: '<p>Shows archetype popularity trends from Japanese City League tournaments.</p><ul><li><strong>Chart:</strong> Tracks deck archetypes over time</li><li><strong>Format Filter:</strong> Switch between M4 (current) and M3 (archive)</li><li><strong>Legend Toggle:</strong> Click archetypes to show/hide lines</li><li><strong>Deck Builder Sync:</strong> Open any archetype and move to Deck Analysis for full card-level build tools</li></ul>'
            },
            'city-league-analysis': {
                title: '\ud83e\udd85 City League Deck Analysis',
                html: '<p>Browse and analyze individual deck lists from City League tournaments.</p><ul><li><strong>Archetype + Date Filters:</strong> Narrow data quickly</li><li><strong>Deck Builder:</strong> Add/remove cards and build a 60-card list</li><li><strong>Consistency Generate:</strong> Uses Math.round on per-card avg-when-used + Largest-Remainder + Reverse-LRM to land exactly on 60 cards while matching tournament intuition (Pok\u00e9 Pad 2.8\u2192 3, Lillie\'s 3.9\u2192 4).</li><li><strong>Tech-Slots (max 10):</strong> Use the row above the deck grid to lock in up to 10 cards \u2014 they fold into the Stage-0 pin pipeline and are forced into the next Generate. Typeahead picker, persisted across reloads.</li><li><strong>Build vs ...:</strong> Click the button in the Tech-Slots header, pick a target archetype, choose aggression (Mild / Standard / Heavy). The TechAudit pipeline picks counter cards across active threat categories and auto-fills your Tech-Slots so you can see + tweak.</li><li><strong>\u2191 Max Rarity / \u2193 Low Rarity toggle:</strong> One click swaps every card in the built deck to its highest-rarity (or lowest-rarity) print. Label flips after each click; resets to Max-Rarity on every fresh Generate.</li><li><strong>Tech vs Normal panel:</strong> Page-bottom diff between your latest Normal build and your latest Tech build for this source. Three columns (Added / Cut / Count changes) + total consistency-score delta. Hidden until both snapshots exist.</li><li><strong>Rarity Switcher (\u2605):</strong> Swap prints directly inside deck and overview cards</li><li><strong>Exact Print Swap:</strong> Switching print updates the real deck entry (set+number)</li><li><strong>Copy Deck:</strong> Export any deck list for Pok\u00e9mon TCG Live</li></ul><hr style="margin:14px 0;border:none;border-top:1px solid #ddd;"><p style="font-weight:700;margin:0 0 6px;">Card Action Buttons:</p><ul><li>\u2661 <strong>Wishlist</strong> \u2014 Add or remove this card from your wishlist</li><li>+ <strong>Collection</strong> \u2014 Add card to your collection (shows owned count)</li><li>\u2605 <strong>Show Other Prints</strong> \u2014 Swap to a different print of the same card</li><li>L <strong>Open Limitless Card Details</strong> \u2014 View card info on limitlesstcg.com</li><li>P <strong>Add to Proxy Printer</strong> \u2014 Send card to the proxy print queue</li><li>\u20ac <strong>Cardmarket</strong> \u2014 Search this card on Cardmarket</li></ul>'
            },
            'current-meta': {
                title: '\ud83c\udfae Limitless Online Comparison',
                html: '<p>Compare archetype meta shares between different tournament sources.</p><ul><li><strong>Side-by-side comparison:</strong> Online vs tournament results</li><li><strong>Charts:</strong> Pie and bar visualizations</li><li><strong>Meta Share %:</strong> Fast popularity read</li><li><strong>Fallback Safety:</strong> If current_meta_card_data.csv is missing, the app auto-falls back to tournament_cards_data_cards.csv</li></ul>'
            },
            'current-analysis': {
                title: '\ud83d\udcc8 Current Meta Deck Analysis',
                html: '<p>Analyze deck lists from current Limitless Online tournaments.</p><ul><li><strong>Archetype Filter:</strong> Browse decks by archetype</li><li><strong>Card Distribution:</strong> See most-played cards and usage</li><li><strong>Deck Builder:</strong> Build and modify decks interactively</li><li><strong>Consistency Generate:</strong> Math.round on per-card avg-when-used + Largest-Remainder + Reverse-LRM. Sums to exactly 60, matches what the UI shows (Pok\u00e9 Pad 2.8 \u2192 3, Lillie\'s 3.9 \u2192 4, Ultra Ball 2.3 \u2192 2 with possible LRM bump).</li><li><strong>Tech-Slots (max 10):</strong> Row above the deck grid \u2014 pick up to 10 cards via typeahead; they get force-pinned in Stage-0 of the next Generate. Persisted in localStorage.</li><li><strong>Build vs ...:</strong> Modal next to the Generate button. Pick a target archetype + aggression. TechAudit auto-fills Tech-Slots with the best counter-cards across active threat categories (hand disruption, ability lock, retreat lock, bench damage, etc.).</li><li><strong>\u2191 Max Rarity / \u2193 Low Rarity toggle:</strong> One click swaps every card in the built deck between low and max rarity prints. Bidirectional. Resets to Max on fresh Generate.</li><li><strong>Tech vs Normal panel:</strong> Page-bottom diff showing your last Normal vs last Tech build \u2014 Added / Cut / Count changes columns + total consistency-score delta. Only renders when both snapshots exist.</li><li><strong>Rarity Switcher (\u2605):</strong> Swap to another international print in one click</li><li><strong>Combined Variants:</strong> Prints of the same card (e.g. Riolu MEG 76 = Riolu ASC 112) merge automatically \u2014 usage% reflects true card popularity. Card-share is capped at 100% to handle Major-only merge edge-cases.</li></ul><hr style="margin:14px 0;border:none;border-top:1px solid #ddd;"><p style="font-weight:700;margin:0 0 6px;">Card Action Buttons:</p><ul><li>\u2661 <strong>Wishlist</strong> \u2014 Add or remove this card from your wishlist</li><li>+ <strong>Collection</strong> \u2014 Add card to your collection (shows owned count)</li><li>\u2605 <strong>Show Other Prints</strong> \u2014 Swap to a different print of the same card</li><li>L <strong>Open Limitless Card Details</strong> \u2014 View card info on limitlesstcg.com</li><li>P <strong>Add to Proxy Printer</strong> \u2014 Send card to the proxy print queue</li><li>\u20ac <strong>Cardmarket</strong> \u2014 Search this card on Cardmarket</li></ul>'
            },
            'past-meta': {
                title: '\ud83c\udfc6 Past Tournament Deck Analysis',
                html: '<p>Historical tournament data from major events (Regionals, EUIC, Worlds, etc.).</p><ul><li><strong>Format Filter:</strong> Filter by format code (e.g., TEF-SCR, OBF-TWM)</li><li><strong>Source Filter:</strong> Choose tournaments/regions</li><li><strong>Full Deck Analysis:</strong> Includes builder, copy, compare and \u2605 print switch</li><li><strong>Consistency Generate:</strong> Math.round + Largest-Remainder + Reverse-LRM lands the build at exactly 60 cards while honouring per-card avg-when-used.</li><li><strong>Tech-Slots (max 10):</strong> Row above the deck grid lets you pin up to 10 cards into Stage-0 of the next Generate via typeahead.</li><li><strong>Build vs ...:</strong> Anti-tech modal works here too \u2014 pick an archetype + aggression, TechAudit auto-fills the Tech-Slots with counter-cards.</li><li><strong>\u2191 Max Rarity / \u2193 Low Rarity toggle:</strong> One-click flip between low and max rarity prints for the entire built deck.</li><li><strong>Tech vs Normal panel:</strong> Page-bottom card-diff + score delta between your latest Normal and Tech builds.</li><li><strong>Historical Trends:</strong> Track deck evolution across formats</li></ul><hr style="margin:14px 0;border:none;border-top:1px solid #ddd;"><p style="font-weight:700;margin:0 0 6px;">Card Action Buttons:</p><ul><li>\u2661 <strong>Wishlist</strong> \u2014 Add or remove this card from your wishlist</li><li>+ <strong>Collection</strong> \u2014 Add card to your collection (shows owned count)</li><li>\u2605 <strong>Show Other Prints</strong> \u2014 Swap to a different print of the same card</li><li>L <strong>Open Limitless Card Details</strong> \u2014 View card info on limitlesstcg.com</li><li>P <strong>Add to Proxy Printer</strong> \u2014 Send card to the proxy print queue</li><li>\u20ac <strong>Cardmarket</strong> \u2014 Search this card on Cardmarket</li></ul>'
            },
            'cards': {
                title: '\ud83e\uddf0 Card Database',
                html: '<p>Search and browse the complete Pok\u00e9mon TCG card database.</p><ul><li><strong>Search + Filters:</strong> Name, set, type, rarity, meta filters</li><li><strong>Sort:</strong> Sets sorted newest\u2192oldest</li><li><strong>Rarity Switcher (\u2605):</strong> See and choose available prints quickly</li><li><strong>Collection Count:</strong> Exact print counts are tracked via set+number</li><li><strong>Wishlist:</strong> Mark target cards with \u2764</li></ul><hr style="margin:14px 0;border:none;border-top:1px solid #ddd;"><p style="font-weight:700;margin:0 0 6px;">Card Action Buttons:</p><ul><li>\u2661 <strong>Wishlist</strong> \u2014 Add or remove this card from your wishlist</li><li>+ <strong>Collection</strong> \u2014 Add card to your collection (shows owned count)</li><li>\u2605 <strong>Show Other Prints</strong> \u2014 Swap to a different print of the same card</li><li>L <strong>Open Limitless Card Details</strong> \u2014 View card info on limitlesstcg.com</li><li>P <strong>Add to Proxy Printer</strong> \u2014 Send card to the proxy print queue</li><li>\u20ac <strong>Cardmarket</strong> \u2014 Search this card on Cardmarket</li></ul>'
            },
            'proxy': {
                title: '\ud83d\udda8\ufe0f Proxy Printer',
                html: '<p>Create printable proxy cards for testing and casual play.</p><ul><li><strong>Import Deck:</strong> Paste a deck list and auto-generate proxies</li><li><strong>Manual Add:</strong> Search and add individual cards</li><li><strong>Print Layout:</strong> Optimized for standard 6.3cm \u00d7 8.8cm card size (fits sleeves)</li><li><strong>Adjust Quantities:</strong> Set exact copies for each card</li><li><strong>@media print:</strong> Browser print produces A4 pages with correct card dimensions</li></ul><hr style="margin:14px 0;border:none;border-top:1px solid #ddd;"><p style="font-weight:700;margin:0 0 6px;">Page Buttons:</p><ul><li>+ / \u2013 <strong>Quantity</strong> \u2014 Increase or decrease copy count per card</li><li>\u2716 <strong>Remove</strong> \u2014 Remove card from the proxy list</li><li><strong>Import Deck</strong> \u2014 Paste a full deck list to load all cards at once</li><li><strong>Clear All</strong> \u2014 Remove all cards from the proxy list</li><li><strong>Print</strong> \u2014 Send proxy sheet to browser print dialog</li></ul>'
            },
            'profile': {
                title: '\ud83d\udc64 User Profile',
                html: '<p>Manage your personal card collection, saved decks, and settings.</p><ul><li><strong>My Collection:</strong> Exact print counts (set+number) synced to Firebase</li><li><strong>Dex Import:</strong> CSV import supports set-name mapping and id-based number parsing</li><li><strong>My Decks:</strong> Per-card badges show exact owned count for that print</li><li><strong>\u2728 Indicator:</strong> Shows when other international prints of same card exist in your collection</li><li><strong>Rarity Switcher (\u2605):</strong> Swap print directly from saved deck cards</li><li><strong>Compare (\u2696\ufe0f):</strong> Choose source (paste Limitless/PTCGL or search saved decks)</li><li><strong>Compare Mode:</strong> Functional (prints merged) or Exact print</li><li><strong>Wishlist + Settings:</strong> Manage targets and account preferences</li></ul><hr style="margin:14px 0;border:none;border-top:1px solid #ddd;"><p style="font-weight:700;margin:0 0 6px;">Card Action Buttons:</p><ul><li>\u2661 <strong>Wishlist</strong> \u2014 Add or remove this card from your wishlist</li><li>+ <strong>Collection</strong> \u2014 Add card to your collection (shows owned count)</li><li>\u2605 <strong>Show Other Prints</strong> \u2014 Swap to a different print of the same card</li><li>L <strong>Open Limitless Card Details</strong> \u2014 View card info on limitlesstcg.com</li><li>P <strong>Add to Proxy Printer</strong> \u2014 Send card to the proxy print queue</li><li>\u20ac <strong>Cardmarket</strong> \u2014 Search this card on Cardmarket</li></ul>'
            },
            'calculator': {
                title: '\ud83e\uddee Probability Calculator',
                html: '<p>Calculate draw, prize, and topdeck odds for your deck.</p><ul><li><strong>Draw Chance:</strong> Probability to see at least one copy in drawn cards</li><li><strong>Prize Chance:</strong> Probability that at least one copy is in your prizes</li><li><strong>Topdeck Chance:</strong> Probability your next draw is the target card</li><li><strong>Inputs:</strong> Copies in deck, cards drawn, and already-in-hand correction</li></ul>'
            },
            'tutorial': {
                title: '\ud83d\udcd6 How to Use',
                html: '<p>Comprehensive guide to all features of this website.</p><ul><li><strong>Tab Guides:</strong> Detailed instructions for every section</li><li><strong>Latest Changes:</strong> Tech-Slots (up to 10 forced cards), multi-source "Build vs ..." anti-tech modal, Tech-vs-Normal compare panel at page-bottom, bidirectional \u2191 Max Rarity \u2194 \u2193 Low Rarity toggle, Math.round + Reverse-LRM in the Consistency Generator (matches per-card avg the UI displays), and the 100% cap on Major-only card-share merges.</li><li><strong>Tech-Slots:</strong> Above each Deck Builder grid \u2014 typeahead picker, max 10, persisted across reloads. Cards in the slots get force-pinned into Stage-0 of the next Consistency Generate.</li><li><strong>Build vs ...:</strong> Pick a target archetype + aggression preset. The TechAudit pipeline auto-fills your Tech-Slots with the best counter cards across active threat categories.</li><li><strong>Tech vs Normal:</strong> Page-bottom panel \u2014 diff between your latest Normal build and your latest Tech build for the same source. Three columns + score delta.</li><li><strong>Compare Notes:</strong> Paste parser live preview + Functional/Exact compare modes</li><li><strong>Import Notes:</strong> Dex CSV set-name + set-number matching behavior explained</li></ul>'
            },
            'meta-analysis-hub': {
                title: '\ud83d\udcca Meta & Deck Analysis Hub',
                html: '<p>The starting page for every meta + deck data view. Pick a category tile to drill into one of the six data sources.</p><ul><li><strong>City League Meta:</strong> Weekly Japanese meta snapshot \u2014 archetype share, tier list, top-N variants combined by main Pok\u00e9mon.</li><li><strong>Deck Analysis (Japan):</strong> Card overview + per-card statistics for any City-League archetype.</li><li><strong>Current Meta (Global):</strong> Limitless Online tier list, top archetypes, climbers / fallers, full comparison table.</li><li><strong>Deck Analysis (Global):</strong> Same depth as the Japan tab but for global online tournaments \u2014 plus Cooking Mode for power-user fusion + matchup analysis.</li><li><strong>Past Meta:</strong> Historical Labs-only snapshot of the previous rotation. Use it to baseline current decks against where the format started.</li><li><strong>Meta Call:</strong> Predicted meta share for your next tournament. Blends online + Major data with your own estimates.</li></ul><p><strong>Card Legend:</strong> Below the tile grid, a mock card explains every badge, button, and stat line you\u2019ll encounter on real cards \u2014 max-count, deck-count, wishlist heart, owned-other-prints, set + inclusion rate, avg-counts, action buttons, and the cooking-mode pin + exclude row.</p>'
            },
            'meta-call': {
                title: '\ud83d\udcca Meta Call',
                html: '<p>Predict what the meta will look like at your next tournament \u2014 then tune the prediction with your own gut feel.</p><ul><li><strong>Two variants:</strong> <em>Current</em> blends the still-running Limitless Online rotation with the latest Majors, applies a concentration counter, and damps hype. <em>Past</em> shows the frozen Labs-only snapshot of the previous rotation \u2014 a clean baseline.</li><li><strong>Override panel:</strong> Bump any archetype up or down. Your overrides are saved locally and re-applied on the next visit.</li><li><strong>Final share:</strong> Three-column read-out (Online / Estimated / Final) so you can see exactly where your overrides moved the prediction.</li><li><strong>Expected encounters:</strong> Per-round expected meet rate against each archetype, weighted by your final share.</li><li><strong>Recommendations:</strong> Combined archetype share + your build\u2019s vanilla winrate against the predicted field. Includes a "Your Build vs Vanilla" panel.</li><li><strong>Telegram bot:</strong> /metacall in the bot sends both the per-variant and family-grouped PNGs of this dashboard \u2014 same data, ready to paste into a tournament chat.</li></ul>'
            },
            'tech-lab': {
                title: '\ud83d\udd2c Tech Lab',
                html: '<p>For any card in the current meta, surface every other meta card that has a winning card-text interaction against it.</p><ul><li><strong>Target search:</strong> Type any name (English, German, or set+number). Picker lists matching cards with a thumbnail \u2014 pick one to set the target.</li><li><strong>Beats / Beaten-by lists:</strong> Each row is one card + a one-line narrative of WHY it wins the interaction (e.g. "ability lock against the target\u2019s draw engine").</li><li><strong>Confidence chip:</strong> high / medium / low based on how directly the card text answers the threat category.</li><li><strong>Local overrides:</strong> Tap a card to mark wrong suggestions as hidden, or add ones the engine missed. Edits persist in localStorage and are visible the next time you open the view.</li><li><strong>Foundation:</strong> Pattern library is intentionally narrow and grows over time \u2014 missing interactions are usually a coverage gap, not a wrong call.</li></ul>'
            },
            'battle-journal': {
                title: '\ud83d\udcd3 Battle Journal',
                html: '<p>Personal match log so you can track results, archetypes, and notes per game \u2014 useful for testing weeks before a Regional.</p><ul><li><strong>Quick log:</strong> Pick your deck, pick the opponent\u2019s deck, mark W / L / T, add a note. Saves immediately to your profile.</li><li><strong>Per-deck stats:</strong> Aggregate WR per deck + per opponent over your full history.</li><li><strong>Trend chart:</strong> WR over time so you can see whether a deck is climbing or settling.</li><li><strong>Filters:</strong> By format, by deck, by date range \u2014 narrow to "what worked against Dragapult in the last two weeks".</li><li><strong>Cloud sync:</strong> Linked to your profile; switches devices stay in sync.</li></ul>'
            },
            'meta-binder': {
                title: '\ud83d\udcdf Meta Binder',
                html: '<p>Generates a printable A4 binder layout containing one copy of every meta-relevant card across the current rotation \u2014 your testing reference, organised set by set.</p><ul><li><strong>Auto-build:</strong> Pulls the union of every Tier-1 / Tier-2 deck\u2019s top cards plus key staples.</li><li><strong>Custom binder:</strong> Drop into custom mode to manually pick which cards / sets are included.</li><li><strong>Print layout:</strong> 9-pocket grid optimised for 6.3\u202fcm \u00d7\u202f8.8\u202fcm sleeves with Cardmarket pricing per slot.</li><li><strong>Load last saved:</strong> One-click reload of your previously saved layout.</li></ul>'
            },
            'testing-groups': {
                title: '\ud83d\udc65 Testing Groups',
                html: '<p>Create or join a small group of testers and share match results, decklists, and meta calls in one place.</p><ul><li><strong>Create a group:</strong> Sets a join link you can share with team-mates. Each member sees the group dashboard.</li><li><strong>Shared journal:</strong> Match logs from every member roll up into one trend chart so the group can see what\u2019s working.</li><li><strong>Shared Meta Call:</strong> Override the group prediction together \u2014 last edit wins, edit history visible.</li><li><strong>Privacy:</strong> Group data is scoped to members only; nothing leaks to the global views.</li></ul>'
            },
            'custom-binder': {
                title: '\ud83d\udcd2 Custom Binder',
                html: '<p>Generates a printable A4 binder layout for archetypes you pick yourself \u2014 same engine as Meta Binder but with full control over the deck list.</p><ul><li><strong>Archetype picker:</strong> Search and tick the archetypes you want included. Add as many as you need.</li><li><strong>Same printout:</strong> 9-pocket grid optimised for 6.3\u202fcm \u00d7 8.8\u202fcm sleeves with Cardmarket pricing per slot.</li><li><strong>Save / load:</strong> Each custom selection can be named and reloaded with one click.</li><li><strong>Use case:</strong> Travel binder for a specific event, league prep, or testing a narrow set of decks.</li></ul>'
            },
            'wishlist': {
                title: '\u2764\ufe0f Wishlist',
                html: '<p>Mark the cards you still need so you can find them quickly while browsing or trading.</p><ul><li><strong>Add cards:</strong> Tap the \u2661 heart on any card in the Card Database, Deck Builder, or analysis views.</li><li><strong>Search + filter:</strong> Narrow by set, type, rarity, or text \u2014 same filters as Card Database.</li><li><strong>Cardmarket links:</strong> Every wishlist row has a \u20ac button that opens a Cardmarket search for that exact card.</li><li><strong>Cloud sync:</strong> Linked to your profile \u2014 device switches stay in sync.</li><li><strong>Collection cross-check:</strong> Cards you already own get an indicator so you don\u2019t buy duplicates.</li></ul>'
            },
            'draw-simulator': {
                title: '\ud83c\udfb4 Draw Simulator',
                html: '<p>Simulate opening hands, prize cards, and turn 1 / turn 2 setup against any deck list.</p><ul><li><strong>Paste or load:</strong> Paste a Limitless / PTCGL deck list or load one of your saved decks.</li><li><strong>Opening hand draws:</strong> Shuffles, draws 7, then any number of additional cards you choose.</li><li><strong>Prize lock check:</strong> Shows which cards from the deck landed in prizes so you can stress-test thin lines.</li><li><strong>Mulligan tracking:</strong> Counts how many no-basic openings you would have had over N runs.</li><li><strong>Combo probability:</strong> Pair with the Calculator tab to compute the exact odds of seeing the cards you just simulated.</li></ul>'
            }
        };

        const TAB_HELP_CONTENT_DE = {
            'city-league': {
                title: '\ud83c\uddef\ud83c\uddf5 City League Entwicklung',
                html: '<p>Zeigt Trends der Archetyp-Popularitaet aus japanischen City-League-Turnieren.</p><ul><li><strong>Diagramm:</strong> Verfolgt Deck-Archetypen ueber die Zeit</li><li><strong>Format-Filter:</strong> Wechsel zwischen M4 (aktuell) und M3 (Archiv)</li><li><strong>Legenden-Toggle:</strong> Archetypen ein- und ausblenden</li><li><strong>Deck-Builder-Sync:</strong> Archetyp oeffnen und direkt zur Deck-Analyse wechseln</li></ul>'
            },
            'city-league-analysis': {
                title: '\ud83e\udd85 City League Deck-Analyse',
                html: '<p>Durchsuche und analysiere einzelne Decklisten aus City-League-Turnieren.</p><ul><li><strong>Archetyp- und Datumsfilter:</strong> Daten schnell eingrenzen</li><li><strong>Deck Builder:</strong> Karten hinzufuegen/entfernen und 60-Karten-Deck bauen</li><li><strong>Consistency Generate:</strong> Math.round auf den Pro-Karte-Schnitt avg-when-used + Largest-Remainder-Method + Reverse-LRM. Trifft exakt 60 Karten und matcht die Intuition (Poke Pad 2.8 \u2192 3, Lillie\'s 3.9 \u2192 4).</li><li><strong>Tech-Slots (max 10):</strong> Die Leiste ueber dem Deck-Grid laesst dich bis zu 10 Karten via Typeahead-Suche fixieren \u2014 sie fliessen als Force-Pins in Stage-0 vom naechsten Generate und ueberleben Reloads.</li><li><strong>Build vs ...:</strong> Button im Tech-Slot-Header. Ziel-Archetyp + Aggression (Mild / Standard / Heavy) waehlen. TechAudit waehlt Counter-Karten ueber aktive Bedrohungs-Kategorien und fuellt die Tech-Slots automatisch \u2014 du siehst was gewaehlt wurde und kannst nachjustieren.</li><li><strong>\u2191 Max Seltenheit / \u2193 Low Seltenheit Toggle:</strong> Ein Klick wechselt alle Karten im gebauten Deck zwischen Low- und Max-Rarity-Prints. Label flippt, Reset bei jedem frischen Generate.</li><li><strong>Tech vs Normal Panel:</strong> Diff am Seitenende zwischen letztem Normal-Build und letztem Tech-Build fuer diesen Bereich. Drei Spalten (Ergaenzt / Entfernt / Mengenaenderungen) + Score-Delta. Erscheint erst wenn beide Snapshots existieren.</li><li><strong>Seltenheits-Wechsler (\u2605):</strong> Prints direkt in Deck und Uebersicht wechseln</li><li><strong>Exakter Print-Tausch:</strong> Wechsel aktualisiert den Deck-Eintrag (Set+Nummer)</li><li><strong>Deck kopieren:</strong> Export im Pokemon-TCG-Live-Format</li></ul><hr style="margin:14px 0;border:none;border-top:1px solid #ddd;"><p style="font-weight:700;margin:0 0 6px;">Karten-Aktionstasten:</p><ul><li>\u2661 <strong>Wunschliste</strong> \u2014 Karte zur Wunschliste hinzufuegen/entfernen</li><li>+ <strong>Sammlung</strong> \u2014 Karte zur Sammlung hinzufuegen (zeigt Anzahl)</li><li>\u2605 <strong>Andere Prints zeigen</strong> \u2014 Zu einem anderen Print derselben Karte wechseln</li><li>L <strong>Limitless Kartendetails</strong> \u2014 Karteninfos auf limitlesstcg.com ansehen</li><li>P <strong>Zum Proxy-Drucker</strong> \u2014 Karte in die Proxy-Druckliste senden</li><li>\u20ac <strong>Cardmarket</strong> \u2014 Karte auf Cardmarket suchen</li></ul>'
            },
            'current-meta': {
                title: '\ud83c\udfae Limitless-Online-Vergleich',
                html: '<p>Vergleicht Meta-Anteile von Archetypen zwischen verschiedenen Turnierquellen.</p><ul><li><strong>Nebeneinander-Vergleich:</strong> Online vs. Turnierergebnisse</li><li><strong>Diagramme:</strong> Kreis- und Balkenansichten</li><li><strong>Meta-Share %:</strong> Schnellueberblick zur Popularitaet</li><li><strong>Fallback:</strong> Fehlt current_meta_card_data.csv, nutzt die App automatisch tournament_cards_data_cards.csv</li></ul>'
            },
            'current-analysis': {
                title: '\ud83d\udcc8 Aktuelle-Meta Deck-Analyse',
                html: '<p>Analysiere Decklisten aus aktuellen Limitless-Online-Turnieren.</p><ul><li><strong>Archetyp-Filter:</strong> Decks nach Archetyp durchsuchen</li><li><strong>Kartenverteilung:</strong> Meistgespielte Karten und Nutzung</li><li><strong>Deck Builder:</strong> Decks interaktiv bauen und anpassen</li><li><strong>Consistency Generate:</strong> Math.round auf den Pro-Karte-Schnitt avg-when-used + Largest-Remainder + Reverse-LRM. Summiert exakt auf 60 und matcht die UI-Werte (Poke Pad 2.8 \u2192 3, Lillie\'s 3.9 \u2192 4, Ultra Ball 2.3 \u2192 2 mit moeglichem LRM-Bump).</li><li><strong>Tech-Slots (max 10):</strong> Die Leiste ueber dem Deck-Grid laesst dich bis zu 10 Karten per Typeahead fixieren \u2014 werden als Force-Pins in Stage-0 vom naechsten Generate eingebaut. Persistiert in localStorage.</li><li><strong>Build vs ...:</strong> Modal neben dem Generate-Button. Ziel-Archetyp + Aggression waehlen. TechAudit fuellt die Tech-Slots automatisch mit den besten Counter-Karten ueber aktive Bedrohungs-Kategorien (Hand Disruption, Ability Lock, Retreat Lock, Bench Damage etc.).</li><li><strong>\u2191 Max Seltenheit / \u2193 Low Seltenheit Toggle:</strong> Ein Klick wechselt alle Karten im gebauten Deck zwischen Low- und Max-Rarity-Prints. Bidirektional. Reset bei jedem frischen Generate.</li><li><strong>Tech vs Normal Panel:</strong> Diff am Seitenende zwischen letztem Normal- und Tech-Build \u2014 Ergaenzt / Entfernt / Mengenaenderungen + Score-Delta. Erscheint nur wenn beide Snapshots existieren.</li><li><strong>Seltenheits-Wechsler (\u2605):</strong> Internationale Prints mit einem Klick wechseln</li><li><strong>Combined Variants:</strong> Prints derselben Karte (z.B. Riolu MEG 76 = Riolu ASC 112) werden automatisch zusammengefuehrt \u2014 der Anteil zeigt die tatsaechliche Popularitaet. Card-Share ist auf 100% gekappt um Major-only Merge-Edge-Cases abzufangen.</li></ul><hr style="margin:14px 0;border:none;border-top:1px solid #ddd;"><p style="font-weight:700;margin:0 0 6px;">Karten-Aktionstasten:</p><ul><li>\u2661 <strong>Wunschliste</strong> \u2014 Karte zur Wunschliste hinzufuegen/entfernen</li><li>+ <strong>Sammlung</strong> \u2014 Karte zur Sammlung hinzufuegen (zeigt Anzahl)</li><li>\u2605 <strong>Andere Prints zeigen</strong> \u2014 Zu einem anderen Print derselben Karte wechseln</li><li>L <strong>Limitless Kartendetails</strong> \u2014 Karteninfos auf limitlesstcg.com ansehen</li><li>P <strong>Zum Proxy-Drucker</strong> \u2014 Karte in die Proxy-Druckliste senden</li><li>\u20ac <strong>Cardmarket</strong> \u2014 Karte auf Cardmarket suchen</li></ul>'
            },
            'past-meta': {
                title: '\ud83c\udfc6 Vergangenes Turnier-Meta',
                html: '<p>Historische Turnierdaten grosser Events (Regionals, EUIC, Worlds usw.).</p><ul><li><strong>Format-Filter:</strong> Nach Formatcode filtern (z. B. TEF-SCR, OBF-TWM)</li><li><strong>Quellen-Filter:</strong> Turniere/Regionen auswaehlen</li><li><strong>Volle Deck-Analyse:</strong> Inklusive Builder, Kopieren, Vergleichen und \u2605 Print-Wechsel</li><li><strong>Consistency Generate:</strong> Math.round + Largest-Remainder + Reverse-LRM landet exakt auf 60 Karten und respektiert den Pro-Karte-Schnitt avg-when-used.</li><li><strong>Tech-Slots (max 10):</strong> Leiste ueber dem Deck-Grid laesst dich bis zu 10 Karten per Typeahead in Stage-0 vom naechsten Generate fixieren.</li><li><strong>Build vs ...:</strong> Anti-Tech-Modal funktioniert auch hier \u2014 Archetyp + Aggression waehlen, TechAudit fuellt die Tech-Slots mit Counter-Karten.</li><li><strong>\u2191 Max Seltenheit / \u2193 Low Seltenheit Toggle:</strong> Ein-Klick-Wechsel zwischen Low- und Max-Rarity-Prints fuer das ganze gebaute Deck.</li><li><strong>Tech vs Normal Panel:</strong> Karten-Diff + Score-Delta am Seitenende zwischen letztem Normal- und Tech-Build.</li><li><strong>Historische Trends:</strong> Deck-Entwicklung ueber Formate verfolgen</li></ul><hr style="margin:14px 0;border:none;border-top:1px solid #ddd;"><p style="font-weight:700;margin:0 0 6px;">Karten-Aktionstasten:</p><ul><li>\u2661 <strong>Wunschliste</strong> \u2014 Karte zur Wunschliste hinzufuegen/entfernen</li><li>+ <strong>Sammlung</strong> \u2014 Karte zur Sammlung hinzufuegen (zeigt Anzahl)</li><li>\u2605 <strong>Andere Prints zeigen</strong> \u2014 Zu einem anderen Print derselben Karte wechseln</li><li>L <strong>Limitless Kartendetails</strong> \u2014 Karteninfos auf limitlesstcg.com ansehen</li><li>P <strong>Zum Proxy-Drucker</strong> \u2014 Karte in die Proxy-Druckliste senden</li><li>\u20ac <strong>Cardmarket</strong> \u2014 Karte auf Cardmarket suchen</li></ul>'
            },
            'cards': {
                title: '\ud83e\uddf0 Kartendatenbank',
                html: '<p>Durchsuche die vollstaendige Pokemon-TCG-Kartendatenbank.</p><ul><li><strong>Suche + Filter:</strong> Name, Set, Typ, Seltenheit, Meta-Filter</li><li><strong>Sortierung:</strong> Sets von neu nach alt</li><li><strong>Seltenheits-Wechsler (\u2605):</strong> Verfuegbare Prints schnell auswaehlen</li><li><strong>Sammlungsanzahl:</strong> Exakte Print-Zaehlung per Set+Nummer</li><li><strong>Wunschliste:</strong> Zielkarten mit \u2764 markieren</li></ul><hr style="margin:14px 0;border:none;border-top:1px solid #ddd;"><p style="font-weight:700;margin:0 0 6px;">Karten-Aktionstasten:</p><ul><li>\u2661 <strong>Wunschliste</strong> \u2014 Karte zur Wunschliste hinzufuegen/entfernen</li><li>+ <strong>Sammlung</strong> \u2014 Karte zur Sammlung hinzufuegen (zeigt Anzahl)</li><li>\u2605 <strong>Andere Prints zeigen</strong> \u2014 Zu einem anderen Print derselben Karte wechseln</li><li>L <strong>Limitless Kartendetails</strong> \u2014 Karteninfos auf limitlesstcg.com ansehen</li><li>P <strong>Zum Proxy-Drucker</strong> \u2014 Karte in die Proxy-Druckliste senden</li><li>\u20ac <strong>Cardmarket</strong> \u2014 Karte auf Cardmarket suchen</li></ul>'
            },
            'proxy': {
                title: '\ud83d\udda8\ufe0f Proxy-Drucker',
                html: '<p>Erstelle druckbare Proxy-Karten fuer Tests und Casual Play.</p><ul><li><strong>Deck importieren:</strong> Deckliste einfuegen und Proxys automatisch erzeugen</li><li><strong>Manuell hinzufuegen:</strong> Einzelkarten suchen und hinzufuegen</li><li><strong>Drucklayout:</strong> Optimiert fuer 6.3cm x 8.8cm Kartenmass</li><li><strong>Mengen anpassen:</strong> Exakte Kopienzahl je Karte setzen</li><li><strong>@media print:</strong> Browserdruck erzeugt A4-Seiten mit korrekten Kartengroessen</li></ul><hr style="margin:14px 0;border:none;border-top:1px solid #ddd;"><p style="font-weight:700;margin:0 0 6px;">Seiten-Buttons:</p><ul><li>+ / \u2013 <strong>Menge</strong> \u2014 Kopienzahl pro Karte erhoehen oder verringern</li><li>\u2716 <strong>Entfernen</strong> \u2014 Karte aus der Proxy-Liste loeschen</li><li><strong>Deck importieren</strong> \u2014 Komplette Deckliste einfuegen, alle Karten laden</li><li><strong>Alle loeschen</strong> \u2014 Alle Karten aus der Proxy-Liste entfernen</li><li><strong>Drucken</strong> \u2014 Proxy-Bogen an den Browserdruck senden</li></ul>'
            },
            'profile': {
                title: '\ud83d\udc64 Benutzerprofil',
                html: '<p>Verwalte deine Sammlung, gespeicherte Decks und Einstellungen.</p><ul><li><strong>Meine Sammlung:</strong> Exakte Print-Anzahlen (Set+Nummer) mit Firebase-Sync</li><li><strong>Dex-Import:</strong> CSV-Import mit Setnamen-Mapping und nummernbasierter Erkennung</li><li><strong>Meine Decks:</strong> Badge pro Karte zeigt exakte Besitzanzahl fuer diesen Print</li><li><strong>\u2728 Indikator:</strong> Zeigt weitere internationale Prints derselben Karte in deiner Sammlung</li><li><strong>Seltenheits-Wechsler (\u2605):</strong> Prints direkt in gespeicherten Deckkarten wechseln</li><li><strong>Vergleich (\u2696\ufe0f):</strong> Quelle waehlen (Limitless/PTCGL oder gespeicherte Decks)</li><li><strong>Vergleichsmodus:</strong> Funktional (Prints zusammengefuehrt) oder exakter Print</li><li><strong>Wunschliste + Einstellungen:</strong> Ziele und Kontooptionen verwalten</li></ul><hr style="margin:14px 0;border:none;border-top:1px solid #ddd;"><p style="font-weight:700;margin:0 0 6px;">Karten-Aktionstasten:</p><ul><li>\u2661 <strong>Wunschliste</strong> \u2014 Karte zur Wunschliste hinzufuegen/entfernen</li><li>+ <strong>Sammlung</strong> \u2014 Karte zur Sammlung hinzufuegen (zeigt Anzahl)</li><li>\u2605 <strong>Andere Prints zeigen</strong> \u2014 Zu einem anderen Print derselben Karte wechseln</li><li>L <strong>Limitless Kartendetails</strong> \u2014 Karteninfos auf limitlesstcg.com ansehen</li><li>P <strong>Zum Proxy-Drucker</strong> \u2014 Karte in die Proxy-Druckliste senden</li><li>\u20ac <strong>Cardmarket</strong> \u2014 Karte auf Cardmarket suchen</li></ul>'
            },
            'calculator': {
                title: '\ud83e\uddee Wahrscheinlichkeitsrechner',
                html: '<p>Berechnet Zieh-, Preis- und Topdeck-Wahrscheinlichkeiten fuer dein Deck.</p><ul><li><strong>Zug-Chance:</strong> Wahrscheinlichkeit, mindestens eine Kopie in gezogenen Karten zu sehen</li><li><strong>Preiskarten-Chance:</strong> Wahrscheinlichkeit, dass mindestens eine Kopie in den Preisen liegt</li><li><strong>Topdeck-Chance:</strong> Wahrscheinlichkeit, dass der naechste Draw deine Zielkarte ist</li><li><strong>Eingaben:</strong> Kopien im Deck, gezogene Karten, bereits auf der Hand</li></ul>'
            },
            'tutorial': {
                title: '\ud83d\udcd6 Anleitung',
                html: '<p>Umfassender Guide zu allen Funktionen dieser Website.</p><ul><li><strong>Tab-Guides:</strong> Detaillierte Hinweise zu jedem Bereich</li><li><strong>Neueste Aenderungen:</strong> Tech-Slots (bis zu 10 forcierte Karten), Multi-Source \u201eBuild vs ..." Anti-Tech-Modal, Tech-vs-Normal Compare-Panel am Seitenende, bidirektionaler \u2191 Max Seltenheit \u2194 \u2193 Low Seltenheit Toggle, Math.round + Reverse-LRM im Consistency Generator (matcht den Pro-Karte-Schnitt aus der UI), und der 100%-Cap fuer Major-only Card-Share Merges.</li><li><strong>Tech-Slots:</strong> Ueber jedem Deck-Builder-Grid \u2014 Typeahead-Picker, max 10, persistiert ueber Reloads. Karten in den Slots werden als Force-Pins in Stage-0 vom naechsten Consistency Generate eingebaut.</li><li><strong>Build vs ...:</strong> Ziel-Archetyp + Aggression-Preset waehlen. Die TechAudit-Pipeline fuellt deine Tech-Slots automatisch mit den besten Counter-Karten ueber aktive Bedrohungs-Kategorien.</li><li><strong>Tech vs Normal:</strong> Panel am Seitenende \u2014 Diff zwischen deinem letzten Normal-Build und letzten Tech-Build fuer denselben Bereich. Drei Spalten + Score-Delta.</li><li><strong>Vergleichshinweise:</strong> Live-Parser-Vorschau + Funktional/Exakt-Modi</li><li><strong>Import-Hinweise:</strong> Dex-CSV Setnamen- und Setnummern-Matching erklaert</li></ul>'
            },
            'meta-analysis-hub': {
                title: '\ud83d\udcca Meta- & Deck-Analyse Hub',
                html: '<p>Der Startpunkt f\u00fcr alle Meta- und Deck-Daten-Ansichten. Tippe eine Kategorie-Kachel an, um in eine der sechs Datenquellen einzutauchen.</p><ul><li><strong>City League Meta:</strong> W\u00f6chentlicher japanischer Meta-Snapshot \u2014 Archetyp-Anteile, Tier-Liste, Top-Varianten gruppiert nach Haupt-Pok\u00e9mon.</li><li><strong>Deck Analyse (Japan):</strong> Karten-\u00dcbersicht + Pro-Karte-Statistiken f\u00fcr jeden City-League-Archetyp.</li><li><strong>Current Meta (Global):</strong> Limitless-Online Tier-Liste, Top-Archetypen, Climbers/Fallers, Full-Comparison-Tabelle.</li><li><strong>Deck Analyse (Global):</strong> Gleiche Tiefe wie der Japan-Tab, aber f\u00fcr globale Online-Turniere \u2014 plus Cooking Mode f\u00fcr Power-User-Fusion + Matchup-Analyse.</li><li><strong>Past Meta:</strong> Historischer Labs-only-Snapshot der vorherigen Rotation. Ideal als Baseline um aktuelle Decks gegen den Format-Start zu vergleichen.</li><li><strong>Meta Call:</strong> Vorhergesagter Meta-Anteil f\u00fcr dein n\u00e4chstes Turnier. Kombiniert Online + Major-Daten mit deinen eigenen Sch\u00e4tzungen.</li></ul><p><strong>Karten-Legende:</strong> Unter den Kacheln erkl\u00e4rt eine Beispielkarte alle Badges, Buttons und Stat-Zeilen, die du auf echten Karten siehst \u2014 Max-Anzahl, Deck-Count, Wishlist-Herz, andere Prints im Besitz, Set + Inklusionsrate, \u00d8-Anzahl, Aktions-Buttons und die Cooking-Mode-Reihe mit Pin + Exclude.</p>'
            },
            'meta-call': {
                title: '\ud83d\udcca Meta Call',
                html: '<p>Sage voraus, wie das Meta auf deinem n\u00e4chsten Turnier aussieht \u2014 und tune die Vorhersage mit deinem Bauchgef\u00fchl.</p><ul><li><strong>Zwei Varianten:</strong> <em>Current</em> kombiniert die noch laufende Limitless-Online-Rotation mit den neuesten Majors, wendet einen Konzentrations-Counter an und d\u00e4mpft Hype. <em>Past</em> zeigt den eingefrorenen Labs-only-Snapshot der vorherigen Rotation \u2014 eine saubere Baseline.</li><li><strong>Override-Panel:</strong> Push einzelne Archetypen hoch oder runter. Deine Overrides werden lokal gespeichert und beim n\u00e4chsten Besuch wieder angewendet.</li><li><strong>Finaler Anteil:</strong> Drei-Spalten-Ansicht (Online / Gesch\u00e4tzt / Final) damit du genau siehst, wo deine Overrides die Vorhersage verschoben haben.</li><li><strong>Erwartete Begegnungen:</strong> Pro-Runde Begegnungsrate gegen jeden Archetyp, gewichtet nach deinem finalen Anteil.</li><li><strong>Empfehlungen:</strong> Kombinierter Archetyp-Anteil + Vanilla-Winrate deines Builds gegen das vorhergesagte Feld. Enth\u00e4lt ein \u201eYour Build vs Vanilla"-Panel.</li><li><strong>Telegram-Bot:</strong> /metacall im Bot schickt sowohl die Per-Varianten- als auch die Familien-gruppierten PNGs dieses Dashboards \u2014 gleiche Daten, direkt nutzbar in einem Turnier-Chat.</li></ul>'
            },
            'tech-lab': {
                title: '\ud83d\udd2c Tech Lab',
                html: '<p>Findet zu jeder Karte im aktuellen Meta alle anderen Meta-Karten, die eine gewinnende Kartentext-Interaktion gegen sie haben.</p><ul><li><strong>Ziel-Suche:</strong> Tippe einen beliebigen Namen (Deutsch, Englisch oder Set+Nummer). Der Picker listet passende Karten mit Thumbnail \u2014 eine ausw\u00e4hlen setzt das Ziel.</li><li><strong>Beats / Beaten-by Listen:</strong> Jede Zeile ist eine Karte + ein Ein-Zeilen-Text, WARUM sie die Interaktion gewinnt (z. B. \u201eAbility Lock gegen den Draw-Engine des Ziels").</li><li><strong>Confidence-Chip:</strong> high / medium / low \u2014 basierend darauf, wie direkt der Kartentext die Bedrohungs-Kategorie beantwortet.</li><li><strong>Lokale Overrides:</strong> Tippe eine Karte an, um falsche Vorschl\u00e4ge auszublenden, oder f\u00fcge welche hinzu, die die Engine \u00fcbersehen hat. Edits werden in localStorage gespeichert und sind beim n\u00e4chsten Besuch wieder da.</li><li><strong>Foundation:</strong> Pattern-Library ist bewusst schmal und w\u00e4chst \u00fcber die Zeit \u2014 fehlende Interaktionen sind meist eine Coverage-L\u00fccke, kein Fehler.</li></ul>'
            },
            'battle-journal': {
                title: '\ud83d\udcd3 Battle Journal',
                html: '<p>Pers\u00f6nliches Match-Log um Ergebnisse, Archetypen und Notizen pro Spiel zu tracken \u2014 n\u00fctzlich f\u00fcr Testwochen vor einem Regional.</p><ul><li><strong>Quick-Log:</strong> Dein Deck w\u00e4hlen, Gegner-Deck w\u00e4hlen, W / L / T markieren, Notiz dazu. Speichert sofort in dein Profil.</li><li><strong>Per-Deck-Stats:</strong> Aggregierte WR pro Deck + pro Gegner \u00fcber deine komplette Historie.</li><li><strong>Trend-Chart:</strong> WR \u00fcber die Zeit, damit du siehst ob ein Deck steigt oder sich einpendelt.</li><li><strong>Filter:</strong> Nach Format, Deck, Datumsbereich \u2014 eingrenzen auf \u201ewas hat in den letzten zwei Wochen gegen Dragapult funktioniert".</li><li><strong>Cloud-Sync:</strong> Verkn\u00fcpft mit deinem Profil; Ger\u00e4tewechsel bleiben synchron.</li></ul>'
            },
            'meta-binder': {
                title: '\ud83d\udcdf Meta Binder',
                html: '<p>Generiert ein druckbares A4-Binder-Layout mit einer Kopie jeder meta-relevanten Karte \u00fcber die aktuelle Rotation \u2014 deine Test-Referenz, Set f\u00fcr Set organisiert.</p><ul><li><strong>Auto-Build:</strong> Zieht die Vereinigung der Top-Karten aller Tier-1/Tier-2-Decks plus wichtige Staples.</li><li><strong>Custom Binder:</strong> Wechsel in den Custom-Modus um manuell zu w\u00e4hlen, welche Karten / Sets enthalten sind.</li><li><strong>Print-Layout:</strong> 9-Pocket-Grid optimiert f\u00fcr 6,3 \u00d7 8,8 cm Sleeves mit Cardmarket-Preis pro Slot.</li><li><strong>Letzten geladen:</strong> Ein-Klick-Reload deines vorher gespeicherten Layouts.</li></ul>'
            },
            'testing-groups': {
                title: '\ud83d\udc65 Testing Groups',
                html: '<p>Erstelle oder tritt einer kleinen Gruppe von Testern bei und teilt Match-Ergebnisse, Decklisten und Meta-Calls an einem Ort.</p><ul><li><strong>Gruppe erstellen:</strong> Setzt einen Join-Link den du mit Team-Mitgliedern teilen kannst. Jedes Mitglied sieht das Gruppen-Dashboard.</li><li><strong>Geteiltes Journal:</strong> Match-Logs aller Mitglieder rollen in einen Trend-Chart auf, damit die Gruppe sieht was funktioniert.</li><li><strong>Geteilter Meta Call:</strong> Override die Gruppen-Vorhersage gemeinsam \u2014 letzter Edit gewinnt, Edit-Historie sichtbar.</li><li><strong>Privacy:</strong> Gruppendaten sind auf Mitglieder beschr\u00e4nkt; nichts leakt in die globalen Ansichten.</li></ul>'
            },
            'custom-binder': {
                title: '\ud83d\udcd2 Custom Binder',
                html: '<p>Erzeugt ein druckbares A4-Binder-Layout f\u00fcr selbst gew\u00e4hlte Archetypen \u2014 gleiche Engine wie der Meta Binder, aber du bestimmst die Decks.</p><ul><li><strong>Archetyp-Picker:</strong> Suche und hake die Archetypen an, die du dabeihaben willst. Beliebig viele.</li><li><strong>Gleicher Ausdruck:</strong> 9-Pocket-Grid optimiert f\u00fcr 6,3 \u00d7 8,8 cm Sleeves mit Cardmarket-Preis pro Slot.</li><li><strong>Speichern / Laden:</strong> Jede Custom-Auswahl kann benannt und mit einem Klick wieder geladen werden.</li><li><strong>Anwendungsfall:</strong> Reise-Binder f\u00fcr ein bestimmtes Event, Liga-Vorbereitung oder Testen einer schmalen Auswahl an Decks.</li></ul>'
            },
            'wishlist': {
                title: '\u2764\ufe0f Wunschliste',
                html: '<p>Markiere die Karten, die dir noch fehlen, damit du sie beim Browsen oder Tauschen schnell findest.</p><ul><li><strong>Karten hinzuf\u00fcgen:</strong> Tippe auf das \u2661-Herz an jeder Karte in der Kartendatenbank, im Deck Builder oder in den Analyse-Ansichten.</li><li><strong>Suche + Filter:</strong> Eingrenzen nach Set, Typ, Seltenheit oder Text \u2014 dieselben Filter wie in der Kartendatenbank.</li><li><strong>Cardmarket-Links:</strong> Jede Zeile hat einen \u20ac-Button, der eine Cardmarket-Suche f\u00fcr genau diese Karte \u00f6ffnet.</li><li><strong>Cloud-Sync:</strong> Mit deinem Profil verkn\u00fcpft \u2014 Ger\u00e4tewechsel bleiben synchron.</li><li><strong>Sammlungs-Abgleich:</strong> Karten die du bereits besitzt bekommen einen Indikator, damit du keine Duplikate kaufst.</li></ul>'
            },
            'draw-simulator': {
                title: '\ud83c\udfb4 Draw-Simulator',
                html: '<p>Simuliere Starth\u00e4nde, Preiskarten und das Setup f\u00fcr Zug 1 / Zug 2 gegen eine beliebige Deckliste.</p><ul><li><strong>Einf\u00fcgen oder laden:</strong> Limitless- / PTCGL-Deckliste einf\u00fcgen oder ein gespeichertes Deck laden.</li><li><strong>Starthand-Draws:</strong> Mischt, zieht 7 Karten und beliebig viele zus\u00e4tzliche, die du w\u00e4hlst.</li><li><strong>Prize-Lock-Check:</strong> Zeigt welche Karten aus dem Deck in den Preisen gelandet sind \u2014 perfekt um d\u00fcnne Linien zu stresstesten.</li><li><strong>Mulligan-Tracking:</strong> Z\u00e4hlt wie viele No-Basic-Hands du \u00fcber N Runs gehabt h\u00e4ttest.</li><li><strong>Kombo-Wahrscheinlichkeit:</strong> Zusammen mit dem Calculator-Tab kannst du die exakten Odds berechnen, die Karten zu sehen, die du gerade simuliert hast.</li></ul>'
            }
        };

        function openTabHelp(tabId) {
            const lang = typeof window.getLang === 'function' ? window.getLang() : 'en';
            const helpSet = lang === 'de' ? TAB_HELP_CONTENT_DE : TAB_HELP_CONTENT;
            const help = helpSet[tabId] || TAB_HELP_CONTENT[tabId];
            if (!help) return;
            const modal = document.getElementById('helpModal');
            if (!modal) return;
            modal.querySelector('.help-modal-title').textContent = help.title;
            modal.querySelector('.help-modal-body').innerHTML = help.html;
            modal.classList.add('active');
        }

        function closeHelpModal() {
            const modal = document.getElementById('helpModal');
            if (modal) modal.classList.remove('active');
        }

        // ============================================================
        // GLOBAL DECK SORT HELPERS (Official Pokémon TCG Sort Order)
        // ============================================================
        window.getCardSortPriority = function(card) {
            const supertype = card.supertype || '';
            const subtypes = card.subtypes || [];

            if (supertype === 'Pokémon') return 1;

            if (supertype === 'Trainer') {
                if (subtypes.includes('Supporter')) return 2;
                if (subtypes.includes('Item')) return 3;
                if (subtypes.includes('Pokémon Tool') || subtypes.includes('Tool')) return 4;
                if (subtypes.includes('Stadium')) return 5;
                return 6; // Fallback für unbekannte Trainer
            }

            if (supertype === 'Energy') {
                if (subtypes.includes('Special')) return 7;
                if (subtypes.includes('Basic')) return 8;
                return 9; // Fallback für unbekannte Energien
            }

            return 10; // Catch-all
        };

        // (2026-06-10 audit) window.sortDeckCards removed — zero callers.
        // The deck-builder rendering path uses sortCardsByType()
        // (app-deck-builder.js) which sorts by category + element + share,
        // and the cards-database path uses cards-db's own sorter. This
        // helper was an early/legacy alphabetical fallback never wired up.

        // CRITICAL: Initialize deck objects immediately to prevent undefined errors
        window.cityLeagueDeck = window.cityLeagueDeck || {};
        window.cityLeagueDeckOrder = window.cityLeagueDeckOrder || [];
        window.currentMetaDeck = window.currentMetaDeck || {};
        window.currentMetaDeckOrder = window.currentMetaDeckOrder || [];
        window.pastMetaDeck = window.pastMetaDeck || {};
        window.pastMetaDeckOrder = window.pastMetaDeckOrder || [];
        window.currentCityLeagueArchetype = window.currentCityLeagueArchetype || null;
        window.currentMetaArchetype = window.currentMetaArchetype || null;
        window.pastMetaCurrentArchetype = window.pastMetaCurrentArchetype || null;
        window.proxyQueue = window.proxyQueue || [];

        const PROXY_IMPORT_TIMEOUT_MS = 10000;
        const PROXY_MANUAL_SUGGESTIONS_ID = 'proxyManualNameSuggestions';
        let proxyManualSearchIndex = [];
        let proxyManualSearchIndexReady = false;
        const proxyActionState = Object.create(null);

        function normalizeProxySetCode(setCode) {
            const raw = String(setCode || '').trim();
            if (!raw || raw === '???') return '';
            return raw.toUpperCase();
        }

        function normalizeProxyCardNumber(cardNumber) {
            const raw = String(cardNumber || '').trim();
            if (!raw || raw === '?') return '';
            return raw;
        }

        function buildProxyItemId(cardName, setCode, cardNumber) {
            return `${String(cardName || '').trim().toLowerCase()}|${normalizeProxySetCode(setCode)}|${normalizeProxyCardNumber(cardNumber)}`;
        }

        function parseProxyCount(value, fallbackValue = 1) {
            const parsed = parseInt(value, 10);
            if (!Number.isFinite(parsed) || parsed <= 0) return fallbackValue;
            return parsed;
        }

        function getCardDisplayName(card) {
            return String(card?.name_en || card?.name || '').trim();
        }

        function getCardSetCode(card) {
            return normalizeProxySetCode(card?.set || card?.set_code || '');
        }

        function getCardNumber(card) {
            return normalizeProxyCardNumber(card?.number || card?.set_number || '');
        }

        function createCardSkeletonMarkup(count = 10) {
            return Array.from({ length: count }, () => `
                <div class="card-skeleton" aria-hidden="true">
                    <div class="card-skeleton-image"></div>
                    <div class="card-skeleton-line card-skeleton-line-title"></div>
                    <div class="card-skeleton-line"></div>
                    <div class="card-skeleton-actions">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                </div>
            `).join('');
        }

        function setGridLoadingSkeleton(gridOrId, count = 10) {
            const grid = typeof gridOrId === 'string' ? document.getElementById(gridOrId) : gridOrId;
            if (!grid) return;
            grid.classList.add('card-grid-loading');
            grid.innerHTML = createCardSkeletonMarkup(count);
            // Auto-timeout: show error if skeleton is still visible after 30s
            if (grid._skeletonTimer) clearTimeout(grid._skeletonTimer);
            grid._skeletonTimer = setTimeout(function () {
                if (grid.classList.contains('card-grid-loading')) {
                    grid.innerHTML = '<div class="skeleton-error-message">' +
                        'Loading took too long.<br>' +
                        '<span class="retry-link" onclick="location.reload()">Reload page</span>' +
                        '</div>';
                    grid.classList.remove('card-grid-loading');
                }
            }, 30000);
        }

        function clearGridLoadingSkeleton(gridOrId) {
            const grid = typeof gridOrId === 'string' ? document.getElementById(gridOrId) : gridOrId;
            if (!grid) return;
            grid.classList.remove('card-grid-loading');
            if (grid._skeletonTimer) { clearTimeout(grid._skeletonTimer); grid._skeletonTimer = null; }
        }

        // The deferred Playtester loader + its 7 entry-point wrappers
        // (openPlaytester / openPlaytesterSetup / startStandalonePlaytester
        // / parseSandboxDeckToExactPrints / openMultiplayerFromSandbox /
        // …) were retired with the in-app sandbox. External Playtester
        // routing now lives in tcg-showdown-link.js. The loader pointed
        // at js/playtester*.js + js/firebase-multiplayer.js — all four
        // files no longer exist in the repo, so every wrapped call
        // resolved to a 404. Removed 2026-06-12 per AUDIT_GITHUB.md F-01.

        function buildProxyManualSearchIndex() {
            const cards = Array.isArray(window.allCardsDatabase) ? window.allCardsDatabase : [];
            if (cards.length === 0) {
                proxyManualSearchIndex = [];
                proxyManualSearchIndexReady = false;
                return;
            }

            const byName = new Map();
            cards.forEach(card => {
                const displayName = getCardDisplayName(card);
                if (!displayName) return;

                const normalized = normalizeCardName(displayName);
                if (!normalized) return;

                const current = byName.get(normalized);
                const setCode = getCardSetCode(card);
                const setNumber = getCardNumber(card);
                const setOrder = setOrderMap && setCode ? (setOrderMap[setCode] || 0) : 0;

                if (!current) {
                    byName.set(normalized, {
                        normalized,
                        name: displayName,
                        set: setCode,
                        number: setNumber,
                        setOrder,
                        rarity: String(card?.rarity || ''),
                        type: String(card?.type || '')
                    });
                    return;
                }

                // Prefer newer set entries for proxy default print selection.
                if (setOrder > current.setOrder) {
                    current.name = displayName;
                    current.set = setCode;
                    current.number = setNumber;
                    current.setOrder = setOrder;
                    current.rarity = String(card?.rarity || '');
                    current.type = String(card?.type || '');
                }
            });

            proxyManualSearchIndex = Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
            proxyManualSearchIndexReady = true;
        }

        async function ensureProxyManualSearchReady() {
            if (!Array.isArray(window.allCardsDatabase) || window.allCardsDatabase.length === 0) {
                try {
                    await loadAllCardsDatabase();
                } catch (e) {
                    console.warn('[Proxy] Could not load card DB for manual search:', e);
                }
            }

            if (!proxyManualSearchIndexReady || proxyManualSearchIndex.length === 0) {
                buildProxyManualSearchIndex();
            }
        }

        function getProxyManualNameSuggestions(searchTerm, limit = 30) {
            const term = normalizeCardName(searchTerm);
            if (!term || term.length < 2 || proxyManualSearchIndex.length === 0) return [];

            const startsWith = [];
            const contains = [];
            for (const entry of proxyManualSearchIndex) {
                if (entry.normalized.startsWith(term)) {
                    startsWith.push(entry);
                } else if (entry.normalized.includes(term)) {
                    contains.push(entry);
                }

                if (startsWith.length >= limit) break;
            }

            const remaining = Math.max(0, limit - startsWith.length);
            return remaining > 0 ? startsWith.concat(contains.slice(0, remaining)) : startsWith;
        }

        function updateProxyManualNameSuggestions() {
            const nameInput = document.getElementById('proxyManualName');
            const datalist = document.getElementById(PROXY_MANUAL_SUGGESTIONS_ID);
            if (!nameInput || !datalist) return;

            const suggestions = getProxyManualNameSuggestions(nameInput.value || '');
            datalist.innerHTML = suggestions.map(entry => {
                const printInfo = entry.set && entry.number ? `${entry.set} ${entry.number}` : 'unknown print';
                const value = window.escapeHtmlAttr(entry.name);
                const label = window.escapeHtmlAttr(printInfo);
                return `<option value="${value}" label="${label}"></option>`;
            }).join('');
        }

        function findProxyManualCardEntry(name) {
            const normalizedInput = normalizeCardName(name);
            if (!normalizedInput || proxyManualSearchIndex.length === 0) return null;

            const exact = proxyManualSearchIndex.find(entry => entry.normalized === normalizedInput);
            if (exact) return exact;

            const startsWith = proxyManualSearchIndex.find(entry => entry.normalized.startsWith(normalizedInput));
            if (startsWith) return startsWith;

            return proxyManualSearchIndex.find(entry => entry.normalized.includes(normalizedInput)) || null;
        }

        function applyProxyManualSelectionFromName() {
            const nameInput = document.getElementById('proxyManualName');
            const setInput = document.getElementById('proxyManualSet');
            const numberInput = document.getElementById('proxyManualNumber');
            if (!nameInput || !setInput || !numberInput) return;

            const entry = findProxyManualCardEntry(nameInput.value || '');
            if (!entry) return;

            nameInput.value = entry.name;
            if (entry.set && !String(setInput.value || '').trim()) {
                setInput.value = entry.set;
            }
            if (entry.number && !String(numberInput.value || '').trim()) {
                numberInput.value = entry.number;
            }
        }

        async function initializeProxyManualSearchInput() {
            await ensureProxyManualSearchReady();

            const nameInput = document.getElementById('proxyManualName');
            if (!nameInput) return;
            if (nameInput.dataset.proxySearchReady === '1') return;

            nameInput.dataset.proxySearchReady = '1';
            nameInput.setAttribute('list', PROXY_MANUAL_SUGGESTIONS_ID);

            nameInput.addEventListener('focus', () => {
                updateProxyManualNameSuggestions();
            });
            nameInput.addEventListener('input', () => {
                updateProxyManualNameSuggestions();
            });
            nameInput.addEventListener('change', () => {
                applyProxyManualSelectionFromName();
            });
            nameInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    addManualProxyCard();
                }
            });
        }

        function showProxyToast(message) {
            let toast = document.getElementById('proxyToast');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'proxyToast';
                toast.className = 'proxy-toast active';
                document.body.appendChild(toast);
            }
            toast.textContent = message;
            toast.classList.add('active');
            clearTimeout(toast._timeout);
            toast._timeout = setTimeout(() => {
                toast.classList.remove('active');
            }, 2200);
        }

        function clearLegacyProxyQueueStorage() {
            try {
                localStorage.removeItem('proxyQueueV1');
            } catch (e) {
                console.warn('[Proxy] Could not clear legacy proxy queue storage:', e);
            }
        }

        function setProxyButtonBusy(buttonIds, busy, loadingText) {
            if (!Array.isArray(buttonIds)) return;
            buttonIds.forEach((buttonId) => {
                const button = document.getElementById(buttonId);
                if (!button) return;

                if (busy) {
                    if (!button.dataset.originalLabel) {
                        button.dataset.originalLabel = button.textContent || '';
                    }
                    button.disabled = true;
                    button.classList.add('proxy-btn-loading');
                    button.setAttribute('aria-busy', 'true');
                    button.textContent = loadingText || t('misc.loading');
                    return;
                }

                button.disabled = false;
                button.classList.remove('proxy-btn-loading');
                button.removeAttribute('aria-busy');
                if (button.dataset.originalLabel) {
                    button.textContent = button.dataset.originalLabel;
                    delete button.dataset.originalLabel;
                }
            });
        }

        function withTimeout(promise, timeoutMs, timeoutMessage) {
            if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;

            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error(timeoutMessage || 'Proxy action timed out.'));
                }, timeoutMs);

                Promise.resolve(promise)
                    .then((result) => {
                        clearTimeout(timeout);
                        resolve(result);
                    })
                    .catch((error) => {
                        clearTimeout(timeout);
                        reject(error);
                    });
            });
        }

        async function runProxyAction(actionKey, buttonIds, action, options = {}) {
            if (!actionKey || typeof action !== 'function') return;
            if (proxyActionState[actionKey]) return;

            const loadingText = options.loadingText || t('misc.loading');
            const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : PROXY_IMPORT_TIMEOUT_MS;
            proxyActionState[actionKey] = true;
            setProxyButtonBusy(buttonIds, true, loadingText);

            try {
                await withTimeout(Promise.resolve().then(action), timeoutMs, options.timeoutMessage);
            } catch (error) {
                const detail = String(error?.message || error || '').toLowerCase();
                const corsHint = detail.includes('cors') ? ' (possible CORS/network restriction)' : '';
                const message = options.errorMessage || 'Proxy import failed. Please try again.';
                showToast(`${message}${corsHint}`, 'error');
                console.error('[Proxy] Action failed:', actionKey, error);
            } finally {
                proxyActionState[actionKey] = false;
                setProxyButtonBusy(buttonIds, false);
            }
        }

        function saveProxyQueue() {
            // Proxy queue persistence was intentionally removed.
        }

        function loadProxyQueue() {
            clearLegacyProxyQueueStorage();
            window.proxyQueue = [];
        }

        function getProxyQueueTotals() {
            const queue = window.proxyQueue || [];
            const totalCopies = queue.reduce((sum, item) => sum + parseProxyCount(item.count, 0), 0);
            return {
                uniqueCards: queue.length,
                totalCopies
            };
        }

        function syncProxyStats() {
            const totals = getProxyQueueTotals();
            const uniqueEl = document.getElementById('proxyUniqueCount');
            const copiesEl = document.getElementById('proxyCopiesCount');
            if (uniqueEl) uniqueEl.textContent = String(totals.uniqueCards);
            if (copiesEl) copiesEl.textContent = String(totals.totalCopies);
        }

        function renderProxyQueue() {
            syncProxyStats();
            const list = document.getElementById('proxyQueueList');
            if (!list) return;

            const queue = window.proxyQueue || [];
            if (queue.length === 0) {
                list.innerHTML = '<div class="proxy-queue-empty">' + t('proxy.queueEmpty') + '</div>';
                return;
            }

            const html = queue.map(item => {
                const safeName = window.escapeHtmlAttr(item.name);
                const safeSet = window.escapeHtmlAttr(item.set || 'N/A');
                const safeNumber = window.escapeHtmlAttr(item.number || 'N/A');
                const displaySetNumber = (item.set && item.number) ? `${safeSet} ${safeNumber}` : t('proxy.noPrint');
                const imageUrl = getCardImageSource(item.name, item.set, item.number) || buildInlineCardPlaceholder(item.name);
                const escapedImageUrl = window.escapeHtmlAttr(imageUrl);
                const jsName = escapeJsStr(item.name || '');
                const jsSet = escapeJsStr(item.set || '');
                const jsNumber = escapeJsStr(item.number || '');

                return `
                    <div class="proxy-queue-card">
                        <img loading="lazy" src="${escapedImageUrl}" alt="${safeName}" class="proxy-queue-card-img" onerror="this.src='${buildInlineCardPlaceholder('Proxy')}';">
                        <div class="proxy-queue-card-info">
                            <div class="proxy-queue-card-title">${safeName}</div>
                            <div class="proxy-queue-card-print">${displaySetNumber}</div>
                        </div>
                        <div class="proxy-queue-card-controls">
                            <button class="btn-minus" onclick="setProxyCardCount('${jsName}', '${jsSet}', '${jsNumber}', ${parseProxyCount(item.count, 1) - 1})">-</button>
                            <input type="number" min="1" value="${parseProxyCount(item.count, 1)}" onchange="setProxyCardCount('${jsName}', '${jsSet}', '${jsNumber}', this.value)">
                            <button class="btn-plus" onclick="setProxyCardCount('${jsName}', '${jsSet}', '${jsNumber}', ${parseProxyCount(item.count, 1) + 1})">+</button>
                            <button class="btn-remove" onclick="removeCardFromProxy('${jsName}', '${jsSet}', '${jsNumber}')">${t('proxy.remove')}</button>
                        </div>
                    </div>
                `;
            }).join('');

            list.innerHTML = html;
        }

        function addCardToProxy(cardName, setCode = '', cardNumber = '', count = 1, suppressToast = false) {
            return addCardToProxyInternal(cardName, setCode, cardNumber, count, {
                suppressToast,
                suppressRender: false,
                suppressPersist: false
            });
        }

        function addCardToProxyInternal(cardName, setCode = '', cardNumber = '', count = 1, options = {}) {
            const suppressToast = Boolean(options.suppressToast);
            const suppressRender = Boolean(options.suppressRender);
            const suppressPersist = Boolean(options.suppressPersist);
            const name = String(cardName || '').trim();
            if (!name) return 0;

            const normalizedSet = normalizeProxySetCode(setCode);
            const normalizedNumber = normalizeProxyCardNumber(cardNumber);
            const normalizedCount = parseProxyCount(count, 1);
            const id = buildProxyItemId(name, normalizedSet, normalizedNumber);

            const queue = window.proxyQueue || [];
            const existing = queue.find(item => item.id === id);

            if (existing) {
                existing.count = parseProxyCount(existing.count, 1) + normalizedCount;
            } else {
                queue.push({
                    id,
                    name,
                    set: normalizedSet,
                    number: normalizedNumber,
                    count: normalizedCount
                });
            }

            window.proxyQueue = queue;
            if (!suppressPersist) {
                saveProxyQueue();
            }
            if (!suppressRender) {
                renderProxyQueue();
            }

            if (!suppressToast) {
                const setPart = normalizedSet && normalizedNumber ? ` (${normalizedSet} ${normalizedNumber})` : '';
                showProxyToast(`${t('proxy.addedToQueue')} ${name}${setPart} x${normalizedCount}`);
            }

            return normalizedCount;
        }

        function setProxyCardCount(cardName, setCode = '', cardNumber = '', value = 1) {
            const id = buildProxyItemId(cardName, setCode, cardNumber);
            const queue = window.proxyQueue || [];
            const item = queue.find(entry => entry.id === id);
            if (!item) return;

            const nextValue = parseInt(value, 10);
            if (!Number.isFinite(nextValue) || nextValue <= 0) {
                window.proxyQueue = queue.filter(entry => entry.id !== id);
            } else {
                item.count = nextValue;
            }

            renderProxyQueue();
        }

        function removeCardFromProxy(cardName, setCode = '', cardNumber = '') {
            const id = buildProxyItemId(cardName, setCode, cardNumber);
            window.proxyQueue = (window.proxyQueue || []).filter(item => item.id !== id);
            renderProxyQueue();
        }

        function clearProxyQueue() {
            if (!window.proxyQueue || window.proxyQueue.length === 0) return;
            if (!confirm(t('proxy.clearConfirm'))) return;
            window.proxyQueue = [];
            renderProxyQueue();
        }

        async function addCurrentDeckToProxy(source) {
            const sourceToDeck = {
                cityLeague: window.cityLeagueDeck,
                currentMeta: window.currentMetaDeck,
                pastMeta: window.pastMetaDeck
            };
            const sourceToButton = {
                cityLeague: 'proxyAddCityLeagueDeckBtn',
                currentMeta: 'proxyAddCurrentMetaDeckBtn',
                pastMeta: 'proxyAddPastMetaDeckBtn'
            };

            await runProxyAction(
                `proxyDeckImport:${source}`,
                [sourceToButton[source]],
                async () => {
                    const deckMap = sourceToDeck[source];
                    if (!deckMap || typeof deckMap !== 'object' || Object.keys(deckMap).length === 0) {
                        showToast(t('proxy.noDeckCards'), 'warning');
                        return;
                    }

                    let addedCopies = 0;
                    Object.entries(deckMap).forEach(([deckKey, count]) => {
                        const copies = parseProxyCount(count, 0);
                        if (copies <= 0) return;

                        const match = deckKey.match(/^(.+?)\s+\(([A-Z0-9]+)\s+([A-Z0-9]+)\)$/);
                        if (match) {
                            addCardToProxyInternal(match[1], match[2], match[3], copies, { suppressToast: true, suppressRender: true, suppressPersist: true });
                        } else {
                            addCardToProxyInternal(deckKey, '', '', copies, { suppressToast: true, suppressRender: true, suppressPersist: true });
                        }
                        addedCopies += copies;
                    });

                    if (addedCopies <= 0) {
                        showToast(t('proxy.noDeckCards'), 'warning');
                        return;
                    }

                    renderProxyQueue();
                    showProxyToast(`${addedCopies} ${t('proxy.deckCardsAdded')}`);
                },
                {
                    loadingText: t('misc.loading'),
                    errorMessage: 'Could not import selected deck into proxy queue.'
                }
            );
        }

        function sendCurrentDeckToProxyPrinter(source) {
            addCurrentDeckToProxy(source)
                .finally(() => {
                    if (typeof switchTabAndUpdateMenu === 'function') {
                        switchTabAndUpdateMenu('proxy');
                    } else if (typeof switchTab === 'function') {
                        switchTab('proxy');
                    }
                });
        }

        async function importDecklistToProxy() {
            await runProxyAction(
                'proxyDecklistImport',
                ['proxyImportDecklistBtn'],
                async () => {
                    const input = document.getElementById('proxyDecklistInput');
                    if (!input) return;

                    const text = String(input.value || '').trim();
                    if (!text) {
                        showToast(t('proxy.pasteFirst'), 'warning');
                        return;
                    }

                    let entries = [];
                    try {
                        entries = parseDeckList(text);
                    } catch (parseErr) {
                        console.warn('[Proxy] parseDeckList failed, using fallback parser:', parseErr);
                        entries = [];
                    }

                    if (!Array.isArray(entries) || entries.length === 0) {
                        entries = [];
                        text.split('\n').forEach(line => {
                            const trimmed = line.trim();
                            if (!trimmed) return;
                            const match = trimmed.match(/^(\d+)\s+(.+)$/);
                            if (!match) return;
                            entries.push({
                                count: parseProxyCount(match[1], 1),
                                name: String(match[2] || '').trim(),
                                set: '',
                                number: ''
                            });
                        });
                    }

                    if (!Array.isArray(entries) || entries.length === 0) {
                        showToast(t('proxy.parseError'), 'error');
                        return;
                    }

                    let addedCopies = 0;
                    entries.forEach(entry => {
                        const safeName = String(entry?.name || '').trim();
                        if (!safeName) return;
                        const amount = parseProxyCount(entry.count, 1);
                        addCardToProxyInternal(safeName, entry.set, entry.number, amount, { suppressToast: true, suppressRender: true, suppressPersist: true });
                        addedCopies += amount;
                    });

                    if (addedCopies <= 0) {
                        showToast(t('proxy.parseError'), 'error');
                        return;
                    }

                    renderProxyQueue();
                    showProxyToast(`${addedCopies} ${t('proxy.cardsImported')}`);
                },
                {
                    loadingText: t('misc.loading'),
                    timeoutMs: PROXY_IMPORT_TIMEOUT_MS,
                    timeoutMessage: 'Decklist import timed out.',
                    errorMessage: 'Could not import decklist into proxy queue.'
                }
            );
        }

        function addManualProxyCard() {
            const nameInput = document.getElementById('proxyManualName');
            const setInput = document.getElementById('proxyManualSet');
            const numberInput = document.getElementById('proxyManualNumber');
            const countInput = document.getElementById('proxyManualCount');

            const cardNameRaw = String(nameInput?.value || '').trim();
            if (!cardNameRaw) {
                showToast(t('proxy.enterCardName'), 'warning');
                return;
            }

            const suggestedEntry = findProxyManualCardEntry(cardNameRaw);
            if (suggestedEntry) {
                if (nameInput) nameInput.value = suggestedEntry.name;
                if (setInput && !String(setInput.value || '').trim()) setInput.value = suggestedEntry.set || '';
                if (numberInput && !String(numberInput.value || '').trim()) numberInput.value = suggestedEntry.number || '';
            }

            const cardName = String(nameInput?.value || cardNameRaw).trim();

            const setCode = String(setInput?.value || '').trim();
            const cardNumber = String(numberInput?.value || '').trim();
            const count = parseProxyCount(countInput?.value || '1', 1);
            addCardToProxy(cardName, setCode, cardNumber, count);

            if (nameInput) nameInput.value = '';
            if (setInput) setInput.value = '';
            if (numberInput) numberInput.value = '';
            if (countInput) countInput.value = '1';
            updateProxyManualNameSuggestions();
        }

        function printProxyQueue() {
            const queue = window.proxyQueue || [];
            if (queue.length === 0) {
                showToast(t('proxy.queueEmptyToast'), 'warning');
                return;
            }

            const copies = [];
            queue.forEach(item => {
                const count = parseProxyCount(item.count, 1);
                for (let i = 0; i < count; i++) {
                    copies.push(item);
                }
            });

            const pages = [];
            for (let i = 0; i < copies.length; i += 9) {
                pages.push(copies.slice(i, i + 9));
            }

            const popup = window.open('', '_blank');
            if (!popup) {
                showToast(t('proxy.printBlocked'), 'error');
                return;
            }

            const doc = popup.document;
            doc.open();
            doc.write('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
            doc.close();

            const titleEl = doc.createElement('title');
            titleEl.textContent = t('proxy.printTitle');
            doc.head.appendChild(titleEl);

            const style = doc.createElement('style');
            style.textContent = [
                '@page { size: A4 portrait; margin: 8mm; }',
                '* { box-sizing: border-box; }',
                'body { margin: 0; font-family: Arial, sans-serif; background: #fff; }',
                '.proxy-page { page-break-after: always; }',
                '.proxy-page:last-child { page-break-after: auto; }',
                // Gapless 3x3 block: cards share edges so one straight cut
                // separates two cards at once (rotary-trimmer friendly).
                // margin-top keeps the -5mm top/left ticks inside the printable
                // area (out of the non-printable @page margin) on every printer.
                '.proxy-block { position: relative; width: 180mm; height: 255mm; margin: 6mm auto 0; }',
                '.proxy-grid { display: grid; grid-template-columns: repeat(3, 60mm); grid-auto-rows: 85mm; gap: 0; }',
                '.proxy-slot { position: relative; width: 60mm; height: 85mm; }',
                '.proxy-card { position: absolute; inset: 0; overflow: hidden; border: 0.2mm solid rgba(0,0,0,0.5); background: #fff; }',
                '.proxy-card img { width: 100%; height: 100%; object-fit: cover; display: block; }',
                // Alignment/trim ticks sit only in the page margin (never on
                // the card faces) at every cut line, top/bottom + left/right.
                '.tick { position: absolute; background: #000; pointer-events: none; }',
                '.tick-v { width: 0.3mm; height: 4mm; margin-left: -0.15mm; }',
                '.tick-h { height: 0.3mm; width: 4mm; margin-top: -0.15mm; }',
                'footer { margin-top: 8mm; text-align: center; font-size: 7.5pt; color: #666; }',
                '@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }'
            ].join('\n');
            doc.head.appendChild(style);

            pages.forEach((pageCards, pageIndex) => {
                const section = doc.createElement('section');
                section.className = 'proxy-page';

                // Size the block/marks to the rows & columns actually used on
                // this page so a short last page doesn't get a full-height
                // block with ticks for empty rows.
                const colsUsed = Math.min(3, pageCards.length);
                const rowsUsed = Math.ceil(pageCards.length / 3);

                const block = doc.createElement('div');
                block.className = 'proxy-block';
                block.style.width = (colsUsed * 60) + 'mm';
                block.style.height = (rowsUsed * 85) + 'mm';

                const grid = doc.createElement('div');
                grid.className = 'proxy-grid';
                grid.style.gridTemplateColumns = 'repeat(' + colsUsed + ', 60mm)';

                pageCards.forEach(card => {
                    const slot = doc.createElement('div');
                    slot.className = 'proxy-slot';
                    const cardDiv = doc.createElement('div');
                    cardDiv.className = 'proxy-card';
                    const img = doc.createElement('img');
                    img.src = getCardImageSource(card.name, card.set, card.number) || buildInlineCardPlaceholder(card.name);
                    img.alt = '';
                    cardDiv.appendChild(img);
                    slot.appendChild(cardDiv);
                    grid.appendChild(slot);
                });

                block.appendChild(grid);

                // Trim/alignment marks in the page margin at every cut line so
                // the whole sheet lines up on the rotary trimmer and each
                // straight cut passes through the shared edges of two cards.
                // COLS = vertical cut lines (mm from block left); ROWS =
                // horizontal cut lines (mm from block top). The block is
                // 3*60mm wide and 3*85mm tall, so the outer lines are the
                // block border and the two inner lines split the cards.
                const COLS = Array.from({ length: colsUsed + 1 }, (_, i) => i * 60);
                const ROWS = Array.from({ length: rowsUsed + 1 }, (_, i) => i * 85);
                const addTick = (cls, styles) => {
                    const m = doc.createElement('span');
                    m.className = 'tick ' + cls;
                    Object.assign(m.style, styles);
                    block.appendChild(m);
                };
                COLS.forEach(x => {
                    addTick('tick-v', { top: '-5mm', left: x + 'mm' });
                    addTick('tick-v', { bottom: '-5mm', left: x + 'mm' });
                });
                ROWS.forEach(y => {
                    addTick('tick-h', { left: '-5mm', top: y + 'mm' });
                    addTick('tick-h', { right: '-5mm', top: y + 'mm' });
                });

                section.appendChild(block);

                const footer = doc.createElement('footer');
                footer.textContent = `${t('proxy.pageFooter')} ${pageIndex + 1} / ${pages.length}`;
                section.appendChild(footer);
                doc.body.appendChild(section);
            });

            popup.focus();

            // Wait for all images to load before printing
            const allImages = Array.from(doc.querySelectorAll('.proxy-card img'));
            let loaded = 0;
            const total = allImages.length;

            function checkAllLoaded() {
                loaded++;
                if (loaded >= total) {
                    popup.print();
                }
            }

            if (total === 0) {
                popup.print();
            } else {
                allImages.forEach(img => {
                    if (img.complete && img.naturalWidth > 0) {
                        checkAllLoaded();
                    } else {
                        img.onload = checkAllLoaded;
                        img.onerror = checkAllLoaded;
                    }
                });
            }
        }

        function addComparisonNewCardsToProxy() {
            const comparisonCards = Array.isArray(window.lastDeckComparisonCards) ? window.lastDeckComparisonCards : [];
            // Include new cards AND changed cards with increased count
            const proxyCards = comparisonCards.filter(card => {
                if (card.changeType === 'new' && parseProxyCount(card.newCount, 0) > 0) return true;
                if (card.changeType === 'changed' && card.newCount > card.oldCount) return true;
                return false;
            });

            if (proxyCards.length === 0) {
                showToast(t('proxy.noNewCards'), 'warning');
                return;
            }

            let addedCopies = 0;
            proxyCards.forEach(card => {
                const count = card.changeType === 'new' ? parseProxyCount(card.newCount, 1) : (card.newCount - card.oldCount);
                addCardToProxy(card.name, card.set, card.number, count, true);
                addedCopies += count;
            });

            renderProxyQueue();
            showProxyToast(`${proxyCards.length} ${t('proxy.compCardsAdded')} (${addedCopies})`);

        }

        loadProxyQueue();

        document.addEventListener('DOMContentLoaded', function() {
            clearLegacyProxyQueueStorage();
            window.proxyQueue = [];
            renderProxyQueue();
            initializeProxyManualSearchInput();

            // Mobile Drag & Drop polyfill
            if (typeof MobileDragDrop !== 'undefined' && MobileDragDrop.polyfill) {
                MobileDragDrop.polyfill({ holdToDrag: 300 });
            }
            // Mobile Drag & Drop polyfill: prevent default scroll during drag
            window.addEventListener('touchmove', function(e) {
                if (e.target && e.target.closest && e.target.closest('.proxy-drag-active')) {
                    e.preventDefault();
                }
            }, { passive: false });
        });
        
        // Tab switching
        function switchTab(tabName) {
            const tabs = document.querySelectorAll('.tab-content');
            tabs.forEach(tab => tab.classList.remove('active'));

            const buttons = document.querySelectorAll('.tab-btn');
            buttons.forEach(btn => btn.classList.remove('active'));

            const selectedTab = document.getElementById(tabName);
            if (selectedTab) {
                selectedTab.classList.add('active');

                // Load data for the tab
                switch(tabName) {
                    case 'city-league':
                        if (!window.cityLeagueLoaded) loadCityLeagueData();
                        break;
                    case 'city-league-analysis':
                        if (!window.cityLeagueAnalysisLoaded) loadCityLeagueAnalysis();
                        break;
                    case 'current-meta':
                        if (!window.currentMetaLoaded) loadCurrentMeta();
                        break;
                    case 'current-analysis':
                        if (!window.currentAnalysisLoaded) loadCurrentAnalysis();
                        break;
                    case 'past-meta':
                        if (!window.pastMetaLoaded) loadPastMeta();
                        break;
                    case 'cards':
                        if (!window.cardsLoaded) loadCards();
                        break;
                    case 'proxy':
                        renderProxyQueue();
                        initializeProxyManualSearchInput();
                        break;
                }
            }

            // Notify the Meta & Deck Analysis Hub so it can manage its sub-nav.
            if (window.MetaAnalysisHub && typeof window.MetaAnalysisHub.onTabSwitched === 'function') {
                window.MetaAnalysisHub.onTabSwitched(tabName);
            }

            // The hub tab uses the same top-nav button for all 5 sub-tabs.
            // When entering a sub-tab, highlight the hub button instead.
            const hubSubTabs = ['city-league', 'city-league-analysis', 'current-meta', 'current-analysis', 'past-meta'];
            const buttonLookupName = hubSubTabs.includes(tabName) ? 'meta-analysis-hub' : tabName;

            // Set active button (highlight the parent hub button when on a sub-tab)
            const activeBtn = Array.from(buttons).find(btn =>
                btn.getAttribute('onclick')?.includes(buttonLookupName)
            );
            if (activeBtn) activeBtn.classList.add('active');

            // Update browser tab title with the actual section name. For hub
            // sub-tabs, prefer the side-menu label (e.g. "Deck Analysis (Japan)")
            // so the title reflects the specific area, not the hub.
            const menuLabelEl = document.querySelector(`.menu-item[data-tab-id="${tabName}"] .menu-item-label`);
            const titleText = menuLabelEl
                ? menuLabelEl.textContent.trim()
                : (activeBtn ? activeBtn.textContent.trim() : '');
            if (titleText) {
                document.title = titleText + ' – Pokémon TCG Hub';
                const badge = document.getElementById('current-tab-title');
                if (badge) {
                    badge.textContent = titleText;
                    // Hub overview has no single "current section" — hide the
                    // pill there so it doesn't mislead (see inline-init.js
                    // companion change for the menu-driven path).
                    badge.style.display = tabName === 'meta-analysis-hub' ? 'none' : '';
                }
            }
        }

        window.jumpToCardAnalysis = function(archetype, region) {
            devLog(`[Navigation] Jumping to ${region} analysis for: ${archetype}`);

            const safeArchetype = String(archetype || '').trim();
            const normalizedRegion = String(region || '').trim();

            const triggerTabSwitch = (tabId) => {
                if (typeof switchTabAndUpdateMenu === 'function') {
                    switchTabAndUpdateMenu(tabId);
                } else {
                    switchTab(tabId);
                }
            };

            if (normalizedRegion === 'cityLeague') {
                // Store pending selection — populateCityLeagueDeckSelect will apply it when ready
                window.pendingCityLeagueDeckSelection = safeArchetype;
                triggerTabSwitch('city-league-analysis');
                // If data already loaded, the populate function won't re-run — apply immediately
                if (window.cityLeagueAnalysisLoaded) {
                    const select = document.getElementById('cityLeagueDeckSelect');
                    if (select && select.options.length > 1) {
                        const match = Array.from(select.options).find(o =>
                            String(o.value || '').toLowerCase() === safeArchetype.toLowerCase()
                        );
                        if (match) {
                            select.value = match.value;
                            // Don't clear pending — let populateCityLeagueDeckSelect consume it
                            window.currentCityLeagueArchetype = match.value;
                            if (typeof syncSearchableSelectDisplay === 'function') syncSearchableSelectDisplay(select);
                            if (typeof loadCityLeagueDeckData === 'function') loadCityLeagueDeckData(match.value);
                        }
                    }
                }
            } else if (normalizedRegion === 'currentMeta') {
                // Store pending selection — populateCurrentMetaDeckSelect will apply it when ready
                window.pendingCurrentMetaDeckSelection = safeArchetype;
                triggerTabSwitch('current-analysis');
                // If data already loaded, the populate function won't re-run — apply immediately
                if (window.currentMetaAnalysisLoaded) {
                    const select = document.getElementById('currentMetaDeckSelect');
                    if (select && select.options.length > 1) {
                        const match = Array.from(select.options).find(o =>
                            String(o.value || '').toLowerCase() === safeArchetype.toLowerCase()
                        );
                        if (match) {
                            select.value = match.value;
                            // Don't clear pending — let populateCurrentMetaDeckSelect consume it
                            window.currentMetaArchetype = match.value;
                            if (typeof syncSearchableSelectDisplay === 'function') syncSearchableSelectDisplay(select);
                            if (typeof loadCurrentMetaDeckData === 'function') loadCurrentMetaDeckData(match.value);
                        }
                    }
                }
            }

            window.scrollTo({ top: 0, behavior: 'smooth' });
        };

        function parseArchetypeSelection(archetype) {
            const raw = String(archetype || '').trim();
            const isGroup = raw.startsWith('GROUP:');
            const targetArchetypes = isGroup
                ? raw.replace('GROUP:', '').split('|').map(v => String(v || '').trim()).filter(Boolean)
                : [raw];

            const baseName = targetArchetypes[0] ? targetArchetypes[0].split(' ')[0] : 'Group';
            const displayArchetypeName = isGroup ? `${baseName} (All Variants)` : raw;

            return { raw, isGroup, targetArchetypes, displayArchetypeName };
        }

        window.analyzeCombinedArchetype = function(mainName, variantsJson) {
            let variants = [];
            try {
                variants = JSON.parse(decodeURIComponent(String(variantsJson || '')));
            } catch (e) {
                console.error('[Combined Deep-Dive] Could not parse variants:', e);
                return;
            }

            if (!Array.isArray(variants) || variants.length === 0) return;

            const displayName = String(mainName || '').charAt(0).toUpperCase() + String(mainName || '').slice(1);
            const groupValue = 'GROUP:' + variants.join('|');

            // Store for deferred application — populateCityLeagueDeckSelect picks this up
            window.pendingCombinedArchetypeSelection = {
                value: groupValue,
                label: `${displayName} (All Variants Combined)`
            };

            if (typeof switchTabAndUpdateMenu === 'function') {
                switchTabAndUpdateMenu('city-league-analysis');
            } else {
                switchTab('city-league-analysis');
            }

            // If data was already loaded, populateCityLeagueDeckSelect won't re-run — apply now
            if (window.cityLeagueAnalysisLoaded) {
                setTimeout(function() { applyPendingCombinedArchetypeSelection(); }, 0);
            }

            window.scrollTo({ top: 0, behavior: 'smooth' });
        };
        
        // Navigate to City League Analysis with pre-selected deck
        function navigateToAnalysisWithDeck(archetypeName) {
            devLog('Navigating to analysis with deck:', archetypeName);
            window.pendingCityLeagueDeckSelection = archetypeName;
            
            // Switch to City League Analysis tab
            switchTab('city-league-analysis');
            
            // Wait for dropdown to be populated with data
            let attempts = 0;
            const maxAttempts = 50; // Max 5 seconds (50 * 100ms)
            
            const checkAndSelect = () => {
                attempts++;
                const select = document.getElementById('cityLeagueDeckSelect');
                
                if (select && select.options.length > 1) { // More than just placeholder
                    const options = Array.from(select.options);
                    const target = String(archetypeName || '').trim().toLowerCase();

                    // Prefer exact single-archetype match first.
                    const exactOption = options.find(opt => String(opt.value || '').toLowerCase() === target);

                    // Fallback to combined archetype entries (GROUP:...) only when no exact match exists.
                    const combinedOption = !exactOption && options.find(opt => {
                        const value = String(opt.value || '');
                        if (!value.startsWith('GROUP:')) return false;
                        const variants = value
                            .replace(/^GROUP:/, '')
                            .split('|')
                            .map(v => String(v || '').trim().toLowerCase())
                            .filter(Boolean);
                        return variants.includes(target);
                    });

                    const matchingOption = exactOption || combinedOption;
                    
                    if (matchingOption) {
                        select.value = matchingOption.value;
                        // Don't clear pendingCityLeagueDeckSelection here — let populateCityLeagueDeckSelect
                        // consume it so initSearchableSelect creates the display with the correct value.
                        if (typeof syncSearchableSelectDisplay === 'function') syncSearchableSelectDisplay(select);
                        if (typeof loadCityLeagueDeckData === 'function') loadCityLeagueDeckData(matchingOption.value);
                        devLog('Deck selected:', matchingOption.value, combinedOption ? '(combined)' : '(exact)');
                    } else {
                        console.warn('Deck not found in dropdown:', archetypeName);
                    }
                } else if (attempts < maxAttempts) {
                    // Retry after 100ms
                    setTimeout(checkAndSelect, 100);
                } else {
                    console.error('[TIMEOUT] Timeout: Dropdown not populated after 5 seconds');
                }
            };
            
            // Start checking after initial delay
            setTimeout(checkAndSelect, 100);
        }
        
        // Navigate to Current Meta Analysis tab and select a deck
        function navigateToCurrentMetaWithDeck(archetypeName) {
            devLog('Navigating to Current Meta with deck:', archetypeName);
            window.pendingCurrentMetaDeckSelection = archetypeName;
            
            // Switch to Current Meta Analysis tab
            switchTab('current-analysis');
            
            // Wait for dropdown to be populated with data
            let attempts = 0;
            const maxAttempts = 50; // Max 5 seconds (50 * 100ms)
            
            const checkAndSelect = () => {
                attempts++;
                const select = document.getElementById('currentMetaDeckSelect');
                
                if (select && select.options.length > 1) { // More than just placeholder
                    // Find matching option (case-insensitive)
                    const options = Array.from(select.options);
                    const matchingOption = options.find(opt => 
                        opt.value.toLowerCase() === archetypeName.toLowerCase()
                    );
                    
                    if (matchingOption) {
                        select.value = matchingOption.value;
                        if (typeof syncSearchableSelectDisplay === 'function') syncSearchableSelectDisplay(select);
                        if (typeof loadCurrentMetaDeckData === 'function') loadCurrentMetaDeckData(matchingOption.value);
                        devLog('Deck selected:', matchingOption.value);
                    } else {
                        console.warn('Deck not found in dropdown:', archetypeName);
                    }
                } else if (attempts < maxAttempts) {
                    // Retry after 100ms
                    setTimeout(checkAndSelect, 100);
                } else {
                    console.error('[TIMEOUT] Timeout: Dropdown not populated after 5 seconds');
                }
            };
            
            // Start checking after initial delay
            setTimeout(checkAndSelect, 100);
        }

        /**
         * Navigate to Past Meta tab with a specific format + deck pre-
         * selected. Mirrors navigateToCurrentMetaWithDeck but targets
         * the Past Meta tab and drives its format-filter chain so the
         * chunk loads, then selects the deck. Called by Meta Call when
         * the user has source = "Past Meta" and clicks an archetype.
         *
         * Two-stage polling because Past Meta has a lazy chunk loader
         * that fires on the format-filter change event: we set + dispatch
         * the format change first, then poll the deck dropdown until
         * the chunk's archetypes have populated it.
         */
        window.navigateToPastMetaWithDeck = function(archetypeName, formatKey) {
            devLog('Navigating to Past Meta with deck:', archetypeName, 'format:', formatKey);
            switchTab('past-meta');

            const setFormatAndDeck = () => {
                const fmtSel = document.getElementById('pastMetaFormatFilter');
                if (!fmtSel || fmtSel.options.length === 0) {
                    // Format dropdown not populated yet — keep waiting
                    return false;
                }
                // Set format only if it differs (avoid spurious chunk reload)
                if (formatKey && fmtSel.value !== formatKey) {
                    fmtSel.value = formatKey;
                    if (typeof syncSearchableSelectDisplay === 'function') {
                        try { syncSearchableSelectDisplay(fmtSel); } catch (_e) { /* tolerate */ }
                    }
                    fmtSel.dispatchEvent(new Event('change', { bubbles: true }));
                }
                return true;
            };

            // Stage 1 — wait for format dropdown, set it
            let attempts = 0;
            const maxAttempts = 80; // 8s total
            const waitForFormat = () => {
                attempts++;
                if (setFormatAndDeck()) {
                    // Stage 2 — poll for deck options after chunk load
                    pollForDeck(0);
                } else if (attempts < maxAttempts) {
                    setTimeout(waitForFormat, 100);
                } else {
                    console.error('[Past Meta Nav] Format dropdown never populated');
                }
            };

            const pollForDeck = (deckAttempts) => {
                const deckSel = document.getElementById('pastMetaDeckSelect');
                if (deckSel && deckSel.options.length > 1) {
                    const opt = Array.from(deckSel.options).find(o =>
                        o.value && o.value.toLowerCase() === String(archetypeName || '').toLowerCase()
                    );
                    if (opt) {
                        deckSel.value = opt.value;
                        if (typeof syncSearchableSelectDisplay === 'function') {
                            try { syncSearchableSelectDisplay(deckSel); } catch (_e) { /* tolerate */ }
                        }
                        deckSel.dispatchEvent(new Event('change', { bubbles: true }));
                        devLog('Past Meta deck selected:', opt.value);
                        return;
                    }
                    console.warn('[Past Meta Nav] Deck not found in dropdown:', archetypeName);
                    return;
                }
                if (deckAttempts < 60) {
                    setTimeout(() => pollForDeck(deckAttempts + 1), 100);
                } else {
                    console.error('[Past Meta Nav] Deck dropdown never populated');
                }
            };

            setTimeout(waitForFormat, 150);
        };

        /**
         * Navigate to Current Meta Deck Analysis with a combined archetype (from Hero cards).
         * Selects the representative variant in the dropdown (first match among variants).
         */
        window.navigateToCMAnalysisWithCombinedDeck = function(mainName, variantsJson) {
            let variants = [];
            try {
                variants = JSON.parse(decodeURIComponent(String(variantsJson || '')));
            } catch (e) {
                console.error('[CM Combined Nav] Could not parse variants:', e);
                return;
            }

            if (!Array.isArray(variants) || variants.length === 0) return;

            devLog('Navigating to CM Analysis with combined deck:', mainName, variants);

            // Switch to Current Meta Analysis tab
            switchTab('current-analysis');

            // Wait for dropdown and pick best matching variant
            let attempts = 0;
            const maxAttempts = 50;

            const checkAndSelect = () => {
                attempts++;
                const select = document.getElementById('currentMetaDeckSelect');

                if (select && select.options.length > 1) {
                    const options = Array.from(select.options);
                    // Try each variant in order (most popular first) for a match
                    let matchingOption = null;
                    for (const variant of variants) {
                        matchingOption = options.find(opt =>
                            opt.value.toLowerCase() === variant.toLowerCase()
                        );
                        if (matchingOption) break;
                    }

                    if (matchingOption) {
                        select.value = matchingOption.value;
                        if (typeof syncSearchableSelectDisplay === 'function') syncSearchableSelectDisplay(select);
                        if (typeof loadCurrentMetaDeckData === 'function') loadCurrentMetaDeckData(matchingOption.value);
                        devLog('CM Combined deck selected:', matchingOption.value);
                    } else {
                        console.warn('No variant found in CM dropdown:', variants);
                    }
                } else if (attempts < maxAttempts) {
                    setTimeout(checkAndSelect, 100);
                } else {
                    console.error('Timeout: CM dropdown not populated after 5 seconds');
                }
            };

            setTimeout(checkAndSelect, 100);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        };
        
        // CSV loading and parsing
        // Shared text-mode CSV parser. Both window.parseCSV (for
        // non-module consumers like app-city-league.js) and a local
        // alias for callers inside this module. The previous audit
        // pass (commit 751d2d8) removed this thinking it was dead
        // code — it isn't: app-city-league.js calls parseCSV() five
        // times for the M3/comparison/archetypes CSV loads, and those
        // calls all blow up with 'parseCSV is not defined' the moment
        // the City League tab opens. Restored + exposed on window so
        // every non-module consumer reaches it the same way, with a
        // clear comment that future maintainers can search for.
        //
        // Auto-detects ';' vs ',' from the first line so a caller
        // who knows the format can pass the delimiter explicitly,
        // and a caller who doesn't still gets the right answer.
        // Used by: js/app-city-league.js (city league archetype CSVs,
        // all semicolon-delimited).
        function parseCSV(text, delimiter) {
            const raw = String(text || '');
            if (!raw.trim()) return [];
            const firstLine = raw.split(/\r?\n/, 1)[0] || '';
            const inferredDelimiter = delimiter
                || ((firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',');
            if (typeof Papa === 'undefined' || !Papa.parse) {
                // PapaParse not loaded — fall back to a naive split so
                // we don't crash. Same edge case the old app-meta-call
                // parseCSV handles; mirror its behaviour.
                const lines = raw.replace(/\r/g, '').split('\n');
                if (lines.length < 2) return [];
                const headers = lines[0]
                    .split(inferredDelimiter)
                    .map(h => h.trim().replace(/^﻿/, ''));
                return lines.slice(1).filter(l => l.trim()).map(l => {
                    const vals = l.split(inferredDelimiter);
                    const obj = {};
                    headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });
                    return obj;
                });
            }
            const results = Papa.parse(raw, {
                header: true,
                delimiter: inferredDelimiter,
                skipEmptyLines: true,
                dynamicTyping: false,
            });
            return Array.isArray(results.data) ? results.data : [];
        }
        if (typeof window !== 'undefined') window.parseCSV = parseCSV;

        function fixCardNameEncoding(name) {
            if (!name) return name;
            return String(name)
                .replace(/PokÃ©/g, 'Poké')
                .replace(/Ã©/g, 'é')
                .replace(/â€™/g, "'")
                .replace(/Â/g, '')
                .trim();
        }

        function healCurrentMetaCardRows(rows) {
            if (!Array.isArray(rows)) return rows;
            rows.forEach(row => {
                if (!row || typeof row !== 'object') return;
                if (row.card_name) row.card_name = fixCardNameEncoding(row.card_name);
                if (row.full_card_name) row.full_card_name = fixCardNameEncoding(row.full_card_name);
                if (row.name) row.name = fixCardNameEncoding(row.name);
                if (row.name_en) row.name_en = fixCardNameEncoding(row.name_en);
            });
            return rows;
        }

        // Historical meta codes — past rotations stay in the list for archival
        // lookups. The CURRENT meta is appended dynamically below from
        // window._formatWindow so the list doesn't need a code edit each
        // rotation. Order matters: front of the array is "most recent".
        const KNOWN_META_FORMAT_CODES = [
            'TEF-POR', 'SVI-ASC', 'SVI-PFL', 'SVI-MEG', 'SVI-BLK', 'SVI-DRI', 'SVI-JTG',
            'BRS-PRE', 'BRS-SSP', 'BRS-SCR', 'BRS-SFA', 'BRS-TWM', 'BRS-TEF',
            'BST-PAR', 'SVI-PAF'
        ];
        (function appendLiveMeta() {
            try {
                const live = (typeof window !== 'undefined' && typeof window.getCurrentMetaFormat === 'function')
                    ? window.getCurrentMetaFormat()
                    : '';
                if (live && !KNOWN_META_FORMAT_CODES.includes(live)) {
                    KNOWN_META_FORMAT_CODES.unshift(live);
                }
            } catch (_e) { /* silent — keeps the static list intact */ }
            // Expose for non-module consumers (e.g. Battle Journal dropdown
            // populator) so they get the same list + live-meta-prepend logic.
            try { if (typeof window !== 'undefined') window.KNOWN_META_FORMAT_CODES = KNOWN_META_FORMAT_CODES; } catch (_e) { /* silent */ }
        })();

        // MAINTAIN-ME-ON-ROTATION: when a new EN set drops on Limitless,
        // tournaments scraped after the rotation arrive with a label
        // like "scarlet & violet - <new set name>". Add the new entry
        // here so normalizeTournamentFormatLabel can resolve it to the
        // OLDEST-NEWEST code (e.g. 'TEF-CRI'). The console.warn below
        // surfaces drift as soon as an unmapped label is observed —
        // grep the browser console for "[normalizeTournamentFormatLabel]"
        // after the first scrape of a new rotation.
        const TOURNAMENT_FORMAT_NAME_TO_CODE = {
            'scarlet & violet - perfect order': 'TEF-POR',
            'scarlet & violet - ascended heroes': 'SVI-ASC',
            'scarlet & violet - phantasmal flames': 'SVI-PFL',
            'scarlet & violet - mega evolution': 'SVI-MEG',
            'scarlet & violet - black bolt': 'SVI-BLK',
            'scarlet & violet - white flare': 'SVI-BLK',
            'scarlet & violet - black bolt / white flare': 'SVI-BLK',
            'scarlet & violet - destined rivals': 'SVI-DRI',
            'scarlet & violet - journey together': 'SVI-JTG',
            'brilliant stars - prismatic evolutions': 'BRS-PRE',
            'brilliant stars - surging sparks': 'BRS-SSP',
            'brilliant stars - stellar crown': 'BRS-SCR',
            'brilliant stars - shrouded fable': 'BRS-SFA',
            'brilliant stars - twilight masquerade': 'BRS-TWM',
            'brilliant stars - temporal forces': 'BRS-TEF',
            'battle styles - paradox rift': 'BST-PAR'
            // 'meta play!' / 'meta live' are handled by normalizeTournamentFormatLabel's
            // early-return so they always resolve to the live format_window snapshot.
        };
        // De-duplicate the "unknown format" warning so a single
        // unrecognised label doesn't spam the console on every render.
        const _seenUnknownFormatLabels = new Set();

        function mapSetCodeToMetaFormat(setCode) {
            const code = String(setCode || '').trim().toUpperCase();
            if (!code) return '';

            const legacyToRotationCode = {
                'SVI-POR': 'TEF-POR'
            };
            if (legacyToRotationCode[code]) return legacyToRotationCode[code];

            const explicit = {
                M4: 'TEF-M4',
                POR: 'TEF-POR',
                ASC: 'SVI-ASC',
                PFL: 'SVI-PFL',
                MEG: 'SVI-MEG',
                BLK: 'SVI-BLK',
                WHT: 'SVI-BLK',
                DRI: 'SVI-DRI',
                JTG: 'SVI-JTG',
                PRE: 'BRS-PRE',
                SSP: 'BRS-SSP',
                SCR: 'BRS-SCR',
                SFA: 'BRS-SFA',
                TWM: 'BRS-TWM',
                TEF: 'BRS-TEF',
                PAR: 'BST-PAR',
                PAF: 'SVI-PAF'
            };

            if (explicit[code]) return explicit[code];
            if (code.includes('-')) return legacyToRotationCode[code] || code;

            // Rotation cutoff: anything at-or-newer than the current oldest-legal
            // set gets that prefix (e.g. CRI → TEF-CRI today, PAF-CRI after the
            // next rotation). Falls back to literal TEF/SVI for unit tests or
            // early-init paths where window._formatWindow isn't loaded yet.
            const oldestLegal = (typeof window !== 'undefined' && window._formatWindow && window._formatWindow.oldest_legal_set)
                ? String(window._formatWindow.oldest_legal_set).toUpperCase()
                : 'TEF';
            const sviOrder = setOrderMap.SVI || setOrderMap.SVE || 0;
            const oldestLegalOrder = setOrderMap[oldestLegal] || 0;
            const codeOrder = setOrderMap[code] || 0;
            if (oldestLegalOrder > 0 && codeOrder > 0 && codeOrder >= oldestLegalOrder) {
                return `${oldestLegal}-${code}`;
            }
            if (sviOrder > 0 && codeOrder > 0 && codeOrder >= sviOrder) {
                return `SVI-${code}`;
            }

            return code;
        }

        function normalizeTournamentFormatLabel(rawFormat, fallbackSetCode = '') {
            const raw = String(rawFormat || '').trim();
            if (!raw) return mapSetCodeToMetaFormat(fallbackSetCode);
            // Map current-meta labels to the newest known format.
            // Prefer the live format_window snapshot so the label stays in
            // sync with each rotation; fall back to KNOWN_META_FORMAT_CODES[0]
            // only if the snapshot isn't loaded (early-init edge case).
            // Case-insensitive so 'meta live' / 'Meta Live' / 'META LIVE' all
            // resolve to the current rotation (the lowercase entries in
            // TOURNAMENT_FORMAT_NAME_TO_CODE used to handle this with a stale
            // literal — this supersedes them).
            const rawLower = raw.toLowerCase();
            if (rawLower === 'meta live' || rawLower === 'meta play!') {
                const live = (typeof window !== 'undefined' && typeof window.getCurrentMetaFormat === 'function')
                    ? window.getCurrentMetaFormat()
                    : '';
                return live || KNOWN_META_FORMAT_CODES[0];
            }
            const normalizedRawCode = mapSetCodeToMetaFormat(raw);
            if (KNOWN_META_FORMAT_CODES.includes(normalizedRawCode)) return normalizedRawCode;

            const normalized = raw.toLowerCase();
            if (TOURNAMENT_FORMAT_NAME_TO_CODE[normalized]) {
                return TOURNAMENT_FORMAT_NAME_TO_CODE[normalized];
            }

            for (const key of Object.keys(TOURNAMENT_FORMAT_NAME_TO_CODE)) {
                if (normalized.includes(key)) {
                    return TOURNAMENT_FORMAT_NAME_TO_CODE[key];
                }
            }

            // Made it past every mapping branch — the label isn't one we
            // recognise. Most likely a new rotation arrived and
            // TOURNAMENT_FORMAT_NAME_TO_CODE needs the new entry.
            // Warn once per distinct label so the operator notices
            // without console spam.
            if (!_seenUnknownFormatLabels.has(normalized)) {
                _seenUnknownFormatLabels.add(normalized);
                console.warn(
                    `[normalizeTournamentFormatLabel] unmapped tournament format ${JSON.stringify(raw)} — `
                    + 'add it to TOURNAMENT_FORMAT_NAME_TO_CODE in js/app-core.js so dropdowns and filters resolve it.',
                );
            }
            return mapSetCodeToMetaFormat(fallbackSetCode) || raw;
        }

        function sanitizeTournamentArchetypeName(archetype) {
            const raw = String(archetype || '').trim();
            if (!raw) return '';
            return raw
                .replace(/\d+[\.,]\d+\$\d+[\.,]\d+€\s*$/g, '')
                .replace(/[\s\u00a0]+$/g, '')
                .trim();
        }

        function normalizeCurrentMetaFallbackRows(rows) {
            if (!Array.isArray(rows)) return [];

            // First pass: detect how many distinct raw archetypes collapse into
            // each sanitized name per tournament, so we can correct total_decks_in_archetype.
            const rawArchetypesPerGroup = new Map(); // key "tournamentId|||sanitizedArch" → Set<rawArch>
            rows.forEach(row => {
                if (!row || typeof row !== 'object') return;
                const rawArch = String(row.archetype || '').trim();
                if (!rawArch) return;
                const sanitized = sanitizeTournamentArchetypeName(rawArch);
                const tournamentId = String(row.tournament_id || '').trim();
                const groupKey = `${tournamentId}|||${sanitized}`;
                if (!rawArchetypesPerGroup.has(groupKey)) rawArchetypesPerGroup.set(groupKey, new Set());
                rawArchetypesPerGroup.get(groupKey).add(rawArch);
            });

            return rows.map(row => {
                if (!row || typeof row !== 'object') return null;
                const normalized = { ...row };
                const rawArch = String(normalized.archetype || '').trim();
                normalized.archetype = sanitizeTournamentArchetypeName(rawArch);

                const rawFormat = Object.prototype.hasOwnProperty.call(normalized, 'format')
                    ? normalized.format
                    : (normalized.meta || '');
                const normalizedFormat = normalizeTournamentFormatLabel(rawFormat, normalized.set_code || '');
                normalized.format = normalizedFormat;
                // Fallback CSV (tournament_cards_data_cards.csv) stores format codes
                // (e.g. 'SVI-ASC') in the meta column, not source labels. Since all
                // tournament data is from major tournaments, always tag as 'Meta Play!'.
                normalized.meta = 'Meta Play!';

                if (!normalized.deck_count && normalized.deck_inclusion_count) {
                    normalized.deck_count = normalized.deck_inclusion_count;
                }

                // Correct total_decks_in_archetype when per-decklist rows collapsed
                const tournamentId = String(normalized.tournament_id || '').trim();
                const groupKey = `${tournamentId}|||${normalized.archetype}`;
                const rawCount = rawArchetypesPerGroup.get(groupKey)?.size || 0;
                const csvCount = parseInt(normalized.total_decks_in_archetype || 0, 10) || 0;
                if (rawCount > csvCount) {
                    normalized.total_decks_in_archetype = String(rawCount);
                }

                if (!normalized.average_count_overall && normalized.total_count && normalized.total_decks_in_archetype) {
                    const totalCount = parseLocaleNumber(normalized.total_count, 0);
                    const totalDecks = parseLocaleNumber(normalized.total_decks_in_archetype, 0);
                    normalized.average_count_overall = totalDecks > 0 ? (totalCount / totalDecks).toFixed(2) : '0';
                }

                return normalized;
            }).filter(row => row && row.card_name && row.archetype);
        }

        let currentMetaRowsFallbackCache = null;
        let currentMetaRowsFallbackInFlight = null;

        async function loadCurrentMetaRowsWithFallback(options = {}) {
            const forceRefresh = Boolean(options && options.forceRefresh);

            if (!forceRefresh && Array.isArray(currentMetaRowsFallbackCache)) {
                return currentMetaRowsFallbackCache;
            }

            if (!forceRefresh && currentMetaRowsFallbackInFlight) {
                return await currentMetaRowsFallbackInFlight;
            }

            const loadPromise = (async () => {
                const primary = await loadCSV('current_meta_card_data.csv', options);
                if (Array.isArray(primary) && primary.length > 0) {
                    window.currentMetaUsingFallback = false;
                    if (!forceRefresh) currentMetaRowsFallbackCache = primary;
                    return primary;
                }

                const fallback = await loadCSV('tournament_cards_data_cards.csv', options);
                if (Array.isArray(fallback) && fallback.length > 0) {
                    const normalizedFallback = normalizeCurrentMetaFallbackRows(fallback);
                    console.warn(`[Current Meta] Using tournament fallback dataset (${normalizedFallback.length} rows) because current_meta_card_data.csv is missing or empty.`);
                    window.currentMetaUsingFallback = true;
                    if (!forceRefresh) currentMetaRowsFallbackCache = normalizedFallback;
                    return normalizedFallback;
                }

                window.currentMetaUsingFallback = false;
                if (!forceRefresh) currentMetaRowsFallbackCache = [];
                return [];
            })();

            if (!forceRefresh) currentMetaRowsFallbackInFlight = loadPromise;

            try {
                return await loadPromise;
            } finally {
                if (!forceRefresh) currentMetaRowsFallbackInFlight = null;
            }
        }

        const csvMemoryCache = new Map();
        const csvInFlight = new Map();

        /**
         * Load chunked tournament CSV via manifest.
         * Returns merged array from all per-meta chunk files.
         */
        async function _loadTournamentCardsChunked(options) {
            const forceRefresh = Boolean(options && options.forceRefresh);
            const latestOnly = Boolean(options && options.latestChunkOnly);
            const cacheBust = forceRefresh ? `?t=${Date.now()}` : '';

            try {
                const manifestResp = await fetch(`${BASE_PATH}tournament_cards_manifest.json${cacheBust}`);
                if (!manifestResp.ok) return null; // no manifest → fall back to monolith

                const manifest = await manifestResp.json();
                if (!manifest || !Array.isArray(manifest.chunks) || manifest.chunks.length === 0) return null;

                let chunksToLoad = manifest.chunks;
                if (latestOnly && chunksToLoad.length > 0) {
                    // W3 Phase 1 — format-aware chunk selection.
                    //
                    // "Latest" used to mean "chunk with the highest max_date"
                    // but that's wrong across a format rotation: when the
                    // English set rotates (e.g. POR → CRI on 2026-05-22),
                    // the highest-date chunk (TEF-POR with Utrecht/Campinas
                    // 16.05) still belongs to the rotated-OUT format and
                    // its card lists no longer represent the current meta.
                    //
                    // Prefer format_window.current_set when available:
                    // match chunks whose meta-key ends with that set code
                    // (e.g. "TEF-CRI" matches current_set "CRI"). If no
                    // chunk matches, return EMPTY rather than fall back to
                    // the date-based selection — "no current-format Major
                    // data" is the correct answer pre-rotation-data.
                    let currentSet = '';
                    try {
                        const fwResp = await fetch(`${BASE_PATH}format_window.json${cacheBust}`);
                        if (fwResp.ok) {
                            const fw = await fwResp.json();
                            currentSet = String((fw && fw.current_set) || '').trim().toUpperCase();
                        }
                    } catch (_e) { /* optional — fall back to date selection */ }

                    if (currentSet) {
                        // Match chunks like "TEF-CRI", "POR-CRI", or bare "CRI".
                        const setSuffix = `-${currentSet}`;
                        const matchedChunks = chunksToLoad.filter(c => {
                            const m = (c || '').toUpperCase();
                            return m.endsWith(`${setSuffix}.CSV`) || m.endsWith(`${currentSet}.CSV`);
                        });
                        if (matchedChunks.length === 0) {
                            devLog(`[Tournament CSV] No chunks match current_set=${currentSet} — returning empty (format has no Major data yet)`);
                            return [];
                        }
                        // If multiple chunks match (e.g. archived + current),
                        // pick the date-latest of them.
                        const dates = manifest.chunk_dates || {};
                        const matchedWithDates = matchedChunks
                            .map(c => ({ chunk: c, max: dates[c] && dates[c].max_date }))
                            .filter(x => x.max);
                        if (matchedWithDates.length > 0) {
                            matchedWithDates.sort((a, b) => b.max.localeCompare(a.max));
                            chunksToLoad = [matchedWithDates[0].chunk];
                        } else {
                            chunksToLoad = [matchedChunks[matchedChunks.length - 1]];
                        }
                        devLog(`[Tournament CSV] Loading current-format chunk: ${chunksToLoad[0]} (current_set=${currentSet})`);
                    } else {
                        // No format_window — fall back to date-based selection
                        // (legacy behavior for repos without the rotation
                        // metadata).
                        const dates = manifest.chunk_dates || {};
                        const withDates = chunksToLoad
                            .map(c => ({ chunk: c, max: dates[c] && dates[c].max_date }))
                            .filter(x => x.max);
                        if (withDates.length > 0) {
                            withDates.sort((a, b) => b.max.localeCompare(a.max));
                            chunksToLoad = [withDates[0].chunk];
                            devLog(`[Tournament CSV] Loading latest chunk by date (no format_window): ${chunksToLoad[0]} (max_date=${withDates[0].max})`);
                        } else {
                            chunksToLoad = [chunksToLoad[chunksToLoad.length - 1]];
                            devLog(`[Tournament CSV] Loading latest chunk (no chunk_dates in manifest): ${chunksToLoad[0]}`);
                        }
                    }
                } else {
                    devLog(`[Tournament CSV] Loading ${chunksToLoad.length} chunks (${manifest.total_rows} rows)`);
                }

                // Load chunks in parallel
                const chunkPromises = chunksToLoad.map(chunkFile =>
                    fetchAndParseCSV(`${BASE_PATH}${chunkFile}${cacheBust}`, ';').catch(e => {
                        console.warn(`[Tournament CSV] Failed to load chunk ${chunkFile}:`, e);
                        return [];
                    })
                );

                const chunkResults = await Promise.all(chunkPromises);
                const merged = chunkResults.flat();
                devLog(`[Tournament CSV] Merged ${merged.length} rows from ${manifest.chunks.length} chunks`);
                return merged;
            } catch (e) {
                console.warn('[Tournament CSV] Manifest load failed, falling back to monolith:', e);
                return null;
            }
        }

        async function loadCSV(filename, options = {}) {
            try {
                const forceRefresh = Boolean(options && options.forceRefresh);
                const baseCacheKey = String(filename || '').toLowerCase();
                const latestOnly = Boolean(options && options.latestChunkOnly);
                const cacheKey = latestOnly ? baseCacheKey + ':latest' : baseCacheKey;

                if (!forceRefresh && csvMemoryCache.has(cacheKey)) {
                    return csvMemoryCache.get(cacheKey);
                }

                if (!forceRefresh && csvInFlight.has(cacheKey)) {
                    return await csvInFlight.get(cacheKey);
                }

                // Tournament cards: prefer chunked loading via manifest
                const isTournamentCards = baseCacheKey === 'tournament_cards_data_cards.csv';

                const loadPromise = (async () => {
                    let parsed = null;

                    if (isTournamentCards) {
                        parsed = await _loadTournamentCardsChunked(options);
                    }

                    // Fallback to monolith file (or non-tournament files)
                    if (!parsed) {
                        const requestUrl = forceRefresh
                            ? `${BASE_PATH}${filename}?t=${Date.now()}`
                            : `${BASE_PATH}${filename}`;
                        const delimiter = filename.endsWith('.csv') && filename.includes('mapping') ? ',' : ';';
                        parsed = await fetchAndParseCSV(requestUrl, delimiter);
                    }

                    const fileLower = String(filename || '').toLowerCase();
                    if (fileLower.includes('current_meta')) {
                        healCurrentMetaCardRows(parsed);
                    }
                    if (!forceRefresh) {
                        csvMemoryCache.set(cacheKey, parsed);
                    }
                    return parsed;
                })().catch(e => {
                    const statusCode = e && (e.status || e.statusCode);
                    const fileLower = String(filename || '').toLowerCase();
                    const isCurrentMeta = fileLower.includes('current_meta');
                    const is404 = statusCode === 404 || /404/.test(String(e && (e.message || e) || ''));

                    if (isCurrentMeta && is404) {
                        if (!window._currentMetaMissingWarned) {
                            console.warn(`[Current Meta] ${filename} not found (404). Falling back to tournament_cards_data_cards.csv.`);
                            window._currentMetaMissingWarned = true;
                        }
                    } else {
                        console.error(`PapaParse error loading ${filename}:`, e);
                    }
                    return null;
                });

                if (!forceRefresh) {
                    csvInFlight.set(cacheKey, loadPromise);
                }

                const result = await loadPromise;
                if (!forceRefresh) {
                    csvInFlight.delete(cacheKey);
                }
                return result;
            } catch (e) {
                console.error(`Error loading ${filename}:`, e);
                const cacheKey = String(filename || '').toLowerCase();
                csvInFlight.delete(cacheKey);
                return null;
            }
        }
        

        // Async CSV fetch and parse using PapaParse with Web Worker
        async function fetchAndParseCSV(url, delimiter = ';') {
            // Hard timeout so a stalled download (flaky mobile network, a
            // request that never gets a response) can't leave the promise
            // unsettled forever — that would hang every caller awaiting it
            // (e.g. the Meta Binder's "Loading meta data…" spinner). On
            // timeout we reject; loadCSV's .catch turns that into null and
            // the UI shows a real "no data" state instead of spinning.
            const TIMEOUT_MS = 25000;
            return new Promise((resolve, reject) => {
                let settled = false;
                let parser = null;
                const finish = (fn, arg) => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    fn(arg);
                };
                const timer = setTimeout(() => {
                    try { if (parser && typeof parser.abort === 'function') parser.abort(); } catch (_) {}
                    finish(reject, new Error('CSV load timed out after ' + TIMEOUT_MS + 'ms: ' + url));
                }, TIMEOUT_MS);
                Papa.parse(url, {
                    download: true,
                    header: true,
                    delimiter: delimiter,
                    worker: false,
                    skipEmptyLines: true,
                    complete: function(results) {
                        // Optionally fix encoding for card_name/full_card_name
                        if (Array.isArray(results.data)) {
                            results.data.forEach(row => {
                                if (row.card_name && typeof window.fixCardNameEncoding === 'function') {
                                    row.card_name = window.fixCardNameEncoding(row.card_name);
                                }
                                if (row.full_card_name && typeof window.fixCardNameEncoding === 'function') {
                                    row.full_card_name = window.fixCardNameEncoding(row.full_card_name);
                                }
                            });
                        }
                        finish(resolve, results.data);
                    },
                    error: function(err) {
                        finish(reject, err);
                    }
                });
            });
        }
        
        // Load all cards database for deck builder
        let allCardsDatabase = [];
        let cardIndexMap = new Map(); // O(1) name → card lookup (first entry per name)
        let cardIndexBySetNumber = new Map(); // O(1) set+number -> canonical card lookup
        let cardsByNameMap = {};
        let cardsBySetNumberMap = {}; // Index for fast card lookup by set+number
        let myDeckRenderDbCache = null;
        let overviewPriceLookupCache = null;
        let internationalPrintsCache = new Map();
        let preferredVersionCache = new Map();
        let setOrderMap = {}; // Loaded from sets.json – higher number = newer set
        let pokedexNumbers = {}; // name (lowercase) → National Pokédex number
        let englishSetCodes = null;
        let rarityPreferences = {};
        let globalRarityPreference = 'min'; // Default: Show lowest rarity from newest set
        let overviewRarityMode = 'min'; // Current rarity mode for overview section (min, max, or all)
        let overviewCardTypeFilter = 'all'; // Current card type filter for overview section (all, Pokemon, Supporter, Item, Tool, Stadium, Energy, Special Energy, Ace Spec)
        let currentMetaOverviewCardTypeFilter = 'all'; // Card type filter for Current Meta overview
        let pastMetaOverviewCardTypeFilter = 'all'; // Card type filter for Past Meta overview
        // Generation counters to cancel stale batch renders (prevents duplicate cards from rAF race)
        let _cityLeagueRenderGen = 0;
        let _currentMetaRenderGen = 0;
        let _pastMetaRenderGen = 0;
        window.pendingCityLeagueDeckSelection = null; // Preserves cross-tab deck selection during async reloads
        const versionSelectionDebugEnabled = () => window.location.search.includes('debugVersionSelection=1');

        function debugVersionSelectionLog(...args) {
            if (versionSelectionDebugEnabled()) {
                console.log(...args);
            }
        }

        function invalidateCardLookupCaches() {
            myDeckRenderDbCache = null;
            overviewPriceLookupCache = null;
            internationalPrintsCache.clear();
            preferredVersionCache.clear();
        }
        
        // Ace Specs list - loaded from ace_specs.json
        let aceSpecsList = [];
        
        // Central isAceSpec function - checks against ace_specs.json list ONLY
        function isAceSpec(cardNameOrCard) {
            const cardName = (typeof cardNameOrCard === 'string') ? cardNameOrCard : (cardNameOrCard.card_name || cardNameOrCard.full_card_name || cardNameOrCard.name || '');
            const normalized = cardName.toLowerCase().trim();
            return aceSpecsList.includes(normalized);
        }
        async function loadPokedexNumbers() {
            try {
                const ts = new Date().getTime();
                const resp = await fetch(`./data/pokemon_dex_numbers.json?t=${ts}`);
                if (resp.ok) {
                    pokedexNumbers = await resp.json();
                    window.pokedexNumbers = pokedexNumbers;
                    devLog(`Loaded ${Object.keys(pokedexNumbers).length} Pokédex entries`);
                }
            } catch (e) {
                console.warn('Could not load pokemon_dex_numbers.json', e);
            }
        }

        async function loadSetOrderMap() {
            try {
                const resp = await fetch(`./data/sets.json?t=${Date.now()}`);
                if (resp.ok) {
                    const json = await resp.json();
                    if (json && typeof json === 'object') {
                        setOrderMap = json;
                        window.setOrderMap = json;
                    }
                }
            } catch (e) {
                console.warn('[init] Could not load sets.json for set ordering:', e);
            }
        }

        async function loadAllCardsDatabase(options) {
            try {
                // --- Strategy: Chunked loading with IndexedDB cache ---
                // 1. Try manifest-based chunked loading (Standard chunk first, rest lazy)
                // 2. Fallback to monolith all_cards_merged.json if chunks unavailable
                const cache = window.cardDataCache;
                const manifestUrl = './data/cards_manifest.json';
                const force = !!(options && options.force);

                if (cache) {
                    const freshness = await cache.checkFreshness(manifestUrl, { force: force });

                    if (freshness.fresh && freshness.cachedManifest) {
                        // --- Fast path: load from IndexedDB ---
                        devLog('[CardDB] Using IndexedDB cache (version ' + freshness.cachedManifest.version + ')');
                        const manifest = freshness.cachedManifest;
                        let allCards = [];
                        let allCached = true;
                        for (const chunk of manifest.chunks) {
                            const cached = await cache.getCachedChunk(chunk.file);
                            if (cached && cached.length > 0) {
                                allCards = allCards.concat(cached);
                            } else {
                                allCached = false;
                                break;
                            }
                        }
                        if (allCached && allCards.length > 0) {
                            _applyCardDatabase(allCards);
                            devLog('[CardDB] Loaded ' + allCards.length + ' cards from IndexedDB cache');
                            // Cache hit = ALL chunks restored in one shot, so flip the
                            // full-loaded flag immediately (no background load follows).
                            window.cardDBFullyLoaded = true;
                            _notifyCardDBReady();
                            return;
                        }
                        // Some chunks missing from cache — fall through to network
                    }

                    // --- Network path: fetch manifest, load chunks ---
                    try {
                        const serverManifest = freshness.serverManifest || await _fetchManifest(manifestUrl);
                        if (serverManifest && serverManifest.chunks && serverManifest.chunks.length > 0) {
                            devLog('[CardDB] Loading ' + serverManifest.chunks.length + ' chunks from network...');

                            // Load Standard chunk first for fast initial display
                            const standardChunk = serverManifest.chunks.find(c => c.era === 'standard');
                            const otherChunks = serverManifest.chunks.filter(c => c.era !== 'standard');

                            if (standardChunk) {
                                const standardCards = await cache.fetchAndCacheChunk('./data/', standardChunk.file);
                                _applyCardDatabase(standardCards);
                                devLog('[CardDB] Standard chunk loaded: ' + standardCards.length + ' cards (fast display ready)');
                                _notifyCardDBReady();

                                // Load remaining chunks in background
                                _loadRemainingChunks(cache, otherChunks, standardCards, serverManifest);
                                return;
                            }

                            // No standard chunk — load all sequentially
                            let allCards = [];
                            for (const chunk of serverManifest.chunks) {
                                const cards = await cache.fetchAndCacheChunk('./data/', chunk.file);
                                allCards = allCards.concat(cards);
                            }
                            cache.setCachedManifest({ ...serverManifest, timestamp: Date.now() });
                            _applyCardDatabase(allCards);
                            // Sequential-load path resolves all chunks in one go.
                            window.cardDBFullyLoaded = true;
                            _notifyCardDBReady();
                            return;
                        }
                    } catch (chunkErr) {
                        console.warn('[CardDB] Chunk loading failed, falling back to monolith:', chunkErr);
                    }
                }

                // --- Fallback: monolith all_cards_merged.json ---
                await _loadMonolithCardDatabase();
            } catch (error) {
                console.error('Error loading all cards database:', error);
            }
        }

        async function _fetchManifest(url) {
            const resp = await fetch(url + '?t=' + Date.now());
            if (!resp.ok) return null;
            return resp.json();
        }

        async function _loadRemainingChunks(cache, otherChunks, initialCards, manifest) {
            // Non-blocking: load SWSH + Legacy in background after initial render
            try {
                let allCards = initialCards.slice();
                for (const chunk of otherChunks) {
                    const cards = await cache.fetchAndCacheChunk('./data/', chunk.file);
                    allCards = allCards.concat(cards);
                    devLog('[CardDB] Background chunk "' + chunk.era + '" loaded: +' + cards.length + ' cards (total: ' + allCards.length + ')');
                }
                // Rebuild indices with full dataset
                _applyCardDatabase(allCards);
                cache.setCachedManifest({ ...manifest, timestamp: Date.now() });
                devLog('[CardDB] All chunks loaded: ' + allCards.length + ' cards total');

                // Tell consumers the full DB is now resolvable. Used by
                // firebase-collection's My Decks renderer to decide whether
                // a "card not found" lookup is worth a console warning —
                // before this flag flips, lookups for cards in extended /
                // legacy chunks are expected to miss and fall back to "any
                // print", and the warning would be a false positive that
                // fixes itself on the next re-render.
                window.cardDBFullyLoaded = true;

                // Re-notify so Cards DB tab can refresh with full data
                _notifyCardDBReady();
            } catch (e) {
                console.warn('[CardDB] Background chunk loading error:', e);
            }
        }

        async function _loadMonolithCardDatabase() {
            const timestamp = new Date().getTime();
            const response = await fetch(`./data/all_cards_merged.json?t=${timestamp}`);
            if (response.ok) {
                const jsonData = await response.json();
                const cards = (jsonData.cards || jsonData);
                _applyCardDatabase(cards);

                // Cache the monolith in IndexedDB for next visit
                const cache = window.cardDataCache;
                if (cache) {
                    cache.setCachedChunk('all_cards_merged.json', cards);
                    cache.setCachedManifest({
                        version: 'monolith-' + timestamp,
                        chunks: [{ file: 'all_cards_merged.json', era: 'all', count: cards.length }],
                        timestamp: Date.now()
                    });
                }
                // Monolith = single file with EVERY card → DB fully resolvable.
                window.cardDBFullyLoaded = true;
                _notifyCardDBReady();
                devLog('[CardDB] Loaded ' + cards.length + ' cards from monolith (fallback)');
            } else {
                console.error('Failed to load all_cards_merged.json');
            }
        }

        function _applyCardDatabase(cards) {
            allCardsDatabase = cards.map(c => {
                if (!c.name && c.name_en) c.name = c.name_en;
                return c;
            });
            window.allCardsDatabase = allCardsDatabase;
            cardIndexBySetNumber = buildCardIndexBySetNumber(allCardsDatabase);
            window.cardIndexBySetNumber = cardIndexBySetNumber;
            cardsByNameMap = buildCardsByNameMap(allCardsDatabase);
            window.cardsByNameMap = cardsByNameMap;
            cardsBySetNumberMap = buildCardsBySetNumberMap(allCardsDatabase);
            window.cardsBySetNumberMap = cardsBySetNumberMap;
            // Build O(1) name index (exact + normalized keys)
            cardIndexMap = new Map();
            allCardsDatabase.forEach(c => {
                const primaryName = String(c.name_en || c.name || '').trim();
                if (!primaryName) return;
                const exactKey = fixMojibake(primaryName);
                const normalizedKey = normalizeCardName(primaryName);
                if (!cardIndexMap.has(exactKey)) cardIndexMap.set(exactKey, c);
                if (normalizedKey && !cardIndexMap.has(normalizedKey)) cardIndexMap.set(normalizedKey, c);
            });
            invalidateCardLookupCaches();
            window.cardIndexMap = cardIndexMap;
        }

        function _notifyCardDBReady() {
            devLog('Cards DB ready: ' + allCardsDatabase.length + ' cards');

            // Count cards with prices
            const cardsWithPrices = allCardsDatabase.filter(c => c.eur_price).length;
            devLog('Cards with prices: ' + cardsWithPrices + ' (' + Math.round(100 * cardsWithPrices / allCardsDatabase.length) + '%)');

            // Re-trigger any pending searches
            const searchInput = document.getElementById('cityLeagueDeckCardSearch');
            if (searchInput && searchInput.value.trim()) searchDeckCards('cityLeague');
            const currentMetaSearchInput = document.getElementById('currentMetaDeckCardSearch');
            if (currentMetaSearchInput && currentMetaSearchInput.value.trim()) searchDeckCards('currentMeta');
            const pastMetaSearchInput = document.getElementById('pastMetaDeckCardSearch');
            if (pastMetaSearchInput && pastMetaSearchInput.value.trim()) searchDeckCards('pastMeta');

            // Refresh dependent UIs
            if (window.userDecks && window.userDecks.length > 0 && typeof updateDecksUI === 'function') updateDecksUI();
            if (typeof updateCollectionUI === 'function') updateCollectionUI();
            if (typeof updateWishlistUI === 'function') updateWishlistUI();
            if (typeof updateTradelistUI === 'function') updateTradelistUI();
            if (window.userProfile && typeof updateProfileUI === 'function') updateProfileUI(window.userProfile);
        }

        // Expose so the visibility-change handler below + any external
        // refresh path can re-trigger a card-DB load with force=true.
        window.loadAllCardsDatabase = loadAllCardsDatabase;

        // PWA-on-homescreen refresh: when the user brings the app back
        // to the foreground (Android task switch, iOS Home + reopen,
        // browser tab returning to focus), kick a forced freshness check
        // so the price + chunk caches don't sit stale for hours. Without
        // this, a PWA opened in the morning would keep showing the prior
        // night's prices even after the daily 08:00 UTC refresh — exactly
        // the symptom the user reported (Chrome browser had fresh prices,
        // installed PWA still showed N/A on the same wishlist).
        //
        // Throttled to once per 60 s so rapid tab toggling doesn't fire
        // a flurry of manifest fetches. The fetch itself is ~1 KB so the
        // throttle is mostly for politeness, not bandwidth.
        var _lastVisRefresh = 0;
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState !== 'visible') return;
            var now = Date.now();
            if (now - _lastVisRefresh < 60 * 1000) return;
            _lastVisRefresh = now;
            loadAllCardsDatabase({ force: true }).catch(function (err) {
                console.warn('[CardDB] Visibility refresh failed:', err && err.message);
            });
        });

        async function loadAceSpecsList() {
            try {
                const timestamp = new Date().getTime();
                const response = await fetch(`./data/ace_specs.json?t=${timestamp}`);
                if (response.ok) {
                    const jsonData = await response.json();
                    aceSpecsList = (jsonData.ace_specs || []).map(name => name.toLowerCase().trim());
                    devLog(`? Loaded ${aceSpecsList.length} Ace Spec cards from ace_specs.json`);
                } else {
                    console.error('Failed to load ace_specs.json');
                }
            } catch (error) {
                console.error('Error loading ace specs list:', error);
            }
        }

        async function loadSetMapping() {
            try {
                const timestamp = new Date().getTime();
                const response = await fetch(`./data/pokemon_sets_mapping.csv?t=${timestamp}`);
                if (!response.ok) return;
                const text = await response.text();
                const rows = await fetchAndParseCSV(`./data/pokemon_sets_mapping.csv?t=${timestamp}`, ',');
                englishSetCodes = new Set(rows.map(row => row.set_code).filter(Boolean));
                window.englishSetCodes = englishSetCodes;
            } catch (error) {
                console.error('Error loading pokemon_sets_mapping.csv:', error);
            }
        }

        function buildCardsByNameMap(cards) {
            const map = {};
            cards.forEach(card => {
                const primaryName = String(card.name_en || card.name || '').trim();
                if (!primaryName) return;

                const exactKey = fixMojibake(primaryName);
                const normalizedKey = normalizeCardName(primaryName);

                if (!map[exactKey]) map[exactKey] = [];
                map[exactKey].push(card);

                if (normalizedKey && normalizedKey !== exactKey) {
                    if (!map[normalizedKey]) map[normalizedKey] = [];
                    map[normalizedKey].push(card);
                }
            });
            return map;
        }

        function getCardByNameFromIndex(cardName) {
            const raw = String(cardName || '').trim();
            if (!raw || !(cardIndexMap instanceof Map)) return null;

            const repaired = fixMojibake(raw);
            const normalized = normalizeCardName(raw);

            return cardIndexMap.get(raw)
                || cardIndexMap.get(repaired)
                || cardIndexMap.get(normalized)
                || null;
        }

        function getMyDeckRenderDbCache() {
            if (myDeckRenderDbCache) {
                return myDeckRenderDbCache;
            }

            const cardDataByName = {};
            const cardDataByKey = {};

            allCardsDatabase.forEach(card => {
                const primaryName = String(card.name_en || card.name || '').trim();
                if (!primaryName) return;

                const imageUrl = getUnifiedCardImage(card.set, card.number) || card.image_url || '';
                const cardData = {
                    card_name: primaryName,
                    image_url: imageUrl,
                    percentage_in_archetype: 0,
                    type: card.type || 'Unknown',
                    card_type: card.type || 'Unknown',
                    set_code: card.set,
                    set_number: card.number,
                    rarity: card.rarity
                };

                if (!cardDataByName[primaryName]) {
                    cardDataByName[primaryName] = cardData;
                }

                cardDataByKey[`${primaryName} (${card.set} ${card.number})`] = cardData;
            });

            myDeckRenderDbCache = { cardDataByName, cardDataByKey };
            return myDeckRenderDbCache;
        }

        function getOverviewPriceLookupCache() {
            if (overviewPriceLookupCache instanceof Map) {
                return overviewPriceLookupCache;
            }

            const map = new Map();
            allCardsDatabase.forEach(card => {
                if (!card.set || !card.number) return;

                const normalizedSet = normalizeSetCode(card.set);
                const normalizedNumber = normalizeCardNumber(card.number);
                if (!normalizedSet || !normalizedNumber) return;

                map.set(`${normalizedSet}-${normalizedNumber}`, card);

                if (/^\d+$/.test(normalizedNumber)) {
                    map.set(`${normalizedSet}-${normalizedNumber.padStart(3, '0')}`, card);
                }
            });

            overviewPriceLookupCache = map;
            return overviewPriceLookupCache;
        }

        function buildCardIndexBySetNumber(cards) {
            const map = new Map();
            cards.forEach(card => {
                if (!card.set || !card.number) return;

                const normalizedSet = String(card.set).toUpperCase().trim();
                const rawNumber = String(card.number).trim();
                if (!normalizedSet || !rawNumber) return;

                map.set(`${normalizedSet}-${rawNumber}`, card);

                const normalizedNumber = rawNumber.replace(/^0+/, '') || '0';
                map.set(`${normalizedSet}-${normalizedNumber}`, card);
                map.set(`${normalizedSet}-${normalizedNumber.padStart(3, '0')}`, card);
            });
            devLog(`Built Map index for ${map.size} set+number combinations`);
            return map;
        }
        
        function buildCardsBySetNumberMap(cards) {
            const map = {};
            cards.forEach(card => {
                if (!card.set || !card.number) return;
                const normalizedSet = String(card.set).toUpperCase().trim();
                const rawNumber = String(card.number).trim();
                const key = `${normalizedSet}-${rawNumber}`;
                map[key] = card;

                const normalizedNumber = rawNumber.replace(/^0+/, '') || '0';
                const normalizedKey = `${normalizedSet}-${normalizedNumber}`;
                map[normalizedKey] = card;

                const paddedKey = `${normalizedSet}-${normalizedNumber.padStart(3, '0')}`;
                map[paddedKey] = card;
            });
            devLog(`? Built index for ${Object.keys(map).length} set+number combinations`);
            return map;
        }

        /**
         * Universal Omni-Search helper.
         * Filters an array of card objects by a search term, checking:
         *   - English name (name_en or name)
         *   - German name (name_de)
         *   - Set + number with space ("SFA 12") or without ("SFA12")
         *   - Pokédex number (exact match for 1-2 digit terms, partial for 3+)
         */
        function filterCardsArray(allCardsArray, searchInputText) {
            const safeCards = Array.isArray(allCardsArray) ? allCardsArray : [];
            const term = (searchInputText || '').toLowerCase().trim();
            if (!term) return safeCards;
            return safeCards.filter(card => {
                if (!card || typeof card !== 'object') return false;
                const nameEn = (card.name_en || card.name || '').toLowerCase();
                const nameDe = (card.name_de || '').toLowerCase();
                const setCode = (card.set || '').toLowerCase();
                const cardNumber = (card.number || '').toLowerCase();
                const dexNum = (card.pokedex_number || '').toString();
                const setNumSpace = `${setCode} ${cardNumber}`;
                const setNumCombined = `${setCode}${cardNumber}`;
                return nameEn.includes(term) ||
                       nameDe.includes(term) ||
                       setNumSpace.includes(term) ||
                       setNumCombined.includes(term) ||
                       (dexNum !== '' && dexNum === term) ||
                       (term.length >= 3 && dexNum !== '' && dexNum.includes(term));
            });
        }

        function getCardVersionsByName(cardName) {
            const exact = String(cardName || '').trim();
            const repaired = fixMojibake(exact);
            const normalized = normalizeCardName(exact);

            const merged = [
                ...(cardsByNameMap[exact] || []),
                ...(cardsByNameMap[repaired] || []),
                ...(cardsByNameMap[normalized] || [])
            ];

            const seen = new Set();
            return merged.filter(card => {
                const key = `${card.set || ''}-${card.number || ''}-${card.name_en || card.name || ''}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        }

        function getEnglishCardVersions(cardName) {
            const versions = getCardVersionsByName(cardName);
            if (!englishSetCodes || englishSetCodes.size === 0) {
                return versions.filter(v => v.image_url && v.image_url.trim() !== '');
            }
            return versions.filter(version => 
                englishSetCodes.has(version.set) && 
                version.image_url && 
                version.image_url.trim() !== ''
            );
        }

        function loadRarityPreferences() {
            try {
                const raw = localStorage.getItem('rarityPreferences');
                rarityPreferences = raw ? JSON.parse(raw) : {};
            } catch (error) {
                rarityPreferences = {};
            }
            window.rarityPreferences = rarityPreferences;
            loadGlobalRarityPreference();
        }

        function saveRarityPreferences() {
            localStorage.setItem('rarityPreferences', JSON.stringify(rarityPreferences));
        }

        function loadGlobalRarityPreference() {
            globalRarityPreference = 'min'; // Default: Lowest rarity from newest set
        }

        function getGlobalRarityPreference() {
            return globalRarityPreference || 'min'; // Default to 'min' if not set
        }

        function setRarityPreference(cardName, pref) {
            if (!cardName) return;
            rarityPreferences[cardName] = pref;
            saveRarityPreferences();
        }

        function getRarityPreference(cardName) {
            return rarityPreferences[cardName] || null;
        }

        function clearRarityPreference(cardName) {
            if (!cardName || !rarityPreferences[cardName]) return;
            delete rarityPreferences[cardName];
            saveRarityPreferences();
        }

        // ==================== UNIVERSAL PTCG CARD SORTING ====================
        
        /**
         * Universal Pokémon TCG card sorting function
         * Sorts cards in the official deck construction order:
         * 1. Pokémon (by type, then Pokédex number, then set/number)
         * 2. Supporter
         * 3. Item
         * 4. Pokémon Tool
         * 5. Stadium
         * 6. Special Energy
         * 7. Basic Energy
         * 
         * Within each category:
         * - Pokémon: Sort by pokedex_number (keeps evolution lines together!), then set, then number
         * - Trainer/Energy: Sort by name, then set, then number
         * 
         * @param {Array} cardsArray - Array of card objects to sort
         * @returns {Array} - Sorted array (mutates original)
         */
        function sortCardsPTCG(cardsArray) {
            const categoryOrder = {
                "Pokémon": 1,
                "Supporter": 2,
                "Item": 3,
                "Pokémon Tool": 4,
                "Stadium": 5,
                "Special Energy": 6,
                "Basic Energy": 7
            };

            return cardsArray.sort((a, b) => {
                // 1. Supertype/Category comparison
                // Map card type to our categories
                let catA = 8; 
                let catB = 8;
                
                if (a.type) {
                    const typeA = a.type.toLowerCase();
                    if (typeA.includes("tool")) catA = 4;
                    else if (typeA.includes("pokémon") || typeA.includes("pokemon")) catA = 1;
                    else if (typeA.includes("supporter")) catA = 2;
                    else if (typeA.includes("item")) catA = 3;
                    else if (typeA.includes("stadium")) catA = 5;
                    else if (typeA.includes("special energy")) catA = 6;
                    else if (typeA.includes("basic energy")) catA = 7;
                }
                
                if (b.type) {
                    const typeB = b.type.toLowerCase();
                    if (typeB.includes("tool")) catB = 4;
                    else if (typeB.includes("pokémon") || typeB.includes("pokemon")) catB = 1;
                    else if (typeB.includes("supporter")) catB = 2;
                    else if (typeB.includes("item")) catB = 3;
                    else if (typeB.includes("stadium")) catB = 5;
                    else if (typeB.includes("special energy")) catB = 6;
                    else if (typeB.includes("basic energy")) catB = 7;
                }

                if (catA !== catB) return catA - catB;

                // 2. If both are Pokémon
                if (catA === 1) {
                    // Sort by Pokédex number (keeps evolution lines together!)
                    const dexA = a.pokedex_number ? parseInt(a.pokedex_number) : 9999;
                    const dexB = b.pokedex_number ? parseInt(b.pokedex_number) : 9999;
                    if (dexA !== dexB) return dexA - dexB;
                } else {
                    // For Trainer & Energy: Sort by name
                    const nameA = (a.name_en || a.card_name || a.name || "").toLowerCase();
                    const nameB = (b.name_en || b.card_name || b.name || "").toLowerCase();
                    if (nameA !== nameB) return nameA.localeCompare(nameB);
                }

                // 3. Fallback for all: Set and number
                const setA = (a.set || a.set_code || "").toLowerCase();
                const setB = (b.set || b.set_code || "").toLowerCase();
                if (setA !== setB) return setA.localeCompare(setB);

                const numA = parseInt(String(a.number || a.set_number || "").replace(/\D/g, '')) || 0;
                const numB = parseInt(String(b.number || b.set_number || "").replace(/\D/g, '')) || 0;
                return numA - numB;
            });
        }
