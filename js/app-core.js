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
                    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
                });
                
                setTimeout(() => { input.focus(); if (opts.readonly) input.select(); }, 50);
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
                html: '<p>Browse and analyze individual deck lists from City League tournaments.</p><ul><li><strong>Archetype + Date Filters:</strong> Narrow data quickly</li><li><strong>Deck Builder:</strong> Add/remove cards and build a 60-card list</li><li><strong>Rarity Switcher (\u2605):</strong> Swap prints directly inside deck and overview cards</li><li><strong>Exact Print Swap:</strong> Switching print updates the real deck entry (set+number)</li><li><strong>Copy Deck:</strong> Export any deck list for Pok\u00e9mon TCG Live</li></ul>'
            },
            'current-meta': {
                title: '\ud83c\udfae Limitless Online Comparison',
                html: '<p>Compare archetype meta shares between different tournament sources.</p><ul><li><strong>Side-by-side comparison:</strong> Online vs tournament results</li><li><strong>Charts:</strong> Pie and bar visualizations</li><li><strong>Meta Share %:</strong> Fast popularity read</li><li><strong>Fallback Safety:</strong> If current_meta_card_data.csv is missing, the app auto-falls back to tournament_cards_data_cards.csv</li></ul>'
            },
            'current-analysis': {
                title: '\ud83d\udcc8 Current Meta Deck Analysis',
                html: '<p>Analyze deck lists from current Limitless Online tournaments.</p><ul><li><strong>Archetype Filter:</strong> Browse decks by archetype</li><li><strong>Card Distribution:</strong> See most-played cards and usage</li><li><strong>Deck Builder:</strong> Build and modify decks interactively</li><li><strong>Rarity Switcher (\u2605):</strong> Swap to another international print in one click</li><li><strong>Max Consistency:</strong> Generate an optimized 60-card list from stats</li></ul>'
            },
            'past-meta': {
                title: '\ud83c\udfc6 Past Tournament Deck Analysis',
                html: '<p>Historical tournament data from major events (Regionals, EUIC, Worlds, etc.).</p><ul><li><strong>Format Filter:</strong> Filter by format code (e.g., TEF-SCR, OBF-TWM)</li><li><strong>Source Filter:</strong> Choose tournaments/regions</li><li><strong>Full Deck Analysis:</strong> Includes builder, copy, compare and \u2605 print switch</li><li><strong>Historical Trends:</strong> Track deck evolution across formats</li></ul>'
            },
            'cards': {
                title: '\ud83e\uddf0 Card Database',
                html: '<p>Search and browse the complete Pok\u00e9mon TCG card database.</p><ul><li><strong>Search + Filters:</strong> Name, set, type, rarity, meta filters</li><li><strong>Sort:</strong> Sets sorted newest\u2192oldest</li><li><strong>Rarity Switcher (\u2605):</strong> See and choose available prints quickly</li><li><strong>Collection Count:</strong> Exact print counts are tracked via set+number</li><li><strong>Wishlist:</strong> Mark target cards with \u2764</li></ul>'
            },
            'proxy': {
                title: '\ud83d\udda8\ufe0f Proxy Printer',
                html: '<p>Create printable proxy cards for testing and casual play.</p><ul><li><strong>Import Deck:</strong> Paste a deck list and auto-generate proxies</li><li><strong>Manual Add:</strong> Search and add individual cards</li><li><strong>Print Layout:</strong> Optimized for standard 6.3cm \u00d7 8.8cm card size (fits sleeves)</li><li><strong>Adjust Quantities:</strong> Set exact copies for each card</li><li><strong>@media print:</strong> Browser print produces A4 pages with correct card dimensions</li></ul>'
            },
            'sandbox': {
                title: '\u2694\ufe0f Battle Sandbox',
                html: '<p>Simulate 2-player Pok\u00e9mon TCG matches with full game mechanics.</p><ul><li><strong>Import Decks:</strong> Paste deck lists for Player 1 and Player 2</li><li><strong>Draw Simulator:</strong> Test opening hands and prize cards</li><li><strong>Game Board:</strong> Full interactive play area with bench and active slots</li><li><strong>Load Saved Decks:</strong> Use decks from your profile</li><li><strong>Judge:</strong> Both players shuffle hand into deck, draw exactly 4 (TCG rule)</li><li><strong>Iono:</strong> Shuffle hand under deck, draw equal to remaining prizes</li><li><strong>Deck Search \ud83d\udd0d:</strong> Browse your deck mid-game with sort options</li></ul>'
            },
            'profile': {
                title: '\ud83d\udc64 User Profile',
                html: '<p>Manage your personal card collection, saved decks, and settings.</p><ul><li><strong>My Collection:</strong> Exact print counts (set+number) synced to Firebase</li><li><strong>Dex Import:</strong> CSV import supports set-name mapping and id-based number parsing</li><li><strong>My Decks:</strong> Per-card badges show exact owned count for that print</li><li><strong>\u2728 Indicator:</strong> Shows when other international prints of same card exist in your collection</li><li><strong>Rarity Switcher (\u2605):</strong> Swap print directly from saved deck cards</li><li><strong>Compare (\u2696\ufe0f):</strong> Choose source (paste Limitless/PTCGL or search saved decks)</li><li><strong>Compare Mode:</strong> Functional (prints merged) or Exact print</li><li><strong>Wishlist + Settings:</strong> Manage targets and account preferences</li></ul>'
            },
            'calculator': {
                title: '\ud83e\uddee Probability Calculator',
                html: '<p>Calculate draw, prize, and topdeck odds for your deck.</p><ul><li><strong>Draw Chance:</strong> Probability to see at least one copy in drawn cards</li><li><strong>Prize Chance:</strong> Probability that at least one copy is in your prizes</li><li><strong>Topdeck Chance:</strong> Probability your next draw is the target card</li><li><strong>Inputs:</strong> Copies in deck, cards drawn, and already-in-hand correction</li></ul>'
            },
            'tutorial': {
                title: '\ud83d\udcd6 How to Use',
                html: '<p>Comprehensive guide to all features of this website.</p><ul><li><strong>Tab Guides:</strong> Detailed instructions for every section</li><li><strong>Latest Changes:</strong> Includes exact-print collection badges, \u2728 other-print indicator, robust \u2605 print swapping, and upgraded deck compare</li><li><strong>Compare Notes:</strong> Paste parser live preview + Functional/Exact compare modes</li><li><strong>Import Notes:</strong> Dex CSV set-name + set-number matching behavior explained</li></ul>'
            }
        };

        const TAB_HELP_CONTENT_DE = {
            'city-league': {
                title: '\ud83c\uddef\ud83c\uddf5 City League Entwicklung',
                html: '<p>Zeigt Trends der Archetyp-Popularitaet aus japanischen City-League-Turnieren.</p><ul><li><strong>Diagramm:</strong> Verfolgt Deck-Archetypen ueber die Zeit</li><li><strong>Format-Filter:</strong> Wechsel zwischen M4 (aktuell) und M3 (Archiv)</li><li><strong>Legenden-Toggle:</strong> Archetypen ein- und ausblenden</li><li><strong>Deck-Builder-Sync:</strong> Archetyp oeffnen und direkt zur Deck-Analyse wechseln</li></ul>'
            },
            'city-league-analysis': {
                title: '\ud83e\udd85 City League Deck-Analyse',
                html: '<p>Durchsuche und analysiere einzelne Decklisten aus City-League-Turnieren.</p><ul><li><strong>Archetyp- und Datumsfilter:</strong> Daten schnell eingrenzen</li><li><strong>Deck Builder:</strong> Karten hinzufuegen/entfernen und 60-Karten-Deck bauen</li><li><strong>Seltenheits-Wechsler (\u2605):</strong> Prints direkt in Deck und Uebersicht wechseln</li><li><strong>Exakter Print-Tausch:</strong> Wechsel aktualisiert den Deck-Eintrag (Set+Nummer)</li><li><strong>Deck kopieren:</strong> Export im Pokemon-TCG-Live-Format</li></ul>'
            },
            'current-meta': {
                title: '\ud83c\udfae Limitless-Online-Vergleich',
                html: '<p>Vergleicht Meta-Anteile von Archetypen zwischen verschiedenen Turnierquellen.</p><ul><li><strong>Nebeneinander-Vergleich:</strong> Online vs. Turnierergebnisse</li><li><strong>Diagramme:</strong> Kreis- und Balkenansichten</li><li><strong>Meta-Share %:</strong> Schnellueberblick zur Popularitaet</li><li><strong>Fallback:</strong> Fehlt current_meta_card_data.csv, nutzt die App automatisch tournament_cards_data_cards.csv</li></ul>'
            },
            'current-analysis': {
                title: '\ud83d\udcc8 Aktuelle-Meta Deck-Analyse',
                html: '<p>Analysiere Decklisten aus aktuellen Limitless-Online-Turnieren.</p><ul><li><strong>Archetyp-Filter:</strong> Decks nach Archetyp durchsuchen</li><li><strong>Kartenverteilung:</strong> Meistgespielte Karten und Nutzung</li><li><strong>Deck Builder:</strong> Decks interaktiv bauen und anpassen</li><li><strong>Seltenheits-Wechsler (\u2605):</strong> Internationale Prints mit einem Klick wechseln</li><li><strong>Max Consistency:</strong> Optimiertes 60-Karten-Deck aus Statistiken erzeugen</li></ul>'
            },
            'past-meta': {
                title: '\ud83c\udfc6 Vergangenes Turnier-Meta',
                html: '<p>Historische Turnierdaten grosser Events (Regionals, EUIC, Worlds usw.).</p><ul><li><strong>Format-Filter:</strong> Nach Formatcode filtern (z. B. TEF-SCR, OBF-TWM)</li><li><strong>Quellen-Filter:</strong> Turniere/Regionen auswaehlen</li><li><strong>Volle Deck-Analyse:</strong> Inklusive Builder, Kopieren, Vergleichen und \u2605 Print-Wechsel</li><li><strong>Historische Trends:</strong> Deck-Entwicklung ueber Formate verfolgen</li></ul>'
            },
            'cards': {
                title: '\ud83e\uddf0 Kartendatenbank',
                html: '<p>Durchsuche die vollstaendige Pokemon-TCG-Kartendatenbank.</p><ul><li><strong>Suche + Filter:</strong> Name, Set, Typ, Seltenheit, Meta-Filter</li><li><strong>Sortierung:</strong> Sets von neu nach alt</li><li><strong>Seltenheits-Wechsler (\u2605):</strong> Verfuegbare Prints schnell auswaehlen</li><li><strong>Sammlungsanzahl:</strong> Exakte Print-Zaehlung per Set+Nummer</li><li><strong>Wunschliste:</strong> Zielkarten mit \u2764 markieren</li></ul>'
            },
            'proxy': {
                title: '\ud83d\udda8\ufe0f Proxy-Drucker',
                html: '<p>Erstelle druckbare Proxy-Karten fuer Tests und Casual Play.</p><ul><li><strong>Deck importieren:</strong> Deckliste einfuegen und Proxys automatisch erzeugen</li><li><strong>Manuell hinzufuegen:</strong> Einzelkarten suchen und hinzufuegen</li><li><strong>Drucklayout:</strong> Optimiert fuer 6.3cm x 8.8cm Kartenmass</li><li><strong>Mengen anpassen:</strong> Exakte Kopienzahl je Karte setzen</li><li><strong>@media print:</strong> Browserdruck erzeugt A4-Seiten mit korrekten Kartengroessen</li></ul>'
            },
            'sandbox': {
                title: '\u2694\ufe0f Battle Sandbox',
                html: '<p>Simuliere 2-Spieler-Pokemon-TCG-Matches mit vollstaendigen Spielmechaniken.</p><ul><li><strong>Decks importieren:</strong> Decklisten fuer Spieler 1 und 2 einfuegen</li><li><strong>Draw-Simulator:</strong> Starthaende und Preiskarten testen</li><li><strong>Spielbrett:</strong> Interaktives Feld mit Bank- und Aktiv-Slots</li><li><strong>Gespeicherte Decks laden:</strong> Decks aus deinem Profil nutzen</li><li><strong>Judge:</strong> Beide mischen Hand ins Deck und ziehen genau 4</li><li><strong>Iono:</strong> Hand unter Deck mischen, Anzahl nach Preiskarten ziehen</li><li><strong>Decksuche:</strong> Deck waehrend des Spiels mit Sortierung durchsuchen</li></ul>'
            },
            'profile': {
                title: '\ud83d\udc64 Benutzerprofil',
                html: '<p>Verwalte deine Sammlung, gespeicherte Decks und Einstellungen.</p><ul><li><strong>Meine Sammlung:</strong> Exakte Print-Anzahlen (Set+Nummer) mit Firebase-Sync</li><li><strong>Dex-Import:</strong> CSV-Import mit Setnamen-Mapping und nummernbasierter Erkennung</li><li><strong>Meine Decks:</strong> Badge pro Karte zeigt exakte Besitzanzahl fuer diesen Print</li><li><strong>\u2728 Indikator:</strong> Zeigt weitere internationale Prints derselben Karte in deiner Sammlung</li><li><strong>Seltenheits-Wechsler (\u2605):</strong> Prints direkt in gespeicherten Deckkarten wechseln</li><li><strong>Vergleich (\u2696\ufe0f):</strong> Quelle waehlen (Limitless/PTCGL oder gespeicherte Decks)</li><li><strong>Vergleichsmodus:</strong> Funktional (Prints zusammengefuehrt) oder exakter Print</li><li><strong>Wunschliste + Einstellungen:</strong> Ziele und Kontooptionen verwalten</li></ul>'
            },
            'calculator': {
                title: '\ud83e\uddee Wahrscheinlichkeitsrechner',
                html: '<p>Berechnet Zieh-, Preis- und Topdeck-Wahrscheinlichkeiten fuer dein Deck.</p><ul><li><strong>Zug-Chance:</strong> Wahrscheinlichkeit, mindestens eine Kopie in gezogenen Karten zu sehen</li><li><strong>Preiskarten-Chance:</strong> Wahrscheinlichkeit, dass mindestens eine Kopie in den Preisen liegt</li><li><strong>Topdeck-Chance:</strong> Wahrscheinlichkeit, dass der naechste Draw deine Zielkarte ist</li><li><strong>Eingaben:</strong> Kopien im Deck, gezogene Karten, bereits auf der Hand</li></ul>'
            },
            'tutorial': {
                title: '\ud83d\udcd6 Anleitung',
                html: '<p>Umfassender Guide zu allen Funktionen dieser Website.</p><ul><li><strong>Tab-Guides:</strong> Detaillierte Hinweise zu jedem Bereich</li><li><strong>Neueste Aenderungen:</strong> Exakte Print-Badges, \u2728 Indikator, stabiler \u2605 Print-Wechsel und erweiterter Deck-Vergleich</li><li><strong>Vergleichshinweise:</strong> Live-Parser-Vorschau + Funktional/Exakt-Modi</li><li><strong>Import-Hinweise:</strong> Dex-CSV Setnamen- und Setnummern-Matching erklaert</li></ul>'
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

        window.sortDeckCards = function(cardsArray) {
            return cardsArray.sort((a, b) => {
                // 1. Nach offiziellem Kartentyp sortieren
                const priorityA = window.getCardSortPriority(a);
                const priorityB = window.getCardSortPriority(b);

                if (priorityA !== priorityB) {
                    return priorityA - priorityB;
                }

                // 2. Innerhalb des gleichen Typs alphabetisch sortieren
                const nameA = a.name || '';
                const nameB = b.name || '';
                return nameA.localeCompare(nameB);
            });
        };

        // CRITICAL: Initialize deck objects immediately to prevent undefined errors
        window.cityLeagueDeck = window.cityLeagueDeck || {};
        window.cityLeagueDeckOrder = window.cityLeagueDeckOrder || [];
        window.currentMetaDeck = window.currentMetaDeck || {};
        window.currentMetaDeckOrder = window.currentMetaDeckOrder || [];
        window.pastMetaDeck = window.pastMetaDeck || {};
        window.pastMetaDeckOrder = window.pastMetaDeckOrder || [];
        window.currentCityLeagueArchetype = window.currentCityLeagueArchetype || null;
        window.currentCurrentMetaArchetype = window.currentCurrentMetaArchetype || null;
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

        const DEFERRED_PLAYTESTER_SCRIPTS = [
            'js/playtester.js?v=20260320-v68',
            'js/playtester-mobile.js?v=20260320-v2',
            'js/firebase-multiplayer.js?v=20260315-v1'
        ];
        let deferredPlaytesterScriptsPromise = null;

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
                        '⚠️ Loading took too long.<br>' +
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

        function loadDeferredScript(src) {
            return new Promise((resolve, reject) => {
                const existing = document.querySelector(`script[src="${src}"]`);
                if (existing) {
                    if (existing.dataset.loaded === 'true') {
                        resolve();
                        return;
                    }
                    existing.addEventListener('load', () => resolve(), { once: true });
                    existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
                    return;
                }

                const script = document.createElement('script');
                script.src = src;
                script.async = false;
                script.dataset.deferredPlaytester = 'true';
                script.addEventListener('load', () => {
                    script.dataset.loaded = 'true';
                    resolve();
                }, { once: true });
                script.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
                document.body.appendChild(script);
            });
        }

        async function ensurePlaytesterScriptsLoaded(options = {}) {
            const { notify = false } = options;

            if (window.__playtesterScriptsReady === true) {
                return;
            }

            if (!deferredPlaytesterScriptsPromise) {
                if (notify && typeof showNotification === 'function') {
                    showNotification(t('notify.playtesterLoading'), 'info', 1800);
                }

                deferredPlaytesterScriptsPromise = (async () => {
                    for (const src of DEFERRED_PLAYTESTER_SCRIPTS) {
                        await loadDeferredScript(src);
                    }
                    window.__playtesterScriptsReady = true;
                })().catch(error => {
                    deferredPlaytesterScriptsPromise = null;
                    throw error;
                });
            }

            return deferredPlaytesterScriptsPromise;
        }

        window.ensurePlaytesterScriptsLoaded = ensurePlaytesterScriptsLoaded;

        ['openPlaytester', 'openPlaytesterSetup', 'startPlaytesterWithMirror', 'startPlaytesterWithOpponent', 'startStandalonePlaytester', 'parseSandboxDeckToExactPrints', 'openMultiplayerFromSandbox'].forEach(functionName => {
            if (typeof window[functionName] === 'function') return;

            const deferredWrapper = async function(...args) {
                try {
                    await ensurePlaytesterScriptsLoaded({ notify: true });
                    if (typeof window[functionName] === 'function' && window[functionName] !== deferredWrapper) {
                        return window[functionName](...args);
                    }
                } catch (error) {
                    console.error(`[Playtester] Could not load ${functionName}:`, error);
                    if (typeof showNotification === 'function') {
                        showNotification(t('notify.playtesterError'), 'error');
                    }
                }
            };

            window[functionName] = deferredWrapper;
        });

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

            const pageHtml = pages.map((pageCards, pageIndex) => {
                const cardsHtml = pageCards.map(card => {
                    const imageUrl = getCardImageSource(card.name, card.set, card.number) || buildInlineCardPlaceholder(card.name);
                    const safeImage = window.escapeHtmlAttr(imageUrl);

                    return `
                        <div class="proxy-slot">
                            <span class="cut cut-top-left"></span>
                            <span class="cut cut-top-right"></span>
                            <span class="cut cut-bottom-left"></span>
                            <span class="cut cut-bottom-right"></span>
                            <div class="proxy-card">
                                <img loading="lazy" src="${safeImage}" alt="">
                            </div>
                        </div>
                    `;
                }).join('');

                return `
                    <section class="proxy-page">
                        <div class="proxy-grid">${cardsHtml}</div>
                        <footer>${t('proxy.pageFooter')} ${pageIndex + 1} / ${pages.length}</footer>
                    </section>
                `;
            }).join('');

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
                '.proxy-grid { display: grid; grid-template-columns: repeat(3, 60mm); grid-auto-rows: 85mm; gap: 3mm; justify-content: center; }',
                '.proxy-slot { position: relative; width: 60mm; height: 85mm; }',
                '.proxy-card { position: absolute; inset: 0; overflow: hidden; border: 0.2mm solid rgba(0,0,0,0.35); border-radius: 1.8mm; background: #fff; }',
                '.proxy-card img { width: 100%; height: 100%; object-fit: cover; display: block; }',
                '.cut { position: absolute; width: 4mm; height: 4mm; pointer-events: none; }',
                '.cut::before, .cut::after { content: \'\'; position: absolute; background: #000; }',
                '.cut::before { width: 4mm; height: 0.25mm; }',
                '.cut::after { width: 0.25mm; height: 4mm; }',
                '.cut-top-left { top: -1.6mm; left: -1.6mm; }',
                '.cut-top-left::before, .cut-top-left::after { top: 0; left: 0; }',
                '.cut-top-right { top: -1.6mm; right: -1.6mm; }',
                '.cut-top-right::before { top: 0; right: 0; }',
                '.cut-top-right::after { top: 0; right: 0; }',
                '.cut-bottom-left { bottom: -1.6mm; left: -1.6mm; }',
                '.cut-bottom-left::before { bottom: 0; left: 0; }',
                '.cut-bottom-left::after { bottom: 0; left: 0; }',
                '.cut-bottom-right { bottom: -1.6mm; right: -1.6mm; }',
                '.cut-bottom-right::before { bottom: 0; right: 0; }',
                '.cut-bottom-right::after { bottom: 0; right: 0; }',
                'footer { margin-top: 3mm; text-align: center; font-size: 7.5pt; color: #666; }',
                '@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }'
            ].join('\n');
            doc.head.appendChild(style);

            pages.forEach((pageCards, pageIndex) => {
                const section = doc.createElement('section');
                section.className = 'proxy-page';
                const grid = doc.createElement('div');
                grid.className = 'proxy-grid';

                pageCards.forEach(card => {
                    const slot = doc.createElement('div');
                    slot.className = 'proxy-slot';
                    ['cut-top-left','cut-top-right','cut-bottom-left','cut-bottom-right'].forEach(cls => {
                        const span = doc.createElement('span');
                        span.className = 'cut ' + cls;
                        slot.appendChild(span);
                    });
                    const cardDiv = doc.createElement('div');
                    cardDiv.className = 'proxy-card';
                    const img = doc.createElement('img');
                    img.src = getCardImageSource(card.name, card.set, card.number) || buildInlineCardPlaceholder(card.name);
                    img.alt = '';
                    cardDiv.appendChild(img);
                    slot.appendChild(cardDiv);
                    grid.appendChild(slot);
                });

                section.appendChild(grid);
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
            const newCards = comparisonCards.filter(card => card.changeType === 'new' && parseProxyCount(card.newCount, 0) > 0);

            if (newCards.length === 0) {
                showToast(t('proxy.noNewCards'), 'warning');
                return;
            }

            let addedCopies = 0;
            newCards.forEach(card => {
                const count = parseProxyCount(card.newCount, 1);
                addCardToProxy(card.name, card.set, card.number, count, true);
                addedCopies += count;
            });

            renderProxyQueue();
            showProxyToast(`${newCards.length} ${t('proxy.compCardsAdded')} (${addedCopies})`);

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
            
            // Set active button
            const activeBtn = Array.from(buttons).find(btn => 
                btn.getAttribute('onclick')?.includes(tabName)
            );
            if (activeBtn) {
                activeBtn.classList.add('active');
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
                            window.currentCurrentMetaArchetype = match.value;
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
                label: `🧩 ${displayName} (All Variants Combined)`
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
            devLog('🔍 Navigating to analysis with deck:', archetypeName);
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
                        devLog('✅ Deck selected:', matchingOption.value, combinedOption ? '(combined)' : '(exact)');
                    } else {
                        console.warn('⚠️ Deck not found in dropdown:', archetypeName);
                    }
                } else if (attempts < maxAttempts) {
                    // Retry after 100ms
                    setTimeout(checkAndSelect, 100);
                } else {
                    console.error('? Timeout: Dropdown not populated after 5 seconds');
                }
            };
            
            // Start checking after initial delay
            setTimeout(checkAndSelect, 100);
        }
        
        // Navigate to Current Meta Analysis tab and select a deck
        function navigateToCurrentMetaWithDeck(archetypeName) {
            devLog('🔍 Navigating to Current Meta with deck:', archetypeName);
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
                        devLog('✅ Deck selected:', matchingOption.value);
                    } else {
                        console.warn('⚠️ Deck not found in dropdown:', archetypeName);
                    }
                } else if (attempts < maxAttempts) {
                    // Retry after 100ms
                    setTimeout(checkAndSelect, 100);
                } else {
                    console.error('? Timeout: Dropdown not populated after 5 seconds');
                }
            };
            
            // Start checking after initial delay
            setTimeout(checkAndSelect, 100);
        }
        
        // CSV loading and parsing
        function parseCSV(text, delimiter) {
            const raw = String(text || '');
            if (!raw.trim()) return [];

            // Auto-detect delimiter when not provided to support legacy call sites.
            const firstLine = raw.split(/\r?\n/, 1)[0] || '';
            const inferredDelimiter = delimiter || ((firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',');

            const results = Papa.parse(raw, {
                header: true,
                delimiter: inferredDelimiter,
                skipEmptyLines: true,
                dynamicTyping: false
            });

            const rows = Array.isArray(results.data) ? results.data : [];
            rows.forEach(row => {
                if (!row || typeof row !== 'object') return;
                if (row.card_name && typeof window.fixCardNameEncoding === 'function') {
                    row.card_name = window.fixCardNameEncoding(row.card_name);
                }
                if (row.full_card_name && typeof window.fixCardNameEncoding === 'function') {
                    row.full_card_name = window.fixCardNameEncoding(row.full_card_name);
                }
            });

            return rows;
        }

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

        const KNOWN_META_FORMAT_CODES = [
            'TEF-POR', 'SVI-ASC', 'SVI-PFL', 'SVI-MEG', 'SVI-BLK', 'SVI-DRI', 'SVI-JTG',
            'BRS-PRE', 'BRS-SSP', 'BRS-SCR', 'BRS-SFA', 'BRS-TWM', 'BRS-TEF',
            'BST-PAR', 'SVI-PAF'
        ];

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
            'battle styles - paradox rift': 'BST-PAR',
            'meta play!': 'TEF-POR',
            'meta live': 'TEF-POR'
        };

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

            const sviOrder = setOrderMap.SVI || setOrderMap.SVE || 0;
            const tefOrder = setOrderMap.TEF || 0;
            const codeOrder = setOrderMap[code] || 0;
            if (tefOrder > 0 && codeOrder > 0 && codeOrder >= tefOrder) {
                return `TEF-${code}`;
            }
            if (sviOrder > 0 && codeOrder > 0 && codeOrder >= sviOrder) {
                return `SVI-${code}`;
            }

            return code;
        }

        function normalizeTournamentFormatLabel(rawFormat, fallbackSetCode = '') {
            const raw = String(rawFormat || '').trim();
            if (!raw) return mapSetCodeToMetaFormat(fallbackSetCode);
            // Map current-meta labels to the newest known format
            if (raw === 'Meta Live' || raw === 'Meta Play!') return KNOWN_META_FORMAT_CODES[0];
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
                    const totalCount = parseFloat(String(normalized.total_count).replace(',', '.')) || 0;
                    const totalDecks = parseFloat(String(normalized.total_decks_in_archetype).replace(',', '.')) || 0;
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

        async function loadCSV(filename, options = {}) {
            try {
                const forceRefresh = Boolean(options && options.forceRefresh);
                const cacheKey = String(filename || '').toLowerCase();

                if (!forceRefresh && csvMemoryCache.has(cacheKey)) {
                    return csvMemoryCache.get(cacheKey);
                }

                if (!forceRefresh && csvInFlight.has(cacheKey)) {
                    return await csvInFlight.get(cacheKey);
                }

                const requestUrl = forceRefresh
                    ? `${BASE_PATH}${filename}?t=${Date.now()}`
                    : `${BASE_PATH}${filename}`;

                const delimiter = filename.endsWith('.csv') && filename.includes('mapping') ? ',' : ';';

                const loadPromise = fetchAndParseCSV(requestUrl, delimiter).then(parsed => {
                    const fileLower = String(filename || '').toLowerCase();
                    if (fileLower.includes('current_meta')) {
                        healCurrentMetaCardRows(parsed);
                    }
                    if (!forceRefresh) {
                        csvMemoryCache.set(cacheKey, parsed);
                    }
                    return parsed;
                }).catch(e => {
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
            return new Promise((resolve, reject) => {
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
                        resolve(results.data);
                    },
                    error: function(err) {
                        reject(err);
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
                    devLog(`✅ Loaded ${Object.keys(pokedexNumbers).length} Pokédex entries`);
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

        async function loadAllCardsDatabase() {
            try {
                // --- Strategy: Chunked loading with IndexedDB cache ---
                // 1. Try manifest-based chunked loading (Standard chunk first, rest lazy)
                // 2. Fallback to monolith all_cards_merged.json if chunks unavailable
                const cache = window.cardDataCache;
                const manifestUrl = './data/cards_manifest.json';

                if (cache) {
                    const freshness = await cache.checkFreshness(manifestUrl);

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
            if (window.userProfile && typeof updateProfileUI === 'function') updateProfileUI(window.userProfile);
        }
        
        async function loadAceSpecsList() {
            try {
                const timestamp = new Date().getTime();
                const response = await fetch(`./data/ace_specs.json?t=${timestamp}`);
                if (response.ok) {
                    const jsonData = await response.json();
                    aceSpecsList = (jsonData.ace_specs || []).map(name => name.toLowerCase().trim());
                    devLog(`? Loaded ${aceSpecsList.length} Ace Spec cards from ace_specs.json`);
                } else {
                    console.error('? Failed to load ace_specs.json');
                }
            } catch (error) {
                console.error('Error loading ace specs list:', error);
            }
        }

        async function loadSetMapping() {
            try {
                const timestamp = new Date().getTime();
                const response = await fetch(`./pokemon_sets_mapping.csv?t=${timestamp}`);
                if (!response.ok) return;
                const text = await response.text();
                const rows = await fetchAndParseCSV(`./pokemon_sets_mapping.csv?t=${timestamp}`, ',');
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
            devLog(`📇 Built Map index for ${map.size} set+number combinations`);
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
